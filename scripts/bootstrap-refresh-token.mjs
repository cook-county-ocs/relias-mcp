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
 * Usage (run locally, while logged into Relias in your browser):
 *
 *   RELIAS_REDIRECT_URI="<from the console one-liner>" node scripts/bootstrap-refresh-token.mjs
 *
 * No dependencies — Node 22+ built-ins only. Nothing is written to disk; the
 * refresh token is printed to YOUR terminal for you to paste into the
 * RELIAS_OIDC_REFRESH_TOKEN secret (C8). Do not paste it into chat.
 */
import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const ISSUER = 'https://login.reliaslearning.com';
const CLIENT_ID = 'rlms-website';
const REDIRECT_URI = process.env.RELIAS_REDIRECT_URI;
const SCOPE = process.env.RELIAS_SCOPE ?? 'openid profile offline_access search-api';

if (!REDIRECT_URI) {
  console.error(
    'Set RELIAS_REDIRECT_URI first. Find it in the Relias browser console:\n' +
      "  Object.keys(localStorage).filter(k=>k.startsWith('oidc.'))" +
      '.map(k=>{try{return JSON.parse(localStorage[k]).redirect_uri}catch{return null}}).filter(Boolean)',
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

console.log('\n1) Be logged into Relias in your browser.');
console.log('2) Open DevTools → Network tab, check "Preserve log".');
console.log('3) Paste this URL into that browser tab and hit enter:\n');
console.log(authUrl.toString());
console.log(
  '\n4) You will be redirected to the callback. The SPA may show an error — ignore it.\n' +
    '   In the Network tab, click the request to your redirect_uri and copy the\n' +
    '   "code" value from its query string (or grab it from the address bar fast).',
);

const rl = readline.createInterface({ input: stdin, output: stdout });
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
console.log('\nToken response status:', res.status, '| keys:', Object.keys(json).join(', '));

if (json.refresh_token) {
  console.log(
    '\n✅ refresh_token obtained. Paste the line below into the\n' +
      '   RELIAS_OIDC_REFRESH_TOKEN secret (C8) — and nowhere else:\n',
  );
  console.log(json.refresh_token);
} else {
  console.log(
    '\n❌ No refresh_token in the response — offline_access was likely not granted to\n' +
      '   this client. Fallback: headless re-auth each cron run (stores username/password).\n',
  );
  console.log(
    JSON.stringify({ ...json, access_token: json.access_token ? '<present>' : undefined }, null, 2),
  );
}
