# Sanchay flaw audit: compliance and engineering (2026-10-08)

_Audit of `main` at `03059ae` (Plans 01, 02 and Plan 03 E1–E17 built) and of the unexecuted plan text (Plan 03 E20–E24, Plan 04 F1–F29). Read-only: no code, plan or doc other than this file was changed. Raw reviewer reports and verifier verdicts are kept outside the repo (session scratchpad, `reports/`)._

## 1. How it was done

1. **Eight independent reviewers ran in parallel**, one per domain:
   - SEBI/AMFI compliance (CS);
   - data protection, cyber, telecom, payments and app store (CD);
   - lumpsum E20–E24 (ML);
   - Plan 04 SIP/mandate/ledger (MS);
   - Plan 04 redemption/reconciliation/XIRR (MR);
   - security of the built system (SEC);
   - Plan 04 plan-vs-code drift (DR);
   - operations and architecture (OPS).

   Each one checked its findings against the existing records (errata backlog, Plan 02/03 execution reviews, rulings, `till_now.md`) and marked repeats KNOWN.
2. **Every Critical or High finding was then verified adversarially** by two skeptics working from different angles:
   - an *evidence* lens re-opened every cited line and looked for code, errata or rulings that already handle it;
   - an *impact* lens rebuilt the failure path step by step, or checked the regulation.

   The final severity below is the verified one. Where the two skeptics split, both are shown.
3. **Medium and Low findings were not adversarially verified.** They carry the reviewer's own evidence and confidence, and should be treated as leads to confirm before acting.

**Limits:**
- Outbound fetches to sebi.gov.in, amfiindia.com, cert-in.org.in, trai.gov.in and docs.fintechprimitives.com were blocked. Regulatory points rest on web-search extracts of those sources plus the repo's own primary-source research, and each finding labels which.
- Nothing was run: no tests, no FP sandbox calls, no AWS.

## 2. Bottom line

- **No finding survived as Critical.** Two were raised as Critical (the LOOKUP-ADOPT `items[0]` flaw and the refund gaps) and were downgraded to High after verification.
- **The built code (Plans 01–03 E1–E17) is in good shape.** Auth, sessions, BOLA, crypto, webhooks, KYC gating, PEP/FATCA blocks and the nominee cap all checked out. The built-code Highs are:
  - one availability issue (H12, the SMS-cap DoS);
  - the www legal and privacy pages failing in prod (H15).
- **The most time-critical item is the DLT SMS templates (H16)**, due for filing on Mon 10-12 in a format TRAI no longer accepts.
- **The real risk sits in the unbuilt plan text** (E20–E24, Plan 04). Five cross-cutting defects repeat across the lumpsum, SIP and redemption tasks:
  1. consent snapshots that do not bind what the investor saw;
  2. no server-side suitability;
  3. FP list filters trusted blindly;
  4. no refund flag when FP fails a paid order;
  5. aggregates that can get stuck in SUBMITTING/CREATED with no backstop.

  These should be fixed in the plans **before E20 starts**, which is cheaper than fixing code later.
- **Plan 04 needs a re-baseline against the built code before S4:**
  - migration numbers collide;
  - F1 would overwrite the fix-wave legal seed;
  - several anchors moved.

## 3. Verified High findings (must fix before E20 / GO-1)

### 3.1 Consent, suitability and disclosure (regulatory)

