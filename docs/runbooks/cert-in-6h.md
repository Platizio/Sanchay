# Runbook: CERT-In 6 h report

Owner: incident lead = the on-call developer who notices; the CERT-In contact named under G-B12 submits.
Gate: G-E8 item 10.

## When to use
- Any cyber incident of a type CERT-In's April 2022 directions list as reportable, for example: unauthorised
  access to systems or data, a data breach or leak, compromise of a server or of an AWS account, malicious code,
  targeted scanning or probing that succeeded, attacks on the app or API, identity theft or phishing aimed at
  our investors, or a leaked credential that was used.
- The clock starts when anyone on the team notices the incident, not when it is confirmed. The report is due
  within 6 hours of noticing (D-PLATFORM-096).

## Detect
- Typical signals: `sanchay-{env}-webhook-signature-failures` bursts from unknown sources, CloudTrail activity by
  an unknown principal, gitleaks finding a live secret, an investor reporting a session they did not start, an
  AWS GuardDuty or billing alert.
- Write down T0 (IST, to the minute) and who noticed, before doing anything else.

## Act
1. T0 + 15 min: incident lead opens `docs/probes/incidents/<yyyy-mm-dd>-cert-in.md` and calls the second
   developer and the PO.
2. Contain without destroying evidence: [Kill switch](kill-switch.md) if money flows could be affected; rotate
   exposed secrets per [Credential rotation](credential-rotation.md); do not delete logs, tasks or snapshots.
   CloudWatch logs must be kept for at least 180 days in India (ap-south-1) under the same directions.
3. T0 + 1 h: decide "reportable" (when in doubt, report). Decide whether personal data is involved; if yes,
   start [DPDP breach](dpdp-breach.md) in parallel.
4. Before T0 + 6 h: submit the incident report through the form published on cert-in.org.in (incident
   reporting) or by email to incident@cert-in.org.in. Contents: reporting entity and contact (the CERT-In
   contact from G-B12), time noticed, time of occurrence if known, incident type, systems affected (AWS
   ap-south-1 account, `sanchay-<env>` stack), a short description, actions taken so far. Unknown fields are
   reported as "under investigation"; a late complete report is worse than an on-time partial one.
5. Inform Cybrilla (our provider for FP and the POA) within the same window when their integration, keys or
   investor data could be involved.
6. Answer CERT-In follow-ups; record every message.

## Verify
- The submission acknowledgement (email or form receipt) is saved with its timestamp, and that timestamp is
  less than T0 + 6 h.
- The containment holds: no new indicators for 24 hours.

## Escalate
- The PO and both founders own every external message; counsel reviews follow-ups.
- Root-cause analysis within 30 days (D-PLATFORM-096), filed with the incident note.

## Evidence
- `docs/probes/incidents/<yyyy-mm-dd>-cert-in.md`: T0, who noticed, timeline, containment steps, the
  submission receipt, follow-ups, RCA link. No investor PII in the note.
