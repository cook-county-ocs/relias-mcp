import type { ParsedCatalogEntry, ReliasCourse } from '../types.js';

import { codeSimilarity, hoursSimilarity, titleSimilarity } from './similarity.js';
import { WEIGHTS } from './tunable.js';

/**
 * Drift type classification — what's different between a matched PDF
 * entry and its Relias counterpart. Surfaced on `BothMatch.driftType`
 * so downstream renderers can group the reconciliation report.
 *
 * Audience-only is deliberately absent per implementation plan §3.1
 * (audience signal deferred to v1.1).
 */
export type DriftType =
  | 'identical'
  | 'title-only'
  | 'code-only'
  | 'hours-only'
  | 'multi-field'
  | 'version-bump';

/** The composite-score breakdown surfaced for human review of drift. */
export interface CompositeBreakdown {
  /** Aggregate score in `[0, 1]`. Drives the match/drift/no-match decision. */
  composite: number;
  /** Per-dimension score for each dimension that contributed. */
  components: ReadonlyArray<{
    dimension: 'title' | 'hours' | 'code';
    weight: number;
    score: number;
  }>;
  /**
   * Drift classification — populated only when the caller asks for it
   * (drift type only meaningful when composite has reached match
   * threshold). Null on raw scoring.
   */
  driftType: DriftType | null;
}

/**
 * Compute the composite similarity between a parsed file entry and a
 * Relias course.
 *
 * **Renormalize-on-missing** (implementation plan §3.2): a dimension only
 * contributes if data is present on BOTH sides. The composite is then
 * the weighted average over contributing dimensions, with weights
 * rescaled to sum to 1.0. So a file row with no hours and no code
 * collapses to `titleSimilarity` alone; a row with title + hours but no
 * code uses `0.75*title + 0.15*hours` divided by `0.90`.
 *
 * The sub-spec's "neutral 0.5 for missing" approach is SUPERSEDED — a
 * missing dimension is not "somewhat similar," it's "can't say." Adding
 * a 0.5 weight that has no real signal pollutes the composite.
 *
 * `classifyDrift` is left null here — call `classifyDrift(result)` if you
 * need it. The split keeps composite-score side-effect-free and lets the
 * reconciliation engine decide when to spend the classification work.
 */
export function compositeScore(pdf: ParsedCatalogEntry, relias: ReliasCourse): CompositeBreakdown {
  // Local mutable copy; widened to readonly via the return type's
  // CompositeBreakdown['components'] when handed back.
  const components: Array<{
    dimension: 'title' | 'hours' | 'code';
    weight: number;
    score: number;
  }> = [
    { dimension: 'title', weight: WEIGHTS.title, score: titleSimilarity(pdf.title, relias.title) },
  ];
  if (pdf.hours !== null) {
    components.push({
      dimension: 'hours',
      weight: WEIGHTS.hours,
      score: hoursSimilarity(pdf.hours, relias.hours),
    });
  }
  if (pdf.reliasCode !== null) {
    components.push({
      dimension: 'code',
      weight: WEIGHTS.code,
      score: codeSimilarity(pdf.reliasCode, relias.code),
    });
  }
  const totalWeight = components.reduce((s, c) => s + c.weight, 0);
  const composite = components.reduce((s, c) => s + c.weight * c.score, 0) / totalWeight;
  return { composite, components, driftType: null };
}

/**
 * Classify a match's drift type from its composite breakdown plus the
 * raw inputs. Per sub-spec §3.6's `classifyDrift` pseudocode, with
 * audience removed and adapted to the components-array shape.
 *
 * Returns `'identical'` only when EVERY contributing dimension scored
 * exactly 1.0. Missing-data dimensions are not held against the match —
 * a row with no code that scores 1.0 on title and 1.0 on hours is
 * 'identical' even though the code dimension wasn't checked.
 */
export function classifyDrift(
  pdf: ParsedCatalogEntry,
  relias: ReliasCourse,
  breakdown: CompositeBreakdown,
): DriftType {
  const driftingDims = breakdown.components.filter((c) => c.score < 1.0);
  if (driftingDims.length === 0) return 'identical';

  if (driftingDims.length === 1) {
    const dim = driftingDims[0]!.dimension;
    if (dim === 'title') return 'title-only';
    if (dim === 'hours') return 'hours-only';
    if (dim === 'code') return 'code-only';
  }

  // Version-bump: both title and code drifted, AND the codes match the
  // `-V\d+` suffix pattern with different version numbers. Catches the
  // case where a course is reissued as "Foo V2" with a new title verb.
  const titleDrifted = driftingDims.some((c) => c.dimension === 'title');
  const codeDrifted = driftingDims.some((c) => c.dimension === 'code');
  if (
    titleDrifted &&
    codeDrifted &&
    pdf.reliasCode !== null &&
    isVersionBump(pdf.reliasCode, relias.code)
  ) {
    return 'version-bump';
  }

  return 'multi-field';
}

/**
 * Detect a `-V\d+` version-suffix difference between two codes. Both
 * codes must carry the suffix; the version numbers must differ.
 *
 * Example: `REL-BHC-0-FOO-V2` vs `REL-BHC-0-FOO-V3` → true.
 * Example: `REL-BHC-0-FOO` vs `REL-BHC-0-FOO-V2` → false (only one has
 * the suffix; treat as title/code drift rather than versioning).
 */
function isVersionBump(a: string, b: string): boolean {
  const re = /-V(\d+)$/i;
  const ma = re.exec(a);
  const mb = re.exec(b);
  return ma !== null && mb !== null && ma[1] !== mb[1];
}
