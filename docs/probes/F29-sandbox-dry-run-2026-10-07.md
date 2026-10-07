# F29 sandbox dry run (2026-10-07)

**Question.** Do Plan 04 Task F29's four chains pass every step the FP sandbox can reach, and stop only at R-37's sandbox limit?

**Result: PASS.** Every chain exited 0. Onboarding and redemption PASSED every step. Lumpsum PASSED to FP `submitted` and SIP to the first instalment `submitted`; each then recorded one SKIPPED step at the sandbox limit, and SIP cancelled its plan. This is F29's Step 6, run before D4 exists, on D4 extracted from Plan 02 with F29's code (`undici` 7.30.0). It is not G-E4 evidence: the runs are before R-21's window (11-16), and this file is not named `smoke-*`, so `gate-evidence` never reads it.

**Setup.** Host `s.finprim.com`. Credentials came from the git-ignored `apps/api/.env` (v1 names) and were never printed. The reused investor (`mfia_d167…`, old id 23; `docs/probes/README.md`) was read first, read-only: its folio defaults (email, mobile, address, payout bank old id 33) and an `INF209KA1K47` folio holding 395.394 units. No contact appears in this file. The payment return URL was R-11's `https://api.sanchay.in/api/v1/pg/return/probe`, because R-05's sandbox host (decisions page B1) is still open; a simulated payment never redirects.

**Findings.**
- Plan 03 E11's provisioning bodies were all accepted, including the address `state` (`Karnataka`) and `nature` (`residential`) that E11 asked D4's harness to confirm. No nominee was sent, so the related-party `relationship` values are still unconfirmed.
- The POA pre-verification of a simulator PAN (digits 3751) was `completed` and `verified` on the first read.
- FP's payment create, mandate create and simulator responses carry **no status**; only a read does. In run 1 the simulate step therefore passed on HTTP 200 alone. F29 now reads the payment back and needs `SUCCESS` or `APPROVED` (RV-04-F29-1); run 2 read `SUCCESS`.
- The ₹100 redemption settled in 12 s, with `redeemed_units` 3.9268 (4 dp, as P-09 saw).
- Sandbox records created: one investor profile (`invp_9157…`; its account has old id 87; profiles cannot be deleted), two lumpsum purchases, two UPI mandates (33, 34) with two plans (both cancelled) and their first instalments, and one redemption (old id 230).

## Run 1: all four chains, first version

### onboarding (run at 2026-10-07T05:10:41.167Z)

| Step | Status | Detail |
|---|---|---|
| POA pre-verification create | PASSED | id=pv_448f61050483419c9cbb5859d9f1bfb2, status=accepted |
| POA pre-verification result (poll to a final status) | PASSED | status=completed, readiness=verified after 1 read(s) |
| investor profile create | PASSED | id=invp_9157b8202ab14128b412d0006deae741 |
| phone number create | PASSED | id=phone_d1b02747c57048ca886ce1dc4a967491 |
| email address create | PASSED | id=email_aeebfb22545e476b82b5947e947364b9 |
| address create | PASSED | id=addr_59affdacb95e48f486dd8a85cc50dd40 |
| bank account create | PASSED | id=bac_676865cf8e5846cf91752edc7a6c6689, old_id=51 |
| MF investment account create | PASSED | id=mfia_420e01deca3b4665976345b6f8a64b92, old_id=87 |
| folio defaults (PATCH MF investment account) | PASSED | id=mfia_420e01deca3b4665976345b6f8a64b92, folio defaults set |

### lumpsum (run at 2026-10-07T05:10:18.815Z)

| Step | Status | Detail |
|---|---|---|
| scheme catalogue list | PASSED | 100 scheme(s) visible |
| purchase create (H-2 custom checkout, step 1) | PASSED | id=mfp_ebe00663dd0240f4baca898071a1c7be, old_id=231, state=under_review |
| purchase review (poll to pending) | PASSED | state=pending after 2 read(s) |
| purchase consent (PATCH, apart from the state change) | PASSED | state=pending |
| payment create (netbanking, ONDC) | PASSED | payment id=124, status=undefined, token_url returned |
| purchase confirm (PATCH state confirmed) | PASSED | state=confirmed |
| payment simulate SUCCESS (sandbox simulator) | PASSED | payment status=undefined |
| purchase submitted (poll to a final state) | PASSED | state=submitted after 2 read(s) |
| purchase settled with allotted units | SKIPPED | sandbox limit: the FP sandbox keeps a simulator-paid ONDC purchase submitted (P-07); proven by G-E7(a), canary legs A_UPI and A_NETBANKING |

