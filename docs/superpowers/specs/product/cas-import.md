<!-- source: workflow wf_3190e72a-04a label spec:cas-import | exported 2026-09-28 -->

# CAS / External Holdings Import: research and recommendation for Sanchay

Research date: 2026-09-25. Web sources were accessed on that date and are listed in §11. v1 paths are read-only references.

---

## 0. Summary

| Item | Decision |
|---|---|
| **Launch approach** | The investor uploads the **CAMS+KFintech Detailed CAS PDF** they receive by email, with its password. We parse it server-side with the open-source **`casparser` (Python, MIT, v1.4.1, 2026-08-30)**, running as an isolated worker in ap-south-1. NSDL/CDSL depository CAS and Summary CAS are also accepted, but only as holdings snapshots with no transactions. |
| **Why not an API at launch** | (1) **MF Central**: on 2025-09-19 AMFI directed MF Central to stop sharing investor data with third-party apps. It is unclear whether an ARN-holding platform can still use it. (2) **Account Aggregator**: Sahamati's FAQ says an MF distributor is **not eligible to be an FIU**. (3) **Cybrilla FP `mf_investments_snapshot`** returns only a folio **summary** and depends on the same OTP/RTA channel, so it is not usable until Cybrilla confirms in writing. |
| **Effort** | About 18–22 dev-days, roughly one sprint for the two developers working in parallel. It has no external dependency or onboarding. |
| **Upgrade path** | Phase 1.5: email-forward import through SES inbound in ap-south-1 (supported). Phase 2: one-tap OTP refresh through FP snapshot or MF Central under Platizio's ARN, **only after written confirmation** that it is permitted after the directive. It would refresh holdings only; the CAS stays the source of transactions. Phase 3: AA only if Platizio gains FIU eligibility, for example through SEBI RIA registration or a change in the rules. |
| **Dashboard rule** | External holdings are stored and shown **separately**. There is an "All investments" toggle. Combined XIRR shows only when every included external holding has reconciled transaction-level cash flows, following v1's `fullCoverage` rule. Active SIP count, SIP management and tax statements cover the **platform only**. |

---

## 1. v1 baseline (what can be reused)

| Finding | Evidence |
|---|---|
| v1 has **no CAS, MF Central, AA or external-holdings code** (backend and investor frontend) | Grep for `casparser\|mfcentral\|consolidated account statement\|externalHolding\|rta.?cas\|cas.?summary\|portfolio.?aggregat` under `C:/Users/pc/Desktop/WeathTech_v2/investor/` → no matches |
| v1 holdings come entirely from the internal order ledger, never from an FP holdings call | Synthesis brief §7 ("Holdings derivation … never from a Cybrilla/FP holdings-API call") |
| XIRR algorithm to port: Newton-Raphson with bisection fallback; returns null for fewer than 2 cash flows or cash flows all of one sign | `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/service/XirrCalculator.java:27,41,198` (the solve uses `double`, narrowed via `.doubleValue()` at :198) |
| Portfolio XIRR is `null` unless `fullCoverage`; unpriced holdings get `currentValue = null`, never 0 | Synthesis §7 (`HoldingsService.java:237-252`) |
| AMFI NAV feed (`AmfiNavParser`) can be reused as-is | Synthesis §6 |

**Implication:** CAS import is greenfield. Valuation and XIRR should reuse the same `@sanchay/portfolio-math` package as platform holdings.

---

## 2. Options in detail

### (a) CAS PDF from CAMS / KFintech, uploaded by the investor

