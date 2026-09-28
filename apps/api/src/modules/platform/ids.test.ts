import { validate, version } from 'uuid';
import { describe, expect, it } from 'vitest';
import { asRowId, newId } from './ids.js';

describe('newId', () => {
  it('mints RFC 9562 version-7 UUIDs', () => {
    const id = newId('investors');
    expect(validate(id)).toBe(true);
    expect(version(id)).toBe(7);
  });

  it('mints ids that sort in creation order', () => {
    const ids = Array.from({ length: 50 }, () => newId('otp_codes'));
    expect([...ids].sort()).toEqual(ids);
  });
});

describe('asRowId', () => {
  it('accepts a UUID and lower-cases it', () => {
    expect(asRowId('investors', '0199A0B2-3C4D-7E8F-9A0B-1C2D3E4F5A6B')).toBe(
      '0199a0b2-3c4d-7e8f-9a0b-1c2d3e4f5a6b',
    );
  });

  it('rejects non-UUID input', () => {
    expect(() => asRowId('investors', 'not-a-uuid')).toThrow(TypeError);
  });
});
