export class ProviderCallInTransactionError extends Error {
  override name = 'ProviderCallInTransactionError';
  constructor(op: string) {
    super(`FpTransport.call(${op}): providers must never be called inside a DB transaction`);
  }
}

export class ConsentNotConsumedError extends Error {
  override name = 'ConsentNotConsumedError';
  constructor() {
    super('a P/M FpTransport.call requires a well-shaped ConsumedConsent');
  }
}

export class FpAmbiguousError extends Error {
  override name = 'FpAmbiguousError';
  readonly op: string;
  readonly httpStatus: number | null;

  constructor(op: string, options: { status?: number; cause?: unknown } = {}) {
    super(
      `FP call ${op} was ambiguous${options.status === undefined ? '' : ` (HTTP ${options.status})`}`,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.op = op;
    this.httpStatus = options.status ?? null;
  }
}

export class FpRejectedError extends Error {
  override name = 'FpRejectedError';
  readonly op: string;
  readonly httpStatus: number;
  readonly providerCode: string | null;

  constructor(op: string, httpStatus: number, providerCode: string | null) {
    super(
      `FP call ${op} was rejected (HTTP ${httpStatus}${providerCode === null ? '' : `, ${providerCode}`})`,
    );
    this.op = op;
    this.httpStatus = httpStatus;
    this.providerCode = providerCode;
  }
}

/** Thrown by every `FpProvision`/`FpTransact` stub method until the task named in the message wires it. */
export class NotImplementedYetError extends Error {
  override name = 'NotImplementedYetError';
}