| Aspect | Facts |
|---|---|
| How the investor gets it | camsonline.com → Investors → Statements → CAS (choose "CAMS+KFintech") or mfs.kfintech.com → Consolidated Account Statement. Choose **Detailed** (includes transactions) and **Since inception**. The statement is emailed **only to the email registered in the folio**. Delivery takes about 2–15 minutes. |
| Password rules (CAMS mailback) | **The investor sets the password** in the request form: alphanumeric, starts with a letter, 8–15 characters, at least one uppercase letter and one digit (camsonline). Some guides report PAN (uppercase) as the default for older flows. |
| Password rules (NSDL/CDSL depository CAS) | **PAN (uppercase) + DOB (DDMMYYYY)**, e.g. `ABCDE1234F05011990`. |
| Depository CAS timing | Monthly e-CAS arrives by the **12th** of the following month if there was activity, otherwise half-yearly. It includes MF units held in SoA form (SEBI circular SEBI/HO/MRD/PoD1/CIR/P/2025/16, 2025-02-14, effective 2025-05-14). |
| Data in a Detailed CAMS/KFin CAS (per casparser schema) | Per folio: `folio, amc, name, PAN, KYC, PANKYC`. Per scheme: `scheme, advisor (ARN/RIA code), rta_code, rta, type, isin, amfi, nominees[], open, close, close_calculated`, `valuation{date, nav, cost, value}`, `transactions[{date, description, amount, units, nav, balance, type, dividend_rate, gift_folio}]`, plus `parse_warnings[]` (non-empty when running-balance reconciliation fails). Transaction types: `PURCHASE, PURCHASE_SIP, REDEMPTION, SWITCH_IN(_MERGER), SWITCH_OUT(_MERGER), DIVIDEND_PAYOUT/REINVEST, STT_TAX, STAMP_DUTY_TAX, TDS_TAX, SEGREGATION, GIFT_IN/OUT, REVERSAL, MISC/UNKNOWN`. |
| Data in NSDL/CDSL CAS | Holdings only, no transactions (casparser `NSDLCASData`). |

**Parser options:**

| Parser | Language / license | Maturity (checked 2026-09-25) | Verdict |
|---|---|---|---|
| **`codereverser/casparser`** | Python, MIT; since v1.0 built on pypdfium2 (Apache-2.0/BSD-3), with no GPL/AGPL dependencies | v1.4.1 released 2026-08-30, last push 2026-09-23, 229 stars, CI and codecov, checked-in JSON Schemas, decimals serialised as strings, reconciles against printed running balances. It **rejects re-printed ("print to PDF") and MF Central PDFs** by checking generator metadata. | **Use at launch.** Pin the version and run it in an isolated worker. |
| `cas-pdf-parser` (npm, TS; built on pdfjs-dist 4.x, decimal.js, zod) | MIT | v0.1.3, 0 stars, 7 commits, no authenticity check | Not production-grade. Reference only. |
| `cas-parser-node` 1.17.1 / `@cas-parser/connect` 2.2.0 | Client SDKs for the **CASParser.in paid API** (not local parsers) | Commercial | Fallback only (see (e)). |
| Build our own TS parser on `pdfjs-dist` 6.3.289 / `unpdf` 1.8.1 | Apache-2.0 | pdfjs supports passwords (`getDocument({data, password})`) and positioned text. `pdf-parse` 2.4.5 is now a pdf.js wrapper (depends on `pdfjs-dist 5.4.296`), but password support is weaker and it concatenates text. `mupdf` 1.28.1 is **AGPL-3.0**, so avoid it. | 4–8 dev-weeks plus ongoing template maintenance. Defer, and reconsider only if the Python sidecar becomes a burden. |

### (b) MF Central (MFCentral) CAS API

| Aspect | Facts |
|---|---|
| What existed | CAMS and KFintech (a JV since Nov 2024) offered MFDs and RIAs commercial APIs, including CAS and distributor-level CAS. Investor consent was an OTP. More than 50M statements were delivered. |
| **Regulatory event** | **2025-09-18/19: AMFI directed MF Central to stop sharing investor data directly with third-party/fintech apps.** Stated reasons: data security, investors consenting via OTP without understanding, and poaching complaints from distributors (Angel One, Business Standard, BusinessToday, Cafemutual). The CASParser.in blog, a **vendor source**, calls this a full API shutdown. |
| Current status for an ARN platform | **Ambiguous.** InvestWell's help page says MF Central OTP import "is no longer functional without your own MF Central CAS credentials" for the ARN. Groww's help page still describes MF Central OTP import. No reliable 2026 report says access has been restored for fintechs. |
| Data | Transaction-level data when "all AMCs" and "Regular + Direct" are selected (InvestWell). casparser does **not** parse MF Central PDFs. |
| Cost | Commercial, not published. |
| Verdict | **Do not depend on it for launch.** Ask MF Central for written confirmation that Platizio (ARN) can subscribe post-directive → Phase 2 candidate. |

### (c) Account Aggregator (AA)

