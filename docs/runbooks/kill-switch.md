# Runbook: Kill switch

Owner: anyone on the rota may turn orders off (single actor); turning them back on needs both founders'
agreement in writing. Gate: G-E8 item 8.

## When to use
- `sanchay-{env}-money-invariant-breach` pages: M1 (an FP id without a CONSUMED challenge), M3 (ledger units
  differ from the sum of lots) or M4 (reservations exceed available units).
- Any suspected wrong debit, double debit, unit shortfall, credential leak or security incident.
- GO/NO-GO: prod stays off until GO-1 (spec §7 NO-GO fallback).

The switch is `app_config.orders.enabled`. Off means new purchase drafts are refused with 403
`ORDERS_DISABLED` and the app shows "New investments are paused". Orders already consented keep
reconciling, so nothing in flight is abandoned. SIP has its own flag, `plans.sip.enabled`, which stays false
until GO-2 (R-06).

## Detect
- Current state, as any client sees it:

```
curl.exe -s -H "x-sanchay-client: web" https://api.sanchay.in/api/v1/app/config
```

`flags.ordersEnabled` is the switch.

## Act
1. Turn orders off (F7 CLI; `--off` sets `orders.enabled=false` and writes an `audit_events` row):

```
$env:SANCHAY_APP_ROLE='ops'; pnpm ops:kill-switch --off
SANCHAY_APP_ROLE=ops pnpm ops:kill-switch --off
```

2. Post in the incident channel: time, who, why.
3. Investigate with the runbook for the cause ([UNITS_PENDING](units-pending.md), [Stuck RECONCILING](stuck-reconciling.md),
   [FP outage](fp-outage.md), [CERT-In 6 h report](cert-in-6h.md)).
4. Turn orders back on only when the cause is fixed, M1/M3/M4 have been green on two consecutive hourly runs,
   and both founders agree in writing:

```
$env:SANCHAY_APP_ROLE='ops'; pnpm ops:kill-switch --on
SANCHAY_APP_ROLE=ops pnpm ops:kill-switch --on
```

## Verify
- `app/config` shows `flags.ordersEnabled` as expected; a purchase attempt in the app shows the paused copy
  while off.
- The switch writes are in the audit log:

```
SELECT action, actor_id, occurred_at, data FROM app.audit_events WHERE data->>'reason' = 'ops:kill-switch' ORDER BY occurred_at DESC LIMIT 5;
```

## Escalate
- Off for more than 4 hours during the pilot: PO informs invitees by email (no individual data in the message).
- Cannot turn off (CLI fails): scale the API service to zero tasks as the last resort and page both developers.

## Evidence
- `docs/probes/incidents/<yyyy-mm-dd>-kill-switch.md`: off and on times, who ran each, the alarm or reason,
  the two founders' written agreement to turn back on. F27 drills this runbook before invitees start.
