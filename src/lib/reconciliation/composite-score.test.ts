import { describe, expect, it } from 'vitest';

import type { ParsedCatalogEntry, ReliasCourse } from '../types.js';

import { classifyDrift, compositeScore } from './composite-score.js';

function pdf(over: Partial<ParsedCatalogEntry> & { title: string }): ParsedCatalogEntry {
  return { title: over.title, reliasCode: null, hours: null, raw: {}, ...over };
}

function relias(over: Partial<ReliasCourse> & { title: string }): ReliasCourse {
  return {
    courseID: 1,
    title: over.title,
    code: 'REL-BHC-0-FOO',
    hours: 1.0,
    hoursLabel: '1.00',
    courseType: 0,
    description: null,
    releaseDate: null,
    archiveDate: null,
    ...over,
  };
}

describe('compositeScore', () => {
  it('uses all 3 dimensions when pdf has title + hours + code', () => {
    const result = compositeScore(
      pdf({ title: 'Course A', hours: 1.0, reliasCode: 'REL-BHC-0-FOO' }),
      relias({ title: 'Course A', hours: 1.0, code: 'REL-BHC-0-FOO' }),
    );
    expect(result.composite).toBe(1.0);
    expect(result.components).toHaveLength(3);
    expect(result.components.map((c) => c.dimension)).toEqual(['title', 'hours', 'code']);
  });

  it('drops the hours dimension and renormalizes when pdf.hours is null', () => {
    const result = compositeScore(
      pdf({ title: 'Course A', hours: null, reliasCode: 'REL-BHC-0-FOO' }),
      relias({ title: 'Course A', hours: 1.0, code: 'REL-BHC-0-FOO' }),
    );
    expect(result.components).toHaveLength(2);
    expect(result.components.map((c) => c.dimension)).toEqual(['title', 'code']);
    // 0.75 + 0.10 = 0.85; with both dimensions scoring 1.0 the composite
    // is 1.0 (no penalty for missing hours).
    expect(result.composite).toBe(1.0);
  });

  it('drops the code dimension when pdf.reliasCode is null', () => {
    const result = compositeScore(
      pdf({ title: 'Course A', hours: 1.0, reliasCode: null }),
      relias({ title: 'Course A', hours: 1.0 }),
    );
    expect(result.components).toHaveLength(2);
    expect(result.components.map((c) => c.dimension)).toEqual(['title', 'hours']);
    expect(result.composite).toBe(1.0);
  });

  it('collapses to title-only when both hours and code are null on pdf side', () => {
    const result = compositeScore(pdf({ title: 'Course A' }), relias({ title: 'Course A' }));
    expect(result.components).toHaveLength(1);
    expect(result.components[0]!.dimension).toBe('title');
    expect(result.composite).toBe(1.0);
  });

  it('weighted-averages correctly with all 3 dimensions partially scoring', () => {
    // Title 1.0, hours 0.7 (small drift), code 1.0
    // Composite: (0.75*1.0 + 0.15*0.7 + 0.10*1.0) / 1.0 = 0.955
    const result = compositeScore(
      pdf({ title: 'Course A', hours: 1.25, reliasCode: 'REL-BHC-0-FOO' }),
      relias({ title: 'Course A', hours: 1.0, code: 'REL-BHC-0-FOO' }),
    );
    expect(result.composite).toBeCloseTo(0.955, 3);
  });

  it('renormalization gives missing-code rows a fair shake (no neutral-0.5 penalty)', () => {
    // Title 1.0, hours 1.0, no code. With renormalization, composite = 1.0.
    // Under the sub-spec's "neutral 0.5 for missing" approach, this would have
    // been (0.75*1.0 + 0.15*1.0 + 0.10*0.5) / 1.0 = 0.95 — meaningfully lower
    // for no reason. The renormalize approach is more honest.
    const result = compositeScore(
      pdf({ title: 'Course A', hours: 1.0, reliasCode: null }),
      relias({ title: 'Course A', hours: 1.0 }),
    );
    expect(result.composite).toBe(1.0);
  });

  it('driftType is null on the raw scoring result', () => {
    const result = compositeScore(pdf({ title: 'A' }), relias({ title: 'A' }));
    expect(result.driftType).toBeNull();
  });
});