| # | Finding | Where | Why it matters | Fix | Status |
|---|---|---|---|---|---|
| H1 | **Suitability is not enforced server-side for lumpsum, and is absent for SIPs.** `SUITABILITY_HOOK` is wired to `NOOP_SUITABILITY_HOOK`. `createPurchase` never calls `Suitability.check`. The INV-02 acknowledgement is client-only and never sent. `suitability_acknowledgements` is written nowhere. "suitab" appears 0 times in Plan 04. | `apps/api/src/modules/legal-consent/legal-consent.module.ts:21`; Plan 03 E20 (~18930–19001), E22 (21596), E23 (22271); Plan 04 F2/F10/F12 | SEBI execution-only rule (CIR/IMD/DF/13/2011, now MC 16.6.1(d)): when the distributor has information that a transaction is not appropriate, a written warning must be acknowledged before execution. Sanchay always has a risk profile. Also breaks spec §1.3/§4.1 step 3 and D-MONEY-094/096. A Conservative investor can buy or start a SIP in a Very High risk scheme with no stored acknowledgement. | `createPurchase`/`createSip` call `Suitability.check`. On MISMATCH, require the ack and insert `suitability_acknowledgements`. Bind `suitability{…ackSha256}` into the snapshot. Replace the NOOP hook with a real re-check (409 `SUITABILITY_CHANGED`). Send `SUITABILITY_WARNING_COPY`. Add CNF-03 to the SIP flow. | ML-8, MS-7, CS-1. Both lenses CONFIRMED HIGH. RSK-2 covered only expiry. |
| H2 | **Purchase and SIP consents bind almost nothing.** There is no `SNAPSHOT_BUILDERS.PURCHASE` or SIP builder; the generic builder echoes caller fields with `legalDocuments: []`. So: approve's "recompute from the DB" compares the snapshot with itself; there is no per-order execution-only (EUIN-blank) declaration, Regular-plan/commission disclosure, template version or nominee set; and CNF-01 shows no consent text (OTP inputs only). | `snapshot-builders.ts:35-46`; `consent-engine.ts` approve; Plan 03 E20 (~18990-19000); Plan 04 F2 (~5361-5381); `ConsentOtpSheet.tsx`; `packages/contract/src/consents.ts:8-21` | Spec §4.1 (snapshot schema), journeys CNF-01/DSC-08, D-MONEY-092 App. 2, and the AMFI MFD Master Circular §5.2.4(b) (EUIN-blank declaration signed per transaction). The outline itself required a PURCHASE builder. An AMC asking for the per-order execution-only declaration would find only an onboarding checkbox. | Write PURCHASE and SIP/MANDATE builders on the F5/F28 pattern that read the order/plan, bank, scheme, ARN, commission line, template, cut-off and suitability rows. Bind `EXECUTION_ONLY_DECLARATION` and `REGULAR_PLAN_COMMISSION`. Add rendered consent text to the challenge view and CNF-01. | CS-2 (CONFIRMED HIGH ×2), ML-7 (HIGH/MEDIUM), MS-3 (HIGH/MEDIUM). NEW. Errata line 77 wrongly closed `legalDocuments: []` as "no live path". |
| H3 | **The FP `consent{}` PATCH asserts an email OTP that was never sent.** E20/E21 checkout and F2 `contacts()` always add `email`, but `required-factors.ts` makes purchases under ₹1 L, SIP and mandate registration SMS-only. | Plan 03 ~19237, ~20450; Plan 04 ~6019-6027 (and the tests pinning it, ~18447, ~4771) | H-21/D-MONEY-006 say "carries only channels actually verified". FP's consent object is immutable and is surfaced to the RTA as email 2FA. That is a false 2FA record on most pilot orders. | Build `consent{}` from the consumed challenge's verified factors. Fix both tests. | CS-3. CONFIRMED HIGH ×2. NEW. |
| H4 | **EUIN: FP auto-fills a tenant-default EUIN on every order**, while Sanchay records `execution_only=true` and the investor declares the EUIN blank. | `docs/probes/P-04-euin-blank.md`; E20 `orders` schema | Contradictory RTA record; possible AMC notice to supply a valid EUIN or switch to Direct. | Hold GO-1 on Cybrilla's Q15 answer (G-B8). Consider a queryable `orders.euin_reported` column (today it is only in `provider_calls.body_enc`, kept 400 days). | CS-5. KNOWN (P-04, owner decision C2). Only the column gap is new (LOW). |

### 3.2 Money correctness in the unbuilt plans

