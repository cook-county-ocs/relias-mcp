import { extname } from 'node:path';

import type { FileParser } from '../types.js';

import { CsvCatalogParser } from './csv-parser.js';
import { DocxCatalogParser } from './docx-parser.js';
import { PdfCatalogParser } from './pdf-parser.js';
import { XlsxCatalogParser } from './xlsx-parser.js';

/**
 * Thrown when {@link parserForExtension} can't route a file extension to a
 * parser. Carries the exit code (3) that the F5 CLI maps to "unsupported
 * format" per spec §6 F4. Named so consumers can `instanceof`-check it
 * instead of regex-matching the message.
 */
export class UnsupportedFileFormatError extends Error {
  readonly exitCode = 3 as const;
  constructor(
    message: string,
    readonly extension: string,
  ) {
    super(message);
    this.name = 'UnsupportedFileFormatError';
  }
}

const SUPPORTED = ['.pdf', '.xlsx', '.csv', '.docx'] as const;
type SupportedExt = (typeof SUPPORTED)[number];

/**
 * Pick the right {@link FileParser} for a given file path. Routing is
 * extension-only (lower-cased); no content sniffing. The set of supported
 * extensions matches v1.0 spec §6 F4. Add new parsers by:
 *  1. Implement the parser in a sibling file.
 *  2. Add its extension to {@link SUPPORTED}.
 *  3. Add a case in the switch.
 *  4. Add a test in `index.test.ts` asserting the routing.
 */
export function parserForExtension(filePathOrExt: string): FileParser {
  const ext = normalizeExt(filePathOrExt);
  switch (ext) {
    case '.pdf':
      return new PdfCatalogParser();
    case '.xlsx':
      return new XlsxCatalogParser();
    case '.csv':
      return new CsvCatalogParser();
    case '.docx':
      return new DocxCatalogParser();
    default:
      throw new UnsupportedFileFormatError(
        `unsupported file extension '${ext}' — supported: ${SUPPORTED.join(', ')}`,
        ext,
      );
  }
}

function normalizeExt(filePathOrExt: string): SupportedExt | string {
  // Accept either a full path ("/tmp/foo.PDF") or a bare extension
  // (".pdf" / "pdf"). The bare-extension case can't go through Node's
  // `extname` because `extname(".pdf")` returns '' (treated as a dotfile,
  // not a file with extension).
  const trimmed = filePathOrExt.trim();
  if (trimmed === '') return '';
  const hasPathSep = trimmed.includes('/') || trimmed.includes('\\');
  if (!hasPathSep) {
    const noLeadingDot = trimmed.startsWith('.') ? trimmed.slice(1) : trimmed;
    if (!noLeadingDot.includes('.')) {
      // Bare extension like "pdf", "PDF", ".csv".
      return `.${noLeadingDot.toLowerCase()}`;
    }
  }
  return extname(trimmed).toLowerCase();
}

export { PdfCatalogParser } from './pdf-parser.js';
export { XlsxCatalogParser } from './xlsx-parser.js';
export { CsvCatalogParser } from './csv-parser.js';
export { DocxCatalogParser } from './docx-parser.js';
export { parseCatalogText } from './extract-from-text.js';
