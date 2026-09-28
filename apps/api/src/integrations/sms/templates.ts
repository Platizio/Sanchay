/** WebOTP origin binding (`@domain #code`). Always the LAST line of every OTP SMS (H-6, R-10). */
export const WEBOTP_DOMAIN = 'app.sanchay.in';

/** The four DLT template keys registered under G-B4 (R-10). Bodies: docs/dlt/sms-templates.md. */
export const SMS_TEMPLATE_IDS = {
  LOGIN: 'SANCHAY_LOGIN_OTP_V1',
  CONSENT: 'SANCHAY_CONSENT_OTP_V1',
  CONSENT_UNITS: 'SANCHAY_CONSENT_UNITS_OTP_V1',
  ATTEST: 'SANCHAY_ATTEST_OTP_V1',
} as const;

/** DLT sign-off of the principal entity (this file is on the R-19 allowlist). */
export const DLT_SIGNOFF = '-Platizio';

/** One DLT `{#var#}` holds at most 30 characters. */
export const DLT_VAR_MAX_LENGTH = 30;

/** Purchase and SIP/mandate consent: an amount in rupees. */
export interface ConsentSmsParams {
  action: string;
  amount: string;
  schemeShort: string;
}

/** Redemption by units: a platform 3-dp units string such as '12.345', or 'all' for redeem-all. */
export interface ConsentUnitsSmsParams {
  units: string;
  schemeShort: string;
}

/** What the consent engine hands to OtpService for purpose CONSENT over SMS (R-10). */
export type ConsentSms =
  | ({ template: 'CONSENT' } & ConsentSmsParams)
  | ({ template: 'CONSENT_UNITS' } & ConsentUnitsSmsParams)
  | { template: 'ATTEST' };

function assertDltVariables(
  renderer: string,
  variables: ReadonlyArray<readonly [string, string]>,
): void {
  for (const [name, value] of variables) {
    if (value.length > DLT_VAR_MAX_LENGTH) {
      throw new RangeError(`${renderer}: ${name} exceeds ${DLT_VAR_MAX_LENGTH} characters`);
    }
  }
}

/**
 * Line 1 = DLT text; line 2 = Android SMS Retriever hash (the `{#var#}` penultimate line, always set
 * outside local/test by B2 invariant 7); last line = WebOTP binding. Local/test may omit line 2.
 */
function withOtpLines(first: string, code: string, retrieverHash?: string): string {
  const lines = [first];
  if (retrieverHash !== undefined && retrieverHash !== '') lines.push(retrieverHash);
  lines.push(`@${WEBOTP_DOMAIN} #${code}`);
  return lines.join('\n');
}

export function loginSmsText(code: string, retrieverHash?: string): string {
  return withOtpLines(
    `${code} is your Sanchay login OTP. Valid 5 min. Never share it; Sanchay staff never ask for it. ${DLT_SIGNOFF}`,
    code,
    retrieverHash,
  );
}

export function consentSmsText(
  input: ConsentSmsParams & { code: string },
  retrieverHash?: string,
): string {
  assertDltVariables('consentSmsText', [
    ['action', input.action],
    ['amount', input.amount],
    ['schemeShort', input.schemeShort],
  ]);
  return withOtpLines(
    `${input.code} is your OTP to ${input.action} Rs ${input.amount} in ${input.schemeShort} on Sanchay. Valid 5 min. Never share it. ${DLT_SIGNOFF}`,
    input.code,
    retrieverHash,
  );
}

export function consentUnitsSmsText(
  input: ConsentUnitsSmsParams & { code: string },
  retrieverHash?: string,
): string {
  assertDltVariables('consentUnitsSmsText', [
    ['units', input.units],
    ['schemeShort', input.schemeShort],
  ]);
  return withOtpLines(
    `${input.code} is your OTP to redeem ${input.units} units of ${input.schemeShort} on Sanchay. Valid 5 min. Never share it. ${DLT_SIGNOFF}`,
    input.code,
    retrieverHash,
  );
}

export function attestSmsText(code: string, retrieverHash?: string): string {
  return withOtpLines(
    `${code} is your OTP to confirm your Sanchay account details. Valid 5 min. Never share it. ${DLT_SIGNOFF}`,
    code,
    retrieverHash,
  );
}

/** Picks the R-10 template for a consent SMS. */
export function renderConsentSms(
  sms: ConsentSms,
  code: string,
  retrieverHash?: string,
): { templateId: string; text: string } {
  switch (sms.template) {
    case 'CONSENT':
      return {
        templateId: SMS_TEMPLATE_IDS.CONSENT,
        text: consentSmsText(
          { code, action: sms.action, amount: sms.amount, schemeShort: sms.schemeShort },
          retrieverHash,
        ),
      };
    case 'CONSENT_UNITS':
      return {
        templateId: SMS_TEMPLATE_IDS.CONSENT_UNITS,
        text: consentUnitsSmsText(
          { code, units: sms.units, schemeShort: sms.schemeShort },
          retrieverHash,
        ),
      };
    case 'ATTEST':
      return { templateId: SMS_TEMPLATE_IDS.ATTEST, text: attestSmsText(code, retrieverHash) };
  }
}
