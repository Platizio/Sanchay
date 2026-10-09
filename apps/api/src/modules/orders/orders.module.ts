import { type DynamicModule, Module } from '@nestjs/common';
import type { Env } from '../../config/env.js';
import { IdentityModule } from '../identity/identity.module.js';
import { APPROVE_RECHECKS, CONSENT_SUBJECT_JOBS } from '../legal-consent/consent-engine.js';
import { LegalConsentModule } from '../legal-consent/legal-consent.module.js';
import { CONSENT_TEXT_RENDERERS, SNAPSHOT_BUILDERS } from '../legal-consent/snapshot-builders.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { OrdersRouter } from './orders.router.js';
import { PurchaseService } from './purchase.service.js';
import { PurchaseAdvanceJob } from './purchase-advance.job.js';
import { recheckPurchaseAtApprove } from './purchase-eligibility.js';
import { buildPurchaseSnapshot, renderPurchaseConsentText } from './purchase-snapshot.js';
import { PurchaseSubmitJob } from './purchase-submit.job.js';
import { ReconcileNonfinalJob } from './reconcile-nonfinal.job.js';

// Loaded in every role: approve (api) reads these to rebuild the snapshot, re-check the order and start the
// saga; getChallenge (api) renders CNF-01's text.
CONSENT_SUBJECT_JOBS.PURCHASE = 'orders.purchase.submit';
SNAPSHOT_BUILDERS.PURCHASE = buildPurchaseSnapshot;
APPROVE_RECHECKS.PURCHASE = recheckPurchaseAtApprove;
CONSENT_TEXT_RENDERERS.PURCHASE = renderPurchaseConsentText;

/** Worker-only providers inject D3's FpTransact/FpRead, which exist only in the worker role. */
@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: Nest's dynamic-module pattern (forRoot), as AppModule and OnboardingModule use
export class OrdersModule {
  static forRoot(env: Env): DynamicModule {
    const workerOnly =
      env.SANCHAY_APP_ROLE === 'worker'
        ? [PurchaseSubmitJob, PurchaseAdvanceJob, ReconcileNonfinalJob]
        : [];
    return {
      module: OrdersModule,
      imports: [LegalConsentModule, IdentityModule, NotificationsModule],
      controllers: [OrdersRouter],
      providers: [PurchaseService, ...workerOnly],
      exports: [PurchaseService],
    };
  }
}
