import { homedir, tmpdir } from 'node:os';
import { mkdtempSync, existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { diff } from '../../src/lib/diff-engine.js';
import { GitJsonSnapshotStore } from '../../src/lib/git-json-snapshot-store.js';
import type { ReliasCourse, ReliasSnapshot } from '../../src/lib/types.js';
import { hasEnv } from './_skip-when-missing-env.js';

/**
 * F3 integration test against the real
 * `cook-county-ocs/ocs-relias-snapshots` remote.
 *
 * Validates chores C3 (repo exists), C4 (deploy keypair valid), C5
 * (public key installed on the snapshots repo with write access).
 *
 * What it does:
 *  1. Configures git to use the deploy key (~/.ssh/relias-snapshots-deploy)
 *     via GIT_SSH_COMMAND for this process only.
 *  2. Creates a disposable test branch on origin so nothing pollutes main.
 *  3. Exercises save → list → loadLatest → saveDiff → loadLatestDiff.
 *  4. Deletes the disposable branch from origin in cleanup.
 *
 * Required:
 *  - `~/.ssh/relias-snapshots-deploy` (private deploy key)
 *  - GitHub SSH access to clone `cook-county-ocs/ocs-relias-snapshots`
 *
 * Skip condition: the deploy key file doesn't exist. There's no good
 * env var to gate on — the key being on disk is the actual prereq.
 *
 * Test data uses obviously-fake courseIDs (1, 2, 3) and an
 * `__INTEGRATION_TEST__` marker in titles so anything that leaks is
 * easy to find and clean up.
 */

const DEPLOY_KEY = join(homedir(), '.ssh', 'relias-snapshots-deploy');
const REMOTE_URL = 'git@github.com:cook-county-ocs/ocs-relias-snapshots.git';
const HAS_DEPLOY_KEY = existsSync(DEPLOY_KEY);
// Belt + suspenders: a single env var that explicitly opts in. Even
// with the deploy key present, you might not want this test running
// on every dev machine.
const OPT_IN = hasEnv('RELIAS_RUN_REMOTE_INTEGRATION');

describe.skipIf(!HAS_DEPLOY_KEY || !OPT_IN)('F3 GitJsonSnapshotStore — real remote', () => {
  let scratch: string;
  let testBranch: string;

  beforeEach(() => {
    process.env.GIT_SSH_COMMAND = `ssh -i ${DEPLOY_KEY} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new`;
    scratch = mkdtempSync(join(tmpdir(), 'relias-mcp-integ-'));
    testBranch = `integration-test-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)}`;
  });

  afterEach(async () => {
    // Best-effort cleanup: delete the remote test branch + local scratch.
    try {
      const cleanupDir = join(scratch, 'cleanup');
      await mkdir(cleanupDir, { recursive: true });
      const g = simpleGit();
      await g.clone(REMOTE_URL, cleanupDir, ['--depth', '1']);
      await simpleGit(cleanupDir).push('origin', testBranch, ['--delete']);
    } catch {
      // swallow — cleanup is courtesy, not load-bearing
    }
    await rm(scratch, { recursive: true, force: true });
  });

  it('saves a snapshot, lists it, loads it, saves a diff, loads it back', async () => {
    // Pre-create the test branch on origin so the store's --branch clone works.
    const seedDir = join(scratch, 'seed');
    await mkdir(seedDir, { recursive: true });
    const seedClone = simpleGit();
    await seedClone.clone(REMOTE_URL, seedDir, ['--depth', '1']);
    const seedGit = simpleGit(seedDir);
    await seedGit.checkoutLocalBranch(testBranch);
    await seedGit.push('origin', testBranch);

    const store = new GitJsonSnapshotStore({
      remoteUrl: REMOTE_URL,
      localPath: join(scratch, 'local'),
      branch: testBranch,
    });

    const snapA = fakeSnapshot('2026-05-27T18:00:00Z', [1, 2]);
    const metaA = await store.save(snapA);
    expect(metaA.path).toBe('snapshots/2026-05-27T18-00-00Z.json');
    expect(metaA.sha).toMatch(/^[a-f0-9]{40}$/);
    expect(metaA.totalCount).toBe(2);

    const listed = await store.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]!.capturedAt).toBe(snapA.capturedAt);

    const loaded = await store.loadLatest();
    expect(loaded).not.toBeNull();
    expect(loaded!.courses[0]!.title).toContain('__INTEGRATION_TEST__');

    const snapB = fakeSnapshot('2026-05-27T19:00:00Z', [1, 2, 3]);
    await store.save(snapB);
    const computedDiff = diff(snapA, snapB);
    expect(computedDiff.summary.addedCount).toBe(1);
    await store.saveDiff(computedDiff);

    const loadedDiff = await store.loadLatestDiff();
    expect(loadedDiff).not.toBeNull();
    expect(loadedDiff!.to.capturedAt).toBe(snapB.capturedAt);
    expect(loadedDiff!.added[0]!.courseID).toBe(3);
  });
});

function fakeCourse(id: number): ReliasCourse {
  return {
    courseID: id,
    title: `__INTEGRATION_TEST__ Course ${id}`,
    code: `TEST-INTEG-${id}`,
    hours: 1,
    hoursLabel: '1.00',
    courseType: 0,
    description: null,
    releaseDate: null,
    archiveDate: null,
  };
}

function fakeSnapshot(capturedAt: string, ids: number[]): ReliasSnapshot {
  const courses = ids.map(fakeCourse);
  return { capturedAt, source: 'relias-search-api', totalCount: courses.length, courses };
}
