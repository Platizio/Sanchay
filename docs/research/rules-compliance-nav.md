<!-- source: workflow wf_1d1c9b02-593 label research:rules-compliance-nav (brand-renamed) | exported 2026-09-28 -->

# Platizio v1 compliance and data-pipeline rules: port-ready specification for v2 (TypeScript)

This covers OTP, contact verification, the consent/2FA engine and the v1 fingerprint bug, nomination, validation regexes, the KYC pre-verification decision engine, the AMFI NAV pipeline and INR formatting.

**Method.** Every rule was read from Java/TS source and tests in read-only mode. Hash vectors were computed in memory with Node `crypto`. Nothing was written to disk.

**Security.** No credentials are reproduced. The local-profile bypass codes are masked as `<fixed dev code, preview "00…">`.

**Untrusted-content scan.** None of the files read contain text aimed at AI tools. One claim rests only on a comment: the SEBI circular IDs cited in `NomineeService.java:81-92`. I have not checked that circular against a primary source (see SME-1).

**Path prefixes used below:**
- `BE` = `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech`
- `BT` = `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/test/java/com/platizio/wealthtech`
- `MIG` = `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/resources/db/migration`
- `YML` = `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/resources/application.yml`
- `FE` = `C:/Users/pc/Desktop/WeathTech_v2/investor-frontend/src`
- `FT` = `C:/Users/pc/Desktop/WeathTech_v2/investor-frontend/tests-unit`

---

## 0. Summary table

| ID | Rule | Category | Confidence | v2 verdict |
|---|---|---|---|---|
| OTP-01..14 | Email/SMS OTP: 6 digits, 5 min, 5 attempts, 30 s cooldown, SHA-256(email:code), one live code, reference binding, bypass guard | Policy/Auth | High | PORT; drop bypass codes; switch to keyed HMAC |
| CV-01..08 | Contact-verification honesty (OTP / SELF_DECLARED / DEMO_STUB) and gates | Validation/Policy | High | PORT (investor-self only) |
| TXA-01..12 | Transaction 2FA: snapshot, hash, consent text, approve, consume-once, 60 min, one live challenge | State/Policy | High | PORT the mechanics; redesign hashing (§3.13) and when challenges are created |
| TXA-BUG | Why v1 fingerprints never match for investor-self purchases | Defect | High | MUST-FIX by design |
| NOM-01..12 | Nominee cap, exactly 100%, minors/guardians, tri-state decision, opt-out with signed form and OTP | Validation/Policy | High (cap value: Low) | PORT; cap from config |
| VAL-01..14 | PAN, mobile, email, name, IFSC, PIN, account, ARN, ISIN, age | Validation | High | PORT into shared zod |
| KYC-01..06 | Readiness decision tables (backend flow, FE decision engine, readiness action enum) | Eligibility/State | High | PORT one unified table on the server |
| NAV-01..16 | AMFI parse, fetch, retry, floors, quarantine, staleness, backfill, units provenance, integrity monitor | Data pipeline | High | PORT |
| FMT-01..08 | INR lakh/crore formatting, null/negative display, "never show invested as current value" | Calculation/Display | High | PORT as pure functions (no `toLocaleString`) |

---

## 1. OTP rules

### OTP-01 Code generation
- **Rule.** The code is a uniformly random number of `length` digits, zero-padded. Length is floored at 4.
- **G/W/T.** Given `length = 6`, when a code is issued, then it is `"000000"`..`"999999"`, e.g. `"004271"`.
- **Constants.** `app.otp.length = 6` (`YML:226`), floor `Math.max(4, length)` (`BE/service/OtpService.java:106`). Generated with `SecureRandom.nextInt(10^length)` and `%0Nd` padding (`:359-363`).
- **Confidence.** High.
- **v2.** Use `crypto.randomInt(0, 10**len)` and `padStart`. The Java version overflows `int` for length ≥ 10.

### OTP-02 Storage hash
- **Rule.** Only `lowercase-hex SHA-256(UTF-8("<normalizedEmail>:<code>"))` is stored. The email is normalized as `trim().toLowerCase(Locale.ROOT)`.
- **Source.** `OtpService.java:160, 365-367, 382-390`; `MIG/V6__add_email_otps.sql:3-13` (`code_hash varchar(64)`).
- **Test vectors** (computed):
  - `"user@example.com:123456"` → `2689d27542f0d651980f7ed701e747cfd495f91773989df4d2282bc58b693beb`
  - `"investor@sanchay.in:004271"` → `7492719c2cb589a6c969c5de4c2541cc49ed9eb2b2e9a435c71961721ba81d55`
  - Also asserted: the stored hash is non-blank and does not contain the plaintext code (`BT/service/OtpServiceTest.java:65-67`).
- **Comparison.** Constant-time (`MessageDigest.isEqual`, `:373-380`).
- **Confidence.** High.
- **v2 note.** A 10^6 code space is trivially brute-forced offline from a leaked hash. Recommend `HMAC-SHA256(pepper, "email:code")` and `crypto.timingSafeEqual`. This is a deliberate change; record it as an ADR.

### OTP-03 Expiry
- **Rule.** A code is valid for 5 minutes. It is expired when `expiresAt < now`; the exact instant is still valid. An expired code is burned (`consumedAt = now`) and the call returns 401 `"Invalid or expired code. Please request a new one."`.
- **G/W/T.** Given a code issued at 10:00:00, when it is verified at 10:05:01, then 401 and the code is burned.
- **Source.** `YML:227`; `OtpService.java:97, 161, 267-271`. The response carries `expiresInSeconds = 300` (`:179-183`, test `OtpServiceTest.java:59`).
- **Confidence.** High.

### OTP-04 Attempt lockout
- **Rule.**
  - Every wrong code increments `attempts` and returns 401 with the generic message.
  - The code is NOT burned on the attempt that reaches the maximum.
  - The next call, with any code including the correct one, sees `attempts >= 5`. It burns the code and returns 401 `"Too many incorrect attempts. Please request a new code."`.
  - Failure bookkeeping commits in its own `REQUIRES_NEW` transaction, so it survives a caller rollback.
- **G/W/T.** Given a live code, when 5 wrong codes are submitted, then each returns 401 generic, `attempts` = 1..5 and `consumedAt` stays null. When a 6th submission arrives (even correct), then 401 lockout and `consumedAt` is set.
- **Constants.** `app.otp.max-attempts = 5` (`YML:228`), floored at 1 (`OtpService.java:108`).
- **Source.** `OtpService.java:272-291, 313-326`. Tests: `BT/service/OtpServiceLockoutPropagationTest.java:83-136`, `OtpServiceTest.java:215-232`.
- **Confidence.** High.
- **v2.** Persist the attempt increment outside the business transaction (separate query/transaction).

### OTP-05 Resend cooldown
- **Rule.** A new code is refused while the newest live code in the same scope is less than 30 whole seconds old. The refusal is 400 `"Please wait {30-s} second(s) before requesting another code."`, singular when the wait is 1. It is typed as `ResendCooldownException` so anti-enumeration callers can answer generically.
- **G/W/T.** Given a code created at t0, a request at t0+12 s gets "Please wait 18 seconds…". At t0+29 s it gets "Please wait 1 second…". At t0+30 s a new code is issued.
- **Source.** `YML:229`; `OtpService.java:138-149, 191-195`. The response carries `resendInSeconds = 30`.
- **Confidence.** High.

### OTP-06 Single live code per scope
- **Rule.** Issuing a code burns every unconsumed code for the same `(email, purpose[, referenceId])`.
- **Source.** `OtpService.java:134-136, 151-153`.
- **Confidence.** High.

### OTP-07 Reference binding (anti cross-consume)
- **Rule.** When `referenceId` (a challenge id) is supplied, cooldown, invalidation, storage and verification are all scoped to `(email, purpose, referenceId)`. A sibling challenge's code never matches.
- **Source.** `OtpService.java:119-136, 223-231, 260-264`; `MIG/V62__add_email_otp_reference_id.sql`. Test: `OtpServiceTest.java:254-287`.
- **Confidence.** High.

### OTP-08 Purposes
- **Enum** (`BE/domain/OtpPurpose.java:7-27`): `LOGIN, SIGNUP, INVESTOR_LOGIN, INVESTOR_SIGNUP, TRANSACTION_APPROVAL, PROFILE_APPROVAL, PROFILE_CHANGE_APPROVAL, NOMINATION_OPT_OUT, CONTACT_EMAIL_VERIFICATION`. The column is `varchar(48)` since V69.
- **Email wording per purpose** (`OtpService.java:334-356`):

  | Purpose | "Use the code below to %s" |
  |---|---|
  | TRANSACTION_APPROVAL | "approve your transaction" |
  | PROFILE_CHANGE_APPROVAL | "approve a change to your profile" |
  | CONTACT_EMAIL_VERIFICATION | "confirm your email address" |
  | SIGNUP / INVESTOR_SIGNUP | "complete your sign up" |
  | everything else | "sign in" |

  The subject line contains the code: `"Your Platizio verification code: <code>"`.
- **Confidence.** High.
- **v2 keep:** `INVESTOR_LOGIN`, `INVESTOR_SIGNUP`, `TRANSACTION_APPROVAL`, `NOMINATION_OPT_OUT`, `CONTACT_EMAIL_VERIFICATION`, plus new `MOBILE_VERIFICATION` and `MANDATE_APPROVAL` if needed.
- **v2 drop:** the distributor-era `LOGIN`, `SIGNUP`, `PROFILE_APPROVAL`, `PROFILE_CHANGE_APPROVAL`.
- **v2 note.** Consider removing the code from the email subject; it appears on lock screens.

### OTP-09 Anti-enumeration
- **Rule.** Every request returns the same shape and message: `"If the email is eligible, a one-time passcode has been sent."`, `expiresInSeconds: 300`, `resendInSeconds: 30`, `devCode: null`. An ineligible address gets `genericResponse()` with the identical shape.
- **Source.** `OtpService.java:60-61, 179-183, 397-400`.
- **Confidence.** High.

