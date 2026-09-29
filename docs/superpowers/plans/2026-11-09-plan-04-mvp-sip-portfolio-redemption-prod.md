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

**How this file is assembled.** Tasks are written against Plans 02 and 03 **as written** and appended as they are expanded; each one's Interfaces section names every earlier symbol it uses. This revision expands **F4**. F1–F3 and F5–F28 are still the outline's §3 text. If a local draft of F1–F3 exists, merge it above F4 and keep this file's Global Constraints, extending them rather than replacing them.

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
- **Commit trailer:** `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (AGENTS.md).

## Migration numbers

Plan 03 ends at `0025_payment_attempts`. The number is assigned at merge in DAG order; F4's two files follow F2's `plans_mandates` migrations:

| Migration | Task | Kind |
|---|---|---|
| `<n>_ledger` | F4 | generated |
| `<n+1>_ledger_guards` | F4 | custom |

If the order changes, regenerate after rebasing; never hand-renumber.

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

## Known gaps (confirm in the FP sandbox, D4 `tools/fp-probes`, before the pilot)

- **Holdings report shape.** `toFolioHoldingsSnapshot` reads `{data: {folios: [{folio_number, schemes: [{isin, holdings: {as_on, units, redeemable_units}}]}]}}` (research fp-api §7 names the per-scheme fields, not the envelope).
- **Folio object fields.** `email_addresses[]` and `mobile_numbers[]` are in research fp-api §7; `payout_details[].bank_account{number, ifsc, name}` is not. `toFpFolioView` is the only place that reads them.
- **Holdings for ONDC folios.** Research fp-api §7 marks it UNCONFIRMED whether FP populates holdings for cybrillapoa/ONDC folios. If it does not, every folio syncs as FEED_UNAVAILABLE and F5 refuses ALL. That fails safe, but it is a PO-2 escalation, not a silent limit.
- **`allotted_nav_date`** must be a plain `YYYY-MM-DD`; anything else makes the allotment INVALID (UNITS_PENDING plus a CRITICAL break).

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
- **Modify (FakeFp, D4):** `apps/api/src/integrations/fp/fake/fake-fp.state.ts`, `apps/api/src/integrations/fp/fake/fake-fp.ts`
- **Modify (kernel):** `apps/api/src/modules/platform/runtime-config.ts` (D1; `ReconBreaks.open` erratum), `apps/api/src/modules/platform/jobs/job-registry.ts` (append `'folio.sync'`, `'orders.units.reconcile'`), `apps/api/src/modules/platform/jobs/schedules.ts` (two schedules), `apps/api/src/modules/platform/ids.ts` (append four table names), `apps/api/src/app.module.ts` (`PortfolioModule.forRoot(env)`)

**Interfaces:**
- **Prerequisites:** Plan 03 E1, E20, E21, E22; Plan 02 D1–D6, D8. F2 is not needed: an order with `origin = 'SIP_INSTALMENT'` gets a `SIP_INSTALMENT` lot through the same path.
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

const report = {
  data: {
    folios: [
      {
        folio_number: 'OTHER',
        schemes: [
          { isin: 'INF000000009', holdings: { units: '1.000', redeemable_units: '1.000' } },
        ],
      },
      {
        folio_number: '12345/67',
        schemes: [
          {
            isin: 'INF000000001',
            holdings: { as_on: '2026-11-02', units: '12.3456', redeemable_units: '10.0009' },
          },
          {
            isin: 'INF000000002',
            holdings: { as_on: '2026-11-02', units: '5', redeemable_units: '0' },
          },
          { name: 'no isin: skipped' },
        ],
      },
    ],
  },
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

`apps/api/drizzle/<n+1>_ledger_guards.sql` (custom, after the generated `ledger`):
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
  const folio = list(record(raw.data)?.folios)
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

- [ ] **Step 4: Run tests to confirm they pass**

```
pnpm --filter=@sanchay/api db:generate --name=ledger
pnpm --filter=@sanchay/api db:generate --custom --name=ledger_guards
pnpm gen:states
pnpm --filter=@sanchay/domain typecheck
pnpm --filter=@sanchay/domain test
pnpm --filter=@sanchay/api typecheck
pnpm --filter=@sanchay/api test -- fp-holdings purchase-settlement
pnpm --filter=@sanchay/api test:int -- ledger folio-sync payments orders fp-webhooks
```
After the `--custom` command, paste the `REVOKE` from Step 3 into the empty `<n+1>_ledger_guards.sql`, then run the rest.

Expected:
- The generated `ledger` migration creates the four tables with their checks, partial indexes and foreign keys, and adds the `folios` and `orders` columns, `folios_amc_number_uq` and the two new checks. No other table changes.
- Domain tests: `fifo` 12/12, `elss-lock` 10/10, `business-days` 5/5 and the new `states` case pass. The rules keep the package's 95% coverage gate (they are fully covered).
- API unit tests: `fp-holdings` 7/7 and `purchase-settlement` 3/3.
- Integration tests: `ledger.int.test.ts` 14/14 and `folio-sync.int.test.ts` 9/9. E21's `payments.int.test.ts` stays 9/9, now with a SETTLED order and a lot. E20's `orders.int.test.ts` and E1's `fp-webhooks` stay green.
- `docs/specs/states.md` shows the new edge.

- [ ] **Step 5: Commit**

```
pnpm exec biome check --write packages/domain/src/rules packages/domain/src/states/order.ts packages/domain/test packages/test-fixtures/src/golden/fifo.json packages/test-fixtures/src/golden/elss-lock.json apps/api/src/modules/portfolio apps/api/src/modules/orders/orders.schema.ts apps/api/src/modules/payments apps/api/src/integrations/fp/fake apps/api/src/modules/platform apps/api/src/app.module.ts apps/api/test/int
pnpm --filter=@sanchay/domain test
pnpm --filter=@sanchay/api typecheck
pnpm --filter=@sanchay/api test:int -- ledger folio-sync payments
pnpm lint
git add packages/domain/src/rules packages/domain/src/states/order.ts packages/domain/test/fifo.test.ts packages/domain/test/elss-lock.test.ts packages/domain/test/business-days.test.ts packages/domain/test/states.test.ts docs/specs/states.md packages/test-fixtures/src/golden/fifo.json packages/test-fixtures/src/golden/elss-lock.json apps/api/src/modules/portfolio apps/api/src/modules/orders/orders.schema.ts apps/api/src/modules/payments/fp-events.ts apps/api/src/modules/payments/payments.module.ts apps/api/src/integrations/fp/fake/fake-fp.state.ts apps/api/src/integrations/fp/fake/fake-fp.ts apps/api/src/modules/platform/runtime-config.ts apps/api/src/modules/platform/jobs/job-registry.ts apps/api/src/modules/platform/jobs/schedules.ts apps/api/src/modules/platform/ids.ts apps/api/src/app.module.ts apps/api/drizzle apps/api/test/int/ledger-seed.ts apps/api/test/int/ledger.int.test.ts apps/api/test/int/folio-sync.int.test.ts apps/api/test/int/payments.int.test.ts
git commit -m "feat(portfolio): FIFO ledger with ELSS lock and SHORTFALL-BREAK, folio.sync holdings snapshot, orders.units.reconcile (F4)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**How this task was checked while it was written (2026-09-29).** The code above was run in a scratch prototype, not in the repo (Plans 02–03 are not implemented yet):
- **Domain rules and golden vectors:** run with Vitest 5.0.1 and `@sanchay/money` from `main`: 27/27 tests pass, with 100% statement and branch coverage of the three rule files. The FIFO and ELSS expectations were also checked by hand.
- **Schema:** the portfolio, folio and order schema went through drizzle-kit 0.31.11 twice, once without F4 and once with it. The F4 delta is the `ledger` migration described in Step 4.
- **Ledger code:** `Ledger`, `PurchaseSettlement`, the parsers, both jobs, the FakeFp additions and the D1 fix ran against a real PostgreSQL 16 through Drizzle 0.45.3.
- **Integration tests:** `ledger.int.test.ts` and `folio-sync.int.test.ts`, as written above, ran through a stand-in for `bootFpTestApp` that wires the same classes by hand over D4's FakeFp (undici `MockAgent`).
- **Not exercised:** Nest DI, D3's real transport (tokens, lossless-json) and PostgreSQL 18. Step 4 is their check.
