import { jaroWinkler } from '../fuzzy/jaro-winkler.js';
import { levenshteinRatio } from '../fuzzy/levenshtein.js';
import { normalize } from '../fuzzy/normalize.js';
import { parseCode } from '../fuzzy/code-parser.js';
import { tokenSetRatio } from '../fuzzy/token-set-ratio.js';

import { HOURS_BANDS } from './tunable.js';

/**
 * Per-dimension similarity helpers for the F4 composite score.
 *
 * Per `docs/specs/f4-reconciliation-algorithm.md §3.2–§3.5`. Each helper
 * returns a number in `[0, 1]`. They never see null inputs — the composite
 * scorer in `composite-score.ts` filters out dimensions where data is
 * missing on either side and renormalizes weights, per implementation
 * plan §3.2.
 *
 * `audienceSimilarity` is deliberately absent — audience extraction is
 * deferred to v1.1 (plan §3.1).
 */

/**
 * Title similarity = `max(jaroWinkler(normalized), tokenSetRatio(normalized))`.
 *
 * The max-of-two combination matters: Jaro-Winkler misses word-shuffles
 * (`"foo bar"` vs `"bar foo"` scores low because positions differ),
 * token-set-ratio misses char-level typos (`"benzodiazepines"` vs
 * `"benzediazepines"` scores low at the token level because the strings
 * are different). Each catches what the other misses.
 *
 * Normalization is applied to both inputs first so capitalization,
 * punctuation, abbreviation, and format-marker differences don't drive
 * the score.
 */
export function titleSimilarity(a: string, b: string): number {
  const aN = normalize(a);
  const bN = normalize(b);
  const jw = jaroWinkler(aN, bN);
  const tsr = tokenSetRatio(aN, bN);
  return Math.max(jw, tsr);
}

/**
 * Hours similarity — step-function bands per sub-spec §3.3 and
 * `tunable.ts` HOURS_BANDS. Tolerant by design — a 0.25h difference is
 * rounding noise, 1.0h is a known legitimate drift, larger means
 * probably a different course.
 *
 * Per implementation plan §3.2, null inputs are filtered at the composite
 * layer, not here — this helper assumes both args are real numbers.
 */
export function hoursSimilarity(a: number, b: number): number {
  const diff = Math.abs(a - b);
  for (const band of HOURS_BANDS) {
    if (diff <= band.maxDiff) return band.score;
  }
  return 0.0;
}

/**
 * Code similarity — parses both codes into prefix/category/modifier/suffix
 * segments and scores them per sub-spec §3.5.
 *
 * Rules:
 *  - Different prefix (REL vs AOIC) and neither prefix empty → 0.0 (the
 *    courses are from different code families and not comparable).
 *  - Otherwise: 0.7 * suffix-Levenshtein-ratio + 0.3 * category-match,
 *    where category-match is 1.0 if categories agree and 0.5 otherwise.
 *
 * Catches the `BUMATM → BUMATMS` pattern from Plan A discovery (same
 * prefix/category/modifier; one-char suffix drift).
 *
 * Per implementation plan §3.2, null inputs are filtered at the composite
 * layer — this helper assumes both args are real strings.
 */
export function codeSimilarity(a: string, b: string): number {
  const pa = parseCode(a);
  const pb = parseCode(b);
  if (pa.prefix !== pb.prefix && pa.prefix !== '' && pb.prefix !== '') return 0.0;
  const suffixSim = levenshteinRatio(pa.suffix.toLowerCase(), pb.suffix.toLowerCase());
  const categoryMatch = pa.category === pb.category ? 1.0 : 0.5;
  return 0.7 * suffixSim + 0.3 * categoryMatch;
}
