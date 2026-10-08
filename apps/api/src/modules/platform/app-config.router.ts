import { Controller, Inject } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@sanchay/contract';
import { DB, type DbHandle } from '../../db/client.js';
import { Public } from './http-decorators.js';
import { RuntimeConfig } from './runtime-config.js';

// Pending G-C business copy; these two fields are static until legal/marketing supply real text.
const AMC_TAGLINE = 'Invest with clarity.';
const SUPPORT_EMAIL = 'support@sanchay.in';
const SUPPORT_PHONE = '+91-80-0000-0000';
const CUTOFF = { equityDebtHybridTime: '14:00', liquidTime: '13:00' } as const;

@Controller()
export class AppConfigRouter {
  constructor(@Inject(DB) private readonly dbh: DbHandle) {}

  @Public()
  @Implement(contract.meta.appConfig)
  appConfig() {
    return implement(contract.meta.appConfig).handler(async () => {
      const [android, ordersEnabled, sipEnabled, redeemByUnits, perOrderMax, perInvestorPerDayMax] =
        await Promise.all([
          RuntimeConfig.get(this.dbh.db, 'minAppVersion.android'),
          RuntimeConfig.get(this.dbh.db, 'orders.enabled'),
          RuntimeConfig.get(this.dbh.db, 'plans.sip.enabled'),
          RuntimeConfig.get(this.dbh.db, 'features.redeemByUnits'),
          RuntimeConfig.get(this.dbh.db, 'pilot.caps.perOrder'),
          RuntimeConfig.get(this.dbh.db, 'pilot.caps.perInvestorPerDay'),
        ]);
      return {
        minAppVersion: { android },
        flags: { ordersEnabled, sipEnabled, redeemByUnits },
        cutoff: CUTOFF,
        limits: { perOrderMax, perInvestorPerDayMax },
        support: { email: SUPPORT_EMAIL, phone: SUPPORT_PHONE },
        amcTagline: AMC_TAGLINE,
      };
    });
  }
}