### OTP-10 Email syntax
- **Rule.** After normalization the email must match `^[^\s@]+@[^\s@]+\.[^\s@]+$`, else 400 `"Please enter a valid email address."`.
- **Source.** `OtpService.java:129-131, 369-371`.
- **Vectors.** `"not-an-email"` → 400 (`OtpServiceTest.java:245-246`).
- **Confidence.** High.

### OTP-11 Mail outage
- **Rule.** If the mail provider fails, the request returns 503 (`MailUnavailableException`). The whole request rolls back: no new code exists, and the user's previously live code is NOT invalidated.
- **Source.** `BE/service/MailUnavailableException.java`; `OtpServiceTest.java:111-148`.
- **Confidence.** High.

### OTP-12 Success consumption joins the caller's transaction
- **Rule.** A successful verify sets `consumedAt` inside the caller's transaction. If a downstream step fails, the consumption rolls back and the code stays usable.
- **Source.** `OtpService.java:41-54, 293-295`; `OtpServiceLockoutPropagationTest.java:142-171`.
- **Confidence.** High.

### OTP-13 Bypass-code startup guard
- **Rule.** The app refuses to boot if any of these is set:
  - `app.otp.dev-master-code` (non-blank)
  - `app.otp.sms-demo-code` (non-blank)
  - `app.otp.expose-dev-code = true`

  The only exception is when `local` is both among the resolved profiles and explicitly selected (env `SPRING_PROFILES_ACTIVE`, `-Dspring.profiles.active` or `--spring.profiles.active`). A defaulted `local` counts as not local.
- **Source.** `BE/config/BypassCodeStartupGuard.java:53-63, 128-141, 185-200`; `YML:1-11, 231-243`. The local profile sets `<fixed dev code, preview "00…">`.
- **Dev master code scope.** It is accepted for every purpose except `TRANSACTION_APPROVAL` (`OtpService.java:253-258`). It IS accepted for `NOMINATION_OPT_OUT` and `CONTACT_EMAIL_VERIFICATION`, where contact verification records it as `DEMO_STUB`.
- **Confidence.** High.
- **v2.** Ship no bypass path in any production build. Use test-only DI or a fake provider.

### OTP-14 SMS channel modes
- **Rule** (`BE/service/SmsOtpService.java:82-155`):
  - **Provider-backed** only if `isSmsEnabled() && isEnabled()`.
  - **Demo** if a demo code is configured (local only). Accepted codes are recorded `DEMO_STUB`.
  - **Unavailable** is the default. Send does nothing (logged at ERROR), verify refuses every code, `isAvailable() = false`, and the UI offers self-declaration.
- **Normalization.** Mobile is converted to E.164 `+91<10 digits>` (`BE/validation/MobileFormat.java`).
- **Vectors** (`BT/service/SmsOtpServiceBypassTest.java:39-140`): no provider and no demo code rejects every code and null. Demo code `" <code> "` with whitespace is accepted after trim. A real provider's verdict is never overridden by the demo code.
- **Confidence.** High.
- **v2 gap.** The mobile channel has no local expiry, attempt counter or cooldown; v1 relies on the provider. v2 must apply OTP-03/04/05 to the MSG91 (or equivalent) channel itself.

---

## 2. Contact-verification honesty

### CV-01 Method enum
- **Rule.** `OTP | SELF_DECLARED | DEMO_STUB`. `isProviderVerified()` is true only for `OTP`.
- **Source.** `BE/domain/ContactVerificationMethod.java:4-37`.
- **Confidence.** High.
- **v2.** For a B2C product, `SELF_DECLARED` should not exist for the investor's own email. Decide separately for mobile while no SMS provider is live (SME-5).

### CV-02 Method assignment on success
- Email: dev master code → `DEMO_STUB`; a genuine challenge → `OTP` (`BE/service/InvestorContactVerificationService.java:311-315`).
- Mobile: if the SMS channel is demo → `DEMO_STUB`, else `OTP` (`:298-302`).
- Tests: `BT/service/ContactVerificationMethodHonestyTest.java:70-133`.
- **Confidence.** High.

### CV-03 Email counts as verified for review
- **Rule.** `emailVerified == true && (method == OTP || (method == DEMO_STUB && devMasterCodeEnabled))`.
- **Source.** `:333-340`.
- **Confidence.** High.

### CV-04 Mobile counts as verified for review
- **Rule.** `mobileVerified == true && (OTP || (SELF_DECLARED && noSmsProvider) || (DEMO_STUB && noSmsProvider && demoAvailable))`.
- **Source.** `:342-355`.
- **Confidence.** High.

### CV-05 Email self-declaration
- The distributor path refuses it: `"Email must be verified with a one-time code…"` (`:146-155`).
- The investor path `declareContactAsInvestor` ALLOWS it (`:262-276`). The CV-03 gate still refuses a `SELF_DECLARED` email, so it cannot pass.
- **Confidence.** High (discrepancy).
- **v2.** Forbid it.

### CV-06 `belongs_to` values
- **Rule.** `self|spouse|dependent_child|dependent_parent|guardian`, default `self`.
- **Source.** `BE/dto/ContactDeclarationRequest.java:16`; `BE/dto/OtpVerifyCodeRequest.java:14`; `:47, 369-391`.
- **Confidence.** High.

### CV-07 Readiness for the provider profile
- **Rule.** `isReadyForExternalProfile = identityVerified(PAN, name, DOB) && CV-03 && CV-04`. The FP investor profile is created only then, because FP has no DELETE.
- **Source.** `:181-194, 322-326`.
- **Confidence.** High.

### CV-08 Flags reset on change, and durable failure audit
- Verified flags reset whenever the value changes. This is stated in a comment at `:178` and I did not re-read `InvestorService` to confirm it (**Medium**).
- Failed verifications are audited through `logIndependently` (REQUIRES_NEW), so the audit row survives a rollback (`:102-108, 130-137`).
- **SME/verify.** Confirm the reset-on-change behaviour in `InvestorService` before porting.

---

## 3. Consent / transaction-2FA engine

### TXA-01 Challenge creation
- **Rule.** Creating a challenge does the following, in order:
  1. Load the account; 404 if missing.
  2. Build the type-specific snapshot and check that the account's `investorId` equals the transaction's (403 otherwise).
  3. Supersede any live predecessor.
  4. Persist a challenge with `status = PENDING`, `snapshotJson`, `snapshotSha256 = sha256Hex(UTF-8(snapshotJson))`, `consentTemplateVersion`, `consentRenderedText` (rendered FROM the snapshot), `channel = EMAIL`, `maskedDestination`, `otpPurpose = TRANSACTION_APPROVAL`, `deliveryAttempts = 0`.
  5. Audit `APPROVAL_CHALLENGE_CREATED` with the hash.
- **Source.** `BE/service/TransactionApprovalService.java:132-187`.
- **Snapshot key order** (Jackson `LinkedHashMap`, compact JSON, nulls included):
  - **PURCHASE** (`:204-221`): `transactionType:"PURCHASE", transactionKind:"LUMPSUM", orderId, investorId, productSchemeId, productSchemeName, productSchemeIsin, productSchemeAmcName, orderDateTime, amount, units, paymentMode, productCategory`
  - **SIP** (`:224-243`): `transactionType:"SIP", transactionKind:"SIP", orderId, investorId, productSchemeId, productSchemeName, productSchemeIsin, productSchemeAmcName, orderDateTime, sipName ("SIP ("+freq+")" or "SIP"), amount, sipFrequency, sipStartDate, sipInstalments, mandateMode, paymentMode`
  - **REDEMPTION** (`:252-279`): `transactionType:"REDEMPTION", transactionKind:"REDEMPTION", redemptionId, orderId, investorId, orderDateTime, units, amount`, then from the source order `productSchemeName, productSchemeAmcName, productSchemeIsin, folioNumber, allotmentNav, allotmentDate`, and if the source is a SIP also `sipName, sipNumber, sipFrequency`.
- **Value encoding.** UUID → string. `BigDecimal` → `stripTrailingZeros().toPlainString()`, so `5000.00` becomes `"5000"` and `238.115400` becomes `"238.1154"` (`:676-678`). Dates → ISO `LocalDate`. `orderDateTime` → `OffsetDateTime.toString()`; this is the bug, see TXA-BUG.
- **Masked email** (`:680-689`): `"priya.sharma@gmail.com"` → `"p***@gmail.com"`; `"a@x.com"` → `"***@x.com"`.
- **Confidence.** High.

### TXA-02 One live challenge per transaction
- **Rule.** Live statuses are `PENDING | CHALLENGE_SENT | APPROVED`. Creating a challenge moves any live predecessor to `SUPERSEDED`. The database enforces this with a partial unique index.
- **Source.** `:89-93, 157-164`; `MIG/V61__add_transaction_approval_challenges.sql:47-50` (`ux_txn_approval_live ON (transaction_id) WHERE status IN (...)`).
- **Confidence.** High for the rule; **Medium for a suspected defect.** The code uses `save()` rather than `saveAndFlush()` before inserting the successor. Hibernate flushes INSERTs before UPDATEs, which can trip the unique index. The sibling `NominationOptOutChallengeService.java:74-79` documents exactly this and uses `saveAndFlush`.
- **v2.** Supersede and insert inside one transaction with explicit ordering (`UPDATE` then `INSERT`).

### TXA-03 Sending the approval OTP
- **Rule.**
  - Only `PENDING` or `CHALLENGE_SENT` challenges can receive a code; otherwise 400 `"This approval challenge can no longer receive a code."`.
  - The investor must own the challenge (403).
  - The OTP is bound to `challenge.id`.
  - Status becomes `CHALLENGE_SENT`, `deliveryAttempts++`, `expiresAt = now + 300 s`.
  - The code is never returned (except in the dev flag case).
