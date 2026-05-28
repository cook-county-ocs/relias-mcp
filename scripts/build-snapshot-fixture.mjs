/**
 * Build a synthetic Relias snapshot fixture for F4 E2E testing.
 *
 * Derives ~50 courses from the parsed TY25 PDF (so they overlap with what
 * the E2E test will reconcile), introduces deliberate drifts (title
 * tweaks, an hours bump, a code-suffix change to demonstrate BUMATM →
 * BUMATMS), and adds 5 Relias-only entries to populate the reliasOnly
 * bucket. The PDF's remaining ~170 rows become fileOnly entries during
 * reconciliation.
 *
 * Run once; commit the output. Not run during tests.
 *
 *   node scripts/build-snapshot-fixture.mjs
 */
import { writeFile, readFile } from 'node:fs/promises';
import { PDFParse } from 'pdf-parse';
import { parseCatalogText } from '../src/lib/file-parsers/extract-from-text.js';

const PDF_FIXTURE = 'test/fixtures/aoic-cope-pdf-2025-01-29.pdf';
const OUT_PATH = 'test/fixtures/cope-catalog-snapshot-2026-05-26.json';

const buf = await readFile(PDF_FIXTURE);
const doc = new PDFParse({ data: buf });
const { text } = await doc.getText();
await doc.destroy();

const entries = parseCatalogText(text);
console.log(`Parsed ${entries.length} entries from PDF`);

// Take first 45 entries as the base snapshot.
const baseCourses = entries.slice(0, 45).map((e, i) => ({
  courseID: 100000 + i, // synthetic IDs starting at 100000
  title: e.title,
  code: e.reliasCode,
  hours: e.hours ?? 1.0,
  hoursLabel: e.hours !== null ? e.hours.toFixed(2) : '1.00',
  courseType: 0,
  description: null,
  releaseDate: '2025-01-01',
  archiveDate: null,
}));

// Introduce deliberate drift on a few entries (will land in inBoth as
// fuzzy matches with drift annotations).
// Entry 5: title typo (drifts to title-only via fuzzy match — code still matches)
baseCourses[5].title = baseCourses[5].title.replace('Benzodiazepines', 'Benzediazepines');
// Entry 10: hours bump (hours-only drift — code still matches)
baseCourses[10].hours = baseCourses[10].hours + 0.5;
baseCourses[10].hoursLabel = baseCourses[10].hours.toFixed(2);
// Entry 15: code suffix drift (BUMATM-style: title and hours match, code differs by one char)
// Append 'S' to the suffix so exact-code match fails and fuzzy code drives the match.
baseCourses[15].code = baseCourses[15].code + 'S';

// 5 Relias-only entries: realistic-looking COPE courses NOT in the PDF.
const reliasOnlyCourses = [
  {
    courseID: 200001,
    title: 'Advanced Trauma-Informed Care Practicum',
    code: 'REL-BHC-0-ATICP',
    hours: 2.0,
    hoursLabel: '2.00',
    courseType: 0,
    description: null,
    releaseDate: '2025-03-01',
    archiveDate: null,
  },
  {
    courseID: 200002,
    title: 'Crisis Intervention for Detention Staff',
    code: 'REL-PS-0-CIDS',
    hours: 1.5,
    hoursLabel: '1.50',
    courseType: 0,
    description: null,
    releaseDate: '2025-04-15',
    archiveDate: null,
  },
  {
    courseID: 200003,
    title: 'Restorative Justice Foundations',
    code: 'REL-PSC-0-RJF',
    hours: 1.0,
    hoursLabel: '1.00',
    courseType: 0,
    description: null,
    releaseDate: '2025-02-10',
    archiveDate: null,
  },
  {
    courseID: 200004,
    title: 'Adolescent Brain Development for Probation Officers',
    code: 'REL-PS-0-ABDPO',
    hours: 1.25,
    hoursLabel: '1.25',
    courseType: 0,
    description: null,
    releaseDate: '2025-05-20',
    archiveDate: null,
  },
  {
    courseID: 200005,
    title: 'Substance Use Disorder Treatment Modalities',
    code: 'REL-BHC-0-SUDTM',
    hours: 2.5,
    hoursLabel: '2.50',
    courseType: 0,
    description: null,
    releaseDate: '2025-06-01',
    archiveDate: null,
  },
];

const snapshot = {
  capturedAt: '2026-05-26T18:00:00Z',
  source: 'relias-search-api',
  totalCount: baseCourses.length + reliasOnlyCourses.length,
  courses: [...baseCourses, ...reliasOnlyCourses],
};

await writeFile(OUT_PATH, JSON.stringify(snapshot, null, 2) + '\n');
console.log(`Wrote ${snapshot.totalCount} courses to ${OUT_PATH}`);
console.log(`  - ${baseCourses.length} derived from PDF (3 with deliberate drift)`);
console.log(`  - ${reliasOnlyCourses.length} Relias-only entries`);
console.log('Drift entries (will land in inBoth via exact-code OR fuzzy):');
console.log(`  - Entry 5: title typo "${baseCourses[5].title.slice(0, 60)}..."`);
console.log(`  - Entry 10: hours bumped to ${baseCourses[10].hours}`);
console.log(`  - Entry 15: code suffix tweaked to ${baseCourses[15].code}`);
