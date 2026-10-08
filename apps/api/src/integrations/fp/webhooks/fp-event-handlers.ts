import type { DbExecutor } from '../../../db/client.js';
import type { inboundWebhookEvents } from '../../../modules/fp-webhooks/inbound-webhook.schema.js';
import type { FpRead } from '../fp-read.js';

export type FpWebhookEventRow = typeof inboundWebhookEvents.$inferSelect;

/**
 * Not inside a transaction: re-fetch through `fpRead` first, then write with `runInTx`. Webhooks are
 * at-least-once, so a handler must be idempotent.
 */
export interface FpEventHandlerContext {
  db: DbExecutor;
  event: FpWebhookEventRow;
  fpRead: FpRead;
}

export type FpEventHandler = (ctx: FpEventHandlerContext) => Promise<void>;

/**
 * Populated by the task that owns each FP object type (mf_purchase -> the E20/E21 orders tasks,
 * mf_purchase_plan / mandate -> the Plan 04 F-tasks, and so on). Empty here: every event is "unknown
 * object" until its owning task calls registerFpEventHandler, which is correct E1-scope behaviour —
 * fp-event.job.ts retries 3x then opens a recon break for anything unregistered.
 */
export const FP_EVENT_HANDLERS: Partial<Record<string, FpEventHandler>> = {};

export function registerFpEventHandler(objectType: string, handler: FpEventHandler): void {
  FP_EVENT_HANDLERS[objectType] = handler;
}
