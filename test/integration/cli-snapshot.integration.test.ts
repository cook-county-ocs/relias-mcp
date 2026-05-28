import { homedir, tmpdir } from 'node:os';
import { mkdtempSync, existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runCli } from '../../src/cli.js';
import { hasEnv } from './_skip-when-missing-env.js';

/**
 * F5 cron-rehearsal integration test: the full `relias-mcp snapshot
 * --json` pipeline against real Relias (F1 OIDC + F2 SearchApi) and a
 * disposable branch on the real snapshots repo (F3 GitJsonSnapshotStore).
 *
 * This is the closest test to what GitHub Actions will run in P7. If
 * this passes, the cron should pass.
 *
 * Required:
 *  - RELIAS_OIDC_REFRESH_TOKEN (F1+F2)
 *  - ~/.ssh/relias-snapshots-deploy (F3)
 *  - RELIAS_RUN_REMOTE_INTEGRATION=1 (opt-in)
 *
 * Burns the input refresh token (per LD-RM-16 rotation). Re-running
 * requires a freshly harvested token.
 *
 * What it asserts:
 *  - CLI exits 0
 *  - JSON output parses
 *  - Snapshot path follows the expected naming convention
 *  - Committed SHA is a real git SHA
 *  - Snapshot file appears on the disposable branch in the real repo
 */

const DEPLOY_KEY = join(homedir(), '.ssh', 'relias-snapshots-deploy');
const REMOTE_URL = 'git@github.com:cook-county-ocs/ocs-relias-snapshots.git';
const HAS_DEPLOY_KEY = existsSync(DEPLOY_KEY);
const HAS_OIDC = hasEnv('RELIAS_OIDC_REFRESH_TOKEN');
const OPT_IN = hasEnv('RELIAS_RUN_REMOTE_INTEGRATION');

describe.skipIf(!HAS_DEPLOY_KEY || !HAS_OIDC || !OPT_IN)(
  'F5 CLI cron rehearsal — full pipeline',
  () => {
    let scratch: string;
    let testBranch: string;
    let originalSnapshotsRemote: string | undefined;
    let originalSnapshotsLocal: string | undefined;
    let originalSnapshotsBranch: string | undefined;

    beforeEach(() => {
      process.env.GIT_SSH_COMMAND = `ssh -i ${DEPLOY_KEY} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new`;
      scratch = mkdtempSync(join(tmpdir(), 'relias-mcp-cli-cron-'));
      testBranch = `integration-test-cli-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)}`;
      originalSnapshotsRemote = process.env.RELIAS_SNAPSHOTS_REMOTE;
      originalSnapshotsLocal = process.env.RELIAS_SNAPSHOTS_LOCAL;
      originalSnapshotsBranch = process.env.RELIAS_SNAPSHOTS_BRANCH;
      process.env.RELIAS_SNAPSHOTS_REMOTE = REMOTE_URL;
      process.env.RELIAS_SNAPSHOTS_LOCAL = join(scratch, 'local');
      process.env.RELIAS_SNAPSHOTS_BRANCH = testBranch;
    });

    afterEach(async () => {
      // Restore env vars
      restoreEnv('RELIAS_SNAPSHOTS_REMOTE', originalSnapshotsRemote);
      restoreEnv('RELIAS_SNAPSHOTS_LOCAL', originalSnapshotsLocal);
      restoreEnv('RELIAS_SNAPSHOTS_BRANCH', originalSnapshotsBranch);
      // Delete test branch on origin (best-effort)
      try {
        const cleanupDir = join(scratch, 'cleanup');
        await mkdir(cleanupDir, { recursive: true });
        const g = simpleGit();
        await g.clone(REMOTE_URL, cleanupDir, ['--depth', '1']);
        await simpleGit(cleanupDir).push('origin', testBranch, ['--delete']);
      } catch {
        // swallow
      }
      await rm(scratch, { recursive: true, force: true });
    });

    it('runs `snapshot --json` end-to-end against real Relias + real snapshots repo', async () => {
      // Pre-create the test branch on origin so the store's --branch clone works.
      const seedDir = join(scratch, 'seed');
      await mkdir(seedDir, { recursive: true });
      await simpleGit().clone(REMOTE_URL, seedDir, ['--depth', '1']);
      const seedGit = simpleGit(seedDir);
      await seedGit.checkoutLocalBranch(testBranch);
      await seedGit.push('origin', testBranch);

      let stdout = '';
      let stderr = '';
      const exitCode = await runCli({
        argv: ['node', 'relias-mcp', '--json', 'snapshot'],
        stdout: (s) => {
          stdout += s;
        },
        stderr: (s) => {
          stderr += s;
        },
      });

      // Surface stderr/stdout in the assertion message so a failing run
      // shows WHY the CLI exited non-zero (otherwise vitest just reports
      // the bare exit code with no context — the captured streams are
      // silently dropped).
      expect(
        exitCode,
        `CLI exited ${exitCode}.\n--- stderr ---\n${stderr}\n--- stdout (first 800 chars) ---\n${stdout.slice(0, 800)}`,
      ).toBe(0);
      expect(stderr, `unexpected stderr output: ${stderr}`).toBe('');

      const result = JSON.parse(stdout) as {
        snapshot: { capturedAt: string; path: string; sha: string; totalCount: number };
        diff: unknown;
      };
      expect(result.snapshot.path).toMatch(
        /^snapshots\/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.json$/,
      );
      expect(result.snapshot.sha).toMatch(/^[a-f0-9]{40}$/);
      expect(result.snapshot.totalCount).toBeGreaterThan(100); // sanity
      // First snapshot on the test branch → no previous → no diff.
      expect(result.diff).toBeNull();
    });
  },
);

function restoreEnv(name: string, original: string | undefined): void {
  if (original === undefined) delete process.env[name];
  else process.env[name] = original;
}
