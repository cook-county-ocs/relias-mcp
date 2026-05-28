/**
 * Shared helper for integration tests: skip the test (or the whole
 * `describe` block) when required env vars are missing.
 *
 * Pattern:
 *
 *   describe.skipIf(!hasEnv('RELIAS_OIDC_REFRESH_TOKEN'))('OIDC integration', () => {
 *     it('grants an access token', async () => { ... });
 *   });
 *
 * This keeps the test suite green in environments without credentials
 * (the default `npm test` won't hit these files anyway, but
 * `test:integration` should work even when only SOME of the vars are
 * set — e.g. you can run the F3 snapshot-store test without the
 * OIDC token).
 *
 * Important: emit a single console.warn-style line to stdout when
 * skipping so the test runner makes the silence visible. Without this,
 * a green run could be hiding zero coverage.
 */
export function hasEnv(name: string): boolean {
  const v = process.env[name];
  return v !== undefined && v.trim() !== '';
}

export function hasAllEnv(...names: string[]): boolean {
  return names.every(hasEnv);
}
