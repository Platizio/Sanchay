import { describe, expect, it } from 'vitest';
import golden from '../../test-fixtures/src/golden/risk-profile.json' with { type: 'json' };
import { ageScore, scoreRiskQuestionnaire } from '../src/rules/risk-scoring.js';

describe('ageScore (Q1, derived from DOB)', () => {
  it('bands by age as of the given date', () => {
    expect(ageScore('1960-01-01', '2026-09-28')).toBe(1); // 66
    expect(ageScore('1975-01-01', '2026-09-28')).toBe(2); // 51
    expect(ageScore('1990-01-01', '2026-09-28')).toBe(3); // 36
    expect(ageScore('2005-01-01', '2026-09-28')).toBe(4); // 21
  });

  it('flips on the birthday, not the calendar year', () => {
    expect(ageScore('1966-09-28', '2026-09-28')).toBe(1); // turns 60 today
    expect(ageScore('1966-09-29', '2026-09-28')).toBe(2); // turns 60 tomorrow
    expect(ageScore('1996-09-28', '2026-09-28')).toBe(3); // turns 30 today
    expect(ageScore('1996-09-29', '2026-09-28')).toBe(4); // turns 30 tomorrow
  });
});

describe('scoreRiskQuestionnaire (GAP-03 §1 golden vectors RP-001..RP-013)', () => {
  for (const row of golden) {
    it(`${row.id}: raw ${row.rawScore} -> ${row.level}/${row.maxRiskometer}`, () => {
      const result = scoreRiskQuestionnaire(
        row.dob,
        {
          horizon: row.horizon as never,
          goal: row.goal as never,
          incomeStability: row.incomeStability as never,
          emergencySavings: row.emergencySavings as never,
          emiShare: row.emiShare as never,
          experience: row.experience as never,
          reaction: row.reaction as never,
        },
        row.asOf,
      );
      expect(result.rawScore).toBe(row.rawScore);
      expect(result.level).toBe(row.level);
      expect(result.maxRiskometer).toBe(row.maxRiskometer);
      expect([...result.cappedBy].sort()).toEqual([...row.cappedBy].sort());
    });
  }
});
