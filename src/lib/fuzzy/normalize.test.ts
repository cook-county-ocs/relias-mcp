import { describe, expect, it } from 'vitest';

import { normalize } from './normalize.js';

describe('normalize', () => {
  // --- Sub-spec §3.1 stubs (test stubs lifted verbatim from the spec) ----
  it('lowercases', () => expect(normalize('ABC')).toBe('abc'));
  it('strips punctuation', () => expect(normalize('Abuse, Neglect.')).toBe('abuse neglect'));
  it('expands Pt to Part', () => expect(normalize('PREA Pt 1')).toBe('prea part 1'));
  it('strips Self-Paced', () => expect(normalize('Foo Self-Paced')).toBe('foo'));
  it('collapses whitespace', () => expect(normalize('a   b')).toBe('a b'));

  // --- Sub-spec §3.1 worked examples table ------------------------------
  it('handles the PREA Pt 1 example', () => {
    expect(normalize('PREA Pt 1: An Overview')).toBe('prea part 1 an overview');
  });

  it('handles the Communicating Effectively Self-Paced example', () => {
    expect(normalize('Communicating Effectively Self-Paced')).toBe('communicating effectively');
  });

  it('handles the long clinical example', () => {
    expect(normalize('Cognitive Behavioral Treatment of Substance Use Disorders')).toBe(
      'cognitive behavioral treatment of substance use disorders',
    );
  });

  it('handles the Abuse Neglect Exploitation example', () => {
    expect(normalize('Abuse, Neglect, and Exploitation')).toBe('abuse neglect and exploitation');
  });

  // --- Edge cases & step-coverage ---------------------------------------
  it('returns empty string for empty input', () => {
    expect(normalize('')).toBe('');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(normalize('   \t  \n  ')).toBe('');
  });

  it('expands `&` to `and` with surrounding spaces', () => {
    expect(normalize('Drugs & Alcohol')).toBe('drugs and alcohol');
  });

  it('expands `w/` to `with`', () => {
    expect(normalize('Working w/ Adolescents')).toBe('working with adolescents');
  });

  it('preserves apostrophes inside words (contractions)', () => {
    expect(normalize("Don't Stop Believing")).toBe("don't stop believing");
  });

  it('strips leading and trailing apostrophes from words', () => {
    expect(normalize("'twas the night")).toBe('twas the night');
  });

  it('preserves hyphens (compound words pass through to similarity)', () => {
    // "in-house" stays "in-house" — hyphen is meaningful in compound words.
    expect(normalize('In-House Training')).toBe('in-house training');
  });

  it('strips Refresher Course suffix', () => {
    expect(normalize('Mandated Reporter Refresher Course')).toBe('mandated reporter');
  });

  it('handles Self Paced (no hyphen) variant', () => {
    expect(normalize('Comm Skills Self Paced')).toBe('comm skills');
  });

  it('preserves digits in titles', () => {
    expect(normalize('PREA 101: Foundations')).toBe('prea 101 foundations');
  });

  it('collapses mixed whitespace (tabs, newlines, multiple spaces)', () => {
    expect(normalize('a\tb\n\nc   d')).toBe('a b c d');
  });

  it('does not munge `pt` inside larger words (parts, ptolemaic)', () => {
    // Word-boundary regex on \bpt\b should leave these alone.
    expect(normalize('Parts of Speech')).toBe('parts of speech');
  });

  it('handles a Pt-at-end-of-string case', () => {
    expect(normalize('Overview Pt')).toBe('overview part');
  });

  it('handles a Pt-at-start-of-string case', () => {
    expect(normalize('Pt 2: Continuation')).toBe('part 2 continuation');
  });
});
