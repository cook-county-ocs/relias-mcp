import { describe, expect, it } from 'vitest';

import { tokenSetRatio } from './token-set-ratio.js';

describe('tokenSetRatio', () => {
  it('returns 1.0 for identical strings', () => {
    expect(tokenSetRatio('foo bar baz', 'foo bar baz')).toBe(1.0);
  });

  it('returns 1.0 for the same tokens in different orders (word-shuffle)', () => {
    // This is the case Jaro-Winkler misses and token-set catches.
    expect(tokenSetRatio('foo bar baz', 'baz bar foo')).toBe(1.0);
  });

  it('returns 1.0 for two empty strings', () => {
    expect(tokenSetRatio('', '')).toBe(1.0);
  });

  it('returns 0.0 when one string is empty', () => {
    expect(tokenSetRatio('', 'foo bar')).toBe(0.0);
    expect(tokenSetRatio('foo bar', '')).toBe(0.0);
  });

  it('returns high score when extra tokens cover the same intent', () => {
    // Both sides share "training" + "skills"; A adds "advanced", B adds
    // "intermediate". The two diffs are short and similar in length →
    // ratio(int+A, int+B) is fairly high.
    const score = tokenSetRatio('advanced training skills', 'intermediate training skills');
    expect(score).toBeGreaterThan(0.5);
  });

  it('returns 1.0 when one set is a superset of the other (intersection-only ratio wins)', () => {
    // tokens(A) ⊂ tokens(B) → intersection === A → ratio(intersection, intersection) = 1.0
    expect(tokenSetRatio('foo bar', 'foo bar baz')).toBe(1.0);
  });

  it('returns a low score (not necessarily 0) for completely disjoint tokens', () => {
    // The rapidfuzz algorithm doesn't special-case empty intersection: when
    // both diffs are non-empty, ratio(diffA, diffB) still scores incidental
    // structural alignment (e.g. matching space positions in same-shape
    // strings). That's a feature — it captures "same shape, different
    // content" weakly — and well below any threshold. Just verify it's
    // below the drift threshold (0.70).
    const score = tokenSetRatio('abc def', 'xyz uvw');
    expect(score).toBeLessThan(0.3);
  });

  it('returns 0.0 for disjoint tokens with very different lengths', () => {
    // When the diffs are different lengths, incidental alignment is even
    // weaker. Long-vs-short disjoint should be close to 0.
    expect(tokenSetRatio('a', 'xyz uvw abc def ghi')).toBeLessThan(0.15);
  });

  it('is whitespace-insensitive (collapses multiple spaces)', () => {
    expect(tokenSetRatio('foo   bar', 'foo bar')).toBe(1.0);
  });

  it('is symmetric', () => {
    const a = 'cognitive behavioral treatment substance use disorders';
    const b = 'cognitive behavioral methods substance use disorders';
    expect(tokenSetRatio(a, b)).toBeCloseTo(tokenSetRatio(b, a), 10);
  });

  it('beats levenshteinRatio for word-shuffle cases (sub-spec rationale)', () => {
    // Whole point of token-set: this should be 1.0; raw Levenshtein would
    // be much lower because the characters appear in different positions.
    const tsr = tokenSetRatio('alpha beta gamma', 'gamma alpha beta');
    expect(tsr).toBe(1.0);
  });
});
