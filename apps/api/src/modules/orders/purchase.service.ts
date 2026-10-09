import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { AppConfig } from '../../config/app-config.js';
import { DB, type DbHandle } from '../../db/client.js';
import { schemes } from '../catalogue/catalogue.schema.js';
import { ConsentEngine } from '../legal-consent/consent-engine.js';
import { resolveLegalDocument } from '../legal-consent/legal-docs.service.js';
import { suitabilityAcknowledgements } from '../onboarding/risk-profile.schema.js';
import { Suitability } from '../onboarding/suitability.service.js';
import { AuditService } from '../platform/audit.service.js';
import { CLOCK, type Clock } from '../platform/clock.js';
import { AppError } from '../platform/errors.js';
import { newId } from '../platform/ids.js';
import { isCancellable, moveOrder } from './order-transitions.js';
import {
  type InitiatedVia,
  ORDER_AUDIT_ACTIONS,
  type OrderPaymentMethod,
  orderEvents,
  orders,
} from './orders.schema.js';
import {
  assertWithinPilotDayCap,
  checkPurchaseEligibility,
  lockPilotDay,
  riskometerAsOfInstant,
  setPurchaseClock,
} from './purchase-eligibility.js';
import { renderSuitabilityWarning, SUITABILITY_ACK_CLAUSE } from './purchase-snapshot.js';

/** An order row with its fund's display name, for ORD-01/ORD-02 (RV-03-16). */
export type OrderWithScheme = typeof orders.$inferSelect & { schemeName: string };

export interface CreatePurchaseInput {
  investorId: string;
  schemeId: string;
  amount: string;
  bankAccountId: string;
  paymentMethod: OrderPaymentMethod;
  /** The request's client IP; FP's `user_ip` must be IPv4 (ML-9 rule 8). */
  userIp: string;
  initiatedVia: InitiatedVia;
  /** The SUITABILITY_WARNING version CNF-03 showed and the investor acknowledged (H1, DSC-23). */
  suitabilityAck?: { warningVersion: string } | undefined;
}

const INTEGER_VERSION = /^\d{1,9}$/;

