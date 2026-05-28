import { describe, expect, it } from 'vitest';

import { DocxCatalogParser } from './docx-parser.js';
import { PdfCatalogParser } from './pdf-parser.js';
import { parseCatalogText } from './extract-from-text.js';

/**
 * PDF and DOCX parser shell tests. The actual `parseCatalogText` regex is
 * exercised in `extract-from-text.test.ts` (vigorously, per Marty's F4
 * PR-2b guidance). This file just verifies the parser shells.
 */
describe('parseCatalogText smoke', () => {
  it('returns [] for empty text', () => {
    expect(parseCatalogText('')).toEqual([]);
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
