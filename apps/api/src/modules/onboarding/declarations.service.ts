import { Inject, Injectable } from '@nestjs/common';
import { LEGAL_DOCUMENT_TITLES, requiresAnnexureBAcceptance } from '@sanchay/domain';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { DB, type DbHandle } from '../../db/client.js';
import {
  consentRecords,
  DECLARATION_KEYS,
  type DeclarationKey,
  declarationStagings,
  legalDocuments,
} from '../legal-consent/legal-consent.schema.js';
import { LegalDocs } from '../legal-consent/legal-docs.service.js';
import { AUDIT_ACTIONS, AuditService } from '../platform/audit.service.js';
import { CLOCK, type Clock } from '../platform/clock.js';
import { AppError } from '../platform/errors.js';
import type { AuthContext } from '../platform/request-context.js';
import { nominationDecisions } from './nomination.schema.js';
import { onboardingApplications } from './onboarding.schema.js';

const ALWAYS_REQUIRED = [
  'TNC',
  'PRIVACY_NOTICE',
  'RISK_DISCLOSURE',
  'REGULAR_PLAN_COMMISSION',
  'EXECUTION_ONLY_DECLARATION',
  'FATCA_CRS_DECLARATION',
] as const satisfies readonly DeclarationKey[];

type PendingKey = DeclarationKey | 'KYC_CONSENT';

export interface PendingLegalDocument {
  key: PendingKey;
  version: string; // legal_documents.version is text
  title: string;
}

export interface StageDeclarationsInput {
  accept: Array<{ key: (typeof DECLARATION_KEYS)[number]; version: string }>; // legal_documents.version is text
}

@Injectable()
export class DeclarationsService {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(LegalDocs) private readonly legalDocs: LegalDocs,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * The documents the investor must hold whose current PUBLISHED version they have not accepted, in a
   * fixed order (RV-03-54). An acceptance counts from either source: declaration_stagings (ONB-15) or a
   * consent_records DOCUMENT_ACCEPTANCE row (E6's KYC_CONSENT at ONB-02, E13's legal.acceptPending).
   */
  async pending(auth: AuthContext): Promise<PendingLegalDocument[]> {
    const keys: PendingKey[] = [...ALWAYS_REQUIRED];
    const [decision] = await this.dbh.db
      .select()
      .from(nominationDecisions)
      .where(eq(nominationDecisions.investorId, auth.investorId));
    if (decision && requiresAnnexureBAcceptance(decision.decision)) {
      keys.push('NOMINATION_OPT_OUT_ANNEX_B');
    }
    keys.push('KYC_CONSENT');
    const accepted = await this.acceptedVersions(auth.investorId);
    const missing: PendingLegalDocument[] = [];
    for (const key of keys) {
      const current = await this.legalDocs.current(this.dbh.db, key);
      if (!accepted.get(key)?.has(current.version)) {
        missing.push({ key, version: current.version, title: LEGAL_DOCUMENT_TITLES[key] });
      }
    }
    return missing;
  }

  async stage(auth: AuthContext, input: StageDeclarationsInput): Promise<{ ok: true }> {
    const keys = new Set(input.accept.map((a) => a.key));
    // A key left out must already be held at its current version, so a return visit after a new
    // version stages only what legal.pending lists (RV-03-54).
    const accepted = await this.acceptedVersions(auth.investorId);
    const held = async (key: PendingKey) =>
      accepted.get(key)?.has((await this.legalDocs.current(this.dbh.db, key)).version) ?? false;
    for (const key of ALWAYS_REQUIRED) {
      if (!keys.has(key) && !(await held(key))) throw new AppError('VALIDATION_FAILED');
    }
    const [decision] = await this.dbh.db
      .select()
      .from(nominationDecisions)
      .where(eq(nominationDecisions.investorId, auth.investorId));
    const needsAnnexure = decision ? requiresAnnexureBAcceptance(decision.decision) : false;
    const annexure = 'NOMINATION_OPT_OUT_ANNEX_B';
    if (keys.has(annexure) ? !needsAnnexure : needsAnnexure && !(await held(annexure))) {
      throw new AppError('VALIDATION_FAILED');
    }

    return this.dbh.db.transaction(async (tx) => {
      for (const entry of input.accept) {
        const current = await this.legalDocs.current(tx, entry.key);
        if (entry.version !== current.version) throw new AppError('DECLARATION_OUTDATED');
        await tx
          .update(declarationStagings)
          .set({ supersededAt: this.clock.now() })
          .where(
            and(
              eq(declarationStagings.investorId, auth.investorId),
              eq(declarationStagings.documentKey, entry.key),
              isNull(declarationStagings.supersededAt),
            ),
          );
        await tx.insert(declarationStagings).values({
          investorId: auth.investorId,
          documentKey: entry.key,
          documentVersion: entry.version,
          acceptedAt: this.clock.now(),
        });
      }
      await tx
        .update(onboardingApplications)
        .set({ declarationsStatus: 'DONE' })
        .where(eq(onboardingApplications.investorId, auth.investorId));
      await this.audit.record(tx, {
        action: AUDIT_ACTIONS.ONBOARDING_DECLARATIONS_STAGED,
        actorType: 'INVESTOR',
        actorId: auth.investorId,
        entityType: 'investor',
        entityId: auth.investorId,
      });
      return { ok: true as const };
    });
  }

  /**
   * Every version the investor has accepted, per key. consent_records keeps no version, so a row accepts
   * the version that was PUBLISHED and in force at its consumed_at, by the same rule as E3's
   * LegalDocs.current (RV-03-54; F14's me.get v2 resolves it the same way).
   */
  private async acceptedVersions(investorId: string): Promise<Map<string, Set<string>>> {
    const staged = await this.dbh.db
      .select({
        key: declarationStagings.documentKey,
        version: declarationStagings.documentVersion,
      })
      .from(declarationStagings)
      .where(
        and(
          eq(declarationStagings.investorId, investorId),
          isNull(declarationStagings.supersededAt),
        ),
      );
    const versionAtAcceptance = sql<string | null>`(
      select ld.version from ${legalDocuments} as ld
      where ld.key = ${consentRecords}.document_key
        and ld.status = 'PUBLISHED'
        and (ld.effective_from is null or ld.effective_from <= ${consentRecords}.consumed_at)
      order by ld.effective_from desc nulls last
      limit 1
    )`;
    const recorded = await this.dbh.db
      .select({ key: consentRecords.documentKey, version: versionAtAcceptance })
      .from(consentRecords)
      .where(
        and(
          eq(consentRecords.investorId, investorId),
          eq(consentRecords.kind, 'DOCUMENT_ACCEPTANCE'),
        ),
      );
    const accepted = new Map<string, Set<string>>();
    for (const row of [...staged, ...recorded]) {
      if (row.key === null || row.version === null) continue;
      const versions = accepted.get(row.key) ?? new Set<string>();
      versions.add(row.version);
      accepted.set(row.key, versions);
    }
    return accepted;
  }
}
