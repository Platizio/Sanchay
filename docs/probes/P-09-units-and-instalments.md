# P-09: Redeem by units on ONDC, and SIP plan features

**Question.**
- (a) Does `POST /v2/mf_redemptions` with `units` work on an ONDC folio? The POA docs say yes; the API reference says units are RTA only (`docs/research/fp-api.md`, ⚠ CONFLICT on redemptions).
- (b) For a purchase plan on ONDC: is `generate_first_installment_now` accepted, and do pause (`skip_instructions`), quarterly frequency and step-up work?

**Pass criterion.**
- (a) PASS when a units redemption on the probe folio reaches `successful` with `redeemed_units` equal to the requested units. A failure forces trim T5 and a PO-2 note.
- (b) Record each feature as SUPPORTED or REJECTED, with FP's error text. These results set the plan flags; there is no single pass/fail.

**Drives.** `features.redeemByUnits` (T5; Plan 04 F6/F17), `features.sipPause`, `fp.sipQuarterly`, PO-6 step-up, and F2's first-instalment handling.

## Steps
1. You need a folio holding units (from P-07).
2. (a) `POST /v2/mf_redemptions` with `units` (3 dp, for example `1.000`) and `gateway: "ondc"`; consent, confirm, and poll to a terminal state. Record `redeemed_units`, `redeemed_amount` and `redeemed_nav_date`.
3. (a) Control: repeat with `amount` (ending in 0).
4. (b) `POST /v2/mf_purchase_plans`, MONTHLY, with `generate_first_installment_now: true`. Record whether it is accepted and when the first instalment appears (`GET /v2/mf_purchases?plan=<id>`).
5. (b) `POST /v2/mf_purchase_plans/{id}/skip_instructions {from, to}`; then try a QUARTERLY plan, and a step-up plan if FP exposes one. Record each response.

## Run log
| # | Date (IST) | Call | HTTP | FP object id | Request id | Note |
|---|---|---|---|---|---|---|
| 1 | | | | | | |

## Evidence
| Feature | SUPPORTED / REJECTED | FP response excerpt |
|---|---|---|
| Redeem by units (ONDC) | | |
| Redeem by amount (control) | | |
| `generate_first_installment_now` | | |
| Pause (`skip_instructions`) | | |
| Quarterly plan | | |
| Step-up | | |

## Result
**PASS / FAIL / INCONCLUSIVE** (for part a):

**Decision** (flag values set, or PO-2 escalation raised, with the Cybrilla question number):

**Follow-ups:**
