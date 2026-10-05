# Runbook: Payout delayed

Owner: Dev B with the PO. Gate: G-E8 item 6.

## When to use
- `payout.watch` (daily 10:00 IST, F5) marks a settled redemption DELAYED because the payout is past the
  regulatory maximum (T+3 working days), sends the investor the delay copy and raises an alert.
- An investor reports that redemption money has not arrived.

Expected payout is T+1 for liquid and debt schemes and T+2 for equity, hybrid and ELSS (`payout_expected_on`).

## Detect

```
SELECT * FROM app.v_payouts_due;
```

Run as `sanchay_readonly`; rows past `payout_expected_on` are the candidates.

## Act
1. Check the redemption in the FP dashboard: state, settlement date, payout reference.
2. Ask Cybrilla to chase the AMC or RTA with the folio number, scheme and redemption date.
3. Email the investor the escalation copy: "Your redemption of <scheme> was processed on <date>. The fund
   house has not yet paid it out. We have escalated it with the fund house and will update you by <date>.
   You can also write to our grievance officer at <grievance email>." Reply only to the registered email.
4. Do not promise interest: compensation for a late payout is the AMC's obligation under SEBI rules, paid
   by the AMC.

## Verify
- The payout appears as paid in FP and the investor confirms; the row leaves `v_payouts_due`.

## Escalate
- Past T+5 working days: PO writes to the AMC directly and records it for the grievance register (G-B12).

## Evidence
- `docs/probes/incidents/<yyyy-mm-dd>-payout-delayed.md`: redemption id, expected and actual payout dates,
  Cybrilla and AMC contact dates, investor messages sent.
