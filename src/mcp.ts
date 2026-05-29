#!/usr/bin/env node
/**
 * MCP server entry point (F6).
 *
 * Wires the `createMcpServer` factory to a stdio transport — the
 * convention for locally-invoked MCP servers (Claude Desktop, Claude
 * Code). The three F6 tools are registered in `src/mcp/server.ts`;
 * this file is just the bootstrap.
 *
 * Logging goes to STDERR (pino destination) so it never pollutes the
 * JSON-RPC traffic on STDOUT, which is what the MCP transport uses.
 *
 * Env required at startup: none. Tools that need env (the snapshots
 * repo URL for diff/reconcile, the GH PAT for force-refresh) fail
 * on their first invocation with a descriptive error — the server
 * itself starts cleanly so the client can introspect tool list.
 */
import { pino } from 'pino';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { PACKAGE_NAME } from './lib/index.js';
import { createDefaultMcpContext } from './mcp/context.js';
import { createMcpServer } from './mcp/server.js';

async function main() {
  // Logger emits to stderr — critical for stdio transport (stdout is
  // owned by the MCP protocol; any log line on stdout would corrupt
  // the JSON-RPC stream).
  const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' }, process.stderr);
  const ctx = createDefaultMcpContext(logger);
  const server = createMcpServer(ctx);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('mcp: server connected over stdio');
}

const isMain = (() => {
  try {
    const scriptUrl = new URL(`file://${process.argv[1]}`).href;
    return import.meta.url === scriptUrl;
  } catch {
    return false;
  }
})();

if (isMain) {
  main().catch((err: unknown) => {
    process.stderr.write(`${PACKAGE_NAME} mcp: fatal: ${String(err)}\n`);
    process.exit(1);
  });
}

export { createMcpServer } from './mcp/server.js';
export { createDefaultMcpContext, type McpContext } from './mcp/context.js';