| Aspect | Facts |
|---|---|
| MF coverage | CAMS RTA and KFin RTA are live FIPs on about 13 AAs (CASParser.in, Mar 2026; ecorpit, Jul 2026). |
| Schema | ReBIT `mutual_funds.xsd` v1.0.0. Holding fields: `amc, registrar, schemeCode, schemeOption, isin, amfiCode, folioNo, closingUnits, lienUnits, lockinUnits, nav, navDate`. Summary: `costValue` (optional), `currentValue`. Transaction fields: `txnId, isin, amfiCode, schemePlan (DIRECT/REGULAR), amount, units, nav, navDate, type (BUY/SELL/OTHERS), transactionDate, narration`. Transaction history is reported as limited to about 2 years (BusinessToday). |
| **FIU eligibility** | Sahamati FAQ: *"Per the present FIU and Financial Sector Regulator definition, MF Distributor would not be eligible to be an FIU."* TSPs cannot receive decrypted data; only regulated FIUs can. |
| Cost / time | Pricing is negotiated. Anumati publishes Rs 1 per profile/summary fetch and Rs 5–25 per statement fetch. First-year all-in about Rs 5–25 lakh and 5–10 months (vendor estimate). |
| Verdict | **Not available to Platizio as an MFD.** Revisit only if Platizio becomes a SEBI RIA/PMS or the FIU definition changes. RBI recognised Sahamati as the AA SRO on 2026-06-05, so watch its rule changes. |

### (d) Cybrilla FintechPrimitives (FP)

| Aspect | Facts |
|---|---|
| Capability | "Fetch RTA CAS" / **`mf_investments_snapshot`**: create it with the investor profile plus phone or email → OTP to the investor → Update API with the OTP → status `submitted` → Fetch API returns **summary details of all folios** for that PAN and contact. The OTP is valid for about 10 minutes (`failure_code = otp_expired`). FP's CAS marketing page claims "complete historical transaction data". The docs page returned 403 to our fetch, so field-level detail is unverified. |
| Related | FP "Migrate offline folios" exists, which is relevant to a later "bring folio under Sanchay" feature. It is out of scope here. |
| Data source | Probably the same RTA/MF Central OTP channel, so it is **exposed to the same AMFI directive**. |
| Verdict | **Phase 2 candidate** once Cybrilla confirms: (1) it is live in production for ARN tenants after 2025-09-19, (2) whether it returns transactions or only a summary, (3) the per-call price. It fits our stack (Cybrilla is already the order rail). |

### (e) CASParser.in SaaS (for completeness)

The same inputs as (a), parsed by a third party. It also offers Gmail pull, inbound email and a KFintech mailback generator. Pricing: free tier of 10 credits; Rs 999–10,500/month (promotional); 1 credit per parse; Enterprise on-prem Docker. Data retention and hosting location are **not disclosed**. That adds a DPDP data processor and cross-border uncertainty. **Fallback only**, e.g. if a new CAS template breaks the open-source parser.

---

## 3. Comparison matrix

| Criterion | (a) CAS PDF + casparser (self-hosted) | (b) MF Central API | (c) Account Aggregator | (d) FP snapshot | (e) CASParser.in SaaS |
|---|---|---|---|---|---|
| **Available to Platizio (ARN) today** | **Yes** | Uncertain after the AMFI 2025-09-19 directive | **No** (MFD not an FIU) | Unconfirmed | Yes |
| Accuracy | **High**: RTA-issued, transaction-level, cost value, running-balance reconciliation | High (transactions) | Medium–high; about 2 years of transactions; cost optional | Medium (summary; units only) | High (same source) |
| Covers CAMS + KFin (all AMCs) | Yes, in one CAMS+KFintech PDF | Yes | Yes | Yes (by PAN + contact) | Yes |
| Investor UX | Medium–low: request by email, wait 2–15 minutes, enter password, upload | **Best**: OTP, about 10–15 minutes | Good (AA app consent) | Good (OTP) | Same as (a), plus Gmail pull |
| Consent / compliance | Clean: investor-initiated, own document, explicit in-app consent | Regulatory risk (directive) | Formal consent artefact, but ineligible | Same risk as (b) | Adds a third-party processor; hosting undisclosed |
| Running cost | About Rs 0 (Lambda, S3) | Per-statement fee (unpublished) | Rs 1–25 per fetch plus setup | Per FP contract | Rs 999–10,500+/month |
| Engineering effort (2 devs) | **18–22 dev-days** | About 8–10 dev-days after onboarding | 5–10 months (vendor estimate) | About 6–8 dev-days | About 10–12 dev-days |
| Time to integrate | **1 sprint, no external gate** | Legal and onboarding gate, unknown | Blocked | Needs Cybrilla confirmation | Contract and DPA, about 2–4 weeks |
| Ongoing risk | Template changes (mitigated by an active upstream plus golden tests) | Policy reversal | n/a | Policy | Vendor lock-in and privacy |

---

## 4. Recommended launch design

