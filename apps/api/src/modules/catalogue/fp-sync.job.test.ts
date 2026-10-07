import { describe, expect, it, vi } from 'vitest';
import { fpJson } from '../../integrations/fp/fp-json.js';
import { runCatalogueFpSync, toSipDates, toThresholds } from './fp-sync.job.js';

describe('catalogue.fp.sync', () => {
  it('only touches curated ISINs', async () => {
    const db = {
      query: {
        schemes: {
          findMany: vi.fn().mockResolvedValue([{ id: 's1', isin: 'INF000P01011', curated: true }]),
        },
      },
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockResolvedValue(undefined),
    };
    const fpRead = {
      // Multi-line on purpose: biome 2.5.14 needs two --write passes to settle the one-line form (RV-02-58).
      fundScheme: vi.fn().mockResolvedValue({
        purchase_allowed: true,
        redemption_allowed: true,
        sip_allowed: true,
        lock_in: false,
        lock_in_period: null,
      }),
      schemePlans: vi.fn().mockResolvedValue({
        items: [{ isin: 'INF000P01011', raw: { thresholds: [] } }],
        raw: {},
      }),
    };
    await runCatalogueFpSync(db as never, fpRead as never);
    expect(db.query.schemes.findMany).toHaveBeenCalled();
    expect(fpRead.fundScheme).toHaveBeenCalledWith('INF000P01011');
  });

  it('FP purchase_allowed=false suspends the scheme', async () => {
    const setSpy = vi.fn().mockReturnThis();
    const db = {
      query: {
        schemes: {
          findMany: vi.fn().mockResolvedValue([{ id: 's1', isin: 'INF000P01011', curated: true }]),
        },
      },
      update: vi.fn().mockReturnThis(),
      set: setSpy,
      where: vi.fn().mockResolvedValue(undefined),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockResolvedValue(undefined),
    };
    const fpRead = {
      fundScheme: vi.fn().mockResolvedValue({
        purchase_allowed: false,
        redemption_allowed: true,
        sip_allowed: false,
        lock_in: false,
        lock_in_period: null,
      }),
      schemePlans: vi.fn().mockResolvedValue({
        items: [{ isin: 'INF000P01011', raw: { thresholds: [] } }],
        raw: {},
      }),
    };
    await runCatalogueFpSync(db as never, fpRead as never);
    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'SUSPENDED', purchaseAllowed: false }),
    );
  });

  it('reads lumpsum and monthly SIP limits from the FP thresholds array', () => {
    const raw = fpJson.parse(
      '{"thresholds":[{"type":"lumpsum","amount_min":500,"amount_max":10000000,"amount_multiples":1},{"type":"sip","frequency":"daily","amount_min":100,"amount_max":null,"amount_multiples":1},{"type":"sip","frequency":"monthly","amount_min":1000,"amount_max":null,"amount_multiples":100}]}',
    ) as Record<string, unknown>;
    expect(toThresholds({ isin: 'INF000P01011', raw } as never)).toEqual({
      purchaseMin: '500.00',
      purchaseMax: '10000000.00',
      purchaseMultiple: '1.00',
      sipMin: '1000.00',
      sipMax: null,
      sipMultiple: '100.00',
    });
  });

  it('has no SIP limits or dates without a monthly SIP row, never the lumpsum ones (D-MONEY-026)', () => {
    const raw = fpJson.parse(
      '{"thresholds":[{"type":"lumpsum","amount_min":500,"amount_max":null,"amount_multiples":1},{"type":"sip","frequency":"daily","amount_min":100,"amount_max":null,"amount_multiples":1,"dates":[1,2]}]}',
    ) as Record<string, unknown>;
    const plan = { isin: 'INF000P01011', raw } as never;
    expect(toThresholds(plan)).toEqual({
      purchaseMin: '500.00',
      purchaseMax: null,
      purchaseMultiple: '1.00',
      sipMin: null,
      sipMax: null,
      sipMultiple: null,
    });
    expect(toSipDates(plan)).toBeNull();
  });

  it('allows SIP only with the monthly SIP row, and stores its dates (D-MONEY-026)', async () => {
    const setSpy = vi.fn().mockReturnThis();
    const findMany = vi.fn().mockResolvedValue([
      { id: 's1', isin: 'INF000P01011', curated: true },
      { id: 's2', isin: 'INF000P02022', curated: true },
    ]);
    const db = {
      query: { schemes: { findMany } },
      update: vi.fn().mockReturnThis(),
      set: setSpy,
      where: vi.fn().mockResolvedValue(undefined),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockResolvedValue(undefined),
    };
    const lumpsum = '{"type":"lumpsum","amount_min":500,"amount_max":null,"amount_multiples":1}';
    const plan = (isin: string, sip: string) => ({
      isin,
      raw: fpJson.parse(`{"thresholds":[${lumpsum},${sip}]}`) as Record<string, unknown>,
    });
    const fpRead = {
      fundScheme: vi.fn().mockResolvedValue({
        purchase_allowed: true,
        redemption_allowed: true,
        sip_allowed: true,
        lock_in: false,
        lock_in_period: null,
      }),
      schemePlans: vi.fn().mockResolvedValue({
        items: [
          plan(
            'INF000P01011',
            '{"type":"sip","frequency":"monthly","amount_min":1000,"amount_max":null,"amount_multiples":100,"dates":[28,5,1,5,30]}',
          ),
          plan(
            'INF000P02022',
            '{"type":"sip","frequency":"daily","amount_min":100,"amount_max":null,"amount_multiples":1,"dates":[1,2]}',
          ),
        ],
        raw: {},
      }),
    };
    await runCatalogueFpSync(db as never, fpRead as never);
    expect(setSpy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ sipAllowed: true, sipDates: [1, 5, 28] }),
    );
    expect(setSpy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ sipAllowed: false, sipDates: null }),
    );
  });
});
