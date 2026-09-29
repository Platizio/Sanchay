# Sanchay: progress so far

_Last updated: 2026-09-29. Repo: `C:\Users\pc\Desktop\sanchay`, branch `main` at `225d60a` (70 commits)._

_GitHub: `Platizio/Sanchay`, `main` at `61c9945`. The newest work (Plan 04 Task F4, and Task F5 stopped mid-research) is in **§7** and draft PR [Platizio/Sanchay#1](https://github.com/Platizio/Sanchay/pull/1)._

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

## 4. In progress

- **Plans 02 and 03 are assembled** on GitHub `main` (2026-09-29):
  - `docs/superpowers/plans/2026-10-12-plan-02-mvp-kernel-fp-gateway-catalogue-data-dev-aws.md` (S2: platform kernel, Cybrilla gateway plus a local fake, catalogue data, dev AWS)
  - `docs/superpowers/plans/2026-10-26-plan-03-mvp-consent-onboarding-catalogue-lumpsum.md` (S3: consent engine, onboarding, catalogue UI, lumpsum)
- **Plan 04 is being expanded one task at a time** in `docs/superpowers/plans/2026-11-09-plan-04-mvp-sip-portfolio-redemption-prod.md` (S4: SIP and mandates, ledger, dashboard, redemption, production, pilot week). See §7.
  - **F4 is done** and is on draft PR [Platizio/Sanchay#1](https://github.com/Platizio/Sanchay/pull/1).
  - **F5 was stopped mid-research on the owner's instruction.** Its drafted design and the resume steps are in §7.3.
  - F1–F3 are drafted only in the local `.superpowers/plans-draft/` (not in the repo). F6–F28 are still outline text.

---

## 5. Open items and next steps

| # | Item | Owner |
|---|---|---|
| 1 | Finish Plan 04: merge the local F1–F3 drafts above F4, resume F5 (§7.3), then F6–F28. Then start **Sprint 2** on a new branch from `main` | Claude |
| 2 | **Register `sanchay.in`**, then **send the Cybrilla production letter** (`docs/business/cybrilla-production-letter.md`). Production access is the one step with no slack before 11-27. | Owner |
| 3 | Install **Android Studio + an API 35 emulator** so the Android on-device check (C15) can run | Owner |
| 4 | ~~Create the GitHub repo~~ **Done:** `Platizio/Sanchay`. Review and merge draft PR [Platizio/Sanchay#1](https://github.com/Platizio/Sanchay/pull/1) (Plan 04 F4, CI green). | Owner |
| 5 | Pilot business checklist: DLT/SMS vendor, SES, AWS accounts, Play Console, counsel sign-offs, risk questionnaire sign-off, curated fund list, commission rates | Owner / team |
| 6 | Velocity checkpoints: **Fri 10-09** (trims T1–T6 are pre-approved if short) and **Fri 10-23** (the owner decides on T7 web-only, T8, or moving the gate) | Owner + Claude |

**Key milestones:**
- Wed 10-21: login end to end on web + Android (already achieved on web).
- Fri 10-23: identity and profile onboarding, plus catalogue data on dev AWS.
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
1. Record the two errata above in the Plan 04 "Review notes".
2. Verify σ and n against design §F.6 and D-MONEY-050..054, then write and pin RA-01..RA-12 and the v1 vector.
3. Prototype the domain rules with ≥95% coverage.
4. Prototype the API side on Postgres: the quote, create, submit, advance and settlement paths, `payout.watch`, the event handler and the FakeFp routes. Include the G-E1 consent-first test (`expectNoPmWritesBeforeConsumed`) and the R-20 audit assertions.
5. Append Task F5 to the Plan 04 file in the same shape as F4.
6. Commit and push to the PR.