| # | Finding | Where | Why it matters | Fix | Status |
|---|---|---|---|---|---|
| H5 | **Purchase LOOKUP-ADOPT adopts `items[0]` of `GET /v2/mf_purchases?source_ref_id=`**, a filter FP does not document, with no check of `source_ref_id` or account on the row. FakeFp honours the filter, so tests stay green. The same blind trust appears in instalment sync (`plan=`) and `folio.sync` (`folio_number=` → `items[0]`). | Plan 03 E20 19280-19287; Plan 04 F7 21508-21511, F2 6077/10341, F4 9860 | The 10-08 probe showed FP ignoring an unsupported filter (`primary_investor=` returned all 87 accounts; MF-2). If `source_ref_id` is ignored too, a RECONCILING order adopts another investor's purchase and the advance job PATCHes this investor's consent onto it. Local state is corrupted at minimum. F7's `adoptRedemption` already uses the safe pattern. | List by the investor's `mf_investment_account` and adopt only `source_ref_id === order.id` plus matching account, scheme and amount. Filter `plan`/`folio_number` locally. Make FakeFp ignore these filters. Add made-up-value read-only sandbox probes. | ML-1, MR-1 (found independently), MS-8. Verified HIGH (down from CRITICAL: FP may instead return 0 rows, and cross-investor payment needs FP to accept a foreign TPV bank). NEW. |
| H6 | **Refund gaps.** (a) A late payment success after FAILED/EXPIRED throws, and polling stops (R-a). (b) When FP fails or expires a paid lumpsum after PROCESSING, nothing sets `refund_status`, nothing sends `REFUND_IN_PROGRESS`, and `v_refunds_pending` stays empty. (c) E24 shows "no money was taken" for `fp_payment_url_unused` even on a paid order. (d) The poll sends `ORDER_PLACED` whatever the order status. | Plan 03 E21 20209-20234, 20263-20286, E24 23045-23055; Plan 04 F4 9634, 10112-10177, 10135-10147 | Spec §4.2 FAILED★/EXPIRED★ row requires REFUND_PENDING and "Refund of ₹X in progress". P-07 saw FP fail paid (simulated) ONDC orders with `fp_payment_url_unused`. F24's refund runbook assumes E21 does this. Investor is told nothing was taken and pays again. | Adopt R-a option B extended: keep FAILED/EXPIRED terminal, add `late_auth`, keep polling until the FP order is final. On every order → FAILED/EXPIRED/REJECTED, re-fetch the payment and flag the refund, send the email and open a break. Gate the "no money" copy on payment evidence. Send `ORDER_PLACED` only on PROCESSING. | ML-2 (KNOWN R-a; polling-stops part NEW), ML-3, MS-6. CONFIRMED HIGH. |
| H7 | **Payment polling.** `payments.poll` treats only `SUCCESS` as paid; INITIATED/APPROVED loop every 15 min for ever and the order never leaves PAYMENT_PENDING. No poll is enqueued when an attempt is created, so UPI-intent payments (which never hit the return route) depend on the webhook alone. | Plan 03 E21 20209, 20230-20234, 20033-20069; E24 PayScreen ~22985 | Spec §4.2 PROCESSING row lists SUCCESS, INITIATED and APPROVED; the lumpsum probe saw SUCCESS → APPROVED. Spec §4.1: polling is the backstop for every non-final aggregate. Paid orders get stuck, and PAY-01 keeps offering "Pay". | Accept SUCCESS/INITIATED/APPROVED. Cap the chain and open a break. Enqueue a poll in the same transaction that moves the attempt to REDIRECTED. Hide pay buttons once a payment is pending. | ML-4, ML-5. CONFIRMED HIGH ×2. NEW. |
| H8 | **"Redeem all" (FULL) is blind to FP units above the ledger.** The live re-check reuses the stored `reconciliation_status`, detects only FP-below-ledger, and does not refuse while a purchase or SIP instalment on the folio/scheme is non-final. | Plan 04 F5 14430, 13708, 11711, 11758 | Breaks D-MONEY-050 ("units in UNITS_PENDING or in-process are not redeemable"). FP redeems the whole holding, the ledger records a CRITICAL shortfall, and the late allotment then creates a phantom lot shown in PORT/HOME. Only a developer fix clears it. | For FULL, require live FP units equal to ledger units within 0.001 and no non-final purchase on the folio/scheme, at quote, draft and submit. Same in `decideAll`. | MR-2 (+MS-11). HIGH/MEDIUM. NEW. |
| H9 | **`payout.watch` will mark on-time payouts DELAYED and email "The AMC owes 15% p.a. interest"** unless FP returns `bank_credit_reference`. That field is absent from FP's documented redemption fields and from every probe. The code comment says it is in Known gaps; it is not. | Plan 04 F5 14734-14745, 12977-12980, header 217-231; `apps/api/src/modules/notifications/templates.ts:51-54` | False delay notices and false grievances on every pilot redemption, unless two founders record a UTR first. | Probe the field before GO-1 and add it to Known gaps. Until proven, open an ops break at the due date and email the investor only after ops confirms non-receipt, with softened copy. | MR-4. MEDIUM/HIGH. NEW. |
| H10 | **"Until I cancel" SIPs omit `number_of_installments`**, which FP documents as required (≥ 1). Spec and D-MONEY-026 say 360. F29's sandbox chain always sends 6, and FakeFp does not validate it. | Plan 04 F2 5190, 5827, contract 6367 | The default SIP registers the mandate, then the plan POST is refused, so the GO-2 canary leg B_SIP fails (or FP silently defaults the count). | Send `numberOfInstalments ?? 360`. FakeFp returns 400 when it is missing. Run one sandbox check. | MS-1. CONFIRMED HIGH ×2. NEW. |
| H11 | **Aggregates can get stuck with no backstop.** SIP: (a) a mandate stuck in CREATED (authorise failed) is never polled or expired; (b) plans stay in CONSENTED/MANDATE_SETUP after retries run out; (c) a crash after the autocommitted SUBMITTING strands the plan; (d) a crash between create and the CREATED write re-POSTs a second mandate. The same SUBMITTING strand exists for purchases (ML-10) and redemptions (MR-6, with the reservation left ACTIVE). | Plan 04 F2 5472, 5596-5626, 5672, 5802; F7 21284; Plan 03 E20 19088-19146 | Spec §4.1: polling is the backstop for every non-final aggregate, and LOOKUP-ADOPT is "never trimmed". Stuck plans keep consuming mandate headroom, and stuck redemptions block "Redeem all". | Extend F7's backstop to SUBMITTING older than a few minutes (LOOKUP-ADOPT, or FAILED after two absent checks), to CONSENTED/MANDATE_SETUP with an APPROVED mandate, and to CREATED mandates. Add `FpRead.mandates` over the existing `mandate.list` operation and adopt before re-POST. | MS-5 (HIGH/MEDIUM), ML-10, MR-6 (MEDIUM). NEW (mandate-create ambiguity itself is a known gap). |

