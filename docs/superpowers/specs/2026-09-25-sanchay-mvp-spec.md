<!-- source: workflow wf_0a226252-0e5 label mvp-spec | exported 2026-09-28 -->

# Sanchay MVP spec: closed real-money pilot (binding for S1 to S4 and the buffer week, Mon 2026-09-28 to Fri 2026-11-27)

Status: plan of record. Written read-only on Fri 2026-09-25. **Amended on Mon 2026-09-28 by the controller rulings R-01..R-23 (`docs/delivery/rulings.md`), which close the final critic; where this text and a ruling differ, the ruling wins.** **Amended again on Mon 2026-10-05 by the owner decisions R-31..R-34** (no AWS dev environment and a paused prod stack from S2, explicit queue policies, NAV history and the curated list on prod before GO-1, one log group and two image repositories).
Home once the repo exists: `docs/specs/mvp/MVP-SPEC.md`, plus ADR-0013 (MVP scope).
Precedence: this spec > PO decisions > harmonized rulings H-xx (§3) > GAP rulings > regulation > decision registers > target design > product specs > drafts.

## 0. Calendar, capacity and AI-factor assumption

| Sprint | Dates | Weekday holidays / leave | Days per dev | AI factor | Capacity (2 devs × days × 0.8 × factor) | Overheads (review 1.0 + FakeFp/sandbox 0.5) | Net ideal days |
|---|---|---|---|---|---|---|---|
| S1 | Mon 09-28 → Fri 10-09 | Fri 10-02 Gandhi Jayanti | 9 | 1.2 | 17.3 | 1.5 | 15.8 |
| S2 | Mon 10-12 → Fri 10-23 | Tue 10-20 Dussehra | 9 | 1.6 | 23.0 | 1.5 | 21.5 |
| S3 | Mon 10-26 → Fri 11-06 | none | 10 | 1.6 | 25.6 | 1.5 | 24.1 |
| S4 | Mon 11-09 → Fri 11-20 | Diwali leave Mon 11-09 and Tue 11-10 (Diwali is Sun 11-08; 11-10 is also an NSE holiday) | 8 | 1.6 | 20.5 | 1.5 | 19.0 |
| Buffer | Mon 11-23 → Fri 11-27 | Tue 11-24 Guru Nanak Jayanti | 4 | none | not planned | none | 0 (hardening, canary, gate only) |
| **Total** | | | | | | | **80.4** |

**Capacity model (one model for every document; ruling R-01, `docs/delivery/rulings.md`)**
- Capacity is computed on the **MVP basis**: 2 devs × days × 0.8 × AI factor, minus the overheads in the table. This basis **drops the roadmap's 0.75 focus factor and planned leave**. On the roadmap basis the assumed 1.6 factor is **≈ 2.1**, above the measured upside of 1.9, so the plan is aggressive.
- S1 uses 1.2 (agents execute the written Plan-01 TDD chunks, but environment setup dominates). S2 to S4 assume 1.6.
- **Bottom-up demand is 86.4 ideal days against 80.4 of capacity.** The honest Plan-01 cost is 24.9 d, not 19.0 (delta sheet §7). R-08 (`plans.cancel`, +1.0 d) is funded by trims T3 + T5; R-18 (account/SYS-01/legal.pending screens) adds 0.75 d.
- **Break-even measured factor for S2–S4: ≈ 1.75 without trims, ≈ 1.67 after T1–T6.** T1–T6 save 4.0 d and do not close the gap at 1.35 (about 11–15 d short there).
- Personal leave: none is booked. Any leave comes out of the 20% reserve and is recorded in ADR-0013.
- **Decision points (R-02):** trims T1–T6 are pre-acknowledged by the owner (master-plan approval, 2026-09-25) and are applied in §6 order at the **Fri 10-09** checkpoint if the S1 factor is short. **T7 and T8 need an explicit owner decision on Fri 10-23** (T7 if f₂ < 1.67; T8, or GO/NO-GO moved to 12-04/12-11, if f₂ < 1.45). The 10-09 and 10-23 measurements use this same formula.
- The 20% planning reserve and the buffer week are the only other contingency.

**Milestones (R-03, R-06, R-21)**

