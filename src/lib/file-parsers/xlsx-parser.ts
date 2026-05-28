import ExcelJS from 'exceljs';

import type { FileParser, ParsedCatalogEntry } from '../types.js';

/**
 * Header keywords mapped to {@link ParsedCatalogEntry} fields. Case-insensitive
 * match — coordinators capitalize column headers however they feel.
 *
 * Heuristic: a header matches a target if the header string contains the
 * keyword. So "Course Title" matches title; "Relias Code" and "Course Code"
 * both match reliasCode; "CE Hours" matches hours. Adding aliases is a one-line
 * change here.
 */
const TITLE_KEYWORDS = ['title', 'course name', 'name'] as const;
const CODE_KEYWORDS = ['relias code', 'course code', 'code'] as const;
const HOURS_KEYWORDS = ['hours', 'ce hours', 'credit'] as const;

/**
 * XLSX parser — reads the first worksheet, identifies header columns by
 * keyword match, and emits one {@link ParsedCatalogEntry} per data row.
 *
 * Why exceljs instead of SheetJS / xlsx: the npm `xlsx@0.18.5` ships with
 * two open high-severity advisories (prototype pollution + ReDoS) and the
 * fix is only on SheetJS's CDN, not npm. The threat model for those CVEs
 * (attacker-controlled input) doesn't strictly apply here — files come
 * from AOIC, a trusted source — but switching to exceljs avoids ongoing
 * `npm audit` noise without changing the input contract.
 *
 * exceljs itself depends on a uuid version with a moderate-severity bounds-
 * check advisory; the vulnerable code path requires passing a `buf` to
 * `uuid.v4`, which the parser never does. Documented here so a future
 * audit pass doesn't re-debate it.
 */
export class XlsxCatalogParser implements FileParser {
  readonly format = 'xlsx' as const;

  async parse(buffer: Buffer): Promise<ParsedCatalogEntry[]> {
    const workbook = new ExcelJS.Workbook();
    // exceljs accepts Node Buffer when typed as ArrayBuffer-compatible.
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) return [];

    const headerRow = sheet.getRow(1);
    const cols = mapHeaderColumns(headerRow);
    if (cols.titleCol === null) {
      throw new Error(
        `xlsx parser: could not find a title-like column in headers ` +
          `(${TITLE_KEYWORDS.join('/')}); first row was: ` +
          `${JSON.stringify(rowToStrings(headerRow))}`,
      );
    }

    const entries: ParsedCatalogEntry[] = [];
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return; // header
      const title = cellString(row, cols.titleCol!);
      if (title === '') return; // skip blank rows
      const reliasCode = cols.codeCol !== null ? cellString(row, cols.codeCol) || null : null;
      const hours = cols.hoursCol !== null ? cellNumber(row, cols.hoursCol) : null;
      entries.push({
        title,
        reliasCode,
        hours,
        raw: { sheet: sheet.name, rowNumber, cells: rowToStrings(row) },
      });
    });
    return entries;
  }
}

interface ColumnMap {
  titleCol: number | null;
  codeCol: number | null;
  hoursCol: number | null;
}

function mapHeaderColumns(headerRow: ExcelJS.Row): ColumnMap {
  const map: ColumnMap = { titleCol: null, codeCol: null, hoursCol: null };
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const lower = String(cell.value ?? '')
      .trim()
      .toLowerCase();
    if (lower === '') return;
    if (map.titleCol === null && TITLE_KEYWORDS.some((kw) => lower.includes(kw))) {
      map.titleCol = colNumber;
    } else if (map.codeCol === null && CODE_KEYWORDS.some((kw) => lower.includes(kw))) {
      map.codeCol = colNumber;
    } else if (map.hoursCol === null && HOURS_KEYWORDS.some((kw) => lower.includes(kw))) {
      map.hoursCol = colNumber;
    }
  });
  return map;
}

function cellString(row: ExcelJS.Row, col: number): string {
  const v = row.getCell(col).value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object' && 'richText' in v) {
    return (v as { richText: Array<{ text: string }> }).richText
      .map((r) => r.text)
      .join('')
      .trim();
  }
  return String(v).trim();
}

function cellNumber(row: ExcelJS.Row, col: number): number | null {
  const v = row.getCell(col).value;
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function rowToStrings(row: ExcelJS.Row): Record<number, string> {
  const out: Record<number, string> = {};
  row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    out[colNumber] = cellString(row, colNumber);
  });
  return out;
}
