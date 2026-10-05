# P-07: Allotted units are reported on success

**Question.** Does a successful sandbox purchase return `allotted_units` (3 dp, net of stamp duty), `purchased_price`, `purchased_amount` and `allotted_nav_date`? (Design assumption A2, gate G5.)

**Pass criterion.** Two purchases (amounts ending in 0) reach `successful` with **non-null** `allotted_units` (at most 3 dp), `purchased_price`, `purchased_amount`, and `allotted_nav_date` as a plain `YYYY-MM-DD`. Record how long after `submitted` the units appeared. Null units on `successful` is a FAIL: UNITS_PENDING becomes the normal path, so tell the PO.

**Drives.** Assumption A2 and gate G5; F4's `parseAllotment`, the UNITS_PENDING handling and the `allotted_nav_date` known gap in Plan 04.

## Steps
1. Create, consent, confirm and pay two purchases with amounts ending in 0 (see [lumpsum-flow](lumpsum-flow.md)).
2. Poll `GET /v2/mf_purchases/{id}` until `successful`; record the four fields and the timestamps of each state change.
3. Check that `amount − purchased_amount` equals the stamp duty (0.005%).
4. Make one purchase with an amount ending in 1; record its terminal state and fields (expected: `failed`, units null).

## Run log
| # | Date (IST) | Call | HTTP | FP object id | Request id | Note |
|---|---|---|---|---|---|---|
| 1 | 2026-10-01 11:30:57 → 11:31:04 | Order A `"1000.00"`: create → consent → netbanking payment → confirm | 200 ×4 | `mfp_15f04bc8e8d247b5a3f36f5d1fd2df7b` (old 222), payment 118 | `8d8b19b1…`, `17737571…`, `37d56406…`, `f22682d3…` | `submitted` at 11:31:04 |
| 2 | 2026-10-01 11:31:03 | `POST /api/pg/simulate/payments/118 {status: SUCCESS}` | 200 | payment 118 | `42b97d16dd8e4c12120d6370a583b92b` | payment `SUCCESS` |
| 3 | 2026-10-01 11:33:04 | `POST /api/oms/simulate/orders/222 {status: SUCCESSFUL}` | **400** | old 222 | `cbd9d11e15c8d8a26401a0303cc2d947` | "ONDC gateway orders can't be simulated" |
| 4 | 2026-10-01 11:35:07 → 11:35:13 | Order B `2000` (number) via UPI; payment 119 simulated `SUCCESS` | 200 | `mfp_dc4390a8fe8d4da9b31f9245d1fe48ff` (old 223) | `712b5187…`, `cd5068b5…` | `submitted` at 11:35:13; order simulate also 400 |
| 5 | 2026-10-01 11:39:16 → 11:39:22 | Order C `"1001.00"` (should fail); payment 120 simulated `SUCCESS` | 200 | `mfp_b3459ab076874694956ad6b7d587a6f4` (old 224) | `9d50e34f…`, `f4e69f39…` | `submitted` at 11:39:21; order simulate also 400 |
| 6 | 2026-10-01 11:53 | `POST /api/pg/simulate/payments/118 {status: APPROVED}` | 200 | payment 118 | — | payment `APPROVED`, `settled_at` set; order A still `submitted` |
| 7 | from 11:41 | Watcher: `GET` each order every 5 min for up to 8 h | 200 | A, B, C | — | still `submitted` at the time of writing |
| 8 | 2026-10-05 (re-check) | `GET /v2/mf_purchases/{id}` for A, B and C | 200 ×3 | A, B, C | — | all three `failed`, `failure_code: fp_payment_url_unused`, `failed_at` **2026-10-01 23:00:07 IST**; units, price, amount and NAV date null |
| 9 | 2026-10-05 (re-check) | `GET /v2/mf_purchases/mfp_271e77ca90cb4b63b0059f6507be398d` (P-09's first SIP instalment, funded by the UPI Autopay mandate) | 200 | old 225 | — | still `submitted`, four days after `scheduled_on` |

## Evidence
- Orders A, B and C are paid (simulated) and `submitted`; none has reached `successful` or `failed` yet, including C, which the "ends in 1" rule should fail.
- The order simulator refuses ONDC orders, so settlement depends on the sandbox's own asynchronous ONDC processing.
- Tenant history: none of the 145 sandbox purchases (v1's) ever reached `successful`. v1's failures were `order_expiry` (58), `fp_payment_url_unused` (50; a failure code not in our research), `others` (10), `investor_data_submission_error` (3) and `fp_order_ineligibility` (1).
- Related evidence from P-09: an ONDC **redemption** reached `successful` 10 s after `submitted` and reported `redeemed_units 3.9299` (**4 dp**), `redeemed_price 25.4459`, `redeemed_nav_date "2026-10-01"` (plain date). The folio's holdings fell by **3.930**, so the units FP reports on the order can carry one more decimal than the folio moves by.

- **Addendum (2026-10-05):**
  - Orders A, B and C all **failed** at **23:00:07 IST on 10-01**, about 11.5 h after `submitted`, with `fp_payment_url_unused`.
  - The simulated payment (`SUCCESS`, and `APPROVED` for A) did not count as using the payment URL.
  - The identical `failed_at` on all three points to an end-of-day sweep at 23:00 IST, not a per-order timeout.
  - C (amount ending in 1) failed with the same code, so the "ends in 1" rule was never reached.
  - P-09's mandate-funded instalment, which has no payment URL, is still `submitted` on 10-05. The sweep therefore applies only to orders waiting on a payment URL.

## Result
**PENDING** (allotment not observed). The order flow up to payment works, but the sandbox has not settled any ONDC purchase.

New finding (10-05 addendum): an ONDC purchase whose payment URL is never used fails at **23:00 IST the same day** with `fp_payment_url_unused`, and a simulated payment does not prevent this.

**Decision.** None yet. Keep UNITS_PENDING and F4's 3-dp `parseAllotment` as designed until a purchase settles.

**Follow-ups:**
- Ask Cybrilla: how and when do sandbox ONDC purchases move from `submitted` to `successful`/`failed`? The order simulator says ONDC orders can't be simulated, and paying (SUCCESS, then APPROVED) did not move them.
- Ask Cybrilla:
  - What counts as "using" the payment URL in the sandbox, and can a sandbox ONDC purchase be paid through that URL so that it settles?
  - Is the 23:00 IST failure an end-of-day sweep, and does production behave the same (cut-off time; UPI and netbanking alike)?
- Next attempt: create a purchase and open its payment URL in a browser instead of using the payment simulator, then poll until terminal. Fill the four fields and the stamp-duty check when one settles.
- Keep P-09's instalment `mfp_271e77ca90cb4b63b0059f6507be398d` on the re-check list.
- Plan 03 E21: map `fp_payment_url_unused` to "payment not completed" copy (see [lumpsum-flow](lumpsum-flow.md)).
  - Expect the code up to about 23:00 IST on the order day; the order shows as processing until then.
  - Treat it as a terminal failure with no money taken (confirm with Cybrilla). Recorded in `docs/delivery/plan-errata-backlog.md`.
- Plan 04 (recorded in this PR): FP reports units at 4 dp on redemptions, while holdings move by the 3-dp figure. F5's settlement must round `redeemed_units` to 3 dp before `Ledger.applyExit` (F4's `fifoExit` accepts exactly 3 dp). Check whether purchases also report 4 dp once one settles.
