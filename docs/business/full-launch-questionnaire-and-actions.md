<!-- source: workflow wf_0d7a7a96-9cd label spec:business (superseded for the pilot by cybrilla-production-letter.md) | exported 2026-09-28 -->

# Deliverable 1: Cybrilla written-confirmation questionnaire (ready to send Mon 2026-09-28)

**To:** customerservice@cybrilla.com
**Cc:** fpsupport@cybrilla.com; poa.support@cybrilla.com
**Subject:** Written confirmation request: tenant `platizio`, cybrillapoa (ONDC) gateway, production, ARN distributor, B2C execution-only Regular plans

Dear Cybrilla / FintechPrimitives team,

Platizio is an AMFI-registered Mutual Fund Distributor and holds the ARN. We are building **Sanchay**, a self-directed app for retail investors in India on web, Android and iOS. It will run on your FP APIs through the **cybrillapoa (ONDC) gateway**, under tenant **`platizio`**, in **production**.

**Our operating model:**
- Every order is started by the investor and is execution-only. We give no advice.
- We sell **Regular plans only**, and only the **Growth option** at launch.
- There are no sub-brokers, no relationship managers and no partner objects.
- EUIN is left blank. The investor's execution-only declaration is captured with OTP consent.
- We need **monthly SIP only**. Quarterly and other frequencies are not needed.
- We collect no money ourselves. All money moves on your payment and mandate rails.

**Our planned milestones:**
- Sandbox product demo 1: February 2027.
- Sandbox product demo 2: May 2027.
- Production credentials: needed by **25 June 2027 at the latest**.
- Invite-only real-money pilot: from 19 July 2027.
- Public launch: 16 August 2027.

We can only switch on a feature for real money once we have your written confirmation or evidence from production. Some answers decide our launch scope. For that reason:
- **Please answer the questions marked [Priority] by Friday 9 October 2026.**
- **Please answer all other questions by Friday 16 October 2026.**

**How to answer.** Please reply per question number with:
1. Supported on cybrillapoa **production** for tenant `platizio`: Yes / No / Beta / Roadmap (with a date).
2. The endpoint and field names, plus a documentation link.
3. Any per-tenant enablement we must request.
4. Any difference between sandbox and production.

We are happy to join a call in the week of 5 October to go through the list.

---

### Section 1. Tenant, go-live and environments

**1. [Priority] Go-live checklist and demo scope.**
- Please send the current production go-live checklist for a cybrillapoa ARN tenant. We understand it covers the ONDC portal signup with our ARN, the POA agreement eSign, the product demo(s), the RTA mailback subscription and anything else. Please include the order of steps and the typical elapsed time for each.
- Can the demo be split into two parts?
  - February 2027: onboarding, lumpsum, payments and webhooks.
  - May 2027: SIP with mandates, SIP management, redemption, switch, STP and SWP.
- Why we ask: we plan backwards from production credentials on 25 June 2027, and the approval must cover every flow we launch.
- If no: we hold one full demo in May 2027 and ask for approval by 4 June 2027. Any flow the approval does not cover stays switched off for real money.

**2. [Priority] ONDC registration.** Does Platizio need its own ONDC buyer-network-participant registration, or does Cybrilla POA's registration cover us as the ARN distributor?
- Why we ask: a separate registration and certification would be a multi-month workstream that is not in our plan.
- If we must register ourselves: our product owner re-plans the launch date. We would need your certification support and a timeline.

**3. [Priority] Sandbox vs production parity.** For every capability in Sections 5–13 that works in sandbox, can you confirm in writing that it is enabled for `platizio` on cybrillapoa production? Which features are "on-demand" and need a separate request (for example UPI Autopay)?
- Why we ask: we switch a feature on for real money only with production evidence or your written parity statement.
- If no: each feature stays off in production until our founders' small real-money test orders prove it.

**4. Network controls.**
- Do you require IP allowlisting of our production egress IPs? These are a small fixed set of Elastic IPs in AWS Mumbai (ap-south-1). What is the lead time?
- Do you publish fixed source IP ranges for webhooks and for payment and KYC postbacks?
- Is mTLS or request signing required on production API calls?
- Why we ask: our FP credentials sit only on a backend worker behind fixed NAT IPs, and we want a network check in both directions.
- If no: we rely on OAuth credentials, webhook signature checks and re-fetching every object before acting.

**5. Authentication and rotation.**
- Please confirm the production token endpoints and audiences: `/v2/auth/platizio/token` for FP and `/v2/auth/cybrillarta/token` for POA.
- Please confirm the token lifetime (we understand 1800 s).
- Is `x-tenant-id` required in production on `/v2/*`, `/api/*` and `/transactions`, and with what value?
- How do we rotate credentials urgently? Can two secrets be valid at the same time during a rotation?
- If there is no overlap: we rotate in a pre-announced maintenance window.

**6. IPv6 `user_ip`.** `user_ip` is documented as IPv4 (n.n.n.n). Will production accept an IPv6 address? If not, what should we send for investors on IPv6-only mobile networks?
- Why we ask: we always send the investor's real IP, never a placeholder.
- If no: our app and API edge stay IPv4-only, and an investor who can only reach us over IPv6 sees an error.

**7. Rate limits.** Please confirm the production limits: 100 reads and 100 writes per second, 20 per second on list endpoints, and 6 weeks' notice for an increase. Are these per tenant?
- If they differ: we re-size our reconciliation jobs.

**8. Hosted pages and callback URLs.**
- Which hosts will the investor pass through on your hosted pages: netbanking `token_url`, UPI, eNACH / UPI mandate authorisation, DigiLocker and eSign?
- Must our postback and callback URLs be registered or whitelisted in advance? Our production hosts:
  - `api.sanchay.in`: API; postbacks under `/v1/pg/return/` and `/v1/kyc/return/`; webhooks at `/webhooks/fp`.
  - `sanchay.in`: investor web.
- Why we ask: we run a strict Content-Security-Policy and verified app links.
- If there is no list: we take the hosts from sandbox and production smoke tests.

### Section 2. Distributor tagging: ARN, EUIN and execution-only

**9. [Priority] ARN attribution.** We understand the ARN is attached at tenant level at ONDC signup and that no order carries an ARN field.
- Please confirm that the ARN reaches the RTA/AMC on every lumpsum, redemption, switch, SIP/STP/SWP registration and every instalment (for example in `fulfillment.agent.organization.creds`).
- Can we see it in any API response or report, for audit evidence?
- Why we ask: ARN attribution is a gate before we take real money.
- If no: we file your written confirmation together with RTA mailback evidence per folio.

**10. [Priority] Blank EUIN.** We will leave out `euin` and `partner` on every order and plan.
- Please confirm that the ONDC message and the AMC/RTA record then show a **blank** EUIN. It must never be filled from a default EUIN registered at signup. Your API examples show an EUIN on orders that have no partner.
- Why we ask: an auto-filled EUIN would wrongly show advice on 100% of our orders.
- If it is auto-filled: we need a tenant setting that turns this off before any real order. Without it we cannot start real-money operations.

**11. [Priority] Execution-only declaration.**
- Is there a field, tag or flag in FP or ONDC FIS14 for the investor's execution-only declaration when EUIN is blank?
- Does FP store it or pass it to the RTA/AMC?
- What evidence will Cybrilla or the AMCs ask us for, and in what format?
- Why we ask: AMFI requires a separately signed execution-only declaration. We capture it with OTP consent and keep evidence for each order for 8 years.
- If there is no field: we keep the declaration and OTP evidence ourselves and supply a per-order evidence PDF on request.

**12. Partner set-up.** We have one platform ARN, no sub-brokers and no EUIN holders.
- Do we need to create any `partner` object (`default_broker_codes`, `euins[]`)?
- Do you check ARN validity or KYD?
- How is an ARN renewal reflected on the tenant?
- If a partner object is needed: we create it once, through our maker-checker configuration.

