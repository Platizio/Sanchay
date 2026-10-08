import { describe, expect, it } from 'vitest';
import golden from '../../test-fixtures/src/golden/suitability-rp.json' with { type: 'json' };
import { compareRiskometer } from '../src/rules/suitability.js';

describe('compareRiskometer', () => {
  for (const row of golden) {
    it(`${row.id}: max=${row.maxRiskometer} scheme=${row.schemeRiskometer} -> ${row.outcome}`, () => {
      expect(compareRiskometer(row.maxRiskometer as never, row.schemeRiskometer as never)).toBe(
        row.outcome,
      );
    });
  }
});
