import { mkdtempSync } from 'node:fs';
import { writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pino } from 'pino';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createMcpServer } from './mcp/server.js';
import type { McpContext } from './mcp/context.js';
import type { ReliasCourse, ReliasDiff, ReliasSnapshot } from './lib/types.js';

/**
 * F6 MCP server tests. Each test wires a real MCP `Client` to a real
 * `McpServer` (with our three tools registered) via the SDK's
 * in-memory linked-pair transport — exercising the JSON-RPC envelope,
 * the tool registration, the Zod input validation, AND the tool
 * handlers, all in-process.
 *
 * Mocks for the deps: a stub `McpContext` that provides a synthetic
 * snapshot store + a recordable workflow dispatcher.
 */

interface MockStoreState {
  snapshots: ReliasSnapshot[];
  diffs: ReliasDiff[];
}

interface MockContext extends McpContext {
  /** Dispatch calls recorded by the workflow stub for assertions. */
  dispatchCalls: Array<{ reason?: string }>;
}

function makeContext(
  state: MockStoreState = { snapshots: [], diffs: [] },
  dispatchOverride?: () => Promise<{ status: number; statusText: string }>,
): MockContext {
  const logger = pino({ level: 'silent' });
  const dispatchCalls: MockContext['dispatchCalls'] = [];
  const store = {
    async save() {
      throw new Error('save not supported in MCP tools');
    },
    async loadLatest() {
      return state.snapshots.length > 0 ? state.snapshots[state.snapshots.length - 1]! : null;
    },
    async list() {
      return [];
    },
    async loadByMeta() {
      throw new Error('loadByMeta unused');
    },
    async saveDiff() {
      // no-op
    },
    async loadLatestDiff() {
      return state.diffs.length > 0 ? state.diffs[state.diffs.length - 1]! : null;
    },
  };
  return {
    logger,
    buildStore: () => store as unknown as ReturnType<McpContext['buildStore']>,
    dispatchWorkflow: async (input) => {
      dispatchCalls.push({ reason: input.reason });
      return dispatchOverride ? dispatchOverride() : { status: 204, statusText: 'No Content' };
    },
    dispatchCalls,
  };
}

