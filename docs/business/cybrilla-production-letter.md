<!-- source: workflow wf_0a226252-0e5 label mvp-business (deliverable 1) | exported 2026-09-28 -->

# Sanchay closed real-money pilot: business documents

I read the MVP spec, the earlier business deliverable, the final critic and the FP API research. Nothing was changed.

## 0. What I corrected, and what the lead must decide

### 0.1 Critic defects fixed

| # | Defect in the earlier deliverable | Fix in this version |
|---|---|---|
| 1 | Calendar: demos in Feb/May 2027, production credentials 25-Jun-2027, pilot 19-Jul-2027, iOS | Uses the MVP calendar only (H-19): demo Fri 06-Nov-2026, production credentials Fri 13-Nov-2026, founders' test orders from Tue 17-Nov-2026, real-money go/no-go Fri 27-Nov-2026. Android and web only. Every due date was checked against the holidays 10-02, 10-20, 11-09, 11-10 and 11-24 |
| 2 | Hosts: investor web on the apex `sanchay.in` | H-1 four-host model: `www.sanchay.in` (public), `app.sanchay.in` (investor web and App Links), `api.sanchay.in` (native API, webhooks, FP postbacks). `ops.sanchay.in` is reserved with no DNS record |
| 3 | Paths used `/v1/...` and `/webhooks/fp` | `/api/v1` on every path: `https://api.sanchay.in/api/v1/webhooks/fp` and `https://api.sanchay.in/api/v1/pg/return/{ref}` |
| 4 | `partner` field contradicted the register | H-11: we omit both `partner` and `euin`. The letter asks Cybrilla whether the tenant needs a partner object, and whether either choice auto-fills an EUIN. The adapter flag `fp.sendPartner` flips only on Cybrilla's written answer |
| 5 | Callback URLs | Exact FP-facing URLs are on `api.sanchay.in`. The investor-facing return pages are `https://app.sanchay.in/r/{payment\|mandate}` (web) and `https://app.sanchay.in/app/r/{payment\|mandate}` (Android App Link) |
| 6 | Lumpsum order: the old Q26 treated "payment after submission" as the default | H-2: custom checkout is the default (consent, then payment, then confirm). The payment-retry beta is asked as an option |
| 7 | Out-of-scope questions (switch, STP, SWP, SIP management, CAS, tax, new KYC, iOS) | Removed. The questionnaire covers only the four MVP groups |
| 8 | Missing items: first-push authorisation, Investor Charter, AMFI data terms, npm org | Added as PB-51, PB-60, PB-24 and PB-54 |

### 0.2 New issues found while writing (now decided by the controller rulings, `docs/delivery/rulings.md`)

0. **The domain comes first (R-22).** On Mon 09-28 the PO checks `sanchay.in` availability and registers it (PB-40) **before** this letter is sent. If registration is not complete when the letter goes out, the URL table is marked "final by 09-30" (see the sender note above the table).
1. **Four DLT templates (R-10, decided).**
   - The consent template reads "to {ACTION} Rs {amount} in {scheme}". That wording cannot express redeem-by-units, redeem-all or the onboarding attestation.
   - The MVP files four templates: `SANCHAY_LOGIN_OTP_V1`, `SANCHAY_CONSENT_OTP_V1`, `SANCHAY_CONSENT_UNITS_OTP_V1` (redeem by units / redeem all) and `SANCHAY_ATTEST_OTP_V1`, each with three lines and the WebOTP line `@app.sanchay.in #{code}` always last.
   - Plan-01 B12 implements and unit-tests all four; counsel signs the texts off before the Mon 10-12 filing (PB-32a).
2. **The SMS Retriever hash is a DLT variable (`{#var#}`) (R-10, decided).** This removes the dependency of DLT approval (Fri 10-23) on the Play App Signing key (Fri 11-06, R-21). The API refuses to boot outside local/test without `SANCHAY_SMS_RETRIEVER_HASH`, so every production SMS has three lines.
3. **Nonprod hostnames (R-05).** The letter promises the sandbox callback URLs by Fri 10-23. The dev AWS stack is protected in S2, so they are on `api.dev.sanchay.in` (delegated `dev.sanchay.in` zone, ADR-0014); the fallback is a fixed-hostname tunnel to the local API on the same name.
4. **The founders' test SIP is tight: the gate is tiered (R-06).**
   - SIP and redemption can only be demonstrated to Cybrilla by about Wed 11-18 (demo part 2).
   - Tue 11-24 is a bank holiday, so PB-82 picks an instalment day of 25 or 26.
   - **GO-1 on Fri 11-27** covers onboarding, lumpsum and redemption. **GO-2** enables SIP once the canary shows mandate APPROVED + plan ACTIVE + first-instalment date recorded; the debit and allotment are evidenced when they land. No scope is removed.
