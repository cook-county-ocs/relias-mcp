import type { ParsedCatalogEntry } from '../types.js';

/**
 * Shared text-to-entries extractor for the PDF and DOCX parsers.
 *
 * Why shared: both source formats reduce to plain text early — pdf-parse for
 * PDFs, mammoth for DOCX. Once we have text, the row-extraction regex is the
 * same. Marty owns this regex (🎓 in F4) because it's the part of F4 that
 * encodes business-meaningful knowledge of the TY25 AOIC catalog shape
 * (title + code + hours + X-marks). The parsers are mechanical; this is the
 * judgment call.
 *
 * Implementation pattern Marty intends to use (TBD during paired work):
 *  - Scan line-by-line.
 *  - Recognize a row by the presence of a Relias code (`REL-...`) OR by a
 *    numeric hours value at a known column position.
 *  - Build a `ParsedCatalogEntry` per recognized row.
 *  - Tolerate header/footer junk between rows.
 *
 * Until Marty implements, this throws — better a loud failure than a silent
 * empty array masquerading as "no catalog entries found."
 */
export function parseCatalogText(text: string): ParsedCatalogEntry[] {
  // TODO(F4 🎓 — Marty): implement the row-extraction regex against the TY25
  // catalog shape. The text input here is whatever pdf-parse/mammoth produced.
  // See spec §6 F4 "Parsers > PDF" for the contract.
  if (text.length === 0) return [];
  throw new Error('parseCatalogText: not yet implemented — Marty owns this regex per F4 🎓');
}
