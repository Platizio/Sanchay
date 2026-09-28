<!-- source: workflow wf_3190e72a-04a label spec:threat-model | exported 2026-09-28 -->

# Sanchay: STRIDE threat model and security backlog

**Scope:** Sanchay web (Next.js 16), native (Expo / Expo Router), API (NestJS 11 on Node 24, Drizzle, PostgreSQL 18), internal admin back-office, and the integrations (Cybrilla FintechPrimitives (FP), AMFI, SMS/email, CAS import). Hosting is AWS ap-south-1.
**Date:** 2026-09-25. **Mode:** read-only analysis. No secrets were read or reproduced.
**Standards:** OWASP ASVS 5.0 Level 2 and OWASP MASVS v2. The ASVS IDs below were checked against the ASVS 5.0 source files on GitHub on 2026-09-25.

---

## 0. Assumptions, method and definitions

| # | Assumption / decision | Why it matters |
|---|---|---|
| A1 | **Closed beta** means invite-only, at most 500 real investors, **real money through FP production**, and both web and native (Play internal testing / TestFlight). **P0 = must be done before closed beta. P1 = must be done before public launch. P2 = within 90 days after launch.** | Beta moves real money, so almost every control that protects money or PII is P0. |
| A2 | Investor login is **passwordless**: mobile plus SMS OTP is primary, email OTP is used for step-up. There are no investor passwords, so ASVS V6.2 (passwords) applies only to admins, and admins log in through the identity provider (IdP). | This shapes the whole of V6. |
| A3 | Admins log in through **Google Workspace (or Entra) SSO over OIDC, with phishing-resistant 2-step verification (passkey / security key) enforced at the IdP**. The admin app runs on its own hostname behind an AWS ALB `authenticate-oidc` rule plus a WAF IP allowlist. | Closes the v1 gap where ADMIN was just a distributor role (G9). |
| A4 | **Opaque, server-side session tokens are used for both web and native** (256-bit random values, stored hashed). No JWTs for investor sessions. | One mechanism, instant revocation, and no JWT algorithm or key-confusion risks. ASVS V9 then applies only to ALB/IdP tokens and FP OAuth. |
| A5 | Rate limits and the session cache use **ElastiCache (Valkey)**. Jobs and the outbox use **pg-boss** on Postgres. Infrastructure as code uses **AWS CDK in TypeScript**. | If the architecture plan picks different tools, keep the controls and swap the tool. |
| A6 | Monorepo layout this document refers to. Modules marked *(planned)* do not exist yet. | Used in every "Where" cell below. |

**Planned layout (A6)**

- `apps/web`: Next.js 16. Public catalogue plus the investor web app on `sanchay.in`. It proxies `/api/*` to the internal ALB so that cookies stay first-party.
- `apps/mobile`: Expo, app id `in.sanchay.app`.
- `apps/admin`: Next.js 16 on `ops.sanchay.in`.
- `apps/api`: NestJS. Modules:
  - Identity: `auth`, `otp`, `sessions`, `devices`, `investors`
  - Onboarding: `kyc`, `banks`, `nominees`
  - Transactions: `consents` (the 2FA engine), `orders`, `payments`, `mandates`, `sips`, `redemptions`, `systematic` (switch / STP / SWP)
  - Other: `catalogue`, `portfolio`, `statements`, `cas-import`, `webhooks`, `notifications`, `admin`, `audit`
- `apps/workers`: outbox, webhook processor, NAV sync, statements.
- `apps/cas-worker`: isolated sandbox for CAS PDF parsing.
- Shared packages:
  - `@sanchay/contracts`: strict zod schemas
  - `@sanchay/db`: Drizzle schema, RLS policies, scoped repository helpers
  - `@sanchay/authz`
  - `@sanchay/crypto`
  - `@sanchay/logger`: pino plus a shared redactor
  - `@sanchay/config`: env schemas and boot guards
  - `@sanchay/analytics`
  - `@sanchay/security-testing`: BOLA harness, log scanner
- `infra/`: CDK.

**Risk scoring:** Likelihood (L) and Impact (I) are each rated H, M or L. Risk = H if either is H and the other is at least M; risk = L if both are L; otherwise M.

---

## 1. System model

### 1.1 Trust boundaries

| TB | Boundary | Crossing data |
|---|---|---|
| TB1 | Internet → CloudFront/WAF → ALB | All client traffic |
| TB2 | Browser ↔ `apps/web` (Next.js server) | Session cookie, forms, Server Actions |
| TB3 | Native app ↔ `api.sanchay.in` | Bearer session and refresh tokens, attestation tokens |
| TB4 | ALB → `apps/api` (private subnets) | Client IP headers, authenticated requests |
| TB5 | `apps/api` / workers ↔ RDS PostgreSQL 18 | PII, orders, consents, audit |
| TB6 | `apps/api` ↔ FP / Cybrilla (egress) | Client-credential OAuth, KYC/order/payment/mandate calls |
| TB7 | FP → `/webhooks/fp` (ingress) | Signed events |
| TB8 | Payment gateway / DigiLocker / eSign browser redirects → Sanchay return URLs | Redirect parameters (untrusted) |
| TB9 | `apps/api` → `apps/cas-worker` (sandbox) | Untrusted PDF plus password |
| TB10 | Admin (`ops.sanchay.in`) → admin API | Privileged operations on PII |
| TB11 | CI/CD (GitHub Actions, EAS) → AWS / stores / OTA | Code, artifacts, signing keys |
| TB12 | App → third-party telemetry (Sentry, analytics), SMS (MSG91), email (SES) | Scrubbed telemetry, OTP messages |

### 1.2 Assets and data classification

| Class | Assets | Baseline protection |
|---|---|---|
| **C4 Restricted** | PAN, bank account number, DOB, nominee/guardian ID numbers, KYC artefacts (eSign/DigiLocker references, signed nomination opt-out form), CAS PDF and its password, OTP codes, session/refresh tokens, FP client secret, webhook secret, OTP pepper, KMS keys | App-level envelope encryption (AES-256-GCM, KMS data key) for the PII columns. Blind index (HMAC) for lookups. Never in logs, URLs, analytics or crash reports. |
| **C3 Confidential** | Name, mobile, email, address, FATCA/PEP declarations, holdings, orders, SIPs, mandates, capital gains, imported external holdings, consent evidence, device IDs | RDS encryption at rest. Authorization on every read. Masked in admin by default. |
| **C2 Internal** | Fund-facts curation drafts, ops metrics, audit metadata | RBAC |
| **C1 Public** | NAV, published fund facts, catalogue | Integrity only (maker-checker on curation) |
| **Money-movement authority** | Consent-to-order binding, FP credentials, registered bank accounts, mandates | Treated as the crown jewels: bank or contact change plus redemption is the account-takeover cash-out path. |

---

## 2. v1 security lessons and how Sanchay carries them forward

| v1 finding | Evidence (read-only) | What goes wrong | Sanchay control (threat ID) |
|---|---|---|---|
| SEC-1: plaintext OTP in logs | `QA-FULL-TEST-REPORT-2026-07-27.md:37,109`; fix at `.../service/OtpService.java:166-171` and `.../service/EmailService.java:120` (masks the email subject) | Anyone with log access can log in or approve transactions | No code path ever logs OTPs. A CI log scanner fails the build if any issued code appears (AUTH-04). |
| SEC-2/4/5: BOLA and lead theft | `QA-FULL-TEST-REPORT-2026-07-27.md:38-40,234,380,392` | Missing ownership checks, found one sibling endpoint at a time | Investor ID comes only from the session. Scoped repositories. An automated BOLA harness covers every route (AZ-01). |
| SEC-6: challenge authorization gap (second identifier) | `QA-FULL-TEST-REPORT-2026-07-27.md:41,297-333` | Endpoint authorized the order but not the challenge ID | Every referenced ID is checked, including body and nested IDs (AZ-02, AUTH-06). |
| C1: dev master OTP `000000` accepted on profile-change 2FA | `COMPLETE_TEST_SUITE_REPORT.md:14,41,75,112`; `OtpService.java:253-255` only excludes `TRANSACTION_APPROVAL` | A denylist of purposes fails open for new purposes | No bypass code exists in any build. A boot guard blocks the fake sender outside test/local (AUTH-05). |
| M2: PII in API snapshots; reopened via `investor_identifier` (1,062 of 1,062 rows held cleartext PAN) | `AUDIT-FINDINGS-2026-07-03.md` M2; `docs/superpowers/COMPLIANCE-REVIEW-2026-09-03.md:82`; key denylist at `common/PiiRedactor.java:35-42` | Key-name denylists miss new fields | Field allowlist plus value-pattern redaction in `@sanchay/logger` (PII-01, PII-11). |
| Unrestricted signup role | `AuthSignupRequest.java:23`, `AuthService.java:77` (synthesis §2, §11 G9) | Client-supplied `role` accepted | Strict schemas with no role field. Admins exist only through IdP mapping (AUTH-07). |
| Spoofable `X-Forwarded-For` rate-limit key | `config/LoginRateLimitFilter.java:117-122` | Attacker rotates XFF to get a fresh bucket | Trusted-proxy hop count only (DOS-07). |
| Webhook: shared secret header only, in-memory dedupe | `controller/CybrillaWebhookController.java:45-50,77-89,117-142,175-191` | No body integrity. Replay after restart or across instances. | FP-Signature HMAC over the raw body plus a persistent event store (WH-01, WH-02). |
| Unauthenticated payment postback trusted `status=success` | `service/InvestorActionService.java:207-237,626-630`; `permitAll` + open CORS at `config/SecurityConfig.java:79-80,162-163` | The client-controlled query parameter drives order state | Return URL is a UX signal only. Server re-fetches FP state (PAY-01). |
| Raw provider JSON in logs | `service/OrderService.java:253,709` (`purchase_json='{}'`) | PII in application logs | Ban raw payload logging (PII-01). |
| PII in browser storage | `investor-frontend/src/views/InvestorOnboarding.tsx:444` (draft investor object keyed by PAN in `sessionStorage`) | XSS or shared device leaks PII | No PII in web storage (PII-07). |
| FP write before any 2FA challenge existed; snapshot-hash timestamp mismatch | Synthesis §11 / L15; `OrderService.java:529,601-608`; `COMPLIANCE-REVIEW-2026-09-03.md:130-140` | Consent is not binding. Legitimate approvals fail. | Consent-first state machine and canonical DB-derived snapshot (TX-01, TX-03). |
| SIP amount edits without fresh 2FA | `COMPLIANCE-REVIEW-2026-09-03.md:170-184` | Consent bypass | SIP modify and top-up require consent (AZ-05). |
| Manual order-status override with an audited bypass reason | `OrderService.java:1085-1171` (be-transactions slice) | Insider can fabricate allotment | No manual transition into allotting states. Ops can only trigger a re-sync (INS-03). |
| Consent records only immutable by convention (full UPDATE/DELETE grants) | `COMPLIANCE-REVIEW-2026-09-03.md:324` | Evidence can be tampered with | DB grants, trigger, hash chain, S3 Object Lock (INS-05). |
| Plaintext PII at rest | db-schema slice §2.4 | DB or backup leak exposes PAN and bank details | Envelope encryption plus blind index (PII-08). |
| Non-placeholder-looking token in `.env.example` | be-platform-auth slice §2.2 (value not reproduced) | Secret sprawl | gitleaks, push protection, placeholder validator (SEC-01). |
| Token cache persisted to disk | be-integrations slice (`ExternalAuthTokenCacheStore`) | Bearer token at rest | FP tokens are cached in memory only (INT-01). |
| Environment confusion only produced a warning | `CybrillaEnvironmentStartupLogger` (be-integrations slice) | Sandbox/prod mix-up | Boot guard fails closed (INT-05). |

**Patterns worth keeping from v1** (reimplemented in TypeScript):

- OTP hashing, attempt lockout, resend cooldown, and generic anti-enumeration responses (`OtpService.java`).
- Failure bookkeeping recorded in its own transaction (`OtpService.java:41-55`).
- Constant-time comparisons.
- Fail-closed boot guard (`BypassCodeStartupGuard.java:111-172`).
- Partial unique indexes allowing only one live challenge (`V61`).
- Idempotency key per instruction (`RealCybrillaClient.java:1461-1467`).
- Re-fetching authoritative FP state on webhooks (`OrderService.java:288-312`).
- `RedemptionActorScope` strict-by-default ownership check.
- Playwright negative suites (`approval-bypass.spec.ts`, `api-authorization.spec.ts`).

---

## 3. Cross-cutting control baseline

### 3.1 OTP policy (`apps/api/src/modules/otp`, `@sanchay/crypto`)

