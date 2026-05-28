import type { ReliasDiff, ReliasSnapshot, SnapshotMeta } from './types.js';

/**
 * The persistence boundary for snapshots and diffs (LD-RM-03).
 *
 * v1.0 ships {@link GitJsonSnapshotStore} (JSON files in a git repo). v1.5 or
 * v2.0 may ship a `NeonSnapshotStore` against Postgres; nothing outside this
 * file and the implementations should care which one is wired up.
 *
 * The contract is intentionally thin: writes are independent (a snapshot save
 * doesn't presume a diff save), reads are by metadata, listing is paginated
 * by recency. Implementations decide how to serialize, sort, and dedupe.
 */
export interface SnapshotStore {
  /**
   * Persist a snapshot and return its handle. Implementations should make this
   * atomic from the caller's perspective — if `save` resolves, the snapshot
   * is durably stored (committed + pushed for git-backed stores).
   */
  save(snapshot: ReliasSnapshot): Promise<SnapshotMeta>;

  /** Most recent snapshot, or `null` if the store is empty. */
  loadLatest(): Promise<ReliasSnapshot | null>;

  /** Snapshot metadata ordered newest-first. Bounded by `opts.limit`. */
  list(opts?: ListOpts): Promise<SnapshotMeta[]>;

  /** Materialize a specific snapshot from its handle. */
  loadByMeta(meta: SnapshotMeta): Promise<ReliasSnapshot>;

  /** Persist a diff alongside the snapshots, independent of any save. */
  saveDiff(diff: ReliasDiff): Promise<void>;

  /** Most recent diff, or `null` if no diffs are stored. */
  loadLatestDiff(): Promise<ReliasDiff | null>;
}

export interface ListOpts {
  /** Cap on the number of returned metas. Implementations may apply a default. */
  limit?: number;
}
