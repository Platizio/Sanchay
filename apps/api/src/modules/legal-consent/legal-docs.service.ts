import { Inject, Injectable } from '@nestjs/common';
import type { LegalDocumentKey } from '@sanchay/domain';
import { and, desc, eq, isNull, lte, or, type SQL, sql } from 'drizzle-orm';
import { DB, type DbExecutor, type DbHandle } from '../../db/client.js';
import { CLOCK, type Clock } from '../platform/clock.js';
import { AppError } from '../platform/errors.js';
import { newId } from '../platform/ids.js';
import { consentRecords, legalDocuments } from './legal-consent.schema.js';

export interface CurrentLegalDocument {
  key: LegalDocumentKey;
  version: string;
  sha256: string;
  /** E10's `legal.getDocument` serves it (RV-03-37). */
  bodyMarkdown: string;
}

export interface RecordAcceptanceInput {
  investorId: string;
  key: LegalDocumentKey;
  channel: string;
  ip: string | null;
  userAgent: string | null;
  sessionId: string | null;
}

/**
 * The one rule for "which version of a document is in force at `at`" (LC-3, PRV-3): PUBLISHED, and either
 * undated or already effective, newest `effective_from` first (an undated version only when no dated one
 * has arrived), ties broken by the newest row. Every resolver uses it: LegalDocs.current, the accepted-version
 * lookup in DeclarationsService and the ONBOARDING_ATTEST snapshot builder.
 */
export async function resolveLegalDocument(
  exec: DbExecutor,
  key: LegalDocumentKey,
  at: Date,
): Promise<typeof legalDocuments.$inferSelect | undefined> {
  const [row] = await exec
    .select()
    .from(legalDocuments)
    .where(
      and(
        eq(legalDocuments.key, key),
        eq(legalDocuments.status, 'PUBLISHED'),
        or(isNull(legalDocuments.effectiveFrom), lte(legalDocuments.effectiveFrom, at)),
      ),
    )
    .orderBy(sql`${legalDocuments.effectiveFrom} DESC NULLS LAST`, desc(legalDocuments.createdAt))
    .limit(1);
  return row;
}

/**
 * The same rule as a correlated subquery: the version of the document `keyColumn` names that was in force at
 * `at` (for example a consent_records row's document_key and consumed_at). Keep it in step with
 * resolveLegalDocument.
 */
export function legalVersionInForceAt(keyColumn: SQL, at: SQL): SQL<string | null> {
  return sql<string | null>`(
    select ld.version from ${legalDocuments} as ld
    where ld.key = ${keyColumn}
      and ld.status = 'PUBLISHED'
      and (ld.effective_from is null or ld.effective_from <= ${at})
    order by ld.effective_from desc nulls last, ld.created_at desc
    limit 1
  )`;
}

@Injectable()
export class LegalDocs {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * The PUBLISHED version of `key` in force now (resolveLegalDocument; RV-03-29: PostgreSQL sorts NULLs
   * first under DESC, so a DRAFT or undated row used to hide the PUBLISHED one).
   */
  async current(exec: DbExecutor, key: LegalDocumentKey): Promise<CurrentLegalDocument> {
    const row = await resolveLegalDocument(exec ?? this.dbh.db, key, this.clock.now());
    if (row === undefined) {
      throw new AppError('INTERNAL', { message: `no PUBLISHED legal_documents row for ${key}` });
    }
    return {
      key: row.key as LegalDocumentKey,
      version: row.version,
      sha256: row.sha256.toString('hex'),
      bodyMarkdown: row.bodyMarkdown,
    };
  }

  /**
   * A no-OTP checkbox acceptance (ONB-02's KYC_CONSENT, §0.4 item 4): writes a DOCUMENT_ACCEPTANCE
   * consent_records row directly, with no consent_challenges row and no OTP send.
   */
  async recordAcceptance(tx: DbExecutor, input: RecordAcceptanceInput): Promise<void> {
    const doc = await this.current(tx, input.key);
    const now = this.clock.now();
    await tx.insert(consentRecords).values({
      id: newId('consent_records'),
      createdBy: input.investorId,
      kind: 'DOCUMENT_ACCEPTANCE',
      investorId: input.investorId,
      documentKey: doc.key,
      channel: input.channel,
      ip: input.ip,
      userAgent: input.userAgent,
      sessionId: input.sessionId,
      consumedAt: now,
    });
  }
}
