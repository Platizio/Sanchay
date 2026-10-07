import type { Dispatcher } from 'undici';
import { request } from 'undici';
import { FpAmbiguousError } from './fp-errors.js';
import type { FpAudience } from './fp-operations.js';

export interface FpAudienceCredentials {
  readonly clientId: string;
  readonly clientSecret: string;
}

/** Deviation from the outline: adds `tenantId` (see the D3 brief Interfaces deviation note). */
export interface FpCredentials {
  readonly tenantId: string;
  readonly fp: FpAudienceCredentials;
  readonly poa: FpAudienceCredentials;
  readonly pg: FpAudienceCredentials;
}

export type FpBaseUrls = Record<FpAudience, string>;

interface CachedToken {
  readonly accessToken: string;
  readonly expiresAt: number;
}

/** Tokens are usable until 60s before their reported expiry (research:fp-api SS0, "Token life"). */
const REFRESH_BUFFER_MS = 60_000;
const DEFAULT_EXPIRES_IN_SECONDS = 1800;

function tokenPathFor(audience: FpAudience, tenantId: string): string {
  return audience === 'poa' ? '/v2/auth/cybrillarta/token' : `/v2/auth/${tenantId}/token`;
}

/** Per-audience OAuth client-credentials cache, one in-memory entry each for fp/poa/pg. */
export class FpTokenCache {
  /** Read by FpTransport for the `x-tenant-id` header (audiences fp/pg only, never poa). */
  readonly tenantId: string;
  private readonly tokens = new Map<FpAudience, CachedToken>();
  private readonly inFlight = new Map<FpAudience, Promise<string>>();

  constructor(
    private readonly baseUrls: FpBaseUrls,
    private readonly credentials: FpCredentials,
    private readonly dispatcher: Dispatcher,
    private readonly now: () => number = Date.now,
  ) {
    this.tenantId = credentials.tenantId;
  }

  async tokenFor(audience: FpAudience): Promise<string> {
    const cached = this.tokens.get(audience);
    if (cached !== undefined && cached.expiresAt - REFRESH_BUFFER_MS > this.now()) {
      return cached.accessToken;
    }
    const existing = this.inFlight.get(audience);
    if (existing !== undefined) return existing;
    const promise = this.fetchToken(audience).finally(() => this.inFlight.delete(audience));
    this.inFlight.set(audience, promise);
    return promise;
  }

  private async fetchToken(audience: FpAudience): Promise<string> {
    const { clientId, clientSecret } = this.credentials[audience];
    const url = `${this.baseUrls[audience]}${tokenPathFor(audience, this.credentials.tenantId)}`;
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }).toString();
    let response: Awaited<ReturnType<typeof request>>;
    try {
      response = await request(url, {
        method: 'POST',
        dispatcher: this.dispatcher,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
      });
    } catch (error) {
      throw new FpAmbiguousError(`token.${audience}`, { cause: error });
    }
    const text = await response.body.text();
    if (response.statusCode >= 400) {
      throw new FpAmbiguousError(`token.${audience}`, { status: response.statusCode });
    }
    const parsed = JSON.parse(text) as { access_token: string; expires_in?: number };
    const expiresAt = this.now() + (parsed.expires_in ?? DEFAULT_EXPIRES_IN_SECONDS) * 1000;
    this.tokens.set(audience, { accessToken: parsed.access_token, expiresAt });
    return parsed.access_token;
  }
}
