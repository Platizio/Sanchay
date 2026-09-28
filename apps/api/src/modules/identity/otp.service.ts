import { createHash, createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, gt, gte, inArray, isNull, lt, type SQL, sql } from 'drizzle-orm';
import { AppConfig } from '../../config/app-config.js';
import { DB, type DbExecutor, type DbHandle, type Tx } from '../../db/client.js';
import { EMAIL_SENDER, type EmailSender } from '../../integrations/email/port.js';
import { EMAIL_TEMPLATE_IDS, emailOtpMessage } from '../../integrations/email/templates.js';
import {
  SenderUnavailableError,
  type SendResult,
  SMS_SENDER,
  type SmsSender,
} from '../../integrations/sms/port.js';
import {
  type ConsentSms,
  loginSmsText,
  renderConsentSms,
  SMS_TEMPLATE_IDS,
} from '../../integrations/sms/templates.js';
import { AUDIT_ACTIONS, AuditService } from '../platform/audit.service.js';
import { CLOCK, type Clock, DAY, HOUR, MINUTE, SECOND } from '../platform/clock.js';
import { Crypto } from '../platform/crypto.js';
import { AppError } from '../platform/errors.js';
import { asRowId, newId, UUID_RE } from '../platform/ids.js';
import { KEY_SERVICE, type KeyService } from '../platform/key-service.js';
import { pgErrorCodeOf } from '../platform/pg-errors.js';
import { type OtpChannel, type OtpPurpose, otpCodes } from './identity.schema.js';
import { maskEmail, maskMobile } from './masking.js';

/** H-3 and delta §5.4. There is no bypass, master code or dev endpoint in any build. */
export const OTP_POLICY = {
  ttlMs: 5 * MINUTE,
  maxAttempts: 5,
  cooldownMs: 30 * SECOND,
  perDestinationPerHour: 5,
  perDestinationPerDay: 15,
  /** Default only. Enforced value: env SANCHAY_OTP_PER_IP_PER_HOUR, pinned to 20 outside local/test by the B2 boot guard. */
  perIpPerHour: 20,
  perDevicePerHour: 10,
  lockoutBurns: 3,
  lockoutWindowMs: HOUR,
  lockoutMs: 30 * MINUTE,
  smsPerIstDay: 2_000,
  /** D-17 (R-07): the synchronous OTP send waits at most 5 s for the provider, then 503. */
  sendTimeoutMs: 5 * SECOND,
} as const;

const IST_OFFSET_MS = 330 * MINUTE;

/**
 * H-3 (precedence 1, binding spec): the per-destination hour/day, per-IP and per-device quotas below are
 * shared only by LOGIN and VERIFY_EMAIL. CONSENT has its own regime — at most 3 sends per challenge, a
 * 30 s cooldown and at most 10 consent sends per investor per hour — owned by the Plan-03 consent engine
 * (E4, `sendOtp`, `docs/superpowers/plans/2026-09-28-plans-02-04-outlines.md:403`), not by this service.
 * Fix for the B13 round-1 review finding: a CONSENT row must never count toward, or be blocked by, the
 * shared LOGIN/VERIFY_EMAIL budget for the same destination/IP/device. Lockout, the 30 s cooldown and the
 * global SMS cap are unaffected: they still apply to every purpose.
 */
const SHARED_QUOTA_PURPOSES: readonly OtpPurpose[] = ['LOGIN', 'VERIFY_EMAIL'];

/** A small, separate connection pool for OtpService.verify's pool-side bookkeeping (round-1 fix for the
 * B14 review finding). verify's row select, guarded attempt bump, burns and lockout audit must never draw
 * from the same pool a caller's own open transaction (`exec`) may have fully checked out — otherwise
 * enough concurrent `verify(tx, ...)` callers permanently deadlock the whole pool. Whoever wires OtpService
 * into a Nest module (B19/identity module) must provide this as its own small `DbHandle`
 * (`createDb(env.DATABASE_URL, 2..4)`), separate from the `DB` token, and close it on shutdown too. */
