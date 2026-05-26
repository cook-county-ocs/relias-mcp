import { pino, type Logger } from 'pino';
import type { AccessTokenProvider, ReliasCourse } from './types.js';
import {
  reliasSearchResponseSchema,
  type ReliasCourseEntry,
  type ReliasSearchResponse,
} from './schemas/relias-search.js';

const DEFAULT_BASE_URL = 'https://searchapi.reliaslearning.com';
const DEFAULT_ORG_ID = 20084; // AOIC
const DEFAULT_COPE_META_IDS = ['12242']; // COPE tag
const DEFAULT_PAGE_SIZE = 300;
const DEFAULT_BACKOFF_MS = 200;

/**
 * Thrown when the coursesearch response no longer matches the schema we depend
 * on (Relias changed their API). Not a transient failure — the CLI maps this to
 * exit code 2 so the cron's notification step can alert a human (spec §12.3).
 */
export class SchemaDriftError extends Error {
  constructor(
    message: string,
    /** Dotted path to the first offending field, e.g. `courses.0.courseInfo.0.courseCode`. */
    readonly fieldPath: string,
  ) {
    super(message);
    this.name = 'SchemaDriftError';
  }
}

export interface SearchApiOptions {
  /** Override the search API host (tests point this at an msw mock). */
  baseUrl?: string;
  /** AOIC org id. Defaults to 20084. */
  orgId?: number;
  /** COPE meta-id filter. Defaults to ["12242"]. */
  metaIds?: string[];
  /** Page size requested. Defaults to 300; the client paginates if the server caps it. */
  pageSize?: number;
  /** Delay between paginated requests, ms. Defaults to 200. Set 0 in tests. */
  backoffMs?: number;
  logger?: Logger;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Pulls the COPE-approved Relias catalog via `POST /api/coursesearch`.
 *
 * The request body is mostly constant; only `currentPage` varies. We request a
 * large `pageSize` and paginate until `totalCount` courses are collected — this
 * naturally handles the server capping page size (the spec's "300, fall back to
 * 25" behavior) without special-casing it. No retry on 5xx in v1.0 (retry is
 * v1.1): we throw and let the caller exit.
 *
 * NOTE: the COPE filter (`metaIds`) and the full `filters` object are based on
 * the spec + a captured *unfiltered* request; verify against a COPE-applied
 * capture before the live cron (P7).
 */
export class SearchApi {
  readonly #auth: AccessTokenProvider;
  readonly #baseUrl: string;
  readonly #orgId: number;
  readonly #metaIds: string[];
  readonly #pageSize: number;
  readonly #backoffMs: number;
  readonly #log: Logger;

  constructor(auth: AccessTokenProvider, options: SearchApiOptions = {}) {
    this.#auth = auth;
    this.#baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.#orgId = options.orgId ?? DEFAULT_ORG_ID;
    this.#metaIds = options.metaIds ?? DEFAULT_COPE_META_IDS;
    this.#pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
    this.#backoffMs = options.backoffMs ?? DEFAULT_BACKOFF_MS;
    this.#log = options.logger ?? pino();
  }

  /** Fetch every COPE-tagged course, following pagination. */
  async fetchCopeCatalog(): Promise<ReliasCourse[]> {
    const token = await this.#auth.getAccessToken();
    const entries: ReliasCourseEntry[] = [];
    let currentPage = 1;
    let totalCount = Infinity;

    while (entries.length < totalCount) {
      const page = await this.#fetchPage(token, currentPage);
      totalCount = page.totalCount;

      if (page.courses.length === 0) break; // defensive: avoid an infinite loop
      entries.push(...page.courses);
      this.#log.debug(
        { currentPage, got: page.courses.length, collected: entries.length, totalCount },
        'search: fetched page',
      );

      if (entries.length >= totalCount) break;
      currentPage += 1;
      if (this.#backoffMs > 0) await sleep(this.#backoffMs);
    }

    return entries.map(toReliasCourse);
  }

  async #fetchPage(token: string, currentPage: number): Promise<ReliasSearchResponse> {
    const res = await fetch(`${this.#baseUrl}/api/coursesearch`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(this.#requestBody(currentPage)),
    });

    if (!res.ok) {
      // No retry in v1.0 — surface and let the caller exit.
      throw new Error(`coursesearch failed: HTTP ${res.status} ${res.statusText}`);
    }

    const json: unknown = await res.json();
    const parsed = reliasSearchResponseSchema.safeParse(json);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const fieldPath = issue?.path.join('.') ?? '(root)';
      throw new SchemaDriftError(
        `Relias search response failed schema validation at "${fieldPath}": ${issue?.message ?? 'unknown'}`,
        fieldPath,
      );
    }
    return parsed.data;
  }

  /** The coursesearch request body. Constant except `currentPage`. */
  #requestBody(currentPage: number): Record<string, unknown> {
    return {
      searchText: '*',
      searchMode: 'any',
      currentPage,
      pageSize: this.#pageSize,
      searchFields: [],
      filterType: 'Custom',
      filters: {
        orgID: this.#orgId,
        ownerOrgID: null,
        currentlyAvailable: true,
        archived: false,
        notOfCourseTypes: [5, 7],
        metaIds: this.#metaIds,
      },
      orderBy: ['ReleaseDate desc, CourseOrgID desc'],
    };
  }
}

/** Flatten a search entry's nested `courseInfo[0]` into a normalized course. */
function toReliasCourse(entry: ReliasCourseEntry): ReliasCourse {
  const info = entry.courseInfo[0]!; // schema guarantees min(1)
  return {
    courseID: info.courseID,
    title: info.courseTitle,
    code: info.courseCode,
    hours: info.courseHoursNumeric,
    hoursLabel: info.courseHours,
    courseType: info.courseType,
    description: info.courseDescription,
    releaseDate: info.releaseDate,
    archiveDate: info.courseArchiveDate,
  };
}
