import { levenshteinRatio } from './levenshtein.js';

/**
 * Token-set ratio — the rapidfuzz-style similarity that catches word-shuffles
 * and unequal-token-count titles better than character-level Levenshtein alone.
 *
 * Per `docs/specs/f4-reconciliation-algorithm.md §3.2`. The composite
 * title-similarity takes `max(jaroWinkler, tokenSetRatio)` because each
 * algorithm has a failure mode the other catches:
 *
 *  - Jaro-Winkler misses word-shuffles ("a b c" vs "c b a" — same chars but
 *    out of order).
 *  - Token-set misses character-level typos ("benzodiazepines" vs
 *    "benzediazepines" — same tokens, different chars).
 *
 * Algorithm (the standard rapidfuzz formulation):
 *  1. Tokenize both inputs on whitespace; build sets.
 *  2. Compute three derived strings:
 *     - `intersection`: tokens present in both, sorted, space-joined.
 *     - `intersection + diffA`: intersection plus A-only tokens.
 *     - `intersection + diffB`: intersection plus B-only tokens.
 *  3. Return `max(ratio(int, int+A), ratio(int, int+B), ratio(int+A, int+B))`
 *     where `ratio = levenshteinRatio`.
 *
 * The three-way max means: if A's extra tokens look similar to B's extra
 * tokens (different surface, same intent), the ratio still scores high.
 */
export function tokenSetRatio(a: string, b: string): number {
  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));

  if (setA.size === 0 && setB.size === 0) return 1.0;
  if (setA.size === 0 || setB.size === 0) return 0.0;

  const intersection = sortedJoin(setIntersect(setA, setB));
  const diffA = sortedJoin(setDifference(setA, setB));
  const diffB = sortedJoin(setDifference(setB, setA));

  const s1 = intersection;
  const s2a = (intersection + ' ' + diffA).trim();
  const s2b = (intersection + ' ' + diffB).trim();

  return Math.max(levenshteinRatio(s1, s2a), levenshteinRatio(s1, s2b), levenshteinRatio(s2a, s2b));
}

function tokenize(s: string): string[] {
  return s.split(/\s+/).filter((t) => t.length > 0);
}

function sortedJoin(tokens: Iterable<string>): string {
  return [...tokens].sort().join(' ');
}

function setIntersect(a: Set<string>, b: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const t of a) if (b.has(t)) out.add(t);
  return out;
}

function setDifference(a: Set<string>, b: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const t of a) if (!b.has(t)) out.add(t);
  return out;
}
