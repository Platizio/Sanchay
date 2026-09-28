<!-- source: workflow wf_3190e72a-04a labels critic + fill:GAP-* | exported 2026-09-28 -->

# Cross-spec gap rulings (GAP-01..GAP-12)

These rulings override the product specs where they conflict. The MVP spec's harmonized rulings (H-1..H-18) override these.

## GAP-01

**Question.** When is the first Cybrilla FP write allowed to happen relative to the SEBI 2FA OTP, and what is the one binding sequence for every order type? The specs disagree directly. PAYMENTS §5 says to create the FP purchase (POST /v2/mf_purchases, status under_review) at 'Review order', before the OTP, and to cancel it later with a sweeper. JOURNEYS §1.5/CNF-01 says no FP call at the draft step. THREAT-MODEL TX-01 says no FP write of any kind before CONSENTED. TESTING R-02 asserts that the FakeFp call log has no createMfPurchase until the approval is consumed. Plan should also settle these connected conflicts: (a) OTP/challenge validity: 10 min in JOURNEYS CNF-01 and THREAT TX-05, 60 min in PAYMENTS E37, 5 min OTP TTL in THREAT §3.1. (b) ORD-02 'Cancel order without OTP while not submitted' when an FP object may already exist. (c) Whether ONB-16's FP chain (investor_profiles, then mf_investment_accounts) also counts as a gated 'write'. Recommendation to validate: keep consent-first (the draft is local only). Hide FP review latency with a pre-validation call (scheme thresholds and orderability, from local plan_txn_rules) instead of creating a real purchase. Use one validity value everywhere: challenge 10 min, OTP 5 min, resend allowed inside the challenge.

**Ruling.**

**GAP-01 decision: consent first, with no exceptions**

**Direct answer.** No FP call that creates or changes an order, plan, mandate, payment or account can run until the investor's CNF-01 challenge has been CONSUMED. That means the OTP is verified and the recomputed snapshot hash matches, inside a single database transaction. The draft is local only. PAYMENTS §5 rule 1 and §6.1 (`DRAFT → FP create → PROVIDER_REVIEW`) are overruled. JOURNEYS §1.5, THREAT TX-01 and TESTING R-02 stand as written, and R-02 is widened below.

**Why PAYMENTS §5 loses**
1. It fails R-02 and TX-01 for every lumpsum. That is the v1 L15 defect again: v1 created the FP order before any challenge existed (`OrderService.java:529` createOrder, `:601-608` challenge created afterwards).
2. The sweeper may not work. The prior FP research (research:fp-api, citing the FP API reference) lists `POST /v2/mf_purchases/:id/cancel` as **"RTA only"**, and this gateway is cybrillapoa/ONDC. An unconfirmed `pending` purchase only auto-expires T+7 working days after cut-off. Abandoned drafts would sit at FP under our ARN for about 8 working days.
3. The latency it saves is small. FP's custom-checkout page (fetched 2026-09-25) says every order enters `under_review` and is reviewed "asynchronously". The page gives no duration and offers no skip or pre-check endpoint. v1 polls 24 × 1 s (research:rules-fp-contracts). So the cost is at most about 25 s, once, behind a loader.
4. FP's own pre-check is data, not an endpoint. The one-time-purchase docs say to check scheme `active`, `purchase_allowed`, min/max and multiples. We already sync these daily into `plan_txn_rules` (fund-data spec, job J4 at 06:00).

**One binding sequence for every order type**

| Step | What happens | FP calls allowed |
|---|---|---|
| 0. Pre-validate (at "Review") | Readiness, `plan_txn_rules` (min/max/multiples, `*_allowed` flags, SIP dates), cut-off, the investor's own bank (TPV), redemption ceiling and ELSS lock (R-03), mandate headroom. If `fp_synced_at` is more than 26 h old, do a live `GET /api/oms/fund_schemes/:isin`. If any check fails, no challenge is created. | Reads only |
| 1. `POST /v1/orders` (or `/plans/*`, `/mandates`, `/onboarding/submit`) | Local intent `CONSENT_PENDING` plus a challenge. OTP goes to SMS and email. | **None** |
| 2. `POST /v1/challenges/{id}/confirm` | OTP check, JCS hash recomputed from the DB, then APPROVED→CONSUMED atomically. Intent becomes `CONSENTED` and an outbox job is enqueued. | None yet |
| 3. Outbox job (idempotency key / `source_ref_id` = intent id) | The chains below | Writes allowed |
| 4. Handoff | CNF-02 polls every 2 s ("Getting your payment ready") until `next` = PAYMENT, MANDATE or DONE | — |

FP write chains after consume:
- **Lumpsum:** `POST /v2/mf_purchases` → wait for `pending` → PATCH consent → create payment → PATCH `confirmed`.
- **SIP, existing mandate:** `POST /v2/mf_purchase_plans` (consent in the body) → `review_completed` → confirm → optional first-instalment NACH payment.
- **SIP, new mandate:** `POST /api/pg/mandates` → authorize → `APPROVED` → plan create, all under the same consumed consent.
- **Redemption / switch:** POST → `pending` → PATCH `{state: confirmed, consent}`.
- **STP / SWP:** plan POST with consent → confirm.
- **Plan pause / modify / top-up / cancel, and mandate cancel:** the single FP write for that action.

If FP review fails after consume, the challenge becomes `CONSUMED_UNUSED`, the order is `REJECTED` with FP's reason, and a new attempt needs a new OTP. Step 0 is there to make this rare.

**(a) Timer values**

| Timer | Value | Settles |
|---|---|---|
| OTP code life | **5 min** | THREAT §3.1, JOURNEYS line 113 (OtpField), v1 |
| Challenge life (create → approve) | **10 min**, the `expiresAt` in CNF-01 | JOURNEYS CNF-01 |
| Resend | Allowed inside the challenge. Each resend is a new code expiring at min(sent + 5 min, challenge expiry). At most 3 sends per challenge, 30 s cooldown. | THREAT send quotas (3 per 15 min) |
| Approve → first FP write (`execute_before`) | **10 min**. If missed: `CONSENT_EXPIRED`, nothing written. | TX-05. Replaces the 15 min in the architecture design (revise-design) and v1's 60 min (`TransactionApprovalService.java:87`). |
| Saga window: retries on the same consumed consent | **60 min**, or **7 days** for a SIP that needs a new mandate | PAYMENTS E37's "OTP validity (60 min)" is renamed to this saga window. It is **not** consent validity. |
| Payment retry after FP `submitted` | Until T+1 business day 23:59 IST, no new OTP (no new FP order is created) | PAYMENTS §6.1 `PAYMENT_RETRYABLE` |

**(b) ORD-02 "Cancel order"**

The server's `cancellable` flag depends on whether an FP object exists:

| State | Cancel | OTP | Copy |
|---|---|---|---|
| `CONSENT_PENDING`, or `CONSENTED` before any FP attempt | Local only | No | "Nothing was sent" |
| FP object exists but is not yet confirmed (`SUBMITTING`, `UNDER_REVIEW`, `CONFIRMING`) | Hidden: "Processing". The saga either completes or expires. | — | — |
| Purchase `AWAITING_PAYMENT` or `PAYMENT_RETRYABLE` | Local → `CANCELLED`. FP cancel is tried but may fail; FP expiry is the fallback. A late payment goes to the reconciler → refund. | No (no money can move without bank-side authentication) | "We'll withdraw this with the fund house" |
| Redemption or switch after submission | Not cancellable | — | — |
| SIP / STP / SWP plans | Through CNF-01 (existing SIP management screens) | Yes | — |

**(c) ONB-16 counts as a gated write**

