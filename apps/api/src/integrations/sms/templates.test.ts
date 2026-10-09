import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  attestSmsText,
  consentSmsText,
  consentUnitsSmsText,
  DLT_SIGNOFF,
  DLT_TAGS,
  DLT_VAR_MAX_LENGTH,
  dltText,
  loginSmsText,
  renderConsentSms,
  SMS_TEMPLATE_BODIES,
  SMS_TEMPLATE_IDS,
  WEBOTP_DOMAIN,
} from './templates.js';

const WEBOTP_LAST_LINE = /^@app\.sanchay\.in #\d{6}$/;
const PLACEHOLDER = /\{#(numeric|alphanumeric)#\}/g;
const EXAMPLE = {
  code: '123456',
  action: 'invest',
  amount: '5,000.00',
  schemeShort: 'HDFC Flexi Cap',
};
const UNITS_EXAMPLE = { code: '123456', units: 'all', schemeShort: 'HDFC Flexi Cap' };
const lastLine = (text: string): string => text.split('\n').at(-1) ?? '';

/** All four R-10 templates, rendered from the shared examples. */
const RENDERED: ReadonlyArray<readonly [keyof typeof SMS_TEMPLATE_BODIES, string]> = [
  ['LOGIN', loginSmsText('123456')],
  ['CONSENT', consentSmsText(EXAMPLE)],
  ['CONSENT_UNITS', consentUnitsSmsText(UNITS_EXAMPLE)],
  ['ATTEST', attestSmsText('123456')],
];

/**
 * Recovers the variable values of a rendered SMS from its template body: every fixed-text run is
 * matched literally, every placeholder becomes a lazy capture.
 */
function variablesOf(body: string, text: string): string[] {
  const escaped = body
    .split(PLACEHOLDER)
    .map((part, i) => (i % 2 === 1 ? '(.+?)' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('');
  const match = new RegExp(`^${escaped}$`).exec(text);
  if (match === null) throw new Error(`rendered text does not fit its template:\n${text}`);
  return match.slice(1);
}

describe('SMS templates (H-6 / R-10 as amended by the 2026-10-09 TRAI typed-tag fix, H16)', () => {
  it('pins the four template ids, WebOTP domain, sign-off shape and the variable length cap', () => {
    expect(SMS_TEMPLATE_IDS).toEqual({
      LOGIN: 'SANCHAY_LOGIN_OTP_V1',
      CONSENT: 'SANCHAY_CONSENT_OTP_V1',
      CONSENT_UNITS: 'SANCHAY_CONSENT_UNITS_OTP_V1',
      ATTEST: 'SANCHAY_ATTEST_OTP_V1',
    });
    expect(WEBOTP_DOMAIN).toBe('app.sanchay.in');
    expect(DLT_SIGNOFF).toMatch(/^-[A-Z][a-z]+$/);
    expect(DLT_VAR_MAX_LENGTH).toBe(30);
  });

  it('registers every variable with a TRAI typed tag, never the legacy {#var#}', () => {
    for (const [key, body] of Object.entries(SMS_TEMPLATE_BODIES)) {
      expect(body, key).not.toContain('{#var#}');
      expect(body.match(PLACEHOLDER)?.length ?? 0, key).toBeGreaterThan(0);
      expect(body.replace(PLACEHOLDER, ''), key).not.toMatch(/\{#|#\}/);
    }
  });

  it('pins the four template bodies: two lines, typed tags, the WebOTP line last (no retriever hash line)', () => {
    expect(SMS_TEMPLATE_BODIES).toEqual({
      LOGIN: `{#numeric#} is your Sanchay login OTP. Valid 5 min. Never share it; Sanchay staff never ask for it. ${DLT_SIGNOFF}\n@app.sanchay.in #{#numeric#}`,
      CONSENT: `{#numeric#} is your OTP to {#alphanumeric#} Rs {#numeric#}.{#numeric#} in {#alphanumeric#} on Sanchay. Valid 5 min. Never share it. ${DLT_SIGNOFF}\n@app.sanchay.in #{#numeric#}`,
      CONSENT_UNITS: `{#numeric#} is your OTP to redeem {#alphanumeric#} units of {#alphanumeric#} on Sanchay. Valid 5 min. Never share it. ${DLT_SIGNOFF}\n@app.sanchay.in #{#numeric#}`,
      ATTEST: `{#numeric#} is your OTP to confirm your Sanchay account details. Valid 5 min. Never share it. ${DLT_SIGNOFF}\n@app.sanchay.in #{#numeric#}`,
    });
  });

  it('renders every template as exactly two lines with the WebOTP binding last', () => {
    for (const [name, text] of RENDERED) {
      const lines = text.split('\n');
      expect(lines, name).toHaveLength(2);
      expect(lines[0]?.startsWith('123456 '), name).toBe(true);
      expect(lines[0]?.endsWith(` ${DLT_SIGNOFF}`), name).toBe(true);
      expect(lastLine(text), name).toMatch(WEBOTP_LAST_LINE);
      expect(lastLine(text), name).toBe('@app.sanchay.in #123456');
    }
  });

  it('fills every placeholder with a value its TRAI tag accepts, within the length cap', () => {
    for (const [name, text] of RENDERED) {
      const body = SMS_TEMPLATE_BODIES[name];
      const tags = [...body.matchAll(PLACEHOLDER)].map((m) => m[1] as keyof typeof DLT_TAGS);
      const values = variablesOf(body, text);
      expect(values, name).toHaveLength(tags.length);
      tags.forEach((tag, i) => {
        expect(values[i], `${name} variable ${i + 1}`).toMatch(DLT_TAGS[tag]);
        expect(values[i]?.length ?? 0, `${name} variable ${i + 1}`).toBeLessThanOrEqual(
          DLT_VAR_MAX_LENGTH,
        );
      });
    }
  });

  it('pins the tag patterns: numeric is digits only, alphanumeric is letters and digits in single-spaced words', () => {
    expect('123456').toMatch(DLT_TAGS.numeric);
    for (const bad of ['5,000', '5000.00', '-5', '', ' 1'])
      expect(bad).not.toMatch(DLT_TAGS.numeric);
    for (const good of ['all', 'invest', 'cancel SIP of', 'HDFC Flexi Cap', 'Nifty 50']) {
      expect(good).toMatch(DLT_TAGS.alphanumeric);
    }
    for (const bad of ['', ' all', 'all ', 'a  b', 'Mid & Small', '12.345', 'FA+9qCX9VSu']) {
      expect(bad).not.toMatch(DLT_TAGS.alphanumeric);
    }
  });

  it('renders the login SMS byte-for-byte', () => {
    expect(loginSmsText('123456')).toBe(
      `123456 is your Sanchay login OTP. Valid 5 min. Never share it; Sanchay staff never ask for it. ${DLT_SIGNOFF}\n@app.sanchay.in #123456`,
    );
  });

  it('renders the consent SMS byte-for-byte, with the amount as digits-only rupees and paise', () => {
    expect(consentSmsText(EXAMPLE)).toBe(
      `123456 is your OTP to invest Rs 5000.00 in HDFC Flexi Cap on Sanchay. Valid 5 min. Never share it. ${DLT_SIGNOFF}\n@app.sanchay.in #123456`,
    );
  });

  it('normalises the amount without ever changing its value', () => {
    const rs = (amount: string): string =>
      /Rs (\S+) in/.exec(consentSmsText({ ...EXAMPLE, amount }))?.[1] ?? '';
    expect(rs('5000.00')).toBe('5000.00');
    expect(rs('5,000.00')).toBe('5000.00');
    expect(rs('1,00,000.50')).toBe('100000.50');
    expect(rs('2500')).toBe('2500.00');
    expect(rs('2500.5')).toBe('2500.50');
    expect(rs('0.75')).toBe('0.75');
  });

  it('refuses an amount it cannot state exactly (a consent SMS never misstates money)', () => {
    for (const amount of ['', '-5.00', '5.001', 'Rs 5', '5e3', '1.2.3', '₹5000']) {
      expect(() => consentSmsText({ ...EXAMPLE, amount }), amount).toThrow(RangeError);
    }
  });

  it('renders redeem-all byte-for-byte and refuses a decimal units value (units mode needs a new template)', () => {
    expect(consentUnitsSmsText(UNITS_EXAMPLE)).toBe(
      `123456 is your OTP to redeem all units of HDFC Flexi Cap on Sanchay. Valid 5 min. Never share it. ${DLT_SIGNOFF}\n@app.sanchay.in #123456`,
    );
    expect(() => consentUnitsSmsText({ ...UNITS_EXAMPLE, units: '12.345' })).toThrow(RangeError);
  });

  it('renders the onboarding attest SMS byte-for-byte', () => {
    expect(attestSmsText('123456')).toBe(
      `123456 is your OTP to confirm your Sanchay account details. Valid 5 min. Never share it. ${DLT_SIGNOFF}\n@app.sanchay.in #123456`,
    );
  });

  it('reduces free text to an #alphanumeric# value: & becomes and, other punctuation a space, cut at a word within 30', () => {
    expect(dltText('HDFC Flexi Cap')).toBe('HDFC Flexi Cap');
    expect(dltText('Axis Mid & Small Cap')).toBe('Axis Mid and Small Cap');
    expect(dltText('ICICI Pru. Bluechip (G)')).toBe('ICICI Pru Bluechip G');
    expect(dltText('  Nifty   50  ')).toBe('Nifty 50');
    expect(dltText('Aditya Birla Sun Life Frontline Equity')).toBe('Aditya Birla Sun Life');
    expect(dltText('x'.repeat(40))).toBe('x'.repeat(30));
    expect(dltText('')).toBe('');
    expect(dltText('&&')).toBe('and and');
  });

  it('sanitises the scheme name and falls back to "your scheme" when none is set', () => {
    expect(consentSmsText({ ...EXAMPLE, schemeShort: 'Axis Mid & Small Cap' })).toContain(
      ' in Axis Mid and Small Cap on Sanchay.',
    );
    expect(consentSmsText({ ...EXAMPLE, schemeShort: '' })).toContain(
      ' in your scheme on Sanchay.',
    );
    expect(consentUnitsSmsText({ ...UNITS_EXAMPLE, schemeShort: '' })).toContain(
      ' units of your scheme on Sanchay.',
    );
  });

  it('refuses an action or code that does not fit its tag', () => {
    expect(() => consentSmsText({ ...EXAMPLE, action: 'buy!' })).toThrow(RangeError);
    expect(() => consentSmsText({ ...EXAMPLE, action: 'x'.repeat(31) })).toThrow(RangeError);
    expect(() => loginSmsText('12a456')).toThrow(RangeError);
  });

  it('maps each consent variant to its DLT template id', () => {
    expect(renderConsentSms({ template: 'CONSENT', ...EXAMPLE }, '123456')).toEqual({
      templateId: 'SANCHAY_CONSENT_OTP_V1',
      text: consentSmsText(EXAMPLE),
    });
    expect(
      renderConsentSms(
        { template: 'CONSENT_UNITS', units: 'all', schemeShort: 'HDFC Flexi Cap' },
        '123456',
      ),
    ).toEqual({
      templateId: 'SANCHAY_CONSENT_UNITS_OTP_V1',
      text: consentUnitsSmsText(UNITS_EXAMPLE),
    });
    expect(renderConsentSms({ template: 'ATTEST' }, '123456')).toEqual({
      templateId: 'SANCHAY_ATTEST_OTP_V1',
      text: attestSmsText('123456'),
    });
  });

  it('matches docs/dlt/sms-templates.md exactly for all four templates (G-B4 registration text)', () => {
    const doc = readFileSync(
      new URL('../../../../../docs/dlt/sms-templates.md', import.meta.url),
      'utf8',
    ).replace(/\r\n/g, '\n');
    for (const [key, body] of Object.entries(SMS_TEMPLATE_BODIES)) {
      expect(doc, `${key} body`).toContain(body);
    }
    for (const [name, text] of RENDERED) expect(doc, `${name} example`).toContain(text);
    expect(doc).not.toContain('{#var#}\n@app.sanchay.in');
  });
});
