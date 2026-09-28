<!-- source: workflow wf_4ef6503f-699 label synthesis | exported 2026-09-28 -->

# Platizio WealthTech — B2C v2 Synthesis Brief
**Prepared by: Synthesis Lead | Scope: investor-led, self-service B2C rewrite | Status: READ-ONLY analysis, no secrets reproduced**

Paths in scope: Backend `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end`, Java `.../src/main/java/com/platizio/wealthtech`, migrations `.../src/main/resources/db/migration`, frontend `C:/Users/pc/Desktop/WeathTech_v2/investor-frontend`, old frontend `C:/Users/pc/Desktop/WeathTech_v2/Front_end`.

Where an adversarial-review verdict corrected a slice claim, the corrected version is used below and flagged `[CORRECTED]`. Section 13 is the full ledger.

---

## 1. The Current System — One Page

**Actors today:** Distributor (`DistributorRole`: ADMIN | MASTER_DISTRIBUTOR | SUB_DISTRIBUTOR, riding on the same `distributors` table — ADMIN is *not* a first-class identity, see §12 Risk #1), Investor (dual-identity: `investors` = distributor-created KYC/profile record; `investor_accounts` = passwordless self-login identity, `V58`).

**End-to-end flow today (B2B2C):** Distributor signs up (ARN-validated) → creates/onboards an `Investor` row → emails investor an approval link (`investor_link_requests`) → investor approves/attests via email-OTP (no password ever) → distributor drafts purchase/SIP/redemption orders on the investor's behalf (`OrderService.createOrder`) → investor 2FA/OTP-approves via `TransactionApprovalChallenge` → order submitted to Cybrilla FintechPrimitives (FP) → webhook/poll reconciles allotment. A **parallel, mostly-unrouted self-service investor app already exists** in `investor-frontend` (`InvestorInvest.tsx`, `InvestorWithdrawal.tsx`, `InvestorPortalController` `/investor/**`) but is redirected away in `App.tsx:236-237` ("Self-serve investing is not offered — the advisor invests, the investor approves").

**Stack (exact versions, confirmed by direct pom.xml read + resolved dependency tree):**

| Layer | Version | Source |
|---|---|---|
| Java | 21 | `pom.xml:20` |
| Spring Boot | 3.3.5 | `pom.xml:9` |
| Flyway core/postgresql | 10.10.0 (BOM-resolved, not pinned) | `deps.txt:74,77` |
| PostgreSQL driver | 42.7.4 (BOM-resolved) | `deps.txt:78` |
| jjwt api/impl/jackson | 0.12.6 | `pom.xml:49-62` |
| springdoc-openapi | 2.6.0 | `pom.xml:102` |
| bucket4j-core | 8.10.1 | `pom.xml:112` |
| React / Vite / TS | 19.0.0 / 6.2.0 / 5.8.2 | `investor-frontend/package.json` |
| RTK / react-router-dom | 2.12.0 / 7.14.2 | same |
| Tailwind CSS | 4.1.14 | same |

**Deployment:** Docker multi-stage (Maven build → JRE 21 slim) → Render, single web service + managed Postgres (`render.yaml`, `sync: false` secrets, `SPRING_PROFILES_ACTIVE=production` explicit). Frontend: 2-stage Docker (Node build → nginx), same-origin `/api/v1/` reverse proxy with `proxy_cookie_domain` rebinding so HttpOnly cookies survive the FE/BE origin split (`nginx.conf.template:34-37`). Auth is 100% HttpOnly-cookie, no JWT in localStorage.

---

## 2. Backend Inventory → v2 Disposition Table

| Package / class group | What it does | Disposition | Notes |
|---|---|---|---|
| `AuthController`/`AuthService`/`CustomUserDetailsService`/`DistributorRole` distributor JWT path | Distributor email+password login, BCrypt, ARN-gated signup, refresh-token rotation | **DELETE** as distinct actor; mechanics (BCrypt, refresh rotation) **REPURPOSE** for an internal admin login | `AuthController.java`, `AuthService.java`, `JwtAuthFilter.java:103-121` |
| `InvestorAuthService`/`InvestorAuthController`, `OtpService`, `JwtService`, `AuthCookieService`, `BlockedTokenService` | Passwordless email/mobile OTP investor login, 1hr JWT, HttpOnly cookie, jti-blocklist logout | **PORT near-as-is** — strip `assertDistributorAllotted`, add investor refresh tokens | `InvestorAuthService.java:259-264`; refresh gap `application.yml:211-213` |
| `LoginRateLimitFilter`, `CorrelationIdFilter`, `SecurityConfig` header/CORS/CSRF posture, `BypassCodeStartupGuard`, `PiiRedactor` | Security hygiene | **PORT as-is**, trim distributor path lists | `SecurityConfig.java:71-166` |
| `Distributor` entity, `DistributorController`, `DistributorService`, `DistributorRepository`, DTOs | Distributor identity/hierarchy/bank/ARN | **DELETE** | `domain/Distributor.java`, `controller/DistributorController.java:29-126` |
| `ArnValidationClient`/`Mock`/`Real`, `ArnFormat` | KYD/ARN validation at distributor signup | **DELETE**, or **REPURPOSE** as a single platform-level ARN config if MFD route chosen (§10) | `integration/arn/*` |
| `InvestorLead`, `LeadInteraction`, `LeadController`, `LeadService` | Distributor sales-pipeline CRM | **DELETE** (was also the source of SEC-2/4/5 BOLA bugs) | `domain/InvestorLead.java` |
| `LifeEventReminder*` | Distributor "wish investor X" CRM prompt | **DELETE**; scheduler/date-math pattern **REPURPOSE** for investor-facing goal reminders | `service/LifeEventReminderScheduler.java` |
| `Notification`/`NotificationService`, `DistributorNotification*` | Two parallel distributor-scoped notification systems | **REPURPOSE** `Notification*` to investor-scoped; **DELETE** `DistributorNotification*` | `domain/Notification.java`, `domain/DistributorNotification.java` |
| `Investor` vs `InvestorAccount` split | Distributor-owned KYC profile vs self-login identity, linked primarily by **direct ID assignment at provisioning** (link-approval / login-fallback), with a secondary automatic PAN+email best-effort fallback for legacy accounts — **not** "PAN-only after explicit confirmation" `[CORRECTED, L9]` | **MERGE into one investor aggregate** | `InvestorAccountProvisioningService.java:25-49,94-212`; fallback `InvestorAuthService.java:245-257` |
| `InvestorLinkRequest`/`InvestorLinkRequestService`/`InvestorLinkController`, `InvestorLinkingStatus` (R1–R10 state machine) | Distributor→investor link/approve/skip/fill/reapprove choreography | **DELETE** linking; **REPURPOSE** the token-addressed-link, ownership-guard, and consent-recording mechanics for self-onboarding attestation | `InvestorLinkRequestService.java` (663 lines) |
| `ProfileChangeApprovalService`, R9/R10 skip-form | Distributor edits, investor 2FA-approves | **DELETE** | `service/ProfileChangeApprovalService.java` |
| `OnboardingSubmissionService`/`OnboardingSubmission` | Freeze-hash-attest of a distributor-assembled payload | **REPURPOSE**: keep freeze/hash/attest pattern, repoint payload source to investor-entered data | `service/OnboardingSubmissionService.java` |
| `InvestorKycService` self-service methods (`*AsInvestor`) | Already investor-self-service KYC/eSign/Aadhaar chain | **PORT**, but `owningDistributorForSelf`/`getAuthorizedInvestor` still require a non-null `distributorId` even on self paths — **REMOVE this hidden gate** | `InvestorKycService.java:1005-1013,1563-1577` |
| `NominationRules`, `NomineeService` `*AsInvestor`, `NominationOptOutChallengeService` | SEBI nominee cap/allocation/opt-out engine, already investor-self-service | **PORT near-verbatim** (cap value pending regulatory confirmation, §5/§12 Risk) | `service/NominationRules.java:25` |
| `ConsentRecordService`, `TermsAcceptanceService` | Append-only rendered-consent + T&C evidence log | **PORT as-is**, but the T&C **document itself does not exist** anywhere (Compliance FAIL, §11) | `service/ConsentRecordService.java`, `service/ConsentTexts.java` |
| `InvestorDocumentService` | File validation, magic-byte content-type, SHA-256 binding, 5MB cap | **PORT validation logic**, consider object storage over Postgres `bytea` | `service/InvestorDocumentService.java` |
| `TransactionApprovalService`/`TransactionApprovalChallenge`/`TransactionConsentTemplates` | 2FA/consent snapshot-hash-consume engine | **PORT core mechanics**, BUT it does **not** gate every Cybrilla/FP write — the initial `cybrillaClient.createOrder(...)` fires **before** any challenge exists on the investor-self path `[CORRECTED, L15/C1]` — **must fix before exposing self-serve buy** | `TransactionApprovalService.java:474-518`; gap at `OrderService.java:529,601-608` |
| `OrderService.createOrderAsInvestor`, `InvestorPortalController.approve` | Investor-initiated order + 2FA + provider submission | **PORT as the v2 scaffold**, fix the fingerprint/timestamp bug (§11) and the pre-2FA provider-write gap first | `OrderService.java:578-608`, `InvestorPortalController.java:889-937` |
| `RedemptionAvailability` | Ceiling-computation for partial/full redemption | **PORT as-is**, pure logic | `service/RedemptionAvailability.java` |
| `BulkOrderUploadService`, `OrderController.listByDistributor`, `requestInvestorApproval`, `resendApprovalLink`, `RedemptionActorScope.DISTRIBUTOR_SCOPED` | Distributor-initiated order origination/approval-trigger | **DELETE** | `OrderController.java:56-84,116-136,177-204` |
| `DashboardService`, `DashboardController` distributor endpoints, `PortfolioService.getPortfolio`(AUM/top-investors/top-schemes), `HouseholdReportService` | Book-of-business aggregation | **DELETE** (AUM/household); consider REPURPOSE as internal-ops analytics | `service/DashboardService.java`, `service/PortfolioService.java:135-284` |
| `CapitalGainsReportService` | FIFO + grandfathering tax engine, distributor-path-scoped | **REPURPOSE**: re-key from `distributorId` to `investorId`, keep FIFO/grandfathering/DERIVED-exclusion logic | `service/CapitalGainsReportService.java` |
| `ProductController`/`ProductService` scheme CRUD/sync | Cybrilla POA catalogue mirror | **KEEP**, re-gate `@PreAuthorize` to `ADMIN`-only (drop `MASTER_DISTRIBUTOR`) | `controller/ProductController.java:225-325` |
| `SchemeNavSyncService`/`SchemeNavResolver`/`NavBackfillService`/NAV floors | AMFI NAV pipeline | **PORT wholesale**, distributor-independent, incident-hardened | `service/nav/*` |
| `XirrCalculator` | Newton-Raphson + bisection XIRR | **PORT as-is** (note: internally `double`-based, not pure BigDecimal — see §7) | `service/XirrCalculator.java` |
| `HoldingsService`/`PortfolioService.getInvestorHoldings` | Two parallel, deliberately non-shared holdings implementations | **CONSOLIDATE into one** investor holdings service, port the valuation/dataQuality algorithm | `HoldingsService.java`, `PortfolioService.java:312-469` |
| `CybrillaClient`/`RealCybrillaClient`/`MockCybrillaClient` | FP integration, no ARN/EUIN field in payload builders (confirmed by direct read of builder methods) `[CORRECTED nuance, L4]` | **PORT wholesale** — separate, still-live `Distributor.arnNumber`/`ArnValidationService`/KYD subsystem exists (not wired into Cybrilla calls) and must be independently deleted or repurposed | `integration/RealCybrillaClient.java:2587-3154` |
| `CybrillaWebhookController` | Order/mandate/KYC webhook ingest, in-memory dedupe (non-persistent, flagged TODO) | **PORT**, fix persistent-idempotency gap | `controller/CybrillaWebhookController.java` |
| `GlobalExceptionHandler` constraint-name map | Hardcoded Postgres-constraint→message map | **REWRITE** against v2 schema | `controller/GlobalExceptionHandler.java:41-56` |
| `DemoDataSeeder`/`DemoOrderAdvancer`/`DemoInvestorOrderWarmupRunner` | Profile-gated dev/demo fixtures | **REWRITE from scratch** for v2 schema, keep the profile-gated pattern | `init/*` |
| Admin identity | `ADMIN` = a `DistributorRole` enum value on the `distributors` table; public `/auth/signup` accepts client-supplied `role` incl. `ADMIN` with **no server-side allow-list** | **GREENFIELD DESIGN REQUIRED** — see §12 Risk #1 | `AuthSignupRequest.java:23`, `AuthService.java:77`, `DistributorService.java:78` |

---

## 3. Database — Table-by-Table Disposition

**Money/time/PII modelling facts:**
- Money/units consistently `BigDecimal`/`numeric`: `transaction_orders.amount numeric(18,2)`, `.units numeric(18,4)`, `allotment_nav`/`stamp_duty numeric(20,4)`, `scheme_navs.nav numeric(20,6)` (`V1__baseline_schema.sql:140-141,163-164`; `V68`; `V74:64,102`). **Exception `[CORRECTED, L3]`:** `service/XirrCalculator.java` performs its Newton-Raphson/bisection solve entirely in primitive `double` (Cashflow record: `double amount`, line 41), converting `BigDecimal` via `.doubleValue()` before solving (line 198) — money figures are narrowed to IEEE-754 double for the XIRR calculation specifically (standard/acceptable for a transcendental root-find, but not "no floating point anywhere").
- Timestamps: `BaseEntity` standardizes `createdAt`/`updatedAt` as `OffsetDateTime`→`timestamptz`. **Drift found:** soft-delete columns (`investors.deleted_at`, `transaction_orders.deleted_at`) are timezone-naive `timestamp`; `transaction_orders.cancelled_at` (V40, `timestamptz`) is mapped to Java `LocalDateTime` (real type mismatch, Hibernate silently converts via JVM default zone) — same for `distributors.arn_validated_at`.
- No `@Version` optimistic locking anywhere; concurrency handled via one pessimistic lock (`InvestorRepository.findForUpdateById`) plus partial unique "one live row" indexes (`ux_txn_approval_live`, `ux_profile_approval_live`, `ux_onboarding_sub_live`, `ux_investor_link_request_live`, `ux_nomination_opt_out_live`).
- PII stored **plaintext**: PAN, mobile, email, DOB, bank account/IFSC, nominee ID. No column-level encryption anywhere (grep confirmed). Only real protection = V86's irreversible purge of distributor-collected identity-document images + SHA-256 hashing of OTPs/tokens (not PII-at-rest).
- Majority of FKs are **unenforced soft-references** (`transaction_orders.investor_id`, `redemption_records`, `investor_bank_accounts`, `investor_nominees` all lack real FK constraints) — a genuine data-integrity gap for v2 to fix, not preserve.

**Table disposition:**

| Table | Disposition | Notes |
|---|---|---|
| `distributors`, `investor_leads`, `lead_interactions`, `life_event_reminders`, `refresh_tokens`, `password_reset_tokens`, `investor_link_requests`, `profile_change_approval_challenges`, `distributor_notifications` | **DELETE** | No B2C equivalent |
| `investors` | **MODIFY**: drop `distributor_id`, `pending_distributor_id`, `linking_status`; merge with `investor_accounts` | — |
| `investor_accounts` (V58) | **KEEP as identity seed**, merge fields into one aggregate | Passwordless OTP design reusable as-is |
| `transaction_orders` | **MODIFY**: drop `distributor_id NOT NULL`; keep SIP fields, units provenance (V75), allotment/contract-note fields | Column currently NOT NULL — must be handled before drop |
| `redemption_records`, `investor_bank_accounts`, `investor_nominees` | **KEEP**, add real FKs | Already investor-scoped only |
| `investor_documents` (post-V86) | **KEEP** — already trimmed to `NOMINEE_ID`/`NOMINATION_OPT_OUT_FORM` only | 5MB cap, SHA-256 binding |
| `investor_kyc_forms` | **MODIFY**: drop `distributor_id NOT NULL` | — |
| `notifications` | **MODIFY**: drop `distributor_id`, become investor-only | — |
| `product_schemes`, `scheme_navs`, `scheme_nav_history`, `nav_sync_runs` | **KEEP as-is** | ISIN-keyed, source-provenance-tagged, no distributor coupling |
| `email_otps`, `consent_records`, `terms_acceptances`, `audit_events`, `external_api_snapshots`, `blocked_tokens` | **KEEP as-is** | Generic, actor-agnostic |
| `transaction_approval_challenges` | **REPURPOSE**: keep freeze-hash-consume engine, reframe as investor's own confirm-and-pay step | Fix the pre-challenge provider-write gap (§2, §11) |
| `onboarding_submissions` | **REPLACE conceptually**: same freeze/hash/attest pattern, payload now investor-authored | — |
| `nomination_opt_out_challenges` | **KEEP as-is** | Already investor-account-centric |

**Proposed NEW tables for B2C:** `investor_identities` (merged investor+account), `auth_sessions` (investor refresh tokens), `investor_devices`, `fund_catalogue_curation` (expense ratio/riskometer/exit load/lock-in — **not available from Cybrilla today**, see §6/G1), `watchlists`/`watchlist_items`, `order_intents`/`cart_items`, `payment_attempts`, `mandates` (first-class, pulled out of ad-hoc `transaction_orders.external_mandate_id`), `sip_registrations`/`sip_instalments`, `notification_preferences`, `investor_notifications`, `goals`, `holdings_snapshot` (materialized, perf).

---

## 4. Distributor-Coupling Removal Checklist (grouped, with counts)

| Group | Count (files/occurrences) | Key paths |
|---|---|---|
| "distributor" grep hits across `service/`+`controller/` | **1,849 occurrences across 144 files** | Densest: `InvestorService.java` (233), `OrderService.java` (102), `InvestorController.java` (100), `AuthService.java` (92) |
| Distributor-only test classes | `config/`=9, `controller/`=30 (incl. distributor auth), `integration/`=10 | 156 total test classes; unclear exact distributor-only subset without per-file audit |
| Repository "find/count/search by DistributorId" methods | 18 methods in `InvestorRepository` alone; similar patterns in `TransactionOrderRepository`, `NotificationRepository`, `DistributorNotificationRepository`, `LifeEventReminderRepository`, `InvestorLeadRepository` | — |
| Frontend distributor-only screens (dead weight to delete) | `Leads.tsx`, `Earnings.tsx`, `AumBreakdown.tsx`, `BulkOrderUpload.tsx`, `DistributorMgmt.tsx`, `Communications.tsx`, `Ledger.tsx`, `Reports.tsx` (repurpose), `DistributorFillProfileForm.tsx`, `DistributorNotificationBell.tsx` (repurpose), `Redemptions.tsx`, `SipDashboard.tsx`, `InvestorKycModify.tsx` (Front_end only), `Investors.tsx`, `PendingApproval.tsx`, `InvestorTransaction.tsx`/`InvestorRedeem.tsx` (superseded by `InvestorInvest.tsx`/`InvestorWithdrawal.tsx`) | `investor-frontend/src/views/*` |
| Entire `Front_end` app | 1 app (stale duplicate distributor+admin console, superseded) | `C:/Users/pc/Desktop/WeathTech_v2/Front_end/*` |
| Migrations that become "not applicable" schema history | V53, V63, V64, V66, V70, V86 (distributor identity/linking/ARN/documents) | `db/migration/V53,V63,V64,V66,V70,V86` |
| Downstream distributor-null gates beyond the login gate `[CORRECTED, L10/G9]` | 4 confirmed gates, not 1: (1) `InvestorAuthService.assertDistributorAllotted` (login), (2) `InvestorKycService.owningDistributorForSelf` (all self-KYC), (3) `InvestorService.addBankAccountAsInvestor` (bank add), (4) `OrderService.createOrderAsInvestor` (order placement) — all throw `IllegalStateException` when `distributorId` is null | `InvestorAuthService.java:259-264`; `InvestorKycService.java:1005-1013,809-972`; `InvestorService.java:1451-1457`; `OrderService.java:578-585` |

---

## 5. Business & Compliance Rules to Port — Exact Values, Source Paths

| Rule | Exact value | Source |
|---|---|---|
| OTP: length / expiry / max attempts / resend cooldown | 6 digits / 5 min / 5 attempts / 30s | `application.yml:226-229`, `OtpService.java:272-280` |
| OTP storage | SHA-256(`email:code`), never plaintext | `OtpService.java:155-163` |
| Investor access token lifetime | 1 hour, **no refresh yet** | `application.yml:215` |
| Distributor access/refresh (to be reframed for admin) | 15 min / 7 days, single-use rotation, 60s grace | `application.yml:200,210` |
| Nominee cap | Code says **3** (`NominationRules.MAX_NOMINEES=3`), but regulatory picture is unsettled `[CORRECTED, C2/G5]`: SEBI raised the cap to **10** effective 2025-03-01 (circular SEBI/HO/MIRSD/POD-1/P/CIR/2024/81, secondary-sourced), then a later SEBI circular dated **2026-05-29** (`SEBI/HO/OIAE/OIAE_IAD-3/P/CIR/2026/12676`), effective **2026-09-01**, reportedly **reduced the cap back to 3** and superseded all earlier nomination circulars — i.e. the *current code value of 3 may already be correct again* as of today (2026-09-25). **MUST verify the primary SEBI PDF before building v2's cap** — this is not settled from secondary sources alone. | `NominationRules.java:25`; see §12 Risk |
| Nominee allocation | Exactly 100% (whole-set write); running total may not exceed 100% (incremental) | `NominationRules.java:28,68-101` |
| Minor nominee | Age <18 (derived from DOB), guardian name+relationship mandatory | `NominationRules.java:31,109-172` |
| Nomination opt-out | Refused while any nominee exists; signed SEBI-form upload + 2FA OTP bound by hash to both text and file bytes | `NomineeService.java:481-520` |
| 2FA execution validity | 60 min from `approvedAt` | `TransactionApprovalService.java:87` |
| 2FA: one live challenge per transaction | DB partial unique index | `V61__add_transaction_approval_challenges.sql:47-50` |
| SEBI 2FA/OTP mandate for MF purchase/subscription `[CORRECTED, L7]` | Real and confirmed: SEBI circular SEBI/HO/IMD/IMD-I DOF1/P/CIR/2022/132 (2022-09-30), extending an earlier redemption-only 2FA mandate to subscription/purchase, effective **2023-04-01**. The earlier redemption-only mandate's actual effective dates were **2022-06-01 (off-exchange) / 2022-07-01 (on-exchange)**, not 2022-03-31 (that date belongs to a timeline-*extension* circular, not the original mandate). For SIPs/mandates, the SEBI circular text itself states 2FA is required **only at mandate/systematic-transaction registration**, not per recurring instalment. | See §13 L7 |
| SEBI NAV cut-off times `[CORRECTED, L8]` | Only the **overnight-scheme redemption** cutoffs were revised effective **2025-06-01** (SEBI/HO/IMD/PoD2/P/CIR/2025/56): offline redemption by 3:00 PM → prior-day NAV, after 3:00 PM → next-day; **online redemption extended to 7:00 PM**. The 3:00 PM standard-scheme cutoff and 1:30 PM liquid/overnight-purchase cutoff are **pre-existing, unchanged** rules, not part of this revision. **Backend today has zero cutoff enforcement of any kind** (confirmed by grep, G3) — relies entirely on FP applying its own opaque cutoff; v2 must build explicit scheme-category/channel-aware cutoff gating, especially the 7:00 PM online-redemption case which is easy to miss. | See §13 L8; also G3 |
| Contact verification honesty | Only `OTP` (real provider round-trip) counts as verified; `SELF_DECLARED`/`DEMO_STUB` never do; email can never be self-declared | `ContactVerificationMethod.java:19-37`; `InvestorContactVerificationService.java:149-155` |
| PAN format | `^[A-Z]{5}[0-9]{4}[A-Z]$` | `validation/PanFormat.java:15` |
| Mobile format | `^[6-9][0-9]{9}$` | `validation/MobileFormat.java:14` |
| SEBI stamp duty | 0.005% of amount | `OrderService.java:72,834` |
| SIP minimum / start date / frequency / installment day | ₹500 / strictly after today / MONTHLY\|QUARTERLY / 1-28 | `OrderService.java:2193-2212` |
| SIP mandate limit | max(₹100,000, 2× instalment amount) | `InvestorActionService.java:1014-1019` |
| Units provenance | `PROVIDER` may overwrite `DERIVED`, never reverse; DERIVED requires NAV date + timestamp; DERIVED (and MANUAL) excluded from tax cost basis and from unit-precise partial redemption/submission-to-registrar `[CORRECTED nuance, L13]` — but DERIVED units **are** used as the divisor for full-redemption drafting and for the redemption-ceiling display arithmetic; the hard exclusion boundary is specifically "instructing a real trade at the registrar" and "tax cost basis," not every redemption-adjacent computation | `V75__add_order_units_provenance.sql`; `OrderService.java:1425-1436,1880-1892`; `CapitalGainsReportService.java:158-171` |
| Redemption ceiling | Rupee redemptions convert to a unit-share (rounded up, conservative) so AMOUNT/UNITS modes can't double-spend | `RedemptionAvailability.java` |
| Capital gains | Equity LTCG 365 days, non-equity 1095 days, 31-Jan-2018 grandfathering | `CapitalGainsReportService.java:53-54,301-318` |

---

## 6. Integrations

**Cybrilla FP — every operation used today** (full table in the be-integrations slice; summarized): auth/token (2 audiences: FP tenant + Cybrilla POA), pre-verification/KYC (`/poa/pre_verifications`, `/api/kyc/check`, `/v2/kyc_requests`, `/v2/identity_documents`, `/v2/esigns`, `/poa/kyc_forms`), investor profile/contacts (`/v2/investor_profiles`, addresses/emails/phones), bank/mandates/payments (`/v2/bank_accounts`, `/v2/bank_account_verifications`, `/api/pg/payments/*`, `/api/pg/mandates/*`), catalogue (`/api/oms/fund_schemes`, `/v2/mf_scheme_plans/cybrillapoa`, `/v2/sif_scheme_plans/cybrillapoa`), purchases/SIP/redemptions (`/v2/mf_purchases`, `/v2/mf_purchase_plans`, `/v2/mf_redemptions` — no switch/STP endpoint exists), investment accounts (`/v2/mf_investment_accounts`), webhooks.

**What B2C additionally needs:**
| Need | Gap |
|---|---|
| Self-serve payment UX | Already investor-facing shaped (UPI URI/netbanking) — no gap |
| Investor refresh-token session | Missing (§2); template exists in distributor `RefreshTokenService` |
| Real SMS OTP provider | `SmsOtpService` is a documented demo stub (TODO(MSG91)) — mobile-first signup blocked until wired |
| Fund-fact data (expense ratio, riskometer, exit load, AUM, benchmark) | **Confirmed absent from Cybrilla's catalogue payloads** `[G1]` — real payloads (`exports/finprim-direct-fund-schemes-*.json`, `exports/cybrilla-poa-fund-schemes-*.json`) carry only `plan_type`, `min_initial_investment`, `sip` thresholds, `lock_in`/`lock_in_period` — **no** `expense_ratio`/`riskometer`/`exit_load`/`aum`/`benchmark` field exists anywhere. v2 needs a second data source (vendor feed or manual admin curation) for these. |
| ELSS lock-in enforcement | **Confirmed enforced NOWHERE** `[G6]` — no `ELSS` category, no lock-in date field, no server-side date check on Platizio's side; no evidence FP enforces it either. **v2 must build explicit ELSS lock-in tracking before opening self-serve ELSS redemption** — v1's informal safeguard (distributor diligence) disappears entirely in a self-serve model. |
| NAV cutoff enforcement | **Confirmed absent** `[G3]` — no `LocalTime`/clock comparison exists anywhere in `OrderService.java`/`RealCybrillaClient.java`; allotment date/NAV is read reactively from FP, never predicted/gated beforehand. Real gap against the SEBI 2025-06-01 revision (§5). |
| Direct-plan/RIA-tenant relationship with Cybrilla | **Open, unconfirmed** `[G4/C3]` — FP's public partner-type docs list only **ARN** (AMFI distributor) and **RIA** (SEBI adviser); no Execution-Only-Platform (EOP) category is documented anywhere on `docs.fintechprimitives.com`. The outreach email drafted to ask Cybrilla about this (`docs/cybrilla-production-inquiry-email.md`) was **never confirmed sent or answered** — signature block still has literal `[Your name]`/`[Company]` placeholders. **No FP-side payload/schema change is needed to remove the distributor layer** (confirmed: payload builders carry no ARN/EUIN field, `[L4]`) — but the **tenant/license-relationship question itself is unresolved** and is a named open decision (§12 Risk #2). |
| AMFI NAV feed | Fully reusable as-is, distributor-agnostic (`AmfiNavParser`, `NavFeedRetryPolicy`, validation floors) |
| Email/SMS | Email: `spring-boot-starter-mail`, vendor-agnostic SMTP, works today. SMS: not production-wired. |

---

## 7. Portfolio Math — Exact Definitions

- **Invested amount** = weighted-average-cost NAV × net held units, plus any cash in lots with no unit count yet (`unallottedInvested`). Never fabricated.
- **Current value** = effective NAV (live market, or investor's own average-cost NAV as an "at-cost" fallback — never a fabricated/zero value) × net units. **A holding with unknown/unpriced units reports `currentValue = null`** (never invested amount, never zero) — deliberate design decision (`HoldingsService.java:237-252`), confirmed unmodified through §13 L13. Nuance: if `app.nav-sync.expose-derived-units=true` (default **false**) and NAV is available, a DERIVED-unit holding **can** show a computed `currentValue`, explicitly graded `DataQuality=ESTIMATED`, not `OK`.
- **Gains** = `absoluteReturn = currentValue - invested`; `percentReturn = (currentValue - invested)/invested × 100`.
- **XIRR (per-holding and portfolio)**: `XirrCalculator.java` — Newton-Raphson (seed r=0.1, NPV tolerance 1e-7, ≤100 iterations), falling back to bracketed bisection (≤200 iterations, geometric bound expansion) when Newton's derivative is ill-conditioned or the domain is exited. Returns `null` (never NaN/Infinity/zero) for: <2 cashflows, all-same-sign cashflows, zero horizon, or a bisection bracket that can't be found. **Implementation note `[CORRECTED, L3]`**: internally computed entirely in primitive `double`, with `BigDecimal` cashflow amounts explicitly narrowed via `.doubleValue()` before solving — this is the one place in the money pipeline that is not pure-decimal, standard practice for a transcendental root-find. Portfolio-level XIRR is `null` unless `fullCoverage` (every holding valued).
- **Active SIP count**: **No investor-scoped implementation exists today** `[G10]` — `DashboardService.getSipDashboard` computes it but is hard-scoped to `distributorId`; the investor dashboard DTO (`InvestorDashboardResponse`) has no SIP-count field at all. Would need to be built new, re-keyed to `investorId`, with an authoritative "Active" definition decided first (v1 has two conflicting definitions: `ACTIVE`+`PROCESSING` vs. `ACTIVE`+`SUCCESSFUL`+`COMPLETED`+`PAUSED`+`FAILED`+`CANCELLED`).
- **Holdings derivation**: Entirely from the internal orders ledger (`transaction_orders` + `redemption_records`), **never** from a Cybrilla/FP holdings-API call — confirmed, no such endpoint exists in `CybrillaClient` (`[L2]`, survived). Net units = Σ(settled PURCHASE/LUMPSUM_PURCHASE/SIP units) − Σ(redeemed units), weighted-average-cost basis. Two parallel, deliberately non-shared implementations exist today (`HoldingsService` for dashboard, `PortfolioService.getInvestorHoldings` for withdrawal screen) — **v2 should consolidate into one**.
- **NAV pipeline**: AMFI `NAVAll.txt` (daily) + history report, resolved via `SchemeNavResolver` (ISIN-keyed `scheme_navs` table → `metadata_json` fallback, age-graded OK/AGED/UNDATED). Never from Cybrilla. Validation floors: min-rows 1000, cold-start match-fraction 0.10, regression-vs-baseline ratio 0.5, max-daily-jump 25%/day, max-future-days 2.
- **Allocation-by-category**: **No real server-side implementation** `[G10]` — `ProductScheme.category` is only a coarse MF/SIF/OTHER/EQUITY asset-class marker, not a true fund-category taxonomy (no Equity-Large-Cap/Debt-Liquid/Hybrid/ELSS). The current frontend `AllocationDonut` groups by scheme name client-side, not category. This is net-new schema + backend work for v2, not just a new endpoint — compounded by the same catalogue-data gap noted in §6 (`[G1]`).

---

## 8. Frontend

**Route map today** (both apps share nearly-identical distributor/admin trees; `investor-frontend` is the newer/authoritative one — `Front_end` is a stale duplicate with no investor portal at all, DELETE per §4):

| Zone | Paths | Reuse verdict |
|---|---|---|
| Investor portal (live) | `/investor/luxe-v2/*` (Home, Withdraw, Plans, Nominees, Approvals, Profile, Onboarding-review, KYC) | **KEEP design system**; screens need business-model rewrite (see below) |
| Investor self-service scaffolding (built but unrouted) | `InvestorInvest.tsx`, `InvestorWithdrawal.tsx` | **PRIMARY REFERENCE for v2's buy/SIP/redeem UI** `[CORRECTED via C6]` — confirmed independently wired to *live* backend endpoints matching current `InvestorPortalController` routes exactly (`GET /investor/schemes`, `POST /investor/orders`, `GET /investor/holdings`, `POST /investor/withdrawals/self`), not stale. Only blocked from users by an `App.tsx` redirect (`App.tsx:236-237`), not by any code defect (though the confirm/2FA path they call into has the fingerprint bug, §11) |
| Distributor console screens (do NOT use as buy/SIP/redeem reference) | `InvestorTransaction.tsx`, `InvestorRedeem.tsx` | **REPURPOSE step-content/visual scaffolding only** — their data/auth model (distributor drafts, investor approves) is the opposite of v2's target; `InvestorRedeem.tsx` also only supports full redemption, unlike `InvestorWithdrawal.tsx`'s amount/units/full |
| Distributor console (rest) | Investors, Ledger, Leads, Earnings, AumBreakdown, BulkOrderUpload, DistributorMgmt, Communications, Reports, InvestorOnboarding (distributor-draft steps), InvestorLinkApproval | **DELETE** (Reports/capital-gains **REPURPOSE** to investor-self) |
| Admin | `/admin/overview`, `/admin/distributor-mgmt` (DELETE), `/admin/product-mgmt` (KEEP), `/admin/investor-mgmt` (KEEP as ops console) | Mixed |

**Design system:** "Ivory Private-Wealth" — Fraunces serif + Inter, warm ivory/navy/gold-emerald palette, odometer numbers, Aurora WebGL backdrops, SpotlightCard/StarBorder/ClickSpark motion (Framer Motion → `motion` v12.23.24). Assessment: polished, internally consistent, but a heavy bespoke boutique-banking aesthetic that may be too "private wealth" for mass-market retail; v2 must consciously decide to keep, dilute, or replace. Known accessibility bug: 390px horizontal overflow on Withdraw screen (un-wrapped fund names).

**Distributor flows the investor must now self-serve (field-level):**
- **Onboarding**: PAN/DOB/mobile/email + relationship type → identity check (Cybrilla POA pre-verification) → Aadhaar/DigiLocker → eSign → bank add (IFSC lookup + BAV) → FATCA/PEP/tax-residency declaration → nomination decision → T&C/consent (no real document exists yet, §11) → attest. v1's newer wizard already dropped the document-upload step (Cybrilla-review Item 1) and made KYC non-blocking at the wizard level — good precedent to keep.
- **Order steps**: fund search/select → amount (lumpsum) or SIP config (amount/frequency/day) → bank selection (verified only) → 2FA/OTP confirm → payment (UPI/netbanking) or mandate (eNACH/UPI Autopay) authorization → status tracking.
- **Redemption**: holding select → amount/units/full toggle → 2FA/OTP confirm → provider submission. **Full redemption of a derived/estimated holding is refused 100% of the time after 2FA/consent is already spent** (§11) — must fix before launch.

**Utilities worth porting:** `NominationRules.java`/`nomination.ts` (SEBI age/allocation/guardian logic), `format.ts` (INR Lakh/Crore, "never show invested as current value" discipline), `approvalConsent.ts` (server-rendered consent + fail-closed gate pattern), `kycPreVerification.ts` (~1080 lines, framework-agnostic PAN/mobile regex + Cybrilla decision-state engine), `orderableScheme.ts`.

**What's missing for B2C:** fund catalogue/detail/search/filter/compare pages (no UI exists, `EP.schemes` defined but never consumed), cart/checkout, self-signup screen, SIP pause/modify/cancel UI, order-history/statement screen, tax-statement export UI, notification center, mandate self-management.

---

## 9. Tech-Stack Research (Sept 2026, exact versions)

**Backend — recommend staying on the JVM family (lowest re-skill cost):**
Java 25 LTS + Spring Boot 4.1.x (Spring Framework 7.0.9) — Boot 4.0.0 GA'd 2025-11-20. Keep JPA/Hibernate for transactional core; add jOOQ 3.21.6 for money-critical reporting/XIRR queries. Use virtual threads for Cybrilla/AMFI I/O instead of WebFlux. Adopt Spring Modulith 2.1.1 for module boundaries (Onboarding/KYC, Catalogue, Orders/Payments, Webhooks, NAV-Sync, Reporting). PostgreSQL → v18 (`uuidv7()`, async I/O, virtual generated columns). For order-saga durability, pilot DBOS (Postgres-native, runs inside the app) over Temporal (too much infra for a small team) — Java/Spring SDK maturity for DBOS is **unconfirmed**, spike first; fallback = hand-rolled Postgres outbox + Resilience4j.
Rejected: Node/TypeScript (real re-skill cost, no native fixed-point decimal type), Go (excellent as a satellite NAV-sync/webhook service, poor as a full rewrite), .NET 10 (best native `decimal` ergonomics, zero team overlap, smaller India BFSI pool).

**Frontend — recommend Next.js 16.3.6 (App Router, Cache Components stable):**
Enables ISR/SSG for SEO-critical fund catalogue pages + streamed authenticated dashboard + server-only secret handling for OTP/checkout, in one codebase. TanStack Start (RC, still pre-1.0 as of 2026-09-23) is too immature for regulated fintech; React Router v7 framework mode lacks Next's ISR/caching maturity; Astro is excellent for a pure marketing/content subdomain only, not the transactional app. ~80% of current `investor-frontend` deps (React 19, Tailwind v4, RTK 2.12→migrate to TanStack Query, react-hook-form 7.76, zod 4.4→bump 4.5, recharts, motion) carry forward with minimal change; main rewrite cost is routing (React Router→Next `app/`) and data-fetching (RTK Query→TanStack Query or RSC).
Hosting/data-localisation: default to **AWS `ap-south-1` (Mumbai)** for app+Postgres given SEBI-adjacency; Vercel `bom1` (Mumbai) acceptable only after legal confirms Vercel's India data-handling terms (Vercel is a US company holding the control plane — flagged, unverified).

---

## 10. Domain & Regulatory Research

**Business-model options:**

| Option | Registration | Pros | Cons | Recommendation |
|---|---|---|---|---|
| A — Keep AMFI ARN, direct-plan-only, zero commission | None new | Zero new registration, reuses Cybrilla ARN tenant model as-is | Legal "grey zone" precedent (Kuvera-style); SEBI's EOP framework exists precisely to formalize this pattern | **Recommended default** |
| B — SEBI EOP Category-1 | New AMFI/EOP registration, deposit, direct-plan-only | Purpose-built legal cover | Real compliance lift; Cybrilla's public docs don't list EOP as a supported partner type (`[G4]`, unconfirmed) | Fallback if regulator tightens on Option A |
| C — SEBI EOP Category-2 | Full stock-broker registration | N/A for this platform | Heavy, demat-centric, architectural mismatch (Cybrilla FP is SoA/folio-based) | Not recommended |
| D — SEBI RIA | Deposit ₹1-10L (graded), NISM cert, fee cap ₹1.51L flat or 2.5% AUA | Natively supported by Cybrilla FP as a first-class partner type; enables advisory/robo tier | Triggers suitability/risk-profiling obligations for every client | Reserve as a **future premium tier**, not the v2 core |

**Critical caveat `[C4]`**: **This business-model decision has NOT been made by anyone** — a codebase-wide search found zero code/doc evidence for Option A vs. B vs. D; `context.md` still describes the product as "a mutual-fund distribution platform for distributors/RIAs." **This is a numbered open decision for the product owner (§12 #4).**

**v2 compliance checklist (MUST/SHOULD), reconciling regulatory research with confirmed backend gaps:**

| Item | Status | Priority |
|---|---|---|
| 2FA/OTP on purchase+redemption, registration-only for SIP | Real, code-present, but broken on the investor-self path (§11) | MUST fix |
| KYC Validated (Aadhaar e-KYC/DigiLocker) as default onboarding path | Already wired (`createIdentityDocument`) | MUST make the golden path |
| Nomination: max nominees, allocation, guardian rule | **Regulatory value unsettled** — see §5, §12 Risk | MUST verify primary SEBI text before build |
| NAV cutoff enforcement (esp. 7 PM online overnight-redemption) | **Absent today, confirmed** `[G3]` | MUST build for v2 |
| ELSS lock-in enforcement | **Absent today, confirmed** `[G6]` | MUST build before self-serve ELSS launch |
| Terms & Conditions real document + investor's-own-act binding | **FAIL, no document exists** (§11) | MUST fix before launch |
| No auto-populated compliance defaults (gender, PEP, etc.) | **FAIL, 9 hardcoded attributes still filed** (§11) | MUST fix — real misfilings occurring |
| UPI Autopay mandate ceiling ₹1L/txn vs eNACH ₹1Cr | Both rails available in FP `mandates` object | SHOULD support both |
| DPDP Rules 2025 compliance (granular consent, purpose-limited retention, 72hr breach reporting) | Notified 2025-11-13, phased to 2027-05-13, penalties up to ₹200-250 crore | MUST plan for, given plaintext PII storage today (§3) |
| SEBI CSCRF cybersecurity framework | Compliance deadline extended to 2025-06-30 for most REs | MUST assess applicability |
| SEBI scheme categorisation | 2026 revision (40 sub-categories) effective 2026-04-01 | MUST build catalogue taxonomy against 2026 version, not legacy 2017 |

---

## 11. Known Issues, Audit/QA/Cybrilla Findings to Carry Forward or Fix

**Compliance scorecard, most recent full review (2026-09-03):** 0 PASS / 8 PARTIAL / 3 FAIL across 11 SEBI/AMFI items. The 3 FAILs: **T&C acceptance** (no real document exists anywhere; distributor could accept on investor's behalf), **redemption-screen disclosure** (no folio/units/value shown under shipped config), **no-auto-populated-defaults** (9 compliance attributes — gender, occupation, income, PEP, tax status, etc. — filed as blanket constants; 19 investors recorded male were filed as female; real misfilings continued through 2026-09-01). `[SURVIVED, L12]`, with the caveat that migrations V80-V86 (postdating the review) show targeted remediation of the *distributor-bypass* mechanism specifically for T&C, though the "no real document exists" defect for T&C likely still stands independently.

**Critical structural bugs directly blocking the v2 self-serve path (confirmed still present as of 2026-09-25, `[G7]`):**
1. **Investor-originated purchase 2FA approval always fails after the fact.** Root cause: the order and its approval challenge are created in the same transaction, freezing an in-memory timestamp at nanosecond precision (system offset); Postgres round-trips it as UTC microseconds; the gate recomputes the hash from the freshly-loaded order and never matches. Fails closed (no money moves), but the UI reports "authorised" then dead-ends at Pay. **`[CORRECTED via L15]` — compounding this**, the initial `cybrillaClient.createOrder(...)` FP write for a self-serve purchase happens **before any 2FA challenge is even created**, entirely outside the 2FA gate and outside any DB transaction (`OrderService.createOrder` is explicitly not `@Transactional`). This is a deeper architectural gap than the timestamp bug alone — the "2FA gates every Cybrilla write" assumption is false for the exact path v2 needs.
2. **Every full redemption of a derived/estimated holding is refused 100% of the time, after 2FA/consent has already been spent.** `submitRedemptionToProvider` unconditionally refuses `hasEstimatedUnits()` orders, placed *before* `assertApprovedAndConsume`, leaving the challenge permanently APPROVED-but-never-CONSUMED with no compensating/cancel path.

**Cybrilla review (Sept 2026, branch `feat/cybrilla-review-onboarding`, **uncommitted** as of test time):** Items 1 (stop collecting investor identity documents), 2 (tighten KYC-blocking contract), 3 (email/phone+OTP-only investor login, no self-signup) — 26/27 to 67/67 checks passing across 14 modules, only one low-severity concurrency gap (concurrent identity-check dedup) unresolved. **Merge/deploy status unconfirmed** `[G8]` — both backend and frontend repos were on this branch uncommitted. **Does not re-grade the original 11-item checklist** — items 8/9/11 above remain untouched by this branch.

**Audit findings (2026-07-03):** 0 Critical, 3 Medium, 9 Low, 5 Info. Notable: M2 (external-API snapshots stored raw PAN/bank PII) fixed via `PiiRedactor`, **but reopened**: `external_api_snapshots.investor_identifier` field stored cleartext PAN in 1,062/1,062 rows as of 2026-09-03 (redactor has no rule for this field) — **fix status as of 2026-09-25 unconfirmed** `[G8]`.

**QA history:** 156 test classes, no Testcontainers (tests run against real local Postgres — CI/portability risk). SEC-1 (plaintext OTP in logs), SEC-2/4/5 (BOLA/lead-theft), SEC-6 (challengeId authorization gap) — all fixed 2026-07. **C1 (Critical, profile-change 2FA accepts dev master code `000000`)** — status after 2026-07-06 **unconfirmed anywhere in the repo**; the underlying `OtpPurpose` exclusion-list pattern (must exclude every sensitive purpose, not just `TRANSACTION_APPROVAL`) should be re-audited from scratch in v2 regardless.

**Admin/back-office identity gap `[G9]`:** `ADMIN` is merely a `DistributorRole` enum value on the `distributors` table; the public `/auth/signup` endpoint accepts a client-supplied `role` field (including `ADMIN`) with **no server-side allow-list**. Mitigated today only by a manual-approval chicken-and-egg (only an existing ADMIN can approve new accounts, and no bootstrap admin is seeded anywhere) — fragile, not a designed control.

**`sdj/` folder:** three unexplained compiled `.class` files (a patched Spring Data JPA `JpaQueryCreator`) with zero documentation anywhere in the repo — flag for the original author, purpose unconfirmed.

---

## 12. Risks and OPEN DECISIONS for the Product Owner

1. **Admin/back-office identity model does not exist as a first-class concept today.** *Options:* (a) build a dedicated `AdminUser`/RBAC table from scratch for v2 (clean slate — recommended, since `ADMIN` currently rides on the distributor table that's being deleted anyway); (b) retrofit the existing `DistributorRole.ADMIN` pattern onto a new minimal actor type. *Recommendation:* (a) — greenfield design, closing the unrestricted-signup-role gap simultaneously.

2. **Cybrilla FP tenant/license-model relationship for B2C is unconfirmed and the inquiry email was never sent.** *Options:* (a) confirm in writing whether Cybrilla will support Platizio as principal (ARN or RIA holder of record) transacting on behalf of self-directed investors, before committing further engineering; (b) evaluate alternate MF execution vendors (BSE StAR MF, NSE MFSS, direct RTA APIs) in parallel as a hedge. *Recommendation:* send the (already-drafted but never customized) inquiry email immediately — this is a **blocking prerequisite**, not a nice-to-have, for the entire v2 timeline.

3. **Nominee cap regulatory value is unsettled from primary sources.** Code says 3; secondary sources claim SEBI raised it to 10 (2025-03-01) then a newer 2026-05-29 circular effective 2026-09-01 reportedly reduced it back to 3, "superseding all earlier circulars." *Options:* (a) obtain and read the primary SEBI PDF before locking v2's `MAX_NOMINEES`; (b) ship with the current code value (3) as a reasonable default pending confirmation, since it may already be correct. *Recommendation:* (a) — regulatory value, must be primary-source-verified, not secondary-news-sourced, before any compliance sign-off.

4. **Business model (MFD-ARN direct-only vs. EOP vs. RIA) has not been decided by anyone.** *Options:* per §10 table. *Recommendation:* Option A (keep ARN, direct-plan-only, zero commission) as default, contingent on risk #2 above resolving favorably; formal product-owner sign-off required before v2 build starts, since it determines whether a commission/plan-type field is needed at all in the new order schema.

5. **Fund catalogue lacks expense ratio/riskometer/exit-load/AUM/benchmark data — confirmed absent from Cybrilla's payloads.** *Options:* (a) commercial fund-data vendor (Value Research/Morningstar-style feed); (b) manual admin curation via the existing `ProductMgmt` admin CRUD, seeded once and refreshed periodically; (c) probe FP's `fund_details` reference table directly (mentioned in FP docs but not independently confirmed to carry these fields — `[G1]` caveat). *Recommendation:* (c) first (cheap to check), fallback to (a) for launch-blocking fields, (b) as a stopgap.

6. **ELSS lock-in and NAV-cutoff enforcement are both confirmed absent today and become launch-blocking once self-serve retail investors can trigger orders directly** (v1's informal "distributor catches mistakes" safety net disappears). *Recommendation:* both are MUST-build items for v2, not carry-forward gaps — budget explicit engineering time.

7. **T&C document and the 9 hardcoded compliance-attribute defaults are both hard regulatory FAILs today**, independent of the B2B2C→B2C rewrite. *Recommendation:* fix both regardless of rewrite timeline/scope — these are compliance liabilities on the current production system right now.

8. **Investor-self-purchase 2FA is structurally broken** (timestamp fingerprint mismatch + provider-write-before-challenge-exists). *Recommendation:* this is not a "port as-is" item — it requires a genuine fix (move challenge creation before the provider call, or re-derive the snapshot hash from DB-persisted state before comparing) before v2 can expose self-serve buy at all.

9. **PII is stored entirely in plaintext with DPDP Rules 2025 compliance deadlines already ticking** (phased to 2027-05-13, penalties up to ₹200-250cr). *Recommendation:* decide now whether v2 introduces column-level encryption for PAN/bank/DOB, or relies solely on access-control + audit-trail (current v1 posture) — this is an architecture decision, not a late-stage bolt-on.

10. **`sdj/` folder origin/purpose is unexplained.** *Recommendation:* low priority, but ask the original team before wiping/ignoring it — could indicate a real Spring Data JPA bug workaround worth preserving knowledge of.

---

## 13. Verification Ledger

| Claim | Verdict | Corrected takeaway (if any) |
|---|---|---|
| L1 XIRR Newton-Raphson+bisection, null-safe | SURVIVED | Minor nuance: bisection returns best-effort midpoint on partial non-convergence, not always null |
| L2 Holdings derived from internal ledger, never FP API | SURVIVED | — |
| L3 Money/units always BigDecimal, no floating point anywhere | **CORRECTED** | `XirrCalculator` internally uses `double`, converting `BigDecimal` via `.doubleValue()` — DB schema/columns are pure decimal, but the XIRR *calculation* is not |
| L4 Zero ARN/EUIN in Cybrilla payload builders | **CORRECTED** | Payload builders confirmed clean (no field), but a separate live `Distributor.arnNumber`/`ArnValidationService` KYD subsystem exists (unrelated to Cybrilla calls), and design docs (`CYBRILLA_INTEGRATION.md`) anticipated wiring ARN/EUIN into the FP payload — never implemented |
| L5 Investor auth OTP-only, 1hr JWT, no refresh, no password column | SURVIVED | — |
| L6 Spring Boot 3.3.5/Java 21/Flyway 10.10.0/Postgres 42.7.4/jjwt 0.12.6/springdoc 2.6.0/bucket4j 8.10.1 | SURVIVED | Flyway/Postgres versions are BOM-resolved not literally pinned in pom.xml, but confirmed identical via dependency tree |
| L7 SEBI 2FA circular dates (2022-03-31 redemption, 2023-04-01 purchase) | **CORRECTED** | Redemption-only mandate's actual effective dates were 2022-06-01/07-01; 2022-03-31 is an *extension*-circular date, not the mandate's origin. Purchase-extension effective date (2023-04-01) confirmed correct. SIP-registration-only OTP exemption confirmed directly in SEBI circular text |
| L8 SEBI cutoff times all revised 2025-06-01 (3pm std, 1:30pm liquid purchase, 7pm online redemption) | **CORRECTED** | Only overnight-scheme redemption cutoffs (3pm offline/7pm online) were revised 2025-06-01; 3pm standard and 1:30pm liquid/overnight purchase cutoffs are pre-existing, unchanged |
| L9 investors/investor_accounts linked only by PAN after explicit confirmation | **CORRECTED** | Primary link mechanism is direct ID-assignment at provisioning (link-approval or login-fallback); PAN+email best-effort match is a secondary fallback for legacy accounts only, not the primary/exclusive mechanism. No FK confirmed either way. |
| L10 assertDistributorAllotted is "the single hard gate" for self-signup | **CORRECTED** | Three additional independent distributor-null gates exist downstream (KYC self-service, bank-add, order-placement) — all must be removed, not just the login gate |
| L11 Cybrilla lists only ARN/RIA, no EOP category | SURVIVED | — |
| L12 2026-09-03 review: 0 PASS/8 PARTIAL/3 FAIL, T&C/redemption-disclosure/auto-defaults are the FAILs | SURVIVED (1/3 nuance) | T&C's distributor-bypass mechanism may have been remediated by later (uncommitted) migrations V80-V86, but the "no real document exists" root defect likely persists |
| L13 Holdings never fabricate; units_source gates redemption divisor and tax basis | SURVIVED (1/3 nuance) | `isEstimate()` covers MANUAL as well as DERIVED; DERIVED units ARE used for full-redemption drafting and ceiling display — the strict exclusion is specifically from unit-precise partial redemption, provider-submission, and tax cost basis |
| L14 DPDP Rules 2025 notified 2025-11-13, phased to 2027-05-13, ₹200-250cr penalties | SURVIVED | — |
| L15 2FA engine gates every Cybrilla/FP write | **CORRECTED — HIGH IMPACT** | The initial order/purchase-creation Cybrilla write (`OrderService.createOrder` → `cybrillaClient.createOrder`) fires **before** any 2FA challenge exists for investor-self-originated purchases, and outside any DB transaction. The gate is sound for payment/mandate/redemption-submission steps only. This directly compounds bug #1 in §11 and must inform the v2 checkout redesign. |
| G1 Cybrilla catalogue lacks fund-fact fields | Confirmed — new/second data source needed | — |
| G2 Payload builders clean + Cybrilla email unsent | Confirmed both | — |
| G3 No NAV cutoff logic anywhere in backend | Confirmed | — |
| G4 Cybrilla EOP/D2C support unconfirmed | Confirmed open | — |
| G5 Nominee cap regulatory conflict (3 vs 10 vs 3 again) | Confirmed unsettled, needs primary-source check | — |
| G6 ELSS lock-in enforced nowhere | Confirmed | — |
| G7 Both structural 2FA bugs still live as of 2026-09-25 | Confirmed | — |
| G8 No unified post-09-03 compliance scorecard exists; Cybrilla branch uncommitted | Confirmed | — |
| G9 No admin/back-office identity model; unrestricted signup role field | Confirmed | — |
| G10 No investor-scoped active-SIP-count or allocation-by-category | Confirmed, both net-new | — |
| C1 Self-serve purchase exists in backend but unreachable in UI and broken when reached | All three framings true simultaneously | — |
| C2 Nominee cap 3 vs 10 | Recommend 10 pending primary-source confirmation (see G5, superseded by 2026-05-29 circular — genuinely unsettled) | — |
| C3 Distributor removal needs zero FP schema change vs. needs new tenant relationship | Both true, different layers — no schema change needed, tenant/license question is separately open | — |
| C4 Regulatory posture decision (Option A vs EOP/RIA) made by anyone | Confirmed: still open, no decision found anywhere | — |
| C5 "Solid security" vs "0/11 PASS compliance" contradiction | Both true — orthogonal axes (infra security vs. regulatory content compliance) | — |
| C6 Which screens are the primary UI reference | `InvestorInvest.tsx`/`InvestorWithdrawal.tsx` confirmed as primary reference (wired to live backend contracts), not the distributor console | — |