- **Source.** `:305-311, 350-378`.
- **Confidence.** High.
- **v2.** Drop the distributor resend path (`:328-336`).

### TXA-04 Approve
- **Rule.** Checks run in this order:
  1. status is `CHALLENGE_SENT`, else 400
  2. `expiresAt` has not passed, else 400 `"This approval has expired. Request a new one."`
  3. the account owns the transaction, else 403
  4. `consentAccepted` is true, else 400 and the OTP is NOT touched
  5. OTP verify (bound, 401 on failure)
- **On success.** A `consent_records` row is written. Then `status = APPROVED`, `approvedAt = now`, `consentRecordId`, `ip` (truncated to 64), `userAgent` (512) and `sessionId` (128) are set, and `APPROVAL_APPROVED` is audited.
- **Source.** `:395-439`. Tests: `BT/service/TransactionApprovalServiceTest.java:288-382`, in particular `approveRejectsConsentNotAcceptedWithoutCallingVerify`.
- **Confidence.** High.

### TXA-05 Atomic gate `assertApprovedAndConsume(txId, recomputedHash)`
- **Rule.**
  1. Find the newest `APPROVED` challenge; none → refuse.
  2. `approvedAt` or `consentRecordId` null → refuse ("carries no recorded consent").
  3. Stored hash ≠ recomputed hash → refuse ("changed after the investor approved it").
  4. `anchor + 60 min < now` → refuse, with an independent audit `APPROVAL_EXPIRED_AT_EXECUTION`. The anchor is `approvedAt`, or `createdAt` as fallback.
  5. Otherwise set `CONSUMED` and `consumedAt`.

  Refusals never mutate the challenge and are `noRollbackFor`. A provider failure after the flip rolls the flip back (retry-safe). A replay finds `CONSUMED` and is blocked (exactly-once).
- **Source.** `:474-518, 532-536`. Tests: `TransactionApprovalServiceTest.java:407-498`, `BT/service/TransactionApprovalExpiryTest.java:73-216`, `BT/service/TransactionApprovalGateRollbackTest.java:164-234`.
- **Placement in v1:**
  - Purchase: after the idempotent "existing payment redirect" short-circuit (`BE/service/InvestorActionService.java:690-712`).
  - SIP: only when `mandateId <= 0` (`:383-396`).
  - Redemption: `BE/service/OrderService.java:1894-1897`.
- **Confidence.** High.

### TXA-06 Execution validity and sweeper
- **Rule.** An approval can execute for 60 minutes from `approvedAt`. A sweeper runs every 5 minutes (initial delay 60 s) and moves stale `APPROVED` rows to `EXPIRED`, audited `APPROVAL_EXPIRED_UNEXECUTED`. It does not touch `PENDING` or `CHALLENGE_SENT`.
- **G/W/T.** Approved at 10:00. Executed at 10:59:59 → passes. Executed at 11:00:01 → refused, status stays `APPROVED` until the sweep. Sweep at 11:05 → `EXPIRED`.
- **Constants.** `APPROVAL_EXECUTION_VALIDITY = 60 min` (`TransactionApprovalService.java:87`); sweeper `fixedDelay = 300000`, `initialDelay = 60000` (`BE/init/TransactionApprovalExpirySweeper.java:38`).
- **Confidence.** High.

### TXA-07 Supersede on edit
- **Rule.** SIP amount or instalment-day update, SIP cancel, and order delete each move a live challenge to `SUPERSEDED`, audited `APPROVAL_SUPERSEDED_ON_EDIT`.
- **Source.** `:607-619`.
- **Confidence.** High.

