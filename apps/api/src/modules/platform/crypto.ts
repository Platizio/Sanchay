import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import type { RowId, TableName } from './ids.js';
import type { KeyService } from './key-service.js';

const FORMAT_V1 = 0x01;
const HEADER_LEN = 3;
const IV_LEN = 12;
const TAG_LEN = 16;

export interface AadRef {
  table: TableName;
  column: string;
  rowId: RowId;
}

export type BlindIndexKind = 'mobile' | 'email' | 'pan' | 'account_number';

export function sha256(value: string | Buffer): Buffer {
  return createHash('sha256').update(value).digest();
}

function aad(ref: AadRef): Buffer {
  return Buffer.from(`${ref.table}.${ref.column}:${ref.rowId}`, 'utf8');
}

function normalise(kind: BlindIndexKind, value: string): string {
  const trimmed = value.trim();
  if (kind === 'email') return trimmed.toLowerCase();
  if (kind === 'pan') return trimmed.toUpperCase();
  return trimmed;
}

/**
 * App-level field encryption (design §C.10; kept in the MVP with the `local`/`secrets` KeyService).
 * Blob = 0x01 ‖ kid(2) ‖ iv(12) ‖ tag(16) ‖ ct, AES-256-GCM, AAD `table.column:rowId`.
 */
export class Crypto {
  constructor(private readonly keys: KeyService) {}

  encrypt(plaintext: string, ref: AadRef): Buffer {
    const kid = this.keys.currentKid;
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv('aes-256-gcm', this.keys.dek(kid), iv);
    cipher.setAAD(aad(ref));
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const header = Buffer.alloc(HEADER_LEN);
    header.writeUInt8(FORMAT_V1, 0);
    header.writeUInt16BE(kid, 1);
    return Buffer.concat([header, iv, cipher.getAuthTag(), ct]);
  }

  decrypt(blob: Buffer, ref: AadRef): string {
    if (blob.length < HEADER_LEN + IV_LEN + TAG_LEN || blob.readUInt8(0) !== FORMAT_V1) {
      throw new Error('Crypto.decrypt: unknown ciphertext format');
    }
    const kid = blob.readUInt16BE(1);
    const iv = blob.subarray(HEADER_LEN, HEADER_LEN + IV_LEN);
    const tag = blob.subarray(HEADER_LEN + IV_LEN, HEADER_LEN + IV_LEN + TAG_LEN);
    const ct = blob.subarray(HEADER_LEN + IV_LEN + TAG_LEN);
    const decipher = createDecipheriv('aes-256-gcm', this.keys.dek(kid), iv);
    decipher.setAAD(aad(ref));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  }

  blindIndex(kind: BlindIndexKind, value: string): Buffer {
    return createHmac('sha256', this.keys.blindIndexKey())
      .update(`${kind}:${normalise(kind, value)}`)
      .digest();
  }

  sha256(value: string | Buffer): Buffer {
    return sha256(value);
  }
}
