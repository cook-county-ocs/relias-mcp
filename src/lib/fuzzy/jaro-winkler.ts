/**
 * Jaro and Jaro-Winkler string similarity.
 *
 * Per `docs/specs/f4-reconciliation-algorithm.md §3.2`. Both functions
 * return a similarity in [0, 1] where 1.0 is identical and 0.0 is "no
 * common characters within the matching window."
 *
 * **Jaro distance** counts (a) matching characters within a window of
 * `max(|a|, |b|) / 2 - 1` and (b) transpositions among those matches,
 * then combines with the standard formula.
 *
 * **Jaro-Winkler** adds a common-prefix bonus: matches that share a
 * prefix (up to 4 chars) get scaled toward 1.0 by `prefix × 0.1 × (1 - jaro)`.
 * The bonus only applies when `jaro >= 0.7` to avoid rewarding weak matches.
 *
 * References:
 *  - Jaro 1989, "Advances in record-linkage methodology"
 *  - Winkler 1990, "String Comparator Metrics and Enhanced Decision Rules"
 *  - Wikipedia: Jaro–Winkler distance (matches the formulas here)
 *
 * Implementation note: the matching-window algorithm is O(|a|·|b|) in the
 * worst case but in practice is much faster because of the window cap.
 * For the F4 catalog scale (~10–60 char titles, ~300 courses) the perf
 * is negligible.
 */

/**
 * Standard Jaro distance. Returns 1.0 for identical strings, 0.0 when no
 * characters match within the window.
 */
export function jaro(a: string, b: string): number {
  // Empty-check FIRST: two empty strings are not similar in the Jaro
  // sense (the formula divides by `matches` which would be 0).
  if (a.length === 0 || b.length === 0) return 0.0;
  if (a === b) return 1.0;

  const matchWindow = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatches = new Array<boolean>(a.length).fill(false);
  const bMatches = new Array<boolean>(b.length).fill(false);

  let matches = 0;
  for (let i = 0; i < a.length; i += 1) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, b.length);
    for (let j = start; j < end; j += 1) {
      if (bMatches[j]) continue;
      if (a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches += 1;
      break;
    }
  }

  if (matches === 0) return 0.0;

  // Count transpositions: walk both matched-character sequences in order,
  // count positions where they differ. Each mismatch is half a transposition
  // (per the standard formula).
  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k += 1;
    if (a[i] !== b[k]) transpositions += 1;
    k += 1;
  }
  transpositions /= 2;

  return (matches / a.length + matches / b.length + (matches - transpositions) / matches) / 3;
}

/**
 * Jaro-Winkler = Jaro + (prefix bonus) when Jaro >= 0.7.
 *
 * Prefix length is capped at 4 characters per Winkler's original paper.
 * The 0.1 scaling factor is Winkler's recommended default.
 */
export function jaroWinkler(a: string, b: string): number {
  const j = jaro(a, b);
  if (j < 0.7) return j;
  const prefix = commonPrefixLength(a, b, 4);
  return j + prefix * 0.1 * (1 - j);
}

function commonPrefixLength(a: string, b: string, max: number): number {
  const cap = Math.min(max, a.length, b.length);
  let n = 0;
  while (n < cap && a[n] === b[n]) n += 1;
  return n;
}
