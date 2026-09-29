# Sanchay: progress so far

_Last updated: 2026-09-29. Repo: `C:\Users\pc\Desktop\sanchay`, branch `main` at `225d60a` (70 commits)._

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

- **Plans 02–04, the full TDD plans for Sprints 2–4.** All 25 draft chunks are written, covering the 63 tasks D1–D10, E1–E25 and F1–F28, and are saved in `.superpowers/plans-draft/`. **Remaining:** a consistency review per plan, fixes, and assembly into:
  - `docs/superpowers/plans/2026-10-12-plan-02-kernel-catalogue-data.md` (S2: platform kernel, Cybrilla gateway plus a local fake, catalogue data, dev AWS)
  - `docs/superpowers/plans/2026-10-26-plan-03-consent-onboarding-lumpsum.md` (S3: consent engine, onboarding, catalogue UI, lumpsum)
  - `docs/superpowers/plans/2026-11-09-plan-04-sip-portfolio-redemption-prod.md` (S4: SIP and mandates, ledger, dashboard, redemption, production, pilot week)

---

## 5. Open items and next steps

| # | Item | Owner |
|---|---|---|
| 1 | Finish Plans 02–04 (review → fix → assemble), then start **Sprint 2** on a new branch from `main` | Claude |
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

## 6. Where to look

- **Rules for agents:** `AGENTS.md`
- **Execution ledger (every task, review, fix and ruling):** `.superpowers/sdd/2026-09-28-plan-01-foundation/progress.md`
- **Rulings:** `docs/delivery/rulings.md`
- **Master plan (approved):** `C:\Users\pc\.claude\plans\superpowers-brainstorming-product-manag-smooth-waterfall.md`