### 3.3 Built system, plans and delivery

| # | Finding | Where | Why it matters | Fix | Status |
|---|---|---|---|---|---|
| H12 | **Anyone can exhaust the shared 2,000-SMS/day cap.** The invite gate runs only after verify, so each `requestOtp` to a random mobile sends a real SMS. The cap counts CONSENT SMS too. About 100 IPv4s for an hour takes sign-in and every consent (purchase, redemption, SIP cancel) down until midnight IST, every day. A targeted variant can block one investor's sign-in for about 21 h. | `apps/api/src/modules/identity/otp.service.ts:43, 645-657`; `auth.service.ts:47-56, 86-91` | Spec §5 accepted OTP-cost abuse with the cap as a mitigation, but the cap itself becomes the outage switch, and how cheap that is was never recorded. There is no email fallback (LC-8) and no WAF/CAPTCHA. | Owner ruling. Options: give CONSENT and known-investor SMS their own budget; don't send to numbers that are neither investors nor invited, while keeping H-5's identical response; per-/24 limits; CAPTCHA after N sends; move caps into `app_config`. | SEC-1, OPS-4. CONFIRMED (HIGH/MEDIUM). NEW. |
| H13 | **Plan 04 F1 cannot pass Step 4 against `main`.** It "replaces whole" `ops-legal-seed.ts` with `seedLegalDocumentFiles`. The built fix-wave file exports `seedLegalDocuments`, which `legal-consent.int.test.ts:9` imports, and the published-text and `effective_from` guards would be lost. Its new `db-app`/`db-readonly` secrets lack the retain policy that the MF-8 infra test pins. Its test counts are stale (the repo has 28 cases). | Plan 04 F1 294, 3230-3367, 2925-2945, 302, 2135, 4255; `infra/test/sanchay-mvp-stack.test.ts:288-307` | Typecheck and infra tests fail. If an executor forces it through, the legal-seed safety from RV-03-67 is lost. | Keep the built `seedLegalDocuments` and extend it. Create the login secrets with the retained-secret helper and add them to MF-8's expected list. Recount. | DR-4. CONFIRMED HIGH/MEDIUM. NEW. |
| H14 | **External critical path is late.** `sanchay.in` and the Cybrilla production letter were due 09-28, and C4 (AWS, MSG91, hosted zone) was due 10-09. The domain gates the hosted zone → E25 → NAT EIP allowlist, the DLT URL whitelist → templates → prod OTP, SES production access, and the Play organisation account. The letter's body still promises "Sandbox URLs (our dev environment) … by Fri 23 Oct", although R-31 removed the dev environment and B1 is undecided. | `docs/till_now.md` §5 rows 2 and 6; `docs/business/cybrilla-production-letter.md:114` | Production credentials have zero float (latest 11-16 under R-21). | Register the domain and create the account and hosted zone this week. Fix line 114 and re-date the asks. Send the letter by Mon 10-12. Ask Cybrilla for lead times. | OPS-1. PARTIAL → HIGH. Lateness KNOWN; stale letter text NEW (a short fix, not a blocker). |

> **Data/cyber Highs (CD-1, CD-2)** are listed in §3.4 with their verification result.

### 3.4 Data protection, telecom and logging

