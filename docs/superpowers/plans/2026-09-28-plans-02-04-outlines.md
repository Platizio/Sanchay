<!-- source: workflow wf_0a226252-0e5 label outlines-02-04 | exported 2026-09-28 -->

# Sanchay MVP task outlines: Plan 02 (S2), Plan 03 (S3), Plan 04 (S4 and pilot week)

This was planned read-only. Nothing was created or changed. It is based on the MVP spec (§0–§8, H-1..H-21), the sprint plans, and the Plan-01 delta sheet (new ids A1–A12, B1–B23, C1–C15). I also checked the Plan-01 interface sheet (§5 API layout and symbols) and the v1 test sources (`XirrCalculatorTest`, `AmfiNavParserTest`, `RedemptionAvailability`, and the research:rules-money vectors).

## 0. Conventions, capacity ledger and rulings these outlines depend on

### 0.1 Conventions (every task in every plan)
- **IDs.** Plan 02 uses D1..D10, Plan 03 uses E1..E25, Plan 04 uses F1..F27. Tasks that can be trimmed are tagged `[T#]` using the spec §6 numbering: T1 www, T2 filters, T3 allocation chart, T4 NAV chart, T5 redeem by units, T6 eNACH, T7 Android native, T8 SIP.
- **Estimates** are in ideal hours at human pace (1 ideal day = 8 h), the same unit as the delta sheet.
- **Plan files** go in `C:/Users/pc/Desktop/sanchay/docs/superpowers/plans/`:
  - `2026-10-12-plan-02-mvp-kernel-fp-gateway-catalogue-data.md`
  - `2026-10-26-plan-03-mvp-consent-onboarding-catalogue-lumpsum.md`
  - `2026-11-09-plan-04-mvp-sip-portfolio-redemption-prod.md`
  
  The delta sheet's deferral targets map onto these files:
  - "plan-02-mvp-kernel" → Plan 02.
  - "plan-03 catalogue" → Plan 02 D8–D10 and Plan 03 E14–E19.
  - "plan-04 onboarding" and "plan-05 consent and lumpsum" → Plan 03.
  - "plan-07 portfolio" and "plan-08 prod, security" → Plan 04.
- **Branches:** `feat/plan-02-mvp-kernel`, `feat/plan-03-mvp-onboarding-lumpsum`, `feat/plan-04-mvp-sip-portfolio`. Nothing is pushed until the owner asks (G-B2).
- **Commands** use one command per line and work in PowerShell 5.1 and Git Bash. Filters use `--filter=@sanchay/x`. Every env-var command is given in two forms: `$env:X='v'; cmd` and `X=v cmd`. Commits add the Co-Authored-By trailer.
- **Migrations.**
  - Each task generates its own file with `pnpm --filter=@sanchay/api db:generate --name=<name>` (or `--custom`).
  - **The number (0004, 0005, …) is assigned at merge, in DAG order, never inside a parallel worktree.** A worktree that collides regenerates after rebasing.
  - Each new table appends its name to the `TableName` union in `apps/api/src/modules/platform/ids.ts`.
  - Grants are covered by the B7 `ALTER DEFAULT PRIVILEGES`. Append-only tables add `REVOKE UPDATE, DELETE … FROM sanchay_app` in a custom migration.
- **Shared files** get key-level edits only (delta sheet §4).
  - New ownership rule: `apps/api/.env.example` may take **appended keys** from Plan 02 onward. This amends delta §4.7, which said "none".
  - `packages/contract/src/index.ts` takes one appended router key per area, followed by an `openapi.json` regeneration (the B10 drift test).
  - Any new error code is appended to `ERROR_CATALOGUE` together with copy in `messageForError`, and the C6 all-codes test must stay green (H-10).
- **Test locations.**
  - Package unit tests: `packages/<pkg>/test/*.test.ts`.
  - API unit tests: colocated `*.test.ts`.
  - API integration tests: `apps/api/test/int/<area>.int.test.ts`, on Testcontainers PG 18.6 with `TestApp` (capture SMS/email and `FakeClock`).
  - Golden vectors: JSON in `packages/test-fixtures/src/golden/<name>.json`, consumed by both the packages and the API.
  - Web smoke: `apps/web/e2e/*.smoke.spec.ts` (Playwright `@smoke`, run with `SANCHAY_PROVIDER_MODE_FP=fake`).
  - Maestro stays local only.
- **FP operation classes.** D3 pins these in `FP_OPERATIONS` (verify against the D-MONEY-109 class list when D3 is expanded):
  - **R** = read (GET anything, including `/api/oms/reports/holdings`).
  - **K** = POA pre-verification (`POST /poa/pre_verifications`). K writes are allowed without an OTP challenge but need the recorded KYC_CONSENT acceptance.
  - **P** = provisioning writes: `investor_profiles`, `phone_numbers`, `email_addresses`, `addresses`, `related_parties`, `bank_accounts`, `mf_investment_accounts` POST and PATCH.
  - **M** = money writes: `mf_purchases` POST and PATCH, `mf_purchase_plans` POST and PATCH, `mf_redemptions` POST and PATCH, `/api/pg/payments/*` POST, `/api/pg/mandates` POST, `/api/pg/payments/emandate/auth` POST.
  - **Rule:** P and M only run inside `ConsentEngine.useConsumed`.
- **Canonical consent-first assertion.** Every money and onboarding flow test uses the helper `expectNoPmWritesBeforeConsumed(fakeFp, challengeId)` from `apps/api/test/int/consent-first.ts` (created in E4). The assertion text is **"FakeFp has zero P/M writes before CONSUMED"**.
- **BOLA helper:** `expectBola(app, procedureKey, foreignIdArgs)` in `apps/api/test/int/bola.ts` (created in E4). Every investor endpoint gets a BOLA test (foreign id → 404) in the task that creates it. F9 adds a meta-test that fails if any I/IP/IX procedure in the contract lacks one.
- **Providers only from worker jobs.**
  - `FpModule` is imported **only** when `SANCHAY_APP_ROLE=worker`.
  - `FpGateway` throws `ProviderCallInTransactionError` if the CLS flag `db.inTx` is set; `Db.tx` sets that flag.
  - OTP senders are the documented exception (H-5 synchronous send, D-17).

### 0.2 Env additions (H-8 addendum; the lead must acknowledge, like `SANCHAY_KEYRING_JSON`)
- **Already listed in H-8:** `SANCHAY_PROVIDER_MODE_FP` (fake|sandbox|production), `SANCHAY_FP_WEBHOOK_AUTH` (hmac|shared_secret), `SANCHAY_PILOT_INVITE_ONLY` (stringbool), `SANCHAY_API_ORIGIN`. `SANCHAY_PROVIDER_MODE_SMS` gains `msg91`; `SANCHAY_PROVIDER_MODE_EMAIL` gains `ses`.
- **New, needing acknowledgement:**
  - `SANCHAY_FP_BASE_URL`
  - `SANCHAY_FP_CREDENTIALS_JSON`: `{fp:{clientId,clientSecret},poa:{…},pg:{…}}`. Worker container only, from Secrets Manager `sanchay/{env}/fp`.
  - `SANCHAY_FP_WEBHOOK_SECRET`: api container only.
  - `SANCHAY_MSG91_CREDENTIALS_JSON`: `{authKey, senderId, peId, templateIds:{LOGIN,CONSENT}}`.
  - `SANCHAY_SES_FROM`.
- **New B2 boot invariants:**
  - 7: `SANCHAY_PROVIDER_MODE_FP=fake` outside local/test → refused.
  - 8: `SANCHAY_PROVIDER_MODE_FP=production` with `SANCHAY_APP_ENV≠prod` → refused.
  - 9: `SANCHAY_PILOT_INVITE_ONLY=false` in prod → refused until P2.

### 0.3 Capacity ledger (ideal hours; factor 1.6 in S2–S4; overheads already deducted)

| Sprint | Net capacity | Committed before this plan | Available | Plan demand (after T1–T6) | Result |
|---|---|---|---|---|---|
| S2 | 172.3 | Plan-01 tail 92.0 (delta §7: B13–B23, C3, C6–C15) | **80.0** (A 42 / B 38) | Plan 02: 80.0 | fits (0 slack) |
| S3 | 192.8 | — | 192.8 (A 96.4 / B 96.4) | Plan 03: 234 (A 116 / B 118) | **over by ≈ 41 h**, carried into S4 in the order given in Plan 03 |
| S4 | 152.0 | S3 carry ≈ 37 h (after CDK consolidation) | 115 | Plan 04: 136 | **over by ≈ 21 h (2.6 d)** |
| Pilot week | 51.2 (factor 1.0) | — | 51.2 | F20–F27: 51 | not a sprint; F26 fix budget is the last absorber |

**How these figures were reached:**
- **Remaining MVP at spec budgets:** 480 h (60.0 d). The trims-tagged tasks sum to 32 h (T1 2, T2 6, T3 2, T4 8, T5 4, T6 10), matching the spec's 4.0 d.
- **Break-even measured factor for S2–S4:** **1.77** without trims; **1.68** with T1–T6 acknowledged. This is consistent with the delta sheet's 1.74 / 1.65.
- **Recommendations:**
  - (a) Take the PO's one-line acknowledgement for T1–T6 on **Fri 10-09**, as the delta sheet recommends.
  - (b) At the **Fri 10-23** re-baseline, if f₂ < 1.68, apply in order:
    1. C15 → manual G-E6 checklist (3 h).
    2. **T7** (saves ≈ 13–20 h: F18, plus the Android return glue in E24/F12/F16).
    3. T8 (PO sign-off, 34 h).
    4. Otherwise move GO/NO-GO to Fri 12-04.
  - (c) Milestone consequence: at f = 1.6, **lumpsum screens end to end land Wed 11-11 to Thu 11-12, not Fri 11-06**. Plan 03 flags this. The PO should ask Cybrilla for the product demo on **Thu 11-12**, or accept an API-driven lumpsum demo on 11-06 (onboarding shown end to end in the UI).

### 0.4 Rulings and conflicts I resolved (lead to confirm)
1. **Onboarding screens batch 1 moves from S2 to Plan 03 (E12).** The Plan-01 tail consumes S2, and the screens need the S3 backend anyway.
2. **The CDK dev stack moves from S2 to Plan 03 (E25)** and is the first thing to overflow. If it slides, F1 deploys dev and prod in one pass (16 h instead of 12 + 8). The 10-23 milestone becomes: login end to end (Wed 10-21), the kernel green on Testcontainers + FakeFp, the KRA pre-verification probe green, and NAV sync plus catalogue seed running locally.
3. **Redemption quote vs "providers only in the worker".** Spec §4.4 has the quote calling the FP holdings report, but the api role has no FP credentials. Ruling:
   - `folio.sync` (worker) stores `folios.fp_holdings_snapshot jsonb` and `fp_holdings_synced_at`. These are additive columns and need acknowledgement.
   - The quote reads the snapshot and returns `REFRESHING` (enqueueing `folio.sync`) when it is older than 24 h.
   - `orders.redemption.submit` re-checks holdings live in the worker before `POST /v2/mf_redemptions`.
4. **KYC pre-verification (class K) runs before attest.** It requires a `consent_records` row for KYC_CONSENT (ONB-02 checkbox, no OTP), so E6 depends on E3.
5. **The `trg_consent_guard` function is created in E4.** Each subject table's migration attaches it: orders in E20, plans and mandates in F2.
6. **XIRR bug B-01** (a zero-amount flow extends the date span, so v1 returns 0.1). The port **fixes** this so v2 returns null. The golden JSON records both the v1 and v2 values, and `docs/specs/money/xirr.md` notes the deviation. Q-1 (the unbounded 1.4678e12 result) stays covered by the PO-5 display rule (A7 `formatXirr`).
7. **The redemption buffer's σ and n** follow design §F.6 / D-MONEY. They are verified when F5 is expanded and pinned by a golden vector before any code.

---

## 1. PLAN 02 (S2, after the Plan-01 tail): platform kernel, FP gateway, FakeFp, catalogue data

**Goal.** By Fri 10-23 the money kernel runs under Testcontainers:
- idempotency;
- the pg-boss worker role;
- FpGateway with lossless-json and `provider_calls`;
- a stateful FakeFp plus the sandbox contract-smoke harness;
- domain state machines;
- MSG91/SES adapters and `Notify`;
- the pilot invite gate;
- the catalogue schema, seeds, AMFI NAV sync and FP scheme sync.

Everything Plan 03 consumes exists with the exact names below.

**Window:** Dev A from about Mon 10-19, Dev B from about Mon 10-19, both after their Plan-01 tails (Tue 10-20 is a holiday). Budget 80 h: Dev A 42, Dev B 38.