**13. Channel fields.**
- Can we send `initiated_by=investor` and `initiated_via` (`web`, `mobile_web`, `mobile_app_android`, `mobile_app_ios`) on purchases, redemptions, switches and on every plan create on ONDC? Our earlier integration found `gateway` and `initiated_via` rejected on plan creates.
- Is `gateway` inferred for ONDC plans and switches?
- If no: we record the channel only on our side.

### Section 3. SEBI 2FA and consent ownership

**14. [Priority] Who sends the 2FA.** We send the OTP ourselves, by SMS to the registered mobile and by email to the registered email, and then pass `consent{email, isd_code, mobile}`.
- Is that accepted as the SEBI 2FA for purchase, redemption, switch, SIP/STP/SWP registration and plan modification?
- Or will FP, the AMC or the RTA also send the investor their own OTP or email link? If so, what does it look like, and must the investor act on it?
- Why we ask: the answer decides our consent screens, investor copy and OTP autofill.
- If you or the AMC also send one: we design the flow around it. We stop sending ours for a step only if you confirm yours replaces it.

**15. [Priority] Where the OTP must go.**
- Must the OTP go to the contact registered on the folio at the RTA, or to the FP investor-profile contact?
- For an existing folio whose contacts differ, what do you validate, and what error code do you return?
- Is `GET /v2/mf_folios` (`email_addresses[]`, `mobile_numbers[]`) authoritative for ONDC folios, and how fresh is it?
- Why we ask: our consent engine sends OTPs only to folio-registered contacts.
- If you do not validate: we still send only to the folio contacts, refreshed within 24 hours.

**16. [Priority] Consent scope and timing.**
- Is consent needed for each SIP/STP/SWP instalment, or only at registration?
- Do plan modification instructions, skip instructions, skip cancellations and plan cancellations each need fresh consent?
- For a new folio, must the consent also cover the nomination details or the opt-out?
- If no rule applies: we still take a fresh OTP for every change. That is our default.

**17. Consent evidence and recovery.**
- What consent evidence must we keep (OTP time, IP, device, channel), and for how long?
- Will you or the AMCs ever ask for it?
- Consent cannot be changed once it is set. If our consent PATCH times out after the investor approved, what is the recovery path?
- If there is no rule: we keep encrypted evidence for 8 years after account closure, and re-fetch before any retry.

### Section 4. Onboarding and KYC

**18. [Priority] KYC path.**
- Our sandbox tenant got `403 "Partner not allowed"` on `/poa/kyc_forms`. Will `platizio` have access to `/poa/kyc_forms` and `/poa/pre_verifications` in sandbox and in production?
- Is the chain `/v2/kyc_requests` → `/v2/identity_documents` → `/v2/esigns` still supported on cybrillapoa?
- Why we ask: we will build only one KYC path, and we choose it on 9 October 2026.
- If `kyc_forms` is not available: we build the `kyc_requests` chain.

**19. Capture requirements.** Please confirm:
- no live photo or in-person verification is needed when KYC uses Aadhaar DigiLocker plus eSign;
- we send `geo_location`, and it must be inside India;
- the wet signature is uploaded through `/poa/kyc_forms/:id/signature`;
- whether any readiness code needs video IPV in production.
- If a photo or IPV is needed: we add a camera capture step and update our store privacy declarations.

**20. KYC user agency.** On this route, which entity is the KYC user agency for the KRA/CKYC upload, Aadhaar e-KYC and eSign: Cybrilla POA, the AMC/RTA, or a KRA member? Can you share the contractual allocation for our counsel?
- If this is unclear: our counsel's review blocks real-money launch until it is resolved.

**21. Event names.** Can these be subscribed to through `/v2/notification_webhooks` on cybrillapoa: `mf_purchase.review_completed`, `mf_redemption.review_completed`, `pre_verification.accepted` / `.completed`, and `kyc_form.*`? If yes, under exactly which names?
- If no: we poll those objects.

### Section 5. Nomination (SEBI circular SEBI/HO/OIAE/OIAE_IAD-3/P/CIR/2026/12676, 29-May-2026, effective 01-Sep-2026)

**22. [Priority] Maximum nominees.** Please confirm that `folio_defaults.nominee1..3` (three nominees) is the production maximum. It matches the circular's limit of 3.
- If it is lower: we disclose the limit in the app after our counsel signs off.

**23. [Priority] Mandatory fields.** Your docs list as "upcoming mandatory" the identity proof for adult nominees (`nomineeN_identity_proof_type`) and the guardian's ID, contact and address. Under the circular, only name and relationship are mandatory. Date of birth is mandatory only for a minor nominee. ID, contact details, percentage share and guardian details are optional.
- Has FP been aligned with the circular? From what production date?
- Exactly which nominee fields will FP reject if they are missing?
- If FP is not aligned: our counsel decides whether we may ask for FP-required fields. Folio opening for affected investors is escalated to our product owner.

**24. Opt-out and statement display.**
- Please confirm that an opt-out is represented by sending no nominees in `folio_defaults`. Does the RTA receive an explicit opt-out indicator?
- Is `nominations_info_visibility` (`show_all_nominee_names` / `show_nomination_status`, the Annexure-A item 2 choice) available in production?
- If no: we keep the Annexure-B opt-out evidence ourselves, and we tell the investor that the statement display choice cannot yet be sent.

**25. Related-party rules.** Please confirm:
- `name`: at most 40 characters, letters and spaces only;
- `guardian_name`: at most 35 characters;
- the `relationship` enum;
- that related parties are immutable;
- that allocation percentages must be integers totalling 100;
- what FP does when no percentage is sent. The circular says split equally, with any odd lot going to the first nominee.
- If integers only: we send 34/33/33, with the remainder going to nominee 1.

### Section 6. Lumpsum purchases, payments and refunds

**26. Payment sequence.** We plan to use the payment-after-submission flow: consent PATCH → confirm → `submitted` → create payment, with retries while the order is `submitted`.
- Is this supported on production cybrillapoa?
- Until when can a payment be retried before the order expires?
- Please confirm that a failed payment never fails the order.
- If only custom checkout (payment before confirm) is supported: a retry needs a new order and a fresh investor OTP.

**27. Duplicate-payment guard.** `POST /api/pg/payments/netbanking` does not check for existing payments.
- Does `GET /api/pg/payments?amc_order_ids=` show PENDING / SUCCESS / INITIATED / APPROVED within seconds, so we can check before creating a payment?
- Can we fetch purchases, redemptions, switches, plans and plan modifications by `source_ref_id`?
- Which error code does a duplicate `source_ref_id` return?
- If no: we add a waiting period and match on account-level lists.

**28. UPI.** Please confirm:
- `upi.type` is lowercase `uri` / `collect`;
- the production per-payment UPI limit for MF purchases (₹5,00,000 capital-market P2M, or lower);
- whether collect is still supported;
- that the intent URI arrives through `payment.updated`;
- that only one payment method is allowed per order;
- that TPV is enforced against `bank_account_id`;
- the descriptor investors see ("Cybrilla").
- If the limit is ₹1,00,000: we hide UPI above that amount.

**29. Abandoned unpaid orders.**
- How do we withdraw an ONDC purchase the investor abandons after submission? Cancel is documented as RTA-only.
- Does the order auto-expire (T+7 working days after cut-off)?
- What happens to a late payment (`late_auth`)?
- If there is no cancel: we rely on expiry, and route any late money to the refund path.

**30. Refunds.** Which fields and states describe refunds (`refund_*`, `late_auth`) in each of these cases?
- failed or rejected purchases;
- TPV failures (payment from an unregistered account);
- excess debits;
- reversed orders.

