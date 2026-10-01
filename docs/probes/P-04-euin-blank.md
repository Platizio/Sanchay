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
| 1 | 2026-10-01 11:30:57 | `POST /v2/mf_purchases` (no euin, no partner) | 200 | `mfp_15f04bc8e8d247b5a3f36f5d1fd2df7b` (old 222) | `8d8b19b16ff5856576efaeee7c275c2b` | `euin` already set in the create response |
| 2 | 2026-10-01 11:35:07 | `POST /v2/mf_purchases` (no euin, no partner) | 200 | `mfp_dc4390a8fe8d4da9b31f9245d1fe48ff` (old 223) | `712b518742e13fee2f2c225b3d6df4f2` | same EUIN |
| 3 | 2026-10-01 11:39:16 | `POST /v2/mf_purchases` (no euin, no partner) | 200 | `mfp_b3459ab076874694956ad6b7d587a6f4` (old 224) | `9d50e34ff7c953868b7d5a924f595a8c` | same EUIN; still set at `submitted` |
| 4 | 2026-10-01 11:43:20 | `POST /v2/mf_purchase_plans` (no euin, no partner, no gateway) | 200 | `mfpp_6cf595d4856b4240b562b8caaec2fe36` | `d92fb963e84394a35dd93bd4d3fdf235` | plan `euin` set; plan shows `gateway: "ondc"` although none was sent |
| 5 | 2026-10-01 11:45:29 | `POST /v2/mf_redemptions` (no euin, no partner) | 200 | `mfr_a1b5c3289e7342109f8a1c7299c92dce` (old 226) | `19aed27312562a45a43ad1b217261e8e` | redemption `euin` set too |

## Evidence
- All five orders above were created **without** `euin` or `partner` in the request body (verified in the logged request). Every response carries the **same** EUIN, `E90····` (one distinct value; the full value is in the local run log and was given to the owner). `partner` and `sub_partner_license_code` are `null`.
- The SIP's first instalment (`mfp_271e77ca90cb4b63b0059f6507be398d`) also carries it.
- Tenant history: all **145** ONDC purchases in the sandbox tenant (v1 never sent `euin`) have the same pattern: `euin` set, `partner` null.

## Result
**FAIL.** FP fills in a tenant-default EUIN on every order type (purchase, purchase plan, instalment, redemption) when none is sent. Omitting `euin` does not produce an EUIN-blank, execution-only order.

**Decision.** PO-2 escalation to Cybrilla before the pilot. H-11 cannot be met as written. `fp.sendPartner` stays false (partner is never filled).

**Follow-ups:**
- Ask Cybrilla (Q12): where does the default EUIN come from (the ONDC signup?), whose EUIN is it, and how do we place execution-only orders with EUIN blank? Can the tenant default be removed, or can an explicit `euin: null` override it?
- Until answered, keep the execution-only declaration in the consent text (Plan 03 E20) and record the EUIN FP returns on each order, so the evidence shows what was sent to the RTA.
- Owner: confirm with compliance whether a default EUIN on execution-only orders is acceptable at all (AMFI execution-only rules).
