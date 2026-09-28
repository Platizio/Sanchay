import type { Money } from './money.js';

export type HoldingMoneyKind = 'value' | 'invested' | 'unknown';
export type HoldingMoneyNote = 'UNITS_BEING_CONFIRMED' | 'VALUE_PENDING';

export interface HoldingMoneyInput {
  readonly currentValue: Money | null;
  readonly invested: Money | null;
  readonly unitsPending: boolean;
}

export interface HoldingMoney {
  readonly amount: Money | null;
  readonly kind: HoldingMoneyKind;
  readonly note: HoldingMoneyNote | null;
}

/** Decides what a holding row shows in its money slot. Invested money is never labelled as value. */
export function holdingMoney(input: HoldingMoneyInput): HoldingMoney {
  if (input.currentValue !== null) {
    return { amount: input.currentValue, kind: 'value', note: null };
  }
  if (input.invested !== null) {
    return {
      amount: input.invested,
      kind: 'invested',
      note: input.unitsPending ? 'UNITS_BEING_CONFIRMED' : 'VALUE_PENDING',
    };
  }
  return { amount: null, kind: 'unknown', note: 'VALUE_PENDING' };
}