For each case: who starts the refund, what is the SLA, which reference (UTR) is returned, and is there a webhook event?
- If there are no fields: we mark such orders "failed, money debited", send them to ops reconciliation, show no refund date, and raise an internal grievance after 5 working days.

### Section 7. Mandates and SIP registration (monthly only)

**31. [Priority] UPI Autopay.** Is UPI Autopay enabled for `platizio` on cybrillapoa in sandbox and in production, or can it be? Please also confirm:
- the `mandate_type` value and its case (`UPI` or `upi`);
- the ₹1,00,000 limit;
- the ₹1 authorisation debit and its refund;
- the underlying provider behaviour (per-transaction or per-day cap);
- the typical time to APPROVED.
- If no: UPI Autopay becomes a launch-scope decision for our product owner (wait for your date, or formally drop it). We will not present eNACH as UPI Autopay.

**32. eNACH.** Please confirm:
- typical production time from CREATED to APPROVED;
- the authorisation modes (netbanking, debit card);
- the maximum limit (₹1 crore);
- the default `valid_to`;
- that one mandate can fund several SIPs, with one debit per SIP;
- whether you check limit headroom across SIPs.
- If headroom is not checked: we enforce it ourselves.

**33. SIP schedule.** Please confirm:
- `installment_day` must be 1–28;
- there must be at least one day between registration and the first instalment;
- whether `generate_first_installment_now` works on ONDC plans. Your API reference says no; your mandate use-case page says yes.
- If it does not: the first instalment falls on the next eligible date. "Invest today" becomes a separate lumpsum with its own consent.

**34. Mandate cancelled outside the app.** When the investor cancels a mandate at their bank or UPI app:
- which event do we receive?
- what happens to the linked SIPs?

Also:
- Can a live SIP's mandate be replaced through `mf_plan_modification_instructions` (`payment_method`, `payment_source`)?
- Is the "once per plan" limit firm?
- If it is once only: after a second revocation, the investor must cancel the SIP and register a new one.

**35. Auto-cancellation.** Please confirm that a monthly SIP auto-cancels after 3 consecutive failed instalments, and whether skipped instalments count towards that limit.
- If skips count: we cap pauses so that a pause plus one failure can never reach the limit.

### Section 8. SIP management

**36. [Priority] Pause / skip.** Your API reference says skip instructions are RTA-only. Your POA capabilities list "Skip an installment" for ONDC folios.
- Is `POST /v2/mf_purchase_plans/:id/skip_instructions` supported on cybrillapoa production?
- What are the maximum pause length, the maximum number of skip instructions per plan and the minimum lead time?
- If no: SIP pause becomes a launch-scope decision for our product owner. We will not present cancel-and-restart as "pause".

**37. [Priority] One-off SIP amount change.** Please confirm:
- `mf_plan_modification_instructions {plan, amount, consent}` works on ONDC for active SIPs;
- the lead time before the next instalment;
- the limits relative to the mandate limit;
- when the change takes effect.
- If no: this becomes a launch-scope decision for our product owner.

**38. [Priority] Annual step-up.** Is there a native step-up field on ONDC SIPs? If not, may we do the step-up ourselves by creating one plan modification instruction a year (5 business days before the anniversary instalment)? If we may, could that use consent captured when the investor set up the step-up, or does each yearly change need a fresh OTP at that moment?
- If neither: we launch with one-off amount changes only. Annual step-up becomes a formal scope amendment for our product owner.

**39. Cancellation.** Please confirm:
- `POST /v2/mf_purchase_plans/cancel` takes effect immediately;
- the cancellation codes;
- whether an instalment due within the next 2 working days can still be debited.
- If it can: our copy says so on the cancel screen.

### Section 9. Redemption

**40. [Priority] Redeem by units.** Your API reference says redemption by units is RTA-only. Your POA capabilities say units, amount and "redeem all" all work on ONDC. Which is true in production? Please also confirm the unit precision (3 dp) and multiples.
- If no: we launch with redemption by amount and "redeem all". Redeem-by-units becomes a scope decision for our product owner.

**41. Redeem all.** When neither amount nor units is sent:
- are ELSS lock-in units excluded?
- what happens to unallotted or in-process units in the folio?
- If locked units cause a rejection: we send the unlocked amount and offer a one-tap "redeem remaining" action.

**42. Redeemable units.**
- Is `redeemable_units` in the holdings report available for ONDC folios?
- Does it exclude locked ELSS units and units under lien?
- If no: we calculate redeemable units from our own ledger and reconcile with the RTA feeds.

**43. Payout evidence.**
- Which fields report the redemption and SWP payout (bank credit reference, UTR, date)?
- Please confirm the payout always goes to the folio's registered bank at the RTA.
- If there are no fields: we show "expected by", and confirm credit from the RTA mailback.

**44. Folio scope.**
- Please confirm that redemptions and switches work only on folios created through the ONDC gateway.
- If the investor already holds a folio at the same AMC (opened elsewhere), does a new purchase create a new folio or reuse that one?

### Section 10. Switch, STP and SWP

**45. [Priority] Switch.** Your switch object lists `gateway: rta` only, while your capability pages list switch as supported on ONDC.
- Does `/v2/mf_switches` work on cybrillapoa production (same AMC, same folio; amount, units or all)?
- How is the switch-in NAV date determined?
- If no: switch becomes a scope decision for our product owner.

**46. [Priority] STP and SWP.** Are `/v2/mf_switch_plans` (STP) and `/v2/mf_redemption_plans` (SWP) supported on cybrillapoa production? Monthly frequency is enough for us. Your "Plan Mode" note says only purchase plans are supported on ONDC. Is that note out of date?
- If no: STP and SWP become scope decisions for our product owner.

**47. STP/SWP changes.** On ONDC, can STP/SWP instalments be skipped, and can their amounts be changed with plan modification instructions?
- If no: investors can cancel and re-register, and we label this honestly.

**48. Partial switch failure.** If the switch-out succeeds but the switch-in fails, what happens to the money, and which state or event reports it?
- If nothing reports it: we raise an ops case when there is no switch-in by the payout date plus 1 working day.

**49. Thresholds.** Where are these exposed, and does FP enforce them?
- switch-in / switch-out minimums;
- STP/SWP instalment minimums and allowed dates (for example `stp_frequency_specific_data`, `swp_frequency_specific_data`).
- If FP does not enforce them: we enforce them from the scheme master and our curated data.

### Section 11. Allotment data

**50. [Priority] Allotted units.**
- For a lumpsum purchase, a SIP instalment and a switch-in on ONDC, are `allotted_units`, `allotted_nav_date` and the NAV fields populated no later than state `successful`?
- If they can be empty at `successful`, which field, event or report provides them, and when?
- If this is not reliable: the investor sees "units being confirmed" until the RTA feed confirms the units, and we never show estimated units as final.

**51. Reversals.** When can a `successful` order become `reversed`? Which event reports it, and how are units and money handled?

### Section 12. Webhooks

**52. [Priority] Signature.**
- For production tenant `platizio`, is webhook authentication the `FP-Signature` HMAC-SHA256 (`id:signature`) or a shared header secret?
- Is HMAC out of beta, and is it enabled on cybrillapoa?
- Is the signed input the raw request body or re-serialised JSON?
- If it is a shared secret only: we verify it in constant time, re-fetch every object before acting, and add an IP allowlist if you publish source ranges.

**53. Keys and replay.**
- How do we rotate the webhook key? Can old and new key ids overlap during rotation?
- Is there a timestamp or nonce we can use against replay?
- If not: we protect against replay with persistent event-id de-duplication.

**54. Delivery guarantees.**
- What are the retry schedule, timeout and maximum number of attempts?
- Is the event id unique and stable across retries?
- How can we replay missed events?
- Are the `GET /v2/events` filters `fp_object_id`, `from_date` and `to_date` supported?

