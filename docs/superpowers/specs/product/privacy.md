<!-- source: workflow wf_3190e72a-04a label spec:privacy | exported 2026-09-28 -->

# Sanchay: DPDP Privacy-by-Design Specification and Compliance Backlog

**Scope:** Sanchay, the investor-led B2C MF app run by Platizio as an AMFI-registered MFD. Platizio is the **Data Fiduciary**. Cybrilla FP is its main **Data Processor**. **As of:** 2026-09-25. **Mode:** read-only research. No files were created or changed.

---

## 0. Executive summary

| # | Conclusion |
|---|---|
| 1 | **Two privacy regimes apply before and after 13 May 2027.**<br>- **Until then:** IT Act s.43A and the SPDI Rules 2011 apply, along with the CERT-In Directions 2022.<br>- **From 13 May 2027:** DPDP Act ss.3–17 and Rules 3, 5–16, 22–23 take effect. s.44(2) removes s.43A, which ends the SPDI Rules.<br>- Launch will almost certainly come before May 2027. **Recommendation:** build to the DPDP standard from the first sprint, and treat the SPDI items (Grievance Officer, privacy policy, written consent for financial data) as launch blockers. |
| 2 | **Sanchay is not a Third Schedule class** (e-commerce, gaming or social media). So there is no fixed 3-year erasure clock. Erasure is tied to purpose, and **legal retention wins** (s.8(7)). Two floors apply:<br>- **1-year minimum** for personal data, traffic data and processing logs (Rule 8(3), Rule 6(1)(e)).<br>- **5 years** under PMLA / SEBI AML: from each transaction, and after the relationship ends for identity records. |
| 3 | **Minor investors: out of scope at launch.** Block signup for anyone under 18. Processing to confirm that someone is not a child is exempt (Fourth Schedule Part B item 6).<br>**Minor nominees are in scope.** Handle them using the parent-is-a-KYC'd-adult route (Rule 10(1)(a), illustration Case 3). |
| 4 | **Data residency: India only** for all personal data and logs (AWS ap-south-1, DR in ap-south-2).<br>- The only planned exceptions are FCM/APNs push tokens with payloads that contain no PII.<br>- No s.16 negative list or Rule 15 order has been issued (see sources).<br>- **No production personal data may go to AI coding agents or LLM tools.** |
| 5 | **v1 is not reusable for privacy.**<br>- `consent_records` is append-only only by convention (`ConsentRecord.java:10-16`, and COMPLIANCE-REVIEW §7 item 17: no trigger, full UPDATE/DELETE grants).<br>- PII is stored in plaintext with no column encryption (synthesis brief).<br>- The v1 "Privacy Policy" is a dead `<span>` with no link (`investor-frontend/src/views/LoginPage.tsx:816`).<br>- `PiiRedactor` (`common/PiiRedactor.java:27-42, :96-121`) is worth porting as a log/snapshot scrubber, with a PAN rule for `investor_identifier`.<br>- The v1 hardcoded compliance defaults (19 male investors filed as female) would breach DPDP s.8(3), which requires accurate and complete data when it is disclosed to another fiduciary. **No defaulted attributes in Sanchay.** |

---

## 1. Legal timeline (effective dates)

| Date | What takes effect | Source |
|---|---|---|
| 13 Nov 2025 (Gazette G.S.R. 846(E), dated 13 Nov; published 13–14 Nov) | Act ss.1(2), 2, 18–26, 35, 38–43, 44(1),(3). Rules 1, 2, 17–21 (Board set-up, TDSAT appeals). | Rules r.1(2) (gazette text, dpdpa.com PDF); AMSS alert |
| **13/14 Nov 2026** | Act s.6(9) and s.27(1)(d) (Consent Managers); **Rule 4** (Consent Manager registration). | Rules r.1(3); AMSS |
| **13/14 May 2027** | Everything else: notice (s.5, r.3), consent (s.6), legitimate uses (s.7), fiduciary obligations (s.8, r.6–9), children (s.9, r.10–12), SDF (s.10, r.13), rights (ss.11–14, r.14), cross-border (s.16, r.15), penalties (s.33 plus Schedule). s.44(2) repeals s.43A of the IT Act, which ends the SPDI Rules. | Rules r.1(4); AMSS; S&R |
| Pending (not notified) | MeitY's Jan 2026 proposal to cut the window to 12 months, mainly for SDFs (it would move the deadline to Nov 2026), plus immediate cross-border and s.36 powers. ConsentOS (updated 21 Sep 2026) reports it was **not notified**. | Business Standard 22 Jan 2026; S.S. Rana; ConsentOS |
| In force now | SPDI Rules 2011 (until 13 May 2027). CERT-In Directions of 28 Apr 2022: report within 6 h; keep ICT logs for 180 days in India. | S&R, Opsio; Trilegal CERT-In note |
| In force now (sector) | AMFI Master Circular for MFDs, AMFI/MFD-CIR/32/2025-26, dated **14 Jan 2026**. Code of Conduct §2(f)–(g) covers confidentiality, the Data Sharing Principles and purging. §3(b) covers cyber security for digital platforms. §3(d) covers record keeping. §5.2.2(b) is the execution-only EUIN declaration. SEBI (Mutual Funds) Regulations 2026 have been in effect since 1 Apr 2026. | AMFI PDF, pp.22, 37–38; ELP |

**Planning assumption:** 13 May 2027 is the hard legal date. All DPDP "MUST" items are **launch gates** whatever the launch date, because:
- a pre-2027 launch would otherwise need a retro-notice under s.5(2) and possibly re-consent;
- SPDI already needs most of the same machinery.

Watching the 12-month proposal is a **SHOULD**. Sanchay is unlikely to be designated an SDF.

**Penalties to size the risk** (DPDP Act Schedule; statutory text, not re-fetched this session):

| Failure | Maximum penalty |
|---|---|
| Reasonable security safeguards | ₹250 cr |
| Breach notification | ₹200 cr |
| Children's obligations | ₹200 cr |
| SDF obligations | ₹150 cr |
| Anything else | ₹50 cr |
| Data Principal duties (s.15) | ₹10,000 |

---

## 2. Roles and data map

| Party | DPDP role | Data it receives | Legal basis for sharing | Contract needed |
|---|---|---|---|---|
| Platizio Pvt Ltd (Sanchay) | **Data Fiduciary** (not an SDF; assumption) | Everything | — | — |
| Cybrilla FintechPrimitives (orders, KYC/POA, mandates, payments orchestration) | **Data Processor** for Platizio | Identity/KYC, contact, bank, nominee, FATCA, orders | Contract (s.8(2)) | **DPA** (see §9) |
| AMCs, RTAs (CAMS, KFintech) | Independent fiduciaries (receive data to create folios) | KYC, bank, nominee, orders | Investor's consent to transact; regulatory requirement | Empanelment agreement; log every share in `data_sharing_log` |
| KRAs, CKYC (CERSAI) | Independent fiduciaries | PAN, KYC data | SEBI KRA Regulations; consent | Accessed via Cybrilla |
| UIDAI / DigiLocker / eSign ASP | Independent (Aadhaar ecosystem) | Aadhaar-based e-KYC, eSign | Consent; Aadhaar Act | Via Cybrilla / eSign ASP |
| NPCI, banks, PG (UPI, UPI Autopay, eNACH, penny drop) | Independent fiduciaries | Bank account, VPA, amount | Consent to pay; RBI rules | Via Cybrilla |
| AWS (ap-south-1) | Processor | All (hosting) | Contract | AWS DPA plus India regions |
| SMS, email, push, analytics, crash vendors | Processors | Limited (see §9) | Contract | DPA |
| FIU-IND, Income Tax, courts, SEBI/AMFI, law enforcement | Recipients by law | On request | s.7(d), s.7(e), s.17(1)(c) | Log in `data_sharing_log` with `suppress_from_access_report` where s.11(2) applies |

