# Velocity sheet (AI factor)

Defined in `docs/delivery/mvp-sprint-plans.md` §0.2; decisions per ruling R-02. Estimates are human ideal days, **frozen at sprint planning**. Do not re-estimate.

## How the factor is measured
- **Counts only when Done:** merged, CI green, **reviewed by the other developer**, and demoed. Partly done work counts 0.
- **f = Σ(estimates of Done items + overhead actually spent) ÷ (person-days worked × 0.8)**
- **Fri 10-09 (f₁, S1):** f₁ ≥ 1.2 → hold the plan. f₁ < 1.2 → apply trims T1–T6 now, in spec §6 order (pre-approved), and put T7/T8 on the 10-23 agenda.
- **Fri 10-23 (f₂, S2 alone; the steady-state predictor):** ≥ 1.75 no extra trims · 1.67–1.75 T1–T6 · 1.45–1.67 T1–T6 + **T7** (owner decision: web only) · < 1.45 T1–T7 + **T8** (owner decision: no SIP) or move GO-1 to 12-04/12-11.

## S1 (Mon 09-28 → Fri 10-09), plan factor 1.2

| Item (frozen estimate, ideal days) | Est. | Merged | CI green | Reviewed | Demoed | Counts |
|---|---|---|---|---|---|---|
| A1 bootstrap, A2 config/Biome/lefthook/gitleaks | 1.13 | ✅ | ✅ | ☐ | ☐ | |
| A3–A8 `@sanchay/money` | 2.13 | ✅ | ✅ | ☐ | ☐ | |
| A9–A11 validation, wire schemas, domain enums | 1.25 | ✅ | ✅ | ☐ | ☐ | |
| A12 CI (check-brand, gitleaks, audit) | 0.63 | ✅ | ✅ | ☐ | ☐ | |
| B5 contract, B17 auth/me procedures | 0.94 | ✅ | ✅ | ☐ | ☐ | |
| C1 tokens, C2 api-client, C4 UI batch 1, C5 form inputs | 1.88 | ✅ | ✅ | ☐ | ☐ | |
| B1–B4, B6 api scaffold, env guards, KeyService, redaction, compose | 2.44 | ✅ | ✅ | ☐ | ☐ | |
| B7–B9 identity schema, error envelope, bootstrap + health | 2.00 | ✅ | ✅ | ☐ | ☐ | |
| B10–B12 OpenAPI drift, AuditService, SMS/email ports + DLT templates | 1.06 | ✅ | ✅ | ☐ | ☐ | |
| FP probes P-04, P-05, P-07, P-09, lumpsum flow | 1.50 | ☐ | — | ☐ | ☐ | |
| **Pulled forward from S2:** B13–B23 Plan-01 API tail | 5.50 | ✅ | ✅ | ☐ | ☐ | |
| **Pulled forward from S2:** C3, C6–C14 Plan-01 client tail | 5.50 | ✅ | ✅ | ☐ | ☐ | |
| **Pulled forward from S2:** C15 Maestro on device | 0.50 | ✅ | ☐ (not run: no emulator) | ☐ | ☐ | |

> The S2 sprint plan budgets C3, C6–C15 as one 6.0-day line; it is split here (5.5 + 0.5) only so the unrun device check does not zero the whole line. Confirm the split at the demo.

| Measure | Value |
|---|---|
| Person-days worked (both developers, excluding the 10-02 holiday and leave) | |
| Overhead actually spent (review, sandbox/FakeFp upkeep), days | |
| Σ estimates of Done items | |
| **f₁** | |
| Decision (R-02) | |

## Supporting metrics (log daily or per task)
| Date | Agent tasks run | First-pass TDD green (y/n per task) | Review hours (Dev A / Dev B) | Items reopened | Notes |
|---|---|---|---|---|---|
| | | | | | |

## S2 (Mon 10-12 → Fri 10-23), plan factor 1.6
_Copy the S1 table with the S2 backlog (sprint plans §S2) at planning on 10-12._
