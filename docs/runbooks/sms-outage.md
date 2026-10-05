# Runbook: SMS outage

Owner: on-call developer (Dev B primary, Dev A secondary; rota per G-B12). Gate: G-E8 item 2.

## When to use
- `sanchay-{env}-otp-send-failure-rate` fires (more than 5% of OTP sends failing over 15 minutes, twice).
- `sanchay-{env}-sms-cap-reached` fires (more than 1,900 SMS today; the 2,001st send of the day is refused
  with `SMS_UNAVAILABLE`, F8).
- Investors report that the login or consent code never arrives.

Impact in the MVP: SMS is the only login factor and every consent challenge needs an SMS code (exits and
large purchases need SMS and email), so an MSG91 outage blocks sign-in and new money actions. There is no
email-only login in the MVP (`auth.smsDegraded` is P2-3). No money moves without a consumed challenge, so an
outage cannot cause a wrong debit.

## Detect
- The OTP send is synchronous with a 5 s timeout and answers 503 `SMS_UNAVAILABLE` (D-17, R-07). API log query:

```
fields @timestamp, @message | filter @message like /SMS_UNAVAILABLE/ | stats count() by bin(5m)
```

- MSG91 dashboard: API errors, delivery reports (DLR) by status, account balance, DLT scrubbing failures.

## Act
1. Classify the cause from the MSG91 dashboard:
   - MSG91 API errors or timeouts: open a ticket with MSG91 support; nothing to change on our side.
   - Balance exhausted: the PO tops up the MSG91 account.
   - DLT scrubbing rejects (the operator blocks the message): check that the four template ids in
     `SANCHAY_MSG91_CREDENTIALS_JSON` (LOGIN, CONSENT, CONSENT_UNITS, ATTEST) match the approved DLT
     templates (R-10). A fix is a new secret version: [Credential rotation](credential-rotation.md).
   - Daily cap: look for abuse first (one IP or one mobile range sending many requests; the F8 quotas should
     already block it). Do not raise the cap during the pilot; it resets at midnight IST.
2. Pending consent challenges expire on their own; investors restart the action after recovery.
3. Reply to investor emails with: "SMS codes are delayed by our SMS provider. No money has moved. Please
   try again after <time>."

## Verify
- A founder sign-in on the affected environment receives the SMS within 30 seconds.
- `sanchay-{env}-otp-send-failure-rate` back to `OK`; the Logs Insights count of `SMS_UNAVAILABLE` is zero for
  15 minutes.

## Escalate
- Longer than 1 hour: PO and MSG91 account manager; consider pausing invitee communications.
- Abuse pattern (many numbers, many IPs): [CERT-In 6 h report](cert-in-6h.md) triage.

## Evidence
- `docs/probes/incidents/<yyyy-mm-dd>-sms-outage.md`: start and end (IST), cause class, MSG91 ticket id,
  failure counts per 5 minutes, any secret version change.
