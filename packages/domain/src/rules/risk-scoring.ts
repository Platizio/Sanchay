import type { Riskometer } from '../catalogue.js';
import { defineEnum, type EnumValue } from '../define-enum.js';

export const RISK_LEVELS = defineEnum([
  'CONSERVATIVE',
  'MOD_CONSERVATIVE',
  'MODERATE',
  'MOD_AGGRESSIVE',
  'AGGRESSIVE',
]);
export type RiskLevel = EnumValue<typeof RISK_LEVELS>;

export type Horizon = '<1' | '1-3' | '3-5' | '>5';
export type Goal = 'PROTECT_CAPITAL' | 'REGULAR_INCOME' | 'BALANCED_GROWTH' | 'MAXIMUM_GROWTH';
export type IncomeStability = 'NONE_IRREGULAR' | 'VARIABLE' | 'STABLE' | 'STABLE_PLUS_OTHER';
export type EmergencySavings = 'NONE' | 'LT_3M' | 'M3_6' | 'GT_6M';
export type EmiShare = 'GT_50' | 'PCT_30_50' | 'PCT_10_30' | 'LT_10';
export type Experience = 'NONE' | 'FD_DEBT_ONLY' | 'EQUITY_LT_3Y' | 'EQUITY_GTE_3Y';
export type Reaction = 'SELL_ALL' | 'SELL_SOME' | 'HOLD' | 'BUY_MORE';

export interface RiskQuestionnaireAnswers {
  horizon: Horizon;
  goal: Goal;
  incomeStability: IncomeStability;
  emergencySavings: EmergencySavings;
  emiShare: EmiShare;
  experience: Experience;
  reaction: Reaction;
}

export interface RiskScoreResult {
  rawScore: number;
  level: RiskLevel;
  maxRiskometer: Riskometer;
  cappedBy: string[];
}

type Points = 1 | 2 | 3 | 4;

/** One table per question: option values repeat across questions (`NONE`), so a single flat map would be fragile. */
const POINTS: {
  [K in keyof RiskQuestionnaireAnswers]: Record<RiskQuestionnaireAnswers[K], Points>;
} = {
  horizon: { '<1': 1, '1-3': 2, '3-5': 3, '>5': 4 },
  goal: { PROTECT_CAPITAL: 1, REGULAR_INCOME: 2, BALANCED_GROWTH: 3, MAXIMUM_GROWTH: 4 },
  incomeStability: { NONE_IRREGULAR: 1, VARIABLE: 2, STABLE: 3, STABLE_PLUS_OTHER: 4 },
  emergencySavings: { NONE: 1, LT_3M: 2, M3_6: 3, GT_6M: 4 },
  emiShare: { GT_50: 1, PCT_30_50: 2, PCT_10_30: 3, LT_10: 4 },
  experience: { NONE: 1, FD_DEBT_ONLY: 2, EQUITY_LT_3Y: 3, EQUITY_GTE_3Y: 4 },
  reaction: { SELL_ALL: 1, SELL_SOME: 2, HOLD: 3, BUY_MORE: 4 },
};

/** Q1: age is derived from DOB, never asked. 60 and over -> 1, 45-59 -> 2, 30-44 -> 3, under 30 -> 4. */
export function ageScore(dob: string, asOf: string): 1 | 2 | 3 | 4 {
  const birth = new Date(`${dob}T00:00:00Z`);
  const at = new Date(`${asOf}T00:00:00Z`);
  let age = at.getUTCFullYear() - birth.getUTCFullYear();
  const hadBirthday =
    at.getUTCMonth() > birth.getUTCMonth() ||
    (at.getUTCMonth() === birth.getUTCMonth() && at.getUTCDate() >= birth.getUTCDate());
  if (!hadBirthday) age -= 1;
  if (age >= 60) return 1;
  if (age >= 45) return 2;
  if (age >= 30) return 3;
  return 4;
}

const BANDS: ReadonlyArray<{ level: RiskLevel; min: number; max: number; cap: Riskometer }> = [
  { level: 'CONSERVATIVE', min: 8, max: 13, cap: 'LOW_TO_MODERATE' },
  { level: 'MOD_CONSERVATIVE', min: 14, max: 18, cap: 'MODERATE' },
  { level: 'MODERATE', min: 19, max: 23, cap: 'MODERATELY_HIGH' },
  { level: 'MOD_AGGRESSIVE', min: 24, max: 28, cap: 'HIGH' },
  { level: 'AGGRESSIVE', min: 29, max: 32, cap: 'VERY_HIGH' },
];

function bandFor(score: number): (typeof BANDS)[number] {
  const band = BANDS.find((b) => score >= b.min && score <= b.max);
  if (!band) throw new RangeError(`scoreRiskQuestionnaire: raw score ${score} out of range 8..32`);
  return band;
}

/**
 * GAP-03 §1. The final level is the more conservative of the score band and every triggered cap; every
 * triggered cap is reported in `cappedBy` (also a cap that the other cap already subsumes).
 */
export function scoreRiskQuestionnaire(
  dob: string,
  answers: RiskQuestionnaireAnswers,
  asOf: string,
): RiskScoreResult {
  const rawScore =
    ageScore(dob, asOf) +
    POINTS.horizon[answers.horizon] +
    POINTS.goal[answers.goal] +
    POINTS.incomeStability[answers.incomeStability] +
    POINTS.emergencySavings[answers.emergencySavings] +
    POINTS.emiShare[answers.emiShare] +
    POINTS.experience[answers.experience] +
    POINTS.reaction[answers.reaction];

  const scoreBand = bandFor(rawScore);
  const cappedBy: string[] = [];
  const capLevels: RiskLevel[] = [];
  if (answers.horizon === '<1') {
    cappedBy.push('HORIZON_LT_1Y');
    capLevels.push('CONSERVATIVE');
  }
  if (answers.horizon === '1-3') {
    cappedBy.push('HORIZON_1_3Y');
    capLevels.push('MOD_CONSERVATIVE');
  }
  if (answers.reaction === 'SELL_ALL') {
    cappedBy.push('REACTION_SELL_ALL');
    capLevels.push('MOD_CONSERVATIVE');
  }

  let finalIndex = RISK_LEVELS.indexOf(scoreBand.level);
  for (const cap of capLevels) finalIndex = Math.min(finalIndex, RISK_LEVELS.indexOf(cap));
  const finalLevel = RISK_LEVELS[finalIndex] ?? scoreBand.level;
  const finalBand = BANDS.find((b) => b.level === finalLevel) ?? scoreBand;

  return { rawScore, level: finalLevel, maxRiskometer: finalBand.cap, cappedBy };
}
