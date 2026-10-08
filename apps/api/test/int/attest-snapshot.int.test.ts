import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { legalDocuments } from '../../src/modules/legal-consent/legal-consent.schema.js';
import { LegalDocs } from '../../src/modules/legal-consent/legal-docs.service.js';
import { buildAttestSnapshot } from '../../src/modules/onboarding/attest.service.js';
import { DeclarationsService } from '../../src/modules/onboarding/declarations.service.js';
import { DAY } from '../../src/modules/platform/clock.js';
import { bootTestApp, type TestApp } from './app.js';
import { seedReadyInvestor } from './onboarding-seed.js';

let t: TestApp;
beforeAll(async () => {
  t = await bootTestApp();
});
afterAll(async () => {
  await t.close();
});

describe('ONBOARDING_ATTEST snapshot resolves legal documents by the clock (PRV-3, LC-3)', () => {
  it('current(), pending() and the snapshot all name v1 while a v2 is published but not yet effective', async () => {
    const investor = await seedReadyInvestor(t); // seeds every key at v1, effective now
    await t.db.db.insert(legalDocuments).values({
      createdBy: 'test',
      updatedBy: 'test',
      key: 'TNC',
      version: '2',
      bodyMarkdown: '# TNC v2',
      sha256: Buffer.alloc(32, 9),
      status: 'PUBLISHED',
      effectiveFrom: new Date(t.clock.now().getTime() + DAY),
    });

    expect((await t.app.get(LegalDocs).current(t.db.db, 'TNC')).version).toBe('1');
    const pending = await t.app.get(DeclarationsService).pending({
      investorId: investor.investorId,
    } as never);
    expect(pending.every((p) => p.version === '1')).toBe(true);

    const snapshot = await buildAttestSnapshot(t.db.db, {
      investorId: investor.investorId,
      subjects: [{ table: 'onboarding_applications', id: investor.applicationId }],
      templateKey: 'TPL_ONBOARDING_ATTEST',
      moneyParamsVersion: 'test',
      destinationsMasked: [],
      fields: {},
    });
    const tnc = snapshot.legalDocuments.find((d) => d.key === 'TNC');
    expect(tnc?.version).toBe('1');
    expect(snapshot.legalDocuments.every((d) => d.version === '1')).toBe(true);

    t.clock.advance(2 * DAY); // v2 takes effect
    const after = await buildAttestSnapshot(t.db.db, {
      investorId: investor.investorId,
      subjects: [],
      templateKey: 'TPL_ONBOARDING_ATTEST',
      moneyParamsVersion: 'test',
      destinationsMasked: [],
      fields: {},
    });
    expect(after.legalDocuments.find((d) => d.key === 'TNC')?.version).toBe('2');
  });
});
