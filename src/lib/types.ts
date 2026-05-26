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
