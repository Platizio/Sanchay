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
| 1 | | | | | | |

## Evidence
_State sequence with timestamps for each order; the payment's state; the event ids._

## Result
**PASS / FAIL / INCONCLUSIVE:**

**Decision** (flag value set, or PO-2 escalation raised, with the Cybrilla question number):

**Follow-ups:**
