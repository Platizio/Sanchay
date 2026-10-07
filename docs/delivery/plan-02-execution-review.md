# Plan 02 (Sprint 2) execution review (2026-10-07)

**Result.** All 12 Plan 02 tasks (D0-D10, E25) are implemented on `feat/plan-02-mvp-kernel`. Every task passed a spec and quality review, and every wave was merged with these checks green: `pnpm verify`, `pnpm test:int`, `db:check` and `check-brand`. An eight-area final review on Opus found nine must-fix items (MF-1 to MF-9; three close PII paths). One fix wave applied them test-first, and a scoped re-review confirmed all nine. Final suites: api unit 255, infra 28, api integration 202. The plan errata are RV-02-81 to RV-02-93 in the plan header.

**How it ran.** D0 and D1 ran one at a time. The owner then asked for a multi-agent run. D2 to E25 ran as parallel lanes, each in its own git worktree, with an implementer, a reviewer and up to two fix rounds per task:

| Wave | Tasks |
|---|---|
| 1 | D5, D8 |
| 2 | D3, D6, D9 |
| 3 | D4, D7, D10 |
| 4 | E25 |

After each wave, an integrator merged the lanes in plan order, ran every check and stopped on red. The controller pushed after each wave.

**Not run.** E25's AWS steps: bootstrap, deploy, secrets, image push, the migrate task and the `deploy.yml` dispatch. They need the AWS account and `sanchay.in` (decisions page C4). D4's `--env=sandbox` smoke run was also skipped; Plan 04 F29 replaces the chains, and F29's sandbox dry run passed on 10-07.

## Rulings the controller made during the run