---

## 3. Purpose registry (seed data for `purposes`)

Legal basis codes:

| Code | Meaning |
|---|---|
| CONSENT | s.6 consent |
| LU-7a | s.7(a) data voluntarily provided for a specified purpose |
| LU-7d | s.7(d) legal duty to disclose to the State |
| LU-7e | s.7(e) court or order compliance |
| EX-17c | s.17(1)(c) exemption for preventing or detecting offences |

Retention codes (R-…) are defined in §5.

| Code | Purpose (as shown to the investor) | Data categories | Basis | Optional? | What happens on withdrawal | Retention |
|---|---|---|---|---|---|---|
| P01 `ACCOUNT` | Create and secure your account, sign-in, OTP, service messages | Contact, device (app-instance id), auth logs | CONSENT (core) | No; withdrawing = account closure | Closure flow (§6.3) | R-ID, R-LOG |
| P02 `KYC_ONBOARDING` | Check KYC with KRA/CKYC, Aadhaar/DigiLocker, eSign, FATCA/CRS, PEP, occupation/income, T&C and execution-only declaration | Identity/KYC | CONSENT + LU-7a; legal retention | No (needed to invest) | Closure flow | R-ID |
| P03 `TRANSACTIONS` | Lumpsum, SIP, mandates, redemption, switch/STP/SWP, 2FA authorisation, payment status | Transactions, bank | CONSENT (core) | No | Closure flow; open orders and mandates must be cancelled first | R-TXN |
| P04 `BANK_VERIFY` | Penny drop and mandate registration | Bank | CONSENT (core) | No | Closure flow | R-ID |
| P05 `NOMINATION_MF` | Register MF nominees under the SEBI rules (Jan 10, 2025 circular: up to 10 nominees; one identifier each: PAN, DL or Aadhaar last 4) | Nominee | CONSENT (investor) + investor declaration that nominees were informed | Nominee or opt-out is required by SEBI | Change or opt-out through 2FA | R-ID |
| P06 `PORTFOLIO_TAX` | Dashboard, XIRR, capital gains, statements, ELSS summary | Transactions | CONSENT (core) | No | Closure flow | R-TXN |
| P07 `EXTERNAL_CAS` | Import and show holdings made outside Sanchay (CAS) | External holdings (folio, scheme, units, cost) | CONSENT (separate) | **Yes** | Delete imported holdings within 24 h; keep only the processing log (1 yr) | R-CAS |
| P08 `NOTIFY_TXN` | Transactional SMS, email and push (order status, SIP debit, OTP) | Contact, push token | CONSENT (core); OS permission for push | Push is optional | Push token deleted | R-LOG |
| P09 `PRODUCT_ANALYTICS` | Improve the app from pseudonymous usage events | Device/analytics | CONSENT (separate, **off by default**) | **Yes** | Stop within 24 h; delete the person in the analytics store within 72 h | R-ANL |
| P10 `SECURITY_RELIABILITY` | Security logs, fraud detection, crash diagnostics, CERT-In and Rule 6 logging | Device, logs, IP | Required by Rule 6(1)(c),(e) and CERT-In; EX-17c for fraud | No | — | R-LOG |
| P11 `MARKETING` | Promotional email, SMS and push (NFOs, features); **per-channel toggles** | Contact | CONSENT (separate, off by default); promotional SMS also needs DLT consent under TRAI TCCCPR 2018 | **Yes** | Add hashed contact to the suppression list immediately | R-MKT |
| P12 `SUPPORT_GRIEVANCE` | Handle support tickets, privacy requests and grievances | Contact, ticket content | LU-7a | — | — | R-SUP |
| P13 `LEGAL_REGULATORY` | FIU, tax and court orders; AMC/RTA/SEBI/AMFI queries | As requested | LU-7d, LU-7e, EX-17c | — | — | Legal hold |
| P14 `DP_NOMINATION` | A person you name to exercise your privacy rights if you die or become incapacitated (s.14, r.14(4)) | That person's name, relationship and contact | CONSENT | **Yes** | Revoke | R-ID |

**Explicitly excluded (data minimisation):**
- READ_SMS (use Android SMS Retriever / iOS one-time-code autofill), contacts, location, IMEI or advertising ID.
- Personalised fund recommendations. These carry an advice or RIA risk under the execution-only MFD model.
- Storing the full Aadhaar number anywhere (store last 4 plus the provider reference only; UIDAI Aadhaar Data Vault rules).
- Storing KYC images or the CAS PDF/password after parsing. v1 already purged distributor-held identity documents (V86).

---

## 4. Notice content and timing (Act s.5, Rule 3; SPDI r.4–5 until May 2027)

### 4.1 Content (the Rule 3 checklist is the acceptance test)

| Rule 3 requirement | How Sanchay meets it |
|---|---|
| (a) Understandable on its own | A standalone "Privacy Notice" screen and page, separate from the T&C and the SID. It does not rely on the privacy policy. |
| (b)(i) Itemised description of personal data | A table grouped by data category (§3), listing the fields in each: PAN, name, DOB, gender, address, email, mobile, occupation, income slab, PEP, FATCA tax residency/TIN, bank account/IFSC/VPA, nominee details, orders, holdings, device id, IP, crash data. |
| (b)(ii) Specified purposes and the service or use each enables | One line per purpose code (P01–P14), naming the feature it enables. |
| (c)(i) Link to withdraw consent, as easy as giving it | Deep link to **Settings → Privacy Centre** with one-tap toggles. For core purposes, the link goes to "Close account". |
| (c)(ii) How to exercise rights | Links to Download my data, Correct, Erase/close, Nominate, Grievance. |
| (c)(iii) How to complain to the Board | Text plus the DPB URL (fill in once the Board publishes its portal), and the note that the grievance process must be used first (s.13(3)). |
| s.5(3) Languages | Offer English or any of the 22 Eighth Schedule languages. **Recommendation:** pre-translate the short notice into all 22. It is a one-time cost, versioned per locale. |
| Rule 9 contact | Grievance Officer / privacy contact: name, email, phone, address. **SPDI r.5(9) also requires the Grievance Officer's name** until May 2027. |
| Additional (recommended) | Processor and recipient categories, and India-only storage. Retention summary per category (§5). Consequences of withdrawal (s.6(5)). Nominee data statement. Cookie / SDK list. |

### 4.2 Timing

| Moment | Notice or consent shown | Artefact recorded |
|---|---|---|
| T0: before the mobile/email field on the signup screen | Short layered notice (3–5 bullets) plus a link to the full notice. Language picker. | `notice_views` (version, locale) |
| T1: on "Create account" | Affirmative consent for P01 + P02 + P03 + P04 + P06 + P08 (core bundle, **each listed**). Separate unticked toggles for P09 and P11. | `consent_records` ×N |
| T2: KYC step (PAN/KRA, DigiLocker, eSign) | Just-in-time notice naming KRA, CKYC, UIDAI/DigiLocker and the eSign ASP, and what each receives | `consent_records` (P02 sub-scope `kyc_provider_share`) |
| T3: bank step | Just-in-time notice: penny drop (₹1 credit) and mandate registration with NPCI/bank | P04 record |
| T4: nominee step | SEBI nomination notice plus the declaration "I have informed my nominee(s)". Minor-nominee guardian declaration (§8). | P05 record, `minor_nominee_guardian_declaration` |
| T5: T&C and execution-only | T&C document (real, versioned; v1 used a placeholder, which was a FAIL). Execution-only declaration per AMFI MC §5.2.2(b). | `consent_records` (`tnc`, `execution_only_declaration`) |
| T6: first CAS import | P07 consent screen | P07 record |
| T7: OS permission prompts (push, camera through a provider SDK) | Pre-permission explainer | P08 flag |
| Web first visit | Cookie banner: essential cookies only by default. "Accept analytics" and "Reject" buttons with equal prominence. | `consent_records` (anonymous → linked at signup) |
| Material change | Blocking re-consent modal before the next transaction. Non-material changes: in-app inbox plus email. | New `notice_version_id` |
| s.5(2) retro-notice | If any user consented under a notice version dated before 13 May 2027 that does not meet Rule 3, run the `retro-notice` job (§7) | `notice_deliveries` |
| Every rights or grievance response | Rule 9 contact block appended automatically | `data_requests.rule9_contact_included=true` |

