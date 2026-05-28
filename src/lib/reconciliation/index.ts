/**
 * Public surface of the F4 reconciliation engine.
 *
 * The engine takes a parsed catalog file (from the F4 file parsers) and
 * a Relias snapshot (from F3) and produces a four-bucket reconciliation
 * result (inBoth / fileOnly / reliasOnly / driftCatalog) per the
 * sub-spec at `docs/specs/f4-reconciliation-algorithm.md`.
 *
 * Consumers: F5 CLI (`relias-mcp reconcile <file>`) and F6 MCP tool
 * (`relias-reconcile-catalog`).
 */

export { reconcile } from './reconciliation-engine.js';
export {
  compositeScore,
  classifyDrift,
  type DriftType,
  type CompositeBreakdown,
} from './composite-score.js';
export { titleSimilarity, hoursSimilarity, codeSimilarity } from './similarity.js';
export type {
  ReconciliationResult,
  ReconciliationSummary,
  BothMatch,
  DriftEntry,
  AlternateCandidate,
  MatchType,
} from './types.js';
export { WEIGHTS, THRESHOLDS, HOURS_BANDS, MAX_ALTERNATES } from './tunable.js';
