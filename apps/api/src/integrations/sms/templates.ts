/** WebOTP origin binding (`@domain #code`). Always the LAST line of every OTP SMS (H-6, R-10). */
export const WEBOTP_DOMAIN = 'app.sanchay.in';

/** The four DLT template keys registered under G-B4 (R-10). Bodies: docs/dlt/sms-templates.md. */
export const SMS_TEMPLATE_IDS = {
  LOGIN: 'SANCHAY_LOGIN_OTP_V1',
  CONSENT: 'SANCHAY_CONSENT_OTP_V1',
  CONSENT_UNITS: 'SANCHAY_CONSENT_UNITS_OTP_V1',
  ATTEST: 'SANCHAY_ATTEST_OTP_V1',
} as const;

type TemplateKey = keyof typeof SMS_TEMPLATE_IDS;

/** DLT sign-off of the principal entity (this file is on the R-19 allowlist). */
export const DLT_SIGNOFF = '-Platizio';

/**
 * TRAI Direction of 18-Nov-2025: every content-template variable carries a typed tag, and operators
 * scrub each sent value against it. `numeric` is digits only (no commas, no decimal point);
 * `alphanumeric` is letters and digits, read here as single-spaced words with no punctuation.
 */
export const DLT_TAGS = {
  numeric: /^\d+$/,
  alphanumeric: /^[A-Za-z0-9]+(?: [A-Za-z0-9]+)*$/,
} as const;

type DltTag = keyof typeof DLT_TAGS;

/** One DLT variable holds at most 30 characters (stricter than the 40 operators allow). */
export const DLT_VAR_MAX_LENGTH = 30;