---

## 5. Retention schedule: DPDP erasure vs. legal retention

### 5.1 Legal inputs

| Source | Requirement | Applies to Sanchay? |
|---|---|---|
| DPDP s.8(7) | Erase when consent is withdrawn or the purpose is served, **unless retention is needed to comply with law**. Processors must also erase. | Yes (13 May 2027) |
| DPDP Rule 8(3) | Keep personal data, traffic data and processing logs for **at least 1 year from the date of processing** (Seventh Schedule purposes), then erase unless another law requires more. The illustration applies this even after account deletion, and says processors must also keep data for 1 year. | Yes |
| DPDP Rule 6(1)(e) | Keep logs and personal data for **1 year** to detect and investigate unauthorised access | Yes |
| DPDP Rule 8(1)–(2), Third Schedule | 3-year inactivity erasure with 48 h prior notice | **No** (not e-commerce, gaming or social media). The 48 h notice is adopted voluntarily as a SHOULD. |
| PMLA s.12 + PML (Maintenance of Records) Rules 2005 r.3; SEBI AML/CFT Master Circular (6 Jun 2024) | Transaction records: **5 years from the date of the transaction**. Identity records: **5 years after the business relationship ends or the account closes**. Records tied to an ongoing investigation or STR: **until the case is closed**. | MFDs registered only with AMFI are **probably not "reporting entities"** (not registered under s.12 of the SEBI Act). **Adopted as the floor anyway**: AMC/RTA empanelment flows AML duties down, and AMFI CoC §3(d) requires records "in compliance with the applicable laws". Counsel to confirm. |
| AMFI MFD Master Circular (14 Jan 2026), CoC §3(d) | Keep adequate client records, **including KYC records, correspondence on suitability and consent/dissent**. No fixed period. §2(g): purge data once no longer required. | Yes |
| AMFI MC Annexure (p.62) | Sub-broker declaration kept **≥8 years** | Only if sub-distributors are ever used (not in scope) |
| Companies Act 2013 s.128(5) (statutory text, not re-fetched) | Books of account **8 years** | Commission and brokerage ledgers only, not investor PII |
| CERT-In Directions (28 Apr 2022) | ICT logs: rolling **180 days, in India** | Yes (body corporate) |

### 5.2 Retention rules (seed data for `retention_policies`)

"Relationship end" (`relationship_end_at`) = the date the account is closed, once there are no pending orders, active SIPs/mandates or in-flight redemptions. Units still held at AMCs under Platizio's ARN do not extend the investor-data clock. Commission data is kept separately (R-COM).

| Code | Category / records | Retention | Action at expiry | Basis |
|---|---|---|---|---|
| R-ID | Identity/KYC (PAN, name, DOB, gender, address, KYC status and KRA/CKYC refs, FATCA/CRS, PEP, occupation, income), contact, bank details, MF nominee details, eSigned account-opening form, T&C and execution-only declarations | While active + **5 years after `relationship_end_at`** | Hard-delete rows and objects (crypto-shred the per-principal DEK) | PMLA r.3 / SEBI AML MC; AMFI CoC §3(d) |
| R-TXN | Orders, SIP registrations, mandates, redemptions, switch/STP/SWP, payment references, 2FA challenge evidence, statements generated | While active (needed for cost basis and capital-gains FIFO) + **5 years after `relationship_end_at`**. This is always at least 5 years after each transaction. | Hard-delete, or pseudonymise if aggregate reporting needs the row | PMLA s.12 / SEBI AML MC |
| R-COM | Commission and brokerage reconciliation lines (folio no., scheme, amount; investor linked only by `pan_hmac`) | **8 years from end of the financial year** | Delete | Companies Act s.128(5) |
| R-CNS | `consent_records`, `notice_views` | While active + 5 years after relationship end. At least 1 year after any withdrawal. | Delete | s.6(10) burden of proof; Rule 8(3) |
| R-LOG | Security, auth, API and processing logs; admin `data_access_log`; OTP challenge logs | **13 months** (1 year + 1-month buffer). The first 180 days are hot in CloudWatch ap-south-1. | S3 lifecycle expiry | Rule 6(1)(e), 8(3); CERT-In |
| R-AUD | `audit_events` (admin changes to investor records) | Same as the record they relate to (R-ID or R-TXN) | Delete with the parent record | Evidence that records are accurate (s.8(3)) |
| R-SUP | Support tickets, grievances, `data_requests` | **5 years after the ticket closes** | Delete | AMFI CoC §3(d) correspondence and complaints |
| R-CAS | Imported external holdings (P07) | Until P07 is withdrawn or the account closes, then **deleted within 24 h**. The raw CAS PDF is **never stored** (parse in memory; the sweeper deletes stragglers every hour). | Hard-delete | Consent only; no legal retention |
| R-ANL | Pseudonymous analytics events (P09) | **13 months** rolling, or delete the person when consent is withdrawn | Delete | Consent; Rule 8(3) floor for recent events |
| R-MKT | Marketing preferences | Until withdrawn. The suppression list (SHA-256 of normalised email/mobile) is kept while it is needed to honour the opt-out. | — | s.6(4) |
| R-DRAFT | Abandoned onboarding (never became a client), KYC-rejected users, signups under 18 | **1 year after last activity** (Rule 8(3) floor), then erase. 48 h reminder before erasure (SHOULD). | Hard-delete | Rule 8(3); no PMLA "client" relationship |
| R-BKP | RDS PITR, snapshots, cross-region backups | PITR 35 days; monthly snapshots 13 months | Expire. Replay the erasure tombstone log after any restore. | Rule 6(1)(d) |
| HOLD | Any record under `legal_holds` | Until the hold is released | Blocks all actions above | SEBI AML MC (investigations), DPB/court/SEBI queries |

### 5.3 How an erasure request is resolved (engine logic)

1. **Immediately erasable:** everything not covered by R-ID, R-TXN, R-CNS, R-LOG, R-COM or HOLD. That covers marketing, analytics, CAS, push tokens, preferences, drafts older than 1 year, and the privacy nominee (P14).
2. **Restricted:** the remaining records move to `erasure_state='RESTRICTED'`.
   - Only the roles `compliance_officer` and `legal` can read them, and only for P13 purposes.
   - They are excluded from every product query, export, analytics and marketing.
3. **Scheduled purge:** `eligible_at = max(rule expiry, last_processing_at + 1 year)`, unless a hold applies.
4. **Response to the investor:** a statement listing each category → "erased now", or "kept until DD-MM-YYYY under <law>".

---

## 6. Data Principal rights workflows

