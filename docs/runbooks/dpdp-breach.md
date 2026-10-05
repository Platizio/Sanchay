# Runbook: DPDP breach

Owner: PO (as the person responsible for data protection until the P2 DPO is named), with the incident lead.
Gate: G-E8 item 11.

## When to use
- A personal data breach: any unauthorised processing, accidental disclosure, acquisition, sharing, use,
  alteration, destruction or loss of access to investors' personal data, whether by us or by a processor
  (Cybrilla, MSG91, AWS). Examples: an email or SMS sent to the wrong investor with their data, an exported
  file left in a public place, a decrypted log line with PAN or bank details, a compromised task role.
- A processor telling us of a breach (their DPA notice target is 6 hours, D-PLATFORM-095).

The timers below are D-PLATFORM-096's; counsel confirms the legal applicability of the DPDP Rules on the day.
We apply them in the pilot regardless.

## Detect
- From [CERT-In 6 h report](cert-in-6h.md) triage, an investor complaint, a processor notice, or a PII hit in
  the e2e log scan (G-E3).
- Establish: what data categories, how many investors, from when to when, whether the data is encrypted
  (`*_enc` columns are useless without the keyring) or in clear.

## Act
1. Contain: stop the leak (revoke access, rotate keys per [Credential rotation](credential-rotation.md), pull a
   mis-sent file); [Kill switch](kill-switch.md) if money flows are involved.
2. Without delay (target 24 hours): initial intimation to the Data Protection Board of India with a
   description of the breach, its nature, extent, timing and location, and its likely impact. Counsel reviews
   the text.
3. Within 72 hours: tell each affected investor by email and SMS (in-app inbox is P2): what happened, what
   data, likely consequences, what we have done, what they should do (for example watch for phishing calls
   asking for OTPs), and whom to contact.
4. Within 72 hours: detailed report to the Board: facts, circumstances and reasons, mitigation, findings about
   the person who caused it if known, remedial measures, and the notices sent to investors.
5. Cybrilla, the AMCs and the RTA where their data or systems are involved: target 24 hours, per contract.
6. Root-cause analysis within 30 days.

## Verify
- Each notice has a sent time inside its window; the list of investors notified matches the affected count
  (keep the list outside the repository; the evidence file records only the count).

## Escalate
- Counsel and both founders sign every external text. Media or regulator questions go to the PO only.

## Evidence
- `docs/probes/incidents/<yyyy-mm-dd>-dpdp-breach.md`: timeline, data categories and counts (no PII), Board
  intimation and detailed-report receipts, investor notice template and send times, processor notices, RCA link.
