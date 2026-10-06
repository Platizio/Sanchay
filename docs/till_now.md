# Sanchay: progress so far

_Last updated: 2026-10-06. Repo: `C:\Users\pc\Desktop\sanchay`, GitHub `Platizio/Sanchay`. Plan 01 code is at `225d60a`; everything after it is plan documents only. The latest sessions are §10 and §11 (branch `claude/sanchay-plan-02-03-backlog-huz9ym`, not yet merged)._

_2026-09-30: the local Plan 04 work (F1–F3, not yet pushed) and the cloud F4 branch (draft PR [Platizio/Sanchay#1](https://github.com/Platizio/Sanchay/pull/1)) were merged into local `main`; see §4.5. Pushing local `main` also lands PR #1._

Sanchay is Platizio's **investor-led B2C mutual-fund app for India**, replacing the old distributor-led (B2B2C) WealthTech. Investors sign up themselves, complete onboarding, browse funds by SEBI category, invest (lumpsum and SIP), redeem, and track their own portfolio: invested amount, current value, XIRR and active SIPs.

**Phase 1** is a **closed real-money pilot on web and Android**. The build runs 2026-09-28 → 11-20, with the go/no-go on **Fri 2026-11-27**.

---

## 1. Decisions taken

| Area | Decision |
|---|---|
| Business model | Platizio stays an AMFI-registered distributor (MFD with ARN) selling **regular plans** on an execution-only basis. The platform ARN goes on every order and EUIN stays blank. There is no distributor role in the product. |
| Stack | **TypeScript everywhere.** API: NestJS 11.2.6 on Fastify, oRPC, Drizzle, PostgreSQL 18.6, pg-boss. Web: Next.js 16. Android: Expo SDK 57. One universal React Native UI renders on native and, through react-native-web, on the web. pnpm 11 + Turborepo monorepo. |
| Design | Clean, mass-market retail look (Groww/Kuvera clarity), fast on low-end Android. |
| Data | Clean start: nothing is migrated from v1. Fund facts come from AMFI plus admin curation, behind a pluggable `FundFactsProvider`. |
| Product-owner decisions | NestJS 11.2.6 · Growth option only at launch · XIRR shown once the first investment is 30+ days old (labelled while under 1 year) · at most **3 nominees** (SEBI circular of 29 May 2026) · SIPs monthly only · no scope is cut silently. |
| MVP (Phase 1) | Four groups: **sign-up + self onboarding** (investors whose KYC is already done), **fund catalogue + fund page**, **lumpsum + SIP with mandate**, **dashboard + redemption**. Platforms: web + Android. Rigor: lean, but the money-safety rules stay (next row). |
| Non-negotiables | Consent first: no Cybrilla write before the investor's SEBI 2FA consent is consumed. Exact decimal money. An idempotency key on every money mutation. OTP policy: 6 digits, 5 min, 5 attempts, 30 s cooldown, hashed at rest. Logs redacted. Golden-vector tests for money logic. |
| Brand | **Sanchay**: `@sanchay/*` packages, `app/api/www.sanchay.in` hosts, `in.sanchay.app`. "Platizio" appears only as the legal entity. |
| Delivery rulings | **R-01 … R-30** in `docs/delivery/rulings.md`. They cover the capacity model, milestones, four DLT SMS templates, guard exemptions, the tiered go/no-go gate, the SIP-cancel addition, exact trust-policy exceptions (owner-approved), local Node 24.21.0, and more. |

---

## 2. Planning and analysis (done)

All the planning was produced by multi-agent workflows: about 300 agents over 6 major workflows, including adversarial reviews.

| Deliverable | Where |
|---|---|
| v1 codebase analysis (77 agents; 1,849 distributor couplings, blocking 2FA bugs, proven logic worth porting) | `docs/analysis/v1-analysis.md`, `v1-claim-ledger.md` |
| Target architecture v2.0: three competing designs, three judges, critics | `docs/superpowers/specs/2026-09-25-sanchay-target-design.md` |
| Product specs: competitors, journeys, admin, threat model, CAS, payments, fund data, app stores, privacy (DPDP), testing | `docs/superpowers/specs/product/*.md` |
| 12 cross-spec rulings (consent-first sequence, nomination, risk profiling, money parameters, admin, …) | `docs/superpowers/specs/product/gap-rulings.md` |
| Decision registers (money, platform) | `docs/superpowers/specs/decision-register-*.md` |
| **MVP spec**: binding scope, harmonized rulings H-1..H-18, pilot gate | `docs/superpowers/specs/2026-09-25-sanchay-mvp-spec.md` (+ `mvp-final-critic.md`) |
| Research: pinned versions, Cybrilla FP API, regulation, port specs with golden vectors | `docs/research/*.md` |
| Sprint plans S1–S4 plus the pilot week; Phase-2 baseline roadmap | `docs/delivery/mvp-sprint-plans.md`, `phase2-baseline-roadmap.md` |
| Plan 01 (foundation, 50 TDD tasks) plus its interface sheet | `docs/superpowers/plans/2026-09-28-plan-01-foundation.md`, `docs/interface/plan-01-interface-sheet.md` |
| Task outlines for Plans 02–04 | `docs/superpowers/plans/2026-09-28-plans-02-04-outlines.md` |
| Business: Cybrilla production-access letter and questionnaire; pilot business-actions checklist; DLT SMS templates | `docs/business/*.md`, `docs/dlt/sms-templates.md` |
| ADRs 0001 (versions), 0002 (universal UI), 0003 (oRPC/Nest/Fastify), 0005 (hosts and routing) | `docs/adr/` |

---

## 3. Implementation: Plan 01 foundation (**complete and merged to `main`**)

All 50 tasks were implemented test-first, with a review after each batch, fix loops, and a final four-way parallel review followed by a fix wave. The work ran in two parallel lanes (API and client) and was then merged.

### What exists now

| Area | Built |
|---|---|
| **Repo tooling** | pnpm 11.27 workspace with a pinned catalog. Supply-chain gates: minimum release age, strict dependency builds, a trust policy with 3 owner-approved exact exceptions. Turborepo, Biome, lefthook + gitleaks. The `check-brand` lint. A SHA-pinned GitHub Actions CI workflow. |
| `@sanchay/money` | Decimal core; `Money` (2 dp), `Units` (3/4 dp), `Nav` (6 dp); INR lakh/crore, units, NAV and percent formatting; the PO-5 XIRR display rule; largest-remainder percentages. |
| `@sanchay/validation`, `@sanchay/domain` | Zod schemas (PAN, mobile, email, IFSC, PIN code, OTP, rupee amounts, wire formats); shared enums including the MVP pins (monthly-only SIPs, nominee ID types, OTP purposes); the legal-entity module. |
| `@sanchay/contract` | oRPC contract, a 66-code error catalogue, auth and me procedures, and OpenAPI generation (with a drift test). |
| **API (`apps/api`)** | NestJS + Fastify bootstrap:<br>• request ids, CLS, pino with PII redaction, health endpoints, env boot guards<br>• row-bound AES-GCM crypto with blind indexes<br>• Drizzle on Postgres 18 with 4 DB roles, plus the identity schema<br>• audit service; SMS/email ports with 4 DLT templates<br>• **OTP issue and verify**: peppered HMAC, persisted quotas serialized with advisory locks, lockout, a daily SMS cap<br>• investor accounts and a device registry<br>• **opaque sessions**: web cookie `__Host-sanchay_sid`, Android bearer bound to the device<br>• guards: client/CSRF, session, HostGuard, infra-route exemptions<br>• **mobile-OTP sign-up and login**, logout, sign out everywhere, add and verify email, throttling, typed-error round-trip<br>• runnable entrypoint (roles api/migrate/worker) |
| `@sanchay/api-client` | Typed error model; web cookie and Android bearer transports; idempotency key; TanStack Query utilities. |
| `@sanchay/tokens`, `@sanchay/ui` | Retail design tokens (tested for WCAG contrast); universal primitives AppText, Button, Card, Screen, TextField, OtpInput, Banner. |
| `@sanchay/app-core`, `@sanchay/features` | Copy for all 66 error codes; login schemas; query client; the `useOtpLogin` state machine; Login, Welcome, Home and Account screens; 4-tab navigation. |
| **Web (`apps/web`)** | Next.js 16: host routing (app at root routes, www at `/site`), nonce CSP proxy, the investor app on the AppShell. **Playwright end-to-end** tests for sign-up, wrong code, logout and re-login, reading OTPs from Mailpit. |
| **Android (`apps/mobile`)** | Expo Router auth stack, four tabs, secure-store session, biometric **app lock** (wall-clock and monotonic timers). Maestro sign-up and cold-start smoke flows. |

### Verification (on `main` at `225d60a`)

| Gate | Result |
|---|---|
| `pnpm install --frozen-lockfile` | ✅ |
| `pnpm lint` | ✅ 0 errors (3 known warnings) |
| `pnpm turbo run typecheck test` | ✅ 32/32 tasks |
| `pnpm --filter=@sanchay/api test:int` (Testcontainers Postgres 18) | ✅ 129/129 |
| Web e2e (`pnpm e2e:web`) | ✅ 13/13 |
| API `GET /api/v1/health` | ✅ 200 |
| Android Maestro on a device | ⏳ Not run yet: no Android SDK/emulator on this PC |

### Notable issues found and fixed along the way

- **v1's 2FA flaws are designed out.** v1 wrote to Cybrilla before consent existed, and its approval hash compared timestamps at different precisions. v2 uses a consent-first engine that recomputes the snapshot hash from the DB.
- **OTP hardening from the final review:** quota races closed with advisory locks; the superseded code is restored when an SMS send fails; failed verifies are audited after the connection is released.
- **App lock bug:** the timer missed Android deep sleep. It now checks both the wall clock and the monotonic clock.
- **Web e2e failure, root-caused:** Next.js bakes the `/api/v1` rewrite in at build time from `SANCHAY_API_ORIGIN`. The e2e run now fails fast when that is missing (`225d60a`).
- **Environment:** Node upgraded to 24.21.0 (official installer, checksum verified); Docker Desktop in use.

---

## 4. Plans 02–04: review and assembly (2026-09-29)

The drafts in `.superpowers/plans-draft/` (never edit that folder) were written in parallel, and each plan's drafts guessed at the previous plan's API. So each plan is reviewed, rewritten where needed and assembled into `docs/superpowers/plans/`.

### 4.1 Plan 02 (Sprint 2): DONE, committed
- **File:** `docs/superpowers/plans/2026-10-12-plan-02-mvp-kernel-fp-gateway-catalogue-data-dev-aws.md`.
- **Commits:** `0dfb146` (assembly), with amendments in `5cd725c`, `cd961e6` and `bcec8dc`.
- **Header:** execution order, the migration table (`0004`–`0009`) and errata **RV-02-1 … RV-02-13**.
- **Main fixes:**
  - **Migrations:** migration-number collisions resolved.
  - **Build order:** D3 now builds without D4.
  - **pg-boss 12 API:** injectable `Jobs` using `boss.send(…, {db})`, `createQueue` at start, and keyed `boss.schedule` inside `registerSchedules`.
  - **Jobs:** the NAV and FP-sync jobs are now registered, the `identity.cleanup` schedule exists, and D6's `handle(job)` shape is fixed.
  - **D10:** reads Cybrilla's real thresholds shape.
  - **FakeFp:** stamps its call log from the app clock.
  - **Invite gate (D7):** off in tests and local dev (it would have broken every sign-in test).
  - **Test fixtures (D9):** D9 is now the single creator of `packages/test-fixtures`.
  - **Types:** safe under `exactOptionalPropertyTypes`.
  - **State machine (D5):** gains the `UNDER_REVIEW → REJECTED` edge.
- **Unverified dependency pins:** `undici`, `lossless-json`, `tsx`, `@aws-sdk/client-sesv2` and CDK. Run `pnpm view <pkg> version` at task time and pin the newest version that passes the 7-day release age.

### 4.2 Plan 03 (Sprint 3): DONE, committed (`bcec8dc`)
- **File:** `docs/superpowers/plans/2026-10-26-plan-03-mvp-consent-onboarding-catalogue-lumpsum.md`.
- **Header:**
  - **Global Constraints:** the binding "Plan 02 as built" contract.
  - Execution order, migrations `0010`–`0025`, errata and known gaps.
- **Rewritten from scratch:** E11 (attest and FP provisioning saga) and E20/E21 (lumpsum orders, payments, H-2 checkout).
- **Glue corrected:**
  - **E1:** webhooks.
  - **E2:** `RuntimeConfig` is static.
  - **E3/E4:** the consent engine uses D3/D5 types and the `CONSENT_SUBJECT_JOBS` registry.
  - **E6/E7:** KYC and bank pre-verification run in worker jobs.
  - **E8–E10:** generate-then-custom migrations; string document versions.
  - **E16:** the returns job is registered.
  - **E22:** owns its quote edit to `purchase.service.ts`.
- **Conventions every later task relies on:**
  - `CONSENT_SUBJECT_JOBS[subjectType] → job`, enqueued by `approve`.
  - Worker-only providers go through `XModule.forRoot(env)`.
  - Test helpers:
    - `jobOf(name, data)` (E1).
    - `expectNoPmWritesBeforeConsumed(app, challengeId)` and `expectBola(app, key, args)` (E4).
    - `seedReadyInvestor` (E11).
    - `seedScheme` and `seedInvestableInvestor` (E20).
  - Tests spy on `Jobs.enqueue` and call `handle(jobOf(…))` directly.
- **Known gaps (listed in the header):**
  - The screen tasks E12, E13, E17, E23 and E24 were checked for API-name drift only.
  - Four Cybrilla details need confirming in the FP sandbox before the pilot.

### 4.3 Plan 03 test-harness fix: DONE (committed with this file)
E8–E10's integration tests called a nonexistent `authedRequest` and `bootTestApp(db)`. They now use:
- a new helper, `signedInInvestor(app)` (`apps/api/test/int/signed-in.ts`, created by E8), built on Plan 01's `signInWeb`;
- `bootTestApp()`;
- `app.db.db`.

Their test data also uses string document versions, matching the E10 fix. The Plan 03 header's known-gaps note is corrected: Plan 01's `test/int/factories.ts` does exist, with `insertInvestor(db)`, `insertDevice` and `insertOtp`, and E14's use of it is fine.

### 4.4 Plan 04 (Sprint 4 and pilot week): ASSEMBLED 2026-10-01 — F1–F28 (F6 and F17 skipped by T5); see §8
- **File (committed, work in progress):** `docs/superpowers/plans/2026-11-09-plan-04-mvp-sip-portfolio-redemption-prod.md`. A banner at the top says not to execute it yet. Its "Assembly notes" section records cross-task facts; that file is now the canonical copy (the scratchpad does not persist).
- **Progress (2026-09-29 afternoon):**
  - `ef7dea6`: Plan 03 E4 ConsentRouter rewritten to the `@Controller` + `@Implement` pattern, with an ownership (BOLA) check and `requireIdempotency(idem, cls)` on cancel; E20 `createPurchase`/`cancel` gain idempotency.
  - `b92f355`: Plan 02 errata **RV-02-14** — D5 PLAN gains `UNDER_REVIEW → REJECTED | CONSENT_EXPIRED`, `CONFIRMING → REJECTED`, `SUBMITTING → REJECTED`; MANDATE gains `CONSENTED → CONSENT_EXPIRED`, `SUBMITTING → REJECTED`.
  - `f843bbe`: Plan 04 file started — F1 (draft, not yet reviewed) and **F2 rewritten**. All SIP/mandate code lives in a new `apps/api/src/modules/plans/` module. F2 owns `firstInstalmentDate` (`packages/domain/src/rules/sip-dates.ts`) and `assertSipEligible` (`modules/plans/sip-eligibility.ts`), so **F2 runs before F10**. Migrations 0026 (`plans_mandates`) and 0027 (`plans_mandates_guard`).
  - `cb8102a`: **F3 rewritten** on top of F2 (eNACH rail, limit ladder `mandateLimitFor` with 1.5× truncated, `mandates.auth_url_enc` in migration 0028). F2 mandate FP calls are rail-generic. **Next free migration: 0029.**
- **F4 (ledger) — DONE in the cloud session (§7.2); these local findings were all addressed there or in the merge (§4.5):** E21's `handleMfPurchaseEvent` (`modules/payments/fp-events.ts`) moves orders to `SETTLED`/`UNITS_PENDING` with no ledger hook, and F2's `plans.instalments.sync` mirrors instalment orders the same way. F4 must wire `LedgerService.applyAllotment` into both (the draft left it unwired). E20's `orders` lacks `stamp_duty`, `redeemed_units`, `redeemed_amount`, `units_pending_since` and `payout_expected_on`, and stores `allotted_nav` as numeric(18,6) and `allotted_nav_date` as text; F4 must add the missing columns in its own migration. Also fix: `@Inject(ReconBreaks)` → static; golden JSON imported by relative path; nonexistent test factories and `t.jobs.runOnce`/`t.fixtures`/`t.mail`; `FpRead.folio/holdings` do not exist yet.
- **Original survey (still valid for F5 onward):**
- All 28 drafts (F1–F28) are present in `.superpowers/plans-draft/plan-04/`. They have the same drift Plan 03 had. Rewrite them against Plan 02 and Plan 03 as built; the Global Constraints section at the top of the Plan 03 file is the contract.
- **F2 (SIP and mandate):**
  - **FP calls:** it uses an invented `FpTransact.call('pg.mandates.create' | 'pg.emandate.auth' | 'mf.purchasePlans.create', …)`. Use D3's operation keys `mandate.create`, `mandateAuth.create` and `purchasePlan.create`, by filling D3's `FpTransact` stubs (`createMandate`, `authoriseMandate`, `createPurchasePlan`, `updatePurchasePlan`).
  - **Reads:** `FpRead.purchasesByPlan` does not exist; use `FpRead.purchases({ plan })`.
  - **Jobs:** `mandates.submit`, `mandates.poll`, `plans.sip.submit` and `plans.instalments.sync` need class-level `@JobHandler` classes, not method-level decorators.
  - **7-day saga:** E4 decides the window by subject type.
    - With a new mandate, use `MANDATE_REGISTRATION` and map `CONSENT_SUBJECT_JOBS.MANDATE_REGISTRATION → 'mandates.submit'`.
    - With a reused mandate, use `SIP_REGISTRATION` and map `CONSENT_SUBJECT_JOBS.SIP_REGISTRATION → 'plans.sip.submit'`.
  - **Runtime config:** `@Inject(RuntimeConfig)` becomes the static `RuntimeConfig.get(exec, key)`.
- **F3 (eNACH):** done (see above).
- **F4 (ledger):**
  - `@Inject(ReconBreaks)` becomes the static `ReconBreaks.open`.
  - Schedules go inside `registerSchedules`, with `await` and a `key`.
  - `@sanchay/domain/rules/*` subpath imports must use the root `@sanchay/domain`, re-exported from `packages/domain/src/rules/index.ts`.
- **F5/F7 (redemption, reconciliation):**
  - They import a nonexistent `../platform/jobs.js`.
  - They use method-level `@JobHandler`, bare `schedule()` calls and `handle({…})` payloads (use `handle(job)` with `job.data`).
  - They use `@Inject(ReconBreaks)`.
- **F28 (SIP cancel):** uses a method-level `@JobHandler`.
- **Tests in F2–F5, F7, F10 and F28:** they import factory functions that don't exist (`createInvestorWithBankAndFolio`, `createFolioWithLot`, `createSettledPurchaseOrder`, `createInvestorWithSettledLumpsumHolding`). Build on `seedReadyInvestor`, `seedInvestableInvestor` and `seedScheme` from Plan 03.
- **Also:**
  - Absolute paths (`C:/Users/pc/Desktop/sanchay…`) become repo-relative.
  - Commit trailers use `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - Migrations continue from **`0026`**.
  - Every money task registers its own `CONSENT_SUBJECT_JOBS` entry.
  - `FakeFp` does not serve SIP, mandate or redemption operations yet, so extend it for each operation a task needs (the way E11 and E21 did).
- **Suggested order:** F2 → F3/F4 → F5/F6/F7 → F10/F11 → F28, then the lighter tasks (F1, F8/F9, F12–F27: ops, UI, evidence). Finish with the header (Global Constraints, execution order, migration table, errata) and assemble.

### 4.5 Merge of the local and cloud Plan 04 work (2026-09-30)
- Local `main` (F1–F3, the Plan 02/03 amendments `2324ce8`, `ef7dea6`, `b92f355`) and `claude/f4-continuation-3kwbcp` (F4) were merged into local `main`. Both sides had created the Plan 04 file.
- **Plan 04 file:** the cloud header and Global Constraints (extended with the F2/F3 facts), the local assembly notes, one migration table (F2 0026–0027, F3 0028, **F4 0029–0030; next free 0031**), then F1, F2, F3, F4 in order.
- **F2↔F4 fixes made during the merge (in F4's text, since F4 now runs after F2):**
  - F2's `plans.instalments.sync` copied FP states onto instalment orders, so an allotted SIP instalment reached SETTLED with **no lot**. F4 now edits it: instalments are mirrored only up to PROCESSING and every later state goes through `PurchaseSettlement.apply` (the ledger path). `PlansModule` imports `PortfolioModule`; one new instalment test in `sip-mandate.int.test.ts`.
  - F2 made `StoredPurchase.plan` required and F4 added four allotment fields: F4's `ledger-seed.ts` literal gains `plan: null`, and F2's `addInstalment` literal sets the four fields to null.
- The two Plan 03 errata from the F5 research (§7.3: the consent snapshot hash never matching on approve, and `consent.expiry.sweep` ignoring `firstAttemptAt`) are now recorded in the Plan 04 "Review notes" (F5 resume step 1 is done).
- The progress notes live only at `docs/till_now.md` (the root copy is removed).

---

## 5. Open items and next steps

| # | Item | Owner |
|---|---|---|
| 1 | The plan backlog is worked for Plans 02, 03 and 04 (§10, §11) on branch `claude/sanchay-plan-02-03-backlog-huz9ym` (no PR yet); owner decisions 1 and 2 are written in (R-36). Next: the remaining owner decisions in §11, then a PR for that branch when ready. | Owner + Claude |
| 2 | **Register `sanchay.in`**, then **send the Cybrilla production letter** (`docs/business/cybrilla-production-letter.md`). Production access is the one step with no slack before 11-27. | Owner |
| 3 | Install **Android Studio + an API 35 emulator** so the Android on-device check (C15) can run | Owner |
| 4 | ~~Create the GitHub repo~~ **Done:** `Platizio/Sanchay`. Push local `main` when ready: it contains PR [Platizio/Sanchay#1](https://github.com/Platizio/Sanchay/pull/1) (F4) plus the merge, so the PR then shows as merged. | Owner |
| 5 | Pilot business checklist: DLT/SMS vendor, SES, AWS accounts, Play Console, counsel sign-offs, risk questionnaire sign-off, curated fund list, commission rates | Owner / team |
| 6 | Velocity checkpoints: **Fri 10-09** (trims T1–T6 are pre-approved if short) and **Fri 10-23** (the owner decides on T7 web-only, T8, or moving the gate) | Owner + Claude |

**Key milestones:**
- Wed 10-21: login end to end on web + Android (already achieved on web).
- Fri 10-23: identity and profile onboarding, plus catalogue data on the paused prod stack (R-24 as amended by R-31; what prod can show by then is an open owner decision, §9).
- Fri 11-06: onboarding and lumpsum end to end, and the Cybrilla demo.
- Fri 11-13: production credentials.
- Fri 11-20: feature freeze.
- **Fri 11-27: real-money go/no-go.**

---

## 6. Where to look

- **Rules for agents:** `AGENTS.md`
- **Execution ledger (every task, review, fix and ruling):** `.superpowers/sdd/2026-09-28-plan-01-foundation/progress.md`
- **Rulings:** `docs/delivery/rulings.md`
- **Master plan (approved):** `C:\Users\pc\.claude\plans\superpowers-brainstorming-product-manag-smooth-waterfall.md`

---

## 7. Cloud session 2026-09-29: Plan 04 Task F4 done, Task F5 stopped

- **Branch:** `claude/f4-continuation-3kwbcp` on `Platizio/Sanchay`.
- **PR:** draft [Platizio/Sanchay#1](https://github.com/Platizio/Sanchay/pull/1), base `main` at `61c9945`.
- **State:** CI (`verify`, `e2e-web`) is green on `f576d71`. The PR is mergeable, has no review threads, and waits on the owner.
- **Scope:** plan text only. Nothing from Plans 02–04 is implemented in `apps/` or `packages/` yet.

### 7.1 Commits

| Commit | What |
|---|---|
| `b029f34` | Started the Plan 04 file with **Task F4** written as a full TDD task (Files → Interfaces → Steps 1–5). The file has a header, Global Constraints, migration numbers, errata and known gaps. It totals 3,274 lines. |
| `f576d71` | Moved this file from the repo root to `docs/till_now.md`. CI's `check-brand` failed on 3 lines naming the legal entity outside the R-19 allowlist, and `docs/**` is allowlisted. |
| this commit | Added this section. |

### 7.2 Task F4: Ledger, FIFO, folio sync, units reconcile (Dev A, 12 h): written and verified

What the task delivers:
- **Domain (`@sanchay/domain`):**
  - `fifoExit` (FIFO lot consumption with cost and proceeds split, half-up, capped).
  - The strict ELSS lock: `lockInMonthsFor`, `lockInUntil` (month-end clamp) and `isLotUnlocked`, where exit NAV date > lock-in date.
  - IST and business-day helpers: `istIsoDate`, `calendarDaysBetween`, `businessDaysAfter`.
  - Golden vectors **FIFO-01..08** (`fifo.json`) and **ELSS-01..06** (`elss-lock.json`).
- **Tables:**
  - New: `lots`, `lot_consumptions` (append-only), `ledger_exceptions` and `redemption_reservations` (created in F4, written by F5).
  - `folios` gains the spec §2.3 columns: registered contacts as blind indexes plus masked copies, the masked payout bank, `fp_holdings_snapshot`, `reconciliation_status` and `last_reconciled_at`.
  - `orders` gains `stamp_duty`, `units_source` and `units_pending_since`.
  - Migrations: `<n>_ledger` (generated) and `<n+1>_ledger_guards` (custom).
- **`Ledger`:**
  - `applyAllotment` writes the lot, upserts the folio, derives stamp duty and sends the `ORDER_ALLOTTED` email.
  - `applyExit` runs FIFO. A shortfall writes UNITS_SHORTFALL, marks the folio MISMATCH and opens a CRITICAL break; it is never rolled back (SHORTFALL-BREAK).
  - `reverseAllotment` reverses an untouched lot; a consumed lot raises a CRITICAL break.
- **`PurchaseSettlement`:** the single path from a re-fetched FP purchase to SETTLED, UNITS_PENDING, FAILED, EXPIRED or REVERSED. Both the `mf_purchase` webhook handler and the sweep use it.
- **Jobs (worker only):**
  - `folio.sync` (05:00 and on demand) is the only writer of the R-09 FP holdings snapshot and sets the reconciliation status.
  - `orders.units.reconcile` (every 2 h) raises a T+3 WARNING and a T+5 CRITICAL break (business days) and re-fetches PROCESSING purchases whose webhook was lost.
- **Handover:** the task ends with a **"For F5"** note on how redemption must call the ledger and read the snapshot.

**How F4 was verified.** The plan's code ran in a scratch prototype in this cloud container, not in the repo:
- **Domain:** 27/27 tests, with 100% statement and branch coverage of the new rules.
- **Schema:** drizzle-kit generated the migration delta.
- **Ledger and jobs:** ledger, settlement, jobs, the FakeFp additions and both integration-test files ran on PostgreSQL 16 with Drizzle 0.45.3, through a hand-wired `bootFpTestApp` stand-in: 60/60 tests.
- **Round-trip:** every code block in the plan was diffed back against the verified sources.
- **Not exercised:** Nest DI, D3's real transport and PostgreSQL 18. The task's Step 4 covers those.
- **The prototype is not saved.** It lived in the session's temporary scratch space. The plan file carries all of the verified code.

**Plan 02/03 errata found while writing F4.** All are recorded in the Plan 04 section "Review notes".

Fixed inside F4, each with a regression test:
- **D1 `ReconBreaks.open`** caught `23505` inside the caller's transaction. PostgreSQL then turns the `COMMIT` into a silent `ROLLBACK`. F4 switches to `ON CONFLICT DO NOTHING`.
- **D5** lacked `UNITS_PENDING → REVERSED`; F4 adds it.
- **E21's `mf_purchase` handler** settled orders with no ledger writes.
- **Drizzle `bytea().array()`** cannot write Buffers (`22P02`); F4 uses a `customType` instead.

Observed only, not changed:
- **D6 `Notify.enqueue`** has the same catch-23505 pattern.
- **E21's** `toThrow(/payment_attempts_live_uq/)` cannot match under Drizzle 0.45; it needs `pgConstraintOf`.
- **E20's `orders.allotted_units`** is `numeric(20,4)`, but the spec says `(20,3)`.

**Known gaps to confirm in the FP sandbox before the pilot:**
- The holdings-report envelope shape.
- The folio `payout_details[].bank_account` fields.
- Whether FP fills holdings for ONDC folios (UNCONFIRMED; if not, ALL redemptions are refused, which is a PO-2 escalation).
- That `allotted_nav_date` is a plain `YYYY-MM-DD`.

### 7.3 Task F5: Redemption backend, AMOUNT and ALL (Dev A, 16 h): STOPPED

**Status:**
- Research into Plans 01–03 is nearly done.
- **No code, prototype or plan text has been written.**
- The Plan 04 file still carries only the outline text for F5 (outline §3 "F5").
- Work stopped on the owner's instruction on 2026-09-29.

**Drafted design.** None of this has been verified yet; it is a starting point, not a decision.
- **Domain rules (new, in `@sanchay/domain`):**
  - `redemption-buffer.ts`: a σ table per category (design §F.6, D-MONEY-050..054; outline §0 item 7 says to verify σ and n and pin them by a golden vector before any code).
    - Buffer = `min(0.10, max(0.02, 3σ√n))`, rounded up to 4 dp.
    - `n = max(1, businessDaysAfter(latestNavDate, exitNavDate))`.
  - `redemption-availability.ts`: `expectedRedemptionNavDate`.
    - STANDARD cut-off is 15:00. LIQUID is 15:00 and OVERNIGHT 19:00, and for both the NAV date is the day before the next business day after T. This needs `nextBusinessDay`/`isBusinessDay` added to `business-days.ts`.
  - Availability is computed as held → locked/unlocked → minus ACTIVE reservations → available. It is then capped at min(ledger, FP snapshot); a mismatch opens a recon break.
  - `maxRedeemableAmount = floor2(effective × NAV × (1 − buffer))`. It is offered only when the NAV grade is OK (an AGED NAV blocks AMOUNT, per R-12).
  - `reservationUnits = ceil3(amount / NAV × (1 + buffer))`.
  - The ALL decision has three outcomes: FULL, AMOUNT_WITH_RESIDUAL, or refused. It is refused with `REDEMPTION_CONFLICT_PENDING` or `FOLIO_RECONCILIATION_REQUIRED`. ALL needs `reconciliation_status = 'MATCHED'` within 24 h.
  - Golden file `packages/test-fixtures/src/golden/redemption-availability.json` with **RA-01..RA-12** plus a v1 reference vector. The vectors cover NAV −3%, 0 and +3%; a reservation blocking a concurrent draft; and the ELSS strict lock on 29 Feb, at month-end and across a holiday.
- **API (oRPC):**
  - `quoteRedemption`: `POST /orders/redemptions/quote {folioId, isin}`. It reads the R-09 snapshot. If the snapshot is older than 24 h, it returns REFRESHING and enqueues `folio.sync {folioId}` with `singletonKey: folioId`.
  - `createRedemption`: `POST /orders/redemptions` with an idempotency key; body `{folioId, isin, mode: AMOUNT|ALL, amount?}`. Order of checks:
    1. Folio ownership (404 on BOLA).
    2. `canExit` (`EXIT_BLOCKED`).
    3. `orders.enabled`.
    4. Folio-registered contacts.
    5. `pg_advisory_xact_lock(hashtextextended('folio:scheme', 0))`.
    6. Write the ACTIVE reservation.
    7. Create the REDEMPTION consent challenge (`TPL_REDEMPTION`; SMS + EMAIL factors). AMOUNT uses the CONSENT SMS template with action `redeem`; ALL/FULL uses CONSENT_UNITS with units `all`.
- **Consent:**
  - A deterministic `SNAPSHOT_BUILDERS.REDEMPTION` built from DB rows plus the resolver's destinations. Its own builder avoids the E3/E4 erratum below.
  - `CONSENT_SUBJECT_JOBS.REDEMPTION = 'orders.redemption.submit'`.
- **Jobs and settlement:**
  - The submit job re-checks FP holdings live inside `useConsumed` after SUBMITTING (R-09).
    - A failed check moves the order to REJECTED (`live_check_failed`), calls a new `ConsentEngine.markUnused`, and RELEASES the reservation.
    - An ambiguous FP result moves it to RECONCILING, and the reservation stays ACTIVE.
  - The advance job sends one PATCH `{id, state: 'confirmed', consent}` and moves the order to PROCESSING.
  - Settlement runs in one transaction. The order goes to SETTLED, `Ledger.applyExit` is called with FP's redeemed units, proceeds, NAV and NAV date, and the reservation is SETTLED. The payout becomes EXPECTED with `payoutExpectedOn` (T+1 for debt, T+2 for others). The REDEMPTION_PROCESSED email is sent and an audit row written (R-20).
  - `payout.watch` (10:00):
    - A `bank_credit_reference` marks the payout CREDITED.
    - Past T+3 it marks the payout DELAYED, sends the PAYOUT_DELAYED email, and opens a WARNING break and an audit row.
  - There is an `mf_redemption` event handler, and F4's units-reconcile sweep is extended to redemptions.
- **Supporting changes:**
  - FakeFp redemption routes and the `FpTransact` redemption bodies.
  - New `orders` columns: `redeemed_units`, `redeemed_amount`, `redeemed_nav`, `redeemed_nav_date`, `payout_expected_on`, `payout_ref` and `payout_updated_at`.

**New Plan 03 errata found while researching F5.** They were found by reading the plan; neither has been run, and neither is recorded in the Plan 04 file yet.
1. **The consent snapshot hash can never match on approve (E3/E4).**
   - E4's `ConsentEngine.create` builds the snapshot with `destinationsMasked: destinations.map(d => d.masked)` and the caller's full `fields`.
   - `approve` rebuilds it with `destinationsMasked: []` and only the four render fields (action, amount, units, schemeShort). See Plan 03 around line 3842.
   - Both the E3 generic builder (used by PURCHASE, E20) and E11's `ONBOARDING_ATTEST` builder hash `ctx.destinationsMasked`. `create` refuses zero destinations, so the recomputed hash always differs, and approvals would fail with `CONSENT_MISMATCH`.
   - Likely fix: persist the masked destinations and the hashed fields on the challenge, and rebuild from those.
2. **E4's `consent.expiry.sweep` ignores `firstAttemptAt`.**
   - It marks every CONSUMED challenge past `execute_before` as CONSUMED_UNUSED, even one whose first FP write already happened. For that challenge, `useConsumed`'s deadline is `saga_expires_at`, not `execute_before`.
   - There is also no `markUnused` API, which F5's live-check rejection needs.

**To resume F5:**
1. ~~Record the two errata above in the Plan 04 "Review notes".~~ Done in the 2026-09-30 merge.
2. ~~Verify σ and n against design §F.6 and D-MONEY-050..054, then write and pin RA-01..RA-12 and the v1 vector.~~ Done 2026-10-01: σ/n confirmed; vectors RN-01..11, RB-01..11, RA-01..15 and RA-V1 pinned.
3. ~~Prototype the domain rules with ≥95% coverage.~~ Done 2026-10-01: 41/41 tests, 100% statements, 97.6% branches. Written into Plan 04 as **Task F5 part 1 (domain rules)**, with the pinned decisions (cut-offs, min(ledger, FP) with reservations on both sides, the ALL order, no reservation cap).
   **Resume here (part 2):** step 4, then step 5 appends part 2 under the part-1 heading and adds the Step 5 commit.
4. ~~Prototype the API side on Postgres: the quote, create, submit, advance and settlement paths, `payout.watch`, the event handler and the FakeFp routes. Include the G-E1 consent-first test (`expectNoPmWritesBeforeConsumed`) and the R-20 audit assertions.~~ Done inside F5 part 2's own prototype runs.
5. ~~Append Task F5 to the Plan 04 file in the same shape as F4.~~ Done 2026-10-01: F5 part 2 was written by a workflow agent, reviewed twice and assembled (§8).
6. ~~Commit and push to the PR.~~ Committed on `docs/plan-04-f5` (§8).

---

## 8. Session 2026-10-01: probes, PRs, Plan 02/03 errata, Plan 04 assembled

- **PRs:** [Platizio/Sanchay#2](https://github.com/Platizio/Sanchay/pull/2) is merged (Plan 04 F1–F4, plus the fastify 5.12.5 security fix for CI's audit). [Platizio/Sanchay#3](https://github.com/Platizio/Sanchay/pull/3) is open (`docs/s1-probes-runbook`): the sandbox credentials check, probe templates and run-1 evidence, the OTP runbook stub, the velocity sheet, Plan 02 RV-02-15 and the Plan 04 F4 holdings fix.
- **Credentials:** they live in the git-ignored `apps/api/.env` under v1 names; `node scripts/sandbox-check.mjs` checks them without printing secrets. The FP and POA tokens work, and Mailtrap is **live** sending. There is no AWS and no MSG91 yet.
- **Probe run 1** (`docs/probes/`):
  - P-04 **FAIL**: FP auto-fills a tenant-default EUIN.
  - P-05 **INCONCLUSIVE**: no ARN in any FP object.
  - P-07 **PENDING**: ONDC purchases stay `submitted`, and the simulator refuses ONDC orders.
  - P-09: units redemption **FAILS** (T5 forced); amount and ALL redemptions work. First-instalment-now, pause and UPI Autopay work; quarterly is rejected.
  - Lumpsum: the H-2 order works through `submitted`.
- **Plans 02 and 03 amended** on `docs/plan-04-f5`: Plan 02 RV-02-15 to RV-02-36 and Plan 03 RV-03-1 to RV-03-19. They cover:
  - consent (approve echo, `markUnused`, the sweep, and the resolver decrypt);
  - E22's port adapters;
  - the scheme id and the Invest link;
  - CNF-01 for the lumpsum;
  - smoke-test gating;
  - E25 CDK;
  - the schema-registration cycle;
  - the `@sanchay/money` and `@sanchay/validation` dependencies;
  - pinned Plan 01 tests relaxed once;
  - RuntimeConfig jsonb.
- **Plan 04 assembled** (F1–F28, about 47.6k lines): execution order, owner decisions, migrations 0031–0035, and the assembly errata (module identity via `NEST_APP_OPTIONS`, the F2 import cycle, the mobile normalisation, the plan clock, the holdings envelope). Every Step 5 block follows AGENTS.md's order. It is verified structurally (28 tasks in order, balanced fences, no stray placeholders, command rules, commit trailers). It has **not** been executed: Plans 02–04 have not run in the repo.
- **Backlog:** `docs/delivery/plan-errata-backlog.md` lists the 172 reported but unapplied items, verbatim with their sources. Work the Plan 02 list before Sprint 2 (Mon 10-12).
- **Next:**
  - Settle the owner decisions in Plan 04's header (G-E4 smoke, EUIN, T3, AWS/MSG91, SNS SMS, stuck breaks, desktop MND-03, OIDC repo casing, sandbox runs before GO-2).
  - Send Cybrilla the probe questions.
  - Push `docs/plan-04-f5` and open its PR once PR #3 merges (it is stacked on it).

---

## 9. Session 2026-10-05: Plan 02 backlog worked, Task D0, P-07 addendum

- **P-07 addendum** (`docs/probes/P-07-allotted-units.md`): the three ONDC purchases paid through the simulator all **failed at 23:00 IST on 10-01** with `fp_payment_url_unused`. A simulated payment does not count as using the payment URL. P-09's mandate-funded first SIP instalment is still `submitted`. P-07 stays PENDING; the next attempt must pay through the payment URL itself.
- **Plan 02 backlog worked:**
  - Five parallel agents checked every open item against the code and the libraries, prototyping on PostgreSQL 18 in scratch; nothing in the repo was edited by them. Their 181 patch edits applied cleanly.
  - Plan 02 errata RV-02-37 to RV-02-65, with consumer follow-ons RV-03-20 to RV-03-23 and RV-04-F1-1, F2-4, F7-1, F12-1, F19-1 and F19-2. The main fixes:
    - D1: idempotency releases the key of every refusal and replays only a returned result.
    - D2: the drizzle-kit schema glob (a blocker), readiness and the injected clock; pg-boss needs no CREATE grant (verified as a `sanchay_app` member).
    - D3, D4 and D9: biome-clean guards. D5's `gen:states` runs. D6's tests type-check.
    - D9: NAV age in IST calendar days. D10: `sipAllowed` and `sip_dates` (D-MONEY-026).
    - E25: `data/` in the image, the migrate step and the rollout check, document-bucket versioning and the apex 301.
- **Task D0 (RV-02-66)**, new, runs first in Sprint 2. It fixes three Plan 01 defects on `main`, each reproduced and fixed test-first in a scratch worktree (api unit 133/133, api integration 130/130, features 23/23, `pnpm lint` clean):
  - EF8-5: another investor could lock an email OTP.
  - Bound query parameters in logs.
  - AppShell hydration mismatch.
- **RV-02-67 and RV-02-68:** D1's `ReconBreaks.open` and D6's `Notify.enqueue` use `ON CONFLICT DO NOTHING`. A caught `23505` inside a caller's transaction made its COMMIT a silent ROLLBACK. Verified on PostgreSQL 18 (the old class fails with "current transaction is aborted"). F4 no longer edits `runtime-config.ts` (RV-04-F4-3).
- **Backlog** (`docs/delivery/plan-errata-backlog.md`): 39 items ticked with their RV id or reason. Open items: Plan 01 1 (the deployed curated-list run, tracked under Plan 04), Plan 02 4, Plan 03 59, Plan 04 79.
- **Owner rulings needed before Sprint 2** (settled later the same day as R-31 to R-34; see below):
  1. pg-boss queue policies. `singletonKey` does not dedupe on the default `standard` policy, which Plans 03 and 04 rely on, and a policy cannot change after `createQueue`.
  2. RV-02-64: keep one log group and the per-image ECR names, or follow spec §2.4.
  3. PB-41's delegated `dev.sanchay.in` zone versus E25's lookup (ADR-0014).
  4. Whether deployed NAV history needs `ops:nav-backfill`.
- **Pre-pilot gap found:** no task loads the curated list (G-B10) on a deployed stack. The Plan 04 backlog item gives the fix (F7's one form running `dist/cli/ops-catalogue-seed.js --pilot-list`).
- **Environment:**
  - The main checkout's `node_modules/serialize-error` was a stub an agent left on 10-01 (`0.0.0-f1stub`). It was restored to the lockfile's 2.1.0.
  - Docker Desktop was started for the integration tests.
- **Later on 10-05: owner rulings, PR and CI.**
  - **Git:** pushes now go as **vinayakty230** only (owner's instruction for the session; the GitHub CLI and git's stored credential were switched by the owner).
  - **PR:** [Platizio/Sanchay#4](https://github.com/Platizio/Sanchay/pull/4) carries this branch. It includes PR #3's commits.
  - **Prototype archives:** the five uncommitted agent prototypes (Plan 04 F12–F27, about 11,300 lines) are pushed as `archive/proto-*-2026-10-01`. They are reference only and must never be merged. The other 24 leftover folders in `.claude/worktrees` held nothing unique.
  - **CI audit:** two new high advisories with no fixed version (node-forge via Expo's CLI, braces via Metro) failed `pnpm audit`. They are now exact `auditConfig.ignoreGhsas` entries with an ADR-0001 row; re-check 2026-11-02.
- **Rulings** (`docs/delivery/rulings.md`):
  - **R-31:** no AWS dev; E25 deploys prod paused in S2 week 2, and F1 hardens it.
  - **R-32:** pg-boss queue policies.
  - **R-33:** NAV history and the curated list are loaded on prod before GO-1.
  - **R-34:** one log group and two image repositories (LLM-council verdict, accepted), with `RETAIN_ON_UPDATE_OR_DELETE`, a `service` field, metric-filter proofs, PAN/mobile masking and a ten-alarm drill.
- **Written into the plans:** seven agents, about 830 verified patch edits.
  - Plan 02 RV-02-69 to RV-02-75 and Plan 03 RV-03-24 to RV-03-27.
  - Plan 04 RV-04-HDR-1, F1-2 to F1-11, F2-5, F4-4, F5-1, F7-2 to F7-4, F18-1, F19-3, F20-1, F21-1, F22-1, F23-1, F24-2, F25-1, F27-1 and F28-1.
  - The MVP spec, sprint plans, outlines, pilot checklist and rulings R-05, R-15 and R-24 now follow R-31 to R-34.
- **Fixes made along the way:**
  - D9 now backfills NAV history month by month and keeps `nav_history` current. It also handles two live AMFI feed quirks (RV-02-73, RV-02-74).
  - An adopted purchase now reaches the checkout (RV-03-27, RV-04-F7-4).
  - **D0's log redaction now works through pino-http**, the app's real logger; the first version only worked with plain pino (RV-02-75). Verified on a clean checkout of `main`: api unit 134, api integration 130, features 23, typechecks and lint clean.
- **Open, for the owner:**
  1. A public host for FP sandbox webhooks and payment returns before the 11-06 demo (R-05's purpose; no dev stack now).
  2. The 10-23 milestone content: prod has no reference tables until F1 and no FP production credentials until 11-16.
  3. Spec §7 / F23's NO-GO fallback ("continue invitee onboarding") conflicts with R-31.
  4. Confirm the founders' canary windows (F20, F27) as allowed under R-31.
  5. S4 capacity after R-33/R-34.
  6. PB-76: an active vendor test on paused prod.
  7. R-34's "every log line" for Next.js and CLI output.
  8. Lead: `ops:nav-release` semantics.
- **Next:**
  - The owner rulings above and in Plan 04's header.
  - Push `docs/plan-04-f5` and open its PR once PR #3 merges (stacked on it).
  - The Fri 10-09 velocity checkpoint.
  - Sprint 2 from Mon 10-12, Task D0 first.

## 10. Session 2026-10-06: Plan 02/03 backlog round redone (cloud, inline)

- **Where:** a cloud session on the Pro plan, working inline with no agents. The environment only pushes its own session branch, so the work is on **`claude/sanchay-plan-02-03-backlog-huz9ym`** (from `main` at `756ffac`), not `docs/plan-02-03-backlog`. One commit per group, each pushed; no PR (the owner's instruction). Tooling: Node 24.21.0, pnpm 11.27.0, gitleaks 8.30.1 (checksum-verified). Docker's daemon was started in the container, so the PostgreSQL checks below ran on the repo's `postgres:18.6-trixie` image.
- **Ruling:** R-35 added to `docs/delivery/rulings.md` after R-34 (its own commit).
- **G1, Plan 02:**
  - **R-35 in D9 (RV-02-76).** `ops:nav-release` goes through a new `releaseNav`, which refuses an ISIN that is not quarantined and writes `NAV_RELEASE` with the flag in one transaction. `runNavSync` reads the pending releases from `audit_events` once per run and takes a released ISIN's next feed value without the 25% check. That value goes to `scheme_navs` and `nav_history`, and `NAV_RELEASE_APPLIED` is audited, so the next sync checks from the new NAV. D8's schema is unchanged. Two new integration cases (D9 now has 8). Proven test-first on PostgreSQL 18.6: the release case failed against the old sync, then 8/8 passed; `tsc` and `biome ci` clean. Plan 04 F7, which rewrites the CLI, keeps the row the sync reads (RV-04-F7-5).
  - **E25 retention (RV-02-77).** The document bucket and the NAT `CfnEIP` use `RETAIN_ON_UPDATE_OR_DELETE`, each with an assertion (26 infra tests). Proven with aws-cdk-lib 2.216.0 and vitest 5.0.1 in a scratch folder: both assertions failed first, then 24 of 26 passed (the other two read `apps/api` files that the scratch folder does not have). Plan 04 F1's totals follow (RV-04-F1-12).
  - **D5 (RV-02-78, found in G5).** The ORDER machine could not end an unpaid order; FP failing it (`fp_payment_url_unused`) now moves AWAITING_PAYMENT or PAYMENT_PENDING to FAILED or EXPIRED. Proven test-first on the real `@sanchay/domain` (15/15).
  - Plan 02 backlog: 0 open.
- **Plan 03 (RV-03-28 to RV-03-50):**
  - **G2, E1–E4:** contract index edits key-level (E2, E4, E5, E6). `LegalDocs.current` finds the PUBLISHED version in force (`DESC NULLS LAST`). E3's seed path, typecheck and script are fixed. E4's tests are guarded and only `cancel` takes an Idempotency-Key. E3's commands are fixed.
  - **G3, E5–E11:** the reference-data seed runs (columns, dotenv, `dist`). BOLA checks run inside `it()`. One top-level `riskProfile` key. E10 gains its `legal` key and calls E3's `LegalDocs` as E3 defines it (it would not have compiled). E11 gets a `provisioning-failed.md` runbook stub. Commands are fixed.
  - **G4, E14–E17, E22:** E14's router uses `DbHandle`, with a NULL-safe commission line and `ListSchemesInput`. E15's completeness stays within 100. E17's own tests and its percent format are fixed. Commands are fixed. Plan 04 F19 keeps these (RV-04-F19-4).
  - **G5, E20–E21:** FP failing an unpaid purchase ends it FAILED with "Payment not completed" copy and no refund (RV-03-43). A refused payment nudge now waits at most 2 minutes (RV-03-44). Commands are fixed.
  - **G6, E12, E13, E23, E24:** SYS-01 compiles and has a route. The mobile routes require sign-in (RV-04-F12-2). E13 stubs `/legal/pending` in D0's hydration test and Plan 01's HomeScreen test. The onboarding smoke is gated and reads codes from Mailpit. E12 has no `!` assertions.
  - Sweeps across Plan 03 find no `--` test filters, chained scripts, `git diff` OpenAPI checks, non-null assertions or caught `23505`. Every Plan 03 backlog item has a verdict; 8 stay open for owner decisions.
- **Plan 04 lines changed (consumers only):** RV-04-F7-5, RV-04-F1-12, RV-04-F1-13, RV-04-F19-4, RV-04-F12-2. Plan 04's own backlog (80 open) was not worked.
- **Not run (prototype only where the brief asked):**
  - Plan 03's other logic changes were checked by grep and by reading the code, not run: E3's `current()` query (its drizzle shape type-checks on `main`), E14's commission ordering, E21's unpaid-failure handler and its new case, E21's poll schedule, E24's SYS-01 wiring and layout, E13's stubs, the gated smokes, E8–E10's test fixes and E9's contract key.
  - E17's and E15's fixes mirror what F19 ran in its assembly pass.
  - F7's new `pendingNavReleases` assertion was not run.
- **Needs the owner (proposals are in the backlog):**
  1. The consent-first test helper is vacuous when the FakeClock does not move (E4, E11, F2, F5).
  2. Whether to auto-publish the risk questionnaire at deploy time (2 items).
  3. PAY-01's data source (`payments.forOrder`); it is needed for GO-1 (2 items).
  4. The `legal.pending` shape and its two sources (E10 against E13).
  5. G-E4's definition for chains the sandbox cannot settle (2 items).
  6. Ask Cybrilla to confirm in writing that no money is taken on an `fp_payment_url_unused` order, and decide on a backstop if its webhook is missed.
  7. E24's local Maestro flow still types fixed codes.
- **Resume here:** the Plan 04 backlog (`docs/delivery/plan-errata-backlog.md`, "## Plan 04", 80 open), then the owner decisions above. Sprint 2 starts Mon 10-12 on `feat/plan-02-mvp-kernel` with Task D0. This branch needs a PR to `main` when the owner wants it merged.

## 11. Session 2026-10-06 (continued): owner decisions 1 and 2, Plan 04 backlog worked

- **Branch:** still `claude/sanchay-plan-02-03-backlog-huz9ym`. One commit per group, each pushed; no PR.
- **Owner decisions (accepted 2026-10-06):**
  1. **Consent-first test helper (RV-03-51, RV-04-F2-6, RV-04-F5-2).** The helper fails when a consumed challenge's window is empty and a P/M call sits on its edge. The approve helpers in E11, F2 and F5 move the FakeClock 1 ms after approve. Their create helpers also move it 1 ms before the create: a file shares one FakeFp log and one clock, so without that step the previous test's writes would land inside the next window. That step was added to the accepted proposal.
  2. **Risk questionnaire (R-36, RV-03-52, RV-04-F1-14).** The JSON carries `approvedBy: null` until compliance names themself in a docs-only commit. The seed loads it as DRAFT until then, publishes the DRAFT row on the next run, and never changes a PUBLISHED one. F1's `seedReferenceData` runs it on every deploy.
- **Plan 04 backlog, four groups (80 items):**
  - **H1, F1 and infra:**
    - E25's ECS Exec had `cloudWatchEncryptionEnabled: true` with no KMS key, so every session would be refused (RV-02-79). Proven test-first with aws-cdk-lib 2.216.0.
    - F1 now says where the G-E5 results go (RV-04-F1-15).
  - **H2, F2–F6, F10, F11:**
    - A CONFIRMING redemption whose window closed no longer fails on every retry (RV-04-F5-3).
    - F6 builds before its api checks (RV-04-F6-1).
    - Step 5's prose now matches its commands (RV-04-HDR-2).
  - **H3, F7 and F20–F27:**
    - The units and payout jobs close their own SLA breaks, so the money-invariant alarm clears without a two-founder resolve (RV-04-F4-5, RV-04-F5-4).
    - The backstop restarts stalled purchases (RV-04-F7-6).
    - E20 rejects a purchase FP expires before it is confirmed (RV-03-53).
  - **H4, F8–F19 and F28:**
    - A paused withdrawal now has its own copy (RV-04-F16-1).
    - F19's seed check sits before F1's reference step (RV-04-F19-5).
    - The header's Step 5 build rule is written down (RV-04-HDR-3).
    - F2's last `!` assertion is gone (RV-04-F2-7).
  - Most of the other items were already fixed by the 10-01 and 10-05 rounds; each was checked against the current text.
  - Sweeps across Plan 04: no `--` test filters, `git diff` OpenAPI commands, chained scripts, non-null assertions, swallowed `23505`, enqueue spies without a job id, or missing build lines left.
- **Not run:** RV-03-51/52/53, the F4/F5/F7 job changes, F16's copy and the F2/F5 helper edits were checked by reading the code. Only RV-02-79 ran (aws-cdk-lib 2.216.0).
- **Still open, for the owner (proposals in the backlog):**
  - **Plan 03:** the `legal.pending` shape; G-E4 for chains the sandbox cannot settle (2 items); PAY-01's data source (2 items).
  - **Plan 04:**
    - Whether a full ("ALL") redemption works on ONDC (a probe before GO-1).
    - Android back-navigation after a redemption (`dismissTo`, check on F25's device build).
    - A read-only refunds view.
    - The three missing ops commands.
    - INV-01 on a cold open.
    - R-34's "every log line" wording.
  - **From §10:** Cybrilla's written confirmation on `fp_payment_url_unused`, a backstop for a missed `mf_purchase` webhook, and E24's Maestro flow.
- **Resume here:** the open owner decisions above, then a PR for this branch when the owner wants it merged. Sprint 2 starts Mon 10-12 on `feat/plan-02-mvp-kernel`, Task D0 first.