**Prerequisites from Plan 01 (new ids):**

| Area | Names |
|---|---|
| Packages | `@sanchay/money` (A3–A8: `Money`, `Units`, `Nav`, `formatXirr`, `allocatePercentages`, `holdingMoney`); `@sanchay/validation` (A9, A10: `panSchema`, `ifscSchema`, `pincodeSchema`, `moneyWireSchema`, `unitsWireSchema`, `navWireSchema`, `amountSchema`); `@sanchay/domain` (A11: `defineEnum`, `ORDER_TYPES`, `ORDER_ORIGINS`, `ORDER_MODES`, `MANDATE_RAILS`, `PAYMENT_METHODS`, `LAUNCH_PLAN_FREQUENCIES`, `LAUNCH_CLIENT_PLATFORMS`, `OTP_PURPOSES`, `CONSENT_SUBJECT_TYPES`, `LEGAL_DOCUMENT_KEYS`, `CUTOFF_CLASSES`, `ASSET_CLASSES`, `NOMINEE_ID_TYPES`, `MAX_NOMINEES`, `LAUNCH_SCHEME_OPTIONS`, `Isin`, `IsoDate`) |
| Platform, API | B1 `newId`, `TableName`, `Clock`/`FakeClock`; B2 `parseEnv`, `assertBootInvariants` (invariants 1–6); B3 `Crypto.encrypt/decrypt/blindIndex`, `KeyService`, `SecretsKeyService.fromEnv`; B4 `scrub`, `REDACT_KEY_PATTERNS`; B6 `createDb`, `DbExecutor`, `Tx`, Testcontainers harness; B7 identity schema (`investors`, `otp_codes.destination_enc`/`pepper_kid`), roles `sanchay_app`, `sanchay_readonly`, `sanchay_migrator`, `sanchay_retention` |
| Platform, API (continued) | B8 `AppError`, `normalizeOrpcError`; B9 `clientIpFrom(req, source)`, `API_PREFIX`; B10 OpenAPI drift test; B11 `AuditService.record`, `AUDIT_DATA_ALLOWLIST`; B12 `SmsSender`/`EmailSender`, `SMS_SENDER`/`EMAIL_SENDER`, `loginSmsText`, `consentSmsText`, `SMS_TEMPLATE_IDS`, `emailOtpMessage`, `SenderUnavailableError`, `IntegrationsModule.forRoot`; B13/B14 `OtpService.issue/verify`; B15 `DeviceRegistry.upsert → {device, isNew}`; B16 `SessionService`; B18 `ClientGuard`, `SessionGuard`, `writeSessionCookies`, `SESSION_INDICATOR_COOKIE`; B19 `AuthService.verifyLoginOtp`; B20 `ContactEmailService`; B21 throttler; B23 `.env.example`, `db:migrate`, worker role stub |
| Contract, clients | B5 `ERROR_CATALOGUE` (66 codes), `errorMap`, `COMMON_ERRORS`, `SESSION_ERRORS`; B17 `contract.auth`, `contract.me`; C2/C3 `@sanchay/api-client` (cookie and bearer transports, Idempotency-Key); C6 `messageForError`, `legal-entity.ts`; C9 `AppNav`, `ComingSoonScreen`; C10/C11 web routing; C13/C14 Expo shell; C12 Playwright CI job |

### D1. Platform kernel tables and the idempotency interceptor (Dev A, 8 h)
- **Files (create):** `apps/api/src/modules/platform/{kernel.schema.ts, idempotency.service.ts, idempotency.middleware.ts, runtime-config.ts}`; migration `platform_kernel`.
- **Files (modify):** `platform.module.ts`, `ids.ts`, `platform/orpc.ts`, `identity/me.router.ts` (enforce on `/me/email/*`; D-8 superseded).
- **Produces:**
  - Tables:
    - `idempotency_keys (actor_id, key) PK, route, request_sha256, status IN_PROGRESS|COMPLETED, response_status, response_body jsonb, expires_at` (24 h).
    - `app_config (key PK, value jsonb, updated_at)`.
    - `recon_breaks (kind, entity_type, entity_id, severity, detail, status; UNIQUE(kind, entity_id) WHERE status<>'RESOLVED')`.
  - oRPC middleware `requireIdempotency()`. Key format: UUID.
    - Missing → 428 `IDEMPOTENCY_KEY_REQUIRED`.
    - Same key with a different sha → 422 `IDEMPOTENCY_KEY_REUSED`.
    - In flight → 409 `IDEMPOTENCY_IN_PROGRESS`.
    - Replay → stored response plus header `idempotent-replayed: true`.
    - A 5xx releases the key.
  - `RuntimeConfig.get<K extends RuntimeConfigKey>(exec, key)`. Typed keys: `orders.enabled`, `fp.lumpsumFlow` (`CUSTOM_CHECKOUT` \| `PAYMENT_AFTER_SUBMIT`, default CUSTOM_CHECKOUT per H-2), `fp.sendPartner=false`, `features.redeemByUnits=false`, `pilot.caps.perOrder='100000.00'`, `pilot.caps.perInvestorPerDay='200000.00'`, `money_params_version`, `minAppVersion.android`.
  - `ReconBreaks.open(tx, {kind, entityType, entityId, severity, detail})`.
- **Tests:**
  - `returns 428 without key on [K] route`
  - `replays identical request with idempotent-replayed header`
  - `422 on same key different body`
  - `409 while first request in flight (two concurrent calls)`
  - `5xx releases key`
  - `keys are per actor (investor A key reusable by B)`
  - `expired keys ignored after 24h (FakeClock)`
  - `me.verifyEmail now requires key`
  - `RuntimeConfig rejects unknown key at type level (tsd) and wrong value shape at runtime`
  - `recon_breaks open is idempotent while unresolved`

### D2. JobsModule (pg-boss 12.34.0), worker role, heartbeats, readiness, cleanup (Dev A, 10 h)
- **Files (create):** `apps/api/src/modules/platform/jobs/{jobs.module.ts, jobs.service.ts, job-registry.ts, worker.main.ts, heartbeat.ts, schedules.ts}`; migration `worker_heartbeats` (custom, which also grants on the `pgboss` schema).
- **Files (modify):** `main.ts` (the worker role boots the Nest application context without HTTP), `health.router.ts`, `identity/identity.module.ts`.
- **Produces:**
  - `Jobs.enqueue(tx, name: JobName, data, opts?: {singletonKey?, startAfter?, retryLimit?})`, sent via the pg-boss `db` executor adapter so it is atomic with the tx.
  - `@JobHandler(name)` decorator.
  - `JOB_NAMES` (a closed union of every MVP job in spec §1).
  - `schedule(name, cron, {tz:'Asia/Kolkata'})`.
  - Table `worker_heartbeats (task_id PK, last_beat_at)`, beat every 30 s.
  - `/health/ready` checks the DB, pg-boss, and a heartbeat under 2 min.
  - Job `identity.cleanup` (hourly: expire and delete otp_codes older than 24 h, and sessions past absolute expiry + 7 d).
  - The worker drains on SIGTERM.
- **Tests:**
  - `enqueue inside rolled-back tx leaves no job`
  - `enqueue inside committed tx is processed once`
  - `singletonKey serialises jobs per aggregate`
  - `worker role does not listen on HTTP`
  - `api role does not start job processing`
  - `health.ready is 503 when heartbeat older than 2 min`
  - `schedules register with Asia/Kolkata tz`
  - `identity.cleanup deletes expired otp rows only`
  - `unknown job name is a type error (tsd)`

### D3. FpGateway base: undici, per-audience tokens, lossless-json, provider_calls, ConsumedConsent brand (Dev A, 14 h)
- **Files (create):** `apps/api/src/integrations/fp/{fp.module.ts, fp-operations.ts, fp-transport.ts, fp-token-cache.ts, fp-json.ts, fp-read.ts, fp-kyc.ts, fp-provision.ts (stub signatures), fp-transact.ts (stub signatures), consumed-consent.ts, fp-errors.ts, provider-calls.schema.ts}`; migration `provider_calls`.
- **Produces:**
  - `FP_OPERATIONS: Record<FpOperationKey, {method, path, audience:'fp'|'poa'|'pg', class:'R'|'K'|'P'|'M'}>`.
  - `type ConsumedConsent = Brand<{challengeId, investorId, subjectType, subjectIds, snapshotSha256, executeBefore}, 'ConsumedConsent'>`.
  - `assertConsumed(c)`, which throws `ConsentNotConsumedError`.
  - `FpTransport.call(op, {pathParams, query, body, consent?})`: P/M operations **require** `consent`. It runs undici with timeouts of 10 s connect and 30 s body, and parses responses with `lossless-json` via `fpJson.parse`, mapping every number to a `LosslessNumber` and converting to `Money`/`Units`/`Nav` only through `fpJson.money/units/nav`.
  - Errors: `FpAmbiguousError` (timeout, transport error, 5xx after retries, 409, or duplicate `source_ref_id`), `FpRejectedError` (4xx with FP code), `ProviderCallInTransactionError`.
  - `FpRead` (schemes, fund_schemes, purchase/plan/redemption/mandate/payment gets and lists, holdings report, folios).
  - `FpKyc.preVerify(...)`, `FpKyc.getPreVerification(id)`.
  - Table `provider_calls` (append-only): provider, operation, aggregate_type, aggregate_id, http_status, duration_ms, error_code, request_meta, response_meta (allow-listed keys only), body_enc (AAD `provider_calls.body_enc:<id>`).
  - Token cache per audience with refresh 60 s before expiry.
  - The module is imported only in the worker role.
- **Tests:**
  - `P/M operation without ConsumedConsent is a type error (tsd) and throws at runtime`
  - `throws ProviderCallInTransactionError inside Db.tx`
  - `api role cannot resolve FpTransport`
  - `parses 12345.678 units and 1234567890123.45 amounts without float loss`
  - `provider_calls meta never contains pan/mobile/email/account (scrub test)`
  - `body_enc decrypts only with matching AAD`
  - `timeout → FpAmbiguousError`
  - `409 duplicate source_ref_id → FpAmbiguousError`
  - `4xx → FpRejectedError with providerCode`
  - `token refreshed per audience; one in-flight refresh`
  - `every FP_OPERATIONS entry has a class (table pin test)`

### D4. FakeFp (stateful) and the sandbox contract-smoke harness (Dev A, 10 h)
- **Files (create):** `apps/api/src/integrations/fp/fake/{fake-fp.ts, fake-fp.state.ts, fake-fp.scenarios.ts}`, `apps/api/test/int/fake-fp.ts`, `tools/fp-probes/{package.json, src/smoke.ts, src/chains/*.ts, README.md}`; evidence in `docs/probes/`.
- **Produces:**
  - `FakeFp`, an undici `MockAgent`-backed transport selected by `SANCHAY_PROVIDER_MODE_FP=fake`. It keeps in-memory objects for purchases, plans, redemptions, mandates, payments, investor profiles and related objects, and pre-verifications.
  - `fakeFp.calls({class?, op?})`.
  - `fakeFp.advance(objectId, state, fields?)`.
  - `fakeFp.script(op, 'timeout'|'5xx'|'409-dup'|{status, body})`.
  - `fakeFp.emitWebhook(event)`.
  - `fakeFp.autoAdvance` (local dev: under_review → pending after 2 s, and so on).
  - Fund-scheme fixtures for 10 ISINs, covering liquid, ELSS, equity and debt.
  - `pnpm --filter=@sanchay/fp-probes smoke -- --chain=<onboarding|lumpsum|sip|redemption> --env=sandbox`, which writes `docs/probes/smoke-<date>-<chain>.md` (run evidence for G-E4).
- **Tests:**
  - `FakeFp records class per call`
  - `list-by-source_ref_id finds object created before a scripted timeout (T6)`
  - `H-2 lumpsum state path under_review→pending→submitted→successful`
  - `payment create twice on same order is rejected (H-2 "no multiple payments")`
  - `rejects any M payload containing partner or euin keys (H-11)`
  - `smoke harness dry-run against FakeFp passes every chain`

