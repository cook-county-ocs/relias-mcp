import Papa from 'papaparse';

import type { FileParser, ParsedCatalogEntry } from '../types.js';

/**
 * Header keyword lists shared in spirit with the XLSX parser. Defined here
 * locally rather than imported to keep the two parsers de-coupled — XLSX's
 * `mapHeaderColumns` uses column indexes; this one uses key names that
 * papaparse already gave us via `header: true`. Different shape, same intent.
 */
const TITLE_KEYS = ['title', 'course name', 'name'] as const;
const CODE_KEYS = ['relias code', 'course code', 'code'] as const;
const HOURS_KEYS = ['hours', 'ce hours', 'credit'] as const;

/**
 * CSV parser — papaparse with `header: true` + `dynamicTyping: true` so
 * hours columns come back as numbers when they parse. Column matching is
 * case-insensitive substring against the keyword lists above.
 *
 * Tolerates BOM (papaparse default), variable column orders, and blank
 * trailing rows.
 */
export class CsvCatalogParser implements FileParser {
  readonly format = 'csv' as const;

  async parse(buffer: Buffer): Promise<ParsedCatalogEntry[]> {
    const text = buffer.toString('utf8');
    const parsed = Papa.parse<Record<string, unknown>>(text, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      // Pin the delimiter so single-column inputs don't trip papaparse's
      // auto-detect heuristic (which warns "UndetectableDelimiter" and
      // surfaces as a fatal error through the check below).
      delimiter: ',',
    });

    if (parsed.errors.length > 0) {
      // papaparse surfaces both fatal and recoverable errors here; we only
      // throw on fatal (it sets `code === "TooFewFields"` etc. with `type === "FieldMismatch"`
      // for recoverable cases). For v1 we treat any error as a parse failure
      // and let the caller decide — coordinator-supplied CSV is small and
      // human-fixable.
      const first = parsed.errors[0]!;
      throw new Error(`csv parser: ${first.type}/${first.code}: ${first.message}`);
    }

    const fields = parsed.meta.fields ?? [];
    const keyMap = mapHeaderKeys(fields);
    if (keyMap.titleKey === null) {
      throw new Error(
        `csv parser: could not find a title-like column in headers ` +
          `(${TITLE_KEYS.join('/')}); headers were: ${JSON.stringify(fields)}`,
      );
    }

    const entries: ParsedCatalogEntry[] = [];
    for (const row of parsed.data) {
      const title = stringOf(row[keyMap.titleKey]);
      if (title === '') continue; // blank row
      const reliasCode = keyMap.codeKey !== null ? stringOf(row[keyMap.codeKey]) || null : null;
      const hours = keyMap.hoursKey !== null ? numberOf(row[keyMap.hoursKey]) : null;
      entries.push({ title, reliasCode, hours, raw: row });
    }
    return entries;
  }
}

interface KeyMap {
  titleKey: string | null;
  codeKey: string | null;
  hoursKey: string | null;
}

function mapHeaderKeys(fields: string[]): KeyMap {
  const map: KeyMap = { titleKey: null, codeKey: null, hoursKey: null };
  for (const f of fields) {
    const lower = f.trim().toLowerCase();
    if (lower === '') continue;
    if (map.titleKey === null && TITLE_KEYS.some((kw) => lower.includes(kw))) map.titleKey = f;
    else if (map.codeKey === null && CODE_KEYS.some((kw) => lower.includes(kw))) map.codeKey = f;
    else if (map.hoursKey === null && HOURS_KEYS.some((kw) => lower.includes(kw))) map.hoursKey = f;
  }
  return map;
}

function stringOf(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function numberOf(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
