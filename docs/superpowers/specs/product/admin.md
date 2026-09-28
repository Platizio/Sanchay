<!-- source: workflow wf_3190e72a-04a label spec:admin | exported 2026-09-28 -->

# Sanchay admin and ops back-office spec (v1.0, 2026-09-25)

**Scope:** internal back-office for Platizio staff. Platizio is an AMFI-registered MFD (ARN), and investors self-serve **regular** plans with orders executed through Cybrilla FP. This document is the output of the read-only planning task and has no open TBDs. Each open point below has a concrete recommendation, with the assumption it rests on.

**Path shorthands used in citations:**
- `BE` = `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech`
- `MIG` = `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/resources/db/migration`
- `FE` = `C:/Users/pc/Desktop/WeathTech_v2/investor-frontend/src`

---

## 0. Assumptions (stated so there are no TBDs)

| # | Assumption | Effect if wrong |
|---|---|---|
| A1 | The production domain is `sanchay.in` (inferred from app id `in.sanchay.app`). Admin is served at `ops.sanchay.in`. The investor side uses `sanchay.in` and `api.sanchay.in`. | Only DNS and cookie names change. |
| A2 | Staff email domain is `@platizio.com`. Admin accounts are restricted to that domain. | Change one config value. |
| A3 | Launch serves resident-individual investors only, holding singly: no NRI, minor, HUF or joint holding. FATCA non-IN tax residency means onboarding is refused, not queued for review. | The KYC queue gains NRI/minor case types. |
| A4 | Launch staff is 2 developers (both SUPER_ADMIN plus ENGINEER), and 1 to 3 ops/compliance/support people added later. Maker-checker therefore needs at least 2 eligible checkers per checker permission. SUPER_ADMIN can check anything they did not make. | If only one human holds a role, only SUPER_ADMIN can act as checker for it. |
| A5 | All orders are execution-only: EUIN is left blank and a per-order investor execution-only declaration is captured (see §5.17). No assisted or advised transactions at launch. | An EUIN registry screen becomes live (it is built but disabled). |
| A6 | Retention: PMLA requires transaction records for 5 years after the transaction and identity records for 5 years after the relationship ends. We add a safety margin and keep **audit and regulated records 8 years**. Security logs stay online 2 years (CSCRF/IT Act practice) and at least 180 days in India (CERT-In). | Retention job config changes. |
| A7 | The backend is one NestJS 11 codebase with **two bootstrap entrypoints** (public API and admin API), deployed as two ECS services in ap-south-1. | See §1. |

---

## 1. Where the admin app lives

**Recommendation: build a separate app, `apps/admin` (Next.js 16).** Serve it on its own subdomain `ops.sanchay.in`. It talks to a separately deployed admin API entrypoint (`apps/api/src/main-admin.ts`) through same-origin path routing (`ops.sanchay.in/api/*`). Put AWS WAF with an IP allow-list in front of that host.

| Criterion | Route group inside `apps/web` on a subdomain | Separate `apps/admin` (recommended) |
|---|---|---|
| Attack surface | Admin server code, server actions and routes ship in the same deployment as the public site. One middleware host-matching bug exposes admin routes on `sanchay.in`. | Admin code is never deployed to the public origin. The public API process does not even import admin modules. |
| Network isolation | Hard: one CloudFront/ALB target serves both. | WAF IP-set on the `ops.sanchay.in` host only. It can later move behind VPN or a private ALB with no code change. |
| Cookies / CSP / CSRF | Shared origin policy. Cookie scoping mistakes are easy to make. | Separate `__Host-` cookie with `SameSite=Strict`. Strict CSP with no third-party scripts, analytics or marketing tags. |
| Performance budget | Admin dependencies (data grids, diff viewers, charts) risk leaking into the investor bundle, which must stay fast on low-end Android (locked decision 8). | Admin can be heavy and desktop-first (≥1280 px) without affecting investors. |
| Release cadence | One deploy for both, so an admin hotfix redeploys the investor site. | Deployed independently. Turborepo builds only what changed. |
| Code reuse | Direct. | Via shared packages: `@sanchay/contracts` (zod/OpenAPI), `@sanchay/authz`, `@sanchay/pii`, `@sanchay/ui`, `@sanchay/domain`. |
| Cost for 2 devs | Lowest. | One more Next app and one more ECS service, roughly a few hundred ₹k per year. Negligible next to the isolation gained. |

**Backend shape:**

| Item | Decision |
|---|---|
| Nest root modules | `PublicAppModule` (investor API, webhooks) and `AdminAppModule` (admin controllers under `/api/admin/v1/*`). Both import the shared domain modules (catalogue, orders, kyc, audit, …). Admin controllers live in `apps/api/src/admin/**` and are **only** registered in `AdminAppModule`. A CI lint rule forbids importing `src/admin/**` from the public module. |
| Deploy | Two ECS Fargate services from the same image with different commands (`node dist/main.js`, `node dist/main-admin.js`). |
| Routing | ALB host `ops.sanchay.in`: `/api/*` goes to admin-api and everything else to admin-web. WAF IP-set is applied to this host rule. No CORS, because it is same-origin. |
| DB access | admin-api uses a separate Postgres role, `sanchay_admin`. The audit table grants INSERT/SELECT only; no UPDATE/DELETE to any role (see §4.1). |
| Why this is needed (v1 lesson) | In v1, ADMIN was a `DistributorRole` value on the `distributors` table, and public signup accepted a client-supplied `role` including `ADMIN` (`BE/service/AuthService.java:77`, `BE/dto/AuthSignupRequest.java:23`). Investor and distributor JWTs shared one HS256 secret, told apart only by a `typ` claim (`BE/service/JwtService.java:29-30`). Admin and investor also shared one SPA route tree (`FE/App.tsx:301-314`). |

---

## 2. Admin authentication

### 2.1 Identity lifecycle

| Step | Rule |
|---|---|
| Bootstrap | One-off CLI `pnpm --filter @sanchay/api admin:bootstrap --email <e>`, run as an ECS task. It works **only when `admin_users` is empty**. It creates a SUPER_ADMIN in `INVITED` state, prints a single-use invite URL once to stdout, and writes the audit event `admin.bootstrap` (actor `SYSTEM`). This fixes v1, which had no seeded admin at all (`MIG/V3__seed_data.sql:10-35`, which seeds only MASTER_DISTRIBUTOR). |
| Invite | Needs `admin.users.manage`. Inputs: email (must match `@platizio.com`), display name, roles. This is **maker-checker**: a second SUPER_ADMIN approves. On approval the system sends an invite email with a single-use link (256-bit token, SHA-256 hashed at rest, valid 24 h). |
| Activation | The invitee sets a password, enrols TOTP (QR plus manual key), confirms 2 consecutive codes, and downloads 10 recovery codes. There is no access before TOTP is enrolled. |
| No self-signup | No public signup endpoint exists on admin-api. |
| Role change | Maker-checker. Removing a role is single-actor because it reduces risk. |
| Disable / offboard | Single actor (SUPER_ADMIN). All sessions are revoked immediately and pending maker requests from that user are cancelled. Audit `admin.user.disabled`. |
| Access review | Quarterly report of users × roles × last login × permissions used. COMPLIANCE attests on screen (`admin.access_review.attest`). Users idle for 45 days are auto-disabled. |

### 2.2 Credentials and MFA

| Control | Value |
|---|---|
| Password hash | Argon2id (m=64 MiB, t=3, p=1), via `@node-rs/argon2`. |
| Password policy | Minimum 12 characters, maximum 128. Rejected if in a bundled offline breached/common list (top 100k; no external call). No forced rotation. Change is forced if compromise is suspected. |
| Second factor | TOTP per RFC 6238 (SHA-1, 6 digits, 30 s, ±1 step window) is mandatory for every user. The secret is envelope-encrypted with AWS KMS. The last accepted time-step is stored to block replay. |
| Recovery | 10 single-use recovery codes (Argon2id hashed). Using one triggers an alert to all SUPER_ADMINs. A TOTP reset needs another SUPER_ADMIN (maker-checker) and forces re-enrolment. |
| WebAuthn / passkey | Phase 2 (post-launch) as an alternative second factor. The schema is reserved now (`admin_webauthn_credentials`). |
| Lockout | 5 failed password or TOTP attempts in 15 min locks the account for 15 min and alerts. 20 failures in 24 h keeps it locked until a SUPER_ADMIN unlocks it. Per-IP rate limit on `/api/admin/v1/auth/*` is 10 per minute (the v1 Bucket4j pattern from `LoginRateLimitFilter`, ported to `@nestjs/throttler` with a Redis store). |
| "Remember this device" | Not offered. TOTP is required on every login. |

### 2.3 Sessions

| Control | Value | Basis |
|---|---|---|
| Token type | Opaque 256-bit session id; only its SHA-256 is stored in `admin_sessions`. **Not a JWT**, so revocation and concurrency limits are immediate. | v1 investor JWT had no refresh and needed a jti blocklist. |
| Cookie | `__Host-sanchay_ops`: Secure, HttpOnly, `SameSite=Strict`, `Path=/`. | |
| CSRF | SameSite=Strict **plus** a double-submit header `X-CSRF-Token` on every non-GET request. | |
| Idle timeout | 15 min (the UI warns at 13 min). | Stricter than NIST SP 800-63B-4 AAL2's ≤1 h. |
| Absolute timeout | 10 h, then full re-login. | NIST AAL2 ≤24 h. |
| Concurrent sessions | Maximum 2 per admin. A third login evicts the oldest, which gets a notice banner. | |
| Step-up auth | A fresh TOTP (valid 5 min) is required for: PII reveal, maker-checker approve, webhook bulk replay, order status override, feature flag change in prod, legal doc publish, DSR erasure execute, admin user/role/IP-list changes, and any export containing row-level data. | |
| Session binding | IP and UA are stored at login. If the IP changes mid-session, step-up is forced on the next request and an alert is raised. | |
| Session screen | Admins see their own sessions. SUPER_ADMIN sees all and can revoke any, with reason. | |

### 2.4 IP allow-list

