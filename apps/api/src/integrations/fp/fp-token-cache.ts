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
    let text: string;
    try {
      text = await response.body.text();
    } catch (error) {
      throw new FpAmbiguousError(`token.${audience}`, {
        status: response.statusCode,
        cause: error,
      });
    }
    if (response.statusCode >= 400) {
      throw new FpAmbiguousError(`token.${audience}`, { status: response.statusCode });
    }
    const reply = parseTokenReply(text);
    if (reply === null) {
      throw new FpAmbiguousError(`token.${audience}`, { status: response.statusCode });
    }
    const expiresAt = this.now() + reply.expiresInSeconds * 1000;
    this.tokens.set(audience, { accessToken: reply.accessToken, expiresAt });
    return reply.accessToken;
  }

  /**
   * Drops `token` after FP refused it (401/403), so the next call fetches a fresh one (R-47). A token a
   * concurrent call has already replaced is left alone.
   */
  evict(audience: FpAudience, token: string): void {
    if (this.tokens.get(audience)?.accessToken === token) this.tokens.delete(audience);
  }
}

/**
 * A usable token reply, or null (R-47): a body that is not JSON, an `access_token` that is not a non-empty
 * string, or an `expires_in` that is not a positive number would otherwise cache `Bearer undefined`.
 */
function parseTokenReply(text: string): { accessToken: string; expiresInSeconds: number } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object') return null;
  const { access_token: accessToken, expires_in: expiresIn } = parsed as Record<string, unknown>;
  if (typeof accessToken !== 'string' || accessToken.length === 0) return null;
  if (expiresIn === undefined) return { accessToken, expiresInSeconds: DEFAULT_EXPIRES_IN_SECONDS };
  if (typeof expiresIn !== 'number' || !Number.isFinite(expiresIn) || expiresIn <= 0) return null;
  return { accessToken, expiresInSeconds: expiresIn };
}