**55. Event list.** Please send the full list of subscribable events for cybrillapoa. It should cover plans, instalments, skip instructions, plan modifications, mandates, payments, refunds, switches, KYC forms, pre-verifications and folio changes.

### Section 13. Holdings, folios, reports and reconciliation

**56. [Priority] Holdings.**
- Are `/api/oms/reports/holdings` and `investment_accounts/:id/holdings` populated for ONDC folios in our tenant? From what source, and how fresh?
- Is the `mf_investments` holdings snapshot available on cybrillapoa after the AMFI directive of 19 September 2025?
- Does it cover folios opened outside FP?
- If no: holdings come from our own order ledger and are reconciled against CAMS/KFintech mailback feeds.

**57. RTA mailback.**
- Do you receive the CAMS and KFintech mailback feeds for our ARN, or must we subscribe separately?
- Can you help us obtain sample files from folios already under our ARN?

**58. Tenant-wide reports.** Please confirm the tenant-level list endpoints and their date filters, for example `/v2/mf_purchases/reports/mf_purchase_list`, `/v2/mf_redemptions/reports/mf_redemption_list`, and the switch and plan lists.
- Why we ask: every day we reconcile every object created under our tenant.
- If they are not available: we reconcile per account and flag a residual risk.

**59. Transactions and capital gains.**
- Are the transaction and capital-gains reports available for ONDC folios?
- What is the correct capital-gains path: `POST /v2/transactions/reports/capital_gains` or `GET .../transaction_wise_capital_gain_loss_report`?
- If they are not available: we compute gains from our own ledger only.

**60. RTA CAS fetch.** Is RTA CAS fetch (`/advisory/fetch-rta-cas/`) available to ARN tenants?
- If no: nothing is needed. At launch the investor uploads their own CAS.

### Section 14. Folio maintenance after onboarding

**61. Nominee change on an existing folio.** Is there an API, including opt-out and the 29-May-2026 format?

**62. Change of payout bank.** Is there an API? Which documents are needed, and what cooling period applies? We assume 10 days.

**63. Mobile / email change.** Does the API update the RTA folio, or only the FP profile?

**64. KYC modification.** Can a KYC modification go to the KRA through FP?

**65. Unsupported changes.** For anything above that is not supported, what is the prescribed physical or ops route? Is a wet signature required? Is MF Central the expected channel?

- Why we ask (61–65): investors expect to maintain their folios in the app.
- If there is no API: we guide investors to MF Central, offer an ops-assisted RTA request, and show "updated" only after the RTA confirms.

### Section 15. Money flow and agreements

**66. Payment aggregator and escrow.** Please share, for our counsel:
- the RBI Payment Aggregator status of the payment route;
- the escrow or nodal flow;
- confirmation that investor money moves from the investor's account to the scheme account with no pooling (SEBI MF Master Circular ¶17.3).
- If this is not documented: real-money launch waits for written confirmation.

**67. AMC agreements.**
- Does your arrangement satisfy the "service agreement between the AMC and the platform" requirement (Master Circular ¶17.3.2) for our transactions, or must Platizio sign its own agreement with each AMC?
- Which AMCs are live on cybrillapoa production?
- If we must sign our own: we start AMC agreements now.

### Section 16. Sandbox test data

**68. Time-based flows.** Does the sandbox offer time-travel or simulation endpoints for these events?
- SIP instalments and skip windows;
- STP/SWP instalments;
- mandate approval and external cancellation;
- allotment, payout and reversal;
- refunds and `late_auth`.

**69. Test data.** Please confirm:
- current test PAN patterns for POA pre-verification and for FP;
- bank-account suffixes;
- scheme coverage (is it still only ABSL and ICICI Prudential?);
- whether a switch and an STP between two schemes of one AMC can be tested;
- whether folios and holdings are simulated after successful orders.

**70. Sandbox webhooks and reset.**
- Are sandbox webhooks signed the same way as production?
- How can we reset a test investor, given there is no profile DELETE?

**71. UAT.** Is there a UAT or pre-production environment with real rails but non-live settlement? If not, do you agree with a founders' pilot of small real orders (₹500 lumpsum and SIP)?

### Section 17. Data protection and security

**72. DPA.** Please share your standard DPA. Please confirm that you act as Platizio's processor and cover:
- data residency in India;
- your sub-processor list;
- breach notification to us within 6 hours;
- help with investor rights requests within 5 business days;
- an erasure or return certificate at the end;
- audit rights.

**73. Support and incidents.** Please send:
- your 24x7 production incident contact;
- the escalation matrix and SLAs;
- your status page;
- how you give notice of maintenance.

**74. Credential compromise.** What is the urgent revocation and rotation procedure, and can we get access logs for our tenant credentials?

Thank you. We appreciate written answers, because they become part of our compliance evidence.

Platizio - Sanchay product team

---

### Internal appendix (do not send): question crosswalk

These source IDs come from the design's list (Q-C1..Q-C14), the roadmap and review additions (Q-C15..Q-C17), the S0 probes, GAP-02, the PO decisions and gates G1–G11. The design names P-01, P-03..P-07, P-09..P-12 and P-14. **It does not define P-02, P-08 or P-13; the numbers below are proposed here and must be confirmed in `tools/fp-probes`.**

| Q# | Source IDs | Gate / decision |
|---|---|---|
| 1 | Q-C17 (DLV-14), R.6 | G7 |
| 2 | Q-C15 | PO escalation 10-16 |
| 3 | Q-C16 (DLV-12) | G9 |
| 4, 5 | Q-C14, R18 | G7 |
| 6 | Q-C7, P-06 | edge IPv4/IPv6 |
| 8 | P-01 (redirect hosts → CSP form-action) | — |
| 9 | Q-C8, P-05, GAP-02 B2–B3 | G6 |
| 10, 11 | Q-C1, P-04, GAP-02 B1 | G2 |
| 14–17 | GAP-02 A1–A4, OI-7 | STORES A4 conflict |
| 18, 21 | Q-C6, Q-C3, P-03 | KYC adapter choice 10-09 |
| 20 | OI-4, A4 | — |
| 22–25 | Q-C13, P-11, GAP-04, PO-7 | — |
| 26–30 | P-13 (proposed: refunds / late_auth / TPV), GAP-02 G1, GAP-01 | — |
| 31–35 | Q-C5, P-02 (proposed: UPI Autopay / eNACH lifecycle), Q-C2 | PO-2 |
| 36–39 | Q-C2, P-09, GAP-02 E1–E3, PO-6 | PO-2, G9 |
| 40–44 | Q-C2, P-09, Q-C10 | PO-2 |
| 45–49 | Q-C2, P-09, GAP-02 E4, GAP-10 | PO-2 |
| 50, 51 | Q-C12, P-07 | G5 |
| 52–55 | Q-C4, Q-C3, P-08 (proposed: signature / events / retries), GAP-02 C1–C3 | P0-16 webhook work |
| 56–60 | Q-C10, P-12, P-14, GAP-02 F1 | G4 |
| 61–65 | Q-C9, P-10, GAP-02 D1–D5 | folio service requests |
| 66, 67 | Q-C11, OI-5 | G3 |
| 68–71 | DLV-12 time-travel, v1 sandbox notes | S0 probes |
| 72–74 | PRIVACY §9.2 | G10 |

Launch-blocking per GAP-02: Q14–16, Q9–10 and Q52 must be answered **in writing** before real money moves.

---

# Deliverable 2: Business actions checklist (non-engineering)

**Calendar basis:** plan of record under PO-4. Sprints start Mon 2026-09-28.
- The draft roadmap's recomputation (P80 2027-08-30) was not adopted.
- Re-issue these dates after the S2 re-baseline on Fri 2026-11-06 if P80 moves.
- No due date falls on a gazetted holiday: 10-02, 10-20, 11-24, 12-25, 01-26, 03-10, 03-23, 03-26, 04-15, 04-19, 05-17, 05-20, 06-16.

