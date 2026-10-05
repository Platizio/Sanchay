# Runbook: Refund

Owner: Dev A with both founders (two-founder action). Gate: G-E8 item 5.

## When to use
- The investor's bank was debited but the purchase failed, was rejected, or expired before FP accepted it,
  so the payment must come back.
- A refund FP reported as initiated has not reached the investor's bank after the gateway's stated timeline.

## Detect
- `payment_attempts` rows with a refund pending (E21) for orders that are FAILED, REJECTED or EXPIRED; FP's
  payment view shows the refund state and, once paid, the bank UTR.
- Investor email ("money debited, no order").

## Act
1. Find the order id from the investor's email thread (ask for the order short id shown in the app; never
   ask for card or bank credentials).
2. Check the FP dashboard: payment state, refund state, refund UTR. Ops never initiates a refund in FP by hand.
3. Tell the investor the current state and the expected date; reply only to the registered email.
4. Once FP shows the refund paid with a UTR, record it. Two different founders approve; the CLI writes
   one `audit_events` row with both actors (R-20) and no status change:

```
$env:SANCHAY_APP_ROLE='ops'; pnpm ops:refund-utr --order <orderId> --utr <utr> --approver1 <founderA> --approver2 <founderB>
SANCHAY_APP_ROLE=ops pnpm ops:refund-utr --order <orderId> --utr <utr> --approver1 <founderA> --approver2 <founderB>
```

5. Email the investor the UTR so they can trace it with their bank.

## Verify
- The `audit_events` row exists with both approvers:

```
SELECT action, actor_id, entity_id, occurred_at FROM app.audit_events WHERE entity_id = '<orderId>' ORDER BY occurred_at;
```

- The investor confirms receipt, or the bank UTR is visible in FP as paid.

## Escalate
- Refund not paid 5 working days after the failure: PO escalates to Cybrilla and the payment aggregator.
- More than one debit for one order: [Kill switch](kill-switch.md) and a CRITICAL defect (F26).

## Evidence
- `docs/probes/incidents/<yyyy-mm-dd>-refund.md`: order id, amount, failure time, refund UTR, approvers,
  investor reply dates.
