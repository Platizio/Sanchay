<!-- source: workflow wf_1d1c9b02-593 label revise-design (brand-renamed) | exported 2026-09-28 -->

# Sanchay (Platizio WealthTech v2): final architecture and delivery design (v2.0, after critic review)

**Date:** Friday 2026-09-25. The brief says Thursday, but 1-Jan-2026 was a Thursday, so 25-Sep-2026 is a Friday. Sprints still start Monday 2026-09-28.

**Status:** This is the plan of record. It is the v1.0 design with every critic issue resolved; §T maps each issue id to its resolution. Nothing was written to disk.

**Facts re-checked read-only today (2026-09-25):**
- v1 ships a DERIVED-units backfill for "unit-less settled purchases" (`BE/controller/NavAdminController.java:50-66`). v1 also reads units from three alternative keys (`BE/service/OrderService.java:1024`). This is why assumption A2 becomes a probe and a gate.
- v1 hard-codes `user_ip` to `127.0.0.1` (`BE/integration/RealCybrillaClient.java:3058`, `:3100`).
- v1 `consentPayload()` always sends both the profile email and the mobile (`BE/service/InvestorActionService.java:1048-1061`).
- v1 caps nominees at 3 in code (`BE/service/NominationRules.java:25`).
- `C:/Users/pc/Desktop/sanchay` contains only `.claude-flow/`. v2 adds it to `.gitignore` and does not touch it.

**Path aliases:**
- `BE` = `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech`
- `FE` = `C:/Users/pc/Desktop/WeathTech_v2/investor-frontend/src`

**Primary sources** (retrieved 2026-09-25; the full register with paragraph numbers goes into `docs/specs/regulatory-sources.md`, owned by counsel, due end of S1):

| Key | Source |
|---|---|
| SEBI-2FA-R | SEBI circular SEBI/HO/IMD/IMD-I DOF5/P/CIR/2021/634, 04-Oct-2021 (2FA for redemptions; OTP to the email or phone registered with the AMC) |
| SEBI-2FA-S | "Two-Factor Authentication for transactions in units of Mutual Funds", Sep-2022, https://www.sebi.gov.in/legal/circulars/sep-2022/two-factor-authentication-for-transactions-in-units-of-mutual-funds_63557.html |
| SEBI-NOM | "Revise and Revamp Nomination Facilities in the Indian Securities Market", 10-Jan-2025 (up to 10 nominees), https://www.sebi.gov.in/legal/circulars/jan-2025/circular-on-revise-and-revamp-nomination-facilities-in-the-indian-securities-market_90698.html |
| SEBI-NOM-A | Amendments to SEBI-NOM, 28-Feb-2025, https://www.sebi.gov.in/legal/circulars/feb-2025/amendments-and-clarifications-to-circular-dated-january-10-2025-on-revise-and-revamp-nomination-facilities-in-the-indian-securities-market_92377.html |
| SEBI-MC | Master Circular for Mutual Funds SEBI/HO/IMD/IMD-PoD-1/P/CIR/2024/90, 27-Jun-2024, https://www.sebi.gov.in/legal/master-circulars/jun-2024/master-circular-for-mutual-funds_84441.html. The prior analysis cites a 2026 edition ("MC-2026"). Counsel records which edition is in force and re-maps every paragraph reference (9.4 cut-off, 15.3–15.4 payout interest, 17.3 pooling, 17.4 2FA and liability) in S1. |
| AMFI-MFD | AMFI Master Circular for MFDs AMFI/MFD-CIR/32/2025-26, https://www.amfiindia.com/uploads/AMFI_Master_Cicular_for_MF_Ds_3c7f5ee44f.pdf (EUIN execution-only declaration "separately signed", "exceptional cases") |
| DPDP-R | DPDP Rules 2025, G.S.R. 846(E), 13-Nov-2025. Most rules apply from 13-May-2027. Mirror: https://www.dpdpa.com/DPDP_Rules_2025_English_only.pdf; the official e-Gazette copy is to be filed by counsel. |
| CERTIN | CERT-In Directions under s.70B(6) IT Act, 28-Apr-2022: 180-day logs held in India, NTP traceable to NIC/NPL, incident report within 6 h |
| FP-SW | https://docs.fintechprimitives.com/mf-transactions/onetime-switches/ (folio `email_addresses[]` and `mobile_numbers[]` used as OTP destinations) |
| FP-RED | https://docs.fintechprimitives.com/mf-transactions/onetime-redemptions/ (holdings report `redeemable_units`) |

The SEBI category circular that the brief cites (HO/24/13/15(2)2026-IMD-RAC4/I/5764/2026, 26-Feb-2026) could not be retrieved read-only. Seeding `sebi_categories` is blocked until its URL, date and annexure are recorded in the register. Owner: Dev A with counsel. Due: S3.

---

## 0. Revision record and PO decisions

### 0.1 What changed from v1.0 (headline)

1. **The UI is built once.** There is one universal `packages/ui` (React Native primitives) and one `packages/features` (screens). Native renders them directly. `apps/web` renders them through react-native-web for the authenticated `(app)` routes only. The www SEO pages stay RSC with Tailwind. `/app/explore` and `/app/funds/[slug]` are deleted. The admin app is a Vite SPA. (BLK-1, ONE-THING, HIGH-4)
2. **The roadmap is planned at 80% of capacity**, with explicit overhead lines (review, FakeFp upkeep) and a velocity re-baseline at the end of S2. The launch date is published as **P50 Mon 2027-07-05 / P80 Mon 2027-08-16 (plan of record)**. The earlier 2027-05-10 date had well under 10% confidence. (BLK-2)
3. **Decision-4 scope can no longer be dropped by default.** Capability probes run in S0 (results by 2026-10-09). An unproven capability becomes a PO go/no-go escalation. (BLK-3)
4. **Consent now follows the regulated destination.** A ConsentDestinationResolver sends OTPs only to contacts registered on the folio. A distinct second factor is required (a biometric-bound device key on native, SMS plus email on web for exits). Consent evidence is encrypted, and delivery evidence is kept for 8 years. (MS-01, MS-06, MS-09, MS-11, MS-26)
5. **Ambiguous provider outcomes are never final.** A new RECONCILING state covers them. Ledger shortfalls become exceptions, not rollbacks. Refunds, the UNITS_PENDING state and honest payout states are modelled. (MS-04, HIGH-1, MS-07, MS-08)
6. **FP/RTA holdings reconciliation is a real-money gate**, together with a folio `externally_modified` flag and a ledger-adjustment tool. (MS-05)
7. **Folio servicing is honest.** Changes to existing folios (nomination, bank, contacts) are tracked RTA service requests. Changes of bank (COB) and of contacts carry anti-takeover controls. (MS-02, MS-03)
8. **Over-engineering is cut:** one KYC adapter, tax rules as code constants, the dashboard computed on read, no partitions, no CSRF synchronizer token, no second SMS provider before launch, no cold-start token rotation. (MED-1, HIGH-3)

### 0.2 Decisions the PO must confirm

**No default silently removes decision-4 scope.**

| ID | Question | Proposed default | Deadline |
|---|---|---|---|
| PO-1 | Amend "NestJS v11" to 12.1.0 | Stay on 11.2.6. The upgrade becomes a hardening item only if approved. | 2026-10-02 |
| PO-2 | For each decision-4 capability that the S0 probes do not prove on ONDC/cybrillapoa (quarterly SIP, redeem by units, SIP pause/skip, switch, STP, SWP, UPI Autopay, top-up): (a) wait for Cybrilla and move the launch; (b) amend decision 4 for that item in writing; or (c) change distribution rail for that item (out of scope today). | **No default.** An unanswered item blocks the S22 go/no-go (G9). Fallback UX (for example cancel plus restart) is not counted as meeting decision 4. | Probe results 2026-10-09; PO decision 2026-10-16 |
| PO-3 | IDCW orderable at launch | Growth only until IDCW events can be ledgered from the holdings/RTA feed (G4) | 2027-03-26 |
| PO-4 | Launch date and levers | Accept P80 2027-08-16 as plan of record, with P50 2027-07-05. Levers need explicit sign-off: (i) a third full-stack developer from S4 (P80 → about 2027-06-28); (ii) amend decision 4 to move CAS import and STP/SWP to a 4-week fast-follow (P80 → about 2027-07-26). | 2026-10-09; re-baseline 2026-11-06 |
| PO-5 | Dashboard XIRR display | Show XIRR once the first flow is ≥ 30 days old. Under 365 days, label it "Annualised; can swing widely for holdings under 1 year" and show absolute return next to it. Under 30 days show "Too early" plus absolute return. | 2026-10-16 |
| PO-6 | Meaning of "modify-top-up" | Launch = one-off change of SIP amount (FP plan modification). An annual step-up SIP ships only if probe P-09 shows FP support; otherwise it needs a decision-4 amendment. | 2026-10-16 |
| PO-7 | Nominee cap: the regulation allows 10 (SEBI-NOM). FP `folio_defaults` supports nominee1..3. | If probe P-11 confirms FP max = 3, accept 3 as a limitation signed by counsel and disclose it in the UI. If FP supports more, allow up to the FP maximum (≤ 10). | 2026-10-16 |

---

## A. Monorepo layout (`C:/Users/pc/Desktop/sanchay`)

### A.1 Tree