export const OTP_BOOKKEEPING_DB = Symbol('OTP_BOOKKEEPING_DB');

/** D-17 (R-07): rejects with SenderUnavailableError when the provider has not answered within `timeoutMs`. */
export async function withSendTimeout<T>(send: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new SenderUnavailableError(`otp send timed out after ${timeoutMs} ms`)),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([send, timedOut]);
  } finally {
    clearTimeout(timer);
  }
}

/** Start of the Indian calendar day (UTC+05:30) that contains `at`. */
export function istDayStart(at: Date): Date {
  return new Date(Math.floor((at.getTime() + IST_OFFSET_MS) / DAY) * DAY - IST_OFFSET_MS);
}

/**
 * 64-bit key for pg_advisory_xact_lock. A namespaced SHA-256 prefix rather than hashtext(): 32-bit
 * hashtext collisions between two different scopes would be far likelier, and the keys must be known
 * client-side so they can be taken in one global (ascending) order, which rules out lock-order deadlocks.
 */
export function otpAdvisoryKey(name: string): bigint {
  return createHash('sha256').update(`sanchay:${name}`).digest().readBigInt64BE(0);
}

/**
 * `burnsNewestFirst`: consumed_at of the newest LOCKED codes for one (purpose, destination), newest first.
 * Returns when the lockout ends, or null when no lockout is active at `now`.
 */
export function lockoutEndsAt(burnsNewestFirst: readonly Date[], now: Date): Date | null {
  const newest = burnsNewestFirst[0];
  const oldestCounted = burnsNewestFirst[OTP_POLICY.lockoutBurns - 1];
  if (newest === undefined || oldestCounted === undefined) return null;
  if (newest.getTime() - oldestCounted.getTime() > OTP_POLICY.lockoutWindowMs) return null;
  const endsAt = new Date(newest.getTime() + OTP_POLICY.lockoutMs);
  return endsAt.getTime() > now.getTime() ? endsAt : null;
}

export interface OtpDestination {
  channel: OtpChannel;
  value: string;
}

export interface IssueOtpInput {
  purpose: OtpPurpose;
  destination: OtpDestination;
  referenceId?: string | null;
  ip: string | null;
  deviceRefHash?: Buffer | null;
  /** Required for purpose CONSENT over SMS (consent engine, Plan 03): picks one of the three R-10 consent templates. */
  consentSms?: ConsentSms;
}

export interface IssuedOtp {
  challengeId: string;
  expiresAt: Date;
  resendAfterSeconds: number;
  destinationMasked: string;
}

export interface VerifyOtpInput {
  challengeId: string;
  purpose: OtpPurpose;
  code: string;
}

export interface VerifiedOtp {
  otpId: string;
  channel: OtpChannel;
  destination: string;
  destinationBidx: Buffer;
}

interface RenderedOtp {
  templateId: string;
  subject: string;
  text: string;
}

export function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

function consumedError(reason: string | null): AppError {
  if (reason === 'LOCKED') return new AppError('OTP_LOCKED');
  if (reason === 'EXPIRED') return new AppError('OTP_EXPIRED');
  return new AppError('OTP_INVALID');
}

@Injectable()
export class OtpService {
  private readonly log = new Logger(OtpService.name);

