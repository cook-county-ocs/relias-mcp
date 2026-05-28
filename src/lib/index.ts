/**
 * Public API of the relias-mcp library.
 *
 * The library is the product; the CLI (src/cli.ts) and MCP server (src/mcp.ts)
 * are thin layers that compose it. Feature phases re-export their public
 * surface from here (ReliasClient, SnapshotStore, DiffEngine, parsers,
 * ReconciliationEngine).
 */

export type {
  PackageIdentity,
  OidcTokens,
  OidcAuthOptions,
  AccessTokenProvider,
  ReliasCourse,
  ReliasSnapshot,
  SnapshotMeta,
  ReliasDiff,
  ReliasDiffChange,
} from './types.js';
export { OidcAuth } from './oidc-auth.js';
export { SearchApi, SchemaDriftError, type SearchApiOptions } from './search-api.js';
export type { ReliasSearchResponse } from './schemas/relias-search.js';
export type { SnapshotStore, ListOpts } from './snapshot-store.js';
export {
  GitJsonSnapshotStore,
  type GitJsonSnapshotStoreOptions,
} from './git-json-snapshot-store.js';
export { diff } from './diff-engine.js';
export type { ParsedCatalogEntry, FileParser } from './types.js';
export {
  parserForExtension,
  UnsupportedFileFormatError,
  PdfCatalogParser,
  XlsxCatalogParser,
  CsvCatalogParser,
  DocxCatalogParser,
  parseCatalogText,
} from './file-parsers/index.js';

/** The library's package name, as published. */
export const PACKAGE_NAME = '@cook-county-ocs/relias-mcp';
