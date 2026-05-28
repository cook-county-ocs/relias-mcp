import type { ParsedCatalogEntry, ReliasCourse } from '../types.js';

import type { CompositeBreakdown, DriftType } from './composite-score.js';

/**
 * Reconciliation result types — what `reconcile()` produces and what F5
 * (CLI) and F6 (MCP) render to markdown / JSON.
 *
 * Surfaced through `src/lib/index.ts` for downstream consumers. Designed
 * to be renderable without engine code (the renderer reads the
 * structures, doesn't recompute anything).
 */

/** How a match was made — surfaces in the report for human review. */
export type MatchType = 'exact-code' | 'fuzzy';

/** One entry in `ReconciliationResult.inBoth`. */
export interface BothMatch {
  pdf: ParsedCatalogEntry;
  relias: ReliasCourse;
  /** Composite similarity score in `[0, 1]`. `1.0` for exact-code matches. */
  composite: number;
  /** How the two were matched. */
  matchType: MatchType;
  /** What's different between them (`'identical'` when nothing). */
  driftType: DriftType;
  /** Other Relias candidates that scored above the drift threshold but lost. Only meaningful on fuzzy matches. */
  alternates: AlternateCandidate[];
  /** Per-dimension breakdown when fuzzy. Omitted on exact-code matches (the breakdown would always be all-1.0). */
  breakdown?: CompositeBreakdown;
}

/** One entry in `ReconciliationResult.driftCatalog`. */
export interface DriftEntry {
  pdf: ParsedCatalogEntry;
  relias: ReliasCourse;
  composite: number;
  confidence: 'medium';
  breakdown: CompositeBreakdown;
  alternates: AlternateCandidate[];
}

/** A near-miss candidate retained for human review. */
export interface AlternateCandidate {
  relias: ReliasCourse;
  composite: number;
}

/** What `reconcile()` returns. */
export interface ReconciliationResult {
  inBoth: BothMatch[];
  fileOnly: ParsedCatalogEntry[];
  reliasOnly: ReliasCourse[];
  driftCatalog: DriftEntry[];
  summary: ReconciliationSummary;
}

export interface ReconciliationSummary {
  /** Total PDF entries in the input. */
  fileTotal: number;
  /** Total Relias courses in the snapshot. */
  reliasTotal: number;
  /** PDF entries matched via exact code lookup. */
  exactCodeMatches: number;
  /** PDF entries matched via fuzzy scoring above the match threshold. */
  fuzzyMatches: number;
  /** PDF entries that scored in the drift band (0.70–0.85) on their best Relias candidate. */
  driftCatalogCount: number;
  /** PDF entries with no Relias candidate above the drift threshold. */
  fileOnlyCount: number;
  /** Relias courses unclaimed by any PDF entry. */
  reliasOnlyCount: number;
}
