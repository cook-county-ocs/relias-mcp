import { readFile } from 'node:fs/promises';
import { z } from 'zod';

import { parserForExtension } from '../../lib/file-parsers/index.js';
import { reconcile } from '../../lib/reconciliation/index.js';
import { renderReconciliationMarkdown } from '../../lib/render/reconciliation-markdown.js';
import type { McpContext } from '../context.js';

/**
 * `relias-reconcile-catalog` MCP tool.
 *
 * Parses a PDF/XLSX/CSV/DOCX file on the MCP host's filesystem,
 * reconciles against the latest Relias snapshot, returns the
 * `ReconciliationResult` rendered as markdown plus structured JSON.
 *
 * Same code path as `relias-mcp reconcile` from F5 — the renderer is
 * shared (moved to `src/lib/render/reconciliation-markdown.ts` for
 * this PR). The CLI and MCP server produce byte-identical reports
 * given the same inputs.
 *
 * Filesystem assumption: the MCP server runs on the user's machine
 * (stdio transport, locally invoked by Claude / Claude Code), so
 * `filePath` is a path the server can read directly. Absolute paths
 * recommended; relative paths resolve from the server's cwd, which is
 * usually the user's project root.
 */

export const reconcileCatalogInputShape = {
  filePath: z
    .string()
    .min(1)
    .describe(
      'Absolute or cwd-relative path to a PDF/XLSX/CSV/DOCX catalog file on the MCP server host.',
    ),
};

export const reconcileCatalogOutputShape = {
  markdown: z.string(),
  result: z.unknown(),
  message: z.string(),
};

export async function runReconcileCatalog(
  ctx: McpContext,
  input: { filePath: string },
): Promise<{ markdown: string; result: unknown; message: string }> {
  ctx.logger.info({ filePath: input.filePath }, 'mcp: reconcile-catalog');
  const store = ctx.buildStore();
  const snapshot = await store.loadLatest();
  if (snapshot === null) {
    return {
      markdown:
        'No Relias snapshot found in the store. Run `relias-mcp snapshot` (or call ' +
        '`relias-force-refresh` and wait for the cron) before reconciling.',
      result: null,
      message: 'no_snapshot',
    };
  }

  const parser = parserForExtension(input.filePath);
  const buffer = await readFile(input.filePath);
  const parsedEntries = await parser.parse(buffer);
  ctx.logger.info(
    { format: parser.format, count: parsedEntries.length },
    'mcp: reconcile-catalog parsed',
  );

  const result = reconcile(parsedEntries, snapshot);
  return {
    markdown: renderReconciliationMarkdown(result),
    result,
    message: 'ok',
  };
}
