import { describe, expect, it } from 'vitest';

import { DocxCatalogParser } from './docx-parser.js';
import { PdfCatalogParser } from './pdf-parser.js';
import { parseCatalogText } from './extract-from-text.js';

/**
 * PDF and DOCX parsers depend on Marty's regex in {@link parseCatalogText}
 * (🎓 F4 paired work). These tests assert the parser shells exist and route
 * correctly, plus the placeholder behavior of `parseCatalogText` so that
 * the failure mode is loud rather than silent.
 *
 * Once `parseCatalogText` is implemented, add fixture-based assertions for
 * actual PDF and DOCX inputs in additional tests below.
 */
describe('parseCatalogText (placeholder)', () => {
  it('returns [] for empty text', () => {
    expect(parseCatalogText('')).toEqual([]);
  });

  it('throws on any non-empty text until Marty implements the regex', () => {
    expect(() => parseCatalogText('title row\nREL-CCP-BA 1.0')).toThrow(/not yet implemented/);
  });
});

describe('PdfCatalogParser shell', () => {
  const parser = new PdfCatalogParser();
  it('exposes format="pdf"', () => {
    expect(parser.format).toBe('pdf');
  });
});

describe('DocxCatalogParser shell', () => {
  const parser = new DocxCatalogParser();
  it('exposes format="docx"', () => {
    expect(parser.format).toBe('docx');
  });
});