### 4.1 Investor flow (web and native)

| Step | Behaviour |
|---|---|
| 1. Entry | Dashboard card: "Track investments made elsewhere". A consent sheet (versioned text) states the purpose: display a consolidated view only, with no marketing use unless the investor opts in separately. The investor can delete the data at any time. |
| 2. Get your CAS | Guided steps with a deep link to the CAMS CAS page in an in-app browser. We tell the investor to choose **CAMS+KFintech, Detailed, Since inception, include zero-balance folios**, and to set a password they will remember. Sanchay **does not** submit the mailback form for them; it is a third-party form. |
| 3. Upload | Web: `<input type=file accept=application/pdf>`. Native: `expo-document-picker`. The file is PUT directly to S3 with a presigned URL, so it never passes through the API as base64 (this matters on low-end Android). Limits: 10 MB and 300 pages. |
| 4. Password | The server first tries candidates it can derive from KYC data: `PAN` and `PAN+DOB(DDMMYYYY)`, the latter covering NSDL/CDSL. It then asks the investor, with a hint based on the detected issuer. Wrong password → `PASSWORD_REQUIRED`, and the investor can retry without re-uploading. |
| 5. Result | Poll `GET /external-imports/:id` every 2 seconds until done. Show: folios found, schemes, "units as of <statement date>", and warnings (partial reconciliation, unmapped schemes). |
| 6. Refresh | Nudge to re-import 30 days after `statement_to`, and on the 13th of each month (depository CAS arrival). |

### 4.2 Architecture (AWS ap-south-1)

| Component | Choice |
|---|---|
| API | NestJS module `external-holdings` in `apps/api` with endpoints `POST /v1/external-imports` (→ `{importId, uploadUrl}`), `POST /v1/external-imports/:id/submit {password?}`, `GET /v1/external-imports/:id`, `GET /v1/portfolio/external`, `GET /v1/portfolio/summary?scope=platform\|external\|all`, `DELETE /v1/external-holdings` (full erasure). |
| Queue | SQS `cas-parse`, 1 h retention. The password is **envelope-encrypted with a KMS key that only the parser role can decrypt**. It is never logged or persisted. |
| Parser worker | `apps/cas-parser`: Python 3.12 Lambda **container image** (arm64, 1024 MB, 60 s timeout). It runs `casparser==1.4.1` (pinned) plus about 150 lines of wrapper code. **No internet egress** (VPC without NAT; S3 and SQS through VPC endpoints). It returns JSON to S3/SQS. Isolating it means a malicious PDF cannot reach the API process. |
| Contract | Generate TS types from casparser's checked-in `schema/*.json` with `json-schema-to-typescript` into `packages/cas-schema`, and validate with zod in the API before writing to the database. |
| Storage of raw PDF | S3 SSE-KMS. **Deleted immediately after a successful parse.** On failure it is kept at most 72 h for retry, then deleted by a lifecycle rule. Only the `sha256` is kept, to detect duplicate uploads. |
| Identity check | Every folio `PAN` in the CAS must equal the investor's KYC PAN. On mismatch, reject with `PAN_MISMATCH`. This stops people importing someone else's portfolio. Folios where the investor is a joint holder are allowed and flagged. |
| Abuse limits | 10 imports per investor per day. File type checked by magic bytes, not the file extension. |
| Monorepo | `apps/cas-parser` has a `package.json` whose scripts shell out to `uv`/`docker build` so Turborepo can orchestrate it. No Python enters the pnpm workspace graph. |

### 4.3 Effort (2 devs + AI agents)

| Work item | Dev-days |
|---|---|
| Parser Lambda, IaC, KMS/SQS/S3 wiring | 3 |
| Drizzle schema, import pipeline, idempotent upsert, supersede logic | 5 |
| ISIN → scheme master mapping, AMFI NAV valuation, stale flags | 2 |
| Dedupe against platform holdings | 2 |
| Dashboard scope toggle, external XIRR, allocation | 3 |
| Web and native UX (guide, upload, password, status, results, delete) | 4 |
| Golden-file tests with about 10 redacted real CAS files, property tests for reconciliation | 2 |
| Consent, retention, erasure, security review | 1 |
| **Total** | **about 22** (about 1 sprint for 2 devs) |

---

## 5. Data model (PostgreSQL 18 / Drizzle)

Precision follows v1: units `numeric(20,4)`, amounts `numeric(20,2)`, NAV `numeric(20,6)`. Decimals come from casparser as strings and are never parsed as floats.

