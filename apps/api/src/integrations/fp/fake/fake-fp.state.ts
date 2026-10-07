export interface StoredPreVerification {
  readonly id: string;
  status: 'accepted' | 'completed' | 'failed';
  readiness: { status: string; code?: string };
  pan: { status: string };
  name: { status: string };
  dateOfBirth: { status: string };
}

export interface StoredInvestorProfile {
  readonly id: string;
  raw: Record<string, unknown>;
}

/** Generic stored row for the provisioning objects FakeFp keeps but does not yet model field by field (E11 extends them). */
export interface StoredRawObject {
  readonly id: string;
  raw: Record<string, unknown>;
}

export interface StoredPurchase {
  readonly id: string;
  readonly oldId: number;
  state: string;
  amount: string;
  scheme: string;
  mfInvestmentAccount: string;
  sourceRefId: string;
  folioNumber: string | null;
  consent: Record<string, unknown> | null;
}

export interface StoredPayment {
  readonly id: number;
  readonly amcOrderIds: readonly number[];
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
}

export interface StoredMandate {
  readonly id: number;
  status: 'CREATED' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  readonly mandateRef: string;
}

/** In-memory object store backing FakeFp; one instance per FakeFp (never shared across tests). */
export class FakeFpState {
  private sequence = 0;

  readonly preVerifications = new Map<string, StoredPreVerification>();
  readonly investorProfiles = new Map<string, StoredInvestorProfile>();
  readonly phoneNumbers = new Map<string, StoredRawObject>();
  readonly emailAddresses = new Map<string, StoredRawObject>();
  readonly addresses = new Map<string, StoredRawObject>();
  readonly relatedParties = new Map<string, StoredRawObject>();
  readonly bankAccounts = new Map<string, StoredRawObject>();
  readonly mfInvestmentAccounts = new Map<string, StoredRawObject>();
  readonly purchases = new Map<string, StoredPurchase>();
  readonly purchasesByOldId = new Map<number, string>();
  readonly payments = new Map<number, StoredPayment>();
  readonly mandates = new Map<number, StoredMandate>();

  nextId(prefix: string): string {
    this.sequence += 1;
    return `${prefix}${this.sequence}`;
  }

  nextOldId(): number {
    this.sequence += 1;
    return 1000 + this.sequence;
  }

  findPurchasesBySourceRefId(sourceRefId: string): StoredPurchase[] {
    return [...this.purchases.values()].filter((p) => p.sourceRefId === sourceRefId);
  }

  findPurchaseBySourceRefId(sourceRefId: string): StoredPurchase | undefined {
    return this.findPurchasesBySourceRefId(sourceRefId)[0];
  }
}