### D5. Domain state machines, `canTransition` and `gen:states` (Dev B, 8 h)
- **Files (create):** `packages/domain/src/states/{order.ts, plan.ts, mandate.ts, payment-attempt.ts, onboarding.ts, consent-challenge.ts, index.ts}`, `packages/domain/test/states.test.ts`, `scripts/gen-states.ts`, `docs/specs/states.md` (generated).
- **Files (modify):** root package.json (script `gen:states`), `.github/workflows/ci.yml` (step "states drift": `pnpm gen:states` then `git diff --exit-code docs/specs/states.md`).
- **Produces:**
  - `ORDER_STATUSES` (spec §4.2 and §4.4, incl. RECONCILING, UNITS_PENDING, CONSENT_EXPIRED, SKIPPED for instalments), `PLAN_STATUSES` (§4.3), `MANDATE_STATUSES` (CANCEL_SUBMITTING reserved), `PAYMENT_ATTEMPT_STATUSES` (CREATING, REDIRECTED, PENDING, SUCCESS, FAILED, EXPIRED), `CHALLENGE_STATUSES` (PENDING, APPROVED, CONSUMED, CONSUMED_UNUSED, SUPERSEDED, EXPIRED, CANCELLED), `ONBOARDING_STAGES`.
  - `canTransition(machine, from, to, trigger): boolean`, `TERMINAL[machine]`.
  - `fpStateToOrderStatus(fpState, ctx)` mapping tables.
- **Tests:**
  - `every transition named in spec §4.2/§4.3/§4.4 is allowed`
  - `terminal states have no exits`
  - `RECONCILING exits only to mapped FP state or FAILED(PROVIDER_OBJECT_ABSENT)`
  - `PAYMENT_ATTEMPT FAILED does not move order to FAILED (H-2)`
  - `LAUNCH_PLAN_FREQUENCIES rejects QUARTERLY`
  - `gen:states output is deterministic`

### D6. MSG91 (DLT) and SES v2 adapters, `Notify`, `notifications.send`, "new sign-in" email (Dev B, 6 h)
- **Files (create):** `apps/api/src/integrations/sms/msg91.sender.ts`, `apps/api/src/integrations/email/ses.sender.ts`, `apps/api/src/modules/notifications/{notifications.schema.ts, notify.service.ts, notifications.job.ts, templates.ts, notifications.module.ts}`; migration `notifications`.
- **Files (modify):** `integrations.module.ts` (modes `msg91`, `ses`), `config/env.ts` (§0.2 keys), `identity/auth.service.ts` (on `isNewDevice`, `Notify.enqueue(tx, 'SECURITY_NEW_SIGN_IN')`).
- **Produces:**
  - `Msg91SmsSender` (DLT template id per `SMS_TEMPLATE_IDS`, PE id, sender).
  - `SesEmailSender` (ap-south-1, task-role credentials).
  - Tables `notifications (investor_id, category, template_key, dedupe_key UNIQUE, payload_enc, status)` and `notification_deliveries (notification_id, channel EMAIL, provider_message_id, status, attempts)`.
  - `Notify.enqueue(tx, templateKey, {investorId, data, dedupeKey})` → job `notifications.send`.
  - Template keys: `SECURITY_NEW_SIGN_IN`, `ORDER_PLACED`, `ORDER_ALLOTTED`, `ORDER_FAILED`, `REFUND_IN_PROGRESS`, `REDEMPTION_PROCESSED`, `PAYOUT_DELAYED`, `SIP_ACTIVE`, `SIP_INSTALMENT_MISSED_WARNING`, `MANDATE_STATUS`, `MANDATE_REVOKED`, `SUITABILITY_WARNING_COPY`, `ONBOARDING_BLOCKED_PILOT`.
- **Tests:**
  - `msg91 request carries DLT template id and exact H-6 body (golden bytes)`
  - `ses sends from SANCHAY_SES_FROM`
  - `prod boot refuses capture/mailpit (existing inv. 1) and accepts msg91/ses`
  - `Notify dedupes by dedupeKey`
  - `notifications.send retries 3x then FAILED`
  - `payload_enc never logged`
  - `new device login enqueues SECURITY_NEW_SIGN_IN; known device does not`

### D7. Pilot invite gate (Dev B, 4 h)
- **Files (create):** `apps/api/src/modules/identity/pilot-invites.{schema,service}.ts`, `apps/api/src/cli/ops-invite.ts`; migration `pilot_invites`.
- **Files (modify):** `identity/auth.service.ts` (the hook point from B19), root package.json (`ops:invite`).
- **Produces:**
  - Table `pilot_invites (mobile_bidx UNIQUE, invited_by, note, expires_at, used_at)`.
  - `PilotInvites.assertInvited(tx, mobileBidx)` → 403 `PILOT_INVITE_REQUIRED`. It applies only to **new** mobiles and only when `SANCHAY_PILOT_INVITE_ONLY=true`, and it runs **after** OTP verification (anti-enumeration).
  - `pnpm ops:invite --mobile <m> --note <n> --by <founder>` (role migrate; writes audit_events `PILOT_INVITE_ADDED`).
- **Tests:**
  - `uninvited new mobile gets PILOT_INVITE_REQUIRED after correct OTP`
  - `existing investor unaffected`
  - `requestOtp response identical for invited and uninvited (H-5)`
  - `invite consumed sets used_at`
  - `expired invite refused`
  - `CLI writes audit row`

### D8. Catalogue schema and seeds (Dev B, 6 h)
- **Files (create):** `apps/api/src/modules/catalogue/catalogue.schema.ts`, `data/{sebi-categories.csv, category-aliases.csv, amcs.csv, market-holidays-2026-2027.csv, commission-disclosures.csv, curated-schemes.csv (placeholder, 10 ISINs), fund-facts.csv (placeholder)}`, `apps/api/src/cli/ops-catalogue-seed.ts`; migration `catalogue` (includes the `pg_trgm` GIN index on `schemes.name`).
- **Produces:** tables per spec §2.3: `amcs`, `sebi_categories` (40 rows; `cutoff_class`, `volatility_class`), `category_aliases`, `schemes` (CHECK `plan_type='REGULAR'`, `option='GROWTH'`; `is_elss` generated; `status DRAFT|PUBLISHED|SUSPENDED`; `curated`), `fund_facts`, `fund_facts_revisions` (append-only), `commission_disclosures`, `scheme_navs`, `nav_history`, `nav_sync_runs`, `scheme_returns`, `market_holidays`. Also `pnpm ops:catalogue:seed`.
- **Tests:**
  - `plan_type CHECK rejects DIRECT`
  - `option CHECK rejects IDCW`
  - `seed is idempotent (run twice → same rows)`
  - `40 SEBI categories each map cutoff_class`
  - `holidays 2026 include 10-02, 10-20, 11-10, 11-24`
  - `fund_facts_revisions append-only (UPDATE denied to sanchay_app)`

### D9. AMFI NAVAll parser port, `nav.sync.daily`, history backfill, `ops:nav-release` (Dev B, 10 h)
- **Files (create):** `apps/api/src/integrations/amfi/{amfi-nav-parser.ts, amfi-client.ts, nav-floors.ts}`, `apps/api/src/modules/catalogue/nav/{nav.service.ts, nav-sync.job.ts, nav-history-backfill.ts}`, `apps/api/src/cli/{ops-nav-backfill.ts, ops-nav-release.ts}`, `packages/test-fixtures/src/amfi/{navall-daily.txt, navall-history.txt}`.
- **Produces:**
  - `parseAmfiNav(body, {bound: IsoDate}) → {rows, futureDated, furthestFutureDate}` (a port of `AmfiNavParser.java`, using `Nav` at the published scale).
  - `NavService.latest(isin) → {nav, navDate, grade: FRESH|AGED|UNDATED}` (bound 7 days inclusive, Asia/Kolkata calendar dates; bug B-15 fixed: future-dated → quarantined).
  - Jobs `nav.sync.daily` at 21:30, 23:30, 07:00 and 10:30 IST, and `catalogue.returns.compute` enqueued after sync (handler in E16).
  - Quarantine: |Δ| > floor → `scheme_navs.quarantined=true` + recon break.
  - `pnpm ops:nav-release --isin <i> --approver1 <a> --approver2 <b>`.
- **Tests (the 37 v1 AmfiNavParserTest cases ported by name):**
  - `parsesTheDailyLayout`, `parsesTheHistoryLayout`, `bothLayoutsYieldIdenticalRowsForTheSameFund`, `resolvesColumnsFromAnArbitraryHeaderOrder`
  - `doesNotMistakeTheHistoryNavNameColumnForTheNavColumn`, `emitsOneRowPerIsinWhenARowCarriesBoth`, `dedupesWhenBothIsinColumnsCarryTheSameIsin`, `skipsPlaceholderUnparseableAndNonPositiveNavs`
  - `keepsNavAtTheScaleTheFeedPublished`, `handlesCrlfLineEndings`, `aFutureDatedRowIsSeparatedAndTheRestOfTheFeedSurvivesIt`, `theBoundIsInclusiveSoARowDatedExactlyOnItIsUsable`
  - `aNullBoundIsRefusedRatherThanSilentlyMeaningUnbounded`, `throwsWhenTheHeaderHasNoIsinColumn`, `quotesOnlyABoundedSliceOfAnUnrecognisableBody`, and the rest
  - v2-specific additions:
    - NAV-02 freshness vectors (2026-08-24 FRESH, 08-19 FRESH, 08-18 AGED, and future-dated → quarantined, the v2 fix)
    - `nav.sync writes nav_sync_runs with counts`
    - `quarantine opens recon break`
    - `ops:nav-release requires two distinct approvers and writes audit`

### D10. `catalogue.fp.sync`, `catalogue.categories`, basic `catalogue.listSchemes` (Dev B, 4 h)
- **Files (create):** `apps/api/src/modules/catalogue/{fp-sync.job.ts, catalogue.router.ts, catalogue.queries.ts}`, `packages/contract/src/catalogue.ts`.
- **Files (modify):** `packages/contract/src/index.ts`, `openapi.json`.
- **Consumes:** `FpRead.schemePlans` (`GET /v2/mf_scheme_plans/cybrillapoa?expand=mf_scheme,mf_fund`), `FpRead.fundScheme(isin)` (`GET /api/oms/fund_schemes/:isin`).
- **Produces:**
  - Job `catalogue.fp.sync` (05:30), which upserts FP flags (`fp_active`, `purchase_allowed`, `redemption_allowed`, `sip_allowed`, `thresholds`, `sip_dates`, `lock_in_months`) into `schemes` and `fund_facts_revisions(source CYBRILLA)`.
  - Procedures: `catalogue.categories` GET `/catalogue/categories` (P); `catalogue.listSchemes` GET `/catalogue/schemes?q&category&cursor` (P; published and curated only).
- **Tests:**
  - `sync only touches curated ISINs`
  - `FP purchase_allowed=false suspends scheme`
  - `thresholds parsed via fpJson.money`
  - `listSchemes returns only PUBLISHED curated REGULAR GROWTH`
  - `trigram search matches "parag flexi"`
  - `cursor pagination stable`

**Plan 02 DoD.** Each task is green in `pnpm turbo run lint typecheck test test:int`. OpenAPI shows no drift, `gen:states` shows no diff, and `db:check` is clean. The idempotency replay test exists for `/me/email/*`. No provider call happens inside a transaction. Runbook stubs are written: `docs/runbooks/{worker-down,nav-sync-failure}.md`.

---

## 2. PLAN 03 (S3, Mon 10-26 → Fri 11-06): consent engine, existing-KYC onboarding, catalogue, lumpsum

**Goal.** A KRA-verified invitee onboards end to end in the FP sandbox on web and Android. They browse the curated catalogue and fund pages. They complete a consent-first lumpsum (UPI and netbanking) under H-2. At f = 1.6 the lumpsum screens end to end slip to Wed 11-11 to Thu 11-12 (§0.3); the backend chain is green in the sandbox by 11-06.

**Budget:** 192.8 h (A 96.4, B 96.4). Demand after T1/T2/T4 is 234 h, so the overflow order is given at the end.

**Prerequisites:**
- **Plan 02:** `requireIdempotency`, `RuntimeConfig`, `ReconBreaks`, `Jobs.enqueue`, `@JobHandler`, `JOB_NAMES`, `FpTransport`, `FpRead`, `FpKyc`, `ConsumedConsent`, `assertConsumed`, `FpAmbiguousError`, `FpRejectedError`, `FakeFp` (`calls`, `advance`, `script`, `emitWebhook`), `canTransition` with the ORDER/PAYMENT_ATTEMPT/CHALLENGE/ONBOARDING machines, `Notify.enqueue`, `PilotInvites`, the catalogue tables, `NavService.latest`, `catalogue.listSchemes`.
- **Plan 01:** `OtpService.issue/verify` (purpose CONSENT, `reference_id`), `consentSmsText`, `emailOtpMessage(code,'CONSENT')`, `Crypto`, `AuditService`, `SessionGuard`, `DeviceRegistry`.
- **Business:** legal drafts (G-C1 drafts, due 10-23), GAP-03 questionnaire text (G-C2, due 10-30), probe P-07 results.

