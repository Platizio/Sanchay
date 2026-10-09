import { Controller, Inject } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@sanchay/contract';
import type { ConsentSnapshotV2, ConsentSubjectType } from '@sanchay/domain';
import { and, eq } from 'drizzle-orm';
import { ClsService } from 'nestjs-cls';
import { DB, type DbHandle } from '../../db/client.js';
import { requireAuth } from '../identity/request-auth.js';
import { Crypto } from '../platform/crypto.js';
import { AppError } from '../platform/errors.js';
import { requireIdempotency } from '../platform/idempotency.middleware.js';
import { IdempotencyService } from '../platform/idempotency.service.js';
import { asRowId } from '../platform/ids.js';
import type { SanchayClsStore } from '../platform/request-context.js';
import { ConsentEngine } from './consent-engine.js';
import { consentChallenges } from './legal-consent.schema.js';
import { CONSENT_TEXT_RENDERERS } from './snapshot-builders.js';

@Controller()
export class ConsentRouter {
  constructor(
    @Inject(ConsentEngine) private readonly engine: ConsentEngine,
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(IdempotencyService) private readonly idem: IdempotencyService,
    @Inject(ClsService) private readonly cls: ClsService<SanchayClsStore>,
    @Inject(Crypto) private readonly crypto: Crypto,
  ) {}

  /** BOLA: the challenge must belong to the signed-in investor. */
  private async owned(challengeId: string) {
    const { investorId } = requireAuth(this.cls);
    const [row] = await this.dbh.db
      .select()
      .from(consentChallenges)
      .where(
        and(eq(consentChallenges.id, challengeId), eq(consentChallenges.investorId, investorId)),
      )
      .limit(1);
    if (row === undefined) throw new AppError('NOT_FOUND');
    return row;
  }

  /**
   * CNF-01's text (E20 item 7): the subject type's renderer over the stored snapshot (decrypted as approve
   * does), so the investor reads what the hash covers. Null for a subject type with no renderer.
   */
  private async consentTextOf(row: typeof consentChallenges.$inferSelect): Promise<string | null> {
    const render = CONSENT_TEXT_RENDERERS[row.subjectType as ConsentSubjectType];
    if (render === undefined) return null;
    const snapshot = JSON.parse(
      this.crypto.decrypt(row.snapshotEnc, {
        table: 'consent_challenges',
        column: 'snapshot_enc',
        rowId: asRowId('consent_challenges', row.id),
      }),
    ) as ConsentSnapshotV2;
    return render(this.dbh.db, snapshot);
  }

  @Implement(contract.consents.getChallenge)
  getChallenge() {
    return implement(contract.consents.getChallenge).handler(async ({ input }) => {
      const row = await this.owned(input.id);
      return {
        challengeId: row.id,
        status: row.status,
        requiredFactors: row.requiredFactors,
        expiresAt: row.expiresAt.toISOString(),
        consentText: await this.consentTextOf(row),
      };
    });
  }

  @Implement(contract.consents.sendOtp)
  sendOtp() {
    return implement(contract.consents.sendOtp).handler(async ({ input }) => {
      await this.owned(input.id);
      await this.engine.sendOtp(input.id, input.channel);
      return { ok: true as const };
    });
  }

  @Implement(contract.consents.approve)
  approve() {
    return implement(contract.consents.approve).handler(async ({ input }) => {
      await this.owned(input.id);
      const result = await this.engine.approve(input.id, {
        ...(input.smsCode === undefined ? {} : { smsCode: input.smsCode }),
        ...(input.emailCode === undefined ? {} : { emailCode: input.emailCode }),
      });
      return {
        challengeId: result.challengeId,
        executeBefore: result.executeBefore.toISOString(),
        sagaExpiresAt: result.sagaExpiresAt.toISOString(),
      };
    });
  }

  /** R-20: cancel requires an Idempotency-Key (D1). */
  @Implement(contract.consents.cancel)
  cancel() {
    return implement(contract.consents.cancel)
      .use(requireIdempotency(this.idem, this.cls))
      .handler(async ({ input }) => {
        await this.owned(input.id);
        await this.engine.cancel(this.dbh.db, input.id);
        return { ok: true as const };
      });
  }
}