| Date | Milestone |
|---|---|
| Fri 10-09 | Packages, API platform and OTP senders green under Testcontainers; contract/api-client conformance green; CI ready for the first push (the owner authorises it, G-B2); S1 probe readout. |
| **Wed 10-21** | Login end to end on web and Android against the local API. |
| Fri 10-23 | Identity and profile onboarding screens (ONB-01..07) on web and Android against FakeFp; the KRA pre-verification sandbox probe green; catalogue data on the paused prod stack (R-24, amended by R-31; E25 is protected in S2, R-05). By 10-23 that stack's catalogue data is D9's NAV syncs only: the reference tables arrive with F1 (S4), the FP scheme flags after the production credentials (R-21), and the curated list and NAV history before GO-1 (R-33). Full onboarding end to end (attest + FP provisioning) moves to Fri 11-06 (R-24). Velocity re-baseline; owner decision on T7/T8. |
| Fri 11-06 | Lumpsum end to end in the sandbox. Cybrilla product demo part 1. Play app and signing key (SMS hash) ready. |
| Fri 11-13 | Prod stack hardened by F1 (it has run paused since E25's S2 deploy, R-31). FP production credentials are in hand (**latest Mon 11-16**; later ⇒ the gate moves to 12-04). |
| Wed 11-18 | Cybrilla demo part 2 (SIP and redemption). |
| Fri 11-20 | Feature freeze: SIP, dashboard and redemption work in the sandbox. Founders' canary started in prod on Tue 11-17. |
| Wed 11-25 | G-E4 sandbox smoke evidence due (runs allowed from Mon 11-16). |
| Fri 11-27 | **GO-1** real-money GO/NO-GO: onboarding, lumpsum, redemption. **GO-2** (SIP) follows its canary evidence (§7). |

---

## 1. MVP scope table

Legend: **MVP** = committed; **DEF(P2)** = deferred to phase 2; **EXT** = extension, built only if velocity allows (order in §6).
- oRPC keys are in `@sanchay/contract`. Paths are relative to `/api/v1`.
- [K] means an `Idempotency-Key` is required.
- Auth: P = public, I = investor session, IP = `can_purchase`, IX = `can_exit`, S = signature or ref.
- Screens are the JOURNEYS IDs. Each universal screen is built once in `packages/features` and rendered on web (app.sanchay.in, via RNW) and Android (Expo).

### 1.1 Group 1: Sign-up and self onboarding (existing KRA KYC only)

| Item | Screens | oRPC procedure → path | FP / provider operations (worker only) | Tables | Jobs | Status |
|---|---|---|---|---|---|---|
| Landing, legal, invite-only notice | PUB-01, PUB-02 (www, static RSC) | none | none | none | none | MVP (minimal) |
| Mobile SMS OTP sign-up/login | AUTH-01 (Android), AUTH-02, AUTH-03, AUTH-09 | `auth.requestOtp` POST `/auth/otp`; `auth.verifyOtp` POST `/auth/otp/verify`; `auth.session` GET `/auth/session`; `auth.logout` POST `/auth/logout`; `auth.revokeAll` POST `/auth/sessions/revoke-all` | MSG91 (DLT) | investors, investor_contacts, investor_devices, auth_sessions, otp_codes, pilot_invites, audit_events | otp/session cleanup (hourly; deletes only LOGIN and VERIFY_EMAIL otp rows, R-13) | MVP |
| Pilot invite gate | AUTH-03 error state | inside `auth.verifyOtp` (403 `PILOT_INVITE_REQUIRED` for an uninvited new mobile) | none | pilot_invites | none | MVP |
| Email OTP verification (required before ONB-00) | AUTH-04, AUTH-05 | `me.requestEmailOtp` POST `/me/email/otp` [K]; `me.verifyEmail` POST `/me/email/verify` [K] | SES | investors, investor_contacts, otp_codes | none | MVP |
| App lock (biometric or device credential; no PIN) | AUTH-06 explainer, AUTH-07 (Android only) | none | none | none | none | MVP (no-lock rule in H-13) |
| New-device email step-up; email-fallback login; sessions list and revoke-one | AUTH-08, PRF-10 | `auth.verifyEmail`, `auth.emailFallback`, `auth.listSessions`, `auth.revokeSession` | none | none | none | EXT (E3, E4) → DEF(P2) |
| Onboarding hub and stage | ONB-00, ONB-17, ONB-19, ONB-20 | `onboarding.get` GET `/onboarding` | none | onboarding_applications | none | MVP |
| PAN, name and DOB, KYC consent, KRA check | ONB-01, ONB-02 | `onboarding.submitIdentity` POST `/onboarding/identity` [K] | `POST /poa/pre_verifications {investor_identifier, pan, name, date_of_birth}`, then poll `GET /poa/pre_verifications/:id` | investor_profiles, kyc_checks | onboarding.preverify (30 s, 1 m, 5 m; upstream_error retry 1/5/30 m) | MVP. Only readiness `verified` proceeds. `kyc_unavailable/rejected/incomplete/onhold/legacy` → "KYC update needed; not yet supported in the pilot" (ONB-19 variant). `underprocess` → wait and recheck every 6 h. |
| New KYC or modify KYC (DigiLocker, eSign, signature, geotag) | ONB-03, 04, 10, 11, 18 | none | `/poa/kyc_forms…` | kyc_applications, documents | none | DEF(P2); EXT E5 |
| Personal details (investor-entered, never defaulted): gender, occupation, income slab, PEP, source of wealth, country and place of birth, nationality, tax status = RESIDENT_INDIVIDUAL chosen explicitly | ONB-05 | `onboarding.putProfile` PUT `/onboarding/profile` [K] | none (sent at provisioning) | investor_profiles | none | MVP. PEP or RELATED_PEP → BLOCKED in the pilot, reason recorded. |
| Address (pincode autofill) | ONB-06 | same PUT; `ref.pincode` GET `/ref/pincode/{pin}` | none | investor_profiles, ref_pincodes (seeded CSV) | none | MVP |
| FATCA, India-only tax residency | ONB-07 | same PUT | none | investor_profiles (`tax_resident_elsewhere`, `us_person` = false required) | none | MVP. Any "yes" → refuse (`onboarding.foreignTaxResidency=REFUSE`). |
| Bank account and penny drop, name match (GAP-07 g) | ONB-08, ONB-09 | `onboarding.addBank` POST `/onboarding/bank-accounts` [K]; `onboarding.listBanks` GET `/onboarding/bank-accounts`; `ref.ifsc` GET `/ref/ifsc/{ifsc}` | `POST /poa/pre_verifications {bank_accounts:[{value:{account_number, ifsc_code, account_type:"savings"}}]}` | bank_accounts, kyc_checks, ref_ifsc (seeded CSV) | bank.verify.poll (30 s, 1 m, 5 m, 30 m) | MVP. Jaro-Winkler ≥ 80 → VERIFIED; < 80 → FAILED ("use an account in your PAN name"). The 60–79 manual path is EXT E2. |
| Nominees (max 3) or Annexure-B opt-out; statement-visibility choice required | ONB-12, 13, 14 | `onboarding.getNomination` GET `/onboarding/nomination`; `onboarding.putNomination` PUT `/onboarding/nomination` [K] | sent at provisioning | nominees, nomination_decisions | none | MVP |
| Risk profile (GAP-03: 8 questions, 5 levels) | ONB-21, ONB-22 | `riskProfile.questionnaire` GET `/risk-profile/questionnaire`; `riskProfile.get` GET `/risk-profile`; `riskProfile.submit` PUT `/risk-profile` [K] | none | risk_questionnaires, risk_profiles | none | MVP |
| T&C, privacy notice, execution-only declaration, regular-plan/commission, risk disclosure, FATCA declaration, KYC consent | ONB-15 | `legal.getDocument` GET `/legal/documents/{key}`; `legal.pending` GET `/legal/pending`; `onboarding.stageDeclarations` POST `/onboarding/declarations` [K] | none | legal_documents | none | MVP |
| Review and attest (ONBOARDING_ATTEST; SMS and email codes) | ONB-16 + CNF-01 | `onboarding.attest` POST `/onboarding/attest` [K] → challenge; consent procedures in §1.3 | none before CONSUMED | consent_challenges, consent_records, consent_subjects | consent.expiry.sweep | MVP |
| FP provisioning | ONB-17 → ONB-20 | none (status via `onboarding.get`) | Order: `GET /v2/investor_profiles?pan=` (exact match) or `POST /v2/investor_profiles` → `POST /v2/phone_numbers` → `POST /v2/email_addresses` → `POST /v2/addresses {nature}` → `POST /v2/related_parties` (one per nominee) → `POST /v2/bank_accounts` (list-and-match first; store `old_id`) → `GET /v2/mf_investment_accounts?primary_investor=` or `POST {holding_pattern:"single"}` → `PATCH /v2/mf_investment_accounts {folio_defaults}` | investors (fp_* ids), bank_accounts (fp ids), nominees (`fp_related_party_id`, `sent_to_fp_fields`), onboarding_applications (`provisioning_step`) | onboarding.provision (resumable; 5xx/429 backoff ×5; 4xx → FAILED with ops alert) | MVP |
| Readiness (`can_purchase`, `can_exit`) | none | none | none | investors (deferred trigger `trg_investor_readiness`) | none | MVP |
| Account profile, read-only (profile, bank, nominees, risk profile, legal versions, support/grievance contact, logout, sign out everywhere) | PRF-01, PRF-12 (read-only subsets of PRF-02/05/07): **AccountScreen v2** (R-18) | `me.get` GET `/me` | none | none | none | MVP (AccountScreen v2 in Plan 04 F14, Dev B) |
| Legal re-acceptance after a document version change (drafts are swapped for approved texts on 11-13) | `legal.pending` banner plus re-accept sheet (R-18) | `legal.pending` GET `/legal/pending`; `onboarding.stageDeclarations` | none | legal_documents, consent_records | none | MVP (Plan 03 E13, Dev B) |
| Profile, contact, bank and nominee changes; account closure; DPDP centre | PRF-02..11, ACC-01..04 | none | none | none | none | DEF(P2). Pilot: email support plus a runbook. www `/account/delete` explains the process. |

### 1.2 Group 2: Fund catalogue and fund page

| Item | Screens | oRPC → path | FP / provider | Tables | Jobs | Status |
|---|---|---|---|---|---|---|
| Curated Regular-Growth list (PO-3). Seed CSV `data/curated-schemes.csv`, 40–60 ISINs. | none | none | `GET /v2/mf_scheme_plans/cybrillapoa?expand=mf_scheme,mf_fund`; `GET /api/oms/fund_schemes/:isin` | amcs, schemes, category_aliases | catalogue.fp.sync (05:30); `pnpm ops:catalogue:seed` | MVP |
| SEBI taxonomy (40 categories; `cutoff_class`, `volatility_class`) | none | `catalogue.categories` GET `/catalogue/categories` | none | sebi_categories | seed | MVP. Provisional until OX-19 lands in `regulatory-sources.md`. |
| Browse by category, search, filters (category, riskometer, AMC, min SIP), sort (default A–Z; user-chosen 1Y/3Y/5Y with DSC-26) | EXP-01, 02, 03, 04, 05 | `catalogue.listSchemes` GET `/catalogue/schemes?q&category&assetClass&amc&riskometer&minSipMax&sort&cursor`; `catalogue.amcs` GET `/catalogue/amcs` | none | schemes (gin trgm), fund_facts | none | MVP. Filters beyond category and search are trim T2. |
| Fund page: NAV chart, 1Y/3Y/5Y returns, minimums, exit load, lock-in, riskometer, TER, disclosures (DSC-01/03/04/05, regular-plan notice, commission line) | FUND-01, FUND-03 | `catalogue.getScheme` GET `/catalogue/schemes/{slug}`; `catalogue.navHistory` GET `/catalogue/schemes/{slug}/nav-history?range=1Y\|3Y\|5Y\|MAX` (≤ 260 points) | AMFI NAVAll and history | scheme_navs, nav_history, nav_sync_runs, scheme_returns, fund_facts, fund_facts_revisions, commission_disclosures | nav.sync.daily (21:30, 23:30, 07:00, 10:30); nav.history.backfill (CLI on publish); catalogue.returns.compute (after nav.sync) | MVP. NAV chart is trim T4. |
| FundFactsProvider: AdminCuration (CSV), AMFI (NAV, code), Cybrilla (thresholds, flags, lock-in, SIP dates). Resolver precedence ADMIN > CYBRILLA > AMFI. | none | none | as above | fund_facts, fund_facts_revisions | `pnpm ops:facts:import data/fund-facts.csv` | MVP |
| Publish gate (lean R1–R7): REGULAR ∧ GROWTH ∧ FP active and `purchase_allowed` ∧ category mapped ∧ riskometer ≤ 75 days ∧ TER ∧ exit-load text ∧ SID/KIM links ∧ a commission line resolves ∧ NAV ≤ 5 business days old | none | none | none | schemes.status | seed and FP sync re-evaluate | MVP. R8 (tax class) → DEF(P2). |
| Commission disclosure page | www `/commission-disclosure` (static) | `legal.commissionRates` GET `/legal/commission-rates` | none | commission_disclosures | seed | MVP |
| www SEO fund pages, collections, AMC pages, returns calculator, watchlist, suggest | EXP-06, EXP-07, FUND-02 | none | none | none | none | DEF(P2); SEO pages are EXT E6 |

### 1.3 Group 3: Buy (lumpsum and SIP), consent, payments

| Item | Screens | oRPC → path | FP operations | Tables | Jobs | Status |
|---|---|---|---|---|---|---|
| Consent engine (shared) | CNF-01 (OTP sheet), CNF-02 (status) | `consents.getChallenge` GET `/consents/challenges/{id}`; `consents.sendOtp` POST `/consents/challenges/{id}/otp` [K]; `consents.approve` POST `/consents/challenges/{id}/approve` [K]; `consents.cancel` POST `/consents/challenges/{id}/cancel` [K] (R-20) | none | consent_challenges, consent_records, consent_subjects, legal_documents (TPL_*), otp_codes | consent.expiry.sweep (*/5); drafts.abandon (hourly) | MVP |
| Suitability check and acknowledgement | CNF-03 | returned by the quote procedures; the ack is bound into the challenge snapshot | none | suitability_checks, suitability_acknowledgements | notifications.send (emails the warning copy, per AMFI FAQ Q7(a)) | MVP |
| Lumpsum: amount, cut-off display, stamp-duty estimate, payment method (UPI intent/QR/collect or netbanking) chosen **before** consent | INV-01, INV-02 | `orders.quotePurchase` POST `/orders/purchases/quote`; `orders.createPurchase` POST `/orders/purchases` [K] → `{orderId, challengeId}` | Chain in §4.2 (custom checkout) | orders, order_events, payment_attempts, folios | orders.purchase.submit; orders.purchase.advance; payments.poll (30 s, 1 m, 2 m, 5 m, 15 m) | MVP |
| Payment hand-off and return | PAY-01, SYS-05 (web `/r/[kind]`, Android App Link `/app/r/[kind]`) | `orders.get` GET `/orders/{id}` (includes `payment{attemptId, redirectUrl\|upiUri, status}`); `payments.get` GET `/payments/{attemptId}`; raw route GET/POST `/pg/return/{ref}` (api host; S) | `POST /api/pg/payments/netbanking {amc_order_ids:[old_id], method:"NETBANKING"\|"UPI", bank_account_id: fp_bank_old_id, payment_postback_url, provider_name:"ONDC", upi?:{type:"uri"}\|{type:"collect",vpa}}`; `GET /api/pg/payments/:id`; `GET /api/pg/payments?amc_order_ids=` | payment_attempts | payments.poll; fp.event.process | MVP |
| Order list and detail, cancel before FP | ORD-01, ORD-02 | `orders.list` GET `/orders`; `orders.get`; `orders.cancel` POST `/orders/{id}/cancel` [K] (only in CONSENT_PENDING, or CONSENTED before any FP attempt) | none | orders, order_events | none | MVP |
| SIP: MONTHLY only, day 1–28 ∩ scheme `sip_dates` (not preselected), minimum = max(scheme SIP minimum, ₹100), duration "until I cancel" (360) or n | SIP-01, SIP-03 | `plans.quoteSip` POST `/plans/sips/quote`; `plans.createSip` POST `/plans/sips` [K] → `{planId, mandateId, challengeId}` | Chain in §4.3 | plans, mandates | plans.sip.submit | MVP |
| Mandate: reuse an APPROVED one with headroom, or create UPI Autopay (fixed ₹1,00,000) or eNACH (ladder [1L, 2L, 5L, 10L, 25L] ≥ 1.5 × monthly SIPs on that bank) | SIP-02, MND-03 | `mandates.list` GET `/mandates`; `mandates.get` GET `/mandates/{id}` (includes `authUrl\|upiUri`); `mandates.authorize` POST `/mandates/{id}/authorize` [K] (re-mint while CREATED) | `POST /api/pg/mandates {mandate_type:"UPI"\|"E_MANDATE", bank_account_id, mandate_limit, provider_name:"CYBRILLAPOA"}`; `POST /api/pg/payments/emandate/auth {mandate_id, payment_postback_url, upi?}`; `GET /api/pg/mandates/:id` | mandates | mandates.submit; mandates.poll (*/10 while AUTH_PENDING/BANK_PENDING; daily 07:30 for APPROVED) | MVP. eNACH is trim T6. |
| SIP instalments (read-only) | SIPM-01, SIPM-02 (read-only) | `plans.list` GET `/plans`; `plans.get` GET `/plans/{id}` | `GET /v2/mf_purchase_plans/:id`; `GET /v2/mf_purchases?plan=` | orders (origin SIP_INSTALMENT) | plans.instalments.sync (08:30, 20:30) | MVP |
| "Start today" (`generate_first_installment_now` + `POST /api/pg/payments/nach`) | none | none | none | none | none | EXT E1, only once probe P-09b proves it on ONDC |
| **Investor SIP cancel (R-08)**: minimal, consent-first | SIPM-02 "Cancel SIP" action + CNF-01 | `plans.cancel` POST `/plans/{id}/cancel` [K] (I) → `{challengeId}`; SMS consent through the existing engine (subject `SIP_CANCELLATION`, SMS template `SANCHAY_CONSENT_OTP_V1` with action "cancel SIP of") | FP purchase-plan cancel (class M) under `useConsumed`; status → CANCELLED (`cancelled_by='INVESTOR'`) | plans, consent_challenges | plans.cancel.submit | MVP (Plan 04 F28, S4, ≈ 1.0 d funded by T3 + T5). SEBI requires cancellation within 2 working days; ops never makes FP writes. |
| SIP management (amount change per PO-6, pause), standalone mandate management | SIPM-03..06, MND-01/02/04 | none | none | plan_modifications | none | DEF(P2) |

### 1.4 Group 4: Dashboard and redemption

| Item | Screens | oRPC → path | FP operations | Tables | Jobs | Status |
|---|---|---|---|---|---|---|
| Dashboard: invested, current value (null if unpriced), gains over valued holdings, XIRR (PO-5), `activeSips` from `sipCounts()`, pending amounts, "things to do" | HOME-01, HOME-02 | `portfolio.summary` GET `/portfolio/summary` | none (computed on read) | lots, lot_consumptions, scheme_navs, plans, orders | none | MVP |
| Holdings list and detail (lots, lock-in, availability, units total/available/locked/in-process) | PORT-01, PORT-02 | `portfolio.holdings` GET `/portfolio/holdings`; `portfolio.holding` GET `/portfolio/holdings/{folioId}/{isin}` | none | lots, folios, redemption_reservations | none | MVP |
| Allocation by SEBI category (asset class → category; largest remainder) | inside PORT-01 | `portfolio.allocation` GET `/portfolio/allocation` | none | as above | none | MVP (bar chart is trim T3 → list) |
| Ledger (FIFO; units from provider only; UNITS_PENDING) | none | none | allotment fields on the FP object | lots, lot_consumptions, ledger_exceptions | orders.units.reconcile (every 2 h) | MVP |
| Redemption by amount / units / all; availability (port of RedemptionAvailability); ELSS strict lock; buffer; payout status | RED-01, RED-02, CNF-01, CNF-02 | `orders.quoteRedemption` POST `/orders/redemptions/quote`; `orders.createRedemption` POST `/orders/redemptions` [K] | Chain in §4.4. The quote (api role) reads the **FP holdings snapshot** `folios.fp_holdings_snapshot` written by the worker (R-09); the worker re-checks `GET /api/oms/reports/holdings?investment_account_id=<old_id>&folios=` live in `orders.redemption.submit` | orders, redemption_reservations, folios | orders.redemption.submit; payout.watch (10:00) | MVP. UNITS mode only if P-09 proves it (else a PO-2 escalation, never a silent hide); trim T5. |
| Folio sync (folio number, registered contacts, payout bank masked, FP holdings snapshot) | none | none | `GET /v2/mf_folios?mf_investment_account=&folio_number=`; holdings report → `folios.fp_holdings_snapshot`, `fp_holdings_synced_at` | folios | folio.sync (worker; 05:00 and on demand when a redemption quote finds the snapshot > 24 h old) | MVP |
| Reconciliation, lean | none | none | `GET /v2/mf_purchases?mf_investment_account=&states=`, `GET /v2/mf_redemptions?…`, `GET /v2/mf_purchase_plans?…`, holdings report | recon_breaks | fp.reconcile.nonfinal (*/5); recon.fp.daily (02:00); integrity.invariants (hourly: M1, M3, M4) | MVP |
| Tax reports, statements, CAS, switch/STP/SWP, notifications inbox, push | STM-*, CAS-*, SWT/STP/SWP-*, NTF-* | none | none | none | none | DEF(P2) |

### 1.5 Cross-cutting

| Item | Path / artefact | Status |
|---|---|---|
| App config and forced update | `meta.appConfig` GET `/app/config` (P; `minAppVersion.android`, flags, cut-off display times, limits, ARN tagline, support). Below the minimum → 426 `APP_VERSION_UNSUPPORTED` → the **SYS-01 update screen**, driven by an api-client 426 interceptor (R-18; Plan 03 E24). | MVP |
| Health (R-12) | GET `/health` is **liveness only** (process up + DB reachable) and is the only ALB and ECS health check. GET `/health/ready` is diagnostic (DB, pg-boss, worker heartbeat < 2 min) and **never checks NAV age**. NAV age is a CloudWatch alarm plus a per-scheme AGED grade that blocks new purchases and AMOUNT redemptions in the affected schemes only. | MVP |
| FP webhooks and payment returns (R-11) | raw routes POST `/webhooks/fp` and GET\|POST `/pg/return/{ref}` (api host only). With `/health`, they skip ClientGuard, SessionGuard and the throttler (Plan-01 B18 `@InfraRoute`) and are restricted only by HostGuard (webhook and returns on `api.sanchay.in`, health on both hosts). Tests cover every exemption. | MVP |
| Transactional email (SES): order placed/allotted/failed, redemption processed, SIP/mandate status, suitability-warning copy, "new sign-in" security email | notifications.send | MVP (minimal; no inbox, no push) |

---

## 2. Lean architecture subset

### 2.1 Apps and packages (`@sanchay/*`)

| Path | MVP surface | Not in MVP |
|---|---|---|
| `apps/api` | Nest 11.2.6 (Fastify), oRPC 1.15.4, Drizzle. Roles `SANCHAY_APP_ROLE=api\|worker\|migrate\|ops`. The `ops-cli` scripts run with **`SANCHAY_APP_ROLE=ops`** (DB user `sanchay_app`, no DDL; R-16) as one-off tasks via `aws ecs run-task --overrides`; they enqueue re-fetch jobs, run seeds, or write the audited business data their runbook names. ECS Exec logs to CloudWatch. | `main-admin.ts`, admin role |
| `apps/web` | Next 16.3.6. www (static RSC: landing, legal, commission, grievance, `/account/delete`) and app (root routes, universal screens via RNW) | SEO fund pages, bundle budgets |
| `apps/mobile` | Expo 57, Android only. Local Gradle release build (subst S:) → AAB to Play internal testing; EAS Build (cloud) as fallback. Modules: expo-secure-store, expo-local-authentication, expo-crypto, expo-web-browser, expo-linking, expo-screen-capture, react-native-svg. | iOS, EAS Submit/Update, image-picker, location, SMS Retriever module (EXT), UPI intent allowlist module |
| **`apps/admin`** | **Not in MVP** (DEF(P2)). `ops.sanchay.in` is reserved with no DNS record. | all |
| `packages/{config,money,validation,domain,contract,api-client,tokens,ui,app-core,features,test-fixtures}` | As in Plan 01, extended per feature. `domain` adds: states + `canTransition`, JCS snapshot, cut-off engine, stamp duty, availability and buffer, ELSS lock, FIFO, XIRR port, `sipCounts`, mandate-limit ladder, suitability scoring, name-match, `deriveOnboardingStage`. | `www-ui` (www uses 3–4 inline server components), `authz`, `expo-plugins` |
| `tools/fp-probes` | Lean probe set (§7) | full P-01..P-14 |
| `infra/` | One CDK app with one stack, `SanchayMvpStack-prod` (§2.4, R-31) | CloudFront, WAF, multi-service, an AWS dev environment (R-31) |

### 2.2 Modules and reduced surface

| Module | MVP surface | Removed / deferred |
|---|---|---|
| platform | `Db.tx`, `newId`, `Crypto` (AES-256-GCM, row AAD, blind index) with KeyService **`local\|secrets`**, `Jobs.enqueue(tx)` (pg-boss 12.34.0) with an explicit policy per queue from D2's registry (R-32: `stately` for per-aggregate sync, poll and reconcile jobs, `exclusive` for jobs that submit to FP, `standard` for `notifications.send`; a policy cannot change after `createQueue`), `Audit.record`, `Clock`, `Config`, idempotency interceptor, HostGuard (§3 H-1), client-IP resolver, throttler, boot guards | KMS KeyService, Approvals, Flags maker-checker, product_events, EdgeGuard via CloudFront headers |
| identity | OTP engine (LOGIN, VERIFY_EMAIL, CONSENT purposes active), sessions (web cookie, native bearer bound to installation), devices, pilot invite check | step-up token, email fallback, device consent key, session list, admin identity |
| legal-consent | LegalDocs (seeded, versioned from `apps/api/src/modules/legal-consent/documents/*.md`), ConsentEngine (create/sendOtp/approve+consume/useConsumed), ConsentDestinationResolver (lean), `trg_consent_guard` | legal publish maker-checker, evidence PDF (the data is kept; PDF deferred) |
| onboarding | identity/KYC check, profile, bank, nomination, risk profile, declarations, attest, provisioning, readiness | KYC applications, onboarding reviews, tax_residencies, post-onboarding changes |
| catalogue | schemes, categories, facts, commission, NAV, returns, holidays | tax classes, watchlist, collections, calendar publishing |
| orders | purchase and redemption ONE_TIME orders, SIP_INSTALMENT orders, plans (SIP) | switch, STP, SWP, plan modifications |
| payments | payment attempts (custom checkout), mandates | standalone mandate management, refund automation beyond status capture |
| portfolio | Ledger.applyAllotment/applyExit, Availability.reserve, PortfolioQueries (on read) | ledger adjustments, holdings feed, report requests |
| notifications (minimal) | `Notify.enqueue(tx)` → SES email; SMS only for OTP | push, inbox, preferences |
| integrations/fp | FpRead, FpKyc, FpProvision(`ConsumedConsent`), FpTransact(`ConsumedConsent`); undici; lossless-json; provider_calls allow-list; FakeFp (stateful) | tenant reports M6, holdings feed |
| integrations/amfi | NAVAll parser and floors (port), history backfill | vendor feed |
| integrations/sms | MSG91 (DLT), capture, Mailpit | secondary provider |
| integrations/email | SES v2 ap-south-1, capture, Mailpit | marketing config set |

### 2.3 MVP tables (schema `app`; target names; key columns only)

Conventions (design §C.1 unchanged):
- `+std` means `created_at`, `updated_at` (timestamptz(6)) and `version`; `+actor` means `created_by` and `updated_by`.
- Ids come from `newId()` (uuidv7).
- Money is `numeric(18,2)`, units `numeric(20,3)`, NAV `numeric(18,6)`.
- `*_enc` columns use AES-GCM with AAD `table.column:rowId`; `*_bidx` columns hold the HMAC blind index.

| Module | Table | Key columns (MVP subset) |
|---|---|---|
| platform | audit_events (append-only) | occurred_at, actor_type, actor_id, action, entity_type, entity_id, request_id, ip, data (allow-listed) |
| | idempotency_keys | (actor_id, key) PK, route, request_sha256, status, response_status, response_body, expires_at (24 h) |
| | provider_calls (append-only) | provider, operation, aggregate_type, aggregate_id, http_status, duration_ms, error_code, request_meta, response_meta (allow-listed), body_enc |
| | inbound_webhook_events | UNIQUE(provider, event_id), event_type, object_id, signature_valid, signature_mode CHECK (HMAC, SHARED_SECRET, NONE[local only]), payload_enc, payload_sha256, status, attempts |
| | recon_breaks | kind, entity_type, entity_id, severity, detail, status, UNIQUE(kind, entity_id) WHERE status<>'RESOLVED' |
| | app_config | key PK, value jsonb (pilot caps, feature flags, `money_params_version`) |
| | worker_heartbeats | task_id PK, last_beat_at |
| | ref_ifsc, ref_pincodes | seeded from CSV |
| | **pilot_invites** (MVP-only) | mobile_bidx UNIQUE, invited_by, note, expires_at, used_at |
| identity | investors | status, mobile_enc/bidx/last4, email_enc/bidx/masked, email_verified_at, can_purchase, can_exit, purchase_block_reason, exit_block_reason, current_risk_profile_id, fp_investor_profile_id, fp_mf_investment_account_id, fp_mfia_old_id, fp_phone_id, fp_email_id, fp_address_id |
| | investor_contacts | kind, value_enc/bidx, masked, verified_at, status CURRENT/PREVIOUS |
| | investor_devices | platform (WEB, ANDROID), device_ref_hash, app_version, last_seen_at, revoked_at |
| | auth_sessions | device_id, platform, token_hash, idle_expires_at, absolute_expires_at, revoked_at, revoke_reason |
| | otp_codes | purpose (H-4 enum), channel, destination_bidx/masked, destination_enc, pepper_kid, reference_id, code_hmac (input `purpose‖dest_bidx‖otp_row_id‖code`, R-14), attempts ≤ 5, expires_at, consumed_at, consumed_reason, device_ref_hash, provider, provider_message_id, template_id, dlr_status. Cleanup deletes only LOGIN and VERIFY_EMAIL rows; CONSENT rows are kept under the retention policy (R-13). |
| legal-consent | legal_documents | key, version, body_markdown, sha256, status (PUBLISHED via seed only), effective_from |
| | consent_challenges | subject_type (PURCHASE, REDEMPTION, SIP_REGISTRATION, MANDATE_REGISTRATION, ONBOARDING_ATTEST), subject_id, status, snapshot_enc, snapshot_sha256, template_key/version, rendered_text_enc, rendered_sha256, eligible_destinations, required_factors, send_count ≤ 3, expires_at (10 min), otp_expires_at, approved_at, consumed_at, execute_before, saga_expires_at, consent_record_id |
| | consent_records (append-only apart from `delivery_evidence`) | consent_key, legal_document_id, document_sha256, rendered_text_enc, content_sha256, snapshot_sha256, challenge_id, otp_channels_verified, delivery_evidence (R-13: template id, provider message id, DLR status, timestamps, masked destination; copied from the CONSENT otp rows at approve time and updated by the delivery-report job; SEBI 2FA audit), action, ip, user_agent, session_id, channel |
| | consent_subjects | (challenge_id, subject_type, subject_id) PK |
| onboarding | investor_profiles | pan_enc/bidx/last4, name_as_per_pan, dob_enc, gender, occupation, income_slab, source_of_wealth, pep_status, tax_status CHECK (RESIDENT_INDIVIDUAL), nationality, country_of_birth, place_of_birth_enc, tax_resident_elsewhere, us_person, address_line1_enc, address_line2_enc, city, state, pincode, address_nature, kyc_status, kyc_status_check_id, readiness_code |
| | onboarding_applications | contacts/identity/profile/eligibility/kyc/bank/nomination/risk/declarations/attest/provisioning status, kyc_path CHECK (EXISTING_VALID, NONE), attest_challenge_id, provisioning_step, otp_roundtrips |
| | kyc_checks | purpose (IDENTITY, BANK), fp_pre_verification_id, status, readiness_status, readiness_code, pan/name/dob/bank status and codes, response_meta |
| | bank_accounts | account_number_enc/bidx, account_last4, ifsc, bank_name, holder_name_enc, account_type CHECK (SAVINGS), status, verification_check_id, name_match_score, fp_bank_account_id, fp_bank_old_id, is_primary |
| | nominees | set_version, position CHECK (1..3), name_enc, name_length ≤ 40, relationship, is_minor, dob_enc, guardian_name_enc, id_type NULL CHECK (PAN, DRIVING_LICENCE, PASSPORT), id_value_enc NULL, allocation_pct (integer 1..100; per-set sum 100 via deferred trigger), fp_related_party_id, sent_to_fp_fields, status |
| | nomination_decisions | decision (NOMINATED, OPTED_OUT), effective_set_version, display_preference NOT NULL when NOMINATED, consent_record_id |
| | risk_questionnaires | version, status, questions_and_scoring, sha256, effective_at |
| | risk_profiles (append-only) | questionnaire_id, answers, raw_score, caps, level, max_riskometer, status, completed_at, expires_at (+24 months) |
| | suitability_checks | order_id or plan_id, scheme_id, scheme_riskometer, fund_facts_as_of, risk_profile_id, level, outcome (MATCH, MISMATCH) |
| | suitability_acknowledgements | check_id, warning_doc_key/version/sha256, checkbox_at, challenge_id, consent_record_id |
| catalogue | amcs | name, slug, fp_fund_name, empanelled, active |
| | sebi_categories | code, asset_class, name, slug, sebi_ref, cutoff_class (STANDARD, LIQUID, OVERNIGHT), volatility_class |
| | category_aliases | alias, source, category_code |
| | schemes | isin, amfi_scheme_code, amc_id, name, slug, plan_type CHECK (REGULAR), option CHECK (GROWTH), category_code, lock_in_months, is_elss (generated), fp_active, purchase_allowed, redemption_allowed, sip_allowed, thresholds, sip_dates, status (DRAFT, PUBLISHED, SUSPENDED), curated boolean |
| | fund_facts | scheme_id, expense_ratio_pct and as-of, riskometer and as-of, benchmark_name, benchmark_riskometer, exit_load_text, sid_url, kim_url, field_sources, completeness |
| | fund_facts_revisions (append-only) | scheme_id, source, payload |
| | commission_disclosures | amc_id or scheme_id, trail_min_bps, trail_max_bps, kind (EXACT, RANGE), effective_from, source |
| | scheme_navs | isin, nav, nav_date, prev_nav, prev_nav_date, quarantined |
| | nav_history | (isin, nav_date) PK, nav |
| | nav_sync_runs | kind, status, counts, max_nav_date, failure_reason |
| | scheme_returns | scheme_id, as_of, cagr_1y, cagr_3y, cagr_5y, abs_6m, display_eligible |
| | market_holidays | holiday_date, kinds (EQUITY, MONEY_MARKET, BANK) (seeded for 2026–2027) |
| orders | orders | type (PURCHASE, REDEMPTION), origin (ONE_TIME, SIP_INSTALMENT), plan_id, scheme_id, folio_id, mode (AMOUNT, UNITS, ALL), amount, units, status (§4), consent_challenge_id, bank_account_id, payment_method, arn, euin NULL, execution_only=true, initiated_via, user_ip inet, expected_nav_date, expected_nav_date_at_approve, cutoff_class, fp_order_id, fp_old_id, fp_state, allotted_units, allotted_nav, allotted_nav_date, purchased_amount, stamp_duty, redeemed_units, redeemed_amount, units_source, units_pending_since, payout_status (NONE, EXPECTED, DELAYED, CREDITED), payout_expected_on, payout_ref, suitability_check_id, suitability_ack_id, submit_attempts, failure_code, final_at |
| | order_events (append-only) | order_id / plan_id / mandate_id, from_status, to_status, trigger, provider_event_id, detail |
| | plans | type CHECK (SIP), scheme_id, folio_id, amount, frequency CHECK (MONTHLY), installment_day 1..28, number_of_installments, first_installment_date_shown, first_installment_date, next_installment_date, mandate_id NOT NULL, status, consent_challenge_id, arn, euin NULL, user_ip, fp_plan_id, fp_state, cancelled_by, final_at |
| payments | payment_attempts | order_id, attempt_no, method (UPI_INTENT, UPI_QR, UPI_COLLECT, NETBANKING), amount, status, fp_payment_id, return_channel (WEB, APP), return_token_hash, redirect_url_enc, redirect_expires_at, upi_uri, postback_status (untrusted), failure_code, late_auth, refund_status, refund_amount, refund_ref; UNIQUE(order_id) WHERE status live; UNIQUE(order_id) WHERE SUCCESS |
| | mandates | bank_account_id, rail (UPI_AUTOPAY, ENACH), limit_amount CHECK (IN (100000, 200000, 500000, 1000000, 2500000)) ∧ (rail≠UPI_AUTOPAY ∨ 100000), status, consent_challenge_id, fp_mandate_id, umrn, auth_url_enc, upi_uri, approved_at, rejected_reason, cancelled_by |
| portfolio | folios | investor_id, amc_id, folio_number, registered_mobile_bidx[], registered_email_bidx[], registered_contacts_masked, payout_bank_masked, contacts_synced_at, **fp_holdings_snapshot jsonb, fp_holdings_synced_at** (R-09; written only by the worker's `folio.sync`), reconciliation_status (UNRECONCILED, MATCHED, MISMATCH, FEED_UNAVAILABLE), last_reconciled_at |
| | lots | folio_id, scheme_id, source_order_id UNIQUE, lot_type (PURCHASE, SIP_INSTALMENT), allotment_date, nav, units, cost_amount, stamp_duty, units_remaining, cost_remaining, lock_in_until, units_source, status |
| | lot_consumptions | lot_id, exit_order_id, units, cost_amount, sale_amount, sale_nav, sale_date, holding_days |
| | ledger_exceptions | kind (UNITS_SHORTFALL, UNITS_UNKNOWN, FEED_MISMATCH, UNMATCHED_PROVIDER_OBJECT), expected_units, provider_units, delta, status |
| | redemption_reservations | order_id UNIQUE, folio_id, scheme_id, units_reserved, status (ACTIVE, SETTLED, RELEASED), release_evidence |
| notifications | notifications, notification_deliveries | category, template_key, dedupe; channel EMAIL, provider_message_id, status |

**Not created in MVP:** admin_users, admin_sessions, admin_approvals, tax_residencies, onboarding_reviews, kyc_applications, documents, folio_service_requests, plan_modifications, ledger_adjustments, report_requests, cas_imports, external_holdings, watchlist_items, notification_preferences, service_requests, product_events, scheme_tax_classes, calendar_years, plan_instalments.

**DB roles:** `sanchay_migrator`, `sanchay_app`, `sanchay_readonly` (views without `*_enc`, used by ops SQL), `sanchay_retention` (created, unused).

### 2.4 Infra (minimal AWS ap-south-1; ADR-0014)

- **CDK stack `SanchayMvpStack-prod`** (R-31: there is no AWS dev environment and no dev domain; development runs locally on docker compose)
  - VPC: 2 AZs; public subnets for the ALB, private subnets for ECS and RDS.
  - **1 NAT gateway with an EIP.** This is the static egress IP to give Cybrilla for allowlisting.
  - **ALB (IPv4 only)**: HTTPS 443 with an ACM certificate for `www`, `app` and `api.sanchay.in`; apex → 301 to www; HTTP → HTTPS; TLS policy `ELBSecurityPolicy-TLS13-1-2-2021-06`; `xff_header_processing.mode=append`.
  - **Listener rules (R-11, E25):** host `app.sanchay.in` + path `/api/v1/*` → the api target group (3000); host `api.sanchay.in` → api; `www` and the rest of `app` → web (3001). The one ECS service registers both target groups, so `user_ip` is the client's address, never a Next proxy's. The ALB and ECS health checks use `/api/v1/health` (liveness, R-12).
- **One ECS Fargate service `sanchay-app`** (arm64; 2 tasks) whose task definition has three containers:
  - `web` (3001);
  - `api` (3000);
  - `worker` (`SANCHAY_APP_ROLE=worker`).
  - FP/POA secrets are injected **only into `worker`**.
  - Deployment uses the circuit breaker with rollback.
  - The one-off task `migrate` runs before each deploy.
- **RDS PostgreSQL 18**: `db.t4g.medium`, Multi-AZ in prod, storage encrypted (RDS KMS), `rds.force_ssl=1`, PITR 14 days, deletion protection. The prod connection uses **`sslmode=verify-full` with the RDS CA bundle baked into the image** (R-15; R-31 leaves no dev AWS connection); local compose runs without TLS.
- **Prod stack timing (R-05, R-31):** E25 deploys `SanchayMvpStack-prod` in S2 week 2 (Dev A, ≈ 12 h, still protected by R-05) and keeps it paused until GO-1: sign-in stays invite-only (D7; prod boot invariant 10), `orders.enabled` and `plans.sip.enabled` stay false, and no invite is added except the founders' test accounts. F1 hardens the same stack in S4, and F22's passive ZAP baseline runs against it before GO-1. `sanchay.in` and its hosted zone must exist in the prod account before E25 deploys. **Open for the owner:** (a) whether a switch may go on before GO-1 for a founders' canary leg (G-E7) or the F27 drill (Plan 04 turns it on with two founders and off straight after); (b) where FP sandbox webhooks and payment returns land before 11-06: R-05 protected this slot for a public host (sandbox webhooks, payment returns, the 10-23 callback URLs promised to Cybrilla, the 11-06 demo), but E25's prod config runs FP in production mode, and the tunnel fallback (ADR-0014) has no dev domain.
- **Other resources**
  - S3 `sanchay-{env}-docs`: block public access, SSE, versioning. Holds seeds, legal-document snapshots and exports.
  - ECR `sanchay-{env}-api` and `sanchay-{env}-web`, each keeping its own last 20 images (R-34).
  - Secrets Manager `sanchay/{env}/*`, including the PII and blind-index keyring, the OTP pepper and the session-token key.
  - CloudWatch Logs (R-34): every container logs to one group, `/sanchay/{env}/app` (400 days), with awslogs stream prefixes, and every log line carries a `service` field set per task definition, so per-container metric filters and alarms work in the one group. F1 adds a CloudWatch Logs data-protection policy that masks PAN and Indian mobile numbers. Deferred to P2: a customer-managed KMS key and any log-group split (ops first).
  - **Retention (R-34):** from E25 on, the log group and both repositories use `RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE` (CloudFormation `RetainExceptOnCreate`): a stack teardown or rename never deletes the 400-day logs (CERT-In needs 180 days), and a failed first create still cleans up so the retry works.
  - Alarms → SNS email and SMS to both developers.
  - Route 53 public hosted zone `sanchay.in` in the prod account, created before E25 deploys (R-31); E25 adds the `www`, `app`, `api` and apex records.
  - GitHub OIDC deploy role.
- **Not in MVP:** CloudFront, WAF, `ops`/`errors`/`t` hosts, a separate admin service, Sentry, VPC endpoints, GuardDuty/Security Hub (EXT), a cross-region vault.
- **Prod DB access:** only through an SSM port-forward session using `sanchay_readonly`. Time-boxed and logged. ECS Exec is enabled with logging to CloudWatch, and ops CLIs run as `aws ecs run-task --overrides` tasks with `SANCHAY_APP_ROLE=ops` (R-16).

---

## 3. Harmonized rulings (binding; each closes the listed conflicts)

| # | Topic | Binding answer | Resolves |
|---|---|---|---|
| H-1 | Host and route model | **Four-host model (D-PLATFORM-010); `ops` reserved in MVP.** (1) `www.sanchay.in`: static public pages; apex 301 → www. (2) `app.sanchay.in`: investor web app at **root routes, no `/app` prefix**, plus same-origin cookie API `/api/v1/*`, `/.well-known/assetlinks.json`, web returns `/r/[kind]`. (3) `api.sanchay.in`: native bearer API `/api/v1/*`, `POST /api/v1/webhooks/fp`, `GET\|POST /api/v1/pg/return/{ref}`; cookies ignored. (4) `ops.sanchay.in`: reserved, no DNS. **`/api/v1` is the prefix on every host.** There is no CloudFront, so a **HostGuard** replaces EdgeGuard: cookie auth only on the app host, bearer only on the api host, webhooks and returns only on the api host; a mismatch returns 404. Client IP = the rightmost XFF entry appended by the ALB (`SANCHAY_CLIENT_IP_SOURCE=alb`). IPv4 only, so `user_ip` is always IPv4; anything else → 422 `CLIENT_IP_UNSUPPORTED`. **Web routes:** `/login`, `/signup`, `/` (Home), `/onboarding/[step]`, `/explore`, `/explore/category/[slug]`, `/funds/[schemeSlug]`, `/invest/[schemeId]/lumpsum` and `/invest/[schemeId]/sip` → `/review` → `/confirm/[challengeId]` → `/pay/[orderId]` → `/result/[orderId]`, `/portfolio`, `/portfolio/holdings/[folioId]/[isin]`, `/portfolio/orders[/orderId]`, `/portfolio/sips[/planId]`, `/redeem/[folioId]/[isin]`, `/account/**`, `/r/[kind]`. `schemeId` = ISIN. **Native deep links:** Android App Links verified on `https://app.sanchay.in/app/*` (`pathPrefix:/app`, `autoVerify`). On the web, `/app/<path>` → 307 to `/<path>`. `+native-intent.tsx` strips `/app`, validates the route against a zod allowlist and drops unknown params; links never execute actions and never carry tokens or PII. **Payment and mandate returns:** FP `payment_postback_url` = `https://api.sanchay.in/api/v1/pg/return/{ref}` (`ref` is an opaque 128-bit value, single use, valid until terminal or 24 h). The backend enqueues a re-fetch, never trusts params, and 303s to: **web** `https://app.sanchay.in/r/{payment\|mandate}?ref=`; **Android** (`return_channel=APP`) `https://app.sanchay.in/app/r/{kind}?ref=` (App Link). Android launches with `WebBrowser.openAuthSessionAsync(url, 'https://app.sanchay.in/app/r/{kind}')`, polls on AppState resume, and if Custom Tabs does not hand off, the web `/r/[kind]` page shows an "Open Sanchay" button. The `sanchay://` scheme exists only when `APP_VARIANT≠production`. `safeNext` accepts only `^/(?!/)[A-Za-z0-9/_\-]*$`. | Critic "domain/host model" (four defaults); O-01, D-1, OX-34, ESC-1; "/api/v1 path prefix" |
| H-2 | Lumpsum FP call order (verified by WebFetch 2026-09-25) | **The GA "custom checkout" order for cybrillapoa is binding:** `POST /v2/mf_purchases` → `under_review` → `pending` (`mf_purchase.review_completed` or poll) → `PATCH {id, consent}` → `POST /api/pg/payments/netbanking` (payment created and stored) → `PATCH {id, state:"confirmed"}` → `submitted` → collection (`token_url` for netbanking, valid 15 min; `upi.uri` via `payment.updated` or GET for intent/QR; a collect request for collect) → `successful` / `failed`. The docs say consent is "required before payment can be initiated" and "there is no provision to create multiple payments against the same order(s)". **Consequences:** (a) the payment method is picked at INV-02 **before** consent and hashed in the snapshot; (b) a failed or expired payment is **not** retried on the same order: the order stays non-final until FP is terminal, and the investor gets "Try again", which is a new order with new consent. The documented "payment-retry" flow (confirm → submitted → payment, retries allowed) sits under FP **Beta programs**. It is built behind the flag `fp.lumpsumFlow=PAYMENT_AFTER_SUBMIT` and switched on only with Cybrilla's written enablement (Q26) plus a sandbox probe. The D-MONEY-003 "retry until T+1 23:59 with no new OTP" applies only in that mode. This **supersedes** the critic's recommendation and D-MONEY-035's "consent → payment → confirm" wording, which stays correct. State mapping is in §4.2. | Critic "lumpsum payment sequence" |
| H-3 | OTP quotas | **Login and VERIFY_EMAIL:** 6 digits (`crypto.randomInt`), TTL 5 min, 5 attempts per code, **flat 30 s cooldown** (the 30→60→120 s ladder is P2), 5 sends per destination per hour, 15 per day, 20 per IPv4 per hour, 10 per device per hour, persisted in PG. Lockout: 3 burned codes per identifier in 60 min → locked 30 min. **Consent:** ≤ 3 sends per challenge (1 + 2 resends) inside its 10-min life, 30 s cooldown, ≤ 10 consent sends per investor per hour. **Global:** hard cap of 2,000 SMS per day in the pilot; above it, SMS_UNAVAILABLE plus an alert. HMAC at rest: `HMAC-SHA256(pepper[kid], purpose‖dest_bidx‖otp_row_id‖code)` with `timingSafeEqual` (**pinned by R-14**, which amends the earlier "challengeId" wording: the otp row id is used for every purpose, including CONSENT rows whose `reference_id` is the consent challenge; one canonical input across Plan-01 B13, B14 and the consent engine). No bypass, master code or dev endpoint in any build; the prod boot guard refuses capture/Mailpit providers and any per-IP limit other than 20. | Critic "OTP policy" item 1; D-MONEY-003 vs D-PLATFORM-021 |
| H-4 | OTP purposes | Adopt the D-PLATFORM-021 closed enum now in A12, before B7 writes the CHECK: `LOGIN, NEW_DEVICE_STEPUP, EMAIL_FALLBACK_LOGIN, VERIFY_EMAIL, CONSENT, CONTACT_CHANGE_OLD, CONTACT_CHANGE_NEW, REAUTH`. The MVP uses LOGIN, VERIFY_EMAIL and CONSENT; the rest are reserved with no code path. | Critic item 2 |
| H-5 | OTP response shape | `POST /auth/otp` → **200** `OtpSent {challengeId: uuid, expiresInSeconds, resendAfterSeconds}`. The shape is identical for every mobile (anti-enumeration). The send is **synchronous** in the MVP (503 `SMS_UNAVAILABLE` on provider failure; the row is deleted). `POST /auth/otp/verify {challengeId, code}` (no mobile) → `SignedIn`. P2 may move sending to pg-boss **without changing the shape** (still 200). **Accepted deviation D-17 (R-07):** the non-negotiable "providers are called only from worker jobs" covers **FP/POA money and provisioning providers**; OTP delivery through MSG91/SES is synchronous in the request, never inside a DB transaction, with a **5 s provider timeout** and 503 `SMS_UNAVAILABLE` (email: 503 `PROVIDER_UNAVAILABLE`); revisited in phase 2. Applies to Plan-01 B13 (was B14), B19 (was B21), C2 and C7. | Critic item 3; final critic "synchronous OTP" |
| H-6 | OTP SMS texts (amended by R-10) | **Four DLT templates**, each three lines, byte-for-byte equal to the registered text: line 1 the text, line 2 the **SMS Retriever hash registered as a `{#var#}`** (penultimate), line 3 **`@app.sanchay.in #{code}`, always last**. (1) `SANCHAY_LOGIN_OTP_V1`: `{code} is your Sanchay login OTP. Valid 5 min. Never share it; Sanchay staff never ask for it. -Platizio`. (2) `SANCHAY_CONSENT_OTP_V1` (amount: purchase, SIP/mandate, SIP cancel): `{code} is your OTP to {ACTION} Rs {amount} in {scheme-short} on Sanchay. Valid 5 min. Never share it. -Platizio`. (3) `SANCHAY_CONSENT_UNITS_OTP_V1` (redeem by units, or redeem all with units `all`): `{code} is your OTP to redeem {units} units of {scheme-short} on Sanchay. Valid 5 min. Never share it. -Platizio`. (4) `SANCHAY_ATTEST_OTP_V1` (onboarding attest): `{code} is your OTP to confirm your Sanchay account details. Valid 5 min. Never share it. -Platizio`. The hash comes from the **Play App Signing** certificate of the internal-testing build; making it a variable decouples DLT approval from Play. **`SANCHAY_SMS_RETRIEVER_HASH` is required outside local/test** (B2 boot invariant 7), so every non-local SMS has exactly three lines. Unit tests assert, for all four templates, that the last line matches `/^@app\.sanchay\.in #\d{6}$/` with and without a hash, and that a hashed body has three lines with the hash penultimate. The CO and counsel sign off the four texts before the Mon 10-12 filing (PB-32a). The MVP relies on `autoComplete="sms-otp"`; the SMS Retriever native module is EXT. | Critic "WebOTP line order"; final critic "DLT templates" |
| H-7 | Cookie names | `__Host-sanchay_sid` (HttpOnly, Secure, SameSite=Lax, Path=/, host-only on app.sanchay.in; idle 30 min, absolute 12 h). Indicator **`__Host-sanchay_si`** (not HttpOnly, Secure, Lax, Path=/, no Domain; never trusted). `__Host-sanchay_dev` (device ref, 400 days). `__Host-sanchay_ops` is reserved (P2). CSRF: SameSite=Lax + `Origin` = `SANCHAY_APP_ORIGIN` + `Sec-Fetch-Site: same-origin` + `x-sanchay-client: web`. | Critic "identifier renames" item 1 |
| H-8 | Env names | The interface sheet is authoritative. `SANCHAY_APP_ENV` (local, test, dev, staging, prod), `SANCHAY_APP_ROLE` (api, worker, migrate), `SANCHAY_APP_ORIGIN`, `SANCHAY_WWW_ORIGIN`, `SANCHAY_API_ORIGIN`, `SANCHAY_CLIENT_IP_SOURCE` (socket, alb; replaces `SANCHAY_TRUST_EDGE_HEADERS`), `SANCHAY_KEY_SERVICE` (local, secrets; kms is P2), `SANCHAY_PROVIDER_MODE_{SMS,EMAIL,FP}` (capture/mailpit/msg91; capture/mailpit/ses; fake/sandbox/production), `SANCHAY_FP_WEBHOOK_AUTH` (hmac, shared_secret), `SANCHAY_PLATFORM_ARN`, `SANCHAY_PLATFORM_ARN_VALID_TILL`, `SANCHAY_SMS_RETRIEVER_HASH`, `SANCHAY_OTP_PER_IP_PER_HOUR`, `SANCHAY_PILOT_INVITE_ONLY`, `SANCHAY_MAILPIT_URL`. Expo: `EXPO_PUBLIC_SANCHAY_API_BASE_URL`, `EXPO_PUBLIC_SANCHAY_APP_ORIGIN`, `EXPO_PUBLIC_SANCHAY_WWW_ORIGIN`. **Unprefixed exceptions:** DATABASE_URL, PORT, HOST, NODE_ENV, APP_VARIANT; `MAILPIT_URL` only in e2e tooling. Amend D-PLATFORM-003 to match. **H-8 addendum (R-19), every new variable with its owning container:** `SANCHAY_KEYRING_JSON` (api, worker), `SANCHAY_FP_BASE_URL` (worker), `SANCHAY_FP_CREDENTIALS_JSON` (worker only), `SANCHAY_FP_WEBHOOK_SECRET` (api), `SANCHAY_MSG91_CREDENTIALS_JSON` (api for OTP send, worker for the delivery-report job), `SANCHAY_SES_FROM` (api, worker), `SANCHAY_LOG_LEVEL` (api, worker, migrate, ops), `SANCHAY_DB_POOL_MAX` (api, worker), `SANCHAY_THROTTLE_PER_MINUTE` (api), `SANCHAY_SMS_RETRIEVER_HASH` (api; required outside local/test). Plan-01 B2 declares the keyring, log level, pool, throttle and hash; the Plan-02 kernel declares the FP, MSG91 and SES variables. | Critic "identifier renames" items 2–5; final critic "env names" |
| H-9 | Cooling-offs | Contact change and bank change are **not self-serve in the MVP** (DEF P2). The values bound for P2 are those of D-MONEY-055: COB 10 calendar days for exits; contact change 24 h for exits; a 10-day spacing between a bank change and a contact change; a new bank is usable 24 h after verification; error `COOLING_OFF_ACTIVE{until}`. The D-PLATFORM-028(b)–(d) 72 h values are superseded. **MVP:** any ops-assisted change (runbook, two-founder approval) sets `exit_block_reason='COOLING_OFF'` with the same durations. | Critic "security cooling-offs" |
| H-10 | Error-code catalogue source | `packages/contract/src/errors.ts` `ERROR_CATALOGUE` is the only source; append-only; each addition regenerates `openapi.json`. `messageForError` must have copy for every code the MVP emits (test). **MVP additions:** `SUITABILITY_CHANGED` (409), `RISK_PROFILE_EXPIRED` (409), `RISK_PROFILE_STALE` (409), `PILOT_INVITE_REQUIRED` (403), for 66 codes. Pilot caps use `AMOUNT_ABOVE_MAX` with field code `PILOT_CAP`. `TAX_CLASS_MISSING` is a report caveat, not a code. `COOL_OFF` → `COOLING_OFF_ACTIVE`; `APP_UPDATE_REQUIRED` → `APP_VERSION_UNSUPPORTED`. | Critic "error-code drift" |
| H-11 | `partner` and `euin` on orders | **Omit `partner` and omit `euin`** on every FP purchase, redemption and plan (research:fp-api: the ARN is attached at tenant level through the ONDC signup, and "do not create partners"). The adapter flag `fp.sendPartner=false` flips only on Cybrilla's written Q12 answer. `orders.arn` / `plans.arn` = `SANCHAY_PLATFORM_ARN` (snapshot), `euin NULL`, `execution_only=true`, `initiated_by:"investor"`, `initiated_via: web \| mobile_web \| mobile_app_android`. Real money is gated on P-04 (no auto-filled EUIN in the ONDC message) and P-05 (ARN visible on the RTA/ONDC view), both re-checked in the prod canary. D-MONEY-090 becomes conditional. | Critic "`partner` field" |
| H-12 | Nominee ID types | `NOMINEE_ID_TYPES = ['PAN','DRIVING_LICENCE','PASSPORT']`; **AADHAAR_LAST4 is removed**. The ID is optional (nullable) and PAN is only for adults. Aadhaar is never stored, not even the last 4. Minor → DOB and guardian name required (FP `guardian_name` ≤ 35). `MAX_NOMINEES=3` (PO-7). Integer equal split with the remainder to nominee 1 (34/33/33). Closes ESC-5; D-PLATFORM-061 now reads "Aadhaar never stored". | Critic "Aadhaar last-4" |
| H-13 | Android device with no screen lock | Interim rule for the MVP (deviation D-18): `coldStartDecision` → **SIGN_OUT** (OTP login on every cold start) when no device auth is enrolled. The 24 h capped session plus nudge (D-PLATFORM-026/030) is P2. App lock: `authenticateAsync({biometricsSecurityLevel:'strong', disableDeviceFallback:false})` on cold start and after 5 min in the background; no PIN. | Critic "no-screen-lock" (closes ESC-2) |
| H-14 | Navigation tabs | **MVP: 4 tabs — Home · Explore · Portfolio · Account.** Portfolio has segments Holdings · Orders · SIPs. Web: the same 4 items in the sidebar (≥ 1024 px) or bottom nav (< 768 px). The 5th tab (SIPs) arrives with SIP management in P2 (GAP-06 target). | Critic "5 tabs vs single Home" |
| H-15 | SIP frequency pin | In A12: `PLAN_FREQUENCIES = ['MONTHLY','QUARTERLY','DAILY_BUSINESS','DAILY_CALENDAR']` (reserved) and `LAUNCH_PLAN_FREQUENCIES = defineEnum(['MONTHLY'])`. The contract uses `z.enum(LAUNCH_PLAN_FREQUENCIES)` imported from `@sanchay/domain`. DB `plans.frequency CHECK (frequency IN ('MONTHLY'))` (widened by an additive migration later). Tests: QUARTERLY is a rejection vector; the FP payload sends `"monthly"`. Enums and `canTransition` live in `@sanchay/domain`; contract builds `z.enum` from them. | Critic "monthly-only pin"; "package naming" |
| H-16 | pnpm supply chain | A1 writes: `minimumReleaseAge: 10080`; `minimumReleaseAgeExclude` for every catalog pin younger than 7 days (each recorded in ADR-0001 with an expiry); `blockExoticSubdeps: true`; `trustPolicy: no-downgrade`; `strictDepBuilds: true` with the explicit 12-entry `allowBuilds`; `engineStrict: true`; `nodeLinker: hoisted`. Key names are verified against the pnpm 11.27 docs in A1 step 1, and any rename goes to ADR-0001. CI uses `--frozen-lockfile`; GitHub Actions are pinned to commit SHAs with `permissions: {}` by default. **MVP CI gates:** biome, typecheck, unit, integration (Testcontainers), `gen:states` diff, `db:check`, OpenAPI drift, `check-brand`, gitleaks, `pnpm audit --prod` (High/Critical fail), Playwright smoke. **P2:** Semgrep, zizmor/actionlint, OSV, CodeQL, Maestro in CI, budgets. | Critic "pnpm supply-chain"; "S0 CI gates" |
| H-17 | Brand-lint allowlist (replaced by R-19) | `scripts/check-brand.ts` fails on `plz`, `PLZ_`, `@plz/`, `platizio.in`, `platizio://`, or "Platizio" **except in exactly:** `scripts/check-brand*.ts`; `apps/api/src/integrations/sms/templates*.ts`; the single shared `packages/domain/src/legal-entity.ts` (exports `LEGAL_ENTITY_NAME` and `dsc02(arn, validTill)`, used by the web, email and SMS code); `docs/**`; and lines containing `platizio.com`, `/v2/auth/platizio/` or the quoted tenant id `'platizio'`. The retired identifiers are checked before the line allowlist. Legal-document texts live under `docs/legal/**`. `REGULAR_PLAN_NOTICE` and the www footer import the name through `@sanchay/app-core/copy`. The DSC-02 text is a counsel placeholder until approved. | Critic "brand lint allowlist"; final critic "brand-lint rules" |
| H-18 | ADR numbering (single index) | 0001 versions/lockfile · 0002 universal UI (RN StyleSheet + tokens in MVP; Uniwind decision deferred) · 0003 oRPC/Nest/Fastify gate · 0004 bundle budgets (reserved, P2) · 0005 hosts/edge (H-1) · 0006 session model · 0007 admin OIDC (reserved, P2) · 0008 telemetry residency (reserved, P2) · 0009 no Redis · 0010 Biome/GritQL · 0011 CAS Lambda (reserved) · 0012 retention · **0013 MVP scope and deferrals (this spec)** · **0014 minimal AWS topology (single ECS service, ALB-only)** · **0015 lumpsum FP flow (H-2)**. | Critic "ADR numbering" |
| H-19 | Calendar | This spec's S1–S4 plus buffer week is the only binding calendar until the MVP go/no-go. The register "Sprint/Needed by" columns are re-keyed to MVP or P2 (§5, §8). Questionnaire milestones become "indicative; real-money pilot targeted 27 Nov 2026 subject to credentials". | Critic "calendar basis" |
| H-20 | Plan-01 amendments (apply before the tasks run) | Task ids are the **new Plan-01 ids** (delta sheet §2, R-04); old ids appear only as "(was …)". Apply the DAG fixes of delta §3 (B5←A9/A11/B1, B7←B6/A11, B16←B7/B3/B8, B18←B11/B13/B15/B16/B17, C1←A2/A3). Full A2 `biome.json` with overrides. turbo `test:int` passThroughEnv. A11 (was A12) enums per H-4/H-12/H-15. B3 adds KeyService `secrets`. B2 invariant 1 extended to `staging\|prod`, invariant 7 per R-10. B12 (was B13) per H-6/R-10. B13 (was B14), B19 (was B21) and C7 per H-5/R-07/R-14. B18 (was B20) and C10 per H-1/H-7/R-11. C13/C14 env per H-8. A12 (was A13) adds `check-brand` per R-19. **Dropped from MVP:** old B18 (step-up token), the new-device and email-fallback branches of old B21, list/revoke-one of old B22 (logout and revoke-all kept in new B19). Local Mailpit remains the only OTP channel in dev. | Critic "interface sheet recheck"; "roadmap Plan 01 allocation"; final critic "task-id collisions" |
| H-21 | Consent factors (MVP) | Eligible destinations come from the lean resolver: new folio = CURRENT verified contacts; existing folio = `folios.registered_*` ∩ verified contacts, which are identical in the MVP by construction because there are no contact changes. Empty set → 409 `CONSENT_DESTINATION_UNAVAILABLE` plus an alert. **Factors:** purchase < ₹1,00,000 and SIP registration (including the mandate): **SMS code** (the email code is offered only if SMS is unavailable). Redemption, purchase ≥ ₹1,00,000 and onboarding attest: **SMS + email codes, both required**. Native uses the same set (device key is P2, per the D-PLATFORM-029 fallback). The FP `consent{}` carries only channels actually verified, with folio-registered values. | D-MONEY-006 lean; device-key deferral |

---

## 4. Consent-first money flows (MVP)

### 4.1 Universal rules and timers

- **No FP class P or M write before a CONSUMED challenge on an identical snapshot.** Enforced by: the `ConsumedConsent` branded type; adapter `assertConsumed`; DB CHECKs plus `trg_consent_guard` (orders ONE_TIME, plans, mandates); hourly invariant M1. M6 (tenant-wide) is P2.
- **Approve transaction (D-MONEY-004):**
  1. lock the challenge;
  2. verify the codes (attempt counter committed separately);
  3. re-run suitability → 409 `SUITABILITY_CHANGED`;
  4. recompute the JCS snapshot **from the DB** and compare with `timingSafeEqual` → on mismatch, SUPERSEDED + audit + commit, return `CONSENT_MISMATCH`;
  5. re-render the NAV-date line;
  6. insert the consent_record, copying the CONSENT otp rows' delivery evidence (template id, provider message id, DLR status, timestamps, masked destination) into `delivery_evidence`; the delivery-report job updates it later (R-13);
  7. status → **CONSUMED**, set `execute_before` and `saga_expires_at`, subjects → CONSENTED, enqueue `*.submit`.
- **Snapshot schema `sanchay.consent.v2`** (MVP fields): type, subjectId, coveredSubjects, investorId; `scheme{isin, name, amc, category, planType:"REGULAR", option:"GROWTH", riskometer}`; mode and amount/units/"ALL"; folio or "NEW"; `bank{ifsc, last4, role}` (the PAYOUT bank comes from `folios.payout_bank_masked`); `payment{method}` (lumpsum); `cutoff{class, ruleVersion}`; stamp-duty basis; exit-load text; `elss{lockInNote, lockedUnits}`; plan terms; `mandate{rail, limit, bankLast4}`; `distribution{arn, euin:null, executionOnly:true, declarationSha256}`; regularPlanDisclosureVersion; `commission{kind, minBps, maxBps}`; `suitability{riskProfileId, level, questionnaireSha256, schemeRiskometer, outcome, ackSha256|null}`; `nominee{initialsAndRelationships|"OPTED_OUT"}` for a NEW folio; `destinations[]`; requiredFactors; `template{key, version, sha256}`; moneyParamsVersion. No volatile timestamps; decimals are fixed-scale strings. Property test: `hash(insert) === hash(reload)` on PG 18.

| Timer | Value |
|---|---|
| OTP code | 5 min, and never past challenge expiry |
| Challenge (create → approve) | 10 min |
| `execute_before` (approve → first FP write) | 10 min. If missed: challenge CONSUMED_UNUSED, subject CONSENT_EXPIRED, zero FP writes. |
| `saga_expires_at` | 60 min; **7 days** for a SIP with a new mandate |
| Retry ladder (per write) | 30 s, 1 m, 2 m, 5 m, 10 m, 15 m, capped at the saga window. Each retry first runs the **LOOKUP-ADOPT** tactic (list by `source_ref_id` and adopt an existing object; renamed from "T6" by R-04 so it can never be confused with trim T6). LOOKUP-ADOPT is a non-negotiable and is never trimmed. |
| Drafts with no live challenge | CANCELLED after 24 h (`drafts.abandon`) |
| Sweeper | `consent.expiry.sweep` every 5 min |

**Ambiguous outcome → RECONCILING:** timeout, 5xx after retries, 409 or duplicate `source_ref_id`. Exits from RECONCILING:
- a re-fetched FP object → the mapped state (via `canTransition`);
- FP listing proves the object absent **twice, 10 min apart** → FAILED (`PROVIDER_OBJECT_ABSENT`), challenge CONSUMED_UNUSED, reservation RELEASED.

Nothing is released while RECONCILING. Alerts: > 2 h WARN (email to both developers); > 24 h CRITICAL (SMS).

**Webhooks:**
- raw-body verify: `FP-Signature: id:b64(HMAC-SHA256)` over the raw body, falling back to re-serialised JSON; shared-secret mode per `SANCHAY_FP_WEBHOOK_AUTH`; constant-time compare; fail closed;
- store metadata only on an invalid signature (401);
- valid → `INSERT … ON CONFLICT (provider, event_id) DO NOTHING` plus enqueue `fp.event.process` in the same transaction; respond 200 in under 100 ms;
- the job **re-fetches** the object and applies it only if `canTransition` holds; `event.time` is never used for ordering;
- unknown object → retry 3 times over 10 min → a recon_break;
- polling (`fp.reconcile.nonfinal`, every 5 min) is the backstop for every non-final aggregate.

### 4.2 Lumpsum purchase (custom checkout, H-2)

| Local ORDER state | Entered when | FP call / state | Timer, alert or investor copy |
|---|---|---|---|
| CONSENT_PENDING | `orders.createPurchase` (quote re-run: `can_purchase`, pilot cap, scheme orderable, thresholds, suitability, NAV grade, TPV bank VERIFIED with `fp_bank_old_id`, IPv4) | none | challenge 10 min |
| CONSENTED | approve (challenge CONSUMED) | none | `execute_before` 10 min |
| SUBMITTING | job tx1 (`submit_attempts+1`) | `POST /v2/mf_purchases {mf_investment_account, scheme, amount, folio_number?, user_ip, source_ref_id: orders.id, gateway:"ondc", initiated_by:"investor", initiated_via}` | ladder; ambiguous → RECONCILING |
| UNDER_REVIEW | FP `under_review` | poll GET every 2 s for 30 s inside the job, then event or poll | CNF-02 "With the fund house for review"; SLA > 30 min WARN. **If `saga_expires_at` passes while still UNDER_REVIEW → CONSENT_EXPIRED★ (R-17):** no further FP writes (the consent PATCH is forbidden), the FP order is left to expire, challenge CONSUMED_UNUSED, and "Try again" means a new order with new consent (test in Plan 03 E20). |
| CONFIRMING | FP `pending` | `PATCH {id, consent}` → `POST /api/pg/payments/netbanking {…}` (attempt CREATING, `fp_payment_id`) → `PATCH {id, state:"confirmed"}` (each under `useConsumed`) | FP review fail → REJECTED, CONSUMED_UNUSED, "Try again" (new consent) |
| AWAITING_PAYMENT | FP `submitted` and the attempt has `token_url` or `upi.uri` (attempt REDIRECTED) | `GET /api/pg/payments/:id` or `payment.updated` | PAY-01 with the TPV line ("Pay only from A/c ••1234 (HDFC)…", "shows as Cybrilla"); web: same-tab redirect, UPI intent on mobile web, QR on desktop; Android: auth session / `Linking.openURL(upiUri)` |
| PAYMENT_PENDING | postback received or investor returned (attempt PENDING) | server re-fetch only | UPI 30 min / netbanking 20 min |
| PROCESSING | attempt SUCCESS (re-fetched: SUCCESS, INITIATED or APPROVED) | FP order `submitted` | "Sent to AMC"; > T+2 business days WARN |
| SETTLED★ | FP `successful` with `allotted_units` | none | one tx: lot (allotment_date = `allotted_nav_date`), folio upsert, `stamp_duty = amount − purchased_amount`, allotment email |
| UNITS_PENDING | FP `successful`, units null | none | `orders.units.reconcile` every 2 h; > T+3 WARN, > T+5 CRITICAL |
| FAILED★ / EXPIRED★ | FP `failed` or `expired` (re-fetched) | none | if the attempt was SUCCESS or `late_auth` → `refund_status=REFUND_PENDING`, "Refund of ₹X in progress" (no ETA) |
| (attempt FAILED / EXPIRED while the FP order is non-final) | payment failure | none | order stays AWAITING_PAYMENT, shown as "Payment not completed" with "Try again" = new order + new OTP; a late success is still honoured via re-fetch |
| REVERSED★ | FP `reversed` | none | lot reversed if untouched; otherwise CRITICAL break |
| CANCELLED★ | local cancel in CONSENT_PENDING, or CONSENTED before any attempt | none | "Nothing was sent" |
| CONSENT_EXPIRED★ | `execute_before` missed, or saga expired while UNDER_REVIEW (R-17) | none | zero further FP writes |
| RECONCILING | ambiguous | LOOKUP-ADOPT (list by `source_ref_id` and adopt) | §4.1 |

Cut-off engine: display times are 2:30 PM (standard purchase) and 1:00 PM (liquid/overnight); the regulatory 15:00 / 13:30 rules come from `cutoff_class`. The date is rendered at draft and re-rendered at approve; it is informative, never blocking. Stamp-duty estimate = `round_half_up(amount × 0.00005, 2)`.

### 4.3 SIP with mandate (D-MONEY-041)

| PLAN | Trigger | FP chain |
|---|---|---|
| CONSENT_PENDING | `plans.createSip`: plan row plus a mandate row (new, CONSENT_PENDING) or a reused APPROVED mandate with headroom (Σ ACTIVE SIPs on it + new ≤ limit); one SIP_REGISTRATION challenge covering plan and mandate | none |
| CONSENTED | approve (CONSUMED) | none |
| MANDATE_SETUP | new mandate | `POST /api/pg/mandates {mandate_type:"UPI"\|"E_MANDATE", bank_account_id: fp_bank_old_id, mandate_limit, provider_name:"CYBRILLAPOA"}` (MANDATE → CREATED) → `POST /api/pg/payments/emandate/auth {mandate_id, payment_postback_url, upi?:{type:"uri"}}` (→ AUTH_PENDING; eNACH `token_url`, UPI `upi://mandate…`) → investor authorises (return via H-1) → `mandates.poll` every 10 min (`SUBMITTED` → BANK_PENDING → APPROVED) |
| SUBMITTING | mandate APPROVED (or reused) | `POST /v2/mf_purchase_plans {mf_investment_account, scheme, frequency:"monthly", installment_day, number_of_installments, amount, systematic:true, payment_method:"mandate", payment_source:"<fp_mandate_id>", source_ref_id: plans.id, user_ip, initiated_by, initiated_via, folio_number?}` (no `generate_first_installment_now` in the MVP) |
| UNDER_REVIEW → CONFIRMING | FP `created` → `review_completed` | `PATCH {id, consent, state:"confirmed"}` |
| ACTIVE | FP `submitted`/`active` | first instalment = first allowed day ≥ registration + 2 days, recomputed at registration and the investor told if it moved |
| FAILED★ | mandate REJECTED/EXPIRED, or 7-day saga with no plan write | mandate shown "Couldn't start"; challenge CONSUMED_UNUSED if no plan was written |
| MANDATE_REVOKED | FP mandate `cancelled` that we did not initiate | email: "set up a new mandate"; the recovery flow is P2 |
| CANCEL_PENDING → CANCELLED★ (R-08) | investor `plans.cancel` on an ACTIVE plan: SIP_CANCELLATION challenge (SMS code, template `SANCHAY_CONSENT_OTP_V1`, action "cancel SIP of"); approve (CONSUMED) → job `plans.cancel.submit` | FP purchase-plan cancel (class M) under `useConsumed`; ambiguous → RECONCILING; FP cancelled → CANCELLED (`cancelled_by='INVESTOR'`). The mandate stays APPROVED for reuse. Ops never makes this FP write. SEBI: effective within 2 working days. |
| RECONCILING / REJECTED★ / CONSENT_EXPIRED★ / CANCELLED★ / COMPLETED★ | per §4.1 and FP | none |

- **MANDATE states:** CONSENT_PENDING, CONSENTED, SUBMITTING, CREATED, AUTH_PENDING, BANK_PENDING, APPROVED, RECONCILING, REJECTED★, CANCELLED★, EXPIRED★ (7 days without approval), CONSENT_EXPIRED★. CANCEL_SUBMITTING is reserved (P2).
- **Instalments:** `plans.instalments.sync` (08:30, 20:30) upserts `orders(origin=SIP_INSTALMENT)` from `GET /v2/mf_purchases?plan=` at PROCESSING → SETTLED / UNITS_PENDING / FAILED / SKIPPED. No new consent per instalment (SEBI-2FA-S).
- **Warning:** after 2 consecutive misses, email "one more missed instalment cancels this SIP" (FP auto-cancels at 3).

### 4.4 Redemption

| ORDER | Trigger | FP |
|---|---|---|
| quote (no writes; api role, never calls FP) | ONDC platform folio; **FP holdings snapshot** `folios.fp_holdings_snapshot` fresher than 24 h (otherwise enqueue `folio.sync` and return REFRESHING) (R-09); snapshot check `redeemable_units ≥` ledger unlocked units (otherwise MISMATCH, ALL refused, AMOUNT capped at min(ledger, FP), recon break); `available = Σ unlocked units_remaining − Σ ACTIVE reservations`; ELSS strict (`expectedNavDate(exit) > lock_in_until`); buffer `min(10%, max(2%, 3σ√n))`; max = `floor2(available × NAV × (1 − buffer))`; NAV grade OK for AMOUNT | none in the request. The worker's `folio.sync` writes the snapshot from `GET /api/oms/reports/holdings?investment_account_id=&folios=` |
| CONSENT_PENDING | draft tx: `pg_advisory_xact_lock(folio‖scheme)`, recompute, reservation ACTIVE (`ceil3(amount / NAV × (1 + buffer))`, or the units, or all unlocked), REDEMPTION challenge (SMS + email) | none |
| CONSENTED → SUBMITTING | approve re-checks under FOR UPDATE; job `orders.redemption.submit` **re-runs the MISMATCH, ALL-refusal and AMOUNT-cap checks live** against `GET /api/oms/reports/holdings` (R-09). A live-check failure → REJECTED★ before any M write, challenge CONSUMED_UNUSED, reservation RELEASED. | then `POST /v2/mf_redemptions {mf_investment_account, scheme, folio_number, amount \| units (only if `features.redeemByUnits`) \| neither (ALL: only with no locked lots, no other reservation, folio MATCHED within 24 h), user_ip, source_ref_id, gateway:"ondc"}` |
| UNDER_REVIEW → CONFIRMING | `under_review` → `pending` | `PATCH {id, state:"confirmed", consent}` (single PATCH allowed for redemptions) |
| PROCESSING | `submitted` | none |
| SETTLED★ | `successful` → `Ledger.applyExit(redeemed_units)` FIFO over unlocked lots; reservation SETTLED; `payout_status=EXPECTED`, `payout_expected_on` = T+1 (liquid/debt) or T+2 (equity/hybrid/ELSS), with regulatory maximum T+3 | a ledger shortfall is **never rolled back**: consume what exists, `ledger_exceptions(UNITS_SHORTFALL)`, folio MISMATCH, CRITICAL break |
| FAILED★ / EXPIRED★ / REJECTED★ | only on re-fetched FP terminal; reservation RELEASED with evidence | none |
| payout | `payout.watch` (10:00): past the regulatory maximum → DELAYED plus investor copy (15% p.a. interest owed by the AMC; AMC and SCORES links) plus an ops alert. CREDITED only on evidence (FP payout reference, or ops-recorded bank credit reference via CLI with two-founder approval). | none |

"Redeem all" with locked ELSS lots and UNITS unproven: send the `floor2` amount with the residual note, then offer "Redeem remaining" once the unlocked residual is > 0.001 units. Golden vectors cover NAV −3%, 0 and +3%.

### 4.5 Onboarding attest

- ONBOARDING_ATTEST challenge (SMS + email).
- Snapshot covers: masked profile, FATCA India-only, bank (IFSC, last4), nominee set or OPTED_OUT with Annexure-B sha, `riskProfileId`, level and questionnaire sha, and the document versions (TNC, PRIVACY_NOTICE, RISK_DISCLOSURE, REGULAR_PLAN_COMMISSION, EXECUTION_ONLY_DECLARATION, FATCA_CRS_DECLARATION, KYC_CONSENT, NOMINATION_OPT_OUT_ANNEX_B when used).
- CONSUMED → one consent_record per document version plus the nomination record → `onboarding.provision` (the §1.1 chain, every write under `useConsumed`; saga 60 min; after the window only reads and adoption run, never new writes without fresh consent) → readiness trigger sets `can_purchase` / `can_exit` → ONB-20.
- **Re-attest path (R-17):** a PROVISIONING_FAILED or window-expired investor gets a new ONBOARDING_ATTEST challenge whose snapshot **includes adoption of the FP ids already created** (profile, phone, email, address, related parties, bank, investment account). Its consumption resumes provisioning from `provisioning_step` with list-and-match before every write. Plan 03 E11 builds it, with a stage-table row and the `provisioning-failed.md` runbook.

### 4.6 What ops does by hand in the MVP (runbooks in `docs/runbooks/`)

| Situation | Manual action | Allowed tool |
|---|---|---|
| RECONCILING > 2 h, UNITS_PENDING > T+3, PROCESSING > T+2 | Look up in the FP dashboard, then `pnpm ops:sync --order <id>`, which enqueues the same re-fetch/apply job. Chase Cybrilla. | ops CLI (read and re-fetch only; never a provider write or a status write) |
| Refund pending or overdue | Track in FP; tell the investor; record the UTR with two founders | CLI `ops:refund-utr` (writes audit_events with both actors) |
| Payout delayed | Contact the AMC/RTA; give the investor the escalation copy | email |
| NAV quarantined | Verify against the AMC site; release with two founders | CLI `ops:nav-release` |
| Fund facts refresh (monthly) and curated-list changes | Edit the CSVs, then `ops:facts:import` and `ops:catalogue:seed` | CLI plus PR review |
| KYC not "verified", PEP, foreign tax residency | Send the "not supported in pilot" email and record the case | SQL view `v_onboarding_blocked` |
| Integrity invariant M1/M3/M4 page | Freeze: set `app_config.orders.enabled=false` (kill switch, single actor); investigate | CLI `ops:kill-switch` |
| Contact, bank or nominee change; account closure; DPDP request | Email request → two-founder approval → runbook (re-verify, manual hold per H-9) | runbook |

---

## 5. Deferred list (target phase and risk of deferring for real money)

| Deferred item | Target | Risk while deferred | MVP mitigation |
|---|---|---|---|
| KMS envelope field encryption | P2-2 | Keyring sits in Secrets Manager; a compromised task role could read the keys | App-level AES-GCM **kept** (`secrets` KeyService); secrets per container; CloudTrail review; pilot data volume small; rotate on incident |
| Admin app, maker-checker, admin OIDC, investor 360 | P2-1 | Slow incident handling; human error in SQL | Read-only SQL (`sanchay_readonly`) over SSM; CLIs that never write statuses; two-founder approval on every money-adjacent CLI; audit_events |
| Full recon (M6 tenant recon, RTA mailback feed, `payments.recon`, ledger adjustments) | P2-7 | Orphan or foreign FP objects and holdings drift go unnoticed | Polling plus daily `recon.fp.daily` (orders, plans, holdings per investor), hourly M1/M3/M4, canary reconciliation, small pilot |
| Device-key second factor; new-device email step-up | P2-3 | SIM-swap takeover of exits | Exits and ≥ ₹1 L purchases need SMS **and** email codes; "new sign-in" security email; invite-only pilot; pilot caps |
| Session list / revoke-one; 24 h no-lock session; account recovery flow | P2-3 | Weaker self-service security | Sign out everywhere; no-lock devices sign out on every cold start (H-13) |
| Contact, bank and nominee changes; folio service requests; cooling-off engine | P2-3 | Investor cannot self-serve | Runbook with manual holds (H-9) |
| New KYC (DigiLocker, eSign) and KYC modify | P2-4 (EXT E5) | Smaller eligible pilot population | Existing KRA-verified invitees only |
| SIP management (PO-6 amount change, pause), Start today | P2-5 | Investors cannot change or pause a SIP in-app | **Cancel is in the MVP** (R-08: investor-initiated `plans.cancel`, consent-first, §1.3/§4.3); amount change or pause through support means "cancel and start a new SIP"; ops never makes FP writes |
| Switch, STP, SWP | P2-6 | None for the pilot | Not offered |
| Tax, statements, ELSS summary | P2-8 | None for the pilot | RTA/CAS statements |
| CAS import | P2-9 | None | none |
| iOS, EAS/Play production, UPI intent allowlist module, SSL pinning, app integrity | P2-10 | Rogue UPI app via the chooser | Android pilot on the hosted `token_url` / URI (GAP-06 beta path); invitees only |
| CloudFront, WAF, Sentry, bundle budgets, full CI matrix (Semgrep, zizmor, OSV, Maestro CI) | P2-2 | DDoS / OTP-cost abuse; blind to client errors | App throttle; persisted OTP quotas; daily SMS cap; invite gate; CloudWatch alarms; Playwright smoke in CI |
| External pen test | P2-13 | Undiscovered vulnerabilities | Internal ASVS-basics checklist, BOLA and OTP-abuse suites, one ZAP baseline in the buffer week, pilot caps |
| www SEO pages, watchlist, analytics, push, notification inbox | P2-11 | none | none |
| DPDP privacy centre, retention jobs, audit export Object Lock | P2-12 | Manual DSR handling | Email DSR runbook; retention values recorded (R-REG 8 years) |

---

## 6. Pre-agreed trim order and extension order

**Trims (authority per R-02).** T1–T6 are **pre-acknowledged by the owner** through the approval of the master plan on 2026-09-25, and are applied in this order at the **Fri 10-09** checkpoint if the S1 factor is short (or at any later slip). **T7 and T8 need an explicit owner decision on Fri 10-23.** Numbering here is authoritative; §1 status cells use it. The design tactics once called "T6 lookup" and "T7 break" are LOOKUP-ADOPT and SHORTFALL-BREAK (R-04) and are never trimmed.

| # | Trim | Days saved | User impact | Authority |
|---|---|---|---|---|
| T1 | www reduced to one static page plus legal/commission/grievance (no styled landing) | 0.25 | cosmetic | owner, pre-acknowledged |
| T2 | Explore filters reduced to category and search (drop riskometer, AMC and min-SIP filters and user sorts) | 0.75 | slower discovery across 40–60 funds | owner, pre-acknowledged |
| T3 | Allocation shown as a list instead of a bar chart | 0.25 | cosmetic | owner, pre-acknowledged (funds R-08 `plans.cancel`) |
| T4 | NAV chart replaced by a returns table (1Y/3Y/5Y, since inception) | 1.0 | less visual fund page | owner, pre-acknowledged |
| T5 | Redeem by units dropped (amount and all only) | 0.5 | also forced if P-09 fails (PO-2 escalation noted) | owner, pre-acknowledged (funds R-08 `plans.cancel`) |
| T6 | eNACH dropped (UPI Autopay only; SIP ≤ ₹1 L; one mandate per bank) | 1.25 | investors whose bank lacks UPI Autopay cannot start a SIP | owner, pre-acknowledged |
| T7 | Android native app deferred; the pilot runs on web (desktop and Android Chrome) | ≈ 2.0–2.5 after 10-23 (C13/C14 are already built) | no app for invitees; Android glue and Play work move to P2 | **owner decision, Fri 10-23** |
| T8 | SIP and mandates deferred entirely (lumpsum only) | ≈ 5.5 | a group 4 core feature lost | **owner decision, Fri 10-23** |

E18 [T2] and E19 [T4] are also the funding for the protected E25 stack in S2 (R-05; the paused prod stack under R-31), so they leave the committed S3 load whether or not the checkpoint trims them.

**Extensions**, if the 10-23 or 11-06 checkpoint shows surplus:

| # | Extension | Ideal days |
|---|---|---|
| E1 | SIP "Start today" (`generate_first_installment_now` + NACH), only if probe P-09b passes | 1.0 |
| E2 | Bank name-match 60–79 manual path (proof upload plus two-founder CLI approval) | 0.75 |
| E3 | Sessions list and revoke-one (the old-B22 remainder; not in new B19) | 0.5 |
| E4 | New-device email step-up (old B18 step-up token + the old-B21 branch; both dropped from Plan 01) | 1.0 |
| E5 | **New KYC via POA `kyc_forms` + DigiLocker + eSign + signature + coarse geotag (the default deferral)** | 5.0 |
| E6 | www SEO fund pages | 3.0 |
| E7 | Maestro Android smoke in CI plus the SMS Retriever native module | 1.25 |

**Committed allocation** (new Plan-01 ids per R-04; old ids in "(was …)"; the delta sheet §7 and the Plans 02–04 outlines are the bottom-up source)

| Sprint | Dev A (backend-leaning) | Dev B (client-leaning) | Ideal days |
|---|---|---|---|
| S1 | Plan-01 B1–B4, B6 (unchanged ids), B7 (was B7+B8), B8–B12 (was B9–B13); all 1.5 probe days (P-04, P-05, P-07, P-09, lumpsum-flow check; P-07 and P-09 may finish by 10-16 inside that budget) | Plan-01 A1–A8, A9 (was A9+A10), A10 (was A11), A11 (was A12), A12 (was A13); B5; B17 (was B19); C1, C2, C4, C5 | 15.8 |
| S2 | Plan-01 tail B13–B16 (was B14–B17), B18 (was B20), B19 (was B21+B22), B20–B23 (was B23–B26) → **login E2E Wed 10-21**; Plan 02 D1–D3 (idempotency, worker, FP gateway); **E25 CDK prod, deployed paused (week 2, ≈ 12 h, protected by R-05; R-31)** | Plan-01 tail C3, C6–C15; Plan 02 D5 states, D6 MSG91/SES, D7 invite gate, D8–D10 catalogue data | 21.5 |
| S3 | Plan 02 D4 FakeFp + smoke harness (week 1, displaced by E25); consent engine; webhooks; identity/KRA; bank; attest + provisioning + re-attest (R-17); lumpsum saga; payments | HostGuard/app config; onboarding backend (nomination, risk, declarations); onboarding screens 1 and 2 with the `legal.pending` banner (R-18); catalogue (facts, returns, Explore, Fund page); lumpsum UI + PAY-01 + returns + SYS-01 (R-18). E18 [T2] and E19 [T4] leave the committed load (R-05). | 24.1 |
| S4 (8 days) | F1 prod-stack hardening (R-31, R-34); SIP + mandate backend; ledger; redemption; recon lean; **`plans.cancel` ≈ 1.0 (R-08, funded by T3 + T5)**; security suites 0.5 | SIP UI; dashboard; holdings; **AccountScreen v2 (R-18)**; redemption UI; Android internal build + App Links 1.0; catalogue polish 0.5 | 19.0 |
| Buffer | Canary support, gate evidence, ZAP baseline, runbooks, security suites 0.5 | Canary on Android and web, fixes | not planned |

Totals (bottom-up, R-01): Plan-01 lean **24.9** (not 19.0) · probes 1.5 · kernel 8.5 · invite 0.5 · infra 2.5 · consent 4.5 · onboarding 13.0 · catalogue 7.5 · lumpsum 6.0 · SIP 5.5 · portfolio 5.0 · redemption 4.0 · recon 1.5 · Android build 1.0 · security 1.0 (0.5 in S4, 0.5 in the buffer). With the old 19.0 these components summed to 81.0 (80.5 in S1–S4 plus the 0.5 buffer-week security day); with the honest 24.9 the S1–S4 demand is **86.4 ideal days against 80.4** of capacity. Added by the rulings: `plans.cancel` +1.0 (funded by T3 + T5) and the R-18 screens +0.75. Break-even measured factor ≈ 1.75 (≈ 1.67 with T1–T6). A factor below that triggers the §0 decision points; S3 and S4 overflow is carried in the order the outlines give.

---

## 7. Real-money pilot gate (tiered, R-06; owner: PO; every MUST item of a tier must be green)

- **GO-1 (Fri 2026-11-27): onboarding, lumpsum and redemption.** Every G-item below is in GO-1 except G-E7(b).
- **GO-2: SIP**, called separately once its canary evidence exists: mandate APPROVED + plan ACTIVE + FP first-instalment date recorded. The debit and the allotment are evidenced when they land (the first instalment cannot land before day 25/26; 11-24 is a holiday). SIP stays switched off in prod (`app_config` flag `plans.sip.enabled=false`) until GO-2. No scope is removed.
- Production credentials not received by **Mon 11-16** ⇒ GO-1 moves to Fri 12-04.

| # | Item | Type | Owner | Due | Evidence |
|---|---|---|---|---|---|
| G-B1 | Revised Cybrilla questionnaire sent: `app/api.sanchay.in` hosts, `/api/v1/pg/return/`, `/api/v1/webhooks/fp`, `partner` omitted and `euin` null (H-11), indicative dates. **Sent only after the domain check and registration (R-22)**; if registration is not complete, the URL table is marked "final by 09-30". | Business | PO | Mon 09-28 | sent email |
| G-B2 | Owner authorises the first push of `main` (A12 (was A13) CI needs it) | Business | Owner | Fri 10-09 | written instruction |
| G-B3 | Domain `sanchay.in` (availability checked and registered **Mon 09-28, before the Cybrilla letter**, R-22) + Route 53 hosted zone in the prod account before E25 deploys (R-31); AWS prod account (R-31: no AWS dev environment, so no nonprod account for the MVP); MSG91 account | Business | PO | Mon 09-28 (domain) / Fri 10-09 / Fri 10-09 | registrar record, console access |
| G-B4 | DLT: Platizio as principal entity, sender header (brand-ownership documents if asked), and the **four templates** `SANCHAY_LOGIN_OTP_V1`, `SANCHAY_CONSENT_OTP_V1`, `SANCHAY_CONSENT_UNITS_OTP_V1`, `SANCHAY_ATTEST_OTP_V1` with the exact H-6 text (hash line as `{#var#}`, WebOTP line last; R-10); CO/counsel sign-off of the texts by Thu 10-08 | Business | PO | PE and header 10-09; texts signed 10-08; templates submitted 10-12; **approved Fri 10-23** | DLT ids |
| G-B5 | SES production access, DKIM/SPF, DMARC `p=none` then `quarantine` | Business | Dev A | Fri 10-23 | SES console |
| G-B6 | **Written Cybrilla answers:** OX-01 (Sanchay-sent OTP accepted as 2FA), OX-02 (destination), OX-04 (EUIN null / no auto-fill / partner), OX-06 (webhook auth on prod tenant), OX-10 (redeem by units), OX-12 (allotted-units field), OX-13 (refund fields), OX-17 (UPI Autopay enabled), Q26 (payment-retry beta), OX-18 (RBI PA / escrow / AMC agreements for ONDC) | Business | PO | first answers Fri 10-16; **all by Fri 11-13** | emails filed in `docs/probes/` |
| G-B7 | **Cybrilla production credentials** (FP + POA) after ONDC signup with ARN, POA agreement eSign, product demo (Fri 11-06, sandbox), RTA mailback subscription; NAT EIP allowlisted | Business | PO | **Fri 11-13; latest Mon 11-16** (later ⇒ GO-1 moves to 12-04; R-21) | creds in `sanchay/prod/*` |
| G-B8 | ARN/EUIN configuration: ARN valid-till recorded; P-04/P-05 green in sandbox; ARN visible on the RTA/AMC statement for the canary folio | Business + Eng | PO + Dev A | sandbox Fri 10-09; prod Thu 11-26 | probe docs, statement copy |
| G-B9 | Google Play organisation account (Platizio, D-U-N-S), internal-testing track, Play App Signing; SMS hash taken from it (needed only for the Android build, F18). Fallback: signed APK via Firebase App Distribution. | Business | PO | Play console verified **Fri 10-30**; app and signing key **Fri 11-06** (R-21) | console |
| G-B10 | Curated list (40–60 Regular-Growth ISINs) plus fund-facts CSV (TER, riskometer, exit load, SID/KIM) plus commission rate lines per AMC | Business/Ops | PO | v1 Fri 11-06; refresh Fri 11-20 | CSVs in the repo; before GO-1, the list loaded on prod with F19's seed `--pilot-list`, and D9's NAV history backfill run there, each through the ops one form (R-33) |
| G-B11 | Pilot invite list, pilot terms addendum, pilot caps (default ₹1,00,000 per order, ₹2,00,000 per investor per day) | Business | PO | Fri 11-20 | the list and terms; `pilot_invites` seeded only after the GO-1 decision (R-31); `app_config` caps |
| G-B12 | Support/grievance mailboxes, named grievance officer, incident contact and on-call rota (both developers), CERT-In 6 h contact | Business | PO | Tue 11-24 is a holiday, so **Mon 11-23** | published page, rota |
| G-C1 | Counsel/compliance approval: T&C, DPDP privacy notice, execution-only declaration (DSC-08), regular-plan/commission (DSC-03), DSC-02 entity line, Annexure-B verbatim, risk disclosure, SUITABILITY_WARNING, templates TPL_PURCHASE, TPL_REDEMPTION, TPL_SIP_REGISTRATION, TPL_MANDATE_REGISTRATION, TPL_ONBOARDING_ATTEST, TPL_NOMINATION_OPT_OUT, TPL_SIP_CANCELLATION (R-08), and the four DLT SMS texts (signed before the 10-12 filing, R-10) | Compliance | PO → counsel | drafts Fri 10-23; **approved Fri 11-13** | signed PDF plus sha256 in legal_documents |
| G-C2 | Risk questionnaire v1.0.0 wording and bands signed off (OX-21) | Compliance | PO | Fri 10-30 | sign-off |
| G-C3 | Counsel opinion OI-1 / OX-05 (OTP-bound declaration = "separately signed"; blank EUIN "exceptional") | Compliance | PO → counsel | Fri 11-13 | opinion |
| G-C4 | OX-18 pooling / payment-aggregator written position (G3) | Compliance | PO → counsel + Cybrilla | Fri 11-20 | letter |
| G-C5 | `regulatory-sources.md` including the category circular (OX-19); grievance policy and Investor Charter text | Compliance | Dev A + counsel | Fri 10-23 / Fri 11-13 | doc |
| G-E1 | Consent-first suite (widened in the first critic round): zero class P/M FP writes before CONSUMED for lumpsum, SIP (UPI and eNACH), mandate, SIP cancel, redemption, onboarding; plus `execute_before` missed, review-fail-after-consume and saga-expired-while-UNDER_REVIEW tests (R-17); consent tamper → `CONSENT_MISMATCH` with no FP call; every money task (approve, submit, settle, redemption, refund UTR) asserts an `audit_events` row, and `consents.cancel` requires `Idempotency-Key` (R-20) | Eng | Dev A | Fri 11-20 | CI run |
| G-E2 | Golden vectors green: money/format, XIRR V1–V7 + PO-5 display, holdings valuation (null when unpriced), redemption availability + buffer + ELSS strict (29-Feb, month-end, holiday), mandate-limit ladder, stamp duty, cut-off matrix, suitability RP-001..012, nomination split, name match | Eng | Dev A | Fri 11-20 | CI run |
| G-E3 | Security checklist: OWASP ASVS basics; gitleaks clean; secrets only in Secrets Manager; **BOLA suite on every investor endpoint** (foreign id → 404); HostGuard cross-host suite; **OTP abuse suite** (quotas, cooldown, lockout, enumeration shape, prod image refuses fakes and bypass); CSRF headers; PII log scan of e2e logs; TLS-only; RDS encryption + `force_ssl`; `pnpm audit --prod` with no High/Critical; one passive ZAP baseline on the paused prod stack before GO-1 (F22, R-31) | Eng | Dev A, cross-signed by Dev B | Wed 11-25 | checklist with links |
| G-E4 | Sandbox contract smoke green for every MVP chain on 3 runs in 3 different days (runs allowed from Mon 11-16) | Eng | Dev A | **Wed 11-25** (R-21) | run logs |
| G-E5 | Prod stack: Multi-AZ RDS, PITR, one restore test, alarms (5xx, worker heartbeat, queue age > 2 min, RECONCILING SLA, M1/M3/M4, webhook signature failures, OTP send failure > 5%, SMS cap) routed to both developers; every metric filter proven with `aws logs test-metric-filter` against captured log lines, and all ten alarms triggered on the paused prod stack before GO-1 (R-34) | Eng | Dev A | Wed 11-18 | alarm test page |
| G-E6 | Android pilot build on Play internal testing; App Links `verified` (`adb shell pm get-app-links in.sanchay.app`); payment and mandate returns work; FLAG_SECURE on OTP, consent and bank screens; app lock | Eng | Dev B | Mon 11-23 | screenshots, adb output |
| G-E7 | **Founders' canary (prod, real money):** (a) lumpsum ₹500–1,000 into a liquid/debt fund via UPI plus one via netbanking (Tue 11-17); (b) **GO-2 evidence, R-06:** SIP registration via UPI Autopay (registered 11-18/19, after demo part 2) in a canary scheme whose `sip_dates` contain 25/26, accepted on mandate APPROVED + plan ACTIVE + FP first-instalment date recorded, with the debit and allotment evidenced after they land (FP's minimum registration-to-instalment gap confirmed in Q27 by 10-16); (c) partial redemption of the (a) units (Mon 11-23). Each reconciled against FP (order, payment, plan, mandate), RTA (holdings report or AMC statement: units match the ledger to 0.001, ARN present, EUIN blank), bank (debit, payout to the folio bank); webhook signature verified on a prod event. | Eng + Business | Dev A + Dev B + PO | reconciled **Thu 11-26** | canary report `docs/probes/canary-2026-11.md` |
| G-E8 | Runbooks: FP outage, SMS outage, stuck RECONCILING, UNITS_PENDING, refund, payout delayed, worker down, kill switch, credential rotation, CERT-In 6 h report, DPDP breach, account closure / DSR, assisted contact/bank change | Eng | Dev B | Mon 11-23 | `docs/runbooks/*.md` |

**NO-GO fallback:** keep the prod stack with orders disabled (kill switch). Continue invitee onboarding on prod only if G-B7 and G-C1 are green (open for the owner: R-31 adds no invite before GO-1 except the founders' test accounts). Re-run the gate on Fri 12-04 or Fri 12-11. A GO-1 with SIP still pending simply keeps `plans.sip.enabled=false` until GO-2.

---

## 8. Phase-2 outline to full launch (PO-1…PO-7 unchanged; re-baseline on Fri 12-18 using measured MVP velocity)

| Group | Content | Rough ideal days | Applies |
|---|---|---|---|
| P2-1 Admin and ops | Vite SPA via `main-admin.ts` on `ops.sanchay.in`, ALB OIDC + TOTP step-up, 7 roles (`packages/authz`), maker-checker, audited investor 360, refetch / MANUAL_UNITS / refund UTR, approvals queue, legal publish | 15 | Design §E.3 (as amended), D-PLATFORM-055..063, GAP-07, GAP-09 |
| P2-2 Platform hardening | KMS envelope, CloudFront×4 + WAF + EdgeGuard, self-hosted Sentry, dual-stack after P-06, bundle budgets, full CI (Semgrep, zizmor, OSV, Maestro CI, iOS), Nest 12 evaluation later | 10 | Design §B.5, §C.10, §Q; D-PLATFORM-012..015, 101, 107–125 |
| P2-3 Identity and changes | New-device email step-up, native device key, sessions UI, 24 h no-lock session, email fallback + smsDegraded, recovery, contact/bank/nominee changes with cooling-offs, folio service requests | 10 | Design §E, §G.5; D-PLATFORM-020..032; D-MONEY-055, 111; H-9 |
| P2-4 KYC | POA kyc_forms, DigiLocker, eSign, signature, geotag (EXT E5 if not pulled in), FATCA review path, PEP EDD | 7 | Design §G.2–G.3; GAP-06 §1; D-MONEY-105–107 |
| P2-5 SIP management | PO-6 amount change (`mf_plan_modification_instructions`), pause (P-09), cancel UX beyond the MVP `plans.cancel` (R-08), mandate management and recovery, Start today, step-up only if P-09 passes | 9 | Design §F.5; D-MONEY-026..031, 044..048 |
| P2-6 Switch, STP, SWP | Behind flags on P-13 evidence (PO-2) | 10 | Design §F.7; D-MONEY-056..060; GAP-10 |
| P2-7 Full reconciliation | M6 tenant recon, RTA mailback `HoldingsFeed`, `payments.recon`, refund lifecycle, ledger adjustments, payout evidence, corporate actions | 8 | Design §F.10, §H; D-MONEY-062..066, 071 |
| P2-8 Tax and statements | Capital gains, statements, ELSS summary; `scheme_tax_classes` (CA) | 8 | Design §H.3; D-MONEY-072..076; GAP-11 |
| P2-9 CAS import | GAP-12 Lambda | 9 | GAP-12; D-MONEY-113..117 |
| P2-10 iOS and stores | iOS app, EAS production/Submit/Update, Play production, App Store, in-app closure, UPI intent allowlist, SSL pinning, integrity | 10 | Design §M; D-PLATFORM-040..048, 070..079, 115 |
| P2-11 Discovery and engagement | www SEO fund pages, watchlist, collections, returns calculator, `product_events`, push (FCM/APNs), inbox | 9 | Design §I.6–I.7, §L; D-MONEY-083..087 |
| P2-12 DPDP and audit | Privacy centre, grievances register, retention jobs, audit export to Object Lock | 6 | Design §O.1–O.3; D-PLATFORM-086..094; GAP-08 |
| P2-13 Pen test | CERT-In-empanelled vendor plus remediation (booked by Fri 12-18) | 5 + vendor | D-PLATFORM-117 |

**Total ≈ 116 ideal days**, about 5 to 6 two-week sprints at the MVP's measured velocity. The launch date is re-baselined on Fri 12-18 against the PO-4 plan of record. The PO-8 escalation (roadmap P80) is presented with MVP velocity data rather than the S0 estimate.

### Critical Files for Implementation
- C:/Users/pc/Desktop/sanchay/docs/specs/mvp/MVP-SPEC.md (to create; this spec, plus ADR-0013/0014/0015)
- C:/Users/pc/AppData/Local/Temp/claude/C--Users-pc-Desktop-sanchay/2f00d411-382c-43a6-bd67-ecaf60c67db1/tasks/wk14xlx18.output (`result.interfaceSheet` and `result.planChunks`: the Plan-01 amendments of H-20 apply to it; `registerMoney` / `registerPlatform` are amended by H-1..H-21)
- C:/Users/pc/AppData/Local/Temp/claude/C--Users-pc-Desktop-sanchay/2f00d411-382c-43a6-bd67-ecaf60c67db1/tasks/wsx2mey6n.output (`result.finalDesign` §C, §F, §G, §H: target data model and flows this MVP subsets)
- C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/service/InvestorActionService.java (read-only; lines ~690-760 are v1's custom-checkout order to port behind the consent gate; lines 1014-1019 are the mandate formula not to port)
- C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/service/XirrCalculator.java and service/RedemptionAvailability.java (read-only ports for the golden vectors)
