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
1. Credentials live in `apps/api/.env` (git-ignored; v1 names `FINPRIM_*`, `CYBRILLA_PRE_VERIFICATION_*` are accepted until Plan 02 renames them). Run `node scripts/sandbox-check.mjs`: the FP tenant token and POA token lines must say OK.
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
| Tenant name | The FP sandbox tenant in `FINPRIM_TENANT_NAME` (`apps/api/.env`); host `s.finprim.com` |
| Sandbox investor | A v1 test investor (KYC-compliant simulator PAN `XXXPX3751X`), reused because FP profiles cannot be deleted |
| Investment account (`mfia_…` and old id) | `mfia_d167e151153f48b08a148c8187e189d1`, old id 23. Folio defaults complete; payout bank old id 33 (savings, account ending `1193`) |
| Folio(s) used | New folios from the run-1 purchases (pending allotment); v1 sandbox folio `I5II…NK` (ABSL Credit Risk, 399.324 units) for the redemptions |
| Scheme ISINs used | `INF209K01165` (ABSL Large & Mid Cap, regular growth) for purchases and plans; `INF209KA1K47` (ABSL Credit Risk) for redemptions |
| Who ran the probes, and dates | Claude, scripted (`scratchpad` runner; every call logged with masked PII), 2026-10-01 11:30–11:50 IST, plus background watchers for settlement |

## Run 1 summary (2026-10-01)

| Probe | Result | One line |
|---|---|---|
| P-04 | **FAIL** | FP auto-fills one tenant-default EUIN on every order type even when `euin`/`partner` are omitted. |
| P-05 | **INCONCLUSIVE** | No ARN in any FP object or report; FP has no per-order ARN field. Needs Cybrilla's ONDC-message evidence or the canary RTA statement. |
| P-07 | **PENDING** | Three paid orders are `submitted`; ONDC orders cannot be force-settled ("ONDC gateway orders can't be simulated"). Watcher running. |
| P-09 | **(a) FAIL, (b) answered** | Units redemption fails at the ONDC gateway (`order_failure_at_gateway`), so T5 is forced; an amount redemption succeeded in 10 s. First instalment now: supported; pause: supported; quarterly: rejected; step-up: not exposed; UPI Autopay: supported. |
| Lumpsum flow | **PASS to `submitted`; settlement pending** | Plan 03's H-2 order works as written (review ~3 s); string amount `"1000.00"` accepted. |

**Plan errata found:** Plan 04 F4 holdings envelope (fixed in this PR: RV-04-F4-1); Plan 02 D4 `expand` (RV-02-15). Questions for Cybrilla are listed in each probe's follow-ups.
