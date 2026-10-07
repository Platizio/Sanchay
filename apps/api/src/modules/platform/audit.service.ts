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
  'subjectType',
  'subjectIds',
] as const;

/**
 * Plan-01 audit action names. Append-only: the MVP ops SQL views and runbooks key on these exact strings.
 * `AuditEventInput.action` stays `string` so later modules add their own.
 */
export const AUDIT_ACTIONS = {
  AUTH_SIGNUP: 'AUTH_SIGNUP',
  AUTH_LOGIN: 'AUTH_LOGIN',
  AUTH_LOGOUT: 'AUTH_LOGOUT',
  AUTH_SESSIONS_REVOKED_ALL: 'AUTH_SESSIONS_REVOKED_ALL',
  /** Destination locked out: 3 codes burned LOCKED for one (purpose, destination) within 60 min; issues refused for 30 min (B13). */
  AUTH_OTP_LOCKOUT: 'AUTH_OTP_LOCKOUT',
  /** A login OTP was issued and handed to the SMS sender (B19). */
  AUTH_OTP_SENT: 'AUTH_OTP_SENT',
  /** A login OTP verify failed with OTP_INVALID or OTP_EXPIRED (B19). */
  AUTH_OTP_FAILED: 'AUTH_OTP_FAILED',
  /** One code burned: its 5th wrong attempt, or any later attempt on that burned code (OTP_LOCKED, B19). */
  AUTH_OTP_LOCKED: 'AUTH_OTP_LOCKED',
  /** An add-email OTP was issued and sent (B20). */
  CONTACT_EMAIL_OTP_SENT: 'CONTACT_EMAIL_OTP_SENT',
  /** The investor's first email was verified and recorded as CURRENT (B20). */
  CONTACT_EMAIL_VERIFIED: 'CONTACT_EMAIL_VERIFIED',
  /** A consent challenge draft was created (E4). */
  CONSENT_CHALLENGE_CREATED: 'CONSENT_CHALLENGE_CREATED',
  /** A CONSENT OTP was issued for a challenge, by channel (E4). */
  CONSENT_OTP_SENT: 'CONSENT_OTP_SENT',
  /** A challenge was approved and CONSUMED (E4, R-20). */
  CONSENT_APPROVED: 'CONSENT_APPROVED',
  /** approve's DB recompute did not match the stored snapshot hash; the challenge went SUPERSEDED (E4). */
  CONSENT_MISMATCH: 'CONSENT_MISMATCH',
  /** An investor cancelled a not-yet-consumed challenge (E4, R-20). */
  CONSENT_CANCELLED: 'CONSENT_CANCELLED',
  /** consent.expiry.sweep moved a CONSUMED challenge past execute_before, whose saga never started, to CONSUMED_UNUSED (E4, RV-03-1). */
  CONSENT_EXPIRED_SWEPT: 'CONSENT_EXPIRED_SWEPT',
  /** drafts.abandon expired a PENDING challenge nobody approved within 24 h (E4). */
  CONSENT_DRAFT_ABANDONED: 'CONSENT_DRAFT_ABANDONED',
  /** A saga gave up before any P/M write and moved its CONSUMED challenge to CONSUMED_UNUSED; data.reason says why (E4, RV-03-1). */
  CONSENT_MARKED_UNUSED: 'CONSENT_MARKED_UNUSED',
  /** ops:invite CLI write (D7). */
  PILOT_INVITE_ADDED: 'PILOT_INVITE_ADDED',
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