  /** D-17 (R-07) provider timeout. A test seam only: production always uses OTP_POLICY.sendTimeoutMs (5 s). */
  sendTimeoutMs: number = OTP_POLICY.sendTimeoutMs;

  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(OTP_BOOKKEEPING_DB) private readonly bookkeepingDb: DbHandle,
    @Inject(Crypto) private readonly crypto: Crypto,
    @Inject(KEY_SERVICE) private readonly keys: KeyService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /**
   * The challengeId returned here IS otp_codes.id (H-5). The send is synchronous (deviation D-17, R-07):
   * it runs after the transaction has committed and waits at most `sendTimeoutMs`.
   *
   * Race safety (B13 ledger, final review): every quota below is read-then-insert, so the transaction first
   * takes transaction-scoped advisory locks on the destination, the IP, the device and (SMS only) the global
   * IST-day SMS budget, and only then counts and inserts. A concurrent issue sharing any of those scopes
   * waits for this commit and then counts this row, so no burst can pass the cooldown or a cap.
   */
  async issue(input: IssueOtpInput): Promise<IssuedOtp> {
    const now = this.clock.now();
    const id = newId('otp_codes');
    const code = generateOtpCode();
    const message = this.render(input, code);
    const referenceId = input.referenceId ?? null;
    const destinationBidx = this.destinationBidx(input.destination);
    await this.assertNotLockedOut(input, destinationBidx, now);

    const pepperKid = this.keys.currentOtpPepperKid;
    const destinationMasked =
      input.destination.channel === 'SMS'
        ? maskMobile(input.destination.value)
        : maskEmail(input.destination.value);
    const expiresAt = new Date(now.getTime() + OTP_POLICY.ttlMs);

    let supersededIds: string[];
    try {
      supersededIds = await this.dbh.db.transaction(
        async (tx) => {
          await this.lockIssueScopes(tx, input, destinationBidx);
          await this.assertWithinQuotas(tx, input, referenceId, destinationBidx, now);
          const superseded = await tx
            .update(otpCodes)
            .set({ consumedAt: now, consumedReason: 'SUPERSEDED' })
            .where(
              and(
                this.scope(input.purpose, destinationBidx, referenceId),
                isNull(otpCodes.consumedAt),
              ),
            )
            .returning({ id: otpCodes.id });
          await tx.insert(otpCodes).values({
            id,
            createdAt: now,
            purpose: input.purpose,
            channel: input.destination.channel,
            destinationBidx,
            destinationMasked,
            destinationEnc: this.crypto.encrypt(input.destination.value, {
              table: 'otp_codes',
              column: 'destination_enc',
              rowId: id,
            }),
            pepperKid,
            referenceId,
            codeHmac: this.codeHmac(pepperKid, input.purpose, destinationBidx, id, code),
            attempts: 0,
            expiresAt,
            ip: input.ip,
            deviceRefHash: input.deviceRefHash ?? null,
            templateId: message.templateId,
          });
          return superseded.map((r) => r.id);
        },
        { isolationLevel: 'read committed' },
      );
    } catch (error) {
      // Backstop: a concurrent issue for the same scope won otp_codes_live_scope_uq.
      if (pgErrorCodeOf(error) === '23505') {
        throw new AppError('OTP_COOLDOWN', { retryAfterSeconds: OTP_POLICY.cooldownMs / SECOND });
      }
      throw error;
    }

    let result: SendResult;
    try {
      const send =
        input.destination.channel === 'SMS'
          ? this.sms.send({
              to: input.destination.value,
              text: message.text,
              templateId: message.templateId,
            })
          : this.email.send({
              to: input.destination.value,
              subject: message.subject,
              text: message.text,
              templateId: message.templateId,
            });
      result = await withSendTimeout(send, this.sendTimeoutMs);
    } catch (cause) {
      await this.undoUndeliveredIssue(id, supersededIds, now);
      throw new AppError(
        input.destination.channel === 'SMS' ? 'SMS_UNAVAILABLE' : 'PROVIDER_UNAVAILABLE',
        {
          retryable: true,
          cause,
        },
      );
    }
    await this.dbh.db
      .update(otpCodes)
      .set({ provider: result.provider, providerMessageId: result.messageId })
      .where(eq(otpCodes.id, id));
    return {
      challengeId: id,
      expiresAt,
      resendAfterSeconds: OTP_POLICY.cooldownMs / SECOND,
      destinationMasked,
    };
  }

