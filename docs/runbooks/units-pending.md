# Runbook: UNITS_PENDING

Owner: on-call developer (Dev A primary, Dev B secondary; rota per G-B12). Gate: G-E8 item 4.

## When to use
- FP reports a purchase successful but without allotted units, so the order sits in UNITS_PENDING
  (units come from the provider only; F4). `orders.units.reconcile` (every 2 hours) opens a WARNING break
  past T+3 and a CRITICAL break past T+5.
- A ledger shortfall (SHORTFALL-BREAK): a redemption settled for more units than the lots hold, which writes
  `ledger_exceptions(UNITS_SHORTFALL)`, marks the folio MISMATCH and opens a CRITICAL break. A shortfall is
  never rolled back.

## Detect

```
SELECT * FROM app.v_units_pending;
SELECT * FROM app.v_recon_breaks_open;
```

Run as `sanchay_readonly`. A CRITICAL break also fires `sanchay-{env}-money-invariant-breach`.

## Act
1. A CRITICAL break or any shortfall: turn orders off first with [Kill switch](kill-switch.md).
2. Check the FP dashboard for the order's allotment (`allotted_units`, `allotted_nav`, `allotted_nav_date`).
   If FP now has units, enqueue a re-fetch so `PurchaseSettlement` applies them:

```
$env:SANCHAY_APP_ROLE='ops'; pnpm ops:sync --order <orderId>
SANCHAY_APP_ROLE=ops pnpm ops:sync --order <orderId>
```

3. FP still has no units past T+3: ask Cybrilla to chase the RTA (folio number and order date). There is no
   manual-units tool in the MVP (`orders.units.manual` is P2); never edit units in the database.
4. A shortfall or a folio MISMATCH: compare the FP holdings report for the folio with the ledger. The
   redemption quote already refuses ALL and caps AMOUNT on a MISMATCH folio (F5), so investors cannot redeem
   phantom units. Record the difference to 0.001 units.
5. Email the investor after T+3: "The fund house has not yet confirmed the units for your order <short id>.
   Your money is invested; we will email you as soon as the units are confirmed."

## Verify
- The order leaves UNITS_PENDING with units equal to FP's to 0.001, and a lot exists for it.
- The break is no longer in `v_recon_breaks_open`; if it stays open after the units land, log a defect (F26).
- M3 (ledger units = sum of lots) is green on the next hourly `integrity.invariants` run.

## Escalate
- Past T+5 or any shortfall: both founders and Cybrilla the same day; GO/NO-GO impact recorded for the gate.

## Evidence
- `docs/probes/incidents/<yyyy-mm-dd>-units-pending.md`: order ids, T+n age, FP allotment fields, RTA chase
  dates, break ids and when they cleared, kill-switch times.
