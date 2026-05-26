import type { OidcAuthOptions } from './types.js';

/**
 * OidcAuth — 🎓 F1 exercise. **Marty implements the body; tests too.**
 *
 * Holds a refresh token and exchanges it for a short-lived access token,
 * refreshing transparently when expiry is near. This is the conceptual heart
 * of "Plan A" — the whole build rests on this working.
 *
 * Requirements (spec §6 F1):
 *   - Use `openid-client` v6's `Issuer.discover()` against the issuer
 *     (default `https://login.reliaslearning.com`).
 *   - Public client `rlms-website` — no client secret.
 *   - Initial refresh token comes from `options.refreshToken`
 *     (sourced from `RELIAS_OIDC_REFRESH_TOKEN`, chore C8).
 *   - Cache the access token in memory for the process lifetime.
 *   - Refresh when `expiresAt - refreshSkewSeconds < now` (skew default 60s).
 *   - Refresh-token rotation: Relias may return a *new* refresh token on each
 *     grant. Handle it (surface/persist) or the cron breaks after one run
 *     (Open Item §12.1).
 *
 * Secret hygiene (non-negotiable):
 *   - Log the access token's *expiry timestamp*, never the token itself.
 *   - Configure pino `redact` to scrub `access_token`, `refresh_token`, and
 *     `id_token` from any structured log.
 *
 * Deps to add when you implement: `openid-client@^6`, `pino@^9`.
 */
export class OidcAuth {
  constructor(private readonly options: OidcAuthOptions) {}

  /**
   * Returns a valid access token, refreshing transparently if it's missing or
   * within the skew window of expiry.
   */
  async getAccessToken(): Promise<string> {
    // TODO(F1 🎓): discover the issuer, run the refresh-token grant, cache the
    // result in memory, and only re-grant when inside the skew window.
    // Reference `this.options` for issuer / clientId / refreshToken / skew.
    throw new Error('OidcAuth.getAccessToken is not implemented yet (F1 🎓 exercise)');
  }
}
