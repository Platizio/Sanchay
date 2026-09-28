import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  attestSmsText,
  consentSmsText,
  consentUnitsSmsText,
  DLT_SIGNOFF,
  DLT_VAR_MAX_LENGTH,
  loginSmsText,
  renderConsentSms,
  SMS_TEMPLATE_IDS,
  WEBOTP_DOMAIN,
} from './templates.js';

const HASH = 'FA+9qCX9VSu';
const VAR = '{#var#}';
const WEBOTP_LAST_LINE = /^@app\.sanchay\.in #\d{6}$/;
const EXAMPLE = {
  code: '123456',
  action: 'invest',
  amount: '5,000.00',
  schemeShort: 'HDFC Flexi Cap',
};
const UNITS_EXAMPLE = { code: '123456', units: '12.345', schemeShort: 'HDFC Flexi Cap' };
const lastLine = (text: string): string => text.split('\n').at(-1) ?? '';

/** All four R-10 templates, rendered with an optional retriever hash. */
const RENDERERS: ReadonlyArray<readonly [string, (hash?: string) => string]> = [
  ['LOGIN', (hash) => loginSmsText('123456', hash)],
  ['CONSENT', (hash) => consentSmsText(EXAMPLE, hash)],
  ['CONSENT_UNITS', (hash) => consentUnitsSmsText(UNITS_EXAMPLE, hash)],
  ['ATTEST', (hash) => attestSmsText('123456', hash)],
];