### 5.1 Tables

| Table | Columns (type) | Keys / notes |
|---|---|---|
| `external_import_consent` | `id uuid`, `investor_id`, `consent_text_version text`, `purpose text`, `granted_at timestamptz`, `revoked_at timestamptz null`, `ip inet`, `device text` | Can reuse the generic consent table if one exists. Revoking triggers erasure. |
| `external_import` | `id uuid`, `investor_id`, `consent_id`, `source enum(CAS_UPLOAD, CAS_EMAIL, FP_SNAPSHOT, MFC_API, AA)`, `issuer enum(CAMS, KFINTECH, NSDL, CDSL, UNKNOWN)`, `cas_type enum(DETAILED, SUMMARY, DEMAT)`, `statement_from date`, `statement_to date`, `file_sha256 bytea`, `status enum(AWAITING_UPLOAD, RECEIVED, PASSWORD_REQUIRED, PARSING, PARSED, PARSED_WITH_WARNINGS, FAILED, SUPERSEDED)`, `failure_code text` (e.g. `WRONG_PASSWORD, NOT_ORIGINAL_PDF, PAN_MISMATCH, UNSUPPORTED_TEMPLATE, TOO_LARGE`), `parser_name`, `parser_version`, `parse_warnings jsonb`, `raw_object_key text null`, `folio_count int`, `scheme_count int`, `created_at`, `completed_at` | Unique on `(investor_id, file_sha256)`. The `source` column is ready for Phase 2/3. |
| `external_folio` | `id`, `investor_id`, `amc_name`, `amc_code null`, `folio_no text` (normalised: trimmed, `/` spacing unified), `rta enum`, `holder_name`, `joint_holding bool`, `kyc_ok bool null`, `first_import_id`, `last_import_id` | Unique on `(investor_id, amc_name_norm, folio_no)`. The `pan_*` PII is **not** stored beyond the match result. |
| `external_holding` | `id`, `investor_id`, `folio_id`, `scheme_id uuid null` (FK to our scheme master via ISIN), `isin`, `amfi_code`, `rta_code`, `scheme_name_raw`, `plan enum(DIRECT, REGULAR, UNKNOWN)` (from ISIN in the scheme master, else parsed from the name), `option enum(GROWTH, IDCW_PAYOUT, IDCW_REINVEST, UNKNOWN)`, `advisor_code text` (ARN-xxxx / INA / DIRECT), `open_units`, `closing_units numeric(20,4)`, `units_as_of date` (= `statement_to`), `cas_nav numeric(20,6)`, `cas_nav_date`, `cas_value numeric(20,2)`, `cost_value numeric(20,2) null` (RTA-reported cost of current units), `has_transactions bool`, `reconciled bool` (`close == close_calculated` and no warning for this scheme), `platform_overlap_units numeric(20,4) default 0`, `status enum(ACTIVE, ZERO_BALANCE, REMOVED)`, `last_import_id` | Unique on `(folio_id, isin)`, falling back to `(folio_id, rta_code)` when ISIN is null. |
| `external_transaction` | `id`, `holding_id`, `import_id`, `txn_date date`, `type enum` (casparser types), `description`, `amount numeric(20,2) null`, `units numeric(20,4) null`, `nav numeric(20,6) null`, `balance_units numeric(20,4) null`, `dividend_rate numeric null`, `gift_folio text null`, `seq int` (order within the day), `dedupe_hash bytea`, `platform_order_id uuid null` (set when matched to a Sanchay order) | Unique on `(holding_id, dedupe_hash)`, where the hash is sha256(date, type, units, amount, seq). |
| (derived) `portfolio_daily_snapshot` | Shared with platform: `investor_id, date, scope enum(PLATFORM, EXTERNAL), invested, current_value, xirr null, coverage_pct` | Optional; used for charts. |

### 5.2 Import semantics

| Rule | Behaviour |
|---|---|
| Idempotency | The same `sha256` returns the existing import. Transactions are upserted by `dedupe_hash`. |
| Supersede | A newer **Detailed** CAMS+KFintech CAS with `statement_from` at or before the earlier one **replaces** the transaction set for each holding it contains. Prior imports are marked `SUPERSEDED`. |
| Removal | A holding missing from a newer **consolidated** CAMS+KFintech statement is marked `REMOVED`. A single-RTA statement never removes the other RTA's holdings. |
| Summary / Demat CAS | Updates `closing_units`, `cost_value`, `cas_*` and `units_as_of` only. It keeps earlier transactions but sets `reconciled=false` if units no longer match `last balance`, which disables XIRR for that holding. |
| Zero-balance schemes | Kept as `ZERO_BALANCE` for realised history. Hidden from the default holdings list. |
| Warnings | Schemes named in `parse_warnings` get `reconciled=false`. The rest of the import is accepted (`PARSED_WITH_WARNINGS`). |