@Injectable()
export class PurchaseService {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(ConsentEngine) private readonly consent: ConsentEngine,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    setPurchaseClock(clock);
  }

  /**
   * The CONSENT_PENDING draft and its PURCHASE challenge, in one transaction (spec §4.1, GAP-01: no FP write).
   * Order (E20 errata item 5): the investor's day lock, ML-9's eligibility check and the daily cap; the order
   * insert; Suitability.check against the scheme's dated riskometer (H1, RSK-2); on a MISMATCH, the investor's
   * acknowledgement of the SUITABILITY_WARNING version CNF-03 showed (else SUITABILITY_CHANGED, nothing
   * written); the order's check, ack and pre-allocated challenge ids; then the challenge, whose PURCHASE
   * builder reads those columns.
   */
  async createPurchase(
    input: CreatePurchaseInput,
  ): Promise<{ orderId: string; challengeId: string; expiresAt: string }> {
    return this.dbh.db.transaction(async (tx) => {
      const now = this.clock.now();
      await lockPilotDay(tx, input.investorId);
      const eligible = await checkPurchaseEligibility(tx, this.clock, {
        investorId: input.investorId,
        schemeId: input.schemeId,
        amount: input.amount,
        bankAccountId: input.bankAccountId,
        userIp: input.userIp,
      });
      const amount = eligible.amount.toWire();
      // ML-16: an early refusal; the binding check runs again at approve (recheckPurchaseAtApprove).
      await assertWithinPilotDayCap(tx, input.investorId, eligible.amount, now);

      const orderId = newId('orders');
      await tx.insert(orders).values({
        id: orderId,
        // RV-03-4: the app clock, so the daily cap's window and the consent-first check read one clock.
        createdAt: now,
        updatedAt: now,
        createdBy: input.investorId,
        updatedBy: input.investorId,
        investorId: input.investorId,
        type: 'PURCHASE',
        schemeId: input.schemeId,
        amount,
        bankAccountId: input.bankAccountId,
        paymentMethod: input.paymentMethod,
        arn: this.config.env.SANCHAY_PLATFORM_ARN,
        initiatedVia: input.initiatedVia,
        userIp: input.userIp,
      });
      await tx.insert(orderEvents).values({
        orderId,
        toStatus: 'CONSENT_PENDING',
        trigger: 'orders.createPurchase',
        occurredAt: now,
      });
      await this.audit.record(tx, {
        action: ORDER_AUDIT_ACTIONS.ORDER_CREATED,
        actorType: 'INVESTOR',
        actorId: input.investorId,
        entityType: 'orders',
        entityId: orderId,
      });

      const check = await Suitability.check(tx, {
        investorId: input.investorId,
        schemeId: input.schemeId,
        schemeRiskometer: eligible.riskometer,
        fundFactsAsOf: riskometerAsOfInstant(eligible.riskometerAsOf),
        orderId,
      });
      const challengeId = newId('consent_challenges');
      let suitabilityAckId: string | null = null;
      if (check.outcome === 'MISMATCH') {
        const doc = await resolveLegalDocument(tx, 'SUITABILITY_WARNING', now);
        if (doc === undefined || !INTEGER_VERSION.test(doc.version)) {
          throw new AppError('INTERNAL', {
            message: 'no PUBLISHED SUITABILITY_WARNING with an integer version',
          });
        }
        if (input.suitabilityAck?.warningVersion !== doc.version) {
          throw new AppError('SUITABILITY_CHANGED');
        }
        const warning = renderSuitabilityWarning(doc.bodyMarkdown, {
          schemeName: eligible.scheme.name,
          schemeRiskometer: eligible.riskometer,
          level: check.level,
          maxRiskometer: check.maxRiskometer,
        });
        suitabilityAckId = newId('suitability_acknowledgements');
        await tx.insert(suitabilityAcknowledgements).values({
          id: suitabilityAckId,
          createdAt: now,
          checkId: check.checkId,
          warningDocKey: 'SUITABILITY_WARNING',
          warningDocVersion: Number.parseInt(doc.version, 10),
          warningDocSha256: doc.sha256,
          // The text and the checkbox label the investor ticked (DSC-23).
          renderedTextSha256: createHash('sha256')
            .update(`${warning}\n\n${SUITABILITY_ACK_CLAUSE}`, 'utf8')
            .digest(),
          checkboxAt: now,
          challengeId,
          // consent_record_id stays null: UPDATE is revoked (0022); the record is found through challenge_id.
        });
      }
      // On MATCH any suitabilityAck is ignored.
      await tx
        .update(orders)
        .set({
          suitabilityCheckId: check.checkId,
          suitabilityAckId,
          consentChallengeId: challengeId,
          updatedAt: now,
        })
        .where(eq(orders.id, orderId));

      const challenge = await this.consent.create(tx, {
        challengeId,
        investorId: input.investorId,
        subjectType: 'PURCHASE',
        subjects: [{ table: 'orders', id: orderId }],
        templateKey: 'TPL_PURCHASE',
        folioId: null,
        amount,
        // The DLT render facts (consent_challenges.render_*); the PURCHASE builder adds every bound fact.
        fields: {
          action: 'invest',
          amount,
          schemeShort: eligible.scheme.name.slice(0, 30),
          schemeIsin: eligible.scheme.isin,
        },
      });
      return {
        orderId,
        challengeId: challenge.challengeId,
        expiresAt: challenge.expiresAt.toISOString(),
      };
    });
  }

  async get(investorId: string, orderId: string): Promise<OrderWithScheme> {
    const [row] = await this.dbh.db
      .select({ order: orders, schemeName: schemes.name })
      .from(orders)
      .innerJoin(schemes, eq(schemes.id, orders.schemeId))
      .where(and(eq(orders.id, orderId), eq(orders.investorId, investorId)));
    if (row === undefined) throw new AppError('NOT_FOUND');
    return { ...row.order, schemeName: row.schemeName };
  }

  async list(investorId: string): Promise<OrderWithScheme[]> {
    const rows = await this.dbh.db
      .select({ order: orders, schemeName: schemes.name })
      .from(orders)
      .innerJoin(schemes, eq(schemes.id, orders.schemeId))
      .where(eq(orders.investorId, investorId))
      .orderBy(desc(orders.createdAt));
    return rows.map((r) => ({ ...r.order, schemeName: r.schemeName }));
  }

  /**
   * GAP-01(b): only before the first submit attempt. The move is compare-and-set (ML-6): a submit job that moved
   * the order first wins, and the cancel is ORDER_STATE_INVALID (409).
   */
  async cancel(investorId: string, orderId: string): Promise<{ ok: true }> {
    const row = await this.get(investorId, orderId);
    if (!isCancellable(row)) throw new AppError('ORDER_STATE_INVALID');
    await this.dbh.db.transaction(async (tx) => {
      await moveOrder(tx, row, 'CANCELLED', 'local_cancel', { finalAt: this.clock.now() });
      await this.audit.record(tx, {
        action: ORDER_AUDIT_ACTIONS.ORDER_CANCELLED,
        actorType: 'INVESTOR',
        actorId: investorId,
        entityType: 'orders',
        entityId: orderId,
      });
    });
    return { ok: true };
  }
}
