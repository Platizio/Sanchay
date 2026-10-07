export type ChainName = 'onboarding' | 'lumpsum' | 'sip' | 'redemption';
export type StepStatus = 'PASSED' | 'SKIPPED' | 'FAILED';

export interface StepResult {
  readonly name: string;
  readonly status: StepStatus;
  readonly detail: string;
}

export interface ChainResult {
  readonly chain: ChainName;
  readonly steps: readonly StepResult[];
}

export interface FpProbeClient {
  preVerify(input: {
    pan: string;
    name: string;
    dateOfBirth: string;
  }): Promise<Record<string, unknown>>;
  getPreVerification(id: string): Promise<Record<string, unknown>>;
  schemePlans(): Promise<Array<Record<string, unknown>>>;
  createPurchase(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  getPurchase(id: string): Promise<Record<string, unknown>>;
  updatePurchase(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  createMandate(input: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface ChainContext {
  readonly client: FpProbeClient;
}

export interface RunOptions {
  readonly env: 'fake' | 'sandbox';
}