- Ruling: no push of `feat/plan-02-mvp-kernel` until the owner says so — AGENTS.md: the owner authorises every push, and readiness item 7 is still open — cost if wrong: CI runs later than it could.
- Ruling: the D0 implementer also makes one separate commit updating AGENTS.md's branch line to `feat/plan-02-mvp-kernel` — Plan 02's header asks whoever creates the branch to do it, and no task's Files list owns it — cost if wrong: one doc-only commit to revert.
- Ruling: E25 is executed up to everything that runs locally (code, tests, `cdk synth`); the AWS deploy steps stop and are reported, because the AWS account, `sanchay.in` and its hosted zone (decisions page C4) do not exist yet — cost if wrong: none; the deploy is impossible without them.
- Ruling: when a plan's code is wrong at execution time, the implementer makes the smallest fix that keeps the task's intent, and records it as a deviation in its report; the controller later writes each into Plan 02 as an RV-02 erratum (next RV-02-81) — the plan says "expect execution-time fixes" — cost if wrong: an erratum describing a fix the owner would have done differently.
- Ruling: implementers and reviewers run on `sonnet`; the final whole-branch review on `opus` — the tasks carry full code but need integration debugging (Testcontainers, never run before) — cost if wrong: slower or pricier tasks.
- Task D1: Ruling: fix the plan-mandated "route not compared on replay" (Important 1) — the same key on another [K] route must be refused (422 IdempotencyKeyReused), not replayed; every later [K] route builds on this kernel — cost if wrong: one extra comparison.
- Task D1: Ruling: fix the plan-mandated null/void handler output (Important 2) by storing JSON null so the pair CHECK holds and the key completes — later [K] procedures may return nothing — cost if wrong: none for object outputs.
- Task D1: Ruling: add a check that sanchay_app can DELETE (release) and INSERT/UPDATE idempotency_keys, because the int tests connect as the owner and release() depends on 0003's default privileges (reviewer ⚠️, confirmed: tests do not run as sanchay_app) — cost if wrong: one extra test.
- Ruling: inside the workflow, fix agents fix plan-mandated findings only when they are real defects that change no other task's interface, ruling or shared contract; otherwise they report "not fixed" for a controller ruling after the run — keeps lanes moving without the controller in the loop — cost if wrong: a plan-mandated defect the controller would have fixed waits until the final review.
- Ruling: the per-task fix cap is 2 rounds inside the workflow (not 5); findings still open at the cap are merged and carried to the final review for adjudication — the final opus review is the net — cost if wrong: one more fix wave at the end.
- Ruling: E25 stops before any AWS call or deploy (decisions page C4 open); D4's sandbox smoke run is out of scope (F29 covers it).
- Ruling: from wave 2 on, one workflow run per wave; integrators never push; the controller pushes after each wave — honours "push after each task" without routing a push around a subagent's permission check — cost if wrong: none.
- Ruling: integrators run `pnpm verify` with the CI fixture env SANCHAY_PLATFORM_ARN=ARN-000000 and SANCHAY_PLATFORM_ARN_VALID_TILL=2099-12-31 (apps/web's build needs them; CI sets the same fakes) — cost if wrong: none.
- Ruling: migration numbers follow the merge order, not the plan header's table: 0009 catalogue (D8), 0010 provider_calls (D3), 0011 notifications (D6); D7 and later take the next free number — drizzle-kit numbers sequentially and nothing is deployed yet, so no database has an older journal — cost if wrong: Plan 03/04 texts naming the old numbers need an erratum (recorded below).
- Ruling: D4 pins tsx 4.23.15 (newest past the 7-day age, per the plan header's rule), not the brief's 4.19.2 — the header governs unverified versions — cost if wrong: none observed (suites green).

## Final review synthesis (must-fix, deferred items, and the rulings needed before Plan 03/04 tasks)


Branch `feat/plan-02-mvp-kernel` at `473ab7e`. This synthesis draws on 8 area reviews (A-platform, A-identity-invite, A-domain-web, A-fp, A-notify, A-catalogue, A-infra, A-other). I spot-checked the merge-blocking claims against the code with read-only, focused reads.

### Checks I ran myself

- **Job error leak.** `jobs.service.ts:102-104` passes `handler.handle(job)` straight to `boss.work`, with no catch. `ses.sender.ts:28` wraps the raw SDK error as `cause`. `msg91.sender.ts:65` copies `body.message` into the error text, and `notifications.job.ts:108` rethrows. **Confirmed.** A-platform #1 and A-notify #1 describe the same defect at two layers. Both layers are fixed below (MF-1, MF-2).
- **FP response meta.** `FP_REDACT_KEY_PATTERNS` in `fp-transport.ts:95-112` has no pattern that matches a bare `number`, `taxid_number` or `geo_location`/`latitude`/`longitude`. `meta()` keeps string leaves on responses. **Confirmed.**
- **FakeFp ordering.** In `fake-fp.ts:229-256`, `route()` runs before the script is applied, so a scripted `{status, body}` reply still mutates state. **Confirmed.** In `fp-provider-calls.int.test.ts:31-38` the test adds its own `intercept()` on top of FakeFp's agent. I did not re-run the reviewer's scratch reproduction. The structure matches their finding.
- **429 handling.** `fp-transport.ts:264` turns every status >= 400 that is not a 5xx or 409 into a rejection. **Confirmed.** Plan 03 does not change how FpTransport classifies 429 (its only `429` hits are API error codes), so no later task owns this.
- **Web runtime env.** In `apps/web/Dockerfile`, `SANCHAY_PLATFORM_ARN` and `SANCHAY_PLATFORM_ARN_VALID_TILL` are `ARG`s in the build stage only. The runtime stage sets only NODE_ENV, PORT and HOSTNAME. `readSiteConfig(env = process.env)` zod-parses both keys and throws when they are missing. **Confirmed.** Plan 04 F1 lists `SANCHAY_PLATFORM_ARN_VALID_TILL` as a web-image build input and does not change the runtime env, so no later task owns this.
- **Secrets removal policy.** At `infra/lib/sanchay-mvp-stack.ts:102-118` the four `secretsmanager.Secret`s have no `removalPolicy`. The RDS instance is RETAIN. **Confirmed.** No Plan 04 task adds a removal policy to the secrets. F1 touches only the log groups.
- **SEBI taxonomy.** `data/sebi-categories.csv` has the 2017 set (`EQ_VALUE_CONTRA`, `EQ_SECTORAL_THEMATIC`, `OT_ETF`, `LC_RETIREMENT`, ... with `sebi_ref .../2017/114`). fund-data.md §4.1 lists the 2026 set (`EQ_FLEXI_CAP`, `EQ_VALUE`, `EQ_CONTRA`, `HY_EQUITY_SAVINGS`, `LC_LIFE_CYCLE`, `OT_INDEX_ETF`, `OT_FOF`, ...). **Confirmed.** The old codes appear only in `data/category-aliases.csv` and `data/curated-schemes.csv`, not in any TS source, so the fix touches data only.
- **ops:invite ownership.** Plan 04 F7 rewrites `ops:invite`: it reads mobiles from an SSM SecureString and runs as a separate ops task. The CLI items from A-identity-invite and A-other therefore go to F7.

#### Duplicates I merged

| Merged item | Raised by |
|---|---|
| Raw errors reach pgboss.job.output | A-platform #1 + A-notify #1 |
| Zero-delay retries with no backoff | A-platform #2 + A-notify minor |
| `runInTx` concurrency | A-platform triage + A-fp minor |
| `sslrootcert` instead of `NODE_EXTRA_CA_CERTS` | A-infra minor + A-other minor |
| `Msg91Credentials` declared twice | Three triage lines |
| FakeFp duplicate answered as 409 | A-fp #5 + D4 deviation |
| ops-invite gaps | A-identity-invite + A-other |
| `catalogue.fp.sync` scheduling and auto-publish | A-fp triage + A-catalogue |

#### Disagreements I resolved

- **A-platform #1** was "important, must fix". **A-notify** fixed only the sender. I keep both fixes. Sanitising in the wrapper covers every future Plan 03 handler (Drizzle params). Sanitising the sender also covers the OTP path, where pino logs the cause.
- **ops:invite re-invite and validation.** A-identity-invite placed this "before G-B11 seeding 11-20". A-other placed it in "Plan 04 F7". F7 owns it. If F7 has not landed by 11-20, G-B11 seeding needs the renew path or manual SQL.

---

### 1. must_fix

These are all critical, or important and cheap and local. One fix agent applies them on `feat/plan-02-mvp-kernel`, then runs `pnpm verify` and the api int suite.

#### MF-1: sanitise handler errors before pg-boss stores them (PII in `pgboss.job.output`)

- **Where:** `apps/api/src/modules/platform/jobs/jobs.service.ts:102-104` (the `boss.work` callback).
- **What:** pg-boss serialises the thrown error with serialize-error (message, stack, `cause` and every own property) into plaintext `pgboss.job.output`. Two things end up there:
  - a DrizzleQueryError's bound params, which may include a mobile number;
  - an SES sandbox rejection, which names the recipient email.

  This bypasses the EF-B4 redaction.
- **Fix:**
  1. Wrap `handler.handle(job)` in try/catch.
  2. In the catch, log the original error once through the pino logger, using the `err` serializer so the existing redaction applies.
  3. Rethrow a fresh `Error` whose `name` is the original name, which carries an optional `code` (string only), and whose message is `redactBoundParams(message, err)` (from `modules/platform/logging.ts:90`). It must have no `cause` and no other own properties.
  4. Clear the stack, or rebuild it from the sanitised message only.
- **Test:** add an int case to `apps/api/test/int/jobs.int.test.ts`. Register a test handler that throws a DrizzleQueryError-shaped error whose `params` include `'9876543210'` and whose `cause` message holds an email address. Wait for the job to reach `failed` or `retry`. Assert that `SELECT output::text FROM pgboss.job WHERE id = $1` contains neither value and still contains the error name.

#### MF-2: provider senders must not carry provider free text or raw SDK errors

- **Where:** `apps/api/src/integrations/email/ses.sender.ts:27-29`; `apps/api/src/integrations/sms/msg91.sender.ts:59-66`.
- **What:** In the SES sandbox, a `MessageRejected` message lists the recipient address. It travels as `cause` into the pino `err` output on the OTP path and into job output on the notifications path. MSG91 copies `body.message` into the error text. The `catch (cause)` around fetch also forwards a raw cause.
- **Fix:**
  - **SES:** throw `new SenderUnavailableError(\`ses: send failed (${name} ${httpStatus})\`)`, built only from `cause.name` and `cause.$metadata?.httpStatusCode`. Do not attach a `cause`.
  - **MSG91:** use a fixed message (`'msg91: provider error'`), plus a provider code only if one is structured. In the fetch catch, keep only `cause.name`, for example a timeout or network error, and attach no `cause`.
- **Test:**
  - `ses.sender.test.ts`: the mocked client rejects with an error whose message contains `investor@example.com`. Assert that the address appears in neither `err.message` nor `err.cause`, and that `err.cause` is undefined.
  - `msg91.sender.test.ts`: the response `{ type: 'error', message: 'invalid mobile 9876543210' }`. Assert that the number does not appear in the error.

#### MF-3: FP response meta becomes an allowlist (PII in append-only `provider_calls.response_meta`)

- **Where:** `apps/api/src/integrations/fp/fp-transport.ts:95-133` (`FP_REDACT_KEY_PATTERNS`, `redactFp`, `meta`).
- **What:** The denylist misses phone_numbers `number`, investor_profiles `taxid_number` (a PAN) and `geo_location{latitude,longitude}`. These would land in plaintext on E11's first real call, and `provider_calls` is append-only, so the rows can never be erased.
- **Fix:** response meta keeps string leaves only for allowlisted keys:
  - `id`, `object`, `status`, `state`, `old_id`, `created_at`, `updated_at`, `gateway`;
  - `error.status` and `error.code`, plus `code` and `status` at any depth.

  Every other string leaf becomes `[REDACTED]`. Numbers become strings through `numbersAsStrings` and are redacted unless the key is allowlisted, because a latitude or a 10-digit number is PII. Keep the existing key denylist as a second layer. Request meta keeps `stringLeaves=true`. Update the doc comment.
- **Test:** add unit cases in `fp-transport.test.ts`.
  - Echo a phone_numbers response `{ id, object: 'phone_number', number: '9876543210', isd: '91' }`. Assert that `responseMeta` does not contain the number and keeps `id`.
  - Echo an investor_profiles response with `first_tax_residency.taxid_number: 'AAAPA3751A'` and `geo_location: { latitude: 19.07, longitude: 72.87 }`. Assert that none of the three values reach `responseMeta`.

#### MF-4: the int-test PII check passes vacuously (FakeFp's catch-all shadows the test's interceptor)

- **Where:** `apps/api/test/int/fp-provider-calls.int.test.ts:24-49` (and the token and route `intercept()`s in its sibling worker tests); `apps/api/src/integrations/fp/fake/fake-fp.ts` (class doc).
- **Fix:**
  - Replace the hand-made interceptors with `t.fakeFp.script('schemePlans.list', { status: 200, body: { object: 'list', data: [], pan: 'AAAPA3751A', mobile: '9876543210' } })`. Keep the `not.toMatch(/9876543210|AAAPA3751A/)` assertion. Add `expect(JSON.stringify(row.responseMeta)).toContain('[REDACTED]')` to prove the scripted payload was served.
  - Remove the now-redundant token and route interceptors in that file.
  - Add a doc line on `FakeFp`: interceptors added to `agent` after construction never match, so use `script()`.
- **Test:** this is the test itself. Confirm it fails RED when the MF-3 allowlist is temporarily reverted, then restore the allowlist.

#### MF-5: a scripted FakeFp 4xx must not create state

- **Where:** `apps/api/src/integrations/fp/fake/fake-fp.ts:229-256` (`handle`).
- **What:** A scripted `{status: 4xx}` runs `route()` first, so the fake records an object that real FP never created. Plan 03 E11's R-17 test (create returns 422, then re-attest) would then adopt a phantom object through LOOKUP-ADOPT.
- **Fix:** read the script before calling `route()`. If its mode is an object whose `status` is 400-499 and not 409, consume the script, log the call and return the scripted reply without calling `route()`. Keep route-then-fail for `'timeout'`, `'5xx'`, `'409-dup'` and 2xx object scripts.
- **Test:** add to `fake-fp.test.ts`. Script `purchase.create` with `{ status: 422, body: {...} }`, then make the create call, then call `purchase.list` with that `source_ref_id`. Assert that the list is empty. Add a second case: `'timeout'` still leaves the object listable, which guards the intended behaviour.

#### MF-6: FP 429 and 408 are ambiguous (retryable), not terminal rejections

- **Where:** `apps/api/src/integrations/fp/fp-transport.ts:264` (the `>= 400` branch).
- **What:** The spec's provisioning row says "5xx/429 backoff ×5; 4xx → FAILED". Today a throttle becomes `FpRejectedError`, which E11 turns into FAILED plus a CRITICAL break.
- **Fix:** before the rejected branch, map 429 to `FpAmbiguousError(op, { status })`, recorded with `errorCode: 'RATE_LIMITED'`, and 408 to the same error with `errorCode: 'TIMEOUT_408'`. Leave 401/403 eviction for the E20 ruling (see defer).
- **Test:** add a unit case in `fp-transport.test.ts`. A 429 reply makes `call()` reject with `FpAmbiguousError`, and the `provider_calls` row is recorded with `error_code = 'RATE_LIMITED'`. Add the same case for 408.

#### MF-7: the prod web container lacks the platform ARN at runtime (every /login, /signup and app-shell page fails)

- **Where:** `apps/web/Dockerfile` runtime stage (lines 27-37).
- **Fix:** after `FROM ${NODE_IMAGE} AS runtime`, add:

  ```dockerfile
  ARG SANCHAY_PLATFORM_ARN
  ARG SANCHAY_PLATFORM_ARN_VALID_TILL
  ENV SANCHAY_PLATFORM_ARN=${SANCHAY_PLATFORM_ARN}
  ENV SANCHAY_PLATFORM_ARN_VALID_TILL=${SANCHAY_PLATFORM_ARN_VALID_TILL}
  ```

  deploy.yml already passes both values as build args. Alternatively, put both values in the CDK web container env. That needs VALID_TILL as a new deploy input, so the Dockerfile route is preferred.
- **Test:** in `infra/test/sanchay-mvp-stack.test.ts`, read `apps/web/Dockerfile` the same way the existing api-Dockerfile string checks do. Assert that the text after the `AS runtime` line contains `ENV SANCHAY_PLATFORM_ARN=` and `ENV SANCHAY_PLATFORM_ARN_VALID_TILL=`.

#### MF-8: secrets must survive teardown next to a retained RDS instance (the keyring is the only key to the PII)

- **Where:** `infra/lib/sanchay-mvp-stack.ts:102-118` (KeyringSecret, FpSecret, FpWebhookSecret, Msg91Secret) and the generated db-master secret (`dbInstance.secret`, line ~159).
- **Fix:**
  - Add `removalPolicy: RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE` to all four `secretsmanager.Secret`s.
  - Call `dbMasterSecret.applyRemovalPolicy(RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE)`. The cast goes through the `Secret` construct, or use `dbInstance.node.findChild('Secret')`.
  - Construct ids are unchanged, so the F1 interface sheet is not affected.
- **Test:** in the existing secrets test, assert that every `AWS::SecretsManager::Secret` resource in the template has `DeletionPolicy: 'RetainExceptOnCreate'` and `UpdateReplacePolicy: 'Retain'`. This matches the pattern already used at lines 188-239.

#### MF-9: seed the 2026 SEBI taxonomy, not the 2017 one

- **Where:** `data/sebi-categories.csv`, `data/category-aliases.csv` (target codes), `data/curated-schemes.csv` (row 6, Parag Parikh Flexi Cap).
- **What:** 19 of the 40 codes differ from fund-data.md §4.1 and D-MONEY-077. "Flexi Cap" is aliased to `EQ_MULTI_CAP`. Plan 03's catalogue tasks key on these codes.
- **Fix:**
  - Replace the 40 rows with fund-data.md §4.1 (A1-A13, B1-B17, C1-C7, D1, E1-E2):
    - `asset_class` from the table's `class` column;
    - `name` from the 2026 name;
    - `slug` in kebab case;
    - `sebi_ref` set to the 26-Feb-2026 circular `HO/24/13/15(2)2026-IMD-RAC4/I/5764/2026`;
    - `cutoff_class` set to `OVERNIGHT` for DT_OVERNIGHT and `LIQUID` for DT_LIQUID, `STANDARD` otherwise;
    - `OT_FOF` set to `STANDARD`. The overseas cut-off is a per-scheme sub-type, see defer D8.
  - Keep the `volatility_class` mapping by asset class.
  - Repoint `category-aliases.csv`: `Flexi Cap` to `EQ_FLEXI_CAP`, Value/Contra and Sectoral/Thematic to the split codes, `*_DURATION` to `*_TERM`, ETF/Index to `OT_INDEX_ETF`, FoF to `OT_FOF`, and so on. Where an old label is genuinely ambiguous (the old combined "Sectoral/Thematic"), mark it for review rather than guessing.
  - Set curated row 6 to `EQ_FLEXI_CAP`.
  - Do not add the legacy `active=false` rows in this fix (see defer D8), so the count stays 40.
- **Test:** `catalogue-schema.int.test.ts` "40 SEBI categories" still passes. Add an assertion that the asset-class split is `{EQUITY:13, DEBT:17, HYBRID:7, LIFE_CYCLE:1, OTHER:2}` and that `EQ_FLEXI_CAP` and `HY_EQUITY_SAVINGS` exist. Run the seed int test, so every curated scheme and alias resolves to an existing code.
- **Fallback:** if the controller prefers not to change the seed on this branch, it must record an explicit ruling plus a Plan 03 erratum before any Plan 03 task consumes category codes. This is not optional.

**Excluded from must_fix because a later task owns them:**
- NAV-06 matched floor: Plan 04 F19.
- `catalogue.fp.sync` auto-publish and schedule: F19.
- ops:invite CLI gaps: Plan 04 F7.
- deploy.yml masking and waiter timing: F1.
- fp-probes status checks: F29.
- Cursor pagination: E14.

---

### 2. defer (Plan 02 errata or backlog), grouped by task

#### Rulings the controller must make before the named Plan 03/04 task

- **R-a (before Plan 03 E21): PAYMENT_ATTEMPT late_auth.** EXPIRED and FAILED attempts have no exits, so E21's `payments.poll` `moveAttempt(..., 'SUCCESS')` throws, and a late payment is dropped with no refund flag. Option A: add EXPIRED/FAILED -> SUCCESS edges with a `late_auth` carve-out in the "terminal states have no exits" test. Option B: keep the attempt terminal, set a `late_auth` flag, and add an E21 erratum. Either way, add a covering test and regenerate states.md.
- **R-b (before E20): FP duplicate source_ref_id.** Real FP answers it with a validation error. FpTransport treats that as a rejection, and FakeFp's `'409-dup'` models it as 409. Use a sandbox probe (F29) to capture FP's exact status and code. Then classify that code as `FpAmbiguousError('DUPLICATE_SOURCE_REF_ID')` and make FakeFp return the real status and code. The FakeFp duplicate payment answer (D4) is the same issue.
- **R-c (before E20): FpTransport edge semantics.**
  - token failure as ambiguous, and not recorded in `provider_calls`;
  - 401 token eviction;
  - an unparsable 2xx M-class body must be ambiguous;
  - an awaited `recordCall` failure replaces the FP result;
  - 3xx counted as success.
- **R-d (before the first prod bootstrap or Plan 03 E1): default job retry policy.** Today every queue has retry_delay 0 and no backoff. Proposal: `retryDelay 30, retryBackoff true, retryDelayMax`, passed in createQueue and the enqueue defaults and recorded next to JOB_POLICIES. After E25 bootstraps prod, `createQueue` ON CONFLICT DO NOTHING ignores new options, so this then needs `updateQueue`. The A-notify duplicate is folded in.
- **R-e (before GO-1, pilot-gate row in rulings.md): MSG91 DLT contract.**
  - `VAR_BODY` carries the whole text, against the 30-character `{#var#}` cap;
  - the flow id is used as the DLT template id;
  - the SmsMessage port is text-only.

  Fix: structured DLT variables on SmsMessage, `{flowId, dltTemplateId}` per key, the v5 flow shape, and the golden-bytes test for all four templates. Verify against the approved templates.
- **R-f (before Plan 03 E4): `sms.dlr.sync` (R-13) has no owner.** The D6 outline listed it, but D6 did not deliver it. Assign it to E4 or a new task and correct E4's wording "D6's sms.dlr.sync updates it later".
- **R-g (Plan 04): PLAN has no ACTIVE -> CANCELLED or FAILED edge for FP auto-cancel** (`consecutive_failed_installment_limit_exceeded`). Add the edges, plus a Plan 04 erratum so `instalments.sync` or the plan re-fetch applies them.
- **R-h: MANDATE_SETUP -> CONSENT_EXPIRED** (`seven_day_saga_no_plan_write`) contradicts spec §4.3, which says FAILED. Accept CONSENT_EXPIRED or add the FAILED edge in Plan 04.
- **R-i (before F19 or the first non-local catalogue sync):** keep `catalogue.fp.sync` unscheduled and never enqueued while real investors exist, until F19 removes the status write.
- **R-j:** the prod env invariant should require `SANCHAY_PROVIDER_MODE_FP=production` when `SANCHAY_APP_ENV=prod`, or the gap should be ruled acceptable.
- **R-k:** FP snake_case keys and the platform `REDACT_KEY_PATTERNS`. Promote the FP list for any logger that handles FP payloads.

#### D0 (EF fixes)
- `redactBoundParams` prefix ordering edge case in logging.ts.
- The log hook writes `msg ''` when the error message is empty.
- The AppShell.hydration test leaks its root on failure (no try/finally, no unmount).
- The EF8-5 int test covers only the cross-investor branch. Add non-UUID and wrong-purpose challengeId cases.
- Residual EF8-5: email lockout is keyed by destination only, so investor B can lock A's unverified email. Key it on (destination, referenceId) in P2, or record it as an accepted risk.

#### D2 (jobs, worker, readiness)
- Shutdown: move the drain to `beforeApplicationShutdown`, and clear `ready` after `boss.stop` resolves. Today the order depends on AppModule import order, and self-re-enqueue fails during the drain. This belongs to Plan 03 E1.
- Heartbeat id `worker:${process.pid}` is `worker:1` for every task. Use the ECS task id or the hostname plus the pid (F24 runbook).
- `idempotency.service.ts:64-68`: the DELETE of an expired row needs `AND expires_at <= now`. Add an expired-keys and stale-heartbeats sweep.
- `drizzleAdapter` expands arrays into `(a, b)`. Use `sql.param`, or assert the adapter is send-only.
- migrate.ts starts a full PgBoss. Use `supervise:false, schedule:false`, wrap start/stop in try/finally, and document BAM draining for a pg-boss bump.
- `IDEMPOTENCY_IN_PROGRESS` and `OTP_COOLDOWN` have no `Retry-After` header. Emit it from the exception filter, or rule that the body field is the contract.
- The schedules test only checks `typeof`. Query `pgboss.schedule` for name, key, cron and `tz = Asia/Kolkata`. Do this before Plan 03 adds schedules.
- heartbeat.ts swallows beat failures without logging.
- 'api role does not start processing', 'processed once >= 1' and 'worker does not listen' are weak tests.
- The health router's heartbeat SELECT is outside try/catch.
- worker.main has both `enableShutdownHooks` and a SIGTERM listener, which gives exit 1 after the drain.
- boss-errors.ts and its tests are outside the Files list (a declared erratum).

#### D3 (FP transport)
- `runInTx` shares `dbInTx` on one CLS store, so concurrent transactions reset each other. Use `cls.run({ ifNested: 'inherit' })`. Plan 03 must route FP-adjacent transactions through `runInTx`.
- Request bodies use plain `JSON.stringify`, so a LosslessNumber is sent as an object. Use lossless-json `stringify`; this removes D4's `Number(String())` workaround.
- `fetchToken` gives `'Bearer undefined'` on a non-JSON body or a missing `access_token`. Fix this with the R-c token work.
- Test gaps: `numbersAsStrings`, the 5xx path, `runInTx` restore, the live `forRoot` refusal.
- Stubs throw synchronously from Promise-returning methods. Plan 03/04 replace them.
- `new URL(path, base)` drops a base path prefix. Latent: FP base URLs are host-only.
- `BodyFailingAgent` relies on undici's legacy handler internals (pinned 7.30.0, R-43).
- `createMandate` `mandateLimit: number` should be a decimal string or Money when F2 wires it.

#### D4 (FakeFp, probes)
- The default route returns 200 with an empty list for unmodelled P/M creates. Return 501 `FAKE_FP_NOT_IMPLEMENTED` for non-R ops.
- Add tests for scripted 5xx and 409-dup route-then-fail.
- `autoAdvance` is unread and webhooks are only queued (E1/E20 placeholders).
- The payment `token_url` hard-codes `pg.fake.local`.
- The README references a missing path. `smoke.test` never closes its MockAgents. The evidence directory is relative to cwd. F23/F29 rewrite these files.
- `tools/fp-probes/src/fp-client.ts` ignores HTTP status. F29 (R-39) replaces it before any counted G-E4 run.

#### D5 (state machines)
- MANDATE dead ends, as an additive Plan 04 F2 erratum:
  - RECONCILING -> EXPIRED/REJECTED (`provider_object_absent`);
  - CREATED -> EXPIRED/REJECTED;
  - CONSENT_PENDING/CONSENTED -> CANCELLED.
- `FpOrderState` omits `confirmed` and `cancelled`, and includes `expired`, which the research does not list. Add the mappings and edges in a Plan 03 E20 erratum, and confirm `expired` in the sandbox.
- `canTransition` with an omitted trigger acts as a wildcard. Make `trigger` required, or add `hasEdge` for tests, and fix the legality test.
- Plan 04 erratum: drop the duplicate `UNITS_PENDING -> REVERSED` append (plan-04 :7074/:8811/:7501). Its Step 2 RED cannot fail.
- ONBOARDING is unused (Plan 03 defines its own stages). E11 should adopt it or remove it and its states.md section.
- Weak tests: 'RECONCILING exits only to a mapped FP state' and 'renderStatesDoc is deterministic'. Assert exact exit sets, and compare the snapshot with docs/specs/states.md.
- ORDER_TERMINAL lists SETTLED even though SETTLED -> REVERSED exists. Add a doc note.
- PROCESSING -> SKIPPED is unused. CHALLENGE's split from spec §4.1 step 7 is an accepted deviation.
- `localeCompare` in renderMachine: optional hardening to a code-unit compare. It is verified stable on node:24-slim.
- The `gen:states` script key is not alphabetised (cosmetic).

#### D6 (notifications, SMS)
- Count attempts across the whole handler: a throw before `email.send` leaves the row PENDING forever. Use pg-boss's retry count, or write FAILED on the last attempt.
- `notification_deliveries.notification_id` should be unique, with ON CONFLICT DO NOTHING and a re-select.
- No request timeouts: add `AbortSignal.timeout` on the MSG91 fetch and a `NodeHttpHandler` `requestTimeout` on SESv2Client.
- Vacuous int cases: 'known device', 'retries 3x then FAILED', 'payload_enc never logged', `not.toContain('NATIVE')`.
- `Msg91Credentials` is declared twice. Merge it into one type when the DLT shape changes (R-e).
- SECURITY_NEW_SIGN_IN is enqueued for investors with no verified email (SKIPPED noise). The copy reads "from a WEB/ANDROID" and goes to the pre-pilot copy pass.
- A failure between a successful send and the UPDATE causes a resend. At-least-once delivery is accepted.
- `integrations.module.test.ts` was edited outside the Files list (accepted).

#### D7 (pilot invites)
- No test checks that the gate runs after the OTP check (H-5). Add: wrong code for an uninvited new mobile gives 401 OTP_INVALID and leaves the invite untouched.
- The consume UPDATE should re-check `used_at IS NULL`. Today the unique index already blocks double use.
- `pilot_invites_live_idx` duplicates the unique index. Drop it when the schema is next touched.
- A refused uninvited sign-up leaves no audit row. Optional: add AUTH_SIGNUP_REFUSED.
- playwright.config's API env lacks `SANCHAY_PILOT_INVITE_ONLY=false`. Fix it in the Plan 03 task that owns that file.
- **Owned by Plan 04 F7** (the ops:invite rewrite):
  - the CLI duplicates the PilotInvites.add code and has no committed test;
  - it prints the raw mobile, which ECS Exec logs capture;
  - there is no documented prod command (no DATABASE_URL outside the entrypoint);
  - `--mobile` is not validated against MobileSchema;
  - it has no renew/upsert path for expired invites.

  If F7 has not landed by the G-B11 seeding on 11-20, use the renew path or manual SQL.

#### D8 (catalogue seed and data)
- Seed the legacy and non-SEBI buckets from fund-data.md §4.1 (`LEGACY_*`, `X_CLOSED_ENDED`, `X_INTERVAL`, `X_UNCLASSIFIED`) as `active=false`. Then adjust the count test to count active rows.
- The overseas-FoF cut-off must come from the `OT_FOF` sub-type in the Plan 03 cut-off engine (C-15), not from the category's `cutoff_class`.
- `data/market-holidays-2026-2027.csv` is a placeholder. It includes weekend dates, and its BANK and MONEY_MARKET kinds copy the equity dates. Extend BA-92, or add a pilot action, to load the published 2026-2027 calendars with source and sign-off before GO.
- All AMCs are seeded `empanelled=true`, and the column defaults to true. Seed false and default false, and set the flag from the PB-21 register.
- commission_disclosures are keyed by scope only, so history is lost, and the seed ignores the `kind` and `source` columns. Key by (scope, effective_from) in E14/F19.
- The fund_facts upsert omits the as-of dates, fieldSources and completeness. E15 re-resolves these.
- An unknown ISIN is skipped silently. F19's validation replaces this path.
- The seed is not transactional (it is idempotent).
- Bare `Number()` is used for bps and lock-in cells.
- Test-quality items: the `IDCW` literal, the holidays test order, the untested is_elss and main guard.
- The append-only test proves only the negative grant. Add `asAppRole` INSERT and SELECT on `fund_facts_revisions`, which must succeed.
- Placeholder curated, fund-facts and commission data is owned by PB-22/PB-80 before GO.

#### D9 (NAV sync)
- **NAV-06's matched/tracked floor does nothing** (`matched = parsed.rows.length`), and rule 4 (matched-count regression) is missing. Add an erratum so the comment points at Plan 04 F19, which computes `|parsed ∩ curated schemes.isin|` with a test once the real G-B10 list loads. Do not wire it before then: the placeholder ISINs would fail every sync.
- `parseAmfiNav` runs outside try, so each retry leaves a RUNNING `nav_sync_runs` row. Mark the row FAILED and add an int case.
- NAV_RELEASE is audited as SYSTEM; it should be ADMIN. The NAV_JUMP_QUARANTINE break is never resolved on release. Breaks for non-curated ISINs should be WARNING, not CRITICAL.
- The plausibility ratio and NAV > 0 use JS `Number`. Move them onto `@sanchay/money`, and reject NAVs below 0.000001 in the parser.
- maxNavDate is taken from the last row, not the max. Per-ISIN SELECT+UPDATE runs with no run-wide transaction. `job.data` is unvalidated. A same-date correction makes scheme_navs diverge from nav_history (note for E16). The FAILED paths, handler, schedules and CLIs are untested.

#### D10 (catalogue API, FP catalogue sync)
- Owned by Plan 04 F19:
  - `catalogue.fp.sync` writes `PUBLISHED`/`SUSPENDED`, bypassing the §1.4 publish gate, and has no schedule;
  - lock_in_months becomes null when FP reports no lock-in. Make it fail closed for EQ_ELSS;
  - `lock_in_period` null gives NaN, which aborts the run;
  - one scheme's error aborts the loop. Catch per scheme and open a recon break;
  - the 'only touches curated ISINs' test is vacuous.
- Owned by E14: the cursor-pagination test is vacuous, and a malformed cursor gives 500 instead of 400.

#### E25 (infra, deploy)
- Add an `app.sanchay.in/login` 200 check to ADR-0014's post-deploy checklist, and a web smoke beyond www `/` (F1). This pairs with MF-7.
- deploy.yml (owned by F1):
  - `services-stable` times out at 10 min against a ~9-10 min rollout. Set `deregistrationDelay` to 30 s and poll `rolloutState`;
  - the STS credentials are not masked (`::add-mask::`);
  - `${{ vars.* }}` is interpolated into `run:`. Pass it through `env:` instead.
- The deploy role is admin-equivalent through `cdk-hnb659fds-*`. Limit the `prod` environment's deployment branches to `main` only, consider scoped `--cloudformation-execution-policies`, and correct the ADR-0014 wording.
- Migrate-before-deploy can deadlock on a new migrate-required env var. Record a rule: new env lands in the stack one deploy before the code requires it, or there is a documented manual `cdk deploy` escape hatch.
- TLS trust scope (merged from A-infra and A-other): append `&sslrootcert=/etc/ssl/certs/rds-global-bundle.pem` and drop `NODE_EXTRA_CA_CERTS`. Percent-encode the DB user and password in docker-entrypoint.sh before F1's login secret. Owner: compare the bundle's sha256 `fe45bbeb...395c` with a fresh download before the first deploy.
- `cdk.json` has no feature-flag context. Settle it before the first deploy.
- Both images run as root. Add `USER node`, and an ECS Exec rule against printing env.
- The stale "aws-cdk-lib 2.216.0" comment (cosmetic).
- Plan 03 E1 invariant 13 must be role-scoped (`role === 'api'`).

#### Cross-cutting, CI, shared files
- `audit.int.test.ts` loosened the AUDIT_DATA_ALLOWLIST pin to `arrayContaining`. Restore exact `toEqual`, or add a negative PII-key regex assertion.
- No CI gate for openapi.json drift. Add `pnpm --filter=@sanchay/api openapi` and `git diff --exit-code apps/api/openapi.json` next to States drift. The committed file is currently byte-identical.
- `apps/api/.env.example` lacks the three FP keys. Its msg91/ses invariant comment is inaccurate.
- Accepted with no action: the tsx 4.23.15 pin, the sesv2 3.1143.0 pin, the undici single 7.30.0 row, the journal idx gaps (monotonic `when`), the redundant `.gitkeep`, and the lockfile churn under `--frozen-lockfile`.

---

### 3. Verdict

**Ready to merge after must_fix.**

**Why:**
- No area found a defect in the core kernel behaviour. Area reviewers confirmed these against the installed sources:
  - R-32 queue policies, BYODB enqueue, DML-only pg-boss, readiness and the role-gated boot invariants;
  - the D7 invite gate's ordering and rollback;
  - the R-35 NAV release, quarantine and IST grading;
  - the FP transaction guard, consent brand, lossless parsing and the append-only, encrypted `provider_calls`;
  - the ORDER machine against Plan 03/04's literal moves.
- The nine must-fix items are local, each has a covering test, and none needs a design decision:
  - three close PII paths into plaintext stores (MF-1, MF-2, MF-3);
  - two make the FP test double trustworthy before Plan 03 builds on it (MF-4, MF-5);
  - one aligns FP 429 handling with the spec (MF-6);
  - two prevent a broken or irrecoverable first prod deploy (MF-7, MF-8);
  - one corrects binding seed data before Plan 03 consumes it (MF-9).

**Conditions after merge** (these do not block the merge, but they do block the named downstream task):
- Rulings R-a (late_auth, before E21), R-b and R-c (FP duplicate and edge semantics, before E20), R-d (retry policy, before the first prod bootstrap or E1), R-e (MSG91 DLT, a GO-1 gate) and R-f (`sms.dlr.sync` owner, before E4) must be recorded in `docs/delivery/rulings.md` before those tasks start.
- The NAV-06 erratum must name F19 as the owner.


## Re-review of the fix wave: out-of-scope notes (deferred)

1. `jobs.service.ts`: nestjs-pino logs the handler message as `context`. `stdSerializers.err` keeps `cause` messages, so a provider's cause text can still reach CloudWatch, but never the database.
2. The `fp-provider-calls` int case should assert `number` and `taxid_number` are `[REDACTED]` explicitly. Today, only the fix wave's RED run proves the case is not vacuous.
3. Request meta drops only string leaves. Plain numbers in a request body, such as `geo_location` latitude and longitude, would still be stored. This belongs to Plan 03 E11 (see RV-02-84).
4. `state` is allowlisted at any depth, so an FP address's state name stays readable.
5. A dev stack with RDS DESTROY will collide on the retained secret names when it is redeployed. The retained ECR repositories and log groups collide the same way.
6. The `US Fund` alias to `OT_FOF` is a guess.
7. A database seeded from the old SEBI CSV keeps its old category rows. Reset dev databases.
8. Negligible: `ses.sender.ts` destructures `cause` with no null guard. `job-error.ts` uses `String(err)` for a non-Error throw.
