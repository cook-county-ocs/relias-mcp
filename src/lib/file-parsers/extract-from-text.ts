import type { ParsedCatalogEntry } from '../types.js';

/**
 * Extract `ParsedCatalogEntry` rows from the plain-text output of pdf-parse
 * or mammoth (PDF and DOCX parsers both delegate here).
 *
 * Per `docs/specs/f4-reconciliation-algorithm.md §6 F4 > Parsers > PDF` and
 * the implementation plan §3.6 (regex folded into PR-2b with vigorous
 * tests). The 🎓 marker is preserved by Marty owning the design judgment:
 * the anchor-on-code strategy, the row boundary handling, and the audience-
 * capture-but-don't-interpret decision were all his calls during paired
 * work on 2026-05-28.
 *
 * ## Strategy
 *
 * Anchor on the **course code**, not on row boundaries. The code is the most
 * distinctive token in the text and survives every multi-line / no-separator
 * edge case. For each code match we walk backward to extract the title
 * (everything since the previous code's audience tokens ended) and forward
 * to extract hours + audience marks (everything before the next code begins).
 *
 * Why not anchor on rows: the TY25 PDF has at least three row shapes that
 * defeat a line-based regex:
 *  - Tab-separated (`title \t code \t hours \t X \t X`) — the easy case.
 *  - Title runs into code with no separator (`Managing Inmates... DisabilitiesREL-PS-0-MIJRAD`)
 *    — happens when the title is long enough to wrap and pdf-parse merges
 *    the wrap into the code line.
 *  - Title spans a newline before the code (`Using Cognitive-Based Communication
 *    Skills with Individuals on Supervision\nREL-PSC-0-CBCSICS \t2.25 \tX`)
 *    — happens when the title visually wraps in the rendered PDF.
 *
 * The code-anchor strategy handles all three uniformly.
 *
 * ## Audience handling (v1.0 vs v1.1)
 *
 * Implementation plan §3.1 deferred audience signal to v1.1. The PDF carries
 * X-marks in columns the text extractor can't reliably disambiguate (the
 * "Probation | Detention Management" header has only one tab between
 * "Detention" and "Management", suggesting they share a display column).
 * v1.0 captures the post-hours token sequence into `raw.audienceTokens` and
 * `raw.audienceXCount` without interpreting them. When audience extraction
 * comes back in v1.1, the raw fields are already there.
 *
 * ## Recognized code shapes
 *
 *  - `REL-<CATEGORY>-<MODIFIER>-<SUFFIX>` (e.g. `REL-BHC-0-BUMATM`, `REL-ALL-SS-BLST-V2`)
 *  - `APPA-<SUFFIX>` (e.g. `APPA-UIDA-G`)
 *  - `AOIC-<SUFFIX>` (e.g. `AOIC-001`)
 *  - `COPE-<SUFFIX>` (e.g. `COPE-ShieldofCare`)
 *
 * Anything outside these shapes is treated as part of the title (or skipped
 * if no code appears in the document at all).
 *
 * ## Skipped lines
 *
 * Page headers (`COPE Approved Relias (Virtual) Trainings`, the column
 * header row) and page footers (`-- N of N --`) are stripped before the
 * code search so they don't pollute titles or generate phantom rows.
 */

/**
 * Code-recognition regex. Tight by design — broader patterns would let
 * title text masquerade as codes. Each prefix has its own permitted
 * character set after the dash.
 *
 * - REL: prefix + 2-4 dash-separated segments. The segments use uppercase
 *   letters, digits, and dashes; the suffix may contain a `-V\d+` version tag.
 * - APPA: prefix + uppercase letters + optional further dash-separated tokens.
 * - AOIC: prefix + digits.
 * - COPE: prefix + mixed-case word (no dashes inside the suffix observed
 *   in real data; `COPE-ShieldofCare` is one token).
 */
// Note: no leading `\b`. Titles in the TY25 PDF sometimes flow directly
// into the code with no separator (e.g. "DisabilitiesREL-PS-0-MIJRAD"),
// and `\b` requires a word/non-word transition — between `s` and `R` (both
// word chars) it never fires. We rely on the prefix's distinctive shape
// (capital REL/APPA/AOIC/COPE + dash) to avoid false positives. Trailing
// `\b` keeps the match from absorbing adjacent title text.
const CODE_RE =
  /(?:REL-[A-Z]+-(?:[A-Z]+|[0-9]+|SS)-[A-Z0-9]+(?:-[A-Z0-9]+)*|APPA-[A-Z]+(?:-[A-Z]+)*|AOIC-\d+|COPE-[A-Za-z]+)\b/g;