| Field / setting | Detail |
|---|---|
| Layers | (1) AWS WAF IP-set on the `ops.sanchay.in` host rule, the coarse layer. (2) An app-level check in an `AdminIpGuard` against `admin_ip_allowlist`, the fine layer that supports per-role and per-user rules. |
| Entry fields | `cidr` (IPv4 or IPv6), `label` (e.g. "Office Pune", "VPN egress"), `scope` (GLOBAL \| ROLE:<role> \| USER:<id>), `expires_at` (optional, for temporary travel), `created_by`. |
| Mode | `OFF` \| `MONITOR` (log and alert only) \| `ENFORCE`. **Prod default: ENFORCE.** Staging: MONITOR. |
| Changes | Maker-checker, with step-up. Audit `admin.ip_allowlist.changed` with before/after. |
| Break-glass | One sealed break-glass SUPER_ADMIN account, exempt from the IP list but not from TOTP. Its credentials are kept offline by the directors. Any login pages everyone and forces a post-incident review. |
| Remote staff | Recommend a VPN with a fixed egress IP (AWS Client VPN or equivalent) rather than per-home-IP entries. |

---

## 3. RBAC

### 3.1 Roles

| Role | Purpose | Hard limits |
|---|---|---|
| **SUPER_ADMIN** | Platform owner: admin users, security settings, global config. Universal checker, never for their own request. | Reveals PII only with a reason, like everyone else. Cannot bypass maker-checker. Should be held by 2–3 people at most. |
| **OPS** | Day-to-day operations: exception queues, reconciliation, NAV/jobs, catalogue curation (maker), webhook replay. | Cannot publish legal docs or approve their own overrides. PII reveal limited to fields needed for reconciliation (bank last 4 is already shown; full account number by reason). |
| **COMPLIANCE** | Regulatory owner: checker for sale enablement, fund facts, legal docs, notification templates (regulated categories), DSR erasure, ARN/EUIN config. Owns grievances, PEP/EDD decisions, audit export, access review. | No platform-security admin. |
| **SUPPORT** | Investor-facing help: investor 360 (masked), limited reveal (contact fields), login lock/unlock, force logout, resend notices, create cases. | No reconciliation writes, no catalogue, no flags, no exports. Reveal quota 20 per day. |
| **CONTENT** | Editorial: collections, fund-facts drafts, notification template drafts, legal doc drafts (copy-editing). | Sees no investor data at all. |
| **ENGINEER** | On-call tech: jobs, webhook and FP API logs (redacted), replay, feature flags (maker in prod). | No investor PII reveal. Raw payload reveal only with reason. |
| **AUDITOR** | Read-only for internal or external audit and CSCRF audit: audit log, configs, reports (aggregate), legal doc history, access reviews. | No PII reveal, no writes. Accounts are time-boxed (`expires_at` required, 30 days maximum). |

A user may hold several roles, and effective permissions are the union. **Roles and permissions are defined in code** (`packages/authz/src/roles.ts`, versioned in git and shared by the Nest guards and admin UI menu gating). Only user→role *assignment* is stored in the DB. There is no custom-role editor at launch, deliberately, to keep the model auditable.

### 3.2 Permission matrix