### E1. FP webhooks: raw route, auth, dedupe, `fp.event.process` (Dev A, 8 h)
- **Files (create):** `apps/api/src/integrations/fp/webhooks/{fp-webhook.controller.ts, fp-signature.ts, inbound-webhook.schema.ts, fp-event.job.ts, fp-event-handlers.ts}`; migration `inbound_webhook_events`.
- **Produces:**
  - Raw Nest/Fastify route POST `/api/v1/webhooks/fp` (api host only via E2 HostGuard; raw body via a route-scoped content-type parser; 100 KiB).
  - `verifyFpSignature(raw, header, secret)`: `FP-Signature: id:b64(HMAC-SHA256)` over the raw body, falling back to re-serialised JSON. Shared-secret mode per `SANCHAY_FP_WEBHOOK_AUTH`. Constant-time compare; fail closed.
  - Table `inbound_webhook_events` (UNIQUE(provider, event_id); `signature_mode` CHECK (HMAC, SHARED_SECRET, NONE only when local); `payload_enc`; `payload_sha256`; `status`; `attempts`).
  - Valid events → `INSERT … ON CONFLICT DO NOTHING` + enqueue `fp.event.process` in the same tx → 200.
  - Handler registry `FP_EVENT_HANDLERS[objectType]`: re-fetch via `FpRead`, apply only if `canTransition`. Unknown object → retry 3 times over 10 min → recon break.
- **Tests:**
  - `invalid signature → 401 and metadata only stored`
  - `duplicate event_id processed once`
  - `responds < 100 ms (no provider call in request)`
  - `event.time never used for ordering (out-of-order events converge)`
  - `re-fetch wins over webhook payload`
  - `cookie-authenticated app host → 404`
  - `NONE mode refused outside local (boot)`

### E2. HostGuard, ALB client IP, `meta.appConfig` and 426, NAV-age readiness (Dev B, 4 h)
- **Files (create):** `apps/api/src/modules/platform/{host.guard.ts, app-config.router.ts}`, `packages/contract/src/meta.ts`.
- **Files (modify):** `app.module.ts` (guard order: HostGuard → ClientGuard → SessionGuard → Throttler), `health.router.ts`, `request-context.ts`.
- **Produces:**
  - `HostGuard`:
    - Cookie auth only on `app` host; bearer only on `api` host.
    - `/webhooks/fp` and `/pg/return/*` only on `api` host.
    - Any mismatch → 404.
    - Host classification from `SANCHAY_APP_ORIGIN` / `SANCHAY_API_ORIGIN`.
  - `meta.appConfig` GET `/app/config` (P): `minAppVersion.android`, flags, cut-off display times, limits, ARN tagline, support.
  - `x-app-version` below the minimum → 426 `APP_VERSION_UNSUPPORTED`.
  - `/health/ready` adds a NAV-age check (≤ 4 days).
- **Tests:**
  - HostGuard cross-host matrix (8 rows: {app, api} × {cookie, bearer, webhook, return})
  - `rightmost XFF used in alb mode`
  - `IPv6 → 422 CLIENT_IP_UNSUPPORTED`
  - `426 below minAppVersion`
  - `health.ready 503 when newest NAV older than 4 days`

### E3. Legal documents, consent tables, `sanchay.consent.v2` snapshot and JCS (Dev A, 12 h)
- **Files (create):** `packages/domain/src/consent/{jcs.ts, snapshot-v2.ts, required-factors.ts}`, `packages/domain/test/{jcs.test.ts, snapshot-v2.test.ts}`, `apps/api/src/modules/legal-consent/{legal-consent.schema.ts, legal-docs.service.ts, snapshot-builders.ts, legal-consent.module.ts}`, `apps/api/src/modules/legal-consent/documents/*.md` (placeholders, one per `LEGAL_DOCUMENT_KEYS` entry), `apps/api/src/cli/ops-legal-seed.ts`; migration `legal_consent`.
- **Produces:**
  - `canonicalize(value): string` (RFC 8785).
  - `ConsentSnapshotV2Schema` (zod; fields per spec §4.1; decimals as fixed-scale strings; no timestamps).
  - `snapshotSha256(snapshot)`.
  - `requiredFactorsFor(subjectType, amount): ('SMS'|'EMAIL')[]` (H-21).
  - Tables: `legal_documents (key, version, body_markdown, sha256, status, effective_from)`, `consent_challenges`, `consent_records` (append-only), `consent_subjects` (columns per spec §2.3).
  - `LegalDocs.current(key)`, `LegalDocs.recordAcceptance(tx, {investorId, key, channel, ip, userAgent, sessionId})` (used for KYC_CONSENT at ONB-02).
  - `SNAPSHOT_BUILDERS: Record<ConsentSubjectType, (tx, subjectId) => Promise<ConsentSnapshotV2>>` (a registry; each subject task registers its builder).
- **Tests:**
  - RFC 8785 vectors (key order, number canonical form, unicode escapes)
  - property test `hash(insert) === hash(reload)` via encrypted `snapshot_enc` round-trip on PG 18
  - `snapshot rejects float numbers`
  - `requiredFactors: purchase 99999.99 → [SMS]; 100000.00 → [SMS, EMAIL]; REDEMPTION → [SMS, EMAIL]; ONBOARDING_ATTEST → [SMS, EMAIL]; SIP_REGISTRATION → [SMS]`
  - `legal seed sha256 matches body`
  - `consent_records UPDATE/DELETE denied to sanchay_app`

### E4. ConsentEngine, `consents.*` procedures, `trg_consent_guard`, sweeps, destination resolver, test helpers (Dev A, 24 h)
- **Files (create):** `apps/api/src/modules/legal-consent/{consent-engine.ts, destination-resolver.ts, consent.router.ts, consent-sweep.job.ts, drafts-abandon.job.ts}`, migration `consent_guard` (custom: `trg_consent_guard()` function), `packages/contract/src/consents.ts`, `apps/api/test/int/{consent-first.ts, bola.ts}`.
- **Produces:**
  - `ConsentEngine.create(tx, {investorId, subjectType, subjects, templateKey, folioId|null})`. It builds the snapshot via `SNAPSHOT_BUILDERS`, renders `TPL_*`, and sets `expires_at`=10 min.
  - `sendOtp(challengeId, channel)`:
    - ≤ 3 sends, 30 s cooldown, ≤ 10 per investor per hour.
    - OTP via `OtpService.issue({purpose:'CONSENT', referenceId: challengeId})`; the OTP never outlives the challenge.
  - `approve(challengeId, {smsCode?, emailCode?})`, implementing D-MONEY-004 steps 1–7:
    1. lock;
    2. verify codes (attempt counter committed separately);
    3. re-run suitability via the `SuitabilityHook` interface, filled by E9 → 409 `SUITABILITY_CHANGED`;
    4. DB recompute + `timingSafeEqual` → mismatch: SUPERSEDED + audit + commit → `CONSENT_MISMATCH`;
    5. re-render the NAV-date line;
    6. insert `consent_record`;
    7. CONSUMED + `execute_before` 10 min + `saga_expires_at` (60 min, or 7 d for a SIP with a new mandate) + subjects CONSENTED + enqueue `*.submit`.
  - `useConsumed(challengeId, fn: (c: ConsumedConsent) => Promise<T>)`: worker only; refuses after `execute_before` for the first write and after `saga_expires_at` for any write.
  - `ConsentDestinationResolver.resolve(tx, investorId, folioId)` (H-21; empty → 409 `CONSENT_DESTINATION_UNAVAILABLE` + alert).
  - Procedures: `consents.getChallenge` GET `/consents/challenges/{id}`; `consents.sendOtp` POST `…/{id}/otp` [K]; `consents.approve` POST `…/{id}/approve` [K]; `consents.cancel` POST `…/{id}/cancel`.
  - Jobs: `consent.expiry.sweep` (*/5; missed `execute_before` → CONSUMED_UNUSED + subject CONSENT_EXPIRED); `drafts.abandon` (hourly, 24 h).
  - Helpers `expectNoPmWritesBeforeConsumed`, `expectBola`.
- **Tests:**
  - `approve with wrong code increments attempts even when tx rolls back`
  - `tampered subject row after create → CONSENT_MISMATCH, SUPERSEDED, no job enqueued`
  - `suitability changed between create and approve → SUITABILITY_CHANGED`
  - `approve after 10 min → expired`
  - `4th send refused`
  - `30 s cooldown`
  - `consent SMS body matches H-6 consent template and last line /^@app\.sanchay\.in #\d{6}$/`
  - `destinations = CURRENT verified contacts (new folio)`
  - `execute_before missed → CONSUMED_UNUSED and FakeFp has zero P/M writes`
  - `useConsumed rejects in api role`
  - `BOLA: foreign challenge → 404 on get/sendOtp/approve/cancel`
  - `idempotent approve replay returns same result`

### E5. `onboarding.get`, `deriveOnboardingStage`, `me.get` (Dev B, 4 h)
- **Files (create):** `packages/domain/src/rules/onboarding-stage.ts`, `apps/api/src/modules/onboarding/{onboarding.schema.ts (onboarding_applications, investor_profiles, kyc_checks), onboarding.router.ts, onboarding.queries.ts}`, `packages/contract/src/{onboarding.ts, me.ts (extend)}`; migration `onboarding_core`.
- **Produces:**
  - `deriveOnboardingStage(app, investor) → OnboardingStage` (ONB-00 hub order: identity → profile → bank → nomination → risk → declarations → attest → provisioning → done | blocked).
  - Procedures: `onboarding.get` GET `/onboarding`; `me.get` GET `/me` (masked profile, bank, nominees, risk profile, legal versions, support contacts).
  - `investor_profiles` and `onboarding_applications` columns per spec §2.3 (`kyc_path` CHECK EXISTING_VALID|NONE; `tax_status` CHECK RESIDENT_INDIVIDUAL).
- **Tests:**
  - stage truth table (12 rows including BLOCKED_PEP, KYC_UPDATE_NEEDED and PROVISIONING_FAILED)
  - `me.get never returns *_enc or full PAN/account`
  - BOLA (session-scoped; no id params, so it asserts another session sees its own data only)

### E6. Identity and KRA pre-verification, `putProfile`, `ref.pincode` (Dev A, 12 h)
- **Files (create):** `apps/api/src/modules/onboarding/{identity.service.ts, preverify.job.ts, profile.service.ts, ref.router.ts, ref.schema.ts}`, `data/ref-pincodes.csv`; migration `ref_pincodes`.
- **Consumes:** `FpKyc.preVerify({investor_identifier, pan, name, date_of_birth})` (class K), `LegalDocs.recordAcceptance`.
- **Produces:**
  - `onboarding.submitIdentity` POST `/onboarding/identity` [K]. It records KYC_CONSENT acceptance, stores PAN (`pan_enc`/`bidx`/`last4`), name and DOB, then enqueues `onboarding.preverify`. Poll schedule: 30 s, 1 m, 5 m; upstream_error retry at 1, 5 and 30 m; `underprocess` → recheck every 6 h.
  - Only readiness `verified` proceeds. Other statuses → `readiness_code` + ONB-19 "KYC update needed" + `Notify ONBOARDING_BLOCKED_PILOT`.
  - `onboarding.putProfile` PUT `/onboarding/profile` [K]. Fields are never defaulted: gender, occupation, income slab, PEP, source of wealth, country and place of birth, nationality, `tax_status` chosen explicitly, address, and FATCA flags.
    - PEP or RELATED_PEP → BLOCKED.
    - `tax_resident_elsewhere` or `us_person` true → REFUSE.
  - `ref.pincode` GET `/ref/pincode/{pin}`.
- **Tests:**
  - `preverify not enqueued without KYC_CONSENT acceptance`
  - `PAN bidx unique across investors → conflict`
  - `readiness kyc_unavailable/rejected/incomplete/onhold/legacy → KYC_UPDATE_NEEDED stage`
  - `underprocess rechecks every 6h (FakeClock)`
  - `putProfile rejects missing gender (no default)`
  - `PEP → BLOCKED with reason`
  - `FATCA yes → REFUSE`
  - `pincode autofill`
  - `FakeFp shows only class K calls (zero P/M)`
  - `idempotent replay`
  - BOLA