5. **Production credentials are the one external item with zero float (R-21).** Target Fri 11-13, **no later than Mon 11-16**, because the first founders' test order is Tue 11-17. If they slip past 11-16, GO-1 moves to Fri 12-04, per the spec's NO-GO fallback.
6. **SIP cancel (R-08).** The MVP adds an investor-initiated SIP cancel (consent-first, then the FP plan cancel from our worker). Question 28a asks Cybrilla for the cancel operation on ONDC plans.

---

# DELIVERABLE 1. Cybrilla letter and written-confirmation questionnaire (send Mon 2026-09-28)

**To:** customerservice@cybrilla.com
**Cc:** fpsupport@cybrilla.com; poa.support@cybrilla.com
**Subject:** URGENT: production access for tenant `platizio` (cybrillapoa / ONDC, ARN distributor): closed real-money pilot from 27 Nov 2026, plus written-confirmation questions

Dear Cybrilla / FintechPrimitives team,

Platizio is an AMFI-registered Mutual Fund Distributor and holds the ARN. We are building **Sanchay**, a self-directed mutual-fund app for retail investors in India. It runs on your FP and POA APIs, through the **cybrillapoa (ONDC) gateway**, under tenant **`platizio`**.

We are asking for **production access** for a **closed, invite-only, real-money pilot**. The go/no-go for onboarding, lumpsum and redemption is **Friday 27 November 2026**; monthly SIP is switched on shortly after, once our founders' test SIP shows the mandate approved and the plan active. Before that, our founders will place small real test orders in production from **Tuesday 17 November 2026**. The pilot is small; the investors are founders, colleagues and invited friends.

**Pilot scope**

- **Investors.** Resident individuals, single holding. Their KYC is already validated or registered at a KRA, which we check through POA pre-verification. New KYC (DigiLocker, eSign) is not part of the pilot.
- **Tax residency.** India only. We do not onboard PEPs.
- **Products.** Regular plans, Growth option only. A curated list of 40–60 schemes.
- **Distribution.** Execution-only, with no advice. One platform ARN, no sub-brokers, no EUIN holders. EUIN is left blank, and the investor's execution-only declaration is captured with OTP consent.
- **Transactions:**
  - lumpsum purchase by UPI or netbanking, through your payment gateway;
  - **monthly** SIP only, on a UPI Autopay (₹1,00,000) or eNACH mandate;
  - redemption by amount, by units (only if supported) or "redeem all";
  - investor-initiated SIP cancellation, confirmed by OTP.
  - No switch, STP, SWP or SIP modification (amount change, pause) in the pilot.
- **2FA.** We send the SEBI 2FA OTP ourselves, and we make no FP order, plan or mandate write before the investor completes it.
- **Pilot caps.** ₹1,00,000 per order and ₹2,00,000 per investor per day.
- **Channels.** Web at `app.sanchay.in`, and an Android app distributed through Google Play internal testing.
- **Money.** Platizio never collects or holds investor money. All money moves on your payment and mandate rails.

### What we need, and by when

| # | Request | Needed by |
|---|---|---|
| R1 | Acknowledgement and one named point of contact for the pilot | Wed 30 Sep 2026 |
| R2 | The current production go-live checklist for a cybrillapoa ARN tenant, the ONDC portal signup instructions, and the POA agreement for eSign | Mon 5 Oct 2026 |
| R3 | Sandbox readiness for `platizio`: FP token (`/v2/auth/platizio/token`) and POA token (`/v2/auth/cybrillarta/token`) working; `/poa/pre_verifications` enabled for our partner; **UPI Autopay enabled in sandbox**; sandbox webhook signing secret issued through a secure channel | Wed 7 Oct 2026 |
| R4 | Written answers to the questions marked **[Priority]** below | **Fri 16 Oct 2026** |
| R5 | Written answers to all other questions | Fri 30 Oct 2026 (at the very latest Fri 13 Nov 2026) |
| R6 | ONDC portal signup with our ARN. We submit by Fri 16 Oct; please confirm activation | Fri 30 Oct 2026 |
| R7 | POA agreement executed. We eSign on receipt | Fri 23 Oct 2026 |
| R8 | CAMS and KFintech RTA mailback subscription for our ARN. We request it by Fri 16 Oct | confirmed Fri 6 Nov 2026 |
| R9 | List of AMCs live on cybrillapoa **production** today, for our curated list | Fri 23 Oct 2026 |
| R10 | **Product demo, part 1** (sandbox): existing-KYC onboarding, lumpsum (UPI and netbanking), payment return, webhooks | **Fri 6 Nov 2026** |
| R11 | **Product demo, part 2** (sandbox): monthly SIP with a UPI Autopay or eNACH mandate, and redemption. We can instead share recorded sandbox runs if a live slot is not possible | Wed 18 Nov 2026 |
| R12 | **Production credentials** for FP (tenant `platizio`) and POA, sent only through your secure channel | **Fri 13 Nov 2026** (latest Mon 16 Nov) |
| R13 | **Production webhook signing secret / HMAC key id** (or the shared secret, if HMAC is not available on production), through the secure channel | Fri 13 Nov 2026 |
| R14 | **ARN, partner and EUIN configuration** on the production tenant: ARN attached through the ONDC signup; written confirmation of partner-object needs and blank EUIN (Q15–Q17) | answers Fri 16 Oct; production configuration Fri 13 Nov 2026 |
| R15 | **IP allowlisting**, if you use it. We send our single production egress IPv4 (a static AWS NAT Elastic IP in Mumbai, ap-south-1) by Fri 6 Nov | Fri 13 Nov 2026 |
| R16 | Registration or whitelisting of our **callback, postback and webhook URLs** (table below), if you require it | sandbox: when we send the URLs (by Fri 23 Oct); production: Fri 13 Nov 2026 |
| R17 | **UPI Autopay enabled on the production tenant** | Fri 13 Nov 2026 |
| R18 | Written position on the payment-aggregator route, escrow and AMC agreements (Q51) | Fri 13 Nov 2026 |
| R19 | Production escalation matrix, 24x7 incident contact, status page, and your standard DPA / processor terms | Fri 20 Nov 2026 |

