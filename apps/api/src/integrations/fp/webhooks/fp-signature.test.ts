import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyFpSignature } from './fp-signature.js';

const SECRET = 'a-shared-fp-webhook-secret-32bytes!';

function sign(raw: Buffer, secret = SECRET): string {
  return `whk_1:${createHmac('sha256', secret).update(raw).digest('base64')}`;
}

describe('verifyFpSignature', () => {
  it('accepts a signature computed over the exact raw bytes', () => {
    const raw = Buffer.from('{"event":{"id":"evt_1"}}', 'utf8');
    const result = verifyFpSignature(raw, sign(raw), SECRET, 'hmac');
    expect(result).toEqual({ valid: true, signatureMode: 'HMAC' });
  });

  it('accepts a signature computed over the re-serialised JSON when the raw bytes do not match', () => {
    const raw = Buffer.from('{ "event" :  {"id":"evt_1"} }', 'utf8'); // FP relay re-formats whitespace
    const reserialised = Buffer.from(JSON.stringify(JSON.parse(raw.toString('utf8'))), 'utf8');
    const result = verifyFpSignature(raw, sign(reserialised), SECRET, 'hmac');
    expect(result).toEqual({ valid: true, signatureMode: 'HMAC' });
  });

  it('rejects a wrong signature', () => {
    const raw = Buffer.from('{"event":{"id":"evt_1"}}', 'utf8');
    const result = verifyFpSignature(raw, sign(raw, 'wrong-secret'), SECRET, 'hmac');
    expect(result).toEqual({ valid: false, signatureMode: 'HMAC' });
  });

  it('rejects a missing or malformed header', () => {
    const raw = Buffer.from('{}', 'utf8');
    expect(verifyFpSignature(raw, undefined, SECRET, 'hmac').valid).toBe(false);
    expect(verifyFpSignature(raw, 'not-a-signature', SECRET, 'hmac').valid).toBe(false);
  });

  it('shared_secret mode compares the header to the secret directly', () => {
    const raw = Buffer.from('{}', 'utf8');
    expect(verifyFpSignature(raw, SECRET, SECRET, 'shared_secret')).toEqual({
      valid: true,
      signatureMode: 'SHARED_SECRET',
    });
    expect(verifyFpSignature(raw, 'nope', SECRET, 'shared_secret').valid).toBe(false);
  });

  it('an undefined secret is NONE mode and always valid (local/test only, enforced by boot invariant 13)', () => {
    const raw = Buffer.from('{}', 'utf8');
    expect(verifyFpSignature(raw, undefined, undefined, 'hmac')).toEqual({
      valid: true,
      signatureMode: 'NONE',
    });
  });
});