| Parameter | Value |
|---|---|
| Code | 6 digits from `crypto.randomInt` (CSPRNG) |
| TTL | 5 min for every purpose (ASVS 6.5.5 allows at most 10) |
| Storage | `HMAC-SHA256(pepper, challengeId‖purpose‖normalizedTarget‖code)`. The pepper lives in Secrets Manager and has a `kid`. Plain SHA-256 of a 6-digit code (the v1 approach) can be brute-forced offline if the DB leaks. |
| Binding | The client gets an opaque 128-bit `challengeId`. Verify requires `challengeId` + code. The challenge row stores purpose, target, `investorId` (for authenticated purposes) and `intentId` (for consent). |
| Attempts | 5 per challenge, then the code is burned. After 3 burned challenges in 60 min, the identifier is locked for 30 min and an alert fires. |
| Send quotas | Per mobile/email: 3 per 15 min and 10 per 24 h. Cooldown 30 s → 60 s → 120 s. Per IP: 10/h. Per attested device: 5/h. |
| Purposes (enum, exhaustive) | `LOGIN`, `SIGNUP_MOBILE`, `VERIFY_EMAIL`, `NEW_DEVICE_STEPUP`, `TXN_CONSENT`, `SIP_CONSENT`, `MANDATE_CONSENT`, `CONTACT_CHANGE_OLD`, `CONTACT_CHANGE_NEW`, `BANK_ADD`, `NOMINEE_CHANGE`, `NOMINATION_OPTOUT`, `SESSION_REAUTH` |
| Bypass | **None, in any environment.** Tests use a `FakeOtpSender` that writes to a test inbox. `@sanchay/config` refuses to boot when `OTP_SENDER=fake` and `APP_ENV ∈ {staging, prod}`. |
| Channels | SMS via MSG91 with TRAI DLT-registered templates and sender ID. Email via Amazon SES (ap-south-1) with DKIM. Consent OTPs go to **both** registered mobile and email (one code), so a SIM-swapped attacker cannot silently consent: the real owner sees the email. |

### 3.2 Session policy (`apps/api/src/modules/sessions`, `devices`)