### sip (run at 2026-10-07T05:10:40.050Z)

| Step | Status | Detail |
|---|---|---|
| scheme catalogue list | PASSED | 100 scheme(s) visible |
| mandate create (UPI Autopay, limit 100000) | PASSED | id=33, status=UNDEFINED |
| mandate authorise (UPI intent) | PASSED | upi:// intent returned |
| mandate approve (sandbox simulator) | PASSED | status=UNDEFINED |
| mandate approved (poll to a final status) | PASSED | status=APPROVED after 1 read(s) |
| plan create (monthly, first instalment now) | PASSED | id=mfpp_bdebbe223c4e452eb33ef8c684a1598e, state=created |
| plan confirm with consent (PATCH) | PASSED | state=confirmed |
| plan active (poll to a final state) | PASSED | state=active after 2 read(s) |
| first instalment found (GET purchases by plan) | PASSED | id=mfp_a505769360ef4cce8693e34c95d7b1ea, old_id=232, state=submitted |
| first instalment payment create (NACH) | PASSED | payment id=126, status=undefined |
| first instalment submitted (poll to a final state) | PASSED | state=submitted after 1 read(s) |
| first instalment settled with allotted units | SKIPPED | sandbox limit: the FP sandbox keeps a mandate-funded first instalment submitted (P-09); proven by G-E7(b), canary leg B_SIP |
| plan cancel (F28 form) | PASSED | state=cancelled after 2 read(s) |

### redemption (run at 2026-10-07T05:10:08.799Z)

| Step | Status | Detail |
|---|---|---|
| scheme catalogue list | PASSED | 100 scheme(s) visible |
| redemption create (amount, ONDC) | PASSED | id=mfr_b834a329e3294d91abfdfbf63697909f, old_id=230, state=under_review |
| redemption review (poll to pending) | PASSED | state=pending after 2 read(s) |
| redemption confirm with consent (PATCH) | PASSED | state=confirmed |
| redemption settled (poll to a final state) | PASSED | state=successful, redeemed_units=3.9268 after 5 read(s), 12 s |

## Run 2: lumpsum and SIP after the payment read-back fix

### lumpsum (run at 2026-10-07T05:12:32.274Z)

| Step | Status | Detail |
|---|---|---|
| scheme catalogue list | PASSED | 100 scheme(s) visible |
| purchase create (H-2 custom checkout, step 1) | PASSED | id=mfp_77c5d86d593b4f0f8543d688123766fb, old_id=233, state=under_review |
| purchase review (poll to pending) | PASSED | state=pending after 2 read(s) |
| purchase consent (PATCH, apart from the state change) | PASSED | state=pending |
| payment create (netbanking, ONDC) | PASSED | payment id=127, token_url returned |
| purchase confirm (PATCH state confirmed) | PASSED | state=confirmed |
| payment simulate SUCCESS (sandbox simulator) | PASSED | payment status=SUCCESS after 1 read(s) |
| purchase submitted (poll to a final state) | PASSED | state=submitted after 2 read(s) |
| purchase settled with allotted units | SKIPPED | sandbox limit: the FP sandbox keeps a simulator-paid ONDC purchase submitted (P-07); proven by G-E7(a), canary legs A_UPI and A_NETBANKING |

### sip (run at 2026-10-07T05:12:44.032Z)

| Step | Status | Detail |
|---|---|---|
| scheme catalogue list | PASSED | 100 scheme(s) visible |
| mandate create (UPI Autopay, limit 100000) | PASSED | id=34 |
| mandate authorise (UPI intent) | PASSED | upi:// intent returned |
| mandate approve (sandbox simulator) | PASSED | simulator accepted |
| mandate approved (poll to a final status) | PASSED | status=APPROVED after 1 read(s) |
| plan create (monthly, first instalment now) | PASSED | id=mfpp_f509d02cf70f48d7a80d05de02c803ec, state=created |
| plan confirm with consent (PATCH) | PASSED | state=confirmed |
| plan active (poll to a final state) | PASSED | state=active after 2 read(s) |
| first instalment found (GET purchases by plan) | PASSED | id=mfp_ebfca434288845ca9211408dadce9278, old_id=234, state=submitted |
| first instalment payment create (NACH) | PASSED | payment id=129 |
| first instalment submitted (poll to a final state) | PASSED | state=submitted after 1 read(s) |
| first instalment settled with allotted units | SKIPPED | sandbox limit: the FP sandbox keeps a mandate-funded first instalment submitted (P-09); proven by G-E7(b), canary leg B_SIP |
| plan cancel (F28 form) | PASSED | state=cancelled after 2 read(s) |
