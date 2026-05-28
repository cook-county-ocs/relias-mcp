import type { Logger } from 'pino';

/**
 * Shared types for the relias-mcp library.
 *
 * P0 ships only the types the scaffolding needs to compile. Feature phases
 * add to this file as they land:
 *   - F1: OidcTokens, OidcAuthOptions
 *   - F2: ReliasCourse, ReliasSearchResponse (Zod-inferred)
 *   - F3: ReliasSnapshot, SnapshotMeta, ReliasDiff
 *   - F4: ParsedCatalogEntry, ReconciliationResult, driftType enum
 *
 * Type-only file — compiles away, carries no test coverage (see vitest.config.ts).
 */

/** Identifies the build, surfaced by the CLI and MCP server. */
export interface PackageIdentity {
  readonly name: string;
  readonly version: string;
}

// --- F1: OIDC auth ----------------------------------------------------------

/** Tokens returned by the Relias OIDC token endpoint. */
export interface OidcTokens {
  /** Short-lived bearer token used against the search API. */
  accessToken: string;
  /**
   * Refresh token. Relias *may* rotate this on each grant — if it does, the new
   * value must be surfaced/persisted or the cron breaks after one run
   * (spec Open Item §12.1). Handle rotation in the F1 implementation.
   */
  refreshToken: string;
  /** ID token. Never logged (pino redact). */
  idToken?: string;
  /** Absolute access-token expiry, epoch seconds. */
  expiresAt: number;
}

/** Construction options for {@link OidcAuth}. */
export interface OidcAuthOptions {
  /** Initial refresh token, sourced from `RELIAS_OIDC_REFRESH_TOKEN` (chore C8). */
  refreshToken: string;
  /** OIDC issuer. Defaults to `https://login.reliaslearning.com`. */
  issuer?: string;
  /** Public client id (no client secret). Defaults to `rlms-website`. */
  clientId?: string;
  /** Seconds before expiry to proactively refresh. Defaults to 60. */
  refreshSkewSeconds?: number;
  /** Optional pino logger (injectable for tests). Defaults to a redacting logger. */
  logger?: Logger;
}

// --- F2: search API ---------------------------------------------------------

/** Anything that can hand out a bearer token. `OidcAuth` satisfies this. */
export interface AccessTokenProvider {
  getAccessToken(): Promise<string>;
}

/**
 * A COPE catalog course, normalized from the nested `courseInfo[0]` of the
 * search response. `courseID` is the primary key for diffing (F3); `code`,
 * `title`, and `hours` drive reconciliation (F4).
 */
export interface ReliasCourse {
  courseID: number;
  title: string;
  /** Relias course code, e.g. "REL-ALL-SS-BLST". */
  code: string;
  /** Numeric credit hours (from `courseHoursNumeric`). */
  hours: number;
  /** Display hours string, e.g. "1.00" (from `courseHours`). */
  hoursLabel: string;
  courseType: number;
  description: string | null;
  releaseDate: string | null;
  archiveDate: string | null;
}

// --- F3: snapshot store + diff engine ---------------------------------------

/**
 * A frozen capture of the COPE catalog at a moment in time. What F3 persists
 * to the snapshots repo and what F4's reconciliation engine reads as the
 * canonical "what Relias says today."
 */
export interface ReliasSnapshot {
  /** ISO8601 UTC, e.g. `2026-05-27T16:15:30Z`. The primary timestamp surfaced everywhere. */
  capturedAt: string;
  /** Where this snapshot came from. v1.0 always `relias-search-api`; v2 may add others. */
  source: 'relias-search-api';
  /** Number of courses captured (equals `courses.length` — surfaced for sanity-check on reads). */
  totalCount: number;
  /** The captured catalog, primary key is `courseID`. */
  courses: ReliasCourse[];
}

/**
 * Lightweight handle for a snapshot stored in the repo. `list()` and `save()`
 * return these; pass one back to `loadByMeta()` to materialize the full
 * snapshot. The `sha` is the git commit hash (only present after a successful
 * push); local-only saves have it undefined.
 */
export interface SnapshotMeta {
  /** ISO8601 UTC matching the snapshot's `capturedAt`. */
  capturedAt: string;
  /** Path within the snapshots repo, e.g. `snapshots/2026-05-27T16-15-30Z.json`. */
  path: string;
  /** Course count, same as `ReliasSnapshot.totalCount`. */
  totalCount: number;
  /** Git commit SHA of the save, when the store pushed. */
  sha?: string;
}

/**
 * The diff between two consecutive snapshots. Computed by the F3 diff engine,
 * persisted to `diffs/`, and surfaced by the F6 MCP tool `relias-get-latest-diff`.
 * Primary key throughout is `courseID` (LD-RM-12).
 */
export interface ReliasDiff {
  /** The earlier snapshot's identity. */
  from: { capturedAt: string };
  /** The later snapshot's identity. */
  to: { capturedAt: string };
  /** Courses present in `to` but not in `from`. */
  added: ReliasCourse[];
  /** Courses present in `from` but not in `to`. */
  removed: ReliasCourse[];
  /**
   * Courses present in both, where at least one tracked field differs. `fields`
   * lists the names of the changed fields (e.g. `["title", "hours"]`) so
   * consumers don't have to recompute the diff themselves.
   */
  changed: ReliasDiffChange[];
  /** Pre-computed counts to spare consumers a `.length` walk. */
  summary: {
    addedCount: number;
    removedCount: number;
    changedCount: number;
  };
}

/** One entry in `ReliasDiff.changed`. */
export interface ReliasDiffChange {
  courseID: number;
  before: ReliasCourse;
  after: ReliasCourse;
  /** Names of the {@link ReliasCourse} fields whose values differ. Sorted. */
  fields: string[];
}