  /**
   * An undelivered (or timed-out) code must not burn cooldown or quota, and must not cost the investor the
   * code they already hold: the new row is deleted and the row(s) this call superseded are made live again.
   * Best effort: a cleanup failure is logged and swallowed, so it can never replace the caller's 503 mapping
   * (SMS_UNAVAILABLE / PROVIDER_UNAVAILABLE) or lose the provider cause.
   */
  private async undoUndeliveredIssue(
    id: string,
    supersededIds: readonly string[],
    supersededAt: Date,
  ): Promise<void> {
    try {
      await this.dbh.db.delete(otpCodes).where(eq(otpCodes.id, id));
    } catch (error) {
      this.log.error(
        `otp.issue_cleanup_failed: could not delete undelivered otp ${id} (${pgErrorCodeOf(error) ?? 'no sqlstate'})`,
      );
      // The undelivered row is still live, so a restore would collide with otp_codes_live_scope_uq.
      return;
    }
    if (supersededIds.length === 0) return;
    try {
      await this.dbh.db
        .update(otpCodes)
        .set({ consumedAt: null, consumedReason: null })
        .where(
          and(
            inArray(otpCodes.id, [...supersededIds]),
            eq(otpCodes.consumedReason, 'SUPERSEDED'),
            eq(otpCodes.consumedAt, supersededAt),
          ),
        );
    } catch (error) {
      // Typically 23505: a newer issue for the same scope already holds the live slot, which is fine.
      this.log.error(
        `otp.issue_cleanup_failed: could not restore superseded otp ${supersededIds.join(',')} (${pgErrorCodeOf(error) ?? 'no sqlstate'})`,
      );
    }
  }

