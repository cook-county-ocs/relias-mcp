import { mkdtempSync } from 'node:fs';
import { writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { pino } from 'pino';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import { runCli } from './cli.js';
import { GitJsonSnapshotStore } from './lib/git-json-snapshot-store.js';
import type { ReliasCourse, ReliasSnapshot } from './lib/types.js';
import type { CliContext } from './cli/context.js';

/**
 * CLI E2E tests. Each command exercises its action through `runCli` with
 * a stub `contextFactory` that returns mocked subsystems (OidcAuth,
 * SearchApi, SnapshotStore). stdout/stderr captured into strings for
 * assertion.
 *
 * Why this approach: hits the commander + command-action paths
 * end-to-end (catches argv-parsing bugs, exit-code mapping bugs)
 * without needing a real Relias API, deploy key, or live IdP.
 */

interface RunOutcome {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface MockOptions {
  // Behavior overrides
  fetchCopeCatalog?: () => Promise<ReliasCourse[]>;
  loadLatest?: () => Promise<ReliasSnapshot | null>;
  getAccessToken?: () => Promise<string>;
  // Use a real GitJsonSnapshotStore against a local bare repo. When set,
  // overrides the in-memory mock.
  realStore?: GitJsonSnapshotStore;
}

function makeMockContext(opts: MockOptions = {}): CliContext {
  const logger = pino({ level: 'silent' });
  const snapshots: ReliasSnapshot[] = [];
  const diffs: import('./lib/types.js').ReliasDiff[] = [];

  const mockStore = {
    async save(s: ReliasSnapshot) {
      snapshots.push(s);
      return {
        capturedAt: s.capturedAt,
        path: `snapshots/${s.capturedAt.replace(/:/g, '-')}.json`,
        totalCount: s.totalCount,
        sha: 'a'.repeat(40),
      };
    },
    async loadLatest() {
      return opts.loadLatest
        ? opts.loadLatest()
        : Promise.resolve(snapshots.length > 0 ? snapshots[snapshots.length - 1]! : null);
    },
    async list(o?: { limit?: number }) {
      const sorted = [...snapshots].sort((a, b) => (a.capturedAt < b.capturedAt ? 1 : -1));
      const out = sorted.map((s) => ({
        capturedAt: s.capturedAt,
        path: `snapshots/${s.capturedAt.replace(/:/g, '-')}.json`,
        totalCount: s.totalCount,
      }));
      return o?.limit ? out.slice(0, o.limit) : out;
    },
    async loadByMeta(m: { capturedAt: string }) {
      const found = snapshots.find((s) => s.capturedAt === m.capturedAt);
      if (!found) throw new Error('not found');
      return found;
    },
    async saveDiff(d: import('./lib/types.js').ReliasDiff) {
      diffs.push(d);
    },
    async loadLatestDiff() {
      return diffs.length > 0 ? diffs[diffs.length - 1]! : null;
    },
  };

  return {
    logger,
    buildOidc: () =>
      ({
        getAccessToken: opts.getAccessToken ?? (async () => 'test-access-token'),
      }) as unknown as ReturnType<CliContext['buildOidc']>,
    buildSearchApi: () =>
      ({
        fetchCopeCatalog: opts.fetchCopeCatalog ?? (async () => []),
      }) as unknown as ReturnType<CliContext['buildSearchApi']>,
    buildStore: () =>
      (opts.realStore ?? mockStore) as unknown as ReturnType<CliContext['buildStore']>,
  };
}

async function runCommand(argv: string[], ctxFactory: () => CliContext): Promise<RunOutcome> {
  let stdout = '';
  let stderr = '';
  const exitCode = await runCli({
    // Match process.argv shape: [node, script, ...args]
    argv: ['node', 'relias-mcp', ...argv],
    stdout: (s) => {
      stdout += s;
    },
    stderr: (s) => {
      stderr += s;
    },
    contextFactory: ctxFactory,
  });
  return { exitCode, stdout, stderr };
}

function course(over: Partial<ReliasCourse> & { courseID: number }): ReliasCourse {
  return {
    title: `Course ${over.courseID}`,
    code: `REL-BHC-0-${over.courseID}`,
    hours: 1,
    hoursLabel: '1.00',
    courseType: 0,
    description: null,
    releaseDate: null,
    archiveDate: null,
    ...over,
  };
}

describe('CLI: snapshot', () => {
  it('saves first snapshot — emits "First snapshot" message, exit 0', async () => {
    const out = await runCommand(['snapshot'], () =>
      makeMockContext({ fetchCopeCatalog: async () => [course({ courseID: 1 })] }),
    );
    expect(out.exitCode).toBe(0);
    expect(out.stdout).toContain('Saved snapshot');
    expect(out.stdout).toContain('1 courses');
    expect(out.stdout).toContain('First snapshot');
  });

  it('saves second snapshot — emits diff summary', async () => {
    // Use a real GitJsonSnapshotStore against a local bare repo so the
    // store accumulates state between two CLI runs.
    const scratch = mkdtempSync(join(tmpdir(), 'cli-snapshot-'));
    const bare = join(scratch, 'remote.git');
    await mkdir(bare, { recursive: true });
    await simpleGit(bare).init(['--bare', '--initial-branch=main']);
    const seed = join(scratch, 'seed');
    await mkdir(seed, { recursive: true });
    const seedGit = simpleGit(seed);
    await seedGit.init(['--initial-branch=main']);
    await seedGit.addConfig('user.email', 'test@local');
    await seedGit.addConfig('user.name', 'test');
    await seedGit.addRemote('origin', bare);
    await seedGit.commit('seed', [], { '--allow-empty': null });
    await seedGit.push('origin', 'main');

    const store = new GitJsonSnapshotStore({
      remoteUrl: bare,
      localPath: join(scratch, 'local'),
    });

    // First snapshot
    const out1 = await runCommand(['snapshot'], () =>
      makeMockContext({
        fetchCopeCatalog: async () => [course({ courseID: 1 })],
        realStore: store,
      }),
    );
    expect(out1.exitCode).toBe(0);
    expect(out1.stdout).toContain('First snapshot');

    // Tiny wait so the second snapshot has a different ISO timestamp.
    await new Promise<void>((r) => setTimeout(r, 1100));

    // Second snapshot — adds a course → diff shows +1
    const out2 = await runCommand(['snapshot'], () =>
      makeMockContext({
        fetchCopeCatalog: async () => [course({ courseID: 1 }), course({ courseID: 2 })],
        realStore: store,
      }),
    );
    expect(out2.exitCode).toBe(0);
    expect(out2.stdout).toContain('Diff: +1 -0 ~0');

    await rm(scratch, { recursive: true, force: true });
  });

  it('--json emits structured output', async () => {
    const out = await runCommand(['--json', 'snapshot'], () =>
      makeMockContext({ fetchCopeCatalog: async () => [course({ courseID: 1 })] }),
    );
    expect(out.exitCode).toBe(0);
    const parsed = JSON.parse(out.stdout) as { snapshot: { totalCount: number } };
    expect(parsed.snapshot.totalCount).toBe(1);
  });
});

describe('CLI: reconcile', () => {
  it('renders markdown report by default', async () => {
    const csv = 'Title,Code,Hours\nCourse 1,REL-BHC-0-1,1\n';
    const dir = mkdtempSync(join(tmpdir(), 'cli-reconcile-'));
    const filePath = join(dir, 'test.csv');
    await writeFile(filePath, csv);

    const snap: ReliasSnapshot = {
      capturedAt: '2026-05-28T00:00:00Z',
      source: 'relias-search-api',
      totalCount: 1,
      courses: [course({ courseID: 1 })],
    };

    const out = await runCommand(['reconcile', filePath], () =>
      makeMockContext({ loadLatest: async () => snap }),
    );
    expect(out.exitCode).toBe(0);
    expect(out.stdout).toContain('# Relias Catalog Reconciliation Report');
    expect(out.stdout).toContain('## Summary');
    expect(out.stdout).toContain('## In Both');

    await rm(dir, { recursive: true, force: true });
  });

  it('exits 5 with NoSnapshotError when store is empty', async () => {
    const csv = 'Title\nA\n';
    const dir = mkdtempSync(join(tmpdir(), 'cli-reconcile-'));
    const filePath = join(dir, 'test.csv');
    await writeFile(filePath, csv);

    const out = await runCommand(['reconcile', filePath], () =>
      makeMockContext({ loadLatest: async () => null }),
    );
    expect(out.exitCode).toBe(5);
    expect(out.stderr).toContain('no Relias snapshot');

    await rm(dir, { recursive: true, force: true });
  });

  it('exits 3 with UnsupportedFileFormatError on unknown extension', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cli-reconcile-'));
    const filePath = join(dir, 'test.unknown');
    await writeFile(filePath, 'nothing');

    const out = await runCommand(['reconcile', filePath], () =>
      makeMockContext({
        loadLatest: async () => ({
          capturedAt: '2026-05-28T00:00:00Z',
          source: 'relias-search-api',
          totalCount: 0,
          courses: [],
        }),
      }),
    );
    expect(out.exitCode).toBe(3);
    expect(out.stderr).toContain('unsupported file extension');

    await rm(dir, { recursive: true, force: true });
  });

  it('--output writes the report to a file', async () => {
    const csv = 'Title,Code\nA,REL-X-0-A\n';
    const dir = mkdtempSync(join(tmpdir(), 'cli-reconcile-'));
    const inputPath = join(dir, 'in.csv');
    const outputPath = join(dir, 'out.md');
    await writeFile(inputPath, csv);

    const snap: ReliasSnapshot = {
      capturedAt: '2026-05-28T00:00:00Z',
      source: 'relias-search-api',
      totalCount: 1,
      courses: [course({ courseID: 1, code: 'REL-X-0-A', title: 'A' })],
    };

    const out = await runCommand(['reconcile', inputPath, '--output', outputPath], () =>
      makeMockContext({ loadLatest: async () => snap }),
    );
    expect(out.exitCode).toBe(0);
    expect(out.stdout).toContain('Wrote report to');
    const written = await readFile(outputPath, 'utf8');
    expect(written).toContain('# Relias Catalog Reconciliation Report');

    await rm(dir, { recursive: true, force: true });
  });

  it('--json emits structured ReconciliationResult', async () => {
    const csv = 'Title\nA\n';
    const dir = mkdtempSync(join(tmpdir(), 'cli-reconcile-'));
    const filePath = join(dir, 'test.csv');
    await writeFile(filePath, csv);

    const out = await runCommand(['--json', 'reconcile', filePath], () =>
      makeMockContext({
        loadLatest: async () => ({
          capturedAt: '2026-05-28T00:00:00Z',
          source: 'relias-search-api',
          totalCount: 0,
          courses: [],
        }),
      }),
    );
    expect(out.exitCode).toBe(0);
    const parsed = JSON.parse(out.stdout) as { summary: { fileTotal: number } };
    expect(parsed.summary.fileTotal).toBe(1);

    await rm(dir, { recursive: true, force: true });
  });
});

describe('CLI: diff', () => {
  it('exits 6 with diff-not-found when store has no diffs', async () => {
    const out = await runCommand(['diff'], () => makeMockContext());
    expect(out.exitCode).toBe(6);
    expect(out.stderr).toContain('no saved diffs');
  });

  it('--from and --to must be provided together', async () => {
    const out = await runCommand(['diff', '--from', '2026-05-20T00:00:00Z'], () =>
      makeMockContext(),
    );
    expect(out.exitCode).toBe(6);
    expect(out.stderr).toContain('must be provided together');
  });
});

describe('CLI: doctor', () => {
  it('reports HEALTHY when all checks pass (mocks return success)', async () => {
    const out = await runCommand(['doctor'], () => {
      // Simulate env vars being set; the doctor command inspects
      // process.env, not the context, so override via env directly.
      process.env.RELIAS_OIDC_REFRESH_TOKEN = 'test';
      process.env.RELIAS_SNAPSHOTS_REMOTE = 'test://repo';
      return makeMockContext();
    });
    delete process.env.RELIAS_OIDC_REFRESH_TOKEN;
    delete process.env.RELIAS_SNAPSHOTS_REMOTE;
    expect(out.exitCode).toBe(0);
    expect(out.stdout).toContain('HEALTHY');
    expect(out.stdout).toContain('parsers');
  });

  it('reports UNHEALTHY and exits 1 when env is missing', async () => {
    // Make sure env is clean
    delete process.env.RELIAS_OIDC_REFRESH_TOKEN;
    delete process.env.RELIAS_SNAPSHOTS_REMOTE;

    const out = await runCommand(['doctor'], () => makeMockContext());
    expect(out.exitCode).toBe(1);
    expect(out.stdout).toContain('UNHEALTHY');
    expect(out.stdout).toContain('RELIAS_OIDC_REFRESH_TOKEN');
  });

  it('--json doctor emits structured report', async () => {
    delete process.env.RELIAS_OIDC_REFRESH_TOKEN;
    delete process.env.RELIAS_SNAPSHOTS_REMOTE;
    const out = await runCommand(['--json', 'doctor'], () => makeMockContext());
    expect(out.exitCode).toBe(1);
    const parsed = JSON.parse(out.stdout) as { healthy: boolean; checks: unknown[] };
    expect(parsed.healthy).toBe(false);
    expect(parsed.checks.length).toBeGreaterThan(0);
  });
});

describe('CLI: error handling', () => {
  let originalEnvOidc: string | undefined;
  let originalEnvRemote: string | undefined;
  beforeEach(() => {
    originalEnvOidc = process.env.RELIAS_OIDC_REFRESH_TOKEN;
    originalEnvRemote = process.env.RELIAS_SNAPSHOTS_REMOTE;
  });
  afterEach(() => {
    if (originalEnvOidc === undefined) delete process.env.RELIAS_OIDC_REFRESH_TOKEN;
    else process.env.RELIAS_OIDC_REFRESH_TOKEN = originalEnvOidc;
    if (originalEnvRemote === undefined) delete process.env.RELIAS_SNAPSHOTS_REMOTE;
    else process.env.RELIAS_SNAPSHOTS_REMOTE = originalEnvRemote;
  });

  it('snapshot exits 4 (MissingEnvError) when run with no env (real context)', async () => {
    delete process.env.RELIAS_OIDC_REFRESH_TOKEN;
    delete process.env.RELIAS_SNAPSHOTS_REMOTE;
    let stderr = '';
    const exitCode = await runCli({
      argv: ['node', 'relias-mcp', 'snapshot'],
      stdout: () => {
        /* discarded */
      },
      stderr: (s) => {
        stderr += s;
      },
      // No contextFactory — uses createDefaultContext, which calls
      // resolveEnv and throws.
    });
    expect(exitCode).toBe(4);
    expect(stderr).toContain('missing required environment variables');
  });
});
