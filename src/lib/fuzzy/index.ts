/**
 * Public surface of the fuzzy-matching primitives used by the F4
 * reconciliation engine. These are pure functions — no I/O, no allocations
 * beyond what the algorithms inherently need. Combined into higher-level
 * similarity helpers (titleSimilarity, codeSimilarity) in
 * `src/lib/reconciliation/` (PR-2b).
 */

export { normalize } from './normalize.js';
export { levenshteinDistance, levenshteinRatio } from './levenshtein.js';
export { jaro, jaroWinkler } from './jaro-winkler.js';
export { tokenSetRatio } from './token-set-ratio.js';
export { parseCode, type ParsedCode } from './code-parser.js';
