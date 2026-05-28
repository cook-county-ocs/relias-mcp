import { diff } from '../../lib/diff-engine.js';
import type { ReliasSnapshot } from '../../lib/types.js';
import type { CliContext } from '../context.js';

/**
 * `relias-mcp snapshot` — pull the latest COPE catalog from Relias, save
 * to the snapshots repo as a new JSON file, compute the diff vs the
 * previous snapshot, save that too.
 *
 * Cron uses `relias-mcp snapshot --json` so the GitHub Actions workflow
 * can parse output. JSON shape: `{ snapshot: SnapshotMeta, diff: { summary: ReliasDiff.summary } | null }`.
 * Diff is null on the first-ever snapshot (no previous to compare against).
 *
 * Exit codes per spec §6 F5:
 *  - 0 on success (whether or not the diff has changes)
 *  - non-zero on any error (env, network, schema drift, etc.)
 */

export interface SnapshotResult {
  snapshot: {
    capturedAt: string;
    path: string;
    sha: string | undefined;
    totalCount: number;
  };
  diff: {
    from: string;
    to: string;
    summary: { addedCount: number; removedCount: number; changedCount: number };
  } | null;
}

export async function runSnapshot(
  ctx: CliContext,
  opts: { json?: boolean; capturedAt?: string } = {},
): Promise<SnapshotResult> {
  const logger = ctx.logger;
  const store = ctx.buildStore();
  const searchApi = ctx.buildSearchApi();

  logger.info({}, 'snapshot: fetching COPE catalog from Relias');
  const courses = await searchApi.fetchCopeCatalog();
  logger.info({ count: courses.length }, 'snapshot: catalog fetched');

  // capturedAt as a CLI option is for tests; production always uses now.
  const capturedAt = opts.capturedAt ?? new Date().toISOString().replace(/\.\d+/, '');
  const snapshot: ReliasSnapshot = {
    capturedAt,
    source: 'relias-search-api',
    totalCount: courses.length,
    courses,
  };

  // Load previous (before save, so we don't compare-against-self).
  const previous = await store.loadLatest();
  logger.debug({ hasPrevious: previous !== null }, 'snapshot: loaded previous for diff comparison');

  const meta = await store.save(snapshot);
  logger.info({ path: meta.path, sha: meta.sha }, 'snapshot: saved');

  let diffSummary: SnapshotResult['diff'] = null;
  if (previous !== null) {
    const computed = diff(previous, snapshot);
    await store.saveDiff(computed);
    diffSummary = {
      from: computed.from.capturedAt,
      to: computed.to.capturedAt,
      summary: computed.summary,
    };
    logger.info({ summary: computed.summary }, 'snapshot: diff computed and saved');
  } else {
    logger.info({}, 'snapshot: no previous snapshot — skipping diff');
  }

  return {
    snapshot: {
      capturedAt: meta.capturedAt,
      path: meta.path,
      sha: meta.sha,
      totalCount: meta.totalCount,
    },
    diff: diffSummary,
  };
}