### E7. Bank account, penny drop, name match, `ref.ifsc` (Dev A, 10 h)
- **Files (create):** `packages/domain/src/rules/name-match.ts` (Jaro-Winkler on normalised names), `packages/test-fixtures/src/golden/name-match.json`, `apps/api/src/modules/onboarding/{bank.service.ts, bank-verify.job.ts}`, `data/ref-ifsc.csv`; migration `bank_accounts_ref_ifsc`.
- **Produces:**
  - `bank_accounts` table (spec §2.3; `account_type` CHECK SAVINGS).
  - `onboarding.addBank` POST `/onboarding/bank-accounts` [K]; `onboarding.listBanks` GET `/onboarding/bank-accounts`; `ref.ifsc` GET `/ref/ifsc/{ifsc}`.
  - Job `bank.verify.poll` (30 s, 1 m, 5 m, 30 m). Score ≥ 80 → VERIFIED; < 80 → FAILED ("use an account in your PAN name").
  - `nameMatchScore(a, b): number` (0–100).
- **Tests:**
  - golden NM-01..NM-12 (initials, honorifics, order swap, "Kumar" vs "Kr", 79/80 boundary)
  - `account number stored encrypted with bidx; last4 only in responses`
  - `FAILED bank cannot be selected later (TPV)`
  - `ifsc lookup from seed`
  - `FakeFp shows only class K calls`
  - BOLA on `listBanks`

### E8. Nomination: max 3, H-12 split, Annexure-B opt-out (Dev B, 8 h)
- **Files (create):** `packages/domain/src/rules/nominee-split.ts`, `packages/test-fixtures/src/golden/nomination-split.json`, `apps/api/src/modules/onboarding/nomination.service.ts`; migration `nominees` (deferred trigger per-set sum = 100).
- **Produces:**
  - Tables `nominees` and `nomination_decisions` (spec §2.3).
  - `onboarding.getNomination` GET and `onboarding.putNomination` PUT `/onboarding/nomination` [K].
  - `equalSplit(n) → [34,33,33]`.
  - `NOMINEE_ID_TYPES` without Aadhaar.
  - Minor → DOB + guardian (≤ 35 chars). Name ≤ 40. `display_preference` required when NOMINATED.
- **Tests:**
  - NS-01..NS-06 (1→100; 2→50/50; 3→34/33/33; custom 60/40; sum 99 rejected; 4 nominees rejected)
  - `AADHAAR_LAST4 rejected`
  - `PAN for minor rejected`
  - `OPTED_OUT requires Annexure-B acceptance on attest`
  - `set_version increments`
  - BOLA

### E9. Risk profile (GAP-03 v1.0.0: 8 questions, 5 levels) and suitability (Dev B, 10 h)
- **Files (create):** `packages/domain/src/rules/{risk-scoring.ts, suitability.ts}`, `packages/test-fixtures/src/golden/{risk-profile.json, suitability-rp.json}`, `apps/api/src/modules/onboarding/{risk-profile.service.ts, suitability.service.ts}`, `data/risk-questionnaire-v1.0.0.json`; migration `risk_suitability`.
- **Produces:**
  - Tables `risk_questionnaires`, `risk_profiles` (append-only; `expires_at` + 24 months), `suitability_checks`, `suitability_acknowledgements`.
  - Procedures: `riskProfile.questionnaire` GET `/risk-profile/questionnaire`; `riskProfile.get` GET `/risk-profile`; `riskProfile.submit` PUT `/risk-profile` [K].
  - `Suitability.check(tx, {investorId, schemeId}) → {outcome MATCH|MISMATCH, level, maxRiskometer}`, registered as the E4 `SuitabilityHook`.
  - Errors `RISK_PROFILE_EXPIRED`, `RISK_PROFILE_STALE`.
  - Mismatch → `Notify SUITABILITY_WARNING_COPY` (AMFI FAQ Q7(a)).
- **Tests:**
  - golden RP-001..RP-012 (GAP-03 bands and caps)
  - `expired profile → RISK_PROFILE_EXPIRED at quote`
  - `questionnaire sha pinned in profile`
  - `mismatch requires ack bound into snapshot (ackSha256 non-null)`
  - `match → ackSha256 null`
  - BOLA

### E10. Declarations and legal procedures (Dev B, 4 h)
- **Files (create):** `apps/api/src/modules/legal-consent/legal.router.ts`, `apps/api/src/modules/onboarding/declarations.service.ts`, `packages/contract/src/legal.ts`.
- **Produces:**
  - `legal.getDocument` GET `/legal/documents/{key}` (P).
  - `legal.pending` GET `/legal/pending`.
  - `legal.commissionRates` GET `/legal/commission-rates` (P).
  - `onboarding.stageDeclarations` POST `/onboarding/declarations` [K]. It stages checkbox acceptances of TNC, PRIVACY_NOTICE, RISK_DISCLOSURE, REGULAR_PLAN_COMMISSION, EXECUTION_ONLY_DECLARATION, FATCA_CRS_DECLARATION and KYC_CONSENT (plus NOMINATION_OPT_OUT_ANNEX_B); these are sealed at attest.
- **Tests:**
  - `pending lists only unaccepted current versions`
  - `stale version acceptance rejected`
  - `commission rates resolve EXACT before RANGE`

### E11. Attest, FP provisioning saga, readiness trigger, `v_onboarding_blocked` (Dev A, 16 h)
- **Files (create):** `apps/api/src/modules/onboarding/{attest.service.ts, provision.job.ts, readiness.ts}`, `apps/api/src/integrations/fp/fp-provision.ts` (implementation), migration `readiness_trigger` (custom: deferred `trg_investor_readiness` + view `v_onboarding_blocked` granted to `sanchay_readonly`).
- **Consumes:** `ConsentEngine` (ONBOARDING_ATTEST; SMS + email), `FpProvision.*(c: ConsumedConsent, …)`.
- **Produces:**
  - `onboarding.attest` POST `/onboarding/attest` [K] → `{challengeId}`. It registers `SNAPSHOT_BUILDERS.ONBOARDING_ATTEST` (spec §4.5).
  - On CONSUMED: one `consent_record` per document version plus the nomination record, then job `onboarding.provision`.
  - The provisioning chain is resumable through `provisioning_step`. Its order:
    1. `GET /v2/investor_profiles?pan=` exact, or POST;
    2. phone_numbers;
    3. email_addresses;
    4. addresses;
    5. related_parties × nominees (`fp_related_party_id`, `sent_to_fp_fields`);
    6. bank_accounts (list-and-match; `old_id` → `fp_bank_old_id`);
    7. `mf_investment_accounts` (GET `?primary_investor=` or POST `holding_pattern:"single"`);
    8. PATCH `folio_defaults`.
  - Error handling: 5xx/429 backoff ×5; 4xx → FAILED + ops alert.
  - After `saga_expires_at`: reads and adoption only.
  - `trg_investor_readiness` sets `can_purchase` / `can_exit`.
- **Tests:**
  - **FakeFp has zero P/M writes before CONSUMED (onboarding)**
  - `crash after related_parties → resume without duplicate investor_profile (list-and-match)`
  - `existing FP profile adopted by exact PAN`
  - `4xx → FAILED + recon break + v_onboarding_blocked row`
  - `after saga window only GET calls`
  - readiness truth table (8 rows)
  - `nominee OPTED_OUT sends no related_parties`
  - `H-11: no partner/euin in any payload`
  - sandbox smoke `--chain=onboarding` green

### E12. Onboarding screens batch 1 and ui batch 2 (Dev B, 26 h)
- **Files (create):**
  - `packages/ui/src/{AmountInput, MoneyText, Sheet, ListRow, Chip, Checkbox, RadioGroup, Select, SegmentedControl, ProgressSteps}.tsx`
  - `packages/features/src/onboarding/{useOnboarding.ts, OnboardingHubScreen.tsx (ONB-00), IdentityScreen.tsx (ONB-01/02), PersonalDetailsScreen.tsx (ONB-05), AddressScreen.tsx (ONB-06), FatcaScreen.tsx (ONB-07), BlockedScreen.tsx (ONB-19)}`
  - `packages/features/src/auth/{EmailOtpScreens.tsx (AUTH-04/05)}`
  - web `apps/web/src/app/(app)/onboarding/[step]/page.tsx`; mobile `apps/mobile/app/onboarding/[step].tsx`
- **Consumes:** `onboarding.get/submitIdentity/putProfile`, `me.requestEmailOtp/verifyEmail`, `ref.pincode`.
- **Tests:**
  - RTL: `PersonalDetails submit disabled until every field chosen (no defaults)`, `PEP selection shows blocked copy`, `FATCA yes shows refusal`, `email step required before ONB-00`, `pincode autofills city/state`
  - Playwright `onboarding.smoke.spec.ts` (identity → profile, FakeFp)
  - `expo-screen-capture active on ONB-01`

### E13. Onboarding screens batch 2 and CNF-01 (Dev B, 17 h)
- **Files (create):** `packages/features/src/onboarding/{BankScreen.tsx (ONB-08/09), NomineesScreen.tsx (ONB-12/13/14), RiskQuestionnaireScreen.tsx (ONB-21/22), DeclarationsScreen.tsx (ONB-15), ReviewAttestScreen.tsx (ONB-16), ProvisioningStatusScreen.tsx (ONB-17/20)}`, `packages/features/src/consent/{ConsentOtpSheet.tsx (CNF-01), useConsentChallenge.ts}`.
- **Tests:**
  - RTL: `nominee split defaults 34/33/33 editable`, `4th nominee button hidden`, `minor requires guardian`, `risk result shows level + expiry`, `CNF-01 requires both SMS and email codes for attest`, `resend countdown 30 s`, `FLAG_SECURE (usePreventScreenCapture) on CNF-01 and bank screens`
  - Playwright continues `onboarding.smoke` through attest → provisioning DONE (FakeFp autoAdvance)

### E14. Catalogue API core (Dev B, 4 h)
- **Files (modify):** `catalogue.router.ts`, `catalogue.queries.ts`, `packages/contract/src/catalogue.ts`.
- **Produces:**
  - `catalogue.getScheme` GET `/catalogue/schemes/{slug}` (facts, returns, minimums, exit load, lock-in, riskometer, TER, SID/KIM, commission line, regular-plan notice key).
  - `catalogue.amcs` GET `/catalogue/amcs`.
  - `listSchemes` gains `category`, `q`, `sort=name`.
- **Tests:**
  - `getScheme 404 for DRAFT/SUSPENDED`
  - `returns null CAGR when display_eligible=false`
  - `money fields wire-format`

### E15. FundFactsProvider, publish gate R1–R7, fact CLIs (Dev B, 6 h)
- **Files (create):** `apps/api/src/modules/catalogue/{fund-facts.provider.ts, publish-gate.ts}`, `apps/api/src/cli/ops-facts-import.ts`.
- **Produces:**
  - `FundFactsProvider.resolve(schemeId)` with precedence ADMIN > CYBRILLA > AMFI; `field_sources` and `completeness`.
  - `evaluatePublishGate(scheme, facts, nav) → {publishable, failures: R1..R7[]}`. The gate requires REGULAR ∧ GROWTH ∧ FP active ∧ `purchase_allowed` ∧ mapped category ∧ riskometer ≤ 75 d ∧ TER ∧ exit-load text ∧ SID/KIM ∧ commission line ∧ NAV ≤ 5 business days old.
  - `pnpm ops:facts:import data/fund-facts.csv`; `pnpm ops:catalogue:seed`.
- **Tests:**
  - one failing case per gate rule R1–R7
  - `ADMIN overrides CYBRILLA per field`
  - `riskometer 76 days old → unpublished`
  - `import writes fund_facts_revisions(ADMIN)`
  - `business-day age uses market_holidays`

### E16. `catalogue.returns.compute` (Dev B, 3 h)
- **Files (create):** `packages/domain/src/rules/returns.ts`, `packages/test-fixtures/src/golden/returns.json`, `apps/api/src/modules/catalogue/returns.job.ts`.
- **Produces:** `cagr(navStart, navEnd, days)` and `absoluteReturn`, computed from `nav_history` with "as of" = the latest NAV on or before the anniversary date. It writes `scheme_returns (cagr_1y, cagr_3y, cagr_5y, abs_6m, display_eligible)`.
- **Tests:**
  - RT-01..RT-06 (leap-day anniversary, missing anniversary NAV → previous available, < 1 y history → null 1Y)
  - `display_eligible false when history < period`

