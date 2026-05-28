import { beforeAll, describe, expect, it } from 'vitest';

import { OidcAuth } from '../../src/lib/oidc-auth.js';
import { SearchApi } from '../../src/lib/search-api.js';
import type { ReliasCourse } from '../../src/lib/types.js';
import { hasEnv } from './_skip-when-missing-env.js';

/**
 * F2 integration test against the real Relias search API at
 * `searchapi.reliaslearning.com`.
 *
 * **Single shared OidcAuth + SearchApi + fetched catalog via beforeAll**
 * — the rotation issue (LD-RM-16) means each separate `new OidcAuth(env)`
 * burns the env token a fresh time. One shared instance does one grant
 * total; multiple `fetchCopeCatalog()` calls would re-use the cached
 * access token, but even one fetch is enough to exercise the contract,
 * so we hoist the fetch itself too — both tests assert against the
 * same snapshot of the catalog.
 *
 * Cross-file caveat: vitest's per-file worker isolation means the F1
 * OidcAuth test (separate file) will burn its own envToken. Use the
 * F5 CLI cron rehearsal if you want one token to cover both surfaces.
 *
 * Required env:
 *  - RELIAS_OIDC_REFRESH_TOKEN
 */
describe.skipIf(!hasEnv('RELIAS_OIDC_REFRESH_TOKEN'))('F2 SearchApi — real Relias', () => {
  let courses: ReliasCourse[];

  beforeAll(async () => {
    const oidc = new OidcAuth({ refreshToken: process.env.RELIAS_OIDC_REFRESH_TOKEN! });
    const api = new SearchApi(oidc);
    courses = await api.fetchCopeCatalog();
  });

  it('fetches the full COPE catalog end-to-end', () => {
    expect(Array.isArray(courses)).toBe(true);
    expect(courses.length).toBeGreaterThan(100);
    expect(courses.length).toBeLessThan(1000); // sanity upper bound
  });

  it('returns courses with all required fields populated', () => {
    // Spot-check the first 5 courses for required fields.
    for (const course of courses.slice(0, 5)) {
      expect(typeof course.courseID).toBe('number');
      expect(typeof course.title).toBe('string');
      expect(course.title.length).toBeGreaterThan(0);
      expect(typeof course.code).toBe('string');
      expect(course.code).toMatch(/^(REL|APPA|AOIC|COPE)-/);
      expect(typeof course.hours).toBe('number');
      expect(course.hours).toBeGreaterThanOrEqual(0);
    }
  });
});
