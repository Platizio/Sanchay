import { Inject, Injectable } from '@nestjs/common';
import { and, eq, ne, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../db/client.js';
import { CLOCK, type Clock } from '../platform/clock.js';
import { Crypto } from '../platform/crypto.js';
import { AppError } from '../platform/errors.js';
import { asRowId, newId } from '../platform/ids.js';
import { investorContacts, investors } from './identity.schema.js';
import { maskEmail, maskMobile } from './masking.js';

export type InvestorRow = typeof investors.$inferSelect;

const emailError = (code: 'EMAIL_IN_USE' | 'EMAIL_ALREADY_VERIFIED', message: string): AppError =>
  new AppError('VALIDATION_FAILED', { fields: [{ path: 'email', code, message }] });

@Injectable()
export class InvestorAccounts {
  constructor(
    @Inject(Crypto) private readonly crypto: Crypto,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async findByMobile(exec: DbExecutor, mobile: string): Promise<InvestorRow | null> {
    const [row] = await exec
      .select()
      .from(investors)
      .where(eq(investors.mobileBidx, this.crypto.blindIndex('mobile', mobile)))
      .limit(1);
    return row ?? null;
  }

  async findById(exec: DbExecutor, id: string): Promise<InvestorRow | null> {
    const [row] = await exec.select().from(investors).where(eq(investors.id, id)).limit(1);
    return row ?? null;
  }

  /** Sign-up: the mobile was just proven by an SMS OTP round-trip. */
  async createWithVerifiedMobile(exec: DbExecutor, mobile: string): Promise<InvestorRow> {
    const now = this.clock.now();
    const id = newId('investors');
    const actor = `investor:${id}`;
    const bidx = this.crypto.blindIndex('mobile', mobile);
    const [row] = await exec
      .insert(investors)
      .values({
        id,
        createdAt: now,
        updatedAt: now,
        createdBy: actor,
        updatedBy: actor,
        mobileEnc: this.crypto.encrypt(mobile, {
          table: 'investors',
          column: 'mobile_enc',
          rowId: id,
        }),
        mobileBidx: bidx,
        mobileLast4: mobile.slice(-4),
        mobileVerifiedAt: now,
      })
      .returning();
    if (!row) throw new AppError('INTERNAL');
    const contactId = newId('investor_contacts');
    await exec.insert(investorContacts).values({
      id: contactId,
      createdAt: now,
      updatedAt: now,
      investorId: id,
      kind: 'MOBILE',
      valueEnc: this.crypto.encrypt(mobile, {
        table: 'investor_contacts',
        column: 'value_enc',
        rowId: contactId,
      }),
      valueBidx: bidx,
      masked: maskMobile(mobile),
      verifiedAt: now,
      status: 'CURRENT',
    });
    return row;
  }

  decryptMobile(row: InvestorRow): string {
    return this.crypto.decrypt(row.mobileEnc, {
      table: 'investors',
      column: 'mobile_enc',
      rowId: asRowId('investors', row.id),
    });
  }

  decryptEmail(row: InvestorRow): string | null {
    if (row.emailEnc === null) return null;
    return this.crypto.decrypt(row.emailEnc, {
      table: 'investors',
      column: 'email_enc',
      rowId: asRowId('investors', row.id),
    });
  }

  /** Adding an email is only for accounts without a verified one. Replacing it is a contact change (P2-3; ops runbook in the MVP). */
  async assertEmailAvailable(exec: DbExecutor, investorId: string, email: string): Promise<void> {
    const investor = await this.findById(exec, investorId);
    if (!investor) throw new AppError('AUTH_REQUIRED');
    if (investor.emailVerifiedAt !== null) {
      throw emailError('EMAIL_ALREADY_VERIFIED', 'Use contact change to replace a verified email');
    }
    const [other] = await exec
      .select({ id: investors.id })
      .from(investors)
      .where(
        and(
          eq(investors.emailBidx, this.crypto.blindIndex('email', email)),
          ne(investors.id, investorId),
        ),
      )
      .limit(1);
    if (other) throw emailError('EMAIL_IN_USE', 'This email is linked to another account');
  }

  async setVerifiedEmail(
    exec: DbExecutor,
    investorId: string,
    email: string,
  ): Promise<{ emailMasked: string; emailVerifiedAt: Date }> {
    await this.assertEmailAvailable(exec, investorId, email);
    const now = this.clock.now();
    const normalized = email.trim().toLowerCase();
    const bidx = this.crypto.blindIndex('email', normalized);
    const masked = maskEmail(normalized);
    await exec
      .update(investors)
      .set({
        emailEnc: this.crypto.encrypt(normalized, {
          table: 'investors',
          column: 'email_enc',
          rowId: asRowId('investors', investorId),
        }),
        emailBidx: bidx,
        emailMasked: masked,
        emailVerifiedAt: now,
        updatedAt: now,
        updatedBy: `investor:${investorId}`,
        version: sql`${investors.version} + 1`,
      })
      .where(eq(investors.id, investorId));
    await exec
      .update(investorContacts)
      .set({ status: 'PREVIOUS', supersededAt: now, updatedAt: now })
      .where(
        and(
          eq(investorContacts.investorId, investorId),
          eq(investorContacts.kind, 'EMAIL'),
          eq(investorContacts.status, 'CURRENT'),
          ne(investorContacts.valueBidx, bidx),
        ),
      );
    const contactId = newId('investor_contacts');
    await exec
      .insert(investorContacts)
      .values({
        id: contactId,
        createdAt: now,
        updatedAt: now,
        investorId,
        kind: 'EMAIL',
        valueEnc: this.crypto.encrypt(normalized, {
          table: 'investor_contacts',
          column: 'value_enc',
          rowId: contactId,
        }),
        valueBidx: bidx,
        masked,
        verifiedAt: now,
        status: 'CURRENT',
      })
      .onConflictDoUpdate({
        target: [investorContacts.investorId, investorContacts.kind, investorContacts.valueBidx],
        set: { status: 'CURRENT', supersededAt: null, verifiedAt: now, updatedAt: now },
      });
    return { emailMasked: masked, emailVerifiedAt: now };
  }
}