| # | Finding | Where | Why it matters | Fix | Status |
|---|---|---|---|---|---|
| H15 | **Every www legal page, the privacy notice included, breaks in prod, and the sign-up privacy link is dead.** Six things combine: (1) `legal-api.ts` fetches server-side from `https://api.sanchay.in` with no `x-sanchay-client` header; (2) HostGuard returns 404 for non-infra routes on the api host; (3) after F8, ClientGuard returns 403 `ORIGIN_REJECTED` instead; (4) the web/mobile links point to `/legal/privacy`, but the contract accepts only `PRIVACY_NOTICE`; (5) Play is given `www.sanchay.in/privacy`, which has no route; (6) the www footer has no legal links. Int tests always send the app host and client header, and no e2e covers `/site/legal`. | `apps/web/src/lib/legal-api.ts:26-38`; `infra/lib/sanchay-mvp-stack.ts:274`; `apps/api/src/modules/platform/host.guard.ts:40`, `client.guard.ts:50`; `apps/api/src/modules/legal-consent/legal.router.ts:36,88`; `apps/web/src/app/(auth)/layout.tsx:19`; `apps/mobile/src/native/AppProviders.tsx:36`; `docs/business/pilot-actions-checklist.md:184` | SPDI Rules 2011 r.4 (privacy policy published on the website) and the Play privacy-policy requirement. The commission-disclosure page (AMFI CoC 4(f) hyperlink) also throws. Today `/site/legal/*` shows "This document is not available." and `/commission-disclosure` 500s. | Fetch via the app origin with `x-sanchay-client: web`, or mark both procedures `@SkipClientCheck()` with `APP_AND_API_HOSTS` scope. Map slugs (`privacy`, `terms`) and add a `/privacy` route. Add footer links. Add a Playwright test with separate app and api origins. | CD-1. CONFIRMED HIGH ×2. NEW (the dead Play URL alone was noted in the critic). |
| H16 | **The DLT SMS templates use bare `{#var#}`, but TRAI's Direction of 18-Nov-2025 requires typed variable tags** (`#numeric#`, `#alphanumeric#`, `#url#`…) on every content template, and operators scrub values against the tag. Rendered values include `5,000.00`, scheme names with spaces, and an SMS Retriever hash that can contain `+` or `/`. **Filing is due Mon 10-12 (PB-32).** | `docs/dlt/sms-templates.md:8,19-21,39-41,59-61,87-89`; `apps/api/src/integrations/sms/templates.ts`; `infra/lib/config.ts:60`; R-10 | The portal will force a tag choice. If the tags don't match what the code renders, login and consent SMS are dropped at scrubbing, which surfaces only at PB-34 handset testing (11-20), with about two weeks to re-file before 11-27. | Re-author all four templates with tags before filing. Confirm with MSG91 which characters each tag accepts. Render values to fit (an amount without separators, or drop the scheme name). Move the hash into fixed text, or confirm `+` and `/`. Add a unit test of each rendered variable against its tag regex. | CD-2. CONFIRMED/PARTIAL, HIGH. NEW; conflicts with R-10's hash line. Primary TRAI text was egress-blocked: confirm the tag rules with MSG91 before filing. |

Verified as **MEDIUM** (moved to §5):
- **CD-3:** privacy notice and T&C are accepted only at ONB-15, after the bank account has gone to FP and the penny drop. This follows the binding MVP spec, which outranks journeys AUTH-02; KYC_CONSENT already covers PAN and DOB.
- **CD-4:** CERT-In log scope. There are no ALB, RDS or VPC flow logs and request logs carry no IP. R-34 and PB-73 accepted the app log group as the 180-day store, so this is a legal reading for counsel.

## 4. Cross-cutting themes (fix once, everywhere)

1. **`moveOrder`/`moveAttempt` have no compare-and-set.** A cancel can be overwritten by the submit job (purchase: ML-6; redemption: MR-3, where the released reservation can be re-reserved). Fix: `UPDATE … WHERE id = $1 AND status = $from` with a rowcount check, or `FOR UPDATE` in both paths. For redemptions, refuse cancel once the challenge is CONSUMED. (MEDIUM; one fix covers both.)
2. **Every FP list read must filter locally** (H5). Add a FakeFp mode that ignores unknown filters, as the 10-08 probe recommended.
3. **Every money subject needs its own DB-reading snapshot builder** (H2). F5 and F28 already do this; PURCHASE and SIP do not.
4. **Template resolution must use `resolveLegalDocument`** (the LC-3 rule). F5's and F28's builders pick `ORDER BY effective_from DESC`, which takes NULLs first and future-dated versions, and F5 proceeds with no template (MR-10, MS-12 row 4).
5. **The backstop must cover every non-final state**, SUBMITTING and CREATED included (H11).
6. **The kill switch is checked only at draft.** Queued submit jobs and approvals still write to FP during a freeze (ML-15, OPS-9). Add an `fp.writes.enabled` check in FpTransport for P/M classes.

## 5. Medium findings (reviewer-reported; not adversarially verified unless marked)