| | Web | Native |
|---|---|---|
| Token | Opaque 256-bit value in cookie `__Host-sid` (HttpOnly, Secure, SameSite=Lax, Path=/). Stored as SHA-256 in `auth_sessions`. | Access token (opaque, 15 min) plus refresh token (opaque 256-bit, rotated on every use, family reuse detection) |
| Storage | Cookie only. No tokens reachable from JS. | `expo-secure-store` with `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. Never AsyncStorage, MMKV or Redux-persist. |
| Idle / absolute timeout | 30 min / 12 h | Refresh idle 30 days / absolute 90 days. App lock (biometric or device passcode via `expo-local-authentication`) on cold start and after 5 min in background. |
| New-device login (KYC-complete account) | SMS OTP + email OTP (`NEW_DEVICE_STEPUP`) | Same, plus device registration. Attestation required (P1). |
| Rotation | New session ID on login, step-up and re-auth (ASVS 7.2.4) | Same |
| Limits | 5 concurrent sessions per investor. Listing and revoking sessions in the UI (ASVS 7.5.2). | Same |
| Re-auth (fresh OTP, within 5 min) | Contact change, bank add, nominee change or opt-out, mandate create, session revoke-all (ASVS 7.5.1) | Same |
| Revocation | Logout deletes the row. Block, delete or recovery revokes all sessions. Admin can revoke. (ASVS 7.4.1, 7.4.2, 7.4.5) | Same, plus Expo push token unbinding |
| CSRF | SameSite=Lax, plus server checks on `Origin` / `Sec-Fetch-Site`, plus a required `X-Sanchay-Client: web` header on unsafe methods (ASVS 3.5.1–3.5.3) | Not applicable (bearer token) |

### 3.3 Rate limits (keys come from the trusted proxy hop only; see DOS-07)

| Key | Scope | Limit | Layer |
|---|---|---|---|
| IP | `/api/auth/*` | 300 requests per 5 min, then block | AWS WAF rate-based rule |
| IP (unauthenticated) | All API | 600 per 5 min | WAF |
| Session | All API | 300/min; burst 60/10 s | `@nestjs/throttler` with Valkey storage |
| Mobile / email | OTP send | See §3.1 | `otp` module |
| Global | SMS sends | Alert at 2× trailing 7-day hourly p95. At 3×, require a challenge (Turnstile on web, attestation on native) for all OTP sends. Hard daily cap (beta 2,000/day, launch 50,000/day), after which only email OTP is offered. | `otp` + CloudWatch alarm |
| Investor | Consent OTP | 10/h | `consents` |
| Investor | Order intents (buy/SIP/redeem/switch/STP/SWP) | 30/day; more than 5 redemptions per day raises a fraud alert | `orders`, `redemptions` |
| Investor | CAS upload | 3/day | `cas-import` |
| Investor | Statement generation | 10/day | `statements` |
| Endpoint | `/webhooks/fp` | 50 req/s, 256 KB body | WAF + Nest |

### 3.4 Crypto inventory (`@sanchay/crypto`)

| Use | Algorithm | Key custody | Rotation |
|---|---|---|---|
| PII column encryption (PAN, bank account, DOB, nominee/guardian ID) | AES-256-GCM, 96-bit random IV, AAD = `table.column.rowId` | Data keys from AWS KMS CMK `alias/sanchay-pii` via GenerateDataKey, cached ≤ 5 min | CMK annual auto-rotation; re-wrap job |
| Blind index (PAN uniqueness/lookup, bank account dedupe) | HMAC-SHA256, truncated to 128 bits | Secrets Manager `pii-index-key` | Only with a full re-index |
| OTP hash | HMAC-SHA256 | `otp-pepper` with `kid` | Yearly, with a dual-verify window of 1 TTL |
| Session / refresh token storage | SHA-256 of a 256-bit random token | Not applicable | Not applicable |
| Consent snapshot hash | SHA-256 over RFC 8785 (JCS) canonical JSON; decimals as strings | Not applicable | Not applicable |
| Audit hash chain | SHA-256(prev_hash‖row_canonical) | Not applicable | Daily anchor to S3 Object Lock |
| Webhook verify | HMAC-SHA256 (FP-Signature) | Secrets Manager `fp-webhook-secret`, keyed by FP `id` | Coordinated with FP |
| TLS | ALB policy `ELBSecurityPolicy-TLS13-1-2-2021-06`; RDS `rds.force_ssl=1` | ACM | ACM auto-renew |

### 3.5 Web headers (`apps/web` proxy / `next.config`, `apps/admin`)

- CSP with a per-request nonce: `default-src 'self'; script-src 'self' 'nonce-{n}' 'strict-dynamic'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self' {FP/PG hosts allowlist}; connect-src 'self' {Sentry ingest}; upgrade-insecure-requests; report-to csp`.
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy: strict-origin-when-cross-origin` (`no-referrer` on `/auth/*`).
- `Cross-Origin-Opener-Policy: same-origin`.
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
- `Cache-Control: no-store` on every authenticated response.

---

## 4. Threat register (STRIDE)

Column key: **S/T/R/I/D/E** = STRIDE category. **L/I→R** = likelihood / impact → risk. **Pri** = backlog priority (§8).

### 4.1 Authentication and OTP abuse

| ID | STRIDE | Asset | Attack | L/I→R | Controls | Where | Test that proves it | ASVS 5.0 / MASVS | Pri |
|---|---|---|---|---|---|---|---|---|---|
| AUTH-01 | D (+ financial) | SMS budget, DLT sender reputation | **SMS pumping / toll fraud.** Bots call `POST /auth/otp` with rotating Indian numbers, possibly colluding with SMS aggregators. | H/M→H | Mobile must match `^[6-9]\d{9}$` with +91 only (v1 `validation/MobileFormat.java:14`). Quotas per number, IP and device (§3.3). WAF rate rule. Global spend circuit breaker with an email-only fallback. Alert when the send→verify conversion rate is below 30% over 15 min. Invisible Cloudflare Turnstile on web when risk is elevated. Native attestation token (`@expo/app-integrity`: Play Integrity / App Attest) required on OTP send (P1). | `otp/otp-throttle.service.ts`, `@sanchay/config` (limits), `infra/waf.ts`, `apps/mobile/src/security/attest.ts` | `otp.throttle.int-spec.ts`: the 4th send to the same number within 15 min returns 429 and the `FakeOtpSender` is not called; the 11th send from one IP within an hour returns 429. A k6 script against staging confirms the WAF blocks at the threshold. A synthetic CloudWatch metric triggers the alarm. | 2.4.1, 6.1.1, 6.3.1, 6.6.3 / MASVS-RESILIENCE-1 | P0 (attestation P1) |
| AUTH-02 | S | Investor account | **OTP brute force** on verify | M/H→H | Policy in §3.1: 5 attempts per challenge, 3 burned challenges then a 30-min lock, 5-min TTL. Worst case for an attacker is 15 guesses per 15 min, about 1.5×10⁻⁵ success probability. Constant-time compare. Failure bookkeeping in its own transaction (v1 pattern `OtpService.java:41-55`). | `otp/otp.service.ts` | `otp.bruteforce.spec.ts`: after 5 wrong attempts the 6th attempt with the **correct** code returns `LOCKED`; after 3 burned challenges a new send returns 429 for 30 min; attempt counters persist even when the outer transaction rolls back. | 6.3.1, 6.5.1, 6.5.2, 6.5.3, 6.5.5, 6.6.2, 6.6.3, 11.2.4 | P0 |
| AUTH-03 | I | Registration status (is this mobile a Sanchay customer?) | **Account enumeration** through response content, status or timing | H/L→M | A single "continue with mobile" flow always returns `202 {challengeId, resendAfter}`. The SMS is sent asynchronously through pg-boss so timing is uniform. Whether the account exists is revealed only after the OTP is verified. Email-change "already in use" is shown only after the new email's OTP is verified. | `auth/auth.controller.ts`, `otp` | `enumeration.int-spec.ts`: response bodies are byte-identical and statuses equal for existing and new numbers; p95 latency difference under 50 ms over 200 samples. | 6.3.8 (adopted at L2) | P0 |
| AUTH-04 | I | OTP codes | **OTP disclosure** via logs, API responses, email subjects or telemetry (SEC-1) | M/H→H | No OTP in any log line (pino redaction plus a lint rule banning `code` / `otp` identifiers in logger calls). No dev code in API responses. Masked subjects. Sentry `beforeSend` scrubbing. | `@sanchay/logger`, `otp`, `notifications` | `log-scanner.e2e.ts` (in `@sanchay/security-testing`): during the full Playwright/Jest e2e run, capture all logs and Sentry-mock payloads, then assert none of the harness-known issued codes appear. | 16.2.5, 14.2.3 | P0 |
| AUTH-05 | E | 2FA integrity | **Master or bypass OTP** left enabled (C1) | M/H→H | No bypass code path exists at all. `FakeOtpSender` is registered only when `APP_ENV ∈ {test, local}` and the boot guard enforces this. CI grep fails if `000000` or `master` appear in `apps/api/src/**`. | `@sanchay/config/boot-guards.ts`, `otp` | `boot-guard.spec.ts` (fake sender plus `APP_ENV=staging` must fail to boot). Parametrised e2e on staging: for **every** value of the `OtpPurpose` enum, verifying `000000` returns 401, so new purposes are covered automatically. | 6.3.2, 13.4.2, 15.2.3 | P0 |
| AUTH-06 | T/E | Challenges | **Cross-challenge or cross-purpose OTP reuse** (SEC-6) | M/H→H | The HMAC input includes challengeId, purpose and target. Verify loads the challenge by ID **and** checks that the challenge's investorId equals the session investor, that the purpose matches the route, and (for consent) that the intentId matches the path. | `otp`, `consents` | `otp.binding.spec.ts`: a LOGIN code on a `TXN_CONSENT` challenge is rejected; A's code submitted to A's second challenge is rejected; investor B posting A's challengeId gets 404. | 6.6.2, 8.2.2 | P0 |
| AUTH-07 | E | Admin privileges | **Role escalation at signup** (v1 `AuthSignupRequest.java:23`) | M/H→H | All request schemas use `z.object(...).strict()`. Investor schemas have no role field. Admin identities exist only via IdP group → role mapping in the `admin_users` table. There is no public admin signup. | `@sanchay/contracts`, `admin/auth` | `contracts.strict.spec.ts` generates, for every exported request schema, a payload with extra `role`, `investorId` and `status` fields and expects 400. `admin-provisioning.spec.ts`: an unknown IdP subject gets 403. | 15.3.3, 8.2.1, 6.3.2 | P0 |
| AUTH-08 | S | Account plus money | **SIM-swap account takeover**: attacker ports the victim's number and logs in with SMS OTP | M/H→H | New-device login on a KYC-complete account requires SMS **and** email OTP. Device binding. Push and email alerts to the old device and email on every new-device login. **24 h cool-off** after new-device login: no bank add, contact change, nominee change or mandate create. Redemption and SWP proceeds go only to already-verified bank accounts (an inherent MF property; see AUTH-10). | `auth`, `devices`, `sessions`, `notifications` | `new-device.e2e.ts`: SMS-only login from an unknown device yields a `STEP_UP_REQUIRED` session and portfolio calls return 403; `POST /banks` within 24 h returns `409 COOL_OFF`; an alert email is sent. | 6.3.3, 6.6.1, 6.3.5 (adopted), 7.5.1 | P0 |
| AUTH-09 | S | Account | **Email account compromise used for takeover** | L/M→M | Email alone never authenticates. Login always needs mobile OTP. Email is a step-up factor only. | `auth` | `email-only.spec.ts`: no route accepts an email OTP as the primary factor. | 6.3.4 | P0 |
| AUTH-10 | T/E | Bank / contacts (the cash-out path) | **Contact or bank change takeover** | M/H→H | Bank add: FP penny drop with holder name matched against the KYC name (≥ 0.8 normalised Jaro-Winkler, else manual review). Fresh OTP to the registered mobile and email. Notifications to both. A new bank becomes usable as a payout bank 24 h after verification. Contact change: OTP on the old **and** new channel, notice to the old channel, 72 h hold on bank changes afterwards. | `banks`, `investors/contacts`, `consents` | `bank-change.e2e.ts`: name mismatch leads to `MANUAL_REVIEW`; redemption to a bank added less than 24 h ago is refused; contact change without the old-channel OTP returns 403. | 2.3.1, 7.5.1, 6.3.7 (adopted) | P0 |
| AUTH-11 | S/E | Account | **Account-recovery abuse** (the "lost my mobile" path) | M/H→H | Support-assisted recovery: DigiLocker/Aadhaar re-verification via FP, email OTP, maker-checker approval by two ops users, 72 h hold, all sessions revoked, notices to every known channel. | `admin/recovery`, `kyc` | `recovery.e2e.ts`: one ops approver alone cannot complete; the hold is enforced; sessions are revoked. | 6.4.3, 6.4.4, 2.3.5 | P1 (beta: recovery handled manually by founders with a documented runbook) |

### 4.2 Sessions (web cookies, native tokens)

| ID | STRIDE | Asset | Attack | L/I→R | Controls | Where | Test | ASVS / MASVS | Pri |
|---|---|---|---|---|---|---|---|---|---|
| SESS-01 | S/I | Web session | **XSS steals or rides the session** | M/H→H | HttpOnly `__Host-` cookie. Nonce + strict-dynamic CSP (§3.5). ESLint bans `dangerouslySetInnerHTML` and `eval`. Trusted Types (P1). No tokens in JS. | `apps/web/proxy.ts` (Next 16 renamed middleware to proxy), `eslint-config` | `headers.pw.spec.ts`: `document.cookie` lacks `sid`; CSP header matches a snapshot; OWASP ZAP baseline in CI finds no High alerts. | 3.2.2, 3.3.1, 3.3.3, 3.3.4, 3.4.3, 1.3.2 | P0 |
| SESS-02 | T | State-changing API | **CSRF** | M/H→H | Controls in §3.2. Cookies are first-party via the `/api` proxy. | `apps/api/src/common/guards/csrf.guard.ts` | `csrf.int-spec.ts`: POST with `Origin: https://evil.tld` returns 403; missing `X-Sanchay-Client` returns 403; GET never mutates (route inventory test). | 3.3.2, 3.5.1, 3.5.2, 3.5.3 | P0 |
| SESS-03 | S | Session | **Session fixation / token not rotated** | L/H→M | New token on login, step-up and re-auth. Old token deleted. | `sessions` | `session-rotation.spec.ts` | 7.2.4 | P0 |
| SESS-04 | I | Native tokens | **Token extraction** from backups, rooted devices or logs | M/H→H | SecureStore `ThisDeviceOnly`. `android.allowBackup=false` in app config. `usesCleartextTraffic=false`. No tokens in URLs, logs or Redux. Play Integrity / App Attest verdict required for transactions: warn-only in beta, enforced at launch. | `apps/mobile/src/security/token-store.ts`, `app.config.ts` | MobSF static scan of the APK/IPA in CI (no High). `token-store.spec.ts` (only SecureStore is used). Pen-test with Frida/objection before launch. | 14.3.3 / MASVS-STORAGE-1, STORAGE-2, RESILIENCE-1 | P0 (enforcement P1) |
| SESS-05 | S | Refresh token | **Refresh token replay** | M/H→H | Rotation on every use. Reuse of an old token revokes the whole family and alerts. Refresh bound to device ID. Attestation assertion on refresh (P1). | `sessions` | `refresh-reuse.spec.ts`: replaying a used refresh token returns 401 and every session in the family becomes invalid. | 7.2.4, 7.4.1 / MASVS-AUTH-1 | P0 |
| SESS-06 | E | Session | **Revocation ineffective** after logout, block or delete | L/H→M | Opaque tokens are checked server-side on every request (Valkey cache TTL ≤ 30 s, invalidated on revoke). Push token unbound on logout. | `sessions` | `revocation.spec.ts`: after logout, block or admin revoke, the next request returns 401 within 1 s. | 7.4.1, 7.4.2, 7.4.5 | P0 |
| SESS-07 | S | Account | **Stolen unlocked phone / shoulder surfing** | M/M→M | App lock (biometric or device passcode) on cold start and after 5 min in background. Every transaction still needs an OTP (SEBI 2FA). Masked balances toggle. | `apps/mobile/src/security/app-lock.tsx` | Maestro flow: background the app for 6 min and the lock screen shows on return. | 6.5.7 / MASVS-AUTH-2, AUTH-3 | P1 |
| SESS-08 | I | Other users' data | **Authenticated responses cached** by CDN or Next.js cache (cross-user leak) | M/H→H | `Cache-Control: no-store` on authenticated routes. CloudFront behaviours never cache `/api/*` or `/(app)/*`. ESLint rule: no `cookies()`, `headers()` or session access inside `'use cache'` scopes. Authenticated segments are dynamic. | `apps/web`, `infra/cdn.ts` | `cache.e2e.ts` on staging CDN: users A and B fetch the same path and each gets their own data; header assertions. | 14.2.2, 14.2.5, 14.3.2 | P0 |

### 4.3 Authorization (BOLA / IDOR / BFLA / mass assignment)

| ID | STRIDE | Asset | Attack | L/I→R | Controls | Where | Test | ASVS / MASVS | Pri |
|---|---|---|---|---|---|---|---|---|---|
| AZ-01 | I/T | Every investor-owned resource (matrix in §5) | **BOLA**: change `:id` in a path to another investor's resource | H/H→H | `investorId` is taken **only** from the session via a `@CurrentInvestor()` decorator. Investor-owned tables are reachable only through `scoped(db, investorScope)` helpers in `@sanchay/db` (a lint rule bans direct `db.select().from(investorOwnedTable)` in `apps/api`). Foreign IDs return 404, not 403. UUIDv7 IDs (not a security control). Postgres RLS on investor-owned tables as defence in depth (P1). | `@sanchay/db/scoped.ts`, `@sanchay/authz`, every module | **BOLA harness** (`@sanchay/security-testing/bola.ts`): reads Nest route metadata, seeds investors A and B with one of every resource, calls every investor route with B's session against A's IDs, expects 404 and no DB diff. It fails if a new route lacks a fixture. | 8.1.1, 8.2.2, 8.3.1, 8.2.3 | P0 (RLS P1) |
| AZ-02 | E | Nested / related resources | **Second-identifier BOLA** (SEC-6 class): A's order request carries B's `bankAccountId`, `mandateId`, `folioId` or `challengeId` | H/H→H | Every ID in the body or query is resolved through the same scope. Relation checks (the mandate belongs to the same investor and bank; the folio belongs to the investor and scheme AMC). | `orders`, `sips`, `mandates`, `redemptions`, `systematic`, `consents` | The BOLA harness also mutates body IDs using each route's zod schema metadata (`x-owned-ref` annotation). | 8.2.2, 2.2.3 | P0 |
| AZ-03 | E | Admin functions | **BFLA**: an investor token reaches admin routes; public Next.js Server Actions skip authorization | M/H→H | Global default-deny guard. Every route must have exactly one of `@Public()`, `@Investor()` or `@Admin(role)`. The admin module listens on a separate port behind the admin ALB only. Next.js does **no** authorization in the proxy alone (lesson from CVE-2025-29927). Server Actions are thin and call the API, which enforces authorization. | `apps/api/src/common/guards`, `apps/web` | `route-inventory.spec.ts`: a route without a decorator fails the build; an investor token on admin paths gets 404. | 8.1.1, 8.2.1, 8.3.1, 3.5.4 | P0 |
| AZ-04 | T/E | Server-controlled fields | **Mass assignment**: client sets `arn`, `euin`, `planType`, `investorId`, `status`, `units`, `nav`, `kycStatus`, `mandateLimit` | M/H→H | Strict zod schemas. ARN and execution-only EUIN handling come from config (`@sanchay/config` `PLATFORM_ARN`). Plan type is always REGULAR, resolved server-side from the scheme ISIN. Separate output DTOs. | `@sanchay/contracts`, `orders`, `sips` | `contracts.strict.spec.ts`; `order-server-fields.spec.ts`: the FP payload snapshot always carries config ARN/EUIN regardless of input. | 15.3.3, 2.2.2, 15.3.1 | P0 |
| AZ-05 | T | Holdings / money | **Business-logic abuse**: double redemption race, redeeming beyond available units, ELSS inside lock-in, client-supplied time used for NAV cutoff, SIP modify without consent | M/H→H | Redemption ceiling (port `RedemptionAvailability`) computed under `SELECT … FOR UPDATE` on a `(investor, folio, scheme)` holding row or advisory lock. ELSS lock-in check per lot. Server clock (Amazon Time Sync) only. SIP modify, top-up and cancel require consent. Idempotency keys. | `redemptions`, `sips`, `portfolio` | `redeem-race.int-spec.ts` (Testcontainers PG18): two parallel full redemptions, exactly one succeeds. `elss-lockin.spec.ts`. `sip-modify-consent.spec.ts`. | 2.3.1, 2.3.2, 2.3.3, 2.3.4, 15.4.2 | P0 |

### 4.4 2FA / consent replay and bypass (SEBI transaction 2FA)

| ID | STRIDE | Asset | Attack | L/I→R | Controls | Where | Test | ASVS | Pri |
|---|---|---|---|---|---|---|---|---|---|
| TX-01 | E | Consent-to-execution binding | **Provider write before consent** (v1 L15) | M/H→H | Intent state machine: `DRAFT → CONSENT_PENDING → CONSENTED → SUBMITTING → SUBMITTED → …`. **No FP write of any kind before `CONSENTED`.** The FP call runs from the outbox after the consent is consumed, with the FP idempotency key set to the intent ID. | `consents`, `orders`, `apps/workers/outbox` | `consent-first.spec.ts`: with an FP client spy, zero calls before consent across lumpsum, SIP, mandate, redemption, switch, STP and SWP. | 2.3.1, 16.5.3 | P0 |
| TX-02 | S/T | Consent | **Consent replay or double-consume** | M/H→H | Atomic `UPDATE consent SET status='CONSUMED' WHERE id=$1 AND status='APPROVED' AND expires_at>now() RETURNING`. Partial unique index: one live challenge per intent. | `consents` | `consent-replay.int-spec.ts`: parallel verify, exactly one 200 and the other 409; reuse of a consumed consent returns 409. | 6.5.1, 2.3.3, 15.4.2 | P0 |
| TX-03 | T | Intent contents | **TOCTOU tamper after consent** (amount, scheme, bank changed); v1 snapshot-precision bug | M/H→H | Snapshot = RFC 8785 canonical JSON built **from the DB-persisted intent** (decimals as strings, timestamps DB-generated at microsecond precision). The intent row is immutable after `CONSENT_PENDING` (DB trigger). The FP payload is built from the snapshot. The hash is re-checked before the FP call. | `@sanchay/crypto/canonical.ts`, `consents`, `@sanchay/db` trigger | `snapshot-roundtrip.property.spec.ts` (fast-check: write to PG18, read back, hash equal). `intent-immutable.int-spec.ts`: an UPDATE after consent raises. | 11.3.3, 2.3.3 | P0 |
| TX-04 | S/R | Informed consent | **Consent to the wrong transaction**: UI or SMS mismatch, clickjacking | L/H→M | Consent text is rendered server-side from the snapshot. The same text appears in-app, in the SMS ("OTP to BUY ₹5,000 in <scheme>…") and in the email. The hash of the rendered text is stored. `frame-ancestors 'none'`. | `consents/templates`, `notifications` | `consent-text.snapshot.spec.ts` covers each transaction type. | 3.4.6, 16.3.3 | P0 |
| TX-05 | E | Stale approvals | **Late execution of an old consent** | L/M→L | Consent must be executed within 10 min (tighter than v1's 60 min at `TransactionApprovalService.java:87`). A sweeper expires stale consents. | `consents`, `workers` | `consent-expiry.spec.ts` | 6.5.5 | P0 |
| TX-06 | R | Evidence | **Investor repudiates an order** | M/M→M | Evidence row: rendered text, hash, channels, masked destinations, IP, device ID, app version, UA, all timestamps. Append-only and hash-chained. Retained 8 years (assumption; confirm with compliance). | `audit`, `consents` | `evidence.spec.ts`: all fields present; UPDATE is denied. | 16.2.1, 16.3.3, 16.4.2 | P0 |
| TX-07 | T/D | Orders | **Double submit / retry storms** | M/M→M | `Idempotency-Key` header required on unsafe order, payment and redemption routes (stored 24 h). FP key per instruction, following v1 `RealCybrillaClient.java:1461-1467`. | `common/idempotency.interceptor.ts` | `idempotency.spec.ts`: same key gives the same response and no second FP call. | 2.3.3 | P0 |

### 4.5 Webhooks and callbacks (FP)

| ID | STRIDE | Asset | Attack | L/I→R | Controls | Where | Test | ASVS | Pri |
|---|---|---|---|---|---|---|---|---|---|
| WH-01 | S/T | Order, mandate and KYC state | **Webhook spoofing**: forged `mf_purchase.successful` | M/H→H | Verify the `FP-Signature: id:signature` header as HMAC-SHA256 over the **raw body** with the tenant secret selected by `id` (FP docs, accessed 2026-09-25). v1 used only a shared header (`CybrillaWebhookController.java:84-89`). NestJS `rawBody: true`. Constant-time compare. Fail closed if the secret is missing. | `webhooks/fp-signature.guard.ts` | `webhook-sig.spec.ts`: unsigned, wrong key, body altered after signing, or unknown `id` all return 401 with zero side effects (DB diff empty). | 4.1.5 (adopted), 11.2.4, 16.3.3 | P0 |
| WH-02 | T | Idempotency | **Replay or duplicates**. FP's signature has no timestamp, and v1's dedupe was in memory only. | M/M→M | `webhook_events(event_id PK)` is inserted first, then processing is enqueued. Handlers are idempotent and re-fetch state, so a replay is harmless. Events whose `time` is more than 7 days old are logged and alerted. | `webhooks`, `workers` | `webhook-replay.int-spec.ts`: same event twice, including across an app restart, is processed once. | 2.3.3 | P0 |
| WH-03 | T | State | **Payload trust / out-of-order** events (FP does not guarantee ordering) | M/H→H | Treat the payload as a notification only. Re-fetch the FP object (v1 `OrderService.java:288-312`). A monotonic state machine refuses regressions. | `orders`, `mandates`, `kyc` | `webhook-order.spec.ts`: `successful` then `submitted` stays successful. | 2.3.1 | P0 |
| WH-04 | D | Webhook endpoint | **Flood** | L/M→L | WAF rule; 256 KB body cap; 2xx after enqueue; queue backpressure. | `infra/waf.ts`, `webhooks` | Load test with 1 k/s invalid signatures: rejected cheaply, p95 under 20 ms. | 2.4.1, 15.2.2 | P1 |
| WH-05 | T | KYC / eSign / DigiLocker / payment redirect callbacks | **Forged redirect callbacks** | M/H→H | Same pattern as PAY-01. A `state` nonce is bound to the session for every outbound redirect (OAuth-style). Re-fetch from FP. | `kyc`, `payments` | `callback-state.spec.ts`: missing or other-session `state` returns 400; status is taken only from FP. | 3.5.1, 2.3.1 | P0 |

### 4.6 Payments, mandates and native deep links

| ID | STRIDE | Asset | Attack | L/I→R | Controls | Where | Test | ASVS / MASVS | Pri |
|---|---|---|---|---|---|---|---|---|---|
| PAY-01 | T/E | Order state | **Payment return tampering**: `?status=success` (v1 `InvestorActionService.java:626-630`) | H/H→H | The return URL `https://sanchay.in/r/pay/{intentId}` is UX only and needs a session. The server polls FP payment and purchase state. No state change from query parameters. No `permitAll` mutation endpoints. | `payments`, `apps/web/app/r/pay`, `apps/mobile/app/r/pay` | `payment-return.e2e.ts`: GET the return URL with `status=success` for an unpaid intent and the intent is unchanged; only an FP mock returning `successful` advances it. | 2.3.1, 8.3.1 | P0 |
| PAY-02 | S | Users | **Open redirect / return-URL injection** (`?next=`, PG return) | M/M→M | Return URLs are built server-side from an allowlist. `next` accepts only relative paths matching `^/[a-z0-9/_-]*$`. | `auth`, `payments`, `apps/web` | `open-redirect.spec.ts`: `next=//evil.tld` and `next=https://evil.tld` fall back to `/`. | 3.7.2, 1.2.2 | P0 |
| PAY-03 | T | Regulatory (third-party payments are prohibited) | **Paying from someone else's bank** | L/H→M | FP payment created with the investor's verified bank (third-party validation, TPV, at the gateway). The bank ID must be in the investor's scope. | `payments` | `tpv.spec.ts`: B's bank ID returns 404; the FP payload contains A's bank reference. | 8.2.2 | P0 |
| PAY-04 | T | Mandate | **Mandate amount or bank tampering** | M/H→H | Limit computed server-side (port the v1 rule max(₹1 L, 2× instalment), `InvestorActionService.java:1014-1019`), capped by rail (UPI Autopay per-debit ceiling ₹1 L vs eNACH). Bank taken from the verified list. `MANDATE_CONSENT` OTP. | `mandates` | `mandate-limit.spec.ts` | 2.2.1, 2.3.2 | P0 |
| PAY-05 | S/I | Deep links | **Deep-link hijacking**: a malicious app claims `sanchay://`; a crafted link triggers an action | M/H→H | Verified Android App Links (`autoVerify`, `assetlinks.json` with Play signing SHA-256) and iOS Universal Links (AASA) on `sanchay.in/app/*` and `/r/*`. The custom scheme is used only in dev builds. **No tokens, OTPs or PII in links.** Links only navigate and never auto-execute. `+native-intent.tsx` sanitises incoming URLs against a zod route allowlist. | `apps/mobile/app/+native-intent.tsx`, `apps/web/public/.well-known/*`, `app.config.ts` | `adb shell pm get-app-links in.sanchay.app` shows `verified` (release-gate script). Unit tests for the sanitiser with hostile URLs. Maestro: a crafted `/app/redeem?amount=…` opens a pre-filled screen and requires confirmation plus OTP. | 3.7.2 / MASVS-PLATFORM-1, CODE-4 | P0 |
| PAY-06 | S/I | UPI intent | **UPI intent interception**: a malicious Android app registered for `upi://pay` | L/H→M | Beta uses the FP-hosted PG flow in Custom Tabs / ASWebAuthenticationSession (`expo-web-browser`) plus UPI collect/QR. If UPI intent is added, restrict it with a PSP package allowlist (`Intent.setPackage`). | `apps/mobile/src/payments` | Manual test with a rogue test app; unit test of the allowlist. | MASVS-PLATFORM-1 | P1 |
| PAY-07 | S/I | PG, DigiLocker, eSign sessions | **WebView phishing / injection** | M/H→H | Use the system browser (`expo-web-browser`), never an in-app WebView, for PG, DigiLocker and eSign. If a WebView is ever needed: `originWhitelist`, no JS bridge carrying tokens. | `apps/mobile` | ESLint rule banning `react-native-webview` imports outside an allowlisted file; MobSF. | MASVS-PLATFORM-2 | P0 |

### 4.7 PII leakage

| ID | STRIDE | Asset | Attack / leak path | L/I→R | Controls | Where | Test | ASVS / MASVS | Pri |
|---|---|---|---|---|---|---|---|---|---|
| PII-01 | I | C3/C4 data | **Logs**: raw provider JSON (v1 `OrderService.java:253,709`), request bodies, errors | H/H→H | pino JSON with `redact` paths plus a **value-pattern redactor** (PAN `[A-Z]{5}\d{4}[A-Z]`, mobile, email, 9–18 digit account numbers, IFSC). No request/response body logging except through allowlisted serializers. Provider payloads logged only as `{fpObjectId, state}`. | `@sanchay/logger` | `redactor.spec.ts` with fixtures that include **unknown keys holding PAN-shaped values**. The CI log scanner runs over e2e logs and finds 0 PII regex hits. | 16.2.5, 16.4.1, 14.2.4 | P0 |
| PII-02 | I | Behaviour plus identity | **Analytics** | M/M→M | `@sanchay/analytics` exposes typed, allowlisted events only. Numeric and enum props only. `distinct_id` is a random analytics ID, not investorId, mobile or PAN. Autocapture, session replay and IP capture are off. No analytics on auth, KYC, bank or consent screens in beta. | `@sanchay/analytics` | `analytics.schema.spec.ts`: rejects string props that match PII regexes. | 14.2.3 / MASVS-PRIVACY-1, PRIVACY-3 | P0 |
| PII-03 | I | PII in stack traces, breadcrumbs, request data | **Crash reports** (Sentry on web, native and API) | M/M→M | `sendDefaultPii=false`. `beforeSend` / `beforeBreadcrumb` use the shared redactor. No request bodies, no console or network breadcrumbs with bodies. Replay off. Source maps uploaded privately. | `apps/*/sentry.*.ts` | `sentry-scrub.spec.ts`: a synthetic error carrying PAN and mobile in context arrives at the mock transport scrubbed. | 16.2.5, 14.2.3 / MASVS-STORAGE-2 | P0 |
| PII-04 | I | On-screen PII | **Screenshots, screen recording, app-switcher snapshots** | M/M→M | `expo-screen-capture` (`usePreventScreenCapture`, which sets FLAG_SECURE on Android) on OTP entry, KYC, bank, nominee, consent and statement screens. iOS privacy overlay when AppState is inactive. | `apps/mobile/src/security/secure-screen.tsx` | Maestro plus `adb exec-out screencap` produces a black frame on secure screens; manual iOS app-switcher check. | MASVS-PLATFORM-3, STORAGE-2 | P0 |
| PII-05 | I | Backups and non-prod data | **Backups, snapshots, staging copies** | L/H→M | RDS with a KMS CMK, PITR 35 days, snapshot sharing blocked by SCP, S3 Block Public Access plus SSE-KMS. **No production data in staging or dev**: synthetic seeders only. Mobile: `allowBackup=false`, SecureStore `ThisDeviceOnly`. | `infra/*` | AWS Config rules (`rds-snapshots-public-prohibited`, `s3-bucket-public-read-prohibited`, `rds-storage-encrypted`) green; CDK assertions tests. | 14.2.4, 13.3.2 / MASVS-STORAGE-2 | P0 |
| PII-06 | I | PII in transit metadata | **PII in URLs / query strings** | M/M→M | Opaque IDs only. Searches that involve PII use POST. | `@sanchay/contracts` route lint | `route-lint.spec.ts`: no path or query param named pan, mobile, email or dob; ZAP. | 14.2.1 | P0 |
| PII-07 | I | Client storage | **Web storage / query cache** (v1 `InvestorOnboarding.tsx:444`) | M/M→M | No PII in local/session storage. TanStack Query cache held in memory and cleared on logout. Native: no persisted query cache for C3/C4 data. | `apps/web`, `apps/mobile` | `storage.pw.spec.ts`: after onboarding and after logout, `localStorage` and `sessionStorage` contain no PAN, mobile or email regex matches and are empty after logout. | 14.3.1, 14.3.3 / MASVS-STORAGE-1 | P0 |
| PII-08 | I | DB at rest | **Plaintext PII in DB** (v1) | M/H→H | Envelope encryption for C4 columns (§3.4). Blind index for PAN. The `app_rw` role has no access to the raw key alias; decrypt happens in `@sanchay/crypto` only. | `@sanchay/crypto`, `@sanchay/db` | `pii-at-rest.int-spec.ts`: the raw `SELECT pan_ct` bytes do not contain the plaintext; the PAN uniqueness constraint still works through the blind index. | 11.3.2, 11.3.3, 14.1.1, 14.1.2 | P0 |
| PII-09 | I | Lock screen, inbox | **Notification content** (SMS, email, push) | M/L→M | Push text is generic. SMS and email show masked details (`A/c XX1234`), never PAN or DOB. | `notifications/templates` | `templates.snapshot.spec.ts` | 14.2.6 | P0 |
| PII-10 | I | API responses | **Over-exposure** (full PAN or account number returned when not needed) | M/M→M | Explicit output schemas. Masking by default. Full values only on the rare screens that need them, behind re-auth. | `@sanchay/contracts` | `response-shape.spec.ts`: no response field matches a full PAN unless the route is allowlisted. | 15.3.1, 14.2.6 | P0 |
| PII-11 | I | Provider snapshots | **Stored FP request/response snapshots** (v1 M2 regression) | M/H→H | Key allowlist per FP operation plus value-pattern redaction. Retention 180 days. | `integrations/fp/snapshot.ts` | Fixtures replaying real sandbox payloads (including `investor_identifier`) produce 0 PII hits. | 14.2.7, 16.2.5 | P0 |
| PII-12 | I | Statements, capital-gains PDFs/CSVs | **Download leakage** | M/M→M | Authorization before issuing a pre-signed URL (5-min TTL, `Content-Disposition: attachment`, `Cache-Control: no-store`). Objects deleted after 24 h. CSV escaping. | `statements` | `statement-url.spec.ts`: B cannot mint A's URL; URL expires after 5 min. | 5.4.1, 1.2.10, 14.2.7 | P0 |

### 4.8 Insider and admin abuse

| ID | STRIDE | Asset | Attack | L/I→R | Controls | Where | Test | ASVS | Pri |
|---|---|---|---|---|---|---|---|---|---|
| INS-01 | I | Bulk PII | **Ops user exfiltrates PII** | M/H→H | Roles: `support_l1` (masked, read-only), `ops`, `compliance`, `catalogue_curator`, `superadmin`. Masked by default. "Reveal" needs a reason, is audited, and alerts above 20 per user per day. No bulk export except `compliance`, with maker-checker. Admin host is separate behind SSO and an IP allowlist. | `apps/admin`, `admin` module | `admin-rbac.matrix.spec.ts` (role × route); `reveal-audit.spec.ts` | 8.2.1, 8.2.3, 8.4.2 (adopted), 16.3.2 | P0 |
| INS-02 | T/E | Contacts, bank | **Admin changes an investor's contact or bank to enable fraud** | L/H→M | No admin endpoint writes contact or bank data. Only the recovery flow can (AUTH-11: two-person approval, 72 h hold). | `admin` | Route inventory: no admin PATCH on contacts or banks. | 2.3.5 | P0 |
| INS-03 | T | Orders / allotment | **Manual status override / fake allotment** (v1 `OrderService.java:1085-1171`) | L/H→M | No manual transition into allotting states. Ops can only trigger "re-sync from FP". | `admin/orders` | Route inventory plus `admin-order.spec.ts`. | 2.3.1 | P0 |
| INS-04 | T | Fund facts (riskometer, TER, exit load) | **Curation manipulation** that misleads investors | L/M→M | Draft → review by a second curator → publish. Versioned. Source URL required. Diff audit. | `catalogue/curation` | `curation-maker-checker.spec.ts` | 2.3.5 (adopted) | P1 |
| INS-05 | R/T | Audit and consent evidence | **Audit tampering** | L/H→M | `audit_events` and `consent_evidence`: `app_rw` has INSERT and SELECT only. A trigger blocks UPDATE and DELETE. Rows are hash-chained. A daily chain head is written to S3 Object Lock (compliance mode, 8 years). | `audit`, `@sanchay/db` | `audit-immutability.int-spec.ts`: UPDATE as the app role fails; the chain verifier job detects a manual edit made through the migrator role. | 16.4.2, 16.4.3 | P0 |
| INS-06 | E/I | Production DB and infra | **Engineer or AI agent with standing prod access** | M/H→H | No standing prod DB access. Break-glass via SSM Session Manager plus RDS IAM authentication, time-boxed and recorded in CloudTrail. AI agents never receive prod or staging credentials. A read replica exposes masked views for debugging. | `infra/iam.ts`, runbook | Quarterly access review; IAM Access Analyzer shows no external or unused access. | 13.2.2, 13.3.2 | P0 |
| INS-07 | S | Accounts | **Social engineering of support** | M/M→M | Support cannot trigger OTPs to new channels and cannot see OTPs (they are never stored in plaintext). Identity-verification script. "Sanchay never asks for your OTP" shown in the app and in SMS. | Runbook, templates | Tabletop exercise before beta. | 6.4.3 | P1 |

### 4.9 Supply chain (npm, CI, OTA)

| ID | STRIDE | Asset | Attack | L/I→R | Controls | Where | Test | ASVS / MASVS | Pri |
|---|---|---|---|---|---|---|---|---|---|
| SC-01 | T/E | All code | **Compromised npm package / maintainer**. Examples: the chalk/debug phish (Sept 2025) and the Shai-Hulud worm waves (Sept and Nov 2025). | H/H→H | In `pnpm-workspace.yaml`: `minimumReleaseAge: 10080` (7 days; `minimumReleaseAgeExclude` for urgent security patches), `strictDepBuilds: true` with an explicit `allowBuilds` / `onlyBuiltDependencies` allowlist, `blockExoticSubdeps: true`, `trustPolicy: no-downgrade`. Lockfile committed; `--frozen-lockfile` in CI. Renovate with human review. OSV-Scanner / `pnpm audit --prod` fails on High or Critical. | Root config, `.github/workflows/ci.yml` | `supply-chain-config.spec.ts` asserts these keys exist; CI audit gate. | 15.1.1, 15.1.2, 15.2.1, 15.2.4 / MASVS-CODE-3 | P0 |
| SC-02 | T | Dependencies | **Slopsquatting / hallucinated packages added by AI agents** | M/H→H | CODEOWNERS makes `package.json` and `pnpm-lock.yaml` human-review only. A CI "new dependency" report shows age, weekly downloads, repository and provenance. Packages under 30 days old or under 1 k weekly downloads are blocked unless explicitly approved. | `.github/CODEOWNERS`, `scripts/new-deps-check.ts` | CI job fails on an unapproved new dependency. | 15.2.4 | P0 |
| SC-03 | E | Deploy pipeline | **CI compromise** | M/H→H | Actions pinned to commit SHAs. `permissions: {}` by default. AWS access via OIDC only (no static keys). `pull_request_target` banned. The prod environment requires a reviewer. Branch protection plus CODEOWNERS. zizmor/actionlint in CI. | `.github/workflows/*` | zizmor gate (no High findings). | 13.3.1, 15.2.4 | P0 |
| SC-04 | T | Native JS bundle | **Malicious OTA update** (EAS Update / Expo account takeover) | L/H→M | expo-updates **code signing**: the certificate is embedded in the binary; the private key is held in CI secrets or KMS, not on laptops. Expo org 2FA enforced. Least-privilege EAS roles. `runtimeVersion` policy. | `apps/mobile/app.config.ts`, `eas.json` | Release gate: publishing an unsigned or wrongly signed update to a test channel is rejected by the installed build. | MASVS-CODE-2, RESILIENCE-2 | P0 |
| SC-05 | T | App signing | **Signing key compromise** | L/H→M | Play App Signing. iOS credentials managed in EAS with restricted access. Encrypted offline backup of the upload key. | Runbook | Access review | MASVS-RESILIENCE-2 | P0 |
| SC-06 | T | Runtime | **Vulnerable base images / framework CVEs**. Examples: Next.js / React Server Components RCE CVE-2025-55182 / CVE-2025-66478 (Dec 2025); middleware bypass CVE-2025-29927. | M/H→H | `node:24-slim` pinned by digest, non-root, read-only root filesystem. Trivy/ECR scan gate. Patch SLA: Critical 48 h, High 7 days. Authorization never lives in the Next proxy alone. | `Dockerfile`s, `infra/ecr.ts` | Trivy gate; SLA dashboard. | 15.1.1, 15.2.1, 15.2.3 | P0 |
| SC-07 | I | Inventory | **No SBOM** | M/L→M | CycloneDX SBOM per build artifact (syft), attached to releases. | CI | Artifact present check. | 15.1.2 | P1 |

### 4.10 Secrets

| ID | STRIDE | Asset | Attack | L/I→R | Controls | Where | Test | ASVS / MASVS | Pri |
|---|---|---|---|---|---|---|---|---|---|
| SEC-01 | I | FP, MSG91 and AWS secrets | **Committed secrets** (v1 `.env.example` lesson) | M/H→H | gitleaks as a pre-commit hook and in CI. GitHub secret scanning with push protection. `.env*` gitignored except `.env.example`; a validator requires placeholder values only. | Repo root | `env-example.spec.ts`; gitleaks gate. | 13.3.1 | P0 |
| SEC-02 | I | Secrets in client bundles | **`EXPO_PUBLIC_*` / `NEXT_PUBLIC_*` leak**; server code imported into client code | M/H→H | `@sanchay/config` splits zod schemas into `serverEnv` and `publicEnv`. `import 'server-only'` in server modules. CI scans the built `.next/static` output and the APK/IPA strings for secret patterns. | `@sanchay/config`, CI | `bundle-secret-scan` job | 13.3.1, 13.4.5 / MASVS-STORAGE-1 | P0 |
| SEC-03 | I/E | Secret store | **Over-broad access / no rotation** | M/H→H | AWS Secrets Manager with KMS. ECS task roles scoped per service (workers vs api vs cas-worker). Rotation schedule: FP credentials on staff exit and yearly; OTP pepper yearly (dual `kid`); webhook secret per FP guidance. | `infra/secrets.ts` | CDK assertion: `cas-worker` has no Secrets Manager access. | 13.1.4, 13.2.2, 13.3.2, 13.3.4 | P0 (rotation schedule P1) |
| SEC-04 | I | Tokens | **Secrets or tokens in logs, errors or disk caches** | M/H→H | Generic error handler (no stack traces or provider messages). FP OAuth token cached in memory only (v1 persisted it to disk). | `common/filters/http-exception.filter.ts`, `integrations/fp/token.ts` | `error-shape.spec.ts`; log scanner covers bearer-token patterns. | 16.5.1, 13.3.1 | P0 |

### 4.11 DoS and rate limits

| ID | STRIDE | Asset | Attack | L/I→R | Controls | Where | Test | ASVS | Pri |
|---|---|---|---|---|---|---|---|---|---|
| DOS-01 | D | Availability | **L7 flood** | M/M→M | CloudFront, Shield Standard, WAF managed rule groups (Core, KnownBadInputs, AmazonIpReputation), rate rules; Bot Control (P1). | `infra/waf.ts` | k6 staging test | 2.4.1 | P0 (Bot Control P1) |
| DOS-02 | D | CPU / DB | **Expensive endpoints** (XIRR, statements, catalogue search) | M/M→M | Holdings snapshot cache per investor. Statements are async jobs with quotas. Catalogue served via ISR/CDN. `statement_timeout=5s` for the API DB role. | `portfolio`, `statements`, `@sanchay/db` | Perf test: p95 under budget at 10× beta load. | 15.1.3, 15.2.2 | P1 |
| DOS-03 | D | FP quota | **Exhausting FP rate limits** | L/H→M | Per-investor order velocity limits. Circuit breaker (opossum) around the FP client. Queue with concurrency caps. | `integrations/fp` | `fp-breaker.spec.ts` | 16.5.2 | P1 |
| DOS-04 | D | DB connections | **Pool exhaustion** | L/M→L | RDS Proxy; pool caps; timeouts. | `infra/rds.ts` | Soak test | 13.2.6 | P1 |
| DOS-05 | D | Parsers | **ReDoS / oversized payloads** | L/M→L | JSON body limit 100 KB. zod `.max()` on every string. No user-supplied regex. `safe-regex` lint. | `@sanchay/contracts`, `main.ts` | `payload-limits.spec.ts` | 1.3.12, 4.2.5 | P0 |
| DOS-06 | D/S | Rate-limit keys | **XFF spoofing** (v1 `LoginRateLimitFilter.java:117-122`) | H/M→H | Express `trust proxy` set to the exact hop count (CloudFront → ALB = 2). IP derived from the ALB-appended value only. The ALB strips client-supplied `X-Forwarded-*` headers (`routing.http.xff_header_processing.mode=remove` on the internal hop). | `apps/api/src/main.ts`, `infra/alb.ts` | `xff-spoof.int-spec.ts`: rotating `X-Forwarded-For` still hits the same bucket and returns 429. | 15.3.4, 4.1.3 | P0 |

### 4.12 CAS PDF import (external holdings)

| ID | STRIDE | Asset | Attack | L/I→R | Controls | Where | Test | ASVS | Pri |
|---|---|---|---|---|---|---|---|---|---|
| CAS-01 | E/T | Backend hosts | **Malicious PDF exploits the parser** (for example pdf.js CVE-2024-4367, which allowed JS execution through font handling) | M/H→H | Parse only in `apps/cas-worker`: a separate ECS task in a subnet **with no internet egress** (only S3 and SQS VPC endpoints), non-root, read-only root filesystem, 1 GB memory, 60 s timeout, no DB or Secrets Manager access. Pinned latest `pdfjs-dist` with `isEvalSupported:false` and `disableFontFace:true`. `qpdf --decrypt` first to normalise the file. | `apps/cas-worker`, `infra/cas.ts` | Fuzz and corpus test in CI (known-malicious PDFs, CVE PoCs): the worker exits cleanly and makes no outbound connection (VPC flow-log assertion in staging). CDK test: the task role has no DB access. | 15.2.5, 5.2.2, 12.3.1 | P1 (CAS is a launch requirement; beta may ship without CAS) |
| CAS-02 | D | Worker capacity | **PDF bombs / deep object streams / huge page counts** | M/M→M | ≤ 10 MB file. ≤ 100 pages. Cap on decompressed stream size. 3 uploads per investor per day. Queue concurrency 2. | `cas-import`, `cas-worker` | Bomb fixtures are rejected within the limits. | 5.2.1, 5.2.3 | P1 |
| CAS-03 | I | CAS password | **Password leakage** | M/M→M | Never persisted or logged. Passed as a KMS-encrypted field on a job with a 10-min TTL, deleted after use. Given to qpdf on **stdin**, not argv. 5 attempts per file, then the file is deleted. | `cas-import`, `cas-worker` | Log scanner (harness password never appears); `argv` inspection test. | 14.2.4, 16.2.5 | P1 |
| CAS-04 | T/I | Upload store | **Upload abuse / path tricks** | L/M→L | Pre-signed POST with `content-length-range`. Server-generated object key. Quarantine bucket (SSE-KMS, 1-day lifecycle). Magic-byte check for `%PDF-`. User filename ignored. Original deleted within 1 h of parsing. | `cas-import`, `infra/s3.ts` | `cas-upload.spec.ts` | 5.2.2, 5.3.2, 5.4.1, 14.2.7 | P1 |
| CAS-05 | S/I | Third-party data | **Foreign-PAN or forged CAS** (importing someone else's portfolio) | M/M→M | Import only if the CAS PAN equals the investor's KYC PAN (compared via blind index); otherwise reject and store nothing. Imported holdings shown separately and labelled "self-imported, not verified". Never used for Sanchay transactions or tax figures. | `cas-import` | `cas-pan-mismatch.spec.ts` | 2.2.3, 8.2.2 | P1 |
| CAS-06 | T | UI, CSV exports, logs | **Injection through parsed strings** (XSS, CSV formula, log injection) | L/M→L | Parsed text is treated as untrusted. React escaping. RFC 4180 escaping plus a leading `'` for `=+-@` in CSV. Length caps. | `cas-import`, `statements` | `csv-injection.spec.ts` | 1.2.10, 3.2.2, 16.4.1 | P1 |

### 4.13 Integrations and infrastructure

| ID | STRIDE | Asset | Attack | L/I→R | Controls | Where | Test | ASVS | Pri |
|---|---|---|---|---|---|---|---|---|---|
| INT-01 | E | FP client credentials (can transact for every investor) | **Credential theft** | L/H→M | Secrets Manager. Token in memory only. Egress allowlist. Ask Cybrilla for source-IP allowlisting of the NAT elastic IPs. Separate credentials per environment. Alarm on FP call volume anomalies. | `integrations/fp`, `infra` | CDK assertion; anomaly alarm test. | 13.2.1, 13.3.1 | P0 |
| INT-02 | T/I | Internal network | **SSRF** | L/H→M | No fetches of user-supplied URLs. Egress through Network Firewall / proxy with a domain allowlist (FP, AMFI, MSG91, SES, Sentry). HTTP client `redirect: 'error'`, except the known AMFI 302 host. | `@sanchay/http`, `infra/egress.ts` | `ssrf.spec.ts`; firewall rule test. | 1.3.6, 13.2.4, 13.2.5, 15.3.2 | P1 (allowlisted HTTP client P0) |
| INT-03 | T | NAV display | **AMFI feed tampering or poisoning** | L/M→L | TLS; fixed URLs; port the v1 validation floors (≥ 1000 rows, ≤ 25% daily jump). The RTA prices real transactions, so display impact only. | `apps/workers/nav-sync` | Floor tests ported from v1. | 12.3.2 | P0 |
| INT-04 | S | Environment | **Sandbox/prod confusion** | M/H→H | Boot guard: `APP_ENV=prod` with sandbox signals (FP base URL, client-ID pattern) fails to start, and the reverse. | `@sanchay/config/boot-guards.ts` | `env-guard.spec.ts` | 13.4.2 | P0 |
| INT-05 | S | Brand / investors | **Phishing via email or SMS spoofing** | M/M→M | SPF, DKIM, DMARC `p=reject` on `sanchay.in`. DLT-registered SMS header. In-app anti-phishing messaging. | DNS, SES, MSG91 | DMARC report monitoring; `dig` check in release gate. | 3.7.x (context) | P0 |
| INT-06 | I | Data in transit | **Weak TLS** | L/H→M | Controls in §3.4; internal ALB → ECS over TLS; RDS `force_ssl`. | `infra` | testssl.sh in release gate. | 12.1.1, 12.2.1, 12.3.1, 12.3.3 | P0 |

### 4.14 Logging, monitoring and incident response (repudiation / detection)

| ID | STRIDE | Asset | Gap | Controls | Where | Test | ASVS | Pri |
|---|---|---|---|---|---|---|---|---|
| LOG-01 | R | Forensics | **Security events not logged** | Log auth success and failure, OTP send/verify, step-up, session revoke, authorization denials, consent lifecycle, admin reveals and actions, webhook signature failures and boot-guard trips. JSON with who/what/when/where and UTC. CloudWatch Logs in ap-south-1: **400 days hot**, then S3 Glacier. Audit and consent evidence kept 8 years. This covers CERT-In (180 days, in India) and DPDP Rules 2025 Rule 6 (1 year; confirm with counsel). | `@sanchay/logger`, `audit` | `security-events.spec.ts`: each event type is emitted with the required fields. | 16.1.1, 16.2.1, 16.2.2, 16.3.1–16.3.4, 16.4.3 | P0 |
| LOG-02 | R/D | Incident handling | **No incident response** | Runbook covering CERT-In 6-hour reporting, DPDP Board and data-principal notification (72-hour detailed report), and Cybrilla/AMC notification. GuardDuty plus Security Hub on. PagerDuty alerts on: SMS spend, refresh-token reuse, webhook signature failures, admin reveal spikes, redemption velocity. | `docs/security/ir-runbook.md`, `infra/monitoring.ts` | Tabletop exercise before beta. | 16.3.4, 16.5.3 | P0 |

---

## 5. BOLA resource matrix (investor-owned resources)

Rules for every resource:

- `investorId` comes from the session.
- Foreign IDs return **404**.
- Every resource is covered by the harness in `@sanchay/security-testing/bola.ts`, run as `apps/api/test/security/bola.e2e-spec.ts` against Testcontainers PostgreSQL 18.

| Resource (table) | Routes (indicative) | Ownership / relation rule | Extra check |
|---|---|---|---|
| Profile, contacts (`investors`, `investor_contacts`) | `GET/PATCH /me`, `/me/contacts/*` | Session investor only; no `:id` | Contact change needs dual OTP |
| KYC artefacts (`kyc_cases`, eSign, DigiLocker refs) | `/kyc/*`, callbacks | `kyc_case.investor_id` | Callback `state` bound to the session |
| FATCA / declarations (`declarations`) | `/declarations` | Session | Immutable after submit |
| Bank accounts (`bank_accounts`) | `/banks`, `/banks/:id` | `bank.investor_id` | Payout eligible only after 24 h; ≤ 5 accounts |
| Nominees and opt-out docs (`nominees`, `documents`) | `/nominees/:id`, `/documents/:id` | `investor_id` on both; doc ↔ nominee relation | Opt-out needs OTP plus content hash |
| Consents (`consents`, `consent_evidence`) | `/consents/:id/verify` | `consent.investor_id` and `consent.intent_id` = path intent | Purpose must match the route |
| Order intents / lumpsum (`order_intents`) | `/orders`, `/orders/:id` | `intent.investor_id`; body `bankAccountId` and `schemeIsin` | Plan is REGULAR server-side |
| Payments (`payment_attempts`) | `/payments/:id`, `/r/pay/:intentId` | via intent | No state change from query params |
| Mandates (`mandates`) | `/mandates/:id` | `mandate.investor_id`; `mandate.bank_id` belongs to the investor | Server-computed limit |
| SIPs (`sip_registrations`, `sip_instalments`) | `/sips/:id` (pause/modify/top-up/cancel) | `sip.investor_id`; `sip.mandate_id` belongs to the investor | Consent on modify, top-up and cancel |
| Redemptions (`redemptions`) | `/redemptions` | Folio and holding belong to the investor | Row lock plus ceiling |
| Switch / STP / SWP (`systematic_plans`) | `/switches`, `/stps/:id`, `/swps/:id` | Source folio belongs to the investor; target scheme is in the same AMC | SWP payout goes only to an eligible bank |
| Holdings / portfolio (`holdings_snapshot`) | `/portfolio`, `/holdings/:schemeId` | Session | Response has no other-investor aggregates |
| Statements / capital gains / ELSS (`statement_jobs`) | `/statements/:jobId`, `/tax/*` | `job.investor_id` | Pre-signed URL issued after authorization |
| CAS imports (`cas_imports`, `external_holdings`) | `/cas-imports/:id` | `import.investor_id` | CAS PAN must equal the investor's PAN |
| Notifications / preferences | `/notifications/:id` | `investor_id` | none |
| Sessions / devices (`auth_sessions`, `devices`) | `/sessions/:id` | `session.investor_id` | Revoke-all needs re-auth |
| Watchlist | `/watchlist/:itemId` | `investor_id` | none |

---

## 6. Standards mapping

### 6.1 OWASP ASVS 5.0, Level 2

IDs verified against `github.com/OWASP/ASVS/tree/master/5.0/en` on 2026-09-25.

| ASVS chapter | L1/L2 requirements addressed | Sanchay controls / backlog IDs | N/A or deviation |
|---|---|---|---|
| V1 Encoding and Sanitization | 1.1.1–1.1.2, 1.2.1–1.2.5, 1.2.9, 1.3.1–1.3.3, 1.3.6, 1.3.7, 1.3.10, 1.3.11, 1.5.1–1.5.2 (plus 1.2.10, 1.3.12 adopted from L3) | Drizzle parameterised queries (1.2.4). React escaping. SSRF allowlist (INT-02). Mail sanitisation in `notifications`. CSV escaping (CAS-06). zod-only JSON parsing, no XML. | 1.2.6–1.2.8 and 1.3.8 are not applicable (no LDAP, XPath, LaTeX or JNDI) |
| V2 Validation and Business Logic | 2.1.1–2.1.3, 2.2.1–2.2.3, 2.3.1–2.3.4, 2.4.1 | Strict contracts. Intent state machine (TX-01). Ceilings and locks (AZ-05). Business limits (§3.3). | 2.3.5 (multi-user approval) adopted for admin recovery and curation only |
| V3 Web Frontend | 3.2.1–3.2.2, 3.3.1–3.3.4, 3.4.1–3.4.6, 3.5.1–3.5.5, 3.7.1–3.7.2 | §3.5 headers, SESS-01/02, PAY-02, separate admin hostname (3.5.4) | none |
| V4 API and Web Service | 4.1.1–4.1.3, 4.2.1 | Nest content-type discipline; ALB header stripping (DOS-06); HTTP/2 at ALB | 4.3 GraphQL and 4.4 WebSocket not applicable unless adopted |
| V5 File Handling | 5.1.1, 5.2.1–5.2.3, 5.3.1–5.3.2, 5.4.1–5.4.3 | CAS-01..04; nominee and opt-out documents use the same presigned upload pipeline. **5.4.3** antivirus: ClamAV scan in the quarantine step for nominee documents (P1). | none |
| V6 Authentication | 6.1.1, 6.1.3, 6.3.1–6.3.4, 6.4.3–6.4.4, 6.5.1–6.5.5, 6.6.1–6.6.3, 6.8.1–6.8.4 (admin IdP) | §3.1, AUTH-01..11 | V6.2 passwords not applicable to investors (passwordless); admin passwords are held by the IdP. **Deviation on 6.6.1 / 6.3.3:** SMS OTP is the primary factor. Mitigated by device binding, email step-up on new devices, app lock, and a 24 h cool-off. Passkeys (WebAuthn) for web in P2. |
| V7 Session Management | 7.1.1–7.1.3, 7.2.1–7.2.4, 7.3.1–7.3.2, 7.4.1–7.4.5, 7.5.1–7.5.2, 7.6.2 | §3.2, SESS-01..08 | 7.6.1 applies to the admin IdP only |
| V8 Authorization | 8.1.1–8.1.2, 8.2.1–8.2.3, 8.3.1, 8.4.1 (per investor as the tenant boundary) | AZ-01..05, §5, INS-01 | none |
| V9 Self-contained Tokens | 9.1.1–9.1.3, 9.2.1–9.2.4 | Apply only to ALB OIDC `x-amzn-oidc-data` (verify ES256 with the regional ALB key and pin the `signer` ARN) and IdP tokens | Investor sessions are opaque (A4) |
| V10 OAuth/OIDC | Relevant L2 client items for admin OIDC and FP client-credentials | ALB authenticate-oidc with PKCE/state handled by ALB; FP client-credentials in Secrets Manager | Sanchay is not an authorisation server |
| V11 Cryptography | 11.1.1–11.1.2, 11.2.1–11.2.3, 11.3.1–11.3.3, 11.4.1–11.4.4, 11.5.1, 11.6.1 | §3.4 crypto inventory; `node:crypto` plus KMS | none |
| V12 Secure Communication | 12.1.1–12.1.3, 12.2.1–12.2.2, 12.3.1–12.3.4 | INT-06 | none |
| V13 Configuration | 13.1.1, 13.2.1–13.2.5, 13.3.1–13.3.2, 13.4.1–13.4.5 | SEC-01..04, INT-01/02/04, INS-06. Swagger disabled in prod (v1 did this; `application.yml:373-387`). | none |
| V14 Data Protection | 14.1.1–14.1.2, 14.2.1–14.2.4, 14.3.1–14.3.3 (plus 14.2.6, 14.2.7 adopted) | §1.2 classification, PII-01..12 | none |
| V15 Secure Coding and Architecture | 15.1.1–15.1.3, 15.2.1–15.2.3, 15.3.1–15.3.7 (plus 15.4.2 adopted) | SC-01..07, AZ-04, DOS-06. Prototype pollution (15.3.6): `Object.create(null)` / `Map` for dynamic keys; zod strips `__proto__`. HTTP parameter pollution (15.3.7): reject duplicate query keys. | none |
| V16 Logging and Error Handling | 16.1.1, 16.2.1–16.2.5, 16.3.1–16.3.4, 16.4.1–16.4.3, 16.5.1–16.5.3 | LOG-01/02, PII-01, INS-05, SEC-04 | none |
| V17 WebRTC | none | none | Not applicable |

### 6.2 OWASP MASVS v2 (native app)

| MASVS control | Sanchay implementation | Threat / backlog |
|---|---|---|
| MASVS-STORAGE-1 (store sensitive data securely) | SecureStore `ThisDeviceOnly` for tokens; no PII in AsyncStorage/MMKV/query cache | SESS-04, PII-07 |
| MASVS-STORAGE-2 (prevent leakage) | `allowBackup=false`; FLAG_SECURE / privacy overlay; no PII in logs, crash reports or notifications | PII-03, 04, 05, 09 |
| MASVS-CRYPTO-1/2 | No custom crypto on device; platform keystore via SecureStore; keys generated in hardware by App Attest / Play Integrity | SESS-04 |
| MASVS-AUTH-1 (secure auth protocols) | Server-side opaque sessions, rotation, reuse detection | SESS-05/06 |
| MASVS-AUTH-2 (local auth) | Biometric or device-credential app lock, only unlocking a server session (never an authentication decision on its own) | SESS-07 |
| MASVS-AUTH-3 (extra auth for sensitive ops) | OTP consent for every transaction; re-auth for bank, contact and nominee changes | TX-01..05, AUTH-10 |
| MASVS-NETWORK-1 | TLS only, `usesCleartextTraffic=false`, iOS ATS default | INT-06 |
| MASVS-NETWORK-2 (identity pinning) | **P1:** public-key pinning of `api.sanchay.in` to the Amazon Trust Services intermediate/root keys plus a backup pin (e.g. `react-native-ssl-public-key-pinning` via config plugin), with a remote-config kill switch | P1-backlog |
| MASVS-PLATFORM-1 (IPC / deep links) | Verified App Links / Universal Links, `+native-intent` sanitiser, UPI package allowlist | PAY-05/06 |
| MASVS-PLATFORM-2 (WebViews) | No WebViews for PG, DigiLocker or eSign; system browser | PAY-07 |
| MASVS-PLATFORM-3 (UI) | FLAG_SECURE, masked fields, `filterTouchesWhenObscured` against tapjacking on consent buttons | PII-04 |
| MASVS-CODE-1/3 (up-to-date platform and dependencies) | Expo SDK kept within one release of latest; minSdk 26 (assumption); Renovate plus audit gates | SC-01, SC-06 |
| MASVS-CODE-2 (update mechanism) | EAS Update code signing; forced-update gate via server `minSupportedVersion` | SC-04 |
| MASVS-CODE-4 (validate untrusted input) | zod on deep-link parameters and push payloads | PAY-05 |
| MASVS-RESILIENCE-1 (platform integrity) | `@expo/app-integrity` (Play Integrity Standard / App Attest). **Alpha as of SDK 54, so pin the version and wrap it behind an interface.** Warn in beta, enforce for OTP send and transactions at launch. | AUTH-01, SESS-04 |
| MASVS-RESILIENCE-2..4 | Hermes bytecode; release builds non-debuggable; no heavy obfuscation (low value versus cost for 2 developers) | P2 |
| MASVS-PRIVACY-1..4 | Data minimisation; typed analytics without PII; in-app privacy notice, consent and erasure request (DPDP) | PII-02, P1 DPDP items |

---

## 7. Security test strategy

| Layer | Tooling | What it proves | Gate |
|---|---|---|---|
| Unit / property | Vitest, fast-check | OTP policy, redactor, canonical snapshot round-trip, boot guards, rate-limit maths | Every PR |
| Integration (real DB) | Jest/Vitest with **Testcontainers PostgreSQL 18** and Valkey (fixes v1's dependence on a local Postgres, `pom.xml:122-142`) | Races (redeem, consent), RLS, audit immutability, PII at rest, webhook idempotency across restarts | Every PR |
| Authorization harness | `@sanchay/security-testing/bola.ts` (route-metadata driven) | No BOLA, BFLA or second-identifier leaks on any route | Every PR; fails when a new route has no fixture |
| Contract | zod strictness generator | Mass assignment, response over-exposure | Every PR |
| E2E negative (web) | Playwright 1.62: port `approval-bypass`, `approval-negatives` and `api-authorization` specs as patterns | Consent bypass, CSRF, storage hygiene, open redirects, header snapshot | Every PR (smoke), nightly (full) |
| E2E (native) | Maestro on EAS builds | Deep-link handling, FLAG_SECURE, app lock, new-device step-up | Nightly and release |
| Log / telemetry scanner | `@sanchay/security-testing/log-scanner.ts` | No OTP, PII or tokens in logs, Sentry or analytics | Nightly and release |
| SAST / secrets / supply chain | Semgrep (p/nestjs, p/nextjs, p/react, custom rules), CodeQL, gitleaks, OSV-Scanner, zizmor, Trivy | Code, secrets, dependencies, workflows, images | Every PR |
| DAST | OWASP ZAP baseline (PR on preview), full active scan on staging | Headers, XSS, injection | PR baseline; weekly full |
| Mobile static | MobSF against APK/IPA | Manifest flags, cleartext, secrets, backups | Release |
| External penetration test | CERT-In empanelled auditor (web, API, Android, iOS, admin) | Independent assurance; commonly asked for by partners | Before public launch (P1) |
| Bug bounty / VDP | `security.txt` plus VDP inbox at beta; paid bounty after launch | Crowd coverage | VDP P0; bounty P2 |

---

## 8. Prioritised security backlog

Sizes: S ≤ 2 dev-days, M ≤ 5, L ≤ 10. The "blocks" column names the feature that must not ship to real users without the item.

### P0: before closed beta

| ID | Item | Threats | Module / package | Size | Blocks | Acceptance test |
|---|---|---|---|---|---|---|
| P0-01 | `@sanchay/config` env schemas (server/public split) plus boot guards: fake OTP sender, sandbox/prod mismatch, Swagger off in prod | AUTH-05, INT-04, SEC-02 | `@sanchay/config` | S | Any deploy | `boot-guard.spec.ts`, `env-guard.spec.ts` |
| P0-02 | Repo hygiene: gitleaks (pre-commit and CI), push protection, `.env.example` validator, CODEOWNERS for lockfiles, auth and consents | SEC-01, SC-02 | Repo root | S | First commit | CI gates green |
| P0-03 | pnpm hardening (`minimumReleaseAge`, `strictDepBuilds`/`allowBuilds`, `blockExoticSubdeps`, `trustPolicy`), frozen lockfile, OSV/audit gate, new-dependency check | SC-01, SC-02 | Root, CI | S | First commit | `supply-chain-config.spec.ts` |
| P0-04 | GitHub Actions hardening (SHA pins, OIDC to AWS, minimal permissions, prod environment reviewer, zizmor) | SC-03 | `.github/workflows` | S | First deploy | zizmor clean |
| P0-05 | `@sanchay/logger` (pino plus key and value-pattern redaction), shared Sentry scrubber, generic exception filter | PII-01, PII-03, SEC-04, AUTH-04 | `@sanchay/logger`, `apps/*` | M | Any environment with real data | `redactor.spec.ts`, `sentry-scrub.spec.ts`, `error-shape.spec.ts` |
| P0-06 | OTP engine (§3.1): HMAC pepper, binding, quotas, cooldowns, lockouts, async send, anti-enumeration, MSG91 DLT plus SES | AUTH-01..06 | `otp`, `@sanchay/crypto` | L | Signup/login | `otp.*.spec.ts`, `enumeration.int-spec.ts` |
| P0-07 | Sessions (§3.2): opaque tokens, `__Host-` cookie, CSRF guard, native refresh rotation with reuse detection, revocation, SecureStore adapter | SESS-01..06 | `sessions`, `apps/web`, `apps/mobile` | L | Login | `session-*.spec.ts`, `csrf.int-spec.ts`, `refresh-reuse.spec.ts` |
| P0-08 | New-device step-up (SMS plus email), device registry, new-login alerts, 24 h cool-off policy engine | AUTH-08, AUTH-10 | `auth`, `devices`, `notifications` | M | Bank add, contact change | `new-device.e2e.ts` |
| P0-09 | Default-deny route guard with `@Public/@Investor/@Admin` and a route-inventory test | AZ-03 | `apps/api/common` | S | Any route | `route-inventory.spec.ts` |
| P0-10 | `@sanchay/db` scoped repositories, lint rule against unscoped investor-table access, `@CurrentInvestor()` | AZ-01, AZ-02 | `@sanchay/db`, `@sanchay/authz` | M | Any investor data | Lint gate |
| P0-11 | BOLA harness plus the §5 fixture set (grows with each feature) | AZ-01, AZ-02 | `@sanchay/security-testing` | M (then S per feature) | Every investor route | `bola.e2e-spec.ts` green |
| P0-12 | Strict contracts (request and response), mass-assignment generator test; server-side ARN/EUIN/plan | AZ-04, PII-10, AUTH-07 | `@sanchay/contracts`, `orders` | M | Orders | `contracts.strict.spec.ts`, `order-server-fields.spec.ts` |
| P0-13 | Consent engine: consent-first state machine, JCS snapshot from DB, atomic consume, immutable intent trigger, 10-min execution window, dual-channel OTP, evidence record | TX-01..06 | `consents`, `@sanchay/crypto`, `@sanchay/db` | L | Lumpsum, SIP, mandate, redemption, switch/STP/SWP | `consent-*.spec.ts`, `snapshot-roundtrip.property.spec.ts` |
| P0-14 | Idempotency-Key interceptor and FP idempotency per intent | TX-07 | `common`, `integrations/fp` | S | Orders | `idempotency.spec.ts` |
| P0-15 | Redemption and systematic-plan business rules: row lock ceiling, ELSS lock-in, server clock, consent on SIP modify, top-up and cancel | AZ-05 | `redemptions`, `sips`, `systematic` | M | Redemption, SIP management, switch/STP/SWP | `redeem-race.int-spec.ts`, `elss-lockin.spec.ts` |
| P0-16 | FP webhook: FP-Signature HMAC over raw body with `kid`, persistent `webhook_events`, re-fetch plus monotonic states | WH-01..03 | `webhooks`, `workers` | M | Any live FP flow | `webhook-*.spec.ts` |
| P0-17 | Payment, mandate, KYC and eSign return handling: `state` nonce, no query-driven state, allowlisted return URLs, TPV bank, server-computed mandate limits | PAY-01..04, WH-05 | `payments`, `mandates`, `kyc` | M | Payments, mandates, KYC | `payment-return.e2e.ts`, `callback-state.spec.ts`, `mandate-limit.spec.ts` |
| P0-18 | Bank add and contact change hardening: penny drop plus name match, dual OTP, 24 h/72 h holds, notifications | AUTH-10 | `banks`, `investors` | M | Bank and contact management | `bank-change.e2e.ts` |
| P0-19 | PII envelope encryption plus blind index (PAN, bank account, DOB, nominee/guardian IDs) | PII-08 | `@sanchay/crypto`, `@sanchay/db` | M | KYC data capture | `pii-at-rest.int-spec.ts` |
| P0-20 | Web headers/CSP (nonce), cache rules (`no-store`, CDN behaviours, `'use cache'` lint), no PII in web storage | SESS-01, SESS-08, PII-06, PII-07 | `apps/web`, `infra/cdn.ts` | M | Web beta | `headers.pw.spec.ts`, `cache.e2e.ts`, `storage.pw.spec.ts` |
| P0-21 | Native baseline: `allowBackup=false`, no cleartext traffic, SecureStore only, FLAG_SECURE / privacy overlay, verified App Links / Universal Links plus `+native-intent` sanitiser, no WebViews, EAS Update code signing | SESS-04, PII-04, PAY-05, PAY-07, SC-04 | `apps/mobile` | M | Native beta | MobSF clean; Maestro deep-link and screencap tests; signed-update test |
| P0-22 | Typed analytics wrapper without PII (or no analytics in beta), notification templates masked | PII-02, PII-09 | `@sanchay/analytics`, `notifications` | S | Beta | `analytics.schema.spec.ts`, `templates.snapshot.spec.ts` |
| P0-23 | Admin foundation: separate host, ALB OIDC plus IdP passkey 2-step, WAF IP allowlist, RBAC roles, masked-by-default with audited reveal, no admin writes to contacts or banks, no manual allotment | INS-01..03, AUTH-07 | `apps/admin`, `admin` | L | Any ops tooling touching real data | `admin-rbac.matrix.spec.ts`, `reveal-audit.spec.ts` |
| P0-24 | Audit and evidence immutability (grants, trigger, hash chain, daily S3 Object Lock anchor) | INS-05, TX-06 | `audit`, `infra` | M | Beta | `audit-immutability.int-spec.ts` |
| P0-25 | AWS baseline: private subnets, RDS KMS/PITR/force_ssl/IAM auth, S3 Block Public Access, SCP blocking public snapshots, GuardDuty, Security Hub, Config rules, Secrets Manager with per-service roles, no standing prod access | PII-05, INS-06, SEC-03, INT-01, INT-06 | `infra` | L | Beta | CDK assertion tests; Config rules green; testssl.sh A |
| P0-26 | WAF (managed rules, rate rules), trusted-proxy IP derivation, body and string limits | DOS-01, DOS-05, DOS-06, WH-04 (partial) | `infra/waf.ts`, `apps/api/main.ts` | S | Beta | `xff-spoof.int-spec.ts`, k6 |
| P0-27 | Security event logging (LOG-01), alerts (SMS spend, refresh reuse, webhook signature failures, reveal spikes, redemption velocity), IR runbook with CERT-In and DPDP timelines, `security.txt` and VDP inbox | LOG-01, LOG-02 | `@sanchay/logger`, `infra/monitoring.ts`, `docs/security` | M | Beta | `security-events.spec.ts`; tabletop exercise done |
| P0-28 | Email and SMS authenticity: SPF, DKIM, DMARC `p=reject`; DLT header and templates | INT-05 | DNS, MSG91, SES | S | Signup | DNS check script |
| P0-29 | Container hardening and scan gates; Next.js/React at patched versions; patch SLA documented | SC-06 | `Dockerfile`s, CI | S | Beta | Trivy gate |
| P0-30 | Allowlisted outbound HTTP client (`redirect:'error'`, host allowlist); FP token in memory only | INT-01, INT-02 (partial) | `@sanchay/http`, `integrations/fp` | S | FP integration | `ssrf.spec.ts` |
| P0-31 | Log / telemetry scanner in the nightly pipeline | AUTH-04, PII-01..03 | `@sanchay/security-testing` | S | Beta | 0 hits |

### P1: before public launch

| ID | Item | Threats | Module | Size | Acceptance test |
|---|---|---|---|---|---|
| P1-01 | App attestation (`@expo/app-integrity`, pinned and behind an interface) required for OTP send, refresh and transactions; server-side verification against the Play Integrity and App Attest APIs | AUTH-01, SESS-04/05 | `apps/mobile`, `devices` | L | Integrity-failed client gets 403 on OTP send and transactions |
| P1-02 | App lock (biometric / device credential) and masked-balance toggle | SESS-07 | `apps/mobile` | S | Maestro lock test |
| P1-03 | Postgres RLS on all investor-owned tables (`SET LOCAL app.investor_id`); `app_rw` role without BYPASSRLS | AZ-01 | `@sanchay/db` | M | `rls.int-spec.ts`: an unscoped query returns 0 rows |
| P1-04 | Certificate / public-key pinning with backup pin and kill switch | MASVS-NETWORK-2 | `apps/mobile` | M | MITM proxy test fails the connection |
| P1-05 | Support-assisted account recovery (DigiLocker re-verify, two-person approval, 72 h hold) | AUTH-11 | `admin/recovery`, `kyc` | M | `recovery.e2e.ts` |
| P1-06 | CAS import pipeline hardening (isolated worker without egress, qpdf and pdf.js limits, password handling, PAN match, retention) | CAS-01..06 | `apps/cas-worker`, `cas-import`, `infra/cas.ts` | L | Corpus and fuzz tests; VPC flow-log check; `cas-pan-mismatch.spec.ts` |
| P1-07 | Fund-facts curation maker-checker with versioning | INS-04 | `catalogue/curation` | S | `curation-maker-checker.spec.ts` |
| P1-08 | WAF Bot Control; egress Network Firewall domain allowlist | DOS-01, INT-02 | `infra` | M | Firewall rule tests |
| P1-09 | Circuit breaker and queue caps on FP; statement/XIRR caching and quotas; RDS Proxy; perf and soak test at 10× beta load | DOS-02..04 | `integrations/fp`, `portfolio`, `statements`, `infra` | M | Perf report within budget |
| P1-10 | Session and device management UI (list/revoke, revoke-all after factor change) | ASVS 7.4.3, 7.5.2 | `sessions`, `apps/*` | S | E2E |
| P1-11 | Trusted Types on web; CSP reporting endpoint | SESS-01 | `apps/web` | S | Header snapshot |
| P1-12 | SBOM per artifact; secret rotation schedule executed once (pepper `kid` rotation drill) | SC-07, SEC-03 | CI, `infra` | S | SBOM attached; drill log |
| P1-13 | ClamAV scan for uploaded nominee and opt-out documents | ASVS 5.4.3 | `documents` | S | EICAR test file rejected |
| P1-14 | DPDP readiness: privacy notice, granular consent records, erasure/export request flow, retention jobs (snapshots 180 days, CAS originals ≤ 1 h, statements 24 h) | PII-05, PII-11, CAS-07 | `investors`, `workers` | M | Retention job tests; erasure e2e |
| P1-15 | External penetration test (web, API, Android, iOS, admin) by a CERT-In empanelled firm; fix all High/Critical findings | All | none | Vendor, about 2 weeks | Report with zero open High |
| P1-16 | Webhook flood protections validated (WH-04); UPI intent package allowlist if intent flow is added (PAY-06); INS-07 support playbook | WH-04, PAY-06, INS-07 | `webhooks`, `apps/mobile`, runbook | S | Load test; manual rogue-app test |

### P2: within 90 days after launch

| ID | Item |
|---|---|
| P2-01 | Passkeys (WebAuthn) as an optional web login factor, closing the ASVS 6.3.3 / 6.6.1 SMS-OTP deviation |
| P2-02 | SIM-swap signal API (telco SIM-change check at login) as a risk input |
| P2-03 | Paid bug bounty |
| P2-04 | Risk-based adaptive authentication (ASVS 8.2.4-style signals: device, geo-velocity) |
| P2-05 | MASVS-RESILIENCE-2..4 hardening review |
| P2-06 | Annual CSCRF-aligned internal audit (see D3 in §9) |

---

## 9. Decisions made here (no TBDs) and items to confirm

| # | Decision / recommendation | Needs confirmation from |
|---|---|---|
| D1 | Opaque server-side sessions for web and native; no investor JWTs | Architecture agent (auth module design) |
| D2 | Consent OTPs go to both registered mobile and email with one code; 10-min execution window | Compliance (SEBI 2FA circular SEBI/HO/IMD/IMD-I DOF1/P/CIR/2022/132 allows either channel; the dual channel is a Sanchay choice) |
| D3 | Adopt SEBI CSCRF-style controls voluntarily. An AMFI-registered MFD is not itself a SEBI "regulated entity" under CSCRF, but Cybrilla, AMCs and RTAs are, and will flow requirements down. | Compliance |
| D4 | Log retention 400 days hot plus archive; audit and consent evidence 8 years (assumed from PMLA-style record keeping) | Compliance and legal |
| D5 | Sentry and analytics SaaS outside India are acceptable only with PII scrubbing. The DPDP Act allows cross-border transfer except to notified restricted countries; CSCRF localisation is reportedly in abeyance (secondary source). Keep all primary data in ap-south-1. | Legal |
| D6 | Ask Cybrilla for the FP webhook secret and `id`, source-IP allowlisting for our NAT elastic IPs, and FP webhook retry semantics. This belongs in the pending production-inquiry email (`docs/cybrilla-production-inquiry-email.md`, never sent per synthesis §6). | Product owner |
| D7 | CAS import may be excluded from closed beta; it is P1-gated. | Product owner |
| D8 | Name-match threshold (Jaro-Winkler ≥ 0.8) and the 24 h / 72 h cool-offs are initial values; tune with beta data. | Product / ops |

---

## 10. Sources

**v1 code and docs (read-only)**, with paths relative to `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/` unless absolute:

- `controller/CybrillaWebhookController.java:45-50,77-89,117-142,175-191`
- `config/LoginRateLimitFilter.java:48-64,117-122`
- `service/OtpService.java:166-171,249-258,282`
- `service/EmailService.java:120`
- `service/InvestorActionService.java:207-247,626-630,1295-1325`
- `service/OrderService.java:253,709`
- `common/PiiRedactor.java:35-42`
- `config/SecurityConfig.java:65-80,145-163`
- `C:/Users/pc/Desktop/WeathTech_v2/investor-frontend/src/views/InvestorOnboarding.tsx:188,444`
- `C:/Users/pc/Desktop/WeathTech_v2/QA-FULL-TEST-REPORT-2026-07-27.md:37-41,109,234,297-333,380-398`
- `C:/Users/pc/Desktop/WeathTech_v2/COMPLETE_TEST_SUITE_REPORT.md:14,41,75,112`
- `C:/Users/pc/Desktop/WeathTech_v2/docs/superpowers/COMPLIANCE-REVIEW-2026-09-03.md:82,130-140,170-184,324`
- Prior-analysis synthesis §2, §3, §11, §12 and slices `map:be-platform-auth`, `map:docs-compliance`, `map:be-integrations`, `map:be-transactions`, `map:db-schema`, `map:fe-platform`

**Web (all accessed 2026-09-25)**

- OWASP ASVS 5.0 chapter sources: https://github.com/OWASP/ASVS/tree/master/5.0/en
- OWASP MASVS v2: https://mas.owasp.org/MASVS/
- FP webhook implementation (FP-Signature HMAC-SHA256, no ordering guarantee): https://docs.fintechprimitives.com/upcoming/beta/webhook-implementation/
- pnpm settings: https://pnpm.io/10.x/settings
- pnpm and npm supply-chain defences: https://mondoo.com/blog/npm-supply-chain-security-package-manager-defenses-2026
- Hardening lessons from 2026 OSS incidents: https://dev.to/trknhr/lessons-from-the-spring-2026-oss-incidents-hardening-npm-pnpm-and-github-actions-against-1jnp
- Expo AppIntegrity (alpha, SDK 54): https://docs.expo.dev/versions/latest/sdk/app-integrity/ and https://expo.dev/blog/expo-app-integrity
- React2Shell (CVE-2025-55182 / CVE-2025-66478, disclosed 2025-12-03; Next.js patched in 16.0.7+): https://github.com/vercel/next.js/security/advisories/GHSA-9qr9-h5gf-34mp and https://securitylabs.datadoghq.com/articles/cve-2025-55182-react2shell-remote-code-execution-react-server-components/
- Next.js middleware bypass CVE-2025-29927: https://nvd.nist.gov/vuln/detail/CVE-2025-29927
- pdf.js CVE-2024-4367: https://nvd.nist.gov/vuln/detail/CVE-2024-4367
- CERT-In Directions 70B, 28-04-2022 (6-hour reporting, 180-day logs): https://www.cert-in.org.in/PDF/CERT-In_Directions_70B_28.04.2022.pdf
- SEBI CSCRF: https://www.sebi.gov.in/legal/circulars/aug-2024/cybersecurity-and-cyber-resilience-framework-cscrf-for-sebi-regulated-entities-res-_85964.html
- DPDP Rules 2025 (secondary): https://www.ey.com/en_in/insights/cybersecurity/transforming-data-privacy-digital-personal-data-protection-rules-2025

---

### Critical files for implementation

All `sanchay` paths are planned (the workspace is greenfield). The `WeathTech_v2` paths are v1 references.

- `C:/Users/pc/Desktop/sanchay/apps/api/src/modules/otp/otp.service.ts` (planned): OTP policy, reference `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/service/OtpService.java`
- `C:/Users/pc/Desktop/sanchay/apps/api/src/modules/consents/consent.service.ts` (planned): consent-first 2FA engine, reference `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/service/InvestorActionService.java`
- `C:/Users/pc/Desktop/sanchay/apps/api/src/modules/webhooks/fp-signature.guard.ts` (planned): reference `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/controller/CybrillaWebhookController.java`
- `C:/Users/pc/Desktop/sanchay/packages/db/src/scoped.ts` and `C:/Users/pc/Desktop/sanchay/packages/security-testing/src/bola.ts` (planned): BOLA prevention and proof
- `C:/Users/pc/Desktop/sanchay/packages/logger/src/redact.ts` (planned): reference `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/common/PiiRedactor.java`
