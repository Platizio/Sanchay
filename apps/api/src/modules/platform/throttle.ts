import type { ExecutionContext } from '@nestjs/common';
import { ClsServiceManager } from 'nestjs-cls';
import type { SanchayClsStore } from './request-context.js';

/**
 * Authenticated: one bucket per session. Anonymous: one bucket per client IP, as resolved by
 * SANCHAY_CLIENT_IP_SOURCE (socket locally; the ALB's rightmost X-Forwarded-For entry in dev/prod, H-1).
 * Runs after SessionGuard, so cls.auth is already set on authenticated routes.
 */
export function throttleTracker(req: Record<string, unknown>): string {
  const cls = ClsServiceManager.getClsService<SanchayClsStore>();
  const auth = cls.isActive() ? cls.get('auth') : null;
  if (auth) return `s:${auth.sessionId}`;
  const ip = cls.isActive() ? cls.get('ip') : null;
  return `ip:${ip ?? (typeof req.ip === 'string' ? req.ip : 'unknown')}`;
}

/** One bucket per tracker across all routes (the library default is per controller and handler). */
export function throttleKey(_ctx: ExecutionContext, tracker: string, name: string): string {
  return `${name}:${tracker}`;
}
