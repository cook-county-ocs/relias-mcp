import { describe, it } from 'vitest';

/**
 * 🎓 F1 exercise — Marty writes these tests *and* the OidcAuth implementation.
 *
 * The `it.todo` markers below are the required coverage (spec §6 F1). Turn each
 * into a real test as you implement `OidcAuth`. Target: ≥80% lines on
 * `oidc-auth.ts` (LD-RM-09). Until then `npm test` will report a coverage
 * shortfall on this file — that gap is the assignment, not a bug.
 *
 * Mocking the IdP — a tooling note before you pick:
 *   `openid-client` v6 issues requests via native `fetch` (undici). `nock`
 *   patches Node's `http`/`https` modules and does NOT reliably intercept
 *   native fetch, so prefer `msw` (which intercepts at the fetch layer).
 *   Add `msw@^2` as a devDependency and stand up a token-endpoint handler.
 */
describe('OidcAuth', () => {
  it.todo('exchanges the refresh token for an access token on cold start');
  it.todo('caches the access token in memory across repeated getAccessToken calls');
  it.todo('refreshes when expiresAt - refreshSkewSeconds < now');
  it.todo('does NOT refresh while the cached token is still comfortably valid');
  it.todo('handles refresh-token rotation (a new refresh token returned on grant)');
  it.todo('never logs access_token, refresh_token, or id_token (pino redact)');
  it.todo('surfaces a clear error when the refresh grant fails');
});
