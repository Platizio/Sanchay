# Plan 04 (Sprint 4 and pilot week): SIP and mandates, ledger, portfolio, redemption, production, gate

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan one task at a time. Steps use checkbox (`- [ ]`) syntax. `AGENTS.md` is binding. Where this plan and the outline disagree, this plan wins; where this plan and the MVP spec or rulings disagree, stop and report.

**Goal:** Fri 11-20 feature freeze with SIP (UPI Autopay) and its investor cancel (R-08), the FIFO ledger, dashboard and holdings, and redemption (amount and all) working in the sandbox on web and on the Play-internal Android build; GO-1 evidence for Fri 11-27 and GO-2 for SIP after its canary (R-06). The outline's §3 is the task list.

**Architecture:**
- **Consent first** and **providers only from worker jobs**, as in Plan 03. Provider reads happen before a transaction opens; nothing calls FP inside one.
- **Units come from the provider only.** The ledger (`lots`, `lot_consumptions`) is written only by `Ledger`, in the same transaction that moves the order. A shortfall is never rolled back (SHORTFALL-BREAK).
- **The api role never calls FP.** The worker's `folio.sync` keeps `folios.fp_holdings_snapshot` for the redemption quote (R-09).

**Tech stack:** NestJS 11 + Fastify, oRPC, Drizzle on PostgreSQL 18, pg-boss 12, undici `MockAgent` FakeFp, Vitest + Testcontainers, Next.js/Expo for the screens.

**Spec:** `docs/superpowers/specs/2026-09-25-sanchay-mvp-spec.md` (§1.4, §2.3, §4.2, §4.4; with `mvp-final-critic.md`), the outline `docs/superpowers/plans/2026-09-28-plans-02-04-outlines.md` §0 and §3, rulings `docs/delivery/rulings.md` (R-04, R-06, R-09, R-20), decision register `docs/superpowers/specs/decision-register-money.md` (D-MONEY-050..054), target design `docs/superpowers/specs/2026-09-25-sanchay-target-design.md` §C.7, §F.6, §F.8, §H.

**Branch:** `feat/plan-04-mvp-sip-portfolio` from `main` after Plan 03 is merged. Nothing is pushed until the owner asks. Update the branch line in `AGENTS.md`.

> **Status: partial assembly. Do not execute any task from this file until this banner is removed.**
> Tasks present: F1 (draft, not yet reviewed), F2, F3 and F4 (reviewed and rewritten against Plans 02 and 03).
> F5–F28 are still the outline's §3 text. F5 was stopped mid-research; its drafted design and resume steps
> are in `docs/till_now.md` §7.3.

**How this file is assembled.** Tasks are written against Plans 02 and 03 **as written** and appended as they are expanded; each one's Interfaces section names every earlier symbol it uses. F1–F3 were expanded locally and F4 in a cloud session; they were merged on 2026-09-30. The merge put F4 after F2/F3: F4 numbers its migrations after F3's, fills F2's FakeFp and instalment-sync gaps, and routes SIP instalments through `PurchaseSettlement` (see F4's Files).

## Assembly notes (cross-task facts)
- F2 owns `packages/domain/src/rules/sip-dates.ts` (firstInstalmentDate) and `modules/plans/sip-eligibility.ts` (assertSipEligible, sipSchemeOf, SipScheme, SIP_FLOOR, UPI_AUTOPAY_LIMIT, MAX_INSTALMENTS). F10: drop sip-dates.ts from Create, keep golden JSON + quote; import from `../plans/sip-eligibility.js`; contract/router/module are `modules/plans/*` (not orders); CutoffHolidays comes from E22's cutoff.ts (no re-declare). SipScheme fields are `sipMin/sipMax/sipMultiple/sipDates` (Money).
- All SIP/mandate code lives in `apps/api/src/modules/plans/` (PlansModule.forRoot). F3/F28 must edit there, not orders/ or payments/.
- F3 extends F2 in place: `mandate-ladder.ts` in domain, `rail` on createSip, `mandates.auth_url_enc` (0028), `MandatesService.authUrlOf`. F2 FP calls are rail-generic (`authoriseMandate({mandateId, mandateType})`).
- F4 owns the ledger (`modules/portfolio/`). Every purchase order that reaches PROCESSING, lumpsum or SIP instalment, moves on only through `PurchaseSettlement.apply`; F2's `plans.instalments.sync` mirrors instalments only up to PROCESSING (F4 edits it).
- Plan 02 errata RV-02-14 added D5 edges: PLAN UNDER_REVIEW->REJECTED|CONSENT_EXPIRED, CONFIRMING->REJECTED, SUBMITTING->REJECTED; MANDATE CONSENTED->CONSENT_EXPIRED, SUBMITTING->REJECTED. F4 adds ORDER UNITS_PENDING->REVERSED.
- New error codes: PLAN_STATE_INVALID, MANDATE_STATE_INVALID (409). Job names: mandates.submit, mandates.poll, plans.sip.submit, plans.sip.advance, plans.instalments.sync (F2); folio.sync, orders.units.reconcile (F4).
- FakeFp gained: purchasePlans store, mandate.get, mandateAuth.create, purchasePlan.create/get/list/update, purchase.list?plan=, advanceMandate, advancePlan, addInstalment; StoredPurchase.plan, StoredMandate.raw (F2); StoredPurchase allotment fields, StoredFolio + `folios`, folio.list, holdings (F4).
- Test helpers: test/int/sip-seed.ts (seedSipScheme, seedSipInvestor, setSipEnabled, SIP_DATES) (F2); test/int/ledger-seed.ts (F4).

## Global Constraints

Every task's requirements include this section. It restates the Plan 02 and Plan 03 contract that Plan 04 builds on (`docs/superpowers/plans/2026-10-12-plan-02-mvp-kernel-fp-gateway-catalogue-data-dev-aws.md`, `docs/superpowers/plans/2026-10-26-plan-03-mvp-consent-onboarding-catalogue-lumpsum.md`); Plan 03's Global Constraints still apply in full.

- **Jobs (D2):** inject `Jobs`; `jobs.enqueue(exec, name, data, opts?)`. Handlers are `@Injectable() @JobHandler('name')` classes with `handle(job: Job<'name'>)`. New names are appended to `JOB_NAMES` in `apps/api/src/modules/platform/jobs/job-registry.ts`; crons go only into `registerSchedules(boss)` in `jobs/schedules.ts` with a distinct `key`.
- **Kernel (D1):** `RuntimeConfig.get(exec, key)` and `ReconBreaks.open(exec, {kind, entityType, entityId, severity: 'WARNING' | 'CRITICAL', detail?})` are static. One open break per `(kind, entity_id)`; use distinct kinds for a WARNING and a later CRITICAL on the same entity.
- **FP (D3/D4):** `FpRead` (worker only) has `purchase(id)`, `holdings({investmentAccountOldId, folios?, asOn?})` and `folios({mfInvestmentAccount, folioNumber?})`; a 4xx throws `FpRejectedError` (409 throws `FpAmbiguousError`), and a 5xx or a network failure throws `FpAmbiguousError`, reads included. FakeFp is reached through `bootFpTestApp()`; its API is `calls`, `script`, `advance(id, state, fields?)` and the `state.*` maps (F4 adds the allotment fields to `advance` and `state.folios`).
- **Orders (E20/E21):** orders move only through `moveOrder(exec, order, to, trigger, values)` (it checks D5's `canTransition` and writes `order_events`). `toFpPurchaseView(raw)` is the one FP purchase parser. `FP_EVENT_HANDLERS.mf_purchase` is registered in `PaymentsModule.onModuleInit`; after F4 it delegates to `PurchaseSettlement`.
- **Transactions:** follow Plan 03: `this.dbh.db.transaction(...)`, never around a provider call. D3's `runInTx` is not used; D2's job runner opens no CLS context for it to write to.
- **Notifications (D6):** `Notify.enqueue(exec, templateKey, {investorId, data, dedupeKey})`; `ORDER_ALLOTTED` renders `{units, schemeName, nav, navDate}`.
- **Calendar (E22, D8):** `expectedNavDate({cutoffClass, at, holidays})` and `CutoffHolidays` come from `@sanchay/domain`; holidays are the `market_holidays` table (every kind counts as a non-business day).
- **Test helpers:** `bootFpTestApp()` (D4), `jobOf(name, data)` (E1), `seedInvestableInvestor(t)` (E20; `fp_mfia_old_id` is 7001 for every seeded investor) and `seedScheme(t)` (E20; a new AMC per call). Tests that drive a job call its `handle(jobOf(…))` directly and stub `Jobs.enqueue` with `vi.spyOn`.
- **Errors under Drizzle 0.45:** a failed query throws `Failed query: …` with the node-postgres error on `.cause`. Assert a constraint with Plan 01's `pgConstraintOf(error)` (`apps/api/src/modules/platform/pg-errors.ts`), not a regex on the message.
- **Types:** `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` are on; no non-null assertions (`biome ci` rejects them).
- **Shared files:** golden vectors go in `packages/test-fixtures/src/golden/` and domain tests import them by relative path (E7's pattern). `@sanchay/domain` rules are re-exported from `packages/domain/src/rules/index.ts`. Migrations follow generate-then-custom.
- **Plans and mandates (F2/F3):** SIP and mandate code is `apps/api/src/modules/plans/` (`PlansModule.forRoot(env)`); `CONSENT_SUBJECT_JOBS.MANDATE_REGISTRATION = 'mandates.submit'` and `SIP_REGISTRATION = 'plans.sip.submit'`. FakeFp adds `advanceMandate`, `advancePlan` and `addInstalment(planId, state)`; `test/int/sip-seed.ts` has `seedSipScheme`, `seedSipInvestor`, `setSipEnabled` and `SIP_DATES`.
- **Commit trailer:** `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (AGENTS.md).

## Migration numbers

Plan 03 ends at `0025_payment_attempts`. Plan 04 continues in task order; next free after F4: **`0031`**.

| Migration | Task | Kind |
|---|---|---|
| `0026_plans_mandates` | F2 | generated |
| `0027_plans_mandates_guard` | F2 | custom |
| `0028_mandates_auth_url` | F3 | generated |
| `0029_ledger` | F4 | generated |
| `0030_ledger_guards` | F4 | custom |

drizzle-kit assigns the number at generate time. If the execution order changes, regenerate after rebasing; never hand-renumber.

## Review notes: Plan 02/03 errata found while expanding F4

Applied in F4 (each has a regression test there):
- **D1 `ReconBreaks.open` aborted its caller's transaction.** It caught `23505` from the partial unique index, but a failed statement aborts the whole PostgreSQL transaction, and the caller's `COMMIT` then silently becomes a `ROLLBACK`. The first repeat of a break inside a transaction (for example a daily `FOLIO_FEED_MISMATCH`) would have discarded that transaction's writes without an error. F4 replaces the catch with `ON CONFLICT … DO NOTHING` on the index predicate.
- **D5 had no `UNITS_PENDING → REVERSED`.** F4 appends it (`fp_reversed`).
- **E21's `mf_purchase` handler** moved orders to SETTLED with no ledger, and nothing re-fetched a PROCESSING purchase when its webhook never came. F4 routes both paths through `PurchaseSettlement`.
- **Drizzle cannot write `bytea().array()`.** It serialises each Buffer as raw bytes into the array literal, which PostgreSQL rejects (`22P02 malformed array literal`). F4 declares the folio blind-index arrays with a small `customType` that writes the literal in hex.

Observed, not changed by F4 (for the owning task's executor):
- **D6 `Notify.enqueue`** catches `23505` inside the caller's transaction in the same way. F4 never repeats a dedupe key inside one transaction, so it is not affected; `onConflictDoNothing` on `notifications_dedupe_uq` is the same fix.
- **E21's** `rejects.toThrow(/payment_attempts_live_uq/)` cannot match under Drizzle 0.45 (see Global Constraints); it needs `pgConstraintOf`.
- **E20's `orders.allotted_units`** is `numeric(20,4)` where spec §2.3 says units are `numeric(20,3)`. F4's `lots` use `(20,3)` and `parseAllotment` refuses more than 3 dp, so the extra digit is never populated.

## Review notes: Plan 03 errata found while researching F5 (not yet fixed)

Found by reading Plan 03; neither has been run. F5 (or an E3/E4 amendment) must fix both before any consent-gated Plan 04 task is executed.
- **E3/E4: the consent snapshot hash can never match on approve.** `ConsentEngine.create` builds the snapshot with `destinationsMasked: destinations.map(d => d.masked)` and the caller's full `fields`; `approve` rebuilds it with `destinationsMasked: []` and only the four render fields (action, amount, units, schemeShort). The E3 generic builder (PURCHASE, E20) and E11's `ONBOARDING_ATTEST` builder both hash `ctx.destinationsMasked`, and `create` refuses zero destinations, so every approval fails with `CONSENT_MISMATCH`. Likely fix: persist the masked destinations and the hashed fields on the challenge and rebuild from those.
- **E4: `consent.expiry.sweep` ignores `firstAttemptAt`.** It marks every CONSUMED challenge past `execute_before` as CONSUMED_UNUSED, even one whose first FP write already happened (for that one, `useConsumed`'s deadline is `saga_expires_at`). There is also no `ConsentEngine.markUnused`, which F5's live-check rejection needs.

## Known gaps (confirm in the FP sandbox, D4 `tools/fp-probes`, before the pilot)

Sandbox probe run 1 (2026-10-01, `docs/probes/`) settled several of these; the rest stay open.

- **Holdings report shape: RESOLVED (RV-04-F4-1).** `GET /api/oms/reports/holdings` returns `{id, folios: [{folio_number, schemes: [{isin, name, type, holdings: {as_on, units, redeemable_units}, market_value, invested_value, payout, nav}]}]}`: `folios` at the **top level** (no `data` wrapper) and units as JSON **numbers** (3 dp). `toFolioHoldingsSnapshot` read `raw.data.folios`, so every folio would have synced as FEED_UNAVAILABLE. It now reads `raw.folios` (falling back to `data.folios`), and its test uses the observed shape (8/8, verified 2026-10-01).
- **Folio object fields: PARTLY CONFIRMED.** Folio objects carry `email_addresses`, `mobile_numbers` and `payout_details` keys (plus holder, guardian and nominee fields), but v1's sandbox folios have **no registered contacts**. FP then accepts redemption consent with the account's `folio_defaults` contacts (P-09). The `payout_details[].bank_account` value shape is still unseen.
- **Holdings for ONDC folios: CONFIRMED in the sandbox.** A cybrillapoa folio reported 399.324 units, and its holdings fell by 3.930 after a redemption. F5's quote and ALL are not blocked by a missing feed.
- **`allotted_nav_date`** must be a plain `YYYY-MM-DD`; anything else makes the allotment INVALID (UNITS_PENDING plus a CRITICAL break). Redemptions return `redeemed_nav_date` as a plain date (`"2026-10-01"`). No sandbox purchase has settled yet (P-07 pending), so the purchase field is still unseen.
- **Redeemed units carry 4 dp (F5).** A ₹100 ONDC redemption reported `redeemed_units: 3.9299` while the folio fell by 3.930. F5's settlement must round `redeemed_units` to 3 dp (half-up and ceiling agree on this sample) before `Ledger.applyExit`, because `fifoExit` accepts exactly 3 dp. Re-check purchases' `allotted_units` once one settles.
- **Mandate create ambiguity (F2).** A mandate stuck in RECONCILING opens a CRITICAL `MANDATE_CREATE_AMBIGUOUS` break, resolved by an operator. D3 has no list read, but the sandbox serves `GET /api/pg/mandates?bank_account_id=<old id>&page&size` (P-09 used it), so a later task can add `FpRead.mandatesByBank` and resolve the ambiguity automatically.

---

### Task F1: CDK prod, alarms (Dev A, 8 h; E25 dev already ran in S2, R-05)

**Files:**
- **Modify:** `infra/lib/config.ts` (add the `prod` `EnvConfig` entry and the alarm-recipient keys), `infra/lib/sanchay-mvp-stack.ts` (wire `alarms.ts`, add the `NatEip` output, add `orders.enabled=false` / `plans.sip.enabled=false` to the API/worker task defs).
- **Create:** `infra/lib/alarms.ts`, `docs/runbooks/credential-rotation.md`.
- **Test:** `infra/test/sanchay-mvp-stack.test.ts` (modify — add the prod-stack assertions), `infra/test/alarms.test.ts` (create).

**Interfaces:**
- **Prerequisites:** E25 (Plan 02, `SanchayMvpStack-dev`, R-05).
- **Consumes:** `infra/lib/config.ts` `EnvConfig`, `envConfigFor(env)`, `ALL_ENVS` (E25); `infra/lib/sanchay-mvp-stack.ts` `SanchayMvpStack` construct, its `vpc`, `rds`, `alb`, `apiTargetGroup`, `ecsService`, `apiContainer`, `workerContainer` properties (E25); `infra/bin/sanchay.ts`, which loops `ALL_ENVS.map(envConfigFor)` and instantiates one `SanchayMvpStack` per entry (E25) — unmodified by this task, since adding `'prod'` to `ALL_ENVS` in `config.ts` is enough to add the stack.
- **Produces:**
  - `EnvConfig.prod: EnvConfig` with `multiAz: true`, `backupRetentionDays: 14`, `deletionProtection: true`, `desiredCount: 2`, `alarmEmails`, `alarmSmsNumbers` (from `SANCHAY_ALARM_EMAILS` / `SANCHAY_ALARM_SMS_NUMBERS`, comma-separated).
  - `infra/lib/alarms.ts` exports `buildAlarms(scope: Construct, props: AlarmsProps): Alarms`, an SNS topic `sanchay-ops-alerts-{env}` with an email subscription per `alarmEmails` entry and an SMS subscription per `alarmSmsNumbers` entry, and 10 `cloudwatch.Alarm`s (`alb5xx`, `targetUnhealthy`, `workerHeartbeatStale`, `jobQueueAge`, `reconcilingSla`, `moneyInvariantBreach`, `webhookSignatureFailures`, `otpSendFailureRate`, `smsCapReached`, `navAge`), each with an `SnsAction(topic)` on `ALARM` and `OK`.
  - `SanchayMvpStack` calls `buildAlarms(this, {...})` only when `props.env === 'prod'` (dev keeps the single NAV-age alarm from E25).
  - `CfnOutput` `NatEip` (the NAT gateway's Elastic IP, for the Cybrilla allowlist request).
  - Prod ECS task defs get `orders.enabled=false` and `plans.sip.enabled=false` as container environment (the DB-backed `RuntimeConfig` default from D1 already reads false; these are the CDK-side literal `SANCHAY_APP_ROLE`-independent flags the deploy pipeline seeds into `app_config` on first migrate, per R-06 — the F1 migrate task calls `ops:runtime-config:seed --key=plans.sip.enabled --value=false` before the service is scaled up).
  - `docs/runbooks/credential-rotation.md`: the FP/MSG91/SES/DB-credential rotation runbook (Secrets Manager rotation steps, ECS force-new-deployment, and the alarm each step should clear).
- **Tests:**
  - `prod stack: MultiAz true`
  - `prod stack: BackupRetention 14`
  - `prod stack: DeletionProtection true`
  - `prod stack: 2 desired tasks`
  - `prod stack: NatEip output exists`
  - `prod stack: orders.enabled and plans.sip.enabled are "false" on api and worker containers`
  - `dev stack unaffected: MultiAz false, BackupRetention 1, DeletionProtection false` (regression)
  - `alarms: SNS topic has one email subscription per alarmEmails entry and one sms subscription per alarmSmsNumbers entry`
  - `alarms: exactly 10 cloudwatch alarms, each with an SNS alarm action`
  - `alarms: navAge alarm threshold matches R-12 (> 26 hours)`
  - `alarms: not built for the dev stack (dev keeps E25's single NAV-age alarm only)`
  - one PITR restore test into a scratch instance (G-E5; documented as a manual runbook step in `credential-rotation.md`'s "before you rotate the DB master secret" section, not asserted by CDK unit tests — no CDK construct proves restorability)
  - alarm test page on Wed 11-18 (manual; `docs/runbooks/credential-rotation.md` links the SNS topic ARN used for the drill)

- [ ] **Step 1: Write the failing test**

Create `infra/test/alarms.test.ts`:

```ts
import { App, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { buildAlarms } from '../lib/alarms.js';

function templateFor(alarmEmails: string[], alarmSmsNumbers: string[]) {
  const app = new App();
  const stack = new Stack(app, 'AlarmsTestStack');
  buildAlarms(stack, {
    env: 'prod',
    alarmEmails,
    alarmSmsNumbers,
    albArnSuffix: 'app/sanchay-prod/1234567890abcdef',
    targetGroupArnSuffix: 'targetgroup/sanchay-api-prod/abcdef1234567890',
  });
  return Template.fromStack(stack);
}

describe('buildAlarms', () => {
  it('creates one SNS topic subscription per email and per SMS number', () => {
    const t = templateFor(['dev-a@sanchay.in', 'dev-b@sanchay.in'], ['+919800000001']);
    t.resourceCountIs('AWS::SNS::Topic', 1);
    t.resourceCountIs('AWS::SNS::Subscription', 3);
    t.hasResourceProperties('AWS::SNS::Subscription', { Protocol: 'email', Endpoint: 'dev-a@sanchay.in' });
    t.hasResourceProperties('AWS::SNS::Subscription', { Protocol: 'email', Endpoint: 'dev-b@sanchay.in' });
    t.hasResourceProperties('AWS::SNS::Subscription', { Protocol: 'sms', Endpoint: '+919800000001' });
  });

  it('creates exactly 10 alarms, each wired to the SNS topic on ALARM and OK', () => {
    const t = templateFor(['dev-a@sanchay.in'], ['+919800000001']);
    t.resourceCountIs('AWS::CloudWatch::Alarm', 10);
    const alarms = t.findResources('AWS::CloudWatch::Alarm');
    for (const [, resource] of Object.entries(alarms)) {
      expect(resource.Properties.AlarmActions).toEqual([Match.anyValue()]);
      expect(resource.Properties.OKActions).toEqual([Match.anyValue()]);
    }
  });

  it('the navAge alarm fires above 26 hours, matching R-12', () => {
    const t = templateFor([], []);
    t.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: Match.stringLikeRegexp('sanchay-.*-nav-age'),
      MetricName: 'NavAgeHours',
      Threshold: 26,
      ComparisonOperator: 'GreaterThanThreshold',
    });
  });
});
```

Modify `infra/test/sanchay-mvp-stack.test.ts` by appending a `describe('prod')` block (kept alongside the existing E25 `describe('dev')` block, which is not touched):

```ts
describe('prod', () => {
  const t = templateFor(envConfigFor('prod'));

  it('is Multi-AZ with 14-day PITR and deletion protection', () => {
    t.hasResourceProperties('AWS::RDS::DBInstance', {
      MultiAZ: true,
      BackupRetentionPeriod: 14,
      DeletionProtection: true,
    });
  });

  it('runs 2 desired tasks', () => {
    t.hasResourceProperties('AWS::ECS::Service', { DesiredCount: 2 });
  });

  it('outputs the NAT gateway EIP for the Cybrilla allowlist', () => {
    t.hasOutput('NatEip', {});
  });

  it('ships orders and SIP disabled until GO-1/GO-2 (R-06)', () => {
    const defs = t.findResources('AWS::ECS::TaskDefinition');
    const containers = Object.values(defs).flatMap((d) => d.Properties.ContainerDefinitions);
    for (const name of ['api', 'worker']) {
      const c = containers.find((c: { Name: string }) => c.Name === name);
      const env = Object.fromEntries(
        (c.Environment as Array<{ Name: string; Value: string }>).map((e) => [e.Name, e.Value]),
      );
      expect(env.SANCHAY_ORDERS_ENABLED_DEFAULT).toBe('false');
      expect(env.SANCHAY_PLANS_SIP_ENABLED_DEFAULT).toBe('false');
    }
  });

  it('builds the 10-alarm SNS topic (prod only)', () => {
    t.resourceCountIs('AWS::CloudWatch::Alarm', 10);
  });
});

describe('dev regression (E25 unaffected)', () => {
  const t = templateFor(envConfigFor('dev'));

  it('stays single-AZ with 1-day retention and no deletion protection', () => {
    t.hasResourceProperties('AWS::RDS::DBInstance', {
      MultiAZ: false,
      BackupRetentionPeriod: 1,
      DeletionProtection: false,
    });
  });

  it('keeps only the E25 NAV-age alarm, not the 10-alarm prod set', () => {
    t.resourceCountIs('AWS::CloudWatch::Alarm', 1);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

```
pnpm --filter=@sanchay/infra test -- alarms.test.ts sanchay-mvp-stack.test.ts
```

Expected failure: `Cannot find module '../lib/alarms.js'` for `alarms.test.ts` (the file does not exist yet), and in `sanchay-mvp-stack.test.ts` a `TypeError` or assertion failure from `envConfigFor('prod')` returning `undefined` / the dev config (the `prod` entry and `NatEip` output do not exist yet).

- [ ] **Step 3: Minimal implementation**

Add the `prod` entry to `infra/lib/config.ts` (the file already has a `dev` entry and `ALL_ENVS` from E25; this is a key-level addition, shown as the full resulting file for clarity):

```ts
export type SanchayEnv = 'dev' | 'prod';

export interface EnvConfig {
  env: SanchayEnv;
  account: string;
  region: string;
  hostedZoneDomain: string;
  hostPrefixes: { www: string; app: string; api: string };
  multiAz: boolean;
  backupRetentionDays: number;
  deletionProtection: boolean;
  natGateways: number;
  desiredCount: number;
  cpu: number;
  memoryLimitMiB: number;
  alarmEmails: string[];
  alarmSmsNumbers: string[];
}

const splitEnvList = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);

const dev: EnvConfig = {
  env: 'dev',
  account: process.env.SANCHAY_CDK_ACCOUNT_DEV ?? '000000000000',
  region: 'ap-south-1',
  hostedZoneDomain: 'dev.sanchay.in',
  hostPrefixes: { www: 'www.dev', app: 'app.dev', api: 'api.dev' },
  multiAz: false,
  backupRetentionDays: 1,
  deletionProtection: false,
  natGateways: 1,
  desiredCount: 1,
  cpu: 512,
  memoryLimitMiB: 1024,
  alarmEmails: [],
  alarmSmsNumbers: [],
};

/** F1: prod hardening per spec §2.4 and R-05/R-11/R-12/R-15/R-16. */
const prod: EnvConfig = {
  env: 'prod',
  account: process.env.SANCHAY_CDK_ACCOUNT_PROD ?? '000000000000',
  region: 'ap-south-1',
  hostedZoneDomain: 'sanchay.in',
  hostPrefixes: { www: 'www', app: 'app', api: 'api' },
  multiAz: true,
  backupRetentionDays: 14,
  deletionProtection: true,
  natGateways: 2,
  desiredCount: 2,
  cpu: 1024,
  memoryLimitMiB: 2048,
  alarmEmails: splitEnvList(process.env.SANCHAY_ALARM_EMAILS),
  alarmSmsNumbers: splitEnvList(process.env.SANCHAY_ALARM_SMS_NUMBERS),
};

const CONFIGS: Record<SanchayEnv, EnvConfig> = { dev, prod };

export const ALL_ENVS: readonly SanchayEnv[] = ['dev', 'prod'];

export function envConfigFor(env: SanchayEnv): EnvConfig {
  return CONFIGS[env];
}
```

Create `infra/lib/alarms.ts`:

```ts
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import type { Construct } from 'constructs';
import type { SanchayEnv } from './config.js';

export interface AlarmsProps {
  env: SanchayEnv;
  alarmEmails: string[];
  alarmSmsNumbers: string[];
  /** ALB ARN suffix (`app/<name>/<id>`), for the CloudWatch `LoadBalancer` dimension. */
  albArnSuffix: string;
  /** Target-group ARN suffix (`targetgroup/<name>/<id>`), for the `TargetGroup` dimension. */
  targetGroupArnSuffix: string;
}

export interface Alarms {
  topic: sns.Topic;
  alarms: cloudwatch.Alarm[];
}

const NS = 'Sanchay';

/**
 * F1: the 10 prod alarms (spec §2.4, delta §0.2 invariants). Every alarm gets the same SNS action on
 * both ALARM and OK so the team is told when a break clears too.
 */
export function buildAlarms(scope: Construct, props: AlarmsProps): Alarms {
  const topic = new sns.Topic(scope, 'OpsAlertsTopic', {
    topicName: `sanchay-ops-alerts-${props.env}`,
    displayName: 'Sanchay ops alerts',
  });
  for (const email of props.alarmEmails) topic.addSubscription(new subs.EmailSubscription(email));
  for (const number of props.alarmSmsNumbers) topic.addSubscription(new subs.SmsSubscription(number));
  const action = new actions.SnsAction(topic);

  const dims = { LoadBalancer: props.albArnSuffix, TargetGroup: props.targetGroupArnSuffix };

  const specs: Array<{ id: string; name: string; metric: cloudwatch.Metric; threshold: number; comparison: cloudwatch.ComparisonOperator; evaluationPeriods: number }> = [
    {
      id: 'Alb5xx',
      name: `sanchay-${props.env}-alb-5xx`,
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApplicationELB',
        metricName: 'HTTPCode_Target_5XX_Count',
        dimensionsMap: dims,
        statistic: 'Sum',
        period: cloudwatch.Duration.minutes(5),
      }),
      threshold: 10,
      comparison: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 1,
    },
    {
      id: 'TargetUnhealthy',
      name: `sanchay-${props.env}-target-unhealthy`,
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApplicationELB',
        metricName: 'UnHealthyHostCount',
        dimensionsMap: dims,
        statistic: 'Maximum',
        period: cloudwatch.Duration.minutes(1),
      }),
      threshold: 0,
      comparison: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 3,
    },
    {
      id: 'WorkerHeartbeatStale',
      name: `sanchay-${props.env}-worker-heartbeat-stale`,
      metric: new cloudwatch.Metric({
        namespace: NS,
        metricName: 'WorkerHeartbeatAgeSeconds',
        statistic: 'Maximum',
        period: cloudwatch.Duration.minutes(1),
      }),
      threshold: 120,
      comparison: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 2,
    },
    {
      id: 'JobQueueAge',
      name: `sanchay-${props.env}-job-queue-age`,
      metric: new cloudwatch.Metric({
        namespace: NS,
        metricName: 'JobQueueOldestAgeSeconds',
        statistic: 'Maximum',
        period: cloudwatch.Duration.minutes(1),
      }),
      threshold: 120,
      comparison: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 2,
    },
    {
      id: 'ReconcilingSla',
      name: `sanchay-${props.env}-reconciling-sla`,
      metric: new cloudwatch.Metric({
        namespace: NS,
        metricName: 'OrdersReconcilingOverTwoHours',
        statistic: 'Maximum',
        period: cloudwatch.Duration.minutes(5),
      }),
      threshold: 0,
      comparison: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 1,
    },
    {
      id: 'MoneyInvariantBreach',
      name: `sanchay-${props.env}-money-invariant-breach`,
      metric: new cloudwatch.Metric({
        namespace: NS,
        metricName: 'ReconBreaksOpenCritical',
        statistic: 'Maximum',
        period: cloudwatch.Duration.minutes(5),
      }),
      threshold: 0,
      comparison: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 1,
    },
    {
      id: 'WebhookSignatureFailures',
      name: `sanchay-${props.env}-webhook-signature-failures`,
      metric: new cloudwatch.Metric({
        namespace: NS,
        metricName: 'FpWebhookSignatureFailures',
        statistic: 'Sum',
        period: cloudwatch.Duration.minutes(5),
      }),
      threshold: 3,
      comparison: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 1,
    },
    {
      id: 'OtpSendFailureRate',
      name: `sanchay-${props.env}-otp-send-failure-rate`,
      metric: new cloudwatch.Metric({
        namespace: NS,
        metricName: 'OtpSendFailureRatePercent',
        statistic: 'Average',
        period: cloudwatch.Duration.minutes(15),
      }),
      threshold: 5,
      comparison: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 2,
    },
    {
      id: 'SmsCapReached',
      name: `sanchay-${props.env}-sms-cap-reached`,
      metric: new cloudwatch.Metric({
        namespace: NS,
        metricName: 'SmsSentToday',
        statistic: 'Maximum',
        period: cloudwatch.Duration.minutes(15),
      }),
      threshold: 1900,
      comparison: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 1,
    },
    {
      id: 'NavAge',
      name: `sanchay-${props.env}-nav-age`,
      metric: new cloudwatch.Metric({
        namespace: NS,
        metricName: 'NavAgeHours',
        statistic: 'Maximum',
        period: cloudwatch.Duration.minutes(15),
      }),
      threshold: 26,
      comparison: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 1,
    },
  ];

  const alarms = specs.map((s) => {
    const alarm = new cloudwatch.Alarm(scope, s.id, {
      alarmName: s.name,
      metric: s.metric,
      threshold: s.threshold,
      comparisonOperator: s.comparison,
      evaluationPeriods: s.evaluationPeriods,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    alarm.addAlarmAction(action);
    alarm.addOkAction(action);
    return alarm;
  });

  return { topic, alarms };
}
```

Modify `infra/lib/sanchay-mvp-stack.ts`: in the constructor, after the ALB/target-group/ECS-service constructs E25 already built (`this.alb`, `this.apiTargetGroup`, `this.ecsService`, the NAT gateway held on `this.vpc`), append:

```ts
    // F1: prod alarms (E25 keeps its single dev NAV-age alarm; this replaces it in prod only).
    if (props.env === 'prod') {
      buildAlarms(this, {
        env: props.env,
        alarmEmails: props.alarmEmails,
        alarmSmsNumbers: props.alarmSmsNumbers,
        albArnSuffix: cdk.Fn.select(1, cdk.Fn.split('loadbalancer/', this.alb.loadBalancerArn)),
        targetGroupArnSuffix: cdk.Fn.select(1, cdk.Fn.split(':targetgroup/', this.apiTargetGroup.targetGroupArn)),
      });
    }

    // F1: the NAT EIP for the Cybrilla allowlist request (R-05's public-dev-host rationale extends to prod).
    const natEip = this.vpc.publicSubnets[0]?.node.tryFindChild('NATGateway') as ec2.CfnNatGateway | undefined;
    if (natEip) {
      new cdk.CfnOutput(this, 'NatEip', { value: cdk.Fn.select(0, natEip.attrEipAllocationIds ?? ['']) });
    }
```

and, on the `api` and `worker` container definitions E25 already builds, append two entries to the shared `environment` map used by both:

```ts
    environment.SANCHAY_ORDERS_ENABLED_DEFAULT = props.env === 'prod' ? 'false' : 'true';
    environment.SANCHAY_PLANS_SIP_ENABLED_DEFAULT = props.env === 'prod' ? 'false' : 'true';
```

and add the import at the top of the file:

```ts
import { buildAlarms } from './alarms.js';
```

Create `docs/runbooks/credential-rotation.md`:

```markdown
# Runbook: credential rotation

Scope: `SANCHAY_FP_CREDENTIALS_JSON`, `SANCHAY_MSG91_CREDENTIALS_JSON`, `SANCHAY_KEYRING_JSON`, and the RDS
master secret, all in AWS Secrets Manager `sanchay/{env}/*` (R-19 owning containers).

## Before you rotate the DB master secret
1. Confirm a recent automated PITR restore succeeded into a scratch instance (G-E5). This is not asserted by
   a CDK unit test — the CDK stack only proves `BackupRetentionPeriod: 14` and `DeletionProtection: true`;
   restorability is verified manually, quarterly, by restoring to a scratch RDS instance and running
   `pnpm --filter=@sanchay/api db:check` against it.
2. Page the on-call developer; rotation is not silent.

## Rotation steps (any of the four secrets)
1. Create a new secret version in Secrets Manager (do not overwrite the current version in place).
2. `aws ecs update-service --cluster sanchay-{env} --service sanchay-{env} --force-new-deployment` so the
   `api` and `worker` tasks re-read the secret on the next task launch (they read it once at boot).
3. Watch the `sanchay-{env}-alb-5xx` and `sanchay-{env}-worker-heartbeat-stale` alarms for 15 minutes; a
   failed rotation shows there first.
4. Only after the new tasks are healthy, delete the previous secret version (Secrets Manager keeps one
   previous version by default; do not delete `AWSPREVIOUS` until this step).
5. Record the rotation (who, when, which secret) in the ops log; `SANCHAY_FP_CREDENTIALS_JSON` rotations
   also need a Cybrilla-side confirmation that the old client secret was revoked.

## If an alarm fires mid-rotation
- `sanchay-{env}-alb-5xx` or `sanchay-{env}-target-unhealthy`: the new tasks cannot reach the DB or FP with
  the new secret. Roll back by force-deploying the previous task definition (secrets are read by ARN +
  version stage, so the previous `AWSPREVIOUS` stage must still exist — see step 4).
- `sanchay-{env}-worker-heartbeat-stale`: the worker task is crash-looping on boot (bad `SANCHAY_FP_CREDENTIALS_JSON`
  shape). Check `aws ecs execute-command` logs before rolling back.
```

- [ ] **Step 4: Run tests to confirm they pass**

```
pnpm --filter=@sanchay/infra test
pnpm --filter=@sanchay/infra typecheck
```

Expected: all `alarms.test.ts` and `sanchay-mvp-stack.test.ts` cases green, including the existing E25 dev-stack assertions (unchanged) and the new prod/dev-regression blocks; typecheck clean.

- [ ] **Step 5: Commit**

```
pnpm exec biome check --write infra/lib/config.ts infra/lib/alarms.ts infra/lib/sanchay-mvp-stack.ts infra/test/alarms.test.ts infra/test/sanchay-mvp-stack.test.ts docs/runbooks/credential-rotation.md
pnpm --filter=@sanchay/infra test
pnpm --filter=@sanchay/infra typecheck
pnpm lint
git add infra/lib/config.ts infra/lib/alarms.ts infra/lib/sanchay-mvp-stack.ts infra/test/alarms.test.ts infra/test/sanchay-mvp-stack.test.ts docs/runbooks/credential-rotation.md
git commit -m "feat(infra): prod CDK stack and the 10-alarm SNS topic (F1)" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task F2: SIP and mandate backend (UPI Autopay ₹1,00,000) (Dev A, 18 h)

**Files:**
- **Create (domain):** `packages/domain/src/rules/sip-dates.ts`, `packages/domain/test/sip-dates.test.ts`
- **Create (api):** `apps/api/src/modules/plans/{plans.schema.ts, fp-plan.ts, fp-plan.test.ts, plan-transitions.ts, sip-eligibility.ts, sip-eligibility.test.ts, sip.service.ts, mandates.service.ts, mandates-submit.job.ts, mandates-poll.job.ts, sip-submit.job.ts, sip-advance.job.ts, instalments-sync.job.ts, plans.router.ts, mandates.router.ts, plans.module.ts}`
- **Create (contract):** `packages/contract/src/plans.ts`, `packages/contract/src/mandates.ts`, `packages/contract/src/plans.test.ts`
- **Create (tests):** `apps/api/test/int/sip-seed.ts`, `apps/api/test/int/sip-mandate.int.test.ts`
- **Create (migrations):** `apps/api/drizzle/0026_plans_mandates.sql` (generated: `plans`, `mandates`, and the `orders_plan_fp_order_uq` index), `apps/api/drizzle/0027_plans_mandates_guard.sql` (custom: attaches E4's `trg_consent_guard` to both tables)
- **Modify:**
  - `apps/api/src/integrations/fp/fp-transact.ts` (D3): real bodies for `createPurchasePlan`, `updatePurchasePlan`, `createMandate`, `authoriseMandate`.
  - `apps/api/src/integrations/fp/fake/fake-fp.state.ts` and `fake-fp.ts` (D4): purchase plans, `mandate.get`, `mandateAuth.create`, `purchase.list?plan=`, and the test helpers `advanceMandate`, `advancePlan`, `addInstalment`.
  - `apps/api/src/modules/orders/orders.schema.ts` (E20): the `orders_plan_fp_order_uq` unique index.
  - `apps/api/src/db/app-schema.ts`: export `plans.schema.ts`.
  - `apps/api/src/modules/platform/jobs/job-registry.ts`, `apps/api/src/modules/platform/jobs/schedules.ts`, `apps/api/src/modules/platform/ids.ts`.
  - `packages/domain/src/rules/index.ts`.
  - `packages/contract/src/errors.ts`, `packages/contract/src/index.ts`, `packages/app-core/src/errors/messages.ts`, `apps/api/openapi.json`.
  - `apps/api/src/app.module.ts` (`PlansModule.forRoot(env)`).

**Interfaces:**
- **Prerequisites:** Plan 02 D1–D6 and D8 as built (see this plan's Global Constraints), with D5 errata RV-02-14; Plan 03 E4, E7, E11 and E20.
- **Consumes (Plan 02, as built):**
  - `RuntimeConfig.get(exec, 'plans.sip.enabled')` (default `false`) and `ReconBreaks.open(exec, {kind, entityType, entityId, severity, detail?})`, both static, from `platform/runtime-config.ts`.
  - `Jobs` (injectable), class-level `@JobHandler`, `type Job<N>`, `registerSchedules` (D2).
  - `FpTransact`, `FpRead` (`mandate(id)`, `purchasePlan(id)`, `purchasePlans({mfInvestmentAccount})`, `purchases({plan})`), `FpRejectedError`, `FpAmbiguousError` (D3, worker-only, global `FpModule`).
  - `FakeFp` (D4).
  - `canTransition`, `PLAN_STATUSES`, `MANDATE_STATUSES`, `fpStateToOrderStatus`, `type FpOrderState` (D5).
  - `Notify.enqueue(exec, template, {investorId, data, dedupeKey})` through `NotificationsModule` (D6).
  - `schemes` (`sipAllowed`, `sipDates`, `thresholds.{sipMin, sipMax, sipMultiple}`) and `marketHolidays` (D8, `catalogue.schema.ts`).
- **Consumes (Plan 03):**
  - `ConsentEngine.create`, `useConsumed`, `CONSENT_SUBJECT_JOBS`, `ConsentApprovedJobData`, `CHALLENGE_EXPIRY_MS`, and the `consentChallenges`/`consentRecords` tables (E4).
  - `expectNoPmWritesBeforeConsumed`, `expectBola` (E4); `jobOf` (E1).
  - `bankAccounts.{fpBankOldId, isPrimary, status}` (E7); `InvestorAccounts.decryptMobile/decryptEmail` (E11).
  - `orders`, `orderEvents` (it has `plan_id` and `mandate_id`), `ORDER_INITIATED_VIA`, `toFpPurchaseView`, `seedInvestableInvestor`, `seedScheme` (E20).
  - `type CutoffHolidays` (E22, `@sanchay/domain`).
- **Produces:**
  - `firstInstalmentDate({registeredOn, day, sipDates, holidays}): IsoDate` in `@sanchay/domain`. It returns the first `day` at least `registeredOn + 2` days away, rolled forward to the next business day. It throws `RangeError` when `day ∉ sipDates`.
  - `assertSipEligible({scheme, amount, installmentDay})`, `sipSchemeOf(row)`, `type SipScheme`, `SIP_FLOOR` (₹100), `UPI_AUTOPAY_LIMIT` (₹1,00,000) and `MAX_INSTALMENTS` (360), in `modules/plans/sip-eligibility.ts`. F10's quote reuses them.
  - Tables `mandates` and `plans`. `frequency` is CHECK `'MONTHLY'`. `limit_amount` is CHECK-ed to the spec's five limits, with UPI Autopay fixed at 1,00,000. Plan and mandate transitions append `order_events` rows (`plan_id`/`mandate_id`).
  - `SipService.createSip(input) → {planId, mandateId, challengeId, expiresAt, newMandate, firstInstalmentDate}`, plus `.list` and `.get`.
  - `MandatesService.list`, `.get`, `.authorize`.
  - Routes:
    - `plans.createSip` POST `/plans/sips` [K]
    - `plans.list` GET `/plans`
    - `plans.get` GET `/plans/{id}`
    - `mandates.list` GET `/mandates`
    - `mandates.get` GET `/mandates/{id}` (`upiUri` only while `AUTH_PENDING`)
    - `mandates.authorize` POST `/mandates/{id}/authorize` [K], which re-mints the UPI intent.
  - `CONSENT_SUBJECT_JOBS.MANDATE_REGISTRATION = 'mandates.submit'` and `CONSENT_SUBJECT_JOBS.SIP_REGISTRATION = 'plans.sip.submit'`, registered at `plans.module.ts` load.
  - Jobs (worker only):
    - `mandates.submit` (`ConsentApprovedJobData`, or `{challengeId, subjectIds, reauthorise}`)
    - `mandates.poll` (`{scope: 'PENDING'|'APPROVED'}`)
    - `plans.sip.submit` (`{challengeId, subjectIds}`)
    - `plans.sip.advance` (`{planId, challengeId}`)
    - `plans.instalments.sync` (`{}`)
  - Schedules: `mandates.poll` PENDING at `*/10`, APPROVED at `30 7 * * *`; `plans.instalments.sync` at `30 8` and `30 20`.
- **One challenge per SIP; the saga window comes from the subject type** (E4 `needsNewMandateWindow`):
  - **New mandate:** subject type `MANDATE_REGISTRATION` (subjects: the plan and the mandate; template `TPL_MANDATE_REGISTRATION`; 7-day saga).
  - **Reused mandate:** subject type `SIP_REGISTRATION` (subject: the plan; template `TPL_SIP_REGISTRATION`; 60-minute saga).
  - **Reuse rule.** A mandate is reused when it is the investor's `APPROVED` `UPI_AUTOPAY` mandate and Σ(its live plans) + this amount ≤ `limit_amount`. Live plans are those in `CONSENTED`, `MANDATE_SETUP`, `SUBMITTING`, `UNDER_REVIEW`, `CONFIRMING`, `ACTIVE`, `RECONCILING` or `CANCEL_PENDING`, plus `CONSENT_PENDING` plans younger than the challenge expiry. E4 never expires the subject rows of an unapproved challenge, so an abandoned draft must not hold headroom.
- **FP chain** (research fp-api §4, ONDC plan flow):
  1. `mandates.submit`:
     - Mandate: `CONSENT_PENDING → CONSENTED → SUBMITTING`.
     - Inside `useConsumed`:
       - `POST /api/pg/mandates {mandate_type:'UPI', bank_account_id: <bank old_id>, mandate_limit: 100000, provider_name:'CYBRILLAPOA'}` → `CREATED`.
       - `POST /api/pg/payments/emandate/auth {mandate_id, upi:{type:'uri'}}` → `AUTH_PENDING` with `upi_uri`.
     - Plan: `CONSENT_PENDING → CONSENTED → MANDATE_SETUP`.
  2. `mandates.poll` steps through D5's MANDATE machine:
     - FP `SUBMITTED` → `BANK_PENDING`.
     - FP `APPROVED` → `APPROVED`, then enqueues `plans.sip.submit` for each `MANDATE_SETUP` plan.
     - FP `REJECTED` (or `CANCELLED` before approval) → `REJECTED`, and each waiting plan goes `FAILED`.
     - Saga lapsed → `EXPIRED`, and each waiting plan goes `CONSENT_EXPIRED`.
     - For `APPROVED` mandates, FP `CANCELLED` → `CANCELLED`, `ACTIVE` plans → `MANDATE_REVOKED`, and a `MANDATE_REVOKED` email.
  3. `plans.sip.submit` moves the plan to `SUBMITTING` (via `mandate_approved` or `mandate_reused_with_headroom`). Inside `useConsumed` it POSTs `/v2/mf_purchase_plans` with:
     - `{mf_investment_account, scheme: <ISIN>, frequency:'monthly', installment_day, number_of_installments?, amount, systematic: true, payment_method:'mandate', payment_source: <FP mandate id>, source_ref_id: <plan id>, user_ip, initiated_by:'investor'}`
     - No `gateway`, `initiated_via`, `start_date`, `partner` or `euin`: FP rejects the first three on plans, and H-11 forbids the last two.
     - The plan becomes `UNDER_REVIEW`.
  4. `plans.sip.advance` reads the FP plan:
     - `failed` → `REJECTED`.
     - `review_completed` → `CONFIRMING`, then `PATCH {id, consent:{isd_code:'91', mobile, email?}, state:'confirmed'}` inside `useConsumed`.
     - `active` → `ACTIVE`, with `first_instalment_date`/`next_instalment_date`, a `SIP_ACTIVATED` audit and a `SIP_ACTIVE` email.
     - Anything else: it re-enqueues itself (60 s).
     - It also adopts a `RECONCILING` plan by `source_ref_id`. If the plan is absent 10 minutes after entering `RECONCILING`, it goes `FAILED` (`PROVIDER_OBJECT_ABSENT`).
  5. `plans.instalments.sync` lists `GET /v2/mf_purchases?plan=` for each `ACTIVE` plan and upserts `orders(origin='SIP_INSTALMENT')` on `(plan_id, fp_order_id)`, with statuses from `fpStateToOrderStatus`. There is no consent per instalment (SEBI-2FA-S). Two consecutive `FAILED`/`EXPIRED` instalments send `SIP_INSTALMENT_MISSED_WARNING` once per miss streak.
- **Kill switch:** `plans.createSip` returns 403 `FEATURE_DISABLED` while `plans.sip.enabled` is `false` (GO-2, R-06).
- **Audit rows (R-20):** `SIP_CREATED`, `MANDATE_APPROVED`, `SIP_SUBMITTED` and `SIP_ACTIVATED`.
- **Review fixes** (rewrite against Plans 02–03 as built):
  - **Invented APIs.** The draft called an invented `FpTransact.call('pg.mandates.create' | 'pg.emandate.auth' | 'mf.purchasePlans.create')` and `FpRead.purchasesByPlan`. It now fills D3's typed stubs and uses `FpRead.purchases({plan})`.
  - **Job handlers.** Method-level `@JobHandler`s are replaced by class-level handlers, and the crons now live in `registerSchedules`.
  - **Local status lists.** The draft redeclared `MANDATE_STATUSES`/`PLAN_STATUSES` locally (with a `MANDATE_REVOKED` mandate state D5 does not have). It now uses D5's.
  - **Consent guard.** The guard trigger was `BEFORE INSERT OR UPDATE`, which would have refused the `CONSENT_PENDING` insert. It now fires only on the move to `SUBMITTING`, as E20's does.
  - **Consent call.** The draft passed `consent.create` a subjects object and a `sagaWindowMs` E4 does not take. The saga now follows the subject type.
  - **Scheme fields.** The draft read SIP limits from nonexistent `fundFacts` columns. They now come from D8's `schemes.thresholds`/`sipDates`/`sipAllowed`.
  - **Router.** The draft's `payoutBankIdFor` returned the investor id, `authorize` was a no-op, and the router was not idempotent. The router now uses Plan 01's `@Controller` + `@Implement` with `requireIdempotency(idem, cls)`.
  - **Plan payload.** The draft sent `initiated_via` on the plan POST.
  - **Module placement.** All SIP and mandate code moves to one `modules/plans/` module, so neither `OrdersModule` nor `PaymentsModule` gains a cross-module dependency.
  - **Date rule.** The draft's holiday-blind `instalment-date.ts` is gone. The rule moves here from F10 as `firstInstalmentDate`: F10's quote needs F2's `assertSipEligible`, so F2 must come first, and F2 now owns the rule. F10 keeps its golden vectors and quote.
  - **D5 edges.** D5 gained the PLAN edges `UNDER_REVIEW → REJECTED | CONSENT_EXPIRED`, `CONFIRMING → REJECTED` and `SUBMITTING → REJECTED`, and the MANDATE edges `CONSENTED → CONSENT_EXPIRED` and `SUBMITTING → REJECTED` (Plan 02 errata RV-02-14).
- **Known gap:** a mandate left `RECONCILING` by an ambiguous `POST /api/pg/mandates` opens a CRITICAL `recon_breaks` row (`MANDATE_CREATE_AMBIGUOUS`) for manual adoption. D3 has no FP mandate list-by-bank read to automate it yet.

- [ ] **Step 1: Write the failing tests**

`packages/domain/test/sip-dates.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { CutoffHolidays } from '../src/rules/cutoff.js';
import { firstInstalmentDate } from '../src/rules/sip-dates.js';
import { toIsoDate } from '../src/ids.js';

const holidays = (dates: readonly string[]): CutoffHolidays => ({ has: (d) => dates.includes(d) });
const at = (registeredOn: string, day: number, sipDates: number[], hol: string[] = []) =>
  firstInstalmentDate({ registeredOn: toIsoDate(registeredOn), day, sipDates, holidays: holidays(hol) });

describe('firstInstalmentDate (SIPD-01..08)', () => {
  it('SIPD-01: the chosen day, at least registration + 2', () => expect(at('2026-10-16', 20, [5, 20])).toBe('2026-10-20'));
  it('SIPD-02: a Saturday rolls to Monday', () => expect(at('2026-10-01', 10, [10])).toBe('2026-10-12'));
  it('SIPD-03: too close this month -> next month', () => expect(at('2026-10-25', 5, [5, 20])).toBe('2026-11-05'));
  it('SIPD-04: 28 Feb 2027 is a Sunday -> 1 Mar', () => expect(at('2027-02-20', 28, [28])).toBe('2027-03-01'));
  it('SIPD-05: a market holiday rolls forward', () => expect(at('2026-10-16', 20, [5, 20], ['2026-10-20'])).toBe('2026-10-21'));
  it('SIPD-06: crosses the year end', () => expect(at('2026-12-29', 15, [3, 15])).toBe('2027-01-15'));
  it('SIPD-07: holiday then weekend', () => expect(at('2026-12-28', 1, [1, 15], ['2027-01-01'])).toBe('2027-01-04'));
  it('SIPD-08: a day outside sip_dates throws', () => expect(() => at('2026-10-01', 7, [5, 20])).toThrow(RangeError));
});
```

`apps/api/src/modules/plans/sip-eligibility.test.ts`:
```ts
import { Money } from '@sanchay/money';
import { describe, expect, it } from 'vitest';
import { assertSipEligible, type SipScheme, sipSchemeOf } from './sip-eligibility.js';

const scheme: SipScheme = {
  sipMin: Money.parse('500.00'),
  sipMax: null,
  sipMultiple: Money.parse('100.00'),
  sipDates: [5, 10, 15],
};
const check = (amount: string, installmentDay = 10) => () => assertSipEligible({ scheme, amount: Money.parse(amount), installmentDay });

describe('assertSipEligible', () => {
  it('accepts a valid day and amount', () => expect(check('1000.00')).not.toThrow());
  it('SIP_DAY_INVALID outside sip_dates', () => expect(check('1000.00', 7)).toThrow(expect.objectContaining({ code: 'SIP_DAY_INVALID' })));
  it('AMOUNT_BELOW_MIN under the scheme minimum', () => expect(check('400.00')).toThrow(expect.objectContaining({ code: 'AMOUNT_BELOW_MIN' })));
  it('AMOUNT_NOT_MULTIPLE off the multiple', () => expect(check('1050.00')).toThrow(expect.objectContaining({ code: 'AMOUNT_NOT_MULTIPLE' })));
  it('MANDATE_LIMIT_EXCEEDED above the UPI Autopay limit', () =>
    expect(check('100100.00')).toThrow(expect.objectContaining({ code: 'MANDATE_LIMIT_EXCEEDED' })));
  it('the ₹100 floor applies even when the scheme minimum is lower', () => {
    const low = { ...scheme, sipMin: Money.parse('50.00'), sipMultiple: Money.parse('1.00') };
    expect(() => assertSipEligible({ scheme: low, amount: Money.parse('99.00'), installmentDay: 5 })).toThrow(
      expect.objectContaining({ code: 'AMOUNT_BELOW_MIN' }),
    );
  });
});

describe('sipSchemeOf', () => {
  const row = {
    status: 'PUBLISHED' as const,
    sipAllowed: true,
    sipDates: [5],
    thresholds: { purchaseMin: '500.00', purchaseMax: null, purchaseMultiple: '1.00', sipMin: '500.00', sipMax: null, sipMultiple: '1.00' },
  };
  it('reads D8 thresholds', () => expect(sipSchemeOf(row).sipDates).toEqual([5]));
  it('SCHEME_NOT_ORDERABLE when SIP is not allowed or has no dates', () => {
    expect(() => sipSchemeOf({ ...row, sipAllowed: false })).toThrow(expect.objectContaining({ code: 'SCHEME_NOT_ORDERABLE' }));
    expect(() => sipSchemeOf({ ...row, sipDates: [] })).toThrow(expect.objectContaining({ code: 'SCHEME_NOT_ORDERABLE' }));
  });
});
```

`apps/api/src/modules/plans/fp-plan.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { toFpMandateView, toFpPlanView, upiUriOf } from './fp-plan.js';

describe('FP plan and mandate views', () => {
  it('reads a purchase plan', () => {
    expect(
      toFpPlanView({ id: 'mfpp_1', state: 'active', source_ref_id: 'p1', start_date: '2026-11-10', next_installment_date: '2026-12-10', consent: { mobile: '9' } }),
    ).toEqual({ id: 'mfpp_1', state: 'active', sourceRefId: 'p1', startDate: '2026-11-10', nextInstallmentDate: '2026-12-10', hasConsent: true });
  });
  it('reads a mandate (integer id, upper-case status)', () => {
    expect(toFpMandateView({ id: 4411, mandate_ref: 'mref_1', mandate_status: 'approved', umrn: 'U1' })).toEqual({
      id: 4411,
      status: 'APPROVED',
      mandateRef: 'mref_1',
      umrn: 'U1',
    });
  });
  it('reads the UPI intent from an emandate auth response', () => {
    expect(upiUriOf({ upi: { type: 'uri', uri: 'upi://mandate?x=1' } })).toBe('upi://mandate?x=1');
    expect(upiUriOf({})).toBeNull();
  });
});
```

`packages/contract/src/plans.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { CreateSipInputSchema } from './plans.js';

const valid = { schemeId: '0192f0e0-0000-7000-8000-000000000001', amount: '5000.00', installmentDay: 10 };

describe('CreateSipInputSchema', () => {
  it('defaults numberOfInstalments to null ("until I cancel")', () => {
    expect(CreateSipInputSchema.parse(valid).numberOfInstalments).toBeNull();
  });
  it('rejects a frequency key: MONTHLY is the only frequency and is not an input', () => {
    expect(CreateSipInputSchema.safeParse({ ...valid, frequency: 'QUARTERLY' }).success).toBe(false);
  });
  it('rejects day 29 and 0', () => {
    expect(CreateSipInputSchema.safeParse({ ...valid, installmentDay: 29 }).success).toBe(false);
    expect(CreateSipInputSchema.safeParse({ ...valid, installmentDay: 0 }).success).toBe(false);
  });
});
```

`apps/api/test/int/sip-seed.ts`:
```ts
import { eq } from 'drizzle-orm';
import { schemes } from '../../src/modules/catalogue/catalogue.schema.js';
import { bankAccounts } from '../../src/modules/onboarding/bank.schema.js';
import { appConfig } from '../../src/modules/platform/kernel.schema.js';
import type { TestApp } from './app.js';
import { seedInvestableInvestor, seedScheme } from './orders-seed.js';

export const SIP_DATES = [5, 10, 15, 20, 25];

/** E20's scheme with SIP allowed on SIP_DATES (thresholds: sipMin 500, multiple 1). */
export async function seedSipScheme(app: TestApp): Promise<{ id: string; isin: string }> {
  const scheme = await seedScheme(app);
  await app.db.db.update(schemes).set({ sipAllowed: true, sipDates: SIP_DATES }).where(eq(schemes.id, scheme.id));
  return scheme;
}

/** E20's investable investor whose primary VERIFIED bank is registered at FP (old_id 5001). */
export async function seedSipInvestor(app: TestApp) {
  const investor = await seedInvestableInvestor(app);
  await app.db.db
    .update(bankAccounts)
    .set({ fpBankAccountId: `bac_${investor.investorId.slice(0, 8)}`, fpBankOldId: 5001, isPrimary: true, status: 'VERIFIED' })
    .where(eq(bankAccounts.id, investor.bankId));
  return investor;
}

export async function setSipEnabled(app: TestApp, enabled: boolean): Promise<void> {
  await app.db.db
    .insert(appConfig)
    .values({ key: 'plans.sip.enabled', value: enabled })
    .onConflictDoUpdate({ target: appConfig.key, set: { value: enabled } });
}
```

`apps/api/test/int/sip-mandate.int.test.ts`:
```ts
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ConsentApprovedJobData, ConsentEngine } from '../../src/modules/legal-consent/consent-engine.js';
import { consentChallenges } from '../../src/modules/legal-consent/legal-consent.schema.js';
import { notifications } from '../../src/modules/notifications/notifications.schema.js';
import { orders } from '../../src/modules/orders/orders.schema.js';
import { InstalmentsSyncJob } from '../../src/modules/plans/instalments-sync.job.js';
import { MandatesPollJob } from '../../src/modules/plans/mandates-poll.job.js';
import { MandatesSubmitJob } from '../../src/modules/plans/mandates-submit.job.js';
import { mandates, plans } from '../../src/modules/plans/plans.schema.js';
import { SipAdvanceJob } from '../../src/modules/plans/sip-advance.job.js';
import { SipService } from '../../src/modules/plans/sip.service.js';
import { SipSubmitJob } from '../../src/modules/plans/sip-submit.job.js';
import { DAY, MINUTE } from '../../src/modules/platform/clock.js';
import type { JobName } from '../../src/modules/platform/jobs/job-registry.js';
import { Jobs } from '../../src/modules/platform/jobs/jobs.service.js';
import { auditEvents } from '../../src/modules/platform/platform.schema.js';
import { expectBola } from './bola.js';
import { expectNoPmWritesBeforeConsumed } from './consent-first.js';
import { bootFpTestApp, type FpTestApp } from './fake-fp.js';
import { jobOf } from './jobs.js';
import { seedSipInvestor, seedSipScheme, setSipEnabled } from './sip-seed.js';

let t: FpTestApp;
const enqueued: Array<{ name: string; data: unknown }> = [];

beforeAll(async () => {
  t = await bootFpTestApp();
  vi.spyOn(t.app.get(Jobs), 'enqueue').mockImplementation(async (_exec, name, data) => {
    enqueued.push({ name, data });
  });
  await setSipEnabled(t, true);
});
afterAll(async () => {
  await t.close();
});
beforeEach(() => {
  enqueued.length = 0;
});

type SipInvestor = Awaited<ReturnType<typeof seedSipInvestor>>;

async function draftSip(opts: { amount?: string; day?: number; investor?: SipInvestor } = {}) {
  const investor = opts.investor ?? (await seedSipInvestor(t));
  const scheme = await seedSipScheme(t);
  const created = await t.app.get(SipService).createSip({
    investorId: investor.investorId,
    schemeId: scheme.id,
    amount: opts.amount ?? '5000.00',
    installmentDay: opts.day ?? 10,
    numberOfInstalments: null,
    userIp: '203.0.113.10',
    initiatedVia: 'web',
  });
  return { investor, scheme, ...created };
}

const lastJob = (name: JobName) => [...enqueued].reverse().find((j) => j.name === name);

/** Sends the factors the challenge requires, approves, and returns the job approve enqueued. */
async function approve(draft: { challengeId: string; investor: SipInvestor }, jobName: JobName): Promise<ConsentApprovedJobData> {
  const engine = t.app.get(ConsentEngine);
  const [row] = await t.db.db.select().from(consentChallenges).where(eq(consentChallenges.id, draft.challengeId));
  const needsEmail = row?.requiredFactors.includes('EMAIL') === true;
  await engine.sendOtp(draft.challengeId, 'SMS');
  if (needsEmail) await engine.sendOtp(draft.challengeId, 'EMAIL');
  await engine.approve(draft.challengeId, {
    smsCode: t.sms.latestCode(draft.investor.mobile) ?? '',
    ...(needsEmail ? { emailCode: t.email.latestCode(draft.investor.email) ?? '' } : {}),
  });
  const job = lastJob(jobName);
  expect(job, `approve enqueues ${jobName}`).toBeDefined();
  return job?.data as ConsentApprovedJobData;
}

const mandateSubmit = (data: unknown) => t.app.get(MandatesSubmitJob).handle(jobOf('mandates.submit', data));
const poll = (scope: 'PENDING' | 'APPROVED') => t.app.get(MandatesPollJob).handle(jobOf('mandates.poll', { scope }));
const sipSubmit = (data: unknown) => t.app.get(SipSubmitJob).handle(jobOf('plans.sip.submit', data));
const sipAdvance = (planId: string, challengeId: string) =>
  t.app.get(SipAdvanceJob).handle(jobOf('plans.sip.advance', { planId, challengeId }));
const sync = () => t.app.get(InstalmentsSyncJob).handle(jobOf('plans.instalments.sync', {}));
const planOf = async (id: string) => (await t.db.db.select().from(plans).where(eq(plans.id, id)))[0];
const mandateOf = async (id: string) => (await t.db.db.select().from(mandates).where(eq(mandates.id, id)))[0];
const challengeOf = async (id: string) => (await t.db.db.select().from(consentChallenges).where(eq(consentChallenges.id, id)))[0];
const auditFor = async (entityType: string, entityId: string) =>
  (await t.db.db.select().from(auditEvents).where(and(eq(auditEvents.entityType, entityType), eq(auditEvents.entityId, entityId)))).map((r) => r.action);
const notificationsFor = async (investorId: string, templateKey: string) =>
  t.db.db.select().from(notifications).where(and(eq(notifications.investorId, investorId), eq(notifications.templateKey, templateKey as never)));

/** New-mandate SIP driven to AUTH_PENDING (mandate) / MANDATE_SETUP (plan). */
async function toAuthPending(opts: { amount?: string; investor?: SipInvestor } = {}) {
  const draft = await draftSip(opts);
  await mandateSubmit(await approve(draft, 'mandates.submit'));
  return draft;
}

/** New-mandate SIP driven all the way to ACTIVE. */
async function activeSip(opts: { amount?: string; investor?: SipInvestor } = {}) {
  const draft = await toAuthPending(opts);
  t.fakeFp.advanceMandate(Number((await mandateOf(draft.mandateId))?.fpMandateId), 'APPROVED');
  await poll('PENDING');
  await sipSubmit(lastJob('plans.sip.submit')?.data);
  const fpPlanId = (await planOf(draft.planId))?.fpPlanId as string;
  t.fakeFp.advancePlan(fpPlanId, 'review_completed');
  await sipAdvance(draft.planId, draft.challengeId);
  t.fakeFp.advancePlan(fpPlanId, 'active', { startDate: draft.firstInstalmentDate, nextInstallmentDate: draft.firstInstalmentDate });
  await sipAdvance(draft.planId, draft.challengeId);
  return { ...draft, fpPlanId };
}

describe('plans.createSip', () => {
  it('new mandate: CONSENT_PENDING plan + UPI_AUTOPAY mandate at 1,00,000, one MANDATE_REGISTRATION challenge, zero FP calls', async () => {
    const before = t.fakeFp.calls().length;
    const draft = await draftSip();
    expect(draft.newMandate).toBe(true);
    expect(await planOf(draft.planId)).toMatchObject({ status: 'CONSENT_PENDING', frequency: 'MONTHLY', consentChallengeId: draft.challengeId });
    expect(await mandateOf(draft.mandateId)).toMatchObject({ status: 'CONSENT_PENDING', rail: 'UPI_AUTOPAY', limitAmount: '100000.00' });
    expect((await challengeOf(draft.challengeId))?.subjectType).toBe('MANDATE_REGISTRATION');
    expect(t.fakeFp.calls()).toHaveLength(before);
    expect(await auditFor('plans', draft.planId)).toContain('SIP_CREATED');
    await expectNoPmWritesBeforeConsumed(t, draft.challengeId);
  });

  it('kill switch: plans.sip.enabled=false -> FEATURE_DISABLED', async () => {
    await setSipEnabled(t, false);
    try {
      await expect(draftSip()).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
    } finally {
      await setSipEnabled(t, true);
    }
  });

  it('SIP_DAY_INVALID outside sip_dates; MANDATE_LIMIT_EXCEEDED above 1,00,000', async () => {
    await expect(draftSip({ day: 7 })).rejects.toMatchObject({ code: 'SIP_DAY_INVALID' });
    await expect(draftSip({ amount: '100001.00' })).rejects.toMatchObject({ code: 'MANDATE_LIMIT_EXCEEDED' });
  });
});

describe('mandate + SIP chain', () => {
  it('mandates.submit: UPI mandate on the bank old_id, AUTH_PENDING with a UPI intent, plan MANDATE_SETUP', async () => {
    const draft = await toAuthPending();
    const mandate = await mandateOf(draft.mandateId);
    expect(mandate).toMatchObject({ status: 'AUTH_PENDING', upiUri: expect.stringMatching(/^upi:\/\//) });
    expect(t.fakeFp.state.mandates.get(Number(mandate?.fpMandateId))?.raw).toEqual({
      mandate_type: 'UPI',
      bank_account_id: 5001,
      mandate_limit: 100000,
      provider_name: 'CYBRILLAPOA',
    });
    expect((await planOf(draft.planId))?.status).toBe('MANDATE_SETUP');
    await expectNoPmWritesBeforeConsumed(t, draft.challengeId);
  });

  it('bank APPROVED -> plans.sip.submit posts a monthly plan with no partner/euin/gateway/initiated_via -> UNDER_REVIEW', async () => {
    const draft = await toAuthPending();
    const mandate = await mandateOf(draft.mandateId);
    t.fakeFp.advanceMandate(Number(mandate?.fpMandateId), 'APPROVED');
    await poll('PENDING');
    expect((await mandateOf(draft.mandateId))?.status).toBe('APPROVED');
    expect(await auditFor('mandates', draft.mandateId)).toContain('MANDATE_APPROVED');
    await sipSubmit(lastJob('plans.sip.submit')?.data);
    const plan = await planOf(draft.planId);
    expect(plan?.status).toBe('UNDER_REVIEW');
    const raw = t.fakeFp.state.purchasePlans.get(plan?.fpPlanId as string)?.raw ?? {};
    expect(raw).toMatchObject({
      mf_investment_account: draft.investor.mfiaId,
      scheme: draft.scheme.isin,
      frequency: 'monthly',
      installment_day: 10,
      amount: '5000.00',
      systematic: true,
      payment_method: 'mandate',
      payment_source: String(mandate?.fpMandateId),
      source_ref_id: draft.planId,
      initiated_by: 'investor',
    });
    for (const key of ['partner', 'euin', 'gateway', 'initiated_via', 'start_date']) expect(raw).not.toHaveProperty(key);
    expect(await auditFor('plans', draft.planId)).toContain('SIP_SUBMITTED');
  });

  it('review_completed -> consent PATCH + confirm; active -> ACTIVE, SIP_ACTIVATED, one SIP_ACTIVE email', async () => {
    const draft = await activeSip();
    const plan = await planOf(draft.planId);
    expect(plan).toMatchObject({ status: 'ACTIVE', firstInstalmentDate: draft.firstInstalmentDate });
    expect(t.fakeFp.state.purchasePlans.get(draft.fpPlanId)?.consent).toEqual({
      isd_code: '91',
      mobile: expect.stringMatching(/^\d{10}$/),
      email: draft.investor.email,
    });
    expect(await auditFor('plans', draft.planId)).toContain('SIP_ACTIVATED');
    expect(await notificationsFor(draft.investor.investorId, 'SIP_ACTIVE')).toHaveLength(1);
  });

  it('reused mandate within headroom: SIP_REGISTRATION, no mandate write, plan write only after CONSUMED', async () => {
    const first = await activeSip({ amount: '5000.00' });
    const mandateCreates = t.fakeFp.calls({ op: 'mandate.create' }).length;
    const second = await draftSip({ investor: first.investor, amount: '5000.00' });
    expect(second).toMatchObject({ newMandate: false, mandateId: first.mandateId });
    expect((await challengeOf(second.challengeId))?.subjectType).toBe('SIP_REGISTRATION');
    await sipSubmit(await approve(second, 'plans.sip.submit'));
    expect((await planOf(second.planId))?.status).toBe('UNDER_REVIEW');
    expect(t.fakeFp.calls({ op: 'mandate.create' })).toHaveLength(mandateCreates);
    await expectNoPmWritesBeforeConsumed(t, second.challengeId);
  });

  it('headroom exceeded -> a new mandate', async () => {
    const first = await activeSip({ amount: '60000.00' });
    const second = await draftSip({ investor: first.investor, amount: '50000.00' });
    expect(second.newMandate).toBe(true);
    expect(second.mandateId).not.toBe(first.mandateId);
  });

  it('mandate REJECTED -> plan FAILED, no plan write', async () => {
    const planCreates = t.fakeFp.calls({ op: 'purchasePlan.create' }).length;
    const draft = await toAuthPending();
    t.fakeFp.advanceMandate(Number((await mandateOf(draft.mandateId))?.fpMandateId), 'REJECTED');
    await poll('PENDING');
    expect((await mandateOf(draft.mandateId))?.status).toBe('REJECTED');
    expect(await planOf(draft.planId)).toMatchObject({ status: 'FAILED', failureCode: 'MANDATE_REJECTED' });
    expect(t.fakeFp.calls({ op: 'purchasePlan.create' })).toHaveLength(planCreates);
  });

  it('FP fails the plan in review -> REJECTED', async () => {
    const draft = await toAuthPending();
    t.fakeFp.advanceMandate(Number((await mandateOf(draft.mandateId))?.fpMandateId), 'APPROVED');
    await poll('PENDING');
    await sipSubmit(lastJob('plans.sip.submit')?.data);
    t.fakeFp.advancePlan((await planOf(draft.planId))?.fpPlanId as string, 'failed');
    await sipAdvance(draft.planId, draft.challengeId);
    expect((await planOf(draft.planId))?.status).toBe('REJECTED');
  });

  it('external cancel of an APPROVED mandate -> CANCELLED, plan MANDATE_REVOKED, one MANDATE_REVOKED email', async () => {
    const draft = await activeSip();
    t.fakeFp.advanceMandate(Number((await mandateOf(draft.mandateId))?.fpMandateId), 'CANCELLED');
    await poll('APPROVED');
    await poll('APPROVED');
    expect(await mandateOf(draft.mandateId)).toMatchObject({ status: 'CANCELLED', cancelledBy: 'EXTERNAL' });
    expect((await planOf(draft.planId))?.status).toBe('MANDATE_REVOKED');
    expect(await notificationsFor(draft.investor.investorId, 'MANDATE_REVOKED')).toHaveLength(1);
  });

  it('7-day saga: mandate never approved -> EXPIRED, plan CONSENT_EXPIRED, no plan write (run last: moves the clock)', async () => {
    const planCreates = t.fakeFp.calls({ op: 'purchasePlan.create' }).length;
    const draft = await toAuthPending();
    t.clock.advance(7 * DAY + MINUTE);
    await poll('PENDING');
    expect((await mandateOf(draft.mandateId))?.status).toBe('EXPIRED');
    expect((await planOf(draft.planId))?.status).toBe('CONSENT_EXPIRED');
    expect(t.fakeFp.calls({ op: 'purchasePlan.create' })).toHaveLength(planCreates);
  });
});

describe('instalments', () => {
  it('sync upserts SIP_INSTALMENT orders idempotently and follows FP state', async () => {
    const draft = await activeSip();
    const fpPurchaseId = t.fakeFp.addInstalment(draft.fpPlanId, 'submitted');
    await sync();
    await sync();
    const rows = await t.db.db.select().from(orders).where(eq(orders.planId, draft.planId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ origin: 'SIP_INSTALMENT', status: 'PROCESSING', fpOrderId: fpPurchaseId, amount: '5000.00' });
    t.fakeFp.advance(fpPurchaseId, 'successful', { folioNumber: 'F-1' });
    await sync();
    expect((await t.db.db.select().from(orders).where(eq(orders.planId, draft.planId)))[0]?.status).toBe('UNITS_PENDING');
  });

  it('two consecutive misses -> exactly one SIP_INSTALMENT_MISSED_WARNING', async () => {
    const draft = await activeSip();
    t.fakeFp.addInstalment(draft.fpPlanId, 'failed');
    t.fakeFp.addInstalment(draft.fpPlanId, 'failed');
    await sync();
    await sync();
    expect(await notificationsFor(draft.investor.investorId, 'SIP_INSTALMENT_MISSED_WARNING')).toHaveLength(1);
  });
});

describe('guards', () => {
  it('trg_consent_guard refuses SUBMITTING on plans and mandates without a CONSUMED challenge', async () => {
    const draft = await draftSip();
    await expect(t.db.pool.query(`UPDATE app.plans SET status = 'SUBMITTING' WHERE id = $1`, [draft.planId])).rejects.toThrow(/trg_consent_guard/);
    await expect(t.db.pool.query(`UPDATE app.mandates SET status = 'SUBMITTING' WHERE id = $1`, [draft.mandateId])).rejects.toThrow(/trg_consent_guard/);
  });

  it('QUARTERLY is refused by the DB CHECK', async () => {
    const draft = await draftSip();
    await expect(t.db.pool.query(`UPDATE app.plans SET frequency = 'QUARTERLY' WHERE id = $1`, [draft.planId])).rejects.toThrow(/plans_frequency_ck/);
  });

  it('BOLA on plans.get, mandates.get and mandates.authorize', async () => {
    const draft = await draftSip();
    await expectBola(t, 'plans.get', { id: draft.planId });
    await expectBola(t, 'mandates.get', { id: draft.mandateId });
    await expectBola(t, 'mandates.authorize', { id: draft.mandateId });
  });
});
```

- [ ] **Step 2: Run them to confirm they fail**

```
pnpm --filter=@sanchay/domain test -- sip-dates
pnpm --filter=@sanchay/api test -- sip-eligibility fp-plan
pnpm --filter=@sanchay/contract test -- plans
pnpm --filter=@sanchay/api test:int -- sip-mandate
```
Expected: `Cannot find module '../src/rules/sip-dates.js'`, `'./sip-eligibility.js'`, `'./fp-plan.js'`, `'./plans.js'` and `'../../src/modules/plans/instalments-sync.job.js'`.

- [ ] **Step 3: Minimal implementation**

`packages/domain/src/rules/sip-dates.ts`:
```ts
import { type IsoDate, toIsoDate } from '../ids.js';
import type { CutoffHolidays } from './cutoff.js';

const pad2 = (n: number) => String(n).padStart(2, '0');
const isoDateOf = (year: number, month: number, day: number) => `${year}-${pad2(month)}-${pad2(day)}`;

function addIsoDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return isoDateOf(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

function isBusinessDay(isoDate: string, holidays: CutoffHolidays): boolean {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow !== 0 && dow !== 6 && !holidays.has(isoDate);
}

export interface FirstInstalmentDateInput {
  registeredOn: IsoDate;
  /** The investor's chosen day, 1..28; must be one of `sipDates`. */
  day: number;
  sipDates: readonly number[];
  holidays: CutoffHolidays;
}

/**
 * Spec §4.3 ACTIVE row: the first calendar occurrence of `day` at least `registeredOn + 2` days away,
 * rolled forward to the next business day (Mon–Fri, not a market holiday). Zero-padded ISO dates
 * compare chronologically as strings.
 */
export function firstInstalmentDate(input: FirstInstalmentDateInput): IsoDate {
  if (!input.sipDates.includes(input.day)) {
    throw new RangeError(`firstInstalmentDate: day ${input.day} is not one of the scheme's sip_dates`);
  }
  const earliest = addIsoDays(input.registeredOn, 2);
  let [year, month] = earliest.split('-').map(Number) as [number, number];
  for (let guard = 0; guard < 24; guard += 1) {
    const candidate = isoDateOf(year, month, input.day);
    if (candidate >= earliest) {
      let landing = candidate;
      while (!isBusinessDay(landing, input.holidays)) landing = addIsoDays(landing, 1);
      return toIsoDate(landing);
    }
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  throw new Error('firstInstalmentDate: no candidate within 24 months');
}
```
Append to `packages/domain/src/rules/index.ts`: `export * from './sip-dates.js';`. `CutoffHolidays` stays E22's single declaration in `cutoff.ts`; it is not re-declared here.

`apps/api/src/modules/plans/plans.schema.ts`:
```ts
import { MANDATE_RAILS, MANDATE_STATUSES, PLAN_STATUSES } from '@sanchay/domain';
import { sql } from 'drizzle-orm';
import { bigint, check, date, index, inet, integer, numeric, smallint, text, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, appSchema, inList, stdColumns, tstz } from '../../db/app-schema.js';
import { ORDER_INITIATED_VIA } from '../orders/orders.schema.js';
import { newId } from '../platform/ids.js';

export const PLAN_TYPES = ['SIP'] as const;
/** Launch frequency set (spec §4.3): MONTHLY only; the DB CHECK refuses anything else. */
export const PLAN_FREQUENCIES = ['MONTHLY'] as const;
export const MANDATE_CANCELLED_BY = ['INVESTOR', 'EXTERNAL'] as const;
export const UPI_AUTOPAY_LIMIT_WIRE = '100000.00';

export const PLAN_AUDIT_ACTIONS = {
  SIP_CREATED: 'SIP_CREATED',
  SIP_SUBMITTED: 'SIP_SUBMITTED',
  SIP_ACTIVATED: 'SIP_ACTIVATED',
  MANDATE_APPROVED: 'MANDATE_APPROVED',
} as const;

export const mandates = appSchema.table(
  'mandates',
  {
    id: uuid('id').primaryKey().$defaultFn(() => newId('mandates')),
    ...stdColumns(),
    ...actorColumns(),
    investorId: uuid('investor_id').notNull(),
    bankAccountId: uuid('bank_account_id').notNull(),
    rail: text('rail', { enum: MANDATE_RAILS }).notNull(),
    limitAmount: numeric('limit_amount', { precision: 18, scale: 2, mode: 'string' }).notNull(),
    status: text('status', { enum: MANDATE_STATUSES }).notNull().default('CONSENT_PENDING'),
    consentChallengeId: uuid('consent_challenge_id'),
    /** FP's mandate id is an integer (research fp-api §4). */
    fpMandateId: bigint('fp_mandate_id', { mode: 'number' }),
    mandateRef: text('mandate_ref'),
    umrn: text('umrn'),
    fpStatus: text('fp_status'),
    upiUri: text('upi_uri'),
    approvedAt: tstz('approved_at'),
    rejectedReason: text('rejected_reason'),
    cancelledBy: text('cancelled_by', { enum: MANDATE_CANCELLED_BY }),
    finalAt: tstz('final_at'),
  },
  (t) => [
    check('mandates_rail_ck', inList('rail', MANDATE_RAILS)),
    check('mandates_status_ck', inList('status', MANDATE_STATUSES)),
    check(
      'mandates_limit_ck',
      sql`limit_amount IN (100000, 200000, 500000, 1000000, 2500000) AND (rail <> 'UPI_AUTOPAY' OR limit_amount = 100000)`,
    ),
    index('mandates_investor_idx').on(t.investorId, t.status),
  ],
);

export const plans = appSchema.table(
  'plans',
  {
    id: uuid('id').primaryKey().$defaultFn(() => newId('plans')),
    ...stdColumns(),
    ...actorColumns(),
    investorId: uuid('investor_id').notNull(),
    schemeId: uuid('scheme_id').notNull(),
    folioId: uuid('folio_id'),
    type: text('type', { enum: PLAN_TYPES }).notNull().default('SIP'),
    amount: numeric('amount', { precision: 18, scale: 2, mode: 'string' }).notNull(),
    frequency: text('frequency', { enum: PLAN_FREQUENCIES }).notNull().default('MONTHLY'),
    installmentDay: smallint('installment_day').notNull(),
    /** null = "until I cancel". */
    numberOfInstalments: integer('number_of_instalments'),
    firstInstalmentDateShown: date('first_instalment_date_shown', { mode: 'string' }).notNull(),
    firstInstalmentDate: date('first_instalment_date', { mode: 'string' }),
    nextInstalmentDate: date('next_instalment_date', { mode: 'string' }),
    mandateId: uuid('mandate_id')
      .notNull()
      .references(() => mandates.id, { onDelete: 'restrict' }),
    status: text('status', { enum: PLAN_STATUSES }).notNull().default('CONSENT_PENDING'),
    consentChallengeId: uuid('consent_challenge_id'),
    arn: text('arn').notNull(),
    initiatedVia: text('initiated_via', { enum: ORDER_INITIATED_VIA }).notNull(),
    userIp: inet('user_ip').notNull(),
    fpPlanId: text('fp_plan_id'),
    fpState: text('fp_state'),
    failureCode: text('failure_code'),
    finalAt: tstz('final_at'),
  },
  (t) => [
    check('plans_type_ck', inList('type', PLAN_TYPES)),
    check('plans_frequency_ck', inList('frequency', PLAN_FREQUENCIES)),
    check('plans_status_ck', inList('status', PLAN_STATUSES)),
    check('plans_installment_day_ck', sql`installment_day BETWEEN 1 AND 28`),
    check('plans_instalments_ck', sql`number_of_instalments IS NULL OR number_of_instalments BETWEEN 1 AND 360`),
    index('plans_investor_idx').on(t.investorId, t.status),
    index('plans_mandate_idx').on(t.mandateId, t.status),
  ],
);
```
Append to `apps/api/src/db/app-schema.ts`: `export * from '../modules/plans/plans.schema.js';`.

`apps/api/src/modules/orders/orders.schema.ts` (E20; add to the `orders` table's extra-config array, and add `uniqueIndex` to the `drizzle-orm/pg-core` import). NULLs are distinct, so one-time orders (`plan_id` NULL) are unaffected:
```ts
    uniqueIndex('orders_plan_fp_order_uq').on(t.planId, t.fpOrderId),
```

`apps/api/drizzle/0027_plans_mandates_guard.sql` (custom, after the generated `0026_plans_mandates`):
```sql
CREATE TRIGGER "trg_plans_consent_guard"
  BEFORE UPDATE OF status ON "app"."plans"
  FOR EACH ROW
  WHEN (NEW.status = 'SUBMITTING' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION "app"."trg_consent_guard"();
--> statement-breakpoint
CREATE TRIGGER "trg_mandates_consent_guard"
  BEFORE UPDATE OF status ON "app"."mandates"
  FOR EACH ROW
  WHEN (NEW.status = 'SUBMITTING' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION "app"."trg_consent_guard"();
```

`apps/api/src/modules/plans/fp-plan.ts`:
```ts
const text = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));

/** Typed view of D3's raw mf_purchase_plan (research fp-api §4, ONDC plan flow). */
export interface FpPlanView {
  id: string;
  state: string;
  sourceRefId: string | null;
  startDate: string | null;
  nextInstallmentDate: string | null;
  hasConsent: boolean;
}

export function toFpPlanView(raw: Record<string, unknown>): FpPlanView {
  return {
    id: String(raw.id),
    state: String(raw.state),
    sourceRefId: text(raw.source_ref_id),
    startDate: text(raw.start_date),
    nextInstallmentDate: text(raw.next_installment_date),
    hasConsent: raw.consent !== null && raw.consent !== undefined,
  };
}

/** PG mandate object: integer id, status CREATED | SUBMITTED | APPROVED | REJECTED | CANCELLED. */
export interface FpMandateView {
  id: number;
  status: string;
  mandateRef: string | null;
  umrn: string | null;
}

export function toFpMandateView(raw: Record<string, unknown>): FpMandateView {
  return {
    id: Number(String(raw.id)),
    status: String(raw.mandate_status ?? raw.status ?? '').toUpperCase(),
    mandateRef: text(raw.mandate_ref),
    umrn: text(raw.umrn),
  };
}

/** `POST /api/pg/payments/emandate/auth` with `upi.type='uri'` returns the UPI intent in `upi.uri`. */
export function upiUriOf(raw: Record<string, unknown>): string | null {
  const upi = raw.upi as { uri?: unknown } | null | undefined;
  return typeof upi?.uri === 'string' ? upi.uri : null;
}
```

`apps/api/src/modules/plans/plan-transitions.ts`:
```ts
import { canTransition, type MandateStatus, type PlanStatus } from '@sanchay/domain';
import { and, eq } from 'drizzle-orm';
import type { DbExecutor } from '../../db/client.js';
import { orderEvents } from '../orders/orders.schema.js';
import { AppError } from '../platform/errors.js';
import { mandates, plans } from './plans.schema.js';

/** Moves a plan along D5's PLAN machine and appends its order_events row; refuses an illegal edge. */
export async function movePlan(
  exec: DbExecutor,
  plan: { id: string; status: PlanStatus },
  to: PlanStatus,
  trigger: string,
  values: Partial<typeof plans.$inferInsert> = {},
): Promise<void> {
  if (!canTransition('PLAN', plan.status, to, trigger)) {
    throw new AppError('PLAN_STATE_INVALID', { message: `PLAN ${plan.status} -> ${to} (${trigger}) is not allowed` });
  }
  await exec.update(plans).set({ ...values, status: to }).where(eq(plans.id, plan.id));
  await exec.insert(orderEvents).values({ planId: plan.id, fromStatus: plan.status, toStatus: to, trigger });
}

export async function moveMandate(
  exec: DbExecutor,
  mandate: { id: string; status: MandateStatus },
  to: MandateStatus,
  trigger: string,
  values: Partial<typeof mandates.$inferInsert> = {},
): Promise<void> {
  if (!canTransition('MANDATE', mandate.status, to, trigger)) {
    throw new AppError('MANDATE_STATE_INVALID', { message: `MANDATE ${mandate.status} -> ${to} (${trigger}) is not allowed` });
  }
  await exec.update(mandates).set({ ...values, status: to }).where(eq(mandates.id, mandate.id));
  await exec.insert(orderEvents).values({ mandateId: mandate.id, fromStatus: mandate.status, toStatus: to, trigger });
}

/** Moves every plan still waiting (MANDATE_SETUP) on a mandate that will never be usable. */
export async function settleWaitingPlans(
  exec: DbExecutor,
  mandateId: string,
  to: 'FAILED' | 'CONSENT_EXPIRED',
  trigger: string,
  values: Partial<typeof plans.$inferInsert>,
): Promise<void> {
  const waiting = await exec
    .select({ id: plans.id, status: plans.status })
    .from(plans)
    .where(and(eq(plans.mandateId, mandateId), eq(plans.status, 'MANDATE_SETUP')));
  for (const plan of waiting) await movePlan(exec, plan, to, trigger, values);
}
```

`apps/api/src/modules/plans/sip-eligibility.ts`:
```ts
import { Money } from '@sanchay/money';
import type { SchemeThresholds } from '../catalogue/catalogue.schema.js';
import { AppError } from '../platform/errors.js';

/** Platform floor under every scheme's own SIP minimum. */
export const SIP_FLOOR = Money.parse('100.00');
/** UPI Autopay mandates are fixed at ₹1,00,000 (spec §4.3); one SIP can never exceed it. */
export const UPI_AUTOPAY_LIMIT = Money.parse('100000.00');
/** "Until I cancel" is sent to FP as no instalment count; a fixed count is capped here. */
export const MAX_INSTALMENTS = 360;

export interface SipScheme {
  sipMin: Money;
  sipMax: Money | null;
  sipMultiple: Money;
  sipDates: readonly number[];
}

const field = (path: string, code: string) => ({ fields: [{ path, code, message: code }] });

/** A scheme row (D8) as a SIP target; SCHEME_NOT_ORDERABLE when it cannot take a SIP. */
export function sipSchemeOf(row: {
  status: string;
  sipAllowed: boolean;
  sipDates: number[] | null;
  thresholds: SchemeThresholds | null;
}): SipScheme {
  if (row.status !== 'PUBLISHED' || !row.sipAllowed || row.thresholds === null || row.sipDates === null || row.sipDates.length === 0) {
    throw new AppError('SCHEME_NOT_ORDERABLE');
  }
  return {
    sipMin: Money.parse(row.thresholds.sipMin),
    sipMax: row.thresholds.sipMax === null ? null : Money.parse(row.thresholds.sipMax),
    sipMultiple: Money.parse(row.thresholds.sipMultiple),
    sipDates: row.sipDates,
  };
}

/** The checks that gate the SIP's P/M writes. F10's quote calls the same function so the two never drift. */
export function assertSipEligible(input: { scheme: SipScheme; amount: Money; installmentDay: number }): void {
  const { scheme, amount } = input;
  if (!scheme.sipDates.includes(input.installmentDay)) throw new AppError('SIP_DAY_INVALID', field('installmentDay', 'SIP_DAY_INVALID'));
  const minimum = scheme.sipMin.gt(SIP_FLOOR) ? scheme.sipMin : SIP_FLOOR;
  if (amount.lt(minimum)) throw new AppError('AMOUNT_BELOW_MIN', field('amount', 'AMOUNT_BELOW_MIN'));
  if (scheme.sipMax !== null && amount.gt(scheme.sipMax)) throw new AppError('AMOUNT_ABOVE_MAX', field('amount', 'AMOUNT_ABOVE_MAX'));
  if (!amount.isMultipleOf(scheme.sipMultiple)) throw new AppError('AMOUNT_NOT_MULTIPLE', field('amount', 'AMOUNT_NOT_MULTIPLE'));
  if (amount.gt(UPI_AUTOPAY_LIMIT)) throw new AppError('MANDATE_LIMIT_EXCEEDED', field('amount', 'MANDATE_LIMIT_EXCEEDED'));
}
```

`apps/api/src/modules/plans/sip.service.ts`:
```ts
import { Inject, Injectable } from '@nestjs/common';
import { type CutoffHolidays, firstInstalmentDate, type IsoDate, type PlanStatus, toIsoDate } from '@sanchay/domain';
import { Money } from '@sanchay/money';
import { and, asc, desc, eq, gt, gte, inArray, isNotNull, or, sql } from 'drizzle-orm';
import { AppConfig } from '../../config/app-config.js';
import { DB, type DbExecutor, type DbHandle } from '../../db/client.js';
import { marketHolidays, schemes } from '../catalogue/catalogue.schema.js';
import { investors } from '../identity/identity.schema.js';
import { CHALLENGE_EXPIRY_MS, ConsentEngine } from '../legal-consent/consent-engine.js';
import { bankAccounts } from '../onboarding/bank.schema.js';
import { type InitiatedVia, orderEvents } from '../orders/orders.schema.js';
import { AuditService } from '../platform/audit.service.js';
import { CLOCK, type Clock } from '../platform/clock.js';
import { AppError } from '../platform/errors.js';
import { newId } from '../platform/ids.js';
import { RuntimeConfig } from '../platform/runtime-config.js';
import { PLAN_AUDIT_ACTIONS, mandates, plans, UPI_AUTOPAY_LIMIT_WIRE } from './plans.schema.js';
import { assertSipEligible, sipSchemeOf } from './sip-eligibility.js';

export interface CreateSipInput {
  investorId: string;
  schemeId: string;
  amount: string;
  installmentDay: number;
  numberOfInstalments: number | null;
  userIp: string;
  initiatedVia: InitiatedVia;
}

export interface CreatedSip {
  planId: string;
  mandateId: string;
  challengeId: string;
  expiresAt: string;
  newMandate: boolean;
  firstInstalmentDate: string;
}

/** Plans whose amount counts against a mandate's limit. */
const HEADROOM_STATUSES: PlanStatus[] = ['CONSENTED', 'MANDATE_SETUP', 'SUBMITTING', 'UNDER_REVIEW', 'CONFIRMING', 'ACTIVE', 'RECONCILING', 'CANCEL_PENDING'];
const IST_OFFSET_MS = 330 * 60_000;

export const istToday = (now: Date): IsoDate => toIsoDate(new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10));

@Injectable()
export class SipService {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(ConsentEngine) private readonly consent: ConsentEngine,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async createSip(input: CreateSipInput): Promise<CreatedSip> {
    const db = this.dbh.db;
    if (!(await RuntimeConfig.get(db, 'plans.sip.enabled'))) throw new AppError('FEATURE_DISABLED');
    const [investor] = await db.select().from(investors).where(eq(investors.id, input.investorId));
    if (investor === undefined || !investor.canPurchase || investor.fpMfInvestmentAccountId === null) throw new AppError('PURCHASE_BLOCKED');
    const [scheme] = await db.select().from(schemes).where(eq(schemes.id, input.schemeId));
    if (scheme === undefined) throw new AppError('NOT_FOUND');
    const sip = sipSchemeOf(scheme);
    const amount = Money.parse(input.amount);
    assertSipEligible({ scheme: sip, amount, installmentDay: input.installmentDay });
    const [bank] = await db
      .select({ id: bankAccounts.id })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.investorId, input.investorId), eq(bankAccounts.status, 'VERIFIED'), isNotNull(bankAccounts.fpBankOldId)))
      .orderBy(desc(bankAccounts.isPrimary), desc(bankAccounts.createdAt))
      .limit(1);
    if (bank === undefined) throw new AppError('BANK_NOT_VERIFIED');

    const now = this.clock.now();
    const today = istToday(now);
    const shown = firstInstalmentDate({
      registeredOn: today,
      day: input.installmentDay,
      sipDates: sip.sipDates,
      holidays: await this.holidaysFrom(db, today),
    });

    return db.transaction(async (tx) => {
      // Serialises this investor's SIP drafts so two concurrent drafts cannot both claim the same headroom.
      await tx.select({ id: investors.id }).from(investors).where(eq(investors.id, input.investorId)).for('update');
      const reused = await this.mandateWithHeadroom(tx, input.investorId, amount, now);
      const newMandate = reused === null;
      const mandateId = reused ?? newId('mandates');
      if (newMandate) {
        await tx.insert(mandates).values({
          id: mandateId,
          createdBy: input.investorId,
          updatedBy: input.investorId,
          investorId: input.investorId,
          bankAccountId: bank.id,
          rail: 'UPI_AUTOPAY',
          limitAmount: UPI_AUTOPAY_LIMIT_WIRE,
        });
        await tx.insert(orderEvents).values({ mandateId, toStatus: 'CONSENT_PENDING', trigger: 'plans.createSip' });
      }
      const planId = newId('plans');
      await tx.insert(plans).values({
        id: planId,
        createdBy: input.investorId,
        updatedBy: input.investorId,
        investorId: input.investorId,
        schemeId: input.schemeId,
        amount: amount.toWire(),
        installmentDay: input.installmentDay,
        numberOfInstalments: input.numberOfInstalments,
        firstInstalmentDateShown: shown,
        mandateId,
        arn: this.config.env.SANCHAY_PLATFORM_ARN,
        initiatedVia: input.initiatedVia,
        userIp: input.userIp,
      });
      await tx.insert(orderEvents).values({ planId, toStatus: 'CONSENT_PENDING', trigger: 'plans.createSip' });
      await this.audit.record(tx, {
        action: PLAN_AUDIT_ACTIONS.SIP_CREATED,
        actorType: 'INVESTOR',
        actorId: input.investorId,
        entityType: 'plans',
        entityId: planId,
      });
      // One challenge covers the plan and, when needed, the new mandate; its subject type sets the saga
      // window (E4: MANDATE_REGISTRATION = 7 days, SIP_REGISTRATION = 60 minutes).
      const challenge = await this.consent.create(tx, {
        investorId: input.investorId,
        subjectType: newMandate ? 'MANDATE_REGISTRATION' : 'SIP_REGISTRATION',
        subjects: newMandate
          ? [
              { table: 'plans', id: planId },
              { table: 'mandates', id: mandateId },
            ]
          : [{ table: 'plans', id: planId }],
        templateKey: newMandate ? 'TPL_MANDATE_REGISTRATION' : 'TPL_SIP_REGISTRATION',
        folioId: null,
        amount: amount.toWire(),
        fields: {
          action: 'invest monthly',
          amount: amount.toWire(),
          schemeShort: scheme.name.slice(0, 30),
          schemeIsin: scheme.isin,
          installmentDay: String(input.installmentDay),
          firstInstalmentDate: shown,
          mandateLimit: UPI_AUTOPAY_LIMIT_WIRE,
        },
      });
      await tx.update(plans).set({ consentChallengeId: challenge.challengeId }).where(eq(plans.id, planId));
      if (newMandate) {
        await tx.update(mandates).set({ consentChallengeId: challenge.challengeId }).where(eq(mandates.id, mandateId));
      }
      return {
        planId,
        mandateId,
        challengeId: challenge.challengeId,
        expiresAt: challenge.expiresAt.toISOString(),
        newMandate,
        firstInstalmentDate: shown,
      };
    });
  }

  async get(investorId: string, planId: string) {
    const [row] = await this.dbh.db.select().from(plans).where(and(eq(plans.id, planId), eq(plans.investorId, investorId)));
    if (row === undefined) throw new AppError('NOT_FOUND');
    return row;
  }

  async list(investorId: string) {
    return this.dbh.db.select().from(plans).where(eq(plans.investorId, investorId)).orderBy(desc(plans.createdAt));
  }

  /** The investor's APPROVED UPI Autopay mandate with room for `amount`, oldest first; null when none. */
  private async mandateWithHeadroom(exec: DbExecutor, investorId: string, amount: Money, now: Date): Promise<string | null> {
    const approved = await exec
      .select({ id: mandates.id, limitAmount: mandates.limitAmount })
      .from(mandates)
      .where(and(eq(mandates.investorId, investorId), eq(mandates.rail, 'UPI_AUTOPAY'), eq(mandates.status, 'APPROVED')))
      .orderBy(asc(mandates.createdAt));
    // A CONSENT_PENDING draft holds headroom only while its challenge can still be approved.
    const freshSince = new Date(now.getTime() - CHALLENGE_EXPIRY_MS);
    for (const mandate of approved) {
      const [used] = await exec
        .select({ total: sql<string>`COALESCE(SUM(${plans.amount}), 0)::numeric(18,2)::text` })
        .from(plans)
        .where(
          and(
            eq(plans.mandateId, mandate.id),
            or(inArray(plans.status, HEADROOM_STATUSES), and(eq(plans.status, 'CONSENT_PENDING'), gt(plans.createdAt, freshSince))),
          ),
        );
      if (!Money.parse(used?.total ?? '0.00').add(amount).gt(Money.parse(mandate.limitAmount))) return mandate.id;
    }
    return null;
  }

  private async holidaysFrom(exec: DbExecutor, today: IsoDate): Promise<CutoffHolidays> {
    const rows = await exec.select({ day: marketHolidays.holidayDate }).from(marketHolidays).where(gte(marketHolidays.holidayDate, today));
    const days = new Set(rows.map((r) => r.day));
    return { has: (isoDate) => days.has(isoDate) };
  }
}
```

`apps/api/src/modules/plans/mandates.service.ts`:
```ts
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DB, type DbHandle } from '../../db/client.js';
import { AppError } from '../platform/errors.js';
import { Jobs } from '../platform/jobs/jobs.service.js';
import { mandates } from './plans.schema.js';

@Injectable()
export class MandatesService {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(Jobs) private readonly jobs: Jobs,
  ) {}

  async get(investorId: string, mandateId: string) {
    const [row] = await this.dbh.db.select().from(mandates).where(and(eq(mandates.id, mandateId), eq(mandates.investorId, investorId)));
    if (row === undefined) throw new AppError('NOT_FOUND');
    return row;
  }

  async list(investorId: string) {
    return this.dbh.db.select().from(mandates).where(eq(mandates.investorId, investorId)).orderBy(desc(mandates.createdAt));
  }

  /**
   * The investor abandoned the first UPI intent: re-mint it. The FP call is class M, so it runs in the
   * worker (mandates.submit, reauthorise) inside the same consent's 7-day saga, never on this request path.
   */
  async authorize(investorId: string, mandateId: string): Promise<{ ok: true }> {
    const row = await this.get(investorId, mandateId);
    if (row.status !== 'AUTH_PENDING' || row.consentChallengeId === null) throw new AppError('MANDATE_STATE_INVALID');
    await this.jobs.enqueue(
      this.dbh.db,
      'mandates.submit',
      { challengeId: row.consentChallengeId, subjectIds: [row.id], reauthorise: true },
      { singletonKey: `mandate-auth:${row.id}` },
    );
    return { ok: true };
  }
}
```

`apps/api/src/modules/plans/mandates-submit.job.ts`:
```ts
import { Inject, Injectable } from '@nestjs/common';
import type { MandateStatus } from '@sanchay/domain';
import { and, eq, inArray } from 'drizzle-orm';
import { DB, type DbHandle } from '../../db/client.js';
import { FpAmbiguousError, FpRejectedError } from '../../integrations/fp/fp-errors.js';
import { FpTransact } from '../../integrations/fp/fp-transact.js';
import { ConsentEngine } from '../legal-consent/consent-engine.js';
import { bankAccounts } from '../onboarding/bank.schema.js';
import { CLOCK, type Clock } from '../platform/clock.js';
import { AppError } from '../platform/errors.js';
import { type Job, JobHandler } from '../platform/jobs/job-registry.js';
import { ReconBreaks } from '../platform/runtime-config.js';
import { toFpMandateView, upiUriOf } from './fp-plan.js';
import { moveMandate, movePlan, settleWaitingPlans } from './plan-transitions.js';
import { mandates, plans } from './plans.schema.js';

/** `ConsentApprovedJobData` from approve (CONSENT_SUBJECT_JOBS.MANDATE_REGISTRATION), or a re-authorise from mandates.authorize. */
export interface MandateSubmitData {
  challengeId: string;
  subjectIds: string[];
  reauthorise?: boolean;
}

type MandateRow = typeof mandates.$inferSelect;

/**
 * Worker only. Registers the UPI Autopay mandate at PG and mints its UPI intent, inside useConsumed.
 * Resumable: a retry skips the create once `fp_mandate_id` is stored.
 */
@Injectable()
@JobHandler('mandates.submit')
export class MandatesSubmitJob {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(ConsentEngine) private readonly consent: ConsentEngine,
    @Inject(FpTransact) private readonly fp: FpTransact,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async handle(job: Job<'mandates.submit'>): Promise<void> {
    const { challengeId, subjectIds } = job.data as MandateSubmitData;
    const db = this.dbh.db;
    const [found] = await db
      .select()
      .from(mandates)
      .where(and(inArray(mandates.id, subjectIds), eq(mandates.consentChallengeId, challengeId)));
    if (found === undefined) return;
    let mandate: MandateRow = found;

    if (mandate.status === 'CONSENT_PENDING') {
      await db.transaction(async (tx) => {
        await moveMandate(tx, mandate, 'CONSENTED', 'approve');
        const drafts = await tx
          .select({ id: plans.id, status: plans.status })
          .from(plans)
          .where(and(eq(plans.mandateId, mandate.id), eq(plans.consentChallengeId, challengeId), eq(plans.status, 'CONSENT_PENDING')));
        for (const plan of drafts) {
          await movePlan(tx, plan, 'CONSENTED', 'approve');
          await movePlan(tx, { id: plan.id, status: 'CONSENTED' }, 'MANDATE_SETUP', 'new_mandate');
        }
      });
      mandate = { ...mandate, status: 'CONSENTED' };
    }
    if (!['CONSENTED', 'SUBMITTING', 'CREATED', 'AUTH_PENDING'].includes(mandate.status)) return;

    const [bank] = await db.select().from(bankAccounts).where(eq(bankAccounts.id, mandate.bankAccountId));
    const bankOldId = bank?.fpBankOldId ?? null;
    if (bankOldId === null) throw new AppError('INTERNAL', { message: 'mandate bank is not registered at FP' });
    const mandateType = mandate.rail === 'ENACH' ? 'E_MANDATE' : 'UPI';
    // FP takes the limit as a whole-rupee integer; every allowed limit (mandates_limit_ck) is one.
    const mandateLimit = Number.parseInt(mandate.limitAmount, 10);

    try {
      await this.consent.useConsumed(challengeId, async (consumed) => {
        let current = mandate;
        if (current.status === 'CONSENTED') {
          await moveMandate(db, current, 'SUBMITTING', 'job_submit');
          current = { ...current, status: 'SUBMITTING' };
        }
        if (current.status === 'SUBMITTING') {
          const created = toFpMandateView(
            await this.fp.createMandate({ bankAccountId: bankOldId, mandateType, mandateLimit }, consumed),
          );
          await moveMandate(db, current, 'CREATED', 'fp_mandate_created', {
            fpMandateId: created.id,
            mandateRef: created.mandateRef,
            fpStatus: created.status,
          });
          current = { ...current, status: 'CREATED', fpMandateId: created.id };
        }
        if (current.fpMandateId === null) return;
        const upiUri = upiUriOf(await this.fp.authoriseMandate({ mandateId: String(current.fpMandateId), mandateType }, consumed));
        if (current.status === 'CREATED') {
          await moveMandate(db, current, 'AUTH_PENDING', 'emandate_auth_created', { upiUri });
        } else {
          await db.update(mandates).set({ upiUri }).where(eq(mandates.id, current.id)); // re-authorise: same state, new intent
        }
      });
    } catch (err) {
      await this.onFailure(mandate.id, err);
    }
  }

  private async onFailure(mandateId: string, err: unknown): Promise<void> {
    const db = this.dbh.db;
    const now = this.clock.now();
    const [after] = await db.select().from(mandates).where(eq(mandates.id, mandateId));
    const status = after?.status as MandateStatus | undefined;
    if (after === undefined) throw err;
    if (err instanceof AppError && err.code === 'CONSENT_EXPIRED' && status === 'CONSENTED') {
      await db.transaction(async (tx) => {
        await moveMandate(tx, after, 'CONSENT_EXPIRED', 'execute_before_missed', { finalAt: now });
        await settleWaitingPlans(tx, after.id, 'CONSENT_EXPIRED', 'seven_day_saga_no_plan_write', { finalAt: now });
      });
      return;
    }
    if (status === 'SUBMITTING' && err instanceof FpRejectedError) {
      await db.transaction(async (tx) => {
        await moveMandate(tx, after, 'REJECTED', 'live_check_failed', { rejectedReason: err.providerCode ?? `HTTP_${err.httpStatus}`, finalAt: now });
        await settleWaitingPlans(tx, after.id, 'FAILED', 'mandate_rejected_or_expired', { failureCode: 'MANDATE_REJECTED', finalAt: now });
      });
      return;
    }
    if (status === 'SUBMITTING' && (err instanceof FpAmbiguousError || !(err instanceof AppError))) {
      // D3 has no FP mandate list-by-bank read, so a lost create response cannot be adopted automatically.
      await db.transaction(async (tx) => {
        await moveMandate(tx, after, 'RECONCILING', 'ambiguous');
        await ReconBreaks.open(tx, {
          kind: 'MANDATE_CREATE_AMBIGUOUS',
          entityType: 'mandates',
          entityId: after.id,
          severity: 'CRITICAL',
          detail: { bankAccountId: after.bankAccountId },
        });
      });
      return;
    }
    throw err;
  }
}
```

`apps/api/src/modules/plans/mandates-poll.job.ts`:
```ts
import { Inject, Injectable } from '@nestjs/common';
import type { MandateStatus } from '@sanchay/domain';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { DB, type DbExecutor, type DbHandle } from '../../db/client.js';
import { FpRead } from '../../integrations/fp/fp-read.js';
import { consentRecords } from '../legal-consent/legal-consent.schema.js';
import { Notify } from '../notifications/notify.service.js';
import { AuditService } from '../platform/audit.service.js';
import { CLOCK, type Clock } from '../platform/clock.js';
import { type Job, JobHandler } from '../platform/jobs/job-registry.js';
import { Jobs } from '../platform/jobs/jobs.service.js';
import { toFpMandateView } from './fp-plan.js';
import { moveMandate, movePlan, settleWaitingPlans } from './plan-transitions.js';
import { mandates, PLAN_AUDIT_ACTIONS, plans } from './plans.schema.js';

export interface MandatesPollData {
  scope: 'PENDING' | 'APPROVED';
}

type MandateRow = typeof mandates.$inferSelect;

/**
 * Worker only. PENDING (every 10 min): steps AUTH_PENDING/BANK_PENDING mandates along D5's MANDATE machine
 * and starts the waiting SIPs on approval. APPROVED (daily 07:30): catches a cancel made at the bank.
 */
@Injectable()
@JobHandler('mandates.poll')
export class MandatesPollJob {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(FpRead) private readonly fpRead: FpRead,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(Notify) private readonly notify: Notify,
    @Inject(Jobs) private readonly jobs: Jobs,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async handle(job: Job<'mandates.poll'>): Promise<void> {
    const { scope } = job.data as MandatesPollData;
    const statuses: MandateStatus[] = scope === 'APPROVED' ? ['APPROVED'] : ['AUTH_PENDING', 'BANK_PENDING'];
    const rows = await this.dbh.db
      .select()
      .from(mandates)
      .where(and(inArray(mandates.status, statuses), isNotNull(mandates.fpMandateId)));
    for (const mandate of rows) await this.pollOne(mandate);
  }

  private async pollOne(mandate: MandateRow): Promise<void> {
    const db = this.dbh.db;
    const now = this.clock.now();
    const fp = toFpMandateView(await this.fpRead.mandate(String(mandate.fpMandateId)));
    // Expire only what the bank has not decided: an approval that lands late keeps the mandate (reusable),
    // and plans.sip.submit then settles the plan as CONSENT_EXPIRED when useConsumed refuses.
    const undecided = fp.status === 'CREATED' || fp.status === 'SUBMITTED';
    if (mandate.status !== 'APPROVED' && undecided && (await this.sagaLapsed(mandate, now))) {
      await db.transaction(async (tx) => {
        await moveMandate(tx, mandate, 'EXPIRED', 'seven_day_no_approval', { fpStatus: fp.status, finalAt: now });
        await settleWaitingPlans(tx, mandate.id, 'CONSENT_EXPIRED', 'seven_day_saga_no_plan_write', { finalAt: now });
      });
      return;
    }
    if (fp.status === mandate.fpStatus && fp.status !== 'CANCELLED') return;

    await db.transaction(async (tx) => {
      if (mandate.status === 'APPROVED') {
        if (fp.status === 'CANCELLED') await this.revoke(tx, mandate, now);
        return;
      }
      let current = mandate;
      const step = async (to: MandateStatus, trigger: string, values: Partial<typeof mandates.$inferInsert> = {}) => {
        await moveMandate(tx, current, to, trigger, { fpStatus: fp.status, ...values });
        current = { ...current, status: to };
      };
      if (fp.status === 'CREATED') return;
      if (current.status === 'AUTH_PENDING') await step('BANK_PENDING', 'fp_submitted');
      if (fp.status === 'APPROVED') {
        await step('APPROVED', 'fp_approved', { approvedAt: now, umrn: fp.umrn });
        await this.audit.record(tx, { action: PLAN_AUDIT_ACTIONS.MANDATE_APPROVED, actorType: 'SYSTEM', entityType: 'mandates', entityId: mandate.id });
        const waiting = await tx
          .select({ id: plans.id, challengeId: plans.consentChallengeId })
          .from(plans)
          .where(and(eq(plans.mandateId, mandate.id), eq(plans.status, 'MANDATE_SETUP')));
        for (const plan of waiting) {
          if (plan.challengeId === null) continue;
          await this.jobs.enqueue(tx, 'plans.sip.submit', { challengeId: plan.challengeId, subjectIds: [plan.id] }, { singletonKey: plan.id });
        }
      } else if (fp.status === 'REJECTED' || fp.status === 'CANCELLED') {
        await step('REJECTED', 'fp_rejected', { rejectedReason: fp.status, finalAt: now });
        await settleWaitingPlans(tx, mandate.id, 'FAILED', 'mandate_rejected_or_expired', { failureCode: 'MANDATE_REJECTED', finalAt: now });
      }
    });
  }

  /** A cancel this app did not make: every ACTIVE SIP on the mandate stops (recovery is P2, spec §4.3). */
  private async revoke(tx: DbExecutor, mandate: MandateRow, now: Date): Promise<void> {
    await moveMandate(tx, mandate, 'CANCELLED', 'investor_or_fp_cancel', { fpStatus: 'CANCELLED', cancelledBy: 'EXTERNAL', finalAt: now });
    const active = await tx
      .select({ id: plans.id, status: plans.status })
      .from(plans)
      .where(and(eq(plans.mandateId, mandate.id), eq(plans.status, 'ACTIVE')));
    for (const plan of active) await movePlan(tx, plan, 'MANDATE_REVOKED', 'fp_mandate_cancelled_external', { finalAt: now });
    await this.notify.enqueue(tx, 'MANDATE_REVOKED', { investorId: mandate.investorId, data: {}, dedupeKey: `mandate-revoked:${mandate.id}` });
  }

  private async sagaLapsed(mandate: MandateRow, now: Date): Promise<boolean> {
    if (mandate.consentChallengeId === null) return false;
    const [record] = await this.dbh.db
      .select({ sagaExpiresAt: consentRecords.sagaExpiresAt })
      .from(consentRecords)
      .where(eq(consentRecords.challengeId, mandate.consentChallengeId))
      .limit(1);
    return record?.sagaExpiresAt != null && now.getTime() > record.sagaExpiresAt.getTime();
  }
}
```

`apps/api/src/modules/plans/sip-submit.job.ts`:
```ts
import { Inject, Injectable } from '@nestjs/common';
import type { PlanStatus } from '@sanchay/domain';
import { and, eq, inArray } from 'drizzle-orm';
import { DB, type DbHandle } from '../../db/client.js';
import { FpAmbiguousError, FpRejectedError } from '../../integrations/fp/fp-errors.js';
import { FpTransact } from '../../integrations/fp/fp-transact.js';
import { schemes } from '../catalogue/catalogue.schema.js';
import { investors } from '../identity/identity.schema.js';
import { ConsentEngine } from '../legal-consent/consent-engine.js';
import { AuditService } from '../platform/audit.service.js';
import { CLOCK, type Clock } from '../platform/clock.js';
import { AppError } from '../platform/errors.js';
import { type Job, JobHandler } from '../platform/jobs/job-registry.js';
import { Jobs } from '../platform/jobs/jobs.service.js';
import { toFpPlanView } from './fp-plan.js';
import { movePlan } from './plan-transitions.js';
import { mandates, PLAN_AUDIT_ACTIONS, plans } from './plans.schema.js';

/** From approve (CONSENT_SUBJECT_JOBS.SIP_REGISTRATION, a reused mandate) or from mandates.poll on approval. */
export interface SipSubmitData {
  challengeId: string;
  subjectIds: string[];
}

const ADVANCE_POLL_SECONDS = 30;

/** Worker only. POSTs the ONDC purchase plan inside useConsumed once its mandate is APPROVED. */
@Injectable()
@JobHandler('plans.sip.submit')
export class SipSubmitJob {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(ConsentEngine) private readonly consent: ConsentEngine,
    @Inject(FpTransact) private readonly fp: FpTransact,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(Jobs) private readonly jobs: Jobs,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async handle(job: Job<'plans.sip.submit'>): Promise<void> {
    const { challengeId, subjectIds } = job.data as SipSubmitData;
    const db = this.dbh.db;
    let [plan] = await db
      .select()
      .from(plans)
      .where(and(inArray(plans.id, subjectIds), eq(plans.consentChallengeId, challengeId)));
    if (plan === undefined) return;
    if (plan.status === 'CONSENT_PENDING') {
      await movePlan(db, plan, 'CONSENTED', 'approve');
      plan = { ...plan, status: 'CONSENTED' as PlanStatus };
    }
    if (plan.status !== 'CONSENTED' && plan.status !== 'MANDATE_SETUP') return; // already submitted or settled

    const [mandate] = await db.select().from(mandates).where(eq(mandates.id, plan.mandateId));
    const fpMandateId = mandate?.status === 'APPROVED' ? mandate.fpMandateId : null;
    if (fpMandateId === null) {
      throw new AppError('MANDATE_STATE_INVALID', { message: 'plans.sip.submit needs an APPROVED mandate' });
    }
    const [investor] = await db.select().from(investors).where(eq(investors.id, plan.investorId));
    const [scheme] = await db.select().from(schemes).where(eq(schemes.id, plan.schemeId));
    const mfia = investor?.fpMfInvestmentAccountId ?? null;
    if (scheme === undefined || mfia === null) throw new AppError('INTERNAL', { message: 'plan has no scheme or FP investment account' });

    const current = plan;
    const trigger = current.status === 'CONSENTED' ? 'mandate_reused_with_headroom' : 'mandate_approved';
    let raw: Record<string, unknown>;
    try {
      raw = await this.consent.useConsumed(challengeId, async (consumed) => {
        await movePlan(db, current, 'SUBMITTING', trigger);
        // FP refuses gateway, initiated_via and start_date on plans; partner/euin are never sent (H-11).
        return this.fp.createPurchasePlan(
          {
            mf_investment_account: mfia,
            scheme: scheme.isin,
            frequency: 'monthly',
            installment_day: current.installmentDay,
            ...(current.numberOfInstalments === null ? {} : { number_of_installments: current.numberOfInstalments }),
            amount: current.amount,
            systematic: true,
            payment_method: 'mandate',
            payment_source: String(fpMandateId),
            source_ref_id: current.id,
            user_ip: current.userIp,
            initiated_by: 'investor',
          },
          consumed,
        );
      });
    } catch (err) {
      await this.onFailure(current.id, challengeId, err);
      return;
    }

    const view = toFpPlanView(raw);
    await db.transaction(async (tx) => {
      await movePlan(tx, { id: current.id, status: 'SUBMITTING' }, 'UNDER_REVIEW', 'fp_created', { fpPlanId: view.id, fpState: view.state });
      await this.audit.record(tx, { action: PLAN_AUDIT_ACTIONS.SIP_SUBMITTED, actorType: 'SYSTEM', entityType: 'plans', entityId: current.id });
      await this.jobs.enqueue(tx, 'plans.sip.advance', { planId: current.id, challengeId }, { startAfter: ADVANCE_POLL_SECONDS, singletonKey: current.id });
    });
  }

  private async onFailure(planId: string, challengeId: string, err: unknown): Promise<void> {
    const db = this.dbh.db;
    const now = this.clock.now();
    const [after] = await db.select().from(plans).where(eq(plans.id, planId));
    if (after === undefined) throw err;
    if (err instanceof AppError && err.code === 'CONSENT_EXPIRED' && after.status === 'CONSENTED') {
      await movePlan(db, after, 'CONSENT_EXPIRED', 'execute_before_missed', { finalAt: now });
      return;
    }
    if (err instanceof AppError && err.code === 'CONSENT_EXPIRED' && after.status === 'MANDATE_SETUP') {
      await movePlan(db, after, 'CONSENT_EXPIRED', 'seven_day_saga_no_plan_write', { finalAt: now });
      return;
    }
    if (after.status === 'SUBMITTING' && err instanceof FpRejectedError) {
      await movePlan(db, after, 'REJECTED', 'live_check_failed', { failureCode: err.providerCode ?? `HTTP_${err.httpStatus}`, finalAt: now });
      return;
    }
    if (after.status === 'SUBMITTING' && (err instanceof FpAmbiguousError || !(err instanceof AppError))) {
      await db.transaction(async (tx) => {
        await movePlan(tx, after, 'RECONCILING', 'ambiguous');
        // plans.sip.advance adopts it by source_ref_id (= plan id).
        await this.jobs.enqueue(tx, 'plans.sip.advance', { planId, challengeId }, { startAfter: ADVANCE_POLL_SECONDS, singletonKey: planId });
      });
      return;
    }
    throw err;
  }
}
```

`apps/api/src/modules/plans/sip-advance.job.ts`:
```ts
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DB, type DbHandle } from '../../db/client.js';
import { FpRejectedError } from '../../integrations/fp/fp-errors.js';
import { FpRead } from '../../integrations/fp/fp-read.js';
import { FpTransact } from '../../integrations/fp/fp-transact.js';
import { schemes } from '../catalogue/catalogue.schema.js';
import { investors } from '../identity/identity.schema.js';
import { InvestorAccounts } from '../identity/investor-accounts.service.js';
import { ConsentEngine } from '../legal-consent/consent-engine.js';
import { Notify } from '../notifications/notify.service.js';
import { orderEvents } from '../orders/orders.schema.js';
import { AuditService } from '../platform/audit.service.js';
import { CLOCK, type Clock, MINUTE } from '../platform/clock.js';
import { AppError } from '../platform/errors.js';
import { type Job, JobHandler } from '../platform/jobs/job-registry.js';
import { Jobs } from '../platform/jobs/jobs.service.js';
import { type FpPlanView, toFpPlanView } from './fp-plan.js';
import { movePlan } from './plan-transitions.js';
import { PLAN_AUDIT_ACTIONS, plans } from './plans.schema.js';

export interface SipAdvanceData {
  planId: string;
  challengeId: string;
}

type PlanRow = typeof plans.$inferSelect;
const POLL_SECONDS = 60;

/**
 * Worker only. Drives a submitted plan through FP review, the consent + confirm PATCH, and activation;
 * also adopts a RECONCILING plan by source_ref_id. Re-enqueues itself while FP is working.
 */
@Injectable()
@JobHandler('plans.sip.advance')
export class SipAdvanceJob {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(ConsentEngine) private readonly consent: ConsentEngine,
    @Inject(FpRead) private readonly fpRead: FpRead,
    @Inject(FpTransact) private readonly fp: FpTransact,
    @Inject(InvestorAccounts) private readonly accounts: InvestorAccounts,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(Notify) private readonly notify: Notify,
    @Inject(Jobs) private readonly jobs: Jobs,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async handle(job: Job<'plans.sip.advance'>): Promise<void> {
    const { planId, challengeId } = job.data as SipAdvanceData;
    const db = this.dbh.db;
    const [plan] = await db.select().from(plans).where(eq(plans.id, planId));
    if (plan === undefined) return;
    if (plan.status === 'RECONCILING' && plan.fpPlanId === null) return this.adopt(plan, challengeId);
    if ((plan.status !== 'UNDER_REVIEW' && plan.status !== 'CONFIRMING') || plan.fpPlanId === null) return;

    const view = toFpPlanView(await this.fpRead.purchasePlan(plan.fpPlanId));
    const now = this.clock.now();
    if (view.state === 'failed' || view.state === 'cancelled') {
      const trigger = plan.status === 'UNDER_REVIEW' ? 'fp_review_failed' : 'fp_confirm_rejected';
      await movePlan(db, plan, 'REJECTED', trigger, { fpState: view.state, finalAt: now });
      return;
    }
    if (plan.status === 'CONFIRMING' && view.state === 'active') {
      await this.activate(plan, view);
      return;
    }
    // UNDER_REVIEW at review_completed, or a CONFIRMING plan whose confirm PATCH never landed.
    if (view.state === 'review_completed') {
      try {
        await this.consent.useConsumed(challengeId, async (consumed) => {
          if (plan.status === 'UNDER_REVIEW') await movePlan(db, plan, 'CONFIRMING', 'fp_review_completed', { fpState: view.state });
          await this.fp.updatePurchasePlan({ id: view.id, consent: await this.contacts(plan.investorId), state: 'confirmed' }, consumed);
        });
      } catch (err) {
        const [after] = await db.select().from(plans).where(eq(plans.id, planId));
        if (err instanceof AppError && err.code === 'CONSENT_EXPIRED' && after?.status === 'UNDER_REVIEW') {
          await movePlan(db, after, 'CONSENT_EXPIRED', 'saga_expired_under_review', { finalAt: now });
          return;
        }
        if (err instanceof FpRejectedError && after?.status === 'CONFIRMING') {
          await movePlan(db, after, 'REJECTED', 'fp_confirm_rejected', { failureCode: err.providerCode ?? `HTTP_${err.httpStatus}`, finalAt: now });
          return;
        }
        throw err;
      }
    }
    await this.jobs.enqueue(db, 'plans.sip.advance', { planId, challengeId }, { startAfter: POLL_SECONDS, singletonKey: planId });
  }

  private async activate(plan: PlanRow, view: FpPlanView): Promise<void> {
    const firstInstalmentDate = view.startDate ?? plan.firstInstalmentDateShown;
    const [scheme] = await this.dbh.db.select({ name: schemes.name }).from(schemes).where(eq(schemes.id, plan.schemeId));
    await this.dbh.db.transaction(async (tx) => {
      await movePlan(tx, plan, 'ACTIVE', 'fp_submitted_active', {
        fpState: view.state,
        firstInstalmentDate,
        nextInstalmentDate: view.nextInstallmentDate ?? firstInstalmentDate,
      });
      await this.audit.record(tx, { action: PLAN_AUDIT_ACTIONS.SIP_ACTIVATED, actorType: 'SYSTEM', entityType: 'plans', entityId: plan.id });
      await this.notify.enqueue(tx, 'SIP_ACTIVE', {
        investorId: plan.investorId,
        data: { schemeName: scheme?.name ?? '', firstInstalmentDate },
        dedupeKey: `sip-active:${plan.id}`,
      });
    });
  }

  /** LOOKUP-ADOPT by source_ref_id; absent 10 minutes after entering RECONCILING -> FAILED. */
  private async adopt(plan: PlanRow, challengeId: string): Promise<void> {
    const db = this.dbh.db;
    const [investor] = await db.select().from(investors).where(eq(investors.id, plan.investorId));
    const mfia = investor?.fpMfInvestmentAccountId ?? null;
    if (mfia === null) throw new AppError('INTERNAL', { message: 'plan investor has no FP investment account' });
    const { items } = await this.fpRead.purchasePlans({ mfInvestmentAccount: mfia });
    const found = items.map(toFpPlanView).find((p) => p.sourceRefId === plan.id);
    if (found !== undefined) {
      await movePlan(db, plan, 'UNDER_REVIEW', 'lookup_adopt_mapped', { fpPlanId: found.id, fpState: found.state });
    } else {
      const [entered] = await db
        .select({ at: orderEvents.occurredAt })
        .from(orderEvents)
        .where(and(eq(orderEvents.planId, plan.id), eq(orderEvents.toStatus, 'RECONCILING')))
        .orderBy(desc(orderEvents.occurredAt))
        .limit(1);
      const now = this.clock.now();
      if (entered !== undefined && now.getTime() - entered.at.getTime() >= 10 * MINUTE) {
        await movePlan(db, plan, 'FAILED', 'provider_object_absent', { failureCode: 'PROVIDER_OBJECT_ABSENT', finalAt: now });
        return;
      }
    }
    await this.jobs.enqueue(db, 'plans.sip.advance', { planId: plan.id, challengeId }, { startAfter: POLL_SECONDS, singletonKey: plan.id });
  }

  /** The contacts the consent OTP went to (research fp-api §2 consent object). */
  private async contacts(investorId: string): Promise<Record<string, string>> {
    const [investor] = await this.dbh.db.select().from(investors).where(eq(investors.id, investorId));
    if (investor === undefined) throw new AppError('NOT_FOUND');
    const mobile = this.accounts.decryptMobile(investor).replace(/^\+?91/, '');
    const email = this.accounts.decryptEmail(investor);
    return { isd_code: '91', mobile, ...(email === null ? {} : { email }) };
  }
}
```

`apps/api/src/modules/plans/instalments-sync.job.ts`:
```ts
import { Inject, Injectable } from '@nestjs/common';
import { type FpOrderState, fpStateToOrderStatus, type OrderStatus } from '@sanchay/domain';
import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { DB, type DbHandle } from '../../db/client.js';
import { FpRead } from '../../integrations/fp/fp-read.js';
import { schemes } from '../catalogue/catalogue.schema.js';
import { Notify } from '../notifications/notify.service.js';
import { toFpPurchaseView } from '../orders/fp-purchase.js';
import { orderEvents, orders } from '../orders/orders.schema.js';
import { newId } from '../platform/ids.js';
import { type Job, JobHandler } from '../platform/jobs/job-registry.js';
import { mandates, plans } from './plans.schema.js';

type PlanRow = typeof plans.$inferSelect;
const FP_ORDER_STATES = new Set(['under_review', 'pending', 'submitted', 'successful', 'failed', 'expired', 'reversed']);
const MISSED: ReadonlySet<OrderStatus> = new Set<OrderStatus>(['FAILED', 'EXPIRED']);

/**
 * Worker only, 08:30 and 20:30 IST. Mirrors each ACTIVE plan's FP instalments (mf_purchases with
 * `plan` set) into orders(origin='SIP_INSTALMENT'). FP creates and moves these orders; nothing here
 * writes to FP, so no consent applies (SEBI-2FA-S) and statuses are copied, not stepped via moveOrder.
 */
@Injectable()
@JobHandler('plans.instalments.sync')
export class InstalmentsSyncJob {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(FpRead) private readonly fpRead: FpRead,
    @Inject(Notify) private readonly notify: Notify,
  ) {}

  async handle(_job: Job<'plans.instalments.sync'>): Promise<void> {
    const active = await this.dbh.db
      .select()
      .from(plans)
      .where(and(eq(plans.status, 'ACTIVE'), isNotNull(plans.fpPlanId)));
    for (const plan of active) await this.syncPlan(plan);
  }

  private async syncPlan(plan: PlanRow): Promise<void> {
    const db = this.dbh.db;
    const [mandate] = await db.select({ bankAccountId: mandates.bankAccountId }).from(mandates).where(eq(mandates.id, plan.mandateId));
    if (mandate === undefined) return;
    const { items } = await this.fpRead.purchases({ plan: plan.fpPlanId as string });
    for (const raw of items) {
      const fp = toFpPurchaseView(raw);
      if (!FP_ORDER_STATES.has(fp.state)) continue;
      const status = fpStateToOrderStatus(fp.state as FpOrderState, { unitsAllotted: fp.allottedUnits !== null });
      const mirrored = {
        fpState: fp.state,
        allottedUnits: fp.allottedUnits,
        purchasedAmount: fp.purchasedAmount,
        allottedNavDate: fp.allottedNavDate,
        failureCode: fp.failureCode,
      };
      await db.transaction(async (tx) => {
        const [existing] = await tx
          .select({ id: orders.id, status: orders.status, fpState: orders.fpState })
          .from(orders)
          .where(and(eq(orders.planId, plan.id), eq(orders.fpOrderId, fp.id)));
        if (existing === undefined) {
          const orderId = newId('orders');
          await tx.insert(orders).values({
            id: orderId,
            createdBy: plan.investorId,
            updatedBy: plan.investorId,
            investorId: plan.investorId,
            type: 'PURCHASE',
            origin: 'SIP_INSTALMENT',
            planId: plan.id,
            schemeId: plan.schemeId,
            folioId: plan.folioId,
            amount: plan.amount,
            status,
            bankAccountId: mandate.bankAccountId,
            arn: plan.arn,
            initiatedVia: plan.initiatedVia,
            userIp: plan.userIp,
            fpOrderId: fp.id,
            fpOldId: fp.oldId,
            ...mirrored,
          });
          await tx.insert(orderEvents).values({ orderId, planId: plan.id, toStatus: status, trigger: 'fp_instalment_sync' });
          return;
        }
        if (existing.status === status && existing.fpState === fp.state) return;
        await tx.update(orders).set({ ...mirrored, status }).where(eq(orders.id, existing.id));
        if (existing.status !== status) {
          await tx.insert(orderEvents).values({ orderId: existing.id, planId: plan.id, fromStatus: existing.status, toStatus: status, trigger: 'fp_instalment_sync' });
        }
      });
    }
    await this.warnOnMisses(plan);
  }

  /** Two consecutive FAILED/EXPIRED instalments -> one warning per miss streak (keyed by the streak's first miss). */
  private async warnOnMisses(plan: PlanRow): Promise<void> {
    const recent = await this.dbh.db
      .select({ id: orders.id, status: orders.status })
      .from(orders)
      .where(and(eq(orders.planId, plan.id), eq(orders.origin, 'SIP_INSTALMENT')))
      .orderBy(desc(orders.fpOldId))
      .limit(12);
    const streak: typeof recent = [];
    for (const order of recent) {
      if (!MISSED.has(order.status)) break;
      streak.push(order);
    }
    const streakStart = streak.at(-1);
    if (streak.length < 2 || streakStart === undefined) return;
    const [scheme] = await this.dbh.db.select({ name: schemes.name }).from(schemes).where(eq(schemes.id, plan.schemeId));
    await this.notify.enqueue(this.dbh.db, 'SIP_INSTALMENT_MISSED_WARNING', {
      investorId: plan.investorId,
      data: { schemeName: scheme?.name ?? '' },
      dedupeKey: `sip-missed:${plan.id}:${streakStart.id}`,
    });
  }
}
```

`apps/api/src/integrations/fp/fp-transact.ts` (replace the four stubs):
```ts
  async createPurchasePlan(input: Record<string, unknown>, consent: ConsumedConsent): Promise<Record<string, unknown>> {
    const result = await this.transport.call('purchasePlan.create', {
      body: input,
      consent,
      aggregate: { type: 'plans', id: String(input.source_ref_id) },
    });
    return (result.body ?? {}) as Record<string, unknown>;
  }

  /** ONDC plan confirm: `{id, consent, state:'confirmed'}` (research fp-api §4). */
  async updatePurchasePlan(input: { id: string } & Record<string, unknown>, consent: ConsumedConsent): Promise<Record<string, unknown>> {
    const result = await this.transport.call('purchasePlan.update', { body: input, consent });
    return (result.body ?? {}) as Record<string, unknown>;
  }

  async createMandate(
    input: { bankAccountId: number; mandateType: 'UPI' | 'E_MANDATE'; mandateLimit: number },
    consent: ConsumedConsent,
  ): Promise<Record<string, unknown>> {
    const body = {
      mandate_type: input.mandateType,
      bank_account_id: input.bankAccountId,
      mandate_limit: input.mandateLimit,
      provider_name: 'CYBRILLAPOA',
    };
    const result = await this.transport.call('mandate.create', { body, consent });
    return (result.body ?? {}) as Record<string, unknown>;
  }

  /**
   * UPI returns the intent in `upi.uri`; E_MANDATE (F3) returns a bank `token_url`. No postback URL: the
   * app polls `mandates.poll`.
   */
  async authoriseMandate(
    input: { mandateId: string; mandateType: 'UPI' | 'E_MANDATE' },
    consent: ConsumedConsent,
  ): Promise<Record<string, unknown>> {
    const result = await this.transport.call('mandateAuth.create', {
      body: { mandate_id: Number(input.mandateId), ...(input.mandateType === 'UPI' ? { upi: { type: 'uri' } } : {}) },
      consent,
    });
    return (result.body ?? {}) as Record<string, unknown>;
  }
```

`apps/api/src/integrations/fp/fake/fake-fp.state.ts` (D4; key-level edits):
- `StoredPurchase`: add `plan: string | null;`.
- `StoredMandate`: `status` becomes mutable (it already is), and add `readonly raw: Record<string, unknown>;`.
- Add the plan store:
```ts
export interface StoredPurchasePlan {
  readonly id: string;
  readonly oldId: number;
  state: string;
  readonly sourceRefId: string;
  readonly mfInvestmentAccount: string;
  readonly paymentSource: string;
  consent: Record<string, unknown> | null;
  startDate: string | null;
  nextInstallmentDate: string | null;
  /** The create body exactly as received, for payload assertions. */
  readonly raw: Record<string, unknown>;
}
```
and in `FakeFpState`: `readonly purchasePlans = new Map<string, StoredPurchasePlan>();`.

`apps/api/src/integrations/fp/fake/fake-fp.ts` (D4; key-level edits):
- `purchasePayload`: add `plan: p.plan,`. The `purchase.create` case sets `plan: null`, and `mandate.create` stores `raw: body`.
- Replace the `purchase.list` case:
```ts
      case 'purchase.list': {
        const sourceRefId = query.get('source_ref_id');
        const plan = query.get('plan');
        const bySource = sourceRefId === null ? [...this.state.purchases.values()] : this.state.findPurchasesBySourceRefId(sourceRefId);
        const items = plan === null ? bySource : bySource.filter((p) => p.plan === plan);
        return { statusCode: 200, data: { object: 'list', data: items.map(purchasePayload) } };
      }
```
- Add the cases below before `default`, the `planPayload`/`mandatePayload` helpers beside `purchasePayload`, and the three test helpers beside `advance`:
```ts
function planPayload(p: StoredPurchasePlan): Record<string, unknown> {
  return {
    ...p.raw,
    object: 'mf_purchase_plan',
    id: p.id,
    old_id: p.oldId,
    state: p.state,
    consent: p.consent,
    start_date: p.startDate,
    next_installment_date: p.nextInstallmentDate,
  };
}

function mandatePayload(m: StoredMandate): Record<string, unknown> {
  return { id: m.id, mandate_ref: m.mandateRef, mandate_status: m.status, umrn: m.status === 'APPROVED' ? `UMRN${m.id}` : null };
}

const fpError = (statusCode: number, code: string, message: string): FakeReply => ({
  statusCode,
  data: { error: { status: statusCode, code, message } },
});
```
```ts
      case 'mandate.get': {
        const mandate = this.state.mandates.get(Number(params.id));
        return mandate === undefined ? fpError(404, 'NOT_FOUND', `mandate ${params.id} not found`) : { statusCode: 200, data: mandatePayload(mandate) };
      }
      case 'mandateAuth.create': {
        const mandate = this.state.mandates.get(Number(body.mandate_id));
        if (mandate === undefined) return fpError(404, 'NOT_FOUND', `mandate ${String(body.mandate_id)} not found`);
        if (mandate.status !== 'CREATED') return fpError(400, 'INVALID_STATE', 'mandate is not awaiting authorisation');
        if (!Object.hasOwn(body, 'upi')) {
          return { statusCode: 200, data: { mandate_id: mandate.id, token_url: `https://pg.fake.local/emandate/${mandate.mandateRef}` } };
        }
        return { statusCode: 200, data: { mandate_id: mandate.id, upi: { type: 'uri', uri: `upi://mandate?pa=fake@upi&tr=${mandate.mandateRef}` } } };
      }
      case 'purchasePlan.create': {
        const refused = ['gateway', 'initiated_via', 'start_date'].filter((key) => Object.hasOwn(body, key));
        if (refused.length > 0) return fpError(400, 'UNSUPPORTED_PARAMETER', `not accepted on purchase plans: ${refused.join(', ')}`);
        const id = this.state.nextId('mfpp_');
        const plan: StoredPurchasePlan = {
          id,
          oldId: this.state.nextOldId(),
          state: 'created',
          sourceRefId: String(body.source_ref_id ?? ''),
          mfInvestmentAccount: String(body.mf_investment_account ?? ''),
          paymentSource: String(body.payment_source ?? ''),
          consent: null,
          startDate: null,
          nextInstallmentDate: null,
          raw: body,
        };
        this.state.purchasePlans.set(id, plan);
        return { statusCode: 200, data: planPayload(plan) };
      }
      case 'purchasePlan.get': {
        const plan = this.state.purchasePlans.get(params.id!);
        return plan === undefined ? fpError(404, 'NOT_FOUND', `mf_purchase_plan ${params.id} not found`) : { statusCode: 200, data: planPayload(plan) };
      }
      case 'purchasePlan.list': {
        const account = query.get('mf_investment_account');
        const items = [...this.state.purchasePlans.values()].filter((p) => account === null || p.mfInvestmentAccount === account);
        return { statusCode: 200, data: { object: 'list', data: items.map(planPayload) } };
      }
      case 'purchasePlan.update': {
        const plan = this.state.purchasePlans.get(String(body.id ?? ''));
        if (plan === undefined) return fpError(404, 'NOT_FOUND', `mf_purchase_plan ${String(body.id)} not found`);
        if (Object.hasOwn(body, 'consent')) plan.consent = body.consent as Record<string, unknown>;
        if (body.state === 'confirmed') {
          const mandate = this.state.mandates.get(Number(plan.paymentSource));
          if (plan.state !== 'review_completed' || plan.consent === null) return fpError(400, 'INVALID_STATE', 'confirm needs review_completed + consent');
          if (mandate?.status !== 'APPROVED') return fpError(400, 'MANDATE_NOT_APPROVED', 'payment_source mandate is not APPROVED');
          plan.state = 'confirmed';
        }
        return { statusCode: 200, data: planPayload(plan) };
      }
```
```ts
  advanceMandate(id: number, status: StoredMandate['status']): void {
    const mandate = this.state.mandates.get(id);
    if (mandate === undefined) throw new Error(`FakeFp.advanceMandate: unknown mandate ${id}`);
    mandate.status = status;
  }

  advancePlan(id: string, state: string, fields: { startDate?: string; nextInstallmentDate?: string } = {}): void {
    const plan = this.state.purchasePlans.get(id);
    if (plan === undefined) throw new Error(`FakeFp.advancePlan: unknown plan ${id}`);
    plan.state = state;
    if (fields.startDate !== undefined) plan.startDate = fields.startDate;
    if (fields.nextInstallmentDate !== undefined) plan.nextInstallmentDate = fields.nextInstallmentDate;
  }

  /** An instalment FP raised on a plan (an mf_purchase with `plan` set); returns its id for `advance`. */
  addInstalment(planId: string, state: string): string {
    const plan = this.state.purchasePlans.get(planId);
    if (plan === undefined) throw new Error(`FakeFp.addInstalment: unknown plan ${planId}`);
    const id = this.state.nextId('mfp_');
    const oldId = this.state.nextOldId();
    this.state.purchases.set(id, {
      id,
      oldId,
      state,
      amount: String(plan.raw.amount ?? '0.00'),
      scheme: String(plan.raw.scheme ?? ''),
      mfInvestmentAccount: plan.mfInvestmentAccount,
      sourceRefId: '',
      folioNumber: null,
      consent: null,
      plan: planId,
    });
    this.state.purchasesByOldId.set(oldId, id);
    return id;
  }
```
(Import `StoredMandate` and `StoredPurchasePlan` alongside `StoredPurchase`.)

`packages/contract/src/plans.ts`:
```ts
import { oc } from '@orpc/contract';
import { moneyWireSchema } from '@sanchay/validation';
import { z } from 'zod';
import { COMMON_ERRORS, errorMap, SESSION_ERRORS } from './errors.js';

const route = (method: 'GET' | 'POST', path: `/${string}`, summary: string) => oc.route({ method, path, tags: ['plans'], summary });
const IDEMPOTENCY = ['IDEMPOTENCY_KEY_REQUIRED', 'IDEMPOTENCY_KEY_REUSED', 'IDEMPOTENCY_IN_PROGRESS'] as const;

/** Monthly is the only launch frequency, so it is not an input; strictObject refuses a `frequency` key. */
export const CreateSipInputSchema = z.strictObject({
  schemeId: z.uuid(),
  amount: moneyWireSchema,
  installmentDay: z.number().int().min(1).max(28),
  numberOfInstalments: z.number().int().min(1).max(360).nullable().default(null),
});

export const SipCreatedSchema = z.strictObject({
  planId: z.uuid(),
  mandateId: z.uuid(),
  challengeId: z.uuid(),
  expiresAt: z.iso.datetime(),
  newMandate: z.boolean(),
  firstInstalmentDate: z.iso.date(),
});

export const PlanSchema = z.object({
  id: z.uuid(),
  schemeId: z.uuid(),
  mandateId: z.uuid(),
  amount: moneyWireSchema,
  frequency: z.literal('MONTHLY'),
  installmentDay: z.number().int(),
  numberOfInstalments: z.number().int().nullable(),
  status: z.string(),
  firstInstalmentDateShown: z.iso.date(),
  firstInstalmentDate: z.iso.date().nullable(),
  nextInstalmentDate: z.iso.date().nullable(),
  failureCode: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export const plansContract = {
  createSip: route('POST', '/plans/sips', 'Register a monthly SIP and its consent challenge')
    .errors(
      errorMap(
        ...COMMON_ERRORS,
        ...SESSION_ERRORS,
        ...IDEMPOTENCY,
        'FEATURE_DISABLED',
        'PURCHASE_BLOCKED',
        'SCHEME_NOT_ORDERABLE',
        'SIP_DAY_INVALID',
        'AMOUNT_BELOW_MIN',
        'AMOUNT_ABOVE_MAX',
        'AMOUNT_NOT_MULTIPLE',
        'MANDATE_LIMIT_EXCEEDED',
        'BANK_NOT_VERIFIED',
        'CONSENT_DESTINATION_UNAVAILABLE',
      ),
    )
    .input(CreateSipInputSchema)
    .output(SipCreatedSchema),
  list: route('GET', '/plans', 'List my SIPs').errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS)).output(z.array(PlanSchema)),
  get: route('GET', '/plans/{id}', 'Get one of my SIPs')
    .errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS))
    .input(z.strictObject({ id: z.uuid() }))
    .output(PlanSchema),
};
```

`packages/contract/src/mandates.ts`:
```ts
import { oc } from '@orpc/contract';
import { moneyWireSchema } from '@sanchay/validation';
import { z } from 'zod';
import { COMMON_ERRORS, errorMap, SESSION_ERRORS } from './errors.js';

const route = (method: 'GET' | 'POST', path: `/${string}`, summary: string) => oc.route({ method, path, tags: ['mandates'], summary });

export const MandateSchema = z.object({
  id: z.uuid(),
  rail: z.string(),
  limitAmount: moneyWireSchema,
  status: z.string(),
  /** The UPI intent to open, present only while AUTH_PENDING. */
  upiUri: z.string().nullable(),
  approvedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

export const mandatesContract = {
  list: route('GET', '/mandates', 'List my mandates').errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS)).output(z.array(MandateSchema)),
  get: route('GET', '/mandates/{id}', 'Get one of my mandates')
    .errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS))
    .input(z.strictObject({ id: z.uuid() }))
    .output(MandateSchema),
  authorize: route('POST', '/mandates/{id}/authorize', 'Re-mint the UPI Autopay intent for a pending mandate')
    .errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS, 'IDEMPOTENCY_KEY_REQUIRED', 'IDEMPOTENCY_KEY_REUSED', 'IDEMPOTENCY_IN_PROGRESS', 'MANDATE_STATE_INVALID'))
    .input(z.strictObject({ id: z.uuid() }))
    .output(z.strictObject({ ok: z.literal(true) })),
};
```

`apps/api/src/modules/plans/plans.router.ts`:
```ts
import { Controller, Inject } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@sanchay/contract';
import { ClsService } from 'nestjs-cls';
import { requireAuth } from '../identity/request-auth.js';
import { requireIdempotency } from '../platform/idempotency.middleware.js';
import { IdempotencyService } from '../platform/idempotency.service.js';
import type { SanchayClsStore } from '../platform/request-context.js';
import type { plans } from './plans.schema.js';
import { SipService } from './sip.service.js';

const toWire = (row: typeof plans.$inferSelect) => ({
  id: row.id,
  schemeId: row.schemeId,
  mandateId: row.mandateId,
  amount: row.amount,
  frequency: row.frequency,
  installmentDay: row.installmentDay,
  numberOfInstalments: row.numberOfInstalments,
  status: row.status,
  firstInstalmentDateShown: row.firstInstalmentDateShown,
  firstInstalmentDate: row.firstInstalmentDate,
  nextInstalmentDate: row.nextInstalmentDate,
  failureCode: row.failureCode,
  createdAt: row.createdAt.toISOString(),
});

@Controller()
export class PlansRouter {
  constructor(
    @Inject(SipService) private readonly sips: SipService,
    @Inject(IdempotencyService) private readonly idem: IdempotencyService,
    @Inject(ClsService) private readonly cls: ClsService<SanchayClsStore>,
  ) {}

  @Implement(contract.plans.createSip)
  createSip() {
    return implement(contract.plans.createSip)
      .use(requireIdempotency(this.idem, this.cls))
      .handler(({ input }) => {
        const auth = requireAuth(this.cls);
        return this.sips.createSip({
          ...input,
          investorId: auth.investorId,
          userIp: this.cls.get('ip') ?? '0.0.0.0',
          initiatedVia: String(auth.platform).toUpperCase() === 'ANDROID' ? 'mobile_app_android' : 'web',
        });
      });
  }

  @Implement(contract.plans.list)
  list() {
    return implement(contract.plans.list).handler(async () => (await this.sips.list(requireAuth(this.cls).investorId)).map(toWire));
  }

  @Implement(contract.plans.get)
  get() {
    return implement(contract.plans.get).handler(async ({ input }) => toWire(await this.sips.get(requireAuth(this.cls).investorId, input.id)));
  }
}
```

`apps/api/src/modules/plans/mandates.router.ts`:
```ts
import { Controller, Inject } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@sanchay/contract';
import { ClsService } from 'nestjs-cls';
import { requireAuth } from '../identity/request-auth.js';
import { requireIdempotency } from '../platform/idempotency.middleware.js';
import { IdempotencyService } from '../platform/idempotency.service.js';
import type { SanchayClsStore } from '../platform/request-context.js';
import { MandatesService } from './mandates.service.js';
import type { mandates } from './plans.schema.js';

const toWire = (row: typeof mandates.$inferSelect) => ({
  id: row.id,
  rail: row.rail,
  limitAmount: row.limitAmount,
  status: row.status,
  upiUri: row.status === 'AUTH_PENDING' ? row.upiUri : null,
  approvedAt: row.approvedAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
});

@Controller()
export class MandatesRouter {
  constructor(
    @Inject(MandatesService) private readonly mandatesService: MandatesService,
    @Inject(IdempotencyService) private readonly idem: IdempotencyService,
    @Inject(ClsService) private readonly cls: ClsService<SanchayClsStore>,
  ) {}

  @Implement(contract.mandates.list)
  list() {
    return implement(contract.mandates.list).handler(async () => (await this.mandatesService.list(requireAuth(this.cls).investorId)).map(toWire));
  }

  @Implement(contract.mandates.get)
  get() {
    return implement(contract.mandates.get).handler(async ({ input }) =>
      toWire(await this.mandatesService.get(requireAuth(this.cls).investorId, input.id)),
    );
  }

  @Implement(contract.mandates.authorize)
  authorize() {
    return implement(contract.mandates.authorize)
      .use(requireIdempotency(this.idem, this.cls))
      .handler(({ input }) => this.mandatesService.authorize(requireAuth(this.cls).investorId, input.id));
  }
}
```

`apps/api/src/modules/plans/plans.module.ts`:
```ts
import { type DynamicModule, Module } from '@nestjs/common';
import type { Env } from '../../config/env.js';
import { IdentityModule } from '../identity/identity.module.js';
import { CONSENT_SUBJECT_JOBS } from '../legal-consent/consent-engine.js';
import { LegalConsentModule } from '../legal-consent/legal-consent.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { InstalmentsSyncJob } from './instalments-sync.job.js';
import { MandatesPollJob } from './mandates-poll.job.js';
import { MandatesRouter } from './mandates.router.js';
import { MandatesService } from './mandates.service.js';
import { MandatesSubmitJob } from './mandates-submit.job.js';
import { PlansRouter } from './plans.router.js';
import { SipAdvanceJob } from './sip-advance.job.js';
import { SipService } from './sip.service.js';
import { SipSubmitJob } from './sip-submit.job.js';

// Loaded in every role: approve (api) reads these to start the saga.
CONSENT_SUBJECT_JOBS.MANDATE_REGISTRATION = 'mandates.submit';
CONSENT_SUBJECT_JOBS.SIP_REGISTRATION = 'plans.sip.submit';

@Module({})
export class PlansModule {
  static forRoot(env: Env): DynamicModule {
    const workerOnly =
      env.SANCHAY_APP_ROLE === 'worker' ? [MandatesSubmitJob, MandatesPollJob, SipSubmitJob, SipAdvanceJob, InstalmentsSyncJob] : [];
    return {
      module: PlansModule,
      imports: [LegalConsentModule, IdentityModule, NotificationsModule],
      controllers: [PlansRouter, MandatesRouter],
      providers: [SipService, MandatesService, ...workerOnly],
      exports: [SipService, MandatesService],
    };
  }
}
```

Key-level edits:
- `apps/api/src/modules/platform/jobs/job-registry.ts`: append `'mandates.submit'`, `'mandates.poll'`, `'plans.sip.submit'`, `'plans.sip.advance'`, `'plans.instalments.sync'` to `JOB_NAMES`.
- `apps/api/src/modules/platform/jobs/schedules.ts` (inside `registerSchedules`):
```ts
  await boss.schedule('mandates.poll', '*/10 * * * *', { scope: 'PENDING' }, { tz, key: 'mandates-poll-pending' });
  await boss.schedule('mandates.poll', '30 7 * * *', { scope: 'APPROVED' }, { tz, key: 'mandates-poll-approved' });
  await boss.schedule('plans.instalments.sync', '30 8 * * *', {}, { tz, key: 'plans-instalments-morning' });
  await boss.schedule('plans.instalments.sync', '30 20 * * *', {}, { tz, key: 'plans-instalments-evening' });
```
- `apps/api/src/modules/platform/ids.ts`: append `'plans' | 'mandates'`.
- `packages/contract/src/errors.ts`: append `PLAN_STATE_INVALID: 409` and `MANDATE_STATE_INVALID: 409`.
- `packages/app-core/src/errors/messages.ts`: add `['PLAN_STATE_INVALID', 'This SIP can no longer be changed.']` and `['MANDATE_STATE_INVALID', 'This mandate is not waiting for your approval right now.']`. The C6 all-codes test stays green.
- `packages/contract/src/index.ts`: add `plans: plansContract` and `mandates: mandatesContract`, then regenerate `apps/api/openapi.json`.
- `apps/api/src/app.module.ts`: add `PlansModule.forRoot(env)`.

- [ ] **Step 4: Run tests to confirm they pass**

```
pnpm --filter=@sanchay/api db:generate --name=plans_mandates
pnpm --filter=@sanchay/api db:generate --custom --name=plans_mandates_guard
pnpm --filter=@sanchay/domain test -- sip-dates
pnpm --filter=@sanchay/api typecheck
pnpm --filter=@sanchay/api test -- sip-eligibility fp-plan
pnpm --filter=@sanchay/contract test -- plans
pnpm --filter=@sanchay/api test:int -- sip-mandate
pnpm --filter=@sanchay/app-core test
pnpm --filter=@sanchay/api openapi
git diff --exit-code apps/api/openapi.json
```
Paste the trigger SQL above into the generated `0027_plans_mandates_guard.sql` before running the tests. Expected:
- `sip-dates` 8/8.
- `sip-eligibility` 8/8 and `fp-plan` 3/3.
- `plans` (contract) 3/3.
- `sip-mandate.int.test.ts` 17/17.
- The app-core all-codes test is green.
- `openapi.json` is clean after regeneration.

- [ ] **Step 5: Commit**

```
pnpm exec biome check --write packages/domain/src/rules packages/domain/test/sip-dates.test.ts apps/api/src/modules/plans apps/api/src/modules/orders/orders.schema.ts apps/api/src/integrations/fp apps/api/src/db/app-schema.ts apps/api/src/modules/platform apps/api/src/app.module.ts apps/api/test/int packages/contract/src packages/app-core/src/errors/messages.ts
pnpm --filter=@sanchay/api typecheck
pnpm --filter=@sanchay/api test:int -- sip-mandate
pnpm lint
git add packages/domain/src/rules packages/domain/test/sip-dates.test.ts apps/api/src/modules/plans apps/api/src/modules/orders/orders.schema.ts apps/api/src/integrations/fp/fp-transact.ts apps/api/src/integrations/fp/fake apps/api/src/db/app-schema.ts apps/api/src/modules/platform/jobs apps/api/src/modules/platform/ids.ts apps/api/src/app.module.ts apps/api/drizzle apps/api/openapi.json apps/api/test/int/sip-seed.ts apps/api/test/int/sip-mandate.int.test.ts packages/contract/src packages/app-core/src/errors/messages.ts
git commit -m "feat(api): SIP registration and UPI Autopay mandate backend (F2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task F3: [T6] eNACH rail and limit ladder (Dev A, 6 h) (trim candidate)

**Files:**
- **Create:** `packages/domain/src/rules/mandate-ladder.ts`, `packages/domain/test/mandate-ladder.test.ts`, `apps/api/test/int/mandate-enach.int.test.ts`
- **Create (migration):** `apps/api/drizzle/0028_mandates_auth_url.sql` (generated: `mandates.auth_url_enc`)
- **Modify (F2 files):** `apps/api/src/modules/plans/{plans.schema.ts, fp-plan.ts, fp-plan.test.ts, sip-eligibility.ts, sip-eligibility.test.ts, sip.service.ts, mandates-submit.job.ts, mandates.service.ts, mandates.router.ts}`, `packages/contract/src/plans.ts`, `packages/contract/src/plans.test.ts`, `packages/contract/src/mandates.ts`, `apps/api/openapi.json`
- **Modify:** `packages/domain/src/rules/index.ts`

**Interfaces:**
- **Prerequisites:** F2. F2's `MandatesSubmitJob` already sends `mandate_type`/`mandate_limit` from the mandate row and asks for a UPI intent only for `UPI`. F2's FakeFp also already returns a `token_url` when no `upi` key is sent. So this task adds no second submit job and changes no FP call.
- **Consumes:** `Money`, `Rounding` (`@sanchay/money`); `MANDATE_RAILS`, `type MandateRail` (`@sanchay/domain`); `Crypto.encrypt/decrypt(…, {table, column, rowId})` and `asRowId` (Plan 01); the `mandates_limit_ck` CHECK (F2), which already allows every ladder rung, so no new CHECK is needed.
- **Produces:**
  - `mandateLimitFor(required: Money): Money | null` and `MANDATE_LIMIT_LADDER` in `@sanchay/domain`. It returns the smallest rung ≥ 1.5 × `required`, or `null` above the top rung (₹25,00,000). The 1.5× product is truncated (`Rounding.DOWN`) to money scale. That is the only mode that satisfies the spec boundaries: ML-02, 66,666.67 → ₹1,00,000, and ML-03, 66,666.68 → ₹2,00,000. `CEIL` or `HALF_UP` would push 66,666.67 into the ₹2,00,000 rung.
  - `plans.createSip` input gains `rail: 'UPI_AUTOPAY' | 'ENACH'`, default `'UPI_AUTOPAY'`.
  - **eNACH mandate sizing:**
    - Reuse works as in F2 but per rail: an `APPROVED` mandate of the same rail with headroom.
    - A new eNACH mandate's limit is `mandateLimitFor(Σ live plans on mandates of the same bank + this amount)`. "Live" uses F2's headroom predicate.
    - Above the top rung, the request is refused with `MANDATE_LIMIT_EXCEEDED`.
    - The UPI Autopay cap (₹1,00,000 per SIP) applies to the UPI rail only.
  - **Encrypted auth URL:** `mandates.auth_url_enc` (`bytea`) holds the eNACH `token_url`, encrypted with AAD `mandates.auth_url_enc.<id>`. It is written by `mandates.submit` and by a re-authorise.
  - **API:** `MandatesService.authUrlOf(row)` decrypts it. `mandates.get`/`list` return `authUrl`, which is set only for `ENACH` while `AUTH_PENDING`, next to F2's `upiUri`.
- **Review fixes** (the draft was written against F2's draft):
  - It redefined `MandatesSubmitJob` with a `handle({mandateId, challengeId})` payload and the invented `FpTransact.call('pg.*')`.
  - It added a `MandatesService.createOrReuse` that F2 never had.
  - It imported the subpath `@sanchay/domain/rules/mandate-ladder.js`, and threw an `Error` from `@sanchay/domain`, which cannot import `AppError`.
  - It relied on F2 having "reserved" an `authUrlEnc` column that no migration created.
  - Its tests used nonexistent helpers (`createInvestorWithBankAndFolio`, `approveConsentChallenge`, `t.jobs.runOnce`, `t.runtimeConfig`, `t.fixtures`, `fakeFp.lastEmandateTokenUrl`).
  - The fix: the ladder is a pure `Money | null` rule, the vectors live in the domain test, and the integration test reuses F2's `sip-seed.ts`.

- [ ] **Step 1: Write the failing tests**

`packages/domain/test/mandate-ladder.test.ts`:
```ts
import { Money } from '@sanchay/money';
import { describe, expect, it } from 'vitest';
import { mandateLimitFor } from '../src/rules/mandate-ladder.js';

const VECTORS: ReadonlyArray<{ id: string; sum: string; limit: string | null }> = [
  { id: 'ML-01', sum: '0.00', limit: '100000.00' },
  { id: 'ML-02', sum: '66666.67', limit: '100000.00' },
  { id: 'ML-03', sum: '66666.68', limit: '200000.00' },
  { id: 'ML-04', sum: '133333.33', limit: '200000.00' },
  { id: 'ML-05', sum: '133333.34', limit: '500000.00' },
  { id: 'ML-06', sum: '333333.33', limit: '500000.00' },
  { id: 'ML-07', sum: '333333.34', limit: '1000000.00' },
  { id: 'ML-08', sum: '1666666.68', limit: null },
];

describe('mandateLimitFor (ML-01..08)', () => {
  for (const v of VECTORS) {
    it(`${v.id}: Σ ${v.sum} -> ${v.limit ?? 'refused'}`, () => {
      expect(mandateLimitFor(Money.parse(v.sum))?.toWire() ?? null).toBe(v.limit);
    });
  }
});
```

Append to `apps/api/src/modules/plans/sip-eligibility.test.ts`'s `assertSipEligible` block:
```ts
  it('the ₹1,00,000 cap is UPI-only: eNACH above it passes here (the ladder decides)', () => {
    expect(() => assertSipEligible({ scheme, amount: Money.parse('150000.00'), installmentDay: 10, rail: 'ENACH' })).not.toThrow();
  });
```

Append to `apps/api/src/modules/plans/fp-plan.test.ts`:
```ts
describe('tokenUrlOf', () => {
  it('reads the eNACH token_url', () => {
    expect(tokenUrlOf({ token_url: 'https://pg.example/e/1' })).toBe('https://pg.example/e/1');
    expect(tokenUrlOf({ upi: { uri: 'upi://x' } })).toBeNull();
  });
});
```
(and add `tokenUrlOf` to that file's import).

Append to `packages/contract/src/plans.test.ts`:
```ts
describe('CreateSipInputSchema rail', () => {
  it('defaults to UPI_AUTOPAY and accepts ENACH only as the other rail', () => {
    expect(CreateSipInputSchema.parse(valid).rail).toBe('UPI_AUTOPAY');
    expect(CreateSipInputSchema.parse({ ...valid, rail: 'ENACH' }).rail).toBe('ENACH');
    expect(CreateSipInputSchema.safeParse({ ...valid, rail: 'NACH_PHYSICAL' }).success).toBe(false);
  });
});
```

`apps/api/test/int/mandate-enach.int.test.ts`:
```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ConsentApprovedJobData, ConsentEngine } from '../../src/modules/legal-consent/consent-engine.js';
import { consentChallenges } from '../../src/modules/legal-consent/legal-consent.schema.js';
import { MandatesService } from '../../src/modules/plans/mandates.service.js';
import { MandatesSubmitJob } from '../../src/modules/plans/mandates-submit.job.js';
import { mandates } from '../../src/modules/plans/plans.schema.js';
import { SipService } from '../../src/modules/plans/sip.service.js';
import { Jobs } from '../../src/modules/platform/jobs/jobs.service.js';
import { bootFpTestApp, type FpTestApp } from './fake-fp.js';
import { jobOf } from './jobs.js';
import { seedSipInvestor, seedSipScheme, setSipEnabled } from './sip-seed.js';

let t: FpTestApp;
const enqueued: Array<{ name: string; data: unknown }> = [];

beforeAll(async () => {
  t = await bootFpTestApp();
  vi.spyOn(t.app.get(Jobs), 'enqueue').mockImplementation(async (_exec, name, data) => {
    enqueued.push({ name, data });
  });
  await setSipEnabled(t, true);
});
afterAll(async () => {
  await t.close();
});
beforeEach(() => {
  enqueued.length = 0;
});

type SipInvestor = Awaited<ReturnType<typeof seedSipInvestor>>;

async function draftEnach(amount: string, investor?: SipInvestor) {
  const who = investor ?? (await seedSipInvestor(t));
  const scheme = await seedSipScheme(t);
  const created = await t.app.get(SipService).createSip({
    investorId: who.investorId,
    schemeId: scheme.id,
    amount,
    installmentDay: 10,
    numberOfInstalments: null,
    rail: 'ENACH',
    userIp: '203.0.113.10',
    initiatedVia: 'web',
  });
  return { investor: who, ...created };
}

async function approve(draft: { challengeId: string; investor: SipInvestor }): Promise<ConsentApprovedJobData> {
  const engine = t.app.get(ConsentEngine);
  const [row] = await t.db.db.select().from(consentChallenges).where(eq(consentChallenges.id, draft.challengeId));
  const needsEmail = row?.requiredFactors.includes('EMAIL') === true;
  await engine.sendOtp(draft.challengeId, 'SMS');
  if (needsEmail) await engine.sendOtp(draft.challengeId, 'EMAIL');
  await engine.approve(draft.challengeId, {
    smsCode: t.sms.latestCode(draft.investor.mobile) ?? '',
    ...(needsEmail ? { emailCode: t.email.latestCode(draft.investor.email) ?? '' } : {}),
  });
  const job = [...enqueued].reverse().find((j) => j.name === 'mandates.submit');
  expect(job, 'approve enqueues mandates.submit').toBeDefined();
  return job?.data as ConsentApprovedJobData;
}

const mandateOf = async (id: string) => (await t.db.db.select().from(mandates).where(eq(mandates.id, id)))[0];

describe('eNACH mandate', () => {
  it('E_MANDATE at the ladder limit; the token_url is stored encrypted and surfaced as authUrl, never upiUri', async () => {
    const draft = await draftEnach('2000.00');
    expect(await mandateOf(draft.mandateId)).toMatchObject({ rail: 'ENACH', limitAmount: '100000.00' });
    await t.app.get(MandatesSubmitJob).handle(jobOf('mandates.submit', await approve(draft)));

    const mandate = await mandateOf(draft.mandateId);
    expect(mandate).toMatchObject({ status: 'AUTH_PENDING', upiUri: null });
    expect(mandate?.authUrlEnc).toBeInstanceOf(Buffer);
    expect(t.fakeFp.state.mandates.get(Number(mandate?.fpMandateId))?.raw).toMatchObject({ mandate_type: 'E_MANDATE', mandate_limit: 100000 });
    expect(t.app.get(MandatesService).authUrlOf(mandate as NonNullable<typeof mandate>)).toBe(
      `https://pg.fake.local/emandate/${mandate?.mandateRef}`,
    );
  });

  it('sizes a new eNACH mandate at 1.5x the live SIPs on the same bank: 60,000 + 40,001 -> ₹2,00,000', async () => {
    const first = await draftEnach('60000.00');
    expect((await mandateOf(first.mandateId))?.limitAmount).toBe('100000.00');
    const second = await draftEnach('40001.00', first.investor);
    expect(second.newMandate).toBe(true);
    expect((await mandateOf(second.mandateId))?.limitAmount).toBe('200000.00');
  });

  it('above the top rung -> MANDATE_LIMIT_EXCEEDED', async () => {
    await expect(draftEnach('1700000.00')).rejects.toMatchObject({ code: 'MANDATE_LIMIT_EXCEEDED' });
  });
});
```

- [ ] **Step 2: Run them to confirm they fail**

```
pnpm --filter=@sanchay/domain test -- mandate-ladder
pnpm --filter=@sanchay/api test -- sip-eligibility fp-plan
pnpm --filter=@sanchay/contract test -- plans
pnpm --filter=@sanchay/api test:int -- mandate-enach
```
Expected:
- `Cannot find module '../src/rules/mandate-ladder.js'`.
- `tokenUrlOf` is not exported.
- The `rail` assertions fail (`undefined`, and the `strictObject` refuses the key).
- The integration test fails typecheck on `rail` and `authUrlOf`.

- [ ] **Step 3: Minimal implementation**

`packages/domain/src/rules/mandate-ladder.ts`:
```ts
import { Money, Rounding } from '@sanchay/money';

/** eNACH limit rungs (spec §4.3); the `mandates_limit_ck` CHECK allows exactly these. */
export const MANDATE_LIMIT_LADDER: readonly Money[] = ['100000.00', '200000.00', '500000.00', '1000000.00', '2500000.00'].map((v) =>
  Money.parse(v),
);

/**
 * Smallest rung ≥ 1.5 × `required` (the monthly SIPs the mandate must carry), or null above the top rung.
 * The product is truncated to money scale: only DOWN keeps 66,666.67 in the ₹1,00,000 rung (ML-02).
 */
export function mandateLimitFor(required: Money): Money | null {
  const needed = required.multiply('1.5', Rounding.DOWN);
  return MANDATE_LIMIT_LADDER.find((rung) => rung.gte(needed)) ?? null;
}
```
Append to `packages/domain/src/rules/index.ts`: `export * from './mandate-ladder.js';`.

`apps/api/src/modules/plans/plans.schema.ts` (in `mandates`, after `upiUri`; add `bytea` to the `app-schema.js` import):
```ts
    /** eNACH `token_url`, encrypted (AAD mandates.auth_url_enc.<id>); null for UPI. */
    authUrlEnc: bytea('auth_url_enc'),
```

`apps/api/src/modules/plans/fp-plan.ts` (append):
```ts
/** `POST /api/pg/payments/emandate/auth` for E_MANDATE returns the bank page in `token_url`. */
export function tokenUrlOf(raw: Record<string, unknown>): string | null {
  return typeof raw.token_url === 'string' ? raw.token_url : null;
}
```

`apps/api/src/modules/plans/sip-eligibility.ts`:
- Add `import type { MandateRail } from '@sanchay/domain';`.
- Change `assertSipEligible`'s input type to `{ scheme: SipScheme; amount: Money; installmentDay: number; rail?: MandateRail }`.
- Replace its last line:
```ts
  // The UPI Autopay mandate is fixed at ₹1,00,000; an eNACH mandate is sized by the ladder instead (F3).
  if ((input.rail ?? 'UPI_AUTOPAY') === 'UPI_AUTOPAY' && amount.gt(UPI_AUTOPAY_LIMIT)) {
    throw new AppError('MANDATE_LIMIT_EXCEEDED', field('amount', 'MANDATE_LIMIT_EXCEEDED'));
  }
```

`apps/api/src/modules/plans/sip.service.ts`:
- Imports: add `type MandateRail` and `mandateLimitFor` to the `@sanchay/domain` import.
- `CreateSipInput` gains `rail: MandateRail;`.
- `createSip` passes the rail to the eligibility check: `assertSipEligible({ scheme: sip, amount, installmentDay: input.installmentDay, rail: input.rail });`.
- Inside the transaction, replace everything from `const reused = …` down to the end of the `if (newMandate) { … }` insert block with:
```ts
      const reused = await this.mandateWithHeadroom(tx, input.investorId, input.rail, amount, now);
      const newMandate = reused === null;
      const mandateId = reused ?? newId('mandates');
      let limitWire: string | null = null;
      if (newMandate) {
        limitWire = input.rail === 'UPI_AUTOPAY' ? UPI_AUTOPAY_LIMIT_WIRE : await this.enachLimit(tx, input.investorId, bank.id, amount, now);
        await tx.insert(mandates).values({
          id: mandateId,
          createdBy: input.investorId,
          updatedBy: input.investorId,
          investorId: input.investorId,
          bankAccountId: bank.id,
          rail: input.rail,
          limitAmount: limitWire,
        });
        await tx.insert(orderEvents).values({ mandateId, toStatus: 'CONSENT_PENDING', trigger: 'plans.createSip' });
      }
```
- In the consent `fields`, replace `mandateLimit: UPI_AUTOPAY_LIMIT_WIRE,` with `...(limitWire === null ? {} : { mandateLimit: limitWire }),`.
- Replace `mandateWithHeadroom` and add `livePlans`/`enachLimit`:
```ts
  /** Plans whose amount counts against a mandate: live states, plus CONSENT_PENDING drafts still approvable. */
  private livePlans(now: Date) {
    const freshSince = new Date(now.getTime() - CHALLENGE_EXPIRY_MS);
    return or(inArray(plans.status, HEADROOM_STATUSES), and(eq(plans.status, 'CONSENT_PENDING'), gt(plans.createdAt, freshSince)));
  }

  /** The investor's APPROVED mandate on `rail` with room for `amount`, oldest first; null when none. */
  private async mandateWithHeadroom(exec: DbExecutor, investorId: string, rail: MandateRail, amount: Money, now: Date): Promise<string | null> {
    const approved = await exec
      .select({ id: mandates.id, limitAmount: mandates.limitAmount })
      .from(mandates)
      .where(and(eq(mandates.investorId, investorId), eq(mandates.rail, rail), eq(mandates.status, 'APPROVED')))
      .orderBy(asc(mandates.createdAt));
    for (const mandate of approved) {
      const [used] = await exec
        .select({ total: sql<string>`COALESCE(SUM(${plans.amount}), 0)::numeric(18,2)::text` })
        .from(plans)
        .where(and(eq(plans.mandateId, mandate.id), this.livePlans(now)));
      if (!Money.parse(used?.total ?? '0.00').add(amount).gt(Money.parse(mandate.limitAmount))) return mandate.id;
    }
    return null;
  }

  /** eNACH ladder (spec §4.3): ≥ 1.5 × every live SIP on this bank's mandates plus this one. */
  private async enachLimit(exec: DbExecutor, investorId: string, bankAccountId: string, amount: Money, now: Date): Promise<string> {
    const [onBank] = await exec
      .select({ total: sql<string>`COALESCE(SUM(${plans.amount}), 0)::numeric(18,2)::text` })
      .from(plans)
      .innerJoin(mandates, eq(plans.mandateId, mandates.id))
      .where(and(eq(plans.investorId, investorId), eq(mandates.bankAccountId, bankAccountId), this.livePlans(now)));
    const limit = mandateLimitFor(Money.parse(onBank?.total ?? '0.00').add(amount));
    if (limit === null) throw new AppError('MANDATE_LIMIT_EXCEEDED', { fields: [{ path: 'amount', code: 'MANDATE_LIMIT_EXCEEDED', message: 'MANDATE_LIMIT_EXCEEDED' }] });
    return limit.toWire();
  }
```

`apps/api/src/modules/plans/mandates-submit.job.ts`:
- Imports: add `import { Crypto } from '../platform/crypto.js';`, `asRowId` from `../platform/ids.js`, and `tokenUrlOf` next to `upiUriOf`.
- Constructor: add `@Inject(Crypto) private readonly crypto: Crypto,`.
- Replace the tail of the `useConsumed` callback, from `const upiUri = …` to the end of its `if/else`:
```ts
        const auth = await this.fp.authoriseMandate({ mandateId: String(current.fpMandateId), mandateType }, consumed);
        const tokenUrl = tokenUrlOf(auth);
        const intent =
          mandateType === 'UPI'
            ? { upiUri: upiUriOf(auth) }
            : {
                authUrlEnc:
                  tokenUrl === null
                    ? null
                    : this.crypto.encrypt(tokenUrl, { table: 'mandates', column: 'auth_url_enc', rowId: asRowId('mandates', current.id) }),
              };
        if (current.status === 'CREATED') {
          await moveMandate(db, current, 'AUTH_PENDING', 'emandate_auth_created', intent);
        } else {
          await db.update(mandates).set(intent).where(eq(mandates.id, current.id)); // re-authorise: same state, new intent
        }
```

`apps/api/src/modules/plans/mandates.service.ts`:
- Add `import { Crypto } from '../platform/crypto.js';` and `import { asRowId } from '../platform/ids.js';`.
- Constructor: add `@Inject(Crypto) private readonly crypto: Crypto,`.
- Add the method:
```ts
  /** The eNACH bank page to open; only while the mandate waits for the investor. */
  authUrlOf(row: typeof mandates.$inferSelect): string | null {
    if (row.rail !== 'ENACH' || row.status !== 'AUTH_PENDING' || row.authUrlEnc === null) return null;
    return this.crypto.decrypt(row.authUrlEnc, { table: 'mandates', column: 'auth_url_enc', rowId: asRowId('mandates', row.id) });
  }
```

`apps/api/src/modules/plans/mandates.router.ts`:
- Change `toWire` to take the decrypted URL: `const toWire = (row: typeof mandates.$inferSelect, authUrl: string | null) => ({ …, authUrl, … })`, adding `authUrl` after `upiUri`.
- Call sites become `toWire(row, this.mandatesService.authUrlOf(row))`: in `list`, `.map((row) => toWire(row, this.mandatesService.authUrlOf(row)))`; in `get`, bind the row first.

`packages/contract/src/plans.ts` (`CreateSipInputSchema`, after `numberOfInstalments`):
```ts
  rail: z.enum(['UPI_AUTOPAY', 'ENACH']).default('UPI_AUTOPAY'),
```

`packages/contract/src/mandates.ts` (`MandateSchema`, after `upiUri`):
```ts
  /** The eNACH bank page to open, present only for ENACH while AUTH_PENDING. */
  authUrl: z.string().nullable(),
```

Update F2's callers:
- `sip-mandate.int.test.ts`'s `draftSip` passes `rail: 'UPI_AUTOPAY'`.
- `PlansRouter.createSip` already spreads `input`, so it passes the parsed `rail`.

- [ ] **Step 4: Run tests to confirm they pass**

```
pnpm --filter=@sanchay/api db:generate --name=mandates_auth_url
pnpm --filter=@sanchay/domain test -- mandate-ladder
pnpm --filter=@sanchay/api typecheck
pnpm --filter=@sanchay/api test -- sip-eligibility fp-plan
pnpm --filter=@sanchay/contract test -- plans
pnpm --filter=@sanchay/api test:int -- mandate-enach sip-mandate
pnpm --filter=@sanchay/api openapi
git diff --exit-code apps/api/openapi.json
```
Expected:
- `mandate-ladder` 8/8.
- `sip-eligibility` 9/9 and `fp-plan` 4/4.
- Contract `plans` 4/4.
- `mandate-enach` 3/3 and `sip-mandate` still 17/17.
- `openapi.json` is clean after regeneration.

- [ ] **Step 5: Commit**

```
pnpm exec biome check --write packages/domain/src/rules packages/domain/test/mandate-ladder.test.ts apps/api/src/modules/plans apps/api/test/int/mandate-enach.int.test.ts apps/api/test/int/sip-mandate.int.test.ts packages/contract/src
pnpm --filter=@sanchay/api typecheck
pnpm --filter=@sanchay/api test:int -- mandate-enach sip-mandate
pnpm lint
git add packages/domain/src/rules packages/domain/test/mandate-ladder.test.ts apps/api/src/modules/plans apps/api/drizzle apps/api/openapi.json apps/api/test/int/mandate-enach.int.test.ts apps/api/test/int/sip-mandate.int.test.ts packages/contract/src
git commit -m "feat(api): eNACH mandate rail and limit ladder (F3, T6)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task F4: Ledger: `applyAllotment`/`applyExit` (FIFO), folio upsert, `folio.sync`, `orders.units.reconcile` (Dev A, 12 h)

**Files:**
- **Create (domain):** `packages/domain/src/rules/{fifo.ts, elss-lock.ts, business-days.ts}`, `packages/domain/test/{fifo.test.ts, elss-lock.test.ts, business-days.test.ts}`
- **Create (golden):** `packages/test-fixtures/src/golden/{fifo.json, elss-lock.json}`
- **Create (api):** `apps/api/src/modules/portfolio/{portfolio.schema.ts, ledger.service.ts, purchase-settlement.ts, purchase-settlement.test.ts, fp-holdings.ts, fp-holdings.test.ts, folio-sync.job.ts, units-reconcile.job.ts, portfolio.module.ts}`
- **Create (tests):** `apps/api/test/int/{ledger-seed.ts, ledger.int.test.ts, folio-sync.int.test.ts}`
- **Create (migrations):** `ledger` (generated) and `ledger_guards` (custom: revokes UPDATE/DELETE on `lot_consumptions`)
- **Modify (domain):** `packages/domain/src/rules/index.ts` (append three exports), `packages/domain/src/states/order.ts` (D5; append `UNITS_PENDING → REVERSED`), `packages/domain/test/states.test.ts` (D5; append one `describe`), `docs/specs/states.md` (regenerated by `pnpm gen:states`)
- **Modify (api):** `apps/api/src/modules/portfolio/folios.schema.ts` (E20; the spec §2.3 columns), `apps/api/src/modules/orders/orders.schema.ts` (E20; `stamp_duty`, `units_source`, `units_pending_since`), `apps/api/src/modules/payments/fp-events.ts` (E21; the `mf_purchase` handler delegates to `PurchaseSettlement`), `apps/api/src/modules/payments/payments.module.ts` (E21; import `PortfolioModule`, register the new handler), `apps/api/test/int/payments.int.test.ts` (E21; its `mf_purchase` test now expects SETTLED and a lot)
- **Modify (F2):** `apps/api/src/modules/plans/instalments-sync.job.ts` (instalments move past PROCESSING only through `PurchaseSettlement`), `apps/api/src/modules/plans/plans.module.ts` (import `PortfolioModule`), `apps/api/test/int/sip-mandate.int.test.ts` (one new instalment test)
- **Modify (FakeFp, D4):** `apps/api/src/integrations/fp/fake/fake-fp.state.ts`, `apps/api/src/integrations/fp/fake/fake-fp.ts`
- **Modify (kernel):** `apps/api/src/modules/platform/runtime-config.ts` (D1; `ReconBreaks.open` erratum), `apps/api/src/modules/platform/jobs/job-registry.ts` (append `'folio.sync'`, `'orders.units.reconcile'`), `apps/api/src/modules/platform/jobs/schedules.ts` (two schedules), `apps/api/src/modules/platform/ids.ts` (append four table names), `apps/api/src/app.module.ts` (`PortfolioModule.forRoot(env)`)

**Interfaces:**
- **Prerequisites:** Plan 03 E1, E20, E21, E22; Plan 02 D1–D6, D8. F2 and F3 run first (their migrations are 0026–0028). F4 edits F2's `plans.instalments.sync` so a SIP instalment (`origin = 'SIP_INSTALMENT'`) settles through the same `PurchaseSettlement` path and gets a `SIP_INSTALMENT` lot.
- **Consumes (Plan 01):** `Units` (scale 3), `Money`, `Nav`, `Rounding`, `parseIsoDateParts` (`@sanchay/money`); `IsoDate`, `toIsoDate`, `isIsoDate` (`@sanchay/domain`); `Crypto.blindIndex` (`crypto.ts`); `maskMobile`/`maskEmail` (`identity/masking.ts`); `AuditService.record`; `CLOCK`, `FakeClock.set/advance`, `MINUTE`; `newId`; `pgConstraintOf`.
- **Consumes (Plan 02, as written):** `ReconBreaks`, `reconBreaks` (D1); `Jobs`, `JobHandler`, `Job`, `registerSchedules` (D2); `FpRead.purchase/holdings/folios` and the `holdings.get`/`folio.list` operations already in `FP_OPERATIONS` (D3); `FakeFp`, `FakeFpState` (D4); `canTransition`, `fpStateToOrderStatus`, `FpOrderState`, `OrderStatus` (D5); `Notify`, `NotificationsModule`, `notifications` (D6); `schemes.lock_in_months`/`is_elss`/`isin`/`amc_id`, `amcs`, `sebiCategories`, `marketHolidays` (D8).
- **Consumes (Plan 03, as written):** `orders`, `orderEvents`, `ORDER_AUDIT_ACTIONS.ORDER_SETTLED`, `moveOrder`, `toFpPurchaseView`/`FpPurchaseView`, `folios` (E20); `registerFpEventHandler`, `FP_EVENT_HANDLERS`, `FpEventHandlerContext`, `jobOf` (E1); `PaymentsModule`, `paymentEventHandler` (E21); `expectedNavDate`, `CutoffHolidays` (E22); `investors.fp_mf_investment_account_id`/`fp_mfia_old_id` (E11).
- **Produces:**
  - Domain: `fifoExit(input) → {consumptions, consumedUnits, shortfallUnits}`; `lockInMonthsFor({isElss, lockInMonths})`, `lockInUntil(allotmentDate, months)`, `isLotUnlocked(lockInUntil, exitNavDate)` (strict), `ELSS_LOCK_IN_MONTHS`; `istIsoDate(at)`, `calendarDaysBetween(from, to)`, `businessDaysAfter(from, to, holidays)`.
  - Tables `lots`, `lot_consumptions` (append-only), `ledger_exceptions`, `redemption_reservations` (created here, written by F5); `folios` gains the spec §2.3 columns; `orders` gains `stamp_duty`, `units_source`, `units_pending_since`.
  - `Ledger.applyAllotment(tx, order, allotment) → {lotId, folioId}`, `Ledger.applyExit(tx, order, exit) → {consumedUnits, shortfallUnits}`, `Ledger.reverseAllotment(tx, order)`. All run inside the caller's transaction and never call a provider.
  - `PurchaseSettlement.apply(orderId, purchase)` and `parseAllotment(purchase, orderAmount)`: the one path from a re-fetched FP purchase to SETTLED, UNITS_PENDING, FAILED, EXPIRED or REVERSED.
  - `mfPurchaseEventHandler(settlement)`, replacing E21's `handleMfPurchaseEvent`.
  - Jobs (worker only): `folio.sync` (05:00; data `FolioSyncJobData = {folioId?}`: F5 enqueues `{folioId}` with `singletonKey: folioId` when a quote finds the snapshot older than 24 h) and `orders.units.reconcile` (every 2 h).
  - `toFolioHoldingsSnapshot`, `toFpFolioView`, `compareHoldings`, `HOLDINGS_TOLERANCE` (`fp-holdings.ts`); `FolioHoldingsSnapshot`, `PayoutBankMasked`, `RegisteredContactsMasked`, `FolioReconciliationStatus` (`folios.schema.ts`).
  - Recon break kinds: `LEDGER_UNITS_SHORTFALL`, `LEDGER_REVERSAL_CONSUMED_LOT`, `ALLOTMENT_INVALID` (CRITICAL); `UNITS_PENDING_T3` (WARNING), `UNITS_PENDING_T5` (CRITICAL); `FOLIO_FEED_MISMATCH`, `FOLIO_SYNC_FAILED`, `FP_ORDER_STATE_UNEXPECTED`, `ORDER_FOLIO_DIFFERS` (WARNING).
  - Audit actions (R-20): `ORDER_SETTLED` on every purchase settlement; `ORDER_REVERSED`, `LEDGER_LOT_REVERSED` and `LEDGER_UNITS_SHORTFALL`.
- **For F5 (redemption):** call `Ledger.applyExit` in the transaction that moves the redemption to SETTLED, passing FP's `redeemed_units`, proceeds, NAV and NAV date. Settle the reservation in the same transaction. The quote reads `folios.fp_holdings_snapshot` and `fp_holdings_synced_at`; ALL needs `reconciliation_status = 'MATCHED'` and `last_reconciled_at` within 24 h. Lots with a lock-in (ELSS and the other lock-in schemes all use the STANDARD cut-off) are checked with `isLotUnlocked(lot.lockInUntil, exitNavDate)`, where `exitNavDate` comes from `expectedNavDate({cutoffClass: 'STANDARD', …})`, as the ELSS vectors do. The redemption NAV-date rule for liquid funds is F5's.
- **Rules pinned here** (spec §4.2/§4.4, design §F.8/§H, D-MONEY-050/052):
  - **FIFO.** Eligible lots have units remaining, are unlocked under the strict rule, and were allotted on or before the exit's NAV date (a same-day lot counts; v1 CG-05). They are consumed in `(allotment_date, id)` order. Cost is `round_half_up(cost_amount × units ÷ lot units, 2)`, capped at the lot's remaining cost; the consumption that empties a lot takes its remaining cost. Proceeds are split the same way over the redeemed units, and the consumption that completes the exit takes the remaining proceeds.
  - **ELSS.** `lock_in_until = allotment date + lock-in months`, with the day clamped to the month end (29-Feb → 28-Feb, 31 → 30). The lock-in is the scheme's `lock_in_months`, never under 36 for ELSS, so a solution-oriented lock-in is honoured too. A lot unlocks only when the exit's NAV date is **after** `lock_in_until`.
  - **Allotment.** Cost is the gross amount paid. `stamp_duty = amount − purchased_amount`, and the order records it too. Units, NAV, NAV date and folio number come from FP only. An allotment the ledger cannot hold exactly is INVALID and is never rounded.
  - **Folio upsert.** There is one row per `(amc_id, folio_number)`. A folio number that belongs to another investor is refused, and the whole transaction rolls back.
  - **Reconciliation.** `folio.sync` compares Σ OPEN `units_remaining` per ISIN with FP's units: MATCHED within 0.001, otherwise MISMATCH. If the report has no row for the folio, the result is FEED_UNAVAILABLE. Any OPEN non-feed exception on the folio keeps it MISMATCH. A FEED_MISMATCH resolves itself once the numbers converge. A UNITS_SHORTFALL waits for ops.
- **Deviations from the outline:**
  1. `applyAllotment`/`applyExit` take the provider data explicitly: `(tx, order, allotment)` and `(tx, order, exit)`, not `(tx, order)` and `(tx, order, redeemedUnits)`. `lot_consumptions` needs the sale NAV, date and proceeds, and the purchase is parsed once, in `parseAllotment`.
  2. `orders.units.reconcile` also sweeps PROCESSING purchases. Nothing else re-fetches a PROCESSING purchase whose webhook was lost (`fp.reconcile.nonfinal` handles RECONCILING only).
  3. `folio.sync` also writes `reconciliation_status`/`last_reconciled_at`. It is the one job holding both FP's and the ledger's units, and F5's ALL rule needs MATCHED within 24 h.
  4. `business-days.ts` is added (T+n SLA counting and the IST date); `ledger_exceptions` gains `isin` and `detail`, with `folio_id`/`scheme_id` nullable (a UNITS_UNKNOWN before FP names a folio; an ISIN the catalogue lacks).
  5. The D1, D5, D4 and E21 edits listed in **Files** (see the review notes above).

- [ ] **Step 1: Write the failing tests**

`packages/test-fixtures/src/golden/fifo.json` (FIFO-01..FIFO-08; FIFO-03, 04 and 06 list their lots out of order on purpose):
```json
[
  {
    "id": "FIFO-01",
    "note": "partial lot: cost is the proportional share of the original lot",
    "exitNavDate": "2026-06-01",
    "redeemedUnits": "40.000",
    "redeemedAmount": "480.00",
    "lots": [
      { "id": "L1", "allotmentDate": "2026-01-05", "units": "100.000", "unitsRemaining": "100.000", "costAmount": "1000.00", "costRemaining": "1000.00", "lockInUntil": null }
    ],
    "expected": {
      "consumptions": [
        { "lotId": "L1", "units": "40.000", "costAmount": "400.00", "saleAmount": "480.00", "holdingDays": 147, "unitsRemainingAfter": "60.000", "costRemainingAfter": "600.00" }
      ],
      "consumedUnits": "40.000",
      "shortfallUnits": "0.000"
    }
  },
  {
    "id": "FIFO-02",
    "note": "exact lot: the consumption that empties a lot takes its remaining cost (33.34, not round(100/3) = 33.33)",
    "exitNavDate": "2026-06-01",
    "redeemedUnits": "1.000",
    "redeemedAmount": "12.00",
    "lots": [
      { "id": "L1", "allotmentDate": "2026-01-05", "units": "3.000", "unitsRemaining": "1.000", "costAmount": "100.00", "costRemaining": "33.34", "lockInUntil": null }
    ],
    "expected": {
      "consumptions": [
        { "lotId": "L1", "units": "1.000", "costAmount": "33.34", "saleAmount": "12.00", "holdingDays": 147, "unitsRemainingAfter": "0.000", "costRemainingAfter": "0.00" }
      ],
      "consumedUnits": "1.000",
      "shortfallUnits": "0.000"
    }
  },
  {
    "id": "FIFO-03",
    "note": "spans three lots given out of order; proceeds split by units, the completing consumption takes the rest (117.64, not 117.65)",
    "exitNavDate": "2026-06-01",
    "redeemedUnits": "170.000",
    "redeemedAmount": "1000.00",
    "lots": [
      { "id": "L3", "allotmentDate": "2026-03-05", "units": "25.500", "unitsRemaining": "25.500", "costAmount": "330.00", "costRemaining": "330.00", "lockInUntil": null },
      { "id": "L1", "allotmentDate": "2026-01-05", "units": "100.000", "unitsRemaining": "100.000", "costAmount": "1000.00", "costRemaining": "1000.00", "lockInUntil": null },
      { "id": "L2", "allotmentDate": "2026-02-05", "units": "50.000", "unitsRemaining": "50.000", "costAmount": "600.00", "costRemaining": "600.00", "lockInUntil": null }
    ],
    "expected": {
      "consumptions": [
        { "lotId": "L1", "units": "100.000", "costAmount": "1000.00", "saleAmount": "588.24", "holdingDays": 147, "unitsRemainingAfter": "0.000", "costRemainingAfter": "0.00" },
        { "lotId": "L2", "units": "50.000", "costAmount": "600.00", "saleAmount": "294.12", "holdingDays": 116, "unitsRemainingAfter": "0.000", "costRemainingAfter": "0.00" },
        { "lotId": "L3", "units": "20.000", "costAmount": "258.82", "saleAmount": "117.64", "holdingDays": 88, "unitsRemainingAfter": "5.500", "costRemainingAfter": "71.18" }
      ],
      "consumedUnits": "170.000",
      "shortfallUnits": "0.000"
    }
  },
  {
    "id": "FIFO-04",
    "note": "locked ELSS lot skipped: a NAV date equal to lock_in_until is still locked (strict); the rest is a shortfall",
    "exitNavDate": "2029-06-01",
    "redeemedUnits": "15.000",
    "redeemedAmount": "900.00",
    "lots": [
      { "id": "E2", "allotmentDate": "2026-06-01", "units": "40.000", "unitsRemaining": "40.000", "costAmount": "2000.00", "costRemaining": "2000.00", "lockInUntil": "2029-06-01" },
      { "id": "E1", "allotmentDate": "2026-05-04", "units": "10.000", "unitsRemaining": "10.000", "costAmount": "500.00", "costRemaining": "500.00", "lockInUntil": "2029-05-04" }
    ],
    "expected": {
      "consumptions": [
        { "lotId": "E1", "units": "10.000", "costAmount": "500.00", "saleAmount": "600.00", "holdingDays": 1124, "unitsRemainingAfter": "0.000", "costRemainingAfter": "0.00" }
      ],
      "consumedUnits": "10.000",
      "shortfallUnits": "5.000"
    }
  },
  {
    "id": "FIFO-05",
    "note": "a lot allotted after the exit NAV date is skipped; a lot allotted on the same day is consumed",
    "exitNavDate": "2026-11-04",
    "redeemedUnits": "12.000",
    "redeemedAmount": "1200.00",
    "lots": [
      { "id": "A", "allotmentDate": "2026-11-04", "units": "10.000", "unitsRemaining": "10.000", "costAmount": "1000.00", "costRemaining": "1000.00", "lockInUntil": null },
      { "id": "B", "allotmentDate": "2026-11-05", "units": "5.000", "unitsRemaining": "5.000", "costAmount": "500.00", "costRemaining": "500.00", "lockInUntil": null }
    ],
    "expected": {
      "consumptions": [
        { "lotId": "A", "units": "10.000", "costAmount": "1000.00", "saleAmount": "1000.00", "holdingDays": 0, "unitsRemainingAfter": "0.000", "costRemainingAfter": "0.00" }
      ],
      "consumedUnits": "10.000",
      "shortfallUnits": "2.000"
    }
  },
  {
    "id": "FIFO-06",
    "note": "same allotment date: the tie is broken by lot id, whatever the input order",
    "exitNavDate": "2026-06-01",
    "redeemedUnits": "5.000",
    "redeemedAmount": "60.00",
    "lots": [
      { "id": "lot-b", "allotmentDate": "2026-01-05", "units": "10.000", "unitsRemaining": "10.000", "costAmount": "100.00", "costRemaining": "100.00", "lockInUntil": null },
      { "id": "lot-c", "allotmentDate": "2026-01-05", "units": "10.000", "unitsRemaining": "10.000", "costAmount": "300.00", "costRemaining": "300.00", "lockInUntil": null },
      { "id": "lot-a", "allotmentDate": "2026-01-05", "units": "10.000", "unitsRemaining": "10.000", "costAmount": "200.00", "costRemaining": "200.00", "lockInUntil": null }
    ],
    "expected": {
      "consumptions": [
        { "lotId": "lot-a", "units": "5.000", "costAmount": "100.00", "saleAmount": "60.00", "holdingDays": 147, "unitsRemainingAfter": "5.000", "costRemainingAfter": "100.00" }
      ],
      "consumedUnits": "5.000",
      "shortfallUnits": "0.000"
    }
  },
  {
    "id": "FIFO-07",
    "note": "the half-up share (0.005 -> 0.01) is capped at the lot's remaining cost, so cost_remaining never goes negative",
    "exitNavDate": "2026-06-01",
    "redeemedUnits": "1.000",
    "redeemedAmount": "0.05",
    "lots": [
      { "id": "L1", "allotmentDate": "2026-01-05", "units": "4.000", "unitsRemaining": "2.000", "costAmount": "0.02", "costRemaining": "0.00", "lockInUntil": null }
    ],
    "expected": {
      "consumptions": [
        { "lotId": "L1", "units": "1.000", "costAmount": "0.00", "saleAmount": "0.05", "holdingDays": 147, "unitsRemainingAfter": "1.000", "costRemainingAfter": "0.00" }
      ],
      "consumedUnits": "1.000",
      "shortfallUnits": "0.000"
    }
  },
  {
    "id": "FIFO-08",
    "note": "shortfall: every eligible lot is consumed, proceeds stay proportional, and the uncovered units are reported",
    "exitNavDate": "2026-06-01",
    "redeemedUnits": "20.000",
    "redeemedAmount": "250.00",
    "lots": [
      { "id": "L1", "allotmentDate": "2026-01-05", "units": "10.000", "unitsRemaining": "10.000", "costAmount": "100.00", "costRemaining": "100.00", "lockInUntil": null },
      { "id": "L2", "allotmentDate": "2026-02-05", "units": "5.500", "unitsRemaining": "5.500", "costAmount": "66.00", "costRemaining": "66.00", "lockInUntil": null }
    ],
    "expected": {
      "consumptions": [
        { "lotId": "L1", "units": "10.000", "costAmount": "100.00", "saleAmount": "125.00", "holdingDays": 147, "unitsRemainingAfter": "0.000", "costRemainingAfter": "0.00" },
        { "lotId": "L2", "units": "5.500", "costAmount": "66.00", "saleAmount": "68.75", "holdingDays": 116, "unitsRemainingAfter": "0.000", "costRemainingAfter": "0.00" }
      ],
      "consumedUnits": "15.500",
      "shortfallUnits": "4.500"
    }
  }
]
```

`packages/test-fixtures/src/golden/elss-lock.json` (ELSS-01..ELSS-06; exits are priced with E22's `expectedNavDate`, STANDARD cut-off):
```json
[
  { "id": "ELSS-01", "note": "29-Feb allotment locks until 28-Feb; an exit priced on the lock-end date is still locked (strict)", "allotmentDate": "2028-02-29", "isElss": true, "schemeLockInMonths": 36, "expectedLockInMonths": 36, "expectedLockInUntil": "2031-02-28", "exitAtIso": "2031-02-28T04:30:00.000Z", "holidays": [], "expectedExitNavDate": "2031-02-28", "expectedUnlocked": false },
  { "id": "ELSS-02", "note": "29-Feb allotment, lock ends Sun 28-Feb; an exit placed Fri 26-Feb after 15:00 is priced Mon 1-Mar and is unlocked", "allotmentDate": "2024-02-29", "isElss": true, "schemeLockInMonths": 36, "expectedLockInMonths": 36, "expectedLockInUntil": "2027-02-28", "exitAtIso": "2027-02-26T10:00:00.000Z", "holidays": [], "expectedExitNavDate": "2027-03-01", "expectedUnlocked": true },
  { "id": "ELSS-03", "note": "month-end clamp 31 -> 30 (a 37-month scheme lock-in); the lock-end date itself is locked", "allotmentDate": "2026-03-31", "isElss": true, "schemeLockInMonths": 37, "expectedLockInMonths": 37, "expectedLockInUntil": "2029-04-30", "exitAtIso": "2029-04-30T04:30:00.000Z", "holidays": [], "expectedExitNavDate": "2029-04-30", "expectedUnlocked": false },
  { "id": "ELSS-04", "note": "month-end 31 stays 31 over whole years; an exit at exactly 15:00 on the lock-end date rolls to Monday and is unlocked", "allotmentDate": "2026-08-31", "isElss": true, "schemeLockInMonths": 36, "expectedLockInMonths": 36, "expectedLockInUntil": "2029-08-31", "exitAtIso": "2029-08-31T09:30:00.000Z", "holidays": [], "expectedExitNavDate": "2029-09-03", "expectedUnlocked": true },
  { "id": "ELSS-05", "note": "holiday on the unlock date: an exit that morning is priced the next business day, so it is unlocked", "allotmentDate": "2026-11-12", "isElss": true, "schemeLockInMonths": 36, "expectedLockInMonths": 36, "expectedLockInUntil": "2029-11-12", "exitAtIso": "2029-11-12T04:30:00.000Z", "holidays": ["2029-11-12"], "expectedExitNavDate": "2029-11-13", "expectedUnlocked": true },
  { "id": "ELSS-06", "note": "an ELSS scheme without lock_in_months still locks for 36 months; the business day before the lock end is locked", "allotmentDate": "2026-11-02", "isElss": true, "schemeLockInMonths": null, "expectedLockInMonths": 36, "expectedLockInUntil": "2029-11-02", "exitAtIso": "2029-11-01T09:29:00.000Z", "holidays": [], "expectedExitNavDate": "2029-11-01", "expectedUnlocked": false }
]
```

`packages/domain/test/fifo.test.ts`:
```ts
import { Money, Units } from '@sanchay/money';
import { describe, expect, it } from 'vitest';
import golden from '../../test-fixtures/src/golden/fifo.json' with { type: 'json' };
import { toIsoDate } from '../src/ids.js';
import { type FifoConsumption, type FifoLot, fifoExit } from '../src/rules/fifo.js';

interface WireLot {
  id: string;
  allotmentDate: string;
  units: string;
  unitsRemaining: string;
  costAmount: string;
  costRemaining: string;
  lockInUntil: string | null;
}

const lotOf = (w: WireLot): FifoLot => ({
  id: w.id,
  allotmentDate: toIsoDate(w.allotmentDate),
  units: Units.platform(w.units),
  unitsRemaining: Units.platform(w.unitsRemaining),
  costAmount: Money.parse(w.costAmount),
  costRemaining: Money.parse(w.costRemaining),
  lockInUntil: w.lockInUntil === null ? null : toIsoDate(w.lockInUntil),
});

const wireOf = (c: FifoConsumption) => ({
  lotId: c.lotId,
  units: c.units.toWire(),
  costAmount: c.costAmount.toWire(),
  saleAmount: c.saleAmount?.toWire() ?? null,
  holdingDays: c.holdingDays,
  unitsRemainingAfter: c.unitsRemainingAfter.toWire(),
  costRemainingAfter: c.costRemainingAfter.toWire(),
});

describe('fifoExit (golden vectors FIFO-01..FIFO-08)', () => {
  it('has eight vectors with unique ids', () => {
    expect(golden.map((v) => v.id)).toEqual(Array.from({ length: 8 }, (_, i) => `FIFO-0${i + 1}`));
  });

  for (const vector of golden) {
    it(`${vector.id}: ${vector.note}`, () => {
      const result = fifoExit({
        lots: vector.lots.map(lotOf),
        redeemedUnits: Units.platform(vector.redeemedUnits),
        redeemedAmount: Money.parse(vector.redeemedAmount),
        exitNavDate: toIsoDate(vector.exitNavDate),
      });
      expect(result.consumptions.map(wireOf)).toEqual(vector.expected.consumptions);
      expect(result.consumedUnits.toWire()).toBe(vector.expected.consumedUnits);
      expect(result.shortfallUnits.toWire()).toBe(vector.expected.shortfallUnits);
      // Conservation: consumed + shortfall = redeemed, and nothing a lot holds ever goes negative.
      expect(result.consumedUnits.add(result.shortfallUnits).toWire()).toBe(vector.redeemedUnits);
      for (const c of result.consumptions) {
        expect(c.unitsRemainingAfter.isNegative() || c.costRemainingAfter.isNegative()).toBe(false);
      }
    });
  }
});

describe('fifoExit edges', () => {
  const lot = lotOf({
    id: 'L1',
    allotmentDate: '2026-01-05',
    units: '10.000',
    unitsRemaining: '10.000',
    costAmount: '100.00',
    costRemaining: '100.00',
    lockInUntil: null,
  });

  it('unknown proceeds leave every sale amount null', () => {
    const result = fifoExit({
      lots: [lot],
      redeemedUnits: Units.platform('4.000'),
      redeemedAmount: null,
      exitNavDate: toIsoDate('2026-06-01'),
    });
    expect(result.consumptions.map((c) => c.saleAmount)).toEqual([null]);
  });

  it('an empty lot is skipped and no lots at all is a full shortfall', () => {
    const empty = {
      ...lot,
      unitsRemaining: Units.platform('0'),
      costRemaining: Money.parse('0.00'),
    };
    const result = fifoExit({
      lots: [empty],
      redeemedUnits: Units.platform('1.000'),
      redeemedAmount: null,
      exitNavDate: toIsoDate('2026-06-01'),
    });
    expect(result.consumptions).toEqual([]);
    expect(result.shortfallUnits.toWire()).toBe('1.000');
  });

  it('refuses zero, negative or 4-dp redeemed units', () => {
    const exitNavDate = toIsoDate('2026-06-01');
    for (const redeemedUnits of [
      Units.platform('0'),
      Units.platform('-1.000'),
      Units.external('1.0000'),
    ]) {
      expect(() =>
        fifoExit({ lots: [lot], redeemedUnits, redeemedAmount: null, exitNavDate }),
      ).toThrow(RangeError);
    }
  });
});
```

`packages/domain/test/elss-lock.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import golden from '../../test-fixtures/src/golden/elss-lock.json' with { type: 'json' };
import { type IsoDate, toIsoDate } from '../src/ids.js';
import { expectedNavDate } from '../src/rules/cutoff.js';
import {
  ELSS_LOCK_IN_MONTHS,
  isLotUnlocked,
  lockInMonthsFor,
  lockInUntil,
} from '../src/rules/elss-lock.js';

describe('ELSS lock (golden vectors ELSS-01..ELSS-06)', () => {
  it('has six vectors with unique ids', () => {
    expect(golden.map((v) => v.id)).toEqual(Array.from({ length: 6 }, (_, i) => `ELSS-0${i + 1}`));
  });

  for (const vector of golden) {
    it(`${vector.id}: ${vector.note}`, () => {
      const months = lockInMonthsFor({
        isElss: vector.isElss,
        lockInMonths: vector.schemeLockInMonths,
      });
      expect(months).toBe(vector.expectedLockInMonths);
      const until = lockInUntil(toIsoDate(vector.allotmentDate), months);
      expect(until).toBe(vector.expectedLockInUntil);
      const holidays = new Set<string>(vector.holidays);
      // ELSS is equity: its exit is priced on the STANDARD (15:00) cut-off, E22's expectedNavDate.
      const exit = expectedNavDate({
        cutoffClass: 'STANDARD',
        at: new Date(vector.exitAtIso),
        holidays: { has: (d) => holidays.has(d) },
      });
      expect(exit.navDate).toBe(vector.expectedExitNavDate);
      expect(isLotUnlocked(until, toIsoDate(exit.navDate))).toBe(vector.expectedUnlocked);
    });
  }
});

describe('lock-in edges', () => {
  const d = (s: string): IsoDate => toIsoDate(s);

  it('a scheme without a lock-in never locks', () => {
    expect(lockInMonthsFor({ isElss: false, lockInMonths: null })).toBeNull();
    expect(lockInMonthsFor({ isElss: false, lockInMonths: 0 })).toBeNull();
    expect(lockInUntil(d('2026-11-02'), null)).toBeNull();
    expect(isLotUnlocked(null, d('2026-11-02'))).toBe(true);
  });

  it('keeps a non-ELSS lock-in and raises a short ELSS lock-in to 36 months', () => {
    expect(lockInMonthsFor({ isElss: false, lockInMonths: 60 })).toBe(60);
    expect(lockInMonthsFor({ isElss: true, lockInMonths: 12 })).toBe(ELSS_LOCK_IN_MONTHS);
    expect(lockInUntil(d('2026-11-02'), 60)).toBe('2031-11-02');
  });

  it('refuses a fractional or non-positive lock-in and a malformed date', () => {
    expect(() => lockInUntil(d('2026-11-02'), 1.5)).toThrow(RangeError);
    expect(() => lockInUntil(d('2026-11-02'), -12)).toThrow(RangeError);
    expect(() => lockInUntil('2026-02-30' as IsoDate, 36)).toThrow(RangeError);
  });
});
```

`packages/domain/test/business-days.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { type IsoDate, toIsoDate } from '../src/ids.js';
import { businessDaysAfter, calendarDaysBetween, istIsoDate } from '../src/rules/business-days.js';

const d = (s: string): IsoDate => toIsoDate(s);
const none = { has: () => false };

describe('istIsoDate', () => {
  it('returns the IST calendar date of an instant', () => {
    expect(istIsoDate(new Date('2026-11-02T18:29:59.999Z'))).toBe('2026-11-02');
    expect(istIsoDate(new Date('2026-11-02T18:30:00.000Z'))).toBe('2026-11-03');
  });
});

describe('calendarDaysBetween', () => {
  it('counts calendar days, across a leap day and backwards', () => {
    expect(calendarDaysBetween(d('2026-01-05'), d('2026-06-01'))).toBe(147);
    expect(calendarDaysBetween(d('2028-02-28'), d('2028-03-01'))).toBe(2);
    expect(calendarDaysBetween(d('2026-06-01'), d('2026-01-05'))).toBe(-147);
  });
});

describe('businessDaysAfter', () => {
  it('counts weekdays strictly after `from`, up to and including `to`', () => {
    expect(businessDaysAfter(d('2026-11-02'), d('2026-11-05'), none)).toBe(3); // Mon -> Thu
    expect(businessDaysAfter(d('2026-11-06'), d('2026-11-09'), none)).toBe(1); // Fri -> Mon
  });

  it('skips holidays', () => {
    const holidays = { has: (x: string) => x === '2026-11-10' };
    expect(businessDaysAfter(d('2026-11-09'), d('2026-11-12'), holidays)).toBe(2);
  });

  it('is zero when `to` is not after `from`', () => {
    expect(businessDaysAfter(d('2026-11-05'), d('2026-11-05'), none)).toBe(0);
    expect(businessDaysAfter(d('2026-11-05'), d('2026-11-02'), none)).toBe(0);
  });
});
```

`packages/domain/test/states.test.ts` (D5's file; append):
```ts
describe('ORDER additions (F4)', () => {
  it('FP can reverse a purchase whose units were never reported', () => {
    expect(canTransition('ORDER', 'UNITS_PENDING', 'REVERSED', 'fp_reversed')).toBe(true);
  });
});
```

`apps/api/src/modules/portfolio/fp-holdings.test.ts`:
```ts
import { Units } from '@sanchay/money';
import { describe, expect, it } from 'vitest';
import { compareHoldings, toFolioHoldingsSnapshot, toFpFolioView } from './fp-holdings.js';

/** The shape the FP sandbox returns (probe run 2026-10-01): `folios` at the top level, units as JSON numbers. */
const report = {
  id: 23,
  folios: [
    {
      folio_number: 'OTHER',
      schemes: [{ isin: 'INF000000009', holdings: { units: 1, redeemable_units: 1 } }],
    },
    {
      folio_number: '12345/67',
      schemes: [
        {
          isin: 'INF000000001',
          holdings: { as_on: '2026-11-02', units: 12.3456, redeemable_units: 10.0009 },
        },
        {
          isin: 'INF000000002',
          holdings: { as_on: '2026-11-02', units: 5, redeemable_units: 0 },
        },
        { name: 'no isin: skipped' },
      ],
    },
  ],
};

describe('toFolioHoldingsSnapshot', () => {
  it('picks the folio and floors units to 3 dp (never over-states what FP will redeem)', () => {
    expect(toFolioHoldingsSnapshot(report, '12345/67')).toEqual({
      folioNumber: '12345/67',
      asOn: '2026-11-02',
      schemes: [
        { isin: 'INF000000001', units: '12.345', redeemableUnits: '10.000' },
        { isin: 'INF000000002', units: '5.000', redeemableUnits: '0.000' },
      ],
    });
  });

  it('also reads a report wrapped in `data` (the envelope the research assumed)', () => {
    expect(toFolioHoldingsSnapshot({ data: { folios: report.folios } }, '12345/67')?.schemes).toHaveLength(2);
  });

  it('is null when the report has no row for the folio', () => {
    expect(toFolioHoldingsSnapshot(report, 'MISSING')).toBeNull();
    expect(toFolioHoldingsSnapshot({}, '12345/67')).toBeNull();
  });
});

describe('toFpFolioView', () => {
  it('normalises contacts and masks the payout bank to IFSC + last 4', () => {
    expect(
      toFpFolioView({
        email_addresses: [' Ravi@Example.COM ', 'not-an-email'],
        mobile_numbers: ['+91 98765-43210', '12345'],
        payout_details: [
          { bank_account: { number: 'XXXXXXXX1234', ifsc: 'HDFC0000001', name: 'HDFC Bank' } },
        ],
      }),
    ).toEqual({
      emails: ['ravi@example.com'],
      mobiles: ['9876543210'],
      payoutBank: { ifsc: 'HDFC0000001', last4: '1234', bankName: 'HDFC Bank' },
    });
  });

  it('has no payout bank when FP reports none', () => {
    expect(toFpFolioView({})).toEqual({ emails: [], mobiles: [], payoutBank: null });
  });
});

describe('compareHoldings', () => {
  const ledger = new Map([['INF000000001', Units.platform('12.345')]]);
  const snapshot = (units: string) => ({
    folioNumber: 'F',
    asOn: null,
    schemes: [{ isin: 'INF000000001', units, redeemableUnits: units }],
  });

  it('MATCHED within 0.001 units, MISMATCH beyond it', () => {
    expect(compareHoldings(ledger, snapshot('12.346'))).toEqual({
      status: 'MATCHED',
      mismatches: [],
    });
    expect(compareHoldings(ledger, snapshot('12.347'))).toEqual({
      status: 'MISMATCH',
      mismatches: [
        { isin: 'INF000000001', ledgerUnits: '12.345', fpUnits: '12.347', delta: '0.002' },
      ],
    });
  });

  it('a scheme on only one side is a mismatch', () => {
    expect(compareHoldings(new Map(), snapshot('1.000')).mismatches).toEqual([
      { isin: 'INF000000001', ledgerUnits: '0.000', fpUnits: '1.000', delta: '1.000' },
    ]);
    expect(compareHoldings(ledger, { folioNumber: 'F', asOn: null, schemes: [] }).status).toBe(
      'MISMATCH',
    );
  });

  it('no FP row is FEED_UNAVAILABLE', () => {
    expect(compareHoldings(ledger, null)).toEqual({ status: 'FEED_UNAVAILABLE', mismatches: [] });
  });
});
```

`apps/api/src/modules/portfolio/purchase-settlement.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { toFpPurchaseView } from '../orders/fp-purchase.js';
import { parseAllotment } from './purchase-settlement.js';

const successful = (fields: Record<string, unknown>) =>
  toFpPurchaseView({
    id: 'mfp_1',
    old_id: 1,
    state: 'successful',
    folio_number: 'F-1',
    allotted_units: '12.345',
    purchased_amount: '4999.75',
    purchased_price: '405.0023',
    allotted_nav_date: '2026-11-02',
    ...fields,
  });

describe('parseAllotment', () => {
  it('COMPLETE when every allotment field is present and exact', () => {
    const parsed = parseAllotment(successful({}), '5000.00');
    expect(parsed.kind).toBe('COMPLETE');
    if (parsed.kind !== 'COMPLETE') return;
    expect({
      units: parsed.allotment.units.toWire(),
      nav: parsed.allotment.nav.toWire(),
      navDate: parsed.allotment.navDate,
      purchasedAmount: parsed.allotment.purchasedAmount.toWire(),
      folioNumber: parsed.allotment.folioNumber,
    }).toEqual({
      units: '12.345',
      nav: '405.002300',
      navDate: '2026-11-02',
      purchasedAmount: '4999.75',
      folioNumber: 'F-1',
    });
  });

  it('INCOMPLETE when any allotment field is missing (UNITS_PENDING)', () => {
    for (const missing of [
      'allotted_units',
      'purchased_amount',
      'purchased_price',
      'allotted_nav_date',
      'folio_number',
    ]) {
      expect(parseAllotment(successful({ [missing]: null }), '5000.00')).toEqual({
        kind: 'INCOMPLETE',
      });
    }
    expect(parseAllotment(successful({ folio_number: '' }), '5000.00')).toEqual({
      kind: 'INCOMPLETE',
    });
  });

  it('INVALID, never rounded: 4-dp units, zero units, a datetime NAV date, net above the amount', () => {
    expect(parseAllotment(successful({ allotted_units: '12.3456' }), '5000.00').kind).toBe(
      'INVALID',
    );
    expect(parseAllotment(successful({ allotted_units: '0' }), '5000.00')).toEqual({
      kind: 'INVALID',
      reason: 'allotted_units is not positive',
    });
    expect(
      parseAllotment(successful({ allotted_nav_date: '2026-11-02T00:00:00Z' }), '5000.00'),
    ).toEqual({ kind: 'INVALID', reason: 'allotted_nav_date is not a calendar date' });
    expect(parseAllotment(successful({ purchased_amount: '5000.01' }), '5000.00')).toEqual({
      kind: 'INVALID',
      reason: 'purchased_amount is outside 0..amount',
    });
  });
});
```

`apps/api/test/int/ledger-seed.ts`:
```ts
import { eq } from 'drizzle-orm';
import type { FakeFpAdvanceFields } from '../../src/integrations/fp/fake/fake-fp.js';
import { FpRead } from '../../src/integrations/fp/fp-read.js';
import { FP_EVENT_HANDLERS } from '../../src/integrations/fp/webhooks/fp-event-handlers.js';
import { amcs, schemes, sebiCategories } from '../../src/modules/catalogue/catalogue.schema.js';
import { orders } from '../../src/modules/orders/orders.schema.js';
import { newId } from '../../src/modules/platform/ids.js';
import { folios } from '../../src/modules/portfolio/folios.schema.js';
import type { FpTestApp } from './fake-fp.js';
import type { ReadyInvestor } from './onboarding-seed.js';

export type Investor = ReadyInvestor & { mfiaId: string };
export type Scheme = { id: string; isin: string };

/** A PUBLISHED ELSS scheme: category EQ_ELSS (so `is_elss` is true), 36-month lock-in. */
export async function seedElssScheme(t: FpTestApp): Promise<Scheme> {
  const suffix = newId('schemes').slice(-6).toUpperCase();
  const amcId = newId('amcs');
  await t.db.db
    .insert(amcs)
    .values({ id: amcId, name: `ELSS AMC ${suffix}`, slug: `elss-amc-${suffix.toLowerCase()}` });
  await t.db.db
    .insert(sebiCategories)
    .values({
      code: 'EQ_ELSS',
      assetClass: 'EQUITY',
      name: 'ELSS',
      slug: 'elss',
      cutoffClass: 'STANDARD',
      volatilityClass: 'V_EQUITY',
    })
    .onConflictDoNothing();
  const id = newId('schemes');
  const isin = `INF${suffix.padEnd(6, '0')}02020`.slice(0, 12);
  await t.db.db.insert(schemes).values({
    id,
    isin,
    amcId,
    name: 'Test ELSS Tax Saver - Regular Growth',
    slug: `test-elss-${suffix.toLowerCase()}`,
    categoryCode: 'EQ_ELSS',
    lockInMonths: 36,
    fpActive: true,
    purchaseAllowed: true,
    redemptionAllowed: true,
    status: 'PUBLISHED',
    curated: true,
  });
  return { id, isin };
}

/**
 * A purchase FP has accepted (PROCESSING) with its FakeFp object `submitted`. The saga up to here is
 * E20/E21's to test; ledger tests start at the provider's allotment.
 */
export async function seedProcessingPurchase(
  t: FpTestApp,
  investor: Investor,
  scheme: Scheme,
  amount = '5000.00',
): Promise<{ orderId: string; fpOrderId: string }> {
  const orderId = newId('orders');
  const fpOrderId = t.fakeFp.state.nextId('mfp_');
  const oldId = t.fakeFp.state.nextOldId();
  t.fakeFp.state.purchases.set(fpOrderId, {
    id: fpOrderId,
    oldId,
    state: 'submitted',
    amount,
    scheme: scheme.isin,
    mfInvestmentAccount: investor.mfiaId,
    sourceRefId: orderId,
    folioNumber: null,
    consent: { isd_code: '91' },
    plan: null,
    allottedUnits: null,
    purchasedAmount: null,
    purchasedPrice: null,
    allottedNavDate: null,
  });
  t.fakeFp.state.purchasesByOldId.set(oldId, fpOrderId);
  await t.db.db.insert(orders).values({
    id: orderId,
    createdBy: investor.investorId,
    updatedBy: investor.investorId,
    investorId: investor.investorId,
    type: 'PURCHASE',
    schemeId: scheme.id,
    amount,
    status: 'PROCESSING',
    bankAccountId: investor.bankId,
    paymentMethod: 'NETBANKING',
    arn: t.env.SANCHAY_PLATFORM_ARN,
    initiatedVia: 'web',
    userIp: '203.0.113.10',
    fpOrderId,
    fpOldId: oldId,
    fpState: 'submitted',
    submitAttempts: 1,
  });
  return { orderId, fpOrderId };
}

/** FP allots the purchase (`successful` plus the allotment fields FP fills in). */
export function allot(t: FpTestApp, fpOrderId: string, fields: FakeFpAdvanceFields): void {
  t.fakeFp.advance(fpOrderId, 'successful', fields);
}

/** Runs the registered `mf_purchase` handler exactly as fp.event.process would. */
export async function deliverPurchaseEvent(t: FpTestApp, fpOrderId: string): Promise<void> {
  const handler = FP_EVENT_HANDLERS.mf_purchase;
  if (handler === undefined) throw new Error('no mf_purchase handler registered');
  await handler({
    db: t.db.db,
    fpRead: t.app.get(FpRead),
    event: { objectType: 'mf_purchase', objectId: fpOrderId } as never,
  });
}

/** Seeds, allots and settles one purchase; returns the order and the folio it landed in. */
export async function settledPurchase(
  t: FpTestApp,
  investor: Investor,
  scheme: Scheme,
  fields: FakeFpAdvanceFields & { amount?: string },
): Promise<{ orderId: string; fpOrderId: string; folioId: string }> {
  const { amount, ...allotment } = fields;
  const seeded = await seedProcessingPurchase(t, investor, scheme, amount);
  allot(t, seeded.fpOrderId, allotment);
  await deliverPurchaseEvent(t, seeded.fpOrderId);
  const [row] = await t.db.db
    .select({ folioId: orders.folioId })
    .from(orders)
    .where(eq(orders.id, seeded.orderId));
  if (row?.folioId == null) throw new Error('purchase did not settle into a folio');
  return { ...seeded, folioId: row.folioId };
}

/** A redemption order FP has processed, ready for Ledger.applyExit (F5 owns the real flow). */
export async function seedRedemption(
  t: FpTestApp,
  investor: Investor,
  schemeId: string,
  folioId: string,
): Promise<typeof orders.$inferSelect> {
  const id = newId('orders');
  await t.db.db.insert(orders).values({
    id,
    createdBy: investor.investorId,
    updatedBy: investor.investorId,
    investorId: investor.investorId,
    type: 'REDEMPTION',
    schemeId,
    folioId,
    mode: 'AMOUNT',
    amount: '1000.00',
    status: 'PROCESSING',
    bankAccountId: investor.bankId,
    arn: t.env.SANCHAY_PLATFORM_ARN,
    initiatedVia: 'web',
    userIp: '203.0.113.10',
  });
  const [row] = await t.db.db.select().from(orders).where(eq(orders.id, id));
  if (row === undefined) throw new Error('redemption seed failed');
  return row;
}

export async function folioOf(t: FpTestApp, folioId: string) {
  const [row] = await t.db.db.select().from(folios).where(eq(folios.id, folioId));
  if (row === undefined) throw new Error(`no folio ${folioId}`);
  return row;
}
```

`apps/api/test/int/ledger.int.test.ts`:
```ts
import { and, asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { notifications } from '../../src/modules/notifications/notifications.schema.js';
import { orderEvents, orders } from '../../src/modules/orders/orders.schema.js';
import { Jobs } from '../../src/modules/platform/jobs/jobs.service.js';
import { reconBreaks } from '../../src/modules/platform/kernel.schema.js';
import { pgConstraintOf } from '../../src/modules/platform/pg-errors.js';
import { auditEvents } from '../../src/modules/platform/platform.schema.js';
import { ReconBreaks } from '../../src/modules/platform/runtime-config.js';
import { Ledger } from '../../src/modules/portfolio/ledger.service.js';
import {
  ledgerExceptions,
  lotConsumptions,
  lots,
} from '../../src/modules/portfolio/portfolio.schema.js';
import { bootFpTestApp, type FpTestApp } from './fake-fp.js';
import {
  allot,
  deliverPurchaseEvent,
  folioOf,
  type Investor,
  type Scheme,
  seedElssScheme,
  seedProcessingPurchase,
  seedRedemption,
  settledPurchase,
} from './ledger-seed.js';
import { seedInvestableInvestor, seedScheme } from './orders-seed.js';

let t: FpTestApp;
let investor: Investor;
let flexi: Scheme;
let elss: Scheme;

const ALLOTMENT = {
  allottedUnits: '12.345',
  purchasedAmount: '4999.75',
  purchasedPrice: '405.0023',
  allottedNavDate: '2026-10-12',
};

beforeAll(async () => {
  t = await bootFpTestApp();
  vi.spyOn(t.app.get(Jobs), 'enqueue').mockResolvedValue(undefined); // nothing races the pg-boss worker
  investor = await seedInvestableInvestor(t);
  flexi = await seedScheme(t);
  elss = await seedElssScheme(t);
});
afterAll(async () => {
  await t.close();
});

const orderOf = async (id: string) => {
  const [row] = await t.db.db.select().from(orders).where(eq(orders.id, id));
  if (row === undefined) throw new Error(`no order ${id}`);
  return row;
};
const lotFor = async (orderId: string) =>
  (await t.db.db.select().from(lots).where(eq(lots.sourceOrderId, orderId)))[0];
const breaksOn = async (entityId: string) =>
  (await t.db.db.select().from(reconBreaks).where(eq(reconBreaks.entityId, entityId))).map((b) => [
    b.kind,
    b.severity,
  ]);
const applyExit = (
  exit: typeof orders.$inferSelect,
  units: string,
  amount: string,
  navDate: string,
) =>
  t.db.db.transaction((tx) =>
    t.app.get(Ledger).applyExit(tx, exit, { units, amount, nav: null, navDate }),
  );

describe('settlement: the mf_purchase handler through PurchaseSettlement and Ledger.applyAllotment', () => {
  it('successful with units -> SETTLED; one transaction writes the lot, folio, email and audit row', async () => {
    const { orderId, fpOrderId } = await seedProcessingPurchase(t, investor, flexi);
    allot(t, fpOrderId, { ...ALLOTMENT, folioNumber: 'F-100' });
    await deliverPurchaseEvent(t, fpOrderId);

    const order = await orderOf(orderId);
    expect(order).toMatchObject({
      status: 'SETTLED',
      unitsSource: 'PROVIDER',
      allottedNavDate: '2026-10-12',
    });
    expect(await lotFor(orderId)).toMatchObject({
      investorId: investor.investorId,
      folioId: order.folioId,
      lotType: 'PURCHASE',
      allotmentDate: '2026-10-12',
      units: '12.345',
      unitsRemaining: '12.345',
      costAmount: '5000.00',
      costRemaining: '5000.00',
      lockInUntil: null,
      status: 'OPEN',
    });
    expect(await folioOf(t, order.folioId ?? '')).toMatchObject({
      folioNumber: 'F-100',
      status: 'ACTIVE',
    });
    const [email] = await t.db.db
      .select()
      .from(notifications)
      .where(eq(notifications.dedupeKey, `order-allotted:${orderId}`));
    expect(email?.templateKey).toBe('ORDER_ALLOTTED');
    const audit = await t.db.db.select().from(auditEvents).where(eq(auditEvents.entityId, orderId));
    expect(audit.map((a) => a.action)).toContain('ORDER_SETTLED');
    const events = await t.db.db.select().from(orderEvents).where(eq(orderEvents.orderId, orderId));
    expect(events.map((e) => e.trigger)).toEqual(['fp_successful_with_units']);

    await deliverPurchaseEvent(t, fpOrderId); // webhooks are at-least-once
    expect(await t.db.db.select().from(lots).where(eq(lots.sourceOrderId, orderId))).toHaveLength(
      1,
    );
  });

  it('stamp duty derived equals amount − purchased_amount', async () => {
    const { orderId } = await settledPurchase(t, investor, flexi, {
      ...ALLOTMENT,
      amount: '12345.67',
      purchasedAmount: '12345.05',
      folioNumber: 'F-110',
    });
    expect((await orderOf(orderId)).stampDuty).toBe('0.62');
    expect(await lotFor(orderId)).toMatchObject({ costAmount: '12345.67', stampDuty: '0.62' });
  });

  it("a second purchase into the same folio reuses the row; another investor's folio number is refused", async () => {
    const first = await settledPurchase(t, investor, flexi, { ...ALLOTMENT, folioNumber: 'F-200' });
    const second = await settledPurchase(t, investor, flexi, {
      ...ALLOTMENT,
      folioNumber: 'F-200',
    });
    expect(second.folioId).toBe(first.folioId);

    const stranger = await seedInvestableInvestor(t);
    const clash = await seedProcessingPurchase(t, stranger, flexi);
    allot(t, clash.fpOrderId, { ...ALLOTMENT, folioNumber: 'F-200' });
    await expect(deliverPurchaseEvent(t, clash.fpOrderId)).rejects.toThrow(/another investor/);
    expect((await orderOf(clash.orderId)).status).toBe('PROCESSING');
    expect(await lotFor(clash.orderId)).toBeUndefined();
  });

  it('successful with null units → UNITS_PENDING, then units_reconciled → SETTLED', async () => {
    const { orderId, fpOrderId } = await seedProcessingPurchase(t, investor, flexi);
    allot(t, fpOrderId, { folioNumber: 'F-300' });
    await deliverPurchaseEvent(t, fpOrderId);
    expect(await orderOf(orderId)).toMatchObject({
      status: 'UNITS_PENDING',
      unitsPendingSince: t.clock.now(),
    });
    expect(await lotFor(orderId)).toBeUndefined();

    allot(t, fpOrderId, ALLOTMENT);
    await deliverPurchaseEvent(t, fpOrderId);
    expect((await orderOf(orderId)).status).toBe('SETTLED');
    const events = await t.db.db
      .select()
      .from(orderEvents)
      .where(eq(orderEvents.orderId, orderId))
      .orderBy(asc(orderEvents.occurredAt), asc(orderEvents.id));
    expect(events.map((e) => e.trigger)).toEqual(['fp_successful_units_null', 'units_reconciled']);
  });

  it('units beyond 3 dp are never rounded: UNITS_PENDING, UNITS_UNKNOWN and a CRITICAL break, no lot', async () => {
    const { orderId, fpOrderId } = await seedProcessingPurchase(t, investor, flexi);
    allot(t, fpOrderId, { ...ALLOTMENT, allottedUnits: '12.3456', folioNumber: 'F-310' });
    await deliverPurchaseEvent(t, fpOrderId);
    expect((await orderOf(orderId)).status).toBe('UNITS_PENDING');
    expect(await lotFor(orderId)).toBeUndefined();
    const [exception] = await t.db.db
      .select()
      .from(ledgerExceptions)
      .where(eq(ledgerExceptions.orderId, orderId));
    expect(exception).toMatchObject({ kind: 'UNITS_UNKNOWN', status: 'OPEN', isin: flexi.isin });
    expect(await breaksOn(orderId)).toEqual([['ALLOTMENT_INVALID', 'CRITICAL']]);
  });

  it('an ELSS lot locks for 36 months from the allotted NAV date (29-Feb -> 28-Feb)', async () => {
    const { orderId } = await settledPurchase(t, investor, elss, {
      ...ALLOTMENT,
      allottedNavDate: '2028-02-29',
      folioNumber: 'E-100',
    });
    expect((await lotFor(orderId))?.lockInUntil).toBe('2031-02-28');
  });

  it('REVERSED untouched lot reversed; consumed lot → CRITICAL', async () => {
    const untouched = await settledPurchase(t, investor, flexi, {
      ...ALLOTMENT,
      folioNumber: 'F-400',
    });
    t.fakeFp.advance(untouched.fpOrderId, 'reversed');
    await deliverPurchaseEvent(t, untouched.fpOrderId);
    expect((await orderOf(untouched.orderId)).status).toBe('REVERSED');
    expect(await lotFor(untouched.orderId)).toMatchObject({
      status: 'REVERSED',
      unitsRemaining: '0.000',
      costRemaining: '0.00',
    });

    const consumed = await settledPurchase(t, investor, flexi, {
      ...ALLOTMENT,
      folioNumber: 'F-410',
    });
    await applyExit(
      await seedRedemption(t, investor, flexi.id, consumed.folioId),
      '1.000',
      '405.00',
      '2026-10-13',
    );
    t.fakeFp.advance(consumed.fpOrderId, 'reversed');
    await deliverPurchaseEvent(t, consumed.fpOrderId);
    expect((await orderOf(consumed.orderId)).status).toBe('REVERSED');
    const lot = await lotFor(consumed.orderId);
    expect(lot).toMatchObject({ status: 'OPEN', unitsRemaining: '11.345' });
    expect(await breaksOn(lot?.id ?? '')).toEqual([['LEDGER_REVERSAL_CONSUMED_LOT', 'CRITICAL']]);
  });

  it('UNITS_PENDING → REVERSED; a reversal the machine refuses opens a WARNING break and changes nothing', async () => {
    const pending = await seedProcessingPurchase(t, investor, flexi);
    allot(t, pending.fpOrderId, { folioNumber: 'F-500' });
    await deliverPurchaseEvent(t, pending.fpOrderId);
    t.fakeFp.advance(pending.fpOrderId, 'reversed');
    await deliverPurchaseEvent(t, pending.fpOrderId);
    expect((await orderOf(pending.orderId)).status).toBe('REVERSED');

    const processing = await seedProcessingPurchase(t, investor, flexi);
    t.fakeFp.advance(processing.fpOrderId, 'reversed');
    await deliverPurchaseEvent(t, processing.fpOrderId);
    expect((await orderOf(processing.orderId)).status).toBe('PROCESSING');
    expect(await breaksOn(processing.orderId)).toEqual([['FP_ORDER_STATE_UNEXPECTED', 'WARNING']]);
  });

  it('orders before PROCESSING are left to the saga jobs', async () => {
    const { orderId, fpOrderId } = await seedProcessingPurchase(t, investor, flexi);
    await t.db.db.update(orders).set({ status: 'AWAITING_PAYMENT' }).where(eq(orders.id, orderId));
    allot(t, fpOrderId, { ...ALLOTMENT, folioNumber: 'F-600' });
    await deliverPurchaseEvent(t, fpOrderId);
    expect((await orderOf(orderId)).status).toBe('AWAITING_PAYMENT');
    expect(await lotFor(orderId)).toBeUndefined();
  });
});

describe('Ledger.applyExit', () => {
  const lotsOf = async (folioId: string) =>
    t.db.db.select().from(lots).where(eq(lots.folioId, folioId)).orderBy(asc(lots.allotmentDate));

  it('FIFO over three lots writes one consumption per lot and closes emptied lots', async () => {
    const base = { purchasedPrice: '10.000000', folioNumber: 'X-1' };
    await settledPurchase(t, investor, flexi, {
      ...base,
      amount: '1000.00',
      purchasedAmount: '1000.00',
      allottedUnits: '100.000',
      allottedNavDate: '2026-01-05',
    });
    await settledPurchase(t, investor, flexi, {
      ...base,
      amount: '600.00',
      purchasedAmount: '600.00',
      allottedUnits: '50.000',
      allottedNavDate: '2026-02-05',
    });
    const { folioId } = await settledPurchase(t, investor, flexi, {
      ...base,
      amount: '330.00',
      purchasedAmount: '330.00',
      allottedUnits: '25.500',
      allottedNavDate: '2026-03-05',
    });
    const exit = await seedRedemption(t, investor, flexi.id, folioId);

    expect(await applyExit(exit, '170.000', '1000.00', '2026-06-01')).toEqual({
      consumedUnits: '170.000',
      shortfallUnits: '0.000',
    });
    const consumed = await t.db.db
      .select()
      .from(lotConsumptions)
      .where(eq(lotConsumptions.exitOrderId, exit.id));
    expect(
      consumed.map((c) => [c.units, c.costAmount, c.saleAmount, c.saleDate, c.holdingDays]).sort(),
    ).toEqual(
      [
        ['100.000', '1000.00', '588.24', '2026-06-01', 147],
        ['50.000', '600.00', '294.12', '2026-06-01', 116],
        ['20.000', '258.82', '117.64', '2026-06-01', 88],
      ].sort(),
    );
    expect(
      (await lotsOf(folioId)).map((l) => [l.status, l.unitsRemaining, l.costRemaining]),
    ).toEqual([
      ['CLOSED', '0.000', '0.00'],
      ['CLOSED', '0.000', '0.00'],
      ['OPEN', '5.500', '71.18'],
    ]);
  });

  it('shortfall never rolls back', async () => {
    const { folioId } = await settledPurchase(t, investor, flexi, {
      amount: '100.00',
      purchasedAmount: '100.00',
      purchasedPrice: '10.000000',
      allottedUnits: '10.000',
      allottedNavDate: '2026-01-05',
      folioNumber: 'X-2',
    });
    const exit = await seedRedemption(t, investor, flexi.id, folioId);
    expect(await applyExit(exit, '12.000', '130.00', '2026-06-01')).toEqual({
      consumedUnits: '10.000',
      shortfallUnits: '2.000',
    });
    // Committed together: what existed is consumed, and the gap is recorded, flagged and paged.
    expect(
      await t.db.db.select().from(lotConsumptions).where(eq(lotConsumptions.exitOrderId, exit.id)),
    ).toHaveLength(1);
    const [exception] = await t.db.db
      .select()
      .from(ledgerExceptions)
      .where(
        and(eq(ledgerExceptions.orderId, exit.id), eq(ledgerExceptions.kind, 'UNITS_SHORTFALL')),
      );
    expect(exception).toMatchObject({
      expectedUnits: '10.000',
      providerUnits: '12.000',
      delta: '2.000',
      status: 'OPEN',
    });
    expect((await folioOf(t, folioId)).reconciliationStatus).toBe('MISMATCH');
    expect(await breaksOn(exit.id)).toEqual([['LEDGER_UNITS_SHORTFALL', 'CRITICAL']]);
    const audit = await t.db.db.select().from(auditEvents).where(eq(auditEvents.entityId, exit.id));
    expect(audit.map((a) => a.action)).toEqual(['LEDGER_UNITS_SHORTFALL']);
  });

  it('skips a locked ELSS lot: a NAV date equal to lock_in_until is still locked', async () => {
    const base = { purchasedPrice: '50.000000', folioNumber: 'E-200' };
    await settledPurchase(t, investor, elss, {
      ...base,
      amount: '500.00',
      purchasedAmount: '500.00',
      allottedUnits: '10.000',
      allottedNavDate: '2026-05-04',
    });
    const { folioId } = await settledPurchase(t, investor, elss, {
      ...base,
      amount: '2000.00',
      purchasedAmount: '2000.00',
      allottedUnits: '40.000',
      allottedNavDate: '2026-06-01',
    });
    const exit = await seedRedemption(t, investor, elss.id, folioId);
    expect(await applyExit(exit, '15.000', '900.00', '2029-06-01')).toEqual({
      consumedUnits: '10.000',
      shortfallUnits: '5.000',
    });
    expect((await lotsOf(folioId)).map((l) => [l.lockInUntil, l.unitsRemaining])).toEqual([
      ['2029-05-04', '0.000'],
      ['2029-06-01', '40.000'],
    ]);
  });

  it('the same exit applied twice fails on lot_consumptions_lot_exit_uq and changes nothing', async () => {
    const { folioId } = await settledPurchase(t, investor, flexi, {
      amount: '100.00',
      purchasedAmount: '100.00',
      purchasedPrice: '10.000000',
      allottedUnits: '10.000',
      allottedNavDate: '2026-01-05',
      folioNumber: 'X-3',
    });
    const exit = await seedRedemption(t, investor, flexi.id, folioId);
    await applyExit(exit, '4.000', '48.00', '2026-06-01');
    const second = await applyExit(exit, '4.000', '48.00', '2026-06-01').then(
      () => null,
      pgConstraintOf,
    );
    expect(second).toBe('lot_consumptions_lot_exit_uq');
    expect((await lotsOf(folioId)).map((l) => l.unitsRemaining)).toEqual(['6.000']);
  });
});

describe('ReconBreaks.open (Plan 02 D1 erratum)', () => {
  it('opening an already-open break inside a transaction does not abort it', async () => {
    const input = {
      kind: 'TEST_TWICE',
      entityType: 'folios',
      entityId: 'twice-1',
      severity: 'WARNING' as const,
    };
    await t.db.db.transaction(async (tx) => {
      await ReconBreaks.open(tx, input);
      await ReconBreaks.open(tx, input);
      await ReconBreaks.open(tx, { ...input, entityId: 'twice-2' }); // runs only if the transaction is alive
    });
    expect(await breaksOn('twice-1')).toEqual([['TEST_TWICE', 'WARNING']]);
    expect(await breaksOn('twice-2')).toEqual([['TEST_TWICE', 'WARNING']]);
  });
});
```

`apps/api/test/int/folio-sync.int.test.ts`:
```ts
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { marketHolidays } from '../../src/modules/catalogue/catalogue.schema.js';
import { orders } from '../../src/modules/orders/orders.schema.js';
import { MINUTE } from '../../src/modules/platform/clock.js';
import { Crypto } from '../../src/modules/platform/crypto.js';
import { Jobs } from '../../src/modules/platform/jobs/jobs.service.js';
import { reconBreaks } from '../../src/modules/platform/kernel.schema.js';
import { FolioSyncJob } from '../../src/modules/portfolio/folio-sync.job.js';
import { Ledger } from '../../src/modules/portfolio/ledger.service.js';
import { ledgerExceptions } from '../../src/modules/portfolio/portfolio.schema.js';
import { UnitsReconcileJob } from '../../src/modules/portfolio/units-reconcile.job.js';
import { bootFpTestApp, type FpTestApp } from './fake-fp.js';
import { jobOf } from './jobs.js';
import {
  allot,
  deliverPurchaseEvent,
  folioOf,
  type Investor,
  type Scheme,
  seedProcessingPurchase,
  seedRedemption,
  settledPurchase,
} from './ledger-seed.js';
import { seedInvestableInvestor, seedScheme } from './orders-seed.js';

let t: FpTestApp;
let investor: Investor;
let scheme: Scheme;

const ALLOTMENT = {
  allottedUnits: '12.345',
  purchasedAmount: '4999.75',
  purchasedPrice: '405.0023',
  allottedNavDate: '2026-10-12',
};

beforeAll(async () => {
  t = await bootFpTestApp();
  vi.spyOn(t.app.get(Jobs), 'enqueue').mockResolvedValue(undefined);
  investor = await seedInvestableInvestor(t);
  scheme = await seedScheme(t);
});
afterAll(async () => {
  await t.close();
});

const breaksOn = async (entityId: string) =>
  (await t.db.db.select().from(reconBreaks).where(eq(reconBreaks.entityId, entityId))).map((b) => [
    b.kind,
    b.severity,
  ]);
const statusOf = async (orderId: string) =>
  (await t.db.db.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId)))[0]
    ?.status;

describe('folio.sync', () => {
  let folioId: string;
  const sync = () => t.app.get(FolioSyncJob).handle(jobOf('folio.sync', { folioId }));
  const fpHolds = (units: string) =>
    t.fakeFp.state.folios.set('S-1', {
      folioNumber: 'S-1',
      mfInvestmentAccount: investor.mfiaId,
      investmentAccountOldId: 7001,
      emailAddresses: ['Ravi@Example.com'],
      mobileNumbers: ['+919876543210'],
      payoutBank: { number: 'XXXXXXXX1234', ifsc: 'HDFC0000001', name: 'HDFC Bank' },
      holdings: new Map([[scheme.isin, { units, redeemableUnits: units }]]),
    });
  const feedMismatches = () =>
    t.db.db
      .select()
      .from(ledgerExceptions)
      .where(
        and(eq(ledgerExceptions.folioId, folioId), eq(ledgerExceptions.kind, 'FEED_MISMATCH')),
      );

  beforeAll(async () => {
    ({ folioId } = await settledPurchase(t, investor, scheme, {
      ...ALLOTMENT,
      folioNumber: 'S-1',
    }));
  });

  it('writes the FP holdings snapshot, contacts (blind index + masked) and payout bank; MATCHED within 0.001', async () => {
    fpHolds('12.3456');
    await sync();
    const folio = await folioOf(t, folioId);
    expect(folio).toMatchObject({
      reconciliationStatus: 'MATCHED',
      lastReconciledAt: t.clock.now(),
      fpHoldingsSyncedAt: t.clock.now(),
      registeredContactsMasked: { mobiles: ['••••••3210'], emails: ['r•••@example.com'] },
      payoutBankMasked: { ifsc: 'HDFC0000001', last4: '1234', bankName: 'HDFC Bank' },
    });
    expect(folio.fpHoldingsSnapshot?.schemes).toEqual([
      { isin: scheme.isin, units: '12.345', redeemableUnits: '12.345' },
    ]);
    const crypto = t.app.get(Crypto);
    expect(folio.registeredMobileBidx[0]?.equals(crypto.blindIndex('mobile', '9876543210'))).toBe(
      true,
    );
    expect(
      folio.registeredEmailBidx[0]?.equals(crypto.blindIndex('email', 'ravi@example.com')),
    ).toBe(true);
  });

  it('a mismatch opens FEED_MISMATCH and a WARNING break once; a repeat sync still commits', async () => {
    fpHolds('10.000');
    await sync();
    t.clock.advance(MINUTE);
    await sync(); // the break is already open: a caught 23505 would abort this transaction silently
    const folio = await folioOf(t, folioId);
    expect(folio).toMatchObject({
      reconciliationStatus: 'MISMATCH',
      fpHoldingsSyncedAt: t.clock.now(),
    });
    expect(
      (await feedMismatches()).map((e) => [e.status, e.expectedUnits, e.providerUnits, e.delta]),
    ).toEqual([['OPEN', '12.345', '10.000', '-2.345']]);
    expect(await breaksOn(folioId)).toEqual([['FOLIO_FEED_MISMATCH', 'WARNING']]);
  });

  it('when the feed catches up the folio is MATCHED and the FEED_MISMATCH resolves itself', async () => {
    fpHolds('12.345');
    await sync();
    expect((await folioOf(t, folioId)).reconciliationStatus).toBe('MATCHED');
    expect((await feedMismatches()).map((e) => e.status)).toEqual(['RESOLVED']);
  });

  it('no row for the folio in the report -> FEED_UNAVAILABLE with an empty snapshot', async () => {
    t.fakeFp.state.folios.delete('S-1');
    await sync();
    const folio = await folioOf(t, folioId);
    expect(folio.reconciliationStatus).toBe('FEED_UNAVAILABLE');
    expect(folio.fpHoldingsSnapshot).toEqual({ folioNumber: 'S-1', asOn: null, schemes: [] });
  });

  it('an open UNITS_SHORTFALL keeps the folio MISMATCH even when the numbers agree', async () => {
    const exit = await seedRedemption(t, investor, scheme.id, folioId);
    await t.db.db.transaction((tx) =>
      t.app
        .get(Ledger)
        .applyExit(tx, exit, {
          units: '13.000',
          amount: '100.00',
          nav: null,
          navDate: '2026-10-13',
        }),
    );
    fpHolds('0');
    await sync();
    expect((await folioOf(t, folioId)).reconciliationStatus).toBe('MISMATCH');
  });

  it('an FP failure opens FOLIO_SYNC_FAILED and the sweep moves on', async () => {
    t.fakeFp.script('folio.list', {
      status: 400,
      body: { error: { status: 400, code: 'BAD_REQUEST', message: 'x' } },
    });
    await sync();
    expect(await breaksOn(folioId)).toContainEqual(['FOLIO_SYNC_FAILED', 'WARNING']);
  });
});

describe('orders.units.reconcile', () => {
  const reconcileAt = async (iso: string) => {
    t.clock.set(iso);
    await t.app.get(UnitsReconcileJob).handle(jobOf('orders.units.reconcile', {}));
  };

  it('settles a PROCESSING purchase whose webhook never arrived', async () => {
    const { orderId, fpOrderId } = await seedProcessingPurchase(t, investor, scheme);
    allot(t, fpOrderId, { ...ALLOTMENT, folioNumber: 'U-1' });
    await reconcileAt('2026-11-02T04:30:00.000Z');
    expect(await statusOf(orderId)).toBe('SETTLED');
  });

  it('UNITS_PENDING > T+3 WARN, > T+5 CRITICAL, in business days (holidays excluded)', async () => {
    await t.db.db.delete(marketHolidays);
    await t.db.db
      .insert(marketHolidays)
      .values({ holidayDate: '2026-11-09', kinds: ['EQUITY', 'MONEY_MARKET', 'BANK'] });
    const { orderId, fpOrderId } = await seedProcessingPurchase(t, investor, scheme);
    allot(t, fpOrderId, { folioNumber: 'U-2' });
    t.clock.set('2026-11-02T04:30:00.000Z'); // Mon: T
    await deliverPurchaseEvent(t, fpOrderId);
    expect(await statusOf(orderId)).toBe('UNITS_PENDING');

    await reconcileAt('2026-11-05T04:30:00.000Z'); // Thu: T+3
    expect(await breaksOn(orderId)).toEqual([]);
    await reconcileAt('2026-11-06T04:30:00.000Z'); // Fri: T+4
    expect(await breaksOn(orderId)).toEqual([['UNITS_PENDING_T3', 'WARNING']]);
    await reconcileAt('2026-11-10T04:30:00.000Z'); // Tue: T+5 (Mon 9th is a holiday)
    expect(await breaksOn(orderId)).toEqual([['UNITS_PENDING_T3', 'WARNING']]);
    await reconcileAt('2026-11-11T04:30:00.000Z'); // Wed: T+6
    expect((await breaksOn(orderId)).sort()).toEqual([
      ['UNITS_PENDING_T3', 'WARNING'],
      ['UNITS_PENDING_T5', 'CRITICAL'],
    ]);

    allot(t, fpOrderId, ALLOTMENT);
    await reconcileAt('2026-11-11T06:30:00.000Z');
    expect(await statusOf(orderId)).toBe('SETTLED');
  });

  it('a failed re-fetch still evaluates the SLA', async () => {
    const { orderId } = await seedProcessingPurchase(t, investor, scheme);
    await t.db.db
      .update(orders)
      .set({
        status: 'UNITS_PENDING',
        fpOrderId: 'mfp_unknown_to_fp',
        unitsPendingSince: new Date('2026-10-01T04:30:00.000Z'),
      })
      .where(eq(orders.id, orderId));
    await reconcileAt('2026-11-02T04:30:00.000Z');
    expect(await breaksOn(orderId)).toEqual([['UNITS_PENDING_T5', 'CRITICAL']]);
  });
});
```

`apps/api/test/int/payments.int.test.ts` (E21's file). Replace the `mf_purchase events` describe; in the imports, drop `handleMfPurchaseEvent` and add `FP_EVENT_HANDLERS` (`../../src/integrations/fp/webhooks/fp-event-handlers.js`) and `lots` (`../../src/modules/portfolio/portfolio.schema.js`):
```ts
describe('mf_purchase events', () => {
  it('successful with an allotment -> SETTLED with one lot; the handler re-fetches instead of trusting the payload (F4)', async () => {
    const { attemptId, ref, orderId, fpPaymentId } = await checkedOut();
    await t.app.inject({ method: 'GET', url: `/api/v1/pg/return/${ref}` });
    const payment = t.fakeFp.state.payments.get(fpPaymentId);
    if (payment !== undefined) payment.status = 'SUCCESS';
    await poll(attemptId);
    const fpOrderId = (await orderOf(orderId))?.fpOrderId as string;
    t.fakeFp.advance(fpOrderId, 'successful', {
      folioNumber: 'F-123',
      allottedUnits: '12.345',
      purchasedAmount: '4999.75',
      purchasedPrice: '405.0023',
      allottedNavDate: '2026-10-12',
    });
    await FP_EVENT_HANDLERS.mf_purchase?.({
      db: t.db.db,
      fpRead: t.app.get(FpRead),
      event: { objectType: 'mf_purchase', objectId: fpOrderId } as never,
    });
    expect((await orderOf(orderId))?.status).toBe('SETTLED');
    expect(await t.db.db.select().from(lots).where(eq(lots.sourceOrderId, orderId))).toHaveLength(1);
  });
});
```

`apps/api/test/int/sip-mandate.int.test.ts` (F2's file; key-level edits). Import `lots` from `../../src/modules/portfolio/portfolio.schema.js`, then append to `describe('instalments', …)`:
```ts
  it('an allotted instalment settles through PurchaseSettlement with a SIP_INSTALMENT lot (F4)', async () => {
    const draft = await activeSip();
    const fpPurchaseId = t.fakeFp.addInstalment(draft.fpPlanId, 'submitted');
    await sync();
    t.fakeFp.advance(fpPurchaseId, 'successful', {
      folioNumber: 'F-SIP-1',
      allottedUnits: '12.345',
      purchasedAmount: '4999.75',
      purchasedPrice: '405.0023',
      allottedNavDate: '2026-10-12',
    });
    await sync();
    await sync();
    const [order] = await t.db.db.select().from(orders).where(eq(orders.planId, draft.planId));
    expect(order).toMatchObject({ status: 'SETTLED', unitsSource: 'PROVIDER', allottedNavDate: '2026-10-12' });
    const lotRows = await t.db.db.select().from(lots).where(eq(lots.sourceOrderId, order?.id ?? ''));
    expect(lotRows).toHaveLength(1);
    expect(lotRows[0]).toMatchObject({ lotType: 'SIP_INSTALMENT' });
  });
```
F2's two existing instalment tests stay as they are: `submitted` still mirrors to PROCESSING, `successful` without allotment fields now reaches UNITS_PENDING through `PurchaseSettlement`, and `failed` reaches FAILED the same way.

- [ ] **Step 2: Run them to confirm they fail**

```
pnpm --filter=@sanchay/domain test
pnpm --filter=@sanchay/api test -- fp-holdings purchase-settlement
pnpm --filter=@sanchay/api test:int -- ledger folio-sync
```
Expected: `Cannot find module '../src/rules/fifo.js'` (and `elss-lock.js`, `business-days.js`); the D5 test fails with `expected false to be true`; `Cannot find module './fp-holdings.js'` and `'./purchase-settlement.js'`; the integration files fail to resolve `../../src/modules/portfolio/ledger.service.js`.

- [ ] **Step 3: Minimal implementation**

`packages/domain/src/rules/elss-lock.ts`:
```ts
import { parseIsoDateParts } from '@sanchay/money';
import { type IsoDate, toIsoDate } from '../ids.js';

/** ELSS lock-in: three years from allotment (design §F.8, D-MONEY-052). */
export const ELSS_LOCK_IN_MONTHS = 36;

export interface LockInScheme {
  readonly isElss: boolean;
  /** `schemes.lock_in_months` (FP `lock_in_period`); null when the scheme has none. */
  readonly lockInMonths: number | null;
}

/** The lock-in a new lot inherits: the scheme's own, and never less than 36 months for ELSS. */
export function lockInMonthsFor(scheme: LockInScheme): number | null {
  const own = scheme.lockInMonths !== null && scheme.lockInMonths > 0 ? scheme.lockInMonths : null;
  if (!scheme.isElss) return own;
  return Math.max(own ?? ELSS_LOCK_IN_MONTHS, ELSS_LOCK_IN_MONTHS);
}

/** Day 0 of the next month is the last day of `month` (1-based). */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/**
 * `lock_in_until` = allotment date + lock-in months, with the day clamped to the target month's
 * end (29-Feb → 28-Feb, 31 → 30). Null when the scheme has no lock-in.
 */
export function lockInUntil(allotmentDate: IsoDate, lockInMonths: number | null): IsoDate | null {
  if (lockInMonths === null) return null;
  if (!Number.isInteger(lockInMonths) || lockInMonths <= 0) {
    throw new RangeError('lockInUntil: lockInMonths must be a positive whole number');
  }
  const parts = parseIsoDateParts(allotmentDate);
  if (parts === null) throw new RangeError('lockInUntil: allotmentDate is not a calendar date');
  const monthIndex = parts.month - 1 + lockInMonths;
  const year = parts.year + Math.floor(monthIndex / 12);
  const month = (monthIndex % 12) + 1;
  const day = Math.min(parts.day, daysInMonth(year, month));
  return toIsoDate(`${year}-${pad2(month)}-${pad2(day)}`);
}

/**
 * Strict rule (D-MONEY-052, OX-24): a lot is unlocked only when the exit's NAV date is **after**
 * `lock_in_until`, one day more conservative than the anniversary. ISO dates compare as strings.
 */
export function isLotUnlocked(lockInUntilDate: IsoDate | null, exitNavDate: IsoDate): boolean {
  return lockInUntilDate === null || exitNavDate > lockInUntilDate;
}
```

`packages/domain/src/rules/business-days.ts`:
```ts
import { type IsoDate, toIsoDate } from '../ids.js';
import type { CutoffHolidays } from './cutoff.js';

const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

const pad2 = (n: number): string => String(n).padStart(2, '0');

function utcMidnight(isoDate: IsoDate): number {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}

function isoOf(utcMs: number): IsoDate {
  const d = new Date(utcMs);
  return toIsoDate(`${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`);
}

/** The IST calendar date of an instant (India has no DST, so +05:30 is exact). */
export function istIsoDate(at: Date): IsoDate {
  return isoOf(at.getTime() + IST_OFFSET_MS);
}

/** Calendar days from `from` to `to` (negative when `to` is earlier). */
export function calendarDaysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((utcMidnight(to) - utcMidnight(from)) / DAY_MS);
}

/**
 * Business days (Mon–Fri and not a holiday) strictly after `from`, up to and including `to`.
 * T+n SLAs count with this: an event on T is "past T+3" once this exceeds 3. Zero when `to` ≤ `from`.
 */
export function businessDaysAfter(from: IsoDate, to: IsoDate, holidays: CutoffHolidays): number {
  let count = 0;
  for (let ms = utcMidnight(from) + DAY_MS; ms <= utcMidnight(to); ms += DAY_MS) {
    const dow = new Date(ms).getUTCDay();
    if (dow !== 0 && dow !== 6 && !holidays.has(isoOf(ms))) count += 1;
  }
  return count;
}
```

`packages/domain/src/rules/fifo.ts`:
```ts
import { Money, Rounding, type Units } from '@sanchay/money';
import type { IsoDate } from '../ids.js';
import { calendarDaysBetween } from './business-days.js';
import { isLotUnlocked } from './elss-lock.js';

/** One OPEN lot of a single folio and scheme, as the ledger holds it (units at 3 dp, money at 2 dp). */
export interface FifoLot {
  readonly id: string;
  readonly allotmentDate: IsoDate;
  readonly units: Units;
  readonly unitsRemaining: Units;
  readonly costAmount: Money;
  readonly costRemaining: Money;
  readonly lockInUntil: IsoDate | null;
}

export interface FifoExitInput {
  readonly lots: readonly FifoLot[];
  /** Provider-confirmed units of the exit (FP `redeemed_units`), 3 dp, > 0. */
  readonly redeemedUnits: Units;
  /** Provider-confirmed proceeds, or null when FP has not reported them. */
  readonly redeemedAmount: Money | null;
  /** The exit's NAV date: drives the strict ELSS rule, the same-day rule and holding days. */
  readonly exitNavDate: IsoDate;
}

export interface FifoConsumption {
  readonly lotId: string;
  readonly units: Units;
  readonly costAmount: Money;
  readonly saleAmount: Money | null;
  readonly holdingDays: number;
  readonly unitsRemainingAfter: Units;
  readonly costRemainingAfter: Money;
}

export interface FifoExitResult {
  readonly consumptions: readonly FifoConsumption[];
  readonly consumedUnits: Units;
  /** Units the provider redeemed that no eligible lot covered (SHORTFALL-BREAK when > 0). */
  readonly shortfallUnits: Units;
}

function minMoney(a: Money, b: Money): Money {
  return a.lte(b) ? a : b;
}

/** round_half_up(total × part ÷ whole, 2). */
function share(total: Money, part: Units, whole: Units): Money {
  return Money.round(
    total.toDecimal().times(part.toDecimal()).div(whole.toDecimal()),
    Rounding.HALF_UP,
  );
}

function byAllotmentThenId(a: FifoLot, b: FifoLot): number {
  if (a.allotmentDate !== b.allotmentDate) return a.allotmentDate < b.allotmentDate ? -1 : 1;
  return a.id < b.id ? -1 : 1; // lot ids are primary keys, never equal
}

/**
 * Design §H FIFO. Consumes eligible lots oldest first (allotment date, then id). A lot is eligible when
 * it has units left, is unlocked under the strict ELSS rule, and was allotted on or before the exit's
 * NAV date. Cost per consumption = round_half_up(cost_amount × units ÷ lot units, 2), capped at the
 * lot's remaining cost; the consumption that empties a lot takes the remaining cost. Proceeds are
 * split the same way over the redeemed units; the consumption that completes the exit takes the
 * remaining proceeds. Never throws on a shortfall: it consumes what exists and reports the rest.
 */
export function fifoExit(input: FifoExitInput): FifoExitResult {
  const redeemed = input.redeemedUnits;
  if (redeemed.scale !== 3 || !redeemed.isPositive()) {
    throw new RangeError('fifoExit: redeemedUnits must be positive platform units (3 dp)');
  }
  const eligible = input.lots
    .filter(
      (lot) =>
        lot.unitsRemaining.isPositive() &&
        lot.allotmentDate <= input.exitNavDate &&
        isLotUnlocked(lot.lockInUntil, input.exitNavDate),
    )
    .sort(byAllotmentThenId);

  const consumptions: FifoConsumption[] = [];
  let left = redeemed;
  let proceedsLeft = input.redeemedAmount;
  for (const lot of eligible) {
    if (left.isZero()) break;
    const take = lot.unitsRemaining.compare(left) <= 0 ? lot.unitsRemaining : left;
    const unitsRemainingAfter = lot.unitsRemaining.subtract(take);
    const costAmount = unitsRemainingAfter.isZero()
      ? lot.costRemaining
      : minMoney(share(lot.costAmount, take, lot.units), lot.costRemaining);
    left = left.subtract(take);
    let saleAmount: Money | null = null;
    if (proceedsLeft !== null && input.redeemedAmount !== null) {
      saleAmount = left.isZero()
        ? proceedsLeft
        : minMoney(share(input.redeemedAmount, take, redeemed), proceedsLeft);
      proceedsLeft = proceedsLeft.subtract(saleAmount);
    }
    consumptions.push({
      lotId: lot.id,
      units: take,
      costAmount,
      saleAmount,
      holdingDays: calendarDaysBetween(lot.allotmentDate, input.exitNavDate),
      unitsRemainingAfter,
      costRemainingAfter: lot.costRemaining.subtract(costAmount),
    });
  }
  return { consumptions, consumedUnits: redeemed.subtract(left), shortfallUnits: left };
}
```

`packages/domain/src/rules/index.ts` (append):
```ts
export * from './business-days.js';
export * from './elss-lock.js';
export * from './fifo.js';
```

`packages/domain/src/states/order.ts` (D5; in `ORDER_TRANSITIONS`, right after the `SETTLED → REVERSED` edge):
```ts
  { from: 'SETTLED', to: 'REVERSED', trigger: 'fp_reversed' },
  { from: 'UNITS_PENDING', to: 'REVERSED', trigger: 'fp_reversed' },
```

`apps/api/src/modules/platform/runtime-config.ts` (D1): replace the `ReconBreaks` class. In its imports, add `sql` to the `drizzle-orm` import and drop the `pg-errors` import, which this file no longer uses:
```ts
export class ReconBreaks {
  /**
   * Idempotent while an open break for the same (kind, entity_id) exists. ON CONFLICT on the partial
   * unique index, not a caught 23505: a failed INSERT aborts the caller's transaction, and PostgreSQL
   * then turns its COMMIT into a silent ROLLBACK (F4 erratum).
   */
  static async open(exec: DbExecutor, input: ReconBreakOpenInput): Promise<void> {
    if (!RECON_BREAK_SEVERITIES.includes(input.severity)) {
      throw new TypeError(`ReconBreaks.open: unknown severity '${input.severity}'`);
    }
    await exec
      .insert(reconBreaks)
      .values({
        kind: input.kind,
        entityType: input.entityType,
        entityId: input.entityId,
        severity: input.severity,
        detail: input.detail ?? {},
      })
      .onConflictDoNothing({
        target: [reconBreaks.kind, reconBreaks.entityId],
        where: sql`status <> 'RESOLVED'`,
      });
  }
}
```

`apps/api/src/modules/orders/orders.schema.ts` (E20; key-level additions):
```ts
// after ORDER_PAYOUT_STATUSES:
/** Units come from the provider only (spec §1.4); MANUAL/FEED are P2. */
export const ORDER_UNITS_SOURCES = ['PROVIDER'] as const;

// in the orders columns, after purchasedAmount:
    stampDuty: numeric('stamp_duty', { precision: 18, scale: 2, mode: 'string' }),
    unitsSource: text('units_source', { enum: ORDER_UNITS_SOURCES }),
    unitsPendingSince: tstz('units_pending_since'),

// in the orders table's constraint list:
    check('orders_units_source_ck', inList('units_source', ORDER_UNITS_SOURCES)),
```

`apps/api/src/modules/portfolio/folios.schema.ts` (E20's file, extended; full content):
```ts
import { sql } from 'drizzle-orm';
import { check, customType, index, jsonb, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, appSchema, inList, stdColumns, tstz } from '../../db/app-schema.js';
import { newId } from '../platform/ids.js';

export const FOLIO_STATUSES = ['PENDING', 'ACTIVE'] as const;
/** Spec §2.3. MATCHED is written only by folio.sync; applyExit's SHORTFALL-BREAK writes MISMATCH. */
export const FOLIO_RECONCILIATION_STATUSES = [
  'UNRECONCILED',
  'MATCHED',
  'MISMATCH',
  'FEED_UNAVAILABLE',
] as const;
export type FolioReconciliationStatus = (typeof FOLIO_RECONCILIATION_STATUSES)[number];

/** Masked copies for display and the consent snapshot; the blind indexes are the matchable form. */
export interface RegisteredContactsMasked {
  mobiles: string[];
  emails: string[];
}

/** D-MONEY-054: exits pay out to the folio-registered bank, shown as IFSC + last 4. */
export interface PayoutBankMasked {
  ifsc: string | null;
  last4: string | null;
  bankName: string | null;
}

/**
 * R-09: FP's view of this folio from `GET /api/oms/reports/holdings`, written only by folio.sync. The
 * redemption quote (api role) reads it instead of calling FP. Units are 3-dp strings (floored).
 */
export interface FolioHoldingsSnapshot {
  folioNumber: string;
  asOn: string | null;
  schemes: Array<{ isin: string; units: string; redeemableUnits: string }>;
}

/**
 * bytea[] of HMAC blind indexes. Drizzle's `bytea().array()` writes Buffers as raw bytes into the array
 * literal (Postgres rejects it), so the literal is built here in hex; node-postgres reads bytea[] as Buffer[].
 */
const byteaArray = customType<{ data: Buffer[]; driverData: string | Buffer[] }>({
  dataType: () => 'bytea[]',
  toDriver: (value) => `{${value.map((b) => `"\\\\x${b.toString('hex')}"`).join(',')}}`,
  fromDriver: (value) => {
    if (typeof value === 'string') throw new TypeError('bytea[] arrived unparsed');
    return value;
  },
});

export const folios = appSchema.table(
  'folios',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => newId('folios')),
    ...stdColumns(),
    ...actorColumns(),
    investorId: uuid('investor_id').notNull(),
    amcId: uuid('amc_id').notNull(),
    folioNumber: text('folio_number'),
    status: text('status', { enum: FOLIO_STATUSES }).notNull().default('PENDING'),
    registeredMobileBidx: byteaArray('registered_mobile_bidx').notNull().default(sql`'{}'`),
    registeredEmailBidx: byteaArray('registered_email_bidx').notNull().default(sql`'{}'`),
    registeredContactsMasked: jsonb('registered_contacts_masked').$type<RegisteredContactsMasked>(),
    payoutBankMasked: jsonb('payout_bank_masked').$type<PayoutBankMasked>(),
    contactsSyncedAt: tstz('contacts_synced_at'),
    fpHoldingsSnapshot: jsonb('fp_holdings_snapshot').$type<FolioHoldingsSnapshot>(),
    fpHoldingsSyncedAt: tstz('fp_holdings_synced_at'),
    reconciliationStatus: text('reconciliation_status', { enum: FOLIO_RECONCILIATION_STATUSES })
      .notNull()
      .default('UNRECONCILED'),
    lastReconciledAt: tstz('last_reconciled_at'),
  },
  (t) => [
    check('folios_status_ck', inList('status', FOLIO_STATUSES)),
    check(
      'folios_reconciliation_status_ck',
      inList('reconciliation_status', FOLIO_RECONCILIATION_STATUSES),
    ),
    // One row per AMC folio; the ledger upsert keys on it (a folio number is unique within its AMC).
    uniqueIndex('folios_amc_number_uq')
      .on(t.amcId, t.folioNumber)
      .where(sql`folio_number IS NOT NULL`),
    index('folios_investor_idx').on(t.investorId),
  ],
);
```

`apps/api/src/modules/portfolio/portfolio.schema.ts`:
```ts
import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { appSchema, inList, stdColumns, tstz } from '../../db/app-schema.js';
import { ORDER_UNITS_SOURCES, orders } from '../orders/orders.schema.js';
import { newId } from '../platform/ids.js';
import { folios } from './folios.schema.js';

export const LOT_TYPES = ['PURCHASE', 'SIP_INSTALMENT'] as const;
export const LOT_STATUSES = ['OPEN', 'CLOSED', 'REVERSED'] as const;
export const LEDGER_EXCEPTION_KINDS = [
  'UNITS_SHORTFALL',
  'UNITS_UNKNOWN',
  'FEED_MISMATCH',
  'UNMATCHED_PROVIDER_OBJECT',
] as const;
export const LEDGER_EXCEPTION_STATUSES = ['OPEN', 'RESOLVED'] as const;
export const RESERVATION_STATUSES = ['ACTIVE', 'SETTLED', 'RELEASED'] as const;
export type LedgerExceptionKind = (typeof LEDGER_EXCEPTION_KINDS)[number];

/** audit_events.action values written by the ledger (R-20); ORDER_SETTLED is E20's. */
export const LEDGER_AUDIT_ACTIONS = {
  ORDER_REVERSED: 'ORDER_REVERSED',
  LEDGER_LOT_REVERSED: 'LEDGER_LOT_REVERSED',
  LEDGER_UNITS_SHORTFALL: 'LEDGER_UNITS_SHORTFALL',
} as const;

/** Spec §2.3 precisions: units numeric(20,3), money numeric(18,2), NAV numeric(18,6). */
const unitsCol = (name: string) => numeric(name, { precision: 20, scale: 3, mode: 'string' });
const moneyCol = (name: string) => numeric(name, { precision: 18, scale: 2, mode: 'string' });
const navCol = (name: string) => numeric(name, { precision: 18, scale: 6, mode: 'string' });

/** One lot per allotted purchase or SIP instalment; written only by Ledger, in the order's transaction. */
export const lots = appSchema.table(
  'lots',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => newId('lots')),
    ...stdColumns(),
    investorId: uuid('investor_id').notNull(),
    folioId: uuid('folio_id')
      .notNull()
      .references(() => folios.id, { onDelete: 'restrict' }),
    schemeId: uuid('scheme_id').notNull(),
    sourceOrderId: uuid('source_order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    lotType: text('lot_type', { enum: LOT_TYPES }).notNull(),
    /** FP allotted_nav_date. */
    allotmentDate: date('allotment_date', { mode: 'string' }).notNull(),
    nav: navCol('nav').notNull(),
    units: unitsCol('units').notNull(),
    /** Gross amount paid, stamp duty included (design §H "Invested"). */
    costAmount: moneyCol('cost_amount').notNull(),
    stampDuty: moneyCol('stamp_duty').notNull(),
    unitsRemaining: unitsCol('units_remaining').notNull(),
    costRemaining: moneyCol('cost_remaining').notNull(),
    lockInUntil: date('lock_in_until', { mode: 'string' }),
    unitsSource: text('units_source', { enum: ORDER_UNITS_SOURCES }).notNull().default('PROVIDER'),
    status: text('status', { enum: LOT_STATUSES }).notNull().default('OPEN'),
  },
  (t) => [
    uniqueIndex('lots_source_order_uq').on(t.sourceOrderId),
    check('lots_lot_type_ck', inList('lot_type', LOT_TYPES)),
    check('lots_status_ck', inList('status', LOT_STATUSES)),
    check('lots_units_source_ck', inList('units_source', ORDER_UNITS_SOURCES)),
    check('lots_nav_ck', sql`nav > 0`),
    check('lots_units_ck', sql`units > 0 AND units_remaining >= 0 AND units_remaining <= units`),
    check(
      'lots_cost_ck',
      sql`stamp_duty >= 0 AND stamp_duty <= cost_amount AND cost_remaining >= 0 AND cost_remaining <= cost_amount`,
    ),
    // OPEN exactly while units remain; CLOSED and REVERSED lots hold nothing.
    check('lots_status_units_ck', sql`(status = 'OPEN') = (units_remaining > 0)`),
    index('lots_fifo_idx')
      .on(t.folioId, t.schemeId, t.allotmentDate, t.id)
      .where(sql`units_remaining > 0`),
    index('lots_investor_idx').on(t.investorId),
  ],
);

/** Append-only (the ledger_guards migration revokes UPDATE/DELETE): one row per lot an exit consumed. */
export const lotConsumptions = appSchema.table(
  'lot_consumptions',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => newId('lot_consumptions')),
    createdAt: tstz('created_at').notNull().defaultNow(),
    lotId: uuid('lot_id')
      .notNull()
      .references(() => lots.id, { onDelete: 'restrict' }),
    exitOrderId: uuid('exit_order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    units: unitsCol('units').notNull(),
    costAmount: moneyCol('cost_amount').notNull(),
    saleAmount: moneyCol('sale_amount'),
    saleNav: navCol('sale_nav'),
    saleDate: date('sale_date', { mode: 'string' }).notNull(),
    holdingDays: integer('holding_days').notNull(),
  },
  (t) => [
    uniqueIndex('lot_consumptions_lot_exit_uq').on(t.lotId, t.exitOrderId),
    index('lot_consumptions_exit_idx').on(t.exitOrderId),
    check('lot_consumptions_units_ck', sql`units > 0`),
    check(
      'lot_consumptions_amounts_ck',
      sql`cost_amount >= 0 AND (sale_amount IS NULL OR sale_amount >= 0)`,
    ),
    check('lot_consumptions_holding_days_ck', sql`holding_days >= 0`),
  ],
);

/** What the ledger could not reconcile with the provider; ops resolves (FEED_MISMATCH also self-resolves). */
export const ledgerExceptions = appSchema.table(
  'ledger_exceptions',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => newId('ledger_exceptions')),
    ...stdColumns(),
    investorId: uuid('investor_id').notNull(),
    /** Null only for UNITS_UNKNOWN on a first purchase, before FP has named a folio. */
    folioId: uuid('folio_id').references(() => folios.id, { onDelete: 'restrict' }),
    /** Null when FP reports an ISIN the catalogue does not hold. */
    schemeId: uuid('scheme_id'),
    isin: text('isin').notNull(),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'restrict' }),
    kind: text('kind', { enum: LEDGER_EXCEPTION_KINDS }).notNull(),
    expectedUnits: unitsCol('expected_units'),
    providerUnits: unitsCol('provider_units'),
    delta: unitsCol('delta'),
    detail: jsonb('detail').$type<Record<string, unknown>>().notNull().default({}),
    status: text('status', { enum: LEDGER_EXCEPTION_STATUSES }).notNull().default('OPEN'),
    resolvedAt: tstz('resolved_at'),
  },
  (t) => [
    check('ledger_exceptions_kind_ck', inList('kind', LEDGER_EXCEPTION_KINDS)),
    check('ledger_exceptions_status_ck', inList('status', LEDGER_EXCEPTION_STATUSES)),
    check(
      'ledger_exceptions_resolved_pair_ck',
      sql`(status = 'RESOLVED') = (resolved_at IS NOT NULL)`,
    ),
    uniqueIndex('ledger_exceptions_feed_open_uq')
      .on(t.folioId, t.isin)
      .where(sql`kind = 'FEED_MISMATCH' AND status = 'OPEN'`),
    index('ledger_exceptions_folio_idx').on(t.folioId, t.status),
  ],
);

/** Created here, written by F5: units held back for an exit until it settles or is released. */
export const redemptionReservations = appSchema.table(
  'redemption_reservations',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => newId('redemption_reservations')),
    ...stdColumns(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    investorId: uuid('investor_id').notNull(),
    folioId: uuid('folio_id')
      .notNull()
      .references(() => folios.id, { onDelete: 'restrict' }),
    schemeId: uuid('scheme_id').notNull(),
    unitsReserved: unitsCol('units_reserved').notNull(),
    status: text('status', { enum: RESERVATION_STATUSES }).notNull().default('ACTIVE'),
    releasedAt: tstz('released_at'),
    releaseEvidence: text('release_evidence'),
  },
  (t) => [
    uniqueIndex('redemption_reservations_order_uq').on(t.orderId),
    check('redemption_reservations_status_ck', inList('status', RESERVATION_STATUSES)),
    check('redemption_reservations_units_ck', sql`units_reserved > 0`),
    // Released only on provider-terminal evidence (spec §4.4).
    check(
      'redemption_reservations_release_ck',
      sql`(status = 'RELEASED') = (released_at IS NOT NULL AND release_evidence IS NOT NULL)`,
    ),
    index('redemption_reservations_active_idx')
      .on(t.folioId, t.schemeId)
      .where(sql`status = 'ACTIVE'`),
  ],
);
```

`apps/api/drizzle/0030_ledger_guards.sql` (custom, after the generated `ledger`):
```sql
REVOKE UPDATE, DELETE ON "app"."lot_consumptions" FROM "sanchay_app";
```

`apps/api/src/modules/portfolio/ledger.service.ts`:
```ts
import { Inject, Injectable } from '@nestjs/common';
import {
  type FifoLot,
  fifoExit,
  type IsoDate,
  lockInMonthsFor,
  lockInUntil,
  toIsoDate,
} from '@sanchay/domain';
import { Money, type Nav, Units } from '@sanchay/money';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../db/client.js';
import { schemes } from '../catalogue/catalogue.schema.js';
import { Notify } from '../notifications/notify.service.js';
import { orders } from '../orders/orders.schema.js';
import { AuditService } from '../platform/audit.service.js';
import { AppError } from '../platform/errors.js';
import { newId } from '../platform/ids.js';
import { ReconBreaks } from '../platform/runtime-config.js';
import { folios } from './folios.schema.js';
import {
  LEDGER_AUDIT_ACTIONS,
  ledgerExceptions,
  lotConsumptions,
  lots,
} from './portfolio.schema.js';

export type OrderRow = typeof orders.$inferSelect;
type LotRow = typeof lots.$inferSelect;

/** A complete, validated FP allotment (research fp-api §3.2, filled in at `successful`). */
export interface Allotment {
  units: Units;
  nav: Nav;
  navDate: IsoDate;
  /** Amount after stamp duty (FP `purchased_amount`). */
  purchasedAmount: Money;
  folioNumber: string;
}

/** A provider-confirmed exit (F5 maps FP's mf_redemption onto this). */
export interface LedgerExit {
  units: string;
  amount: string | null;
  nav: string | null;
  navDate: string;
}

export interface LedgerExitResult {
  consumedUnits: string;
  shortfallUnits: string;
}

const toFifoLot = (row: LotRow): FifoLot => ({
  id: row.id,
  allotmentDate: toIsoDate(row.allotmentDate),
  units: Units.platform(row.units),
  unitsRemaining: Units.platform(row.unitsRemaining),
  costAmount: Money.parse(row.costAmount),
  costRemaining: Money.parse(row.costRemaining),
  lockInUntil: row.lockInUntil === null ? null : toIsoDate(row.lockInUntil),
});

/**
 * The only writer of lots and lot_consumptions (design §H). Every method runs inside the caller's
 * transaction, the one that moves the order, and never calls a provider.
 */
@Injectable()
export class Ledger {
  constructor(
    @Inject(Notify) private readonly notify: Notify,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** Spec §4.2 SETTLED: lot (allotment_date = allotted_nav_date), folio upsert, stamp duty, allotment email. */
  async applyAllotment(
    tx: DbExecutor,
    order: OrderRow,
    allotment: Allotment,
  ): Promise<{ lotId: string; folioId: string }> {
    if (order.type !== 'PURCHASE' || order.amount === null) {
      throw new AppError('INTERNAL', {
        message: 'applyAllotment needs a purchase order with an amount',
      });
    }
    const [scheme] = await tx
      .select({
        amcId: schemes.amcId,
        name: schemes.name,
        isElss: schemes.isElss,
        lockInMonths: schemes.lockInMonths,
      })
      .from(schemes)
      .where(eq(schemes.id, order.schemeId));
    if (scheme === undefined) throw new AppError('INTERNAL', { message: 'order scheme not found' });

    const folioId = await this.upsertFolio(
      tx,
      order.investorId,
      scheme.amcId,
      allotment.folioNumber,
    );
    if (order.folioId !== null && order.folioId !== folioId) {
      await ReconBreaks.open(tx, {
        kind: 'ORDER_FOLIO_DIFFERS',
        entityType: 'orders',
        entityId: order.id,
        severity: 'WARNING',
        detail: { orderFolioId: order.folioId, allottedFolioId: folioId },
      });
    }
    const amount = Money.parse(order.amount);
    const stampDuty = amount.subtract(allotment.purchasedAmount);
    const lockIn = lockInUntil(
      allotment.navDate,
      lockInMonthsFor({ isElss: scheme.isElss, lockInMonths: scheme.lockInMonths }),
    );
    const lotId = newId('lots');
    await tx.insert(lots).values({
      id: lotId,
      investorId: order.investorId,
      folioId,
      schemeId: order.schemeId,
      sourceOrderId: order.id,
      lotType: order.origin === 'SIP_INSTALMENT' ? 'SIP_INSTALMENT' : 'PURCHASE',
      allotmentDate: allotment.navDate,
      nav: allotment.nav.toWire(),
      units: allotment.units.toWire(),
      costAmount: amount.toWire(),
      stampDuty: stampDuty.toWire(),
      unitsRemaining: allotment.units.toWire(),
      costRemaining: amount.toWire(),
      lockInUntil: lockIn,
    });
    await tx
      .update(orders)
      .set({ folioId, stampDuty: stampDuty.toWire(), unitsSource: 'PROVIDER' })
      .where(eq(orders.id, order.id));
    await this.notify.enqueue(tx, 'ORDER_ALLOTTED', {
      investorId: order.investorId,
      data: {
        units: allotment.units.toWire(),
        schemeName: scheme.name,
        nav: allotment.nav.toWire(),
        navDate: allotment.navDate,
      },
      dedupeKey: `order-allotted:${order.id}`,
    });
    return { lotId, folioId };
  }

  /**
   * Spec §4.4 SETTLED: FIFO over the folio's unlocked lots of the order's scheme. A shortfall is never
   * rolled back (SHORTFALL-BREAK): consume what exists, record UNITS_SHORTFALL, flag the folio MISMATCH
   * and open a CRITICAL break, all in the caller's transaction.
   */
  async applyExit(tx: DbExecutor, order: OrderRow, exit: LedgerExit): Promise<LedgerExitResult> {
    if (order.type !== 'REDEMPTION' || order.folioId === null) {
      throw new AppError('INTERNAL', { message: 'applyExit needs a redemption order on a folio' });
    }
    const folioId = order.folioId;
    const redeemedUnits = Units.platform(exit.units);
    const exitNavDate = toIsoDate(exit.navDate);
    const open = await tx
      .select()
      .from(lots)
      .where(
        and(eq(lots.folioId, folioId), eq(lots.schemeId, order.schemeId), eq(lots.status, 'OPEN')),
      )
      .orderBy(asc(lots.allotmentDate), asc(lots.id))
      .for('update');
    const result = fifoExit({
      lots: open.map(toFifoLot),
      redeemedUnits,
      redeemedAmount: exit.amount === null ? null : Money.parse(exit.amount),
      exitNavDate,
    });

    for (const c of result.consumptions) {
      await tx
        .update(lots)
        .set({
          unitsRemaining: c.unitsRemainingAfter.toWire(),
          costRemaining: c.costRemainingAfter.toWire(),
          status: c.unitsRemainingAfter.isZero() ? 'CLOSED' : 'OPEN',
        })
        .where(eq(lots.id, c.lotId));
      await tx.insert(lotConsumptions).values({
        lotId: c.lotId,
        exitOrderId: order.id,
        units: c.units.toWire(),
        costAmount: c.costAmount.toWire(),
        saleAmount: c.saleAmount?.toWire() ?? null,
        saleNav: exit.nav,
        saleDate: exitNavDate,
        holdingDays: c.holdingDays,
      });
    }

    if (result.shortfallUnits.isPositive()) {
      const [scheme] = await tx
        .select({ isin: schemes.isin })
        .from(schemes)
        .where(eq(schemes.id, order.schemeId));
      await tx.insert(ledgerExceptions).values({
        investorId: order.investorId,
        folioId,
        schemeId: order.schemeId,
        isin: scheme?.isin ?? 'UNKNOWN',
        orderId: order.id,
        kind: 'UNITS_SHORTFALL',
        expectedUnits: result.consumedUnits.toWire(),
        providerUnits: redeemedUnits.toWire(),
        delta: result.shortfallUnits.toWire(),
        detail: { exitNavDate },
      });
      await tx
        .update(folios)
        .set({ reconciliationStatus: 'MISMATCH' })
        .where(eq(folios.id, folioId));
      await ReconBreaks.open(tx, {
        kind: 'LEDGER_UNITS_SHORTFALL',
        entityType: 'orders',
        entityId: order.id,
        severity: 'CRITICAL',
        detail: {
          folioId,
          redeemedUnits: redeemedUnits.toWire(),
          shortfallUnits: result.shortfallUnits.toWire(),
        },
      });
      await this.audit.record(tx, {
        action: LEDGER_AUDIT_ACTIONS.LEDGER_UNITS_SHORTFALL,
        actorType: 'SYSTEM',
        entityType: 'orders',
        entityId: order.id,
      });
    }
    return {
      consumedUnits: result.consumedUnits.toWire(),
      shortfallUnits: result.shortfallUnits.toWire(),
    };
  }

  /** Spec §4.2 REVERSED: reverse the order's lot if nothing has consumed it; otherwise a CRITICAL break. */
  async reverseAllotment(
    tx: DbExecutor,
    order: OrderRow,
  ): Promise<'REVERSED' | 'CONSUMED' | 'NO_LOT'> {
    const [lot] = await tx
      .select()
      .from(lots)
      .where(eq(lots.sourceOrderId, order.id))
      .for('update');
    if (lot === undefined) return 'NO_LOT';
    const untouched =
      lot.status === 'OPEN' &&
      Units.platform(lot.unitsRemaining).compare(Units.platform(lot.units)) === 0;
    if (!untouched) {
      await ReconBreaks.open(tx, {
        kind: 'LEDGER_REVERSAL_CONSUMED_LOT',
        entityType: 'lots',
        entityId: lot.id,
        severity: 'CRITICAL',
        detail: { orderId: order.id, units: lot.units, unitsRemaining: lot.unitsRemaining },
      });
      return 'CONSUMED';
    }
    await tx
      .update(lots)
      .set({ status: 'REVERSED', unitsRemaining: '0', costRemaining: '0.00' })
      .where(eq(lots.id, lot.id));
    await this.audit.record(tx, {
      action: LEDGER_AUDIT_ACTIONS.LEDGER_LOT_REVERSED,
      actorType: 'SYSTEM',
      entityType: 'lots',
      entityId: lot.id,
    });
    return 'REVERSED';
  }

  /** One row per (AMC, folio number); a number FP gives for another investor's folio is refused. */
  private async upsertFolio(
    tx: DbExecutor,
    investorId: string,
    amcId: string,
    folioNumber: string,
  ): Promise<string> {
    const [inserted] = await tx
      .insert(folios)
      .values({
        investorId,
        amcId,
        folioNumber,
        status: 'ACTIVE',
        createdBy: 'SYSTEM',
        updatedBy: 'SYSTEM',
      })
      .onConflictDoNothing({
        target: [folios.amcId, folios.folioNumber],
        where: sql`folio_number IS NOT NULL`,
      })
      .returning({ id: folios.id });
    if (inserted !== undefined) return inserted.id;
    const [existing] = await tx
      .select({ id: folios.id, investorId: folios.investorId, status: folios.status })
      .from(folios)
      .where(and(eq(folios.amcId, amcId), eq(folios.folioNumber, folioNumber)))
      .for('update');
    if (existing === undefined || existing.investorId !== investorId) {
      throw new AppError('INTERNAL', {
        message: 'FP allotted into a folio held by another investor',
      });
    }
    if (existing.status !== 'ACTIVE')
      await tx.update(folios).set({ status: 'ACTIVE' }).where(eq(folios.id, existing.id));
    return existing.id;
  }
}
```

`apps/api/src/modules/portfolio/purchase-settlement.ts`:
```ts
import { Inject, Injectable } from '@nestjs/common';
import {
  canTransition,
  type FpOrderState,
  fpStateToOrderStatus,
  isIsoDate,
  type OrderStatus,
} from '@sanchay/domain';
import { Money, Nav, Units } from '@sanchay/money';
import { eq } from 'drizzle-orm';
import { DB, type DbHandle } from '../../db/client.js';
import { schemes } from '../catalogue/catalogue.schema.js';
import type { FpPurchaseView } from '../orders/fp-purchase.js';
import { moveOrder } from '../orders/order-transitions.js';
import { ORDER_AUDIT_ACTIONS, orders } from '../orders/orders.schema.js';
import { AuditService } from '../platform/audit.service.js';
import { CLOCK, type Clock } from '../platform/clock.js';
import { ReconBreaks } from '../platform/runtime-config.js';
import { type Allotment, Ledger } from './ledger.service.js';
import { LEDGER_AUDIT_ACTIONS, ledgerExceptions } from './portfolio.schema.js';

export type AllotmentParse =
  | { kind: 'COMPLETE'; allotment: Allotment }
  | { kind: 'INCOMPLETE' }
  | { kind: 'INVALID'; reason: string };

/**
 * Units come from the provider only and are never rounded (spec §1.4): an allotment the ledger cannot
 * hold exactly (units beyond 3 dp, a non-date NAV date, purchased_amount outside 0..amount) is INVALID.
 * Any missing field is INCOMPLETE, which the order waits out in UNITS_PENDING.
 */
export function parseAllotment(purchase: FpPurchaseView, orderAmount: string): AllotmentParse {
  const { allottedUnits, purchasedPrice, allottedNavDate, purchasedAmount, folioNumber } = purchase;
  if (
    allottedUnits === null ||
    purchasedPrice === null ||
    allottedNavDate === null ||
    purchasedAmount === null ||
    folioNumber === null ||
    folioNumber === ''
  ) {
    return { kind: 'INCOMPLETE' };
  }
  try {
    const units = Units.platform(allottedUnits);
    const nav = Nav.parse(purchasedPrice);
    const net = Money.parse(purchasedAmount);
    if (!units.isPositive()) return { kind: 'INVALID', reason: 'allotted_units is not positive' };
    if (!isIsoDate(allottedNavDate))
      return { kind: 'INVALID', reason: 'allotted_nav_date is not a calendar date' };
    if (net.isNegative() || net.gt(Money.parse(orderAmount)))
      return { kind: 'INVALID', reason: 'purchased_amount is outside 0..amount' };
    return {
      kind: 'COMPLETE',
      allotment: { units, nav, navDate: allottedNavDate, purchasedAmount: net, folioNumber },
    };
  } catch (err) {
    return { kind: 'INVALID', reason: err instanceof Error ? err.message : String(err) };
  }
}

const SETTLEABLE: readonly OrderStatus[] = ['PROCESSING', 'UNITS_PENDING', 'SETTLED'];
const FP_ORDER_STATES: readonly string[] = [
  'under_review',
  'pending',
  'submitted',
  'successful',
  'failed',
  'expired',
  'reversed',
];

function triggerFor(from: OrderStatus, to: OrderStatus): string | null {
  switch (to) {
    case 'SETTLED':
      return from === 'UNITS_PENDING' ? 'units_reconciled' : 'fp_successful_with_units';
    case 'UNITS_PENDING':
      return 'fp_successful_units_null';
    case 'FAILED':
      return 'fp_failed';
    case 'EXPIRED':
      return 'fp_expired';
    case 'REVERSED':
      return 'fp_reversed';
    default:
      return null;
  }
}

/**
 * Applies a re-fetched FP purchase to an order FP has accepted (PROCESSING onward): SETTLED with the
 * ledger, UNITS_PENDING, FAILED, EXPIRED or REVERSED, in one transaction with the order row locked.
 * Idempotent, so the `mf_purchase` event handler and `orders.units.reconcile` can both call it. The
 * caller re-fetches first; nothing in here calls a provider.
 */
@Injectable()
export class PurchaseSettlement {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(Ledger) private readonly ledger: Ledger,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async apply(orderId: string, purchase: FpPurchaseView): Promise<OrderStatus | null> {
    const now = this.clock.now();
    return this.dbh.db.transaction(async (tx) => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
      if (order === undefined || order.type !== 'PURCHASE' || !SETTLEABLE.includes(order.status))
        return null;
      if (!FP_ORDER_STATES.includes(purchase.state)) return null;
      const parsed: AllotmentParse =
        purchase.state === 'successful'
          ? parseAllotment(purchase, order.amount ?? '0.00')
          : { kind: 'INCOMPLETE' };
      const to = fpStateToOrderStatus(purchase.state as FpOrderState, {
        unitsAllotted: parsed.kind === 'COMPLETE',
      });
      if (to === order.status) return null;
      const trigger = triggerFor(order.status, to);
      if (trigger === null || !canTransition('ORDER', order.status, to, trigger)) {
        await ReconBreaks.open(tx, {
          kind: 'FP_ORDER_STATE_UNEXPECTED',
          entityType: 'orders',
          entityId: order.id,
          severity: 'WARNING',
          detail: { status: order.status, fpState: purchase.state },
        });
        return null;
      }
      const fp = { fpState: purchase.state, failureCode: purchase.failureCode };

      if (parsed.kind === 'COMPLETE') {
        const a = parsed.allotment;
        await moveOrder(tx, order, 'SETTLED', trigger, {
          ...fp,
          allottedUnits: a.units.toWire(),
          allottedNav: a.nav.toWire(),
          allottedNavDate: a.navDate,
          purchasedAmount: a.purchasedAmount.toWire(),
          finalAt: now,
        });
        await this.ledger.applyAllotment(tx, { ...order, status: 'SETTLED' }, a);
        await this.audit.record(tx, {
          action: ORDER_AUDIT_ACTIONS.ORDER_SETTLED,
          actorType: 'SYSTEM',
          entityType: 'orders',
          entityId: order.id,
        });
        return 'SETTLED';
      }
      if (to === 'UNITS_PENDING') {
        await moveOrder(tx, order, 'UNITS_PENDING', trigger, { ...fp, unitsPendingSince: now });
        if (parsed.kind === 'INVALID') {
          const [scheme] = await tx
            .select({ isin: schemes.isin })
            .from(schemes)
            .where(eq(schemes.id, order.schemeId));
          await tx.insert(ledgerExceptions).values({
            investorId: order.investorId,
            folioId: order.folioId,
            schemeId: order.schemeId,
            isin: scheme?.isin ?? 'UNKNOWN',
            orderId: order.id,
            kind: 'UNITS_UNKNOWN',
            providerUnits: null,
            detail: { reason: parsed.reason },
          });
          await ReconBreaks.open(tx, {
            kind: 'ALLOTMENT_INVALID',
            entityType: 'orders',
            entityId: order.id,
            severity: 'CRITICAL',
            detail: { reason: parsed.reason },
          });
        }
        return 'UNITS_PENDING';
      }
      await moveOrder(tx, order, to, trigger, { ...fp, finalAt: now });
      if (to === 'REVERSED') {
        if (order.status === 'SETTLED') await this.ledger.reverseAllotment(tx, order);
        await this.audit.record(tx, {
          action: LEDGER_AUDIT_ACTIONS.ORDER_REVERSED,
          actorType: 'SYSTEM',
          entityType: 'orders',
          entityId: order.id,
        });
      }
      return to;
    });
  }
}
```

`apps/api/src/modules/portfolio/fp-holdings.ts`:
```ts
import { Rounding, Units } from '@sanchay/money';
import type { FolioHoldingsSnapshot, PayoutBankMasked } from './folios.schema.js';

/** Spec §2.3/MS-05: a folio matches FP when every scheme's units agree within 0.001. */
export const HOLDINGS_TOLERANCE = '0.001';

export interface FpFolioView {
  /** Lower-cased, as FP records them (research fp-api §7 `email_addresses[]`). */
  emails: string[];
  /** 10-digit national numbers (research fp-api §7 `mobile_numbers[]`). */
  mobiles: string[];
  payoutBank: PayoutBankMasked | null;
}

export interface HoldingsMismatch {
  isin: string;
  ledgerUnits: string;
  fpUnits: string;
  delta: string;
}

export interface HoldingsComparison {
  status: 'MATCHED' | 'MISMATCH' | 'FEED_UNAVAILABLE';
  mismatches: HoldingsMismatch[];
}

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value);
/** Report units can carry more than 3 dp; flooring can only under-state what FP will redeem. */
const units3 = (value: unknown): string =>
  Units.round(text(value) ?? '0', 3, Rounding.DOWN).toWire();

/**
 * One FP MF Folio (`GET /v2/mf_folios`). `payout_details[].bank_account{number, ifsc, name}` is not in
 * the research; the pilot sandbox probe confirms it (Known gaps), and this is the only place to change.
 */
export function toFpFolioView(raw: Record<string, unknown>): FpFolioView {
  const bank = record(record(list(raw.payout_details)[0])?.bank_account);
  const number = text(bank?.number);
  return {
    emails: list(raw.email_addresses).flatMap((e) =>
      typeof e === 'string' && e.includes('@') ? [e.trim().toLowerCase()] : [],
    ),
    mobiles: list(raw.mobile_numbers).flatMap((m) => {
      const digits = typeof m === 'string' ? m.replace(/\D/g, '') : '';
      return digits.length >= 10 ? [digits.slice(-10)] : [];
    }),
    payoutBank:
      bank === null
        ? null
        : {
            ifsc: text(bank.ifsc),
            last4: number === null ? null : number.slice(-4),
            bankName: text(bank.name),
          },
  };
}

/**
 * FP's holdings report (`GET /api/oms/reports/holdings`, research fp-api §7):
 * `{data: {folios: [{folio_number, schemes: [{isin, holdings: {as_on, units, redeemable_units}}]}]}}`.
 * Null when the report has no row for this folio (FP's feed does not know it yet).
 */
export function toFolioHoldingsSnapshot(
  raw: Record<string, unknown>,
  folioNumber: string,
): FolioHoldingsSnapshot | null {
  // The sandbox returns `folios` at the top level (probe 2026-10-01); `data.folios` is kept as a fallback.
  const folio = list(raw.folios ?? record(raw.data)?.folios)
    .map(record)
    .find((f) => f !== null && text(f.folio_number) === folioNumber);
  if (folio === undefined || folio === null) return null;
  const entries = list(folio.schemes)
    .map(record)
    .filter((s): s is Record<string, unknown> => s !== null && text(s.isin) !== null);
  const schemes = entries.map((s) => {
    const holdings = record(s.holdings);
    return {
      isin: String(s.isin),
      units: units3(holdings?.units),
      redeemableUnits: units3(holdings?.redeemable_units),
    };
  });
  const asOn = entries.map((s) => text(record(s.holdings)?.as_on)).find((d) => d !== null) ?? null;
  return { folioNumber, asOn, schemes };
}

/** Ledger units (Σ OPEN lots' units_remaining per ISIN) against FP's units; null snapshot = FEED_UNAVAILABLE. */
export function compareHoldings(
  ledger: ReadonlyMap<string, Units>,
  snapshot: FolioHoldingsSnapshot | null,
): HoldingsComparison {
  if (snapshot === null) return { status: 'FEED_UNAVAILABLE', mismatches: [] };
  const fp = new Map(snapshot.schemes.map((s) => [s.isin, Units.platform(s.units)]));
  const isins = [...new Set([...ledger.keys(), ...fp.keys()])].sort();
  const mismatches: HoldingsMismatch[] = [];
  for (const isin of isins) {
    const ledgerUnits = ledger.get(isin) ?? Units.zero(3);
    const fpUnits = fp.get(isin) ?? Units.zero(3);
    const delta = fpUnits.subtract(ledgerUnits);
    if (delta.toDecimal().abs().gt(HOLDINGS_TOLERANCE)) {
      mismatches.push({
        isin,
        ledgerUnits: ledgerUnits.toWire(),
        fpUnits: fpUnits.toWire(),
        delta: delta.toWire(),
      });
    }
  }
  return { status: mismatches.length === 0 ? 'MATCHED' : 'MISMATCH', mismatches };
}
```

`apps/api/src/modules/portfolio/folio-sync.job.ts`:
```ts
import { Inject, Injectable } from '@nestjs/common';
import { Units } from '@sanchay/money';
import { and, eq, inArray, isNotNull, ne, notInArray, sql } from 'drizzle-orm';
import { DB, type DbHandle } from '../../db/client.js';
import { FpRead } from '../../integrations/fp/fp-read.js';
import { schemes } from '../catalogue/catalogue.schema.js';
import { investors } from '../identity/identity.schema.js';
import { maskEmail, maskMobile } from '../identity/masking.js';
import { CLOCK, type Clock } from '../platform/clock.js';
import { Crypto } from '../platform/crypto.js';
import { type Job, JobHandler } from '../platform/jobs/job-registry.js';
import { ReconBreaks } from '../platform/runtime-config.js';
import { type FolioReconciliationStatus, folios } from './folios.schema.js';
import { compareHoldings, toFolioHoldingsSnapshot, toFpFolioView } from './fp-holdings.js';
import { ledgerExceptions, lots } from './portfolio.schema.js';

/** `{}` (the 05:00 schedule) syncs every ACTIVE numbered folio; `{folioId}` syncs one (F5's REFRESHING quote). */
export interface FolioSyncJobData {
  folioId?: string;
}

/**
 * Worker only. The only writer of `folios.fp_holdings_snapshot` (R-09). Per folio: FP reads first,
 * outside any transaction; then one transaction writes the contacts, the snapshot and the
 * reconciliation outcome. A failing folio opens FOLIO_SYNC_FAILED and the sweep moves on.
 */
@Injectable()
@JobHandler('folio.sync')
export class FolioSyncJob {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(FpRead) private readonly fpRead: FpRead,
    @Inject(Crypto) private readonly crypto: Crypto,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async handle(job: Job<'folio.sync'>): Promise<void> {
    const { folioId } = (job.data ?? {}) as FolioSyncJobData;
    const db = this.dbh.db;
    const targets = await db
      .select({ id: folios.id })
      .from(folios)
      .where(
        folioId === undefined
          ? and(eq(folios.status, 'ACTIVE'), isNotNull(folios.folioNumber))
          : eq(folios.id, folioId),
      );
    for (const { id } of targets) {
      try {
        await this.syncOne(id);
      } catch (err) {
        await ReconBreaks.open(db, {
          kind: 'FOLIO_SYNC_FAILED',
          entityType: 'folios',
          entityId: id,
          severity: 'WARNING',
          detail: { error: err instanceof Error ? err.message : String(err) },
        });
      }
    }
  }

  async syncOne(folioId: string): Promise<FolioReconciliationStatus | null> {
    const db = this.dbh.db;
    const [row] = await db
      .select({
        investorId: folios.investorId,
        folioNumber: folios.folioNumber,
        mfia: investors.fpMfInvestmentAccountId,
        mfiaOldId: investors.fpMfiaOldId,
      })
      .from(folios)
      .innerJoin(investors, eq(investors.id, folios.investorId))
      .where(eq(folios.id, folioId));
    if (
      row === undefined ||
      row.folioNumber === null ||
      row.mfia === null ||
      row.mfiaOldId === null
    )
      return null;
    const { investorId, folioNumber } = row;

    const folioList = await this.fpRead.folios({ mfInvestmentAccount: row.mfia, folioNumber });
    const holdingsRaw = await this.fpRead.holdings({
      investmentAccountOldId: row.mfiaOldId,
      folios: folioNumber,
    });
    const first = folioList.items[0];
    const fpFolio = first === undefined ? null : toFpFolioView(first);
    const snapshot = toFolioHoldingsSnapshot(holdingsRaw, folioNumber);
    const now = this.clock.now();

    return db.transaction(async (tx) => {
      const held = await tx
        .select({ isin: schemes.isin, units: sql<string>`sum(${lots.unitsRemaining})::text` })
        .from(lots)
        .innerJoin(schemes, eq(schemes.id, lots.schemeId))
        .where(and(eq(lots.folioId, folioId), eq(lots.status, 'OPEN')))
        .groupBy(schemes.isin);
      const comparison = compareHoldings(
        new Map(held.map((h) => [h.isin, Units.platform(h.units)])),
        snapshot,
      );
      const [otherOpen] = await tx
        .select({ id: ledgerExceptions.id })
        .from(ledgerExceptions)
        .where(
          and(
            eq(ledgerExceptions.folioId, folioId),
            eq(ledgerExceptions.status, 'OPEN'),
            ne(ledgerExceptions.kind, 'FEED_MISMATCH'),
          ),
        )
        .limit(1);
      // A shortfall or unknown-units exception keeps the folio MISMATCH until ops resolves it.
      const status: FolioReconciliationStatus =
        comparison.status === 'MATCHED' && otherOpen !== undefined ? 'MISMATCH' : comparison.status;

      const contacts =
        fpFolio === null
          ? {}
          : {
              registeredMobileBidx: fpFolio.mobiles.map((m) => this.crypto.blindIndex('mobile', m)),
              registeredEmailBidx: fpFolio.emails.map((e) => this.crypto.blindIndex('email', e)),
              registeredContactsMasked: {
                mobiles: fpFolio.mobiles.map(maskMobile),
                emails: fpFolio.emails.map(maskEmail),
              },
              payoutBankMasked: fpFolio.payoutBank,
              contactsSyncedAt: now,
            };
      await tx
        .update(folios)
        .set({
          ...contacts,
          fpHoldingsSnapshot: snapshot ?? { folioNumber, asOn: null, schemes: [] },
          fpHoldingsSyncedAt: now,
          reconciliationStatus: status,
          lastReconciledAt: now,
        })
        .where(eq(folios.id, folioId));

      if (comparison.status === 'FEED_UNAVAILABLE') return status;
      const isins = comparison.mismatches.map((m) => m.isin);
      const known =
        isins.length === 0
          ? []
          : await tx
              .select({ id: schemes.id, isin: schemes.isin })
              .from(schemes)
              .where(inArray(schemes.isin, isins));
      const schemeIds = new Map(known.map((k) => [k.isin, k.id] as const));
      for (const m of comparison.mismatches) {
        await tx
          .insert(ledgerExceptions)
          .values({
            investorId,
            folioId,
            schemeId: schemeIds.get(m.isin) ?? null,
            isin: m.isin,
            kind: 'FEED_MISMATCH',
            expectedUnits: m.ledgerUnits,
            providerUnits: m.fpUnits,
            delta: m.delta,
          })
          .onConflictDoNothing({
            target: [ledgerExceptions.folioId, ledgerExceptions.isin],
            where: sql`kind = 'FEED_MISMATCH' AND status = 'OPEN'`,
          });
      }
      // A FEED_MISMATCH that has converged (feed lag caught up) resolves itself.
      await tx
        .update(ledgerExceptions)
        .set({ status: 'RESOLVED', resolvedAt: now })
        .where(
          and(
            eq(ledgerExceptions.folioId, folioId),
            eq(ledgerExceptions.kind, 'FEED_MISMATCH'),
            eq(ledgerExceptions.status, 'OPEN'),
            notInArray(ledgerExceptions.isin, isins),
          ),
        );
      if (comparison.status === 'MISMATCH') {
        await ReconBreaks.open(tx, {
          kind: 'FOLIO_FEED_MISMATCH',
          entityType: 'folios',
          entityId: folioId,
          severity: 'WARNING',
          detail: { schemes: comparison.mismatches.length },
        });
      }
      return status;
    });
  }
}
```

`apps/api/src/modules/portfolio/units-reconcile.job.ts`:
```ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { businessDaysAfter, istIsoDate, type OrderStatus } from '@sanchay/domain';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { DB, type DbHandle } from '../../db/client.js';
import { FpRead } from '../../integrations/fp/fp-read.js';
import { marketHolidays } from '../catalogue/catalogue.schema.js';
import { toFpPurchaseView } from '../orders/fp-purchase.js';
import { orders } from '../orders/orders.schema.js';
import { CLOCK, type Clock } from '../platform/clock.js';
import { type Job, JobHandler } from '../platform/jobs/job-registry.js';
import { ReconBreaks } from '../platform/runtime-config.js';
import { PurchaseSettlement } from './purchase-settlement.js';

/** Spec §4.2: UNITS_PENDING past T+3 business days is a WARNING, past T+5 a CRITICAL break. */
const WARN_AFTER_BUSINESS_DAYS = 3;
const CRITICAL_AFTER_BUSINESS_DAYS = 5;
const SWEPT: OrderStatus[] = ['PROCESSING', 'UNITS_PENDING'];

/**
 * Worker only, every 2 hours. Re-fetches each purchase FP has accepted but that has no lot yet
 * (PROCESSING: the backstop for a missed webhook; UNITS_PENDING: allotment still unreported) and
 * applies it through PurchaseSettlement; then raises the T+3/T+5 breaks for what is still pending.
 */
@Injectable()
@JobHandler('orders.units.reconcile')
export class UnitsReconcileJob {
  private readonly log = new Logger(UnitsReconcileJob.name);

  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(FpRead) private readonly fpRead: FpRead,
    @Inject(PurchaseSettlement) private readonly settlement: PurchaseSettlement,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async handle(_job: Job<'orders.units.reconcile'>): Promise<void> {
    const db = this.dbh.db;
    const due = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.type, 'PURCHASE'),
          inArray(orders.status, SWEPT),
          isNotNull(orders.fpOrderId),
        ),
      );
    if (due.length === 0) return;
    const holidayDates = new Set(
      (await db.select({ date: marketHolidays.holidayDate }).from(marketHolidays)).map(
        (h) => h.date,
      ),
    );
    const holidays = { has: (isoDate: string) => holidayDates.has(isoDate) };
    const now = this.clock.now();

    for (const order of due) {
      let status: OrderStatus = order.status;
      let pendingSince = order.unitsPendingSince;
      try {
        const next = await this.settlement.apply(
          order.id,
          toFpPurchaseView(await this.fpRead.purchase(order.fpOrderId ?? '')),
        );
        if (next !== null) {
          status = next;
          if (next === 'UNITS_PENDING') pendingSince = now;
        }
      } catch (err) {
        // FP unreachable or the apply failed: the order keeps its status and the SLA check still runs.
        this.log.warn(
          `orders.units_reconcile_failed: order ${order.id} (${err instanceof Error ? err.message : String(err)})`,
        );
      }
      if (status !== 'UNITS_PENDING' || pendingSince === null) continue;
      const elapsed = businessDaysAfter(istIsoDate(pendingSince), istIsoDate(now), holidays);
      if (elapsed > CRITICAL_AFTER_BUSINESS_DAYS) {
        await ReconBreaks.open(db, {
          kind: 'UNITS_PENDING_T5',
          entityType: 'orders',
          entityId: order.id,
          severity: 'CRITICAL',
          detail: { businessDays: elapsed },
        });
      } else if (elapsed > WARN_AFTER_BUSINESS_DAYS) {
        await ReconBreaks.open(db, {
          kind: 'UNITS_PENDING_T3',
          entityType: 'orders',
          entityId: order.id,
          severity: 'WARNING',
          detail: { businessDays: elapsed },
        });
      }
    }
  }
}
```

`apps/api/src/modules/portfolio/portfolio.module.ts`:
```ts
import { type DynamicModule, Module } from '@nestjs/common';
import type { Env } from '../../config/env.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { FolioSyncJob } from './folio-sync.job.js';
import { Ledger } from './ledger.service.js';
import { PurchaseSettlement } from './purchase-settlement.js';
import { UnitsReconcileJob } from './units-reconcile.job.js';

/** Ledger and PurchaseSettlement load in every role (no provider calls); the two jobs inject FpRead, so worker only. */
@Module({})
export class PortfolioModule {
  static forRoot(env: Env): DynamicModule {
    const workerOnly = env.SANCHAY_APP_ROLE === 'worker' ? [FolioSyncJob, UnitsReconcileJob] : [];
    return {
      module: PortfolioModule,
      imports: [NotificationsModule],
      providers: [Ledger, PurchaseSettlement, ...workerOnly],
      exports: [Ledger, PurchaseSettlement],
    };
  }
}
```

`apps/api/src/modules/payments/fp-events.ts` (E21's file; full content: `handleMfPurchaseEvent` becomes `mfPurchaseEventHandler`):
```ts
import { eq } from 'drizzle-orm';
import type {
  FpEventHandler,
  FpEventHandlerContext,
} from '../../integrations/fp/webhooks/fp-event-handlers.js';
import { toFpPurchaseView } from '../orders/fp-purchase.js';
import { orders } from '../orders/orders.schema.js';
import type { PurchaseSettlement } from '../portfolio/purchase-settlement.js';

const SETTLING = ['PROCESSING', 'UNITS_PENDING', 'SETTLED'];

/**
 * E1 handler for `mf_purchase.*` (F4): re-fetches the purchase (never trusts the payload) and hands it
 * to PurchaseSettlement, which applies it and writes the ledger in one transaction. Orders before
 * PROCESSING belong to the saga jobs and are left alone.
 */
export function mfPurchaseEventHandler(settlement: PurchaseSettlement): FpEventHandler {
  return async ({ db, event, fpRead }: FpEventHandlerContext): Promise<void> => {
    if (event.objectId === null) return;
    const [order] = await db
      .select({ id: orders.id, status: orders.status })
      .from(orders)
      .where(eq(orders.fpOrderId, event.objectId));
    if (order === undefined || !SETTLING.includes(order.status)) return;
    await settlement.apply(order.id, toFpPurchaseView(await fpRead.purchase(event.objectId)));
  };
}

/** E1 handler for `payment.*`: find the attempt and let payments.poll apply the re-fetched state. */
export function paymentEventHandler(enqueuePoll: (fpPaymentId: string) => Promise<void>) {
  return async ({ event }: FpEventHandlerContext): Promise<void> => {
    if (event.objectId !== null) await enqueuePoll(event.objectId);
  };
}
```

`apps/api/src/modules/payments/payments.module.ts` (E21's file):
```ts
// imports
import { PortfolioModule } from '../portfolio/portfolio.module.js';
import { PurchaseSettlement } from '../portfolio/purchase-settlement.js';
import { mfPurchaseEventHandler, paymentEventHandler } from './fp-events.js';

// forRoot: imports: [NotificationsModule, PortfolioModule.forRoot(env)],

// constructor: add
    @Inject(PurchaseSettlement) private readonly settlement: PurchaseSettlement,

// onModuleInit: replace the mf_purchase registration
    registerFpEventHandler('mf_purchase', mfPurchaseEventHandler(this.settlement));
```

`apps/api/src/integrations/fp/fake/fake-fp.state.ts` (D4): append four fields to `StoredPurchase`, add `StoredFolio` and the `folios` map:
```ts
  // StoredPurchase, after `consent`:
  /** F4: filled at `successful` (research fp-api §3.2); null until then. */
  allottedUnits: string | null;
  purchasedAmount: string | null;
  purchasedPrice: string | null;
  allottedNavDate: string | null;

/** F4: one folio as FP's `GET /v2/mf_folios` and holdings report show it. Tests set these directly. */
export interface StoredFolio {
  readonly folioNumber: string;
  readonly mfInvestmentAccount: string;
  /** The investment account's `old_id`, the holdings report's `investment_account_id`. */
  readonly investmentAccountOldId: number;
  emailAddresses: string[];
  mobileNumbers: string[];
  payoutBank: { number: string; ifsc: string; name: string } | null;
  /** isin -> units held and redeemable. */
  holdings: Map<string, { units: string; redeemableUnits: string }>;
}

  // FakeFpState, after `mandates`:
  /** F4: keyed by folio number. */
  readonly folios = new Map<string, StoredFolio>();
```

`apps/api/src/integrations/fp/fake/fake-fp.ts` (D4; import `type StoredFolio` with `StoredPurchase`):
```ts
/** F4: the allotment fields a test can set when it advances a purchase (FP fills them at `successful`). */
export interface FakeFpAdvanceFields {
  folioNumber?: string;
  allottedUnits?: string | null;
  purchasedAmount?: string | null;
  purchasedPrice?: string | null;
  allottedNavDate?: string | null;
}

// purchasePayload(p): after `folio_number` (E20 already added `consent: p.consent`):
    allotted_units: p.allottedUnits,
    purchased_amount: p.purchasedAmount,
    purchased_price: p.purchasedPrice,
    allotted_nav_date: p.allottedNavDate,

function folioPayload(f: StoredFolio): Record<string, unknown> {
  return {
    object: 'mf_folio',
    number: f.folioNumber,
    mf_investment_account: f.mfInvestmentAccount,
    email_addresses: f.emailAddresses,
    mobile_numbers: f.mobileNumbers,
    payout_details: f.payoutBank === null ? [] : [{ bank_account: { ...f.payoutBank } }],
  };
}

function holdingsFolioPayload(f: StoredFolio, asOn: string): Record<string, unknown> {
  return {
    folio_number: f.folioNumber,
    schemes: [...f.holdings].map(([isin, h]) => ({
      isin,
      holdings: { as_on: asOn, units: h.units, redeemable_units: h.redeemableUnits },
    })),
  };
}

// advance(): the signature becomes `advance(objectId: string, state: string, fields: FakeFpAdvanceFields = {})`,
// and after the folioNumber line:
    if (fields.allottedUnits !== undefined) purchase.allottedUnits = fields.allottedUnits;
    if (fields.purchasedAmount !== undefined) purchase.purchasedAmount = fields.purchasedAmount;
    if (fields.purchasedPrice !== undefined) purchase.purchasedPrice = fields.purchasedPrice;
    if (fields.allottedNavDate !== undefined) purchase.allottedNavDate = fields.allottedNavDate;

// F2's addInstalment(): its new StoredPurchase also sets the same four fields to null.
// route(), 'purchase.create': the new StoredPurchase also sets
          allottedUnits: null,
          purchasedAmount: null,
          purchasedPrice: null,
          allottedNavDate: null,

// route(), two cases before `default:`
      case 'folio.list': {
        const account = query.get('mf_investment_account');
        const number = query.get('folio_number');
        const items = [...this.state.folios.values()].filter(
          (f) =>
            (account === null || f.mfInvestmentAccount === account) &&
            (number === null || f.folioNumber === number),
        );
        return { statusCode: 200, data: { object: 'list', data: items.map(folioPayload) } };
      }
      case 'holdings.get': {
        const accountId = Number(query.get('investment_account_id'));
        const wanted = query.get('folios')?.split(',') ?? null;
        const asOn = new Date(this.now()).toISOString().slice(0, 10);
        const items = [...this.state.folios.values()].filter(
          (f) =>
            f.investmentAccountOldId === accountId &&
            (wanted === null || wanted.includes(f.folioNumber)),
        );
        return {
          statusCode: 200,
          data: { data: { folios: items.map((f) => holdingsFolioPayload(f, asOn)) } },
        };
      }
```

Key-level edits:
- `apps/api/src/modules/platform/jobs/job-registry.ts`: append `'folio.sync'`, `'orders.units.reconcile'` to `JOB_NAMES`.
- `apps/api/src/modules/platform/jobs/schedules.ts` (inside `registerSchedules`):
  ```ts
  await boss.schedule('folio.sync', '0 5 * * *', {}, { tz, key: 'folio-sync' });
  await boss.schedule('orders.units.reconcile', '0 */2 * * *', {}, { tz, key: 'orders-units-reconcile' });
  ```
- `apps/api/src/modules/platform/ids.ts`: append `'ledger_exceptions' | 'lot_consumptions' | 'lots' | 'redemption_reservations'` to `TableName`.
- `apps/api/src/app.module.ts`: add `PortfolioModule.forRoot(env)` beside `PaymentsModule.forRoot(env)`.

`apps/api/src/modules/plans/instalments-sync.job.ts` (F2's file). F2 copied every FP state straight onto the order, so an allotted instalment reached SETTLED with no lot. The job now mirrors an instalment only up to PROCESSING and hands every later state to `PurchaseSettlement`, the one path that writes the ledger.
```ts
// imports: add
import { PurchaseSettlement } from '../portfolio/purchase-settlement.js';

// module scope: add
/** States only PurchaseSettlement may set (it writes the ledger); the sync mirrors up to PROCESSING. */
const SETTLEMENT_OWNED: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  'SETTLED',
  'UNITS_PENDING',
  'FAILED',
  'EXPIRED',
  'REVERSED',
]);

// constructor: add
    @Inject(PurchaseSettlement) private readonly settlement: PurchaseSettlement,
```
Replace `syncPlan` with:
```ts
  private async syncPlan(plan: PlanRow): Promise<void> {
    const db = this.dbh.db;
    const [mandate] = await db.select({ bankAccountId: mandates.bankAccountId }).from(mandates).where(eq(mandates.id, plan.mandateId));
    if (mandate === undefined) return;
    const { items } = await this.fpRead.purchases({ plan: plan.fpPlanId as string });
    for (const raw of items) {
      const fp = toFpPurchaseView(raw);
      if (!FP_ORDER_STATES.has(fp.state)) continue;
      const status = fpStateToOrderStatus(fp.state as FpOrderState, { unitsAllotted: fp.allottedUnits !== null });
      const mirror: OrderStatus = SETTLEMENT_OWNED.has(status) ? 'PROCESSING' : status;
      const orderId = await db.transaction(async (tx) => {
        const [existing] = await tx
          .select({ id: orders.id, status: orders.status })
          .from(orders)
          .where(and(eq(orders.planId, plan.id), eq(orders.fpOrderId, fp.id)));
        if (existing === undefined) {
          const id = newId('orders');
          await tx.insert(orders).values({
            id,
            createdBy: plan.investorId,
            updatedBy: plan.investorId,
            investorId: plan.investorId,
            type: 'PURCHASE',
            origin: 'SIP_INSTALMENT',
            planId: plan.id,
            schemeId: plan.schemeId,
            folioId: plan.folioId,
            amount: plan.amount,
            status: mirror,
            bankAccountId: mandate.bankAccountId,
            arn: plan.arn,
            initiatedVia: plan.initiatedVia,
            userIp: plan.userIp,
            fpOrderId: fp.id,
            fpOldId: fp.oldId,
            fpState: fp.state,
          });
          await tx.insert(orderEvents).values({ orderId: id, planId: plan.id, toStatus: mirror, trigger: 'fp_instalment_sync' });
          return id;
        }
        // Mirror forward only while the order is before PROCESSING; from PROCESSING on, PurchaseSettlement owns it.
        if (existing.status !== mirror && existing.status !== 'PROCESSING' && !SETTLEMENT_OWNED.has(existing.status)) {
          await tx.update(orders).set({ status: mirror, fpState: fp.state }).where(eq(orders.id, existing.id));
          await tx.insert(orderEvents).values({ orderId: existing.id, planId: plan.id, fromStatus: existing.status, toStatus: mirror, trigger: 'fp_instalment_sync' });
        }
        return existing.id;
      });
      // A no-op when nothing changed; SETTLED/UNITS_PENDING/FAILED/EXPIRED/REVERSED and the lot happen here.
      if (SETTLEMENT_OWNED.has(status)) await this.settlement.apply(orderId, fp);
    }
    await this.warnOnMisses(plan);
  }
```
`apps/api/src/modules/plans/plans.module.ts` (F2's file): add `PortfolioModule.forRoot(env)` to `imports` (import it from `../portfolio/portfolio.module.js`). It exports `PurchaseSettlement` in every role; `InstalmentsSyncJob` stays worker only.

`orders.units.reconcile` also picks up PROCESSING instalments whose sync has not run yet (it selects by `fp_order_id`, not by origin), so an instalment settles on whichever runs first.

- [ ] **Step 4: Run tests to confirm they pass**

```
pnpm --filter=@sanchay/api db:generate --name=ledger
pnpm --filter=@sanchay/api db:generate --custom --name=ledger_guards
pnpm gen:states
pnpm --filter=@sanchay/domain typecheck
pnpm --filter=@sanchay/domain test
pnpm --filter=@sanchay/api typecheck
pnpm --filter=@sanchay/api test -- fp-holdings purchase-settlement
pnpm --filter=@sanchay/api test:int -- ledger folio-sync payments orders fp-webhooks sip-mandate
```
After the `--custom` command, paste the `REVOKE` from Step 3 into the empty `0030_ledger_guards.sql`, then run the rest.

Expected:
- The generated `ledger` migration creates the four tables with their checks, partial indexes and foreign keys, and adds the `folios` and `orders` columns, `folios_amc_number_uq` and the two new checks. No other table changes.
- Domain tests: `fifo` 12/12, `elss-lock` 10/10, `business-days` 5/5 and the new `states` case pass. The rules keep the package's 95% coverage gate (they are fully covered).
- API unit tests: `fp-holdings` 8/8 and `purchase-settlement` 3/3.
- Integration tests: `ledger.int.test.ts` 14/14 and `folio-sync.int.test.ts` 9/9. E21's `payments.int.test.ts` stays 9/9, now with a SETTLED order and a lot. E20's `orders.int.test.ts` and E1's `fp-webhooks` stay green. F2's `sip-mandate.int.test.ts` gains one passing instalment test; its other tests stay green.
- `docs/specs/states.md` shows the new edge.

- [ ] **Step 5: Commit**

```
pnpm exec biome check --write packages/domain/src/rules packages/domain/src/states/order.ts packages/domain/test packages/test-fixtures/src/golden/fifo.json packages/test-fixtures/src/golden/elss-lock.json apps/api/src/modules/portfolio apps/api/src/modules/orders/orders.schema.ts apps/api/src/modules/payments apps/api/src/integrations/fp/fake apps/api/src/modules/platform apps/api/src/app.module.ts apps/api/test/int
pnpm --filter=@sanchay/domain test
pnpm --filter=@sanchay/api typecheck
pnpm --filter=@sanchay/api test:int -- ledger folio-sync payments
pnpm lint
git add packages/domain/src/rules packages/domain/src/states/order.ts packages/domain/test/fifo.test.ts packages/domain/test/elss-lock.test.ts packages/domain/test/business-days.test.ts packages/domain/test/states.test.ts docs/specs/states.md packages/test-fixtures/src/golden/fifo.json packages/test-fixtures/src/golden/elss-lock.json apps/api/src/modules/portfolio apps/api/src/modules/orders/orders.schema.ts apps/api/src/modules/payments/fp-events.ts apps/api/src/modules/payments/payments.module.ts apps/api/src/integrations/fp/fake/fake-fp.state.ts apps/api/src/integrations/fp/fake/fake-fp.ts apps/api/src/modules/platform/runtime-config.ts apps/api/src/modules/platform/jobs/job-registry.ts apps/api/src/modules/platform/jobs/schedules.ts apps/api/src/modules/platform/ids.ts apps/api/src/app.module.ts apps/api/drizzle apps/api/test/int/ledger-seed.ts apps/api/test/int/ledger.int.test.ts apps/api/test/int/folio-sync.int.test.ts apps/api/test/int/payments.int.test.ts apps/api/src/modules/plans apps/api/test/int/sip-mandate.int.test.ts
git commit -m "feat(portfolio): FIFO ledger with ELSS lock and SHORTFALL-BREAK, folio.sync holdings snapshot, orders.units.reconcile (F4)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**How this task was checked while it was written (2026-09-29).** The code above was run in a scratch prototype, not in the repo (Plans 02–03 are not implemented yet):
- **Domain rules and golden vectors:** run with Vitest 5.0.1 and `@sanchay/money` from `main`: 27/27 tests pass, with 100% statement and branch coverage of the three rule files. The FIFO and ELSS expectations were also checked by hand.
- **Schema:** the portfolio, folio and order schema went through drizzle-kit 0.31.11 twice, once without F4 and once with it. The F4 delta is the `ledger` migration described in Step 4.
- **Ledger code:** `Ledger`, `PurchaseSettlement`, the parsers, both jobs, the FakeFp additions and the D1 fix ran against a real PostgreSQL 16 through Drizzle 0.45.3.
- **Integration tests:** `ledger.int.test.ts` and `folio-sync.int.test.ts`, as written above, ran through a stand-in for `bootFpTestApp` that wires the same classes by hand over D4's FakeFp (undici `MockAgent`).
- **Not exercised:** Nest DI, D3's real transport (tokens, lossless-json) and PostgreSQL 18. Step 4 is their check.

---

### Task F5: Redemption backend, AMOUNT and ALL (Dev A, 16 h) — PART 1 OF 2 (domain rules)

> **Partial.** This part pins and verifies the domain rules and golden vectors (resume steps 2–3 of `docs/till_now.md` §7.3). Part 2 (contract, `quoteRedemption`/`createRedemption`, the REDEMPTION consent builder, the submit/advance jobs, settlement through `Ledger.applyExit`, `payout.watch`, the `mf_redemption` handler, FakeFp routes, migrations and the integration tests) is still to be written; until then the task's Files/Interfaces below cover the domain half only.

**Files (part 1):**
- **Create (domain):** `packages/domain/src/rules/{redemption-buffer.ts, redemption-availability.ts}`, `packages/domain/test/redemption-availability.test.ts`
- **Create (golden):** `packages/test-fixtures/src/golden/redemption-availability.json`
- **Modify (domain):** `packages/domain/src/rules/business-days.ts` (F4; append `addCalendarDays`, `isBusinessDay`, `nextBusinessDay`), `packages/domain/src/rules/index.ts` (append two exports)

**Interfaces (part 1):**
- **Consumes:** F4 `businessDaysAfter`, `istIsoDate`, `isLotUnlocked`; E22 `CutoffHolidays`; Plan 01 `VolatilityClass`, `NavGrade` (`OK | STALE | UNAVAILABLE`), `IsoDate`/`toIsoDate`, `@sanchay/money` `Dec`, `Money`, `Nav`, `Units`, `Rounding`. The σ class comes from `sebi_categories.volatility_class` (Plan 02 seed), not a per-category table.
- **Produces:**
  - `VOLATILITY_SIGMA`, `REDEMPTION_BUFFER_FLOOR`, `REDEMPTION_BUFFER_CAP`, `redemptionBuffer({volatilityClass, latestNavDate, exitNavDate, holidays}) → {n, buffer}` (buffer a 4 dp fraction string, rounded up).
  - `REDEMPTION_CUTOFFS`, `expectedRedemptionNavDate({cutoffClass, at, holidays}) → {navDate, displayCutoff}`.
  - `FolioReconciliation`, `AvailabilityLot`, `redemptionAvailability(input) → {heldUnits, lockedUnits, unlockedUnits, reservedUnits, availableUnits, providerShort, maxAmount, all}` with `all: FULL{units} | AMOUNT_WITH_RESIDUAL{amount} | REFUSED{code}`.
  - `reservationUnits(amount, nav, buffer)`, `checkRedemptionAmount(amount, availability) → RedemptionRefusal | null`.
  - Refusal codes are Plan 01's: `REDEMPTION_CONFLICT_PENDING`, `FOLIO_RECONCILIATION_REQUIRED`, `INSUFFICIENT_REDEEMABLE`, `NAV_UNAVAILABLE`.

**Decisions pinned in part 1** (spec sources: design §F.6, D-MONEY-023/050/051, GAP-05 1a/1b):
- **σ and n verified:** σ V_HIGH 1.5%, V_EQUITY 1.2%, V_HYBRID 0.6%, V_DEBT 0.2%, V_CASH 0.02%; `n = max(1, businessDaysAfter(latestNavDate, exitNavDate))`. The spec gives no scale for the buffer; it is rounded **up** to 4 dp.
- **Redemption cut-offs:** STANDARD and LIQUID 15:00 (shown 14:45); OVERNIGHT online 19:00 (shown 18:45). STANDARD gets the effective day's NAV; LIQUID and OVERNIGHT get the NAV of the day before the next business day after the effective day. E22's `expectedNavDate` stays purchase-only.
- **min(ledger, FP):** reservations are subtracted from both the ledger's unlocked units and FP's redeemable units, because FP may not yet reflect an exit Sanchay has reserved. This can under-offer while an exit is in flight; it never over-offers.
- **ALL**, in order: any ACTIVE reservation → `REDEMPTION_CONFLICT_PENDING`; MISMATCH, FEED_UNAVAILABLE or FP short → `FOLIO_RECONCILIATION_REQUIRED`; nothing available → `INSUFFICIENT_REDEEMABLE`; no locked units and MATCHED within 24 h → FULL; otherwise the floor2 amount with a residual (needs NAV OK, else `NAV_UNAVAILABLE`). STP/SWP (`PLAN_ACTIVE_ON_HOLDING`) is not in the MVP.
- **Reservation never exceeds availability** for an amount that passes `checkRedemptionAmount` (proved in the `reservationUnits` comment and asserted over every vector), so it is not capped.

- [ ] **Step 1 (part 1): Write the failing tests**

`packages/test-fixtures/src/golden/redemption-availability.json` (RN-01..11 NAV dates, RB-01..11 buffers, RA-01..15 availability, RA-V1 the v1 cross-check):
```json
{
  "navDate": [
    {
      "id": "RN-01",
      "name": "STANDARD Mon 14:59 IST: same day",
      "cutoffClass": "STANDARD",
      "atIso": "2026-10-12T09:29:00.000Z",
      "holidays": [],
      "expectedNavDate": "2026-10-12",
      "expectedDisplayCutoff": "14:45"
    },
    {
      "id": "RN-02",
      "name": "STANDARD Mon 15:00 IST: next business day",
      "cutoffClass": "STANDARD",
      "atIso": "2026-10-12T09:30:00.000Z",
      "holidays": [],
      "expectedNavDate": "2026-10-13",
      "expectedDisplayCutoff": "14:45"
    },
    {
      "id": "RN-03",
      "name": "STANDARD Fri 16:00 IST: Monday",
      "cutoffClass": "STANDARD",
      "atIso": "2026-10-16T10:30:00.000Z",
      "holidays": [],
      "expectedNavDate": "2026-10-19",
      "expectedDisplayCutoff": "14:45"
    },
    {
      "id": "RN-04",
      "name": "STANDARD Saturday: Monday",
      "cutoffClass": "STANDARD",
      "atIso": "2026-10-17T05:00:00.000Z",
      "holidays": [],
      "expectedNavDate": "2026-10-19",
      "expectedDisplayCutoff": "14:45"
    },
    {
      "id": "RN-05",
      "name": "LIQUID Mon 14:59: day before Tuesday",
      "cutoffClass": "LIQUID",
      "atIso": "2026-10-12T09:29:00.000Z",
      "holidays": [],
      "expectedNavDate": "2026-10-12",
      "expectedDisplayCutoff": "14:45"
    },
    {
      "id": "RN-06",
      "name": "LIQUID Fri 14:00: Sunday (day before Monday)",
      "cutoffClass": "LIQUID",
      "atIso": "2026-10-16T08:30:00.000Z",
      "holidays": [],
      "expectedNavDate": "2026-10-18",
      "expectedDisplayCutoff": "14:45"
    },
    {
      "id": "RN-07",
      "name": "LIQUID Fri 15:30: effective Monday, so Monday",
      "cutoffClass": "LIQUID",
      "atIso": "2026-10-16T10:00:00.000Z",
      "holidays": [],
      "expectedNavDate": "2026-10-19",
      "expectedDisplayCutoff": "14:45"
    },
    {
      "id": "RN-08",
      "name": "OVERNIGHT Mon 18:59 (NC-004)",
      "cutoffClass": "OVERNIGHT",
      "atIso": "2026-10-12T13:29:00.000Z",
      "holidays": [],
      "expectedNavDate": "2026-10-12",
      "expectedDisplayCutoff": "18:45"
    },
    {
      "id": "RN-09",
      "name": "OVERNIGHT Mon 19:00: effective Tuesday",
      "cutoffClass": "OVERNIGHT",
      "atIso": "2026-10-12T13:30:00.000Z",
      "holidays": [],
      "expectedNavDate": "2026-10-13",
      "expectedDisplayCutoff": "18:45"
    },
    {
      "id": "RN-10",
      "name": "LIQUID Mon 10:00, Tue holiday: day before Wednesday",
      "cutoffClass": "LIQUID",
      "atIso": "2026-11-09T04:30:00.000Z",
      "holidays": ["2026-11-10"],
      "expectedNavDate": "2026-11-10",
      "expectedDisplayCutoff": "14:45"
    },
    {
      "id": "RN-11",
      "name": "STANDARD on a holiday Monday: Tuesday",
      "cutoffClass": "STANDARD",
      "atIso": "2026-11-09T04:30:00.000Z",
      "holidays": ["2026-11-09"],
      "expectedNavDate": "2026-11-10",
      "expectedDisplayCutoff": "14:45"
    }
  ],
  "buffer": [
    {
      "id": "RB-01",
      "name": "V_EQUITY n=1",
      "volatilityClass": "V_EQUITY",
      "latestNavDate": "2026-10-12",
      "exitNavDate": "2026-10-13",
      "holidays": [],
      "expectedN": 1,
      "expectedBuffer": "0.0360"
    },
    {
      "id": "RB-02",
      "name": "V_EQUITY same date: n floors to 1",
      "volatilityClass": "V_EQUITY",
      "latestNavDate": "2026-10-12",
      "exitNavDate": "2026-10-12",
      "holidays": [],
      "expectedN": 1,
      "expectedBuffer": "0.0360"
    },
    {
      "id": "RB-03",
      "name": "V_EQUITY n=2 rounds up",
      "volatilityClass": "V_EQUITY",
      "latestNavDate": "2026-10-12",
      "exitNavDate": "2026-10-14",
      "holidays": [],
      "expectedN": 2,
      "expectedBuffer": "0.0510"
    },
    {
      "id": "RB-04",
      "name": "V_HIGH n=5 hits the 10% cap",
      "volatilityClass": "V_HIGH",
      "latestNavDate": "2026-10-12",
      "exitNavDate": "2026-10-19",
      "holidays": [],
      "expectedN": 5,
      "expectedBuffer": "0.1000"
    },
    {
      "id": "RB-05",
      "name": "V_HYBRID n=1 hits the 2% floor",
      "volatilityClass": "V_HYBRID",
      "latestNavDate": "2026-10-12",
      "exitNavDate": "2026-10-13",
      "holidays": [],
      "expectedN": 1,
      "expectedBuffer": "0.0200"
    },
    {
      "id": "RB-06",
      "name": "V_HYBRID n=2 rounds up",
      "volatilityClass": "V_HYBRID",
      "latestNavDate": "2026-10-12",
      "exitNavDate": "2026-10-14",
      "holidays": [],
      "expectedN": 2,
      "expectedBuffer": "0.0255"
    },
    {
      "id": "RB-07",
      "name": "V_DEBT n=3 floor",
      "volatilityClass": "V_DEBT",
      "latestNavDate": "2026-10-12",
      "exitNavDate": "2026-10-15",
      "holidays": [],
      "expectedN": 3,
      "expectedBuffer": "0.0200"
    },
    {
      "id": "RB-08",
      "name": "V_CASH n=1 floor",
      "volatilityClass": "V_CASH",
      "latestNavDate": "2026-10-12",
      "exitNavDate": "2026-10-13",
      "holidays": [],
      "expectedN": 1,
      "expectedBuffer": "0.0200"
    },
    {
      "id": "RB-09",
      "name": "V_EQUITY Fri NAV to Mon exit: weekend is not counted",
      "volatilityClass": "V_EQUITY",
      "latestNavDate": "2026-10-16",
      "exitNavDate": "2026-10-19",
      "holidays": [],
      "expectedN": 1,
      "expectedBuffer": "0.0360"
    },
    {
      "id": "RB-10",
      "name": "V_EQUITY Mon NAV to Wed exit over a Tue holiday: n=1",
      "volatilityClass": "V_EQUITY",
      "latestNavDate": "2026-11-09",
      "exitNavDate": "2026-11-11",
      "holidays": ["2026-11-10"],
      "expectedN": 1,
      "expectedBuffer": "0.0360"
    },
    {
      "id": "RB-11",
      "name": "V_HIGH n=1",
      "volatilityClass": "V_HIGH",
      "latestNavDate": "2026-10-12",
      "exitNavDate": "2026-10-13",
      "holidays": [],
      "expectedN": 1,
      "expectedBuffer": "0.0450"
    }
  ],
  "availability": [
    {
      "reservedUnits": "0.000",
      "reconciliation": "MATCHED",
      "lastReconciledAt": "2026-10-12T00:00:00.000Z",
      "now": "2026-10-12T05:00:00.000Z",
      "nav": "100.000000",
      "navGrade": "OK",
      "buffer": "0.0360",
      "id": "RA-01",
      "name": "NAV flat between quote and allotment: max amount fits the reservation",
      "lots": [
        {
          "id": "l1",
          "unitsRemaining": "100.000",
          "allotmentDate": "2025-01-15",
          "lockInUntil": null,
          "lockInMonths": null
        }
      ],
      "providerRedeemableUnits": "100.000",
      "amount": "9640.00",
      "allotmentNav": "100.000000",
      "exitNavDate": "2026-10-12",
      "expected": {
        "exitNavDate": "2026-10-12",
        "heldUnits": "100.000",
        "lockedUnits": "0.000",
        "unlockedUnits": "100.000",
        "availableUnits": "100.000",
        "providerShort": false,
        "maxAmount": "9640.00",
        "all": {
          "kind": "FULL",
          "units": "100.000"
        },
        "amountCheck": null,
        "reservationUnits": "99.871",
        "unitsAtAllotment": "96.400"
      }
    },
    {
      "reservedUnits": "0.000",
      "reconciliation": "MATCHED",
      "lastReconciledAt": "2026-10-12T00:00:00.000Z",
      "now": "2026-10-12T05:00:00.000Z",
      "nav": "100.000000",
      "navGrade": "OK",
      "buffer": "0.0360",
      "id": "RA-02",
      "name": "NAV -3% at allotment: the units FP redeems still fit the reservation",
      "lots": [
        {
          "id": "l1",
          "unitsRemaining": "100.000",
          "allotmentDate": "2025-01-15",
          "lockInUntil": null,
          "lockInMonths": null
        }
      ],
      "providerRedeemableUnits": "100.000",
      "amount": "9640.00",
      "allotmentNav": "97.000000",
      "exitNavDate": "2026-10-12",
      "expected": {
        "exitNavDate": "2026-10-12",
        "heldUnits": "100.000",
        "lockedUnits": "0.000",
        "unlockedUnits": "100.000",
        "availableUnits": "100.000",
        "providerShort": false,
        "maxAmount": "9640.00",
        "all": {
          "kind": "FULL",
          "units": "100.000"
        },
        "amountCheck": null,
        "reservationUnits": "99.871",
        "unitsAtAllotment": "99.382"
      }
    },
    {
      "reservedUnits": "0.000",
      "reconciliation": "MATCHED",
      "lastReconciledAt": "2026-10-12T00:00:00.000Z",
      "now": "2026-10-12T05:00:00.000Z",
      "nav": "100.000000",
      "navGrade": "OK",
      "buffer": "0.0360",
      "id": "RA-03",
      "name": "NAV +3% at allotment",
      "lots": [
        {
          "id": "l1",
          "unitsRemaining": "100.000",
          "allotmentDate": "2025-01-15",
          "lockInUntil": null,
          "lockInMonths": null
        }
      ],
      "providerRedeemableUnits": "100.000",
      "amount": "9640.00",
      "allotmentNav": "103.000000",
      "exitNavDate": "2026-10-12",
      "expected": {
        "exitNavDate": "2026-10-12",
        "heldUnits": "100.000",
        "lockedUnits": "0.000",
        "unlockedUnits": "100.000",
        "availableUnits": "100.000",
        "providerShort": false,
        "maxAmount": "9640.00",
        "all": {
          "kind": "FULL",
          "units": "100.000"
        },
        "amountCheck": null,
        "reservationUnits": "99.871",
        "unitsAtAllotment": "93.593"
      }
    },
    {
      "reservedUnits": "99.871",
      "reconciliation": "MATCHED",
      "lastReconciledAt": "2026-10-12T00:00:00.000Z",
      "now": "2026-10-12T05:00:00.000Z",
      "nav": "100.000000",
      "navGrade": "OK",
      "buffer": "0.0360",
      "id": "RA-04",
      "name": "RA-01's ACTIVE reservation blocks a concurrent draft and ALL",
      "lots": [
        {
          "id": "l1",
          "unitsRemaining": "100.000",
          "allotmentDate": "2025-01-15",
          "lockInUntil": null,
          "lockInMonths": null
        }
      ],
      "providerRedeemableUnits": "100.000",
      "amount": "9640.00",
      "exitNavDate": "2026-10-12",
      "expected": {
        "exitNavDate": "2026-10-12",
        "heldUnits": "100.000",
        "lockedUnits": "0.000",
        "unlockedUnits": "100.000",
        "availableUnits": "0.129",
        "providerShort": false,
        "maxAmount": "12.43",
        "all": {
          "kind": "REFUSED",
          "code": "REDEMPTION_CONFLICT_PENDING"
        },
        "amountCheck": "INSUFFICIENT_REDEEMABLE"
      }
    },
    {
      "reservedUnits": "0.000",
      "reconciliation": "MATCHED",
      "lastReconciledAt": "2027-02-26T00:00:00.000Z",
      "now": "2027-02-26T05:00:00.000Z",
      "nav": "100.000000",
      "navGrade": "OK",
      "buffer": "0.0360",
      "id": "RA-05",
      "name": "ELSS allotted 29-Feb-2024: locked on its lock-in date 28-Feb-2027 (strict)",
      "lots": [
        {
          "id": "e1",
          "unitsRemaining": "50.000",
          "allotmentDate": "2024-02-29",
          "lockInUntil": "2027-02-28",
          "lockInMonths": 36
        },
        {
          "id": "p1",
          "unitsRemaining": "10.000",
          "allotmentDate": "2023-01-10",
          "lockInUntil": null,
          "lockInMonths": null
        }
      ],
      "providerRedeemableUnits": "60.000",
      "exitNavDate": "2027-02-28",
      "expected": {
        "exitNavDate": "2027-02-28",
        "heldUnits": "60.000",
        "lockedUnits": "50.000",
        "unlockedUnits": "10.000",
        "availableUnits": "10.000",
        "providerShort": false,
        "maxAmount": "964.00",
        "all": {
          "kind": "AMOUNT_WITH_RESIDUAL",
          "amount": "964.00"
        }
      }
    },
    {
      "reservedUnits": "0.000",
      "reconciliation": "MATCHED",
      "lastReconciledAt": "2027-02-26T00:00:00.000Z",
      "now": "2027-02-26T05:00:00.000Z",
      "nav": "100.000000",
      "navGrade": "OK",
      "buffer": "0.0360",
      "id": "RA-06",
      "name": "ELSS allotted 29-Feb-2024: unlocked the day after (1-Mar-2027)",
      "lots": [
        {
          "id": "e1",
          "unitsRemaining": "50.000",
          "allotmentDate": "2024-02-29",
          "lockInUntil": "2027-02-28",
          "lockInMonths": 36
        },
        {
          "id": "p1",
          "unitsRemaining": "10.000",
          "allotmentDate": "2023-01-10",
          "lockInUntil": null,
          "lockInMonths": null
        }
      ],
      "providerRedeemableUnits": "60.000",
      "exitNavDate": "2027-03-01",
      "expected": {
        "exitNavDate": "2027-03-01",
        "heldUnits": "60.000",
        "lockedUnits": "0.000",
        "unlockedUnits": "60.000",
        "availableUnits": "60.000",
        "providerShort": false,
        "maxAmount": "5784.00",
        "all": {
          "kind": "FULL",
          "units": "60.000"
        }
      }
    },
    {
      "reservedUnits": "0.000",
      "reconciliation": "MATCHED",
      "lastReconciledAt": "2026-10-12T00:00:00.000Z",
      "now": "2026-10-12T05:00:00.000Z",
      "nav": "100.000000",
      "navGrade": "OK",
      "buffer": "0.0360",
      "id": "RA-07",
      "name": "ELSS lock ends on a month-end: still locked at that NAV date",
      "lots": [
        {
          "id": "e1",
          "unitsRemaining": "40.000",
          "allotmentDate": "2023-10-31",
          "lockInUntil": "2026-10-31",
          "lockInMonths": 36
        }
      ],
      "providerRedeemableUnits": "40.000",
      "exitNavDate": "2026-10-31",
      "expected": {
        "exitNavDate": "2026-10-31",
        "heldUnits": "40.000",
        "lockedUnits": "40.000",
        "unlockedUnits": "0.000",
        "availableUnits": "0.000",
        "providerShort": false,
        "maxAmount": "0.00",
        "all": {
          "kind": "REFUSED",
          "code": "INSUFFICIENT_REDEEMABLE"
        }
      }
    },
    {
      "reservedUnits": "0.000",
      "reconciliation": "MATCHED",
      "lastReconciledAt": "2026-11-09T00:00:00.000Z",
      "now": "2026-11-09T04:30:00.000Z",
      "nav": "100.000000",
      "navGrade": "OK",
      "buffer": "0.0360",
      "id": "RA-08",
      "name": "ELSS lock ends on a holiday Monday: the exit NAV rolls to Tuesday, so the lot is unlocked",
      "lots": [
        {
          "id": "e1",
          "unitsRemaining": "40.000",
          "allotmentDate": "2023-11-09",
          "lockInUntil": "2026-11-09",
          "lockInMonths": 36
        }
      ],
      "providerRedeemableUnits": "40.000",
      "exitAt": {
        "cutoffClass": "STANDARD",
        "atIso": "2026-11-09T04:30:00.000Z",
        "holidays": ["2026-11-09"]
      },
      "expected": {
        "exitNavDate": "2026-11-10",
        "heldUnits": "40.000",
        "lockedUnits": "0.000",
        "unlockedUnits": "40.000",
        "availableUnits": "40.000",
        "providerShort": false,
        "maxAmount": "3856.00",
        "all": {
          "kind": "FULL",
          "units": "40.000"
        }
      }
    },
    {
      "reservedUnits": "0.000",
      "reconciliation": "MISMATCH",
      "lastReconciledAt": "2026-10-12T00:00:00.000Z",
      "now": "2026-10-12T05:00:00.000Z",
      "nav": "100.000000",
      "navGrade": "OK",
      "buffer": "0.0360",
      "id": "RA-09",
      "name": "FP redeemable below the ledger: MISMATCH, ALL refused, AMOUNT capped at FP",
      "lots": [
        {
          "id": "l1",
          "unitsRemaining": "100.000",
          "allotmentDate": "2025-01-15",
          "lockInUntil": null,
          "lockInMonths": null
        }
      ],
      "providerRedeemableUnits": "80.000",
      "exitNavDate": "2026-10-12",
      "expected": {
        "exitNavDate": "2026-10-12",
        "heldUnits": "100.000",
        "lockedUnits": "0.000",
        "unlockedUnits": "100.000",
        "availableUnits": "80.000",
        "providerShort": true,
        "maxAmount": "7712.00",
        "all": {
          "kind": "REFUSED",
          "code": "FOLIO_RECONCILIATION_REQUIRED"
        }
      }
    },
    {
      "reservedUnits": "0.000",
      "reconciliation": "MATCHED",
      "lastReconciledAt": "2026-10-12T00:00:00.000Z",
      "now": "2026-10-12T05:00:00.000Z",
      "nav": "100.000000",
      "navGrade": "STALE",
      "buffer": "0.0360",
      "id": "RA-10",
      "name": "NAV STALE: no AMOUNT, but ALL of an unlocked MATCHED folio is FULL",
      "lots": [
        {
          "id": "l1",
          "unitsRemaining": "100.000",
          "allotmentDate": "2025-01-15",
          "lockInUntil": null,
          "lockInMonths": null
        }
      ],
      "providerRedeemableUnits": "100.000",
      "amount": "100.00",
      "exitNavDate": "2026-10-12",
      "expected": {
        "exitNavDate": "2026-10-12",
        "heldUnits": "100.000",
        "lockedUnits": "0.000",
        "unlockedUnits": "100.000",
        "availableUnits": "100.000",
        "providerShort": false,
        "maxAmount": null,
        "all": {
          "kind": "FULL",
          "units": "100.000"
        },
        "amountCheck": "NAV_UNAVAILABLE"
      }
    },
    {
      "reservedUnits": "0.000",
      "reconciliation": "UNRECONCILED",
      "lastReconciledAt": null,
      "now": "2026-10-12T05:00:00.000Z",
      "nav": "100.000000",
      "navGrade": "STALE",
      "buffer": "0.0360",
      "id": "RA-11",
      "name": "NAV STALE and UNRECONCILED: ALL refused with NAV_UNAVAILABLE",
      "lots": [
        {
          "id": "l1",
          "unitsRemaining": "100.000",
          "allotmentDate": "2025-01-15",
          "lockInUntil": null,
          "lockInMonths": null
        }
      ],
      "providerRedeemableUnits": "100.000",
      "exitNavDate": "2026-10-12",
      "expected": {
        "exitNavDate": "2026-10-12",
        "heldUnits": "100.000",
        "lockedUnits": "0.000",
        "unlockedUnits": "100.000",
        "availableUnits": "100.000",
        "providerShort": false,
        "maxAmount": null,
        "all": {
          "kind": "REFUSED",
          "code": "NAV_UNAVAILABLE"
        }
      }
    },
    {
      "reservedUnits": "0.000",
      "reconciliation": "MATCHED",
      "lastReconciledAt": "2026-10-11T04:00:00.000Z",
      "now": "2026-10-12T05:00:00.000Z",
      "nav": "100.000000",
      "navGrade": "OK",
      "buffer": "0.0360",
      "id": "RA-12",
      "name": "MATCHED 25 h ago: ALL falls back to the amount with a residual",
      "lots": [
        {
          "id": "l1",
          "unitsRemaining": "100.000",
          "allotmentDate": "2025-01-15",
          "lockInUntil": null,
          "lockInMonths": null
        }
      ],
      "providerRedeemableUnits": "100.000",
      "exitNavDate": "2026-10-12",
      "expected": {
        "exitNavDate": "2026-10-12",
        "heldUnits": "100.000",
        "lockedUnits": "0.000",
        "unlockedUnits": "100.000",
        "availableUnits": "100.000",
        "providerShort": false,
        "maxAmount": "9640.00",
        "all": {
          "kind": "AMOUNT_WITH_RESIDUAL",
          "amount": "9640.00"
        }
      }
    },
    {
      "reservedUnits": "0.000",
      "reconciliation": "FEED_UNAVAILABLE",
      "lastReconciledAt": null,
      "now": "2026-10-12T05:00:00.000Z",
      "nav": "100.000000",
      "navGrade": "OK",
      "buffer": "0.0360",
      "id": "RA-13",
      "name": "FEED_UNAVAILABLE (no FP snapshot): AMOUNT on the ledger, ALL refused",
      "lots": [
        {
          "id": "l1",
          "unitsRemaining": "100.000",
          "allotmentDate": "2025-01-15",
          "lockInUntil": null,
          "lockInMonths": null
        }
      ],
      "providerRedeemableUnits": null,
      "exitNavDate": "2026-10-12",
      "expected": {
        "exitNavDate": "2026-10-12",
        "heldUnits": "100.000",
        "lockedUnits": "0.000",
        "unlockedUnits": "100.000",
        "availableUnits": "100.000",
        "providerShort": false,
        "maxAmount": "9640.00",
        "all": {
          "kind": "REFUSED",
          "code": "FOLIO_RECONCILIATION_REQUIRED"
        }
      }
    },
    {
      "reservedUnits": "0.000",
      "reconciliation": "UNRECONCILED",
      "lastReconciledAt": null,
      "now": "2026-10-12T05:00:00.000Z",
      "nav": "10.000000",
      "navGrade": "OK",
      "buffer": "0.0360",
      "id": "RA-14",
      "name": "FP holds fewer units while UNRECONCILED: available capped at FP, ALL refused",
      "lots": [
        {
          "id": "l1",
          "unitsRemaining": "10.000",
          "allotmentDate": "2025-01-15",
          "lockInUntil": null,
          "lockInMonths": null
        }
      ],
      "providerRedeemableUnits": "5.000",
      "exitNavDate": "2026-10-12",
      "expected": {
        "exitNavDate": "2026-10-12",
        "heldUnits": "10.000",
        "lockedUnits": "0.000",
        "unlockedUnits": "10.000",
        "availableUnits": "5.000",
        "providerShort": true,
        "maxAmount": "48.20",
        "all": {
          "kind": "REFUSED",
          "code": "FOLIO_RECONCILIATION_REQUIRED"
        }
      }
    },
    {
      "reservedUnits": "0.000",
      "reconciliation": "UNRECONCILED",
      "lastReconciledAt": null,
      "now": "2026-10-12T05:00:00.000Z",
      "nav": "1.000000",
      "navGrade": "OK",
      "buffer": "0.0360",
      "id": "RA-15",
      "name": "Dust holding: the buffered maximum floors to 0.00, so ALL is refused",
      "lots": [
        {
          "id": "l1",
          "unitsRemaining": "0.001",
          "allotmentDate": "2025-01-15",
          "lockInUntil": null,
          "lockInMonths": null
        }
      ],
      "providerRedeemableUnits": "0.001",
      "exitNavDate": "2026-10-12",
      "expected": {
        "exitNavDate": "2026-10-12",
        "heldUnits": "0.001",
        "lockedUnits": "0.000",
        "unlockedUnits": "0.001",
        "availableUnits": "0.001",
        "providerShort": false,
        "maxAmount": "0.00",
        "all": {
          "kind": "REFUSED",
          "code": "INSUFFICIENT_REDEEMABLE"
        }
      }
    }
  ],
  "v1Reference": {
    "id": "RA-V1",
    "name": "v1 reference (RedemptionAvailability RED-02/04): 100 units, NAV 45.5, a pending AMOUNT exit of 1000.00. Cross-check only; v2 is more conservative by the buffer.",
    "input": {
      "heldUnits": "100.000",
      "nav": "45.500000",
      "pendingAmount": "1000.00",
      "buffer": "0.0360"
    },
    "v1": {
      "availableUnits": "78.02197802",
      "availableAmount": "3550.0000"
    },
    "v2": {
      "reservationUnits": "22.770",
      "availableUnits": "77.230",
      "maxAmount": "3387.46"
    }
  }
}
```

`packages/domain/test/redemption-availability.test.ts`:
```ts
import { Money, Nav, Rounding, Units } from '@sanchay/money';
import { describe, expect, it } from 'vitest';
import golden from '../../test-fixtures/src/golden/redemption-availability.json' with {
  type: 'json',
};
import type { NavGrade, VolatilityClass } from '../src/catalogue.js';
import { toIsoDate } from '../src/ids.js';
import {
  type AvailabilityLot,
  checkRedemptionAmount,
  expectedRedemptionNavDate,
  type FolioReconciliation,
  redemptionAvailability,
  reservationUnits,
} from '../src/rules/redemption-availability.js';
import { redemptionBuffer } from '../src/rules/redemption-buffer.js';

const u = (s: string): Units => Units.parse(s, 3);
const holidaysOf = (days: readonly string[]) => new Set(days);

describe('expectedRedemptionNavDate (RN golden vectors)', () => {
  it.each(golden.navDate)('$id $name', (v) => {
    const r = expectedRedemptionNavDate({
      cutoffClass: v.cutoffClass as 'STANDARD' | 'LIQUID' | 'OVERNIGHT',
      at: new Date(v.atIso),
      holidays: holidaysOf(v.holidays),
    });
    expect(r).toEqual({ navDate: v.expectedNavDate, displayCutoff: v.expectedDisplayCutoff });
  });
});

describe('redemptionBuffer (RB golden vectors)', () => {
  it.each(golden.buffer)('$id $name', (v) => {
    const r = redemptionBuffer({
      volatilityClass: v.volatilityClass as VolatilityClass,
      latestNavDate: toIsoDate(v.latestNavDate),
      exitNavDate: toIsoDate(v.exitNavDate),
      holidays: holidaysOf(v.holidays),
    });
    expect(r).toEqual({ n: v.expectedN, buffer: v.expectedBuffer });
  });
});

describe('redemptionAvailability (RA golden vectors)', () => {
  it.each(golden.availability)('$id $name', (v) => {
    const exitNavDate =
      'exitAt' in v && v.exitAt !== undefined
        ? expectedRedemptionNavDate({
            cutoffClass: 'STANDARD',
            at: new Date(v.exitAt.atIso),
            holidays: holidaysOf(v.exitAt.holidays),
          }).navDate
        : toIsoDate((v as { exitNavDate: string }).exitNavDate);
    const lots: AvailabilityLot[] = v.lots.map((l) => ({
      id: l.id,
      unitsRemaining: u(l.unitsRemaining),
      lockInUntil: l.lockInUntil === null ? null : toIsoDate(l.lockInUntil),
    }));
    const nav = Nav.parse(v.nav);
    const a = redemptionAvailability({
      lots,
      reservedUnits: u(v.reservedUnits),
      exitNavDate,
      providerRedeemableUnits:
        v.providerRedeemableUnits === null ? null : u(v.providerRedeemableUnits),
      reconciliation: v.reconciliation as FolioReconciliation,
      lastReconciledAt: v.lastReconciledAt === null ? null : new Date(v.lastReconciledAt),
      now: new Date(v.now),
      nav,
      navGrade: v.navGrade as NavGrade,
      buffer: v.buffer,
    });
    const e = v.expected;
    expect(exitNavDate).toBe(e.exitNavDate);
    expect({
      heldUnits: a.heldUnits.toWire(),
      lockedUnits: a.lockedUnits.toWire(),
      unlockedUnits: a.unlockedUnits.toWire(),
      availableUnits: a.availableUnits.toWire(),
      providerShort: a.providerShort,
      maxAmount: a.maxAmount?.toWire() ?? null,
    }).toEqual({
      heldUnits: e.heldUnits,
      lockedUnits: e.lockedUnits,
      unlockedUnits: e.unlockedUnits,
      availableUnits: e.availableUnits,
      providerShort: e.providerShort,
      maxAmount: e.maxAmount,
    });
    const all =
      a.all.kind === 'FULL'
        ? { kind: 'FULL', units: a.all.units.toWire() }
        : a.all.kind === 'AMOUNT_WITH_RESIDUAL'
          ? { kind: a.all.kind, amount: a.all.amount.toWire() }
          : a.all;
    expect(all).toEqual(e.all);

    if ('amount' in v && v.amount !== undefined) {
      const amount = Money.parse(v.amount);
      expect(checkRedemptionAmount(amount, a)).toBe(e.amountCheck);
      if (e.amountCheck === null) {
        const reserved = reservationUnits(amount, nav, v.buffer);
        expect(reserved.toWire()).toBe(e.reservationUnits);
        expect(reserved.compare(a.availableUnits)).toBeLessThanOrEqual(0);
        if ('allotmentNav' in v && v.allotmentNav !== undefined) {
          // The units FP redeems at the allotment NAV must fit inside the reservation (±3% vectors).
          const units = Units.round(
            amount.toDecimal().div(Nav.parse(v.allotmentNav).toDecimal()),
            3,
            Rounding.UP,
          );
          expect(units.toWire()).toBe(e.unitsAtAllotment);
          expect(units.compare(reserved)).toBeLessThanOrEqual(0);
        }
      }
    }
  });

  it('every amount at the buffered maximum reserves no more than the available units', () => {
    for (const v of golden.availability) {
      if (v.expected.maxAmount === null || v.expected.maxAmount === '0.00') continue;
      const reserved = reservationUnits(
        Money.parse(v.expected.maxAmount),
        Nav.parse(v.nav),
        v.buffer,
      );
      expect(reserved.compare(u(v.expected.availableUnits))).toBeLessThanOrEqual(0);
    }
  });

  it('RA-V1: v2 is never less conservative than the v1 reference', () => {
    const r = golden.v1Reference;
    const nav = Nav.parse(r.input.nav);
    const reserved = reservationUnits(Money.parse(r.input.pendingAmount), nav, r.input.buffer);
    const a = redemptionAvailability({
      lots: [{ id: 'l1', unitsRemaining: u(r.input.heldUnits), lockInUntil: null }],
      reservedUnits: reserved,
      exitNavDate: toIsoDate('2026-10-12'),
      providerRedeemableUnits: u(r.input.heldUnits),
      reconciliation: 'MATCHED',
      lastReconciledAt: new Date('2026-10-12T00:00:00.000Z'),
      now: new Date('2026-10-12T05:00:00.000Z'),
      nav,
      navGrade: 'OK',
      buffer: r.input.buffer,
    });
    expect({
      reservationUnits: reserved.toWire(),
      availableUnits: a.availableUnits.toWire(),
      maxAmount: a.maxAmount?.toWire() ?? null,
    }).toEqual(r.v2);
    expect(a.availableUnits.toDecimal().lte(r.v1.availableUnits)).toBe(true);
    expect(a.maxAmount?.toDecimal().lte(r.v1.availableAmount)).toBe(true);
  });

  it('checkRedemptionAmount refuses a zero or negative amount', () => {
    const a = redemptionAvailability({
      lots: [{ id: 'l1', unitsRemaining: u('10.000'), lockInUntil: null }],
      reservedUnits: u('0.000'),
      exitNavDate: toIsoDate('2026-10-12'),
      providerRedeemableUnits: null,
      reconciliation: 'UNRECONCILED',
      lastReconciledAt: null,
      now: new Date('2026-10-12T05:00:00.000Z'),
      nav: Nav.parse('10.000000'),
      navGrade: 'OK',
      buffer: '0.0360',
    });
    expect(checkRedemptionAmount(Money.parse('0.00'), a)).toBe('INSUFFICIENT_REDEEMABLE');
    expect(checkRedemptionAmount(Money.parse('50.00'), a)).toBeNull();
  });

  it('ignores lots with no units left', () => {
    const a = redemptionAvailability({
      lots: [
        { id: 'gone', unitsRemaining: u('0.000'), lockInUntil: toIsoDate('2030-01-01') },
        { id: 'l1', unitsRemaining: u('5.000'), lockInUntil: null },
      ],
      reservedUnits: u('0.000'),
      exitNavDate: toIsoDate('2026-10-12'),
      providerRedeemableUnits: u('5.000'),
      reconciliation: 'MATCHED',
      lastReconciledAt: new Date('2026-10-12T00:00:00.000Z'),
      now: new Date('2026-10-12T05:00:00.000Z'),
      nav: Nav.parse('10.000000'),
      navGrade: 'OK',
      buffer: '0.0360',
    });
    expect(a.heldUnits.toWire()).toBe('5.000');
    expect(a.lockedUnits.toWire()).toBe('0.000');
    expect(a.all).toEqual({ kind: 'FULL', units: u('5.000') });
  });
});
```

- [ ] **Step 2 (part 1): Run them to confirm they fail**

```
pnpm --filter=@sanchay/domain test -- redemption-availability
```
Expected: `Cannot find module '../src/rules/redemption-availability.js'`.

- [ ] **Step 3 (part 1): Minimal implementation**

`packages/domain/src/rules/business-days.ts` (F4's file; append):
```ts
/** F5: `isoDate` shifted by `days` calendar days (negative goes back). */
export function addCalendarDays(isoDate: IsoDate, days: number): IsoDate {
  return isoOf(utcMidnight(isoDate) + days * DAY_MS);
}

/** F5: Mon–Fri and not a holiday. */
export function isBusinessDay(isoDate: IsoDate, holidays: CutoffHolidays): boolean {
  const dow = new Date(utcMidnight(isoDate)).getUTCDay();
  return dow !== 0 && dow !== 6 && !holidays.has(isoDate);
}

/** F5: the first business day strictly after `isoDate`. */
export function nextBusinessDay(isoDate: IsoDate, holidays: CutoffHolidays): IsoDate {
  let day = addCalendarDays(isoDate, 1);
  while (!isBusinessDay(day, holidays)) day = addCalendarDays(day, 1);
  return day;
}
```

`packages/domain/src/rules/redemption-buffer.ts`:
```ts
import { Dec, Rounding } from '@sanchay/money';
import type { VolatilityClass } from '../catalogue.js';
import type { IsoDate } from '../ids.js';
import { businessDaysAfter } from './business-days.js';
import type { CutoffHolidays } from './cutoff.js';

/** Daily NAV σ per volatility class (design §F.6, D-MONEY-050). */
export const VOLATILITY_SIGMA: Readonly<Record<VolatilityClass, string>> = {
  V_HIGH: '0.015',
  V_EQUITY: '0.012',
  V_HYBRID: '0.006',
  V_DEBT: '0.002',
  V_CASH: '0.0002',
};
export const REDEMPTION_BUFFER_FLOOR = '0.02';
export const REDEMPTION_BUFFER_CAP = '0.10';

export interface RedemptionBufferInput {
  readonly volatilityClass: VolatilityClass;
  /** The NAV date of the NAV the quote is priced at (`schemes.nav_date`). */
  readonly latestNavDate: IsoDate;
  /** `expectedRedemptionNavDate(...)`: the NAV date the exit is expected to get. */
  readonly exitNavDate: IsoDate;
  readonly holidays: CutoffHolidays;
}

export interface RedemptionBuffer {
  /** Business days from the latest NAV date to the exit NAV date, at least 1. */
  readonly n: number;
  /** A fraction, 4 dp, rounded up (the conservative side): `"0.0360"` is 3.60%. */
  readonly buffer: string;
}

/**
 * `min(10%, max(2%, 3 × σ × √n))` (design §F.6). The spec fixes no scale for the fraction; it is
 * rounded UP to 4 dp so the cap never under-reserves.
 */
export function redemptionBuffer(input: RedemptionBufferInput): RedemptionBuffer {
  const n = Math.max(1, businessDaysAfter(input.latestNavDate, input.exitNavDate, input.holidays));
  const raw = new Dec(3).times(VOLATILITY_SIGMA[input.volatilityClass]).times(new Dec(n).sqrt());
  const clamped = Dec.min(REDEMPTION_BUFFER_CAP, Dec.max(REDEMPTION_BUFFER_FLOOR, raw));
  return { n, buffer: clamped.toDecimalPlaces(4, Rounding.UP).toFixed(4) };
}
```

`packages/domain/src/rules/redemption-availability.ts`:
```ts
import { Dec, Money, type Nav, Rounding, Units } from '@sanchay/money';
import type { NavGrade } from '../catalogue.js';
import type { IsoDate } from '../ids.js';
import { addCalendarDays, isBusinessDay, istIsoDate, nextBusinessDay } from './business-days.js';
import type { CutoffHolidays } from './cutoff.js';
import { isLotUnlocked } from './elss-lock.js';

type RedemptionCutoffClass = 'STANDARD' | 'LIQUID' | 'OVERNIGHT';

/**
 * Redemption cut-offs (GAP-05 1a/1b, D-MONEY-023; SEBI/HO/IMD/PoD2/P/CIR/2025/56): regulatory time in
 * IST minutes and the time shown to investors (15 minutes earlier, for OTP and FP submission).
 */
export const REDEMPTION_CUTOFFS: Readonly<
  Record<
    RedemptionCutoffClass,
    { readonly regulatoryMinutes: number; readonly displayCutoff: string }
  >
> = {
  STANDARD: { regulatoryMinutes: 15 * 60, displayCutoff: '14:45' },
  LIQUID: { regulatoryMinutes: 15 * 60, displayCutoff: '14:45' },
  OVERNIGHT: { regulatoryMinutes: 19 * 60, displayCutoff: '18:45' },
};

export interface RedemptionNavDateInput {
  readonly cutoffClass: RedemptionCutoffClass;
  /** When the redemption reaches the AMC: the confirm time (the server clock, never the client's). */
  readonly at: Date;
  readonly holidays: CutoffHolidays;
}

export interface RedemptionNavDate {
  readonly navDate: IsoDate;
  readonly displayCutoff: string;
}

const IST_OFFSET_MS = 330 * 60_000;

/**
 * Design §F.6/§F.8 `expectedNavDate` for exits. The effective day is today when it is a business day
 * and the time is before the regulatory cut-off, otherwise the next business day. STANDARD gets the
 * effective day's NAV; LIQUID and OVERNIGHT get the NAV of the calendar day before the business day
 * after the effective day (so a Friday redemption gets Sunday's NAV).
 */
export function expectedRedemptionNavDate(input: RedemptionNavDateInput): RedemptionNavDate {
  const cutoff = REDEMPTION_CUTOFFS[input.cutoffClass];
  const today = istIsoDate(input.at);
  const ist = new Date(input.at.getTime() + IST_OFFSET_MS);
  const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const effective =
    isBusinessDay(today, input.holidays) && minutes < cutoff.regulatoryMinutes
      ? today
      : nextBusinessDay(today, input.holidays);
  const navDate =
    input.cutoffClass === 'STANDARD'
      ? effective
      : addCalendarDays(nextBusinessDay(effective, input.holidays), -1);
  return { navDate, displayCutoff: cutoff.displayCutoff };
}

/** `folios.reconciliation_status` (F4). */
export type FolioReconciliation = 'UNRECONCILED' | 'MATCHED' | 'MISMATCH' | 'FEED_UNAVAILABLE';

export interface AvailabilityLot {
  readonly id: string;
  /** 3 dp. */
  readonly unitsRemaining: Units;
  readonly lockInUntil: IsoDate | null;
}

export interface RedemptionAvailabilityInput {
  /** OPEN lots of one folio and scheme. */
  readonly lots: readonly AvailabilityLot[];
  /** Σ units of the folio-scheme's ACTIVE redemption reservations (3 dp). */
  readonly reservedUnits: Units;
  readonly exitNavDate: IsoDate;
  /** FP `redeemable_units` from the R-09 snapshot, or null when there is none (FEED_UNAVAILABLE). */
  readonly providerRedeemableUnits: Units | null;
  readonly reconciliation: FolioReconciliation;
  readonly lastReconciledAt: Date | null;
  readonly now: Date;
  readonly nav: Nav;
  readonly navGrade: NavGrade;
  /** `redemptionBuffer(...).buffer`. */
  readonly buffer: string;
}

export type RedemptionRefusal =
  | 'REDEMPTION_CONFLICT_PENDING'
  | 'FOLIO_RECONCILIATION_REQUIRED'
  | 'INSUFFICIENT_REDEEMABLE'
  | 'NAV_UNAVAILABLE';

export type RedeemAllDecision =
  /** FP call with neither amount nor units (D-MONEY-051). */
  | { readonly kind: 'FULL'; readonly units: Units }
  /** The floor2 amount, with the residual note and a later "Redeem remaining". */
  | { readonly kind: 'AMOUNT_WITH_RESIDUAL'; readonly amount: Money }
  | { readonly kind: 'REFUSED'; readonly code: RedemptionRefusal };

export interface RedemptionAvailability {
  readonly heldUnits: Units;
  readonly lockedUnits: Units;
  readonly unlockedUnits: Units;
  readonly reservedUnits: Units;
  /** min(ledger, FP) after reservations, never negative. */
  readonly availableUnits: Units;
  /** FP's redeemable units are below the ledger's unlocked units: flag the folio, raise a break. */
  readonly providerShort: boolean;
  /** floor2(available × NAV × (1 − buffer)); null unless the NAV grade is OK (R-12). */
  readonly maxAmount: Money | null;
  readonly all: RedeemAllDecision;
}

const ZERO = Units.parse('0.000', 3);
const MATCHED_FRESH_MS = 24 * 60 * 60 * 1000;

function sum(values: readonly Units[]): Units {
  return values.reduce((acc, u) => acc.add(u), ZERO);
}

function nonNegative(u: Units): Units {
  return u.isNegative() ? ZERO : u;
}

function minUnits(a: Units, b: Units): Units {
  return a.compare(b) <= 0 ? a : b;
}

/**
 * Design §F.6, D-MONEY-050/051. `available = min(unlocked − reserved, FP redeemable − reserved)`:
 * reservations come off both sides, because FP may not yet reflect an exit Sanchay has reserved. That
 * can under-offer while an exit is in flight; it never over-offers.
 */
export function redemptionAvailability(input: RedemptionAvailabilityInput): RedemptionAvailability {
  const open = input.lots.filter((lot) => lot.unitsRemaining.isPositive());
  const unlocked = open.filter((lot) => isLotUnlocked(lot.lockInUntil, input.exitNavDate));
  const heldUnits = sum(open.map((lot) => lot.unitsRemaining));
  const unlockedUnits = sum(unlocked.map((lot) => lot.unitsRemaining));
  const lockedUnits = heldUnits.subtract(unlockedUnits);
  const provider = input.providerRedeemableUnits;
  const providerShort = provider !== null && provider.compare(unlockedUnits) < 0;
  const ledgerAvailable = nonNegative(unlockedUnits.subtract(input.reservedUnits));
  const availableUnits =
    provider === null
      ? ledgerAvailable
      : minUnits(ledgerAvailable, nonNegative(provider.subtract(input.reservedUnits)));
  const maxAmount =
    input.navGrade === 'OK'
      ? Money.round(
          availableUnits
            .toDecimal()
            .times(input.nav.toDecimal())
            .times(new Dec(1).minus(input.buffer)),
          Rounding.DOWN,
        )
      : null;
  const all = decideAll(input, { availableUnits, lockedUnits, providerShort, maxAmount });
  return {
    heldUnits,
    lockedUnits,
    unlockedUnits,
    reservedUnits: input.reservedUnits,
    availableUnits,
    providerShort,
    maxAmount,
    all,
  };
}

function decideAll(
  input: RedemptionAvailabilityInput,
  a: { availableUnits: Units; lockedUnits: Units; providerShort: boolean; maxAmount: Money | null },
): RedeemAllDecision {
  if (input.reservedUnits.isPositive())
    return { kind: 'REFUSED', code: 'REDEMPTION_CONFLICT_PENDING' };
  if (
    input.reconciliation === 'MISMATCH' ||
    input.reconciliation === 'FEED_UNAVAILABLE' ||
    a.providerShort
  ) {
    return { kind: 'REFUSED', code: 'FOLIO_RECONCILIATION_REQUIRED' };
  }
  if (!a.availableUnits.isPositive()) return { kind: 'REFUSED', code: 'INSUFFICIENT_REDEEMABLE' };
  const matchedFresh =
    input.reconciliation === 'MATCHED' &&
    input.lastReconciledAt !== null &&
    input.now.getTime() - input.lastReconciledAt.getTime() <= MATCHED_FRESH_MS;
  if (a.lockedUnits.isZero() && matchedFresh) return { kind: 'FULL', units: a.availableUnits };
  if (a.maxAmount === null) return { kind: 'REFUSED', code: 'NAV_UNAVAILABLE' };
  if (!a.maxAmount.isPositive()) return { kind: 'REFUSED', code: 'INSUFFICIENT_REDEEMABLE' };
  return { kind: 'AMOUNT_WITH_RESIDUAL', amount: a.maxAmount };
}

/**
 * Units an AMOUNT redemption reserves: ceil3(amount ÷ NAV × (1 + buffer)). For any amount that passes
 * `checkRedemptionAmount` this never exceeds the available units: the unrounded value is at most
 * available × (1 − buffer²), strictly below a 3 dp number, so rounding up to 3 dp cannot pass it.
 */
export function reservationUnits(amount: Money, nav: Nav, buffer: string): Units {
  return Units.round(
    amount.toDecimal().div(nav.toDecimal()).times(new Dec(1).plus(buffer)),
    3,
    Rounding.UP,
  );
}

/** AMOUNT-mode check at draft and confirm: NAV grade OK (R-12) and amount ≤ the buffered maximum. */
export function checkRedemptionAmount(
  amount: Money,
  availability: RedemptionAvailability,
): RedemptionRefusal | null {
  if (availability.maxAmount === null) return 'NAV_UNAVAILABLE';
  if (!amount.isPositive() || amount.gt(availability.maxAmount)) return 'INSUFFICIENT_REDEEMABLE';
  return null;
}
```

`packages/domain/src/rules/index.ts` (append):
```ts
export * from './redemption-availability.js';
export * from './redemption-buffer.js';
```

- [ ] **Step 4 (part 1): Run tests to confirm they pass**

```
pnpm --filter=@sanchay/domain typecheck
pnpm --filter=@sanchay/domain test
```
Expected: `redemption-availability` 41/41; the two new rule files at 100% statements/lines/functions and ≥ 97% branches.

**How part 1 was verified (2026-10-01):** the code above ran in a scratch worktree of `main` with F4's `business-days.ts` and `elss-lock.ts` taken verbatim from this plan and a one-interface stand-in for E22's `CutoffHolidays`: 41/41 tests, typecheck and Biome clean. Every vector was also checked by hand (for example RB-03 = 3 × 1.2% × √2 = 0.050912 → 0.0510; RA-02's 99.382 units at NAV −3% fit the 99.871-unit reservation; RA-V1's v1 figures 78.02197802 units / 3550.0000 come from RED-02/RED-04 by hand).

Step 5 (commit) comes with part 2.
