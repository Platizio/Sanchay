import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { DB, type DbExecutor, type DbHandle } from '../../db/client.js';
import { CLOCK, type Clock } from './clock.js';
import { type AuditActorType, type AuditValue, auditEvents } from './platform.schema.js';
import type { SanchayClsStore } from './request-context.js';

/** audit_events.data keeps only these keys, and only primitive values (never PII). */
export const AUDIT_DATA_ALLOWLIST = [
  'platform',
  'purpose',
  'channel',
  'reason',
  'sessionId',
  'deviceId',
  'outcome',
  'isNewInvestor',
  'isNewDevice',
  'challengeId',
  'revokedCount',
  'status',
] as const;

/** Plan-01 action names. `AuditEventInput.action` stays `string` so later modules add their own. */
export const AUDIT_ACTIONS = {
  AUTH_SIGNUP: 'AUTH_SIGNUP',
  AUTH_LOGIN: 'AUTH_LOGIN',
  AUTH_LOGOUT: 'AUTH_LOGOUT',
  AUTH_SESSIONS_REVOKED_ALL: 'AUTH_SESSIONS_REVOKED_ALL',
  AUTH_OTP_LOCKOUT: 'AUTH_OTP_LOCKOUT',
} as const;

export interface AuditEventInput {
  action: string;
  actorType: AuditActorType;
  actorId?: string | null;
  entityType?: string;
  entityId?: string;
  data?: Record<string, unknown>;
  reason?: string;
}

export function allowListed(data: Record<string, unknown> | undefined): Record<string, AuditValue> {
  const out: Record<string, AuditValue> = {};
  if (data === undefined) return out;
  for (const key of AUDIT_DATA_ALLOWLIST) {
    const value = data[key];
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      out[key] = value;
    }
  }
  return out;
}

@Injectable()
export class AuditService {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(ClsService) private readonly cls: ClsService<SanchayClsStore>,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** exec = null: own autocommit write that survives a caller rollback. exec = tx: part of the caller's transaction. */
  async record(exec: DbExecutor | null, input: AuditEventInput): Promise<void> {
    const active = this.cls.isActive();
    await (exec ?? this.dbh.db).insert(auditEvents).values({
      occurredAt: this.clock.now(),
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      action: input.action,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      requestId: active ? this.cls.getId() : null,
      ip: active ? (this.cls.get('ip') ?? null) : null,
      userAgent: active ? (this.cls.get('userAgent') ?? null) : null,
      data: allowListed(input.data),
      reason: input.reason ?? null,
    });
  }
}