| Path | Responsibility | Key tech |
|---|---|---|
| `apps/api` | NestJS modular monolith. One image, `APP_ROLE=api\|worker\|migrate`. | Nest 11.2.6 (Fastify), oRPC 1.15.4, Drizzle 0.45.3, pg 8.23.0, pg-boss 12.34.0 (pin re-verified in S0; MED-13) |
| `apps/web` | One Next deployment serving two hosts. **www.sanchay.in**: public SEO, route group `(public)`, RSC + Tailwind, **no react-native-web**. **app.sanchay.in**: investor app, route groups `(auth)` and `(app)`; each page is a thin `'use client'` wrapper that renders a `packages/features` screen through react-native-web. `proxy.ts` routes by host. | Next 16.3.6, React 19.2.x, Tailwind 4.3.3, react-native-web (pinned in S0), TanStack Query 5.103.2 |
| `apps/admin` | Ops back office. **Vite + React SPA**, TanStack Router (dynamic `$id` routes at runtime), TanStack Table, shadcn/Radix copied into `apps/admin/src/ui` (admin-only). Static files on S3+CloudFront at `ops.sanchay.in`. No inline scripts, so a strict CSP works. | Vite 7, @tanstack/react-router, @tanstack/react-table (pinned in S0), shadcn 4.21.0 CLI, tokens |
| `apps/mobile` | Expo native app (Android/iOS). Routes are thin wrappers over `packages/features` screens plus native adapters. | Expo SDK 57 (57.0.25, RN 0.86.3), expo-router 57.0.23 |
| `packages/contract` | oRPC contract, Zod 4 schemas, typed error catalogue, **generated** state enums, wire decimal types | zod 4.6.5, @orpc/contract 1.15.4 |
| `packages/api-client` | OpenAPILink client with two transports (web: same-origin cookie plus `x-sanchay-client`; native: bearer plus installation id). TanStack utils. Idempotency-key helper. | @orpc/openapi-client, @orpc/tanstack-query 1.15.4 |
| `packages/money` | `Money` (2 dp), `Units` (3 dp platform, 4 dp external), `Nav` (6 dp) over decimal.js. INR lakh/crore formatting without `Intl`. `holdingMoney()`. Largest-remainder percentages. | decimal.js 10.6.0 |
| `packages/domain` | Pure rules, no I/O: XIRR, FIFO, valuation grade, availability and buffer function, ELSS lock, cut-off engine and calendar, SIP/mandate rules, nomination and equal split, KYC readiness table, onboarding stage, **state tables → `canTransition()`**, JCS canonicaliser, snapshot builders, templates, validators, **tax classification constants (versioned)** | TS only; depends on `money` |
| `packages/app-core` | Headless React: view-model hooks (`useOtpLogin`, `useOnboarding`, `useFundDetail`, `useLumpsumCheckout`, `useSipCheckout`, `useConsent`, `usePaymentAttempt`, `useRedemption`, `useSwitch`, `useStp`, `useSwp`, `useDashboard`, `useReports`, `useCasImport`, `useFolioRequests`), polling policies, chart geometry (d3-shape/d3-scale, LTTB), en-IN copy, error-code → message map | React (peer), react-hook-form 7.88.0, @hookform/resolvers 5.9.1 |
| `packages/ui` | **The one universal component kit.** React Native Reusables (built on @rn-primitives, which wraps Radix on web) styled with Uniwind (fallback: NativeWind 4.2.7; decided by the S0 spike). Used by `features`, native and web `(app)`. | react-native, react-native-web, @rn-primitives/*, uniwind 1.12.0, react-native-svg |
| `packages/features` | **Universal screens** (`features/<area>/<Name>Screen.tsx`). Also a ~60-line navigation adapter (`useNav()`: `Link`, `push`, `replace`, `back`, `params`) and a **platform-adapter context** (`PaymentLauncher`, `SecureStorage`, `FileSaver`, `DeviceSigner`, `UpiAppPicker`, `DocumentPicker`, `ImageCapture`, `Geo`, `ScreenPrivacy`). Apps provide the implementations. | depends on `ui`, `app-core`, `api-client` |
| `packages/tokens` | `theme.css` (Tailwind v4 `@theme`, used by www, admin and Uniwind) and `tokens.ts` (same values) | tailwindcss 4.3.3 |
| `packages/www-ui` | ~12 **server** components for the SEO pages (FactTable, RiskometerSvg, PrcMatrix, DisclosureFooter, RegularPlanNotice, FreshnessLabel, NavChartIsland, FundCard). Tailwind only, no RN. | — |
| `packages/test-fixtures` | Golden vectors ported from v1, FP payload fixtures, synthetic CAS PDFs, AMFI feed fixtures | JSON/TS |
| `packages/config` | tsconfig variants, `biome.json`, Vitest presets | — |
| `tools/fp-probes` | Scripted FP sandbox probes P-01..P-14, run from the CLI; results go to `docs/probes/P-xx.md` | tsx + undici |
| `infra/` | AWS CDK app (TS) | aws-cdk-lib (pinned in S0) |
| `docs/specs/<module>.md`, `docs/specs/states.md`, `docs/specs/regulatory-sources.md`, `docs/adr/`, `AGENTS.md`, `.github/CODEOWNERS` | Agent inputs, ADRs, ownership | — |

**Estimation rule (ADR-0002):**
- A universal screen costs **1.15×** a single-platform screen: responsive web layout plus a two-platform QA pass.
- Platform glue (payment return, secure storage, native pickers) is estimated as separate lines.
- www pages are estimated separately.

### A.2 Exact versions (pnpm `catalog:`). First S0 task: a lockfile dry-run (MED-13).

```
node 24.21.0 | pnpm 11.27.0 | turbo 2.11.4 | typescript 6.0.3
zod 4.6.5 | decimal.js 10.6.0 | @orpc/* 1.15.4 | @tanstack/react-query 5.103.2 | react-hook-form 7.88.0 | @hookform/resolvers 5.9.1
@nestjs/core|common|platform-fastify|testing 11.2.6 | @nestjs/config 4.0.4 | @nestjs/throttler 6.7.1 | nestjs-pino 5.2.0 | pino 10.3.1
pino-http 11.0.0 | nestjs-cls 7.0.1 | drizzle-orm 0.45.3 | drizzle-kit 0.31.11 | pg 8.23.0 | pg-boss 12.34.0 (re-verify; vendored Nest module)
uuid 14.0.2 | @node-rs/argon2 2.2.1 | @sentry/nestjs 10.75.3 | @sentry/nextjs 10.75.3 | @sentry/react-native ~7.11.0 | @sentry/react (admin)
next 16.3.6 | react/react-dom: ONE version if the dry-run proves Expo 57/RN 0.86.3 and Next 16.3.6 both accept it; otherwise per-app React via pnpm overrides,
  with packages/ui|features|app-core declaring react as a peerDependency (each bundler resolves the app's copy)
tailwindcss + @tailwindcss/postcss 4.3.3 | uniwind 1.12.0 (fallback nativewind 4.2.7 + tailwindcss 3.4.19 inside packages/ui only)
expo 57.0.25 | expo-router 57.0.23 | expo-secure-store 57.0.4 | expo-local-authentication 57.0.3 | expo-notifications 57.0.21
expo-web-browser 57.0.3 | expo-linking 57.0.11 | reanimated 4.5.1 / worklets 0.10.1 | eas-cli 24.8.0
Native capability modules (installed ONLY via `npx expo install`, versions recorded in ADR-0001 in S0; MED-10):
  expo-image-picker (KYC signature photo), expo-location (KYC geo "inside India"), expo-document-picker (CAS PDF),
  expo-file-system + expo-sharing (reports), react-native-svg (charts), expo-screen-capture (FLAG_SECURE / iOS capture blur),
  @gorhom/bottom-sheet 5.x (consent sheet), expo-crypto (random bytes); @noble/hashes (HMAC-SHA256, pure TS)
vitest 5.0.1 | @testcontainers/postgresql + testcontainers 12.1.0 | @playwright/test 1.63.0 | msw 2.15.0 | Maestro 2.10.0
@biomejs/biome 2.5.14 | lefthook 2.1.14 | Docker postgres:18.6-trixie | RDS PostgreSQL 18.6
Pin in S0 via `pnpm view` (with dates, into docs/adr/0001-versions.md): react-native-web, @rn-primitives/*, vite, @tanstack/react-router,
  @tanstack/react-table, @fastify/cookie, @fastify/multipart, date-fns 4 + @date-fns/tz, pdfmake, pdfjs-dist, qrcode, d3-shape, d3-scale,
  lossless-json, fast-check, k6, gitleaks, @axe-core/playwright, aws-cdk-lib, @aws-sdk/client-{kms,s3,sesv2,secrets-manager}
If PO-1 is approved: @nestjs/* 12.1.0, @nestjs/config 12.0.1, @sentry/nestjs 11.0.0
Fallback pins if the contract gate fails: nestjs-zod 5.5.0, @nestjs/swagger 11.4.7, openapi-fetch 0.17.0
```

### A.3 Workspace rules

| Topic | Decision |
|---|---|
| pnpm | `nodeLinker: hoisted` (Expo monorepo). `onlyBuiltDependencies: [@node-rs/argon2, esbuild, @swc/core]`. `engine-strict=true`. |
| Package build | Non-UI packages are ESM, `tsc -b`, and export from `dist`. `ui`, `features` and `app-core` ship TSX source. Next uses `transpilePackages` plus a Turbopack `resolveAlias` of `react-native` → `react-native-web`. Metro compiles the workspace TS. |
| API build | `nest start -b swc -w` in dev, `nest build -b swc` in prod, `tsc --noEmit` as the type gate. ESM with `NodeNext`. If the S0 gate fails: CJS output plus `require(esm)`. |
| TS configs | `base.json` strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, ES2023. Variants: `node-lib`, `nest`, `next`, `expo`, `vite`. |
| Lint/format | Biome only. `.gitattributes: * text=auto eol=lf`. |
| Boundaries | `scripts/check-boundaries.ts` (CI) enforces: module-to-module imports only through `modules/<m>/index.ts`; `domain` and `money` must not import I/O; `admin` has no path to order, plan, mandate or consent **commands**; `features` must not import `next/*` or `expo-*` (only adapters); `Crypto.encrypt` must receive a `RowId` minted by `newId(table)` (MED-3). |
| Hooks | lefthook pre-commit: `biome check --staged` + gitleaks. pre-push: `turbo typecheck --filter=...[HEAD^]`. |
| Agent workflow | Every item starts from `docs/specs/<module>.md` (states come from `docs/specs/states.md`; rules, golden vectors, error codes), written by a developer. Agents implement against the contract, fakes and vectors. The other developer reviews (§P review policy). |

### A.4 Turborepo tasks

| Task | dependsOn | Notes |
|---|---|---|
| `build` | `^build` | outputs `dist/**`, `.next/**` (excluding cache), `apps/admin/dist/**` |
| `dev` | `^build` | persistent, no cache |
| `typecheck`, `test` | `^build` | Vitest (cached) |
| `test:int` | `^build` | api only, Testcontainers |
| `lint` | — | `biome ci .` |
| `gen:states` | — | `docs/specs/states.md` → `packages/domain/states.gen.ts` + `packages/contract/states.gen.ts` + `apps/api/drizzle/states.gen.sql` (CHECK constraints). CI fails on diff. |
| `db:check` | `gen:states` | `drizzle-kit generate` must produce no diff |
| `openapi` | `^build` | `apps/api/openapi.json`; CI fails on diff or on a breaking change |
| `e2e:web` | `build` | Playwright against compose + FakeFp |
| `budgets` | `build` | `scripts/check-bundle-budgets.ts` computes first-load JS from `.next` build manifests (§L.5) |

---

## B. Backend architecture

### B.1 Modules (bounded contexts)

| Module | Owns tables | Public facade |
|---|---|---|
| `platform` | idempotency_keys, app_config, audit_events, provider_calls, recon_breaks, admin_approvals, product_events, ref_ifsc, ref_pincodes | `Db.tx()`, `newId(table)`, `Crypto` (encrypt/decrypt/blindIndex), `Jobs.enqueue(tx,…)`, `Audit.record(tx,…)`, `Clock`, `Config`, `Flags` (money flags require an approval, §E.3), `Approvals` |
| `identity` | investors, investor_contacts, investor_devices, auth_sessions, otp_codes, admin_users, admin_sessions | `SessionService`, `OtpService`, `DeviceTrust`, `InvestorAccounts`, `AdminAuth` |
| `legal-consent` | legal_documents, consent_records, consent_challenges, consent_subjects | `ConsentEngine.create/sendOtp/approve/consume/useConsumed`, `ConsentDestinationResolver`, `LegalDocs` |
| `onboarding` | investor_profiles, tax_residencies, onboarding_applications, onboarding_reviews, kyc_checks, kyc_applications, bank_accounts, nominees, nomination_decisions, risk_profiles, documents | `Readiness.assertCanPurchase / assertCanExit`, `BankAccounts`, `Nomination` |
| `catalogue` | amcs, sebi_categories, category_aliases, schemes, scheme_tax_classes, fund_facts, fund_facts_revisions, commission_disclosures, scheme_navs, nav_history, nav_sync_runs, scheme_returns, market_holidays, calendar_years, watchlist_items | `Catalogue.getOrderableScheme`, `NavService`, `Calendar`, `TaxClass.asOf` |
| `orders` | orders, plans, plan_modifications, order_events | `OrderQueries` |
| `payments` | payment_attempts, mandates | `Payments`, `Mandates` |
| `portfolio` | folios, folio_service_requests, lots, lot_consumptions, ledger_adjustments, ledger_exceptions, redemption_reservations, report_requests | `Ledger.applyAllotment/applyExit/applyReversal/applyAdjustment(tx,…)`, `Availability.reserve(tx,…)`, `PortfolioQueries` (compute on read) |
| `external-holdings` | cas_imports, external_holdings | — |
| `notifications` | notifications, notification_deliveries, notification_preferences | `Notify.enqueue(tx,…)` |
| `privacy` | service_requests | — |
| `integrations/*` | inbound_webhook_events | Ports: `FpGateway`, `KycApplicationPort`, `HoldingsFeed`, `AmfiFeed`, `SmsSender`, `EmailSender`, `PushSender`, `CasParser`, `ObjectStore`, `KeyService` |
| `admin` | none | Admin routers composing read facades and **whitelisted** ops commands (retry step, re-fetch and apply, publish, approve, unmask, service-request handling). Never creates an order, plan, mandate or consent, and never re-submits a provider write (MS-13). |

### B.2 Layering (identical in every module)

```
modules/<m>/index.ts        facade exports only
modules/<m>/<m>.router.ts   oRPC @Implement: guard → contract parse → service → map
modules/<m>/<m>.service.ts  use cases; owns the DB tx; calls packages/domain; enqueues jobs
modules/<m>/<m>.repo.ts     Drizzle only; every insert takes an id from newId(table)
modules/<m>/<m>.jobs.ts     pg-boss handlers (the only place provider HTTP happens)
modules/<m>/<m>.schema.ts   Drizzle tables
```

### B.3 How modules talk to each other

| Mechanism | When |
|---|---|
| Direct facade call in the caller's tx | Atomic cross-module invariants (orders → `Availability.reserve`, orders → `ConsentEngine.create`) |
| **Transactional outbox = pg-boss job enqueued inside the Drizzle tx** | Every post-commit side effect: provider writes and re-fetches, notifications, reports |
| Domain-event bus | None. "Events" are named jobs. |

### B.4 Transaction rules

| # | Rule |
|---|---|
| T1 | One use case = one tx at READ COMMITTED, with `tx` passed explicitly. |
| T2 | Never hold a tx across provider HTTP. **tx1** marks the step `SUBMITTING` with `submit_attempts+1` and commits → HTTP (idempotent `source_ref_id`) → **tx2** records the result with a version check. |
| T3 | Every mutable aggregate has `version int`. 0 rows updated → `CONFLICT_VERSION` (409 to clients, retry in jobs). |
| T4 | Lot mutations lock `FOR UPDATE` in `(folio_id, scheme_id, allotment_date, id)` order. **Draft transactions that reserve units first take `pg_advisory_xact_lock(hashtextextended(folio_id‖scheme_id,0))`** (MS-16). |
| T5 | Jobs per aggregate are serialised by pg-boss `singletonKey = aggregateId` plus an advisory lock. |
| T6 | FP creates are not idempotent. On timeout, transport error or duplicate-`source_ref_id`: list by `mf_investment_account` plus states, match `source_ref_id`, adopt. **An ambiguous outcome sets RECONCILING and never FAILED** (§F.1). |
| T7 | A provider result is always recorded, even when a local invariant breaks. The ledger writes a `ledger_exceptions` row plus a CRITICAL recon break instead of rolling back (MS-04). |

### B.5 Cross-cutting concerns

| Concern | Decision |
|---|---|
| Error envelope | **oRPC's native error shape** (MED-9). Wire: `{ defined: true, code, status, message, data: { retryable, requestId, fields?: [{path, code, message}], providerCode? } }`. `message` never contains PII. Clients render copy from `code`. Every procedure declares its codes in `.errors(...)`. The S0 gate proves the typed round-trip through `OpenAPILink`. No RFC 9457: there is no external consumer. |
| Validation | Zod on input and **output (100%)** with unknown keys stripped. Domain rules re-checked in services. DB CHECKs and triggers last. Env validated by Zod. |
| Idempotency | `Idempotency-Key` (UUIDv7, one per user intent) is required on every financial, consent or onboarding mutation. Missing → 428 `IDEMPOTENCY_KEY_REQUIRED`. Same key + same hash → replay. Different hash → 422 `IDEMPOTENCY_KEY_REUSED`. In progress → 409 with `Retry-After: 1`. TTL 24 h. |
| Rate limiting | WAF: 2,000 per 5 min per IP site-wide, **with `/api/v1/webhooks/fp` exempt** (MS-24); 100 per 5 min on `/api/v1/auth/*`. App: throttler at 120/min per session. OTP limits are persisted: 30 s cooldown, 5 per destination per hour, 15 per day, 20 per IP per hour, 10 per device per hour. |
| Host binding (MIN-6) | Each CloudFront distribution injects `x-sanchay-edge: app\|ops` alongside the origin secret. A global `EdgeGuard` rejects `/api/v1/admin/**` unless the edge is ops, and every other `/api/v1/**` (except `/webhooks/fp` and the postbacks, which arrive through app) unless the edge is app. Failures return 404. |
| Logging | nestjs-pino JSON to CloudWatch ap-south-1 (400 days). The redact list covers pan, mobile, email, accountNumber, ifsc, dob, name, aadhaar*, address*, otp, code, password, totp, authorization, cookie, set-cookie, `*.token*`, casPassword. **Request bodies are never logged.** Multipart capture is off globally and asserted by test on `/external/cas-imports` (MS-22). nestjs-cls carries requestId, actor, investorId, sagaId, platform, appVersion. |
| Provider and audit payloads | **Allow-list redaction** (MS-09). `provider_calls.request_meta` / `response_meta` keep only allow-listed keys (ids, states, amounts, dates, error codes, scheme ISIN). Everything else is dropped. The full body is stored only as `body_enc` (encrypted) for 400 days. `audit_events.data` follows the same allow-list. |
| Tracing and errors | `@sentry/nestjs` owns OTel. `sendDefaultPii:false`; `beforeSend` / `beforeSendTransaction` scrub URLs (path ids → `:id`, query strings dropped), breadcrumbs and extra data (MS-27). Sampling: 20% prod, 100% on consent and checkout routes. |
| Health | `/api/v1/health` (liveness) and `/api/v1/health/ready` (DB, pg-boss, NAV age ≤ 4 days). `/ready` is on the internal ALB only. The worker writes a heartbeat row every 30 s (MED-7). |
| Decimal fidelity (MS-25) | FP responses are parsed with `lossless-json` (numbers kept as strings) and converted straight to decimal.js. Outbound numbers are emitted from decimal strings through a custom serializer. A fast-check round-trip property test covers it. |

---

## C. Data model (PostgreSQL 18.6, Drizzle 0.45.3, schema `app`)

### C.1 Conventions

| Topic | Rule |
|---|---|
| PK | `id uuid PRIMARY KEY`. **Every id is generated by the app (uuid v7) before insert** through `newId(table)` and the Drizzle `$defaultFn`, so AAD and `source_ref_id` are known up front (MED-3). The DB `DEFAULT uuidv7()` stays only as a backstop for tables with no `*_enc` column. `check-boundaries` enforces that `encrypt()` gets a `RowId`. Integration test: decrypting with a swapped rowId fails. |
| `+std` | `created_at timestamptz(6) NOT NULL DEFAULT now()`, `updated_at timestamptz(6) NOT NULL DEFAULT now()`, `version int NOT NULL DEFAULT 0` (mutable aggregates). No naive `timestamp`. |
| `+actor` | `created_by text NOT NULL`, `updated_by text NOT NULL`: `investor:<uuid>`, `admin:<uuid>` or `system:<job>` |
| Types | Money `numeric(18,2)`. **Platform units `numeric(20,3)`** (RTA/FP precision; removes 3 dp/4 dp drift, MS-16). External/CAS units `numeric(20,4)`. NAV `numeric(18,6)`, displayed at 4 dp. Percent `numeric(9,4)`. Rate `numeric(14,8)`. Business dates are `date` in IST. |
| Enums | `text CHECK (col IN (…))`. State columns are **generated** from `docs/specs/states.md` (MED-5), and the same source generates the Zod enums and `canTransition()`. |
| FKs | On every relation, `ON DELETE RESTRICT`. CASCADE only where marked. |
| Soft delete | None. Lifecycle `status` columns instead. `documents.deleted_at` is the one exception. |
| PII | `*_enc bytea` (AES-256-GCM envelope, AAD `table.column:rowId`), `*_bidx bytea` (HMAC-SHA256), `*_last4` / `*_masked` for display |
| Append-only | consent_records, audit_events, order_events, fund_facts_revisions, provider_calls, ledger_adjustments: `REVOKE UPDATE, DELETE FROM plz_app`. Redaction after retention is done only through `SECURITY DEFINER` functions owned by `plz_retention` (MS-09). |
| Roles | `plz_migrator` (DDL), `plz_app` (DML), `plz_retention` (executes redaction functions; used only by the `retention.purge` job's connection), `plz_readonly` (views without `*_enc`) |
| Extensions | `pg_trgm`, `citext`, `btree_gin`, `pg_stat_statements` |

### C.2 Identity and verification

```
investors +std +actor
  status CHECK (ACTIVE,SUSPENDED,FRAUD_HOLD,CLOSURE_REQUESTED,CLOSED) DEFAULT 'ACTIVE'
  mobile_enc bytea NOT NULL, mobile_bidx bytea NOT NULL UNIQUE, mobile_last4 char(4) NOT NULL, mobile_verified_at timestamptz NOT NULL
  email_enc bytea, email_bidx bytea UNIQUE, email_masked text, email_verified_at timestamptz
  display_name text, first_order_at, closed_at timestamptz
  can_purchase boolean NOT NULL DEFAULT false, can_exit boolean NOT NULL DEFAULT false,     -- MS-12 split
  purchase_block_reason text NULL, exit_block_reason text NULL,
  last_contact_change_at timestamptz NULL, last_bank_change_at timestamptz NULL,           -- cooling-off inputs
  fp_investor_profile_id text UNIQUE, fp_mf_investment_account_id text UNIQUE, fp_mfia_old_id bigint,
  fp_phone_id, fp_email_id, fp_address_id text
  -- constraint trigger trg_investor_readiness (DEFERRABLE INITIALLY DEFERRED): can_purchase ⇒ status='ACTIVE'
  --   ∧ investor_profiles.kyc_status='VALIDATED' ∧ a kyc_checks row backs it (readiness_code verified) ∧ ∃ bank_accounts VERIFIED primary
  --   ∧ onboarding provisioning_status='DONE' ∧ email_verified_at IS NOT NULL. can_exit ⇒ fp_mf_investment_account_id IS NOT NULL ∧ status<>'FRAUD_HOLD'
investor_contacts +std   -- MS-01: every contact ever OTP-verified; used by ConsentDestinationResolver
  id, investor_id → investors, kind CHECK (MOBILE,EMAIL), value_enc bytea NOT NULL, value_bidx bytea NOT NULL, masked text NOT NULL,
  verified_at timestamptz NOT NULL, status CHECK (CURRENT,PREVIOUS,REVOKED), superseded_at timestamptz NULL
  UNIQUE (investor_id, kind, value_bidx); UNIQUE (investor_id, kind) WHERE status='CURRENT'
investor_devices +std
  investor_id → investors, platform CHECK (WEB,ANDROID,IOS), device_ref_hash bytea NOT NULL (web: SHA-256 of __Host-sanchay_dev; native: installation_id),
  app_version, os_version, push_token_enc bytea, consent_key_enc bytea NULL (native 32-byte device secret, §E.4), consent_key_registered_at,
  trusted_at timestamptz NULL, last_seen_at, revoked_at timestamptz, UNIQUE (investor_id, device_ref_hash)
auth_sessions +std
  investor_id → investors, device_id → investor_devices NOT NULL, platform CHECK (WEB,ANDROID,IOS),
  token_hash bytea NOT NULL UNIQUE (SHA-256 of 32-byte random), idle_expires_at, absolute_expires_at timestamptz NOT NULL,
  revoked_at, revoke_reason CHECK (LOGOUT,ADMIN,ACCOUNT_CLOSED,IDLE,CONTACT_CHANGED,BANK_CHANGED,DEVICE_REVOKED,FRAUD_HOLD),
  ip inet, user_agent text, last_used_at; INDEX (investor_id) WHERE revoked_at IS NULL
otp_codes
  id, created_at, purpose CHECK (LOGIN,LOGIN_NEW_DEVICE_EMAIL,EMAIL_VERIFY,CONTACT_CHANGE_OLD,CONTACT_CHANGE_NEW,CONSENT),
  channel CHECK (SMS,EMAIL), destination_bidx bytea NOT NULL, destination_masked text NOT NULL, reference_id uuid NULL,
  code_hmac bytea NOT NULL, attempts smallint DEFAULT 0 CHECK (attempts<=5), expires_at, consumed_at,
  consumed_reason CHECK (VERIFIED,EXPIRED,LOCKED,SUPERSEDED), ip inet,
  provider CHECK (MSG91,SES), provider_message_id text, template_id text, dlr_status text, dlr_at timestamptz
  UNIQUE (purpose, destination_bidx, coalesce(reference_id,'00000000-0000-0000-0000-000000000000')) WHERE consumed_at IS NULL
admin_users +std +actor  email citext UNIQUE NOT NULL, name, password_hash (argon2id), totp_secret_enc, totp_last_step bigint,
  role CHECK (SUPPORT,OPS,COMPLIANCE,SUPERADMIN), status CHECK (ACTIVE,LOCKED,DISABLED), failed_logins smallint, locked_until, last_login_at
admin_sessions +std  admin_user_id → admin_users, token_hash UNIQUE, totp_verified_at, idle_expires_at, absolute_expires_at, revoked_at, ip inet, user_agent
```

### C.3 Legal and consent

```
legal_documents +std +actor
  key CHECK (TNC,PRIVACY_NOTICE,RISK_DISCLOSURE,REGULAR_PLAN_COMMISSION,EXECUTION_ONLY_DECLARATION,FATCA_CRS_DECLARATION,
     NOMINATION_OPT_OUT_ANNEX_B,CAS_IMPORT_NOTICE,KYC_CONSENT,INVESTOR_CHARTER,GRIEVANCE_POLICY,
     TPL_PURCHASE,TPL_REDEMPTION,TPL_SWITCH,TPL_SIP_REGISTRATION,TPL_SIP_WITH_PURCHASE,TPL_STP_REGISTRATION,TPL_SWP_REGISTRATION,
     TPL_PLAN_MODIFY,TPL_PLAN_PAUSE,TPL_PLAN_CANCEL,TPL_MANDATE_REGISTRATION,TPL_MANDATE_CANCEL,TPL_NOMINATION_CHANGE,
     TPL_CONTACT_CHANGE,TPL_BANK_CHANGE,TPL_FOLIO_SERVICE_REQUEST,TPL_ONBOARDING_ATTEST)
  version, locale DEFAULT 'en-IN', title, body_markdown NOT NULL, sha256 bytea NOT NULL,
  status CHECK (DRAFT,PENDING_APPROVAL,PUBLISHED,RETIRED), requires_reacceptance boolean, approval_id → admin_approvals, effective_from, published_at
  UNIQUE (key, version, locale); UNIQUE (key, locale) WHERE status='PUBLISHED'
consent_records (append-only)
  id, investor_id → investors, accepted_at NOT NULL, consent_key NOT NULL, legal_document_id NULL, document_sha256 NULL,
  rendered_text_enc bytea NOT NULL, content_sha256 bytea NOT NULL,          -- MS-09: text encrypted, hash in clear
  rendered_at_approve_enc bytea NULL, rendered_at_approve_sha256 bytea NULL, -- MS-15: NAV-date line re-rendered at approve
  snapshot_sha256 bytea NULL, challenge_id → consent_challenges NULL,
  otp_channels_verified text[] NULL,                                        -- channels ACTUALLY verified (MS-26)
  delivery_evidence jsonb NULL,  -- MS-11: [{channel, destinationMasked, provider, providerMessageId, templateId, dlrStatus, dlrAt}] (masked only; no code)
  second_factor CHECK (NONE,DEVICE_KEY_BIOMETRIC,EMAIL_OTP) NULL, device_id → investor_devices NULL,
  action CHECK (ACCEPTED,WITHDRAWN), ip inet, user_agent, session_id uuid, channel CHECK (WEB,ANDROID,IOS)
  INDEX (investor_id, consent_key, accepted_at DESC)
consent_challenges +std
  investor_id → investors, subject_type CHECK (PURCHASE,REDEMPTION,SWITCH,SIP_REGISTRATION,SIP_WITH_PURCHASE,STP_REGISTRATION,
     SWP_REGISTRATION,PLAN_MODIFY,PLAN_PAUSE,PLAN_CANCEL,MANDATE_REGISTRATION,MANDATE_CANCEL,CONTACT_CHANGE,BANK_CHANGE,
     FOLIO_SERVICE_REQUEST,ONBOARDING_ATTEST),
  subject_id uuid NOT NULL, status (generated: PENDING,SENT,APPROVED,CONSUMED,CONSUMED_UNUSED,EXPIRED,SUPERSEDED,CANCELLED),
  snapshot_enc bytea NOT NULL, snapshot_sha256 bytea NOT NULL, template_key, template_version,
  rendered_text_enc bytea NOT NULL, rendered_sha256 bytea NOT NULL,
  eligible_destinations jsonb NOT NULL  -- [{channel, masked, contactId}] resolved at create (hashed into snapshot)
  required_factors text[] NOT NULL      -- e.g. {SMS} | {SMS,EMAIL} | {SMS,DEVICE_KEY}
  send_count smallint, otp_expires_at, approved_at, execute_before, saga_expires_at, consumed_at,
  consent_record_id → consent_records NULL, ip inet, user_agent
  UNIQUE (subject_type, subject_id) WHERE status IN ('PENDING','SENT','APPROVED')
  CHECK (status NOT IN ('APPROVED','CONSUMED','CONSUMED_UNUSED') OR (approved_at IS NOT NULL AND consent_record_id IS NOT NULL))
consent_subjects  (challenge_id → consent_challenges ON DELETE CASCADE, subject_type text, subject_id uuid) PK(challenge_id,subject_type,subject_id)
  INDEX (subject_type, subject_id)      -- replaces covered_subjects jsonb; used by the consent guard trigger (MS-23)
```

### C.4 Onboarding

```
investor_profiles +std +actor  investor_id PK → investors
  pan_enc NOT NULL, pan_bidx UNIQUE NOT NULL, pan_last4, name_as_per_pan NOT NULL, dob_enc NOT NULL, birth_year,
  gender CHECK (MALE,FEMALE,TRANSGENDER), marital_status CHECK (MARRIED,UNMARRIED,OTHERS), father_or_spouse_type CHECK (FATHER,SPOUSE),
  father_or_spouse_name_enc, mother_name_enc NULL, occupation CHECK (…12 values…), income_slab CHECK (…6…), source_of_wealth CHECK (…8…),
  pep_status CHECK (NOT_APPLICABLE,PEP,RELATED_PEP), tax_status CHECK (RESIDENT_INDIVIDUAL) NOT NULL,
  nationality char(2), country_of_birth char(2), place_of_birth_enc, tax_resident_elsewhere boolean NOT NULL, us_person boolean NOT NULL,
  address_line1_enc, address_line2_enc, city, state, pincode char(6) CHECK (pincode ~ '^\d{6}$'), address_nature CHECK (RESIDENTIAL,BUSINESS),
  kyc_status CHECK (UNKNOWN,VALIDATED,REGISTERED,UNDER_PROCESS,ON_HOLD,REJECTED,DEACTIVATED,SUBMITTED),
  kyc_status_check_id → kyc_checks NULL,   -- MS-12: kyc_status may change only with a backing check row (trigger)
  readiness_code text, readiness_checked_at timestamptz, attributes_confirmed_at timestamptz
tax_residencies +std  investor_id → investors ON DELETE CASCADE, position smallint CHECK (1..3), country char(2), tin_enc, tin_type, UNIQUE(investor_id,position)
onboarding_applications +std  investor_id UNIQUE → investors,
  contacts_status, identity_status, profile_status, eligibility_status, kyc_status, bank_status, nomination_status, declarations_status,
  attest_status, provisioning_status  CHECK (NOT_STARTED,IN_PROGRESS,ACTION_REQUIRED,WAITING,MANUAL_REVIEW,DONE,FAILED,BLOCKED),
  kyc_path CHECK (EXISTING_VALID,FRESH,MODIFY,NONE), attest_challenge_id → consent_challenges NULL,
  provisioning_step CHECK (PROFILE,PHONE,EMAIL,ADDRESS,BANK,NOMINEES,MFIA,FOLIO_DEFAULTS,DONE),
  checkout_intent jsonb NULL, otp_roundtrips smallint DEFAULT 0, completed_at
onboarding_reviews +std +actor   -- MS-21, MS-29, admin overrides
  investor_id → investors, reason CHECK (PEP,RELATED_PEP,FATCA_US_CA,KYC_UNKNOWN_STATUS,PROVISIONING_4XX,BANK_LOW_CONFIDENCE,OTHER),
  status CHECK (OPEN,APPROVED,REJECTED), decided_by → admin_users NULL, approval_id → admin_approvals NULL, note text, decided_at
kyc_checks +std  investor_id, purpose CHECK (IDENTITY,READINESS_RECHECK,PERIODIC_RECHECK,QUOTE_RECHECK,BANK), fp_pre_verification_id UNIQUE,
  status CHECK (ACCEPTED,COMPLETED,FAILED), readiness_status, readiness_code, pan_status, pan_code, name_status, dob_status, bank_status, bank_code,
  response_meta jsonb (allow-listed), requested_at, completed_at
kyc_applications +std  investor_id, adapter CHECK (POA_KYC_FORMS,FP_KYC_REQUESTS), type CHECK (FRESH,MODIFY), provider_ref UNIQUE,
  identity_document_ref, esign_ref, status, fields_needed text[], proof_status, esign_status, signature_document_id → documents, expires_at, failure_reason
  UNIQUE (investor_id) WHERE status NOT IN ('submitted','successful','failed','expired','rejected')
bank_accounts +std +actor  investor_id, account_number_enc, account_number_bidx, account_last4 char(4),
  ifsc char(11) CHECK (ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'), bank_name, branch, account_type CHECK (SAVINGS), holder_name_enc,
  status CHECK (PENDING_VERIFICATION,VERIFIED,FAILED,MANUAL_REVIEW,DISABLED), verification_check_id → kyc_checks, name_match_score numeric(5,2),
  manual_approval_id → admin_approvals, verified_at, fp_bank_account_id UNIQUE, fp_bank_old_id bigint UNIQUE, is_primary boolean DEFAULT false,
  change_request_id → folio_service_requests NULL
  UNIQUE (investor_id, account_number_bidx, ifsc); UNIQUE (investor_id) WHERE is_primary AND status<>'DISABLED'
nominees +std +actor  investor_id, set_version int NOT NULL, position smallint CHECK (position BETWEEN 1 AND 10),   -- MED-4
  name_enc NOT NULL, name_length smallint CHECK (name_length<=40),                                   -- MS-14 FP limit
  relationship CHECK (…10…), dob_enc NULL, is_minor boolean NOT NULL, allocation_pct numeric(5,2) NOT NULL CHECK (allocation_pct>0 AND allocation_pct<=100),
  allocation_source CHECK (INVESTOR,EQUAL_SPLIT), id_type CHECK (PAN,AADHAAR_LAST4,DRIVING_LICENCE,PASSPORT) NOT NULL, id_value_enc NOT NULL,
  guardian_name_enc, guardian_relationship, guardian_id_type, guardian_id_value_enc, mobile_enc, email_enc NULL,
  sent_to_fp_fields text[] NOT NULL DEFAULT '{}', fp_related_party_id UNIQUE,
  status CHECK (DRAFT,EFFECTIVE,SUPERSEDED), UNIQUE (investor_id,set_version,position),
  CHECK (NOT is_minor OR (dob_enc IS NOT NULL AND guardian_name_enc IS NOT NULL AND guardian_id_value_enc IS NOT NULL))
  -- deferred trigger: Σ allocation_pct per set = 100.00; count ≤ app_config NOMINATION_MAX (= min(10, FP max))
nomination_decisions +std  investor_id PK, decision CHECK (NOT_ASKED,NOMINATED,OPTED_OUT), effective_set_version, display_preference, consent_record_id, decided_at
risk_profiles +std  investor_id, questionnaire_version, answers jsonb, score, category CHECK (…6…), completed_at, superseded_at
documents +std  investor_id NULL, kind CHECK (KYC_SIGNATURE,CAS_PDF,STATEMENT,CAPITAL_GAINS,ELSS_SUMMARY,ADMIN_UPLOAD,AUDIT_EXPORT,EVIDENCE_PACK),
  s3_key UNIQUE, sha256, content_type, size_bytes, retention_until NOT NULL, deleted_at
```

Aadhaar is never stored, not even the last 4 digits (C-22).

### C.5 Catalogue

```
amcs +std +actor  name UNIQUE, short_name, fp_fund_name UNIQUE, slug UNIQUE, empanelled, empanelment_ref, service_agreement, logo_approved,
  logo_s3_key, website_url, sid_index_url, accepts_us_ca boolean NOT NULL DEFAULT false (MS-21), active
sebi_categories  code PK, asset_class CHECK (EQUITY,DEBT,HYBRID,LIFE_CYCLE,OTHER,LEGACY), name, slug UNIQUE, sort_order, sebi_ref text NOT NULL (register key),
  cutoff_class CHECK (STANDARD,LIQUID,OVERNIGHT,INTERNATIONAL) NOT NULL, volatility_class CHECK (V_HIGH,V_EQUITY,V_HYBRID,V_DEBT,V_CASH) NOT NULL,
  subscription_open, short_period_returns
category_aliases  alias PK, source CHECK (AMFI,FP_OMS,MANUAL), category_code → sebi_categories
schemes +std +actor  isin char(12) UNIQUE CHECK (isin ~ '^INF[A-Z0-9]{9}$'), amfi_scheme_code UNIQUE, amc_id, name, slug UNIQUE, family_key,
  plan_type CHECK (REGULAR) NOT NULL, option CHECK (GROWTH,IDCW_PAYOUT,IDCW_REINVESTMENT), category_code NULL, lock_in_months, is_international, launch_date,
  fp_active, purchase_allowed, redemption_allowed, sip_allowed, switch_in_allowed, switch_out_allowed, stp_in_allowed, stp_out_allowed, swp_allowed,
  thresholds jsonb NOT NULL, sip_dates smallint[], status CHECK (DRAFT,PUBLISHED,SUSPENDED,MERGED), merged_into_isin, fp_synced_at, published_at,
  is_elss boolean GENERATED ALWAYS AS (category_code='EQ_ELSS') STORED; INDEX gin(name gin_trgm_ops); INDEX (category_code,status)
  -- publish trigger adds: an APPROVED scheme_tax_classes row effective today
scheme_tax_classes +std +actor   -- MS-18 (replaces category default)
  scheme_id → schemes, tax_class CHECK (EQUITY_ORIENTED,SPECIFIED_MF,OTHER) NOT NULL, effective_from date NOT NULL, effective_to date NULL,
  basis text NOT NULL (e.g. "SID asset allocation ≥65% domestic equity", CA note), source_doc_url text, approval_id → admin_approvals NOT NULL
  EXCLUDE USING gist (scheme_id WITH =, daterange(effective_from, effective_to,'[)') WITH &&)
fund_facts +std +actor  scheme_id PK, expense_ratio_pct, expense_ratio_as_of, riskometer, riskometer_as_of, benchmark_name, benchmark_riskometer, benchmark_cagr jsonb,
  prc_cell, exit_load_text, exit_load_rules jsonb, aum_cr, aum_as_of, fund_managers jsonb, objective, sid_url, kim_url, sai_url, factsheet_url,
  field_sources jsonb NOT NULL, completeness CHECK (INCOMPLETE,COMPLETE)
fund_facts_revisions (append-only)  scheme_id, source CHECK (AMFI,ADMIN,CYBRILLA,VENDOR), payload jsonb, created_at, created_by
commission_disclosures +std +actor  scheme_id, trail_pct_year1, trail_pct_year2_plus, upfront_pct DEFAULT 0, effective_from, source,
  status CHECK (DRAFT,PENDING_APPROVAL,PUBLISHED,SUPERSEDED), approval_id, UNIQUE (scheme_id,effective_from)
scheme_navs  isin PK, nav CHECK (nav>0), nav_date, prev_nav, prev_nav_date, source CHECK (AMFI,AMFI_HISTORY,MANUAL), quarantined, quarantine_reason,
  quarantined_nav, quarantined_nav_date, manual_approval_id, fetched_at
nav_history  (isin, nav_date) PK, nav CHECK (nav>0), source; INDEX brin(nav_date)
nav_sync_runs  kind, status CHECK (RUNNING,SUCCESS,FAILED,SKIPPED), started_at, finished_at, rows_parsed, rows_matched, rows_written, rows_quarantined, rows_future, max_nav_date, warnings text[], failure_reason
scheme_returns  scheme_id PK, as_of, abs_1w, abs_1m, abs_3m, abs_6m, cagr_1y, cagr_3y, cagr_5y, cagr_10y, cagr_si, sip_xirr_1y, sip_xirr_3y, sip_xirr_5y, display_eligible, computed_at
market_holidays  holiday_date PK, kinds text[] CHECK (kinds <@ ARRAY['EQUITY','MONEY_MARKET','BANK']), description, source, created_by
calendar_years  year PK, published_at, published_by
watchlist_items  (investor_id ON DELETE CASCADE, scheme_id) PK, created_at
ref_ifsc  ifsc PK, bank, branch, city, state, refreshed_at    -- RBI dataset, weekly job; no FP call from the api role
ref_pincodes  pincode PK, city, district, state, refreshed_at
```

`tax_rules` is removed. Holding-period rules are code constants in `packages/domain/tax/rules.v2026.ts` with golden vectors (MED-1).

### C.6 Orders, plans, payments and mandates (state lists come from §F.0; money invariants in bold)

```
folios +std  investor_id, amc_id, folio_number text, UNIQUE (investor_id, amc_id, folio_number),
  registered_contacts_enc bytea NULL, registered_mobile_bidx bytea[] , registered_email_bidx bytea[],   -- MS-01, from GET /v2/mf_folios
  registered_contacts_masked jsonb, payout_bank_masked jsonb NULL (ifsc, last4 from FP folio record; MS-02), contacts_synced_at,
  externally_modified boolean NOT NULL DEFAULT false, externally_modified_reason text, last_reconciled_at timestamptz,   -- MS-05
  reconciliation_status CHECK (UNRECONCILED,MATCHED,MISMATCH,FEED_UNAVAILABLE) DEFAULT 'UNRECONCILED'
folio_service_requests +std +actor   -- MS-02, MS-03
  investor_id, folio_id → folios NULL (NULL = platform-level), kind CHECK (NOMINATION_CHANGE,BANK_CHANGE,CONTACT_CHANGE),
  channel CHECK (MF_CENTRAL_GUIDED,OPS_RTA,FP_API), status (generated: REQUESTED,SUBMITTED_TO_RTA,CONFIRMED,REJECTED,CANCELLED),
  payload_enc bytea, consent_challenge_id → consent_challenges, approval_id → admin_approvals NULL (OPS_RTA maker-checker),
  rta_reference text, confirmed_evidence text (FP folio re-fetch diff / RTA ack), acknowledged_at timestamptz (ack sent only on CONFIRMED)
  UNIQUE (folio_id, kind) WHERE status IN ('REQUESTED','SUBMITTED_TO_RTA')
orders +std +actor
  investor_id, type CHECK (PURCHASE,REDEMPTION,SWITCH), origin CHECK (ONE_TIME,SIP_INSTALMENT,STP_INSTALMENT,SWP_INSTALMENT),
  plan_id → plans NULL, CHECK ((origin='ONE_TIME') = (plan_id IS NULL)), bundle_plan_id → plans NULL,
  scheme_id, switch_in_scheme_id NULL, CHECK ((type='SWITCH') = (switch_in_scheme_id IS NOT NULL)), folio_id → folios NULL,
  mode CHECK (AMOUNT,UNITS,ALL), amount numeric(18,2) CHECK (amount>0), units numeric(20,3) CHECK (units>0),
  CHECK (type<>'PURCHASE' OR (mode='AMOUNT' AND amount IS NOT NULL)),
  status (generated, §F.0 ORDER), consent_challenge_id → consent_challenges NULL, bank_account_id NULL,
  arn text NOT NULL CHECK (arn ~ '^ARN-\d{1,9}$'), euin text NULL, execution_only boolean NOT NULL DEFAULT true,
  initiated_via CHECK (web,mobile_web,mobile_app_android,mobile_app_ios), user_ip inet NULL,
  CHECK (origin<>'ONE_TIME' OR user_ip IS NOT NULL),               -- family rule is config (HIGH-5); no family CHECK
  expected_nav_date date, expected_nav_date_at_approve date, cutoff_class,
  fp_order_id UNIQUE, fp_old_id bigint UNIQUE, fp_state, fp_state_at,
  CHECK (origin<>'ONE_TIME' OR fp_order_id IS NULL OR consent_challenge_id IS NOT NULL),   -- plus trg_consent_guard (MS-23)
  allotted_units numeric(20,3), allotted_nav, allotted_nav_date, purchased_amount, stamp_duty, redeemed_units, redeemed_amount, redeemed_nav,
  switch_in_units, switch_in_nav, switch_in_amount, traded_on, units_source CHECK (PROVIDER,MANUAL,FEED),
  units_pending_since timestamptz NULL,                                   -- HIGH-1
  payout_status CHECK (NONE,EXPECTED,CONFIRMED,DELAYED) DEFAULT 'NONE', payout_expected_on date, payout_ref text, payout_confirmed_at,   -- MS-08
  grievance_id → service_requests NULL, submit_attempts int DEFAULT 0, failure_code, failure_reason, final_at
  INDEX (investor_id, created_at DESC); INDEX (status) WHERE final_at IS NULL
order_events (append-only)  order_id NULL, plan_id NULL, mandate_id NULL, from_status, to_status, trigger CHECK (API,WEBHOOK,POLL,JOB,OPS_REFETCH,FEED), provider_event_id, detail jsonb (allow-listed), occurred_at
plans +std +actor  investor_id, type CHECK (SIP,STP,SWP), scheme_id, switch_in_scheme_id NULL, folio_id NULL, amount CHECK (>0),
  frequency CHECK (MONTHLY,QUARTERLY), installment_day CHECK (1..28), number_of_installments CHECK (>0),
  first_installment_date_shown date, first_installment_date date NULL (set from FP on activation), next_installment_date, paused_until,
  mandate_id → mandates NULL, CHECK (type<>'SIP' OR mandate_id IS NOT NULL),     -- mandate row exists from draft (MED-5)
  status (generated, §F.0 PLAN), consent_challenge_id NOT NULL, cancel_challenge_id → consent_challenges NULL,
  arn, euin, execution_only, initiated_via, user_ip inet NOT NULL, fp_plan_id UNIQUE, fp_state, fp_state_at,
  cancellation_code, cancellation_reason, cancelled_by CHECK (INVESTOR,PROVIDER_AUTO,MANDATE_REVOKED), final_at
  CHECK (fp_plan_id IS NULL OR consent_challenge_id IS NOT NULL)
plan_modifications +std +actor  plan_id, kind CHECK (AMOUNT,MANDATE,PAUSE,PAUSE_REVOKE,CANCEL), new_amount, new_mandate_id, pause_from, pause_to,
  cancellation_code, cancellation_reason, status (generated, §F.0 PLAN_MOD), consent_challenge_id NOT NULL, fp_instruction_id UNIQUE, failure_reason
  UNIQUE (plan_id) WHERE status IN ('CONSENT_PENDING','CONSENTED','SUBMITTING','SUBMITTED','RECONCILING')
mandates +std +actor  investor_id, bank_account_id, rail CHECK (ENACH,UPI_AUTOPAY), limit_amount,
  CHECK (limit_amount>0 AND limit_amount<=10000000), CHECK (rail<>'UPI_AUTOPAY' OR limit_amount<=100000),
  status (generated, §F.0 MANDATE), consent_challenge_id NOT NULL, cancel_challenge_id NULL, cancelled_by CHECK (INVESTOR,EXTERNAL,PROVIDER) NULL,
  fp_mandate_id bigint UNIQUE, umrn, valid_from, valid_to, approved_at, rejected_reason
  CHECK (fp_mandate_id IS NULL OR consent_challenge_id IS NOT NULL)
payment_attempts +std  order_id, investor_id, attempt_no, method CHECK (UPI_INTENT,UPI_COLLECT,UPI_QR,NETBANKING), amount,
  status (generated, §F.0 PAYMENT), fp_payment_id bigint UNIQUE, return_channel CHECK (WEB,APP), return_token_hash UNIQUE, redirect_url_enc NULL,
  redirect_expires_at, upi_uri, postback_status (untrusted), failure_code, late_auth boolean DEFAULT false,
  refund_status CHECK (NONE,REFUND_PENDING,REFUNDED,REFUND_FAILED) DEFAULT 'NONE', refund_amount, refund_ref, refund_reason CHECK (ORDER_FAILED,ORDER_EXPIRED,TPV_FAILED,LATE_AUTH,REVERSAL,OTHER),
  refund_due_by date, refund_initiated_at, refunded_at                                         -- MS-07
  UNIQUE (order_id, attempt_no); UNIQUE (order_id) WHERE status IN ('CREATING','REDIRECTED','PENDING','RECONCILING'); UNIQUE (order_id) WHERE status='SUCCESS'
```

**Consent guard trigger (MS-23).** `trg_consent_guard` is a constraint trigger on orders (ONE_TIME only), plans, plan_modifications and mandates. It fires when `fp_*_id` goes from NULL to a value, when status moves to `SUBMITTING`, or when a cancel is submitted (mandates and plans, checked against `cancel_challenge_id`). It asserts all of the following:
- the challenge status is in (`CONSUMED`, `CONSUMED_UNUSED`);
- the challenge `investor_id` equals the row's `investor_id`;
- a `consent_subjects` row matches (`subject_type`, row id);
- `consumed_at <= now()`.

Otherwise it raises `P0001 consent_guard`.

### C.7 Portfolio

```
lots +std  investor_id, folio_id, scheme_id, source_order_id → orders NULL, source_adjustment_id → ledger_adjustments NULL,
  CHECK ((source_order_id IS NULL) <> (source_adjustment_id IS NULL)), UNIQUE (source_order_id),
  lot_type CHECK (PURCHASE,SIP_INSTALMENT,SWITCH_IN,STP_IN,ADJUSTMENT_IN), allotment_date date NOT NULL (= FP allotted_nav_date), nav,
  units numeric(20,3) CHECK (units>0), cost_amount CHECK (cost_amount>=0), stamp_duty,
  units_remaining numeric(20,3) CHECK (units_remaining>=0 AND units_remaining<=units), cost_remaining CHECK (cost_remaining>=0 AND cost_remaining<=cost_amount),
  lock_in_until date NULL (ELSS: addYears(allotment_date,3), Feb-29 → Feb-28), units_source CHECK (PROVIDER,MANUAL,FEED), cost_basis_known boolean NOT NULL,
  status CHECK (OPEN,CLOSED,REVERSED)
  INDEX (folio_id, scheme_id, allotment_date, id) WHERE units_remaining>0
lot_consumptions  id, lot_id, exit_order_id → orders NULL, adjustment_id NULL, units numeric(20,3) CHECK (>0), cost_amount, sale_amount, sale_nav, sale_date,
  holding_days int, gain_type CHECK (STCG,LTCG), tax_class text, tax_rule_version text NOT NULL, created_at, UNIQUE (lot_id, exit_order_id)
ledger_adjustments (append-only) +actor   -- MS-05 corporate actions and feed corrections
  id, investor_id, folio_id, kind CHECK (MERGER_ISIN_CHANGE,SEGREGATION,BONUS,EXTERNAL_PURCHASE,EXTERNAL_REDEMPTION,UNIT_CORRECTION,IDCW_REINVEST),
  from_scheme_id NULL, to_scheme_id NULL, units_delta numeric(20,3), cost_delta numeric(18,2), effective_date, evidence text NOT NULL,
  approval_id → admin_approvals NOT NULL, created_at
ledger_exceptions +std  -- T7
  investor_id, folio_id, scheme_id, order_id NULL, kind CHECK (UNITS_SHORTFALL,UNITS_UNKNOWN,FEED_MISMATCH,UNMATCHED_PROVIDER_OBJECT),
  expected_units, provider_units, delta, status CHECK (OPEN,RESOLVED), resolution_adjustment_id NULL
redemption_reservations +std  order_id → orders UNIQUE NULL, plan_id → plans NULL, instalment_date date NULL,
  CHECK ((order_id IS NULL) <> (plan_id IS NULL)), investor_id, folio_id, scheme_id, units_reserved numeric(20,3) CHECK (>0),
  status CHECK (ACTIVE,SETTLED,RELEASED), released_at, release_evidence text     -- released only on provider-terminal evidence (MS-04)
  UNIQUE (plan_id, instalment_date)
report_requests +std  investor_id, kind CHECK (CAPITAL_GAINS,TRANSACTION_STATEMENT,ELSS_SUMMARY,CONSENT_EVIDENCE), params jsonb,
  format CHECK (PDF,CSV,CSV_CLEARTAX,CSV_QUICKO), status CHECK (QUEUED,RUNNING,READY,FAILED,EXPIRED), document_id, caveats text[], completed_at, expires_at
```

`holding_snapshots`, `portfolio_snapshots` and the `v_sip_counts` view are removed. The dashboard is computed on read (§H).

### C.8 External holdings

```
cas_imports +std  investor_id, source CHECK (CAMS_KFINTECH), status CHECK (UPLOADED,PARSING,PARSED,FAILED,SUPERSEDED,DELETED),
  file_sha256, document_id NULL, retain_file boolean, statement_from, statement_to, rows_kept int, rows_discarded_other_pan int,   -- MS-22
  parser_version, notice_version text NOT NULL, consent_record_id NOT NULL, error_code, parsed_at; UNIQUE (investor_id) WHERE status='PARSED'
external_holdings +std  investor_id, cas_import_id ON DELETE CASCADE, amc_name, scheme_name_raw, isin NULL, scheme_id NULL, category_code NULL,
  folio_enc, folio_masked, plan_type CHECK (DIRECT,REGULAR,UNKNOWN), units numeric(20,4), statement_nav, statement_value, cost_value NULL,
  valuation_date, overlaps_platform_folio boolean
```

### C.9 Platform, notifications and privacy

```
idempotency_keys  (actor_id, key) PK, route, request_sha256, status CHECK (IN_PROGRESS,COMPLETED), response_status, response_body jsonb, expires_at
inbound_webhook_events  provider CHECK (FP), event_id, event_type, object_type, object_id, event_time, signature_valid boolean NOT NULL,
  signature_mode CHECK (RAW,REJSON,NONE), CHECK (signature_mode<>'NONE' OR current_setting('plz.env')='local'),     -- plus boot guard (MS-24)
  payload_enc bytea NULL, payload_sha256 bytea NOT NULL, CHECK (signature_valid OR payload_enc IS NULL),            -- rejected → metadata + hash only
  status CHECK (RECEIVED,PROCESSED,IGNORED,STALE,UNMATCHED,FAILED,REJECTED_SIGNATURE), attempts, processed_at, error, UNIQUE (provider,event_id)
provider_calls (append-only, unpartitioned)  provider, operation, correlation_id, aggregate_type, aggregate_id, http_status, duration_ms, error_code,
  request_meta jsonb, response_meta jsonb (allow-listed), body_enc bytea NULL (redacted by retention at 400 days), request_id, created_at
  INDEX brin(created_at); INDEX (aggregate_type, aggregate_id)
audit_events (append-only)  occurred_at, actor_type, actor_id, action, entity_type, entity_id, request_id, ip, user_agent, data jsonb (allow-listed), reason
  -- includes action='ADMIN_VIEW_INVESTOR' with reason code (MS-29)
recon_breaks  kind, entity_type, entity_id, severity CHECK (INFO,WARN,CRITICAL), detail jsonb, status CHECK (OPEN,ACKNOWLEDGED,RESOLVED),
  sla_due_at, resolved_by, resolution_approval_id NULL, note; UNIQUE (kind, entity_id) WHERE status<>'RESOLVED'
admin_approvals +std  kind CHECK (NAV_MANUAL,NAV_QUARANTINE_RELEASE,LEGAL_DOC_PUBLISH,CONSENT_TEMPLATE_PUBLISH,BANK_MANUAL_VERIFY,COMMISSION_PUBLISH,
    SCHEME_TAX_CLASS,MANUAL_UNITS,LEDGER_ADJUSTMENT,RECON_RESOLVE_CRITICAL,CONFIG_MONEY_FLAG,ARN_EUIN_POLICY,ONBOARDING_OVERRIDE,FOLIO_SERVICE_RTA_SUBMIT),   -- MS-13
  subject_type, subject_id, payload jsonb, evidence_ref text NULL (e.g. probe run id; required for CONFIG_MONEY_FLAG),
  maker_id, checker_id NULL, status CHECK (PENDING,APPROVED,REJECTED), reason, CHECK (checker_id IS NULL OR checker_id<>maker_id),
  CHECK (kind<>'CONFIG_MONEY_FLAG' OR evidence_ref IS NOT NULL)
app_config  key PK, value jsonb, updated_by, updated_at, approval_id NULL
  -- features.*, fp.*, NOMINATION_MAX, PLATFORM_ARN, EUIN_POLICY, KYC_ADAPTER, fp.userIpFamilies, consent.dualOtpPurchaseThreshold (₹1,00,000),
  --   cooling.bankChangeDays (10), cooling.contactChangeHours (72), min app versions
notifications +std  investor_id, category CHECK (TRANSACTION,SIP,KYC,SECURITY,STATEMENT,ACCOUNT,SERVICE_REQUEST), title, body (no PII), deep_link, read_at
notification_deliveries  notification_id, channel CHECK (PUSH,EMAIL,SMS), provider, provider_message_id, status CHECK (QUEUED,SENT,DELIVERED,FAILED), attempts, error, UNIQUE (notification_id, channel)
notification_preferences  investor_id PK, product_emails boolean DEFAULT false, push_enabled boolean
service_requests +std +actor  investor_id, type CHECK (DPDP_ACCESS,DPDP_CORRECTION,DPDP_ERASURE,CONSENT_WITHDRAWAL,ACCOUNT_CLOSURE,GRIEVANCE),
  source CHECK (INVESTOR,AUTO_PAYOUT_DELAYED,AUTO_REFUND_OVERDUE,OPS), status CHECK (OPEN,IN_PROGRESS,RESOLVED,REJECTED), due_at, legal_hold_until, resolution, assigned_to
product_events  id, investor_id NULL, anon_id, name, props jsonb (allow-listed keys), platform, app_version, created_at
worker_heartbeats  task_id PK, last_beat_at, version     -- MED-7
```

### C.10 PII encryption

| Item | Design |
|---|---|
| Choice | App-level envelope encryption with AWS KMS. pgcrypto is rejected because keys would pass through SQL and logs. |
| Keys | CMK `alias/plz-{env}-pii` wraps 256-bit DEKs. Keyring in Secrets Manager `plz/{env}/pii-keyring`, unwrapped at boot and held only in memory. Blind-index key in `plz/{env}/bidx-key`. |
| Cipher | AES-256-GCM, 12-byte IV. Format `0x01‖kid(2)‖iv‖tag‖ct`. **AAD = `table.column:rowId`**, with the rowId minted by the app before insert (C.1). |
| Blind index | HMAC-SHA256 over normalised values |
| Encrypted | PAN, DOB, mobile, email, all contact history, names (father/spouse/mother, holder, all nominee and guardian fields), place of birth, address lines, TINs, account numbers, external folio numbers, push tokens, device consent keys, webhook payloads, provider bodies, admin TOTP, **consent snapshots and rendered texts** (MS-09), folio registered contacts, service-request payloads, redirect URLs |
| Plain (RDS KMS at rest) | name_as_per_pan (display and search), city, state, pincode, IFSC, masked values, orders, lots, hashes |
| Templates | Render masked values only: PAN `••••1234F`, nominee initials plus relationship, account `••1234` (MS-09) |
| Rotation | Annual new kid; `crypto.reencrypt` batches |
| Erasure | After legal retention, `plz_retention` functions null the `*_enc` columns (including append-only tables) and keep the hashes |

### C.11 Retention

| Data | Retention |
|---|---|
| Profile, KYC, bank, nominees, orders, plans, lots, consents incl. delivery evidence, challenges, audit, folio service requests | 8 years after closure, then redacted (counsel OI-9) |
| otp_codes | 30 days. Delivery evidence is first copied into consent_records (MS-11). |
| Sessions | 90 days after expiry |
| idempotency_keys | 24 h |
| Webhook payload_enc, provider_calls body_enc | 400 days, then nulled; metadata kept 8 years |
| CloudWatch logs | 400 days (≥ 180 days in India, per CERTIN) |
| KYC signature | 30 days after KYC submission |
| CAS PDF | Hard-deleted after parse including failures (24 h cap; S3 prefix unversioned), or 1 year if the investor opts to keep it. The password is never stored. |
| external_holdings | Until the investor deletes them, or closure + 30 days |
| Generated reports | 7 days |
| notifications | 1 year |
| product_events | 13 months |
| Audit export (S3 Object Lock, compliance mode) | 8 years |

---

## D. API

### D.1 Contract approach
- **oRPC 1.15.4 contract-first** in `packages/contract`: `oc.route({method,path,tags}).input(zod).output(zod).errors({...})`. Nest implements it with `@Implement`, and guards, interceptors and CLS still apply.
- Clients use `@orpc/openapi-client` and `@orpc/tanstack-query`, with no codegen. Errors use oRPC's native typed shape (§B.5).
- `OpenAPIGenerator` writes a committed `apps/api/openapi.json`. CI fails on diff and on breaking changes. The document is served outside prod.
- **S0 gate (day 4):**
  - Fastify, cookie, guard, idempotency interceptor, `EdgeGuard` and OpenAPI export all work.
  - **A typed `.errors()` code round-trips through `OpenAPILink` into a TanStack `useMutation` `error.code` on both web and native.**
  - Fallback if the gate fails: Nest-native + nestjs-zod + @nestjs/swagger + openapi-fetch with the same Zod schemas (about 3 days).
- **Wire formats:**
  - money: string `^-?\d{1,16}\.\d{2}$`;
  - platform units: 3-dp string; external units: 4-dp string;
  - NAV: 6-dp string;
  - dates: `YYYY-MM-DD` (IST); instants: ISO UTC;
  - nullable money is `null`, never `"0.00"`.

### D.2 Conventions

| Topic | Rule |
|---|---|
| Base | Investor web and native: `https://app.sanchay.in/api/v1`. Admin: `https://ops.sanchay.in/api/v1/admin`. Webhooks: `https://app.sanchay.in/api/v1/webhooks/fp`. Hosts are enforced by `EdgeGuard`. |
| Versioning | `/v1` is additive only. Breaking change = new procedure plus 90 days of overlap. Native sends `x-app-version`; below the minimum → 426. |
| Pagination | Cursor: `limit` (default 20, max 100) and `cursor`. Response `{items,nextCursor}`. |
| Caching | Public catalogue: `public, max-age=300, stale-while-revalidate=3600` plus ETag. Authenticated: `private, no-store`. |
| Auth labels | P public · I investor session · **IP** investor with `can_purchase` · **IX** investor with `can_exit` · A:role · S signature/capability token · [K] Idempotency-Key required |

### D.3 Endpoints (prefix `/api/v1`)

**Public, meta and callbacks**

| M | Path | Purpose | Auth |
|---|---|---|---|
| GET | /meta/app-config | Min versions, public flags, ARN tagline, support contacts | P |
| GET | /legal/documents/{key} · /legal/commission-rates | Published documents · commission table | P |
| GET | /catalogue/categories · /catalogue/amcs · /catalogue/amcs/{slug} | Taxonomy, AMCs | P |
| GET | /catalogue/schemes | Search, filter and sort (q, assetClass, category, amc, riskometer, minSipMax, terMax, ageMinYears, elss, sipAvailable; sort name / ret1y / ret3y / ret5y / ter / aum) | P |
| GET | /catalogue/schemes/{slug} · /{slug}/nav-history?range= · /catalogue/suggest?q= | Detail with provenance, series (≤ 260 points), typeahead | P |
| POST | /events | First-party product events | P |
| POST | /webhooks/fp | FP events (FP-Signature) | S |
| POST | /payments/postback/{token} · /mandates/postback/{token} | Browser postback → re-fetch → 303 to web or app | S |
| GET | /kyc/return/{token} | DigiLocker/eSign return → refresh → 303 | S |

**Auth, session, devices and contacts**

| M | Path | Purpose | Auth |
|---|---|---|---|
| POST | /auth/otp | `{mobile}` → SMS OTP. The response always has the same shape (anti-enumeration) and includes `requiresEmailFactor` only after the SMS code verifies. | P |
| POST | /auth/otp/verify | `{mobile, smsCode, deviceRef}`. On a known device, or for a brand-new account → session. On a new device of an account with a verified email → `{stepUp: EMAIL}` and an email OTP is sent. | P |
| POST | /auth/otp/verify-email | New-device email factor → session (MS-06) | P (step-up token) |
| POST | /auth/otp/email-fallback | Known device only, when SMS is unavailable: login by email OTP | P |
| GET | /auth/session | Session and investor summary | I |
| POST | /auth/logout · /auth/sessions/revoke-all · DELETE /auth/sessions/{id} | Revocation | I |
| GET | /auth/sessions | Sessions and devices | I |
| POST | /devices/consent-key | Native: register the device consent secret (sent once over TLS, stored encrypted) | I [K] |
| POST | /devices/push-token | Expo push token | I |
| POST | /me/email/otp · /me/email/verify | Add and verify email | I [K] |
| POST | /me/contact-change | OTP to old and new contact → TPL_CONTACT_CHANGE challenge → platform contact updated. Also: 72 h exit cooling-off, old contacts notified, other sessions revoked, and per-folio guided service requests created (§G.5). | I [K] |
| POST | /me/bank-change | COB: penny drop with name match → TPL_BANK_CHANGE challenge (SMS **and** email OTP) → cooling-off (§G.5) | I [K] |
| GET · PATCH | /me · /me/preferences | Profile summary, preferences | I |

**Onboarding**

| M | Path | Purpose | Auth |
|---|---|---|---|
| GET | /onboarding | Checklist, stage, next action, checkout intent | I |
| PUT | /onboarding/intent | Save `{isin, kind, amount?}` (web gets it from the `?intent=` CTA parameter) | I |
| POST | /onboarding/identity | PAN, name, DOB + KYC consent → pre-verification job | I [K] |
| PUT | /onboarding/profile | Personal details, FATCA/CRS incl. `usPerson`, address (IFSC and pincode from the local ref tables) | I [K] |
| POST · GET | /onboarding/kyc/start · /onboarding/kyc | The single configured KYC adapter | I [K] · I |
| POST | /onboarding/kyc/geo · /kyc/signature · /kyc/proof-fetch/retry | Geo, signature (≤ 5 MB, magic bytes checked, EXIF stripped), retry | I [K] |
| GET | /ref/ifsc/{ifsc} · /ref/pincode/{pin} | Local reference tables | I |
| POST · GET | /onboarding/bank-accounts | Add the first account (penny drop) · list | I [K] · I |
| GET · PUT | /onboarding/nomination | Draft nominee set or opt-out, validated against the FP rules (no OTP here; covered by the attestation) | I · I [K] |
| GET · POST | /legal/pending · /onboarding/declarations | Pending documents · stage acceptances (recorded at attestation) | I · I [K] |
| POST | /onboarding/attest | One ONBOARDING_ATTEST challenge covering the review snapshot, declarations and nomination/opt-out (MED-2) | I [K] |
| GET · PUT | /risk-profile | Optional questionnaire | I |

**Consent (step-up)**

| M | Path | Purpose | Auth |
|---|---|---|---|
| GET | /consents/challenges/{id} | Rendered text, masked eligible destinations, required factors, expiry | I |
| POST | /consents/challenges/{id}/otp | Send or resend `{channel}` within the eligible destinations (30 s cooldown) | I [K] |
| POST | /consents/challenges/{id}/approve | `{accepted:true, otp:{sms?,email?}, deviceProof?: {installationId, hmac}, acknowledgedDocIds[]}` | I [K] |
| POST | /consents/challenges/{id}/cancel | Abandon | I |
| GET | /consents/records · /consents/records/{id}/evidence | History · evidence PDF (MS-10) | I |

**Orders, payments, plans, mandates and folio servicing** (mutations [K])

| M | Path | Purpose | Auth |
|---|---|---|---|
| POST | /orders/purchases/quote · /orders/purchases | Validate/preview (limits, stamp-duty estimate, NAV date, disclosures, appropriateness, TPV note) · draft + challenge | IP |
| POST | /orders/redemptions/quote · /orders/redemptions | Availability (unlocked, reserved, buffer, FP holdings pre-check) · draft + reservation + challenge | IX |
| POST | /orders/switches/quote · /orders/switches | Flag `features.switch` | IX (target leg checks `can_purchase`) |
| GET | /orders · /orders/{id} | List · detail with timeline, payout and refund status | I |
| POST | /orders/{id}/cancel · /orders/{id}/clone | Cancel before approve · clone after REJECTED/FAILED/CONSENT_EXPIRED/CANCELLED | I |
| POST | /orders/{id}/payments | Create attempt → `{attemptId}`. The redirect URL is produced by a worker job; poll `GET /payments/{attemptId}` (FP credentials are worker-only). | IP |
| GET | /payments/{attemptId} | Server-verified status, `redirectUrl \| upiUri` once ready, refund card | I |
| POST | /plans/sips/quote · /plans/sips | SIP + mandate (reuse or new) + optional investToday → one challenge | IP |
| POST | /plans/stps/quote · /plans/stps · /plans/swps/quote · /plans/swps | Flags | IX |
| GET | /plans · /plans/{id} · /plans/{id}/instalments | Lists, detail | I |
| POST | /plans/{id}/modify · /pause · /pause/revoke · /cancel | Plan changes → challenge | I |
| GET · POST | /mandates · /mandates/{id} · /mandates | List, detail, standalone setup | I · IP |
| POST | /mandates/{id}/authorize · /mandates/{id}/cancel | Authorise · cancel (refused while a live SIP uses it) | I |
| GET · POST | /folios · /folios/{id}/service-requests | Folios with registered contacts and payout bank (masked), reconciliation state · create a NOMINATION/BANK/CONTACT change request | I · I [K] |
| GET | /service-requests/folio/{id} | Status timeline | I |

**Portfolio, reports, CAS, watchlist, notifications and privacy** (I; mutations [K])

| M | Path | Purpose |
|---|---|---|
| GET | /portfolio/summary | Computed on read: invested, value, gains, XIRR/reason, `activeSips`, `pausedSips`, `settingUpSips`, monthly SIP, pending amounts, refunds due, coverage, as-of |
| GET | /portfolio/holdings · /portfolio/holdings/{folioId}/{isin} | Holdings · lots, lock-in schedule, availability, reconciliation flag, transactions |
| GET | /portfolio/allocation · /portfolio/transactions | Allocation · ledger view |
| GET | /reports/capital-gains?fy= · /reports/elss-summary?fy= | Previews with caveats |
| POST · GET | /reports · /reports/{id} · /reports/{id}/download | Queue · status · 5-minute presigned URL |
| POST · GET · DELETE | /external/cas-imports · /external/holdings | Upload (PDF + password + consent) · view · delete all |
| GET · PUT · DELETE | /watchlist · /watchlist/{schemeId} | Watchlist |
| GET · POST | /notifications · /notifications/{id}/read | Inbox |
| GET · POST | /privacy/requests · /privacy/consents/{key}/withdraw | DPDP rights, grievances |
| POST | /account/closure | Account closure (store requirement) |

**Admin** (`ops.sanchay.in/api/v1/admin/*`; cookie `__Host-sanchay_adm`; WAF IP allowlist; `EdgeGuard`)

| M | Path | Role |
|---|---|---|
| POST | /auth/login · /auth/totp · /auth/totp/enroll · /auth/logout | P → A |
| GET | /investors?q= · /investors/{id} (**every view is audited with a reason code**) | SUPPORT |
| POST | /investors/{id}/unmask `{field,reason}` | COMPLIANCE (TOTP step-up) |
| POST | /investors/{id}/onboarding/actions `{RETRY_STEP\|RECHECK_KYC\|MARK_MANUAL_REVIEW}` (no readiness override without ONBOARDING_OVERRIDE approval plus a check row) | OPS |
| GET · POST | /onboarding-reviews · /{id}/decide (PEP, FATCA US/CA) | COMPLIANCE |
| POST | /investors/{id}/sessions/revoke-all · /suspend · /fraud-hold · /reinstate | OPS · COMPLIANCE |
| POST | /bank-accounts/{id}/manual-verification (maker) | OPS |
| GET · POST | /approvals · /approvals/{id}/approve · /reject | COMPLIANCE (checker ≠ maker) |
| GET | /orders · /orders/{id} · /plans · /mandates · /payments (incl. provider calls, events) | SUPPORT |
| POST | /orders/{id}/refetch (same for plans, mandates, payments): **re-fetch and apply only; never a provider write** | OPS |
| POST | /orders/{id}/manual-units (maker, MANUAL_UNITS) | OPS |
| GET · POST | /folio-service-requests · /{id}/submit (maker, OPS_RTA) · /{id}/confirm · /{id}/reject | OPS |
| GET · POST | /ledger-exceptions · /ledger-adjustments (maker) | OPS |
| GET · PATCH · POST | /schemes · /schemes/{id} · /publish · /suspend · /tax-class (maker) | OPS |
| GET · PUT · POST | /schemes/{id}/facts · /facts/import · /commission-disclosures/import (maker) | OPS |
| GET · PUT | /categories · /category-aliases · /calendar/{year} (+ publish) | OPS |
| POST | /catalogue/fp-sync · /nav/sync | OPS |
| GET · POST | /nav/runs · /nav/quarantine · /nav/quarantine/{isin}/resolve (maker) | OPS |
| GET · POST | /legal-documents · /{id}/submit (maker) | COMPLIANCE |
| GET · POST | /recon-breaks · /{id}/resolve (CRITICAL → maker, RECON_RESOLVE_CRITICAL) | SUPPORT · OPS |
| GET · POST | /webhook-events · /{id}/replay · /jobs · /jobs/{id}/retry | OPS |
| GET | /audit-events · /consent-evidence/{orderId} | COMPLIANCE |
| GET · PATCH | /service-requests | COMPLIANCE |
| GET · PUT | /config (money flags and ARN/EUIN → maker with evidence) | SUPERADMIN (maker) + COMPLIANCE (checker) |
| GET · POST · PATCH | /users | SUPERADMIN |

### D.4 Error codes (`packages/contract/errors.ts`)

| Codes | HTTP |
|---|---|
| VALIDATION_FAILED | 400 |
| AUTH_REQUIRED, SESSION_EXPIRED, OTP_INVALID, OTP_EXPIRED, OTP_LOCKED, STEP_UP_REQUIRED | 401 |
| FORBIDDEN, ORIGIN_REJECTED, FEATURE_DISABLED | 403 |
| NOT_FOUND | 404 |
| CONFLICT_VERSION, IDEMPOTENCY_IN_PROGRESS, ORDER_STATE_INVALID, SCHEME_NOT_ORDERABLE, ONBOARDING_INCOMPLETE, PURCHASE_BLOCKED, EXIT_BLOCKED, KYC_NOT_VALIDATED, BANK_NOT_VERIFIED, MANDATE_REQUIRED, MANDATE_NOT_APPROVED, CONSENT_REQUIRED, CONSENT_EXPIRED, CONSENT_MISMATCH, CONSENT_ALREADY_USED, CONSENT_DESTINATION_UNAVAILABLE, SECOND_FACTOR_REQUIRED, PAYMENT_ATTEMPT_LIVE, PAYMENT_ALREADY_SUCCEEDED, REDEMPTION_CONFLICT_PENDING, PLAN_ACTIVE_ON_HOLDING, FOLIO_RECONCILIATION_REQUIRED, COOLING_OFF_ACTIVE, SERVICE_REQUEST_OPEN, DECLARATION_OUTDATED, PLAN_NOT_MODIFIABLE | 409 |
| IDEMPOTENCY_KEY_REUSED, AMOUNT_BELOW_MIN, AMOUNT_ABOVE_MAX, AMOUNT_NOT_MULTIPLE, UNITS_PRECISION, INSUFFICIENT_REDEEMABLE, ELSS_LOCKED, NAV_UNAVAILABLE, MANDATE_LIMIT_EXCEEDED, UPI_LIMIT_EXCEEDED, SIP_DAY_INVALID, NOMINATION_INVALID, ELIGIBILITY_BLOCKED, CLIENT_IP_UNSUPPORTED, CAS_PASSWORD_INVALID, CAS_PAN_MISMATCH, CAS_UNSUPPORTED | 422 |
| APP_VERSION_UNSUPPORTED | 426 |
| IDEMPOTENCY_KEY_REQUIRED | 428 |
| RATE_LIMITED, OTP_COOLDOWN | 429 |
| INTERNAL | 500 |
| PROVIDER_REJECTED (+ providerCode) | 502 |
| PROVIDER_UNAVAILABLE, SMS_UNAVAILABLE | 503 |

---

## E. Auth and sessions

### E.1 Hosts and the edge

| Host | Served by | Session |
|---|---|---|
| `www.sanchay.in` | CloudFront (cache) → ALB → web ECS `(public)` | None |
| `app.sanchay.in` | CloudFront (no-store; injects `x-sanchay-edge: app`) → ALB: `/api/*` → api; everything else → web `(auth)`/`(app)` | `__Host-sanchay_sid` (HttpOnly, Secure, SameSite=Lax, host-only) plus `__Host-sanchay_dev` (device ref, 400 days). Same origin, no CORS. |
| `ops.sanchay.in` | CloudFront: default → S3 (admin SPA, 404 → `/index.html`); `/api/*` → ALB (`x-sanchay-edge: ops`). WAF IP allowlist. | `__Host-sanchay_adm` (SameSite=Strict) |

**IP family (HIGH-5).** The config `fp.userIpFamilies` defaults to `["4"]` until probe **P-06** shows FP accepting an IPv6 `user_ip`. Until then:
- the app and ops distributions are IPv4-only (A records only, `IsIPV6Enabled=false`);
- if a non-IPv4 client IP ever reaches an order endpoint, the API returns 422 `CLIENT_IP_UNSUPPORTED` (never INTERNAL).

If P-06 passes (expected), dual-stack is switched on in S1 (AAAA records plus CloudFront IPv6), and `userIpFamilies=["4","6"]`. There is no DB family CHECK; `user_ip inet NOT NULL` for ONE_TIME orders. The CGNAT/464XLAT caveat (the IP identifies a carrier NAT, not a person) is documented for counsel in `docs/specs/regulatory-sources.md`.

Other edge rules:
- Client IP comes from `CloudFront-Viewer-Address`.
- The ALB accepts only the CloudFront prefix list plus the origin secret.
- Native uses `https://app.sanchay.in/api/v1` with a bearer token. Cookies are ignored when `Authorization` is present.

### E.2 Investor authentication

| Aspect | Decision |
|---|---|
| Factors | **Mobile SMS OTP, no passwords.** Sign-up and login share one flow. The DPDP notice is shown before mobile capture. Email is verified by OTP after first login and is required before onboarding. **New device (web browser without a known `__Host-sanchay_dev`, or a new native installation) with a verified email: SMS OTP + email OTP.** Known device: SMS OTP only. If SMS is down, a known device may use email OTP alone. A new device never logs in with email alone (MS-06). |
| OTP policy (ported) | 6 digits (`crypto.randomInt`), 5 min, 5 attempts, 30 s cooldown, one live code per scope, reference binding. `HMAC-SHA256(pepper, purpose\|dest_bidx\|ref\|code)` compared with `timingSafeEqual` (a deliberate change from `BE/service/OtpService.java:382-390`). The attempt increment commits in its own statement. No bypass path in any build. |
| SMS content (DLT) | Login: "{code} is your Platizio login OTP. Never share it; Platizio staff never ask for it. @app.sanchay.in #{code}" plus the Android SMS Retriever hash. Consent: "{code}: approve {ACTION} of ₹{amount} in {scheme-short} (folio ••{last4}) on Platizio. Never share this OTP." (MS-06). Templates are registered on DLT in S1–S2. |
| SMS provider | MSG91 only at launch (MED-1). The secondary provider is contracted but integrated after launch. During an SMS outage: email fallback for known-device login and for consent where email is an eligible folio destination. |
| Web session | Opaque 256-bit token (SHA-256 stored). Idle 30 min (warning at 25), absolute 12 h. **CSRF defence without a synchronizer token (MED-1):** SameSite=Lax, plus `Origin` must equal `https://app.sanchay.in`, plus `Sec-Fetch-Site: same-origin`, plus a required `x-sanchay-client: web` header on mutations (a cross-origin sender would need a preflight, and none is allowed). `proxy.ts` only redirects optimistically. |
| Native session | Opaque token in expo-secure-store (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`), sent with `x-installation-id`. Idle 30 days, absolute 90 days. **No rotation (HIGH-3):** the token is server-side, instantly revocable and bound to the installation id. Queries start only after the app-lock gate resolves. |
| App unlock | OS biometric or device credential on cold start and after 5 min in background. If the device has no screen lock: OTP on every cold start. |
| Revocation | Logout, per-device revoke, sign out everywhere, admin revoke, fraud hold, closure, contact or bank change (other sessions revoked, push to the remaining devices). Lookup cache is a 30 s LRU. Fraud hold and admin revoke also bump a `sessions_epoch` row that every request checks (≤ 1 s). |

### E.3 Admin authentication and RBAC
- Email + password (argon2id, m=19456, t=2, p=1, ≥ 12 characters, breached-password list) + **mandatory TOTP**.
- Lockout after 5 failures for 15 min. Idle 15 min, absolute 8 h. **No public signup**: bootstrap is the one-off ECS task `admin:create` (fixes v1 must-fix j).
- TOTP step-up for unmask, approve, config and users.

| Permission | SUPPORT | OPS | COMPLIANCE | SUPERADMIN |
|---|---|---|---|---|
| Masked 360 view (audited read), orders, webhooks, jobs | ✔ | ✔ | ✔ | ✔ |
| Onboarding retry/recheck, re-fetch, catalogue, facts, NAV sync, calendar, folio service-request handling; **maker** for NAV manual/quarantine, bank manual verify, commission, tax class, MANUAL_UNITS, LEDGER_ADJUSTMENT, RECON_RESOLVE_CRITICAL, FOLIO_SERVICE_RTA_SUBMIT | – | ✔ | ✔ | ✔ |
| **Checker** on every approval (≠ maker); legal-document maker; ONBOARDING_OVERRIDE maker; PEP/FATCA review decisions; unmask; audit; service requests; suspend/fraud hold | – | – | ✔ | ✔ |
| Flags/config/ARN/EUIN **maker** (the checker must be COMPLIANCE; money flags need an evidence_ref); admin users | – | – | – | ✔ |
| Create an order, plan, mandate or consent; re-submit a provider write | – | – | – | – (structurally impossible) |

### E.4 Step-up 2FA for transactions (separate from login)

**ConsentDestinationResolver (MS-01).** Given (investor, subject), it returns the eligible destinations:

| Case | Eligible destinations |
|---|---|
| Existing folio | `folios.registered_*` (from `GET /v2/mf_folios?folio_number=`; cached, **re-fetched when older than 24 h and always within the consent-create job path**; FP-SW) ∩ `investor_contacts` ever OTP-verified by this investor (CURRENT or PREVIOUS) |
| New folio ("NEW") | The CURRENT contacts, which are exactly the `folio_defaults` communication contacts |
| Account-level (contact change, bank change, onboarding attest) | CURRENT mobile and email |
| Empty set | 409 `CONSENT_DESTINATION_UNAVAILABLE`. Investor copy: "The AMC has a different mobile/email on folio ••1234. Update it at the AMC (guided) to transact on this folio." A guided CONTACT_CHANGE service request is created (§G.5). |

**Required factors:**

| Action | Web | Native |
|---|---|---|
| Purchase < ₹1,00,000, SIP registration, plan modify/pause | SMS OTP (email if SMS is unavailable and email is eligible) | OTP + **device key** |
| Exits (redemption, switch, SWP/STP registration), purchase ≥ ₹1,00,000, mandate cancel, contact change, bank change, folio service requests, onboarding attest | **SMS OTP + email OTP**, both to eligible destinations | OTP + device key |

**Device key (native):**
- At first login the app generates a 32-byte secret and stores it in expo-secure-store with `requireAuthentication: true` (biometric-gated). It is registered once through `/devices/consent-key`.
- At approve, the OS prompts for biometric, the app reads the secret and sends `HMAC(secret, challengeId‖snapshot_sha256)`, and the server verifies it.
- Result: possession of the installation plus inherence, independent of the SIM.

**FP consent payload.** Only the channels actually verified, with the folio-registered values: email and/or `isd_code` + mobile. This fixes v1's always-both claim (`BE/service/InvestorActionService.java:1048-1061`).

**Other rules:**
- SIP instalments are not re-challenged (SEBI-2FA-S).
- A session never substitutes for consent.
- The snapshot hashes the **eligible destination set** (masked, sorted), not the channel used. Falling back from SMS to email within the set does not change the hash. The channels actually verified are recorded in `consent_records.otp_channels_verified` (MS-26).

---

## F. Transactions

### F.0 Canonical state tables (`docs/specs/states.md` → `gen:states`; MED-5)

`★` = final. **RECONCILING** = the provider outcome is unknown. It never releases money or units. It exits only on re-fetched provider evidence.

| Aggregate | States | Allowed transitions (trigger) |
|---|---|---|
| ORDER (ONE_TIME purchase/redemption/switch) | CONSENT_PENDING, CONSENTED, SUBMITTING, UNDER_REVIEW, CONFIRMING, AWAITING_PAYMENT, PAYMENT_PENDING, PROCESSING, UNITS_PENDING, RECONCILING, SETTLED★, REVERSED★, REJECTED★, FAILED★, EXPIRED★, CANCELLED★, CONSENT_EXPIRED★ | CONSENT_PENDING→CONSENTED (approve) · CONSENT_PENDING→CANCELLED (investor/drafts.abandon/mismatch) · CONSENT_PENDING→CONSENT_EXPIRED (sweeper) · CONSENTED→SUBMITTING (job consume) · CONSENTED→CONSENT_EXPIRED (execute_before passed, no attempt) · CONSENTED→CANCELLED (hash mismatch at consume) · SUBMITTING→UNDER_REVIEW (FP create ok) · SUBMITTING→RECONCILING (timeout/5xx/ambiguous 4xx) · SUBMITTING→REJECTED (definitive FP 4xx validation, no object: T6 proves absence) · UNDER_REVIEW→CONFIRMING (review_completed/pending → consent PATCH) · CONFIRMING→AWAITING_PAYMENT (purchase, FP submitted) · CONFIRMING→PROCESSING (redemption/switch, FP confirmed) · AWAITING_PAYMENT↔PAYMENT_PENDING (attempt created/failed) · PAYMENT_PENDING→PROCESSING (attempt SUCCESS re-fetched) · PROCESSING→SETTLED (FP successful with units) · PROCESSING→UNITS_PENDING (FP successful, units null) · UNITS_PENDING→SETTLED (units arrive via re-fetch/feed/MANUAL approval) · {UNDER_REVIEW,CONFIRMING,AWAITING_PAYMENT,PAYMENT_PENDING,PROCESSING}→{FAILED,EXPIRED,REJECTED} (re-fetched FP terminal) · any non-final→RECONCILING (ambiguous) · RECONCILING→(the state matching re-fetched FP) · SETTLED→REVERSED (FP reversed) |
| ORDER (instalments) | PROCESSING, UNITS_PENDING, RECONCILING, SETTLED★, FAILED★, SKIPPED★, REVERSED★ | Created from FP events/sync at PROCESSING; then as above |
| PLAN (SIP/STP/SWP) | CONSENT_PENDING, CONSENTED, MANDATE_SETUP (SIP), SUBMITTING, UNDER_REVIEW, CONFIRMING, ACTIVE, PAUSED, MANDATE_REVOKED, RECONCILING, COMPLETED★, CANCELLED★, FAILED★, REJECTED★, CONSENT_EXPIRED★ | CONSENTED→MANDATE_SETUP (new mandate) or →SUBMITTING (approved mandate reused / STP / SWP) · MANDATE_SETUP→SUBMITTING (mandate APPROVED) · MANDATE_SETUP→FAILED (mandate REJECTED/EXPIRED, or 7-day window with no FP plan write) · SUBMITTING→UNDER_REVIEW / RECONCILING / REJECTED · UNDER_REVIEW→CONFIRMING→ACTIVE · ACTIVE↔PAUSED (skip active/completed) · ACTIVE/PAUSED→MANDATE_REVOKED (mandate cancelled externally) · MANDATE_REVOKED→ACTIVE (modification MANDATE completed) · MANDATE_REVOKED→CANCELLED (FP auto-cancel or investor) · ACTIVE/PAUSED→CANCELLED · ACTIVE→COMPLETED |
| PLAN_MOD | CONSENT_PENDING, CONSENTED, SUBMITTING, SUBMITTED, RECONCILING, COMPLETED★, FAILED★, REJECTED★, CANCELLED★, CONSENT_EXPIRED★ | linear, plus RECONCILING on ambiguity |
| MANDATE | CONSENT_PENDING, CONSENTED, SUBMITTING, CREATED, AUTH_PENDING, BANK_PENDING, APPROVED, CANCEL_SUBMITTING, RECONCILING, REJECTED★, CANCELLED★, EXPIRED★, CONSENT_EXPIRED★ | …, APPROVED→CANCEL_SUBMITTING (cancel consent consumed) · APPROVED→CANCELLED (FP cancelled externally; `cancelled_by=EXTERNAL`) |
| PAYMENT | CREATING, REDIRECTED, PENDING, RECONCILING, SUCCESS★, FAILED★, EXPIRED★ (refund lifecycle in `refund_status`) | §F.9 |
| CHALLENGE | PENDING, SENT, APPROVED, CONSUMED, CONSUMED_UNUSED★, EXPIRED★, SUPERSEDED★, CANCELLED★ (CONSUMED is final once subjects are final) | §F.2 |
| FOLIO_SR | REQUESTED, SUBMITTED_TO_RTA, CONFIRMED★, REJECTED★, CANCELLED★ | §G.5 |

The redemption **payout** is tracked in `orders.payout_status` (NONE → EXPECTED → CONFIRMED | DELAYED → CONFIRMED), not as extra order states. A test asserts that every transition named in §F.2–§F.10 appears in the table.

### F.1 Universal rules

1. **No FP write for an investor before a CONSUMED challenge on an identical snapshot.** Five layers enforce it:
   - the `ConsumedConsent` branded type;
   - the adapter `assertConsumed`;
   - the DB CHECKs plus `trg_consent_guard`;
   - hourly M1;
   - the daily tenant-wide M5 (§F.10).
2. Everything that can refuse runs at **quote and again at draft**, never after consent (v1 must-fix c, `BE/service/OrderService.java:1880-1892`). This covers:
   - `can_purchase` / `can_exit`, KYC age (> 30 days → QUOTE_RECHECK pre-verification);
   - orderability, thresholds and multiples;
   - availability plus FP holdings pre-check, ELSS lock;
   - mandate headroom, capability flags, appropriateness;
   - consent destinations, cooling-off windows, folio reconciliation;
   - FATCA eligibility, NAV grade.
3. Provider calls happen only in worker jobs (T2).
4. **Ambiguous outcomes → RECONCILING (MS-04).** Transport errors, timeouts, 5xx after retries and ambiguous 4xx (duplicate `source_ref_id`, 409) → T6 list-and-adopt → still unknown → RECONCILING. Leaving RECONCILING needs the FP object re-fetched (or FP listing proving absence twice, 10 min apart). Reservations are released only when FP shows `failed`, `cancelled` or `expired`, or proves the object absent.
5. **Webhook ordering (MS-24).** An event triggers a **re-fetch**; the re-fetched object's state is applied only if `canTransition(current, mapped)` holds. `event.time` is recorded but never used for ordering. The same mapped state twice is idempotent.

### F.2 Consent engine and canonical snapshot (fixes must-fix a and b; MED-6)

| Step | Tx | Behaviour, in exact order |
|---|---|---|
| create | the draft tx | INSERT the subjects (app ids) → re-select with joins → `ConsentDestinationResolver` (the folio contacts must already be fresh; see "Consent create flow" below) → `buildSnapshot` (JCS, SHA-256) → render the text from the snapshot with the published template → supersede any live challenge → INSERT the challenge (PENDING, `snapshot_enc`, `rendered_text_enc`) + `consent_subjects` rows |
| sendOtp | own tx | Channel must be in `eligible_destinations`. OTP bound to the challenge. Status SENT, `otp_expires_at = now + 5 min`. |
| approve | **one tx** | (1) Lock the challenge FOR UPDATE; check SENT, not expired, owner, `accepted=true`, acknowledgements. (2) Verify the required factors: OTPs (attempt counter committed separately) and device HMAC. (3) **Recompute the snapshot from the DB and compare with `timingSafeEqual`.** On mismatch: set status SUPERSEDED + audit event, **commit**, return `CONSENT_MISMATCH`. No consent_record is written. (4) Re-render the NAV-date line against `now` (MS-15). (5) INSERT the consent_record (encrypted text, approve-time rendering, snapshot sha, channels verified, delivery evidence copied from otp_codes, second factor, IP/UA/session/device). (6) APPROVED; `execute_before = approved_at + 15 min`; `saga_expires_at = approved_at + 60 min` (7 days for SIP with a new mandate). (7) Subjects → CONSENTED; enqueue `*.submit`. |
| consume | first submit attempt, FOR UPDATE | Requires APPROVED, `now ≤ execute_before` and a matching hash. Sets CONSUMED and returns `ConsumedConsent`. Commit, then the FP call. If `execute_before` passes before the first attempt → EXPIRED, subjects → CONSENT_EXPIRED (nothing was written). |
| useConsumed | **every retry** and every later saga write | Requires CONSUMED, subject in `consent_subjects`, `now ≤ saga_expires_at`, and a matching hash. **Before a retry: T6 lookup by `source_ref_id`; if the object exists, adopt it and do not re-create.** |
| retry ladder | job | 30 s, 1 m, 2 m, 5 m, 10 m, 15 m (cumulative ≈ 33.5 min), **capped at `saga_expires_at`**. After the cap: no further **writes**. If any FP create was attempted → RECONCILING (never FAILED); if none was attempted → CONSENT_EXPIRED. |
| provider rejects after consume | job | Definitive FP rejection (object in `failed`, or validation 4xx with absence proven) → challenge CONSUMED_UNUSED, subject REJECTED, one-tap clone and re-consent |
| sweeper | `*/5` | SENT past OTP expiry + 10 min → EXPIRED. APPROVED past `execute_before` with no attempt → EXPIRED, subjects CONSENT_EXPIRED. |

**Consent create flow for folio orders.** The draft endpoint enqueues `folio.contacts.refresh` when `contacts_synced_at` is older than 24 h. The quote endpoint does this in advance, so the create normally finds fresh data. If the data is stale at create, the challenge is created in PENDING with `send blocked` until the refresh job completes (typically < 3 s; the client polls). The API role never calls FP.

**Snapshot fields** (no volatile timestamps; decimals as fixed-scale strings):
- `schema:"sanchay.consent.v2"`, type, subjectId, `coveredSubjects` (sorted), investorId
- `scheme{isin, name, amc, category, planType:"REGULAR", option, riskometer}`, and for a switch/STP both schemes and both riskometers
- `mode`, amount (2 dp) / units (3 dp) / `"ALL"`, `folio|"NEW"`
- `bank{ifsc,last4,role:"DEBIT"|"PAYOUT"}`. **For exits, PAYOUT comes from `folios.payout_bank_masked` (FP folio record), never from our primary account (MS-02).**
- `cutoff{class, ruleVersion}` (the date is rendered, not hashed)
- stamp-duty basis, exit-load text, `elss{lockInNote, lockedUnits}`
- plan terms `{frequency, installmentDay, instalments, firstInstalmentRule:"first eligible installment_day ≥ registration + 2 days"}` (the date is shown but not hashed; MS-15), mandate `{rail, limit, bankLast4}`, `investToday{amount}|null`
- `distribution{arn, euin|null, executionOnly:true, declarationSha256}`, `regularPlanDisclosureVersion`
- `nominee{initialsAndRelationships|"OPTED_OUT"}` for a new folio
- `appropriateness{warningShown, ackSha256|null}`
- `destinations[{channel, masked}]` (the eligible set), `requiredFactors`
- `template{key, version, sha256}`

**Property test:** `hash(snapshotFromDb(insert(x))) === hash(snapshotFromDb(reload(x)))` on PG18. This is the regression test for the v1 nanosecond/microsecond bug (`BE/common/BaseEntity.java:25-30`).

**Templates:**
- Every template includes the AMFI execution-only declaration verbatim (AMFI-MFD) and the Regular-plan/commission sentence.
- Redemption, switch and SWP templates name the payout bank from the folio record.
- SIP templates state the mandate terms, the 7-day registration window, and that the first instalment date is re-confirmed after registration.

### F.3 ARN, EUIN, execution-only and IP (every order, plan and instruction)

| Field | Value |
|---|---|
| ARN | `PLATFORM_ARN` (changed only through ARN_EUIN_POLICY maker-checker) snapshotted into orders and plans. **Attribution is verified by probe P-05**: a sandbox order's ONDC/RTA view must carry the platform ARN (e.g. the `partner` field). If ARN is attached at tenant level, record that as evidence. If not, send it in the payload field Cybrilla specifies (Q-C8). **Real-money gate G6.** |
| EUIN | `EUIN_POLICY=EXECUTION_ONLY` (default): `euin=null`, and P-04 confirms the ONDC message carries no auto-filled EUIN. `DESIGNATED_EUIN`: sends `PLATFORM_EUIN`, with NISM/EUIN validity checked at boot. **Hard gate G2 before real money:** counsel OI-1 (does the OTP-accepted declaration count as "separately signed"? what do AMCs expect so blank EUIN is "exceptional"?) plus Cybrilla Q-C1. |
| Declaration evidence (MS-10) | Per order: `GET /admin/consent-evidence/{orderId}` and the investor `/consents/records/{id}/evidence` produce a PDF with the declaration text, snapshot hash, channels verified, masked destinations, provider message ids and DLR, IP, device, timestamps and the FP consent PATCH response id. |
| execution_only | true |
| initiated_by / via | `investor` / `web \| mobile_web \| mobile_app_android \| mobile_app_ios` |
| user_ip | Real client IP from the edge, family per `fp.userIpFamilies` (§E.1) |
| source_ref_id | orders.id / plans.id / plan_modifications.id / mandates.id |

### F.4 Lumpsum purchase

The flow follows the ORDER table in §F.0:
1. Draft (CONSENT_PENDING).
2. Approve.
3. `orders.submit` consumes and calls `POST /v2/mf_purchases {mf_investment_account, scheme, amount, folio_number?, user_ip, source_ref_id, gateway:"ondc", initiated_by, initiated_via}`.
4. On `review_completed` or poll `pending` → PATCH `{id, consent}` (channels verified), then PATCH `{id, state:"confirmed"}` (both under `useConsumed`).
5. AWAITING_PAYMENT → payment (§F.9) → PROCESSING.
6. FP `successful`:
   - with `allotted_units`: SETTLED. The tx writes the lot (allotment_date = `allotted_nav_date`) and folio, `stamp_duty = amount − purchased_amount`, and notifies.
   - without units: **UNITS_PENDING**, no lot, and the dashboard shows "Units being confirmed by the AMC".
7. `orders.units.reconcile` re-fetches every 2 h and applies FEED units (§H).
8. **SLA alert: UNITS_PENDING > T+3 business days → WARN; > T+5 → CRITICAL.**

Other outcomes:
- FP `reversed` → REVERSED: the lot is reversed if untouched; otherwise a CRITICAL break.
- Payment received but the order later fails or expires → refund lifecycle (§F.9).

UX: after OTP the client polls every 1.5 s for 30 s with live steps, then the payment sheet opens. If review takes longer: "We'll notify you", push and SMS, and a **Pay now** button.

**TPV copy on every payment sheet:** "Pay only from A/c ••1234 (HDFC). Payments from other accounts are refunded by the AMC."

### F.5 SIP registration, mandates, instalments and SIP management

**Checkout:**
- One challenge (SIP_REGISTRATION or SIP_WITH_PURCHASE) covers the plan, the mandate (reused APPROVED with headroom, or a new row created at draft) and the optional "Also invest today" (default OFF).
- The rail defaults to UPI Autopay when the instalment is ≤ ₹1,00,000 and `fp.upiAutopay` is proven. Otherwise eNACH. The investor can switch.
- Limits: eNACH `min(₹1,00,00,000, max(₹1,00,000, ceil(2×instalment)))`; UPI ₹1,00,000.
- Headroom: Σ ACTIVE/PAUSED SIP amounts on the mandate + new amount ≤ limit.
- First instalment: first allowed `installment_day` (1–28 ∩ `sip_dates`) ≥ **registration date + 2 days**. It is shown before consent as "expected", **re-computed at registration, and the investor is notified if it moved** (MS-15).
- `number_of_installments` default 360, ≥ `installments_min`. MONTHLY; QUARTERLY behind `fp.sipQuarterly` (proven in P-09 or escalated per PO-2).
- No `generate_first_installment_now`.

**Plan and mandate:** per the §F.0 PLAN and MANDATE tables.

| Call | Endpoint | Guard |
|---|---|---|
| Mandate create | `POST /api/pg/mandates {mandate_type, bank_account_id: fp_bank_old_id, mandate_limit, provider_name:"CYBRILLAPOA"}` | `useConsumed` |
| Authorise | `POST /api/pg/payments/emandate/auth` → eNACH `token_url` / UPI `upi.uri` | — |
| Plan create | `POST /v2/mf_purchase_plans {…, frequency, installment_day, number_of_installments, systematic:true, payment_method:"mandate", payment_source, source_ref_id, user_ip}` → PATCH `{consent, state:"confirmed"}` | `useConsumed` |

**Mandate revoked outside the app (MS-28).** A mandate event or poll showing FP `cancelled` that we did not initiate:
- mandate → CANCELLED (`cancelled_by=EXTERNAL`);
- linked ACTIVE/PAUSED SIPs → **MANDATE_REVOKED**;
- push, SMS and email: "Your bank/UPI mandate was cancelled from outside Platizio. Set up a new mandate to keep your SIP running";
- the CTA runs a MANDATE plan modification.

**Instalments:** created from `mf_purchase.*` events and `plans.instalments.sync` as `orders(origin=SIP_INSTALMENT)` at PROCESSING, then SETTLED / UNITS_PENDING / FAILED / SKIPPED. After 2 consecutive failures, warn about auto-cancel.

**Plan changes:**

| Kind | FP call | Rules |
|---|---|---|
| AMOUNT (launch meaning of "top-up", PO-6) | `POST /v2/mf_plan_modification_instructions {plan, amount, consent}` | Within SIP thresholds; ≤ mandate limit (otherwise prompt for a new mandate); next instalment ≥ 2 days away |
| MANDATE | same with `payment_method`, `payment_source` | Once per plan (FP rule). Also the recovery path for MANDATE_REVOKED. |
| PAUSE | `POST /v2/mf_purchase_plans/{id}/skip_instructions {from,to}` | `features.sipPause` enabled only on P-09 evidence (CONFIG_MONEY_FLAG). `from` ≥ today + 2; 1–3 months. |
| PAUSE_REVOKE | `POST …/skip_instructions/{id}/cancel` | While pending |
| CANCEL | `POST /v2/mf_purchase_plans/cancel {id, cancellation_code, cancellation_reason?}` | Copy: "AMC completes within 2 working days. An instalment due within the next 2 working days may still be debited." (MS-28) |

All plan changes go through the consent saga (counsel OI-7 conservative default). **There is no pause fallback that counts as pause.** If P-09 fails, SIP pause is a PO-2 escalation.

### F.6 Redemption

**Quote (no writes):**
- The folio must be a platform ONDC folio. CAS holdings are never redeemable.
- `folios.externally_modified=true` or `reconciliation_status=MISMATCH` → ALL is refused, and the AMOUNT maximum is capped at min(ledger, FP) (MS-05).
- **FP holdings pre-check:** `FpGateway.getHoldings(mfia)` (FP-RED). `redeemable_units` must be ≥ the ledger's unlocked units; otherwise the folio is flagged and a recon break raised.
- `available = Σ unlocked units_remaining − Σ ACTIVE reservations`. The reservations cover: ACTIVE order reservations **until SETTLED (including SUBMITTED/PROCESSING exits)**, plus reservations for the next instalment of every ACTIVE SWP/STP whose date ≤ expectedNavDate + 7 days (MS-16).
- Unlocked (strict, MS-17): `lock_in_until` IS NULL or `expectedNavDate(redemption) > lock_in_until`.
- NAV grade must be OK for AMOUNT mode; otherwise `NAV_UNAVAILABLE`, and UNITS/ALL only.

**Buffer function (`packages/domain/availability.ts`):**
- `n` = business days from the latest NAV date to the expected NAV date (≥ 1).
- `buffer = min(10%, max(2%, 3 × σ[volatility_class] × √n))`, with σ: V_HIGH 1.5% (small/mid/sectoral/thematic/international), V_EQUITY 1.2%, V_HYBRID 0.6%, V_DEBT 0.2%, V_CASH 0.02%.
- Max amount = `floor2(available × latestNav × (1 − buffer))`.

**Modes:**
- AMOUNT;
- ALL (refused if an ACTIVE reservation exists, or an ACTIVE SWP/STP exists on the holding: `PLAN_ACTIVE_ON_HOLDING` "Stop your SWP/STP first");
- UNITS only with `features.redeemByUnits` (proven by P-09), ≤ 3 dp, a multiple of `units_multiple`.

Also shown: thresholds, exit-load estimate per FIFO lot age, and expected credit date (T+3 working days, T+5 international).

**"Redeem all" with locked ELSS lots (MED-8):**
- If UNITS mode is proven: send the exact unlocked units (3 dp).
- Otherwise: send `floor2(unlocked_units × latestNav × (1 − buffer))`, with the disclosure "A small balance may remain; you can redeem it with one tap after this completes". After settlement, if unlocked residual units > 0.001, show a **Redeem remaining** action (UNITS or AMOUNT).
- Golden vectors cover NAV −3%, 0 and +3% between quote and allotment.

**Draft tx:**
- `pg_advisory_xact_lock` on (folio, scheme), then re-compute availability.
- `reserved = ceil3(amount / latestNav × (1 + buffer))`, or the units, or all unlocked.
- INSERT the reservation (ACTIVE). Then the challenge.

**Approve tx:** re-check availability under FOR UPDATE of the lots and reservations.

**FP calls:**
- `POST /v2/mf_redemptions {…, amount | units | neither for all (only when no locked lots and folio MATCHED), folio_number, gateway:"ondc", source_ref_id, user_ip}`;
- FP `pending` → PATCH `{consent}` + `{state:"confirmed"}`.

**Settlement:**
- FP `successful` → `Ledger.applyExit(redeemed_units)` FIFO over unlocked lots → reservation SETTLED → order SETTLED, `payout_status=EXPECTED`, `payout_expected_on = T+3 working days` (T+5 international).
- **If the ledger has fewer units than FP redeemed:** consume what exists, write a `ledger_exceptions(UNITS_SHORTFALL)`, set the folio `externally_modified`, raise a CRITICAL break, and **never roll back** (T7).

**Payout (MS-08):**
- `payout_status=CONFIRMED` only on evidence: the FP redemption payout reference, the RTA feed payout record, or bank credit reference fields.
- `payout.watch` (daily 10:00): EXPECTED past `payout_expected_on` → DELAYED, a WARN recon break, an auto GRIEVANCE service request, and investor copy: "Your redemption money is late. The AMC must pay interest at 15% p.a. for delays beyond the regulatory deadline (SEBI-MC). We've raised it with the AMC; you can also escalate at the AMC or SCORES" (with links).

**Failure:** only re-fetched FP `failed` / `cancelled` / `expired` → FAILED / CANCELLED / EXPIRED, with the reservation RELEASED and the evidence recorded. Ambiguity → RECONCILING (§F.1).

### F.7 Switch, STP and SWP (flags enabled only on probe evidence; PO-2 escalation otherwise)

| Flow | FP resource | Specifics |
|---|---|---|
| Switch | `/v2/mf_switches` → PATCH `{consent}`, `{state:"confirmed"}` | Same AMC and folio. `switch_out_allowed` ∧ target `switch_in_allowed`. The out leg follows every redemption rule (advisory lock, reservation, strict ELSS, buffer, FP pre-check). The in leg follows purchase minimums and **the investor's `can_purchase`**. On success one tx consumes out-lots and creates a SWITCH_IN lot (`lock_in_until` set if the target is ELSS). Snapshot covers both schemes. |
| STP | `/v2/mf_switch_plans` | Plan machine without MANDATE_SETUP. Instalments are switch orders. The out-scheme may be ELSS only for unlocked units (the registration check simulates 12 instalments). STP_IN lots into ELSS are locked. Reserves its next instalment (§F.6). |
| SWP | `/v2/mf_redemption_plans` | Same ELSS rule. Instalments are redemption orders with payout tracking. Warns that each instalment is a taxable redemption. Reserves its next instalment. |

### F.8 NAV cut-off and ELSS (fixes must-fix e and f)

**`expectedNavDate({receivedAt, cutoffClass, kind, calendar})`** (paragraph references re-mapped by counsel in S1; SEBI-MC):
- STANDARD purchase: the day funds are realised (15:00).
- LIQUID/OVERNIGHT purchase: by 13:30 → the previous calendar day's NAV.
- Redemption STANDARD: by 15:00 → the same business day, otherwise the next.
- LIQUID redemption: the day before the next business day.
- OVERNIGHT online redemption: cut-off 19:00.
- INTERNATIONAL: "as per SID", no prediction.
- Business days exclude money-market holidays.

**It is informative, not blocking:**
- The class and rule version are hashed.
- The date is rendered at draft **and re-rendered at approve** (both kept, MS-15).
- On the payment sheet: "NAV date depends on when your payment reaches the AMC", plus a live expected date.
- `cutoff.monitor` raises **WARN** when `allotted_nav_date > expected_nav_date_at_approve`, and INFO when it is earlier.

**ELSS (MS-17):**
- `lock_in_until = addYears(allotted_nav_date, 3)`, with 29-Feb → 28-Feb.
- A lot is redeemable iff `expectedNavDate(exit) > lock_in_until` (strict, one day more conservative than the anniversary). Counsel/RTA confirmation (OI-11) may relax it to `≥` through a config flag with maker-checker.
- Applied at quote, draft and approve, for PURCHASE, SIP_INSTALMENT, SWITCH_IN, STP_IN and ADJUSTMENT_IN lots.
- Golden vectors: 29-Feb, month-end, holiday-adjacent, 15:00 boundary.

### F.9 Payment attempts, refunds and TPV (MS-07)

| From | Trigger | To |
|---|---|---|
| — | POST /orders/{id}/payments. Checks: order AWAITING_PAYMENT, no live/SUCCESS attempt, **FP pre-check `GET /api/pg/payments?amc_order_ids=<old_id>` shows nothing PENDING/SUCCESS/INITIATED/APPROVED**. Job: `POST /api/pg/payments/netbanking {amc_order_ids, method, bank_account_id, payment_postback_url, provider_name:"ONDC", upi?}` | CREATING → REDIRECTED (`redirect_url_enc` set; client polls) |
| REDIRECTED | postback `pending` or first poll | PENDING |
| REDIRECTED, PENDING | server GET: SUCCESS/INITIATED/APPROVED | SUCCESS (postbacks never trusted) |
| REDIRECTED, PENDING | FP FAILED | FAILED |
| REDIRECTED, PENDING | 30 min (UPI) / 20 min (netbanking) with no terminal status, **and a final re-fetch shows no success** | EXPIRED |
| any | ambiguous GET | RECONCILING (re-polled) |

**Refunds:**
- `refund_status=REFUND_PENDING` whenever money was received (attempt SUCCESS, or FP `late_auth` after we EXPIRED) and the order ends FAILED/EXPIRED/REVERSED, or FP reports a TPV failure.
- `refund_due_by = +5 working days`. Evidence from FP `refund_*` fields sets REFUNDED with `refund_ref`.
- Past `refund_due_by`: `REFUND_OVERDUE` WARN break plus an auto grievance.
- Investor card: "Refund of ₹X in progress (expected by DD MMM)".

**Orphans:**
- An FP success with no row → adopt as SUCCESS plus WARN `PAYMENT_ORPHAN`.
- **Nightly `payments.recon`** pulls the FP payments list for every non-final or FAILED/EXPIRED order from the last 30 days, catching money received on failed orders.

Copy: "Your bank/UPI app will show Cybrilla".

### F.10 Webhooks and reconciliation

**Ingest:**
- Fastify raw-body parser. Verify `FP-Signature: <secretId>:<b64 HMAC-SHA256>` over the raw body, falling back to re-serialised JSON (FP sample), with `timingSafeEqual`.
- **A boot guard refuses `signature_mode=NONE` outside local.**
- Invalid signature → metadata + `payload_sha256` only (no payload), 401, alert above 5 per hour.
- Valid → `INSERT … ON CONFLICT (provider,event_id) DO NOTHING` (fixes must-fix d; v1 is in-memory, `BE/controller/CybrillaWebhookController.java:34-50`) and enqueue `fp.event.process` in the same tx. Respond 200 in < 100 ms.
- WAF: `/webhooks/fp` is exempt from the per-IP rule. If Cybrilla publishes source ranges, an IP allowlist is added (Q-C14).

**Process:** route by object → **re-fetch** → apply per §F.1.5. Unknown id → retry 3 times over 10 min → UNMATCHED plus a break.

**Reconcile:**
- `fp.reconcile.nonfinal`: age-banded, and covers RECONCILING and UNITS_PENDING.
- `fp.reconcile.events`: every 15 min.
- `recon.fp.orders`: nightly.
- **`recon.fp.tenant` (daily 02:30, MS-19):** reads FP tenant-level list reports (`/v2/mf_purchases/reports/mf_purchase_list`, `/v2/mf_redemptions/reports/mf_redemption_list`, switch and plan lists; exact endpoints confirmed by P-14) for the last 3 days. **Any FP object whose `source_ref_id` is not ours, or whose subject has no CONSUMED challenge → M5 CRITICAL page.**
- `recon.holdings` (daily, §H).

**SLA alerts:**
- UNDER_REVIEW > 30 min;
- PROCESSING > T+2 business days;
- UNITS_PENDING > T+3 / T+5;
- mandate BANK_PENDING > 2 days;
- RECONCILING > 2 h (WARN) / 24 h (CRITICAL);
- REFUND_OVERDUE; PAYOUT_DELAYED.

---

## G. Onboarding

### G.1 Steps (one pure `deriveOnboardingStage`; screens written once in `packages/features/onboarding`)

| # | Screen | Completion rule | Target |
|---|---|---|---|
| 0 | Browse on www (no account). **Invest/Watch** links to `app.sanchay.in/app/invest/{slug}?intent=invest` or `/app/watchlist?intent=watch&isin=`. The intent is saved server-side after login (MIN-1). | — | — |
| 1 | Mobile → OTP (privacy notice first) → email → OTP | Real OTP round-trips (CV-01) | 90 s |
| 2 | PAN, name as on PAN, DOB, KYC consent | POA pre-verification: pan, name and DOB verified | 40 s + ≤ 15 s async |
| 3 | About you (gender, marital status, father/spouse, occupation, income, source of wealth, PEP); tax (birth country and place, nationality, **US person / US or Canada tax residency**, other residency + TIN ≤ 3, FATCA/CRS self-cert); address (pincode autofill) | Every field chosen by the investor, never preselected (must-fix i) | 2 min |
| 3a | **Eligibility** (MS-21, MS-29) | US/CA person or residency → `eligibility_status=MANUAL_REVIEW` (onboarding_reviews FATCA_US_CA). Approved investors see only AMCs with `accepts_us_ca`; if none, BLOCKED with honest copy. PEP/RELATED_PEP → review (PEP); the decision is kept on the record. | async |
| 4 | KYC per the readiness table (fresh/modify adds Aadhaar/DigiLocker + eSign) | Readiness `verified` | — |
| 5 | Bank: IFSC (ref table), account number twice, holder name; savings only; TPV explained | Penny drop verified plus name match ≥ threshold. `uncertain`/`low_confidence` → MANUAL_REVIEW (maker-checker). | 45 s |
| 6 | Nominees (1 to NOMINATION_MAX: name ≤ 40 chars, relationship, **ID required** (PAN/DL/passport/Aadhaar last 4) with the reason explained, DOB and **guardian name + ID if minor**; % optional → deterministic equal split shown, e.g. 33.34/33.33/33.33, remainder to nominee 1) **or** Annexure-B opt-out verbatim. Also: "Stored on Platizio only, not yet sent to the RTA: nominee contact details, display preference." (MS-14) | Validated draft | 60 s |
| 7 | Declarations: T&C, privacy, risk, Regular plan/commission, execution-only, FATCA; optional risk profile | Staged | 30 s |
| 8 | **Review and attest (one challenge; MED-2):** masked summary + declarations + nominee set or opt-out → **SMS + email OTP** (`onboarding.attestChannels`, default both; counsel OI-14 checks SEBI-NOM/SEBI-NOM-A for whether one channel suffices) | Attest CONSUMED; one consent_record per document version plus the nomination record | 30 s |
| 9 | "Setting up your account" | FP provisioning DONE | automatic |
| READY | Resume the checkout intent, otherwise the dashboard | `can_purchase`/`can_exit` computed by the readiness trigger | — |

**OTP round-trips per path** (logged to `onboarding_applications.otp_roundtrips` and `product_events`):
- existing KYC: 3 screens, 4 codes (mobile, email, attest SMS + email);
- fresh/modify KYC: + DigiLocker OTP + eSign OTP = 5 screens.

**Targets:** existing-KYC median ≤ 6 min to READY; fresh ≤ 15 min.

**AMFI validations before step 9:**
- no special characters in names;
- mobile not all one digit and not starting with 0–5;
- email with one `@` and a TLD in the allow-list.

### G.2 Unified readiness table

| POA result | Action | Investor sees |
|---|---|---|
| pan `aadhaar_not_linked` | ACTION_REQUIRED | PAN–Aadhaar link guide |
| pan `invalid`; name/DOB `mismatch` | ACTION_REQUIRED (≤ 3 edits a day) | Field error |
| `verified` ∧ all fields verified | PROCEED (EXISTING_VALID) | "KYC verified" |
| `kyc_unavailable`, `kyc_rejected` | FRESH KYC | "Complete KYC with Aadhaar (5 min)" |
| `kyc_incomplete`, `kyc_onhold`, `kyc_legacy`, KRA "Registered" | MODIFY KYC | "Update your KYC" |
| `kyc_underprocess` | WAIT (6 h recheck) | "KYC under process at KRA" |
| `kyc_deactivated` | BLOCKED | Contact KRA + support |
| `upstream_error`, rate limits | RETRY (1, 5, 30 min) | "Retrying…" |
| other | MANUAL_REVIEW | "We're reviewing" |

**After onboarding (MS-12):**
- `kyc.periodic.recheck` runs monthly (batched within POA quota). A quote-time recheck runs if the last check is > 30 days old.
- If the result leaves VALIDATED (On-Hold, Rejected, inoperative PAN):
  - `can_purchase=false` with reason; SIP registrations and purchases blocked; existing SIPs continue at the AMC and the investor is told honestly;
  - **`can_exit` stays true** (redemption, SWP), unless `FRAUD_HOLD` or SUSPENDED-for-fraud;
  - T&C outdated → purchases blocked (`DECLARATION_OUTDATED`), exits allowed.

### G.3 KYC application (one adapter; MED-1)

The `KycApplicationPort` has two designed implementations. **Only the one chosen by the S0 probe P-03 is built**, and the other stays a port stub (`KYC_ADAPTER` config):
- **`POA_KYC_FORMS`** if the tenant gets 2xx on `/poa/kyc_forms` (v1 recorded 403 "Partner not allowed", `BE/domain/KycReadinessAction.java:8-12`).
- Otherwise **`FP_KYC_REQUESTS`** (v1 chain `BE/service/InvestorKycService.java:669-703`): `/v2/kyc_requests` → `/v2/identity_documents` (DigiLocker) → proofs → `/v2/esigns` → `successful`.

Returns:
- Web: same-tab redirect → `/api/v1/kyc/return/{token}` → `/app/return/kyc`.
- Native: `WebBrowser.openAuthSessionAsync(url,'platizio://return/kyc')`.
- Signature: `expo-image-picker` (camera or library) on native, file input on web.
- Geo: `expo-location` / browser geolocation, "inside India" only, coordinates not stored.

### G.4 FP provisioning (`onboarding.provision`; starts after the attest challenge is CONSUMED; resumable)

| # | Call | Stored |
|---|---|---|
| 1 | `GET /v2/investor_profiles?pan=` (exact PAN match only; v1 "first entry" bug at `BE/integration/RealCybrillaClient.java:1850-1852`), otherwise `POST` | fp_investor_profile_id |
| 2–4 | phone, email, address | fp ids |
| 5 | bank account (list-and-match first) | fp_bank_account_id, old_id |
| 6 | `POST /v2/related_parties` per nominee (ID for every nominee or guardian; P-11 rules) | fp_related_party_id, `sent_to_fp_fields` |
| 7 | `GET ?primary_investor=`, otherwise `POST /v2/mf_investment_accounts {holding_pattern:"single"}` | ids |
| 8 | `PATCH` folio_defaults (communication email, mobile and address, payout bank, nominee1..N + %) | DONE |

Failure handling:
- 5xx/429/transport: backoff, 5 attempts.
- 4xx: typed `FpError` → FAILED → onboarding_review PROVISIONING_4XX → ops `RETRY_STEP` after the data is fixed.
- The investor sees "Finishing your setup" and gets a push when READY.

**`folio_defaults` affect only NEW folios.** Existing folios change only through §G.5.

### G.5 Post-onboarding changes: folio service requests, COB and contact change (MS-02, MS-03, MS-06)

| Change | Platform-level effect | Existing folios | Controls |
|---|---|---|---|
| Nomination | New nominee set (EFFECTIVE after TPL_NOMINATION_CHANGE consent, SMS+email) → `folio_defaults` PATCH (new folios only) | One `folio_service_request` per folio. **Channel default `MF_CENTRAL_GUIDED`:** deep link plus a step guide to MF Central (RTA-run portal). `FP_API` if P-10/Q-C9 shows an FP instruction. `OPS_RTA` (maker-checker submit) for investors who cannot self-serve. | **Acknowledgement is sent only on CONFIRMED**, proven by a `GET /v2/mf_folios` re-fetch diff or an RTA ack. The copy never says "updated" before that. |
| Bank (COB) | New account: penny drop + **name match against name_as_per_pan** → TPL_BANK_CHANGE challenge (**SMS + email OTP**, plus device key on native) → primary for new folios and mandates | Service request per folio, as above | Immediate notification to the **old** email and mobile. **Exit cooling-off: redemptions and SWP/switch blocked for 10 calendar days** after a COB (`cooling.bankChangeDays`; counsel confirms). No bank change within 10 days of a contact change and vice versa. Other sessions revoked, push to other devices. Audit. OPS_RTA submissions go through maker-checker. |
| Contact | TPL_CONTACT_CHANGE: OTP to old and new contact. If the old contact is lost: OPS review with KYC re-verification (pre-verification + video-less document check), never self-serve. Old contact → `investor_contacts` PREVIOUS. | Service request per folio. Until CONFIRMED, consent OTPs keep going to the folio-registered (old) contacts if still reachable; otherwise exits on those folios are blocked, with the reason shown. | **72 h exit cooling-off** after a contact change. Old contacts notified. Other sessions revoked. |

`folio.contacts.sync` refreshes folio contacts and payout bank daily and on demand, then confirms service requests.

---

## H. Portfolio engine

| Component | Definition |
|---|---|
| Ledger | `lots` + `lot_consumptions` + `ledger_adjustments`, written only by `Ledger.*` in the same tx as the order transition or approval. Units come from the provider (`allotted_units`, `redeemed_units`, switch fields), the **holdings/RTA feed (`FEED`)**, or **MANUAL (MANUAL_UNITS maker-checker)**. No DERIVED units. |
| UNITS_PENDING (HIGH-1) | FP success without units → no lot. The dashboard shows "₹X invested, units being confirmed" in `pending_amount`. `orders.units.reconcile` re-fetches every 2 h and consults `HoldingsFeed`. SLA alerts per §F.10. Assumption A2 is probe P-07 with pass criterion: for a sandbox purchase, a SIP instalment and a switch-in, the FP object carries `allotted_units` (or a documented alternative field) no later than state `successful`; the field name is recorded; the adapter maps exactly that field (no three-key guessing, unlike `BE/service/OrderService.java:1024`). Real money is gated on P-07 **and** gate G4. |
| FIFO | Exits consume unlocked lots in `(allotment_date, id)` order. Cost per consumption = `round_half_up(cost_amount × units / lot.units, 2)`; the last consumption takes the remainder. One cost basis for dashboard, tax and ELSS. `cost_basis_known=false` lots (ADJUSTMENT_IN without cost) are excluded from cost basis and flagged in tax reports. |
| Holdings reconciliation (MS-05) | `recon.holdings` (daily 06:00 and before every exit quote) compares the ledger per folio/scheme with `FpGateway.getHoldings` (FP holdings report; P-12) or, if FP is not populated, the **`HoldingsFeed` from RTA mailback files** (CAMS/KFintech transaction and holding feeds sent to the ARN holder). A mismatch > 0.001 units → `externally_modified=true`, `reconciliation_status=MISMATCH`, a `ledger_exceptions(FEED_MISMATCH)` row and a WARN break. Effects: ALL refused, tax reports carry "Not reconciled with RTA" caveats, and the folio's XIRR is suppressed. Ops resolves through **ledger adjustments** (merger/ISIN change, segregation, bonus, external purchase/redemption, IDCW reinvest, correction; maker-checker; golden tests). **Real-money gate G4: holdings reconciliation must be MATCHED end-to-end on at least one feed source.** |
| Invested | Σ `cost_remaining` (gross paid incl. stamp duty). `pending_amount` = paid but not yet allotted; "being invested", never added to value. |
| Current value | `units × NAV` (2 dp HALF_UP) only if the NAV is non-quarantined, > 0 and `nav_date ≤ today IST`. Otherwise null (never cost, never 0). Grade: OK (≤ 7 days), STALE, UNAVAILABLE. Always shows "NAV as of DD MMM". |
| Gains | abs = value − invested; % = abs / invested; null if value is null. Day change only if grade OK and `prev_nav_date` is the previous business day. |
| XIRR (PO-5) | Port of `BE/service/XirrCalculator.java` (Newton seed 0.1, tolerance 1e-7, ≤ 100 iterations; bisection ≤ 200; null for < 2 flows, same sign or zero horizon; zero flows dropped). Flows: −cost on allotment date, +sale on sale date, +value on the NAV date. Portfolio XIRR is null unless every holding is valued and no folio is MISMATCH. **Display:** horizon ≥ 30 days; under 365 days labelled "Annualised; can swing widely for holdings under 1 year" with absolute return beside it; under 30 days "Too early", absolute return only. |
| Compute on read (MED-1) | `PortfolioQueries.summary(investorId)`: one query over OPEN lots + latest NAVs + plans; domain functions compute. Budget p95 < 150 ms at k6 (§P). A snapshot cache is added only if k6 fails. There is no staleness window. |

### H.1 Active SIPs (one definition, one implementation; MIN-2)

`packages/domain/sipCounts.ts` `sipCounts(plans)` is the only implementation, used by the API and tested:
- `active` = status ACTIVE;
- `paused` = PAUSED;
- `needsAttention` = MANDATE_REVOKED;
- `settingUp` = CONSENTED / MANDATE_SETUP / SUBMITTING / UNDER_REVIEW / CONFIRMING;
- `monthlyAmount` = Σ ACTIVE amounts (quarterly ÷ 3).

Dashboard: "4 active · 1 paused · ₹12,500/month". There is no SQL view.

### H.2 Allocation
- Value by `asset_class`, then category (AMC on detail), valued holdings only.
- A separate "Value pending: ₹X invested" row.
- Percentages computed at 4 dp and shown at 1 dp with largest remainder, so they sum to exactly 100.0.
- Rendered as a stacked bar plus table.

### H.3 Tax and statements

| Report | Rules |
|---|---|
| Capital gains (FY 1-Apr to 31-Mar) | From `lot_consumptions` (redemption, switch-out, SWP, STP-out). FIFO replayed over all time; only the chosen FY is reported. Classification uses `scheme_tax_classes` **effective on the transfer date** (CA-approved, maker-checker; MS-18); **the report is refused for any scheme without an approved class** (`TAX_CLASS_MISSING` caveat, so the investor sees which scheme). Holding-period rules are **code constants** `packages/domain/tax/rules.v2026.ts` (EQUITY_ORIENTED LT > 12 months; SPECIFIED_MF always ST where acquired ≥ 2023-04-01 per the Finance Act 2025 amended definition, verified by CA OI-8; OTHER LT > 24 months). Grandfathering is ported but inert. **Sale consideration** = `redeemed_amount` allocated per unit (net of exit load, before STT). **Cost of acquisition** = cost incl. stamp duty (CA confirms, OI-12). No tax amount is computed. Each line carries `tax_rule_version`. Formats: PDF, CSV, CSV_CLEARTAX, CSV_QUICKO. Header: "Computed from Platizio records; the RTA/AMC statement prevails", plus per-folio "not reconciled" caveats. |
| Transaction statement | ≤ 5 years; orders with NAV, units, amount, stamp duty; opening and closing units per folio/scheme; adjustments shown explicitly |
| ELSS summary | ELSS lots allotted in the FY: amount, allotment date, unlock date (strict rule), FY total; old-regime note (OI-8) |
| Consent evidence | Per-order evidence PDF (§F.3) |
| Generation | `report_requests` → `reports.generate` (pdfmake, concurrency 2) → S3 SSE-KMS → 5-minute URL; 7 days. Native: `expo-file-system` download + `expo-sharing`. |

### H.4 CAS external holdings (MS-22)
- **Source:** CAMS+KFintech detailed CAS PDF plus password; NSDL/CDSL → `CAS_UNSUPPORTED`. Picked with `expo-document-picker` on native.
- **Parsing:** in memory in a worker thread (30 s, 512 MB, 10 MB, 40 pages). **Only rows whose PAN equals the investor's PAN are persisted.** Other PANs' rows are discarded without logging; only the count is stored and shown ("3 holdings belonging to other PANs were ignored and not stored").
- **Logging:** request-body capture is off on this route in pino and Sentry, asserted by test. The password is only in memory.
- **Retention:** PDF hard-deleted including on failure; the S3 prefix is unversioned.
- **Consent:** `CAS_IMPORT_NOTICE` consent with `notice_version`.
- **Model:** separate `external_holdings`, valued with AMFI NAV when the ISIN matches, otherwise at statement value.
- **Display:** always labelled "Imported from your CAS dated …, held outside Platizio, view only". Excluded from platform totals, XIRR and tax. Optional labelled combined view. Overlapping folios hidden. No transact buttons (C-26).

---

## I. Fund catalogue

### I.1 Taxonomy and identity
- `sebi_categories` is seeded from the category circular. Seeding waits for its register entry (URL, date, annexure) in `regulatory-sources.md`: the prior analysis cites HO/24/13/15(2)2026-IMD-RAC4/I/5764/2026 of 26-Feb-2026, not verifiable read-only today.
- Each category carries `cutoff_class` and `volatility_class`.
- `category_aliases` maps AMFI/FP/legacy strings. Unmapped schemes stay DRAFT in an ops queue.
- ISIN `^INF[A-Z0-9]{9}$`; REGULAR plans only.

### I.2 FundFactsProvider

```ts
interface FundFactsProvider { readonly id: 'AMFI'|'ADMIN'|'CYBRILLA'|'VENDOR';
  supports(field: FundFactField): boolean;
  fetch(isins: string[]): Promise<Map<Isin, Partial<Record<FundFactField, {value: unknown; asOf: IsoDate; ref?: string}>>>> }
