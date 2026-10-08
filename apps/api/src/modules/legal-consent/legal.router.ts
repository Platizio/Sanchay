import { Controller, Inject } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@sanchay/contract';
import { ClsService } from 'nestjs-cls';
import { DB, type DbHandle } from '../../db/client.js';
import { requireAuth } from '../identity/request-auth.js';
import { DeclarationsService } from '../onboarding/declarations.service.js';
import { AppError } from '../platform/errors.js';
import { Public } from '../platform/http-decorators.js';
import type { SanchayClsStore } from '../platform/request-context.js';
import { LegalDocs } from './legal-docs.service.js';

export interface CommissionRate {
  amcId: string | null;
  schemeId: string | null;
  minBps: number;
  maxBps: number;
  kind: 'EXACT' | 'RANGE';
}

export interface CommissionRatesSource {
  list(): Promise<CommissionRate[]>;
}

/** Bound to an empty source until Plan-02 D9 wires the real commission_disclosures reader. */
export class InMemoryCommissionRatesSource implements CommissionRatesSource {
  async list(): Promise<CommissionRate[]> {
    return [];
  }
}

@Controller()
export class LegalRouter {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(LegalDocs) private readonly legalDocs: LegalDocs,
    @Inject(DeclarationsService) private readonly declarations: DeclarationsService,
    @Inject(InMemoryCommissionRatesSource) private readonly rates: CommissionRatesSource,
    @Inject(ClsService) private readonly cls: ClsService<SanchayClsStore>,
  ) {}

  @Public()
  @Implement(contract.legal.getDocument)
  getDocument() {
    return implement(contract.legal.getDocument).handler(async ({ input }) => {
      const doc = await this.legalDocs.current(this.dbh.db, input.key).catch(() => null);
      if (!doc) throw new AppError('NOT_FOUND');
      // The contract serves only the eleven user-facing document keys, so the requested key is the response key.
      return { ...doc, key: input.key };
    });
  }

  @Implement(contract.legal.pending)
  pending() {
    return implement(contract.legal.pending).handler(() =>
      this.declarations.pending(requireAuth(this.cls)),
    );
  }

  /**
   * R-18: records the acceptance of the updated documents the investor is shown. Only keys that are
   * pending right now are recorded, so a repeated or stale call writes no duplicate row; the version
   * accepted is the one in force (E3 `recordAcceptance`), which is the version `legal.pending` listed.
   */
  @Implement(contract.legal.acceptPending)
  acceptPending() {
    return implement(contract.legal.acceptPending).handler(async ({ input }) => {
      const auth = requireAuth(this.cls);
      const pending = new Set<string>((await this.declarations.pending(auth)).map((d) => d.key));
      const keys = [...new Set(input.keys)].filter((key) => pending.has(key));
      await this.dbh.db.transaction(async (tx) => {
        for (const key of keys) {
          await this.legalDocs.recordAcceptance(tx, {
            investorId: auth.investorId,
            key,
            channel: 'APP',
            ip: this.cls.get('ip') ?? null,
            userAgent: this.cls.get('userAgent') ?? null,
            sessionId: auth.sessionId,
          });
        }
      });
      return { ok: true as const };
    });
  }

  @Public()
  @Implement(contract.legal.commissionRates)
  commissionRates() {
    return implement(contract.legal.commissionRates).handler(() => this.rates.list());
  }
}
