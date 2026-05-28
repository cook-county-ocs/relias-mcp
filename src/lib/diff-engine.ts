import type { ReliasCourse, ReliasDiff, ReliasDiffChange, ReliasSnapshot } from './types.js';

/**
 * Fields on {@link ReliasCourse} the diff engine tracks for "changed" detection.
 *
 * Intentionally excludes `courseID` (the primary key — its presence/absence is
 * what drives `added`/`removed`, not `changed`). New tracked fields go here
 * AND get a test case in `diff-engine.test.ts`. Adding a field without a test
 * is the kind of drift the diff engine exists to catch elsewhere — don't seed
 * it here too.
 */
const TRACKED_FIELDS: ReadonlyArray<keyof ReliasCourse> = [
  'title',
  'code',
  'hours',
  'hoursLabel',
  'courseType',
  'description',
  'releaseDate',
  'archiveDate',
];

/**
 * Compute the diff between two snapshots.
 *
 * Pure function — no I/O, no clock. Sort order in `added`, `removed`, `changed`
 * is ascending `courseID` so consumers (and snapshots in git) are deterministic
 * across runs. The `from`/`to` carry only `capturedAt` because that's all the
 * MCP `relias-get-latest-diff` tool needs to surface; load the full snapshots
 * via the store if more is needed.
 */
export function diff(from: ReliasSnapshot, to: ReliasSnapshot): ReliasDiff {
  const fromById = new Map<number, ReliasCourse>(from.courses.map((c) => [c.courseID, c]));
  const toById = new Map<number, ReliasCourse>(to.courses.map((c) => [c.courseID, c]));

  const added: ReliasCourse[] = [];
  const removed: ReliasCourse[] = [];
  const changed: ReliasDiffChange[] = [];

  for (const [id, course] of toById) {
    if (!fromById.has(id)) {
      added.push(course);
    }
  }

  for (const [id, course] of fromById) {
    const after = toById.get(id);
    if (after === undefined) {
      removed.push(course);
      continue;
    }
    const fields = changedFields(course, after);
    if (fields.length > 0) {
      changed.push({ courseID: id, before: course, after, fields });
    }
  }

  const byCourseId = (a: { courseID: number }, b: { courseID: number }): number =>
    a.courseID - b.courseID;
  added.sort(byCourseId);
  removed.sort(byCourseId);
  changed.sort(byCourseId);

  return {
    from: { capturedAt: from.capturedAt },
    to: { capturedAt: to.capturedAt },
    added,
    removed,
    changed,
    summary: {
      addedCount: added.length,
      removedCount: removed.length,
      changedCount: changed.length,
    },
  };
}

function changedFields(before: ReliasCourse, after: ReliasCourse): string[] {
  const out: string[] = [];
  for (const field of TRACKED_FIELDS) {
    if (before[field] !== after[field]) {
      out.push(field);
    }
  }
  return out.sort();
}