| Sprint | Dates | Milestone |
|---|---|---|
| S0 | 09-28 → 10-09 | Questionnaire sent 09-28; probe readout Fri 10-09; PO-2 decision Fri 10-16 |
| S1 / S2 | 10-12 → 11-06 | Walking skeleton Fri 11-06 (SMS login needs DLT); velocity re-baseline |
| S3–S7 | 11-09 → 01-15 | FP gateway, consent, KYC, provisioning, fund-facts curation |
| S8 | 01-18 → 01-29 | R0 public SEO ≥ Fri 01-29 (on counsel OI-2) |
| S11 | 03-01 → 03-12 | **R1 internal alpha Fri 03-12** (≈8 staff, sandbox) |
| S18 | 06-07 → 06-18 | **R2 closed beta, sandbox, Fri 06-18** (~25 staff and ops) |
| S19 | 06-21 → 07-02 | FP production cutover (credentials by Fri 06-25) |
| S20 | 07-05 → 07-16 | **Real-money go/no-go G1–G10 Fri 07-16**, then founders' ₹500 orders |
| S21 | 07-19 → 07-30 | **R3 closed beta with real money (pilot, ≤50 invitees) from Mon 07-19** |
| S22 | 08-02 → 08-13 | **Public go/no-go (G1–G11) Fri 08-13** |
| R4 | Mon 2027-08-16 | Public launch on web, Android and iOS |

**Owner roles:**
- DIR: director / authorised signatory of Platizio
- PO: product owner
- CO: Compliance Officer
- COUNSEL: external securities and privacy counsel
- CA: chartered accountant
- OPS: ops lead
- FIN: finance / admin
- DEV-A: backend / FP developer
- DEV-B: UI / infra / CI developer

**Gate column** (the latest milestone the item must be done by):
- S = unblocks a sprint
- A = alpha 03-12
- B = sandbox beta 06-18
- P = real-money closed beta (go/no-go 07-16)
- L = public launch (go/no-go 08-13)

### 1. Governance and kickoff

| ID | Action | Owner | Due | Depends on | Evidence of done | Gate |
|---|---|---|---|---|---|---|
| BA-01 | Confirm the office holiday list and named planned leave for both developers; freeze the sprint calendar | PO | Wed 09-30 | — | Calendar and leave register filed with the roadmap | S |
| BA-02 | Engage external counsel (MF distribution, DPDP / IT Act, trademark). Scope: OI-1..OI-17, T&C, privacy, CAS, nomination | PO/DIR | Thu 10-01 | — | Signed engagement letter listing each OI item with its due date | S |
| BA-03 | Appoint an internal Compliance Officer: owns grievances, the risk questionnaire, template approvals and the COMPLIANCE checker role | DIR | Fri 10-09 | — | Board resolution / appointment letter; name in the admin RBAC seed | S |
| BA-04 | PO-2 decision for every capability the probes and Cybrilla did not prove: prove, wait, or sign an amendment. No silent hiding | PO | Fri 10-16 | BA-12, probe readout 10-09 | Signed decision record per capability | G9 |
| BA-05 | Accept the S2 velocity re-baseline; re-issue this checklist if P80 moves | PO | Fri 11-06 | S0–S2 actuals | Signed re-baseline note | S |
| BA-06 | Trademark clearance for "Sanchay" in classes 36, 9 and 42. **Risk: insurance products are already sold under "Sanchay" (e.g. HDFC Life Sanchay Plus).** Get a counsel opinion on class-36 conflict; if the opinion is adverse, the PO decides on a rename by Fri 11-13, before store accounts and DLT headers are fixed | COUNSEL/PO | Opinion Fri 10-16; TM-A filing Fri 10-30 | BA-02 | Search report, written opinion, filing receipt | L (decision by S2) |
| BA-07 | Engage a CA: scheme tax classes (ITA 2025) and statement wording (OI-8, OI-11, OI-12) | PO/CA | Engaged Tue 12-01; first 100 schemes Fri 01-22; wording Fri 02-26 | BA-23 | Signed tax-class CSV; wording memo | A |

### 2. Cybrilla / FP

| ID | Action | Owner | Due | Depends on | Evidence of done | Gate |
|---|---|---|---|---|---|---|
| BA-10 | Send Deliverable 1 (without the internal appendix) | PO | Mon 09-28 | — | Sent mail plus Cybrilla ticket number | S |
| BA-11 | Confirm the sandbox tenant: both token audiences (FP and POA) work, sandbox webhook secret issued, UPI Autopay enablement requested | DEV-A/PO | Thu 10-01 | BA-10 | Successful token calls in the probe log; secret in nonprod Secrets Manager | S |
| BA-12 | Written answers: [Priority] by Fri 10-09, the rest by Fri 10-16. Follow-up call every Monday until everything is closed | PO | 10-09 / 10-16 | BA-10 | Answers filed in `docs/probes/` and the regulatory-sources register with mail references | PO-2 |
| BA-13 | ONDC portal signup with Platizio's ARN. If Q2 says Platizio needs its own buyer-NP registration, escalate to the PO the same day | DIR/PO | Submit Fri 10-23; confirmed Fri 11-20 | BA-20 | ONDC confirmation naming Platizio and the ARN | P |
| BA-14 | eSign the POA agreement; counsel reviews the KYC user-agency allocation (OI-4) | DIR/COUNSEL | Fri 11-20 | BA-13 | Executed agreement; OI-4 note | A |
| BA-15 | CAMS and KFintech mailback subscriptions (transaction and holding feeds) for the ARN; sample files from existing ARN folios | OPS | Request Tue 09-29; samples Fri 12-18; automated drop Fri 04-23 | BA-20 | RTA confirmations; samples used as fixtures; daily receipt log | G4 (P) |
| BA-16 | Cybrilla product demo 1: onboarding, lumpsum, payments, webhooks | PO/DEV-A | Fri 02-12 | Sandbox build S9 | Cybrilla written demo sign-off | B |
| BA-17 | Cybrilla product demo 2: SIP and mandates, SIP management, redemption, switch/STP/SWP | PO/DEV-A | Fri 05-21 | S15–S16 build | Written sign-off | B |
| BA-18 | Production approval and credentials: request Fri 05-21; approval target Fri 06-04; production credentials (both audiences) and webhook secret **no later than Fri 06-25**. Received only through Cybrilla's secure channel | PO | 06-04 / 06-25 | BA-16, BA-17, BA-51 | Credentials in prod Secrets Manager (worker role only); receipt mail | G7 (P) |
| BA-19 | Send the production NAT Elastic IPs for allowlisting; register the `https://api.sanchay.in/webhooks/fp` subscriptions | DEV-B/PO | Send Fri 06-25; confirmed Fri 07-09 | BA-51 | Cybrilla confirmation; read-only production probe run id | G7 (P) |
| BA-19a | File the written gate confirmations: Q-C1 EUIN (G2) by Fri 12-18; Q-C11 PA / escrow / AMC agreements (G3) by Fri 07-09; per-capability production parity (G9) by Fri 07-09 | PO | as stated | BA-12 | Letters or mails in the gate binder | P |
| BA-19b | Cybrilla DPA: processor terms, India residency, breach notice ≤ 6 h, sub-processors, erasure certificate | COUNSEL/DIR | Fri 06-04 (hard Fri 07-16) | Q72 | Executed DPA | G10 (B/P) |
| BA-19c | Cybrilla production escalation matrix and 24x7 incident contacts | OPS | Fri 07-09 | BA-18 | Matrix in the runbook | P |

### 3. AMFI, ARN and AMCs

