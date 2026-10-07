/**
 * A restricted RFC 8785 (JCS) canonicalizer for `sanchay.consent.v2` snapshots. The snapshot schema
 * (snapshot-v2.ts) only ever holds strings, booleans, null, plain objects and arrays — money, units and
 * NAV are fixed-scale decimal STRINGS, never JS numbers (design §C.1) — so this covers exactly that value
 * space and refuses anything wider, most importantly `number` (D-MONEY: "snapshot rejects float numbers").
 */
export type JcsValue =
  | string
  | boolean
  | null
  | readonly JcsValue[]
  | { readonly [key: string]: JcsValue };

function escapeString(value: string): string {
  let out = '"';
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === '"') out += '\\"';
    else if (ch === '\\') out += '\\\\';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (ch === '\b') out += '\\b';
    else if (ch === '\f') out += '\\f';
    else if (code < 0x20) out += `\\u${code.toString(16).padStart(4, '0')}`;
    else out += ch;
  }
  return `${out}"`;
}

function isPlainObject(value: unknown): value is Record<string, JcsValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** RFC 8785 canonical JSON: object keys sorted by UTF-16 code unit, no insignificant whitespace. */
export function canonicalize(value: JcsValue): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return escapeString(value);
  if (Array.isArray(value)) return `[${value.map((v) => canonicalize(v as JcsValue)).join(',')}]`;
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${keys
      .map((k) => `${escapeString(k)}:${canonicalize(value[k] as JcsValue)}`)
      .join(',')}}`;
  }
  throw new TypeError(
    `canonicalize: unsupported value of type ${typeof value}; the consent snapshot never carries JS numbers — use a fixed-scale decimal string`,
  );
}
