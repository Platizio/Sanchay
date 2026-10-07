import type { IncomingHttpHeaders } from 'node:http';
import { isIP } from 'node:net';
import type { Platform } from '@sanchay/contract';
import type { ClsStore } from 'nestjs-cls';
import { v7 as uuidv7 } from 'uuid';
import type { ClientIpSource } from '../../config/env.js';

/** Single source of truth is B2's config/env.ts; re-exported for callers of clientIpFrom. */
export type { ClientIpSource } from '../../config/env.js';

export interface ClientInfo {
  platform: Platform;
  /** Web: raw __Host-sanchay_dev cookie value; native: lower-cased x-installation-id (D-2). */
  deviceRef: string | null;
  appVersion: string | null;
}

export interface AuthContext {
  investorId: string;
  sessionId: string;
  deviceId: string;
  platform: Platform;
  via: 'COOKIE' | 'BEARER';
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
}

export interface SanchayClsStore extends ClsStore {
  /** IPv4 only (H-1). Null only on exempt paths; every other request is refused earlier with 422. */
  ip: string | null;
  userAgent: string | null;
  client: ClientInfo | null;
  auth: AuthContext | null;
  /**
   * Set by `runInTx` (db/client.ts, plan-02-mvp-kernel D3) for the lifetime of a DB transaction, so
   * `FpTransport.call` can refuse to run inside one. Always initialised to `false` per request by
   * `AppModule.forRoot` ClsModule setup callback.
   */
  dbInTx: boolean;
}

const REQUEST_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Paths served without a client IP: ALB target-group health checks carry no X-Forwarded-For. */
export const CLIENT_IP_EXEMPT_PATHS: readonly string[] = ['/api/v1/health', '/api/v1/health/ready'];

export function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Keeps an inbound UUID x-request-id (lower-cased); otherwise mints a fresh uuidv7. */
export function requestIdFor(header: string | string[] | undefined): string {
  const v = headerValue(header);
  return v !== undefined && REQUEST_ID_RE.test(v) ? v.toLowerCase() : uuidv7();
}

export function requiresClientIp(url: string): boolean {
  const path = url.split('?', 1)[0] ?? url;
  return !CLIENT_IP_EXEMPT_PATHS.includes(path);
}

function toIpv4(candidate: string | undefined): string | null {
  if (candidate === undefined) return null;
  const value = candidate.trim();
  if (value === '::1') return '127.0.0.1';
  const unmapped = value.toLowerCase().startsWith('::ffff:') ? value.slice(7) : value;
  return isIP(unmapped) === 4 ? unmapped : null;
}

/**
 * Client IPv4 (H-1).
 * - socket (local/test): the TCP peer, `::ffff:` unmapped, `::1` as 127.0.0.1.
 * - alb (dev/staging/prod): the rightmost X-Forwarded-For entry, which the ALB appends
 *   (`xff_header_processing.mode=append`). Entries to its left are client-controlled and ignored.
 * Anything that is not IPv4 gives null; the onRequest hook in bootstrap.ts turns that into 422.
 */
export function clientIpFrom(
  req: { headers: IncomingHttpHeaders; socket?: { remoteAddress?: string | undefined } },
  source: ClientIpSource,
): string | null {
  if (source === 'alb') {
    const raw = req.headers['x-forwarded-for'];
    const joined = Array.isArray(raw) ? raw.join(',') : raw;
    if (joined === undefined) return null;
    const entries = joined.split(',');
    return toIpv4(entries[entries.length - 1]);
  }
  return toIpv4(req.socket?.remoteAddress);
}
