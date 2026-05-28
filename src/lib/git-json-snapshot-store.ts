import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { simpleGit, type SimpleGit } from 'simple-git';
import { pino, type Logger } from 'pino';

import type { ListOpts, SnapshotStore } from './snapshot-store.js';
import type { ReliasDiff, ReliasSnapshot, SnapshotMeta } from './types.js';

/**
 * The path conventions are part of the data contract — the snapshots repo can
 * be browsed on GitHub and indexed by humans, so consistent naming matters
 * more than a perfectly-encoded timestamp would. ISO8601 with colons swapped
 * for hyphens (filesystem-portable) and the trailing `Z` preserved.
 */
const SNAPSHOTS_DIR = 'snapshots';
const DIFFS_DIR = 'diffs';

const SNAPSHOT_FILE_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)\.json$/;
const DIFF_FILE_RE =
  /^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)-from-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)\.json$/;

const DEFAULT_BRANCH = 'main';
const DEFAULT_LIST_LIMIT = 50;

export interface GitJsonSnapshotStoreOptions {
  /** Remote URL (SSH for production, file:// for tests against a bare repo). */
  remoteUrl: string;
  /** Local working directory. Cloned on first use if it doesn't exist. */
  localPath: string;
  /** Branch to commit/push to. Defaults to `main`. */
  branch?: string;
  /**
   * When false, `save`/`saveDiff` commit locally but do not push. Tests with
   * an in-memory or read-only remote set this false; production never does.
   */
  push?: boolean;
  /** Pino logger (injectable for tests). Defaults to silent. */
  logger?: Logger;
}

/**
 * The v1.0 {@link SnapshotStore} — JSON files in a dedicated git repo
 * (`cook-county-ocs/ocs-relias-snapshots` in production, a local bare repo
 * in tests). Designed so the same code path runs in both environments;
 * only the `remoteUrl` differs.
 *
 * Idempotency: `save` produces one commit per snapshot. If two saves happen
 * within the same second (timestamp collision), the second's filename collides
 * with the first and the call rejects rather than overwriting. v1.0 doesn't
 * need sub-second precision — the cron runs hourly at most.
 */
export class GitJsonSnapshotStore implements SnapshotStore {
  private readonly remoteUrl: string;
  private readonly localPath: string;
  private readonly branch: string;
  private readonly push: boolean;
  private readonly logger: Logger;
  private git: SimpleGit | null = null;

  constructor(opts: GitJsonSnapshotStoreOptions) {
    this.remoteUrl = opts.remoteUrl;
    this.localPath = opts.localPath;
    this.branch = opts.branch ?? DEFAULT_BRANCH;
    this.push = opts.push ?? true;
    this.logger = opts.logger ?? pino({ level: 'silent' });
  }

  async save(snapshot: ReliasSnapshot): Promise<SnapshotMeta> {
    const git = await this.ensureClone();
    await this.pullLatest(git);

    const filename = snapshotFilename(snapshot.capturedAt);
    const relPath = join(SNAPSHOTS_DIR, filename);
    const absPath = join(this.localPath, relPath);

    if (existsSync(absPath)) {
      throw new Error(
        `snapshot collision: ${relPath} already exists (capturedAt ${snapshot.capturedAt})`,
      );
    }

    await mkdir(join(this.localPath, SNAPSHOTS_DIR), { recursive: true });
    await writeFile(absPath, formatJson(snapshot));

    const message = `feat(snapshot): catalog snapshot ${snapshot.capturedAt.slice(0, 10)}`;
    await git.add(relPath);
    await git.commit(message);
    const sha = (await git.revparse(['HEAD'])).trim();
    if (this.push) await git.push('origin', this.branch);

    this.logger.info({ path: relPath, sha, totalCount: snapshot.totalCount }, 'snapshot saved');
    return { capturedAt: snapshot.capturedAt, path: relPath, totalCount: snapshot.totalCount, sha };
  }

  async loadLatest(): Promise<ReliasSnapshot | null> {
    const metas = await this.list({ limit: 1 });
    if (metas.length === 0) return null;
    return this.loadByMeta(metas[0]!);
  }

  async list(opts?: ListOpts): Promise<SnapshotMeta[]> {
    const git = await this.ensureClone();
    await this.pullLatest(git);

    const dir = join(this.localPath, SNAPSHOTS_DIR);
    if (!existsSync(dir)) return [];

    const files = await readdir(dir);
    const matches: SnapshotMeta[] = [];
    for (const file of files) {
      const m = SNAPSHOT_FILE_RE.exec(file);
      if (!m) continue;
      const relPath = join(SNAPSHOTS_DIR, file);
      const totalCount = await peekTotalCount(join(this.localPath, relPath));
      matches.push({ capturedAt: filenameToIso(m[1]!), path: relPath, totalCount });
    }

    // Newest-first by capturedAt (ISO sorts lexically).
    matches.sort((a, b) =>
      a.capturedAt < b.capturedAt ? 1 : a.capturedAt > b.capturedAt ? -1 : 0,
    );
    return matches.slice(0, opts?.limit ?? DEFAULT_LIST_LIMIT);
  }

