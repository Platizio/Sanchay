import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Inject, Injectable } from '@nestjs/common';
import { type RiskQuestionnaireAnswers, scoreRiskQuestionnaire } from '@sanchay/domain';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { ClsService } from 'nestjs-cls';
import { type Database, DB, type DbHandle } from '../../db/client.js';
import { investors } from '../identity/identity.schema.js';
import { AUDIT_ACTIONS, AuditService } from '../platform/audit.service.js';
import { CLOCK, type Clock } from '../platform/clock.js';
import { AppError } from '../platform/errors.js';
import type { AuthContext, SanchayClsStore } from '../platform/request-context.js';
import { onboardingApplications } from './onboarding.schema.js';
import { riskProfiles, riskQuestionnaires } from './risk-profile.schema.js';

/** apps/api/src/modules/onboarding -> modules -> src -> api -> apps -> repo root -> data */
const QUESTIONNAIRE_FILE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../data/risk-questionnaire-v1.0.0.json',
);

interface QuestionnaireBody {
  version: string;
  approvedBy: string | null;
  requiresRetake: boolean;
  questions: unknown[];
}

function readQuestionnaireBody(): QuestionnaireBody {
  return JSON.parse(readFileSync(QUESTIONNAIRE_FILE, 'utf8')) as QuestionnaireBody;
}

