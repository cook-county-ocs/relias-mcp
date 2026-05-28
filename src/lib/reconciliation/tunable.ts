/**
 * Tunable constants for the F4 reconciliation engine.
 *
 * Per `docs/specs/f4-reconciliation-algorithm.md §5` and the implementation
 * plan §3.1 (audience deferred → re-weighted) and §3.2 (renormalize on
 * missing data instead of returning neutral 0.5).
 *
 * These constants live in their own file so the algorithm code reads as
 * "what" rather than "what and how much." Adjusting a weight or threshold
 * is then a single-file change with a clear diff; the sub-spec §6 review
 * gates (post-first-real-data-run) are the cycle where these earn their
 * keep.
 *
 * v1.0 weights are starting points. Don't tune them from synthetic test
 * cases — wait for the first real-data run captured in
 * `docs/plans/f4-fuzzy-match-tuning-review.md` (a future doc, drafted
 * after PR-3 lands).
 */

/**
 * Composite-score weights. Sum to 1.0 when all dimensions are available.
 * When a dimension is missing on either side (null hours, null code), the
 * composite renormalizes over the available dimensions — see
 * `composite-score.ts` for the math.
 *
 * Title is dominant (0.75) because it carries the most signal in real
 * catalog data; codes drift cleanly via category renames; hours drift on
 * a small number of well-known cases (Benzodiazepines 1.5 → 1.0).
 *
 * Audience weight (0.10 in the sub-spec) is deferred to v1.1 per
 * implementation plan §3.1 — no data source on either side today. The
 * 0.10 was redistributed entirely to title (sub-spec original was
 * 0.65/0.15/0.10/0.10; this is 0.75/0.15/-/0.10 with title absorbing
 * audience's slot).
 */
export const WEIGHTS = {
  title: 0.75,
  hours: 0.15,
  code: 0.1,
} as const;

/**
 * Decision thresholds against the composite score.
 *
 * - composite >= match → `inBoth` with drift annotations
 * - drift <= composite < match → `driftCatalog` (medium confidence,
 *   does NOT claim the Relias entry)
 * - composite < drift → no match (file entry falls to `fileOnly`)
 */
export const THRESHOLDS = {
  match: 0.85,
  drift: 0.7,
} as const;

/**
 * Hours-similarity bands. Tolerant of drift because hours change
 * legitimately (Benzodiazepines went from 1.5 → 1.0; some PDFs render
 * 1.5 as 1.50 and the parsers round to 1.5).
 *
 * The bands are step functions, not continuous, to make the buckets
 * legible in human review of drift catalog entries. A 0.25-hour
 * difference looks like rounding noise; a 1.0-hour difference is
 * meaningful but not disqualifying; anything larger is probably a
 * different course.
 */
export const HOURS_BANDS = [
  { maxDiff: 0, score: 1.0 },
  { maxDiff: 0.25, score: 0.7 },
  { maxDiff: 1.0, score: 0.3 },
  // Anything larger falls to 0.0 (no band match).
] as const;

/**
 * Maximum number of alternate candidates to retain on a fuzzy match.
 * Helps human review: "the engine matched X, but Y and Z were nearly as
 * close." Sub-spec §4 sets this to 3 implicitly (`.slice(1, 4)`).
 */
export const MAX_ALTERNATES = 3;
