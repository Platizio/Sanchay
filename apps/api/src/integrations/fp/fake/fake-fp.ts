import { MockAgent } from 'undici';
import {
  FP_OPERATIONS,
  type FpOperationClass,
  type FpOperationDefinition,
  type FpOperationKey,
} from '../fp-operations.js';
import type { FpBaseUrls } from '../fp-token-cache.js';
import {
  FAKE_SCHEME_FIXTURES,
  type FakeFpScript,
  type FakeSchemeFixture,
  type FpScriptMode,
} from './fake-fp.scenarios.js';
import { FakeFpState, type StoredPreVerification, type StoredPurchase } from './fake-fp.state.js';

interface FakeReply {
  readonly statusCode: number;
  readonly data: object;
}

interface CallLogEntry {
  readonly op: FpOperationKey;
  readonly class: FpOperationClass;
  readonly at: number;
}

function matchPath(template: string, actual: string): Record<string, string> | null {
  const templateParts = template.split('/');
  const actualParts = actual.split('/');
  if (templateParts.length !== actualParts.length) return null;
  const params: Record<string, string> = {};
  for (const [i, templatePart] of templateParts.entries()) {
    const actualPart = actualParts[i];
    if (actualPart === undefined) return null;
    if (templatePart.startsWith('{') && templatePart.endsWith('}')) {
      params[templatePart.slice(1, -1)] = decodeURIComponent(actualPart);
    } else if (templatePart !== actualPart) {
      return null;
    }
  }
  return params;
}

function findOperation(
  method: string,
  path: string,
): {
  key: FpOperationKey;
  definition: FpOperationDefinition;
  params: Record<string, string>;
} | null {
  for (const [key, definition] of Object.entries(FP_OPERATIONS) as [
    FpOperationKey,
    FpOperationDefinition,
  ][]) {
    if (definition.method !== method) continue;
    const params = matchPath(definition.path, path);
    if (params !== null) return { key, definition, params };
  }
  return null;
}

/** A scripted reply with a 400-499 status other than 409 (a 409 is the duplicate case and keeps route-then-fail). */
function isClientRejection(mode: FpScriptMode): mode is { status: number; body: object } {
  return typeof mode === 'object' && mode.status >= 400 && mode.status < 500 && mode.status !== 409;
}

function schemePlanPayload(fixture: FakeSchemeFixture): Record<string, unknown> {
  return {
    object: 'mf_scheme_plan',
    gateway: 'cybrillapoa',
    isin: fixture.isin,
    type: 'regular',
    option: 'growth',
    active: true,
    mf_scheme: { name: fixture.schemeName },
    mf_fund: { name: fixture.amcName },
  };
}

function preVerificationPayload(record: StoredPreVerification): Record<string, unknown> {
  return {
    object: 'pre_verification',
    id: record.id,
    status: record.status,
    readiness: { status: 'verified' },
    pan: { status: 'completed' },
    name: { status: 'completed' },
    date_of_birth: { status: 'completed' },
    ...(record.bankAccounts === undefined ? {} : { bank_accounts: record.bankAccounts }),
  };
}

function purchasePayload(p: StoredPurchase): Record<string, unknown> {
  return {
    object: 'mf_purchase',
    id: p.id,
    old_id: p.oldId,
    state: p.state,
    amount: p.amount,
    scheme: p.scheme,
    mf_investment_account: p.mfInvestmentAccount,
    source_ref_id: p.sourceRefId,
    folio_number: p.folioNumber,
  };
}

/** The provisioning creates FakeFp stores as plain rows (`FakeFpState.provisioned`), with FP's id prefixes. */
const PROVISIONED_CREATES: Partial<
  Record<FpOperationKey, { kind: string; prefix: string; oldId: boolean }>
