import ExcelJS from 'exceljs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { XlsxCatalogParser } from './xlsx-parser.js';

const parser = new XlsxCatalogParser();

async function makeXlsx(
  headerRow: string[],
  dataRows: Array<Array<string | number | null>>,
  sheetName = 'Catalog',
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  ws.addRow(headerRow);
  for (const row of dataRows) ws.addRow(row);
  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as ArrayBuffer);
}

describe('XlsxCatalogParser', () => {
  let buf: Buffer;
  beforeEach(() => {
    buf = Buffer.alloc(0);
  });
  afterEach(() => {
    // sanity, makes the variable used so eslint doesn't complain
    void buf;
  });

  it('parses a worksheet with title/code/hours headers', async () => {
    const xlsx = await makeXlsx(
      ['Title', 'Relias Code', 'Hours'],
      [
        ['Behavioral Analysis', 'REL-CCP-BA', 1],
        ['Role Clarification', 'REL-CCP-RC', 0.5],
      ],
    );
    const entries = await parser.parse(xlsx);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      title: 'Behavioral Analysis',
      reliasCode: 'REL-CCP-BA',
      hours: 1,
    });
    expect(entries[1]!.hours).toBe(0.5);
  });

  it('matches headers case-insensitively and tolerates alternative wording', async () => {
    const xlsx = await makeXlsx(
      ['COURSE NAME', 'course code', 'CE Hours'],
      [['Structured Office Visit', 'REL-CCP-SOV', 1.25]],
    );
    const entries = await parser.parse(xlsx);
    expect(entries[0]).toMatchObject({
      title: 'Structured Office Visit',
      reliasCode: 'REL-CCP-SOV',
      hours: 1.25,
    });
  });

  it('returns null for missing optional code/hours columns', async () => {
    const xlsx = await makeXlsx(['Title'], [['Just a Title']]);
    const entries = await parser.parse(xlsx);
    expect(entries[0]).toMatchObject({
      title: 'Just a Title',
      reliasCode: null,
      hours: null,
    });
  });

  it('skips data rows with blank title', async () => {
    const xlsx = await makeXlsx(
      ['Title', 'Code'],
      [
        ['Alpha', 'A'],
        ['', 'B'],
        ['Gamma', 'G'],
      ],
    );
    const entries = await parser.parse(xlsx);
    expect(entries.map((e) => e.title)).toEqual(['Alpha', 'Gamma']);
  });

  it('throws when no title-like column exists', async () => {
    const xlsx = await makeXlsx(['Code', 'Hours'], [['REL-X', 1]]);
    await expect(parser.parse(xlsx)).rejects.toThrow(/title-like column/);
  });

  it('preserves the source row in `raw` for debugging (sheet name + row number + cells)', async () => {
    const xlsx = await makeXlsx(['Title', 'Code'], [['Alpha', 'A']], 'MySheet');
    const entries = await parser.parse(xlsx);
    expect(entries[0]!.raw).toMatchObject({
      sheet: 'MySheet',
      rowNumber: 2,
    });
  });

  it('returns [] for a workbook with no worksheets', async () => {
    const wb = new ExcelJS.Workbook();
    const buffer = Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
    const entries = await parser.parse(buffer);
    expect(entries).toEqual([]);
  });

  it('handles hours stored as text by coercing to number', async () => {
    const xlsx = await makeXlsx(
      ['Title', 'Hours'],
      [
        ['A', '1.5'],
        ['B', 'oops'],
      ],
    );
    const entries = await parser.parse(xlsx);
    expect(entries[0]!.hours).toBe(1.5);
    expect(entries[1]!.hours).toBeNull();
  });

  it('exposes format="xlsx"', () => {
    expect(parser.format).toBe('xlsx');
  });
});
