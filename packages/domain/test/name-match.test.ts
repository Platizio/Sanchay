import { describe, expect, it } from 'vitest';
import golden from '../../test-fixtures/src/golden/name-match.json' with { type: 'json' };
import { nameMatchScore } from '../src/rules/name-match.js';

describe('nameMatchScore (Jaro-Winkler, golden NM-01..NM-12)', () => {
  for (const row of golden) {
    it(`${row.id}: "${row.a}" vs "${row.b}" -> ${row.expected} (${row.note})`, () => {
      expect(nameMatchScore(row.a, row.b)).toBe(row.expected);
    });

    it(`${row.id}: >= 80 iff verified`, () => {
      expect(nameMatchScore(row.a, row.b) >= 80).toBe(row.verified);
    });
  }

  it('is symmetric', () => {
    for (const row of golden) {
      expect(nameMatchScore(row.a, row.b)).toBe(nameMatchScore(row.b, row.a));
    }
  });
});