FP calls fall into three classes:
- **K (the KYC process):** `/poa/pre_verifications` (PAN, bank penny drop), KYC forms, DigiLocker, eSign. Gate: session plus the recorded KYC consent. These have to run before the attestation.
- **P (account provisioning):** `investor_profiles`, then addresses, phones and emails, `related_parties`, `bank_accounts` and `mf_investment_accounts`, plus later profile, nominee and bank changes. Gate: the ONBOARDING_ATTEST challenge consumed at ONB-16 (this already matches JOURNEYS line 761 and the design's §G.4), or a profile-screen challenge after onboarding.
- **M (money):** everything in the chains above. Gate: a consumed transaction challenge.

Enforce the gates in types. Split the FP client into `FpRead`, `FpKyc`, `FpProvision(consumed: ConsumedConsent)` and `FpTransact(consumed: ConsumedConsent)`. A `ConsumedConsent` value can only be created by `consents.consume()`.

**R-02, widened:** for every journey (lumpsum, SIP with UPI Autopay and with eNACH, mandate, redemption, switch, STP, SWP, SIP management, onboarding), `fake.calls` must contain zero class P or M writes before the subject's challenge is CONSUMED. Add two tests:
- FP review fails after consume → `CONSUMED_UNUSED`, and a new attempt needs a new challenge.
- `execute_before` is missed → `CONSENT_EXPIRED` with zero FP writes.

**Spec edits for sprint 0**
- **PAYMENTS:** rewrite the §5 diagram and rule 1; in §6.1 change the DRAFT row to `CONSENT_PENDING → CONSENTED → SUBMITTING → PROVIDER_REVIEW`; scope the 30-min sweeper to post-consume abandonment only; reword E37.
- **JOURNEYS:** confirm returns `next: PROCESSING` when FP review isn't finished; replace ORD-02's single cancel rule with the table above; add `execute_before` and the saga window to §5.3.
- **THREAT:** add "challenge 10 min" to §3.1.
- **TESTING:** replace the R-02 row with the widened version.

**Assumptions**
- The "RTA only" cancel note (from the prior FP research, not re-fetched) must be confirmed with Cybrilla. The decision holds either way.
- FP review usually finishes in under 25 s (from v1's polling limit). If it is longer, CNF-02's polling covers it.

**Sources**
- https://docs.fintechprimitives.com/fp-cybrillapoa-gateway/custom-checkout and https://docs.fintechprimitives.com/mf-transactions/onetime-purchases (both fetched 2026-09-25)
- The spec workflow journal `C:/Users/pc/.claude/projects/C--Users-pc-Desktop-sanchay/2f00d411-382c-43a6-bd67-ecaf60c67db1/subagents/workflows/wf_3190e72a-04a/journal.jsonl`, entries `spec:payments`, `spec:journeys`, `spec:threat-model`, `spec:testing`
- The design workflow journal `C:/Users/pc/.claude/projects/C--Users-pc-Desktop-sanchay/2f00d411-382c-43a6-bd67-ecaf60c67db1/subagents/workflows/wf_1d1c9b02-593/journal.jsonl`, entries `research:fp-api`, `revise-design`

### Critical Files for Implementation
- `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/service/TransactionApprovalService.java` (gate to port, lines 474-518; 60-min constant at line 87 to replace)
- `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/service/OrderService.java` (anti-pattern at lines 529 and 601-608)
- `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/integration/RealCybrillaClient.java` (cancel at lines 1562-1569)
- `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/integration/MockCybrillaClient.java` (base for FakeFpClient and its call log)
- `C:/Users/pc/.claude/projects/C--Users-pc-Desktop-sanchay/2f00d411-382c-43a6-bd67-ecaf60c67db1/subagents/workflows/wf_3190e72a-04a/journal.jsonl` (the PAYMENTS, JOURNEYS, THREAT and TESTING specs to amend)

## GAP-02

**Question.** For the Cybrilla FP POA gateway in production, what exactly is supported for an ARN tenant, confirmed in writing? The specs assume different answers to each of these: (1) SEBI 2FA ownership. STORES A4 says FP/AMC/RTA send the subscription and redemption 2FA OTP. JOURNEYS/THREAT/PAYMENTS say Sanchay sends the OTP and passes consent{email,isd_code,mobile} to FP. Is Sanchay's own OTP accepted as the regulatory 2FA, or does FP or the RTA send its own? (2) Partner tagging: platform ARN, EUIN left blank, execution-only flag, and whether FP stores or forwards the declaration (JOURNEYS §6 gate, ADMIN §5.16). (3) Webhook authentication. THREAT WH-01 and TESTING WH-02 assume an FP-Signature HMAC over the raw body with a key id. ADMIN §5.8 and PAYMENTS §11 say FP 'today uses a shared header secret only'. Which one applies to the cybrillapoa tenant? (4) Post-onboarding folio maintenance APIs: nominee update (PRF-07), change of payout bank (PRF-06 '10-day cooling'), mobile/email update on folios (PRF-04), and KYC modification through the KRA (PRF-08). (5) Plan operations on cybrillapoa: pause/skip, payment_source swap, step-up fields, STP/SWP pause, switch-in thresholds. (6) mf_investments_snapshot availability after the AMFI directive of 2025-09-19. (7) Refund status fields.

**Ruling.**

**GAP-02: Cybrilla FP POA gateway (ARN tenant), confirmed vs. unconfirmed, with the question list for Cybrilla**

**Direct answer:** Nothing in GAP-02 is confirmed in writing for the `cybrillapoa` production tenant. The public FP docs (fetched 2026-09-25) settle only part of it:

- Partner tagging uses ARN plus a EUIN from the partner's list.
- 2FA: the docs tell the integrator to send the OTP to the folio-registered contact and pass `consent{email,isd_code,mobile}`. That supports JOURNEYS/THREAT/PAYMENTS, not STORES A4.
- Webhooks: an HMAC-SHA256 `FP-Signature` exists, but it is listed under "Beta programs". v1 ran on a shared header secret.
- SIP pause is `skip_instructions`. STP and SWP pause are documented.

Nothing is documented for EUIN-blank or execution-only handling, folio maintenance (nominee, bank, contact, KYC modify), payment_source swap, step-up, the `mf_investments` snapshot, or refund fields.

The v1 inquiry draft is at `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/docs/cybrilla-production-inquiry-email.md` (not under `WeathTech_v2/docs/`). Lines 119-124 still hold placeholders, so it was never sent. It covers none of items 1, 2 or 4-7.

### Evidence status

| # | Topic | What is documented (source) | Status | Build assumption until Cybrilla answers |
|---|---|---|---|---|
| 1 | SEBI 2FA | Redemption: the OTP must go to the email/phone "registered against the folio"; body `consent:{email,isd_code,mobile}` (/mf-transactions/onetime-redemptions/). Purchase: "Send OTP to both Mobile number/Email address … stored against the primary investor"; consent is added through the Update API (/mf-transactions/onetime-purchases/). | Partly documented: partner sends | Sanchay sends the OTP to the folio/FP-profile contact and passes `consent`. Drop the STORES A4 claim that FP/AMC/RTA send the OTP. |
| 2 | Partner tagging | Partner object: `name`, `license_code` (ARN), `default_broker_codes{cams,karvy}` (same value), `location`, `euins[]`. Order fields: `partner` (FP id) and `euin`, which must be in the partner's `euins` (/mf-transactions/partner-tagging/). Capabilities page: "Mutual fund distributors with ARN license are supported"; RIA is beta. | EUIN-blank / execution-only field: **not documented** | Tag every order with `partner`. Leave `euin` null. Keep Sanchay's own execution-only declaration record (JOURNEYS §6 gate) as the audit source; do not rely on FP storing it. |
| 3 | Webhook auth | Header `FP-Signature: id:signature`, HMAC SHA-256, key id like `ntwhsc_…`, no timestamp, under "Beta programs" (/upcoming/beta/webhook-implementation/). v1 compares `X-Cybrilla-Webhook-Secret` in constant time (`CybrillaWebhookController.java:76-82` TODO(HMAC), `:117-142`). | Conflicting | Build a verifier that is HMAC-first over the raw body, with a shared-secret mode behind a per-tenant flag. Without a timestamp, replay protection has to come from event-id dedupe. WH-02/03 stay as specified if Cybrilla confirms HMAC. |
| 4 | Folio maintenance (PRF-04/06/07/08) | No update endpoints found. The capabilities page does not mention them. | **Unknown** | Specify an ops or physical-form path now (see "Recommendation" below), and treat API support as an upgrade. |
| 5 | Plan operations | SIP pause: `POST /v2/mf_purchase_plans/{id}/skip_instructions {from, to?}`, cancel with `…/skip_instructions/{id}/cancel`; "not supported for BSE SIPs" (/mf-transactions/purchase-plans/pause-sip/). STP/SWP: created with `systematic=true`, and "Pause installments of an existing STP/SWP" (/mf-transactions/recurring-switches/, /recurring-redemptions/). | Pause documented; payment_source swap, step-up and switch-in minimums **not documented** | Pause uses skip_instructions. Modify, top-up or bank change is cancel-and-recreate, which needs new 2FA and a new mandate. Switch-in minimums come from the scheme master or admin curation. |
| 6 | `mf_investments` snapshot after the AMFI directive of 2025-09-19 | Not found. `/advisory/fetch-rta-cas/` returned 403, and so did `/fp-cybrillapoa-gateway/` and `/mf-transactions/purchase-plans/`. | **Unknown** | Build holdings from Sanchay's own order ledger (as v1 did), and reconcile with CAS. |
| 7 | Refund status | Not documented. Release notes stop at Sep 2023. | **Unknown** | Mark the order `failed_payment_debited` and send it to ops reconciliation. Show no refund ETA. |

### Recommendation

- Build items 1, 2, 5 and 7 on the assumptions above.
- Gate the P0-16 webhook work on Q3.1.
- Add a spec for the ops/physical-form path covering PRF-04/06/07/08 now, before launch.
- Do not launch until Cybrilla has answered Q1.1-1.3, Q2.1-2.2 and Q3.1 **in writing**.

### Consolidated question list for Cybrilla

To: customerservice@cybrilla.com. Tenant `platizio`, `cybrillapoa` gateway, production, ARN distributor, **B2C execution-only on regular plans**.

**A. SEBI 2FA**
1. If we send the OTP ourselves and pass `consent{email,isd_code,mobile}`, is that accepted as the SEBI 2FA for purchase, redemption, switch, and SIP/STP/SWP registration? Or does FP, the AMC or the RTA also send its own OTP or email link?
2. Must the OTP go to the contact registered on the **folio at the RTA**, or to the FP investor-profile contact? For an existing folio with a different contact, what do you validate, and what error code comes back?
3. Is 2FA needed per SIP installment, or only at plan registration? Does a plan modification or a new skip_instruction need fresh consent?
4. What consent evidence must we keep (OTP timestamp, IP, device), and for how long? Will you ever ask for it?

**B. Partner tagging**
1. Can `euin` be null for execution-only orders placed on the platform ARN? Is there a field for the execution-only declaration, and does FP store it or forward it to the RTA/AMC feed?
2. What is the exact partner onboarding for one platform ARN: `default_broker_codes`, sub-broker fields, and any ARN-validity or KYD checks?
3. Does the ARN tag carry through to SIP/STP/SWP installments and switches automatically?

**C. Webhooks**
1. For our production tenant, is webhook auth the `FP-Signature` HMAC-SHA256 (`id:signature`, raw body) or the shared `X-Cybrilla-Webhook-Secret` header? Is the HMAC feature still beta, and is it enabled on `cybrillapoa`?
2. How do we rotate the key, and do multiple ids overlap during rotation? Is there a timestamp or nonce? What is the retry schedule and the event-id uniqueness guarantee?
3. What is the full event list, including plan, installment, mandate, refund and switch events?

**D. Folio maintenance**
1. Is there an API to change a nominee on an existing folio, including opt-out and the SEBI 2025 nomination format?
2. Is there an API to change the payout bank? What cooling period applies (we assume 10 days), and what documents are needed?
3. Is there an API to change mobile/email on folios, or does it only update the FP profile?
4. Can a KYC modification go through the KRA via FP, or must it be done outside FP?
5. For anything not supported, what is the prescribed physical or ops route, and does it need a wet signature?

**E. Plan operations**
1. Are pause/skip limits the same for SIP, STP and SWP (maximum duration, number of pauses)?
2. Can `payment_source` or the mandate on a live SIP be changed, or is it cancel-and-recreate only?
3. Do you support step-up or top-up fields?
4. What switch-in minimums and thresholds apply, and where are they exposed?

**F. Holdings**
1. Is `mf_investments` (or a holdings snapshot) available on `cybrillapoa` after the AMFI directive of 2025-09-19? How fresh is it, and does it cover folios opened outside FP? Is RTA CAS fetch available to ARN tenants?

**G. Refunds**
1. What fields and states exist for payment refunds (failed or rejected purchases, excess debits), and what are the SLA and webhook for each?

Sources (all fetched 2026-09-25): docs.fintechprimitives.com /fp-cybrillapoa-gateway/capabilities, /mf-transactions/partner-tagging/, /upcoming/beta/webhook-implementation/, /mf-transactions/purchase-plans/pause-sip/, /mf-transactions/recurring-switches/, /mf-transactions/recurring-redemptions/, /mf-transactions/onetime-redemptions/, /mf-transactions/onetime-purchases/, /general-topics/release-notes/. The search-engine cache for the 403 pages could not be tried because the web-search budget for this session was used up.

## GAP-03

**Question.** Where are the MFD risk-profiling questionnaire and the suitability-mismatch acknowledgement in the investor journeys, the admin console and the data model? COMPETITORS R1/R2 and pattern 5 make them required: a 7–8 question profile before the first order, a 5-level result mapped to riskometer levels, and a blocking written warning with a stored acknowledgement for each above-profile order. COMPETITORS §7.3 also routes /onboarding/risk-profile and /account/risk-profile. But JOURNEYS has no ONB, PRF or CNF screen for it, no onboardingStage step, and no field in INV-02/SIP-03/SWT-03/STP-02. ADMIN has no questionnaire versioning, no mismatch report, and no order-360 field. THREAT-MODEL §5 BOLA matrix and PRIVACY §3 purpose registry leave out risk-profile data. TESTING has no requirement id for it. Plan should specify: the questionnaire (questions, scoring, versioning); the mapping from score to riskometer; whether a mismatch blocks, warns or needs acknowledgement per order type (including switch target, STP target and SIP step-up); when re-assessment happens (e.g. every 2 years or on declaration change); the admin screens; the audit evidence; and how this fits with execution-only EUIN-blank orders.

**Ruling.**

**GAP-03: risk profiling and suitability acknowledgement (answer)**

Make it launch-blocking and fit it into the specs we already have. That means a versioned questionnaire of 8 questions (7 asked, age taken from the KYC date of birth) with 5 result levels, each capped at a riskometer level. We never hard-block an order because of a mismatch. Each purchase-type order above the investor's profile needs its own written warning, and the investor's acknowledgement is bound to the OTP. A missing, expired or stale profile blocks new purchase-type orders but never redemptions. EUIN stays blank. The profile acts only as a guardrail and never drives a recommendation.

Regulatory basis (AMFI FAQ, https://www.amfiindia.com/Themes/Theme1/downloads/FAQsonRoleofMFDsAdvts.pdf, read 2026-09-25):
- **Q5:** risk profiling is an MFD obligation. Records must be kept, then reviewed "periodically".
- **Q6(a):** online platforms are named as the example of execution-only.
- **Q7(a)–(b):** a transaction that isn't appropriate needs a written communication that the investor acknowledges, plus an "execution only notwithstanding" confirmation kept for audit.
- **v1** only had the enum `CONSERVATIVE…VERY_AGGRESSIVE, UNASSESSED` (`domain/RiskProfileType.java:2`), always defaulted to UNASSESSED (`domain/Investor.java:64`, `service/InvestorCybrillaSyncService.java:395-396`). v1 had no questionnaire.
- **Earlier design drafts** made the questionnaire optional and left the question to counsel (`/risk-profile`, Q-07). That is superseded: Q5 makes profiling mandatory.

**1. Questionnaire v1.0.0** (each answer scores 1–4; total 8–32)

| # | Question | Answers → points |
|---|---|---|
| Q1 | Age (from DOB, not asked) | ≥60→1, 45–59→2, 30–44→3, <30→4 |
| Q2 | When will you need this money? | <1y→1, 1–3y→2, 3–5y→3, >5y→4 |
| Q3 | Main goal | protect capital→1, regular income→2, balanced growth→3, maximum growth→4 |
| Q4 | Income stability | none/irregular→1, variable→2, stable→3, stable plus other income→4 |
| Q5 | Emergency savings | none→1, <3 months→2, 3–6 months→3, >6 months→4 |
| Q6 | Share of income going to EMIs | >50%→1, 30–50%→2, 10–30%→3, <10%→4 |
| Q7 | Experience | none→1, FD/debt only→2, equity MF <3y→3, equity ≥3y→4 |
| Q8 | Portfolio falls 20% in 3 months | sell all→1, sell some→2, hold→3, buy more→4 |

Score bands, with caps applied afterwards:

| Level | Score | Highest riskometer allowed |
|---|---|---|
| CONSERVATIVE | 8–13 | LOW_TO_MODERATE (includes LOW) |
| MOD_CONSERVATIVE | 14–18 | MODERATE |
| MODERATE | 19–23 | MODERATELY_HIGH |
| MOD_AGGRESSIVE | 24–28 | HIGH |
| AGGRESSIVE | 29–32 | VERY_HIGH |

- **Caps:** Q2 <1y caps the result at CONSERVATIVE. Q2 1–3y or Q8 "sell all" caps it at MOD_CONSERVATIVE.
- **Scoring:** the server computes it. The client sends only the chosen option ids.
- **Wording and bands** are compliance-owned data. They are published as `risk_questionnaires` versions (semver, sha256, `requires_retake`).

**2. When a mismatch triggers** (mismatch = the published scheme riskometer is above the profile's cap; the riskometer comes from `fund_facts`, where >75 days stale is already auto-halted)

| Action | Scheme checked | Mismatch outcome |
|---|---|---|
| Lumpsum / invest more | target | acknowledgement per order |
| SIP registration | target | acknowledgement covers that registration's instalments |
| SIP amount increase (SIPM-04) | target | new acknowledgement; decreases and date changes are not checked |
| Step-up set (SIPM-05) | target | acknowledgement covers the automatic increases; see note below |
| Switch | **target only** | acknowledgement |
| STP registration | **target only** | acknowledgement covers all transfers |
| Redemption, SWP, pause, resume, cancel | none | never checked or blocked |

- **Step-up anniversary job:** if the latest check is a mismatch with no valid acknowledgement, the increase is held, the SIP continues at its current amount, and the investor is notified.
- **Riskometer rises after registration:** a nightly job finds active SIPs and STPs now above the investor's profile. It sends a written notice by email and in-app, and shows an in-app acknowledgement card. Instalments are not stopped.

**3. Re-assessment**
- The profile expires 24 months after completion. Reminders go out 30 and 7 days before. This period is Sanchay's reading of Q5's "periodically".
- The profile becomes STALE when:
  - occupation, income or DOB changes (PRF-03 or PRF-08);
  - a questionnaire version marked `requires_retake` takes effect (30-day grace);
  - COMPLIANCE invalidates it.
- The investor can retake any time, up to 3 times per 24 hours. A retake within 30 minutes of seeing a mismatch sheet is flagged in reports.

**4. Journeys (JOURNEYS changes)**
- **New screens:**
  - ONB-21 Risk questionnaire, `/onboarding/risk-profile`, placed after ONB-12–14 and before ONB-15.
  - ONB-22 Result.
  - PRF-13 `/account/risk-profile`, plus `/retake`.
  - CNF-03 Suitability warning sheet. This is COMPETITORS §7.5 step 2, shown after the INV-01, SIP-01, SWT-02, STP-01, SIPM-04 and SIPM-05 setup screens and before the review screen.
- **Onboarding stage:** add `RISK_PROFILED` between `NOMINATION_DECIDED` and `CONSENTED`.
- **READY gate:** add "risk profile ACTIVE on a published questionnaire version". Expiry does not undo READY. Instead the order preview returns `RISK_PROFILE_EXPIRED` or `RISK_PROFILE_STALE` and routes to the retake with `returnTo`.
- **ONB-16:** add a "Risk profile" section. The frozen snapshot hash includes `riskProfileId`, level and questionnaire sha256.
- **Previews:** `POST /v1/orders/preview` and `/v1/plans/preview` return `suitability{level, maxRiskometer, schemeRiskometer, asOf, outcome, ackRequired}`.
- **Review screens:** INV-02, SIP-03, SWT-03, STP-02 and SIPM-04/05 show a "Your profile vs this fund" row.
- **CNF-03 content:** server-rendered doc `SUITABILITY_WARNING` naming the fund, its level and the investor's level, plus an unticked checkbox.
- **CNF-01:** adds a DSC-21 clause to DSC-08: "…notwithstanding Sanchay's written warning that this scheme's risk is above my risk profile". This follows MC §5.2.4 "notwithstanding the advice of in-appropriateness".
- **Confirm step:** the server re-checks. If the profile or riskometer changed since the sheet, it returns 409 `SUITABILITY_CHANGED` before the OTP is consumed.
- **After confirm:** a copy of the warning and acknowledgement is emailed to the investor. This is Q7(a)'s written communication.

**5. How this fits execution-only / EUIN-blank orders**
- The FP payload is unchanged: platform ARN, EUIN left out, and the `EXECUTION_ONLY_DECLARATION` version stored.
- The profile never filters, ranks or recommends funds (PRIVACY §3 already excludes personalised recommendations). The only visible use is a neutral "Above your risk profile" badge on the fund detail page.

**6. Data model (Drizzle)**
- **`risk_questionnaires`:** version, status DRAFT→PUBLISHED→SUPERSEDED, questions and scoring jsonb, sha256, effective_at, approved_by.
- **`risk_profiles`:** append-only.
  - Holds investor_id, questionnaire id/version/sha, answers jsonb, raw_score, caps[], level, max_riskometer, status (ACTIVE/STALE/EXPIRED/SUPERSEDED), completed_at, expires_at, source, ip, ua.
  - `investors.current_risk_profile_id` points to the current row.
- **`suitability_checks`:** one row per purchase-type action, including matches.
  - Holds order/plan/plan_change id, action, scheme, riskometer plus `fund_facts` id and as-of, profile id and level, and outcome.
- **`suitability_acknowledgements`:** immutable.
  - Holds check_id, warning doc key/version/sha256, rendered-text sha, checkbox_at, challenge_id, consent_record_id, otp_verified_at, notice_delivery_id.
- **Order and plan tables:** new columns `suitability_check_id`, `suitability_ack_id`. Confirm is refused when the outcome is MISMATCH and the acknowledgement is null.

**7. Admin (ADMIN changes)**
- **Questionnaire versioning screen:**
  - CONTENT or COMPLIANCE drafts (`riskq.draft`). COMPLIANCE is the checker for publishing (`riskq.publish`, maker-checker plus step-up).
  - It has a scoring simulator. The golden vectors must pass before publishing.
  - Audit event `riskq.published`.
- **Investor 360:**
  - The header shows level, status and expiry.
  - A new "Risk profile & suitability" tab shows history, answers, score, checks, acknowledgements and an evidence-pack download.
  - The Orders tab adds outcome and acknowledgement id/time.
  - Editing a profile or an acknowledgement is not provided, by design.
  - `investor.risk_profile.invalidate` is single-actor for COMPLIANCE, because it reduces risk.
- **§5.14 new "Suitability" report:**
  - mismatch rate by category, riskometer and level;
  - mismatches without an acknowledgement (must be 0, with an alert);
  - purchase-type orders without a check (must be 0);
  - retake-after-sheet flags;
  - profiles expiring within 30 days.
- **§5.11 new doc keys:** `SUITABILITY_WARNING`, `RISK_PROFILE_ATTESTATION`.

**8. Privacy, threat model, testing**
- **PRIVACY:** new purpose P15 `SUITABILITY`, covering questionnaire answers, results and acknowledgements. Basis is CONSENT (core) plus LU-7a. It is not optional. Retention R-TXN. Answers and levels never go to analytics.
- **THREAT-MODEL §5, new BOLA row:**
  - `GET/PUT /risk-profile` and `/risk-profile/history`: session only, no `:id` in the path.
  - Acknowledgements are reached only through an order the investor owns.
  - Extra checks: score computed on the server, client riskometer ignored, retake rate limit, confirm-time re-check.
- **TESTING, new IDs:**
  - RP-001–012: scoring bands, caps, boundaries 13/14 and 28/29.
  - SUIT-001–015: the action matrix in section 2, including switch-down (no check), STP target, step-up hold, redemption never blocked.
  - SUIT-020: 409 on a riskometer change between sheet and confirm.
  - E2E: onboarding stops at ONB-21; a mismatched lumpsum stores the acknowledgement, and the FP payload has an empty EUIN.
  - Distribution-compliance report asserts 0.

Assumptions:
- COMPLIANCE signs off the question wording before launch.
- No re-onboarding campaign is needed, because decision 5 is a clean start with no existing users.

### Critical Files for Implementation
- COMPETITORS / JOURNEYS / ADMIN / PRIVACY / THREAT-MODEL / TESTING specs (C:/Users/pc/.claude/projects/C--Users-pc-Desktop-sanchay/2f00d411-382c-43a6-bd67-ecaf60c67db1/subagents/workflows/wf_3190e72a-04a/journal.jsonl; labels spec:journeys §2.3/§4.3/§4.7/§5.1, spec:admin §5.5/§5.11/§5.14/§6, spec:privacy §3, spec:threat-model §5)
- C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/domain/RiskProfileType.java
- C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/domain/Investor.java
- Proposed (greenfield, not yet created): C:/Users/pc/Desktop/sanchay/packages/domain-rules/src/suitability.ts, C:/Users/pc/Desktop/sanchay/apps/api/src/onboarding/risk-profile/

## GAP-04

**Question.** What are the current, primary-source SEBI rules for MF folio nomination as of 2026-09-25? The specs conflict on four points. (a) Maximum nominees: JOURNEYS A7 and v1 say 3, citing a SEBI circular of 29-May-2026 said to be effective 01-Sep-2026. COMPETITORS §9 and PRIVACY P05 say 10, citing the 10-Jan-2025 circular. (b) Whether one nominee identifier (PAN, DL or Aadhaar last 4) is mandatory. PRIVACY says yes. JOURNEYS ONB-13 says ID fields are optional. (c) Whether an online opt-out authenticated only by OTP, with no signed form or video declaration, is allowed. (d) Required fields for a minor nominee and guardian, and whether DOB is mandatory. Also check whether the March-2026 consultation that PRIVACY cites was finalised, and give the transition treatment for existing folios.

**Ruling.**

**Direct answer.** The rule in force today is SEBI circular **SEBI/HO/OIAE/OIAE_IAD-3/P/CIR/2026/12676, dated 29-May-2026, effective 01-Sep-2026**. I read it in the PDF itself. Its para 15 supersedes 18 earlier nomination circulars, including the 10-Jan-2025 revamp, so the 10-nominee figure no longer applies. The answers to the four conflicts are: **(a) at most 3 nominees**, **(b) no nominee ID is mandatory**, **(c) online opt-out needs only an active "agree" on the Annexure-B text, with no video and no signed form**, **(d) DOB is mandatory only when the nominee is a minor, and guardian details are optional.** JOURNEYS A7, v1 and JOURNEYS ONB-13 are correct. COMPETITORS §9 and PRIVACY P05 are out of date.

Sources, fetched 2026-09-25:
- S1: https://www.sebi.gov.in/legal/circulars/may-2026/ease-of-doing-investments-modified-norms-for-nomination-in-demat-accounts-and-mutual-fund-folios_101703.html
- S1-PDF: https://www.sebi.gov.in/sebi_data/attachdocs/jun-2026/1780397706130.pdf (8 pages)
- FP: https://fintechprimitives.com/docs/api/ (sections "Related Party Object" and "MF Investment Account")

## Ruling per conflict

| # | Question | Rule (S1-PDF para) | Which spec is right |
|---|---|---|---|
| a | Max nominees | §5.1 "Investors can provide up to 3 nominees". Annexure-A: "You can nominate upto 3 persons" | JOURNEYS A7 and v1 (3). COMPETITORS §9 and PRIVACY P05 (10) are superseded (§15(d)) |
| b | Nominee ID mandatory? | §7a mandatory = name and relationship only. §7b optional = mobile, email, % share, "KYC / identifier of the nominee", guardian details. Annexure-A item 3(d) lists the ID (Aadhaar last 4, PAN, DL, Passport) under "Optional details" | ONB-13 (optional). PRIVACY's "mandatory" is wrong |
| c | OTP-only online opt-out, no form or video? | §8(b): the platform shows the Annexure-B declaration and the investor must actively choose it. No authentication method is specified for opt-out. §6.2 2FA (OTP to registered mobile **and** email) applies to online **nomination** | Allowed. Video is not required. v1 `flaws.md:112,294` ("video consent") is out of date |
| d | Minor nominee and guardian | §7a: "Date of birth is mandatory, in case the nominee is a minor." Guardian details are optional (§7b). Annexure-A footnote ***: mobile, email and ID are optional for the guardian | DOB mandatory only for minors. Guardian name is optional under SEBI (see the FP caveat below) |

Other binding points from the circular:
- **§4.1:** nomination is mandatory for **single-holder** folios unless the investor opts out.
- **§4.2–4.3:** nomination is optional for joint folios, but all joint holders must consent.
- **§7b:** if no % is given, the split is equal and any odd lot goes to the first nominee.
- **§7c:** every optional field must be offered, on both online and offline forms.
- **Annexure-A item 2 is a mandatory choice:** the investor picks whether statements print "Name of the Nominee(s)" or "Whether nomination given: Yes / No". This maps to FP `nominations_info_visibility`, with values `show_all_nominee_names` / `show_nomination_status`.
- **§9:** nominations can be changed any number of times, and an acknowledgement is required each time.
- **§10.2:** folios with no nomination (including opt-outs) get SMS/email reminders twice a year and a pop-up on the day's first login. These are RTA duties, but Sanchay should show the same pop-up.

## March-2026 consultation
News On AIR (17-Mar-2026, https://www.newsonair.gov.in/sebi-seeks-public-comments-on-proposed-changes-to-nomination-norms-for-demat-accounts-mutual-fund-folios) reported that SEBI proposed changing the 10-Jan-2025 circular "by aligning with the banking norms". **It was finalised.** S1-PDF para 3 says the norms were modified "after considering these representations and the feedback in the public consultation". PRIVACY should cite the 29-May-2026 circular, not the consultation paper. I could not fetch the consultation paper itself because the web-search budget ran out. That does not affect the answer, because only the final circular binds.

## Existing folios
- **§11:** "applicable mutatis-mutandis for existing accounts and folios".
- **§9.2:** Annexures A and B apply to any change or cancellation by existing investors.
- **§10.2:** existing folios without nomination only get reminders. Nothing is frozen.
- **Sanchay impact (clean start):** every folio Sanchay creates is opened after 01-Sep-2026, so §4.1 applies in full.
- **Assumption (the circular is silent on this):** if FP reuses an investor's existing folio at the same AMC that carries more than 3 nominees from the 2025 regime, display them read-only. Any edit must bring the set to 3 or fewer.

## FP related_parties vs the circular (conflict to raise with Cybrilla)

| FP field / rule | What FP's docs say | Conflict with the circular |
|---|---|---|
| Nominee slots | `folio_defaults.nominee1..3` + `nomineeN_allocation_percentage`. Max 3 | None |
| `POST /v2/related_parties` mandatory fields | `profile`, `name` (max 40, no digits or special characters), `relationship` (FP enum, including `others`) | None |
| `date_of_birth` | optional | None |
| All fields | "Once set, this cannot be modified". Edits mean a new related_party | None |
| `pan` | only if age is over 18 | None |
| `guardian_name` / `guardian_pan` | only if age is under 18. `guardian_name` max 35 | None |
| Upcoming: `aadhaar_number` (last 4), `passport_number`, `driving_licence_number` | Accepted fields | None |
| Upcoming: `nomineeN_identity_proof_type` | "Mandatory if the nominee is not a minor" | **Yes**: the circular makes the ID optional |
| Upcoming: guardian ID, contact, address | Marked mandatory (Jan-2025 logic) | **Yes**: the circular makes them optional |
| Opt-out | No opt-out attribute. Opt-out = no nominees | Sanchay must hold the Annexure-B evidence itself |

## Recommendation (use in UI, zod, FP mapper, R-10 golden tests, DSC-16)
1. `MAX_NOMINEES = 3`. Keep v1 `NominationRules.java:25` and `nomination.ts:22`.
2. Required fields: `name` (1–40 characters, letters and spaces only, to satisfy FP) and `relationship` (FP enum).
3. Add a "Nominee is a minor?" toggle. If yes, DOB is required and must be under 18.
4. Offer guardian name and guardian relationship for a minor, but keep them optional. PAN / Aadhaar last 4 / DL / Passport, mobile, email and % are all optional.
5. Validate allocation: if any % is entered, all must be entered and they must total exactly 100. If none are entered, compute an equal split.
   - Assumption: FP will want integers. Send 34/33/33, with the remainder going to nominee 1 (consistent with §7b's odd-lot rule).
6. Make the statement-display choice (Annexure-A item 2) required.
7. Validate nomination with an OTP to the registered mobile and email, or with Aadhaar eSign (§6.2).
8. Opt-out:
   - Render the Annexure-B text verbatim. v1 `nomination.ts:36-48` matches it apart from dropping "demat account/".
   - Require an explicit tick plus an OTP. The OTP is not required by the circular but gives stronger evidence.
   - Store the text version and hash, a timestamp, and the IP/device.
   - No video.
9. Sprint-0 action with Cybrilla: before READY, get written confirmation that FP's "Upcoming" nominee-ID, contact and address requirements have been brought in line with the 29-May-2026 circular. Until then, the golden tests should assert the SEBI rule, not FP's docs.

## GAP-05

**Question.** Produce one authoritative 'money-flow parameters' table to settle conflicting values across specs. (1) Purchase cut-off shown to users: COMPETITORS says platform 2:30 PM, JOURNEYS DSC-06 says 'Pay before 2:45 PM', PAYMENTS U6 says '~2 pm'. Liquid/overnight is 1:30 PM. Redemption is 3 PM, and overnight online redemption is 7 PM. Where does the value come from (server config per cutoff_profile in ADMIN §5.2 taxonomy)? (2) SIP frequencies: JOURNEYS SIP-01 and TESTING §5.6 offer Monthly and Quarterly, but PAYMENTS says QUARTERLY is invalid on the cybrillapoa gateway and COMPETITORS says monthly only at launch. (3) SIP minimum and floor: JOURNEYS defaults to ₹500, PAYMENTS has a ₹100 floor, and there are collections called 'SIP from ₹100' and 'Start with ₹500'. (4) Mandate limit formula: PAYMENTS R4 says do not port max(₹1L, 2×SIP), but JOURNEYS SIP-02, THREAT PAY-04 and TESTING §5.6 all port it. (5) First instalment: COMPETITORS has 'pay today by UPI, default ON'. JOURNEYS SIP-01 uses a lumpsum through PAY-01, default OFF. PAYMENTS R5 uses generate_first_installment_now=true, debited against the mandate, default ON. (6) Step-up: JOURNEYS SIPM-05 uses a Sanchay-scheduled annual modify, while COMPETITORS allows half-yearly too. (7) Pause durations: 1–3 vs 1,2,3,6. (8) Consecutive-failure auto-cancel threshold: FP rule vs 'AMC commonly 3'. (9) Platform lumpsum cap ₹25L and UPI cap ₹5L vs 'bank may limit UPI at ₹1L'.

**Ruling.**

**GAP-05 answer: one table of money-flow parameters**

Most values below live in one versioned server config, `money_params`, owned by `packages/domain-rules`. The API serves it through `GET /v1/app/config` (`cutoffs`, `limits`) and through the `navApplicability` field on each quote. Where a value belongs to a scheme, it comes from FP thresholds (FP is Cybrilla FintechPrimitives, the order API). Changing a value needs a maker plus a COMPLIANCE checker. Each change bumps `money_params_version`, which is part of the CNF consent snapshot hash.

| # | Parameter | Final value | Source / rationale | Specs to fix |
|---|---|---|---|---|
| 1a | NAV cut-off used to work out the NAV date (regulatory) | Standard purchase: funds realised before **15:00** get same-day NAV. Liquid and overnight purchase: before **13:30** gets the previous calendar day's NAV. Redemption and switch-out: **15:00**. Overnight redemption placed online: **19:00** | AMFI/SEBI uniform-NAV rule (PAYMENTS [Web-4]). SEBI/HO/IMD/PoD2/P/CIR/2025/56, dated 2025-04-22, effective 2025-06-01 (sebi.gov.in, read 2026-09-25) | TESTING NC-001…007 stay as they are, because they test realisation time |
| 1b | Cut-off shown to users (platform) | Equity and debt purchase: **2:30 PM**. Liquid and overnight purchase: **1:00 PM**. Redemption and switch: **2:45 PM**. Overnight online redemption: **6:45 PM** | Purchases keep 30 minutes before the regulatory time so payment can realise (COMPETITORS §8). Redemptions keep 15 minutes for OTP plus FP submission. Copy: "Pay before 2:30 PM on a business day to usually get today's NAV. The NAV date depends on when the fund house receives your money." This keeps PAYMENTS U6/A-11's "no guarantee" tone but gives a concrete time | JOURNEYS DSC-06/PAY-01 (2:45 PM becomes 2:30 PM). PAYMENTS U6 ("~2 pm" is replaced by the rows above). Add NC-008…011 display vectors |
| 1c | Where the cut-off comes from | Each SEBI category has a `cutoff_profile`, one of **STANDARD \| LIQUID \| OVERNIGHT**. Each profile holds rows of (txn_kind, channel, regulatory_time, display_time, nav_rule). A scheme-level override is allowed | ADMIN §5.2 mixes transaction kinds into its enum, and "overnight 7 PM" applies to overnight funds only, not liquid funds | Replace ADMIN §5.2's enum and FUND-DATA §4.1's `cutoff_group` with these 3 profiles |
| 2 | SIP frequency | **MONTHLY only** at launch. The zod enum is `['MONTHLY']`, with `DAILY_BUSINESS` and `DAILY_CALENDAR` reserved behind a flag that is off | FP's cybrillapoa capabilities page lists business-day daily, calendar-day daily and monthly only; "Other frequencies not supported" (docs.fintechprimitives.com/fp-cybrillapoa-gateway/capabilities, read 2026-09-25). v1 `OrderService.java:2203-2204` allowed QUARTERLY | JOURNEYS SIP-01: remove the frequency picker. TESTING §5.6: QUARTERLY becomes a **rejection** vector. ADMIN §5.14: drop "quarterly ÷ 3". STP and SWP are also monthly-only (assumption; check in spike S-7) |
| 3 | SIP minimum | `min = max(scheme thresholds[sip, monthly].amount_min, ₹100 floor)`, plus the scheme's multiple. **No ₹500 default.** A scheme with no SIP threshold is not SIP-eligible (fail closed, and ops get an alert) | The ₹500 is only v1's hard-coded check (`OrderService.java:2193-2194`). The ₹100 floor comes from PAYMENTS §8.1 | JOURNEYS SIP-01 ("default ₹500" is removed). TESTING §5.6 vectors: ₹99 rejected, ₹100 accepted if the scheme allows it, and below the scheme minimum rejected |
| 3b | Collections | One collection: **"Start with ₹500"**, rule: monthly SIP minimum ≤ ₹500. Drop "SIP from ₹100". Keep the Min-SIP filter chips (≤100 / ≤500 / ≤1,000) | Neutral naming (COMPETITORS pattern 6). "Start with ₹500" matches more funds | Change the examples in ADMIN §5.2 and JOURNEYS EXP-01 |
| 4 | Mandate limit | **UPI Autopay: fixed at ₹1,00,000.** **eNACH:** the smallest step in [₹1L, 2L, 5L, 10L, 25L] that is ≥ 1.5 × (sum of monthly SIPs on that bank including the new one, with each SIP at its peak step-up amount). The investor may choose a higher step. Headroom check: all debits on the same mandate falling on the same day must be ≤ the limit. **Do not port** v1's max(1L, 2×SIP) | v1 `InvestorActionService.java:1014-1019` produces more than ₹1L for any SIP above ₹50k, which is invalid for UPI Autopay (PAYMENTS R4, §3.2). RBI waives the extra authentication for recurring MF debits up to ₹1L | Replace the formula in JOURNEYS SIP-02, THREAT PAY-04 and TESTING §5.6. Golden vectors are listed below |
| 5 | First instalment | FP `generate_first_installment_now=true`, debited **against the mandate** (`POST /api/pg/payments/nach`). Default **ON** for UPI Autopay or an already-approved mandate. Default **OFF** for a new eNACH mandate, because approval takes 2–7 working days | Matches PAYMENTS R5, the documented FP sequence and v1 (`InvestorActionService.java:528-533`). JOURNEYS' separate lumpsum through PAY-01 creates a second order with its own OTP, not an SIP instalment. Label the toggle "Start today". Copy: "debited from {bank} ••1234 on or after {date}". Do not say "pay today by UPI" | JOURNEYS SIP-01 and COMPETITORS §2.5/#16 |
| 6 | Step-up | **Every 12 months only.** Sanchay schedules an FP plan modify at T−5 business days before the anniversary instalment (FP needs at least 2 days, v1 `OrderService.java:2091-2093`). Increase by ₹ (at least ₹100, in scheme multiples) or by % (5–50%, rounded up to the scheme multiple). Capped at the mandate limit (₹1L for UPI) | The FP gateway page does not list step-up. Half-yearly is deferred | COMPETITORS §2.7 ("half-yearly" becomes "later") |
| 7 | Pause lengths | Chips come from the server field `allowedPauseInstalments`. Default config **[1, 2]** for monthly. Never 6 | FP checks that skipped instalments are at least 1 fewer than SEBI's per-frequency skip limit. FP's example cancels a monthly SIP after 3 consecutive misses, so 3 − 1 = 2 (auto_cancellation page, read 2026-09-25). Spike S-7 confirms the maximum | JOURNEYS SIPM-03 ("1, 2, 3, 6" is removed). COMPETITORS #17 ("1–3" is removed) |
| 8 | Auto-cancel | **FP plan state is the source of truth.** The warning threshold `sip.autoCancelMisses=3` (monthly) counts **failed and skipped** instalments together. Warn after **2** consecutive misses: "one more miss cancels this SIP", with a Pay-now link. Before confirming a pause, check that it cannot combine with a failure to reach 3 | FP auto_cancellation page ("consecutive failed\skipped instalments") | PAYMENTS §8.3 ("warn after 3" is too late) and A-7 (replace "AMC commonly 3" with the FP-mirrored value) |
| 9 | Lumpsum and UPI caps | Platform cap per lumpsum order **₹25,00,000**; ops can raise it for one investor (maker-checker). UPI up to **₹5,00,000** per payment. Between ₹1L and ₹5L, UPI stays available but netbanking is the default, with the notice "Some banks limit UPI to ₹1 lakh a day". Above ₹5L, UPI is hidden. SIP per instalment is at most the scheme maximum, the mandate limit and ₹25L | NPCI raised capital-market P2M UPI to ₹5L per transaction from 2025-09-15 (PAYMENTS §1 [Web-5]). JOURNEYS A11 | JOURNEYS INV-02 (default UPI only up to ₹1L). PAYMENTS U7 already matches |

**Golden vectors for `mandate-limit.spec.ts`**

| New SIP | Other SIPs on this bank | Rail | Limit |
|---|---|---|---|
| 5,000 | – | UPI | 1,00,000 |
| 50,000 | – | UPI | 1,00,000 |
| 60,000 | – | UPI | rejected: UPI is not eligible |
| 60,000 | – | eNACH | 1,00,000 (90k rounds up) |
| 80,000 | – | eNACH | 2,00,000 (1.2L rounds up) |
| 40,000 | 70,000 | eNACH | 2,00,000 (1.65L rounds up) |
| 20,000 with 10%/yr step-up, cap 50,000 | – | eNACH | 1,00,000 (75k rounds up, sized on the peak) |

**Assumptions, each with a default**
- FP sends overnight-scheme redemptions to the registrar before 19:00. If spike S-7 shows otherwise, the overnight display cut-off falls back to 2:45 PM.
- The 30-minute purchase buffer stays until Cybrilla payment realisation is measured in production. It is a config value only.
- Spike S-7 decides three things: the pause maximum, whether FP can change a plan's payment source, and whether STP/SWP support frequencies other than monthly.

**Not fully verified:** FP's appendix of per-frequency limits returned HTTP 403, and the SEBI circular's page did not show the time values. The 3 PM and 7 PM overnight redemption times and the 2025-06-01 effective date come from JOURNEYS DSC-06. The monthly auto-cancel count of 3 comes from FP's worked example, not from a published table.

**Sources:** [FP gateway capabilities](https://docs.fintechprimitives.com/fp-cybrillapoa-gateway/capabilities), [FP auto-cancellation](https://docs.fintechprimitives.com/mf-transactions/purchase-plans/auto_cancellation) and [SEBI overnight-redemption circular](https://www.sebi.gov.in/legal/circulars/apr-2025/change-in-cut-off-timings-to-determine-applicable-nav-with-respect-to-repurchase-redemption-of-units-in-overnight-schemes-of-mutual-funds_93541.html), all read 2026-09-25. Spec text comes from the journal at `C:/Users/pc/.claude/projects/C--Users-pc-Desktop-sanchay/2f00d411-382c-43a6-bd67-ecaf60c67db1/subagents/workflows/wf_3190e72a-04a/journal.jsonl`, entries `spec:payments`, `spec:journeys`, `spec:competitors`, `spec:testing`, `spec:admin`, `spec:threat-model` and `spec:fund-data`.

### Critical Files for Implementation
- C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/service/InvestorActionService.java (lines 1014-1019: the anti-pattern not to port; 528-533: first-instalment NACH sequence to port)
- C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/service/OrderService.java (2189-2212: SIP validation; 2091-2093: the 2-day modify rule)
- C:/Users/pc/.claude/projects/C--Users-pc-Desktop-sanchay/2f00d411-382c-43a6-bd67-ecaf60c67db1/subagents/workflows/wf_3190e72a-04a/journal.jsonl (the spec sections that need the edits listed in the table)
- C:/Users/pc/Desktop/sanchay/packages/domain-rules (planned, not created yet: `money_params` config, cut-off engine, NC vectors)
- C:/Users/pc/Desktop/sanchay/packages/contracts (planned, not created yet: zod `SipFrequency=['MONTHLY']`, amount and mandate-limit schemas)

## GAP-06

**Question.** Reconcile the native client capture and handoff design with the store and privacy constraints. (1) KYC capture: JOURNEYS ONB-10 captures a live photo (expo-camera), a drawn signature and device geolocation in-app. STORES A3 and §6 blockedPermissions remove CAMERA, ACCESS_FINE/COARSE_LOCATION and RECORD_AUDIO, assume KYC/IPV runs in the provider's hosted system-browser flow, and so leave camera and location out of the Play Data safety and Apple labels. PRIVACY also excludes location. Does FP's DigiLocker/eSign/KYC flow collect photo, signature and geotag itself? (2) Lumpsum UPI: PAYMENTS R8 builds an in-house @sanchay/upi-intent Expo module (queryIntentActivities, explicit package, iOS app schemes) and JOURNEYS declares LSApplicationQueriesSchemes. STORES says no native UPI intent at launch, and THREAT PAY-06 makes intent P1 with the hosted PG for beta. (3) Payment and auth return: PAYMENTS uses sanchay://pg-return as the primary openAuthSessionAsync callback, but THREAT PAY-05 and STORES M20 say the custom scheme is dev-only and must never carry auth or payment callbacks. (4) Domains: JOURNEYS uses app.sanchay.in plus sanchay://; PAYMENTS, STORES and THREAT use sanchay.in/app/* and api.sanchay.in; ADMIN uses ops.sanchay.in. (5) Push and telemetry residency: STORES uses the Expo Push Service and Sentry in the EU region. PRIVACY requires direct FCM/APNs and self-hosted Sentry and PostHog in ap-south-1. THREAT accepts SaaS Sentry with scrubbing. (6) App lock: JOURNEYS uses a mandatory 4-digit app PIN. STORES and THREAT use a device biometric or passcode. (7) Navigation: 4 tabs in JOURNEYS vs 5 in COMPETITORS, with different route trees (/invest/[id]?mode vs /invest/[id]/lumpsum; /account/reports vs /reports).

**Ruling.**

# GAP-06 answer: native capture, handoff, domains, residency, app lock and navigation

**Direct answer.** FP's hosted DigiLocker and eSign pages do not capture the signature or the geotag, and FP never asks for a live photo. On the `/poa/kyc_forms` path the partner app must send `geo_location{latitude,longitude}` (inside India) through `PATCH` and upload the wet signature through `POST /poa/kyc_forms/:id/signature` (multipart, png/jpg/jpeg/pdf, ≤5 MB). The DigiLocker `fetch_url` gets the Aadhaar identity and address proof, and the `esign_url` does the eSign. There is no photo or IPV field anywhere in `fields_needed`.
- Sources: research:fp-api l.407-415 (docs read 2026-09-25), v1 `service/InvestorKycFormService.java:433-437`, `controller/InvestorKycFormController.java:73-74`, mock `fields_needed [identity_proof, address, signature]` (rules-fp-contracts l.569).
- The FP docs returned HTTP 403 when I tried to re-check them on 2026-09-25.

So STORES A3 is wrong for these two fields. ONB-10 is wrong about the photo.

## 1. KYC capture (ONB-10)

| Item | Decision | Permission | Store label |
|---|---|---|---|
| Live photo | **Drop it.** FP does not ask for one. Assumption: Aadhaar-OTP DigiLocker plus eSign means no separate IPV is needed. Confirm with Cybrilla (Q-C list). | none | none |
| Signature | Skia draw pad (makes a PNG), plus "upload a photo" through the system photo picker (`expo-image-picker` `launchImageLibraryAsync`; Android Photo Picker and iOS PHPicker need no permission). Set `expo-image-picker` `cameraPermission:false`. No in-app camera. | none. **CAMERA stays blocked.** | Photos: already declared (STORES l.163, 179) |
| Geotag | One reading with `expo-location` at `Accuracy.Lowest`, foreground only. Sent to FP, **never stored** (revise-design l.1171). | Remove `ACCESS_COARSE_LOCATION` from `blockedPermissions`. Keep `ACCESS_FINE_LOCATION` blocked. Add iOS `NSLocationWhenInUseUsageDescription`: "KYC rules require confirming you are in India." | Play: **Location → Approximate**, collected Yes, shared Yes (Cybrilla/KRA), required for new or modify KYC, purpose Compliance. Apple: **Location → Coarse**, linked, App Functionality. |

Document changes:
- PRIVACY l.97 and PRV-30: add a location exception for "one-shot coarse location at the KYC form step only, not persisted".
- STORES l.137 and l.168: update the purpose-string and data-safety rows to match.
- Spike: check on an Android 12+ device that `requestForegroundPermissionsAsync` returns `granted` when FINE is blocked.

## 2. Lumpsum UPI

| Phase | Android | iOS |
|---|---|---|
| Beta (PAY-06) | FP-hosted `token_url` in an auth session, plus QR/collect | same |
| **Public launch** | `@sanchay/upi-intent` with a **PSP package allowlist** (`setPackage` only for `com.phonepe.app`, `com.google.android.apps.nbu.paisa.user`, `net.one97.paytm`, `in.org.npci.upiapp`, `com.dreamplug.androidapp`, `in.amazon.mShop.android.shopping`). No "Other app" chooser. Adds `<queries>` for the `upi` scheme, never `QUERY_ALL_PACKAGES`. | `LSApplicationQueriesSchemes: ["tez","phonepe","paytmmp","bhim","credpay"]`. This is the PAYMENTS list; JOURNEYS' `gpay`/`cred` are wrong. |

- The UPI app list never leaves the device, so there is no "Installed apps" disclosure.
- Gate: P1-16 (allowlist plus rogue-app test) must pass before launch.
- Fix STORES l.459 to "adopted at launch".

## 3. Payment and auth return (fixes R8 vs PAY-05/M20)

- **Callback:** `https://sanchay.in/app/r/{kind}?ref={opaque128bit}`, where kind is `digilocker|esign|payment|mandate`.
- **Backend:** `https://api.sanchay.in/v1/{pg|kyc}/return/{ref}` returns a 303 to the channel target. Web goes to `https://sanchay.in/r/{kind}?ref=`.
- **iOS ≥17.4:** call `openAuthSessionAsync(url, httpsCallback, {preferUniversalLinks:true, preferEphemeralSession:true})`. Expo then uses `ASWebAuthenticationSession(callback: .https(host:path:))`, which matches the navigation inside the session, including server redirects. Checked in the expo/expo `packages/expo-web-browser/ios/WebAuthSession.swift` source on 2026-09-25. It needs `webcredentials:sanchay.in` (already in STORES l.418).
- **iOS <17.4:** Expo falls back to `callbackURLScheme`. Use an **unregistered** scheme, `in.sanchay.app.cb`. The session intercepts it in-process, no OS routing takes place, and it carries only the opaque ref.
- **Android:** Expo's polyfill resolves on any `Linking` URL that starts with the callback (same file set, `WebBrowser.ts`). A verified App Link is used. Custom Tabs may not hand off a redirect that has no user gesture, so the Next.js page `/app/r/[kind]` shows an "Open Sanchay" button. On the app side, AppState goes active, the app reads the MMKV `inflight` record and polls the server.
- `scheme: 'sanchay'` is only set when `APP_VARIANT!=='production'`.
- Amend M20 and PAY-05 to allow the in-process iOS fallback.

## 4. Domains (canonical)

| Use | Value |
|---|---|
| Public and investor web | `https://sanchay.in`, with no `/app` prefix on web routes (COMPETITORS §7.1) |
| Verified deep-link namespace | `https://sanchay.in/app/*`. On web, Next.js returns a 307 to `/*`. On native, `+native-intent.tsx` strips `/app` and validates the route with zod. |
| API | `https://api.sanchay.in` |
| Admin | `https://ops.sanchay.in` |
| OTP line | `@sanchay.in #123456` |

**Delete `app.sanchay.in`** from JOURNEYS A2, §1.4, §1.10 and §2.2.

## 5. Push and telemetry residency: PRIVACY wins

PRV-21 and PRV-22 are marked MUST-L.

| Function | Decision |
|---|---|
| Push | `getDevicePushTokenAsync` plus direct FCM HTTP v1 / APNs from NestJS. `expo-notifications` is kept only for client-side permissions and channels. The payload is generic. This is the only entry in `cross_border_register`. |
| Crash reporting | Self-hosted Sentry in ap-south-1 (the official docker-compose needs at least 4 vCPU / 16 GB, e.g. m7i.xlarge). The SDK and scrubbers stay unchanged; only the DSN changes (STORES l.372). |
| Analytics | Self-hosted PostHog in ap-south-1, gated on consent. Fallback: a first-party `/v1/events` table in PostgreSQL. |

- STORES D11 and §5.4/§5.5 are superseded. Remove Expo Push and SaaS Sentry from the sub-processor list (STORES l.91).
- THREAT D5 becomes a fallback only. It needs compliance-officer approval.

## 6. App lock

Use the STORES and THREAT approach: `expo-local-authentication` with a biometric or the device credential (`disableDeviceFallback:false`), on cold start and after 5 minutes in the background.
- **No 4-digit app PIN.** A 4-digit hash can be brute-forced offline, and it would need its own reset flow.
- Devices with no screen lock get a nudge and a 24-hour refresh token (M10).
- Rewrite AUTH-06 as an "Enable app lock" explainer.

## 7. Navigation

- **5 tabs: Home · Explore · Portfolio · SIPs · Account.** This is the JOURNEYS tree with plans promoted to their own tab, for SIP-first retention. At 5 tabs × 72 dp each, the bar fits on a 360-dp screen.
- Orders stay in a Portfolio segment and on the Home "Recent orders" card.
- JOURNEYS §2.1 is the canonical route tree. COMPETITORS §7.3 is superseded.

| Area | Canonical route |
|---|---|
| Invest | `/invest/[schemeId]/lumpsum` and `/invest/[schemeId]/sip`, each followed by `/review`, then `/confirm/[challengeId]`, `/pay/[orderId]`, `/result/[orderId]`. No `?mode` parameter. |
| Reports | `/reports/{capital-gains,transactions,elss}` at the top level. On native they are opened from Account. |
| Plans | `/sips/[planId]/{pause,modify,step-up,cancel}`, replacing `/plans` |
| Fund | `/mutual-funds/[schemeSlug]`, with reserved slugs `search`, `category`, `collections`, `amc` |
| Return | web `/r/[kind]`, native link `/app/r/[kind]` |

**Assumptions:**
- The Cybrilla production KYC flow matches the POA `kyc_forms` path.
- iOS 17.4+ is the majority of Indian iOS users.

### Critical Files for Implementation
- C:/Users/pc/Desktop/sanchay/apps/mobile/app.config.ts (to create)
- C:/Users/pc/Desktop/sanchay/apps/mobile/app/+native-intent.tsx (to create)
- C:/Users/pc/Desktop/sanchay/packages/expo-plugins (upi-intent, allowlist; to create)
- C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/service/InvestorKycFormService.java (reference, l.433-437)
- C:/Users/pc/.claude/projects/C--Users-pc-Desktop-sanchay/2f00d411-382c-43a6-bd67-ecaf60c67db1/subagents/workflows/wf_3190e72a-04a/journal.jsonl (specs to amend: journeys, stores, payments, threat-model, privacy, competitors)

## GAP-07

**Question.** Decide the one admin and back-office architecture and conduct model. The specs conflict on: (a) Admin auth: ADMIN §2 uses its own Argon2id passwords, TOTP, opaque sessions, an invite CLI bootstrap and a break-glass account, while THREAT A3/P0-23 uses Google Workspace/Entra OIDC via ALB authenticate-oidc with IdP passkeys. (b) Roles: three different taxonomies. ADMIN has SUPER_ADMIN/OPS/COMPLIANCE/SUPPORT/CONTENT/ENGINEER/AUDITOR. THREAT has support_l1/ops/compliance/catalogue_curator/superadmin. PRIVACY has ops_agent/ops_supervisor/compliance_officer/security_lead/engineer. (c) Placement: ADMIN uses a separate apps/admin plus main-admin.ts on ops.sanchay.in, while TESTING A2 assumes /ops inside apps/web. (d) Manual order-status override: ADMIN §5.7 allows it with evidence and maker-checker, including moving to allotted. THREAT INS-03 and PAYMENTS L5 forbid any manual transition into allotted or money states. (e) Account closure: ADMIN §5.5 has ops close with M/C and 'no active SIPs'. JOURNEYS ACC-01..04 has investor self-serve with a 7-day window. STORES §4.3 says holdings never block and in-flight orders do. (f) FATCA non-India tax residency: ADMIN A3 says refuse, while JOURNEYS A9 allows non-US/CA with an ops FATCA review. (g) Bank name-match: ADMIN uses 60–79 manual and ≥80 auto, while THREAT uses Jaro-Winkler ≥0.8, else manual. (h) Grievance ownership: ADMIN §5.17 vs PRIVACY data_requests queue.

**Ruling.**

**GAP-07 decision: one admin app, one role vocabulary, and no manual path into allotted or money states**

In one line: admin runs as a separate `apps/admin` on `ops.sanchay.in`. Staff log in through Google Workspace OIDC with passkeys, handled at the ALB, and the app issues its own session. The role list is ADMIN's seven roles. Ops cannot move an order into allotted or any money state by hand. Investors close their own accounts under the STORES state machine. Anyone tax-resident outside India is refused at launch. Bank name-match uses one Jaro-Winkler scale with 60 and 80 as the bands. DPDP requests and grievances are split into two registers, and COMPLIANCE owns grievances.

Sources: specs are results in `C:/Users/pc/.claude/projects/C--Users-pc-Desktop-sanchay/2f00d411-382c-43a6-bd67-ecaf60c67db1/subagents/workflows/wf_3190e72a-04a/journal.jsonl`, cited as label:line. DESIGN means `wf_1d1c9b02-593/journal.jsonl`, label `revise-design`.

| # | Decision | Winner | What changes |
|---|---|---|---|
| a | **Primary login:** ALB `authenticate-oidc` against Google Workspace (Entra is a config swap). The IdP enforces passkey or security-key 2-step. Nest checks `x-amzn-oidc-data` (ES256, pinned `signer` ARN, `hd=platizio.com`, `email_verified`). It maps `sub` to a **pre-provisioned** `admin_users` row, so there is no just-in-time sign-up. It then issues the opaque `__Host-sanchay_ops` session from ADMIN §2.3: 15 min idle, 10 h absolute, at most 2 per admin, revocable. **Step-up** uses the app's own TOTP (ADMIN §2.2, KMS-encrypted, replay-blocked) and is valid for 5 min. **Removed:** Argon2id passwords, password lockout and recovery codes. **Kept:** the bootstrap CLI, which works only when `admin_users` is empty and creates a SUPER_ADMIN who activates on first OIDC login. **Break-glass** moves out of the app: a sealed IdP super-admin with a hardware key, plus SSM run-task `admin:killswitch` (THREAT INS-06). | THREAT A3 (L14), P0-23 (L484) | ADMIN §2.1–2.2 (L57–75); `admin_users` loses `password_hash` and gains `oidc_sub` |
| b | **One role set:** `SUPER_ADMIN, OPS, COMPLIANCE, SUPPORT, CONTENT, ENGINEER, AUDITOR`. These live in `packages/authz/src/roles.ts`, with the permission matrix from ADMIN §3.2 (L124–183). Two permissions are added: `incident.manage` (SUPER_ADMIN, COMPLIANCE, ENGINEER) and `nominee.invocation.decide` (maker OPS, checker COMPLIANCE). The other vocabularies map onto these roles (table below). | ADMIN §3.1 | THREAT INS-01 (L283), PRIVACY §7.3 (L256–268) and §10(b) (L349) |
| c | **Placement:** a separate `apps/admin` plus `apps/api/src/main-admin.ts` on `ops.sanchay.in`. Every path on that host goes through the ALB OIDC rule, including static assets. CI forbids importing `src/admin/**` into the public module. | ADMIN §1 (L27–47) | TESTING A2 (L919) and §2.2 (L86). Admin tests get their own Playwright project. The test signer is a local ES256 key, so the same verification code runs. |
| d | **No manual transition into `SETTLED`/allotted, payment `SUCCESS` or any unit-bearing state.** Ops has four actions. **Sync from FP** runs the same idempotent transition function as webhooks. **Re-drive effects** re-runs downstream steps. **Record refund UTR** needs evidence and maker-checker. **`MANUAL_UNITS`** needs maker OPS and checker COMPLIANCE, and is allowed only when FP already says the order succeeded but sent no units, with an RTA mailback or CAS extract as evidence (DESIGN L718, L1206). `orders.status.override` and every `approvalBypassReason` path are deleted. The v1 bypass is not ported. | THREAT INS-03 (L285), PAYMENTS L5 (L334) | ADMIN §5.7 (L511) and the matrix row at L156. The `admin-order.spec.ts` route inventory asserts that no admin route writes `orders.status`. |
| e | **Investor self-serve closure** (ACC-01..04) on the STORES §4.3 state machine. Only in-flight money blocks closure: pending payments, submitted orders, and redemption or payout pending. Active SIP/STP/SWP and mandates trigger a "Cancel all & continue" step with investor consent (CNF-01). Holdings never block. The reversal window is 7 days and completion is within 30 days. Ops has two roles here. One is `closure.request_on_behalf`: maker SUPPORT or OPS, checker COMPLIANCE, used only for a written request with identity confirmed by OTP, and it runs the same `AccountClosureModule`. The other is `legal_hold`: maker COMPLIANCE plus a second approver. A death intimation freezes the account; it does not close it. | JOURNEYS (L1651–1672), STORES (L229–257) | ADMIN §5.5 (L449) and the matrix row at L150. ACC-02 changes to "Continue after cancel-all". |
| f | **Launch refuses any tax residency outside India**, not just US/CA. The answer and country are captured. A `FATCA_NON_IN_RESIDENCY` case is kept for the record. Copy: "We can currently open accounts only for investors who are tax-resident only in India." The review path from JOURNEYS A9 and DESIGN MS-21 is built behind the flag `onboarding.foreignTaxResidency=REFUSE`. The value `REVIEW` is for after launch. `ADDITIONAL_REVIEW` stays in the stage machine for PEP only. | ADMIN A3 (L17), L464 | JOURNEYS A9 (L32), ONB-07 (L651–655) |
| g | **One score:** Jaro-Winkler × 100 on normalised names (uppercase, titles SHRI/SMT/MR/MRS/MS/DR stripped, punctuation removed, tokens sorted) against the name as per PAN. **≥80: auto-accept.** **60–79:** `NAME_MISMATCH`; the investor uploads proof (ONB-09) and the account is approved under `BANK_MANUAL_VERIFY` (maker OPS, checker COMPLIANCE). **<60:** auto-reject, add a different account. If FP returns `uncertain` or `low_confidence`, the stricter of FP's verdict and our score wins. The penny drop must succeed; nothing is force-verified locally. A new payout bank is usable only after 24 h (AUTH-10). Thresholds live in config and change only through a money-flag maker-checker. | ADMIN L462 and THREAT AUTH-10 (L202) agree once the bands are defined | THREAT D8 (L539) |
| h | **Two registers on the shared case engine (ADMIN §4.3):** (1) `data_requests`, using the PRIVACY §7.1 schema (L215), for DPDP rights only (access, correction, erasure, withdrawal, nomination, nominee invocation). This replaces ADMIN's `dsr_requests`. (2) `grievances` (ADMIN §5.17) for all complaints, including category `DATA_PRIVACY`. **COMPLIANCE owns grievances**; the named Grievance Officer is required by SPDI r.5(9) and DPDP Rule 9. SUPPORT logs and replies. SLA: acknowledge within 24 h, resolve within 30 days, escalate at day 21, never beyond 90 days. A `data_requests.grievance_id` link column connects the two. | PRIVACY (L193, L400–401) + ADMIN §5.17 | `GRIEVANCE` is dropped from both DSR type enums |

**How the other role vocabularies map**

| THREAT | PRIVACY | Canonical |
|---|---|---|
| superadmin | security_lead (plus `incident.manage`) | SUPER_ADMIN |
| ops | ops_agent, ops_supervisor | OPS (the ops_supervisor's reveal becomes `investor.pii.reveal` with a reason; any checker is COMPLIANCE or SUPER_ADMIN) |
| compliance | compliance_officer | COMPLIANCE |
| support_l1 | — | SUPPORT |
| catalogue_curator | engineer (drafting notices) | CONTENT for curation; ENGINEER for engineer |
| — | — | AUDITOR (time-boxed, at most 30 days) |

Separation of duties follows ADMIN §3.3. Anything that raises risk needs a maker and a checker, and the checker cannot be the requester (enforced with a DB CHECK). Anything that lowers risk can be done by one person.

**The v1 lesson behind (d)**

In v1, `OrderService.java:1143-1171` (`C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/service/OrderService.java`) lets any non-blank `approvalBypassReason` write an allotted status without a consumed 2FA approval. It only records an audit entry, `ORDER_STATUS_FORCED_WITHOUT_APPROVAL`. An audited bypass still lets an insider create a fake holding. The hourly invariant M1 (DESIGN L1363) stays as a detective control.

**Assumptions**

1. Platizio staff use Google Workspace on `@platizio.com`. If they don't, the options are Entra, or buying Workspace seats for ops staff. Building password login is not one of them.
2. The admin frontend framework does not affect this gap. DESIGN L73 picks a Vite SPA. If it is used, it must be served behind the ALB and not from a public S3 origin.
3. The launch domain is `sanchay.in` (ADMIN A1). DESIGN uses `ops.platizio.in` and needs aligning.
4. The two developers both hold SUPER_ADMIN and ENGINEER, so there is always a second checker.

### Critical Files for Implementation
- `C:/Users/pc/Desktop/sanchay/packages/authz/src/roles.ts` (new: roles plus permission matrix, generating `admin-rbac.matrix.spec.ts`)
- `C:/Users/pc/Desktop/sanchay/apps/api/src/main-admin.ts` (new: `AdminAppModule`, OIDC header guard, sessions, TOTP step-up)
- `C:/Users/pc/Desktop/sanchay/apps/api/src/admin/orders/` (new: sync, re-drive, refund UTR and `MANUAL_UNITS` only)
- `C:/Users/pc/Desktop/sanchay/apps/api/src/modules/account-closure/` (new: the STORES §4.3 state machine)
- `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/service/OrderService.java` (read-only: the anti-pattern at 1143-1171)

## GAP-08

**Question.** What legally binding record-retention and complaint-handling timelines apply to Platizio as an AMFI-registered MFD, which is not a SEBI-registered intermediary? The specs conflict. STORES D5/A6 keep regulated records 8 years from closure. ADMIN A6 keeps audit 8 years. PRIVACY R-ID/R-TXN use 5 years after relationship end under PMLA, R-COM 8 years, and PRIVACY treats PMLA as voluntary. CAS raw PDF retention on failure is 72 h (CAS spec), 7 days (ADMIN §5.18) or ≤1 h (PRIVACY/THREAT). The CAS email-flow password is stored 7 days in JOURNEYS CAS-03 vs never persisted in the CAS spec and THREAT CAS-03. Specifically confirm: (1) whether PMLA reporting-entity obligations reach an AMFI-only MFD directly or through AMC/RTA empanelment agreements; (2) any AMFI/AMC-mandated period for KYC, consent and transaction records (AMFI MC §3(d), and the '8 years' clause at p.62); (3) DPDP Rule 8(3) one-year floor interplay; (4) investor-complaint resolution SLAs for MFDs (AMFI MFD circular, SEBI SCORES 21-day norm, SMART ODR applicability to MFDs), since the specs use 7 days (ADMIN/JOURNEYS HLP-05), 30 days (PRIVACY) and 90 days (DPDP cap).

**Ruling.**

**GAP-08: record retention and complaint timelines for Platizio as an AMFI-registered MFD (checked 2026-09-25)**

**Direct answer.** No law gives an AMFI-only MFD its own fixed retention period. The regulated period comes from the AMC side. SEBI (MF) Regulations 2026, Reg. 72(5), makes AMCs keep time-stamped applications for at least **8 years**. The AMFI Code of Conduct then requires the MFD to keep "adequate records … in compliance with the applicable laws and SEBI regulations" and to hand documents to AMCs or SEBI on demand. PMLA does not apply to Platizio directly.

**Recommendation:**
- **R-REG = 8 years from account closure** for KYC, consent/declarations, orders, EUIN or execution-only evidence and investor correspondence. This keeps STORES D5/A6 and ADMIN A6, raises PRIVACY R-ID/R-TXN from 5 to 8 years, and keeps R-COM at 8.
- **Complaints:** public commitment of **21 calendar days**, with a 7-day internal target. Data-privacy grievances within **30 days**; 90 days is only the legal maximum.

### 1. PMLA
| Point | Finding |
|---|---|
| PMLA s.2(1)(n) "intermediary" | Covers intermediaries "registered under section 12 of the SEBI Act". An MFD registered only with AMFI is not one, so it is not a reporting entity under s.2(1)(wa). (Statute text from knowledge, not re-fetched.) |
| Who carries the PMLA duty | SEBI MF Master Circular (20-Mar-2026) ¶17.1.1: keeping all unitholder documents "is the responsibility of the AMC". ¶17.1.5(a): folios are opened only when documents are "available with AMCs/RTAs and not just with the distributor". ¶17.3.7 / 17.4.1: "onus of compliance with PMLA … lie[s] with the AMCs". |
| How it reaches Platizio | Indirectly, through AMC empanelment terms and Code 5(c): provide "copies of relevant documents of the investors" on request. ¶17.1.2(a): an AMC can stop commission to distributors whose documents are incomplete. |
| PMLA's own periods | 5 years from the transaction; identity records 5 years after the relationship ends (PML Rules / s.12). This is shorter than 8 years, so it is covered anyway. |

PRIVACY is right that PMLA is not directly binding. It is wrong to treat retention as optional, because the 8-year obligation flows from the AMC.

### 2. AMFI and AMC periods
| Source | Text | What it means |
|---|---|---|
| AMFI MC AMFI/MFD-CIR/32/2025-26 (14-Jan-2026), Code §3(d) (printed p.34–35) | Keep records "including KYC records as well as correspondence … and consent/dissent of the investors". No period is stated. | The duty exists; the period comes from "applicable laws and SEBI regulations". |
| Same circular, Code §2(g) (p.34) | Data must be "purged as soon as the data is no longer required". | Minimisation applies once the retention period ends. |
| Same circular, the "8 years" clause (PDF p.62 / printed p.59) | "stored by the principal ARN Holder for … at least 8 years" | This covers only the sub-distributor's DSC Form B. It is not an investor-record rule. The specs should stop citing it for investor data. |
| SEBI MF MC ¶9.4 (j) (p.168) | AMCs keep time-stamped applications "at least for a period of eight years" (Reg. 72(5)). | This is the real source of the 8 years. Platizio's order evidence is the input to that time-stamp. |
| Same circular, ¶5.2.4 (p.22) | Execution-only orders need a separately signed investor declaration. | This declaration is an R-REG record. |
| Sample empanelment agreement | Not found (web search budget ran out). | Assumption: its clause matches Reg. 72(5). Confirm against Platizio's actual AMC empanelment terms and the Cybrilla FP partner agreement. |

Because every transaction happens on or before closure, "8 years from closure" covers both the AMC's 8 years from transaction and PMLA's 5 years after closure.

Platizio's own accounting books (commission ledger) also need 8 years under Companies Act s.128(5). That rule is separate from investor personal data.

### 3. DPDP Rule 8(3)
- The rules were notified 13-Nov-2025 (G.S.R. 846(E)). Rules 3 and 5–16 take effect 18 months later, about **13-May-2027**, so build for them now.
- Rule 8(3) sets a **minimum of 1 year** from processing for personal data, traffic data and processing logs, "unless further retention is required … under any other law".
- It is a floor. The 8-year R-REG period sits above it.
- Non-regulated data (marketing preferences, device data, CAS-derived holdings) is erased when the account is deleted. The processing logs for it are kept 1 year.
- DPDP Act s.8(7) allows retention "for compliance with any law", which covers R-REG.

**CAS files (no regulator requires keeping them):**
- Delete the raw PDF **within 1 hour** after parsing, whether parsing succeeds or fails (PRIVACY/THREAT). Drop the 72-hour and 7-day options.
- **Never store the CAS password.** Remove the 7-day storage from JOURNEYS CAS-03.
- Keep 1-year logs holding only a hash, timestamp and outcome.

**S3 Object Lock:** retention can be extended but never shortened. Set each object's retain-until to write date + 8 years, then extend it to closure + 8 years when the account closes. Do not use a bucket default lock.

### 4. Complaint timelines
| Mechanism | Applies to Platizio? | Timeline |
|---|---|---|
| AMFI Code §4(j) (p.36) | Yes | MFDs "shall endeavour to resolve" and help AMCs. No number of days is set. |
| SEBI SCORES | Not directly; complaints go against the AMC | AMC action-taken report within **21 calendar days** (SEBI MF MC p.737, SCORES circular 20-Sep-2023). |
| SMART ODR (master circular 31-Jul-2023) | No. It covers SEBI-regulated market participants such as the AMC; an MFD is not one (from knowledge, not re-fetched). | Investor charter order: MF, then SCORES, then ODR (SEBI MF MC p.739). |
| EOP Category 1 (¶19.7.1) | Not applicable | AMFI-prescribed. |
| DPDP Rule 14(3) | Yes, for data-principal grievances | **At most 90 days**, published on the app/site. |

**Text for DSC-21 and HLP-05:**
- "We aim to resolve within 7 working days and in any case within 21 calendar days."
- Escalation path: Platizio grievance officer → AMC → SEBI SCORES (against the AMC) → SMART ODR.
- Data-privacy grievances: resolved within 30 days (DPDP maximum 90), then the Data Protection Board.
- Never describe Platizio as SEBI-registered.

**Account-deletion text for app store reviewers:** "Profile and preferences are deleted now. KYC, orders, consents and communications we must keep as an AMFI-registered distributor are kept for 8 years after closure, then erased. Activity logs are kept for 1 year."

**Sources (accessed 2026-09-25):**
- AMFI Master Circular AMFI/MFD-CIR/32/2025-26: https://www.amfiindia.com/uploads/AMFI_Master_Cicular_for_MF_Ds_3c7f5ee44f.pdf
- SEBI Master Circular for Mutual Funds, 20-Mar-2026: https://www.sebi.gov.in/sebi_data/attachdocs/mar-2026/1774024028162.pdf
- DPDP Rules 2025: https://www.dpdpa.com/DPDP_Rules_2025_English_only.pdf

**Not re-fetched here** (search budget exhausted): PMLA s.2/s.12 text, the SEBI AML master circular, and the SCORES and ODR circulars. A lawyer should confirm these.

## GAP-09

**Question.** Specify the missing admin tooling and data needed for launch-scope disclosures and support. (1) Commission-rate table: DSC-03 needs the trail % per scheme or AMC on every fund page and review screen, plus a public /commission-rates or /commission-disclosure page (the two specs use different route names). ADMIN only has an 'agreement document link / commission structure reference' on amc_registry, and FUND-DATA has no fact key. Define the table (AMC × category or scheme × period, ranges vs exact), its source (AMC brokerage structure letters), the maker-checker, versioning and effective dates, and what happens when a rate is missing (block purchase or show a range?). (2) Help-centre article CMS for HLP-01/02, which no spec includes. (3) Investor support-ticket inbox with replies and SLA for HLP-03/04, which is distinct from ops_cases and grievances. (4) App config for minAppVersion, maintenance windows with ETA copy, and cutoffs (JOURNEYS §1.8 GET /v1/app/config), and who edits it. (5) Curation of the 'Popular on Sanchay' and collections lists, and a broadcast or in-app inbox message composer. (6) Risk-profile questionnaire admin (see GAP-03). (7) Reviewer/demo account management with static OTP (STORES §3.4) as an admin-controlled, audited object.

**Ruling.**

**GAP-09 answer.** There are seven gaps. The fix adds 7 admin modules and 16 tables, all sitting on the existing ADMIN machinery: `admin_approval_requests` for maker-checker, `audit_events`, and the `ops_cases` engine. The commission table is the only one that blocks launch on regulatory grounds. The rule: **no published rate means the scheme cannot be ENABLED**. We never show a guessed rate.

### 1. Commission-rate table (DSC-03)
**Regulatory basis:** AMFI Master Circular for MFDs AMFI/MFD-CIR/32/2025-26, p.34:
- Code of Conduct §II.4(c): disclose all commissions for competing schemes.
- §II.4(d): list the affiliated AMCs.
- §II.4(f): a digital platform must state "Regular Plan … commission" and show a prominent hyperlink to the rates.
- §5.1.2: trail commission only.

**Tables:**

| Table | Columns |
|---|---|
| `commission_rate_cards` | id, amc_id → `amc_registry`, version, source_doc_s3_key, source_sha256, source_letter_date, effective_from, effective_to (null until superseded), status DRAFT→PENDING_APPROVAL→PUBLISHED→SUPERSEDED, maker, checker, approval_request_id |
| `commission_rate_lines` | card_id, scope SCHEME_PLAN\|SUB_CATEGORY\|BUCKET, scheme_plan_id?, sebi_category_id?, bucket EQUITY\|DEBT\|LIQUID\|ELSS\|HYBRID\|INDEX_FOF\|OTHER, trail_bps (int, CHECK 0–250), trail_bps_after_y1?, slab_note |
| `order_disclosure_snapshot` | order_id, card_id, version, kind, min_bps, max_bps, rendered_text_sha256. Written at CNF-01 so the consent snapshot has something to include. |

**How it works:**
- **Grain:** store exact bps at scheme level when the AMC brokerage letter gives it. Otherwise store it by sub-category or by bucket.
- **Resolution order:** scheme → sub-category → bucket.
- **Fund page and review screens (FUND-01 §7, INV-02, SIP-03, SWT-03, STP-02):**
  - Show `EXACT` ("0.85% p.a. trail") when a scheme-level line exists.
  - Otherwise show `RANGE` ("0.73%–1.32% p.a. trail for {AMC} equity schemes").
- **Public page:** AMC × bucket min–max ranges in the Scripbox format (https://scripbox.com/disclosures, accessed 2026-09-25). It adds the lines "All trail; no upfront", the list of empanelled AMCs, and the as-of date.
- **Not a FactKey:** the rate is specific to the distributor, so it stays outside `FundFactsProvider`.
- **Permissions:** OPS makes the change (single entry or CSV of one letter); COMPLIANCE or SUPER_ADMIN checks it. The permission keys are `commission.rates.draft` and `commission.rates.publish`.
- **Changes:** a publish always creates a new version with a future `effective_from`. Nothing is backdated.
- **Cross-check (warning only):** warn when |trail − (TER regular − TER direct)| > 15 bps.

**When a rate is missing:**
- Add a new readiness check **R7** to ADMIN §5.2: a published card must resolve for the scheme. Without it the scheme cannot be ENABLED, so no lumpsum, SIP, switch-in or STP-in.
- If a live scheme loses its rate (for example, the AMC is terminated), purchases are halted automatically (`PURCHASE_HALTED`). Redemptions and SWP keep working.
- Cards more than 12 months old open a FUND_DATA case. This is a warning, not a block.

**Route:** the canonical route is `/commission-disclosure` (JOURNEYS PUB-02). `/commission-rates` gets a 301 redirect to it.

**API:** `GET /v1/commission-disclosure`. The `commission` object in `GET /v1/funds/{slug}` becomes `{kind, minBps, maxBps, bucket, cardVersion, effectiveFrom}`.

### 2. Help-centre CMS (HLP-01/02)
- **Tables:**
  - `help_categories`: the 6 categories in HLP-01.
  - `help_articles`: slug, category, title, body_md, `tsv` (Postgres full-text search), `context_keys[]` (screen or error codes such as ERR-FP-DOWN, used for contextual links), regulated flag, status DRAFT/IN_REVIEW/PUBLISHED/ARCHIVED.
  - `help_article_versions`.
  - `help_article_feedback`: helpful yes/no, no free text.
- **Permissions:** CONTENT drafts. SUPPORT publishes. Articles that mention fees, tax or commission need a COMPLIANCE checker.
- **Publishing:** the banned-words linter is reused. Publishing triggers web ISR tag revalidation.
- **Launch content:** a seed of 30 articles.

### 3. Support-ticket inbox (HLP-03/04)
This is its own object. It links to `ops_cases` and `grievances` but does not replace either.

- **Tables:**
  - `support_tickets`: public_ref `SNC-YYMMDD-NNNN`, investor_id or encrypted guest mobile/email, category, related entity, status NEW/OPEN/AWAITING_INVESTOR/AWAITING_INTERNAL/RESOLVED/CLOSED (the investor sees Open / Awaiting you / Resolved), assignee, first_response_due_at, resolution_due_at, reopened_count, csat, linked_case_id, linked_grievance_id.
  - `support_ticket_messages`: author INVESTOR/AGENT/SYSTEM, internal_note flag, attachments in S3 with GuardDuty malware scan.
  - `support_macros`: canned replies.
- **SLA, in working hours (09:00–19:00 IST, Mon–Sat, excluding `market_holidays`):**
  - First response within 1 working day, matching the HLP-03 copy.
  - Resolution within 3 working days.
  - At 5 working days, or when the investor taps "Escalate", a `grievances` row is created automatically (7-day SLA, §5.17).
  - RESOLVED closes automatically after 7 days, which matches the HLP-04 reopen window.
- **Permissions:** SUPPORT and OPS reply (F). COMPLIANCE reads. PII is masked.
- **Retention:** 8 years (ADMIN A6).
- **Notification:** agent replies go out through the `support.ticket.replied` template.

### 4. App config (`GET /v1/app/config`)
The config lives in `app_config_versions` (payload validated with zod, immutable once published).

| Key | Who edits | Control |
|---|---|---|
| `minAppVersion{android,ios}`, `recommendedAppVersion` | ENGINEER | Raising the minimum is maker-checker (SUPER_ADMIN checks). Lowering it is a single-actor action. |
| `maintenance{active, scope ALL\|journey list, startsAt, endsAt, etaCopy ≤140 chars}` | OPS or ENGINEER | Scheduling is maker-checker. An emergency engage is a single-actor action. The window ends by itself at `endsAt`, and extending it is a single-actor action. |
| `cutoffs` | Not edited here | Derived from `sebi_categories.cutoff_profile` plus `platformBufferMin` (30 by default, so 2:30 PM). OPS makes the change and COMPLIANCE checks it. |
| `limits`, `flags`, `holidayCalendarUrl` | Not edited here | Derived from `feature_flags`, `market_holidays` and the A11 cap. |

- **Serving:** CloudFront caches it for 60 s with an ETag. A static S3 copy acts as a fallback so SYS-01 and SYS-02 still work when the API is down.
- **Native behaviour:** the app checks at cold start and every 15 min while in the foreground. A request with an old `X-App-Version` gets HTTP 426.

### 5. Popular list, collections and broadcasts
**"Popular on Sanchay":**
- A nightly job builds `popular_schemes`: distinct investors with a successful purchase or SIP in the last 30 days, ENABLED schemes only, top 10.
- A scheme needs at least 20 investors to appear. The section stays hidden until at least 5 schemes qualify.
- Admins can only exclude (`popular_exclusions`, reason required, single-actor). They cannot add or reorder.
- **Delete `popularity_rank_override`** from ADMIN §5.2. A hand-ordered "popular" list would look like advice.

**Collections:** ADMIN §5.2 already covers them. Add the DSC-18 criteria text, generated from the rule, and a `last_refreshed_at` column.

**Broadcast composer (`broadcasts` table):**
- Fields: title, body, deeplink, channels IN_APP/PUSH/EMAIL, category SERVICE/MARKETING/REGULATORY.
- Audience: onboarding stage, platform, app version below X, has an active SIP, holds scheme X, or a CSV of investor ids. The composer shows a preview count only, never names.
- Scheduling: scheduled_at and expires_at.
- Permissions: CONTENT or OPS makes it; COMPLIANCE checks it.
- MARKETING rules: needs consent, respects quiet hours 21:00–09:00, and is capped at 2 per week per investor.
- Delivery goes through the templates pipeline (ADMIN §5.12), and each inbox row stores `broadcast_id`.

### 6. Risk-profile questionnaire admin (fits with GAP-03)
- **Table:** `risk_questionnaires`: version, questions jsonb (options carry scores), score bands, `requires_reassessment`, status, effective_at. Published versions are immutable.
- **Permissions:** CONTENT drafts. COMPLIANCE makes the publish request and SUPER_ADMIN checks it.
- **Mapping:** 5 profile levels, each allowing funds up to a maximum riskometer level:

| Profile | Highest riskometer allowed |
|---|---|
| CONSERVATIVE | Low to Moderate |
| MODERATELY_CONSERVATIVE | Moderate |
| MODERATE | Moderately High |
| MODERATELY_AGGRESSIVE | High |
| AGGRESSIVE | Very High |

  This extends the v1 enum `domain/RiskProfileType.java:2`.
- **Admin views:** a profile-history tab in investor 360 and a monthly aggregate report of mismatch acknowledgements.

### 7. Reviewer/demo accounts (STORES §3.4)
- **Table:** `review_accounts`: investor_id, store APPLE/GOOGLE, exact mobile and email, argon2 `otp_hash`, purposes {LOGIN, SANDBOX_CONSENT}, `fp_tenant` CHECK = 'SANDBOX', active_from/active_until (30 days maximum), status, use_count, last_used_at.
- **Permissions:** enabling or extending is maker-checker between two different SUPER_ADMINs. Disabling is single-actor.
- **Every use:** writes a `review_account.otp_used` audit event and sends a Slack alert.
- **Rotation:** a new code for each store submission, shown once.
- **Safety checks:**
  - The order router sends a review investor's orders to FP sandbox, and nowhere else.
  - The service refuses to start if any row points to an account that is not a review account, or not on the sandbox tenant.
  - This replaces v1's global bypass in `service/OtpService.java:101` and the `000000` stub in `SmsOtpService.java:27`.

**Assumptions:**
- AMC letters give trail rates in % p.a. (stored as bps).
- Support runs Mon–Sat.
- Staffing follows ADMIN A4, so SUPER_ADMIN can act as checker where needed.
- **Sequencing:** items 1, 4 and 7 go in the sprint before the first store build; items 2, 3, 5 and 6 go in the sprint after.

### Critical Files for Implementation
- `C:/Users/pc/.claude/projects/C--Users-pc-Desktop-sanchay/2f00d411-382c-43a6-bd67-ecaf60c67db1/subagents/workflows/wf_3190e72a-04a/journal.jsonl` (spec:admin §3.2, §5.2, §5.12, §5.13, §5.17, §6; spec:journeys DSC-03, PUB-02, HLP, §1.8; spec:stores §3.4)
- `C:/Users/pc/.claude/projects/C--Users-pc-Desktop-sanchay/2f00d411-382c-43a6-bd67-ecaf60c67db1/tool-results/webfetch-1790322992083-cajxwn.pdf` (AMFI MC Ch.7 §II.4(c)(d)(f), §5.1.2)
- `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/service/OtpService.java`
- `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/domain/RiskProfileType.java`

## GAP-10

**Question.** Define the state machines, reconciliation and edge cases for money flows outside lumpsum and SIP, plus the corporate actions that change holdings. PAYMENTS covers only purchases, SIPs and mandates. JOURNEYS covers switch, STP and SWP only as screens. Plan should specify: (1) Switch as two linked legs (switch-out and switch-in), with states, partial failure where the out leg succeeds and the in leg fails (a Groww complaint COMPETITORS highlights), how it shows on the order timeline, stamp duty on switch-in, and the NAV date for each leg. (2) STP/SWP instalment lifecycle: an instalment record per transfer, failure because of insufficient units or balance, exit load and tax per instalment, auto-stop, notification, and what locked ELSS units do to SWP/STP. (3) Redemption payout tracking: T+n by category, payout to the old bank during a bank change, reversal or payout failure, and redemption of units that are still in-process. (4) IDCW payout and reinvestment ledger entries fed from FP/RTA. (5) Scheme merger, segregated portfolio, plan or option change, scheme closed to subscription mid-SIP: how holdings, active SIPs, STPs and mandates migrate, and what the investor sees (FUND-DATA §6.8 only covers the catalogue and returns). (6) Mobile or email change in Sanchay vs the folio-registered contacts that AMC/RTA use for 2FA and statements. (7) Order and ops-detector coverage for all of the above in ADMIN §5.7.

**Ruling.**

**GAP-10 answer: state machines, reconciliation and edge cases for money flows other than lumpsum and SIP, plus corporate actions**

**Direct answer.** Each flow gets a local `orders` row of kind `REDEMPTION`, `SWITCH`, `STP_INST`, `SWP_INST`, `IDCW` or `CORP_ACTION`, with child `order_legs`.
- **State changes come only from FP.** Every change re-fetches the FP object. The order moves forward by monotonic rank, as in PAYMENTS E7.
- **FP facts this relies on** (FP API reference as captured in the `research:fp-api` journal, §3.1, §3.5–3.7):
  - FP order states are pending, confirmed, submitted, successful, failed, cancelled and reversed.
  - A pending redemption or switch expires after T+1 working day.
  - Events are `mf_switch.*` and `mf_redemption.*` (created, confirmed, submitted, successful, failed, cancelled, reversed), plus `mf_*_plan.*` (created, activated, cancelled, failed, completed).
- **Holdings** change only through append-only `pf.lots` and `pf.lot_disposals` entries. Nothing is deleted; a reversal writes a counter-entry.
- **Assumption:** FP switches on the ONDC gateway are unconfirmed (FP's API reference lists `gateway: rta` only). Keep this behind `features.switch` and run a sandbox spike first.

### 1. Switch as two linked legs
FP returns one `mf_switch` object with `switched_out_*` and `switched_in_*` fields. Sanchay turns that one object into two local legs.

| Parent state | Condition |
|---|---|
| DRAFT → AWAITING_CONSENT → CONSENTED → CONFIRMING → SUBMITTED | Standard path. Switch-out units are reserved in `pending_consumptions` at draft. |
| OUT_DONE | `switched_out_units` is present and `switched_in_units` is null |
| COMPLETED | Both legs are present. Writes a SWITCH disposal and a SWITCH_IN lot in one transaction. |
| PARTIAL_OUT_ONLY | Out leg succeeded, then FP `failed` or no switch-in by the deadline. The in leg becomes `CONVERTED_TO_PAYOUT`, tracked like a redemption (§3). |
| FAILED / EXPIRED / REVERSED | Release the reservation. REVERSED writes counter-entries. |

**NAV date for each leg**
- **Switch-out:** the source scheme's redemption cut-off (3 PM).
- **Switch-in:** the NAV of the day the funds are available to the target scheme, meaning the source scheme's payout date, subject to the target's purchase cut-off (1:30 PM for liquid/overnight, 3 PM for others). Source: SEBI/HO/IMD/DF2/CIR/P/2020/175, 17-Sep-2020, which aligns switch allotment with redemption payouts.
- The preview shows both expected NAV dates.

**Stamp duty:** 0.005% on the switch-in amount. The same applies to STP-in and IDCW reinvestment. FP's allotted units are already net of it. Store `stamp_duty_paise` on the in leg.

**Order timeline**
- ORD-01 shows one row.
- ORD-02 shows two lanes: "Out: 102.345 u of A @ NAV 26-Sep" and "In: 45.678 u of B @ NAV 29-Sep, stamp ₹x".
- On partial failure the page shows an amber banner: "Money left A but didn't reach B. ₹X will be paid to HDFC ••4821 by {date}." A support ticket is opened automatically. This addresses the Groww complaint in COMPETITORS §2.13.

### 2. STP and SWP instalments
- FP instalments are fetched from `GET /v2/mf_switches?plan=` (STP) and `GET /v2/mf_redemptions?plan=` (SWP). Source: https://docs.fintechprimitives.com/mf-transactions/recurring-switches/ and …/recurring-redemptions/, accessed 2026-09-25.
- Each FP instalment becomes one `plan_instalments` row plus a child order that uses the §1 machine (STP) or the §3 machine (SWP).
- **Instalment states:** SCHEDULED → PRECHECK_OK / PRECHECK_SHORT (checked 2 working days before) → SUBMITTED → DONE / FAILED(`INSUFFICIENT_UNITS`, `SCHEME_SUSPENDED`, `OTHER`) / SKIPPED.
- **Exit load and tax:** each instalment is a FIFO disposal. Exit load is calculated per lot age on that date. Each instalment is a separate capital-gains line.
- **Auto-stop:** if FP marks the plan `cancelled` with `auto_cancelled`, the plan becomes AUTO_STOPPED. If holding units reach 0, Sanchay requests the cancellation itself. Assumption: there is no partial last instalment; verify in sandbox.
- **Notifications:** PRECHECK_SHORT, FAILED and AUTO_STOPPED each trigger a push and an email.
- **ELSS:** only unlocked lots count, and each lot has its own 3-year lock. Registration simulates the first 12 instalments against the unlock schedule and blocks the plan if any instalment falls short.

### 3. Redemption payout tracking
**States:** … → PROCESSED → PAYOUT_EXPECTED(`expected_by`) → CREDITED. Failure path: PAYOUT_FAILED → REISSUE_PENDING → CREDITED.

**Expected credit date by category**

| Category | Expected | Regulatory maximum |
|---|---|---|
| Liquid, overnight, debt | T+1 | T+3 |
| Equity, hybrid, index, ELSS | T+2 | T+3 |
| ≥80% overseas / international FoF | T+5 | T+5 (AMFI exception list) |

The regulatory maximum comes from the SEBI circular of 25-Nov-2022 (effective 1-Feb-2023). Past that date the AMC owes 15% p.a. interest, which is shown to the investor.

**Payout during a bank change:** payouts go to the folio bank that is registered with the RTA at the time. For up to 10 days after a change request the investor sees "old bank ••1234" (JOURNEYS PRF-06).

**In-process units:** unallotted purchases, pending switch-ins, pending IDCW reinvestment, estimated units (units mode) and locked lots are not redeemable. RED-01 shows them as `inProcess`. Port the rule from `RedemptionAvailability.java:146-190`, which rounds up, treats unknown as a refusal and releases units on FAILED.

### 4. IDCW ledger entries
- **Payout:** an `IDCW_PAYOUT` cash-flow entry (gross, TDS, net) with no unit change; it counts in XIRR. TDS under s.194K applies above ₹10,000 per AMC per financial year (Finance Act 2025).
- **Reinvestment:** an `IDCW_REINVEST` lot at the reinvestment NAV. Units are net of stamp duty. Cost equals the reinvested amount and the acquisition date is the reinvestment date.
- **Source:** the nightly `fp.holdings-recon` job compares FP folio units with the ledger around the record date. A match creates the entry; anything else opens a case. CAS import is the backstop.

### 5. Corporate actions
Ops enters a `corporate_actions` row, triggered by FP `merged_to_isin`/`merger_date` or an AMC notice, and it needs maker-checker approval. On the effective date it posts ledger entries.

| Event | Holdings | Plans and mandates | Investor sees |
|---|---|---|---|
| Merger | MERGER_OUT disposal plus MERGER_IN lots at the RTA ratio, carrying cost and acquisition date (tax-neutral under s.47(xviii), s.49(2AD) of the 1961 Act; CA to map to the Income-tax Act 2025) | Re-sync FP plans to the surviving ISIN. Cancel an STP if source = target. Mandates are unchanged. | Timeline event with the ratio, and a notice of the 30-day no-load exit window |
| Segregated portfolio (SEBI/HO/IMD/DF2/CIR/P/2018/160) | Equal units in a SEGREGATED lot. Cost split by NAV ratio; holding period kept. | No SIP/STP/SWP into it | Separate row "Not redeemable; paid on recovery". Recovery payouts are cash flows. |
| Plan or option change | Handled like a merger (tax-neutral consolidation) | Re-point plans | Banner |
| Closed to subscription mid-SIP | Holdings unchanged | Plan badge `SUSPENDED_BY_AMC`. Failed instalments do not trigger a "pause" nudge. | "AMC stopped new investments; your SIP may stop" |

### 6. Contact change vs folio contacts
- FP consent must use one of the folio's registered mobiles or emails, read from `GET /v2/mf_folios` (`research:fp-api`).
- Keep a `folio_contacts` table, synced nightly.
- PRF-04 updates the FP profile and raises an RTA change-of-contact request per folio (ops-assisted). The folio stays `CONTACT_SYNC_PENDING` until FP shows the new value.
- Until then, redemption, switch and SWP OTPs go to the folio-registered contact. If the investor has lost access, route them to assisted change (HLP-03).
- The 24-hour cooldown from JOURNEYS PRF-04 still applies.

### 7. Additions to the ADMIN §5.7 detectors

| case_type | Condition | Severity / SLA |
|---|---|---|
| `SWITCH_LEG_MISMATCH` | OUT_DONE with no switch-in by source payout date + 1 working day, or PARTIAL_OUT_ONLY | P1 / same day |
| `SWITCH_STP_SWP_FAILED` (keep) | Any leg or instalment FAILED | P2 |
| `PLAN_INSTALMENT_MISSING` | STP/SWP instalment day + 2 working days with no FP object | P2 |
| `PLAN_AUTO_STOPPED` | FP auto-cancel | P3 |
| `REDEMPTION_PAYOUT_OVERDUE` | Past the category's regulatory maximum (T+3, or T+5 for overseas) | P1 |
| `PAYOUT_FAILED` | Bank rejected the credit | P1 / 1 working day |
| `ORDER_REVERSED` | FP `reversed` | P1 |
| `IDCW_UNRECORDED` | Recon unit delta not explained by the ledger | P3 |
| `CORP_ACTION_UNAPPLIED` | Effective date + 2 working days with holdings not migrated | P1 |
| `SUSPENDED_SCHEME_ACTIVE_PLANS` | Plans still active on a halted scheme | P2 |
| `FOLIO_CONTACT_DRIFT` | CONTACT_SYNC_PENDING for more than 10 days | P3 |

Every state above needs a monotonic-rank table in the testing spec and a BOLA fixture on `orders`, `order_legs` and `plan_instalments`.

### Critical files for implementation
- C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/service/RedemptionAvailability.java — port the unit and amount ceiling rules.
- C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/controller/CybrillaWebhookController.java — webhook routing to replace with the persistent inbox.
- C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/service/OrderService.java — the redemption draft and forced-status rules at `:1133-1171`.
- New in the monorepo: `apps/api/src/orders/`, `packages/money/` and `apps/api/src/portfolio/ledger/`, covering the leg machines, the `pf` ledger and `corporate_actions`.

## GAP-11

**Question.** Confirm the regulatory rules that govern fund-page content and tax-statement labels, because the specs contradict each other. (1) Returns calculator: JOURNEYS FUND-02 projects values using historical CAGR or a user-chosen 1–20% expected return. COMPETITORS pattern 9 insists on actual past NAVs only. Is an assumed-rate projection an 'indicative return' that AMFI MC §4(g) or SEBI advertisement rules forbid for an MFD? (2) AMC logos: JOURNEYS FUND-01/EXP-03/§1.10 show AMC logos. COMPETITORS R4/A9 say no logos without the AMC's written approval (AMFI FAQ Q11/Q13). (3) 'Popular on Sanchay' by investor count (JOURNEYS EXP-01, default sort Popularity) vs COMPETITORS A11, which treats social proof as an inducement, with AUM as the default sort. (4) Is the TER breakdown into BER, brokerage and levies a mandatory display under the SEBI (MF) Regulations 2026 for distributors, or only for AMCs? (5) Tax statements: COMPETITORS M4 says the Income-tax Act 2025 is in force from 1-Apr-2026, with 'Tax Year' terminology and s.112A becoming s.198. JOURNEYS STM-02/04 and TESTING §5.5 use 'Financial year', s.80C wording and carry-over assumptions. Give the exact section numbers, holding periods, rates, the ₹1.25L exemption, the grandfathering date, ELSS deduction availability under the new Act and regime, and the labels to use for FY 2025-26 vs Tax Year 2026-27.

**Ruling.**

**Direct answer:** COMPETITORS is right on items 1–4. On item 5 it's right for Tax Year 2026-27 but incomplete: FY 2025-26 disposals are still governed by the 1961 Act. JOURNEYS FUND-01/02, EXP-01/03, §1.10 and STM-02/04 need changing.

### 1. Returns calculator (FUND-02)
| Variant | Verdict | Rule |
|---|---|---|
| Scheme page projecting future value from the scheme's own historical CAGR | **Prohibited** | AMFI MC AMFI/MFD-CIR/32/2025-26 (14-Jan-2026), Code of Conduct §4(g): MFDs shall not give an "indicative return for any particular scheme" and shall not indicate or assure returns (p.35). SEBI MF Master Circular (20-Mar-2026) **ch.14** (not ch.13), ¶14.4.1: "distributors shall not offer any… indicative yield". AMFI FAQ Q9(b): avoid "future return predictions about specific… schemes". |
| Scheme page, user picks 1–20% | **Prohibited** | Tied to a named scheme, it is still an indicative return. |
| "If you had invested" using actual past NAVs | **Allowed** | Must carry the ch.14 ¶14.2 disclosures: CAGR for 1Y/3Y/5Y/since inception; ₹10,000 point-to-point; state the plan is Regular, with a note that plans have different expense structures; benchmark plus additional benchmark (¶14.2.4); nothing if the scheme is under 6 months old (¶14.2.2). |
| Generic SIP calculator with a user-chosen rate, on a /tools page with no scheme | **Allowed** | Label it "Illustration only; not the return of any scheme." |

### 2. AMC logos
CoC §4(k) (p.35) and AMFI FAQ Q13 say an MFD may not "display the name, logo, mark of any AMC / MF including in their websites/apps" without the AMC's **prior written approval**. **Launch with no logos.** Use a neutral category icon, not an AMC monogram (a monogram could count as a "mark"). Add an admin flag `amc.logoApproved` that stores the approval letter reference. Scheme names are still shown, because §4(a) requires full scheme information.

Q13 also says the AMC must approve "performance comparison reports… mentioning the scheme name". **Assumption:** factual, AMFI-sourced performance on the scheme page is fine under Q11 ("reputed / reliable sources"). Side-by-side compare pages should wait for counsel.

### 3. "Popular on Sanchay" (EXP-01)
- Popularity is not a rebate or gift inducement under CoC §1(d) in the strict sense.
- But it is an implicit recommendation shown to visitors whose risk has not been profiled. FAQ Q10 and CoC §4(b) forbid exaggerated statements.
- The closest SEBI rule is MC ¶19.10.4(a)(ii), which covers execution-only platforms: "no auto display of recommendation or ranking" (it applies to them, but it's a strong guide).

**Decision:**
- No "Popular" badge or rail on public pages.
- Default sort is **A–Z within the SEBI category**.
- AUM, returns and TER are sorts the user picks; the chosen sort is always labelled.
- This is stricter than COMPETITORS A11 (AUM as default), because an AUM default is itself an automatic ranking.

### 4. TER breakdown
MC ¶11.2.2 and ¶11.2.4 put this on **AMCs**: publish TER daily on the AMC and AMFI websites using Format 7E, where TER = BER + brokerage + transaction cost + statutory levies (incl. GST). No MFD rule requires the breakdown.

The MFD must:
- disclose that the plan is a Regular plan that pays commission to the MFD (§4(f));
- show a prominent link to commission rates across competing schemes (§4(f));
- show a prominent link to the SID/SAI/KIM (§4(f));
- not withhold AMC-supplied information (§4(a)).

**Decision:** show the total TER for the **Regular plan** with its as-of date. The BER breakdown is optional, sourced from Format 7E through FundFactsProvider.

### 5. Tax statements
| Item | FY 2025-26 (disposals 1-Apr-2025 to 31-Mar-2026) | Tax Year 2026-27 onward |
|---|---|---|
| Statute | Income-tax Act 1961 | Income-tax Act 2025 (definition of "tax year" in s.3; no "Assessment Year") |
| Label | "Financial Year 2025-26 (AY 2026-27)" | "Tax Year 2026-27 (1 Apr 2026 – 31 Mar 2027)" |
| Equity STCG (STT paid) | s.111A, 20% | **s.196**, 20% |
| Equity LTCG | s.112A, 12.5% above ₹1.25L (transfers from 23-Jul-2024) | **s.198**, 12.5% above ₹1,25,000; the limit is per tax year, across all schemes; STT paid on transfer |
| Other LTCG | s.112, 12.5%, no indexation | **s.197**, 12.5% |
| Holding period | s.2(42A): more than 12 months for equity-oriented or listed units; more than 24 months otherwise | **s.2(101)**: same 12 and 24 months |
| Specified MF (more than 65% debt, bought on/after 1-Apr-2023) | s.50AA: always short-term, slab rate | **s.76**: same |
| Grandfathering | s.55(2)(ac): units bought before 1-Feb-2018; FMV/NAV on **31-Jan-2018** | **s.90(7)**: same dates |
| ELSS | s.80C, ₹1.5L, old regime only (not with s.115BAC) | **s.123** read with **Schedule XV item (m)**, ₹1,50,000. **Old regime only**: s.202 (new regime, the default) bars Chapter VIII deductions |

**Fixes to the specs:**
- **STM-02/04** must switch the label, statute and section numbers by disposal date.
- **ELSS copy:** "Deduction available only under the old tax regime (s.123, Income-tax Act 2025)."
- **TESTING §5.5 CG vectors** need test cases on both sides of the 31-Mar-2026 / 1-Apr-2026 boundary.
- **TESTING assumption A3:** every platform lot is bought after launch, so grandfathering and the 1961 Act rarely apply to platform lots. Keep the engine anyway, because CAS-imported holdings (EXP-05) can be older.
- No tax amount is computed; all capital-gains statements carry the "confirm with your tax adviser" disclaimer.

**Things I could not verify:**
- I checked the section numbers against the text of the **Income-tax Bill 2025 as introduced (13-Feb-2025)**. The numbers 196/197/198/123/202 match secondary sources describing the enacted Act.
- s.2(101), s.76, s.90(7) and Schedule item (m) come only from the Bill. The CA should confirm them against the notified Act before the §17 sign-off.
- I couldn't read the SEBI (MF) Regulations 2026 themselves; the TER answer rests on MC ¶11.2.
- incometaxindia.gov.in returned 403, and the web-search budget was used up, so I found no CBDT mapping FAQ.

**Sources (accessed 2026-09-25):**
- AMFI MC for MFDs: https://www.amfiindia.com/uploads/AMFI_Master_Cicular_for_MF_Ds_3c7f5ee44f.pdf (Code of Conduct pp.34–35)
- AMFI FAQs on MFD roles and advertisements: https://www.amfiindia.com/Themes/Theme1/downloads/FAQsonRoleofMFDsAdvts.pdf (Q8–Q13)
- SEBI MF Master Circular HO/24/13/11(1)2026-IMD-POD-1/I/7602/2026, 20-Mar-2026: https://www.sebi.gov.in/sebi_data/attachdocs/mar-2026/1774024028162.pdf (¶11.2, ch.14 pp.232–236, ¶19.10.4)
- Income-tax Bill 2025 text: https://prsindia.org/files/bills_acts/bills_parliament/2025/The_Income-tax_Bill,_2025.pdf
- s.123 summary: https://cleartax.in/s/section-123-income-tax-act-2025
- Bajaj AMC LTCG note: https://www.bajajamc.com/knowledge-centre/common-things-to-know-about-ltcg-on-mutual-funds

## GAP-12

**Question.** Settle the launch scope and design of CAS external-holdings import. The specs disagree on nine points. (1) Accepted statements: CAS spec accepts NSDL/CDSL depository CAS as a snapshot, while JOURNEYS says depository CAS is out of scope. (2) 'Fetch by email' (cas-{token}@ address, SES inbound): JOURNEYS CAS-03 ships it at launch, the CAS spec defers it to Phase 1.5. (3) Parser: CAS spec uses Python casparser 1.4.1 on a Lambda container, while THREAT CAS-01 uses a TS pdfjs-dist + qpdf ECS cas-worker, and TESTING puts packages/cas-import in TS. (4) Password handling: CAS spec auto-tries PAN and PAN+DOB. JOURNEYS stores the email-flow password for 7 days. THREAT says never persisted. (5) Totals: CAS spec has an 'All investments' toggle with combined XIRR under full coverage. JOURNEYS A13 says external holdings are never summed. COMPETITORS says the toggle is off by default. (6) Beta inclusion: THREAT D7/P1 allows beta without CAS, even though CAS is launch scope. (7) CTAs on external holdings: JOURNEYS CAS-06 has 'Invest in this fund via Sanchay', which may conflict with the CAS spec §7 ban on switch or regular-plan nudges on direct holdings. (8) Dedupe of Sanchay folios appearing inside the CAS: platform_overlap_units in the CAS spec vs 'skip funds already held' in JOURNEYS. (9) Ops tooling for unmapped schemes and parse failures, which is split between ADMIN §5.18 and the CAS spec. Plan should pick one design and name owners, the effort estimate (CAS spec says about 22 dev-days) and the sprint.

**Ruling.**

## GAP-12 resolution: CAS external-holdings import

**Direct answer.** Launch one import path: the investor uploads a **CAMS+KFintech consolidated CAS PDF** themselves. It is parsed by **casparser 1.4.1 (Python), pinned, running in an isolated `apps/cas-worker` Lambda container with no internet access**. The password is never stored. External holdings are **never added into Sanchay totals** (A13 applies at launch). There are no fund-specific CTAs on external holdings. Deduplication is at unit level against the platform ledger. Ops tooling lives in ADMIN §5.18. Fetch-by-email and NSDL/CDSL statements move to Phase 1.5. **About 19 dev-days**, built in **S17 (2027-05-24→06-04) plus S18**, behind the `cas_import` flag. It must be enabled in the R2 beta and the R3 pilot.

### Decisions on the nine conflicts

| # | Conflict | Decision | Reason |
|---|---|---|---|
| 1 | Which statements | CAMS+KFintech **Detailed** CAS is the main input, with transactions and XIRR. CAMS/KFin **Summary** CAS is accepted as a units-only snapshot with no XIRR. **NSDL/CDSL and MF Central PDFs are rejected** with `CAS_UNSUPPORTED` and a "request from CAMS" hint. | Depository CAS repeats the same MF folios, which would count them twice, and it has no transactions. casparser's README lists MF Central PDFs as unsupported. It also rejects re-printed PDFs by checking generator metadata (github.com/codereverser/casparser, checked 2026-09-25). This also fixes the "MF Central" wording in JOURNEYS CAS-02 and CAS-03. |
| 2 | Fetch by email | **Deferred to Phase 1.5** (about 5 days). Trigger: upload drop-off above 40%. CAS-03 is removed from launch. | SES receiving is available in ap-south-1 (`inbound-smtp.ap-south-1.amazonaws.com`, docs.aws.amazon.com/general/latest/gr/ses.html, checked 2026-09-25). But the email flow needs a stored password and adds MX, DKIM and spoofing risk. |
| 3 | Parser | **casparser 1.4.1 (MIT; latest release 2026-08-30, last push 2026-09-23, confirmed via GitHub API).** It runs in `apps/cas-worker`: a Python 3.12 arm64 Lambda container, 1 GB, 60 s, reserved concurrency 2. It sits in a VPC with no NAT (S3 and SQS endpoints only), a read-only filesystem, and no access to the DB or Secrets Manager. **`packages/cas-import` stays in TypeScript** (TESTING §2.2). It holds zod types generated from `schema/CASData.schema.json`, the PAN filter, normalisation, upsert and dedupe logic. The in-process `pdfjs-dist` worker thread in revise-design H.4, and the pdfjs+qpdf ECS worker in THREAT CAS-01, are both dropped. | A TS parser would take 4–8 dev-weeks (CAS spec §2). An in-process thread breaks trust boundary TB9. casparser uses pypdfium2 for decryption, so qpdf and the pdf.js CVE path do not apply. `package.json` scripts call `uv`/`docker build`, so no Python enters the pnpm graph. |
| 4 | Password | **Never persisted** (THREAT CAS-03 and PRIVACY PRV-29 prevail). The server first tries the investor's KYC PAN in uppercase, then asks the investor. The password is carried as a KMS-encrypted field on an SQS message with 15 min retention; only the worker role can decrypt it. After 5 attempts the file is deleted. PAN+DOB is dropped because NSDL/CDSL is out. The JOURNEYS 7-day storage is removed. | PII minimisation |
| 5 | Totals | **No combined totals, XIRR or toggle at launch.** Home block 7 and CAS-05 show external value (latest AMFI NAV), RTA cost and gain on their own. **External XIRR** is shown only when every external holding is from a Detailed CAS and reconciled. Otherwise it shows "—". The COMPETITORS "combined toggle, off by default" is post-launch, behind flag `external.combinedView`. | Keeps the platform golden tests (XIRR and `fullCoverage`) unaffected by external data. Matches TESTING W14. |
| 6 | Beta inclusion | **Amend THREAT D7.** CAS must be enabled for R2 (06-18) and the R3 pilot. The CAS-01..06 controls (P1-06) are a **hard gate on turning the flag on**, not an optional part of beta. | Launch scope (decision 4). The pen test in S20 must cover the CAS worker. |
| 7 | CTAs | **Remove "Invest in this fund via Sanchay" (CAS-06) for all external holdings**, whether Direct or Regular. The holding detail is read-only. External data is never used for recommendations or marketing (P07 purpose limit). | CAS spec §7 bans nudges from direct to regular. The AMFI 2025-09 directive raised poaching concerns. COMPETITORS R6 applies too. |
| 8 | Dedupe | Match key is `(folio_no normalised, ISIN)`. `platform_overlap_units` = the platform ledger's units as of `statement_to`. External units = max(0, CAS units − overlap). If the remainder is ≤0.001, the row is hidden (`OVERLAP`). If it is larger, it is shown with the badge "part of a folio you also use on Sanchay" and gets no XIRR. If platform units exceed CAS units by more than 0.001, an ops `UNITS_MISMATCH` case is opened (ADMIN §5.7). Transaction-level order matching is post-launch. | "Skip funds already held" hides units bought elsewhere into the same folio. This approach does not. |
| 9 | Ops tooling | **ADMIN §5.18 owns it**, using the `ops_cases` queue `CAS`. (a) **Unmapped schemes**: one case per ISIN or RTA code (`dedupe_key=CAS_UNMAPPED:<isin>`). Ops maps it to the scheme master, including DIRECT rows (ADMIN R1), with `catalogue.curate`. Stored holdings are then re-valued automatically, with no re-parse. (b) **Parse failures**: the raw PDF is deleted when parsing ends, so the `cas.jobs.reparse` action is replaced with `cas.jobs.notify_reupload`. We keep only `failure_code`, `parser_version`, issuer, page count and the PDF producer string. An alert fires when one failure code exceeds 20% of at least 5 imports in 24 h (template drift). Ops never sees the PDF or the password. | Retention follows PRIVACY: 1 h sweeper and a 1-day quarantine lifecycle. This replaces the 72 h (CAS spec), 7 days (ADMIN) and 24 h / "keep 1 year" options (revise-design). |

**One more conflict, also settled.** THREAT CAS-05 rejects the whole CAS on a PAN mismatch, while revise-design H.4 filters rows. Decision: **keep only folios whose PAN matches the investor's (checked via blind index)**. Count and discard the rest. Return `CAS_PAN_MISMATCH` only when no folio matches.

### Effort and owners

The owner split follows the roadmap risk register: Dev A holds R12 (CAS layout variety), Dev B holds R7 (universal UI).

| Item | Owner | Days |
|---|---|---|
| `apps/cas-worker` wrapper, Dockerfile, `infra/cas.ts` (VPC with no egress, KMS, SQS, S3 quarantine) | Dev A | 3 |
| `packages/cas-import`: schema types, PAN filter, upsert/supersede, ISIN mapping | Dev A | 4 |
| Dedupe and `UNITS_MISMATCH` | Dev A | 1.5 |
| External valuation and scope XIRR via `packages/money`/portfolio math | Dev A | 1.5 |
| `external-holdings` API, P07 consent, erasure, `cas-raw-sweeper` | Dev A | 1.5 |
| Screens CAS-01, 02, 04, 05, 06, 07 (web and native, `useCasImport`, `expo-document-picker`) | Dev B | 3.5 |
| Admin CAS monitor and unmapped queue | Dev B | 1.5 |
| Golden, fuzz and bomb corpus, `cas-pan-mismatch.spec.ts`, VPC flow-log check | Dev A + AI | 2 |
| Security review | Dev A | 0.5 |
| **Total** | | **19** |

**Sprint placement.** S17 takes 12 days of core work. S18 takes the rest: admin monitor, hardening tests and review (4 days, alongside the existing security item). The remaining 3 days are absorbed inside those items.

The roadmap budgets 9 days, so this adds **about +8 dev-days**, roughly 4 working days of calendar time with two developers. **The PO must accept this at the 2026-11-06 re-baseline, or invoke lever (ii).**

### Non-engineering owners

| Owner | Action |
|---|---|
| PO | Sign the D7 amendment, the P07 consent text and the Phase 1.5 trigger. |
| Compliance | Sign off the no-CTA policy by S16. |
| Dev A | Collect about 10 redacted real CAS PDFs (CAS spec A2) into the encrypted S3 corpus by S16. |
| PO / Compliance | Send the Cybrilla and MF Central emails (CAS spec A3/A4); these do not block launch. |

### Assumptions

1. Legal accepts vendoring casparser under MIT.
2. The Lambda controls count as meeting THREAT CAS-01's intent, i.e. an isolated, non-root, no-egress worker.
3. The revise-design sprint table is the plan of record.

### Critical Files for Implementation
Nothing exists in `C:/Users/pc/Desktop/sanchay` yet. These are the files to create:
- C:/Users/pc/Desktop/sanchay/apps/cas-worker/ (Python casparser wrapper and Dockerfile)
- C:/Users/pc/Desktop/sanchay/packages/cas-import/src/index.ts
- C:/Users/pc/Desktop/sanchay/apps/api/src/modules/external-holdings/external-holdings.service.ts
- C:/Users/pc/Desktop/sanchay/infra/cas.ts
- C:/Users/pc/Desktop/sanchay/apps/admin/src/routes/cas-monitor.tsx

Spec sources (journal entries under the session's `subagents/workflows` directory):
- `wf_3190e72a-04a/journal.jsonl` holds the CAS-IMPORT, JOURNEYS, THREAT-MODEL, PRIVACY, ADMIN, COMPETITORS and TESTING specs.
- `wf_1d1c9b02-593/journal.jsonl` holds revise-design sections C.8, H.4 and R.3.
