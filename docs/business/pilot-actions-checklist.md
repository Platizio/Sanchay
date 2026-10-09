<!-- source: workflow wf_0a226252-0e5 label mvp-business (deliverable 2) | exported 2026-09-28 -->

# DELIVERABLE 2. Pilot business-actions checklist (Mon 2026-09-28 to Fri 2026-11-27)

**Roles**
- OWNER: Platizio director / authorised signatory
- PO: product owner
- CO: Compliance Officer (the ARN's principal officer or a named delegate)
- COUNSEL: external MF and privacy counsel
- OPS: a founder acting as operations (may be the PO)
- DEV-A: backend developer
- DEV-B: client developer

**Holidays** (no due date falls on these): Fri 10-02, Tue 10-20, Mon 11-09, Tue 11-10, Tue 11-24.

**Gate** refers to MVP spec §7, which is **tiered (R-06)**: GO-1 on Fri 11-27 covers onboarding, lumpsum and redemption; GO-2 enables SIP after its canary evidence.

**Amended 2026-09-28 by the controller rulings R-01..R-23 (`docs/delivery/rulings.md`).** Where this text and a ruling differ, the ruling wins. **Amended 2026-10-05 by the owner decisions R-31, R-33 and R-34.**

### 1. Governance

| ID | Action | Owner | Due | Depends on | Evidence of done | Gate |
|---|---|---|---|---|---|---|
| PB-01 | Freeze the MVP calendar (S1–S4, buffer week) and both developers' leave | PO | Mon 09-28 | none | Calendar in `docs/specs/mvp/MVP-SPEC.md` §0 | H-19 |
| PB-02 | Engage external counsel with a fixed pilot scope and turnaround dates: legal texts (PB-60/61), EUIN opinion (PB-23), OX-18 letter (PB-19f), Cybrilla POA agreement and DPA review | OWNER/PO | Wed 09-30 | none | Engagement letter listing each item and date | G-C1, C3, C4 |
| PB-03 | Name the Compliance Officer, who signs off legal texts, the risk questionnaire and the curated list | OWNER | Fri 10-09 | none | Appointment note | G-C1, C2 |
| PB-04 | Trim checkpoint (R-02). Trims T1–T6 are **pre-acknowledged by the owner** (master-plan approval, 2026-09-25) and are applied in spec §6 order if the S1 factor is short | PO records; no new decision | Fri 10-09 | S1 actuals | Checkpoint note listing any trims applied | §6 |
| PB-05 | Velocity re-baseline. **T7 (web only) and T8 (no SIP) need an explicit owner decision** (R-02) | OWNER (decides T7/T8), PO | Fri 10-23 | S1 and S2 actuals; Cybrilla priority answers (PB-13) | Signed re-baseline note with the owner's T7/T8 decision | §6 |
| PB-06 | Real-money gate, tiered (R-06). **GO-1 (Fri 11-27): onboarding, lumpsum, redemption.** **GO-2: SIP**, after its canary evidence (mandate APPROVED + plan ACTIVE + first-instalment date recorded; debit and allotment evidenced when they land). NO-GO keeps orders disabled and re-runs the gate on Fri 12-04 or Fri 12-11 | PO + OWNER | GO-1 Fri 11-27; GO-2 after PB-82(b) | all MUST items of the tier | Signed gate record per tier | §7 |

### 2. Cybrilla production

| ID | Action | Owner | Due | Depends on | Evidence of done | Gate |
|---|---|---|---|---|---|---|
| PB-10 | Send Deliverable 1 (without the internal appendix) **after** PB-40 has registered the domain (R-22). If registration is not complete, the letter's URL table is marked "final by 09-30" | PO | Mon 09-28 (after PB-40) | PB-40 (domain named in the letter) | Sent mail plus Cybrilla ticket number | G-B1 |
| PB-11 | R3 sandbox readiness: both tokens, pre-verification access, UPI Autopay in sandbox, sandbox webhook secret | DEV-A (PO chases) | Wed 10-07 | PB-10 | Token calls in the probe log; secret kept with the other sandbox credentials in the git-ignored `apps/api/.env` (R-31: no nonprod environment; name only recorded) | S1 |
| PB-12 | Sandbox probes: P-04 (EUIN blank, no partner), P-05 (ARN visible), P-07 (allotted units), P-09 (units / first instalment), lumpsum custom-checkout order | DEV-A | Fri 10-09 (P-07 and P-09 may run to Fri 10-16) | PB-11 | `docs/probes/*.md` with run ids | G-B8 |
| PB-13 | Written answers: [Priority] by Fri 10-16; the rest by Fri 10-30; everything by Fri 11-13. Chase every Monday. Map each answer to its flag (`fp.sendPartner`, `fp.lumpsumFlow`, `features.redeemByUnits`, UPI Autopay on/off) | PO; DEV-A maps flags | 10-16 / 10-30 / 11-13 | PB-10 | `docs/probes/cybrilla-answers.md` with mail references | G-B6 |
| PB-14 | ONDC portal signup with Platizio's ARN (legal name and address exactly as on the ARN certificate) | OWNER + PO | Submit Fri 10-16; activation Fri 10-30 | PB-20, R2 | ONDC confirmation naming Platizio and the ARN | G-B7 |
| PB-15 | Execute the POA agreement (counsel review first) | OWNER / COUNSEL | Fri 10-23 | R2, PB-02 | Executed agreement filed | G-B7 |
| PB-16 | CAMS and KFintech mailback subscriptions for the ARN | PO/OPS | Request Fri 10-16; confirmed Fri 11-06 | PB-20 | RTA confirmations | G-B7 |
| PB-17 | Cybrilla demo part 1 (sandbox): existing-KYC onboarding, lumpsum by UPI and netbanking, returns, webhooks (R-31 leaves no dev AWS host, and E25's prod config runs FP in production mode, so where this demo's sandbox webhooks and returns land is open for the owner; R-05). Fallback agreed in writing now: an API-driven lumpsum demo (Playwright against the sandbox) | PO + DEV-A + DEV-B | Fri 11-06 | lumpsum end to end in sandbox (R-03) | Cybrilla's written sign-off | G-B7 |
| PB-18 | Cybrilla demo part 2: SIP with UPI Autopay/eNACH (including the investor cancel, R-08), redemption (live or recorded runs) | PO + DEV-A + DEV-B | Wed 11-18 | S4 sandbox build | Written sign-off | G-B7 |
| PB-19 | Send the prod NAT Elastic IP for allowlisting. E25 allocates it inside the stack in S2 week 2 (output `NatEipAddress`, R-31); it must stay retained | DEV-A | After E25 deploys; by Fri 11-06 | PB-47 | Stack output; Cybrilla acknowledgement | G-B7 |
| PB-19a | Receive production credentials (FP and POA) **only** through Cybrilla's secure channel. Store in `sanchay/prod/*`, injected only into the `worker` container. Never in email, chat or GitHub | PO → DEV-A | **Fri 11-13** (latest **Mon 11-16**, R-21; later ⇒ GO-1 moves to Fri 12-04) | PB-14–17 | Secret names listed; token call from the prod worker logged | G-B7 |
| PB-19b | Register prod webhooks at `https://api.sanchay.in/api/v1/webhooks/fp` for every MVP event; store the signing secret; verify one signed prod event | DEV-A | Mon 11-16 (verified by Thu 11-26) | PB-19a, PB-47 | `GET /v2/notification_webhooks` output; verified event id | G-B7, G-E7 |
| PB-19c | UPI Autopay enabled on the production tenant | PO | Fri 11-13 | Q24 | Cybrilla mail, plus the canary mandate APPROVED | OX-17 |
| PB-19d | Cybrilla escalation matrix and 24x7 incident contact put in the runbooks | PO | Fri 11-20 | R19 | `docs/runbooks/escalation.md` | G-B12 |
| PB-19e | Cybrilla DPA / processor terms executed, or a counsel note accepting the pilot risk | COUNSEL/OWNER | Fri 11-20 | Q55 | Executed DPA or note | privacy |
| PB-19f | OX-18 written position (payment aggregator, escrow, AMC agreements) plus counsel letter | PO → COUNSEL | Cybrilla answer Fri 11-13; counsel Fri 11-20 | Q49 | Letter filed | G-C4 |

### 3. AMFI, ARN, EUIN and AMCs

| ID | Action | Owner | Due | Depends on | Evidence of done | Gate |
|---|---|---|---|---|---|---|
| PB-20 | Check ARN validity and KYD: ARN certificate, valid-till date, KYD acknowledgement. If valid-till is before 2027-05-27, start renewal now. Record `SANCHAY_PLATFORM_ARN` and `SANCHAY_PLATFORM_ARN_VALID_TILL` | CO | Fri 10-09 | none | Certificate and KYD acknowledgement in `docs/compliance/`; values in prod config | G-B8 |
| PB-21 | ARN empanelment with every AMC in the curated list (no empanelment → scheme excluded) | CO/PO | Fri 11-06 | PB-80 draft, R9 | Empanelment register (AMC, date, reference) | G-B10 |
| PB-22 | Commission rate lines per AMC (trail min/max bps for curated schemes) from brokerage letters; feeds `/commission-disclosure` and the disclosure line | PO (CO checks) | v1 Fri 11-06; refresh Fri 11-20 | PB-21 | CSV plus source letters with sha256 | G-B10 |
| PB-23 | Counsel note on EUIN policy (OI-1 / OX-05): an OTP-bound execution-only declaration counts as "separately signed", and a blank EUIN on 100% of orders is acceptable | COUNSEL | Fri 11-13 | PB-02, Q15/16 answers | Signed opinion | G-C3 |
| PB-24 | Check AMFI NAV data terms of use for display and returns (OX-29) | COUNSEL/PO | Fri 11-13 | none | Note filed | none |
| PB-25 | Verify ARN on the canary folio at the RTA/AMC (statement or holdings report), with EUIN blank | PO + DEV-A | Thu 11-26 | PB-82 | Statement copy (masked) | G-B8, G-E7 |

### 4. SMS: DLT and MSG91

| ID | Action | Owner | Due | Depends on | Evidence of done | Gate |
|---|---|---|---|---|---|---|
| PB-30 | Contract MSG91: India data residency, DPA, DLR webhook; API key in the prod account's Secrets Manager (`sanchay/prod/msg91`; R-31: no nonprod environment) | PO | Fri 10-09 | none | Order form, DPA | G-B3 |
| PB-31 | DLT Principal Entity registration for Platizio on one operator portal; bind MSG91 as telemarketer; 6-character service header (candidates `SNCHAY`, `SANCHY`), with brand-ownership documents linking "Sanchay" to Platizio if the portal asks; **whitelist `app.sanchay.in` for URLs** (it appears in the WebOTP line) | OWNER/PO | Submit Tue 09-29; entity and header approved Fri 10-09 | PB-40 | Entity id, header id, URL whitelist screenshot | G-B4 |
| PB-32a | CO and counsel sign off the **four** SMS texts below (R-10) before filing; a later wording change means refiling | CO + COUNSEL | **Thu 10-08** | PB-02, PB-03 | Signed texts filed in `docs/legal/` | G-B4, G-C1 |
| PB-32 | Register the **four** Service-Implicit templates (details below; R-10). Submit Mon 10-12; **approved Fri 10-23** | CO (wording) + DEV-A | Fri 10-23 | PB-31, PB-32a | Four template ids mapped in `apps/api/src/integrations/sms/templates.ts` (Plan-01 B12; its tests assert the WebOTP last line with and without a hash for all four) | G-B4 |
| PB-33 | Prod SMS controls: 2,000 per day cap, MSG91 low-balance alert, DLR capture | DEV-A | Fri 11-13 | PB-30 | Alarm test | G-E5 |
| PB-34 | Real-handset test on Jio, Airtel, Vi and BSNL: delivery, operator scrubbing of the tagged values, and WebOTP autofill in Android Chrome on `app.sanchay.in` | DEV-B | Fri 11-20 | PB-32, PB-57 | Screenshots | G-E6 |

**PB-32 templates (R-10, amended by H16 on 2026-10-09; the owner, the CO and counsel sign the amendment off before filing).** Each is two lines: the text line, then the WebOTP line last. Every variable carries a TRAI typed tag (TRAI Direction of 18-Nov-2025). The registration text and the rules behind it are in `docs/dlt/sms-templates.md`, which a unit test keeps byte-for-byte equal to the code.

```
SANCHAY_LOGIN_OTP_V1:
{#numeric#} is your Sanchay login OTP. Valid 5 min. Never share it; Sanchay staff never ask for it. -Platizio
@app.sanchay.in #{#numeric#}

SANCHAY_CONSENT_OTP_V1 (amount: purchase, SIP/mandate, SIP cancel):
{#numeric#} is your OTP to {#alphanumeric#} Rs {#numeric#}.{#numeric#} in {#alphanumeric#} on Sanchay. Valid 5 min. Never share it. -Platizio
@app.sanchay.in #{#numeric#}

SANCHAY_CONSENT_UNITS_OTP_V1 (redeem all; the units variable is "all"):
{#numeric#} is your OTP to redeem {#alphanumeric#} units of {#alphanumeric#} on Sanchay. Valid 5 min. Never share it. -Platizio
@app.sanchay.in #{#numeric#}

SANCHAY_ATTEST_OTP_V1 (onboarding attest):
{#numeric#} is your OTP to confirm your Sanchay account details. Valid 5 min. Never share it. -Platizio
@app.sanchay.in #{#numeric#}
```

- **No SMS Retriever hash line.** The hash can contain `+` or `/`, which no TRAI tag accepts, and the MVP app does not read SMS through the Retriever. `SANCHAY_SMS_RETRIEVER_HASH` and API boot invariant 7 are removed.
- **Amounts are digits only:** `5,000.00` is sent as `Rs 5000.00`.
- **Variables are at most 30 characters**, so scheme names use their short form. The code strips punctuation (`&` becomes `and`).
- **Confirm with MSG91 before filing:**
  - spaces inside an `{#alphanumeric#}` value;
  - the `.` between the rupees and paise variables;
  - a variable as the last word of the template (the WebOTP code).
- Confirm with MSG91 that `#` directly before a variable is accepted.
- In the units template, "all" is a valid value for the units variable.

### 5. Email (Amazon SES)

| ID | Action | Owner | Due | Depends on | Evidence of done | Gate |
|---|---|---|---|---|---|---|
| PB-35 | SES in ap-south-1 (the prod account; R-31 leaves no nonprod environment): domain identity `sanchay.in`; Easy DKIM (3 CNAMEs); custom MAIL FROM `mail.sanchay.in` (MX to `feedback-smtp.ap-south-1.amazonses.com`, TXT `v=spf1 include:amazonses.com -all`); DMARC `v=DMARC1; p=none; rua=mailto:dmarc@sanchay.in`. Production-access request covers OTP, transactional and security emails only | DEV-A | Request Fri 10-16; granted Fri 10-23 | PB-40, PB-41, PB-45 | "Production access granted"; `Resolve-DnsName -Type TXT _dmarc.sanchay.in` output | G-B5 |
| PB-36 | DMARC to `p=quarantine` after two clean report weeks | DEV-A | Fri 11-20 | PB-35 | DNS output; report summary | G-B5 |
| PB-37 | Mailboxes on sanchay.in (e.g. a Workspace secondary domain; apex SPF for that provider): appstores@ first, then support@, grievance@, privacy@, security@, dmarc@ | OPS/PO | appstores@ Fri 10-16; others Fri 11-13 | PB-40 | Test mails received; owner per mailbox | G-B12 |

### 6. Domains and DNS

| ID | Action | Owner | Due | Depends on | Evidence of done | Gate |
|---|---|---|---|---|---|---|
| PB-40 | **First action on Mon 09-28 (R-22):** check `sanchay.in` availability and register it in Platizio's name (registrar lock, 2FA, auto-renew, at least 2 years) **before** PB-10 sends the letter. If registration is not complete at sending, the letter's URL table is marked "final by 09-30". If the name is taken, the PO names an alternative within 3 working days (DLT, SES, Play and the letter all depend on it) | PO | **Mon 09-28** (registration complete by Wed 09-30 at the latest) | none | Registrar record | G-B3 |
| PB-41 | Route 53 public hosted zone `sanchay.in` in the prod account, before E25 deploys (R-31; details below) | DEV-A (DNS), DEV-B (assetlinks) | Zone Fri 10-09; E25 creates the prod records when it deploys (S2 week 2, R-31) | PB-40, PB-45 | `nslookup` / `Resolve-DnsName` outputs; ACM certificates issued | G-B3 |

**PB-41 records**
- `www`, `app` and `api`: ALIAS to the prod ALB.
- Apex: to the ALB, which issues a 301 to www.
- **`ops`: reserved, no record (H-1).**
- CAA: `0 issue "amazon.com"`.
- Mail records per PB-35 and PB-37.
- `https://app.sanchay.in/.well-known/assetlinks.json` is served.
- Nonprod: none. R-31 removes the AWS dev environment and the dev domain, so the delegated `dev.sanchay.in` zone is moot.

### 7. AWS (ap-south-1)

| ID | Action | Owner | Due | Depends on | Evidence of done | Gate |
|---|---|---|---|---|---|---|
| PB-45 | AWS Organization owned by Platizio (details below) | OWNER (payment) / DEV-A | Fri 10-09 | payment method | Account ids; SCP JSON reviewed by both developers | G-B3 |
| PB-46 | Billing alarms: AWS Budgets per account with alerts at 50%, 80% and 100% actual and 100% forecast, to both developers and the PO; Cost Anomaly Detection on. Suggested budgets are estimates for the PO to confirm: about USD 600/month prod (R-31: no nonprod environment; prod spend starts when E25 deploys in S2 week 2) | DEV-A | Fri 10-09 | PB-45 | Test alert email received | G-E5 |
| PB-47 | Prod stack `SanchayMvpStack-prod` up with no investor data: E25 deploys it in S2 week 2 and keeps it paused until GO-1 (R-31: invite-only, orders and SIP off, the founders' test accounts only); Multi-AZ RDS, PITR, `rds.force_ssl=1`, secrets per container; F1 hardens it by Fri 11-13. Business Support plan recommended for real money | DEV-A | E25 deploy S2 week 2; hardened Fri 11-13 | PB-45, PB-41 | CDK deploy logs (E25, F1) | milestone 11-13 |
| PB-48 | Service quotas: Elastic IPs, Fargate vCPU, SES daily quota of at least 1,000 | DEV-A | Elastic IPs and Fargate vCPU before E25 deploys (S2 week 2, R-31); SES Fri 11-06 | PB-45 | Quota view | none |

**PB-45 AWS Organization**
- Accounts: management (billing only) and prod. R-31 leaves no AWS dev environment, so the MVP needs no nonprod account.
- **One billing entity for all of them.** AISPL (India-billed) and AWS Inc accounts cannot sit in the same organisation.
- Root user on a hardware MFA key, with no access keys.
- IAM Identity Center with MFA for both developers.
- An SCP limiting regional services to ap-south-1; global services stay allowed.
- An organisation CloudTrail.

### 8. GitHub

| ID | Action | Owner | Due | Depends on | Evidence of done | Gate |
|---|---|---|---|---|---|---|
| PB-50 | GitHub organisation owned by Platizio (Team plan): two owners (OWNER, DEV-A), 2FA enforced, empty private repo `sanchay` | OWNER/DEV-B | Tue 09-29 | none | Org settings screenshot | none |
| PB-51 | **Owner authorises the first push of `main`** after Plan-01 A12 (was A13; CI) is green locally | OWNER | Fri 10-09 | PB-50, A1–A12 | Written instruction filed in `docs/decisions/` | G-B2 |
| PB-52 | `main` ruleset (details below) | DEV-B | Mon 10-12 | PB-51 | `gh api repos/<org>/sanchay/rulesets` JSON exported | H-16 |
| PB-53 | GitHub Actions OIDC deploy role to AWS (no long-lived keys; E25's stack creates it); one `prod` environment (no `dev`, R-31) with both founders as required reviewers. FP, MSG91 and SES secrets never go into GitHub | DEV-A | Fri 10-23 | PB-45, PB-52 | IAM trust policy; environment settings | none |
| PB-54 | Reserve the npm org `sanchay` (never publish) against dependency confusion | DEV-B | Fri 10-09 | none | npm org page | critic |

**PB-52 ruleset on `main`**
- PR required, with 1 approval from someone other than the author (AI-agent PRs always need a human approval).
- Required checks: biome, typecheck, unit, integration, `gen:states` diff, `db:check`, OpenAPI drift, `check-brand`, gitleaks, `pnpm audit --prod`, Playwright smoke.
- Force-push and deletion blocked; linear history.
- Secret scanning with push protection; Dependabot alerts.
- Actions pinned to commit SHAs, with `permissions: {}` by default.

### 9. Google Play

| ID | Action | Owner | Due | Depends on | Evidence of done | Gate |
|---|---|---|---|---|---|---|
| PB-55 | D-U-N-S number for Platizio, with legal name and address identical to MCA, GST and the ARN certificate | OWNER | Request Tue 09-29; received Fri 10-23 | none | D-U-N-S letter | G-B9 |
| PB-56 | Play Console **organisation** account: developer name = Platizio's legal name; owned via appstores@ with security-key 2-step; one-time fee; organisation verification | OWNER/PO | Fri 10-30 | PB-55, PB-37 | "Verified" status | G-B9 |
| PB-57 | App `in.sanchay.app` (details below) | DEV-B | Fri 11-06 (app and signing key, R-21) | PB-56 | Console screenshots; hash recorded (not a secret) | G-B9, G-E6 |
| PB-58 | App-content declarations (details below) | CO + DEV-B | Fri 11-13 | PB-57, PB-61 | Completed-form screenshots; CO sign-off | G-E6 |
| PB-59 | Fallback decision: if Play verification is late, a signed APK through Firebase App Distribution | DEV-B/PO | Decide Fri 10-30 | PB-56 | Decision recorded | G-B9 |
| PB-59a | Pilot internal-testing build on prod config; App Links verified (`adb shell pm get-app-links in.sanchay.app` shows `verified`); FLAG_SECURE; app lock | DEV-B | Mon 11-23 | PB-57, PB-58, PB-41 | adb output, screenshots | G-E6 |

**PB-57 app setup**
- Enrol in Play App Signing.
- Generate the upload key and keep it offline and in Secrets Manager, never in the repo.
- Internal-testing track with tester lists for founders and invitees.
- Put the app-signing SHA-256 into `assetlinks.json`.

**PB-58 app-content declarations**
- **Financial features declaration:** the investment / portfolio-management category (check the label in the Console). Description: "Mutual fund distribution (Regular plans), execution-only, by Platizio, AMFI-registered MFD, ARN-xxxxx; payments via Cybrilla/ONDC; no lending". Upload the ARN certificate if asked.
- Data safety form matching the privacy notice.
- App access notes (invite-only testers).
- No ads; audience 18+; content rating.
- Privacy URL `https://www.sanchay.in/privacy`; deletion URL `https://www.sanchay.in/account/delete`.

### 10. Legal, disclosures and compliance sign-offs

| ID | Action | Owner | Due | Depends on | Evidence of done | Gate |
|---|---|---|---|---|---|---|
| PB-60 | Counsel drafts (full list below) | COUNSEL + CO | Drafts Fri 10-23 | PB-02 | `docs/legal/drafts/*` | G-C1 |
| PB-61 | Approval of every PB-60 text: signed PDFs; sha256 recorded; seeded as PUBLISHED in `legal_documents` | CO/COUNSEL; DEV-A seeds | **Fri 11-13** | PB-60 | Signed PDFs plus hashes matching the seed | G-C1 |
| PB-62 | www pages live: landing, legal, `/commission-disclosure`, `/grievance`, `/account/delete`, privacy | DEV-B | Fri 11-20 | PB-61, PB-22 | Pages live on prod | G-C1 |
| PB-63 | `regulatory-sources.md` covering: the category circular (OX-19); the SEBI nomination circular of 29-May-2026; grievance policy; Investor Charter | DEV-A + COUNSEL | v1 Fri 10-23; final Fri 11-13 | none | Document merged | G-C5 |
| PB-64 | Sign off risk questionnaire v1.0.0 (GAP-03: 8 questions, 5 levels, caps, 24-month expiry, mismatch acknowledgement) | CO | Fri 10-30 | spec draft | Signed PDF plus sha matching the seed | G-C2 |
| PB-65 | Retention note: regulated records 8 years; logs per policy; DSR handled by email runbook | CO | Fri 11-13 | PB-02 | Signed note | none |

**PB-60 texts for counsel to draft**
- Terms and Conditions, including: execution-only service; Regular plans and commission; payments shown as "Cybrilla"; the TPV rule.
- Pilot terms addendum: invite-only status, caps, SIP cancellation in the app (R-08; amount changes and pauses through support as "cancel and start a new SIP"), SIP enabled only after GO-2 (R-06), and what happens on NO-GO.
- Privacy notice: SPDI Rules now, written in the DPDP Rules notice format. It must list:
  - purposes and data items;
  - processors: Cybrilla/POA, KRAs, AMCs/RTAs, MSG91, AWS;
  - retention periods;
  - investor rights;
  - the Grievance Officer's contact.
- Execution-only declaration (DSC-08), in AMFI format.
- Regular-plan and commission disclosure (DSC-03), plus the commission line.
- DSC-02 entity line (`legal-entity.ts`).
- Standard mutual-fund risk warning and the risk disclosure.
- SUITABILITY_WARNING.
- Annexure-B opt-out (verbatim) and the Annexure-A display choice.
- KYC consent.
- FATCA/CRS India-only declaration.
- Investor Charter.
- Consent templates: TPL_PURCHASE, TPL_REDEMPTION, TPL_SIP_REGISTRATION, TPL_MANDATE_REGISTRATION, TPL_ONBOARDING_ATTEST, TPL_NOMINATION_OPT_OUT, TPL_SIP_CANCELLATION (R-08).
- The four SMS texts in PB-32 (signed early, by Thu 10-08, under PB-32a).

### 11. Grievance, support and incident response

| ID | Action | Owner | Due | Depends on | Evidence of done | Gate |
|---|---|---|---|---|---|---|
| PB-70 | Appoint a named Grievance Officer (SPDI rule 5(9), DPDP notice, AMFI code). `/grievance` states: acknowledge within 1 working day; resolve within 21 calendar days; escalate Grievance Officer → AMC → SEBI SCORES → SMART ODR. It never calls Platizio SEBI-registered | OWNER | Appointed Fri 11-13; page **Mon 11-23** | PB-37, PB-61 | Appointment letter; live page | G-B12 |
| PB-71 | Support channel: support@sanchay.in; hours Mon–Sat 09:00–19:00 IST; first response 1 working day; macros for KYC not verified, payment failed, refund pending, mandate, redemption payout, SIP cancel; contact shown on Account → Support | OPS/PO | Mon 11-23 | PB-37 | One test ticket closed end to end | G-B12 |
| PB-72 | Incident contact and on-call rota (both developers; PO as incident lead); CloudWatch alarms routed by SNS email and SMS | PO / DEV-A | Alarms Wed 11-18; rota Mon 11-23 | PB-47 | Rota doc; alarm test page (all ten alarms triggered on the paused prod stack before GO-1, R-34) | G-B12, G-E5 |
| PB-73 | CERT-In: designate the Point of Contact and send the details as required by the Directions of 28-Apr-2022 (check the current address and format on cert-in.org.in); 6-hour reporting runbook; ICT logs kept in India for at least 180 days (CloudWatch ap-south-1: the app log group `/sanchay/prod/app` keeps 400 days, and a stack teardown never deletes it, R-34); AWS time sync documented | CO / DEV-A | Mon 11-23 | none | POC mail and acknowledgement; runbook | G-B12, G-E8 |
| PB-74 | Runbooks (G-E8 list) in `docs/runbooks/` | DEV-B (DEV-A reviews) | Mon 11-23 | none | Merged PR | G-E8 |

### 12. Security review

| ID | Action | Owner | Due | Depends on | Evidence of done | Gate |
|---|---|---|---|---|---|---|
| PB-75 | Internal security checklist (G-E3): OWASP ASVS basics; gitleaks; secrets only in Secrets Manager; BOLA suite on every investor endpoint; HostGuard cross-host suite; OTP-abuse suite; CSRF headers; PII log scan; TLS only; RDS encryption and `force_ssl`; `pnpm audit --prod` clean; one passive ZAP baseline on the paused prod stack (R-31) | DEV-A, cross-signed by DEV-B | Wed 11-25 | PB-47 | Checklist with links | G-E3 |
| PB-76 | *Optional:* external quick test (3-day black-box of web, API and Android APK) by a CERT-In-empanelled vendor | PO | Budget decision Fri 10-16; booked Fri 10-30; test Wed 11-18 to Fri 11-20 on the paused prod stack (R-31: the only deployed stack); report Mon 11-23; critical/high fixed before 11-27 | budget | Report; fix list closed | G-E3 (optional) |
| PB-77 | Credential hygiene: rotation procedure for FP, POA, MSG91 and SES keys; never share credentials in mail or chat | DEV-A | Fri 11-13 | PB-19a | Runbook entry | G-E3 |

### 13. Pilot operations

| ID | Action | Owner | Due | Depends on | Evidence of done | Gate |
|---|---|---|---|---|---|---|
| PB-80 | Curated-list sign-off (criteria below) | PO + CO sign-off | v1 **Fri 11-06**; final **Fri 11-20** | PB-21, PB-22, R9 | Merged `data/curated-schemes.csv` and `data/fund-facts.csv` with CO approval; the list loaded on prod with F19's seed `--pilot-list` through the ops one form before GO-1 (R-33) | G-B10 |
| PB-81 | Pilot invitees and consent (details below) | PO | List Fri 11-20; seeded only after the GO-1 decision (R-31: before GO-1 only the founders' test accounts are invited); invitations only after GO | PB-61 | Seed audit_events; opt-ins filed | G-B11 |
| PB-82 | Founders' canary plan and execution (details below) | PO + DEV-A + DEV-B | Plan Fri 11-13; execute Tue 11-17 to Mon 11-23; report **Thu 11-26** | PB-19a, PB-19b, PB-19c, PB-47 | `docs/probes/canary-2026-11.md` | G-E7 |

**PB-80 curated-list criteria.** 40–60 Regular-Growth ISINs, each:
- from an AMC that is live on cybrillapoa production and empanelled;
- with a commission line;
- with purchase and monthly SIP allowed;
- with the SEBI category mapped;
- with riskometer, TER, exit load and SID/KIM in the facts CSV.

The list must include at least one liquid or debt fund for the canary.

**PB-81 pilot invitees and consent**
- Eligibility:
  - KRA KYC `verified`;
  - resident individual with India-only tax residency;
  - not a PEP;
  - a savings account in the investor's own name, ideally at a UPI Autopay bank;
  - adult.
- Invitation email approved by the CO: closed pilot, real money, market risk, caps, support channel, no advice.
- Each invitee opts in by email.
- Mobile numbers are seeded into `pilot_invites` by the ops script, with approval from two founders.
- Caps in `app_config`: ₹1,00,000 per order and ₹2,00,000 per investor per day.

**PB-82 founders' canary schedule**
- (a) Tue 11-17: lumpsum of ₹500–1,000 into a liquid or debt fund, once by UPI and once by netbanking. (GO-1 evidence.)
- (b) Wed 11-18 or Thu 11-19: UPI Autopay SIP registered after demo part 2, with instalment day 25 or 26 (11-24 is a bank holiday), in a canary scheme whose `sip_dates` contain that day; FP's minimum registration-to-instalment gap confirmed in Q27 by 10-16. **GO-2 evidence (R-06):** mandate APPROVED + plan ACTIVE + FP first-instalment date recorded; the debit and allotment are evidenced when they land, after GO-1.
- (c) Mon 11-23: partial redemption of the units from (a). (GO-1 evidence.)
- Each item is reconciled against:
  - FP: order, payment, plan and mandate;
  - the RTA: units within 0.001, ARN present, EUIN blank;
  - the bank: debit, and payout to the folio bank.
- R-31 keeps `orders.enabled` and `plans.sip.enabled` false until GO-1. Plan 04 turns one on only for a canary leg, with two founders, and off again straight after; the owner confirms these windows.

### 14. Gate evidence map (MVP spec §7 → checklist)

The gate is tiered (R-06): every item below is GO-1 evidence (Fri 11-27) except G-E7(b), which is GO-2 (SIP). G-E4, the engineering sandbox smoke on 3 separate days, is due Wed 11-25 with runs allowed from Mon 11-16 (R-21).

| Gate | Items |
|---|---|
| G-B1 letter sent | PB-10 |
| G-B2 first push | PB-51 |
| G-B3 domain, AWS, MSG91 | PB-40, PB-41, PB-45, PB-30 |
| G-B4 DLT | PB-31, PB-32a, PB-32 |
| G-B5 SES | PB-35, PB-36 |
| G-B6 Cybrilla answers | PB-13 (Q9, 10, 15, 24, 29, 34, 36, 37, 49, 19b) |
| G-B7 production credentials | PB-14–19b |
| G-B8 ARN/EUIN | PB-12, PB-20, PB-25 |
| G-B9 Play | PB-55–59 |
| G-B10 curated list and commission | PB-21, PB-22, PB-80 |
| G-B11 invitees and caps | PB-81 |
| G-B12 grievance, support, incident | PB-19d, PB-37, PB-70–73 |
| G-C1 legal texts | PB-60, PB-61, PB-62 |
| G-C2 risk questionnaire | PB-64 |
| G-C3 EUIN opinion | PB-23 |
| G-C4 payment route / AMC agreements | PB-19f |
| G-C5 regulatory sources | PB-63 |
| G-E3 security | PB-75, PB-76, PB-77 |
| G-E5 alarms | PB-33, PB-46, PB-72 |
| G-E6 Android | PB-34, PB-57–59a |
| G-E7 canary | PB-19b, PB-25, PB-82 ((a) and (c) for GO-1; (b) for GO-2) |
| G-E8 runbooks | PB-73, PB-74 |

**Top watch items, in critical-path order**
1. PB-40: domain availability and registration on **Mon 09-28, before the letter** (R-22); then PB-45/PB-41: the prod account and the `sanchay.in` hosted zone in it before E25 deploys in S2 week 2 (R-31).
2. PB-31/32a/32: DLT entity and the four templates (entity 10-09, texts signed 10-08, filed 10-12, approved 10-23).
3. PB-13: Cybrilla priority answers (10-16), which feed the 10-23 trims.
4. PB-55/56: D-U-N-S and Play verification (10-30).
5. PB-14/15/17: ONDC signup, POA agreement and demo, all prerequisites for credentials.
6. **PB-19a: production credentials on 11-13, latest Mon 11-16 (R-21). Zero float against the 11-17 canary; later ⇒ GO-1 moves to Fri 12-04.**
7. PB-61: counsel approval of legal texts (11-13).
8. PB-82: canary reconciliation (11-26).

---

### Critical Files for Implementation
- C:/Users/pc/Desktop/sanchay/docs/specs/mvp/MVP-SPEC.md (to create; §1 URLs, H-1, H-2, H-6, H-11 and H-21 must match this letter; H-6 now carries all four DLT templates per R-10)
- C:/Users/pc/Desktop/sanchay/docs/probes/cybrilla-answers.md (to create; PB-13 answers mapped to the flags `fp.sendPartner`, `fp.lumpsumFlow`, `features.redeemByUnits`)
- C:/Users/pc/Desktop/sanchay/apps/api/src/integrations/sms/templates.ts (to create; the four DLT templates byte for byte, with the WebOTP line last)
- C:/Users/pc/AppData/Local/Temp/claude/C--Users-pc-Desktop-sanchay/2f00d411-382c-43a6-bd67-ecaf60c67db1/tasks/wk14xlx18.output (`result.business` is superseded by this document; the `result.finalCritic` items on calendar, hosts, `/api/v1`, `partner` and missing actions are resolved here)
- C:/Users/pc/.claude/projects/C--Users-pc-Desktop-sanchay/2f00d411-382c-43a6-bd67-ecaf60c67db1/subagents/workflows/wf_1d1c9b02-593/journal.jsonl (`research:fp-api`: source for the endpoint and field names quoted in the questionnaire)
