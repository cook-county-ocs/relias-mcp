import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { pino } from 'pino';
import { OidcAuth } from './oidc-auth.js';

const ISSUER = 'https://login.test.reliaslearning.com';
const WELL_KNOWN = `${ISSUER}/.well-known/openid-configuration`;
const TOKEN_ENDPOINT = `${ISSUER}/connect/token`;

const discoveryMetadata = {
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/connect/authorize`,
  token_endpoint: TOKEN_ENDPOINT,
  jwks_uri: `${ISSUER}/.well-known/jwks`,
  response_types_supported: ['code'],
  subject_types_supported: ['public'],
  id_token_signing_alg_values_supported: ['RS256'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
};

/** Per-test recording of token-endpoint traffic. */
let tokenCalls: number;
let seenRefreshTokens: string[];

/** Default token handler: counts calls, records the refresh_token sent, rotates. */
function defaultTokenHandler(expiresIn = 3600) {
  return http.post(TOKEN_ENDPOINT, async ({ request }) => {
    tokenCalls += 1;
    const body = new URLSearchParams(await request.text());
    seenRefreshTokens.push(body.get('refresh_token') ?? '');
    return HttpResponse.json({
      access_token: `access-token-${tokenCalls}`,
      token_type: 'Bearer',
      expires_in: expiresIn,
      refresh_token: `rotated-refresh-${tokenCalls}`,
    });
  });
}

const server = setupServer(
  http.get(WELL_KNOWN, () => HttpResponse.json(discoveryMetadata)),
  defaultTokenHandler(),
);

beforeEach(() => {
  tokenCalls = 0;
  seenRefreshTokens = [];
});
afterEach(() =>
  server.resetHandlers(
    http.get(WELL_KNOWN, () => HttpResponse.json(discoveryMetadata)),
    defaultTokenHandler(),
  ),
);
server.listen({ onUnhandledRequest: 'error' });
afterAll(() => server.close());

const makeAuth = (over: Partial<ConstructorParameters<typeof OidcAuth>[0]> = {}) =>
  new OidcAuth({ refreshToken: 'bootstrap-refresh', issuer: ISSUER, ...over });

describe('OidcAuth', () => {
  it('exchanges the refresh token for an access token on cold start', async () => {
    const auth = makeAuth();
    await expect(auth.getAccessToken()).resolves.toBe('access-token-1');
    expect(tokenCalls).toBe(1);
    expect(seenRefreshTokens[0]).toBe('bootstrap-refresh');
  });

  it('caches the access token in memory across repeated getAccessToken calls', async () => {
    const auth = makeAuth();
    const first = await auth.getAccessToken();
    const second = await auth.getAccessToken();
    expect(first).toBe(second);
    expect(tokenCalls).toBe(1); // second call served from cache
  });

  it('refreshes when expiresAt - refreshSkewSeconds < now', async () => {
    // Token lives 30s but we treat anything within 60s of expiry as stale.
    server.use(defaultTokenHandler(30));
    const auth = makeAuth({ refreshSkewSeconds: 60 });
    const first = await auth.getAccessToken();
    const second = await auth.getAccessToken();
    expect(first).toBe('access-token-1');
    expect(second).toBe('access-token-2'); // forced re-grant
    expect(tokenCalls).toBe(2);
  });

  it('does NOT refresh while the cached token is comfortably valid', async () => {
    const auth = makeAuth({ refreshSkewSeconds: 60 }); // default 3600s lifetime
    await auth.getAccessToken();
    await auth.getAccessToken();
    await auth.getAccessToken();
    expect(tokenCalls).toBe(1);
  });

  it('handles refresh-token rotation (uses the new refresh token on the next grant)', async () => {
    server.use(defaultTokenHandler(30)); // force a second grant
    const auth = makeAuth({ refreshSkewSeconds: 60 });
    await auth.getAccessToken();
    await auth.getAccessToken();
    expect(seenRefreshTokens[0]).toBe('bootstrap-refresh');
    expect(seenRefreshTokens[1]).toBe('rotated-refresh-1'); // rotated value carried forward
  });

  it('never logs access_token, refresh_token, or id_token', async () => {
    const lines: string[] = [];
    const logger = pino(
      { level: 'debug', redact: ['access_token', 'refresh_token', 'id_token'] },
      { write: (s: string) => lines.push(s) },
    );
    const auth = makeAuth({ logger });
    await auth.getAccessToken();
    const output = lines.join('\n');
    expect(output).not.toContain('access-token-1');
    expect(output).not.toContain('bootstrap-refresh');
    expect(output).not.toContain('rotated-refresh-1');
    expect(output).toContain('refreshed access token'); // it did log, just not the secrets
  });

  it('surfaces a clear error when the refresh grant fails', async () => {
    server.use(
      http.post(TOKEN_ENDPOINT, () =>
        HttpResponse.json({ error: 'invalid_grant' }, { status: 400 }),
      ),
    );
    const auth = makeAuth();
    await expect(auth.getAccessToken()).rejects.toThrow();
  });

  it('exposes the rotated refresh token via currentRefreshToken (P7 persistence)', async () => {
    const auth = makeAuth();
    expect(auth.currentRefreshToken).toBe('bootstrap-refresh');
    await auth.getAccessToken();
    expect(auth.currentRefreshToken).toBe('rotated-refresh-1');
  });
});
