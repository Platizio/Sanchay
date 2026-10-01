# P-05: The platform ARN is attached without a per-order field

**Question.** FP has no per-order ARN field; the ARN comes from the tenant's ONDC signup (`docs/research/fp-api.md` §1). Can the platform ARN be seen for a sandbox order anywhere FP exposes?

**Pass criterion.** The value of `SANCHAY_PLATFORM_ARN` appears for the probe order in at least one place: the order object, the ONDC message (`fulfillment.agent.organization.creds`), or a tenant transaction report. If it is visible nowhere in the sandbox, the result is INCONCLUSIVE: ask Cybrilla how to evidence it before G-B8.

**Drives.** G-B8 (ARN/EUIN configuration) and design gate G6; the canary folio check in F20.

## Steps
1. Use the P-04 order, or create one the same way.
2. `GET /v2/mf_purchases/{id}`: search the full response for `ARN-`.
3. `GET /v2/transactions/reports/transaction_list` for the order date: search for the ARN.
4. If Cybrilla can share the ONDC message for the order, record `fulfillment.agent.organization.creds` and `agent.person.id`.

## Run log
| # | Date (IST) | Call | HTTP | FP object id | Request id | Note |
|---|---|---|---|---|---|---|
| 1 | | | | | | |

## Evidence
_Where the ARN appeared (field path) and the trimmed excerpt._

## Result
**PASS / FAIL / INCONCLUSIVE:**

**Decision** (flag value set, or PO-2 escalation raised, with the Cybrilla question number):

**Follow-ups:**