### Our URLs (production)

<!-- Sender note (R-22, internal; delete before sending): send this letter only after sanchay.in is registered (PB-40, Mon 09-28). If registration is not complete when you send it, add this sentence under the heading: "These URLs are final by Wed 30 Sep 2026; we will confirm them in writing." -->

| Purpose | Where it is used at FP | URL |
|---|---|---|
| Webhooks (one URL for every subscribed event) | `POST /v2/notification_webhooks {url, event, status}` | `https://api.sanchay.in/api/v1/webhooks/fp` |
| Payment postback (netbanking and UPI) | `payment_postback_url` in `POST /api/pg/payments/netbanking` | `https://api.sanchay.in/api/v1/pg/return/{ref}` |
| Mandate authorisation postback (UPI Autopay and eNACH) | `payment_postback_url` in `POST /api/pg/payments/emandate/auth` | `https://api.sanchay.in/api/v1/pg/return/{ref}` |
| Investor landing page, web (our API answers the postback with HTTP 303; not sent to FP) | none | `https://app.sanchay.in/r/payment?ref={ref}` and `https://app.sanchay.in/r/mandate?ref={ref}` |
| Investor landing page, Android app (verified App Link; not sent to FP) | none | `https://app.sanchay.in/app/r/payment?ref={ref}` and `https://app.sanchay.in/app/r/mandate?ref={ref}` |
| Investor web app origin | referrer / return origin | `https://app.sanchay.in` |
| Public site (legal, commission disclosure, grievance) | none | `https://www.sanchay.in` |
| KYC return | not used in the pilot (reserved for phase 2) | `https://api.sanchay.in/api/v1/kyc/return/{ref}` |

How the return URLs work:

- `{ref}` is an opaque, single-use, URL-safe value (128-bit random).
- The postback endpoint accepts both GET and POST.
- We never trust the postback parameters. We always re-fetch the payment, mandate or order from FP.
- Only our backend worker calls FP, from the single static egress IP above. Browsers and the app never call FP directly.
- Sandbox URLs (our dev environment) will follow by Fri 23 Oct 2026.

### How to answer

Please reply per question number with:

1. On cybrillapoa **production** for tenant `platizio`: Yes / No / Beta / Roadmap (with a date).
2. The endpoint and field names, with a documentation link.
3. Any per-tenant enablement we must request.
4. Any difference between sandbox and production.

We move real money only on written confirmation or production evidence, so your written answers become part of our compliance file. We are happy to take a call in the week of 5 October.

---

## Questionnaire (pilot scope only)

**[Priority]** = needed by **Fri 16 Oct 2026**. All other questions by **Fri 30 Oct 2026**.

### A. Go-live, tenant and environments

**1. [Priority] Go-live checklist and timing.**
- Please send the current go-live checklist for a cybrillapoa ARN tenant (ONDC signup with ARN, POA agreement eSign, product demo, RTA mailback, anything else), with the typical elapsed time for each step.
- Can production credentials be issued by Fri 13 Nov if demo part 1 is on Fri 6 Nov?
- Can SIP/mandate and redemption be approved on a second demo on Wed 18 Nov, or on recorded sandbox runs?
- *Why:* the pilot gate is fixed at 27 Nov, and our founders' production test orders start on 17 Nov.
- *If no:* the founders' test orders and the pilot move to the first date your process allows. Any flow the approval does not cover stays switched off in production.

