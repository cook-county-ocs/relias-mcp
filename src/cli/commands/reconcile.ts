import { readFile } from 'node:fs/promises';

import { parserForExtension } from '../../lib/file-parsers/index.js';
import { reconcile } from '../../lib/reconciliation/index.js';
import type { ReconciliationResult } from '../../lib/reconciliation/index.js';
import type { CliContext } from '../context.js';
import { renderMarkdown } from '../render/markdown.js';

/**
 * `relias-mcp reconcile <file>` — parse a coordinator-supplied catalog
 * file (PDF/XLSX/CSV/DOCX), reconcile against the latest Relias snapshot,
 * write a markdown report to stdout (default) or `--output <path>`.
 *
 * `--json` switches the output to JSON for machine consumers (the F6 MCP
 * tool consumes the same shape).
 *
 * Exit codes:
 *  - 0 on success
 *  - 2 schema drift (search API contract change, from F2)
 *  - 3 unsupported file extension (from the parser factory)
 *  - 5 no snapshot in the store to reconcile against
 *  - non-zero other on env / network / parse errors
 */

export interface ReconcileResultPayload {
  /** Markdown report. Always populated regardless of --json. */
  markdown: string;
  /** Structured result for downstream consumers / --json output. */
  result: ReconciliationResult;
}

export class NoSnapshotError extends Error {
  readonly exitCode = 5 as const;
  constructor() {
    super(
      'no Relias snapshot found in the store. Run `relias-mcp snapshot` first ' +
        'or seed the snapshots repo from a captured fixture.',
    );
    this.name = 'NoSnapshotError';
  }
}

export async function runReconcile(
  ctx: CliContext,
  filePath: string,
): Promise<ReconcileResultPayload> {
  const logger = ctx.logger;
  const store = ctx.buildStore();

  logger.info({ filePath }, 'reconcile: loading latest snapshot');
  const snapshot = await store.loadLatest();
  if (snapshot === null) throw new NoSnapshotError();

  logger.info({ filePath }, 'reconcile: parsing input file');
  const parser = parserForExtension(filePath);
  const buffer = await readFile(filePath);
  const parsedEntries = await parser.parse(buffer);
  logger.info(
    { filePath, format: parser.format, count: parsedEntries.length },
    'reconcile: parsed',
  );

  const result = reconcile(parsedEntries, snapshot);
  logger.info({ summary: result.summary }, 'reconcile: complete');

  return {
    markdown: renderMarkdown(result),
    result,
  };
}