describe('SMS templates (H-6 as amended by R-10, DLT)', () => {
  it('pins the four template ids, WebOTP domain, sign-off shape and DLT variable limit', () => {
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

  it('renders the login SMS byte-for-byte without a retriever hash (two lines)', () => {
    expect(loginSmsText('123456')).toBe(
      `123456 is your Sanchay login OTP. Valid 5 min. Never share it; Sanchay staff never ask for it. ${DLT_SIGNOFF}\n@app.sanchay.in #123456`,
    );
  });

  it('renders the login SMS byte-for-byte with the hash on the penultimate line', () => {
    expect(loginSmsText('123456', HASH)).toBe(
      `123456 is your Sanchay login OTP. Valid 5 min. Never share it; Sanchay staff never ask for it. ${DLT_SIGNOFF}\nFA+9qCX9VSu\n@app.sanchay.in #123456`,
    );
    expect(loginSmsText('123456', '')).toBe(loginSmsText('123456'));
  });

  it('keeps the WebOTP line last with and without a hash, for all four templates', () => {
    for (const [name, render] of RENDERERS) {
      expect(lastLine(render()), `${name} without hash`).toMatch(WEBOTP_LAST_LINE);
      expect(lastLine(render(HASH)), `${name} with hash`).toMatch(WEBOTP_LAST_LINE);
      expect(lastLine(render(HASH)), name).toBe('@app.sanchay.in #123456');
    }
  });

  it('renders exactly three lines with the hash penultimate for all four templates (every non-local SMS, B2 invariant 7)', () => {
    for (const [name, render] of RENDERERS) {
      const lines = render(HASH).split('\n');
      expect(lines, name).toHaveLength(3);
      expect(lines[1], name).toBe(HASH);
      expect(lines[0]?.startsWith('123456 '), name).toBe(true);
      expect(lines[0]?.endsWith(` ${DLT_SIGNOFF}`), name).toBe(true);
    }
  });

  it('fits the login SMS with a hash in the 140-byte SMS Retriever limit', () => {
    expect(Buffer.byteLength(loginSmsText('123456', HASH), 'utf8')).toBeLessThanOrEqual(140);
  });

  it('renders the consent SMS byte-for-byte', () => {
    expect(consentSmsText(EXAMPLE, HASH)).toBe(
      `123456 is your OTP to invest Rs 5,000.00 in HDFC Flexi Cap on Sanchay. Valid 5 min. Never share it. ${DLT_SIGNOFF}\nFA+9qCX9VSu\n@app.sanchay.in #123456`,
    );
    expect(consentSmsText(EXAMPLE)).toBe(
      `123456 is your OTP to invest Rs 5,000.00 in HDFC Flexi Cap on Sanchay. Valid 5 min. Never share it. ${DLT_SIGNOFF}\n@app.sanchay.in #123456`,
    );
  });

  it('renders the redeem-by-units and redeem-all SMS byte-for-byte', () => {
    expect(consentUnitsSmsText(UNITS_EXAMPLE, HASH)).toBe(
      `123456 is your OTP to redeem 12.345 units of HDFC Flexi Cap on Sanchay. Valid 5 min. Never share it. ${DLT_SIGNOFF}\nFA+9qCX9VSu\n@app.sanchay.in #123456`,
    );
    expect(consentUnitsSmsText({ ...UNITS_EXAMPLE, units: 'all' })).toBe(
      `123456 is your OTP to redeem all units of HDFC Flexi Cap on Sanchay. Valid 5 min. Never share it. ${DLT_SIGNOFF}\n@app.sanchay.in #123456`,
    );
  });

  it('renders the onboarding attest SMS byte-for-byte', () => {
    expect(attestSmsText('123456', HASH)).toBe(
      `123456 is your OTP to confirm your Sanchay account details. Valid 5 min. Never share it. ${DLT_SIGNOFF}\nFA+9qCX9VSu\n@app.sanchay.in #123456`,
    );
  });

  it('maps each consent variant to its DLT template id', () => {
    expect(renderConsentSms({ template: 'CONSENT', ...EXAMPLE }, '123456', HASH)).toEqual({
      templateId: 'SANCHAY_CONSENT_OTP_V1',
      text: consentSmsText(EXAMPLE, HASH),
    });
    expect(
      renderConsentSms(
        { template: 'CONSENT_UNITS', units: 'all', schemeShort: 'HDFC Flexi Cap' },
        '123456',
      ),
    ).toEqual({
      templateId: 'SANCHAY_CONSENT_UNITS_OTP_V1',
      text: consentUnitsSmsText({ ...UNITS_EXAMPLE, units: 'all' }),
    });
    expect(renderConsentSms({ template: 'ATTEST' }, '123456', HASH)).toEqual({
      templateId: 'SANCHAY_ATTEST_OTP_V1',
      text: attestSmsText('123456', HASH),
    });
  });

  it('refuses consent variables longer than one DLT variable', () => {
    expect(() => consentSmsText({ ...EXAMPLE, schemeShort: 'x'.repeat(31) })).toThrow(RangeError);
    expect(() => consentSmsText({ ...EXAMPLE, action: 'x'.repeat(31) })).toThrow(RangeError);
    expect(() => consentSmsText({ ...EXAMPLE, amount: '9'.repeat(31) })).toThrow(RangeError);
    expect(() => consentSmsText({ ...EXAMPLE, schemeShort: 'x'.repeat(30) })).not.toThrow();
    expect(() => consentUnitsSmsText({ ...UNITS_EXAMPLE, units: '9'.repeat(31) })).toThrow(
      RangeError,
    );
    expect(() => consentUnitsSmsText({ ...UNITS_EXAMPLE, schemeShort: 'x'.repeat(31) })).toThrow(
      RangeError,
    );
  });

  it('matches docs/dlt/sms-templates.md exactly for all four templates (G-B4 registration text)', () => {
    const doc = readFileSync(
      new URL('../../../../../docs/dlt/sms-templates.md', import.meta.url),
      'utf8',
    ).replace(/\r\n/g, '\n');
    expect(doc).toContain(loginSmsText(VAR, VAR));
    expect(doc).toContain(
      consentSmsText({ code: VAR, action: VAR, amount: VAR, schemeShort: VAR }, VAR),
    );
    expect(doc).toContain(consentUnitsSmsText({ code: VAR, units: VAR, schemeShort: VAR }, VAR));
    expect(doc).toContain(attestSmsText(VAR, VAR));
    expect(doc).toContain(loginSmsText('123456', HASH));
    expect(doc).toContain(consentSmsText(EXAMPLE, HASH));
    expect(doc).toContain(consentUnitsSmsText(UNITS_EXAMPLE, HASH));
    expect(doc).toContain(consentUnitsSmsText({ ...UNITS_EXAMPLE, units: 'all' }, HASH));
    expect(doc).toContain(attestSmsText('123456', HASH));
  });
});
