import { describe, expect, it } from 'vitest';

import { parseCatalogText } from './extract-from-text.js';

/**
 * Vigorous tests on the PDF/DOCX row-extraction regex.
 *
 * Per Marty's call during F4 PR-2b paired work: "regex is magic, and it
 * gets confusing fast — test it vigorously." Every distinct row shape
 * from the TY25 AOIC PDF gets its own test, plus negative cases for
 * inputs that should throw or skip.
 *
 * Test data lifted from the real PDF text extraction (run
 * `tsx scripts/peek-pdf.mjs` to regenerate the source for these
 * fixtures from `test/fixtures/aoic-cope-pdf-2025-01-29.pdf`).
 */

describe('parseCatalogText — empty/invalid inputs', () => {
  it('returns [] for empty input', () => {
    expect(parseCatalogText('')).toEqual([]);
  });

  it('throws when input has no recognized course codes', () => {
    expect(() => parseCatalogText('This is just some prose with no codes in it.')).toThrow(
      /no recognized course codes/,
    );
  });

  it('throws message includes the first 200 chars of input for debugging', () => {
    const garbage = 'not a catalog '.repeat(20);
    expect(() => parseCatalogText(garbage)).toThrow(/not a catalog/);
  });
});

describe('parseCatalogText — single-row happy paths', () => {
  it('parses a simple tab-separated row (REL code)', () => {
    const text = 'Abuse, Neglect, and Exploitation \tREL-PAC-0-ANAE \t0.75 \tX \tX';
    const entries = parseCatalogText(text);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      title: 'Abuse, Neglect, and Exploitation',
      reliasCode: 'REL-PAC-0-ANAE',
      hours: 0.75,
    });
    expect(entries[0]!.raw).toMatchObject({
      code: 'REL-PAC-0-ANAE',
      hoursRaw: '0.75',
      audienceXCount: 2,
    });
  });

  it('parses an SS-modifier REL code', () => {
    const text =
      "Assessing Your Organization's Potential for High Performance \tREL-ALL-SS-AYOPHP \t0.5 \tX";
    const entries = parseCatalogText(text);
    expect(entries[0]!.reliasCode).toBe('REL-ALL-SS-AYOPHP');
  });

  it('parses a version-suffix code (-V2)', () => {
    const text = 'Becoming an Emotionally Intelligent Leader \tREL-ALL-SS-THCL-V2 \t1 \tX';
    const entries = parseCatalogText(text);
    expect(entries[0]!.reliasCode).toBe('REL-ALL-SS-THCL-V2');
  });

  it('parses an APPA code', () => {
    const text = 'Using the Impaired Driving Assessment \tAPPA-UIDA-G \t1 \tX';
    const entries = parseCatalogText(text);
    expect(entries[0]).toMatchObject({
      title: 'Using the Impaired Driving Assessment',
      reliasCode: 'APPA-UIDA-G',
      hours: 1,
    });
  });

  it('parses an AOIC code (synthetic — not present in TY25 but spec mentions)', () => {
    const text = 'Custom AOIC Course \tAOIC-001 \t0.5 \tX';
    const entries = parseCatalogText(text);
    expect(entries[0]!.reliasCode).toBe('AOIC-001');
  });

  it('parses a COPE code (synthetic — spec mentions ShieldofCare)', () => {
    const text = 'COPE Shield of Care Curriculum \tCOPE-ShieldofCare \t1 \tX';
    const entries = parseCatalogText(text);
    expect(entries[0]!.reliasCode).toBe('COPE-ShieldofCare');
  });

  it('handles a row with only 1 X-mark (Probation only)', () => {
    const text = 'An Overview of Intimate Partner Violence \tREL-BHC-0-PHR \t0.75 \tX';
    const entries = parseCatalogText(text);
    expect(entries[0]!.raw).toMatchObject({ audienceXCount: 1 });
  });

  it('handles a row with 3 X-marks', () => {
    const text =
      'Bridging Differences in Cross-cultural Communication \tREL-ALL-SS-BDCC \t0.5 \tX \tX \tX';
    const entries = parseCatalogText(text);
    expect(entries[0]!.raw).toMatchObject({ audienceXCount: 3 });
  });

  it('handles fractional-hours edge case (the 0.15h micro-training)', () => {
    const text = 'Key Steps for Supporting Someone in Crisis \tREL-BHC-0-QSHSEP \t0.15 \tX \tX \tX';
    const entries = parseCatalogText(text);
    expect(entries[0]!.hours).toBe(0.15);
  });
});

