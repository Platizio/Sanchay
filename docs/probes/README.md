# Cybrilla sandbox probes (S1, PB-12)

Probes answer questions the plans cannot settle from the documentation. Each result sets a flag or triggers a PO-2 escalation, so every probe records a dated run with request ids, not just a summary.

| Probe | Question | Decision it drives | Due |
|---|---|---|---|
| [P-04](P-04-euin-blank.md) | Does an ONDC order without `euin`/`partner` stay EUIN-blank, or does FP auto-fill one? | H-11 (omit both); execution-only declaration in the consent text; `fp.sendPartner` | Fri 10-09 |
| [P-05](P-05-arn-visible.md) | Is the platform ARN attached to orders, given there is no per-order field? | G-B8; design gate G6 (ARN attribution) | Fri 10-09 |
| [P-07](P-07-allotted-units.md) | Does a successful purchase report `allotted_units`, price, amount and NAV date? | Assumption A2, gate G5; how often UNITS_PENDING happens | Fri 10-16 |
| [P-09](P-09-units-and-instalments.md) | Redeem by units on ONDC? First SIP instalment, pause, quarterly, step-up? | `features.redeemByUnits` (T5), `features.sipPause`, `fp.sipQuarterly`, PO-6 step-up | Fri 10-16 |
| [Lumpsum flow](lumpsum-flow.md) | Does the H-2 custom checkout work end to end in the sandbox? | `fp.lumpsumFlow`; the 11-06 lumpsum milestone; the PB-17 demo fallback | Fri 10-09 |

## Before any probe
1. Fill in `.env.sandbox` (git-ignored), then run `node scripts/sandbox-check.mjs`. The fp token line (and poa, for pre-verification) must say OK.
2. Create a sandbox investor with an `mf_investment_account` (existing-KYC path; `docs/research/fp-api.md` §4). These are sandbox records: never use a real person's PAN.
3. Sandbox rules (research §3): **amounts ending in 0 succeed and amounts ending in 1 fail** after ONDC submission, and only **ABSL and ICICI Pru** schemes exist.
4. Send `consent` exactly as Plan 03 E20 will (email, mobile, isd_code), so the probe exercises the real shape.
5. Stay under the sandbox rate limit of 25 operations per second.

## Recording a run
- Add one "Run log" row per call: date, method and path, HTTP status, FP object id, request id. **Never** record tokens, client secrets or full bodies containing personal data.
- Paste trimmed response excerpts (only the fields the probe is about) under "Evidence".
- Set **Result** to PASS, FAIL or INCONCLUSIVE, and fill **Decision** with the flag value or the escalation raised.
- Commit the filled file on a branch (`docs/probes-<id>`). The owner reviews the readout at the S1 demo (Fri 10-09).

## Shared sandbox context (fill once)
| Item | Value |
|---|---|
| Tenant name | |
| Sandbox investor (`inv_…`) | |
| Investment account (`mfia_…` and old id) | |
| Folio(s) used | |
| Scheme ISINs used | |
| Who ran the probes, and dates | |