### TXA-08 Consent record (append-only)
- **Fields.** `subject_type` is `INVESTOR_ACCOUNT` (investor login) or `INVESTOR_PROFILE` (pre-account); legacy `INVESTOR` rows were relabelled in V80. Then `consent_key`, `template_version`, `rendered_text`, `content_sha256 = sha256Hex(renderedText)` (null hashes as ""), `ip` (≤64), `user_agent` (≤512), `accepted_at`. Rows are never updated. Reads union both identities, newest first.
- **Source.** `BE/service/ConsentRecordService.java:30-62, 79-100`; `MIG/V59__add_consent_records.sql`, `MIG/V80__disambiguate_consent_subject_types.sql`.
- **Vector.** `sha256("")` = `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
- **Confidence.** High.

### TXA-09 Consent template catalogue (rendered only from the frozen snapshot)
- **Keys.** `purchase_approval`, `sip_approval`, `redemption_approval`. Version `v2.0` for each. The legacy v1.0 wording is kept verbatim.
- **Source.** `BE/service/TransactionConsentTemplates.java:63-87, 111-141`.
- **Purchase** (`:166-193`): `"I authorise this PURCHASE of {₹amount | N units | the amount shown above} in {fund}, and I confirm the details shown above are correct."` Then either `" Units: N."` or the "units … determined by the applicable NAV on the date my payment is realised … not known" sentence. Then `" Payment mode: X."` if present, the second-factor sentence, and the footer.
- **SIP** (`:197-233`): names the amount per instalment, frequency (lower-cased), `starting <date>`, `for N instalments`. Adds a standing-mandate disclosure ("Recurring debits: … without a further one-time passcode … per-debit ceiling … may be higher than the instalment amount"). Adds `Mandate type: X.` if present.
- **Redemption** (`:237-298`): quantity phrase `"N units (about ₹X)"`, `"N units"`, `"₹X"` or `"the quantity shown above"`; folio. Then units-unknown / value-unknown / final-value-may-differ, plus Exit load, Tax (capital gains and TDS), Settlement, Credit account, and "cannot be cancelled or reversed" paragraphs.
- **Fund phrase.** `"<name> (<AMC>, ISIN <isin>)"`. If the name is missing: `"the scheme identified in the approval snapshot referenced below"`.
- **Footer.** `"(Consent template <key> <ver>. Transaction|Redemption <id>. Approval snapshot SHA-256 <hash|unavailable>.)"`.
- **Never throws.** A malformed or null snapshot still renders type and hash.
- **Test vectors** (`BT/service/TransactionConsentTemplatesTest.java`):
  - `"Units: 238.1154."` (:115)
  - `"Payment mode: NETBANKING."` (:124)
  - `"238.1154 units (about ₹5,000.00)"` (:174)
  - `"folio FP-ORD-9931"` (:173)
  - SIP `"monthly"`, `"starting 2026-10-05"`, `"for 12 instalments"`, `"Mandate type: E_MANDATE."` (:242-248)
  - null snapshot → `"Approval snapshot SHA-256 unavailable"` (:412-419)
- **Worked purchase example** (synthetic, for the golden test): `"I authorise this PURCHASE of ₹5,000.00 in HDFC Flexi Cap Fund - Direct Growth (HDFC Mutual Fund, ISIN INF179K01YV8), and I confirm the details shown above are correct. The number of units allotted is determined by the applicable NAV on the date my payment is realised, and is therefore not known at the time I give this consent. Payment mode: NETBANKING. This authorisation is recorded with a one-time passcode sent to my verified email address as a second factor of authentication. (Consent template purchase_approval v2.0. Transaction <orderId>. Approval snapshot SHA-256 <hash>.)"`
- **Defect.** The redemption template reads `payoutBankLabel` (`:281`), but `renderRedemptionSnapshot` never writes it. Every v1 redemption consent therefore says the account "is not identified inside this consent record".
- **v2 new templates required:** switch, STP, SWP, SIP pause/modify/cancel, mandate. The v1 frontend maps `SWITCH|SWP|STP|PAUSE_RECURRING_PLAN` to `PURCHASE` wording (`FE/v2-ui/lib/approvalConsent.ts` `normalizeApprovalType`), which is wrong for v2.
- **Confidence.** High.

### TXA-10 `rupees()` for consent evidence (backend)
- **Rule.** Indian 2-2-3 grouping. The scale is widened to at least 2 decimals and NEVER rounded; extra decimals are kept. A negative value is written `-₹…`. Null, blank or non-numeric input returns null.
- **Vectors** (`TransactionConsentTemplatesTest.java:369-388`):

  | Input | Output |
  |---|---|
  | `"500"` | `₹500.00` |
  | `"5000"` | `₹5,000.00` |
  | `"100000"` | `₹1,00,000.00` |
  | `"12345678"` | `₹1,23,45,678.00` |
  | `"5003.55"` | `₹5,003.55` |
  | `"5000.12345"` | `₹5,000.12345` |
  | `null`, `"  "`, `"not-a-number"` | `null` |

- **Source.** `TransactionConsentTemplates.java:385-424`.
- **Confidence.** High.

### TXA-11 Onboarding declarations
- **T&C.** `investor_tnc` v1.0, text `"The investor has read and accepted the Platizio Terms & Conditions, the schedule of charges, the risk disclosures, and the privacy policy."`, sha256 `bd9085d00da4220bbfa888eaedce86d5c84940b87df6f36d47a0733b74e4b019`.
- **FATCA/CRS.** `fatca_crs_declaration` v1.0, sha256 `9d2c729fbc7e5e69b38a0aad203eefb174e6e48b011627558c9a7c846dde1961`.
- The text is served by the server with its hash (`GET /investor/link/declarations`).
- **Source.** `BE/service/ConsentTexts.java:20-47`.
- Hashes were computed from the transcribed strings. Re-verify against Java before pinning them as golden values.
- **Confidence.** High.
- **v2.** There is no real T&C document. The sentence above is not a T&C; the must-fix (i) stands.

### TXA-12 Frontend consent gate
- **Rule.** The consent tick-box is offered only when the server-provided text is on screen. If the text is loading or unavailable, the gate is closed.
- **Client grace.** `EXPIRY_GRACE_MS = 120000`: the client treats an approval as not expired until `expiresAt + 2 min`, but the server refuses at `expiresAt`, so the two disagree.
- **Source.** `FE/v2-ui/lib/approvalConsent.ts`; `FT/approval-consent.spec.ts`.
- **Confidence.** High.
- **v2.** Remove the grace, or drive expiry from the server.

### TXA-BUG Why the v1 fingerprint never matches (investor-self purchase)
1. `OrderService.createOrderAsInvestor` is `@Transactional` (`BE/service/OrderService.java:578-608`). It calls `createOrder` (self-invocation, same transaction) and then `transactionApprovalService.createChallenge(...)` in the same transaction.
2. `BaseEntity.@PrePersist` sets `createdAt = OffsetDateTime.now()` (`BE/common/BaseEntity.java:25-30`). That value has nanosecond precision (JDK 15+ Linux clock; about 100 ns on Windows) and the JVM default offset, e.g. `+05:30`.
3. `createChallenge` loads the order through `orderRepository.findById`. That returns the same managed entity from the first-level cache, so it never re-reads the DB. The snapshot freezes `"orderDateTime":"2026-09-25T10:15:30.123456789+05:30"`.
4. At confirm time, a later request loads the order from Postgres. `timestamptz` holds microseconds, and the driver/Hibernate returns it normalized, typically UTC: `"2026-09-25T04:45:30.123457Z"`. `renderPurchaseSnapshot` then serializes a different string.
5. The hashes differ, `assertApprovedAndConsume` refuses "changed after the investor approved it", and no money moves. The UI already showed "authorised".

**Vector** (synthetic snapshot, identical except `orderDateTime`):
- in-memory → `863d795eaa10c3fa3b3c752f06eec08883b3e426412004e850487a04326994c0`
- DB-reloaded → `3fa8facbe0e727dc8624ad79809432b4440ca34bde926cbc1635a10bf99cd370`

**Compounding gap.** `cybrillaClient.createOrder` runs inside `createOrder` BEFORE the challenge exists (brief ref `OrderService.java:529, 601-608`).

**v2 canonical-hash spec (recommended):**
- (a) Create the local draft, then the challenge, then approve. Do NO provider write before `CONSUMED`.
- (b) Build the snapshot only from values read back from the DB after insert (`INSERT … RETURNING`), never from in-memory objects.
- (c) Timestamps: UTC ISO-8601 truncated to milliseconds (`toISOString()` of a value that went through `timestamptz` and was truncated in SQL with `date_trunc('milliseconds', …)`). Better, exclude volatile timestamps and hash `orderId` plus economic terms only.
- (d) Money and units: fixed-scale decimal strings (amount scale 2, units scale 4, NAV scale 4) from a decimal library. No floats.
- (e) Canonical JSON (RFC 8785 / sorted keys), UTF-8, SHA-256 hex.
- (f) Store both the snapshot and its hash. At execution, recompute from the DB and compare with constant-time equality.
- (g) Property test: `hash(snapshotFromDb(insert(x))) == hash(snapshotFromDb(reload(x)))`.

---

## 4. Nomination

### NOM-01 Nominee cap
- **Rule.** At most `MAX_NOMINEES = 3` on both backend and frontend. On whole-set validation the cap is checked BEFORE the total. The frontend accepts a server-served `maxNominees` override. The cap applies when adding, never when editing an existing nominee.
- **Source.** `BE/service/NominationRules.java:25, 56-60, 98-101`; `FE/utils/nomination.ts:22, 338-342`. Tests: `BT/service/NominationRulesTest.java:31-36, 88-91`; `FT/nomination-rules.spec.ts:140-151`.
- **Vectors.** Shares `["25","25","25","25"]` → error containing "3 nominees", checked before the sum.
- **Confidence.** High for code; **LOW for the regulatory value.** The v1 comment says "SEBI: at most three". To my knowledge SEBI's Jan-2025 nomination revamp allows up to 10. This is not verified against a primary source (SME-1).
- **v2.** Take the cap from config (`NOMINATION_MAX_NOMINEES`) and serve it to the client.

### NOM-02 Allocation
- **Rule.**
  - Each share is 0.01–100.00 (`BE/dto/NomineeRequest.java:30`). The frontend requires `> 0` and `≤ 100` (`FE/utils/nomination.ts:365-367`).
  - Incremental add or update: the running total must be ≤ 100.
  - Whole-set replace and confirm: the total must be EXACTLY 100 when any nominee exists. An empty set is a no-op for this check but `isAllocationComplete([]) = false`.
- **Source.** `NominationRules.java:37-92`.
- **Vectors.**

  | Shares | Result |
  |---|---|
  | `60,40` | OK |
  | `100.00` | OK |
  | `60` | error "must sum to 100% (currently 60%)" |
  | `50` (running) | OK |
  | `50,50` (running) | OK |
  | `50,51` (running) | error "cannot exceed 100% (would be 101%)" |
  | `33.34,33.33,33.33` | complete |
  | `99.99` | not complete |
  | `40,null` | total 40 |

  Frontend summary: `[60]` → `UNDER` with remaining 40; `['0.1','0.2']` total 0.3; `[null,undefined,'','abc',50]` total 50; over 100 → `OVER` with the excess; exact → `EXACT` (`FT/nomination-rules.spec.ts:156-181`). The messages include "Shares must add up to exactly 100%".
- **Confidence.** High.
- **v2.** Use decimal arithmetic on the server. Round only for display on the client.

### NOM-03 Minority is derived from DOB
- **Rule.** Age is completed years between DOB and `asOf`; the nominee is a minor if age < 18. DOB is mandatory. A future DOB is rejected.
- **Frontend extras.** A non-existent date such as `2020-02-31` is rejected. Age > 120 is rejected ("over 120 years old"). A null, invalid or future date gives `UNKNOWN`, never "adult".
- **Source.** `NominationRules.java:31, 109-131`; `FE/utils/nomination.ts:79-126, 350-363`.
- **Vectors** (`TODAY = 2026-09-02`):

  | DOB | Result |
  |---|---|
  | 2016-05-01 | minor |
  | 2008-09-02 | adult (age 18) |
  | 2008-09-03 | minor (17) |
  | 1980-01-01 | adult |

  Tests: `NominationRulesTest.java:97-106`, `FT/nomination-rules.spec.ts:55-70`.
- **Confidence.** High.

### NOM-04 Guardian for a minor
- **Rule.** Required: guardian name (trimmed, at least 2 characters, max 160) AND guardian relationship (max 60). Error messages carry the 1-based position, never the nominee's name (PII).
- **Source.** `NominationRules.java:151-190`; `NomineeRequest.java:43-45`; `BE/service/NomineeService.java:794-801`.
- **Vectors.** Name `null`, `"   "` → required error. `"X"` → "too short". `"Asha Menon"` → OK. An adult with no guardian → OK. Error text contains `"Nominee 2"` (`NominationRulesTest.java:121-199`).
- **Frontend difference.** The frontend has no length-2 check and validates relationship before name (`nomination.ts:378-385`).
- **Confidence.** High.

### NOM-05 Tri-state decision
- **Rule.** `NOT_ASKED | NOMINATED | OPTED_OUT`.
  - Backend `derive(optedOut, count)`: optedOut wins, then count > 0 → `NOMINATED`, else `NOT_ASKED`. A stored `NOMINATED` with 0 rows reads back as `NOT_ASKED`.
  - Frontend precedence: explicit value (aliases `PENDING`/`DECISION_PENDING` → `NOT_ASKED`, `OPT_OUT` → `OPTED_OUT`), then nominees > 0, then optedOut, else `NOT_ASKED`.
- **Source.** `BE/domain/NominationDecision.java:25-59`; `NomineeService.java:189-198`; `FE/utils/nomination.ts:214-240`.
- **Confidence.** High. The precedence differs between the layers only for contradictory legacy rows.
- **v2.** Keep one enum. It should be impossible to reach a state with both nominees and an opt-out.

### NOM-06 Add, remove and replace effects
- **Add.** Clears the opt-out (→ `NOMINATED`), clears the confirmation stamp, `nominee_index = max + 1` (`NomineeService.java:270-300`).
- **Remove.** Deletes the nominee's ID document. The decision becomes `NOT_ASKED` if none remain, else `NOMINATED`. Records a `nomination_removal` consent when an investor subject exists. The audit carries position and share only (`:369-402`).
- **Replace.**
  - Runs `validateCompleteSet` plus per-nominee rules, deletes (and flushes), then inserts from index 0.
  - An empty set gives `NOT_ASKED`, but an existing `OPTED_OUT` is preserved (`:414-468`).
  - The investor variant requires the acknowledged declaration key: `nomination_removal` if rows exist, else `nomination_confirmed`. It records the matching consent. Creating from empty also stamps `nominationConfirmedAt` (`:642-697`).
- **Confidence.** High.

### NOM-07 Confirmation
- **Rule.** Requires at least 1 nominee, the cap, DOB and guardian for each, and exactly 100. On success it stamps `nominationConfirmedAt` and records the `nomination_confirmed` consent. "Outstanding" means `NOMINATED && confirmedAt == null`; onboarding attestation returns 409 while outstanding. Any later mutation clears the stamp.
- **Source.** `NomineeService.java:217-237, 530-561, 822-832`; `FE/utils/nomination.ts:266-270`.
- **Confidence.** High.

### NOM-08 Opt-out requires evidence
- **Rule.**
  1. Zero nominees on file, else "Remove them before opting out".
  2. Signed SEBI opt-out form uploaded (PDF/JPG/PNG, ≤ 5 MB).
  3. A challenge bound to `declarationSha256`, `formTemplateSha256` and `signedDocumentSha256`.
  4. Email OTP (`NOMINATION_OPT_OUT`, bound to the challenge id).
  5. Approve: re-hashes the current declaration; a mismatch moves the challenge to `SUPERSEDED` and errors. Then OTP, then consent `nomination_opt_out` recorded at approval (the only consent write).
  6. Consume on opt-out: re-reads the signed document hash; a mismatch moves to `SUPERSEDED`. Then `CONSUMED` and the decision becomes `OPTED_OUT`.

  Re-uploading supersedes any live challenge (uses `saveAndFlush`).
- **Source.** `BE/service/NominationOptOutChallengeService.java:66-215`; `NomineeService.java:482-523`; `FE/utils/nominationOptOutForm.ts:9-80`. Tests: `BT/service/NominationOptOutChallengeServiceTest.java:64-200`.
- **Declaration text** `OPT_OUT_CONSENT_TEXT` v2 (`NomineeService.java:106-118`): the three SEBI implications, verbatim, including the U+2014 dash. sha256 `6d827cd238ff11da7a82485c64b72b93f706c91fdb2d1ac996d66139f3c3dc7d`. Also: removal text `86a97c29…ab9a4`; confirm text `087c67aa…d28c02` (transcribed; re-verify).
- **Masking.** This path masks emails differently from TXA-01: `"priya.sharma@gmail.com"` → `"p**********a@gmail.com"`, `"ab@x.com"` → `"a*@x.com"` (`:232-242`). v2 should unify.
- **Known defect.** The `SUPERSEDED` write on a mismatch is followed by a `RuntimeException` inside `@Transactional`, so it is rolled back and does not persist.
- **Confidence.** High.

### NOM-09 UI consent gate fails closed
- **Rule.** `canRecord` is true only when the text is non-empty AND acknowledged. Loading or unavailable closes the gate.
- **Source.** `FE/utils/nomination.ts:451-482`.
- **Confidence.** High.

---

## 5. Validation regexes and field rules (move to shared zod)

| ID | Field | Rule | Source | Vectors / notes |
|---|---|---|---|---|
| VAL-01 | PAN | trim + uppercase, `^[A-Z]{5}[0-9]{4}[A-Z]$`, msg "Invalid PAN format. Expected format: AAAAA9999A" | `BE/validation/PanFormat.java`; `FE/utils/kycPreVerification.ts:375, 404-420` | `abcde1234f` → `ABCDE1234F` valid; `ABCD1234F` invalid |
| VAL-02 | Sandbox PAN (sandbox only) | POA simulator `^[A-Z]{3}P[A-Z][0-9]{4}[A-Z]$`; KYC-ready `…3751…`; KYC-unavailable `…3753…` | `PanFormat.java`; `kycPreVerification.ts:377-382` | `GYAPS3751D`. v2: keep behind an env flag, never in prod |
| VAL-03 | Mobile | normalize: strip non-digits; if 12 digits starting `91` drop 2; if 11 digits starting `0` drop 1; then `^[6-9][0-9]{9}$`; E.164 `+91…` | `BE/validation/MobileFormat.java` | `+91 98765-43210` → `9876543210`. FE `normalizeMobile` strips `91` whenever length > 10 and never strips a leading `0` (`kycPreVerification.ts:443-449`): mismatch |
| VAL-04 | Email | `^[^\s@]+@[^\s@]+\.[^\s@]+$`, trim + lowercase | `OtpService.java:370`; `kycPreVerification.ts:388` | |
| VAL-05 | Legal name | `(?i)^(?!.*\b(test\|dummy\|sample\|asdf\|qwerty\|unknown\|null\|none)\b)[a-z][a-z .'-]{1,79}$`, length 2–80 | `BE/dto/InvestorPreVerificationRequest.java:12-17`; FE `NAME_REGEX` + `DUMMY_NAME_REGEX` `:389-390` | `"Test User"` rejected. Rejects non-ASCII names; SME-7 |
| VAL-06 | DOB (investor) | valid date, < today, year ≥ 1900, age ≥ 18 unless `relationshipType == MINOR` | `kycPreVerification.ts:489-511`; `FE/utils/kycActionLocks.ts:1, 7-40` | Bug: `latestAllowedDobForMinimumAge` uses `toISOString()` of local midnight, so the displayed cutoff is one day early in IST |
| VAL-07 | Minor guardian PAN | required and PAN-format when `relationshipType = MINOR` | `kycPreVerification.ts:524-531` | |
| VAL-08 | IFSC | uppercase, `^[A-Z]{4}0[A-Z0-9]{6}$` | FE only: `FE/utils/referenceLookup.ts:83`, `FE/views/InvestorOnboarding.tsx:190` | No server-side check in v1; v2 must validate on the server |
| VAL-09 | PIN code | digits only, `^\d{6}$` | `referenceLookup.ts:49`; `BE/service/InvestorService.java:752` | |
| VAL-10 | Bank account number | `^\d{9,18}$` | `InvestorOnboarding.tsx:191` (FE only) | |
| VAL-11 | ARN | trim + uppercase, `^ARN-\d{1,9}$` | `BE/validation/ArnFormat.java` | v2: platform ARN config validation |
| VAL-12 | ISIN | FE `^INF[A-Z0-9]{10}$` (13 chars) | `FE/utils/orderableScheme.ts:40` | **Bug:** real ISINs are 12 characters (e.g. `INF179K01YV8`) and fail. v2: `^INF[A-Z0-9]{9}$`, or generic `^[A-Z]{2}[A-Z0-9]{9}[0-9]$` with a Luhn check digit |
| VAL-13 | OTP input | digits only (`/^\d*$/` on keypress) | `FE/components/TransactionApprovalPanel.tsx:230` | |
| VAL-14 | Nominee share / guardian | see NOM-02/04 | | |

---

## 6. KYC pre-verification decision engine

### KYC-01 Backend readiness action (`BE/domain/KycReadinessAction.java:35-90`)

| readiness.status | readiness.code | Action | canInvest |
|---|---|---|---|
| `verified` | any | PROCEED | yes |
| other / absent | `null` | MANUAL_REVIEW | no |
| | `kyc_unavailable`, `kyc_rejected` | SUBMIT_NEW_KYC | no |
| | `kyc_incomplete`, `kyc_onhold`, `kyc_legacy` | MODIFY_KYC | no |
| | `kyc_underprocess` | WAIT | no |
| | `kyc_deactivated` | BLOCKED | no |
| | `upstream_error`, `kyc_rate_limit_exceeded`, `rate_limit_exceeded` | RETRY | no |
| | anything else (`unknown`, new codes) | MANUAL_REVIEW | no |

- **Transient rule.** `isReadinessInconclusive = status blank && code in {kyc_rate_limit_exceeded, rate_limit_exceeded, upstream_error}`. This is a closed allow-list and default-deny. It is the only no-verdict shape an order gate may tolerate.
- **Confidence.** High.

### KYC-02 Backend onboarding flow stage resolver
Source: `BE/dto/KycFlowStatusResponse.java:93-482`. The first matching row wins.

| # | Condition | Stage | nextAction |
|---|---|---|---|
| 1 | no investor | KYC_NOT_STARTED | RUN_PRE_VERIFICATION |
| 2 | kycStatus == COMPLETED | KYC_COMPLETED | COMPLETE |
| 3 | readiness == verified OR kycComplianceStatus == true | KYC_ALREADY_VERIFIED | COMPLETE |
| 4 | no externalKycCheckId | PRE_VERIFICATION_REQUIRED | RUN_PRE_VERIFICATION |
| 5 | no kycRequestId && failed && code ∈ {kyc_unavailable, unavailable} | KYC_REQUEST_REQUIRED ("Create a fresh KYC request.") | CREATE_KYC_REQUEST |
| 6 | no kycRequestId && failed && code ∈ {kyc_incomplete, unknown} | KYC_REQUEST_REQUIRED ("Complete or update…") | CREATE_KYC_REQUEST |
| 7 | no kycRequestId && readiness blank && panVerification == verified && code not transient | KYC_REQUEST_REQUIRED | CREATE_KYC_REQUEST |
| 8 | no kycRequestId && externalKycStatus == accepted | PRE_VERIFICATION_PENDING | WAIT |
| 9 | no kycRequestId (else) | PRE_VERIFICATION_PENDING | WAIT |
| 10 | `requirements.fields_needed` non-empty | KYC_FIELDS_REQUIRED | WAIT |
| 11 | no identityDocumentId | AADHAAR_FETCH_REQUIRED | START_AADHAAR |
| 12 | aadhaar fetch status ∉ {successful, completed, verified} | AADHAAR_FETCH_PENDING | REFRESH_AADHAAR |
| 13 | aadhaarProofsAttached != true | AADHAAR_PROOFS_ATTACH_PENDING | REFRESH_AADHAAR |
| 14 | no esignId | ESIGN_REQUIRED | START_ESIGN |
| 15 | esign status ∉ {successful, completed, complete} | ESIGN_PENDING | REFRESH_ESIGN |
| 16 | kycStatus == NOT_STARTED | KYC_SUBMITTED_WAITING_PROVIDER | WAIT |
| 17 | else | KYC_IN_PROGRESS | WAIT |

- **Discrepancies with KYC-01.** `unknown` maps to CREATE_KYC_REQUEST here but MANUAL_REVIEW in KYC-01. `kyc_rejected`, `kyc_onhold`, `kyc_legacy`, `kyc_deactivated` and `kyc_underprocess` fall to rows 8–9 (WAIT) here.
- **v2.** Merge into one server-side table driven by KYC-01.
- **Confidence.** High (code); SME-4 for the intended mapping.

### KYC-03 Frontend `getPreVerificationDecision(external, ctx)`
Source: `FE/utils/kycPreVerification.ts:822-948`. Status and code are lower-cased and trimmed. Readiness falls back to the investor or KYC context fields.

| # | Condition | state | title | canProceed | requiresFreshKyc | requiresPanAadhaarLink |
|---|---|---|---|---|---|---|
| 1 | no payload | idle | "Pre-verification not started" | F | F | F |
| 2 | status present and ≠ completed | `accepted` if status == accepted, else `pending` | "Pre-verification in progress" | F | F | F |
| 3 | readiness == verified | verified | "Investor is ready to invest" | T | F | F |
| 4 | readiness == failed, code ∈ {kyc_unavailable, unavailable} | failed | "Fresh KYC required" (reason or default "No existing KYC was found…not an error") | F | T | F |
| 5 | readiness failed, code == upstream_error | retry | "Verification needs retry" | F | F | F |
| 6 | readiness failed, code ∈ {kyc_incomplete, unknown} | retry | "Investor is not ready yet" | F | F | F |
| 7 | readiness failed, other code | failed | "Investor is not ready yet" (reason or "Readiness failed (code).") | F | F | F |
| 8 | first failed field in [pan, name, date_of_birth] is pan with code aadhaar_not_linked | failed | "PAN–Aadhaar link required" | F | F | T |
| 9 | first failed field (other) | `retry` if code == upstream_error, else `failed` | "PAN details did not match" | F | F | F |
| 10 | pan, name and dob all verified | verified | "PAN details verified" | T | F | F |
| 11 | else | pending | "Pre-verification pending" | F | F | F |

- **Precedence defect.** Readiness is evaluated before field failures. A payload with `readiness=verified` and `pan=failed` returns `verified` (row 3).
- **Vectors.**
  - `{status:'completed', readiness:{status:'failed', code:'kyc_unavailable'}}` → row 4, `requiresFreshKyc = true`.
  - `{status:'completed', pan:{status:'failed', code:'aadhaar_not_linked'}}` → row 8.
  - `{status:'accepted'}` → row 2 with state `accepted`.
- **Confidence.** High.

### KYC-04 `canCreateFreshKycRequest` (FE `:770-797`)
- Any of pan, name or dob `failed` (or investor `panVerificationStatus` failed) → false.
- readiness verified → false.
- readiness failed → true only if code ∈ {kyc_unavailable, unavailable}.
- readiness absent AND pan verified → true.
- Else false.
- `isReadinessFailureBlockingKycRequest = readiness failed && !canCreate`.
- **Confidence.** High.

### KYC-05 Transaction eligibility (FE `FE/utils/investorEligibility.ts`)
- **Rule.** `investorStatus == READY_FOR_TRANSACTIONS` OR (kycStatus ∈ {COMPLETED, VERIFIED} AND bankVerificationStatus == VERIFIED).
- **Messages.** "Complete KYC before placing an order." / "Add and verify a bank account before placing an order."
- **Confidence.** High.

### KYC-06 Identity fingerprint and re-check trigger (FE `:1065-1098`)
- **Fingerprint.** `JSON.stringify({fullName upper, pan upper, dob, mobile normalized, email lower, relationshipType || 'SELF', guardianPan})`.
- **Defect (Medium confidence).** `shouldForceNewKycCheck` builds the "saved" fingerprint without mobile or email. Whenever `savedInvestor` is passed and the current identity has a mobile or email, the fingerprints differ and it always forces a re-check.
- Action locks: `FE/utils/kycActionLocks.ts:47-100`.

---

## 7. AMFI NAV pipeline

### NAV-01 Feed endpoints and HTTP
- **Endpoints.**
  - Latest: `https://www.amfiindia.com/spages/NAVAll.txt` (it 302-redirects to portal.amfiindia.com; redirects are followed).
  - History: `https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx?frmdt=dd-MMM-yyyy&todt=dd-MMM-yyyy` (English month).
- **HTTP.** Connect timeout 10 s, read timeout 60 s (body about 1.5 MB), UA `"Platizio-WealthTech/1.0 (NAV sync)"`, Accept `text/plain, text/csv, */*`, UTF-8. A non-2xx or empty body is an error. History requires `from ≤ to`.
- **Source.** `YML:269-292`; `BE/integration/nav/NavFeedProperties.java:44-90`; `BE/integration/nav/AmfiNavFeedClient.java:59-63, 116-236`.
- **Confidence.** High.

### NAV-02 Retry policy
- **Rule.** `maxAttempts = 3` (floor 1). Backoff before attempt n is `2s × 2^(n-2)`, so 2 s then 4 s (doublings capped at 16). Retry on transport errors and HTTP 5xx, 408, 429. Any other 4xx fails immediately.
- **Source.** `BE/integration/nav/NavFeedRetryPolicy.java`; `YML:287-292`.
- **Vectors** (`BT/integration/nav/NavFeedRetryPolicyTest.java:55-150`): transport fail then OK → slept `[2s]`. Three transport failures → slept `[2s, 4s]`, then rethrow. `maxAttempts = 4` → `[2s, 4s, 8s]`. 404 → no retry. 503 and 429 → retried.
- **Confidence.** High.

### NAV-03 Parser: header-driven layout
- **Rule.**
  - Strip a BOM. Split lines on `\R` and cells on `;`.
  - The first line with at least 3 cells whose squashed-lowercase keys contain a NAV column (`netassetvalue` or exactly `nav`), a `date` column and at least 1 `isin` column is the header. Lines before it are dropped.
  - `name` is the first remaining header containing `name` (optional).
  - No header found, or a null or blank body → `NavFeedFormatException` quoting at most 200 characters of the first line.
- **Layouts.**
  - Daily: `Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;…;Net Asset Value;Date`
  - History: `Scheme Code;NAV Name;Plan;Option;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Net Asset Value;Date`
  - "NAV Name" must NOT win the NAV column.
- **Source.** `BE/integration/nav/AmfiNavParser.java:152-241`.
- **Confidence.** High. SME-8: the live NAVAll.txt may have 6 columns without Plan/Option; the header-driven design handles either.

### NAV-04 Parser: rows
- **Rule.**
  - Lines with fewer cells than the maximum required index are skipped (AMC and section titles).
  - NAV: trim, strip commas, `BigDecimal` at the published scale. Must be > 0.
  - Placeholders `"", -, --, N.A., N.A, NA, N/A, NULL` (case-insensitive) are skipped for NAV, date and ISIN.
  - Date: `d-MMM-uuuu`, English, case-insensitive.
  - One `NavRow(isin trimmed and upper-cased, nav, navDate, schemeName trimmed or null)` is emitted per distinct non-placeholder ISIN on the line.
  - Rows dated after `latestAcceptableNavDate` (inclusive bound) go to `futureDated`. The unbounded overload uses `LocalDate.MAX`.
  - The Scheme Code column is ignored.
- **Source.** `AmfiNavParser.java:251-345`.
- **Vectors** (`BT/integration/nav/AmfiNavParserTest.java`):
  - `119551;INF209KA1K47;-;ABSL Flexi Cap Fund - Direct - Growth;Direct;Growth;25.3631;24-Aug-2026` → `(INF209KA1K47, 25.3631 [scale 4], 2026-08-24)`
  - `119553;INF209K01819;INF209K01DH6;…;10.7917;24-Aug-2026` → two rows, both 10.7917
  - Same ISIN in both columns → one row
  - `-;-` ISINs → none
  - NAV `- | N.A. | "" | not-a-number | 0.0000 | -1.2500` → skipped
  - Dates `31-Foo-2026 | 2026-08-24 | -` → skipped
  - `" inf209ka1k47 "` → `INF209KA1K47`
  - CRLF handled; header not on the first line is resolved
  - Bound 2026-08-26: row dated `24-Aug-2027` → `futureDated`; `26-Aug-2026` → usable; `01-Jan-2030` with two ISINs → both future, `furthestFutureDate = 2030-01-01`; null bound → error
- **Confidence.** High.
- **v2.** Also capture the AMFI Scheme Code (needed for catalogue and CAS matching) and validate ISIN shape.

### NAV-05 Tracked set
- **Rule.** Tracked ISINs = distinct catalogue `external_isin` ∪ ISINs actually held, normalized. For each tracked ISIN, keep the latest-dated row.
- **Source.** `BE/service/nav/SchemeNavSyncService.java:907-957`.
- **Confidence.** High.

### NAV-06 Run validation floors
All floors are checked in memory before any write. Any breach → run `FAILED` and `scheme_navs` is untouched. Source: `SchemeNavSyncService.java:399-479, 548-567`; `YML:293-332`.
1. `rowsParsed == 0 && futureRejected > 0` → FAILED "every usable row was future-dated…".
2. `rowsParsed < minRows (1000)` → FAILED "row floor breached: parsed N row(s), require at least 1000…".
3. `tracked == 0` → pass.
4. If a previous SUCCESS run exists with `rowsMatched > 0` and `startedAt` within `maxBaselineAge = 7 d`, and `ratio = 0.5 > 0`: if `matched < prev × 0.5` → FAILED "matched-count regression…". Otherwise, if `matched < prev × 0.9` → WARN `matched_count_degrading` (not a failure).
5. Otherwise (cold start): `matched / tracked < 0.10` → FAILED "cold-start matched-fraction floor breached…".
6. `matched / tracked < lowMatchWarnFraction 0.30` → WARN only.

**Vectors:**

| Case | Result |
|---|---|
| 17,772 rows, 1,488 of 3,321 tracked, cold start | 0.4481 → pass, no WARN |
| prev = 1488, matched 700 | FAILED (< 744) |
| prev = 1488, matched 1000 | pass + degradation WARN (< 1339.2) |
| prev = 1488, matched 1400 | pass |
| prev SUCCESS older than 7 d | cold-start rule applies |
| prev run FAILED | not used as baseline |

Tests: `BT/service/nav/SchemeNavSyncServiceTest.java:113-942`. **Confidence:** High.

### NAV-07 Future-date horizon
- **Rule.** `horizon = today(clock) + maxFutureDays (2)`. Future rows are dropped per row with a WARN; the rest of the feed survives. A future row never becomes the stored max.
- **Source.** `SchemeNavSyncService.java:131, 323-334`; `YML:343`.
- **Confidence.** High.
- **v2.** Evaluate "today" in `Asia/Kolkata`. v1 uses the system default zone here, `Clock.systemUTC()` in the resolver, and IST in the backfill and health check.

### NAV-08 Stale-feed skip
- **Rule.** If the feed's max NAV date is before the global stored max NAV date, the run is `SKIPPED` with nothing written. An equal date proceeds, but per-ISIN rows with the same date are no-ops.
- **Source.** `:579-592`.
- **Confidence.** High.

### NAV-09 Per-ISIN apply and jump quarantine
- **Rule.**
  - New ISIN → insert. It is never quarantined on its first quote.
  - Feed date ≤ stored date → skip, so `previousNav` is preserved.
  - Otherwise compute `days = max(1, stored.navDate → feed.navDate)`, `allowed = 0.25 × days`, `move = |new − old| / old` (scale 10, HALF_UP).
    - If `move > allowed`: keep the stored value, set `quarantined = true`, update `fetchedAt`, and do NOT append history.
    - Else: `previousNav ← nav`, `previousNavDate ← navDate`, write the new nav/date, `source = AMFI`, `schemeNameSnapshot` (≤ 255), `quarantined = false`.
  - History appends only accepted rows, and only if `(isin, navDate)` is absent.
  - The metadata mirror runs after commit in its own transaction and cannot fail the run.
- **Source.** `:619-760`; `YML:344`.
- **Vectors** (`SchemeNavSyncServiceTest.java:477-590`):

  | Stored | Feed | Result |
  |---|---|---|
  | 25.3102 @ 2026-08-21 | 253.102 @ 08-24 | quarantined, written 0 |
  | 25.3102 @ 08-23 | 38.0000 @ 08-24 (+50.1%) | quarantined |
  | same, tolerance 0.75 | same | accepted |
  | 25.3102 @ 08-21 | 38.0000 @ 08-24 (3 days, allowed 75%) | accepted, previousNav 25.3102 |
  | 25.3631 plausible | | clears quarantine |
  | none | 9999.0000 (new ISIN) | accepted |

- **Confidence.** High.

### NAV-10 Run bookkeeping and concurrency
- **Rule.**
  - A `nav_sync_runs` row is opened as `RUNNING` before the fetch, then closed as `SUCCESS | FAILED | SKIPPED` with `failure_reason` (≤ 1000 characters), `rowsParsed`, `rowsMatched`, `rowsWritten`, `maxNavDate`.
  - Runs are pruned after 90 days on every outcome.
  - A Postgres advisory lock (namespace `0x504C545A`, id `0x4E415653`) ensures a single runner.
- **Schedule.** `fixedDelay = 6h` (21600000 ms), initial delay random 60–180 s.
- **Source.** `:119-124, 866-891`; `BE/service/nav/SchemeNavSyncScheduler.java:32-101`; `YML:277-279`.
- **Confidence.** High.

### NAV-11 Quote resolution
- **Rule.** Look up a non-quarantined `scheme_navs` row with nav > 0 by the scheme's ISIN. Otherwise fall back to `product_schemes.metadata_json`: the `nav` field, as-of from `nav_date|navDate|nav_as_of|navAsOf|as_of`, previous from a list of aliases. The fallback is labelled `SEEDED`. `asOf(isin, date)` returns the latest history row on or before the date with nav > 0, labelled `AMFI_HISTORY`.
- **Source.** `BE/service/nav/SchemeNavResolver.java:190-343`.
- **Confidence.** High.
- **v2.** Drop the metadata fallback and return "unpriced" instead. A quarantined ISIN currently falls back to the mirror and is shown as `SEEDED`.

### NAV-12 Staleness grading
- **Rule.**
  - `UNDATED` if navDate is null (wins over AGED).
  - `AGED` if `days(navDate → today) > maxNavAge.toDays()` with default 7. A bound ≤ 0 or null switches the check off. A sub-day bound acts as 0 days.
  - `FRESH` otherwise. A future navDate is FRESH (clock skew).
  - `degraded = not FRESH`. Age never gates unit derivation.
- **Source.** `BE/service/nav/NavQuote.java:210-251`; `YML:333-339`.
- **Vectors** (`BT/service/nav/NavQuoteAgeTest.java`, TODAY 2026-08-26):

  | navDate | Grade |
  |---|---|
  | 08-24 | FRESH |
  | 08-19 (7 d) | FRESH |
  | 08-18 (8 d) | AGED |
  | 05-20 | AGED |
  | 08-27 | FRESH |
  | 12 h bound, yesterday | AGED |

- **Health indicator** (`BE/health/NavFeedHealthIndicator.java:84, 141-160`): no NAV → DOWN; newest NAV age > 4 days → DOWN `nav_stale`; last run FAILED → DEGRADED; else UP.
- **Doc/code mismatch.** `YML:345` says DEGRADED for a stale NAV, but the code returns DOWN.
- **Confidence.** High.

### NAV-13 Units provenance
- **Sources.** `UnitsSource ∈ {PROVIDER, DERIVED, MANUAL}`. `isEstimate = source != PROVIDER`. `hasEstimatedUnits = units != null && source != null && isEstimate`; null provenance counts as authoritative.
- **Precedence.**
  - A PROVIDER count may overwrite DERIVED (and clears the derivation audit columns).
  - DERIVED never overwrites PROVIDER.
  - Derivation only runs when units are null, and only from an allotment-date NAV whose source ∈ {AMFI, AMFI_HISTORY, PROVIDER}.
- **DB checks.** `units_source ∈ (PROVIDER, DERIVED, MANUAL)`. DERIVED requires `units_derived_nav_date` and `units_derived_at`.
- **Source.** `BE/domain/TransactionOrder.java:28-63, 200-219`; `BE/domain/SchemeNav.java:55-87`; `OrderService.java:895-931`; `MIG/V75__add_order_units_provenance.sql`.
- **Confidence.** High.

### NAV-14 Backfill of unit-less settled purchases
- **Eligibility.**
  - units null
  - type ∈ {PURCHASE, LUMPSUM_PURCHASE}
  - status ∈ {SUCCESSFUL, COMPLETED}
  - allotment date present
  - amount > 0
- **ISIN.** The frozen order ISIN, else the catalogue ISIN.
- **Pricing.**
  - The allotment date is converted to an IST calendar date.
  - One history fetch covering `[min date − 15 d, max date]`, with its own floors: rows ≥ 1000, and at least one candidate ISIN matched.
  - Fetched points are screened with the same jump rule against trusted history.
  - Price = the nearest NAV on or before the date (fetched wins only if strictly nearer), and the source must be derivable.
- **Formula.** `units = (amount − stampDuty, HALF_UP 2dp) ÷ nav`, scale 4, rounding DOWN. Stamp duty 0.005% (Rs 0.25 on Rs 5,000).
- **Other behaviour.** Dry run writes nothing. Idempotent. Orders are saved one at a time.
- **Skip reasons.** `ALREADY_HAS_UNITS, TRANSACTION_TYPE_NOT_BACKFILLABLE, ORDER_NOT_SETTLED, MISSING_ALLOTMENT_DATE, NON_POSITIVE_AMOUNT, MISSING_ISIN, NON_POSITIVE_INVESTIBLE_AMOUNT, NAV_IMPLAUSIBLE_JUMP, NO_NAV_ON_OR_BEFORE_ALLOTMENT_DATE, NON_POSITIVE_NAV, NAV_DATE_UNKNOWN, NAV_SOURCE_NOT_DERIVABLE, DERIVED_UNITS_NOT_POSITIVE`.
- **Source.** `BE/service/nav/NavBackfillService.java:153-187, 463-620, 921-933`.
- **Vectors** (computed):

  | Net | NAV | Result |
  |---|---|---|
  | 4999.75 (5000 − 0.25) | 25.3631 | 197.12692849 → **197.1269** (DOWN and HALF_UP agree) |
  | 999.95 | 10.7917 | 92.65917325 → backfill DOWN **92.6591**, OrderService HALF_UP **92.6592** |

- **Discrepancy.** `OrderService.java:924` uses HALF_UP; the backfill uses DOWN. v2 should use DOWN for every estimate.
- **Confidence.** High.

### NAV-15 Holdings integrity monitor
- **Rule.** Every hour (initial delay random 30–90 s), count settled purchases that have no units: status ∈ {SUCCESSFUL, COMPLETED, ACTIVE}, type ∈ {PURCHASE, LUMPSUM_PURCHASE}. Subtract the "unpriceable demo ISIN" floor (`INF123456789`, `INF000000002`, `INF000000003`) to get `repairable`. WARN if `repairable > 0`. Three gauges are published; no lock.
- **Source.** `BE/service/nav/HoldingsIntegrityScheduler.java:61-80, 143-190`; `YML:360-363`.
- **Discrepancy.** The backfill's settled set excludes ACTIVE.
- **Confidence.** High.
- **v2.** No demo floor. Alert on any count above zero.

### NAV-16 Derived-units exposure flag
- **Rule.** `app.nav-sync.expose-derived-units = false` by default. When false, holdings with DERIVED units render as unit-less (invested amount shown, currentValue null). It does not affect redeemability.
- **Source.** `YML:349-358`.
- **Confidence.** Medium; the read path was not re-read.

---

## 8. INR formatting and money display (frontend)

Source: `FE/v2-ui/lib/format.ts`, `FE/v2-ui/components/MoneyText.tsx`, `FE/utils/formatDate.ts`. All vectors below were computed with Node full-ICU.

### FMT-01 `fmtMoney(v, compact = false)`
- **Rule.** Not a finite number → `—`. Compact: |v| ≥ 1e7 → `₹{(v/1e7).toFixed(2)} Cr`; |v| ≥ 1e5 → `₹{(v/1e5).toFixed(2)} L`. Otherwise `₹` + en-IN grouping, at most 2 decimals, no minimum (`format.ts:11-19`).
- **Vectors.**

  | Input | fmtMoney | compact |
  |---|---|---|
  | 0 | ₹0 | ₹0 |
  | 500 | ₹500 | ₹500 |
  | 1234.5 | ₹1,234.5 | ₹1,234.5 |
  | 99999.99 | ₹99,999.99 | ₹99,999.99 |
  | 100000 | ₹1,00,000 | ₹1.00 L |
  | 1234567.891 | ₹12,34,567.89 | ₹12.35 L |
  | 12345678 | ₹1,23,45,678 | ₹1.23 Cr |
  | −1234.5 | **₹-1,234.5** | ₹-1,234.5 |
  | −250000 | ₹-2,50,000 | ₹-2.50 L |
  | null, NaN | — | — |

- **Defects.**
  - Negatives render `₹-…`, while the backend `rupees()` renders `-₹…`.
  - At the compact boundary, 9,999,999.999 renders `₹100.00 L` instead of `₹1.00 Cr`.
  - The number of decimals is inconsistent (`₹1,234.5`).

### FMT-02 Other formatters
- `fmtMoneyExact` always has 2 decimals: 1234.5 → `₹1,234.50`.
- `fmtNav` has 2–4 decimals: `₹25.3631`, `₹10.00`, 1234.56789 → `₹1,234.5679`.
- `fmtUnits` has at most 4 decimals: 238.11544 → `238.1154`, 1000 → `1,000`.
- `fmtPct`: `+` when > 0, 2 decimals: 12.345 → `+12.35%`, 0 → `0.00%`, −3.2 → `-3.20%`.
- `fmtXirr` takes a fraction, 1 decimal, no `+`: 0.12 → `12.0%`, −0.0345 → `-3.5%`.
- Dates use `en-IN` `dd MMM yyyy`, e.g. `25 Sept 2026`; ICU prints "Sept" for en-IN. `format.ts:21-42`, `formatDate.ts`.

### FMT-03 Null display
- **Rule.** Unavailable money shows `—`, never 0. `AnimatedMoney` / `AnimatedPct` show `—` when the value is not a number (`MoneyText.tsx`).

### FMT-04 Never show invested as current value
- **Rule** (`holdingMoney`, `format.ts:89-107`):
  - If currentValue is numeric → `{kind: 'value'}`.
  - Else if invested is numeric → `{kind: 'invested', caption: 'invested · awaiting allotment'}` when the reason is `UNITS_PENDING_ALLOTMENT`, else `'invested · value pending'`.
  - Else `{amount: null, kind: 'unknown', caption: 'value pending'}`.

### FMT-05 Coverage disclosure
- **Rule** (`coverageNote`, `:119-142`): only when quality is `PARTIAL` or `UNAVAILABLE`.
  - UNAVAILABLE: `"{₹X compact} is invested and confirmed but cannot be valued yet — usually a working day or two."`
  - PARTIAL: `"These figures cover {v} of {t} funds. {₹X} is confirmed but cannot be valued yet, so it is not included in the value or return."`

### FMT-06 Indian digit grouping (reference implementation)
- Port the backend `groupIndian` (`TransactionConsentTemplates.java:409-424`) as a pure TS function on decimal strings. Do not rely on `toLocaleString('en-IN')`: Hermes/Intl behaviour on low-end Android is not guaranteed, and floats lose precision.

### FMT-07 v2 formatting spec (proposed, for shared `packages/money`)
- Input is a decimal string or decimal object.
- Output `-₹1,23,456.70` with the minus before `₹`.
- Money: 2 decimals HALF_UP in UI, exact in evidence (per TXA-10).
- NAV: 4 decimals. Units: 3 or 4 decimals (SME-9).
- Compact form rounds first, then picks the unit, fixing the boundary.
- `null` → `—`.

**Confidence (all FMT).** High.

---

## 9. Defects and discrepancies to fix by design in v2

1. **Fingerprint bug and pre-2FA provider write** (TXA-BUG). `OrderService.java:578-608`, `BaseEntity.java:25-30`.
2. **Possible unique-index conflict on re-challenge.** Supersede uses `save` before the insert (`TransactionApprovalService.java:158-164`, `V61:47-50`). Medium confidence.
3. **Redemption consent never names the credit account.** `payoutBankLabel` is never snapshotted (`TransactionConsentTemplates.java:281`).
4. **Frontend maps switch/STP/SWP to purchase wording** (`approvalConsent.ts` `normalizeApprovalType`). The client also adds a 120 s expiry grace that the server does not honour.
5. **The dev master code is honoured for `NOMINATION_OPT_OUT`** and other non-transaction purposes (`OtpService.java:253-258`).
6. **The mobile OTP channel has no local expiry, attempt limit or cooldown** (`SmsOtpService`).
7. **The investor path allows email self-declaration** (`InvestorContactVerificationService.java:262-276`).
8. **Nominee cap hardcoded to 3** with an unverified regulatory basis (`NominationRules.java:25`, `nomination.ts:22`).
9. **`SUPERSEDED` writes before a throw are rolled back** in the opt-out service (`NominationOptOutChallengeService.java:150-155, 201-206`).
10. **Frontend ISIN regex requires 13 characters** (`orderableScheme.ts:40`). Real ISINs are 12.
11. **No server-side IFSC or account-number validation**; the frontend checks them, the backend does not.
12. **Mobile normalization differs** between backend and frontend (VAL-03).
13. **Minimum-age cutoff shown one day early in IST** (`kycActionLocks.ts:22-27`).
14. **KYC readiness mappings disagree** across three layers (KYC-01/02/03). The frontend lets `readiness=verified` mask field failures.
15. **`shouldForceNewKycCheck` always true** when the current identity has contacts (KYC-06).
16. **Unit rounding differs:** HALF_UP in `OrderService` vs DOWN in the backfill.
17. **Timezone inconsistency** in the NAV code (system default, UTC and IST in different places). Use `Asia/Kolkata` for all business dates.
18. **NAV health doc/code mismatch** (DEGRADED vs DOWN).
19. **Quarantined NAV falls back to the metadata mirror** and is labelled `SEEDED` (NAV-11).
20. **Two different email-masking algorithms** (TXA-01 vs NOM-08).
21. **Frontend `fmtMoney` negative-sign placement and compact boundary** (FMT-01).

---

## 10. Parameters that should become configuration

| Parameter | v1 value | Source |
|---|---|---|
| OTP length / expiry / max attempts / resend cooldown | 6 / 5 min / 5 / 30 s | `YML:226-229` |
| OTP hash key | SHA-256(email:code), unkeyed | `OtpService.java:382-390` |
| Approval OTP window | = OTP expiry (300 s) | `TransactionApprovalService.java:367` |
| Approval execution validity | 60 min | `TransactionApprovalService.java:87` |
| Approval sweep | every 5 min, initial 60 s | `TransactionApprovalExpirySweeper.java:38` |
| Consent template versions | v2.0 (purchase, SIP, redemption); T&C and FATCA v1.0; nomination declarations v2 | as cited |
| Nominee cap / majority age / guardian name min length | 3 / 18 / 2 | `NominationRules.java:25-31, 163` |
| Opt-out form upload | PDF/JPG/PNG, ≤ 5 MB | `nominationOptOutForm.ts:9-10` |
| Investor minimum age | 18 | `kycActionLocks.ts:1` |
| NAV latest / history URL | as NAV-01 | `YML:283-284` |
| NAV connect / read timeout, attempts, backoff | 10 s / 60 s / 3 / 2 s doubling | `YML:285-292` |
| NAV sync interval / initial delay | 6 h / 60–180 s random | `YML:278-279` |
| min rows / cold-start fraction / regression ratio / degradation warn | 1000 / 0.10 / 0.5 / 0.9 | `YML:312-314`; `SchemeNavSyncService.java:163` |
| baseline max age / low-match warn | 7 d / 0.30 | `YML:325, 332` |
| max future days / max daily jump | 2 / 0.25 per elapsed day | `YML:343-344` |
| NAV max age (AGED) / health stale | 7 d / 4 d | `YML:339, 347` |
| run retention | 90 d | `SchemeNavSyncService.java:121` |
| backfill lookback / units scale and rounding | 15 d / 4, DOWN | `NavBackfillService.java:156-175` |
| holdings-integrity interval | 1 h | `YML:361-363` |
| stamp duty | 0.005% | brief; `TransactionOrder.getNetInvested` |
| bypass codes | `<fixed dev code, preview "00…">`, local only | `BypassCodeStartupGuard.java`; `YML:231-243` |

---

## 11. Questions for the SME / compliance owner

1. **SME-1.** What is the current SEBI maximum number of nominees per folio (3 or 10)? Cite the circular and date. Is the v1 citation "SEBI/HO/OIAE/OIAE_IAD-3/P/CIR/2026/12676, live 2026-09-01" (comment only, `NomineeService.java:81-92`) a real circular, and does it require a signed physical opt-out form in addition to OTP?
2. **SME-2.** Is email OTP alone an acceptable second factor for execution-only online transactions under the Platizio ARN? Or must v2 also use mobile OTP, as exchange/RTA 2FA norms for MF transactions may require?
3. **SME-3.** Is a 60-minute approval-to-execution window acceptable? Should it be shorter for redemption and switch?
4. **SME-4.** What is the canonical mapping from Cybrilla readiness codes (`kyc_rejected`, `kyc_onhold`, `kyc_legacy`, `kyc_underprocess`, `kyc_deactivated`, `unknown`) to investor actions? v1 has three conflicting tables (KYC-01/02/03).
5. **SME-5.** Until an SMS provider is live, may an investor self-declare their mobile number? Or is mobile OTP a launch blocker?
6. **SME-6.** For v2 consent evidence, what exact wording is legally required for switch, STP, SWP, SIP pause/modify/cancel and UPI Autopay/eNACH mandate registration? Must the ARN/EUIN or "execution-only" declaration appear in the consent text?
7. **SME-7.** Must legal names allow non-ASCII or Indic characters, or digits (the v1 regex rejects them)?
8. **SME-8.** What is the exact current header of NAVAll.txt (6 or 8 columns)? Does the AMFI history endpoint limit the date range per request, and does it require `mf` or `tp` parameters?
9. **SME-9.** What unit precision should be displayed and computed (3 vs 4 decimals)? Should derived estimates be truncated or rounded?
10. **SME-10.** Is a 25%-per-day NAV plausibility threshold right for every category (e.g. sectoral or international FoFs)? What should Ops do with a quarantined NAV: a manual override with MANUAL source?
