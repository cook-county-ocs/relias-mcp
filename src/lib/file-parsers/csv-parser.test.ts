import { describe, expect, it } from 'vitest';

import { CsvCatalogParser } from './csv-parser.js';

const parser = new CsvCatalogParser();

function csvBuffer(s: string): Buffer {
  return Buffer.from(s, 'utf8');
}

describe('CsvCatalogParser', () => {
  it('parses a well-formed CSV with all three columns', async () => {
    const csv = [
      'Title,Relias Code,Hours',
      'Behavioral Analysis,REL-CCP-BA,1.0',
      'Role Clarification,REL-CCP-RC,0.5',
    ].join('\n');
    const entries = await parser.parse(csvBuffer(csv));
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      title: 'Behavioral Analysis',
      reliasCode: 'REL-CCP-BA',
      hours: 1.0,
    });
    expect(entries[1]).toMatchObject({
      title: 'Role Clarification',
      reliasCode: 'REL-CCP-RC',
      hours: 0.5,
    });
  });

  it('matches headers case-insensitively and tolerates alternative names', async () => {
    const csv = ['COURSE NAME,course code,CE Hours', 'Structured Office Visit,REL-CCP-SOV,1'].join(
      '\n',
    );
    const entries = await parser.parse(csvBuffer(csv));
    expect(entries[0]).toMatchObject({
      title: 'Structured Office Visit',
      reliasCode: 'REL-CCP-SOV',
      hours: 1,
    });
  });

  it('leaves missing optional columns as null', async () => {
    const csv = ['Title', 'Just a Title Row'].join('\n');
    const entries = await parser.parse(csvBuffer(csv));
    expect(entries[0]).toEqual({
      title: 'Just a Title Row',
      reliasCode: null,
      hours: null,
      raw: { Title: 'Just a Title Row' },
    });
  });

  it('skips blank rows', async () => {
    const csv = ['Title,Code', 'Alpha,A', '', 'Beta,B'].join('\n');
    const entries = await parser.parse(csvBuffer(csv));
    expect(entries.map((e) => e.title)).toEqual(['Alpha', 'Beta']);
  });

  it('throws when no title-like column is found', async () => {
    const csv = ['Code,Hours', 'REL-X,1'].join('\n');
    await expect(parser.parse(csvBuffer(csv))).rejects.toThrow(/title-like column/);
  });

  it('preserves the source row in `raw` for debugging', async () => {
    const csv = ['Title,Code,Hours,Provider', 'X,Y,1,Vendor'].join('\n');
    const entries = await parser.parse(csvBuffer(csv));
    expect(entries[0]!.raw).toMatchObject({
      Title: 'X',
      Code: 'Y',
      Hours: 1,
      Provider: 'Vendor',
    });
  });

  it('coerces stringly-typed hours to numbers, leaves non-numeric as null', async () => {
    const csv = ['Title,Hours', 'A,1.5', 'B,not-a-number'].join('\n');
    const entries = await parser.parse(csvBuffer(csv));
    expect(entries[0]!.hours).toBe(1.5);
    expect(entries[1]!.hours).toBeNull();
  });

  it('exposes format="csv"', () => {
    expect(parser.format).toBe('csv');
  });
});
