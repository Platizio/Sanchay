import { timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { ConsentSubjectType } from '@sanchay/domain';
import { canonicalize, type JcsValue, requiredFactorsFor, snapshotSha256 } from '@sanchay/domain';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { AppConfig } from '../../config/app-config.js';
import { DB, type DbExecutor, type DbHandle } from '../../db/client.js';
import { assertConsumed, type ConsumedConsent } from '../../integrations/fp/consumed-consent.js';
import type { ConsentSms } from '../../integrations/sms/templates.js';
import { otpCodes } from '../identity/identity.schema.js';
import { OtpService } from '../identity/otp.service.js';
import { AUDIT_ACTIONS, AuditService } from '../platform/audit.service.js';
import { CLOCK, type Clock, DAY, HOUR, MINUTE } from '../platform/clock.js';
import { Crypto } from '../platform/crypto.js';
import { AppError } from '../platform/errors.js';
import { asRowId, newId } from '../platform/ids.js';
import type { JobName } from '../platform/jobs/job-registry.js';
import { Jobs } from '../platform/jobs/jobs.service.js';
import { RuntimeConfig } from '../platform/runtime-config.js';
import { ConsentDestinationResolver } from './destination-resolver.js';
import {
  type ChallengeStatus,
  consentChallenges,
  consentRecords,
  consentSubjects,
} from './legal-consent.schema.js';
import { SNAPSHOT_BUILDERS } from './snapshot-builders.js';

export const CHALLENGE_EXPIRY_MS = 10 * MINUTE;
export const DEFAULT_SAGA_WINDOW_MS = 60 * MINUTE;
export const MANDATE_SAGA_WINDOW_MS = 7 * DAY;
const MAX_SMS_SENDS = 3;
const SMS_COOLDOWN_MS = 30_000;
const CONSENT_SENDS_PER_HOUR = 10;

export type { ConsumedConsent };

/**
 * What `approve` echoes from the stored snapshot back into the builder (RV-03-1). Deliberately not
 * `ConsentSnapshotV2Schema`: builder output is never schema-parsed at `create` (the generic builder
 * lists no legalDocuments), so `approve` must not reject on a rule `create` never applied.
 */
const StoredSnapshotEchoSchema = z.object({
  destinationsMasked: z.array(z.string()),
  fields: z.record(z.string(), z.string()),
});

/**
 * Subject type -> the worker job `approve` enqueues in its own transaction. Registered at module load by
 * the owning task (E11 ONBOARDING_ATTEST, E20 PURCHASE, F2 plans/mandates), in a file the api role loads.
 */
export const CONSENT_SUBJECT_JOBS: Partial<Record<ConsentSubjectType, JobName>> = {};

export interface ConsentApprovedJobData {
  challengeId: string;
  recordId: string;
  investorId: string;
  subjectType: ConsentSubjectType;
  subjectIds: string[];
}

export const SUITABILITY_HOOK = Symbol('SUITABILITY_HOOK');

export interface SuitabilityHook {
  check(exec: DbExecutor, investorId: string, subjectType: ConsentSubjectType): Promise<boolean>;
}

export const NOOP_SUITABILITY_HOOK: SuitabilityHook = { check: async () => true };

export interface ConsentSubjectRef {
  table: string;
  id: string;
}

export interface CreateChallengeInput {
  investorId: string;
  subjectType: ConsentSubjectType;
  subjects: ConsentSubjectRef[];
  templateKey: string;
  folioId: string | null;
  amount?: string | null;
  fields: Record<string, string>;
}

export interface CreatedChallenge {
  challengeId: string;
  expiresAt: Date;
  requiredFactors: ReadonlyArray<'SMS' | 'EMAIL'>;
}

export interface ApproveInput {
  smsCode?: string;
  emailCode?: string;
}

export interface ApprovedChallenge {
  challengeId: string;
  executeBefore: Date;
  sagaExpiresAt: Date;
}

function needsNewMandateWindow(subjectType: ConsentSubjectType): boolean {
  return subjectType === 'SIP_WITH_PURCHASE' || subjectType === 'MANDATE_REGISTRATION';
}

function consentSmsFor(row: {
  renderAction: string | null;
  renderAmount: string | null;
  renderUnits: string | null;
  renderSchemeShort: string | null;
  templateKey: string;
}): ConsentSms {
  if (row.templateKey === 'TPL_ONBOARDING_ATTEST') return { template: 'ATTEST' };
  if (row.renderUnits !== null) {
    return {
      template: 'CONSENT_UNITS',
      units: row.renderUnits,
      schemeShort: row.renderSchemeShort ?? '',
    };
  }
  return {
    template: 'CONSENT',
    action: row.renderAction ?? 'invest',
    amount: row.renderAmount ?? '0.00',
    schemeShort: row.renderSchemeShort ?? '',
  };
}

@Injectable()
export class ConsentEngine {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(Crypto) private readonly crypto: Crypto,
    @Inject(OtpService) private readonly otp: OtpService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(Jobs) private readonly jobs: Jobs,
    @Inject(ConsentDestinationResolver) private readonly destinations: ConsentDestinationResolver,
    @Inject(SUITABILITY_HOOK) private readonly suitability: SuitabilityHook,
    @Inject(AppConfig) private readonly config: AppConfig,
  ) {}

  async create(exec: DbExecutor, input: CreateChallengeInput): Promise<CreatedChallenge> {
    const now = this.clock.now();
    const destinations = await this.destinations.resolve(exec, input.investorId, input.folioId);
    if (destinations.length === 0) throw new AppError('CONSENT_DESTINATION_UNAVAILABLE');

    const builder = SNAPSHOT_BUILDERS[input.subjectType];
    const snapshot = await builder(exec, {
      investorId: input.investorId,
      subjects: input.subjects,
      templateKey: input.templateKey,
      moneyParamsVersion: await RuntimeConfig.get(exec, 'money_params_version'),
      destinationsMasked: destinations.map((d) => d.masked),
      fields: input.fields,
    });
    const canonical = canonicalize(snapshot as unknown as JcsValue);
    const shaHex = await snapshotSha256(snapshot);
    const id = newId('consent_challenges');
    const expiresAt = new Date(now.getTime() + CHALLENGE_EXPIRY_MS);
    const requiredFactors = requiredFactorsFor(input.subjectType, input.amount ?? null);

    await exec.insert(consentChallenges).values({
      id,
      // RV-03-4: the app Clock, like consumed_at and the FakeFp call log (the column default is the DB now()).
      createdAt: now,
      updatedAt: now,
      createdBy: input.investorId,
      updatedBy: input.investorId,
      investorId: asRowId('investors', input.investorId),
      subjectType: input.subjectType,
      folioId: input.folioId,
      templateKey: input.templateKey as never,
      snapshotEnc: this.crypto.encrypt(canonical, {
        table: 'consent_challenges',
        column: 'snapshot_enc',
        rowId: id,
      }),
      snapshotSha256: Buffer.from(shaHex, 'hex'),
      status: 'PENDING',
      requiredFactors: [...requiredFactors],
      moneyParamsVersion: snapshot.moneyParamsVersion,
      renderAction: input.fields.action ?? null,
      renderAmount: input.fields.amount ?? null,
      renderUnits: input.fields.units ?? null,
      renderSchemeShort: input.fields.schemeShort ?? null,
      expiresAt,
    });
    for (const subject of input.subjects) {
      await exec.insert(consentSubjects).values({
        id: newId('consent_subjects'),
        challengeId: id,
        subjectTable: subject.table,
        subjectId: subject.id,
        status: 'PENDING',
      });
    }
    await this.audit.record(exec, {
      action: AUDIT_ACTIONS.CONSENT_CHALLENGE_CREATED,
      actorType: 'INVESTOR',
      actorId: input.investorId,
      entityType: 'consent_challenges',
      entityId: id,
      data: { subjectType: input.subjectType, challengeId: id },
    });
    return { challengeId: id, expiresAt, requiredFactors };
  }

  async sendOtp(challengeId: string, channel: 'SMS' | 'EMAIL') {
    const db = this.dbh.db;
    const now = this.clock.now();
    const [row] = await db
      .select()
      .from(consentChallenges)
      .where(eq(consentChallenges.id, challengeId))
      .limit(1);
    if (row === undefined) throw new AppError('NOT_FOUND');
    if (row.status === 'CONSUMED' || row.status === 'CONSUMED_UNUSED') {
      throw new AppError('CONSENT_ALREADY_USED');
    }
    if (row.status !== 'PENDING' || row.expiresAt.getTime() <= now.getTime()) {
      throw new AppError('CONSENT_EXPIRED');
    }
    if (channel === 'SMS' && row.smsSendCount >= MAX_SMS_SENDS) {
      throw new AppError('RATE_LIMITED', { retryable: false });
    }
    if (row.lastSmsSentAt !== null && channel === 'SMS') {
      const elapsed = now.getTime() - row.lastSmsSentAt.getTime();
      if (elapsed < SMS_COOLDOWN_MS) {
        throw new AppError('OTP_COOLDOWN', {
          retryAfterSeconds: Math.ceil((SMS_COOLDOWN_MS - elapsed) / 1000),
        });
      }
    }
    const sentThisHour = await this.sendsThisHour(row.investorId, now);
    if (sentThisHour >= CONSENT_SENDS_PER_HOUR)
      throw new AppError('RATE_LIMITED', { retryable: true });

    const destinations = await this.destinations.resolve(db, row.investorId, row.folioId);
    const destination = destinations.find((d) => d.channel === channel);
    if (destination === undefined) throw new AppError('CONSENT_DESTINATION_UNAVAILABLE');

    const issued = await this.otp.issue({
      purpose: 'CONSENT',
      destination: { channel, value: destination.value },
      referenceId: challengeId,
      ip: null,
      ...(channel === 'SMS' ? { consentSms: consentSmsFor(row) } : {}),
    });
    if (channel === 'SMS') {
      await db
        .update(consentChallenges)
        .set({ smsSendCount: row.smsSendCount + 1, lastSmsSentAt: now })
        .where(eq(consentChallenges.id, challengeId));
    }
    await this.audit.record(db, {
      action: AUDIT_ACTIONS.CONSENT_OTP_SENT,
      actorType: 'INVESTOR',
      actorId: row.investorId,
      entityType: 'consent_challenges',
      entityId: challengeId,
      data: { channel, challengeId },
    });
    return issued;
  }

  async approve(challengeId: string, input: ApproveInput): Promise<ApprovedChallenge> {
    const existing = await this.priorApproval(challengeId);
    if (existing !== null) return existing;

    const now = this.clock.now();
    const outcome = await this.dbh.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(consentChallenges)
        .where(eq(consentChallenges.id, challengeId))
        .for('update')
        .limit(1);
      if (row === undefined) return { kind: 'not_found' as const };
      if (row.status === 'CONSUMED' || row.status === 'CONSUMED_UNUSED') {
        return { kind: 'already_used' as const };
      }
      if (row.status !== 'PENDING') return { kind: 'expired' as const };
      if (row.expiresAt.getTime() <= now.getTime()) {
        await tx
          .update(consentChallenges)
          .set({ status: 'EXPIRED' as ChallengeStatus })
          .where(eq(consentChallenges.id, challengeId));
        return { kind: 'expired' as const };
      }

      for (const factor of row.requiredFactors) {
        const code = factor === 'SMS' ? input.smsCode : input.emailCode;
        if (code === undefined) throw new AppError('VALIDATION_FAILED');
        const [otpRow] = await tx
          .select({ id: otpCodes.id })
          .from(otpCodes)
          .where(
            and(
              eq(otpCodes.referenceId, challengeId),
              eq(otpCodes.purpose, 'CONSENT'),
              eq(otpCodes.channel, factor),
              isNull(otpCodes.consumedAt),
            ),
          )
          .orderBy(desc(otpCodes.createdAt))
          .limit(1);
        if (otpRow === undefined) throw new AppError('OTP_INVALID');
        // OtpService.verify's attempt bump runs on its own pool-side connection and is already
        // committed even if this transaction later rolls back; the "wrong code increments attempts
        // even when tx rolls back" test relies on exactly this.
        await this.otp.verify(tx, { challengeId: otpRow.id, purpose: 'CONSENT', code });
      }

      const suitabilityOk = await this.suitability.check(
        tx,
        row.investorId,
        row.subjectType as ConsentSubjectType,
      );
      if (!suitabilityOk) return { kind: 'suitability_changed' as const };

      const subjects = await tx
        .select()
        .from(consentSubjects)
        .where(eq(consentSubjects.challengeId, challengeId));
      // RV-03-1: rebuild from what `create` hashed. The masks and the caller's fields live only in the
      // encrypted snapshot. A builder that reads subject rows still overwrites the echoed fields with
      // live values, so a changed subject still fails the hash below.
      const stored = StoredSnapshotEchoSchema.parse(
        JSON.parse(
          this.crypto.decrypt(row.snapshotEnc, {
            table: 'consent_challenges',
            column: 'snapshot_enc',
            rowId: asRowId('consent_challenges', challengeId),
          }),
        ),
      );
      const builder = SNAPSHOT_BUILDERS[row.subjectType as ConsentSubjectType];
      const snapshot = await builder(tx, {
        investorId: row.investorId,
        subjects: subjects.map((s) => ({ table: s.subjectTable, id: s.subjectId })),
        templateKey: row.templateKey,
        moneyParamsVersion: row.moneyParamsVersion,
        destinationsMasked: stored.destinationsMasked,
        fields: stored.fields,
      });
      const recomputedHex = await snapshotSha256(snapshot);
      const recomputed = Buffer.from(recomputedHex, 'hex');
      if (
        recomputed.length !== row.snapshotSha256.length ||
        !timingSafeEqual(recomputed, row.snapshotSha256)
      ) {
        await tx
          .update(consentChallenges)
          .set({ status: 'SUPERSEDED' as ChallengeStatus })
          .where(eq(consentChallenges.id, challengeId));
        await this.audit.record(tx, {
          action: AUDIT_ACTIONS.CONSENT_MISMATCH,
          actorType: 'INVESTOR',
          actorId: row.investorId,
          entityType: 'consent_challenges',
          entityId: challengeId,
          data: { subjectType: row.subjectType, challengeId },
        });
        return { kind: 'mismatch' as const };
      }

      const executeBefore = new Date(now.getTime() + CHALLENGE_EXPIRY_MS);
      const sagaWindowMs = needsNewMandateWindow(row.subjectType as ConsentSubjectType)
        ? MANDATE_SAGA_WINDOW_MS
        : DEFAULT_SAGA_WINDOW_MS;
      const sagaExpiresAt = new Date(now.getTime() + sagaWindowMs);
      const deliveryEvidence = await this.deliveryEvidenceFor(tx, challengeId, row.requiredFactors);
      const recordId = newId('consent_records');
      await tx.insert(consentRecords).values({
        id: recordId,
        createdBy: row.investorId,
        kind: 'CHALLENGE',
        investorId: row.investorId,
        challengeId,
        subjectType: row.subjectType,
        subjectIds: subjects.map((s) => ({ table: s.subjectTable, id: s.subjectId })),
        snapshotSha256: row.snapshotSha256,
        snapshotEnc: row.snapshotEnc,
        deliveryEvidence,
        consumedAt: now,
        executeBefore,
        sagaExpiresAt,
      });
      await tx
        .update(consentChallenges)
        .set({
          status: 'CONSUMED' as ChallengeStatus,
          consumedAt: now,
          executeBefore,
          sagaExpiresAt,
        })
        .where(eq(consentChallenges.id, challengeId));
      await tx
        .update(consentSubjects)
        .set({ status: 'CONSENTED' })
        .where(eq(consentSubjects.challengeId, challengeId));
      const subjectJob = CONSENT_SUBJECT_JOBS[row.subjectType as ConsentSubjectType];
      if (subjectJob !== undefined) {
        const data: ConsentApprovedJobData = {
          challengeId,
          recordId,
          investorId: row.investorId,
          subjectType: row.subjectType as ConsentSubjectType,
          subjectIds: subjects.map((s) => s.subjectId),
        };
        await this.jobs.enqueue(tx, subjectJob, data, { singletonKey: challengeId });
      }
      await this.audit.record(tx, {
        action: AUDIT_ACTIONS.CONSENT_APPROVED,
        actorType: 'INVESTOR',
        actorId: row.investorId,
        entityType: 'consent_challenges',
        entityId: challengeId,
        data: { subjectType: row.subjectType, challengeId },
      });
      return { kind: 'ok' as const, executeBefore, sagaExpiresAt };
    });

    switch (outcome.kind) {
      case 'not_found':
        throw new AppError('NOT_FOUND');
      case 'already_used': {
        const prior = await this.priorApproval(challengeId);
        if (prior !== null) return prior;
        throw new AppError('CONSENT_ALREADY_USED');
      }
      case 'expired':
        throw new AppError('CONSENT_EXPIRED');
      case 'suitability_changed':
        throw new AppError('SUITABILITY_CHANGED');
      case 'mismatch':
        throw new AppError('CONSENT_MISMATCH');
      case 'ok':
        return {
          challengeId,
          executeBefore: outcome.executeBefore,
          sagaExpiresAt: outcome.sagaExpiresAt,
        };
    }
  }

  /**
   * PENDING -> CANCELLED in one guarded UPDATE (RV-03-12). `approve` locks the row and moves it from
   * PENDING to CONSUMED, so a cancel that races it either commits first (approve then refuses) or matches
   * no row once approve commits: it can never overwrite CONSUMED. A challenge that already ended without
   * being consumed (CANCELLED, EXPIRED, SUPERSEDED) stays as it is and the call succeeds without a second
   * audit row; a consumed one is CONSENT_ALREADY_USED.
   */
  async cancel(exec: DbExecutor, challengeId: string): Promise<void> {
    const [cancelled] = await exec
      .update(consentChallenges)
      .set({ status: 'CANCELLED' as ChallengeStatus })
      .where(and(eq(consentChallenges.id, challengeId), eq(consentChallenges.status, 'PENDING')))
      .returning({ investorId: consentChallenges.investorId });
    if (cancelled === undefined) {
      const [row] = await exec
        .select({ status: consentChallenges.status })
        .from(consentChallenges)
        .where(eq(consentChallenges.id, challengeId))
        .limit(1);
      if (row === undefined) throw new AppError('NOT_FOUND');
      const ended: ReadonlySet<string> = new Set(['CANCELLED', 'EXPIRED', 'SUPERSEDED']);
      if (ended.has(row.status)) return;
      throw new AppError('CONSENT_ALREADY_USED');
    }
    await this.audit.record(exec, {
      action: AUDIT_ACTIONS.CONSENT_CANCELLED,
      actorType: 'INVESTOR',
      actorId: cancelled.investorId,
      entityType: 'consent_challenges',
      entityId: challengeId,
      data: { challengeId },
    });
  }

  /**
   * CONSUMED -> CONSUMED_UNUSED for a saga that gives up before any P/M write, for example when a live
   * pre-check fails inside `useConsumed` before the first FP write (RV-03-1). Only the caller knows
   * that no write happened, so it must never call this after one. Idempotent for job retries.
   * `useConsumed` refuses the challenge from then on.
   */
  async markUnused(exec: DbExecutor, challengeId: string, reason: string): Promise<void> {
    const [row] = await exec
      .select({ status: consentChallenges.status })
      .from(consentChallenges)
      .where(eq(consentChallenges.id, challengeId))
      .for('update')
      .limit(1);
    if (row === undefined) throw new AppError('NOT_FOUND');
    if (row.status === 'CONSUMED_UNUSED') return;
    if (row.status !== 'CONSUMED') {
      throw new Error(
        `ConsentEngine.markUnused: challenge ${challengeId} is ${row.status}, not CONSUMED`,
      );
    }
    await exec
      .update(consentChallenges)
      .set({ status: 'CONSUMED_UNUSED' as ChallengeStatus })
      .where(and(eq(consentChallenges.id, challengeId), eq(consentChallenges.status, 'CONSUMED')));
    await this.audit.record(exec, {
      action: AUDIT_ACTIONS.CONSENT_MARKED_UNUSED,
      actorType: 'SYSTEM',
      entityType: 'consent_challenges',
      entityId: challengeId,
      data: { challengeId, reason },
    });
  }

  /** Worker only. P/M writes run only inside `useConsumed`, and `fn` runs with no open transaction, so an
   * FP call inside it never trips D3 ProviderCallInTransactionError. */
  async useConsumed<T>(
    challengeId: string,
    fn: (consent: ConsumedConsent) => Promise<T>,
  ): Promise<T> {
    if (this.config.env.SANCHAY_APP_ROLE !== 'worker') {
      throw new Error('ConsentEngine.useConsumed: refused outside the worker role');
    }
    const now = this.clock.now();
    const db = this.dbh.db;
    const [record] = await db
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.challengeId, challengeId))
      .limit(1);
    if (record === undefined || record.kind !== 'CHALLENGE' || record.executeBefore === null) {
      throw new AppError('CONSENT_REQUIRED');
    }
    const [challenge] = await db
      .select({ status: consentChallenges.status })
      .from(consentChallenges)
      .where(eq(consentChallenges.id, challengeId))
      .limit(1);
    if (challenge?.status === 'CONSUMED_UNUSED') throw new AppError('CONSENT_EXPIRED'); // swept or markUnused
    const deadline = record.firstAttemptAt === null ? record.executeBefore : record.sagaExpiresAt;
    if (deadline === null || now.getTime() > deadline.getTime()) {
      throw new AppError('CONSENT_EXPIRED');
    }
    if (record.firstAttemptAt === null) {
      await db
        .update(consentRecords)
        .set({ firstAttemptAt: now })
        .where(and(eq(consentRecords.id, record.id), isNull(consentRecords.firstAttemptAt)));
    }
    const consumed = {
      challengeId,
      investorId: record.investorId,
      subjectType: record.subjectType as ConsentSubjectType,
      subjectIds: (record.subjectIds ?? []).map((s) => s.id),
      snapshotSha256: (record.snapshotSha256 ?? Buffer.alloc(0)).toString('hex'),
      executeBefore: record.executeBefore,
    } as unknown as ConsumedConsent; // the D3 brand is minted here and nowhere else
    assertConsumed(consumed);
    return fn(consumed);
  }

  private async priorApproval(challengeId: string): Promise<ApprovedChallenge | null> {
    const [record] = await this.dbh.db
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.challengeId, challengeId))
      .limit(1);
    if (record === undefined || record.executeBefore === null || record.sagaExpiresAt === null) {
      return null;
    }
    return {
      challengeId,
      executeBefore: record.executeBefore,
      sagaExpiresAt: record.sagaExpiresAt,
    };
  }

  private async sendsThisHour(investorId: string, now: Date): Promise<number> {
    const hourAgo = new Date(now.getTime() - HOUR);
    const rows = await this.dbh.db
      .select({ id: consentChallenges.id, lastSmsSentAt: consentChallenges.lastSmsSentAt })
      .from(consentChallenges)
      .where(eq(consentChallenges.investorId, investorId));
    return rows.filter(
      (r) => r.lastSmsSentAt !== null && r.lastSmsSentAt.getTime() > hourAgo.getTime(),
    ).length;
  }

  private async deliveryEvidenceFor(
    exec: DbExecutor,
    challengeId: string,
    factors: readonly string[],
  ): Promise<Record<string, unknown>> {
    const rows = await exec
      .select()
      .from(otpCodes)
      .where(and(eq(otpCodes.referenceId, challengeId), eq(otpCodes.purpose, 'CONSENT')));
    const evidence: Record<string, unknown> = {};
    for (const factor of factors) {
      const row = rows.find((r) => r.channel === factor);
      if (row === undefined) continue;
      evidence[factor] = {
        templateId: row.templateId,
        providerMessageId: row.providerMessageId,
        dlrStatus: row.dlrStatus,
        dlrAt: row.dlrAt,
        sentAt: row.createdAt,
        destinationMasked: row.destinationMasked,
      };
    }
    return evidence;
  }
}
