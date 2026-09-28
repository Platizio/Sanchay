<!-- source: task wuehi471r result.claimLedger + result.gapAnswers | exported 2026-09-28 -->

# v1 analysis: verified claims and gap answers

| Id | Kind | Verdict | Claim |
|---|---|---|---|
| L1 | code | SURVIVED | XIRR is computed by a dependency-free Newton-Raphson (seed r=0.1, tolerance 1e-7, 100 iters) falling back to bracketed bisection (200 iters) in service/XirrCalculator.java, returning null (never NaN/zero) on <2 cashflows, all-same-sign, zero-horizon, or non-convergence; used per-holding and portfolio-wide in HoldingsService.java. |
| L2 | code | SURVIVED | Investor holdings (units, invested cost, current value) are derived entirely from the internal orders ledger (transaction_orders + redemption_records), never from a Cybrilla/FP holdings or reports API — confirmed by no FP holdings-API call found in this slice. |
| L3 | code | CORRECTED | Money and unit columns are consistently BigDecimal/numeric with no floating-point types anywhere: transaction_orders.amount numeric(18,2), .units numeric(18,4), allotment_nav/stamp_duty numeric(20,4), scheme_navs.nav numeric(20,6) — grep for double/float across the domain package returned zero matches. |
| L4 | code | CORRECTED | No ARN/EUIN field is read, set, or transmitted anywhere in the Cybrilla FP order-creation/submission code path — confirmed by exhaustive grep of RealCybrillaClient.java and OrderService.java for arn/euin/distributor/partner_code/ria terms, all zero payload-field hits. |
| L5 | code | SURVIVED | Investor authentication today is already OTP-only (email always live via SMTP/dev-fallback; mobile OTP gated behind a still-undeployed real SMS provider), issuing an HS256 JWT (jjwt 0.12.6) with a 1-hour access token in an HttpOnly cookie, with no refresh-token rotation yet built for investors, and no password field on investor_accounts at all. |
| L6 | code | SURVIVED | Backend is currently Spring Boot 3.3.5 on Java 21 (Maven), with Flyway 10.10.0, PostgreSQL driver 42.7.4, jjwt 0.12.6, springdoc 2.6.0, bucket4j 8.10.1 — confirmed by direct read of pom.xml. |
| L7 | external | CORRECTED | SEBI mandates two-factor authentication (OTP) for mutual fund purchase/subscription transactions (circular effective 2023-04-01, extending an earlier 2022-03-31 redemption-only mandate) — and for SIPs, the 2FA/OTP check applies only at registration, not each recurring instalment. |
| L8 | external | CORRECTED | SEBI revised mutual fund cut-off times effective 2025-06-01: 3:00 PM for standard scheme purchase/redemption, 1:30 PM for liquid/overnight scheme purchases, 7:00 PM for online overnight-scheme redemptions. |
| L9 | code | CORRECTED | Two parallel investor identity tables exist: investors (distributor-created KYC/profile record, PK id) and investor_accounts (V58 migration, self-authenticated passwordless login identity), linked only by PAN and only after explicit confirmation — no other FK enforces the relationship. |
| L10 | code | CORRECTED | The single hard gate currently preventing investor self-signup is InvestorAuthService.assertDistributorAllotted (InvestorAuthService.java:259-264), which refuses login/access unless a distributor has already created and linked an investors row — no self-signup endpoint exists at all (OtpPurpose.INVESTOR_SIGNUP is wired but permanently disabled). |
| L11 | external | SURVIVED | Cybrilla FintechPrimitives' public partner/licensing documentation lists only two tenant types — ARN (AMFI-registered distributor) and RIA (SEBI Registered Investment Adviser) — with no Execution-Only-Platform (EOP) category documented anywhere. |
| L12 | code | SURVIVED | The most recent full 11-item SEBI/AMFI compliance review (2026-09-03) found 0 items fully PASS, 8 PARTIAL, and 3 FAIL — with Terms & Conditions acceptance (no real document exists, distributor can accept on investor's behalf), redemption-screen disclosure, and no-auto-populated-defaults (9 compliance attributes, e.g. gender, still hardcoded/defaulted at the Cybrilla wire, causing real misfilings) as the three FAILs. |
| L13 | code | SURVIVED | Holdings valuation deliberately never fabricates a number: a holding with unknown/unpriced units reports currentValue = null (never the invested amount, never zero), and units_source (PROVIDER/DERIVED/MANUAL, V75 migration) gates whether a unit count may be used as a redemption divisor or tax cost basis — DERIVED estimates are excluded from both. |
| L14 | external | SURVIVED | India's DPDP Rules 2025 were notified 2025-11-13 with phased compliance obligations extending to 2027-05-13, requiring explicit granular consent, purpose-limited retention/erasure, 72-hour breach reporting to the Data Protection Board, and penalties up to ₹200-250 crore. |
| L15 | code | CORRECTED | The TransactionApprovalChallenge 2FA/consent engine is atomic and replay-proof: it freezes a SHA-256-hashed snapshot at challenge creation, requires OTP+explicit consent to move PENDING→CHALLENGE_SENT→APPROVED, then atomically flips APPROVED→CONSUMED immediately before every Cybrilla/FP write inside the same DB transaction, enforced by a DB-level partial unique index allowing only one live challenge per transaction. |

# Gap answers

## G1: Does Cybrilla FintechPrimitives' catalogue endpoint (GET /v2/mf_scheme_plans/cybrillapoa or the raw /api/oms/fund_schemes response) already carry fund-fact fields (expense ratio, riskometer, min lumpsum/SIP, plan type, exit load, lock-in) that ProductService.mergeLiveSchemeInto simply discards on upsert, or does v2 genuinely need a new/second data source for the category-based catalogue UI?

## [G1] Answer

**Direct answer:** Cybrilla FP's catalogue endpoints carry plan/threshold facts (plan type, min lumpsum, min SIP, lock-in, sub-category) that `mergeLiveSchemeInto` *keeps* (not discards, since it stores the full raw JSON as `metadata_json`) — but they do **not** carry the valuation/analytics facts the v2 catalogue UI actually needs (expense ratio, riskometer/risk level, exit load, AUM, benchmark, returns, holdings); those genuinely require a new/second data source.

### Evidence

**What `mergeLiveSchemeInto` does with the payload** — `ProductService.java:468-479`: it maps only 6 scalar fields onto structured columns (`schemeName`, `amcName`, `category`, `externalSchemeCode`, `externalIsin`, `productType`, `active`), but line 477 sets `target.setMetadataJson(carryForwardMirroredNav(...))` using `live.getMetadataJson()` — which is built in `RealCybrillaClient.buildSchemeMetadata` (`RealCybrillaClient.java:3233-3253`) as `source.deepCopy()` of the raw FP scheme node. So the **full raw FP JSON is preserved** in `metadata_json`, not discarded — nothing structured is being thrown away, it's just unmapped to dedicated columns.

**What fields actually exist upstream** — captured real payloads confirm this precisely:
- `GET /api/oms/fund_schemes` (`RealCybrillaClient.java:3192-3225`, `toProductScheme`) — raw export at `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/exports/finprim-direct-fund-schemes-20260514051017.json:9-52` shows `plan_type`, `sub_category`, `min_initial_investment`, `min_additional_investment`, `min_withdrawal_amount`, `sip_frequency_specific_data.{monthly,quarterly}.min_installment_amount`, `lock_in` / `lock_in_period` (lines 38-39, confirmed `true`/`36` for lock-in funds at lines 3710-3711), `close_ended`, `switch_in/out` fields.
- `GET /v2/mf_scheme_plans/cybrillapoa` (`RealCybrillaClient.getMfSchemePlansPage`, `RealCybrillaClient.java:2249-2273`) — raw export at `.../exports/cybrilla-poa-fund-schemes-20260514-051817.json:23-80` shows a `thresholds[]` array with `lumpsum`/`withdrawal`/`sip` `amount_min`/`amount_max`/`amount_multiples`/`installments_min`.
- Grep across both full raw JSON exports for `expense_ratio|riskometer|risk_o|exit_load|aum|fund_manager|benchmark` → **no matches**. `lock_in`/`lock_in_period` are the only "fund-fact"-adjacent fields present.

**Frontend already anticipates the gap** — `investor-frontend/src/components/BackendFundDetailModal.tsx:335,339,341` has speculative `metadata` key-lookups for `risk_level`/`riskometer`, `exit_load`, `expense_ratio`, plus `aum`, `benchmark`, `objective`, `strategy`, and `returns.1m/3m/ytd/1y/3y/5y` (lines 334-353) — none of which resolve against real captured payloads, confirming these are placeholder lookups against data that has never actually been present.

### Caveats
- The two exports (`fund-schemes` full master, `mf_scheme_plans/cybrillapoa` POA-scoped) are point-in-time snapshots (2026-05-14) fetched via the app's own export tooling (`exports/*.json`), not a live probe of FP's docs today (2026-09-25) — FP could have added fields since, but nothing in the codebase currently maps/expects newer fields.
- FP's `docs.fintechprimitives.com/data/data-schema/` page (fetched today) is an index page only; it names a `fund_details` reference table but the actual column list is behind further docs/API-doc pages not retrievable via this fetch — cannot fully rule out that a *separate* `fund_details`/analytics endpoint (distinct from `fund_schemes`/`mf_scheme_plans`) exists with expense ratio/riskometer that this codebase has simply never called. Recommend a live API probe against FP's `fund_details` table/endpoint before finalizing scope.
- Min lumpsum/SIP, plan type, lock-in ARE upstream today — v2 catalogue filtering by category/min-investment/lock-in can be built from existing data with no new vendor. Expense ratio, riskometer, exit load, AUM, benchmark, and returns/XIRR-adjacent analytics are the gap requiring either a new vendor (e.g., AMFI/Value Research/Morningstar-style data feed) or manual admin curation.

**Key files:** `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/service/ProductService.java` (468-535), `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/integration/RealCybrillaClient.java` (2249-2273, 3192-3253), `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/exports/finprim-direct-fund-schemes-20260514051017.json`, `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/exports/cybrilla-poa-fund-schemes-20260514-051817.json`, `C:/Users/pc/Desktop/WeathTech_v2/investor-frontend/src/components/BackendFundDetailModal.tsx` (300-360).

## G2: Has anyone confirmed Cybrilla FP's purchase/SIP/redemption payload builders (RealCybrillaClient.java lines ~2502-3437, not fully read by the be-integrations analyst) truly contain zero ARN/EUIN/distributor-identifying fields, and separately, has Cybrilla ever responded to Platizio's draft production go-live/tenant-type inquiry email?

## Direct answer
Confirmed for payload builders (zero ARN/EUIN/distributor fields verified by direct read of the actual builder methods, not just grep); **not confirmed** for the Cybrilla email — the repo contains only an unsent template with placeholder signature fields, no evidence it was ever sent, and no reply of any kind is recorded anywhere in the codebase.

## Evidence

**1. Payload builders — fields enumerated directly (all three order types)**

`C:\Users\pc\Desktop\WeathTech_v2\investor\platiziowealthtech-Back_end\src\main\java\com\platizio\wealthtech\integration\RealCybrillaClient.java`

- `mfPurchasePayload` (lumpsum, lines 3052-3062): `source_ref_id`, `mf_investment_account`, `scheme`, `amount`, `user_ip`, `gateway`, `initiated_via`.
- `mfPurchasePlanBasePayload` / `mfPurchasePlanWithMandatePayload` (SIP, lines 3064-3110): adds `systematic`, `frequency`, `installment_day`, `number_of_installments`, `payment_method`, `payment_source`, `generate_first_installment_now`.
- `redemptionPayload` (lines 3138-3154): `source_ref_id`, `mf_investment_account`, `scheme`, `amount`, `units`, `gateway`.
- `investorProfilePayload` / `investorProfileOrderReadyPayload` (lines 2587-2650ish): `type`, `tax_status`, `name`, `date_of_birth`, `pan`, `country_of_birth`, `place_of_birth`, `nationality_country`, `source_of_wealth`, `income_slab`, `pep_details`, `occupation`, `gender`.

None of these — nor any other payload builder in the file — contain `arn`, `euin`, `distributor`, `sub_broker`, `rm_code`, `agent_code`, or `emp_code`. A case-sensitive grep for `arn|euin|distributor|ARN|EUIN|Distributor` across the full 3,436-line file returned zero real hits (the only matches were the substring "arn" inside `logger.warn(...)`, a false positive). Case-insensitive grep for `arnCode|euin|sub[- ]?broker|rmCode|agentCode|subBroker|empCode` also returned **no matches**. This closes the gap the be-integrations analyst left (payload builders now read in full, not just partially).

**2. Cybrilla production go-live email — status**

`C:\Users\pc\Desktop\WeathTech_v2\investor\platiziowealthtech-Back_end\docs\cybrilla-production-inquiry-email.md` is a **fill-in-the-blank template**, not a sent-and-answered thread:
- Signature block still has literal placeholders: `[Your name]`, `[Your role]`, `[Company]`, `[Phone]`, `[Email]` (lines 119-124).
- Section header explicitly says "Email template (copy, customize, send)" (line 13) — i.e., authored for future sending.
- File itself instructs "What to do **while waiting** for Cybrilla" (line 128), confirming it was written pre-send / pre-reply, with no update since.

Companion docs confirm sandbox-only status as of the most recent dated entries:
- `docs/cybrilla-credentials-and-network-report.md:19`: "These are **sandbox / integration test** credentials, not production go-live credentials." Dated verification entries only go up to "9 June 2026" (line 88) — no later update recording a Cybrilla reply.
- `docs/cybrilla-connectivity-incident-log.md:63-69` lists a separate open "Questions for Cybrilla" list, also unanswered in-repo.
- `docs/runbooks/cybrilla-review-2026-09.md:198` references "the reply **to** Cybrilla" — but this is Platizio's outbound reply on a *different* thread (a Cybrilla-initiated compliance/data-purge review), not a Cybrilla reply on the production go-live/tenant-type inquiry.

No file in `docs/`, `.java` comments, changelog, or test resources records a Cybrilla-side response, ticket number, or production credential grant.

## Caveats
- This is a static, read-only repo review (per task rules) — it cannot check actual mailboxes, support-ticket systems, or Slack/Teams for an out-of-band reply that was never committed to the repo. "Not found in repo" is not proof no reply ever occurred outside it — but it is proof the codebase gives **no basis** for asserting the vendor confirmed anything.
- Payload-builder completeness was verified for `RealCybrillaClient.java` only; helper/shared payload code elsewhere (e.g., `investorProfilePayload`, bank/mandate payloads) was spot-checked and also clean, but a codebase-wide grep for ARN/EUIN across all integration classes (not just this file) was not performed as part of this slice.
- No git history is available (workspace is not a git repo per environment info), so file modification dates/authorship for the email template could not be cross-checked beyond in-file dates.

## G3: Where and how will NAV cut-off/same-day-vs-next-day-NAV logic be enforced in v2, given the backend today has zero cut-off-time logic (relies entirely on FP applying its own, opaque cutoff), and does that match SEBI's cut-off times revised effective 2025-06-01 (3:00pm standard, 1:30pm liquid/overnight purchase, 7:00pm online overnight redemption)?

## G3 — NAV cut-off / same-day-vs-next-day-NAV enforcement in v2

**Direct answer:** In the current backend, cut-off timing is enforced nowhere on Platizio's side — no `LocalTime`/clock comparison against 3:00pm/1:30pm/7:00pm exists in `OrderService.java` or `RealCybrillaClient.java`; the platform submits the order to Cybrilla FP and then trusts whatever `allotment_date`/NAV FP returns, so v2 must explicitly decide to keep trusting FP's opaque cutoff or build its own pre-submission cutoff gate — today it does neither, which is a real gap against SEBI's post‑2025‑06‑01 rules (especially the online 7:00pm overnight-redemption cutoff, which is *later* than FP's typical processing cutoff and could be silently mishandled).