```

| Implementation | Launch | Fields |
|---|---|---|
| AmfiProvider | Live | NAV (pipeline), scheme code, category string |
| CybrillaProvider | Live for what it has | `/v2/mf_scheme_plans/cybrillapoa?expand=mf_scheme,mf_fund` + `/api/oms/fund_schemes` (orderability, thresholds, SIP dates, lock-in, allow flags). TER etc. once production exposes them. |
| AdminCurationProvider | Primary for facts | TER + as-of, riskometers, PRC, exit load, AUM, benchmark TRI CAGRs, managers, objective, SID/KIM/SAI. One editor, CSV import, source note per field. |
| VendorProvider | Interface + fake | Future paid feed |

- `FundFactsResolver` merges per field (precedence ADMIN > VENDOR > CYBRILLA > AMFI), writes provenance and a revision, and **never publishes**.
- **Publish gate (DB trigger):** AMC empanelled + service agreement; `fp_active`; category; riskometers; TER; exit load; benchmark; SID/KIM/SAI; PUBLISHED commission row; **approved tax class**.
- Freshness SLAs: TER 7 days, riskometer and AUM 45 days; show "Updating" when exceeded.

### I.3 NAV sync (port of `BE/service/nav/SchemeNavSyncService.java` + `BE/integration/nav/AmfiNavParser.java`)
- NAVAll.txt with 10 s / 60 s timeouts and 3 attempts.
- Header-driven parser, one row per ISIN.
- Floors before any write:
  - ≥ 1000 rows;
  - cold-start match ≥ 0.10;
  - regression ≥ 0.5 × the last success within 7 days;
  - future horizon + 2 days;
  - stale feed → SKIPPED;
  - per-ISIN jump > 25% × days elapsed → quarantine (release/manual is maker-checker).
- Advisory lock, IST, no metadata fallback. History backfill on publish uses the same floors.

### I.4 Returns
- Absolute 1W/1M/3M/6M (plus 7D/15D where the category allows); CAGR 1Y/3Y/5Y/10Y/SI.
- Schemes younger than 6 months: no performance shown. 6–12 months: simple annualised.
- SIP XIRR 1Y/3Y/5Y. Regular-plan NAV only. Shown next to the benchmark TRI with source and as-of.

### I.5 Search, filter and sort
- `pg_trgm` plus exact ISIN/AMFI code.
- Neutral default sort (AMC, name). No "top", "best", "popular" or "recommended".
- One card per family, Growth default. IDCW orderable only with PO-3.
- On www this is a small client island (plain React + Tailwind, no RNW) over `/catalogue/schemes`.

### I.6 Watchlist
- Heart toggle on www cards/pages (a link carrying `?intent=watch&isin=` to app) and in the app.
- `/app/watchlist` (web) and `(tabs)/explore` (native) list the watchlist. Web items link to www fund pages and to `/app/invest/[slug]`.

### I.7 SEO pages (`www.sanchay.in`; RSC + Tailwind + `packages/www-ui`)

| Route | Content |
|---|---|
| `/mutual-funds` | Category directory + search island |
| `/mutual-funds/category/[slug]` | SEBI definition, neutral list, filter island |
| `/mutual-funds/amc/[slug]` | AMC overview (logo only if approved) |
| `/mutual-funds/[schemeSlug]` | Full fact sheet and disclosures, NAV chart island (SVG, lazy), **Invest CTA → `app.sanchay.in/app/invest/[slug]?intent=invest`**, Watch CTA |
| `/legal/*`, `/commission-disclosure`, `/investor-charter`, `/grievance`, `/about` | Static |

**Rendering (MED-12):**
- `cacheComponents:true`. **No `generateStaticParams`**: pages render on demand at first request.
- Data functions use `'use cache'` + `cacheLife({revalidate:3600, expire:86400})`, plus CloudFront `s-maxage=3600, stale-while-revalidate=86400`.
- `sitemap.ts` is dynamic (`await connection()` + cached fetch), so **`next build` in CI needs no API or DB**.
- JSON-LD `FinancialProduct` + `BreadcrumbList`. `robots` allows www only.
- Indexing (`seo.indexable`) only after counsel OI-2.

---

## J. Jobs and schedules

**Runner:** pg-boss 12.x in the **`worker` ECS service, minimum 2 tasks** (MED-7), same image, schema `pgboss`, cron `tz: Asia/Kolkata`.
- Vendored `JobsModule`: `@JobHandler`, `Jobs.enqueue(tx,…)` over the Drizzle tx, graceful SIGTERM.
- Defaults: retryLimit 5, backoff, expire 300 s.
- Dead-letter `dlq.<name>`.
- **FP credentials are readable only by the worker task role** (MS-19).

| Job | Schedule (IST) / trigger | Idempotency | On failure |
|---|---|---|---|
| nav.sync.daily | 21:30, 23:30, 07:00, 10:30 | Advisory lock, per-ISIN date guard | Run FAILED; alert if no SUCCESS for T by 09:00 |
| nav.history.backfill | On publish; Sun 04:00 | PK | Retry ×3 |
| catalogue.returns.compute | After nav.sync; 08:00 | Upsert | Keep previous |
| catalogue.fp.sync | 05:30 + admin | Upsert; never deactivate on partial fetch | Alert |
| ref.ifsc.refresh / ref.pincode.refresh | Sun 03:30 | Upsert | Alert |
| external.revalue | After nav.sync | Overwrite | Retry |
| fp.event.process | On webhook insert | Singleton per object; canTransition | ×8 → DLQ |
| fp.reconcile.nonfinal | `*/5` | Re-fetch + apply; bands incl. RECONCILING and UNITS_PENDING | Next run |
| fp.reconcile.events | `*/15` | ON CONFLICT | Next run |
| orders/plans/mandates/modifications `.submit`, `.confirm` | On approve / review_completed | consume (first) / useConsumed + T6 (retries) | Ladder capped at saga window → RECONCILING or CONSENT_EXPIRED |
| payments.create | On POST | Pre-check + attempt row | FAILED with copy |
| payments.poll | 30 s, 1 m, 2 m, 5 m, 15 m | Per attempt | EXPIRED after final re-fetch |
| **payments.recon** | 01:30 | Per order | Breaks (orphan, refund overdue) |
| mandates.poll | `*/10` while AUTH_PENDING/BANK_PENDING; daily 07:30 for APPROVED (external revoke) | Per mandate | EXPIRED at 7 days |
| plans.instalments.sync | 08:30, 20:30 | Upsert by fp_order_id | Retry |
| **orders.units.reconcile** | Every 2 h | Per order | SLA alerts |
| **recon.holdings** | 06:00 + pre-exit on demand | Per folio | MISMATCH flag + break |
| **holdings.feed.ingest** | 07:00 (RTA mailback files from S3 drop) | File hash | Alert |
| **folio.contacts.sync** | 05:00 + on demand | Per folio | Retry |
| **folio.requests.watch** | 10:00 | Per request | Remind investor/ops at 7 and 15 days |
| consent.expiry.sweep | `*/5` | Status guards | — |
| drafts.abandon | Hourly | CONSENT_PENDING > 24 h → CANCELLED; reservations released (no FP object exists) | — |
| onboarding.provision | On attest consumed | Step pointer | → review |
| onboarding.kyc.recheck | `0 */6 * * *` (WAITING/SUBMITTED) | ≥ 6 h | 14 days → ops |
| **kyc.periodic.recheck** | 1st of month 02:00, batched to quota | Per investor per month | Flags `can_purchase` |
| bank.verify.poll | 30 s, 1 m, 5 m, 30 m | By pv id | MANUAL_REVIEW at 24 h |
| **integrity.invariants** | Hourly | Read-only | CRITICAL page on: **M1** a provider id without a matching CONSUMED challenge (investor + subject + consumed_at); **M2** lot conservation; **M3** ≤ 1 SUCCESS payment per order; **M4** exactly one lot per SETTLED purchase/instalment (UNITS_PENDING excluded); **M5** refunds owed past due |
| **recon.fp.tenant** | 02:30 | Read-only | M6 CRITICAL: FP object unknown to us or without consent (MS-19) |
| recon.fp.orders | 02:00 | Partial-unique breaks | Alert on CRITICAL |
| cutoff.monitor | 09:00 | One break per order | WARN if later than disclosed |
| **payout.watch** | 10:00 | Per order | DELAYED + grievance |
| calendar.check | 1st of month 09:00 | Read-only | CRITICAL if today + 60 days is unpublished |
| sip.upcoming.reminder | 09:00 | (plan, date) | — |
| nomination.nudge | 10:00 on 1-Jan and 1-Jul (the **single** rule: OPTED_OUT investors get email + in-app card) | (investor, half-year) | — |
| notifications.send | On enqueue | (notification, channel) | Email fallback for SMS |
| reports.generate · cas.parse | On request | Request/import id | FAILED shown; CAS PDF deleted either way |
| cas.purge | Hourly | PDFs > 24 h incl. failed | Alert |
| audit.export | 01:00 | Date file to Object Lock | Alert |
| retention.purge (as `plz_retention`) | 03:30 | Idempotent redactions incl. provider_calls body_enc > 400 days and append-only tables past retention | Report to compliance |
| sessions / otp / idempotency cleanup | 04:00 / hourly / hourly | — | — |
| privacy.sla.watch · ops.daily.digest | 10:00 · 09:30 | — | Email |
| **worker.heartbeat** | Every 30 s per task | Upsert | Alarm if none for > 2 min |
| crypto.reencrypt | Manual | By kid | Resumable |

**Alarms (MED-7):**
- oldest queued job age > 2 min for `*.submit`, `*.confirm`, `payments.*`; > 5 min for the rest;
- worker heartbeat missing > 2 min;
- DLQ > 0.

The worker service is in the ECS deployment circuit breaker with automatic rollback.

**Runbook "worker outage":** investors see "Processing delayed" on their order cards. APPROVED challenges past `execute_before` become CONSENT_EXPIRED (no FP write happened). Ops runs `admin: bulk notify + one-tap clone` for those investors. RECONCILING orders are left to reconcile and are never re-submitted.

---

## K. Integrations

All adapters live in `apps/api/src/integrations/<name>/{port,real,fake}.ts`, selected by `PROVIDER_MODE_<NAME>`. A boot guard refuses fakes, a sandbox FP URL, the local keyring or `signature_mode NONE` in prod, and the reverse.

| Port | Real | Fake (local, CI, e2e) |
|---|---|---|
| `FpGateway` (onboarding, catalogue, orders, plans, modifications, payments, mandates, events, folios, holdings, tenant reports) | undici. Two token audiences, memory only, single-flight refresh. Retry ×3, 429 Retry-After, token bucket per host. **lossless-json parsing**, decimal.js conversion. Typed `FpError`. Allow-list `provider_calls`. Writes take `ConsumedConsent` + `assertConsumed`. No sandbox-only branches (v1 "1193" logic at `BE/integration/RealCybrillaClient.java:421-424` dropped). | `FakeFpGateway`: stateful, real id prefixes, FakeClock progressions, sandbox rules, FP rules, folio contacts and payout bank, holdings report, refunds and late_auth, external mandate cancel, UNITS_PENDING mode, tenant list reports, signed duplicate and out-of-order webhooks. **Upkeep 0.5 day per sprint from S3 as an explicit roadmap line.** |
| `KycApplicationPort` | The one chosen adapter | Fake of that flow |
| `HoldingsFeed` | FP holdings report (P-12). Fallback: CAMS/KFintech mailback files (ARN-holder feeds) dropped to S3 `plz-{env}-feeds` by ops/SFTP and parsed. | Fixture files |
| `AmfiFeed` | NAVAll + history | Fixtures |
| `SmsSender` | MSG91 (DLT). Secondary provider after launch. | Capture inbox |
| `EmailSender` | SES v2 ap-south-1 | Mailpit |
| `PushSender` | Expo Push (no-PII payload: category + opaque id) | Capture |
| `CasParser` | pdfjs-dist in a worker thread | Same parser, synthetic fixtures |
| `ObjectStore` | S3 SSE-KMS | Local FS |
| `KeyService` | KMS unwrap | Static dev keyring (refused outside local) |
| `Clock` | System + IST helpers | FakeClock |

**Config and secrets:**
- Zod-validated config. Secrets Manager `plz/{env}/*`, injected per task role.
- **FP credentials go to the worker role only.** A CloudTrail/EventBridge rule alerts on `GetSecretValue` for FP secrets by any other principal.
- Credentials are rotated after any incident. Cybrilla is asked to IP-allowlist the NAT EIPs (Q-C14).
- GitHub OIDC to AWS.

---

## L. Web app (`apps/web`, Next 16.3.6; `cacheComponents:true`, `reactCompiler:true`, `typedRoutes:true`)

### L.1 Route map

| Host | Route | Rendering | Data / screen |
|---|---|---|---|
| www | `/`, `/mutual-funds/**`, `/legal/*`, `/commission-disclosure`, `/about`, `/investor-charter`, `/grievance`, `sitemap.xml` | On-demand RSC, cached 1 h (no build-time params) | Server fetch to the public API over the internal ALB |
| app | `(auth)` `/login`, `/login/verify`, `/login/email` | **Dynamic** (`await connection()` in the `(auth)` layout; nonce CSP) | `LoginScreen` (features, via RNW) |
| app | `(app)` layout | **Dynamic** (`await connection()`; nonce CSP); `NextNavProvider` + web platform adapters + responsive shell (sidebar ≥ 1024 px, bottom nav < 768 px) | — |
| app | `/app` | Dashboard | `DashboardScreen` |
| app | `/app/onboarding/[step]` | — | `OnboardingScreen` |
| app | `/app/invest/[slug]` → `/app/checkout/[id]` | — | `InvestScreen`, `CheckoutScreen` (review → consent → payment/mandate) |
| app | `/app/watchlist` | — | `WatchlistScreen` (items link to www) |
| app | `/app/holdings`, `/app/holdings/[folioId]/[isin]`, `/app/external` | — | Holdings screens |
| app | `/app/redeem/[folioId]/[isin]`, `/app/switch/[folioId]/[isin]`, `/app/stp/new`, `/app/swp/new` | — | Action screens |
| app | `/app/sips`, `/app/sips/[id]`, `/app/sips/[id]/manage`, `/app/mandates`, `/app/orders`, `/app/orders/[id]` | — | — |
| app | `/app/reports`, `/app/notifications` | — | — |
| app | `/app/profile/{bank,nominees,contacts,folios,sessions,notifications,privacy,risk-profile,legal,close-account}` | — | — |
| app | `/app/return/payment`, `/app/return/mandate`, `/app/return/kyc` | Poll, never trust params, reload-safe | — |
| app | `/.well-known/apple-app-site-association`, `/.well-known/assetlinks.json` | Route handlers | — |

`/app/explore` and `/app/funds/[slug]` do not exist (BLK-1). "Explore" in the app shell links to `www.sanchay.in/mutual-funds`.

**`proxy.ts`:**
1. Host → route-group allow-list.
2. Optimistic redirect when `plz_si` is missing.
3. Nonce CSP for app.
4. `noindex` on app.

### L.2 Data fetching and forms
- The `(app)` pages are client-rendered universal screens using `app-core` hooks + TanStack Query.
- The dashboard page prefetches `/portfolio/summary` in the RSC layout and passes it through `HydrationBoundary`.
- `staleTime`: dashboard 60 s; non-terminal orders polled 1.5–5 s. The cache is cleared on logout.
- Forms: react-hook-form + `zodResolver`; `AmountInput` with lakh grouping; money never uses `type=number`.

### L.3 Payment, mandate and KYC redirects

| Method | Web behaviour |
|---|---|
| Netbanking / eNACH | Poll the attempt until `redirectUrl` → same-tab `location.assign` → FP POSTs `/api/v1/payments/postback/{token}` → re-fetch → 303 `/app/return/payment?attempt=` → poll |
| UPI mobile web | `upi://` intent, poll 2 s for up to 5 min, "Pay another way" |
| UPI desktop | QR from `upiUri` (5-min countdown) + collect VPA |
| UPI Autopay | Mandate intent / QR / collect → poll |
| DigiLocker / eSign | Redirect → `/api/v1/kyc/return/{token}` → `/app/return/kyc` |

### L.4 Universal rendering setup
- Turbopack `resolveAlias: { 'react-native': 'react-native-web' }`.
- `transpilePackages: ['@sanchay/ui','@sanchay/features','@sanchay/app-core']`.
- Uniwind web CSS (or NativeWind per ADR-0002) imported only in the `(app)`/`(auth)` layouts, so www bundles never include RNW.
- The ADR records the measured RNW cost (bytes gzip) on the S0 skeleton.

### L.5 Performance budgets (MED-11)
1. **Baseline:** in S0, measure the first-load JS (gzip) of the skeleton routes from `.next` build manifests (`check-bundle-budgets.ts`), for www home, www fund page, app dashboard and app checkout.
2. **Budgets = baseline + delta:** www home +25 KB, fund page +35 KB, dashboard +120 KB (incl. RNW + ui), checkout +140 KB. Recorded in ADR-0003. CI fails when exceeded.
3. **Field targets (Lighthouse CI nightly on staging, Moto-G-class throttling):** LCP p75 ≤ 2.0 s (www) / ≤ 2.5 s (app), CLS ≤ 0.05 / 0.1, INP ≤ 200 ms.
4. **Before each release:** a real-device run on a lab Moto G (or Firebase Test Lab low-end profile).

Techniques: no third-party scripts, lazy SVG charts, `next/font` Inter latin 2 weights, RSC-first www.

---

## M. Native app (`apps/mobile`, Expo SDK 57)

### M.1 Navigation (expo-router; every route file renders a `packages/features` screen)

```
app/_layout.tsx     QueryClient, auth gate, app-lock gate (queries wait for unlock), Sentry, ExpoNavProvider, native platform adapters
(auth)/ welcome, phone, otp, email-step-up, email, email-otp
(onboarding)/ [step]
(tabs)/ index (Home) | explore (search, categories, watchlist) | investments (Holdings | SIPs | Orders | External) | account
fund/[slug]  invest/[slug]  checkout/[id]  holding/[folioId]/[isin]  redeem/[folioId]/[isin]  switch/[folioId]/[isin]  stp/new  swp/new
sip/[id]  sip/[id]/manage  order/[id]  consent/[challengeId] (bottom sheet)  reports  mandates  notifications
profile/{bank,nominees,contacts,folios,sessions,notifications,privacy,risk-profile,legal,close-account}
return/payment  return/mandate  return/kyc  update-required  maintenance  +native-intent.tsx
```

### M.2 What is shared with web

| Layer | Shared? |
|---|---|
| Contract, api-client, domain, money, tokens | 100% |
| `app-core` hooks and view-models | 100% |
| `packages/ui` components | 100% (one implementation) |
| `packages/features` screens | 100% for the investor app, except the fund detail/explore surfaces (www RSC on web; universal `FundDetailScreen` / `ExploreScreen` on native, sharing `fundDetailViewModel()` and chart geometry) |
| Platform-specific | Navigation shells, the platform adapters (payments launcher, secure storage, device signer, UPI app picker, file saver, document/image pickers, geo, screen privacy), push registration |

**Target: ≥ 85% of investor-app UI code (LOC) in packages**, measured in S10 by `scripts/share-ratio.ts`.

### M.3 Platform concerns

| Concern | Decision |
|---|---|
| Secure storage | Session token, installation id, and the device consent secret (biometric-gated) in expo-secure-store. The query cache is not persisted. |
| Links | Scheme `platizio://`. Universal/App Links on `https://app.sanchay.in/app/*`. Payment, mandate, DigiLocker and eSign use `openAuthSessionAsync(url,'platizio://return/…')`. The postback 303s to `platizio://return/payment?attempt=` when `return_channel=APP`. |
| UPI | Android: `Linking.openURL(upiUri)` chooser, poll on resume. iOS: app-picker (`LSApplicationQueriesSchemes`: gpay, phonepe, paytmmp, bhim) → collect fallback. |
| Push | expo-notifications, permission after the first order, lock-screen-safe copy, no PII |
| Screen privacy | `expo-screen-capture` preventScreenCapture on consent/OTP, bank and profile screens. App-switcher blur. |
| Files | Reports: `expo-file-system` + `expo-sharing`. CAS: `expo-document-picker`. KYC signature: `expo-image-picker`. KYC geo: `expo-location` (when-in-use, one reading). |
| OTA | EAS Update channels `preview`/`production`, fingerprint runtimeVersion, code signing, staged 10 → 50 → 100% gated on crash-free sessions ≥ 99.5% |
| Builds | EAS Build (iOS from Windows) and EAS Submit |
| Performance gates | Hermes V1, New Architecture, FlashList if needed, system fonts with tabular numerals, charts ≤ 260 points. **Release gates:** Play-reported **download size (arm64) ≤ 30 MB**, JS bundle ≤ 3.5 MB, **cold start to interactive Home ≤ 2.5 s on a real low-end device** (lab Moto G / Firebase Test Lab) before each store release. CI runs only a Maestro smoke (no perf gate on AVD). |
| Store compliance | Organisation accounts (D-U-N-S). Play Financial features declaration and **Data safety form**, plus Apple privacy labels declaring camera/photos (KYC signature), location (KYC geo, not stored), files (CAS, reports), identifiers, financial info. Usage strings: `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSLocationWhenInUseUsageDescription`, `NSFaceIDUsageDescription`. In-app account closure (`profile/close-account`) plus a web URL. Listing: "AMFI-registered Mutual Fund Distributor, ARN-xxxx", market-risk warning, never "adviser". Reviewer demo account on a sandbox build. |

---

## N. Design system

| Item | Decision |
|---|---|
| Tokens | `packages/tokens/theme.css` (Tailwind v4 `@theme`) used by www, admin and Uniwind; `tokens.ts` mirror. Light theme. bg `#FFFFFF`, surface `#F6F7F9`, text `#0B1220`, muted `#4A5568`, primary `#0B5FFF`, gain `#0A7A3D`, loss `#C0262D`, warn `#8A5A00`, border `#D5DAE1`. Riskometer colours exact (C-08), always with label and outline. Type 12/14/16/20/24/32, tabular numerals; 4-pt spacing; radii 6/12/999. |
| Investor UI (web app + native) | **One kit: `packages/ui`** = React Native Reusables (copied in, @rn-primitives, which uses Radix on web for a11y) + Uniwind. **S0 spike (2 days) exit criteria:** the same `Button`, `TextField`, `Sheet`, `AmountInput` render and pass axe on Next 16 web and on an Android low-end device, and the RNW bundle cost is recorded. If it fails: NativeWind 4.2.7 inside `packages/ui`. If both fail: the split-kit option with every UI line re-estimated at 1.6× and the launch re-baselined (ADR-0002 records it). |
| www | `packages/www-ui` server components (Tailwind v4). ~12 components, no client JS except the chart and search islands. |
| Admin | shadcn/Radix copied into `apps/admin/src/ui`, admin-only; DataTable, MakerCheckerBar, RevealField, JsonViewer, AuditTrail |
| Components (`packages/ui`, one implementation) | Button, IconButton, TextField, **AmountInput**, UnitsInput, **OtpInput** (one-time-code autofill; SMS Retriever on Android), Select/BottomSheetPicker, DateField, DayPicker, Checkbox, RadioGroup, Switch, SegmentedControl, Card, ListRow, Badge/StatusPill, **RiskometerGauge**, PrcMatrix, **MoneyText**, PercentText, **FreshnessLabel**, Stepper/Checklist, Toast, Banner, Sheet/Dialog (@gorhom/bottom-sheet on native, Radix Dialog on web), Skeleton, EmptyState, ErrorState, SearchBar, FilterChips, KeyValueTable, DocumentViewer, **ConsentSheet** (fail-closed; shows the eligible masked destinations and required factors), **DisclosureFooter**, **RegularPlanNotice**, FundCard, HoldingRow, SipRow, OrderTimeline, NavLineChart (react-native-svg; RNW renders SVG on web), **AllocationBar**, UpiQr, UpiAppPicker, SignatureCaptureGuide, ExternalBadge, LotTable, CoverageNote, RefundCard, PayoutStatus, ServiceRequestTimeline, CoolingOffBanner. **About 45 components, built once**, in three batches (S2, S7, S12). |
| Accessibility (WCAG 2.2 AA) | Contrast ≥ 4.5:1 (CI token test), targets 44 pt / 48 dp native and ≥ 24 px web, visible focus (verified on RNW output), colour never the only signal, money read aloud, chart summaries + data tables, dynamic type 200%, 320 px reflow, reduced motion, OTP paste/autofill (3.3.8), redundant entry (3.3.7). axe in Playwright; TalkBack/VoiceOver pass per release. |
| Formatting (`packages/money`) | `formatInr` `-₹1,23,456.70`; `formatInrCompact` rounds then picks L/Cr; `formatInrEvidence` never rounded; units 3 dp; NAV 4 dp; `formatPct`; `formatXirr` per PO-5; null → "—"; dates `25 Sep 2026`; `holdingMoney()` never shows invested as value (ported from `FE/v2-ui/lib/format.ts:89-107`) |
| Charts | d3-shape/d3-scale geometry in `app-core` → `react-native-svg` (native and RNW) and plain `<svg>` in www islands |

---

## O. Security and compliance

### O.1 DPDP (DPDP-R; most duties from 13-May-2027, before the P50 launch; SPDI Rules until then)
- **Notice:** standalone, itemised, versioned, before mobile capture. Separate KYC and CAS notices. **It names every processor and recipient:** Cybrilla (FP/POA), ONDC network participants, KRAs/CKYC, DigiLocker/eSign providers via Cybrilla, AMCs/RTAs (CAMS, KFintech), MF Central (guided changes), MSG91, AWS (India), Amazon SES, Expo (push, no PII), Sentry (scrubbed error telemetry) (MS-27).
- **Consent:** optional consents (CAS, product emails) withdrawable in one tap. Core processing rests on contract and legal obligation.
- **Rights:** privacy centre for access (export job), correction, erasure (legal hold explained), grievance. 90-day SLA tracked (target 30). DPO/grievance officer published.
- **Security:** §C.10, TLS 1.2+, least privilege, logs ≥ 1 year, processor contracts.
- **Breach:** runbook — affected users without delay; the Board within 72 h; **CERT-In within 6 h (CERTIN)**.
- **Retention:** §C.11 (redaction through `plz_retention`).
- **Children:** investors are 18+. Minor-nominee data is processed under legal obligation (OI-10).
- **Localisation:** servers, DB, backups, logs, documents and audit are in ap-south-1. Sentry receives scrubbed events only (no PII, ids hashed, no URLs with ids or queries, no bodies). Self-hosting Sentry in ap-south-1 is the fallback if counsel requires it (OI-15).

### O.2 CERT-In (MS-27)
- ICT logs (ALB, CloudFront, WAF, VPC flow, CloudTrail, app) are kept ≥ 180 days in ap-south-1 (we keep 400).
- Clocks: ECS Fargate and RDS use Amazon Time Sync. Counsel/CISO confirm it counts as "traceable" under CERTIN (OI-16). If not, the worker's `clock.check` job compares against `time.nplindia.org` hourly and alarms on skew > 1 s.
- 6-hour incident reporting and a named POC are in the security runbook.

### O.3 Audit
`audit_events` (append-only) records:
- auth events, every consent step, every transition (plus `order_events`), every provider write;
- every admin mutation with reason, **every admin view of an investor record with a reason code** (MS-29), unmasks;
- flag/config changes, approvals, publishes, NAV resolutions, ledger adjustments, service-request actions.

Exported daily to S3 Object Lock (compliance mode, 8 years).

### O.4 OWASP ASVS 5.0 Level 2 targets

| Area | Control |
|---|---|
| Authentication | OTP limits; new-device SMS + email; no investor passwords; argon2id + TOTP for admin; no default accounts; no bypass codes |
| Sessions | Opaque tokens, `__Host-` cookies, device binding, idle and absolute timeouts, instant revocation (epoch) |
| Access control | Deny by default; `investor_id` only from the session; **BOLA suite** (other investor's id → 404); **cross-host suite** (admin route through app → 404, investor route through ops → 404); admin cannot transact or re-submit |
| Transaction integrity | Consent five-layer defence (§F.1); distinct second factor; cooling-off windows; tenant-wide recon |
| Validation | Zod in/out, Drizzle ≥ 0.45.2, magic-byte uploads |
| Crypto | KMS, AES-GCM with row-bound AAD, HMAC, `crypto.randomInt` |
| Data protection | No PII in URLs; `no-store`; allow-list redaction; encrypted consent evidence |
| API | Idempotency, rate limits, webhook HMAC, typed errors without stacks, OpenAPI breaking-change gate |
| Supply chain | Lockfile, build-script allow-list, `pnpm audit`, CodeQL, gitleaks, SBOM |
| Pen test | External, before any real money (S20) |

### O.5 Headers and CSP
- **app** (all routes dynamic, MED-12): `default-src 'self'; script-src 'self' 'nonce-{n}' 'strict-dynamic'; style-src 'self' 'unsafe-inline'` (RNW/Uniwind runtime style insertion); `img-src 'self' data:; connect-src 'self' https://*.ingest.sentry.io; frame-ancestors 'none'; form-action 'self' https://*.fintechprimitives.com https://*.cybrilla.com; base-uri 'none'; object-src 'none'`. The FP form-action hosts are confirmed from P-01 redirect targets.
- **www:** `script-src 'self' 'unsafe-inline'` (cached, no session, different origin from the API).
- **ops** (Vite SPA, HIGH-4): `default-src 'self'; script-src 'self'; style-src 'self'` (`'unsafe-inline'` for styles only if the S0 skeleton shows a violation); `connect-src 'self' https://*.ingest.sentry.io; frame-ancestors 'none'; base-uri 'none'`, plus `X-Robots-Tag: noindex`. **S0 acceptance:** the admin skeleton hydrates under this exact CSP on CloudFront.
- All hosts: HSTS preload, nosniff, strict referrer policy, `Permissions-Policy: camera=(self) geolocation=(self)` on KYC routes only, COOP. API responses: `default-src 'none'`.
- **A Playwright check fails on any CSP violation report.**

### O.6 Regulatory disclosures per screen

| Screen | Required |
|---|---|
| Every footer, About, emails, SMS | "Platizio … AMFI-registered Mutual Fund Distributor, ARN-xxxx", grievance, SCORES/ODR, Investor Charter |
| Catalogue | Standard warning; "Regular plans: Platizio earns commission" + link; "Sorted as you chose; not a recommendation" |
| Fund page | Warning; Regular-plan + commission; SID/KIM/SAI; both riskometers; PRC (debt); TER + as-of; exit load; minimums; AUM; NAV + date; category; managers; objective; returns vs benchmark TRI with source and as-of; past-performance line |
| Order review / consent | Regular plan + commission; documents; riskometer; expected NAV date + rule (re-rendered at approve); stamp duty 0.005% estimate; exit load; ELSS lock-in (strict date); execution-only declaration verbatim (AMFI-MFD); inappropriateness warning + acknowledgement; "Payments appear as Cybrilla"; **TPV line**; OTP destinations (masked) |
| Redemption | Units held, locked, reserved; unlock dates; exit load; capital-gains/TDS note; **payout bank from the folio record**; T+3; "cannot be reversed"; residual-balance note when a buffer applies; cooling-off banner when active |
| SIP / mandate | Standing-mandate terms, limit, pre-debit notification, cancellation rights and the "may still be debited within 2 working days" note, auto-cancel after failures, 7-day registration window, first instalment date re-confirmed |
| Nomination | Annexure-B verbatim; the FP-limit disclosure (PO-7); fields held only on Platizio; acknowledgement per change **only on RTA confirmation**; half-yearly nudge |
| Dashboard | NAV as-of, coverage, "units being confirmed", refund/payout cards, reconciliation caveats, "External" labels, XIRR label (PO-5) |
| Tax reports | Informational; "RTA statement prevails"; old-regime ELSS note; reconciliation caveats |

No fees, cashback, referral money, testimonials or rankings. T&C versioning: a `requires_reacceptance` publish blocks purchases (`DECLARATION_OUTDATED`) but not exits.

### O.7 Pooling and payment-aggregator gate (MS-20)
Gate **G3** requires, in writing:
- Cybrilla's RBI PA (or PA-CB) authorisation status for the ONDC collection flow;
- the escrow/nodal flow into scheme accounts;
- AMC service agreements covering the ONDC route;
- counsel sign-off OI-5 against SEBI-MC pooling rules.

Until then, A3 is only an assumption and real money is blocked.

---

## P. Testing strategy

| Layer | Tool | Scope and gate |
|---|---|---|
| Unit | Vitest 5.0.1 | `money` + `domain` ≥ 95% lines/branches; api ≥ 80% |
| Golden vectors | Vitest | XIRR V1–V7 + extras; FIFO/holdings (v1 expectations kept as `it.skip("v1 parity")` where v2 differs); redemption with the buffer function; **ELSS strict incl. 29-Feb, month-end, holidays**; **redeem-all with locked lots at NAV ±3%**; stamp duty; SIP/mandate incl. first-date rule; nomination incl. equal split and FP limits; OTP; KYC table; AMFI parser and floors; cut-off matrix (~40 cases); formatting; templates; **tax constants rules.v2026 incl. sale-consideration definition**; sipCounts; XIRR display thresholds |
| Property | fast-check | Canonical hash stability; FIFO conservation; decimal round-trips incl. lossless FP JSON; largest remainder; `canTransition` closure (every §F transition is in the table) |
| Integration | Testcontainers postgres:18.6 | Every CHECK and partial unique (negative tests); **`trg_consent_guard` (wrong investor, wrong subject, unconsumed, consumed later)**; readiness trigger; decrypt with a swapped rowId fails; optimistic locking; idempotency; transactional enqueue; webhook dedupe, re-fetch ordering, rejected-signature storage; **saga crash injection:** purchase, SIP, redemption, switch, payment; **confirm timeout on redemption and switch → RECONCILING, reservation kept**; **UNITS_SHORTFALL does not roll back**; **consent mismatch commits SUPERSEDED with no record**; **retry after consume uses useConsumed and adopts via T6**; ladder capped at the saga window; concurrent redemption drafts (advisory lock); BOLA + cross-host suites; CAS other-PAN rows discarded and not logged |
| FP contract | Same suite vs `FakeFpGateway` (every PR) and **FP sandbox** (nightly + manual) | Onboarding chain; chosen KYC adapter; purchase; plan lifecycle; mandates incl. external cancel; redemption; payments pre-check; folios; holdings; tenant reports; **capability probes P-01..P-14**. A green probe run id is the `evidence_ref` required to enable a money flag. **A red sandbox run opens a triage ticket (1-business-day SLA). Releases are blocked only by the FakeFp suite and by sandbox failures confirmed as our bug** (MIN-3). |
| Web e2e | Playwright 1.63.0 on compose + FakeFp + fake SMS | Sign-up incl. new-device email factor → KYC → lumpsum (UPI ok/fail/retry, netbanking, TPV refund) → SETTLED and UNITS_PENDING → dashboard; SIP + mandate + invest-today; mandate revoked externally; redeem (amount, all, ELSS-locked, residual); switch; SIP modify/pause/cancel; reports; CAS; COB with cooling-off; folio contact mismatch (consent routed to folio contact; blocked when unreachable); admin maker-checker flows; **consent tamper** (edit the DB between approve and execute → CONSENT_MISMATCH, no FP call); checkout-intent via `?intent=`; **CSP violation check**; axe on every page. Smoke on PR, full nightly. |
| Native e2e | Maestro 2.10.0 (Android emulator on mobile PRs; iOS via EAS nightly) | Login, onboarding, lumpsum with deep-link return, SIP, redeem with device-key consent, app-lock gating before queries |
| Real-device perf | Lab Moto G / Firebase Test Lab | Cold start, per release |
| Load | k6 (S19) | 200 concurrent browsing + 20 orders/min: reads p95 < 300 ms, **dashboard (on read) p95 < 150 ms** |
| Security | gitleaks, `pnpm audit`, CodeQL, ZAP weekly on staging, external pen test (S20) | Critical/high findings block real money |

**CI gates per PR:** `biome ci` · typecheck · unit + property · integration · `gen:states` diff · `db:check` · OpenAPI diff · boundary check · bundle budgets · Playwright smoke · Maestro Android smoke (mobile changes) · gitleaks + audit · M1–M6 SQL after smoke · `expo-doctor`.

**Review policy (MIN-3, stated accurately):**
- Every PR needs **one approving review from the developer who did not author or prompt it**. CODEOWNERS routes money paths to both developers, but GitHub enforces only one non-author code-owner approval.
- Compensating controls on money paths (`packages/money`, `packages/domain`, `modules/{legal-consent,orders,payments,portfolio}`): golden vectors and property tests must be added or updated in the same PR (CI checks path-coupled test changes), and the integration crash suites must pass.
- Review time is a roadmap line: 1 day per sprint.

---

## Q. DevOps

| Area | Decision |
|---|---|
| Local (Windows 11) | Docker Desktop (WSL2), `docker compose up` (postgres:18.6-trixie, mailpit) → `pnpm i` → `pnpm db:migrate` → `pnpm db:seed` → `pnpm dev` (api, worker, web, admin; Expo separately). Fakes by default. `LongPathsEnabled`, `core.longpaths`, `subst S:` for local Android builds; iOS via EAS. `.claude-flow/` git-ignored. |
| CI/CD | GitHub Actions `ubuntu-24.04` with pnpm and `.turbo` caches. Main → arm64 images to ECR → migrate task → **dev** → smoke. Tag `v*` → **staging** → manual approval → **prod** (ECS rolling, circuit-breaker rollback on api, web **and worker**). Admin: `vite build` → S3 sync + CloudFront invalidation. Mobile: EAS Update `preview` on main; EAS Build + Submit on release branches. |
| Environments | local (fakes) · dev (FP sandbox) · staging (release candidates, FP sandbox, UAT, pen test) · prod (FP production). Accounts `plz-nonprod`, `plz-prod`; SCPs restrict to ap-south-1 (+ ap-south-2 backups if counsel allows). |
| Compute (ap-south-1) | ECS Fargate Graviton. `web` 2 × (0.5 vCPU / 1 GB), max 6. `api` 2 × (1 vCPU / 2 GB), max 6. **`worker` 2 × (1 vCPU / 2 GB), max 4** (MED-7). Admin on S3. |
| Edge | CloudFront × 3 (each injects the origin secret + `x-sanchay-edge`). IPv6 per §E.1 (IPv4-only until P-06 passes, then dual-stack). ALB restricted to the CloudFront prefix list. WAF: managed rules, rate rules with the webhook exemption, ops IP allowlist. |
| Database | RDS PostgreSQL 18.6. Prod `db.m7g.large` Multi-AZ, gp3 200 GB, force_ssl, KMS, PITR 35 days, Performance Insights, deletion protection. Nonprod `db.t4g.medium`. Migrations via a one-off task (expand/contract). |
| Storage and keys | S3 `docs`, `reports` (7-day lifecycle), `audit` (Object Lock), `feeds` (RTA mailback drop, 90-day lifecycle), `admin-site`; CAS prefix unversioned. KMS CMKs `pii`, `s3`, `rds`. Secrets Manager, with FP secrets scoped to the worker role and a CloudTrail alert on other readers. |
| DR | RPO 5 min, RTO 4 h. Weekly snapshot to a second vault; cross-region ap-south-2 only if counsel confirms. Restore drill in S20. |
| Observability | pino → CloudWatch Logs Insights. Sentry (scrubbed) on api, web, admin, mobile. **Alarms:** 5xx, p95, RDS, **pg-boss queue age**, **worker heartbeat**, DLQ, NAV missing, stuck/RECONCILING/UNITS_PENDING SLAs, invariant failures M1–M6, webhook signature failures, OTP send failure > 5%, refund overdue, payout delayed, FP-secret access anomaly. EMF metrics. Synthetics on fund page and `/meta/app-config`. P1 pages the on-call developer. |
| Runbooks | Worker outage; FP outage; SMS outage; NAV feed failure; consent mismatch spike; tenant-recon M6 page (credential compromise: rotate, freeze, notify Cybrilla); CERT-In 6 h report; DPDP breach |
| Cost | Prod ~US$800–1,000/month (extra worker), nonprod ~US$300/month |

---

## R. Delivery roadmap (2 devs + AI agents; 2-week sprints from Mon 2026-09-28)

### R.1 Capacity model (BLK-2)
- **Raw capacity:** 2 devs × 10 days × 0.75 focus × 1.35 AI factor ≈ **20 ideal days**, minus holidays: S1 −1 (Dussehra), S3 −4 (Diwali week), S6 −6 (year end), S8 −2 (Republic Day), S12 −2 (Holi).
- **Committed = 80% of raw:** S0 16, S1 15, S2 16, S3 13, S4 16, S5 16, S6 11, S7 16, S8 14, S9 16, S10 16, S11 16, S12 14, S13 onwards 16.
- The remaining 20% is **visible buffer**. It is not scheduled and absorbs overruns.
- **Explicit overhead inside every committed sprint:** cross-review of agent output 1.0; FakeFp upkeep 0.5 (from S3).
- **Velocity re-baseline:** at the end of S2 (2026-11-06), the measured completed ideal days replace the 1.35 assumption. The PO is shown the new P50/P80. Scope is never shrunk silently.
- **Total planned work:** ≈ 355 committed days (features ≈ 268, hardening ≈ 35, pilot and stabilisation ≈ 29, overhead ≈ 23).

### R.2 Launch-date confidence (PO-4)

| Confidence | Public launch | Basis |
|---|---|---|
| P50 | **Mon 2027-07-05** | About half the buffer consumed (~18 days/sprint effective) |
| **P80 (plan of record)** | **Mon 2027-08-16** | All buffer consumed (committed schedule below) |
| Earlier dates | 2027-06-21 needs zero overrun (≈ P20). The v1.0 date 2027-05-10 is < P10. | — |

Levers **requiring PO sign-off** (each is an amendment, never a default):
- (i) a third full-stack developer from S4 → P80 ≈ 2027-06-28;
- (ii) a decision-4 amendment moving CAS import (9 days) and STP/SWP (≈ 9 days) to a 4-week fast-follow → P80 ≈ 2027-07-26.

### R.3 Sprint plan (committed days; each sprint also carries review 1 and FakeFp 0.5 from S3)

| Sprint | Dates | Commit | Backlog (ideal days) |
|---|---|---|---|
| S0 | 09-28 → 10-09 | 16 | Monorepo, CI, check-boundaries, CODEOWNERS, AGENTS.md (2.5) · **lockfile dry-run + ADR-0001 versions (React single copy or per-app)** (0.5) · oRPC/Nest/Fastify gate incl. **typed error round-trip** + EdgeGuard stub (2.5) · Drizzle baseline, migrate, Testcontainers (2) · **universal-UI spike + ADR-0002 (RNW bundle measured)** (2) · Expo 57 dev build + native module pin list (1) · Next www/app skeleton (dynamic app routes, nonce CSP) + **admin Vite skeleton hydrating under prod CSP** + bundle baseline ADR-0003 (1.5) · **FP probe pack P-01..P-14 + written questionnaire Q-C1..Q-C14 sent on 09-28** (3). *PO track: Cybrilla ONDC/ARN + POA, MSG91 + DLT, Apple/Google org accounts, counsel engaged, PO-1/4/5/6/7 decisions.* |
| S1 | 10-12 → 10-23 | 15 | Platform kernel: config, pino allow-list, cls, scrubbed Sentry, crypto (app ids + AAD), audit, idempotency, JobsModule, output validation, EdgeGuard (6) · `packages/money` port + vectors (2) · OTP engine + MSG91 + SES + DLT templates (3) · CDK nonprod incl. dual-stack switch per P-06 (3) |
| S2 | 10-26 → 11-06 | 16 | Sessions web + native, device trust, new-device email factor (2.5) · auth screens (universal) (1.5) · **`packages/ui` batch 1** (tokens, ~20 components, a11y tests) (4) · admin auth, TOTP, RBAC, bootstrap (3) · domain batch 1: XIRR, FIFO, validators, cut-off + calendar, JCS, **states.md → gen:states** (4). **Ships 11-06: walking skeleton, login on web dev + Android dev build. Velocity re-baseline to the PO.** |
| S3 | 11-09 → 11-20 | 13 | FpGateway core (lossless JSON, tokens, typed errors, allow-list logs) + FakeFp base + contract harness (5) · taxonomy (after the register entry), aliases, schemes, FP catalogue sync (3) · AMFI NAV pipeline part 1 (3.5) |
| S4 | 11-23 → 12-04 | 16 | NAV part 2 (1.5) · returns (2) · onboarding derivation + identity + readiness table + screens (5) · profile/FATCA/address + AMFI validations + **eligibility (US/CA, PEP) + review queue** (4.5) · legal docs, declarations, consent records (1.5) |
| S5 | 12-07 → 12-18 | 16 | **Consent engine core** (challenges, consent_subjects, templates, JCS, approve ordering, consume/useConsumed, ConsumedConsent, `trg_consent_guard`, encrypted evidence, property test) (6) · **ConsentDestinationResolver + folio contacts** (2) · **second factor: device key (native) + web dual OTP** (2) · KYC adapter (chosen) part 1 (4.5) |
| S6 | 12-21 → 01-01 | 11 | KYC adapter part 2 incl. native signature/geo (2.5) · bank + ref tables + penny drop + name match + manual-verify maker-checker (3.5) · nomination (cap config, FP rules, equal split) + **merged attestation challenge** (3.5) |
| S7 | 01-04 → 01-15 | 16 | FP provisioning saga (5) · ops onboarding exceptions + PEP/FATCA review UI (1.5) · FundFactsProvider, admin curation, publish gate, CSV, commission + **scheme tax class** maker-checker (5) · `packages/ui` batch 2 (3) |
| S8 | 01-18 → 01-29 | 14 | Public SEO pages (on-demand, dynamic sitemap) (6) · native explore + fund detail (universal) (3.5) · watchlist incl. `?intent=` (1) · lumpsum saga part 1 (2). **R0 Explore:** indexable catalogue once counsel OI-2 clears and ≥ 100 schemes are published. |
| S9 | 02-01 → 02-12 | 16 | Lumpsum saga part 2 (RECONCILING, UNITS_PENDING) (3) · webhooks, processor, reconcile + **tenant recon** (5) · payments + pre-check + **refunds/late auth/TPV** (4.5) · invariants M1–M6 (1) · crash-injection suite (1). *Cybrilla product demo on sandbox by 02-12.* |
| S10 | 02-15 → 02-26 | 16 | Checkout screens (universal) + platform glue (UPI picker, deep links, return pages) (6) · lots, FIFO, folios, ledger exceptions (4) · valuation, XIRR (PO-5), sipCounts, allocation on read (3) · orders list/timeline (1.5). Share-ratio measured. |
| S11 | 03-01 → 03-12 | 16 | Dashboard + holdings screens (4) · notifications part 1 (SMS/email/push/inbox) (3) · mandates eNACH + UPI Autopay + **external revoke** (5.5) · product_events (1) · risk profile + inappropriateness (1). **R1 internal alpha 03-12** (≈ 8 staff; sandbox; web staging, Play internal, TestFlight): sign-up → onboarding → lumpsum → dashboard. |
| S12 | 03-15 → 03-26 | 14 | SIP saga (bundled consent, first-date rule, re-notify) (5.5) · SIP checkout screens (3.5) · instalment sync (2) · checkout-intent resume + freshness labels (1) · `packages/ui` batch 3 (0.5) |
| S13 | 03-29 → 04-09 | 16 | SIP modify/pause/cancel (5) · SIP screens (2.5) · redemption backend: advisory lock, buffer function, plan reservations, strict ELSS, payout status + watch (7) |
| S14 | 04-12 → 04-23 | 16 | Redemption screens + holding detail (4) · **holdings recon (FP + RTA mailback feed) + externally_modified + pre-exit check** (3) · **ledger adjustments tool** (3) · notifications part 2 + reminders (2) · folio service requests (MF Central guided + OPS_RTA) part 1 (2.5) |
| S15 | 04-26 → 05-07 | 16 | Switch (4) · STP (3) · SWP (3) · switch/STP/SWP screens (4.5) |
| S16 | 05-10 → 05-21 | 16 | Tax constants + capital gains + CSV formats (3.5) · statement + ELSS + evidence PDFs + report jobs (4) · report screens + native download/share (2.5) · **COB + contact change with cooling-off controls** (3.5) · folio service requests part 2 (1) |
| S17 | 05-24 → 06-04 | 16 | CAS import (parser, PAN filter, matching) (7) · external views + native document picker (2) · admin back office part 1 (5.5) |
| S18 | 06-07 → 06-18 | 16 | Admin part 2 (3.5; admin total 9) · DPDP privacy centre, closure, retention role, audit export (3.5) · EUIN/OTP evidence exports (1.5) · security hardening part 1: CSP checks, headers, WAF, BOLA + cross-host suites (4) · perf budgets + low-end device (2). **R2 feature-complete beta 06-18** (~25 internal + ops testers, sandbox). |
| S19 | 06-21 → 07-02 | 16 | Prod account infra, alarms (queue age, heartbeat), runbooks (4) · a11y audit + fixes (3) · **FP production cutover** (credentials by 06-25, webhook secrets, feeds, no investor orders) (3) · Playwright + Maestro part 2 (4) · k6 (0.5) |
| S20 | 07-05 → 07-16 | 16 | **External pen test + remediation** (6) · FP contract suite completion (2) · store listings, data safety, privacy labels, submissions to closed tracks (3) · k6 + DR restore drill (3) · fixes (0.5). **Real-money go/no-go G1–G11 on 07-16 → founders' ₹500 orders.** |
| S21 | 07-19 → 07-30 | 16 | **R3 production pilot**, invite-only ≤ 50: support rota (4), pilot fixes (8.5), flag enablement with prod evidence (2) |
| S22 | 08-02 → 08-13 | 16 | Stabilisation/bug fixes (10.5) · compliance sign-off + **public go/no-go Fri 2027-08-13** (2) · staged store rollout prep (2) |
| **R4** | **Mon 2027-08-16 (P80)** | — | Public launch on web, Android and iOS; hypercare in S23 |

### R.4 What ships to whom, when

| Release | Date (plan) | Audience |
|---|---|---|
| Walking skeleton | 2026-11-06 | Team |
| R0 Explore | ≥ 2027-01-29, on OI-2 | Public (SEO) |
| R1 alpha | 2027-03-12 | ≈ 8 staff, sandbox |
| R2 beta | 2027-06-18 | ~25 staff + ops, sandbox |
| R3 pilot | 2027-07-19 | ≤ 50 invitees, real money |
| R4 launch | 2027-08-16 | Public |

### R.5 Go/no-go gates for real money (S20) and public launch (S22)

| Gate | Condition |
|---|---|
| G1 | Pen-test critical/high findings fixed |
| G2 | EUIN policy: counsel OI-1 + Cybrilla Q-C1 in writing (MS-10) |
| G3 | PA/escrow/AMC agreements Q-C11 + counsel OI-5 (MS-20) |
| G4 | Holdings reconciliation MATCHED end-to-end via FP (P-12) or RTA mailback (MS-05) |
| G5 | P-07 allotted-units pass (HIGH-1) |
| G6 | ARN attribution evidence P-05 (MIN-4) |
| G7 | FP prod credentials, webhook secrets, NAT EIP allowlist |
| G8 | DR drill passed |
| G9 | Every decision-4 capability proven on prod or sandbox evidence, **or a PO-signed amendment** (PO-2) |
| G10 | DPDP notice and processor list approved by counsel; CERT-In runbook |
| G11 | Store approvals (public launch only) |

### R.6 Critical path
1. Cybrilla: questionnaire answers by 10-09, ONDC/ARN signup, POA agreement, sandbox demo by 02-12, production credentials by 06-25, holdings/RTA feed live by 06-18.
2. S0 probe results (10-09) → PO-2 escalations (10-16).
3. MSG91 + DLT templates by 10-30.
4. Counsel:
   - by 12-18: EUIN, SEO, T&C/privacy, retention, nomination channels (OI-14), CERT-In time source;
   - by 01-29: the regulatory register re-mapped to the edition in force;
   - by 02-26: ITA 2025 wording.
5. Store organisation accounts by 11-30.
6. Fund-facts curation of ≥ 150 schemes plus tax classes (ops person from S7).
7. Internal chain: FP client → consent engine → provisioning → lumpsum → ledger/recon → mandates → SIP → redemption → switch/STP/SWP.

---

## S. Risks, assumptions and open questions

| # | Item | Type | Owner | Mitigation / default |
|---|---|---|---|---|
| R1 | Cybrilla production go-live slips | Risk (critical) | PO | Start day 1, weekly follow-up; pilot and launch move with credentials; sandbox beta continues |
| R2 | ONDC lacks a decision-4 capability | Risk (critical) | Dev A → PO | S0 probes; PO-2 escalation (no silent hide) |
| R3 | Blank EUIN on 100% of orders treated as not "exceptional" | Regulatory | Counsel | G2 hard gate; evidence exports; DESIGNATED_EUIN ready |
| R4 | Neither KYC adapter works for the tenant | Risk | Dev A | P-03 in S0; escalate to Cybrilla the same week |
| R5 | Omitted `euin` auto-filled at FP | Risk | Dev A | P-04 + Q-C1 |
| R6 | Webhook canonical form or retries undocumented | Risk | Dev A | Dual verification; polling and event sweep |
| R7 | Universal UI (RNW + Uniwind) underperforms on web or low-end Android | Risk | Dev B | S0 spike with exit criteria; NativeWind fallback; split-kit fallback with 1.6× re-estimate (ADR-0002) |
| R8 | oRPC Nest edge cases | Risk | Dev A | S0 gate incl. typed errors; fallback stack |
| R9 | Nest 11 legacy tag | Risk | PO/Dev A | PO-1 |
| R10 | Fund-facts and tax-class curation load | Risk | PO (Ops) | Publish only complete schemes; CSV; vendor port |
| R11 | SEO/returns sorting counts as advertisement | Regulatory | Counsel | Neutral sort; `seo.indexable` after OI-2 |
| R12 | CAS layout variety | Risk | Dev A | CAMS/KFin detailed only; typed failures |
| R13 | Two-developer bus factor on money code | Risk | PO | Specs, golden vectors, runbooks; lever (i) third developer |
| R14 | SMS/DLT outage blocks login and consent | Risk | Dev A | Known-device email login; email consent where the folio email is eligible; secondary SMS integrated after launch |
| R15 | Double debit / orphan payments / refunds lost | Risk | Dev A | Pre-check, partial uniques, M3/M5, nightly payments.recon, refund SLA |
| R16 | FP rejects IPv6 `user_ip` | Risk | Dev A | P-06; config-driven IPv4-only edge + 422 |
| R17 | FP holdings not populated for ONDC folios **and** RTA mailback delayed | Risk (critical) | Dev A → PO | G4 blocks real money; request CAMS/KFin mailback for the ARN in S0 |
| R18 | FP tenant credential compromise | Risk | Dev A | Worker-only secrets, access alerts, IP allowlist, M6 tenant recon, rotation runbook |
| R19 | Account takeover via SIM swap | Risk | Dev A | New-device email factor, device key/dual OTP at consent, cooling-offs, old-contact notifications, folio-registered OTP destinations |
| R20 | Estimates optimistic even at 80% | Risk | PO | S2 re-baseline; P50/P80 published; levers need sign-off |
| A1 | Resident individual, single holder, 18+ | Assumption | PO | CHECKs + copy; US/CA via review |
| A2 | FP reports `allotted_units` on success | Assumption → **probe P-07 + gate G5** | Dev A | UNITS_PENDING state; feed + MANUAL maker-checker path |
| A3 | Cybrilla PA/escrow and AMC agreements satisfy pooling rules | Assumption → **gate G3** | Counsel | — |
| A4 | Cybrilla POA is the KYC user agency | Assumption | Counsel + Cybrilla (OI-4) | — |
| A5 | 8-year retention | Assumption | Counsel (OI-9) | Config-driven purge |
| A6 | No dedicated designer; screens are designed in code from RN Reusables defaults + tokens | Assumption | PO | Design review each sprint demo |

**Questions sent to Cybrilla on 2026-09-28:**

| # | Question |
|---|---|
| Q-C1 | Does a blank EUIN reach the AMC? Is an execution-only tag expected? |
| Q-C2 | Units / switch / STP / SWP / skip / quarterly / step-up on cybrillapoa |
| Q-C3 | Event names (`review_completed`, `pre_verification.*`, `kyc_form.*`) |
| Q-C4 | Webhook HMAC canonical input and retry policy |
| Q-C5 | UPI Autopay for the tenant; `mandate_type` case |
| Q-C6 | `kyc_forms` access for the tenant |
| Q-C7 | IPv6 `user_ip` acceptance |
| Q-C8 | ARN attribution on ONDC orders (tenant-level or payload field) |
| Q-C9 | Nomination / COB / contact change instructions for existing folios via FP |
| Q-C10 | Holdings report and `redeemable_units` for ONDC folios; RTA feeds |
| Q-C11 | RBI PA status, escrow flow, AMC agreements |
| Q-C12 | Exact field and timing of allotted units for purchase, instalment and switch-in |
| Q-C13 | `related_parties` rules (ID requirement, 40-character names, max nominees) |
| Q-C14 | Tenant-level list reports; IP allowlisting; webhook source ranges |

**Counsel and CA items:**

| # | Item | Due |
|---|---|---|
| OI-1 | EUIN policy | 12-18 |
| OI-2 | SEO as advertisement | 12-18 |
| OI-3 | Risk profile mandatory? | 12-18 |
| OI-4 | KYC user agency | 12-18 |
| OI-5 | Pooling | 12-18 |
| OI-7 | 2FA for plan changes (default yes) | 12-18 |
| OI-8 | ITA 2025 wording; specified-MF definition | 02-26 |
| OI-9 | Retention | 12-18 |
| OI-10 | Minor-nominee DPDP basis | 01-29 |
| OI-11 | ELSS unlock day (default strict) | 02-26 |
| OI-12 | Stamp duty in cost | 02-26 |
| OI-14 | Nomination/attest OTP channels per SEBI-NOM/SEBI-NOM-A | 12-18 |
| OI-15 | Sentry SaaS acceptable with scrubbing | 12-18 |
| OI-16 | Amazon Time Sync as a CERT-In time source | 12-18 |
| OI-17 | COB cooling-off days (default 10) | 12-18 |

---

## T. Critic resolutions

| Issue | Resolution |
|---|---|
| **BLK-1** | Split kits (ui-web/ui-native) replaced by one universal `packages/ui` + `packages/features` screens. Native renders them directly; `apps/web` `(app)` renders them through react-native-web; www stays RSC + Tailwind (§A.1, §L.1, §L.4, §N). `/app/explore` and `/app/funds/[slug]` deleted; the app links to www fund pages (§L.1, §I.6). S0 two-day spike with exit criteria and measured RNW bundle cost recorded in ADR-0002; the split-kit fallback carries a mandatory 1.6× re-estimate (§N, §R.3 S0). Estimation rule: universal = 1.15× (§A.1). |
| **BLK-2** | Planned at 80% (16/sprint committed, holiday-adjusted) with visible buffer. Explicit lines for review (1/sprint), FakeFp upkeep (0.5/sprint from S3), three component-library batches, native capability plumbing, DLT templates and admin (9 days, up from 6). Velocity re-baseline at S2. P50 2027-07-05 / P80 2027-08-16 published (§R.1–R.3). MED-1 cuts applied. |
| **BLK-3** | PO-2 inverted: no default hide. An unproven capability is a PO escalation and gate G9. Probes run in S0 with results by 10-09 and the PO decision by 10-16. The pause fallback no longer counts as pause. The scope-levers paragraph is recast as explicit amendments needing PO sign-off (§0.2, §R.2, §F.5). |
| **HIGH-1** | A2 becomes probe P-07 with a pass criterion and gate G5. UNITS_PENDING state, no lot, "units being confirmed" display, `orders.units.reconcile`, SLA alerts at T+3/T+5, FEED and MANUAL (maker-checker) paths. The three-key guessing is not ported (§F.0, §F.4, §H). |
| **HIGH-2** | PO-5 default: XIRR at ≥ 30 days with an annualised warning under 1 year and absolute return alongside. The v1 null rules are ported unchanged (§0.2, §H). |
| **HIGH-3** | Native token rotation removed. Opaque server-side token with installation binding, idle/absolute expiry, instant revocation via epoch. Queries gated on app-lock (§E.2, §M.1). |
| **HIGH-4** | Admin rebuilt as a Vite + React SPA with TanStack Router (runtime dynamic routes, no inline scripts, strict CSP). S0 acceptance: hydrates under the production CSP (§A.1, §O.5, §R.3 S0). |
| **HIGH-5** | Probe P-06 and Q-C7. `fp.userIpFamilies` config; IPv4-only until proven, then dual-stack. DB family CHECK removed (`inet NOT NULL`). Dedicated 422 `CLIENT_IP_UNSUPPORTED`. CGNAT caveat documented for counsel (§E.1, §C.6, §D.4). |
| **MED-1** | One KYC adapter (P-03 selects). Tax holding rules as versioned code constants (the per-scheme class stays data per MS-18). Dashboard computed on read, snapshots removed. provider_calls unpartitioned with a retention job. CSRF synchronizer dropped (SameSite + Origin + Sec-Fetch-Site + custom header). Secondary SMS after launch. Roughly 15 days recovered (§G.3, §H, §C.9, §E.2, §K). |
| **MED-2** | Attestation merged: one ONBOARDING_ATTEST challenge covers the review, declarations and nomination/opt-out. OTP round-trips drop to 3 screens (existing KYC) and are measured per path. The dual-channel basis is cited to SEBI-NOM/SEBI-NOM-A with URLs; OI-14 may reduce it to one channel via config (§G.1). |
| **MED-3** | Every id is app-generated before insert (`newId`, `$defaultFn`). `encrypt()` requires a `RowId` (boundary check). Integration test: a swapped rowId fails to decrypt (§C.1, §A.3, §P). |
| **MED-4** | DB CHECK widened to 1..10. `NOMINATION_MAX = min(10, FP max)` enforced by trigger. P-11 checks FP's maximum. PO-7 / counsel-signed limitation if FP = 3. Primary source cited (§C.4, §0.2). |
| **MED-5** | Canonical `docs/specs/states.md` → generated CHECK, Zod and `canTransition`. §F.0 lists every state, finality and transition. Vocabulary unified (SETTLED, payout as a separate column). DRAFT/NEEDS_RECONSENT removed. SIP mandate_id always set. Closure test added (§F.0, §A.4, §C.6). |
| **MED-6** | Approve order specified: the hash is compared before the record is inserted; on mismatch SUPERSEDED + audit is committed with no record. The first attempt uses consume; retries use useConsumed after a T6 lookup. The ladder is capped at the saga window, then RECONCILING or CONSENT_EXPIRED. Crash tests added (§F.2, §P). |
| **MED-7** | Worker minimum 2 tasks; heartbeat table and alarm; queue-age alarms; circuit-breaker rollback; outage runbook with bulk clone (§J, §Q). |
| **MED-8** | Units mode sends the exact unlocked units. Otherwise the buffer-applied amount, a residual disclosure and a "Redeem remaining" action. Golden vectors at ±3% (§F.6, §P). |
| **MED-9** | oRPC native error shape with `code`, `retryable`, `requestId`. RFC 9457 dropped. The typed round-trip is part of the S0 gate (§B.5, §D.1). |
| **MED-10** | Native modules pinned via `npx expo install` in S0 (image picker, location, document picker, file-system, sharing, svg, screen-capture, bottom-sheet). Capability lines in S6, S16 and S17. Privacy labels, Data safety and usage strings in S20 (§A.2, §M.3, §R.3). |
| **MED-11** | Budgets = measured S0 baseline + per-route delta, computed from build manifests. Play download size (arm64) instead of AAB size. Cold start on a real low-end device per release, not per PR (§L.5, §M.3). |
| **MED-12** | All app-host routes dynamic via `connection()` in the `(auth)`/`(app)` layouts; no static login shell. www renders on demand with no build-time params; dynamic sitemap; CI builds need no backend. Playwright CSP-violation check (§L.1, §I.7, §P). |
| **MED-13** | First S0 task is a lockfile dry-run plus ADR-0001 with `pnpm view` outputs and dates. Per-app React via overrides with peer-dep packages if one copy is impossible. pg-boss pin re-verified (§A.2, §R.3). |
| **MIN-1** | Added `/app/notifications` (web), `profile/legal` and `profile/notifications` (native), and `profile/close-account` on both. Pre-login intent carried in the CTA URL `?intent=` (§L.1, §M.1, §G.1). |
| **MIN-2** | PO-6 on the meaning of top-up (default one-off amount change; step-up only if FP supports it). `active` = ACTIVE only, displayed as "N active · M paused". One TS implementation, no SQL view. One nudge rule (half-yearly) (§0.2, §H.1, §J, §O.6). |
| **MIN-3** | Review policy described accurately: one non-author reviewer plus path-coupled test requirements. A red sandbox run becomes a triage ticket (1-business-day SLA); releases blocked only by FakeFp or a confirmed own bug (§P). |
| **MIN-4** | P-05 checks ARN attribution in the sandbox order/RTA view; Q-C8; gate G6 (§F.3, §R.5). |
| **MIN-5** | Primary-source register with URL, date and retrieval date (top of document, `regulatory-sources.md`). The unverifiable 2026 category circular blocks seeding until recorded. Sections renumbered (H.1–H.4, L.1–L.5 contiguous). Friday date correction kept. |
| **MIN-6** | CloudFront-injected `x-sanchay-edge` + global `EdgeGuard` binds admin to ops and investor to app. Cross-host test suite (§B.5, §O.4). |
| **ONE-THING** | Universal UI adopted (BLK-1) and roadmap re-planned at 80% with P50/P80 (BLK-2). Presented to the PO by the 10-09 PO-4 deadline and re-baselined 11-06. |
| **MS-01** | ConsentDestinationResolver: folio-registered contacts (GET /v2/mf_folios, FP-SW) ∩ contacts we verified (new `investor_contacts` history). The eligible set is hashed. FP receives only the verified channels with folio values (fixes the `InvestorActionService.java:1048-1061` flaw). Unreachable → blocked with a guided change. Playwright mismatch test (§E.4, §C.2, §C.6, §P). |
| **MS-02** | Existing-folio changes are `folio_service_requests` (MF Central guided / OPS_RTA maker-checker / FP_API if available) with honest statuses; acknowledgement only on CONFIRMED. `folio_defaults` scoped to new folios. The payout bank in consents comes from the FP folio record and is hashed (§G.5, §F.2, §C.6). |
| **MS-03** | First-class COB: TPL_BANK_CHANGE, SMS + email OTP (+ device key), penny drop with PAN-name match, old-contact notification, 10-day exit cooling-off (counsel OI-17), no contact+bank change within 10 days, maker-checker for RTA submission, audit, session revocation and push (§G.5, §D.3). |
| **MS-04** | RECONCILING state across aggregates. Release or fail only on re-fetched terminal evidence. The saga window stops writes and does not flip state. `Ledger.applyExit` never rolls back (ledger_exceptions + CRITICAL). Crash tests for confirm timeouts (§F.0, §F.1, §B.4 T6/T7, §P). |
| **MS-05** | Holdings reconciliation (FP holdings report or RTA mailback `HoldingsFeed`) is gate G4. Pre-exit FP `redeemable_units` check. Folio `externally_modified` blocks ALL and caveats tax. Ledger-adjustments tool with maker-checker for merger, segregation, bonus, external flows and IDCW (§H, §F.6, §C.7). |
| **MS-06** | Distinct factors: new-device login needs SMS + email; consent needs a native device key (biometric-gated secret) or web dual OTP for exits and high-value purchases. The DLT consent SMS names action, amount and scheme plus a warning. Email-only login limited to known devices. 72 h exit cooling-off after a contact change, with old contacts notified (§E.2, §E.4, §G.5). |
| **MS-07** | Refund lifecycle on payment_attempts (REFUND_PENDING/REFUNDED, reference, due date), REFUND_OVERDUE break + grievance, investor refund card, TPV copy, nightly `payments.recon` including money on failed orders, `late_auth` handled (§F.9, §C.6, §J). |
| **MS-08** | `payout_status` EXPECTED/CONFIRMED (evidence only)/DELAYED, auto grievance and SCORES/AMC copy, `payout.watch` job (§F.6, §J). |
| **MS-09** | Snapshots and rendered texts envelope-encrypted with row AAD; hashes in the clear. Templates masked. Allow-list redaction for provider_calls and audit. `plz_retention` SECURITY DEFINER redaction of append-only tables (§C.1, §C.3, §C.10, §B.5). |
| **MS-10** | Counsel OI-1 + Q-C1 made hard gate G2. Per-order evidence PDF (declaration, hash, channels, masked destinations, DLR/message ids, IP, device, times). P-04 inspects the ONDC message for EUIN. DESIGNATED_EUIN with boot validation (§F.3, §R.5). |
| **MS-11** | Delivery evidence (masked destination, provider, message id, template id, DLR status/time) copied into `consent_records` at approve and retained 8 years; the code is never stored (§C.3, §C.11). |
| **MS-12** | Monthly batch recheck + quote-time recheck (> 30 days). `can_purchase`/`can_exit` split; exits stay open on ON_HOLD/REJECTED/outdated T&C unless fraud hold. Readiness trigger. Admin cannot set kyc_status without a check row (§C.2, §C.4, §G.2, §J). |
| **MS-13** | admin_approvals kinds added: MANUAL_UNITS, LEDGER_ADJUSTMENT, RECON_RESOLVE_CRITICAL, CONFIG_MONEY_FLAG (evidence_ref required), ARN_EUIN_POLICY, ONBOARDING_OVERRIDE, FOLIO_SERVICE_RTA_SUBMIT, SCHEME_TAX_CLASS. Reconcile actions are re-fetch/apply only (§C.9, §E.3, §D.3). |
| **MS-14** | Nominee/guardian ID required with the reason shown; 40-character limit; deterministic equal split (33.34/33.33/33.33) hashed; disclosure of fields held only on Platizio; Q-C13/P-11 (§C.4, §G.1). |
| **MS-15** | SIP snapshot hashes `installment_day` + rule; date shown, re-computed at registration and re-notified. NAV-date line re-rendered at approve (both kept). Payment-sheet live date. `cutoff.monitor` raised to WARN (§F.2, §F.5, §F.8, §C.3). |
| **MS-16** | Advisory lock in draft; reservations for the next SWP/STP instalments; SUBMITTED/PROCESSING exits stay reserved until settled; platform units at 3 dp; volatility-based buffer (2% floor, 10% cap); ALL refused while SWP/STP active; amount quotes refused when the NAV grade is not OK (§F.6, §C.7, §B.4 T4). |
| **MS-17** | Strict rule `expectedNavDate > lock_in_until`; allotment date = FP `allotted_nav_date`; Feb-29 handling; golden vectors; applied to SWITCH_IN/STP_IN/ADJUSTMENT_IN (§F.8, §C.7). |
| **MS-18** | `scheme_tax_classes` effective-dated per scheme with CA source and maker-checker; publish and report blocked without it; sale consideration and cost defined; "RTA statement prevails" label; reconciliation caveats (§C.5, §H.3). |
| **MS-19** | Daily tenant-wide recon over FP list reports (M6 CRITICAL); FP secrets worker-only with access alerts; IP allowlist request; rotation runbook (§F.10, §J, §K, §Q). |
| **MS-20** | Written PA/escrow/AMC-agreement confirmation + counsel OI-5 is gate G3; A3 downgraded to a gated assumption (§O.7, §R.5). |
| **MS-21** | US/CA eligibility step → review queue; `amcs.accepts_us_ca` filter; FATCA declaration version in the attestation snapshot (§G.1, §C.4, §C.5). |
| **MS-22** | Only PAN-matching rows persisted; others discarded unlogged with a count shown; body capture off on the route (tested); notice version recorded; failed parses and object versions deleted (§H.4, §C.8, §C.11). |
| **MS-23** | `trg_consent_guard` constraint trigger (status, investor, subject via `consent_subjects`, consumed_at); `cancel_challenge_id` on plans and mandates; M1 extended (§C.3, §C.6, §J). |
| **MS-24** | NONE refused by boot guard and DB CHECK outside local; rejected events keep metadata + hash only; ordering by state machine on the re-fetched object; webhook route exempt from per-IP WAF (§F.1, §F.10, §C.9, §B.5). |
| **MS-25** | lossless-json parsing straight to decimal.js; decimal-string serializer outbound; round-trip property test (§B.5, §K, §P). |
| **MS-26** | Snapshot hashes the eligible destination set, not the channel; the verified channels are recorded in the consent record (§E.4, §C.3). |
| **MS-27** | Sentry scrubbing (URLs, ids, bodies) with self-host fallback (OI-15); CERT-In 180-day logs, time source (OI-16) and 6 h reporting in the runbook; processors named in the notice (§O.1, §O.2, §B.5). |
| **MS-28** | External mandate cancel → linked SIPs MANDATE_REVOKED + re-mandate CTA; daily poll of APPROVED mandates; cancellation copy about debits within 2 working days (§F.0, §F.5, §J). |
| **MS-29** | Every admin view of an investor record audited with a reason code; PEP/RELATED_PEP routed to the onboarding review queue with the decision stored (§O.3, §G.1, §C.4). |

---

### Critical Files for Implementation (v1 read-only references to port)
- `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/integration/RealCybrillaClient.java`: FP payload shapes and quirks for `FpGateway`/FakeFp. Drop the hard-coded `user_ip` (`:3058`, `:3100`), the "1193" branch (`:421-424`) and the "first entry" profile fallback (`:1850-1852`).
- `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/service/TransactionApprovalService.java` with `service/TransactionConsentTemplates.java`, `service/InvestorActionService.java` (`:1048-1061`, both-channel consent flaw) and `common/BaseEntity.java` (`:25-30`, fingerprint bug): consent-engine redesign (§F.2, §E.4).
- `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/service/OrderService.java` (`:578-608` write-before-challenge, `:1024` units key guessing, `:1880-1892` post-consent refusal) and `controller/NavAdminController.java` (`:50-66` DERIVED backfill): the saga and ledger anti-patterns v2 designs out.
- `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/service/nav/SchemeNavSyncService.java`, `integration/nav/AmfiNavParser.java`, `service/XirrCalculator.java`, `service/RedemptionAvailability.java`, `service/CapitalGainsReportService.java`, `service/NominationRules.java`, `service/InvestorKycService.java` (`:669-703`), `domain/KycReadinessAction.java`, plus tests under `src/test/java/com/platizio/wealthtech/service/`: golden vectors and ported rules.
- `C:/Users/pc/Desktop/WeathTech_v2/investor-frontend/src/v2-ui/lib/format.ts` and `C:/Users/pc/Desktop/WeathTech_v2/investor-frontend/src/utils/kycPreVerification.ts`: INR formatting, the "never show invested as value" rule, and the KYC decision engine.

Sources: [SEBI 2FA Sep-2022](https://www.sebi.gov.in/legal/circulars/sep-2022/two-factor-authentication-for-transactions-in-units-of-mutual-funds_63557.html) · [SEBI nomination revamp 10-Jan-2025](https://www.sebi.gov.in/legal/circulars/jan-2025/circular-on-revise-and-revamp-nomination-facilities-in-the-indian-securities-market_90698.html) · [SEBI nomination amendment 28-Feb-2025](https://www.sebi.gov.in/legal/circulars/feb-2025/amendments-and-clarifications-to-circular-dated-january-10-2025-on-revise-and-revamp-nomination-facilities-in-the-indian-securities-market_92377.html) · [SEBI MF Master Circular 27-Jun-2024](https://www.sebi.gov.in/legal/master-circulars/jun-2024/master-circular-for-mutual-funds_84441.html) · [AMFI Master Circular for MFDs](https://www.amfiindia.com/uploads/AMFI_Master_Cicular_for_MF_Ds_3c7f5ee44f.pdf) · [DPDP Rules 2025 (mirror)](https://www.dpdpa.com/DPDP_Rules_2025_English_only.pdf) · [CERT-In directions summary (Lexology)](https://www.lexology.com/library/detail.aspx?g=5eae7307-664d-484e-8a58-f50bc24bb4d2) · [FP switches (folio contacts for OTP)](https://docs.fintechprimitives.com/mf-transactions/onetime-switches/) · [FP redemptions (holdings report redeemable_units)](https://docs.fintechprimitives.com/mf-transactions/onetime-redemptions/)