**2. [Priority] ONDC registration.**
- Does Cybrilla POA's ONDC registration cover Platizio as the ARN distributor?
- Or must Platizio register as its own ONDC network participant?
- *Why:* a registration of our own is a multi-month workstream.
- *If we must register:* the real-money pilot is a NO-GO until it is done, and our product owner re-plans.

**3. [Priority] Sandbox access.** Please confirm the R3 items:
- both token audiences work for our sandbox clients;
- `/poa/pre_verifications` is enabled for our partner in sandbox and production. An earlier integration received `403 "Partner not allowed"` on `/poa/kyc_forms`.
- UPI Autopay is enabled in sandbox;
- the sandbox webhook secret is issued.
- *Why:* our sandbox probes run in the week of 5 Oct.
- *If pre-verification is not enabled:* this blocks the pilot (see Q39).

**4. Production parity.**
- For each capability in sections B–I that works in sandbox, please confirm it is enabled for `platizio` on production.
- Please list every "on-demand" feature we must request separately. We know UPI Autopay is one.
- *If no:* a flow goes live only after our founders' small production orders prove it.

**5. Network controls.**
- Do you allowlist our production egress IPv4?
- Do you publish fixed source IP ranges for webhooks and postbacks?
- Is mTLS or request signing required on production calls?
- *If no:* we rely on OAuth client credentials held only by our backend worker, webhook signature verification, and re-fetching every object before acting on it.

**6. Authentication and rotation.** Please confirm:
- the production token endpoints and audiences;
- the token lifetime (we understand 1800 s);
- `x-tenant-id: platizio` on `/v2/*`, `/api/*` and `/transactions`;
- the urgent credential rotation procedure. Can two secrets be valid at once?
- *If there is no overlap:* we rotate in an announced window.

**7. Callbacks and hosted pages.**
- Must postback and webhook URLs be registered in advance?
- Which hosts does the investor pass through on the netbanking `token_url`, UPI pages and mandate-authorisation pages?
- *If there is no list:* we take the hosts from sandbox and production smoke tests.

**8. `user_ip`.**
- Please confirm production accepts IPv4 only.
- We always send the investor's real public IPv4, never a placeholder. Our edge is IPv4-only.

### B. SEBI 2FA and the consent payload

**9. [Priority] Who sends the 2FA.** We generate and verify the OTP ourselves:
- SMS to the registered mobile for purchases under ₹1,00,000 and for SIP registration including the mandate;
- SMS and email for redemptions, purchases of ₹1,00,000 or more, and onboarding attestation.

We then pass `consent`. Questions:
- Is a Sanchay-sent OTP accepted as the SEBI 2FA on ONDC for lumpsum, SIP registration and redemption?
- Will FP, ONDC, the AMC or the RTA send the investor any extra OTP or email link that they must act on?
- *Why:* this decides our consent screens and copy.
- *If there is an extra step:* we add a "check the message from the fund house" step on our status screen. We keep our own OTP unless you confirm yours replaces it.

**10. [Priority] Where the OTP must go.**
- Must the OTP go to the contacts registered on the RTA folio, or to the FP investor-profile contacts?
- For a new folio, are the profile contacts we verified sufficient?
- What do you validate, and which error code do you return on a mismatch?
- Is `GET /v2/mf_folios` (`mobile_numbers[]`, `email_addresses[]`) authoritative, and how fresh is it?
- *Why:* every pilot folio is new and opened by us, so both sets of contacts match. We want the rule confirmed before any contact change.
- *If you do not validate:* we still send only to folio-registered contacts, refreshed within 24 hours.

**11. [Priority] Consent object.** Please confirm the exact `consent` fields (`email`, `isd_code`, `mobile`) for purchases, purchase plans and redemptions:
- Is every field required, or may we send **only the channel actually verified** (for example, mobile only for a purchase under ₹1,00,000)?
- Is any timestamp, IP or OTP reference expected?
- *Why:* we never report a channel the investor did not verify.
- *If both channels are always required:* we collect both the SMS and the email code on every order.

**12. Consent scope and recovery.**
- (a) Does one consent at SIP registration cover all instalments?
- (b) Does creating or authorising a mandate need its own consent, or does the plan consent cover it?
- (c) For a new folio, the purchase consent must cover the nomination or the opt-out. Is it enough that our OTP-confirmed summary shows it, with nothing extra in the payload?
- (d) Consent is immutable. If our consent PATCH times out after the investor approved, what is the recovery path?
- *If there is no rule:* one OTP covers plan and mandate; we re-fetch before any retry; we never reuse a consent for a different order.

**13. Consent evidence.**
- What must we keep, and will you or the AMCs ever ask for it?
- Our default: consent evidence is kept for 8 years.

### C. Distributor tagging: ARN, blank EUIN, execution-only

