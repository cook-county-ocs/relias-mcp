import * as client from 'openid-client';
import { pino, type Logger } from 'pino';
import type { OidcAuthOptions, OidcTokens } from './types.js';

const DEFAULT_ISSUER = 'https://login.reliaslearning.com';
const DEFAULT_CLIENT_ID = 'rlms-website';
const DEFAULT_REFRESH_SKEW_SECONDS = 60;

/** Fields scrubbed from any structured log line (defense in depth). */
const REDACT_PATHS = [
  'access_token',
  'refresh_token',
  'id_token',
  '*.access_token',
  '*.refresh_token',
  '*.id_token',
];

const nowSeconds = (): number => Math.floor(Date.now() / 1000);

/**
 * Holds a refresh token and exchanges it for a short-lived access token,
 * refreshing transparently when the cached token is missing or near expiry.
 *
 * Auth flow (LD-RM-04): OIDC against `login.reliaslearning.com`, public client
 * `rlms-website` (no client secret), refresh-token grant. The access token is
 * cached in memory for the process lifetime; a new grant only happens when the
 * cache is empty or within `refreshSkewSeconds` of expiry.
 *
 * Refresh-token rotation: Relias may return a *new* refresh token on each grant
 * (Open Item §12.1). When it does, the new token replaces the one used for the
 * next grant, so a long-running process keeps working across rotations. Note
 * the v1.0 limitation — the rotated token lives only in memory; if the process
 * restarts, the cron still relies on the bootstrapped `RELIAS_OIDC_REFRESH_TOKEN`
 * (C8). Persisting rotations is a v1.1 concern.
 *
 * Secret hygiene: tokens are never written to logs. Only the access token's
 * expiry timestamp is logged. Pino `redact` is configured as a backstop.
 */
export class OidcAuth {
  private readonly issuer: string;
  private readonly clientId: string;
  private readonly refreshSkewSeconds: number;
  private readonly log: Logger;

  /** Discovered OIDC configuration, fetched once and reused. */
  private config?: client.Configuration;
  /** The refresh token to use for the next grant (updated on rotation). */
  private currentRefreshToken: string;
  /** In-memory access-token cache. */
  private cached?: { accessToken: string; expiresAt: number };

  constructor(options: OidcAuthOptions) {
    this.issuer = options.issuer ?? DEFAULT_ISSUER;
    this.clientId = options.clientId ?? DEFAULT_CLIENT_ID;
    this.refreshSkewSeconds = options.refreshSkewSeconds ?? DEFAULT_REFRESH_SKEW_SECONDS;
    this.currentRefreshToken = options.refreshToken;
    this.log = options.logger ?? pino({ redact: REDACT_PATHS });
  }

  /**
   * Returns a valid access token, refreshing transparently if the cached token
   * is missing or within the skew window of expiry.
   */
  async getAccessToken(): Promise<string> {
    if (this.cached && this.cached.expiresAt - this.refreshSkewSeconds > nowSeconds()) {
      this.log.debug({ expiresAt: this.cached.expiresAt }, 'oidc: using cached access token');
      return this.cached.accessToken;
    }
    const tokens = await this.refresh();
    return tokens.accessToken;
  }

  /** Lazily discover (and cache) the OIDC configuration for a public client. */
  private async getConfig(): Promise<client.Configuration> {
    if (!this.config) {
      this.config = await client.discovery(
        new URL(this.issuer),
        this.clientId,
        undefined,
        client.None(),
      );
    }
    return this.config;
  }

  /** Run the refresh-token grant, update the cache, and handle rotation. */
  private async refresh(): Promise<OidcTokens> {
    const config = await this.getConfig();
    const response = await client.refreshTokenGrant(config, this.currentRefreshToken);

    const expiresAt = nowSeconds() + (response.expires_in ?? 0);
    const rotated = Boolean(response.refresh_token);
    if (response.refresh_token) {
      this.currentRefreshToken = response.refresh_token;
    }
    this.cached = { accessToken: response.access_token, expiresAt };

    this.log.debug({ expiresAt, rotated }, 'oidc: refreshed access token');

    return {
      accessToken: response.access_token,
      refreshToken: this.currentRefreshToken,
      idToken: response.id_token,
      expiresAt,
    };
  }
}
