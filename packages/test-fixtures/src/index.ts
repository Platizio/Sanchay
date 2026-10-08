import nominationSplitJson from './golden/nomination-split.json' with { type: 'json' };
import returnsJson from './golden/returns.json' with { type: 'json' };

export interface ReturnsVectorHistoryPoint {
  navDate: string;
  nav: string;
}

export interface ReturnsVectorExpected {
  cagr1y: string | null;
  cagr3y: string | null;
  cagr5y: string | null;
  abs6m: string | null;
  displayEligible: boolean;
}

export interface ReturnsVector {
  id: string;
  description: string;
  asOf: string;
  history: ReturnsVectorHistoryPoint[];
  expected: ReturnsVectorExpected;
}

export const RETURNS_VECTORS: readonly ReturnsVector[] = returnsJson;

export interface NominationSplitEqualVector {
  id: string;
  kind: 'equalSplit';
  n: 1 | 2 | 3;
  expected: number[];
}

export interface NominationSplitCustomVector {
  id: string;
  kind: 'custom';
  allocations: number[];
  valid: boolean;
}

export type NominationSplitVector = NominationSplitEqualVector | NominationSplitCustomVector;

export const NOMINATION_SPLIT_VECTORS: readonly NominationSplitVector[] =
  nominationSplitJson as NominationSplitVector[];
