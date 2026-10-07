import { createHash } from 'node:crypto';
import type { ORPCGlobalContext } from '@orpc/nest';
import { os } from '@orpc/server';
import type { ClsService } from 'nestjs-cls';
import { requireAuth } from '../identity/request-auth.js';
import { AppError } from './errors.js';
import {
  type IdempotencyBeginInput,
  IdempotencyInProgress,
  IdempotencyKeyReused,
  type IdempotencyOutcome,
  type IdempotencyService,
} from './idempotency.service.js';
import { UUID_RE } from './ids.js';
import type { SanchayClsStore } from './request-context.js';

/** begin(), with its two refusals mapped to their AppError codes (spec: "409 with Retry-After: 1"). */
async function beginOrRefuse(
  idem: IdempotencyService,
  input: IdempotencyBeginInput,
): Promise<IdempotencyOutcome> {
  try {
    return await idem.begin(input);
  } catch (e) {
    if (e instanceof IdempotencyInProgress) {
      throw new AppError('IDEMPOTENCY_IN_PROGRESS', { retryAfterSeconds: 1 });
    }
    if (e instanceof IdempotencyKeyReused) throw new AppError('IDEMPOTENCY_KEY_REUSED');
    throw e;
  }
}

/**
 * Applied with `.use(requireIdempotency(...))` on a procedure's implementer (`.use()` reads
 * `context.reqHeaders`/`context.resHeaders`, both already injected by B9's RequestHeadersPlugin
 * and ResponseHeadersPlugin — see the deviation note in this task's Interfaces). Built with
 * `os.$context<ORPCGlobalContext>().middleware(...)`, so it fits every procedure's error map and output.
 *
 * A handler that returns completes the key, and the same key with the same input replays its response.
 * A handler that throws, a 4xx refusal or a 5xx, releases the key, so a retry with the same key runs
 * again; IN_PROGRESS lasts only while a request runs (RV-02-37).
 */
export function requireIdempotency(idem: IdempotencyService, cls: ClsService<SanchayClsStore>) {
  return os
    .$context<ORPCGlobalContext>()
    .middleware(async ({ context, path, next }, input: unknown) => {
      const auth = requireAuth(cls);
      const header = context.reqHeaders?.get('idempotency-key') ?? undefined;
      if (header === undefined || !UUID_RE.test(header)) {
        throw new AppError('IDEMPOTENCY_KEY_REQUIRED');
      }
      const ref = { actorId: auth.investorId, key: header.toLowerCase() };
      const outcome = await beginOrRefuse(idem, {
        ...ref,
        route: path.join('.'),
        requestSha256: createHash('sha256')
          .update(JSON.stringify(input ?? null))
          .digest(),
      });
      if (outcome.kind === 'replay') {
        context.resHeaders?.set('idempotent-replayed', 'true');
        return { output: outcome.body, context: {} };
      }
      let handled = false;
      try {
        const result = await next();
        handled = true;
        // A failed complete() keeps the row IN_PROGRESS: the handler has run, so this key must
        // not run it again.
        await idem.complete({ ...ref, status: 200, body: result.output });
        return result;
      } catch (err) {
        if (!handled) await idem.release(ref);
        throw err;
      }
    });
}