describe('parseCatalogText — multi-row sequences', () => {
  it('parses a clean tab-separated multi-row block', () => {
    const text = [
      'Abuse, Neglect, and Exploitation \tREL-PAC-0-ANAE \t0.75 \tX \tX',
      'An Overview of Substance Use Disorders \tREL-BHC-0-AOSUD \t1 \tX \tX',
      'Becoming an Emotionally Intelligent Leader \tREL-ALL-SS-THCL-V2 \t1 \tX',
    ].join('\n');
    const entries = parseCatalogText(text);
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.reliasCode)).toEqual([
      'REL-PAC-0-ANAE',
      'REL-BHC-0-AOSUD',
      'REL-ALL-SS-THCL-V2',
    ]);
    expect(entries.map((e) => e.title)).toEqual([
      'Abuse, Neglect, and Exploitation',
      'An Overview of Substance Use Disorders',
      'Becoming an Emotionally Intelligent Leader',
    ]);
  });
});

describe('parseCatalogText — edge case A: title runs into code with no separator', () => {
  it('extracts the title even when title flows directly into the code', () => {
    // From TY25: "Managing Inmates and Juveniles who Require Accommodations for DisabilitiesREL-PS-0-MIJRAD"
    // No tab, no space between "Disabilities" and "REL-PS-0-MIJRAD".
    const text =
      'Managing Inmates and Juveniles who Require Accommodations for DisabilitiesREL-PS-0-MIJRAD \t1.25 \tX';
    const entries = parseCatalogText(text);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.title).toBe(
      'Managing Inmates and Juveniles who Require Accommodations for Disabilities',
    );
    expect(entries[0]!.reliasCode).toBe('REL-PS-0-MIJRAD');
    expect(entries[0]!.hours).toBe(1.25);
  });

  it('extracts the title when separated by a single space (no tab)', () => {
    // From TY25: "Overview of Behavioral Health Issues in Older Adults for Paraprofessionals REL-BHC-0-OBHIOAP 	1 	X"
    const text =
      'Overview of Behavioral Health Issues in Older Adults for Paraprofessionals REL-BHC-0-OBHIOAP \t1 \tX';
    const entries = parseCatalogText(text);
    expect(entries[0]!.title).toBe(
      'Overview of Behavioral Health Issues in Older Adults for Paraprofessionals',
    );
    expect(entries[0]!.reliasCode).toBe('REL-BHC-0-OBHIOAP');
  });
});

describe('parseCatalogText — edge case B: title spans a newline before code', () => {
  it('joins multi-line titles when the code is on the next line', () => {
    // From TY25: "Using a Behavioral Management Approach to Supervision of Youth in\nConfinement \tREL-PS-0-SJCF-V2 \t1.5 \tX"
    const text =
      'Using a Behavioral Management Approach to Supervision of Youth in\nConfinement \tREL-PS-0-SJCF-V2 \t1.5 \tX';
    const entries = parseCatalogText(text);
    expect(entries[0]!.title).toBe(
      'Using a Behavioral Management Approach to Supervision of Youth in Confinement',
    );
    expect(entries[0]!.reliasCode).toBe('REL-PS-0-SJCF-V2');
  });

  it('joins multi-line title even when no tab between title and code on the next line', () => {
    // From TY25: "Using Cognitive-Based Communication Skills with Individuals on Supervision\nREL-PSC-0-CBCSICS \t2.25 \tX \tX"
    const text =
      'Using Cognitive-Based Communication Skills with Individuals on Supervision\nREL-PSC-0-CBCSICS \t2.25 \tX \tX';
    const entries = parseCatalogText(text);
    expect(entries[0]!.title).toBe(
      'Using Cognitive-Based Communication Skills with Individuals on Supervision',
    );
    expect(entries[0]!.reliasCode).toBe('REL-PSC-0-CBCSICS');
  });
});

