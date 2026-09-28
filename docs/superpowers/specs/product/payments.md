<!-- source: workflow wf_3190e72a-04a label spec:payments | exported 2026-09-28 -->

# Sanchay: Payments and Mandates Specification (lumpsum, SIP, mandates, refunds, reconciliation, web and Expo native)

Prepared 2026-09-25. Read-only analysis; no files were changed. Evidence tags used below: **[v1]** means v1 code at `path:line`, **[FP]** means docs.fintechprimitives.com (read 2026-09-25), **[Web]** means a regulator or press source (URLs in §20). Where a fact could not be verified, it is written as an **Assumption (A-n)** with a concrete sandbox spike in §19. Nothing is left as TBD.

---

## 0. TL;DR: the recommendations

| # | Decision |
|---|---|
| R1 | **All money moves through the FP–Cybrilla POA gateway (`/api/pg/*`)**, not BSE StAR MF or NSE NMF II rails, and not our own PG. Payments are issued in Cybrilla's name ([FP capabilities]). There is no pooling, because Sanchay never touches funds (SEBI pool-account ban). |
| R2 | **Lumpsum rails, in priority order:** (a) UPI Intent on phones (Android, native iOS, mobile web). (b) UPI QR on desktop web. (c) Netbanking on every platform, and the forced default above the UPI ceiling. (d) UPI Collect (VPA) only as a desktop-web fallback behind a feature flag. There is no card, wallet or NEFT/RTGS/IMPS at launch. |
| R3 | **SIP rails:** UPI Autopay mandate when every debit is ≤ ₹1,00,000. Otherwise eNACH (netbanking, debit card or Aadhaar auth on the Cybrilla/PG hosted page). **One mandate per (investor, bank account, type) is reused across all SIPs**, stored as a first-class `mandates` row, not on the order row as v1 did. |
| R4 | **Mandate limits:** UPI Autopay is fixed at ₹1,00,000 (the network cap). eNACH defaults to ₹1,00,000; the investor can raise it in steps of ₹1L, ₹2L, ₹5L, ₹10L, ₹25L, and the default auto-bumps to cover 1.5× their total SIPs on that account. **Do not port v1 `mandateLimitFor` = max(₹1L, 2×SIP)**: for any SIP above ₹50k it produces a UPI mandate above the ₹1L UPI cap ([v1] `InvestorActionService.java:1014-1019`). |
| R5 | **First SIP instalment:** plan with `generate_first_installment_now=true`. Once the mandate is `APPROVED`, debit it through the mandate payment (`POST /api/pg/payments/nach` with `mandate_id` + first-instalment `amc_order_ids`), which is the documented FP sequence and matches v1. Show the investor an honest ETA: UPI Autopay debit about T+1 (24h pre-debit notice), eNACH T+1 to T+3. Later instalments are debited automatically by FP/PG. |
| R6 | **TPV is enforced by construction:** every payment and mandate carries the FP `bank_account_id` of a **verified bank account on the folio**. The UI only lets the investor pick their own verified accounts and tells them explicitly to pay from that account. A TPV mismatch is a failure-plus-refund path (§11). |
| R7 | **Status truth comes only from FP state fetched server-side.** Browser postbacks and webhooks are just *triggers* to re-fetch. Webhooks go into a persistent `webhook_inbox` with a unique constraint (fixes v1's in-memory dedupe). A backoff poller covers every non-terminal object, plus a nightly full reconcile and an ops exception queue. |
| R8 | **Native return path:** open `token_url` pages with `WebBrowser.openAuthSessionAsync(url, 'sanchay://pg-return', { preferEphemeralSession: true })`. The backend postback endpoint 303-redirects per attempt channel (web → `https://sanchay.in/...`, native → `sanchay://pg-return?ref=…`). Universal links and App Links are a secondary path for cold starts. UPI Intent uses an in-house Expo module (`@sanchay/upi-intent`): Android lists and launches UPI apps; iOS uses app-specific schemes. Every in-flight attempt is persisted so the app can resume after the OS kills it on low-end Android. |
| R9 | **Money states are never faked.** No UI "success" before FP `success`. A failed *payment* never fails the *order*: it becomes retryable, keeping v1's "payment honesty" rule ([v1] `InvestorActionService.java:674-682`). Only one open payment attempt per order (FP rule), enforced by a partial unique index. |
| R10 | **SEBI 2FA:** an OTP to the registered email or mobile, verified before the FP consent PATCH, for every lumpsum and at SIP/mandate registration only. Instalments are not re-authenticated. Port the v1 `TransactionApprovalService` snapshot-hash gate. |

---

## 1. Regulatory and network constraints that shape the design

| Constraint | Value | Design consequence | Source |
|---|---|---|---|
| No pool accounts | Since 2022-07-01, no MFD/platform may pool investor money; funds go straight to the scheme account, and redemptions are paid only to the registered, verified bank account on the folio. | No wallet, no escrow, no "Sanchay balance". The PG settles to the AMC (through Cybrilla POA). | [Web-1] |
| Third-party payment ban / TPV | Payment must come from the investor's own registered bank account; brokers and MF platforms enforce this via TPV (the PG passes account number and IFSC to the remitter bank). | Every payment carries `bank_account_id` (§5). | [Web-2], [FP custom-checkout] |
| SEBI 2FA | 2FA (OTP to email or phone registered with the AMC/RTA) required for online subscription from 2023-04-01 and for redemption since June/July 2022. For systematic transactions, only at registration. | OTP before consent on each lumpsum. OTP once at SIP/mandate registration. None per instalment. | [Web-3] SEBI/HO/IMD/IMD-I DOF1/P/CIR/2022/132 (2022-09-30) |
| NAV on realisation of funds | Since 2021-02-01, the NAV date is the day funds reach the MF bank account before cut-off (3 pm for most schemes; liquid/overnight have their own cut-offs). | UX never promises today's NAV. It says "NAV date depends on when the AMC receives money". Faster rails (UPI, netbanking) are preferred. | [Web-4] SEBI/HO/IMD/DF2/CIR/P/2020/175, /253; [FP NAV-Applicability] |
| UPI P2M limit for capital markets | ₹5 lakh per transaction and ₹10 lakh per 24h for verified capital-market/insurance merchants, from 2025-09-15. Banks may set lower internal limits. | Offer UPI up to ₹5,00,000 but warn above ₹1,00,000 ("your bank may limit UPI"). Hide UPI above ₹5L; netbanking only. | [Web-5] |
| UPI P2P collect discontinued | NPCI stopped P2P collect from 2025-10-01. P2M collect (merchant requests) continues. | Collect is legal for us but is the weakest UX and most fraud-associated rail, so desktop fallback only, feature-flagged. | [Web-6] |
| e-mandate AFA relaxation | AFA-free recurring debits up to ₹1,00,000 per transaction for MF subscriptions (RBI, Dec 2023). Registration itself needs AFA. 24h pre-debit notification is mandatory. | Cap UPI Autopay at ₹1L per debit. Tell the investor to expect a pre-debit SMS or UPI-app notice a day before. | [Web-7] |
| RBI Authentication Directions 2025 | Two factors, at least one dynamic, for digital payments; compliance by 2026-04-01. | Handled by banks, PSPs and the PG. Nothing for us to build, but don't design around SMS-OTP-only bank pages (biometric or app factors may appear). | [Web-8] |
| NPCI API guidelines (from 2025-08-01) | Autopay executes only off-peak (before 10:00, 13:00–17:00, after 21:30). Max 1 attempt + 3 retries per execution. Status checks are rate-limited (3 checks, 90 s apart). | SIP debit *time* is not ours to control: show "debited on or after <date>". UPI status can legitimately stay pending for minutes to hours, so never time out to "failed" on the client. | [Web-9], [Web-10] |
| Mandate portability / UPI Help | Since 2025-12-31, investors can view, revoke and port Autopay mandates from any UPI app or upihelp.npci.org.in. | Expect out-of-band revocations. Handle `mandate.*` cancel events and poll mandates daily (§8.5). | [Web-11] |
| Failed-transaction TAT | UPI/IMPS debit without credit: auto-reversal by T+1, else ₹100/day compensation paid by the bank (RBI DPSS.CO.PD No.629/02.01.014/2019-20). | Copy for "money debited but payment failed": "your bank reverses it within 1 working day". | [Web-12] |
| UPI MDR (reported, effective 2026-10-15) | Reported: 0.02% (cap ₹300) on one-time capital-market P2M above ₹2,000; mandate/Autopay recurring exempt. Borne by the merchant (Cybrilla). | No investor-facing fee, ever. Commercial point to confirm with Cybrilla (A-9). | [Web-13] (press report, 2026-09-15) |

---

## 2. FP–Cybrilla POA gateway: verified facts

| Topic | Fact | Evidence |
|---|---|---|
| Payment methods | UPI and Netbanking for lumpsum. UPI Autopay and eNACH for **single** lumpsum and SIPs. No mandate payments for batch orders. | [FP capabilities] |
| SIP frequencies | Monthly, business-day daily, calendar-day daily only. **v1's QUARTERLY is invalid on this gateway** ([v1] `OrderService.java:2199-2205`). | [FP capabilities] |
| Instalment day | 1–28 (29–31 unsupported). | [FP usecase-monthly-sips] |
| Switch / STP / SWP | Supported. No payment involved. | [FP capabilities] |
| Visibility | The investor sees "Cybrilla" in the bank statement and the UPI mandate. | [FP capabilities] |
| Purchase lifecycle | `under_review → pending (mf_purchase.review_completed) → [consent PATCH] → create payment → confirm → submitted → successful/failed`. | [FP overview], [FP custom-checkout] |
| Payment create | `POST /api/pg/payments/netbanking` with `amc_order_ids[]`, `payment_postback_url`, `method`, `bank_account_id` (FP int `old_id`), `provider_name`, `upi.type` ∈ {`uri`,`collect`} (lowercase), `upi.vpa` for collect. v1 used `provider_name="ONDC"` for lumpsum. | [FP custom-checkout]; [v1] `RealCybrillaClient.java:72-79, 1222-1265`, `InvestorActionService.java:753-771` |
| Payment response | `id, token_url, upi.{type,vpa,uri}, payment_type, status, amount, debit_date, amc_order_ids, method, provider_name`. **For Intent/QR only the payment ID may come back first; `upi.uri` arrives via `payment.updated`** (or on re-fetch). | [FP custom-checkout]; [v1] re-fetch fallback `InvestorActionService.java:779-803` |
| One method per payment | "When the user selects one of the Collect, QR or Intent, disable the other options as there is no provision to create multiple payments." | [FP custom-checkout] |
| UPI URI example | `upi://pay?pa=billdesk@hdfcbank&…&mc=7399&tr=…&am=1001.00&mam=1001.00&cu=INR`. The PG is BillDesk (A-1). | [FP custom-checkout] |
| Retry | Allowed only when the previous payment `failed`, the order is still `submitted`, and there is no pending or successful payment. Each retry is a **new payment ID**, same `amc_order_ids` and `bank_account_id`, **no re-confirm**. Only one pending payment per order. | [FP payment-retry] |
| Mandate create | `POST /api/pg/mandates` with `mandate_type` ∈ {`E_MANDATE`,`UPI`}, `bank_account_id`, `mandate_limit`, `provider_name` (v1 default `CYBRILLAPOA`). | [FP managing-eNACH]; [v1] `RealCybrillaClient.java:1326-1339`, `InvestorActionService.java:76` |
| Mandate authorize | `POST /api/pg/payments/emandate/auth` with `mandate_id`, `payment_postback_url` returns `token_url`. For UPI Autopay custom checkout, `upi.type` (`uri` or `collect` + `vpa`) returns a `upi://mandate?...` URI. | [FP custom-checkout]; [v1] `RealCybrillaClient.java:1342-1353` |
| UPI mandate URI | `upi://mandate?…validitystart=18062025&validityend=17062055&am=100000.00&fam=1.00&amrule=MAX&recur=ASPRESENTED…&txntype=CREATE`: ₹1L MAX-rule cap, ₹1 first amount, as-presented recurrence, about 30-year validity. One mandate can serve many SIP dates. | [FP custom-checkout] |
| Mandate statuses | `CREATED` (awaiting auth), `RECEIVED` (BSE), `SUBMITTED` (auth done, bank approval pending), `APPROVED`, `REJECTED`, `CANCELLED`. Approval is "typically immediate" or up to T+1. The UPI Autopay auth debits ₹1, refunded in 3–5 working days. | [FP managing-eNACH] |
| Provider limits | eNACH ₹1 Cr. UPI Autopay ₹1 lakh (BillDesk per day; Razorpay per transaction). | [FP managing-eNACH] |
| Mandate payment | "Create an eNACH or UPI Autopay payment" with `mandate_id` and `amc_order_ids`, mandate must be `APPROVED`. Statuses `PENDING → SUBMITTED → SUCCESS → INITIATED → APPROVED` or `FAILED`. "FP manages the payment debits via mandate" for recurring instalments. v1 path `POST /api/pg/payments/nach`. | [FP payment-via-eNACH]; [v1] `RealCybrillaClient.java:1404-1416` |
| SIP + mandate | Plan `created → review_completed → confirmed → submitted`. Mandate set as `payment_source` before confirm. `generate_first_installment_now=true` pre-pones instalment 1 to the creation day. Find the first instalment's `old_id` via List MF Purchases (`?plan=`). Several SIPs share one mandate, each with its own monthly debit. | [FP mandate-payments-usecases], [FP usecase-monthly-sips]; [v1] `InvestorActionService.java:508-559` |
| Holidays | UPI Autopay debits on the bank holiday itself. eNACH debits the next bank working day. | [FP usecase-monthly-sips] |
| Instalment failure | The instalment is marked failed and the SIP continues. | [FP payments/FAQs] |
| Refund | "credited back to the original payment source". | [FP payments/FAQs] |
| Sandbox | Order amount ending in 0 → RTA success; ending in 1 → RTA failure. `POST /api/pg/simulate/payments/{id}` (SUBMITTED→APPROVED→SUCCESS). `POST /api/pg/simulate/mandates/{id}` (SUBMITTED→RECEIVED→APPROVED; a single jump can get stuck). | [FP sandbox-simulation]; [v1] `InvestorActionService.java:469-500`, skill ref `pending-work.md:137` |
| Redemptions | Only for folios created through this gateway. | [FP overview] |

---

## 3. Recommended rails: decision matrix

### 3.1 Lumpsum (and a missed-instalment "pay now", which is a fresh lumpsum)

| Platform | Default | Secondary | Fallback | Hidden when |
|---|---|---|---|---|
| Android native | **UPI Intent**: in-app picker of installed UPI apps (explicit package launch) | Netbanking (Custom Tab) | "Other UPI app" (system chooser) | UPI hidden if amount > ₹5L or no UPI app installed |
| iOS native | **UPI Intent** via app-specific schemes (GPay, PhonePe, Paytm, BHIM, CRED; only those `canOpenURL` true) | Netbanking (auth session) | QR "scan from another phone" | UPI hidden if amount > ₹5L or no supported app |
| Mobile web (Android) | UPI Intent (`<a href="upi://pay?...">`, user-gesture) | Netbanking (same-tab redirect) | — | amount > ₹5L |
| Mobile web (iOS Safari) | App buttons with app-specific schemes (can't detect installs, so show the top 4) | Netbanking | QR | amount > ₹5L |
| Desktop web | **UPI QR** (rendered client-side from `upi.uri`) | Netbanking (same-tab redirect) | UPI Collect (VPA) behind flag `pay.upi_collect` | amount > ₹5L (UPI) |
| Any, amount > ₹1L and ≤ ₹5L | Netbanking pre-selected, UPI allowed with the note "many banks cap UPI at ₹1L/day" | | | |

Why not BSE/NSE exchange rails: the locked decision is FP execution through Cybrilla POA, and exchange rails would require exchange membership and separate payment integration. The FP gateway already gives UPI, netbanking, UPI Autopay and eNACH with TPV.

### 3.2 SIP mandate choice

| Condition | Mandate | Rationale |
|---|---|---|
| Largest single debit on that bank account ≤ ₹1,00,000, bank is a UPI Autopay issuer, and the investor has a UPI app | **UPI Autopay** (default) | Instant approval, native UX, AFA-free up to ₹1L for MF, MDR-exempt. |
| Any debit > ₹1L, **or** investor prefers it, **or** UPI Autopay failed or unsupported | **eNACH** (netbanking / debit card / Aadhaar on the hosted page) | ₹1 Cr ceiling. Approval T+0 to T+1 (up to 5 working days worst case, A-4). |
| An eligible ACTIVE mandate already exists on the chosen bank with headroom | **Reuse** (no new auth) | FP supports many SIPs per mandate. Only a SEBI 2FA OTP is needed for the new SIP. |

**Headroom rule:** debits of all ACTIVE SIPs on the same mandate that fall on the same calendar day, plus the new SIP, must stay ≤ `mandate_limit`. This covers BillDesk's per-day UPI ceiling (A-1). If not, offer "set up a new mandate" (eNACH suggested).

---

## 4. Third-party payment validation (TPV)

| Rule | Implementation |
|---|---|
| T1. Only verified accounts on the investor's profile are payable. | Payment and mandate creation look up `bank_accounts` with `verification_status=VERIFIED` and a non-null FP `old_id`. v1 did this with `resolveFpBankAccountOldId` ([v1] `InvestorActionService.java:~990-1012`). |
| T2. Every FP payment and mandate call passes `bank_account_id`. | Required in our FP client types (not optional as it is in v1 `createPayment`, `RealCybrillaClient.java:1243-1245`). |
| T3. The UI names the account. | "Pay ₹5,000 from **HDFC Bank ••4821**". In the UPI app, "choose the HDFC ••4821 account". Netbanking: "log in to HDFC netbanking for account ••4821". |
| T4. A different account means failure plus automatic refund. | Classify FP failure reasons that contain TPV/account-mismatch terms as `TPV_MISMATCH`. Show a specific message and keep the order retryable (§10, §11). |
| T5. Joint or minor accounts | Out of scope at launch (individual resident holders only). Guardian accounts come later with minor folios. |
| T6. Changing the payout/debit bank | Adding a bank needs penny-drop verification and a folio bank update (onboarding slice). A new bank can be used for **new** payments only after FP shows it VERIFIED. Existing mandates stay tied to their bank. |
| T7. Netbanking TPV coverage | Keep a `bank_capabilities` table (IFSC bank code → `netbanking_tpv`, `upi_autopay_issuer`, `enach_netbanking`, `enach_debit_card`, `enach_aadhaar`). Seed it from the PG/Cybrilla bank list (A-3) and auto-downgrade a capability after 3 consecutive "bank not supported" failures, with an ops alert. |

---

## 5. Lumpsum purchase: sequence

```
Client                 Sanchay API                         FP / Cybrilla POA
 | Review order ------>| create order (DRAFT)               |
 |                     | POST /v2/mf_purchases  (idem: ord-<uuid>) -> under_review
 |<-- OTP sent --------| send SEBI 2FA OTP (email+SMS)      |
 | enter OTP --------->| verify OTP, freeze snapshot hash   |
 |                     | wait review_completed (webhook/poll, <=30s) -> pending
 |                     | PATCH /v2/mf_purchases {consent}   |
 |                     | POST /api/pg/payments/netbanking {amc_order_ids,bank_account_id,method,upi?,postback} -> payment id
 |                     | PATCH /v2/mf_purchases {state:confirmed} -> submitted
 |                     | fetch payment until upi.uri/token_url (<=10s) |
 |<-- {kind,uri|url} --|                                    |
 | launch UPI / open token_url ... investor pays ...        |
 |                     |<-- payment.updated / mf_purchase.* webhook (trigger) |
 | (return via postback 303 or app resume)                  |
 | poll GET /v1/checkout/{ref} (our DB) <-- reconciler fetches FP payment + purchase
 |<-- PAID -> ALLOTMENT_PENDING -> ALLOTTED (units, NAV date, folio)
```

Rules:
- **Create the FP purchase at "Review order" (before OTP)**, so FP's async review overlaps with the investor typing the OTP. This matters on low-end Android. A sweeper cancels abandoned FP purchases (`POST /v2/mf_purchases/{id}/cancel`, [v1] `RealCybrillaClient.java:1562-1569`) after 30 min in `pending`. This also closes the "FP write before 2FA" worry from synthesis L15: nothing that moves money happens before the OTP gate (consent, payment and confirm all sit behind it).
- **The order of calls is fixed: consent → payment → confirm** ([FP custom-checkout]; v1 `InvestorActionService.java:733-738`).
- The 2FA gate is "assert APPROVED + snapshot-hash matches + consume" immediately before the consent PATCH (port [v1] `TransactionApprovalService.java:474-518`).

## 6. Lumpsum state machines

### 6.1 `purchase_orders.status` (local)

| From | Event | To | Notes |
|---|---|---|---|
| — | investor taps Review | `DRAFT` | Local only |
| `DRAFT` | FP create OK | `PROVIDER_REVIEW` | FP `under_review` |
| `DRAFT` | FP create 4xx | `REJECTED` | Show FP reason (min amount, scheme closed, KYC) |
| `DRAFT` | FP unreachable | `DRAFT` (+ `retry_at`) | Re-try with the same idempotency key. v1 had `persistDeferredOrder` ([v1] `OrderService.java:610-643`). |
| `PROVIDER_REVIEW` | `review_completed` / FP `pending` | `AWAITING_CONSENT` | |
| `PROVIDER_REVIEW` | FP `failed` | `REJECTED` | |
| `AWAITING_CONSENT` | OTP verified, consent PATCH OK | `CONSENTED` | 2FA consumed |
| `AWAITING_CONSENT` / `CONSENTED` | 30 min idle / investor cancels | `ABANDONED` | FP cancel attempted |
| `CONSENTED` | payment created + confirm OK | `PAYMENT_PENDING` | FP `submitted` |
| `PAYMENT_PENDING` | attempt `SUCCESS` | `PAID` | Money left the account |
| `PAYMENT_PENDING` | attempt `FAILED` | `PAYMENT_RETRYABLE` | FP order still `submitted` |
| `PAYMENT_RETRYABLE` | new attempt created | `PAYMENT_PENDING` | New payment, no re-confirm |
| `PAYMENT_RETRYABLE` | T+1 business day 23:59 IST without success / investor cancels | `EXPIRED` | FP cancel attempted (A-6) |
| `PAID` | FP purchase `submitted` (at RTA) | `ALLOTMENT_PENDING` | |
| `ALLOTMENT_PENDING` | FP `successful` | `ALLOTTED` | Store units, NAV, NAV date, folio, stamp duty (port v1 `applyAllotmentOnCompletion`, `OrderService.java:820-943`) |
| `ALLOTMENT_PENDING` | FP `failed` | `FAILED_REFUND_PENDING` | Opens a `refund_cases` row |
| `FAILED_REFUND_PENDING` | ops confirms credit / SLA elapses with no dispute | `REFUNDED` / `REFUND_ASSUMED` | §11 |

Terminal states: `ALLOTTED`, `REJECTED`, `ABANDONED`, `EXPIRED`, `REFUNDED`, `REFUND_ASSUMED`. **Invariant:** once `PAID`, no transition returns to a pre-payment state, and a late postback can never resurrect a terminal order (port v1's allow-list idea, `InvestorActionService.java:616-624`).

### 6.2 `payment_attempts.status`

| From | Event | To |
|---|---|---|
| — | FP payment created | `CREATED` |
| `CREATED` | `upi.uri` or `token_url` available and delivered to the client | `AWAITING_INVESTOR` |
| `CREATED` | no URI after 10 s of fetching | `AWAITING_INVESTOR` (client shows a spinner; a webhook or poll will fill the URI) |
| `AWAITING_INVESTOR` | FP status `submitted` / `pending` with investor action seen (return or postback) | `PROCESSING` |
| `AWAITING_INVESTOR` / `PROCESSING` | FP `success` | `SUCCESS` |
| `SUCCESS` | FP `approved`/`initiated` (funds to AMC) | `SETTLED` |
| any non-terminal | FP `failed` | `FAILED` (with `failure_code`: `USER_DECLINED`, `TIMEOUT`, `INSUFFICIENT_FUNDS`, `TPV_MISMATCH`, `BANK_DOWN`, `LIMIT_EXCEEDED`, `UNKNOWN`) |
| any non-terminal | FP `cancelled` | `CANCELLED` |
| `AWAITING_INVESTOR`/`PROCESSING` | 2 h without terminal FP state | `STALE` (still polled; ops queue item; investor sees "still confirming with your bank") |

Integrity rules:
- Partial unique index `ux_open_attempt_per_order ON payment_attempts(order_id) WHERE status IN ('CREATED','AWAITING_INVESTOR','PROCESSING','STALE')`. This is FP's "one pending payment" rule.
- A new attempt is allowed only when FP itself reports the previous one `failed`/`cancelled`. **Never** create a new attempt because the client timed out.
- Map FP status vocabularies case-insensitively. The lumpsum docs use `pending/success/failed`; the mandate-payment docs use `PENDING/SUBMITTED/SUCCESS/INITIATED/APPROVED/FAILED`.

---

## 7. Mandates

### 7.1 Setup sequence

| Step | UPI Autopay | eNACH |
|---|---|---|
| 1 | SEBI 2FA OTP for SIP registration (covers the mandate) | same |
| 2 | `POST /api/pg/mandates {mandate_type:"UPI", bank_account_id, mandate_limit:100000, provider_name:"CYBRILLAPOA"}` | `{mandate_type:"E_MANDATE", mandate_limit: chosen}` |
| 3 | Authorize. **Native and mobile web:** `upi.type:"uri"` returns `upi://mandate?…`, launched like UPI Intent. **Desktop:** QR from the same URI. **Fallback:** `token_url` hosted page. | Authorize, which returns `token_url`, opened in the hosted page (bank netbanking, debit card or Aadhaar picked there) |
| 4 | The investor approves in the UPI app with PIN; ₹1 is debited and later refunded | The investor authenticates at the bank or NPCI |
| 5 | FP `SUBMITTED → APPROVED` (typically seconds) | `SUBMITTED` then `APPROVED` (T+0 to T+1, A-4) |
| 6 | → SIP plan creation (§8) | → SIP plan creation once `APPROVED` (per the cybrillapoa guide; don't rely on the generic-FP "plan with pending mandate" behaviour) |

BSE-only quirk (one-minute gap between create and authorize) does not apply to the CYBRILLAPOA provider ([FP managing-eNACH]).

### 7.2 `mandates.status` (local, first-class)

| From | Event | To |
|---|---|---|
| — | FP create OK | `CREATED` |
| `CREATED` | auth URI or URL delivered | `AUTH_PENDING` |
| `AUTH_PENDING` | FP `SUBMITTED`/`RECEIVED` | `BANK_APPROVAL_PENDING` |
| `AUTH_PENDING`/`BANK_APPROVAL_PENDING` | FP `APPROVED` | `ACTIVE` |
| `AUTH_PENDING` | investor fails or declines (FP stays `CREATED`, or failure) | `AUTH_PENDING` (re-authorize allowed: a new authorize call on the same mandate) |
| `AUTH_PENDING` | 24 h without auth | `ABANDONED` (FP cancel; linked SIP drafts become `SETUP_ABANDONED`) |
| `BANK_APPROVAL_PENDING` | FP `REJECTED` | `REJECTED` (reason shown; offer the other mandate type) |
| `BANK_APPROVAL_PENDING` | 5 working days with no decision | `BANK_APPROVAL_PENDING` + ops item (A-4) |
| `ACTIVE` | investor cancels in Sanchay (OTP) | `CANCEL_REQUESTED` → FP cancel → `CANCELLED` |
| `ACTIVE` | FP `CANCELLED` seen without our request (revoked in UPI app, UPI Help or bank) | `REVOKED_EXTERNALLY` |
| `ACTIVE` | `valid_till` passed | `EXPIRED` |

Invariants:
- A mandate can be cancelled in-app only if **no ACTIVE or PAUSED SIP** references it. Otherwise the investor must cancel those SIPs, or move them to another mandate (§8.4), first.
- `REVOKED_EXTERNALLY` immediately flags every linked SIP as `MANDATE_LOST` and sends a push, email and in-app banner: "Your SIPs X, Y will fail from <next date>. Set up a new mandate."

### 7.3 Mandate UX rules

| # | Rule |
|---|---|
| M1 | Show the limit plainly: "Maximum per debit ₹1,00,000. Your SIPs debit only the SIP amount each month." |
| M2 | For UPI Autopay, disclose the ₹1 verification debit ("refunded in 3–5 working days") and that the mandate shows as "Cybrilla" in the UPI app. |
| M3 | For eNACH, show the approval ETA ("usually within 1 working day") and that the first SIP debit happens only after approval. |
| M4 | A "Mandates" screen under Profile → Bank lists each mandate: type, bank, limit, status, linked SIPs, created date, and a cancel action (OTP) only when unlinked. |
| M5 | Never ask for UPI PIN, netbanking passwords or card details inside Sanchay. Only bank, NPCI or UPI-app surfaces collect them. |

---

## 8. SIP payments

### 8.1 Registration and first instalment

| Step | Action |
|---|---|
| 1 | Validate: monthly (optionally daily later), day 1–28, amount ≥ the scheme's SIP minimum (from the FP scheme plan) and ≥ ₹100 as a floor, mandate headroom. |
| 2 | SEBI 2FA OTP (once). |
| 3 | Ensure an ACTIVE mandate (reuse, or create per §7). |
| 4 | `POST /v2/mf_purchase_plans` with `payment_source` = mandate, `installment_day`, `frequency:"monthly"`, `generate_first_installment_now` = investor toggle (default **true**). |
| 5 | Await `review_completed`, then PATCH `{state:"confirmed", consent:{email,isd_code,mobile}}` ([v1] `InvestorActionService.java:521-525`). |
| 6 | If first-instalment-now: `GET /v2/mf_purchases?plan=<id>` → first `old_id` → `POST /api/pg/payments/nach {mandate_id, amc_order_ids:[old_id]}` ([v1] `InvestorActionService.java:528-533`, `561+`). |
| 7 | SIP → `ACTIVE`. The instalment row tracks debit and allotment. |

If toggle is off: FP Case 1 applies (the start day must be at least one day after registration, so the first debit is on the chosen day next time around). UX shows "First instalment on 5 Oct".

**First-instalment ETA copy:** UPI Autopay: "about 1 working day (your UPI app notifies you 24 h before)". eNACH: "1–3 working days after bank approval". The NAV date follows fund realisation.

### 8.2 `sip_registrations.status`

`DRAFT → AWAITING_2FA → AWAITING_MANDATE (→ mandate ACTIVE) → PLAN_REVIEW → ACTIVE`. From `ACTIVE`: `PAUSED ⇄ ACTIVE`, `MANDATE_LOST` (external revoke), `CANCELLED`, `COMPLETED` (instalment count reached), `SETUP_FAILED` / `SETUP_ABANDONED`.

### 8.3 `sip_instalments.status`

| From | Event | To |
|---|---|---|
| — | FP generates the instalment purchase | `SCHEDULED` (due date, amount, `amc_order_id`) |
| `SCHEDULED` | FP payment created against the mandate | `DEBIT_INITIATED` |
| `DEBIT_INITIATED` | payment `SUCCESS` | `PAID` |
| `PAID` | purchase `successful` | `ALLOTTED` |
| `PAID` | purchase `failed` | `FAILED_REFUND_PENDING` |
| `DEBIT_INITIATED` | payment `FAILED` (after network retries) | `DEBIT_FAILED` (reason) |
| `SCHEDULED` | SIP paused on that date | `SKIPPED` |

On `DEBIT_FAILED`:
- Notify: "Your ₹5,000 SIP in X failed: insufficient balance."
- Offer **"Invest this month's amount now"**, which creates a *new lumpsum order* in the same scheme via UPI or netbanking. There is no manual re-debit on the mandate, because NPCI retries are already used up and re-presentation needs a new pre-debit notice.
- After 3 consecutive `DEBIT_FAILED`, warn that the AMC may cancel the SIP (A-7) and suggest pausing.

### 8.4 SIP management and its payment implications

| Action | FP operation | Payment/mandate implication |
|---|---|---|
| Modify amount (up or down) or date | `PATCH /v2/mf_purchase_plans` (FP needs ≥ 2 days before the next instalment, [v1] `OrderService.java:2091-2093`) | Recheck headroom. Above the limit → create a new mandate, then switch `payment_source` (A-5) or cancel-and-recreate the plan. |
| Top-up (step-up) | Plan update (if FP supports step-up fields) else scheduled modify | Headroom checked against the **peak future** amount. |
| Pause | FP plan pause/skip (A-5) | Instalments `SKIPPED`; mandate untouched. |
| Cancel | `POST /v2/mf_purchase_plans/cancel` ([v1] `RealCybrillaClient.java:1525-1550`) | Mandate kept. Prompt "cancel the unused mandate too?" only if it has no other SIPs. |
| Change bank | New verified bank → new mandate → move plan | The old mandate is cancelled once it has no SIPs left. |

### 8.5 Switch, STP, SWP, redemption

These need no payment rail. Money moves between schemes (switch, STP) or out to the **registered bank only** (redemption, SWP), per the pool-account circular. The payments module only shows **payout tracking** (FP redemption `successful` → "credited to HDFC ••4821 by <T+n>"). STP and SWP set-up require 2FA at registration. Redemption needs 2FA every time.

---

## 9. Failure and retry matrix

| Failure | Detected by | Order effect | Investor copy / action | Auto-retry? |
|---|---|---|---|---|
| FP unreachable on create/consent/payment/confirm | HTTP error | Stays in its current state with `retry_at` | "We're having trouble reaching the fund house. Tap to retry." | Server: 3× with 500 ms × n backoff (v1 policy `RealCybrillaClient.java:2459-2480`). Same idempotency key. |
| 401 from FP | HTTP | none | none | Refresh the token, retry once (v1 `:2482-2501`) |
| 429 from FP | HTTP | none | none | Honour `Retry-After`, else 5 s × n |
| No `upi.uri` after 10 s | fetch loop | attempt `AWAITING_INVESTOR` | Spinner "Preparing UPI…". After 30 s: "Use netbanking instead?" | Continue fetching via webhook or poll |
| Investor backs out of UPI app / closes bank page | client return with no FP terminal state | attempt `PROCESSING` | "Waiting for confirmation from your bank…" with **no retry button until FP says failed** | Poller |
| UPI declined, wrong PIN, timeout | FP `failed` | `PAYMENT_RETRYABLE` | "Payment didn't go through. No money was taken, or it'll be returned within 1 working day." [Retry with UPI] [Use netbanking] | Investor-initiated |
| TPV mismatch | FP `failed` + reason | `PAYMENT_RETRYABLE` | "Paid from a different account. Refund in 5–7 working days. Pay from HDFC ••4821." | Investor-initiated |
| Amount above the bank's UPI limit | FP `failed` + reason | `PAYMENT_RETRYABLE` | Suggest netbanking | — |
| Netbanking bank not supported | FP create error | stays `CONSENTED` | Hide netbanking for that bank; suggest UPI | — |
| Payment success, RTA order failed | FP purchase `failed` | `FAILED_REFUND_PENDING` | "Order failed at the fund house (<reason>). ₹X will be refunded to HDFC ••4821 in 5–7 working days." | — |
| Mandate auth failed | FP / postback | mandate `AUTH_PENDING` | "Mandate not approved. Try again or use <other type>." | Investor-initiated |
| Mandate rejected by bank | FP `REJECTED` | mandate `REJECTED`, SIP `SETUP_FAILED` | Show the reason; offer the other type | — |
| Instalment debit failed | FP instalment payment failed | instalment `DEBIT_FAILED` | See §8.3 | No (NPCI/PG already retried) |
| Webhook missed | reconciler | — | — | Poll schedule (§12) |

---

## 10. Refunds

Sanchay cannot initiate PG refunds. Refunds come from the bank, PG, Cybrilla or the AMC. We **track** them, we **set expectations**, and ops **escalate**.

| Scenario | Who refunds | Expected TAT (copy) | `refund_cases.expected_by` | Escalation |
|---|---|---|---|---|
| UPI debited but PG failed (deemed/timeout) | Remitter bank auto-reversal | T+1 working day (RBI TAT) | T+2 | Investor raises it with their bank; we show the UTR if FP gives one |
| TPV mismatch | PG/Cybrilla | 5–7 working days (A-8) | T+7 | Ops → Cybrilla |
| Order failed after payment success | AMC via RTA to the source account | 5–7 working days (A-8) | T+7 | Ops → Cybrilla/RTA |
| Duplicate success on one order (race) | Cybrilla ops | 7 working days | T+10 | Auto ops ticket, P1 |
| UPI Autopay ₹1 verification | PG | 3–5 working days | none (informational) | — |
| Cancelled order after debit (rare) | as above | 5–7 working days | T+7 | Ops |

States: `OPEN → CONFIRMED_BY_PROVIDER` (FP shows a refund/reversal field, A-8) or `INVESTOR_CONFIRMED` (investor taps "I got it") → `CLOSED`. `expected_by` passing without closure → `OVERDUE`, which creates an ops P2 item and makes the investor-facing copy offer "Contact support".

---

## 11. Reconciliation architecture

| Layer | Mechanism | Detail |
|---|---|---|
| L1 Webhooks (primary trigger) | `POST /v1/webhooks/fp` → insert into `webhook_inbox` (unique `(provider, event_id)`, falling back to `sha256(type‖object_id‖object.updated_at)`), ACK 200 within 100 ms. A worker processes each row by **re-fetching the FP object** (payment, purchase, plan, mandate) and running the state machine. | Auth: port v1's constant-time shared-secret header (`CybrillaWebhookController.java:117-142`) plus a source-IP allowlist if Cybrilla publishes one. Persistent dedupe replaces v1's in-memory LRU (`:144-191`). Redact PII before storing (port v1 `PiiRedactor`). |
| L2 Browser postback | `GET/POST /v1/pg/return/{returnRef}` (`returnRef` is a random 128-bit per-attempt ref, never an order id). | Enqueue a reconcile for that attempt, **ignore the `status` query param for state**, and 303 by channel (§12). v1 set RETRY_AVAILABLE straight from the query `status` on an unauthenticated URL (`InvestorActionService.java:626-682`); **do not port that.** |
| L3 Backoff poller | Postgres job queue (`reconcile_jobs`; outbox pattern, `SKIP LOCKED`) for every non-terminal payment attempt, purchase, mandate and plan instalment. | Schedule after creation: 10 s, 20 s, 30 s, 1 m, 2 m, 5 m, 10 m, 30 m, 1 h, then hourly to 48 h, then daily to 7 d, then ops. Mandates in `BANK_APPROVAL_PENDING` are polled every 2 h. |
| L4 Nightly full reconcile (02:00 IST) | Walk every non-terminal local object and every ACTIVE mandate (to catch external revokes) and diff against FP. Walk FP purchases for the day (list endpoints) to find orphans. | Mismatches go to the `reconciliation_exceptions` ops queue. |
| L5 Ops console | Screens for exceptions: stale attempts, overdue refunds, orphans, mandates stuck in approval, duplicate successes. Actions: re-sync now, annotate, mark refund confirmed. **No manual "mark successful" for money states without an FP-state match** (v1's audited bypass `OrderService.java:1143-1171` is kept only as an FP-state-verified force-sync). | Every action is audited. |
| Client status | Clients poll **our** API (`GET /v1/checkout/{ref}`: a cheap DB read), 2 s for 2 min, then 10 s, stopping on terminal. Never hit FP from client-triggered requests beyond what the reconciler already does. | Protects FP rate limits; works on flaky 3G. |

Sandbox-only simulation (`/api/pg/simulate/*`) must live behind `FP_ENV=sandbox` **and** a build flag. The v1 "force SUCCESSFUL when provider errors in sandbox" branches (`InvestorActionService.java:~640-660`) are not ported.

---

## 12. Client implementation

### 12.1 Return URLs and deep links

| Item | Value |
|---|---|
| FP `payment_postback_url` | `https://api.sanchay.in/v1/pg/return/{returnRef}`, minted per attempt/mandate authorization. **No PII and no order id in the URL.** |
| Backend 303 target: web | `https://sanchay.in/checkout/{checkoutId}/status` (Next.js route; server component calls our API) |
| Backend 303 target: native | `sanchay://pg-return?ref={returnRef}` (captured by the auth session) |
| Custom scheme | `scheme: "sanchay"` in the Expo app config |
| iOS Universal Links | `ios.associatedDomains: ["applinks:sanchay.in"]`; AASA served by Next.js at `/.well-known/apple-app-site-association` for paths `/app/*` |
| Android App Links | `android.intentFilters: [{ action:"VIEW", autoVerify:true, data:[{scheme:"https", host:"sanchay.in", pathPrefix:"/app"}], category:["BROWSABLE","DEFAULT"] }]`; `/.well-known/assetlinks.json` with the release and Play-signing SHA-256 |
| Role of App/Universal links | **Cold-start fallback and notification deep links** (`https://sanchay.in/app/orders/{id}`). They are not the primary payment return, because iOS does not open universal links on server redirects. |

### 12.2 Web (Next.js 16)

| Flow | Implementation |
|---|---|
| Netbanking / eNACH / hosted UPI | Same-tab `window.location.assign(tokenUrl)` (no popup, since mobile blockers are unreliable). Before leaving, persist `{checkoutId}` in `sessionStorage`. The return lands on the status page. |
| UPI Intent (mobile web) | Render `<a href={upiUri}>Pay with UPI app</a>` (user gesture). Android Chrome shows the chooser. On iOS, render per-app buttons with app-specific schemes (§12.4 table). |
| UPI QR (desktop) | Render the QR **client-side** from `upi.uri` (no third-party QR service; the URI contains the txn ref). Show the amount, "Pay from HDFC ••4821", a 10-min visual countdown (A-2), then keep polling. |
| UPI Collect (flag) | VPA input with format check; FP `upi.type:"collect", vpa`; "Approve the request in your UPI app within 10 minutes". |
| Status | Poll `/v1/checkout/{id}` (TanStack Query `refetchInterval`), plus `visibilitychange` → immediate refetch. |
| Security | Status pages require an authenticated session; `returnRef` alone reveals nothing. CSP allows navigation to PG domains; no iframe checkout. |

### 12.3 Android native (Expo)

| Concern | Implementation |
|---|---|
| Hosted pages | `WebBrowser.openAuthSessionAsync(tokenUrl, 'sanchay://pg-return', { preferEphemeralSession: true })` uses Chrome Custom Tabs and resolves when the 303 to `sanchay://pg-return` fires. **Result `cancel`/`dismiss` does not mean failure**: always go to the status screen and poll. |
| UPI app list | Custom Expo module `@sanchay/upi-intent` (Expo Modules API, Kotlin): `getUpiApps()` = `queryIntentActivities(Intent(ACTION_VIEW, Uri.parse("upi://pay")))` → `[{packageName,label,icon}]`; `pay(uri, packageName?)` = `startActivityForResult` with `setPackage`. The module's result is a hint only. |
| Package visibility | Config plugin adds `<queries><intent><action android:name="android.intent.action.VIEW"/><data android:scheme="upi"/></intent></queries>` (Android 11+ filtering). |
| Picker UX | Bottom sheet with the top installed apps (PhonePe, GPay, Paytm, BHIM, CRED, Amazon Pay, bank apps) plus "Other UPI app" (system chooser via `Linking.openURL`). Remember the last-used app. |
| UPI Autopay | Same module with the `upi://mandate?...` URI. |
| Process death | Before launching any external surface, write `inflight = {kind, ref, checkoutId, startedAt}` to MMKV. On app start, `AppState` → active, or a `sanchay://pg-return` deep link: route to `/(app)/checkout/[id]/status` and poll. The server also exposes `GET /v1/me/inflight` so a reinstall or second device can resume. |
| Low-end performance | No WebView checkout; Custom Tabs only. Lazy-load the QR lib (desktop only). Status polling pauses in the background. |

### 12.4 iOS native (Expo)

| Concern | Implementation |
|---|---|
| Hosted pages | `openAuthSessionAsync(..., { preferEphemeralSession: true })` uses ASWebAuthenticationSession. The ephemeral session suppresses the "wants to use … to sign in" alert, and bank pages don't need shared cookies. The callback is matched by the `sanchay` scheme ([Expo WebAuthSession.swift]). |
| UPI apps | iOS apps don't reliably claim `upi://`, so rewrite the URI per app and gate on `canOpenURL`. Candidate prefixes: GPay `tez://upi/pay?…`, PhonePe `phonepe://pay?…`, Paytm `paytmmp://pay?…`, BHIM `bhim://upi/pay?…`, CRED `credpay://upi/pay?…` (A-10: verify on devices). |
| Info.plist | `ios.infoPlist.LSApplicationQueriesSchemes: ["tez","phonepe","paytmmp","bhim","credpay"]` ([Razorpay], [Cashfree] docs). |
| No UPI app installed | Show netbanking (default) and "Show QR to scan from another phone". |
| Return from UPI app | No callback. On `AppState` active, go to the status screen and poll. |

### 12.5 Backend API surface (NestJS)

| Endpoint | Purpose |
|---|---|
| `POST /v1/checkout` `{schemeId, amount, bankAccountId}` + `Idempotency-Key` | Creates DRAFT and the FP purchase; returns `checkoutId` and payment options (server-computed per amount, bank capabilities and channel) |
| `POST /v1/checkout/{id}/otp` / `.../otp/verify` | SEBI 2FA |
| `POST /v1/checkout/{id}/pay` `{method: UPI_INTENT\|UPI_QR\|UPI_COLLECT\|NETBANKING, vpa?, channel}` | Consent → payment → confirm; returns `{kind:"upi_uri", uri}` or `{kind:"redirect", url}` or `{kind:"pending"}` |
| `GET /v1/checkout/{id}` | Status for polling |
| `POST /v1/checkout/{id}/retry` | Allowed only in `PAYMENT_RETRYABLE` |
| `POST /v1/sips` / `POST /v1/sips/{id}/activate` | SIP draft and activation (mandate reuse or creation) |
| `POST /v1/mandates` / `POST /v1/mandates/{id}/authorize` / `DELETE /v1/mandates/{id}` (OTP) | Mandate lifecycle |
| `GET /v1/me/inflight` | Resume after process death |
| `GET/POST /v1/pg/return/{ref}` | Postback, enqueue reconcile, 303 by channel |
| `POST /v1/webhooks/fp` | Webhook inbox |

---

## 13. Investor-facing UX rules

| # | Rule |
|---|---|
| U1 | Payment methods are computed by the server per amount, channel and bank capability. The client never decides eligibility. |
| U2 | Once a method is chosen and an attempt exists, other methods are hidden until that attempt fails (FP one-method rule). A "Change method" link is shown only after FP reports failure. |
| U3 | Always show the paying bank and last-4, and say "pay only from this account". |
| U4 | Never show "failed" on a client timeout. Show "Confirming with your bank. This can take a few minutes. You'll get a notification." |
| U5 | Success screen only on FP payment `SUCCESS`. The copy is "Payment received. Units will be allotted at the NAV of the day the fund house receives your money", with the NAV date filled in once allotted. |
| U6 | Cut-off hint on the review screen after 1:30 pm IST: "Orders after ~2 pm usually get the next working day's NAV." Don't promise exact times (A-11). |
| U7 | Amount above ₹1L: "Some banks limit UPI to ₹1 lakh/day. Netbanking is recommended." Above ₹5L: UPI hidden. |
| U8 | SIP: always show the first-debit date, the mandate type and the monthly debit window ("debited on or after the 5th"). |
| U9 | Mandate authorization is framed as a one-time setup with the cap in large text; never call it "payment". |
| U10 | Every money event (attempt created, success, fail, refund expected, instalment debited or failed, mandate approved, rejected or revoked) sends push, in-app and email (SMS only for failures), deep-linked via `https://sanchay.in/app/...`. |
| U11 | No convenience fees, no surcharges, no "pay later". |
| U12 | Accessibility and low-end: status screens are text-first with no Lottie animation; one API poll at a time; everything works offline-tolerant (retry banner). |
| U13 | Copy never names the PG (BillDesk). It says "Cybrilla" wherever the investor will see that name in their bank or UPI app. |

---

## 14. Edge cases (test these)

| # | Case | Expected handling |
|---|---|---|
| E1 | Investor double-taps Pay | Idempotency-Key plus the partial unique open-attempt index: the second call returns the same attempt. |
| E2 | Scans the QR on desktop *and* opens Collect in another tab | The second attempt is refused while the first is open. |
| E3 | Two successes on one order (PG race) | Second success → `DUPLICATE_PAYMENT` exception, refund case P1, investor informed. |
| E4 | Postback says success, FP says pending | Trust FP. Stay `PROCESSING`; the poller settles it. |
| E5 | Postback forged or replayed | Only enqueues a re-fetch; no state change without FP. |
| E6 | Webhook before the local attempt row commits | Inbox worker retries up to 5× (1 s, 5 s, 30 s, …); the orphan goes to the exception queue. |
| E7 | Webhook delivered twice or out of order | Unique inbox key. The state machine only moves forward (monotonic rank per state). |
| E8 | App killed by the OS while in the UPI app (low-end Android) | MMKV inflight record plus `/me/inflight` → status screen on relaunch. |
| E9 | Investor switches devices mid-payment | `/me/inflight` shows the pending checkout on the new device. |
| E10 | UPI app returns "SUCCESS" but FP says failed | FP wins. Copy covers the bank auto-reversal. |
| E11 | UPI app returns "FAILURE" but money was debited and FP shows success later | FP wins, and a success notification is sent. |
| E12 | Payment stays pending for more than 2 h | `STALE`: ops queue, investor copy unchanged, poller continues for 7 days. |
| E13 | Investor pays after the FP order expired or cancelled | FP should reject. If money was taken → refund case. |
| E14 | Pays at 2:58 pm, funds realised at 3:05 pm | Next-day NAV. Status shows the actual NAV date from FP. |
| E15 | Scheme suspends subscriptions between order and payment | FP review or allotment fails → REJECTED or refund path. |
| E16 | Bank account de-verified (penny drop reversed) after order creation | Payment create blocked with "re-verify bank". |
| E17 | Pays from a different account | TPV failure → refund (§9). |
| E18 | Amount above the bank's UPI daily limit | Failure reason `LIMIT_EXCEEDED` → suggest netbanking. |
| E19 | Netbanking session timeout at the bank | FP failed → retryable. |
| E20 | Investor closes the Custom Tab before the bank redirects | `dismiss` → status screen → poll. |
| E21 | iOS: no supported UPI app installed | Only netbanking and QR shown. |
| E22 | iOS: app-specific scheme opens but that app lacks the investor's bank | Investor returns; FP eventually fails; offer another app. |
| E23 | UPI Autopay auth: ₹1 debited, mandate `REJECTED` | Refund info; offer eNACH. |
| E24 | eNACH approved after the investor cancelled the SIP draft | Mandate ACTIVE and unlinked; it appears in Mandates with a cancel option. |
| E25 | Mandate revoked in the UPI app or UPI Help | `REVOKED_EXTERNALLY` → SIPs flagged, investor alerted before the next due date. |
| E26 | New SIP pushes same-day debits past the mandate limit | Blocked with "new mandate" CTA. |
| E27 | SIP instalment day on a bank holiday | UPI: same day. eNACH: next working day. Status shows the actual debit date. |
| E28 | Instalment debit fails for insufficient funds | `DEBIT_FAILED` → "Invest now" lumpsum CTA. After 3 consecutive failures, warn. |
| E29 | Modify SIP less than 2 days before the next instalment | Blocked client-side with the date when it becomes editable. |
| E30 | SIP modified while an instalment debit is in flight | That debit keeps the old amount; the change applies from the next one. |
| E31 | Pause chosen after the pre-debit notification was sent | That debit may still execute; say so explicitly. |
| E32 | SIP start date is 29/30/31 | Not allowed (1–28). |
| E33 | Quarterly SIP requested | Not offered (gateway unsupported). |
| E34 | Mandate `valid_till` passes | `EXPIRED` → SIPs `MANDATE_LOST`. Notify 30 days ahead. |
| E35 | FP down during the evening peak | Checkout shows "temporarily unavailable". Already-open attempts keep polling. |
| E36 | FP returns 5xx after the payment was created but before confirm | Idempotent re-drive: fetch the purchase. If still `pending`, confirm; if `submitted`, proceed. Never create a second payment while one is open. |
| E37 | Consent PATCH OK, then payment create fails permanently | Order `CONSENTED`; the investor can retry payment within the OTP validity (60 min, v1 `TransactionApprovalService.java:87`), else re-OTP. |
| E38 | OTP verified but the amount changed (tampering) | Snapshot hash mismatch → reject (port the v1 gate). |
| E39 | Investor on a VPN or outside India | Allowed; UPI still works for Indian accounts. NRI flows are out of scope at launch. |
| E40 | Sandbox amount-ending rules leak into prod tests | Test data factories are sandbox-only; prod smoke tests use real ₹100 orders with ops sign-off. |
| E41 | Refund not received by `expected_by` | `OVERDUE` → ops P2, investor gets "contact support" with the order and UTR reference. |
| E42 | Same bank has both UPI Autopay and eNACH mandates | Allowed. The SIP chooses one explicitly and the UI shows it per SIP. |
| E43 | Investor deletes their account while a SIP or mandate is active | Blocked until SIPs and mandates are cancelled (OTP). |
| E44 | Push notification tapped for a completed order on a fresh install | App Link → login → order page. |
| E45 | Clock skew on the client countdown | Countdowns use server `expires_at`, not local time. |

---

## 15. Data model sketch (Drizzle / PostgreSQL 18, amounts in paise `bigint`, ids `uuidv7()`)

| Table | Key columns | Key constraints |
|---|---|---|
| `purchase_orders` | id, investor_id, scheme_plan_id, amount_paise, bank_account_id, status, fp_purchase_id, fp_amc_order_id, idempotency_key, snapshot_sha256, nav_date, units, folio, created_at, … | unique(idempotency_key); CHECK status enum |
| `payment_attempts` | id, order_id / sip_instalment_id, method, channel, fp_payment_id int, fp_status, status, upi_uri, token_url, return_ref (unique, 128-bit), expires_at, failure_code, failure_reason, utr, created_at, terminal_at | **partial unique** open-attempt-per-order; unique(fp_payment_id) |
| `mandates` | id, investor_id, bank_account_id, type (UPI_AUTOPAY/ENACH), fp_mandate_id int, limit_paise, status, auth_channel, return_ref, valid_from, valid_till, approved_at, cancelled_at, cancel_source (INVESTOR/EXTERNAL/OPS), failure_reason | unique(fp_mandate_id) |
| `sip_registrations` | id, investor_id, scheme_plan_id, amount_paise, frequency, installment_day, mandate_id, fp_plan_id, first_now bool, status, next_due_date, consecutive_failures | FK mandate |
| `sip_instalments` | id, sip_id, fp_purchase_id, amc_order_id, due_date, debit_date, amount_paise, status, failure_reason, units, nav_date | unique(fp_purchase_id) |
| `refund_cases` | id, order_ref, payment_attempt_id, reason, amount_paise, expected_by, status, provider_ref, ops_notes | |
| `webhook_inbox` | id, provider, event_key (unique), event_type, object_type, object_id, payload_redacted jsonb, received_at, processed_at, attempts, last_error | unique(provider, event_key) |
| `reconcile_jobs` | id, object_type, object_id, next_run_at, attempt, locked_by, locked_until | index(next_run_at) with `FOR UPDATE SKIP LOCKED` |
| `reconciliation_exceptions` | id, kind, object_ref, detail, severity, status, assignee | |
| `bank_capabilities` | bank_code (IFSC 4-char), netbanking_tpv, upi_autopay, enach_netbanking, enach_debit_card, enach_aadhaar, updated_by, updated_at | PK bank_code |
| `provider_calls` | redacted request/response audit (port v1 `ExternalApiSnapshotService`) | partitioned monthly |

---

## 16. v1 lessons: port versus don't port

| v1 item | Verdict | Evidence |
|---|---|---|
| Consent → payment → confirm ordering; payment retry = new payment without re-confirm | **Port** | `InvestorActionService.java:685-745` |
| `upi.type` lowercase normalization | **Port** | `RealCybrillaClient.java:1269-1285` |
| Payment-honesty rule (failed payment ≠ failed order) | **Port** | `InvestorActionService.java:674-682` |
| 2FA snapshot gate consumed once, before the provider write | **Port** (TS rewrite) | `TransactionApprovalService.java:474-518` |
| SIP 2FA consumed once at mandate creation | **Port** (moves to SIP registration) | `InvestorActionService.java:388-397, 501-507` |
| Webhook re-fetch-not-trust pattern | **Port** | `OrderService.java:288-376` |
| `mandateLimitFor` = max(₹1L, 2×SIP) | **Don't port**: breaks the UPI ₹1L cap | `InvestorActionService.java:1014-1019` |
| Mandate stored per order (`external_mandate_id` on `transaction_orders`) | **Replace** with a first-class `mandates` table and reuse | V39 migration; `InvestorActionService.java:388-405` |
| `awaitApprovedMandate` throws when not yet APPROVED | **Replace** with an async `BANK_APPROVAL_PENDING` state | `InvestorActionService.java:447-457` |
| Postback query `status` drives state on an unauthenticated URL | **Don't port** | `InvestorActionService.java:626-682` |
| Sandbox forced-SUCCESS on provider error | **Don't port** | `InvestorActionService.java:~636-660` |
| In-memory webhook dedupe (10 min, 2048 entries) | **Replace** with persistent inbox | `CybrillaWebhookController.java:144-191` |
| QUARTERLY SIP | **Drop** (unsupported by the gateway) | `OrderService.java:2199-2205` |
| "Contact your distributor" failure copy | **Rewrite** | `InvestorActionService.java:431-438` |
| Sandbox mandate simulation stepping SUBMITTED→RECEIVED→APPROVED | **Port** for sandbox tests only | `InvestorActionService.java:469-500` |
| Backend-rendered investor-action HTML page | **Replace** with Next.js/Expo status screens plus the 303 return endpoint | `InvestorActionController.java:83-118` |

---

## 17. Sprint slicing (2-week sprints; payments work stream)

| Sprint | Deliverable |
|---|---|
| P1 | FP PG client (TS) with typed payments and mandates, plus a mock client (port the v1 mock pattern). `webhook_inbox` and `reconcile_jobs`. Return endpoint. Sandbox spikes S-1 to S-6. |
| P2 | Lumpsum checkout end-to-end on web (netbanking + UPI QR + mobile-web intent). Status page. Retry. Ops exceptions v0. |
| P3 | Expo `@sanchay/upi-intent` module (Android + iOS), auth-session flows, inflight resume, App Links / Universal Links. |
| P4 | Mandates (UPI Autopay + eNACH), SIP registration + first instalment, Mandates screen. |
| P5 | SIP instalment tracking, failure CTAs, modify/pause/cancel, external-revoke handling, nightly reconcile, refund cases, ops console v1. |
| P6 | Hardening: chaos tests (webhook loss, FP 5xx, process death), device matrix (5 low-end Android devices + 2 iPhones × 5 UPI apps), prod ₹100 smoke runs. |

---

## 18. Assumptions (each with a default decision)

| ID | Assumption | Default we build to |
|---|---|---|
| A-1 | The Cybrilla POA PG is BillDesk (sample URIs `billdesk@hdfcbank`, `billuat@icici`), so the UPI Autopay ₹1L limit is **per day**. | Per-day headroom check (§3.2). |
| A-2 | UPI Intent/QR/Collect requests expire after about 10 minutes at the PG; netbanking sessions after about 15 minutes. | 10-min QR countdown; the poller continues regardless. |
| A-3 | Cybrilla can give a bank list for netbanking TPV and e-mandate modes. | Seed `bank_capabilities`, default all-true, learn from failures. |
| A-4 | eNACH approval is T+0 to T+1 per FP, occasionally up to 5 working days. | Ops alert at 5 working days. |
| A-5 | The FP plan PATCH supports amount, date and `payment_source` changes plus pause/skip on cybrillapoa. | If `payment_source` change is unsupported, fall back to cancel-and-recreate the plan (same scheme, new mandate). |
| A-6 | An FP `submitted` purchase with no successful payment can be cancelled via `/cancel`, or FP expires it. | Local `EXPIRED` at end of T+1, plus an FP cancel attempt. |
| A-7 | AMCs commonly cancel a SIP after 3 consecutive failed instalments. | Warn after 3 failures and mirror FP plan state. |
| A-8 | Refund TAT for TPV or RTA failure is 5–7 working days; FP may not expose refund status. | `expected_by` = T+7 with manual/investor confirmation. |
| A-9 | Cybrilla absorbs or bills the reported 2026-10-15 UPI MDR commercially; nothing is charged to investors. | No investor fee; confirm with Cybrilla commercially. |
| A-10 | The iOS app-specific UPI URL formats in §12.4 are current. | Remote-config the rewrite map (no app release needed to fix). |
| A-11 | Cybrilla POA settlement gives same-day realisation for UPI or netbanking paid well before cut-off. | Use soft cut-off copy (U6), not guarantees. |

## 19. Sandbox verification spikes (sprint P1, each 0.5–1 day)

| Spike | Test | Pass condition, and fallback if it fails |
|---|---|---|
| S-1 | Lumpsum with `upi.type:"uri"`: time from create to `upi.uri` present; does `payment.updated` arrive? | URI within 10 s, else keep the poll-until-URI loop. |
| S-2 | Mandate authorize with `upi.type:"uri"` returns `upi://mandate`. | If only `token_url` comes back, use the hosted page for UPI Autopay on all channels. |
| S-3 | An abandoned UPI payment: how long until FP marks it `failed`? | Sets the `STALE` threshold (default 2 h). |
| S-4 | Payment retry on a `submitted` order after a simulated failure. | New payment ID with the same `amc_order_ids`, as documented. |
| S-5 | Plan with `generate_first_installment_now=true` + NACH payment; then a second SIP on the same mandate. | Two plans debit independently. |
| S-6 | Webhook payload shapes (event ids present?) for `payment.*`, `mandate.*`, `mf_purchase.*`, `mf_purchase_plan.*`. | Sets the inbox `event_key` derivation. |
| S-7 | Plan PATCH `payment_source` swap, pause/skip. | Confirms or overturns A-5. |
| S-8 | Cancel on a `submitted` unpaid purchase. | Confirms or overturns A-6. |
| S-9 | Failure-reason strings for TPV, limit and user-decline cases. | Builds the `failure_code` classifier. |
| S-10 | Device matrix for iOS schemes and the Android explicit-package launch. | Fills the A-10 rewrite map. |

---

## 20. Sources (all read 2026-09-25)

**FP docs**
- [Custom checkout](https://docs.fintechprimitives.com/fp-cybrillapoa-gateway/custom-checkout)
- [Capabilities](https://docs.fintechprimitives.com/fp-cybrillapoa-gateway/capabilities)
- [Overview](https://docs.fintechprimitives.com/fp-cybrillapoa-gateway/overview/)
- [Payment retry](https://docs.fintechprimitives.com/fp-cybrillapoa-gateway/payment-retry)
- [Mandate payment use cases](https://docs.fintechprimitives.com/fp-cybrillapoa-gateway/mandate-payments-usecases)
- [Monthly SIP](https://docs.fintechprimitives.com/fp-cybrillapoa-gateway/usecase-monthly-sips)
- [Sandbox simulation](https://docs.fintechprimitives.com/fp-cybrillapoa-gateway/sandbox-simulation)
- [Managing eNACH/UPI Autopay](https://docs.fintechprimitives.com/payments/managing-eNACH/)
- [Payment via eNACH](https://docs.fintechprimitives.com/payments/payment-via-eNACH/)
- [Payments FAQs](https://docs.fintechprimitives.com/payments/FAQs)
- [Payments overview](https://docs.fintechprimitives.com/payments/overview)
- [NAV applicability](https://docs.fintechprimitives.com/general-topics/NAV-Applicability/)
- `collecting-payment-on-your-own` returned HTTP 403.

**Regulatory and web**
- [Web-1] [SEBI pool accounts (taxguru)](https://taxguru.in/sebi/circular-mutual-funds.html); [Business Standard on the July 2022 extension](https://www.business-standard.com/amp/article/markets/sebi-extends-timeline-for-pooling-of-accounts-to-july-1-says-amfi-122040200835_1.html)
- [Web-2] [Setu TPV](https://docs.setu.co/payments/upi-deeplinks/third-party-verification); [Cashfree TPV](https://www.cashfree.com/docs/payments/features/tpv); [PayU UPI TPV](https://docs.payu.in/docs/upi-integration-for-tpv)
- [Web-3] [SEBI 2FA circular 2022-09-30](https://www.sebi.gov.in/legal/circulars/sep-2022/two-factor-authentication-for-transactions-in-units-of-mutual-funds_63557.html)
- [Web-4] [AMFI cut-off and NAV rule](https://www.amfiindia.com/investor/knowledge-center-info?zoneName=CutOffTimingsAndNewRuleOnApplicableNAV); [HDFC MF uniform NAV](https://www.hdfcfund.com/investor-services/uniform-nav-applicability)
- [Web-5] [Outlook Money on UPI limits](https://www.outlookmoney.com/banking/upi-daily-transaction-limits-raised-to-rs-5-lakh-for-select-categories); [Business Standard](https://www.business-standard.com/finance/personal-finance/upi-to-allow-insurance-capital-markets-transactions-of-up-to-rs-10-lakh-125091000470_1.html)
- [Web-6] [Medianama on P2P collect](https://www.medianama.com/2025/08/223-npci-p2p-collect-payments-oct-1-what-it-means/); [BW Businessworld](https://www.businessworld.in/article/npci-to-end-upi-collect-request-for-p2p-payments-in-oct-567598)
- [Web-7] [BusinessToday, RBI ₹1L AFA-free](https://www.businesstoday.in/personal-finance/news/story/rbi-says-no-otp-authentication-needed-for-upi-auto-payments-for-mutual-fund-insurance-credit-card-payments-up-to-rs-1-lakh-408723-2023-12-08); [BusinessToday 2026-05-02 e-mandate explainer](https://www.businesstoday.in/amp/personal-finance/news/story/rbi-auto-debit-rules-explained-what-new-changes-mean-for-your-upi-and-card-payments-528507-2026-05-02)
- [Web-8] [KPMG on RBI Authentication Directions 2025](https://kpmg.com/in/en/insights/2025/12/reserve-bank-of-india-rbi-authentication-mechanisms-for-digital-payment-transactions-directions-2025.html)
- [Web-9] [SCC Online, UPI changes from 2025-08-01](https://www.scconline.com/blog/post/2025/07/30/upi-changes-starting-august-1-ncpi-guidelines-upi-api-usage-2025/)
- [Web-10] [Republic World, May 2026 Autopay windows](https://www.republicworld.com/business/upi-autopay-failure-morning-peak-hours-npci-new-rules-2026)
- [Web-11] [MSN, mandate management from 2025-12-31](https://www.msn.com/en-in/money/news/upi-gets-new-rule-users-can-now-view-and-manage-all-autopay-mandates-on-any-app-effective-from-december-31-2025/ar-AA1O9jRH)
- [Web-12] [RBI TAT harmonisation](https://www.rbi.org.in/commonman/English/scripts/Notification.aspx?Id=3074)
- [Web-13] [BusinessToday 2026-09-15 on UPI MDR](https://www.businesstoday.in/personal-finance/investment/story/upi-mdr-from-october-15-what-happens-to-auto-debit-payments-for-mutual-funds-insurance-and-ott-subscriptions-555732-2026-09-15)

**Mobile implementation references**
- [Razorpay iOS UPI intent](https://d6xcmfyh68wv8.cloudfront.net/docs/payments/payment-methods/upi-intent/ios/)
- [Cashfree iOS UPI intent](https://www.cashfree.com/docs/payments/online/web/custom-checkout-ios)
- [Android package visibility](https://developer.android.com/training/package-visibility)
- Expo `expo-web-browser` source via Context7 (`packages/expo-web-browser/ios/WebAuthSession.swift`, README)

**v1 code** (read-only), under `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/`:
- `integration/RealCybrillaClient.java` (lines 72-79, 1188-1302, 1326-1416, 1525-1569, 2459-2501)
- `service/InvestorActionService.java` (lines 46, 60, 74-76, 383-559, 616-803, 1014-1072)
- `service/OrderService.java` (lines 288-376, 610-643, 820-943, 1143-1171, 2091-2093, 2193-2212)
- `controller/CybrillaWebhookController.java` (lines 107-142, 144-191, 249-269)
- `controller/InvestorActionController.java` (lines 83-118)
- `service/TransactionApprovalService.java` (lines 87, 474-518)

v1 FP doc index: `.codex/skills/cybrilla-boss/references/docs-index.md`, `pending-work.md` (under `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/`).
