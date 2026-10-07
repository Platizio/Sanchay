import { describe, expect, it, vi } from 'vitest';
import { runComputeSchemeReturns } from './returns.job.js';

describe('runComputeSchemeReturns', () => {
  it('upserts one scheme_returns row per curated scheme, for today', async () => {
    const values = vi.fn().mockReturnThis();
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const db = {
      query: {
        schemes: {
          findMany: vi.fn().mockResolvedValue([{ id: 's1', isin: 'INF000P01011', curated: true }]),
        },
      },
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([
          { navDate: '2026-01-10', nav: '100.000000' },
          { navDate: '2027-01-10', nav: '110.000000' },
        ]),
      }),
      insert: vi.fn().mockReturnValue({ values, onConflictDoUpdate }),
    };
    await runComputeSchemeReturns(db as never, {
      clock: { now: () => new Date('2027-01-10T12:00:00.000Z') },
    });
    expect(db.query.schemes.findMany).toHaveBeenCalled();
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        schemeId: 's1',
        asOf: '2027-01-10',
        cagr1y: '10.0000',
        displayEligible: true,
      }),
    );
    expect(onConflictDoUpdate).toHaveBeenCalled();
  });
});