describe('parseCatalogText — page headers and footers', () => {
  it('strips page headers (COPE Approved Relias title line)', () => {
    const text = [
      'COPE Approved Relias (Virtual) Trainings',
      'Title \tRelias Code \tHours \tProbation \tDetention Management',
      'Abuse, Neglect, and Exploitation \tREL-PAC-0-ANAE \t0.75 \tX \tX',
    ].join('\n');
    const entries = parseCatalogText(text);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.title).toBe('Abuse, Neglect, and Exploitation');
  });

  it('strips page footers (-- N of N --)', () => {
    const text = [
      'Abuse, Neglect, and Exploitation \tREL-PAC-0-ANAE \t0.75 \tX \tX',
      '',
      '-- 3 of 7 --',
      '',
      'COPE Approved Relias (Virtual) Trainings',
      'Title \tRelias Code \tHours \tProbation \tDetention Management',
      'Becoming an Emotionally Intelligent Leader \tREL-ALL-SS-THCL-V2 \t1 \tX',
    ].join('\n');
    const entries = parseCatalogText(text);
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.title)).toEqual([
      'Abuse, Neglect, and Exploitation',
      'Becoming an Emotionally Intelligent Leader',
    ]);
  });
});

describe('parseCatalogText — raw field captures', () => {
  it('captures the raw segment for forensics', () => {
    const text = 'Test Course \tREL-BHC-0-TEST \t1.5 \tX \tX';
    const entries = parseCatalogText(text);
    expect(entries[0]!.raw).toMatchObject({
      code: 'REL-BHC-0-TEST',
      hoursRaw: '1.5',
      audienceTokens: ['X', 'X'],
      audienceXCount: 2,
    });
    expect(entries[0]!.raw.rawSegment).toContain('Test Course');
    expect(entries[0]!.raw.rawSegment).toContain('REL-BHC-0-TEST');
  });

  it('audienceTokens preserves left-to-right order', () => {
    const text = 'Course A \tREL-BHC-0-A \t1 \tX \tX \tX';
    const entries = parseCatalogText(text);
    expect(entries[0]!.raw.audienceTokens).toEqual(['X', 'X', 'X']);
  });

  it('audienceXCount is 0 for rows with no X-marks', () => {
    const text = 'Course A \tREL-BHC-0-A \t1';
    const entries = parseCatalogText(text);
    expect(entries[0]!.raw).toMatchObject({ audienceXCount: 0 });
  });

  it('audienceTokens stops at first non-X token (defensive against title bleed)', () => {
    // If the next row leaked into this row's tail without a clear separator,
    // audience extraction should stop at the first non-X token rather than
    // capturing words from the next title.
    const text = 'Course A \tREL-BHC-0-A \t1 \tX \tX SomeTitle \tREL-BHC-0-B \t0.5 \tX';
    const entries = parseCatalogText(text);
    expect(entries[0]!.raw.audienceTokens).toEqual(['X', 'X']);
  });
});

