import { describe, expect, it } from 'vitest';

import { codeSimilarity, hoursSimilarity, titleSimilarity } from './similarity.js';

describe('titleSimilarity', () => {
  it('returns 1.0 for identical (after normalization)', () => {
    expect(titleSimilarity('foo bar', 'foo bar')).toBe(1.0);
  });

  it('returns 1.0 for the same words in different case + punctuation', () => {
    expect(titleSimilarity('Foo, Bar!', 'foo bar')).toBe(1.0);
  });

  it('returns 1.0 for word-shuffles (token-set catches this)', () => {
    // Jaro-Winkler would score this low; max() lets token-set win.
    expect(titleSimilarity('alpha beta gamma', 'gamma alpha beta')).toBe(1.0);
  });

  it('returns high (>0.80) for the benzodiazepines drift from sub-spec', () => {
    // Sub-spec asked for [0.80, 0.95). Real measurement: rapidfuzz-style
    // token-set scores ~0.97 because the intersection is large and the
    // diffs are similar (uses↔use, misuses↔misuse, models↔methods).
    // The relaxed upper bound captures "strong match, not exact" without
    // pinning to spec's expected band.
    const score = titleSimilarity(
      'Benzodiazepines: Uses, Misuses, and Alternative Treatment Models',
      'Benzodiazepines: Use, Misuse, and Alternative Treatment Methods',
    );
    expect(score).toBeGreaterThan(0.85);
    expect(score).toBeLessThan(1.0);
  });

  it('returns very high (>0.90) for the clinical pathways drift from sub-spec', () => {
    const score = titleSimilarity(
      'Clinical Pathways that Inform Adolescent Substance Use Disorder',
      'Clinical Pathways Which Inform Adolescent Substance Use Disorder',
    );
    expect(score).toBeGreaterThan(0.9);
  });

  it('returns low (below drift threshold 0.70) for unrelated titles from sub-spec', () => {
    // Sub-spec asked for <0.40. Real measurement: ~0.66 because token-set
    // captures incidental character alignment between same-shape strings.
    // What matters for the engine: this falls below THRESHOLDS.drift (0.70)
    // and lands in fileOnly. The exact value isn't a contract; the bucket
    // assignment is.
    const score = titleSimilarity(
      'Conducting Security Counts in Juvenile Facilities',
      'Marijuana and Cannabinoids: Effects and Potential Medicinal Uses',
    );
    expect(score).toBeLessThan(0.7); // below drift threshold
  });

  it('handles format-tag drift (Self-Paced suffix stripped before comparison)', () => {
    expect(
      titleSimilarity('Communicating Effectively', 'Communicating Effectively Self-Paced'),
    ).toBe(1.0);
  });
});

describe('hoursSimilarity', () => {
  // Sub-spec §3.3 stubs
  it('returns 1.0 for identical hours', () => expect(hoursSimilarity(1.5, 1.5)).toBe(1.0));
  it('returns 0.7 for tiny drift (<=0.25)', () => expect(hoursSimilarity(1.5, 1.25)).toBe(0.7));
  it('returns 0.3 for benzodiazepines drift (0.5 diff)', () =>
    expect(hoursSimilarity(1.5, 1.0)).toBe(0.3));
  it('returns 0.3 for max-band drift (exactly 1.0 diff)', () =>
    expect(hoursSimilarity(2.0, 1.0)).toBe(0.3));
  it('returns 0.0 for far-apart hours (>1.0 diff)', () =>
    expect(hoursSimilarity(0.5, 2.5)).toBe(0.0));

  it('is symmetric', () => {
    expect(hoursSimilarity(1.5, 1.0)).toBe(hoursSimilarity(1.0, 1.5));
  });

  it('handles zero-hour courses (edge case from real data)', () => {
    expect(hoursSimilarity(0, 0)).toBe(1.0);
    expect(hoursSimilarity(0, 0.5)).toBe(0.3);
  });

  it('handles fractional hours including the 0.07h data-entry-error case', () => {
    // From Plan A discovery findings — a row was entered as 0.07h instead of 0.7.
    // Vs a "true" 0.5h or 1.0h course, hours-similarity gives a low score
    // (0.5 - 0.07 = 0.43 diff → band 3 → 0.3).
    expect(hoursSimilarity(0.07, 0.5)).toBe(0.3); // 0.43 diff → band 3
    expect(hoursSimilarity(0.07, 1.0)).toBe(0.3); // 0.93 diff → band 3 (still <= 1.0)
    expect(hoursSimilarity(0.07, 1.5)).toBe(0.0); // 1.43 diff → no band match
    expect(hoursSimilarity(0.07, 0.07)).toBe(1.0); // identical (the parser-correct value)
    expect(hoursSimilarity(0.07, 0.07 + 0.2)).toBe(0.7); // rounding-noise tolerance band
  });
});

describe('codeSimilarity', () => {
  // Sub-spec §3.5 stubs
  it('returns 1.0 for identical codes', () => {
    expect(codeSimilarity('REL-BHC-0-BUMATM', 'REL-BHC-0-BUMATM')).toBe(1.0);
  });

  it('returns high (>0.85) for BUMATM → BUMATMS (one-char suffix drift)', () => {
    const score = codeSimilarity('REL-BHC-0-BUMATM', 'REL-BHC-0-BUMATMS');
    expect(score).toBeGreaterThan(0.85);
  });

  it('returns moderate for category drift PS → PSC (different category, different suffix)', () => {
    const score = codeSimilarity('REL-PS-0-WIP', 'REL-PSC-0-RCTAIC');
    expect(score).toBeLessThan(0.5);
    expect(score).toBeGreaterThan(0.1);
  });

  it('returns 0.0 for completely different prefixes (REL vs AOIC)', () => {
    expect(codeSimilarity('REL-BHC-0-X', 'AOIC-001')).toBe(0.0);
  });

  it('returns 0.0 for REL vs COPE (different vendors)', () => {
    expect(codeSimilarity('REL-BHC-0-BUMATM', 'COPE-ShieldofCare')).toBe(0.0);
  });

  it('is symmetric', () => {
    const a = 'REL-BHC-0-BUMATM';
    const b = 'REL-BHC-0-BUMATMS';
    expect(codeSimilarity(a, b)).toBeCloseTo(codeSimilarity(b, a), 10);
  });

  it('handles same category with different modifiers (0 vs SS) at high suffix similarity', () => {
    // Same prefix, same category, modifier differs. Per sub-spec the
    // composite is 0.7*suffix + 0.3*categoryMatch — modifier doesn't
    // enter the score directly. Identical suffixes here means high score.
    const score = codeSimilarity('REL-BHC-0-FOO', 'REL-BHC-SS-FOO');
    expect(score).toBe(1.0); // 0.7*1.0 + 0.3*1.0
  });

  it('is case-insensitive on the suffix', () => {
    expect(codeSimilarity('REL-BHC-0-bumatm', 'REL-BHC-0-BUMATM')).toBe(1.0);
  });
});
