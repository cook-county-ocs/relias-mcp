import { defineConfig } from 'vitest/config';

/**
 * Vitest config for integration tests — the ones that hit real external
 * surfaces (Relias IdP, Relias search API, cook-county-ocs/ocs-relias-
 * snapshots remote) and need real credentials.
 *
 * Selected via `npm run test:integration`. Default `npm test` uses
 * `vitest.config.ts` and never runs these.
 *
 * Each integration test skips itself with `it.skipIf(!process.env.X)`
 * when its required env vars are missing, so the suite still passes
 * in environments without credentials (it just runs fewer tests).
 *
 * No coverage gating — integration tests exercise wiring, not branches,
 * and the unit tests already enforce 80% in `vitest.config.ts`.
 *
 * Longer per-test timeout because real network calls take time —
 * cloning a git remote can be 5-10s on a cold connection.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/integration/**/*.integration.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
