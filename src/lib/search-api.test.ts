import { readFileSync } from 'node:fs';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { SearchApi, SchemaDriftError } from './search-api.js';
import type { ReliasSearchResponse } from './schemas/relias-search.js';

const BASE = 'https://searchapi.test';
const ENDPOINT = `${BASE}/api/coursesearch`;

const fixture = JSON.parse(
  readFileSync(new URL('../../test/fixtures/relias-search-response.json', import.meta.url), 'utf8'),
) as ReliasSearchResponse;

const auth = { getAccessToken: async () => 'test-token' };
const makeApi = (over = {}) => new SearchApi(auth, { baseUrl: BASE, backoffMs: 0, ...over });

const server = setupServer();
server.listen({ onUnhandledRequest: 'error' });
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('SearchApi.fetchCopeCatalog', () => {
  it('returns the full catalog on a single page, normalized', async () => {
    server.use(http.post(ENDPOINT, () => HttpResponse.json(fixture)));
    const courses = await makeApi().fetchCopeCatalog();
    expect(courses).toHaveLength(3);
    expect(courses[0]).toMatchObject({
      courseID: 1899526,
      title: 'Building and Leading Successful Teams',
      code: 'REL-ALL-SS-BLST',
      hours: 1,
      hoursLabel: '1.00',
    });
    // 0.15h course preserves the fractional value exactly
    expect(courses[1]).toMatchObject({ courseID: 1888146, hours: 0.15 });
  });

  it('sends the COPE filter, AOIC org, and bearer token', async () => {
    let captured: { authHeader: string | null; body: Record<string, unknown> } | undefined;
    server.use(
      http.post(ENDPOINT, async ({ request }) => {
        captured = {
          authHeader: request.headers.get('authorization'),
          body: (await request.json()) as Record<string, unknown>,
        };
        return HttpResponse.json(fixture);
      }),
    );
    await makeApi().fetchCopeCatalog();
    expect(captured?.authHeader).toBe('Bearer test-token');
    const filters = captured?.body.filters as Record<string, unknown>;
    expect(filters.metaIds).toEqual(['12242']);
    expect(filters.orgID).toBe(20084);
  });

  it('paginates when the server caps page size, with backoff', async () => {
    let requests = 0;
    server.use(
      http.post(ENDPOINT, async ({ request }) => {
        requests += 1;
        const body = (await request.json()) as { currentPage: number };
        const size = 2; // server ignores our pageSize and caps at 2
        const start = (body.currentPage - 1) * size;
        return HttpResponse.json({
          courses: fixture.courses.slice(start, start + size),
          totalCount: fixture.courses.length,
        });
      }),
    );
    const courses = await makeApi({ backoffMs: 1 }).fetchCopeCatalog();
    expect(courses).toHaveLength(3);
    expect(requests).toBe(2); // 2 + 1 across two pages
  });

  it('throws SchemaDriftError (with field path) when a required field is missing', async () => {
    const broken = structuredClone(fixture) as {
      courses: { courseInfo: Record<string, unknown>[] }[];
    };
    delete broken.courses[0]!.courseInfo[0]!.courseCode;
    server.use(http.post(ENDPOINT, () => HttpResponse.json(broken)));

    await expect(makeApi().fetchCopeCatalog()).rejects.toBeInstanceOf(SchemaDriftError);
    try {
      await makeApi().fetchCopeCatalog();
    } catch (err) {
      expect((err as SchemaDriftError).fieldPath).toContain('courseCode');
    }
  });

  it('surfaces a 5xx as a non-drift error (no retry in v1.0)', async () => {
    server.use(http.post(ENDPOINT, () => new HttpResponse(null, { status: 502 })));
    const promise = makeApi().fetchCopeCatalog();
    await expect(promise).rejects.toThrow(/HTTP 502/);
    await expect(promise.catch((e) => e)).resolves.not.toBeInstanceOf(SchemaDriftError);
  });

  it('returns an empty array when the catalog is empty', async () => {
    server.use(http.post(ENDPOINT, () => HttpResponse.json({ courses: [], totalCount: 0 })));
    await expect(makeApi().fetchCopeCatalog()).resolves.toEqual([]);
  });
});