> = {
  'phoneNumber.create': { kind: 'phone_number', prefix: 'phone_', oldId: false },
  'emailAddress.create': { kind: 'email_address', prefix: 'email_', oldId: false },
  'address.create': { kind: 'address', prefix: 'addr_', oldId: false },
  'relatedParty.create': { kind: 'related_party', prefix: 'rp_', oldId: false },
  'bankAccount.create': { kind: 'bank_account', prefix: 'bac_', oldId: true },
  'mfInvestmentAccount.create': { kind: 'mf_investment_account', prefix: 'mfia_', oldId: true },
};

/**
 * The lookups LOOKUP-ADOPT runs: each filters its kind by the query parameter that names the owner.
 * The sandbox ignores `mf_investment_accounts?primary_investor=` and returns every tenant account
 * (docs/probes/fp-lookup-filters-2026-10-08.md); only `primary_investor_pan=` filters, so that is the one
 * owner key listed here and a `primary_investor=` query is deliberately a no-op.
 */
const PROVISIONED_LISTS: Partial<Record<FpOperationKey, { kind: string; owner: string }>> = {
  'phoneNumber.list': { kind: 'phone_number', owner: 'profile' },
  'emailAddress.list': { kind: 'email_address', owner: 'profile' },
  'address.list': { kind: 'address', owner: 'profile' },
  'relatedParty.list': { kind: 'related_party', owner: 'profile' },
  'bankAccount.list': { kind: 'bank_account', owner: 'profile' },
  'mfInvestmentAccount.list': { kind: 'mf_investment_account', owner: 'primary_investor_pan' },
};

/**
 * A stateful undici `MockAgent` standing in for FP/POA/PG in `SANCHAY_PROVIDER_MODE_FP=fake`
 * (D3's `fp.module.ts` selects it). `FpTransport`, `FpRead`, `FpKyc`, `FpProvision` and `FpTransact`
 * all run unchanged against `agent` — FakeFp is a fake *server*, not a parallel client.
 *
 * Do not add `intercept()`s to `agent` after construction: the catch-all router registered first always
 * matches, so they never fire and the test passes against the router's own reply. Use `script()`.
 */
export class FakeFp {
  readonly agent: MockAgent;
  readonly state = new FakeFpState();
  autoAdvance = false;

  private readonly callLog: CallLogEntry[] = [];
  private readonly scripts = new Map<FpOperationKey, FakeFpScript>();
  private webhookQueue: unknown[] = [];

  /** `now` stamps the call log; FpModule passes the app Clock so tests can compare it with consent timestamps. */
  constructor(
    private readonly baseUrls: FpBaseUrls,
    private readonly now: () => number = Date.now,
  ) {
    this.agent = new MockAgent();
    this.agent.disableNetConnect();
    this.wireTokenEndpoints();
    this.wireRouter();
  }

  calls(filter: { class?: FpOperationClass; op?: FpOperationKey } = {}): readonly CallLogEntry[] {
    return this.callLog.filter(
      (entry) =>
        (filter.class === undefined || entry.class === filter.class) &&
        (filter.op === undefined || entry.op === filter.op),
    );
  }

  advance(objectId: string, state: string, fields: { folioNumber?: string } = {}): void {
    const purchase = this.state.purchases.get(objectId);
    if (purchase === undefined) {
      throw new Error(`FakeFp.advance: unknown object id "${objectId}"`);
    }
    purchase.state = state;
    if (fields.folioNumber !== undefined) purchase.folioNumber = fields.folioNumber;
  }

  /** Scripts the next matching call. One-shot: a second call to the same op behaves normally again. */
  script(op: FpOperationKey, mode: FpScriptMode): void {
    this.scripts.set(op, { mode, remaining: 1 });
  }

  emitWebhook(event: unknown): void {
    // No consumer exists yet (E1, Plan 03, is the webhook receiver); queued so that task's test
    // helper can drain it without this task inventing that consumer's shape.
    this.webhookQueue.push(event);
  }

  drainWebhooks(): readonly unknown[] {
    const events = this.webhookQueue;
    this.webhookQueue = [];
    return events;
  }

