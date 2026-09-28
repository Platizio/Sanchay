<!-- source: workflow wf_3190e72a-04a label spec:journeys | exported 2026-09-28 -->

# Sanchay: investor journey and screen specification (web and native)

Version 1.0 · prepared 2026-09-25 · read-only planning output. No files were changed.

Abbreviations used in citations:
- **BE** = `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech`
- **FE** = `C:/Users/pc/Desktop/WeathTech_v2/investor-frontend/src`
- **FP** = Cybrilla FintechPrimitives

---

## 0. Scope, assumptions and decisions

### 0.1 Locked inputs this spec follows
- Business model: B2C, investor-led. The platform operator is an AMFI-registered MFD with a platform ARN.
- Investors self-serve **Regular** plans only. Every order is an **execution-only** order: EUIN is left blank and the investor declares execution-only.
- Actors: the investor, plus internal ops. The ops screens are outside this document; where a screen depends on an ops review, the dependency is named.
- Platforms: web (Next.js 16) and native (Expo with Expo Router). Orders go through FP. Fund facts come from AMFI plus admin curation.
- Launch scope is the full list in the brief. All of it is required at first public launch.

### 0.2 Assumptions (stated, not open)

| # | Assumption / decision | Rationale |
|---|---|---|
| A1 | **Launch eligibility:** resident Indian individuals, 18 or older, single holding, individual PAN (4th character `P`). NRI, minor, joint, HUF and non-individual accounts are out of scope. | v1 FP profile payload is hard-wired to `type=individual`, `tax_status=resident_individual` (BE `integration/RealCybrillaClient.java:2589-2590`). Keeps KYC branches finite. |
| A2 | **Web origins:** public site `https://sanchay.in`, app `https://app.sanchay.in`, native scheme `sanchay://`, universal/app links on `app.sanchay.in`. | App id `in.sanchay.app`. These are config constants; change them if the domain differs. |
| A3 | Transaction OTPs go to **both** the registered mobile (SMS, DLT template) and the registered email, with the same code and one challenge. | SEBI 2FA mandate. v1 sent email only (`TransactionApprovalService` `CHANNEL_EMAIL`). v1 SMS was a stub (V76/V77). |
| A4 | **Guest browsing:** Explore and Fund detail are public on web (SSR/ISR for SEO) and in native guest mode. Any Invest CTA routes to AUTH. | Mass-market acquisition. |
| A5 | **Folio policy:** one folio per AMC per investor. A new purchase in an AMC where the investor already has a folio is placed in that folio. | Simplest mental model; matches FP `mf_investment_accounts` folio defaults. |
| A6 | **English at launch**, all strings externalised (i18n keys), Hindi in the first post-launch release. | Two developers; strings are ready for translation. |
| A7 | **Nominee cap = 3.** Name and relationship are mandatory. DOB is also mandatory because it is needed to derive minor/guardian status. ID fields are optional. | SEBI circular SEBI/HO/OIAE/OIAE_IAD-3/P/CIR/2026/12676 dated 29-May-2026, effective 01-Sep-2026, supersedes the earlier 10-nominee circular. Reference: https://www.sebi.gov.in/legal/circulars/may-2026/ease-of-doing-investments-modified-norms-for-nomination-in-demat-accounts-and-mutual-fund-folios_101703.html, accessed 2026-09-25 (via prior slice fill:G5). v1 value in BE `service/NominationRules.java:25`. **Pre-launch gate:** legal reads the primary PDF. |
| A8 | **Nomination opt-out online** = on-screen declaration plus 2FA OTP. No signed-form upload. | v1 required an upload (BE `service/NomineeService.java:481-520`) because it was a distributor-mediated path. For an online self-serve channel the declaration is authenticated by the OTP (CNF-01), bound by hash to the declaration text. **Pre-launch gate:** legal sign-off, recorded in the compliance log. |
| A9 | **US/Canada tax residents are blocked.** Other foreign tax residency is allowed with TIN capture and an ops FATCA review. | Common AMC policy for US/Canada persons. It removes a class of AMC rejections. |
| A10 | **PEP or relative-of-PEP:** onboarding continues, but the account is held in "Additional review" until ops enhanced due diligence approves it. | PMLA EDD for PEPs. |
| A11 | **Platform cap per lumpsum order:** ₹25,00,000 (config; ops can raise it per investor). **UPI per-transaction cap:** ₹5,00,000 (config). | NPCI capital-markets UPI limit raised to ₹5L per transaction from 2025-09-15 (https://stablemoney.in/blog/npci-raises-upi-limit, https://www.outlookmoney.com/banking/upi-daily-transaction-limits-raised-to-rs-5-lakh-for-select-categories, accessed 2026-09-25). The ₹25L cap limits fraud blast radius. |
| A12 | **Collections are rule-based filters**, labelled "Filters, not recommendations". No "best", "top picks" or "recommended" wording anywhere. The platform is never called an "advisor". | Consistent with the execution-only EUIN declaration and MFD conduct rules. |
| A13 | **External (CAS) holdings are never merged** into Sanchay totals. They get their own card and view. | Brief requirement ("shown separately"). |

### 0.3 v1 defects this spec designs out (must not recur)

| v1 defect | Where | v2 screen rule |
|---|---|---|
| Nine compliance attributes defaulted: gender→female, occupation→service, income→upto_1lakh, PEP→not_applicable, source_of_wealth→salary, country_of_birth→IN, place_of_birth→city | BE `integration/RealCybrillaClient.java:2587-2606, 2808-2899`. UI PEP select pre-set to "No" in FE `views/InvestorOnboarding.tsx:3291-3310` | ONB-05/06/07: every declaration field is required and has **no preselected value**. The server rejects a missing value with 422. There is no default path in the FP payload builder. |
| T&C was a placeholder sentence, not a real document | BE `service/ConsentTexts.java:27-29` | ONB-15 serves real, versioned documents (id, version, sha256) and shows the full text before acceptance. |
| An FP purchase was created before any 2FA challenge existed; the purchase 2FA hash always mismatched | BE `service/OrderService.java:529,601-608`; `TransactionApprovalService.java:474-518` | All flows: **the draft is local only; the FP write happens only after CNF-01 confirm consumes the challenge.** Consent hash is computed from the persisted snapshot (microsecond-normalised). |
| Full redemption of an estimated holding was refused **after** OTP/consent had been spent | BE `service/OrderService.java:1880-1892` | RED-01 blocks estimated or unconfirmed units **before** CNF-01. The server returns `redeemable=false` with a reason. |
| No NAV cut-off logic and no ELSS lock-in | fill:G3, fill:G6 | Server returns `navApplicability` and `lockedUnits` on every quote. Screens INV/SIP/RED/SWT/STP/SWP display them. |
| Self-serve bank add force-verified locally regardless of penny drop | BE `service/InvestorService.java:1451-1477` | ONB-09 reaches `VERIFIED` only on a real FP verification result. |
| Redemption confirmation showed no folio, units or value (compliance FAIL item 9) | 2026-09-03 compliance review | RED-02 and CNF-01 show folio, units, estimated value, payout bank, exit load and tax notices. |

---

## 1. Global conventions (every screen inherits these)

### 1.1 Screen IDs
Format: `<MODULE>-<NN>`. The IDs are stable and must not be renumbered; new screens get new numbers.

| Prefix | Module |
|---|---|
| PUB | Public (web) |
| AUTH | Sign-up and login |
| ONB | Onboarding |
| HOME | Home |
| EXP | Explore |
| FUND | Fund detail |
| INV | Lumpsum |
| SIP | SIP setup |
| CNF | Shared consent/OTP and result |
| PAY | Payment |
| ORD | Orders |
| PORT | Portfolio |
| RED | Redeem |
| SWT | Switch |
| STP | STP |
| SWP | SWP |
| SIPM | Systematic plan management |
| MND | Mandates |
| STM | Statements and tax |
| CAS | External holdings |
| PRF | Profile |
| NTF | Notifications |
| HLP | Help |
| ACC | Account closure |
| SYS | System |

### 1.2 Standard states ("S-std")
Unless a screen overrides them:

| State | Behaviour |
|---|---|
| Loading | Skeleton blocks shaped like the final layout. No spinners on full screens. Anything over 10 s shows ERR-TIMEOUT with Retry. |
| Empty | Illustration-free (low-end Android). One sentence plus one primary CTA. |
| Error | Inline banner at the top of the content area. Copy comes from the §1.6 catalogue. Retry button. Previously loaded data stays visible and is marked "Last updated hh:mm". |
| Success | Content, plus a toast on mutations ("Saved"). |
| Offline | SYS-03 banner. Cached reads (Home, Portfolio, Orders) are shown read-only. All mutations are disabled with "You're offline". |

### 1.3 Formatting (port of FE `v2-ui/lib/format.ts`)

| Item | Rule |
|---|---|
| Money | `en-IN` grouping. Compact above ₹1,00,000 → "₹1.2 L" and above ₹1,00,00,000 → "₹1.2 Cr" in summaries only (FE `v2-ui/lib/format.ts:11-19`). Exact values with 2 decimals on review, confirmation, statement and order detail screens. |
| Units | 3 decimals (e.g. 12.345). |
| NAV | 4 decimals with the NAV date ("₹45.1234 as of 24 Sep 2026"). |
| XIRR | Stored as a fraction, shown ×100 with 1 decimal (FE `v2-ui/lib/format.ts:42`). If the value is null, show "—" with tooltip "Not enough data to compute yet". |
| Gains | Green for ≥0 and rust for <0, **always** with a +/− sign as well; colour is never the only signal. |
| Dates | `dd MMM yyyy`; times `hh:mm a IST`. |
| Valuation honesty | Never show invested money in a current-value slot. If units are unknown, `currentValue=null` and the UI shows "Value pending — ₹X invested" (FE `v2-ui/lib/format.ts:89-107`; BE `service/HoldingsService.java:237-252`). Partial valuation shows a coverage note once per view (FE `v2-ui/lib/format.ts:119-142`). |
| PII masking | PAN `ABCDE****F`, bank `XXXXXX1234`, mobile `98XXXXXX21`, email `ra***@gmail.com`. |

### 1.4 Shared input specs

| Input | Spec |
|---|---|
| **OTP input** (`OtpField`) | 6 numeric boxes; paste fills all. Web: `autocomplete="one-time-code"`, plus WebOTP when the SMS ends with `@app.sanchay.in #<code>`. Android: SMS User Consent API (no READ_SMS permission; needs an Expo config plugin/native module). iOS: `textContentType="oneTimeCode"`. Resend link unlocks after 30 s. Expiry 5 min; 5 wrong attempts invalidate the code; hashed storage (v1 `application.yml:224-229`; BE `service/OtpService.java:155-163`). Limits: at most 5 sends per identifier per hour; 10 failed verifies per 24 h locks the identifier (AUTH-09). |
| **Amount input** (`AmountField`) | Numeric keypad; whole rupees only; `en-IN` grouping while typing; quick-add chips. Min, max and multiple come from `/v1/funds/{id}` thresholds (FP `thresholds[]`, `min_initial_investment`, `min_additional_investment`, `amount_multiples`; fill:G1). Errors: ERR-AMT-MIN, ERR-AMT-MAX, ERR-AMT-MULT. |
| **Consent checkbox** | Always starts unticked. It is never pre-ticked, even when resuming a flow. The text is served by the server with `{key, version, sha256}` and the client echoes the sha256 on submit (FE `v2-ui/lib/approvalConsent.ts:282-298` pattern, fail-closed). |
| **Selects for declarations** | Placeholder "Select…"; no default value. Radios have no preselection. |

### 1.5 CNF: the shared consent, 2FA and result pattern
Every money-moving or sensitive action uses the same two-step server contract:
1. `POST /v1/<resource>` (or `/v1/challenges`) creates a **local draft plus a challenge**. There is **no FP call** at this step. The response is `{challengeId, consentText, consentKey, consentVersion, consentSha256, snapshotSummary, otpDestinations:{mobileMasked,emailMasked}, expiresAt}`.
2. `POST /v1/challenges/{id}/confirm {otp, consentAccepted:true, consentSha256}`. The server verifies the OTP, recomputes the snapshot hash from persisted state, and **only then** performs the FP writes (create, consent, confirm) and returns `{result, next:{type:'payment'|'mandate'|'done', handoff?}}`.

This is the v2 fix for the v1 defects in §0.3. The exact-once gate is ported from BE `service/TransactionApprovalService.java:474-518`, with the challenge created **before** any provider call.

### 1.6 Error copy catalogue

| Code | When | Copy |
|---|---|---|
| ERR-NET | Network failure | "Can't reach Sanchay. Check your connection and try again." |
| ERR-TIMEOUT | Request over 10 s | "This is taking longer than usual. Try again." |
| ERR-SERVER | 5xx | "Something went wrong on our side. Your money is safe — nothing was submitted. Try again in a minute." (Use the "nothing was submitted" wording only when the server confirms no FP write happened; otherwise say "We're checking the status of your request" and route to ORD-02.) |
| ERR-SESSION | 401 after refresh fails | "For your security, please log in again." Route to AUTH-02 with a return path. |
| ERR-RATE | 429 | "Too many attempts. Try again after {time}." |
| ERR-OTP-WRONG | Wrong OTP | "That code doesn't match. {n} attempts left." |
| ERR-OTP-EXP | Expired OTP | "This code has expired. Tap Resend for a new one." |
| ERR-OTP-MAX | Attempts exhausted | "Too many incorrect attempts. Request a new code." |
| ERR-AMT-MIN | Below minimum | "Minimum amount for this fund is ₹{min}." |
| ERR-AMT-MAX | Above maximum | "Maximum amount for a single order is ₹{max}." |
| ERR-AMT-MULT | Not a valid multiple | "Enter an amount in multiples of ₹{m}." |
| ERR-MAINT | 503 maintenance | SYS-02 copy |
| ERR-FP-DOWN | FP unavailable after retries | "Our fund partner is temporarily unavailable. Nothing was submitted. Please try again shortly." |
| ERR-VERSION | 426 | SYS-01 |

### 1.7 Disclosure catalogue (DSC). Screens reference these codes.

| Code | Required copy / content | Basis |
|---|---|---|
| DSC-01 | "Mutual Fund investments are subject to market risks, read all scheme related documents carefully." Footer of Explore, Fund detail, every checkout review, and the public site. | AMFI standard warning for MFD communications |
| DSC-02 | MFD identity: "Sanchay is operated by {legal entity}, an AMFI-registered Mutual Fund Distributor, ARN-{PLATFORM_ARN} (valid till {date}). We are a distributor, not an investment adviser." Footer everywhere and in PRF-12. | AMFI MFD code of conduct / ARN display |
| DSC-03 | Regular plan and commission: "You are investing in the Regular plan. Sanchay receives a commission from {AMC} for this scheme ({trail}% p.a. trail). Regular plans have a higher expense ratio than the Direct plan of the same scheme." Plus a link to the commission disclosure page listing all schemes. Shown on Fund detail and every purchase/SIP/switch/STP review. | Distributor commission-disclosure norms (SEBI 2009 circular on disclosure of commissions for competing schemes; AMFI MFD master circular AMFI/MFD-CIR/32/2025-26 https://www.amfiindia.com/uploads/AMFI_Master_Cicular_for_MF_Ds_3c7f5ee44f.pdf, accessed 2026-09-25) |
| DSC-04 | "Past performance may or may not be sustained in future." Next to every return figure or chart. | SEBI advertisement norms |
| DSC-05 | Riskometer level (Low / Low to Moderate / Moderate / Moderately High / High / Very High) with the benchmark riskometer. For debt schemes, the Potential Risk Class matrix. | SEBI product labelling |
| DSC-06 | NAV applicability: server-provided sentence, e.g. "Pay before 2:45 PM today (business day) to get today's NAV. Units are allotted at the NAV of the day your money reaches the AMC before the cut-off." Liquid/overnight purchase: 1:30 PM. Redemption: 3:00 PM; overnight schemes online: 7:00 PM. | SEBI cut-off rules; overnight redemption revision SEBI/HO/IMD/PoD2/P/CIR/2025/56 effective 2025-06-01 (https://www.sebi.gov.in/legal/circulars/apr-2025/change-in-cut-off-timings-to-determine-applicable-nav-with-respect-to-repurchase-redemption-of-units-in-overnight-schemes-of-mutual-funds_93541.html, accessed 2026-09-25) |
| DSC-07 | "Stamp duty of 0.005% (₹{x}) is deducted from your investment before units are allotted." | Indian Stamp Act amendment; v1 BE `service/OrderService.java:72,834` |
| DSC-08 | Execution-only: "I confirm this is an execution-only transaction. I chose this scheme myself, without any advice or interaction with a Sanchay employee, so the EUIN has been left blank." Embedded in the CNF-01 consent text for purchases, SIP, switch and STP. | AMFI EUIN execution-only declaration (e.g. https://www.wealthy.in/partner-desk/partner-blog/euin-number-in-mutual-fund-537, accessed 2026-09-25) |
| DSC-09 | Exit load: scheme terms (e.g. "1% if redeemed within 365 days") plus the estimated load for this order, marked "estimated". Also "The AMC applies the actual exit load at processing time." | SID; v1 consent text BE `service/TransactionConsentTemplates.java:264-267` |
| DSC-10 | ELSS lock-in: "Each ELSS purchase and each SIP instalment is locked in for 3 years from its allotment date." | ELSS scheme rules |
| DSC-11 | "Tax figures are estimates for information only and are not tax advice." | Scope limitation |
| DSC-12 | "Pay only from your registered bank account {bank ••1234}. Payments from other accounts are rejected and refunded." | Third-party payment prohibition |
| DSC-13 | SIP mandate: "This sets up a standing instruction. Each instalment is debited automatically on its date without a new OTP, until you cancel. The per-debit limit registered with your bank is ₹{limit}." | v1 BE `service/TransactionConsentTemplates.java:197-233`; SEBI 2FA at registration only |
| DSC-14 | IDCW option: "IDCW amounts may be paid out of your own capital (equalisation reserve) and are not guaranteed." | SEBI IDCW disclosure |
| DSC-15 | Privacy notice (DPDP Rules 2025): purposes, data categories, retention, rights, grievance officer contact, and how to withdraw consent. | DPDP Act 2023 / Rules notified 2025-11-13 |
| DSC-16 | Nomination opt-out implications: server-served text version `v2` (port of FE `utils/nomination.ts:33-48`). | SEBI nomination circular 2026 |
| DSC-17 | KYC data consent: "I consent to Sanchay retrieving and updating my KYC records with KRAs and CKYC (CERSAI) to open and maintain my mutual fund account." Aadhaar: "I voluntarily share my Aadhaar via DigiLocker for KYC. My Aadhaar number is not stored." | KYC / Aadhaar Act |
| DSC-18 | "These are rule-based filters, not recommendations. Criteria: {criteria}." | A12 |
| DSC-19 | "External holdings are read from your CAS dated {date}. They are for information only and can't be transacted in Sanchay." | A13 |
| DSC-20 | Settlement: "Money is usually credited within {n} working days after processing (T+{n}); some categories take longer." `n` is server-provided per category (equity T+2). | AMFI/SEBI settlement timelines |
| DSC-21 | Grievance: Sanchay grievance officer (name, email, phone), escalation matrix, AMFI investor complaints link, SEBI SCORES (https://scores.sebi.gov.in), SMART ODR (https://smartodr.in). | Grievance redressal |
| DSC-22 | "Estimated" badge rule: any value that is not registrar-confirmed carries the "Estimated" label and a tooltip. | v1 holdings-honesty decision |

### 1.8 API conventions (proposed contract for the NestJS backend)
- Base path `/v1`; JSON only.
- Error envelope `{code, message, fieldErrors:[{field,code,message}]}`. Field codes map 1:1 to the copy in this document.
- Web: httpOnly `Secure` `SameSite=Lax` session and refresh cookies, plus a CSRF token header on mutations.
- Native: a short-lived access token held in memory and a rotating refresh token in `expo-secure-store`, device-bound.
- Every money-moving POST carries `Idempotency-Key` (UUIDv7).
- Lists are cursor-paginated with page size 20.
- `GET /v1/app/config` returns `{minAppVersion, maintenance, cutoffs, holidayCalendarUrl, flags, limits}`.

### 1.9 Analytics conventions
- Event names use `snake_case` `<module>_<object>_<action>`, e.g. `onb_pan_submitted`.
- Auto `screen_view` fires with `screen_id` equal to the ID in this document.
- Global properties: `platform` (web/android/ios), `app_version`, `onboarding_stage`, `is_guest`, `session_id`.
- **Never send:** PAN, name, email, mobile, bank number, exact DOB, OTP, or free text. Amounts are sent as buckets (`<1k, 1-5k, 5-25k, 25k-1L, 1-5L, >5L`).
- Event data is processed in-region (ap-south-1) or stripped of personal data (DPDP).

### 1.10 Web vs native, global rules

| Concern | Web (Next.js 16) | Native (Expo Router) |
|---|---|---|
| Nav chrome | ≥1024 px: top header plus left rail. <1024 px: bottom tab bar identical to native. | Bottom tabs (§2.2). Flows open as full-screen stacks or modals. |
| External handoffs (DigiLocker, eSign, netbanking, eNACH) | Same-tab redirect to the provider; return to `/r/{kind}?ref=` (SYS-05). | `expo-web-browser` `openAuthSessionAsync` with return URL `sanchay://r/{kind}` (falls back to an app link). Then the app re-reads status from the server. **Never trust the return URL alone.** |
| UPI pay | Desktop: QR generated from the FP UPI URI, plus a "pay with UPI ID" field. Mobile web on Android: `upi://` intent link. | Android: `upi://pay` intent with the system chooser. iOS: app buttons for installed UPI apps (declare `LSApplicationQueriesSchemes`: gpay, phonepe, paytmmp, bhim, cred). |
| Files | `<input type=file>` and direct download. | `expo-document-picker`; downloads via `expo-file-system` plus the `expo-sharing` share sheet. |
| Biometrics / app lock | Not applicable. | `expo-local-authentication` plus a 4-digit app PIN (AUTH-06/07). |
| Push | Not at launch; email/SMS/in-app only. | `expo-notifications` (NTF-03 primer). |
| Screenshots | Not applicable. | `expo-screen-capture` blocks capture on AUTH-03/05, CNF-01 and ONB-08 (full account number entry). |
| Performance (low-end Android) | Server components for public pages; JS budget under 170 KB gzipped per authenticated route. | FlashList for all lists; no Lottie or heavy motion; charts as lightweight SVG paths; AMC logos 24 px WebP, cached. |
| Accessibility | WCAG 2.2 AA; 44 px targets; focus rings. | Dynamic type up to 200%; 48 dp targets; screen-reader labels on all money values (e.g. "Current value 1 lakh 20 thousand rupees"). |

---

## 2. Navigation maps

### 2.1 Web routes

| Area | Route | Screen(s) | Auth |
|---|---|---|---|
| Public | `/` | PUB-01 | none |
| Public | `/mutual-funds` | EXP-01 | none (guest) |
| Public | `/mutual-funds/search?q=` | EXP-02 | none |
| Public | `/mutual-funds/category/[category]/[subCategory?]` | EXP-03 (+EXP-04/05 as sheets) | none |
| Public | `/mutual-funds/collections/[slug]` | EXP-06 | none |
| Public | `/mutual-funds/amc/[amcSlug]` | EXP-07 | none |
| Public | `/mutual-funds/[schemeSlug]` | FUND-01 (+FUND-02/03 sheets) | none |
| Public | `/legal/[doc]`, `/grievance`, `/commission-disclosure`, `/account-deletion` | PUB-02 | none |
| Auth | `/login` | AUTH-02→03 (→04→05 on signup) | none |
| Onboarding | `/onboarding` | ONB-00 | session |
| Onboarding | `/onboarding/{pan,kyc-status,digilocker,personal,address,tax,bank,bank/verify,kyc-media,esign,nominee,nominee/[id],nominee/opt-out,declarations,review,setup,pending,blocked,done}` | ONB-01…20 | session |
| App | `/home` | HOME-01, HOME-02 (`/home/todo`) | session |
| App | `/invest/[schemeId]/lumpsum` → `/review` | INV-01, INV-02 | READY |
| App | `/invest/[schemeId]/sip` → `/mandate` → `/review` | SIP-01…03 | READY |
| App | `/confirm/[challengeId]` | CNF-01 | session |
| App | `/pay/[orderId]` | PAY-01 | READY |
| App | `/result/[orderId]` | CNF-02 | session |
| App | `/portfolio` (tabs `?tab=holdings\|sips\|orders\|external`) | PORT-01, SIPM-01, ORD-01, CAS-05 | session |
| App | `/portfolio/holdings/[holdingId]` | PORT-02 | session |
| App | `/portfolio/holdings/[holdingId]/{redeem,redeem/review,switch,switch/target,switch/review,stp,stp/review,swp,swp/review}` | RED/SWT/STP/SWP | READY |
| App | `/orders/[orderId]` | ORD-02 | session |
| App | `/plans/[planId]`, `/plans/[planId]/{pause,modify,step-up,cancel}` | SIPM-02…06 | READY |
| App | `/mandates`, `/mandates/new`, `/mandates/[id]` | MND-01,02,04 (MND-03 handoff) | READY |
| App | `/reports`, `/reports/{capital-gains,transactions,elss}` | STM-01…04 (STM-05 sheet) | session |
| App | `/external`, `/external/{import,import/upload,import/email,import/[uploadId],[holdingId],imports}` | CAS-01…07 | session |
| App | `/account`, `/account/{personal,declarations,contact,banks,banks/[id],nominees,kyc-change,tax,security,privacy,legal}` | PRF-01…12 | session |
| App | `/notifications`, `/account/notifications` | NTF-01, NTF-02 | session |
| App | `/help`, `/help/[slug]`, `/help/contact`, `/help/tickets`, `/help/tickets/[id]`, `/help/grievance` | HLP-01…05 | public (tickets need a session) |
| App | `/account/close`, `/account/close/{checks,confirm,status}` | ACC-01…04 | session |
| System | `/r/[kind]` (digilocker, esign, payment, mandate) | SYS-05 | session |

**Web header (≥1024 px):** logo · Explore · Portfolio · Orders · Reports, search box (EXP-02), bell (NTF-01), avatar menu (Account, Mandates, External holdings, Help, Log out). Footer: DSC-01, DSC-02, legal links, grievance (DSC-21).

### 2.2 Native navigation (Expo Router)

```
app/
  _layout.tsx                 (root: providers, SYS-01/02 gate, app-lock gate AUTH-07)
  (guest)/welcome             AUTH-01
  (auth)/phone, otp, email, email-otp, app-lock, locked       AUTH-02..06, AUTH-09
  (onboarding)/[...]          ONB-00..20 (stack, no tabs)
  (tabs)/_layout.tsx          4 tabs
    home/index                HOME-01   (stack: todo HOME-02, notifications NTF-01)
    explore/index             EXP-01    (stack: search, category, collection, amc, fund/[slug])
    portfolio/index           PORT-01 with top segmented tabs: Holdings | Plans | Orders | External
    account/index             PRF-01    (stack: all PRF, MND, STM, HLP, ACC, NTF-02)
  (flows)/ presented as full-screen modal stacks:
    invest/[schemeId]/{lumpsum,review}, sip/{index,mandate,review}
    holding/[id]/{redeem,switch,stp,swp}/...
    plan/[id]/{pause,modify,step-up,cancel}
    confirm/[challengeId]     CNF-01
    pay/[orderId]             PAY-01
    result/[orderId]          CNF-02
  r/[kind]                    SYS-05 deep-link return
```

**Tabs:** Home · Explore · Portfolio · Account. Four tabs keep targets large on 360-dp screens. Orders are reachable from Portfolio › Orders, Home "Recent orders", and notifications.
**Deep links:** `sanchay://` plus app links on `app.sanchay.in` for fund pages, orders, plans, notifications, `/r/*` returns and statement-ready links.

### 2.3 Onboarding stage → access gating

| Stage (server `onboardingStage`) | Home | Explore/Fund | Invest CTAs | Portfolio / Orders | Reports | Account |
|---|---|---|---|---|---|---|
| `GUEST` | n/a | yes | go to AUTH | no | no | no |
| `SIGNED_UP`…`SUBMITTED` (in progress) | HOME-01 "Complete setup" state | yes | go to ONB-00 resume | CAS only | no | yes (limited: contact, security, help, closure) |
| `ACCOUNT_SETUP` / `KYC_PENDING` / `ADDITIONAL_REVIEW` | HOME-01 pending state | yes | go to ONB-18 status | CAS only | no | yes |
| `BLOCKED` / `REJECTED` | HOME-01 blocked state | yes | go to ONB-19 | CAS only | no | yes |
| `READY` | full | yes | yes | yes | yes | yes |

**`READY` requires all of:**
- mobile and email OTP-verified;
- KYC Validated or Registered at the KRA;
- FP `investor_profile` and `mf_investment_account` created;
- at least one bank `VERIFIED`;
- FATCA recorded;
- nomination decided;
- declarations accepted;
- no ops hold.

---

## 3. Screen inventory (master list)

| ID | Screen | Web | Native | Gate |
|---|---|---|---|---|
| PUB-01 | Landing | ✓ | – | none |
| PUB-02 | Public legal / disclosure / grievance / account-deletion pages | ✓ | webview link | none |
| AUTH-01 | Welcome | – (PUB-01) | ✓ | none |
| AUTH-02 | Mobile number (sign up / log in) | ✓ | ✓ | none |
| AUTH-03 | Mobile OTP | ✓ | ✓ | none |
| AUTH-04 | Email address | ✓ | ✓ | partial session |
| AUTH-05 | Email OTP | ✓ | ✓ | partial session |
| AUTH-06 | Set app lock | – | ✓ | session |
| AUTH-07 | Unlock app | – | ✓ | device session |
| AUTH-08 | Log in with email (lost mobile) | ✓ | ✓ | none |
| AUTH-09 | Account temporarily locked | ✓ | ✓ | none |
| ONB-00 | Onboarding hub | ✓ | ✓ | session |
| ONB-01 | PAN, name and DOB | ✓ | ✓ | session |
| ONB-02 | KYC status result (branches) | ✓ | ✓ | session |
| ONB-03 | Aadhaar via DigiLocker: consent and start | ✓ | ✓ | session |
| ONB-04 | Returning from DigiLocker / eSign | ✓ | ✓ | session |
| ONB-05 | Personal details | ✓ | ✓ | session |
| ONB-06 | Address and contact ownership | ✓ | ✓ | session |
| ONB-07 | Tax residency (FATCA/CRS) | ✓ | ✓ | session |
| ONB-08 | Add bank account | ✓ | ✓ | session |
| ONB-09 | Bank verification (penny drop) | ✓ | ✓ | session |
| ONB-10 | Photo, signature and location (new/modify KYC) | ✓ | ✓ | session |
| ONB-11 | eSign KYC form | ✓ | ✓ | session |
| ONB-12 | Nomination decision | ✓ | ✓ | session |
| ONB-13 | Add / edit nominee | ✓ | ✓ | session |
| ONB-14 | Opt out of nomination | ✓ | ✓ | session |
| ONB-15 | Declarations, T&C and privacy | ✓ | ✓ | session |
| ONB-16 | Review and submit | ✓ | ✓ | session |
| ONB-17 | Account setup in progress / additional review | ✓ | ✓ | session |
| ONB-18 | KYC pending with KRA | ✓ | ✓ | session |
| ONB-19 | Blocked / rejected | ✓ | ✓ | session |
| ONB-20 | You're ready | ✓ | ✓ | session |
| HOME-01 | Home dashboard | ✓ | ✓ | session |
| HOME-02 | Things to do | ✓ | ✓ | session |
| EXP-01 | Explore home | ✓ | ✓ | none |
| EXP-02 | Search | ✓ | ✓ | none |
| EXP-03 | Category / fund list | ✓ | ✓ | none |
| EXP-04 | Filters sheet | ✓ | ✓ | none |
| EXP-05 | Sort sheet | ✓ | ✓ | none |
| EXP-06 | Collection | ✓ | ✓ | none |
| EXP-07 | Fund house (AMC) | ✓ | ✓ | none |
| FUND-01 | Fund detail | ✓ | ✓ | none |
| FUND-02 | Returns calculator | ✓ | ✓ | none |
| FUND-03 | Documents and disclosures | ✓ | ✓ | none |
| INV-01 | One-time investment amount | ✓ | ✓ | READY |
| INV-02 | Review one-time order | ✓ | ✓ | READY |
| SIP-01 | SIP details | ✓ | ✓ | READY |
| SIP-02 | Choose / create mandate | ✓ | ✓ | READY |
| SIP-03 | Review SIP | ✓ | ✓ | READY |
| CNF-01 | Consent and OTP (shared) | ✓ | ✓ | session |
| CNF-02 | Result / status (shared) | ✓ | ✓ | session |
| PAY-01 | Payment (UPI / netbanking) and waiting | ✓ | ✓ | READY |
| ORD-01 | Orders list | ✓ | ✓ | session |
| ORD-02 | Order detail and timeline | ✓ | ✓ | session |
| PORT-01 | Portfolio: holdings | ✓ | ✓ | session |
| PORT-02 | Holding detail | ✓ | ✓ | session |
| RED-01 | Redeem setup | ✓ | ✓ | READY |
| RED-02 | Review redemption | ✓ | ✓ | READY |
| SWT-01 | Switch setup | ✓ | ✓ | READY |
| SWT-02 | Switch target picker | ✓ | ✓ | READY |
| SWT-03 | Review switch | ✓ | ✓ | READY |
| STP-01 | STP setup | ✓ | ✓ | READY |
| STP-02 | Review STP | ✓ | ✓ | READY |
| SWP-01 | SWP setup | ✓ | ✓ | READY |
| SWP-02 | Review SWP | ✓ | ✓ | READY |
| SIPM-01 | Systematic plans list | ✓ | ✓ | session |
| SIPM-02 | Plan detail | ✓ | ✓ | session |
| SIPM-03 | Pause / resume plan | ✓ | ✓ | READY |
| SIPM-04 | Modify SIP (amount / date) | ✓ | ✓ | READY |
| SIPM-05 | Step-up (top-up) | ✓ | ✓ | READY |
| SIPM-06 | Cancel plan | ✓ | ✓ | READY |
| MND-01 | Mandates list | ✓ | ✓ | READY |
| MND-02 | Create mandate | ✓ | ✓ | READY |
| MND-03 | Mandate authorisation / status | ✓ | ✓ | READY |
| MND-04 | Mandate detail / cancel | ✓ | ✓ | READY |
| STM-01 | Reports hub | ✓ | ✓ | READY |
| STM-02 | Capital gains | ✓ | ✓ | READY |
| STM-03 | Transaction statement | ✓ | ✓ | READY |
| STM-04 | ELSS summary | ✓ | ✓ | READY |
| STM-05 | Report generation / download sheet | ✓ | ✓ | READY |
| CAS-01 | External holdings intro / choose method | ✓ | ✓ | session |
| CAS-02 | Upload CAS PDF and password | ✓ | ✓ | session |
| CAS-03 | Fetch CAS by email | ✓ | ✓ | session |
| CAS-04 | Import status / result | ✓ | ✓ | session |
| CAS-05 | External holdings list | ✓ | ✓ | session |
| CAS-06 | External holding detail | ✓ | ✓ | session |
| CAS-07 | Import history and delete | ✓ | ✓ | session |
| PRF-01 | Account home | ✓ | ✓ | session |
| PRF-02 | Personal and KYC details | ✓ | ✓ | session |
| PRF-03 | Update declarations | ✓ | ✓ | READY |
| PRF-04 | Change mobile / email | ✓ | ✓ | session |
| PRF-05 | Bank accounts | ✓ | ✓ | session |
| PRF-06 | Bank account detail | ✓ | ✓ | session |
| PRF-07 | Nominees | ✓ | ✓ | READY |
| PRF-08 | Change name / DOB / address (KYC modification) | ✓ | ✓ | READY |
| PRF-09 | Tax residency | ✓ | ✓ | READY |
| PRF-10 | Security and sessions | ✓ | ✓ | session |
| PRF-11 | Privacy and consents | ✓ | ✓ | session |
| PRF-12 | Legal and disclosures | ✓ | ✓ | none |
| NTF-01 | Notification inbox | ✓ | ✓ | session |
| NTF-02 | Notification preferences | ✓ | ✓ | session |
| NTF-03 | Push permission primer | – | ✓ | session |
| HLP-01 | Help centre | ✓ | ✓ | none |
| HLP-02 | Help article | ✓ | ✓ | none |
| HLP-03 | Contact support / raise ticket | ✓ | ✓ | session |
| HLP-04 | My tickets / ticket detail | ✓ | ✓ | session |
| HLP-05 | Grievance and escalation | ✓ | ✓ | none |
| ACC-01 | Close account: intro | ✓ | ✓ | session |
| ACC-02 | Close account: pre-checks | ✓ | ✓ | session |
| ACC-03 | Close account: reason and confirm | ✓ | ✓ | session |
| ACC-04 | Closure request status | ✓ | ✓ | session |
| SYS-01 | Update required | – | ✓ | none |
| SYS-02 | Maintenance | ✓ | ✓ | none |
| SYS-03 | Offline banner | ✓ | ✓ | none |
| SYS-04 | Not found / generic error | ✓ | ✓ | none |
| SYS-05 | Handoff return router | ✓ | ✓ | session |

That is 115 screens in total.

---

## 4. Screen specifications

Each spec gives: Purpose · Entry · Fields · States (overrides of S-std) · Disclosures · APIs · Web vs native · Analytics.

### 4.1 Public

**PUB-01 Landing** (web `/`)
- **Purpose:** Explain Sanchay and drive sign-up and fund discovery. Static and ISR-rendered.
- **Entry:** SEO, ads, direct.
- **Fields:** Mobile number quick-start field (same validation as AUTH-02) → routes to `/login?m=`.
- **Content:** Hero; "How it works" (3 steps); category tiles linking to EXP-03; trust block (DSC-02, ARN, grievance link); FAQ.
- **States:** Static.
- **Disclosures:** DSC-01, DSC-02, DSC-21 in the footer.
- **APIs:** `GET /v1/fund-categories` (build/ISR).
- **Web vs native:** Web only. Native starts at AUTH-01.
- **Analytics:** `pub_landing_cta_clicked{cta}`, `pub_quickstart_submitted`.

**PUB-02 Public legal / disclosure / account-deletion pages** (web `/legal/[doc]`, `/commission-disclosure`, `/grievance`, `/account-deletion`)
- **Purpose:** Publicly reachable versions of T&C, privacy notice, MFD disclosures, commission table, grievance matrix, and account-deletion instructions.
- **Why the deletion page is public:** Google Play requires a deletion web link reachable without installing the app (https://support.google.com/googleplay/android-developer/answer/13327111; not re-fetched this session).
- **Fields:** none.
- **Content:** Rendered from the same versioned documents as ONB-15; shows version and effective date.
- **APIs:** `GET /v1/legal/documents/{key}?version=latest`, `GET /v1/commission-disclosure`.
- **Web vs native:** Native opens these in an in-app browser.
- **Analytics:** `pub_legal_viewed{doc}`.

### 4.2 Sign-up and login (AUTH)

**Design decision:** passwordless. The mobile number is the primary identifier. Sign-up requires mobile OTP **and** email OTP. Login is by mobile OTP; email OTP login (AUTH-08) is the fallback. Native adds a device-bound session with biometric/PIN unlock. This ports the v1 passwordless OTP engine (BE `service/InvestorAuthService`, `OtpService`) minus the distributor gate (`InvestorAuthService.java:259-264`), and adds refresh tokens (missing in v1, `application.yml:211-215`).

**AUTH-01 Welcome** (native)
- **Purpose:** First launch.
- **Content:** One screen with value proposition, DSC-02 line, "Get started" → AUTH-02, "Explore funds" → EXP-01 in guest mode.
- **States:** none.
- **Analytics:** `auth_welcome_cta{cta}`.

**AUTH-02 Mobile number**
- **Purpose:** Start sign-up or login with one screen. The server decides which one after OTP verification, which avoids number enumeration.
- **Entry:** AUTH-01, PUB-01, any Invest CTA as a guest, ERR-SESSION.

| Field | Type | Validation | Error copy |
|---|---|---|---|
| Mobile | tel, `+91` fixed prefix | Strip spaces, `+91`, `91`, leading `0`; match `^[6-9]\d{9}$` (BE `validation/MobileFormat.java:14,28-39`) | "Enter a valid 10-digit Indian mobile number." |
| Terms & privacy consent | checkbox, unticked | Required **only if** the server later reports a new user. It is shown up front: "I agree to the Terms of Use and Privacy Notice" with links. Returning users see a text-only link instead. | "Please accept the Terms and Privacy Notice to continue." |
| WhatsApp/updates consent | checkbox, unticked, optional | none | — |

- **States:** Sending → button spinner. ERR-RATE shows the retry time.
- **Disclosures:** DSC-15 (short privacy notice, link to full), DSC-02 in the footer.
- **APIs:** `POST /v1/auth/otp {channel:'sms', mobile, purpose:'auth'}` returns `{otpRequestId, resendAfter, expiresAt}`.
- **Web vs native:** Native uses the Android phone-number hint (Credential Manager) to prefill.
- **Analytics:** `auth_mobile_submitted`, `auth_mobile_invalid`.

**AUTH-03 Mobile OTP**
- **Purpose:** Verify the mobile number.
- **Fields:** `OtpField` (§1.4).
- **States:** Verifying; wrong/expired/max errors (ERR-OTP-*). Success routes on the server result:
  - existing user → native AUTH-07 setup or Home;
  - new user → AUTH-04;
  - existing user without a verified email → AUTH-04.
- **Copy:** "Enter the 6-digit code sent to +91 98XXXXXX21." Plus a "Change number" link.
- **APIs:** `POST /v1/auth/otp/verify {otpRequestId, code, device:{id,platform,model}, consents:[...]}` returns `{status:'LOGGED_IN'|'NEEDS_EMAIL', session}`; resend: `POST /v1/auth/otp/{id}/resend`.
- **Web vs native:** Auto-read per §1.4. Screen capture blocked on native.
- **Analytics:** `auth_otp_verified{flow:'signup'|'login'}`, `auth_otp_failed{reason}`, `auth_otp_resent`.

**AUTH-04 Email address**
- **Purpose:** Capture the email address that will receive statements, transaction OTPs and AMC communication.

| Field | Validation | Error |
|---|---|---|
| Email | Trimmed, lowercased, ≤254 chars, standard email regex, domain has MX (server), not in the disposable-domain list | "Enter a valid email address." / "Use a permanent personal email — it receives your statements and transaction codes." |

- **Server errors:** `EMAIL_IN_USE` → "This email is linked to another Sanchay account. Use a different email, or log in with that account's mobile number."
- **APIs:** `POST /v1/auth/email {email}` sends the OTP.
- **Analytics:** `auth_email_submitted`, `auth_email_rejected{reason}`.

**AUTH-05 Email OTP**
- Same pattern as AUTH-03.
- **Success:** Email marked verified with method `OTP`. Only a real provider round-trip counts as verified (BE `domain/ContactVerificationMethod.java:19-37`). Routes to AUTH-06 (native) or ONB-00.
- **APIs:** `POST /v1/auth/email/verify`.
- **Analytics:** `auth_email_verified`.

**AUTH-06 Set app lock** (native)
- **Purpose:** Device-level protection after login.

| Field | Validation |
|---|---|
| 4-digit app PIN (enter + confirm) | 4 digits; not all-same; not sequential (1234/4321); must match. Errors: "PINs don't match." / "Choose a less predictable PIN." |
| Use fingerprint/face | toggle, off by default; enabling prompts OS biometrics |

- **Behaviour:** Skippable only for biometrics; the PIN is mandatory.
- **APIs:** `POST /v1/devices {pushToken?, appLockEnabled:true}`. The PIN is **never** sent to the server; it is stored as a salted hash in secure-store.
- **Analytics:** `auth_applock_set{biometric}`.

**AUTH-07 Unlock app** (native)
- **Trigger:** Cold start or background > 5 min.
- **Fields:** biometric prompt, or PIN pad.
- **Rules:** 5 wrong PINs → sign out locally and route to AUTH-02 ("For your security, log in again with OTP"). "Forgot PIN" → AUTH-02.
- **APIs:** On success `POST /v1/auth/refresh` (rotating).
- **Analytics:** `auth_unlock{method}`, `auth_unlock_failed`.

**AUTH-08 Log in with email**
- **Purpose:** Fallback when the mobile is unavailable.
- **Fields:** email + OTP, same as AUTH-04/05.
- **Rules:** After login, a banner "Your registered mobile ••21 wasn't used for this login" is shown and a security alert goes to the mobile and email. Money movement stays allowed; contact changes still need PRF-04 rules.
- **APIs:** `POST /v1/auth/otp {channel:'email', email, purpose:'auth'}`, verify.
- **Analytics:** `auth_email_login`.

**AUTH-09 Account temporarily locked**
- **Trigger:** 10 failed OTP verifies in 24 h, or an ops lock.
- **Copy:** "For your security, sign-in is paused until {time}. If this wasn't you, contact support." → HLP-03 (guest ticket form with mobile + email).
- **APIs:** from error payload `{lockedUntil}`.
- **Analytics:** `auth_locked_viewed`.

### 4.3 Onboarding (ONB)

**Canonical flow and branches**

| Path | When (from ONB-02) | Sequence |
|---|---|---|
| **A: KYC Validated** | KRA status validated and PAN–Aadhaar linked | 01 → 02 → 05 → 06 → 07 → 08 → 09 → 12 (→13/14) → 15 → 16 → CNF-01 → 17 → 20 |
| **B: New or modify KYC** | `kyc_unavailable`, `kyc_rejected` (fresh) → SUBMIT_NEW_KYC; `kyc_incomplete`, `kyc_onhold`, `kyc_legacy`, Registered-not-Validated → MODIFY_KYC (BE `domain/KycReadinessAction.java:35-50`) | 01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 10 → 11 → 04 → 12 → 15 → 16 → CNF-01 → 17 → 18 (KRA processing) → 20 |
| **C: Wait** | `kyc_underprocess` | 02 shows "KYC in process at KRA". The investor may continue filling 05–15 and submit; the account reaches READY only when the KRA confirms. |
| **D: Blocked** | `kyc_deactivated`, PAN invalid, PAN inoperative, name/DOB mismatch after 3 attempts | 02 → 19 |
| **E: Retry** | `upstream_error`, rate-limited | 02 retry state (auto-retry once after 5 s) |
| **F: Manual review** | Any other code | 02 → ops ticket auto-created → 19 (review variant) |

**ONB-00 Onboarding hub**
- **Purpose:** Resumable checklist.
- **Entry:** After AUTH, from the Home "Complete setup" card, or any Invest CTA before READY.
- **Content:** Progress bar plus rows: Identity (PAN/KYC) · Personal details · Address · Tax residency · Bank · Nominee · Agreements · Review. Each row shows Done / Next / Locked.
- **CTA:** "Continue" → first incomplete step.
- **States:** Loading skeleton. When the stage is `ACCOUNT_SETUP|KYC_PENDING|ADDITIONAL_REVIEW|BLOCKED`, redirect to ONB-17/18/19.
- **APIs:** `GET /v1/onboarding` returns `{stage, steps:[{key,status,locked,reason}], kycPath:'A'|'B'|null, next}`.
- **Analytics:** `onb_hub_viewed{stage}`, `onb_resume_clicked{step}`.

**ONB-01 PAN, name and date of birth**
- **Purpose:** Identity anchor and KRA pre-verification input.

| Field | Type | Validation | Error copy |
|---|---|---|---|
| PAN | text, auto-uppercase, 10 chars | `^[A-Z]{5}[0-9]{4}[A-Z]$` (BE `validation/PanFormat.java:15`) and 4th char `P` (A1) | "Enter a valid PAN, e.g. ABCDE1234F." / "Sanchay currently supports individual PANs only." |
| Full name as on PAN | text | 2–100 chars, letters/space/`.`/`'`; uppercased for matching | "Enter your name exactly as printed on your PAN card." |
| Date of birth | date (DD/MM/YYYY) | Valid date, age 18–100 today (v1 `MIN_INVESTOR_AGE_YEARS=18`, FE `utils/kycActionLocks.ts:1`) | "You must be 18 or older to invest on Sanchay." / "Enter a valid date of birth." |
| KYC consent | checkbox, unticked, required (DSC-17 KRA/CKYC part) | required | "Please allow us to check your KYC records to continue." |

- **Server errors:**
  - `PAN_IN_USE`: "This PAN is already registered with another Sanchay account (mobile ending ••42). Log in with that number or contact support."
  - `PAN_INVALID`: "The Income Tax Department doesn't recognise this PAN. Check and re-enter."
  - `NAME_MISMATCH` / `DOB_MISMATCH`: "Your name/date of birth doesn't match PAN records. Enter them exactly as on your PAN card." (3 attempts, then branch D).
  - Throttle: at most 5 checks per hour; a 15-minute recheck cooldown applies while PAN/name/DOB are unchanged (BE `service/IdentityCheckThrottle.java:28-30`, `service/IdentityVerificationState.java:27`).
- **States:** Submitting → "Checking your KYC records…" (up to 20 s, then ONB-02 in RETRY).
- **Behaviour:** Any later change to PAN/name/DOB invalidates the check (fingerprint rule, FE `utils/kycPreVerification.ts:1065`).
- **Disclosures:** DSC-17, and "Your PAN is used only for KYC and your investments."
- **APIs:** `PUT /v1/onboarding/identity {pan,name,dob,consentSha256}` → `POST /v1/onboarding/kyc-check` → `{checkId, status, code, action}`; poll `GET /v1/onboarding/kyc-check/{id}`.
- **Web vs native:** Native date field uses a numeric masked input, not a picker (faster on low-end devices).
- **Analytics:** `onb_pan_submitted`, `onb_pan_rejected{reason}`.

**ONB-02 KYC status result**
- **Purpose:** Explain the KRA result and route to the next step.

| Server action | Title / body copy | CTA |
|---|---|---|
| PROCEED (Validated) | "Your KYC is verified." / "We found your KYC records. Next, a few details for your account." | Continue → ONB-05 |
| MODIFY_KYC | "Your KYC needs a quick update." / "Complete it online with Aadhaar via DigiLocker and eSign. Takes about 5 minutes." | Update KYC → ONB-03 |
| SUBMIT_NEW_KYC | "Let's complete your KYC." / "Use Aadhaar via DigiLocker — fully online, no documents to upload." | Start KYC → ONB-03 |
| WAIT | "Your KYC is being processed by the KRA." / "You can fill in the rest now; investing unlocks once it's approved (usually 2–3 working days)." | Continue → ONB-05 |
| BLOCKED | "We can't open your account right now." / reason: KYC deactivated, or PAN inoperative ("Link your PAN with Aadhaar on the Income Tax portal, then try again after 7 days") | Contact support / Check again |
| RETRY | "KYC records are temporarily unavailable." | Try again (auto once) |
| MANUAL_REVIEW | "We need to review your details." / "Our team will get back within 2 working days." | Go to Home |

- **Rule:** PAN-not-Aadhaar-linked and KYC-pending **do not** block data entry (v1 blocking matrix, Cybrilla review Item 2). An inoperative PAN blocks.
- **APIs:** `GET /v1/onboarding/kyc-check/{id}`, `POST /v1/onboarding/kyc-check` (retry).
- **Analytics:** `onb_kyc_result{action}`.

**ONB-03 Aadhaar via DigiLocker: consent and start** (path B)
- **Purpose:** Get the Aadhaar-based identity and address proof.
- **Fields:** Consent checkbox (DSC-17 Aadhaar part), unticked, required. Error: "Please give consent to fetch your Aadhaar from DigiLocker."
- **Content:** 3-step explainer (Log in to DigiLocker → Allow Sanchay → Come back here). Alternative: "Don't have Aadhaar linked to your mobile? Contact support" → HLP-03 (no OVD upload path at launch).
- **States:** Starting → the handoff URL is fetched and opened.
- **APIs:** `POST /v1/kyc/digilocker/start` returns `{redirectUrl, identityDocumentId}` (v1 `POST /investor/kyc/identity-documents`, FE `v2-ui/screens/KycScreen.tsx:22-30`).
- **Web vs native:** §1.10 handoff rules.
- **Analytics:** `onb_digilocker_started`.

**ONB-04 Returning from DigiLocker / eSign**
- **Purpose:** Verify the handoff result on the server; never trust the URL.
- **States:**
  - Processing ("Fetching your details…", polling every 2 s up to 60 s).
  - Success → next step. DigiLocker prefills name, gender and address in ONB-05/06; eSign → ONB-12.
  - Failure (user cancelled, DigiLocker error, name mismatch between Aadhaar and PAN) → copy per reason with "Try again". The mismatch case gets: "Your name on Aadhaar differs from PAN. Update one of them and try again, or contact support."
  - Timeout → "Still waiting for DigiLocker. We'll notify you when it's done." with a Refresh button.
- **APIs:** `POST /v1/kyc/digilocker/refresh`, `POST /v1/kyc/esign/refresh`.
- **Analytics:** `onb_handoff_returned{kind,result}`.

**ONB-05 Personal details** (all required; **no field preselected**; server 422 on any missing value)

| Field | Type / options (FP mapping) | Validation / condition | Error |
|---|---|---|---|
| Gender | radio: Male / Female / Transgender (FP `male/female/transgender`, BE `RealCybrillaClient.java:2813-2817`) | Required. Prefilled only from DigiLocker (then shown as "from Aadhaar", editable → forces path-B modify) | "Select your gender." |
| Marital status | radio: Single / Married / Others | Required | "Select your marital status." |
| Father's name / Spouse's name | radio choice + text | Path B only (KRA form); 2–100 letters | "Enter your father's or spouse's name." |
| Occupation | select: Private sector service, Public sector service, Government service, Business, Professional, Agriculture, Retired, Homemaker, Student, Doctor, Forex dealer, Others (FP enum per BE `RealCybrillaClient.java:2828-2830`) | Required | "Select your occupation." |
| Annual income | select: Up to ₹1 L / ₹1–5 L / ₹5–10 L / ₹10–25 L / Above ₹25 L (FP `upto_1lakh`, `between_1_to_5_lakhs`, `between_5_to_10_lakhs`, `between_10_to_25_lakhs`, `above_25_lakhs`, BE `RealCybrillaClient.java:2843-2856`) | Required | "Select your annual income range." |
| Source of wealth | select: Salary, Business income, Gift, Ancestral property, Rental income, Prize money, Royalty, Others | Required | "Select your main source of wealth." |
| Politically exposed person | radio: "I am a PEP" / "I am related to a PEP" / "Neither" (with an info tooltip defining PEP) | Required; no default (fixes FE `views/InvestorOnboarding.tsx:3291-3310`) | "Please answer this question." |
| Country of birth | searchable country select | Required | "Select your country of birth." |
| Place (city) of birth | text | Required; 2–60 chars | "Enter your city of birth." |
| Nationality | radio: Indian / Other | Required; Other → block (A1) | "Sanchay currently supports Indian nationals only." |
| Resident of India for tax? | radio Yes / No | Required; No → block with an "NRI support coming soon" waitlist | — |

- **States:** Save on Continue. Server field errors map inline.
- **Behaviour:** PEP ≠ Neither → info banner "Your account will need an additional review (up to 2 working days) before you can invest." (A10).
- **APIs:** `PUT /v1/onboarding/personal`.
- **Contract note:** The exact FP enum values for `source_of_wealth` and `pep_details` must be pinned by a sprint-0 contract test against the FP `investor_profiles` schema. v1 used `applicable`/`not_applicable` for PEP (BE `RealCybrillaClient.java:2876-2885`).
- **Analytics:** `onb_personal_saved{pep_flag:boolean}`. Only the boolean, never the answer text.

**ONB-06 Address and contact ownership**

| Field | Validation | Error |
|---|---|---|
| Address line 1 / line 2 | line1 required 5–100 chars; line2 optional ≤100 | "Enter your house/flat and street." |
| Pincode | `^[1-9][0-9]{5}$`; lookup autofills city/state (port FE `components/PincodeCityFields.tsx`) | "Enter a valid 6-digit pincode." |
| City / State | required; state from list | "Select your state." |
| Correspondence address same as permanent? | radio Yes / No, no default; No → second address block | "Please choose an option." |
| Mobile belongs to | select: Self / Spouse / Dependent child / Dependent sibling / Dependent parent / Guardian (FP `belongs_to`) | required | "Tell us whose mobile number this is." |
| Email belongs to | same list | required | same |

- **Rules:** Path B locks the permanent address from Aadhaar (shown read-only with the note "From Aadhaar. To change it, update Aadhaar first."). Path A prefills from KRA when available and allows edits.
- **Disclosures:** "As per SEBI rules, a family member's mobile/email may be used only for the relationships listed."
- **APIs:** `PUT /v1/onboarding/address`, `PUT /v1/onboarding/contact-ownership`, `GET /v1/ref/pincodes/{pin}`.
- **Analytics:** `onb_address_saved{same_as_permanent}`.

**ONB-07 Tax residency (FATCA/CRS)**

| Field | Validation | Error |
|---|---|---|
| Tax resident of any country other than India? | radio Yes / No, no default | "Please answer this question." |
| (if Yes) Country 1–3 | country select; US or Canada → block (A9) | "We currently can't open accounts for US or Canadian tax residents." |
| (if Yes) TIN / reason for no TIN | TIN 3–20 alphanumeric, or reason select (Country doesn't issue / Not yet obtained) | "Enter your tax ID or select a reason." |
| Declaration | checkbox unticked, server text key `fatca_crs_declaration` (improved v1 BE `service/ConsentTexts.java:31-37`) | "Please confirm the declaration." |

- **Rules:** Yes (non-US/CA) → the account goes to ONB-17 "additional review" (ops FATCA review).
- **Integrity rule:** The FATCA snapshot must be internally consistent. v1 produced "Tax residency other than India: India" (2026-09-24 run, U3). The server derives `taxResidentOtherCountry` from rows, never from a separate flag.
- **APIs:** `PUT /v1/onboarding/tax-residency`.
- **Analytics:** `onb_fatca_saved{foreign:boolean}`.

**ONB-08 Add bank account**

| Field | Validation | Error |
|---|---|---|
| IFSC | auto-uppercase, `^[A-Z]{4}0[A-Z0-9]{6}$` (FE `views/InvestorOnboarding.tsx:190`); lookup shows bank + branch | "Enter a valid 11-character IFSC." / "We couldn't find this IFSC." |
| Account number | masked numeric, `^\d{9,18}$` (FE `views/InvestorOnboarding.tsx:191`) | "Enter a valid account number (9–18 digits)." |
| Confirm account number | must equal the field above; paste allowed | "Account numbers don't match." |
| Account type | radio Savings / Current, no default. NRE/NRO not offered (A1) | "Select account type." |

- **Content:** "The account must be in your name. Your investments are paid from and redeemed into this account." "Search IFSC by bank & branch" sheet.
- **Rules:** Duplicate (same account + IFSC) → reuse the existing record (BE `service/InvestorService.java:779-783`). At most 5 bank accounts per investor.
- **APIs:** `GET /v1/ref/ifsc/{ifsc}`, `POST /v1/bank-accounts` (starts FP bank-account creation and penny drop).
- **Web vs native:** Screen capture blocked on native.
- **Analytics:** `onb_bank_submitted`, `onb_ifsc_lookup_failed`.

**ONB-09 Bank verification (penny drop)**
- **Purpose:** Show the real verification outcome.
- **States:**
  - Verifying ("We're depositing ₹1 to verify your account…"; poll every 3 s up to 90 s).
  - `VERIFIED` → show "Account holder: R*** K***" and Continue.
  - `NAME_MISMATCH` (FP verification completed with low name match) → "The name on this bank account doesn't match your PAN." Options: upload a cancelled cheque or bank statement (PDF/JPG/PNG, ≤5 MB, magic-byte checked, port of BE `service/InvestorDocumentService.java:32-64`) → ops review; or add a different account.
  - `FAILED` (invalid, closed or unsupported) → "We couldn't verify this account: {reason}. Check the details or try another account." At most 3 attempts per account per day.
  - `PENDING_LONG` (>90 s) → "Your bank is slow to respond. We'll notify you." Continue is allowed but READY stays gated.
- **Hard rule:** Never force-verify locally (fixes BE `service/InvestorService.java:1451-1477`).
- **APIs:** `GET /v1/bank-accounts/{id}`, `POST /v1/bank-accounts/{id}/proof` (multipart).
- **Analytics:** `onb_bank_verification{result}`.

**ONB-10 Photo, signature and location** (path B, shown when FP `kyc_request.fieldsNeeded` includes them)

| Field | Spec | Validation / error |
|---|---|---|
| Live photo | Front camera capture with face-in-oval guide; no gallery upload | Server face-detect OK; "Make sure your face is clearly visible, in good light." |
| Signature | Draw on a pad (web canvas / native Skia canvas), or photo of a wet signature on white paper | Non-empty, ≥ minimum stroke length; "Sign inside the box." |
| Location | Device geolocation permission | Must be in India; "Allow location access — KYC rules require it." / "KYC must be completed from within India." |

- **States:** Permission denied → an explainer with a "Open settings" deep link on native, or browser instructions on web.
- **APIs:** `POST /v1/kyc/media {type:'photo'|'signature', file}`, `POST /v1/kyc/geolocation`.
- **Web vs native:** Web uses `getUserMedia`; native uses `expo-camera` and `expo-location` (foreground only).
- **Analytics:** `onb_kyc_media_captured{type}`, `onb_permission_denied{perm}`.

**ONB-11 eSign KYC form** (path B)
- **Purpose:** Aadhaar OTP eSign of the KYC application.
- **Content:** Preview of the generated KYC form PDF (read-only), and "You'll sign with an OTP sent to your Aadhaar-linked mobile."
- **CTA:** "eSign now" → handoff → ONB-04.
- **APIs:** `POST /v1/kyc/esign/start` returns `{redirectUrl}` (v1 `/investor/kyc/esign/start`, FE `v2-ui/screens/KycScreen.tsx:29-30`).
- **Analytics:** `onb_esign_started`, `onb_esign_completed`.

**ONB-12 Nomination decision**
- **Purpose:** Mandatory explicit decision (tri-state `NOT_ASKED` → `NOMINATED` | `OPTED_OUT`; BE `domain/NominationDecision.java:25-60`).
- **Content:** Two equal-weight cards: "Add nominees (up to 3)" → ONB-13; "I don't want to add a nominee" → ONB-14. There is no default and no pre-highlight. When nominees exist: list with share bars, the allocation total, and "Confirm nominees".
- **Validation on confirm:**
  - total exactly 100% (BE `service/NominationRules.java:28,82-101`);
  - at most 3 (`:25`);
  - guardian present for minors (`:140-172`).
- **Errors:** "Shares must add up to exactly 100% (now {x}%)." / "Add guardian details for {name}."
- **Rules:** Confirmation is a separate act and is recorded (the nomination confirmation stamp; any later edit clears it — BE `service/NomineeService.java:529-558,814-823`). During onboarding, confirmation is completed by the final submit OTP (ONB-16). From PRF-07 it goes via CNF-01.
- **APIs:** `GET /v1/nominations`, `PUT /v1/nominations` (whole set, draft).
- **Analytics:** `onb_nomination_choice{choice}`.

**ONB-13 Add / edit nominee**

| Field | Validation | Error |
|---|---|---|
| Full name | 2–100 letters | "Enter the nominee's full name." |
| Relationship | select: Spouse, Son, Daughter, Father, Mother, Brother, Sister, Grandfather, Grandmother, Grandson, Granddaughter, Others (specify) | "Select how this nominee is related to you." |
| Date of birth | valid past date; minor derived as <18 (never declared; FE `utils/nomination.ts:25`) | "Enter a valid date of birth." |
| Share % | integer 1–100; running total ≤ 100 (BE `service/NominationRules.java:68-75`) | "Total share can't exceed 100%." |
| Guardian name + relationship (if minor) | name ≥2 chars; relationship required | "{name} is under 18, so guardian details are required." |
| Optional: PAN / Aadhaar last 4 / DL no., email, mobile, address | format-validated only if entered (PAN regex; `^\d{4}$`; mobile regex) | per-field format errors |

- **Behaviour:** Delete nominee → confirm dialog.
- **APIs:** local draft within the `PUT /v1/nominations` payload.
- **Analytics:** `onb_nominee_saved{minor:boolean}`.

**ONB-14 Opt out of nomination**
- **Content:** Full DSC-16 declaration text (server-served, version `v2`) and a checkbox (unticked): "I have read and understood the above and choose not to nominate."
- **Rules:** Refused while nominees exist ("Remove your nominees first to opt out."; BE `service/NomineeService.java:481-503`). During onboarding, recorded by the ONB-16 submit OTP (A8). From PRF-07, via CNF-01.
- **APIs:** `PUT /v1/nominations {decision:'OPTED_OUT', declarationSha256}`.
- **Analytics:** `onb_nomination_opted_out`.

**ONB-15 Declarations, T&C and privacy**

| Item (each a separate unticked checkbox) | Required | Document |
|---|---|---|
| "I agree to the Sanchay Terms of Use and have read the Privacy Notice" | yes | ToU vX, Privacy vX (DSC-15) |
| "I understand Sanchay is a mutual fund distributor, invests in Regular plans that pay it a commission, and does not give investment advice" | yes | MFD disclosure + commission policy (DSC-02, DSC-03) |
| KYC records consent (if not already given in ONB-01 for this version) | yes | DSC-17 |
| "Send me product updates on WhatsApp/email" | no | Marketing consent |

- **Rules:**
  - Each document opens in a sheet showing the full text, version and effective date. The server stores `{key, version, sha256, ip, ua, ts}` in append-only consent records (port of BE `service/ConsentRecordService.java`).
  - Documents must be real, versioned documents (fixes the v1 placeholder, §0.3).
  - The "accept all" shortcut is not offered.
- **Error:** "Please accept the required agreements to continue."
- **APIs:** `GET /v1/legal/documents?set=onboarding`, `POST /v1/consents [{key,version,sha256}]`.
- **Analytics:** `onb_declarations_accepted{marketing_opt_in}`.

**ONB-16 Review and submit**
- **Content:** Collapsible sections with Edit links: Identity (masked PAN, name, DOB, KYC status), Personal, Address, Contacts, Tax residency, Bank (masked, verified badge), Nominees or opt-out, Agreements.
- **CTA:** "Submit & verify with OTP" → CNF-01. The consent text is a server-rendered attestation: "I confirm the information above is true and complete, I make the FATCA/CRS declaration, and I {nominate …/opt out of nomination} as shown." The frozen snapshot hash (port of BE `service/OnboardingSubmissionService.java:65-90` freeze/hash pattern; the investor is the author).
- **States:** Validation failure → scroll to the incomplete section with the message "Complete {section} to submit."
- **APIs:** `POST /v1/onboarding/submit` returns a challenge; then CNF-01 confirm triggers the FP chain: `investor_profiles` → addresses/emails/phones → related parties (nominees) → `mf_investment_accounts` → bank linking (port BE `service/InvestorService.java:954-1038`).
- **Analytics:** `onb_submitted`.

**ONB-17 Account setup in progress / additional review**
- **States:**
  - (a) Setup: "Setting up your account with our fund partner…" (poll every 3 s, up to 2 min).
  - (b) FP sync pending (external failure): "This is taking longer than usual; we'll notify you when you're ready (usually within an hour)." A server retry runs in the background (v1 `externalSyncPending` pattern).
  - (c) Additional review (PEP / foreign tax / bank proof / manual review): "We're reviewing your details — up to 2 working days."
  - Success → ONB-20.
- **APIs:** `GET /v1/onboarding`.
- **Analytics:** `onb_setup_state{state}`.

**ONB-18 KYC pending with KRA**
- **Copy:** "Your KYC has been submitted to the KRA. Approval usually takes 2–3 working days. You can explore funds meanwhile." Shows the submitted date, with an "Explore funds" CTA.
- **Behaviour:** Push/email on approval.
- **APIs:** `GET /v1/onboarding` (poll on focus).
- **Analytics:** `onb_kra_pending_viewed`.

**ONB-19 Blocked / rejected**

| Variants | Copy and actions |
|---|---|
| KRA rejected | Reason from KRA; "Restart KYC" → ONB-03 |
| KYC deactivated / PAN inoperative | Action instructions, "Check again" |
| Ops rejected | "We couldn't open your account. Reason: {reason}." → HLP-03 |
| Eligibility (NRI, US/CA, non-individual) | Explains the limitation |

- **APIs:** `GET /v1/onboarding` (`blockReason`).
- **Analytics:** `onb_blocked{reason}`.

**ONB-20 You're ready**
- **Copy:** "Your account is ready." CTAs: "Explore funds", "Start a SIP". If the investor came from a fund page, "Continue to {fund}" returns to the original fund.
- **Behaviour:** Native shows the push primer NTF-03 after this screen.
- **Analytics:** `onb_completed{kyc_path}` (the conversion event).

### 4.4 Home

**HOME-01 Home dashboard**
- **Purpose:** Portfolio at a glance plus next actions.

**Layout by state:**

| State | Content |
|---|---|
| Onboarding incomplete | "Complete your setup" card (progress, step count) → ONB-00; Explore shortcuts; CAS import card |
| Pending (KYC / review) | Status card → ONB-17/18; Explore |
| READY, no holdings | "Start investing" card: category tiles + "Start a SIP from ₹{min}"; CAS import card |
| Invested | Blocks in the order below |

**Blocks in the invested state:**
1. **Summary card:**
   - Current value (or "Value pending — ₹X invested");
   - 1-day change (₹ and %; hidden if coverage ≠ OK);
   - Invested (cost of units held);
   - Total gain (₹, %);
   - XIRR with tooltip (null unless full coverage; BE `service/XirrCalculator.java`; synthesis §7);
   - coverage note (FE `v2-ui/lib/format.ts:119-142`).
2. **Things to do strip** (count badge → HOME-02): unpaid orders, mandates awaiting approval, failed SIP instalments, KYC or bank actions.
3. **Active SIPs:** count (definition: plan status `ACTIVE` = registered, mandate approved, not paused/cancelled; paused shown separately as "+2 paused"), next debit date and amount → Portfolio › Plans.
4. **Allocation by category:** donut or stacked bar by SEBI category (Equity / Debt / Hybrid / Solution-oriented / Others), with a sub-category drill-down on tap. Only valued holdings are included; the note "Excludes ₹X awaiting valuation" appears when relevant.
5. **Holdings preview:** top 5 by value → PORT-01.
6. **Recent orders:** latest 3 with status pills → ORD-01.
7. **External holdings card** (if imported): total at the latest NAV, "as of CAS {date}", separate and never summed (A13) → CAS-05.

- **States:** Pull to refresh. Data freshness "NAV as of {date}". Error → cached data plus a banner.
- **Disclosures:** DSC-22, DSC-04 (near XIRR), DSC-01 in the footer.
- **APIs:** `GET /v1/portfolio/summary` returns `{currentValue, invested, gain, gainPct, dayChange, xirr, coverage, activeSipCount, pausedSipCount, nextDebit, allocation:[{category,value,pct}]}`; `GET /v1/todo`; `GET /v1/orders?limit=3`; `GET /v1/external-holdings/summary`; `GET /v1/onboarding` (stage).
- **Web vs native:** Web ≥1024 px uses a two-column layout (summary + allocation left, to-do + orders right). A "Hide amounts" eye toggle (persisted locally) is available on both.
- **Analytics:** `home_viewed{state}`, `home_card_clicked{card}`, `home_amounts_hidden_toggled`.

**HOME-02 Things to do**
- **Purpose:** Action queue.

| Item type | Action |
|---|---|
| Payment pending (orders in `PAYMENT_PENDING` or `RETRY_AVAILABLE`; strict allow-list per BE `service/InvestorPaymentService.java:54-55`) | PAY-01 |
| Mandate pending authorisation | MND-03 |
| SIP instalment failed | SIPM-02 |
| Bank verification failed | ONB-09 |
| KYC action | ONB-00 |
| Statement ready | STM-05 |

- **Empty:** "You're all caught up."
- **APIs:** `GET /v1/todo`.
- **Analytics:** `home_todo_clicked{type}`.

### 4.5 Explore

**EXP-01 Explore home**
- **Purpose:** Browse the catalogue by SEBI category.
- **Content:**
  - search bar → EXP-02;
  - category tiles per the SEBI 2026 categorisation (effective 2026-04-01; synthesis §10): Equity, Debt, Hybrid, Index & ETF FoFs, Tax saver (ELSS), Solution-oriented/Life-cycle, Others;
  - collections row (rule-based, DSC-18), e.g. "Low expense large cap", "Index funds", "Tax saver", "SIP from ₹100", "Liquid funds";
  - fund houses row → EXP-07;
  - "Popular on Sanchay" (by investor count over the last 30 days; label "Popular, not a recommendation").
- **States:** ISR (revalidate every 1 h on web); native caches for 6 h.
- **Disclosures:** DSC-01, DSC-18.
- **APIs:** `GET /v1/fund-categories`, `GET /v1/collections`, `GET /v1/amcs`, `GET /v1/funds/popular`.
- **Analytics:** `exp_category_clicked{category}`, `exp_collection_clicked{slug}`.

**EXP-02 Search**

| Field | Validation |
|---|---|
| Query | ≥2 chars; debounce 250 ms; matches scheme name, AMC, category, ISIN |

- **Results:** Grouped Funds / Fund houses / Categories; Regular plans only; one row per scheme (options chosen on FUND-01).
- **States:** Recent searches (local, max 10, clearable). Empty: "No funds match '{q}'. Try a fund house or category." Error per S-std.
- **APIs:** `GET /v1/funds/search?q=&limit=20`.
- **Web vs native:** Web header search is a combobox with keyboard navigation.
- **Analytics:** `exp_search_performed{len, results_count}`, `exp_search_result_clicked{rank,type}`.

**EXP-03 Category / fund list**
- **Purpose:** List funds in a category or sub-category.
- **Row:** AMC logo, scheme name, sub-category chip, riskometer level, 1Y/3Y/5Y return (selectable column; annualised; "—" if not enough history), expense ratio (regular plan), min SIP.
- **Controls:** Sub-category tabs, Filters (EXP-04), Sort (EXP-05), result count.
- **Rules:** Only orderable schemes (ISIN present, FP-orderable, active; port of FE `utils/orderableScheme.ts:88-107`). Funds whose curated facts are missing show "—", never 0 (FundFactsProvider).
- **States:** Paginated (20, infinite scroll). Empty with filters → "No funds match these filters" + "Clear filters".
- **Disclosures:** DSC-04 under the return column header; DSC-01.
- **APIs:** `GET /v1/funds?category=&subCategory=&amc=&risk=&minSipMax=&expenseMax=&aumMin=&fundAgeMin=&sort=&cursor=`.
- **Web vs native:** Web uses a table layout with sortable column headers ≥1024 px and SSR for SEO. Native uses FlashList cards.
- **Analytics:** `exp_list_viewed{category,sub}`, `exp_fund_clicked{rank}`.

**EXP-04 Filters sheet**
- **Fields:** Fund house (multi-select, searchable); Risk (multi); Min SIP (≤₹100/≤₹500/≤₹1,000); Expense ratio (≤0.5%/≤1%/≤1.5%); Fund size AUM (≥₹1,000 Cr / ≥₹5,000 Cr); Fund age (≥3y/≥5y); Plan option (Growth/IDCW).
- **Behaviour:** Live count in the "Show {n} funds" button. "Reset".
- **APIs:** `GET /v1/funds/count?...`.
- **Analytics:** `exp_filter_applied{filters_count}`.

**EXP-05 Sort sheet**
- **Options:** Popularity (default), 1Y / 3Y / 5Y returns (high to low), Expense ratio (low to high), Fund size (high to low), Name A–Z.
- **Analytics:** `exp_sort_applied{sort}`.

**EXP-06 Collection**
- **Content:** Title, description, **visible criteria** (DSC-18), fund list (EXP-03 row component), and "Last refreshed {date}".
- **APIs:** `GET /v1/collections/{slug}`.
- **Analytics:** `exp_collection_viewed{slug}`.

**EXP-07 Fund house (AMC)**
- **Content:** AMC name, total schemes on Sanchay, AUM (curated) and a fund list grouped by category.
- **APIs:** `GET /v1/amcs/{slug}`, `GET /v1/funds?amc=`.
- **Analytics:** `exp_amc_viewed`.

### 4.6 Fund detail

**FUND-01 Fund detail** (web SSR/ISR `/mutual-funds/[schemeSlug]`, JSON-LD `FinancialProduct`)

**Sections:**
1. **Header:** AMC logo, scheme name, "Regular · Growth" option selector (Growth / IDCW Payout / IDCW Reinvestment as offered; choosing IDCW shows DSC-14), category and sub-category chips, riskometer badge.
2. **NAV:** value, date, 1-day change.
3. **Chart:** NAV (or growth of ₹10,000) with ranges 1M / 6M / 1Y / 3Y / 5Y / All, from `scheme_nav_history` (ISIN-keyed AMFI pipeline).
4. **Returns table:** 1Y / 3Y / 5Y / since inception (CAGR for >1Y), plus category average where curated.
5. **Key facts:**
   - Expense ratio (Regular) with as-of date;
   - Exit load (text);
   - Min lumpsum / additional / SIP;
   - SIP dates allowed;
   - Lock-in (ELSS: 3 years);
   - AUM with date;
   - Benchmark;
   - Launch date;
   - Fund manager(s) if curated.

   Each curated fact shows "Source: AMC / as of {date}". Missing facts show "Not available", never guessed (FundFactsProvider, fill:G1).
6. **Riskometer detail:** scheme and benchmark levels, plus PRC matrix for debt funds (DSC-05).
7. **Commission disclosure row:** DSC-03, trail % from the admin-curated commission table.
8. **Documents:** SID, KIM, factsheet links → FUND-03.
9. **Returns calculator** → FUND-02.
10. **"Your investment" card** if the investor holds this scheme: value, units, gain → PORT-02.

**Sticky CTA bar:** "Start SIP" and "Invest once", plus "Min ₹{sip} SIP / ₹{lumpsum} one-time". Routing:
- guest → AUTH-02 with return path;
- not READY → ONB-00 or status;
- scheme not orderable or SIP not allowed → the CTA is hidden with the reason "SIP not available for this fund" / "This fund isn't open for new investment".

- **States:** NAV stale (>3 business days) → the "NAV as of {date}" pill turns amber. Scheme closed → a banner and no CTAs.
- **Disclosures:** DSC-01, DSC-03, DSC-04 (chart and returns), DSC-05, DSC-10 (ELSS), DSC-14 (IDCW).
- **APIs:** `GET /v1/funds/{slug}` returns `{scheme, options[], thresholds, facts{value,asOf,source}, riskometer, commission, documents[], orderable, sipAllowed}`; `GET /v1/funds/{id}/nav-history?range=`; `GET /v1/portfolio/holdings?schemeId=` (authenticated).
- **Web vs native:** On web the chart is interactive SVG with a hover crosshair; on native it is a static path with a press-and-hold scrubber. Low-end Android defaults to the 1Y range to limit points (downsampled server-side to ≤250 points).
- **Analytics:** `fund_viewed{scheme_id, category}`, `fund_range_changed{range}`, `fund_cta_clicked{cta, gate}`, `fund_document_opened{doc}`.

**FUND-02 Returns calculator** (sheet)

| Field | Validation |
|---|---|
| Mode | SIP / One-time toggle |
| Amount | ≥ scheme min; ≤ ₹10,00,00,000 |
| Period | 1–30 years |

- **Output:** Projected value using the scheme's historical CAGR for the chosen period, or a user-chosen expected return 1–20%. Labelled "Illustration using past returns — not a guarantee" (DSC-04). Pure client-side calculation.
- **CTA:** "Invest ₹{amount}" → INV-01 / SIP-01 prefilled.
- **Analytics:** `fund_calc_used{mode}`.

**FUND-03 Documents and disclosures** (sheet)
- **Content:** SID, KIM, SAI, latest factsheet, riskometer history, commission table link, DSC-02.
- **Behaviour:** External PDFs open in an in-app browser (native) or a new tab (web).
- **Analytics:** `fund_document_opened{doc}`.

### 4.7 Lumpsum checkout (INV, then CNF-01, PAY-01, CNF-02)

**INV-01 One-time investment amount**
- **Entry:** FUND-01 "Invest once", FUND-02, PORT-02 "Invest more", SIPM-05 "Invest extra once".

| Field | Validation | Error |
|---|---|---|
| Amount | `AmountField`: min = `min_initial_investment` for a new folio or `min_additional_investment` for an existing folio; multiples per thresholds; max = min(scheme max, ₹25,00,000 platform cap A11) | ERR-AMT-MIN / -MULT / -MAX |
| Plan option | from FUND-01 (changeable) | — |

- **Content:** Folio line ("Will be added to folio 1234567/89" or "A new folio will be created with {AMC}"); DSC-06 line from the server quote; ELSS DSC-10.
- **Sandbox rule:** Amounts must end in 0 for FP review success. This is dev-only (FE `views/InvestorTransaction.tsx:48-51`) and must never appear in production UI.
- **APIs:** `POST /v1/orders/preview {type:'LUMPSUM', schemeId, option, amount}` returns `{valid, errors[], folio, stampDuty, navApplicability{expectedNavDate, message}, limits}`. Debounced 400 ms after typing stops.
- **Analytics:** `inv_amount_entered{bucket}`, `inv_amount_invalid{code}`.

**INV-02 Review one-time order**

| Field | Validation | Error |
|---|---|---|
| Pay from bank | radio of VERIFIED banks only; default primary | "Add and verify a bank account to invest." |
| Payment method | UPI / Netbanking (radio; default UPI if amount ≤ UPI cap, else Netbanking with UPI disabled and the reason "UPI limit is ₹5,00,000 per payment") | — |

- **Summary:**
  - Fund, option, folio;
  - Amount; stamp duty (DSC-07);
  - "Units allotted at NAV of {expectedNavDate} (if paid by {cutoffTime})" (DSC-06);
  - Bank;
  - DSC-03 commission line; DSC-12; DSC-01.
- **CTA:** "Confirm & get OTP". It creates the order draft and challenge (no FP call yet) → CNF-01.
- **APIs:** `POST /v1/orders {type:'LUMPSUM', schemeId, option, amount, bankAccountId, paymentMethod}` (Idempotency-Key) returns `{orderId, challenge}`.
- **Analytics:** `inv_review_viewed`, `inv_confirm_clicked{payment_method}`.

**CNF-01 Consent and OTP (shared)**
- **Purpose:** SEBI 2FA plus the investor's own consent evidence, used for every sensitive action.
- **Entry:** INV-02, SIP-03, RED-02, SWT-03, STP-02, SWP-02, SIPM-03…06, MND-02 (standalone mandate), MND-04 cancel, ONB-16, PRF-03/04/07/09, ACC-03.
- **Content:**
  - Action summary card (from `snapshotSummary`);
  - **full server-rendered consent text** (scrollable box; action-specific; ports v1 templates BE `service/TransactionConsentTemplates.java:150-298`, adding DSC-08 execution-only for purchase/SIP/switch/STP);
  - the fields below.

| Field | Validation | Error |
|---|---|---|
| Consent checkbox "I authorise this {action} as described above" | unticked; enabled only after the consent text is rendered (fail-closed, FE `v2-ui/lib/approvalConsent.ts:282-298`) | "Tick the box to authorise." |
| OTP | `OtpField`; the code is sent automatically on screen load to the mobile and email (A3); "Sent to +91 98XXXXXX21 and ra***@gmail.com" | ERR-OTP-* |

- **States:**
  - Challenge expired (server `expiresAt`, 10 min) → "This authorisation expired. Start again." and back to the review screen.
  - Confirming → full-screen blocking loader "Placing your order…". Back navigation is disabled; on native, hardware Back is intercepted.
  - FP failure after consume → CNF-02 failed state with the exact status. The order is never silently lost (idempotency key `order-<id>`, v1 BE `integration/RealCybrillaClient.java:1088`).
- **APIs:** `POST /v1/challenges/{id}/otp` (resend), `POST /v1/challenges/{id}/confirm {otp, consentAccepted, consentSha256}` returns `{next:'PAYMENT'|'MANDATE'|'DONE', orderId, handoff?}`.
- **Web vs native:** Screen capture blocked on native.
- **Analytics:** `cnf_viewed{action}`, `cnf_confirmed{action}`, `cnf_failed{action, reason}`.

**PAY-01 Payment and waiting**
- **Purpose:** Collect payment for a confirmed lumpsum order (or a first SIP instalment).
- **Entry:** CNF-01 → next=PAYMENT; HOME-02 / ORD-02 "Pay now" for `PAYMENT_PENDING` or `RETRY_AVAILABLE` orders.

| Method | Web | Native |
|---|---|---|
| UPI | Desktop: QR code from the FP UPI URI (expires in 10 min, countdown), plus "Pay with UPI ID" (VPA field `^[\w.\-]{2,256}@[a-zA-Z]{2,64}$`, "Enter a valid UPI ID") sending an FP collect request. Mobile web on Android: "Open UPI app" intent button. | Android: intent chooser. iOS: installed-app buttons. |
| Netbanking | Redirect to the FP/bank page → `/r/payment` | In-app auth session → `sanchay://r/payment` |

- **Hard rule:** FP UPI `type` must be lowercase `uri`/`collect` (BE `integration/RealCybrillaClient.java:1266-1283`).
- **States:**
  - Waiting ("Complete the payment in your UPI app. Don't close this screen."). Poll `GET /v1/orders/{id}` every 3 s for 10 min; resume polling on app foreground/visibility (v1 pattern FE `v2-ui/screens/ApprovalsScreen.tsx:52-60`).
  - Success → CNF-02.
  - Failed → "Payment failed. Your order is saved — retry payment." The order is `RETRY_AVAILABLE`, not FAILED (payment-honesty rule, BE `service/InvestorActionService.java:674-682`).
  - Timeout → "We haven't received confirmation yet. If money was debited, it will reflect within 30 minutes or be refunded by your bank." → ORD-02.
- **Disclosures:** DSC-12, DSC-06 (dynamic: "Pay by 2:45 PM for today's NAV").
- **APIs:** `POST /v1/orders/{id}/payments {method, vpa?}` returns `{paymentId, upiUri?, redirectUrl?, expiresAt}`; `GET /v1/orders/{id}`.
- **Analytics:** `pay_method_selected{method,surface}`, `pay_upi_app_opened`, `pay_result{result, duration_bucket}`.

**CNF-02 Result / status (shared)**

| Variant | Copy |
|---|---|
| Lumpsum paid | "Order placed. ₹{amount} in {fund}. Units will be allotted at NAV of {date}; you'll get a confirmation from the AMC." Plus a timeline preview. |
| SIP registered | "SIP set up. First instalment on {date}." or "First instalment paid today." |
| Mandate pending | "Approve the mandate in your bank/UPI app to activate your SIP." → MND-03 |
| Redemption | "Redemption placed. Expected credit by {date} to {bank ••1234}." (DSC-20) |
| Switch / STP / SWP / plan change | Action-specific sentences |
| Failed | Reason plus "Nothing was debited" when true |

- **CTAs:** "View order" → ORD-02, "Go to portfolio", "Invest more".
- **APIs:** `GET /v1/orders/{id}` or `/v1/plans/{id}`.
- **Analytics:** `cnf_result_viewed{action,status}`.

### 4.8 SIP setup

**SIP-01 SIP details**

| Field | Validation | Error |
|---|---|---|
| Monthly amount | `AmountField`; min = scheme SIP min for frequency (`thresholds[type=sip].amount_min`, default ₹500 per v1 BE `service/OrderService.java:2193` if absent); multiples; max = ₹1,00,000 when a UPI Autopay mandate is chosen, else the mandate limit | ERR-AMT-* / "UPI Autopay supports up to ₹1,00,000 per debit. Use a bank (eNACH) mandate for higher amounts." |
| Frequency | Monthly / Quarterly (only those the scheme offers; v1 BE `service/OrderService.java:2199-2205`) | — |
| SIP date | chips 1–28 (v1 BE `service/OrderService.java:2209-2212`), restricted to scheme-allowed dates; no preselection | "Choose a SIP date." |
| Duration | "Until I cancel" / number of instalments (≥ scheme `installments_min`) | "Minimum {n} instalments for this fund." |
| Pay first instalment today | toggle (off by default); on → a lumpsum payment of the same amount now via PAY-01, and the SIP starts next cycle | — |

- **Server-computed:** first debit date (≥ mandate activation lead time: UPI Autopay 1 day, eNACH 7 days; if the chosen date is too near, roll to the next month, per v1 BE `service/OrderService.java:2220-2230`). Shown as "First debit: {date}".
- **Disclosures:** DSC-10 (ELSS: each instalment locked 3 years), DSC-06 (instalment NAV depends on debit realisation).
- **APIs:** `POST /v1/orders/preview {type:'SIP', ...}` returns `{firstDebitDate, validDates[], errors[]}`.
- **Analytics:** `sip_details_entered{frequency, amount_bucket, first_now}`.

**SIP-02 Choose or create mandate**
- **Content:** List of the investor's `APPROVED` mandates on verified banks whose limit ≥ SIP amount (bank, type, limit, "used by {n} SIPs"). Ineligible mandates are shown disabled with a reason ("Limit ₹10,000 is below this SIP").
- **"Set up new mandate" fields:**

| Field | Validation |
|---|---|
| Bank | verified banks |
| Type | UPI Autopay (≤₹1,00,000/debit, activates in minutes) / Bank mandate eNACH via netbanking or debit card (up to ₹1,00,00,000, activates in 2–7 working days) |
| Per-debit limit | Default max(₹1,00,000, 2×SIP) per v1 (BE `service/InvestorActionService.java:1014-1019`), capped at ₹1,00,000 for UPI; editable ≥ SIP amount |

- **Validation error:** "Limit must be at least your SIP amount of ₹{x}."
- **Explainer:** "A mandate lets your bank pay future instalments automatically. You can reuse it for other SIPs."
- **APIs:** `GET /v1/mandates?eligibleForAmount=`.
- **Analytics:** `sip_mandate_choice{existing|new, type}`.

**SIP-03 Review SIP**
- **Summary:** Fund, option, folio; amount, frequency, date, first debit, duration; mandate (existing or new, type, limit, bank); first instalment today (Y/N, amount).
- **Disclosures:** DSC-13, DSC-03, DSC-10 (ELSS), DSC-12, DSC-01.
- **CTA:** "Confirm & get OTP" → CNF-01. The consent covers the SIP registration, the mandate creation (single 2FA at registration; SEBI rule synthesis §5) and DSC-08.
- **Next routing after CNF-01:**
  - new mandate → MND-03 handoff;
  - first-now → PAY-01;
  - then CNF-02.
- **FP sequence (server):** `POST /v2/mf_purchase_plans` (with mandate id when approved; v1 `createSipOrderWithMandate` BE `integration/RealCybrillaClient.java:1419-1442`), mandate `/api/pg/mandates` + `/api/pg/payments/emandate/auth`.
- **APIs:** `POST /v1/orders {type:'SIP', schemeId, option, amount, frequency, day, instalments|null, mandate:{id}|{new:{bankAccountId,type,limit}}, firstInstalmentNow}` returns the challenge.
- **Analytics:** `sip_confirm_clicked`, `sip_registered{mandate_type, first_now}`.

### 4.9 Orders

**ORD-01 Orders list**
- **Tabs:** All / In progress / Completed / Failed & cancelled.
- **Filters:** type (Buy, SIP instalment, Redeem, Switch, STP, SWP), date range (last 30 days default, up to all time).
- **Row:** Fund, type chip, amount or units, status pill, date.
- **Status label mapping** (from v1 `OrderStatus`, synthesis/transactions):

| Server status | Label |
|---|---|
| `CREATED`, `PENDING_INVESTOR_ACTION` | "Awaiting your confirmation" |
| `PAYMENT_PENDING` | "Payment pending" |
| `RETRY_AVAILABLE` | "Payment failed — retry" |
| `SUBMITTED` | "Sent to AMC" |
| `PROCESSING` | "Processing" |
| `SUCCESSFUL` / `COMPLETED` | "Units allotted" (buy) / "Redeemed" (sell) |
| `FAILED` | "Failed" |
| `CANCELLED` | "Cancelled" |

- **Empty:** "No orders yet." + "Explore funds".
- **APIs:** `GET /v1/orders?status=&type=&from=&to=&cursor=`.
- **Analytics:** `ord_list_viewed{tab}`, `ord_filter_applied`.

**ORD-02 Order detail and timeline**
- **Content:**
  - Header (fund, type, amount/units, status);
  - vertical timeline: Placed → Authorised (OTP, timestamp) → Payment received → Sent to AMC → Units allotted / Redeemed → Credited (redemption);
  - details: order id, folio, NAV date and allotment NAV, units, stamp duty, payment method and reference, bank;
  - for redemptions: expected and actual credit date;
  - "Units: Estimated" badge until provider-confirmed (units provenance, V75).
- **Actions:**
  - "Pay now" (`PAYMENT_PENDING`/`RETRY_AVAILABLE`) → PAY-01;
  - "Cancel order" only while not submitted to FP/AMC (server `cancellable`), via a confirm dialog (no OTP; nothing was sent);
  - "Download receipt" (PDF);
  - "Need help?" → HLP-03 prefilled with the order id.
- **States:** Polls every 10 s while in a non-terminal state and the screen is focused.
- **Disclosures:** DSC-06, DSC-20, DSC-22.
- **APIs:** `GET /v1/orders/{id}`, `POST /v1/orders/{id}/cancel`, `GET /v1/orders/{id}/receipt`.
- **Analytics:** `ord_detail_viewed{type,status}`, `ord_action_clicked{action}`.

### 4.10 Portfolio and holdings

**PORT-01 Portfolio: holdings** (Portfolio tab, segment "Holdings")
- **Header:** Same summary as HOME-01 (value, invested, gain, XIRR, coverage).
- **Controls:** Sort (Value / Gain % / Name / XIRR), group by (None / Category / AMC).
- **Row:** Fund, category chip, current value (or "Value pending — ₹X invested"), gain ₹ and %, units.
- **Segments:** Holdings | Plans (SIPM-01) | Orders (ORD-01) | External (CAS-05).
- **Empty:** "You don't have any investments yet." + "Explore funds" + "Import existing investments (CAS)".
- **APIs:** `GET /v1/portfolio/holdings?sort=&group=` (a single consolidated holdings service; synthesis §2 consolidates v1's two implementations).
- **Analytics:** `port_viewed`, `port_sort_changed`, `port_holding_clicked`.

**PORT-02 Holding detail**
- **Content:**
  - Fund name → FUND-01; folio;
  - Current value, NAV (date), units (total / available / locked / in-process), average cost NAV, invested, gain, XIRR (per holding);
  - ELSS lock-in schedule table (allotment date, units, unlock date);
  - exit-load window summary ("{u} units within exit-load period until {date}");
  - active SIP/STP/SWP on this holding;
  - transactions list → ORD-02.
- **Actions:** Invest more (INV-01), Start SIP (SIP-01), Redeem (RED-01), Switch (SWT-01), STP (STP-01), SWP (SWP-01). Disabled actions show a reason:
  - "Units being confirmed by the registrar";
  - "All units are in ELSS lock-in until {date}";
  - "Switch not available for this fund" (FP `switch_out` flag).
- **Disclosures:** DSC-22, DSC-10, DSC-09.
- **APIs:** `GET /v1/portfolio/holdings/{id}` returns `{..., units:{total,available,locked,inProcess,estimated}, lockSchedule[], exitLoadLots[], actions:{redeem:{enabled,reason},...}}`.
- **Analytics:** `port_holding_viewed`, `port_action_clicked{action, enabled}`.

### 4.11 Redeem

**RED-01 Redeem setup**

| Field | Validation | Error |
|---|---|---|
| Redeem by | radio: Amount / Units / All available units (no default) | "Choose how much to redeem." |
| Amount (if Amount) | ≥ scheme `min_withdrawal_amount`; ≤ `availableAmount` (port BE `service/RedemptionAvailability.java:146-190`) | "You can redeem up to ₹{max} now." / "Minimum redemption is ₹{min}." |
| Units (if Units) | up to 3 decimals; ≤ `availableUnits` | "You can redeem up to {u} units now." |

- **Info blocks (server-computed):**
  - Available units and approximate value ("approx. at NAV of {date}").
  - Locked units (ELSS) with the next unlock date: "All available units" excludes locked units; the label says so (DSC-10).
  - In-process units: "{u} units are part of pending requests."
  - Exit load: "{u} units are within the exit-load period ({terms}). Estimated exit load on this redemption: ₹{x}" (DSC-09).
  - Estimated capital gains (FIFO, same engine as STM-02): "Estimated gain ₹{x} (short-term ₹a / long-term ₹b)", shown only when all lots have provider-confirmed units; else hidden with "Tax estimate unavailable" (DSC-11).
  - Payout bank: the folio's registered bank, masked, read-only. "To change it, see Bank accounts" → PRF-06.
  - Cut-off (DSC-06) and settlement (DSC-20) lines.
- **Blocking rule (before OTP):** If any required units are estimated or unconfirmed, the mode is disabled with "Your units are being confirmed by the registrar (usually 1–2 working days). You can redeem after that." This fixes the v1 post-OTP refusal (§0.3).
- **APIs:** `GET /v1/portfolio/holdings/{id}/redeemable`, `POST /v1/orders/preview {type:'REDEMPTION', holdingId, mode, value}`.
- **Analytics:** `red_mode_selected{mode}`, `red_blocked_viewed{reason}`.

**RED-02 Review redemption**
- **Summary:** Fund, folio, mode, amount or units, approximate value, units within exit load and estimated load, estimated gain, payout bank, expected NAV date, expected credit date.
- **Disclosures:** DSC-09, DSC-11, DSC-20, and "Once sent to the registrar this can't be cancelled." This fixes compliance FAIL item 9: folio, units and value are shown.
- **CTA:** "Confirm & get OTP" → CNF-01 (redemption consent template) → CNF-02.
- **APIs:** `POST /v1/orders {type:'REDEMPTION', holdingId, mode:'AMOUNT'|'UNITS'|'ALL'}` returns the challenge.
- **FP mapping:** `POST /v2/mf_redemptions`. "All" is sent as explicit units (v1 quirk: never `mode:'FULL'`, FE `views/InvestorWithdrawal.tsx:172-176`). Idempotency key `redemption-<id>`.
- **Analytics:** `red_confirm_clicked{mode}`, `red_placed`.

### 4.12 Switch, STP, SWP (new in v2; FP `mf_switches`, `mf_switch_plans`, `mf_redemption_plans`)

**SWT-01 Switch setup**

| Field | Validation | Error |
|---|---|---|
| Switch to | Required → SWT-02 | "Choose a fund to switch into." |
| Switch by | Amount / Units / All available (no default) | as RED-01 |
| Amount / Units | Same ceilings as RED-01, and ≥ the target scheme's min additional purchase | "Minimum switch-in for {fund} is ₹{min}." |

- **Info:** The RED-01 blocks apply (locked units, exit load, estimated gain), plus "A switch is treated as a redemption and a purchase for tax." Cut-off for both legs (DSC-06).
- **APIs:** `POST /v1/orders/preview {type:'SWITCH', holdingId, targetSchemeId, mode, value}`.
- **Analytics:** `swt_setup_viewed`, `swt_mode_selected`.

**SWT-02 Switch target picker**
- **Content:** Same-AMC, Regular-plan, switch-in-enabled schemes only. Search plus a category filter; rows as EXP-03. Option selector (Growth/IDCW).
- **Empty:** "No other funds from {AMC} accept switches."
- **APIs:** `GET /v1/funds?amc={amc}&switchIn=true`.
- **Analytics:** `swt_target_selected`.

**SWT-03 Review switch**
- **Summary:** From fund/folio → to fund/option, amount or units, exit load, estimated gain, NAV applicability for both legs.
- **Disclosures:** DSC-03 (target commission), DSC-09, DSC-11, DSC-01.
- **CTA:** CNF-01 (switch template including DSC-08) → CNF-02.
- **APIs:** `POST /v1/orders {type:'SWITCH', ...}`, then the server calls FP `mf_switches`.
- **Analytics:** `swt_placed`.

**STP-01 STP setup**

| Field | Validation | Error |
|---|---|---|
| Transfer to | same-AMC target (SWT-02 picker) | "Choose a target fund." |
| Amount per transfer | ≥ scheme STP min (FP threshold); ≤ available value | ERR-AMT-* |
| Frequency | Monthly (launch; FP STP example frequency, https://docs.fintechprimitives.com/mf-transactions/recurring-switches/, accessed 2026-09-25) | — |
| Transfer date | 1–28 | "Choose a date." |
| Number of transfers | ≥ scheme min (default 6 minimum); ≤ 120 | "Minimum {n} transfers." |

- **Warnings:** "If the balance runs out, remaining transfers fail and the STP stops." Exit load and tax apply to each transfer (DSC-09/11).
- **APIs:** `POST /v1/plans/preview {type:'STP', ...}`.
- **Analytics:** `stp_setup_viewed`.

**STP-02 Review STP**
- **Summary** and disclosures DSC-03, DSC-09, DSC-11, DSC-13-style standing-instruction text ("transfers happen automatically without a new OTP").
- **CTA:** CNF-01 → CNF-02.
- **APIs:** `POST /v1/plans {type:'STP', ...}`, then FP `POST /v2/mf_switch_plans` (fields: mf_investment_account, amount, switch_in/out scheme, frequency, installment_day, number_of_installments, consent{email,isd_code,mobile}; EUIN omitted).
- **Analytics:** `stp_registered`.

**SWP-01 SWP setup**

| Field | Validation | Error |
|---|---|---|
| Amount per withdrawal | ≥ scheme SWP min; ≤ available value | ERR-AMT-* |
| Frequency | Monthly | — |
| Date | 1–28 | "Choose a date." |
| Number of withdrawals | ≥ scheme min; ≤ 360 | "Minimum {n} withdrawals." |

- **Info:** Payout to the folio bank (read-only). Locked ELSS units are excluded ("Withdrawals use only unlocked units."). Exit load and tax apply to each withdrawal.
- **APIs:** `POST /v1/plans/preview {type:'SWP', ...}`.
- **Analytics:** `swp_setup_viewed`.

**SWP-02 Review SWP**
- **Summary**, DSC-09/11/20 and standing-instruction text.
- **CTA:** CNF-01 → CNF-02.
- **APIs:** `POST /v1/plans {type:'SWP'}`, then FP `POST /v2/mf_redemption_plans` (https://docs.fintechprimitives.com/mf-transactions/recurring-redemptions/, accessed 2026-09-25).
- **Analytics:** `swp_registered`.

### 4.13 Systematic plan management

**SIPM-01 Systematic plans list** (Portfolio › Plans)
- **Tabs:** SIP / STP / SWP.
- **Row:** Fund, amount, frequency and date, next instalment date, status pill (Active / Paused until {date} / Mandate pending / Cancelled / Completed), mandate type.
- **Header:** "Active SIPs: {n} · Monthly total ₹{sum}".
- **Empty:** "No SIPs yet." + "Start a SIP".
- **APIs:** `GET /v1/plans?type=`.
- **Analytics:** `sipm_list_viewed{tab}`.

**SIPM-02 Plan detail**
- **Content:**
  - Summary (fund, amount, frequency, date, started on, instalments done/total, total invested via this plan, mandate link → MND-04);
  - next instalment card;
  - instalment history (date, amount, status, → ORD-02);
  - failure banner ("Last instalment failed: insufficient balance. Next attempt on {date}.").
  - FP auto-cancels after consecutive failures or skips beyond the SEBI limit (https://docs.fintechprimitives.com/mf-transactions/purchase-plans/auto_cancellation, accessed 2026-09-25), so the banner warns: "{n} more failed instalments will cancel this SIP."
- **Actions:** Pause/Resume (SIPM-03), Modify (SIPM-04, SIP only), Step-up (SIPM-05, SIP only), Invest extra once (→ INV-01 prefilled), Cancel (SIPM-06).
- **APIs:** `GET /v1/plans/{id}`, `GET /v1/plans/{id}/instalments`.
- **Analytics:** `sipm_detail_viewed{type,status}`.

**SIPM-03 Pause / resume plan**

| Field | Validation |
|---|---|
| Pause for | chips of server-allowed durations (from `allowedPauseInstalments`, derived from the SEBI limit for the frequency; FP validates it) e.g. 1, 2, 3, 6 instalments |

- **Copy:** "Instalments on {dates} will be skipped. Your SIP resumes on {date}." Resume on a paused plan: "Resume now — next instalment on {date}".
- **Behaviour:** CNF-01 (OTP) → CNF-02.
- **FP:** `POST /v2/mf_purchase_plans/{id}/skip_instructions {from,to}`; resume = `POST /v2/mf_purchase_plans/skip_instructions/{sid}/cancel` (https://docs.fintechprimitives.com/mf-transactions/purchase-plans/pause-sip/, accessed 2026-09-25). STP/SWP pause uses the FP pause-stp/pause-swp equivalents.
- **Scope limit:** Pause is not supported for BSE SIPs per FP. Sanchay uses FP-native plans only.
- **APIs:** `POST /v1/plans/{id}/pause {instalments}` → challenge; `POST /v1/plans/{id}/resume` → challenge.
- **Analytics:** `sipm_pause{instalments}`, `sipm_resume`.

**SIPM-04 Modify SIP (amount / date)**

| Field | Validation | Error |
|---|---|---|
| New amount | scheme SIP min/multiple; ≤ mandate limit | "This is above your mandate limit of ₹{limit}. Set up a new mandate to increase it." → SIP-02 flow |
| New date | 1–28 allowed dates | — |

- **Rule:** The change applies from the first instalment ≥2 days away (FP rule, v1 BE `service/OrderService.java:2091-2093`). The server returns `effectiveFrom`: "Changes apply from {date}."
- **Behaviour:** CNF-01 (OTP; v1 compliance item 7 flagged amount edits without 2FA) → CNF-02.
- **APIs:** `POST /v1/plans/{id}/modify {amount?, day?}` → challenge.
- **Analytics:** `sipm_modify{amount_changed,date_changed}`.

**SIPM-05 Step-up (top-up)**
- **Design decision:** "Top-up" = an automatic annual increase. Implemented as a Sanchay-scheduled modify instruction on each anniversary. It does not depend on FP step-up support.

| Field | Validation |
|---|---|
| Increase by | ₹ amount (≥ ₹100, multiples per scheme) or % (5–50%) |
| Every | 12 months (fixed at launch) |
| Up to (cap) | optional max monthly amount ≤ mandate limit |

- **Behaviour:** Preview table of the next 5 years' instalment amounts. If the stepped amount exceeds the mandate limit, the step-up stops at the limit and a notification is sent. CNF-01 → CNF-02. The step-up authorisation covers future automatic modifications, stated explicitly in the consent text.
- **Shortcut:** "Invest extra once" is a separate link → INV-01 with the holding's folio.
- **APIs:** `POST /v1/plans/{id}/step-up {type:'AMOUNT'|'PERCENT', value, cap?}` → challenge; `DELETE /v1/plans/{id}/step-up` (via challenge).
- **Analytics:** `sipm_stepup_set{type}`.

**SIPM-06 Cancel plan**

| Field | Validation |
|---|---|
| Reason | radio (required): Investing in another fund / Need money elsewhere / Not satisfied with performance / Want to invest later / Other (text ≤200) → mapped to FP cancellation codes (v1 default `invest_later`, BE `SipCancelRequest.java:11`) |

- **Copy:** "Your investments stay invested. Future instalments stop. Your mandate stays active for other SIPs (manage in Mandates)." If an instalment is within 2 days: "The instalment on {date} may still be debited."
- **Behaviour:** CNF-01 → CNF-02.
- **APIs:** `POST /v1/plans/{id}/cancel {reason}` → challenge, then FP `POST /v2/mf_purchase_plans/cancel` (v1 BE `service/OrderService.java:1963-2086`).
- **Analytics:** `sipm_cancel{reason}`.

### 4.14 Mandates

**MND-01 Mandates list**
- **Row:** Bank ••1234, type (UPI Autopay / eNACH), per-debit limit, status (Pending approval / Active / Rejected / Expired / Cancelled), linked plans count.
- **CTA:** "Set up a mandate".
- **Empty:** "No mandates yet. You'll set one up when you start a SIP."
- **APIs:** `GET /v1/mandates`.
- **Analytics:** `mnd_list_viewed`.

**MND-02 Create mandate** (standalone)
- **Fields:** As SIP-02 "new mandate" (bank, type, limit).
- **Behaviour:** CNF-01 (OTP) → MND-03.
- **APIs:** `POST /v1/mandates {bankAccountId, type, limit}` → challenge.
- **Analytics:** `mnd_create_started{type}`.

**MND-03 Mandate authorisation / status**
- **UPI Autopay:** "Approve the ₹{limit} autopay request in your UPI app with your UPI PIN." Intent or QR as in PAY-01; poll every 3 s for 10 min.
- **eNACH:** "Authorise with netbanking or debit card on your bank's page." Handoff → return → "Your bank is confirming this mandate. This can take 2–7 working days; we'll notify you."
- **States:** Approved → linked SIP activated (CNF-02). Rejected → reason + "Try again / Use another bank".
- **FP:** `/api/pg/mandates`, `/api/pg/payments/emandate/auth` (v1 BE `integration/RealCybrillaClient.java:1326-1353`).
- **APIs:** `POST /v1/mandates/{id}/authorize` returns the handoff; `GET /v1/mandates/{id}`.
- **Analytics:** `mnd_auth_result{type,result}`.

**MND-04 Mandate detail / cancel**
- **Content:** Details, linked plans list.
- **Cancel:** Allowed only when no active plans use it. Otherwise: "Cancel or move these SIPs first: {list}." Cancel goes through CNF-01.
- **APIs:** `GET /v1/mandates/{id}`, `POST /v1/mandates/{id}/cancel` → challenge.
- **Analytics:** `mnd_cancel{blocked:boolean}`.

### 4.15 Statements and tax

**STM-01 Reports hub**
- **Cards:** Capital gains (STM-02), Transaction statement (STM-03), ELSS tax-saving summary (STM-04), "Official CAS from CAMS/KFintech" (external link to the MF Central / RTA request page), recent reports list (status, download).
- **APIs:** `GET /v1/reports?limit=10`.
- **Analytics:** `stm_hub_viewed`.

**STM-02 Capital gains**

| Field | Validation |
|---|---|
| Financial year | select from the FY of the first transaction to the current FY; default = previous FY during Apr–Jul, else current FY |
| View | Realised / Unrealised |

- **On-screen summary:** Equity-oriented STCG / LTCG (with grandfathered cost basis as of 31-Jan-2018, port BE `service/CapitalGainsReportService.java:301-318`); other/debt STCG / LTCG; totals; per-redemption line items (fund, sale date, units, sale value, purchase date(s), cost, gain, type).
- **Tax classification rules (server, table-driven by transfer date):**
  - Equity-oriented: long-term after 12 months.
  - "Specified mutual fund" units bought on or after 2023-04-01: always short-term.
  - Other non-equity: long-term after 24 months for transfers on or after 2024-07-23 (36 months before).
  - **Replace v1's fixed 1,095-day non-equity rule** (BE `service/CapitalGainsReportService.java:53-54`).
- **Exclusions:** Lots with estimated (DERIVED) units are excluded from cost basis. The notice reads: "{n} transactions are awaiting registrar-confirmed units and are excluded" (v1 `:158-171`).
- **Downloads:** PDF, CSV (standard), CSV (ITR-utility-friendly column set, from v1 QUICKO/CLEARTAX formats) → STM-05.
- **Disclosures:** DSC-11, "Based on transactions made through Sanchay only. External holdings aren't included."
- **APIs:** `GET /v1/reports/capital-gains?fy=&view=`, `POST /v1/reports {type:'CAPITAL_GAINS', fy, format}`.
- **Analytics:** `stm_cg_viewed{fy}`, `stm_report_requested{type,format}`.

**STM-03 Transaction statement**

| Field | Validation | Error |
|---|---|---|
| From / To | dates; from ≤ to; to ≤ today; range ≤ 10 years | "Start date must be before end date." |
| Funds | all or multi-select | — |
| Types | all or Buy / SIP / Redeem / Switch / STP / SWP | — |

- **Output:** On-screen preview (first 50 rows) plus PDF / CSV.
- **APIs:** `GET /v1/transactions?from&to&schemeIds&types&cursor`, `POST /v1/reports {type:'TRANSACTIONS', ...}`.
- **Analytics:** `stm_txn_requested{format, range_bucket}`.

**STM-04 ELSS summary**
- **Field:** FY select.
- **Content:** Table of ELSS investments in the FY (date, fund, amount, units, lock-in end); total; lock-in calendar of upcoming unlocks.
- **Note:** "ELSS investments may qualify for a deduction under the old tax regime (Section 80C of the Income-tax Act, 1961 for FY up to 2025-26, and the corresponding provision of the Income-tax Act, 2025 thereafter), up to ₹1,50,000 across all eligible investments." (DSC-11)
- **Downloads:** PDF / CSV.
- **APIs:** `GET /v1/reports/elss?fy=`, `POST /v1/reports {type:'ELSS', fy, format}`.
- **Analytics:** `stm_elss_viewed{fy}`.

**STM-05 Report generation / download** (sheet)
- **States:** Generating (async; poll every 2 s up to 60 s) → Ready ("Download" / "Email me") → Failed (retry).
- **Rules:**
  - In-app downloads are served from 5-minute signed URLs, unprotected (session-authenticated). Native shows the share-sheet warning "This file contains personal financial data."
  - Emailed copies are PDF, password = PAN in uppercase, and the copy says so.
- **APIs:** `GET /v1/reports/{id}`, `POST /v1/reports/{id}/email`.
- **Web vs native:** §1.10 file handling.
- **Analytics:** `stm_report_downloaded{type,format,channel}`.

### 4.16 CAS import and external holdings

**Design decision:**
- Launch methods: (1) upload a CAMS/KFintech consolidated MF CAS PDF; (2) "Fetch by email", where the investor requests their CAS from MF Central/CAMS to their registered email and forwards it to a per-investor import address. The server ingests it automatically.
- Only the investor's own PAN is accepted.
- Depository (NSDL/CDSL) CAS is out of scope.
- External data is never merged into Sanchay totals (A13).

**CAS-01 External holdings intro**
- **Content:** Why import ("See all your mutual funds in one place"); what is read (folios, schemes, units, transactions); privacy line ("Used only to show your holdings; delete anytime."); two method cards → CAS-02 / CAS-03.
- **Analytics:** `cas_intro_viewed`, `cas_method_selected{method}`.

**CAS-02 Upload CAS PDF and password**

| Field | Validation | Error |
|---|---|---|
| File | PDF only (magic-byte check), ≤10 MB | "Upload the CAS PDF from CAMS, KFintech or MF Central." / "File is larger than 10 MB." |
| PDF password | 1–64 chars; never stored after parsing | "Wrong password. It's the password you set when requesting the CAS." |

- **Help:** "How to get your CAS" expandable steps plus a link to the MF Central CAS request page.
- **APIs:** `POST /v1/cas/uploads` (multipart: file, password) returns `{uploadId}`.
- **Web vs native:** Picker per §1.10.
- **Analytics:** `cas_uploaded`, `cas_password_failed`.

**CAS-03 Fetch CAS by email**
- **Content:**
  - Step 1: "Request a Detailed CAS from MF Central / CAMS to your email {masked registered email}" (deep link).
  - Step 2: "Forward that email to your personal import address: cas-{token}@in.sanchay.in" (copy button).
  - Step 3: "Enter the PDF password" (the CAS-02 password field, stored encrypted for at most 7 days or until parsed).
- **Rules:** Only emails forwarded from the investor's registered email are accepted.
- **APIs:** `GET /v1/cas/inbox-address`, `PUT /v1/cas/pending-password`.
- **Analytics:** `cas_email_address_copied`.

**CAS-04 Import status / result**
- **States:**
  - Parsing (poll every 2 s).
  - Success: "{n} funds across {m} AMCs imported, as of {CAS date}". Funds already held via Sanchay are skipped (dedupe by folio + ISIN).
  - Partial: list of unrecognised schemes.
  - Failed: wrong password / not a CAS / PAN mismatch → "This CAS belongs to a different PAN. You can import only your own CAS." / older than 12 months → a warning that allows import.
- **APIs:** `GET /v1/cas/uploads/{id}`.
- **Analytics:** `cas_import_result{result, funds_bucket}`.

**CAS-05 External holdings list** (Portfolio › External)
- **Header:** "External holdings", total at the latest NAV, "Units as of CAS {date}", separate from Sanchay totals (DSC-19).
- **Rows:** Fund, AMC, folio (masked), units, value at the latest AMFI NAV, cost (if present in the CAS).
- **CTA:** "Update" → CAS-01. No transact actions (DSC-19).
- **Empty:** → CAS-01.
- **APIs:** `GET /v1/external-holdings`.
- **Analytics:** `cas_holdings_viewed`.

**CAS-06 External holding detail**
- **Content:** Units, NAV, value, cost/gain if available, transactions from the CAS (read-only), "Invest in this fund via Sanchay" → FUND-01 (a new Sanchay order).
- **APIs:** `GET /v1/external-holdings/{id}`.
- **Analytics:** `cas_holding_viewed`.

**CAS-07 Import history and delete**
- **Content:** List of imports (date, method, CAS date, status). "Delete all external data" goes through a confirm dialog (no OTP; non-financial) and hard-deletes the parsed data (DPDP).
- **APIs:** `GET /v1/cas/uploads`, `DELETE /v1/external-holdings`.
- **Analytics:** `cas_data_deleted`.

### 4.17 Profile and account

**Re-verification rules (summary)**

| Change | Path | Verification | Side-effects |
|---|---|---|---|
| Name / DOB / PAN | Not self-editable in-app for PAN. Name/DOB via PRF-08 KYC modification (DigiLocker + eSign) | KRA update | Account to KYC-modify pending; transactions continue on the existing KYC until KRA update |
| Permanent address | PRF-08 (KYC modification) | DigiLocker + eSign | FP address update after KRA |
| Occupation / income / source of wealth / PEP / marital status | PRF-03 | CNF-01 OTP | FP profile update where the field is mutable; if FP rejects ("already set", v1 BE `integration/RealCybrillaClient.java:2611-2612`) → ops task; PEP change → EDD review |
| Mobile / email | PRF-04 | OTP to the current contact (if available) + OTP to the new contact | FP phone/email resource update; 24 h cooldown on redemption, switch, SWP and bank changes; alert to the old contacts |
| Bank add | PRF-05 → ONB-08/09 | Penny drop | New bank usable for purchases immediately after verification |
| Folio payout bank change | PRF-06 "Use for redemptions" | CNF-01 OTP + penny-drop verified bank | Ops change-of-bank request to the AMC via FP; payouts may use the old bank for up to 10 days (AMC cooling practice) |
| Nominees | PRF-07 → ONB-12–14 | CNF-01 OTP | FP folio nominee update |
| Tax residency | PRF-09 | CNF-01 OTP | Ops FATCA review if foreign |

**PRF-01 Account home**
- **Content:** Header (name, masked PAN, KYC badge, onboarding stage). Menu: Personal & KYC, Declarations, Contact details, Bank accounts, Nominees, Mandates (MND-01), Reports (STM-01), External holdings (CAS-05), Notifications (NTF-02), Security, Privacy, Help (HLP-01), Legal (PRF-12), Close account (ACC-01), Log out.
- **Footer:** App version, DSC-02.
- **APIs:** `GET /v1/me`.
- **Analytics:** `prf_menu_clicked{item}`.

**PRF-02 Personal and KYC details** (read-only)
- **Content:** Name, masked PAN, DOB, gender, KYC status and KRA, address, nationality, residency.
- **Actions:** "Change name/DOB/address" → PRF-08; "Update declarations" → PRF-03.
- **APIs:** `GET /v1/profile`.
- **Analytics:** `prf_personal_viewed`.

**PRF-03 Update declarations**
- **Fields:** Occupation, income, source of wealth, PEP, marital status (ONB-05 validations; the current values are shown and a change must be explicit).
- **Behaviour:** CNF-01.
- **APIs:** `PATCH /v1/profile/declarations` → challenge.
- **Analytics:** `prf_declarations_updated{fields_count}`.

**PRF-04 Change mobile / email**

| Step | Field | Validation |
|---|---|---|
| 1 | New mobile / new email | AUTH-02 / AUTH-04 rules; must differ; must not be in use |
| 2 | Belongs to | ONB-06 list |
| 3 | OTP to current contact | `OtpField` (skip link "I no longer have access" → HLP-03 assisted change with KYC re-verification) |
| 4 | OTP to new contact | `OtpField` |

- **Copy after success:** "Updated. For your security, redemptions and bank changes are paused until {time}."
- **APIs:** `POST /v1/contacts/change {channel, value, belongsTo}` returns `{challengeId}`; `POST /v1/contacts/change/{id}/verify-current`; `/verify-new`.
- **Analytics:** `prf_contact_changed{channel}`.

**PRF-05 Bank accounts**
- **Content:** List (bank, masked number, type, verification status, badges "Primary for payments" and "Redemption payouts for {n} folios").
- **Actions:** "Add bank" → ONB-08/09 (max 5).
- **APIs:** `GET /v1/bank-accounts`.
- **Analytics:** `prf_banks_viewed`.

**PRF-06 Bank account detail**
- **Actions:**
  - Set as primary for payments (no OTP);
  - Use for redemption payouts (CNF-01; ops change-of-bank; copy about the up-to-10-day cooling);
  - Remove: blocked if linked to an active mandate or registered as a folio payout bank ("This account is used by {mandates/folios}. Change those first."); otherwise a confirm dialog.
- **APIs:** `PATCH /v1/bank-accounts/{id} {primary:true}`, `POST /v1/bank-accounts/{id}/payout-change` → challenge, `DELETE /v1/bank-accounts/{id}`.
- **Analytics:** `prf_bank_action{action}`.

**PRF-07 Nominees**
- **Content:** Current decision and list; Edit → ONB-12/13/14 in "manage" mode.
- **Behaviour:** Confirm via CNF-01. Any change clears the confirmation stamp until re-confirmed.
- **APIs:** `GET /v1/nominations`, `PUT /v1/nominations` → challenge.
- **Analytics:** `prf_nomination_updated{decision}`.

**PRF-08 Change name / DOB / address (KYC modification)**
- **Content:** Explainer: "Changes are made through a KYC update with Aadhaar (DigiLocker) and eSign. Make sure your PAN/Aadhaar already show the new details." Then ONB-03 → ONB-04 → ONB-10 → ONB-11 in "modify" mode → status card "KYC update submitted to KRA".
- **APIs:** `POST /v1/kyc/modify/start`, plus the ONB KYC endpoints.
- **Analytics:** `prf_kyc_modify_started`.

**PRF-09 Tax residency**
- **Fields:** ONB-07 fields.
- **Behaviour:** CNF-01.
- **APIs:** `PUT /v1/profile/tax-residency` → challenge.
- **Analytics:** `prf_fatca_updated`.

**PRF-10 Security and sessions**
- **Native settings:** App lock on/off (the PIN cannot be disabled; biometrics can), change PIN.
- **Sessions:** Active sessions list (device, platform, last active, location city from IP); "Log out" per session and "Log out of all other devices".
- **APIs:** `GET /v1/sessions`, `DELETE /v1/sessions/{id}`, `DELETE /v1/sessions?others=true`.
- **Analytics:** `prf_session_revoked{scope}`.

**PRF-11 Privacy and consents**
- **Content:**
  - List of consents given (document, version, date), with "View".
  - Optional consents (marketing) with withdraw toggles.
  - Required consents show "Withdrawing means closing your account" → ACC-01.
  - "Download my data" (DPDP access; async export JSON + PDF via STM-05-style sheet).
  - Grievance officer contact (DSC-15/21).
- **APIs:** `GET /v1/privacy/consents`, `POST /v1/privacy/consents/{key}/withdraw`, `POST /v1/privacy/data-export`.
- **Analytics:** `prf_consent_withdrawn{key}`, `prf_data_export_requested`.

**PRF-12 Legal and disclosures**
- **Content:** Links to PUB-02 documents, commission disclosure, MFD details (DSC-02), grievance (HLP-05).
- **Analytics:** `prf_legal_opened{doc}`.

### 4.18 Notifications

**NTF-01 Notification inbox**
- **Row:** Icon by category, title, one-line body, time, unread dot. Tap → deep link.
- **Actions:** "Mark all read".
- **Empty:** "No notifications yet."
- **APIs:** `GET /v1/notifications?cursor`, `POST /v1/notifications/read {ids|all}`.
- **Web vs native:** Web bell dropdown (latest 10) plus a full page.
- **Analytics:** `ntf_opened{type}`.

**Notification types**

| Type | Channels | User can disable? |
|---|---|---|
| Login/security alert, contact/bank change, OTP | SMS + email (+ push) | No |
| Order placed / units allotted / failed / payment pending reminder (at +30 min, +4 h) | Push + email + in-app | No (email); push yes |
| SIP instalment upcoming (T−2 days), debit success, debit failed, auto-cancel warning | Push + in-app (+ SMS for failed) | Upcoming: yes; failed: no |
| Mandate approved / rejected | Push + email + in-app | No |
| Redemption credited | Push + email + in-app | No |
| KYC / onboarding status, bank verification | Push + email + in-app | No |
| Statement ready, CAS import done | Push + in-app | Yes |
| ELSS units unlocked | Push + in-app | Yes |
| Product updates / marketing | Push + email + WhatsApp | Yes (consent-gated, default off) |

**NTF-02 Notification preferences**
- **Fields:** Toggles per disable-able category × channel. Mandatory ones are shown locked with "Required for your security/transactions".
- **APIs:** `GET/PUT /v1/notification-preferences`.
- **Analytics:** `ntf_pref_changed{type,channel,on}`.

**NTF-03 Push permission primer** (native)
- **When shown:** After ONB-20 or the first order.
- **Copy:** "Get alerts when your orders complete and before SIP debits." Buttons: Allow → OS prompt; Not now (re-ask at most once after 14 days).
- **APIs:** `POST /v1/devices {pushToken}`.
- **Analytics:** `ntf_push_permission{result}`.

### 4.19 Help and support

**HLP-01 Help centre**
- **Content:** Search; categories (Account & KYC, Payments, SIPs & mandates, Redemptions, Taxes & statements, Security); popular articles; "Contact us"; grievance link (HLP-05).
- **APIs:** `GET /v1/help/articles?q=&category=`.
- **Analytics:** `hlp_search{len}`, `hlp_category_clicked`.

**HLP-02 Help article**
- **Content:** Rendered article, "Was this helpful? Yes/No", contextual "Contact support".
- **APIs:** `GET /v1/help/articles/{slug}`, `POST /v1/help/articles/{slug}/feedback`.
- **Analytics:** `hlp_article_feedback{helpful}`.

**HLP-03 Contact support / raise ticket**

| Field | Validation | Error |
|---|---|---|
| Category | required select | "Choose a topic." |
| Related order / plan | optional picker (prefilled from context) | — |
| Description | 20–2,000 chars; client-side PAN/account-number pattern warning ("Don't share full PAN or bank numbers") | "Tell us a bit more (at least 20 characters)." |
| Attachments | up to 3; PDF/JPG/PNG; ≤5 MB each | "Only PDF, JPG or PNG up to 5 MB." |
| Guest (AUTH-09) | mobile + email required | AUTH validations |

- **Success:** "Ticket #{id} created. We reply within 1 working day." Other channels: email, phone hours.
- **APIs:** `POST /v1/support/tickets` (multipart).
- **Analytics:** `hlp_ticket_created{category}`.

**HLP-04 My tickets / ticket detail**
- **Content:** List (id, subject, status Open / Awaiting you / Resolved, updated). Detail shows a message thread, a reply box, and "Reopen" within 7 days of resolution.
- **APIs:** `GET /v1/support/tickets`, `GET /v1/support/tickets/{id}`, `POST /v1/support/tickets/{id}/messages`.
- **Analytics:** `hlp_ticket_replied`.

**HLP-05 Grievance and escalation**
- **Content:** DSC-21 in full:
  - Level 1: support (ticket);
  - Level 2: Grievance Officer (name, email, phone; response within 7 days — platform SLA);
  - external: AMFI (distributor complaints), SEBI SCORES (AMC/RTA matters), SMART ODR.
- **Public page:** `/grievance`.
- **Analytics:** `hlp_grievance_viewed`.

### 4.20 Account closure / deletion request

**ACC-01 Close account: intro**
- **Copy:**
  - "Closing your Sanchay account stops all services."
  - "Your mutual fund units are held in your name with the AMCs and are not deleted. You can continue to access them via the AMC, CAMS/KFintech or MF Central."
  - "We keep records we are legally required to retain (e.g. KYC and transaction records, for the statutory period); everything else is deleted."
- **CTAs:** "Continue" / "Keep my account".
- **Store rules:** In-app initiation per Apple App Store Review Guideline 5.1.1(v) (https://developer.apple.com/app-store/review/guidelines/, not re-fetched this session), plus the Google Play web link (PUB-02).
- **Analytics:** `acc_close_intro_viewed`.

**ACC-02 Close account: pre-checks**
- **Checklist (server):**
  - no orders in progress;
  - no active or paused SIP/STP/SWP (inline "Cancel all plans" → per-plan CNF-01 batch challenge);
  - no active mandates (cancel link);
  - no pending redemptions.
- **Optional:** "Redeem everything first?" → RED flows.
- **Behaviour:** Blocked items show action links; Continue is enabled only when all pass.
- **APIs:** `GET /v1/account/closure/precheck`.
- **Analytics:** `acc_precheck_viewed{blocked_count}`.

**ACC-03 Close account: reason and confirm**
- **Fields:** Reason (required radio: Moving to another app / Don't invest anymore / Privacy concerns / Bad experience / Other (text)); acknowledgement checkbox (unticked) "I understand my account will be closed after 7 days and this cannot be undone after that".
- **Behaviour:** → CNF-01.
- **APIs:** `POST /v1/account/closure {reason}` → challenge.
- **Analytics:** `acc_close_requested{reason}`.

**ACC-04 Closure request status**
- **States:**
  - Scheduled: "Your account will close on {date}." "Cancel request" is available (logging in during the 7-day window shows this screen first).
  - Closed: final email; the session is revoked.
- **APIs:** `GET /v1/account/closure`, `DELETE /v1/account/closure`.
- **Analytics:** `acc_close_cancelled`, `acc_closed`.

### 4.21 System

| ID | Purpose / trigger | Copy / behaviour | API |
|---|---|---|---|
| SYS-01 Update required | `appVersion < minAppVersion` | "Please update Sanchay to continue." → store link. Blocking. | `GET /v1/app/config` |
| SYS-02 Maintenance | `maintenance=true` or 503 | "Sanchay is under scheduled maintenance until {time}. Your investments are safe." Read-only cached Portfolio if available. | same |
| SYS-03 Offline | Connectivity lost | Persistent top banner "You're offline"; mutations disabled | — |
| SYS-04 Not found / error | 404 or unhandled error (ErrorBoundary; v1 audit M1) | "This page doesn't exist" / "Something went wrong" + Home | — |
| SYS-05 Handoff return router | `/r/[kind]` or `sanchay://r/[kind]` | Spinner "Checking status…" then server re-read and route: digilocker/esign → ONB-04; payment → PAY-01 result; mandate → MND-03 | per kind |

- **Analytics:** `sys_force_update_viewed`, `sys_maintenance_viewed`, `sys_return_routed{kind,result}`.

---

## 5. Cross-screen state machines (UI contract)

### 5.1 Onboarding stage (server `onboardingStage`)
```
SIGNED_UP → IDENTITY_CAPTURED → KYC_CHECKED{A|B|WAIT|BLOCKED}
 → DETAILS_CAPTURED → (B: KYC_DOCS_DONE → ESIGNED) → BANK_VERIFIED
 → NOMINATION_DECIDED → CONSENTED → SUBMITTED → ACCOUNT_SETUP
 → [ADDITIONAL_REVIEW] → [KYC_PENDING] → READY
 any → BLOCKED | REJECTED
```
Screens read `stage` and `steps[]`; they never infer the stage client-side.

### 5.2 Plan status → UI

| Plan status | UI label |
|---|---|
| `MANDATE_PENDING` | Mandate pending |
| `ACTIVE` | Active |
| `PAUSED` | Paused until {date} |
| `CANCELLED` | Cancelled |
| `COMPLETED` | Completed |
| `FAILED` | Couldn't start |

### 5.3 Challenge lifecycle
`PENDING → CHALLENGE_SENT → CONSUMED` (on confirm; the FP write happens inside the same unit of work), or `EXPIRED` / `SUPERSEDED`.

This drops v1's intermediate `APPROVED` 60-minute window, because the investor confirms and submits in one step. The exactly-once rule and the rule of one live challenge per resource are kept (v1 `V61__add_transaction_approval_challenges.sql:47-50`).

---

## 6. Pre-launch gates this spec depends on (decisions made, owner actions)

| Gate | Decision in this spec | Owner action before launch |
|---|---|---|
| Nominee cap and online opt-out | 3 nominees; OTP declaration (A7, A8) | Legal reads the SEBI 29-May-2026 PDF and the opt-out modality |
| FP enum values (`source_of_wealth`, `pep_details`, `income_slab`, relationships, cancellation codes) | Mapping tables in ONB-05/13 and SIPM-06 | Sprint-0 contract tests against the FP sandbox |
| FP support for Regular-plan ARN tenant plus execution-only EUIN-blank orders | DSC-08 plus `euin` omitted, `partner` = platform ARN config (https://docs.fintechprimitives.com/mf-transactions/partner-tagging/, accessed 2026-09-25) | Cybrilla written confirmation (the v1 inquiry email was never sent, fill:G2/G4) |
| Commission trail % per scheme | Admin-curated table feeding DSC-03 | Ops loads AMC brokerage structures |
| Real legal documents (ToU, Privacy, MFD disclosure) | ONB-15 requires versioned documents | Legal drafts; v1 had none (BE `service/ConsentTexts.java:27-29`) |
| DLT SMS templates (OTP with WebOTP/app-hash suffix, alerts) | A3 | Register with the telco DLT before launch |

---

## 7. Sources

**v1 code (read-only):**
- BE `service/NominationRules.java:25,28,31`
- BE `validation/PanFormat.java:15`
- BE `validation/MobileFormat.java:14`
- `application.yml:224-229` (OTP config; no secrets reproduced)
- BE `service/OrderService.java:2193-2230`
- BE `service/InvestorActionService.java:1014-1026`
- BE `service/TransactionConsentTemplates.java:150-298`
- BE `service/ConsentTexts.java:18-38`
- BE `integration/RealCybrillaClient.java:2587-2606, 2808-2899, 1266-1283`
- FE `views/InvestorOnboarding.tsx:190-191, 3039-3062, 3250-3320`
- FE `utils/nomination.ts:18-48`
- FE `v2-ui/screens/KycScreen.tsx:14-111`
- FE `v2-ui/lib/format.ts`, FE `v2-ui/lib/approvalConsent.ts`
- Prior slice reports: synthesis, map:fe-distributor-console, map:fe-investor-ux, map:be-onboarding-kyc, map:be-transactions, map:docs-compliance, map:research-domain-b2c, fill:G1/G3/G5/G6.

**Web (accessed 2026-09-25):**
- [FP: Pause an SIP](https://docs.fintechprimitives.com/mf-transactions/purchase-plans/pause-sip/)
- [FP: Create a new STP](https://docs.fintechprimitives.com/mf-transactions/recurring-switches/)
- [FP: Create a new SWP](https://docs.fintechprimitives.com/mf-transactions/recurring-redemptions/)
- [FP: Auto cancellation of purchase plans](https://docs.fintechprimitives.com/mf-transactions/purchase-plans/auto_cancellation)
- [FP: Partner tagging](https://docs.fintechprimitives.com/mf-transactions/partner-tagging/)
- [Stable Money: NPCI raises UPI limit to ₹5 lakh](https://stablemoney.in/blog/npci-raises-upi-limit)
- [Outlook Money: UPI limits raised](https://www.outlookmoney.com/banking/upi-daily-transaction-limits-raised-to-rs-5-lakh-for-select-categories)
- [Wealthy: EUIN and execution-only declaration](https://www.wealthy.in/partner-desk/partner-blog/euin-number-in-mutual-fund-537)
- [AMFI Master Circular for MFDs](https://www.amfiindia.com/uploads/AMFI_Master_Cicular_for_MF_Ds_3c7f5ee44f.pdf)
- [SEBI: Modified norms for nomination (May 2026)](https://www.sebi.gov.in/legal/circulars/may-2026/ease-of-doing-investments-modified-norms-for-nomination-in-demat-accounts-and-mutual-fund-folios_101703.html)
- [SEBI: Overnight scheme redemption cut-off (Apr 2025)](https://www.sebi.gov.in/legal/circulars/apr-2025/change-in-cut-off-timings-to-determine-applicable-nav-with-respect-to-repurchase-redemption-of-units-in-overnight-schemes-of-mutual-funds_93541.html)

**Cited but not re-fetched this session:** Apple App Store Review Guidelines 5.1.1(v); Google Play account-deletion policy.

### Critical files for implementation
- C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/service/TransactionConsentTemplates.java
- C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/service/RedemptionAvailability.java
- C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/integration/RealCybrillaClient.java
- C:/Users/pc/Desktop/WeathTech_v2/investor-frontend/src/utils/nomination.ts
- C:/Users/pc/Desktop/WeathTech_v2/investor-frontend/src/v2-ui/lib/format.ts
