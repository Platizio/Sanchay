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
| 1 | 2026-10-01 11:45:29 | (a) `POST /v2/mf_redemptions {units: 1}` on v1 folio `I5II…NK` (`INF209KA1K47`, 399.324 units) | 200 | `mfr_a1b5c3289e7342109f8a1c7299c92dce` (old 226) | `19aed27312562a45a43ad1b217261e8e` | review → `pending` in ~3 s |
| 2 | 2026-10-01 11:45:32 | PATCH `{state: confirmed, consent}` with the folio's registered contacts | **400** | — | `1f1798b3b28f58c3f402718c3c5c20ba` | the sandbox folio has **no registered email/mobile**: "email or mobile number should be present" |
| 3 | 2026-10-01 11:49:55 | PATCH `{state: confirmed, consent}` with the account's `folio_defaults` contacts | 200 | old 226 | `dd0944f7f04a485de8ecd848e8a95918` | `submitted` 11:49:57 → **`failed` 11:50:08, `order_failure_at_gateway`** |
| 4 | 2026-10-01 11:47:33 → 11:50:00 | (a) control `POST /v2/mf_redemptions {amount: 100}`, then confirm the same way | 200 | `mfr_efa7c380b88c4949b649d1e21dc5df23` (old 227) | `b49c289e…`, `5ed99c19…` | `submitted` 11:50:02 → **`successful` 11:50:12** |
| 5 | 2026-10-01 11:43:20 | (b) `POST /v2/mf_purchase_plans` MONTHLY, `generate_first_installment_now: true`, eNACH mandate 26 | 200 | `mfpp_6cf595d4856b4240b562b8caaec2fe36` | `d92fb963e84394a35dd93bd4d3fdf235` | `created` → `review_completed` in ~4 s |
| 6 | 2026-10-01 11:43:25 | PATCH `{id, consent, state: confirmed}` | 200 | plan | `e59aa0a8f6b9e2385263cef74cef9766` | `active` ~5 s later; first instalment `mfp_271e77ca90cb4b63b0059f6507be398d` (old 225), `scheduled_on` today, `submitted` |
| 7 | 2026-10-01 11:43:30 | `POST /api/pg/payments/nach {mandate_id: 26, amc_order_ids: [225]}` | 200 | payment 121 | `e8361728632a92c2aafe2a9170f8d241` | the first instalment needs its NACH payment created by us (as v1 found) |
| 8 | 2026-10-01 11:43:30 | `POST /v2/mf_purchase_plans/{id}/skip_instructions {from: 2026-11-05, to: 2026-11-15}` | 200 | `psi_6af23a8f6a81476b868b6aa5fdf7c0c8` | `39bf5142f984a569555219d2d73eaab1` | `PENDING`, later `ACTIVE` |
| 9 | 2026-10-01 11:43:31 | `POST /v2/mf_purchase_plans/cancel {id, cancellation_code: invest_later}` | 200 | plan | `19fc43ab32af8c5a2d5021409d9888f0` | plan `cancelled`, but FP recorded `cancellation_code: custom_reason` |
| 10 | 2026-10-01 11:43:31 | (b) `POST /v2/mf_purchase_plans` QUARTERLY | **400** | — | `fb76e1eca319365b0de269b544df7370` | "only monthly and daily frequency supported" |
| 11 | 2026-10-01 11:44:25 | `POST /api/pg/mandates {mandate_type: UPI, limit 100000, provider CYBRILLAPOA}`, then authorise and simulate `APPROVED` | 201 / 200 / 200 | mandate 31 | `ecd6db21…`, `6a13adca…`, `84481602…` | authorise returns `upi {type, vpa, uri}` (`upi://…`), no `token_url`; status `APPROVED`. Lowercase `"upi"` also accepted (mandate 32) |
| 12 | 2026-10-01 15:01–15:02 | Addendum: **redeem ALL** with `POST /v2/mf_redemptions` sending **neither** `amount` nor `units`, on v1 folio `UAVP…` (`INF209KA1K47`, 399.324 units), confirmed with the `folio_defaults` contacts | 200 / 200 | `mfr_c35696fbcf3a4e11af6dd54181821d97` (old 228) | — | `under_review → pending → submitted → successful` (submitted 15:02:05, successful 15:02:15); `redeemed_units 399.324`, `redeemed_amount 10161.15`, `redeemed_price 25.4459`; folio holdings → 0 |

## Evidence
| Feature | SUPPORTED / REJECTED | FP response excerpt |
|---|---|---|
| Redeem by units (ONDC) | **REJECTED at the gateway** | created and confirmed, then `failed`, `failure_code: order_failure_at_gateway` |
| Redeem by amount (control) | SUPPORTED | `successful`; `redeemed_units 3.9299` (4 dp), `redeemed_amount 100`, `redeemed_price 25.4459`, `redeemed_nav_date "2026-10-01"`; holdings 399.324 → 395.394 |
| Redeem ALL (neither amount nor units) | SUPPORTED | `successful` in 10 s; `redeemed_units 399.324` (the whole holding, 3 dp), `redeemed_amount 10161.15`; holdings → 0. F5's ALL FULL form works on ONDC. |
| `generate_first_installment_now` | SUPPORTED | plan accepted; first instalment created at once (`scheduled_on` today, `submitted`); `next_installment_date 2026-11-10`, `remaining_installments 5` |
| Pause (`skip_instructions`) | SUPPORTED (sandbox) | `200`, `PENDING` → `ACTIVE` |
| Quarterly plan | REJECTED | `400`: "only monthly and daily frequency supported" |
| Step-up | NOT EXPOSED | no step-up parameter in the plan API; not tested |
| UPI Autopay mandate | SUPPORTED (sandbox) | `201`; authorise returns a `upi://` URI; simulated approval gives `APPROVED` |
| Plan cancel | SUPPORTED | `cancelled`; the sent `cancellation_code` is not kept (`custom_reason` stored) |

## Result
**(a) FAIL**: a units redemption fails at the ONDC gateway. **(b) Answered** (table above).

**Decision.**
- T5 (redeem by units) is forced: `features.redeemByUnits=false`. Do not build F6/F17. PO-2 note: units mode is unavailable on ONDC per this sandbox run.
- Redeem ALL works on ONDC without units (addendum, 15:02 IST), so F5's ALL FULL path (send neither amount nor units) stands.
- `features.sipPause` may be enabled in a later phase (pause works on ONDC in the sandbox); PO-6 step-up stays out (not exposed).
- `fp.sipQuarterly=false` (matches the MVP's monthly-only rule).
- F2's UPI Autopay rail is usable in the sandbox; its first instalment must be paid with `POST /api/pg/payments/nach` when `generate_first_installment_now` is used.

**Follow-ups:**
- Ask Cybrilla: is redeem-by-units on ONDC unsupported, or a sandbox limitation? (POA capabilities list it.)
- Ask Cybrilla: why is `cancellation_code` stored as `custom_reason`? F28 should not rely on the code it sends.
- Plan 04 (recorded in this PR): F5 settlement must round FP's 4-dp `redeemed_units` to 3 dp before `Ledger.applyExit`; the observed holdings change was 3.930 for 3.9299 reported.
- Plan 03/04: when a folio has no registered contacts, FP accepts consent with the account's `folio_defaults` contacts.