  /**
   * Transaction-scoped advisory locks (released at commit or rollback) that serialize the read-then-insert
   * quota checks: destination (cooldown, per-destination hour/day), IP and device (shared LOGIN/VERIFY_EMAIL
   * quotas) and one global key for the 2,000 SMS per IST day cap. Taken in ascending key order, so two
   * issues can never deadlock on each other.
   */
  private async lockIssueScopes(
    tx: Tx,
    input: IssueOtpInput,
    destinationBidx: Buffer,
  ): Promise<void> {
    const names = [`otp-dest:${destinationBidx.toString('hex')}`];
    if (SHARED_QUOTA_PURPOSES.includes(input.purpose)) {
      if (input.ip !== null) names.push(`otp-ip:${input.ip}`);
      const device = input.deviceRefHash ?? null;
      if (device !== null) names.push(`otp-device:${device.toString('hex')}`);
    }
    if (input.destination.channel === 'SMS') names.push('otp-sms-day');
    const keys = [...new Set(names.map(otpAdvisoryKey))].sort((a, b) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    for (const key of keys) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${key.toString()}::bigint)`);
    }
  }

  /**
   * Attempt increments, burns and the lockout audit are committed on the pool, so they survive any caller rollback.
   * The final consume runs on `exec`, so it commits or rolls back with the caller's transaction.
   */
  async verify(exec: DbExecutor, input: VerifyOtpInput): Promise<VerifiedOtp> {
    if (!UUID_RE.test(input.challengeId)) throw new AppError('OTP_INVALID');
    const now = this.clock.now();
    const otpId = asRowId('otp_codes', input.challengeId);
    // Pool-side bookkeeping runs on its own small pool, never on `this.dbh.db`: `exec` may already be a
    // transaction the caller checked a connection out of on the main pool, and enough concurrent callers
    // would otherwise deadlock it (round-1 fix). Only the final consume below runs on `exec`.
    const db = this.bookkeepingDb.db;

    const [row] = await db
      .select()
      .from(otpCodes)
      .where(and(eq(otpCodes.id, otpId), eq(otpCodes.purpose, input.purpose)))
      .limit(1);
    if (row === undefined) throw new AppError('OTP_INVALID');
    if (row.consumedAt !== null) throw consumedError(row.consumedReason);

    if (row.expiresAt.getTime() <= now.getTime()) {
      await this.burn(row.id, 'EXPIRED', now);
      throw new AppError('OTP_EXPIRED');
    }

    const [bumped] = await db
      .update(otpCodes)
      .set({ attempts: sql`${otpCodes.attempts} + 1` })
      .where(
        and(
          eq(otpCodes.id, row.id),
          isNull(otpCodes.consumedAt),
          lt(otpCodes.attempts, OTP_POLICY.maxAttempts),
        ),
      )
      .returning({ attempts: otpCodes.attempts });
    if (bumped === undefined) throw new AppError('OTP_LOCKED');

    const expected = this.codeHmac(
      row.pepperKid,
      row.purpose,
      row.destinationBidx,
      row.id,
      input.code,
    );
    if (!timingSafeEqual(expected, row.codeHmac)) {
      if (bumped.attempts >= OTP_POLICY.maxAttempts) {
        await this.burn(row.id, 'LOCKED', now);
        await this.noteLockout(row.purpose, row.channel, row.destinationBidx, now);
        throw new AppError('OTP_LOCKED');
      }
      throw new AppError('OTP_INVALID');
    }

    const [consumed] = await exec
      .update(otpCodes)
      .set({ consumedAt: now, consumedReason: 'VERIFIED' })
      .where(and(eq(otpCodes.id, row.id), isNull(otpCodes.consumedAt)))
      .returning({ id: otpCodes.id });
    if (consumed === undefined) throw new AppError('OTP_INVALID');

    return {
      otpId: row.id,
      channel: row.channel,
      destination: this.crypto.decrypt(row.destinationEnc, {
        table: 'otp_codes',
        column: 'destination_enc',
        rowId: otpId,
      }),
      destinationBidx: row.destinationBidx,
    };
  }

  /** Pool-side bookkeeping (round-1 fix): runs on `bookkeepingDb`, never on the possibly-exhausted main pool. */
  private async burn(id: string, reason: 'EXPIRED' | 'LOCKED', now: Date): Promise<void> {
    await this.bookkeepingDb.db
      .update(otpCodes)
      .set({ consumedAt: now, consumedReason: reason })
      .where(and(eq(otpCodes.id, id), isNull(otpCodes.consumedAt)));
  }

  /**
   * Audits AUTH_OTP_LOCKOUT (STARTED) when this burn is the 3rd LOCKED code for (purpose, destination)
   * within 60 min. Pool-side bookkeeping (round-1 fix): the count and the audit write both run on
   * `bookkeepingDb`, never on the possibly-exhausted main pool.
   */
  private async noteLockout(
    purpose: OtpPurpose,
    channel: OtpChannel,
    destinationBidx: Buffer,
    now: Date,
  ): Promise<void> {
    const since = new Date(now.getTime() - OTP_POLICY.lockoutWindowMs);
    const [row] = await this.bookkeepingDb.db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(otpCodes)
      .where(
        and(
          eq(otpCodes.purpose, purpose),
          eq(otpCodes.destinationBidx, destinationBidx),
          eq(otpCodes.consumedReason, 'LOCKED'),
          gt(otpCodes.consumedAt, since),
        ),
      );
    if ((row?.n ?? 0) >= OTP_POLICY.lockoutBurns) {
      await this.audit.record(this.bookkeepingDb.db, {
        action: AUDIT_ACTIONS.AUTH_OTP_LOCKOUT,
        actorType: 'ANONYMOUS',
        entityType: 'otp_destination',
        entityId: destinationBidx.toString('hex'),
        data: { purpose, channel, outcome: 'STARTED' },
      });
    }
  }

  private destinationBidx(destination: OtpDestination): Buffer {
    return this.crypto.blindIndex(
      destination.channel === 'SMS' ? 'mobile' : 'email',
      destination.value,
    );
  }

  private scope(
    purpose: OtpPurpose,
    destinationBidx: Buffer,
    referenceId: string | null,
  ): SQL | undefined {
    return and(
      eq(otpCodes.purpose, purpose),
      eq(otpCodes.destinationBidx, destinationBidx),
      referenceId === null ? isNull(otpCodes.referenceId) : eq(otpCodes.referenceId, referenceId),
    );
  }

  /**
   * HMAC-SHA256(pepper[kid], purpose|dest_bidx_hex|otp_row_id|code), pinned by R-14 (amends H-3). The otp
   * row id is used for every purpose, including CONSENT rows whose reference_id is the consent challenge.
   */
  private codeHmac(
    kid: number,
    purpose: OtpPurpose,
    destinationBidx: Buffer,
    otpId: string,
    code: string,
  ): Buffer {
    return createHmac('sha256', this.keys.otpPepper(kid))
      .update(`${purpose}|${destinationBidx.toString('hex')}|${otpId}|${code}`)
      .digest();
  }

  private render(input: IssueOtpInput, code: string): RenderedOtp {
    const { purpose, destination } = input;
    const hash = this.config.env.SANCHAY_SMS_RETRIEVER_HASH;
    if (destination.channel === 'SMS' && purpose === 'LOGIN') {
      return { templateId: SMS_TEMPLATE_IDS.LOGIN, subject: '', text: loginSmsText(code, hash) };
    }
    if (destination.channel === 'SMS' && purpose === 'CONSENT' && input.consentSms !== undefined) {
      return { subject: '', ...renderConsentSms(input.consentSms, code, hash) };
    }
    if (destination.channel === 'EMAIL' && (purpose === 'VERIFY_EMAIL' || purpose === 'CONSENT')) {
      return { templateId: EMAIL_TEMPLATE_IDS.OTP, ...emailOtpMessage(code, purpose) };
    }
    throw new Error(`OtpService: cannot render ${purpose} over ${destination.channel}`);
  }

  /**
   * Order (delta §5.4): lockout, cooldown, per-destination hour/day, per-IP, per-device, global SMS cap.
   * The lockout check runs first, on the pool and before the issue transaction: it depends only on LOCKED
   * burns (written by verify, never by issue), so it needs no lock, and its REFUSED audit is an own
   * autocommit write that must never wait on a second main-pool connection while a transaction holds one.
   */
  private async assertNotLockedOut(
    input: IssueOtpInput,
    destinationBidx: Buffer,
    now: Date,
  ): Promise<void> {
    const lockSince = new Date(now.getTime() - OTP_POLICY.lockoutWindowMs - OTP_POLICY.lockoutMs);
    const burns = await this.dbh.db
      .select({ at: otpCodes.consumedAt })
      .from(otpCodes)
      .where(
        and(
          eq(otpCodes.purpose, input.purpose),
          eq(otpCodes.destinationBidx, destinationBidx),
          eq(otpCodes.consumedReason, 'LOCKED'),
          gt(otpCodes.consumedAt, lockSince),
        ),
      )
      .orderBy(desc(otpCodes.consumedAt))
      .limit(OTP_POLICY.lockoutBurns);
    const endsAt = lockoutEndsAt(
      burns.flatMap((b) => (b.at === null ? [] : [b.at])),
      now,
    );
    if (endsAt !== null) {
      await this.audit.record(null, {
        action: AUDIT_ACTIONS.AUTH_OTP_LOCKOUT,
        actorType: 'ANONYMOUS',
        entityType: 'otp_destination',
        entityId: destinationBidx.toString('hex'),
        data: { purpose: input.purpose, channel: input.destination.channel, outcome: 'REFUSED' },
      });
      throw new AppError('RATE_LIMITED', {
        retryable: true,
        retryAfterSeconds: Math.ceil((endsAt.getTime() - now.getTime()) / SECOND),
      });
    }
  }

  /**
   * The rest of the delta §5.4 order. Runs inside the issue transaction after lockIssueScopes, so every
   * count below already includes every committed competitor for the same destination, IP, device or SMS day.
   */
  private async assertWithinQuotas(
    tx: Tx,
    input: IssueOtpInput,
    referenceId: string | null,
    destinationBidx: Buffer,
    now: Date,
  ): Promise<void> {
    const [last] = await tx
      .select({ createdAt: otpCodes.createdAt })
      .from(otpCodes)
      .where(this.scope(input.purpose, destinationBidx, referenceId))
      .orderBy(desc(otpCodes.createdAt))
      .limit(1);
    if (last !== undefined) {
      const elapsed = now.getTime() - last.createdAt.getTime();
      if (elapsed < OTP_POLICY.cooldownMs) {
        throw new AppError('OTP_COOLDOWN', {
          retryAfterSeconds: Math.ceil((OTP_POLICY.cooldownMs - elapsed) / SECOND),
        });
      }
    }

    // H-3: shared only by LOGIN and VERIFY_EMAIL. A CONSENT request never checks these, and a CONSENT row
    // is excluded from the counts (via `sharedPurpose`) so it never counts toward another request's budget.
    if (SHARED_QUOTA_PURPOSES.includes(input.purpose)) {
      const sharedPurpose = inArray(otpCodes.purpose, SHARED_QUOTA_PURPOSES);
      const hourAgo = new Date(now.getTime() - HOUR);
      const dayAgo = new Date(now.getTime() - DAY);
      const [dest] = await tx
        .select({
          hour: sql<number>`count(*) filter (where ${otpCodes.createdAt} > ${hourAgo.toISOString()})`.mapWith(
            Number,
          ),
          day: sql<number>`count(*)`.mapWith(Number),
        })
        .from(otpCodes)
        .where(
          and(
            eq(otpCodes.destinationBidx, destinationBidx),
            gt(otpCodes.createdAt, dayAgo),
            sharedPurpose,
          ),
        );
      if (
        (dest?.hour ?? 0) >= OTP_POLICY.perDestinationPerHour ||
        (dest?.day ?? 0) >= OTP_POLICY.perDestinationPerDay
      ) {
        throw new AppError('RATE_LIMITED', { retryable: true });
      }

      const perIp = this.config.env.SANCHAY_OTP_PER_IP_PER_HOUR;
      if (
        input.ip !== null &&
        (await this.countSince(tx, and(eq(otpCodes.ip, input.ip), sharedPurpose), hourAgo)) >= perIp
      ) {
        throw new AppError('RATE_LIMITED', { retryable: true });
      }

      const device = input.deviceRefHash ?? null;
      if (
        device !== null &&
        (await this.countSince(
          tx,
          and(eq(otpCodes.deviceRefHash, device), sharedPurpose),
          hourAgo,
        )) >= OTP_POLICY.perDevicePerHour
      ) {
        throw new AppError('RATE_LIMITED', { retryable: true });
      }
    }

    if (input.destination.channel === 'SMS') {
      const since = istDayStart(now);
      const [today] = await tx
        .select({ n: sql<number>`count(*)`.mapWith(Number) })
        .from(otpCodes)
        .where(and(eq(otpCodes.channel, 'SMS'), gte(otpCodes.createdAt, since)));
      const sent = today?.n ?? 0;
      if (sent >= OTP_POLICY.smsPerIstDay) {
        this.log.error(
          `otp.sms_daily_cap: ${sent} SMS since ${since.toISOString()}; refusing SMS until the next IST day`,
        );
        throw new AppError('SMS_UNAVAILABLE', { retryable: true });
      }
    }
  }

  private async countSince(
    exec: DbExecutor,
    condition: SQL | undefined,
    since: Date,
  ): Promise<number> {
    const [row] = await exec
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(otpCodes)
      .where(and(condition, gt(otpCodes.createdAt, since)));
    return row?.n ?? 0;
  }
}
