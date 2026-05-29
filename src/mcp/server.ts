import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { McpContext } from './context.js';
import {
  getLatestDiffInputShape,
  getLatestDiffOutputShape,
  runGetLatestDiff,
} from './tools/get-latest-diff.js';
import {
  forceRefreshInputShape,
  forceRefreshOutputShape,
  runForceRefresh,
} from './tools/force-refresh.js';
import {
  reconcileCatalogInputShape,
  reconcileCatalogOutputShape,
  runReconcileCatalog,
} from './tools/reconcile-catalog.js';

/**
 * Build a configured MCP server with the three F6 tools registered
 * (`relias-get-latest-diff`, `relias-force-refresh`, `relias-reconcile-catalog`).
 *
 * Doesn't connect a transport — the entry point at `src/mcp.ts` wires
 * up stdio. Tests construct a server with a mock context, register a
 * test transport, and assert tool invocations.
 *
 * Server name and version per spec §6 F6: name is `relias-mcp`, version
 * read from package.json. Reading from package.json at runtime so a
 * `npm version` bump doesn't require a code change.
 */
export function createMcpServer(ctx: McpContext): McpServer {
  const { name, version } = readPackageIdentity();
  const server = new McpServer({ name, version });

  server.registerTool(
    'relias-get-latest-diff',
    {
      title: 'Get the latest Relias catalog diff',
      description:
        'Return the latest saved diff from the snapshots repo, rendered as markdown plus ' +
        'structured ReliasDiff JSON. Optional `since` ISO8601 cutoff filters out diffs that ' +
        "aren't newer than the cutoff (cheap polling).",
      inputSchema: getLatestDiffInputShape,
      outputSchema: getLatestDiffOutputShape,
    },
    async (input) => {
      const result = await runGetLatestDiff(ctx, input);
      return toolResult(result);
    },
  );

  server.registerTool(
    'relias-force-refresh',
    {
      title: 'Trigger a fresh snapshot via GitHub Actions',
      description:
        'Dispatch the snapshot.yml workflow on cook-county-ocs/relias-mcp. Returns immediately; ' +
        'poll `relias-get-latest-diff` afterward to see the result. Optional `reason` is stored ' +
        'in workflow inputs for audit.',
      inputSchema: forceRefreshInputShape,
      outputSchema: forceRefreshOutputShape,
    },
    async (input) => {
      const result = await runForceRefresh(ctx, input);
      return toolResult(result);
    },
  );

  server.registerTool(
    'relias-reconcile-catalog',
    {
      title: 'Reconcile a coordinator catalog file against the latest Relias snapshot',
      description:
        'Parse a PDF/XLSX/CSV/DOCX file and reconcile against the latest Relias snapshot. ' +
        'Returns a markdown report (summary + In Both + Drift Catalog + File Only + Relias ' +
        'Only) plus structured ReconciliationResult JSON.',
      inputSchema: reconcileCatalogInputShape,
      outputSchema: reconcileCatalogOutputShape,
    },
    async (input) => {
      const result = await runReconcileCatalog(ctx, input);
      return toolResult(result);
    },
  );

  return server;
}

/**
 * Wrap a tool's structured result in the MCP SDK's content-array
 * envelope. Per the SDK convention, the human-readable rendering goes
 * as a `text` content item; the structured fields ride along as
 * `structuredContent` for programmatic consumers.
 */
function toolResult(result: { markdown: string } & Record<string, unknown>) {
  return {
    content: [{ type: 'text' as const, text: result.markdown }],
    structuredContent: result,
  };
}

interface PackageIdentity {
  name: string;
  version: string;
}

let cachedIdentity: PackageIdentity | null = null;

function readPackageIdentity(): PackageIdentity {
  if (cachedIdentity !== null) return cachedIdentity;
  // package.json lives two directories above this file (src/mcp/server.ts → ../../package.json)
  const pkgUrl = new URL('../../package.json', import.meta.url);
  const raw = readFileSync(fileURLToPath(pkgUrl), 'utf8');
  const parsed = JSON.parse(raw) as { name?: string; version?: string };
  cachedIdentity = {
    // Spec §6 F6 wants `relias-mcp` not the scoped package name; strip
    // the org prefix.
    name: 'relias-mcp',
    version: parsed.version ?? '0.0.0',
  };
  return cachedIdentity;
}
