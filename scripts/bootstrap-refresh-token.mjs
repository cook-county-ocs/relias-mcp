#!/usr/bin/env node
/**
 * One-time bootstrap: obtain a Relias OIDC *refresh token* via the
 * authorization-code + PKCE flow, requesting `offline_access` (which the SPA
 * itself omits — the reason no refresh token exists in the browser session).
 *
 * This is the revised C7. The `rlms-website` client rejects the password grant
 * (`unauthorized_client`) but allows authorization_code, and the IdP advertises
 * the `offline_access` scope, so a refresh token is obtainable this way.
 *
 * **Output convention** (added 2026-05-28 for shell-capture support):
 *  - All user-visible output (prompts, instructions, status, errors) goes to
 *    STDERR so it's visible in interactive use.
 *  - ONLY the refresh token itself (on success) goes to STDOUT, so a wrapper
 *    script can capture it: `TOKEN=$(node bootstrap-refresh-token.mjs)`.
 *  - Exit code 0 on success, non-zero on failure.
 *
 * Usage:
 *
 *   RELIAS_REDIRECT_URI="<from the console one-liner>" node scripts/bootstrap-refresh-token.mjs
 *
 * No dependencies — Node 22+ built-ins only. Nothing is written to disk; the
 * refresh token is printed to STDOUT for shell capture, paste into the
 * RELIAS_OIDC_REFRESH_TOKEN secret (C8), or both. Do not paste it into chat.
 */
import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import { stdin, stderr } from 'node:process';

const ISSUER = 'https://login.reliaslearning.com';
const CLIENT_ID = 'rlms-website';
const REDIRECT_URI = process.env.RELIAS_REDIRECT_URI;
// Default narrowed 2026-05-28 after discovery: Relias rejects the previous
// `openid profile offline_access search-api` combo with invalid_grant on
// auth-code exchange. `openid offline_access` succeeds. The `search-api`
// scope wasn't a real Relias scope name; access to the search API is
// granted implicitly via the issued bearer token. `profile` may also have
// been the culprit; both removed for safety.
const SCOPE = process.env.RELIAS_SCOPE ?? 'openid offline_access';

if (!REDIRECT_URI) {
  stderr.write(
    'Set RELIAS_REDIRECT_URI first. Find it in the Relias browser console:\n' +
      "  Object.keys(localStorage).filter(k=>k.startsWith('oidc.'))" +
      '.map(k=>{try{return JSON.parse(localStorage[k]).redirect_uri}catch{return null}}).filter(Boolean)\n',
  );
  process.exit(1);
}

const b64url = (buf) =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const verifier = b64url(crypto.randomBytes(32));
const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());

const authUrl = new URL(`${ISSUER}/connect/authorize`);
authUrl.search = new URLSearchParams({
  client_id: CLIENT_ID,
  response_type: 'code',
  response_mode: 'query',
  redirect_uri: REDIRECT_URI,
  scope: SCOPE,
  state: b64url(crypto.randomBytes(8)),
  nonce: b64url(crypto.randomBytes(8)),
  code_challenge: challenge,
  code_challenge_method: 'S256',
}).toString();

stderr.write('\n1) Be logged into Relias in your browser.\n');
stderr.write('2) Open DevTools → Network tab, check "Preserve log".\n');
stderr.write('3) Paste this URL into that browser tab and hit enter:\n\n');
stderr.write(authUrl.toString() + '\n');
stderr.write(
  '\n4) You will be redirected to the callback. The SPA may show an error — ignore it.\n' +
    '   In the Network tab, click the request to your redirect_uri and copy the\n' +
    '   "code" value from its query string (or grab it from the address bar fast).\n',
);

// readline must use stderr for output so prompts don't pollute stdout (where
// only the token belongs). stdin stays as input.
const rl = readline.createInterface({ input: stdin, output: stderr, terminal: true });
const code = (await rl.question('\nPaste the authorization code: ')).trim();
rl.close();

const res = await fetch(`${ISSUER}/connect/token`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  }),
});

const json = await res.json();
stderr.write(`\nToken response status: ${res.status} | keys: ${Object.keys(json).join(', ')}\n`);

if (res.status !== 200) {
  stderr.write(`\n❌ Token exchange failed:\n${JSON.stringify(json, null, 2)}\n`);
  stderr.write(
    '\nCommon causes:\n' +
      '  - Authorization code expired (codes live ~5 min — paste quickly after redirect)\n' +
      '  - Code already used (single-use; re-run bootstrap for a fresh code)\n' +
      '  - PKCE verifier mismatch (only happens if you mix codes between bootstrap runs)\n' +
      '  - Scope rejected by client config (try RELIAS_SCOPE="openid offline_access")\n' +
      '  - Redirect URI mismatch (must match what the client is registered for)\n',
  );
  process.exit(2);
}

if (!json.refresh_token) {
  stderr.write(
    '\n❌ No refresh_token in the response — offline_access was likely not granted to\n' +
      '   this client. Fallback: headless re-auth each cron run (stores username/password).\n',
  );
  stderr.write(
    JSON.stringify(
      { ...json, access_token: json.access_token ? '<present>' : undefined },
      null,
      2,
    ) + '\n',
  );
  process.exit(3);
}

stderr.write(
  '\n✅ refresh_token obtained. Captured on stdout for shell scripts; also visible below.\n' +
    '   Use it in RELIAS_OIDC_REFRESH_TOKEN. Do not paste into chat.\n\n',
);
// ONLY the token goes to stdout — wrapper scripts capture via $()
process.stdout.write(json.refresh_token + '\n');