/** The profile expires 24 months after completion (GAP-03 §3). */
function addMonthsUtc(from: Date, months: number): Date {
  const d = new Date(from.getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

/**
 * R-36 (owner decision 2026-10-06): the compliance-owned questionnaire is published only with a named
 * sign-off. The JSON's `approvedBy` stays null until compliance signs it off in a docs-only commit (like
 * G-C1 for the legal documents); until then the row loads as DRAFT and the risk step stays closed. A
 * re-run after the sign-off publishes the DRAFT row; a PUBLISHED row never changes. Plan 04 F1's
 * `seedReferenceData` runs this on every deploy; tests pass their own `approvedBy`.
 */
export async function seedRiskQuestionnaire(
  db: Database,
  options: { approvedBy?: string | undefined } = {},
): Promise<void> {
  const body = readQuestionnaireBody();
  const approvedBy = options.approvedBy ?? body.approvedBy ?? null;
  const status = approvedBy === null ? 'DRAFT' : 'PUBLISHED';
  const effectiveAt = approvedBy === null ? null : new Date();
  const sha256 = createHash('sha256').update(JSON.stringify(body)).digest();
  await db
    .insert(riskQuestionnaires)
    .values({
      version: body.version,
      status,
      questionsAndScoring: body,
      sha256,
      effectiveAt,
      approvedBy,
    })
    .onConflictDoUpdate({
      target: riskQuestionnaires.version,
      set: { status, questionsAndScoring: body, sha256, effectiveAt, approvedBy },
      setWhere: sql`${riskQuestionnaires.status} = 'DRAFT'`,
    });
}

export interface RiskProfileView {
  level: string;
  maxRiskometer: string;
  rawScore: number;
  status: string;
  completedAt: string;
  expiresAt: string;
  questionnaireVersion: string;
}

export interface RiskQuestionnaireView {
  version: string;
  sha256: string;
  questions: unknown[];
}

@Injectable()
export class RiskProfileService {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ClsService) private readonly cls: ClsService<SanchayClsStore>,
  ) {}

  private async publishedQuestionnaire(exec: Database = this.dbh.db) {
    const [row] = await exec
      .select()
      .from(riskQuestionnaires)
      .where(eq(riskQuestionnaires.status, 'PUBLISHED'))
      .orderBy(desc(riskQuestionnaires.effectiveAt), desc(riskQuestionnaires.createdAt))
      .limit(1);
    // R-36: nothing is published until compliance signs the questionnaire off.
    if (!row) throw new AppError('INTERNAL', { message: 'risk questionnaire is not published' });
    return row;
  }

  async getQuestionnaire(): Promise<RiskQuestionnaireView> {
    const row = await this.publishedQuestionnaire();
    return {
      version: row.version,
      sha256: row.sha256.toString('hex'),
      questions: (row.questionsAndScoring as QuestionnaireBody).questions,
    };
  }

  async get(auth: AuthContext): Promise<RiskProfileView | null> {
    const [row] = await this.dbh.db
      .select({ profile: riskProfiles, questionnaireVersion: riskQuestionnaires.version })
      .from(riskProfiles)
      .innerJoin(riskQuestionnaires, eq(riskQuestionnaires.id, riskProfiles.questionnaireId))
      .where(eq(riskProfiles.investorId, auth.investorId))
      .orderBy(desc(riskProfiles.completedAt))
      .limit(1);
    if (!row) return null;
    const profile = { ...row.profile };
    if (profile.status === 'ACTIVE' && profile.expiresAt.getTime() < this.clock.now().getTime()) {
      await this.dbh.db
        .update(riskProfiles)
        .set({ status: 'EXPIRED' })
        .where(eq(riskProfiles.id, profile.id));
      profile.status = 'EXPIRED';
    }
    return toView(profile, row.questionnaireVersion);
  }

  async submit(
    auth: AuthContext,
    input: { dob: string } & RiskQuestionnaireAnswers,
  ): Promise<RiskProfileView> {
    const questionnaire = await this.publishedQuestionnaire();
    const { dob, ...answers } = input;
    const completedAt = this.clock.now();
    const scored = scoreRiskQuestionnaire(dob, answers, completedAt.toISOString().slice(0, 10));
    const expiresAt = addMonthsUtc(completedAt, 24);

    return this.dbh.db.transaction(async (tx) => {
      await tx
        .update(riskProfiles)
        .set({ status: 'SUPERSEDED' })
        .where(
          and(
            eq(riskProfiles.investorId, auth.investorId),
            inArray(riskProfiles.status, ['ACTIVE', 'STALE']),
          ),
        );

      const [inserted] = await tx
        .insert(riskProfiles)
        .values({
          investorId: auth.investorId,
          questionnaireId: questionnaire.id,
          // The date of birth only feeds Q1; it is PII and is not copied into the answers blob.
          answers,
          rawScore: scored.rawScore,
          caps: scored.cappedBy,
          level: scored.level,
          maxRiskometer: scored.maxRiskometer,
          status: 'ACTIVE',
          completedAt,
          expiresAt,
          source: 'ONBOARDING',
          ip: this.cls.get('ip') ?? null,
          ua: this.cls.get('userAgent') ?? null,
        })
        .returning();
      if (!inserted) throw new AppError('INTERNAL');

      await tx
        .update(investors)
        .set({ currentRiskProfileId: inserted.id, updatedBy: auth.investorId })
        .where(eq(investors.id, auth.investorId));
      await tx
        .insert(onboardingApplications)
        .values({
          investorId: auth.investorId,
          riskStatus: 'DONE',
          createdBy: auth.investorId,
          updatedBy: auth.investorId,
        })
        .onConflictDoUpdate({
          target: onboardingApplications.investorId,
          set: { riskStatus: 'DONE', updatedBy: auth.investorId },
        });
      await this.audit.record(tx, {
        action: AUDIT_ACTIONS.ONBOARDING_RISK_PROFILE_SUBMITTED,
        actorType: 'INVESTOR',
        actorId: auth.investorId,
        entityType: 'investor',
        entityId: auth.investorId,
        data: { status: scored.level },
      });

      return toView(inserted, questionnaire.version);
    });
  }
}

function toView(
  profile: typeof riskProfiles.$inferSelect,
  questionnaireVersion: string,
): RiskProfileView {
  return {
    level: profile.level,
    maxRiskometer: profile.maxRiskometer,
    rawScore: profile.rawScore,
    status: profile.status,
    completedAt: profile.completedAt.toISOString(),
    expiresAt: profile.expiresAt.toISOString(),
    questionnaireVersion,
  };
}