| ID | Action | Owner | Due | Depends on | Evidence of done | Gate |
|---|---|---|---|---|---|---|
| BA-20 | Check the ARN: validity date, KYD status, linked certified individuals. If it expires before 31-Dec-2027, start renewal now | CO | Fri 10-09 | — | ARN certificate showing validity; KYD acknowledgement; renewal plan if needed | S |
| BA-21 | ARN renewal (only if BA-20 requires it), under AMFI's current procedure (certification / CPE of the named individuals), at least 90 days before expiry | CO | Earlier of Fri 04-30 or expiry −90 days | BA-20 | Renewed certificate; PLATFORM_ARN updated through maker-checker | P |
| BA-22 | EUIN contingency: if OI-1 (12-18) is not an unconditional yes to blank EUIN on 100% of orders, enrol a named employee for NISM Series V-A and obtain an EUIN | CO | Enrol Fri 01-15; EUIN by Wed 03-31 | BA-77 (OI-1) | NISM certificate and EUIN letter, or the counsel memo making them unnecessary | G2 (P) |
| BA-23 | AMC empanelment of the ARN: target list covering ≥150 Regular-plan Growth schemes | OPS/CO | First AMCs Fri 01-15; full list Fri 02-26 | BA-20 | Empanelment register (AMC, date, reference) | A |
| BA-24 | AMC commission rate cards (trail-only brokerage letters) for every empanelled AMC. OPS loads each as DRAFT and CO publishes. **No published card means the scheme cannot be enabled.** Refresh on every new letter | OPS (maker) / CO (checker) | First AMCs Fri 01-15; all Fri 02-26 | BA-23 | Source letters with hash; PUBLISHED cards; `/commission-disclosure` on staging | A |
| BA-25 | AMC service-agreement position (MC ¶17.3.2) with counsel OI-5; sign direct AMC agreements where Cybrilla's route does not cover them | DIR/COUNSEL | OI-5 Fri 12-18; agreements Fri 06-18 | Q67 | Counsel memo; executed agreements | G3 (P) |
| BA-26 | AMC logos: none at launch, so no approvals are needed. If logos are wanted later, get written AMC approval first | CO | Post-launch | — | Approval references in `amc.logoApproved` | — |

### 4. SMS, DLT and SMS vendor

| ID | Action | Owner | Due | Depends on | Evidence of done | Gate |
|---|---|---|---|---|---|---|
| BA-30 | Contract MSG91, or Gupshup/Karix if terms are better: India data residency, DPA | PO/FIN | Fri 10-09 | — | Signed order form and DPA; API key in nonprod Secrets Manager | S |
| BA-31 | DLT Principal Entity registration on one operator portal (company PAN, GST/COI, authorisation letter); entity ID; PE→telemarketer binding with MSG91; 6-character service headers (candidates `SANCHY`, `SNCHAY`; brand proof may be asked); whitelist `sanchay.in` URLs and the support callback number | DIR/PO | Submit Tue 09-29; approved Fri 10-16 | BA-40, BA-06 | Entity ID, header approval, URL whitelist screenshot | S |
| BA-32 | Login OTP template (Service-Implicit) with the Android SMS Retriever hash slot | CO text / DEV-A | Approved Fri 10-23 (hard Fri 10-30) | BA-31 | Template ID; staff phone receives an OTP through MSG91 | S (walking skeleton) |
| BA-33 | Second login template carrying the Play App Signing hash | DEV-A | Fri 03-05 | BA-64 | OTP autofill works on the Play internal build | A |
| BA-34 | DLT registration of consent and alert SMS templates within a week of counsel approval (BA-76): ONBOARDING_ATTEST Thu 12-24; PURCHASE Fri 01-15; service alerts Fri 02-26; SIP/MANDATE Fri 03-12; REDEMPTION/PLAN Thu 03-25; SWITCH/STP/SWP Fri 04-23; BANK/CONTACT/NOMINATION/FOLIO SR Fri 05-21 | CO / DEV-A | as stated | BA-76 | Template IDs mapped to template keys; DLT id checked at publish | A → B |
| BA-35 | Secondary SMS vendor contract (integrated after launch) | PO | Fri 07-16 | — | Signed order form | L |
| BA-36 | No promotional SMS at launch; no promotional header | CO | — | — | Recorded in the comms policy | — |

### 5. Email (Amazon SES)

| ID | Action | Owner | Due | Depends on | Evidence of done | Gate |
|---|---|---|---|---|---|---|
| BA-45 | SES nonprod: domain identity on a nonprod subdomain, Easy DKIM, custom MAIL FROM, request production access | DEV-B | Fri 10-23 | BA-41, BA-50 | "Production access granted"; DKIM verified | S |
| BA-46 | SPF, DKIM and DMARC on `sanchay.in`: DMARC `p=none` with reporting from Fri 10-23 → `p=quarantine` Fri 03-05 → `p=reject` Fri 06-18, each step after two clean report weeks | DEV-B/CO | as stated | BA-41 | `dig` TXT outputs; DMARC report summaries | B |
| BA-47 | SES production identity, DKIM, production access and quota sized for OTPs and statements | DEV-B | Fri 06-25 | BA-51 | Prod SES console evidence; test send | P |
| BA-48 | Mailboxes and aliases (sanchay.in as a secondary domain on the platizio.com Workspace): appstores@; then support@, grievance@, privacy@, security@ | OPS | appstores@ Fri 10-23; others Fri 03-05 | BA-40 | Test mails received; owners listed | S / A |

### 6. Domains and DNS

| ID | Action | Owner | Due | Depends on | Evidence of done | Gate |
|---|---|---|---|---|---|---|
| BA-40 | Register `sanchay.in` for Platizio: registrar lock, auto-renew, registrar 2FA. **Check availability today;** if it is taken, the PO names an alternative within 5 working days because SES, DLT, stores and certificates all depend on it | PO | Wed 09-30 | — | Registrar record in Platizio's name | S |
| BA-41 | Route 53 hosted zone and delegation. Records: apex, `www`, `app`, `api`, `ops`, nonprod subdomains, CAA. Whether `app.sanchay.in` serves or redirects (GAP-06 routes investor web at the apex) is recorded in an ADR | DEV-B | Fri 10-09 | BA-40, BA-50 | NS delegation; `dig` output | S |
| BA-42 | Optional defensive domains (e.g. sanchay.com) and brand monitoring | PO | Fri 12-18 | BA-06 | Registrations | — |

### 7. AWS (ap-south-1)

| ID | Action | Owner | Due | Depends on | Evidence of done | Gate |
|---|---|---|---|---|---|---|
| BA-50 | AWS Organization owned by Platizio. **Pick one billing entity for every account: India-billed AISPL accounts cannot sit in the same organisation as AWS Inc. accounts.** Management account: root on hardware MFA, no access keys. IAM Identity Center with MFA. Accounts: security/log-archive and nonprod. Org CloudTrail, GuardDuty, Security Hub. SCP allows ap-south-1, ap-south-2 (DR, opt-in) and us-east-1 for global services only (CloudFront certificates and WAF, billing). Budgets and billing alerts | PO/DEV-B | Fri 10-09 | FIN payment method | Org export; SCP JSON reviewed by both developers; budget alert test | S |
| BA-51 | Prod account with Business Support; prod stack (VPC, NAT EIPs, RDS, ECS, CloudFront, WAF, Secrets) deployed before FP credentials. This is earlier than the design's S19 slot, per review DLV-02 | PO/DEV-B | Fri 06-04 (latest Fri 06-18) | BA-50 | Account id, support plan, CDK prod deploy log with no investor data | P |
| BA-52 | Service quotas (SES, EIPs, Fargate); GST details on AWS invoices | FIN/DEV-B | Fri 06-04 | BA-51 | Quota approvals; invoice profile | P |

### 8. GitHub and delivery tooling