**14. [Priority] ARN attribution.** We understand the ARN is attached once, at tenant level, through the ONDC signup, and that no order carries an ARN field.
- Please confirm the ARN reaches the RTA/AMC on every lumpsum, every SIP registration and instalment, and every redemption.
- Where can we see it (a field or a report) for audit evidence?
- *If it is not visible:* before the pilot we verify the ARN on the RTA/AMC statement of our founders' test folio.

**15. [Priority] Partner object and EUIN.** We intend to **omit both `partner` and `euin`** on every purchase, plan and redemption.
- (a) Does tenant `platizio` require a `partner` object?
- (b) With both omitted, will the ONDC message and the AMC/RTA record show a **blank** EUIN, never filled from a default EUIN registered at signup? Your ONDC examples show an EUIN on orders that have no partner.
- (c) Do you prefer the field omitted or `euin: null`?
- (d) If a partner is required, does sending it cause the EUIN to be auto-filled?
- *Why:* an auto-filled EUIN would wrongly show advice on every order.
- *If a partner is required:* we create one platform partner and send it (a configuration switch).
- *If the EUIN is auto-filled:* we need a tenant setting that turns this off. Without it we cannot take real money.

**16. Execution-only declaration.**
- Is there any FP or ONDC field for the investor's execution-only declaration when EUIN is blank?
- What evidence, and in what format, will you or the AMCs ask for?
- *If there is none:* we keep the OTP-bound declaration evidence per order and provide it on request.

**17. Channel fields.**
- Are `initiated_by: "investor"` and `initiated_via: "web" | "mobile_web" | "mobile_app_android"` accepted on ONDC purchases, plans and redemptions?
- An earlier integration saw `gateway` / `initiated_via` rejected on plan creation. What is the current behaviour, and is `gateway` inferred on plans?
- *If they are rejected on plans:* we record the channel only on our side.

### D. Lumpsum order and payment sequence

**18. [Priority] Custom checkout.** We will build this sequence. Please confirm the order, the field values (including `provider_name` for ONDC payments), and that the payment must exist before the confirm PATCH.
1. `POST /v2/mf_purchases {mf_investment_account, scheme, amount, folio_number?, user_ip, source_ref_id, gateway:"ondc", initiated_by, initiated_via}`
2. `under_review` → `pending` (on `mf_purchase.review_completed` or by polling)
3. `PATCH {id, consent}`
4. `POST /api/pg/payments/netbanking {amc_order_ids:[old_id], method:"NETBANKING"|"UPI", bank_account_id, payment_postback_url, provider_name:"ONDC", upi?:{type:"uri"}|{type:"collect", vpa}}`
5. `PATCH {id, state:"confirmed"}`
6. `submitted` → the investor pays through `token_url` or `upi.uri` → `successful` / `failed`

- *If the sequence differs:* we change our adapter before the 6 Nov demo.

**19. [Priority] One payment per order; the retry beta.** Your docs say there is no provision to create several payments for the same order.
- (a) Please confirm a failed or expired payment cannot be retried on the same order. When does such an order expire?
- (b) Is the "payment after submission / payment retry" beta available to `platizio` in production? If yes, we would like written enablement and sandbox access.
- *If (a) holds and the beta is not available:* "Try again" creates a new order with a fresh OTP consent (our default), and the old order is left to expire.

**20. Look-up before retry.**
- Can purchases, plans and redemptions be fetched by `source_ref_id`? Which error does a duplicate `source_ref_id` return?
- Does `GET /api/pg/payments?amc_order_ids=` show a created payment immediately?
- *If not:* we match on account-level lists after a waiting period, and hold the order in "reconciling" meanwhile.

**21. UPI and netbanking details.** Please confirm:
- `upi.type` is lowercase (`uri` / `collect`);
- `upi.uri` arrives through `payment.updated` and through GET;
- the per-payment UPI limit for MF purchases;
- whether UPI collect is still supported;
- the `token_url` validity (we understand 15 min);
- that TPV is enforced against `bank_account_id`;
- the merchant name investors see (we will show "Cybrilla").
- *If the UPI limit is lower than the pilot cap:* we hide UPI above that limit.

**22. Unpaid orders and late payments.**
- When does a `submitted`, unpaid order expire?
- What happens to a late-authorised payment (`late_auth`)?
- Can we cancel such an order?
- *If there is no cancel:* we rely on expiry, and route any late money to the refund path (Q37).

**23. Applicable NAV.**
- On ONDC, which event sets the applicable NAV (for example, funds realised at the AMC)?
- Is an expected NAV date exposed?
- *If not:* we show only an informative cut-off date.

### E. Monthly SIP with a mandate

