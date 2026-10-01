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
| 1 | | | | | | |

## Evidence
_For each order: `state`, `allotted_units`, `purchased_price`, `purchased_amount`, `allotted_nav_date`, and the time units appeared._

## Result
**PASS / FAIL / INCONCLUSIVE:**

**Decision** (flag value set, or PO-2 escalation raised, with the Cybrilla question number):

**Follow-ups:**
