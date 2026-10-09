import { canTransition, type OrderStatus } from '@sanchay/domain';
import { and, eq } from 'drizzle-orm';
import type { DbExecutor } from '../../db/client.js';
import { AppError } from '../platform/errors.js';
import { orderEvents, orders } from './orders.schema.js';

/**
 * Moves an order along D5's ORDER machine and appends the order_events row; refuses an illegal edge.
 * Compare-and-set (ML-6): the UPDATE matches only while the order is still in the status the caller read, so a
 * job can never overwrite a move another actor made (a cancel, the reconcile backstop). A lost race is
 * ORDER_STATE_INVALID, like an illegal edge; `movedByOther` tells the two apart.
 */
export async function moveOrder(
  exec: DbExecutor,
  order: { id: string; status: OrderStatus },
  to: OrderStatus,
  trigger: string,
  values: Partial<typeof orders.$inferInsert> = {},
): Promise<void> {
  if (!canTransition('ORDER', order.status, to, trigger)) {
    throw new AppError('ORDER_STATE_INVALID', {
      message: `ORDER ${order.status} -> ${to} (${trigger}) is not allowed`,
    });
  }
  const moved = await exec
    .update(orders)
    .set({ ...values, status: to })
    .where(and(eq(orders.id, order.id), eq(orders.status, order.status)))
    .returning({ id: orders.id });
  if (moved.length === 0) {
    throw new AppError('ORDER_STATE_INVALID', {
      message: `ORDER ${order.id} is no longer ${order.status}`,
    });
  }
  await exec.insert(orderEvents).values({
    orderId: order.id,
    fromStatus: order.status,
    toStatus: to,
    trigger,
    ...(values.updatedAt === undefined ? {} : { occurredAt: values.updatedAt }),
  });
}

/**
 * ML-6: true when `err` is moveOrder's compare-and-set loss, that is ORDER_STATE_INVALID while the order is no
 * longer in the status the caller read (another actor moved it). The job then logs and returns; any other
 * ORDER_STATE_INVALID (an illegal edge) is a bug the caller rethrows.
 */
export async function movedByOther(
  exec: DbExecutor,
  err: unknown,
  read: { id: string; status: OrderStatus },
): Promise<boolean> {
  if (!(err instanceof AppError) || err.code !== 'ORDER_STATE_INVALID') return false;
  const [after] = await exec
    .select({ status: orders.status })
    .from(orders)
    .where(eq(orders.id, read.id));
  return after?.status !== read.status;
}

/**
 * gap-rulings GAP-01(b): an order is cancellable while no FP object can exist, before the first submit
 * attempt. `PurchaseService.cancel` enforces it and `orders.get` reports it as `cancellable` (RV-03-16).
 */
export function isCancellable(order: { status: string; submitAttempts: number }): boolean {
  return (
    order.status === 'CONSENT_PENDING' ||
    (order.status === 'CONSENTED' && order.submitAttempts === 0)
  );
}

/** The statuses in which FP is still placing the order: CNF-02 keeps polling (GAP-01 step 4). */
const STILL_PLACING: ReadonlySet<string> = new Set([
  'CONSENT_PENDING',
  'CONSENTED',
  'SUBMITTING',
  'UNDER_REVIEW',
  'CONFIRMING',
  'RECONCILING',
]);

/**
 * CNF-02's handoff, `orders.get`'s `next` (GAP-01 step 4; RV-03-16): PAY-01 once FP accepted the
 * purchase (`AWAITING_PAYMENT`), the result once the order is past payment or has ended, and `null`
 * while FP is still placing it. MANDATE belongs to plans (Plan 04), never to an order.
 */
export function orderNextStep(status: string): 'PAYMENT' | 'DONE' | null {
  if (status === 'AWAITING_PAYMENT') return 'PAYMENT';
  return STILL_PLACING.has(status) ? null : 'DONE';
}
