/**
 * Public API of the relias-mcp library.
 *
 * The library is the product; the CLI (src/cli.ts) and MCP server (src/mcp.ts)
 * are thin layers that compose it. Feature phases re-export their public
 * surface from here (ReliasClient, SnapshotStore, DiffEngine, parsers,
 * ReconciliationEngine).
 */

export type { PackageIdentity } from './types.js';

/** The library's package name, as published. */
export const PACKAGE_NAME = '@cook-county-ocs/relias-mcp';
