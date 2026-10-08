import { Controller, Inject } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@sanchay/contract';
import { and, asc, desc, eq, isNull, lte, or, sql } from 'drizzle-orm';
import { ClsService } from 'nestjs-cls';
import { DB, type DbHandle } from '../../db/client.js';
import { amcs, commissionDisclosures, schemes } from '../catalogue/catalogue.schema.js';
import { requireAuth } from '../identity/request-auth.js';
import { DeclarationsService } from '../onboarding/declarations.service.js';
import { CLOCK, type Clock } from '../platform/clock.js';
import { AppError } from '../platform/errors.js';
import { Public } from '../platform/http-decorators.js';
import type { SanchayClsStore } from '../platform/request-context.js';
import { LegalDocs } from './legal-docs.service.js';

/**
 * No longer read by `legal.commissionRates`, which queries `commission_disclosures` directly so it can
 * join the scheme and AMC names (CAT-2). Kept only because LegalConsentModule still lists it as a provider.
 */
export class InMemoryCommissionRatesSource {
  async list(): Promise<never[]> {
    return [];
  }
}

@Controller()
export class LegalRouter {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(LegalDocs) private readonly legalDocs: LegalDocs,
    @Inject(DeclarationsService) private readonly declarations: DeclarationsService,
    @Inject(CLOCK) private readonly clock: Clock,
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
   * R-18: records the acceptance of the updated documents the investor is shown. Each entry names the
   * version the investor was shown; one that is no longer the version in force is refused with
   * DECLARATION_OUTDATED, as stageDeclarations does, and nothing is written (LEG-1). Only keys that are
   * pending right now are recorded, so a repeated or stale call writes no duplicate row.
   */
  @Implement(contract.legal.acceptPending)
  acceptPending() {
    return implement(contract.legal.acceptPending).handler(async ({ input }) => {
      const auth = requireAuth(this.cls);
      const pending = new Set<string>((await this.declarations.pending(auth)).map((d) => d.key));
      await this.dbh.db.transaction(async (tx) => {
        for (const { key, version } of input.accept) {
          const current = await this.legalDocs.current(tx, key);
          if (current.version !== version) throw new AppError('DECLARATION_OUTDATED');
        }
        const keys = [...new Set(input.accept.map((entry) => entry.key))].filter((key) =>
          pending.has(key),
        );
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
    return implement(contract.legal.commissionRates).handler(async () => {
      const asOf = this.clock.now().toISOString().slice(0, 10);
      const rows = await this.dbh.db
        .select({
          amcId: commissionDisclosures.amcId,
          schemeId: commissionDisclosures.schemeId,
          schemeName: schemes.name,
          amcName: amcs.name,
          minBps: commissionDisclosures.trailMinBps,
          maxBps: commissionDisclosures.trailMaxBps,
          kind: commissionDisclosures.kind,
        })
        .from(commissionDisclosures)
        .leftJoin(schemes, eq(schemes.id, commissionDisclosures.schemeId))
        // A scheme-scoped row names the scheme's AMC, an AMC-scoped row its own.
        .innerJoin(
          amcs,
          eq(amcs.id, sql`coalesce(${commissionDisclosures.amcId}, ${schemes.amcId})`),
        )
        .where(
          and(
            lte(commissionDisclosures.effectiveFrom, asOf),
            // A scheme that is not published is not in the catalogue, so its name is not disclosed either.
            or(isNull(commissionDisclosures.schemeId), eq(schemes.status, 'PUBLISHED')),
          ),
        )
        .orderBy(
          asc(amcs.name),
          sql`${schemes.name} ASC NULLS FIRST`,
          desc(commissionDisclosures.effectiveFrom),
        );
      // One line per scope: the most recent disclosure in force (rows are newest first within a scope).
      const seen = new Set<string>();
      return rows.filter((row) => {
        const scope = row.schemeId ?? row.amcId ?? '';
        if (seen.has(scope)) return false;
        seen.add(scope);
        return true;
      });
    });
  }
}
