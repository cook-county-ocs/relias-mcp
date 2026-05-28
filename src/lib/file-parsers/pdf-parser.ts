import type { FileParser, ParsedCatalogEntry } from '../types.js';
import { parseCatalogText } from './extract-from-text.js';

/**
 * PDF parser scaffold (F4 🎓 — paired work pending).
 *
 * Status: the parser shell is in place — extension routing, the FileParser
 * shape, and the text extraction step (`pdf-parse`). The row-extraction
 * regex lives in {@link parseCatalogText}, which Marty implements during
 * the paired F4 reconciliation session.
 *
 * When Marty implements `parseCatalogText`, this parser becomes functional
 * with no further changes here — the regex is the only part-specific to
 * the TY25 AOIC catalog shape; the pdf-parse → text → entries pipeline is
 * mechanical.
 */
export class PdfCatalogParser implements FileParser {
  readonly format = 'pdf' as const;

  async parse(buffer: Buffer): Promise<ParsedCatalogEntry[]> {
    // pdf-parse 2.x exposes a class-based API; constructor takes the buffer
    // (auto-converts to Uint8Array), `getText()` returns a result with a
    // concatenated `text` field across all pages.
    const { PDFParse } = await import('pdf-parse');
    const doc = new PDFParse({ data: buffer });
    try {
      const result = await doc.getText();
      return parseCatalogText(result.text);
    } finally {
      await doc.destroy();
    }
  }
}