### E17. Explore, Fund page and minimal www (T1 applied) (Dev B, 6 h)
- **Files (create):**
  - `packages/features/src/explore/{ExploreScreen.tsx (EXP-01/02/03), SearchScreen.tsx (EXP-04/05), FundScreen.tsx (FUND-01/03), Disclosures.tsx}`
  - web `apps/web/src/app/(app)/explore/page.tsx`, `explore/category/[slug]/page.tsx`, `funds/[schemeSlug]/page.tsx`
  - www `apps/web/src/app/site/{page.tsx, legal/[key]/page.tsx, commission-disclosure/page.tsx, grievance/page.tsx, account/delete/page.tsx}`
  - mobile `apps/mobile/app/(tabs)/explore.tsx`, `app/funds/[schemeSlug].tsx`
- **Produces:** the returns table (1Y/3Y/5Y, which replaces the chart under T4), DSC-01/03/04/05, `REGULAR_PLAN_NOTICE`, the commission line, and the market-risk disclaimer.
- **Tests:**
  - RTL `disclosures always rendered`, `null return renders DASH`
  - Playwright `explore.smoke.spec.ts` (search → fund page)
  - www pages static (no client JS on `/site/legal/*`)

### E18. [T2] Explore filters and user sorts (Dev B, 6 h). Dropped once T2 is acknowledged.
- Filters: riskometer, AMC, `minSipMax`; sorts 1Y/3Y/5Y with DSC-26.
- **Tests:** `sort by 3Y shows DSC-26 caption`, `filter combination query string round-trip`.

### E19. [T4] NAV chart and `catalogue.navHistory` (Dev B, 8 h). Dropped once T4 is acknowledged.
- `catalogue.navHistory` GET `/catalogue/schemes/{slug}/nav-history?range=1Y|3Y|5Y|MAX` (≤ 260 points, downsampled). Chart built with react-native-svg.
- **Tests:** `downsample keeps first/last/min/max`, `≤260 points`.

### E20. Lumpsum order saga (H-2 custom checkout) (Dev A, 14 h)
- **Files (create):** `apps/api/src/modules/orders/{orders.schema.ts (orders, order_events), purchase.service.ts, purchase-submit.job.ts, purchase-advance.job.ts, reconcile-nonfinal.job.ts, orders.router.ts}`, `apps/api/src/modules/portfolio/folios.schema.ts` (folios table, needed for `folio_id`), `apps/api/src/integrations/fp/fp-transact.ts` (purchase operations), `packages/contract/src/orders.ts`; migration `orders_folios` (attaches `trg_consent_guard` to orders).
- **Produces:**
  - `orders.createPurchase` POST `/orders/purchases` [K] (IP) → `{orderId, challengeId}`. It re-runs the quote from E22, checks pilot caps (`AMOUNT_ABOVE_MAX` field `PILOT_CAP`), the `orders.enabled` kill switch, TPV bank VERIFIED with `fp_bank_old_id`, and IPv4 `user_ip`.
  - `orders.list` GET `/orders`; `orders.get` GET `/orders/{id}`; `orders.cancel` POST `/orders/{id}/cancel` [K].
  - Order row fields: `arn = SANCHAY_PLATFORM_ARN`, `euin NULL`, `execution_only=true`, `initiated_via`.
  - Job `orders.purchase.submit`: tx1 `submit_attempts+1`, then `POST /v2/mf_purchases {…, source_ref_id: orders.id, gateway:"ondc", initiated_by:"investor"}` under `useConsumed`, then polls 2 s for 30 s.
  - Job `orders.purchase.advance`: `pending` → `PATCH {id, consent}` → payment (E21) → `PATCH {state:"confirmed"}`.
  - Ambiguous → RECONCILING → T6 list by `source_ref_id` and adopt.
  - Job `fp.reconcile.nonfinal` (*/5; orders only in S3): absent twice 10 min apart → FAILED `PROVIDER_OBJECT_ABSENT`.
  - `SNAPSHOT_BUILDERS.PURCHASE`, with the payment method included in the snapshot.
  - Alerts: RECONCILING > 2 h WARN, > 24 h CRITICAL.
- **Tests:**
  - **FakeFp has zero P/M writes before CONSUMED (lumpsum)**
  - `consent tamper (amount edited in DB) → CONSENT_MISMATCH and FakeFp has no calls`
  - `execute_before missed → CONSENT_EXPIRED zero FP writes`
  - `FP review fail after consume → REJECTED, CONSUMED_UNUSED, retry needs new consent`
  - `timeout on POST → RECONCILING → adopt existing by source_ref_id (no duplicate)`
  - `absent twice 10 min apart → FAILED`
  - `pilot cap 100000.01 → AMOUNT_ABOVE_MAX(PILOT_CAP)`
  - `kill switch → ORDERS_DISABLED` (existing catalogue code; verify at expansion)
  - `payload omits partner/euin`
  - `cancel only in CONSENT_PENDING or CONSENTED-before-attempt`
  - `trg_consent_guard rejects SUBMITTING without CONSUMED challenge (raw SQL)`
  - BOLA on get/cancel

### E21. Payments: attempts, return route, polling, events, order emails (Dev A, 8 h)
- **Files (create):** `apps/api/src/modules/payments/{payments.schema.ts (payment_attempts), payments.service.ts, pg-return.controller.ts, payments-poll.job.ts, payments.router.ts}`, `packages/contract/src/payments.ts`; migration `payment_attempts`.
- **Produces:**
  - `POST /api/pg/payments/netbanking {amc_order_ids:[fp_old_id], method, bank_account_id: fp_bank_old_id, payment_postback_url, provider_name:"ONDC", upi?}`.
  - Raw route GET|POST `/api/v1/pg/return/{ref}` (api host). `ref` is 128-bit, single use, valid 24 h. It enqueues a re-fetch and 303s to `https://app.sanchay.in/r/payment?ref=` or, for `return_channel=APP`, `/app/r/payment?ref=`.
  - `payments.get` GET `/payments/{attemptId}`.
  - Job `payments.poll` (30 s, 1 m, 2 m, 5 m, 15 m).
  - `fp.event.process` handlers for `payment.updated` and `mf_purchase.*`.
  - A late success is honoured. Failed or late-authorised payments → `refund_status=REFUND_PENDING`.
  - `Notify ORDER_PLACED/ORDER_FAILED/REFUND_IN_PROGRESS`.
- **Tests:**
  - `postback params ignored; re-fetch decides`
  - `ref single-use and expires`
  - `UNIQUE live attempt per order`
  - `attempt FAILED keeps order AWAITING_PAYMENT ("Try again" = new order)`
  - `late success after attempt EXPIRED moves order to PROCESSING`
  - `return 303 targets per channel`
  - `no token/PII in redirect URL`
  - BOLA on `payments.get`

### E22. `quotePurchase`, cut-off engine, stamp duty (Dev B, 6 h)
- **Files (create):** `packages/domain/src/rules/{cutoff.ts, stamp-duty.ts}`, `packages/test-fixtures/src/golden/{cutoff-matrix.json, stamp-duty.json}`, `apps/api/src/modules/orders/quote.service.ts`.
- **Produces:**
  - `expectedNavDate({cutoffClass, at, holidays}) → {navDate, displayCutoff}`: display 14:30 / 13:00; regulatory 15:00 / 13:30.
  - `stampDutyEstimate(amount) = round_half_up(amount × 0.00005, 2)`.
  - `orders.quotePurchase` POST `/orders/purchases/quote` (IP): thresholds, multiples, suitability, NAV grade, eligible banks and payment methods.
- **Tests:**
  - CO-01..CO-16: before/after cut-off × standard/liquid × holiday/weekend (including 11-10) and Friday after cut-off
  - SD-01..SD-06: 500 → 0.03, 1000 → 0.05, 99999.99, half-up boundary
  - `quote never writes`
  - `MISMATCH returns ack requirement`

### E23. INV-01/02 and CNF-02/03 screens (Dev B, 8 h)
- **Files (create):** `packages/features/src/invest/{LumpsumAmountScreen.tsx (INV-01), LumpsumReviewScreen.tsx (INV-02: payment method chosen before consent, cut-off, stamp duty, TPV bank), SuitabilityWarning.tsx (CNF-03)}`, `packages/features/src/consent/ConsentStatusScreen.tsx (CNF-02)`; web routes `/invest/[schemeId]/lumpsum`, `…/review`, `/confirm/[challengeId]`; mobile equivalents.
- **Tests:**
  - RTL `payment method required before Continue`
  - `mismatch checkbox required`
  - `CNF-02 copy per state (UNDER_REVIEW "With the fund house for review")`

### E24. PAY-01, returns, result, ORD-01/02 (Dev B, 12 h)
- **Files (create):** `packages/features/src/pay/{PayScreen.tsx (PAY-01 with TPV line and "shows as Cybrilla"), ResultScreen.tsx}`, `packages/features/src/orders/{OrdersListScreen.tsx, OrderDetailScreen.tsx}`, web `/pay/[orderId]`, `/result/[orderId]`, `/r/[kind]/page.tsx` ("Open Sanchay" fallback), `/portfolio/orders[/orderId]`, mobile `app/+native-intent.tsx` (zod allowlist; strips `/app`), `app/r/[kind].tsx`.
- **Produces:**
  - Web: same-tab redirect, UPI intent on mobile web, QR on desktop.
  - Android: `WebBrowser.openAuthSessionAsync(url, 'https://app.sanchay.in/app/r/payment')`, poll on AppState resume, `Linking.openURL(upiUri)`. The dev variant uses `sanchay://`.
- **Tests:**
  - RTL `unknown deep-link params dropped`, `safeNext rejects //evil`
  - Playwright `lumpsum.smoke.spec.ts` (explore → quote → consent (Mailpit OTP) → FakeFp payment → result SETTLED)
  - Maestro local `lumpsum-return.yaml`

### E25. CDK `SanchayMvpStack-dev` (Dev A, 12 h). Overflow rank 1.
- **Files (create):** `infra/{package.json, bin/sanchay.ts, lib/sanchay-mvp-stack.ts, lib/config.ts, test/sanchay-mvp-stack.test.ts}`, `.github/workflows/deploy.yml` (GitHub OIDC; manual dispatch), `apps/api/Dockerfile`, `apps/web/Dockerfile`, `docs/adr/0014-minimal-aws-topology.md`.
- **Produces** (spec §2.4):
  - VPC with 2 AZs and 1 NAT with an EIP.
  - ALB with TLS policy `ELBSecurityPolicy-TLS13-1-2-2021-06` and `xff_header_processing.mode=append`.
  - One ECS arm64 service with containers `web`, `api` and `worker`. FP secrets go only into `worker`; `SANCHAY_KEYRING_JSON` into api and worker.
  - The one-off `migrate` task. RDS PG 18 with `rds.force_ssl=1`. S3, ECR, Secrets Manager, log groups with 400-day retention, Route 53 records for the dev hosts (`www.dev`, `app.dev`, `api.dev`; noindex).
- **Tests:**
  - CDK assertions: `FP secret only in worker container`, `RDS StorageEncrypted and force_ssl`, `ALB TLS policy`, `SG: RDS reachable only from service`, `log retention 400`
  - deploy to dev and `/health/ready` 200

**Plan 03 overflow order at f = 1.6** (≈ 41 h; these carry into the first days of Plan 04 in this order):
1. E25, which is folded into F1 as dev+prod (−4 h).
2. The E24 ORD-01/02 list and detail (4 h).
3. The remainder of E24 (8 h).
4. The remainder of E21 (≈ 8 h).
5. The remainder of E23 (≈ 8 h).
6. `onboarding.smoke` Android Maestro (local; 2 h).

Everything above E21 in Dev A's order (E1, E3, E4, E6, E7, E11, E20) and above E23 in Dev B's order (E2, E5, E8, E9, E10, E12, E13, E14, E15, E16, E17, E22) is protected.

**Plan 03 DoD.**
- Consent-first and tamper tests pass for onboarding and lumpsum.
- A BOLA test exists on every new I/IP endpoint.
- Golden vectors pass: cut-off, stamp duty, RP-001..012, nomination split, name match, returns.
- Sandbox smoke passes for onboarding and lumpsum.
- Runbook stubs are written: `stuck-reconciling.md`, `provisioning-failed.md`, `payment-not-completed.md`, `webhook-signature-failures.md`.

---

## 3. PLAN 04 (S4 Wed 11-11 → Fri 11-20, plus pilot week Mon 11-23 → Fri 11-27): SIP and mandates, ledger, portfolio, redemption, production, gate

**Goal.**
- **Fri 11-13:** the prod stack is up.
- **Tue 11-17 → Thu 11-19:** canaries (a) and (b) run.
- **Fri 11-20 (feature freeze):** SIP (UPI Autopay), the ledger, the dashboard and holdings, and redemption (amount and all) work in the sandbox on web and on the Play-internal Android build.
- **Fri 11-27:** every G-item has evidence.