### Evidence

- **No cutoff logic in `OrderService.java`**: the only `LocalTime` usage in the whole file is an unrelated date-range boundary helper (`OffsetDateTime.of(fromDate, LocalTime.MIN, ...)` / `LocalTime.MAX`) at `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/service/OrderService.java:164,168`. `createOrder` (line 471) and `createOrderAsInvestor` (line 579) contain no time-of-day check, no market-hours check, no holiday-calendar check before submitting to FP.
- **NAV is resolved *after the fact*, not gated before submission.** `OrderService.java` determines the **allotment day** first, then reads whatever NAV FP published for that day (`allotmentDateNavQuote`, lines 968–977; `SchemeNavResolver#asOf`), with fallbacks to provider-supplied NAV (`providerNav`, line 1018) or a derived NAV (`amount ÷ units`, lines 879–893). This is entirely reactive reconciliation against FP's stated allotment date — there is no forward check of "is it past cutoff, so this should roll to T+1."
- **Repo-wide search confirms zero cutoff constants**: grepping for `cutoff`/`cut-off`/`cut_off` across `src/main/java` turns up only unrelated uses (token-expiry sweepers, grandfathering date for capital-gains tax, NAV-staleness gauges) — none reference 15:00, 13:30, or 19:00 IST or any SEBI cutoff rule.
- **`RealCybrillaClient.java` payload builders carry no cutoff/time fields.** The purchase payload builder (around `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/integration/RealCybrillaClient.java:3057-3059`, `put(payload,"amount",...)`, `put(payload,"gateway", MF_PURCHASE_GATEWAY)`) and the redemption payload builder (`:3144-3152`, amount/units/gateway) send only investment amount/units/gateway to `/v2/mf_purchases`, `/v2/mf_purchase_plans`, `/v2/mf_redemptions` (paths defined at `:67-69`) — no submission timestamp, no cutoff acknowledgment, no explicit same-day/next-day NAV flag is sent or received in these payloads. Allotment date/NAV comes back opaquely from FP later and is only *read*, not *predicted or enforced*, by Platizio (`OrderService.java:795-976`).
- **`NAV_MARKET_ZONE = Asia/Kolkata`** (`RealCybrillaClient.java:83`) is used only to normalize an *already-known allotment timestamp* into a calendar date (`:1008-1014`), not to compare "now" against a cutoff clock before submission.
- **Comment evidence of deliberate reactive design**: `OrderService.java:795-815` documents that allotment NAV is "resolved first" from whatever date FP settles on, explicitly to avoid mismatches from re-deriving units — i.e., the architecture is built to trust FP's allotment date after the fact rather than to predict/enforce it beforehand.

### SEBI comparison (effective 2025-06-01, Circular SEBI/HO/IMD/PoD2/P/CIR/2025/56, dated 2025-04-22)
- Standard schemes: 3:00pm purchase/redemption cutoff — v1 has no check.
- Liquid/overnight schemes purchase: 1:30pm cutoff — v1 has no check.
- Overnight scheme online redemption: 7:00pm cutoff (vs. offline 3:00pm) — v1 has no check, and this is the tightest/most-likely-to-be-missed rule since 7pm is well after typical business-hours assumptions.

**This does not match** the SEBI rule structure — the current backend has no scheme-category-aware, channel-aware (online vs. offline) cutoff table at all; it is a complete pass-through to FP.

