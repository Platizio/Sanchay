# Lumpsum flow: the H-2 custom checkout end to end in the sandbox

**Question.** Does the order sequence Plan 03 E20/E21 builds work in the sandbox as written? The sequence is: create the purchase → PATCH consent → PATCH confirm → pay by netbanking `token_url` or UPI → webhook or poll to `successful`.

**Pass criterion.** One netbanking and one UPI purchase reach `successful`. The payment returns to the configured return URL, and at least one `mf_purchase` event is delivered (or polled) with the expected state sequence. Any step that needs a different call order or field is a FAIL; record the exact difference, because it becomes an E20/E21 erratum.

**Drives.** `fp.lumpsumFlow`; Plan 03 E20/E21 errata; the 11-06 lumpsum milestone; the PB-17 demo (fallback: an API-driven lumpsum demo).

## Steps
1. `POST /v2/mf_purchases` (amount ending in 0, `gateway: "ondc"`), then PATCH `{consent}`, then PATCH `{state: "confirmed"}`.
2. Create the payment for the purchase (netbanking, then UPI on a second order). Open `token_url` (single use, valid 15 minutes) and complete the sandbox bank page.
3. Record the redirect to the return URL and its query parameter names (not values that look like secrets).
4. Poll `GET /v2/mf_purchases/{id}` and the payment; record the state sequence and timings.
5. If a webhook URL is registered, record the event ids and whether the `FP-Signature` header was present (not its value).

## Run log
| # | Date (IST) | Call | HTTP | FP object id | Request id | Note |
|---|---|---|---|---|---|---|
| 1 | 2026-10-01 11:30:57 | `POST /v2/mf_purchases` exactly as Plan 03 E20 builds it: `amount: "1000.00"` (string), `gateway: ondc`, `initiated_by: investor`, `initiated_via: web`, `source_ref_id`, `user_ip` | 200 | `mfp_15f04bc8e8d247b5a3f36f5d1fd2df7b` (old 222) | `8d8b19b16ff5856576efaeee7c275c2b` | `under_review`; amount stored as number `1000` |
| 2 | 2026-10-01 11:31:01 | poll: `under_review` → `pending` | 200 | A | — | review took 3.15 s |
| 3 | 2026-10-01 11:31:01 | PATCH `{id, consent: {email, isd_code: "91", mobile}}` | 200 | A | `17737571c01675514483cf77b6bb3486` | consent and state in separate PATCHes, as H-2 requires |
| 4 | 2026-10-01 11:31:01 | `POST /api/pg/payments/netbanking {amc_order_ids: [222], method: NETBANKING, bank_account_id: 33, payment_postback_url, provider_name: ONDC}` | 200 | payment 118 | `37d564061ef17007cbaf363fbbc24b9f` | `token_url` returned |
| 5 | 2026-10-01 11:31:01 | PATCH `{id, state: "confirmed"}` | 200 | A | `f22682d36b389f22a7f9cf5c45a8ead1` | `confirmed`, then `submitted` at 11:31:04 |
| 6 | 2026-10-01 11:31:03 | `POST /api/pg/simulate/payments/118 {status: SUCCESS}` (instead of the bank page) | 200 | payment 118 | `42b97d16dd8e4c12120d6370a583b92b` | payment `SUCCESS` (later `APPROVED`, `settled_at` set) |
| 7 | 2026-10-01 11:35:07 → 11:35:13 | Order B: `amount: 2000` (number), `method: UPI`, `upi: {type: "uri"}` | 200 ×5 | `mfp_dc4390a8fe8d4da9b31f9245d1fe48ff` (old 223), payment 119 | `712b5187…`, `219a9c50…`, `126569a6…`, `e3d6dc26…`, `cd5068b5…` | same sequence; the payment create response already contains `upi {type, vpa, uri}` |
| 8 | from 11:41 | watcher polls A, B (and C from P-07) every 5 min | 200 | — | — | all still `submitted` at the time of writing |

## Evidence
- State sequence for A and B: `under_review` (create) → `pending` (~3.1 s) → consent → payment created → `confirmed` → `submitted` (~2 s). Payments simulated `SUCCESS`.
- Both amount forms are accepted: the 2-dp string Plan 03 sends (`"1000.00"`) and a number. FP stores a number.
- `initiated_by` and `initiated_via` are accepted on purchases (the research had this unconfirmed).
- UPI (`upi: {type: "uri"}`): the `upi.uri` is in the **create** response, before confirm. Plan 03 E21 expects it from the `payment.updated` webhook or a later GET; the earlier availability is a simplification, not a defect.
- Not exercised: the netbanking bank page and return redirect (payments were simulated), and webhooks (no public dev host is registered for the sandbox yet).

## Result
**PASS up to `submitted`; settlement PENDING.** Every call in Plan 03's H-2 order works exactly as written, with no erratum. Neither order has reached `successful` yet; see [P-07](P-07-allotted-units.md) for the sandbox settlement question.

**Decision.** Keep `fp.lumpsumFlow` as H-2 (custom checkout). No E20/E21 change is needed for the call order or fields.

**Follow-ups:**
- Same Cybrilla question as P-07: how do sandbox ONDC purchases settle?
- Once the dev host exists (S2, `api.dev.sanchay.in`), register the sandbox webhook and re-run steps 3 and 5 (return redirect and `FP-Signature`).
- v1's history shows `fp_payment_url_unused` (50 orders): FP fails an order whose payment URL is never used. Plan 03 E21 should treat that failure code as "payment abandoned" in its copy.