const PAGE_HEADER_RE = /^COPE Approved Relias.*$|^Title\s+Relias Code.*$/gm;
const PAGE_FOOTER_RE = /^\s*--\s*\d+\s+of\s+\d+\s*--\s*$/gm;

/**
 * Match the structured tail after a code: whitespace, hours number, then
 * zero or more whitespace-separated `X` marks. Anchored to start of input
 * because we always call it on the slice immediately after a code match.
 * The full match (`m[0]`) length tells us where this row ends in the
 * source text, which is where the next row's title begins.
 */
const ROW_TAIL_RE = /^\s*([0-9]+(?:\.[0-9]+)?)((?:\s+[xX])*)/;

/**
 * Parse a plain-text catalog dump (PDF or DOCX) into normalized entries.
 *
 * Returns `[]` for empty input (a clean parse of nothing is nothing).
 * Throws for inputs that contain no recognized codes at all — that's an
 * indicator the source isn't a catalog we know how to read, and silent
 * empty output would mask a parser bug.
 */
export function parseCatalogText(text: string): ParsedCatalogEntry[] {
  if (text.length === 0) return [];

  // Strip page boilerplate so it can't be slurped into title text. Replace
  // with newlines so row boundaries stay sane.
  const clean = text.replace(PAGE_HEADER_RE, '\n').replace(PAGE_FOOTER_RE, '\n');

  const codeMatches = [...clean.matchAll(CODE_RE)];

  if (codeMatches.length === 0) {
    throw new Error(
      'parseCatalogText: no recognized course codes (REL-/APPA-/AOIC-/COPE-) ' +
        'found in the input text. This usually means the source file is not ' +
        'a Relias COPE catalog. First 200 chars of input: ' +
        JSON.stringify(text.slice(0, 200)),
    );
  }

  const entries: ParsedCatalogEntry[] = [];
  let titleStart = 0;

  for (let i = 0; i < codeMatches.length; i += 1) {
    const match = codeMatches[i]!;
    const code = match[0];
    const codeStart = match.index!;
    const codeEnd = codeStart + code.length;

    // Title segment: everything from end-of-previous-row to start-of-this-code.
    const titleSegment = clean.slice(titleStart, codeStart);
    const title = collapseWhitespace(titleSegment);

    // Tail bounded by the NEXT code's start (or end of text) as the
    // outer limit, but parse only the structured "hours + X marks" prefix
    // so we know exactly where THIS row ends and the next title begins.
    const outerEnd = i + 1 < codeMatches.length ? codeMatches[i + 1]!.index! : clean.length;
    const outerTail = clean.slice(codeEnd, outerEnd);
    const tailMatch = ROW_TAIL_RE.exec(outerTail);

    const hours = tailMatch ? parseHours(tailMatch[1]!) : null;
    const audienceTokens = tailMatch ? extractAudienceTokens(tailMatch[2]!) : [];
    // Where this row's structured data ends in the source text. Anything
    // after this and before the next code is the NEXT row's title.
    const rowEndInSource = tailMatch ? codeEnd + tailMatch[0].length : codeEnd;

    entries.push({
      title,
      reliasCode: code,
      hours,
      raw: {
        code,
        hoursRaw: tailMatch ? tailMatch[1]! : null,
        audienceTokens,
        audienceXCount: audienceTokens.length,
        rawSegment: clean.slice(titleStart, rowEndInSource).trim(),
      },
    });

    titleStart = rowEndInSource;
  }

  // Defensive: drop entries with empty titles (shouldn't happen with the
  // code-anchor strategy on a real catalog, but guards against the
  // first-code-with-no-preceding-text edge case).
  return entries.filter((e) => e.title.length > 0);
}

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function parseHours(raw: string): number | null {
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

function extractAudienceTokens(xSequence: string): string[] {
  // ROW_TAIL_RE's second capture group is `(?:\s+[xX])*` — a sequence of
  // whitespace-then-X tokens. Split on whitespace and keep only the X's.
  return xSequence
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => /^x$/i.test(t))
    .map((t) => t.toUpperCase());
}
