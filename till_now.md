# Sanchay: progress so far

_Last updated: 2026-09-29 (afternoon). Repo: `C:\Users\pc\Desktop\sanchay`, branch `main` at `bcec8dc`. Plan 01 code is at `225d60a`; the four later commits are plan documents only._

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

### 4.4 Plan 04 (Sprint 4 and pilot week): IN PROGRESS, surveyed only
- **Target file:** `docs/superpowers/plans/2026-11-09-plan-04-mvp-sip-portfolio-redemption-prod.md`.
- All 28 drafts (F1–F28) are present in `.superpowers/plans-draft/plan-04/`. They have the same drift Plan 03 had. Rewrite them against Plan 02 and Plan 03 as built; the Global Constraints section at the top of the Plan 03 file is the contract.
- **F2 (SIP and mandate):**
  - **FP calls:** it uses an invented `FpTransact.call('pg.mandates.create' | 'pg.emandate.auth' | 'mf.purchasePlans.create', …)`. Use D3's operation keys `mandate.create`, `mandateAuth.create` and `purchasePlan.create`, by filling D3's `FpTransact` stubs (`createMandate`, `authoriseMandate`, `createPurchasePlan`, `updatePurchasePlan`).
  - **Reads:** `FpRead.purchasesByPlan` does not exist; use `FpRead.purchases({ plan })`.
  - **Jobs:** `mandates.submit`, `mandates.poll`, `plans.sip.submit` and `plans.instalments.sync` need class-level `@JobHandler` classes, not method-level decorators.
  - **7-day saga:** E4 decides the window by subject type.
    - With a new mandate, use `MANDATE_REGISTRATION` and map `CONSENT_SUBJECT_JOBS.MANDATE_REGISTRATION → 'mandates.submit'`.
    - With a reused mandate, use `SIP_REGISTRATION` and map `CONSENT_SUBJECT_JOBS.SIP_REGISTRATION → 'plans.sip.submit'`.
  - **Runtime config:** `@Inject(RuntimeConfig)` becomes the static `RuntimeConfig.get(exec, key)`.
- **F3 (eNACH):** redefines F2's `MandatesSubmitJob`; merge it into F2's job.
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

---

## 5. Open items and next steps

| # | Item | Owner |
|---|---|---|
| 1 | Apply the pending Plan 03 fix (§4.3). Rewrite and assemble Plan 04 (§4.4). Then start **Sprint 2** (Plan 02) on branch `feat/plan-02-mvp-kernel` from `main`, and update AGENTS.md's branch line | Claude |
| 2 | **Register `sanchay.in`**, then **send the Cybrilla production letter** (`docs/business/cybrilla-production-letter.md`). Production access is the one step with no slack before 11-27. | Owner |
| 3 | Install **Android Studio + an API 35 emulator** so the Android on-device check (C15) can run | Owner |
| 4 | Create the **GitHub repo** and share its URL. There is no remote yet, and pushes happen only when the owner asks. | Owner |
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

## 6. Resuming in a cloud session

A cloud session sees only what is in a remote repository. Today there is **no git remote**, and this file is **untracked**. Before switching:
1. **Create the GitHub repo** (open item 4) and add it as `origin`. Only the owner authorises pushes.
2. **Commit this file:** `git add till_now.md` then `git commit -m "docs: progress notes"`.
3. **Push `main`.**

In the cloud session, read `AGENTS.md`, this file (§4) and then the plan headers. Nothing from the local scratchpad or `~/.claude` memory carries over; everything needed to continue is written here.

Work style the owner asked for: **efficiency mode**. Do one task at a time, inline, with no multi-agent workflows unless asked, and keep usage low.

## 7. Where to look

- **Rules for agents:** `AGENTS.md`
- **Execution ledger (every task, review, fix and ruling):** `.superpowers/sdd/2026-09-28-plan-01-foundation/progress.md`
- **Rulings:** `docs/delivery/rulings.md`
- **Master plan (approved):** `C:\Users\pc\.claude\plans\superpowers-brainstorming-product-manag-smooth-waterfall.md`
