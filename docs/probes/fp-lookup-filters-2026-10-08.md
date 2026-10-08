# FP lookup filters (2026-10-08)

**Question.** Do the class-R lookups that Plan 03 E11's LOOKUP-ADOPT runs before each provisioning write actually filter on the FP sandbox? E11 calls `GET /v2/investor_profiles?pan=`, `GET /v2/{phone_numbers,email_addresses,addresses,bank_accounts,related_parties}?profile=` and `GET /v2/mf_investment_accounts?primary_investor=`.

**Result: FAIL for `mf_investment_accounts?primary_investor=`; PASS for the other six.**

**Setup.** Host `s.finprim.com`, FP tenant token from the git-ignored `apps/api/.env` (v1 names; never printed). Read-only: the only non-GET call was the token request. The reused probe investor (`mfia_d167…`, old id 23; `README.md`) supplied a real profile id and PAN. A made-up id (`invp_000…0`) and a made-up PAN (`ZZZZZ9999Z`) tested whether each filter is applied or silently ignored. Script: a scratch Python file (not committed). It printed counts and booleans only.

## Run log

| Lookup | Real value: rows | Every row matches | Made-up value: rows | Verdict |
|---|---|---|---|---|
| `investor_profiles?pan=` | 1 (the probe profile) | yes | 0 | filters |
| `phone_numbers?profile=` | 1 | yes | 0 | filters |
| `email_addresses?profile=` | 1 | yes | 0 | filters |
| `addresses?profile=` | 1 | yes | 0 | filters |
| `bank_accounts?profile=` | 11 | yes | 0 | filters |
| `related_parties?profile=` | 0 | n/a | 0 | filters (no rows to compare) |
| `mf_investment_accounts?primary_investor=` | 87 | **no** | **87** | **ignored** |
| `mf_investment_accounts?primary_investor_id=` | 87 | no | 87 | ignored |
| `mf_investment_accounts?profile=` | 87 | no | 87 | ignored |
| `mf_investment_accounts?investor=` | 0 | n/a | 0 | not a match key |
| `mf_investment_accounts?primary_investor_pan=` | 1 (the probe account) | yes | 0 | **filters** |

Other observations:
- With no filter, `mf_investment_accounts` returns all 87 tenant accounts in one `{object, data}` list. `page`, `size`, `limit` and `per_page` change nothing.
- The first row of that list belongs to a different investor than the probe's.
- The five child collections return HTTP 400 without `profile=`. `investor_profiles` returns 200 with an empty `data` without a filter.
- An `mf_investment_account` carries `primary_investor_pan` (and second/third investor PANs).

## Decision

`apps/api/src/modules/onboarding/provision.job.ts:325` adopts `(await this.fp.mfInvestmentAccountsFor(profile))[0]`. On FP as observed, that links a new investor to the first account in the tenant, which is another person's account. Orders would then be placed into it. This is a must-fix in the Plan 03 final-review fix wave:
1. `FpProvision.mfInvestmentAccountsFor` queries `primary_investor_pan=<PAN>`.
2. It keeps only rows whose `primary_investor` equals the profile id (defence in depth if a filter is ignored).
3. LOOKUP-ADOPT applies the same row check to the other lookups (`pan`, `profile`), though they filter today.

The FakeFp must model the ignored filter, so the int tests catch a regression.
