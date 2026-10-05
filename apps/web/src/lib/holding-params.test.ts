import { describe, expect, it } from 'vitest';
import { parseHoldingParams } from './holding-params';

const FOLIO = '0190c0de-0000-7000-8000-00000000f001';

describe('parseHoldingParams (PORT-02 route)', () => {
  it('accepts a folio uuid and an ISIN, normalising case', () => {
    expect(parseHoldingParams({ folioId: FOLIO.toUpperCase(), isin: 'inf109k01z48' })).toEqual({
      folioId: FOLIO,
      isin: 'INF109K01Z48',
    });
  });

  it('refuses anything else, so the page 404s without calling the API', () => {
    expect(parseHoldingParams({ folioId: 'not-a-uuid', isin: 'INF109K01Z48' })).toBeNull();
    expect(parseHoldingParams({ folioId: FOLIO, isin: 'US0378331005' })).toBeNull();
    expect(parseHoldingParams({ folioId: FOLIO, isin: 'INF109K01Z48/../x' })).toBeNull();
  });
});
