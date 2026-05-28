import { mkdtempSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GitJsonSnapshotStore, diffFilename, snapshotFilename } from './git-json-snapshot-store.js';
import type { ReliasCourse, ReliasDiff, ReliasSnapshot } from './types.js';

function course(over: Partial<ReliasCourse> & { courseID: number }): ReliasCourse {
  return {
    title: `Course ${over.courseID}`,
    code: `REL-C-${over.courseID}`,
    hours: 1,
    hoursLabel: '1.00',
    courseType: 1,
    description: null,
    releaseDate: null,
    archiveDate: null,
    ...over,
  };
}

function snapshot(capturedAt: string, n = 2): ReliasSnapshot {
  const courses: ReliasCourse[] = [];
  for (let i = 1; i <= n; i += 1) courses.push(course({ courseID: i }));
  return { capturedAt, source: 'relias-search-api', totalCount: courses.length, courses };
}

interface Harness {
  bare: string;
  local: string;
  store: GitJsonSnapshotStore;
  scratch: string;
}

async function setupHarness(): Promise<Harness> {
  const scratch = mkdtempSync(join(tmpdir(), 'relias-mcp-store-'));
  const bare = join(scratch, 'remote.git');
  const local = join(scratch, 'local');

  // Init the bare repo with a seed commit on `main` so `git clone --branch main` works.
  await mkdir(bare, { recursive: true });
  const bareGit = simpleGit(bare);
  await bareGit.init(['--bare', '--initial-branch=main']);

  // Seed via a throwaway clone: empty commit + push to create the branch ref.
  const seedDir = join(scratch, 'seed');
  await mkdir(seedDir, { recursive: true });
  const seedGit = simpleGit(seedDir);
  await seedGit.init(['--initial-branch=main']);
  await seedGit.addConfig('user.email', 'test@local');
  await seedGit.addConfig('user.name', 'test');
  await seedGit.addRemote('origin', bare);
  await seedGit.commit('chore: seed', [], { '--allow-empty': null });
  await seedGit.push('origin', 'main');

  const store = new GitJsonSnapshotStore({ remoteUrl: bare, localPath: local });
  return { bare, local, store, scratch };
}

describe('snapshot/diff filename helpers', () => {
  it('substitutes colons for hyphens in the time component only', () => {
    expect(snapshotFilename('2026-05-27T16:15:30Z')).toBe('2026-05-27T16-15-30Z.json');
  });

  it('formats diff filenames as `<to>-from-<from>.json`', () => {
    expect(diffFilename('2026-05-27T16:15:30Z', '2026-05-20T10:00:00Z')).toBe(
      '2026-05-27T16-15-30Z-from-2026-05-20T10-00-00Z.json',
    );
  });
});