### Caveats
- It's possible FP enforces these cutoffs correctly server-side and simply returns the resulting allotment date; nothing in this repo proves or disproves FP's internal correctness — that would require external evidence (FP API docs/contract), which is out of this codebase's scope. Not found: any FP cutoff-behavior documentation or contract file in the repo.
- Not found: any frontend disclosure to investors about same-day vs next-day NAV expectations (would need frontend-slice confirmation).
- v2 design implication: since the model shifts to investor-initiated real-time orders (vs. v1's distributor-drafted + delayed-OTP-approval flow), the timing gap between "investor clicks buy" and "order reaches FP" shrinks, making a platform-side pre-submission cutoff check (per scheme category: liquid/overnight vs. standard, online vs. offline) more necessary for accurate same-day-NAV disclosure, not less.

Sources:
- [Stable Money — SEBI's revised mutual fund cut-off timings effective June 2025](https://stablemoney.in/blog/new-sebi-mutual-fund-cut-off-timings-2025)
- [Groww — SEBI Revises Mutual Fund Cut-off Timing](https://groww.in/blog/sebi-revises-mutual-fund-cut-off-timings)
- [TaxGuru — SEBI Revises Cut-Off Timings for NAV in Overnight Mutual Fund Schemes](https://taxguru.in/sebi/sebi-revises-cut-off-timings-nav-overnight-mutual-fund-schemes.html)
- [Outlook Money — Sebi Revises Cut Off Timings For Determining NAV Of Overnight Schemes](https://www.outlookmoney.com/invest/equity/mutual-funds-sebi-revises-cut-off-timings-of-overnight-schemes-for-determining-nav)

## G4: Does Cybrilla FintechPrimitives actually support (or is willing to support) a direct-to-consumer / Execution-Only-Platform-style tenant relationship for Platizio, or only the existing ARN/MFD and RIA partner types documented publicly?

**Direct answer:** Not found — no evidence exists (in the repo or public FP docs) that Cybrilla/FintechPrimitives supports or has been asked about a direct-to-consumer/Execution-Only-Platform tenant model; the only production-readiness email sent to Cybrilla is unanswered and was itself scoped to the distributor model, and FP's public docs describe exactly two tenant/license types — ARN (MFD/distributor) and RIA (adviser) — with no EOP/D2C category.

**Evidence**

1. **The outreach email itself assumes the distributor model and got no reply.** `C:\Users\pc\Desktop\WeathTech_v2\investor\platiziowealthtech-Back_end\docs\cybrilla-production-inquiry-email.md:114` states the use case as `"Use case: Distributor portal — investor onboarding, KYC, bank verification, lump-sum MF purchase via Cybrilla POA"`, and line 90 asks `"Does our AMFI ARN licence affect KYC Check ... status only vs full entity_details?"` — i.e. the email frames Platizio as an ARN/MFD tenant, not a D2C/EOP one, and never raises the question of a direct-to-consumer relationship at all. The doc's own file name/context ("unanswered") plus the absence of any reply text or follow-up in the docs folder confirms no vendor response is on record.
2. **No other doc in the repo (`cybrilla-connectivity-incident-log.md`, `cybrilla-credentials-and-network-report.md`, `cybrilla-demo-support-email.md`, `cybrilla-support-email-draft.md`, `runbooks/cybrilla-review-2026-09.md`) mentions D2C, execution-only platform, EOP, or B2C tenant terms** — grep for `execution.only|EOP|direct.to.consumer|D2C` across `docs/` returns no matches in any of these files; all references (e.g. `runbooks/cybrilla-review-2026-09.md:177` "with a distributor session") continue to assume a distributor-session model even in the most recent (2026-09) internal doc.
3. **Public FP docs define only two license/tenant categories, both agent/adviser-based, not self-directed:**
   - `https://docs.fintechprimitives.com/going-live/licenses/` — **ARN**: "Register with AMFI, Work as an agent to AMC, Get commissions from AMC" (regular schemes); **RIA**: "Register with SEBI, Work for the investor, Can charge advisory fee to the investor" (direct schemes). No AMC, execution-only, or D2C category appears on this page.
   - `https://docs.fintechprimitives.com/fp-cybrillapoa-gateway/going-live/` — states "A signup on the ONDC portal is mandatory using your registered ARN details," reinforcing that the documented go-live path is ARN-centric; it does not distinguish or describe an EOP/D2C partner type.
   - `https://docs.fintechprimitives.com/going-live/distributors-with-rtas/` returned HTTP 403 (could not be fetched) — its title ("Distributors w/ RTA") is itself evidence the documented partner category is distributor-oriented, but its content couldn't be verified here.

**Caveats**
- This is documentation-and-repo evidence only; no direct vendor call/response was found in the workspace, and none could be conducted in this read-only analysis — the question "is Cybrilla *willing* to support D2C" is fundamentally a live-vendor-conversation question that cannot be answered from static docs.
- The distributors-with-RTAs page (403) and any other gated FP pages (e.g. FAQs, API reference sections requiring login) were not fully inspected and could contain a third tenant category not surfaced by search snippets.
- Absence of a documented EOP/D2C tenant type is not proof FP structurally cannot support one (e.g., via an RIA-licensed tenant acting for itself, or a new commercial arrangement) — only that it is undocumented publicly and unconfirmed by Cybrilla as of 2026-09-25.
- Recommendation: this is a blocking open item for the v2 plan — the "remove distributor layer" workstream should be gated on either (a) written confirmation from Cybrilla that a D2C/RIA-as-principal or EOP tenant is supported, or (b) evaluation of alternate MF execution vendors (BSE StAR MF, NSE MFSS/MFD, RTA direct APIs) that natively support self-directed investor platforms.

Sources:
- [Licenses - Introduction - Fintech Primitives](https://docs.fintechprimitives.com/going-live/licenses/)
- [Going Live - Introduction - Fintech Primitives](https://docs.fintechprimitives.com/fp-cybrillapoa-gateway/going-live/)
- [Distributors w/ RTA](https://docs.fintechprimitives.com/going-live/distributors-with-rtas/) (403, unverified)

## G5: Which nominee cap and allocation-declaration rule should v2 actually implement — the codebase's current NominationRules.MAX_NOMINEES=3 (verified live in NominationRules.java:25) or the externally-researched claim that SEBI now permits/mandates up to 10 nominees with mandatory personal declaration, effective 2025-03-01?

## Direct Answer

Keep **MAX_NOMINEES = 3** (`NominationRules.java:25`) — it is already correct for the currently-live SEBI rule. The "10 nominees" claim was real but is **obsolete**: SEBI's Jan-10-2025 circular (effective 2025-03-01) did raise the cap to 10, but a later SEBI circular dated **29-May-2026** ("Ease of Doing Investments – Modified Norms for Nomination in Demat Accounts and Mutual Fund Folios," ref. SEBI/HO/OIAE/OIAE_IAD-3/P/CIR/2026/12676), effective **01-Sep-2026**, expressly **supersedes all earlier nomination circulars** and reduces the cap back to **3 nominees**. As of today (2026-09-25) that Sept-2026 circular is the live rule, so the codebase's 3-nominee cap is not stale — it matches current law.

## Evidence

**Codebase**
- `NominationRules.java:25` — `public static final int MAX_NOMINEES = 3;`
- `NominationRules.java:55-60` — `validateCap` enforces the cap on both write paths (distributor + investor self-service), per the class javadoc at `NominationRules.java:8-21` describing a 2026-08-31 compliance-review consolidation.
- `NominationRules.java:145-149` — javadoc explicitly references **"the 2026-09-01 SEBI changes"** for the guardian-relationship-mandatory rule, i.e., the code was already updated in anticipation of/response to the SEBI circular effective 2026-09-01 (matching the May-2026 circular's effective date found externally).
- `NominationRulesTest.java:32` — unit test pins `MAX_NOMINEES == 3`.
- Callers: `InvestorController.java:723`, `InvestorPortalController.java:795`.

**External (SEBI, primary + corroborating secondary sources)**
- SEBI circular "Circular on Revise and Revamp Nomination Facilities in the Indian Securities Market," dated 10-Jan-2025 (SEBI/HO/OIAE/OIAE_IAD-3/P/ON/2025/01650), effective 01-Mar-2025 — raised cap to **up to 10 nominees**, required declaring one of PAN / driving-licence number / last-4-digits-Aadhaar per nominee. Primary page: https://www.sebi.gov.in/legal/circulars/jan-2025/circular-on-revise-and-revamp-nomination-facilities-in-the-indian-securities-market_90698.html (title/date confirmed directly; full-text detail corroborated via https://upstox.com/news/personal-finance/financial-regulations/revised-mutual-fund-and-demat-account-nomination-rules-from-march-1-2025-what-is-new/article-139984/, accessed 2026-09-25).
- SEBI circular "Ease of doing investments - Modified Norms for Nomination in Demat Accounts and Mutual Fund Folios," dated **29-May-2026** (SEBI/HO/OIAE/OIAE_IAD-3/P/CIR/2026/12676), effective **01-Sep-2026**. Primary page (title/date confirmed directly): https://www.sebi.gov.in/legal/circulars/may-2026/ease-of-doing-investments-modified-norms-for-nomination-in-demat-accounts-and-mutual-fund-folios_101703.html. This circular:
  - Reduces the cap to **up to 3 nominees** (confirmed independently via https://www.mondaq.com/india/financial-services/1797480/sebi-modifies-nomination-norms-for-demat-accounts-and-mutual-fund-folios and https://tradebrains.in/money/sebi-makes-nomination-mandatory-for-demat-accounts-mutual-fund-folios-from-sept-1-who-can-be-a-nominee-and-what-happens-if-you-opt-out-12480255, both accessed 2026-09-25).
  - Explicitly **"supersedes all earlier SEBI circulars relating to nomination in demat accounts and mutual fund folios"** (mondaq summary).
  - Makes nomination mandatory (opt-out allowed) for new single-holder accounts opened on/after 01-Sep-2026; optional for joint accounts.
  - Streamlines mandatory fields to **nominee name + relationship**; contact details/KYC identifiers (the PAN/DL/Aadhaar declaration from the 2025 rule) are now **optional**, not mandatory — removes the witness-signature requirement.

## Caveats

1. Full text of both circulars behind PDF links could not be rendered by WebFetch (it only surfaced page title/metadata); conclusions rely on the SEBI page titles/dates (verified directly) plus consistent corroboration across three independent secondary outlets (upstox, mondaq, tradebrains). Recommend downloading the actual PDFs from the two sebi.gov.in URLs above before finalizing compliance sign-off.
2. If the personal-identifier (PAN/DL/Aadhaar) field is now optional per the May-2026 circular, confirm whether `NominationRules.java` or related onboarding forms still hard-require it anywhere — not found in `NominationRules.java` itself (no PAN/Aadhaar validation present there), but worth checking DTOs/controllers separately.
3. Because the effective date (01-Sep-2026) is only ~3 weeks before "today" (2026-09-25), verify with AMFI/RTA (Cybrilla FP) implementation status — regulatory effective date and vendor/API rollout date are not always the same day.
4. This answer is time-sensitive by construction: it is correct only because "today" is 2026-09-25, after the 01-Sep-2026 supersession. Do not treat "10 nominees" as permanently wrong — it was correct law for ~18 months (Mar-2025–Aug-2026).

## G6: Is ELSS lock-in (3-year statutory lock-in) or exit-load enforced anywhere — by Cybrilla/FP server-side, or nowhere at all — and if nowhere, how will v2 prevent/flag premature ELSS redemption once the catalogue is opened to self-serve retail investors?

These cybrilla docs are internal support/incident logs (about KYC/connectivity), not API documentation from Cybrilla about redemption business rules — no lock-in mentions found in any of them. No FP/Cybrilla API contract document in the repo addresses ELSS lock-in behavior at all; there is no evidence either way of what Cybrilla's server does.

Sufficient evidence gathered. Composing final answer.

## Direct answer
ELSS lock-in and exit-load timing are **not enforced anywhere in the Platizio codebase** (no lock-in field, no date check, no ELSS-specific logic in the redemption path), and there is **no evidence in this repo of Cybrilla/FP enforcing it either** — the only redemption ceiling that exists checks *how much* can be redeemed, never *when*.

## Evidence

- **No ELSS concept in the domain model at all.** `ProductCategory` enum, the only categorization on a scheme, has just `MF, SIF, OTHER, MUTUAL_FUND, EQUITY` — no `ELSS` value: `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/domain/ProductCategory.java:3-9`. `ProductScheme` (`.../domain/ProductScheme.java:12-52`) has no lock-in/maturity/tax-saver field of any kind.
- **"ELSS" only exists as cosmetic UI text**, in frontend mock/demo data and a client-side name-matching heuristic, never touching the backend: `investor-frontend/src/data/products.ts:46`, `investor-frontend/src/views/ProductMgmt.tsx:38,91,455,706` (`if (normalized.includes('elss') || normalized.includes('tax')) return 'ELSS';`), `investor-frontend/src/views/Ledger.tsx:29`, `investor-frontend/src/views/Calculators.tsx:40-41`, `investor-frontend/src/components/TaxCalculator.tsx:35`.
- **Redemption gate only checks a rupee/unit ceiling, never a date.** `RedemptionAvailability.java` (`C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/service/RedemptionAvailability.java:1-239`) is explicitly documented as "THE definition of how much of a holding may still be redeemed" (line 12) — it computes `availableUnits`/`availableAmount` purely from allotted units, NAV/invested-amount basis, and in-flight/settled redemption records. No timestamp, purchase date, or holding-period logic anywhere in the file.
- **`OrderService.assertWithinRedeemableCeiling`** (`.../service/OrderService.java:1569-1618`) is the sole guard called from `createRedemptionDraft` (`OrderService.java:1447`) before a redemption is drafted; it only compares requested units/amount against `RedemptionAvailability.availableUnits/availableAmount`. No lock-in or exit-load check precedes or follows it.
- **Exit load is mentioned only as investor-facing disclosure text**, never computed/enforced: `TransactionConsentTemplates.java:29,45,75,264,275` — the redemption consent copy tells the investor "if the scheme's SID applies an exit load... proceeds are net of it," language, not a server-side calculation or block.
- **No RedemptionAvailability.java "absence"** — contrary to the WHERE-TO-LOOK note, the file exists and was read in full; it is present but scoped only to ceiling/quantity, not timing.
- **RealCybrillaClient.java** (2900+ lines) has zero matches for `lock`, `ELSS`, or `premature` — no handling of a Cybrilla/FP error code for lock-in violation, no pre-submit lock-in check before calling FP redemption APIs.
- **No internal Cybrilla API documentation in the repo addresses this.** The `docs/cybrilla-*.md` files and `cybrilla-demo-2026-09`/`cybrilla-test-run-2026-09-24` folders are incident/connectivity/KYC test logs — none contain "lock-in" or "ELSS" content; there is no captured FP API spec confirming or denying that FP itself blocks ELSS redemption before 3 years.

## Caveats

- Absence of `ELSS`/`lock` in this repo's Cybrilla docs is **not proof FP doesn't enforce it server-side** — it only shows Platizio never documented or tested that path (the repo's Cybrilla demo/test scripts focus entirely on onboarding/KYC/2FA, not redemption-type variance). This needs a direct confirmation from Cybrilla's FP API contract/support, which is outside this codebase.
- v1's B2B2C model (distributor drafts, investor approves via OTP) could theoretically have relied on distributor diligence to avoid drafting an ELSS redemption before 3 years — that informal safeguard disappears entirely once self-serve retail investors can trigger redemption directly.
- v2 must add explicit server-side enforcement before opening self-serve ELSS redemption: a `lockInEndDate`/scheme-category field on holdings computed from allotment date + 3 years, checked alongside (not instead of) `RedemptionAvailability`, since neither Platizio nor (confirmed) FP is proven to block it today.

## G7: What is the true current (2026-09-25) state of the two structural 2FA bugs flagged in the 2026-09-03 compliance review — (a) investor-originated purchase 2FA approval always fails post-approval due to a snapshot-hash/timestamp fingerprint mismatch, and (b) every full redemption of a derived/estimated holding is refused 100% of the time after 2FA/consent — since these are exactly the investor-self-serve paths v2 needs to build on?

## Direct answer

Both structural bugs are **still present, unfixed, at today's (2026-09-25) backend HEAD** — verified by reading the live code paths, not just the 2026-09-03 report. The "2FA/consent engine is production-ready" assumption is false for both investor-self-purchase and investor-self-redemption.

## Evidence

**(a) Purchase 2FA fingerprint mismatch — confirmed still broken**

- `BaseEntity.onCreate()` (`C:\Users\pc\Desktop\WeathTech_v2\investor\platiziowealthtech-Back_end\src\main\java\com\platizio\wealthtech\common\BaseEntity.java:27-29`) sets `createdAt = OffsetDateTime.now()` in-process (system-zone offset, sub-microsecond precision) on `@PrePersist`.
- `OrderService.createOrderAsInvestor` (`OrderService.java:578-607`) is `@Transactional`; it creates the order, then immediately calls `transactionApprovalService.createChallenge(...)` **in the same transaction**. `TransactionApprovalService.renderPurchaseSnapshot` (`TransactionApprovalService.java:204-221`) embeds `order.getCreatedAt().toString()` (line 214) into the hashed snapshot — using the still-in-memory, not-yet-round-tripped timestamp.
- The confirm/pay step runs later as a **separate** `@Transactional` call, `InvestorActionService.confirmPurchaseForOrder` (`InvestorActionService.java:118-124`), which reloads the order fresh via `orderRepository.findById` — a new Hibernate session, so Postgres now returns the `timestamptz` value UTC-normalized at microsecond precision.
- `submitPurchaseForPayment` (`InvestorActionService.java:710-712`) recomputes the hash from this freshly-loaded order and passes it to `TransactionApprovalService.assertApprovedAndConsume` (`TransactionApprovalService.java:474-497`), which rejects on any hash mismatch (line 494-497) — this is the exact snapshot-hash/timestamp fingerprint mismatch the compliance review described. Nothing in the migrations (up through `V86`) or in this code normalizes the timestamp before hashing.
- Per the report's own severity note, this is masked in the shipped UI (self-serve investing is routed away there) but is live and reachable on the authenticated API surface — i.e., precisely the path v2 plans to build the investor self-buy flow on.

**(b) Full redemption of a derived/estimated holding — confirmed still 100% refused after 2FA**

- `OrderService.createRedemptionDraft` deliberately allows a **full** redemption draft against an estimated holding: the guard `if (!fullRedemption && order.hasEstimatedUnits())` (`OrderService.java:1425-1436`) only blocks *partial* exits — full exits pass through with no check.
- `OrderService.submitRedemptionToProvider` (`OrderService.java:1840-1915`) then unconditionally refuses any estimated holding at submit time: `if (order.hasEstimatedUnits())` (line 1880-1892) throws `IllegalStateException`, and this check is placed **before** `transactionApprovalService.assertApprovedAndConsume` (line 1894-1897).
- The controller (`InvestorPortalController.java:895-920`) calls `transactionApprovalService.approve(...)` (line 903, which records consent and flips the challenge to APPROVED) and only then calls `submitRedemptionToProvider` (line 916). Since the estimated-units guard throws before the challenge is ever consumed, the challenge is left permanently `APPROVED` but never `CONSUMED` — the exact "stranded draft" behavior the review documented — and the caller has no try/catch to mark the record terminal or free the blocked units.
- The code's own comments confirm this is by design and unresolved: "Hence the refusal stands unchanged" (`OrderService.java:1875-1876`).
- No migration after `V79` (current head is `V86`, files `V80`–`V86` inspected) adds a cancel/terminal-state path for a stranded redemption draft, and `submitRedemptionToProvider` has exactly one caller in the codebase — the controller above — with no compensating logic.
- Since real full-holding units only ever originate as `hasEstimatedUnits()=true` until the provider confirms allotment (`units_source` flips to `PROVIDER`), any full exit of such a holding is refused by construction, exactly as the report states: "one hundred per cent of the time."

## Caveats

- I did not execute the app or query the live database (read-only per instructions); this is a static-code confirmation that the code paths described on 2026-09-03 are unchanged at today's HEAD, not a fresh end-to-end reproduction.
- I did not diff against the exact commit (`a788a75`) cited in the report; confirmation is based on current file contents and the absence of any later migration/code addressing either defect.
- It's possible a narrow subset of holdings (units already provider-confirmed) can fully redeem successfully — the bug is scoped specifically to *derived/estimated* holdings, as the report states.

## G8: What does the full, current-as-of-2026-09-25 SEBI/AMFI compliance scorecard look like, given the last full 11-item review is dated 2026-09-03 (0 PASS/8 PARTIAL/3 FAIL) and only the three Cybrilla-specific items (identity docs, KYC blocking, OTP-only login) were re-verified on 2026-09-24 on an uncommitted branch?

## Direct answer

No unified 11-item scorecard exists for 2026-09-25: the last **committed, documented** verdict is still the 2026-09-03 review (0 PASS / 8 PARTIAL / 3 FAIL), while a much larger — but **uncommitted** — re-verification on 2026-09-24 covers three *different* named items (Cybrilla ITEM1 = identity-document purge, ITEM2 = KYC blocking matrix, ITEM3 = OTP-only investor login) with ~200+ automated/manual checks across 14 modules, only 1 of which failed (low severity); it does **not** re-grade the original 11-item checklist and leaves the other 8 items (including the T&C hard FAIL and the 9 hardcoded compliance attributes) exactly as they stood on 2026-09-03.

## Evidence

**Baseline (committed, dated):** `C:\Users\pc\Desktop\WeathTech_v2\docs\superpowers\COMPLIANCE-REVIEW-2026-09-03.md:26-44` — verdict table: items 1,2,7,10 PARTIAL/unchanged; 3,4,5,6 PARTIAL/improved; 8 FAIL (T&C — "unchanged code, verdict corrected"); 9 FAIL (redemption disclosure, under shipped flag); 11 FAIL (auto-populated defaults, 9 hardcoded attributes: `:244-260`). Prepared against backend commit `a788a75` / frontend `9f57245` (`:410`).

**2026-09-24 re-verification scope is far larger than "three items re-verified":** `C:\Users\pc\Desktop\WeathTech_v2\cybrilla-test-run-2026-09-24\report\results\` contains 14 module files (M1-M4, U1-U5, R1, F1, G1-G3), each tagged `"cybrilla_items": ["ITEM1","ITEM2","ITEM3", ...]`. Across all 14 files, grep for `"status"` shows 202 total check results with exactly **one FAIL** (`M4-api-security-contract.json:372`, check M4-27 — concurrent identity-check requests aren't deduplicated, rated LOW severity, mitigated by UI in-flight guard + rate limiter). M4's own summary: `M4-api-security-contract.json:396-408` — passCount 26, failCount 1.

**Uncommitted branch confirmed:** `cybrilla-test-run-2026-09-24\evidence\M2-backend-suite\git-status-test-tree.txt:1` — "repo C:/Users/pc/Desktop/WeathTech_v2/investor, branch feat/cybrilla-review-onboarding, HEAD b250f43" with 9 modified + 7 untracked test files. `M1-db-migrations-static.json:251` (check M1-19): "Backend … 49 paths … Frontend: 38 paths … **Both repos are on branch feat/cybrilla-review-onboarding, uncommitted**." This directly confirms the harness's premise: the 09-24 work sits on an uncommitted branch in both the `investor` backend repo and the frontend repo, never merged to whatever branch the 09-03 report's commits (`a788a75`/`9f57245`) sit on.

**What ITEM1/ITEM2/ITEM3 actually are** (not identical to checklist items 1-11): `U2-wizard-no-documents.json:3` "Item 1" = wizard completion without any document step; `U1-basic-info-pan-kyc.json:3` "Item 2" = PAN/name/DOB/KYC verified on Basic Info page; `U3-investor-approve-otp-login.json:3` "Item 3" = investor signs in with email+OTP only. These are a distinct Cybrilla-onboarding-redesign checklist (identity-document purge, KYC-blocking rules, OTP-only login), not a re-grade of the 09-03 report's items 1-11.

## Caveats

1. **No composite scorecard for the full 11 items exists post-09-03.** The 09-24 run never touches items 8 (T&C — hard FAIL), 9 (redemption disclosure — FAIL), 11 (auto-populated defaults — FAIL, 9 hardcoded attributes), or the flag-dependent behavior in §6 of the 09-03 report.
2. **The near-clean 09-24 result (only 1 low-severity FAIL) is not battle-tested by the same adversarial methodology** the 09-03 report used (three prior claimed-fixes were later found not to hold, per §3 of that report) — no equivalent "claims that do not hold" audit exists yet for the 09-24 work.
3. **Uncommitted = not in any deployable artifact.** 49 backend + 38 frontend changed paths (`M1-db-migrations-static.json:251`) are sitting only in the working tree on `feat/cybrilla-review-onboarding`; nothing here changes what ships until merged, and no merge/PR evidence was found.
4. Even if merged, ITEM1-3 improvements would likely move some of the 09-03 items (plausibly 1, 3) toward PASS, but the mapping is inferred, not stated by either document — no source explicitly reconciles the two checklists.
5. `not found`: no file reconciles 2026-09-24 results against the 2026-09-03 checklist numbering; no evidence of a commit or PR merging `feat/cybrilla-review-onboarding`.

## G9: How will v2 implement a first-class admin/back-office (internal ops) identity and authorization model, given today ADMIN is merely a DistributorRole enum value riding on the distributors table, and the public signup endpoint may allow a client to self-request role=ADMIN with no server-side restriction found?

I have sufficient evidence now.

## Answer

**Direct answer:** v1 has no dedicated admin identity model — ADMIN is one `DistributorRole` enum value on the `distributors` table, gated only by `status = APPROVED`; the public `/api/v1/auth/signup` endpoint accepts a client-supplied `role` field (including `ADMIN`) with no server-side allow-list, so v2 must design a real, separate back-office identity/authorization system (distinct principal type, roles/permissions table, admin-only provisioning flow) before the distributor table can be dropped, and this un-gated role field should be patched even in v1.

### Evidence

- **Unrestricted role on public signup:** `AuthSignupRequest.role()` is a plain client-settable field — `dto/AuthSignupRequest.java:23` (`DistributorRole role`). `AuthController.java:81-83` maps `POST /api/v1/auth/signup` to `authService.signup(request)`, and this route is `permitAll()` in `SecurityConfig.java:73` (`"/api/v1/auth/**"`).
- **Role assignment has no allow-list check:** `AuthService.java:77` — `DistributorRole role = request.role() == null ? DistributorRole.SUB_DISTRIBUTOR : request.role();` then `distributor.setRole(role)` at `AuthService.java:90`. Nothing rejects `role = ADMIN`. Identical pattern in the separate distributor-signup path: `DistributorService.java:78` — `DistributorRole role = request.role() == null ? DistributorRole.SUB_DISTRIBUTOR : request.role();`.
- **ADMIN is a bare enum value, not a real principal type:** `domain/DistributorRole.java:3-7` — `ADMIN, MASTER_DISTRIBUTOR, SUB_DISTRIBUTOR`. Admin-ness is derived purely from this column on the same `distributors` table used for business-facing distributor accounts (`CustomUserDetailsService.java:29-31`, `JwtAuthFilter.java:110-114` both do `ROLE_ + role.name()` and special-case `role != ADMIN` to also grant `ROLE_DISTRIBUTOR`).
- **The only real guardrail is manual approval, gated by a pre-existing admin (bootstrap gap):** New accounts start `PENDING_APPROVAL` (`AuthService.java:93`), and `login()`/`otpLogin()` reject anyone not `APPROVED` (`AuthService.java:177-179`, `214-216`). The only endpoint that flips status is `PATCH /api/v1/distributors/{id}/status`, itself locked to `@PreAuthorize("hasRole('ADMIN')")` (`controller/DistributorController.java:86-94`). So self-requesting `role=ADMIN` cannot immediately log in — but nothing at approval time re-validates that the requested role is appropriate; approval is a status flip, not a role review gate.
- **No seeded bootstrap admin exists:** `V3__seed_data.sql:10-35` seeds two demo accounts, both `role = 'MASTER_DISTRIBUTOR'` (`alice@example.com`, `a@a.com`); no row anywhere in `db/migration` sets `role = 'ADMIN'`. That means today's only path to a first admin is direct DB manipulation — there is no in-app admin identity provisioning mechanism at all.
- **ADMIN is pervasively load-bearing across the app** via `hasRole('ADMIN')`/`hasAnyRole('ADMIN', ...)` on `DistributorController.java:34,86,96`, `CybrillaDirectController.java:23`, `AuditController.java:37`, `OrderController.java:154`, `LeadController.java:49,132`, `NavAdminController.java:39`, `InvestorController.java:437,812`, plus service-level `role == DistributorRole.ADMIN` branches in `DistributorService.java:44,60`, `InvestorService.java:357,424,453,467,2569,2723`, `LeadService.java` (multiple), `OrderService.java:128,155,427`, `InvestorKycService.java:1567`, `InvestorDocumentService.java:260` — i.e., dozens of authorization decisions across the codebase key off this one enum value on the distributor row.

### Caveats
- Exploiting the role field alone does not grant working ADMIN access today because login is blocked until `APPROVED`, and only an existing ADMIN can approve (chicken-and-egg) — but this is a fragile, undocumented mitigation, not a designed control; a careless/social-engineered approval, a DB-console mistake, or any future change to the approval workflow would turn it into a live privilege escalation.
- `DistributorSignupRequest` (separate from `AuthSignupRequest`) has the identical unrestricted-role pattern (`DistributorService.java:78`) and was not separately checked for its own SecurityConfig exposure — worth confirming which controller route serves it and whether it's also `permitAll`.
- No `AdminUser`/back-office table, permission table, or RBAC scaffolding was found anywhere in `domain/`, `repository/`, or `db/migration/` — v2's back-office model is a greenfield design, not a migration of existing structure.

## G10: How will the v2 dashboard compute 'active SIP count' and allocation-by-category, given no investor-scoped implementation of either exists today (SipDashboardDto/DashboardService.getSipDashboard is distributor-scoped only; AllocationDonut groups by scheme name client-side, not category)?

## Direct Answer

Neither exists server-side today: **active-SIP count** has a working formula only in the distributor-scoped `DashboardService.getSipDashboard` (filters `OrderStatus.ACTIVE`/`PROCESSING`), which would need to be re-scoped from `distributorId` to `investorId`; **allocation-by-category** cannot be computed from the schema as-is because `product_schemes.category` is only a coarse MF/SIF/OTHER asset-class enum, not a real fund-category taxonomy (Equity/Debt/Hybrid/ELSS) — so category allocation is net-new schema + backend work, not just a new endpoint.

## Evidence

**Active SIP count (distributor-scoped, reusable pattern):**
- `DashboardService.java:64-71` — `ESTABLISHED_SIP_STATUSES` (ACTIVE, SUCCESSFUL, COMPLETED, PAUSED, FAILED, CANCELLED) vs `PENDING_SETUP_STATUSES:73-81` (in-flight mandate/payment, not yet live).
- `DashboardService.java:131-141` — `getSipDashboard(UUID distributorId)` queries `orderRepository.findByDistributorIdAndTransactionType(distributorId, TransactionType.SIP)` — hard-scoped to distributor, no investor variant exists.
- `DashboardService.java:378-390` — `sipStatusCounts` groups by `OrderStatus` via `countByDistributorIdAndTransactionTypeGroupedByOrderStatus`, again distributor-keyed; the closest thing to a canonical "Active SIPs" count (`SIP_STATUS_LABEL` maps `ACTIVE`/`PROCESSING` → "Active SIPs", `DashboardService.java:40-47`).
- `DashboardController.java:62-69` — only endpoint is `GET /api/v1/dashboard/distributor/{distributorId}/sips`, gated by `assertDistributorAccess` (`DashboardController.java:129-139`). No investor-scoped SIP-count endpoint exists.
- `InvestorDashboardResponse.java:21-23, 89-103` — the actual investor dashboard DTO (`DashboardTotals`) has no SIP-count field at all (`totalInvested`, `totalCurrentValue`, `portfolioXirr`, `valuedHoldings`/`totalHoldings` only — the latter counts *holdings*, not SIPs).
- `HomeScreen.tsx:1-268` — confirmed no active-SIP count is rendered anywhere; the "Your plans" `ActionCard` (`HomeScreen.tsx:157`) just links to `${BASE}/plans` with no count badge, unlike the Approvals badge (`HomeScreen.tsx:153-155`) which sums `pending.length + unpaid.length`.

**Allocation by category (no server or real taxonomy):**
- `ProductScheme.java:20-22` — `category` field is `@Enumerated(EnumType.STRING) private ProductCategory category;`.
- `ProductCategory.java:3-9` — enum values are `MF, SIF, OTHER, MUTUAL_FUND, EQUITY` — an asset-class/product-type marker, not a Groww/Kuvera-style fund category (no Equity-Large-Cap, Debt-Liquid, Hybrid, ELSS, etc.).
- `HoldingsService.java:445` (`resolveCategory`) and `DashboardService.java:225-232` (`toSipItem`) both collapse this enum down to a binary `"MF"` vs `"SIF"` string — confirming the only "category" concept anywhere in the backend is this MF/SIF split, reused identically in both distributor SIP items and investor holdings.
- `InvestorDashboardResponse.java:66-70` (`DashboardHolding.category`) — the investor holdings DTO *does* carry a `category` string per holding, but it's sourced from the same coarse `resolveCategory` (MF/SIF), not a true fund category.
- `AllocationDonut.tsx:7, 10-12` — `AllocSlice { name: string; value: number }`, no category field at all; it's a generic pie renderer, agnostic to grouping key.
- `HomeScreen.tsx:56-60` — `alloc` is built as `holdings.map(h => ({ name: h.schemeName || h.scheme || 'Fund', value: h.currentValue }))` — explicitly grouped by **scheme name**, client-side, confirming the WHERE-TO-LOOK claim exactly.
- `ProductController.java:65, ProductService.java:606-613` (`parseCategory`, `filterLiveSchemes`) — the `category` query param on `/api/v1/products/schemes` also just filters on the same `ProductCategory` enum (MF/SIF), reinforcing that no richer taxonomy exists anywhere in the codebase, including the Cybrilla catalogue sync path (`RealCybrillaClient.java:3223`, `ProductService.java:356` only stash NAV/returns metadata JSON, not a category taxonomy).

## Caveats
- `metadataJson` on `ProductScheme` (`ProductScheme.java:30`) does carry free-form JSON with `risk`/`returns` for mock data (`MockCybrillaClient.java:530-548`), but no `category`/`assetClass` sub-taxonomy was found in any parsed metadata field — worth re-checking `RealCybrillaClient.buildSchemeMetadata` output against a live Cybrilla catalogue response, which wasn't fetched in this pass (would require live API access, out of scope for read-only static review).
- Did not check the `investor/plans` screen/endpoint (`${BASE}/plans`) for any existing active/paused SIP list that a count could be trivially derived from without new backend work — flagged as a fast follow-up for whoever owns the SIP-list slice.
- "Active" semantics are ambiguous even in the existing distributor code: `SIP_STATUS_LABEL` groups both `ACTIVE` and `PROCESSING` order-statuses under "Active SIPs" (`DashboardService.java:41-42`), while `SIP_ITEM_STATUS` labels `PROCESSING` as "Pending" per-row (`DashboardService.java:86`) — v2 needs one authoritative definition before implementation, not two conflicting ones inherited from v1.

## C1: Does a working investor-initiated self-serve purchase/SIP flow already exist end-to-end in the backend (be-transactions report: OrderService.createOrderAsInvestor + InvestorPortalController.approve is 'essentially the finished v2 confirm-and-pay flow already'), or is self-serve investing simply not offered/not built (fe-investor-ux/fe-platform: 'Self-serve investing is not offered — the advisor invests, the investor approves', no purchase UI or endpoint found in v2-ui), and is the investor-originated purchase path in fact broken (docs-compliance: 2FA approval on this exact path 'always fails' due to a snapshot-hash/timestamp fingerprint mismatch)?

## Direct answer

**All three characterizations are true simultaneously and are not contradictory**: the backend self-serve purchase endpoint exists and is functionally wired (`createOrderAsInvestor` → 2FA challenge → `approve`), but the frontend deliberately routes investors away from it (self-serve investing is "not offered" in the UI), and on the rare path where it *is* reachable (direct API call), the 2FA approval step is provably broken by a timestamp/fingerprint mismatch — so it is neither "essentially finished" nor safely fixable-in-place; it is backend-only, unreachable in the shipped app, and self-defeating when invoked directly.

## Evidence

**Backend endpoint exists and is wired for 2FA:**
- `OrderService.java:578-608` — `createOrderAsInvestor(UUID investorId, InvestorOrderRequest req)` creates the order via `createOrder(...)` then calls `transactionApprovalService.createChallenge(...)` (line 606) so the investor must approve via OTP before payment — same gate as the distributor flow.
- `InvestorPortalController.java:889-937` — `approve()` verifies OTP/consent (line 903-904), then drives `confirmPurchaseForOrder`/`startSipMandateForOrder`/`submitRedemptionToProvider` depending on transaction type (lines 915-935).

**Frontend does not expose it — "not offered" is accurate:**
- `investor-frontend/src/views/InvestorInvest.tsx:34` exists (`export default function InvestorInvest()`) but a repo-wide grep shows it is imported/referenced nowhere except its own definition and one unrelated styling comment in `InvestorNominees.tsx:13` — it is dead/orphaned code, not reachable from any route.
- `investor-frontend/src/App.tsx:236-237`:
  ```
  {/* Self-serve investing is not offered — the advisor invests, the investor approves. */}
  <Route path="/investor/invest" element={<Navigate to="/investor/luxe-v2/home" replace />} />
  ```
  The `/investor/invest` route is a permanent redirect to the dashboard home — no purchase UI is reachable in the shipped SPA.

**The path is broken by design when hit directly (confirms "always fails"):**
- `docs/superpowers/COMPLIANCE-REVIEW-2026-09-03.md` Item 5 (lines 130-134): *"A purchase placed through the investor's own endpoint can never pass its own gate. The order and its approval challenge are created inside one transaction, so the snapshot freezes an in-memory timestamp at nanosecond precision with a local offset. PostgreSQL stores microseconds and returns UTC. The gate recomputes the fingerprint from a freshly loaded order and therefore always sees a different value, and refuses — after the investor has already entered the one-time code and consented."* It further notes severity is "medium-high rather than high" specifically *because* "the shipped frontend deliberately routes self-serve investing away, so today's exposure is the authenticated API surface" — directly corroborating that this bug is currently masked by the UI's redirect, not fixed.
- Compounding failure (lines 134, §4.4): the refusal is swallowed and reported as HTTP 200 success — the client renders "Investment authorised — One last step, complete the payment to finish" with a Pay button leading to a dead end.
- Root cause is architectural (in-transaction snapshot vs. DB round-trip timestamp precision/timezone mismatch), not a one-line fix — it's the same code path used by the distributor flow's `createChallenge`, but the distributor flow avoids it because it re-reads the order from DB before freezing the snapshot, while `createOrderAsInvestor` does not.

## Caveats

- This is a same-transaction fingerprinting bug specific to the investor-self path (`createOrderAsInvestor`); the distributor-originated order+approval flow does not exhibit it because it re-reads the order (per the compliance doc's own explanation of why it's the "only such outlier").
- The compliance report is dated 2026-09-03; no later remediation commit was found in the reviewed files as of 2026-09-25, and `InvestorInvest.tsx` remains unrouted, so nothing indicates the gap has since been closed.
- "Fails closed" (line 132: "it fails closed — no money moves") — so the bug is safe but blocking, not silently permissive.
- v2 scope implication: this is *not* "fix a mostly-working flow" nor "build from zero" — it is closer to "un-hide a backend that mostly works, then fix a real (if narrow) timestamp-precision bug in the 2FA snapshot/fingerprint logic before exposing it," plus build the entire missing self-serve purchase/SIP UI (browse catalogue, buy/SIP forms, confirm-and-pay screens) since `InvestorInvest.tsx` is dead scaffolding, not a working screen.

## C2: Should v2's nominee feature cap allocation at 3 nominees (current code, NominationRules.MAX_NOMINEES=3, confirmed live) or support up to 10 nominees with mandatory personal declaration per SEBI's rule reportedly effective 2025-03-01 (research-domain-b2c report, sourced from secondary news coverage, not a primary SEBI circular)?

## Direct Answer
V2 should support **up to 10 nominees with mandatory personal declaration**; the current code's cap of 3 (`NominationRules.MAX_NOMINEES = 3`) reflects the pre-2025 SEBI rule and is now stale/non-compliant.

## Evidence

**Current code (verified live):**
- `C:\Users\pc\Desktop\WeathTech_v2\investor\platiziowealthtech-Back_end\src\main\java\com\platizio\wealthtech\service\NominationRules.java:25` — `public static final int MAX_NOMINEES = 3;`
- Enforced at `NominationRules.java:56-60` (`validateCap`, throws if `nomineeCount > MAX_NOMINEES`) and consumed by both write paths per the class javadoc at `NominationRules.java:12-17` (distributor path `InvestorService.replaceNominees` and investor self-service path `NomineeService`).
- Exposed to frontend at `InvestorPortalController.java:795` and `InvestorController.java:723` (both pass `NominationRules.MAX_NOMINEES` to the client), and consumed in `investor-frontend\src\utils\nomination.ts:22` (`export const MAX_NOMINEES = 3;`), `investor-frontend\src\api\nominations.ts:246`, `investor-frontend\src\components\InvestorNomineeManager.tsx:180`, `investor-frontend\src\v2-ui\screens\NomineesScreen.tsx:132`. All frontend consumers fall back to this hardcoded `3` when the backend doesn't supply `maxNominees`, so the cap is doubly baked in (backend constant + frontend fallback constant).
- Unit test locking the value: `investor\platiziowealthtech-Back_end\src\test\java\com\platizio\wealthtech\service\NominationRulesTest.java:32` — `assertThat(NominationRules.MAX_NOMINEES).isEqualTo(3);`
- Note the class's own javadoc (`NominationRules.java:9, 146`) references a "compliance review 2026-08-31" and "2026-09-01 SEBI changes" for the guardian-relationship-mandatory rule, showing the team *has* been tracking newer SEBI nomination changes — but the `MAX_NOMINEES=3` constant itself was not updated alongside that review, suggesting this specific cap was missed.

**External (secondary sources, not primary SEBI text — could not be independently verified in this workflow):**
- SEBI circular `SEBI/HO/MIRSD/POD-1/P/CIR/2024/81` dated June 10, 2024 ("Ease of Doing Investments... nomination in demat accounts and mutual fund folios") is the one reported by multiple outlets as raising the cap to 10 nominees, effective **March 1, 2025**, with AMFI/depositories directed to implement by Feb 20, 2025 and confirm nomination-form formats by Mar 15, 2025. Key reported points:
  - Up to 10 nominees per folio/demat account, with percentage allocation per nominee.
  - Nomination must be made **personally by the investor** — explicitly **not permitted via a Power of Attorney (PoA) holder**.
  - One of three personal identifiers required per nominee: PAN, driving licence number, or last 4 digits of Aadhaar (document number only, not the document itself).
  - Existing investors get an opportunity to revise nomination choices once the new rules go live.
  - Sources: [Upstox](https://upstox.com/news/personal-finance/financial-regulations/revised-mutual-fund-and-demat-account-nomination-rules-from-march-1-2025-what-is-new/article-139984/), [Moneylife](https://moneylife.in/article/sebi-allows-up-to-10-nominees-in-mutual-funds-demat-accounts/76086.html), [Business Today](https://www.businesstoday.in/mutual-funds/story/now-mutual-fund-investors-can-add-up-to-10-nominees-check-details-460716-2025-01-14), [5paisa](https://www.5paisa.com/news/sebi-updates-nomination-rules-for-mutual-funds-demat), [Paytm Blog](https://paytm.com/blog/mutual-funds/sebi-new-nomination-rules-2025/), [Wallet4wealth](https://wallet4wealth.com/new-sebi-nomination-rules-from-march-1-2025-a-complete-guide/).
- SEBI's own site lists a related, apparently more recent circular — "Ease of doing investments - Modified Norms for Nomination in Demat Accounts and Mutual Fund Folios" (`sebi.gov.in/legal/circulars/may-2026/...101703.html`) — whose body text I could not extract via WebFetch (page returned only header/metadata; the PDF mirror at barodabnpparibasmf.in also failed to parse as text). This means: (a) the primary June-2024 circular text was not directly read in this session, and (b) there may be an even newer SEBI nomination circular (dated ~May 2026) superseding the 2024 one that the v2 team should check before implementation.

## Caveats
1. The "10 nominees, effective 2025-03-01" fact is sourced entirely from secondary financial-news coverage, not a primary SEBI circular successfully parsed in this session — the primary PDF/HTML fetch attempts both failed to yield extractable text.
2. A SEBI circular page dated "may-2026" on sebi.gov.in suggests a possible further update to nomination norms after the 2024/2025 change; this was not verified and should be checked before v2 build-out, since it could change the cap, identifier requirements, or effective date again.
3. Recommend the team obtain and directly read the primary SEBI PDF (circular `SEBI/HO/MIRSD/POD-1/P/CIR/2024/81` and the 2026-dated one) rather than relying on this secondary-source summary before finalizing v2's `MAX_NOMINEES` value and the mandatory-personal-declaration / PoA-exclusion logic.

## C3: Does removing the distributor layer require zero Cybrilla/FP-side integration change (be-integrations/be-distributor-domain: 'this is a green field... a single platform-level config value... not a per-distributor field'), or does it require a fundamentally new tenant relationship that Cybrilla may not even support (research-domain-b2c: FP's public docs list only ARN and RIA partner types, no Execution-Only-Platform category, and the outbound inquiry asking about this was never confirmed sent or answered)?

**Direct answer:** Removing the distributor layer requires no FP/Cybrilla *schema* change on Platizio's side (tenant identity is one platform-level config value, never a per-distributor field) — but that only proves the code has no distributor-scoped FP wiring to rip out; it does not prove Cybrilla will grant a B2C/self-directed tenant, and the outbound inquiry that would have tested this was never confirmed sent or answered, so the vendor-capability question is genuinely open.

**Evidence — "no per-distributor FP config" (be-integrations/be-distributor-domain side is confirmed):**
- Tenant identity is a single Spring `@ConfigurationProperties(prefix = "finprim")` bean (`tenant.name`/`tenant.id`), not linked to any `Distributor` row: `C:\Users\pc\Desktop\WeathTech_v2\investor\platiziowealthtech-Back_end\src\main\java\com\platizio\wealthtech\integration\auth\FinprimTenantProperties.java:11-15,41-46`.
- The `x-tenant-id` header sent on every FP call comes from that same static config: `RealCybrillaClient.java:54` (`TENANT_HEADER = "x-tenant-id"`) and `RealCybrillaClient.java:2439` (`headers.set(TENANT_HEADER, finprimProperties.tenantHeaderValue())`).
- `Distributor.java` (`C:\Users\pc\Desktop\WeathTech_v2\investor\platiziowealthtech-Back_end\src\main\java\com\platizio\wealthtech\domain\Distributor.java`) has zero references to cybrilla/finprim/tenant (grep returned no matches) — confirmed no per-distributor FP linkage exists to remove.
- `RealCybrillaClient.java` (3,437 lines) has no `arn_code`/`broker_code`/`euin`/distributor-id field in any investor-profile, bank-account, or order payload — confirmed by full-file grep (only 2 unrelated comment hits at lines 3228/3242 and 2888). ARN validation (`integration/arn/ArnValidationClient.java`) is a wholly separate AMFI/KYD lookup used only for distributor onboarding, never wired into `RealCybrillaClient`.
- `docs\cybrilla-credentials-and-network-report.md:13-14,59` confirms the tenant `platizio` is a single platform-wide identity ("`x-tenant-id: platizio` on all FP `/v2/...` calls"), and it is currently **not even provisioned on production** ("Realm does not exist").

**Evidence — the vendor-side (tenant model / license category) question is unresolved:**
- `docs\cybrilla-production-inquiry-email.md` is a **template, never customized**: signature block still reads `[Your name] / [Your role] / [Company] / [Phone] / [Email]` (lines 119-124), and its stated use case is explicitly the old model: "Distributor portal — investor onboarding... via Cybrilla POA" (line 114). No send date, no message-id, no reply text anywhere in the file or the adjacent `cybrilla-support-email-draft.md`/`cybrilla-demo-support-email.md` docs.
- `docs\runbooks\cybrilla-review-2026-09.md:198` references only a compliance-purge reply topic, not a tenant-model reply.
- Live external check (2026-09-25) of `docs.fintechprimitives.com/going-live/licenses` confirms the vendor's public partner taxonomy is exactly two categories: **ARN** (AMFI-registered distributor, "work as an agent to AMC") and **RIA** (SEBI-registered adviser, "work for the investor") — no "Execution-Only Platform" or generic self-directed-B2C category is documented.

**Caveats:**
- Absence of a distinct "EOP" category in FP's public docs is not proof FP *cannot* support B2C: SEBI's Execution-Only Platform framework (SEBI/HO/IMD/DF2/CIR/P/2021/577) is layered on top of an ARN or RIA registration, not a separate license type — so Platizio *becoming* the ARN (or RIA) holder itself, rather than a distributor, might map cleanly onto FP's existing ARN tenant model. This is inference, not confirmed by any doc in-repo or by Cybrilla.
- No file in the repo shows Cybrilla was ever asked, in writing, "can our tenant convert from distributor-mediated to investor-self-directed consent, with Platizio as the ARN/RIA holder of record instead of pass-through distributors?" — that specific question appears never posed.
- Conclusion: the "zero FP schema change" claim is narrowly true (code-level) but does not resolve the tenant/license-relationship question; that remains an open vendor-confirmation item that should be a named workstream (or risk) in the v2 plan, not an implicit given.

## C4: Is the platform's target v2 regulatory posture 'keep the existing AMFI ARN registration and transact direct-plan-only at zero commission' (research-domain-b2c's recommended default 'Option A'), or does the removal of the distributor layer implicitly require re-registering as an SEBI Execution-Only-Platform or RIA — and has this business decision actually been made by anyone, or is it still open?

No matches for "Execution-Only", "RIA registration decision", or "zero commission" anywhere in the workspace — confirming this specific regulatory-model decision is not addressed in code or docs. I have sufficient evidence to answer.

## Direct answer
**Still open — no ratified decision found anywhere in the codebase.** The repo contains zero evidence that "keep-ARN, direct-plan-only, zero-commission" (Option A) or any SEBI Execution-Only-Platform (EOP)/RIA re-registration path has been chosen; the "research-domain-b2c" report referenced in the task brief does not exist anywhere under `C:\Users\pc\Desktop\WeathTech_v2` (searched by filename and by content for "Option A/B/C/D" — not found), so its "Options A-D" framing could not be verified either — it is being treated here as an unconfirmed external reference, not codebase evidence.

## Evidence

**1. ARN is validated only at distributor signup, never per order or per investor.**
- `AuthService.java:62-75` — signup checks `distributorRepository.existsByArnNumber(...)` and calls `arnValidationService.validate(request.arnNumber())` before creating a *distributor* account.
- `AuthService.java:113-146` (`requireVerifiedArn`, `applyArnValidation`) — persists ARN/KYD status onto the `Distributor` entity only.
- A codebase-wide grep for `arnNumber|ARN` across `src/main/java` returns 27 files, all confined to `service/AuthService.java`, `service/DistributorService.java`, `service/ArnValidationService.java`, `domain/Distributor.java`, `integration/arn/*`, `dto/Distributor*`, `dto/ArnValidation*`, `validation/ArnFormat.java`, and `repository/DistributorRepository.java`. **`OrderService.java` is absent from this list** — confirmed directly: a targeted grep of `OrderService.java` for ARN/plan-type terms returns zero ARN hits, only unrelated matches for the word "trail" (audit trail) and "Direct status write" (a status field, not a plan type).

**2. No commission, brokerage, or plan-type (direct vs. regular) logic exists in code anywhere.**
- Grep for `planType|PlanType` across all of `src/main/java` → **no files found**.
- Grep for `commissionRate|brokerage|trail\b` (commission-adjacent terms) across the codebase → only false-positive matches on the English word "trail" in "audit trail" comments (e.g., `OrderService.java:916,1107,1162`; `AuditService.java:31`).
- `integration/nav/StubNavFeedClient.java:62-88` shows the stub NAV feed carries **both** "Direct Plan" and "Regular Plan" schemes (e.g., line 62 `Stub Corporate Bond Fund - Direct Plan - Growth` vs. line 68 `Stub Liquid Fund - Regular Plan - Growth`) with no filtering logic anywhere selecting one over the other — i.e., the system is plan-type-agnostic today, not hard-wired to direct-only.

**3. Product framing still describes the current (v1) distributor/RIA model, with no v2 regulatory note.**
- `investor/platiziowealthtech-Back_end/context.md:166-171` (last updated 2026-06-23): *"Platizio Wealthtech is a **mutual-fund distribution platform** for distributors/RIAs in India. It lets a distributor onboard investors ... and place lumpsum purchases, redemptions, and SIPs on behalf of investors."*

**4. No SEBI EOP/RIA re-registration discussion exists in any doc.**
- Grep for `Execution.Only|EOP|Registered Investment Adviser|zero.commission` across the entire `WeathTech_v2` tree → no substantive hits (only unrelated matches like "nominate" and a graphify report node named `getOptimisedAppearId`).
- SEBI is discussed extensively in `flaws.md`, `E2E_TEST_REPORT.md`, and `docs/investor-document-upload-guide.md`, but exclusively re: per-transaction 2FA (SEBI circular SEBI/HO/IMD/IMD-IDOF1/P/CIR/2022/132) and nomination opt-out — never re: distributor/EOP/RIA registration category.
- No `research-domain-b2c` file, and no `PHASE2_PLAN.md`/`plan.md`/`TEAM_HANDOFF.md` line addresses the ARN-retention-vs-EOP/RIA question.

## Caveats
- The "research-domain-b2c report §2 Options A-D" cited in the task brief could not be located in the filesystem under any searched path; its existence/content is unverified from this codebase alone (it may be an artifact of another parallel analyst's in-progress or out-of-repo work).
- Absence of code/doc evidence for a decision is not proof no verbal/offline business decision exists — only that it is not recorded anywhere in this repository, which is the authoritative source available for this analysis.
- Files: `C:\Users\pc\Desktop\WeathTech_v2\investor\platiziowealthtech-Back_end\src\main\java\com\platizio\wealthtech\service\AuthService.java`, `...\service\ArnValidationService.java`, `...\service\OrderService.java`, `...\integration\nav\StubNavFeedClient.java`, `...\context.md`.

## C5: Is the current codebase's overall posture 'solid, compliance-driven security' (be-platform-auth: CSRF/CSP/rate-limiting/fail-closed guards described as 'compliance-driven and profile-aware', 'security posture is solid') or is it a platform with 3 hard regulatory FAILs and 0 full PASSes out of 11 SEBI/AMFI checklist items as of the most recent full review (docs-compliance: T&C acceptance FAIL, redemption disclosure FAIL, no-auto-populated-defaults FAIL, 0/11 PASS)?

I now have solid, directly-cited evidence for the docs-compliance side (§1 verdict table and §2 item detail confirming 0 PASS / 8 PARTIAL / 3 FAIL, with items 8, 9, 11 as the three FAILs). I have independently spot-checked the codebase and found real auth/security controls (SecurityConfig, LoginRateLimitFilter, IdentityCheckThrottle) exist, which is consistent with — but does not contradict — the compliance report's separate finding of regulatory-content failures. This is enough to answer precisely.

## Direct answer

**Both are true and they are not in conflict — they measure different things.** The codebase can simultaneously have a defensible application/infrastructure security layer (CSRF/CSP/rate-limiting/fail-closed guards) **and** fail regulatory-content compliance on 3 of 11 SEBI/AMFI checklist items with 0 full PASSes, because "security architecture" (auth, session, request-hardening) and "SEBI/AMFI compliance" (consent text, disclosures, defaults) are orthogonal axes tested by different reviews.

## Evidence

**docs-compliance (`C:\Users\pc\Desktop\WeathTech_v2\docs\superpowers\COMPLIANCE-REVIEW-2026-09-03.md`) — the most recent full review, dated 2026-09-03:**
- §1 verdict table, lines 28-42: 11 items scored, **0 PASS, 8 PARTIAL, 3 FAIL** ("Totals: 0 PASS, 8 PARTIAL, 3 FAIL"). Nothing has reached PASS in either the 08-31 or 09-03 review (line 44: "Nothing in this system has yet earned a clean PASS on any of the eleven checklist points, in either review.").
- The 3 FAILs, confirmed by item detail:
  - Item 8, Terms & Conditions acceptance — FAIL, line 188/202: "No Terms & Conditions artefact exists anywhere in either repository... the person bound by it provably cannot read it. That is a FAIL."
  - Item 9, Redemption screen disclosure — FAIL, line 208/212: under the **shipped** config (not the demo-flag-on config the prior review used), the investor's authorisation panel shows no folio/units/value.
  - Item 11, No auto-populated defaults — FAIL, lines 244-262: 9 compliance attributes (gender, occupation, income slab, PEP status, etc.) are filed as blanket constants to the registrar; 48/48 live profile-creation calls carried all nine constants; real falsified filings continued through 2026-09-01.

**be-platform-auth axis (application/infra security):** I independently confirmed real, non-trivial security scaffolding exists in the backend — `investor\platiziowealthtech-Back_end\src\main\java\com\platizio\wealthtech\config\SecurityConfig.java`, `config\LoginRateLimitFilter.java`, and `service\IdentityCheckThrottle.java` — consistent with a claim of CSRF/CSP/rate-limiting/fail-closed controls existing in the codebase (e.g., the mobile-OTP bypass guard is independently verified fail-closed in the compliance report itself: COMPLIANCE-REVIEW-2026-09-03.md:96, "fails closed: with no provider and no code configured, every verification attempt is refused... it died in the guard's constructor with 'The local profile was DEFAULTED, not chosen'").

So the security-architecture claim and the regulatory-compliance FAIL count are **describing different layers of the same codebase** — one about how requests/sessions/auth are hardened, the other about whether SEBI/AMFI-mandated disclosures, consents and non-default-data rules are actually met on screen and in the database.

## Caveats

- I could not locate a standalone "be-platform-auth" report file in the workspace to cite its §1 directly (searches for its characteristic phrases and filename patterns returned no results); its claims here are inferred from the sibling analyst's slice description in the task plus my own direct source verification of the relevant security files. If the orchestrator has that report elsewhere, it should be checked directly for line-level citations of its "solid" characterization.
- "Solid security posture" being true does not offset the compliance FAILs — even the auth report's own supporting evidence (the mobile-OTP fail-closed guard) sits inside an item (Item 3, mobile verification) that the compliance review still grades only PARTIAL, not PASS, because the underlying control (no SMS provider, thin self-declaration) is still missing.
- The 3-FAIL/0-PASS count is specifically from the 2026-09-03 re-assessment; the 2026-08-31 predecessor scored 0 PASS/9 PARTIAL/2 FAIL (line 4), so the FAIL count moved from 2 to 3 due to verdict corrections on unchanged code (items 8 and 9), not new regressions — this distinction matters for anyone citing "improvement" without checking which report generation they mean.
- For v2 planning: treat "security architecture is solid" and "regulatory content compliance has 0 PASSes" as two separate gating checklists — closing Items 8, 9, 11 (T&C artefact, redemption disclosure under shipped config, and the 9 hardcoded registrar-filing defaults) is a prerequisite for a wider B2C launch regardless of how strong the CSRF/CSP/rate-limit layer is.

## C6: Which existing screens should be the primary reference for building v2's self-serve buy/SIP/redeem UI — the distributor console's InvestorTransaction.tsx/InvestorRedeem.tsx wizards (fe-distributor-console report treats these as reusable step-content templates), or the already-built-but-unreachable investor-facing InvestorInvest.tsx/InvestorWithdrawal.tsx self-service screens that fe-investor-ux/fe-distributor-console both separately flag as 'the closest existing analogue to v2... should be treated as primary reference, not the distributor screens'?

No matter — I have sufficient direct evidence from the code itself.

## Direct answer

Use **`InvestorInvest.tsx` / `InvestorWithdrawal.tsx`** (investor-frontend) as the primary reference — not the distributor-console's `InvestorTransaction.tsx`/`InvestorRedeem.tsx`. Both reports are correct.

## Evidence

**1. InvestorInvest.tsx / InvestorWithdrawal.tsx are self-service and match the *live* v1 backend API exactly** (they are not stale):

- `InvestorInvest.tsx:6-13` — calls `GET /investor/schemes`, `POST /investor/orders`, `POST /investor/bank-accounts` directly as the logged-in investor (no `investorId` param, no distributor).
- `InvestorWithdrawal.tsx:133,201,224` — calls `GET /investor/holdings`, `POST /investor/withdrawals/self`, `POST /investor/withdrawals/request-to-distributor`.
- All of these routes exist, live, on the backend under `@RequestMapping("/api/v1/investor")` in `investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/controller/InvestorPortalController.java:107` — confirmed matches: `@GetMapping("/schemes")` (line 835), `@PostMapping("/orders")` (line 848), `@PostMapping("/bank-accounts")`/`@GetMapping("/bank-accounts")` (lines 469, 476), `@GetMapping("/holdings")` (line 943), `@PostMapping("/withdrawals/request-to-distributor")` (line 977), `@PostMapping("/withdrawals/self")` (line 995).
- This is strong, independent confirmation (not just report assertion) that the screens are wired to real, current, self-service backend contracts — they are functionally correct against today's backend, just orphaned from routing.

**2. They are unreachable only by routing, not broken/stale code** — `investor-frontend/src/App.tsx:236-237`:
```
{/* Self-serve investing is not offered — the advisor invests, the investor approves. */}
<Route path="/investor/invest" element={<Navigate to="/investor/luxe-v2/home" replace />} />
```
and `App.tsx:240` similarly redirects `/investor/withdrawals` away. Neither `InvestorInvest` nor `InvestorWithdrawal` appears anywhere in `App.tsx`'s lazy-import list (lines 41-80) — they are dead code by routing decision, not by defect. This was a deliberate v1 product choice (distributor-led model), which v2 is reversing — so re-enabling/adapting these screens is directionally exactly what v2 wants.

**3. InvestorTransaction.tsx / InvestorRedeem.tsx are architecturally distributor-mediated**, the opposite of v2's model:
- `InvestorTransaction.tsx:373,441,509` — calls `GET /investors/{investor.id}/bank-accounts`, `POST /orders`, then `POST /orders/{createdOrder.id}/request-investor-approval` — i.e., a distributor drafts the order for an investor and triggers an OTP-approval step. Routed live at `App.tsx:293,373-379` (`InvestorTransactionWrapper`, requires `location.state.investor` supplied by a distributor screen).
- `InvestorRedeem.tsx:88,101` — calls `GET /investors/{investorId}` and an investor-scoped holdings lookup, again keyed by a distributor-supplied `investorId`. Routed at `App.tsx:299` under `/distributor/investors/:investorId/redeem`.
- Their wizard UX (fund search, amount/SIP fields, holdings-to-redeem picker) is reusable as *visual/step-content* scaffolding, but their data/auth model (distributor acts, investor approves) is fundamentally the B2B2C pattern v2 is removing.

## Caveats

- Not independently load-tested/run — this is static code + route + endpoint-signature verification only (no runtime confirmation that these screens render correctly end-to-end, e.g. via a dev server or browser).
- `InvestorWithdrawal.tsx:12-13` has an explicit unresolved TODO: `WITHDRAWAL_COMPLIANCE_WARNING = '[Compliance to provide the self-withdrawal warning text.]'` — placeholder copy needs replacing before reuse.
- The 2FA/OTP `TransactionApprovalPanel` component (`InvestorInvest.tsx:7`, `InvestorWithdrawal.tsx:7-9`) is still wired into both self-service screens — reflects v1's mandatory 2FA-per-order pattern; v2 will need to decide whether to keep, simplify, or replace this step for a self-directed flow.
- No backend integration/E2E test evidence was checked in this pass to confirm the schemes/orders/withdrawals endpoints return expected shapes matching the frontend's TS interfaces field-for-field (only endpoint existence/path match was verified).