  private wireTokenEndpoints(): void {
    this.agent
      .get(this.baseUrls.fp)
      .intercept({ path: (p) => /^\/v2\/auth\/[^/]+\/token$/.test(p), method: 'POST' })
      .reply(200, { access_token: 'fake-fp-token', token_type: 'bearer', expires_in: 1800 })
      .persist();
    this.agent
      .get(this.baseUrls.pg)
      .intercept({ path: (p) => /^\/v2\/auth\/[^/]+\/token$/.test(p), method: 'POST' })
      .reply(200, { access_token: 'fake-pg-token', token_type: 'bearer', expires_in: 1800 })
      .persist();
    this.agent
      .get(this.baseUrls.poa)
      .intercept({ path: '/v2/auth/cybrillarta/token', method: 'POST' })
      .reply(200, { access_token: 'fake-poa-token', token_type: 'bearer', expires_in: 1800 })
      .persist();
  }

  private wireRouter(): void {
    for (const audience of ['fp', 'poa', 'pg'] as const) {
      this.agent
        .get(this.baseUrls[audience])
        .intercept({ path: () => true, method: () => true })
        .reply((opts) =>
          this.handle(opts.path, opts.method as string, opts.body as string | undefined),
        )
        .persist();
    }
  }

  private handle(rawPath: string, method: string, rawBody: string | undefined): FakeReply {
    const url = new URL(rawPath, 'http://fake-fp.local');
    const found = findOperation(method, url.pathname);
    if (found === null) {
      return {
        statusCode: 501,
        data: {
          error: {
            status: 501,
            code: 'FAKE_FP_NOT_IMPLEMENTED',
            message: `FakeFp has no route for ${method} ${url.pathname}`,
          },
        },
      };
    }
    const { key: op, definition, params } = found;
    const body =
      rawBody !== undefined && rawBody.length > 0
        ? (JSON.parse(rawBody) as Record<string, unknown>)
        : {};

    if (
      definition.class === 'M' &&
      (Object.hasOwn(body, 'partner') || Object.hasOwn(body, 'euin'))
    ) {
      return {
        statusCode: 400,
        data: {
          error: {
            status: 400,
            code: 'PARTNER_OR_EUIN_NOT_ALLOWED',
            message: 'partner and euin must be omitted on every FP order (H-11)',
          },
        },
      };
    }

    const script = this.scripts.get(op);
    if (script !== undefined) {
      script.remaining -= 1;
      if (script.remaining <= 0) this.scripts.delete(op);
    }
    // A scripted 4xx (409 aside) is a rejection FP made before creating anything, so route() must not run:
    // otherwise LOOKUP-ADOPT would adopt an object real FP never created (final review MF-5). Timeout, 5xx,
    // 409-dup and 2xx scripts keep route-then-fail: FP did receive and act on the request.
    if (script !== undefined && isClientRejection(script.mode)) {
      this.callLog.push({ op, class: definition.class, at: this.now() });
      return { statusCode: script.mode.status, data: script.mode.body };
    }

    const result = this.route(op, params, body, url.searchParams);
    this.callLog.push({ op, class: definition.class, at: this.now() });

    if (script === undefined) return result;
    if (script.mode === 'timeout') {
      // The object above was created as normal ("FP received it"); only the response is lost, so a
      // later list-by-source_ref_id (LOOKUP-ADOPT) still finds it.
      throw new Error(`FakeFp: scripted timeout for ${op}`);
    }
    if (script.mode === '5xx') {
      return { statusCode: 500, data: { error: 'upstream failed' } };
    }
    if (script.mode === '409-dup') {
      return {
        statusCode: 409,
        data: {
          error: {
            status: 409,
            code: 'DUPLICATE_SOURCE_REF_ID',
            message: 'source_ref_id already exists',
          },
        },
      };
    }
    return { statusCode: script.mode.status, data: script.mode.body };
  }

