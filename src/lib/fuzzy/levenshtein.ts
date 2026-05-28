/**
 * Levenshtein edit-distance — the smallest number of single-character
 * insertions, deletions, or substitutions needed to transform `a` into `b`.
 *
 * Used by {@link levenshteinRatio} (the [0,1] similarity score consumed by
 * the token-set-ratio + code-similarity helpers) and as a primitive that
 * Jaro-Winkler does NOT depend on (Jaro counts matches and transpositions
 * differently — see jaro-winkler.ts).
 *
 * Implementation: classic two-row dynamic programming. O(|a|·|b|) time,
 * O(min(|a|,|b|)) space. Reference: Levenshtein 1965; the two-row trick is
 * standard textbook. Pure function — no allocations beyond two rows.
 */

export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Make `a` the shorter string so the working rows are minimum size.
  if (a.length > b.length) [a, b] = [b, a];

  let prev = new Array<number>(a.length + 1);
  let curr = new Array<number>(a.length + 1);
  for (let i = 0; i <= a.length; i += 1) prev[i] = i;

  for (let j = 1; j <= b.length; j += 1) {
    curr[0] = j;
    for (let i = 1; i <= a.length; i += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[i] = Math.min(
        curr[i - 1]! + 1, // insertion
        prev[i]! + 1, // deletion
        prev[i - 1]! + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[a.length]!;
}

/**
 * Normalized Levenshtein similarity in [0, 1]. 1.0 means identical;
 * 0.0 means every character had to change.
 *
 * Formula: `1 - distance / max(|a|, |b|)`. Two empty strings are defined
 * as identical (1.0); the sub-spec doesn't address this case explicitly
 * but it's the only consistent extension (the limit as both lengths
 * approach 0).
 */
export function levenshteinRatio(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1.0;
  const maxLen = Math.max(a.length, b.length);
  return 1 - levenshteinDistance(a, b) / maxLen;
}
