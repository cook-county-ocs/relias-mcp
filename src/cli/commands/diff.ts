import { diff as computeDiff } from '../../lib/diff-engine.js';
import type { ReliasDiff } from '../../lib/types.js';
import type { CliContext } from '../context.js';

/**
 * `relias-mcp diff [--from TS] [--to TS]` — print the latest diff, or
 * compute on-the-fly between two named snapshots.
 *
 * Default (no args): load the most recent saved diff from the store.
 * With `--from` and `--to`: load both named snapshots and compute a fresh
 * diff (doesn't persist it). The on-demand mode lets coordinators
 * investigate "what changed between week 3 and week 8" without
 * touching the saved diff stream.
 *
 * Both args together are required if either is set — partial timestamp
 * pairs are rejected at the commander layer.
 */

export class DiffNotFoundError extends Error {
  readonly exitCode = 6 as const;
  constructor(message: string) {
    super(message);
    this.name = 'DiffNotFoundError';
  }
}

export interface DiffPayload {
  diff: ReliasDiff;
  /** True when the diff was loaded from the store, false when computed on-demand. */
  fromStore: boolean;
}

export async function runDiff(
  ctx: CliContext,
  opts: { from?: string; to?: string } = {},
): Promise<DiffPayload> {
  const logger = ctx.logger;
  const store = ctx.buildStore();

  if (opts.from !== undefined && opts.to !== undefined) {
    logger.info({ from: opts.from, to: opts.to }, 'diff: computing on-demand');
    // Locate both snapshots by capturedAt. list() is bounded by limit; pull
    // a wide enough page that we can find both. v1.0 snapshots are weekly,
    // so 200 covers ~4 years of history.
    const metas = await store.list({ limit: 200 });
    const fromMeta = metas.find((m) => m.capturedAt === opts.from);
    const toMeta = metas.find((m) => m.capturedAt === opts.to);
    if (!fromMeta) throw new DiffNotFoundError(`no snapshot with capturedAt=${opts.from}`);
    if (!toMeta) throw new DiffNotFoundError(`no snapshot with capturedAt=${opts.to}`);
    const [fromSnap, toSnap] = await Promise.all([
      store.loadByMeta(fromMeta),
      store.loadByMeta(toMeta),
    ]);
    return { diff: computeDiff(fromSnap, toSnap), fromStore: false };
  }

  if (opts.from !== undefined || opts.to !== undefined) {
    throw new DiffNotFoundError('--from and --to must be provided together (or neither)');
  }

  // Default: most recent saved diff.
  logger.info({}, 'diff: loading latest saved diff');
  const latest = await store.loadLatestDiff();
  if (latest === null) {
    throw new DiffNotFoundError(
      'no saved diffs found. The first `relias-mcp snapshot` after a previous snapshot exists ' +
        'will create the first diff.',
    );
  }
  return { diff: latest, fromStore: true };
}
