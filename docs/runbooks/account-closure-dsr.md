# Runbook: Account closure and data requests

Owner: PO with Dev B; every closure or erasure decision needs two founders. Gate: G-E8 item 12.

## When to use
- An investor emails to close their Sanchay account.
- A data principal request under the DPDP Act: access (what we hold), correction, erasure, withdrawal of
  consent, grievance, or nomination of a person to exercise their rights (privacy spec §6). In the MVP these
  come by email to the support or privacy mailbox (the Privacy Centre is P2-12).

Service levels (privacy spec): acknowledge within 24 hours, resolve within 30 days.

## Detect
- A message in the support, privacy or grievance mailbox (G-B12). Log the request date as day 0.

## Act
1. Acknowledge within 24 hours from the support mailbox, quoting a request reference (`DSR-<yyyymmdd>-<n>`).
2. Verify the requester: act only on a request sent from, or confirmed by a reply from, the email address
   verified on the account. If the investor cannot reach that mailbox, it is an account-recovery case, which is
   not supported in the pilot: reply that we cannot act and offer a call-back.
3. Closure: the investor first redeems every holding in the app (Redeem, "All") and cancels every active SIP in
   the app (SIPM-02 "Cancel SIP", R-08). Ops cannot do either for them. When the portfolio shows no holdings,
   no orders in flight and no active SIPs, two founders approve the closure in writing.
4. Erasure: legal retention wins (privacy spec §5): KYC, transaction and consent records stay for the retention
   period; we restrict them and stop all processing other than legal retention. Tell the investor exactly which
   categories are kept and why.
5. Access or correction: send the investor a summary of the categories we hold. Corrections to KYC data go
   through their KRA; corrections to contact or bank data follow [Assisted contact and bank change](assisted-contact-bank-change.md).
6. Tool gap (MVP): no ops tool decrypts investor fields or writes `investors.status`, so an export of the
   investor's own data and the final CLOSED status need a developer-run change under two-founder approval,
   recorded as an F26 defect-log entry of type "ops tool gap" until P2-12 ships the Privacy Centre.

## Verify
- The investor received a final answer within 30 days of day 0, and the request log shows each step's date.
- For a closure: the investor can no longer sign in, and the portfolio shows zero holdings and no active SIPs.

## Escalate
- Any request we cannot finish within 30 days: grievance officer (G-B12) and counsel; tell the investor the
  reason and the new date.

## Evidence
- `docs/probes/incidents/<yyyy-mm-dd>-dsr.md` (one per request): reference, type, day 0, verification method,
  founders' approvals, final answer date. No PII: refer to the investor by their internal id only.