### 5.3 Dedupe against platform holdings

Folios opened through Sanchay (our ARN, executed on FP) will also appear in any CAS the investor uploads.

| Case | Rule |
|---|---|
| `(folio_no, isin)` has **no** Sanchay orders | Fully external. |
| `(folio_no, isin)` has Sanchay orders | Match CAS transactions to platform orders: same date ±3 business days, units within 0.001, amount within ₹1 → set `platform_order_id`. External units = `closing_units − platform ledger units` (floored at 0), stored as `platform_overlap_units`. Matched transactions are excluded from external cash flows. |
| Residual mismatch above 0.01 units | Flag `reconciled=false` and queue an ops reconciliation-report entry. The platform ledger stays the source of truth. |

---

## 6. Valuation, refresh cadence and freshness

| Aspect | Rule |
|---|---|
| NAV source | Latest **AMFI NAV** (daily AMFI job, the same one used for platform holdings), matched by ISIN. AMFI's NAV file carries both growth/payout and reinvest ISINs. Fallback key is the `amfi_code` from the CAS. |
| Current value | `(closing_units − platform_overlap_units) × latest AMFI NAV`, shown with its NAV date. |
| Missing NAV | No AMFI NAV for more than 5 business days (merged or wound-up scheme) → value at `cas_nav` with a "Valued as of <cas_nav_date>" badge (`DataQuality=STALE`). No ISIN mapping at all → `cas_value`, flagged, and excluded from category allocation ("Unclassified"). Never report 0. |
| Units freshness | Units are a **snapshot as of `statement_to`**. Show "Units as of 31 Aug 2026". Transactions made after that date are invisible until the next import, and the UI says so. |
| Refresh cadence | Values are recomputed daily after the AMFI NAV sync, since units are unchanged. Re-import nudges go out 30 days after `statement_to`, and on about the 13th of each month (after depository e-CAS dispatch by the 12th, SEBI circular 2025-02-14). Phase 2 adds OTP refresh. |
| Invested amount | Use the RTA-reported `valuation.cost` when present. Otherwise compute it FIFO from transactions (casparser's gains module is also FIFO and reconciles with CAMS/KFin CG statements). Label it "Invested (as reported by RTA)". Platform holdings keep v1's weighted-average method. The two scopes use different methods and are labelled accordingly. The "All" total is simply the sum of the two. |

---

## 7. XIRR and dashboard treatment

| Dashboard element | Platform scope (default) | External scope | "All investments" toggle |
|---|---|---|---|
| Invested / current value / gains | Ledger (v1 rules) | §6 rules | Sum; shows a "includes imported data as of <oldest units_as_of>" note |
| **XIRR** | v1 algorithm, ported | Only for holdings with `has_transactions && reconciled`. Cash flows: `PURCHASE/PURCHASE_SIP/SWITCH_IN*/GIFT_IN` negative (amount + matching `STAMP_DUTY_TAX`); `REDEMPTION/SWITCH_OUT*/GIFT_OUT/DIVIDEND_PAYOUT` positive (net of `STT_TAX`/`TDS_TAX`); `DIVIDEND_REINVEST` has no cash flow; terminal value = current value at today's NAV date. At **portfolio** level, switch in/out legs cancel. | Shown **only if** platform `fullCoverage` holds **and** every included external holding is reconciled with transactions. Otherwise show "—" with "XIRR needs a Detailed CAS". This follows v1's `fullCoverage` rule (synthesis §7). |
| Active SIP count | Platform only | Not shown; external SIPs cannot be managed | Platform only, labelled "SIPs on Sanchay" |
| Holdings list | Platform | Separate "Imported" section with source badge, folio, `advisor_code` and "as of" date | Grouped by source |
| Allocation by SEBI category | Scheme master | Scheme master via ISIN; unmapped → "Unclassified" | Combined chart |
| SIP management, switch, STP, SWP, redemption | Platform only | **Read-only**; no transaction buttons on external holdings | n/a |
| Tax & statements (CG, transaction statement, ELSS) | Platform only at launch | Later: external CG via casparser's `gains` logic, reconciled | n/a |

**Compliance rules for external holdings.** We act as an MFD.
- Do not show "switch to Sanchay", "move to regular" or similar CTAs on **Direct-plan** external holdings. Moving an investor from direct to regular raises cost and invites mis-selling scrutiny. SEBI has removed exit load on regular→direct switches, and the MFD code of conduct requires acting in the investor's best interest.
- External data may not be used for marketing or recommendations without a separate opt-in. This addresses the AMFI directive's stated concerns about uninformed consent and poaching.

---

## 8. Consent, privacy and security

| Control | Specification |
|---|---|
| Consent | Explicit, versioned, purpose-limited in-app consent before first import (§5.1 table). Withdrawal = `DELETE /v1/external-holdings`, which erases all external tables for the investor within 24 h. Build now to the DPDP Rules 2025 (notified 2025-11-13; notice, consent, security and breach duties apply fully from **2027-05-13**). |
| Data minimisation | Persist only folio, scheme, units, cost and transactions. Do **not** persist the CAS `investor_info` (address, mobile, email) or nominee names. PAN is used only for the match check, then discarded. |
| Residency | All processing and storage in ap-south-1. No third-party parser at launch. |
| Secrets | The password exists only in the request body (TLS), then in a KMS-encrypted SQS message, then in the parser's memory. It is never logged, and the logger has redaction rules for `password`. |
| Parsing isolation | The Lambda has no egress, a 60 s timeout, and page and size caps. casparser's generator-metadata check rejects tampered or re-printed PDFs (`NOT_ORIGINAL_PDF`). |
| Audit | `external_import` rows form the audit trail. Ops back-office gets a read-only import list with status and failure codes; raw PDFs are never visible. |

---

## 9. Upgrade path

| Phase | Trigger / gate | Scope | Effort |
|---|---|---|---|
| **1 – Launch** | none | CAS PDF upload + casparser (§4) | about 22 dev-days |
| **1.5 – Email forward** | After launch, when upload drop-off exceeds about 40% | A per-investor tokenised address (e.g. `cas-<token>@import.<our-domain>`). **SES receiving is supported in ap-south-1** (`inbound-smtp.ap-south-1.amazonaws.com`) → S3 → SQS → same parser. The investor forwards the CAMS/KFin email. Accept attachments only from an allow-list of sender domains, plus the DKIM-verified forwarder address matching the investor's email. | about 5 dev-days |
| **2 – OTP quick refresh** | **Written** confirmation from Cybrilla (FP `mf_investments_snapshot`) **or** MF Central (CAS API under Platizio ARN) that ARN platforms are permitted after the 2025-09-19 directive, plus per-call price and returned fields | "Refresh with OTP" updates units and cost (`source=FP_SNAPSHOT/MFC_API`). Transactions still come from the CAS. If the provider returns transactions, reuse the same tables. | about 6–10 dev-days |
| **3 – AA** | Platizio or a group entity becomes FIU-eligible (SEBI RIA/PMS registration) **or** the RBI/Sahamati FIU definition expands to MFDs | Integrate through a TSP (Setu/Finvu/Anumati/OneMoney). Map the ReBIT `mutual_funds.xsd` Holding/Transaction to the same tables (`source=AA`). | 2–3 sprints plus onboarding |
| Optional | Upstream casparser becomes unmaintained | Port to TS on pdfjs-dist using the golden-file corpus as the spec, or fall back to CASParser.in Enterprise on-prem Docker (keeps data in our VPC) | 4–8 weeks / contract |

---

## 10. Assumptions and open actions

| # | Assumption / action | Owner | Due |
|---|---|---|---|
| A1 | casparser (MIT) is acceptable to legal as a vendored dependency pinned at 1.4.1; upstream releases are reviewed before bumping | Tech lead | Sprint of implementation |
| A2 | Collect about 10 real CAS PDFs (CAMS detailed/summary, KFin detailed, NSDL, CDSL, including joint and zero-balance folios) from team volunteers, redacted, for golden tests. Never commit originals; store redacted fixtures only. | Dev 2 | Before build |
| A3 | Email Cybrilla: is `mf_investments_snapshot` live in production for ARN tenants after 2025-09-19; summary only or with transactions; price | Product | Now (non-blocking) |
| A4 | Email MF Central: can Platizio (ARN) subscribe to the CAS API post-directive; terms | Compliance | Now (non-blocking) |
| A5 | External holdings are a **launch requirement** (locked decision 4). The PDF approach meets it without any external dependency. | — | — |
| A6 | External capital-gains and ELSS lock-in analytics are **not** in launch scope; tax statements cover platform holdings only | Product | Confirmed at launch plan |

---

## 11. Sources (all accessed 2026-09-25)

**Code**
- v1: `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/service/XirrCalculator.java:27,41,198`
- Synthesis brief §6–§7 (task output `wuehi471r.output`)
- v1 grep: no CAS, MF Central or AA code

**Parsers and PDF libraries**
- casparser: https://github.com/codereverser/casparser (README, schema); GitHub API: v1.4.1 released 2026-08-30, pushed 2026-09-23, MIT, 229 stars
- npm registry (`npm view`): `cas-pdf-parser` 0.1.3, `cas-parser-node` 1.17.1, `@cas-parser/connect` 2.2.0, `pdfjs-dist` 6.3.289, `pdf-parse` 2.4.5, `unpdf` 1.8.1, `mupdf` 1.28.1 (AGPL-3.0)
- https://github.com/MaheshPulivarthi18/cas-parser
- https://www.pkgpulse.com/guides/unpdf-vs-pdf-parse-vs-pdfjs-dist-pdf-2026

**CAS statements and rules**
- CAMS CAS page and password rules: https://www.camsonline.com/Investors/Statements/Consolidated-Account-Statement
- KFintech CAS: https://mfs.kfintech.com/investor/General/ConsolidatedAccountStatement
- https://ashishfinancialservices.in/insights/posts/2026-05-16-how-to-download-cas-statement-cams-kfintech/
- NSDL CAS FAQ: https://nsdl.com/investor/know-your-cas
- SEBI CAS timelines circular (2025-02-14): https://www.sebi.gov.in/legal/circulars/feb-2025/revised-timelines-for-issuance-of-consolidated-account-statement-cas-by-depositories_91927.html

**MF Central**
- AMFI directive: https://www.angelone.in/news/mutual-funds/amfi-directs-mf-central-to-halt-sharing-investor-data-with-third-party-apps
- https://www.business-standard.com/markets/mutual-fund/amfi-asks-mf-central-to-stop-sharing-investor-data-with-third-party-apps-125091801057_1.html
- https://www.businesstoday.in/personal-finance/news/story/why-amfi-blocked-fintechs-access-to-investor-data-a-look-at-the-concerns-and-impact-494695-2025-09-18
- https://cafemutual.com/news/press-news/35828-amfi-asks-mf-central-to-stop-sharing-investor-data-with-third-party-apps
- InvestWell: https://help.investwellonline.com/support/solutions/articles/19000176315-cas-import-via-otp-mf-central-
- Groww: https://groww.in/help/mutual-funds/mf-dashboard/how-do-i-import-my-external-mutual-fund-investments-1
- MProfit: https://www.mprofit.in/mfcentral-cas-api-terms/
- CASParser.in blogs (vendor; used with caution): https://casparser.in/blog/mfcentral-alternative/ (2025-10-05), https://casparser.in/blog/state-of-account-aggregator-2026/ (2026-03-03)
- CASParser.in pricing: https://casparser.in/pricing/

**Account Aggregator**
- Sahamati FAQ: https://sahamati.org.in/faq/
- ReBIT MF schema: https://specifications.rebit.org.in/api_schema/account_aggregator/documentation/mutual_funds.html
- https://ecorpit.com/account-aggregator-integration-fintech-builders-2026/ (2026-07-17)
- Anumati pricing: https://www.anumati.co.in/pricing/
- Setu docs: https://docs.setu.co/data/account-aggregator/fi-data-types

**Cybrilla FP**
- Fetch RTA CAS / MF Investments Snapshot: https://docs.fintechprimitives.com/advisory/fetch-rta-cas/ (search-result snippets only; the page returned 403 to direct fetch)
- FP CAS page: https://fintechprimitives.com/cas.html

**AWS and DPDP**
- SES inbound endpoints: https://docs.aws.amazon.com/general/latest/gr/ses.html (lists `inbound-smtp.ap-south-1.amazonaws.com`)
- DPDP Rules 2025: https://www.pib.gov.in/PressReleasePage.aspx?PRID=2190014
- DPDP timeline: https://www.sansalegal.com/post/dpdp-act-2023-and-rules-2025-phased-implementation-timeline-and-business-compliance-deadlines

**Code of conduct and switching**
- SEBI no exit load on regular→direct switch: https://www.angelone.in/news/mutual-funds/big-update-for-mutual-fund-investors-no-exit-loads-on-switch-from-regular-to-direct-plans