describe('parseCatalogText — full PDF text smoke test', () => {
  it('parses every row in a realistic multi-page chunk without throwing', () => {
    // Lifted directly from the TY25 PDF text extraction; mix of all
    // edge cases (tab-sep, no-sep, multi-line) in one input.
    const text = [
      'COPE Approved Relias (Virtual) Trainings',
      'Title \tRelias Code \tHours \tProbation \tDetention Management',
      'Abuse, Neglect, and Exploitation \tREL-PAC-0-ANAE \t0.75 \tX \tX',
      'An Overview of Substance Use Disorders \tREL-BHC-0-AOSUD \t1 \tX \tX',
      "Assessing Your Organization's Potential for High Performance \tREL-ALL-SS-AYOPHP \t0.5 \tX",
      'Becoming an Emotionally Intelligent Leader \tREL-ALL-SS-THCL-V2 \t1 \tX',
      'Benzodiazepines: Uses, Misuses, and Alternative Treatment Models \tREL-BHC-0-BUMATM \t1.5 \tX',
      'Bridging Differences in Cross-cultural Communication \tREL-ALL-SS-BDCC \t0.5 \tX \tX \tX',
      '',
      '-- 1 of 7 --',
      '',
      'COPE Approved Relias (Virtual) Trainings',
      'Title \tRelias Code \tHours \tProbation \tDetention Management',
      'Key Steps for Supporting Someone in Crisis \tREL-BHC-0-QSHSEP \t0.15 \tX \tX \tX',
      'Managing Inmates and Juveniles who Require Accommodations for DisabilitiesREL-PS-0-MIJRAD \t1.25 \tX',
      'Using a Behavioral Management Approach to Supervision of Youth in\nConfinement \tREL-PS-0-SJCF-V2 \t1.5 \tX',
      'Using the Impaired Driving Assessment \tAPPA-UIDA-G \t1 \tX',
    ].join('\n');
    const entries = parseCatalogText(text);
    expect(entries).toHaveLength(10);
    expect(entries.map((e) => e.reliasCode)).toEqual([
      'REL-PAC-0-ANAE',
      'REL-BHC-0-AOSUD',
      'REL-ALL-SS-AYOPHP',
      'REL-ALL-SS-THCL-V2',
      'REL-BHC-0-BUMATM',
      'REL-ALL-SS-BDCC',
      'REL-BHC-0-QSHSEP',
      'REL-PS-0-MIJRAD',
      'REL-PS-0-SJCF-V2',
      'APPA-UIDA-G',
    ]);
    // Multi-line title joined correctly:
    expect(entries[8]!.title).toBe(
      'Using a Behavioral Management Approach to Supervision of Youth in Confinement',
    );
    // No-separator title extracted correctly:
    expect(entries[7]!.title).toBe(
      'Managing Inmates and Juveniles who Require Accommodations for Disabilities',
    );
    // All rows have a non-null code and hours:
    for (const e of entries) {
      expect(e.reliasCode).not.toBeNull();
      expect(e.hours).not.toBeNull();
    }
  });

  it('parses the real TY25 PDF fixture end-to-end without throwing', async () => {
    // The big integration moment: feed the real PDF text through and
    // verify reasonable row count. Below 50 or above 500 indicates a
    // regex bug.
    const { readFile } = await import('node:fs/promises');
    const { PDFParse } = await import('pdf-parse');
    const fixturePath = new URL(
      '../../../test/fixtures/aoic-cope-pdf-2025-01-29.pdf',
      import.meta.url,
    );
    const buf = await readFile(fixturePath);
    const doc = new PDFParse({ data: buf });
    const { text } = await doc.getText();
    await doc.destroy();
    const entries = parseCatalogText(text);
    expect(entries.length).toBeGreaterThan(50);
    expect(entries.length).toBeLessThan(500);
    // Spot-check known rows
    const codes = entries.map((e) => e.reliasCode);
    expect(codes).toContain('REL-PAC-0-ANAE');
    expect(codes).toContain('REL-BHC-0-BUMATM');
    expect(codes).toContain('APPA-UIDA-G');
    // No empty titles
    for (const e of entries) {
      expect(e.title.length).toBeGreaterThan(0);
    }
  });
});
