import { Money } from '@sanchay/money';
import { FpAmbiguousError } from '../../integrations/fp/fp-errors.js';
import { AppError } from '../platform/errors.js';

/**
 * Typed view of D3's raw mf_purchase (research fp-api §3.2). FP numbers arrive as lossless values
 * (fp-json.ts) and are kept as their exact decimal strings; `oldId` is an integer of at most 15 digits.
 */
export interface FpPurchaseView {
  id: string;
  oldId: number;
  state: string;
  folioNumber: string | null;
  allottedUnits: string | null;
  purchasedAmount: string | null;
  purchasedPrice: string | null;
  allottedNavDate: string | null;
  failureCode: string | null;
  hasConsent: boolean;
}

const text = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value);

const FP_PURCHASE_ID = /^mfp_/;
const FP_OLD_ID = /^\d{1,15}$/;

/**
 * R-47: a 2xx is only as good as the ids in it. Anything that is not an object with an `mfp_…` id and an
 * integer `old_id` is FpAmbiguousError(op): FP may have created the purchase, so the caller treats it as
 * ambiguous (RECONCILING), never as a rejection. `old_id` is tested as text, never as a JS number.
 */
export function toFpPurchaseView(raw: unknown, op = 'purchase.get'): FpPurchaseView {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new FpAmbiguousError(op);
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== 'string' || !FP_PURCHASE_ID.test(row.id)) throw new FpAmbiguousError(op);
  const oldId = String(row.old_id);
  if (!FP_OLD_ID.test(oldId)) throw new FpAmbiguousError(op);
  return {
    id: row.id,
    oldId: Number(oldId),
    state: String(row.state),
    folioNumber: text(row.folio_number),
    allottedUnits: text(row.allotted_units),
    purchasedAmount: text(row.purchased_amount),
    purchasedPrice: text(row.purchased_price),
    allottedNavDate: text(row.allotted_nav_date),
    failureCode: text(row.failure_code),
    hasConsent: row.consent !== null && row.consent !== undefined,
  };
}

/**
 * H3 (H-21, D-MONEY-006): FP's `consent{}` carries only the channels the investor actually verified, at the
 * destinations the OTPs went to. An SMS factor adds `{ isd_code: '91', mobile }`, an EMAIL factor `{ email }`.
 * An empty result, or a verified channel with no destination, is a bug: INTERNAL, never a partial consent.
 */
export function fpConsentFor(
  factors: ReadonlyArray<'SMS' | 'EMAIL'>,
  to: { mobile: string | null; email: string | null },
): Record<string, string> {
  const consent: Record<string, string> = {};
  for (const factor of factors) {
    if (factor === 'SMS') {
      if (to.mobile === null) {
        throw new AppError('INTERNAL', { message: 'SMS verified but no mobile to report' });
      }
      consent.isd_code = '91';
      consent.mobile = to.mobile;
    } else {
      if (to.email === null) {
        throw new AppError('INTERNAL', { message: 'EMAIL verified but no email to report' });
      }
      consent.email = to.email;
    }
  }
  if (Object.keys(consent).length === 0) {
    throw new AppError('INTERNAL', { message: 'no verified consent channel to report' });
  }
  return consent;
}

export type AdoptablePurchase =
  | { kind: 'adopt'; purchase: FpPurchaseView }
  | { kind: 'absent' }
  | { kind: 'mismatch'; ids: string[] };

function sameAmount(raw: unknown, want: string): boolean {
  try {
    return Money.parse(String(raw)).equals(Money.parse(want));
  } catch {
    return false;
  }
}

/**
 * LOOKUP-ADOPT's match (R-46, H5). FP documents only the `mf_investment_account` list filter, so every other
 * filter is applied here and never trusted to the provider: `ours` are the rows whose `source_ref_id` is the
 * aggregate id. None: absent. Exactly one, with the same account, scheme and amount: adopt it. Anything else
 * (two rows, or one that differs) is a mismatch, which is never adopted and never counts as absent.
 */
export function findAdoptablePurchase(
  items: readonly Record<string, unknown>[],
  want: { sourceRefId: string; mfInvestmentAccount: string; scheme: string; amount: string },
): AdoptablePurchase {
  const ours = items.filter((row) => String(row.source_ref_id) === want.sourceRefId);
  if (ours.length === 0) return { kind: 'absent' };
  const [only] = ours;
  if (
    ours.length === 1 &&
    only !== undefined &&
    String(only.mf_investment_account) === want.mfInvestmentAccount &&
    String(only.scheme) === want.scheme &&
    sameAmount(only.amount, want.amount)
  ) {
    return { kind: 'adopt', purchase: toFpPurchaseView(only, 'purchase.list') };
  }
  return { kind: 'mismatch', ids: ours.map((row) => String(row.id)) };
}