Legend: **F** = full (single actor), **M** = maker (creates a request), **C** = checker (approves another user's request), **R** = read, **Rm** = read with PII masked, **Rv** = read masked plus reveal with reason, **—** = none.

| Permission | SUPER_ADMIN | OPS | COMPLIANCE | SUPPORT | CONTENT | ENGINEER | AUDITOR |
|---|---|---|---|---|---|---|---|
| `admin.users.read` | F | — | R | — | — | — | R |
| `admin.users.manage` (invite, role add, TOTP reset) | M/C | — | — | — | — | — | — |
| `admin.users.disable` / `admin.roles.remove` | F | — | — | — | — | — | — |
| `admin.sessions.revoke` (others) | F | — | — | — | — | — | — |
| `admin.ip_allowlist.manage` | M/C | — | — | — | — | — | R |
| `admin.access_review.attest` | R | — | F | — | — | — | R |
| `catalogue.read` | R | R | R | R | R | R | R |
| `catalogue.curate` (category map, flags, collection membership) | F | F | F | — | F (collections only) | — | — |
| `catalogue.sale.enable` (risk-increasing) | C | M | C | — | — | — | — |
| `catalogue.sale.halt_or_disable` (risk-reducing) | F | F | F | — | — | — | — |
| `catalogue.collections.publish` | C | — | C | — | M | — | — |
| `amc.registry.manage` (empanelment) | C | M | C | — | — | — | R |
| `fundfacts.read` | R | R | R | R | R | R | R |
| `fundfacts.draft` (single or CSV import) | F | F | F | — | F | — | — |
| `fundfacts.publish` | C | — | C | — | — | — | — |
| `jobs.read` (NAV and other syncs) | R | R | R | — | — | R | R |
| `jobs.rerun` (idempotent syncs) | F | F | — | — | — | F | — |
| `nav.backfill.apply` / `nav.validation.override` | C | M | C | — | — | M | — |
| `calendar.holidays.manage` | C | M | C | — | — | — | R |
| `investor.search` / `investor.read` | Rm | Rm | Rm | Rm | — | — | — |
| `investor.pii.reveal` | Rv | Rv (bank/folio/contact) | Rv (all) | Rv (contact only) | — | — | — |
| `investor.login.lock_unlock` / `investor.sessions.revoke` | F | F | F | F | — | — | — |
| `investor.notes.write` / `cases.create` | F | F | F | F | — | — | — |
| `investor.transactions.freeze` (compliance hold) | C | — | M/F* | — | — | — | — |
| `investor.account.close` | C | M | C | M | — | — | — |
| `kyc.queue.read` | R | R | R | Rm | — | — | R |
| `kyc.queue.act` (retry, request investor action, resolve) | F | F | F | — | — | — | — |
| `kyc.decision` (PEP/EDD approve, onboarding reject, bank name-match override) | C | M | M/C | — | — | — | — |
| `orders.queue.read` | R | R | R | Rm | — | R (ids only) | R |
| `orders.reconcile.sync` (pull authoritative FP state, re-drive) | F | F | — | — | — | F | — |
| `orders.status.override` | C | M | C | — | — | — | — |
| `orders.cancel_at_provider` | C | M | C | — | — | — | — |
| `webhooks.read` | R | R | R | — | — | R | R |
| `webhooks.replay.single` | F | F | — | — | — | F | — |
| `webhooks.replay.bulk` (>50 events) | C | M | — | — | — | M | — |
| `fpapi.read` (redacted) | R | R | R | — | — | R | R |
| `fpapi.raw.reveal` | Rv | — | Rv | — | — | Rv | — |
| `audit.read` | R | R (own actions and operational entities) | R | — | — | R (system/tech events) | R |
| `audit.export` / `audit.chain.verify` | F | — | F | — | — | — | F |
| `legal.read` | R | R | R | R | R | R | R |
| `legal.draft` | F | — | F | — | F | — | — |
| `legal.publish` | C | — | M/C | — | — | — | — |
| `templates.draft` | F | F | F | — | F | — | — |
| `templates.publish.transactional_regulatory` | C | — | C | — | M | — | — |
| `templates.publish.marketing` | F | — | C | — | M | — | — |
| `flags.read` | R | R | R | — | — | R | R |
| `flags.toggle.nonprod` | F | F | — | — | — | F | — |
| `flags.toggle.prod` | M/C | M | C | — | — | M | — |
| `killswitch.engage` (e.g. halt all purchases) | F | F | F | — | — | F | — |
| `killswitch.release` | C | M | C | — | — | M | — |
| `reports.read.aggregate` | R | R | R | — | — | — | R |
| `reports.export.rowlevel` (contains PII) | C | M | M/C | — | — | — | — |
| `dsr.read` | R | — | R | Rm | — | — | R |
| `dsr.process` (intake, verify, access/correction) | F | — | F | F (intake only) | — | — | — |
| `dsr.erasure.execute` | C | — | M/C | — | — | — | — |
| `distribution.config.manage` (ARN/EUIN) | C | — | M | — | — | — | R |
| `grievance.manage` | F | R | F | F (log/respond) | — | — | R |
| `cas.jobs.read` / `cas.jobs.reparse` | F | F | R | Rm / F | — | R | — |

\* COMPLIANCE may freeze single-actor in an emergency (legal order, fraud, death intimation), because freezing reduces risk. **Unfreezing** is maker-checker.

### 3.3 Separation-of-duties rules (enforced server-side)

1. **Risk-increasing actions are maker-checker. Risk-reducing actions are single-actor.** Examples of risk-increasing: enable for sale, publish, override, release kill switch, grant role, erase, row-level export. Examples of risk-reducing: halt sale, engage kill switch, lock login, freeze, disable admin.
2. `approver_id ≠ requester_id`. Enforced by a DB CHECK and by the service.
3. The approver must hold the `C` permission **at decision time**. Roles are re-evaluated; nothing is cached from request time.
4. Requests expire after 24 h (legal-doc publish: 7 days). Execution uses the **frozen payload and its SHA-256**. If the target entity changed since request time (entity `version` mismatch), execution is refused and the maker must resubmit. This is the v1 freeze-hash-consume pattern from `TransactionApprovalService` (synthesis §2), without the v1 timestamp-precision bug: hash only DB-persisted canonical JSON.
5. Every 403 writes `authz.denied` (actor, permission, route). More than 5 denials in 10 min from one actor triggers an alert.

---

## 4. Cross-cutting mechanisms

### 4.1 Audit log (applies to every screen)

| Aspect | Specification |
|---|---|
| Table | `audit_events`, append-only. Owner role revokes UPDATE/DELETE/TRUNCATE from all roles, and a `BEFORE UPDATE OR DELETE` trigger raises an exception. Monthly partitions. |
| Columns | `id uuidv7`, `occurred_at timestamptz`, `actor_type` (ADMIN\|INVESTOR\|SYSTEM\|PROVIDER), `actor_id`, `actor_roles text[]` (snapshot), `session_id`, `ip inet`, `user_agent`, `request_id` (port of v1 `CorrelationIdFilter`, `X-Request-ID`), `action` (dotted verb such as `catalogue.sale.enabled`), `entity_type`, `entity_id`, `reason_code`, `reason_text`, `approval_request_id`, `before jsonb` (redacted), `after jsonb` (redacted), `metadata jsonb`, `prev_hash`, `hash`. |
| Integrity | `hash = SHA-256(prev_hash ‖ canonical_json(row minus hash))`, one chain per day, inserted under `pg_advisory_xact_lock`. A nightly job writes the day's chain head to an S3 bucket with **Object Lock (compliance mode, 8 years)** in ap-south-1. A "Verify chain" button recomputes a date range. |
| Transactionality | Written in the **same DB transaction** as the business change (v1 `AuditService.log` joins the caller's transaction, `BE/service/AuditService.java:38`). Failure bookkeeping uses an independent transaction (v1 `logIndependently`, `:68`). |
| PII rule | `before`/`after` pass through `@sanchay/pii` redaction (port of v1 `PiiRedactor` key rules). **Values of revealed PII are never written.** Only field names are recorded. A CI test scans for PAN, email and mobile shapes, as v1's M1-10 check did (0/242 rows). |
| Read auditing | Investor search, investor 360 open, PII reveal, raw payload reveal, every export, and audit export itself are audited. |
| Retention | 8 years (A6): 13 months hot in Postgres, then Parquet in S3 (Object Lock), queryable via Athena. |
| Streaming | Security-relevant actions (`admin.*`, `authz.denied`, `pii.revealed`, `flags.prod.*`, `killswitch.*`, `dsr.erasure.*`) go to CloudWatch Logs, then metric filters and SNS alerts to the ops email/Slack. |

### 4.2 PII masking and reveal

| Field | Default display | Revealable by | Notes |
|---|---|---|---|
| Name | Full | n/a | Needed to identify the caller. |
| PAN | `******234F` (last 4) | SUPPORT ✗, OPS ✓, COMPLIANCE ✓ | Searchable by **full PAN via HMAC-SHA256 blind index**, so support can find an investor without seeing the PAN. |
| Mobile | `******3210` | SUPPORT ✓, OPS ✓, COMPLIANCE ✓ | Blind-index search. |
| Email | `r•••••@gmail.com` | SUPPORT ✓, OPS ✓, COMPLIANCE ✓ | Blind-index search. |
| DOB | Year only | COMPLIANCE ✓ | |
| Address | City, state, first 3 digits of PIN | COMPLIANCE ✓ | |
| Bank a/c | `XXXX6789` + IFSC bank code (first 4) | OPS ✓, COMPLIANCE ✓ | |
| Nominee name / ID | Initials / last 4 | COMPLIANCE ✓ | |
| Aadhaar | **Never stored beyond last 4 from DigiLocker. Never revealable.** | — | |
| Folio number | Full | n/a | Operational id, not identity PII. |
| FP / KRA raw payloads | Redacted view | ENGINEER/OPS/COMPLIANCE via `fpapi.raw.reveal` | Raw payload kept encrypted for 30 days only. |

**Reveal flow:**
1. The admin clicks "Reveal", selects fields, picks a reason code and writes free text of at least 15 characters (ticket or case id optional, required for `OTHER`).
2. Reason codes: `INVESTOR_CALL_VERIFICATION`, `GRIEVANCE`, `KYC_EXCEPTION`, `RECONCILIATION`, `DSR_FULFILMENT`, `REGULATORY_REQUEST`, `FRAUD_INVESTIGATION`, `OTHER`.
3. Step-up TOTP is required.
4. Values display for 120 s, then re-mask. They are not in the DOM before reveal; the API returns masked data by default, and `POST /investors/:id/reveal` returns only the chosen fields.
5. Audit `pii.revealed` records the field list and reason, never the values.
6. Quotas: SUPPORT 20 per day, OPS 50 per day, COMPLIANCE 100 per day. Hitting 80% of quota alerts COMPLIANCE.

Storage recommendation, a decision for synthesis Risk #9: PAN, mobile, email, DOB, bank account and nominee id are stored **envelope-encrypted (AWS KMS data key, AES-256-GCM)** with blind indexes. v1 stored all of this in plaintext (synthesis §3).

### 4.3 The case/queue engine (shared by §5.7, §5.8, §5.9, §5.16, §5.18, §5.19)

One `ops_cases` table: `id`, `queue` (KYC\|ORDER\|PAYMENT\|MANDATE\|SIP\|WEBHOOK\|DSR\|GRIEVANCE\|CAS\|FUND_DATA), `case_type`, `severity` (P1–P4), `entity_type`, `entity_id`, `investor_id`, `status` (OPEN\|IN_PROGRESS\|WAITING_INVESTOR\|WAITING_PROVIDER\|PENDING_APPROVAL\|RESOLVED\|CLOSED), `assignee_id`, `sla_due_at` (business-day aware via the holiday calendar), `dedupe_key` (unique while open), `resolution_code`, `resolution_note`, `provider_ticket_ref`, timestamps.

Cases are auto-created by detectors (cron plus event hooks) and can also be created manually. Common actions on every queue: claim, assign, comment, change severity, link a provider ticket, resolve with a code, reopen. All are audited as `case.*`.

### 4.4 Exports

- CSV/XLSX exports go through an async job: an `export_jobs` row, then a file in S3 encrypted with SSE-KMS, then a download link valid 15 min, once only.
- Aggregate exports are single-actor. Row-level exports containing PII are maker-checker and watermarked with the requester's id, timestamp and reason.
- Everything is audited. There are no email attachments; notifications carry links only.

---

## 5. Screens

Each screen below lists fields, actions, the permission required and the audit event written. Detail views and actions are `/api/admin/v1/...` REST resources under the same guards.

### 5.0 Ops home

| Widget | Source | Permission |
|---|---|---|
| Open cases by queue × severity, SLA breaches | `ops_cases` | Any role with the queue's read permission |
| NAV freshness: last successful AMFI run, count of for-sale schemes with a stale NAV | `nav_sync_runs`, `scheme_navs` | `jobs.read` |
| FP health: error rate and p95 latency in the last 15 min, token refresh failures | `provider_api_calls` | `fpapi.read` |
| Webhooks: failed or unmatched in the last 24 h | `webhook_events` | `webhooks.read` |
| Kill-switch states (red banner if any is engaged) | `feature_flags` | All |
| Pending maker-checker approvals for me | `admin_approval_requests` | Holders of a C permission |
| ARN expiry countdown | `distribution_config` | COMPLIANCE, SUPER_ADMIN |

No PII appears on the home screen.

### 5.1 Admin users, roles, sessions, IP list

| Screen | Fields | Actions (permission → audit) |
|---|---|---|
| Admin users | email, name, roles, status (INVITED\|ACTIVE\|LOCKED\|DISABLED), TOTP enrolled, last login (time, IP), created by, expiry (AUDITOR) | Invite (`admin.users.manage`, M/C → `admin.user.invited`); add role (M/C → `admin.role.granted`); remove role (F → `admin.role.revoked`); disable (F → `admin.user.disabled`); unlock (F → `admin.user.unlocked`); reset TOTP (M/C → `admin.totp.reset`) |
| My security | password change, TOTP re-enrol, recovery code regeneration, my sessions | Self → `admin.self.*` |
| Sessions | user, created, last seen, IP, UA, geo (city from IP) | Revoke (`admin.sessions.revoke` → `admin.session.revoked`, reason required) |
| IP allow-list | see §2.4 | M/C → `admin.ip_allowlist.changed` |
| Access review | quarter, user × roles × last login × permissions exercised (from audit) | Attest (`admin.access_review.attest` → `admin.access_review.attested`) |

### 5.2 Fund catalogue curation

**Data sources:**
- Cybrilla FP scheme plans (`/v2/mf_scheme_plans/cybrillapoa`): ISIN, `plan_type`, option, min amounts and SIP thresholds, lock-in (synthesis §6, G1).
- AMFI NAVAll.txt section headers, which carry the AMFI category string (e.g. "Open Ended Schemes(Equity Scheme - Large Cap Fund)").
- Admin curation.

A nightly `catalogue.sync_fp` job upserts `schemes` (read-only source columns). New plans land as `DRAFT`.

**List view columns:** ISIN, scheme name, AMC, plan type (REGULAR/DIRECT), option (Growth/IDCW-payout/IDCW-reinvest), SEBI category (mapped), sale status, allowed transactions (L/S/SwI/STP-in/SWP), readiness (✓/✗ with reasons), facts freshness, last NAV date, collections.

**Filters:** AMC, category, plan type, sale status, readiness failures, "unmapped category", "stale facts".

**Scheme detail fields:**

| Group | Fields | Editable? |
|---|---|---|
| Source (FP/AMFI) | ISIN, FP scheme-plan id, AMFI scheme code, name, AMC, `plan_type`, option, min lumpsum, min additional, min SIP (by frequency), SIP dates allowed, lock-in, purchase/redemption/switch allowed flags from FP, last synced | No (sync only) |
| Classification | `sebi_category_id` (FK to taxonomy), `auto_suggested_category_id` plus match confidence, `display_name` (plain-language), `tax_class` (EQUITY_ORIENTED\|OTHER, derived from category, overridable by COMPLIANCE), `is_elss` (derived) | Yes |
| Sale control | `sale_status`, `lumpsum_enabled`, `sip_enabled`, `switch_in_enabled`, `stp_in_enabled`, `swp_enabled`, `max_lumpsum_per_investor_per_day` (for AMC subscription caps, e.g. small-cap inflow limits), `halt_reason`, `halt_until` | Yes |
| Merchandising | `search_keywords`, `popularity_rank_override` (null by default) | Yes |

**Sale-status state machine:** `DRAFT → READY` (auto, when the readiness checks below pass) `→ ENABLED` (maker-checker). From `ENABLED` it can go to `PURCHASE_HALTED` (single-actor; redemptions still work) or `DISABLED` (single-actor; no new purchases or SIPs, and existing SIP instalments continue unless also halted at FP). `DELISTED` is set on merger or wind-up and removes the scheme from search while holdings remain visible.

**Readiness checks** (all must pass before `ENABLED`; also enforced with DB constraints where possible):

| # | Check | Why |
|---|---|---|
| R1 | `plan_type = 'REGULAR'`. DB CHECK: `sale_status IN ('ENABLED','PURCHASE_HALTED') ⇒ plan_type = 'REGULAR'`. | Locked decision 2: regular plans only. DIRECT plans are kept only to map CAS-imported external holdings. |
| R2 | ISIN matches `^INF[A-Z0-9]{9}$` and an FP scheme-plan id exists with purchase allowed | v1 `orderableScheme.ts` rule (synthesis §5) |
| R3 | SEBI category mapped (against the active taxonomy version) | Allocation, cutoffs, ELSS lock-in, tax class all depend on it |
| R4 | AMC is **empanelled** with the platform ARN (`amc_registry.empanelment_status = ACTIVE`) | An MFD must be empanelled to receive trail commission |
| R5 | Published fund facts exist for: riskometer, TER, exit load, benchmark, SID URL, KIM URL. Riskometer as-of within 75 days. | Disclosure on the product page |
| R6 | A NAV exists and was published within the last 5 business days | A purchase without a NAV context breaks the investor UI |

**Actions:**

| Action | Permission | Audit |
|---|---|---|
| Map / confirm category (single or bulk-accept auto-suggestions) | `catalogue.curate` | `catalogue.category.mapped` (before/after) |
| Edit allowed transaction types or limits | `catalogue.curate` if it reduces what is allowed; `catalogue.sale.enable` (M/C) if it enables | `catalogue.txn_flags.changed` |
| Request enable for sale (single or bulk, max 200 per request) | `catalogue.sale.enable` M, then C | `catalogue.sale.enable_requested` / `…enabled` |
| Halt purchases / disable (reason required, optional `halt_until`) | `catalogue.sale.halt_or_disable` | `catalogue.sale.halted` / `…disabled` |
| Re-sync this scheme from FP now | `catalogue.curate` | `catalogue.scheme.resynced` |
| Manage collections | see below | |

**SEBI taxonomy screen** (`sebi_categories`, versioned):
- Fields: `taxonomy_version` (`SEBI_2017` \| `SEBI_2026`; SEBI_2026 is active from 2026-04-01 per synthesis §10), code, asset class (Equity/Debt/Hybrid/Solution-Oriented/Other — Index/ETF/FoF), sub-category name, `amfi_header_aliases[]` (strings matched against NAVAll headers for auto-mapping), `is_elss`, `lock_in_months`, `cutoff_profile` (STANDARD_3PM \| LIQUID_OVERNIGHT_130PM \| OVERNIGHT_REDEMPTION_ONLINE_7PM), `tax_class_default`, `display_order`.
- Editing needs `catalogue.curate` with a COMPLIANCE checker on publish of a taxonomy version. Audit `taxonomy.version.published`.

**Collections** (e.g. "Tax-saving (ELSS)", "Index funds", "SIP from ₹100"):

| Field | Rule |
|---|---|
| name, slug, description, icon, display order, active window (from/to) | |
| `type` = `RULE` (filter-defined: category ∈, min SIP ≤, AUM ≥, TER ≤) \| `MANUAL` (explicit list) | **RULE is the default.** MANUAL lists need a COMPLIANCE checker, because hand-picked lists can look like advice to an execution-only MFD. |
| `sort` (AUM desc \| name \| 3Y return desc) | "Return" sorts must show the as-of date and the standard risk disclaimer |
| `disclaimer_key` → legal doc snippet (e.g. "Not a recommendation. Mutual fund investments are subject to market risks…") | Mandatory |
| Banned words linter: "best", "guaranteed", "safe", "assured", "top-rated" | Blocks publish |

Actions: draft (CONTENT) → publish (COMPLIANCE C). Audit `collection.published`. Membership is always limited to `ENABLED` schemes.

**AMC registry:** AMC name, AMFI AMC code, empanelment status (ACTIVE/PENDING/TERMINATED), empanelment date, agreement document link (S3), commission structure reference (for the commission-disclosure doc), `purchase_halted` (AMC-wide halt). Maker OPS, checker COMPLIANCE. Audit `amc.empanelment.changed`.

### 5.3 Fund-facts entry (behind a pluggable `FundFactsProvider`)

**Model:** `fund_facts` is **bitemporal**. Each row holds one fact for one scheme and records:

| Column | Meaning |
|---|---|
| `scheme_id`, `fact_key` | Which scheme and which fact |
| `value jsonb` (typed per key) | The fact itself |
| `as_of_date` | Date the source states the fact is true |
| `effective_from` | When it starts showing to investors |
| `recorded_at` | When we entered it |
| `source` | `AMFI` \| `AMC_FACTSHEET` \| `AMC_SID` \| `AMC_KIM` \| `AMC_ADDENDUM` \| `CYBRILLA` \| `VENDOR:<name>` \| `MANUAL` |
| `source_url`, `source_doc_sha256` (optional upload) | Provenance |
| `status` | `DRAFT \| PUBLISHED \| SUPERSEDED \| REJECTED` |
| `entered_by`, `verified_by`, `verified_at`, `notes` | Who did what |

Published rows are immutable. A correction creates a new row that supersedes the old one.

| `fact_key` | Value schema | Staleness warning / auto-action | Typical source |
|---|---|---|---|
| `ter_pct` | decimal(6,4), regular plan, incl. GST | Warn if as-of is more than 40 days old | AMFI TER disclosure / AMC |
| `riskometer` | enum `LOW \| LOW_TO_MODERATE \| MODERATE \| MODERATELY_HIGH \| HIGH \| VERY_HIGH` | Warn at >45 days (monthly evaluation + 10-day disclosure). **Auto `PURCHASE_HALTED` at >75 days** (flag `facts.auto_halt_stale_riskometer`, default ON). | AMC/AMFI monthly disclosure |
| `benchmark` | `{name, tier:1\|2, riskometer}` | Warn at >400 days | SID/addendum |
| `exit_load` | `[{from_days, to_days \| null, load_pct, condition_text}]` + `summary_text` | On change | SID/addendum |
| `aum_cr` | decimal(14,2) ₹ crore + `month` | Warn at >60 days | AMFI/AMC monthly |
| `fund_managers` | `[{name, since_date, is_primary}]` | On change | Factsheet |
| `sid_url` / `kim_url` | https URL + `last_verified_at` + HTTP status | Weekly link checker; a broken link raises a `FUND_DATA` case | AMC |
| `objective` | text ≤ 1000 | n/a | SID |
| `inception_date` | date | n/a | SID |
| `min_amounts`, `lock_in` | **read-only from FP**; displayed for comparison | n/a | CYBRILLA |

**Screens and actions:**

| Screen / action | Detail | Permission | Audit |
|---|---|---|---|
| Scheme facts panel | Current published value per key, as-of date, source link, history timeline, and pending drafts shown side by side with a diff | `fundfacts.read` | open not audited (non-PII) |
| Add/edit draft | Typed form with validation (e.g. TER 0–3%, exit load bands contiguous), source and URL required | `fundfacts.draft` | `fundfacts.draft.saved` |
| **Bulk CSV import** (monthly TER/riskometer/AUM updates for ~1,500 plans) | Upload, then a validation preview (row errors, changed vs unchanged, value deltas above a threshold such as TER Δ>0.25pp highlighted), then all rows are created as DRAFT in one batch | `fundfacts.draft` | `fundfacts.batch.imported` (row count, file SHA-256) |
| Publish (single or batch) | The checker sees the diff and source links, and can set `effective_from` (default now) | `fundfacts.publish` (C; maker ≠ checker) | `fundfacts.published` |
| Reject draft | Reason required | `fundfacts.publish` | `fundfacts.rejected` |
| Provider conflicts | If a `FundFactsProvider` (future Cybrilla production or vendor feed) returns a value different from the published MANUAL value, a `FUND_DATA` case opens. Admin picks which one wins. | `fundfacts.publish` | `fundfacts.conflict.resolved` |

**Provider precedence:** the newest `as_of_date` wins. On a tie, the order is `CYBRILLA/VENDOR > AMC_* > AMFI > MANUAL`. Anything automated still lands as DRAFT until a per-provider auto-publish flag is turned on after 2 clean monthly cycles.

### 5.4 Jobs and NAV sync monitor (includes holiday calendar)

**NAV run list** (port of v1 `nav_sync_runs`, `MIG/V74__create_scheme_navs.sql:129-143`, plus new columns):

| Column | Source |
|---|---|
| started_at, finished_at, status (RUNNING\|SUCCESS\|FAILED\|SKIPPED), rows_parsed, rows_matched, rows_written, max_nav_date, failure_reason | v1 |
| `feed` (AMFI_DAILY \| AMFI_HISTORY), `trigger` (SCHEDULE \| MANUAL \| BACKFILL), `triggered_by`, `validation_results jsonb` (floors: min rows 1000, cold-start match 0.10, regression ratio 0.5, max daily jump 25%, max future days 2 — synthesis §7), `duration_ms` | new |

**Other panels:**
- Freshness: for-sale schemes whose latest NAV date is before the previous business day; drill down to a list.
- Per-scheme NAV history chart with anomaly markers (jumps above 10%).
- Other jobs using the same `job_runs` table: `catalogue.sync_fp`, `orders.reconcile_nightly`, `sip.instalment_expectation`, `mandates.status_poll`, `cas.parse`, `facts.link_check`, `retention.purge`, `audit.anchor`.

**Actions:**

| Action | Rules | Permission | Audit |
|---|---|---|---|
| Re-run AMFI daily now | Idempotent, uses a Postgres advisory lock (v1 `PostgresAdvisoryLockService` pattern), max 1 per 5 min | `jobs.rerun` | `job.rerun_requested` |
| Historical backfill (date range, optional scheme list) | **Dry run is the default and returns a full report** (v1 `NavAdminController.java:65`, `dryRun=true` default). Apply is maker-checker when it writes derived units or overwrites NAV rows. | dry run: `jobs.rerun`; apply: `nav.backfill.apply` M/C | `nav.backfill.dry_run` / `nav.backfill.applied` |
| Override a validation floor for one run | E.g. an AMFI file that is legitimately short. Scoped to one run id and expires in 2 h. | `nav.validation.override` M/C | `nav.validation.overridden` |
| Re-run any other job | | `jobs.rerun` | `job.rerun_requested` |
| **Holiday calendar** | Fields: date, exchange/segment (MF business day), description, source URL. Drives cutoffs, SLAs, T+N. Import from a yearly AMFI/NSE list. | `calendar.holidays.manage` (M OPS, C COMPLIANCE) | `calendar.holiday.changed` |

**Alerts:**
- No successful AMFI daily run by 23:45 IST on a business day. AMCs must upload NAV to AMFI by 11 PM.
- More than 2% of for-sale schemes stale on the next morning at 09:00.

### 5.5 Investor lookup (investor 360)

**Search:** investor id, full PAN / mobile / email (blind index, exact match), FP investor-profile id, FP investment-account id, order id, folio number, payment reference. Results show name, masked PAN and masked mobile, status and KYC status. Audit `investor.searched` with the query type and the HMAC of the query, never the value. Rate limit: 60 per hour per admin.

**Header:** name, investor id, masked PAN, mobile and email, account status (ACTIVE \| LOGIN_LOCKED \| TXN_FROZEN \| CLOSED), onboarding step, KYC (KRA status, CKYC found, "KYC Validated" flag), risk flags (PEP, FATCA ≠ IN), created, last login, app platform/version.

| Tab | Content | Permission |
|---|---|---|
| Onboarding timeline | Each step with timestamps, provider refs, failures | `investor.read` |
| KYC | KRA source and status, CKYC no. (masked), DigiLocker result (name/DOB match ✓/✗, never the Aadhaar number), eSign status and doc id, FATCA/PEP declarations (version) | `investor.read` |
| Bank accounts | Masked a/c, IFSC, bank, penny-drop result, name-match score, primary flag, status | `investor.read` |
| Mandates | Type (UPI Autopay/eNACH), FP mandate id, limit, status, created/authorised, linked SIPs | `investor.read` |
| Nominees | Masked, allocation %, opt-out status and evidence | `investor.read` |
| Orders | All order types with platform status, FP status, 2FA evidence (approved/consumed timestamps), payment attempts, allotment NAV/units, **execution-only declaration version**, EUIN (blank) | `investor.read` |
| SIPs / STP / SWP | Registrations, next date, instalment history, pause/top-up history | `investor.read` |
| Holdings | Platform holdings (units, avg cost, current value, data quality), and **separately** CAS-imported external holdings | `investor.read` |
| Statements and tax | Generated capital-gains, transaction and ELSS statements (metadata plus regenerate) | `investor.read` |
| Communications | Notifications sent (template, version, channel, status). Body is not stored if it contained PII; it can be re-rendered on demand. | `investor.read` |
| Consents and legal | T&C/privacy/disclosure acceptances (doc key, version, SHA-256, time, IP), consent withdrawals | `investor.read` |
| Devices and sessions | Device model, OS, app version, last seen, push token present | `investor.read` |
| Cases | All cases, DSRs, grievances | `investor.read` |
| Audit | All audit events where `investor_id` = this investor | `audit.read` |

**Actions:**

| Action | Rules | Permission | Audit |
|---|---|---|---|
| Reveal PII | §4.2 | `investor.pii.reveal` | `pii.revealed` |
| Lock / unlock login | Reason code (SUSPECTED_TAKEOVER, INVESTOR_REQUEST, …) | `investor.login.lock_unlock` | `investor.login.locked` / `…unlocked` |
| Force logout (revoke all refresh tokens) | | `investor.sessions.revoke` | `investor.sessions.revoked` |
| Resend a notification or statement | Only to registered contacts. There is **no action to change investor contact details from admin**; the investor changes them in-app with OTP. | `cases.create` | `investor.notification.resent` |
| Internal note | ≤1000 characters, with a UI warning "no PII". Immutable once saved. | `investor.notes.write` | `investor.note.added` |
| Compliance freeze / unfreeze (blocks new purchases, SIPs, switches; redemptions allowed unless the legal order says otherwise) | Reason: LEGAL_ORDER, FRAUD, DEATH_INTIMATION, KYC_REVOKED | freeze: F (COMPLIANCE); unfreeze: M/C | `investor.txn.frozen` / `…unfrozen` |
| Close platform account | Allowed only with no pending orders and no active SIPs, mandates cancelled. Units remain at the RTA and the investor is told so. | `investor.account.close` M/C | `investor.account.closed` |
| **Not provided, by design** | Editing KYC fields (the KRA is the source of truth), marking KYC verified, adding bank accounts, placing orders on the investor's behalf (no distributor actor) | — | — |

### 5.6 KYC and onboarding exception queue

| `case_type` | Detector | SLA | Allowed resolutions |
|---|---|---|---|
| `KRA_ON_HOLD` / `KRA_REJECTED` | KRA check result | 2 business days | Request investor action (redo via DigiLocker "KYC Validated" path or KRA modification), Resolve |
| `KRA_DATA_MISMATCH` (PAN name/DOB vs KRA) | Pre-verification | 2 bd | Request investor action, Reject onboarding (COMPLIANCE) |
| `CKYC_FETCH_FAILED` | Provider error | 1 bd | Retry, Resolve |
| `DIGILOCKER_FAILED` | Callback failure/timeout | 1 bd | Retry link, Request investor action |
| `ESIGN_FAILED` / `ESIGN_EXPIRED` | Callback | 1 bd | Regenerate eSign, Request investor action |
| `PENNY_DROP_FAILED` | BAV failure | 1 bd | Retry, Request another account |
| `BANK_NAME_MISMATCH` (score 60–79; ≥80 auto-accepts, <60 auto-rejects) | BAV name score | 2 bd | **Approve account (M OPS, C COMPLIANCE; evidence note required)**, Reject |
| `PEP_DECLARED` (self or relative) | Declaration | 3 bd | EDD approve (COMPLIANCE C) / Reject onboarding |
| `FATCA_NON_IN_RESIDENCY` | Declaration | n/a | Auto-reject with message (A3); case kept for record |
| `UNDERAGE` | DOB < 18 | n/a | Auto-reject (A3) |
| `FP_PROFILE_CREATE_FAILED` / `FP_INVESTMENT_ACCOUNT_FAILED` | FP API error | 4 business hours | Retry (idempotent), Escalate to Cybrilla |
| `ONBOARDING_STUCK_PROVIDER` (waiting on a provider callback >24 h) | Detector | 1 bd | Sync from provider, Retry |

**List fields:** case id, investor (name, masked PAN), case type, provider code/message, provider refs, created, age, SLA due, status, assignee.

**Actions:**
- Claim/assign (`kyc.queue.act`).
- Retry provider step (`kyc.queue.act` → `kyc.step.retried`).
- Request investor action: sends template `kyc.action_required` with a deep link to the exact step (`kyc.queue.act` → `kyc.investor_action_requested`).
- Decisions (`kyc.decision` → `kyc.decision.recorded`, with reason).
- Resolve (`case.resolved`).

**Invariant:** no endpoint sets KYC status to verified. KYC status changes come only from KRA/FP responses or webhooks.

### 5.7 Order, payment and mandate exception queue with reconciliation

**Detectors** (cron every 10 min plus event hooks; all business-day aware):

| `case_type` | Condition | Severity / SLA |
|---|---|---|
| `PAYMENT_PENDING_TIMEOUT` | Payment initiated, no terminal state after 30 min | P2 / 4 h |
| `PAID_NOT_SUBMITTED` | Payment success but the FP purchase is not in a submitted state after 15 min | **P1** / 1 h |
| `FAILED_AFTER_DEBIT` | Order failed or rejected after a successful debit, so a refund must be tracked | P1 / 1 bd; refund tracking to closure |
| `ALLOTMENT_OVERDUE` | Submitted, no allotment after T+2 business days (liquid/overnight T+1) | P2 / 1 bd |
| `REDEMPTION_PAYOUT_OVERDUE` | Redemption allotted, no payout confirmation after T+3 working days | P1 / same day |
| `MANDATE_AUTH_TIMEOUT` | UPI Autopay not authorised in 24 h / eNACH not in 5 business days | P3 / 2 bd |
| `MANDATE_REJECTED` / `MANDATE_REVOKED_EXTERNALLY` | FP/NPCI status | P3 |
| `SIP_INSTALMENT_FAILED` | Instalment failed (e.g. insufficient funds). After 3 consecutive failures the investor is notified of possible SIP cessation. | P3 |
| `SIP_INSTALMENT_MISSING` | Expected date + 3 business days with no instalment record | P2 |
| `SWITCH_STP_SWP_FAILED` | FP switch/STP/SWP leg failed | P2 |
| `STATE_MISMATCH` | Nightly reconcile: platform status ≠ FP authoritative status | P2 |
| `APPROVAL_NOT_CONSUMED` | 2FA approved but not consumed within 60 min (v1 validity window, synthesis §5). This was a real v1 dead end. | P2 |
| `UNITS_MISMATCH` | Platform units ≠ units in a newly imported CAS for the same folio (the CAS imports module feeds this) | P3 |

**Case detail view:**
- Order timeline: platform state transitions, FP calls (linked to §5.9), webhooks (linked to §5.8), payment attempts, and the 2FA challenge (created, approved, consumed).
- Side by side: platform record vs a **live "fetch from FP"** snapshot.
- Folio, amount, units, NAV date, and the cutoff profile applied.

**Reconciliation actions:**

| Action | Semantics | Permission | Audit |
|---|---|---|---|
| **Sync from FP** | GET the authoritative FP object and run the same idempotent state-transition function used by webhooks. Safe to repeat. | `orders.reconcile.sync` | `order.reconcile.synced` (from→to) |
| **Re-drive post-processing** | Re-run downstream effects (holding update, notification, statement) for the current state; idempotent by `(order_id, state, effect)` keys | `orders.reconcile.sync` | `order.effects.redriven` |
| **Manual status override** | Only when FP is unavailable or wrong and there is external evidence (RTA confirmation, bank statement). Requires evidence upload, reason code and maker-checker. **Moving to an allotted state requires a consumed investor 2FA approval or an explicit bypass reason** (port of v1 D9 rule, `BE/service/OrderService.java:1133-1170`, audit `ORDER_STATUS_FORCED_WITHOUT_APPROVAL`). | `orders.status.override` M/C | `order.status.overridden` |
| Cancel at provider | Only for investor-requested cancellation, before cutoff, where FP permits | `orders.cancel_at_provider` M/C | `order.cancelled_at_provider` |
| Record refund reference | UTR/ref, amount, date, then auto-close when matched | `orders.reconcile.sync` | `order.refund.recorded` |
| Notify investor | Pick a template from the `ORDER_*` set | `orders.reconcile.sync` | `investor.notification.sent` |
| Escalate to Cybrilla | Stores the provider ticket ref and moves the case to WAITING_PROVIDER | `orders.reconcile.sync` | `case.escalated` |
| Mandate: re-poll / cancel on investor request | FP `/api/pg/mandates` | sync F / cancel M/C | `mandate.*` |

**Nightly `orders.reconcile_nightly` job:**
- Scans all non-terminal orders, mandates and SIP registrations from the last 45 days against FP.
- Auto-applies transitions whose evidence is fully consistent (for example FP says successful and has units).
- Opens `STATE_MISMATCH` cases for everything else.
- Writes a summary `job_runs` row (checked, auto-fixed, cases opened).

### 5.8 Webhook event log and replay

This replaces v1's in-memory, per-instance dedupe (`BE/controller/CybrillaWebhookController.java:34-51`, "persistent dedupe store is still TODO").

| Field | Notes |
|---|---|
| id, received_at, provider (CYBRILLA_FP \| KRA \| PAYMENT \| DIGILOCKER \| ESIGN) | |
| `auth_result` (SECRET_OK \| SECRET_BAD \| HMAC_OK \| HMAC_BAD) | FP today uses a shared header secret only (v1 `:76-83` TODO(HMAC)) |
| event_type, object_type, object_id | |
| `dedupe_key` (UNIQUE) | provider + event id, or a hash of (object, type, timestamp) |
| `processing_status` | RECEIVED \| PROCESSED \| DUPLICATE \| IGNORED \| UNMATCHED \| FAILED |
| attempts, last_error, processed_at, linked `entity_type`/`entity_id` | |
| `payload_redacted jsonb` (kept 2 years), `payload_raw_encrypted` (kept 30 days) | |

**Processing model:**
1. Persist first, then return 200.
2. Process asynchronously (SQS or a pg-boss queue) with retry and backoff (5 attempts), then FAILED plus a `WEBHOOK` case.
3. Handlers treat webhooks as **triggers** and always fetch authoritative state from FP (the v1 BUG-047 pattern, `CybrillaWebhookController.java:108-111`). Replay is therefore safe.

**Actions:**
- Replay one event (`webhooks.replay.single` → `webhook.replayed`).
- Bulk replay by filter, with a dry-run count first; >50 events needs M/C (`webhooks.replay.bulk` → `webhook.bulk_replayed`, with count and filter).
- Mark IGNORED with a reason (`webhook.ignored`).
- Reveal raw payload (`fpapi.raw.reveal` → `payload.revealed`).

**Filters:** provider, type, status, date, object id, investor id.

### 5.9 FP API call log

This ports v1 `external_api_snapshots` (`MIG/V1__baseline_schema.sql:291-306`) and fixes its cleartext-PAN leak in `investor_identifier` (1,062/1,062 rows affected, per the 2026-09-03 compliance review, synthesis §11).

| Field | Notes |
|---|---|
| id, started_at, duration_ms, provider/audience (FP_TENANT \| CYBRILLA_POA), method, `path_template` (e.g. `/v2/mf_purchases/{id}`), operation | |
| http_status, success, `fp_error_code`, retry_no, `idempotency_key`, `request_id` (correlation) | |
| actor (investor/admin/system), entity ref, investor_id (FK, no PII) | |
| `request_redacted jsonb`, `response_redacted jsonb` (2 years); raw encrypted (30 days) | Redaction by **schema allow-list** (only listed keys kept), not by deny-list, so new fields cannot leak |

**Views:**
- Searchable log.
- Per-operation dashboard (volume, error %, p50/p95 latency, top error codes).
- Token refresh events.

**Actions:** view (`fpapi.read`, audit not required); reveal raw (`fpapi.raw.reveal` + reason → `payload.revealed`); export redacted CSV (`reports.read.aggregate` → `export.created`); "copy as cURL" with auth headers stripped.

**Explicitly not built:** a raw FP pass-through proxy. v1 `CybrillaDirectController` returned unredacted PAN, bank and IFSC with no audit row (compliance review :82, synthesis §11).

### 5.10 Audit log viewer

| Aspect | Spec |
|---|---|
| Filters | Date range (max 90 days per query, following v1 `BE/controller/AuditController.java:22`; paginate for more), actor (admin/investor/system), action prefix, entity type/id, investor id, request id, approval request id, reason code |
| Row view | Actor with role snapshot, IP, UA, action, entity, reason, approval link, **before/after diff** (redacted), hash ✓ |
| Actions | Verify chain for a range (`audit.chain.verify` → `audit.chain.verified`); export CSV (`audit.export` → `audit.exported`, step-up) |
| Scoping | OPS sees operational entities and its own actions. ENGINEER sees `system.*`, `job.*`, `webhook.*`, `flags.*`. COMPLIANCE, AUDITOR and SUPER_ADMIN see everything. |
| No mutations | There is no edit or delete UI or API. |

### 5.11 T&C, privacy and disclosure document versioning

v1 had no real T&C document anywhere, which was a compliance FAIL (synthesis §11).

**Document keys at launch:** `TERMS_OF_USE`, `PRIVACY_NOTICE` (DPDP notice, itemised by purpose), `RISK_DISCLOSURE`, `MFD_DISCLOSURE` (AMFI-registered MFD, ARN, "investments are subject to market risks…"), `COMMISSION_DISCLOSURE` (regular plans carry distributor commission; AMC-wise trail ranges), `EXECUTION_ONLY_DECLARATION`, `FATCA_CRS_DECLARATION`, `NOMINATION_OPT_OUT_DECLARATION`, `ESIGN_CONSENT`, `MANDATE_TERMS`, `GRIEVANCE_REDRESSAL_POLICY`, `COOKIE_POLICY`, plus `CONSENT_TEXT:<purpose>` snippets (KYC fetch, CKYC download, marketing, WhatsApp).

| Field | Rule |
|---|---|
| `doc_key`, `version` (semver), `locale` (`en` at launch; `hi` phase 2) | |
| `body_md` → rendered `body_html`, `content_sha256` | The hash is stored with each investor acceptance (port of v1 `consent_records`, `MIG/V59__add_consent_records.sql:5-19`) |
| `change_summary`, `is_material` | Material means investors must **re-accept** at next app open (blocking gate). Non-material means notify only. |
| `status` | DRAFT → IN_REVIEW → APPROVED → SCHEDULED → PUBLISHED → SUPERSEDED. PUBLISHED is immutable. |
| `effective_at` | Scheduled publish |
| `approved_by`, `published_by` | |

**Actions:**
- Draft/edit (`legal.draft` → `legal.draft.saved`).
- Diff against the published version.
- Submit for review.
- Approve and publish (`legal.publish` C, step-up → `legal.published`).
- Schedule.
- View acceptance stats (e.g. 92% re-accepted v2.1).
- Download evidence pack for an investor (all accepted versions with hashes; `legal.read` + investor reveal rules).

**Rollback:** publish the previous content as a new version. Versions are never un-published.

### 5.12 Notification templates

| Field | Rule |
|---|---|
| `template_key` (e.g. `order.purchase.confirmed`, `sip.instalment.failed`, `kyc.action_required`, `otp.login`), `category` (OTP \| TRANSACTIONAL \| REGULATORY \| SERVICE \| MARKETING) | Marketing sends only if a `marketing` consent is active |
| `channel` EMAIL \| SMS \| PUSH \| IN_APP (WhatsApp in phase 2) | |
| Email: subject, MJML/Handlebars body. SMS: body ≤ 160 GSM-7 chars preferred, **`dlt_template_id`, `dlt_entity_id`, `sender_header`** (TRAI DLT registration is required for Indian SMS). Push: title/body/deeplink. | The DLT id is validated before publish |
| `variables_schema` (zod JSON schema) | The renderer refuses missing variables. PAN and account numbers must be passed pre-masked; the linter blocks raw `pan`, `account_number`, `aadhaar` variables. |
| `version`, `status` (DRAFT/PUBLISHED/ARCHIVED), `locale` | |

**Actions:**
- Preview with sample data.
- Test-send to own staff address or phone only.
- Publish: TRANSACTIONAL, REGULATORY and OTP categories need a COMPLIANCE checker; MARKETING needs a COMPLIANCE checker too (per the matrix). Audit `template.published`.
- Rollback: republish a previous version.
- Delivery log: sent, bounced or failed by template, via provider callbacks.

### 5.13 Feature flags

Storage: a `feature_flags` table in Postgres, served through an OpenFeature-compatible provider in `@sanchay/flags`. No third-party flag SaaS, for data-residency reasons. Clients cache for 60 s; kill switches are pushed via short polling of 15 s.

| Field | Detail |
|---|---|
| `key`, description, `type` (BOOLEAN \| PERCENT_ROLLOUT \| ALLOW_LIST \| KILL_SWITCH \| VARIANT), `environment` (dev/staging/prod) | |
| Targeting: platform (web/android/ios), min app version, investor id allow-list (ids only), % rollout by hashed investor id | |
| owner, linked issue, `expires_at` (required for non-kill-switch flags; expired flags alert the owner) | |

**Predefined kill switches** (all default "enabled = true" for the capability):
- Journeys: `purchases.lumpsum`, `sip.registration`, `redemptions`, `switch`, `stp`, `swp`, `onboarding.new`.
- Rails: `payments.upi`, `payments.netbanking`, `mandates.upi_autopay`, `mandates.enach`.
- Other: `cas.import`, `facts.auto_halt_stale_riskometer`.

When a journey is halted the investor sees a friendly maintenance message with an ETA field. Redemptions have a separate switch and should practically never be halted, because halting them makes it an investor-harm event; that switch needs a COMPLIANCE checker to *engage* as well.

| Action | Permission | Audit |
|---|---|---|
| Toggle in dev/staging | `flags.toggle.nonprod` | `flag.changed` |
| Change in prod | `flags.toggle.prod` M/C, step-up | `flag.prod.changed` |
| Engage kill switch (not redemptions) | `killswitch.engage` F, reason required, broadcasts an alert | `killswitch.engaged` |
| Release kill switch | `killswitch.release` M/C | `killswitch.released` |

### 5.14 Reports

All reports are computed from platform tables (no PII in aggregate views), use IST day boundaries, and are business-day aware. Each report has a **metric-definition panel** so numbers are unambiguous.

| Report | Dimensions / metrics | Schedule |
|---|---|---|
| **Daily orders** | By type (lumpsum/SIP instalment/redemption/switch/STP/SWP), status, payment method, AMC, category: count, gross amount, units; failure-reason breakdown; cutoff-missed count | 07:00 IST email **link** (not attachment) to the ops list |
| **AUM** | Platform AUM = Σ(units × latest NAV) from `holdings_snapshot`, by AMC/category/tax class; month-on-month; NAV as-of date shown; DERIVED/estimated-unit holdings shown in a separate column (never mixed; synthesis §7) | Daily snapshot, monthly close |
| **SIP book** | **Active SIP definition (resolves v1's two conflicting definitions, synthesis G10): registration state ACTIVE at FP, not paused, not cancelled, not ceased, with the next instalment date in the future.** Counted separately: PAUSED, PENDING_MANDATE. Metrics: count, monthly-equivalent amount (quarterly ÷ 3), by instalment day and category; new/cancelled/paused this period; mandate coverage | Daily |
| **Failed payments** | By method, bank, failure reason code, time of day; retry success rate; SIP instalment failure rate | Daily |
| Onboarding funnel | Step conversion, median time per step, drop-off, KYC exception rate | Weekly |
| Queue SLA | Cases by queue: opened/closed/breached, ageing | Daily |
| Redemption payout TAT | Allotment to payout in business days; breaches of T+3 | Daily |
| DSR and grievance register | Counts by type/status, SLA (90-day DPDP limit) | Monthly (also for regulatory filings) |
| Distribution compliance | Orders by EUIN mode (should be 100% execution-only with a declaration captured); orders missing a declaration (must be 0) | Daily, alert if >0 |

Actions: view (`reports.read.aggregate`, no audit); export aggregate (audit `export.created`); row-level export (`reports.export.rowlevel` M/C → `export.rowlevel.created`).

Deferred post-launch: trail-commission reconciliation against CAMS/KFintech brokerage files.

### 5.15 Data-subject requests (DPDP access / correction / erasure)

**Intake channels:**
1. In-app "Privacy requests" form (authenticated).
2. Email to the grievance/DPO address. SUPPORT logs these, and identity must then be verified via OTP to the registered mobile or email before any processing.

| Field | Detail |
|---|---|
| `dsr_type` | ACCESS \| CORRECTION \| ERASURE \| CONSENT_WITHDRAWAL \| NOMINATE_REPRESENTATIVE \| GRIEVANCE |
| investor_id, channel, received_at, `identity_verified_at` + method | |
| `status` | RECEIVED → IDENTITY_VERIFIED → IN_PROGRESS → PENDING_APPROVAL (erasure only) → FULFILLED \| PARTIALLY_FULFILLED \| REJECTED → CLOSED |
| `due_at` | received + 90 days (DPDP Rules maximum). **Internal target 30 days.** |
| `data_inventory_snapshot jsonb` | Auto-generated list of data categories held for the investor, each with its **legal retention basis** and earliest erasure date |
| `outcome_note`, `legal_basis_for_refusal`, handled_by, approved_by | |

**Retention matrix** (drives erasure; seeded in the `retention_policies` table and editable by COMPLIANCE with maker-checker):

| Data category | Retain | Basis |
|---|---|---|
| KYC/identity records (PAN, KRA refs, CKYC no., address) | 5 years after relationship end (we keep 8 years, A6) | PMLA (Maintenance of Records) Rules |
| Transaction records, 2FA/consent evidence, execution-only declarations | 5 years after each transaction (we keep 8 years) | PMLA; SEBI record-keeping |
| Audit events | 8 years | A6 |
| Marketing consent, preferences, device push tokens, analytics ids | Erase on request or on consent withdrawal | DPDP |
| CAS-imported external holdings and parse data | Erase on request | Not a regulated record of ours |
| OTP rows, sessions | 30 days / on expiry | Operational |

**Workflow actions:**

| Action | Detail | Permission | Audit |
|---|---|---|---|
| Log intake / verify identity | | `dsr.process` | `dsr.received`, `dsr.identity_verified` |
| ACCESS: generate data package | JSON + PDF summary: data held, purposes, processors/fiduciaries shared with (Cybrilla FP, KRA, CKYC, RTAs, AMCs, payment gateway, SMS/email providers). Delivered in-app, link valid 7 days. | `dsr.process` | `dsr.access.fulfilled` |
| CORRECTION | Non-KYC fields (display name, communication preferences) are corrected by an admin. KYC fields are refused with guidance to use the KRA modification flow (the KRA is the source of truth); the investor is sent the deep link. | `dsr.process` | `dsr.correction.applied` / `…redirected` |
| ERASURE: plan | The system computes per category "erase now" / "retain until <date> (basis)" | `dsr.process` | `dsr.erasure.planned` |
| ERASURE: execute | M/C with step-up. Hard-deletes erasable categories. **Crypto-shreds** retained-but-expired data by destroying the per-investor data key. Schedules a future erasure job for retained categories. Revokes sessions and deactivates the account. | `dsr.erasure.execute` | `dsr.erasure.executed` (categories + counts, no values) |
| CONSENT_WITHDRAWAL | Flips consent flags. Downstream effects apply immediately (e.g. marketing suppression). | `dsr.process` | `consent.withdrawn` |
| Reject | Legal basis required | `dsr.process` (COMPLIANCE) | `dsr.rejected` |

The audit events themselves are retained and are **not** subject to erasure, because they hold no PII values by design (§4.1).

### 5.16 Distribution identity settings (ARN/EUIN)

This is needed because the platform ARN must be on every order (locked decision 2). In v1, ARN/EUIN never reached FP payloads (synthesis L4).

| Field | Rule |
|---|---|
| `arn` (`^ARN-\d{1,9}$`, v1 `ArnFormat.java:10`), ARN holder legal name, `arn_valid_from`, `arn_valid_until` (AMFI renewal cycle) | ARN is sent on every FP order payload |
| `euin_mode` | `EXECUTION_ONLY` (launch default: EUIN blank + investor execution-only declaration captured per order, doc `EXECUTION_ONLY_DECLARATION` version stored on the order) \| `EMPLOYEE_EUIN` (disabled at launch) |
| EUIN registry (for future assisted flows): employee, EUIN, NISM certificate no., valid until | Built, hidden behind a flag |
| `sub_broker_arn` | Null (not used) |

**Actions:** edit (`distribution.config.manage`, M COMPLIANCE, C SUPER_ADMIN → `distribution.config.changed`).

**Alerts:** ARN expiry at 90, 60, 30 and 7 days. **Automatic kill of all purchase journeys when the ARN is past `arn_valid_until`.** An EUIN whose NISM validity has expired is auto-disabled.

### 5.17 Grievance register (minimal, launch-required)

- Fields: id, investor, channel (in-app/email/phone/SCORES/AMC-forwarded), category (order, redemption, KYC, data/privacy, app, other), description, received_at, `due_at` (internal 7 days; DPDP grievances 90 days max), status, assignee, response text, closure proof, `external_ref` (SCORES id).
- Actions: log, respond (the response is sent via a template), escalate, close (`grievance.manage` → `grievance.*`). Monthly register export for compliance.

### 5.18 CAS import monitor

- Fields: job id, investor, source (CAMS/KFintech/NSDL/CDSL CAS PDF, upload or email-forward), received, parse status (QUEUED/PARSED/FAILED/PASSWORD_ERROR/UNSUPPORTED_FORMAT), folios found, schemes mapped vs unmapped (to ISIN / DIRECT-plan catalogue rows), error message, parser version.
- **The raw PDF is deleted immediately after a successful parse.** On failure it is kept 7 days, encrypted, for re-parse.
- Actions:
  - Re-parse with a newer parser (`cas.jobs.reparse` → `cas.reparsed`).
  - Map an unmapped scheme to an ISIN (`catalogue.curate` → `cas.scheme.mapped`).
  - Delete the investor's imported data (DSR path).
- `UNITS_MISMATCH` cases (§5.7) link here.

---

## 6. Data model (new admin/ops tables; Drizzle, PG18 `uuidv7()`)

| Table | Key columns |
|---|---|
| `admin_users` | id, email (unique, citext), name, password_hash, status, totp_secret_enc, totp_last_step, failed_attempts, locked_until, last_login_at/ip, expires_at, created_by |
| `admin_user_roles` | admin_user_id, role (enum from `@sanchay/authz`), granted_by, approval_request_id, granted_at |
| `admin_recovery_codes` | admin_user_id, code_hash, used_at |
| `admin_sessions` | id, token_hash, admin_user_id, created_at, last_seen_at, expires_at, ip, ua, step_up_at, revoked_at, revoked_reason |
| `admin_invites` | email, roles[], token_hash, expires_at, approval_request_id, consumed_at |
| `admin_ip_allowlist` | cidr, label, scope, expires_at, created_by |
| `admin_approval_requests` | id, action_key, entity_type/id, entity_version, payload jsonb, payload_sha256, reason, requested_by, status, decided_by, decided_at, decision_note, expires_at, executed_at, result jsonb. CHECK (decided_by <> requested_by). |
| `audit_events` | §4.1 (partitioned, append-only, hash chain) |
| `pii_reveal_events` | admin_user_id, investor_id, fields[], reason_code, reason_text, case_id, at (redundant with audit, for quota queries) |
| `ops_cases`, `ops_case_comments`, `ops_case_attachments` | §4.3 |
| `sebi_categories` | §5.2 |
| `schemes` (source) + `scheme_curation` | §5.2 (separating source from curated columns keeps sync writes clean) |
| `amc_registry` | §5.2 |
| `collections`, `collection_rules`, `collection_items` | §5.2 |
| `fund_facts` | §5.3 (bitemporal) |
| `job_runs` (generalises `nav_sync_runs`), `nav_sync_runs` (ported) | §5.4 |
| `market_holidays` | date, segment, description, source_url |
| `webhook_events` | §5.8 |
| `provider_api_calls` | §5.9 |
| `legal_documents`, `legal_document_versions`, `legal_acceptances` (investor side; port `terms_acceptances` `MIG/V56:4-15` + `consent_records`) | §5.11 |
| `notification_templates`, `notification_template_versions`, `notification_deliveries` | §5.12 |
| `feature_flags`, `feature_flag_history` | §5.13 |
| `export_jobs`, `report_snapshots`, `holdings_snapshot` | §4.4, §5.14 |
| `dsr_requests`, `dsr_tasks`, `retention_policies` | §5.15 |
| `distribution_config`, `euin_registry` | §5.16 |
| `grievances` | §5.17 |
| `cas_import_jobs` | §5.18 |

---

## 7. Implementation conventions (NestJS / Next.js)

| Concern | Convention |
|---|---|
| AuthZ declaration | `@RequirePermission('orders.status.override', { mode: 'maker' })`. `PermissionGuard` resolves it from `@sanchay/authz`. `StepUpGuard` checks `session.step_up_at` is within 5 min. `IpAllowGuard` enforces the IP list. Global default is **deny**: an unannotated admin route fails at boot (a startup check enumerates routes). |
| Maker-checker | `ApprovalService.request(actionKey, payload)` pairs with a registered `ActionExecutor<actionKey>`. The approve endpoint executes inside a transaction and writes both audit rows. |
| Audit | `AuditService.record(tx, event)` is mandatory in every admin mutation service. A unit-test helper asserts exactly one audit row per mutation. |
| DTOs | zod schemas in `@sanchay/contracts`, shared with the admin UI through `react-hook-form` + `zodResolver`. |
| Admin UI | Next.js 16 App Router. All admin pages are client-rendered data grids (TanStack Table + TanStack Query). `export const dynamic = 'force-dynamic'`, `Cache-Control: no-store`. No RSC caching of PII. No analytics or third-party scripts. CSP `script-src 'self' 'nonce-…'`. Menu items are hidden by permission, but the server is the enforcement point. |
| UI kit | shadcn/ui-style primitives in `@sanchay/ui-admin`. The investor design system is **not** reused, to keep investor bundles lean. |
| Observability | Every admin request logs `request_id`, actor, route and permission. PII scrubbing in the logger uses `@sanchay/pii`. |
| Tests | Testcontainers Postgres (v1 lacked this, synthesis §11). A contract test per permission row: allowed role gets 2xx, disallowed role gets 403 plus an `authz.denied` audit row. |

---

## 8. Delivery sequence (2-week sprints, in parallel with investor tracks)

| Sprint | Admin deliverables | Why this order |
|---|---|---|
| A1 | Admin auth (bootstrap, invite, password + TOTP, sessions, IP list), `@sanchay/authz`, audit foundation (hash chain, append-only), approval framework, `apps/admin` shell, WAF/ALB host | Everything else depends on this |
| A2 | SEBI taxonomy, scheme sync from FP, curation and sale state machine, AMC registry, fund-facts entry + CSV import + publish, jobs/NAV monitor, holiday calendar | The investor catalogue needs curated, enabled regular plans |
| A3 | Investor 360 with blind-index search and reveal, KYC exception queue, case engine | Needed before onboarding beta |
| A4 | Webhook persistence/log/replay, FP API log (allow-list redaction), order/payment/mandate queue, detectors, nightly reconcile | Needed before the first real-money order |
| A5 | Legal docs versioning plus the investor re-accept gate, notification templates with DLT fields, feature flags and kill switches, distribution config (ARN/EUIN) | Legal docs and ARN are launch-blocking compliance items |
| A6 | Reports (daily orders, AUM, SIP book, failed payments, compliance), DSR workflow + retention jobs, grievance register, CAS monitor, access review | Completes launch scope |
| Post-launch | WebAuthn, trail-commission reconciliation, Hindi legal docs, WhatsApp templates, custom-role editor (only if needed) | |

**Launch-blocking acceptance checks:**
1. No admin route is reachable from `api.sanchay.in` or outside the IP list.
2. Every admin mutation writes exactly one audit row, and chain verification passes.
3. A maker cannot approve their own request.
4. The DB rejects `ENABLED` for a DIRECT plan.
5. There is no endpoint that sets KYC to verified.
6. The PII-shape scan of `audit_events`, `provider_api_calls` and `webhook_events` returns 0.
7. 100% of orders carry the ARN and an execution-only declaration version.
8. Engaging a kill switch halts the journey within 30 s on all three clients.
9. An expired ARN auto-halts purchases.

---

## 9. v1 lessons applied

| v1 fact (source) | v2 response |
|---|---|
| ADMIN was a distributor-role value; signup accepted `role=ADMIN` (`BE/service/AuthService.java:77`); no seeded admin (`MIG/V3__seed_data.sql`) | Dedicated `admin_users`, invite-only with maker-checker, CLI bootstrap (§2.1) |
| One shared JWT secret for investor and staff (`BE/service/JwtService.java:29-30`) | Opaque server-side admin sessions on a separate host and cookie (§2.3) |
| Admin UI showed full PAN in lists (`FE/views/InvestorMgmt.tsx:432`) | Masked by default, blind-index search, audited reveal (§4.2) |
| Raw FP proxy leaked PAN/bank with no audit (`BE/controller/CybrillaDirectController.java:23` + compliance review :82) | No proxy; allow-list-redacted logs (§5.9) |
| Webhook dedupe was in memory, lost on restart (`BE/controller/CybrillaWebhookController.java:34-51`) | Persistent `webhook_events` with a unique dedupe key, plus replay (§5.8) |
| NAV backfill dry-run by default (`BE/controller/NavAdminController.java:65`) | Kept, with maker-checker on apply (§5.4) |
| Forced order status needed a bypass reason, which was audited (`BE/service/OrderService.java:1133-1170`) | Kept, with evidence upload and maker-checker added (§5.7) |
| Audit table was generic with no integrity protection (`MIG/V1__baseline_schema.sql:210-219`); viewer capped at 90 days (`BE/controller/AuditController.java:22`) | Append-only, hash-chained, WORM-anchored; 90-day query window kept (§4.1, §5.10) |
| Product admin allowed MASTER_DISTRIBUTOR (`BE/controller/ProductController.java:227-319`) | Granular `catalogue.*` permissions with a COMPLIANCE checker on sale enablement (§5.2) |
| Cybrilla catalogue lacks TER, riskometer, exit load, AUM and benchmark (synthesis G1) | Bitemporal `fund_facts` with source and effective date, CSV bulk import, and a provider-conflict workflow (§5.3) |

---

## 10. Sources (web, accessed 2026-09-25)

- SEBI CSCRF circular (20-Aug-2024): https://www.sebi.gov.in/legal/circulars/aug-2024/cybersecurity-and-cyber-resilience-framework-cscrf-for-sebi-regulated-entities-res-_85964.html. The 2-year log retention (IT Act alignment) and CERT-In 180-day in-India retention are from secondary guides: [CyberNX](https://www.cybernx.com/logging-solution-as-per-sebi-cscrf/), [Ascentium](https://in.ascentium.com/blog/title-sebi-cscrf-strengthening-organizational-security-through-access-controls-and-audit-logs/).
- NIST SP 800-63B-4 session timeouts (AAL2: inactivity ≤1 h, overall ≤24 h): https://pages.nist.gov/800-63-4/sp800-63b/session
- DPDP Rules 2025 (90-day response to rights requests and grievances; consent managers): [PIB notification PDF](https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf), [dpdpa.com Rule 14](https://www.dpdpa.com/dpdparules/rule14.html), [Scrut](https://www.scrut.io/post/dpdp-rules)
- PMLA record retention (5 years after transaction / after relationship end): [FIU-IND PML (Maintenance of Records) Rules](https://fiuindia.gov.in/files/AML_Legislation/notification.html), [ConsentOS summary](https://consentos.in/learn/kyc-record-retention-period/)
- EUIN blank plus investor execution-only declaration: [Wealthy](https://www.wealthy.in/partner-desk/partner-blog/euin-number-in-mutual-fund-537), [Cafemutual](https://cafemutual.com/news/industry/3074-amfi-relaxes-euin-norms-for-mutual-fund-distributors)
- Riskometer evaluated monthly and disclosed within 10 days of month-end: [Zerodha Fund House](https://www.zerodhafundhouse.com/blog/mutual-fund-riskometer/), [Value Research](https://www.valueresearchonline.com/stories/48907/decoding-the-new-riskometer/)
- MFD commission-disclosure obligations: [AMFI Master Circular for MFDs (AMFI/MFD-CIR/32/2025-26)](https://www.amfiindia.com/uploads/AMFI_Master_Cicular_for_MF_Ds_3c7f5ee44f.pdf), [SEBI MF Master Circular](https://www.sebi.gov.in/sebi_data/attachdocs/1337083696184.pdf)
- SEBI 2026 categorisation, NAV cutoff revision (2025-06-01) and 2FA circulars: as verified in the prior synthesis brief (§5, §10, §13 L7/L8).

The following facts are stated from domain knowledge and were not re-verified in this session. Confirm them before compliance sign-off:
- AMCs must upload NAV to AMFI by 11 PM.
- Redemption payout within 3 working days.
- TRAI DLT registration for SMS templates.
- Values of the 60–79 name-match band for penny drop (this is a policy choice, A-series assumption, not a regulatory number).

---

### Critical files for implementation

Greenfield targets in `C:/Users/pc/Desktop/sanchay` (proposed):
- `C:/Users/pc/Desktop/sanchay/packages/authz/src/roles.ts`: role-to-permission map from §3.2, shared by the Nest guards and the admin UI
- `C:/Users/pc/Desktop/sanchay/apps/api/src/main-admin.ts` (+ `apps/api/src/admin/**`): the separate admin entrypoint and modules
- `C:/Users/pc/Desktop/sanchay/apps/admin/`: the Next.js 16 back-office app on `ops.sanchay.in`

v1 reference (read-only):
- `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/controller/CybrillaWebhookController.java`
- `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/service/OrderService.java` (lines 1133-1170, the D9 override rule)