**24. [Priority] UPI Autopay.** Please confirm, for sandbox and production:
- UPI Autopay is enabled;
- `mandate_type: "UPI"` (and its case);
- `provider_name: "CYBRILLAPOA"`;
- the ₹1,00,000 limit;
- the ₹1 authorisation debit and its refund;
- the `upi` parameters on `POST /api/pg/payments/emandate/auth`;
- the typical time to `APPROVED`.
- *If it is not enabled in time:* pilot SIPs run on eNACH only (our product owner decides).

**25. eNACH.** Please confirm:
- `mandate_type: "E_MANDATE"` and the authorisation modes;
- the typical time from CREATED to APPROVED in production;
- that the limits ₹1 L, 2 L, 5 L, 10 L and 25 L are accepted;
- the default `valid_to`;
- that one mandate can fund several SIPs, with separate debits;
- whether you check limit headroom across SIPs.
- *If headroom is not checked:* we enforce it ourselves.

**26. SIP sequence.** We plan:
1. `POST /api/pg/mandates {mandate_type, bank_account_id, mandate_limit, provider_name}`
2. `POST /api/pg/payments/emandate/auth {mandate_id, payment_postback_url, upi?}`
3. The investor authorises, and the mandate reaches `APPROVED`.
4. `POST /v2/mf_purchase_plans {mf_investment_account, scheme, frequency:"monthly", installment_day, number_of_installments, amount, systematic:true, payment_method:"mandate", payment_source:"<mandate id>", source_ref_id, user_ip, folio_number?}`
5. `created` → `review_completed` → one `PATCH {id, consent, state:"confirmed"}` → `active`.

Questions:
- Is this correct?
- Can the plan be created while the mandate is still pending?
- What `number_of_installments` means "until cancelled" (we plan 360)?
- *If the plan must wait:* we create it only after `APPROVED` (our default).

**27. Schedule.** Please confirm:
- `installment_day` must be 1–28;
- the minimum gap between registration and the first instalment;
- how the first instalment date is reported;
- whether `generate_first_installment_now` works on ONDC plans. Your API reference says no; your mandate use-case page says yes.
- *If it does not:* the first instalment falls on the next eligible date, and "start today" is not offered.

**28. Instalments and mandates cancelled outside our app.**
- Are instalments created as `mf_purchases` with `plan` set, on the instalment day?
- Which events report them?
- Please confirm auto-cancellation after 3 consecutive failures.
- Which event reports a mandate the investor cancels at their bank or UPI app, and what happens to the linked SIPs?
- *If there is no event:* we detect it through daily mandate polling and ask the investor to set up a new mandate.

**28a. [Priority] Investor-initiated SIP cancellation.**
- Which endpoint and fields cancel an active `mf_purchase_plan` on ONDC (cybrillapoa), and does it need the `consent` object like the plan PATCH?
- How quickly does the cancellation take effect at the RTA, and which state/event confirms it? (SEBI expects a SIP cancellation to be effective within 2 working days.)
- Does cancelling the plan leave the mandate active for reuse?
- *Why:* the investor cancels in our app after an OTP; our worker then calls your cancel. We never cancel on an investor's behalf without that OTP.
- *If not available on production:* we tell the investor in writing how to cancel at the AMC/RTA, and the SIP stays switched off in production until it is.

### F. Redemption

**29. [Priority] Redeem by units.**
- Your API reference says units are RTA-only. Your POA capabilities list units, amount and "all" for ONDC. Which is true in production?
- What unit precision applies (we assume 3 dp)?
- *If units are not supported:* the pilot offers redemption by amount and "redeem all" only.

**30. Redeem all.**
- When neither amount nor units is sent, are locked ELSS units excluded? What happens to in-process units?
- *If this is rejected when locked units exist:* we send the unlocked amount and then offer "redeem remaining".

**31. Sequence.** We plan:
1. `POST /v2/mf_redemptions {mf_investment_account, scheme, folio_number, amount|units|neither, user_ip, source_ref_id, gateway:"ondc"}`
2. `under_review` → `pending`
3. one `PATCH {id, state:"confirmed", consent}`
4. `submitted` → `successful`

- Please confirm the sequence, and that redemptions work only on folios opened through ONDC.

**32. Redeemable units.**
- Is `redeemable_units` in `GET /api/oms/reports/holdings` populated for ONDC folios?
- Does it exclude locked ELSS units and units under lien? How fresh is it?
- *If not:* we cap redemptions at the lower of our ledger and FP.

**33. Payout evidence.**
- Which fields report the payout (UTR, date)?
- Please confirm the payout always goes to the folio's registered bank account.
- *If there are no fields:* we show "expected by", and ops confirm the credit.

### G. Allotment data

**34. [Priority] Allotted units.**
- For lumpsum purchases and SIP instalments on ONDC, are `allotted_units`, `allotted_nav`, `allotted_nav_date` and `purchased_amount` (net of stamp duty) populated no later than `successful`?
- For redemptions, are `redeemed_units`, `redeemed_amount` and `redeemed_nav_date` populated?
- If any can be empty at `successful`, where and when do they arrive?
- *If this is unreliable:* the investor sees "units being confirmed", and we never show estimated units as final.