| Right | Source | Investor entry point | Identity check | Internal SLA / legal cap | Backend flow |
|---|---|---|---|---|---|
| **Access** (summary of data and processing, plus the fiduciaries and processors it was shared with) | s.11; r.14(1)–(2) | Privacy Centre → "Download my data" | Logged-in session + fresh OTP (step-up) | Automated export within 24 h; manual ≤7 days; **hard cap 30 days** | Compile a JSON (machine-readable) and PDF export from all stores, `consent_records` and `data_sharing_log` (excluding `suppress_from_access_report`, per s.11(2)). In-app download only, pre-signed URL valid 7 days. No email attachment. |
| **Correction / completion / updating** | s.12(1)–(2); s.8(3) | Profile → Edit | Session + OTP; 2FA for bank and nominee changes | Contact, bank, nominee: immediate. KYC fields: acknowledged immediately, ≤30 days | Contact: re-verify by OTP. Bank: penny drop, then a new mandate. Nominee: 2FA, then push to RTA through FP. **KYC fields (name, DOB, PAN, address) are corrected at the source**: KRA/CKYC modification through Cybrilla, with a status tracker. No local override. |
| **Erasure** | s.12(3); s.8(7) | Privacy Centre → "Close account & erase". Also required by app stores (Apple 5.1.1(v); Google Play account-deletion policy, including a web URL). | Session + OTP + typed confirmation | Pre-checks immediate; immediately-erasable data gone ≤7 days; **written outcome ≤30 days** | Pre-checks: open orders, active SIPs/mandates, pending redemptions. Guide the user to cancel or complete them. Then run §5.3 and cascade to processors (`processor_erasure_tasks`). |
| **Withdraw consent** | s.6(4)–(6) | Privacy Centre toggles; unsubscribe link in every marketing email/SMS | Session | Stops ≤24 h; processors ≤72 h | `consent-propagator` job (§7). Core purposes go to the Close account flow, with consequences explained (s.6(5)). |
| **Grievance redressal** | s.13; r.14(3) (≤90 days); SPDI r.5(9) (1 month until May 2027) | Help → "Raise a privacy grievance"; privacy@ email; phone | Session, or OTP to the registered mobile | Acknowledge ≤24 h; **resolve ≤30 days**; escalate at day 21 and day 60; **never more than 90 days** | Close with a Rule 9 contact block and a note on the right to approach the DPB after exhausting this process. |
| **Nominate a person (privacy)** | s.14; r.14(4) | Privacy Centre → "Nominate a person" (separate from the MF nominee; can be pre-filled from one) | Session + OTP | Registration immediate. Invocation ≤30 days after documents are verified. | `privacy_nominees`. Invocation by the nominee: death certificate or incapacity proof plus the nominee's own KYC-grade ID. Ops verifies, then the nominee may exercise access or erasure (retention limits still apply). |
| DP duties | s.15 | Terms | — | — | Handle false or frivolous complaints per s.15. Never refuse a request on these grounds without a documented reason. |

**Identification particulars to publish (r.14(1)(b)):** registered mobile or email, plus the Sanchay customer ID. Do not ask for PAN or documents just to verify a request.

---

## 7. Tables, columns, admin screens and jobs

### 7.1 Tables (Drizzle / PostgreSQL 18)

| Table | Key columns | Integrity controls |
|---|---|---|
| `privacy_notices` | id, code (`privacy_notice`, `tnc`, `jit_kyc`, …), version, locale, body_md, sha256, is_material_change, effective_from, superseded_at, approved_by (compliance), approved_at | Immutable after publish (trigger) |
| `purposes` | code PK, name, description, lawful_basis enum, is_optional, withdrawal_effect enum (`STOP`, `CLOSE_ACCOUNT`), data_category_codes[], retention_code, processor_ids[], version, active | Versioned; changes require a compliance approver |
| `data_categories` | code, description, sensitivity (`S1` normal, `S2` financial/identity, `S3` Aadhaar-derived), encryption_class | — |
| **`consent_records`** | id (uuidv7), principal_id (nullable for anonymous web → `anon_id`), purpose_code, action (`GRANTED`, `WITHDRAWN`, `REFUSED`, `SUPERSEDED`), notice_id, notice_sha256, rendered_text_sha256, locale, channel (`web`, `android`, `ios`), app_version, ip (full, R-CNS), user_agent, device_install_id_hash, captured_at, consent_manager_id (nullable; Rule 4 readiness), prev_record_hash, record_hash | **INSERT-only**: the app role has no UPDATE/DELETE grants, and a `BEFORE UPDATE OR DELETE` trigger raises an exception. Only a purge role (used only by the retention job) can delete. Hash chain per principal. Nightly Merkle root written to S3 Object Lock (governance mode). |
| `consent_state` (view or materialised) | principal_id, purpose_code, status, since, record_id | Derived only |
| `notice_views` / `notice_deliveries` | principal_id, notice_id, shown_at / delivered_at, channel | Append-only |
| `investors` (privacy columns) | relationship_status (`ACTIVE`, `CLOSING`, `CLOSED`), account_closed_at, relationship_end_at, last_activity_at, erasure_state (`NONE`, `RESTRICTED`, `PURGED`), dek_id | — |
| PII columns (encrypted fields) | `pan_ct`, `pan_hmac`, `pan_last4`; `dob_ct`; `bank_acct_ct`, `bank_acct_hmac`, `bank_acct_last4`; `fatca_tin_ct`; `nominee_id_ct`; `aadhaar_last4` only | AES-256-GCM envelope encryption with a per-principal DEK wrapped by KMS (allows crypto-shredding). HMAC blind index for lookups. The API returns masked values by default. |
| **`data_requests`** | id, principal_id, type (`ACCESS`, `CORRECTION`, `ERASURE`, `WITHDRAWAL`, `GRIEVANCE`, `NOMINATION`, `NOMINEE_INVOCATION`), channel, status (`RECEIVED` → `VERIFIED` → `IN_PROGRESS` → `AWAITING_EXTERNAL` → `RESOLVED` / `REJECTED`), received_at, ack_at, due_at (+30 d), hard_due_at (+90 d), verified_at, verification_method, assignee_id, external_ref (KRA/RTA ticket), outcome_code, response_sha256, response_sent_at, rule9_contact_included, dpb_escalation_info_sent | SLA fields indexed; all changes go to `data_request_events` |
| `data_request_events` | request_id, at, actor, event, note | Append-only |
| `privacy_nominees` | principal_id, name, relationship, mobile, email, created_consent_id, revoked_at | — |
| `nominee_invocations` | nominee_id, principal_id, trigger (`DEATH`, `INCAPACITY`), evidence_object_key, verified_by, verified_at, status | — |
| `retention_policies` | code, category, trigger_event, duration, action (`ERASE`, `PSEUDONYMISE`, `RESTRICT`), legal_citation | Compliance approval |
| `erasure_jobs` | id, principal_id, category, eligible_at, status, hold_id, executed_at, evidence_json (row counts, object keys, processor acks) | Append-only evidence |
| `erasure_tombstones` | principal_id, category, erased_at | Replayed after any backup restore |
| `legal_holds` | id, scope (principal, category, global), reason, authority_ref, placed_by, placed_at, released_at | Two-person approval |
| **`processors`** | id, name, role (`PROCESSOR`, `INDEPENDENT_FIDUCIARY`, `SUB_PROCESSOR`), services, purposes[], data_categories[], storage_region, cross_border bool, dpa_signed_at, dpa_expires_at, breach_notice_hours, sub_processors, certifications (ISO 27001, SOC 2), last_review_at, next_review_at | — |
| **`data_sharing_log`** | id, principal_id, recipient_id (FK processors), data_categories[], purpose_code, legal_basis, shared_at, reference (order id, KRA ref), suppress_from_access_report | Written by every outbound integration adapter (Cybrilla client, SES, SMS) |
| `processor_erasure_tasks` | erasure_job_id, processor_id, method (API or ticket), requested_at, confirmed_at | — |
| **`data_access_log`** | admin_id, principal_id, fields_revealed[], reason_code, ticket_ref, at, ip | Every unmasked PII reveal; R-LOG |
| `security_incidents` | id, detected_at, aware_at, classification, is_personal_data_breach, severity, systems, data_categories, est_principals, status, root_cause, remediation | — |
| `breach_notifications` | incident_id, target (`CERT_IN`, `DPB_INITIAL`, `DPB_72H`, `PRINCIPALS`, `CYBRILLA`, `AMC_RTA`), due_at, sent_at, content_sha256, ref_no | Timers |
| `breach_affected_principals` | incident_id, principal_id, notified_at, channel | — |
| `cross_border_register` | processor_id, data, destination, basis, safeguards, approved_by | — |
| `marketing_suppressions` | contact_hash, channel, source, at | — |
| `dpia_assessments` (SHOULD) | feature, date, risks, mitigations, approver | — |