const NUMERIC = '{#numeric#}';
const ALPHANUMERIC = '{#alphanumeric#}';
const PLACEHOLDER = /\{#(numeric|alphanumeric)#\}/g;
const WEBOTP_LINE = `@${WEBOTP_DOMAIN} #${NUMERIC}`;

/**
 * The registered DLT bodies, byte for byte (H16 amends R-10: two lines, no retriever-hash line).
 * Line 1 is the DLT text; the last line is the WebOTP binding.
 */
export const SMS_TEMPLATE_BODIES: Readonly<Record<TemplateKey, string>> = {
  LOGIN: `${NUMERIC} is your Sanchay login OTP. Valid 5 min. Never share it; Sanchay staff never ask for it. ${DLT_SIGNOFF}\n${WEBOTP_LINE}`,
  CONSENT: `${NUMERIC} is your OTP to ${ALPHANUMERIC} Rs ${NUMERIC}.${NUMERIC} in ${ALPHANUMERIC} on Sanchay. Valid 5 min. Never share it. ${DLT_SIGNOFF}\n${WEBOTP_LINE}`,
  CONSENT_UNITS: `${NUMERIC} is your OTP to redeem ${ALPHANUMERIC} units of ${ALPHANUMERIC} on Sanchay. Valid 5 min. Never share it. ${DLT_SIGNOFF}\n${WEBOTP_LINE}`,
  ATTEST: `${NUMERIC} is your OTP to confirm your Sanchay account details. Valid 5 min. Never share it. ${DLT_SIGNOFF}\n${WEBOTP_LINE}`,
};

/** Shown when a consent carries no scheme name; it still fits the `alphanumeric` tag. */
const NO_SCHEME = 'your scheme';

/** Purchase and SIP/mandate consent: an amount in rupees. */
export interface ConsentSmsParams {
  action: string;
  amount: string;
  schemeShort: string;
}

/** Redemption by units: `all` for redeem-all (units mode, T5, would need its own template). */
export interface ConsentUnitsSmsParams {
  units: string;
  schemeShort: string;
}

/** What the consent engine hands to OtpService for purpose CONSENT over SMS (R-10). */
export type ConsentSms =
  | ({ template: 'CONSENT' } & ConsentSmsParams)
  | ({ template: 'CONSENT_UNITS' } & ConsentUnitsSmsParams)
  | { template: 'ATTEST' };

/** Fills a body's placeholders in order, refusing any value its TRAI tag or the length cap rejects. */
function fill(key: TemplateKey, values: readonly string[]): string {
  const body = SMS_TEMPLATE_BODIES[key];
  let index = 0;
  const text = body.replace(PLACEHOLDER, (_placeholder, tag: DltTag) => {
    const value = values[index];
    index += 1;
    if (value === undefined) {
      throw new RangeError(`${key}: no value for variable ${index}`);
    }
    if (!DLT_TAGS[tag].test(value) || value.length > DLT_VAR_MAX_LENGTH) {
      throw new RangeError(`${key}: variable ${index} does not fit the ${tag} tag`);
    }
    return value;
  });
  if (index !== values.length) {
    throw new RangeError(`${key}: ${values.length} values for ${index} variables`);
  }
  return text;
}

/**
 * Splits a rupee amount into digits-only rupees and two-digit paise for `Rs {#numeric#}.{#numeric#}`.
 * Accepts the wire form (`5000.00`) or Indian grouping (`5,000.00`); anything it cannot restate
 * exactly is refused, because a consent SMS must never misstate money.
 */
const RUPEE_AMOUNT = /^(?:\d+|\d{1,3}(?:,\d{2,3})+)(?:\.\d{1,2})?$/;

function rupeesAndPaise(amount: string): [string, string] {
  if (!RUPEE_AMOUNT.test(amount)) {
    throw new RangeError('consent SMS amount must be a plain rupee amount such as 5000.00');
  }
  const [rupees = '0', paise = ''] = amount.replace(/,/g, '').split('.');
  return [rupees.replace(/^0+(?=\d)/, ''), paise.padEnd(2, '0')];
}

/**
 * Reduces free text (a scheme name) to an `alphanumeric` value: `&` becomes `and`, any other
 * punctuation a space, spaces collapse, and the result is cut at a word within 30 characters.
 */
export function dltText(raw: string): string {
  const words = raw
    .replace(/&/g, ' and ')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim();
  if (words.length <= DLT_VAR_MAX_LENGTH) return words;
  const cut = words.slice(0, DLT_VAR_MAX_LENGTH + 1);
  const lastSpace = cut.lastIndexOf(' ');
  return lastSpace > 0 ? cut.slice(0, lastSpace) : words.slice(0, DLT_VAR_MAX_LENGTH);
}

function schemeText(schemeShort: string): string {
  const text = dltText(schemeShort);
  return text === '' ? NO_SCHEME : text;
}

export function loginSmsText(code: string): string {
  return fill('LOGIN', [code, code]);
}

export function consentSmsText(input: ConsentSmsParams & { code: string }): string {
  const [rupees, paise] = rupeesAndPaise(input.amount);
  return fill('CONSENT', [
    input.code,
    input.action,
    rupees,
    paise,
    schemeText(input.schemeShort),
    input.code,
  ]);
}

export function consentUnitsSmsText(input: ConsentUnitsSmsParams & { code: string }): string {
  return fill('CONSENT_UNITS', [
    input.code,
    input.units,
    schemeText(input.schemeShort),
    input.code,
  ]);
}

export function attestSmsText(code: string): string {
  return fill('ATTEST', [code, code]);
}

/** Picks the R-10 template for a consent SMS. */
export function renderConsentSms(
  sms: ConsentSms,
  code: string,
): { templateId: string; text: string } {
  switch (sms.template) {
    case 'CONSENT':
      return {
        templateId: SMS_TEMPLATE_IDS.CONSENT,
        text: consentSmsText({
          code,
          action: sms.action,
          amount: sms.amount,
          schemeShort: sms.schemeShort,
        }),
      };
    case 'CONSENT_UNITS':
      return {
        templateId: SMS_TEMPLATE_IDS.CONSENT_UNITS,
        text: consentUnitsSmsText({ code, units: sms.units, schemeShort: sms.schemeShort }),
      };
    case 'ATTEST':
      return { templateId: SMS_TEMPLATE_IDS.ATTEST, text: attestSmsText(code) };
  }
}