**35. Reversals.**
- When can a `successful` order become `reversed`?
- Which event reports it, and how are units and money handled?

### H. Refunds

**36. [Priority] Refund cases.** Which fields and states (`refund_*`, `late_auth`) describe each of these:
- a failed or rejected purchase after a debit;
- a TPV failure;
- a late authorisation;
- an excess debit;
- a reversal.

For each case: who starts the refund, what is the SLA, which reference (UTR) is returned, and is there an event?
- *If there are no fields:* we show "Refund of ₹X in progress" with no date, ops track it on your dashboard, and a grievance opens after 5 working days.

### I. Webhooks

**37. [Priority] Authentication.**
- For production tenant `platizio`: is it `FP-Signature: <secret_id>:<base64 HMAC-SHA256>` or a shared header secret?
- Is HMAC out of beta, and enabled on cybrillapoa?
- Is the signed input the raw body?
- *If there is only a shared secret:* we compare it in constant time, and act only on objects we re-fetch.

**38. Keys and delivery.**
- Can webhook keys be rotated with overlapping key ids?
- Is there a timestamp or nonce we can use against replay?
- What are the retry schedule, timeout and maximum number of attempts?
- Is the event id stable across retries?
- Can missed events be replayed through `GET /v2/events`, and which filters work there?

**39. Event names.** Please confirm the subscribable names on cybrillapoa for:
- `mf_purchase.*` (including `review_completed`);
- `mf_redemption.*` (including `review_completed`);
- `mf_purchase_plan.*`;
- `payment.updated`;
- mandate events;
- refund events;
- `pre_verification.accepted` / `.completed`.

Please also send the full list.
- *If an event is not available:* we poll that object. We poll every 5 minutes as a backstop anyway.

### J. KRA pre-verification for investors who already have KYC

**40. [Priority] Pre-verification.** We call `POST /poa/pre_verifications {investor_identifier, pan, name, date_of_birth}` and proceed only when readiness is `verified`.
- (a) Is `verified` enough to open an ONDC folio with no `/poa/kyc_forms` step?
- (b) What does each readiness value mean (`verified`, `underprocess`, `kyc_unavailable`, `rejected`, `incomplete`, `onhold`, `legacy`, any others)?
- (c) Can investors whose KRA status is "registered" but not "validated" transact on ONDC?
- (d) What is the typical time from `accepted` to `completed`?
- *If `verified` is not enough:* the eligible pilot group shrinks, and our product owner decides.

**41. Bank pre-verification.** For `bank_accounts:[{value:{account_number, ifsc_code, account_type:"savings"}}]`:
- Which fields return the name held at the bank and the match result?
- How does `verify_manually_if_required` behave?
- Is this verification sufficient for payment TPV?
- *If the bank-held name is not returned:* we cannot compute our own name match, and we need your match result instead.

### K. Investor provisioning

**42. [Priority] Order and fields.** We plan this order. Please confirm it, and list any other object required on ONDC (for example FATCA or tax residency).
1. `GET /v2/investor_profiles?pan=` (exact match), or `POST /v2/investor_profiles` with: individual; `resident_individual`; name; DOB; gender; occupation; PAN; country and place of birth; source of wealth; income slab; PEP status
2. `POST /v2/phone_numbers` (`belongs_to: self`)
3. `POST /v2/email_addresses`
4. `POST /v2/addresses {nature}`
5. `POST /v2/related_parties`, one per nominee
6. `POST /v2/bank_accounts`
7. `POST /v2/mf_investment_accounts {holding_pattern:"single"}`
8. `PATCH /v2/mf_investment_accounts {folio_defaults}`: nominees 1–3, `nominations_info_visibility`, payout bank, communication contacts

**43. Duplicates and immutability.**
- There is no profile DELETE. What happens if a PAN already exists in our tenant (for example from sandbox tests) or in another tenant?
- Which fields become immutable after creation?
- How do we correct an error before the first order?

**44. Bank id.**
- Please confirm that `bank_account_id` in the payment and mandate APIs is the numeric `old_id` of the bank account.

### L. Nominees (SEBI circular of 29 May 2026)

**45. [Priority] Maximum.**
- Please confirm three nominees (`nominee1..3`) is the production maximum.

**46. [Priority] Mandatory fields.** Under the circular, only name and relationship are mandatory, and date of birth only for a minor. ID, contact and guardian details are otherwise optional.
- We never collect Aadhaar. Optional ID types we accept: PAN (adults only), driving licence, passport.
- Your docs list an adult nominee identity proof as "upcoming mandatory". Which nominee fields does FP reject when missing, and from what date is FP aligned with the circular?
- *If FP needs more fields:* we collect them only with our counsel's approval. Otherwise we escalate.