  private route(
    op: FpOperationKey,
    params: Record<string, string>,
    body: Record<string, unknown>,
    query: URLSearchParams,
  ): FakeReply {
    const create = PROVISIONED_CREATES[op];
    if (create !== undefined) {
      const row: Record<string, unknown> = {
        object: create.kind,
        id: this.state.nextId(create.prefix),
        ...(create.oldId ? { old_id: this.state.nextOldId() } : {}),
        ...body,
      };
      if (op === 'mfInvestmentAccount.create') {
        // Real FP stamps the owner's PAN on the account; it is the only key the list can filter by.
        const owner = this.state.investorProfiles.get(String(body.primary_investor));
        if (owner !== undefined) row.primary_investor_pan = owner.raw.pan;
      }
      this.state.provisioned(create.kind).push(row);
      return { statusCode: 200, data: row };
    }
    const list = PROVISIONED_LISTS[op];
    if (list !== undefined) {
      const owner = query.get(list.owner);
      const data = this.state
        .provisioned(list.kind)
        .filter((r) => owner === null || r[list.owner] === owner);
      return { statusCode: 200, data: { object: 'list', data } };
    }
    switch (op) {
      case 'schemePlans.list':
        return {
          statusCode: 200,
          data: { object: 'list', data: FAKE_SCHEME_FIXTURES.map(schemePlanPayload) },
        };
      case 'schemePlans.get': {
        const fixture = FAKE_SCHEME_FIXTURES.find((f) => f.isin === params.isin);
        if (fixture === undefined) {
          return {
            statusCode: 404,
            data: {
              error: { status: 404, code: 'NOT_FOUND', message: `scheme ${params.isin} not found` },
            },
          };
        }
        return { statusCode: 200, data: schemePlanPayload(fixture) };
      }
      case 'preVerification.create': {
        const id = this.state.nextId('pv_');
        const record: StoredPreVerification = {
          id,
          status: 'completed',
          readiness: { status: 'verified' },
          pan: { status: 'completed' },
          name: { status: 'completed' },
          dateOfBirth: { status: 'completed' },
          ...(Array.isArray(body.bank_accounts)
            ? { bankAccounts: body.bank_accounts.map(() => ({ status: 'verified', code: null })) }
            : {}),
        };
        this.state.preVerifications.set(id, record);
        return { statusCode: 200, data: preVerificationPayload(record) };
      }
      case 'preVerification.get': {
        const record = this.state.preVerifications.get(params.id ?? '');
        if (record === undefined) {
          return {
            statusCode: 404,
            data: {
              error: {
                status: 404,
                code: 'NOT_FOUND',
                message: `pre_verification ${params.id} not found`,
              },
            },
          };
        }
        return { statusCode: 200, data: preVerificationPayload(record) };
      }
      case 'investorProfile.create': {
        const id = this.state.nextId('invp_');
        this.state.investorProfiles.set(id, { id, raw: body });
        return { statusCode: 200, data: { object: 'investor_profile', id, ...body } };
      }
      case 'investorProfile.list': {
        const pan = query.get('pan');
        const data = [...this.state.investorProfiles.values()]
          .filter((p) => pan === null || p.raw.pan === pan)
          .map((p) => ({ object: 'investor_profile', id: p.id, ...p.raw }));
        return { statusCode: 200, data: { object: 'list', data } };
      }
      case 'mfInvestmentAccount.update': {
        const row = this.state.provisioned('mf_investment_account').find((r) => r.id === body.id);
        if (row === undefined) {
          return {
            statusCode: 404,
            data: {
              error: {
                status: 404,
                code: 'NOT_FOUND',
                message: `mf_investment_account ${String(body.id)} not found`,
              },
            },
          };
        }
        row.folio_defaults = body.folio_defaults;
        return { statusCode: 200, data: row };
      }
      case 'purchase.create': {
        const id = this.state.nextId('mfp_');
        const oldId = this.state.nextOldId();
        const purchase: StoredPurchase = {
          id,
          oldId,
          state: 'under_review',
          amount: String(body.amount ?? '0.00'),
          scheme: String(body.scheme ?? ''),
          mfInvestmentAccount: String(body.mf_investment_account ?? ''),
          sourceRefId: String(body.source_ref_id ?? ''),
          folioNumber: null,
          consent: null,
        };
        this.state.purchases.set(id, purchase);
        this.state.purchasesByOldId.set(oldId, id);
        return { statusCode: 200, data: purchasePayload(purchase) };
      }
      case 'purchase.get': {
        const purchase = this.state.purchases.get(params.id ?? '');
        if (purchase === undefined) {
          return {
            statusCode: 404,
            data: {
              error: {
                status: 404,
                code: 'NOT_FOUND',
                message: `mf_purchase ${params.id} not found`,
              },
            },
          };
        }
        return { statusCode: 200, data: purchasePayload(purchase) };
      }
      case 'purchase.list': {
        const sourceRefId = query.get('source_ref_id');
        const items =
          sourceRefId === null
            ? [...this.state.purchases.values()]
            : this.state.findPurchasesBySourceRefId(sourceRefId);
        return { statusCode: 200, data: { object: 'list', data: items.map(purchasePayload) } };
      }
      case 'purchase.update': {
        const id = String(body.id ?? '');
        const purchase = this.state.purchases.get(id);
        if (purchase === undefined) {
          return {
            statusCode: 404,
            data: {
              error: { status: 404, code: 'NOT_FOUND', message: `mf_purchase ${id} not found` },
            },
          };
        }
        if (Object.hasOwn(body, 'consent')) {
          if (purchase.state !== 'pending') {
            return {
              statusCode: 400,
              data: {
                error: {
                  status: 400,
                  code: 'INVALID_STATE',
                  message: 'consent can only be set while pending',
                },
              },
            };
          }
          purchase.consent = body.consent as Record<string, unknown>;
        }
        if (body.state === 'confirmed') {
          if (purchase.state !== 'pending' || purchase.consent === null) {
            return {
              statusCode: 400,
              data: {
                error: {
                  status: 400,
                  code: 'INVALID_STATE',
                  message: 'cannot confirm before pending + consent',
                },
              },
            };
          }
          purchase.state = 'submitted';
        }
        return { statusCode: 200, data: purchasePayload(purchase) };
      }
      case 'payment.create': {
        const amcOrderIds = Array.isArray(body.amc_order_ids)
          ? (body.amc_order_ids as number[])
          : [];
        const clash = [...this.state.payments.values()].some(
          (payment) =>
            payment.status !== 'FAILED' &&
            payment.amcOrderIds.some((id) => amcOrderIds.includes(id)),
        );
        if (clash) {
          // 409, not 400: FpTransport maps a 409 to FpAmbiguousError, which is what the H-2
          // no-multiple-payments test and the E20 saga expect of a duplicate payment.
          return {
            statusCode: 409,
            data: {
              error: {
                status: 409,
                code: 'PAYMENT_ALREADY_EXISTS',
                message: 'a payment already exists for this order',
              },
            },
          };
        }
        const id = this.state.nextOldId();
        this.state.payments.set(id, { id, amcOrderIds, status: 'PENDING' });
        return {
          statusCode: 200,
          data: { id, token_url: `https://pg.fake.local/pay/${id}`, upi: null },
        };
      }
      case 'mandate.create': {
        const id = this.state.nextOldId();
        const mandateRef = `mref_${id}`;
        this.state.mandates.set(id, { id, status: 'CREATED', mandateRef });
        return {
          statusCode: 200,
          data: {
            id,
            mandate_ref: mandateRef,
            mandate_status: 'CREATED',
            mandate_type: body.mandate_type,
            mandate_limit: body.mandate_limit,
          },
        };
      }
      default:
        // A class-R list/get FakeFp has not been asked to model precisely yet: an empty, valid
        // envelope is a safer default than a 501, since most later tasks only need "no results".
        return { statusCode: 200, data: { object: 'list', data: [] } };
    }
  }
}
