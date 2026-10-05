# Runbooks

G-E8 (spec §7) requires these 13 runbooks before GO-1. `pnpm check-runbooks` (F24) fails the build when
one is missing, lacks the shared shape (When to use, Detect, Act, Verify, Escalate, Evidence), puts `&&` or
the space form of `--filter` in a command, gives a PowerShell `$env:` command without its Git Bash form, or
contains a real-looking mobile number or PAN.

| # | Runbook | Typical trigger |
|---|---|---|
| 1 | [FP outage](fp-outage.md) | FP 5xx/timeouts, `sanchay-{env}-webhook-signature-failures` |
| 2 | [SMS outage](sms-outage.md) | `sanchay-{env}-otp-send-failure-rate`, `sanchay-{env}-sms-cap-reached` |
| 3 | [Stuck RECONCILING](stuck-reconciling.md) | `sanchay-{env}-reconciling-sla`, PROCESSING past T+2 |
| 4 | [UNITS_PENDING](units-pending.md) | `orders.units.reconcile` WARNING (T+3) / CRITICAL (T+5) break |
| 5 | [Refund](refund.md) | debit without a live order, refund overdue |
| 6 | [Payout delayed](payout-delayed.md) | `payout.watch` marks a redemption DELAYED (past T+3) |
| 7 | [Worker down](worker-down.md) | `sanchay-{env}-worker-heartbeat-stale`, `-job-queue-age`, `-alb-5xx`, `-target-unhealthy` |
| 8 | [Kill switch](kill-switch.md) | `sanchay-{env}-money-invariant-breach` (M1/M3/M4), any money incident |
| 9 | [Credential rotation](credential-rotation.md) | scheduled rotation, leaked secret (F1) |
| 10 | [CERT-In 6 h report](cert-in-6h.md) | any reportable cyber incident |
| 11 | [DPDP breach](dpdp-breach.md) | personal data breach |
| 12 | [Account closure and data requests](account-closure-dsr.md) | closure email, DPDP access/correction/erasure request |
| 13 | [Assisted contact and bank change](assisted-contact-bank-change.md) | investor asks to change mobile, email, bank or nominee |

Related references (not G-E8 items): [ops CLIs](ops-cli.md) (F7: how to run every `ops:*` CLI in an
environment with `SANCHAY_APP_ROLE=ops`, and how to open a `sanchay_readonly` SQL session) and
[Android release](android-release.md) (F18).

## Alarm to runbook map (F1's ten alarms)

| Alarm | Runbook |
|---|---|
| `sanchay-{env}-alb-5xx`, `sanchay-{env}-target-unhealthy` | [Worker down](worker-down.md) (API section) |
| `sanchay-{env}-worker-heartbeat-stale`, `sanchay-{env}-job-queue-age` | [Worker down](worker-down.md) |
| `sanchay-{env}-reconciling-sla` | [Stuck RECONCILING](stuck-reconciling.md) |
| `sanchay-{env}-money-invariant-breach` | [Kill switch](kill-switch.md), then the runbook for the cause |
| `sanchay-{env}-webhook-signature-failures` | [FP outage](fp-outage.md) (webhook section); a sustained burst also opens [CERT-In 6 h report](cert-in-6h.md) |
| `sanchay-{env}-otp-send-failure-rate`, `sanchay-{env}-sms-cap-reached` | [SMS outage](sms-outage.md) |
| `sanchay-{env}-nav-age` | no G-E8 runbook: verify the AMFI file, then `ops:nav-release` with two founders (spec §4.6, D9) |

## Rules every runbook follows

- Ops never writes to FP and no CLI writes an order, plan, mandate or redemption status (spec §4.6). The
  only levers are `ops:sync` (enqueue a re-fetch), `ops:kill-switch`, `ops:refund-utr`, `ops:nav-release`
  and `ops:invite`.
- Every ops CLI in a deployed environment runs as a one-off ECS task with `SANCHAY_APP_ROLE=ops` and DB user
  `sanchay_app` (R-16); the exact `aws ecs run-task --overrides` command is in [ops CLIs](ops-cli.md).
  Runbooks show the local form, for example:

```
$env:SANCHAY_APP_ROLE='ops'; pnpm ops:sync --order <orderId>
SANCHAY_APP_ROLE=ops pnpm ops:sync --order <orderId>
```

- SQL in a deployed environment is read-only, as `sanchay_readonly`, against the `v_*` views (no `*_enc`
  column is readable).
- Evidence goes in `docs/probes/incidents/<yyyy-mm-dd>-<runbook>.md`: times in IST, order and challenge ids,
  alarm names, commands run and their output. Never a mobile number, email, PAN, bank account or name.
