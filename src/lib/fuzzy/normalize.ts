/**
 * Canonical-form text normalizer for the F4 fuzzy matcher.
 *
 * Per `docs/specs/f4-reconciliation-algorithm.md §3.1`. The six-step pipeline
 * collapses superficial title differences (case, punctuation, abbreviation
 * variants, format-marker parentheticals, runs of whitespace) so the
 * downstream similarity functions can focus on real differences.
 *
 * Order matters — punctuation removal precedes abbreviation expansion so
 * that `"PT 1"` and `"Pt. 1"` both reach `"pt 1"` before being expanded to
 * `"part 1"`.
 */

interface AbbreviationRule {
  /** Regex that matches the abbreviation as a whole word. */
  readonly pattern: RegExp;
  readonly replacement: string;
}

const ABBREVIATIONS: ReadonlyArray<AbbreviationRule> = [
  // `pt` → `part` (covers "PREA Pt 1", "PT. 1", "pt 2"). The boundary
  // ensures we don't munge `parts`, `pottery`, etc. Applied AFTER
  // punctuation removal (so periods after "Pt." are already gone).
  { pattern: /\bpt\b/g, replacement: 'part' },
];

/**
 * Punctuation-form abbreviations applied BEFORE punctuation removal. These
 * contain characters (`&`, `/`) that the post-punctuation pass would strip
 * away, leaving the abbreviation unrecognizable. Order: `w/` first, then
 * `&`, in case some weird title combines them.
 */
const PUNCTUATION_ABBREVIATIONS: ReadonlyArray<AbbreviationRule> = [
  // `w/` → `with`
  { pattern: /\bw\/\s*/g, replacement: 'with ' },
  // `&` → `and` (with surrounding spaces collapsed)
  { pattern: /\s*&\s*/g, replacement: ' and ' },
];

/**
 * Parenthetical / suffix tags that mark format ("Self-Paced", "Refresher
 * Course") rather than content. Stripped so that
 * `"Communicating Effectively Self-Paced"` and `"Communicating Effectively"`
 * collapse to the same canonical form.
 *
 * Match is case-insensitive; the surrounding word boundaries are loose to
 * absorb hyphens, slashes, parens, and trailing whitespace.
 */
const FORMAT_TAGS: ReadonlyArray<RegExp> = [/\bself[\s-]?paced\b/gi, /\brefresher\s+course\b/gi];

export function normalize(text: string): string {
  if (text.length === 0) return '';

  let s = text;

  // 1. Strip format-marker tags BEFORE lowercasing so the regex flags handle
  //    case; they would still match after but flagging here makes the intent
  //    obvious.
  for (const tag of FORMAT_TAGS) s = s.replace(tag, ' ');

  // 2. Lowercase.
  s = s.toLowerCase();

  // 3. Expand punctuation-bearing abbreviations BEFORE punctuation removal
  //    (so `&` and `/` survive long enough to be recognized).
  for (const rule of PUNCTUATION_ABBREVIATIONS) s = s.replace(rule.pattern, rule.replacement);

  // 4. Remove punctuation except hyphens (kept inside compound words like
  //    "self-paced", though that case is already gone by step 1) and
  //    apostrophes inside words (kept for "don't", "won't").
  //    Strategy: replace any character that isn't a letter, digit, space,
  //    hyphen, or apostrophe with a space. Then trim apostrophes that
  //    aren't surrounded by letters on both sides (drops leading/trailing).
  s = s.replace(/[^a-z0-9\s\-']/g, ' ');
  s = s.replace(/(^|\s)'+/g, '$1').replace(/'+(\s|$)/g, '$1');

  // 5. Expand abbreviations after punctuation is gone (so the `\b` boundary
  //    sees normalized spacing).
  for (const rule of ABBREVIATIONS) s = s.replace(rule.pattern, rule.replacement);

  // 6. Collapse whitespace and trim.
  s = s.replace(/\s+/g, ' ').trim();

  return s;
}