**Budget.** S4 has 152 h (76 per dev). With the Plan 03 carry (≈ 37 h) plus 136 h of its own, S4 is ≈ 21 h over at f = 1.6 (§0.3). The pilot week has 51.2 h (F20–F27).

**Prerequisites:**
- **Plan 03:** `ConsentEngine` (`useConsumed`, `SNAPSHOT_BUILDERS`, `requiredFactorsFor`), `expectNoPmWritesBeforeConsumed`, `expectBola`, `orders`/`order_events`/`folios`/`payment_attempts`, `fp.event.process` handler registry, `fp.reconcile.nonfinal`, `Suitability.check`, `expectedNavDate`, `readiness` (`can_purchase`/`can_exit`), HostGuard, the returns route pattern `/api/v1/pg/return/{ref}`, `infra/lib/sanchay-mvp-stack.ts` (or its carry).
- **Plan 02:** `Notify`, `ReconBreaks`, `RuntimeConfig`, `FakeFp`, `NavService`, `canTransition` (PLAN, MANDATE).
- **Plan 01:** `@sanchay/money` (`marketValue`, `unitsForAmount`, `formatXirr` PO-5, `holdingMoney`, `allocatePercentages`).
- **Business:** G-B7 prod credentials (11-13), G-B9 Play Console (10-30), G-B10 curated list v1 (11-06), probe P-09 (units, SIP).

### F1. CDK prod (plus dev if carried), alarms (Dev A, 8 h; 16 h with the E25 carry)
- **Files (modify):** `infra/lib/{sanchay-mvp-stack.ts, config.ts}`; create `infra/lib/alarms.ts`, `docs/runbooks/credential-rotation.md`.
- **Produces:**
  - `SanchayMvpStack-prod`: Multi-AZ, PITR 14 days, deletion protection, 2 tasks, NAT EIP output for Cybrilla allowlisting.
  - Alarms routed to SNS email and SMS for both developers: 5xx, worker heartbeat, queue age > 2 min, RECONCILING SLA, M1/M3/M4, webhook signature failures, OTP send failure > 5%, SMS cap.
  - Prod deploys with `orders.enabled=false`.
- **Tests:**
  - CDK assertions: `prod MultiAz true`, `BackupRetention 14`, `DeletionProtection`, `alarm count 9 with SNS actions`
  - one PITR restore test into a scratch instance (G-E5)
  - alarm test page on Wed 11-18

### F2. SIP and mandate backend (UPI Autopay ₹1,00,000) (Dev A, 18 h)
- **Files (create):** `apps/api/src/modules/orders/{plans.schema.ts, sip.service.ts, sip-submit.job.ts, instalments-sync.job.ts, plans.router.ts}`, `apps/api/src/modules/payments/{mandates.schema.ts, mandates.service.ts, mandates-submit.job.ts, mandates-poll.job.ts, mandates.router.ts}`, `packages/contract/src/{plans.ts, mandates.ts}`; migration `plans_mandates` (CHECK `frequency IN ('MONTHLY')`; `limit_amount` CHECK per spec; attaches `trg_consent_guard`).
- **Produces:**
  - `plans.createSip` POST `/plans/sips` [K] (IP) → `{planId, mandateId, challengeId}`. One SIP_REGISTRATION challenge covers the plan and the mandate. A mandate is reused if it is APPROVED and Σ ACTIVE SIPs + new ≤ limit.
  - `plans.list` GET `/plans`; `plans.get` GET `/plans/{id}`; `mandates.list` GET `/mandates`; `mandates.get` GET `/mandates/{id}`; `mandates.authorize` POST `/mandates/{id}/authorize` [K] (re-mint while CREATED).
  - FP chain (spec §4.3):
    1. `POST /api/pg/mandates {mandate_type:"UPI", bank_account_id, mandate_limit:100000, provider_name:"CYBRILLAPOA"}`;
    2. `POST /api/pg/payments/emandate/auth {mandate_id, payment_postback_url, upi:{type:"uri"}}`;
    3. the mandate return goes through the same `/pg/return/{ref}` with kind `mandate`;
    4. `mandates.poll` (*/10 while AUTH_PENDING/BANK_PENDING; daily 07:30 for APPROVED);
    5. `plans.sip.submit` `POST /v2/mf_purchase_plans {frequency:"monthly", systematic:true, payment_method:"mandate", payment_source, source_ref_id: plans.id, …}` → `PATCH {consent, state:"confirmed"}`.
  - Job `plans.instalments.sync` (08:30, 20:30) upserts `orders(origin=SIP_INSTALMENT)`.
  - Emails: 2 consecutive misses → `SIP_INSTALMENT_MISSED_WARNING`; mandate cancelled externally → MANDATE_REVOKED email.
  - Saga 7 days with a new mandate.
- **Tests:**
  - **FakeFp has zero P/M writes before CONSUMED (SIP, UPI mandate)**
  - `reused mandate: no mandate write, plan write only after CONSUMED`
  - `headroom exceeded → new mandate required`
  - `mandate REJECTED → plan FAILED, CONSUMED_UNUSED if no plan written`
  - `7-day saga expiry`
  - `QUARTERLY rejected at contract and DB`
  - `payload frequency "monthly"`
  - `instalment upsert idempotent`
  - `2 misses → warning email once`
  - `external cancel → MANDATE_REVOKED`
  - `omits partner/euin`
  - BOLA on plans.get and mandates.get/authorize
  - sandbox smoke `--chain=sip`

### F3. [T6] eNACH rail and limit ladder (Dev A, 6 h)
- **Files (create):** `packages/domain/src/rules/mandate-ladder.ts`, golden `mandate-ladder.json`; extend `mandates.service.ts`.
- **Produces:** `mandateLimitFor(monthlySipsOnBank) = min ladder [100000, 200000, 500000, 1000000, 2500000] ≥ 1.5 × Σ`. The v1 formula `max(1L, ceil(2×))` is not ported.
- **Tests:** ML-01..ML-08 (boundaries 66,666.67 → 1L; 66,666.68 → 2L), `E_MANDATE token_url flow`.

### F4. Ledger: `applyAllotment`/`applyExit` (FIFO), folio upsert, `folio.sync`, `orders.units.reconcile` (Dev A, 12 h)
- **Files (create):** `packages/domain/src/rules/{fifo.ts, elss-lock.ts}`, golden `fifo.json`, `elss-lock.json`, `apps/api/src/modules/portfolio/{portfolio.schema.ts (lots, lot_consumptions, ledger_exceptions, redemption_reservations), ledger.service.ts, folio-sync.job.ts, units-reconcile.job.ts}`; migration `ledger` (adds `folios.fp_holdings_snapshot jsonb` and `fp_holdings_synced_at` per §0.4 item 3).
- **Produces:**
  - `Ledger.applyAllotment(tx, order)`: lot with `allotment_date = allotted_nav_date`, `stamp_duty = amount − purchased_amount`, `lock_in_until` for ELSS, folio upsert, `ORDER_ALLOTTED` email.
  - `Ledger.applyExit(tx, order, redeemedUnits)`: FIFO over unlocked lots. A shortfall is never rolled back: `ledger_exceptions(UNITS_SHORTFALL)` + folio MISMATCH + CRITICAL break (T7).
  - `folio.sync` (05:00, and on demand): folio number, registered contacts (bidx), masked payout bank, holdings snapshot.
  - `orders.units.reconcile` (every 2 h): UNITS_PENDING > T+3 WARN, > T+5 CRITICAL.
  - Units come from the provider only.
- **Tests:**
  - FIFO-01..FIFO-08 (partial lot, exact lot, spans three lots, locked ELSS lot skipped)
  - ELSS-01..ELSS-06 (lock-in ending 29-Feb 2028, month-end 31 → 30, holiday on unlock date; strict `expectedNavDate(exit) > lock_in_until`)
  - `shortfall never rolls back`
  - `successful with null units → UNITS_PENDING`
  - `stamp duty derived equals amount − purchased_amount`
  - `REVERSED untouched lot reversed; consumed lot → CRITICAL`

### F5. Redemption backend (AMOUNT, ALL) (Dev A, 16 h)
- **Files (create):** `packages/domain/src/rules/{redemption-availability.ts, redemption-buffer.ts}`, golden `redemption-availability.json`, `apps/api/src/modules/orders/{redemption.service.ts, redemption-submit.job.ts, payout-watch.job.ts}`, `packages/contract/src/orders.ts` (extend).
- **Produces:**
  - `orders.quoteRedemption` POST `/orders/redemptions/quote` (IX; reads the holdings snapshot, else REFRESHING; per §0.4 item 3).
  - `orders.createRedemption` POST `/orders/redemptions` [K] (IX). The draft tx takes `pg_advisory_xact_lock(folio‖scheme)`, recomputes, and creates an ACTIVE reservation `ceil3(amount / NAV × (1 + buffer))` plus a REDEMPTION challenge (SMS + email).
  - Formulas: `available = Σ unlocked units_remaining − Σ ACTIVE reservations`; buffer `min(10%, max(2%, 3σ√n))`; max `floor2(available × NAV × (1 − buffer))`.
  - ALL is allowed only with no locked lots, no other reservation, and the folio MATCHED within 24 h. Otherwise it sends the `floor2` amount with a residual note, then "Redeem remaining" appears once the residual exceeds 0.001.
  - Job `orders.redemption.submit`: live holdings re-check, then `POST /v2/mf_redemptions {…, source_ref_id, gateway:"ondc"}` → single `PATCH {state:"confirmed", consent}`.
  - SETTLED → `applyExit` + reservation SETTLED + `payout_expected_on` T+1 (liquid/debt) or T+2 (equity/hybrid/ELSS). Terminal failure → RELEASED with evidence.
  - `payout.watch` (10:00): past T+3 → DELAYED + investor copy + alert.
- **Tests:**
  - **FakeFp has zero P/M writes before CONSUMED (redemption)**
  - golden RA-01..RA-12 (NAV −3%, 0, +3%; reservation blocks a concurrent draft; ELSS strict 29-Feb, month-end, holiday)
  - `concurrent drafts serialised by advisory lock`
  - `nothing released while RECONCILING`
  - `FP redeemable < ledger → MISMATCH, ALL refused, AMOUNT capped`
  - `payout DELAYED after regulatory max`
  - BOLA on quote and create (foreign folio → 404)
  - sandbox smoke `--chain=redemption`
- **v1 port reference:** the `RedemptionAvailability.availableUnits/availableAmount` rounding semantics (UP at scale 8, rupee ceiling at scale 4) are ported only as a cross-check vector, marked "v1 reference". The v2 rounding follows the spec (`ceil3`, `floor2`).

### F6. [T5] Redeem by units, backend (Dev A, 2 h)
- Only if P-09 proves it and `features.redeemByUnits=true`. Otherwise a PO-2 escalation is recorded in `docs/probes/`.
- **Tests:** `UNITS mode sends units`, `flag off → VALIDATION_FAILED`.

### F7. Lean reconciliation, invariants, ops CLIs and views (Dev A, 12 h)
- **Files (create):** `apps/api/src/modules/platform/recon/{recon-fp-daily.job.ts, integrity-invariants.job.ts}`, `apps/api/src/cli/{ops-sync.ts, ops-kill-switch.ts, ops-refund-utr.ts}`; migration `ops_views` (`v_reconciling_orders`, `v_units_pending`, `v_recon_breaks_open`, `v_payouts_due` for `sanchay_readonly`; no `*_enc`).
- **Produces:**
  - `fp.reconcile.nonfinal` extended to plans, mandates and redemptions.
  - `recon.fp.daily` (02:00): orders, plans and holdings per investor.
  - `integrity.invariants` (hourly):
    - M1: no FP id without a CONSUMED challenge;
    - M3: ledger units = Σ lots;
    - M4: reservations ≤ available.
  - `pnpm ops:sync --order <id>` enqueues a re-fetch only. `ops:kill-switch` is single actor. `ops:refund-utr` needs two founders. The CLIs never write statuses.
- **Tests:**
  - `M1 fires on injected orphan fp_order_id`
  - `ops:sync enqueues fp.event.process only (no status change)`
  - `ops:refund-utr needs two distinct approvers`
  - `views exclude *_enc columns (information_schema check)`
  - `sanchay_readonly cannot SELECT base tables with *_enc`

### F8. Security suites: OTP abuse and HostGuard cross-host (Dev A, 2 h)
- **Files (create):** `apps/api/test/int/security/{otp-abuse.int.test.ts, hostguard.int.test.ts, prod-image-guard.int.test.ts}`.
- **Tests:**
  - quotas: 5 per destination per hour, 15 per day, 20 per IP per hour, 10 per device per hour, 30 s cooldown, lockout after 3 burned codes for 30 min, 2,001st SMS → SMS_UNAVAILABLE
  - `identical OtpSent shape for unknown mobile`
  - `prod config refuses capture/mailpit/fake FP/local keyring`
  - cross-host matrix on every raw route