**Compliance (SEBI/AMFI)**
- CS-4 *(verified MEDIUM)*: the app has no ARN or "AMFI-registered Mutual Fund Distributor" tagline and emails don't carry the ARN; there is no hyperlink to competing-scheme commission rates (`/site/commission-disclosure` is orphaned) and no SAI link; lumpsum INV-02 lacks the Regular-plan notice. The Fund page and SIP review do show DSC-03.
- CS-6 *(verified MEDIUM)*: the LIQUID/OVERNIGHT expected NAV date is one day late, and the golden vectors CO-04/05/08/14/16 encode the error (GAP-05 1a: before 13:30 → previous calendar day's NAV).
- CS-7: KYC is checked once; the periodic re-check (D-MONEY-110) was dropped without being listed as deferred, so an investor whose KRA goes On-Hold can still be charged.
- CS-8: the nomination statement-display choice is never asked (it silently defaults to false), and nominee contact fields are not offered.
- CS-9: fund-page CAGR is shown with no benchmark, as-of date or source, although the API already returns them.
- CS-10: the curated list has no "not a recommendation / limited universe" copy and no empanelled-AMC list (advisory-characterisation risk; add to counsel's G-C3).
- MS-2 *(verified MEDIUM)*: a first SIP with a new mandate runs under a `MANDATE_REGISTRATION` subject and template. This was a deliberate choice for the 7-day window, but it conflicts with spec §4.3 and D-MONEY-041.
- MS-13: SIPs bypass the pilot caps (₹1 L per order, ₹2 L per day); stacked UPI SIPs or one eNACH SIP can exceed them. Needs an owner ruling.

**Data, telecom, logging**
- CD-3 *(verified MEDIUM)*: privacy notice and T&C acceptance happen only at ONB-15, after the bank account and penny drop have gone to FP. This is a spec-level gap (MVP spec row ONB-15 outranks journeys AUTH-02). Fix: record acceptance at sign-up, and gate bank-verify on it.
- CD-4 *(verified MEDIUM)*: CERT-In 180-day log scope. Only the app log group is kept; there are no ALB, RDS or VPC flow logs, no request IPs in pino lines, and CloudTrail is left to PB-45. R-34/PB-73 accepted this; get counsel's reading.
- CD-5: the MSG91 sender passes the whole SMS as one `VAR_BODY` and uses one id as both the MSG91 flow id and the DLT template id (KNOWN as R-e; still unbuilt). Probe a real send right after DLT approval.
- CD-6: there is no under-18 check; `ageScore` gives minors the most aggressive band.
- CD-7: there is no in-app account-deletion path and no stated retention periods. This doesn't block internal testing, but it blocks any wider Play track.
- CD-8: DPDP Rules 3 and 5–16 (13-May-2027) are scheduled about seven months late in the Phase-2 roadmap. Watch for the proposed advance to 13-Nov-2026.
- OPS-13 / SEC-12: no ALB access logs, RDS log export, VPC flow logs or CloudTrail in code (see CD-4).

**Security (built code)**
- SEC-2 *(verified MEDIUM)*: `submitIdentity` is a KRA/PAN oracle. The 3/day cap applies only to an exact replay; each changed PAN, name or DOB triggers a fresh FP pre-verification and returns field-level mismatch codes. Bank additions are uncapped too, against the spec's own limits of 5 checks per hour and 5 bank accounts.
- SEC-3: no HSTS, nosniff, Referrer-Policy or frame-ancestors on www (OTP-phishing via SSL-strip).
- SEC-4 / OPS-9: the web container shares the task role (S3 docs bucket read/write, SES send) and the network namespace with api and worker.
- SEC-5: `idempotency_keys.response_body` stores decrypted nominee names in plaintext and is never purged.
- SEC-6: consent-OTP send limits count challenges, not sends; email consent sends are uncapped (the reason given for dropping this in the Plan 03 review is wrong).

**Money and plans**
- ML-6 / MR-3 *(verified MEDIUM)*: the compare-and-set gap (theme 1).
- ML-9 *(verified MEDIUM; conflicts with R-12)*: `createPurchase` skips the NAV-grade block, the `fp_bank_old_id` check, null thresholds and `fp_active`, and the wire regex allows negative amounts.
- ML-11 *(verified MEDIUM)*: an ambiguous `payment.create` leaves a CREATING attempt that blocks payment for good, and the purchase is confirmed with no link. Add payment LOOKUP-ADOPT by `amc_order_ids`.
- ML-13 *(verified MEDIUM)*: E21's suite fails as written (the seed lacks `fpBankOldId`; return-route injects have no host), and the consent-first assertions miss RV-03-51's clock steps.
- ML-14: E20 doesn't carry the review's "before E20" conditions (LC-6 trigger accepts CONSUMED_UNUSED; LC-8; RSK-2).
- ML-15: the kill switch only blocks drafts (theme 6).
- ML-16: the daily pilot cap can be raced, and abandoned drafts or failed payments block "Try again".
- ML-17 (R-b): no re-POST ladder exists, so every 4xx becomes REJECTED. Recommend ruling "never re-POST; LOOKUP-ADOPT, then FAILED after two absent checks".
- ML-18: the single-use return link answers a refresh with a raw 404.
- MS-4 *(verified MEDIUM)*: `mandates.poll` and `plans.instalments.sync` have no per-item error isolation.
- MS-9 (KNOWN gap): 4-dp purchase allotments would all be INVALID. Rule now.
- MS-10 (KNOWN R-g): ACTIVE plans are never re-read, so FP auto-cancel and completion never arrive.
- MS-11: an allotment landing after a shortfall creates phantom units (pairs with H8).
- MR-5: UNITS_PENDING T3/T5 breaks close only via the reconcile job, so an open T5 masks the money alarm.
- MR-7: a 4xx on the redemption confirm PATCH leaves it stuck in CONFIRMING with the reservation ACTIVE.
- MR-8: redemption adoption ignores a known `fp_order_id`, and `recon.fp.daily` never compares redemption outcomes.
- MR-9: double rounding of 4-dp `redeemed_units` drifts the ledger by 0.001, which causes false CRITICAL shortfalls on FULL.
- MR-10: the REDEMPTION snapshot omits exit-load text, the ELSS note, the cut-off class and ARN, and RED-02 never shows the scheme's exit load before consent.
- MR-11: portfolio XIRR drops fully redeemed positions.
- MR-12 / OPS-5 *(verified MEDIUM)*: "two-founder approval" is two typed handles, and no IAM permission sets exist (KNOWN in the critic; never adopted).
- MR-13: the live re-check rejects max-amount and ELSS "redeem all" drafts when 15:00 or a NAV tick falls between draft and submit.

**Plan executability (Plan 04)**
- DR-1 *(verified MEDIUM)*: Plan 04 consumes unbuilt E20–E24 symbols throughout, and no re-baseline step exists. The header still says "nothing has run".
- DR-5 / MS-12 / MR-14: every Plan 04 migration number collides with built 0026–0028, so named custom SQL files will not exist. Refer to migrations by `--name`.
- DR-6: F14's `me.get` v2 rewrite regresses the built legal-version resolver (undated documents vanish from AccountScreen).
- DR-7: items the Plan 02/03 reviews assigned to F1, F14, F19 and F24 were never absorbed (deploy.yml masking, the `fp.sync` NaN abort, bank name and `is_primary`, the RSK-2 expiry sweep, the heartbeat id).
- DR-8 / DR-9: stale Global Constraints and anchors (408/429 handling, the duplicate D5 edge, `MANDATE_REGISTRATION` factors, a `git rm` of a non-existent file).
- DR-10 (KNOWN C4): F1/F20/F22/F27 assume E25 is already deployed.
- DR-11 (KNOWN R-25): Dev A's S4 load is about 97 h against about 76 h; F19 and F23 are under-budgeted by about 2×.
- DR-3 *(checked directly)*: F29 and R-39 are scheduled on Diwali leave days, Mon 11-09 and Tue 11-10.

**Operations**
- OPS-2 *(verified MEDIUM)*: SMS alarm paging is weak. AWS can deliver alarm SMS to India over ILDO routes without DLT, but C5's plan to attach DLT template ids does not work on the CloudWatch → SNS path. Email remains the must-work channel.
- OPS-3 *(verified MEDIUM)*: mutable `:latest` tags. If migrate fails after the push, a later runbook `--force-new-deployment` starts the new image against the old schema. Deploy by SHA and make ECR immutable.
- OPS-6 *(verified MEDIUM)*: no prod restore runbook or RPO/RTO, and no FP reconciliation of the restore gap. The cross-region vault is a recorded deferral.
- OPS-7: a single NAT in one AZ and no VPC endpoints, so an AZ outage stops everything, including the ops kill-switch task.
- OPS-8: migrations need not be backward-compatible, yet they run before a rolling deploy. Add an expand/contract rule, a SQL lint and `lock_timeout`.
- OPS-10: jobs that exhaust retries vanish from every signal, and there is no daily ops checklist.
- OPS-11: there is no investor wind-down or exit path if the pilot stops after GO-1, and the kill switch also blocks redemptions.
- OPS-12: CloudFormation runs with `--require-approval never`, so an EIP replacement would silently break the Cybrilla allowlist. Add a `cdk diff` gate and a stack policy.
- OPS-14: no alarms exist between the E25 deploy and F1, and even after F1 there are no RDS storage/CPU-credit alarms, FP error-rate metric, external uptime check or SES reputation alarm.
- OPS-15: Dev A is a single point of failure, and the human behind each role is unconfirmed.

## 6. Low findings (one line each)

- **SEC:**
  - SEC-7: the email "in use" check is an oracle before the OTP.
  - SEC-8: mobile logout never revokes the server session.
  - SEC-9: consent records leave `ip`, `user_agent` and `session_id` empty.
  - SEC-10: `/health/ready` runs DB work unthrottled.
  - SEC-11: `android.allowBackup` is unset.
  - SEC-13: `compose.yaml` binds Postgres and Mailpit to all interfaces.
- **ML:**
  - ML-19: an UNDER_REVIEW purchase is polled every 30 s for ever.
  - ML-20: ORDER_FAILED is never sent, and `schemeName` is missing from ORDER_PLACED.
- **MS:**
  - MS-14 (KNOWN R-h).
  - MS-15: SIP drafts are never cancelled.
  - MS-16: a FEED_UNAVAILABLE run wipes a good holdings snapshot.
- **MR:**
  - MR-15: the XIRR display is unbounded at 30 days (146 trillion %).
  - MR-16: a brief double-count of units during a settlement.
  - MR-17 / OPS-16: the holiday calendar is a placeholder with no owner (missing 2026 NSE dates; 2027 guessed).
  - MR-18: redemption drafts are never cancelled.
- **CS:**
  - CS-11: contacts are filed as `belongs_to: self` without asking the investor.
  - CS-12: legal placeholders contain wrong statements (FATCA reporter, risk legend wording, the "SEBI investor charter for MFDs", 21 *working* days, SMART ODR coverage).
  - CS-13: ARN validity is not enforced server-side.
- **CD:**
  - CD-9: consent SMS bodies exceed the 140-byte SMS Retriever limit.
  - CD-10: the grievance page names no Grievance Officer and says "21 working days".
  - CD-11: the CERT-In NTP decision (O-15) is due after GO-1.
- **OPS:**
  - OPS-17: the heartbeat id is `worker:1` on every task.
  - OPS-18: RDS maintenance windows are unpinned.
  - OPS-19: a removed `boss.schedule` keeps firing.
  - OPS-20: missing runbooks (escalation, restore, deploy/rollback, egress, daily check).
- **DR:**
  - DR-12: stale text (`p4tasks/*.md`, the aws-cdk-lib version, AGENTS.md branch line).

## 7. Checked and found sound

- **Regulatory:**
  - The 3-nominee cap matches SEBI CIR/2026/12676 (29-May-2026).
  - The EOP framework covers Direct plans only, so Platizio's Regular-plan MFD model needs no EOP registration.
  - The 2FA factor table (H-21) complies.
  - Only KRA "Validated" proceeds; PEP and foreign tax residency are blocked.
  - Stamp duty, T+3 working-day payout with 15% interest copy, strict ELSS lock and SIP auto-cancel after 3 failures are all correct.
  - The RBI ₹1 L e-mandate AFA exemption is correctly applied to UPI Autopay.
  - UPI collect was already dropped.
  - DPDP phasing dates in the repo are correct.
  - Data residency is ap-south-1 throughout.
  - Notification bodies carry no PAN or account numbers.
  - Append-only consent, audit and acknowledgement tables are in place.
- **Security (built):**
  - OTP generation, hashing, attempts and lockout are sound, and `requestOtp` gives the same answer for new and existing mobiles.
  - Opaque sessions, `__Host-` cookies, CSRF via Origin and Sec-Fetch-Site, no CORS.
  - BOLA scoping on every built router.
  - Idempotency is keyed by investor.
  - Webhook HMAC, constant-time compare, fail-closed handling and dedupe.
  - Parameterised SQL.
  - AES-256-GCM with row AAD and separate keys.
  - Boot guards; FP secrets reach the worker only.
  - RDS `verify-full`; TLS 1.3 on the ALB.
  - SHA-pinned CI with `permissions: {}`.
- **Money:**
  - The F5 golden vectors (RN/RB/RA/RA-V1) and XIRR V1–V11 were recomputed independently, with 0 mismatches.
  - The FIFO vectors, the 1.5× eNACH ladder and SIP headroom locking are correct.
  - Lot creation is idempotent (`lots_source_order_uq`).
  - Every P/M write runs inside `useConsumed`.
  - Stamp duty arithmetic and the cut-off matrix (apart from CS-6) are correct.
- **Operations:**
  - Every pg-boss cron uses `tz: 'Asia/Kolkata'`, and the IST times match the spec.
  - Stateful resources are retained.
  - Cost and capacity are adequate for the pilot.

## 8. Owner decisions this audit adds

0. **Before Mon 10-12:** re-author the four DLT templates with TRAI typed tags, and confirm the tag character rules with MSG91 before filing (H16).
1. **SMS cap (H12):** separate the consent budget, and decide whether to send to numbers that are neither investors nor invited.
2. **R-a / R-b / R-c:**
   - R-a: option B extended (H6).
   - R-b: never re-POST; LOOKUP-ADOPT, then FAILED after two absent checks (ML-17).
   - R-c: the five FpTransport fixes (token validation and ambiguity, a single 401/403 retry, unparsable 2xx and 3xx treated as ambiguous, `recordCall` never replacing the FP result).
3. **Suitability (H1):** confirm that MISMATCH requires a stored acknowledgement for lumpsum and SIP, and that the warning is emailed.
4. **Consent content (H2/H3):** a per-order execution-only declaration in the consent text; `consent{}` carries only verified channels.
5. **SIP caps (MS-13)** and **4-dp allotments (MS-9)**.
6. **Payout evidence (H9):** probe `bank_credit_reference`; soften the copy until it is proven.
7. **Read-only sandbox probes** for whether FP honours `source_ref_id=`, `plan=` and `folio_number=` (H5), plus ONB-2 and ONB-6.
8. **Plan 04 re-baseline task (about 0.5 d) before S4:** migrations, F1's seed and secrets, F14's resolver, DR-7's absorbed items, and moving F29 off Diwali.
9. **Ops:**
   - deploy by SHA (OPS-3);
   - a restore runbook (OPS-6);
   - a CERT-In log set (CD-4/OPS-13);
   - a wind-down plan (OPS-11);
   - name the humans behind each role (OPS-15).
