import { Inject, Injectable } from '@nestjs/common';
import {
  type LegalDocumentKey,
  requiresAnnexureBAcceptance,
  SNAPSHOT_VERSION,
} from '@sanchay/domain';
import { and, desc, eq } from 'drizzle-orm';
import { DB, type DbExecutor, type DbHandle } from '../../db/client.js';
import { investors } from '../identity/identity.schema.js';
import { ConsentEngine } from '../legal-consent/consent-engine.js';
import { consentChallenges, DECLARATION_KEYS } from '../legal-consent/legal-consent.schema.js';
import { resolveLegalDocument } from '../legal-consent/legal-docs.service.js';
import type { SnapshotBuilder } from '../legal-consent/snapshot-builders.js';
import { CLOCK, type Clock, SystemClock } from '../platform/clock.js';
import { AppError } from '../platform/errors.js';
import type { AuthContext } from '../platform/request-context.js';
import { bankAccounts } from './bank.schema.js';
import { DeclarationsService } from './declarations.service.js';
import { nominationDecisions } from './nomination.schema.js';
import { investorProfiles, onboardingApplications } from './onboarding.schema.js';
import { riskProfiles } from './risk-profile.schema.js';

/**
 * The clock the snapshot builder reads. SnapshotBuilder is a bare function in a registry (no injection), so
 * AttestService hands it the app's CLOCK when Nest constructs it; before that it is the system clock.
 */
let snapshotClock: Clock = new SystemClock();

/**
 * SNAPSHOT_BUILDERS.ONBOARDING_ATTEST: the documents the investor must hold today (the same set
 * DeclarationsService.pending() checks: the six declarations, Annexure B for an OPTED_OUT decision, and
 * KYC_CONSENT) at their current versions, the nomination decision and, on a re-attest (R-17), every FP id
 * already adopted, so the investor consents to exactly that. A document version published between `create`
 * and `approve` changes the hash and `approve` refuses with CONSENT_MISMATCH.
 */
export const buildAttestSnapshot: SnapshotBuilder = async (exec, ctx) => {
  const [decision] = await exec
    .select()
    .from(nominationDecisions)
    .where(eq(nominationDecisions.investorId, ctx.investorId));
  const needsAnnexure = decision !== undefined && requiresAnnexureBAcceptance(decision.decision);
  const keys: LegalDocumentKey[] = [
    'KYC_CONSENT',
    ...DECLARATION_KEYS.filter((key) => key !== 'NOMINATION_OPT_OUT_ANNEX_B' || needsAnnexure),
  ];
  const legalDocumentsInSnapshot = [];
  for (const key of keys) {
    // The version in force now, by the one shared rule (LC-3, PRV-3): never a DRAFT or a not-yet-effective version.
    const doc = await resolveLegalDocument(exec, key, snapshotClock.now());
    if (doc !== undefined) {
      legalDocumentsInSnapshot.push({
        key,
        version: doc.version,
        sha256: doc.sha256.toString('hex'),
      });
    }
  }
  const [application] = await exec
    .select({ adoptedFpIds: onboardingApplications.adoptedFpIds })
    .from(onboardingApplications)
    .where(eq(onboardingApplications.investorId, ctx.investorId));
  const adopted = Object.entries(application?.adoptedFpIds ?? {}).map(([kind, id]) => [
    `adopted.${kind}`,
    id,
  ]);
  return {
    version: SNAPSHOT_VERSION,
    subjectType: 'ONBOARDING_ATTEST',
    investorId: ctx.investorId,
    subjects: ctx.subjects.map((s) => ({ table: s.table, subjectId: s.id })),
    legalDocuments: legalDocumentsInSnapshot,
    moneyParamsVersion: ctx.moneyParamsVersion,
    destinationsMasked: ctx.destinationsMasked,
    fields: {
      ...ctx.fields,
      nominationDecision: decision?.decision ?? 'NONE',
      nominationSetVersion: String(decision?.effectiveSetVersion ?? ''),
      ...Object.fromEntries(adopted),
    },
  };
};