### F9. BOLA sweep and meta-test (Dev B, 2 h)
- **Files (create):** `apps/api/test/int/security/bola-coverage.int.test.ts`.
- **Tests:** a meta-test enumerates `contract` procedures whose auth is I/IP/IX and fails if any lacks an `expectBola` registration. Every registered procedure: a foreign id → 404.

### F10. `plans.quoteSip`, first-instalment date (Dev B, 4 h)
- **Files (create):** `packages/domain/src/rules/{sip-dates.ts, sip-counts.ts}`, golden `sip-first-instalment.json`, `apps/api/src/modules/orders/sip-quote.service.ts`.
- **Produces:**
  - `plans.quoteSip` POST `/plans/sips/quote`: day 1–28 ∩ scheme `sip_dates` (not preselected); minimum = max(scheme SIP minimum, ₹100); duration "until I cancel" (360) or n.
  - `firstInstalmentDate(registeredOn, day, sipDates, holidays)` = the first allowed day ≥ registration + 2 days.
  - `sipCounts(plans) → {active, pending, …}` (the single definition used by the dashboard).
- **Tests:** SIPD-01..SIPD-08 (month roll, Feb 28, day not in `sip_dates`), `sipCounts excludes CANCELLED/FAILED/CONSENT_PENDING`.

### F11. PortfolioQueries and the XIRR engine port (Dev B, 12 h)
- **Files (create):** `packages/domain/src/rules/xirr.ts`, golden `xirr.json`, `holdings-valuation.json`, `apps/api/src/modules/portfolio/{portfolio.queries.ts, portfolio.router.ts}`, `packages/contract/src/portfolio.ts`, `docs/specs/money/xirr.md`.
- **Produces:**
  - `xirr(cashflows: {date: IsoDate, amount: Money}[]): number|null`, a port of `XirrCalculator.java` (Newton seed 0.1, tolerance 1e-7, bisection fallback, never NaN or Infinity).
  - `portfolio.summary` GET `/portfolio/summary`: invested; current value, null if any holding is unpriced; gains over valued holdings; XIRR only from 30 days (PO-5 via `formatXirr`); `activeSips` from `sipCounts`; pending amounts; "things to do".
  - `portfolio.holdings` GET `/portfolio/holdings`.
  - `portfolio.holding` GET `/portfolio/holdings/{folioId}/{isin}` (lots, lock-in, units total, available, locked and in process).
  - `portfolio.allocation` GET `/portfolio/allocation` (asset class → category; `allocatePercentages` largest remainder).
- **Tests:**
  - XIRR V1–V7 ported exactly:
    - V1 ≈ 1.0 ± 1e-3
    - V2 root 0.0684387141 (not the 0.0681 comment)
    - V3 −0.5 via bisection
    - V4 empty/one/null → null
    - V5 same sign → null
    - V6 same day → null
    - V7 finite ≈ −0.999998999999
  - Additions:
    - V8 0.1027955954
    - V9 six SIPs → 0.1332738456
    - V10 1.4678e12 returned (display suppressed by PO-5 under 30 days)
    - V11 B-01 → null (v2 fix, v1 value recorded)
  - Valuation:
    - HV-01..HV-06: an unpriced holding makes the summary value null and the gains exclude it
    - AGED NAV marked
  - Other:
    - `XIRR hidden <30 days, labelled "under 1 year" <365`
    - `allocation sums to 100.0`
    - BOLA on holding

### F12. SIP UI (UPI Autopay) (Dev B, 12 h)
- **Files (create):** `packages/features/src/sip/{SipSetupScreen.tsx (SIP-01), MandateScreen.tsx (SIP-02/MND-03), SipReviewScreen.tsx (SIP-03), SipListScreen.tsx (SIPM-01), SipDetailScreen.tsx (SIPM-02, read-only)}`; web `/invest/[schemeId]/sip`, `/portfolio/sips[/planId]`; mobile equivalents; Android mandate return through `openAuthSessionAsync(…, '/app/r/mandate')`.
- **Tests:**
  - RTL `day picker only offers scheme sip_dates, none preselected`
  - `first instalment date shown and re-shown if moved`
  - `mandate reuse message`
  - Playwright `sip.smoke.spec.ts` (FakeFp: mandate APPROVED → plan ACTIVE)

### F13. [T6] eNACH UI (Dev B, 4 h). `token_url` flow and ladder limit display.

### F14. HOME-01/02, PORT-01/02, allocation as a list (Dev B, 14 h)
- **Files (create):** `packages/features/src/home/{HomeScreen.tsx, ThingsToDo.tsx}`, `packages/features/src/portfolio/{PortfolioScreen.tsx (segments Holdings · Orders · SIPs, H-14), HoldingDetailScreen.tsx, AllocationList.tsx}`; web `/`, `/portfolio`, `/portfolio/holdings/[folioId]/[isin]`; mobile `(tabs)/index.tsx`, `(tabs)/portfolio.tsx`.
- **Tests:**
  - RTL `current value DASH when null`
  - `XIRR label per PO-5`
  - `locked units shown for ELSS`
  - Playwright `portfolio.smoke.spec.ts`

### F15. [T3] Allocation bar chart (Dev B, 2 h)

### F16. RED-01/02 with CNF, payout status (Dev B, 12 h)
- **Files (create):** `packages/features/src/redeem/{RedeemScreen.tsx (RED-01: amount / all, availability, buffer note, ELSS lock), RedeemReviewScreen.tsx (RED-02), PayoutStatus.tsx}`; web `/redeem/[folioId]/[isin]`; mobile equivalent.
- **Tests:**
  - RTL `amount above max disabled with max shown`
  - `ALL with locked lots shows residual note`
  - `REFRESHING state polls`
  - `CNF requires SMS + email`
  - Playwright `redeem.smoke.spec.ts`

### F17. [T5] Units-mode UI (Dev B, 2 h)

### F18. Android internal build, App Links, FLAG_SECURE (Dev B, 8 h). Removed by T7.
- **Files (create/modify):** `apps/mobile/app.config.ts` (`intentFilters` `https://app.sanchay.in/app/*` `autoVerify`; the scheme only when `APP_VARIANT≠production`), `apps/web/public/.well-known/assetlinks.json` (served by the web container on the app host; SHA-256 from Play App Signing), `docs/runbooks/android-release.md`.
- Build commands (one per line):
  1. `subst S: C:\Users\pc\Desktop\sanchay`
  2. `$env:APP_VARIANT='production'; pnpm --filter=@sanchay/mobile exec expo prebuild --platform android` (Git Bash: `APP_VARIANT=production pnpm --filter=@sanchay/mobile exec expo prebuild --platform android`)
  3. Gradle `bundleRelease`, then upload the AAB to internal testing.
- Set `SANCHAY_SMS_RETRIEVER_HASH` from the Play signing certificate.
- **Tests/evidence:**
  - `adb shell pm get-app-links in.sanchay.app` → verified
  - payment and mandate returns land in the app
  - FLAG_SECURE on OTP, consent and bank screens
  - app lock per H-13
  - `relaunch-without-screen-lock` Maestro local (G-E6)

### F19. Catalogue polish (Dev B, 4 h)
- Curated v1 import (G-B10), empty and error states, basic a11y labels.
- **Tests:** `publish gate report printed by ops:catalogue:seed`, `no PUBLISHED scheme fails R1–R7`.

**Pilot week (hardening at factor 1.0; 51.2 h)**

| ID | Task | Owner | h | Evidence |
|---|---|---|---|---|
| F20 | Canary (c): partial redemption Mon 11-23; reconciliation report `docs/probes/canary-2026-11.md` (units to 0.001, ARN present, EUIN blank, bank debit and payout, one signed prod webhook) | A 8 / B 4 | 12 | G-E7, G-B8 prod |
| F21 | G-E3 checklist: ASVS basics, gitleaks, `pnpm audit --prod`, PII log scan of e2e logs, TLS, RDS encryption and `force_ssl`, remaining suites | A | 4 | `docs/security/g-e3-checklist.md` |
| F22 | ZAP baseline on prod-like dev stack; cross-sign G-E3 | B | 4 | ZAP report |
| F23 | Gate evidence pack linking G-E1/E2/E4/E5 CI runs and smoke logs (3 runs on 3 days) | A | 4 | `docs/probes/gate-2026-11-27.md` |
| F24 | G-E8 runbooks consolidated (13 listed in spec §7) from sprint stubs | B | 7 | `docs/runbooks/*.md` |
| F25 | G-E6 adb and screenshot evidence | B | 2 | — |
| F26 | Fix budget for canary and gate defects (not pre-planned) | A 10 / B 6 | 16 | — |
| F27 | Invitee dry run: `ops:invite` seed, `app_config` caps, kill-switch drill | B | 2 | drill log |

**Plan 04 DoD.**
- The G-E1 consent-first suite passes for lumpsum, SIP (UPI, plus eNACH unless T6 was taken), mandate, redemption and onboarding, including the `execute_before`-missed and review-fail-after-consume tests.
- The G-E2 golden vectors pass (the list below).
- G-E4 has three sandbox runs.
- Prod runs behind the kill switch until the canary.
- M1, M3 and M4 have been green for 72 h.
- Runbook stubs are written: refund, payout delayed, UNITS_PENDING, kill switch.

---

## 4. Traceability

**G-E2 golden vector files** (`packages/test-fixtures/src/golden/`), with the task that creates each:

| File | Task |
|---|---|
| `xirr.json` (V1–V11) | F11 |
| `holdings-valuation.json` | F11 |
| `redemption-availability.json` | F5 |
| `fifo.json`, `elss-lock.json` | F4 |
| `mandate-ladder.json` | F3 |
| `stamp-duty.json`, `cutoff-matrix.json` | E22 |
| `suitability-rp.json`, `risk-profile.json` | E9 |
| `nomination-split.json` | E8 |
| `name-match.json` | E7 |
| `returns.json` | E16 |
| `sip-first-instalment.json` | F10 |

Money/format vectors already exist from A3–A8.

**G-E1 consent-first tests:** E11 (onboarding), E20 (lumpsum, tamper, `execute_before`, review-fail), F2 (SIP and mandate), F3 (eNACH), F5 (redemption). All use `expectNoPmWritesBeforeConsumed`.

**Trim to task map:**

| Trim | Tasks |
|---|---|
| T1 | E17 www minimal (applied) |
| T2 | E18 |
| T3 | F15 |
| T4 | E19 |
| T5 | F6, F17 |
| T6 | F3, F13 |
| T7 | F18, plus the Android parts of E24, F12 and F16 |
| T8 | F2, F3, F10, F12, F13 |

**Totals** (ideal hours):
- **Plan 02:** 80.
- **Plan 03:** 248 (234 after T2/T4).
- **Plan 04:** 150 in S4 (136 after T3/T5/T6), plus 51 in the pilot week.
- **Remaining MVP after Plan 01:** 478 h, against 424.8 h of S2-remaining to S4 capacity at f = 1.6. With T1–T6 acknowledged, the break-even factor is **1.68**.

### Critical Files for Implementation
- C:/Users/pc/AppData/Local/Temp/claude/C--Users-pc-Desktop-sanchay/2f00d411-382c-43a6-bd67-ecaf60c67db1/tasks/wk14xlx18.output (`result.interfaceSheet` §5.7–§5.8 platform symbols and layout; `result.planChunks`; `result.registerMoney` D-MONEY-004/041/109 for the class list and approve steps)
- C:/Users/pc/AppData/Local/Temp/claude/C--Users-pc-Desktop-sanchay/2f00d411-382c-43a6-bd67-ecaf60c67db1/tasks/wsx2mey6n.output (`result.finalDesign` §B.1/B.4 T1–T7, §F.1–F.10 flows and redemption buffer σ/n, §G onboarding)
- C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/service/XirrCalculator.java and src/test/java/com/platizio/wealthtech/service/XirrCalculatorTest.java (F11 V1–V7 port)
- C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/integration/nav/AmfiNavParser.java and src/test/java/com/platizio/wealthtech/integration/nav/AmfiNavParserTest.java (D9 port and its 37 named cases)
- C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/service/RedemptionAvailability.java and service/InvestorActionService.java (F5 reference vectors; lines ~690–760 custom-checkout order for E20/E21; lines 1014–1019 mandate formula not to port in F3)
