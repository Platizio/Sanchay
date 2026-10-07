import { Money } from '@sanchay/money';
import type { ConsentSubjectType } from '../platform.js';

export type RequiredFactor = 'SMS' | 'EMAIL';

/** H-21: subject types whose risk profile always needs both factors, independent of amount. */
const EMAIL_ALWAYS: ReadonlySet<ConsentSubjectType> = new Set<ConsentSubjectType>([
  'REDEMPTION',
  'SWITCH',
  'ONBOARDING_ATTEST',
  'MANDATE_REGISTRATION',
  'MANDATE_CANCEL',
  'BANK_CHANGE',
  'CONTACT_CHANGE',
  'STP_REGISTRATION',
  'SWP_REGISTRATION',
  'PLAN_CANCEL',
  'FOLIO_SERVICE_REQUEST',
]);

const HIGH_VALUE_THRESHOLD = Money.parse('100000.00');

/** H-21: SMS is always required; EMAIL is added above the pilot high-value threshold, or always for the
 * subject types in `EMAIL_ALWAYS`. `amount` is the rupee value being consented to, or null when the
 * subject type has none (for example ONBOARDING_ATTEST, MANDATE_REGISTRATION). */
export function requiredFactorsFor(
  subjectType: ConsentSubjectType,
  amount: string | null,
): readonly RequiredFactor[] {
  const factors: RequiredFactor[] = ['SMS'];
  if (EMAIL_ALWAYS.has(subjectType)) {
    factors.push('EMAIL');
    return factors;
  }
  if (amount !== null && Money.parse(amount).gte(HIGH_VALUE_THRESHOLD)) {
    factors.push('EMAIL');
  }
  return factors;
}
