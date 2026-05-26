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
