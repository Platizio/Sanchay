# Runbook: Stuck RECONCILING

Owner: on-call developer (Dev A primary, Dev B secondary; rota per G-B12). Gate: G-E8 item 3.

## When to use
- An order, plan, mandate or redemption has been RECONCILING for more than 2 hours
  (`sanchay-{env}-reconciling-sla`), or a purchase has been PROCESSING for more than T+2 (spec §4.6).
- For units that are late after FP reports success, use [UNITS_PENDING](units-pending.md) instead.

RECONCILING means an FP write may or may not have happened (timeout, 5xx). The worker resolves it by
LOOKUP-ADOPT: it lists FP objects by `source_ref_id` (our id) and adopts the match. Ops only triggers a
re-fetch; ops never writes a status and never writes to FP.

## Detect

```
SELECT * FROM app.v_reconciling_orders;
SELECT * FROM app.v_recon_breaks_open;
```

Run as `sanchay_readonly` (see [ops CLIs](ops-cli.md)). Note each id, its age and its kind.

## Act
1. Look the object up in the FP dashboard by `source_ref_id` = our order (or plan) id. Record what FP shows:
   no object, `pending`, `confirmed`, `successful`, `failed`.
2. Enqueue a re-fetch (it only enqueues the same job the worker runs; it changes no status):

```
$env:SANCHAY_APP_ROLE='ops'; pnpm ops:sync --order <orderId>
SANCHAY_APP_ROLE=ops pnpm ops:sync --order <orderId>
```

3. Wait one `fp.reconcile.nonfinal` cycle, then re-run the Detect query.
4. FP shows the object but we stay RECONCILING after the re-fetch: a defect. Log it under F26 (CRITICAL if
   money moved) and keep the order out of investor-facing promises.
5. FP shows no object and the payment was debited: [Refund](refund.md).
6. More than three ids stuck at once: it is probably an FP problem, go to [FP outage](fp-outage.md).
7. After 2 hours, email the investor from support: "Your order <short id> is being confirmed with the fund
   house. Your money is safe; we will email you when it is confirmed."

## Verify
- The id is gone from `v_reconciling_orders`, and `order_events` shows the move made by the system trigger
  (not by a person).
- `sanchay-{env}-reconciling-sla` is `OK`.

## Escalate
- Still RECONCILING 4 hours after the re-fetch: Cybrilla support with the FP id; PO informed.
- Any doubt whether money was taken twice: [Kill switch](kill-switch.md) first, then investigate.

## Evidence
- `docs/probes/incidents/<yyyy-mm-dd>-stuck-reconciling.md`: ids, ages, what the FP dashboard showed, `ops:sync`
  runs with times, final status and when it was reached.
