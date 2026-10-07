import { Inject, Injectable } from '@nestjs/common';
import type { LegalDocumentKey } from '@sanchay/domain';
import { and, eq, isNull, lte, or, sql } from 'drizzle-orm';
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

@Injectable()
export class LegalDocs {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * The PUBLISHED version of `key` in force now: the newest `effectiveFrom` that has arrived, and an
   * undated version only when no dated one has (RV-03-29: PostgreSQL sorts NULLs first under DESC, so a
   * DRAFT or undated row used to hide the PUBLISHED one).
   */
  async current(exec: DbExecutor, key: LegalDocumentKey): Promise<CurrentLegalDocument> {
    const [row] = await (exec ?? this.dbh.db)
      .select()
      .from(legalDocuments)
      .where(
        and(
          eq(legalDocuments.key, key),
          eq(legalDocuments.status, 'PUBLISHED'),
          or(
            isNull(legalDocuments.effectiveFrom),
            lte(legalDocuments.effectiveFrom, this.clock.now()),
          ),
        ),
      )
      .orderBy(sql`${legalDocuments.effectiveFrom} DESC NULLS LAST`)
      .limit(1);
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
