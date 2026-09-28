import { parseIsoDateParts } from '@sanchay/money';

declare const brand: unique symbol;

/** Nominal string types: a plain string must pass a guard before it becomes an Isin or IsoDate. */
export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type Isin = Brand<string, 'Isin'>;
/** Business date in IST, YYYY-MM-DD (§C.1, §D.1). */
export type IsoDate = Brand<string, 'IsoDate'>;

/** Mutual-fund ISIN (DB CHECK §C.5). */
export const ISIN_REGEX = /^INF[A-Z0-9]{9}$/;

export function isIsin(value: unknown): value is Isin {
  return typeof value === 'string' && ISIN_REGEX.test(value);
}

export function toIsin(value: string): Isin {
  if (!isIsin(value)) {
    throw new RangeError('toIsin: not a mutual-fund ISIN');
  }
  return value;
}

export function isIsoDate(value: unknown): value is IsoDate {
  return typeof value === 'string' && parseIsoDateParts(value) !== null;
}

export function toIsoDate(value: string): IsoDate {
  if (!isIsoDate(value)) {
    throw new RangeError('toIsoDate: not a calendar date in YYYY-MM-DD form');
  }
  return value;
}
