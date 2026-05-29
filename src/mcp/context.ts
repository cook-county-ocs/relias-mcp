import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pino, type Logger } from 'pino';

import { GitJsonSnapshotStore } from '../lib/git-json-snapshot-store.js';

/**
 * The dependencies F6 MCP tools need, factored for test injection.
 *
 * F6 tools are read-leaning: `get-latest-diff` and `reconcile-catalog`
 * both go through the snapshot store; `force-refresh` hits the GitHub
 * Actions API (no library dependency at all, just a fetch).
 *
 * Why no OidcAuth/SearchApi: the MCP server doesn't fetch Relias data
 * directly — that's the cron's job. The tools surface what the cron
 * has already collected, plus trigger a fresh cron run on demand.
 *
 * Production wiring (`createDefaultMcpContext`) reads env on first
 * factory call. Tests construct a `McpContext` literal with mocks for
 * the store and a stub workflow dispatcher.
 */
export interface McpContext {
  logger: Logger;
  /** Build a snapshot store for read operations. Lazy. */
  buildStore(): GitJsonSnapshotStore;
  /**
   * Dispatch the snapshot workflow on `cook-county-ocs/relias-mcp` via
   * the GitHub Actions workflow_dispatch API. Returns the API response
   * status text.
   *
   * Injectable so tests can assert the call shape without hitting GitHub.
   */
  dispatchWorkflow(input: { reason?: string }): Promise<{ status: number; statusText: string }>;
}

export interface McpEnv {
  /** Snapshots repo remote URL — required for the diff + reconcile tools. */
  RELIAS_SNAPSHOTS_REMOTE?: string;
  /** Optional local clone path — defaults to a tmp dir. */
  RELIAS_SNAPSHOTS_LOCAL?: string;
  /** Branch (default: main). */
  RELIAS_SNAPSHOTS_BRANCH?: string;
  /** Fine-grained PAT for workflow_dispatch (chore C9/C10). */
  RELIAS_GH_DISPATCH_TOKEN?: string;
  /** Repo for workflow dispatch (default: cook-county-ocs/relias-mcp). */
  RELIAS_GH_REPO?: string;
  /** Workflow filename for dispatch (default: snapshot.yml). */
  RELIAS_GH_WORKFLOW?: string;
}

const DEFAULT_REPO = 'cook-county-ocs/relias-mcp';
const DEFAULT_WORKFLOW = 'snapshot.yml';

export function createDefaultMcpContext(logger?: Logger, source: McpEnv = process.env): McpContext {
  const log = logger ?? pino({ level: 'info' }, process.stderr);
  let store: GitJsonSnapshotStore | null = null;

  return {
    logger: log,
    buildStore() {
      if (store !== null) return store;
      const remoteUrl = source.RELIAS_SNAPSHOTS_REMOTE;
      if (!remoteUrl) {
        throw new Error('RELIAS_SNAPSHOTS_REMOTE required for snapshot store operations');
      }
      const localPath =
        source.RELIAS_SNAPSHOTS_LOCAL ?? join(tmpdir(), 'relias-mcp-snapshots-cache');
      store = new GitJsonSnapshotStore({
        remoteUrl,
        localPath,
        branch: source.RELIAS_SNAPSHOTS_BRANCH ?? 'main',
        logger: log,
      });
      return store;
    },
    async dispatchWorkflow(input: { reason?: string }) {
      const token = source.RELIAS_GH_DISPATCH_TOKEN;
      if (!token) {
        throw new Error(
          'RELIAS_GH_DISPATCH_TOKEN required for relias-force-refresh (chore C9/C10)',
        );
      }
      const repo = source.RELIAS_GH_REPO ?? DEFAULT_REPO;
      const workflow = source.RELIAS_GH_WORKFLOW ?? DEFAULT_WORKFLOW;
      const url = `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`;
      // Inputs are workflow-defined; v1 sends an optional `reason` if the
      // workflow accepts it (otherwise GitHub ignores unknown inputs).
      const body = JSON.stringify({
        ref: source.RELIAS_SNAPSHOTS_BRANCH ?? 'main',
        inputs: input.reason ? { reason: input.reason } : {},
      });
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body,
      });
      return { status: res.status, statusText: res.statusText };
    },
  };
}
