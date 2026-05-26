#!/usr/bin/env node
/**
 * MCP server entry point. Built out in F6 (P6) with @modelcontextprotocol/sdk
 * over stdio, exposing three tools (LD-RM-07):
 *   relias-get-latest-diff | relias-force-refresh | relias-reconcile-catalog
 *
 * P0 stub: prints identity and exits 0 so `npm run dev:mcp` is wired.
 */
import { PACKAGE_NAME } from './lib/index.js';

console.log(`${PACKAGE_NAME} mcp server — not yet implemented (F6)`);
