import { z } from 'zod';

import type { McpContext } from '../context.js';

/**
 * `relias-force-refresh` MCP tool.
 *
 * Dispatches the `snapshot.yml` workflow on
 * `cook-county-ocs/relias-mcp` via the GitHub Actions
 * workflow_dispatch API. Returns immediately — does NOT wait for the
 * cron run to complete. The caller polls `relias-get-latest-diff`
 * to see when a new diff lands.
 *
 * Why dispatch-and-return rather than run-in-process: the cron has its
 * own deploy key and rotation-persistence behavior; running snapshot
 * in the MCP server process bypasses those and would burn the local
 * caller's OIDC token. The GitHub Actions path is the source of truth.
 *
 * Required (chore C9/C10): `RELIAS_GH_DISPATCH_TOKEN` env var holding
 * a fine-grained PAT with `actions:write` on the relias-mcp repo.
 */

export const forceRefreshInputShape = {
  reason: z
    .string()
    .max(280)
    .optional()
    .describe(
      'Optional human-readable reason for the manual refresh (e.g. "Coordinator reported missing course"). ' +
        'Surfaced in the workflow_dispatch inputs and in audit-like logs.',
    ),
};

export const forceRefreshOutputShape = {
  markdown: z.string(),
  status: z.number(),
  message: z.string(),
};

export async function runForceRefresh(
  ctx: McpContext,
  input: { reason?: string },
): Promise<{ markdown: string; status: number; message: string }> {
  ctx.logger.info({ reason: input.reason }, 'mcp: force-refresh');
  const result = await ctx.dispatchWorkflow({ reason: input.reason });

  // GitHub returns 204 No Content on a successful dispatch. Anything
  // else is an error worth surfacing to the LLM.
  if (result.status === 204) {
    return {
      markdown:
        `Workflow dispatched. The snapshot cron will run shortly on GitHub Actions; ` +
        `poll \`relias-get-latest-diff\` in a minute or two to see the result.` +
        (input.reason ? `\n\nReason recorded: "${input.reason}"` : ''),
      status: 204,
      message: 'dispatched',
    };
  }

  return {
    markdown:
      `Workflow dispatch failed with HTTP ${result.status} ${result.statusText}. ` +
      `Common causes: PAT lacks \`actions:write\`, workflow file renamed, repo ` +
      `or branch wrong. Check \`RELIAS_GH_*\` env vars and the chore C9/C10 setup.`,
    status: result.status,
    message: 'dispatch_failed',
  };
}
