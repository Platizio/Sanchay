# P-04: EUIN stays blank on an execution-only ONDC order

**Question.** When a purchase is created with `gateway: "ondc"` and **no** `euin` and **no** `partner`, does FP or the ONDC tenant setup auto-fill a default EUIN? (`docs/research/fp-api.md` §1, ⚠ UNCONFIRMED 1: FP's ONDC examples show `"euin": "E457992"` even without a partner.)

**Pass criterion.** The created `mf_purchase` has `euin` null or absent, both right after creation **and** once it reaches `submitted`. The same holds for a purchase plan. A filled-in EUIN is a FAIL: raise it with Cybrilla (letter question Q12) before the pilot.

**Drives.** H-11 (omit `euin` and `partner` everywhere); `fp.sendPartner` stays false; the execution-only declaration lives in the consent text (Plan 03 E20).

## Steps
1. `POST /v2/mf_purchases` for a sandbox scheme, amount ending in 0, `gateway: "ondc"`, `initiated_by: "investor"`, no `euin`, no `partner`.
2. `GET /v2/mf_purchases/{id}` straight away; record `euin` and `partner`.
3. PATCH `{consent}`, then PATCH `{state: "confirmed"}`, then pay (see [lumpsum-flow](lumpsum-flow.md)). GET again once the order is `submitted`.
4. Repeat once for a purchase plan (`POST /v2/mf_purchase_plans`) and record the same two fields.

## Run log
| # | Date (IST) | Call | HTTP | FP object id | Request id | Note |
|---|---|---|---|---|---|---|
| 1 | | | | | | |

## Evidence
_Trimmed excerpts: `id`, `state`, `euin`, `partner` for each GET._

## Result
**PASS / FAIL / INCONCLUSIVE:**

**Decision** (flag value set, or PO-2 escalation raised, with the Cybrilla question number):

**Follow-ups:**
