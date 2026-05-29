#!/usr/bin/env node
/**
 * One-off OIDC diagnostic. Reads RELIAS_OIDC_REFRESH_TOKEN, runs a single
 * refresh-token grant against the Relias IdP, and prints EVERYTHING on
 * the error if it fails — message, cause, body, stack. Use this to
 * diagnose "server responded with an error in the response body" without
 * the rest of the snapshot pipeline obscuring the IdP response.
 *
 * Burns the token. Harvest a fresh one before running.
 *
 *   export RELIAS_OIDC_REFRESH_TOKEN="<fresh token>"
 *   node scripts/diagnose-oidc.mjs
 */
import * as client from 'openid-client';

const ISSUER = 'https://login.reliaslearning.com';
const CLIENT_ID = 'rlms-website';
const token = process.env.RELIAS_OIDC_REFRESH_TOKEN;

if (!token) {
  console.error('RELIAS_OIDC_REFRESH_TOKEN not set');
  process.exit(1);
}

// --- Token-format spot-check (no validation, just visible properties) ---
console.log('Token format check:');
console.log('  length:', token.length);
console.log('  starts:', token.slice(0, 8) + '...');
console.log('  ends:  ...' + token.slice(-8));
console.log('  segments (split on .):', token.split('.').length);

// --- Attempt 1: raw fetch refresh-token grant (no openid-client) ---
console.log('\n--- Attempt 1: raw fetch /connect/token ---');
const rawRes = await fetch(`${ISSUER}/connect/token`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: CLIENT_ID,
    refresh_token: token,
  }),
});
const rawJson = await rawRes.json().catch(() => null);
console.log('  HTTP', rawRes.status, rawRes.statusText);
console.log('  response:', JSON.stringify(rawJson, null, 2));

// --- Attempt 2: openid-client refreshTokenGrant ---
console.log('\n--- Attempt 2: openid-client refreshTokenGrant ---');
try {
  console.log(`Discovering issuer ${ISSUER}…`);
  const config = await client.discovery(new URL(ISSUER), CLIENT_ID, undefined, client.None());
  console.log('  discovered: OK');

  console.log('Calling refreshTokenGrant…');
  const response = await client.refreshTokenGrant(config, token);
  console.log('  GRANT SUCCEEDED');
  console.log('  access_token length:', response.access_token?.length);
  console.log('  expires_in:', response.expires_in);
  console.log('  rotated:', Boolean(response.refresh_token));
  console.log('  scopes:', response.scope);
} catch (err) {
  console.error('\n=== GRANT FAILED ===');
  console.error('Error type:', err?.constructor?.name);
  console.error('Message:', err?.message);
  if (err?.cause) {
    console.error('Cause:', err.cause);
  }
  if (err?.error) console.error('error:', err.error);
  if (err?.error_description) console.error('error_description:', err.error_description);
  if (err?.response) {
    console.error('response.status:', err.response?.status);
    try {
      const body = await err.response.text?.();
      if (body) console.error('response.body:', body);
    } catch {
      /* ignore */
    }
  }
  // openid-client v6 wraps the raw response on certain error subclasses
  for (const key of Object.getOwnPropertyNames(err)) {
    if (
      !['message', 'stack', 'name', 'cause', 'response', 'error', 'error_description'].includes(key)
    ) {
      try {
        console.error(`${key}:`, JSON.stringify(err[key], null, 2)?.slice(0, 500));
      } catch {
        console.error(`${key}: [unserializable]`);
      }
    }
  }
  console.error('\nStack:');
  console.error(err?.stack);
  process.exit(2);
}
