import { describe, expect, it } from 'vitest';

import { levenshteinDistance, levenshteinRatio } from './levenshtein.js';

describe('levenshteinDistance', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshteinDistance('abc', 'abc')).toBe(0);
  });

  it('returns 0 for two empty strings', () => {
    expect(levenshteinDistance('', '')).toBe(0);
  });

  it('returns length of the other when one is empty', () => {
    expect(levenshteinDistance('', 'abc')).toBe(3);
    expect(levenshteinDistance('abc', '')).toBe(3);
  });

  it('counts a single substitution', () => {
    // kitten → sitten (one substitution)
    expect(levenshteinDistance('kitten', 'sitten')).toBe(1);
  });

  it('counts a single insertion', () => {
    expect(levenshteinDistance('abc', 'abcd')).toBe(1);
  });

  it('counts a single deletion', () => {
    expect(levenshteinDistance('abcd', 'abc')).toBe(1);
  });

  it('handles the classic kitten→sitting example (3 edits)', () => {
    // sub k→s, sub e→i, insert g
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
  });

  it('handles transpositions as two edits (Levenshtein, not Damerau)', () => {
    // "ab" → "ba" — Levenshtein sees this as 2 (sub + sub), not 1 (swap).
    expect(levenshteinDistance('ab', 'ba')).toBe(2);
  });

  it('handles strings of very different lengths', () => {
    expect(levenshteinDistance('a', 'abcdefghijklmnop')).toBe(15);
  });

  it('is symmetric (distance is independent of argument order)', () => {
    const a = 'benzodiazepines';
    const b = 'benzediazepines';
    expect(levenshteinDistance(a, b)).toBe(levenshteinDistance(b, a));
  });
});

describe('levenshteinRatio', () => {
  it('returns 1.0 for identical strings', () => {
    expect(levenshteinRatio('foo', 'foo')).toBe(1.0);
  });

  it('returns 1.0 for two empty strings', () => {
    expect(levenshteinRatio('', '')).toBe(1.0);
  });

  it('returns 0.0 for completely different strings of the same length', () => {
    expect(levenshteinRatio('abc', 'xyz')).toBe(0.0);
  });

  it('returns ~0.83 for "kitten" vs "kitten" with one edit', () => {
    // 1 - 1/6 ≈ 0.833
    expect(levenshteinRatio('kitten', 'sitten')).toBeCloseTo(5 / 6, 6);
  });

  it('returns ~0.57 for kitten→sitting (3 edits in max-len 7)', () => {
    expect(levenshteinRatio('kitten', 'sitting')).toBeCloseTo(4 / 7, 6);
  });

  it('is symmetric', () => {
    const a = 'benzodiazepines';
    const b = 'benzediazepines';
    expect(levenshteinRatio(a, b)).toBe(levenshteinRatio(b, a));
  });

  it('returns 0.0 when comparing an empty string to a non-empty one', () => {
    expect(levenshteinRatio('', 'abc')).toBe(0.0);
  });
});
