/**
 * Relias course-code parser.
 *
 * Per `docs/specs/f4-reconciliation-algorithm.md §3.5`. Most Relias codes
 * have shape `REL-<category>-<modifier>-<suffix>` where:
 *   - `REL` is the vendor prefix
 *   - `<category>` is the content area (`BHC`, `PSC`, `PS`, `ALL`, `PAC`, …)
 *   - `<modifier>` is `0`, `SS` (supervisory skills), `CFISA`, etc.
 *   - `<suffix>` is the course identifier (`BUMATM`, `ANAE`, …)
 *
 * Special cases (handled in the fall-through branch):
 *   - `AOIC-001` (custom AOIC course; only two segments)
 *   - `APPA-UIDA-G` (vendor course; three segments)
 *   - `COPE-ShieldofCare` (special COPE course; two segments, no hyphens in suffix)
 *
 * The parser is intentionally permissive — anything outside the expected
 * shapes still parses (suffix carries whatever was left). The downstream
 * `codeSimilarity` function judges meaning; this layer just splits.
 */

export interface ParsedCode {
  /** First segment: 'REL', 'AOIC', 'APPA', 'COPE', or '' if input was empty. */
  prefix: string;
  /** Second segment for REL-prefixed codes; second segment otherwise. */
  category: string;
  /** Third segment for REL-prefixed codes only; '' for other shapes. */
  modifier: string;
  /** Everything after the structured segments, hyphen-joined. */
  suffix: string;
  /** The original input, preserved for round-tripping into reports. */
  raw: string;
}

export function parseCode(code: string): ParsedCode {
  const trimmed = code.trim();
  if (trimmed === '') {
    return { prefix: '', category: '', modifier: '', suffix: '', raw: code };
  }

  const parts = trimmed.split('-');

  if (parts.length >= 4 && parts[0] === 'REL') {
    return {
      prefix: 'REL',
      category: parts[1]!,
      modifier: parts[2]!,
      suffix: parts.slice(3).join('-'),
      raw: code,
    };
  }

  // Fall-through: non-REL codes (AOIC-001, APPA-UIDA-G, COPE-ShieldofCare)
  // or REL codes with fewer than 4 segments (rare; treat as malformed but
  // don't throw).
  return {
    prefix: parts[0] ?? '',
    category: parts[1] ?? '',
    modifier: '',
    suffix: parts.slice(2).join('-'),
    raw: code,
  };
}