@Injectable()
export class AttestService {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ConsentEngine) private readonly consent: ConsentEngine,
    @Inject(DeclarationsService) private readonly declarations: DeclarationsService,
  ) {
    snapshotClock = clock;
  }

  /** Every onboarding gate, in the order an investor meets them. */
  async assertReady(exec: DbExecutor, investorId: string): Promise<{ applicationId: string }> {
    const [investor] = await exec.select().from(investors).where(eq(investors.id, investorId));
    const [app] = await exec
      .select()
      .from(onboardingApplications)
      .where(eq(onboardingApplications.investorId, investorId));
    if (investor === undefined || app === undefined) throw new AppError('ONBOARDING_INCOMPLETE');
    if (app.provisioningStatus === 'DONE') throw new AppError('CONFLICT_VERSION');
    // IN_PROGRESS blocks a second attest only while the last attest's saga window is open. A job that ran out of
    // pg-boss retries (an FP outage) leaves IN_PROGRESS behind and no final-failure hook exists; past the window
    // the job cannot write any more (useConsumed gives CONSENT_EXPIRED), so the investor must be able to re-attest.
    if (app.provisioningStatus === 'IN_PROGRESS' && (await this.sagaWindowOpen(exec, app))) {
      throw new AppError('CONFLICT_VERSION');
    }
    const [profile] = await exec
      .select()
      .from(investorProfiles)
      .where(eq(investorProfiles.investorId, investorId));
    if (profile === undefined || profile.kycStatus !== 'VALIDATED') {
      throw new AppError('KYC_NOT_VALIDATED');
    }
    if (app.profileStatus !== 'DONE' || investor.emailVerifiedAt === null) {
      throw new AppError('ONBOARDING_INCOMPLETE');
    }
    const [bank] = await exec
      .select({ id: bankAccounts.id })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.investorId, investorId), eq(bankAccounts.status, 'VERIFIED')))
      .limit(1);
    if (bank === undefined) throw new AppError('BANK_NOT_VERIFIED');
    const [decision] = await exec
      .select()
      .from(nominationDecisions)
      .where(eq(nominationDecisions.investorId, investorId));
    if (decision === undefined || decision.decision === 'NOT_ASKED') {
      throw new AppError('NOMINATION_INVALID');
    }
    const [risk] = await exec
      .select()
      .from(riskProfiles)
      .where(and(eq(riskProfiles.investorId, investorId), eq(riskProfiles.status, 'ACTIVE')))
      .orderBy(desc(riskProfiles.completedAt))
      .limit(1);
    if (risk === undefined || risk.expiresAt.getTime() <= this.clock.now().getTime()) {
      throw new AppError('RISK_PROFILE_EXPIRED');
    }
    // The current requirements, not the declarations_status flag (it survives a later nomination flip) and not
    // raw staging rows (a stale Annexure B row survives a flip back): DeclarationsService.pending() reads the
    // documents the investor must hold today against the versions they accepted (E10 review).
    // pending() reads only investorId from its AuthContext argument.
    const pending = await this.declarations.pending({ investorId } as AuthContext);
    if (pending.length > 0) throw new AppError('DECLARATION_OUTDATED');
    return { applicationId: app.id };
  }

  /** True while the application's last attest challenge may still drive a provisioning run. */
  private async sagaWindowOpen(
    exec: DbExecutor,
    app: { attestChallengeId: string | null },
  ): Promise<boolean> {
    if (app.attestChallengeId === null) return false;
    const [challenge] = await exec
      .select({ sagaExpiresAt: consentChallenges.sagaExpiresAt })
      .from(consentChallenges)
      .where(eq(consentChallenges.id, app.attestChallengeId));
    if (challenge === undefined || challenge.sagaExpiresAt === null) return false;
    return challenge.sagaExpiresAt.getTime() > this.clock.now().getTime();
  }

  async start(investorId: string): Promise<{ challengeId: string; expiresInSeconds: number }> {
    return this.dbh.db.transaction(async (tx) => {
      const { applicationId } = await this.assertReady(tx, investorId);
      const created = await this.consent.create(tx, {
        investorId,
        subjectType: 'ONBOARDING_ATTEST',
        subjects: [{ table: 'onboarding_applications', id: applicationId }],
        templateKey: 'TPL_ONBOARDING_ATTEST',
        folioId: null,
        amount: null,
        fields: { action: 'attest' },
      });
      await tx
        .update(onboardingApplications)
        .set({
          attestChallengeId: created.challengeId,
          attestStatus: 'IN_PROGRESS',
          stage: 'ATTEST',
        })
        .where(eq(onboardingApplications.id, applicationId));
      const expiresInSeconds = Math.max(
        1,
        Math.round((created.expiresAt.getTime() - this.clock.now().getTime()) / 1000),
      );
      return { challengeId: created.challengeId, expiresInSeconds };
    });
  }
}