| ID | Action | Owner | Due | Depends on | Evidence of done | Gate |
|---|---|---|---|---|---|---|
| BA-55 | GitHub organisation owned by Platizio (paid Team plan); 2FA required, hardware keys for owners; two owners; private repo `sanchay` | PO/DEV-B | Tue 09-29 | — | Org settings screenshot | S |
| BA-56 | Branch-protection ruleset on `main`: PR required; 1 approval from a non-author; CODEOWNERS review; dismiss stale approvals; required CI checks; block force-push and deletion; linear history; protected release tags | DEV-B | Fri 10-09 | BA-55 | Exported ruleset JSON | S |
| BA-57 | Secret scanning with push protection, Dependabot, gitleaks in CI. CodeQL on a private repo needs a GitHub Code Security licence: the PO decides between buying it and relying on gitleaks, `pnpm audit` and ZAP | PO/DEV-B | Fri 10-09 | BA-55 | Settings screenshot; licence decision recorded | S |
| BA-58 | GitHub Actions OIDC to AWS (no long-lived keys); dev/staging/prod environments with required reviewers on prod. FP, MSG91 and SES credentials never go to GitHub (AWS Secrets Manager only) | DEV-B | Fri 10-23 | BA-50 | Environment config; secrets list (names only) | S |
| BA-59 | Expo EAS paid plan under a Platizio org; 2FA; CI robot token | PO | Mon 09-28 | — | Invoice and org | S |
| BA-60 | Push: Firebase project (FCM HTTP v1) under Platizio's Google Cloud org, plus an APNs key from the Apple org account, both stored in Secrets Manager | DEV-B | Fri 03-05 | BA-63 | Test push to an internal build | A |
| BA-60a | Approve the running cost of self-hosted Sentry and PostHog in ap-south-1 (GAP-06; counsel OI-15) | PO | Fri 10-23 | — | Budget approval | S |

### 9. App stores (organisation accounts only)

| ID | Action | Owner | Due | Depends on | Evidence of done | Gate |
|---|---|---|---|---|---|---|
| BA-61 | D-U-N-S number for Platizio, with legal name and address identical across MCA, GST and the ARN certificate | DIR | Request Tue 09-29; received Fri 10-30 | — | D-U-N-S letter | S |
| BA-62 | Google Play Console **organisation** account, verified; developer name = Platizio's legal name; owned through appstores@ with hardware-key 2FA | DIR/PO | Mon 11-30 | BA-61, BA-48, BA-06 | Verified account | A |
| BA-63 | Apple Developer Program **Organization** enrolment; Account Holder = a director; App Manager API key for EAS | DIR | Mon 11-30 | BA-61 | Team ID | A |
| BA-64 | App records: `in.sanchay.app` on both stores; Play App Signing; iOS capabilities (Push, Associated Domains `applinks:` / `webcredentials:sanchay.in`, App Attest) | DEV-B | Fri 12-04 | BA-62, BA-63 | Console screenshots | A |
| BA-65 | TestFlight internal and Play internal-testing tracks for the alpha | DEV-B | Fri 03-05 | BA-64 | Staff installs | A |
| BA-66 | Store compliance pack. Play: financial-features declaration "Stock trading and portfolio management", described as MF distribution of Regular plans by an AMFI-registered MFD with its ARN; Data safety; content rating; 18+ audience; no ads; no advertising ID. Apple: privacy labels, privacy manifest, 18+ rating, export compliance, India only. Listing text checked for tagline, ARN and standard warning, and for no "advisor" or return claims | CO/DEV-B | Fri 07-02 | BA-06, BA-71 | Completed-form screenshots; CO sign-off | P |
| BA-67 | Reviewer accounts: one per store, FP sandbox only, static OTP bound to exact identifiers, enabled by two different SUPER_ADMINs, 30 days maximum. Review notes include the ARN certificate link and the sandbox routing | OPS/DEV-B | Fri 07-02 | BA-66 | Audit events; review notes text | P |
| BA-68 | Submit closed-track builds (TestFlight external beta review, Play closed track) so pilot invitees can install by Mon 07-19 | DEV-B | Submit Fri 07-09 | BA-66, BA-67 | Approved builds | P |
| BA-69 | Submit public production builds; staged-rollout plan | DEV-B/PO | Submit Fri 07-30; approved Fri 08-06 | BA-68 | "Approved, not published" status on both stores | G11 (L) |

### 10. Legal, privacy and compliance content

| ID | Action | Owner | Due | Depends on | Evidence of done | Gate |
|---|---|---|---|---|---|---|
| BA-70 | Regulatory-sources register: editions in force, SEBI category circular entry, 29-May-2026 nomination circular, paragraph re-mapping | COUNSEL | Fri 10-23 (category circular Fri 11-20) | BA-02 | Approved register | S |
| BA-71 | Privacy notice (SPDI now, DPDP Rule 3 itemised). Names processors (Cybrilla, KRAs/CKYC, AMCs/RTAs, MSG91, AWS, Google FCM, Apple APNs), retention (8 years from closure, 1-year logs), rights, grievance officer, deletion path | COUNSEL/CO | Draft Fri 12-04; staff-alpha version Fri 03-05; final Fri 05-07 | BA-80 | Published legal-document versions with hash | A / G10 |
| BA-72 | Terms of Use: execution-only, Regular plans and commission, no advice, "Cybrilla" payment descriptor, closure and retention | COUNSEL | Same dates as BA-71 | BA-75 | Published versions | A / B |
| BA-73 | DPDP consent notices per purpose: onboarding/KYC, transactions, marketing (off by default), analytics, CAS import, push; how to withdraw. **Final by Fri 05-07, because DPDP Phase III applies from 13-May-2027, before the beta** | COUNSEL/CO | Fri 05-07 | BA-71 | Approved notice set | G10 (B) |
| BA-74 | Appoint the Grievance Officer (SPDI r.5(9), DPDP Rule 9, AMFI code). `/grievance` content: acknowledge within 24 h; resolve within 21 calendar days (7 working-day target); privacy grievances within 30 days; escalation Grievance Officer → AMC → SEBI SCORES → SMART ODR; never describe Platizio as SEBI-registered | DIR/CO | Appointed Fri 03-05; page final Fri 05-07 | BA-48 | Appointment letter; page on staging | A / B |
| BA-75 | Verbatim disclosure pack: AMFI tagline and ARN; standard MF risk warning; Regular-plan and commission sentence plus the commission page; AMFI execution-only declaration; SID/KIM/SAI links; nomination Annexure-A/B (29-May-2026); suitability warning; payout-delay interest note; "Payments appear as Cybrilla"; TPV line | COUNSEL/CO | Fri 12-18 | BA-70 | Approved text versions | A |
| BA-76 | Counsel approval of the 17 TPL_* consent templates: ONBOARDING_ATTEST Fri 12-18; PURCHASE Fri 01-08; SIP_*/MANDATE_* Fri 03-05; REDEMPTION/PLAN_* Fri 03-19; SWITCH/STP/SWP Fri 04-16; BANK/CONTACT/NOMINATION/FOLIO_SERVICE_REQUEST Fri 05-14 | CO/COUNSEL | as stated | BA-75 | Published template versions with sha256 | A → B |
| BA-77 | Counsel opinions. By Fri 12-18: OI-1 EUIN, OI-2 SEO, OI-3 risk profile, OI-4 KYC agency, OI-5 pooling, OI-7 2FA for plan changes, OI-9 retention, OI-14 nomination channels, OI-15 telemetry, OI-16 time source, OI-17 change-of-bank cooling-off. By Fri 01-29: OI-10 (minor nominee). By Fri 02-26: OI-8, OI-11, OI-12 (with the CA) | COUNSEL | as stated | BA-02 | Memos filed | A |
| BA-78 | Compliance sign-off of risk questionnaire v1.0.0 (GAP-03: 8 questions, 5 levels, caps, 24-month expiry, per-order mismatch acknowledgement), then publish in admin (CONTENT drafts, COMPLIANCE requests, SUPER_ADMIN checks) | CO | Sign-off Fri 02-12; published on staging Fri 02-26 | OI-3 | Signed questionnaire PDF; published version sha | A |
| BA-79 | CAS import legal review (GAP-12): consent wording and purpose limit; no fund CTAs on external holdings; password never stored; raw PDF deleted within 1 hour; PAN filter; external holdings never added to Sanchay totals; casparser MIT licence notice | COUNSEL/CO | Fri 04-23 | BA-73 | Counsel memo; approved CAS notice | B |
| BA-80 | Retention schedule sign-off: 8 years from closure for regulated records, 1-year logs, CAS raw files 1 hour. Account-deletion text for store reviewers | CO/COUNSEL | Fri 12-18 | OI-9 | Signed schedule | A |
| BA-81 | Processor DPA register: MSG91, AWS, Google (FCM), Apple (APNs terms), Cybrilla (BA-19b). Expo and GitHub recorded as code-only, no personal data | COUNSEL | Fri 06-04 (hard Fri 07-16) | BA-30 | DPA register | G10 |
| BA-82 | Cross-border register entry: push tokens only, generic payloads | CO | Fri 06-04 | BA-60 | Approved register row | G10 |

