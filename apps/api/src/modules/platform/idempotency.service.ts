import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DB, type DbHandle } from '../../db/client.js';
import { CLOCK, type Clock, DAY } from './clock.js';
import { idempotencyKeys } from './kernel.schema.js';
import { pgErrorCodeOf } from './pg-errors.js';

export interface IdempotencyBeginInput {
  actorId: string;
  key: string;
  route: string;
  requestSha256: Buffer;
}

export type IdempotencyOutcome =
  | { kind: 'proceed' }
  | { kind: 'replay'; status: number; body: unknown };

export interface IdempotencyCompleteInput {
  actorId: string;
  key: string;
  status: number;
  body: unknown;
}

export interface IdempotencyReleaseInput {
  actorId: string;
  key: string;
}

/**
 * Backs `requireIdempotency()` (idempotency.middleware.ts). Each write is its own autocommit
 * statement, not wrapped in a caller transaction: a concurrent second call must see the first
 * call's `IN_PROGRESS` marker row via a plain read the moment it commits, not block behind a
 * row lock held for the whole handler (that would turn "in flight" into "in flight, eventually
 * serialised", which is not the 409 the design wants).
 */
@Injectable()
export class IdempotencyService {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async begin(input: IdempotencyBeginInput): Promise<IdempotencyOutcome> {
    const now = this.clock.now();
    try {
      await this.dbh.db.insert(idempotencyKeys).values({
        actorId: input.actorId,
        key: input.key,
        route: input.route,
        requestSha256: input.requestSha256,
        status: 'IN_PROGRESS',
        expiresAt: new Date(now.getTime() + DAY),
      });
      return { kind: 'proceed' };
    } catch (e) {
      if (pgErrorCodeOf(e) !== '23505') throw e;
    }
    const [row] = await this.dbh.db
      .select()
      .from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.actorId, input.actorId), eq(idempotencyKeys.key, input.key)));
    if (row === undefined || row.expiresAt.getTime() <= now.getTime()) {
      await this.dbh.db
        .delete(idempotencyKeys)
        .where(and(eq(idempotencyKeys.actorId, input.actorId), eq(idempotencyKeys.key, input.key)));
      return this.begin(input);
    }
    if (row.status === 'IN_PROGRESS') {
      return Promise.reject(new IdempotencyInProgress());
    }
    if (!row.requestSha256.equals(input.requestSha256)) {
      return Promise.reject(new IdempotencyKeyReused());
    }
    return { kind: 'replay', status: row.responseStatus ?? 200, body: row.responseBody };
  }

  async complete(input: IdempotencyCompleteInput): Promise<void> {
    await this.dbh.db
      .update(idempotencyKeys)
      .set({ status: 'COMPLETED', responseStatus: input.status, responseBody: input.body })
      .where(and(eq(idempotencyKeys.actorId, input.actorId), eq(idempotencyKeys.key, input.key)));
  }

  /** The handler threw (a refusal or a failure): the row goes, so a retry with the same key runs again. */
  async release(input: IdempotencyReleaseInput): Promise<void> {
    await this.dbh.db
      .delete(idempotencyKeys)
      .where(and(eq(idempotencyKeys.actorId, input.actorId), eq(idempotencyKeys.key, input.key)));
  }
}

/** Thrown only inside begin(); idempotency.middleware.ts maps these to their AppError codes. */
export class IdempotencyInProgress extends Error {
  override name = 'IdempotencyInProgress';
}
export class IdempotencyKeyReused extends Error {
  override name = 'IdempotencyKeyReused';
}
