import { RISKOMETER_LEVELS, type Riskometer } from '../catalogue.js';

export type SuitabilityOutcome = 'MATCH' | 'MISMATCH';

/** MISMATCH when the scheme's riskometer sits above the investor's capped maximum. */
export function compareRiskometer(
  maxAllowed: Riskometer,
  schemeRiskometer: Riskometer,
): SuitabilityOutcome {
  return RISKOMETER_LEVELS.indexOf(schemeRiskometer) <= RISKOMETER_LEVELS.indexOf(maxAllowed)
    ? 'MATCH'
    : 'MISMATCH';
}
