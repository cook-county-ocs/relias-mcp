#!/usr/bin/env node
/**
 * Diagnostic: does the Relias refresh token ROTATE (one-time use)?
 *
 * Performs ONE refresh_token grant and reports whether the response carries a
 * *new, different* refresh token. That answers the P7 question (Open Item §12.1):
 * if the token rotates, the weekly cron must persist the rotated value each run,
 * or it breaks after the first run.
 *
 * Deliberately does a SINGLE refresh — it does not replay the old token, because
 * IdentityServer-style servers treat refresh-token replay as a breach and may
 * revoke the whole token family.
 *
 * ⚠️ Side effect: if the token is one-time-use, this single refresh CONSUMES the
 * stored token and mints a new one. When that happens the script prints the new
 * token so you can update the RELIAS_OIDC_REFRESH_TOKEN secret. Never paste it
 * into chat.
 *
 *   RELIAS_OIDC_REFRESH_TOKEN="<token>" node scripts/check-rotation.mjs
 */
const ISSUER = 'https://login.reliaslearning.com';
const CLIENT_ID = 'rlms-website';
const original = process.env.RELIAS_OIDC_REFRESH_TOKEN;

if (!original) {
  console.error('Set RELIAS_OIDC_REFRESH_TOKEN in the env first (do not hardcode it).');
  process.exit(1);
}

const res = await fetch(`${ISSUER}/connect/token`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: CLIENT_ID,
    refresh_token: original,
  }),
});
const json = await res.json().catch(() => ({}));

if (!res.ok) {
  console.log(`Refresh FAILED (status ${res.status}, ${json.error ?? 'unknown'}).`);
  console.log('The stored token is invalid/expired — re-run C7 (bootstrap-refresh-token.mjs).');
  process.exit(1);
}

const newRt = json.refresh_token;
const rotates = Boolean(newRt) && newRt !== original;

console.log('\n— Rotation check —');
console.log('Refresh succeeded. New refresh_token in response?', newRt ? 'yes' : 'no');
console.log('Differs from the one you supplied?               ', rotates ? 'yes' : 'no');

if (rotates) {
  console.log('\n⚠️ ROTATING refresh tokens (one-time use).');
  console.log('   → P7 cron MUST persist the rotated token after every run.');
  console.log('   → This test just consumed your stored token. Update the');
  console.log('     RELIAS_OIDC_REFRESH_TOKEN secret to the value below:\n');
  console.log(newRt);
} else {
  console.log('\n✅ Non-rotating: the refresh grant did not return a new token.');
  console.log('   Your stored token can be reused as-is — P7 needs no rotation persistence.');
}