**Trigger sketch for `consent_records`** (this is the fix for the v1 gap):

```sql
REVOKE UPDATE, DELETE, TRUNCATE ON consent_records FROM app_rw;
CREATE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS
$$BEGIN IF current_user <> 'retention_purger' THEN RAISE EXCEPTION 'consent_records is append-only'; END IF; RETURN OLD; END$$;
CREATE TRIGGER consent_records_immutable BEFORE UPDATE OR DELETE ON consent_records
FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
```

### 7.2 Investor-facing features (web and Expo, shared `@sanchay/privacy` package)

| Feature | Details |
|---|---|
| Privacy Centre (Settings) | Consents per purpose with toggles; notice history; language switch; Download my data; Correct; Close account & erase; Nominate a person; Grievance; "Who we share with" (from `processors`); retention summary |
| Onboarding consent components | Layered notice, JIT notice sheets, affirmative checkbox / toggle components (**never pre-ticked**). Rendered text hash is computed on the server (v1 pattern). |
| Web cookie banner | Essential only by default. Analytics loads only after P09 consent. |
| In-app inbox | Breach notices, notice changes, retention notices |
| Low-end Android | Notices are plain text with no heavy webviews; the 22-language bundles load lazily by locale |

### 7.3 Admin / ops console screens

| Screen | Roles | Function |
|---|---|---|
| Privacy Requests Queue | ops_agent, compliance_officer | SLA colour timers (30 / 90 d), filters, assignment, bulk export |
| Request Detail | same | Identity verification, export generation, KRA correction routing, **erasure plan preview** (per-category outcome and reason), response composer with Rule 9 block auto-appended |
| Consent Explorer | compliance_officer (read-only) | Per-investor consent timeline, hash-chain verification, evidence pack PDF |
| Notice & Purpose Registry | compliance_officer (approve), engineer (draft) | Draft → approve → publish; material-change flag triggers the re-consent campaign; per-locale versions |
| Retention & Erasure Console | compliance_officer | Upcoming purges, dry-run report, job history with evidence, failed processor erasures |
| Legal Holds | compliance_officer + second approver | Place and release holds |
| Vendor / Processor Register | compliance_officer | DPA status, review due dates, cross-border flags |
| Incident & Breach Console | security_lead, compliance_officer, CEO | 6 h / 72 h timers, affected-cohort query builder, templated notices (Rule 7(1)(a)–(e), 7(2)(a)–(b)), dispatch log |
| PII Reveal (break-glass) | ops_supervisor | Masked by default; reveal requires a reason and ticket; writes to `data_access_log`; daily digest to compliance |
| Nominee Invocations | ops_supervisor | Evidence review and approval |
| Privacy Compliance Dashboard | compliance_officer, management | Open requests, SLA breaches, withdrawal rates, erasure backlog, overdue DPA reviews |

### 7.4 Jobs (NestJS scheduler / BullMQ)

| Job | Schedule | Function |
|---|---|---|
| `consent-propagator` | Event-driven, retries up to 72 h | On withdrawal: stop the purpose, suppress marketing, delete the analytics person, purge CAS data, remove push token; record `processor_erasure_tasks` |
| `retention-evaluator` | Nightly | Compute `eligible_at` per principal and category; create `erasure_jobs` |
| `pre-erasure-notifier` (SHOULD) | Nightly | Voluntary notice 48 h before erasure for R-DRAFT, mirroring r.8(2) |
| `erasure-executor` | Nightly | Hold check, then crypto-shred the DEK / delete rows and objects / pseudonymise; write evidence and tombstones; call processors |
| `dsr-sla-monitor` | Hourly | Escalate at day 7 (access), day 21 and day 60; page at day 85 |
| `cas-raw-sweeper` | Hourly | Delete any CAS file older than 1 h |
| `draft-purge` | Nightly | R-DRAFT |
| `log-lifecycle` | S3/CloudWatch policies | 180 d hot, 13 months total |
| `access-anomaly` | Daily | Flag admin reveals above a threshold or at odd hours |
| `consent-chain-anchor` | Nightly | Merkle root to S3 Object Lock |
| `retro-notice` / `reconsent-campaign` | On demand / 13 May 2027 | Covers s.5(2) and material changes |
| `processor-review-reminder` | Monthly | DPA expiry and review due |
| `breach-timer` | Event-driven | Timers for CERT-In 6 h, DPB "without delay", DPB 72 h, and principal notices |
| `restore-tombstone-replay` | On DB restore | Re-apply erasures |

---

## 8. Children's data