describe('classifyDrift', () => {
  it("returns 'identical' when every contributing dimension is 1.0", () => {
    const p = pdf({ title: 'Course A', hours: 1.0, reliasCode: 'REL-BHC-0-FOO' });
    const r = relias({ title: 'Course A', hours: 1.0, code: 'REL-BHC-0-FOO' });
    const breakdown = compositeScore(p, r);
    expect(classifyDrift(p, r, breakdown)).toBe('identical');
  });

  it("returns 'identical' even when missing dimensions weren't checked (1.0 on title alone)", () => {
    const p = pdf({ title: 'Course A' });
    const r = relias({ title: 'Course A' });
    const breakdown = compositeScore(p, r);
    expect(classifyDrift(p, r, breakdown)).toBe('identical');
  });

  it("returns 'title-only' when title drifts and hours/code match", () => {
    // Use a char-level title diff that token-set can't paper over.
    // "Benzodiazepines" vs "Benzediazepines" — single char swap that
    // titleSimilarity scores <1.0.
    const p = pdf({ title: 'Benzodiazepines Overview', hours: 1.0, reliasCode: 'REL-BHC-0-FOO' });
    const r = relias({ title: 'Benzediazepines Overview', hours: 1.0, code: 'REL-BHC-0-FOO' });
    const breakdown = compositeScore(p, r);
    expect(classifyDrift(p, r, breakdown)).toBe('title-only');
  });

  it("returns 'hours-only' when only the hours drift", () => {
    const p = pdf({ title: 'Course A', hours: 1.5, reliasCode: 'REL-BHC-0-FOO' });
    const r = relias({ title: 'Course A', hours: 1.0, code: 'REL-BHC-0-FOO' });
    const breakdown = compositeScore(p, r);
    expect(classifyDrift(p, r, breakdown)).toBe('hours-only');
  });

  it("returns 'code-only' when only the code drifts (BUMATM→BUMATMS)", () => {
    const p = pdf({ title: 'Course A', hours: 1.0, reliasCode: 'REL-BHC-0-BUMATM' });
    const r = relias({ title: 'Course A', hours: 1.0, code: 'REL-BHC-0-BUMATMS' });
    const breakdown = compositeScore(p, r);
    expect(classifyDrift(p, r, breakdown)).toBe('code-only');
  });

  it("returns 'multi-field' when title and hours both drift", () => {
    // Char-level title diff plus 0.5h drift.
    const p = pdf({ title: 'Benzodiazepines Overview', hours: 1.5, reliasCode: 'REL-BHC-0-FOO' });
    const r = relias({ title: 'Benzediazepines Overview', hours: 1.0, code: 'REL-BHC-0-FOO' });
    const breakdown = compositeScore(p, r);
    expect(classifyDrift(p, r, breakdown)).toBe('multi-field');
  });

  it("returns 'version-bump' when title and code both drift AND codes carry -V\\d+ suffix", () => {
    // Char-level title drift (Benzo↔Benze) + -V2/-V3 code drift.
    const p = pdf({
      title: 'Benzodiazepines Overview',
      hours: 1.0,
      reliasCode: 'REL-BHC-0-FOO-V2',
    });
    const r = relias({
      title: 'Benzediazepines Overview',
      hours: 1.0,
      code: 'REL-BHC-0-FOO-V3',
    });
    const breakdown = compositeScore(p, r);
    expect(classifyDrift(p, r, breakdown)).toBe('version-bump');
  });

  it("returns 'multi-field' (not 'version-bump') when only one side has -V\\d+ suffix", () => {
    const p = pdf({
      title: 'Benzodiazepines Overview',
      hours: 1.0,
      reliasCode: 'REL-BHC-0-FOO',
    });
    const r = relias({
      title: 'Benzediazepines Overview',
      hours: 1.0,
      code: 'REL-BHC-0-FOO-V2',
    });
    const breakdown = compositeScore(p, r);
    expect(classifyDrift(p, r, breakdown)).toBe('multi-field');
  });
});
