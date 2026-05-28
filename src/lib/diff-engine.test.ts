import { describe, expect, it } from 'vitest';
import { diff } from './diff-engine.js';
import type { ReliasCourse, ReliasSnapshot } from './types.js';

function course(over: Partial<ReliasCourse> & { courseID: number }): ReliasCourse {
  return {
    title: `Course ${over.courseID}`,
    code: `REL-C-${over.courseID}`,
    hours: 1,
    hoursLabel: '1.00',
    courseType: 1,
    description: null,
    releaseDate: null,
    archiveDate: null,
    ...over,
  };
}

function snapshot(capturedAt: string, courses: ReliasCourse[]): ReliasSnapshot {
  return { capturedAt, source: 'relias-search-api', totalCount: courses.length, courses };
}

const T1 = '2026-05-26T12:00:00Z';
const T2 = '2026-05-27T12:00:00Z';

describe('diff', () => {
  it('reports zero changes for identical snapshots (empty diff)', () => {
    const snap = snapshot(T1, [course({ courseID: 1 }), course({ courseID: 2 })]);
    const result = diff(snap, snapshot(T2, snap.courses));
    expect(result.summary).toEqual({ addedCount: 0, removedCount: 0, changedCount: 0 });
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.changed).toEqual([]);
    expect(result.from.capturedAt).toBe(T1);
    expect(result.to.capturedAt).toBe(T2);
  });

  it('reports adds-only when the later snapshot grows', () => {
    const from = snapshot(T1, [course({ courseID: 1 })]);
    const to = snapshot(T2, [
      course({ courseID: 1 }),
      course({ courseID: 2 }),
      course({ courseID: 3 }),
    ]);
    const result = diff(from, to);
    expect(result.summary).toEqual({ addedCount: 2, removedCount: 0, changedCount: 0 });
    expect(result.added.map((c) => c.courseID)).toEqual([2, 3]);
  });

  it('reports removes-only when the later snapshot shrinks', () => {
    const from = snapshot(T1, [course({ courseID: 1 }), course({ courseID: 2 })]);
    const to = snapshot(T2, [course({ courseID: 2 })]);
    const result = diff(from, to);
    expect(result.summary).toEqual({ addedCount: 0, removedCount: 1, changedCount: 0 });
    expect(result.removed.map((c) => c.courseID)).toEqual([1]);
  });

  it('reports changes-only when fields drift on the same courseID', () => {
    const from = snapshot(T1, [
      course({ courseID: 1, title: 'Old Title', hours: 1 }),
      course({ courseID: 2 }),
    ]);
    const to = snapshot(T2, [
      course({ courseID: 1, title: 'New Title', hours: 1.5 }),
      course({ courseID: 2 }),
    ]);
    const result = diff(from, to);
    expect(result.summary).toEqual({ addedCount: 0, removedCount: 0, changedCount: 1 });
    expect(result.changed).toHaveLength(1);
    const change = result.changed[0]!;
    expect(change.courseID).toBe(1);
    expect(change.fields).toEqual(['hours', 'title']);
    expect(change.before.title).toBe('Old Title');
    expect(change.after.title).toBe('New Title');
  });

  it('reports a mix of added/removed/changed and sorts each list by courseID', () => {
    const from = snapshot(T1, [
      course({ courseID: 1, title: 'A' }),
      course({ courseID: 2 }),
      course({ courseID: 4 }),
    ]);
    const to = snapshot(T2, [
      course({ courseID: 1, title: 'A-renamed' }),
      course({ courseID: 3 }), // added
      course({ courseID: 4 }), // unchanged
      course({ courseID: 5 }), // added
    ]);
    const result = diff(from, to);
    expect(result.summary).toEqual({ addedCount: 2, removedCount: 1, changedCount: 1 });
    expect(result.added.map((c) => c.courseID)).toEqual([3, 5]);
    expect(result.removed.map((c) => c.courseID)).toEqual([2]);
    expect(result.changed.map((c) => c.courseID)).toEqual([1]);
    expect(result.changed[0]!.fields).toEqual(['title']);
  });

  it('tracks every relevant field as a change driver (title, code, hours, hoursLabel, courseType, description, releaseDate, archiveDate)', () => {
    const before = course({
      courseID: 1,
      title: 't1',
      code: 'c1',
      hours: 1,
      hoursLabel: '1.00',
      courseType: 1,
      description: 'd1',
      releaseDate: '2026-01-01',
      archiveDate: null,
    });
    const after = course({
      courseID: 1,
      title: 't2',
      code: 'c2',
      hours: 2,
      hoursLabel: '2.00',
      courseType: 2,
      description: 'd2',
      releaseDate: '2026-02-01',
      archiveDate: '2027-01-01',
    });
    const result = diff(snapshot(T1, [before]), snapshot(T2, [after]));
    expect(result.changed[0]!.fields).toEqual([
      'archiveDate',
      'code',
      'courseType',
      'description',
      'hours',
      'hoursLabel',
      'releaseDate',
      'title',
    ]);
  });

  it('treats courseID changes as add + remove, not as a change', () => {
    // If Relias reassigns IDs, that's an upstream catastrophe, not a "renamed
    // field" event. The diff engine honors courseID as the primary key.
    const from = snapshot(T1, [course({ courseID: 1, title: 'Same Title' })]);
    const to = snapshot(T2, [course({ courseID: 2, title: 'Same Title' })]);
    const result = diff(from, to);
    expect(result.summary).toEqual({ addedCount: 1, removedCount: 1, changedCount: 0 });
  });
});
