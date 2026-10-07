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
