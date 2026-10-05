# Runbook: FP outage

Owner: on-call developer (Dev A primary, Dev B secondary; rota per G-B12). Gate: G-E8 item 1.

## When to use
- Cybrilla FP (FintechPrimitives) returns 5xx or times out, so the worker logs `FpAmbiguousError` and orders,
  plans, mandates or redemptions move to RECONCILING instead of settling.
- FP webhooks stop arriving, or `sanchay-{env}-webhook-signature-failures` fires (more than 3 failed
  signatures in 5 minutes).
- Not for one stuck order: use [Stuck RECONCILING](stuck-reconciling.md).

## Detect
- Alarms: `sanchay-{env}-reconciling-sla`, `sanchay-{env}-job-queue-age`, `sanchay-{env}-webhook-signature-failures`.
- CloudWatch Logs Insights on the worker log group:

```
fields @timestamp, @message | filter @message like /FpAmbiguousError|FpRejectedError/ | sort @timestamp desc | limit 50
```

- Read-only SQL (`sanchay_readonly`, see [ops CLIs](ops-cli.md)):

```
SELECT count(*) FROM app.v_reconciling_orders;
SELECT * FROM app.v_recon_breaks_open;
```

## Act
1. Never retry an FP write by hand and never write to FP from the FP dashboard. Ambiguous writes stay
   RECONCILING; `fp.reconcile.nonfinal` resolves them by LOOKUP-ADOPT (list by `source_ref_id`, adopt) once FP
   answers again.
2. If the outage lasts more than 30 minutes, or RECONCILING keeps growing, stop new purchases with
   [Kill switch](kill-switch.md). Redemptions already consented continue to retry inside their saga window.
3. Tell Cybrilla (support channel filed under G-B6) with the first failure time (IST), the operations that fail
   and two or three `provider_calls` request ids; no investor data.
4. Webhook signature failures only (FP reads still work): compare the time the failures started with the last
   change to `SANCHAY_FP_WEBHOOK_SECRET`. A mismatch after a rotation: finish [Credential rotation](credential-rotation.md)
   with Cybrilla. Failures with no rotation and from unknown sources: treat as an attack and open
   [CERT-In 6 h report](cert-in-6h.md). Polling (`fp.reconcile.nonfinal`) keeps orders moving without webhooks.
5. When FP recovers, run a re-fetch for every row of `v_reconciling_orders` older than 2 hours:

```
$env:SANCHAY_APP_ROLE='ops'; pnpm ops:sync --order <orderId>
SANCHAY_APP_ROLE=ops pnpm ops:sync --order <orderId>
```

## Verify
- `SELECT count(*) FROM app.v_reconciling_orders;` returns only rows younger than 2 hours.
- No new `FpAmbiguousError` for 15 minutes; `sanchay-{env}-reconciling-sla` and `-job-queue-age` are `OK`.
- If this incident turned orders off: M1/M3/M4 are green (`sanchay-{env}-money-invariant-breach` `OK`) before
  [Kill switch](kill-switch.md) turns them back on.

## Escalate
- Outage longer than 2 hours: PO calls the Cybrilla escalation contact; both founders informed.
- A debit with no FP order after recovery: [Refund](refund.md). Units or holdings that disagree with the ledger:
  [UNITS_PENDING](units-pending.md) and keep orders off.

## Evidence
- `docs/probes/incidents/<yyyy-mm-dd>-fp-outage.md`: start and end time (IST), alarms fired, Logs Insights
  counts, `provider_calls` request ids sent to Cybrilla, list of order ids re-synced, kill-switch times.
