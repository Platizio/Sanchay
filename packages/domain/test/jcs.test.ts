import { describe, expect, it } from 'vitest';
import { canonicalize } from '../src/consent/jcs.js';

describe('canonicalize (RFC 8785 JCS, restricted to the consent-snapshot value space)', () => {
  it('sorts object keys by UTF-16 code unit', () => {
    expect(canonicalize({ b: 'two', a: 'one' })).toBe('{"a":"one","b":"two"}');
  });

  it('nests sorted objects inside arrays', () => {
    expect(canonicalize([{ z: 'z', a: 'a' }, 'x'])).toBe('[{"a":"a","z":"z"},"x"]');
  });

  it('escapes control characters and quotes as RFC 8785 requires', () => {
    expect(canonicalize('line1\nline2\ttab"quote\\slash')).toBe(
      '"line1\\nline2\\ttab\\"quote\\\\slash"',
    );
  });

  it('escapes carriage return, backspace and form feed with their short escapes', () => {
    expect(canonicalize('a\rb\bc\fd')).toBe('"a\\rb\\bc\\fd"');
  });

  it('escapes characters below 0x20 that have no short escape as \\u00XX', () => {
    expect(canonicalize('a\u0001b')).toBe('"a\\u0001b"');
  });

  it('renders booleans and null without quotes', () => {
    expect(canonicalize({ ok: true, missing: null, no: false })).toBe(
      '{"missing":null,"no":false,"ok":true}',
    );
  });

  it('produces no insignificant whitespace', () => {
    const out = canonicalize({ a: ['x', 'y'], b: { c: 'd' } });
    expect(out).not.toMatch(/\s/);
  });

  it('is deterministic across key insertion order', () => {
    const first = canonicalize({ x: '1', y: '2', z: '3' });
    const second = canonicalize({ z: '3', y: '2', x: '1' });
    expect(first).toBe(second);
  });

  it('refuses a JavaScript number (only decimal strings belong in a consent snapshot)', () => {
    // biome-ignore lint/suspicious/noExplicitAny: proving the runtime guard against a value TypeScript would reject
    expect(() => canonicalize(12345.678 as any)).toThrow(TypeError);
  });

  it('refuses undefined', () => {
    // biome-ignore lint/suspicious/noExplicitAny: same as above
    expect(() => canonicalize(undefined as any)).toThrow(TypeError);
  });
});
