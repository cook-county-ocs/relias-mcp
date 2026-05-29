import { z } from 'zod';

import { renderDiffMarkdown } from '../../lib/render/diff-markdown.js';
import type { McpContext } from '../context.js';

/**
 * `relias-get-latest-diff` MCP tool.
 *
 * Returns the latest saved diff from the snapshots repo, rendered as
 * markdown (for the calling LLM to summarize) plus the structured
 * `ReliasDiff` JSON (for programmatic consumers downstream).
 *
 * Input: none required; optional `since` ISO8601 timestamp lets callers
 * ask "any diff newer than this?" — when populated, returns the latest
 * diff only if its `to.capturedAt` > `since`, otherwise reports no new
 * diff is available. Cheap polling for AI workflows.
 *
 * Behavior: read-only. Calls `store.loadLatestDiff()`.
 */

// Use a flat raw-shape per MCP SDK convention (registerTool expects
// `ZodRawShape`, not a wrapped `z.object`).
export const getLatestDiffInputShape = {
  since: z
    .string()
    .datetime({ message: 'since must be ISO 8601 datetime, e.g. 2026-05-28T00:00:00Z' })
    .optional()
    .describe('Only return the diff if its `to.capturedAt` is strictly newer than this.'),
};

export const getLatestDiffOutputShape = {
  markdown: z.string(),
  diff: z.unknown().nullable(),
  message: z.string(),
};

export async function runGetLatestDiff(
  ctx: McpContext,
  input: { since?: string },
): Promise<{ markdown: string; diff: unknown; message: string }> {
  ctx.logger.info({ since: input.since }, 'mcp: get-latest-diff');
  const store = ctx.buildStore();
  const latest = await store.loadLatestDiff();

  if (latest === null) {
    return {
      markdown: 'No diffs in the snapshots repo yet. Run the snapshot cron to produce one.',
      diff: null,
      message: 'no_diff',
    };
  }

  if (input.since !== undefined && latest.to.capturedAt <= input.since) {
    return {
      markdown:
        `Latest diff (\`${latest.to.capturedAt}\`) is not newer than the requested ` +
        `\`since\` cutoff (\`${input.since}\`). Nothing new.`,
      diff: null,
      message: 'no_new_diff_since_cutoff',
    };
  }

  return {
    markdown: renderDiffMarkdown(latest),
    diff: latest,
    message: 'ok',
  };
}
