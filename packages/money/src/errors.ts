export type DecimalErrorCode =
  | 'NOT_A_DECIMAL_STRING'
  | 'SCALE_EXCEEDED'
  | 'OUT_OF_RANGE'
  | 'SCALE_MISMATCH'
  | 'NOT_POSITIVE'
  | 'DIVISION_BY_ZERO';

/** Thrown for every invalid decimal input or operation. `code` is stable; `message` is for logs only. */
export class DecimalError extends Error {
  readonly code: DecimalErrorCode;

  constructor(code: DecimalErrorCode, message: string) {
    super(message);
    this.name = 'DecimalError';
    this.code = code;
  }
}