**47. Opt-out and statement display.**
- Is an opt-out represented by sending no nominees? Does the RTA receive an explicit opt-out indicator?
- Is `nominations_info_visibility` (`show_all_nominee_names` / `show_nomination_status`) available in production?
- *If not:* we keep the Annexure-B evidence ourselves.

**48. Related-party rules.** Please confirm:
- `name`: at most 40 characters, letters and spaces;
- `guardian_name`: at most 35 characters;
- the `relationship` enum;
- allocation percentages are integers totalling 100 (we send 34/33/33, remainder to nominee 1);
- related parties are immutable.

### M. Money flow and agreements

**49. [Priority] Payment route and AMC agreements.** For our counsel, please share:
- the RBI payment-aggregator status of the payment route;
- the escrow or nodal flow;
- confirmation that investor money moves from the investor's account to the scheme's account with no pooling by Platizio;
- whether your arrangement satisfies the AMC–platform service-agreement requirement, or whether Platizio must sign with each AMC.
- *If this is not documented:* the real-money pilot waits for it.

**50. Live AMCs.**
- Which AMCs are live on cybrillapoa production? (Same as R9.)

### N. Sandbox test data

**51. Simulation.** Please confirm the current:
- test PANs by readiness outcome;
- penny-drop account-number suffixes;
- amount endings that succeed or fail;
- `POST /api/oms/simulate/orders/{amc_order_id}` status values;
- simulation of mandate approval (UPI Autopay and eNACH), SIP instalments, redemption and payout, refunds and `late_auth`;
- folios and holdings after a simulated success;
- scheme coverage (still only ABSL and ICICI Prudential?).

**52. Sandbox webhooks and reset.**
- Are sandbox webhooks signed the same way as production?
- How do we reset a test investor?

**53. UAT.**
- Is there a UAT environment with real rails?
- If not, do you agree to our founders' small production orders from Tue 17 Nov: ₹500–₹1,000 lumpsum by UPI and by netbanking, one UPI Autopay SIP, and one partial redemption?

### O. Support and data protection

**54. Incidents.**
- Your 24x7 production incident contact, escalation matrix, status page and maintenance notices.
- The urgent credential-revocation procedure, and access logs for our tenant.

**55. DPA.** Your standard DPA covering:
- India data residency;
- your sub-processors;
- breach notice to us within 6 hours;
- support for investor-rights requests;
- erasure or return of data at the end.

Thank you. Your written answers become part of our compliance evidence.

Contact: [Name, role] · [phone] · [email at platizio.com]

Platizio - Sanchay product team

---

### Internal appendix (do not send)

**Crosswalk**

| Letter Q# | MVP spec / register id | Drives |
|---|---|---|
| 1, R10–R12 | G-B7 | milestone 11-06 / 11-13 |
| 2 | Q-C15 | NO-GO if own registration is needed |
| 3, R3 | S1 probes | P-04, P-05, P-07, P-09 |
| 9 | **OX-01** | CNF-01 copy |
| 10 | **OX-02** | H-21 destination resolver |
| 11–13 | H-21, D-MONEY-006 | FP `consent{}` builder |
| 14 | P-05, G-B8 | gate |
| 15 | **OX-04**, H-11, P-04 | `fp.sendPartner` flag; gate |
| 16 | OX-05 / OI-1 | G-C3 |
| 18 | H-2 / ADR-0015 | lumpsum adapter |
| 19b | **old Q26** (payment-retry beta) | `fp.lumpsumFlow=PAYMENT_AFTER_SUBMIT` |
| 24 | **OX-17** | trim T6 inverse |
| 27 | P-09b; GO-2 instalment timing (R-06, Q27 by 10-16) | extension E1; canary instalment day |
| 28a | R-08 | Plan 04 F28 `plans.cancel` (FP cancel operation) |
| 29 | **OX-10**, P-09 | trim T5 / PO-2 |
| 34 | **OX-12**, P-07 | UNITS_PENDING |
| 36 | **OX-13** | refund status |
| 37–39 | **OX-06** | webhook verifier mode |
| 40–44 | §1.1 provisioning | onboarding adapter |
| 45–48 | PO-7, H-12, GAP-04 | nomination |
| 49, R18 | **OX-18** | G-C4 |

**Pre-send checks (PO, Mon 09-28)**
- **`sanchay.in` availability checked and the domain registered first (R-22, PB-40).** If registration is not complete, apply the sender note above the URL table ("final by 09-30").
- R6 and R7 need Platizio's legal name and ARN exactly as on the certificate.
- The letter goes from a platizio.com mailbox.
- No credentials are requested or sent in plain email.

---
