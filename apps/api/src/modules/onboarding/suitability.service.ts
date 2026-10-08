import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { compareRiskometer, type RiskLevel, type Riskometer } from '@sanchay/domain';
import { desc, eq } from 'drizzle-orm';
import type { Tx } from '../../db/client.js';
import { CLOCK, type Clock } from '../platform/clock.js';
import { AppError } from '../platform/errors.js';
import { riskProfiles, suitabilityChecks } from './risk-profile.schema.js';

export interface SuitabilityHookArgs {
  investorId: string;
  schemeId: string;
  schemeRiskometer: Riskometer;
  fundFactsAsOf: Date;
  /** One of orderId / planId is required by the table's subject CHECK. */
  orderId?: string;
  planId?: string;
}

export interface SuitabilityHookResult {
  outcome: 'MATCH' | 'MISMATCH';
  level: RiskLevel;
  maxRiskometer: Riskometer;
  riskProfileId: string;
}

/**
 * The suitability hook shape the order and plan flows (E20, F2) consume. Note this is a different type from
 * `SuitabilityHook` in legal-consent/consent-engine.ts (E4's confirm-time re-check, `check(...)` -> boolean).
 */
export type SuitabilityCheck = (
  tx: Tx,
  args: SuitabilityHookArgs,
) => Promise<SuitabilityHookResult>;

@Injectable()
export class SuitabilityService implements OnModuleInit {
  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  check: SuitabilityCheck = async (tx, args) => {
    const [profile] = await tx
      .select()
      .from(riskProfiles)
      .where(eq(riskProfiles.investorId, args.investorId))
      .orderBy(desc(riskProfiles.completedAt))
      .limit(1);
    if (!profile) throw new AppError('ONBOARDING_INCOMPLETE');
    // Expiry is also tested by time: RiskProfileService.get flips ACTIVE -> EXPIRED lazily, so an investor
    // who never opens the risk screen still has an ACTIVE row with a past expires_at (GAP-03 §3). The row is
    // not flipped here: the caller's transaction rolls back on this throw.
    const lapsed =
      profile.status === 'ACTIVE' && profile.expiresAt.getTime() <= this.clock.now().getTime();
    if (profile.status === 'EXPIRED' || lapsed) throw new AppError('RISK_PROFILE_EXPIRED');
    if (profile.status === 'STALE') throw new AppError('RISK_PROFILE_STALE');
    if (profile.status !== 'ACTIVE') throw new AppError('ONBOARDING_INCOMPLETE');

    const outcome = compareRiskometer(profile.maxRiskometer, args.schemeRiskometer);
    await tx.insert(suitabilityChecks).values({
      orderId: args.orderId ?? null,
      planId: args.planId ?? null,
      schemeId: args.schemeId,
      schemeRiskometer: args.schemeRiskometer,
      fundFactsAsOf: args.fundFactsAsOf,
      riskProfileId: profile.id,
      level: profile.level,
      outcome,
    });

    return {
      outcome,
      level: profile.level,
      maxRiskometer: profile.maxRiskometer,
      riskProfileId: profile.id,
    };
  };

  onModuleInit(): void {
    Suitability.check = this.check;
  }
}

/**
 * `Suitability.check` for a caller without Nest DI (a CLI, a unit test, E20's order saga): wired to the
 * provider instance when OnboardingModule initialises. Calling it before then is a programming error.
 */
export const Suitability: { check: SuitabilityCheck } = {
  check: () => {
    throw new Error('Suitability.check is not wired: OnboardingModule has not initialised');
  },
};
