import { formatIsoDate } from '@sanchay/money';

/**
 * Legal entity that holds the ARN and operates Sanchay. Sanchay is the brand; Platizio appears only
 * as the legal entity / ARN holder, and only in this file (R-19).
 * COUNSEL PLACEHOLDER: gate G-C1 replaces this with the registered name including its legal
 * suffix, and sets LEGAL_COPY_STATUS to 'APPROVED' in the same commit.
 */
export const LEGAL_ENTITY_NAME = 'Platizio';

export type LegalCopyStatus = 'COUNSEL_PLACEHOLDER' | 'APPROVED';
export const LEGAL_COPY_STATUS: LegalCopyStatus = 'COUNSEL_PLACEHOLDER';

/**
 * The single ARN pattern: 'ARN-' followed by 1 to 9 digits. No flags, so .test() is stateless.
 * C10's readSiteConfig (apps/web) copies this exact literal, because apps/web site-config does not
 * depend on this package; test/legal-entity.test.ts pins ARN_REGEX.source. If counsel confirms a
 * different width, change both literals in one commit.
 */
export const ARN_REGEX = /^ARN-\d{1,9}$/;

/**
 * DSC-02 entity line (D-MONEY-091). Never "SEBI-registered".
 * `arn` is SANCHAY_PLATFORM_ARN (e.g. 'ARN-000000'); `validTill` is SANCHAY_PLATFORM_ARN_VALID_TILL (YYYY-MM-DD).
 * Throws RangeError on a malformed ARN or date, so a page can never render a blank ARN.
 */
export function dsc02(arn: string, validTill: string): string {
  if (!ARN_REGEX.test(arn)) {
    throw new RangeError(
      'dsc02: expected an ARN matching ARN_REGEX (ARN- followed by 1 to 9 digits)',
    );
  }
  const until = formatIsoDate(validTill);
  return `Sanchay is operated by ${LEGAL_ENTITY_NAME}, an AMFI-registered Mutual Fund Distributor, ${arn} (valid till ${until}). We are a distributor, not an investment adviser.`;
}
