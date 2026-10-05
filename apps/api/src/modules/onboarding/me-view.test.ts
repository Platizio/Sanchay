import { describe, expect, it } from 'vitest';
import { isShownRiskProfileStatus, mergeLegalAcceptances } from './me-view.js';

const at = (iso: string) => new Date(iso);

describe('mergeLegalAcceptances (me.get v2 legal versions)', () => {
  it('keeps the latest acceptance per key, sorted by key', () => {
    expect(
      mergeLegalAcceptances([
        { key: 'TNC', version: '1', at: at('2026-10-20T05:00:00Z') },
        { key: 'KYC_CONSENT', version: '1', at: at('2026-10-19T05:00:00Z') },
        { key: 'TNC', version: '2', at: at('2026-11-13T05:00:00Z') },
      ]),
    ).toEqual([
      { key: 'KYC_CONSENT', version: '1' },
      { key: 'TNC', version: '2' },
    ]);
  });

  it('ignores a newer row whose version could not be resolved', () => {
    expect(
      mergeLegalAcceptances([
        { key: 'TNC', version: '1', at: at('2026-10-20T05:00:00Z') },
        { key: 'TNC', version: null, at: at('2026-11-13T05:00:00Z') },
      ]),
    ).toEqual([{ key: 'TNC', version: '1' }]);
  });

  it('returns nothing for an investor who has accepted nothing', () => {
    expect(mergeLegalAcceptances([])).toEqual([]);
  });
});

describe('isShownRiskProfileStatus', () => {
  it('shows ACTIVE, STALE and EXPIRED profiles and hides SUPERSEDED history', () => {
    expect(['ACTIVE', 'STALE', 'EXPIRED', 'SUPERSEDED'].filter(isShownRiskProfileStatus)).toEqual([
      'ACTIVE',
      'STALE',
      'EXPIRED',
    ]);
  });
});
