import { describe, expect, it } from 'vitest';
import { FpJsonError, fpJson } from './fp-json.js';

describe('fpJson.parse', () => {
  it('parses 1234567890123.45 into Money without float loss', () => {
    const parsed = fpJson.parse('{"amount":1234567890123.45}') as { amount: unknown };
    expect(fpJson.money(parsed.amount, 'amount').toWire()).toBe('1234567890123.45');
  });

  it('parses 12345.678 into platform-scale Units without float loss', () => {
    const parsed = fpJson.parse('{"allotted_units":12345.678}') as { allotted_units: unknown };
    expect(fpJson.units(parsed.allotted_units, 'allotted_units').toWire()).toBe('12345.678');
  });

  it('a JS number would have lost precision on this exact value (proves the test is meaningful)', () => {
    const viaJsNumber = JSON.parse('{"amount":12345678901234567.89}').amount as number;
    expect(String(viaJsNumber)).not.toBe('12345678901234567.89');
    const lossless = fpJson.parse('{"amount":12345678901234567.89}') as { amount: unknown };
    expect(String(lossless.amount)).toBe('12345678901234567.89');
  });

  it('parses a 6dp NAV', () => {
    const parsed = fpJson.parse('{"nav":45.123456}') as { nav: unknown };
    expect(fpJson.nav(parsed.nav, 'nav').toWire()).toBe('45.123456');
  });

  it('rejects a non-numeric field', () => {
    const parsed = fpJson.parse('{"amount":"not-a-number"}') as { amount: unknown };
    expect(() => fpJson.money(parsed.amount, 'amount')).toThrow(FpJsonError);
  });
});
