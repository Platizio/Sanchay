import { Controller, Inject } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@sanchay/contract';
import { ClsService } from 'nestjs-cls';
import { requireAuth } from '../identity/request-auth.js';
import { requireIdempotency } from '../platform/idempotency.middleware.js';
import { IdempotencyService } from '../platform/idempotency.service.js';
import type { SanchayClsStore } from '../platform/request-context.js';
import { isCancellable, orderNextStep } from './order-transitions.js';
import { PurchaseService } from './purchase.service.js';

/** `schemeName`, `cancellable` and `next` serve CNF-02 and ORD-01/ORD-02 (RV-03-16). */
const toWire = (row: {
  id: string;
  type: string;
  status: string;
  schemeId: string;
  schemeName: string;
  amount: string | null;
  paymentMethod: string | null;
  failureCode: string | null;
  submitAttempts: number;
  createdAt: Date;
}) => ({
  id: row.id,
  type: row.type,
  status: row.status,
  schemeId: row.schemeId,
  schemeName: row.schemeName,
  amount: row.amount,
  paymentMethod: row.paymentMethod,
  failureCode: row.failureCode,
  cancellable: isCancellable(row),
  next: orderNextStep(row.status),
  createdAt: row.createdAt.toISOString(),
});

@Controller()
export class OrdersRouter {
  constructor(
    @Inject(PurchaseService) private readonly purchases: PurchaseService,
    @Inject(IdempotencyService) private readonly idem: IdempotencyService,
    @Inject(ClsService) private readonly cls: ClsService<SanchayClsStore>,
  ) {}

  /** [K]: requires an Idempotency-Key (D1). FP's `user_ip` is the request IP; ML-9 refuses a non-IPv4 one. */
  @Implement(contract.orders.createPurchase)
  createPurchase() {
    return implement(contract.orders.createPurchase)
      .use(requireIdempotency(this.idem, this.cls))
      .handler(({ input }) => {
        const auth = requireAuth(this.cls);
        return this.purchases.createPurchase({
          ...input,
          investorId: auth.investorId,
          userIp: this.cls.get('ip') ?? '',
          initiatedVia: auth.platform === 'ANDROID' ? 'mobile_app_android' : 'web',
        });
      });
  }

  @Implement(contract.orders.list)
  list() {
    return implement(contract.orders.list).handler(async () =>
      (await this.purchases.list(requireAuth(this.cls).investorId)).map(toWire),
    );
  }

  @Implement(contract.orders.get)
  get() {
    return implement(contract.orders.get).handler(async ({ input }) =>
      toWire(await this.purchases.get(requireAuth(this.cls).investorId, input.id)),
    );
  }

  /** [K]: requires an Idempotency-Key (D1). */
  @Implement(contract.orders.cancel)
  cancel() {
    return implement(contract.orders.cancel)
      .use(requireIdempotency(this.idem, this.cls))
      .handler(({ input }) => this.purchases.cancel(requireAuth(this.cls).investorId, input.id));
  }
}
