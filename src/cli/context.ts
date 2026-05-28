import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Logger } from 'pino';

import { OidcAuth } from '../lib/oidc-auth.js';
import { SearchApi } from '../lib/search-api.js';
import { GitJsonSnapshotStore } from '../lib/git-json-snapshot-store.js';

import { resolveEnv, type EnvSpec } from './env.js';

/**
 * Bundles the dependencies CLI commands need, with lazy factories so
 * each command builds only what it touches. Tests can construct a
 * stub context directly without env vars — commands consume the
 * factories, not real env state.
 *
 * Production path: `createDefaultContext(logger)` resolves env vars and
 * constructs the real subsystems on demand. Throws `MissingEnvError`
 * (exit code 4) if a required env var is missing when a factory fires.
 *
 * Test path: hand-build a `CliContext` object with mock factories that
 * return mock instances. Commands have no way to escape the context, so
 * the tests are fully deterministic.
 */
export interface CliContext {
  logger: Logger;
  /** Build an OidcAuth instance (needs `RELIAS_OIDC_REFRESH_TOKEN`). */
  buildOidc(): OidcAuth;
  /** Build a SearchApi instance (needs OIDC). */
  buildSearchApi(): SearchApi;
  /** Build a SnapshotStore instance (needs `RELIAS_SNAPSHOTS_REMOTE`). */
  buildStore(): GitJsonSnapshotStore;
}

export function createDefaultContext(
  logger: Logger,
  mode: 'snapshot' | 'readonly' | 'inspect' = 'snapshot',
): CliContext {
  // Resolve env up front so missing-var errors surface before any
  // network/disk work. mode='readonly' lets commands like `reconcile`
  // and `diff` run without an OIDC token.
  const env = resolveEnv(mode);

  let oidc: OidcAuth | null = null;
  let searchApi: SearchApi | null = null;
  let store: GitJsonSnapshotStore | null = null;

  return {
    logger,
    buildOidc() {
      if (oidc !== null) return oidc;
      const refreshToken = env.RELIAS_OIDC_REFRESH_TOKEN;
      if (!refreshToken) {
        // Belt-and-suspenders — resolveEnv('snapshot') already throws
        // when this is missing, but `readonly` mode doesn't.
        throw new Error('RELIAS_OIDC_REFRESH_TOKEN required for OIDC operations');
      }
      oidc = new OidcAuth({ refreshToken, logger });
      return oidc;
    },
    buildSearchApi() {
      if (searchApi !== null) return searchApi;
      searchApi = new SearchApi(this.buildOidc(), { logger });
      return searchApi;
    },
    buildStore() {
      if (store !== null) return store;
      const remoteUrl = env.RELIAS_SNAPSHOTS_REMOTE;
      if (!remoteUrl) {
        throw new Error('RELIAS_SNAPSHOTS_REMOTE required for snapshot store operations');
      }
      const localPath = env.RELIAS_SNAPSHOTS_LOCAL ?? join(tmpdir(), 'relias-mcp-snapshots-cache');
      store = new GitJsonSnapshotStore({
        remoteUrl,
        localPath,
        branch: env.RELIAS_SNAPSHOTS_BRANCH ?? 'main',
        logger,
      });
      return store;
    },
  };
}

// Re-export EnvSpec so commands can take a typed env override in tests.
export type { EnvSpec };
