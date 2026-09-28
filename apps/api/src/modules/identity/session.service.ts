import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Platform } from '@sanchay/contract';
import { and, eq, isNull } from 'drizzle-orm';
import { DB, type DbExecutor, type DbHandle } from '../../db/client.js';
import { CLOCK, type Clock, DAY, HOUR, MINUTE } from '../platform/clock.js';
import { sha256 } from '../platform/crypto.js';
import { AppError } from '../platform/errors.js';
import { newId } from '../platform/ids.js';
import {
  authSessions,
  investorDevices,
  investors,
  type SessionRevokeReason,
} from './identity.schema.js';

/** Design §E.2 and H-7: web idle 30 min / absolute 12 h; Android idle 30 d / absolute 90 d; no refresh, no rotation. iOS is P2-10. */
export const SESSION_POLICY: Record<Platform, { idleMs: number; absoluteMs: number }> = {
  WEB: { idleMs: 30 * MINUTE, absoluteMs: 12 * HOUR },
  ANDROID: { idleMs: 30 * DAY, absoluteMs: 90 * DAY },
};
export const SESSION_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const TOUCH_EVERY_MS = MINUTE;
const BLOCKED_STATUSES: ReadonlySet<string> = new Set(['CLOSED', 'SUSPENDED', 'FRAUD_HOLD']);

export interface IssuedSession {
  sessionId: string;
  token: string;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
}

export interface ResolvedSession {
  sessionId: string;
  investorId: string;
  deviceId: string;
  platform: Platform;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
}

@Injectable()
export class SessionService {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async create(
    exec: DbExecutor,
    input: {
      investorId: string;
      deviceId: string;
      platform: Platform;
      ip: string | null;
      userAgent: string | null;
    },
  ): Promise<IssuedSession> {
    const now = this.clock.now();
    const policy = SESSION_POLICY[input.platform];
    const token = randomBytes(32).toString('base64url');
    const sessionId = newId('auth_sessions');
    const absoluteExpiresAt = new Date(now.getTime() + policy.absoluteMs);
    const idleExpiresAt = new Date(
      Math.min(now.getTime() + policy.idleMs, absoluteExpiresAt.getTime()),
    );
    await exec.insert(authSessions).values({
      id: sessionId,
      createdAt: now,
      updatedAt: now,
      investorId: input.investorId,
      deviceId: input.deviceId,
      platform: input.platform,
      tokenHash: sha256(token),
      idleExpiresAt,
      absoluteExpiresAt,
      ip: input.ip,
      userAgent: input.userAgent,
      lastUsedAt: now,
    });
    return { sessionId, token, idleExpiresAt, absoluteExpiresAt };
  }

  async resolve(
    token: string,
    binding: { platform: Platform; deviceRefHash: Buffer | null },
  ): Promise<ResolvedSession> {
    if (!SESSION_TOKEN_RE.test(token)) throw new AppError('AUTH_REQUIRED');
    const now = this.clock.now();
    const db = this.dbh.db;
    const [row] = await db
      .select({
        s: authSessions,
        deviceRefHash: investorDevices.deviceRefHash,
        deviceRevokedAt: investorDevices.revokedAt,
        investorStatus: investors.status,
      })
      .from(authSessions)
      .innerJoin(investorDevices, eq(investorDevices.id, authSessions.deviceId))
      .innerJoin(investors, eq(investors.id, authSessions.investorId))
      .where(eq(authSessions.tokenHash, sha256(token)))
      .limit(1);
    if (!row || row.s.revokedAt !== null || row.deviceRevokedAt !== null) {
      throw new AppError('AUTH_REQUIRED');
    }
    if (row.s.platform !== binding.platform) throw new AppError('AUTH_REQUIRED');
    if (binding.deviceRefHash !== null && !row.deviceRefHash.equals(binding.deviceRefHash)) {
      throw new AppError('AUTH_REQUIRED');
    }
    if (BLOCKED_STATUSES.has(row.investorStatus)) throw new AppError('AUTH_REQUIRED');
    if (now.getTime() >= row.s.absoluteExpiresAt.getTime()) throw new AppError('SESSION_EXPIRED');
    if (now.getTime() >= row.s.idleExpiresAt.getTime()) {
      await this.revoke(db, { sessionId: row.s.id, investorId: row.s.investorId, reason: 'IDLE' });
      throw new AppError('SESSION_EXPIRED');
    }
    let idleExpiresAt = row.s.idleExpiresAt;
    if (row.s.lastUsedAt === null || now.getTime() - row.s.lastUsedAt.getTime() >= TOUCH_EVERY_MS) {
      idleExpiresAt = new Date(
        Math.min(
          now.getTime() + SESSION_POLICY[row.s.platform].idleMs,
          row.s.absoluteExpiresAt.getTime(),
        ),
      );
      await db
        .update(authSessions)
        .set({ idleExpiresAt, lastUsedAt: now, updatedAt: now })
        .where(eq(authSessions.id, row.s.id));
    }
    return {
      sessionId: row.s.id,
      investorId: row.s.investorId,
      deviceId: row.s.deviceId,
      platform: row.s.platform,
      idleExpiresAt,
      absoluteExpiresAt: row.s.absoluteExpiresAt,
    };
  }

  async revoke(
    exec: DbExecutor,
    input: { sessionId: string; investorId: string; reason: SessionRevokeReason },
  ): Promise<boolean> {
    const now = this.clock.now();
    const rows = await exec
      .update(authSessions)
      .set({ revokedAt: now, revokeReason: input.reason, updatedAt: now })
      .where(
        and(
          eq(authSessions.id, input.sessionId),
          eq(authSessions.investorId, input.investorId),
          isNull(authSessions.revokedAt),
        ),
      )
      .returning({ id: authSessions.id });
    return rows.length === 1;
  }

  async revokeAll(
    exec: DbExecutor,
    investorId: string,
    reason: SessionRevokeReason,
  ): Promise<number> {
    const now = this.clock.now();
    const rows = await exec
      .update(authSessions)
      .set({ revokedAt: now, revokeReason: reason, updatedAt: now })
      .where(and(eq(authSessions.investorId, investorId), isNull(authSessions.revokedAt)))
      .returning({ id: authSessions.id });
    return rows.length;
  }
}