| Question | Recommendation |
|---|---|
| Minor investors (folio in the minor's name, operated by a guardian)? | **Out of scope at launch.** They would need verifiable parental consent (s.9(1), r.10), a ban on tracking, behavioural monitoring and targeted ads (s.9(3), which conflicts with P09/P11), minor-specific KYC and payment rules, and a change of status at majority. Revisit after launch as a separate epic with its own DPIA. |
| Age gate | A "18 or older" declaration at signup. Then **hard-verify the DOB from the PAN/KRA response**. If under 18: stop onboarding, show an explanation, and erase under R-DRAFT (keep a `pan_hmac` rejection marker for 1 yr under Rule 8(3)). This processing is exempt under the Fourth Schedule, Part B item 6. |
| Minor **nominees** (allowed by SEBI; guardian details required) | In scope. Treat the minor's data as child data:<br>- Collect only the SEBI minimum (name, DOB, relationship, guardian name/contact, one identifier). No analytics or marketing use.<br>- **Verifiable consent:** the investor declares they are the minor's parent or lawful guardian. Sanchay already holds that investor's reliable, KYC-verified identity and age, which meets r.10(1)(a) (illustration Case 3).<br>- If the investor is **not** the guardian: at launch, block with an explanation (MUST). SHOULD: send an OTP link to the named guardian, who proves they are an adult via a DigiLocker age token (r.10(1)(b)(ii)). |
| Persons with disability acting through a lawful guardian (r.11) | Not supported at launch. Route to ops, who must verify the court or designated-authority appointment before any account is opened. |

---

## 9. Processors, vendor contracts and cross-border transfers

### 9.1 Recommended vendors

| Function | Recommended vendor | Data sent | Location | Cross-border? | Notes |
|---|---|---|---|---|---|
| Cloud, DB, storage, KMS | AWS ap-south-1 (Mumbai); DR in ap-south-2 (Hyderabad) | All | India | No | RDS Multi-AZ, KMS CMKs; CloudFront serves static assets only (`Cache-Control: no-store` on APIs) |
| Order, KYC and mandate rails | Cybrilla FP | Identity, bank, nominee, orders | India (confirm in the DPA) | No (confirm) | Main DPA. The production-inquiry email must also ask about data residency, sub-processors and breach SLA. |
| Email (transactional + marketing) | Amazon SES ap-south-1 | Email, message body (no full PAN or account numbers) | India | No | Separate configuration sets for marketing and transactional mail |
| SMS OTP / transactional | MSG91 (named in the v1 TODO) or Gupshup / Karix | Mobile, OTP, templated text | India | No | TRAI DLT templates; no PII in templates beyond masked references |
| Push | Direct FCM / APNs from the backend (not the Expo push relay) | Push token + **generic payload with no PII** ("You have an update"); details fetched in-app | US (Google / Apple) | **Yes (the only exception)** | Record in `cross_border_register` |
| Product analytics (P09) | **Self-hosted PostHog on AWS ap-south-1** | Pseudonymous id, events; no PII properties | India | No | Only after consent. Supports person deletion. |
| Crash reporting | **Self-hosted Sentry in ap-south-1** (not Crashlytics or SaaS Sentry) | Stack traces with scrubbing (port v1 `PiiRedactor` rules to TS); pseudonymous user id | India | No | Under P10 (security and reliability) |
| Logs / SIEM | CloudWatch + S3 ap-south-1, GuardDuty, CloudTrail | Logs (redacted) | India | No | Meets CERT-In's 180 days in India |
| Support / ticketing | Build into the admin console (tickets = `data_requests` + support) | — | India | No | Avoids a vendor |
| Source code / CI | GitHub, EAS Build | **Code only, never data** | US | Yes (no personal data) | Secret scanning. No prod dumps in repos. |
| **AI coding agents / LLMs** | — | **No production personal data, ever** | — | — | MUST: synthetic data only; prod DB and log access denied to agent credentials |

### 9.2 Required DPA clauses (Rule 6(1)(f); Act s.8(2), 8(7)(b); Rule 8(3) illustration Case 2)

1. Process only on documented instructions and for the listed purposes.
2. Security safeguards at least equal to Rule 6(1)(a)–(g); ISO 27001 or equivalent (also covers SPDI r.8).
3. Notify Platizio of any breach **≤6 h** after awareness, so Platizio can meet CERT-In 6 h and DPB "without delay". Use the Rule 7(2)(b) content fields.
4. Sub-processors only with prior written approval; the same terms flow down.
5. **Data in India**; no transfer abroad without written approval.
6. Help with rights requests within **5 business days**.
7. Keep logs for **≥1 year**. On termination or instruction, erase or return data and provide a **certificate of erasure**.
8. Audit and inspection rights; annual security questionnaire; VAPT summary.
9. Confidentiality; CERT-In compliance; a named contact.

### 9.3 Cross-border position

| Instrument | Status on 2026-09-25 | Sanchay rule |
|---|---|---|
| DPDP s.16 negative list; Rule 15 orders | None notified (assumption, based on the sources below; re-check before launch) | India-only by policy; any exception needs a `cross_border_register` entry approved by the compliance officer |
| Rule 13(4) SDF localisation | Not applicable (not an SDF) | — |
| SPDI r.7 (until May 2027) | Transfer allowed only to a place with the same level of protection, and only if needed for a contract or consented to | Push-token exception disclosed in the notice |
| RBI payment data storage (Apr 2018 directive) | Binds payment system operators (PG / Cybrilla), not Platizio directly | Flow down in the Cybrilla DPA |
| CERT-In | Logs in India | Covered |

---

## 10. Security safeguards (Rule 6(1)) mapped to controls

| Rule 6 clause | Control | Artefact |
|---|---|---|
| (a) Encryption, obfuscation, masking, tokens | TLS 1.3; RDS/S3 KMS encryption; field-level envelope encryption with a per-principal DEK (§7.1); blind indexes; masking by default in API DTOs; Aadhaar last 4 only | `@sanchay/crypto` package; `MaskedPan` type in shared DTOs |
| (b) Access control | Admin SSO + WebAuthn MFA; RBAC roles (ops_agent, ops_supervisor, compliance_officer, security_lead, engineer); DB roles (`app_rw`, `retention_purger`, `readonly_analytics` on views without PII); AWS SSM (no SSH); no prod data in dev or staging | IAM policies; Nest guards |
| (c) Visibility: logs, monitoring, review | `data_access_log`, pgaudit on PII tables, CloudTrail, GuardDuty, anomaly job, monthly access review | Access-log viewer screen |
| (d) Continuity | Multi-AZ, PITR 35 d, cross-region snapshots to ap-south-2, quarterly restore drill + tombstone replay | Runbook |
| (e) Keep logs and data 1 year | R-LOG (13 months), R-DRAFT (1-year floor) | Lifecycle policies |
| (f) Processor contracts | §9.2 DPA | `processors.dpa_signed_at` |
| (g) Technical and organisational measures | ISMS policy set; secure SDLC (SAST, dependency scan, secret scan); annual VAPT; staff privacy training; named Grievance Officer / privacy contact; annual internal privacy audit (voluntary DPIA-lite) | `dpia_assessments` |

Carry over from v1 lessons:
- Fail-closed OTP bypass guard (the C1 master-code gap).
- Rate limiting.
- Redaction of API snapshots, including a `pan` rule for identifier fields.

---

## 11. Breach notification playbook

| Step | Deadline | Recipient | Content | Source |
|---|---|---|---|---|
| Detect / aware (T0) | — | Internal on-call | Open a `security_incidents` row; decide "personal data breach?" using s.2(u), which covers confidentiality, integrity **and availability** | Act s.2(u) |
| CERT-In report | **≤6 h** from noticing (if it is a listed incident type) | CERT-In | Prescribed format | CERT-In Directions 2022 |
| Processor → Platizio | ≤6 h | Platizio | DPA clause 3 | DPA |
| DPB initial intimation | **Without delay** (internal target ≤24 h) | Data Protection Board | Nature, extent, timing, location, likely impact | Rule 7(2)(a) |
| Affected Data Principals | **Without delay** (internal target ≤72 h), via in-app inbox + email + SMS | Each affected investor | Description, nature, extent and timing; likely consequences; mitigation taken; steps they can take; contact person | Rule 7(1)(a)–(e) |
| DPB detailed report | **≤72 h** from awareness (or longer if the Board agrees in writing) | DPB | Updated details; events and causes; mitigation; findings on who caused it; remediation; **report on notices sent to principals** | Rule 7(2)(b)(i)–(vi) |
| Contractual notices | As the contracts require (target ≤24 h) | Cybrilla, affected AMCs/RTAs | Summary | Empanelment / DPA |
| Post-incident | ≤30 days | Internal | Root cause analysis, corrective actions, DPIA update | Rule 6(1)(g) |

**Note:** a ConsentOS page dated 21 Sep 2026 says the DPB has no Chairperson yet. It is not the primary source. Build the pipeline anyway; the obligations to principals start on 13 May 2027 whatever the Board's status.

---

## 12. DPDP compliance backlog

Priority key:
- **MUST-L**: launch gate. Needed for SPDI or CERT-In now, or DPDP by 13 May 2027. Given the launch timing, it is gated at launch.
- **MUST-27**: must be live by 13 May 2027, even if launch comes earlier.
- **SHOULD**: recommended.

| ID | Item | Priority | Legal driver (effective date) | Build artefacts | Acceptance criteria |
|---|---|---|---|---|---|
| PRV-01 | Purpose registry and data-category seed (§3) | MUST-L | s.5, s.6(1); r.3 (May 2027); SPDI r.5(3) (now) | `purposes`, `data_categories`, registry admin screen | Every PII field maps to ≥1 purpose; CI lint fails on unmapped columns (schema annotations) |
| PRV-02 | Privacy notice v1 (Rule 3 checklist), T&C (real document), execution-only declaration | MUST-L | r.3; SPDI r.4; AMFI MC §5.2.2(b) | `privacy_notices`; legal copy | Legal sign-off; Rule 3 checklist all green; no placeholder hashes (v1 FAIL) |
| PRV-03 | Notice in 22 Eighth Schedule languages + English | MUST-27 | s.5(3) (May 2027) | Locale bundles | Every locale published and hashed; language picker at T0 |
| PRV-04 | Immutable `consent_records` (trigger, grants, hash chain, WORM anchor) | MUST-L | s.6(10) burden of proof; SPDI r.5(1) | Table + trigger + anchor job | UPDATE/DELETE by the app role fails in an integration test; chain verifier passes |
| PRV-05 | Onboarding consent flow T0–T7 (layered, JIT, affirmative, nothing pre-ticked) | MUST-L | s.6(1); r.3 | `@sanchay/privacy` UI components; web + Expo | E2E: no processing call before its consent row exists |
| PRV-06 | Privacy Centre (toggles, history, language, links) | MUST-L | s.6(4), r.3(c)(i) (withdrawal as easy as consent) | Screens, API | Withdrawal is ≤2 taps from Settings; parity check against consent |
| PRV-07 | `consent-propagator` (stop ≤24 h, processors ≤72 h) | MUST-L | s.6(6), s.8(7)(b) | Job, `processor_erasure_tasks` | Test: P09 withdrawal deletes the PostHog person; P11 withdrawal suppresses sends |
| PRV-08 | Field-level encryption, blind index, masking DTOs; Aadhaar last 4 only | MUST-L | r.6(1)(a); SPDI r.8 | `@sanchay/crypto`, schema | No plaintext PAN or account number in DB dumps or logs (automated scan) |
| PRV-09 | Admin RBAC + MFA + break-glass reveal + `data_access_log` | MUST-L | r.6(1)(b),(c) | Admin auth, reveal screen | Every reveal logged with a reason; unauthorised roles are blocked |
| PRV-10 | Log pipeline: 180 d hot in India, 13-month retention, PII redaction (port `PiiRedactor`, including PAN identifiers) | MUST-L | CERT-In (now); r.6(1)(e), r.8(3) | CloudWatch / S3 lifecycle; redaction lib | Log scan finds 0 PAN / email / mobile patterns; lifecycle policy verified |
| PRV-11 | Backups, DR, restore drill + tombstone replay | MUST-L | r.6(1)(d) | Runbook, `erasure_tombstones` | Quarterly drill evidence |
| PRV-12 | Grievance Officer / privacy contact designated and published (Rule 9); privacy@ mailbox | MUST-L | SPDI r.5(9) (now); s.8(9)-(10), r.9 | Website/app footer, notice | Contact visible on web and app; appended automatically to every response |
| PRV-13 | `data_requests` engine + Privacy Requests Queue + SLA monitor (30 d target / 90 d cap) | MUST-L | SPDI r.5(9) (1 month); s.13, r.14(3) | Tables, screens, `dsr-sla-monitor` | Overdue alert fires in test; timeline is complete |
| PRV-14 | Access / export (s.11), including `data_sharing_log` | MUST-L | s.11 (May 2027) | Export service, `data_sharing_log` written by all adapters | Export lists every recipient; s.11(2) suppression honoured |
| PRV-15 | Correction flows (contact, bank, nominee self-serve; KYC via KRA) | MUST-L | s.12(2), s.8(3) | Profile flows, KRA modification through FP | No local override of KRA-sourced fields; no defaulted compliance attributes (v1 finding 11) |
| PRV-16 | Close account & erase flow (app-store compliant) + erasure plan preview | MUST-L | s.12(3), s.8(7); Apple 5.1.1(v); Google Play | Screens, pre-checks, response letter | Response lists each category as erased or retained, with law and date |
| PRV-17 | Retention engine (`retention_policies`, `retention-evaluator`, `erasure-executor`, restricted state, crypto-shred) | MUST-27 (build before the first closure; aim for launch) | s.8(7), r.8(3); PMLA r.3 | Jobs, console | Dry-run report matches §5.2; a held record is never purged |
| PRV-18 | Legal holds (two-person) | MUST-L | SEBI AML MC; s.17 | `legal_holds`, screen | Hold blocks the executor in test |
| PRV-19 | Processor register + DPAs signed (Cybrilla, AWS, SES, SMS vendor) + `cross_border_register` | MUST-L | s.8(2); r.6(1)(f); SPDI r.7 | `processors` table, screen, legal documents | No vendor goes live without `dpa_signed_at` (deploy checklist) |
| PRV-20 | India-only residency guardrails (IaC region lock, SCP denying non-India regions except IAM/global services) | MUST-L | s.16 / r.15 posture; CERT-In | AWS SCPs | Terraform/CDK policy test |
| PRV-21 | Push payloads carry no PII; direct FCM/APNs | MUST-L | Minimisation; cross-border | Notification service | Payload schema forbids PII fields |
| PRV-22 | Analytics and crash tools self-hosted in ap-south-1; analytics consent-gated | MUST-L | s.6; minimisation | PostHog, Sentry infrastructure | No analytics call before P09 consent (network test) |
| PRV-23 | Web cookie banner (essential by default, equal-prominence reject) | MUST-L | s.6(1) | Next.js component | Lighthouse / network test: no analytics before consent |
| PRV-24 | Breach playbook + Incident console + timers (CERT-In 6 h; DPB immediate + 72 h; principals) | MUST-L (CERT-In now) / MUST-27 (DPB) | CERT-In; s.8(6), r.7 | `security_incidents`, `breach_notifications`, templates | Tabletop exercise completed; templates cover r.7 fields |
| PRV-25 | Age gate + PAN DOB check; under-18 block and erasure | MUST-L | s.9; Fourth Schedule Part B(6) | Onboarding rule | Test PAN with DOB under 18 is blocked |
| PRV-26 | Minor-nominee guardian declaration (investor is the parent) | MUST-L | s.9(1), r.10(1)(a) | Nominee step, consent record | Minor nominee without the declaration is rejected |
| PRV-27 | MF nomination per the SEBI Jan 2025 rules; nominee data minimised and encrypted | MUST-L | SEBI circular 10 Jan 2025; minimisation | Nominee flow | Only the SEBI-required fields are collected |
| PRV-28 | Privacy nominee (s.14) + invocation workflow | MUST-27 | s.14, r.14(4) | `privacy_nominees`, `nominee_invocations`, screens | End-to-end invocation test |
| PRV-29 | CAS import consent, in-memory parsing, raw-file sweeper, deletion on withdrawal | MUST-L | s.6, minimisation | P07 flow, sweeper | No CAS file older than 1 h in S3; withdrawal deletes holdings |
| PRV-30 | Android / iOS permissions minimised (no READ_SMS, contacts or location; SMS Retriever) | MUST-L | Minimisation; Play policy | App config | Manifest audit in CI |
| PRV-31 | Store privacy disclosures (Play Data safety, Apple privacy labels) consistent with the purpose registry | MUST-L | Store policy | Release checklist | Labels are generated from `purposes` |
| PRV-32 | No production personal data for AI agents or in lower environments; synthetic data seeding | MUST-L | s.8(5), r.6; cross-border | Seed scripts, IAM denies | Agent credentials cannot reach the prod DB |
| PRV-33 | Material-change re-consent campaign + s.5(2) retro-notice job | MUST-27 | s.5(2) (May 2027) | Job, modal | Any pre-2027 notice version is re-noticed by 13 May 2027 |
| PRV-34 | Marketing: per-channel consent, suppression list, TRAI DLT consent for promotional SMS | MUST-L (if marketing is used at launch) | s.6; TRAI TCCCPR 2018 | `marketing_suppressions` | An unsubscribe link in every mail and SMS works within 24 h |
| PRV-35 | ISMS policies, annual VAPT, staff privacy training, ISO 27001-aligned controls | MUST-L | SPDI r.8; r.6(1)(g) | Documents | VAPT report before launch |
| PRV-36 | Privacy compliance dashboard | SHOULD | r.14(3) effectiveness | Screen | Monthly review minutes |
| PRV-37 | Voluntary 48 h pre-erasure notice for drafts | SHOULD | Mirrors r.8(2) | Job | — |
| PRV-38 | DPIA-lite per major feature (KYC, CAS, analytics) | SHOULD | Good practice (DPIAs are mandatory only for SDFs, r.13) | `dpia_assessments` | — |
| PRV-39 | Consent Manager interoperability (`consent_manager_id`, API) | SHOULD | Rule 4 (Nov 2026) | Schema is ready now; integration later | — |
| PRV-40 | Guardian OTP + DigiLocker age-token flow for minor nominees where the investor is not the parent | SHOULD | r.10(1)(b) | Flow | — |
| PRV-41 | Watch items: MeitY 12-month proposal, s.16 / r.15 orders, DPB portal and forms, SEBI nomination consultation (Mar 2026) | SHOULD | — | Compliance calendar | Quarterly review |
| PRV-42 | Minor-investor epic (verifiable parental consent, s.9(3) no tracking, SEBI minor rules) | SHOULD (post-launch) | s.9, r.10 | Separate DPIA | — |

**Suggested sequencing (2 devs + AI agents, 2-week sprints):**

| Sprints | Items |
|---|---|
| S1–S2 | PRV-01, 04, 08, 10, 12, 19, 20, 32 (foundations) |
| S3–S5 | PRV-02, 05, 06, 07, 09, 22, 23, 25–27, 29–31 (built into the onboarding and transaction work) |
| S6–S7 | PRV-11, 13–16, 18, 21, 24, 34, 35 |
| S8 | PRV-17, 28, 33, and 03 (translation vendor) |
| After launch | SHOULD items |

---

## 13. Assumptions

1. Platizio will not be notified as a Significant Data Fiduciary (SDF). If it is: DPO based in India, annual DPIA and audit, and r.13(3) algorithmic due diligence.
2. An AMFI-only MFD is **not** a PMLA "reporting entity". PMLA periods are adopted voluntarily as the retention floor; counsel to confirm.
3. Cybrilla is a Data Processor of Platizio for the Sanchay flows, not a joint fiduciary. Confirm in the DPA.
4. No s.16 negative list or Rule 15 order has been notified as of 2026-09-25. This is based on the sources below; the gazette was not searched directly.
5. The MeitY 12-month compression is **not notified** (ConsentOS, 21 Sep 2026). If it is notified, the MUST-27 items move to 13 Nov 2026. All of them except PRV-03, 28 and 33 are already launch-gated.
6. From statutory text, **not re-fetched this session** (verify):
   - DPDP Act section wording and the penalty schedule;
   - SPDI r.5(9) one-month timeline;
   - Companies Act s.128(5);
   - RBI 2018 payment-storage directive;
   - TRAI TCCCPR 2018;
   - UIDAI Aadhaar Data Vault;
   - Apple 5.1.1(v) and the Google Play account-deletion policy.

---

## 14. Sources

**Web sources (accessed 2026-09-25):**
- DPDP Rules 2025, G.S.R. 846(E), 13 Nov 2025 (gazette text; rules 1, 3, 6–15, 23, and the First, Third, Fourth and Seventh Schedules extracted verbatim): https://www.dpdpa.com/DPDP_Rules_2025_English_only.pdf ; PIB copy: https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf
- Act commencement (G.S.R. 843(E); dates 14 Nov 2025 / 14 Nov 2026 / 14 May 2027): https://www.amsshardul.com/insight/enforcement-of-the-dpdp-act-and-notification-of-the-dpdp-rules/ ; https://cadp.in/news/dpdp-act-commencement-and-data-protection-board-notified/
- Rule-by-rule effective dates: https://dpdpa.dcomply.in/rules/
- 12-month proposal: https://www.business-standard.com/technology/tech-news/meity-may-cut-compliance-timeline-for-key-dpdp-rules-to-12-months-126012201293_1.html ; https://ssrana.in/articles/meity-plans-to-cut-short-dpdp-compliance-timeline-and-notify-cross-border-restrictions-for-sdfs/
- Status as of 21 Sep 2026 (not notified; DPB not staffed): https://consentos.in/learn/dpdp-compliance-timeline/
- SPDI until 13 May 2027 / s.44(2): https://www.snrlaw.in/indias-digital-personal-data-protection-regime-takes-effect/ ; https://opsiocloud.com/in/knowledge-base/are-spdi-rules-still-in-force/
- AMFI Master Circular for MFDs, AMFI/MFD-CIR/32/2025-26, 14 Jan 2026 (pp.22, 37–38, 62): https://www.amfiindia.com/uploads/AMFI_Master_Cicular_for_MF_Ds_3c7f5ee44f.pdf
- PMLA record periods: https://enforcementdirectorate.gov.in/media/pmla/186bd230-ffa6-4282-9822-de97121adf1b_The%20Prevention%20of%20Money-laundering%20(Maintenance%20of%20Records)%20Rules,%202005.pdf ; https://fiuindia.gov.in/files/FAQs/faqs.html ; SEBI AML Master Circular (NSDL copy): https://nsdl.co.in/downloadables/pdf/2024-0077-_Policy-SEBI_Master_Circular_on_Guidelines_on_AML_Standards_and_CFT_Obligations_of_Securities_Market_Intermediaries_under_the_PMLA_2002_and_Rules_frame.pdf
- CERT-In Directions (28 Apr 2022): https://trilegal.com/wp-content/uploads/2022/05/2022-CERT-In-Directions-on-Reporting-Cyber-Incidents-1.pdf
- SEBI (Mutual Funds) Regulations 2026 (notified 14 Jan 2026, effective 1 Apr 2026): https://elplaw.in/leadership/sebi-revamps-and-replaces-its-30-year-old-regulations-for-mutual-funds/
- SEBI nomination revamp (10 Jan 2025): https://upstox.com/news/personal-finance/financial-regulations/revised-mutual-fund-and-demat-account-nomination-rules-from-march-1-2025-what-is-new/article-139984/ ; Mar 2026 consultation: https://www.newsonair.gov.in/sebi-seeks-public-comments-on-proposed-changes-to-nomination-norms-for-demat-accounts-mutual-fund-folios

**v1 code evidence (read-only):**
- `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/domain/ConsentRecord.java:10-43`
- `.../common/PiiRedactor.java:27-42, :96, :113-121`
- `C:/Users/pc/Desktop/WeathTech_v2/investor-frontend/src/views/LoginPage.tsx:816` (dead Privacy Policy link)
- Compliance findings from slice `map:docs-compliance`, which cites `docs/superpowers/COMPLIANCE-REVIEW-2026-09-03.md:188-206, :244-260, :320-324`
