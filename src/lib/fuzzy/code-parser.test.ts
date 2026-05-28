import { describe, expect, it } from 'vitest';

import { parseCode } from './code-parser.js';

describe('parseCode', () => {
  it('parses a standard 4-segment REL code', () => {
    expect(parseCode('REL-BHC-0-BUMATM')).toEqual({
      prefix: 'REL',
      category: 'BHC',
      modifier: '0',
      suffix: 'BUMATM',
      raw: 'REL-BHC-0-BUMATM',
    });
  });

  it('parses a REL code with SS modifier', () => {
    expect(parseCode('REL-ALL-SS-BLST')).toEqual({
      prefix: 'REL',
      category: 'ALL',
      modifier: 'SS',
      suffix: 'BLST',
      raw: 'REL-ALL-SS-BLST',
    });
  });

  it('joins multi-segment REL suffixes with hyphens', () => {
    // Codes like REL-X-Y-FOO-BAR-V2 collapse the trailing segments into
    // suffix so version-bump regex can see them.
    expect(parseCode('REL-PSC-0-RCTAIC-V2')).toMatchObject({
      prefix: 'REL',
      category: 'PSC',
      modifier: '0',
      suffix: 'RCTAIC-V2',
    });
  });

  it('parses AOIC-001 (two-segment, non-REL)', () => {
    expect(parseCode('AOIC-001')).toEqual({
      prefix: 'AOIC',
      category: '001',
      modifier: '',
      suffix: '',
      raw: 'AOIC-001',
    });
  });

  it('parses APPA-UIDA-G (three-segment, non-REL)', () => {
    expect(parseCode('APPA-UIDA-G')).toMatchObject({
      prefix: 'APPA',
      category: 'UIDA',
      modifier: '',
      suffix: 'G',
    });
  });

  it('parses COPE-ShieldofCare (two-segment with no hyphens in suffix)', () => {
    expect(parseCode('COPE-ShieldofCare')).toEqual({
      prefix: 'COPE',
      category: 'ShieldofCare',
      modifier: '',
      suffix: '',
      raw: 'COPE-ShieldofCare',
    });
  });

  it('returns all-empty for an empty input but preserves raw', () => {
    expect(parseCode('')).toEqual({
      prefix: '',
      category: '',
      modifier: '',
      suffix: '',
      raw: '',
    });
  });

  it('trims surrounding whitespace before parsing', () => {
    expect(parseCode('  REL-BHC-0-BUMATM  ')).toMatchObject({
      prefix: 'REL',
      category: 'BHC',
      modifier: '0',
      suffix: 'BUMATM',
    });
  });

  it('preserves the raw input even when trimming', () => {
    const raw = '  REL-BHC-0-BUMATM  ';
    expect(parseCode(raw).raw).toBe(raw);
  });

  it('treats short REL codes (fewer than 4 segments) via the fall-through', () => {
    // Malformed but parseable — REL with only 2 segments slots into the
    // non-REL branch rather than throwing.
    expect(parseCode('REL-X')).toMatchObject({
      prefix: 'REL',
      category: 'X',
      modifier: '',
      suffix: '',
    });
  });

  it('captures the BUMATM → BUMATMS pattern (same parse shape, different suffix)', () => {
    // The whole reason codeSimilarity exists — these should parse the same
    // way so the suffix Levenshtein can score them as nearly identical.
    const a = parseCode('REL-BHC-0-BUMATM');
    const b = parseCode('REL-BHC-0-BUMATMS');
    expect(a.prefix).toBe(b.prefix);
    expect(a.category).toBe(b.category);
    expect(a.modifier).toBe(b.modifier);
    expect(a.suffix).not.toBe(b.suffix);
  });
});
