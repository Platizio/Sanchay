import { describe, expect, it } from 'vitest';
import { ConsentSnapshotV2Schema, snapshotSha256 } from '../src/consent/snapshot-v2.js';

const base = {
  version: 'sanchay.consent.v2' as const,
  subjectType: 'PURCHASE' as const,
  investorId: '018f2f3a-0000-7000-8000-000000000001',
  subjects: [{ table: 'orders', subjectId: '018f2f3a-0000-7000-8000-000000000002' }],
  legalDocuments: [
    { key: 'TPL_PURCHASE' as const, version: '1', sha256: 'a'.repeat(64) },
    { key: 'RISK_DISCLOSURE' as const, version: '1', sha256: 'b'.repeat(64) },
  ],
  moneyParamsVersion: '2026-09-01',
  destinationsMasked: ['9XXXXX2345'],
  fields: { amount: '25000.00', schemeShort: 'Parag Flexi', action: 'invest' },
};

describe('ConsentSnapshotV2Schema', () => {
  it('parses a well-formed snapshot', () => {
    expect(ConsentSnapshotV2Schema.parse(base).subjectType).toBe('PURCHASE');
  });

  it('rejects a snapshot version other than sanchay.consent.v2', () => {
    expect(() => ConsentSnapshotV2Schema.parse({ ...base, version: 'v1' })).toThrow();
  });

  it('rejects a float number inside fields (money must be a fixed-scale string)', () => {
    expect(() =>
      ConsentSnapshotV2Schema.parse({ ...base, fields: { ...base.fields, amount: 25000.5 } }),
    ).toThrow();
  });

  it('rejects an unknown subjectType', () => {
    expect(() => ConsentSnapshotV2Schema.parse({ ...base, subjectType: 'BOGUS' })).toThrow();
  });

  it('rejects an empty subjects array', () => {
    expect(() => ConsentSnapshotV2Schema.parse({ ...base, subjects: [] })).toThrow();
  });

  it('has no timestamp field at the top level (the snapshot must hash identically before and after send delay)', () => {
    const parsed = ConsentSnapshotV2Schema.parse(base);
    expect(Object.keys(parsed)).not.toContain('createdAt');
    expect(Object.keys(parsed)).not.toContain('timestamp');
  });
});

describe('snapshotSha256', () => {
  it('is deterministic for the same snapshot', async () => {
    const parsed = ConsentSnapshotV2Schema.parse(base);
    const a = await snapshotSha256(parsed);
    const b = await snapshotSha256(parsed);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when any field changes', async () => {
    const parsed = ConsentSnapshotV2Schema.parse(base);
    const changed = ConsentSnapshotV2Schema.parse({
      ...base,
      fields: { ...base.fields, amount: '25000.01' },
    });
    expect(await snapshotSha256(parsed)).not.toBe(await snapshotSha256(changed));
  });

  it('is independent of key insertion order (JCS)', async () => {
    const parsed = ConsentSnapshotV2Schema.parse(base);
    const reordered = ConsentSnapshotV2Schema.parse({
      fields: base.fields,
      destinationsMasked: base.destinationsMasked,
      moneyParamsVersion: base.moneyParamsVersion,
      legalDocuments: base.legalDocuments,
      subjects: base.subjects,
      investorId: base.investorId,
      subjectType: base.subjectType,
      version: base.version,
    });
    expect(await snapshotSha256(parsed)).toBe(await snapshotSha256(reordered));
  });
});
