import { redactBoundParams } from '../logging.js';

/**
 * What pg-boss may store for a failed handler (final review MF-1). pg-boss serialises the thrown error (message,
 * stack, `cause` and every own property) into plaintext `pgboss.job.output`, which would bypass the EF-B4 log
 * redaction: a DrizzleQueryError carries its bound params, and a provider error may name a recipient. So the
 * handler's error is logged once through pino (its `err` serializer redacts) and a fresh Error is rethrown with
 * the original name, an optional string `code`, the bound-param-redacted message, no `cause` and a stack rebuilt
 * from that message only.
 */
export function sanitiseHandlerError(err: unknown): Error {
  const original = err instanceof Error ? err : new Error(String(err));
  const clean = new Error(redactBoundParams(original.message, original));
  clean.name = original.name;
  clean.stack = `${clean.name}: ${clean.message}`;
  const code: unknown = (original as { code?: unknown }).code;
  if (typeof code === 'string') (clean as Error & { code?: string }).code = code;
  return clean;
}
