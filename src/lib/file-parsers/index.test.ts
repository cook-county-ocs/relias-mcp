import { describe, expect, it } from 'vitest';

import {
  CsvCatalogParser,
  DocxCatalogParser,
  PdfCatalogParser,
  UnsupportedFileFormatError,
  XlsxCatalogParser,
  parserForExtension,
} from './index.js';

describe('parserForExtension', () => {
  it.each([
    ['/tmp/cope-catalog.pdf', PdfCatalogParser],
    ['/tmp/cope-catalog.xlsx', XlsxCatalogParser],
    ['/tmp/cope-catalog.csv', CsvCatalogParser],
    ['/tmp/cope-catalog.docx', DocxCatalogParser],
  ] as const)('routes %s to the right parser', (path, expected) => {
    const parser = parserForExtension(path);
    expect(parser).toBeInstanceOf(expected);
  });

  it('is case-insensitive on the extension', () => {
    expect(parserForExtension('FOO.PDF')).toBeInstanceOf(PdfCatalogParser);
    expect(parserForExtension('Bar.XlSx')).toBeInstanceOf(XlsxCatalogParser);
  });

  it('accepts a bare extension with or without leading dot', () => {
    expect(parserForExtension('csv')).toBeInstanceOf(CsvCatalogParser);
    expect(parserForExtension('.docx')).toBeInstanceOf(DocxCatalogParser);
  });

  it('throws UnsupportedFileFormatError with exitCode=3 on unknown extension', () => {
    expect(() => parserForExtension('/tmp/foo.txt')).toThrow(UnsupportedFileFormatError);
    try {
      parserForExtension('/tmp/foo.txt');
    } catch (err) {
      expect(err).toBeInstanceOf(UnsupportedFileFormatError);
      const e = err as UnsupportedFileFormatError;
      expect(e.exitCode).toBe(3);
      expect(e.extension).toBe('.txt');
      expect(e.message).toContain('.pdf');
    }
  });

  it('each returned parser exposes a `format` discriminator matching its extension', () => {
    expect(parserForExtension('.pdf').format).toBe('pdf');
    expect(parserForExtension('.xlsx').format).toBe('xlsx');
    expect(parserForExtension('.csv').format).toBe('csv');
    expect(parserForExtension('.docx').format).toBe('docx');
  });
});
