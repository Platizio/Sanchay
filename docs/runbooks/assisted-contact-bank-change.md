# Runbook: Assisted contact and bank change

Owner: PO with Dev A; every change needs two founders. Gate: G-E8 item 13.

## When to use
- An investor asks to change their mobile, email, bank account or nominees. None of these is self-serve in
  the MVP (spec §5, P2-3); they are assisted, and each one is a takeover risk (SIM swap, email compromise).

H-9 binds the result: any assisted change sets the exit block `exit_block_reason='COOLING_OFF'` with the
D-MONEY-055 durations (contact change: no exits for 24 hours; a new bank usable 24 hours after
verification; 10 days between a bank change and a contact change).

## Detect
- A request in the support mailbox. Log the request date as day 0 and a reference `CHG-<yyyymmdd>-<n>`.

## Act
1. Verify on two independent channels, both started by us: a reply from the email verified on the account,
   and a call-back to the mobile on the account (looked up by the developer on call, never read out to the
   caller). A request that cannot pass both checks is refused; it is an account-recovery case, not supported
   in the pilot.
2. Ask for the evidence the change needs: for a bank change, a cancelled cheque or statement in the investor's
   own name (name match as in onboarding); for a nominee change, the new nominee details and shares.
3. Two founders approve in writing, after reading the evidence.
4. Tool gap (MVP): there is no ops tool that writes contact, bank or nominee data or sets the exit block, and
   ops never writes to FP. Until P2-3, an approved change is either (a) declined with "not supported during the
   pilot; you can redeem to your registered bank at any time", or (b) executed by a developer as a reviewed,
   two-founder-approved change that also sets the H-9 exit block, recorded as an F26 defect-log entry of type
   "ops tool gap". The PO chooses (a) by default.
5. Tell the investor the outcome and, for (b), when exits unblock.

## Verify
- For (b): the investor sees the new value in Account (AccountScreen v2, masked), exits are blocked until the
  cooling-off end, and the old mobile and email both received a change notice.

## Escalate
- Any sign of impersonation (pressure, urgency, mismatched details): refuse, put a note on the request,
  turn on extra scrutiny for that investor's exits, and consider [CERT-In 6 h report](cert-in-6h.md).

## Evidence
- `docs/probes/incidents/<yyyy-mm-dd>-assisted-change.md` (one per request): reference, change type,
  verification steps and times, founders' approvals, option (a) or (b), cooling-off end. No PII.
