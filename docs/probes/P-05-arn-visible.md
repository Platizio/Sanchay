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
| 1 | 2026-10-01 11:30–11:50 | `GET` of every probe order (3 purchases, 1 plan, 1 instalment, 2 redemptions) | 200 | see P-04 | — | no `ARN` string in any response |
| 2 | 2026-10-01 11:28 | `GET /v2/mf_purchases?mf_investment_account=…` across all 86 sandbox accounts (145 purchases) | 200 | — | — | no `ARN` string in any purchase |
| 3 | 2026-10-01 11:44 | `GET /v2/mf_folios?mf_investment_account=…` | 200 | 2 folios | — | no ARN/broker/distributor field; keys are holder, contact, nominee and payout details only |
| 4 | 2026-10-01 11:44 | `GET /api/oms/reports/holdings?investment_account_id=23` | 200 | — | — | no ARN |
| 5 | 2026-10-01 11:44:28 | `POST /v2/mf_purchases/reports/mf_purchase_list` and `POST /v2/transactions/reports/transaction_list` | 200 | — | — | `{object, report, data, filter_by}` with no rows for the window (filters need tuning); `GET` on the purchase report is 404 |

## Evidence
- Purchase, plan and redemption objects have `partner` (null), `sub_partner_license_code` (null) and `euin` (tenant default, see P-04). There is no ARN-like field.
- `SANCHAY_PLATFORM_ARN` is not set yet, so a found value could not have been compared anyway.

## Result
**INCONCLUSIVE.** The ARN is not visible in any FP object or report in the sandbox, consistent with "no per-order ARN field".

**Decision.** No flag change. ARN evidence must come from Cybrilla (the ONDC message for a sandbox order) and, for G-B8, from the RTA/AMC statement of the canary folio (F20).

**Follow-ups:**
- Ask Cybrilla: show the ONDC `fulfillment.agent.organization.creds` for one of the run-1 order ids above, and confirm the tenant's registered ARN.
- Owner: add the platform ARN to `apps/api/.env` as `SANCHAY_PLATFORM_ARN=ARN-…` so later runs can compare it.
- Re-run step 5 with the report's documented filters once known (both reports returned no rows for a one-day window).