async function connectClient(
  ctx: McpContext,
): Promise<{ client: Client; close: () => Promise<void> }> {
  const server = createMcpServer(ctx);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(clientTransport);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

function course(over: Partial<ReliasCourse> & { courseID: number }): ReliasCourse {
  return {
    title: `Course ${over.courseID}`,
    code: `REL-BHC-0-${over.courseID}`,
    hours: 1,
    hoursLabel: '1.00',
    courseType: 0,
    description: null,
    releaseDate: null,
    archiveDate: null,
    ...over,
  };
}

function snapshot(capturedAt: string, courses: ReliasCourse[]): ReliasSnapshot {
  return { capturedAt, source: 'relias-search-api', totalCount: courses.length, courses };
}

describe('MCP: tool registration', () => {
  it('lists exactly the three F6 tools per LD-RM-07', async () => {
    const { client, close } = await connectClient(makeContext());
    try {
      const result = await client.listTools();
      const names = result.tools.map((t) => t.name).sort();
      expect(names).toEqual([
        'relias-force-refresh',
        'relias-get-latest-diff',
        'relias-reconcile-catalog',
      ]);
    } finally {
      await close();
    }
  });

  it('each tool advertises a description and an input schema', async () => {
    const { client, close } = await connectClient(makeContext());
    try {
      const { tools } = await client.listTools();
      for (const t of tools) {
        expect(t.description).toBeTruthy();
        expect(t.inputSchema).toBeDefined();
      }
    } finally {
      await close();
    }
  });
});

describe('MCP: relias-get-latest-diff', () => {
  it('returns no_diff when the store has no diffs', async () => {
    const { client, close } = await connectClient(makeContext());
    try {
      const result = await client.callTool({ name: 'relias-get-latest-diff', arguments: {} });
      const sc = result.structuredContent as { message: string; diff: unknown };
      expect(sc.message).toBe('no_diff');
      expect(sc.diff).toBeNull();
    } finally {
      await close();
    }
  });

  it('returns the latest diff rendered as markdown + structured', async () => {
    const ctx = makeContext({
      snapshots: [],
      diffs: [
        {
          from: { capturedAt: '2026-05-26T00:00:00Z' },
          to: { capturedAt: '2026-05-27T00:00:00Z' },
          added: [course({ courseID: 1 })],
          removed: [],
          changed: [],
          summary: { addedCount: 1, removedCount: 0, changedCount: 0 },
        },
      ],
    });
    const { client, close } = await connectClient(ctx);
    try {
      const result = await client.callTool({ name: 'relias-get-latest-diff', arguments: {} });
      const sc = result.structuredContent as { message: string; markdown: string };
      expect(sc.message).toBe('ok');
      expect(sc.markdown).toContain('# Relias Catalog Diff Report');
      expect(sc.markdown).toContain('Added: **1**');
    } finally {
      await close();
    }
  });

  it('respects the `since` cutoff', async () => {
    const ctx = makeContext({
      snapshots: [],
      diffs: [
        {
          from: { capturedAt: '2026-05-26T00:00:00Z' },
          to: { capturedAt: '2026-05-27T00:00:00Z' },
          added: [],
          removed: [],
          changed: [],
          summary: { addedCount: 0, removedCount: 0, changedCount: 0 },
        },
      ],
    });
    const { client, close } = await connectClient(ctx);
    try {
      const result = await client.callTool({
        name: 'relias-get-latest-diff',
        arguments: { since: '2026-05-28T00:00:00Z' },
      });
      const sc = result.structuredContent as { message: string };
      expect(sc.message).toBe('no_new_diff_since_cutoff');
    } finally {
      await close();
    }
  });

  it('rejects invalid `since` (Zod validation surfaces as isError result)', async () => {
    const { client, close } = await connectClient(makeContext());
    try {
      const result = await client.callTool({
        name: 'relias-get-latest-diff',
        arguments: { since: 'not-a-datetime' },
      });
      expect(result.isError).toBe(true);
    } finally {
      await close();
    }
  });
});

describe('MCP: relias-force-refresh', () => {
  it('dispatches the workflow and reports success on 204', async () => {
    const ctx = makeContext();
    const { client, close } = await connectClient(ctx);
    try {
      const result = await client.callTool({
        name: 'relias-force-refresh',
        arguments: { reason: 'integration test' },
      });
      const sc = result.structuredContent as { message: string; status: number };
      expect(sc.message).toBe('dispatched');
      expect(sc.status).toBe(204);
      expect(ctx.dispatchCalls).toEqual([{ reason: 'integration test' }]);
    } finally {
      await close();
    }
  });

  it('reports dispatch_failed on non-204 response', async () => {
    const ctx = makeContext({ snapshots: [], diffs: [] }, async () => ({
      status: 401,
      statusText: 'Unauthorized',
    }));
    const { client, close } = await connectClient(ctx);
    try {
      const result = await client.callTool({
        name: 'relias-force-refresh',
        arguments: {},
      });
      const sc = result.structuredContent as { message: string; status: number };
      expect(sc.message).toBe('dispatch_failed');
      expect(sc.status).toBe(401);
    } finally {
      await close();
    }
  });

  it('rejects an over-long `reason` (Zod max 280 → isError result)', async () => {
    const { client, close } = await connectClient(makeContext());
    try {
      const result = await client.callTool({
        name: 'relias-force-refresh',
        arguments: { reason: 'x'.repeat(281) },
      });
      expect(result.isError).toBe(true);
    } finally {
      await close();
    }
  });
});

describe('MCP: relias-reconcile-catalog', () => {
  let scratch: string;
  beforeEach(() => {
    scratch = mkdtempSync(join(tmpdir(), 'mcp-reconcile-'));
  });
  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  it('returns no_snapshot when the store is empty', async () => {
    const filePath = join(scratch, 'test.csv');
    await writeFile(filePath, 'Title\nA\n');
    const { client, close } = await connectClient(makeContext());
    try {
      const result = await client.callTool({
        name: 'relias-reconcile-catalog',
        arguments: { filePath },
      });
      const sc = result.structuredContent as { message: string; result: unknown };
      expect(sc.message).toBe('no_snapshot');
      expect(sc.result).toBeNull();
    } finally {
      await close();
    }
  });

  it('reconciles a CSV against a synthetic snapshot and renders markdown', async () => {
    const filePath = join(scratch, 'test.csv');
    await writeFile(filePath, 'Title,Code\nCourse 1,REL-BHC-0-1\n');
    const ctx = makeContext({
      snapshots: [snapshot('2026-05-28T00:00:00Z', [course({ courseID: 1 })])],
      diffs: [],
    });
    const { client, close } = await connectClient(ctx);
    try {
      const result = await client.callTool({
        name: 'relias-reconcile-catalog',
        arguments: { filePath },
      });
      const sc = result.structuredContent as { message: string; markdown: string };
      expect(sc.message).toBe('ok');
      expect(sc.markdown).toContain('# Relias Catalog Reconciliation Report');
      expect(sc.markdown).toContain('In both (exact-code matches): **1**');
    } finally {
      await close();
    }
  });

  it('rejects empty filePath (Zod min 1 → isError result)', async () => {
    const { client, close } = await connectClient(makeContext());
    try {
      const result = await client.callTool({
        name: 'relias-reconcile-catalog',
        arguments: { filePath: '' },
      });
      expect(result.isError).toBe(true);
    } finally {
      await close();
    }
  });
});