describe('GitJsonSnapshotStore', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await setupHarness();
  });
  afterEach(async () => {
    await rm(h.scratch, { recursive: true, force: true });
  });

  it('save() persists the snapshot, commits, pushes, returns meta with sha', async () => {
    const snap = snapshot('2026-05-27T12:00:00Z');
    const meta = await h.store.save(snap);
    expect(meta).toMatchObject({
      capturedAt: snap.capturedAt,
      path: 'snapshots/2026-05-27T12-00-00Z.json',
      totalCount: 2,
    });
    expect(meta.sha).toMatch(/^[a-f0-9]{40}$/);

    // Bare repo should now contain the commit reachable from main.
    const bareGit = simpleGit(h.bare);
    const log = await bareGit.log(['main']);
    expect(log.latest?.message).toContain('catalog snapshot 2026-05-27');
  });

  it('loadLatest() returns the most recently saved snapshot', async () => {
    const a = snapshot('2026-05-26T12:00:00Z');
    const b = snapshot('2026-05-27T12:00:00Z', 3);
    await h.store.save(a);
    await h.store.save(b);
    const loaded = await h.store.loadLatest();
    expect(loaded?.capturedAt).toBe(b.capturedAt);
    expect(loaded?.totalCount).toBe(3);
  });

  it('list() returns metas newest-first and respects limit', async () => {
    await h.store.save(snapshot('2026-05-25T12:00:00Z'));
    await h.store.save(snapshot('2026-05-26T12:00:00Z'));
    await h.store.save(snapshot('2026-05-27T12:00:00Z'));
    const all = await h.store.list();
    expect(all.map((m) => m.capturedAt)).toEqual([
      '2026-05-27T12:00:00Z',
      '2026-05-26T12:00:00Z',
      '2026-05-25T12:00:00Z',
    ]);
    const top1 = await h.store.list({ limit: 1 });
    expect(top1.map((m) => m.capturedAt)).toEqual(['2026-05-27T12:00:00Z']);
  });

  it('list() returns [] when the snapshots dir does not yet exist', async () => {
    const metas = await h.store.list();
    expect(metas).toEqual([]);
  });

  it('loadByMeta() round-trips an arbitrary saved snapshot', async () => {
    const a = snapshot('2026-05-26T12:00:00Z');
    const b = snapshot('2026-05-27T12:00:00Z', 4);
    const aMeta = await h.store.save(a);
    await h.store.save(b);
    const loadedA = await h.store.loadByMeta(aMeta);
    expect(loadedA).toEqual(a);
  });

  it('save() rejects on filename collision rather than overwriting', async () => {
    const snap = snapshot('2026-05-27T12:00:00Z');
    await h.store.save(snap);
    await expect(h.store.save(snap)).rejects.toThrow(/collision/);
  });

  it('saveDiff() persists alongside snapshots and loadLatestDiff() returns it', async () => {
    const d: ReliasDiff = {
      from: { capturedAt: '2026-05-26T12:00:00Z' },
      to: { capturedAt: '2026-05-27T12:00:00Z' },
      added: [course({ courseID: 99 })],
      removed: [],
      changed: [],
      summary: { addedCount: 1, removedCount: 0, changedCount: 0 },
    };
    await h.store.saveDiff(d);
    const loaded = await h.store.loadLatestDiff();
    expect(loaded).toEqual(d);
  });

  it('loadLatestDiff() returns the newest diff by `to` timestamp', async () => {
    const older: ReliasDiff = {
      from: { capturedAt: '2026-05-25T12:00:00Z' },
      to: { capturedAt: '2026-05-26T12:00:00Z' },
      added: [],
      removed: [],
      changed: [],
      summary: { addedCount: 0, removedCount: 0, changedCount: 0 },
    };
    const newer: ReliasDiff = {
      ...older,
      from: older.to,
      to: { capturedAt: '2026-05-27T12:00:00Z' },
    };
    await h.store.saveDiff(older);
    await h.store.saveDiff(newer);
    const latest = await h.store.loadLatestDiff();
    expect(latest?.to.capturedAt).toBe('2026-05-27T12:00:00Z');
  });

  it('loadLatestDiff() returns null when no diffs are stored', async () => {
    expect(await h.store.loadLatestDiff()).toBeNull();
  });

  it('loadLatest() returns null when the store is empty', async () => {
    expect(await h.store.loadLatest()).toBeNull();
  });

  it('saveDiff() rejects on filename collision', async () => {
    const d: ReliasDiff = {
      from: { capturedAt: '2026-05-26T12:00:00Z' },
      to: { capturedAt: '2026-05-27T12:00:00Z' },
      added: [],
      removed: [],
      changed: [],
      summary: { addedCount: 0, removedCount: 0, changedCount: 0 },
    };
    await h.store.saveDiff(d);
    await expect(h.store.saveDiff(d)).rejects.toThrow(/collision/);
  });

  it('push:false commits locally without pushing to origin', async () => {
    const local2 = join(h.scratch, 'local-nopush');
    const localStore = new GitJsonSnapshotStore({
      remoteUrl: h.bare,
      localPath: local2,
      push: false,
    });
    const snap = snapshot('2026-05-27T12:00:00Z');
    const meta = await localStore.save(snap);
    expect(meta.sha).toMatch(/^[a-f0-9]{40}$/);

    // The bare remote should NOT have received the commit.
    const bareGit = simpleGit(h.bare);
    const log = await bareGit.log(['main']);
    expect(log.latest?.message).toBe('chore: seed');
  });

  it('save() succeeds against an empty remote (pullLatest swallows missing-ref errors)', async () => {
    // A freshly-created bare repo has no `main` ref yet — `git pull` errors
    // with "couldn't find remote ref". The store must absorb that and let the
    // first save seed the branch.
    const emptyScratch = mkdtempSync(join(tmpdir(), 'relias-mcp-empty-'));
    const emptyBare = join(emptyScratch, 'remote.git');
    await mkdir(emptyBare, { recursive: true });
    await simpleGit(emptyBare).init(['--bare', '--initial-branch=main']);

    // We can't clone a bare repo with no commits via `--branch main`, so
    // simulate the first-clone-then-save flow by pre-initializing the local
    // dir as a working repo with the remote configured.
    const emptyLocal = join(emptyScratch, 'local');
    await mkdir(emptyLocal, { recursive: true });
    const local = simpleGit(emptyLocal);
    await local.init(['--initial-branch=main']);
    await local.addRemote('origin', emptyBare);

    const store = new GitJsonSnapshotStore({ remoteUrl: emptyBare, localPath: emptyLocal });
    const meta = await store.save(snapshot('2026-05-27T12:00:00Z'));
    expect(meta.sha).toMatch(/^[a-f0-9]{40}$/);

    await rm(emptyScratch, { recursive: true, force: true });
  });

  it('clones once and reuses the working tree across calls', async () => {
    // Two back-to-back operations must not re-clone (would fail because the
    // directory already exists). Implicitly verified by save() then list().
    await h.store.save(snapshot('2026-05-27T12:00:00Z'));
    const metas = await h.store.list();
    expect(metas).toHaveLength(1);
  });
});
