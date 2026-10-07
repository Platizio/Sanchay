import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { DbExecutor } from '../../db/client.js';
import { investorContacts, investors } from '../identity/identity.schema.js';
import { InvestorAccounts } from '../identity/investor-accounts.service.js';
import { maskMobile } from '../identity/masking.js';
import { Crypto } from '../platform/crypto.js';
import { asRowId } from '../platform/ids.js';

export interface ConsentDestination {
  channel: 'SMS' | 'EMAIL';
  /** The plaintext address. Only `sendOtp` reads it, to hand it to `OtpService.issue`; it is never stored, logged or hashed. */
  value: string;
  /** What the investor sees and what `create` hashes into `destinationsMasked`. */
  masked: string;
}

/**
 * H-21: for the MVP (no external folios yet) a destination set is always the investor's own CURRENT
 * verified contacts: the mobile on `investors` plus any CURRENT EMAIL `investor_contacts` row.
 * `folioId` is accepted for forward compatibility with F-series folio-scoped resolution (a folio's own
 * registered contacts) and is currently unused; it never narrows the MVP destination set.
 * RV-03-2: `value` is decrypted (the mobile through Plan 01's `InvestorAccounts.decryptMobile`, AAD
 * `investors.mobile_enc:<investorId>`; the email under AAD `investor_contacts.value_enc:<contactId>`).
 * Before, it was the base64 ciphertext, so no consent OTP ever reached the investor. `masked` stays a mask:
 * Plan 01's `maskMobile` (the mask the OTP row and the MOBILE contact carry) and the email row's `masked`.
 */
@Injectable()
export class ConsentDestinationResolver {
  constructor(
    @Inject(InvestorAccounts) private readonly accounts: InvestorAccounts,
    @Inject(Crypto) private readonly crypto: Crypto,
  ) {}

  async resolve(
    exec: DbExecutor,
    investorId: string,
    _folioId: string | null,
  ): Promise<ConsentDestination[]> {
    const [investor] = await exec
      .select()
      .from(investors)
      .where(eq(investors.id, investorId))
      .limit(1);
    if (investor === undefined) return [];
    const mobile = this.accounts.decryptMobile(investor);
    const destinations: ConsentDestination[] = [
      { channel: 'SMS', value: mobile, masked: maskMobile(mobile) },
    ];
    const [email] = await exec
      .select()
      .from(investorContacts)
      .where(
        and(
          eq(investorContacts.investorId, investorId),
          eq(investorContacts.kind, 'EMAIL'),
          eq(investorContacts.status, 'CURRENT'),
        ),
      )
      .limit(1);
    if (email !== undefined) {
      destinations.push({
        channel: 'EMAIL',
        value: this.crypto.decrypt(email.valueEnc, {
          table: 'investor_contacts',
          column: 'value_enc',
          rowId: asRowId('investor_contacts', email.id),
        }),
        masked: email.masked,
      });
    }
    return destinations;
  }
}
