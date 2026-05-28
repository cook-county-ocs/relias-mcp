import { beforeAll, describe, expect, it } from 'vitest';

import { OidcAuth } from '../../src/lib/oidc-auth.js';
import { hasEnv } from './_skip-when-missing-env.js';

/**
 * F1 integration test against the real Relias IdP at
 * `login.reliaslearning.com`.
 *
 * **Single shared OidcAuth instance via beforeAll** — because Relias
 * rotates the refresh token on every grant (LD-RM-16, one-time use),
 * each `new OidcAuth(envToken)` call would burn the env-supplied token
 * a fresh time. The first test would succeed, the rest would fail
 * with auth errors. Sharing one instance means one grant + one
 * rotation; subsequent `getAccessToken()` calls return the cached
 * access token until expiry. `initialRefreshToken` snapshot lets us
 * assert the rotation post-hoc.
 *
 * Cross-file caveat: vitest's per-file worker isolation means the
 * SearchApi integration test (separate file) will burn its own
 * envToken. Run one OIDC-touching file per harvested token, or use
 * the F5 CLI cron rehearsal which exercises F1+F2+F3 in one grant.
 *
 * Required env:
 *  - RELIAS_OIDC_REFRESH_TOKEN — a fresh refresh token harvested via
 *    `scripts/bootstrap-refresh-token.mjs` per chore C7.
 */
describe.skipIf(!hasEnv('RELIAS_OIDC_REFRESH_TOKEN'))('F1 OidcAuth — real IdP', () => {
  let oidc: OidcAuth;
  let initialRefreshToken: string;
  let firstAccessToken: string;

  beforeAll(async () => {
    initialRefreshToken = process.env.RELIAS_OIDC_REFRESH_TOKEN!;
    oidc = new OidcAuth({ refreshToken: initialRefreshToken });
    firstAccessToken = await oidc.getAccessToken();
  });

  it('grants a JWT-shaped access token from a refresh token', () => {
    expect(typeof firstAccessToken).toBe('string');
    expect(firstAccessToken.length).toBeGreaterThan(50);
    // JWT-shaped: three base64-url segments separated by '.'
    expect(firstAccessToken.split('.')).toHaveLength(3);
  });

  it('caches the access token within its lifetime (no second IdP round-trip)', async () => {
    const second = await oidc.getAccessToken();
    expect(second).toBe(firstAccessToken);
  });

  it('surfaces the rotated refresh token after the grant (chore C14)', () => {
    // Per LD-RM-16, Relias rotates the refresh token on each grant.
    // If Relias ever stops rotating (non-rotation mode), this assertion
    // fires and we re-evaluate C14's PAT requirement.
    const rotated = oidc.currentRefreshToken;
    expect(typeof rotated).toBe('string');
    expect(rotated.length).toBeGreaterThan(50);
    expect(rotated).not.toBe(initialRefreshToken);
  });
});