### 11. Security, incident response and insurance

| ID | Action | Owner | Due | Depends on | Evidence of done | Gate |
|---|---|---|---|---|---|---|
| BA-85 | CERT-In-empanelled pen-test vendor. Scope: web, API, admin, Android, iOS, CAS worker, webhooks. Testing Mon 06-21 → Fri 07-02 on the R2 build; retest letter Wed 07-14. **This moves testing ahead of the design's S20 slot (review DLV-04) so that G1 can pass on 07-16; the lead should confirm** | PO | Shortlist Fri 03-19; contract Fri 04-23; scope Fri 05-21 | R2 build | SoW; report; retest letter with zero open critical/high | G1 (P) |
| BA-86 | CERT-In: designate and notify the Point of Contact (Directions 28-Apr-2022). Incident runbook covering the 6-h CERT-In report, DPB and investor notices, and Cybrilla/AMC notices. Time-source approval (OI-16). 180-day logs in India | CO/DEV-A | POC Fri 12-18; runbook Fri 06-18; tabletop Fri 07-09 | BA-77 | POC communication and acknowledgement; runbook; tabletop minutes | G10 (P) |
| BA-87 | Cyber insurance: incident response and forensics, notification costs, third-party liability, regulatory defence where insurable, business interruption, social-engineering fraud. Consider professional indemnity for the MFD business | DIR/FIN | Quotes Fri 05-07; bound before Fri 07-16 | — | Policy schedule effective ≤ 07-16 | P |
| BA-88 | Vulnerability disclosure: security@ mailbox, `security.txt`, VDP page | CO/DEV-B | Fri 06-18 | BA-48 | Live page; test report received | B |
| BA-89 | Staff identity: platizio.com Workspace accounts for all ops/admin staff with passkey or security-key 2-step enforced; OIDC client for `ops.sanchay.in`; hardware keys bought | PO/DEV-B | Fri 11-06 | — | Workspace policy screenshot; key register | S |

### 12. Operations and support

| ID | Action | Owner | Due | Depends on | Evidence of done | Gate |
|---|---|---|---|---|---|---|
| BA-90 | Hire the fund-facts curator: ≥150 schemes, tax-class submissions, commission loads. Ideally part-time from Mon 11-23 on the CSV template | PO | Start Mon 01-04 | BA-23, BA-24 | Contract; first 50 schemes curated by Fri 01-29 | A |
| BA-91 | Name at least two staff who can act as OPS and COMPLIANCE checkers, plus SUPER_ADMIN (maker ≠ checker) | PO | Fri 03-05 | BA-89 | Role assignments in admin | A |
| BA-92 | Load the 2027 NSE/BSE trading and RBI money-market holiday calendars | OPS | Thu 12-24 | — | Loaded calendar signed off by ops | A |
| BA-93 | Support channels: support@ and grievance@ mailboxes; a business phone line (whitelisted in DLT); hours Mon–Sat 09:00–19:00 IST; SLAs (first response 1 working day, resolution 3, auto-grievance at 5); macros; 30 help articles (CONTENT drafts, SUPPORT publishes, COMPLIANCE checks fee/tax articles) | OPS | Beta Fri 06-18; pilot rota Fri 07-16 | BA-48, BA-74 | Test ticket closed end-to-end; help centre published; rota | B / P |
| BA-94 | Pilot plan: ≤50 invitees with consent; founders' canary (₹500 lumpsum plus SIPs on UPI Autopay and eNACH); test calendar with SIP dates, redemptions placed by Mon 07-26 so payouts are seen before 07-30, and STP/SWP first instalments | OPS/PO | Fri 07-09 | BA-18 | Signed invite list; calendar | P |
| BA-95 | Low-end Android test phone (Moto G class) and Firebase Test Lab billing | FIN/DEV-B | Fri 02-12 | — | Device in lab; billing active | A |
| BA-96 | Escalation matrix: internal on-call, Cybrilla, AMCs/RTAs, counsel | OPS | Fri 07-09 | BA-19c | Published matrix | P |

### 13. Gate evidence binder (items each go/no-go reads)

| Gate | Checklist items |
|---|---|
| G1 pen test | BA-85 |
| G2 EUIN | BA-19a (Q-C1), BA-77 (OI-1), BA-22 |
| G3 PA / escrow / AMC | BA-19a (Q-C11), BA-25 |
| G4 holdings reconciliation | BA-15 (mailback live), Q56 answer |
| G5 allotted units | Q50 answer plus probe P-07 |
| G6 ARN attribution | BA-13, Q9 answer plus probe P-05 |
| G7 production access | BA-18, BA-19, BA-51 |
| G8 DR drill | Engineering |
| G9 capabilities | BA-04, BA-19a parity, Q31/36–38/40/45/46 answers |
| G10 privacy / CERT-In | BA-71, BA-73, BA-81, BA-82, BA-86, BA-19b |
| G11 store approvals | BA-69 |

**Top watch items:**
1. BA-40 domain availability and BA-06 trademark conflict. Both block DLT, SES and stores.
2. BA-12 Cybrilla answers by 10-09.
3. BA-31/32 DLT approval before the 11-06 walking skeleton.
4. BA-61–63 D-U-N-S and store accounts by 11-30.
5. BA-15 RTA mailback. It is the fallback for G4.
6. BA-18 production credentials. This is the only external item with zero float.
7. BA-85 pen-test window.

### Critical Files for Implementation
- C:/Users/pc/AppData/Local/Temp/claude/C--Users-pc-Desktop-sanchay/2f00d411-382c-43a6-bd67-ecaf60c67db1/tasks/wgsfao5rm.output (GAP-02, GAP-04, GAP-05, GAP-07..GAP-12 rulings; specs 7 stores and 8 privacy)
- C:/Users/pc/AppData/Local/Temp/claude/C--Users-pc-Desktop-sanchay/2f00d411-382c-43a6-bd67-ecaf60c67db1/tasks/wsx2mey6n.output (finalDesign §0.2, §F, §K, §R.3–R.6, §S Q-C1..Q-C14; roadmap §4.2; reviews.1 DLV-01..DLV-22)
- C:/Users/pc/.claude/projects/C--Users-pc-Desktop-sanchay/2f00d411-382c-43a6-bd67-ecaf60c67db1/subagents/workflows/wf_1d1c9b02-593/journal.jsonl (research:fp-api §1–§12 conflicts; research:regulation §5 counsel items)
- C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/docs/cybrilla-production-inquiry-email.md (v1 draft that was never sent; superseded by Deliverable 1)
