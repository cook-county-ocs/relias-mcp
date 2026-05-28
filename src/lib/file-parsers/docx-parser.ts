import mammoth from 'mammoth';

import type { FileParser, ParsedCatalogEntry } from '../types.js';
import { parseCatalogText } from './extract-from-text.js';

/**
 * DOCX parser — uses mammoth to extract text, then defers to the shared
 * {@link parseCatalogText} for row extraction. Mechanical wrapper; the
 * intelligence lives in `extract-from-text.ts` (Marty's regex, paired
 * F4 work).
 *
 * mammoth's `extractRawText` discards formatting entirely — we treat the
 * DOCX as a text container only. If the AOIC distributes a DOCX where row
 * boundaries depend on table structure (not just newlines), this needs
 * to switch to `convertToHtml` and parse the HTML; surface that during the
 * paired regex work if the fixture demands it.
 */
export class DocxCatalogParser implements FileParser {
  readonly format = 'docx' as const;

  async parse(buffer: Buffer): Promise<ParsedCatalogEntry[]> {
    const { value: text } = await mammoth.extractRawText({ buffer });
    return parseCatalogText(text);
  }
}