  async loadByMeta(meta: SnapshotMeta): Promise<ReliasSnapshot> {
    await this.ensureClone();
    const absPath = join(this.localPath, meta.path);
    const raw = await readFile(absPath, 'utf8');
    return JSON.parse(raw) as ReliasSnapshot;
  }

  async saveDiff(diff: ReliasDiff): Promise<void> {
    const git = await this.ensureClone();
    await this.pullLatest(git);

    const filename = diffFilename(diff.to.capturedAt, diff.from.capturedAt);
    const relPath = join(DIFFS_DIR, filename);
    const absPath = join(this.localPath, relPath);

    if (existsSync(absPath)) {
      throw new Error(`diff collision: ${relPath} already exists`);
    }

    await mkdir(join(this.localPath, DIFFS_DIR), { recursive: true });
    await writeFile(absPath, formatJson(diff));

    const message =
      `feat(snapshot): diff ${diff.to.capturedAt.slice(0, 10)} ` +
      `(+${diff.summary.addedCount} -${diff.summary.removedCount} ~${diff.summary.changedCount})`;
    await git.add(relPath);
    await git.commit(message);
    if (this.push) await git.push('origin', this.branch);

    this.logger.info({ path: relPath, summary: diff.summary }, 'diff saved');
  }

  async loadLatestDiff(): Promise<ReliasDiff | null> {
    const git = await this.ensureClone();
    await this.pullLatest(git);

    const dir = join(this.localPath, DIFFS_DIR);
    if (!existsSync(dir)) return null;

    const files = await readdir(dir);
    const candidates = files
      .map((f) => ({ f, m: DIFF_FILE_RE.exec(f) }))
      .filter((x): x is { f: string; m: RegExpExecArray } => x.m !== null);
    if (candidates.length === 0) return null;

    // Newest by the leading (`to`) timestamp.
    candidates.sort((a, b) => (a.m[1]! < b.m[1]! ? 1 : a.m[1]! > b.m[1]! ? -1 : 0));
    const top = candidates[0]!;
    const raw = await readFile(join(dir, top.f), 'utf8');
    return JSON.parse(raw) as ReliasDiff;
  }

  private async ensureClone(): Promise<SimpleGit> {
    if (this.git) return this.git;
    if (!existsSync(join(this.localPath, '.git'))) {
      await mkdir(this.localPath, { recursive: true });
      const cloner = simpleGit();
      await cloner.clone(this.remoteUrl, this.localPath, ['--branch', this.branch]);
    }
    this.git = simpleGit(this.localPath);
    // Configure committer locally so commits work even when no global identity is set
    // (CI runners are like this by default).
    await this.git.addConfig('user.email', 'relias-mcp@cook-county-ocs.local');
    await this.git.addConfig('user.name', 'relias-mcp');
    return this.git;
  }

  private async pullLatest(git: SimpleGit): Promise<void> {
    try {
      await git.pull('origin', this.branch, ['--ff-only']);
    } catch (err) {
      // A pull failure on an empty remote (no commits yet) is fine; the caller's
      // own commit will seed the branch. Surface anything else.
      const msg = err instanceof Error ? err.message : String(err);
      if (
        !/couldn't find remote ref|no such ref|does not appear to be a git repository/i.test(msg)
      ) {
        throw err;
      }
    }
  }
}

/** ISO timestamp → filesystem-safe filename. Inverse of {@link filenameToIso}. */
export function snapshotFilename(capturedAt: string): string {
  return `${capturedAt.replace(/:/g, '-')}.json`;
}

/** `to`-from-`from` diff filename. Both timestamps in their filesystem-safe form. */
export function diffFilename(toIso: string, fromIso: string): string {
  return `${toIso.replace(/:/g, '-')}-from-${fromIso.replace(/:/g, '-')}.json`;
}

function filenameToIso(stem: string): string {
  // `2026-05-27T16-15-30Z` → `2026-05-27T16:15:30Z`. Only the time-component
  // colons need restoring; the date-component hyphens are real.
  const [date, time] = stem.split('T');
  return `${date}T${time!.replace(/-/g, ':')}`;
}

function formatJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** Cheap totalCount peek — reads the whole file, but snapshots are small. */
async function peekTotalCount(path: string): Promise<number> {
  const raw = await readFile(path, 'utf8');
  const parsed = JSON.parse(raw) as { totalCount?: number };
  return parsed.totalCount ?? 0;
}
