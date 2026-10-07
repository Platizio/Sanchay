import { createHmac, timingSafeEqual } from 'node:crypto';

export type FpWebhookAuthMode = 'hmac' | 'shared_secret';
export type FpSignatureMode = 'HMAC' | 'SHARED_SECRET' | 'NONE';

export interface FpSignatureResult {
  valid: boolean;
  signatureMode: FpSignatureMode;
}

const SIGNATURE_HEADER_RE = /^[^:]+:(.+)$/;

function hmacSha256(secret: string, data: Buffer): Buffer {
  return createHmac('sha256', secret).update(data).digest();
}

function constantTimeEqualBase64(providedB64: string, expected: Buffer): boolean {
  let provided: Buffer;
  try {
    provided = Buffer.from(providedB64, 'base64');
  } catch {
    return false;
  }
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

/**
 * `FP-Signature: id:b64(HMAC-SHA256(secret, raw))`, falling back to a re-serialised-JSON HMAC for
 * providers that do not relay byte-stable bodies. `shared_secret` mode compares the header directly
 * to the secret. Fails closed: any parse/verify problem is `valid: false`, never a thrown exception.
 * `secret === undefined` is NONE mode (always valid) and is only reachable in local/test, because
 * boot invariant 13 refuses the api role elsewhere without SANCHAY_FP_WEBHOOK_SECRET set, and only
 * the api serves HTTP (RV-03-10).
 */
export function verifyFpSignature(
  raw: Buffer,
  header: string | undefined,
  secret: string | undefined,
  mode: FpWebhookAuthMode,
): FpSignatureResult {
  if (secret === undefined) return { valid: true, signatureMode: 'NONE' };
  const signatureMode: FpSignatureMode = mode === 'hmac' ? 'HMAC' : 'SHARED_SECRET';
  if (header === undefined || header.length === 0) return { valid: false, signatureMode };

  if (mode === 'shared_secret') {
    const expected = Buffer.from(secret, 'utf8');
    const actual = Buffer.from(header, 'utf8');
    const valid = expected.length === actual.length && timingSafeEqual(expected, actual);
    return { valid, signatureMode };
  }

  const match = SIGNATURE_HEADER_RE.exec(header);
  if (match === null) return { valid: false, signatureMode };
  const providedB64 = match[1] as string;
  if (constantTimeEqualBase64(providedB64, hmacSha256(secret, raw))) {
    return { valid: true, signatureMode };
  }
  let reserialised: Buffer;
  try {
    reserialised = Buffer.from(JSON.stringify(JSON.parse(raw.toString('utf8'))), 'utf8');
  } catch {
    return { valid: false, signatureMode };
  }
  const valid = constantTimeEqualBase64(providedB64, hmacSha256(secret, reserialised));
  return { valid, signatureMode };
}
