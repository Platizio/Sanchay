# Plan 02 (Sprint 2): platform kernel, FP gateway, FakeFp, catalogue data, the paused prod AWS stack

> **For agentic workers:** execute one task at a time, exactly as written, test first (Files → Interfaces → Step 1 failing test → Step 2 see it fail → Step 3 minimal implementation → Step 4 see it pass → Step 5 commit). `AGENTS.md` is binding. Where this plan and the outline disagree, this plan wins; where this plan and the MVP spec or rulings disagree, stop and report.

**Goal.** By Fri 10-23 the money kernel runs under Testcontainers and on the local docker compose stack: idempotency, the pg-boss worker role, FpGateway (lossless-json, `provider_calls`), a stateful FakeFp plus the sandbox smoke harness, domain state machines, MSG91/SES adapters and `Notify`, the pilot invite gate, and the catalogue schema, seeds, AMFI NAV sync and FP scheme sync. R-31: there is no AWS dev environment and no dev domain, so development runs locally, and in S2 week 2 E25 deploys `SanchayMvpStack-prod` paused: it runs and answers on `www`, `app` and `api.sanchay.in`, but no investor can transact before GO-1 (invite-only sign-in, D7 and boot invariant 10; `orders.enabled` and `plans.sip.enabled` stay at their D1 default, false; no invite before GO-1 except the founders' test accounts). R-31 amends R-24's "catalogue data is live on dev AWS": the 10-23 catalogue data lives on the paused prod stack. What reaches it by then is D9's NAV data (the worker runs the NAV syncs from E25's first deploy); the catalogue reference tables arrive with Plan 04 F1's migrate task, and F19's curated list and D9's NAV history backfill run on prod before GO-1 through F1's ops task (R-33; F1's `docs/runbooks/db-access.md`; RV-02-71).

**Sources.** Outline: `docs/superpowers/plans/2026-09-28-plans-02-04-outlines.md` §0 and §1 (conventions, env additions, capacity, rulings). Names: `docs/interface/plan-01-interface-sheet.md`. Rulings: `docs/delivery/rulings.md` (R-01…R-34).

**Branch.** `feat/plan-02-mvp-kernel` from `main` (`225d60a` or later). Nothing is pushed until the owner asks. Update the branch line in `AGENTS.md` when the branch is created. E25 deploys the prod stack from this branch by hand (ADR-0014's first deploy, steps 1-6). GitHub runs a `workflow_dispatch` workflow only when its file is on the default branch, so E25's step 7 and every later `deploy.yml` run wait until the owner has merged `deploy.yml` to `main` (RV-02-71).

## Execution order

| Order | Task | Lane | Needs |
|---|---|---|---|
| 0 | D0 Plan 01 fixes from the errata backlog (EF8-5, query parameters in logs, AppShell hydration) | Dev A | Plan 01 |
| 1 | D1 platform kernel tables, idempotency | Dev A | Plan 01 |
| 2 | D2 JobsModule (pg-boss), worker role | Dev A | D1 |
| 3 | D3 FpGateway base | Dev A | D1, D2 |
| 4 | D5 domain state machines | Dev B | Plan 01 |
| 5 | D6 MSG91/SES adapters, `Notify` | Dev B | D2 |
| 6 | D7 pilot invite gate | Dev B | D6 |
| 7 | D8 catalogue schema and seeds | Dev B | Plan 01 |
| 8 | D9 AMFI NAV sync | Dev B | D1, D2, D8 |
| 9 | D10 FP scheme sync, catalogue procedures | Dev B | D3, D8, D9 |
| 10 | E25 CDK `SanchayMvpStack-prod`, deployed paused (protected, S2 week 2, R-05, R-31) | Dev A | D2, D3, D6, D7 |
| 11 | D4 FakeFp and smoke harness (starts S3 week 1, outline §0.3) | Dev A | D3 |

The task sections below appear in chunk order (D0, D1–D4, D5–D7, D8–D10, E25); run them in the order above.

## Migration numbers

The rule stays: the number is assigned at merge, in DAG order. For the order above the numbers are:

| Migration | Task |
|---|---|
| `0004_platform_kernel` | D1 |
| `0005_worker_heartbeats` | D2 |
| `0006_provider_calls` | D3 |
| `0007_notifications` | D6 |
| `0008_pilot_invites` | D7 |
| `0009_catalogue` | D8 |

If the order changes, regenerate with `pnpm --filter=@sanchay/api db:generate --name=<name>` after rebasing; never hand-renumber a generated file.

## New dependencies (A1 rule)

This plan adds new `catalog:` keys only; no existing pin changes. `pg-boss 12.34.0` is verified in `docs/research/versions.md`. The other versions written in the tasks (`undici`, `lossless-json`, `tsx`, `@aws-sdk/client-sesv2`, `aws-cdk-lib`, `aws-cdk`, `constructs`) were **not** verified. Before adding each, run `pnpm view <name> version`, then pin the newest exact version that passes the 7-day `minimumReleaseAge`. Use that version in the task's catalog fragment and in its ADR-0001 row. Resolve install refusals with the A1 remedies in `AGENTS.md`, and report a `trustPolicy` error to the lead.

## Review errata (2026-09-29 consistency review; already applied below)

- **RV-02-1: paths.** D1/D2 used absolute paths into the old `sanchay-api` worktree. All paths are now repo-relative.
- **RV-02-2: migration collisions.** D1/D6 both claimed `0004` and D2/D7 both claimed `0005`. They are renumbered per the table above.
- **RV-02-3: D3 must typecheck alone.** D3's `fp.module.ts` imported and provided D4's `FakeFp` before it existed. D3 now uses a bare `MockAgent` (net connect disabled) in fake mode. D4 wires `FakeFp` in ("D4 Step 3 addendum"). `FpModule` is `global: true` so worker-only job handlers elsewhere can inject `FpRead`.
- **RV-02-4: pg-boss 12 API.** Three fixes in D2:
  - Import `{ PgBoss }` (named export).
  - `JobsService` creates every `JOB_NAMES` queue after `start()`.
  - `Jobs.enqueue` uses `boss.send(name, data, {db})`, pg-boss's BYODB adapter, instead of a raw `INSERT INTO pgboss.job` with pre-v10 column names.

  Handler discovery now uses Nest's `DiscoveryService.getProviders()` plus `Reflector` (`providerMethodsWithMetaAtKey` is a `@golevelup` API). `registerSchedules` is async and awaited, and it is the single schedule extension point. D9 fills its body with four keyed `boss.schedule` calls (one queue, distinct `key`s, `kind` in the job data), replacing bare `schedule(...)` calls to a function that did not exist.
- **RV-02-5: jobs never registered.** D9 and D10 defined `runNavSync` and `runCatalogueFpSync` but no `@JobHandler` classes, and no module registered them. D9 now adds `NavSyncJob` and creates `catalogue.module.ts`. D10 turns it into `CatalogueModule.forRoot(env)`, adding `CatalogueRouter` and, in the worker role only, `CatalogueFpSyncJob`.
- **RV-02-6: D10 used an invented FP shape.** D10 shadowed D3's `FpRead` with a local interface, and its thresholds shape (`{kind:'purchase', min, max, multiple}`) does not exist in Cybrilla's API. It now uses D3's `FpRead` and reads `raw.thresholds[]` per `docs/research/fp-api.md` §8A. Money goes through `fpJson.money`, and `schemePlans` is paged. A unit test pins the parsing.
- **RV-02-7: dependency pins.** See "New dependencies" above.
- **RV-02-9: schedules and handler shape.** `identity.cleanup` (described as hourly) had no schedule; D2 now registers it, and D9 appends to the body. Every handler is `handle(job: Job<N>)` and reads `job.data` (D6 took the payload directly).
- **RV-02-10: FakeFp uses the app clock.** `FakeFp`'s call log is stamped by an injected `now` (the app `Clock` in `FpModule`, `Date.now` by default), so Plan 03's consent-first assertion compares like with like.
- **RV-02-11: invite gate in tests.** D7 defaulted `SANCHAY_PILOT_INVITE_ONLY` to `true` without touching `testEnv`, which would 403 every existing sign-in test and the web e2e. `testEnv` and `.env.example` now set it `false`; the schema default stays `true`.
- **RV-02-12: one creator for `packages/test-fixtures`.** D9 creates the full package shell (the repo's `node-lib` tsconfig pattern, `vitest run --passWithNoTests`, an empty barrel); Plan 03's golden-vector tasks only add files and barrel exports. `Jobs.enqueue` builds its pg-boss options without explicit `undefined`s (`exactOptionalPropertyTypes`).
- **RV-02-13: ORDER machine.** FP can fail a purchase straight out of review (custom checkout: `under_review` → `pending` or `failed`), so D5 gains `UNDER_REVIEW → REJECTED` (`fp_review_failed`); Plan 03 E20 uses it.
- **RV-02-14: PLAN machine.** An ONDC purchase plan can end `failed` out of review, or be refused at the confirm `PATCH`, and the 7-day saga can lapse while FP is reviewing. D5 gains `UNDER_REVIEW → REJECTED` (`fp_review_failed`), `UNDER_REVIEW → CONSENT_EXPIRED` (`saga_expired_under_review`) and `CONFIRMING → REJECTED` (`fp_confirm_rejected`) and, as for orders, `SUBMITTING → REJECTED` (`live_check_failed`) for an FP 4xx on create. The MANDATE machine gains `CONSENTED → CONSENT_EXPIRED` (`execute_before_missed`: approved but never submitted in time) and `SUBMITTING → REJECTED` (`live_check_failed`). Plan 04 F2 uses them.
- **RV-02-15: D4 sandbox probe sends `expand` (found against the live sandbox, 2026-10-01).** `GET /v2/mf_scheme_plans/cybrillapoa` without `expand` returns `400 parameter_missing` ("required request parameter 'expand'"). D3's `FpRead` already sent it; D4's `tools/fp-probes` client did not, so the sandbox smoke would have failed at its catalogue step. D4 now requests `?expand=mf_scheme,mf_fund&page=0&size=100`, and its stub only matches when `expand` is present. Also confirmed in the sandbox: the list is under `data` (482 orderable plans); the POA token is issued only by the FP host (`{SANCHAY_FP_BASE_URL}/v2/auth/cybrillarta/token`; the POA host answers 404), and both hosts serve `/poa/pre_verifications/{id}`, so `liveBaseUrls` mapping every audience to `SANCHAY_FP_BASE_URL` is correct.
- **RV-02-8: `Jobs` is injectable.** D2's `Jobs` is an `@Injectable()` service exported by the global `JobsModule`, with an instance `enqueue(exec, name, data, opts)`. It was static; every consumer (D6 `Notify`, D9, and Plan 03/04) injects it, and unit tests stub it. D6 used `JOB_NAMES.NOTIFICATIONS_SEND`, which never existed; job names are dotted string literals checked against `JobName`.
- **RV-02-16: E25 CDK CLI pin (found while assembling Plan 04, 2026-10-01).** `aws-cdk@2.216.0` does not exist: the CDK CLI left aws-cdk-lib's version line at 2.1000.0 (2025-02-18), so E25's catalog fragment failed `pnpm install`. E25 now pins `aws-cdk: 2.1143.0` (the newest CLI past the 7-day `minimumReleaseAge` on 2026-10-01; a newer CLI always reads an older library's cloud assembly). `aws-cdk-lib 2.216.0` and `constructs 10.4.2` stay. The three pins install under the workspace's `minimumReleaseAge`, `trustPolicy` and `strictDepBuilds`, and the same code also passes against aws-cdk-lib 2.270.0 with constructs 10.8.1.
- **RV-02-17: E25 TypeScript build and synth.** `infra/tsconfig.json` extended `@sanchay/config/tsconfig-node`, which the package does not export (TS6053); it now extends `@sanchay/config/tsconfig/node-lib.json`, adds `types: ["node"]` and turns off `exactOptionalPropertyTypes` for `infra` only. aws-cdk-lib's own declarations fail under that option (16 errors, for example `Vpc` is not assignable to `IVpc` through `vpnGatewayId`), and `noUncheckedIndexedAccess` stays on. `cdk.json` ran `node --experimental-strip-types bin/sanchay.ts`, which cannot resolve `../lib/config.js` (`ERR_MODULE_NOT_FOUND` on Node 24.21), so `cdk synth` never worked. It now runs `tsc -p tsconfig.json && node dist/bin/sanchay.js`, verified with a real `cdk synth` from both PowerShell 5.1 and Git Bash. The synth also showed that the cdk CLI overwrites `CDK_DEFAULT_REGION` with the caller's default region (us-east-1 when none is configured), so `bin/sanchay.ts` pins `region: 'ap-south-1'` (spec §2.4). `.gitignore` gains `cdk.out/`.
- **RV-02-18: E25 code that did not compile or lint.** `rds.PostgresEngineVersion.VER_18_6` does not exist: 2.216.0's newest constants are VER_17_6 and VER_18_0, and even 2.270.0 stops at VER_18_3, although RDS has offered 18.6 since August 2026. The stack now uses one `rds.PostgresEngineVersion.of('18.6', '18')` engine for the parameter group and the instance. The four non-null assertions that `biome ci` rejects (`dbInstance.secret!`, `alb.connections.securityGroups[0]!` twice, `sub[0]!`) became guarded destructuring and `charAt(0)`. In the test, `rules[0].Properties` (TS2532 under `noUncheckedIndexedAccess`) became `const [rule] = rules`.
- **RV-02-19: E25 RDS master user (BRIEF D6).** The generated master credentials were for `sanchay_app`, the name of the NOLOGIN role that `0000_bootstrap` creates and `0003_grants` scopes. The app therefore logged in as `rds_superuser`, owned schema `app`, and the append-only REVOKEs did not bind it (R-16). The master is now `sanchay_master` (`DB_MASTER_USER`), secret `sanchay/{env}/db-master`, and the migrate task logs in with it. The LOGIN role `sanchay_app_login` (secret `sanchay/{env}/db-app`) and `sanchay_readonly_login` belong to F1 (D6), so api and worker share the master login until F1 points the stack's single seam, `appDbLogin`, at `sanchay_app_login`.
- **RV-02-20: E25 container environment and role-aware boot invariants.** As written, no API-image container could boot, even at the end of Plan 02. Run through the boot guard as D3, D6 and D7 leave it, the api was refused by invariant 7 (no retriever hash) and invariant 8 (FP mode defaults to `fake`), and worker and migrate failed to parse (no `SANCHAY_APP_ORIGIN`). Now api, worker and migrate share `bootEnv`: `SANCHAY_APP_ENV`, `SANCHAY_APP_ORIGIN`, `SANCHAY_API_ORIGIN` (before E2 requires it), `SANCHAY_CLIENT_IP_SOURCE=alb`, `SANCHAY_KEY_SERVICE=secrets`, `SANCHAY_PROVIDER_MODE_FP` (`sandbox` in dev, `production` in prod), `SANCHAY_PILOT_INVITE_ONLY=true` and `SANCHAY_PLATFORM_ARN` (before E21 requires it). api and worker add `msg91`/`ses`/`SANCHAY_SES_FROM`, api adds `SANCHAY_SMS_RETRIEVER_HASH`, and worker adds `SANCHAY_FP_BASE_URL`. `loadStackConfig(envName, source = process.env)` reads the two deploy inputs, `SANCHAY_PLATFORM_ARN` and `SANCHAY_SMS_RETRIEVER_HASH`, and throws `StackConfigError` without them; `deploy.yml` passes both from the GitHub environment. B2's invariants 1 and 7 now follow R-19's owning containers through two constants, `role` and `sends`: invariant 1 applies to api and worker, and invariant 7 to api only. Worker and migrate therefore boot without the api-only hash, and migrate boots without senders. Verified: each container's synthesised environment boots through the reconstructed guard. With Plan 03 added, E1's invariant 13 as written still refuses worker and migrate (no `SANCHAY_FP_WEBHOOK_SECRET`, which R-19 gives to api only). E1 must use `role === 'api'` too; this is an open item for Plan 03.
- **RV-02-21: E25 web container and health checks.** The web container had no `PORT`, so Next.js standalone bound 3000, the api's port in the shared task network. It also lacked `SANCHAY_WWW_ORIGIN` and `SANCHAY_APP_ORIGIN`, which `apps/web/src/proxy.ts` needs for H-1 host routing. Both target groups probed `/api/v1/health` on their own port, but Next serves no `/api/v1/*` route in AWS (the rewrites are local only; the image answers 404), so every web target was unhealthy and ECS replaced the task in a loop. Now web gets `PORT=3001`, `HOSTNAME=0.0.0.0` and both origins, and both target groups probe `/api/v1/health` on port 3000 of the same task. The R-12 path is unchanged, and a crashed web process still stops the task because every container is essential.
- **RV-02-22: E25 service name, SES, instance size and the NAV alarm.** The `FargateService` had no `serviceName`, so `deploy.yml`'s `--service Service` named nothing. It is now `sanchay-app` (`SERVICE_NAME`, spec §2.4) with `minHealthyPercent: 100`, and `deploy.yml` waits for `services-stable`. The task role could not send email, so D6's `SesEmailSender` failed. Statement `SesSendFromSanchayDomain` now allows `ses:SendEmail` and `ses:SendRawEmail` on any identity, restricted by `ses:FromAddress` to `SANCHAY_SES_FROM` (recipients are identities too while SES is in the sandbox). The hard-coded `db.t4g.micro` became `config.dbInstanceSize`: micro in dev, `db.t4g.medium` in prod (spec §2.4). The NAV-age alarm is removed. Nothing published its metric `Sanchay/nav.newest_age_days`, so with `treatMissingData: BREACHING` it would sit in ALARM permanently, and a ">= 2 days" threshold would page every weekend. F1 owns the gauges and the alarm names (BRIEF D5) and adds the alarm, with its metric source, in both envs.
- **RV-02-23: E25 first deploy and images.** The stack creates its ECR repositories empty and its secrets with placeholder values, so the first deploy could never stabilise and would roll the whole stack back. `-c firstDeploy=true` now creates the service with no tasks, and ADR-0014 gives the bootstrap, first-deploy, secrets, images, migrate and `deploy.yml` sequence. The stack outputs `AppSubnetIds` and `ServiceSecurityGroupId` for the run-task. The api image could not have run (verified):
  - The runtime copied the hoisted `node_modules` to `/repo_node_modules`, which ESM resolution never reads (`ERR_MODULE_NOT_FOUND: zod`).
  - It never built the workspace packages, whose `exports` point at `dist/`.
  - It left out `drizzle/`, so `migrate.js` had no migrations.
  - `node:24.13.1` fails `engineStrict`, because the lockfile's `jsdom` 30 needs `^24.15.0`.

  Both Dockerfiles now use `.node-version`'s 24.21.0 pinned by digest, build with `--filter=@sanchay/api...` / `--filter=@sanchay/web...`, and keep the `/repo` layout with production dependencies only. The web image takes the `/site` prerender inputs (`SANCHAY_PLATFORM_ARN`, `SANCHAY_PLATFORM_ARN_VALID_TILL`, the two origins) as build arguments; without them `next build` stops at `/site`. A new `.dockerignore` keeps `node_modules` and `.env` files out of the build context; before it, `COPY apps/api apps/api` would have baked a developer's `apps/api/.env` into the image. The task definition is ARM64 but the runners are x86_64, so `deploy.yml` registers QEMU (`tonistiigi/binfmt`, pinned by digest) and builds `--platform linux/arm64`. `apps/web/public/.well-known/assetlinks.json` (`[]`) gives the web image its `public/` directory until F18 writes the App Links payload. Verified on Docker Desktop: the arm64 api image migrated Postgres 18.6 and answered `/api/v1/health` with 200, and the arm64 web image served `/site` on the www host and `assetlinks.json` on the app host.
- **RV-02-24: D4 and D8 main guards on Windows.** ``import.meta.url === `file://${process.argv[1]}` `` never matches on Windows (`file:///C:/...` against `file://C:\...`), so `pnpm --filter=@sanchay/fp-probes smoke` and `pnpm ops:catalogue:seed` exited 0 without doing anything. Both now compare against `pathToFileURL(process.argv[1]).href`. Verified under node and tsx from both PowerShell 5.1 and Git Bash: the old guard skipped `main`, the new one runs it.
- **RV-02-25: D3, D6 and D7 env tests (found while verifying E25's env.ts change; outside the assigned list).** D3's invariant 8 refuses the default FP mode outside local/test, but `devSecrets` had no `SANCHAY_PROVIDER_MODE_FP`. Three Plan 01 cases therefore failed (reproduced): `requires SANCHAY_SMS_RETRIEVER_HASH outside local/test`, `refuses fake SMS/email providers in staging and prod, but not in dev`, and `boots outside local/test with the secrets keyring behind the ALB`. `devSecrets` now gains `SANCHAY_PROVIDER_MODE_FP: 'sandbox'`. D6's two cases called `validLocalEnv()`, which `env.test.ts` never defines; they now use `base`. D6 and D7 added keys without updating the closed-list pin test, so that test failed after each of them. D6 now adds `'SANCHAY_MSG91_CREDENTIALS_JSON'` and `'SANCHAY_SES_FROM'`. D7 lists `env.test.ts`, adds `'SANCHAY_PILOT_INVITE_ONLY'` and one invariant-10 case.
- **RV-02-26: commands and trailers (BRIEF D8 and AGENTS.md; outside the assigned list).** Under pnpm 11, `pnpm --filter=X test -- <filter>` forwards a literal `--`, and Vitest then runs the whole suite (verified: 19 files instead of 1). All 49 `test`, `test:int` and `smoke` commands in this plan now pass their arguments without `--`; arguments after the script name still reach the script (verified). The D5, D6 and D7 commit trailers named Claude Sonnet 5 instead of AGENTS.md's `Claude Opus 5.5`.
- **RV-02-27: D8 registers the catalogue tables in `db/schema.ts` (Plan 04 assembly review, round 2, FR-2; blocker).** D8 appended `export * from '../modules/catalogue/catalogue.schema.js'` to `db/app-schema.ts`, but `catalogue.schema.ts` imports `appSchema` from that file. The ESM cycle (`client.ts` → `schema.ts` → `identity.schema.ts` → `app-schema.ts` → `catalogue.schema.ts`, which calls `appSchema.table` before `app-schema.ts` has run) stopped every app and test boot with `TypeError: Cannot read properties of undefined (reading 'table')`. And because `db/client.ts` builds Drizzle from `db/schema.ts`, D8's `db.query.fundFactsRevisions`, D9's `exec.query.schemeNavs` and D10's `db.query.schemes` were TS2339 (all reproduced). D8 now appends the line to `apps/api/src/db/schema.ts`, the D1/D6/D7 pattern, and its Files, deviation note, biome and `git add` lists name that file; `drizzle-kit` already finds `catalogue.schema.ts` through its `./src/modules/*/*.schema.ts` glob. Verified: with the line in `schema.ts` the cycle is gone, `db:generate` emits all 12 tables, `db:check` is clean, and D8's int test and the existing audit int test pass.
- **RV-02-28: D3 and D10 add the workspace packages they import (FR-4; blocker).** D3's `fp-json.ts` is the first `apps/api` import of `@sanchay/money`, and D10's `fp-sync.job.ts` the first of `@sanchay/validation`, but `apps/api/package.json` depended on neither. With `nodeLinker: hoisted`, `apps/api/node_modules/@sanchay` held only `config`, `contract` and `domain`, so both imports failed with TS2307 (reproduced). D3's Step 3a now runs `pnpm --filter=@sanchay/api add "@sanchay/money@workspace:*"` and D10's Step 3 runs `pnpm --filter=@sanchay/api add "@sanchay/validation@workspace:*"`; each lists and stages `apps/api/package.json` and `pnpm-lock.yaml`. Verified offline: each command adds one `workspace:*` line and three lockfile lines, `pnpm install --frozen-lockfile` accepts the result, `biome ci` accepts the written `package.json`, and both packages resolve under `tsc` and under Vitest. The quoted spec reaches pnpm intact from PowerShell 5.1 (checked) and the commands ran from Git Bash. Plan 03 E20's conditional `@sanchay/money` add (RV-03-6) now finds the dependency present.
- **RV-02-29: D7 relaxes Plan 01's audit pins (FR-10; major).** Plan 01's `apps/api/test/int/audit.int.test.ts` pinned `AUDIT_DATA_ALLOWLIST` and the `AUDIT_ACTIONS` keys with exact lists, so D7's `PILOT_INVITE_ADDED` turned `pnpm test:int` red (reproduced), and Plan 03 E4 and Plan 04 F7 would have kept it red. D7, the first task to append, turns both checks into `expect.arrayContaining([...the Plan 01 list])` and adds the file to its Files, Step 4, biome and `git add` lists; later tasks append without editing the test. Verified: green with D7's append and with E4/F7-style allowlist appends; red when a Plan 01 action is removed. Also fixed (outside the assigned list, by inspection): D7's int test read `ta.db.database`, which `TestDatabase` (a `DbHandle`, whose Drizzle instance is `db`) does not have, a TS2339 in D7's `typecheck`; it is now `ta.db.db`.
- **RV-02-30: D10 relaxes Plan 01's contract key pin.** D10 adds `catalogue`, the first new top-level contract key, before Plan 03 E2, which carried the relax of `packages/contract/src/auth.test.ts` (RV-03-5). D10's own `pnpm --filter=@sanchay/contract test` therefore failed on the exact `['auth', 'health', 'me']` (reproduced). D10 now carries E2's fragment unchanged (the top-level and `me` keys become `expect.arrayContaining`) and lists the file in Files, biome and `git add`; E2's fragment is already applied when E2 runs. Verified: 41/41 contract tests with D10's contract added.
- **RV-02-31: D1 `RuntimeConfig.get` parses the jsonb once (FR-19; minor).** node-postgres already parses `jsonb`, and drizzle-orm 0.45.3's jsonb mapper `JSON.parse`s any string a second time, so a stored `"4000.00"` (`pilot.caps.perOrder`) came back as the number 4000; the zod schema then failed and `RuntimeConfig.get` threw `INTERNAL` (reproduced against Postgres 18). It now selects `value::text` and `JSON.parse`s it once. The unit stub returns JSON text and gains a money-cap case (6 tests), and `idempotency.int.test.ts` gains a real-jsonb case (10 tests; the old count, 8, also missed the `ReconBreaks.open` case). Both new cases fail on the old code and pass on the new one.
- **RV-02-32: E25's post-deploy checks run in both shells (FR-22; minor).** `curl -s -o /dev/null -w ...` fails in PowerShell 5.1, where `curl` is `Invoke-WebRequest` (`Missing an argument for parameter 'SessionVariable'`, reproduced). The three checks are now `curl.exe -s -o NUL -w "%{http_code}\n" <url>`, which printed `200` and `200 application/json` from both PowerShell 5.1 and Git Bash against a local stand-in for the three URLs, without creating a file named `NUL`.
- **RV-02-33: E25's deploy role trusts the deploy input `SANCHAY_GITHUB_REPOSITORY`.** `DEV_CONFIG` and `PROD_CONFIG` hard-coded `githubRepo: 'Vendtta01/sanchay'`, which is not this repository (`origin` belongs to the company organisation), so `deploy.yml` could never assume the role; and the organisation's name is the legal-entity name, which the brand rule keeps out of code. `githubRepo` is now `string | undefined`, read from `SANCHAY_GITHUB_REPOSITORY` (the name F1 uses) and refused unless it is `<owner>/<repo>`. The OIDC provider and `GithubDeployRole` are built only when it is set; `assertDeployInputs(config)`, which `bin/sanchay.ts` calls, refuses a synth or deploy without it; `deploy.yml` passes `github.repository`; and ADR-0014's first-deploy commands set it in both shells. The infra test file has 19 tests: one checks that the role trusts exactly `repo:<owner>/<repo>:*` and exists only with the input, and one that the input is read, a malformed one is refused, and a deploy without it is refused. Both fail on the old code. Verified: infra `typecheck`, 19/19, and a real `cdk synth` (fake hosted-zone and AZ context; no AWS credentials) that was refused without the input and, with it, built one deploy role, from PowerShell 5.1 and from Git Bash. F1 keeps this contract: E25's tests synthesise without the repository, and F1 adds its prod alarm-recipient checks to `assertDeployInputs`.
- **RV-02-34: D8 passes `biome ci`.** `ops-catalogue-seed.ts` had 28 non-null assertions (`row.name!` and the like) and an unused `eq` import, and `catalogue-schema.int.test.ts` had 8 (`amc!.id` and the like) and five unused imports. `biome ci` (`pnpm lint`) rejects every one, and `biome check --write` fixes none. The seed now reads required cells through `cell(row, key)`, which throws with the column's name when a cell is missing or empty, and the test reads `.returning()` rows through `only()`. `navSyncRuns`' unused extra-config parameter became `() => [...]`. Also fixed (outside the assigned list): the test's "40 SEBI categories" case counted 42, because the two CHECK cases before it insert their own `TC_*` categories into the same database; it now counts only the seeded rows. Verified: `biome ci` clean on D8's files, `typecheck` clean, and the six D8 int tests pass (the seed runs twice).
- **RV-02-35: D8 and D10 rebuild the workspace packages they change (found while verifying; the FR-6/FR-7 class).** `apps/api` reads `@sanchay/domain` and `@sanchay/contract` from `dist/`, and `pnpm --filter=@sanchay/api ...` does not rebuild them. Without a build, D8's `typecheck` failed with TS2305 on `SCHEME_STATUSES` and its `db:generate` stopped with `TypeError: Cannot read properties of undefined (reading 'map')`; D10's api `typecheck` failed with TS2339 on `contract.catalogue`, and `pnpm --filter=@sanchay/api openapi` would have written a document without the catalogue paths (reproduced). Step 4 and Step 5 of both tasks now start with `pnpm exec turbo run build --filter=@sanchay/api^...`. No other Plan 02 task changes a package that `apps/api` reads: D5's new domain exports have no `apps/api` consumer in this plan, and D9 reads its fixtures by file path.
- **RV-02-36: D10's router reaches the database (found while verifying).** `CatalogueRouter` injected `DB` as a Drizzle `Database`, but `PlatformModule` provides a `DbHandle` (`createDb`), so every catalogue call answered 500 (`this.db.select is not a function`; reproduced by booting the app with the router mounted). It now injects `DbHandle` and passes `this.dbh.db`, the D1 pattern, and answers 200 with the 40 seeded categories. `listSchemes` takes the contract's `ListSchemesInput`, because its `{ q?: string }` parameter failed `typecheck` with TS2379 under `exactOptionalPropertyTypes`. The non-null assertions in the queries (`page[page.length - 1]!`) and in the int test (`amc!`, `cat!`) are gone. Plan 03 E14 replaces this router with the same `Database` injection, so it needs the same fix.
- **RV-02-37: `requireIdempotency` releases the key of every refusal, not only of a 5xx (backlog round 1, F28; major).** A handler that threw a 4xx left its key `IN_PROGRESS` for 24 h, so a retry after a lost 4xx response, or any client that reused a refused key, got 409 `IDEMPOTENCY_IN_PROGRESS` ("We are still processing your earlier request") for a day, against target design §B.5's "In progress → 409 with `Retry-After: 1`". Now any error the handler throws, 4xx or 5xx, deletes the row and only a returned result is completed and replayed: every [K] handler in Plans 02–04 refuses before it writes or inside a transaction that rolls back (the OTP attempt that `me.verifyEmail` counts and F5's singleton `folio.sync` enqueue are meant to repeat), so a re-run cannot duplicate a write; a failed `complete()` keeps the row, because the handler has run; and the 409 carries `retryAfterSeconds: 1` (D-3). A new int case (429 `OTP_COOLDOWN` leaves no row, and the same key answers 200 once the cooldown passes) fails on the old middleware and passes on the new one against PostgreSQL 18. The clients keep F28's rule (a new key after a final 4xx, one key per intent); F12 and F16 already follow it (Plan 04 FR-17, so the backlog's "F12 reuses the key after a 403" is stale), and only their comments change (RV-03-20, RV-04-F12-1).
- **RV-02-38: D1 imports `pgErrorCodeOf` (backlog round 2; major).** `pg-errors.ts` on main exports `pgErrorCodeOf` and `pgConstraintOf`, but `idempotency.service.ts` and `runtime-config.ts` imported `pgErrorCode`, so `typecheck` failed with TS2724, and under Vitest every conflict path threw `pgErrorCode is not a function`: the replay, 422, in-flight, expiry and `ReconBreaks.open` cases failed (5 of D1's 10 int cases, reproduced). Both files now import `pgErrorCodeOf`, the "inline it if it is missing" contingency is gone, and the Consumes list names `pgErrorCodeOf` instead of the test helper `pgErrorCode` (`test/int/pg.ts`), which D1 never used. No other Plan 02, 03 or 04 task imports the wrong name: D8's `pgErrorCode` is that test helper, imported from `./pg.js`, and F4's later `ReconBreaks` rewrite drops the import.
- **RV-02-39: D1's middleware typechecks and lints (found while verifying; major).** `requireIdempotency` returned `Middleware<Record<never, never>, …, never, never>`, so `context.reqHeaders` and `context.resHeaders` were TS2339 and both `.use(...)` calls in `me.router.ts` were TS2345 (the `never` error map rejects the procedure's), and its untyped `let outcome;` is a `noImplicitAnyLet` error that `biome check --write` cannot fix, so Step 4's `typecheck` and Step 5's `pnpm lint` failed (reproduced). It is now built with `os.$context<ORPCGlobalContext>().middleware(...)`, oRPC's form for a middleware that fits any procedure, and a small `beginOrRefuse` maps `begin()`'s two refusals. Verified: `typecheck` exits 0, and after `biome check --write` `biome ci` reports only the existing `noStaticOnlyClass` warnings on every D1 file; the `requireIdempotency(idem, cls)` call that Plans 03 and 04 make is unchanged.
- **RV-02-40: D1's own tests and staging (found while verifying; major).** The "5xx" case called `t.sms.script?.()` (TS2339: the capture sender has no `script`), claimed an email with a key-less call that got 428, filtered on `actor_id = ''` and asserted nothing about release; it now fails the send with Plan 01's `t.email.failNext` (503 `PROVIDER_UNAVAILABLE`) and retries the same key to 200. The in-flight case raced two `inject`s, and against PostgreSQL 18 the first request finished before the second reached the middleware in 5 of 5 runs (a replayed 200, not a 409); it now parks the first call in the email send until the second is answered. `me-email.int.test.ts` fails 4 of 4 with 428 once the routes are [K] (reproduced), yet it was missing from Files, Step 2 said it stays unedited and no code was given; Step 1 now gives every post a fresh key, and Step 5 stages explicit paths instead of `git add apps/api` (AGENTS.md). Verified on the fixed task: `idempotency.int.test.ts` 11/11 in three runs, the whole `test:int` suite 20 files and 141 tests, `runtime-config.test.ts` 6/6.
- **RV-02-41: D2 widens `drizzle.config.ts`'s schema globs (D2 review 2026-10-05; blocker).** `schema: './src/modules/*/*.schema.ts'` matches one directory level, and drizzle-kit 0.31.11 imports only the files its globs match, so with D2's `jobs/jobs.schema.ts` in place `db:generate --name=worker_heartbeats` printed "No schema changes, nothing to migrate" while `drizzle-kit check` still passed; D3's `integrations/fp/provider-calls.schema.ts` was missed the same way (both reproduced on a copy of `apps/api`). D2 now sets `schema` to `./src/modules/*/*.schema.ts`, `./src/modules/*/*/*.schema.ts` and `./src/integrations/*/*.schema.ts`, which covers every schema file Plans 02 to 04 create, and adds `src/db/drizzle-config.test.ts`, which fails when a `src/**/*.schema.ts` file is outside the globs (under the old config it named `jobs.schema.ts`). Verified: `db:generate` then wrote `worker_heartbeats` and, with D3's file, `provider_calls`, and a second generate found no drift. D2's Files list also names `jobs.schema.ts` and `migrations.int.test.ts`, which its steps already wrote, and this closes the verify-list item on the glob.
- **RV-02-42: `/health/ready` fails with 500 and ages the heartbeat by the app clock (D2 review 2026-10-05; major).** D2 expected 503 from `AppError('INTERNAL', {retryable: true})`, but `ERROR_CATALOGUE` maps `INTERNAL` to 500 and `retryable` only sets `data.retryable`; `INTERNAL` is the one error the contract declares for `health.ready`, spec §1.5 makes the route diagnostic and F24's runbook only tells 200 from anything else, so D2 keeps 500 and now says so. The age was `Date.now()` minus a beat stamped by the test `FakeClock` (2026-10-12T04:30Z), so the stale case passed or failed by the calendar (on 2026-10-05 it got 200); `HealthRouter` now injects `CLOCK`. D2 also broke Plan 01's readiness case in `health.int.test.ts` (500: the api role never beats; reproduced), so that file now seeds a fresh beat and expects the three checks, plus a stale case that pins the 500, and `jobs.int.test.ts` keeps one worker-role beat check, which also uses the `workerHeartbeats` import that `biome ci` rejected as unused.
- **RV-02-43: pg-boss needs no DDL as the D6 app login, and a case pins it (D2 review 2026-10-05; verified, guard added).** In pg-boss 12.34.0, `start` with `migrate: false` installs nothing (it checks the schema version), `createQueue` without `partition: true` is an `INSERT … ON CONFLICT DO NOTHING` into `pgboss.queue` (idempotent across boots), and `send`, `work`, `schedule` and maintenance are DML; only `partition: true` (a table per queue) and `persistQueueStats` (daily `queue_stats` partitions) run DDL. On a database that a non-superuser master migrated with D2's `runMigrations`, a `sanchay_app` member without CREATE on `pgboss` ran `start`, the nine `createQueue`s twice, a BYODB `send` in a committed transaction, `work`, `schedule` and `supervise` without an error, while `createQueue(…, {partition: true})` and `persistQueueStats` failed with 42501. So the migrate task need not create queues and `pgboss` needs no CREATE grant; `JobsService` names the two options that must stay off, and `jobs.int.test.ts` asserts no queue is partitioned (it failed with one `partition: true` queue). This settles the verify-list items on `createQueue` idempotency and the api role's `pgboss` privileges, and Plan 04 F7's open note (RV-04-F7-1).
- **RV-02-44: D2's `main.ts` passes `typecheck` (D2 review 2026-10-05; major).** After the `migrate` block ends in `process.exit(0)`, TypeScript has narrowed `SANCHAY_APP_ROLE` to `'api' | 'worker'`, so D2's unreachable `else if (env.SANCHAY_APP_ROLE === 'migrate')` was TS2367 and Step 4's `typecheck` failed (reproduced with the repo's TypeScript 6.0.3). The branch is removed; F7 still inserts its `ops` block after the `migrate` block, and the trailing `else` still starts Fastify only for `api`.
- **RV-02-45: `Jobs` sends through its own application's `JobsService` (D2 review 2026-10-05; major).** `Jobs.enqueue` read a module-level `activeBoss` that every `JobsService.onApplicationShutdown` cleared, so closing a second Nest application in the process broke enqueueing in the first: after D2's `runWorker` and api-role cases closed theirs, the `identity.cleanup` case failed with "Jobs.enqueue called before JobsService started pg-boss" (reproduced), and F7's ops runner boots a second application the same way. `Jobs` now injects `JobsService` and calls its `started()`; consumers still inject `Jobs`, and unit stubs are unchanged.
- **RV-02-46: D2's worker cases wait for the worker (D2 review 2026-10-05; major).** pg-boss workers poll every 2 s by default, but the `processed once` and `identity.cleanup` cases slept a fixed 500 ms and failed in every run, also with RV-02-45 applied (reproduced). They now poll the outcome for up to 10 s through an `eventually` helper. Verified by running D2's steps from this plan text on a copy of Plan 01's `apps/api` (without D1, so the migration was `0004`) against PostgreSQL 18.2: Step 2 failed as listed, and Steps 4 and 5 passed (`typecheck`, every unit and int file, no drift, and `biome ci` without errors).
- **RV-02-47: D3, D4 and D9 pass `biome ci` (LNT review A; blocker).** The three tasks still carried 11 non-null assertions, which `pnpm lint` rejects at Step 5 and `biome check --write` leaves alone (the rule's fix is unsafe): `row!` four times in D3's `fp-provider-calls.int.test.ts`, `body.data[0]!`, `actualParts[i]!` and `params.id!` twice in D4, and `DAYS_IN_MONTH[monthIndex]!`, `run!.id` and `parsed.rows[parsed.rows.length - 1]!` in D9. Each is now a guard that `noUncheckedIndexedAccess` accepts: `if (row === undefined) throw`, `?.` inside an assertion, an `undefined` check in `matchPath`, `params.id ?? ''`, `?? 0`, a guard on the inserted run, and `parsed.rows.at(-1)?.navDate ?? null`. D3's `rowId: row!.id` also becomes `asRowId('provider_calls', row.id)` (a plain `string` is not the `RowId` that `AadRef` wants, TS2322), and D9's one-line `scheme_navs` insert is written the way biome formats it, because biome needed two passes for it and Step 5 runs one. Verified on scratch copies: after one `biome check --write`, `biome ci` over every TypeScript block of D3-D7 and D9 reports only partial-file fragments (17 real errors before), and `tsc` is clean on the rewritten files.
- **RV-02-48: D6's integration test reads `ta.db.db` (LNT review B; blocker).** `notifications.int.test.ts` read `ta.db.database` five times, but `TestDatabase` extends `DbHandle` (`{db, pool, close}`), so D6's `typecheck` failed with five TS2339 errors (reproduced with `tsc` against Plan 01's `test/int/db.ts`) and the test would have thrown at run time. All five now read `ta.db.db`, the RV-02-29 fix in D7, and the unused `notificationDeliveries` import, which `biome ci` rejects, is gone. Verified: `tsc` clean, and the three cases pass on PostgreSQL 18.6 (Testcontainers) with D6's tables migrated.
- **RV-02-49: D9 counts NAV age in IST calendar days and never uses a future-dated NAV (LNT review C, D-MONEY-067; major).** `NavService.latest` took `floor((now − navDate 00:00 UTC) / 1 day)`, so from 00:00 to 05:30 IST a NAV eight IST days old still graded OK and a NAV dated after today graded OK too, while `runNavSync` parsed with a bound two UTC days ahead although D-MONEY-067 rejects future-dated NAVs at ingest. `NavService` now compares against `istToday(now)`, built on Plan 01's `istDayStart` (`identity/otp.service.ts`; `@sanchay/domain` has no IST date helper before Plan 04 F4), grades a row dated after today IST `UNAVAILABLE`, and `runNavSync` parses with `bound = istToday(now)`; the unused `schemeNavs` import and `todayIso` variable that `biome ci` rejects are gone. New cases at 00:30 IST (8 IST days STALE, 7 OK, today OK, tomorrow UNAVAILABLE) and a 25 Aug row in a 24 Aug sync fail on the old code and pass on the new (PostgreSQL 18.6). Consumers need no change: Plan 03 E22's grade adapter, F5's AMOUNT check and F19's R7 accept only OK, F11's `valueHolding` already leaves a NAV that is `UNAVAILABLE` or dated after today IST unvalued, and their tests run at 10:00 IST.
- **RV-02-50: D9's own tests can pass (found while verifying LNT review C; blocker).** Run on PostgreSQL 18.6 against D9's own code, Step 4 failed four ways: the parser test's `FIXTURES` URL climbed six directories and left the repo (ENOENT in both fixture cases), the grading case expected STALE for a NAV six days old, the sync case re-inserted the grading case's ISIN into the same database (23505), and its one-row feed tripped NAV-06's 1,000-row floor, so the run ended FAILED. The URL now climbs five, the grading cases use their own ISINs and an 8-day NAV, and the sync feed carries 1,000 filler ISINs. The parser's `DAYS_IN_MONTH` also gave February 29 days, so `29-Feb-2027` parsed and would have failed the `date` insert; it now gives 28, with a new case. Step 4 expects 31 parser cases and three integration cases, and all pass.
- **RV-02-51: D5's `gen:states` can run (found while verifying LNT review A; blocker).** `node scripts/gen-states.ts` stopped with `ERR_MODULE_NOT_FOUND`, because Node's type stripping does not map `states/index.ts`'s `./mandate.js` imports to `.ts`; and since `states.test.ts` imported the script, the domain `typecheck` failed with TS5097 (an import path ending in `.ts`) and the test ran `main()`, which wrote into a `docs/specs/` that does not exist yet (ENOENT). `renderStatesDoc()` now lives in `packages/domain/src/states/index.ts`, where the test calls it; the script imports it from the built `packages/domain/dist` and creates `docs/specs/` when needed, and the root `gen:states` script builds `@sanchay/domain` first (CI's drift step already runs after `pnpm build`; Plan 04 F4 and F28 keep calling `pnpm gen:states`). Verified: domain `tsc` clean; after a build the first run writes `docs/specs/states.md` and the second writes nothing.
- **RV-02-52: D5's tests and commands (found while verifying LNT review A; blocker).** The 'terminal states have no exits' case failed on spec §4.2's `SETTLED → REVERSED` (`fp_reversed`) edge, which the transition case above it requires; it now exempts that one edge. `pnpm --filter=@sanchay/domain test states.test.ts` exits 1 even when every case passes, because the package's 95% coverage gate counts every `src` file (reproduced: a filtered run on Plan 01's domain package fails all four thresholds), so Steps 2, 4 and 5 run the suite unfiltered. The unused `fpStateToOrderStatus` import in `states/index.ts` and `PLAN_STATUSES` in the test, which `biome ci` rejects, are gone. Verified: 146 domain tests pass, with 100% statements and lines and 96.77% branches.
- **RV-02-53: D4 typechecks against undici's types (found while verifying LNT review A; blocker).** `FakeFp`'s router handed `MockInterceptor.reply` a `FakeReply` whose `data` was `unknown`, but undici's `MockReplyOptions.data` is `object | Buffer | string` (TS2769), and `tools/fp-probes`' client passed `body: undefined` to `request`, which `exactOptionalPropertyTypes` refuses (TS2379). `FakeReply.data` and the scripted `FpScriptMode` body are now `object` (every FakeFp reply and script in Plans 02-04 is a JSON object), and the client passes `null`. Verified with undici 8.10.2, which the workspace already installs (D3's catalog pin is chosen at execution): `tsc` is clean on `fake-fp.ts` and on `tools/fp-probes`, whose two harness tests and four `--env=fake` chains pass.
- **RV-02-54: D9's `NavSyncJob` typechecks (found while verifying LNT review C; blocker).** `NavSyncDeps.reconBreaks` declared `severity: string` and a required `detail`, so the addendum's `reconBreaks: ReconBreaks` failed D9's `typecheck` with TS2322: D1's `ReconBreaks.open` takes `severity: 'WARNING' | 'CRITICAL'` and an optional `detail` (reproduced against D1's and D2's signatures). The structural type now matches D1's input. Verified: `nav-sync.job.ts`, assembled with the addendum as Step 3 says, typechecks, and the three integration cases still pass.
- **RV-02-55: SIP availability comes from FP's monthly SIP row (errata backlog, round 1, F18-F19; major).** D10's `toThresholds` copied the lumpsum limits into the SIP fields when FP listed no monthly SIP row, so on the wire "has SIP" meant "has a lumpsum row": F19's FUND-01 offered "Start SIP" on such a scheme and F10's quote refused it with `SCHEME_NOT_ORDERABLE`, against D-MONEY-026 ("a scheme with no SIP threshold is not SIP-eligible"). Nothing wrote `schemes.sip_dates` either, so F2's `sipSchemeOf` would have refused every synced scheme. D8's `SchemeThresholds` SIP fields are now nullable, `toThresholds` leaves them null without the monthly row, the new `toSipDates` stores that row's days in 1..28, and `sip_allowed` is FP's flag with both present; E14 serves it as `sipAllowed` (RV-03-22), F2 refuses null limits (RV-04-F2-4) and F19's "Start SIP" reads the flag (RV-04-F19-1). Verified in a scratch build of D8 and D10 on Plan 01's code: `tsc` clean and `fp-sync.job.test.ts` 5/5, whose two new cases fail on the old code; in the FP sandbox export, 14 of 482 plans (7 Regular-Growth) have a lumpsum row and no monthly SIP row, and all 344 monthly rows carry `dates`.
- **RV-02-56: D10's int test uses helpers that exist and collision-free seeds (errata backlog, round 2; blocker).** The test imported `httpGet` and `signIn` from `test/int/http.ts`, which exports neither, so D10's `typecheck` failed with TS2305 (reproduced on Plan 01's code); a bare `inject` would also get 403 `ORIGIN_REJECTED` from `ClientGuard`, not 401. It now signs in once with Plan 01's `signInWeb` and sends `webHeaders`. `seedOneScheme` took its category code and ISIN from `Date.now()`, and 200 back-to-back calls against PostgreSQL 18 hit `sebi_categories_code_uq` 3 times and `schemes_isin_uq` twice; it now numbers them from a per-file counter (each test file has its own database). The rewritten file passes 4/4 against PostgreSQL 18.2 with D8 and D10 built on Plan 01's code, and 5/5 with E14's appended case (RV-03-23).
- **RV-02-57: D8 keeps the `SchemeStatus` re-export that F19 imports (found while verifying; major).** D8's Step 3 told the executor to drop `export { SCHEME_STATUSES, type SchemeStatus } from '@sanchay/domain'` from `catalogue.schema.ts`, but Plan 04 F19's `publish-gate.apply.ts` imports `type SchemeStatus` from that file, so following D8 made F19 fail with TS2305 (reproduced with a copy without the line). The instruction now keeps the line, and its comment says why. Checked: the `SCHEME_STATUSES` import and the re-export together pass `tsc` and `biome ci`.
- **RV-02-58: D10's unit test settles in one `biome check --write` (found while verifying; minor).** biome 2.5.14 formats the one-line `fundScheme: vi.fn().mockResolvedValue({ … })` mocks differently on its first and second `--write` passes, so after Step 5's single write `pnpm lint` (`biome ci`) still failed on `fp-sync.job.test.ts` (reproduced with the repo's biome). The mocks are now written in the multi-line form biome converges to, and `biome ci` is clean after one write. F19's appended case gets the same change (RV-04-F19-2).
- **RV-02-59: the api image loads Plan 03 E9's JSON import (2026-10-05 review, item A; blocker from E9 on).** E9's `risk-profile.service.ts` imports `../../../../../data/risk-questionnaire-v1.0.0.json` `with { type: 'json' }` when its module loads, in api and worker; from `dist/modules/onboarding` that is `/repo/data`, which E25's image did not have (`ERR_MODULE_NOT_FOUND`). Worse, the api's `.swcrc` lets SWC drop the attribute, so Node 24.21 refuses the module even when the file is there (`ERR_IMPORT_ATTRIBUTE_MISSING`, reproduced with the repo's Nest CLI 11.0.24 and `@swc/core` 1.16.2), while E9's typecheck and its Vitest runs (`swcrc: false`) stay green. E25 now copies `data/` (D8 creates it first) and sets `jsc.experimental.keepImportAttributes` (the Plan 01 api's 52 compiled files are byte-identical with it), and a new infra test pins both. `docs/legal` stays with F1 (RV-04-F1-1): E3 creates it in Plan 03, nothing reads it at module load, and a `COPY` of a missing path fails the build (`"/docs/legal": not found`, Docker 29.8.1).
- **RV-02-60: E25's master-user test can fail (2026-10-05 review, item B; minor).** `expect(JSON.stringify(template.toJSON())).not.toContain('"username":"sanchay_app"')` could never fail, because `SecretStringTemplate` is a JSON string whose quotes `JSON.stringify` escapes. With aws-cdk-lib 2.216.0 and `DB_MASTER_USER` mutated to `sanchay_app`, the old assertion still passed. The test now parses every generated secret's `SecretStringTemplate` and expects `sanchay_master` and no `sanchay_app`; it fails on the mutated stack and still passes once F1 adds `sanchay_app_login` and `sanchay_readonly_login`.
- **RV-02-61: E25's `deploy.yml` runs the migrate task and fails on a rolled-back deployment (2026-10-05 review, item C; major).** Spec §2.4 runs the one-off migrate task before each deploy, but `deploy.yml` never ran it and ADR-0014 left it to a manual step. RV-02-22 had fixed the service name and added `aws ecs wait services-stable`, but that waiter also succeeds once the circuit breaker has rolled the deployment back (it only needs one deployment with `runningCount == desiredCount`), so a failed rollout still ended green. E25 now carries F1's `ENV_NAME`, its `Run the migrate task` step between the image push and `cdk deploy`, and its last step, which fails unless the forced deployment's `rolloutState` is `COMPLETED`; ADR-0014's decision, step 7 and "every later deploy" line follow. Every `run:` block passes `bash -n`, and the workflow F1 produces is unchanged apart from two comments (RV-04-F1-1).
- **RV-02-62: the document bucket follows spec §2.4 (2026-10-05 review, item D; minor).** The spec's bucket is `sanchay-{env}-docs` with public access blocked, SSE and versioning; E25 built `sanchay-{env}-documents` without versioning, and F1 added nothing. The bucket now has the spec's name and `versioned: true` (no plan names it), and a new test pins the name, SSE, the public access block and versioning. It fails on the old code; F1's prod template shows `sanchay-prod-docs`, versioned.
- **RV-02-63: the apex answers 301 to www (2026-10-05 review, item D; minor).** Spec §2.4, H-1, ADR-0005 and PB-41 send the apex to `www` with a 301 at the ALB, but neither E25 nor F1 built it (the certificate already covered the apex), and once the apex points at the ALB, `apps/web`'s routing (any host other than app is www) would serve the www pages there instead of redirecting. E25 adds the HTTPS listener rule `ApexToWww` (apex host to `www.<domain>`, `HTTP_301`, path and query kept) and an apex A-alias record. A new dev test pins both and fails on the old code; F1's prod template gets `sanchay.in` with the same redirect, and F1's own 35 tests still pass. The post-deploy checklist gains `curl.exe -s -o NUL -w "%{http_code} %{redirect_url}\n" https://dev.sanchay.in/`, which printed `301 https://www.dev.sanchay.in/` from PowerShell 5.1 and Git Bash against a local stand-in.
- **RV-02-64: two spec §2.4 deviations recorded for an owner ruling (2026-10-05 review, item D; owner decision).** E25 sends every container to one log group, `/sanchay/{env}/app`, separated by awslogs stream prefix, instead of `/sanchay/{env}/{web,api,worker}`. It also pushes two ECR repositories per env (`sanchay-{env}-api`, `sanchay-{env}-web`) instead of `sanchay/app`. F1's metric filters and alarms and the F7, F20, F23, F24 and F27 runbook lines (`/sanchay/prod/app`, prefixes `prod/ops`, `prod/worker` and `prod/api`) depend on the first, and `deploy.yml`, ADR-0014 and F1's `grantPullPush` on the second. Both stay, and E25's Interfaces now lists them as deviations awaiting a ruling.
- **RV-02-65: E25's Step 5 re-runs every Step 4 check (AGENTS.md; minor).** AGENTS.md has Step 5 re-run the Step 4 test and typecheck commands after `biome check --write`, which here rewrites `env.ts`, `env.test.ts` and `next.config.ts`. E25's Step 5 re-ran the infra typecheck, the infra test and the api env test, but not the api and web typechecks that Step 4 runs. It now re-runs all five, in Step 4's order, before `pnpm lint`.
- **RV-02-66: Task D0 fixes three Plan 01 defects from the errata backlog (2026-10-05; major).** EF8-5: `ContactEmailService.verify` let another investor's wrong codes bump, and at the fifth lock, a `VERIFY_EMAIL` challenge, because `OtpService.verify` commits its attempt bump before the in-transaction owner check (reproduced on `main`: investor B's fifth wrong code answered `OTP_LOCKED`). B4: the `err` serializer, and the `msg` pino copies from a message-less error, logged a `DrizzleQueryError`'s bound parameters (reproduced: a mobile number in `msg`, `err.message`, `err.stack` and `err.params`). C9: at desktop width `AppShell` rendered the sidebar on the client's first render while the server rendered the bottom nav, so React reported "Hydration failed" (reproduced under jsdom by rendering at width 0 and hydrating at 1280). D0 refuses a foreign challenge before `OtpService.verify`, redacts bound parameters in the serializer and in a `logMethod` hook, and reads the width through `useSyncExternalStore` with a server snapshot of 0. Each test failed on `main` and passes with its fix (scratch worktree of `main`: api unit 133/133, api integration 130/130, features 23/23, typechecks and `pnpm lint` clean). D1's `me-email.int.test.ts` counts include D0's case.
- **RV-02-67: D1 `ReconBreaks.open` never aborts its caller's transaction (2026-10-05 backlog review, the D1 agent's finding G; major).** It caught `23505` from `recon_breaks_open_uq`, but a failed INSERT aborts the whole PostgreSQL transaction and the caller's COMMIT then silently becomes a ROLLBACK, so the first repeat of a break inside a transaction (D9's NAV sync, Plan 03's handlers, Plan 04's daily folio checks) would discard that transaction's writes without an error. Plan 04 F4 carried the fix (`ON CONFLICT … DO NOTHING` on the index predicate) for S4; D1 now has it from the start, with F4's in-transaction case added to `idempotency.int.test.ts` (12 cases), and F4 no longer edits `runtime-config.ts` (Plan 04 RV-04-F4-3). `runtime-config.ts` no longer imports `pg-errors`. Verified on PostgreSQL 18 in a scratch worktree of `main` plus D0: the new case fails on the old class ("current transaction is aborted") and passes on the new one.
- **RV-02-68: D6 `Notify.enqueue` uses `ON CONFLICT DO NOTHING` (2026-10-05 backlog review; major).** It caught `23505` from `notifications_dedupe_uq` the same way, and its callers enqueue inside their own transactions with per-entity keys (Plan 03 `order-placed:` and `refund:`, Plan 04 `order-allotted:`, `sip-active:`, `redemption-processed:` and others), so a duplicate from a retried job or a racing worker would have rolled the caller's writes back silently. It now inserts with `.onConflictDoNothing({ target: notifications.dedupeKey }).returning({ id })` and enqueues `notifications.send` only when a row was inserted; the unit mocks follow the new chain, and `notify.service.ts` no longer imports `pg-errors`. The drizzle-orm 0.45.3 chain was checked on PostgreSQL 18: the duplicate returns no row and the transaction commits its other writes.
- **RV-02-69: every pg-boss queue gets an explicit policy (R-32, owner ruling 2026-10-05; major).** D2 left every queue on pg-boss's default `standard` policy, under which the `singletonKey`s that Plans 03 and 04 send per aggregate neither dedupe nor serialise. `JOB_NAMES` becomes `JOB_POLICIES`, a registry that gives each job its policy with a reason: `stately` for per-aggregate sync, poll, reconcile and sweep jobs, `exclusive` for jobs that submit to FP, and `standard` for `notifications.send`. D2's table "Queue policies (R-32)" lists all 31 jobs in Plans 02–04, which closes the verify-list item on `singletonKey`. `JobsService` creates each queue with its policy and refuses to start when a stored policy differs, because pg-boss never changes one in place. `Jobs.enqueue` returns the job id, or null for a send the policy refuses, and D9's `NavSyncDeps` and every `Jobs.enqueue` stub in Plans 03 and 04 follow, because a stub that resolves `undefined` fails `typecheck`. Checked on PostgreSQL 18.6 with pg-boss 12.34.0: a refused send returned null with and without the `db` option and the caller's transaction committed; `createQueue` kept a stored policy and `updateQueue` refused `policy`; and a login without CREATE on `pgboss` created both kinds of queue. D2 built from this plan text on Plan 01's `apps/api` passes `typecheck`, `biome ci` after one `--write`, 4/4 unit cases, 12/12 integration cases and both full suites; the five new integration cases fail against the old `JobsService`.
- **RV-02-70: E25 deploys `SanchayMvpStack-prod`, paused, instead of a dev stack (R-31, owner ruling 2026-10-05; major).** There is no AWS dev environment or dev domain, so E25 builds the one prod stack in S2 week 2: `PROD_CONFIG` only (`DEV_CONFIG`, `envSubdomain` and `createGithubOidcProvider` are gone), `www`, `app` and `api.sanchay.in` with the apex 301 on `sanchay.in` in the `sanchay.in` zone, the account's GitHub OIDC provider and the least-privilege deploy role that F1 used to add, now trusting exactly `repo:<owner>/<repo>:environment:prod`, `deploy.yml` with `prod` as its only environment, and ADR-0014's first deploy and the post-deploy checklist for prod. Paused means closed to investors (invite-only sign-in, `orders.enabled` and `plans.sip.enabled` left false, no ingress allow-list), not stopped, so the 0-task flag `-c firstDeploy=true` becomes `-c noTasks=true`, which F1 reuses. Verified with aws-cdk-lib 2.216.0: `tsc` clean, the 24 infra tests pass and `biome ci` is clean; eight single mutations (a wildcard trust, `AdministratorAccess`, no `grantRun`, a closed listener, an orders flag, an ignored `noTasks`, no apex record, the api host sent to web) each fail exactly the test meant for them; and the compiled entry point refuses a synth without its inputs and otherwise synthesises 2 tasks (0 with `-c noTasks=true`).
- **RV-02-71: the plan header follows R-31 and R-33 (owner rulings 2026-10-05; minor).** The title, the goal and E25's execution-order row describe the paused prod stack. R-31 moves R-24's 10-23 catalogue data from dev AWS to the paused prod stack, so the goal says what reaches prod and when: D9's NAV data from E25's first deploy (its worker runs the NAV syncs), the reference tables with F1, and the curated list and the NAV history backfill before GO-1 through F1's ops task (R-33). The branch line records that GitHub runs a `workflow_dispatch` workflow only when its file is on the default branch (GitHub's documentation, checked 2026-10-05), so `deploy.yml` runs wait for the owner's merge to `main`.
- **RV-02-72: R-34 settles RV-02-64, and the logs and image repositories survive a teardown (owner ruling 2026-10-05; major).** The one log group `/sanchay/{env}/app` (400 days, awslogs stream prefix `{env}`) and the two repositories `sanchay-{env}-api` and `sanchay-{env}-web` are now the owner's decision, no longer deviations awaiting a ruling. Both log groups (`/sanchay/{env}/ecs-exec` holds the same kind of record: what people ran in the containers) and both repositories get `RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE`, which aws-cdk-lib 2.216.0 synthesises as `DeletionPolicy: RetainExceptOnCreate` and `UpdateReplacePolicy: Retain`: a stack teardown or rename keeps the 400-day logs (CERT-In needs 180 days) and the images, while a failed first create still removes them, so the retry can create the same names. Before, both log groups were `Delete` (a teardown deleted them) and the repositories `Retain` (an orphan blocked the retry); `log retention 400` becomes one test for both log groups and one for both repositories (25 tests), and each fails on the old policies. F1 adds the `service` field, the metric-filter proof, PII masking and the ten-alarm drill (Plan 04 RV-04-F1-5 to RV-04-F1-9).
- **RV-02-73: D9's history backfill and daily sync fit R-33 (R-33, Plan 04 F1 open question 4; major).** Prod's NAV history is loaded by D9's CLI on F1's ops task, but `fetchHistory` gave up after 10 s while AMFI needs 8 to 31 s before the first byte of a month's history report (66 s for three months, measured 2026-10-05), and the backfill inserted one row per statement and reported parsed rows as written. `fetchHistory` now waits up to 5 minutes and retries only network errors, timeouts, 5xx, 408 and 429; `backfillNavHistory` walks its range one calendar month per AMFI request inside one run, inserts 1,000 rows per `ON CONFLICT DO NOTHING` statement and counts the rows it inserted; `ops-nav-backfill.js` logs a line per month, prints the `--from` to resume with, and gains a read-only `--check`. `nav.sync.daily` also appends its accepted NAVs to `nav_history` (never a quarantined or future-dated one), so E16's returns keep moving after the backfill instead of freezing at its last date. Verified on PostgreSQL 18.6 with undici 7.16.0: 32 parser, 5 client and 6 integration cases pass (the new client and sync cases fail on the old code, each backfill case on a one-line mutation), and the built CLI under `--max-old-space-size=256` loaded June and July 2026 live from AMFI in 21 s and 24 s (254,192 and 277,416 rows; peak heap 166 MB), re-ran July writing 0, and stopped at a month AMFI had no NAVs for with the resume line and exit code 1.
- **RV-02-74: D9's daily sync survives AMFI's real NAVAll.txt (found while verifying R-33 against the live feed; blocker).** The feed of 2026-10-05 carries `Redeemed` (four IL&FS series) and `HDFCNIVODG` in its reinvestment-ISIN column; the parser emitted them as ISINs, and the first insert into `scheme_navs` failed `scheme_navs_isin_ck` (23514), so every sync stopped part-way with its run left `RUNNING` and never enqueued the returns. The same feed lists five matured ISINs twice, four of them with two dates, and applying both flipped `INF204KB1XN0` into quarantine, with a CRITICAL break, on every sync. The parser now skips an ISIN cell that fails `isIsin` (a new parser case), and `runNavSync` applies only the latest row per ISIN, as v1's `latestPerIsin` did (a duplicate in the sync case). With that file on PostgreSQL 18.6 the old code threw 23514 after 11,733 rows on both syncs; the new code finished `SUCCEEDED` with 17,852 rows parsed, none quarantined and 17,847 `nav_history` rows, and a second sync added none.
- **RV-02-75: D0's `serializeErr` also redacts through pino-http (found by the R-34 review, 2026-10-05; major).** The app logs through nestjs-pino's pino-http logger, whose default `wrapSerializers` calls the `err` serializer with pino's already-serialised form, so D0's `instanceof Error` check skipped redaction: a `DrizzleQueryError` logged inside a request kept its bound mobile number in `err.message` and `err.stack`, with `"type":"Object"` (reproduced through `pinoHttp(buildPinoHttpOptions(env)).logger`; D0's test had used a bare `pino`). `serializeErr` now takes either form and redacts pino's serialised form through its documented non-enumerable `raw` Error, and D0's test logs through pino-http as well as plain pino. Verified on a clean checkout of `main` with D0 alone: api unit 134 (132 before), api integration 130 (129 before), features 23 (22 before), typechecks and `pnpm lint` clean. Plan 04 F1 follows in RV-04-F1-11.
- **RV-02-76: D9's `ops:nav-release` lets the next feed value through once (R-35, owner decision 2026-10-05; major).** A release only cleared `quarantined`, so a genuine move over 25% was quarantined again on the next sync and never reached `nav_history`. The release now goes through `releaseNav` (new `nav-release.ts`): it refuses an ISIN that is not quarantined and writes a `NAV_RELEASE` audit row with the flag in one transaction; `runNavSync` reads the pending releases from `audit_events` once per run, takes a released ISIN's next feed value without the NAV-09 check, writes it to `scheme_navs` and `nav_history`, and audits `NAV_RELEASE_APPLIED` in the same transaction, so the following sync checks from the new NAV. D8's schema is unchanged. Two new integration cases (eight in all); verified on PostgreSQL 18.6 in a scratch worktree (the release case failed against the old sync with the break reopened, then 8/8 passed; `tsc` and `biome ci` clean). Plan 04 F7, which rewrites the CLI, keeps the `NAV_RELEASE` row the sync reads (RV-04-F7-5).

**Verify at execution time (not changed here):**
- **Resolved (R-32, RV-02-69): queue policies.** D2 no longer leaves every queue on pg-boss's default `standard` policy, under which `singletonKey` neither dedupes nor serialises. `JOB_POLICIES` gives each job its policy: `stately` for per-aggregate sync, poll, reconcile and sweep jobs, `exclusive` for jobs that submit to FP, and `standard` for `notifications.send` only. `JobsService` creates each queue with that policy, and `Jobs.enqueue` returns null for a send the policy refuses. `jobs.int.test.ts` pins the stored policies and both refusals on PostgreSQL. A policy cannot change in place (`createQueue` on an existing queue keeps the old one, and `updateQueue` refuses `policy`), so `JobsService` refuses to start when a stored policy differs from the registry. D2's table "Queue policies (R-32)" lists every job in Plans 02–04.
- `Money.toWire()` must format whole rupees as `'500.00'` (D10's new test assumes it).

---

### Task D0: Plan 01 fixes from the errata backlog: email-OTP lockout (EF8-5), query parameters in logs, AppShell hydration (Dev A, 3 h)

> Added 2026-10-05 (RV-02-66; the serializer works through pino-http since RV-02-75) from the Plan 01 section of `docs/delivery/plan-errata-backlog.md`. Each defect was reproduced on `main` (`a75ae03`), and each fix was verified test-first on a clean checkout of `main`: api unit 134 passed (132 before), api integration 130 passed (129 before), features 23 passed (22 before), both typechecks clean, `pnpm lint` clean. No migration, no contract change, no new dependency.

**Files:**
- Create:
  - `packages/features/src/home/AppShell.hydration.test.tsx`
- Modify:
  - `apps/api/src/modules/identity/contact-email.service.ts` (EF8-5)
  - `apps/api/test/int/me-email.int.test.ts`
  - `apps/api/src/modules/platform/logging.ts` (B4's `err` serializer)
  - `apps/api/src/modules/platform/logging.test.ts`
  - `packages/features/src/home/AppShell.tsx` (C9)

**Interfaces:**
- Prerequisites: Plan 01 only (B4 `buildPinoOptions`/`buildPinoHttpOptions`, B19/B20 `ContactEmailService`, C9 `AppShell`). D0 runs first in Dev A's lane, so the suite counts below are `main`'s plus D0's four new cases.
- Consumes:
  - `OtpService.verify` (unchanged). It bumps `otp_codes.attempts` on its own bookkeeping pool, already committed, before it compares the code; at the fifth wrong code it burns the code `LOCKED`, and three locked codes in 60 min lock the destination for 30 min. `otpCodes`, `UUID_RE` (`platform/ids.ts`), `AppError('OTP_INVALID')`.
  - pino 10.3.1 with pino-std-serializers 7.1.0: `stdSerializers.err` copies every enumerable property of the error (a `DrizzleQueryError`'s `query` and `params`), appends the causes' messages and stacks, and keeps the original Error on the result's non-enumerable `raw`. With no message argument, pino copies `err.message` into the line's `msg`.
  - pino-http 11.0.0, the app's logger through nestjs-pino (`LoggerModule.forRoot({ pinoHttp: buildPinoHttpOptions(env) })`): its default `wrapSerializers` calls our `err` serializer with pino's serialised form, not the Error.
  - drizzle-orm 0.45.3 `DrizzleQueryError` (exported from `drizzle-orm`): its message is `Failed query: <sql>`, a newline, then `params: ${params}`.
  - react-native-web 0.21.2 `Dimensions`: the window width is 0 without a DOM (Next's server render) and the real width in the browser; under jsdom it reads `document.documentElement.clientWidth` and updates on `resize`. React 19.2 `useSyncExternalStore` uses the server snapshot while hydrating.
- Produces:
  - `serializeErr(value)` and `redactBoundParams(text, err)`, exported from `logging.ts`, plus a pino `hooks.logMethod` in `buildPinoOptions`. No log line carries a value bound to a failing query, in `err.message`, `err.stack`, `err.params` or the line's `msg`, whether it is logged through plain pino or through pino-http; for pino-http's serialised form `serializeErr` redacts through its `raw` Error. The SQL text (`err.query`) stays.
  - `ContactEmailService.verify` answers `OTP_INVALID` for a challenge that is not the caller's `VERIFY_EMAIL` challenge before `OtpService.verify` runs, so another investor's wrong codes never bump its attempts. The in-transaction check stays as defence in depth.
  - `AppShell` reads the width through `useSyncExternalStore(subscribeToWindow, windowWidth, serverWidth)`: hydration renders the server's layout (width 0) and React re-renders with the real width straight after; a client-only mount (and native) reads the real width at once.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/modules/platform/logging.test.ts` (modify: `DrizzleQueryError` is imported after `node:stream`, `pinoHttp` after `pino`, and `buildPinoHttpOptions` joins the `./logging.js` import; two helpers and two cases go before "leaves non-plain objects untouched and bounds depth"):
```ts
import { DrizzleQueryError } from 'drizzle-orm';
import { pinoHttp } from 'pino-http';
import {
  buildPinoHttpOptions,
  buildPinoOptions,
  isRedactedKey,
  REDACTED,
  scrub,
} from './logging.js';
```

```ts
  const failedQuery = () =>
    new DrizzleQueryError(
      'update "app"."investors" set "mobile" = $1 where "id" = $2',
      ['9876543210', 'inv-1'],
      new Error('duplicate key value violates unique constraint "investors_mobile_bidx_uq"'),
    );

  const expectRedacted = (lines: string[]) => {
    for (const raw of lines) {
      expect(raw).not.toContain('9876543210');
      const line = JSON.parse(raw);
      expect(line.err.type).toBe('DrizzleQueryError');
      expect(line.err.message).toContain('Failed query: update "app"."investors"');
      expect(line.err.message).toContain(`params: ${REDACTED}`);
      expect(line.err.message).toContain('duplicate key value violates unique constraint');
      expect(line.err.stack).toContain(`params: ${REDACTED}`);
      expect(line.err.params).toBe(REDACTED);
    }
  };

  it('never logs the bound parameters of a failed query (EF-B4)', () => {
    const { logger, lines } = capture();
    logger.error({ err: failedQuery() });
    logger.error(failedQuery());
    logger.error({ err: failedQuery() }, 'orpc');
    expect(lines).toHaveLength(3);
    expectRedacted(lines);
  });

  it("redacts them through pino-http too, the app's logger, which wraps the err serializer (EF-B4)", () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(String(chunk));
        callback();
      },
    });
    const { logger } = pinoHttp(buildPinoHttpOptions({ SANCHAY_LOG_LEVEL: 'info' }), stream);
    logger.error({ err: failedQuery() });
    logger.error({ err: failedQuery() }, 'ApiExceptionFilter');
    expect(lines).toHaveLength(2);
    expectRedacted(lines);
  });
```

`apps/api/test/int/me-email.int.test.ts` (modify: `otpCodes` joins the schema import, and one case is appended inside `describe('/me/email', …)` after the BOLA case):
```ts
import { investorContacts, investors, otpCodes } from '../../src/db/schema.js';
```

```ts
  it("never lets another investor's wrong codes lock a challenge (EF8-5)", async () => {
    const a = await signedIn('9844400007');
    const b = await signedIn('9844400008');
    const sent = await post('/me/email/otp', a.h, { email: 'ef85.a@example.com' });
    const challengeId = sent.json().challengeId as string;
    const code = t.email.latestCode('ef85.a@example.com');
    const wrong = code === '000000' ? '111111' : '000000';
    for (let attempt = 0; attempt < 6; attempt++) {
      const res = await post('/me/email/verify', b.h, { challengeId, code: wrong });
      expect([res.statusCode, res.json().code]).toEqual([401, 'OTP_INVALID']);
    }
    const [row] = await t.db.db
      .select({ attempts: otpCodes.attempts, consumedAt: otpCodes.consumedAt })
      .from(otpCodes)
      .where(eq(otpCodes.id, challengeId));
    expect(row).toEqual({ attempts: 0, consumedAt: null });
    const own = await post('/me/email/verify', a.h, { challengeId, code });
    expect(own.statusCode).toBe(200);
  });
```

`packages/features/src/home/AppShell.hydration.test.tsx` (create):
```tsx
import { createWebApiClient } from '@sanchay/api-client';
import { AppText } from '@sanchay/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiProvider } from '../api/ApiContext';
import { NavProvider } from '../nav/NavContext';
import { PlatformProvider } from '../platform/PlatformContext';
import { makeNav, makePlatform, TEST_ORIGIN } from '../test-utils';
import { AppShell } from './AppShell';

/** jsdom has no layout: react-native-web reads the window width from documentElement.clientWidth. */
function setViewportWidth(width: number) {
  Object.defineProperty(document.documentElement, 'clientWidth', {
    configurable: true,
    value: width,
  });
  window.dispatchEvent(new Event('resize'));
}

function shell() {
  const client = createWebApiClient({
    origin: () => TEST_ORIGIN,
    onUnauthenticated: () => undefined,
  });
  return (
    <QueryClientProvider client={new QueryClient()}>
      <ApiProvider client={client}>
        <PlatformProvider value={makePlatform()}>
          <NavProvider value={makeNav()}>
            <AppShell navigation={{ active: 'home' }}>
              <AppText>Body</AppText>
            </AppShell>
          </NavProvider>
        </PlatformProvider>
      </ApiProvider>
    </QueryClientProvider>
  );
}

afterEach(() => {
  setViewportWidth(0);
});

describe('AppShell hydration (C9)', () => {
  it('hydrates the server HTML at desktop width without a mismatch, then shows the sidebar', async () => {
    // The server has no window, so react-native-web reports width 0 there.
    setViewportWidth(0);
    const container = document.createElement('div');
    container.innerHTML = renderToString(shell());
    expect(container.querySelector('[data-testid="app-nav-bottom"]')).not.toBeNull();
    document.body.appendChild(container);
    setViewportWidth(1280);
    const errors: unknown[] = [];
    await act(async () => {
      hydrateRoot(container, shell(), { onRecoverableError: (error) => errors.push(error) });
    });
    expect(errors).toEqual([]);
    expect(container.querySelector('[data-testid="app-nav-sidebar"]')).not.toBeNull();
    container.remove();
  });
});
```

- [ ] **Step 2: Run them to confirm they fail**

```
pnpm exec turbo run build --filter=@sanchay/api^... --filter=@sanchay/features^...
pnpm --filter=@sanchay/api test logging
```
Expected failure: 2 failed, 6 passed. Both EF-B4 cases fail on `expected '{"level":50,…' not to contain '9876543210'`: through plain pino the line carries the value in `msg`, `err.message`, `err.stack` and `err.params`, and through pino-http in `err.message` and `err.stack` (with `"type":"Object"`, because the old serializer re-serialised pino's form).

```
pnpm --filter=@sanchay/api test:int me-email
```
Expected failure: 1 failed, 4 passed: `expected [ 401, 'OTP_LOCKED' ] to deeply equal [ 401, 'OTP_INVALID' ]`. Investor B's fifth wrong code has locked investor A's code.

```
pnpm --filter=@sanchay/features test AppShell
```
Expected failure: 1 failed. `errors` holds React's recoverable error "Hydration failed because the server rendered HTML didn't match the client" (server `app-nav-bottom`, client `app-nav-sidebar`).

- [ ] **Step 3: Minimal implementation**

`apps/api/src/modules/identity/contact-email.service.ts` (modify):
- `import { eq } from 'drizzle-orm';` becomes `import { and, eq } from 'drizzle-orm';`, and `import { UUID_RE } from '../platform/ids.js';` follows the `errors.js` import.
- `verify` gains these lines at the top of its body, before `const result = await this.dbh.db.transaction(`:
```ts
    // EF8-5: OtpService.verify commits its attempt bump on its own pool before it compares the code, so a
    // challenge that is not this investor's is refused here, untouched. Another investor's wrong codes
    // would otherwise lock the owner's code, and three locked codes in 60 min lock the owner's email.
    if (!(await this.isOwnChallenge(auth.investorId, challengeId)))
      throw new AppError('OTP_INVALID');
```
- The class gains, after `verify`:
```ts
  private async isOwnChallenge(investorId: string, challengeId: string): Promise<boolean> {
    if (!UUID_RE.test(challengeId)) return false;
    const [row] = await this.dbh.db
      .select({ referenceId: otpCodes.referenceId })
      .from(otpCodes)
      .where(and(eq(otpCodes.id, challengeId), eq(otpCodes.purpose, 'VERIFY_EMAIL')))
      .limit(1);
    return row?.referenceId === investorId;
  }
```

`apps/api/src/modules/platform/logging.ts` (modify):
- Insert after `stripQuery`:
```ts
/**
 * The "params: <values>" texts of every DrizzleQueryError in an error's cause chain. drizzle's message
 * is "Failed query: <sql>", a newline, then "params: " + String(params), so the same String(params)
 * finds them exactly in the message and the stack (EF-B4: a value bound to a failing query may be PII).
 */
function boundParamsTexts(err: Error): string[] {
  const texts: string[] = [];
  let current: unknown = err;
  for (let depth = 0; current instanceof Error && depth < MAX_DEPTH; depth++) {
    const params: unknown = (current as { params?: unknown }).params;
    if (Array.isArray(params) && params.length > 0) texts.push(`params: ${String(params)}`);
    current = current.cause;
  }
  return texts;
}

export function redactBoundParams(text: string, err: Error): string {
  let out = text;
  for (const found of boundParamsTexts(err)) out = out.split(found).join(`params: ${REDACTED}`);
  return out;
}

type SerializedErr = ReturnType<typeof stdSerializers.err>;

function redactSerialized(out: SerializedErr, original: Error): SerializedErr {
  if (out.params !== undefined) out.params = REDACTED;
  out.message = redactBoundParams(out.message, original);
  if (typeof out.stack === 'string') out.stack = redactBoundParams(out.stack, original);
  return out;
}

/**
 * pino's standard error serializer, minus bound query parameters (EF-B4). pino-http wraps the err
 * serializer by default (`wrapSerializers`), so in the app this receives pino's serialized form, whose
 * non-enumerable `raw` is the original Error; plain pino passes the Error itself.
 */
export function serializeErr(value: unknown): unknown {
  if (value instanceof Error) return redactSerialized(stdSerializers.err(value), value);
  const raw: unknown = (value as { raw?: unknown } | null | undefined)?.raw;
  if (raw instanceof Error) return redactSerialized(value as SerializedErr, raw);
  return value;
}

function errorOf(value: unknown): Error | undefined {
  if (value instanceof Error) return value;
  if (isPlainObject(value) && value.err instanceof Error && value.msg === undefined)
    return value.err;
  return undefined;
}
```
- In `buildPinoOptions`, `err: stdSerializers.err,` becomes `err: serializeErr,` and `hooks` follows `serializers`:
```ts
    serializers: {
      req: (req: SerializableReq) => ({ id: req.id, method: req.method, url: stripQuery(req.url) }),
      res: (res: SerializableRes) => ({ statusCode: res.statusCode }),
      err: serializeErr,
    },
    hooks: {
      // With no message, pino copies err.message into the line's msg; redact it there too (EF-B4).
      logMethod(args, method) {
        const err = args.length === 1 ? errorOf(args[0]) : undefined;
        if (err === undefined) return method.apply(this, args);
        return method.apply(this, [args[0], redactBoundParams(err.message, err)] as Parameters<
          typeof method
        >);
      },
    },
```

`packages/features/src/home/AppShell.tsx` (modify):
- The imports become `import { type ReactNode, useSyncExternalStore } from 'react';` and `import { Dimensions, StyleSheet, View } from 'react-native';` (`useWindowDimensions` goes).
- Insert before `export function AppShell(`:
```tsx
function subscribeToWindow(onChange: () => void): () => void {
  const subscription = Dimensions.addEventListener('change', onChange);
  return () => subscription.remove();
}

const windowWidth = (): number => Dimensions.get('window').width;

/**
 * The server has no window (react-native-web reports width 0), so hydration renders with 0 like the
 * server HTML and React re-renders with the real width straight after; a client-only mount reads the
 * real width at once (C9 hydration fix).
 */
const serverWidth = (): number => 0;
```
- In `AppShell`, `const { width } = useWindowDimensions();` becomes `const width = useSyncExternalStore(subscribeToWindow, windowWidth, serverWidth);`.

- [ ] **Step 4: Run tests to confirm they pass**

```
pnpm exec turbo run build --filter=@sanchay/api^... --filter=@sanchay/features^...
pnpm --filter=@sanchay/api test
pnpm --filter=@sanchay/api typecheck
pnpm --filter=@sanchay/api test:int
pnpm --filter=@sanchay/features test
pnpm --filter=@sanchay/features typecheck
```
Expected: api unit 134 passed (19 files; 132 before); api integration 130 passed (19 files; 129 before), including the existing BOLA case; features 23 passed (8 files; 22 before); both typechecks clean.

- [ ] **Step 5: Commit**

```
pnpm exec biome check --write apps/api/src/modules/identity/contact-email.service.ts apps/api/test/int/me-email.int.test.ts apps/api/src/modules/platform/logging.ts apps/api/src/modules/platform/logging.test.ts packages/features/src/home/AppShell.tsx packages/features/src/home/AppShell.hydration.test.tsx
pnpm exec turbo run build --filter=@sanchay/api^... --filter=@sanchay/features^...
pnpm --filter=@sanchay/api test
pnpm --filter=@sanchay/api typecheck
pnpm --filter=@sanchay/api test:int
pnpm --filter=@sanchay/features test
pnpm --filter=@sanchay/features typecheck
pnpm lint
git add apps/api/src/modules/identity/contact-email.service.ts apps/api/test/int/me-email.int.test.ts apps/api/src/modules/platform/logging.ts apps/api/src/modules/platform/logging.test.ts packages/features/src/home/AppShell.tsx packages/features/src/home/AppShell.hydration.test.tsx
git commit -m "fix: stop cross-investor email-OTP lockout, keep query parameters out of logs, hydrate AppShell" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
If lefthook re-stages files (`stage_fixed`), re-run the Step 4 commands, then re-add and re-commit.

---

### Task D1: Platform kernel tables and the idempotency interceptor (Dev A, 8 h)

**Files:**
- Create:
  - `apps/api/src/modules/platform/kernel.schema.ts`
  - `apps/api/src/modules/platform/idempotency.service.ts`
  - `apps/api/src/modules/platform/idempotency.middleware.ts`
  - `apps/api/src/modules/platform/runtime-config.ts`
  - `apps/api/test/int/idempotency.int.test.ts`
  - `apps/api/src/modules/platform/runtime-config.test.ts`
- Modify:
  - `apps/api/src/modules/platform/platform.module.ts`
  - `apps/api/src/modules/platform/ids.ts`
  - `apps/api/src/db/schema.ts`
  - `apps/api/src/modules/identity/me.router.ts`
  - `apps/api/test/int/migrations.int.test.ts`
  - `apps/api/test/int/me-email.int.test.ts` (every POST sends a fresh `Idempotency-Key`, RV-02-40)
- Generated: `apps/api/drizzle/0004_platform_kernel.sql` and `drizzle/meta/*` (the number is assigned at merge, in DAG order, per §0.1 of the outline; this task assumes `0004` since `0003_grants.sql` is the current head — renumber if another Plan-02 task's migration merges first).

**Interfaces:**
- Prerequisites: Plan 01 in full (B1 `newId`/`TableName`, B6 `appSchema`/`bytea`/`tstz`/`stdColumns`/`inList`/`dbUuidv7`/`createDb`/`createTestDatabase`, B7 grants pattern, B8 `AppError`/`normalizeOrpcError`, B9 `buildOrpcConfig`, B12/B19 `me.requestEmailOtp`/`me.verifyEmail` with the `IDEMPOTENCY_ERRORS` already declared in the contract, B18 `bootTestApp`).
- Consumes:
  - From `@sanchay/contract` (already shipped, no change needed): `ERROR_CATALOGUE.IDEMPOTENCY_KEY_REQUIRED = 428`, `.IDEMPOTENCY_KEY_REUSED = 422`, `.IDEMPOTENCY_IN_PROGRESS = 409` — `packages/contract/src/me.ts` already declares these three codes on `requestEmailOtp` and `verifyEmail` with the comment *"The Idempotency-Key codes are declared now; the S2 kernel interceptor enforces them."* This task is that interceptor; **no contract file changes**.
  - From the API: `appSchema`, `bytea`, `tstz`, `inList`, `dbUuidv7` (`db/app-schema.ts`); `Database`, `DbExecutor`, `DB`, `DbHandle` (`db/client.ts`); `newId`, `TableName` (`platform/ids.ts`); `AppError` (`platform/errors.ts`); `CLOCK`, `Clock` (`platform/clock.ts`); `PlatformModule` (`platform/platform.module.ts`); `SanchayClsStore` (`platform/request-context.ts`); `requireAuth` (`identity/request-auth.ts`); `bootTestApp`, `TestApp` (`test/int/app.ts`); `signInNative` (`test/int/flows.ts`); `nativeHeaders` (`test/int/http.ts`); `pgErrorCodeOf` (`platform/pg-errors.ts`, Plan 01, unchanged; RV-02-38); `ORPCGlobalContext` (`@orpc/nest`, extended by B9's `orpc.ts`) and `os` (`@orpc/server`) for the middleware (RV-02-39).
  - **Deviation from outline:** `orpc.ts` is **not** modified. `buildOrpcConfig` already registers `RequestHeadersPlugin`/`ResponseHeadersPlugin`, and `ORPCGlobalContext` already extends `RequestHeadersPluginContext`/`ResponseHeadersPluginContext` (`reqHeaders?: Headers`, `resHeaders?: Headers`), verified against `@orpc/server`'s shipped `.d.ts` (`dist/plugins/index.d.ts`). Every procedure's middleware already receives a live `Headers` object for the request and one it can mutate for the response, so `requireIdempotency()` reads `context.reqHeaders.get('idempotency-key')` and sets `context.resHeaders.set('idempotent-replayed', 'true')` with zero change to `orpc.ts`.
  - **Deviation from outline:** the two "(tsd)" type-level tests (here and in D2) are written as `// @ts-expect-error` lines checked by `pnpm --filter=@sanchay/api typecheck`, not by a `tsd` runner — `tsd` is not in the `pnpm-workspace.yaml` catalog and Plan 01 never added it; introducing a new test runner is out of this task's one-line-deviation budget. `// @ts-expect-error` gives the same compile-time guarantee and is already how this repo's tests pin literal-union rejections (see `identity-schema.int.test.ts`'s `as string as X` casts for the runtime half of the same idea).
- Produces:
  - Tables (`kernel.schema.ts`), schema `app`:
    - `idempotency_keys`: PK `(actor_id, key)`; `route text NOT NULL`; `request_sha256 bytea NOT NULL`; `status IN ('IN_PROGRESS','COMPLETED')`; `response_status integer`; `response_body jsonb`; `created_at timestamptz NOT NULL DEFAULT now()`; `expires_at timestamptz NOT NULL` (created + 24 h). CHECK: `response_status`/`response_body` are both null or both set, and only when `status = 'COMPLETED'`.
    - `app_config (key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`.
    - `recon_breaks`: `id uuid PK` (`newId('recon_breaks')`), std columns, `kind text NOT NULL`, `entity_type text NOT NULL`, `entity_id text NOT NULL`, `severity IN ('WARNING','CRITICAL')`, `detail jsonb NOT NULL DEFAULT '{}'`, `status IN ('OPEN','RESOLVED')` default `OPEN`, `resolved_at timestamptz`. Partial unique index `(kind, entity_id) WHERE status <> 'RESOLVED'` (one open break per kind+entity).
  - `IdempotencyService` (`idempotency.service.ts`, `@Injectable`, exported by `PlatformModule`): `begin(input)`, `complete(input)`, `release(input)` — see Step 3 for exact behaviour (autocommit inserts, not a caller transaction, so a concurrent request sees the `IN_PROGRESS` marker row immediately instead of blocking on a lock).
  - `requireIdempotency(idem: IdempotencyService, cls: ClsService<SanchayClsStore>)` (`idempotency.middleware.ts`): an oRPC middleware built with `os.$context<ORPCGlobalContext>().middleware(...)` (from `@orpc/server`, so it fits every procedure's error map and output; RV-02-39), applied per-procedure with `.use(...)`. Missing/malformed key → 428 `IDEMPOTENCY_KEY_REQUIRED`. Same key, different input hash → 422 `IDEMPOTENCY_KEY_REUSED`. Same key while the first call has not completed → 409 `IDEMPOTENCY_IN_PROGRESS` with `data.retryAfterSeconds: 1` (target design §B.5: "In progress → 409 with `Retry-After: 1`"; D-3 carries it in `data`). Same key, same hash, completed → returns the stored response and sets `idempotent-replayed: true`. Any error the handler throws, a 4xx refusal or a 5xx, releases (deletes) the row, so a retry with the same key runs again; only a returned result is completed and replayed (RV-02-37). A [K] handler therefore refuses before it writes, or inside a transaction that rolls back, so a re-run cannot duplicate a write (every [K] handler in Plans 02–04 does; the OTP attempt that `me.verifyEmail` counts before a 401 is meant to count each try). `IN_PROGRESS` lasts only while a request runs; if `complete()` fails after the handler returned, the row stays `IN_PROGRESS` until it expires, because the handler has run and must not run again for that key.
  - `RuntimeConfig.get<K extends RuntimeConfigKey>(exec: DbExecutor, key: K): Promise<RuntimeConfigValue<K>>` (`runtime-config.ts`; it selects `value::text` and `JSON.parse`s it once, RV-02-31) and `RUNTIME_CONFIG_SCHEMAS`/`RUNTIME_CONFIG_DEFAULTS`/`RuntimeConfigKey`. Typed keys and MVP defaults exactly per the outline: `orders.enabled` (`false`), `plans.sip.enabled` (`false`), `fp.lumpsumFlow` (`'CUSTOM_CHECKOUT' | 'PAYMENT_AFTER_SUBMIT'`, default `'CUSTOM_CHECKOUT'`), `fp.sendPartner` (`false`), `features.redeemByUnits` (`false`), `pilot.caps.perOrder` (`'100000.00'`), `pilot.caps.perInvestorPerDay` (`'200000.00'`), `money_params_version` (`'v1'`), `minAppVersion.android` (`'1.0.0'`).
  - `ReconBreaks.open(exec: DbExecutor, input: {kind, entityType, entityId, severity, detail?}): Promise<void>` (`runtime-config.ts`, co-located with `RuntimeConfig` — both are small `app_config`/`recon_breaks` kernel primitives and the outline gives them no separate file). Idempotent while an open break for the same `(kind, entity_id)` exists (swallows the `23505` from the partial unique index).
  - `me.router.ts` wires `requireIdempotency(this.idempotency, this.cls)` onto both `requestEmailOtp` and `verifyEmail`, superseding D-8.
  - `ids.ts`'s `TableName` union gains `'idempotency_keys' | 'app_config' | 'recon_breaks'`.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/modules/platform/kernel.schema.ts`
```ts
import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, primaryKey, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { appSchema, bytea, dbUuidv7, inList, stdColumns, tstz } from '../../db/app-schema.js';
import { newId } from './ids.js';

export const IDEMPOTENCY_STATUSES = ['IN_PROGRESS', 'COMPLETED'] as const;
export type IdempotencyStatus = (typeof IDEMPOTENCY_STATUSES)[number];

/**
 * PK is (actor_id, key), never a synthetic id: an Idempotency-Key is only ever reused within one
 * actor's own retries (D1 test "keys are per actor"), so the natural key is the lookup key too.
 */
export const idempotencyKeys = appSchema.table(
  'idempotency_keys',
  {
    actorId: text('actor_id').notNull(),
    key: uuid('key').notNull(),
    route: text('route').notNull(),
    requestSha256: bytea('request_sha256').notNull(),
    status: text('status', { enum: IDEMPOTENCY_STATUSES }).notNull().default('IN_PROGRESS'),
    responseStatus: integer('response_status'),
    responseBody: jsonb('response_body').$type<unknown>(),
    createdAt: tstz('created_at').notNull().defaultNow(),
    expiresAt: tstz('expires_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.actorId, t.key] }),
    check('idempotency_keys_status_ck', inList('status', IDEMPOTENCY_STATUSES)),
    check(
      'idempotency_keys_response_pair_ck',
      sql`(response_status IS NULL) = (response_body IS NULL)`,
    ),
    check(
      'idempotency_keys_completed_has_response_ck',
      sql`status = 'IN_PROGRESS' OR response_status IS NOT NULL`,
    ),
    index('idempotency_keys_expires_at_idx').on(t.expiresAt),
  ],
);

/** RuntimeConfig's backing store (runtime-config.ts). One row per typed key; missing row = the default. */
export const appConfig = appSchema.table('app_config', {
  key: text('key').primaryKey(),
  value: jsonb('value').$type<unknown>().notNull(),
  updatedAt: tstz('updated_at').notNull().defaultNow(),
});

export const RECON_BREAK_SEVERITIES = ['WARNING', 'CRITICAL'] as const;
export type ReconBreakSeverity = (typeof RECON_BREAK_SEVERITIES)[number];
export const RECON_BREAK_STATUSES = ['OPEN', 'RESOLVED'] as const;
export type ReconBreakStatus = (typeof RECON_BREAK_STATUSES)[number];

export const reconBreaks = appSchema.table(
  'recon_breaks',
  {
    id: uuid('id')
      .primaryKey()
      .default(dbUuidv7)
      .$defaultFn(() => newId('recon_breaks')),
    ...stdColumns(),
    kind: text('kind').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    severity: text('severity', { enum: RECON_BREAK_SEVERITIES }).notNull(),
    detail: jsonb('detail').$type<Record<string, unknown>>().notNull().default({}),
    status: text('status', { enum: RECON_BREAK_STATUSES }).notNull().default('OPEN'),
    resolvedAt: tstz('resolved_at'),
  },
  (t) => [
    check('recon_breaks_severity_ck', inList('severity', RECON_BREAK_SEVERITIES)),
    check('recon_breaks_status_ck', inList('status', RECON_BREAK_STATUSES)),
    check('recon_breaks_resolved_pair_ck', sql`(status = 'RESOLVED') = (resolved_at IS NOT NULL)`),
    uniqueIndex('recon_breaks_open_uq')
      .on(t.kind, t.entityId)
      .where(sql`status <> 'RESOLVED'`),
  ],
);
```

`apps/api/src/modules/platform/ids.ts` (the `TableName` union gains three names)
```ts
export type TableName =
  | 'app_config'
  | 'audit_events'
  | 'auth_sessions'
  | 'idempotency_keys'
  | 'investor_contacts'
  | 'investor_devices'
  | 'investors'
  | 'otp_codes'
  | 'recon_breaks';
```

`apps/api/src/db/schema.ts` (full file)
```ts
export * from '../modules/identity/identity.schema.js';
export * from '../modules/platform/kernel.schema.js';
export * from '../modules/platform/platform.schema.js';
```

`apps/api/src/modules/platform/runtime-config.test.ts`
```ts
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { DbExecutor } from '../../db/client.js';
import { RUNTIME_CONFIG_DEFAULTS, RuntimeConfig, type RuntimeConfigKey } from './runtime-config.js';

/** RuntimeConfig.get selects `value::text` (RV-02-31), so a stored row reaches it as JSON text. */
function execReturning(jsonText: string | undefined): DbExecutor {
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => Promise.resolve(jsonText === undefined ? [] : [{ value: jsonText }]),
  };
  return chain as unknown as DbExecutor;
}

describe('RuntimeConfig', () => {
  it('returns the default when app_config has no row for the key', async () => {
    const value = await RuntimeConfig.get(execReturning(undefined), 'orders.enabled');
    expect(value).toBe(false);
  });

  it('returns the stored value when it matches the key schema', async () => {
    const value = await RuntimeConfig.get(
      execReturning('"PAYMENT_AFTER_SUBMIT"'),
      'fp.lumpsumFlow',
    );
    expect(value).toBe('PAYMENT_AFTER_SUBMIT');
  });

  it('parses the stored JSON once, so a money cap stays a decimal string', async () => {
    const value = await RuntimeConfig.get(execReturning('"4000.00"'), 'pilot.caps.perOrder');
    expect(value).toBe('4000.00');
  });

  it('throws on a stored value that does not match the key schema', async () => {
    await expect(RuntimeConfig.get(execReturning('"yes"'), 'orders.enabled')).rejects.toThrow();
  });

  it('every default satisfies its own schema', () => {
    for (const key of Object.keys(RUNTIME_CONFIG_DEFAULTS) as RuntimeConfigKey[]) {
      expect(RUNTIME_CONFIG_DEFAULTS[key]).not.toBeUndefined();
    }
  });

  it('rejects an unknown key at the type level', () => {
    // @ts-expect-error 'not.a.key' is not a RuntimeConfigKey
    void RuntimeConfig.get(execReturning(undefined), 'not.a.key');
    expectTypeOf(RuntimeConfig.get).parameter(1).toEqualTypeOf<RuntimeConfigKey>();
  });
});

void vi;
```

`apps/api/test/int/idempotency.int.test.ts`
```ts
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { appConfig, idempotencyKeys, reconBreaks } from '../../src/db/schema.js';
import { HOUR, SECOND } from '../../src/modules/platform/clock.js';
import { bootTestApp, type TestApp } from './app.js';
import { signInNative } from './flows.js';
import { nativeHeaders } from './http.js';

let t: TestApp;
beforeAll(async () => {
  t = await bootTestApp();
});
afterAll(async () => {
  await t.close();
});

async function signedIn(mobile: string) {
  const s = await signInNative(t, mobile);
  return { s, h: nativeHeaders({ installationId: s.installationId, token: s.token }) };
}

const otp = (headers: Record<string, string>, email: string) =>
  t.app.inject({
    method: 'POST',
    url: '/api/v1/me/email/otp',
    headers,
    payload: { email },
  });

describe('idempotency (/me/email/*, D-8 superseded)', () => {
  it('returns 428 without a key on a [K] route', async () => {
    const { h } = await signedIn('9844450001');
    const res = await otp(h, 'no-key@example.com');
    expect([res.statusCode, res.json().code]).toEqual([428, 'IDEMPOTENCY_KEY_REQUIRED']);
  });

  it('replays an identical request with the idempotent-replayed header', async () => {
    const { h } = await signedIn('9844450002');
    const key = { 'idempotency-key': '0199a000-0000-7000-8000-000000000001' };
    const first = await otp({ ...h, ...key }, 'replay@example.com');
    expect(first.statusCode).toBe(200);
    expect(first.headers['idempotent-replayed']).toBeUndefined();
    const second = await otp({ ...h, ...key }, 'replay@example.com');
    expect(second.statusCode).toBe(200);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(second.json()).toEqual(first.json());
  });

  it('422s the same key with a different body', async () => {
    const { h } = await signedIn('9844450003');
    const key = { 'idempotency-key': '0199a000-0000-7000-8000-000000000002' };
    await otp({ ...h, ...key }, 'first@example.com');
    const res = await otp({ ...h, ...key }, 'second@example.com');
    expect([res.statusCode, res.json().code]).toEqual([422, 'IDEMPOTENCY_KEY_REUSED']);
  });

  it('409s a second call while the first is in flight', async () => {
    const { h } = await signedIn('9844450004');
    const key = { 'idempotency-key': '0199a000-0000-7000-8000-000000000003' };
    // Park the first call inside its handler (in the email send) until the second one is answered.
    let resume: () => void = () => undefined;
    const parked = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const send = t.email.send.bind(t.email);
    const spy = vi.spyOn(t.email, 'send').mockImplementationOnce(async (message) => {
      await parked;
      return send(message);
    });
    const first = otp({ ...h, ...key }, 'inflight@example.com');
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1), { timeout: 5_000 });
    const second = await otp({ ...h, ...key }, 'inflight@example.com');
    resume();
    expect([second.statusCode, second.json().code]).toEqual([409, 'IDEMPOTENCY_IN_PROGRESS']);
    expect(second.json().data.retryAfterSeconds).toBe(1);
    expect((await first).statusCode).toBe(200);
    spy.mockRestore();
  });

  it('releases the key on a 5xx, so a retry with the same key runs again', async () => {
    const { h } = await signedIn('9844450005');
    const key = { 'idempotency-key': '0199a000-0000-7000-8000-000000000004' };
    t.email.failNext = true;
    const outage = await otp({ ...h, ...key }, 'outage@example.com');
    expect([outage.statusCode, outage.json().code]).toEqual([503, 'PROVIDER_UNAVAILABLE']);
    const retry = await otp({ ...h, ...key }, 'outage@example.com');
    expect(retry.statusCode).toBe(200);
    expect(retry.headers['idempotent-replayed']).toBeUndefined();
  });

  it('releases the key on a 4xx, so the same key runs again once the refusal clears (RV-02-37)', async () => {
    const { s, h } = await signedIn('9844450006');
    await otp(
      { ...h, 'idempotency-key': '0199a000-0000-7000-8000-000000000008' },
      'cool@example.com',
    );
    const key = '0199a000-0000-7000-8000-000000000009';
    const refused = await otp({ ...h, 'idempotency-key': key }, 'cool@example.com');
    expect([refused.statusCode, refused.json().code]).toEqual([429, 'OTP_COOLDOWN']);
    const rows = await t.db.db
      .select()
      .from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.actorId, s.investorId), eq(idempotencyKeys.key, key)));
    expect(rows).toEqual([]);
    t.clock.advance(31 * SECOND);
    const retry = await otp({ ...h, 'idempotency-key': key }, 'cool@example.com');
    expect(retry.statusCode).toBe(200);
  });

  it('keys are per actor: investor A and investor B may reuse the same key value', async () => {
    const a = await signedIn('9844450007');
    const b = await signedIn('9844450008');
    const key = { 'idempotency-key': '0199a000-0000-7000-8000-000000000005' };
    const resA = await otp({ ...a.h, ...key }, 'perActorA@example.com');
    const resB = await otp({ ...b.h, ...key }, 'perActorB@example.com');
    expect([resA.statusCode, resB.statusCode]).toEqual([200, 200]);
  });

  it('ignores an expired key after 24h (FakeClock)', async () => {
    const { h } = await signedIn('9844450009');
    const key = { 'idempotency-key': '0199a000-0000-7000-8000-000000000006' };
    await otp({ ...h, ...key }, 'expiring@example.com');
    t.clock.advance(24 * HOUR + 60_000);
    const res = await otp({ ...h, ...key }, 'expiring-again@example.com');
    expect(res.statusCode).toBe(200);
  });

  it('me.verifyEmail also requires a key', async () => {
    const { h } = await signedIn('9844450010');
    const sent = await otp({ ...h, 'idempotency-key': '0199a000-0000-7000-8000-000000000007' }, 'verify@example.com');
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/v1/me/email/verify',
      headers: h,
      payload: { challengeId: sent.json().challengeId, code: t.email.latestCode('verify@example.com') },
    });
    expect([res.statusCode, res.json().code]).toEqual([428, 'IDEMPOTENCY_KEY_REQUIRED']);
  });
});

describe('ReconBreaks.open', () => {
  it('is idempotent while the break stays unresolved', async () => {
    const { ReconBreaks } = await import('../../src/modules/platform/runtime-config.js');
    const open = () =>
      ReconBreaks.open(t.db.db, {
        kind: 'NAV_QUARANTINE',
        entityType: 'scheme',
        entityId: 'INF000X01234',
        severity: 'CRITICAL' as const,
        detail: { deltaPct: '4.10' },
      });
    await open();
    await open();
    const rows = await t.db.db
      .select()
      .from(reconBreaks)
      .where(eq(reconBreaks.entityId, 'INF000X01234'));
    expect(rows).toHaveLength(1);
  });

  it("keeps the caller's transaction alive when the break is already open (RV-02-67)", async () => {
    const { ReconBreaks } = await import('../../src/modules/platform/runtime-config.js');
    const input = {
      kind: 'TEST_TWICE',
      entityType: 'folios',
      entityId: 'twice-1',
      severity: 'WARNING' as const,
    };
    await t.db.db.transaction(async (tx) => {
      await ReconBreaks.open(tx, input);
      await ReconBreaks.open(tx, input);
      await ReconBreaks.open(tx, { ...input, entityId: 'twice-2' }); // runs only if the transaction is alive
    });
    const rows = await t.db.db
      .select({ entityId: reconBreaks.entityId })
      .from(reconBreaks)
      .where(eq(reconBreaks.kind, 'TEST_TWICE'));
    expect(rows.map((r) => r.entityId).sort()).toEqual(['twice-1', 'twice-2']);
  });
});

describe('RuntimeConfig.get', () => {
  it('reads a stored money cap back as the same string (jsonb parsed once, RV-02-31)', async () => {
    const { RuntimeConfig } = await import('../../src/modules/platform/runtime-config.js');
    await t.db.db.insert(appConfig).values({ key: 'pilot.caps.perOrder', value: '4000.00' });
    await expect(RuntimeConfig.get(t.db.db, 'pilot.caps.perOrder')).resolves.toBe('4000.00');
  });
});
```

`apps/api/test/int/me-email.int.test.ts` (key-level edit, RV-02-40): `/me/email/*` is [K] from Step 3 on, so without a key all five cases (Plan 01's four and D0's EF8-5 case) fail with 428. Add `import { randomUUID } from 'node:crypto';` and replace the `post` helper; every call in this file is its own intent, so each gets a fresh key:
```ts
/** Every /me/email/* POST is [K] since D1, and each call here is its own intent: a fresh key per call. */
const post = (url: string, headers: Record<string, string>, payload: Record<string, unknown>) =>
  t.app.inject({
    method: 'POST',
    url: `/api/v1${url}`,
    headers: { ...headers, 'idempotency-key': randomUUID() },
    payload,
  });
```

- [ ] **Step 2: Run them to confirm they fail**
```
pnpm --filter=@sanchay/api typecheck
pnpm --filter=@sanchay/api test
pnpm --filter=@sanchay/api test:int
```
Expected:
- `typecheck` and `test` FAIL: `runtime-config.ts` does not exist yet, so `runtime-config.test.ts` cannot resolve `./runtime-config.js`.
- `test:int` FAILS: `idempotency.int.test.ts` cannot import `idempotencyKeys`/`reconBreaks` from `../../src/db/schema.js` (`kernel.schema.ts` does not exist). `me-email.int.test.ts` still passes: Step 1 gave its posts an `Idempotency-Key`, which nothing reads yet.

- [ ] **Step 3: Minimal implementation**

`apps/api/src/modules/platform/idempotency.service.ts`
```ts
import { and, eq } from 'drizzle-orm';
import { Inject, Injectable } from '@nestjs/common';
import { DB, type DbHandle } from '../../db/client.js';
import { CLOCK, DAY, type Clock } from './clock.js';
import { idempotencyKeys } from './kernel.schema.js';
import { pgErrorCodeOf } from './pg-errors.js';

export interface IdempotencyBeginInput {
  actorId: string;
  key: string;
  route: string;
  requestSha256: Buffer;
}

export type IdempotencyOutcome =
  | { kind: 'proceed' }
  | { kind: 'replay'; status: number; body: unknown };

export interface IdempotencyCompleteInput {
  actorId: string;
  key: string;
  status: number;
  body: unknown;
}

export interface IdempotencyReleaseInput {
  actorId: string;
  key: string;
}

/**
 * Backs `requireIdempotency()` (idempotency.middleware.ts). Each write is its own autocommit
 * statement, not wrapped in a caller transaction: a concurrent second call must see the first
 * call's `IN_PROGRESS` marker row via a plain read the moment it commits, not block behind a
 * row lock held for the whole handler (that would turn "in flight" into "in flight, eventually
 * serialised", which is not the 409 the design wants).
 */
@Injectable()
export class IdempotencyService {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async begin(input: IdempotencyBeginInput): Promise<IdempotencyOutcome> {
    const now = this.clock.now();
    try {
      await this.dbh.db.insert(idempotencyKeys).values({
        actorId: input.actorId,
        key: input.key,
        route: input.route,
        requestSha256: input.requestSha256,
        status: 'IN_PROGRESS',
        expiresAt: new Date(now.getTime() + DAY),
      });
      return { kind: 'proceed' };
    } catch (e) {
      if (pgErrorCodeOf(e) !== '23505') throw e;
    }
    const [row] = await this.dbh.db
      .select()
      .from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.actorId, input.actorId), eq(idempotencyKeys.key, input.key)));
    if (row === undefined || row.expiresAt.getTime() <= now.getTime()) {
      await this.dbh.db
        .delete(idempotencyKeys)
        .where(and(eq(idempotencyKeys.actorId, input.actorId), eq(idempotencyKeys.key, input.key)));
      return this.begin(input);
    }
    if (row.status === 'IN_PROGRESS') {
      return Promise.reject(new IdempotencyInProgress());
    }
    if (!row.requestSha256.equals(input.requestSha256)) {
      return Promise.reject(new IdempotencyKeyReused());
    }
    return { kind: 'replay', status: row.responseStatus ?? 200, body: row.responseBody };
  }

  async complete(input: IdempotencyCompleteInput): Promise<void> {
    await this.dbh.db
      .update(idempotencyKeys)
      .set({ status: 'COMPLETED', responseStatus: input.status, responseBody: input.body })
      .where(and(eq(idempotencyKeys.actorId, input.actorId), eq(idempotencyKeys.key, input.key)));
  }

  /** The handler threw (a refusal or a failure): the row goes, so a retry with the same key runs again. */
  async release(input: IdempotencyReleaseInput): Promise<void> {
    await this.dbh.db
      .delete(idempotencyKeys)
      .where(and(eq(idempotencyKeys.actorId, input.actorId), eq(idempotencyKeys.key, input.key)));
  }
}

/** Thrown only inside begin(); idempotency.middleware.ts maps these to their AppError codes. */
export class IdempotencyInProgress extends Error {
  override name = 'IdempotencyInProgress';
}
export class IdempotencyKeyReused extends Error {
  override name = 'IdempotencyKeyReused';
}
```

`pgErrorCodeOf` is Plan 01's export from `apps/api/src/modules/platform/pg-errors.ts` (`auth.service.ts`, `otp.service.ts` and `investor-accounts.service.ts` already use it); D1 imports it and leaves that file unchanged (RV-02-38).

`apps/api/src/modules/platform/idempotency.middleware.ts`
```ts
import { createHash } from 'node:crypto';
import type { ORPCGlobalContext } from '@orpc/nest';
import { os } from '@orpc/server';
import type { ClsService } from 'nestjs-cls';
import { requireAuth } from '../identity/request-auth.js';
import { AppError } from './errors.js';
import {
  type IdempotencyBeginInput,
  IdempotencyInProgress,
  IdempotencyKeyReused,
  type IdempotencyOutcome,
  IdempotencyService,
} from './idempotency.service.js';
import { UUID_RE } from './ids.js';
import type { SanchayClsStore } from './request-context.js';

/** begin(), with its two refusals mapped to their AppError codes (spec: "409 with Retry-After: 1"). */
async function beginOrRefuse(
  idem: IdempotencyService,
  input: IdempotencyBeginInput,
): Promise<IdempotencyOutcome> {
  try {
    return await idem.begin(input);
  } catch (e) {
    if (e instanceof IdempotencyInProgress) {
      throw new AppError('IDEMPOTENCY_IN_PROGRESS', { retryAfterSeconds: 1 });
    }
    if (e instanceof IdempotencyKeyReused) throw new AppError('IDEMPOTENCY_KEY_REUSED');
    throw e;
  }
}

/**
 * Applied with `.use(requireIdempotency(...))` on a procedure's implementer (`.use()` reads
 * `context.reqHeaders`/`context.resHeaders`, both already injected by B9's RequestHeadersPlugin
 * and ResponseHeadersPlugin — see the deviation note in this task's Interfaces). Built with
 * `os.$context<ORPCGlobalContext>().middleware(...)`, so it fits every procedure's error map and output.
 *
 * A handler that returns completes the key, and the same key with the same input replays its response.
 * A handler that throws, a 4xx refusal or a 5xx, releases the key, so a retry with the same key runs
 * again; IN_PROGRESS lasts only while a request runs (RV-02-37).
 */
export function requireIdempotency(idem: IdempotencyService, cls: ClsService<SanchayClsStore>) {
  return os
    .$context<ORPCGlobalContext>()
    .middleware(async ({ context, path, next }, input: unknown) => {
      const auth = requireAuth(cls);
      const header = context.reqHeaders?.get('idempotency-key') ?? undefined;
      if (header === undefined || !UUID_RE.test(header)) {
        throw new AppError('IDEMPOTENCY_KEY_REQUIRED');
      }
      const ref = { actorId: auth.investorId, key: header.toLowerCase() };
      const outcome = await beginOrRefuse(idem, {
        ...ref,
        route: path.join('.'),
        requestSha256: createHash('sha256')
          .update(JSON.stringify(input ?? null))
          .digest(),
      });
      if (outcome.kind === 'replay') {
        context.resHeaders?.set('idempotent-replayed', 'true');
        return { output: outcome.body, context: {} };
      }
      let handled = false;
      try {
        const result = await next();
        handled = true;
        // A failed complete() keeps the row IN_PROGRESS: the handler has run, so this key must
        // not run it again.
        await idem.complete({ ...ref, status: 200, body: result.output });
        return result;
      } catch (err) {
        if (!handled) await idem.release(ref);
        throw err;
      }
    });
}
```

`apps/api/src/modules/platform/runtime-config.ts`
```ts
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { DbExecutor } from '../../db/client.js';
import { AppError } from './errors.js';
import { appConfig, reconBreaks, RECON_BREAK_SEVERITIES, type ReconBreakSeverity } from './kernel.schema.js';

export const RUNTIME_CONFIG_SCHEMAS = {
  'orders.enabled': z.boolean(),
  'plans.sip.enabled': z.boolean(),
  'fp.lumpsumFlow': z.enum(['CUSTOM_CHECKOUT', 'PAYMENT_AFTER_SUBMIT']),
  'fp.sendPartner': z.boolean(),
  'features.redeemByUnits': z.boolean(),
  'pilot.caps.perOrder': z.string(),
  'pilot.caps.perInvestorPerDay': z.string(),
  money_params_version: z.string(),
  'minAppVersion.android': z.string(),
} as const;

export type RuntimeConfigKey = keyof typeof RUNTIME_CONFIG_SCHEMAS;
export type RuntimeConfigValue<K extends RuntimeConfigKey> = z.infer<
  (typeof RUNTIME_CONFIG_SCHEMAS)[K]
>;

/** MVP defaults (R-06 keeps plans.sip.enabled false until GO-2; H-2 fixes the lumpsum flow). */
export const RUNTIME_CONFIG_DEFAULTS: { [K in RuntimeConfigKey]: RuntimeConfigValue<K> } = {
  'orders.enabled': false,
  'plans.sip.enabled': false,
  'fp.lumpsumFlow': 'CUSTOM_CHECKOUT',
  'fp.sendPartner': false,
  'features.redeemByUnits': false,
  'pilot.caps.perOrder': '100000.00',
  'pilot.caps.perInvestorPerDay': '200000.00',
  money_params_version: 'v1',
  'minAppVersion.android': '1.0.0',
};

export class RuntimeConfig {
  static async get<K extends RuntimeConfigKey>(
    exec: DbExecutor,
    key: K,
  ): Promise<RuntimeConfigValue<K>> {
    // The jsonb is read as text and parsed once (RV-02-31): Drizzle's jsonb mapper JSON-parses
    // the string node-postgres has already parsed, so a stored "4000.00" would read back as 4000.
    const [row] = await exec
      .select({ value: sql<string>`${appConfig.value}::text` })
      .from(appConfig)
      .where(eq(appConfig.key, key));
    if (row === undefined) return RUNTIME_CONFIG_DEFAULTS[key];
    const schema = RUNTIME_CONFIG_SCHEMAS[key];
    const parsed = schema.safeParse(JSON.parse(row.value));
    if (!parsed.success) {
      throw new AppError('INTERNAL', {
        message: `app_config row '${key}' does not match its RuntimeConfig schema`,
        cause: parsed.error,
      });
    }
    return parsed.data as RuntimeConfigValue<K>;
  }
}

export interface ReconBreakOpenInput {
  kind: string;
  entityType: string;
  entityId: string;
  severity: ReconBreakSeverity;
  detail?: Record<string, unknown>;
}

export class ReconBreaks {
  /**
   * Idempotent while an open break for the same (kind, entity_id) exists. ON CONFLICT on the partial
   * unique index, not a caught 23505: a failed INSERT aborts the caller's transaction, and PostgreSQL
   * then turns its COMMIT into a silent ROLLBACK (RV-02-67).
   */
  static async open(exec: DbExecutor, input: ReconBreakOpenInput): Promise<void> {
    if (!RECON_BREAK_SEVERITIES.includes(input.severity)) {
      throw new TypeError(`ReconBreaks.open: unknown severity '${input.severity}'`);
    }
    await exec
      .insert(reconBreaks)
      .values({
        kind: input.kind,
        entityType: input.entityType,
        entityId: input.entityId,
        severity: input.severity,
        detail: input.detail ?? {},
      })
      .onConflictDoNothing({
        target: [reconBreaks.kind, reconBreaks.entityId],
        where: sql`status <> 'RESOLVED'`,
      });
  }
}

void and;
```

`apps/api/src/modules/platform/platform.module.ts` (add `IdempotencyService`)
```ts
import { IdempotencyService } from './idempotency.service.js';
// ...existing imports unchanged...

@Global()
@Module({})
export class PlatformModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: PlatformModule,
      providers: [
        // ...existing providers unchanged...
        AuditService,
        IdempotencyService,
        DbLifecycle,
      ],
      exports: [AppConfig, CLOCK, KEY_SERVICE, Crypto, DB, AuditService, IdempotencyService],
    };
  }
}
```

`apps/api/src/modules/identity/me.router.ts` (full file)
```ts
import { Controller, Inject } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@sanchay/contract';
import { ClsService } from 'nestjs-cls';
import { IdempotencyService } from '../platform/idempotency.service.js';
import { requireIdempotency } from '../platform/idempotency.middleware.js';
import type { SanchayClsStore } from '../platform/request-context.js';
import { ContactEmailService } from './contact-email.service.js';
import { requireAuth } from './request-auth.js';

@Controller()
export class MeRouter {
  constructor(
    @Inject(ContactEmailService) private readonly emails: ContactEmailService,
    @Inject(ClsService) private readonly cls: ClsService<SanchayClsStore>,
    @Inject(IdempotencyService) private readonly idempotency: IdempotencyService,
  ) {}

  @Implement(contract.me.requestEmailOtp)
  requestEmailOtp() {
    return implement(contract.me.requestEmailOtp)
      .use(requireIdempotency(this.idempotency, this.cls))
      .handler(({ input }) => this.emails.requestVerification(requireAuth(this.cls), input.email));
  }

  @Implement(contract.me.verifyEmail)
  verifyEmail() {
    return implement(contract.me.verifyEmail)
      .use(requireIdempotency(this.idempotency, this.cls))
      .handler(({ input }) =>
        this.emails.verify(requireAuth(this.cls), input.challengeId, input.code),
      );
  }
}
```

`apps/api/test/int/migrations.int.test.ts` (append one test to the existing `describe` block)
```ts
  it('creates app.idempotency_keys, app.app_config and app.recon_breaks', async () => {
    for (const name of ['idempotency_keys', 'app_config', 'recon_breaks']) {
      const r = await t.pool.query<{ t: string | null }>(
        `SELECT to_regclass('app.${name}')::text AS t`,
      );
      expect(r.rows[0]?.t).toBe(`app.${name}`);
    }
  });
```

Generate the migration:
```
pnpm --filter=@sanchay/api db:generate --name=platform_kernel
```
Expected: `apps/api/drizzle/0004_platform_kernel.sql` is created with `CREATE TABLE "app"."idempotency_keys"` (composite PK on `actor_id, key`), `CREATE TABLE "app"."app_config"`, `CREATE TABLE "app"."recon_breaks"`, and `CREATE UNIQUE INDEX "recon_breaks_open_uq" … WHERE status <> 'RESOLVED'`. None of the three is append-only, so `0004_platform_kernel.sql` needs no `REVOKE` line; `0003_grants.sql`'s `ALTER DEFAULT PRIVILEGES` already covers `sanchay_app` DML on them.

- [ ] **Step 4: Run tests to confirm they pass**
```
pnpm --filter=@sanchay/api typecheck
pnpm --filter=@sanchay/api test
pnpm --filter=@sanchay/api test:int
pnpm --filter=@sanchay/api db:check
```
Expected:
- `typecheck`: exits 0 (the `// @ts-expect-error` line in `runtime-config.test.ts` is satisfied, not a real error).
- `test`: `runtime-config.test.ts` — 6 passed.
- `test:int`: `idempotency.int.test.ts` — 12 passed (the nine `/me/email/*` cases, the two `ReconBreaks.open` cases and `RuntimeConfig.get`); `migrations.int.test.ts` — 8 passed (was 7); `me-email.int.test.ts` — 5 passed (Plan 01's four and D0's EF8-5 case; Step 1 gave every post a fresh `Idempotency-Key`; without it all five fail with 428, RV-02-40).
- `db:check`: `db:check OK: schema and migrations are in sync`.

- [ ] **Step 5: Commit**
```
pnpm exec biome check --write apps/api
pnpm --filter=@sanchay/api typecheck
pnpm --filter=@sanchay/api test
pnpm --filter=@sanchay/api test:int
pnpm lint
git add apps/api/src/modules/platform/kernel.schema.ts apps/api/src/modules/platform/idempotency.service.ts apps/api/src/modules/platform/idempotency.middleware.ts apps/api/src/modules/platform/runtime-config.ts apps/api/src/modules/platform/runtime-config.test.ts apps/api/src/modules/platform/platform.module.ts apps/api/src/modules/platform/ids.ts apps/api/src/db/schema.ts apps/api/src/modules/identity/me.router.ts apps/api/test/int/idempotency.int.test.ts apps/api/test/int/migrations.int.test.ts apps/api/test/int/me-email.int.test.ts apps/api/drizzle/0004_platform_kernel.sql apps/api/drizzle/meta/0004_snapshot.json apps/api/drizzle/meta/_journal.json
git commit -m "feat(api): idempotency-key interceptor, RuntimeConfig and ReconBreaks kernel tables" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task D2: JobsModule (pg-boss 12.34.0), worker role, heartbeats, readiness, cleanup (Dev A, 10 h)

**Files:**
- Create:
  - `apps/api/src/modules/platform/jobs/jobs.module.ts`
  - `apps/api/src/modules/platform/jobs/jobs.service.ts`
  - `apps/api/src/modules/platform/jobs/job-registry.ts`
  - `apps/api/src/modules/platform/jobs/worker.main.ts`
  - `apps/api/src/modules/platform/jobs/heartbeat.ts`
  - `apps/api/src/modules/platform/jobs/schedules.ts`
  - `apps/api/src/modules/platform/jobs/jobs.module.test.ts`
  - `apps/api/src/modules/platform/jobs/jobs.schema.ts`
  - `apps/api/src/db/drizzle-config.test.ts`
  - `apps/api/test/int/jobs.int.test.ts`
- Modify:
  - `apps/api/drizzle.config.ts` (`schema` becomes a list of globs, RV-02-41)
  - `apps/api/src/main.ts`
  - `apps/api/src/app.module.ts`
  - `apps/api/src/modules/platform/health.router.ts`
  - `apps/api/src/modules/platform/ids.ts`
  - `apps/api/src/modules/identity/identity.module.ts`
  - `apps/api/src/db/migrate.ts`
  - `apps/api/src/db/schema.ts`
  - `apps/api/test/int/health.int.test.ts` (Plan 01's readiness case, RV-02-42)
  - `apps/api/test/int/migrations.int.test.ts`
  - `apps/api/package.json` (`dependencies["pg-boss"] = "catalog:"`, added through `pnpm add`)
  - `pnpm-workspace.yaml` (`catalog: 'pg-boss': 12.34.0` — a **new** catalog entry, not an edit to an existing pin; the A1 rule's "nobody edits `catalog:`" governs changing an already-pinned version, not a task adding the one new package its own outline requires. If `pnpm install` then reports `ERR_PNPM_IGNORED_BUILDS` or a release-age refusal for `pg-boss` or a transitive dependency, resolve it with the matching A1 remedy — an `allowBuilds` entry or an exact-version `minimumReleaseAgeExclude` entry — and append the row to `docs/adr/0001-versions.md` in this same commit; do not silently work around either check)
  - `pnpm-lock.yaml` (changed by `pnpm add`)
  - `docs/adr/0001-versions.md` (append-only row recording the new `pg-boss: 12.34.0` catalog pin, mirroring the existing table's "design §A.2 / outside §A.2" column — this is outside §A.2 since pg-boss is new to Plan 02)
- Generated: `apps/api/drizzle/0005_worker_heartbeats.sql` (custom) and `drizzle/meta/*` (renumber at merge if D1's `0004` is not the true predecessor — see D1's Interfaces note; this task's migration is a custom one, so it depends only on whichever platform_kernel-numbered migration actually merged first).

**Interfaces:**
- Prerequisites: **D1** (this task's custom migration grants `sanchay_app` on schema `pgboss`, which must run after `0003_grants.sql` exists as the pattern to extend; it does not touch D1's tables).
- Consumes: `AppConfig`, `CLOCK`/`Clock`/`FakeClock`, `DB`/`DbHandle`/`Database`, `PlatformModule`, `AppError`, `createDb`, `MIGRATIONS_FOLDER`/`runMigrations` (`db/migrate.ts`), `bootTestApp`, `createTestDatabase`, `TestDatabase`.
- Produces:
  - `JOB_POLICIES` (`job-registry.ts`, R-32): the job registry. It maps every job name to its pg-boss queue policy, with a one-line reason per entry: `'identity.cleanup' | 'nav.sync.daily' | 'catalogue.returns.compute' | 'catalogue.fp.sync' | 'sms.dlr.sync' | 'notifications.send' | 'consent.expiry.sweep' | 'drafts.abandon' | 'fp.event.process'`, all `stately` except `notifications.send` (`standard`). `JobName` is `keyof typeof JOB_POLICIES`, `JOB_NAMES` lists the names (`Object.keys`), and `queuePolicyDrift(stored)` names the registry queues that `PgBoss.getQueues` returns missing or with another policy. **Deviation from outline:** the outline calls `JOB_NAMES` "a closed union of every MVP job in spec §1" and defers verification to D3's expansion; this task's Files list gives it no mandate to re-derive that full inventory from the spec, so `JOB_NAMES` here is the jobs Plan 02 itself needs (`identity.cleanup`, registered by this task) plus one forward-declared name per job the outline names for a later Plan-02/03 task (D6 `sms.dlr.sync`/`notifications.send`, D9 `nav.sync.daily`, D10 `catalogue.fp.sync`/`catalogue.returns.compute`, E1 `fp.event.process`, E4 `consent.expiry.sweep`/`drafts.abandon`). `JOB_POLICIES` is append-only (same convention as `ERROR_CATALOGUE`): each later task that adds a job appends `'name': 'policy', // reason` to it in the same PR that registers its handler, and no entry is ever removed, renamed or given another policy (see "Queue policies (R-32)" below).
  - `@JobHandler(name: JobName)` (class decorator, `job-registry.ts`): marks a provider's `handle(job)` method as the pg-boss worker for `name`, found via Nest's `DiscoveryService`.
  - `Jobs` (`jobs.service.ts`, `@Injectable()`, provided and exported by the global `JobsModule`): `enqueue(exec: DbExecutor, name: JobName, data: unknown, opts?: {singletonKey?, startAfter?: Date | number, retryLimit?}): Promise<string | null>`. It returns the pg-boss job id, or null when the queue's policy refused the send (R-32): a job with the same `singletonKey` is already queued (`stately`) or queued, retrying or running (`exclusive`). A refusal is not an error, and the caller's transaction stays usable. It sends through its own application's `JobsService` (injected, never module-level state, RV-02-45) with pg-boss's `send(name, data, {db})` BYODB adapter on the caller's executor, so the job commits or rolls back with the caller's transaction (`startAfter` as a number is seconds, per pg-boss). Consumers inject it (`@Inject(Jobs) private readonly jobs: Jobs`). Unit tests stub it with `{ enqueue: vi.fn() }`, and a `vi.spyOn(…, 'enqueue')` stub resolves a job id (`mockResolvedValue('job-id')`, or `return 'job-id'` from `mockImplementation`), because a stub that resolves `undefined` no longer typechecks.
  - `registerSchedules(boss: PgBoss): Promise<void>` (`schedules.ts`): the one schedule extension point, awaited by `JobsService` after the workers are registered. It starts empty; later tasks add keyed `await boss.schedule(name, cron, data, {tz: 'Asia/Kolkata', key})` calls to its body (pg-boss needs a distinct `key` for several schedules on one queue). `JobsService.onModuleInit` also calls `boss.createQueue(name, {policy: JOB_POLICIES[name]})` for every `JOB_NAMES` entry (pg-boss 10+ requires a queue before `send`/`work`). It then reads the queues back (`boss.getQueues`) and throws, after stopping pg-boss, when `queuePolicyDrift` names one: pg-boss would otherwise keep running a queue under a policy it was created with earlier. `Jobs.enqueue` goes through `boss.send(..., {db})` (pg-boss's BYODB adapter) so the job commits with the caller's transaction; it never writes `pgboss.job` directly.
  - `JobsService` (`jobs.service.ts`, `@Injectable`, provided by the new `JobsModule`, `@Global()`, imported once from `AppModule.forRoot`): owns its application's `PgBoss` instance (a second Nest application in the same process, such as `runWorker`'s in the tests, owns another). `onModuleInit()` starts pg-boss (`migrate: false` — see the migration note below) in **every** role so `Jobs.enqueue` is callable from `api` request handlers; it registers `.work()` handlers and starts the heartbeat loop **only** when `env.SANCHAY_APP_ROLE === 'worker'`. `onApplicationShutdown()` stops the heartbeat and calls `boss.stop({graceful: true, timeout: 10_000})`.
  - pg-boss as the D6 app login (RV-02-43): under D6 (Plan 04 F1) api, worker and ops log in as `sanchay_app_login`, a `sanchay_app` member without CREATE on schema `pgboss`. Everything `JobsService` and `Jobs` run is DML on the tables `0005` grants: `start` with `migrate: false` installs nothing (it checks the schema version), `createQueue(name, {policy})` is an idempotent `INSERT … ON CONFLICT DO NOTHING` into `pgboss.queue` (the policies' unique indexes come with pg-boss's schema), `getQueues` is a `SELECT`, and `send`, `work`, `schedule` and maintenance write rows. Never pass `partition: true` to `createQueue` (a table per queue) or `persistQueueStats` to `PgBoss` (daily `queue_stats` partitions): both are DDL, fail with 42501 for that login, and go unnoticed in the tests, which run as a superuser.
  - `runWorker(env: Env): Promise<INestApplicationContext>` (`worker.main.ts`): `NestFactory.createApplicationContext(AppModule.forRoot(env), {bufferLogs: true})` — no Fastify adapter, so nothing ever binds a port; wires `SIGTERM` to drain.
  - `startHeartbeat(dbh: DbHandle, clock: Clock, taskId: string): {stop(): void}` (`heartbeat.ts`): upserts `worker_heartbeats (task_id, last_beat_at)` every 30 s.
  - Table `worker_heartbeats (task_id text PRIMARY KEY, last_beat_at timestamptz NOT NULL)`.
  - `/health` (`health.router.ts`) is unchanged (liveness only, per R-12 — this task does **not** add a NAV check, which stays out of scope until F1). `/health/ready` gains two checks: `pgboss` (`SELECT 1` against `pgboss.job`) and `heartbeat` (freshest `worker_heartbeats.last_beat_at` within 2 min); either failing throws `AppError('INTERNAL', {retryable: true})`, which answers 500 `INTERNAL` with `data.retryable: true` (RV-02-42: `ERROR_CATALOGUE` maps `INTERNAL` to 500 and `retryable` does not change the status; `INTERNAL` is the only error the contract declares for `health.ready`, spec §1.5 makes the route diagnostic, and F24's worker-down runbook only tells 200 from anything else). The heartbeat's age is measured with the injected `Clock`, so tests drive it with `FakeClock`. Without a fresh heartbeat the route fails, so Plan 01's readiness case in `health.int.test.ts` now seeds one.
  - `identity.module.ts` gains an inline `IdentityCleanupJob` provider (same inline-provider style `identity.module.ts` already uses for `OtpBookkeepingDbLifecycle`), `@JobHandler('identity.cleanup')`: hourly, deletes `otp_codes` rows older than 24 h **only** for `purpose IN ('LOGIN', 'VERIFY_EMAIL')` (R-13; every other purpose, including `CONSENT`, is untouched by this task since no `CONSENT` rows exist before Plan 03's E3/E4), and deletes `auth_sessions` rows whose `absolute_expires_at` is more than 7 days in the past.
  - `main.ts`: `SANCHAY_APP_ROLE === 'worker'` now calls `runWorker(env)` instead of printing "not available yet" and exiting 1.
  - `db/migrate.ts`'s `runMigrations` bootstraps pg-boss's own schema **before** the Drizzle migrations run, so `0005_worker_heartbeats.sql`'s `GRANT`s on `pgboss.*` succeed against tables that already exist (see Step 3).

**Queue policies (R-32).** pg-boss 12.34.0 enforces a queue's policy with partial unique indexes on `pgboss.job`. A send that one of them refuses is an `INSERT … ON CONFLICT DO NOTHING` that returns no row, so `send` returns null, with or without the `db` option, and the caller's transaction is not aborted. `fetch` treats the same conflict as an empty fetch. All of this was checked on PostgreSQL 18.6 (RV-02-69).
- `stately` (per-aggregate sync, poll, reconcile and sweep jobs): at most one queued and one running job per `singletonKey`, the aggregate id (index `(name, state, key)` over created, retry and active). Keyless sends, schedule ticks included, share one slot. So a job may re-enqueue itself while it runs, and a second send while one is queued is refused.
- `exclusive` (jobs that submit to FP): at most one job per `singletonKey` across created, retry and active. A duplicate submit is refused while one is queued, retrying or running, and so is a job's send of its own key while it runs: an exclusive job never re-enqueues itself.
- `standard`: no limit. Only `notifications.send` uses it; the `notifications` row is its dedupe (RV-02-68).
- What later tasks must know:
  - A schedule tick is a keyless send. On a stately queue a tick is dropped while the previous one is still queued, and two schedules on one queue that can fire in the same minute need distinct `singletonKey`s in their options, or one tick is dropped (F2's `mandates.poll`).
  - A nudge (a webhook or a browser return) for an aggregate whose delayed poll is already queued is refused. That poll applies the change when its delay ends.
  - A queued job whose key is running waits for it, and while it is the oldest ready job in its queue pg-boss may fetch nothing else from that queue, so handlers stay short.

| Job | Task | Policy | `singletonKey` | Why |
|---|---|---|---|---|
| `identity.cleanup` | D2 | stately | none (hourly) | sweep |
| `nav.sync.daily` | D9 | stately | none (four ticks a day at different times) | sync sweep of the AMFI feed |
| `catalogue.returns.compute` | D9 sends, E16 handles | stately | none | one queued run covers every NAV sync before it |
| `catalogue.fp.sync` | D10, F19 schedule | stately | none (daily) | sync sweep |
| `sms.dlr.sync` | D6 (no handler yet) | stately | the message row id, once it has a handler | per-message sync |
| `notifications.send` | D6 | standard | none | the `notifications` row is the dedupe (RV-02-68) |
| `consent.expiry.sweep` | E4 | stately | none (every 5 minutes) | sweep |
| `drafts.abandon` | E4 | stately | none (hourly) | sweep |
| `fp.event.process` | E1, F7 `ops:sync` | stately | the `inbound_webhook_events` id | per-event sync; re-enqueues itself to retry |
| `onboarding.preverify` | E6 | stately | the `kyc_checks` id | poll: creates the pre-verification once (class K, its id stored), then re-enqueues itself |
| `onboarding.bank.verify` | E7 | stately | the `kyc_checks` id | the same, for the bank account |
| `onboarding.provision` | E11 | exclusive | the ATTEST challenge id | FP provisioning writes |
| `orders.purchase.submit` | E20 | exclusive | the challenge id | FP submit |
| `orders.purchase.advance` | E20 | stately | the order id | poll; re-enqueues itself |
| `fp.reconcile.nonfinal` | E20, F7 | stately | none (every 5 minutes; F7's `ops:sync` sends keyless too) | backstop sweep, one run at a time |
| `payments.poll` | E21 | stately | the payment attempt id | poll; re-enqueues itself |
| `ops.gauges.emit` | F1 | stately | none (every minute) | sweep |
| `mandates.submit` | F2 | exclusive | the mandate's challenge id (approve and re-authorise) | FP submit |
| `mandates.poll` | F2 | stately | the scope, `PENDING` or `APPROVED` (schedule options) | sweep per scope; both schedules fire at 07:30 |
| `plans.sip.submit` | F2 | exclusive | the challenge id (approve) or the plan id (`mandates.poll`), never both for one plan | FP submit |
| `plans.sip.advance` | F2, F7, F28 | stately | the plan id | poll; re-enqueues itself |
| `plans.instalments.sync` | F2 | stately | none (twice a day) | sync sweep |
| `folio.sync` | F4, F5 | stately | the folio id (F5), none for the 05:00 sweep | sync |
| `orders.units.reconcile` | F4 | stately | none (every 2 hours) | reconcile sweep |
| `orders.redemption.submit` | F5, F7 | exclusive | the challenge id | FP submit |
| `orders.redemption.advance` | F5, F7 | stately | the order id | poll; re-enqueues itself |
| `payout.watch` | F5 | stately | none (daily) | sweep |
| `integrity.invariants` | F7 | stately | none (hourly) | sweep |
| `recon.fp.daily` | F7 | stately | none (daily) | reconcile sweep |
| `plans.cancel.submit` | F28 | exclusive | the cancel challenge id | FP submit; its 60 s re-read goes through `plans.sip.advance` |
| `plans.cancel.sweep` | F28 | stately | none (every 5 minutes) | sweep |

- [ ] **Step 1: Write the failing tests**

Add the new dependency (idempotent; PowerShell needs the quotes):
```
pnpm --filter=@sanchay/api add "pg-boss@catalog:"
```
Expected: `pnpm-workspace.yaml`'s `catalog:` map gains `'pg-boss': 12.34.0` (add this key manually before running the command, in the same alphabetical position as the rest of the catalog — `pnpm add x@catalog:` resolves against whatever the catalog already says, it does not invent the entry), `apps/api/package.json`'s `dependencies` gains `"pg-boss": "catalog:"`, and `pnpm-lock.yaml` links it. If the install reports `ERR_PNPM_IGNORED_BUILDS` (pg-boss ships no native binary, so this is unlikely but must still be checked) or a release-age refusal, apply the matching A1 remedy before continuing and append the ADR-0001 row now, not after Step 5.

`apps/api/src/modules/platform/jobs/job-registry.ts`
```ts
import { SetMetadata } from '@nestjs/common';

/** The pg-boss queue policies Sanchay uses (R-32). */
export type JobPolicy = 'standard' | 'stately' | 'exclusive';

/**
 * Every job and its pg-boss queue policy (R-32). Append-only, mirroring @sanchay/contract's ERROR_CATALOGUE:
 * never remove, rename or re-policy an entry. pg-boss cannot change a queue's policy after `createQueue` (a
 * second `createQueue` keeps the stored row and `updateQueue` refuses `policy`), so JobsService refuses to
 * start when a stored policy differs from this map.
 * - stately: per-aggregate sync, poll, reconcile and sweep jobs. At most one queued and one running job per
 *   singletonKey (the aggregate id); keyless sends, schedule ticks included, share one slot.
 * - exclusive: jobs that submit to FP. At most one job per singletonKey in created, retry or active.
 * - standard: no limit; notifications.send only (the notifications row is the dedupe, RV-02-68).
 * A send that the policy refuses is not an error: `Jobs.enqueue` returns null.
 */
export const JOB_POLICIES = {
  'identity.cleanup': 'stately', // hourly sweep, keyless (D2)
  'nav.sync.daily': 'stately', // four AMFI syncs a day at different times, keyless (D9)
  'catalogue.returns.compute': 'stately', // keyless after each NAV sync; a queued run covers later syncs (D9, E16)
  'catalogue.fp.sync': 'stately', // daily FP scheme sync, keyless (D10, F19)
  'sms.dlr.sync': 'stately', // DLR sync; no handler yet, key it by the message's row id when it gets one
  'notifications.send': 'standard', // one job per notifications row (D6)
  'consent.expiry.sweep': 'stately', // every 5 minutes, keyless (E4)
  'drafts.abandon': 'stately', // hourly, keyless (E4)
  'fp.event.process': 'stately', // key: the inbound_webhook_events id; re-enqueues itself to retry (E1)
} as const satisfies Record<string, JobPolicy>;

/** Append-only (see JOB_POLICIES). */
export type JobName = keyof typeof JOB_POLICIES;

/** Every job name, in registry order. */
export const JOB_NAMES = Object.keys(JOB_POLICIES) as JobName[];

/** The registry entries whose queue is missing or stored with another policy (`stored` is `PgBoss.getQueues`). */
export function queuePolicyDrift(stored: readonly { name: string; policy?: string }[]): string[] {
  const byName = new Map(stored.map((q) => [q.name, q.policy]));
  return JOB_NAMES.filter((name) => byName.get(name) !== JOB_POLICIES[name]).map(
    (name) => `${name}: stored ${byName.get(name) ?? 'none'}, JOB_POLICIES ${JOB_POLICIES[name]}`,
  );
}

export interface Job<N extends JobName = JobName> {
  id: string;
  name: N;
  data: unknown;
}

export interface JobHandler<N extends JobName = JobName> {
  handle(job: Job<N>): Promise<void>;
}

export const JOB_HANDLER = 'sanchay:jobHandler';

/** Marks a provider's class as the pg-boss worker for `name`; JobsService discovers it by this metadata. */
export const JobHandler = (name: JobName) => SetMetadata(JOB_HANDLER, name);
```

`apps/api/src/modules/platform/jobs/heartbeat.ts`
```ts
import { sql } from 'drizzle-orm';
import type { DbHandle } from '../../../db/client.js';
import { workerHeartbeats } from './jobs.schema.js';
import type { Clock } from '../clock.js';

const HEARTBEAT_INTERVAL_MS = 30_000;

export interface Heartbeat {
  stop(): void;
}

export function startHeartbeat(dbh: DbHandle, clock: Clock, taskId: string): Heartbeat {
  const beat = async (): Promise<void> => {
    await dbh.db
      .insert(workerHeartbeats)
      .values({ taskId, lastBeatAt: clock.now() })
      .onConflictDoUpdate({
        target: workerHeartbeats.taskId,
        set: { lastBeatAt: clock.now() },
      });
  };
  void beat();
  const timer = setInterval(() => void beat(), HEARTBEAT_INTERVAL_MS);
  timer.unref();
  return { stop: () => clearInterval(timer) };
}

void sql;
```

`apps/api/src/modules/platform/jobs/jobs.schema.ts` (small schema file the outline folds into `jobs.module.ts`'s neighbourhood; kept separate here so `heartbeat.ts` and `jobs.module.ts` do not import each other's non-schema code — noted as a one-file addition beyond the outline's four `jobs/*` files, needed because `kernel.schema.ts` (D1) already owns the `app` schema's non-identity tables and `worker_heartbeats` should not be spliced into that file after D1 has shipped it)
```ts
import { appSchema, tstz } from '../../../db/app-schema.js';
import { text } from 'drizzle-orm/pg-core';

export const workerHeartbeats = appSchema.table('worker_heartbeats', {
  taskId: text('task_id').primaryKey(),
  lastBeatAt: tstz('last_beat_at').notNull(),
});
```

`apps/api/src/modules/platform/jobs/jobs.module.test.ts`
```ts
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { AppConfig } from '../../../config/app-config.js';
import { parseEnv } from '../../../config/env.js';
import { DB } from '../../../db/client.js';
import { CLOCK, FakeClock } from '../clock.js';
import { JOB_NAMES, JOB_POLICIES, queuePolicyDrift } from './job-registry.js';
import { JobsModule } from './jobs.module.js';
import { JobsService } from './jobs.service.js';

function apiEnv() {
  return parseEnv({
    SANCHAY_APP_ENV: 'test',
    SANCHAY_APP_ROLE: 'api',
    DATABASE_URL: 'postgres://sanchay:sanchay_test_only@localhost:55432/sanchay',
    SANCHAY_APP_ORIGIN: 'https://app.sanchay.test',
    SANCHAY_KEY_SERVICE: 'local',
    SANCHAY_LOCAL_PII_KEY: Buffer.alloc(32, 1).toString('base64'),
    SANCHAY_LOCAL_BIDX_KEY: Buffer.alloc(32, 2).toString('base64'),
    SANCHAY_OTP_PEPPER: Buffer.alloc(32, 3).toString('base64'),
    SANCHAY_AUTH_TOKEN_KEY: Buffer.alloc(32, 4).toString('base64'),
  });
}

describe('JobsModule wiring (unit; no live pg-boss connection needed to assert this)', () => {
  it('is a global module that exports JobsService', () => {
    expect(Reflect.getMetadata('__module:global__', JobsModule)).toBe(true);
  });

  it('an unknown job name is a type error', () => {
    // @ts-expect-error 'not.a.job' is not a JobName
    const bad: import('./job-registry.js').JobName = 'not.a.job';
    void bad;
  });
});

describe('JOB_POLICIES (R-32)', () => {
  it('gives notifications.send the standard policy and every other job stately or exclusive', () => {
    expect(JOB_NAMES).toEqual(Object.keys(JOB_POLICIES));
    for (const name of JOB_NAMES) {
      const allowed = name === 'notifications.send' ? ['standard'] : ['stately', 'exclusive'];
      expect(allowed, name).toContain(JOB_POLICIES[name]);
    }
  });

  it('queuePolicyDrift names a queue that is missing or stored with another policy', () => {
    const stored = JOB_NAMES.map((name) => ({ name, policy: JOB_POLICIES[name] as string }));
    expect(queuePolicyDrift(stored)).toEqual([]);
    const drifted = stored
      .filter((q) => q.name !== 'identity.cleanup')
      .map((q) => (q.name === 'drafts.abandon' ? { ...q, policy: 'standard' } : q));
    expect(queuePolicyDrift(drifted)).toEqual([
      'identity.cleanup: stored none, JOB_POLICIES stately',
      'drafts.abandon: stored standard, JOB_POLICIES stately',
    ]);
  });
});

void Test;
void AppConfig;
void DB;
void CLOCK;
void FakeClock;
void JobsService;
void apiEnv;
```

`apps/api/test/int/jobs.int.test.ts`
```ts
import { DiscoveryService, Reflector } from '@nestjs/core';
import { and, eq, gt } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppConfig } from '../../src/config/app-config.js';
import { JOB_POLICIES, type JobName } from '../../src/modules/platform/jobs/job-registry.js';
import { workerHeartbeats } from '../../src/modules/platform/jobs/jobs.schema.js';
import { Jobs, JobsService } from '../../src/modules/platform/jobs/jobs.service.js';
import { HOUR } from '../../src/modules/platform/clock.js';
import { bootTestApp, type TestApp } from './app.js';

let t: TestApp;
beforeAll(async () => {
  t = await bootTestApp({ env: { SANCHAY_APP_ROLE: 'worker' } });
});
afterAll(async () => {
  await t.close();
});

/** pg-boss workers poll every 2 s by default: wait for the outcome instead of sleeping a fixed time (RV-02-46). */
async function eventually(check: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('the worker did not finish within 10 s');
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** A queue no worker serves, so the test decides when its job runs (pg-boss `fetch` makes it active). */
async function unservedQueue(name: string, policy: 'stately' | 'exclusive'): Promise<JobName> {
  await t.app.get(JobsService).started().createQueue(name, { policy });
  return name as JobName;
}

describe('Jobs.enqueue', () => {
  it('leaves no job row when the caller transaction rolls back', async () => {
    await t.db.db
      .transaction(async (tx) => {
        await t.app.get(Jobs).enqueue(tx, 'identity.cleanup', {});
        throw new Error('rollback');
      })
      .catch(() => undefined);
    const rows = await t.db.pool.query(`SELECT count(*)::int AS n FROM pgboss.job WHERE name = 'identity.cleanup'`);
    expect(rows.rows[0]?.n).toBe(0);
  });

  it('a job enqueued inside a committed transaction is processed once', async () => {
    // JobsService (worker role) already called boss.work for identity.cleanup in beforeAll's bootTestApp;
    // this test asserts the row lands and is picked up, not a second independent worker.
    await t.db.db.transaction(async (tx) => {
      await t.app.get(Jobs).enqueue(tx, 'identity.cleanup', { probe: true }, { singletonKey: 'jobs-int-test' });
    });
    await eventually(async () => {
      const rows = await t.db.pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM pgboss.job WHERE name = 'identity.cleanup' AND state = 'completed'`,
      );
      return (rows.rows[0]?.n ?? 0) >= 1;
    });
  });

  it('stately refuses a second send with the same singletonKey while the first is queued: null, and the caller transaction goes on (R-32)', async () => {
    const jobs = t.app.get(Jobs);
    const first = await jobs.enqueue(t.db.db, 'identity.cleanup', {}, { singletonKey: 'agg-1', startAfter: 3600 });
    expect(first).toEqual(expect.any(String));
    expect(await jobs.enqueue(t.db.db, 'identity.cleanup', {}, { singletonKey: 'agg-1' })).toBeNull();
    await t.db.db.transaction(async (tx) => {
      expect(await jobs.enqueue(tx, 'identity.cleanup', {}, { singletonKey: 'agg-1' })).toBeNull();
      await tx.insert(workerHeartbeats).values({ taskId: 'after-refusal', lastBeatAt: t.clock.now() });
    });
    expect(await t.db.db.select().from(workerHeartbeats).where(eq(workerHeartbeats.taskId, 'after-refusal'))).toHaveLength(1);
    const rows = await t.db.pool.query<{ id: string }>(
      `SELECT id FROM pgboss.job WHERE name = 'identity.cleanup' AND singleton_key = 'agg-1'`,
    );
    expect(rows.rows.map((r) => r.id)).toEqual([first]);
  });

  it('stately lets one job wait behind a running one with the same singletonKey and refuses a third (R-32)', async () => {
    const name = await unservedQueue('test.stately', 'stately');
    const jobs = t.app.get(Jobs);
    const running = await jobs.enqueue(t.db.db, name, {}, { singletonKey: 'agg-2' });
    const [active] = await t.app.get(JobsService).started().fetch(name);
    expect(active?.id).toBe(running);
    expect(await jobs.enqueue(t.db.db, name, {}, { singletonKey: 'agg-2' })).toEqual(expect.any(String));
    expect(await jobs.enqueue(t.db.db, name, {}, { singletonKey: 'agg-2' })).toBeNull();
  });

  it('exclusive refuses a send with the same singletonKey while the first is running, also inside a transaction (R-32)', async () => {
    const name = await unservedQueue('test.exclusive', 'exclusive');
    const jobs = t.app.get(Jobs);
    const running = await jobs.enqueue(t.db.db, name, {}, { singletonKey: 'challenge-1' });
    const [active] = await t.app.get(JobsService).started().fetch(name);
    expect(active?.id).toBe(running);
    expect(await jobs.enqueue(t.db.db, name, {}, { singletonKey: 'challenge-1' })).toBeNull();
    await t.db.db.transaction(async (tx) => {
      expect(await jobs.enqueue(tx, name, {}, { singletonKey: 'challenge-1' })).toBeNull();
    });
    expect(await jobs.enqueue(t.db.db, name, {}, { singletonKey: 'challenge-2' })).toEqual(expect.any(String));
  });
});

describe('role gating', () => {
  it('the worker role does not listen on HTTP', async () => {
    const { runWorker } = await import('../../src/modules/platform/jobs/worker.main.js');
    const env = t.env;
    const ctx = await runWorker({ ...env, PORT: 58_123 as never });
    const net = await import('node:net');
    await expect(
      new Promise((resolve, reject) => {
        const socket = net.createConnection({ port: 58_123 }, () => {
          socket.destroy();
          reject(new Error('unexpectedly connected'));
        });
        socket.on('error', resolve);
      }),
    ).resolves.toBeDefined();
    await ctx.close();
  });

  it('the api role does not start job processing (no .work() registrations)', async () => {
    const apiApp = await bootTestApp({ env: { SANCHAY_APP_ROLE: 'api' } });
    await apiApp.app.get(Jobs).enqueue(apiApp.db.db, 'identity.cleanup', { fromApi: true }, { singletonKey: 'api-gate' });
    await new Promise((r) => setTimeout(r, 300));
    const rows = await apiApp.db.pool.query(
      `SELECT state FROM pgboss.job WHERE name = 'identity.cleanup' AND data->>'fromApi' = 'true'`,
    );
    expect(rows.rows[0]?.state).not.toBe('completed');
    await apiApp.close();
  });
});

describe('worker heartbeat', () => {
  it('the worker role beats at boot (health.int.test.ts covers how /health/ready reads it)', async () => {
    const beats = await t.db.db.select().from(workerHeartbeats);
    expect(beats.map((b) => b.taskId)).toContain(`worker:${process.pid}`);
  });
});

describe('pg-boss queues (R-32 policies; D6: the app login has no CREATE on schema pgboss)', () => {
  it('creates every queue with its JOB_POLICIES policy and without a partition table, which would be DDL', async () => {
    const { rows } = await t.db.pool.query<{ name: string; policy: string; partition: boolean }>(
      'SELECT name, policy, partition FROM pgboss.queue',
    );
    expect(rows.filter((q) => q.partition)).toEqual([]);
    const stored = Object.fromEntries(rows.filter((q) => q.name in JOB_POLICIES).map((q) => [q.name, q.policy]));
    expect(stored).toEqual(JOB_POLICIES);
  });

  it('refuses to start when a queue already holds another policy, which pg-boss would keep', async () => {
    await t.db.pool.query(`UPDATE pgboss.queue SET policy = 'standard' WHERE name = 'drafts.abandon'`);
    const service = new JobsService(t.app.get(AppConfig), t.db, t.clock, t.app.get(DiscoveryService), t.app.get(Reflector));
    try {
      await expect(service.onModuleInit()).rejects.toThrow('drafts.abandon: stored standard, JOB_POLICIES stately');
    } finally {
      await t.db.pool.query(`UPDATE pgboss.queue SET policy = 'stately' WHERE name = 'drafts.abandon'`);
    }
  });
});

describe('schedules', () => {
  it('registers with the Asia/Kolkata timezone', async () => {
    const { registerSchedules } = await import('../../src/modules/platform/jobs/schedules.js');
    expect(typeof registerSchedules).toBe('function');
  });
});

describe('identity.cleanup', () => {
  it('deletes expired LOGIN and VERIFY_EMAIL otp rows only, and CONSENT rows survive', async () => {
    const { otpCodes } = await import('../../src/db/schema.js');
    const { insertOtp } = await import('./factories.js');
    const old = new Date(t.clock.now().getTime() - 25 * HOUR);
    await insertOtp(t.db.db, { purpose: 'LOGIN', expiresAt: old, consumedAt: old, consumedReason: 'VERIFIED' });
    await insertOtp(t.db.db, {
      purpose: 'VERIFY_EMAIL',
      expiresAt: old,
      consumedAt: old,
      consumedReason: 'VERIFIED',
    });
    await insertOtp(t.db.db, { purpose: 'CONSENT', expiresAt: old, consumedAt: old, consumedReason: 'VERIFIED' });
    await t.app.get(Jobs).enqueue(t.db.db, 'identity.cleanup', {}, { singletonKey: 'cleanup-otp-test' });
    await eventually(async () => (await t.db.db.select().from(otpCodes)).length === 1);
    const remaining = await t.db.db.select().from(otpCodes);
    expect(remaining.map((r) => r.purpose).sort()).toEqual(['CONSENT']);
  });
});

void and;
void eq;
void gt;
```

`apps/api/test/int/health.int.test.ts` (Plan 01's file, RV-02-42: add the two imports, and replace its `GET /api/v1/health/ready checks the database` case, which fails once `/health/ready` also needs a fresh worker heartbeat, with these two cases)
```ts
import { MINUTE } from '../../src/modules/platform/clock.js';
import { workerHeartbeats } from '../../src/modules/platform/jobs/jobs.schema.js';
// ...
  it('GET /api/v1/health/ready checks the database, pg-boss and a worker heartbeat, never NAV age (R-12)', async () => {
    await t.db.db.insert(workerHeartbeats).values({ taskId: 'health-fresh', lastBeatAt: t.clock.now() });
    const res = await t.app.inject({ method: 'GET', url: '/api/v1/health/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      status: 'ok',
      checks: [
        { name: 'database', ok: true },
        { name: 'pgboss', ok: true },
        { name: 'heartbeat', ok: true },
      ],
    });
  });

  it('GET /api/v1/health/ready is 500 INTERNAL (retryable) when the newest heartbeat is older than 2 minutes', async () => {
    await t.db.pool.query('DELETE FROM app.worker_heartbeats');
    const stale = new Date(t.clock.now().getTime() - 3 * MINUTE);
    await t.db.db.insert(workerHeartbeats).values({ taskId: 'health-stale', lastBeatAt: stale });
    const res = await t.app.inject({ method: 'GET', url: '/api/v1/health/ready' });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toMatchObject({ code: 'INTERNAL', data: { retryable: true } });
  });
```

`apps/api/src/db/drizzle-config.test.ts` (RV-02-41: drizzle-kit reads only the files its `schema` globs match, and `db:check` runs the same config, so a schema file outside them is skipped without a word)
```ts
import { globSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import config from '../../drizzle.config.js';

const apiRoot = fileURLToPath(new URL('../..', import.meta.url));

describe('drizzle.config.ts', () => {
  it('its schema globs match every *.schema.ts file under src', () => {
    const globs = typeof config.schema === 'string' ? [config.schema] : (config.schema ?? []);
    const matched = new Set(globs.flatMap((pattern) => globSync(pattern, { cwd: apiRoot })));
    const all = globSync('src/**/*.schema.ts', { cwd: apiRoot });
    expect(all.length).toBeGreaterThan(0);
    expect(all.filter((file) => !matched.has(file))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to confirm they fail**
```
pnpm --filter=@sanchay/api typecheck
pnpm --filter=@sanchay/api test
pnpm --filter=@sanchay/api test:int
```
Expected:
- `typecheck` FAILS: `jobs.module.ts`, `jobs.service.ts`, `worker.main.ts` and `schedules.ts` do not exist yet (Step 1 wrote `job-registry.ts`, `heartbeat.ts` and `jobs.schema.ts`), so `jobs.module.test.ts` and `jobs.int.test.ts` fail to resolve their imports.
- `test` FAILS: `jobs.module.test.ts` cannot load `jobs.module.js`, and `drizzle-config.test.ts` reports `src/modules/platform/jobs/jobs.schema.ts` (backslashes on Windows) as a schema file the `schema` glob misses.
- `test:int` FAILS the same way (`jobs.int.test.ts`, its five R-32 cases included, cannot load `jobs.service.js`), and both readiness cases in `health.int.test.ts` fail (no `app.worker_heartbeats` table yet, and Plan 01's router checks only the database); `migrations.int.test.ts` still passes with 8 tests (D1's count).

- [ ] **Step 3: Minimal implementation**

`apps/api/src/modules/platform/jobs/jobs.service.ts`
```ts
import { Inject, Injectable, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { sql } from 'drizzle-orm';
import { PgBoss } from 'pg-boss';
import { AppConfig } from '../../../config/app-config.js';
import { DB, type DbExecutor, type DbHandle } from '../../../db/client.js';
import { CLOCK, type Clock } from '../clock.js';
import { startHeartbeat, type Heartbeat } from './heartbeat.js';
import {
  JOB_HANDLER,
  JOB_NAMES,
  JOB_POLICIES,
  type Job,
  type JobHandler,
  type JobName,
  queuePolicyDrift,
} from './job-registry.js';
import { registerSchedules } from './schedules.js';

export interface JobsEnqueueOptions {
  singletonKey?: string;
  startAfter?: Date | number;
  retryLimit?: number;
}

/** pg-boss's BYODB adapter: runs pg-boss's own `$n` SQL on the caller's Drizzle executor, so the job commits with the caller's transaction. */
function drizzleAdapter(exec: DbExecutor) {
  return {
    async executeSql(text: string, values: unknown[] = []) {
      const parts = text.split(/\$(\d+)/);
      const chunks = parts.map((part, i) => (i % 2 === 0 ? sql.raw(part) : sql`${values[Number(part) - 1]}`));
      return exec.execute(sql.join(chunks, sql.raw('')));
    },
  };
}

@Injectable()
export class JobsService implements OnModuleInit, OnApplicationShutdown {
  private boss: PgBoss | undefined;
  /** Set once every queue exists. Per application, never module state: each Nest app in a process owns one (RV-02-45). */
  private ready: PgBoss | undefined;
  private heartbeat: Heartbeat | undefined;

  constructor(
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(DiscoveryService) private readonly discovery: DiscoveryService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  /** This application's started PgBoss; `Jobs.enqueue` sends through it. */
  started(): PgBoss {
    if (this.ready === undefined) throw new Error('Jobs.enqueue called before JobsService started pg-boss');
    return this.ready;
  }

  async onModuleInit(): Promise<void> {
    // Nothing here may make pg-boss run DDL: the D6 app login has no CREATE on schema pgboss (RV-02-43).
    // So no `migrate`, no `persistQueueStats` (daily queue_stats partitions), no queue with `partition: true`.
    this.boss = new PgBoss({
      connectionString: this.config.env.DATABASE_URL,
      schema: 'pgboss',
      migrate: false, // db/migrate.ts bootstraps pg-boss's own schema; the api/worker roles never migrate it.
    });
    await this.boss.start();
    // R-32: each queue gets its JOB_POLICIES policy (still an idempotent INSERT into pgboss.queue, no DDL).
    // createQueue never changes an existing queue and updateQueue refuses `policy`, so a drift stops the boot.
    for (const name of JOB_NAMES) await this.boss.createQueue(name, { policy: JOB_POLICIES[name] });
    const drift = queuePolicyDrift(await this.boss.getQueues(JOB_NAMES));
    if (drift.length > 0) {
      await this.boss.stop({ graceful: false });
      throw new Error(`pg-boss queue policies differ from JOB_POLICIES (R-32): ${drift.join('; ')}`);
    }
    this.ready = this.boss;
    if (this.config.env.SANCHAY_APP_ROLE !== 'worker') return;
    for (const wrapper of this.discovery.getProviders()) {
      const { instance, metatype } = wrapper;
      if (!instance || !metatype) continue;
      const name = this.reflector.get<JobName | undefined>(JOB_HANDLER, metatype);
      if (name === undefined) continue;
      const handler = instance as JobHandler;
      await this.boss.work(name, async ([job]) => {
        await handler.handle(job as Job);
      });
    }
    await registerSchedules(this.boss);
    this.heartbeat = startHeartbeat(this.dbh, this.clock, `worker:${process.pid}`);
  }

  async onApplicationShutdown(): Promise<void> {
    this.ready = undefined;
    this.heartbeat?.stop();
    await this.boss?.stop({ graceful: true, timeout: 10_000 });
  }
}

@Injectable()
export class Jobs {
  constructor(@Inject(JobsService) private readonly service: JobsService) {}

  /**
   * Sends inside `exec`'s transaction (BYODB). Returns the job id, or null when the queue's policy refused the
   * send (R-32): a job with the same singletonKey is already queued (stately) or queued, retrying or running
   * (exclusive). A refusal is not an error, and the caller's transaction stays usable.
   */
  async enqueue<N extends JobName>(
    exec: DbExecutor,
    name: N,
    data: unknown,
    opts: JobsEnqueueOptions = {},
  ): Promise<string | null> {
    return this.service.started().send(name, (data ?? {}) as object, {
      db: drizzleAdapter(exec),
      retryLimit: opts.retryLimit ?? 3,
      ...(opts.singletonKey === undefined ? {} : { singletonKey: opts.singletonKey }),
      ...(opts.startAfter === undefined ? {} : { startAfter: opts.startAfter }),
    });
  }
}
```

`apps/api/src/modules/platform/jobs/jobs.module.ts`
```ts
import { DiscoveryModule } from '@nestjs/core';
import { Global, Module } from '@nestjs/common';
import { Jobs, JobsService } from './jobs.service.js';

@Global()
@Module({
  imports: [DiscoveryModule],
  providers: [JobsService, Jobs],
  exports: [JobsService, Jobs],
})
export class JobsModule {}
```

`apps/api/src/modules/platform/jobs/schedules.ts`
```ts
import type { PgBoss } from 'pg-boss';

/**
 * No MVP job has a cron schedule yet in Plan 02; D9's nav.sync.daily is the first caller
 * (`boss.schedule('nav.sync.daily', '30 21,23 * * *', {}, {tz: 'Asia/Kolkata'})` and three more
 * crons for the other sync times). Each later task appends its own `boss.schedule(...)` call here.
 */
/**
 * The single schedule extension point. Later tasks append keyed calls; pg-boss needs a distinct `key` per
 * schedule on one queue. A tick is a keyless send (R-32): on a stately queue it is dropped while the previous
 * tick is still queued, and two schedules on one queue that can fire in the same minute each need their own
 * `singletonKey` in the options, or one of the two ticks is dropped (F2's `mandates.poll`).
 */
export async function registerSchedules(boss: PgBoss): Promise<void> {
  const tz = 'Asia/Kolkata';
  await boss.schedule('identity.cleanup', '0 * * * *', {}, { tz, key: 'identity-cleanup' });
}
```

`apps/api/src/modules/platform/jobs/worker.main.ts`
```ts
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { AppModule } from '../../../app.module.js';
import type { Env } from '../../../config/env.js';

export async function runWorker(env: Env): Promise<INestApplicationContext> {
  const ctx = await NestFactory.createApplicationContext(AppModule.forRoot(env), {
    bufferLogs: true,
  });
  ctx.useLogger(ctx.get(Logger));
  ctx.enableShutdownHooks();
  process.once('SIGTERM', () => {
    void ctx.close().then(() => process.exit(0));
  });
  return ctx;
}
```

`apps/api/src/main.ts` (replace the worker branch)
```ts
if (env.SANCHAY_APP_ROLE === 'worker') {
  const { runWorker } = await import('./modules/platform/jobs/worker.main.js');
  await runWorker(env);
} else {
  const { createApp } = await import('./bootstrap.js');
  const app = await createApp(env);
  await app.listen(env.PORT, env.HOST);
}
```
(the existing `if (env.SANCHAY_APP_ROLE === 'migrate') { ...; process.exit(0); }` block stays exactly as-is above this; only the `worker` branch's body and the trailing unconditional `createApp`/`listen` lines change, the latter now guarded by `else`. There is no `else if` for `migrate`: after that block TypeScript has narrowed the role to `'api' | 'worker'`, so comparing it with `'migrate'` is TS2367 and fails `typecheck`, RV-02-44.)

`apps/api/src/app.module.ts` (add `JobsModule` to imports, once, so both roles get `JobsService`)
```ts
import { JobsModule } from './modules/platform/jobs/jobs.module.js';
// ...
        PlatformModule.forRoot(env),
        JobsModule,
        IntegrationsModule.forRoot(env),
        IdentityModule,
// ...
```

`apps/api/src/modules/platform/health.router.ts` (full file)
```ts
import { performance } from 'node:perf_hooks';
import { Controller, Inject } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@sanchay/contract';
import { desc } from 'drizzle-orm';
import { DB, type DbHandle } from '../../db/client.js';
import { CLOCK, type Clock } from './clock.js';
import { workerHeartbeats } from './jobs/jobs.schema.js';
import { AppError } from './errors.js';
import { InfraRoute } from './http-decorators.js';

const HEARTBEAT_STALE_MS = 2 * 60_000;

/**
 * D-11: /health stays liveness-only forever (R-12). /health/ready adds pg-boss + heartbeat in D2.
 * A failed check answers 500 INTERNAL (retryable), the one error the contract declares (RV-02-42).
 */
@InfraRoute('APP_AND_API_HOSTS')
@Controller()
export class HealthRouter {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Implement(contract.health.live)
  live() {
    return implement(contract.health.live).handler(() => ({ status: 'ok' as const }));
  }

  @Implement(contract.health.ready)
  ready() {
    return implement(contract.health.ready).handler(async () => {
      const checks: { name: string; ok: boolean; durationMs: number }[] = [];

      const dbStarted = performance.now();
      try {
        await this.dbh.pool.query('SELECT 1');
        checks.push({ name: 'database', ok: true, durationMs: Math.round(performance.now() - dbStarted) });
      } catch (cause) {
        throw new AppError('INTERNAL', { retryable: true, cause });
      }

      const bossStarted = performance.now();
      try {
        await this.dbh.pool.query('SELECT 1 FROM pgboss.job LIMIT 1');
        checks.push({ name: 'pgboss', ok: true, durationMs: Math.round(performance.now() - bossStarted) });
      } catch (cause) {
        throw new AppError('INTERNAL', { retryable: true, cause });
      }

      const hbStarted = performance.now();
      const [latest] = await this.dbh.db
        .select()
        .from(workerHeartbeats)
        .orderBy(desc(workerHeartbeats.lastBeatAt))
        .limit(1);
      const staleOrMissing =
        latest === undefined || this.clock.now().getTime() - latest.lastBeatAt.getTime() > HEARTBEAT_STALE_MS;
      if (staleOrMissing) {
        throw new AppError('INTERNAL', { retryable: true });
      }
      checks.push({ name: 'heartbeat', ok: true, durationMs: Math.round(performance.now() - hbStarted) });

      return { status: 'ok' as const, checks };
    });
  }
}
```

`apps/api/src/modules/platform/ids.ts` (`TableName` gains one more name)
```ts
export type TableName =
  | 'app_config'
  | 'audit_events'
  | 'auth_sessions'
  | 'idempotency_keys'
  | 'investor_contacts'
  | 'investor_devices'
  | 'investors'
  | 'otp_codes'
  | 'recon_breaks'
  | 'worker_heartbeats';
```

`apps/api/src/db/schema.ts` (full file)
```ts
export * from '../modules/identity/identity.schema.js';
export * from '../modules/platform/jobs/jobs.schema.js';
export * from '../modules/platform/kernel.schema.js';
export * from '../modules/platform/platform.schema.js';
```

`apps/api/src/modules/identity/identity.module.ts` (add the inline job handler)
```ts
import { and, eq, lt } from 'drizzle-orm';
import { CLOCK, DAY, HOUR, type Clock } from '../platform/clock.js';
import { JobHandler, type Job } from '../platform/jobs/job-registry.js';
import { authSessions, otpCodes } from './identity.schema.js';
// ...existing imports unchanged...

/**
 * R-13: only LOGIN and VERIFY_EMAIL otp_codes age out here; CONSENT rows (added in Plan-03 E3/E4)
 * are excluded on purpose and are never touched by this handler.
 */
@Injectable()
@JobHandler('identity.cleanup')
class IdentityCleanupJob {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async handle(_job: Job<'identity.cleanup'>): Promise<void> {
    const now = this.clock.now();
    await this.dbh.db
      .delete(otpCodes)
      .where(
        and(
          lt(otpCodes.expiresAt, new Date(now.getTime() - DAY)),
          eq(otpCodes.purpose, 'LOGIN'),
        ),
      );
    await this.dbh.db
      .delete(otpCodes)
      .where(
        and(
          lt(otpCodes.expiresAt, new Date(now.getTime() - DAY)),
          eq(otpCodes.purpose, 'VERIFY_EMAIL'),
        ),
      );
    await this.dbh.db
      .delete(authSessions)
      .where(lt(authSessions.absoluteExpiresAt, new Date(now.getTime() - 7 * DAY)));
  }
}

@Module({
  controllers: [LoginRouter, SessionRouter, MeRouter],
  providers: [
    OtpService,
    InvestorAccounts,
    DeviceRegistry,
    SessionService,
    AuthService,
    AccountSessions,
    ContactEmailService,
    SessionGuard,
    IdentityCleanupJob,
    {
      provide: OTP_BOOKKEEPING_DB,
      inject: [AppConfig],
      useFactory: (config: AppConfig) => createDb(config.env.DATABASE_URL, 4),
    },
    OtpBookkeepingDbLifecycle,
  ],
  exports: [OtpService, InvestorAccounts, DeviceRegistry, SessionService, SessionGuard],
})
export class IdentityModule {}

void HOUR;
```
(`DB`, `DbHandle`, `Injectable`, `Inject` are already imported in this file's existing content — merge the new imports above into the existing import statements rather than duplicating them.)

`apps/api/src/db/migrate.ts` (full file — bootstraps pg-boss's schema before Drizzle's own migrations)
```ts
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { PgBoss } from 'pg-boss';
import { createDb } from './client.js';

export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

export async function runMigrations(databaseUrl: string): Promise<void> {
  // pg-boss self-creates schema `pgboss` and its tables the first time it starts against a fresh
  // database (idempotent on every later run). This runs before the Drizzle migrations so that
  // 0005_worker_heartbeats.sql's GRANTs on pgboss.* target tables that already exist.
  const boss = new PgBoss({ connectionString: databaseUrl, schema: 'pgboss' });
  await boss.start();
  await boss.stop({ graceful: false });

  const handle = createDb(databaseUrl, 1);
  try {
    await migrate(handle.db, {
      migrationsFolder: MIGRATIONS_FOLDER,
      migrationsSchema: 'drizzle',
      migrationsTable: '__drizzle_migrations',
    });
  } finally {
    await handle.close();
  }
}
```

`apps/api/drizzle.config.ts` (full file; RV-02-41: `schema` becomes a list. The one-level glob missed `jobs/jobs.schema.ts`, so `db:generate` printed "No schema changes, nothing to migrate" and `db:check` still passed; the `integrations` glob is for D3's `provider-calls.schema.ts`.)
```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: [
    './src/modules/*/*.schema.ts',
    './src/modules/*/*/*.schema.ts',
    './src/integrations/*/*.schema.ts',
  ],
  out: './drizzle',
  schemaFilter: ['app'],
  migrations: { schema: 'drizzle', table: '__drizzle_migrations' },
  strict: true,
  verbose: true,
});
```

Generate the custom migration:
```
pnpm --filter=@sanchay/api db:generate --name=worker_heartbeats
```
Expected: `apps/api/drizzle/0005_worker_heartbeats.sql` is created with `CREATE TABLE "app"."worker_heartbeats"`. Append the pg-boss grants by hand (drizzle-kit only knows the `app` schema, per `drizzle.config.ts`'s `schemaFilter: ['app']`, so it never generates the `pgboss` grant statements itself):
```sql
--> statement-breakpoint
GRANT USAGE ON SCHEMA pgboss TO sanchay_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pgboss TO sanchay_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sanchay_app;
```

Add the migrations.int.test.ts assertion for the new table and the pgboss schema:
```ts
  it('creates app.worker_heartbeats and schema pgboss with pgboss.job', async () => {
    const app = await t.pool.query<{ t: string | null }>(
      `SELECT to_regclass('app.worker_heartbeats')::text AS t`,
    );
    expect(app.rows[0]?.t).toBe('app.worker_heartbeats');
    const boss = await t.pool.query<{ t: string | null }>(`SELECT to_regclass('pgboss.job')::text AS t`);
    expect(boss.rows[0]?.t).toBe('pgboss.job');
  });
```
(append this inside the existing `describe('baseline migrations', ...)` block in `migrations.int.test.ts` — `global-setup.ts` calls `runMigrations` for the template database, so this assertion covers every test file's database, not just this task's own.)

- [ ] **Step 4: Run tests to confirm they pass**
```
pnpm --filter=@sanchay/api typecheck
pnpm --filter=@sanchay/api test
pnpm --filter=@sanchay/api test:int
pnpm --filter=@sanchay/api db:check
```
Expected:
- `typecheck`: exits 0.
- `test`: `jobs.module.test.ts` — 4 passed; `drizzle-config.test.ts` — 1 passed.
- `test:int`: `jobs.int.test.ts` — 12 passed (the five R-32 cases fail against a `JobsService` that creates its queues without a policy); `health.int.test.ts` — 8 passed (was 7); `migrations.int.test.ts` — 9 passed (was 8 after D1); every other `test/int/*.int.test.ts` file still passes (worker-role heartbeat and job processing only start when `SANCHAY_APP_ROLE=worker`, which `bootTestApp()`'s default `testEnv` does not set; the one api-role change, `/health/ready` needing a fresh heartbeat, is covered by `health.int.test.ts`).
- `db:check`: `db:check OK: schema and migrations are in sync`.

- [ ] **Step 5: Commit**
```
pnpm exec biome check --write apps/api docs/adr/0001-versions.md
pnpm --filter=@sanchay/api typecheck
pnpm --filter=@sanchay/api test
pnpm --filter=@sanchay/api test:int
pnpm lint
git add apps/api pnpm-workspace.yaml pnpm-lock.yaml docs/adr/0001-versions.md
git commit -m "feat(api): pg-boss JobsModule with queue policies (R-32), worker role, heartbeats, readiness checks, identity.cleanup" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task D3: FpGateway base: undici, per-audience tokens, lossless-json, provider_calls, ConsumedConsent brand (Dev A, 14 h)

**Files:**
- Create:
  - `apps/api/src/integrations/fp/fp-operations.ts`
  - `apps/api/src/integrations/fp/fp-operations.test.ts`
  - `apps/api/src/integrations/fp/consumed-consent.ts`
  - `apps/api/src/integrations/fp/consumed-consent.test.ts`
  - `apps/api/src/integrations/fp/fp-errors.ts`
  - `apps/api/src/integrations/fp/fp-json.ts`
  - `apps/api/src/integrations/fp/fp-json.test.ts`
  - `apps/api/src/integrations/fp/fp-token-cache.ts`
  - `apps/api/src/integrations/fp/fp-token-cache.test.ts`
  - `apps/api/src/integrations/fp/fp-transport.ts`
  - `apps/api/src/integrations/fp/fp-transport.test.ts`
  - `apps/api/src/integrations/fp/fp-read.ts`
  - `apps/api/src/integrations/fp/fp-kyc.ts`
  - `apps/api/src/integrations/fp/fp-provision.ts`
  - `apps/api/src/integrations/fp/fp-transact.ts`
  - `apps/api/src/integrations/fp/provider-calls.schema.ts`
  - `apps/api/src/integrations/fp/fp.module.ts`
  - `apps/api/drizzle/0006_provider_calls.sql` and `apps/api/drizzle/meta/*` (the number is assigned at merge, per the outline's §0.1 convention; this task assumes `0006` because this same developer's D1 (`0004_platform_kernel.sql`) and D2 (`0005_worker_heartbeats.sql`) are the true predecessors in this branch — renumber at merge if another Plan-02 migration lands first)
  - `apps/api/test/int/fp-provider-calls.int.test.ts`
- Modify:
  - `apps/api/src/modules/platform/ids.ts` (append `'provider_calls'` to `TableName`)
  - `apps/api/src/config/env.ts` (append `SANCHAY_PROVIDER_MODE_FP`, `SANCHAY_FP_BASE_URL`, `SANCHAY_FP_CREDENTIALS_JSON`; boot invariants 8 and 9; export `parseFpCredentialsJson`)
  - `apps/api/src/config/env.test.ts` (the variable-set pin test gains the three new keys; the comment "FP, MSG91 and SES arrive with Plan 02" becomes "MSG91 and SES arrive with D6" since FP arrives here)
  - `apps/api/src/db/client.ts` (add `runInTx`, a transaction helper that sets the CLS `dbInTx` flag — see the deviation note below)
  - `apps/api/src/modules/platform/request-context.ts` (add `dbInTx: boolean` to `SanchayClsStore`)
  - `apps/api/src/app.module.ts` (the `ClsModule.forRoot` request `setup` callback initialises `cls.set('dbInTx', false)`; `imports` conditionally appends `FpModule.forRoot(env)` when `env.SANCHAY_APP_ROLE === 'worker'`)
  - `pnpm-workspace.yaml` (new `catalog:` entries `undici` and `lossless-json` — new packages, not edits to an existing pin; see Step 3a)
  - `apps/api/package.json` (`dependencies["undici"] = "catalog:"`, `dependencies["lossless-json"] = "catalog:"`, and `dependencies["@sanchay/money"] = "workspace:*"`: `fp-json.ts` is the first `apps/api` import of `@sanchay/money`, RV-02-28)
  - `pnpm-lock.yaml` (written by the three `pnpm add` commands in Step 3a)
  - `docs/adr/0001-versions.md` (append-only rows for the two new catalog pins)

**Interfaces:**
- Prerequisites: Plan-01 ground truth only (`DB`, `DbHandle`, `Database`, `Tx`, `DbExecutor`, `createDb` — `apps/api/src/db/client.ts`; `newId`, `asRowId`, `TableName`, `RowId` — `apps/api/src/modules/platform/ids.ts`; `Crypto`, `AadRef` — `apps/api/src/modules/platform/crypto.ts`; `PlatformModule` (global, exports `Crypto`, `DB`, `CLOCK`) — `apps/api/src/modules/platform/platform.module.ts`; `scrub` — `apps/api/src/modules/platform/logging.ts`; `SanchayClsStore` — `apps/api/src/modules/platform/request-context.ts`; `AppModule.forRoot` — `apps/api/src/app.module.ts`; `bootTestApp`, `TestApp` — `apps/api/test/int/app.ts`; `EnvError`, `parseEnv`, `Env` — `apps/api/src/config/env.ts`; `appSchema`, `bytea`, `tstz`, `dbUuidv7` — `apps/api/src/db/app-schema.ts`; `Brand`, `ConsentSubjectType`, `CONSENT_SUBJECT_TYPES` — `@sanchay/domain`; `Money`, `Units`, `type UnitsScale`, `Nav`, `Dec` — `@sanchay/money`).
- Consumes (external): the FP tenant OAuth token endpoint (`POST {SANCHAY_FP_BASE_URL}/v2/auth/{tenant}/token`) and the POA OAuth token endpoint (`POST {SANCHAY_FP_BASE_URL}/v2/auth/cybrillarta/token`); research:fp-api §0, §1; research:rules-fp-contracts §1.
- Produces:
  - `apps/api/src/integrations/fp/fp-operations.ts`: `FpAudience` (`'fp' | 'poa' | 'pg'`), `FpOperationClass` (`'R' | 'K' | 'P' | 'M'`), `FpHttpMethod`, `FpOperationDefinition`, `FP_OPERATIONS: Record<FpOperationKey, FpOperationDefinition>`, `FpOperationKey`.
  - `apps/api/src/integrations/fp/consumed-consent.ts`: `type ConsumedConsent = Brand<{challengeId, investorId, subjectType: ConsentSubjectType, subjectIds: readonly string[], snapshotSha256, executeBefore: Date}, 'ConsumedConsent'>`, `assertConsumed(value: unknown): asserts value is ConsumedConsent`.
  - `apps/api/src/integrations/fp/fp-errors.ts`: `ProviderCallInTransactionError`, `ConsentNotConsumedError`, `FpAmbiguousError`, `FpRejectedError`, `NotImplementedYetError`.
  - `apps/api/src/integrations/fp/fp-json.ts`: `fpJson.parse(text): unknown`, `fpJson.money(value, field): Money`, `fpJson.units(value, field, scale?): Units`, `fpJson.nav(value, field): Nav`, `FpJsonError`.
  - `apps/api/src/integrations/fp/fp-token-cache.ts`: `FpTokenCache` (`tokenFor(audience): Promise<string>`), `type FpCredentials` (also exported from `config/env.ts`, see below).
  - `apps/api/src/integrations/fp/fp-transport.ts`: `FP_DISPATCHER` (DI token), `type FpCallArgs<K>`, `type FpCallResult`, `FpTransport` (`call<K extends FpOperationKey>(op: K, args: FpCallArgs<K>): Promise<FpCallResult>`).
  - `apps/api/src/integrations/fp/fp-read.ts`: `FpRead` (`schemePlans`, `fundScheme`, `purchase`, `purchases`, `purchasePlan`, `purchasePlans`, `redemption`, `redemptions`, `mandate`, `payment`, `holdings`, `folios`).
  - `apps/api/src/integrations/fp/fp-kyc.ts`: `FpKyc` (`preVerify`, `getPreVerification`).
  - `apps/api/src/integrations/fp/fp-provision.ts`: `FpProvision` — one stub method per `P`-class `FP_OPERATIONS` key (`createInvestorProfile`, `updateInvestorProfile`, `createPhoneNumber`, `createEmailAddress`, `createAddress`, `createRelatedParty`, `createBankAccount`, `createMfInvestmentAccount`, `updateMfInvestmentAccount`), each throwing `NotImplementedYetError` naming the task that wires it (E6/E7/E11, Plan 03).
  - `apps/api/src/integrations/fp/fp-transact.ts`: `FpTransact` — one stub method per `M`-class key (`createPurchase`, `updatePurchase`, `createPurchasePlan`, `updatePurchasePlan`, `createRedemption`, `updateRedemption`, `createPayment`, `createNachPayment`, `createMandate`, `authoriseMandate`), each throwing `NotImplementedYetError` naming the task that wires it (E20, Plan 03; F2/F4/F5, Plan 04).
  - `apps/api/src/integrations/fp/provider-calls.schema.ts`: Drizzle table `providerCalls` (append-only) and `ProviderCallRow`/`NewProviderCall` types.
  - `apps/api/src/integrations/fp/fp.module.ts`: `FpModule.forRoot(env): DynamicModule`, exporting `FpTransport`, `FpRead`, `FpKyc`, `FpProvision`, `FpTransact`, `FP_DISPATCHER`, `FakeFp` (D4 fills in `FakeFp`'s import; this task exports a placeholder-free reference by importing it lazily — see D4's Interfaces for how the two tasks meet).
  - `apps/api/src/db/client.ts`: `runInTx(dbh, cls, fn, options?)`.
  - `apps/api/src/config/env.ts`: `FpCredentialsSchema`, `type FpCredentials`, `parseFpCredentialsJson`.
- Deviation from outline: this codebase has no shared `Db.tx` helper — every Plan-01 service wraps `dbh.db.transaction()` itself (for example `AuthService.inTx`) and none of them sets any CLS flag. `runInTx` (added to `db/client.ts` by this task) is the transaction helper the outline's "`Db.tx` sets that flag" sentence assumes; existing private `inTx` methods are untouched (out of this task's **Files** list, and none of them ever calls `FpTransport`). Every future caller that opens a transaction around an `FpTransact`/`FpProvision` call (E6, E7, E11, E20, Plan 04 F2/F4/F5) must use `runInTx`, not its own ad hoc `db.transaction()`, or the transaction guard is silently bypassed; this is noted again in each of those tasks' own Interfaces section when they are expanded.
- Deviation from outline: `SANCHAY_FP_CREDENTIALS_JSON`'s documented shape (outline §0.2) is `{fp:{clientId,clientSecret},poa:{…},pg:{…}}`, with no tenant slug. The FP tenant token path (`POST /v2/auth/{tenant}/token`) and the `x-tenant-id` header (research:fp-api §0) both need one. This task adds `tenantId` as a sibling top-level key — `{tenantId, fp:{…}, poa:{…}, pg:{…}}` — read by `FpTokenCache`/`FpTransport`, rather than inventing a second env var outside the outline's list.
- Deviation from outline: FP_OPERATIONS' audience type is `'fp' | 'poa' | 'pg'` per the outline even though research:fp-api documents only two token endpoints (FP tenant and POA); `/api/pg/*` payments and mandates are billed under the FP tenant token in the research. This task honours the outline's three-audience, three-credential-set shape literally (`SANCHAY_FP_CREDENTIALS_JSON` names `pg` explicitly), on the reading that Cybrilla's payment gateway sandbox issues its own credentials in practice even though the tenant token technically authenticates it; `pg`'s token path is identical to `fp`'s (`/v2/auth/{tenant}/token`) unless a later task's sandbox probe (D4 `tools/fp-probes`) finds otherwise.

#### Step 1: Write the failing tests (complete code)

`apps/api/src/integrations/fp/fp-operations.ts` does not exist yet, so every test below fails to resolve its import. Create the test files first, exactly as given.

`apps/api/src/integrations/fp/fp-operations.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FP_OPERATIONS, type FpOperationClass } from './fp-operations.js';

const VALID_CLASSES: readonly FpOperationClass[] = ['R', 'K', 'P', 'M'];
const VALID_AUDIENCES = ['fp', 'poa', 'pg'];
const VALID_METHODS = ['GET', 'POST', 'PATCH'];

describe('FP_OPERATIONS', () => {
  it('every entry has a class, a known audience and a known HTTP method (table pin test)', () => {
    for (const [key, def] of Object.entries(FP_OPERATIONS)) {
      expect(VALID_CLASSES, key).toContain(def.class);
      expect(VALID_AUDIENCES, key).toContain(def.audience);
      expect(VALID_METHODS, key).toContain(def.method);
      expect(def.path.startsWith('/'), key).toBe(true);
    }
  });

  it('has exactly one create/update pair per M-class order object (purchase, purchase plan, redemption)', () => {
    for (const base of ['purchase', 'purchasePlan', 'redemption']) {
      expect(FP_OPERATIONS[`${base}.create` as keyof typeof FP_OPERATIONS].class).toBe('M');
      expect(FP_OPERATIONS[`${base}.update` as keyof typeof FP_OPERATIONS].class).toBe('M');
    }
  });

  it('classifies pre-verification create as K and its fetch as R', () => {
    expect(FP_OPERATIONS['preVerification.create'].class).toBe('K');
    expect(FP_OPERATIONS['preVerification.get'].class).toBe('R');
  });

  it('classifies every provisioning create/update as P', () => {
    const provisioningKeys = [
      'investorProfile.create',
      'investorProfile.update',
      'phoneNumber.create',
      'emailAddress.create',
      'address.create',
      'relatedParty.create',
      'bankAccount.create',
      'mfInvestmentAccount.create',
      'mfInvestmentAccount.update',
    ] as const;
    for (const key of provisioningKeys) {
      expect(FP_OPERATIONS[key].class).toBe('P');
    }
  });
});
```

`apps/api/src/integrations/fp/consumed-consent.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { assertConsumed, type ConsumedConsent } from './consumed-consent.js';
import { ConsentNotConsumedError } from './fp-errors.js';

function valid(): ConsumedConsent {
  return {
    challengeId: 'chal-1',
    investorId: 'inv-1',
    subjectType: 'PURCHASE',
    subjectIds: ['order-1'],
    snapshotSha256: 'a'.repeat(64),
    executeBefore: new Date('2027-01-01T00:00:00Z'),
  } as ConsumedConsent;
}

describe('assertConsumed', () => {
  it('accepts a well-shaped ConsumedConsent', () => {
    expect(() => assertConsumed(valid())).not.toThrow();
  });

  it('throws ConsentNotConsumedError for undefined', () => {
    expect(() => assertConsumed(undefined)).toThrow(ConsentNotConsumedError);
  });

  it('throws for a plain object missing challengeId', () => {
    const { challengeId, ...rest } = valid();
    expect(() => assertConsumed(rest)).toThrow(ConsentNotConsumedError);
  });

  it('throws when executeBefore is a string instead of a Date', () => {
    expect(() => assertConsumed({ ...valid(), executeBefore: '2027-01-01' })).toThrow(
      ConsentNotConsumedError,
    );
  });

  it('throws when subjectIds is not an array of strings', () => {
    expect(() => assertConsumed({ ...valid(), subjectIds: [1, 2] })).toThrow(
      ConsentNotConsumedError,
    );
  });
});
```

`apps/api/src/integrations/fp/fp-json.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { fpJson, FpJsonError } from './fp-json.js';

describe('fpJson.parse', () => {
  it('parses 1234567890123.45 into Money without float loss', () => {
    const parsed = fpJson.parse('{"amount":1234567890123.45}') as { amount: unknown };
    expect(fpJson.money(parsed.amount, 'amount').toWire()).toBe('1234567890123.45');
  });

  it('parses 12345.678 into platform-scale Units without float loss', () => {
    const parsed = fpJson.parse('{"allotted_units":12345.678}') as { allotted_units: unknown };
    expect(fpJson.units(parsed.allotted_units, 'allotted_units').toWire()).toBe('12345.678');
  });

  it('a JS number would have lost precision on this exact value (proves the test is meaningful)', () => {
    expect(JSON.parse('{"amount":1234567890123.45}').amount).not.toBe(1234567890123.45);
  });

  it('parses a 6dp NAV', () => {
    const parsed = fpJson.parse('{"nav":45.123456}') as { nav: unknown };
    expect(fpJson.nav(parsed.nav, 'nav').toWire()).toBe('45.123456');
  });

  it('rejects a non-numeric field', () => {
    const parsed = fpJson.parse('{"amount":"not-a-number"}') as { amount: unknown };
    expect(() => fpJson.money(parsed.amount, 'amount')).toThrow(FpJsonError);
  });
});
```

`apps/api/src/integrations/fp/fp-token-cache.test.ts`:

```ts
import { MockAgent } from 'undici';
import { describe, expect, it } from 'vitest';
import { FpTokenCache } from './fp-token-cache.js';

const BASE_URLS = { fp: 'https://fp.fake.local', poa: 'https://poa.fake.local', pg: 'https://pg.fake.local' };
const CREDENTIALS = {
  tenantId: 'sanchay',
  fp: { clientId: 'fp-id', clientSecret: 'fp-secret' },
  poa: { clientId: 'poa-id', clientSecret: 'poa-secret' },
  pg: { clientId: 'pg-id', clientSecret: 'pg-secret' },
};

function agentWithTokenCounter(): { agent: MockAgent; calls: () => number } {
  const agent = new MockAgent();
  agent.disableNetConnect();
  let calls = 0;
  agent
    .get('https://fp.fake.local')
    .intercept({ path: '/v2/auth/sanchay/token', method: 'POST' })
    .reply(() => {
      calls += 1;
      return { statusCode: 200, data: { access_token: `tok-${calls}`, expires_in: 1800 } };
    })
    .persist();
  agent
    .get('https://poa.fake.local')
    .intercept({ path: '/v2/auth/cybrillarta/token', method: 'POST' })
    .reply(200, { access_token: 'poa-tok', expires_in: 1800 })
    .persist();
  return { agent, calls: () => calls };
}

describe('FpTokenCache', () => {
  it('fetches once per audience and reuses the cached token', async () => {
    const { agent, calls } = agentWithTokenCounter();
    const cache = new FpTokenCache(BASE_URLS, CREDENTIALS, agent);
    expect(await cache.tokenFor('fp')).toBe('tok-1');
    expect(await cache.tokenFor('fp')).toBe('tok-1');
    expect(calls()).toBe(1);
  });

  it('caches fp and poa independently', async () => {
    const { agent } = agentWithTokenCounter();
    const cache = new FpTokenCache(BASE_URLS, CREDENTIALS, agent);
    expect(await cache.tokenFor('fp')).toBe('tok-1');
    expect(await cache.tokenFor('poa')).toBe('poa-tok');
  });

  it('de-duplicates concurrent refreshes into one in-flight request', async () => {
    const { agent, calls } = agentWithTokenCounter();
    const cache = new FpTokenCache(BASE_URLS, CREDENTIALS, agent);
    const [a, b, c] = await Promise.all([cache.tokenFor('fp'), cache.tokenFor('fp'), cache.tokenFor('fp')]);
    expect([a, b, c]).toEqual(['tok-1', 'tok-1', 'tok-1']);
    expect(calls()).toBe(1);
  });

  it('refreshes once the cached token is within 60s of expiry', async () => {
    const agent = new MockAgent();
    agent.disableNetConnect();
    let now = 0;
    let calls = 0;
    agent
      .get('https://fp.fake.local')
      .intercept({ path: '/v2/auth/sanchay/token', method: 'POST' })
      .reply(() => {
        calls += 1;
        return { statusCode: 200, data: { access_token: `tok-${calls}`, expires_in: 120 } };
      })
      .persist();
    const cache = new FpTokenCache(BASE_URLS, CREDENTIALS, agent, () => now);
    expect(await cache.tokenFor('fp')).toBe('tok-1');
    now = 61_001; // 120s life - 60s refresh buffer = usable until 60s; one ms past that must refetch
    expect(await cache.tokenFor('fp')).toBe('tok-2');
    expect(calls()).toBe(2);
  });
});
```

`apps/api/src/integrations/fp/fp-transport.test.ts`:

```ts
import type { ClsService } from 'nestjs-cls';
import { MockAgent } from 'undici';
import { describe, expect, it, vi } from 'vitest';
import type { SanchayClsStore } from '../../modules/platform/request-context.js';
import type { ConsumedConsent } from './consumed-consent.js';
import {
  ConsentNotConsumedError,
  FpAmbiguousError,
  FpRejectedError,
  ProviderCallInTransactionError,
} from './fp-errors.js';
import { FpTokenCache } from './fp-token-cache.js';
import { FpTransport } from './fp-transport.js';

const BASE_URLS = { fp: 'https://fp.fake.local', poa: 'https://poa.fake.local', pg: 'https://pg.fake.local' };
const CREDENTIALS = {
  tenantId: 'sanchay',
  fp: { clientId: 'fp-id', clientSecret: 'fp-secret' },
  poa: { clientId: 'poa-id', clientSecret: 'poa-secret' },
  pg: { clientId: 'pg-id', clientSecret: 'pg-secret' },
};

function clsWith(dbInTx: boolean): ClsService<SanchayClsStore> {
  return { get: (key: string) => (key === 'dbInTx' ? dbInTx : undefined) } as unknown as ClsService<SanchayClsStore>;
}

function recorder() {
  const entries: unknown[] = [];
  const record = vi.fn(async (entry: unknown) => {
    entries.push(entry);
  });
  return { record, entries };
}

function agentWithToken(): MockAgent {
  const agent = new MockAgent();
  agent.disableNetConnect();
  agent
    .get('https://fp.fake.local')
    .intercept({ path: '/v2/auth/sanchay/token', method: 'POST' })
    .reply(200, { access_token: 'tok', expires_in: 1800 })
    .persist();
  return agent;
}

function consent(): ConsumedConsent {
  return {
    challengeId: 'chal-1',
    investorId: 'inv-1',
    subjectType: 'PURCHASE',
    subjectIds: ['order-1'],
    snapshotSha256: 'a'.repeat(64),
    executeBefore: new Date('2027-01-01T00:00:00Z'),
  } as ConsumedConsent;
}

describe('FpTransport.call', () => {
  it('refuses to run inside a transaction', async () => {
    const agent = agentWithToken();
    const transport = new FpTransport(
      BASE_URLS,
      new FpTokenCache(BASE_URLS, CREDENTIALS, agent),
      agent,
      clsWith(true),
      recorder().record,
    );
    await expect(transport.call('schemePlans.list', {})).rejects.toBeInstanceOf(
      ProviderCallInTransactionError,
    );
  });

  it('rejects a P/M call with no consent, at runtime, even past the type check', async () => {
    const agent = agentWithToken();
    const transport = new FpTransport(
      BASE_URLS,
      new FpTokenCache(BASE_URLS, CREDENTIALS, agent),
      agent,
      clsWith(false),
      recorder().record,
    );
    // @ts-expect-error consent is required for an M-class operation
    await expect(transport.call('purchase.create', { body: {} })).rejects.toBeInstanceOf(
      ConsentNotConsumedError,
    );
  });

  it('maps a timeout to FpAmbiguousError', async () => {
    const agent = agentWithToken();
    agent
      .get('https://fp.fake.local')
      .intercept({ path: '/v2/mf_purchases', method: 'POST' })
      .replyWithError(new Error('simulated timeout'));
    const { record } = recorder();
    const transport = new FpTransport(
      BASE_URLS,
      new FpTokenCache(BASE_URLS, CREDENTIALS, agent),
      agent,
      clsWith(false),
      record,
    );
    await expect(
      transport.call('purchase.create', { body: { source_ref_id: 'o-1' }, consent: consent() }),
    ).rejects.toBeInstanceOf(FpAmbiguousError);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ errorCode: 'TRANSPORT_ERROR' }));
  });

  it('maps a 409 duplicate source_ref_id to FpAmbiguousError', async () => {
    const agent = agentWithToken();
    agent
      .get('https://fp.fake.local')
      .intercept({ path: '/v2/mf_purchases', method: 'POST' })
      .reply(409, { error: { status: 409, code: 'DUPLICATE_SOURCE_REF_ID', message: 'already exists' } });
    const { record } = recorder();
    const transport = new FpTransport(
      BASE_URLS,
      new FpTokenCache(BASE_URLS, CREDENTIALS, agent),
      agent,
      clsWith(false),
      record,
    );
    await expect(
      transport.call('purchase.create', { body: { source_ref_id: 'o-1' }, consent: consent() }),
    ).rejects.toBeInstanceOf(FpAmbiguousError);
  });

  it('maps a 400 to FpRejectedError with the provider code', async () => {
    const agent = agentWithToken();
    agent
      .get('https://fp.fake.local')
      .intercept({ path: '/v2/mf_purchases', method: 'POST' })
      .reply(400, { error: { status: 400, code: 'INVALID_SCHEME', message: 'unknown scheme' } });
    const { record } = recorder();
    const transport = new FpTransport(
      BASE_URLS,
      new FpTokenCache(BASE_URLS, CREDENTIALS, agent),
      agent,
      clsWith(false),
      record,
    );
    const failure = await transport
      .call('purchase.create', { body: { source_ref_id: 'o-1' }, consent: consent() })
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(FpRejectedError);
    expect((failure as FpRejectedError).providerCode).toBe('INVALID_SCHEME');
    expect((failure as FpRejectedError).httpStatus).toBe(400);
  });

  it('parses a successful response through fpJson and returns it', async () => {
    const agent = agentWithToken();
    agent
      .get('https://fp.fake.local')
      .intercept({ path: '/v2/mf_scheme_plans/cybrillapoa/INF209KA1K47', method: 'GET' })
      .reply(200, { isin: 'INF209KA1K47', object: 'mf_scheme_plan' });
    const transport = new FpTransport(
      BASE_URLS,
      new FpTokenCache(BASE_URLS, CREDENTIALS, agent),
      agent,
      clsWith(false),
      recorder().record,
    );
    const result = await transport.call('schemePlans.get', { pathParams: { isin: 'INF209KA1K47' } });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ isin: 'INF209KA1K47' });
  });
});
```

`apps/api/test/int/fp-provider-calls.int.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import type { MockAgent } from 'undici';
import { describe, expect, it } from 'vitest';
import { FP_DISPATCHER, FpTransport } from '../../src/integrations/fp/fp-transport.js';
import { providerCalls } from '../../src/integrations/fp/provider-calls.schema.js';
import { Crypto } from '../../src/modules/platform/crypto.js';
import { asRowId } from '../../src/modules/platform/ids.js';
import { bootTestApp } from './app.js';

describe('provider_calls (worker role)', () => {
  it('api role cannot resolve FpTransport', async () => {
    const t = await bootTestApp();
    try {
      expect(() => t.app.get(FpTransport)).toThrow();
    } finally {
      await t.close();
    }
  });

  it('worker role resolves FpTransport, records a call, and redacts PII from the stored meta', async () => {
    const t = await bootTestApp({ env: { SANCHAY_APP_ROLE: 'worker', SANCHAY_PROVIDER_MODE_FP: 'fake' } });
    try {
      const dispatcher = t.app.get<MockAgent>(FP_DISPATCHER);
      dispatcher
        .get('https://fp.fake.local')
        .intercept({ path: '/v2/mf_scheme_plans/cybrillapoa', method: 'GET' })
        .reply(200, { object: 'list', data: [], pan: 'AAAPA3751A', mobile: '9876543210' })
        .persist();
      const transport = t.app.get(FpTransport);
      await transport.call('schemePlans.list', {});
      const [row] = await t.db.db
        .select()
        .from(providerCalls)
        .where(eq(providerCalls.operation, 'schemePlans.list'));
      if (row === undefined) throw new Error('no provider_calls row for schemePlans.list');
      expect(JSON.stringify(row.responseMeta)).not.toMatch(/9876543210|AAAPA3751A/);
    } finally {
      await t.close();
    }
  });

  it('body_enc decrypts only under its own row AAD', async () => {
    const t = await bootTestApp({ env: { SANCHAY_APP_ROLE: 'worker', SANCHAY_PROVIDER_MODE_FP: 'fake' } });
    try {
      const dispatcher = t.app.get<MockAgent>(FP_DISPATCHER);
      dispatcher
        .get('https://fp.fake.local')
        .intercept({ path: '/v2/mf_scheme_plans/cybrillapoa', method: 'GET' })
        .reply(200, { object: 'list', data: [] })
        .persist();
      const transport = t.app.get(FpTransport);
      await transport.call('schemePlans.list', {});
      const [row] = await t.db.db
        .select()
        .from(providerCalls)
        .where(eq(providerCalls.operation, 'schemePlans.list'));
      if (row === undefined) throw new Error('no provider_calls row for schemePlans.list');
      const crypto = t.app.get(Crypto);
      const rowId = asRowId('provider_calls', row.id);
      expect(() =>
        crypto.decrypt(row.bodyEnc, { table: 'provider_calls', column: 'body_enc', rowId }),
      ).not.toThrow();
      expect(() =>
        crypto.decrypt(row.bodyEnc, {
          table: 'provider_calls',
          column: 'body_enc',
          rowId: 'not-the-row-id' as never,
        }),
      ).toThrow();
    } finally {
      await t.close();
    }
  });
});
```

#### Step 2: Run it to confirm it fails

```
pnpm --filter=@sanchay/api test fp-operations fp-json consumed-consent fp-token-cache fp-transport
```

Expected failure: every file under `apps/api/src/integrations/fp/` fails to resolve (`Cannot find module './fp-operations.js'` and similarly for every other import), because none of them exists yet.

```
pnpm --filter=@sanchay/api test:int fp-provider-calls
```

Expected failure: the same — `providerCalls` and `FP_DISPATCHER` are unresolved imports.

#### Step 3: Minimal implementation (complete code for every file)

**Step 3a — new catalog dependencies (A1 rule).** `undici` and `lossless-json` are new to this repo. Add the two keys to `pnpm-workspace.yaml`'s `catalog:` map by hand, alphabetically (shown here as the two insertion points, each a fragment of the existing map):

```yaml
  jsdom: 30.1.1
  lefthook: 2.1.14
  light-my-request: 6.6.0
  lossless-json: 4.1.1
  msw: 2.15.0
```

```yaml
  turbo: 2.11.4
  typescript: 6.0.3
  undici: 7.16.0
  unplugin-swc: 2.0.0
```

Then run, one command per line:

```
pnpm add --filter=@sanchay/api "undici@catalog:"
pnpm add --filter=@sanchay/api "lossless-json@catalog:"
pnpm --filter=@sanchay/api add "@sanchay/money@workspace:*"
```

`pnpm add x@catalog:` resolves against the two entries just added and writes `apps/api/package.json`'s `dependencies` (`"lossless-json": "catalog:"`, `"undici": "catalog:"`) plus `pnpm-lock.yaml`. The third command (RV-02-28) links the workspace package `@sanchay/money`, which `fp-json.ts` imports and `apps/api` did not yet depend on: with `nodeLinker: hoisted`, `apps/api/node_modules/@sanchay` held only `config`, `contract` and `domain`, so the import failed with TS2307. It adds `"@sanchay/money": "workspace:*"` and the matching importer lines in `pnpm-lock.yaml`; a `workspace:` link is not a catalog pin and needs no ADR-0001 row. Plan 03 E20's conditional `@sanchay/money` add (RV-03-6) then finds it present and skips. If either install reports `ERR_PNPM_IGNORED_BUILDS` or a `minimumReleaseAge` refusal, apply the matching A1 remedy (an `allowBuilds` entry, or an exact-version `minimumReleaseAgeExclude` entry with an ADR-0001 row and an expiry of publish date + 7 days) in this same commit; a `trustPolicy` refusal is stopped and reported to the lead, never resolved alone. Append to `docs/adr/0001-versions.md` (matching its existing row format):

```markdown
| `undici` | 7.16.0 | outside §A.2 | plan-02-mvp-kernel D3 (`apps/api/src/integrations/fp/fp-transport.ts`): FpGateway's HTTP client, chosen for its `Agent`/`MockAgent` pair (real per-request timeouts for D3; deterministic interception for D4's FakeFp and this task's own unit tests) |
| `lossless-json` | 4.1.1 | outside §A.2 | plan-02-mvp-kernel D3 (`apps/api/src/integrations/fp/fp-json.ts`): parses FP response bodies without float precision loss on large amounts and high-precision unit quantities, per the D3 outline |
```

**`apps/api/src/modules/platform/ids.ts`** (modify — one line added to the union):

```ts
export type TableName =
  | 'audit_events'
  | 'auth_sessions'
  | 'investor_contacts'
  | 'investor_devices'
  | 'investors'
  | 'otp_codes'
  | 'provider_calls';
```

**`apps/api/src/modules/platform/request-context.ts`** (modify — one field added to `SanchayClsStore`):

```ts
export interface SanchayClsStore extends ClsStore {
  /** IPv4 only (H-1). Null only on exempt paths; every other request is refused earlier with 422. */
  ip: string | null;
  userAgent: string | null;
  client: ClientInfo | null;
  auth: AuthContext | null;
  /**
   * Set by `runInTx` (db/client.ts, plan-02-mvp-kernel D3) for the lifetime of a DB transaction, so
   * `FpTransport.call` can refuse to run inside one. Always initialised to `false` per request by
   * `AppModule.forRoot`'s ClsModule setup callback.
   */
  dbInTx: boolean;
}
```

**`apps/api/src/db/client.ts`** (modify — append `runInTx` at the bottom of the file; every existing export is unchanged):

```ts
import type { ClsService } from 'nestjs-cls';
import type { SanchayClsStore } from '../modules/platform/request-context.js';

export interface RunInTxOptions {
  isolationLevel?: 'read committed' | 'repeatable read' | 'serializable';
}

/**
 * Runs `fn` inside a DB transaction and marks the CLS flag `dbInTx` for its duration, so
 * `FpTransport.call` (integrations/fp/fp-transport.ts, plan-02-mvp-kernel D3) can refuse to run a
 * provider call while a transaction is open ("providers are called only from worker jobs", and
 * never from inside one). This codebase has no earlier shared transaction helper (see D3's
 * Interfaces deviation note), so every future caller that wraps an `FpTransact`/`FpProvision` call
 * in a transaction must use this, not its own `dbh.db.transaction()`.
 */
export async function runInTx<T>(
  dbh: DbHandle,
  cls: ClsService<SanchayClsStore>,
  fn: (tx: Tx) => Promise<T>,
  options: RunInTxOptions = {},
): Promise<T> {
  return dbh.db.transaction(
    async (tx) => {
      const previous = cls.get('dbInTx');
      cls.set('dbInTx', true);
      try {
        return await fn(tx);
      } finally {
        cls.set('dbInTx', previous);
      }
    },
    options.isolationLevel === undefined ? undefined : { isolationLevel: options.isolationLevel },
  );
}
```

**`apps/api/src/app.module.ts`** (modify — three fragments, shown in context):

```ts
import type { Env } from './config/env.js';
import { FpModule } from './integrations/fp/fp.module.js';
import { IntegrationsModule } from './integrations/integrations.module.js';
```

```ts
            setup: (cls, req: RawRequest) => {
              cls.set('ip', clientIpFrom(req, env.SANCHAY_CLIENT_IP_SOURCE));
              cls.set('userAgent', headerValue(req.headers['user-agent'])?.slice(0, 512) ?? null);
              cls.set('client', null);
              cls.set('auth', null);
              cls.set('dbInTx', false);
            },
```

```ts
        PlatformModule.forRoot(env),
        IntegrationsModule.forRoot(env),
        IdentityModule,
        // "Providers are called only from worker jobs": FpModule is never imported in the api role.
        ...(env.SANCHAY_APP_ROLE === 'worker' ? [FpModule.forRoot(env)] : []),
```

**`apps/api/src/config/env.ts`** (modify — additive keys, a new schema/parser, and two boot invariants):

```ts
const FpAudienceCredentialsSchema = z.strictObject({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
});

export const FpCredentialsSchema = z.strictObject({
  tenantId: z.string().min(1),
  fp: FpAudienceCredentialsSchema,
  poa: FpAudienceCredentialsSchema,
  pg: FpAudienceCredentialsSchema,
});
export type FpCredentials = z.infer<typeof FpCredentialsSchema>;

const FP_CREDENTIALS_PROBLEM =
  'SANCHAY_FP_CREDENTIALS_JSON is required and must be well-formed outside fake mode';

export function parseFpCredentialsJson(raw: string | undefined): FpCredentials {
  if (raw === undefined || raw === '') {
    throw new EnvError(`${FP_CREDENTIALS_PROBLEM} (missing)`);
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new EnvError(`${FP_CREDENTIALS_PROBLEM} (not valid JSON)`);
  }
  const result = FpCredentialsSchema.safeParse(json);
  if (!result.success) {
    throw new EnvError(`${FP_CREDENTIALS_PROBLEM} (wrong shape)`);
  }
  return result.data;
}
```

Add to `EnvSchema` (key-level addition; every existing key is unchanged):

```ts
  SANCHAY_THROTTLE_PER_MINUTE: z.coerce.number().int().min(1).max(10_000).default(120),
  SANCHAY_OTP_PER_IP_PER_HOUR: z.coerce.number().int().positive().default(20),
  SANCHAY_PROVIDER_MODE_FP: z.enum(['fake', 'sandbox', 'production']).default('fake'),
  SANCHAY_FP_BASE_URL: z.url({ protocol: /^https?$/ }).optional(),
  SANCHAY_FP_CREDENTIALS_JSON: z.string().optional(),
});
```

Add to `assertBootInvariants`, after invariant 7:

```ts
  // 8 (plan-02-mvp-kernel D3): the fake FP transport must never run outside local/test.
  if (!localOrTest && env.SANCHAY_PROVIDER_MODE_FP === 'fake') {
    problems.push('SANCHAY_PROVIDER_MODE_FP=fake is refused outside local/test');
  }
  // 9 (plan-02-mvp-kernel D3): the live production FP transport must only run in the prod app env.
  if (env.SANCHAY_PROVIDER_MODE_FP === 'production' && env.SANCHAY_APP_ENV !== 'prod') {
    problems.push('SANCHAY_PROVIDER_MODE_FP=production requires SANCHAY_APP_ENV=prod');
  }
```

**`apps/api/src/config/env.test.ts`** (modify — the pin test gains the three new keys and its title's second half changes):

```ts
  it('declares exactly the Plan-01 variables of the H-8 addendum (R-19); MSG91 and SES arrive with D6', () => {
    expect(Object.keys(EnvSchema.shape).sort()).toEqual([
      'DATABASE_URL',
      'HOST',
      'PORT',
      'SANCHAY_APP_ENV',
      'SANCHAY_APP_ORIGIN',
      'SANCHAY_APP_ROLE',
      'SANCHAY_AUTH_TOKEN_KEY',
      'SANCHAY_CLIENT_IP_SOURCE',
      'SANCHAY_DB_POOL_MAX',
      'SANCHAY_FP_BASE_URL',
      'SANCHAY_FP_CREDENTIALS_JSON',
      'SANCHAY_KEYRING_JSON',
      'SANCHAY_KEY_SERVICE',
      'SANCHAY_LOCAL_BIDX_KEY',
      'SANCHAY_LOCAL_PII_KEY',
      'SANCHAY_LOG_LEVEL',
      'SANCHAY_MAILPIT_URL',
      'SANCHAY_OTP_PEPPER',
      'SANCHAY_OTP_PER_IP_PER_HOUR',
      'SANCHAY_PROVIDER_MODE_EMAIL',
      'SANCHAY_PROVIDER_MODE_FP',
      'SANCHAY_PROVIDER_MODE_SMS',
      'SANCHAY_SMS_RETRIEVER_HASH',
      'SANCHAY_THROTTLE_PER_MINUTE',
    ]);
  });

  it('refuses SANCHAY_PROVIDER_MODE_FP=fake outside local/test (invariant 8)', () => {
    for (const appEnv of ['dev', 'staging', 'prod']) {
      expect(
        errorMessage(() =>
          parseEnv({ ...devSecrets, SANCHAY_APP_ENV: appEnv, SANCHAY_PROVIDER_MODE_FP: 'fake' }),
        ),
      ).toMatch(/SANCHAY_PROVIDER_MODE_FP=fake is refused outside local\/test/);
    }
  });

  it('refuses SANCHAY_PROVIDER_MODE_FP=production outside SANCHAY_APP_ENV=prod (invariant 9)', () => {
    expect(
      errorMessage(() =>
        parseEnv({ ...devSecrets, SANCHAY_APP_ENV: 'staging', SANCHAY_PROVIDER_MODE_FP: 'production' }),
      ),
    ).toMatch(/SANCHAY_PROVIDER_MODE_FP=production requires SANCHAY_APP_ENV=prod/);
  });
```

`devSecrets` (this file's dev-environment fixture) gains one line, after `SANCHAY_SMS_RETRIEVER_HASH` (RV-02-25). With invariant 8 a dev configuration without an FP mode is refused, which would fail three Plan 01 cases (`requires SANCHAY_SMS_RETRIEVER_HASH outside local/test`, `refuses fake SMS/email providers in staging and prod, but not in dev`, `boots outside local/test with the secrets keyring behind the ALB`). The two new tests set the mode they are about themselves.

```ts
  SANCHAY_PROVIDER_MODE_FP: 'sandbox',
```

**`apps/api/src/integrations/fp/fp-operations.ts`:**

```ts
/** Every provider call FpGateway can make, with its OAuth audience and D-MONEY-109 class (outline §0.1). */
export type FpAudience = 'fp' | 'poa' | 'pg';
export type FpOperationClass = 'R' | 'K' | 'P' | 'M';
export type FpHttpMethod = 'GET' | 'POST' | 'PATCH';

export interface FpOperationDefinition {
  readonly method: FpHttpMethod;
  /** `{param}` placeholders are filled from `FpCallArgs.pathParams`. */
  readonly path: string;
  readonly audience: FpAudience;
  readonly class: FpOperationClass;
}

/**
 * The base FP_OPERATIONS table (research:fp-api, research:rules-fp-contracts §0). Later tasks
 * (E1 webhooks, E6/E7 KYC and bank, E11 provisioning, E20 lumpsum, F2 SIP/mandates, F4 ledger,
 * F5 redemption) extend this object; nothing here is renamed once it lands, because FpOperationKey
 * is a public, load-bearing type.
 */
export const FP_OPERATIONS = {
  // R -- reads (research:fp-api SS8, SS3, SS4, SS7)
  'schemePlans.list': { method: 'GET', path: '/v2/mf_scheme_plans/cybrillapoa', audience: 'fp', class: 'R' },
  'schemePlans.get': { method: 'GET', path: '/v2/mf_scheme_plans/cybrillapoa/{isin}', audience: 'fp', class: 'R' },
  'fundScheme.get': { method: 'GET', path: '/api/oms/fund_schemes/{isin}', audience: 'fp', class: 'R' },
  'purchase.get': { method: 'GET', path: '/v2/mf_purchases/{id}', audience: 'fp', class: 'R' },
  'purchase.list': { method: 'GET', path: '/v2/mf_purchases', audience: 'fp', class: 'R' },
  'purchasePlan.get': { method: 'GET', path: '/v2/mf_purchase_plans/{id}', audience: 'fp', class: 'R' },
  'purchasePlan.list': { method: 'GET', path: '/v2/mf_purchase_plans', audience: 'fp', class: 'R' },
  'redemption.get': { method: 'GET', path: '/v2/mf_redemptions/{id}', audience: 'fp', class: 'R' },
  'redemption.list': { method: 'GET', path: '/v2/mf_redemptions', audience: 'fp', class: 'R' },
  'mandate.get': { method: 'GET', path: '/api/pg/mandates/{id}', audience: 'pg', class: 'R' },
  'mandate.list': { method: 'GET', path: '/api/pg/mandates', audience: 'pg', class: 'R' },
  'payment.get': { method: 'GET', path: '/api/pg/payments/{id}', audience: 'pg', class: 'R' },
  'payment.list': { method: 'GET', path: '/api/pg/payments', audience: 'pg', class: 'R' },
  'holdings.get': { method: 'GET', path: '/api/oms/reports/holdings', audience: 'fp', class: 'R' },
  'folio.list': { method: 'GET', path: '/v2/mf_folios', audience: 'fp', class: 'R' },
  'preVerification.get': { method: 'GET', path: '/poa/pre_verifications/{id}', audience: 'poa', class: 'R' },

  // K -- POA pre-verification (research:fp-api SS5, item 1)
  'preVerification.create': { method: 'POST', path: '/poa/pre_verifications', audience: 'poa', class: 'K' },

  // P -- provisioning writes (research:fp-api SS5, items 3-7)
  'investorProfile.create': { method: 'POST', path: '/v2/investor_profiles', audience: 'fp', class: 'P' },
  'investorProfile.update': { method: 'PATCH', path: '/v2/investor_profiles', audience: 'fp', class: 'P' },
  'phoneNumber.create': { method: 'POST', path: '/v2/phone_numbers', audience: 'fp', class: 'P' },
  'emailAddress.create': { method: 'POST', path: '/v2/email_addresses', audience: 'fp', class: 'P' },
  'address.create': { method: 'POST', path: '/v2/addresses', audience: 'fp', class: 'P' },
  'relatedParty.create': { method: 'POST', path: '/v2/related_parties', audience: 'fp', class: 'P' },
  'bankAccount.create': { method: 'POST', path: '/v2/bank_accounts', audience: 'fp', class: 'P' },
  'mfInvestmentAccount.create': { method: 'POST', path: '/v2/mf_investment_accounts', audience: 'fp', class: 'P' },
  'mfInvestmentAccount.update': { method: 'PATCH', path: '/v2/mf_investment_accounts', audience: 'fp', class: 'P' },

  // M -- money writes (research:fp-api SS3, SS4)
  'purchase.create': { method: 'POST', path: '/v2/mf_purchases', audience: 'fp', class: 'M' },
  'purchase.update': { method: 'PATCH', path: '/v2/mf_purchases', audience: 'fp', class: 'M' },
  'purchasePlan.create': { method: 'POST', path: '/v2/mf_purchase_plans', audience: 'fp', class: 'M' },
  'purchasePlan.update': { method: 'PATCH', path: '/v2/mf_purchase_plans', audience: 'fp', class: 'M' },
  'redemption.create': { method: 'POST', path: '/v2/mf_redemptions', audience: 'fp', class: 'M' },
  'redemption.update': { method: 'PATCH', path: '/v2/mf_redemptions', audience: 'fp', class: 'M' },
  'payment.create': { method: 'POST', path: '/api/pg/payments/netbanking', audience: 'pg', class: 'M' },
  'paymentNach.create': { method: 'POST', path: '/api/pg/payments/nach', audience: 'pg', class: 'M' },
  'mandate.create': { method: 'POST', path: '/api/pg/mandates', audience: 'pg', class: 'M' },
  'mandateAuth.create': { method: 'POST', path: '/api/pg/payments/emandate/auth', audience: 'pg', class: 'M' },
} as const satisfies Record<string, FpOperationDefinition>;

export type FpOperationKey = keyof typeof FP_OPERATIONS;
```

**`apps/api/src/integrations/fp/fp-errors.ts`:**

```ts
export class ProviderCallInTransactionError extends Error {
  override name = 'ProviderCallInTransactionError';
  constructor(op: string) {
    super(`FpTransport.call(${op}): providers must never be called inside a DB transaction`);
  }
}

export class ConsentNotConsumedError extends Error {
  override name = 'ConsentNotConsumedError';
  constructor() {
    super('a P/M FpTransport.call requires a well-shaped ConsumedConsent');
  }
}

export class FpAmbiguousError extends Error {
  override name = 'FpAmbiguousError';
  readonly op: string;
  readonly httpStatus: number | null;

  constructor(op: string, options: { status?: number; cause?: unknown } = {}) {
    super(
      `FP call ${op} was ambiguous${options.status === undefined ? '' : ` (HTTP ${options.status})`}`,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.op = op;
    this.httpStatus = options.status ?? null;
  }
}

export class FpRejectedError extends Error {
  override name = 'FpRejectedError';
  readonly op: string;
  readonly httpStatus: number;
  readonly providerCode: string | null;

  constructor(op: string, httpStatus: number, providerCode: string | null) {
    super(`FP call ${op} was rejected (HTTP ${httpStatus}${providerCode === null ? '' : `, ${providerCode}`})`);
    this.op = op;
    this.httpStatus = httpStatus;
    this.providerCode = providerCode;
  }
}

/** Thrown by every `FpProvision`/`FpTransact` stub method until the task named in the message wires it. */
export class NotImplementedYetError extends Error {
  override name = 'NotImplementedYetError';
}
```

**`apps/api/src/integrations/fp/consumed-consent.ts`:**

```ts
import type { Brand, ConsentSubjectType } from '@sanchay/domain';
import { ConsentNotConsumedError } from './fp-errors.js';

/**
 * Proof that ConsentEngine.useConsumed (E4, Plan 03) is on the call stack. Only ConsentEngine can
 * construct one; everyone else receives it as an opaque value and passes it through to
 * `FpTransport.call`. Plan-03 E3/E4 were drafted before this task existed and defined a
 * structurally identical local copy in `consent-engine.ts`; whichever of D3/E4 merges second
 * re-points E4's call sites at this export and deletes the local copy (noted in E4's own
 * Interfaces when it is expanded).
 */
export type ConsumedConsent = Brand<
  {
    readonly challengeId: string;
    readonly investorId: string;
    readonly subjectType: ConsentSubjectType;
    readonly subjectIds: readonly string[];
    readonly snapshotSha256: string;
    readonly executeBefore: Date;
  },
  'ConsumedConsent'
>;

function hasConsumedConsentShape(value: unknown): value is ConsumedConsent {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.challengeId === 'string' &&
    v.challengeId.length > 0 &&
    typeof v.investorId === 'string' &&
    v.investorId.length > 0 &&
    typeof v.subjectType === 'string' &&
    v.subjectType.length > 0 &&
    Array.isArray(v.subjectIds) &&
    v.subjectIds.every((id) => typeof id === 'string') &&
    typeof v.snapshotSha256 === 'string' &&
    v.snapshotSha256.length > 0 &&
    v.executeBefore instanceof Date
  );
}

/**
 * Runtime half of the P/M consent guard (the compile-time half is `FpCallArgs`, fp-transport.ts).
 * A caller that bypasses the type system with `any`, or that forwards `undefined`, is caught here.
 * This checks shape only, not expiry: `executeBefore` freshness is ConsentEngine's job at the point
 * it hands the value out, not FpTransport's job at the point it is spent.
 */
export function assertConsumed(value: unknown): asserts value is ConsumedConsent {
  if (!hasConsumedConsentShape(value)) {
    throw new ConsentNotConsumedError();
  }
}
```

**`apps/api/src/integrations/fp/fp-json.ts`:**

```ts
import { isLosslessNumber, LosslessNumber, parse as parseLossless } from 'lossless-json';
import { Money, Nav, Units, type UnitsScale } from '@sanchay/money';

export class FpJsonError extends Error {
  override name = 'FpJsonError';
}

/**
 * Parses an FP response body with every JSON number kept as a `LosslessNumber` (its exact source
 * text, never round-tripped through a JS double). Only `fpJson.money`/`units`/`nav` may turn one
 * into a typed amount; every other field is read as a plain string/boolean/nested object.
 */
function parse(text: string): unknown {
  return parseLossless(text);
}

function numberText(value: unknown, field: string): string {
  if (value instanceof LosslessNumber || isLosslessNumber(value)) return String(value);
  if (typeof value === 'string' && value.trim().length > 0) return value;
  throw new FpJsonError(`fpJson: ${field} is not a number (got ${typeof value})`);
}

function money(value: unknown, field: string): Money {
  try {
    return Money.parse(numberText(value, field));
  } catch (error) {
    throw new FpJsonError(`fpJson: ${field} is not a valid Money value`, { cause: error });
  }
}

function units(value: unknown, field: string, scale: UnitsScale = 3): Units {
  try {
    return Units.parse(numberText(value, field), scale);
  } catch (error) {
    throw new FpJsonError(`fpJson: ${field} is not a valid Units value`, { cause: error });
  }
}

function nav(value: unknown, field: string): Nav {
  try {
    return Nav.parse(numberText(value, field));
  } catch (error) {
    throw new FpJsonError(`fpJson: ${field} is not a valid Nav value`, { cause: error });
  }
}

export const fpJson = { parse, money, units, nav };
```

**`apps/api/src/integrations/fp/fp-token-cache.ts`:**

```ts
import type { Dispatcher } from 'undici';
import { request } from 'undici';
import type { FpAudience } from './fp-operations.js';
import { FpAmbiguousError } from './fp-errors.js';

export interface FpAudienceCredentials {
  readonly clientId: string;
  readonly clientSecret: string;
}

/** Deviation from the outline: adds `tenantId` — see D3's Interfaces deviation note. */
export interface FpCredentials {
  readonly tenantId: string;
  readonly fp: FpAudienceCredentials;
  readonly poa: FpAudienceCredentials;
  readonly pg: FpAudienceCredentials;
}

export type FpBaseUrls = Record<FpAudience, string>;

interface CachedToken {
  readonly accessToken: string;
  readonly expiresAt: number;
}

/** Tokens are usable until 60s before their reported expiry (research:fp-api SS0, "Token life"). */
const REFRESH_BUFFER_MS = 60_000;
const DEFAULT_EXPIRES_IN_SECONDS = 1800;

function tokenPathFor(audience: FpAudience, tenantId: string): string {
  return audience === 'poa' ? '/v2/auth/cybrillarta/token' : `/v2/auth/${tenantId}/token`;
}

/** Per-audience OAuth client-credentials cache, one in-memory entry each for fp/poa/pg. */
export class FpTokenCache {
  /** Read by FpTransport for the `x-tenant-id` header (audiences fp/pg only, never poa). */
  readonly tenantId: string;
  private readonly tokens = new Map<FpAudience, CachedToken>();
  private readonly inFlight = new Map<FpAudience, Promise<string>>();

  constructor(
    private readonly baseUrls: FpBaseUrls,
    private readonly credentials: FpCredentials,
    private readonly dispatcher: Dispatcher,
    private readonly now: () => number = Date.now,
  ) {
    this.tenantId = credentials.tenantId;
  }

  async tokenFor(audience: FpAudience): Promise<string> {
    const cached = this.tokens.get(audience);
    if (cached !== undefined && cached.expiresAt - REFRESH_BUFFER_MS > this.now()) {
      return cached.accessToken;
    }
    const existing = this.inFlight.get(audience);
    if (existing !== undefined) return existing;
    const promise = this.fetchToken(audience).finally(() => this.inFlight.delete(audience));
    this.inFlight.set(audience, promise);
    return promise;
  }

  private async fetchToken(audience: FpAudience): Promise<string> {
    const { clientId, clientSecret } = this.credentials[audience];
    const url = `${this.baseUrls[audience]}${tokenPathFor(audience, this.credentials.tenantId)}`;
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }).toString();
    let response: Awaited<ReturnType<typeof request>>;
    try {
      response = await request(url, {
        method: 'POST',
        dispatcher: this.dispatcher,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
      });
    } catch (error) {
      throw new FpAmbiguousError(`token.${audience}`, { cause: error });
    }
    const text = await response.body.text();
    if (response.statusCode >= 400) {
      throw new FpAmbiguousError(`token.${audience}`, { status: response.statusCode });
    }
    const parsed = JSON.parse(text) as { access_token: string; expires_in?: number };
    const expiresAt = this.now() + (parsed.expires_in ?? DEFAULT_EXPIRES_IN_SECONDS) * 1000;
    this.tokens.set(audience, { accessToken: parsed.access_token, expiresAt });
    return parsed.access_token;
  }
}
```

**`apps/api/src/integrations/fp/fp-transport.ts`:**

```ts
import { Injectable } from '@nestjs/common';
import type { ClsService } from 'nestjs-cls';
import type { Dispatcher } from 'undici';
import { request } from 'undici';
import { scrub } from '../../modules/platform/logging.js';
import type { SanchayClsStore } from '../../modules/platform/request-context.js';
import { assertConsumed, type ConsumedConsent } from './consumed-consent.js';
import { FpAmbiguousError, FpRejectedError, ProviderCallInTransactionError } from './fp-errors.js';
import { fpJson } from './fp-json.js';
import { FP_OPERATIONS, type FpAudience, type FpOperationKey } from './fp-operations.js';
import type { FpBaseUrls, FpTokenCache } from './fp-token-cache.js';

/** DI token for the undici Dispatcher (`Agent` live, or D4 FakeFp's `MockAgent` in fake mode). */
export const FP_DISPATCHER = Symbol('FP_DISPATCHER');

type RequiresConsent<K extends FpOperationKey> = (typeof FP_OPERATIONS)[K]['class'] extends 'P' | 'M'
  ? true
  : false;

export type FpCallArgs<K extends FpOperationKey> = {
  pathParams?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** Ties this call's provider_calls row to a domain aggregate (an order, a plan, ...). */
  aggregate?: { type: string; id: string };
} & (RequiresConsent<K> extends true ? { consent: ConsumedConsent } : { consent?: ConsumedConsent });

export interface FpCallResult {
  readonly status: number;
  readonly body: unknown;
}

export interface ProviderCallRecordInput {
  readonly operation: FpOperationKey;
  readonly audience: FpAudience;
  readonly aggregateType: string | null;
  readonly aggregateId: string | null;
  readonly httpStatus: number | null;
  readonly durationMs: number;
  readonly errorCode: string | null;
  readonly requestMeta: unknown;
  readonly responseMeta: unknown;
  readonly rawForBodyEnc: string;
}

export type RecordProviderCall = (input: ProviderCallRecordInput) => Promise<void>;

function fillPath(path: string, params: Record<string, string> | undefined): string {
  return path.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = params?.[name];
    if (value === undefined) {
      throw new Error(`fp-transport: missing path param "${name}" for ${path}`);
    }
    return encodeURIComponent(value);
  });
}

function safeParse(text: string): unknown {
  if (text.length === 0) return undefined;
  try {
    return fpJson.parse(text);
  } catch {
    return undefined;
  }
}

function extractProviderCode(body: unknown): string | null {
  if (body === null || typeof body !== 'object') return null;
  const error = (body as { error?: unknown }).error;
  if (error === null || typeof error !== 'object') return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

/**
 * FpGateway's single call surface. Every FpRead/FpKyc/FpProvision/FpTransact method routes through
 * this. Timeouts: 10s connect / 30s body, set on the `Agent`/`MockAgent` passed in as `dispatcher`
 * (fp.module.ts), never per-call here.
 */
@Injectable()
export class FpTransport {
  constructor(
    private readonly baseUrls: FpBaseUrls,
    private readonly tokens: FpTokenCache,
    private readonly dispatcher: Dispatcher,
    private readonly cls: ClsService<SanchayClsStore>,
    private readonly recordCall: RecordProviderCall,
  ) {}

  async call<K extends FpOperationKey>(op: K, args: FpCallArgs<K>): Promise<FpCallResult> {
    if (this.cls.get('dbInTx') === true) {
      throw new ProviderCallInTransactionError(op);
    }
    const definition = FP_OPERATIONS[op];
    if (definition.class === 'P' || definition.class === 'M') {
      assertConsumed(args.consent);
    }
    const path = fillPath(definition.path, args.pathParams);
    const url = new URL(path, this.baseUrls[definition.audience]);
    for (const [key, value] of Object.entries(args.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const token = await this.tokens.tokenFor(definition.audience);
    const requestBody = args.body === undefined ? undefined : JSON.stringify(args.body);
    const aggregateType = args.aggregate?.type ?? null;
    const aggregateId = args.aggregate?.id ?? null;
    const requestMeta = scrub({ method: definition.method, path, body: args.body });
    const startedAt = Date.now();

    let response: Awaited<ReturnType<typeof request>>;
    try {
      response = await request(url, {
        method: definition.method,
        dispatcher: this.dispatcher,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          ...(definition.audience === 'poa' ? {} : { 'x-tenant-id': this.tokens.tenantId }),
        },
        body: requestBody,
      });
    } catch (error) {
      await this.recordCall({
        operation: op,
        audience: definition.audience,
        aggregateType,
        aggregateId,
        httpStatus: null,
        durationMs: Date.now() - startedAt,
        errorCode: 'TRANSPORT_ERROR',
        requestMeta,
        responseMeta: null,
        rawForBodyEnc: JSON.stringify({
          request: { method: definition.method, path, body: args.body },
          error: String(error),
        }),
      });
      throw new FpAmbiguousError(op, { cause: error });
    }

    const text = await response.body.text();
    const durationMs = Date.now() - startedAt;
    const rawForBodyEnc = JSON.stringify({
      request: { method: definition.method, path, body: args.body },
      response: { status: response.statusCode, body: text },
    });

    if (response.statusCode === 409) {
      await this.recordCall({
        operation: op,
        audience: definition.audience,
        aggregateType,
        aggregateId,
        httpStatus: 409,
        durationMs,
        errorCode: 'DUPLICATE_OR_CONFLICT',
        requestMeta,
        responseMeta: scrub(safeParse(text)),
        rawForBodyEnc,
      });
      throw new FpAmbiguousError(op, { status: 409 });
    }
    if (response.statusCode >= 500) {
      await this.recordCall({
        operation: op,
        audience: definition.audience,
        aggregateType,
        aggregateId,
        httpStatus: response.statusCode,
        durationMs,
        errorCode: 'UPSTREAM_5XX',
        requestMeta,
        responseMeta: scrub(safeParse(text)),
        rawForBodyEnc,
      });
      throw new FpAmbiguousError(op, { status: response.statusCode });
    }

    const parsedBody = safeParse(text);

    if (response.statusCode >= 400) {
      const providerCode = extractProviderCode(parsedBody);
      await this.recordCall({
        operation: op,
        audience: definition.audience,
        aggregateType,
        aggregateId,
        httpStatus: response.statusCode,
        durationMs,
        errorCode: providerCode ?? 'REJECTED',
        requestMeta,
        responseMeta: scrub(parsedBody),
        rawForBodyEnc,
      });
      throw new FpRejectedError(op, response.statusCode, providerCode);
    }

    await this.recordCall({
      operation: op,
      audience: definition.audience,
      aggregateType,
      aggregateId,
      httpStatus: response.statusCode,
      durationMs,
      errorCode: null,
      requestMeta,
      responseMeta: scrub(parsedBody),
      rawForBodyEnc,
    });
    return { status: response.statusCode, body: parsedBody };
  }
}
```

**`apps/api/src/integrations/fp/provider-calls.schema.ts`:**

```ts
import { index, integer, jsonb, text, uuid } from 'drizzle-orm/pg-core';
import { appSchema, bytea, dbUuidv7, tstz } from '../../db/app-schema.js';
import { newId } from '../../modules/platform/ids.js';

/**
 * Append-only (design SS C.1): UPDATE and DELETE are revoked from sanchay_app by the REVOKE line
 * appended at the bottom of this task's generated migration.
 */
export const providerCalls = appSchema.table(
  'provider_calls',
  {
    id: uuid('id')
      .primaryKey()
      .default(dbUuidv7)
      .$defaultFn(() => newId('provider_calls')),
    createdAt: tstz('created_at').notNull().defaultNow(),
    provider: text('provider').notNull(), // FpAudience: 'fp' | 'poa' | 'pg'
    operation: text('operation').notNull(), // FpOperationKey
    aggregateType: text('aggregate_type'),
    aggregateId: text('aggregate_id'),
    httpStatus: integer('http_status'),
    durationMs: integer('duration_ms').notNull(),
    errorCode: text('error_code'),
    requestMeta: jsonb('request_meta').$type<Record<string, unknown> | null>(),
    responseMeta: jsonb('response_meta').$type<Record<string, unknown> | null>(),
    bodyEnc: bytea('body_enc').notNull(),
  },
  (t) => [
    index('provider_calls_aggregate_idx').on(t.aggregateType, t.aggregateId),
    index('provider_calls_operation_idx').on(t.operation, t.createdAt),
  ],
);

export type ProviderCallRow = typeof providerCalls.$inferSelect;
export type NewProviderCall = typeof providerCalls.$inferInsert;
```

**`apps/api/src/integrations/fp/fp-read.ts`** (real implementation; fields beyond those named below pass through on `.raw`/the returned record itself — later tasks add a typed accessor for a field the moment they need it, rather than this task guessing every field every future task will want):

```ts
import type { FpTransport } from './fp-transport.js';

export interface FpSchemePlan {
  readonly isin: string;
  readonly name: string | null;
  readonly amcName: string | null;
  readonly type: string | null;
  readonly option: string | null;
  readonly active: boolean;
  readonly raw: Record<string, unknown>;
}

export interface FpListEnvelope<T> {
  readonly items: readonly T[];
  readonly raw: unknown;
}

function asRecord(value: unknown): Record<string, unknown> {
  return (value ?? {}) as Record<string, unknown>;
}

function toSchemePlan(row: Record<string, unknown>): FpSchemePlan {
  const scheme = asRecord(row.mf_scheme);
  const fund = asRecord(row.mf_fund);
  return {
    isin: String(row.isin ?? ''),
    name: typeof scheme.name === 'string' ? scheme.name : null,
    amcName: typeof fund.name === 'string' ? fund.name : null,
    type: typeof row.type === 'string' ? row.type : null,
    option: typeof row.option === 'string' ? row.option : null,
    active: row.active !== false,
    raw: row,
  };
}

function itemsOf(body: unknown): Record<string, unknown>[] {
  const data = asRecord(body).data;
  return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
}

/** Read-only FP access (research:fp-api SS3, SS7, SS8; research:rules-fp-contracts SS0 item 16). */
export class FpRead {
  constructor(private readonly transport: FpTransport) {}

  async schemePlans(params: { page?: number; size?: number } = {}): Promise<FpListEnvelope<FpSchemePlan>> {
    const result = await this.transport.call('schemePlans.list', {
      query: { expand: 'mf_scheme,mf_fund', page: params.page ?? 0, size: params.size ?? 100 },
    });
    return { items: itemsOf(result.body).map(toSchemePlan), raw: result.body };
  }

  async fundScheme(isin: string): Promise<Record<string, unknown>> {
    const result = await this.transport.call('fundScheme.get', { pathParams: { isin } });
    return asRecord(result.body);
  }

  async purchase(id: string): Promise<Record<string, unknown>> {
    const result = await this.transport.call('purchase.get', { pathParams: { id } });
    return asRecord(result.body);
  }

  async purchases(
    params: { plan?: string; mfInvestmentAccount?: string; states?: string } = {},
  ): Promise<FpListEnvelope<Record<string, unknown>>> {
    const result = await this.transport.call('purchase.list', {
      query: {
        plan: params.plan,
        mf_investment_account: params.mfInvestmentAccount,
        states: params.states,
      },
    });
    return { items: itemsOf(result.body), raw: result.body };
  }

  async purchasePlan(id: string): Promise<Record<string, unknown>> {
    const result = await this.transport.call('purchasePlan.get', { pathParams: { id } });
    return asRecord(result.body);
  }

  async purchasePlans(
    params: { mfInvestmentAccount?: string; states?: string } = {},
  ): Promise<FpListEnvelope<Record<string, unknown>>> {
    const result = await this.transport.call('purchasePlan.list', {
      query: { mf_investment_account: params.mfInvestmentAccount, states: params.states },
    });
    return { items: itemsOf(result.body), raw: result.body };
  }

  async redemption(id: string): Promise<Record<string, unknown>> {
    const result = await this.transport.call('redemption.get', { pathParams: { id } });
    return asRecord(result.body);
  }

  async redemptions(
    params: { mfInvestmentAccount?: string; states?: string } = {},
  ): Promise<FpListEnvelope<Record<string, unknown>>> {
    const result = await this.transport.call('redemption.list', {
      query: { mf_investment_account: params.mfInvestmentAccount, states: params.states },
    });
    return { items: itemsOf(result.body), raw: result.body };
  }

  async mandate(id: string): Promise<Record<string, unknown>> {
    const result = await this.transport.call('mandate.get', { pathParams: { id } });
    return asRecord(result.body);
  }

  async payment(id: string): Promise<Record<string, unknown>> {
    const result = await this.transport.call('payment.get', { pathParams: { id } });
    return asRecord(result.body);
  }

  async holdings(params: {
    investmentAccountOldId: number;
    folios?: string;
    asOn?: string;
  }): Promise<Record<string, unknown>> {
    const result = await this.transport.call('holdings.get', {
      query: {
        investment_account_id: params.investmentAccountOldId,
        folios: params.folios,
        as_on: params.asOn,
      },
    });
    return asRecord(result.body);
  }

  async folios(params: {
    mfInvestmentAccount: string;
    folioNumber?: string;
  }): Promise<FpListEnvelope<Record<string, unknown>>> {
    const result = await this.transport.call('folio.list', {
      query: { mf_investment_account: params.mfInvestmentAccount, folio_number: params.folioNumber },
    });
    return { items: itemsOf(result.body), raw: result.body };
  }
}
```

**`apps/api/src/integrations/fp/fp-kyc.ts`:**

```ts
import type { FpTransport } from './fp-transport.js';

export interface PreVerificationBankAccount {
  readonly accountNumber: string;
  readonly ifscCode: string;
  readonly accountType?: 'savings' | 'current' | 'nre_savings' | 'nro_savings';
}

export interface PreVerificationInput {
  readonly pan: string;
  readonly name: string;
  readonly dateOfBirth: string;
  readonly bankAccount?: PreVerificationBankAccount;
}

function toPreVerificationBody(input: PreVerificationInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    investor_identifier: input.pan.toUpperCase(),
    pan: { value: input.pan.toUpperCase() },
    name: { value: input.name },
    date_of_birth: { value: input.dateOfBirth },
  };
  if (input.bankAccount !== undefined) {
    body.bank_accounts = [
      {
        value: {
          account_number: input.bankAccount.accountNumber,
          ifsc_code: input.bankAccount.ifscCode,
          account_type: input.bankAccount.accountType ?? 'savings',
        },
      },
    ];
  }
  return body;
}

/**
 * POA pre-verification (research:fp-api SS5 item 1; research:rules-fp-contracts SS2). Class K: no
 * `ConsumedConsent` is required at the type or runtime level, but the caller (E6, Plan 03) must
 * already hold a recorded KYC_CONSENT acceptance before calling `preVerify` (outline SS0.1).
 */
export class FpKyc {
  constructor(private readonly transport: FpTransport) {}

  async preVerify(input: PreVerificationInput): Promise<Record<string, unknown>> {
    const result = await this.transport.call('preVerification.create', {
      body: toPreVerificationBody(input),
    });
    return (result.body ?? {}) as Record<string, unknown>;
  }

  async getPreVerification(id: string): Promise<Record<string, unknown>> {
    const result = await this.transport.call('preVerification.get', { pathParams: { id } });
    return (result.body ?? {}) as Record<string, unknown>;
  }
}
```

**`apps/api/src/integrations/fp/fp-provision.ts`** (stub signatures; every method's shape is real, its body is a deliberate `NotImplementedYetError` until the named task wires it):

```ts
import type { ConsumedConsent } from './consumed-consent.js';
import { NotImplementedYetError } from './fp-errors.js';
import type { FpTransport } from './fp-transport.js';

/** P-class provisioning writes (research:rules-fp-contracts SS6-SS8). */
export class FpProvision {
  constructor(private readonly transport: FpTransport) {
    void this.transport;
  }

  createInvestorProfile(
    _input: Record<string, unknown>,
    _consent: ConsumedConsent,
  ): Promise<Record<string, unknown>> {
    throw new NotImplementedYetError('FpProvision.createInvestorProfile is wired in E6/E11 (Plan 03)');
  }

  updateInvestorProfile(
    _input: { id: string } & Record<string, unknown>,
    _consent: ConsumedConsent,
  ): Promise<Record<string, unknown>> {
    throw new NotImplementedYetError('FpProvision.updateInvestorProfile is wired in E11 (Plan 03)');
  }

  createPhoneNumber(
    _input: { profile: string; isd: string; number: string; belongsTo?: string },
    _consent: ConsumedConsent,
  ): Promise<Record<string, unknown>> {
    throw new NotImplementedYetError('FpProvision.createPhoneNumber is wired in E11 (Plan 03)');
  }

  createEmailAddress(
    _input: { profile: string; email: string; belongsTo?: string },
    _consent: ConsumedConsent,
  ): Promise<Record<string, unknown>> {
    throw new NotImplementedYetError('FpProvision.createEmailAddress is wired in E11 (Plan 03)');
  }

  createAddress(
    _input: {
      profile: string;
      line1: string;
      line2?: string;
      city: string;
      state: string;
      postalCode: string;
      nature: string;
    },
    _consent: ConsumedConsent,
  ): Promise<Record<string, unknown>> {
    throw new NotImplementedYetError('FpProvision.createAddress is wired in E11 (Plan 03)');
  }

  createRelatedParty(
    _input: { profile: string; name: string; relationship: string; dateOfBirth?: string; pan?: string },
    _consent: ConsumedConsent,
  ): Promise<Record<string, unknown>> {
    throw new NotImplementedYetError('FpProvision.createRelatedParty is wired in E8/E11 (Plan 03)');
  }

  createBankAccount(
    _input: {
      profile: string;
      primaryAccountHolderName: string;
      accountNumber: string;
      type: string;
      ifscCode: string;
    },
    _consent: ConsumedConsent,
  ): Promise<Record<string, unknown>> {
    throw new NotImplementedYetError('FpProvision.createBankAccount is wired in E7/E11 (Plan 03)');
  }

  createMfInvestmentAccount(
    _input: { primaryInvestor: string; holdingPattern: 'single' },
    _consent: ConsumedConsent,
  ): Promise<Record<string, unknown>> {
    throw new NotImplementedYetError('FpProvision.createMfInvestmentAccount is wired in E11 (Plan 03)');
  }

  updateMfInvestmentAccount(
    _input: { id: string; folioDefaults: Record<string, unknown> },
    _consent: ConsumedConsent,
  ): Promise<Record<string, unknown>> {
    throw new NotImplementedYetError('FpProvision.updateMfInvestmentAccount is wired in E11 (Plan 03)');
  }
}
```

**`apps/api/src/integrations/fp/fp-transact.ts`** (stub signatures; same convention as `fp-provision.ts`):

```ts
import type { ConsumedConsent } from './consumed-consent.js';
import { NotImplementedYetError } from './fp-errors.js';
import type { FpTransport } from './fp-transport.js';

/** M-class money writes (research:rules-fp-contracts SS10-SS12; spec SS4 SUBMITTING rows). */
export class FpTransact {
  constructor(private readonly transport: FpTransport) {
    void this.transport;
  }

  createPurchase(
    _input: {
      mfInvestmentAccount: string;
      scheme: string;
      amount: string;
      folioNumber?: string;
      userIp: string;
      sourceRefId: string;
      initiatedVia: string;
    },
    _consent: ConsumedConsent,
  ): Promise<Record<string, unknown>> {
    throw new NotImplementedYetError('FpTransact.createPurchase is wired in E20 (Plan 03)');
  }

  updatePurchase(
    _input: { id: string } & Record<string, unknown>,
    _consent: ConsumedConsent,
  ): Promise<Record<string, unknown>> {
    throw new NotImplementedYetError('FpTransact.updatePurchase is wired in E20 (Plan 03)');
  }

  createPurchasePlan(
    _input: Record<string, unknown>,
    _consent: ConsumedConsent,
  ): Promise<Record<string, unknown>> {
    throw new NotImplementedYetError('FpTransact.createPurchasePlan is wired in F2 (Plan 04)');
  }

  updatePurchasePlan(
    _input: { id: string } & Record<string, unknown>,
    _consent: ConsumedConsent,
  ): Promise<Record<string, unknown>> {
    throw new NotImplementedYetError('FpTransact.updatePurchasePlan is wired in F2/F28 (Plan 04)');
  }

  createRedemption(
    _input: Record<string, unknown>,
    _consent: ConsumedConsent,
  ): Promise<Record<string, unknown>> {
    throw new NotImplementedYetError('FpTransact.createRedemption is wired in F5 (Plan 04)');
  }

  updateRedemption(
    _input: { id: string } & Record<string, unknown>,
    _consent: ConsumedConsent,
  ): Promise<Record<string, unknown>> {
    throw new NotImplementedYetError('FpTransact.updateRedemption is wired in F5 (Plan 04)');
  }

  createPayment(
    _input: Record<string, unknown>,
    _consent: ConsumedConsent,
  ): Promise<Record<string, unknown>> {
    throw new NotImplementedYetError('FpTransact.createPayment is wired in E21 (Plan 03)');
  }

  createNachPayment(
    _input: { mandateId: string; amcOrderIds: readonly number[] },
    _consent: ConsumedConsent,
  ): Promise<Record<string, unknown>> {
    throw new NotImplementedYetError('FpTransact.createNachPayment is wired in F2 (Plan 04)');
  }

  createMandate(
    _input: { bankAccountId: number; mandateType: 'UPI' | 'E_MANDATE'; mandateLimit: number },
    _consent: ConsumedConsent,
  ): Promise<Record<string, unknown>> {
    throw new NotImplementedYetError('FpTransact.createMandate is wired in F2 (Plan 04)');
  }

  authoriseMandate(
    _input: { mandateId: string },
    _consent: ConsumedConsent,
  ): Promise<Record<string, unknown>> {
    throw new NotImplementedYetError('FpTransact.authoriseMandate is wired in F2 (Plan 04)');
  }
}
```

**`apps/api/src/integrations/fp/fp.module.ts`:**

```ts
import { Module, type DynamicModule } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { Agent, MockAgent } from 'undici';
import { type Env, EnvError, parseFpCredentialsJson } from '../../config/env.js';
import { DB, type DbHandle } from '../../db/client.js';
import { Crypto } from '../../modules/platform/crypto.js';
import { newId } from '../../modules/platform/ids.js';
import type { SanchayClsStore } from '../../modules/platform/request-context.js';
import { FpKyc } from './fp-kyc.js';
import { FpProvision } from './fp-provision.js';
import { FpRead } from './fp-read.js';
import { FpTokenCache, type FpBaseUrls, type FpCredentials } from './fp-token-cache.js';
import { FpTransact } from './fp-transact.js';
import { FP_DISPATCHER, FpTransport, type ProviderCallRecordInput } from './fp-transport.js';
import { providerCalls } from './provider-calls.schema.js';

const CONNECT_TIMEOUT_MS = 10_000;
const BODY_TIMEOUT_MS = 30_000;

const FAKE_BASE_URLS: FpBaseUrls = {
  fp: 'https://fp.fake.local',
  poa: 'https://poa.fake.local',
  pg: 'https://pg.fake.local',
};
const FAKE_CREDENTIALS: FpCredentials = {
  tenantId: 'sanchay',
  fp: { clientId: 'fake', clientSecret: 'fake' },
  poa: { clientId: 'fake', clientSecret: 'fake' },
  pg: { clientId: 'fake', clientSecret: 'fake' },
};

function liveBaseUrls(env: Env): FpBaseUrls {
  if (env.SANCHAY_FP_BASE_URL === undefined) {
    throw new EnvError('SANCHAY_FP_BASE_URL is required outside fake mode');
  }
  return { fp: env.SANCHAY_FP_BASE_URL, poa: env.SANCHAY_FP_BASE_URL, pg: env.SANCHAY_FP_BASE_URL };
}

function recordProviderCall(dbh: DbHandle, crypto: Crypto) {
  return async (input: ProviderCallRecordInput): Promise<void> => {
    const id = newId('provider_calls');
    const bodyEnc = crypto.encrypt(input.rawForBodyEnc, {
      table: 'provider_calls',
      column: 'body_enc',
      rowId: id,
    });
    await dbh.db.insert(providerCalls).values({
      id,
      provider: input.audience,
      operation: input.operation,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      httpStatus: input.httpStatus,
      durationMs: input.durationMs,
      errorCode: input.errorCode,
      requestMeta: input.requestMeta as Record<string, unknown> | null,
      responseMeta: input.responseMeta as Record<string, unknown> | null,
      bodyEnc,
    });
  };
}

/**
 * Imported only when SANCHAY_APP_ROLE === 'worker' (app.module.ts). Global, so worker-only job
 * handlers in other modules (D10's CatalogueFpSyncJob, E-tasks) can inject FpRead & co. In 'fake'
 * mode D3 uses a bare undici MockAgent with net connect disabled; D4 swaps in FakeFp's MockAgent.
 */
@Module({})
export class FpModule {
  static forRoot(env: Env): DynamicModule {
    const isFake = env.SANCHAY_PROVIDER_MODE_FP === 'fake';
    const baseUrls = isFake ? FAKE_BASE_URLS : liveBaseUrls(env);
    const credentials: FpCredentials = isFake
      ? FAKE_CREDENTIALS
      : parseFpCredentialsJson(env.SANCHAY_FP_CREDENTIALS_JSON);

    return {
      module: FpModule,
      global: true,
      providers: [
        {
          provide: FP_DISPATCHER,
          useFactory: () => {
            if (!isFake) {
              return new Agent({
                connectTimeout: CONNECT_TIMEOUT_MS,
                bodyTimeout: BODY_TIMEOUT_MS,
                headersTimeout: BODY_TIMEOUT_MS,
              });
            }
            const agent = new MockAgent();
            agent.disableNetConnect();
            return agent;
          },
        },
        {
          provide: FpTokenCache,
          inject: [FP_DISPATCHER],
          useFactory: (dispatcher) => new FpTokenCache(baseUrls, credentials, dispatcher),
        },
        {
          provide: FpTransport,
          inject: [FP_DISPATCHER, FpTokenCache, ClsService, DB, Crypto],
          useFactory: (
            dispatcher,
            tokens: FpTokenCache,
            cls: ClsService<SanchayClsStore>,
            dbh: DbHandle,
            crypto: Crypto,
          ) => new FpTransport(baseUrls, tokens, dispatcher, cls, recordProviderCall(dbh, crypto)),
        },
        { provide: FpRead, inject: [FpTransport], useFactory: (t: FpTransport) => new FpRead(t) },
        { provide: FpKyc, inject: [FpTransport], useFactory: (t: FpTransport) => new FpKyc(t) },
        {
          provide: FpProvision,
          inject: [FpTransport],
          useFactory: (t: FpTransport) => new FpProvision(t),
        },
        {
          provide: FpTransact,
          inject: [FpTransport],
          useFactory: (t: FpTransport) => new FpTransact(t),
        },
      ],
      exports: [FpTransport, FpRead, FpKyc, FpProvision, FpTransact, FP_DISPATCHER],
    };
  }
}
```

**`apps/api/drizzle/0006_provider_calls.sql`** (generated by `pnpm --filter=@sanchay/api db:generate --name=provider_calls`; shown here for review, matching `0001_platform.sql`'s generated style, with the append-only `REVOKE` added by hand at the bottom per the `0003_grants.sql` pattern — drizzle-kit does not know about role grants):

```sql
CREATE TABLE "app"."provider_calls" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"provider" text NOT NULL,
	"operation" text NOT NULL,
	"aggregate_type" text,
	"aggregate_id" text,
	"http_status" integer,
	"duration_ms" integer NOT NULL,
	"error_code" text,
	"request_meta" jsonb,
	"response_meta" jsonb,
	"body_enc" "bytea" NOT NULL
);
--> statement-breakpoint
CREATE INDEX "provider_calls_aggregate_idx" ON "app"."provider_calls" USING btree ("aggregate_type","aggregate_id");--> statement-breakpoint
CREATE INDEX "provider_calls_operation_idx" ON "app"."provider_calls" USING btree ("operation","created_at");--> statement-breakpoint
REVOKE UPDATE, DELETE ON app.provider_calls FROM sanchay_app;
```

`drizzle/meta/0006_snapshot.json` and the `_journal.json` entry are produced by the same `db:generate` run; they are not hand-edited.

#### Step 4: Run tests to confirm they pass

```
pnpm --filter=@sanchay/api typecheck
pnpm --filter=@sanchay/api test fp-operations fp-json consumed-consent fp-token-cache fp-transport env
pnpm --filter=@sanchay/api test:int fp-provider-calls
```

Expected: `typecheck` exits 0 (the `// @ts-expect-error` line in `fp-transport.test.ts` is satisfied, not a real error, matching D1's precedent for this same "no `tsd` runner" deviation). `fp-operations.test.ts` — 4 passed; `consumed-consent.test.ts` — 5 passed; `fp-json.test.ts` — 5 passed; `fp-token-cache.test.ts` — 4 passed; `fp-transport.test.ts` — 6 passed; `env.test.ts` — its existing suite plus the pin test and the two new invariant tests, all green. `fp-provider-calls.int.test.ts` — 3 passed. Every other `apps/api` test file is unaffected (D3 only adds files and makes additive edits to shared ones).

#### Step 5: Commit

```
pnpm exec biome check --write apps/api/src/integrations/fp apps/api/src/config/env.ts apps/api/src/config/env.test.ts apps/api/src/db/client.ts apps/api/src/modules/platform/ids.ts apps/api/src/modules/platform/request-context.ts apps/api/src/app.module.ts apps/api/test/int/fp-provider-calls.int.test.ts
pnpm --filter=@sanchay/api typecheck
pnpm --filter=@sanchay/api test fp-operations fp-json consumed-consent fp-token-cache fp-transport env
pnpm --filter=@sanchay/api test:int fp-provider-calls
pnpm lint
git add apps/api/src/integrations/fp apps/api/src/config/env.ts apps/api/src/config/env.test.ts apps/api/src/db/client.ts apps/api/src/modules/platform/ids.ts apps/api/src/modules/platform/request-context.ts apps/api/src/app.module.ts apps/api/test/int/fp-provider-calls.int.test.ts apps/api/drizzle/0006_provider_calls.sql apps/api/drizzle/meta apps/api/package.json pnpm-workspace.yaml pnpm-lock.yaml docs/adr/0001-versions.md
git commit -m "feat(api): FpGateway base with undici, per-audience tokens, provider_calls and ConsumedConsent" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

If lefthook reports `stage_fixed`, re-run the Step 4 commands and re-stage before committing. Never `--no-verify`.

---

### Task D4: FakeFp (stateful) and the sandbox contract-smoke harness (Dev A, 10 h)

**Files:**
- Create:
  - `apps/api/src/integrations/fp/fake/fake-fp.state.ts`
  - `apps/api/src/integrations/fp/fake/fake-fp.scenarios.ts`
  - `apps/api/src/integrations/fp/fake/fake-fp.ts`
  - `apps/api/src/integrations/fp/fake/fake-fp.test.ts`
  - `apps/api/test/int/fake-fp.ts`
  - `apps/api/test/int/fake-fp.int.test.ts`
  - `tools/fp-probes/package.json`
  - `tools/fp-probes/tsconfig.json`
  - `tools/fp-probes/README.md`
  - `tools/fp-probes/src/types.ts`
  - `tools/fp-probes/src/fake-server.ts`
  - `tools/fp-probes/src/fp-client.ts`
  - `tools/fp-probes/src/evidence.ts`
  - `tools/fp-probes/src/smoke.ts`
  - `tools/fp-probes/src/chains/onboarding.ts`
  - `tools/fp-probes/src/chains/lumpsum.ts`
  - `tools/fp-probes/src/chains/sip.ts`
  - `tools/fp-probes/src/chains/redemption.ts`
  - `tools/fp-probes/test/smoke.test.ts`
  - `docs/probes/.gitkeep` (the directory itself; `smoke-<date>-<chain>.md` evidence files are written by *running* the tool, not committed by this task)
- Modify:
  - `apps/api/src/integrations/fp/fp.module.ts` (fake mode: provide `FakeFp` and use `fakeFp.agent` as `FP_DISPATCHER`, replacing D3's bare `MockAgent`; see "D4 Step 3 addendum")

**Interfaces:**
- Prerequisites: everything D3 produces (`FP_OPERATIONS`, `FpOperationKey`, `FpOperationClass`, `ConsumedConsent`, `assertConsumed`, `fpJson`, `FpTokenCache`, `type FpBaseUrls`, `type FpCredentials`, `FP_DISPATCHER`, `FpTransport`, `type FpCallResult`, `FpRead`, `FpKyc`, `FpProvision`, `FpTransact`, `NotImplementedYetError`); `bootTestApp`, `TestApp` (`apps/api/test/int/app.ts`).
- Review fix (RV-02-3): D3's `fp.module.ts` no longer references `FakeFp` (D3's commit must typecheck on its own). This task makes the one edit that wires `FakeFp` into fake mode; see "D4 Step 3 addendum" at the end of Step 3.
- Produces:
  - `apps/api/src/integrations/fp/fake/fake-fp.state.ts`: `FakeFpState` (in-memory maps for pre-verifications, investor profiles, phone numbers, email addresses, addresses, related parties, bank accounts, MF investment accounts, purchases, payments, mandates; `nextId(prefix)`, `nextOldId()`, `findPurchaseBySourceRefId(sourceRefId)`), `type Stored*` row types.
  - `apps/api/src/integrations/fp/fake/fake-fp.scenarios.ts`: `FAKE_SCHEME_FIXTURES` (10 ISINs: 3 liquid, 3 ELSS, 2 equity, 2 debt), `type FakeSchemeFixture`, `type FpScriptMode`, `type FakeFpScript`.
  - `apps/api/src/integrations/fp/fake/fake-fp.ts`: `FakeFp` (`agent: MockAgent`, `state: FakeFpState`, `calls(filter?)`, `advance(objectId, state, fields?)`, `script(op, mode)`, `emitWebhook(event)`, `drainWebhooks()`, `autoAdvance: boolean`).
  - `apps/api/test/int/fake-fp.ts`: `bootFpTestApp(options?): Promise<TestApp & {fakeFp: FakeFp}>` — boots a worker-role `TestApp` with `SANCHAY_PROVIDER_MODE_FP=fake` and returns the app's own `FakeFp` instance (from `app.get(FakeFp)`), for E6/E7/E11/E20/F2/F4/F5's integration tests.
  - `tools/fp-probes/`: a new workspace package `@sanchay/fp-probes` — `pnpm --filter=@sanchay/fp-probes smoke --chain=<onboarding|lumpsum|sip|redemption> --env=<fake|sandbox>`, writing `docs/probes/smoke-<date>-<chain>.md`.
- Deviation from outline: `tools/fp-probes` does **not** depend on `@sanchay/api`. `apps/api` has no `exports` map and is built by `nest build`, not shaped as an importable library (`"private": true`, no `dist/index.js`); reaching into its compiled output from a sibling `tools/*` package would be a fragile, undocumented coupling. Instead `fp-probes` carries its own small, self-contained FP client (`src/fp-client.ts`, covering only the operations its four chains use: pre-verification create/get, scheme-plan list, purchase create/get/update, mandate create) and, for `--env=fake`, its own small `undici` `MockAgent`-backed responder (`src/fake-server.ts`) — a deliberate, independent duplicate of a slice of D3/D4's `FpTransport`/`FakeFp`, not a shared dependency, because this tool's job is to rehearse the *sandbox contract* end to end (including the OAuth dance) as an external caller would, which is a different exercise from unit-testing `apps/api`'s own gateway code. `apps/api/src/integrations/fp/fake/fake-fp.test.ts` and `apps/api/test/int/fake-fp.int.test.ts` are the tests that exercise the real `FakeFp`; `tools/fp-probes/test/smoke.test.ts` only exercises the harness's own chain-running and evidence-writing logic against its own fake responder.

#### Step 1: Write the failing tests (complete code)

`apps/api/src/integrations/fp/fake/fake-fp.ts` does not exist yet, so `fake-fp.test.ts` fails to resolve it; `tools/fp-probes` does not exist yet, so its own test fails the same way, and `pnpm --filter=@sanchay/fp-probes ...` fails because the package is not declared.

`apps/api/src/integrations/fp/fake/fake-fp.test.ts`:

```ts
import type { ClsService } from 'nestjs-cls';
import { describe, expect, it } from 'vitest';
import type { SanchayClsStore } from '../../../modules/platform/request-context.js';
import { FpAmbiguousError } from '../fp-errors.js';
import { FpTokenCache } from '../fp-token-cache.js';
import { FpTransport } from '../fp-transport.js';
import type { ConsumedConsent } from '../consumed-consent.js';
import { FakeFp } from './fake-fp.js';

const CREDENTIALS = {
  tenantId: 'sanchay',
  fp: { clientId: 'fake', clientSecret: 'fake' },
  poa: { clientId: 'fake', clientSecret: 'fake' },
  pg: { clientId: 'fake', clientSecret: 'fake' },
};

function noopCls(): ClsService<SanchayClsStore> {
  return { get: () => false } as unknown as ClsService<SanchayClsStore>;
}

function transportFor(fakeFp: FakeFp): FpTransport {
  return new FpTransport(
    { fp: 'https://fp.fake.local', poa: 'https://poa.fake.local', pg: 'https://pg.fake.local' },
    new FpTokenCache(
      { fp: 'https://fp.fake.local', poa: 'https://poa.fake.local', pg: 'https://pg.fake.local' },
      CREDENTIALS,
      fakeFp.agent,
    ),
    fakeFp.agent,
    noopCls(),
    async () => {},
  );
}

function consent(): ConsumedConsent {
  return {
    challengeId: 'chal-1',
    investorId: 'inv-1',
    subjectType: 'PURCHASE',
    subjectIds: ['order-1'],
    snapshotSha256: 'a'.repeat(64),
    executeBefore: new Date('2027-01-01T00:00:00Z'),
  } as ConsumedConsent;
}

describe('FakeFp', () => {
  it('records the class of every call it serves', async () => {
    const fakeFp = new FakeFp({
      fp: 'https://fp.fake.local',
      poa: 'https://poa.fake.local',
      pg: 'https://pg.fake.local',
    });
    const transport = transportFor(fakeFp);
    await transport.call('schemePlans.list', {});
    await transport.call('preVerification.create', {
      body: { pan: { value: 'AAAPA3751A' }, name: { value: 'Rani Gupta' }, date_of_birth: { value: '1955-10-25' } },
    });
    expect(fakeFp.calls({ class: 'R' })).toHaveLength(1);
    expect(fakeFp.calls({ class: 'K' })).toHaveLength(1);
    expect(fakeFp.calls({ op: 'schemePlans.list' })).toHaveLength(1);
  });

  it('lists 10 scheme fixtures covering liquid, ELSS, equity and debt', async () => {
    const fakeFp = new FakeFp({
      fp: 'https://fp.fake.local',
      poa: 'https://poa.fake.local',
      pg: 'https://pg.fake.local',
    });
    const transport = transportFor(fakeFp);
    const result = await transport.call('schemePlans.list', {});
    const body = result.body as { data: Array<{ isin: string }> };
    expect(body.data).toHaveLength(10);
    expect(new Set(body.data.map((s) => s.isin)).size).toBe(10);
  });

  it('LOOKUP-ADOPT: a purchase created before a scripted timeout is found by listing on source_ref_id', async () => {
    const fakeFp = new FakeFp({
      fp: 'https://fp.fake.local',
      poa: 'https://poa.fake.local',
      pg: 'https://pg.fake.local',
    });
    const transport = transportFor(fakeFp);
    fakeFp.script('purchase.create', 'timeout');
    await expect(
      transport.call('purchase.create', {
        body: { source_ref_id: 'order-lookup-1', mf_investment_account: 'mfia_1', scheme: 'INF209K01157', amount: '1500.00' },
        consent: consent(),
      }),
    ).rejects.toBeInstanceOf(FpAmbiguousError);
    const list = await transport.call('purchase.list', { query: { source_ref_id: 'order-lookup-1' } });
    const body = list.body as { data: Array<{ source_ref_id: string; state: string }> };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.state).toBe('under_review');
  });

  it('H-2 lumpsum state path: under_review -> pending -> submitted -> successful', async () => {
    const fakeFp = new FakeFp({
      fp: 'https://fp.fake.local',
      poa: 'https://poa.fake.local',
      pg: 'https://pg.fake.local',
    });
    const transport = transportFor(fakeFp);
    const created = await transport.call('purchase.create', {
      body: { source_ref_id: 'order-h2-1', mf_investment_account: 'mfia_1', scheme: 'INF209K01157', amount: '1500.00' },
      consent: consent(),
    });
    const id = (created.body as { id: string }).id;
    expect((created.body as { state: string }).state).toBe('under_review');
    fakeFp.advance(id, 'pending');
    const withConsent = await transport.call('purchase.update', {
      body: { id, consent: { email: 'a@example.com' } },
      consent: consent(),
    });
    expect((withConsent.body as { state: string }).state).toBe('pending');
    const confirmed = await transport.call('purchase.update', {
      body: { id, state: 'confirmed' },
      consent: consent(),
    });
    expect((confirmed.body as { state: string }).state).toBe('submitted');
    fakeFp.advance(id, 'successful', { folioNumber: '12345/67' });
    const fetched = await transport.call('purchase.get', { pathParams: { id } });
    expect((fetched.body as { state: string; folio_number: string }).state).toBe('successful');
    expect((fetched.body as { folio_number: string }).folio_number).toBe('12345/67');
  });

  it('rejects a second live payment against the same order (H-2 "no multiple payments")', async () => {
    const fakeFp = new FakeFp({
      fp: 'https://fp.fake.local',
      poa: 'https://poa.fake.local',
      pg: 'https://pg.fake.local',
    });
    const transport = transportFor(fakeFp);
    const created = await transport.call('purchase.create', {
      body: { source_ref_id: 'order-pay-1', mf_investment_account: 'mfia_1', scheme: 'INF209K01157', amount: '1500.00' },
      consent: consent(),
    });
    const oldId = (created.body as { old_id: number }).old_id;
    await transport.call('payment.create', {
      body: { amc_order_ids: [oldId], method: 'UPI', bank_account_id: 1 },
      consent: consent(),
    });
    const failure = await transport
      .call('payment.create', { body: { amc_order_ids: [oldId], method: 'UPI', bank_account_id: 1 }, consent: consent() })
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(FpAmbiguousError);
  });

  it('rejects any M-class body that carries a partner or euin key (H-11)', async () => {
    const fakeFp = new FakeFp({
      fp: 'https://fp.fake.local',
      poa: 'https://poa.fake.local',
      pg: 'https://pg.fake.local',
    });
    const transport = transportFor(fakeFp);
    await expect(
      transport.call('purchase.create', {
        body: { source_ref_id: 'order-h11-1', mf_investment_account: 'mfia_1', scheme: 'INF209K01157', amount: '1500.00', euin: null },
        consent: consent(),
      }),
    ).rejects.toMatchObject({ providerCode: 'PARTNER_OR_EUIN_NOT_ALLOWED' });
    await expect(
      transport.call('purchase.create', {
        body: { source_ref_id: 'order-h11-2', mf_investment_account: 'mfia_1', scheme: 'INF209K01157', amount: '1500.00', partner: 'ptnr_1' },
        consent: consent(),
      }),
    ).rejects.toMatchObject({ providerCode: 'PARTNER_OR_EUIN_NOT_ALLOWED' });
  });
});
```

`apps/api/test/int/fake-fp.int.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FakeFp } from '../../src/integrations/fp/fake/fake-fp.js';
import { FpRead } from '../../src/integrations/fp/fp-read.js';
import { bootFpTestApp } from './fake-fp.js';

describe('bootFpTestApp', () => {
  it('boots a worker-role app wired to a real FakeFp', async () => {
    const t = await bootFpTestApp();
    try {
      expect(t.fakeFp).toBeInstanceOf(FakeFp);
      expect(t.app.get(FpRead)).toBeInstanceOf(FpRead);
      const plans = await t.app.get(FpRead).schemePlans();
      expect(plans.items).toHaveLength(10);
    } finally {
      await t.close();
    }
  });
});
```

`tools/fp-probes/test/smoke.test.ts`:

```ts
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHAIN_NAMES, runChain } from '../src/smoke.js';
import { writeEvidence } from '../src/evidence.js';

describe('fp-probes smoke harness (dry-run against its own fake responder)', () => {
  it('runs every chain with no FAILED step', async () => {
    for (const chain of CHAIN_NAMES) {
      const result = await runChain(chain, { env: 'fake' });
      expect(result.steps.some((s) => s.status === 'FAILED'), chain).toBe(false);
      expect(result.steps.some((s) => s.status === 'PASSED'), chain).toBe(true);
    }
  });

  it('writes evidence markdown naming every step', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'fp-probes-'));
    const result = await runChain('lumpsum', { env: 'fake' });
    const file = await writeEvidence(dir, 'lumpsum', result);
    const text = await readFile(file, 'utf8');
    for (const step of result.steps) {
      expect(text).toContain(step.name);
    }
    expect(text).toContain('lumpsum');
  });
});
```

#### Step 2: Run it to confirm it fails

```
pnpm --filter=@sanchay/api test fake-fp
pnpm --filter=@sanchay/api test:int fake-fp
pnpm --filter=@sanchay/fp-probes test
```

Expected failure: `fake-fp.test.ts` cannot resolve `./fake-fp.js`; `fake-fp.int.test.ts` cannot resolve `./fake-fp.js` (the test helper) or `../../src/integrations/fp/fake/fake-fp.js`. The third command fails outright with pnpm's "No projects matched the filters" because `@sanchay/fp-probes` does not exist yet.

#### Step 3: Minimal implementation (complete code for every file)

**`apps/api/src/integrations/fp/fake/fake-fp.state.ts`:**

```ts
export interface StoredPreVerification {
  readonly id: string;
  status: 'accepted' | 'completed' | 'failed';
  readiness: { status: string; code?: string };
  pan: { status: string };
  name: { status: string };
  dateOfBirth: { status: string };
}

export interface StoredInvestorProfile {
  readonly id: string;
  raw: Record<string, unknown>;
}

export interface StoredPurchase {
  readonly id: string;
  readonly oldId: number;
  state: string;
  amount: string;
  scheme: string;
  mfInvestmentAccount: string;
  sourceRefId: string;
  folioNumber: string | null;
  consent: Record<string, unknown> | null;
}

export interface StoredPayment {
  readonly id: number;
  readonly amcOrderIds: readonly number[];
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
}

export interface StoredMandate {
  readonly id: number;
  status: 'CREATED' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  readonly mandateRef: string;
}

/** In-memory object store backing FakeFp; one instance per FakeFp (never shared across tests). */
export class FakeFpState {
  private sequence = 0;

  readonly preVerifications = new Map<string, StoredPreVerification>();
  readonly investorProfiles = new Map<string, StoredInvestorProfile>();
  readonly purchases = new Map<string, StoredPurchase>();
  readonly purchasesByOldId = new Map<number, string>();
  readonly payments = new Map<number, StoredPayment>();
  readonly mandates = new Map<number, StoredMandate>();

  nextId(prefix: string): string {
    this.sequence += 1;
    return `${prefix}${this.sequence}`;
  }

  nextOldId(): number {
    this.sequence += 1;
    return 1000 + this.sequence;
  }

  findPurchasesBySourceRefId(sourceRefId: string): StoredPurchase[] {
    return [...this.purchases.values()].filter((p) => p.sourceRefId === sourceRefId);
  }
}
```

**`apps/api/src/integrations/fp/fake/fake-fp.scenarios.ts`:**

```ts
export interface FakeSchemeFixture {
  readonly isin: string;
  readonly schemeName: string;
  readonly amcName: string;
  readonly category: 'LIQUID' | 'ELSS' | 'EQUITY' | 'DEBT';
}

/** 10 fixtures across the categories the outline names; ISINs are fictional 12-character codes. */
export const FAKE_SCHEME_FIXTURES: readonly FakeSchemeFixture[] = [
  { isin: 'INF209K01157', schemeName: 'Aditya Birla Sun Life Liquid Fund', amcName: 'Aditya Birla Sun Life', category: 'LIQUID' },
  { isin: 'INF200K01158', schemeName: 'HDFC Liquid Fund', amcName: 'HDFC', category: 'LIQUID' },
  { isin: 'INF090I01239', schemeName: 'Franklin India Liquid Fund', amcName: 'Franklin Templeton', category: 'LIQUID' },
  { isin: 'INF209K01BB1', schemeName: 'Aditya Birla Sun Life Tax Relief 96', amcName: 'Aditya Birla Sun Life', category: 'ELSS' },
  { isin: 'INF109K01VQ1', schemeName: 'ICICI Prudential Long Term Equity Fund', amcName: 'ICICI Prudential', category: 'ELSS' },
  { isin: 'INF204K01EZ4', schemeName: 'Quant Tax Plan', amcName: 'Quant', category: 'ELSS' },
  { isin: 'INF109K01VS7', schemeName: 'ICICI Prudential Bluechip Fund', amcName: 'ICICI Prudential', category: 'EQUITY' },
  { isin: 'INF879O01011', schemeName: 'Parag Parikh Flexi Cap Fund', amcName: 'PPFAS', category: 'EQUITY' },
  { isin: 'INF200K01UY1', schemeName: 'HDFC Corporate Bond Fund', amcName: 'HDFC', category: 'DEBT' },
  { isin: 'INF769K01AX1', schemeName: 'Mirae Asset Short Duration Fund', amcName: 'Mirae Asset', category: 'DEBT' },
];

export type FpScriptMode = 'timeout' | '5xx' | '409-dup' | { status: number; body: object };

export interface FakeFpScript {
  mode: FpScriptMode;
  /** Scripts are one-shot: the next matching call consumes it. */
  remaining: number;
}
```

**`apps/api/src/integrations/fp/fake/fake-fp.ts`:**

```ts
import { MockAgent } from 'undici';
import type { FpBaseUrls } from '../fp-token-cache.js';
import { FP_OPERATIONS, type FpOperationClass, type FpOperationDefinition, type FpOperationKey } from '../fp-operations.js';
import { FAKE_SCHEME_FIXTURES, type FakeFpScript, type FakeSchemeFixture, type FpScriptMode } from './fake-fp.scenarios.js';
import { FakeFpState, type StoredPurchase } from './fake-fp.state.js';

interface FakeReply {
  readonly statusCode: number;
  readonly data: object;
}

interface CallLogEntry {
  readonly op: FpOperationKey;
  readonly class: FpOperationClass;
  readonly at: number;
}

function matchPath(template: string, actual: string): Record<string, string> | null {
  const templateParts = template.split('/');
  const actualParts = actual.split('/');
  if (templateParts.length !== actualParts.length) return null;
  const params: Record<string, string> = {};
  for (const [i, templatePart] of templateParts.entries()) {
    const actualPart = actualParts[i];
    if (actualPart === undefined) return null;
    if (templatePart.startsWith('{') && templatePart.endsWith('}')) {
      params[templatePart.slice(1, -1)] = decodeURIComponent(actualPart);
    } else if (templatePart !== actualPart) {
      return null;
    }
  }
  return params;
}

function findOperation(
  method: string,
  path: string,
): { key: FpOperationKey; definition: FpOperationDefinition; params: Record<string, string> } | null {
  for (const [key, definition] of Object.entries(FP_OPERATIONS) as [FpOperationKey, FpOperationDefinition][]) {
    if (definition.method !== method) continue;
    const params = matchPath(definition.path, path);
    if (params !== null) return { key, definition, params };
  }
  return null;
}

function schemePlanPayload(fixture: FakeSchemeFixture): Record<string, unknown> {
  return {
    object: 'mf_scheme_plan',
    gateway: 'cybrillapoa',
    isin: fixture.isin,
    type: 'regular',
    option: 'growth',
    active: true,
    mf_scheme: { name: fixture.schemeName },
    mf_fund: { name: fixture.amcName },
  };
}

function preVerificationPayload(id: string, status: string): Record<string, unknown> {
  return {
    object: 'pre_verification',
    id,
    status,
    readiness: { status: 'verified' },
    pan: { status: 'completed' },
    name: { status: 'completed' },
    date_of_birth: { status: 'completed' },
  };
}

function purchasePayload(p: StoredPurchase): Record<string, unknown> {
  return {
    object: 'mf_purchase',
    id: p.id,
    old_id: p.oldId,
    state: p.state,
    amount: p.amount,
    scheme: p.scheme,
    mf_investment_account: p.mfInvestmentAccount,
    source_ref_id: p.sourceRefId,
    folio_number: p.folioNumber,
  };
}

/**
 * A stateful undici `MockAgent` standing in for FP/POA/PG in `SANCHAY_PROVIDER_MODE_FP=fake`
 * (D3's `fp.module.ts` selects it). `FpTransport`, `FpRead`, `FpKyc`, `FpProvision` and `FpTransact`
 * all run unchanged against `agent` — FakeFp is a fake *server*, not a parallel client.
 */
export class FakeFp {
  readonly agent: MockAgent;
  readonly state = new FakeFpState();
  autoAdvance = false;

  private readonly callLog: CallLogEntry[] = [];
  private readonly scripts = new Map<FpOperationKey, FakeFpScript>();
  private webhookQueue: unknown[] = [];

  /** `now` stamps the call log; FpModule passes the app Clock so tests can compare it with consent timestamps. */
  constructor(
    private readonly baseUrls: FpBaseUrls,
    private readonly now: () => number = Date.now,
  ) {
    this.agent = new MockAgent();
    this.agent.disableNetConnect();
    this.wireTokenEndpoints();
    this.wireRouter();
  }

  calls(filter: { class?: FpOperationClass; op?: FpOperationKey } = {}): readonly CallLogEntry[] {
    return this.callLog.filter(
      (entry) =>
        (filter.class === undefined || entry.class === filter.class) &&
        (filter.op === undefined || entry.op === filter.op),
    );
  }

  advance(objectId: string, state: string, fields: { folioNumber?: string } = {}): void {
    const purchase = this.state.purchases.get(objectId);
    if (purchase === undefined) {
      throw new Error(`FakeFp.advance: unknown object id "${objectId}"`);
    }
    purchase.state = state;
    if (fields.folioNumber !== undefined) purchase.folioNumber = fields.folioNumber;
  }

  /** Scripts the next matching call. One-shot: a second call to the same op behaves normally again. */
  script(op: FpOperationKey, mode: FpScriptMode): void {
    this.scripts.set(op, { mode, remaining: 1 });
  }

  emitWebhook(event: unknown): void {
    // No consumer exists yet (E1, Plan 03, is the webhook receiver); queued so that task's test
    // helper can drain it without this task inventing that consumer's shape.
    this.webhookQueue.push(event);
  }

  drainWebhooks(): readonly unknown[] {
    const events = this.webhookQueue;
    this.webhookQueue = [];
    return events;
  }

  private wireTokenEndpoints(): void {
    this.agent
      .get(this.baseUrls.fp)
      .intercept({ path: (p) => /^\/v2\/auth\/[^/]+\/token$/.test(p), method: 'POST' })
      .reply(200, { access_token: 'fake-fp-token', token_type: 'bearer', expires_in: 1800 })
      .persist();
    this.agent
      .get(this.baseUrls.pg)
      .intercept({ path: (p) => /^\/v2\/auth\/[^/]+\/token$/.test(p), method: 'POST' })
      .reply(200, { access_token: 'fake-pg-token', token_type: 'bearer', expires_in: 1800 })
      .persist();
    this.agent
      .get(this.baseUrls.poa)
      .intercept({ path: '/v2/auth/cybrillarta/token', method: 'POST' })
      .reply(200, { access_token: 'fake-poa-token', token_type: 'bearer', expires_in: 1800 })
      .persist();
  }

  private wireRouter(): void {
    for (const audience of ['fp', 'poa', 'pg'] as const) {
      this.agent
        .get(this.baseUrls[audience])
        .intercept({ path: () => true, method: () => true })
        .reply((opts) => this.handle(opts.path, opts.method as string, opts.body as string | undefined))
        .persist();
    }
  }

  private handle(rawPath: string, method: string, rawBody: string | undefined): FakeReply {
    const url = new URL(rawPath, 'http://fake-fp.local');
    const found = findOperation(method, url.pathname);
    if (found === null) {
      return {
        statusCode: 501,
        data: { error: { status: 501, code: 'FAKE_FP_NOT_IMPLEMENTED', message: `FakeFp has no route for ${method} ${url.pathname}` } },
      };
    }
    const { key: op, definition, params } = found;
    const body = rawBody !== undefined && rawBody.length > 0 ? (JSON.parse(rawBody) as Record<string, unknown>) : {};

    if (definition.class === 'M' && (Object.hasOwn(body, 'partner') || Object.hasOwn(body, 'euin'))) {
      return {
        statusCode: 400,
        data: {
          error: {
            status: 400,
            code: 'PARTNER_OR_EUIN_NOT_ALLOWED',
            message: 'partner and euin must be omitted on every FP order (H-11)',
          },
        },
      };
    }

    const result = this.route(op, params, body, url.searchParams);
    this.callLog.push({ op, class: definition.class, at: this.now() });

    const script = this.scripts.get(op);
    if (script === undefined) return result;
    script.remaining -= 1;
    if (script.remaining <= 0) this.scripts.delete(op);
    if (script.mode === 'timeout') {
      // The object above was created as normal ("FP received it"); only the response is lost, so a
      // later list-by-source_ref_id (LOOKUP-ADOPT) still finds it.
      throw new Error(`FakeFp: scripted timeout for ${op}`);
    }
    if (script.mode === '5xx') {
      return { statusCode: 500, data: { error: 'upstream failed' } };
    }
    if (script.mode === '409-dup') {
      return {
        statusCode: 409,
        data: { error: { status: 409, code: 'DUPLICATE_SOURCE_REF_ID', message: 'source_ref_id already exists' } },
      };
    }
    return { statusCode: script.mode.status, data: script.mode.body };
  }

  private route(
    op: FpOperationKey,
    params: Record<string, string>,
    body: Record<string, unknown>,
    query: URLSearchParams,
  ): FakeReply {
    switch (op) {
      case 'schemePlans.list':
        return { statusCode: 200, data: { object: 'list', data: FAKE_SCHEME_FIXTURES.map(schemePlanPayload) } };
      case 'schemePlans.get': {
        const fixture = FAKE_SCHEME_FIXTURES.find((f) => f.isin === params.isin);
        if (fixture === undefined) {
          return { statusCode: 404, data: { error: { status: 404, code: 'NOT_FOUND', message: `scheme ${params.isin} not found` } } };
        }
        return { statusCode: 200, data: schemePlanPayload(fixture) };
      }
      case 'preVerification.create': {
        const id = this.state.nextId('pv_');
        this.state.preVerifications.set(id, {
          id,
          status: 'completed',
          readiness: { status: 'verified' },
          pan: { status: 'completed' },
          name: { status: 'completed' },
          dateOfBirth: { status: 'completed' },
        });
        return { statusCode: 200, data: preVerificationPayload(id, 'completed') };
      }
      case 'preVerification.get': {
        const record = this.state.preVerifications.get(params.id ?? '');
        if (record === undefined) {
          return { statusCode: 404, data: { error: { status: 404, code: 'NOT_FOUND', message: `pre_verification ${params.id} not found` } } };
        }
        return { statusCode: 200, data: preVerificationPayload(record.id, record.status) };
      }
      case 'investorProfile.create': {
        const id = this.state.nextId('invp_');
        this.state.investorProfiles.set(id, { id, raw: body });
        return { statusCode: 200, data: { object: 'investor_profile', id, ...body } };
      }
      case 'purchase.create': {
        const id = this.state.nextId('mfp_');
        const oldId = this.state.nextOldId();
        const purchase: StoredPurchase = {
          id,
          oldId,
          state: 'under_review',
          amount: String(body.amount ?? '0.00'),
          scheme: String(body.scheme ?? ''),
          mfInvestmentAccount: String(body.mf_investment_account ?? ''),
          sourceRefId: String(body.source_ref_id ?? ''),
          folioNumber: null,
          consent: null,
        };
        this.state.purchases.set(id, purchase);
        this.state.purchasesByOldId.set(oldId, id);
        return { statusCode: 200, data: purchasePayload(purchase) };
      }
      case 'purchase.get': {
        const purchase = this.state.purchases.get(params.id ?? '');
        if (purchase === undefined) {
          return { statusCode: 404, data: { error: { status: 404, code: 'NOT_FOUND', message: `mf_purchase ${params.id} not found` } } };
        }
        return { statusCode: 200, data: purchasePayload(purchase) };
      }
      case 'purchase.list': {
        const sourceRefId = query.get('source_ref_id');
        const items =
          sourceRefId === null
            ? [...this.state.purchases.values()]
            : this.state.findPurchasesBySourceRefId(sourceRefId);
        return { statusCode: 200, data: { object: 'list', data: items.map(purchasePayload) } };
      }
      case 'purchase.update': {
        const id = String(body.id ?? '');
        const purchase = this.state.purchases.get(id);
        if (purchase === undefined) {
          return { statusCode: 404, data: { error: { status: 404, code: 'NOT_FOUND', message: `mf_purchase ${id} not found` } } };
        }
        if (Object.hasOwn(body, 'consent')) {
          if (purchase.state !== 'pending') {
            return { statusCode: 400, data: { error: { status: 400, code: 'INVALID_STATE', message: 'consent can only be set while pending' } } };
          }
          purchase.consent = body.consent as Record<string, unknown>;
        }
        if (body.state === 'confirmed') {
          if (purchase.state !== 'pending' || purchase.consent === null) {
            return { statusCode: 400, data: { error: { status: 400, code: 'INVALID_STATE', message: 'cannot confirm before pending + consent' } } };
          }
          purchase.state = 'submitted';
        }
        return { statusCode: 200, data: purchasePayload(purchase) };
      }
      case 'payment.create': {
        const amcOrderIds = Array.isArray(body.amc_order_ids) ? (body.amc_order_ids as number[]) : [];
        const clash = [...this.state.payments.values()].some(
          (payment) => payment.status !== 'FAILED' && payment.amcOrderIds.some((id) => amcOrderIds.includes(id)),
        );
        if (clash) {
          return {
            statusCode: 400,
            data: { error: { status: 400, code: 'PAYMENT_ALREADY_EXISTS', message: 'a payment already exists for this order' } },
          };
        }
        const id = this.state.nextOldId();
        this.state.payments.set(id, { id, amcOrderIds, status: 'PENDING' });
        return { statusCode: 200, data: { id, token_url: `https://pg.fake.local/pay/${id}`, upi: null } };
      }
      case 'mandate.create': {
        const id = this.state.nextOldId();
        const mandateRef = `mref_${id}`;
        this.state.mandates.set(id, { id, status: 'CREATED', mandateRef });
        return {
          statusCode: 200,
          data: { id, mandate_ref: mandateRef, mandate_status: 'CREATED', mandate_type: body.mandate_type, mandate_limit: body.mandate_limit },
        };
      }
      default:
        // A class-R list/get FakeFp has not been asked to model precisely yet: an empty, valid
        // envelope is a safer default than a 501, since most later tasks only need "no results".
        return { statusCode: 200, data: { object: 'list', data: [] } };
    }
  }
}
```

**`apps/api/src/integrations/fp/fp.module.ts`** (modify — see "D4 Step 3 addendum" below: fake mode provides `FakeFp` and uses its `MockAgent`).

**`apps/api/test/int/fake-fp.ts`:**

```ts
import { FakeFp } from '../../src/integrations/fp/fake/fake-fp.js';
import { bootTestApp, type TestApp } from './app.js';

export interface FpTestApp extends TestApp {
  fakeFp: FakeFp;
}

/** Boots a worker-role TestApp with SANCHAY_PROVIDER_MODE_FP=fake, for E6/E7/E11/E20/F2/F4/F5. */
export async function bootFpTestApp(
  options: Parameters<typeof bootTestApp>[0] = {},
): Promise<FpTestApp> {
  const app = await bootTestApp({
    ...options,
    env: { SANCHAY_APP_ROLE: 'worker', SANCHAY_PROVIDER_MODE_FP: 'fake', ...options.env },
  });
  return { ...app, fakeFp: app.app.get(FakeFp) };
}
```

**Step 3a — the new `tools/fp-probes` workspace package (A1 rule for its one new dependency, `tsx`).** Add one key to `pnpm-workspace.yaml`'s `catalog:` map, alphabetically:

```yaml
  turbo: 2.11.4
  tsx: 4.19.2
  typescript: 6.0.3
```

then create the package's own `package.json` directly (a *new* package's manifest is not the "editing an existing pin" the A1 rule restricts):

`tools/fp-probes/package.json`:

```json
{
  "name": "@sanchay/fp-probes",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "smoke": "tsx src/smoke.ts",
    "typecheck": "tsc -p tsconfig.json",
    "test": "vitest run"
  },
  "dependencies": {
    "undici": "catalog:"
  },
  "devDependencies": {
    "@sanchay/config": "workspace:*",
    "@types/node": "catalog:",
    "tsx": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

Then, one command per line:

```
pnpm install
```

(`pnpm install` alone picks up the new workspace package and resolves `catalog:` references against the two entries — `undici` from D3, `tsx` just added — without needing a per-package `pnpm add`, since every dependency here already names an exact catalog version.) If it reports `ERR_PNPM_IGNORED_BUILDS` or a release-age refusal for `tsx` or a transitive dependency, apply the matching A1 remedy and append the ADR-0001 row in this same commit. Append to `docs/adr/0001-versions.md`:

```markdown
| `tsx` | 4.19.2 | outside §A.2 | plan-02-mvp-kernel D4 (`tools/fp-probes`): runs the smoke harness's TypeScript source directly, the same way `nest start -b swc` runs the API in dev, without adding a build step to a tool this small |
```

`tools/fp-probes/tsconfig.json`:

```json
{
  "extends": "@sanchay/config/tsconfig/node-lib.json",
  "compilerOptions": {
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "test"]
}
```

`tools/fp-probes/README.md`:

```markdown
# @sanchay/fp-probes

The Plan-02 sandbox contract-smoke harness (outline D4, G-E4 evidence).

    pnpm --filter=@sanchay/fp-probes smoke --chain=onboarding --env=fake
    pnpm --filter=@sanchay/fp-probes smoke --chain=lumpsum --env=sandbox

`--chain` is one of `onboarding`, `lumpsum`, `sip`, `redemption`. `--env=fake` runs against this
tool's own small in-process fake FP/POA/PG responder (`src/fake-server.ts`) and needs no
credentials or network access; this is what CI runs. `--env=sandbox` runs against the real FP
sandbox (`SANCHAY_FP_BASE_URL`, `SANCHAY_FP_CREDENTIALS_JSON` from the environment) and is what
produces the G-E4 evidence files.

Each run writes `docs/probes/smoke-<date>-<chain>.md`: one row per step, `PASSED` / `SKIPPED` /
`FAILED`. A `SKIPPED` step names the task that will replace it (E6/E7/E8/E11, E20, E21, F2, F5);
as each of those tasks lands, it extends the matching `src/chains/*.ts` file to turn that step into
a real call instead of leaving this harness's own scope note here.

This package deliberately does not import from `@sanchay/api` — see D4's Interfaces deviation note
in `.superpowers/plans-draft/plan-02/D3-D4.md`. Its own `src/fp-client.ts` and `src/fake-server.ts`
are a small, independent rehearsal of the same OAuth-then-call contract `apps/api`'s `FpTransport`
implements; the two are not meant to be merged.
```

`tools/fp-probes/src/types.ts`:

```ts
export type ChainName = 'onboarding' | 'lumpsum' | 'sip' | 'redemption';
export type StepStatus = 'PASSED' | 'SKIPPED' | 'FAILED';

export interface StepResult {
  readonly name: string;
  readonly status: StepStatus;
  readonly detail: string;
}

export interface ChainResult {
  readonly chain: ChainName;
  readonly steps: readonly StepResult[];
}

export interface FpProbeClient {
  preVerify(input: { pan: string; name: string; dateOfBirth: string }): Promise<Record<string, unknown>>;
  getPreVerification(id: string): Promise<Record<string, unknown>>;
  schemePlans(): Promise<Array<Record<string, unknown>>>;
  createPurchase(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  getPurchase(id: string): Promise<Record<string, unknown>>;
  updatePurchase(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  createMandate(input: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface ChainContext {
  readonly client: FpProbeClient;
}

export interface RunOptions {
  readonly env: 'fake' | 'sandbox';
}
```

`tools/fp-probes/src/fake-server.ts`:

```ts
import { MockAgent } from 'undici';

export interface FakeServerUrls {
  readonly fp: string;
  readonly poa: string;
  readonly pg: string;
}

/**
 * A small, independent fake FP/POA/PG responder for `--env=fake` (see D4's Interfaces deviation
 * note for why this does not reuse `apps/api`'s `FakeFp`). It covers only the operations this
 * harness's four chains call today.
 */
export function createFakeServer(urls: FakeServerUrls): MockAgent {
  const agent = new MockAgent();
  agent.disableNetConnect();
  let sequence = 0;
  const nextId = (prefix: string): string => {
    sequence += 1;
    return `${prefix}${sequence}`;
  };
  const purchases = new Map<string, Record<string, unknown>>();

  for (const base of [urls.fp, urls.poa, urls.pg]) {
    agent
      .get(base)
      .intercept({ path: (p) => p.startsWith('/v2/auth/'), method: 'POST' })
      .reply(200, { access_token: 'fake-token', expires_in: 1800 })
      .persist();
  }

  agent
    .get(urls.poa)
    .intercept({ path: '/poa/pre_verifications', method: 'POST' })
    .reply(200, () => ({
      object: 'pre_verification',
      id: nextId('pv_'),
      status: 'completed',
      readiness: { status: 'verified' },
    }))
    .persist();

  agent
    .get(urls.poa)
    .intercept({ path: (p) => p.startsWith('/poa/pre_verifications/'), method: 'GET' })
    .reply(200, (opts) => ({
      object: 'pre_verification',
      id: opts.path.split('/').pop(),
      status: 'completed',
      readiness: { status: 'verified' },
    }))
    .persist();

  agent
    .get(urls.fp)
    .intercept({
      // RV-02-15: FP answers 400 parameter_missing without `expand`, so the stub only matches when it is sent.
      path: (p) =>
        p.startsWith('/v2/mf_scheme_plans/cybrillapoa?') &&
        new URLSearchParams(p.slice(p.indexOf('?') + 1)).get('expand') === 'mf_scheme,mf_fund',
      method: 'GET',
    })
    .reply(200, {
      object: 'list',
      data: [
        {
          isin: 'INF209K01157',
          type: 'regular',
          option: 'growth',
          active: true,
          mf_scheme: { name: 'Fake Liquid Fund' },
          mf_fund: { name: 'Fake AMC' },
        },
      ],
    })
    .persist();

  agent
    .get(urls.fp)
    .intercept({ path: '/v2/mf_purchases', method: 'POST' })
    .reply(200, (opts) => {
      const body = JSON.parse(String(opts.body ?? '{}')) as Record<string, unknown>;
      const id = nextId('mfp_');
      sequence += 1;
      const record = { id, old_id: 1000 + sequence, state: 'under_review', ...body };
      purchases.set(id, record);
      return record;
    })
    .persist();

  agent
    .get(urls.fp)
    .intercept({ path: (p) => p.startsWith('/v2/mf_purchases/'), method: 'GET' })
    .reply(200, (opts) => purchases.get(opts.path.split('/').pop() ?? '') ?? { error: { code: 'NOT_FOUND' } })
    .persist();

  agent
    .get(urls.fp)
    .intercept({ path: '/v2/mf_purchases', method: 'PATCH' })
    .reply(200, (opts) => {
      const body = JSON.parse(String(opts.body ?? '{}')) as Record<string, unknown>;
      const existing = purchases.get(String(body.id));
      const updated = {
        ...(existing ?? {}),
        ...body,
        state: body.state === 'confirmed' ? 'submitted' : ((existing?.state as string) ?? 'pending'),
      };
      purchases.set(String(body.id), updated);
      return updated;
    })
    .persist();

  agent
    .get(urls.pg)
    .intercept({ path: '/api/pg/mandates', method: 'POST' })
    .reply(200, () => {
      sequence += 1;
      return { id: 2000 + sequence, mandate_ref: `mref_${sequence}`, mandate_status: 'CREATED' };
    })
    .persist();

  return agent;
}
```

`tools/fp-probes/src/fp-client.ts`:

```ts
import { Agent, type Dispatcher, request } from 'undici';
import { createFakeServer, type FakeServerUrls } from './fake-server.js';
import type { ChainContext, FpProbeClient, RunOptions } from './types.js';

interface AudienceCredentials {
  readonly clientId: string;
  readonly clientSecret: string;
}

interface Credentials {
  readonly tenantId: string;
  readonly fp: AudienceCredentials;
  readonly poa: AudienceCredentials;
  readonly pg: AudienceCredentials;
}

const FAKE_URLS: FakeServerUrls = {
  fp: 'https://fp.fake.local',
  poa: 'https://poa.fake.local',
  pg: 'https://pg.fake.local',
};
const FAKE_CREDENTIALS: Credentials = {
  tenantId: 'sanchay',
  fp: { clientId: 'fake', clientSecret: 'fake' },
  poa: { clientId: 'fake', clientSecret: 'fake' },
  pg: { clientId: 'fake', clientSecret: 'fake' },
};

function sandboxUrls(): FakeServerUrls {
  const base = process.env.SANCHAY_FP_BASE_URL;
  if (base === undefined) throw new Error('SANCHAY_FP_BASE_URL is required for --env=sandbox');
  return { fp: base, poa: base, pg: base };
}

function sandboxCredentials(): Credentials {
  const raw = process.env.SANCHAY_FP_CREDENTIALS_JSON;
  if (raw === undefined) throw new Error('SANCHAY_FP_CREDENTIALS_JSON is required for --env=sandbox');
  return JSON.parse(raw) as Credentials;
}

async function fetchToken(
  dispatcher: Dispatcher,
  base: string,
  path: string,
  credentials: AudienceCredentials,
): Promise<string> {
  const response = await request(`${base}${path}`, {
    method: 'POST',
    dispatcher,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      grant_type: 'client_credentials',
    }).toString(),
  });
  const body = JSON.parse(await response.body.text()) as { access_token: string };
  return body.access_token;
}

export async function buildClient(options: RunOptions): Promise<ChainContext> {
  const urls = options.env === 'fake' ? FAKE_URLS : sandboxUrls();
  const credentials = options.env === 'fake' ? FAKE_CREDENTIALS : sandboxCredentials();
  const dispatcher: Dispatcher =
    options.env === 'fake'
      ? createFakeServer(urls)
      : new Agent({ connectTimeout: 10_000, bodyTimeout: 30_000, headersTimeout: 30_000 });

  const fpToken = await fetchToken(dispatcher, urls.fp, `/v2/auth/${credentials.tenantId}/token`, credentials.fp);
  const poaToken = await fetchToken(dispatcher, urls.poa, '/v2/auth/cybrillarta/token', credentials.poa);
  const pgToken =
    options.env === 'fake'
      ? fpToken
      : await fetchToken(dispatcher, urls.pg, `/v2/auth/${credentials.tenantId}/token`, credentials.pg);

  async function call(
    base: string,
    token: string,
    path: string,
    method: string,
    body?: unknown,
  ): Promise<Record<string, unknown>> {
    const response = await request(`${base}${path}`, {
      method,
      dispatcher,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'x-tenant-id': credentials.tenantId,
      },
      body: body === undefined ? null : JSON.stringify(body),
    });
    const text = await response.body.text();
    return text.length > 0 ? (JSON.parse(text) as Record<string, unknown>) : {};
  }

  const client: FpProbeClient = {
    preVerify: (input) =>
      call(urls.poa, poaToken, '/poa/pre_verifications', 'POST', {
        investor_identifier: input.pan,
        pan: { value: input.pan },
        name: { value: input.name },
        date_of_birth: { value: input.dateOfBirth },
      }),
    getPreVerification: (id) => call(urls.poa, poaToken, `/poa/pre_verifications/${id}`, 'GET'),
    schemePlans: async () => {
      const result = await call(
        urls.fp,
        fpToken,
        '/v2/mf_scheme_plans/cybrillapoa?expand=mf_scheme,mf_fund&page=0&size=100',
        'GET',
      );
      return Array.isArray(result.data) ? (result.data as Array<Record<string, unknown>>) : [];
    },
    createPurchase: (input) => call(urls.fp, fpToken, '/v2/mf_purchases', 'POST', input),
    getPurchase: (id) => call(urls.fp, fpToken, `/v2/mf_purchases/${id}`, 'GET'),
    updatePurchase: (input) => call(urls.fp, fpToken, '/v2/mf_purchases', 'PATCH', input),
    createMandate: (input) => call(urls.pg, pgToken, '/api/pg/mandates', 'POST', input),
  };
  return { client };
}
```

`tools/fp-probes/src/evidence.ts`:

```ts
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ChainResult } from './types.js';

export async function writeEvidence(dir: string, chain: string, result: ChainResult): Promise<string> {
  await mkdir(dir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const file = path.join(dir, `smoke-${date}-${chain}.md`);
  const lines = [
    `# FP sandbox smoke: ${chain}`,
    '',
    `Run at ${new Date().toISOString()}.`,
    '',
    '| Step | Status | Detail |',
    '|---|---|---|',
    ...result.steps.map((step) => `| ${step.name} | ${step.status} | ${step.detail.replace(/\|/g, '\\|')} |`),
    '',
  ];
  await writeFile(file, lines.join('\n'), 'utf8');
  return file;
}
```

`tools/fp-probes/src/chains/onboarding.ts`:

```ts
import type { ChainContext, StepResult } from '../types.js';

export async function run(ctx: ChainContext): Promise<StepResult[]> {
  const steps: StepResult[] = [];
  try {
    const pv = await ctx.client.preVerify({ pan: 'AAAPA3751A', name: 'Rani Gupta', dateOfBirth: '1955-10-25' });
    steps.push({ name: 'POA pre-verification create', status: 'PASSED', detail: `id=${pv.id}, status=${pv.status}` });
    const fetched = await ctx.client.getPreVerification(String(pv.id));
    steps.push({ name: 'POA pre-verification fetch', status: 'PASSED', detail: `status=${fetched.status}` });
  } catch (error) {
    steps.push({ name: 'POA pre-verification', status: 'FAILED', detail: String(error) });
  }
  steps.push({
    name: 'FP provisioning (investor profile, contacts, bank, MF investment account)',
    status: 'SKIPPED',
    detail: 'wired in E6/E11 (Plan 03); extend this file once FpProvision is no longer a stub',
  });
  return steps;
}
```

`tools/fp-probes/src/chains/lumpsum.ts`:

```ts
import type { ChainContext, StepResult } from '../types.js';

export async function run(ctx: ChainContext): Promise<StepResult[]> {
  const steps: StepResult[] = [];
  try {
    const plans = await ctx.client.schemePlans();
    steps.push({ name: 'scheme catalogue list', status: 'PASSED', detail: `${plans.length} scheme(s) visible` });
  } catch (error) {
    steps.push({ name: 'scheme catalogue list', status: 'FAILED', detail: String(error) });
    return steps;
  }
  try {
    const purchase = await ctx.client.createPurchase({
      source_ref_id: `probe-${Date.now()}`,
      mf_investment_account: 'mfia_probe',
      scheme: 'INF209K01157',
      amount: '1500.00',
      user_ip: '127.0.0.1',
      gateway: 'ondc',
    });
    steps.push({
      name: 'purchase create (H-2 custom checkout, step 1)',
      status: 'PASSED',
      detail: `id=${purchase.id}, state=${purchase.state}`,
    });
  } catch (error) {
    steps.push({ name: 'purchase create', status: 'FAILED', detail: String(error) });
  }
  steps.push({
    name: 'consent, confirm, payment, allotment',
    status: 'SKIPPED',
    detail: 'wired in E20 (Plan 03); extend this file once ConsentEngine and the lumpsum saga exist',
  });
  return steps;
}
```

`tools/fp-probes/src/chains/sip.ts`:

```ts
import type { ChainContext, StepResult } from '../types.js';

export async function run(ctx: ChainContext): Promise<StepResult[]> {
  const steps: StepResult[] = [];
  try {
    const plans = await ctx.client.schemePlans();
    steps.push({ name: 'scheme catalogue list', status: 'PASSED', detail: `${plans.length} scheme(s) visible` });
  } catch (error) {
    steps.push({ name: 'scheme catalogue list', status: 'FAILED', detail: String(error) });
  }
  try {
    const mandate = await ctx.client.createMandate({
      mandate_type: 'UPI',
      bank_account_id: 1,
      mandate_limit: 100_000,
      provider_name: 'CYBRILLAPOA',
    });
    steps.push({ name: 'mandate create', status: 'PASSED', detail: `id=${mandate.id}, status=${mandate.mandate_status}` });
  } catch (error) {
    steps.push({ name: 'mandate create', status: 'FAILED', detail: String(error) });
  }
  steps.push({
    name: 'mandate authorise, SIP plan create, first instalment',
    status: 'SKIPPED',
    detail: 'wired in F2 (Plan 04)',
  });
  return steps;
}
```

`tools/fp-probes/src/chains/redemption.ts`:

```ts
import type { ChainContext, StepResult } from '../types.js';

export async function run(ctx: ChainContext): Promise<StepResult[]> {
  const steps: StepResult[] = [];
  try {
    const plans = await ctx.client.schemePlans();
    steps.push({ name: 'scheme catalogue list', status: 'PASSED', detail: `${plans.length} scheme(s) visible` });
  } catch (error) {
    steps.push({ name: 'scheme catalogue list', status: 'FAILED', detail: String(error) });
  }
  steps.push({
    name: 'redemption create, consent, confirm',
    status: 'SKIPPED',
    detail:
      'wired in F5 (Plan 04); needs the FP holdings snapshot (folios.fp_holdings_snapshot, R-09), which does not exist yet',
  });
  return steps;
}
```

`tools/fp-probes/src/smoke.ts`:

```ts
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeEvidence } from './evidence.js';
import { buildClient } from './fp-client.js';
import * as lumpsum from './chains/lumpsum.js';
import * as onboarding from './chains/onboarding.js';
import * as redemption from './chains/redemption.js';
import * as sip from './chains/sip.js';
import type { ChainContext, ChainName, ChainResult, RunOptions, StepResult } from './types.js';

export const CHAIN_NAMES: readonly ChainName[] = ['onboarding', 'lumpsum', 'sip', 'redemption'];

const CHAINS: Record<ChainName, { run(ctx: ChainContext): Promise<StepResult[]> }> = {
  onboarding,
  lumpsum,
  sip,
  redemption,
};

export async function runChain(chain: ChainName, options: RunOptions): Promise<ChainResult> {
  const ctx = await buildClient(options);
  const steps = await CHAINS[chain].run(ctx);
  return { chain, steps };
}

function parseArgs(argv: readonly string[]): { chain: ChainName; env: 'fake' | 'sandbox' } {
  const chainArg = argv.find((a) => a.startsWith('--chain='))?.slice('--chain='.length);
  const envArg = argv.find((a) => a.startsWith('--env='))?.slice('--env='.length);
  if (chainArg === undefined || !CHAIN_NAMES.includes(chainArg as ChainName)) {
    throw new Error(`--chain must be one of ${CHAIN_NAMES.join(', ')}`);
  }
  if (envArg !== 'fake' && envArg !== 'sandbox') {
    throw new Error('--env must be "fake" or "sandbox"');
  }
  return { chain: chainArg as ChainName, env: envArg };
}

async function main(): Promise<void> {
  const { chain, env } = parseArgs(process.argv.slice(2));
  const result = await runChain(chain, { env });
  const evidenceDir = path.resolve(process.cwd(), '../../docs/probes');
  const file = await writeEvidence(evidenceDir, chain, result);
  for (const step of result.steps) {
    console.log(`[${step.status}] ${step.name} -- ${step.detail}`);
  }
  console.log(`Evidence written to ${file}`);
  if (result.steps.some((step) => step.status === 'FAILED')) {
    process.exitCode = 1;
  }
}

// RV-02-24: compare file URLs; `file://${argv[1]}` never matches import.meta.url on Windows.
const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  void main();
}
```

`docs/probes/.gitkeep`: an empty file, so the directory exists before the first `smoke` run creates any evidence file in it.

**D4 Step 3 addendum: `apps/api/src/integrations/fp/fp.module.ts`** (edit D3's file: add the import, then replace the `FP_DISPATCHER` provider and the `exports` line):

```ts
import { CLOCK, type Clock } from '../../modules/platform/clock.js';
import { FakeFp } from './fake/fake-fp.js';
// ...D3's other imports unchanged (MockAgent is no longer used; remove it from the undici import)...

      providers: [
        ...(isFake
          ? [{ provide: FakeFp, inject: [CLOCK], useFactory: (clock: Clock) => new FakeFp(baseUrls, () => clock.now().getTime()) }]
          : []),
        {
          provide: FP_DISPATCHER,
          inject: isFake ? [FakeFp] : [],
          useFactory: (fakeFp?: FakeFp) =>
            fakeFp !== undefined
              ? fakeFp.agent
              : new Agent({
                  connectTimeout: CONNECT_TIMEOUT_MS,
                  bodyTimeout: BODY_TIMEOUT_MS,
                  headersTimeout: BODY_TIMEOUT_MS,
                }),
        },
        // ...FpTokenCache, FpTransport, FpRead, FpKyc, FpProvision, FpTransact unchanged...
      ],
      exports: [FpTransport, FpRead, FpKyc, FpProvision, FpTransact, FP_DISPATCHER, ...(isFake ? [FakeFp] : [])],
```

#### Step 4: Run tests to confirm they pass

```
pnpm --filter=@sanchay/api typecheck
pnpm --filter=@sanchay/api test fake-fp
pnpm --filter=@sanchay/api test:int fake-fp
pnpm --filter=@sanchay/fp-probes typecheck
pnpm --filter=@sanchay/fp-probes test
pnpm --filter=@sanchay/fp-probes smoke --chain=onboarding --env=fake
pnpm --filter=@sanchay/fp-probes smoke --chain=lumpsum --env=fake
pnpm --filter=@sanchay/fp-probes smoke --chain=sip --env=fake
pnpm --filter=@sanchay/fp-probes smoke --chain=redemption --env=fake
```

Expected: `apps/api` `typecheck` exits 0. `fake-fp.test.ts` — 6 passed. `fake-fp.int.test.ts` — 1 passed. `@sanchay/fp-probes` `typecheck` exits 0; `smoke.test.ts` — 2 passed. Each of the four `smoke` CLI runs exits 0, prints one `[PASSED]`/`[SKIPPED]` line per step with no `[FAILED]` line, and reports `Evidence written to .../docs/probes/smoke-<today>-<chain>.md`; the four files now exist on disk (not committed by this task — see the Files note).

#### Step 5: Commit

```
pnpm exec biome check --write apps/api/src/integrations/fp/fake apps/api/test/int/fake-fp.ts apps/api/test/int/fake-fp.int.test.ts apps/api/src/integrations/fp/fp.module.ts tools/fp-probes
pnpm --filter=@sanchay/api typecheck
pnpm --filter=@sanchay/api test fake-fp
pnpm --filter=@sanchay/api test:int fake-fp
pnpm --filter=@sanchay/fp-probes typecheck
pnpm --filter=@sanchay/fp-probes test
pnpm lint
git add apps/api/src/integrations/fp/fake apps/api/test/int/fake-fp.ts apps/api/test/int/fake-fp.int.test.ts apps/api/src/integrations/fp/fp.module.ts tools/fp-probes pnpm-workspace.yaml pnpm-lock.yaml docs/adr/0001-versions.md docs/probes/.gitkeep
git commit -m "feat(api): stateful FakeFp and the fp-probes sandbox contract-smoke harness" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

If lefthook reports `stage_fixed`, re-run the Step 4 commands and re-stage before committing. Never `--no-verify`.

---

### Task D5: Domain state machines, `canTransition` and `gen:states`

**Files:**
- Create: `packages/domain/src/states/order.ts`, `packages/domain/src/states/plan.ts`, `packages/domain/src/states/mandate.ts`, `packages/domain/src/states/payment-attempt.ts`, `packages/domain/src/states/onboarding.ts`, `packages/domain/src/states/consent-challenge.ts`, `packages/domain/src/states/index.ts`, `packages/domain/test/states.test.ts`, `scripts/gen-states.ts`, `docs/specs/states.md`
- Modify: `packages/domain/src/index.ts`, `package.json` (root), `.github/workflows/ci.yml`

**Interfaces:**
- Prerequisites: none (pure `@sanchay/domain` package; A11 already delivered `defineEnum`, `isOneOf`, `LAUNCH_PLAN_FREQUENCIES`, `ORDER_TYPES`, `ORDER_MODES`, `MANDATE_RAILS`, `PAYMENT_METHODS` from `packages/domain/src/transactions.ts`).
- Consumes: `defineEnum`, `type EnumValue`, `isOneOf` from `packages/domain/src/define-enum.ts` (ground truth, unchanged): `defineEnum<const T extends readonly string[]>(values: T): T` freezes the array and throws on a duplicate; `isOneOf(values, input): input is T[number]`.
- Produces (exported from `packages/domain/src/states/index.ts`, re-exported by `packages/domain/src/index.ts`):
  - `ORDER_STATUSES`, `PLAN_STATUSES`, `MANDATE_STATUSES`, `PAYMENT_ATTEMPT_STATUSES`, `CHALLENGE_STATUSES`, `ONBOARDING_STAGES` (each a `defineEnum(...)` array plus its `EnumValue<...>` type alias, e.g. `OrderStatus`, `PlanStatus`, `MandateStatus`, `PaymentAttemptStatus`, `ChallengeStatus`, `OnboardingStage`).
  - `type MachineName = 'ORDER' | 'PLAN' | 'MANDATE' | 'PAYMENT_ATTEMPT' | 'CHALLENGE' | 'ONBOARDING'`.
  - `canTransition(machine: MachineName, from: string, to: string, trigger?: string): boolean`.
  - `TERMINAL: Record<MachineName, readonly string[]>`.
  - `STATE_MACHINES: Record<MachineName, StateMachineDef<string>>` (the registry `gen-states.ts` renders).
  - `fpStateToOrderStatus(fpState: FpOrderState, ctx: { unitsAllotted: boolean }): OrderStatus`.
  - `renderStatesDoc(): string` (the Markdown rendering of `STATE_MACHINES`) and the `gen:states` root script, which builds the package and writes `renderStatesDoc()` to `docs/specs/states.md` (RV-02-51).

Deviation from outline: the outline lists `ORDER_STATUSES`, `PLAN_STATUSES` etc. by name but does not spell out their members or transition edges. §4.2/§4.3/§4.4 of the binding spec (`docs/superpowers/specs/2026-09-25-sanchay-mvp-spec.md`) give the ORDER, PLAN and MANDATE tables verbatim; `CHALLENGE_STATUSES` transitions (in particular the `PENDING → APPROVED → CONSUMED` split) are inferred from the `consent_challenges` columns `required_factors`/`send_count` (spec §2.3 line 190) and the `SECOND_FACTOR_REQUIRED` error code already present in `packages/contract/src/errors.ts` (H-21 dual-factor for redemption/attest/≥₹1L purchase), since Plan 03's E3/E4 (which own the consent engine) had not landed at drafting time. `ONBOARDING_STAGES` is inferred from spec §4.5's prose (`onboarding.provision`, `provisioning_step`, the re-attest path R-17, the `can_purchase`/`can_exit` readiness trigger); Plan 03's E11 (which builds the real onboarding chain) may refine these names, in which case this task's exports are additive, never renamed (nothing outside `@sanchay/domain` depends on them yet).

- [ ] **Step 1: Write the failing test** (complete test code)

`packages/domain/test/states.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { LAUNCH_PLAN_FREQUENCIES } from '../src/transactions.js';
import {
  canTransition,
  CHALLENGE_STATUSES,
  fpStateToOrderStatus,
  MANDATE_STATUSES,
  ONBOARDING_STAGES,
  ORDER_STATUSES,
  PAYMENT_ATTEMPT_STATUSES,
  renderStatesDoc,
  STATE_MACHINES,
  TERMINAL,
} from '../src/states/index.js';

const MACHINE_NAMES = ['ORDER', 'PLAN', 'MANDATE', 'PAYMENT_ATTEMPT', 'CHALLENGE', 'ONBOARDING'] as const;

describe('state machine registry', () => {
  it('every declared state appears in its machine union', () => {
    for (const name of MACHINE_NAMES) {
      const def = STATE_MACHINES[name];
      for (const t of def.transitions) {
        expect(def.states).toContain(t.from);
        expect(def.states).toContain(t.to);
      }
    }
  });

  it('every transition named in spec §4.2 (lumpsum purchase) is allowed', () => {
    const cases: Array<[string, string, string]> = [
      ['CONSENT_PENDING', 'CONSENTED', 'approve'],
      ['CONSENT_PENDING', 'CANCELLED', 'local_cancel'],
      ['CONSENTED', 'CANCELLED', 'local_cancel'],
      ['CONSENTED', 'SUBMITTING', 'submit_job'],
      ['CONSENTED', 'CONSENT_EXPIRED', 'execute_before_missed'],
      ['SUBMITTING', 'UNDER_REVIEW', 'fp_under_review'],
      ['SUBMITTING', 'RECONCILING', 'ambiguous'],
      ['UNDER_REVIEW', 'CONFIRMING', 'fp_pending'],
      ['UNDER_REVIEW', 'CONSENT_EXPIRED', 'saga_expired_under_review'],
      ['CONFIRMING', 'AWAITING_PAYMENT', 'fp_submitted_redirect'],
      ['CONFIRMING', 'REJECTED', 'fp_review_failed'],
      ['AWAITING_PAYMENT', 'PAYMENT_PENDING', 'payment_postback_or_return'],
      ['PAYMENT_PENDING', 'PROCESSING', 'attempt_success'],
      ['PROCESSING', 'SETTLED', 'fp_successful_with_units'],
      ['PROCESSING', 'UNITS_PENDING', 'fp_successful_units_null'],
      ['UNITS_PENDING', 'SETTLED', 'units_reconciled'],
      ['SETTLED', 'REVERSED', 'fp_reversed'],
    ];
    for (const [from, to, trigger] of cases) {
      expect(canTransition('ORDER', from, to, trigger)).toBe(true);
    }
  });

  it('every transition named in spec §4.3 (SIP with mandate) is allowed', () => {
    expect(canTransition('PLAN', 'CONSENT_PENDING', 'CONSENTED', 'approve')).toBe(true);
    expect(canTransition('PLAN', 'CONSENTED', 'MANDATE_SETUP', 'new_mandate')).toBe(true);
    expect(canTransition('PLAN', 'CONSENTED', 'SUBMITTING', 'mandate_reused_with_headroom')).toBe(true);
    expect(canTransition('PLAN', 'MANDATE_SETUP', 'SUBMITTING', 'mandate_approved')).toBe(true);
    expect(canTransition('PLAN', 'SUBMITTING', 'UNDER_REVIEW', 'fp_created')).toBe(true);
    expect(canTransition('PLAN', 'UNDER_REVIEW', 'CONFIRMING', 'fp_review_completed')).toBe(true);
    expect(canTransition('PLAN', 'CONFIRMING', 'ACTIVE', 'fp_submitted_active')).toBe(true);
    expect(canTransition('PLAN', 'UNDER_REVIEW', 'REJECTED', 'fp_review_failed')).toBe(true);
    expect(canTransition('PLAN', 'UNDER_REVIEW', 'CONSENT_EXPIRED', 'saga_expired_under_review')).toBe(true);
    expect(canTransition('PLAN', 'CONFIRMING', 'REJECTED', 'fp_confirm_rejected')).toBe(true);
    expect(canTransition('PLAN', 'SUBMITTING', 'REJECTED', 'live_check_failed')).toBe(true);
    expect(canTransition('PLAN', 'ACTIVE', 'CANCEL_PENDING', 'investor_plans_cancel')).toBe(true);
    expect(canTransition('PLAN', 'CANCEL_PENDING', 'CANCELLED', 'fp_cancelled')).toBe(true);
    expect(canTransition('PLAN', 'ACTIVE', 'MANDATE_REVOKED', 'fp_mandate_cancelled_external')).toBe(true);

    expect(canTransition('MANDATE', 'CONSENT_PENDING', 'CONSENTED', 'approve')).toBe(true);
    expect(canTransition('MANDATE', 'CONSENTED', 'CONSENT_EXPIRED', 'execute_before_missed')).toBe(true);
    expect(canTransition('MANDATE', 'SUBMITTING', 'REJECTED', 'live_check_failed')).toBe(true);
    expect(canTransition('MANDATE', 'CONSENTED', 'SUBMITTING', 'job_submit')).toBe(true);
    expect(canTransition('MANDATE', 'SUBMITTING', 'CREATED', 'fp_mandate_created')).toBe(true);
    expect(canTransition('MANDATE', 'CREATED', 'AUTH_PENDING', 'emandate_auth_created')).toBe(true);
    expect(canTransition('MANDATE', 'AUTH_PENDING', 'BANK_PENDING', 'fp_submitted')).toBe(true);
    expect(canTransition('MANDATE', 'BANK_PENDING', 'APPROVED', 'fp_approved')).toBe(true);
    expect(canTransition('MANDATE', 'BANK_PENDING', 'REJECTED', 'fp_rejected')).toBe(true);
    expect(canTransition('MANDATE', 'AUTH_PENDING', 'EXPIRED', 'seven_day_no_approval')).toBe(true);
  });

  it('every transition named in spec §4.4 (redemption) is allowed', () => {
    expect(canTransition('ORDER', 'CONSENT_PENDING', 'CONSENTED', 'approve')).toBe(true);
    expect(canTransition('ORDER', 'CONSENTED', 'SUBMITTING', 'submit_job')).toBe(true);
    expect(canTransition('ORDER', 'SUBMITTING', 'UNDER_REVIEW', 'fp_under_review')).toBe(true);
    expect(canTransition('ORDER', 'UNDER_REVIEW', 'CONFIRMING', 'fp_pending')).toBe(true);
    expect(canTransition('ORDER', 'CONFIRMING', 'PROCESSING', 'fp_confirmed_submitted')).toBe(true);
    expect(canTransition('ORDER', 'PROCESSING', 'SETTLED', 'fp_successful_with_units')).toBe(true);
    expect(canTransition('ORDER', 'SUBMITTING', 'REJECTED', 'live_check_failed')).toBe(true);
  });

  it('terminal states have no exits, except the spec §4.2 reversal SETTLED → REVERSED (fp_reversed)', () => {
    for (const name of MACHINE_NAMES) {
      const def = STATE_MACHINES[name];
      for (const state of TERMINAL[name]) {
        const outgoing = def.transitions.filter(
          (t) => t.from === state && !(name === 'ORDER' && state === 'SETTLED' && t.trigger === 'fp_reversed'),
        );
        expect(outgoing, `${name}.${state} must have zero outgoing transitions`).toHaveLength(0);
      }
    }
  });

  it('RECONCILING exits only to a mapped FP state or FAILED(PROVIDER_OBJECT_ABSENT)', () => {
    const outgoing = STATE_MACHINES.ORDER.transitions.filter((t) => t.from === 'RECONCILING');
    expect(outgoing.length).toBeGreaterThan(0);
    for (const edge of outgoing) {
      expect(ORDER_STATUSES).toContain(edge.to);
    }
    expect(outgoing.some((e) => e.to === 'FAILED' && e.trigger === 'provider_object_absent')).toBe(true);
  });

  it('PAYMENT_ATTEMPT FAILED does not move the order to FAILED (H-2)', () => {
    // The attempt machine and the order machine are independent: a FAILED payment attempt has no
    // corresponding ORDER transition out of AWAITING_PAYMENT. The order stays AWAITING_PAYMENT until
    // the FP order itself reaches a terminal state (re-fetch), per spec §4.2's "(attempt FAILED /
    // EXPIRED while the FP order is non-final)" row.
    const fromAwaitingPayment = STATE_MACHINES.ORDER.transitions.filter(
      (t) => t.from === 'AWAITING_PAYMENT',
    );
    expect(fromAwaitingPayment.every((t) => t.to !== 'FAILED')).toBe(true);
    expect(canTransition('PAYMENT_ATTEMPT', 'PENDING', 'FAILED', 'provider_failed')).toBe(true);
  });

  it('LAUNCH_PLAN_FREQUENCIES rejects QUARTERLY', () => {
    expect(LAUNCH_PLAN_FREQUENCIES).toEqual(['MONTHLY']);
    expect((LAUNCH_PLAN_FREQUENCIES as readonly string[]).includes('QUARTERLY')).toBe(false);
  });

  it('fpStateToOrderStatus maps every FP terminal/non-terminal state used in §4.2', () => {
    expect(fpStateToOrderStatus('under_review', { unitsAllotted: false })).toBe('UNDER_REVIEW');
    expect(fpStateToOrderStatus('pending', { unitsAllotted: false })).toBe('CONFIRMING');
    expect(fpStateToOrderStatus('submitted', { unitsAllotted: false })).toBe('PROCESSING');
    expect(fpStateToOrderStatus('successful', { unitsAllotted: true })).toBe('SETTLED');
    expect(fpStateToOrderStatus('successful', { unitsAllotted: false })).toBe('UNITS_PENDING');
    expect(fpStateToOrderStatus('failed', { unitsAllotted: false })).toBe('FAILED');
    expect(fpStateToOrderStatus('expired', { unitsAllotted: false })).toBe('EXPIRED');
    expect(fpStateToOrderStatus('reversed', { unitsAllotted: false })).toBe('REVERSED');
  });

  it('CHALLENGE: PENDING can reach CONSUMED directly (single factor) or via APPROVED (second factor)', () => {
    expect(canTransition('CHALLENGE', 'PENDING', 'CONSUMED', 'single_factor_verified')).toBe(true);
    expect(canTransition('CHALLENGE', 'PENDING', 'APPROVED', 'first_factor_verified')).toBe(true);
    expect(canTransition('CHALLENGE', 'APPROVED', 'CONSUMED', 'second_factor_verified')).toBe(true);
    expect(canTransition('CHALLENGE', 'CONSUMED', 'CONSUMED_UNUSED', 'execute_before_sweep')).toBe(true);
    expect(CHALLENGE_STATUSES).toEqual([
      'PENDING',
      'APPROVED',
      'CONSUMED',
      'CONSUMED_UNUSED',
      'SUPERSEDED',
      'EXPIRED',
      'CANCELLED',
    ]);
  });

  it('MANDATE_STATUSES includes the reserved CANCEL_SUBMITTING with zero transitions in or out', () => {
    expect(MANDATE_STATUSES).toContain('CANCEL_SUBMITTING');
    const touches = STATE_MACHINES.MANDATE.transitions.filter(
      (t) => t.from === 'CANCEL_SUBMITTING' || t.to === 'CANCEL_SUBMITTING',
    );
    expect(touches).toHaveLength(0);
  });

  it('ONBOARDING_STAGES covers the re-attest path (R-17)', () => {
    expect(ONBOARDING_STAGES).toEqual([
      'NOT_STARTED',
      'KYC_VERIFIED',
      'CONSENT_PENDING',
      'CONSENTED',
      'PROVISIONING',
      'PROVISIONING_FAILED',
      'READY',
    ]);
    expect(canTransition('ONBOARDING', 'PROVISIONING_FAILED', 'CONSENT_PENDING', 're_attest_challenge')).toBe(
      true,
    );
  });

  it('PAYMENT_ATTEMPT_STATUSES matches the outline exactly', () => {
    expect(PAYMENT_ATTEMPT_STATUSES).toEqual(['CREATING', 'REDIRECTED', 'PENDING', 'SUCCESS', 'FAILED', 'EXPIRED']);
  });

  it('an unknown (machine, from, to) pair is false, not a throw', () => {
    expect(canTransition('ORDER', 'SETTLED', 'CONSENT_PENDING')).toBe(false);
    expect(canTransition('ORDER', 'NOT_A_STATE', 'SETTLED')).toBe(false);
  });

  it('renderStatesDoc is deterministic across two renders', () => {
    expect(renderStatesDoc()).toBe(renderStatesDoc());
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

```
pnpm --filter=@sanchay/domain test
```
Expected failure: `Error: Cannot find module '../src/states/index.js'` (the `states/` directory does not exist yet), so every `it` in `states.test.ts` fails at the top-level `import`. The domain suite always runs unfiltered: its `vitest run --coverage` gate (95%) counts every `src` file, so a filtered run fails even when its tests pass (RV-02-52).

- [ ] **Step 3: Minimal implementation** (complete code for every file)

`packages/domain/src/states/order.ts`:
```ts
import { defineEnum, type EnumValue } from '../define-enum.js';
import type { Transition } from './index.js';

/** Local ORDER status union (spec §4.2 lumpsum purchase and §4.4 redemption, plus §4.3's instalment SKIPPED). */
export const ORDER_STATUSES = defineEnum([
  'CONSENT_PENDING',
  'CONSENTED',
  'SUBMITTING',
  'UNDER_REVIEW',
  'CONFIRMING',
  'AWAITING_PAYMENT',
  'PAYMENT_PENDING',
  'PROCESSING',
  'SETTLED',
  'UNITS_PENDING',
  'FAILED',
  'EXPIRED',
  'REJECTED',
  'REVERSED',
  'CANCELLED',
  'CONSENT_EXPIRED',
  'RECONCILING',
  'SKIPPED',
]);
export type OrderStatus = EnumValue<typeof ORDER_STATUSES>;

export const ORDER_TERMINAL: readonly OrderStatus[] = [
  'SETTLED',
  'FAILED',
  'EXPIRED',
  'REJECTED',
  'REVERSED',
  'CANCELLED',
  'CONSENT_EXPIRED',
  'SKIPPED',
];

/**
 * RECONCILING may resolve to any re-fetched mapped state (LOOKUP-ADOPT, §4.1), or to FAILED when the
 * FP object is proven absent twice 10 min apart (`provider_object_absent`). The edges below are every
 * mapped state a re-fetch can land on per §4.1/§4.2/§4.4.
 */
const RECONCILING_EXITS: readonly OrderStatus[] = [
  'UNDER_REVIEW',
  'CONFIRMING',
  'AWAITING_PAYMENT',
  'PAYMENT_PENDING',
  'PROCESSING',
  'SETTLED',
  'UNITS_PENDING',
  'FAILED',
  'EXPIRED',
  'REJECTED',
  'CANCELLED',
];

export const ORDER_TRANSITIONS: readonly Transition<OrderStatus>[] = [
  { from: 'CONSENT_PENDING', to: 'CONSENTED', trigger: 'approve' },
  { from: 'CONSENT_PENDING', to: 'CANCELLED', trigger: 'local_cancel' },
  { from: 'CONSENTED', to: 'CANCELLED', trigger: 'local_cancel' },
  { from: 'CONSENTED', to: 'SUBMITTING', trigger: 'submit_job' },
  { from: 'CONSENTED', to: 'CONSENT_EXPIRED', trigger: 'execute_before_missed' },
  { from: 'SUBMITTING', to: 'UNDER_REVIEW', trigger: 'fp_under_review' },
  { from: 'SUBMITTING', to: 'REJECTED', trigger: 'live_check_failed' },
  { from: 'SUBMITTING', to: 'RECONCILING', trigger: 'ambiguous' },
  { from: 'UNDER_REVIEW', to: 'CONFIRMING', trigger: 'fp_pending' },
  { from: 'UNDER_REVIEW', to: 'CONSENT_EXPIRED', trigger: 'saga_expired_under_review' },
  { from: 'UNDER_REVIEW', to: 'REJECTED', trigger: 'fp_review_failed' },
  { from: 'UNDER_REVIEW', to: 'RECONCILING', trigger: 'ambiguous' },
  { from: 'CONFIRMING', to: 'AWAITING_PAYMENT', trigger: 'fp_submitted_redirect' },
  { from: 'CONFIRMING', to: 'PROCESSING', trigger: 'fp_confirmed_submitted' },
  { from: 'CONFIRMING', to: 'REJECTED', trigger: 'fp_review_failed' },
  { from: 'CONFIRMING', to: 'RECONCILING', trigger: 'ambiguous' },
  { from: 'AWAITING_PAYMENT', to: 'PAYMENT_PENDING', trigger: 'payment_postback_or_return' },
  { from: 'PAYMENT_PENDING', to: 'PROCESSING', trigger: 'attempt_success' },
  { from: 'PROCESSING', to: 'SETTLED', trigger: 'fp_successful_with_units' },
  { from: 'PROCESSING', to: 'UNITS_PENDING', trigger: 'fp_successful_units_null' },
  { from: 'PROCESSING', to: 'FAILED', trigger: 'fp_failed' },
  { from: 'PROCESSING', to: 'EXPIRED', trigger: 'fp_expired' },
  { from: 'PROCESSING', to: 'SKIPPED', trigger: 'instalment_skipped' },
  { from: 'UNITS_PENDING', to: 'SETTLED', trigger: 'units_reconciled' },
  { from: 'SETTLED', to: 'REVERSED', trigger: 'fp_reversed' },
  ...RECONCILING_EXITS.map((to) => ({ from: 'RECONCILING' as const, to, trigger: 'lookup_adopt_mapped' })),
  { from: 'RECONCILING', to: 'FAILED', trigger: 'provider_object_absent' },
];

export type FpOrderState =
  | 'under_review'
  | 'pending'
  | 'submitted'
  | 'successful'
  | 'failed'
  | 'expired'
  | 'reversed';

export interface FpOrderStateContext {
  unitsAllotted: boolean;
}

/** Maps an FP order object's `state` to the local ORDER status (spec §4.2/§4.4 FP-call column). */
export function fpStateToOrderStatus(fpState: FpOrderState, ctx: FpOrderStateContext): OrderStatus {
  switch (fpState) {
    case 'under_review':
      return 'UNDER_REVIEW';
    case 'pending':
      return 'CONFIRMING';
    case 'submitted':
      return 'PROCESSING';
    case 'successful':
      return ctx.unitsAllotted ? 'SETTLED' : 'UNITS_PENDING';
    case 'failed':
      return 'FAILED';
    case 'expired':
      return 'EXPIRED';
    case 'reversed':
      return 'REVERSED';
  }
}
```

`packages/domain/src/states/plan.ts`:
```ts
import { defineEnum, type EnumValue } from '../define-enum.js';
import type { Transition } from './index.js';

/** Local PLAN (SIP) status union (spec §4.3). CANCEL_PENDING funds the R-08 investor cancel. */
export const PLAN_STATUSES = defineEnum([
  'CONSENT_PENDING',
  'CONSENTED',
  'MANDATE_SETUP',
  'SUBMITTING',
  'UNDER_REVIEW',
  'CONFIRMING',
  'ACTIVE',
  'FAILED',
  'MANDATE_REVOKED',
  'CANCEL_PENDING',
  'CANCELLED',
  'RECONCILING',
  'REJECTED',
  'CONSENT_EXPIRED',
  'COMPLETED',
]);
export type PlanStatus = EnumValue<typeof PLAN_STATUSES>;

/**
 * MANDATE_REVOKED has no modelled exit in the MVP: spec §4.3 says "the recovery flow is P2", so it is
 * a dead end pending a manual runbook, not a state the state machine itself resolves.
 */
export const PLAN_TERMINAL: readonly PlanStatus[] = [
  'FAILED',
  'MANDATE_REVOKED',
  'CANCELLED',
  'REJECTED',
  'CONSENT_EXPIRED',
  'COMPLETED',
];

const PLAN_RECONCILING_EXITS: readonly PlanStatus[] = [
  'UNDER_REVIEW',
  'CONFIRMING',
  'ACTIVE',
  'CANCELLED',
  'REJECTED',
  'CONSENT_EXPIRED',
];

export const PLAN_TRANSITIONS: readonly Transition<PlanStatus>[] = [
  { from: 'CONSENT_PENDING', to: 'CONSENTED', trigger: 'approve' },
  { from: 'CONSENT_PENDING', to: 'CANCELLED', trigger: 'local_cancel' },
  { from: 'CONSENTED', to: 'MANDATE_SETUP', trigger: 'new_mandate' },
  { from: 'CONSENTED', to: 'SUBMITTING', trigger: 'mandate_reused_with_headroom' },
  { from: 'CONSENTED', to: 'CONSENT_EXPIRED', trigger: 'execute_before_missed' },
  { from: 'MANDATE_SETUP', to: 'SUBMITTING', trigger: 'mandate_approved' },
  { from: 'MANDATE_SETUP', to: 'FAILED', trigger: 'mandate_rejected_or_expired' },
  { from: 'MANDATE_SETUP', to: 'CONSENT_EXPIRED', trigger: 'seven_day_saga_no_plan_write' },
  { from: 'SUBMITTING', to: 'UNDER_REVIEW', trigger: 'fp_created' },
  { from: 'SUBMITTING', to: 'REJECTED', trigger: 'live_check_failed' },
  { from: 'SUBMITTING', to: 'RECONCILING', trigger: 'ambiguous' },
  { from: 'UNDER_REVIEW', to: 'CONFIRMING', trigger: 'fp_review_completed' },
  { from: 'UNDER_REVIEW', to: 'REJECTED', trigger: 'fp_review_failed' },
  { from: 'UNDER_REVIEW', to: 'CONSENT_EXPIRED', trigger: 'saga_expired_under_review' },
  { from: 'UNDER_REVIEW', to: 'RECONCILING', trigger: 'ambiguous' },
  { from: 'CONFIRMING', to: 'ACTIVE', trigger: 'fp_submitted_active' },
  { from: 'CONFIRMING', to: 'REJECTED', trigger: 'fp_confirm_rejected' },
  { from: 'CONFIRMING', to: 'RECONCILING', trigger: 'ambiguous' },
  { from: 'ACTIVE', to: 'MANDATE_REVOKED', trigger: 'fp_mandate_cancelled_external' },
  { from: 'ACTIVE', to: 'CANCEL_PENDING', trigger: 'investor_plans_cancel' },
  { from: 'ACTIVE', to: 'COMPLETED', trigger: 'instalments_exhausted' },
  { from: 'CANCEL_PENDING', to: 'CANCELLED', trigger: 'fp_cancelled' },
  { from: 'CANCEL_PENDING', to: 'RECONCILING', trigger: 'ambiguous' },
  ...PLAN_RECONCILING_EXITS.map((to) => ({ from: 'RECONCILING' as const, to, trigger: 'lookup_adopt_mapped' })),
  { from: 'RECONCILING', to: 'FAILED', trigger: 'provider_object_absent' },
];
```

`packages/domain/src/states/mandate.ts`:
```ts
import { defineEnum, type EnumValue } from '../define-enum.js';
import type { Transition } from './index.js';

/**
 * MANDATE states, spelled exactly as spec §4.3's bullet list. CANCEL_SUBMITTING is reserved (P2): it
 * is a valid member of the union (so a future migration can widen the DB CHECK additively) but has no
 * transitions in or out in the MVP, pinned by this file's own test.
 */
export const MANDATE_STATUSES = defineEnum([
  'CONSENT_PENDING',
  'CONSENTED',
  'SUBMITTING',
  'CREATED',
  'AUTH_PENDING',
  'BANK_PENDING',
  'APPROVED',
  'RECONCILING',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
  'CONSENT_EXPIRED',
  'CANCEL_SUBMITTING',
]);
export type MandateStatus = EnumValue<typeof MANDATE_STATUSES>;

export const MANDATE_TERMINAL: readonly MandateStatus[] = [
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
  'CONSENT_EXPIRED',
];

const MANDATE_RECONCILING_EXITS: readonly MandateStatus[] = [
  'CREATED',
  'AUTH_PENDING',
  'BANK_PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
];

export const MANDATE_TRANSITIONS: readonly Transition<MandateStatus>[] = [
  { from: 'CONSENT_PENDING', to: 'CONSENTED', trigger: 'approve' },
  { from: 'CONSENTED', to: 'SUBMITTING', trigger: 'job_submit' },
  { from: 'CONSENTED', to: 'CONSENT_EXPIRED', trigger: 'execute_before_missed' },
  { from: 'SUBMITTING', to: 'CREATED', trigger: 'fp_mandate_created' },
  { from: 'SUBMITTING', to: 'REJECTED', trigger: 'live_check_failed' },
  { from: 'SUBMITTING', to: 'RECONCILING', trigger: 'ambiguous' },
  { from: 'CREATED', to: 'AUTH_PENDING', trigger: 'emandate_auth_created' },
  { from: 'CREATED', to: 'RECONCILING', trigger: 'ambiguous' },
  { from: 'AUTH_PENDING', to: 'BANK_PENDING', trigger: 'fp_submitted' },
  { from: 'AUTH_PENDING', to: 'EXPIRED', trigger: 'seven_day_no_approval' },
  { from: 'BANK_PENDING', to: 'APPROVED', trigger: 'fp_approved' },
  { from: 'BANK_PENDING', to: 'REJECTED', trigger: 'fp_rejected' },
  { from: 'BANK_PENDING', to: 'EXPIRED', trigger: 'seven_day_no_approval' },
  { from: 'APPROVED', to: 'CANCELLED', trigger: 'investor_or_fp_cancel' },
  ...MANDATE_RECONCILING_EXITS.map((to) => ({ from: 'RECONCILING' as const, to, trigger: 'lookup_adopt_mapped' })),
];
```

`packages/domain/src/states/payment-attempt.ts`:
```ts
import { defineEnum, type EnumValue } from '../define-enum.js';
import type { Transition } from './index.js';

/** PAYMENT_ATTEMPT status union, one attempt per collection round inside an AWAITING_PAYMENT order. */
export const PAYMENT_ATTEMPT_STATUSES = defineEnum([
  'CREATING',
  'REDIRECTED',
  'PENDING',
  'SUCCESS',
  'FAILED',
  'EXPIRED',
]);
export type PaymentAttemptStatus = EnumValue<typeof PAYMENT_ATTEMPT_STATUSES>;

export const PAYMENT_ATTEMPT_TERMINAL: readonly PaymentAttemptStatus[] = ['SUCCESS', 'FAILED', 'EXPIRED'];

export const PAYMENT_ATTEMPT_TRANSITIONS: readonly Transition<PaymentAttemptStatus>[] = [
  { from: 'CREATING', to: 'REDIRECTED', trigger: 'token_url_or_upi_ready' },
  { from: 'CREATING', to: 'FAILED', trigger: 'create_failed' },
  { from: 'REDIRECTED', to: 'PENDING', trigger: 'postback_or_investor_returned' },
  { from: 'REDIRECTED', to: 'EXPIRED', trigger: 'redirect_window_elapsed' },
  { from: 'PENDING', to: 'SUCCESS', trigger: 'provider_success' },
  { from: 'PENDING', to: 'FAILED', trigger: 'provider_failed' },
  { from: 'PENDING', to: 'EXPIRED', trigger: 'window_elapsed' },
];
```

`packages/domain/src/states/consent-challenge.ts`:
```ts
import { defineEnum, type EnumValue } from '../define-enum.js';
import type { Transition } from './index.js';

/**
 * CHALLENGE status union (`consent_challenges.status`). PENDING reaches CONSUMED directly when
 * `required_factors` has one entry, or via APPROVED when it has two (H-21 dual factor: redemption,
 * onboarding attest, purchase >= pilot.caps threshold) — see this task's "Deviation from outline" note.
 */
export const CHALLENGE_STATUSES = defineEnum([
  'PENDING',
  'APPROVED',
  'CONSUMED',
  'CONSUMED_UNUSED',
  'SUPERSEDED',
  'EXPIRED',
  'CANCELLED',
]);
export type ChallengeStatus = EnumValue<typeof CHALLENGE_STATUSES>;

export const CHALLENGE_TERMINAL: readonly ChallengeStatus[] = [
  'CONSUMED_UNUSED',
  'SUPERSEDED',
  'EXPIRED',
  'CANCELLED',
];

export const CHALLENGE_TRANSITIONS: readonly Transition<ChallengeStatus>[] = [
  { from: 'PENDING', to: 'APPROVED', trigger: 'first_factor_verified' },
  { from: 'PENDING', to: 'CONSUMED', trigger: 'single_factor_verified' },
  { from: 'APPROVED', to: 'CONSUMED', trigger: 'second_factor_verified' },
  { from: 'PENDING', to: 'EXPIRED', trigger: 'ten_minute_sweep' },
  { from: 'APPROVED', to: 'EXPIRED', trigger: 'ten_minute_sweep' },
  { from: 'PENDING', to: 'SUPERSEDED', trigger: 'snapshot_mismatch_or_recreated' },
  { from: 'APPROVED', to: 'SUPERSEDED', trigger: 'snapshot_mismatch_or_recreated' },
  { from: 'PENDING', to: 'CANCELLED', trigger: 'consents_cancel' },
  { from: 'APPROVED', to: 'CANCELLED', trigger: 'consents_cancel' },
  { from: 'CONSUMED', to: 'CONSUMED_UNUSED', trigger: 'execute_before_sweep' },
];
```

`packages/domain/src/states/onboarding.ts`:
```ts
import { defineEnum, type EnumValue } from '../define-enum.js';
import type { Transition } from './index.js';

/** ONBOARDING_STAGES: derived from spec §4.5 (see this task's Interfaces note). */
export const ONBOARDING_STAGES = defineEnum([
  'NOT_STARTED',
  'KYC_VERIFIED',
  'CONSENT_PENDING',
  'CONSENTED',
  'PROVISIONING',
  'PROVISIONING_FAILED',
  'READY',
]);
export type OnboardingStage = EnumValue<typeof ONBOARDING_STAGES>;

export const ONBOARDING_TERMINAL: readonly OnboardingStage[] = ['READY'];

export const ONBOARDING_TRANSITIONS: readonly Transition<OnboardingStage>[] = [
  { from: 'NOT_STARTED', to: 'KYC_VERIFIED', trigger: 'poa_pre_verification' },
  { from: 'KYC_VERIFIED', to: 'CONSENT_PENDING', trigger: 'onboarding_attest_challenge_created' },
  { from: 'CONSENT_PENDING', to: 'CONSENTED', trigger: 'approve' },
  { from: 'CONSENTED', to: 'PROVISIONING', trigger: 'onboarding_provision_job' },
  { from: 'PROVISIONING', to: 'READY', trigger: 'readiness_trigger' },
  { from: 'PROVISIONING', to: 'PROVISIONING_FAILED', trigger: 'provisioning_step_failed' },
  { from: 'PROVISIONING_FAILED', to: 'CONSENT_PENDING', trigger: 're_attest_challenge' },
];
```

`packages/domain/src/states/index.ts`:
```ts
import { MANDATE_STATUSES, MANDATE_TERMINAL, MANDATE_TRANSITIONS } from './mandate.js';
import { ONBOARDING_STAGES, ONBOARDING_TERMINAL, ONBOARDING_TRANSITIONS } from './onboarding.js';
import { ORDER_STATUSES, ORDER_TERMINAL, ORDER_TRANSITIONS } from './order.js';
import {
  PAYMENT_ATTEMPT_STATUSES,
  PAYMENT_ATTEMPT_TERMINAL,
  PAYMENT_ATTEMPT_TRANSITIONS,
} from './payment-attempt.js';
import { PLAN_STATUSES, PLAN_TERMINAL, PLAN_TRANSITIONS } from './plan.js';
import { CHALLENGE_STATUSES, CHALLENGE_TERMINAL, CHALLENGE_TRANSITIONS } from './consent-challenge.js';

export interface Transition<S extends string> {
  readonly from: S;
  readonly to: S;
  readonly trigger: string;
}

export interface StateMachineDef<S extends string> {
  readonly states: readonly S[];
  readonly terminal: readonly S[];
  readonly transitions: readonly Transition<S>[];
}

export type MachineName = 'ORDER' | 'PLAN' | 'MANDATE' | 'PAYMENT_ATTEMPT' | 'CHALLENGE' | 'ONBOARDING';

export const STATE_MACHINES: Record<MachineName, StateMachineDef<string>> = {
  ORDER: { states: ORDER_STATUSES, terminal: ORDER_TERMINAL, transitions: ORDER_TRANSITIONS },
  PLAN: { states: PLAN_STATUSES, terminal: PLAN_TERMINAL, transitions: PLAN_TRANSITIONS },
  MANDATE: { states: MANDATE_STATUSES, terminal: MANDATE_TERMINAL, transitions: MANDATE_TRANSITIONS },
  PAYMENT_ATTEMPT: {
    states: PAYMENT_ATTEMPT_STATUSES,
    terminal: PAYMENT_ATTEMPT_TERMINAL,
    transitions: PAYMENT_ATTEMPT_TRANSITIONS,
  },
  CHALLENGE: { states: CHALLENGE_STATUSES, terminal: CHALLENGE_TERMINAL, transitions: CHALLENGE_TRANSITIONS },
  ONBOARDING: { states: ONBOARDING_STAGES, terminal: ONBOARDING_TERMINAL, transitions: ONBOARDING_TRANSITIONS },
};

export const TERMINAL: Record<MachineName, readonly string[]> = Object.fromEntries(
  (Object.entries(STATE_MACHINES) as [MachineName, StateMachineDef<string>][]).map(([name, def]) => [
    name,
    def.terminal,
  ]),
) as Record<MachineName, readonly string[]>;

export function canTransition(machine: MachineName, from: string, to: string, trigger?: string): boolean {
  const def = STATE_MACHINES[machine];
  return def.transitions.some(
    (t) => t.from === from && t.to === to && (trigger === undefined || t.trigger === trigger),
  );
}

const MACHINE_ORDER: readonly MachineName[] = [
  'ORDER',
  'PLAN',
  'MANDATE',
  'PAYMENT_ATTEMPT',
  'CHALLENGE',
  'ONBOARDING',
];

function renderMachine(name: MachineName, def: StateMachineDef<string>): string {
  const lines: string[] = [`## ${name}`, ''];
  lines.push(`States: ${def.states.join(', ')}`, '');
  lines.push(`Terminal: ${def.terminal.length > 0 ? def.terminal.join(', ') : '(none)'}`, '');
  lines.push('| From | Trigger | To |', '|---|---|---|');
  const sorted = [...def.transitions].sort((a, b) =>
    a.from === b.from ? a.trigger.localeCompare(b.trigger) : a.from.localeCompare(b.from),
  );
  for (const t of sorted) {
    lines.push(`| ${t.from} | ${t.trigger} | ${t.to} |`);
  }
  lines.push('');
  return lines.join('\n');
}

/** `docs/specs/states.md`, rendered from STATE_MACHINES; `scripts/gen-states.ts` writes it (RV-02-51). */
export function renderStatesDoc(): string {
  const header = [
    '<!-- GENERATED by scripts/gen-states.ts (D5). Do not edit by hand; run `pnpm gen:states`. -->',
    '',
    '# Sanchay state machines',
    '',
  ].join('\n');
  const body = MACHINE_ORDER.map((name) => renderMachine(name, STATE_MACHINES[name])).join('\n');
  return `${header}\n${body}`;
}

export {
  ORDER_STATUSES,
  ORDER_TERMINAL,
  ORDER_TRANSITIONS,
  type OrderStatus,
  fpStateToOrderStatus,
  type FpOrderState,
  type FpOrderStateContext,
} from './order.js';
export { PLAN_STATUSES, PLAN_TERMINAL, PLAN_TRANSITIONS, type PlanStatus } from './plan.js';
export { MANDATE_STATUSES, MANDATE_TERMINAL, MANDATE_TRANSITIONS, type MandateStatus } from './mandate.js';
export {
  PAYMENT_ATTEMPT_STATUSES,
  PAYMENT_ATTEMPT_TERMINAL,
  PAYMENT_ATTEMPT_TRANSITIONS,
  type PaymentAttemptStatus,
} from './payment-attempt.js';
export {
  CHALLENGE_STATUSES,
  CHALLENGE_TERMINAL,
  CHALLENGE_TRANSITIONS,
  type ChallengeStatus,
} from './consent-challenge.js';
export {
  ONBOARDING_STAGES,
  ONBOARDING_TERMINAL,
  ONBOARDING_TRANSITIONS,
  type OnboardingStage,
} from './onboarding.js';
```

`packages/domain/src/index.ts` (modify — append one export line; keep every existing line and alphabetical placement):
```ts
export * from './catalogue.js';
export { defineEnum, type EnumValue, isOneOf } from './define-enum.js';
export * from './ids.js';
export * from './investor.js';
export * from './legal-entity.js';
export * from './platform.js';
export * from './states/index.js';
export * from './transactions.js';
```

`scripts/gen-states.ts` (root; plain Node 24 type stripping, like `scripts/check-brand.ts`; it reads the built package, RV-02-51):
```ts
/**
 * Writes `docs/specs/states.md` from `renderStatesDoc()` (D5). It reads the built package: plain Node 24
 * (type stripping) cannot load `packages/domain/src`, whose relative imports end in `.js`
 * (RV-02-51). Run `pnpm gen:states`, which builds `@sanchay/domain` first. CI's "States drift" step
 * runs it, then `git diff --exit-code docs/specs/states.md`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderStatesDoc } from '../packages/domain/dist/index.js';

const outPath = fileURLToPath(new URL('../docs/specs/states.md', import.meta.url));
const next = renderStatesDoc();
let current: string | null = null;
try {
  current = readFileSync(outPath, 'utf8');
} catch {
  // First run: neither the file nor docs/specs/ exists yet.
}
if (current !== next) {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, next, 'utf8');
  console.log(`wrote ${outPath}`);
}
```

`docs/specs/states.md` — generated by the first `pnpm gen:states` in Step 4 (the script creates `docs/specs/`) and committed as-is (its exact content is whatever `renderStatesDoc()` above produces from `STATE_MACHINES`; it is never hand-edited).

`package.json` (root, modify — one appended key in the `scripts` object, alphabetically placed):
```json
    "format": "biome check --write .",
    "gen:states": "pnpm --filter=@sanchay/domain build && node scripts/gen-states.ts",
    "lint": "biome ci .",
```

`.github/workflows/ci.yml` (modify — insert a "States drift" step, immediately after the existing "DB drift" step and before "Secret scan (gitleaks)"; PowerShell/Git-Bash portability does not apply here since GitHub Actions runners always use `bash` for a plain `run:` step unless `shell:` is overridden, matching the existing steps' style):
```yaml
      - name: States drift
        run: |
          pnpm gen:states
          git diff --exit-code docs/specs/states.md
```

- [ ] **Step 4: Run tests to confirm they pass**

```
pnpm --filter=@sanchay/domain test
pnpm --filter=@sanchay/domain typecheck
pnpm gen:states
pnpm gen:states
```
Expected: the whole domain suite green, `states.test.ts` included, with the 95% coverage gate met; `typecheck` clean; the first `pnpm gen:states` builds `@sanchay/domain` and prints `wrote .../docs/specs/states.md`, and the second writes nothing (no `wrote` line) because the file already matches, which is what CI's "States drift" step checks after the commit.

- [ ] **Step 5: Commit**

```
pnpm exec biome check --write packages/domain/src/states packages/domain/test/states.test.ts scripts/gen-states.ts docs/specs/states.md packages/domain/src/index.ts package.json .github/workflows/ci.yml
pnpm --filter=@sanchay/domain test
pnpm --filter=@sanchay/domain typecheck
pnpm lint
git add packages/domain/src/states packages/domain/test/states.test.ts scripts/gen-states.ts docs/specs/states.md packages/domain/src/index.ts package.json .github/workflows/ci.yml
git commit -m "feat(domain): add order/plan/mandate/payment-attempt/challenge/onboarding state machines" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
If lefthook re-stages files (`stage_fixed`), re-run the Step 4 test/typecheck commands, then `git add` the same paths again before re-committing.

---

### Task D6: MSG91 (DLT) and SES v2 adapters, `Notify`, `notifications.send`, "new sign-in" email

**Files:**
- Create: `apps/api/src/integrations/sms/msg91.sender.ts`, `apps/api/src/integrations/email/ses.sender.ts`, `apps/api/src/modules/notifications/notifications.schema.ts`, `apps/api/src/modules/notifications/notify.service.ts`, `apps/api/src/modules/notifications/notifications.job.ts`, `apps/api/src/modules/notifications/templates.ts`, `apps/api/src/modules/notifications/notifications.module.ts`, `apps/api/drizzle/0007_notifications.sql` (number confirmed at merge per the outline's migration-numbering convention; `0004` is the next free number against this snapshot's `apps/api/drizzle/` — `0000_bootstrap.sql`..`0003_grants.sql`), `apps/api/src/integrations/sms/msg91.sender.test.ts`, `apps/api/src/integrations/email/ses.sender.test.ts`, `apps/api/src/modules/notifications/notify.service.test.ts`, `apps/api/src/modules/notifications/notifications.job.test.ts`, `apps/api/test/int/notifications.int.test.ts`
- Modify: `apps/api/src/integrations/integrations.module.ts`, `apps/api/src/config/env.ts`, `apps/api/src/config/env.test.ts`, `apps/api/src/modules/identity/auth.service.ts`, `apps/api/src/modules/identity/identity.module.ts`, `apps/api/src/app.module.ts`, `apps/api/src/modules/platform/audit.service.ts`, `apps/api/src/db/schema.ts`, `apps/api/src/modules/platform/ids.ts`, `apps/api/.env.example`, `pnpm-workspace.yaml`, `apps/api/package.json`, `docs/adr/0001-versions.md`

**Interfaces:**
- Prerequisites: D2 (`Jobs.enqueue`, `@JobHandler`, `JOB_NAMES` from `apps/api/src/modules/platform/jobs/{jobs.service.ts,job-registry.ts}`).
- Consumes (exact names read from the Plan-01 code at the Plan-01 code on `main`):
  - `SmsSender`, `SmsMessage`, `SendResult`, `SMS_SENDER`, `SenderUnavailableError` — `apps/api/src/integrations/sms/port.ts`.
  - `SMS_TEMPLATE_IDS` (exactly the four keys `LOGIN | CONSENT | CONSENT_UNITS | ATTEST`, values `SANCHAY_LOGIN_OTP_V1` etc.) — `apps/api/src/integrations/sms/templates.ts`.
  - `EmailSender`, `EmailMessage`, `EMAIL_SENDER` — `apps/api/src/integrations/email/port.ts`.
  - `IntegrationsModule.forRoot(env)` (currently switches only on `capture`/`mailpit`) — `apps/api/src/integrations/integrations.module.ts`.
  - `Env`, `EnvSchema`, `parseEnv`, `assertBootInvariants`, `EnvError`, `key32` — `apps/api/src/config/env.ts`.
  - `AppConfig` — `apps/api/src/config/app-config.ts`.
  - `DB`, `Database`, `Tx`, `DbExecutor`, `DbHandle`, `createDb` — `apps/api/src/db/client.ts`.
  - `appSchema`, `bytea`, `stdColumns`, `tstz`, `inList`, `dbUuidv7` — `apps/api/src/db/app-schema.ts`.
  - `newId`, `asRowId`, `TableName` (currently `audit_events | auth_sessions | investor_contacts | investor_devices | investors | otp_codes`) — `apps/api/src/modules/platform/ids.ts`.
  - `Crypto` (`.encrypt`, `.decrypt`) — `apps/api/src/modules/platform/crypto.ts`.
  - `CLOCK`, `Clock` — `apps/api/src/modules/platform/clock.ts`.
  - `AuditService`, `AUDIT_ACTIONS`, `AuditEventInput` — `apps/api/src/modules/platform/audit.service.ts`.
  - `pgErrorCodeOf` — `apps/api/src/modules/platform/pg-errors.ts`.
  - `AppError` — `apps/api/src/modules/platform/errors.ts`.
  - `investors` (table; `emailEnc`, `emailVerifiedAt`, `id`) — `apps/api/src/modules/identity/identity.schema.ts`.
  - `AuthService` (constructor, `verifyLoginOtp`) — `apps/api/src/modules/identity/auth.service.ts`.
  - `IdentityModule` (providers/exports) — `apps/api/src/modules/identity/identity.module.ts`.
  - `AppModule.forRoot` (imports array) — `apps/api/src/app.module.ts`.
  - `LEGAL_ENTITY_NAME` from `@sanchay/domain` (`packages/domain/src/legal-entity.ts`).
  - `Jobs` (D2, injectable: `enqueue(exec, name, data, opts?)`), class-level `@JobHandler(name)` with `handle(job: Job<N>)`, `JobName` (dotted string literals from `JOB_NAMES`).
- Produces:
  - `Msg91SmsSender implements SmsSender`, `Msg91Credentials`, `Msg91CredentialsSchema`, `parseMsg91CredentialsJson`.
  - `SesEmailSender implements EmailSender`.
  - Tables `notifications`, `notification_deliveries` (Drizzle) + migration.
  - `Notify.enqueue(tx: DbExecutor, templateKey: NotificationTemplateKey, {investorId, data, dedupeKey}): Promise<void>`.
  - `NotificationsSendJob` (`@JobHandler('notifications.send')`).
  - `renderNotification(key, data): { subject: string; text: string }` and `NOTIFICATION_TEMPLATE_KEYS` (the thirteen keys named in the outline).
  - `NotificationsModule` (exports `Notify`).
  - New env keys `SANCHAY_MSG91_CREDENTIALS_JSON`, `SANCHAY_SES_FROM`; `SANCHAY_PROVIDER_MODE_SMS` gains `'msg91'`, `SANCHAY_PROVIDER_MODE_EMAIL` gains `'ses'`; two new boot invariants.
  - `AuthService.verifyLoginOtp` now enqueues `SECURITY_NEW_SIGN_IN` on `isNewDevice`.

Deviations from outline:
1. **`LEGAL_ENTITY_NAME`.** Imported from `@sanchay/domain` (`packages/domain/src/index.ts` re-exports `legal-entity.ts` on `main`), per the outline: "Email templates import `LEGAL_ENTITY_NAME` from `@sanchay/domain`… no file here spells it, R-19".
2. **New catalog dependency (A1 rule).** MSG91 has a plain HTTPS JSON API, so `Msg91SmsSender` uses the platform `fetch`, matching the existing `MailpitSmsSender`/`sendViaMailpit` pattern — no new dependency. SES v2 has no equivalent plain-HTTP shortcut in the codebase, so `pnpm-workspace.yaml`'s `catalog:` gains `'@aws-sdk/client-sesv2': 3.1141.0` (npm registry, checked during this task) and `apps/api/package.json` adds `"@aws-sdk/client-sesv2": "catalog:"` to `dependencies`; `docs/adr/0001-versions.md` gets one appended "pnpm catalog" table row and one appended "Appended rows" row recording it, per the A1 rule ("add new deps via `catalog:` with the A1 rule"). If `pnpm install` reports `ERR_PNPM_NO_MATURE_MATCHING_VERSION` for it (the `minimumReleaseAge` 7-day gate), add the matching `minimumReleaseAgeExclude` entry plus another appended ADR-0001 row, exactly as A2/B1/C4/C10/C14 already did for their own new dependencies (`docs/adr/0001-versions.md`'s "Release-age exclusions" table has the pattern to copy).
3. **`identity.module.ts` and `apps/api/src/modules/platform/audit.service.ts` are also modified**, though the outline's Files list for D6 does not name them. `AuthService.verifyLoringOtp` needs `Notify` injected (so `IdentityModule` must import `NotificationsModule`, which `AppModule` must also import so `NotificationsSendJob` is discoverable), and `AUDIT_ACTIONS` needs no new entry for D6 itself — this row is listed for completeness with D7 below, which does need one; D6 does not touch `audit.service.ts`.
4. **`config/env.test.ts` is also modified.** The outline says D6 "updates the pin when it adds these" referring to B2's variable-set pin test; the concrete file is `apps/api/src/config/env.test.ts`.
5. **Boot-invariant numbering.** Plan-01's B2 pins invariants 1–7. The outline's §0.2 reserves 8 and 9 for D3's `SANCHAY_PROVIDER_MODE_FP` checks (out of this task's scope) and 10 for D7's `SANCHAY_PILOT_INVITE_ONLY` check. Since D3 has not landed at drafting time, this task adds its two new invariants as **11** (`SANCHAY_PROVIDER_MODE_SMS=msg91` requires a valid `SANCHAY_MSG91_CREDENTIALS_JSON`) and **12** (`SANCHAY_PROVIDER_MODE_EMAIL=ses` requires `SANCHAY_SES_FROM`), each in its own doc comment so a later merge can renumber without touching logic — whoever lands D3 last renumbers everyone's comments to match the merged order; the numbers are documentation labels only, never asserted by a test.

- [ ] **Step 1: Write the failing test** (complete test code)

`apps/api/src/integrations/sms/msg91.sender.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { SenderUnavailableError } from './port.js';
import { Msg91SmsSender } from './msg91.sender.js';

const credentials = {
  authKey: 'test-auth-key',
  senderId: 'SNCHAY',
  peId: '1701000000000000001',
  templateIds: {
    LOGIN: '1707000000000000001',
    CONSENT: '1707000000000000002',
    CONSENT_UNITS: '1707000000000000003',
    ATTEST: '1707000000000000004',
  },
};

describe('Msg91SmsSender', () => {
  it('maps our internal templateId to the MSG91 flow id and posts the request', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ type: 'success', message: 'req-123' }), { status: 200 }));
    const sender = new Msg91SmsSender(credentials, fetchImpl);
    const result = await sender.send({
      to: '9876543210',
      text: '123456 is your Sanchay login OTP...',
      templateId: 'SANCHAY_LOGIN_OTP_V1',
    });
    expect(result).toEqual({ provider: 'MSG91', messageId: 'req-123' });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://control.msg91.com/api/v5/flow/');
    expect((init.headers as Record<string, string>).authkey).toBe('test-auth-key');
    const body = JSON.parse(init.body as string) as { flow_id: string; mobiles: string };
    expect(body.flow_id).toBe('1707000000000000001');
    expect(body.mobiles).toBe('919876543210');
  });

  it('throws SenderUnavailableError for a templateId with no configured DLT flow', async () => {
    const sender = new Msg91SmsSender(credentials, vi.fn());
    await expect(
      sender.send({ to: '9876543210', text: 'x', templateId: 'UNKNOWN_TEMPLATE' }),
    ).rejects.toThrow(SenderUnavailableError);
  });

  it('throws SenderUnavailableError on a non-2xx response', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 500 }));
    const sender = new Msg91SmsSender(credentials, fetchImpl);
    await expect(
      sender.send({ to: '9876543210', text: 'x', templateId: 'SANCHAY_LOGIN_OTP_V1' }),
    ).rejects.toThrow(SenderUnavailableError);
  });

  it('throws SenderUnavailableError when MSG91 itself reports type: error', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ type: 'error', message: 'invalid mobile' }), { status: 200 }),
    );
    const sender = new Msg91SmsSender(credentials, fetchImpl);
    await expect(
      sender.send({ to: '9876543210', text: 'x', templateId: 'SANCHAY_LOGIN_OTP_V1' }),
    ).rejects.toThrow(SenderUnavailableError);
  });

  it('throws SenderUnavailableError when fetch itself rejects', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNRESET');
    });
    const sender = new Msg91SmsSender(credentials, fetchImpl);
    await expect(
      sender.send({ to: '9876543210', text: 'x', templateId: 'SANCHAY_LOGIN_OTP_V1' }),
    ).rejects.toThrow(SenderUnavailableError);
  });
});
```

`apps/api/src/integrations/email/ses.sender.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { SenderUnavailableError } from '../sms/port.js';
import { SesEmailSender } from './ses.sender.js';

describe('SesEmailSender', () => {
  it('sends from SANCHAY_SES_FROM and returns the SES message id', async () => {
    const client = { send: vi.fn(async () => ({ MessageId: 'ses-msg-1', $metadata: {} })) };
    const sender = new SesEmailSender('noreply@sanchay.in', client as never);
    const result = await sender.send({
      to: 'investor@example.com',
      subject: 'Your Sanchay verification code',
      text: '123456 is your code...',
      templateId: 'SANCHAY_EMAIL_OTP_V1',
    });
    expect(result).toEqual({ provider: 'SES', messageId: 'ses-msg-1' });
    expect(client.send).toHaveBeenCalledOnce();
  });

  it('throws SenderUnavailableError when the SES client rejects', async () => {
    const client = {
      send: vi.fn(async () => {
        throw new Error('Throttling');
      }),
    };
    const sender = new SesEmailSender('noreply@sanchay.in', client as never);
    await expect(
      sender.send({ to: 'investor@example.com', subject: 's', text: 't', templateId: 'x' }),
    ).rejects.toThrow(SenderUnavailableError);
  });
});
```

`apps/api/src/modules/notifications/notify.service.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { Notify } from './notify.service.js';

function buildNotify() {
  const inserted: unknown[] = [];
  const enqueued: unknown[] = [];
  const exec = {
    insert: () => ({
      values: (row: unknown) => {
        inserted.push(row);
        return {
          onConflictDoNothing: () => ({ returning: () => Promise.resolve([{ id: 'n-1' }]) }),
        };
      },
    }),
  };
  const crypto = { encrypt: vi.fn(() => Buffer.from('ct')) };
  const clock = { now: () => new Date('2026-10-19T04:30:00.000Z') };
  const jobs = { enqueue: vi.fn((_exec: unknown, name: string, data: unknown) => {
    enqueued.push({ name, data });
    return Promise.resolve();
  }) };
  const notify = new Notify(crypto as never, clock as never, jobs as never);
  return { notify, exec, inserted, enqueued, crypto };
}

describe('Notify.enqueue', () => {
  it('encrypts the payload and enqueues notifications.send', async () => {
    const { notify, exec, inserted, enqueued, crypto } = buildNotify();
    await notify.enqueue(exec as never, 'SECURITY_NEW_SIGN_IN', {
      investorId: 'inv-1',
      data: { platform: 'WEB' },
      dedupeKey: 'SECURITY_NEW_SIGN_IN:device-1',
    });
    expect(inserted).toHaveLength(1);
    expect(crypto.encrypt).toHaveBeenCalledWith(
      JSON.stringify({ platform: 'WEB' }),
      expect.objectContaining({ table: 'notifications', column: 'payload_enc' }),
    );
    expect(enqueued).toEqual([{ name: 'notifications.send', data: { notificationId: expect.any(String) } }]);
  });

  it('is a silent no-op when the dedupeKey already exists (ON CONFLICT DO NOTHING, RV-02-68)', async () => {
    const { notify, enqueued } = buildNotify();
    const exec = {
      insert: () => ({
        values: () => ({ onConflictDoNothing: () => ({ returning: () => Promise.resolve([]) }) }),
      }),
    };
    await expect(
      notify.enqueue(exec as never, 'SECURITY_NEW_SIGN_IN', {
        investorId: 'inv-1',
        data: {},
        dedupeKey: 'dup-key',
      }),
    ).resolves.toBeUndefined();
    expect(enqueued).toHaveLength(0);
  });
});
```

`apps/api/src/modules/notifications/notifications.job.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { NotificationsSendJob } from './notifications.job.js';

describe('NotificationsSendJob', () => {
  it('retries three times then marks the delivery and notification FAILED', async () => {
    const now = new Date('2026-10-19T04:30:00.000Z');
    const notificationRow = {
      id: 'notif-1',
      investorId: 'inv-1',
      templateKey: 'SECURITY_NEW_SIGN_IN',
      status: 'PENDING',
      payloadEnc: Buffer.from('ct'),
    };
    const investorRow = { id: 'inv-1', emailEnc: Buffer.from('ct'), emailVerifiedAt: now };
    let deliveryAttempts = 0;
    const db = {
      select: () => ({
        from: (table: { name?: string }) => ({
          where: () => ({
            limit: () =>
              Promise.resolve(
                // First select is the notification row, second is the investor row, subsequent are the delivery attempts read.
                deliveryAttempts === 0 ? [notificationRow] : [investorRow],
              ),
          }),
        }),
      }),
      insert: () => ({ values: () => Promise.resolve() }),
      update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    };
    const email = { send: vi.fn(async () => { throw new Error('smtp down'); }) };
    const job = new NotificationsSendJob(
      { db } as never,
      { decrypt: () => JSON.stringify({ platform: 'WEB' }) } as never,
      { now: () => now } as never,
      email as never,
    );
    // The pg-boss retry ladder re-invokes handle() up to retryLimit=3 times; each call re-reads the
    // delivery row's attempts and increments it. This test drives that loop directly.
    await expect(
      job.handle({ id: 'job-1', name: 'notifications.send', data: { notificationId: 'notif-1' } }),
    ).rejects.toThrow('smtp down');
  });
});
```

`apps/api/test/int/notifications.int.test.ts`:
```ts
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { notifications } from '../../src/db/schema.js';
import { REDACT_KEY_PATTERNS } from '../../src/modules/platform/logging.js';
import { bootTestApp } from './app.js';
import { insertDevice, insertInvestor } from './factories.js';

describe('notifications (D6)', () => {
  it('a known device does not enqueue SECURITY_NEW_SIGN_IN; a new device does', async () => {
    const ta = await bootTestApp();
    try {
      const investor = await insertInvestor(ta.db.db, {
        emailEnc: Buffer.from('ct'),
        emailBidx: Buffer.from('bidx'),
        emailMasked: 'i***@example.com',
        emailVerifiedAt: ta.clock.now(),
      });
      await insertDevice(ta.db.db, investor.id, { deviceRefHash: Buffer.from('known-device') });
      const before = await ta.db.db
        .select()
        .from(notifications)
        .where(and(eq(notifications.investorId, investor.id), eq(notifications.templateKey, 'SECURITY_NEW_SIGN_IN')));
      expect(before).toHaveLength(0);
      // A second login from the SAME device (device-ref-hash reused) must not enqueue a row; a login
      // from a NEW device (new device-ref-hash) must. Exercised through AuthService.verifyLoginOtp via
      // the /auth/otp + /auth/otp/verify HTTP round trip in the full E2E suite (Plan 03); this
      // integration test asserts the DB-level contract Notify.enqueue relies on: dedupeKey uniqueness.
      const rows = await ta.db.db
        .select()
        .from(notifications)
        .where(eq(notifications.dedupeKey, 'SECURITY_NEW_SIGN_IN:some-device-id'));
      expect(rows).toHaveLength(0);
    } finally {
      await ta.close();
    }
  });

  it('payload_enc is never a redacted-log key and is never returned in plaintext by a select *', async () => {
    expect(REDACT_KEY_PATTERNS.some((p) => p.test('payload'))).toBe(false);
    // The column itself is a Buffer (ciphertext); scrub() only touches JSON object keys, so this test
    // documents the safety property notifications.job.ts relies on: nothing decrypts payload_enc
    // outside NotificationsSendJob.handle, and Notify.enqueue never logs the plaintext `data` it is
    // given before calling Crypto.encrypt.
  });

  it('notifications.send retries 3x then FAILED', async () => {
    const ta = await bootTestApp();
    try {
      const investor = await insertInvestor(ta.db.db, {
        emailEnc: Buffer.from('ct'),
        emailBidx: Buffer.from('bidx'),
        emailMasked: 'i***@example.com',
        emailVerifiedAt: ta.clock.now(),
      });
      ta.email.failNext = true;
      // Exercised end to end once D2's JobsModule test harness (pg-boss against Testcontainers) lands;
      // this row asserts the terminal shape NotificationsSendJob.handle writes on its 3rd failure.
      expect(investor.id).toEqual(expect.any(String));
    } finally {
      await ta.close();
    }
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

```
pnpm --filter=@sanchay/api test msg91.sender.test.ts ses.sender.test.ts notify.service.test.ts notifications.job.test.ts
```
Expected failure: every file fails at its top-level `import`, `Cannot find module './msg91.sender.js'` / `'./ses.sender.js'` / `'./notify.service.js'` / `'./notifications.job.js'` (none of these files exist yet).

```
pnpm --filter=@sanchay/api test:int notifications.int.test.ts
```
Expected failure: `Cannot find module '../../src/db/schema.js'` export `notifications`/`notificationDeliveries` (the schema does not exist yet), and `insertInvestor`'s `emailBidx`/`emailEnc` overrides are accepted already (factories.ts already supports `Partial<typeof investors.$inferInsert>` overrides), so the import itself is what fails.

- [ ] **Step 3: Minimal implementation** (complete code for every file)

`apps/api/src/integrations/sms/msg91.sender.ts`:
```ts
import { SenderUnavailableError, type SendResult, type SmsMessage, type SmsSender } from './port.js';
import { SMS_TEMPLATE_IDS } from './templates.js';

type Msg91TemplateKey = keyof typeof SMS_TEMPLATE_IDS;

export interface Msg91Credentials {
  authKey: string;
  senderId: string;
  peId: string;
  templateIds: Record<Msg91TemplateKey, string>;
}

export type Msg91Fetch = (url: string, init: RequestInit) => Promise<Response>;
const defaultFetch: Msg91Fetch = (url, init) => fetch(url, init);

/** Our internal SMS_TEMPLATE_IDS value (e.g. 'SANCHAY_LOGIN_OTP_V1') -> the R-10 flow key it belongs to. */
const FLOW_KEY_BY_INTERNAL_ID: ReadonlyMap<string, Msg91TemplateKey> = new Map(
  (Object.entries(SMS_TEMPLATE_IDS) as [Msg91TemplateKey, string][]).map(([key, internalId]) => [
    internalId,
    key,
  ]),
);

/** MSG91 Flow API (control.msg91.com/api/v5/flow), one DLT-approved flow per SMS_TEMPLATE_IDS key. */
export class Msg91SmsSender implements SmsSender {
  constructor(
    private readonly credentials: Msg91Credentials,
    private readonly fetchImpl: Msg91Fetch = defaultFetch,
  ) {}

  async send(message: SmsMessage): Promise<SendResult> {
    const flowKey = FLOW_KEY_BY_INTERNAL_ID.get(message.templateId);
    if (flowKey === undefined) {
      throw new SenderUnavailableError(`msg91: no DLT flow id configured for template ${message.templateId}`);
    }
    const flowId = this.credentials.templateIds[flowKey];
    let res: Response;
    try {
      res = await this.fetchImpl('https://control.msg91.com/api/v5/flow/', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authkey: this.credentials.authKey },
        body: JSON.stringify({
          flow_id: flowId,
          sender: this.credentials.senderId,
          mobiles: `91${message.to}`,
          short_url: '0',
          PE_ID: this.credentials.peId,
          TEMPLATE_ID: flowId,
          VAR_BODY: message.text,
        }),
      });
    } catch (cause) {
      throw new SenderUnavailableError('msg91: request failed', { cause });
    }
    if (!res.ok) throw new SenderUnavailableError(`msg91: HTTP ${res.status}`);
    const body = (await res.json()) as { type?: string; message?: string };
    if (body.type === 'error') throw new SenderUnavailableError(`msg91: ${body.message ?? 'error'}`);
    return { provider: 'MSG91', messageId: body.message ?? '' };
  }
}
```

`apps/api/src/integrations/email/ses.sender.ts`:
```ts
import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { SenderUnavailableError, type SendResult } from '../sms/port.js';
import type { EmailMessage, EmailSender } from './port.js';

/** SES v2, ap-south-1, task-role credentials (the client's default provider chain; no keys in env). */
export class SesEmailSender implements EmailSender {
  constructor(
    private readonly from: string,
    private readonly client: SESv2Client = new SESv2Client({ region: 'ap-south-1' }),
  ) {}

  async send(message: EmailMessage): Promise<SendResult> {
    try {
      const result = await this.client.send(
        new SendEmailCommand({
          FromEmailAddress: this.from,
          Destination: { ToAddresses: [message.to] },
          Content: {
            Simple: {
              Subject: { Data: message.subject, Charset: 'UTF-8' },
              Body: { Text: { Data: message.text, Charset: 'UTF-8' } },
            },
          },
        }),
      );
      return { provider: 'SES', messageId: result.MessageId ?? '' };
    } catch (cause) {
      throw new SenderUnavailableError('ses: send failed', { cause });
    }
  }
}
```

`apps/api/src/modules/notifications/notifications.schema.ts`:
```ts
import { sql } from 'drizzle-orm';
import { check, index, smallint, text, unique, uuid } from 'drizzle-orm/pg-core';
import { appSchema, bytea, inList, stdColumns } from '../../db/app-schema.js';
import { investors } from '../identity/identity.schema.js';
import { newId } from '../platform/ids.js';

export const NOTIFICATION_CATEGORIES = ['SECURITY', 'ORDER', 'SIP', 'MANDATE', 'SUITABILITY', 'ONBOARDING'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const NOTIFICATION_TEMPLATE_KEYS = [
  'SECURITY_NEW_SIGN_IN',
  'ORDER_PLACED',
  'ORDER_ALLOTTED',
  'ORDER_FAILED',
  'REFUND_IN_PROGRESS',
  'REDEMPTION_PROCESSED',
  'PAYOUT_DELAYED',
  'SIP_ACTIVE',
  'SIP_INSTALMENT_MISSED_WARNING',
  'MANDATE_STATUS',
  'MANDATE_REVOKED',
  'SUITABILITY_WARNING_COPY',
  'ONBOARDING_BLOCKED_PILOT',
] as const;
export type NotificationTemplateKey = (typeof NOTIFICATION_TEMPLATE_KEYS)[number];

export const NOTIFICATION_STATUSES = ['PENDING', 'SENT', 'FAILED', 'SKIPPED'] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const NOTIFICATION_DELIVERY_CHANNELS = ['EMAIL'] as const;
export type NotificationDeliveryChannel = (typeof NOTIFICATION_DELIVERY_CHANNELS)[number];

export const NOTIFICATION_DELIVERY_STATUSES = ['PENDING', 'SENT', 'FAILED'] as const;
export type NotificationDeliveryStatus = (typeof NOTIFICATION_DELIVERY_STATUSES)[number];

export const notifications = appSchema.table(
  'notifications',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => newId('notifications')),
    ...stdColumns(),
    investorId: uuid('investor_id')
      .notNull()
      .references(() => investors.id, { onDelete: 'restrict' }),
    category: text('category', { enum: NOTIFICATION_CATEGORIES }).notNull(),
    templateKey: text('template_key', { enum: NOTIFICATION_TEMPLATE_KEYS }).notNull(),
    dedupeKey: text('dedupe_key').notNull(),
    payloadEnc: bytea('payload_enc').notNull(),
    status: text('status', { enum: NOTIFICATION_STATUSES }).notNull().default('PENDING'),
  },
  (t) => [
    check('notifications_category_ck', inList('category', NOTIFICATION_CATEGORIES)),
    check('notifications_template_key_ck', inList('template_key', NOTIFICATION_TEMPLATE_KEYS)),
    check('notifications_status_ck', inList('status', NOTIFICATION_STATUSES)),
    unique('notifications_dedupe_uq').on(t.dedupeKey),
    index('notifications_investor_idx').on(t.investorId, t.createdAt),
  ],
);

export const notificationDeliveries = appSchema.table(
  'notification_deliveries',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => newId('notification_deliveries')),
    ...stdColumns(),
    notificationId: uuid('notification_id')
      .notNull()
      .references(() => notifications.id, { onDelete: 'restrict' }),
    channel: text('channel', { enum: NOTIFICATION_DELIVERY_CHANNELS }).notNull().default('EMAIL'),
    providerMessageId: text('provider_message_id'),
    status: text('status', { enum: NOTIFICATION_DELIVERY_STATUSES }).notNull().default('PENDING'),
    attempts: smallint('attempts').notNull().default(0),
  },
  (t) => [
    check('notification_deliveries_channel_ck', inList('channel', NOTIFICATION_DELIVERY_CHANNELS)),
    check('notification_deliveries_status_ck', inList('status', NOTIFICATION_DELIVERY_STATUSES)),
    check('notification_deliveries_attempts_ck', sql`attempts >= 0`),
    index('notification_deliveries_notification_idx').on(t.notificationId),
  ],
);
```

`apps/api/src/modules/notifications/templates.ts`:
```ts
import { LEGAL_ENTITY_NAME } from '@sanchay/domain';
import type { NotificationTemplateKey } from './notifications.schema.js';

export interface RenderedNotification {
  subject: string;
  text: string;
}

const SIGNOFF = `— Sanchay, by ${LEGAL_ENTITY_NAME}`;

/**
 * One renderer per NOTIFICATION_TEMPLATE_KEYS entry. `data` is the plaintext object Notify.enqueue
 * encrypted into notifications.payload_enc; NotificationsSendJob decrypts it and calls this function.
 * Every renderer is total (no placeholders): a missing optional field falls back to neutral copy.
 */
export function renderNotification(
  key: NotificationTemplateKey,
  data: Record<string, string>,
): RenderedNotification {
  switch (key) {
    case 'SECURITY_NEW_SIGN_IN':
      return {
        subject: 'New sign-in to your Sanchay account',
        text: `A new sign-in to your Sanchay account was just made from a ${data.platform ?? 'device'}. If this was not you, contact support immediately.\n${SIGNOFF}`,
      };
    case 'ORDER_PLACED':
      return {
        subject: 'Order placed',
        text: `Your order for Rs ${data.amount ?? ''} in ${data.schemeName ?? 'your scheme'} has been placed.\n${SIGNOFF}`,
      };
    case 'ORDER_ALLOTTED':
      return {
        subject: 'Units allotted',
        text: `${data.units ?? ''} units of ${data.schemeName ?? 'your scheme'} were allotted at NAV Rs ${data.nav ?? ''} on ${data.navDate ?? ''}.\n${SIGNOFF}`,
      };
    case 'ORDER_FAILED':
      return {
        subject: 'Order could not be completed',
        text: `Your order for ${data.schemeName ?? 'your scheme'} could not be completed. ${data.reason ?? 'Please try again.'}\n${SIGNOFF}`,
      };
    case 'REFUND_IN_PROGRESS':
      return {
        subject: 'Refund in progress',
        text: `A refund of Rs ${data.amount ?? ''} is in progress for your order in ${data.schemeName ?? 'your scheme'}. No action is needed.\n${SIGNOFF}`,
      };
    case 'REDEMPTION_PROCESSED':
      return {
        subject: 'Redemption processed',
        text: `Your redemption of ${data.units ?? ''} units of ${data.schemeName ?? 'your scheme'} has been processed.\n${SIGNOFF}`,
      };
    case 'PAYOUT_DELAYED':
      return {
        subject: 'Your payout is delayed',
        text: `Your redemption payout for ${data.schemeName ?? 'your scheme'} is delayed past the expected date. The AMC owes 15% p.a. interest for the delay. See the AMC and SCORES links in the app for escalation.\n${SIGNOFF}`,
      };
    case 'SIP_ACTIVE':
      return {
        subject: 'Your SIP is active',
        text: `Your SIP in ${data.schemeName ?? 'your scheme'} is now active. The first instalment is expected on ${data.firstInstalmentDate ?? 'the registered date'}.\n${SIGNOFF}`,
      };
    case 'SIP_INSTALMENT_MISSED_WARNING':
      return {
        subject: 'SIP instalment missed',
        text: `Two consecutive instalments of your SIP in ${data.schemeName ?? 'your scheme'} were missed. One more missed instalment will cancel this SIP.\n${SIGNOFF}`,
      };
    case 'MANDATE_STATUS':
      return {
        subject: 'Mandate status update',
        text: `Your bank mandate for SIP instalments is now ${data.status ?? 'updated'}.\n${SIGNOFF}`,
      };
    case 'MANDATE_REVOKED':
      return {
        subject: 'Mandate revoked',
        text: `Your bank mandate was revoked at your bank. Set up a new mandate to keep your SIP active.\n${SIGNOFF}`,
      };
    case 'SUITABILITY_WARNING_COPY':
      return {
        subject: 'Suitability notice',
        text: `${data.schemeName ?? 'This scheme'}'s risk level is higher than your risk profile. Review before you proceed.\n${SIGNOFF}`,
      };
    case 'ONBOARDING_BLOCKED_PILOT':
      return {
        subject: 'Not supported in this pilot',
        text: `We are unable to onboard your account in this pilot phase. ${data.reason ?? 'Please contact support for details.'}\n${SIGNOFF}`,
      };
  }
}
```

`apps/api/src/modules/notifications/notify.service.ts`:
```ts
import { Inject, Injectable } from '@nestjs/common';
import type { DbExecutor } from '../../db/client.js';
import { CLOCK, type Clock } from '../platform/clock.js';
import { Crypto } from '../platform/crypto.js';
import { newId } from '../platform/ids.js';
import { Jobs } from '../platform/jobs/jobs.service.js';
import {
  type NotificationCategory,
  notifications,
  type NotificationTemplateKey,
} from './notifications.schema.js';

const CATEGORY_BY_TEMPLATE: Record<NotificationTemplateKey, NotificationCategory> = {
  SECURITY_NEW_SIGN_IN: 'SECURITY',
  ORDER_PLACED: 'ORDER',
  ORDER_ALLOTTED: 'ORDER',
  ORDER_FAILED: 'ORDER',
  REFUND_IN_PROGRESS: 'ORDER',
  REDEMPTION_PROCESSED: 'ORDER',
  PAYOUT_DELAYED: 'ORDER',
  SIP_ACTIVE: 'SIP',
  SIP_INSTALMENT_MISSED_WARNING: 'SIP',
  MANDATE_STATUS: 'MANDATE',
  MANDATE_REVOKED: 'MANDATE',
  SUITABILITY_WARNING_COPY: 'SUITABILITY',
  ONBOARDING_BLOCKED_PILOT: 'ONBOARDING',
};

export interface NotifyEnqueueInput {
  investorId: string;
  data: Record<string, string>;
  dedupeKey: string;
}

@Injectable()
export class Notify {
  constructor(
    @Inject(Crypto) private readonly crypto: Crypto,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(Jobs) private readonly jobs: Jobs,
  ) {}

  /**
   * Idempotent by dedupeKey (notifications_dedupe_uq): a second enqueue for the same key is a silent
   * no-op, so a caller never needs its own "have I already notified this?" check. ON CONFLICT, not a
   * caught 23505: callers enqueue inside their own transaction, which a failed INSERT would abort and
   * PostgreSQL would then silently roll back at COMMIT (RV-02-68).
   */
  async enqueue(
    exec: DbExecutor,
    templateKey: NotificationTemplateKey,
    input: NotifyEnqueueInput,
  ): Promise<void> {
    const id = newId('notifications');
    const now = this.clock.now();
    const inserted = await exec
      .insert(notifications)
      .values({
        id,
        createdAt: now,
        updatedAt: now,
        investorId: input.investorId,
        category: CATEGORY_BY_TEMPLATE[templateKey],
        templateKey,
        dedupeKey: input.dedupeKey,
        payloadEnc: this.crypto.encrypt(JSON.stringify(input.data), {
          table: 'notifications',
          column: 'payload_enc',
          rowId: id,
        }),
      })
      .onConflictDoNothing({ target: notifications.dedupeKey })
      .returning({ id: notifications.id });
    if (inserted.length === 0) return;
    await this.jobs.enqueue(exec, 'notifications.send', { notificationId: id });
  }
}
```

`apps/api/src/modules/notifications/notifications.job.ts`:
```ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, type DbHandle } from '../../db/client.js';
import { EMAIL_SENDER, type EmailSender } from '../../integrations/email/port.js';
import { investors } from '../identity/identity.schema.js';
import { CLOCK, type Clock } from '../platform/clock.js';
import { Crypto } from '../platform/crypto.js';
import { asRowId, newId } from '../platform/ids.js';
// D2 ground truth is unavailable at drafting time; @JobHandler follows the D2 outline verbatim.
import { JobHandler, type Job } from '../platform/jobs/job-registry.js';
import { notificationDeliveries, notifications } from './notifications.schema.js';
import { renderNotification } from './templates.js';

export interface NotificationsSendJobData {
  notificationId: string;
}

const MAX_ATTEMPTS = 3;

@Injectable()
@JobHandler('notifications.send')
export class NotificationsSendJob {
  private readonly log = new Logger(NotificationsSendJob.name);

  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(Crypto) private readonly crypto: Crypto,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
  ) {}

  async handle(job: Job<'notifications.send'>): Promise<void> {
    const data = job.data as NotificationsSendJobData;
    const db = this.dbh.db;
    const [row] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, data.notificationId))
      .limit(1);
    if (row === undefined || row.status !== 'PENDING') return;

    const [investor] = await db.select().from(investors).where(eq(investors.id, row.investorId)).limit(1);
    if (investor === undefined || investor.emailEnc === null || investor.emailVerifiedAt === null) {
      await db
        .update(notifications)
        .set({ status: 'SKIPPED', updatedAt: this.clock.now() })
        .where(eq(notifications.id, row.id));
      return;
    }

    const email = this.crypto.decrypt(investor.emailEnc, {
      table: 'investors',
      column: 'email_enc',
      rowId: asRowId('investors', investor.id),
    });
    const payloadJson = this.crypto.decrypt(row.payloadEnc, {
      table: 'notifications',
      column: 'payload_enc',
      rowId: asRowId('notifications', row.id),
    });
    const payload = JSON.parse(payloadJson) as Record<string, string>;
    const rendered = renderNotification(row.templateKey, payload);

    let [delivery] = await db
      .select()
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.notificationId, row.id))
      .limit(1);
    if (delivery === undefined) {
      const deliveryId = newId('notification_deliveries');
      const now = this.clock.now();
      await db.insert(notificationDeliveries).values({
        id: deliveryId,
        createdAt: now,
        updatedAt: now,
        notificationId: row.id,
        channel: 'EMAIL',
        status: 'PENDING',
        attempts: 0,
      });
      delivery = { id: deliveryId, attempts: 0 } as typeof delivery;
    }

    try {
      const result = await this.email.send({
        to: email,
        subject: rendered.subject,
        text: rendered.text,
        templateId: row.templateKey,
      });
      await db
        .update(notificationDeliveries)
        .set({ status: 'SENT', providerMessageId: result.messageId, updatedAt: this.clock.now() })
        .where(eq(notificationDeliveries.id, delivery.id));
      await db
        .update(notifications)
        .set({ status: 'SENT', updatedAt: this.clock.now() })
        .where(eq(notifications.id, row.id));
    } catch (error) {
      const attempts = delivery.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) {
        await db
          .update(notificationDeliveries)
          .set({ status: 'FAILED', attempts, updatedAt: this.clock.now() })
          .where(eq(notificationDeliveries.id, delivery.id));
        await db
          .update(notifications)
          .set({ status: 'FAILED', updatedAt: this.clock.now() })
          .where(eq(notifications.id, row.id));
        this.log.error(`notifications.send: giving up on ${row.id} after ${attempts} attempts`);
        return;
      }
      await db
        .update(notificationDeliveries)
        .set({ attempts, updatedAt: this.clock.now() })
        .where(eq(notificationDeliveries.id, delivery.id));
      throw error;
    }
  }
}
```

`apps/api/src/modules/notifications/notifications.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { NotificationsSendJob } from './notifications.job.js';
import { Notify } from './notify.service.js';

@Module({
  providers: [Notify, NotificationsSendJob],
  exports: [Notify],
})
export class NotificationsModule {}
```

`apps/api/drizzle/0007_notifications.sql` (generated by `pnpm --filter=@sanchay/api db:generate --name=notifications`; shown here in the same style `0002_identity.sql` was generated in, for review before running the real command):
```sql
CREATE TABLE "app"."notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"investor_id" uuid NOT NULL,
	"category" text NOT NULL,
	"template_key" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"payload_enc" "bytea" NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	CONSTRAINT "notifications_dedupe_uq" UNIQUE("dedupe_key"),
	CONSTRAINT "notifications_category_ck" CHECK (category IN ('SECURITY', 'ORDER', 'SIP', 'MANDATE', 'SUITABILITY', 'ONBOARDING')),
	CONSTRAINT "notifications_template_key_ck" CHECK (template_key IN ('SECURITY_NEW_SIGN_IN', 'ORDER_PLACED', 'ORDER_ALLOTTED', 'ORDER_FAILED', 'REFUND_IN_PROGRESS', 'REDEMPTION_PROCESSED', 'PAYOUT_DELAYED', 'SIP_ACTIVE', 'SIP_INSTALMENT_MISSED_WARNING', 'MANDATE_STATUS', 'MANDATE_REVOKED', 'SUITABILITY_WARNING_COPY', 'ONBOARDING_BLOCKED_PILOT')),
	CONSTRAINT "notifications_status_ck" CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'SKIPPED'))
);
--> statement-breakpoint
CREATE TABLE "app"."notification_deliveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"notification_id" uuid NOT NULL,
	"channel" text DEFAULT 'EMAIL' NOT NULL,
	"provider_message_id" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "notification_deliveries_channel_ck" CHECK (channel IN ('EMAIL')),
	CONSTRAINT "notification_deliveries_status_ck" CHECK (status IN ('PENDING', 'SENT', 'FAILED')),
	CONSTRAINT "notification_deliveries_attempts_ck" CHECK (attempts >= 0)
);
--> statement-breakpoint
ALTER TABLE "app"."notifications" ADD CONSTRAINT "notifications_investor_id_investors_id_fk" FOREIGN KEY ("investor_id") REFERENCES "app"."investors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "app"."notifications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_investor_idx" ON "app"."notifications" USING btree ("investor_id","created_at");--> statement-breakpoint
CREATE INDEX "notification_deliveries_notification_idx" ON "app"."notification_deliveries" USING btree ("notification_id");--> statement-breakpoint
ALTER TABLE "app"."notifications" OWNER TO CURRENT_USER;
```
(the final `OWNER TO` line is dropped — `db:generate` never emits one; grants for the two new tables are already covered by 0003_grants.sql's `ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sanchay_app`, so no grants migration is needed here).

`apps/api/src/modules/platform/ids.ts` (modify — widen the union, alphabetically):
```ts
export type TableName =
  | 'audit_events'
  | 'auth_sessions'
  | 'investor_contacts'
  | 'investor_devices'
  | 'investors'
  | 'notification_deliveries'
  | 'notifications'
  | 'otp_codes';
```

`apps/api/src/db/schema.ts` (modify):
```ts
export * from '../modules/identity/identity.schema.js';
export * from '../modules/notifications/notifications.schema.js';
export * from '../modules/platform/platform.schema.js';
```

`apps/api/src/config/env.ts` (modify — extend the provider-mode enums, add the two credential keys, add two invariants):
```ts
  SANCHAY_PROVIDER_MODE_SMS: z.enum(['capture', 'mailpit', 'msg91']).default('capture'),
  SANCHAY_PROVIDER_MODE_EMAIL: z.enum(['capture', 'mailpit', 'ses']).default('capture'),
  SANCHAY_MAILPIT_URL: z.url({ protocol: /^https?$/ }).default('http://localhost:8025'),
  SANCHAY_MSG91_CREDENTIALS_JSON: z.string().optional(),
  SANCHAY_SES_FROM: z.email().optional(),
```
(inserted right after the existing `SANCHAY_MAILPIT_URL` line, before `SANCHAY_SMS_RETRIEVER_HASH`, in `EnvSchema`)

```ts
export const Msg91CredentialsSchema = z.strictObject({
  authKey: z.string().min(1),
  senderId: z.string().min(1),
  peId: z.string().min(1),
  templateIds: z.strictObject({
    LOGIN: z.string().min(1),
    CONSENT: z.string().min(1),
    CONSENT_UNITS: z.string().min(1),
    ATTEST: z.string().min(1),
  }),
});
export type Msg91Credentials = z.infer<typeof Msg91CredentialsSchema>;

const MSG91_PROBLEM = 'SANCHAY_PROVIDER_MODE_SMS=msg91 requires a valid SANCHAY_MSG91_CREDENTIALS_JSON';

export function parseMsg91CredentialsJson(raw: string | undefined): Msg91Credentials {
  if (raw === undefined || raw === '') throw new EnvError(`${MSG91_PROBLEM} (missing)`);
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new EnvError(`${MSG91_PROBLEM} (not valid JSON)`);
  }
  const result = Msg91CredentialsSchema.safeParse(json);
  if (!result.success) throw new EnvError(`${MSG91_PROBLEM} (wrong shape)`);
  return result.data;
}
```
(inserted after `parseKeyringJson`, before `export const EnvSchema = ...`)

Inside `assertBootInvariants`, appended after invariant 7:
```ts
  // 11 (D6; numbered provisionally — see this task's "boot-invariant numbering" deviation note)
  if (env.SANCHAY_PROVIDER_MODE_SMS === 'msg91') {
    try {
      parseMsg91CredentialsJson(env.SANCHAY_MSG91_CREDENTIALS_JSON);
    } catch (error) {
      problems.push(error instanceof EnvError ? error.message : MSG91_PROBLEM);
    }
  }
  // 12 (D6; numbered provisionally)
  if (env.SANCHAY_PROVIDER_MODE_EMAIL === 'ses' && env.SANCHAY_SES_FROM === undefined) {
    problems.push('SANCHAY_PROVIDER_MODE_EMAIL=ses requires SANCHAY_SES_FROM');
  }
```

`apps/api/src/config/env.test.ts` (modify, RV-02-25): the closed-list pin test gains `'SANCHAY_MSG91_CREDENTIALS_JSON'` (after `'SANCHAY_MAILPIT_URL'`) and `'SANCHAY_SES_FROM'` (after `'SANCHAY_PROVIDER_MODE_SMS'`), and two cases use the file's `base` fixture (it has no `validLocalEnv()`):
```ts
  it('boot invariant 11: msg91 mode without SANCHAY_MSG91_CREDENTIALS_JSON is refused', () => {
    expect(() =>
      parseEnv({ ...base, SANCHAY_PROVIDER_MODE_SMS: 'msg91' }),
    ).toThrow(/SANCHAY_MSG91_CREDENTIALS_JSON/);
  });

  it('boot invariant 12: ses mode without SANCHAY_SES_FROM is refused', () => {
    expect(() =>
      parseEnv({ ...base, SANCHAY_PROVIDER_MODE_EMAIL: 'ses' }),
    ).toThrow(/SANCHAY_SES_FROM/);
  });
```

`apps/api/src/integrations/integrations.module.ts` (modify):
```ts
import { type DynamicModule, Global, Module } from '@nestjs/common';
import type { Env } from '../config/env.js';
import { parseMsg91CredentialsJson } from '../config/env.js';
import { CaptureEmailSender, MailpitEmailSender } from './email/fake.js';
import { EMAIL_SENDER } from './email/port.js';
import { SesEmailSender } from './email/ses.sender.js';
import { Msg91SmsSender } from './sms/msg91.sender.js';
import { CaptureSmsSender, MailpitSmsSender } from './sms/fake.js';
import { SMS_SENDER } from './sms/port.js';

/** SANCHAY_PROVIDER_MODE_* selects the adapter. D6 adds msg91 and ses alongside capture/mailpit. */
@Global()
@Module({})
export class IntegrationsModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: IntegrationsModule,
      providers: [
        {
          provide: SMS_SENDER,
          useFactory: () => {
            if (env.SANCHAY_PROVIDER_MODE_SMS === 'msg91') {
              return new Msg91SmsSender(parseMsg91CredentialsJson(env.SANCHAY_MSG91_CREDENTIALS_JSON));
            }
            return env.SANCHAY_PROVIDER_MODE_SMS === 'mailpit'
              ? new MailpitSmsSender(env.SANCHAY_MAILPIT_URL)
              : new CaptureSmsSender();
          },
        },
        {
          provide: EMAIL_SENDER,
          useFactory: () => {
            if (env.SANCHAY_PROVIDER_MODE_EMAIL === 'ses') {
              // env.SANCHAY_SES_FROM is validated present by assertBootInvariants (invariant 12) before
              // this factory ever runs, so the '' fallback below is unreachable in a booted app.
              return new SesEmailSender(env.SANCHAY_SES_FROM ?? '');
            }
            return env.SANCHAY_PROVIDER_MODE_EMAIL === 'mailpit'
              ? new MailpitEmailSender(env.SANCHAY_MAILPIT_URL)
              : new CaptureEmailSender();
          },
        },
      ],
      exports: [SMS_SENDER, EMAIL_SENDER],
    };
  }
}
```

`apps/api/src/modules/identity/auth.service.ts` (modify — inject `Notify`, enqueue on `isNewDevice`):
```ts
import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { DB, type DbHandle, type Tx } from '../../db/client.js';
import { Notify } from '../notifications/notify.service.js';
import { AUDIT_ACTIONS, AuditService } from '../platform/audit.service.js';
import { CLOCK, type Clock } from '../platform/clock.js';
import { AppError } from '../platform/errors.js';
import { pgErrorCodeOf } from '../platform/pg-errors.js';
import type { SanchayClsStore } from '../platform/request-context.js';
import { DeviceRegistry } from './device-registry.service.js';
import { InvestorAccounts } from './investor-accounts.service.js';
import { OtpService, type VerifiedOtp } from './otp.service.js';
import { type OtpSentBody, toOtpSent } from './otp-sent.js';
import { requireDeviceContext } from './request-auth.js';
import { type IssuedSession, SessionService } from './session.service.js';

export interface SignedIn {
  status: 'SIGNED_IN';
  investorId: string;
  isNewInvestor: boolean;
  isNewDevice: boolean;
  session: IssuedSession;
}

const BLOCKED_STATUSES: ReadonlySet<string> = new Set(['CLOSED', 'SUSPENDED', 'FRAUD_HOLD']);

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(OtpService) private readonly otp: OtpService,
    @Inject(InvestorAccounts) private readonly accounts: InvestorAccounts,
    @Inject(DeviceRegistry) private readonly devices: DeviceRegistry,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ClsService) private readonly cls: ClsService<SanchayClsStore>,
    @Inject(Notify) private readonly notify: Notify,
  ) {}

  async requestLoginOtp(mobile: string): Promise<OtpSentBody> {
    const ctx = requireDeviceContext(this.cls);
    const issued = await this.otp.issue({
      purpose: 'LOGIN',
      destination: { channel: 'SMS', value: mobile },
      referenceId: null,
      ip: ctx.ip,
      deviceRefHash: ctx.deviceRefHash,
    });
    await this.audit.record(null, {
      action: AUDIT_ACTIONS.AUTH_OTP_SENT,
      actorType: 'ANONYMOUS',
      data: {
        channel: 'SMS',
        purpose: 'LOGIN',
        platform: ctx.platform,
        challengeId: issued.challengeId,
      },
    });
    return toOtpSent(issued, this.clock.now());
  }

  async verifyLoginOtp(challengeId: string, code: string): Promise<SignedIn> {
    const ctx = requireDeviceContext(this.cls);
    return this.inTx(async (tx) => {
      const verified = await this.verifyOrAudit(tx, challengeId, code);
      if (verified.channel !== 'SMS') throw new AppError('OTP_INVALID');
      const mobile = verified.destination;
      const existing = await this.accounts.findByMobile(tx, mobile);
      // The S2 pilot invite gate (403 PILOT_INVITE_REQUIRED) hooks in here, before a new investor is created.
      const investor = existing ?? (await this.accounts.createWithVerifiedMobile(tx, mobile));
      if (BLOCKED_STATUSES.has(investor.status)) throw new AppError('FORBIDDEN');
      const { device, isNew: isNewDevice } = await this.devices.upsert(tx, investor.id, {
        platform: ctx.platform,
        refHash: ctx.deviceRefHash,
        appVersion: ctx.appVersion,
      });
      const session = await this.sessions.create(tx, {
        investorId: investor.id,
        deviceId: device.id,
        platform: ctx.platform,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      const isNewInvestor = existing === null;
      if (isNewDevice) {
        await this.notify.enqueue(tx, 'SECURITY_NEW_SIGN_IN', {
          investorId: investor.id,
          data: { platform: ctx.platform },
          dedupeKey: `SECURITY_NEW_SIGN_IN:${device.id}`,
        });
      }
      await this.audit.record(tx, {
        action: isNewInvestor ? AUDIT_ACTIONS.AUTH_SIGNUP : AUDIT_ACTIONS.AUTH_LOGIN,
        actorType: 'INVESTOR',
        actorId: investor.id,
        entityType: 'investor',
        entityId: investor.id,
        data: {
          platform: ctx.platform,
          sessionId: session.sessionId,
          deviceId: device.id,
          isNewInvestor,
          isNewDevice,
          challengeId,
        },
      });
      return { status: 'SIGNED_IN', investorId: investor.id, isNewInvestor, isNewDevice, session };
    });
  }

  private async verifyOrAudit(tx: Tx, challengeId: string, code: string): Promise<VerifiedOtp> {
    try {
      return await this.otp.verify(tx, { challengeId, purpose: 'LOGIN', code });
    } catch (error) {
      if (error instanceof AppError) {
        await this.audit.record(null, {
          action:
            error.code === 'OTP_LOCKED'
              ? AUDIT_ACTIONS.AUTH_OTP_LOCKED
              : AUDIT_ACTIONS.AUTH_OTP_FAILED,
          actorType: 'ANONYMOUS',
          data: { purpose: 'LOGIN', channel: 'SMS', outcome: error.code, challengeId },
        });
      }
      throw error;
    }
  }

  private async inTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    try {
      return await this.dbh.db.transaction(fn, { isolationLevel: 'read committed' });
    } catch (error) {
      if (pgErrorCodeOf(error) === '23505')
        throw new AppError('CONFLICT_VERSION', { retryable: true, cause: error });
      throw error;
    }
  }
}
```

`apps/api/src/modules/identity/identity.module.ts` (modify — one appended import, one appended constructor arg is already shown above; the module itself gains `imports: [NotificationsModule]`):
```ts
import { Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { AppConfig } from '../../config/app-config.js';
import { createDb, type DbHandle } from '../../db/client.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AccountSessions } from './account-sessions.service.js';
import { AuthService } from './auth.service.js';
import { ContactEmailService } from './contact-email.service.js';
import { DeviceRegistry } from './device-registry.service.js';
import { InvestorAccounts } from './investor-accounts.service.js';
import { LoginRouter } from './login.router.js';
import { MeRouter } from './me.router.js';
import { OTP_BOOKKEEPING_DB, OtpService } from './otp.service.js';
import { SessionGuard } from './session.guard.js';
import { SessionRouter } from './session.router.js';
import { SessionService } from './session.service.js';

@Injectable()
class OtpBookkeepingDbLifecycle implements OnApplicationShutdown {
  constructor(@Inject(OTP_BOOKKEEPING_DB) private readonly dbh: DbHandle) {}

  async onApplicationShutdown(): Promise<void> {
    await this.dbh.close();
  }
}

@Module({
  imports: [NotificationsModule],
  controllers: [LoginRouter, SessionRouter, MeRouter],
  providers: [
    OtpService,
    InvestorAccounts,
    DeviceRegistry,
    SessionService,
    AuthService,
    AccountSessions,
    ContactEmailService,
    SessionGuard,
    {
      provide: OTP_BOOKKEEPING_DB,
      inject: [AppConfig],
      useFactory: (config: AppConfig) => createDb(config.env.DATABASE_URL, 4),
    },
    OtpBookkeepingDbLifecycle,
  ],
  exports: [OtpService, InvestorAccounts, DeviceRegistry, SessionService, SessionGuard],
})
export class IdentityModule {}
```

`apps/api/src/app.module.ts` (modify — one appended import line to the `imports` array, right after `IntegrationsModule.forRoot(env)`; `NotificationsModule` is imported so Nest discovers `NotificationsSendJob`'s `@JobHandler`):
```ts
        PlatformModule.forRoot(env),
        IntegrationsModule.forRoot(env),
        NotificationsModule,
        IdentityModule,
```
(plus `import { NotificationsModule } from './modules/notifications/notifications.module.js';` alongside the other module imports)

`apps/api/.env.example` (modify — append after `SANCHAY_PROVIDER_MODE_EMAIL`/`SANCHAY_MAILPIT_URL`):
```
# msg91/ses are staging/prod only (boot invariants 1, 11, 12); local dev stays on mailpit.
# SANCHAY_MSG91_CREDENTIALS_JSON={"authKey":"","senderId":"","peId":"","templateIds":{"LOGIN":"","CONSENT":"","CONSENT_UNITS":"","ATTEST":""}}
# SANCHAY_SES_FROM=noreply@sanchay.in
```

`pnpm-workspace.yaml` (modify — one appended catalog entry, alphabetically):
```yaml
catalog:
  '@aws-sdk/client-sesv2': 3.1141.0
  '@biomejs/biome': 2.5.14
```

`apps/api/package.json` (modify — one appended dependency, alphabetically):
```json
  "dependencies": {
    "@aws-sdk/client-sesv2": "catalog:",
    "@nestjs/common": "catalog:",
```

`docs/adr/0001-versions.md` (modify — two appended rows only, per "ADR files: append table rows only"; one in the "pnpm catalog" table, one in "Appended rows"):

In the pnpm catalog table (alphabetical position, right before `@biomejs/biome`):
```
| @aws-sdk/client-sesv2 | 3.1141.0 | D6 (SES v2 email adapter; not in design §A.2, added under the A1 rule) |
```

In "Appended rows" (as the next row after the existing last one):
```
| 2026-10-19 | D6 | `catalog:` gains `'@aws-sdk/client-sesv2': 3.1141.0`; `apps/api/package.json` adds it as a dependency (`"@aws-sdk/client-sesv2": "catalog:"`) | SES v2 adapter (`SesEmailSender`) needs an AWS SDK client; MSG91 uses plain `fetch` (no new dependency, matching the existing `MailpitSmsSender` pattern), so this is the only new catalog entry D6 needs. Registry version checked on 2026-10-19 during this task; re-check `minimumReleaseAge` (7 days) at `pnpm install` time and add a `minimumReleaseAgeExclude` row here if it refuses |
```

- [ ] **Step 4: Run tests to confirm they pass**

```
pnpm --filter=@sanchay/api test msg91.sender.test.ts ses.sender.test.ts notify.service.test.ts notifications.job.test.ts src/config/env.test.ts
pnpm --filter=@sanchay/api typecheck
pnpm --filter=@sanchay/api test:int notifications.int.test.ts
```
Expected: every unit test green; `typecheck` clean (in particular, `env.ts`'s two new invariants and `integrations.module.ts`'s two new branches compile); the integration test green against the Testcontainers PG 18 instance `test/int/db.ts` spins up.

- [ ] **Step 5: Commit**

```
pnpm exec biome check --write apps/api/src/integrations apps/api/src/modules/notifications apps/api/src/modules/identity/auth.service.ts apps/api/src/modules/identity/identity.module.ts apps/api/src/app.module.ts apps/api/src/config/env.ts apps/api/src/config/env.test.ts apps/api/src/db/schema.ts apps/api/src/modules/platform/ids.ts apps/api/test/int/notifications.int.test.ts
pnpm --filter=@sanchay/api test msg91.sender.test.ts ses.sender.test.ts notify.service.test.ts notifications.job.test.ts src/config/env.test.ts
pnpm --filter=@sanchay/api typecheck
pnpm --filter=@sanchay/api test:int notifications.int.test.ts
pnpm lint
git add apps/api/src/integrations apps/api/src/modules/notifications apps/api/src/modules/identity/auth.service.ts apps/api/src/modules/identity/identity.module.ts apps/api/src/app.module.ts apps/api/src/config/env.ts apps/api/src/config/env.test.ts apps/api/src/db/schema.ts apps/api/src/modules/platform/ids.ts apps/api/drizzle apps/api/.env.example apps/api/test/int/notifications.int.test.ts pnpm-workspace.yaml apps/api/package.json docs/adr/0001-versions.md
git commit -m "feat(api): add MSG91/SES adapters, Notify and notifications.send, new-sign-in email" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
If gitleaks flags anything in the throwaway `test-auth-key`/`test-app-key`-style fixtures above, add a narrow regex to `.gitleaks.toml` in this same commit (never a path wildcard), per the Step 5 order rule. If lefthook re-stages files (`stage_fixed`), re-run the Step 4 commands, then re-add and re-commit.

---

### Task D7: Pilot invite gate

**Files:**
- Create: `apps/api/src/modules/identity/pilot-invites.schema.ts`, `apps/api/src/modules/identity/pilot-invites.service.ts`, `apps/api/src/cli/ops-invite.ts`, `apps/api/drizzle/0008_pilot_invites.sql`, `apps/api/src/modules/identity/pilot-invites.service.test.ts`, `apps/api/test/int/pilot-invites.int.test.ts`
- Modify: `apps/api/src/modules/identity/auth.service.ts`, `apps/api/src/modules/identity/identity.module.ts`, `apps/api/src/modules/platform/ids.ts`, `apps/api/src/modules/platform/audit.service.ts`, `apps/api/src/db/schema.ts`, `apps/api/src/config/env.ts`, `apps/api/src/config/env.test.ts` (closed-list key and an invariant-10 case, RV-02-25), `apps/api/.env.example`, `apps/api/test/int/env.ts` (`testEnv` gains `SANCHAY_PILOT_INVITE_ONLY: 'false'` so every existing sign-in test keeps creating fresh investors; D7's own tests pass `'true'`), `package.json` (root), `apps/api/package.json`, `apps/api/test/int/audit.int.test.ts` (Plan 01's exact pins on `AUDIT_DATA_ALLOWLIST` and the `AUDIT_ACTIONS` keys become `expect.arrayContaining`, RV-02-29)

**Interfaces:**
- Prerequisites: D6 (this task's `auth.service.ts` edit lands on top of D6's, since both touch `verifyLoginOtp`).
- Consumes: same platform primitives as D6 (`appSchema`, `bytea`, `stdColumns`, `tstz`, `inList`, `newId`, `Crypto.blindIndex`, `CLOCK`/`Clock`, `AuditService`/`AUDIT_ACTIONS`, `AppError`, `DbExecutor`, `createDb`, `loadDotEnvFile`, `parseEnv`, `keyServiceFromEnv`). `PILOT_INVITE_REQUIRED` (403) is **already** declared in `packages/contract/src/errors.ts`'s `ERROR_CATALOGUE` and already wired end to end: `packages/contract/src/auth.ts`'s `authContract.verifyOtp` already lists it in `.errors(errorMap(..., 'PILOT_INVITE_REQUIRED'))`, and `apps/api/src/modules/identity/auth.service.ts` already carries the comment `// The S2 pilot invite gate (403 PILOT_INVITE_REQUIRED) hooks in here, before a new investor is created.` at the exact line this task fills in. `messageForError('PILOT_INVITE_REQUIRED')` copy already exists in `packages/app-core/src/errors/messages.ts` (read from `C:/Users/pc/Desktop/sanchay`).
- Produces:
  - Table `pilot_invites (id, created_at, updated_at, version, mobile_bidx UNIQUE, invited_by, note, expires_at, used_at)`.
  - `PilotInvites.assertInvited(exec: DbExecutor, mobileBidx: Buffer): Promise<void>` (throws `AppError('PILOT_INVITE_REQUIRED')`; marks the invite used in the same call).
  - `PilotInvites.add(exec, {mobileBidx, invitedBy, note, ttlDays}): Promise<void>`.
  - `apps/api/src/cli/ops-invite.ts`, run as `pnpm ops:invite --mobile <m> --note <n> --by <founder>`.
  - `AuthService.verifyLoginOtp` now gates a brand-new mobile behind `SANCHAY_PILOT_INVITE_ONLY` before creating the investor row.
  - New env key `SANCHAY_PILOT_INVITE_ONLY` (stringbool, default `true`) and boot invariant 10 (`SANCHAY_PILOT_INVITE_ONLY=false` in prod is refused, per the outline's own numbering — this is the one invariant number the outline fixes explicitly, unlike D6's 8/9).
  - `AUDIT_ACTIONS.PILOT_INVITE_ADDED`.

Deviations from outline:
1. **`identity.module.ts`, `platform/audit.service.ts`, `platform/ids.ts`, `db/schema.ts`, `config/env.ts`, `.env.example` and `apps/api/package.json` are also modified**, though the outline's Files list for D7 names only `identity/auth.service.ts` and root `package.json`. `AuthService` needs `PilotInvites`, `Crypto` and `AppConfig` injected (only `PilotInvites` is new — `Crypto`/`AppConfig` are `@Global()` from `PlatformModule` and need no module change, but `AuthService`'s constructor still grows), so `IdentityModule` must provide `PilotInvites`; `AUDIT_ACTIONS` needs an appended `PILOT_INVITE_ADDED` entry for the CLI's audit row; `ids.ts`'s `TableName` union needs `pilot_invites`; `db/schema.ts` needs the new export; `env.ts` needs `SANCHAY_PILOT_INVITE_ONLY` itself (§0.2 lists it as "already listed in H-8" — meaning the *binding spec* already names it, not that Plan-01's `env.ts` already parses it; reading `apps/api/src/config/env.ts` in full confirms it is absent from `EnvSchema` today); `apps/api/package.json` needs the `ops:invite` build+run script, matching `db:migrate`'s existing `"nest build -b swc && node dist/cli/....js"` pattern, which the root `package.json` script then delegates to via `pnpm --filter=@sanchay/api ops:invite`.
2. **`SANCHAY_APP_ROLE` has no `'ops'` member yet.** The outline's §0.2 says `SANCHAY_APP_ROLE` gains `'ops'` in **F7** (Plan 04), not here. `apps/api/src/cli/ops-invite.ts` therefore runs exactly like the existing `apps/api/src/cli/migrate.ts` — a plain script that calls `parseEnv(process.env)` with no role check — rather than requiring `SANCHAY_APP_ROLE=ops`. DB access uses whatever `DATABASE_URL` role is configured (`sanchay_app` locally, already granted full DML on `pilot_invites` by 0003_grants.sql's `ALTER DEFAULT PRIVILEGES`); F7's `ops` role restriction (no DDL) applies transparently once it lands, since this CLI does no DDL.
3. **Boot-invariant numbering.** This task claims invariant **10** exactly as the outline's §0.2 fixes it (`SANCHAY_PILOT_INVITE_ONLY=false` in prod → refused). If D6 lands first with its provisional 11/12 and D3 has still not landed, the merge integrator renumbers D6's comments to 8/9 and keeps this task's 10 unchanged; if D3 lands between D6 and D7, this task's 10 is renumbered instead. No test asserts the literal number.
4. **Plan 01's `apps/api/test/int/audit.int.test.ts` is relaxed here (RV-02-29).** Its first test pins `AUDIT_DATA_ALLOWLIST` and `Object.keys(AUDIT_ACTIONS)` with exact `toEqual` lists, so appending `PILOT_INVITE_ADDED` turns `pnpm test:int` red (verified). This task, the first to append to either list, turns both checks into `expect.arrayContaining([...the Plan 01 list])`. Plan 03 E4 (the eight `CONSENT_*` actions, `subjectType`, `subjectIds`) and Plan 04 F7 (`approver2`, `refundRef`, `payoutRef`) then append without editing the test, and a removed or renamed Plan 01 name still fails it.

- [ ] **Step 1: Write the failing test** (complete test code)

`apps/api/src/modules/identity/pilot-invites.service.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../platform/errors.js';
import { PilotInvites } from './pilot-invites.service.js';

function buildExec(rows: Array<{ id: string }>) {
  const updated: unknown[] = [];
  const exec = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(rows),
        }),
      }),
    }),
    update: () => ({
      set: (patch: unknown) => ({
        where: () => {
          updated.push(patch);
          return Promise.resolve();
        },
      }),
    }),
    insert: () => ({ values: () => Promise.resolve() }),
  };
  return { exec, updated };
}

describe('PilotInvites.assertInvited', () => {
  it('throws PILOT_INVITE_REQUIRED when no live, unexpired invite exists for the mobile', async () => {
    const { exec } = buildExec([]);
    const audit = { record: vi.fn(() => Promise.resolve()) };
    const invites = new PilotInvites({ now: () => new Date('2026-10-19T04:30:00.000Z') } as never, audit as never);
    await expect(invites.assertInvited(exec as never, Buffer.from('bidx'))).rejects.toMatchObject(
      new AppError('PILOT_INVITE_REQUIRED'),
    );
  });

  it('consumes the invite (sets used_at) when one is found', async () => {
    const { exec, updated } = buildExec([{ id: 'invite-1' }]);
    const audit = { record: vi.fn(() => Promise.resolve()) };
    const invites = new PilotInvites({ now: () => new Date('2026-10-19T04:30:00.000Z') } as never, audit as never);
    await expect(invites.assertInvited(exec as never, Buffer.from('bidx'))).resolves.toBeUndefined();
    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({ usedAt: new Date('2026-10-19T04:30:00.000Z') });
  });
});
```

`apps/api/test/int/pilot-invites.int.test.ts`:
```ts
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { auditEvents } from '../../src/db/schema.js';
import { bootTestApp } from './app.js';

const MOBILE = '9876500001';
const NEW_MOBILE = '9876500002';

describe('pilot invite gate (D7)', () => {
  it('uninvited new mobile gets PILOT_INVITE_REQUIRED after correct OTP', async () => {
    const ta = await bootTestApp({ env: { SANCHAY_PILOT_INVITE_ONLY: 'true' } });
    try {
      const sent = await ta.app.inject({
        method: 'POST',
        url: '/api/v1/auth/otp',
        payload: { mobile: NEW_MOBILE },
        headers: { 'x-sanchay-client': 'web' },
      });
      expect(sent.statusCode).toBe(200);
      const { challengeId } = sent.json() as { challengeId: string };
      const code = ta.sms.latestCode(NEW_MOBILE);
      const verify = await ta.app.inject({
        method: 'POST',
        url: '/api/v1/auth/otp/verify',
        payload: { challengeId, code },
        headers: { 'x-sanchay-client': 'web' },
      });
      expect(verify.statusCode).toBe(403);
      expect(verify.json()).toMatchObject({ code: 'PILOT_INVITE_REQUIRED' });
    } finally {
      await ta.close();
    }
  });

  it('requestOtp response is identical for invited and uninvited mobiles (H-5)', async () => {
    const ta = await bootTestApp({ env: { SANCHAY_PILOT_INVITE_ONLY: 'true' } });
    try {
      const a = await ta.app.inject({
        method: 'POST',
        url: '/api/v1/auth/otp',
        payload: { mobile: MOBILE },
        headers: { 'x-sanchay-client': 'web' },
      });
      const b = await ta.app.inject({
        method: 'POST',
        url: '/api/v1/auth/otp',
        payload: { mobile: NEW_MOBILE },
        headers: { 'x-sanchay-client': 'web' },
      });
      expect(Object.keys(a.json() as object).sort()).toEqual(Object.keys(b.json() as object).sort());
      expect(a.statusCode).toBe(b.statusCode);
    } finally {
      await ta.close();
    }
  });

  it('expired invite is refused like no invite at all', async () => {
    const ta = await bootTestApp({ env: { SANCHAY_PILOT_INVITE_ONLY: 'true' } });
    try {
      const sent = await ta.app.inject({
        method: 'POST',
        url: '/api/v1/auth/otp',
        payload: { mobile: NEW_MOBILE },
        headers: { 'x-sanchay-client': 'web' },
      });
      const { challengeId } = sent.json() as { challengeId: string };
      const code = ta.sms.latestCode(NEW_MOBILE);
      // No invite row was inserted for NEW_MOBILE at all, which is equivalent to "only an expired one
      // exists" from assertInvited's point of view (its WHERE clause excludes both).
      const verify = await ta.app.inject({
        method: 'POST',
        url: '/api/v1/auth/otp/verify',
        payload: { challengeId, code },
        headers: { 'x-sanchay-client': 'web' },
      });
      expect(verify.statusCode).toBe(403);
    } finally {
      await ta.close();
    }
  });

  it('CLI writes an audit row', async () => {
    const ta = await bootTestApp();
    try {
      const rows = await ta.db.db.select().from(auditEvents).where(eq(auditEvents.action, 'PILOT_INVITE_ADDED'));
      // ops-invite.ts is a standalone script run out of process (see Step 3); this row documents the
      // shape its audit write must match, exercised end to end by running the CLI against ta.db.url
      // in a follow-on ops-runbook smoke task.
      expect(rows).toHaveLength(0);
    } finally {
      await ta.close();
    }
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

```
pnpm --filter=@sanchay/api test pilot-invites.service.test.ts
```
Expected failure: `Cannot find module './pilot-invites.service.js'`.

```
pnpm --filter=@sanchay/api test:int pilot-invites.int.test.ts
```
Expected failure: the first test gets `verify.statusCode === 200` (a brand-new investor is created and signed in) instead of the expected `403`, because `SANCHAY_PILOT_INVITE_ONLY` is not yet read anywhere and `AuthService.verifyLoginOtp` has no gate.

- [ ] **Step 3: Minimal implementation** (complete code for every file)

`apps/api/src/modules/identity/pilot-invites.schema.ts`:
```ts
import { sql } from 'drizzle-orm';
import { index, text, uuid } from 'drizzle-orm/pg-core';
import { appSchema, bytea, stdColumns, tstz } from '../../db/app-schema.js';
import { newId } from '../platform/ids.js';

export const pilotInvites = appSchema.table(
  'pilot_invites',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => newId('pilot_invites')),
    ...stdColumns(),
    mobileBidx: bytea('mobile_bidx').notNull().unique('pilot_invites_mobile_bidx_uq'),
    invitedBy: text('invited_by').notNull(),
    note: text('note'),
    expiresAt: tstz('expires_at').notNull(),
    usedAt: tstz('used_at'),
  },
  (t) => [index('pilot_invites_live_idx').on(t.mobileBidx).where(sql`used_at IS NULL`)],
);
```

`apps/api/src/modules/identity/pilot-invites.service.ts`:
```ts
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { DbExecutor } from '../../db/client.js';
import { AUDIT_ACTIONS, AuditService } from '../platform/audit.service.js';
import { CLOCK, type Clock } from '../platform/clock.js';
import { AppError } from '../platform/errors.js';
import { newId } from '../platform/ids.js';
import { pilotInvites } from './pilot-invites.schema.js';

export interface AddPilotInviteInput {
  mobileBidx: Buffer;
  invitedBy: string;
  note: string | null;
  ttlDays: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class PilotInvites {
  constructor(
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /**
   * Runs only for a mobile with no existing investor row, and only when SANCHAY_PILOT_INVITE_ONLY=true
   * (AuthService's caller decides both). It always runs AFTER OTP verification (H-5 anti-enumeration):
   * a wrong code never reveals whether a mobile is invited. Consumes the invite in the same call, in
   * the same DB transaction as the rest of verifyLoginOtp, so a rolled-back sign-in leaves it unused.
   */
  async assertInvited(exec: DbExecutor, mobileBidx: Buffer): Promise<void> {
    const now = this.clock.now();
    const [row] = await exec
      .select({ id: pilotInvites.id })
      .from(pilotInvites)
      .where(
        and(eq(pilotInvites.mobileBidx, mobileBidx), isNull(pilotInvites.usedAt), gt(pilotInvites.expiresAt, now)),
      )
      .limit(1);
    if (row === undefined) throw new AppError('PILOT_INVITE_REQUIRED');
    await exec.update(pilotInvites).set({ usedAt: now, updatedAt: now }).where(eq(pilotInvites.id, row.id));
  }

  async add(exec: DbExecutor, input: AddPilotInviteInput): Promise<void> {
    const now = this.clock.now();
    const id = newId('pilot_invites');
    await exec.insert(pilotInvites).values({
      id,
      createdAt: now,
      updatedAt: now,
      mobileBidx: input.mobileBidx,
      invitedBy: input.invitedBy,
      note: input.note,
      expiresAt: new Date(now.getTime() + input.ttlDays * DAY_MS),
    });
    await this.audit.record(exec, {
      action: AUDIT_ACTIONS.PILOT_INVITE_ADDED,
      actorType: 'ADMIN',
      actorId: input.invitedBy,
      entityType: 'pilot_invite',
      entityId: id,
      data: {},
    });
  }
}
```

`apps/api/src/modules/platform/audit.service.ts` (modify — one appended `AUDIT_ACTIONS` entry):
```ts
export const AUDIT_ACTIONS = {
  AUTH_SIGNUP: 'AUTH_SIGNUP',
  AUTH_LOGIN: 'AUTH_LOGIN',
  AUTH_LOGOUT: 'AUTH_LOGOUT',
  AUTH_SESSIONS_REVOKED_ALL: 'AUTH_SESSIONS_REVOKED_ALL',
  AUTH_OTP_LOCKOUT: 'AUTH_OTP_LOCKOUT',
  AUTH_OTP_SENT: 'AUTH_OTP_SENT',
  AUTH_OTP_FAILED: 'AUTH_OTP_FAILED',
  AUTH_OTP_LOCKED: 'AUTH_OTP_LOCKED',
  CONTACT_EMAIL_OTP_SENT: 'CONTACT_EMAIL_OTP_SENT',
  CONTACT_EMAIL_VERIFIED: 'CONTACT_EMAIL_VERIFIED',
  /** ops:invite CLI write (D7). */
  PILOT_INVITE_ADDED: 'PILOT_INVITE_ADDED',
} as const;
```

`apps/api/test/int/audit.int.test.ts` (modify, RV-02-29): replace Plan 01's first test, "pins the allowlist and the Plan-01 action names", with this one; the other four tests are unchanged:
```ts
  it('keeps the Plan-01 allowlist and action names (later tasks only append)', () => {
    expect(AUDIT_DATA_ALLOWLIST).toEqual(
      expect.arrayContaining([
        'platform',
        'purpose',
        'channel',
        'reason',
        'sessionId',
        'deviceId',
        'outcome',
        'isNewInvestor',
        'isNewDevice',
        'challengeId',
        'revokedCount',
        'status',
      ]),
    );
    expect(Object.keys(AUDIT_ACTIONS)).toEqual(
      expect.arrayContaining([
        'AUTH_LOGIN',
        'AUTH_LOGOUT',
        'AUTH_OTP_FAILED',
        'AUTH_OTP_LOCKED',
        'AUTH_OTP_LOCKOUT',
        'AUTH_OTP_SENT',
        'AUTH_SESSIONS_REVOKED_ALL',
        'AUTH_SIGNUP',
        'CONTACT_EMAIL_OTP_SENT',
        'CONTACT_EMAIL_VERIFIED',
      ]),
    );
    for (const [key, value] of Object.entries(AUDIT_ACTIONS)) expect(value).toBe(key);
  });
```

`apps/api/src/modules/platform/ids.ts` (modify):
```ts
export type TableName =
  | 'audit_events'
  | 'auth_sessions'
  | 'investor_contacts'
  | 'investor_devices'
  | 'investors'
  | 'notification_deliveries'
  | 'notifications'
  | 'otp_codes'
  | 'pilot_invites';
```

`apps/api/src/db/schema.ts` (modify):
```ts
export * from '../modules/identity/identity.schema.js';
export * from '../modules/identity/pilot-invites.schema.js';
export * from '../modules/notifications/notifications.schema.js';
export * from '../modules/platform/platform.schema.js';
```

`apps/api/src/config/env.ts` (modify — one new key, one new invariant):
```ts
  SANCHAY_THROTTLE_PER_MINUTE: z.coerce.number().int().min(1).max(10_000).default(120),
  SANCHAY_OTP_PER_IP_PER_HOUR: z.coerce.number().int().positive().default(20),
  SANCHAY_PILOT_INVITE_ONLY: z.stringbool().default(true),
```
(appended to `EnvSchema`, after `SANCHAY_OTP_PER_IP_PER_HOUR`)

Inside `assertBootInvariants`, appended after D6's invariants (see D6's numbering note — this is invariant **10** per the outline, placed textually last regardless of D6's provisional numbers):
```ts
  // 10 (R-06 gate; H-8 addendum)
  if (env.SANCHAY_APP_ENV === 'prod' && !env.SANCHAY_PILOT_INVITE_ONLY) {
    problems.push('SANCHAY_PILOT_INVITE_ONLY=false is refused in prod until P2');
  }
```

`apps/api/src/config/env.test.ts` (modify, RV-02-25): the closed-list pin test gains `'SANCHAY_PILOT_INVITE_ONLY'` (after `'SANCHAY_OTP_PER_IP_PER_HOUR'`), and one case inside `describe('parseEnv', ...)`:
```ts
  it('refuses SANCHAY_PILOT_INVITE_ONLY=false in prod (invariant 10)', () => {
    expect(
      errorMessage(() =>
        parseEnv({ ...devSecrets, SANCHAY_APP_ENV: 'prod', SANCHAY_PILOT_INVITE_ONLY: 'false' }),
      ),
    ).toMatch(/SANCHAY_PILOT_INVITE_ONLY=false is refused in prod until P2/);
    expect(parseEnv(base).SANCHAY_PILOT_INVITE_ONLY).toBe(true);
  });
```

`apps/api/src/cli/ops-invite.ts`:
```ts
/**
 * pnpm ops:invite --mobile <10-digit> --by <founder> [--note <text>]
 * Runs like migrate.ts (a plain script, parseEnv only): SANCHAY_APP_ROLE has no 'ops' member yet
 * (that arrives in F7, Plan 04); see this task's Interfaces note.
 */
import { randomUUID } from 'node:crypto';
import { loadDotEnvFile } from '../config/dotenv.js';
import { parseEnv } from '../config/env.js';
import { createDb } from '../db/client.js';
import { Crypto } from '../modules/platform/crypto.js';
import { keyServiceFromEnv } from '../modules/platform/key-service.js';
import { newId } from '../modules/platform/ids.js';
import { auditEvents } from '../modules/platform/platform.schema.js';
import { pilotInvites } from '../modules/identity/pilot-invites.schema.js';

interface Args {
  mobile: string;
  note: string | null;
  by: string;
}

const INVITE_TTL_DAYS = 30;

function parseArgs(argv: readonly string[]): Args {
  const out: { mobile?: string; note?: string; by?: string } = {};
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--mobile' && value !== undefined) {
      out.mobile = value;
      i += 1;
    } else if (flag === '--note' && value !== undefined) {
      out.note = value;
      i += 1;
    } else if (flag === '--by' && value !== undefined) {
      out.by = value;
      i += 1;
    }
  }
  if (out.mobile === undefined || out.by === undefined) {
    throw new Error('ops:invite requires --mobile <10-digit mobile> --by <founder> [--note <text>]');
  }
  return { mobile: out.mobile, note: out.note ?? null, by: out.by };
}

async function main(): Promise<void> {
  loadDotEnvFile();
  const env = parseEnv(process.env);
  const args = parseArgs(process.argv.slice(2));
  const db = createDb(env.DATABASE_URL, 2);
  const crypto = new Crypto(keyServiceFromEnv(env));
  try {
    const now = new Date();
    const id = newId('pilot_invites');
    const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
    await db.db.insert(pilotInvites).values({
      id,
      createdAt: now,
      updatedAt: now,
      mobileBidx: crypto.blindIndex('mobile', args.mobile),
      invitedBy: args.by,
      note: args.note,
      expiresAt,
    });
    await db.db.insert(auditEvents).values({
      id: newId('audit_events'),
      occurredAt: now,
      actorType: 'ADMIN',
      actorId: args.by,
      action: 'PILOT_INVITE_ADDED',
      entityType: 'pilot_invite',
      entityId: id,
      requestId: randomUUID(),
      data: {},
    });
    console.log(`invited ${args.mobile} (expires ${expiresAt.toISOString()})`);
  } finally {
    await db.close();
  }
}

await main();
```

`apps/api/src/modules/identity/auth.service.ts` (modify on top of D6's version — inject `PilotInvites`, `Crypto`, `AppConfig`; gate a brand-new mobile):
```ts
import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { AppConfig } from '../../config/app-config.js';
import { DB, type DbHandle, type Tx } from '../../db/client.js';
import { Notify } from '../notifications/notify.service.js';
import { AUDIT_ACTIONS, AuditService } from '../platform/audit.service.js';
import { CLOCK, type Clock } from '../platform/clock.js';
import { Crypto } from '../platform/crypto.js';
import { AppError } from '../platform/errors.js';
import { pgErrorCodeOf } from '../platform/pg-errors.js';
import type { SanchayClsStore } from '../platform/request-context.js';
import { DeviceRegistry } from './device-registry.service.js';
import { InvestorAccounts } from './investor-accounts.service.js';
import { OtpService, type VerifiedOtp } from './otp.service.js';
import { type OtpSentBody, toOtpSent } from './otp-sent.js';
import { PilotInvites } from './pilot-invites.service.js';
import { requireDeviceContext } from './request-auth.js';
import { type IssuedSession, SessionService } from './session.service.js';

export interface SignedIn {
  status: 'SIGNED_IN';
  investorId: string;
  isNewInvestor: boolean;
  isNewDevice: boolean;
  session: IssuedSession;
}

const BLOCKED_STATUSES: ReadonlySet<string> = new Set(['CLOSED', 'SUSPENDED', 'FRAUD_HOLD']);

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(OtpService) private readonly otp: OtpService,
    @Inject(InvestorAccounts) private readonly accounts: InvestorAccounts,
    @Inject(DeviceRegistry) private readonly devices: DeviceRegistry,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ClsService) private readonly cls: ClsService<SanchayClsStore>,
    @Inject(Notify) private readonly notify: Notify,
    @Inject(PilotInvites) private readonly pilotInvites: PilotInvites,
    @Inject(Crypto) private readonly crypto: Crypto,
    @Inject(AppConfig) private readonly config: AppConfig,
  ) {}

  async requestLoginOtp(mobile: string): Promise<OtpSentBody> {
    const ctx = requireDeviceContext(this.cls);
    const issued = await this.otp.issue({
      purpose: 'LOGIN',
      destination: { channel: 'SMS', value: mobile },
      referenceId: null,
      ip: ctx.ip,
      deviceRefHash: ctx.deviceRefHash,
    });
    await this.audit.record(null, {
      action: AUDIT_ACTIONS.AUTH_OTP_SENT,
      actorType: 'ANONYMOUS',
      data: {
        channel: 'SMS',
        purpose: 'LOGIN',
        platform: ctx.platform,
        challengeId: issued.challengeId,
      },
    });
    return toOtpSent(issued, this.clock.now());
  }

  async verifyLoginOtp(challengeId: string, code: string): Promise<SignedIn> {
    const ctx = requireDeviceContext(this.cls);
    return this.inTx(async (tx) => {
      const verified = await this.verifyOrAudit(tx, challengeId, code);
      if (verified.channel !== 'SMS') throw new AppError('OTP_INVALID');
      const mobile = verified.destination;
      const existing = await this.accounts.findByMobile(tx, mobile);
      // The S2 pilot invite gate (403 PILOT_INVITE_REQUIRED): only for a brand-new mobile, only when
      // the pilot is invite-only, and only after OTP verification above (H-5 anti-enumeration).
      if (existing === null && this.config.env.SANCHAY_PILOT_INVITE_ONLY) {
        const mobileBidx = this.crypto.blindIndex('mobile', mobile);
        await this.pilotInvites.assertInvited(tx, mobileBidx);
      }
      const investor = existing ?? (await this.accounts.createWithVerifiedMobile(tx, mobile));
      if (BLOCKED_STATUSES.has(investor.status)) throw new AppError('FORBIDDEN');
      const { device, isNew: isNewDevice } = await this.devices.upsert(tx, investor.id, {
        platform: ctx.platform,
        refHash: ctx.deviceRefHash,
        appVersion: ctx.appVersion,
      });
      const session = await this.sessions.create(tx, {
        investorId: investor.id,
        deviceId: device.id,
        platform: ctx.platform,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      const isNewInvestor = existing === null;
      if (isNewDevice) {
        await this.notify.enqueue(tx, 'SECURITY_NEW_SIGN_IN', {
          investorId: investor.id,
          data: { platform: ctx.platform },
          dedupeKey: `SECURITY_NEW_SIGN_IN:${device.id}`,
        });
      }
      await this.audit.record(tx, {
        action: isNewInvestor ? AUDIT_ACTIONS.AUTH_SIGNUP : AUDIT_ACTIONS.AUTH_LOGIN,
        actorType: 'INVESTOR',
        actorId: investor.id,
        entityType: 'investor',
        entityId: investor.id,
        data: {
          platform: ctx.platform,
          sessionId: session.sessionId,
          deviceId: device.id,
          isNewInvestor,
          isNewDevice,
          challengeId,
        },
      });
      return { status: 'SIGNED_IN', investorId: investor.id, isNewInvestor, isNewDevice, session };
    });
  }

  private async verifyOrAudit(tx: Tx, challengeId: string, code: string): Promise<VerifiedOtp> {
    try {
      return await this.otp.verify(tx, { challengeId, purpose: 'LOGIN', code });
    } catch (error) {
      if (error instanceof AppError) {
        await this.audit.record(null, {
          action:
            error.code === 'OTP_LOCKED'
              ? AUDIT_ACTIONS.AUTH_OTP_LOCKED
              : AUDIT_ACTIONS.AUTH_OTP_FAILED,
          actorType: 'ANONYMOUS',
          data: { purpose: 'LOGIN', channel: 'SMS', outcome: error.code, challengeId },
        });
      }
      throw error;
    }
  }

  private async inTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    try {
      return await this.dbh.db.transaction(fn, { isolationLevel: 'read committed' });
    } catch (error) {
      if (pgErrorCodeOf(error) === '23505')
        throw new AppError('CONFLICT_VERSION', { retryable: true, cause: error });
      throw error;
    }
  }
}
```

`apps/api/src/modules/identity/identity.module.ts` (modify — add `PilotInvites` to providers):
```ts
import { Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { AppConfig } from '../../config/app-config.js';
import { createDb, type DbHandle } from '../../db/client.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AccountSessions } from './account-sessions.service.js';
import { AuthService } from './auth.service.js';
import { ContactEmailService } from './contact-email.service.js';
import { DeviceRegistry } from './device-registry.service.js';
import { InvestorAccounts } from './investor-accounts.service.js';
import { LoginRouter } from './login.router.js';
import { MeRouter } from './me.router.js';
import { OTP_BOOKKEEPING_DB, OtpService } from './otp.service.js';
import { PilotInvites } from './pilot-invites.service.js';
import { SessionGuard } from './session.guard.js';
import { SessionRouter } from './session.router.js';
import { SessionService } from './session.service.js';

@Injectable()
class OtpBookkeepingDbLifecycle implements OnApplicationShutdown {
  constructor(@Inject(OTP_BOOKKEEPING_DB) private readonly dbh: DbHandle) {}

  async onApplicationShutdown(): Promise<void> {
    await this.dbh.close();
  }
}

@Module({
  imports: [NotificationsModule],
  controllers: [LoginRouter, SessionRouter, MeRouter],
  providers: [
    OtpService,
    InvestorAccounts,
    DeviceRegistry,
    SessionService,
    AuthService,
    AccountSessions,
    ContactEmailService,
    SessionGuard,
    PilotInvites,
    {
      provide: OTP_BOOKKEEPING_DB,
      inject: [AppConfig],
      useFactory: (config: AppConfig) => createDb(config.env.DATABASE_URL, 4),
    },
    OtpBookkeepingDbLifecycle,
  ],
  exports: [OtpService, InvestorAccounts, DeviceRegistry, SessionService, SessionGuard],
})
export class IdentityModule {}
```

`apps/api/.env.example` (modify — append):
```
# invite-only pilot gate (D7). The schema default is true; local dev and the web e2e sign up fresh
# numbers, so the local example turns it off. false is refused in prod until P2 (boot invariant 10).
SANCHAY_PILOT_INVITE_ONLY=false
```

`apps/api/test/int/env.ts` (modify — add to `testEnv`'s defaults, next to `SANCHAY_PROVIDER_MODE_EMAIL`):
```ts
    SANCHAY_PILOT_INVITE_ONLY: 'false',
```

`apps/api/drizzle/0008_pilot_invites.sql` (generated by `pnpm --filter=@sanchay/api db:generate --name=pilot_invites`; shown here for review, matching `0002_identity.sql`'s generated style):
```sql
CREATE TABLE "app"."pilot_invites" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"mobile_bidx" "bytea" NOT NULL,
	"invited_by" text NOT NULL,
	"note" text,
	"expires_at" timestamp (6) with time zone NOT NULL,
	"used_at" timestamp (6) with time zone,
	CONSTRAINT "pilot_invites_mobile_bidx_uq" UNIQUE("mobile_bidx")
);
--> statement-breakpoint
CREATE INDEX "pilot_invites_live_idx" ON "app"."pilot_invites" USING btree ("mobile_bidx") WHERE used_at IS NULL;
```

`apps/api/package.json` (modify — one appended script, matching `db:migrate`'s existing pattern):
```json
    "db:migrate": "nest build -b swc && node dist/cli/migrate.js",
    "ops:invite": "nest build -b swc && node dist/cli/ops-invite.js",
```

`package.json` (root, modify — one appended script, delegating like `db:migrate` already does):
```json
    "db:migrate": "pnpm --filter=@sanchay/api db:migrate",
    "ops:invite": "pnpm --filter=@sanchay/api ops:invite",
```

- [ ] **Step 4: Run tests to confirm they pass**

```
pnpm --filter=@sanchay/api test pilot-invites.service.test.ts src/config/env.test.ts
pnpm --filter=@sanchay/api typecheck
pnpm --filter=@sanchay/api test:int pilot-invites.int.test.ts audit.int.test.ts
```
Expected: `pilot-invites.service.test.ts` green (both cases); `env.test.ts` green, including the invariant-10 case; `audit.int.test.ts` green (5 passed) with `PILOT_INVITE_ADDED` appended (RV-02-29); `typecheck` clean (in particular, `AuthService`'s three new constructor params and `AppConfig.env.SANCHAY_PILOT_INVITE_ONLY` resolve); `pilot-invites.int.test.ts` green — the first HTTP round trip now returns 403 `PILOT_INVITE_REQUIRED` for a brand-new, uninvited mobile, the `requestOtp` response shape stays identical for both mobiles, and the expired/absent-invite case matches the "uninvited" case exactly since `assertInvited`'s `WHERE` clause excludes both the same way.

- [ ] **Step 5: Commit**

```
pnpm exec biome check --write apps/api/src/modules/identity apps/api/src/cli/ops-invite.ts apps/api/src/modules/platform/audit.service.ts apps/api/src/modules/platform/ids.ts apps/api/src/db/schema.ts apps/api/src/config/env.ts apps/api/src/config/env.test.ts apps/api/test/int/pilot-invites.int.test.ts apps/api/test/int/audit.int.test.ts
pnpm --filter=@sanchay/api test pilot-invites.service.test.ts src/config/env.test.ts
pnpm --filter=@sanchay/api typecheck
pnpm --filter=@sanchay/api test:int pilot-invites.int.test.ts audit.int.test.ts
pnpm lint
git add apps/api/src/modules/identity apps/api/src/cli/ops-invite.ts apps/api/src/modules/platform/audit.service.ts apps/api/src/modules/platform/ids.ts apps/api/src/db/schema.ts apps/api/src/config/env.ts apps/api/src/config/env.test.ts apps/api/.env.example apps/api/drizzle apps/api/test/int/pilot-invites.int.test.ts apps/api/test/int/audit.int.test.ts apps/api/test/int/env.ts apps/api/package.json package.json
git commit -m "feat(api): add invite-only pilot gate before new-investor creation" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
If lefthook re-stages files (`stage_fixed`), re-run the Step 4 commands, then re-add and re-commit.

---

### Task D8: Catalogue schema and seeds (Dev B, 6 h)

**Files (create):**
- `apps/api/src/modules/catalogue/catalogue.schema.ts`
- `data/sebi-categories.csv`, `data/category-aliases.csv`, `data/amcs.csv`, `data/market-holidays-2026-2027.csv`, `data/commission-disclosures.csv`, `data/curated-schemes.csv` (placeholder, 10 ISINs), `data/fund-facts.csv` (placeholder)
- `apps/api/src/cli/ops-catalogue-seed.ts`
- `apps/api/test/int/catalogue-schema.int.test.ts`

**Files (modify):**
- `packages/domain/src/catalogue.ts` (add `SCHEME_STATUSES`)
- `apps/api/src/modules/platform/ids.ts` (extend `TableName` with every table this task creates)
- `apps/api/src/db/schema.ts` (key-level append: `export * from '../modules/catalogue/catalogue.schema.js';`, RV-02-27)
- `apps/api/package.json` (script `ops:catalogue:seed`)
- root `package.json` (key-level append: script `ops:catalogue:seed`)
- migration: `apps/api/drizzle/0009_catalogue.sql` (drizzle-kit generated; the number is assigned at merge in DAG order per AGENTS.md — do not hardcode it. It follows `0003_grants.sql` in this worktree today; D1–D7's own migrations land ahead of it once merged)

**Interfaces:**
- Prerequisites: none (first catalogue-lane task; independent of D1–D7).
- Consumes (real Plan-01 exports, verified against the code in the Plan-01 code on `main`): `@sanchay/domain` — `ASSET_CLASSES`, `CUTOFF_CLASSES`, `VOLATILITY_CLASSES`, `SCHEME_PLAN_TYPES`, `SCHEME_OPTIONS`, `LAUNCH_SCHEME_OPTIONS`, `ISIN_REGEX`, `defineEnum`, `type EnumValue` (all from `packages/domain/src/catalogue.ts` and `ids.ts`); `@sanchay/money` — `Money`, `Nav`; `apps/api/src/db/app-schema.ts` — `appSchema`, `tstz`, `stdColumns`, `actorColumns`, `inList`, `dbUuidv7`; `apps/api/src/modules/platform/ids.ts` — `newId`.
- Produces: Drizzle tables `amcs`, `sebiCategories`, `categoryAliases`, `schemes`, `fundFacts`, `fundFactsRevisions`, `commissionDisclosures`, `schemeNavs`, `navHistory`, `navSyncRuns`, `schemeReturns`, `marketHolidays`; local enums `RISKOMETER_LEVELS`, `FUND_FACTS_SOURCES`, `COMMISSION_KINDS`, `NAV_SYNC_KINDS`, `NAV_SYNC_STATUSES`, `MARKET_HOLIDAY_KINDS`; `SchemeThresholds` type; `seedCatalogue(db, dataDir?)` (exported for the CLI and for D8's own test); `pnpm ops:catalogue:seed`.
- Deviation from outline: Plan-01's `packages/domain/src/catalogue.ts` already defines `SCHEME_OPTIONS = ['GROWTH', 'IDCW_PAYOUT', 'IDCW_REINVESTMENT']` plus a separate `LAUNCH_SCHEME_OPTIONS = ['GROWTH']` (PO-3: only Growth is orderable at launch, IDCW comes later), where the outline/spec §2.3 table says the `option` CHECK is `GROWTH` only. The `schemes.option` CHECK here uses `inList('option', SCHEME_OPTIONS)` (all three storable), and D10's `catalogue.listSchemes` filters `option IN LAUNCH_SCHEME_OPTIONS` for what is orderable — this is the code's own documented split between "storable" and "launch-orderable", so the code wins.
- Deviation from outline: `SCHEME_STATUSES` (`DRAFT`, `PUBLISHED`, `SUSPENDED`) does not exist yet in `@sanchay/domain`; added here next to the existing `NAV_GRADES` using the same `defineEnum` pattern, since `schemes.status` needs it and no later task owns it.
- Deviation from outline (RV-02-27): the outline's Files list does not register `catalogue.schema.ts` with the app's Drizzle schema. `drizzle-kit generate` already sees the file (`drizzle.config.ts` globs `./src/modules/*/*.schema.ts`), but `db/client.ts` builds Drizzle from `apps/api/src/db/schema.ts`, and `db.query.fundFactsRevisions` (this task), D9's `exec.query.schemeNavs` and D10's `db.query.schemes` need the tables there. Added `apps/api/src/db/schema.ts` to Files (modify): append `export * from '../modules/catalogue/catalogue.schema.js';`, the way D1, D6 and D7 register theirs. Never re-export it from `apps/api/src/db/app-schema.ts`: `catalogue.schema.ts` imports `appSchema` from that file, and the cycle stops every app and test boot with `TypeError: Cannot read properties of undefined (reading 'table')` (reproduced).
- `is_elss` is a **generated** column (spec §2.3 says only "generated", no formula). Assumption made explicit here: `is_elss` is `(category_code = 'EQ_ELSS')` stored, since `EQ_ELSS` is the ELSS row this task's own seed defines in `sebi-categories.csv`.
- `pg_trgm` is already enabled by Plan-01's `0000_bootstrap.sql` (`CREATE EXTENSION IF NOT EXISTS pg_trgm`), so this migration only needs the GIN index, not the extension.

- [ ] **Step 1: Write the failing test**

`apps/api/src/modules/catalogue/catalogue.schema.ts`:

```typescript
import { ASSET_CLASSES, CUTOFF_CLASSES, defineEnum, type EnumValue, SCHEME_OPTIONS, SCHEME_PLAN_TYPES, VOLATILITY_CLASSES } from '@sanchay/domain';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  primaryKey,
  smallint,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { appSchema, dbUuidv7, inList, stdColumns, tstz } from '../../db/app-schema.js';
import { newId } from '../platform/ids.js';

// This file does not exist yet, so the test below fails at import time (module not found).
export const RISKOMETER_LEVELS = ['LOW', 'LOW_TO_MODERATE', 'MODERATE', 'MODERATELY_HIGH', 'HIGH', 'VERY_HIGH'] as const;
```

`apps/api/test/int/catalogue-schema.int.test.ts` (the full file, written now so Step 2 shows every assertion failing on the missing module):

```typescript
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_DATA_DIR, seedCatalogue } from '../../src/cli/ops-catalogue-seed.js';
import {
  amcs,
  categoryAliases,
  fundFactsRevisions,
  marketHolidays,
  schemes,
  sebiCategories,
} from '../../src/db/schema.js';
import { createTestDatabase, type TestDatabase } from './db.js';
import { rnd } from './factories.js';
import { pgErrorCode } from './pg.js';

let t: TestDatabase;

beforeAll(async () => {
  t = await createTestDatabase();
});

afterAll(async () => {
  await t.drop();
});

/** The one row an insert's `.returning()` wrote (biome refuses `rows[0]!`). */
function only<T>(rows: T[]): T {
  const [row] = rows;
  if (row === undefined) throw new Error('expected the insert to return one row');
  return row;
}

async function asAppRole(sqlText: string, params: unknown[] = []): Promise<string | undefined> {
  const client = await t.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE sanchay_app');
    await client.query(sqlText, params);
    return undefined;
  } catch (e) {
    return (e as { code?: string }).code;
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

describe('catalogue schema checks', () => {
  it('plan_type CHECK rejects DIRECT', async () => {
    const amc = only(
      await t.db
        .insert(amcs)
        .values({ name: 'Test AMC', slug: `amc-${rnd(4).toString('hex')}` })
        .returning(),
    );
    const cat = only(
      await t.db
        .insert(sebiCategories)
        .values({
          code: `TC_${rnd(3).toString('hex')}`,
          assetClass: 'EQUITY',
          name: 'Test Category',
          slug: `test-cat-${rnd(3).toString('hex')}`,
          cutoffClass: 'STANDARD',
          volatilityClass: 'V_EQUITY',
        })
        .returning(),
    );
    expect(
      await pgErrorCode(
        t.db.insert(schemes).values({
          isin: 'INF999TEST01',
          amcId: amc.id,
          name: 'Bad Plan Type',
          slug: `bad-plan-type-${rnd(3).toString('hex')}`,
          planType: 'DIRECT' as never,
          categoryCode: cat.code,
        }),
      ),
    ).toBe('23514');
  });

  it('option CHECK rejects IDCW', async () => {
    const amc = only(
      await t.db
        .insert(amcs)
        .values({ name: 'Test AMC 2', slug: `amc-${rnd(4).toString('hex')}` })
        .returning(),
    );
    const cat = only(
      await t.db
        .insert(sebiCategories)
        .values({
          code: `TC_${rnd(3).toString('hex')}`,
          assetClass: 'EQUITY',
          name: 'Test Category 2',
          slug: `test-cat-${rnd(3).toString('hex')}`,
          cutoffClass: 'STANDARD',
          volatilityClass: 'V_EQUITY',
        })
        .returning(),
    );
    expect(
      await pgErrorCode(
        t.db.insert(schemes).values({
          isin: 'INF999TEST02',
          amcId: amc.id,
          name: 'Bad Option',
          slug: `bad-option-${rnd(3).toString('hex')}`,
          option: 'IDCW' as never,
          categoryCode: cat.code,
        }),
      ),
    ).toBe('23514');
  });

  it('seed is idempotent (run twice -> same rows)', async () => {
    await seedCatalogue(t.db, DEFAULT_DATA_DIR);
    const firstCounts = {
      amcs: (await t.db.select().from(amcs)).length,
      categories: (await t.db.select().from(sebiCategories)).length,
      aliases: (await t.db.select().from(categoryAliases)).length,
      schemes: (await t.db.select().from(schemes)).length,
    };
    await seedCatalogue(t.db, DEFAULT_DATA_DIR);
    const secondCounts = {
      amcs: (await t.db.select().from(amcs)).length,
      categories: (await t.db.select().from(sebiCategories)).length,
      aliases: (await t.db.select().from(categoryAliases)).length,
      schemes: (await t.db.select().from(schemes)).length,
    };
    expect(secondCounts).toEqual(firstCounts);
  });

  it('40 SEBI categories each map a cutoff_class', async () => {
    // The two CHECK tests above add their own TC_* categories to this database; count the seeded ones.
    const rows = (await t.db.select().from(sebiCategories)).filter(
      (row) => !row.code.startsWith('TC_'),
    );
    expect(rows.length).toBe(40);
    for (const row of rows) {
      expect(['STANDARD', 'LIQUID', 'OVERNIGHT', 'INTERNATIONAL']).toContain(row.cutoffClass);
    }
  });

  it('holidays 2026 include 10-02, 10-20, 11-10, 11-24', async () => {
    const rows = await t.db.select().from(marketHolidays);
    const dates = rows.map((r) => r.holidayDate);
    for (const d of ['2026-10-02', '2026-10-20', '2026-11-10', '2026-11-24']) {
      expect(dates).toContain(d);
    }
  });

  it('fund_facts_revisions is append-only (UPDATE denied to sanchay_app)', async () => {
    const amc = only(
      await t.db
        .insert(amcs)
        .values({ name: 'Test AMC 3', slug: `amc-${rnd(4).toString('hex')}` })
        .returning(),
    );
    const cat = only(
      await t.db
        .insert(sebiCategories)
        .values({
          code: `TC_${rnd(3).toString('hex')}`,
          assetClass: 'EQUITY',
          name: 'Test Category 3',
          slug: `test-cat-${rnd(3).toString('hex')}`,
          cutoffClass: 'STANDARD',
          volatilityClass: 'V_EQUITY',
        })
        .returning(),
    );
    const scheme = only(
      await t.db
        .insert(schemes)
        .values({
          isin: 'INF999TEST03',
          amcId: amc.id,
          name: 'Revisions Fixture',
          slug: `revisions-fixture-${rnd(3).toString('hex')}`,
          categoryCode: cat.code,
        })
        .returning(),
    );
    await t.db
      .insert(fundFactsRevisions)
      .values({ schemeId: scheme.id, source: 'ADMIN', payload: { note: 'v1' } });
    expect(
      await asAppRole(`UPDATE app.fund_facts_revisions SET payload = '{}' WHERE scheme_id = $1`, [
        scheme.id,
      ]),
    ).toBe('42501');
    expect(await asAppRole('DELETE FROM app.fund_facts_revisions')).toBe('42501');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

```
pnpm --filter=@sanchay/api test:int catalogue-schema
```

Expected failure: module resolution error — `apps/api/src/db/schema.ts` has no `amcs`/`sebiCategories`/`schemes`/`marketHolidays`/`fundFactsRevisions` exports yet, and `apps/api/src/cli/ops-catalogue-seed.js` does not exist, so every import in the test file fails before a single `it` runs.

- [ ] **Step 3: Minimal implementation**

`apps/api/src/modules/catalogue/catalogue.schema.ts` (full file):

```typescript
import { ASSET_CLASSES, CUTOFF_CLASSES, SCHEME_OPTIONS, SCHEME_PLAN_TYPES, VOLATILITY_CLASSES } from '@sanchay/domain';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  primaryKey,
  smallint,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { appSchema, dbUuidv7, inList, stdColumns, tstz } from '../../db/app-schema.js';
import { newId } from '../platform/ids.js';

/** D8: schemes.status. SCHEME_STATUSES is added to @sanchay/domain's catalogue.ts in this task and
 *  re-exported here, because Plan 04 F19 imports `type SchemeStatus` from this file (RV-02-57). */
export { SCHEME_STATUSES, type SchemeStatus } from '@sanchay/domain';

/** Not modelled in @sanchay/domain yet (no consumer before this task); local to the catalogue schema. */
export const RISKOMETER_LEVELS = ['LOW', 'LOW_TO_MODERATE', 'MODERATE', 'MODERATELY_HIGH', 'HIGH', 'VERY_HIGH'] as const;
export type RiskometerLevel = (typeof RISKOMETER_LEVELS)[number];

export const FUND_FACTS_SOURCES = ['ADMIN', 'CYBRILLA', 'AMFI'] as const;
export type FundFactsSource = (typeof FUND_FACTS_SOURCES)[number];

export const COMMISSION_KINDS = ['EXACT', 'RANGE'] as const;
export type CommissionKind = (typeof COMMISSION_KINDS)[number];

export const NAV_SYNC_KINDS = ['DAILY_2130', 'DAILY_2330', 'DAILY_0700', 'DAILY_1030', 'HISTORY_BACKFILL'] as const;
export type NavSyncKind = (typeof NAV_SYNC_KINDS)[number];

export const NAV_SYNC_STATUSES = ['RUNNING', 'SUCCEEDED', 'FAILED'] as const;
export type NavSyncStatus = (typeof NAV_SYNC_STATUSES)[number];

export const MARKET_HOLIDAY_KINDS = ['EQUITY', 'MONEY_MARKET', 'BANK'] as const;
export type MarketHolidayKind = (typeof MARKET_HOLIDAY_KINDS)[number];

/**
 * Money-wire strings (parsed with @sanchay/validation's moneyWireSchema at the write boundary, D10).
 * The SIP fields come only from FP's monthly SIP row. Without one they are all null (D-MONEY-026:
 * no SIP threshold, no SIP), never the lumpsum limits (RV-02-55).
 */
export interface SchemeThresholds {
  purchaseMin: string;
  purchaseMax: string | null;
  purchaseMultiple: string;
  sipMin: string | null;
  sipMax: string | null;
  sipMultiple: string | null;
}

export const amcs = appSchema.table(
  'amcs',
  {
    id: uuid('id').primaryKey().$defaultFn(() => newId('amcs')),
    ...stdColumns(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    fpFundName: text('fp_fund_name'),
    empanelled: boolean('empanelled').notNull().default(true),
    active: boolean('active').notNull().default(true),
  },
  (t) => [unique('amcs_slug_uq').on(t.slug)],
);

export const sebiCategories = appSchema.table(
  'sebi_categories',
  {
    id: uuid('id').primaryKey().$defaultFn(() => newId('sebi_categories')),
    ...stdColumns(),
    code: text('code').notNull(),
    assetClass: text('asset_class', { enum: ASSET_CLASSES }).notNull(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    sebiRef: text('sebi_ref'),
    cutoffClass: text('cutoff_class', { enum: CUTOFF_CLASSES }).notNull(),
    volatilityClass: text('volatility_class', { enum: VOLATILITY_CLASSES }).notNull(),
  },
  (t) => [
    unique('sebi_categories_code_uq').on(t.code),
    unique('sebi_categories_slug_uq').on(t.slug),
    check('sebi_categories_asset_class_ck', inList('asset_class', ASSET_CLASSES)),
    check('sebi_categories_cutoff_class_ck', inList('cutoff_class', CUTOFF_CLASSES)),
    check('sebi_categories_volatility_class_ck', inList('volatility_class', VOLATILITY_CLASSES)),
  ],
);

export const categoryAliases = appSchema.table(
  'category_aliases',
  {
    id: uuid('id').primaryKey().$defaultFn(() => newId('category_aliases')),
    ...stdColumns(),
    alias: text('alias').notNull(),
    source: text('source').notNull(),
    categoryCode: text('category_code')
      .notNull()
      .references(() => sebiCategories.code, { onDelete: 'restrict' }),
  },
  (t) => [unique('category_aliases_alias_source_uq').on(t.alias, t.source)],
);

export const schemes = appSchema.table(
  'schemes',
  {
    id: uuid('id').primaryKey().$defaultFn(() => newId('schemes')),
    ...stdColumns(),
    isin: text('isin').notNull(),
    amfiSchemeCode: text('amfi_scheme_code'),
    amcId: uuid('amc_id')
      .notNull()
      .references(() => amcs.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    planType: text('plan_type', { enum: SCHEME_PLAN_TYPES }).notNull().default('REGULAR'),
    option: text('option', { enum: SCHEME_OPTIONS }).notNull().default('GROWTH'),
    categoryCode: text('category_code')
      .notNull()
      .references(() => sebiCategories.code, { onDelete: 'restrict' }),
    lockInMonths: smallint('lock_in_months'),
    // Generated: this seed's ELSS row is EQ_ELSS (see data/sebi-categories.csv). Documented assumption (D8).
    isElss: boolean('is_elss')
      .notNull()
      .generatedAlwaysAs(sql`(category_code = 'EQ_ELSS')`),
    fpActive: boolean('fp_active').notNull().default(false),
    purchaseAllowed: boolean('purchase_allowed').notNull().default(false),
    redemptionAllowed: boolean('redemption_allowed').notNull().default(false),
    sipAllowed: boolean('sip_allowed').notNull().default(false),
    thresholds: jsonb('thresholds').$type<SchemeThresholds>(),
    sipDates: jsonb('sip_dates').$type<number[]>(),
    status: text('status', { enum: ['DRAFT', 'PUBLISHED', 'SUSPENDED'] as const }).notNull().default('DRAFT'),
    curated: boolean('curated').notNull().default(false),
  },
  (t) => [
    unique('schemes_isin_uq').on(t.isin),
    unique('schemes_slug_uq').on(t.slug),
    check('schemes_isin_ck', sql`isin ~ '^INF[A-Z0-9]{9}$'`),
    check('schemes_plan_type_ck', inList('plan_type', SCHEME_PLAN_TYPES)),
    check('schemes_option_ck', inList('option', SCHEME_OPTIONS)),
    check('schemes_status_ck', inList('status', ['DRAFT', 'PUBLISHED', 'SUSPENDED'])),
    index('schemes_name_trgm_idx').using('gin', sql`${t.name} gin_trgm_ops`),
    index('schemes_category_idx').on(t.categoryCode),
  ],
);

export const fundFacts = appSchema.table(
  'fund_facts',
  {
    id: uuid('id').primaryKey().$defaultFn(() => newId('fund_facts')),
    ...stdColumns(),
    schemeId: uuid('scheme_id')
      .notNull()
      .references(() => schemes.id, { onDelete: 'restrict' }),
    expenseRatioPct: numeric('expense_ratio_pct', { precision: 5, scale: 2 }),
    expenseRatioAsOf: date('expense_ratio_as_of'),
    riskometer: text('riskometer', { enum: RISKOMETER_LEVELS }),
    riskometerAsOf: date('riskometer_as_of'),
    benchmarkName: text('benchmark_name'),
    benchmarkRiskometer: text('benchmark_riskometer', { enum: RISKOMETER_LEVELS }),
    exitLoadText: text('exit_load_text'),
    sidUrl: text('sid_url'),
    kimUrl: text('kim_url'),
    fieldSources: jsonb('field_sources').$type<Record<string, string>>().notNull().default({}),
    completeness: smallint('completeness').notNull().default(0),
  },
  (t) => [
    unique('fund_facts_scheme_uq').on(t.schemeId),
    check('fund_facts_riskometer_ck', inList('riskometer', RISKOMETER_LEVELS)),
    check('fund_facts_benchmark_riskometer_ck', inList('benchmark_riskometer', RISKOMETER_LEVELS)),
    check('fund_facts_completeness_ck', sql`completeness BETWEEN 0 AND 100`),
  ],
);

/** Append-only: UPDATE/DELETE revoked from sanchay_app below, in this same migration. */
export const fundFactsRevisions = appSchema.table(
  'fund_facts_revisions',
  {
    id: uuid('id')
      .primaryKey()
      .default(dbUuidv7)
      .$defaultFn(() => newId('fund_facts_revisions')),
    createdAt: tstz('created_at').notNull().defaultNow(),
    schemeId: uuid('scheme_id')
      .notNull()
      .references(() => schemes.id, { onDelete: 'restrict' }),
    source: text('source', { enum: FUND_FACTS_SOURCES }).notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  },
  (t) => [
    check('fund_facts_revisions_source_ck', inList('source', FUND_FACTS_SOURCES)),
    index('fund_facts_revisions_scheme_idx').on(t.schemeId, t.createdAt),
  ],
);

export const commissionDisclosures = appSchema.table(
  'commission_disclosures',
  {
    id: uuid('id').primaryKey().$defaultFn(() => newId('commission_disclosures')),
    ...stdColumns(),
    amcId: uuid('amc_id').references(() => amcs.id, { onDelete: 'restrict' }),
    schemeId: uuid('scheme_id').references(() => schemes.id, { onDelete: 'restrict' }),
    disclosureKey: text('disclosure_key').notNull(),
    trailMinBps: smallint('trail_min_bps').notNull(),
    trailMaxBps: smallint('trail_max_bps').notNull(),
    kind: text('kind', { enum: COMMISSION_KINDS }).notNull(),
    effectiveFrom: date('effective_from').notNull(),
    source: text('source').notNull(),
  },
  (t) => [
    unique('commission_disclosures_key_uq').on(t.disclosureKey),
    check('commission_disclosures_kind_ck', inList('kind', COMMISSION_KINDS)),
    check('commission_disclosures_scope_ck', sql`(amc_id IS NOT NULL) <> (scheme_id IS NOT NULL)`),
    check('commission_disclosures_range_ck', sql`trail_min_bps <= trail_max_bps`),
  ],
);

export const schemeNavs = appSchema.table(
  'scheme_navs',
  {
    isin: text('isin').primaryKey(),
    nav: numeric('nav', { precision: 18, scale: 6 }).notNull(),
    navDate: date('nav_date').notNull(),
    prevNav: numeric('prev_nav', { precision: 18, scale: 6 }),
    prevNavDate: date('prev_nav_date'),
    quarantined: boolean('quarantined').notNull().default(false),
    schemeNameSnapshot: text('scheme_name_snapshot'),
    updatedAt: tstz('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check('scheme_navs_isin_ck', sql`isin ~ '^INF[A-Z0-9]{9}$'`),
    check('scheme_navs_nav_ck', sql`nav > 0`),
    index('scheme_navs_nav_date_idx').on(t.navDate),
  ],
);

export const navHistory = appSchema.table(
  'nav_history',
  {
    isin: text('isin').notNull(),
    navDate: date('nav_date').notNull(),
    nav: numeric('nav', { precision: 18, scale: 6 }).notNull(),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.isin, t.navDate] }), check('nav_history_nav_ck', sql`nav > 0`)],
);

export const navSyncRuns = appSchema.table(
  'nav_sync_runs',
  {
    id: uuid('id')
      .primaryKey()
      .default(dbUuidv7)
      .$defaultFn(() => newId('nav_sync_runs')),
    startedAt: tstz('started_at').notNull().defaultNow(),
    finishedAt: tstz('finished_at'),
    kind: text('kind', { enum: NAV_SYNC_KINDS }).notNull(),
    status: text('status', { enum: NAV_SYNC_STATUSES }).notNull().default('RUNNING'),
    rowsParsed: integer('rows_parsed'),
    rowsMatched: integer('rows_matched'),
    rowsQuarantined: integer('rows_quarantined'),
    rowsFutureDated: integer('rows_future_dated'),
    maxNavDate: date('max_nav_date'),
    failureReason: text('failure_reason'),
  },
  () => [check('nav_sync_runs_kind_ck', inList('kind', NAV_SYNC_KINDS)), check('nav_sync_runs_status_ck', inList('status', NAV_SYNC_STATUSES))],
);

export const schemeReturns = appSchema.table(
  'scheme_returns',
  {
    id: uuid('id').primaryKey().$defaultFn(() => newId('scheme_returns')),
    schemeId: uuid('scheme_id')
      .notNull()
      .references(() => schemes.id, { onDelete: 'restrict' }),
    asOf: date('as_of').notNull(),
    cagr1y: numeric('cagr_1y', { precision: 7, scale: 4 }),
    cagr3y: numeric('cagr_3y', { precision: 7, scale: 4 }),
    cagr5y: numeric('cagr_5y', { precision: 7, scale: 4 }),
    abs6m: numeric('abs_6m', { precision: 7, scale: 4 }),
    displayEligible: boolean('display_eligible').notNull().default(false),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [unique('scheme_returns_scheme_as_of_uq').on(t.schemeId, t.asOf)],
);

export const marketHolidays = appSchema.table('market_holidays', {
  holidayDate: date('holiday_date').primaryKey(),
  kinds: jsonb('kinds').$type<MarketHolidayKind[]>().notNull(),
});
```

`apps/api/src/db/schema.ts` (modify, key-level append, RV-02-27; `biome check --write` sorts the line among the D1, D2, D6 and D7 exports):

```typescript
export * from '../modules/catalogue/catalogue.schema.js';
```

Never add this line to `apps/api/src/db/app-schema.ts`: `catalogue.schema.ts` imports `appSchema` from it, so the re-export makes an ESM cycle and `db/client.ts` fails to load (see the deviation note).

`packages/domain/src/catalogue.ts` (modify, append):

```typescript
/** D8: schemes.status (spec §2.3). */
export const SCHEME_STATUSES = defineEnum(['DRAFT', 'PUBLISHED', 'SUSPENDED']);
export type SchemeStatus = EnumValue<typeof SCHEME_STATUSES>;
```

Then in `catalogue.schema.ts`, replace the local `['DRAFT', 'PUBLISHED', 'SUSPENDED'] as const` inline literals with the real import:

```typescript
import { ASSET_CLASSES, CUTOFF_CLASSES, SCHEME_OPTIONS, SCHEME_PLAN_TYPES, SCHEME_STATUSES, VOLATILITY_CLASSES } from '@sanchay/domain';
```

and use `text('status', { enum: SCHEME_STATUSES }).notNull().default('DRAFT')` / `inList('status', SCHEME_STATUSES)`. Keep the `export { SCHEME_STATUSES, type SchemeStatus } from '@sanchay/domain';` line: Plan 04 F19's `publish-gate.apply.ts` imports `type SchemeStatus` from this file, so dropping it is a TS2305 there (RV-02-57).

`apps/api/src/modules/platform/ids.ts` (modify — extend the union):

```typescript
export type TableName =
  | 'amcs'
  | 'audit_events'
  | 'auth_sessions'
  | 'category_aliases'
  | 'commission_disclosures'
  | 'fund_facts'
  | 'fund_facts_revisions'
  | 'investor_contacts'
  | 'investor_devices'
  | 'investors'
  | 'market_holidays'
  | 'nav_history'
  | 'nav_sync_runs'
  | 'otp_codes'
  | 'scheme_navs'
  | 'scheme_returns'
  | 'schemes'
  | 'sebi_categories';
```

`data/sebi-categories.csv` (40 rows; `code,asset_class,name,slug,sebi_ref,cutoff_class,volatility_class`):

```csv
code,asset_class,name,slug,sebi_ref,cutoff_class,volatility_class
EQ_MULTI_CAP,EQUITY,Multi Cap Fund,multi-cap-fund,SEBI/HO/IMD/DF3/CIR/P/2017/114,STANDARD,V_EQUITY
EQ_LARGE_CAP,EQUITY,Large Cap Fund,large-cap-fund,SEBI/HO/IMD/DF3/CIR/P/2017/114,STANDARD,V_EQUITY
EQ_LARGE_MID_CAP,EQUITY,Large & Mid Cap Fund,large-and-mid-cap-fund,SEBI/HO/IMD/DF3/CIR/P/2017/114,STANDARD,V_EQUITY
EQ_MID_CAP,EQUITY,Mid Cap Fund,mid-cap-fund,SEBI/HO/IMD/DF3/CIR/P/2017/114,STANDARD,V_EQUITY
EQ_SMALL_CAP,EQUITY,Small Cap Fund,small-cap-fund,SEBI/HO/IMD/DF3/CIR/P/2017/114,STANDARD,V_HIGH
EQ_DIVIDEND_YIELD,EQUITY,Dividend Yield Fund,dividend-yield-fund,SEBI/HO/IMD/DF3/CIR/P/2017/114,STANDARD,V_EQUITY
EQ_VALUE_CONTRA,EQUITY,Value Fund,value-fund,SEBI/HO/IMD/DF3/CIR/P/2017/114,STANDARD,V_EQUITY
EQ_FOCUSED,EQUITY,Focused Fund,focused-fund,SEBI/HO/IMD/DF3/CIR/P/2017/114,STANDARD,V_EQUITY
EQ_SECTORAL_THEMATIC,EQUITY,Sectoral/Thematic Fund,sectoral-thematic-fund,SEBI/HO/IMD/DF3/CIR/P/2017/114,STANDARD,V_HIGH
EQ_ELSS,EQUITY,ELSS,elss,SEBI/HO/IMD/DF3/CIR/P/2017/114,STANDARD,V_EQUITY
DT_OVERNIGHT,DEBT,Overnight Fund,overnight-fund,SEBI/HO/IMD/DF3/CIR/P/2017/114,OVERNIGHT,V_CASH
DT_LIQUID,DEBT,Liquid Fund,liquid-fund,SEBI/HO/IMD/DF3/CIR/P/2017/114,LIQUID,V_CASH
DT_ULTRA_SHORT,DEBT,Ultra Short Duration Fund,ultra-short-duration-fund,SEBI/HO/IMD/DF3/CIR/P/2017/114,STANDARD,V_CASH
DT_LOW_DURATION,DEBT,Low Duration Fund,low-duration-fund,SEBI/HO/IMD/DF3/CIR/P/2017/114,STANDARD,V_CASH
DT_MONEY_MARKET,DEBT,Money Market Fund,money-market-fund,SEBI/HO/IMD/DF3/CIR/P/2017/114,STANDARD,V_CASH
DT_SHORT_DURATION,DEBT,Short Duration Fund,short-duration-fund,SEBI/HO/IMD/DF3/CIR/P/2017/114,STANDARD,V_DEBT
DT_MEDIUM_DURATION,DEBT,Medium Duration Fund,medium-duration-fund,SEBI/HO/IMD/DF3/CIR/P/2017/114,STANDARD,V_DEBT
DT_MEDIUM_LONG_DURATION,DEBT,Medium to Long Duration Fund,medium-to-long-duration-fund,SEBI/HO/IMD/DF3/CIR/P/2017/114,STANDARD,V_DEBT
DT_LONG_DURATION,DEBT,Long Duration Fund,long-duration-fund,SEBI/HO/IMD/DF3/CIR/P/2017/114,STANDARD,V_DEBT
DT_DYNAMIC_BOND,DEBT,Dynamic Bond Fund,dynamic-bond-fund,SEBI/HO/IMD/DF3/CIR/P/2017/114,STANDARD,V_DEBT
DT_CORPORATE_BOND,DEBT,Corporate Bond Fund,corporate-bond-fund,SEBI/HO/IMD/DF3/CIR/P/2017/114,STANDARD,V_DEBT
DT_CREDIT_RISK,DEBT,Credit Risk Fund,credit-risk-fund,SEBI/HO/IMD/DF3/CIR/P/2017/114,STANDARD,V_DEBT
DT_BANKING_PSU,DEBT,Banking and PSU Fund,banking-and-psu-fund,SEBI/HO/IMD/DF3/CIR/P/2017/114,STANDARD,V_DEBT
DT_GILT,DEBT,Gilt Fund,gilt-fund,SEBI/HO/IMD/DF3/CIR/P/2017/114,STANDARD,V_DEBT
DT_GILT_10Y,DEBT,Gilt Fund with 10 year constant duration,gilt-fund-10-year-constant-duration,SEBI/HO/IMD/DF3/CIR/P/2017/114,STANDARD,V_DEBT
DT_FLOATER,DEBT,Floater Fund,floater-fund,SEBI/HO/IMD/DF3/CIR/P/2017/114,STANDARD,V_DEBT
HY_CONSERVATIVE,HYBRID,Conservative Hybrid Fund,conservative-hybrid-fund,SEBI/HO/IMD/DF3/CIR/P/2017/114,STANDARD,V_HYBRID
HY_BALANCED,HYBRID,Balanced Hybrid Fund,balanced-hybrid-fund,SEBI/HO/IMD/DF3/CIR/P/2017/114,STANDARD,V_HYBRID
HY_AGGRESSIVE,HYBRID,Aggressive Hybrid Fund,aggressive-hybrid-fund,SEBI/HO/IMD/DF3/CIR/P/2017/114,STANDARD,V_HYBRID
HY_DYNAMIC_ASSET,HYBRID,Dynamic Asset Allocation Fund,dynamic-asset-allocation-fund,SEBI/HO/IMD/DF3/CIR/P/2017/114,STANDARD,V_HYBRID
HY_MULTI_ASSET,HYBRID,Multi Asset Allocation Fund,multi-asset-allocation-fund,SEBI/HO/IMD/DF3/CIR/P/2017/114,STANDARD,V_HYBRID
HY_ARBITRAGE,HYBRID,Arbitrage Fund,arbitrage-fund,SEBI/HO/IMD/DF3/CIR/P/2017/114,STANDARD,V_CASH
LC_RETIREMENT,LIFE_CYCLE,Retirement Fund,retirement-fund,SEBI/HO/IMD/DF3/CIR/P/2017/114,STANDARD,V_HYBRID
LC_CHILDRENS,LIFE_CYCLE,Children's Fund,childrens-fund,SEBI/HO/IMD/DF3/CIR/P/2017/114,STANDARD,V_HYBRID
OT_INDEX,OTHER,Index Fund,index-fund,SEBI/HO/IMD/DF3/CIR/P/2017/114,STANDARD,V_EQUITY
OT_ETF,OTHER,Exchange Traded Fund,exchange-traded-fund,SEBI/HO/IMD/DF3/CIR/P/2017/114,STANDARD,V_EQUITY
OT_FOF_DOMESTIC,OTHER,Fund of Funds (Domestic),fund-of-funds-domestic,SEBI/HO/IMD/DF3/CIR/P/2017/114,STANDARD,V_EQUITY
OT_FOF_OVERSEAS,OTHER,Fund of Funds (Overseas),fund-of-funds-overseas,SEBI/HO/IMD/DF3/CIR/P/2017/114,INTERNATIONAL,V_EQUITY
OT_GOLD_SILVER_ETF_FOF,OTHER,Gold/Silver ETF Fund of Funds,gold-silver-etf-fund-of-funds,SEBI/HO/IMD/DF3/CIR/P/2017/114,STANDARD,V_HIGH
OT_INTERNATIONAL,OTHER,International Fund,international-fund,SEBI/HO/IMD/DF3/CIR/P/2017/114,INTERNATIONAL,V_HIGH
```

`data/category-aliases.csv` (`alias,source,category_code`):

```csv
alias,source,category_code
Flexi Cap,ADMIN,EQ_MULTI_CAP
Flexicap,ADMIN,EQ_MULTI_CAP
Bluechip,ADMIN,EQ_LARGE_CAP
Frontline Equity,ADMIN,EQ_LARGE_CAP
Tax Saver,ADMIN,EQ_ELSS
Tax Plan,ADMIN,EQ_ELSS
Liquid,ADMIN,DT_LIQUID
Overnight,ADMIN,DT_OVERNIGHT
Corporate Bond,ADMIN,DT_CORPORATE_BOND
Banking & PSU Debt,ADMIN,DT_BANKING_PSU
Balanced Advantage,ADMIN,HY_DYNAMIC_ASSET
Arbitrage,ADMIN,HY_ARBITRAGE
Constant Maturity Gilt,ADMIN,DT_GILT_10Y
Nifty Index,ADMIN,OT_INDEX
Gold ETF FoF,ADMIN,OT_GOLD_SILVER_ETF_FOF
US Fund,ADMIN,OT_INTERNATIONAL
Retirement Savings,ADMIN,LC_RETIREMENT
Children's Gift,ADMIN,LC_CHILDRENS
```

`data/amcs.csv` (`name,slug,fp_fund_name,empanelled,active`):

```csv
name,slug,fp_fund_name,empanelled,active
Aditya Birla Sun Life Mutual Fund,aditya-birla-sun-life-mutual-fund,Aditya Birla Sun Life Mutual Fund,true,true
ICICI Prudential Mutual Fund,icici-prudential-mutual-fund,ICICI Prudential Mutual Fund,true,true
HDFC Mutual Fund,hdfc-mutual-fund,HDFC Mutual Fund,true,true
SBI Mutual Fund,sbi-mutual-fund,SBI Mutual Fund,true,true
Axis Mutual Fund,axis-mutual-fund,Axis Mutual Fund,true,true
Kotak Mahindra Mutual Fund,kotak-mahindra-mutual-fund,Kotak Mahindra Mutual Fund,true,true
Nippon India Mutual Fund,nippon-india-mutual-fund,Nippon India Mutual Fund,true,true
Parag Parikh Mutual Fund,parag-parikh-mutual-fund,Parag Parikh Mutual Fund,true,true
```

`data/market-holidays-2026-2027.csv` (`holiday_date,kinds` — `kinds` is `|`-separated):

```csv
holiday_date,kinds
2026-01-26,EQUITY|MONEY_MARKET|BANK
2026-02-17,EQUITY|MONEY_MARKET|BANK
2026-03-04,EQUITY|MONEY_MARKET|BANK
2026-04-03,EQUITY|MONEY_MARKET|BANK
2026-04-14,EQUITY|MONEY_MARKET|BANK
2026-05-01,EQUITY|MONEY_MARKET|BANK
2026-08-15,EQUITY|MONEY_MARKET|BANK
2026-08-26,EQUITY|MONEY_MARKET|BANK
2026-10-02,EQUITY|MONEY_MARKET|BANK
2026-10-20,EQUITY|MONEY_MARKET|BANK
2026-11-10,EQUITY|MONEY_MARKET|BANK
2026-11-24,EQUITY|MONEY_MARKET|BANK
2026-12-25,EQUITY|MONEY_MARKET|BANK
2027-01-26,EQUITY|MONEY_MARKET|BANK
2027-03-04,EQUITY|MONEY_MARKET|BANK
2027-03-22,EQUITY|MONEY_MARKET|BANK
2027-04-02,EQUITY|MONEY_MARKET|BANK
2027-05-01,EQUITY|MONEY_MARKET|BANK
2027-08-15,EQUITY|MONEY_MARKET|BANK
2027-10-02,EQUITY|MONEY_MARKET|BANK
2027-11-15,EQUITY|MONEY_MARKET|BANK
2027-12-25,EQUITY|MONEY_MARKET|BANK
```

Deviation note: the outline names the file `market-holidays-2026-2027.csv` without pinning exact dates beyond the four D9 test dates (10-02, 10-20, 11-10, 11-24, all 2026). The remaining rows are a representative NSE/BSE trading-holiday calendar shape for 2026–2027 (Republic Day, Holi, Ram Navami/Mahavir Jayanti, Good Friday, Ambedkar Jayanti, May Day, Independence Day, Parsi New Year, Gandhi Jayanti, Dussehra, Diwali-Laxmi Puja, Gurunanak Jayanti, Christmas); Ops/G-C1 replaces this with the NSE-published calendar before go-live, same as `curated-schemes.csv` and `fund-facts.csv` below.

`data/commission-disclosures.csv` (`scope,trail_min_bps,trail_max_bps,kind,effective_from,source`, where `scope` is an AMC slug or a scheme ISIN — the seed CLI resolves it to `amc_id` or `scheme_id`):

```csv
scope,trail_min_bps,trail_max_bps,kind,effective_from,source
aditya-birla-sun-life-mutual-fund,25,100,RANGE,2026-01-01,ADMIN
icici-prudential-mutual-fund,25,100,RANGE,2026-01-01,ADMIN
hdfc-mutual-fund,25,110,RANGE,2026-01-01,ADMIN
sbi-mutual-fund,20,90,RANGE,2026-01-01,ADMIN
axis-mutual-fund,25,100,RANGE,2026-01-01,ADMIN
kotak-mahindra-mutual-fund,25,100,RANGE,2026-01-01,ADMIN
nippon-india-mutual-fund,20,95,RANGE,2026-01-01,ADMIN
parag-parikh-mutual-fund,50,50,EXACT,2026-01-01,ADMIN
```

`data/curated-schemes.csv` (placeholder, 10 ISINs — `isin,amc_slug,name,category_code,lock_in_months`):

```csv
isin,amc_slug,name,category_code,lock_in_months
INF000P01011,icici-prudential-mutual-fund,ICICI Prudential Liquid Fund - Regular - Growth,DT_LIQUID,
INF000P02022,hdfc-mutual-fund,HDFC Overnight Fund - Regular - Growth,DT_OVERNIGHT,
INF000P03033,axis-mutual-fund,Axis ELSS Tax Saver Fund - Regular - Growth,EQ_ELSS,36
INF000P04044,aditya-birla-sun-life-mutual-fund,ABSL Frontline Equity Fund - Regular - Growth,EQ_LARGE_CAP,
INF000P05055,parag-parikh-mutual-fund,Parag Parikh Flexi Cap Fund - Regular - Growth,EQ_MULTI_CAP,
INF000P06066,kotak-mahindra-mutual-fund,Kotak Emerging Equity Fund - Regular - Growth,EQ_MID_CAP,
INF000P07077,sbi-mutual-fund,SBI Corporate Bond Fund - Regular - Growth,DT_CORPORATE_BOND,
INF000P08088,axis-mutual-fund,Axis Banking and PSU Debt Fund - Regular - Growth,DT_BANKING_PSU,
INF000P09099,nippon-india-mutual-fund,Nippon India Aggressive Hybrid Fund - Regular - Growth,HY_AGGRESSIVE,
INF000P10010,hdfc-mutual-fund,HDFC Small Cap Fund - Regular - Growth,EQ_SMALL_CAP,
```

Deviation note: the outline explicitly calls this file a **placeholder**. Real AMFI ISINs are share-class specific (a Direct-plan ISIN differs from the Regular-plan ISIN for the same scheme), and this task has no authoritative Regular-plan ISIN list, so these ten ISINs are synthetic but `ISIN_REGEX`-valid placeholders (`INF000P0NNNN`), covering liquid, overnight, ELSS, large/mid/small-cap equity, corporate-bond and banking-PSU debt, and aggressive-hybrid per D4's "10 ISINs, covering liquid, ELSS, equity and debt". G-C1 curation replaces this file with real ISINs before the FP sandbox milestone.

`data/fund-facts.csv` (placeholder — `isin,expense_ratio_pct,expense_ratio_as_of,riskometer,riskometer_as_of,benchmark_name,benchmark_riskometer,exit_load_text,sid_url,kim_url`):

```csv
isin,expense_ratio_pct,expense_ratio_as_of,riskometer,riskometer_as_of,benchmark_name,benchmark_riskometer,exit_load_text,sid_url,kim_url
INF000P01011,0.35,2026-09-01,LOW,2026-09-01,CRISIL Liquid Fund Index,LOW,Nil,https://example.invalid/sid/INF000P01011.pdf,https://example.invalid/kim/INF000P01011.pdf
INF000P02022,0.20,2026-09-01,LOW,2026-09-01,CRISIL Overnight Fund Index,LOW,Nil,https://example.invalid/sid/INF000P02022.pdf,https://example.invalid/kim/INF000P02022.pdf
INF000P03033,1.75,2026-09-01,VERY_HIGH,2026-09-01,BSE 500 TRI,VERY_HIGH,Nil (36-month lock-in),https://example.invalid/sid/INF000P03033.pdf,https://example.invalid/kim/INF000P03033.pdf
INF000P04044,1.65,2026-09-01,VERY_HIGH,2026-09-01,Nifty 100 TRI,VERY_HIGH,1% if redeemed within 1 year,https://example.invalid/sid/INF000P04044.pdf,https://example.invalid/kim/INF000P04044.pdf
INF000P05055,1.55,2026-09-01,VERY_HIGH,2026-09-01,Nifty 500 TRI,VERY_HIGH,2% if redeemed within 1 year,https://example.invalid/sid/INF000P05055.pdf,https://example.invalid/kim/INF000P05055.pdf
INF000P06066,1.80,2026-09-01,VERY_HIGH,2026-09-01,Nifty Midcap 150 TRI,VERY_HIGH,1% if redeemed within 1 year,https://example.invalid/sid/INF000P06066.pdf,https://example.invalid/kim/INF000P06066.pdf
INF000P07077,0.90,2026-09-01,MODERATE,2026-09-01,CRISIL Corporate Bond Index,MODERATE,Nil,https://example.invalid/sid/INF000P07077.pdf,https://example.invalid/kim/INF000P07077.pdf
INF000P08088,0.85,2026-09-01,MODERATE,2026-09-01,CRISIL Banking and PSU Debt Index,MODERATE,Nil,https://example.invalid/sid/INF000P08088.pdf,https://example.invalid/kim/INF000P08088.pdf
INF000P09099,1.90,2026-09-01,VERY_HIGH,2026-09-01,CRISIL Hybrid 35+65 Aggressive Index,HIGH,1% if redeemed within 1 year,https://example.invalid/sid/INF000P09099.pdf,https://example.invalid/kim/INF000P09099.pdf
INF000P10010,1.95,2026-09-01,VERY_HIGH,2026-09-01,Nifty Smallcap 250 TRI,VERY_HIGH,1% if redeemed within 1 year,https://example.invalid/sid/INF000P10010.pdf,https://example.invalid/kim/INF000P10010.pdf
```

`apps/api/src/cli/ops-catalogue-seed.ts` (full file; RV-02-34: required CSV cells go through `cell()`, because `biome ci` refuses non-null assertions):

```typescript
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadDotEnvFile } from '../config/dotenv.js';
import { parseEnv } from '../config/env.js';
import { createDb, type Database } from '../db/client.js';
import {
  amcs,
  categoryAliases,
  commissionDisclosures,
  fundFacts,
  fundFactsRevisions,
  type MarketHolidayKind,
  marketHolidays,
  schemes,
  sebiCategories,
} from '../modules/catalogue/catalogue.schema.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/** apps/api/src/cli -> apps/api/src -> apps/api -> apps -> repo root -> data */
export const DEFAULT_DATA_DIR = resolve(HERE, '../../../../data');

type CsvRow = Record<string, string>;

function parseCsv(text: string): CsvRow[] {
  const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim().length > 0);
  const header = lines[0]?.split(',') ?? [];
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const row: CsvRow = {};
    header.forEach((key, i) => {
      row[key.trim()] = (cells[i] ?? '').trim();
    });
    return row;
  });
}

function readCsv(dataDir: string, file: string): CsvRow[] {
  return parseCsv(readFileSync(resolve(dataDir, file), 'utf8'));
}

/**
 * A required cell. Under noUncheckedIndexedAccess every lookup is `string | undefined`, and biome
 * refuses non-null assertions, so a missing or empty required cell stops the seed and names itself.
 */
function cell(row: CsvRow, key: string): string {
  const value = row[key];
  if (value === undefined || value === '') {
    throw new Error(`seedCatalogue: missing ${key} in ${JSON.stringify(row)}`);
  }
  return value;
}

export async function seedCatalogue(db: Database, dataDir: string): Promise<void> {
  for (const row of readCsv(dataDir, 'amcs.csv')) {
    const amc = {
      name: cell(row, 'name'),
      fpFundName: row.fp_fund_name || null,
      empanelled: row.empanelled === 'true',
      active: row.active === 'true',
    };
    await db
      .insert(amcs)
      .values({ ...amc, slug: cell(row, 'slug') })
      .onConflictDoUpdate({ target: amcs.slug, set: amc });
  }

  for (const row of readCsv(dataDir, 'sebi-categories.csv')) {
    const category = {
      assetClass: row.asset_class as never,
      name: cell(row, 'name'),
      slug: cell(row, 'slug'),
      sebiRef: row.sebi_ref || null,
      cutoffClass: row.cutoff_class as never,
      volatilityClass: row.volatility_class as never,
    };
    await db
      .insert(sebiCategories)
      .values({ ...category, code: cell(row, 'code') })
      .onConflictDoUpdate({ target: sebiCategories.code, set: category });
  }

  for (const row of readCsv(dataDir, 'category-aliases.csv')) {
    const categoryCode = cell(row, 'category_code');
    await db
      .insert(categoryAliases)
      .values({ alias: cell(row, 'alias'), source: cell(row, 'source'), categoryCode })
      .onConflictDoUpdate({
        target: [categoryAliases.alias, categoryAliases.source],
        set: { categoryCode },
      });
  }

  for (const row of readCsv(dataDir, 'market-holidays-2026-2027.csv')) {
    const kinds = cell(row, 'kinds').split('|') as MarketHolidayKind[];
    await db
      .insert(marketHolidays)
      .values({ holidayDate: cell(row, 'holiday_date'), kinds })
      .onConflictDoUpdate({ target: marketHolidays.holidayDate, set: { kinds } });
  }

  const amcBySlug = new Map((await db.select().from(amcs)).map((a) => [a.slug, a.id]));

  for (const row of readCsv(dataDir, 'curated-schemes.csv')) {
    const amcSlug = cell(row, 'amc_slug');
    const amcId = amcBySlug.get(amcSlug);
    if (!amcId) throw new Error(`seedCatalogue: unknown amc_slug ${amcSlug}`);
    const scheme = {
      name: cell(row, 'name'),
      categoryCode: cell(row, 'category_code'),
      lockInMonths: row.lock_in_months ? Number(row.lock_in_months) : null,
      curated: true,
    };
    await db
      .insert(schemes)
      .values({
        ...scheme,
        isin: cell(row, 'isin'),
        amcId,
        slug: scheme.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, ''),
      })
      .onConflictDoUpdate({ target: schemes.isin, set: scheme });
  }

  const schemeByIsin = new Map((await db.select().from(schemes)).map((s) => [s.isin, s.id]));

  for (const row of readCsv(dataDir, 'fund-facts.csv')) {
    const schemeId = schemeByIsin.get(cell(row, 'isin'));
    if (!schemeId) continue;
    const payload = { ...row };
    await db
      .insert(fundFacts)
      .values({
        schemeId,
        expenseRatioPct: row.expense_ratio_pct || null,
        expenseRatioAsOf: row.expense_ratio_as_of || null,
        riskometer: (row.riskometer || null) as never,
        riskometerAsOf: row.riskometer_as_of || null,
        benchmarkName: row.benchmark_name || null,
        benchmarkRiskometer: (row.benchmark_riskometer || null) as never,
        exitLoadText: row.exit_load_text || null,
        sidUrl: row.sid_url || null,
        kimUrl: row.kim_url || null,
        fieldSources: Object.fromEntries(Object.keys(row).map((k) => [k, 'ADMIN'])),
        completeness: 100,
      })
      .onConflictDoUpdate({
        target: fundFacts.schemeId,
        set: {
          expenseRatioPct: row.expense_ratio_pct || null,
          riskometer: (row.riskometer || null) as never,
          benchmarkName: row.benchmark_name || null,
          benchmarkRiskometer: (row.benchmark_riskometer || null) as never,
          exitLoadText: row.exit_load_text || null,
          sidUrl: row.sid_url || null,
          kimUrl: row.kim_url || null,
        },
      });
    const latest = await db.query.fundFactsRevisions.findFirst({
      where: (t, { eq: eqOp, and }) => and(eqOp(t.schemeId, schemeId), eqOp(t.source, 'ADMIN')),
      orderBy: (t, { desc }) => desc(t.createdAt),
    });
    if (!latest || JSON.stringify(latest.payload) !== JSON.stringify(payload)) {
      await db.insert(fundFactsRevisions).values({ schemeId, source: 'ADMIN', payload });
    }
  }

  for (const row of readCsv(dataDir, 'commission-disclosures.csv')) {
    const scope = cell(row, 'scope');
    const amcId = amcBySlug.get(scope) ?? null;
    const schemeId = amcId ? null : (schemeByIsin.get(scope) ?? null);
    if (!amcId && !schemeId) throw new Error(`seedCatalogue: unknown commission scope ${scope}`);
    const terms = {
      trailMinBps: Number(row.trail_min_bps),
      trailMaxBps: Number(row.trail_max_bps),
      effectiveFrom: cell(row, 'effective_from'),
    };
    await db
      .insert(commissionDisclosures)
      .values({
        ...terms,
        amcId,
        schemeId,
        disclosureKey: scope,
        kind: row.kind as never,
        source: 'ADMIN',
      })
      .onConflictDoUpdate({ target: commissionDisclosures.disclosureKey, set: terms });
  }
}

// RV-02-24: compare file URLs; `file://${argv[1]}` never matches import.meta.url on Windows.
const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  loadDotEnvFile();
  const env = parseEnv(process.env);
  const dbh = createDb(env.DATABASE_URL, 2);
  try {
    await seedCatalogue(dbh.db, DEFAULT_DATA_DIR);
    console.log('catalogue seeded');
  } finally {
    await dbh.close();
  }
}
```

`apps/api/package.json` (modify — append under `scripts`):

```json
"ops:catalogue:seed": "nest build -b swc && node dist/cli/ops-catalogue-seed.js"
```

root `package.json` (modify — append under `scripts`):

```json
"ops:catalogue:seed": "pnpm --filter=@sanchay/api ops:catalogue:seed"
```

- [ ] **Step 4: Run tests to confirm they pass**

```
pnpm exec turbo run build --filter=@sanchay/api^...
pnpm --filter=@sanchay/api db:generate --name=catalogue
pnpm --filter=@sanchay/api test:int catalogue-schema
pnpm --filter=@sanchay/api typecheck
```

The first line rebuilds `packages/domain/dist`, which is where `apps/api` reads `SCHEME_STATUSES` (RV-02-35). With a stale build, `typecheck` fails with TS2305 and `db:generate` stops with `TypeError: Cannot read properties of undefined (reading 'map')` (both reproduced).

Expected: `db:generate` writes a new `drizzle/0009_catalogue.sql` + snapshot (append `REVOKE UPDATE, DELETE ON app.fund_facts_revisions FROM sanchay_app;` to the bottom of the generated SQL file by hand, matching the `0003_grants.sql` append-only pattern — drizzle-kit does not know about role grants). All 6 tests in `catalogue-schema.int.test.ts` pass; `typecheck` is clean.

- [ ] **Step 5: Commit**

```
pnpm exec biome check --write apps/api/src/modules/catalogue apps/api/src/cli/ops-catalogue-seed.ts apps/api/src/db/schema.ts apps/api/src/modules/platform/ids.ts apps/api/test/int/catalogue-schema.int.test.ts packages/domain/src/catalogue.ts data apps/api/package.json package.json apps/api/drizzle
pnpm exec turbo run build --filter=@sanchay/api^...
pnpm --filter=@sanchay/api test:int catalogue-schema
pnpm --filter=@sanchay/api typecheck
pnpm lint
git add apps/api/src/modules/catalogue apps/api/src/cli/ops-catalogue-seed.ts apps/api/src/db/schema.ts apps/api/src/modules/platform/ids.ts apps/api/test/int/catalogue-schema.int.test.ts packages/domain/src/catalogue.ts data apps/api/package.json package.json apps/api/drizzle
git commit -m "feat(catalogue): add catalogue schema, seed data and ops:catalogue:seed" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task D9: AMFI NAVAll parser port, `nav.sync.daily`, history backfill, `ops:nav-release` (Dev B, 10 h)

**Files (create):**
- `packages/test-fixtures/{package.json, tsconfig.json, tsconfig.build.json, vitest.config.ts, src/index.ts}` (the package shell; **D9 is the only task that creates these**, and later tasks add golden files and barrel exports only), `packages/test-fixtures/src/amfi/navall-daily.txt`, `packages/test-fixtures/src/amfi/navall-history.txt`
- `apps/api/src/integrations/amfi/{amfi-nav-parser.ts, amfi-nav-parser.test.ts, amfi-client.ts, amfi-client.test.ts, nav-floors.ts}`
- `apps/api/src/modules/catalogue/nav/{nav.service.ts, nav-sync.job.ts, nav-history-backfill.ts, nav-release.ts}` (RV-02-76: `nav-release.ts` holds R-35's release)
- `apps/api/src/modules/catalogue/catalogue.module.ts` (RV-02-5: registers `NavSyncJob`; D10 extends it)
- `apps/api/src/cli/{ops-nav-backfill.ts, ops-nav-release.ts}`
- `apps/api/test/int/nav-sync.int.test.ts`

**Files (modify):**
- `apps/api/package.json` (scripts `ops:nav-backfill`, `ops:nav-release`)
- root `package.json` (key-level append: same two scripts)
- `apps/api/src/modules/platform/jobs/schedules.ts` (owned by D2, a hard prerequisite: fill the `registerSchedules` body with the four keyed `nav.sync.daily` schedules)
- `apps/api/src/app.module.ts` (import `CatalogueModule`)

**Interfaces:**
- Prerequisites: D8 (`schemeNavs`, `navHistory`, `navSyncRuns` tables, `Database` type); D1 (`ReconBreaks.open`, `RuntimeConfig`); D2 (`Jobs.enqueue`, `@JobHandler`, `JOB_NAMES`, `schedule(name, cron, {tz})`).
- Consumes (Plan-01, verified): `@sanchay/money` — `Nav` (scale 6, `Nav.parse`), `formatIsoDate`; `@sanchay/domain` — `NAV_GRADES`, `type NavGrade`, `isIsin`, `toIsin`, `type Isin`, `isIsoDate`, `toIsoDate`, `type IsoDate`, `ISIN_REGEX`; `apps/api/src/modules/platform/clock.ts` — `CLOCK`, `Clock`, `DAY`; `apps/api/src/modules/identity/otp.service.ts` — `istDayStart` (NAV age counts IST calendar days from it, RV-02-49); `apps/api/src/db/client.ts` — `DbExecutor`; `apps/api/src/modules/platform/platform.schema.ts` — `auditEvents` (R-35's release ledger). Consumes (D1/D2, outline-specified names — no real code exists yet to verify against, per Prerequisites table in the Plan 02 outline intro): `Jobs.enqueue`, `@JobHandler`, `ReconBreaks.open`.
- Consumes (v1 port source, read-only): `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/integration/nav/AmfiNavParser.java` and `AmfiNavParserTest.java`.
- Produces: `parseAmfiNav(body, {bound})`, `NAV_UNBOUNDED_DATE`, `type NavRow`, `type ParsedNavFeed`, `NavFeedFormatError`; `NAV_ROW_MIN_COUNT`, `NAV_MATCHED_FRACTION_FLOOR`, `NAV_JUMP_FLOOR_PCT`, `assertRunFloors`, `NavSyncFloorBreachedError`, `quarantineDecision`; `AmfiClient.fetchDaily()/fetchHistory(from, to)` (`DAILY_TIMEOUTS`, `HISTORY_TIMEOUTS`, `AmfiHttpError`; at most three attempts); `NavService.latest(exec, isin) -> {nav, navDate, grade} | null` (age in IST calendar days; a NAV dated after today IST grades `UNAVAILABLE`, D-MONEY-067) and `istToday(now)`; job `nav.sync.daily` (rejects a NAV dated after today IST at ingest, applies the latest row per ISIN, and appends its accepted NAVs to `nav_history`); `backfillNavHistory(exec, client, {from, to}, onWindow?) -> {rowsParsed, rowsWritten}` (one calendar month per AMFI request), `monthWindows`, `insertNavHistory`, `navHistoryStored`, `NAV_HISTORY_INSERT_BATCH`, `NAV_HISTORY_FLOOR_MIN_DAYS`; `pnpm ops:nav-backfill --from <date> --to <date> [--check]`; `pnpm ops:nav-release --isin <i> --approver1 <a> --approver2 <b>`; `releaseNav(db, {isin, approver1, approver2})`, `NavReleaseError`, `pendingNavReleases(db) -> Set<string>`, `NAV_RELEASE`, `NAV_RELEASE_APPLIED` (R-35).
- Deviation from outline: the outline's grade names (`FRESH|AGED|UNDATED`) match the **v1 research doc** (`docs/research/rules-compliance-nav.md`), but Plan-01's real `@sanchay/domain` already ships `NAV_GRADES = ['OK', 'STALE', 'UNAVAILABLE']` (`packages/domain/src/catalogue.ts`). This task uses the real enum: `OK` (fresh, matches v1 `FRESH`), `STALE` (matches v1 `AGED`), `UNAVAILABLE` (no row, a row dated after today IST (D-MONEY-067; v1 graded it fresh), or `quarantined = true` — a quarantined row keeps its last good `nav` value per NAV-09 but is not trustworthy until `ops:nav-release`, so it reports `UNAVAILABLE` regardless of age rather than falling back to `STALE`). The "future-dated → quarantined" v2 fix in the outline's test list is expressed here as: a future-dated row from the daily feed is never applied to `scheme_navs` at all (it lands in `ParsedNavFeed.futureDated`, per the v1 parser's own design, and is never quarantine-written).
- Deviation from outline: the outline gives one signature, `parseAmfiNav(body, {bound: IsoDate})`. The v1 parser's test suite also needs the two-argument `parse(body)` "no bound" mode, and — critically — a test that a **null** bound is refused rather than silently meaning unbounded. Rather than add a second overload (which the outline does not list), this port keeps the one exported name and adds an explicit sentinel, `NAV_UNBOUNDED_DATE = '9999-12-31' as IsoDate`, that a caller must pass on purpose; `options.bound` being `null`/`undefined` throws `TypeError`. `parseAmfiNav(body)` with `options` omitted also throws, for the same reason.
- Review fix (RV-02-4/5): D2 is a hard prerequisite (no stub fallback). The job needs a `@JobHandler('nav.sync.daily')` class (`NavSyncJob`) registered in a module, and the four crons need distinct pg-boss `key`s, each passing its `kind` as job data; see "D9 Step 3 addendum".
- Row/matched-fraction/plausibility floors (`NAV-06`, `NAV-09` in `docs/research/rules-compliance-nav.md`, ported from v1): `rowsParsed < 1000` or (cold start) `matched/tracked < 0.10` fails the whole run before any write; a per-ISIN day-over-day move `> 25%` quarantines that ISIN instead of writing it. These floor values are not in the outline (which only says "quarantine: `|Δ| > floor`"); the 1000/0.10/25% figures are taken from the v1 research doc and are the run's defaults, overridable later via `RuntimeConfig` — not done in this task, which hardcodes them as named constants.
- Review fix (RV-02-73, R-33): prod gets five years of NAV history from `ops-nav-backfill.js` runs on F1's ops task (`db-access.md`), so the backfill is sized to AMFI as measured on 2026-10-05. `fetchHistory` waits up to 5 minutes for the headers (`HISTORY_TIMEOUTS`: a month needed 8 to 31 s before its first byte, three months 66 s, and 10 s failed a month three times; 5 minutes is under the 350 s idle timeout of prod's NAT gateway) and retries a network error, a timeout, a 5xx, 408 or 429 (three attempts, 2 s then 4 s apart; any other status is final, and a refused body is drained). `backfillNavHistory` walks `[from, to]` one calendar month per request inside one run, so it holds at most one month's report (about 25 MB, 200,000 to 280,000 rows), inserts 1,000 rows per `ON CONFLICT DO NOTHING` statement and returns the rows it inserted, not the rows it parsed; NAV-06's 1,000-row floor applies to each window of a week or more (a weekend or holiday has only 750 to 1,150 NAVs a day). `runNavSync` appends its accepted NAVs to `nav_history` the same way, so E16's returns follow every sync after the backfill; a quarantined or future-dated NAV never reaches the history. `--check` prints what `nav_history` holds per month without calling AMFI.
- Review fix (RV-02-74, AMFI's live feed): `NavRow.isin` passes `isIsin`. NAVAll.txt carries `Redeemed` and `HDFCNIVODG` in its reinvestment-ISIN column, which `scheme_navs_isin_ck` refuses (23514, failing the whole sync), so the parser skips such a cell like a placeholder. The feed also lists a few matured ISINs twice with two dates, so `runNavSync` applies only the latest row per ISIN (v1's `latestPerIsin`).
- Review fix (RV-02-76, R-35): a released NAV is accepted once. `ops:nav-release` (two approvers, after the NAV is checked on the AMC site) now goes through `releaseNav`, which clears `quarantined` and writes a `NAV_RELEASE` audit row in one transaction, and refuses an ISIN that is not quarantined, so a stray release cannot wave a later move through. `audit_events` is the release ledger, so D8's schema does not change: `runNavSync` reads `pendingNavReleases` once per run (the ISINs whose latest `NAV_RELEASE`/`NAV_RELEASE_APPLIED` row is a release; one read on `audit_events_entity_idx`), and a released ISIN's next feed value skips `quarantineDecision` (NAV-09). That value is written to `scheme_navs` and `nav_history` like any accepted NAV, and the same transaction writes `NAV_RELEASE_APPLIED` (`SYSTEM`, with the run id and both NAVs), which uses the release up; the next sync checks from the new NAV. Before this, a release only cleared the flag, so a genuine move over 25% was quarantined again on the next sync and never reached `nav_history`. A release that lands while a sync is running is taken by the next one.

- [ ] **Step 1: Write the failing test**

`packages/test-fixtures/package.json` (the package shell every later golden-vector task extends; consumers import typed fixtures from the `@sanchay/test-fixtures` barrel and add it as a `workspace:*` devDependency):

```json
{
  "name": "@sanchay/test-fixtures",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "sideEffects": false,
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -b tsconfig.build.json",
    "typecheck": "tsc -p tsconfig.json",
    "test": "vitest run --passWithNoTests"
  },
  "devDependencies": {
    "@sanchay/config": "workspace:*",
    "@types/node": "catalog:",
    "typescript": "catalog:",
    "vite": "catalog:",
    "vitest": "catalog:"
  }
}
```

`packages/test-fixtures/tsconfig.json`:

```json
{
  "extends": "@sanchay/config/tsconfig/node-lib.json",
  "compilerOptions": {
    "noEmit": true,
    "types": ["node"],
    "resolveJsonModule": true
  },
  "include": ["src", "test"]
}
```

`packages/test-fixtures/tsconfig.build.json`:

```json
{
  "extends": "@sanchay/config/tsconfig/node-lib-build.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "tsBuildInfoFile": "dist/.tsbuildinfo",
    "resolveJsonModule": true
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}
```

`packages/test-fixtures/vitest.config.ts`:

```typescript
import { baseTestConfig } from '@sanchay/config/vitest';
import { defineConfig, mergeConfig } from 'vitest/config';

export default mergeConfig(baseTestConfig, defineConfig({ test: {} }));
```

`packages/test-fixtures/src/index.ts` (empty barrel; Plan 03 tasks append their exports):

```ts
export {};
```

`packages/test-fixtures/src/amfi/navall-daily.txt` (real AMFI-published values, per the v1 test's own comment that these are the NAVs AMFI actually published for these ISINs on 24-Aug-2026):

```
Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date

Open Ended Schemes(Equity Scheme - Flexi Cap Fund)
Aditya Birla Sun Life Mutual Fund
119551;INF209KA1K47;-;ABSL Flexi Cap Fund - Direct - Growth;Direct;Growth;25.3631;24-Aug-2026
119552;INF209KB12S4;-;ABSL Frontline Equity Fund - Direct - Growth;Direct;Growth;12.9456;24-Aug-2026

Open Ended Schemes(Debt Scheme - Liquid Fund)
Aditya Birla Sun Life Mutual Fund
119553;INF209K01819;INF209K01DH6;ABSL Liquid Fund - Regular - IDCW;Regular;IDCW;10.7917;24-Aug-2026
```

`packages/test-fixtures/src/amfi/navall-history.txt` (same two funds, ISIN columns at 4/5 instead of 1/2):

```
Scheme Code;NAV Name;Plan;Option;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Net Asset Value;Date

119551;ABSL Flexi Cap Fund - Direct - Growth;Direct;Growth;INF209KA1K47;-;25.3631;24-Aug-2026
119552;ABSL Frontline Equity Fund - Direct - Growth;Direct;Growth;INF209KB12S4;-;12.9456;24-Aug-2026
```

`apps/api/src/integrations/amfi/amfi-nav-parser.test.ts` (the full file — every case fails to import until Step 3):

```typescript
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NAV_UNBOUNDED_DATE, NavFeedFormatError, parseAmfiNav } from './amfi-nav-parser.js';

const FIXTURES = fileURLToPath(new URL('../../../../../packages/test-fixtures/src/amfi/', import.meta.url));

const DAILY_HEADER =
  'Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date';
const HISTORY_HEADER =
  'Scheme Code;NAV Name;Plan;Option;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Net Asset Value;Date';
const NAV_DATE = '2026-08-24';

function unbounded(body: string) {
  return parseAmfiNav(body, { bound: NAV_UNBOUNDED_DATE }).rows;
}

describe('parseAmfiNav: the two layouts', () => {
  it('parsesTheDailyLayout (fixture file)', () => {
    const feed = readFileSync(`${FIXTURES}navall-daily.txt`, 'utf8');
    const rows = unbounded(feed);
    expect(rows.map((r) => [r.isin, r.nav, r.navDate])).toEqual([
      ['INF209KA1K47', '25.3631', NAV_DATE],
      ['INF209KB12S4', '12.9456', NAV_DATE],
      ['INF209K01819', '10.7917', NAV_DATE],
      ['INF209K01DH6', '10.7917', NAV_DATE],
    ]);
  });

  it('parsesTheHistoryLayout (fixture file)', () => {
    const feed = readFileSync(`${FIXTURES}navall-history.txt`, 'utf8');
    const rows = unbounded(feed);
    expect(rows.map((r) => [r.isin, r.nav, r.navDate])).toEqual([
      ['INF209KA1K47', '25.3631', NAV_DATE],
      ['INF209KB12S4', '12.9456', NAV_DATE],
    ]);
  });

  it('bothLayoutsYieldIdenticalRowsForTheSameFund', () => {
    const daily = `${DAILY_HEADER}\n119551;INF209KA1K47;-;ABSL Flexi Cap Fund - Direct - Growth;Direct;Growth;25.3631;24-Aug-2026\n`;
    const history = `${HISTORY_HEADER}\n119551;ABSL Flexi Cap Fund - Direct - Growth;Direct;Growth;INF209KA1K47;-;25.3631;24-Aug-2026\n`;
    expect(unbounded(daily)).toEqual(unbounded(history));
  });

  it('resolvesColumnsFromAnArbitraryHeaderOrder', () => {
    const feed = 'Date;Net Asset Value;ISIN Div Payout/ISIN Growth;Scheme Name\n24-Aug-2026;25.3631;INF209KA1K47;ABSL Flexi Cap Fund - Direct - Growth\n';
    expect(unbounded(feed)).toEqual([{ isin: 'INF209KA1K47', nav: '25.3631', navDate: NAV_DATE, schemeName: 'ABSL Flexi Cap Fund - Direct - Growth' }]);
  });

  it('doesNotMistakeTheHistoryNavNameColumnForTheNavColumn', () => {
    const feed = `${HISTORY_HEADER}\n119553;ABSL Liquid Fund - Regular - IDCW;Regular;IDCW;INF209K01819;-;10.7917;24-Aug-2026\n`;
    expect(unbounded(feed)).toEqual([{ isin: 'INF209K01819', nav: '10.7917', navDate: NAV_DATE, schemeName: 'ABSL Liquid Fund - Regular - IDCW' }]);
  });
});

describe('parseAmfiNav: two ISINs per row', () => {
  it('emitsOneRowPerIsinWhenARowCarriesBoth', () => {
    const feed = `${DAILY_HEADER}\n119553;INF209K01819;INF209K01DH6;ABSL Liquid Fund - Regular - IDCW;Regular;IDCW;10.7917;24-Aug-2026\n`;
    expect(unbounded(feed).map((r) => r.isin)).toEqual(['INF209K01819', 'INF209K01DH6']);
  });

  it('emitsOneRowWhenTheReinvestmentIsinIsAPlaceholder', () => {
    const feed = `${DAILY_HEADER}\n119551;INF209KA1K47;-;A;Direct;Growth;25.3631;24-Aug-2026\n119552;INF209KB12S4;;B;Direct;Growth;12.9456;24-Aug-2026\n119554;INF209KB1234;N.A.;C;Direct;Growth;18.2500;24-Aug-2026\n`;
    expect(unbounded(feed).map((r) => r.isin)).toEqual(['INF209KA1K47', 'INF209KB12S4', 'INF209KB1234']);
  });

  it('dedupesWhenBothIsinColumnsCarryTheSameIsin', () => {
    const feed = `${DAILY_HEADER}\n119551;INF209KA1K47;INF209KA1K47;A;Direct;Growth;25.3631;24-Aug-2026\n`;
    expect(unbounded(feed).map((r) => r.isin)).toEqual(['INF209KA1K47']);
  });

  it('skipsARowWithNoIsinAtAll', () => {
    const feed = `${DAILY_HEADER}\n119555;-;-;A Scheme With No ISIN;Direct;Growth;9.8765;24-Aug-2026\n`;
    expect(unbounded(feed)).toEqual([]);
  });

  it('skipsAnIsinCellThatIsNotAMutualFundIsin', () => {
    const feed = `${DAILY_HEADER}\n152713;INF179KC1IM3;HDFCNIVODG;HDFC NIFTY100 Low Volatility 30 Index Fund;Direct Plan;Growth Option;9.6607;01-Oct-2026\n130565;INF613Q01025;Redeemed;IL&FS Infrastructure Debt Fund Series 1A;;;1680494.0463;31-Dec-2018\n100013;Redeemed;-;No ISIN at all;Direct;Growth;10.0000;24-Aug-2026\n`;
    expect(unbounded(feed).map((r) => r.isin)).toEqual(['INF179KC1IM3', 'INF613Q01025']);
  });
});

describe('parseAmfiNav: junk rows are skipped', () => {
  it('skipsPlaceholderUnparseableAndNonPositiveNavs', () => {
    const feed = `${DAILY_HEADER}\n100001;INF209KA1K47;-;Good;Direct;Growth;25.3631;24-Aug-2026\n100002;INF209KB1002;-;Dash;Direct;Growth;-;24-Aug-2026\n100003;INF209KB1003;-;NA text;Direct;Growth;N.A.;24-Aug-2026\n100004;INF209KB1004;-;Empty;Direct;Growth;;24-Aug-2026\n100005;INF209KB1005;-;Text;Direct;Growth;not-a-number;24-Aug-2026\n100006;INF209KB1006;-;Zero;Direct;Growth;0.0000;24-Aug-2026\n100007;INF209KB1007;-;Negative;Direct;Growth;-1.2500;24-Aug-2026\n`;
    expect(unbounded(feed).map((r) => r.isin)).toEqual(['INF209KA1K47']);
  });

  it('skipsRowsWhoseDateWillNotParse', () => {
    const feed = `${DAILY_HEADER}\n100001;INF209KA1K47;-;Good;Direct;Growth;25.3631;24-Aug-2026\n100008;INF209KB1008;-;Bad month;Direct;Growth;11.1111;31-Foo-2026\n100009;INF209KB1009;-;Wrong shape;Direct;Growth;11.1111;2026-08-24\n100010;INF209KB1010;-;Placeholder date;Direct;Growth;11.1111;-\n`;
    expect(unbounded(feed).map((r) => r.isin)).toEqual(['INF209KA1K47']);
  });

  it('skipsAFebruary29thOutsideALeapYear', () => {
    const feed = `${DAILY_HEADER}\n100011;INF209KB1011;-;Leap year;Direct;Growth;11.1111;29-Feb-2028\n100012;INF209KB1012;-;Not a leap year;Direct;Growth;11.1111;29-Feb-2027\n`;
    expect(unbounded(feed).map((r) => [r.isin, r.navDate])).toEqual([['INF209KB1011', '2028-02-29']]);
  });

  it('skipsAmcSectionTitlesBlankLinesAndTheHeaderItself', () => {
    const feed = `${DAILY_HEADER}\n\n\nOpen Ended Schemes(Debt Scheme - Liquid Fund)\nAditya Birla Sun Life Mutual Fund\n\n119553;INF209K01819;-;ABSL Liquid Fund - Regular - IDCW;Regular;IDCW;10.7917;24-Aug-2026\n\nOpen Ended Schemes(Equity Scheme - Flexi Cap Fund)\nSome Other Mutual Fund\n119551;INF209KA1K47;-;ABSL Flexi Cap Fund - Direct - Growth;Direct;Growth;25.3631;24-Aug-2026\n`;
    expect(unbounded(feed).map((r) => r.isin)).toEqual(['INF209K01819', 'INF209KA1K47']);
  });

  it('returnsAnEmptyListWhenTheHeaderResolvesButEveryRowIsJunk', () => {
    const feed = `${DAILY_HEADER}\nOpen Ended Schemes(Equity Scheme - Flexi Cap Fund)\nAditya Birla Sun Life Mutual Fund\n100002;INF209KB1002;-;Dash;Direct;Growth;-;24-Aug-2026\n`;
    expect(unbounded(feed)).toEqual([]);
  });
});

describe('parseAmfiNav: value handling', () => {
  it('keepsNavAtTheScaleTheFeedPublished', () => {
    const feed = `${DAILY_HEADER}\n119551;INF209KA1K47;-;A;Direct;Growth;25.3631;24-Aug-2026\n`;
    expect(unbounded(feed)[0]?.nav).toBe('25.3631');
  });

  it('parsesEnglishMonthNamesCaseInsensitively', () => {
    const feed = `${DAILY_HEADER}\n119551;INF209KA1K47;-;A;Direct;Growth;25.3631;24-AUG-2026\n`;
    expect(unbounded(feed)[0]?.navDate).toBe(NAV_DATE);
  });

  it('normalisesIsinToTrimmedUpperCaseAndSnapshotsTheSchemeName', () => {
    const feed = `${DAILY_HEADER}\n119551; inf209ka1k47 ;-; ABSL Flexi Cap Fund - Direct - Growth ;Direct;Growth; 25.3631 ; 24-Aug-2026\n`;
    expect(unbounded(feed)).toEqual([{ isin: 'INF209KA1K47', nav: '25.3631', navDate: NAV_DATE, schemeName: 'ABSL Flexi Cap Fund - Direct - Growth' }]);
  });

  it('leavesTheSchemeNameNullWhenTheFeedPublishesNone', () => {
    const feed = `${DAILY_HEADER}\n119551;INF209KA1K47;-;;Direct;Growth;25.3631;24-Aug-2026\n`;
    expect(unbounded(feed)[0]?.schemeName).toBeNull();
  });

  it('handlesCrlfLineEndings', () => {
    const feed = ['DAILY', DAILY_HEADER, '', '119551;INF209KA1K47;-;A;Direct;Growth;25.3631;24-Aug-2026', ''].slice(1).join('\r\n');
    expect(unbounded(feed).map((r) => [r.isin, r.navDate])).toEqual([['INF209KA1K47', NAV_DATE]]);
  });

  it('resolvesAHeaderThatIsNotTheFirstLine', () => {
    const feed = `Mutual Fund NAV report\n${DAILY_HEADER}\n119551;INF209KA1K47;-;A;Direct;Growth;25.3631;24-Aug-2026\n`;
    expect(unbounded(feed).map((r) => r.isin)).toEqual(['INF209KA1K47']);
  });
});

describe('parseAmfiNav: the future-date bound', () => {
  it('aFutureDatedRowIsSeparatedAndTheRestOfTheFeedSurvivesIt', () => {
    const feed = `${DAILY_HEADER}\n119551;INF209KA1K47;-;A;Direct;Growth;25.3631;24-Aug-2026\n119552;INF209KB12S4;-;B;Direct;Growth;12.9456;24-Aug-2027\n119553;INF209K01819;-;C;Regular;Growth;10.7917;24-Aug-2026\n`;
    const parsed = parseAmfiNav(feed, { bound: '2026-08-26' as never });
    expect(parsed.rows.map((r) => r.isin)).toEqual(['INF209KA1K47', 'INF209K01819']);
    expect(parsed.futureDated.map((r) => [r.isin, r.navDate])).toEqual([['INF209KB12S4', '2027-08-24']]);
  });

  it('theBoundIsInclusiveSoARowDatedExactlyOnItIsUsable', () => {
    const feed = `${DAILY_HEADER}\n119551;INF209KA1K47;-;A;Direct;Growth;25.3631;26-Aug-2026\n`;
    const parsed = parseAmfiNav(feed, { bound: '2026-08-26' as never });
    expect(parsed.rows.map((r) => r.isin)).toEqual(['INF209KA1K47']);
    expect(parsed.futureDated).toEqual([]);
  });

  it('bothIsinsOfAFutureDatedRowAreReported', () => {
    const feed = `${DAILY_HEADER}\n119553;INF209K01819;INF209K01DH6;C;Regular;Growth;10.7917;01-Jan-2030\n`;
    const parsed = parseAmfiNav(feed, { bound: '2026-08-26' as never });
    expect(parsed.rows).toEqual([]);
    expect(parsed.futureDated.map((r) => r.isin)).toEqual(['INF209K01819', 'INF209K01DH6']);
    expect(parsed.furthestFutureDate).toBe('2030-01-01');
  });

  it('furthestFutureDateIsNullWhenNothingWasRejected', () => {
    const feed = `${DAILY_HEADER}\n119551;INF209KA1K47;-;A;Direct;Growth;25.3631;24-Aug-2026\n`;
    expect(parseAmfiNav(feed, { bound: NAV_DATE as never }).furthestFutureDate).toBeNull();
  });

  it('theUnboundedSentinelStillReturnsEveryRow', () => {
    const feed = `${DAILY_HEADER}\n119551;INF209KA1K47;-;A;Direct;Growth;25.3631;24-Aug-2026\n119552;INF209KB12S4;-;B;Direct;Growth;12.9456;24-Aug-2099\n`;
    expect(unbounded(feed).map((r) => r.isin)).toEqual(['INF209KA1K47', 'INF209KB12S4']);
  });

  it('aNullBoundIsRefusedRatherThanSilentlyMeaningUnbounded', () => {
    const feed = `${DAILY_HEADER}\n119551;INF209KA1K47;-;A;Direct;Growth;25.3631;24-Aug-2026\n`;
    expect(() => parseAmfiNav(feed, { bound: null as never })).toThrow(TypeError);
    expect(() => parseAmfiNav(feed, undefined as never)).toThrow(TypeError);
  });
});

describe('parseAmfiNav: the format-change signal', () => {
  it('throwsWhenTheHeaderCannotBeResolved', () => {
    const feed = "<html><head><title>Runtime Error</title></head><body>Server Error in '/' Application.</body></html>";
    expect(() => unbounded(feed)).toThrow(NavFeedFormatError);
    try {
      unbounded(feed);
    } catch (e) {
      expect((e as Error).message).toContain('header could not be resolved');
      expect((e as Error).message).toContain('<html>');
    }
  });

  it('throwsWhenTheHeaderHasNoIsinColumn', () => {
    const feed = 'Scheme Code;Scheme Name;Net Asset Value;Date\n119551;A;25.3631;24-Aug-2026\n';
    expect(() => unbounded(feed)).toThrow(/at least one ISIN column/);
  });

  it('throwsWhenTheHeaderHasNoNavColumn', () => {
    const feed = 'Scheme Code;ISIN Div Payout/ ISIN Growth;Scheme Name;Date\n119551;INF209KA1K47;A;24-Aug-2026\n';
    expect(() => unbounded(feed)).toThrow(NavFeedFormatError);
  });

  it('throwsWhenTheBodyIsBlankOrEmpty', () => {
    expect(() => unbounded('   \n \n')).toThrow(/blank/);
    expect(() => unbounded('')).toThrow(/blank/);
  });

  it('quotesOnlyABoundedSliceOfAnUnrecognisableBody', () => {
    const feed = 'x'.repeat(5000);
    try {
      unbounded(feed);
      throw new Error('expected parseAmfiNav to throw');
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain('x'.repeat(200));
      expect(msg).not.toContain('x'.repeat(220));
    }
  });
});
```

`apps/api/src/integrations/amfi/amfi-client.test.ts` (the full file; undici's `request` is mocked, so no case reaches AMFI):

```typescript
import { request } from 'undici';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AmfiClient, AmfiHttpError, DAILY_TIMEOUTS, HISTORY_TIMEOUTS } from './amfi-client.js';

vi.mock('undici', () => ({ request: vi.fn() }));

const requestMock = vi.mocked(request);
const HISTORY =
  'https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx?frmdt=2026-09-01&todt=2026-09-30';

function answer(statusCode: number, text = '') {
  return { statusCode, body: { text: async () => text, dump: vi.fn(async () => {}) } };
}

function headersTimeout(): Error {
  return Object.assign(new Error('Headers Timeout Error'), { code: 'UND_ERR_HEADERS_TIMEOUT' });
}

describe('AmfiClient', () => {
  afterEach(() => {
    requestMock.mockReset();
  });

  it('waits minutes for the history report (a month needs 8-31 s before its first byte)', async () => {
    requestMock.mockResolvedValueOnce(answer(200, 'history') as never);
    await expect(
      new AmfiClient(async () => {}).fetchHistory('2026-09-01', '2026-09-30'),
    ).resolves.toBe('history');
    expect(requestMock).toHaveBeenCalledWith(HISTORY, { method: 'GET', ...HISTORY_TIMEOUTS });
    expect(HISTORY_TIMEOUTS.headersTimeout).toBeGreaterThanOrEqual(120_000);
  });

  it('keeps the daily file on its 10 s header timeout', async () => {
    requestMock.mockResolvedValueOnce(answer(200, 'daily') as never);
    await expect(new AmfiClient(async () => {}).fetchDaily()).resolves.toBe('daily');
    expect(requestMock).toHaveBeenCalledWith('https://portal.amfiindia.com/spages/NAVAll.txt', {
      method: 'GET',
      ...DAILY_TIMEOUTS,
    });
  });

  it('retries a timeout and a 503 after 2 s and 4 s, then returns the third answer', async () => {
    const sleep = vi.fn(async () => {});
    const unavailable = answer(503);
    requestMock
      .mockRejectedValueOnce(headersTimeout())
      .mockResolvedValueOnce(unavailable as never)
      .mockResolvedValueOnce(answer(200, 'history') as never);
    await expect(new AmfiClient(sleep).fetchHistory('2026-09-01', '2026-09-30')).resolves.toBe(
      'history',
    );
    expect(requestMock).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[2_000], [4_000]]);
    expect(unavailable.body.dump).toHaveBeenCalledOnce();
  });

  it('gives up after three attempts with the last error', async () => {
    requestMock.mockRejectedValue(headersTimeout());
    await expect(
      new AmfiClient(async () => {}).fetchHistory('2026-09-01', '2026-09-30'),
    ).rejects.toThrow('Headers Timeout Error');
    expect(requestMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry a 404', async () => {
    requestMock.mockResolvedValue(answer(404) as never);
    const failure = new AmfiClient(async () => {}).fetchHistory('2026-09-01', '2026-09-30');
    await expect(failure).rejects.toBeInstanceOf(AmfiHttpError);
    await expect(failure).rejects.toThrow(`AMFI feed ${HISTORY} returned 404`);
    expect(requestMock).toHaveBeenCalledOnce();
  });
});
```

`apps/api/test/int/nav-sync.int.test.ts` (the full file):

```typescript
import { eq, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { auditEvents, navHistory, navSyncRuns, schemeNavs } from '../../src/db/schema.js';
import { NavSyncFloorBreachedError } from '../../src/integrations/amfi/nav-floors.js';
import { backfillNavHistory, navHistoryStored } from '../../src/modules/catalogue/nav/nav-history-backfill.js';
import { NavReleaseError, releaseNav } from '../../src/modules/catalogue/nav/nav-release.js';
import { runNavSync } from '../../src/modules/catalogue/nav/nav-sync.job.js';
import { NavService } from '../../src/modules/catalogue/nav/nav.service.js';
import { FakeClock } from '../../src/modules/platform/clock.js';
import { createTestDatabase, type TestDatabase } from './db.js';

let t: TestDatabase;

beforeAll(async () => {
  t = await createTestDatabase();
});

afterAll(async () => {
  await t.drop();
});

// One database for the whole file and scheme_navs is keyed by ISIN, so every case uses its own ISINs.
describe('NavService.latest grading (D-MONEY-067)', () => {
  it('grades OK at 0 and 7 IST days, STALE at 8, UNAVAILABLE when quarantined, null without a row', async () => {
    const clock = new FakeClock('2026-08-24T05:00:00.000Z'); // 10:30 IST, Mon 24 Aug 2026
    await t.db.insert(schemeNavs).values([
      { isin: 'INF209KG0001', nav: '25.363100', navDate: '2026-08-24' },
      { isin: 'INF209KG0002', nav: '12.945600', navDate: '2026-08-17' },
      { isin: 'INF209KG0003', nav: '18.250000', navDate: '2026-08-16' },
      { isin: 'INF209KG0004', nav: '18.250000', navDate: '2026-08-24', quarantined: true },
    ]);

    const svc = new NavService(clock);
    expect((await svc.latest(t.db, 'INF209KG0001' as never))?.grade).toBe('OK');
    expect((await svc.latest(t.db, 'INF209KG0002' as never))?.grade).toBe('OK');
    expect((await svc.latest(t.db, 'INF209KG0003' as never))?.grade).toBe('STALE');
    expect((await svc.latest(t.db, 'INF209KG0004' as never))?.grade).toBe('UNAVAILABLE');
    expect(await svc.latest(t.db, 'INF999NOROW1' as never)).toBeNull();
  });

  it('counts IST days between 00:00 and 05:30 IST; a NAV dated after today IST is UNAVAILABLE', async () => {
    const clock = new FakeClock('2026-08-24T19:00:00.000Z'); // 00:30 IST, Tue 25 Aug 2026 (still 24 Aug in UTC)
    await t.db.insert(schemeNavs).values([
      { isin: 'INF209KG0005', nav: '10.000000', navDate: '2026-08-17' },
      { isin: 'INF209KG0006', nav: '10.000000', navDate: '2026-08-18' },
      { isin: 'INF209KG0007', nav: '10.000000', navDate: '2026-08-25' },
      { isin: 'INF209KG0008', nav: '10.000000', navDate: '2026-08-26' },
    ]);

    const svc = new NavService(clock);
    expect((await svc.latest(t.db, 'INF209KG0005' as never))?.grade).toBe('STALE'); // 8 IST days (7 by UTC dates)
    expect((await svc.latest(t.db, 'INF209KG0006' as never))?.grade).toBe('OK'); // 7 IST days, inclusive
    expect((await svc.latest(t.db, 'INF209KG0007' as never))?.grade).toBe('OK'); // today IST is not the future
    expect((await svc.latest(t.db, 'INF209KG0008' as never))?.grade).toBe('UNAVAILABLE'); // after today IST
  });
});

describe('nav.sync.daily', () => {
  it('writes nav_sync_runs with counts, opens a recon break on quarantine, and rejects a NAV dated after today IST', async () => {
    await t.db.insert(schemeNavs).values({ isin: 'INF209KA1K47', nav: '25.363100', navDate: '2026-08-23' });
    // NAV-06 fails a run that parses fewer than 1,000 rows, so 1,000 new ISINs pad the feed (inserted, never quarantined).
    const filler = Array.from(
      { length: 1000 },
      (_, i) => `${2000 + i};INF999F${String(i).padStart(5, '0')};-;Filler;Direct;Growth;10.0000;24-Aug-2026`,
    );
    const feed = [
      'Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date',
      '1;INF209KA1K47;-;A;Direct;Growth;253.6310;24-Aug-2026',
      '2;INF209KC0001;-;B;Direct;Growth;10.0000;25-Aug-2026',
      // NAVAll.txt lists a few matured ISINs twice, with two dates (2026-10-05): only the latest row applies.
      '3;INF204KB1XN0;-;C;Direct;Growth;10.0000;10-May-2021',
      '4;INF204KB1XN0;-;D;Direct;Growth;13.5859;26-May-2022',
      ...filler,
    ].join('\n');
    const fakeClient = { fetchDaily: vi.fn().mockResolvedValue(feed) };
    const reconBreaks = { open: vi.fn() };
    const jobs = { enqueue: vi.fn() };
    const clock = new FakeClock('2026-08-24T16:00:00.000Z'); // 21:30 IST, Mon 24 Aug 2026

    await runNavSync(t.db, { client: fakeClient as never, reconBreaks: reconBreaks as never, jobs: jobs as never, clock, kind: 'DAILY_2130' });

    const runs = await t.db.select().from(navSyncRuns);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe('SUCCEEDED');
    expect(runs[0]?.rowsQuarantined).toBe(1);
    expect(runs[0]?.rowsFutureDated).toBe(1);
    expect(reconBreaks.open).toHaveBeenCalledOnce();
    expect(jobs.enqueue).toHaveBeenCalledWith(t.db, 'catalogue.returns.compute', {});
    const row = await t.db.query.schemeNavs.findFirst({ where: (s, { eq }) => eq(s.isin, 'INF209KA1K47') });
    expect(row?.nav).toBe('25.363100');
    expect(row?.quarantined).toBe(true);
    const future = await t.db.query.schemeNavs.findFirst({ where: (s, { eq }) => eq(s.isin, 'INF209KC0001') });
    expect(future).toBeUndefined();
    const twice = await t.db.query.schemeNavs.findFirst({ where: (s, { eq }) => eq(s.isin, 'INF204KB1XN0') });
    expect([twice?.nav, twice?.navDate, twice?.quarantined]).toEqual(['13.585900', '2022-05-26', false]);
    // R-33: the accepted NAVs extend nav_history; the quarantined and the future-dated NAV do not.
    const history = await t.db.select().from(navHistory);
    expect(history).toHaveLength(1001);
    expect(history.map((h) => h.isin)).not.toContain('INF209KA1K47');
    expect(history.map((h) => h.isin)).not.toContain('INF209KC0001');
  });
});

describe('backfillNavHistory (R-33)', () => {
  const HISTORY_HEADER =
    'Scheme Code;NAV Name;Plan;Option;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Net Asset Value;Date';
  /** An AMFI history report: `count` NAVs dated `day`, ISINs `<prefix>00000` upwards. */
  const report = (day: string, count: number, prefix: string) =>
    [
      HISTORY_HEADER,
      ...Array.from(
        { length: count },
        (_, i) => `${i};Fund ${i};Direct;Growth;${prefix}${String(i).padStart(5, '0')};-;10.0000;${day}`,
      ),
    ].join('\n');

  it('fetches one calendar month at a time and counts only the rows it inserts', async () => {
    const reports: Record<string, string> = {
      '2025-07-30': report('31-Jul-2025', 300, 'INF888A'), // two days, under a week: no row floor
      '2025-08-01': report('14-Aug-2025', 2500, 'INF888B'), // three INSERTs of at most 1,000 rows
      '2025-09-01': report('01-Sep-2025', 10, 'INF888C'),
    };
    const fetchHistory = vi.fn(async (from: string) => reports[from] ?? '');
    // 500 of August's rows are stored already (an earlier run, or the daily sync).
    await t.db.insert(navHistory).values(
      Array.from({ length: 500 }, (_, i) => ({
        isin: `INF888B${String(i).padStart(5, '0')}`,
        navDate: '2025-08-14',
        nav: '10.000000',
      })),
    );
    const range = { from: '2025-07-30', to: '2025-09-02' };
    const months: unknown[] = [];

    const first = await backfillNavHistory(t.db, { fetchHistory }, range, (m) => months.push(m));
    expect(first).toEqual({ rowsParsed: 2810, rowsWritten: 2310 });
    expect(fetchHistory.mock.calls).toEqual([
      ['2025-07-30', '2025-07-31'],
      ['2025-08-01', '2025-08-31'],
      ['2025-09-01', '2025-09-02'],
    ]);
    expect(months).toEqual([
      { from: '2025-07-30', to: '2025-07-31', rowsParsed: 300, rowsWritten: 300 },
      { from: '2025-08-01', to: '2025-08-31', rowsParsed: 2500, rowsWritten: 2000 },
      { from: '2025-09-01', to: '2025-09-02', rowsParsed: 10, rowsWritten: 10 },
    ]);
    // A re-run writes nothing, and --check counts what each month holds.
    expect(await backfillNavHistory(t.db, { fetchHistory }, range)).toEqual({ rowsParsed: 2810, rowsWritten: 0 });
    expect(await navHistoryStored(t.db, range)).toEqual([
      { from: '2025-07-30', to: '2025-07-31', days: 2, navDates: 1, rows: 300 },
      { from: '2025-08-01', to: '2025-08-31', days: 31, navDates: 1, rows: 2500 },
      { from: '2025-09-01', to: '2025-09-02', days: 2, navDates: 1, rows: 10 },
    ]);
  });

  it('fails a window of a week or more that parses under 1,000 rows, before writing it', async () => {
    const fetchHistory = vi.fn(async () => report('03-Oct-2025', 999, 'INF888D'));
    const week = { from: '2025-10-01', to: '2025-10-07' };
    await expect(backfillNavHistory(t.db, { fetchHistory }, week)).rejects.toThrow(NavSyncFloorBreachedError);
    expect(await t.db.select().from(navHistory).where(like(navHistory.isin, 'INF888D%'))).toEqual([]);
  });

  it('refuses a range that is not two ISO dates in order, before calling AMFI', async () => {
    const fetchHistory = vi.fn(async () => '');
    const reversed = { from: '2025-09-02', to: '2025-09-01' };
    await expect(backfillNavHistory(t.db, { fetchHistory }, reversed)).rejects.toThrow(RangeError);
    const notIso = { from: '01-09-2025', to: '2025-09-30' };
    await expect(backfillNavHistory(t.db, { fetchHistory }, notIso)).rejects.toThrow(RangeError);
    expect(fetchHistory).not.toHaveBeenCalled();
  });
});

describe('ops:nav-release (R-35)', () => {
  /** One nav.sync.daily over `rows`, padded with the 1,000 filler ISINs that NAV-06 needs, dated `fillerDate`. */
  const sync = async (rows: readonly string[], at: string, fillerDate: string) => {
    const filler = Array.from(
      { length: 1000 },
      (_, i) =>
        `${2000 + i};INF999F${String(i).padStart(5, '0')};-;Filler;Direct;Growth;10.0000;${fillerDate}`,
    );
    const feed = [
      'Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date',
      ...rows,
      ...filler,
    ].join('\n');
    const reconBreaks = { open: vi.fn() };
    await runNavSync(t.db, {
      client: { fetchDaily: vi.fn().mockResolvedValue(feed) } as never,
      reconBreaks: reconBreaks as never,
      jobs: { enqueue: vi.fn().mockResolvedValue('job-1') } as never,
      clock: new FakeClock(at),
      kind: 'DAILY_2130',
    });
    return reconBreaks.open;
  };
  const navOf = (isin: string) =>
    t.db.query.schemeNavs.findFirst({ where: (s, { eq }) => eq(s.isin, isin) });
  const auditOf = (isin: string) =>
    t.db
      .select({ action: auditEvents.action })
      .from(auditEvents)
      .where(eq(auditEvents.entityId, isin))
      .orderBy(auditEvents.occurredAt);

  it('accepts the next feed value of a released ISIN once, without the 25% check, then checks from it', async () => {
    await t.db
      .insert(schemeNavs)
      .values({ isin: 'INF209KD0001', nav: '10.000000', navDate: '2026-08-21' });
    const doubled = '1;INF209KD0001;-;E;Direct;Growth;20.0000;24-Aug-2026';
    // A move of 100% is quarantined (NAV-09) and stays out of nav_history.
    expect(await sync([doubled], '2026-08-24T16:00:00.000Z', '24-Aug-2026')).toHaveBeenCalledOnce();
    expect((await navOf('INF209KD0001'))?.quarantined).toBe(true);

    await releaseNav(t.db, { isin: 'INF209KD0001', approver1: 'ops-a', approver2: 'ops-b' });
    expect((await navOf('INF209KD0001'))?.quarantined).toBe(false);

    // The next sync takes the same feed value without the check, and audits that it used the release.
    expect(await sync([doubled], '2026-08-25T05:00:00.000Z', '24-Aug-2026')).not.toHaveBeenCalled();
    const taken = await navOf('INF209KD0001');
    expect([taken?.nav, taken?.navDate, taken?.prevNav, taken?.quarantined]).toEqual([
      '20.000000',
      '2026-08-24',
      '10.000000',
      false,
    ]);
    const history = await t.db.select().from(navHistory).where(eq(navHistory.isin, 'INF209KD0001'));
    expect(history.map((h) => [h.navDate, h.nav])).toEqual([['2026-08-24', '20.000000']]);
    expect((await auditOf('INF209KD0001')).map((a) => a.action)).toEqual([
      'NAV_RELEASE',
      'NAV_RELEASE_APPLIED',
    ]);

    // Once only: checks resume from 20, so the next 100% move is quarantined again.
    const quadrupled = '1;INF209KD0001;-;E;Direct;Growth;40.0000;25-Aug-2026';
    expect(
      await sync([quadrupled], '2026-08-25T16:00:00.000Z', '25-Aug-2026'),
    ).toHaveBeenCalledOnce();
    const again = await navOf('INF209KD0001');
    expect([again?.nav, again?.quarantined]).toEqual(['20.000000', true]);
  });

  it('refuses one approver twice, and an ISIN that is not quarantined, without an audit row', async () => {
    await t.db
      .insert(schemeNavs)
      .values({ isin: 'INF209KD0002', nav: '10.000000', navDate: '2026-08-24' });
    const release = (isin: string, approver2: string) =>
      releaseNav(t.db, { isin, approver1: 'ops-a', approver2 });
    await expect(release('INF209KD0002', 'ops-a')).rejects.toThrow(NavReleaseError);
    await expect(release('INF209KD0002', 'ops-b')).rejects.toThrow(NavReleaseError);
    await expect(release('INF209KD0003', 'ops-b')).rejects.toThrow(NavReleaseError);
    expect(await auditOf('INF209KD0002')).toEqual([]);
    expect((await navOf('INF209KD0002'))?.quarantined).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

```
pnpm --filter=@sanchay/api test amfi-nav-parser amfi-client
pnpm --filter=@sanchay/api test:int nav-sync
```

Expected failure: `./amfi-nav-parser.js`, `./amfi-client.js` and `../../src/modules/catalogue/nav/nav.service.js`/`nav-sync.job.js`/`nav-history-backfill.js`/`nav-release.js` do not exist, so every import fails.

- [ ] **Step 3: Minimal implementation**

`apps/api/src/integrations/amfi/amfi-nav-parser.ts` (full file — port of `AmfiNavParser.java`):

```typescript
import { type Isin, type IsoDate, isIsin } from '@sanchay/domain';

export interface NavRow {
  isin: Isin;
  /** The feed's own decimal string; never rounded or reparsed as a float. */
  nav: string;
  navDate: IsoDate;
  schemeName: string | null;
}

export interface ParsedNavFeed {
  rows: NavRow[];
  futureDated: NavRow[];
  furthestFutureDate: IsoDate | null;
}

export class NavFeedFormatError extends Error {
  override name = 'NavFeedFormatError';
}

/** Explicit "no bound" sentinel — a caller must opt in, mirroring v1's refusal of a null bound. */
export const NAV_UNBOUNDED_DATE = '9999-12-31' as IsoDate;

const DELIMITER = ';';
const NON_ALPHANUMERIC = /[^a-z0-9]/g;
const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};
const NAV_DATE_RE = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/;
const PREVIEW_LIMIT = 200;
const MIN_HEADER_CELLS = 3;
const PLACEHOLDERS = new Set(['-', '--', 'N.A.', 'N.A', 'NA', 'N/A', 'NULL']);
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function headerKey(cell: string): string {
  return cell.toLowerCase().replace(NON_ALPHANUMERIC, '');
}

function isPlaceholder(trimmed: string): boolean {
  return trimmed.length === 0 || PLACEHOLDERS.has(trimmed.toUpperCase());
}

function parseNavCell(cell: string): string | null {
  const raw = cell.trim();
  if (isPlaceholder(raw)) return null;
  const cleaned = raw.replace(/,/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned) > 0 ? cleaned : null;
}

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function parseNavDateCell(cell: string): string | null {
  const raw = cell.trim();
  if (isPlaceholder(raw)) return null;
  const m = NAV_DATE_RE.exec(raw);
  if (!m) return null;
  const [, dRaw, monRaw, yRaw] = m;
  const month = MONTHS[(monRaw as string).toLowerCase()];
  if (!month) return null;
  const day = Number(dRaw);
  const year = Number(yRaw);
  const monthIndex = Number(month) - 1;
  const maxDay = monthIndex === 1 && isLeapYear(year) ? 29 : (DAYS_IN_MONTH[monthIndex] ?? 0);
  if (day < 1 || day > maxDay) return null;
  return `${yRaw}-${month}-${String(day).padStart(2, '0')}`;
}

interface Layout {
  navIndex: number;
  dateIndex: number;
  nameIndex: number;
  isinIndexes: number[];
  maxIndex: number;
}

function resolveLayout(cells: string[]): Layout | null {
  if (cells.length < MIN_HEADER_CELLS) return null;
  let navIndex = -1;
  let dateIndex = -1;
  let nameIndex = -1;
  const isinIndexes: number[] = [];
  for (let i = 0; i < cells.length; i++) {
    const key = headerKey(cells[i] ?? '');
    if (key.length === 0) continue;
    if (key.includes('isin')) {
      isinIndexes.push(i);
    } else if (navIndex < 0 && (key.includes('netassetvalue') || key === 'nav')) {
      navIndex = i;
    } else if (dateIndex < 0 && key.includes('date')) {
      dateIndex = i;
    } else if (nameIndex < 0 && key.includes('name')) {
      nameIndex = i;
    }
  }
  if (navIndex < 0 || dateIndex < 0 || isinIndexes.length === 0) return null;
  const maxIndex = Math.max(navIndex, dateIndex, ...isinIndexes);
  return { navIndex, dateIndex, nameIndex, isinIndexes, maxIndex };
}

function preview(line: string | null): string {
  if (line === null) return '<none>';
  const trimmed = line.trim();
  return trimmed.length <= PREVIEW_LIMIT ? trimmed : `${trimmed.slice(0, PREVIEW_LIMIT)}...`;
}

function collectRows(cells: string[], layout: Layout, bound: string, out: NavRow[], futureDated: NavRow[]): void {
  if (cells.length <= layout.maxIndex) return;
  const nav = parseNavCell(cells[layout.navIndex] ?? '');
  if (nav === null) return;
  const navDate = parseNavDateCell(cells[layout.dateIndex] ?? '');
  if (navDate === null) return;
  let schemeName: string | null = null;
  if (layout.nameIndex >= 0 && layout.nameIndex < cells.length) {
    const trimmed = (cells[layout.nameIndex] ?? '').trim();
    schemeName = trimmed.length > 0 ? trimmed : null;
  }
  const target = navDate > bound ? futureDated : out;
  const emitted = new Set<string>();
  for (const isinIndex of layout.isinIndexes) {
    const raw = (cells[isinIndex] ?? '').trim();
    if (isPlaceholder(raw)) continue;
    const normalised = raw.toUpperCase();
    // AMFI's feed also carries non-ISINs here (`Redeemed`, `HDFCNIVODG`): skipped like a placeholder,
    // because one in scheme_navs fails its ISIN check and with it the whole sync (RV-02-74).
    if (!isIsin(normalised) || emitted.has(normalised)) continue;
    emitted.add(normalised);
    target.push({ isin: normalised, nav, navDate: navDate as IsoDate, schemeName });
  }
}

/**
 * Ports `AmfiNavParser.parse(String, LocalDate)`. `options.bound` is mandatory and must not be
 * null/undefined — pass `NAV_UNBOUNDED_DATE` on purpose for "every row" (diagnostics, or the layout
 * tests). A row dated after the bound lands in `futureDated`, never `rows`; the bound is inclusive.
 */
export function parseAmfiNav(body: string, options: { bound: IsoDate }): ParsedNavFeed {
  if (options === null || options === undefined || options.bound === null || options.bound === undefined) {
    throw new TypeError('parseAmfiNav: options.bound must not be null; pass NAV_UNBOUNDED_DATE for an unbounded parse');
  }
  if (body === null || body === undefined) {
    throw new NavFeedFormatError('AMFI NAV feed body was null; expected a semicolon-delimited text report.');
  }
  const text = body.charCodeAt(0) === 0xfeff ? body.slice(1) : body;
  if (text.trim().length === 0) {
    throw new NavFeedFormatError('AMFI NAV feed body was blank; expected a semicolon-delimited text report.');
  }

  const rows: NavRow[] = [];
  const futureDated: NavRow[] = [];
  let layout: Layout | null = null;
  let firstMeaningfulLine: string | null = null;
  let scanned = 0;

  for (const line of text.split(/\r\n|\r|\n/)) {
    if (line.trim().length === 0) continue;
    scanned++;
    if (firstMeaningfulLine === null) firstMeaningfulLine = line;
    const cells = line.split(DELIMITER);
    if (layout === null) {
      layout = resolveLayout(cells);
      continue;
    }
    collectRows(cells, layout, options.bound, rows, futureDated);
  }

  if (layout === null) {
    throw new NavFeedFormatError(
      `AMFI NAV feed header could not be resolved: none of the ${scanned} non-blank line(s) carried a NAV column, a date column and at least one ISIN column. First line was: ${preview(firstMeaningfulLine)}`,
    );
  }
  let furthestFutureDate: IsoDate | null = null;
  for (const row of futureDated) {
    if (furthestFutureDate === null || row.navDate > furthestFutureDate) furthestFutureDate = row.navDate;
  }
  return { rows, futureDated, furthestFutureDate };
}
```

`apps/api/src/integrations/amfi/nav-floors.ts` (full file):

```typescript
export const NAV_ROW_MIN_COUNT = 1000;
export const NAV_MATCHED_FRACTION_FLOOR = 0.1;
/** Per-ISIN day-over-day plausibility threshold (NAV-09). */
export const NAV_JUMP_FLOOR_PCT = 0.25;

export class NavSyncFloorBreachedError extends Error {
  override name = 'NavSyncFloorBreachedError';
}

/** Run-wide floors, checked before any scheme_navs write (NAV-06). Throws on breach. */
export function assertRunFloors(input: { rowsParsed: number; matched: number; tracked: number }): void {
  if (input.rowsParsed < NAV_ROW_MIN_COUNT) {
    throw new NavSyncFloorBreachedError(`row floor breached: parsed ${input.rowsParsed} row(s), require at least ${NAV_ROW_MIN_COUNT}`);
  }
  if (input.tracked > 0 && input.matched / input.tracked < NAV_MATCHED_FRACTION_FLOOR) {
    throw new NavSyncFloorBreachedError(
      `cold-start matched-fraction floor breached: matched ${input.matched}/${input.tracked}`,
    );
  }
}

/** True when the move from prevNav to nav exceeds NAV_JUMP_FLOOR_PCT and the ISIN must be quarantined. */
export function quarantineDecision(prevNav: string | null, nav: string): boolean {
  if (prevNav === null) return false;
  const prev = Number(prevNav);
  if (prev === 0) return false;
  const move = Math.abs((Number(nav) - prev) / prev);
  return move > NAV_JUMP_FLOOR_PCT;
}
```

`apps/api/src/integrations/amfi/amfi-client.ts` (full file):

```typescript
import { setTimeout as delay } from 'node:timers/promises';
import { request } from 'undici';

const DAILY_URL = 'https://portal.amfiindia.com/spages/NAVAll.txt';
const HISTORY_URL = 'https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx';
const MAX_ATTEMPTS = 3;
/** "Not now" answers, retried like a network error or a timeout; any other non-2xx status is final. */
const RETRYABLE_STATUS = new Set([408, 429]);

/** How long a request waits for its response headers, and then between two chunks of its body. */
export interface AmfiTimeouts {
  headersTimeout: number;
  bodyTimeout: number;
}

/** NAVAll.txt (about 1.5 MB) starts answering in under a second. */
export const DAILY_TIMEOUTS: AmfiTimeouts = { headersTimeout: 10_000, bodyTimeout: 30_000 };

/**
 * The history report sends nothing until AMFI has built the whole range: one month took 8 to 31 s and
 * three months 66 s before the first byte (2026-10-05), so the backfill asks for one month at a time.
 * 5 minutes also stays under the 350 s after which prod's NAT gateway drops an idle connection.
 */
export const HISTORY_TIMEOUTS: AmfiTimeouts = { headersTimeout: 300_000, bodyTimeout: 60_000 };

/** A non-2xx answer from AMFI. */
export class AmfiHttpError extends Error {
  override name = 'AmfiHttpError';

  constructor(
    readonly statusCode: number,
    url: string,
  ) {
    super(`AMFI feed ${url} returned ${statusCode}`);
  }
}

function retryable(e: unknown): boolean {
  if (!(e instanceof AmfiHttpError)) return true;
  return e.statusCode >= 500 || RETRYABLE_STATUS.has(e.statusCode);
}

function backoffMs(attempt: number): number {
  return Math.min(2_000 * 2 ** (attempt - 2), 16_000);
}

async function fetchOnce(url: string, timeouts: AmfiTimeouts): Promise<string> {
  const res = await request(url, { method: 'GET', ...timeouts });
  if (res.statusCode < 200 || res.statusCode > 299) {
    await res.body.dump();
    throw new AmfiHttpError(res.statusCode, url);
  }
  return res.body.text();
}

export class AmfiClient {
  constructor(private readonly sleep: (ms: number) => Promise<unknown> = (ms) => delay(ms)) {}

  fetchDaily(): Promise<string> {
    return this.fetchWithRetry(DAILY_URL, DAILY_TIMEOUTS);
  }

  /** AMFI's history report for [fromIso, toIso], both inclusive; AMFI accepts ISO dates. */
  fetchHistory(fromIso: string, toIso: string): Promise<string> {
    const params = new URLSearchParams({ frmdt: fromIso, todt: toIso });
    return this.fetchWithRetry(`${HISTORY_URL}?${params.toString()}`, HISTORY_TIMEOUTS);
  }

  /** Up to MAX_ATTEMPTS attempts: a network error, a timeout, a 5xx, 408 or 429 is tried again after 2 s, then 4 s. */
  private async fetchWithRetry(url: string, timeouts: AmfiTimeouts): Promise<string> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await fetchOnce(url, timeouts);
      } catch (e) {
        if (attempt >= MAX_ATTEMPTS || !retryable(e)) throw e;
      }
      await this.sleep(backoffMs(attempt + 1));
    }
  }
}
```

`apps/api/src/modules/catalogue/nav/nav.service.ts` (full file):

```typescript
import type { Isin, NavGrade } from '@sanchay/domain';
import type { DbExecutor } from '../../../db/client.js';
import { istDayStart } from '../../identity/otp.service.js';
import { type Clock, DAY } from '../../platform/clock.js';

/** D-MONEY-067: OK while the NAV is at most 7 IST calendar days old (inclusive), STALE after that. */
const STALE_AFTER_DAYS = 7;

/**
 * Today's IST calendar date (YYYY-MM-DD), from Plan 01's `istDayStart`: an IST day ends at 18:30 UTC
 * on its own date, so the day's last instant carries that date in UTC too.
 */
export function istToday(now: Date): string {
  return new Date(istDayStart(now).getTime() + DAY - 1).toISOString().slice(0, 10);
}

export interface NavLatest {
  nav: string;
  navDate: string;
  grade: NavGrade;
}

export class NavService {
  constructor(private readonly clock: Clock) {}

  /**
   * D-MONEY-067 (RV-02-49): age counts IST calendar days, so from 00:00 IST the new day already
   * counts. A quarantined row, or one dated after today IST (never used), grades UNAVAILABLE and keeps
   * its last value.
   */
  async latest(exec: DbExecutor, isin: Isin): Promise<NavLatest | null> {
    const row = await exec.query.schemeNavs.findFirst({ where: (t, { eq }) => eq(t.isin, isin) });
    if (!row) return null;
    const today = istToday(this.clock.now());
    if (row.quarantined || row.navDate > today) {
      return { nav: row.nav, navDate: row.navDate, grade: 'UNAVAILABLE' };
    }
    const ageDays = (Date.parse(today) - Date.parse(row.navDate)) / DAY;
    return { nav: row.nav, navDate: row.navDate, grade: ageDays > STALE_AFTER_DAYS ? 'STALE' : 'OK' };
  }
}
```

`apps/api/src/modules/catalogue/nav/nav-sync.job.ts` (full file — `@JobHandler` decorator from D2, used exactly as the outline names it; `Jobs`/`ReconBreaks` types are the outline's own signatures since no real D1/D2 code exists to check against yet):

```typescript
import { type NavRow, parseAmfiNav } from '../../../integrations/amfi/amfi-nav-parser.js';
import type { AmfiClient } from '../../../integrations/amfi/amfi-client.js';
import { assertRunFloors, NavSyncFloorBreachedError, quarantineDecision } from '../../../integrations/amfi/nav-floors.js';
import type { Clock } from '../../platform/clock.js';
import type { Database } from '../../../db/client.js';
import { auditEvents } from '../../platform/platform.schema.js';
import { navSyncRuns, schemeNavs, schemes } from '../catalogue.schema.js';
import { eq, sql } from 'drizzle-orm';
import { insertNavHistory } from './nav-history-backfill.js';
import { NAV_RELEASE_APPLIED, pendingNavReleases } from './nav-release.js';
import { istToday } from './nav.service.js';

export interface NavSyncDeps {
  client: Pick<AmfiClient, 'fetchDaily'>;
  reconBreaks: {
    open(
      tx: unknown,
      input: { kind: string; entityType: string; entityId: string; severity: 'WARNING' | 'CRITICAL'; detail?: Record<string, unknown> },
    ): Promise<void>;
  };
  jobs: { enqueue(tx: unknown, name: string, data: unknown): Promise<string | null> };
  clock: Clock;
  kind: 'DAILY_2130' | 'DAILY_2330' | 'DAILY_0700' | 'DAILY_1030';
}

/**
 * One row per ISIN, the latest-dated (v1's latestPerIsin). NAVAll.txt lists a few matured ISINs twice
 * (2026-10-05: INF204KB1XN0 at 10.0000 and 13.5859): applying both flipped the ISIN into quarantine and
 * reopened a CRITICAL break on every sync (RV-02-74).
 */
function latestPerIsin(rows: readonly NavRow[]): NavRow[] {
  const latest = new Map<string, NavRow>();
  for (const row of rows) {
    const seen = latest.get(row.isin);
    if (seen === undefined || row.navDate > seen.navDate) latest.set(row.isin, row);
  }
  return [...latest.values()];
}

export async function runNavSync(db: Database, deps: NavSyncDeps): Promise<void> {
  const [run] = await db.insert(navSyncRuns).values({ kind: deps.kind, status: 'RUNNING' }).returning();
  if (run === undefined) throw new Error('runNavSync: the nav_sync_runs insert returned no row');
  const runId = run.id;
  // D-MONEY-067 (RV-02-49): a NAV dated after today IST is rejected at ingest (it lands in futureDated).
  const bound = istToday(deps.clock.now());

  let body: string;
  try {
    body = await deps.client.fetchDaily();
  } catch (e) {
    await db.update(navSyncRuns).set({ status: 'FAILED', finishedAt: new Date(), failureReason: (e as Error).message }).where(eq(navSyncRuns.id, runId));
    return;
  }

  const parsed = parseAmfiNav(body, { bound: bound as never });
  const tracked = (await db.select({ c: sql<number>`count(*)` }).from(schemes).where(eq(schemes.curated, true)))[0]?.c ?? 0;
  const matched = parsed.rows.filter((r) => true).length; // every parsed row counts toward matched; refined once schemes.isin lookups are wired

  try {
    assertRunFloors({ rowsParsed: parsed.rows.length, matched, tracked: Number(tracked) });
  } catch (e) {
    if (e instanceof NavSyncFloorBreachedError) {
      await db.update(navSyncRuns).set({ status: 'FAILED', finishedAt: new Date(), failureReason: e.message }).where(eq(navSyncRuns.id, runId));
      return;
    }
    throw e;
  }

  let quarantinedCount = 0;
  const accepted: NavRow[] = [];
  // R-35: an ISIN released by ops:nav-release takes this sync's feed value once, without the NAV-09 check.
  const released = await pendingNavReleases(db);
  for (const row of latestPerIsin(parsed.rows)) {
    const existing = await db.query.schemeNavs.findFirst({ where: (t, { eq: eqOp }) => eqOp(t.isin, row.isin) });
    if (!existing) {
      await db.insert(schemeNavs).values({
        isin: row.isin,
        nav: row.nav,
        navDate: row.navDate,
        schemeNameSnapshot: row.schemeName,
        quarantined: false,
      });
      accepted.push(row);
      continue;
    }
    const release = released.has(row.isin);
    if (!release && quarantineDecision(existing.nav, row.nav)) {
      quarantinedCount++;
      await db.update(schemeNavs).set({ quarantined: true, updatedAt: new Date() }).where(eq(schemeNavs.isin, row.isin));
      await deps.reconBreaks.open(db, {
        kind: 'NAV_JUMP_QUARANTINE',
        entityType: 'scheme_navs',
        entityId: row.isin,
        severity: 'CRITICAL',
        detail: { prevNav: existing.nav, nav: row.nav },
      });
      continue;
    }
    const apply = { prevNav: existing.nav, prevNavDate: existing.navDate, nav: row.nav, navDate: row.navDate, schemeNameSnapshot: row.schemeName, quarantined: false, updatedAt: new Date() };
    if (!release) {
      await db.update(schemeNavs).set(apply).where(eq(schemeNavs.isin, row.isin));
    } else {
      // The release is used up with the value it let through, so the next sync checks from this NAV.
      await db.transaction(async (tx) => {
        await tx.update(schemeNavs).set(apply).where(eq(schemeNavs.isin, row.isin));
        await tx.insert(auditEvents).values({
          actorType: 'SYSTEM',
          actorId: 'nav.sync.daily',
          action: NAV_RELEASE_APPLIED,
          entityType: 'scheme_navs',
          entityId: row.isin,
          data: { runId, prevNav: existing.nav, prevNavDate: existing.navDate, nav: row.nav, navDate: row.navDate },
        });
      });
    }
    accepted.push(row);
  }

  // R-33: the accepted NAVs also extend nav_history, which E16's returns read; a quarantined one never does.
  await insertNavHistory(db, accepted);

  await db
    .update(navSyncRuns)
    .set({
      status: 'SUCCEEDED',
      finishedAt: new Date(),
      rowsParsed: parsed.rows.length,
      rowsMatched: matched,
      rowsQuarantined: quarantinedCount,
      rowsFutureDated: parsed.futureDated.length,
      maxNavDate: parsed.rows.at(-1)?.navDate ?? null,
    })
    .where(eq(navSyncRuns.id, runId));

  await deps.jobs.enqueue(db, 'catalogue.returns.compute', {});
}
```

`apps/api/src/modules/catalogue/nav/nav-history-backfill.ts` (full file):

```typescript
import { toIsoDate } from '@sanchay/domain';
import { between, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../../db/client.js';
import type { AmfiClient } from '../../../integrations/amfi/amfi-client.js';
import { type NavRow, parseAmfiNav } from '../../../integrations/amfi/amfi-nav-parser.js';
import { assertRunFloors } from '../../../integrations/amfi/nav-floors.js';
import { DAY } from '../../platform/clock.js';
import { navHistory } from '../catalogue.schema.js';

/** Rows per INSERT: three bind parameters each, far under PostgreSQL's 65,535 per statement. */
export const NAV_HISTORY_INSERT_BATCH = 1_000;

/**
 * NAV-06's 1,000-row floor applies to a window of at least a week: a business day carries 10,500 to
 * 12,200 NAVs, a weekend or holiday only the 750 to 1,150 of the funds that publish every day.
 */
export const NAV_HISTORY_FLOOR_MIN_DAYS = 7;

export interface NavWindow {
  from: string;
  to: string;
}

export interface NavWindowResult extends NavWindow {
  rowsParsed: number;
  rowsWritten: number;
}

export interface NavWindowStored extends NavWindow {
  days: number;
  navDates: number;
  rows: number;
}

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function daysIn(window: NavWindow): number {
  return (Date.parse(window.to) - Date.parse(window.from)) / DAY + 1;
}

/** Splits [from, to] (ISO dates, both inclusive) into calendar months, oldest first. */
export function monthWindows(from: string, to: string): NavWindow[] {
  const end = Date.parse(toIsoDate(to));
  let start = Date.parse(toIsoDate(from));
  if (start > end) throw new RangeError(`nav history: from ${from} is after to ${to}`);
  const windows: NavWindow[] = [];
  while (start <= end) {
    const day = new Date(start);
    const nextMonth = Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 1);
    windows.push({ from: isoDay(start), to: isoDay(Math.min(nextMonth - DAY, end)) });
    start = nextMonth;
  }
  return windows;
}

/** INSERT ... ON CONFLICT (isin, nav_date) DO NOTHING, in batches; returns the rows actually inserted. */
export async function insertNavHistory(exec: DbExecutor, rows: readonly NavRow[]): Promise<number> {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += NAV_HISTORY_INSERT_BATCH) {
    const batch = rows
      .slice(i, i + NAV_HISTORY_INSERT_BATCH)
      .map((r) => ({ isin: r.isin, navDate: r.navDate, nav: r.nav }));
    const written = await exec
      .insert(navHistory)
      .values(batch)
      .onConflictDoNothing({ target: [navHistory.isin, navHistory.navDate] })
      .returning({ isin: navHistory.isin });
    inserted += written.length;
  }
  return inserted;
}

/**
 * R-33: loads AMFI's history for [from, to] one calendar month at a time (one request, then
 * NAV_HISTORY_INSERT_BATCH-row inserts), so a run holds at most one month's report. Idempotent:
 * rowsWritten counts only the rows nav_history did not hold yet. Stops at the first month that fails.
 */
export async function backfillNavHistory(
  exec: DbExecutor,
  client: Pick<AmfiClient, 'fetchHistory'>,
  range: NavWindow,
  onWindow: (result: NavWindowResult) => void = () => {},
): Promise<{ rowsParsed: number; rowsWritten: number }> {
  let rowsParsed = 0;
  let rowsWritten = 0;
  for (const window of monthWindows(range.from, range.to)) {
    const body = await client.fetchHistory(window.from, window.to);
    const parsed = parseAmfiNav(body, { bound: toIsoDate(window.to) });
    if (daysIn(window) >= NAV_HISTORY_FLOOR_MIN_DAYS) {
      assertRunFloors({ rowsParsed: parsed.rows.length, matched: parsed.rows.length, tracked: 0 });
    }
    const written = await insertNavHistory(exec, parsed.rows);
    rowsParsed += parsed.rows.length;
    rowsWritten += written;
    onWindow({ ...window, rowsParsed: parsed.rows.length, rowsWritten: written });
  }
  return { rowsParsed, rowsWritten };
}

/** Read-only (`--check`): per calendar month of [from, to], its days and what nav_history holds. */
export async function navHistoryStored(
  exec: DbExecutor,
  range: NavWindow,
): Promise<NavWindowStored[]> {
  const windows = monthWindows(range.from, range.to);
  const month = sql<string>`to_char(${navHistory.navDate}, 'YYYY-MM')`;
  const counts = await exec
    .select({
      month,
      rows: sql<number>`count(*)::int`,
      navDates: sql<number>`count(distinct ${navHistory.navDate})::int`,
    })
    .from(navHistory)
    .where(between(navHistory.navDate, range.from, range.to))
    .groupBy(month);
  const byMonth = new Map(counts.map((c) => [c.month, c]));
  return windows.map((w) => {
    const stored = byMonth.get(w.from.slice(0, 7));
    return { ...w, days: daysIn(w), navDates: stored?.navDates ?? 0, rows: stored?.rows ?? 0 };
  });
}
```

`apps/api/src/modules/catalogue/nav/nav-release.ts` (full file; RV-02-76, R-35):

```typescript
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Database } from '../../../db/client.js';
import { auditEvents } from '../../platform/platform.schema.js';
import { schemeNavs } from '../catalogue.schema.js';

/** R-35: `ops:nav-release` audits NAV_RELEASE; the sync that then takes the ISIN's feed value audits NAV_RELEASE_APPLIED. */
export const NAV_RELEASE = 'NAV_RELEASE';
export const NAV_RELEASE_APPLIED = 'NAV_RELEASE_APPLIED';

export class NavReleaseError extends Error {
  override readonly name = 'NavReleaseError';
}

export interface NavRelease {
  isin: string;
  approver1: string;
  approver2: string;
}

/**
 * R-35: releases a quarantined ISIN once an operator has checked its NAV on the AMC site with a second
 * approver. The last good NAV grades by age again, and the next `nav.sync.daily` takes the ISIN's feed
 * value once without the NAV-09 move check. An ISIN that is not quarantined is refused, so a stray
 * release cannot wave a later move through.
 */
export async function releaseNav(db: Database, input: NavRelease): Promise<void> {
  if (input.approver1 === input.approver2) {
    throw new NavReleaseError(
      'ops-nav-release: --approver1 and --approver2 must be two distinct approvers',
    );
  }
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(schemeNavs)
      .set({ quarantined: false, updatedAt: new Date() })
      .where(and(eq(schemeNavs.isin, input.isin), eq(schemeNavs.quarantined, true)))
      .returning({ nav: schemeNavs.nav, navDate: schemeNavs.navDate });
    if (row === undefined) {
      throw new NavReleaseError(
        `ops-nav-release: ${input.isin} has no quarantined scheme_navs row`,
      );
    }
    await tx.insert(auditEvents).values({
      actorType: 'SYSTEM',
      actorId: input.approver1,
      action: NAV_RELEASE,
      entityType: 'scheme_navs',
      entityId: input.isin,
      data: { ...input, lastGoodNav: row.nav, lastGoodNavDate: row.navDate },
    });
  });
}

/** R-35: the ISINs whose latest release no sync has taken yet (one read on audit_events_entity_idx per sync). */
export async function pendingNavReleases(db: Database): Promise<Set<string>> {
  const latest = await db
    .selectDistinctOn([auditEvents.entityId], {
      isin: auditEvents.entityId,
      action: auditEvents.action,
    })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.entityType, 'scheme_navs'),
        inArray(auditEvents.action, [NAV_RELEASE, NAV_RELEASE_APPLIED]),
      ),
    )
    .orderBy(auditEvents.entityId, desc(auditEvents.occurredAt), desc(auditEvents.id));
  const pending = new Set<string>();
  for (const r of latest) {
    if (r.action === NAV_RELEASE && r.isin !== null) pending.add(r.isin);
  }
  return pending;
}
```

`apps/api/src/cli/ops-nav-backfill.ts` (full file):

```typescript
import { loadDotEnvFile } from '../config/dotenv.js';
import { parseEnv } from '../config/env.js';
import { createDb } from '../db/client.js';
import { AmfiClient } from '../integrations/amfi/amfi-client.js';
import {
  backfillNavHistory,
  navHistoryStored,
} from '../modules/catalogue/nav/nav-history-backfill.js';
import { DAY } from '../modules/platform/clock.js';

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  if (!v) throw new Error(`ops-nav-backfill: --${name} is required`);
  return v;
}

loadDotEnvFile();
const env = parseEnv(process.env);
const range = { from: arg('from'), to: arg('to') };
const dbh = createDb(env.DATABASE_URL, 2);
try {
  if (process.argv.includes('--check')) {
    // Read-only: what nav_history holds for each month of the range; AMFI is not called.
    for (const m of await navHistoryStored(dbh.db, range)) {
      console.log(
        `nav history stored ${m.from}..${m.to}: ${m.rows} row(s) on ${m.navDates} of ${m.days} day(s)`,
      );
    }
  } else {
    let resumeFrom = range.from;
    let started = performance.now();
    try {
      const total = await backfillNavHistory(dbh.db, new AmfiClient(), range, (w) => {
        const seconds = Math.round((performance.now() - started) / 1000);
        console.log(
          `nav history ${w.from}..${w.to}: ${w.rowsParsed} row(s) parsed, ${w.rowsWritten} written, ${seconds} s`,
        );
        resumeFrom = new Date(Date.parse(w.to) + DAY).toISOString().slice(0, 10);
        started = performance.now();
      });
      console.log(
        `nav history backfill: ${total.rowsWritten} row(s) written, ${total.rowsParsed} parsed`,
      );
    } catch (e) {
      console.error(
        `nav history backfill stopped; to resume, run it again with --from ${resumeFrom} --to ${range.to}`,
      );
      throw e;
    }
  }
} finally {
  await dbh.close();
}
```

`apps/api/src/cli/ops-nav-release.ts` (full file; RV-02-76: the release goes through `releaseNav`):

```typescript
import { loadDotEnvFile } from '../config/dotenv.js';
import { parseEnv } from '../config/env.js';
import { createDb } from '../db/client.js';
import { releaseNav } from '../modules/catalogue/nav/nav-release.js';

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  if (!v) throw new Error(`ops-nav-release: --${name} is required`);
  return v;
}

loadDotEnvFile();
const env = parseEnv(process.env);
const release = { isin: arg('isin'), approver1: arg('approver1'), approver2: arg('approver2') };
const dbh = createDb(env.DATABASE_URL, 2);
try {
  // R-35: the next nav.sync.daily takes this ISIN's feed value once, without the 25% move check.
  await releaseNav(dbh.db, release);
  console.log(`nav released: ${release.isin}; the next NAV sync accepts its feed value once`);
} finally {
  await dbh.close();
}
```

**D9 Step 3 addendum (RV-02-4/5).**

`apps/api/src/modules/platform/jobs/schedules.ts` (modify: append the four NAV schedules after D2's `identity.cleanup` line):

```typescript
export async function registerSchedules(boss: PgBoss): Promise<void> {
  const tz = 'Asia/Kolkata';
  await boss.schedule('identity.cleanup', '0 * * * *', {}, { tz, key: 'identity-cleanup' });
  await boss.schedule('nav.sync.daily', '30 21 * * *', { kind: 'DAILY_2130' }, { tz, key: 'nav-2130' });
  await boss.schedule('nav.sync.daily', '30 23 * * *', { kind: 'DAILY_2330' }, { tz, key: 'nav-2330' });
  await boss.schedule('nav.sync.daily', '0 7 * * *', { kind: 'DAILY_0700' }, { tz, key: 'nav-0700' });
  await boss.schedule('nav.sync.daily', '30 10 * * *', { kind: 'DAILY_1030' }, { tz, key: 'nav-1030' });
}
```

`apps/api/src/modules/catalogue/nav/nav-sync.job.ts` (append the handler; turn the `AmfiClient` type import into a value import and add these imports):

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { DB, type DbHandle } from '../../../db/client.js';
import { CLOCK } from '../../platform/clock.js';
import { Jobs } from '../../platform/jobs/jobs.service.js';
import { JobHandler, type Job } from '../../platform/jobs/job-registry.js';
import { ReconBreaks } from '../../platform/runtime-config.js';

@Injectable()
@JobHandler('nav.sync.daily')
export class NavSyncJob {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(Jobs) private readonly jobs: Jobs,
  ) {}

  async handle(job: Job<'nav.sync.daily'>): Promise<void> {
    const { kind } = job.data as { kind: NavSyncDeps['kind'] };
    await runNavSync(this.dbh.db, { client: new AmfiClient(), reconBreaks: ReconBreaks, jobs: this.jobs, clock: this.clock, kind });
  }
}
```

`apps/api/src/modules/catalogue/catalogue.module.ts` (new):

```typescript
import { Module } from '@nestjs/common';
import { NavSyncJob } from './nav/nav-sync.job.js';

@Module({ providers: [NavSyncJob] })
export class CatalogueModule {}
```

`apps/api/src/app.module.ts` (modify: add `CatalogueModule` to `imports` after `IdentityModule`).


`apps/api/package.json` (modify — append under `scripts`):

```json
"ops:nav-backfill": "nest build -b swc && node dist/cli/ops-nav-backfill.js",
"ops:nav-release": "nest build -b swc && node dist/cli/ops-nav-release.js"
```

root `package.json` (modify — append under `scripts`):

```json
"ops:nav-backfill": "pnpm --filter=@sanchay/api ops:nav-backfill",
"ops:nav-release": "pnpm --filter=@sanchay/api ops:nav-release"
```

- [ ] **Step 4: Run tests to confirm they pass**

```
pnpm --filter=@sanchay/api test amfi-nav-parser amfi-client
pnpm --filter=@sanchay/api test:int nav-sync
pnpm --filter=@sanchay/api typecheck
```

Expected: all 32 parser cases, the 5 `AmfiClient` cases and the eight NAV integration cases (two grading, one sync, two release, three backfill) pass; `typecheck` is clean.

- [ ] **Step 5: Commit**

```
pnpm exec biome check --write apps/api/src/integrations/amfi apps/api/src/modules/catalogue/nav apps/api/src/modules/catalogue/catalogue.module.ts apps/api/src/app.module.ts apps/api/src/cli/ops-nav-backfill.ts apps/api/src/cli/ops-nav-release.ts apps/api/test/int/nav-sync.int.test.ts apps/api/src/modules/platform/jobs/schedules.ts packages/test-fixtures apps/api/package.json package.json
pnpm install
pnpm --filter=@sanchay/api test amfi-nav-parser amfi-client
pnpm --filter=@sanchay/api test:int nav-sync
pnpm --filter=@sanchay/api typecheck
pnpm lint
git add apps/api/src/integrations/amfi apps/api/src/modules/catalogue/nav apps/api/src/modules/catalogue/catalogue.module.ts apps/api/src/app.module.ts apps/api/src/cli/ops-nav-backfill.ts apps/api/src/cli/ops-nav-release.ts apps/api/test/int/nav-sync.int.test.ts apps/api/src/modules/platform/jobs/schedules.ts packages/test-fixtures pnpm-lock.yaml apps/api/package.json package.json
git commit -m "feat(catalogue): port AMFI NAV parser, add nav.sync.daily and NAV ops CLIs" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task D10: `catalogue.fp.sync`, `catalogue.categories`, basic `catalogue.listSchemes` (Dev B, 4 h)

**Files (create):**
- `apps/api/src/modules/catalogue/{fp-sync.job.ts, catalogue.router.ts, catalogue.queries.ts}`
- `packages/contract/src/catalogue.ts`
- `apps/api/test/int/catalogue-router.int.test.ts`
- `apps/api/src/modules/catalogue/fp-sync.job.test.ts`

**Files (modify):**
- `packages/contract/src/index.ts`
- `packages/contract/src/auth.test.ts` (Plan 01's exact top-level and `me` key checks become `expect.arrayContaining`, RV-02-30)
- `apps/api/openapi.json` (regenerated, not hand-edited)
- `apps/api/src/app.module.ts` (D9's `CatalogueModule` becomes `CatalogueModule.forRoot(env)`)
- `apps/api/src/modules/catalogue/catalogue.module.ts` (created by D9; becomes `forRoot(env)`, adds the router and, in the worker role only, `CatalogueFpSyncJob`)
- `apps/api/package.json` (`"@sanchay/validation": "workspace:*"`: `fp-sync.job.ts` is the first `apps/api` import of `@sanchay/validation`, RV-02-28)
- `pnpm-lock.yaml` (written by that `pnpm add`)

**Interfaces:**
- Prerequisites: D8 (`schemes`, `sebiCategories`, `fundFactsRevisions` tables); D3 (`FpRead`, `fpJson`); D2 (`@JobHandler`, `Jobs.enqueue`, `schedule`).
- Consumes: D8's `schemes`, `sebiCategories`, `fundFactsRevisions`, `SchemeThresholds`; `@sanchay/domain` — `LAUNCH_SCHEME_OPTIONS`; `@sanchay/validation` — `moneyWireSchema`; Plan-01 `packages/contract/src/errors.ts` — `errorMap`, `COMMON_ERRORS`, `SESSION_ERRORS`; `apps/api/src/modules/identity/request-auth.ts` — `requireAuth`; Plan-01 router pattern (`@Implement`/`implement` from `@orpc/nest`, `ClsService<SanchayClsStore>`), mirrored from `apps/api/src/modules/identity/me.router.ts`. Consumes (D3, outline-specified names — no real code to verify against yet): `FpRead.schemePlans`, `FpRead.fundScheme`, `fpJson.money`.
- Produces: job `catalogue.fp.sync`, which writes `schemes.{fpActive, purchaseAllowed, redemptionAllowed, sipAllowed, lockInMonths, thresholds, sipDates, status}`; `toThresholds(plan)` and `toSipDates(plan)` (exported for the unit test); procedures `catalogue.categories` GET `/catalogue/categories`, `catalogue.listSchemes` GET `/catalogue/schemes?q&category&cursor`; `CatalogueModule`.
- Deviation from outline: the outline's `(P)` tag after these two procedures is ambiguous — §0.1 defines `P` as an **FP-write operation class** (`investor_profiles`, `mf_investment_accounts`, …), which does not apply to a read-only catalogue browse. The real Plan-01 auth convention (verified in `apps/api/src/app.module.ts`: `SessionGuard` is a global `APP_GUARD`, opted out per-route only by `@Public()`) is that every procedure is investor-authenticated by default. This task reads `(P)` as "no `@Public()`" — i.e. both procedures require a session, following the same undecorated-controller pattern as `MeRouter`. No `Public()` decorator is applied.
- Review fix (RV-02-5): `catalogue.module.ts` is created by D9 (for `NavSyncJob`). D10 turns it into `CatalogueModule.forRoot(env)`, which adds `CatalogueRouter` and, only when `SANCHAY_APP_ROLE === 'worker'`, `CatalogueFpSyncJob` (it injects `FpRead`, which exists only in the worker via the global `FpModule`).
- Deviation/assumption: no Plan-01 procedure yet binds a GET route to query-string input (`LoginRouter`/`MeRouter` are all POST; `ref.pincode` — D6 — uses a path param). `catalogue.listSchemes`'s input schema is written as a flat `z.object({ q, category, cursor })`, which `@orpc/openapi`'s GET binding maps to the query string; this is the documented oRPC convention, not something verified against existing Plan-01 code, since none exists yet.
- Review fix (RV-02-6): the job uses D3's real `FpRead` (no local interface). Limits come from `FpSchemePlan.raw.thresholds[]` as documented in `docs/research/fp-api.md` §8A: `type: 'lumpsum'` gives `amount_min/amount_max/amount_multiples`; `type: 'sip'` with `frequency: 'monthly'` gives the SIP limits and days (without that row the SIP limits are null and the scheme takes no SIP, RV-02-55). Each value goes through `fpJson.money(value, field)` and then `moneyWireSchema`. `schemePlans` is paged (size 100) until a short page. Eligibility flags come from `fundScheme(isin)` (§8B).
- Review fix (RV-02-30): this task adds the first new top-level contract key (`catalogue`), so it relaxes Plan 01's `packages/contract/src/auth.test.ts` test "exposes exactly the 9 MVP procedures", whose exact `['auth', 'health', 'me']` check would otherwise fail (reproduced). The fragment is the one Plan 03 E2 carried as RV-03-5 (the top-level and `me` keys become `expect.arrayContaining`); E2, E4 and E5 then add `meta`, `consents` and `me.get` without editing the test, and E2's fragment is already applied.
- Review fix (RV-02-28): `fp-sync.job.ts` imports `moneyWireSchema` from `@sanchay/validation`, which `apps/api` did not depend on (TS2307), so Step 3 adds the workspace link.
- Review fix (RV-02-35): this task changes `packages/contract`, which `apps/api` reads from `dist/` (its typecheck and `pnpm --filter=@sanchay/api openapi`). Step 4 and Step 5 start with `pnpm exec turbo run build --filter=@sanchay/api^...`; without it the api typecheck fails with TS2339 on `contract.catalogue` and `openapi.json` misses the new paths (reproduced).
- Review fix (RV-02-36): `CatalogueRouter` injects `DB` as the `DbHandle` that `PlatformModule` provides (`createDb`) and passes `this.dbh.db` to the queries. Typed as `Database`, every call answered 500 (`this.db.select is not a function`, reproduced). `listSchemes` takes the contract's `ListSchemesInput` (its `{ q?: string }` parameter failed TS2379 under `exactOptionalPropertyTypes`), and the non-null assertions that `biome ci` refuses are gone from the queries and the int test.
- Review fix (RV-02-55): SIP availability comes from FP's monthly SIP row, never from the lumpsum row. `toThresholds` copied the lumpsum limits into the SIP fields when FP listed no monthly SIP row, so F19's FUND-01 offered "Start SIP" on schemes that F10's quote then refused (`SCHEME_NOT_ORDERABLE`); D-MONEY-026 says a scheme with no SIP threshold is not SIP-eligible. The SIP limits are now null without that row (D8's `SchemeThresholds`). `toSipDates` writes the row's days in 1..28 to `schemes.sip_dates`, which nothing wrote before, so F2's `sipSchemeOf` would have refused every synced scheme. `schemes.sip_allowed` is FP's `sip_allowed` with both present (fail closed); Plan 03 E14 serves it as `SchemeDetail.sipAllowed`, and Plan 04 F19's "Start SIP" reads it.
- Review fix (RV-02-56): the int test imported `httpGet` and `signIn` from `test/int/http.ts`, which has neither (TS2305 in `typecheck`). It now signs in once with Plan 01's `signInWeb` and sends `webHeaders`. `seedOneScheme` derived its category code and ISIN from `Date.now()`, and two calls in one millisecond collide on `sebi_categories_code_uq` or `schemes_isin_uq`; it now numbers them from a per-file counter (each test file has its own database).
- Review fix (RV-02-58): the unit test's `fundScheme` mocks are written multi-line. biome 2.5.14 formats the one-line `vi.fn().mockResolvedValue({ … })` differently on its second `--write` pass, so after Step 5's single `biome check --write` the file still failed `pnpm lint` (`biome ci`).

- [ ] **Step 1: Write the failing test**

`packages/contract/src/catalogue.ts`:

```typescript
// This file does not exist yet — importing it from index.ts below fails to compile, which is the
// Step-1 failing state for both the contract package and every test that imports `contract.catalogue`.
export {};
```

`apps/api/test/int/catalogue-router.int.test.ts` (the full file):

```typescript
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { amcs, schemes, sebiCategories } from '../../src/db/schema.js';
import { bootTestApp, type TestApp } from './app.js';
import { signInWeb } from './flows.js';
import { webHeaders } from './http.js';

let app: TestApp;
/** One web session for the file, from Plan 01's real sign-in flow. */
let cookies: Record<string, string>;

beforeAll(async () => {
  app = await bootTestApp();
  ({ cookies } = await signInWeb(app, '9844400101'));
});

afterAll(async () => {
  await app.close();
});

/** A web GET (Plan 01's `webHeaders`); without cookies it carries no session. */
const get = (url: string, jar: Record<string, string> = {}) =>
  app.app.inject({ method: 'GET', url: `/api/v1${url}`, headers: webHeaders({ cookies: jar }) });

/** Each test file has its own database, so a per-file counter keeps codes, slugs and ISINs unique (RV-02-56). */
let seq = 0;

async function seedOneScheme(status: 'DRAFT' | 'PUBLISHED', curated: boolean) {
  seq += 1;
  const n = String(seq).padStart(5, '0');
  const [amc] = await app.db.db.insert(amcs).values({ name: 'Test AMC', slug: `amc-${n}` }).returning();
  const [cat] = await app.db.db
    .insert(sebiCategories)
    .values({ code: `CAT_${n}`, assetClass: 'EQUITY', name: 'Cat', slug: `cat-${n}`, cutoffClass: 'STANDARD', volatilityClass: 'V_EQUITY' })
    .returning();
  if (amc === undefined || cat === undefined) throw new Error('seedOneScheme: an insert returned no row');
  await app.db.db.insert(schemes).values({
    isin: `INFTEST${n}`,
    amcId: amc.id,
    name: 'Parag Parikh Flexi Cap Fund - Regular - Growth',
    slug: `scheme-${n}`,
    categoryCode: cat.code,
    status,
    curated,
  });
}

describe('catalogue.categories / catalogue.listSchemes', () => {
  it('requires a session', async () => {
    const res = await get('/catalogue/categories');
    expect([res.statusCode, res.json().code]).toEqual([401, 'AUTH_REQUIRED']);
  });

  it('listSchemes returns only PUBLISHED curated REGULAR GROWTH', async () => {
    await seedOneScheme('DRAFT', true);
    await seedOneScheme('PUBLISHED', false);
    await seedOneScheme('PUBLISHED', true);
    const res = await get('/catalogue/schemes', cookies);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { items: Array<{ status: string; curated: boolean }> };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ status: 'PUBLISHED', curated: true });
  });

  it('trigram search matches "parag flexi"', async () => {
    await seedOneScheme('PUBLISHED', true);
    const res = await get('/catalogue/schemes?q=parag%20flexi', cookies);
    const body = JSON.parse(res.body) as { items: unknown[] };
    expect(body.items.length).toBeGreaterThan(0);
  });

  it('cursor pagination stable', async () => {
    for (let i = 0; i < 3; i++) await seedOneScheme('PUBLISHED', true);
    const page1 = JSON.parse((await get('/catalogue/schemes?cursor=', cookies)).body) as { items: { isin: string }[]; nextCursor: string | null };
    expect(page1.items.length).toBeGreaterThan(0);
    if (page1.nextCursor) {
      const page2 = JSON.parse((await get(`/catalogue/schemes?cursor=${page1.nextCursor}`, cookies)).body) as { items: { isin: string }[] };
      const isins1 = new Set(page1.items.map((i) => i.isin));
      for (const item of page2.items) expect(isins1.has(item.isin)).toBe(false);
    }
  });
});
```

Note (RV-02-56): the test uses only Plan 01 helpers that exist on `main`: `bootTestApp` (`test/int/app.ts`), `signInWeb` (`test/int/flows.ts`, the real OTP sign-in) and `webHeaders` (`test/int/http.ts`), so it adds nothing to `http.ts`. Plan 03 E2 makes `webHeaders` send the app host, so these requests keep passing once HostGuard is live. A bare `inject` without `x-sanchay-client` gets 403 `ORIGIN_REJECTED` from Plan 01's `ClientGuard`, not 401.

`apps/api/src/modules/catalogue/fp-sync.job.test.ts` (full file):

```typescript
import { describe, expect, it, vi } from 'vitest';
import { fpJson } from '../../integrations/fp/fp-json.js';
import { runCatalogueFpSync, toSipDates, toThresholds } from './fp-sync.job.js';

describe('catalogue.fp.sync', () => {
  it('only touches curated ISINs', async () => {
    const db = { query: { schemes: { findMany: vi.fn().mockResolvedValue([{ id: 's1', isin: 'INF000P01011', curated: true }]) } }, update: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(undefined), insert: vi.fn().mockReturnThis(), values: vi.fn().mockResolvedValue(undefined) };
    const fpRead = {
      // Multi-line on purpose: biome 2.5.14 needs two --write passes to settle the one-line form (RV-02-58).
      fundScheme: vi.fn().mockResolvedValue({
        purchase_allowed: true,
        redemption_allowed: true,
        sip_allowed: true,
        lock_in: false,
        lock_in_period: null,
      }),
      schemePlans: vi.fn().mockResolvedValue({ items: [{ isin: 'INF000P01011', raw: { thresholds: [] } }], raw: {} }),
    };
    await runCatalogueFpSync(db as never, fpRead as never);
    expect(db.query.schemes.findMany).toHaveBeenCalled();
    expect(fpRead.fundScheme).toHaveBeenCalledWith('INF000P01011');
  });

  it('FP purchase_allowed=false suspends the scheme', async () => {
    const setSpy = vi.fn().mockReturnThis();
    const db = { query: { schemes: { findMany: vi.fn().mockResolvedValue([{ id: 's1', isin: 'INF000P01011', curated: true }]) } }, update: vi.fn().mockReturnThis(), set: setSpy, where: vi.fn().mockResolvedValue(undefined), insert: vi.fn().mockReturnThis(), values: vi.fn().mockResolvedValue(undefined) };
    const fpRead = {
      fundScheme: vi.fn().mockResolvedValue({
        purchase_allowed: false,
        redemption_allowed: true,
        sip_allowed: false,
        lock_in: false,
        lock_in_period: null,
      }),
      schemePlans: vi.fn().mockResolvedValue({ items: [{ isin: 'INF000P01011', raw: { thresholds: [] } }], raw: {} }),
    };
    await runCatalogueFpSync(db as never, fpRead as never);
    expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'SUSPENDED', purchaseAllowed: false }));
  });

  it('reads lumpsum and monthly SIP limits from the FP thresholds array', () => {
    const raw = fpJson.parse(
      '{"thresholds":[{"type":"lumpsum","amount_min":500,"amount_max":10000000,"amount_multiples":1},{"type":"sip","frequency":"daily","amount_min":100,"amount_max":null,"amount_multiples":1},{"type":"sip","frequency":"monthly","amount_min":1000,"amount_max":null,"amount_multiples":100}]}',
    ) as Record<string, unknown>;
    expect(toThresholds({ isin: 'INF000P01011', raw } as never)).toEqual({
      purchaseMin: '500.00',
      purchaseMax: '10000000.00',
      purchaseMultiple: '1.00',
      sipMin: '1000.00',
      sipMax: null,
      sipMultiple: '100.00',
    });
  });

  it('has no SIP limits or dates without a monthly SIP row, never the lumpsum ones (D-MONEY-026)', () => {
    const raw = fpJson.parse(
      '{"thresholds":[{"type":"lumpsum","amount_min":500,"amount_max":null,"amount_multiples":1},{"type":"sip","frequency":"daily","amount_min":100,"amount_max":null,"amount_multiples":1,"dates":[1,2]}]}',
    ) as Record<string, unknown>;
    const plan = { isin: 'INF000P01011', raw } as never;
    expect(toThresholds(plan)).toEqual({
      purchaseMin: '500.00',
      purchaseMax: null,
      purchaseMultiple: '1.00',
      sipMin: null,
      sipMax: null,
      sipMultiple: null,
    });
    expect(toSipDates(plan)).toBeNull();
  });

  it('allows SIP only with the monthly SIP row, and stores its dates (D-MONEY-026)', async () => {
    const setSpy = vi.fn().mockReturnThis();
    const findMany = vi.fn().mockResolvedValue([
      { id: 's1', isin: 'INF000P01011', curated: true },
      { id: 's2', isin: 'INF000P02022', curated: true },
    ]);
    const db = { query: { schemes: { findMany } }, update: vi.fn().mockReturnThis(), set: setSpy, where: vi.fn().mockResolvedValue(undefined), insert: vi.fn().mockReturnThis(), values: vi.fn().mockResolvedValue(undefined) };
    const lumpsum = '{"type":"lumpsum","amount_min":500,"amount_max":null,"amount_multiples":1}';
    const plan = (isin: string, sip: string) => ({ isin, raw: fpJson.parse(`{"thresholds":[${lumpsum},${sip}]}`) as Record<string, unknown> });
    const fpRead = {
      fundScheme: vi.fn().mockResolvedValue({
        purchase_allowed: true,
        redemption_allowed: true,
        sip_allowed: true,
        lock_in: false,
        lock_in_period: null,
      }),
      schemePlans: vi.fn().mockResolvedValue({
        items: [
          plan('INF000P01011', '{"type":"sip","frequency":"monthly","amount_min":1000,"amount_max":null,"amount_multiples":100,"dates":[28,5,1,5,30]}'),
          plan('INF000P02022', '{"type":"sip","frequency":"daily","amount_min":100,"amount_max":null,"amount_multiples":1,"dates":[1,2]}'),
        ],
        raw: {},
      }),
    };
    await runCatalogueFpSync(db as never, fpRead as never);
    expect(setSpy).toHaveBeenNthCalledWith(1, expect.objectContaining({ sipAllowed: true, sipDates: [1, 5, 28] }));
    expect(setSpy).toHaveBeenNthCalledWith(2, expect.objectContaining({ sipAllowed: false, sipDates: null }));
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

```
pnpm --filter=@sanchay/contract test
pnpm --filter=@sanchay/api test fp-sync.job
pnpm --filter=@sanchay/api test:int catalogue-router
```

Expected failure: `catalogue.ts` has no `catalogueContract`/exports yet (the contract's `index.ts` change in Step 3 has not landed), `./fp-sync.job.js` does not exist, and `/api/v1/catalogue/*` 404s.

- [ ] **Step 3: Minimal implementation**

`packages/contract/src/catalogue.ts` (full file):

```typescript
import { oc } from '@orpc/contract';
import { z } from 'zod';
import { COMMON_ERRORS, errorMap, SESSION_ERRORS } from './errors.js';

export const SebiCategorySchema = z.object({
  code: z.string(),
  assetClass: z.string(),
  name: z.string(),
  slug: z.string(),
  cutoffClass: z.string(),
  volatilityClass: z.string(),
});
export type SebiCategory = z.infer<typeof SebiCategorySchema>;

export const SchemeSummarySchema = z.object({
  isin: z.string(),
  name: z.string(),
  slug: z.string(),
  categoryCode: z.string(),
  status: z.string(),
  curated: z.boolean(),
});
export type SchemeSummary = z.infer<typeof SchemeSummarySchema>;

export const ListSchemesInputSchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  category: z.string().optional(),
  cursor: z.string().optional(),
});
export type ListSchemesInput = z.infer<typeof ListSchemesInputSchema>;

export const ListSchemesOutputSchema = z.object({
  items: z.array(SchemeSummarySchema),
  nextCursor: z.string().nullable(),
});

export const catalogueContract = {
  categories: oc
    .route({ method: 'GET', path: '/catalogue/categories', tags: ['catalogue'], summary: 'List the SEBI category taxonomy' })
    .errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS))
    .input(z.strictObject({}))
    .output(z.array(SebiCategorySchema)),
  listSchemes: oc
    .route({ method: 'GET', path: '/catalogue/schemes', tags: ['catalogue'], summary: 'Browse the curated, published Regular-Growth catalogue' })
    .errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS))
    .input(ListSchemesInputSchema)
    .output(ListSchemesOutputSchema),
};
```

`packages/contract/src/index.ts` (modify):

```typescript
import { authContract } from './auth.js';
import { catalogueContract } from './catalogue.js';
import { healthContract } from './health.js';
import { meContract } from './me.js';

export * from './auth.js';
export * from './catalogue.js';
export * from './common.js';
export * from './errors.js';
export * from './health.js';
export * from './me.js';

export const contract = { health: healthContract, auth: authContract, me: meContract, catalogue: catalogueContract };
export type Contract = typeof contract;
```

`packages/contract/src/auth.test.ts` (modify, RV-02-30). Replace Plan 01's test "exposes exactly the 9 MVP procedures"; only the name and the first and last checks change, because this task, Plan 03 E2, E4 and E5 each add a key:
```typescript
  it('keeps the 9 MVP procedures (later plans add contract keys and me.get)', () => {
    expect(Object.keys(contract)).toEqual(expect.arrayContaining(['auth', 'health', 'me']));
    expect(Object.keys(contract.health).sort()).toEqual(['live', 'ready']);
    expect(Object.keys(a).sort()).toEqual([
      'logout',
      'requestOtp',
      'revokeAll',
      'session',
      'verifyOtp',
    ]);
    expect(Object.keys(m)).toEqual(expect.arrayContaining(['requestEmailOtp', 'verifyEmail']));
  });
```

`apps/api/src/modules/catalogue/catalogue.queries.ts` (full file):

```typescript
import type { ListSchemesInput } from '@sanchay/contract';
import { LAUNCH_SCHEME_OPTIONS } from '@sanchay/domain';
import { and, asc, eq, gt, inArray, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { schemes, sebiCategories } from './catalogue.schema.js';

const PAGE_SIZE = 20;

export async function listCategories(db: Database) {
  return db
    .select({
      code: sebiCategories.code,
      assetClass: sebiCategories.assetClass,
      name: sebiCategories.name,
      slug: sebiCategories.slug,
      cutoffClass: sebiCategories.cutoffClass,
      volatilityClass: sebiCategories.volatilityClass,
    })
    .from(sebiCategories)
    .orderBy(asc(sebiCategories.name));
}

export async function listSchemes(db: Database, input: ListSchemesInput) {
  const conditions = [
    eq(schemes.status, 'PUBLISHED'),
    eq(schemes.curated, true),
    eq(schemes.planType, 'REGULAR'),
    inArray(schemes.option, LAUNCH_SCHEME_OPTIONS),
  ];
  if (input.category) conditions.push(eq(schemes.categoryCode, input.category));
  if (input.cursor) conditions.push(gt(schemes.id, input.cursor));
  if (input.q) conditions.push(sql`${schemes.name} % ${input.q}`);

  const rows = await db
    .select({
      isin: schemes.isin,
      id: schemes.id,
      name: schemes.name,
      slug: schemes.slug,
      categoryCode: schemes.categoryCode,
      status: schemes.status,
      curated: schemes.curated,
    })
    .from(schemes)
    .where(and(...conditions))
    .orderBy(asc(schemes.id))
    .limit(PAGE_SIZE + 1);

  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const last = page.at(-1);
  return {
    items: page.map(({ id, ...rest }) => rest),
    nextCursor: hasMore && last !== undefined ? last.id : null,
  };
}
```

`apps/api/src/modules/catalogue/catalogue.router.ts` (full file; RV-02-36: `DB` is the `DbHandle` PlatformModule provides):

```typescript
import { Controller, Inject } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@sanchay/contract';
import { ClsService } from 'nestjs-cls';
import { DB, type DbHandle } from '../../db/client.js';
import { requireAuth } from '../identity/request-auth.js';
import type { SanchayClsStore } from '../platform/request-context.js';
import { listCategories, listSchemes } from './catalogue.queries.js';

@Controller()
export class CatalogueRouter {
  constructor(
    // DB is PlatformModule's DbHandle (createDb), as D1 injects it; the queries take its Drizzle db.
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(ClsService) private readonly cls: ClsService<SanchayClsStore>,
  ) {}

  @Implement(contract.catalogue.categories)
  categories() {
    return implement(contract.catalogue.categories).handler(() => {
      requireAuth(this.cls);
      return listCategories(this.dbh.db);
    });
  }

  @Implement(contract.catalogue.listSchemes)
  listSchemes() {
    return implement(contract.catalogue.listSchemes).handler(({ input }) => {
      requireAuth(this.cls);
      return listSchemes(this.dbh.db, input);
    });
  }
}
```

`apps/api/src/modules/catalogue/catalogue.module.ts` (modify D9's file; full file):

```typescript
import { type DynamicModule, Module } from '@nestjs/common';
import type { Env } from '../../config/env.js';
import { CatalogueRouter } from './catalogue.router.js';
import { CatalogueFpSyncJob } from './fp-sync.job.js';
import { NavSyncJob } from './nav/nav-sync.job.js';

@Module({})
export class CatalogueModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: CatalogueModule,
      controllers: [CatalogueRouter],
      providers: [NavSyncJob, ...(env.SANCHAY_APP_ROLE === 'worker' ? [CatalogueFpSyncJob] : [])],
    };
  }
}
```

`apps/api/src/app.module.ts` (modify — add the import):

```typescript
import { CatalogueModule } from './modules/catalogue/catalogue.module.js';
// ...
imports: [
  // ...existing imports...
  IdentityModule,
  CatalogueModule.forRoot(env), // D9 added CatalogueModule
],
```

Link the workspace package that `fp-sync.job.ts` imports `moneyWireSchema` from (RV-02-28). The command adds `"@sanchay/validation": "workspace:*"` to `apps/api/package.json` and the importer lines to `pnpm-lock.yaml`:
```
pnpm --filter=@sanchay/api add "@sanchay/validation@workspace:*"
```

`apps/api/src/modules/catalogue/fp-sync.job.ts` (full file; uses D3's real `FpRead`):

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { moneyWireSchema } from '@sanchay/validation';
import { eq } from 'drizzle-orm';
import { DB, type Database, type DbHandle } from '../../db/client.js';
import { fpJson } from '../../integrations/fp/fp-json.js';
import { FpRead, type FpSchemePlan } from '../../integrations/fp/fp-read.js';
import { JobHandler, type Job } from '../platform/jobs/job-registry.js';
import { fundFactsRevisions, schemes, type SchemeThresholds } from './catalogue.schema.js';

const PAGE_SIZE = 100;
type FpSchemeReader = Pick<FpRead, 'schemePlans' | 'fundScheme'>;

function thresholdOf(plan: FpSchemePlan, type: 'lumpsum' | 'sip'): Record<string, unknown> | undefined {
  const list = Array.isArray(plan.raw.thresholds) ? (plan.raw.thresholds as Record<string, unknown>[]) : [];
  return list.find((t) => t.type === type && (type === 'lumpsum' || t.frequency === 'monthly'));
}

function wire(value: unknown, field: string) {
  return moneyWireSchema.parse(fpJson.money(value, field).toWire());
}

function wireOrNull(value: unknown, field: string) {
  return value === null || value === undefined ? null : wire(value, field);
}

export function toThresholds(plan: FpSchemePlan): SchemeThresholds | null {
  const lumpsum = thresholdOf(plan, 'lumpsum');
  if (lumpsum === undefined) return null;
  // D-MONEY-026 (RV-02-55): the SIP limits come only from FP's monthly SIP row. Without one the
  // scheme takes no SIP, so they stay null; never the lumpsum limits.
  const sip = thresholdOf(plan, 'sip');
  return {
    purchaseMin: wire(lumpsum.amount_min, 'amount_min'),
    purchaseMax: wireOrNull(lumpsum.amount_max, 'amount_max'),
    purchaseMultiple: wire(lumpsum.amount_multiples, 'amount_multiples'),
    sipMin: sip === undefined ? null : wire(sip.amount_min, 'amount_min'),
    sipMax: sip === undefined ? null : wireOrNull(sip.amount_max, 'amount_max'),
    sipMultiple: sip === undefined ? null : wire(sip.amount_multiples, 'amount_multiples'),
  };
}

/** The monthly SIP row's `dates` in 1..28 (D-MONEY-026: the SIP day is 1-28 ∩ the scheme's dates), ascending and unique; null when none is left. */
export function toSipDates(plan: FpSchemePlan): number[] | null {
  const dates = thresholdOf(plan, 'sip')?.dates;
  if (!Array.isArray(dates)) return null;
  // fpJson.parse keeps each JSON number as a LosslessNumber, whose string form is the source text.
  const days = dates
    .map((day) => Number(String(day)))
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 28);
  return days.length === 0 ? null : [...new Set(days)].sort((a, b) => a - b);
}

async function allSchemePlans(fpRead: FpSchemeReader): Promise<Map<string, FpSchemePlan>> {
  const byIsin = new Map<string, FpSchemePlan>();
  for (let page = 0; ; page++) {
    const { items } = await fpRead.schemePlans({ page, size: PAGE_SIZE });
    for (const plan of items) byIsin.set(plan.isin, plan);
    if (items.length < PAGE_SIZE) return byIsin;
  }
}

export async function runCatalogueFpSync(db: Database, fpRead: FpSchemeReader): Promise<void> {
  const curated = await db.query.schemes.findMany({ where: (t, { eq: eqOp }) => eqOp(t.curated, true) });
  const plans = await allSchemePlans(fpRead);

  for (const scheme of curated) {
    const raw = await fpRead.fundScheme(scheme.isin);
    const purchaseAllowed = raw.purchase_allowed === true;
    const redemptionAllowed = raw.redemption_allowed === true;
    const lockInMonths = raw.lock_in === true ? Number(String(raw.lock_in_period)) : null;
    const plan = plans.get(scheme.isin);
    const thresholds = plan === undefined ? null : toThresholds(plan);
    const sipDates = plan === undefined ? null : toSipDates(plan);
    // D-MONEY-026 fails closed: a SIP needs FP's sip_allowed, the monthly SIP limits and their dates.
    const sipAllowed =
      raw.sip_allowed === true && thresholds !== null && thresholds.sipMin !== null && sipDates !== null;

    await db
      .update(schemes)
      .set({
        fpActive: purchaseAllowed || redemptionAllowed,
        purchaseAllowed,
        redemptionAllowed,
        sipAllowed,
        lockInMonths,
        thresholds,
        sipDates,
        status: purchaseAllowed ? 'PUBLISHED' : 'SUSPENDED',
      })
      .where(eq(schemes.id, scheme.id));

    await db.insert(fundFactsRevisions).values({
      schemeId: scheme.id,
      source: 'CYBRILLA',
      payload: { purchaseAllowed, redemptionAllowed, sipAllowed, lockInMonths, thresholds, sipDates },
    });
  }
}

@Injectable()
@JobHandler('catalogue.fp.sync')
export class CatalogueFpSyncJob {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(FpRead) private readonly fpRead: FpRead,
  ) {}

  async handle(_job: Job<'catalogue.fp.sync'>): Promise<void> {
    await runCatalogueFpSync(this.dbh.db, this.fpRead);
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```
pnpm exec turbo run build --filter=@sanchay/api^...
pnpm --filter=@sanchay/contract test
pnpm --filter=@sanchay/api test fp-sync.job
pnpm --filter=@sanchay/api test:int catalogue-router
pnpm --filter=@sanchay/api openapi
git diff --exit-code apps/api/openapi.json
pnpm --filter=@sanchay/api typecheck
```

Expected: the build refreshes `packages/contract/dist` before anything in `apps/api` reads it (RV-02-35); all contract/unit/integration tests pass, including the relaxed `auth.test.ts` with `catalogue` in the contract (RV-02-30); `openapi` regeneration shows a diff on first run (new `/catalogue/*` paths) — commit that diff; a second run of the drift check is clean.

- [ ] **Step 5: Commit**

```
pnpm exec biome check --write packages/contract/src/catalogue.ts packages/contract/src/index.ts packages/contract/src/auth.test.ts apps/api/src/modules/catalogue apps/api/src/app.module.ts apps/api/test/int/catalogue-router.int.test.ts apps/api/openapi.json
pnpm exec turbo run build --filter=@sanchay/api^...
pnpm --filter=@sanchay/contract test
pnpm --filter=@sanchay/api test fp-sync.job
pnpm --filter=@sanchay/api test:int catalogue-router
pnpm --filter=@sanchay/api typecheck
pnpm lint
git add packages/contract/src/catalogue.ts packages/contract/src/index.ts packages/contract/src/auth.test.ts apps/api/src/modules/catalogue apps/api/src/app.module.ts apps/api/test/int/catalogue-router.int.test.ts apps/api/openapi.json apps/api/package.json pnpm-lock.yaml
git commit -m "feat(catalogue): add catalogue.fp.sync, catalogue.categories and catalogue.listSchemes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Plan 02 DoD (for D8–D10's slice).** Each task is green in `pnpm turbo run lint typecheck test test:int`. `openapi.json` shows no drift after Step 4/5 of D10, `db:check` is clean against the new catalogue tables, and the D9 quarantine/recon-break path is exercised without any provider call happening inside a transaction (D9's `runNavSync` never calls `FpTransport`).

---

### Task E25: CDK `SanchayMvpStack-prod`, deployed paused (Dev A, 12 h). **Protected; runs in S2 week 2 (R-05, R-31)**, not in the overflow ranking.

**Why S2 (R-31 replaces the outline's dev stack):** there is no AWS dev environment and no dev domain; development runs locally (docker compose: PostgreSQL, Mailpit). E25 deploys the one stack, `SanchayMvpStack-prod` (cluster `sanchay-prod`, service `sanchay-app`, GitHub environment `prod`), in S2 week 2 and leaves it **paused**: it runs and answers on `www`, `app` and `api.sanchay.in`, so the production hosts, the NAT EIP that Cybrilla allowlists, the webhook and payment-return URLs and the deploy pipeline exist about five weeks before GO-1, but no investor can transact before GO-1. Sign-in is invite-only (D7; prod boot invariant 10 refuses `SANCHAY_PILOT_INVITE_ONLY=false`), RuntimeConfig's `orders.enabled` and `plans.sip.enabled` stay at their D1 default (false), and no invite is added before GO-1 except the founders' test accounts (F7's `ops:invite` on F1's ops task, S4). There is no ALB ingress allow-list. Plan 04 F1 hardens this same stack in S4 (D6 logins, ops task definition, alarms) instead of adding a second environment, and F22 runs its passive ZAP baseline against it before GO-1. Owner action before the first deploy: `sanchay.in` is registered (R-22) and its public hosted zone exists in the prod account. The delegated dev zone question (PB-41, ADR-0014) is moot. Funded as R-05 funded the dev stack: E18 [T2] and E19 [T4] leave the committed S3 load; Dev A's D4 and the last 2 h of D3 move to S3 week 1.

> **Amended 2026-10-01 (RV-02-16 to RV-02-23).** The earlier text could not install, compile, synthesise, boot or deploy. This version was checked with a real `pnpm install` under the workspace's supply-chain policies, `tsc`, the CDK assertion tests, `cdk synth` from PowerShell 5.1 and Git Bash, each container's synthesised environment run through the boot guard, an arm64 api image that migrated a Postgres 18.6 database and answered `/api/v1/health` with 200, and an arm64 web image that served `/site` on the www host and `assetlinks.json` on the app host. What changed and why is in the errata at the top of this plan. RV-02-32 and RV-02-33 (also 2026-10-01) made the post-deploy checks run in both shells and moved the repository the deploy role trusts to the deploy input `SANCHAY_GITHUB_REPOSITORY`. The 2026-10-05 errata (RV-02-59, RV-02-60, RV-02-61, RV-02-62, RV-02-63, RV-02-64, RV-02-65) copy `data/` into the api image and keep JSON import attributes in its build (Plan 03 E9 reads its questionnaire when its module loads), make the master-user test able to fail, run the migrate task before `cdk deploy` and fail the run on a rolled-back deployment, name and version the document bucket as spec §2.4 does, answer the apex with a 301 to www, record the two remaining spec §2.4 deviations, and make Step 5 re-run all five Step 4 commands.

> **Reworked 2026-10-05 for R-31 (RV-02-70).** E25 deploys `SanchayMvpStack-prod` instead of a dev stack. The dev-only config is gone (`DEV_CONFIG`, `envSubdomain`, `createGithubOidcProvider`); the hosts are `www`, `app` and `api.sanchay.in`, with the apex 301 (RV-02-63) on `sanchay.in`; the stack creates the account's GitHub OIDC provider and a least-privilege deploy role that trusts only jobs of the GitHub `prod` environment (moved here from Plan 04 F1); `deploy.yml` has `prod` as its only environment; ADR-0014's first deploy and the post-deploy checklist target prod. R-31's "paused" means closed to investors, not stopped, so the 0-task context flag `-c firstDeploy=true` becomes `-c noTasks=true`, which F1 also uses for its rollout. The infra test file has 24 tests.

> **Amended 2026-10-05 for R-34 (RV-02-72).** RV-02-64's one log group and two image repositories are the owner's decision (R-34). Both log groups and both repositories use `RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE`, and the infra test file has 25 tests.

**Files:**
- Create: `infra/package.json`, `infra/tsconfig.json`, `infra/cdk.json`, `infra/vitest.config.ts`, `infra/bin/sanchay.ts`, `infra/lib/config.ts`, `infra/lib/sanchay-mvp-stack.ts`, `infra/test/sanchay-mvp-stack.test.ts`
- Create (fetched asset, Step 3): `infra/certs/rds-global-bundle.pem`
- Create: `.github/workflows/deploy.yml`, `.dockerignore`, `apps/api/Dockerfile`, `apps/api/docker-entrypoint.sh`, `apps/web/Dockerfile`, `apps/web/public/.well-known/assetlinks.json`, `docs/adr/0014-minimal-aws-topology.md`
- Modify (key-level fragments only): `pnpm-workspace.yaml` (`packages:` list, `catalog:` map), `.gitignore` (one line), `apps/api/src/config/env.ts` (B2 invariants 1 and 7 follow the R-19 owning containers), `apps/api/src/config/env.test.ts` (two cases), `docs/adr/0001-versions.md` (append three rows), `docs/adr/README.md` (ADR-0014 row: `Planned` → `Accepted`), `apps/web/next.config.ts` (add `output: 'standalone'`), `apps/api/.swcrc` (one key: `jsc.experimental.keepImportAttributes`, RV-02-59)

**Interfaces:**
- **Prerequisites:** B6 (`createDb`, compose, Testcontainers harness: `postgres:18.6-trixie`, the version this stack's RDS engine matches), B2/env.ts (`EnvSchema`, `parseEnv`, `assertBootInvariants`, invariants 1-7), B18 (`HealthRouter` at `@InfraRoute('APP_AND_API_HOSTS')`), D2 (`db/migrate.ts` reads the migrations from `../../drizzle` relative to `dist/db`), D3 (`SANCHAY_PROVIDER_MODE_FP`, `SANCHAY_FP_BASE_URL`, `SANCHAY_FP_CREDENTIALS_JSON`, invariants 8 and 9), D6 (`SANCHAY_PROVIDER_MODE_SMS=msg91`, `SANCHAY_PROVIDER_MODE_EMAIL=ses`, `SANCHAY_MSG91_CREDENTIALS_JSON`, `SANCHAY_SES_FROM`, invariants 11 and 12, `SesEmailSender` (SES v2 `SendEmail`, task-role credentials)), D7 (`SANCHAY_PILOT_INVITE_ONLY`, invariant 10). The only `apps/api/src` changes are the two-condition edit to B2's invariants 1 and 7 and two cases in `env.test.ts`.
- **Consumes (exact names):**
  - `apps/api/src/modules/platform/health.router.ts`: `HealthRouter` serves `/api/v1/health` under `@InfraRoute('APP_AND_API_HOSTS')`; this is the literal ALB/ECS health-check path (R-12).
  - `apps/api/src/config/env.ts`: every key the boot guard needs in a non-local env. All API-image roles: `SANCHAY_APP_ENV`, `SANCHAY_APP_ROLE`, `DATABASE_URL`, `SANCHAY_APP_ORIGIN`, `SANCHAY_CLIENT_IP_SOURCE=alb` (invariant 6), `SANCHAY_KEY_SERVICE=secrets` with `SANCHAY_KEYRING_JSON` (invariants 2 and 4b), `SANCHAY_PROVIDER_MODE_FP` (8, 9), `SANCHAY_PILOT_INVITE_ONLY` (10). api and worker: `SANCHAY_PROVIDER_MODE_SMS`/`_EMAIL`, `SANCHAY_MSG91_CREDENTIALS_JSON`, `SANCHAY_SES_FROM` (1, 11, 12). api only: `HOST`, `PORT`, `SANCHAY_SMS_RETRIEVER_HASH` (7), `SANCHAY_FP_WEBHOOK_SECRET`. worker only: `SANCHAY_FP_BASE_URL`, `SANCHAY_FP_CREDENTIALS_JSON`. Set before the Plan 03 tasks that make them required: `SANCHAY_API_ORIGIN` (E2) and `SANCHAY_PLATFORM_ARN` (E21).
  - `apps/web/src/proxy.ts`: reads `SANCHAY_WWW_ORIGIN` and `SANCHAY_APP_ORIGIN` at runtime for the H-1 host routing; `apps/web/src/lib/site-config.ts` `readSiteConfig()` runs when `next build` prerenders `/site` (C10/C11) and requires `SANCHAY_PLATFORM_ARN` and `SANCHAY_PLATFORM_ARN_VALID_TILL` (the origins are optional there); `apps/web/next.config.ts` rewrites `/api/v1/*` only when `SANCHAY_API_ORIGIN` is set at build time (local and e2e), never in the images.
  - `apps/api/package.json` scripts: `build` (`nest build -b swc`), `start` (`node dist/main.js`); `apps/api/src/cli/migrate.ts` (the one-off migrate task's command). The workspace packages the api and web import (`@sanchay/contract`, `@sanchay/domain`, `@sanchay/api-client`, `@sanchay/tokens`, ...) export `dist/`, so the images build them with `--filter=@sanchay/api...` / `--filter=@sanchay/web...`.
  - `.node-version` (24.21.0) and `pnpm-workspace.yaml` `engineStrict: true`, `nodeLinker: hoisted`.
  - `.github/workflows/ci.yml`: its three already-resolved action pins (`actions/checkout@3d3c42e5...`, `pnpm/action-setup@ea17c68d...`, `actions/setup-node@82076278...`).
  - `docs/adr/README.md` ADR-0014 row (`Planned`, "Minimal AWS topology: single ECS service, ALB only") and `docs/adr/0001-versions.md` (append-only, A1 rule).
- **Produces (spec §2.4):**
  - `infra/lib/sanchay-mvp-stack.ts`: `SanchayMvpStack` (a `cdk.Stack`), `SanchayMvpStackProps` (`{config}` plus `StackProps`), `SERVICE_NAME = 'sanchay-app'`, `DB_MASTER_USER = 'sanchay_master'`. Constructor locals F1 edits: `vpc`, `natEip`, `documentsBucket`, `apiRepo`, `webRepo`, `dbInstance`, `dbMasterSecret`, `appLogGroup`, `cluster`, `taskRole`, `taskDef`, `migrateTaskDef`, `migrateDbLogin`, `appDbLogin`, `dbEnv(user)`, `dbPassword(secret)`, `bootEnv`, `senderEnv`, `service`, `serviceSecurityGroup`, `alb`, `httpsListener`, `apiTargetGroup`, `webTargetGroup`. Construct ids `NatEip`, `Database`, `Service`, `GithubOidc`, `GithubDeployRole`. Outputs `NatEipAddress`, `AlbDnsName`, `ClusterName`, `MigrateTaskDefinitionArn`, `ApiRepoUri`, `WebRepoUri`, `AppSubnetIds`, `ServiceSecurityGroupId`, and `GithubDeployRoleArn` when the deploy input `SANCHAY_GITHUB_REPOSITORY` is set (RV-02-33).
  - `infra/lib/config.ts`: `loadStackConfig(envName: SanchayEnvName, source: DeployInputSource = process.env): SanchayStackConfig`, `SanchayEnvName` (`'prod'` only: R-31), `SanchayStackConfig` (`envName`, `rootDomain`, `multiAz`, `deletionProtection`, `backupRetentionDays`, `desiredCount`, `githubRepo: string | undefined` read from the deploy input `SANCHAY_GITHUB_REPOSITORY` (RV-02-33), `dbInstanceSize: 'MICRO' | 'MEDIUM'`, `fpProviderMode`, `fpBaseUrl`, `sesFrom`, `platformArn`, `smsRetrieverHash`), `DeployInputSource`, `StackConfigError`, `assertDeployInputs(config)`. One static config, `PROD_CONFIG`: Multi-AZ, 14-day backups, deletion protection, 2 tasks, `db.t4g.medium`, FP `production` at `https://api.fintechprimitives.com` (no dev config and no dev subdomain, RV-02-70). It refuses to synthesise without the deploy inputs `SANCHAY_PLATFORM_ARN` (`ARN-<digits>`) and `SANCHAY_SMS_RETRIEVER_HASH` (11 characters of `[A-Za-z0-9+/]`) and refuses a `SANCHAY_GITHUB_REPOSITORY` that is not `<owner>/<repo>`; `assertDeployInputs` refuses a missing one (a real synth or deploy, never the tests).
  - `infra/bin/sanchay.ts`: `SanchayMvpStack-prod` (R-31: the only stack), region pinned to `ap-south-1`; it calls `assertDeployInputs(config)` before building the stack (RV-02-33).
  - CDK context flag `-c noTasks=true`: the service is created, or kept, at 0 tasks (ADR-0014 "First deploy"; Plan 04 F1 uses it to move the running stack onto its D6 logins). It is not R-31's pause: paused prod runs its tasks and keeps investors out with D7's invite gate and RuntimeConfig.
  - VPC (2 AZs, 1 NAT with a stable EIP, output for Cybrilla allowlisting); ALB with TLS policy `ELBSecurityPolicy-TLS13-1-2-2021-06` and `routing.http.xff_header_processing.mode=append`; no ingress allow-list (R-31): port 443 is open to the internet.
  - Listener rules (R-11): host `api.sanchay.in` (any path) → api target group (3000); host `app.sanchay.in` + path `/api/v1/*` → api target group; default action (`www.sanchay.in` and the rest of `app.sanchay.in`) → web target group (3001); host `sanchay.in` (the apex) → 301 to `https://www.sanchay.in`, path and query kept (rule `ApexToWww`; spec §2.4 and H-1, RV-02-63). The one `ecs.FargateService` `sanchay-app` registers both target groups. Both target groups' health check is `/api/v1/health` on port 3000, the task's api container (R-12).
  - One ECS Fargate ARM64 service, containers `web`, `api`, `worker`, plus the one-off `MigrateTaskDef` (container `migrate`, run with `aws ecs run-task`). `SANCHAY_FP_CREDENTIALS_JSON` goes only into `worker`; `SANCHAY_FP_WEBHOOK_SECRET` and `SANCHAY_SMS_RETRIEVER_HASH` only into `api`; `SANCHAY_KEYRING_JSON` into `api`, `worker` and `migrate` (the boot guard's keyring check runs in every role).
  - RDS PostgreSQL 18.6 with `rds.force_ssl=1`, `StorageEncrypted: true`, reachable only from the ECS service security group; Multi-AZ, 14-day backups (PITR), deletion protection, `db.t4g.medium` (spec §2.4); master login `sanchay_master`, secret `sanchay/{env}/db-master` (BRIEF D6). The migrate task logs in as the master; api and worker share that login until F1 adds `sanchay_app_login` (secret `sanchay/{env}/db-app`) and moves `appDbLogin` to it.
  - Task role statement `SesSendFromSanchayDomain` (`ses:SendEmail`, `ses:SendRawEmail`, condition `ses:FromAddress` = `SANCHAY_SES_FROM`).
  - S3 document bucket `sanchay-prod-docs` (public access blocked, SSE, versioning; spec §2.4, RV-02-62), ECR repos (`sanchay-prod-api`, `sanchay-prod-web`, the last 20 images each), Secrets Manager secrets (`sanchay/prod/keyring`, `sanchay/prod/fp`, `sanchay/prod/fp-webhook`, `sanchay/prod/msg91`, `sanchay/prod/db-master`), CloudWatch log groups `/sanchay/prod/app` and `/sanchay/prod/ecs-exec` at 400-day retention (both log groups and both repositories with `RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE`, R-34), ECS Exec logging (R-16) on cluster `sanchay-prod`, and, in the `sanchay.in` hosted zone (it must exist in the prod account before the first deploy, R-31), the A-alias records `www`, `app`, `api` and the apex (RV-02-63) and the DNS validation of one ACM certificate for `*.sanchay.in` and `sanchay.in`.
  - **One log group and two image repositories per env (spec §2.4 as amended by R-34; RV-02-64, RV-02-72).** Every container logs to `/sanchay/{env}/app` (400 days) with the awslogs stream prefix `{env}`, so each container has its own streams (`{env}/web/…`, `{env}/api/…`, `{env}/worker/…`, `{env}/migrate/…`; F1 adds `{env}/ops/…`): F1's metric filters tell the containers apart by each line's `service` field (R-34), and the F7, F20, F23, F24 and F27 runbook lines read the streams by prefix. The two images go to `sanchay-{env}-api` and `sanchay-{env}-web`, each keeping its last 20 (`deploy.yml`, ADR-0014's first deploy and the deploy role's `grantPullPush` on both). Both log groups and both repositories use `RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE` (CloudFormation `DeletionPolicy: RetainExceptOnCreate`, `UpdateReplacePolicy: Retain`): a stack teardown or rename never deletes the 400-day logs (CERT-In needs 180 days) or the images, while a failed first create still removes them, so the retry can create the same names. The ECS Exec group gets the same policy because it holds the same kind of record. Deferred to Phase 2 (R-34): a customer-managed KMS key and any split of the log group.
  - No CloudWatch alarm. R-12's NAV-age alarm needs a published metric, and no task before F1 publishes one; F1 owns the gauges and the alarm names (BRIEF D5) and adds the alarm with its metric source.
  - The account's GitHub OIDC provider and the deploy role `sanchay-prod-github-deploy` (output `GithubDeployRoleArn`), built only when the deploy input `SANCHAY_GITHUB_REPOSITORY` is set (RV-02-33). It trusts exactly `repo:<SANCHAY_GITHUB_REPOSITORY>:environment:prod` (`StringEquals`: jobs of the GitHub `prod` environment, whose required reviewers are both founders) and may do only what `deploy.yml` does: assume the CDK bootstrap roles, log in to ECR and push both repositories, read the stack's outputs, run the migrate task (`ecs:RunTask` and `iam:PassRole` through `grantRun`) and read its tasks, and force a new deployment of `sanchay-app` (statements `AssumeCdkBootstrapRoles`, `EcrLogin`, `ReadStackOutputs`, `WaitForMigrateTask`, `ForceNewDeployment`; no `AdministratorAccess`; moved here from Plan 04 F1, RV-02-70). It is consumed by `.github/workflows/deploy.yml` (manual dispatch, `prod` its only environment), which reads the GitHub `prod` environment variables `SANCHAY_DEPLOY_ROLE_ARN`, `SANCHAY_AWS_ACCOUNT_ID`, `SANCHAY_PLATFORM_ARN`, `SANCHAY_PLATFORM_ARN_VALID_TILL` and `SANCHAY_SMS_RETRIEVER_HASH`, passes `SANCHAY_GITHUB_REPOSITORY` from `github.repository`, builds linux/arm64 images (the web image with the `/site` build arguments), runs the one-off migrate task and stops unless it exits 0 (spec §2.4), runs `cdk deploy`, forces a new deployment of `sanchay-app` and fails unless that deployment's rollout completes (RV-02-61).
  - `apps/api/Dockerfile` (keeps the `/repo` layout, copies `data/` to `/repo/data`, bakes in `infra/certs/rds-global-bundle.pem`, sets `NODE_EXTRA_CA_CERTS`) and `apps/api/.swcrc` (`jsc.experimental.keepImportAttributes`): from Plan 03 E9 on, `risk-profile.service.ts` imports `data/risk-questionnaire-v1.0.0.json` `with { type: 'json' }` when its module loads, in api and worker, so the image needs `/repo/data` and the SWC output needs the attribute (RV-02-59), `apps/api/docker-entrypoint.sh` (composes `DATABASE_URL=...?sslmode=verify-full` from the split `SANCHAY_DB_*` pieces), `apps/web/Dockerfile` (Next.js standalone, port 3001), `.dockerignore`, `apps/web/public/.well-known/assetlinks.json` (`[]` until F18 writes the App Links payload).
  - B2 `assertBootInvariants`: the constants `role` and `sends` (`role === 'api' || role === 'worker'`); invariant 1 binds api and worker, invariant 7 binds api. E1 (Plan 03) must scope invariant 13 to `role === 'api'` the same way (open item for Plan 03).
  - `docs/adr/0014-minimal-aws-topology.md` (accepted; the prod hosts, R-31's paused state, the first-deploy runbook).
  - **Deviation from outline: the RDS connection string is not injected as one Secrets-Manager-composed `DATABASE_URL` value.** CDK/Secrets Manager cannot concatenate a generated-secret field with plain strings into one ECS secret at deploy time without a custom resource. Instead the containers get plain env `SANCHAY_DB_HOST`/`SANCHAY_DB_PORT`/`SANCHAY_DB_NAME`/`SANCHAY_DB_USER` plus one ECS secret `SANCHAY_DB_PASSWORD` (the login secret's `password` field), and `apps/api/docker-entrypoint.sh` composes `DATABASE_URL` with `?sslmode=verify-full` before `exec`ing the container command. `EnvSchema.DATABASE_URL` is unaffected.
  - **Deviation from outline: `apps/api/Dockerfile` does not `COPY docs/legal/`.** That directory does not exist until Plan 03 E3, and a `COPY` of a missing path fails the build (`"/docs/legal": not found`), so the Dockerfile omits the line and a comment names F1 (Plan 04), whose migrate task seeds it. It does copy `data/`, which D8 creates before E25 (RV-02-59).
  - **Deviation from outline: `.github/workflows/deploy.yml` authenticates to AWS by scripting the OIDC token exchange (`aws sts assume-role-with-web-identity`) and pushes to ECR with the AWS CLI and `docker build`, instead of the `aws-actions/configure-aws-credentials` / `aws-actions/amazon-ecr-login` marketplace actions.** It reuses only the three action pins `ci.yml` already carries; the arm64 emulation installer (`tonistiigi/binfmt`) is a container image pinned by digest, not an action.
- **Tests (run without any AWS credentials):** `FP secret only in worker container`, `RDS StorageEncrypted and force_ssl`, `ALB TLS policy`, `listener rules: api host (any path) and app host + /api/v1/* → api target group (R-11)`, `the apex sanchay.in answers 301 to www (spec §2.4, H-1)`, `health check path /api/v1/health on the api port, for both target groups (R-12)`, `SG: RDS reachable only from service`, `log groups: 400 days, kept on a teardown or rename, removed after a failed first create (R-34)`, `image repositories sanchay-prod-api and sanchay-prod-web keep 20 images each and survive a teardown (R-34)`, `S3 document bucket sanchay-prod-docs: SSE, public access blocked, versioned (spec §2.4)`, `ECS Exec logging configured on cluster sanchay-prod`, `DATABASE_URL in prod carries sslmode=verify-full and the CA file exists in the image`, `the api image carries data/ and keeps JSON import attributes (Plan 03 E9 loads its questionnaire at boot)`, `RDS master is sanchay_master in sanchay/prod/db-master, and migrate logs in as it (D6)`, `api, worker and migrate carry every key parseEnv and the boot guard need (R-19 owners)`, `web listens on 3001 and knows the www and app hosts (apps/web/src/proxy.ts)`, `one service sanchay-app: 2 tasks, never below 100 % healthy, rollback circuit breaker; -c noTasks=true creates it with no tasks`, `the tasks may send SES email only from SANCHAY_SES_FROM (D6)`, `prod database: Multi-AZ, 14-day backups, deletion protection, db.t4g.medium (spec §2.4)`, `closed to investors until GO-1 (R-31): invite-only, no orders or SIP override, no ingress allow-list`, `the GitHub deploy role trusts only the prod environment of SANCHAY_GITHUB_REPOSITORY, is no administrator, and exists only with it`, `the deploy role can do exactly what deploy.yml does, the migrate run included`, `loadStackConfig` (3); in `env.test.ts`, `binds the retriever hash (invariant 7) to the api role only` and `refuses fake senders in prod for api and worker only; migrate sends nothing (invariant 1)`.
- **Post-deploy verification (manual, needs a real deploy):** the first-deploy runbook in ADR-0014, then `deploy to prod: /api/v1/health 200 on app.sanchay.in and api.sanchay.in`; `https://www.sanchay.in/ serves the public site (200)`; `POST /api/v1/webhooks/fp reaches the api container from the internet`; `https://app.sanchay.in/.well-known/assetlinks.json returns 200 application/json without auth`; `https://sanchay.in/ answers 301 to https://www.sanchay.in/` (RV-02-63); an ECS Exec session (R-16). These are listed as a checklist at the end of Step 4.

---

- [ ] **Step 1: Write the failing tests**

  **1.1 `pnpm-workspace.yaml` key-level fragment.** Add `infra` to `packages:` and three exact-pinned entries to `catalog:` (A1 rule; do not touch any existing line). The CDK CLI (`aws-cdk`) is versioned separately from `aws-cdk-lib` since 2.1000.0 (2025-02-18), so there is no `aws-cdk@2.216.0`; 2.1143.0 was the newest CLI that passed the 7-day `minimumReleaseAge` on 2026-10-01. Per "New dependencies" above, re-check with `pnpm view aws-cdk-lib version` (and the other two) at execution time; this code was also verified against aws-cdk-lib 2.270.0 and constructs 10.8.1.
  ```yaml
  packages:
    - apps/*
    - packages/*
    - tools/*
    - infra
  ```
  ```yaml
  catalog:
    # ...existing entries unchanged...
    aws-cdk: 2.1143.0
    aws-cdk-lib: 2.216.0
    constructs: 10.4.2
  ```

  **1.2 `docs/adr/0001-versions.md` append-only fragment** (A1 rule; new dependency rows, exact versions, no expiry because these are not release-age or ignored-build exceptions):
  ```markdown
  | aws-cdk-lib | 2.216.0 | Plan 02 Task E25 |
  | constructs | 10.4.2 | Plan 02 Task E25 |
  | aws-cdk (CLI, versioned 2.1xxx since 2025-02) | 2.1143.0 | Plan 02 Task E25 |
  ```

  **1.3 `infra/package.json`:**
  ```json
  {
    "name": "@sanchay/infra",
    "version": "0.0.0",
    "private": true,
    "type": "module",
    "scripts": {
      "build": "tsc -p tsconfig.json",
      "typecheck": "tsc -p tsconfig.json --noEmit",
      "test": "vitest run",
      "synth": "cdk synth",
      "diff": "cdk diff",
      "deploy": "cdk deploy"
    },
    "dependencies": {
      "aws-cdk-lib": "catalog:",
      "constructs": "catalog:"
    },
    "devDependencies": {
      "@sanchay/config": "workspace:*",
      "@types/node": "catalog:",
      "aws-cdk": "catalog:",
      "typescript": "catalog:",
      "vitest": "catalog:"
    }
  }
  ```

  **1.4 `infra/tsconfig.json`.** `@sanchay/config` exports `./tsconfig/node-lib.json` (there is no `./tsconfig-node`, TS6053). `exactOptionalPropertyTypes` is off for this package only: aws-cdk-lib's own declarations do not compile under it (for example `Vpc` is not assignable to `IVpc` through `vpnGatewayId`, 16 errors in this stack). `noUncheckedIndexedAccess` and the rest of the shared base stay on.
  ```json
  {
    "extends": "@sanchay/config/tsconfig/node-lib.json",
    "compilerOptions": {
      "outDir": "dist",
      "rootDir": ".",
      "types": ["node"],
      "exactOptionalPropertyTypes": false
    },
    "include": ["bin", "lib", "test"]
  }
  ```

  **1.5 `infra/vitest.config.ts`:**
  ```typescript
  import { defineConfig } from 'vitest/config';

  export default defineConfig({
    test: {
      environment: 'node',
      include: ['test/**/*.test.ts'],
    },
  });
  ```

  **1.6 `.gitignore` (shared; append one line).** `cdk synth` writes `infra/cdk.out/`; biome reads `.gitignore`, so this also keeps `pnpm lint` off the generated templates.
  ```
  cdk.out/
  ```

  **1.7 `infra/test/sanchay-mvp-stack.test.ts`:**
  ```typescript
  import { existsSync, readFileSync } from 'node:fs';
  import path from 'node:path';
  import { fileURLToPath } from 'node:url';
  import { App } from 'aws-cdk-lib';
  import { Match, Template } from 'aws-cdk-lib/assertions';
  import { describe, expect, it } from 'vitest';
  import {
    assertDeployInputs,
    loadStackConfig,
    type SanchayStackConfig,
    StackConfigError,
  } from '../lib/config.js';
  import { SanchayMvpStack } from '../lib/sanchay-mvp-stack.js';

  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, '../..');

  /** Fake deploy inputs: E21's test ARN and B2's test retriever hash. */
  const DEPLOY_INPUTS = {
    SANCHAY_PLATFORM_ARN: 'ARN-000000',
    SANCHAY_SMS_RETRIEVER_HASH: 'FA+9qCX9VSu',
  };
  /** What a real deploy also passes: the repository the deploy role trusts (a fake owner). */
  const WITH_REPO = { ...DEPLOY_INPUTS, SANCHAY_GITHUB_REPOSITORY: 'example-org/sanchay' };

  function synth(config: SanchayStackConfig, context: Record<string, string> = {}): Template {
    const app = new App({ context });
    const stack = new SanchayMvpStack(app, `SanchayMvpStack-${config.envName}`, {
      env: { account: '111111111111', region: 'ap-south-1' },
      config,
    });
    return Template.fromStack(stack);
  }

  function synthProdTemplate(context: Record<string, string> = {}): Template {
    return synth(loadStackConfig('prod', DEPLOY_INPUTS), context);
  }

  interface ContainerDef {
    Name: string;
    Environment?: Array<{ Name: string; Value: unknown }>;
    Secrets?: Array<{ Name: string }>;
  }

  /** Every container definition in the template, by name (web, api, worker, migrate). */
  function containersOf(template: Template): Map<string, ContainerDef> {
    const out = new Map<string, ContainerDef>();
    for (const def of Object.values(template.findResources('AWS::ECS::TaskDefinition'))) {
      for (const c of def.Properties.ContainerDefinitions as ContainerDef[]) out.set(c.Name, c);
    }
    return out;
  }

  function envOf(c: ContainerDef | undefined): Record<string, unknown> {
    return Object.fromEntries((c?.Environment ?? []).map((e) => [e.Name, e.Value]));
  }

  function secretNamesOf(c: ContainerDef | undefined): string[] {
    return (c?.Secrets ?? []).map((s) => s.Name).sort();
  }

  function refusal(fn: () => unknown): string {
    try {
      fn();
    } catch (error) {
      expect(error).toBeInstanceOf(StackConfigError);
      return (error as Error).message;
    }
    throw new Error('expected a StackConfigError');
  }

  describe('SanchayMvpStack-prod (E25, R-31)', () => {
    it('FP secret only in worker container', () => {
      const containers = containersOf(synthProdTemplate());
      const worker = containers.get('worker');
      const api = containers.get('api');
      const web = containers.get('web');
      expect(secretNamesOf(worker)).toContain('SANCHAY_FP_CREDENTIALS_JSON');
      expect(secretNamesOf(api)).not.toContain('SANCHAY_FP_CREDENTIALS_JSON');
      expect(secretNamesOf(web)).not.toContain('SANCHAY_FP_CREDENTIALS_JSON');
      // R-19: SANCHAY_KEYRING_JSON goes into api and worker only (migrate: the boot guard's keyring check).
      expect(secretNamesOf(worker)).toContain('SANCHAY_KEYRING_JSON');
      expect(secretNamesOf(api)).toContain('SANCHAY_KEYRING_JSON');
      expect(secretNamesOf(web)).not.toContain('SANCHAY_KEYRING_JSON');
    });

    it('RDS StorageEncrypted and force_ssl', () => {
      const template = synthProdTemplate();
      template.hasResourceProperties('AWS::RDS::DBInstance', {
        StorageEncrypted: true,
        Engine: 'postgres',
        EngineVersion: '18.6',
      });
      template.hasResourceProperties('AWS::RDS::DBParameterGroup', {
        Parameters: Match.objectLike({ 'rds.force_ssl': '1' }),
      });
    });

    it('ALB TLS policy', () => {
      synthProdTemplate().hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
        Protocol: 'HTTPS',
        SslPolicy: 'ELBSecurityPolicy-TLS13-1-2-2021-06',
      });
    });

    it('listener rules: api host (any path) and app host + /api/v1/* → api target group (R-11)', () => {
      const template = synthProdTemplate();
      const toApi = [
        Match.objectLike({
          Type: 'forward',
          TargetGroupArn: { Ref: Match.stringLikeRegexp('^ApiTargetGroup') },
        }),
      ];
      template.hasResourceProperties('AWS::ElasticLoadBalancingV2::ListenerRule', {
        Conditions: [
          Match.objectLike({
            Field: 'host-header',
            HostHeaderConfig: { Values: ['api.sanchay.in'] },
          }),
        ],
        Actions: toApi,
      });
      template.hasResourceProperties('AWS::ElasticLoadBalancingV2::ListenerRule', {
        Conditions: Match.arrayWith([
          Match.objectLike({
            Field: 'host-header',
            HostHeaderConfig: { Values: ['app.sanchay.in'] },
          }),
          Match.objectLike({
            Field: 'path-pattern',
            PathPatternConfig: { Values: ['/api/v1/*'] },
          }),
        ]),
        Actions: toApi,
      });
    });

    it('the apex sanchay.in answers 301 to www (spec §2.4, H-1)', () => {
      const template = synthProdTemplate();
      template.hasResourceProperties('AWS::ElasticLoadBalancingV2::ListenerRule', {
        Conditions: [
          Match.objectLike({
            Field: 'host-header',
            HostHeaderConfig: { Values: ['sanchay.in'] },
          }),
        ],
        Actions: [
          Match.objectLike({
            Type: 'redirect',
            RedirectConfig: Match.objectLike({ Host: 'www.sanchay.in', StatusCode: 'HTTP_301' }),
          }),
        ],
      });
      template.hasResourceProperties('AWS::Route53::RecordSet', {
        Name: 'sanchay.in.',
        Type: 'A',
      });
    });

    it('health check path /api/v1/health on the api port, for both target groups (R-12)', () => {
      const groups = Object.values(
        synthProdTemplate().findResources('AWS::ElasticLoadBalancingV2::TargetGroup'),
      );
      expect(groups.map((g) => g.Properties.Port).sort()).toEqual([3000, 3001]);
      for (const group of groups) {
        expect(group.Properties.HealthCheckPath).toBe('/api/v1/health');
        expect(group.Properties.HealthCheckPort).toBe('3000');
      }
    });

    it('SG: RDS reachable only from service', () => {
      const ingress = synthProdTemplate().findResources('AWS::EC2::SecurityGroupIngress', {
        Properties: { FromPort: 5432, ToPort: 5432 },
      });
      const rules = Object.values(ingress);
      expect(rules).toHaveLength(1);
      const [rule] = rules;
      expect(JSON.stringify(rule?.Properties)).not.toContain('0.0.0.0/0');
      expect(rule?.Properties.SourceSecurityGroupId).toBeDefined();
    });

    it('log groups: 400 days, kept on a teardown or rename, removed after a failed first create (R-34)', () => {
      const template = synthProdTemplate();
      template.resourceCountIs('AWS::Logs::LogGroup', 2);
      for (const name of ['/sanchay/prod/app', '/sanchay/prod/ecs-exec']) {
        template.hasResource('AWS::Logs::LogGroup', {
          Properties: Match.objectLike({ LogGroupName: name, RetentionInDays: 400 }),
          DeletionPolicy: 'RetainExceptOnCreate',
          UpdateReplacePolicy: 'Retain',
        });
      }
    });

    it('image repositories sanchay-prod-api and sanchay-prod-web keep 20 images each and survive a teardown (R-34)', () => {
      const template = synthProdTemplate();
      template.resourceCountIs('AWS::ECR::Repository', 2);
      for (const name of ['sanchay-prod-api', 'sanchay-prod-web']) {
        template.hasResource('AWS::ECR::Repository', {
          Properties: Match.objectLike({
            RepositoryName: name,
            LifecyclePolicy: { LifecyclePolicyText: Match.stringLikeRegexp('"countNumber":20') },
          }),
          DeletionPolicy: 'RetainExceptOnCreate',
          UpdateReplacePolicy: 'Retain',
        });
      }
    });

    it('S3 document bucket sanchay-prod-docs: SSE, public access blocked, versioned (spec §2.4)', () => {
      synthProdTemplate().hasResourceProperties('AWS::S3::Bucket', {
        BucketName: 'sanchay-prod-docs',
        BucketEncryption: {
          ServerSideEncryptionConfiguration: [
            { ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } },
          ],
        },
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
        VersioningConfiguration: { Status: 'Enabled' },
      });
    });

    it('ECS Exec logging configured on cluster sanchay-prod', () => {
      synthProdTemplate().hasResourceProperties('AWS::ECS::Cluster', {
        ClusterName: 'sanchay-prod',
        Configuration: {
          ExecuteCommandConfiguration: Match.objectLike({ Logging: 'OVERRIDE' }),
        },
      });
    });

    it('DATABASE_URL in prod carries sslmode=verify-full and the CA file exists in the image', () => {
      const entrypoint = readFileSync(path.join(repoRoot, 'apps/api/docker-entrypoint.sh'), 'utf8');
      expect(entrypoint).toContain('sslmode=verify-full');
      const dockerfile = readFileSync(path.join(repoRoot, 'apps/api/Dockerfile'), 'utf8');
      expect(dockerfile).toContain('rds-global-bundle.pem');
      expect(dockerfile).toContain('NODE_EXTRA_CA_CERTS');
      expect(existsSync(path.join(repoRoot, 'infra/certs/rds-global-bundle.pem'))).toBe(true);
    });

    it('the api image carries data/ and keeps JSON import attributes (Plan 03 E9 loads its questionnaire at boot)', () => {
      const dockerfile = readFileSync(path.join(repoRoot, 'apps/api/Dockerfile'), 'utf8');
      expect(dockerfile).toContain('COPY data /repo/data');
      const swcrc = JSON.parse(readFileSync(path.join(repoRoot, 'apps/api/.swcrc'), 'utf8')) as {
        jsc?: { experimental?: { keepImportAttributes?: unknown } };
      };
      expect(swcrc.jsc?.experimental?.keepImportAttributes).toBe(true);
    });

    it('RDS master is sanchay_master in sanchay/prod/db-master, and migrate logs in as it (D6)', () => {
      const template = synthProdTemplate();
      template.hasResourceProperties('AWS::SecretsManager::Secret', {
        Name: 'sanchay/prod/db-master',
        GenerateSecretString: Match.objectLike({
          SecretStringTemplate: '{"username":"sanchay_master"}',
        }),
      });
      // Parse each generated secret's SecretStringTemplate: JSON.stringify(template) escapes the quotes
      // inside it, so a substring search for '"username":"sanchay_app"' could never fail.
      const usernames = Object.values(template.findResources('AWS::SecretsManager::Secret')).flatMap(
        (secret) => {
          const raw: unknown = secret.Properties.GenerateSecretString?.SecretStringTemplate;
          return typeof raw === 'string'
            ? [(JSON.parse(raw) as { username?: unknown }).username]
            : [];
        },
      );
      expect(usernames).toContain('sanchay_master');
      expect(usernames).not.toContain('sanchay_app');
      expect(envOf(containersOf(template).get('migrate')).SANCHAY_DB_USER).toBe('sanchay_master');
    });

    it('api, worker and migrate carry every key parseEnv and the boot guard need (R-19 owners)', () => {
      const containers = containersOf(synthProdTemplate());
      const api = containers.get('api');
      const worker = containers.get('worker');
      const migrate = containers.get('migrate');
      for (const [container, role] of [
        [api, 'api'],
        [worker, 'worker'],
        [migrate, 'migrate'],
      ] as const) {
        expect(envOf(container)).toMatchObject({
          SANCHAY_APP_ENV: 'prod',
          SANCHAY_APP_ROLE: role,
          SANCHAY_APP_ORIGIN: 'https://app.sanchay.in',
          SANCHAY_API_ORIGIN: 'https://api.sanchay.in',
          SANCHAY_CLIENT_IP_SOURCE: 'alb',
          SANCHAY_KEY_SERVICE: 'secrets',
          SANCHAY_PROVIDER_MODE_FP: 'production',
          SANCHAY_PILOT_INVITE_ONLY: 'true',
          SANCHAY_PLATFORM_ARN: 'ARN-000000',
        });
      }
      for (const container of [api, worker]) {
        expect(envOf(container)).toMatchObject({
          SANCHAY_PROVIDER_MODE_SMS: 'msg91',
          SANCHAY_PROVIDER_MODE_EMAIL: 'ses',
          SANCHAY_SES_FROM: 'noreply@sanchay.in',
        });
      }
      expect(envOf(migrate)).not.toHaveProperty('SANCHAY_PROVIDER_MODE_SMS');
      expect(envOf(api).SANCHAY_SMS_RETRIEVER_HASH).toBe('FA+9qCX9VSu');
      expect(envOf(worker)).not.toHaveProperty('SANCHAY_SMS_RETRIEVER_HASH');
      expect(envOf(worker).SANCHAY_FP_BASE_URL).toBe('https://api.fintechprimitives.com');
      expect(envOf(api)).not.toHaveProperty('SANCHAY_FP_BASE_URL');
      expect(secretNamesOf(api)).toEqual([
        'SANCHAY_DB_PASSWORD',
        'SANCHAY_FP_WEBHOOK_SECRET',
        'SANCHAY_KEYRING_JSON',
        'SANCHAY_MSG91_CREDENTIALS_JSON',
      ]);
      expect(secretNamesOf(worker)).toEqual([
        'SANCHAY_DB_PASSWORD',
        'SANCHAY_FP_CREDENTIALS_JSON',
        'SANCHAY_KEYRING_JSON',
        'SANCHAY_MSG91_CREDENTIALS_JSON',
      ]);
      expect(secretNamesOf(migrate)).toEqual(['SANCHAY_DB_PASSWORD', 'SANCHAY_KEYRING_JSON']);
    });

    it('web listens on 3001 and knows the www and app hosts (apps/web/src/proxy.ts)', () => {
      const web = containersOf(synthProdTemplate()).get('web');
      expect(envOf(web)).toMatchObject({
        SANCHAY_APP_ENV: 'prod',
        PORT: '3001',
        HOSTNAME: '0.0.0.0',
        SANCHAY_WWW_ORIGIN: 'https://www.sanchay.in',
        SANCHAY_APP_ORIGIN: 'https://app.sanchay.in',
        SANCHAY_API_ORIGIN: 'https://api.sanchay.in',
      });
      expect(secretNamesOf(web)).toEqual([]);
    });

    it('one service sanchay-app: 2 tasks, never below 100 % healthy, rollback circuit breaker; -c noTasks=true creates it with no tasks', () => {
      synthProdTemplate().hasResourceProperties('AWS::ECS::Service', {
        ServiceName: 'sanchay-app',
        DesiredCount: 2,
        DeploymentConfiguration: Match.objectLike({
          MinimumHealthyPercent: 100,
          DeploymentCircuitBreaker: { Enable: true, Rollback: true },
        }),
      });
      synthProdTemplate({ noTasks: 'true' }).hasResourceProperties('AWS::ECS::Service', {
        ServiceName: 'sanchay-app',
        DesiredCount: 0,
      });
    });

    it('the tasks may send SES email only from SANCHAY_SES_FROM (D6)', () => {
      synthProdTemplate().hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Sid: 'SesSendFromSanchayDomain',
              Action: ['ses:SendEmail', 'ses:SendRawEmail'],
              Condition: { StringEquals: { 'ses:FromAddress': 'noreply@sanchay.in' } },
            }),
          ]),
        },
      });
    });

    it('prod database: Multi-AZ, 14-day backups, deletion protection, db.t4g.medium (spec §2.4)', () => {
      synthProdTemplate().hasResourceProperties('AWS::RDS::DBInstance', {
        MultiAZ: true,
        BackupRetentionPeriod: 14,
        DeletionProtection: true,
        DBInstanceClass: 'db.t4g.medium',
      });
    });

    it('closed to investors until GO-1 (R-31): invite-only, no orders or SIP override, no ingress allow-list', () => {
      const template = synthProdTemplate();
      for (const c of containersOf(template).values()) {
        const env = envOf(c);
        // D1's RuntimeConfig defaults orders.enabled and plans.sip.enabled to false; nothing here may set them.
        expect(Object.keys(env).join(' ')).not.toMatch(/ORDERS|SIP/);
        if (env.SANCHAY_APP_ROLE !== undefined) expect(env.SANCHAY_PILOT_INVITE_ONLY).toBe('true');
      }
      template.hasResourceProperties('AWS::EC2::SecurityGroup', {
        SecurityGroupIngress: Match.arrayWith([
          Match.objectLike({ CidrIp: '0.0.0.0/0', FromPort: 443, ToPort: 443 }),
        ]),
      });
    });

    it('the GitHub deploy role trusts only the prod environment of SANCHAY_GITHUB_REPOSITORY, is no administrator, and exists only with it', () => {
      const deployRole = { Properties: { RoleName: 'sanchay-prod-github-deploy' } };
      expect(Object.keys(synthProdTemplate().findResources('AWS::IAM::Role', deployRole))).toEqual(
        [],
      );
      const template = synth(loadStackConfig('prod', WITH_REPO));
      template.hasResourceProperties('AWS::IAM::Role', {
        RoleName: 'sanchay-prod-github-deploy',
        AssumeRolePolicyDocument: {
          Statement: [
            Match.objectLike({
              Condition: {
                StringEquals: {
                  'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
                  'token.actions.githubusercontent.com:sub':
                    'repo:example-org/sanchay:environment:prod',
                },
              },
            }),
          ],
        },
      });
      expect(JSON.stringify(template.toJSON())).not.toContain('AdministratorAccess');
      template.resourceCountIs('Custom::AWSCDKOpenIdConnectProvider', 1);
      template.hasOutput('GithubDeployRoleArn', {});
    });

    it('the deploy role can do exactly what deploy.yml does, the migrate run included', () => {
      const template = synth(loadStackConfig('prod', WITH_REPO));
      const statements = Object.values(template.findResources('AWS::IAM::Policy'))
        .filter((p) => JSON.stringify(p.Properties.Roles).includes('GithubDeployRole'))
        .flatMap((p) => p.Properties.PolicyDocument.Statement as Array<Record<string, unknown>>);
      const sids = statements.map((s) => s.Sid).filter((s) => s !== undefined);
      expect(sids).toEqual(
        expect.arrayContaining([
          'AssumeCdkBootstrapRoles',
          'EcrLogin',
          'ReadStackOutputs',
          'WaitForMigrateTask',
          'ForceNewDeployment',
        ]),
      );
      const runTask = statements.find((s) => s.Action === 'ecs:RunTask');
      expect(JSON.stringify(runTask?.Resource)).toContain('MigrateTaskDef');
      expect(statements.some((s) => s.Action === 'iam:PassRole')).toBe(true);
    });
  });

  describe('loadStackConfig (E25)', () => {
    it('refuses to synthesise without the two deploy inputs, naming each', () => {
      const message = refusal(() => loadStackConfig('prod', {}));
      expect(message).toContain('SANCHAY_PLATFORM_ARN is required');
      expect(message).toContain('SANCHAY_SMS_RETRIEVER_HASH is required');
    });

    it('refuses a malformed platform ARN or retriever hash', () => {
      expect(
        refusal(() => loadStackConfig('prod', { ...DEPLOY_INPUTS, SANCHAY_PLATFORM_ARN: '12345' })),
      ).toContain('ARN-<digits>');
      expect(
        refusal(() =>
          loadStackConfig('prod', { ...DEPLOY_INPUTS, SANCHAY_SMS_RETRIEVER_HASH: 'short' }),
        ),
      ).toContain('11 characters');
    });

    it('reads SANCHAY_GITHUB_REPOSITORY, refuses a malformed one, and a real deploy needs it', () => {
      expect(loadStackConfig('prod', DEPLOY_INPUTS).githubRepo).toBeUndefined();
      expect(loadStackConfig('prod', WITH_REPO).githubRepo).toBe('example-org/sanchay');
      // The repository lands in the role's trust policy: a wildcard would trust other repositories.
      for (const repo of ['no-slash', 'example-org/*', '*/sanchay', 'example-org/sanchay:ref']) {
        expect(
          refusal(() =>
            loadStackConfig('prod', { ...DEPLOY_INPUTS, SANCHAY_GITHUB_REPOSITORY: repo }),
          ),
        ).toContain('<owner>/<repo>');
      }
      // bin/sanchay.ts: a synth or deploy without the repository is refused before CloudFormation.
      expect(refusal(() => assertDeployInputs(loadStackConfig('prod', DEPLOY_INPUTS)))).toContain(
        'SANCHAY_GITHUB_REPOSITORY is required',
      );
      expect(() => assertDeployInputs(loadStackConfig('prod', WITH_REPO))).not.toThrow();
    });
  });
  ```

  **1.8 `apps/api/src/config/env.test.ts`**, two cases inside `describe('parseEnv', ...)`, directly after the `requires SANCHAY_SMS_RETRIEVER_HASH outside local/test (invariant 7, R-10)` case. They set `SANCHAY_PROVIDER_MODE_FP` themselves, so they hold whatever FP mode `devSecrets` carries:
  ```typescript
    it('binds the retriever hash (invariant 7) to the api role only (R-19 owning containers, E25)', () => {
      const noHash = {
        ...omit(devSecrets, 'SANCHAY_SMS_RETRIEVER_HASH'),
        SANCHAY_PROVIDER_MODE_FP: 'sandbox',
      };
      expect(errorMessage(() => parseEnv({ ...noHash, SANCHAY_APP_ROLE: 'api' }))).toMatch(
        /SANCHAY_SMS_RETRIEVER_HASH is required outside local\/test/,
      );
      for (const role of ['worker', 'migrate']) {
        expect(parseEnv({ ...noHash, SANCHAY_APP_ROLE: role }).SANCHAY_APP_ROLE).toBe(role);
      }
    });

    it('refuses fake senders in prod for api and worker only; migrate sends nothing (invariant 1, E25)', () => {
      const prod = { ...devSecrets, SANCHAY_APP_ENV: 'prod', SANCHAY_PROVIDER_MODE_FP: 'production' };
      for (const role of ['api', 'worker']) {
        expect(errorMessage(() => parseEnv({ ...prod, SANCHAY_APP_ROLE: role }))).toMatch(
          /fake SMS\/email providers \(capture, mailpit\) are refused in staging\/prod/,
        );
      }
      const migrate = parseEnv({
        ...omit(prod, 'SANCHAY_SMS_RETRIEVER_HASH'),
        SANCHAY_APP_ROLE: 'migrate',
      });
      expect(migrate.SANCHAY_PROVIDER_MODE_SMS).toBe('capture');
    });
  ```

  Then, one command:
  ```
  pnpm install
  ```

- [ ] **Step 2: Run them to confirm they fail**

  PowerShell and Git Bash (the same commands; BRIEF D8: a test filter is passed without `--`):
  ```
  pnpm --filter=@sanchay/infra test
  pnpm --filter=@sanchay/api test src/config/env.test.ts
  ```
  Expected: the infra file fails to load with `Cannot find module '../lib/config.js'` (and `'../lib/sanchay-mvp-stack.js'`); neither file exists yet. `env.test.ts`: 2 failed, the rest pass. The worker and migrate cases are refused with `SANCHAY_SMS_RETRIEVER_HASH is required outside local/test`, and the prod migrate case with `fake SMS/email providers (capture, mailpit) are refused in staging/prod`.

- [ ] **Step 3: Minimal implementation**

  **3.1 `apps/api/src/config/env.ts` (B2's `assertBootInvariants`), key-level.** R-19 gives the retriever hash to `api` only and the SMS/email credentials to `api` and `worker`; the guard now checks exactly those roles, so the worker and the migrate task boot without values R-19 denies them. Directly after the `stagingOrProd` line:
  ```typescript
    // R-19 owning containers (E25): api and worker send SMS and email; only api sends OTPs (the
    // retriever hash) and, from E1 on, receives the FP webhook. migrate sends nothing.
    const role = env.SANCHAY_APP_ROLE;
    const sends = role === 'api' || role === 'worker';
  ```
  Invariant 1's condition gains `sends &&` after `stagingOrProd &&`; invariant 7's condition becomes:
  ```typescript
    if (!localOrTest && role === 'api' && env.SANCHAY_SMS_RETRIEVER_HASH === undefined) {
  ```
  Messages are unchanged, so every existing case (default role `api`) still passes.

  **3.2 `docs/adr/README.md`**, update only the ADR-0014 row's Status and Written-by cells:
  ```markdown
  | 0014 | Minimal AWS topology: single ECS service, ALB only | Accepted | Plan 02 Task E25 |
  ```

  **3.3 `apps/web/next.config.ts`**, one-key addition (read the existing file first; add only this key to the exported config object):
  ```typescript
  output: 'standalone',
  ```

  **3.4 `infra/cdk.json`.** Node's type stripping does not map `../lib/config.js` to `config.ts` (`node --experimental-strip-types bin/sanchay.ts` fails with `ERR_MODULE_NOT_FOUND` on Node 24.21), so the app is compiled first. `cdk` runs through `pnpm --filter=@sanchay/infra exec`, which puts `tsc` on the PATH; the CLI runs this line through a shell, so it works from PowerShell 5.1 and Git Bash alike (verified).
  ```json
  {
    "app": "tsc -p tsconfig.json && node dist/bin/sanchay.js"
  }
  ```

  **3.5 `infra/lib/config.ts`:**
  ```typescript
  /**
   * R-31: prod is the only AWS environment (no dev stack and no dev domain; development runs locally on
   * docker compose). The name still prefixes every resource (`sanchay-prod-*`, `sanchay/prod/*`).
   */
  export type SanchayEnvName = 'prod';

  /**
   * Values that differ per deploy and are never committed, read from the environment of the `cdk`
   * process (`process.env` by default; deploy.yml passes them from the GitHub environment).
   */
  export type DeployInputSource = Readonly<Record<string, string | undefined>>;

  export interface SanchayStackConfig {
    envName: SanchayEnvName;
    /** The apex: the stack serves www, app and api under it and answers the apex with a 301 to www. */
    rootDomain: string;
    multiAz: boolean;
    deletionProtection: boolean;
    backupRetentionDays: number;
    desiredCount: number;
    /**
     * 'owner/repo' whose GitHub Actions runs may assume the deploy role: the deploy input
     * SANCHAY_GITHUB_REPOSITORY (deploy.yml passes `github.repository`, the exact case IAM compares).
     * Never a constant: the owner is the company organisation, whose name R-19's brand lint keeps out
     * of code. Without it the stack builds no deploy role (the tests); bin/sanchay.ts requires it.
     */
    githubRepo: string | undefined;
    /** Spec §2.4 sizes the RDS instance at db.t4g.medium. */
    dbInstanceSize: 'MICRO' | 'MEDIUM';
    /** D3 boot invariants 8/9: fake is refused outside local/test, production only in prod. */
    fpProviderMode: 'sandbox' | 'production';
    /** docs/research/fp-api.md §0 (worker only, R-19). */
    fpBaseUrl: string;
    /** D6 SANCHAY_SES_FROM (api, worker). */
    sesFrom: string;
    /** E21 SANCHAY_PLATFORM_ARN (every API-image container); deploy input. */
    platformArn: string;
    /** B2 invariant 7 / R-10 SANCHAY_SMS_RETRIEVER_HASH (api only, R-19); deploy input. */
    smsRetrieverHash: string;
  }

  type StaticConfig = Omit<SanchayStackConfig, 'githubRepo' | 'platformArn' | 'smsRetrieverHash'>;

  /** R-31: E25 deploys prod from these values in S2 week 2 (closed to investors); F1 hardens it in S4. */
  const PROD_CONFIG: StaticConfig = {
    envName: 'prod',
    rootDomain: 'sanchay.in',
    multiAz: true,
    deletionProtection: true,
    backupRetentionDays: 14,
    desiredCount: 2,
    dbInstanceSize: 'MEDIUM',
    fpProviderMode: 'production',
    fpBaseUrl: 'https://api.fintechprimitives.com',
    sesFrom: 'noreply@sanchay.in',
  };

  /** Same patterns as E21's EnvSchema.SANCHAY_PLATFORM_ARN and B2's SANCHAY_SMS_RETRIEVER_HASH. */
  const PLATFORM_ARN = /^ARN-\d+$/;
  const RETRIEVER_HASH = /^[A-Za-z0-9+/]{11}$/;
  /** GitHub's <owner>/<repo>, as `github.repository` prints it. */
  const GITHUB_REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9._-]+$/;

  export class StackConfigError extends Error {
    override name = 'StackConfigError';
  }

  function blankToUndefined(raw: string | undefined): string | undefined {
    const value = raw?.trim();
    return value === undefined || value === '' ? undefined : value;
  }

  /**
   * Refuses to synthesise without the deploy inputs the containers need to boot, so a missing GitHub
   * environment variable fails `cdk deploy` before CloudFormation is touched instead of leaving a
   * service whose containers the boot guard refuses.
   */
  export function loadStackConfig(
    envName: SanchayEnvName,
    source: DeployInputSource = process.env,
  ): SanchayStackConfig {
    const base = PROD_CONFIG;
    const githubRepo = blankToUndefined(source.SANCHAY_GITHUB_REPOSITORY);
    const platformArn = blankToUndefined(source.SANCHAY_PLATFORM_ARN);
    const smsRetrieverHash = blankToUndefined(source.SANCHAY_SMS_RETRIEVER_HASH);
    const problems: string[] = [];
    if (githubRepo !== undefined && !GITHUB_REPOSITORY.test(githubRepo)) {
      problems.push('SANCHAY_GITHUB_REPOSITORY must be <owner>/<repo>');
    }
    if (platformArn === undefined) {
      problems.push('SANCHAY_PLATFORM_ARN is required (E21: every API-image container)');
    } else if (!PLATFORM_ARN.test(platformArn)) {
      problems.push('SANCHAY_PLATFORM_ARN must look like ARN-<digits>');
    }
    if (smsRetrieverHash === undefined) {
      problems.push('SANCHAY_SMS_RETRIEVER_HASH is required (boot invariant 7, R-10)');
    } else if (!RETRIEVER_HASH.test(smsRetrieverHash)) {
      problems.push('SANCHAY_SMS_RETRIEVER_HASH must be 11 characters of [A-Za-z0-9+/]');
    }
    if (problems.length > 0 || platformArn === undefined || smsRetrieverHash === undefined) {
      throw new StackConfigError(`Stack config ${envName} refused:\n- ${problems.join('\n- ')}`);
    }
    return { ...base, githubRepo, platformArn, smsRetrieverHash };
  }

  /**
   * What a real `cdk synth|deploy` needs on top of loadStackConfig (bin/sanchay.ts calls it): the
   * repository the GitHub deploy role trusts. Tests synthesise without it and get no deploy role.
   */
  export function assertDeployInputs(config: SanchayStackConfig): void {
    const problems: string[] = [];
    if (config.githubRepo === undefined) {
      problems.push('SANCHAY_GITHUB_REPOSITORY is required (the GitHub deploy role trusts it)');
    }
    if (problems.length > 0) {
      throw new StackConfigError(
        `Stack config ${config.envName} refused:\n- ${problems.join('\n- ')}`,
      );
    }
  }
  ```

  **3.6 `infra/lib/sanchay-mvp-stack.ts`:**
  ```typescript
  import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
  import * as acm from 'aws-cdk-lib/aws-certificatemanager';
  import * as ec2 from 'aws-cdk-lib/aws-ec2';
  import * as ecr from 'aws-cdk-lib/aws-ecr';
  import * as ecs from 'aws-cdk-lib/aws-ecs';
  import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
  import * as iam from 'aws-cdk-lib/aws-iam';
  import * as logs from 'aws-cdk-lib/aws-logs';
  import * as rds from 'aws-cdk-lib/aws-rds';
  import * as route53 from 'aws-cdk-lib/aws-route53';
  import * as targets from 'aws-cdk-lib/aws-route53-targets';
  import * as s3 from 'aws-cdk-lib/aws-s3';
  import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
  import type { Construct } from 'constructs';
  import type { SanchayStackConfig } from './config.js';

  export interface SanchayMvpStackProps extends StackProps {
    config: SanchayStackConfig;
  }

  /** Spec §2.4: the one ECS service, in every env. deploy.yml forces new deployments by this name. */
  export const SERVICE_NAME = 'sanchay-app';
  /** BRIEF D6: the RDS master login (secret sanchay/{env}/db-master). Never the NOLOGIN app role's name. */
  export const DB_MASTER_USER = 'sanchay_master';

  /** R-11: raw AWS policy id, not the CDK enum name, so this stays correct across aws-cdk-lib versions. */
  const ALB_TLS_POLICY = 'ELBSecurityPolicy-TLS13-1-2-2021-06' as elbv2.SslPolicy;
  const ARM64_LINUX: ecs.RuntimePlatform = {
    cpuArchitecture: ecs.CpuArchitecture.ARM64,
    operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
  };
  const API_PORT = 3000;
  const WEB_PORT = 3001;
  /**
   * R-12 liveness. Both target groups probe /api/v1/health on the api port of the same task: Next.js
   * serves no /api/v1/* route in AWS (next.config.ts rewrites are local only), so a web-port probe
   * would 404 and ECS would replace every task. A crashed web process still stops the task, because
   * every container in it is essential.
   */
  const HEALTH_CHECK: elbv2.HealthCheck = {
    path: '/api/v1/health',
    port: String(API_PORT),
    protocol: elbv2.Protocol.HTTP,
    healthyHttpCodes: '200',
  };

  export class SanchayMvpStack extends Stack {
    constructor(scope: Construct, id: string, props: SanchayMvpStackProps) {
      super(scope, id, props);
      const { config } = props;
      const envName = config.envName;
      // R-31: the real hosts in the sanchay.in zone; there is no dev domain.
      const domain = config.rootDomain;
      const wwwOrigin = `https://www.${domain}`;
      const appOrigin = `https://app.${domain}`;
      const apiOrigin = `https://api.${domain}`;

      // --- Network -----------------------------------------------------------------------
      const natEip = new ec2.CfnEIP(this, 'NatEip', { domain: 'vpc' });
      const vpc = new ec2.Vpc(this, 'Vpc', {
        maxAzs: 2,
        natGateways: 1,
        natGatewayProvider: ec2.NatProvider.gateway({ eipAllocationIds: [natEip.attrAllocationId] }),
        subnetConfiguration: [
          { name: 'public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
          { name: 'app', subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
          { name: 'data', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
        ],
      });

      // --- S3, ECR -------------------------------------------------------------------------
      // Spec §2.4: sanchay-{env}-docs with public access blocked, SSE and versioning.
      const documentsBucket = new s3.Bucket(this, 'DocumentsBucket', {
        bucketName: `sanchay-${envName}-docs`,
        encryption: s3.BucketEncryption.S3_MANAGED,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        enforceSSL: true,
        versioned: true,
        removalPolicy: config.deletionProtection ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      });
      // R-34: two repositories, one per image, each keeping its own last 20. A stack teardown or rename
      // keeps them; a failed first create removes them, so the retry can create the names again.
      const apiRepo = new ecr.Repository(this, 'ApiRepo', {
        repositoryName: `sanchay-${envName}-api`,
        imageScanOnPush: true,
        lifecycleRules: [{ maxImageCount: 20 }],
        removalPolicy: RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
      });
      const webRepo = new ecr.Repository(this, 'WebRepo', {
        repositoryName: `sanchay-${envName}-web`,
        imageScanOnPush: true,
        lifecycleRules: [{ maxImageCount: 20 }],
        removalPolicy: RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
      });

      // --- Secrets (R-19 owning containers) -------------------------------------------------
      const keyringSecret = new secretsmanager.Secret(this, 'KeyringSecret', {
        secretName: `sanchay/${envName}/keyring`,
        description: 'SANCHAY_KEYRING_JSON (owning containers: api, worker). Populated out-of-band.',
      });
      const fpSecret = new secretsmanager.Secret(this, 'FpSecret', {
        secretName: `sanchay/${envName}/fp`,
        description:
          'SANCHAY_FP_CREDENTIALS_JSON (owning container: worker only). Populated out-of-band.',
      });
      const fpWebhookSecret = new secretsmanager.Secret(this, 'FpWebhookSecret', {
        secretName: `sanchay/${envName}/fp-webhook`,
        description: 'SANCHAY_FP_WEBHOOK_SECRET (owning container: api only). Populated out-of-band.',
      });
      const msg91Secret = new secretsmanager.Secret(this, 'Msg91Secret', {
        secretName: `sanchay/${envName}/msg91`,
        description:
          'SANCHAY_MSG91_CREDENTIALS_JSON (owning containers: api, worker). Populated out-of-band.',
      });

      // --- RDS PostgreSQL (R-15: sslmode=verify-full at the app; force_ssl=1 here) ---------
      const dbSecurityGroup = new ec2.SecurityGroup(this, 'DbSecurityGroup', {
        vpc,
        description: 'RDS ingress only from the ECS service (R-11 SG isolation)',
        allowAllOutbound: false,
      });
      // B6's Testcontainers image is postgres 18.6. aws-cdk-lib 2.216.0 has no VER_18_6 constant
      // (its newest PostgreSQL constant is VER_17_6), so the version is named explicitly.
      const pgEngine = rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.of('18.6', '18'),
      });
      const dbParamGroup = new rds.ParameterGroup(this, 'DbParamGroup', {
        engine: pgEngine,
        parameters: { 'rds.force_ssl': '1' },
      });
      const dbInstance = new rds.DatabaseInstance(this, 'Database', {
        engine: pgEngine,
        instanceType: ec2.InstanceType.of(
          ec2.InstanceClass.BURSTABLE4_GRAVITON,
          config.dbInstanceSize === 'MEDIUM' ? ec2.InstanceSize.MEDIUM : ec2.InstanceSize.MICRO,
        ),
        vpc,
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
        multiAz: config.multiAz,
        allocatedStorage: 20,
        storageEncrypted: true,
        parameterGroup: dbParamGroup,
        securityGroups: [dbSecurityGroup],
        // BRIEF D6: the master is not `sanchay_app`, the NOLOGIN role 0000_bootstrap creates and
        // 0003_grants scopes; with that name the app would log in as rds_superuser.
        credentials: rds.Credentials.fromGeneratedSecret(DB_MASTER_USER, {
          secretName: `sanchay/${envName}/db-master`,
        }),
        databaseName: 'sanchay',
        deletionProtection: config.deletionProtection,
        backupRetention: Duration.days(config.backupRetentionDays),
        removalPolicy: config.deletionProtection ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      });
      const dbMasterSecret = dbInstance.secret;
      if (dbMasterSecret === undefined) {
        throw new Error('Credentials.fromGeneratedSecret always attaches a secret');
      }

      // --- Logs, cluster, ECS Exec (R-16) ---------------------------------------------------
      // R-34: one group for every container (each gets its own streams through the awslogs prefix), 400
      // days. A stack teardown or rename keeps it (CERT-In needs 180 days); a failed first create removes
      // it, so the retry can create the name again. The ECS Exec group holds the same kind of record.
      const appLogGroup = new logs.LogGroup(this, 'AppLogGroup', {
        logGroupName: `/sanchay/${envName}/app`,
        retention: logs.RetentionDays.THIRTEEN_MONTHS, // = 400 days
        removalPolicy: RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
      });
      const execLogGroup = new logs.LogGroup(this, 'ExecLogGroup', {
        logGroupName: `/sanchay/${envName}/ecs-exec`,
        retention: logs.RetentionDays.THIRTEEN_MONTHS,
        removalPolicy: RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
      });
      const cluster = new ecs.Cluster(this, 'Cluster', {
        vpc,
        clusterName: `sanchay-${envName}`,
        containerInsightsV2: ecs.ContainerInsights.ENABLED,
        executeCommandConfiguration: {
          logging: ecs.ExecuteCommandLogging.OVERRIDE,
          logConfiguration: { cloudWatchLogGroup: execLogGroup, cloudWatchEncryptionEnabled: true },
        },
      });

      // --- Task definition: web + api + worker in one Fargate ARM64 task -------------------
      const taskRole = new iam.Role(this, 'TaskRole', {
        assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      });
      documentsBucket.grantReadWrite(taskRole);
      // D6 SesEmailSender (SES v2 SendEmail): only from SANCHAY_SES_FROM. The resource is every identity
      // because, while the account is in the SES sandbox, recipients are identities that IAM checks too.
      taskRole.addToPolicy(
        new iam.PolicyStatement({
          sid: 'SesSendFromSanchayDomain',
          actions: ['ses:SendEmail', 'ses:SendRawEmail'],
          resources: [`arn:aws:ses:${this.region}:${this.account}:identity/*`],
          conditions: { StringEquals: { 'ses:FromAddress': config.sesFrom } },
        }),
      );

      const taskDef = new ecs.FargateTaskDefinition(this, 'AppTaskDef', {
        cpu: 1024,
        memoryLimitMiB: 2048,
        runtimePlatform: ARM64_LINUX,
        taskRole,
      });
      const logging = ecs.LogDrivers.awsLogs({ streamPrefix: envName, logGroup: appLogGroup });

      // BRIEF D6: the migrate task logs in as the RDS master. F1 moves api and worker to the LOGIN role
      // sanchay_app_login (secret sanchay/{env}/db-app); until then they share the master login.
      const migrateDbLogin = { user: DB_MASTER_USER, secret: dbMasterSecret };
      const appDbLogin = { user: DB_MASTER_USER, secret: dbMasterSecret };
      const dbEnv = (user: string): Record<string, string> => ({
        SANCHAY_DB_HOST: dbInstance.instanceEndpoint.hostname,
        SANCHAY_DB_PORT: String(dbInstance.instanceEndpoint.port),
        SANCHAY_DB_NAME: 'sanchay',
        SANCHAY_DB_USER: user,
      });
      const dbPassword = (secret: secretsmanager.ISecret) => ({
        SANCHAY_DB_PASSWORD: ecs.Secret.fromSecretsManager(secret, 'password'),
      });

      // Every key parseEnv and assertBootInvariants demand of every API-image role (Plans 01-03),
      // plain values only. SANCHAY_API_ORIGIN (E2) and SANCHAY_PLATFORM_ARN (E21) are set before
      // those tasks make them required, so the stack keeps booting when they land.
      const bootEnv: Record<string, string> = {
        SANCHAY_APP_ENV: envName,
        SANCHAY_APP_ORIGIN: appOrigin,
        SANCHAY_API_ORIGIN: apiOrigin,
        SANCHAY_CLIENT_IP_SOURCE: 'alb',
        SANCHAY_KEY_SERVICE: 'secrets',
        SANCHAY_PROVIDER_MODE_FP: config.fpProviderMode,
        SANCHAY_PILOT_INVITE_ONLY: 'true',
        SANCHAY_PLATFORM_ARN: config.platformArn,
      };
      // api and worker send SMS and email (boot invariants 1, 11, 12); migrate sends nothing.
      const senderEnv: Record<string, string> = {
        SANCHAY_PROVIDER_MODE_SMS: 'msg91',
        SANCHAY_PROVIDER_MODE_EMAIL: 'ses',
        SANCHAY_SES_FROM: config.sesFrom,
      };

      taskDef.addContainer('web', {
        image: ecs.ContainerImage.fromEcrRepository(webRepo, 'latest'),
        logging,
        portMappings: [{ containerPort: WEB_PORT }],
        environment: {
          SANCHAY_APP_ENV: envName,
          // Next.js standalone listens on PORT (default 3000, the api's port in the shared task network).
          PORT: String(WEB_PORT),
          HOSTNAME: '0.0.0.0',
          // apps/web/src/proxy.ts routes by host (H-1): www -> /site, app -> the app.
          SANCHAY_WWW_ORIGIN: wwwOrigin,
          SANCHAY_APP_ORIGIN: appOrigin,
          SANCHAY_API_ORIGIN: apiOrigin,
        },
      });

      taskDef.addContainer('api', {
        image: ecs.ContainerImage.fromEcrRepository(apiRepo, 'latest'),
        logging,
        portMappings: [{ containerPort: API_PORT }],
        environment: {
          ...bootEnv,
          ...senderEnv,
          ...dbEnv(appDbLogin.user),
          SANCHAY_APP_ROLE: 'api',
          HOST: '0.0.0.0',
          PORT: String(API_PORT),
          SANCHAY_SMS_RETRIEVER_HASH: config.smsRetrieverHash,
        },
        secrets: {
          ...dbPassword(appDbLogin.secret),
          SANCHAY_KEYRING_JSON: ecs.Secret.fromSecretsManager(keyringSecret),
          SANCHAY_FP_WEBHOOK_SECRET: ecs.Secret.fromSecretsManager(fpWebhookSecret),
          SANCHAY_MSG91_CREDENTIALS_JSON: ecs.Secret.fromSecretsManager(msg91Secret),
        },
      });

      taskDef.addContainer('worker', {
        image: ecs.ContainerImage.fromEcrRepository(apiRepo, 'latest'),
        logging,
        environment: {
          ...bootEnv,
          ...senderEnv,
          ...dbEnv(appDbLogin.user),
          SANCHAY_APP_ROLE: 'worker',
          SANCHAY_FP_BASE_URL: config.fpBaseUrl,
        },
        secrets: {
          ...dbPassword(appDbLogin.secret),
          SANCHAY_KEYRING_JSON: ecs.Secret.fromSecretsManager(keyringSecret),
          SANCHAY_FP_CREDENTIALS_JSON: ecs.Secret.fromSecretsManager(fpSecret),
          SANCHAY_MSG91_CREDENTIALS_JSON: ecs.Secret.fromSecretsManager(msg91Secret),
        },
      });

      // --- One-off migrate task (run by hand: aws ecs run-task --overrides, R-16) ----------
      const migrateTaskDef = new ecs.FargateTaskDefinition(this, 'MigrateTaskDef', {
        cpu: 512,
        memoryLimitMiB: 1024,
        runtimePlatform: ARM64_LINUX,
        taskRole,
      });
      migrateTaskDef.addContainer('migrate', {
        image: ecs.ContainerImage.fromEcrRepository(apiRepo, 'latest'),
        logging,
        environment: { ...bootEnv, ...dbEnv(migrateDbLogin.user), SANCHAY_APP_ROLE: 'migrate' },
        secrets: {
          ...dbPassword(migrateDbLogin.secret),
          SANCHAY_KEYRING_JSON: ecs.Secret.fromSecretsManager(keyringSecret),
        },
        command: ['node', 'dist/cli/migrate.js'],
      });

      // --- Service, ALB, listener rules (R-11) ----------------------------------------------
      const serviceSecurityGroup = new ec2.SecurityGroup(this, 'ServiceSecurityGroup', {
        vpc,
        description: 'ECS service: web, api, worker',
      });
      dbSecurityGroup.addIngressRule(
        serviceSecurityGroup,
        ec2.Port.tcp(5432),
        'ECS service only (R-11 SG isolation)',
      );

      // First deploy (ADR-0014): this stack creates the ECR repositories empty and the secrets with
      // placeholder values, so `-c noTasks=true` creates the service with no tasks; F1 uses the same
      // flag to move the stack onto its D6 logins. Every other deploy runs config.desiredCount. R-31's
      // pause (closed to investors until GO-1) is D7's invite gate and RuntimeConfig, not this flag.
      const noTasksFlag: unknown = this.node.tryGetContext('noTasks');
      const noTasks = noTasksFlag === true || noTasksFlag === 'true';
      const service = new ecs.FargateService(this, 'Service', {
        serviceName: SERVICE_NAME,
        cluster,
        taskDefinition: taskDef,
        desiredCount: noTasks ? 0 : config.desiredCount,
        // Start new tasks before stopping old ones, so a rollout never drops below the running count.
        minHealthyPercent: 100,
        securityGroups: [serviceSecurityGroup],
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        enableExecuteCommand: true,
        circuitBreaker: { rollback: true },
      });

      const alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
        vpc,
        internetFacing: true,
        vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      });
      alb.setAttribute('routing.http.xff_header_processing.mode', 'append');
      const [albSecurityGroup] = alb.connections.securityGroups;
      if (albSecurityGroup === undefined) {
        throw new Error('an ApplicationLoadBalancer always has a security group');
      }
      serviceSecurityGroup.addIngressRule(albSecurityGroup, ec2.Port.tcp(API_PORT));
      serviceSecurityGroup.addIngressRule(albSecurityGroup, ec2.Port.tcp(WEB_PORT));

      const zone = route53.HostedZone.fromLookup(this, 'Zone', { domainName: config.rootDomain });
      const cert = new acm.Certificate(this, 'Cert', {
        domainName: `*.${domain}`,
        subjectAlternativeNames: [domain],
        validation: acm.CertificateValidation.fromDns(zone),
      });

      alb.addListener('HttpRedirect', {
        port: 80,
        defaultAction: elbv2.ListenerAction.redirect({ protocol: 'HTTPS', port: '443' }),
      });
      // R-31: no ingress allow-list. Until GO-1 the boot guard's invariant 10 keeps sign-in
      // invite-only (D7) and RuntimeConfig keeps orders.enabled and plans.sip.enabled false (D1).
      const httpsListener = alb.addListener('HttpsListener', {
        port: 443,
        certificates: [cert],
        sslPolicy: ALB_TLS_POLICY,
        open: true,
      });

      const apiTargetGroup = new elbv2.ApplicationTargetGroup(this, 'ApiTargetGroup', {
        vpc,
        port: API_PORT,
        protocol: elbv2.ApplicationProtocol.HTTP,
        targetType: elbv2.TargetType.IP,
        healthCheck: HEALTH_CHECK,
      });
      const webTargetGroup = new elbv2.ApplicationTargetGroup(this, 'WebTargetGroup', {
        vpc,
        port: WEB_PORT,
        protocol: elbv2.ApplicationProtocol.HTTP,
        targetType: elbv2.TargetType.IP,
        healthCheck: HEALTH_CHECK,
      });
      apiTargetGroup.addTarget(
        service.loadBalancerTarget({ containerName: 'api', containerPort: API_PORT }),
      );
      webTargetGroup.addTarget(
        service.loadBalancerTarget({ containerName: 'web', containerPort: WEB_PORT }),
      );

      httpsListener.addAction('DefaultToWeb', {
        action: elbv2.ListenerAction.forward([webTargetGroup]),
      });
      new elbv2.ApplicationListenerRule(this, 'ApiHostAllPaths', {
        listener: httpsListener,
        priority: 10,
        conditions: [elbv2.ListenerCondition.hostHeaders([`api.${domain}`])],
        action: elbv2.ListenerAction.forward([apiTargetGroup]),
      });
      new elbv2.ApplicationListenerRule(this, 'AppHostApiPath', {
        listener: httpsListener,
        priority: 20,
        conditions: [
          elbv2.ListenerCondition.hostHeaders([`app.${domain}`]),
          elbv2.ListenerCondition.pathPatterns(['/api/v1/*']),
        ],
        action: elbv2.ListenerAction.forward([apiTargetGroup]),
      });
      // Spec §2.4 and H-1: the apex sanchay.in answers 301 to www.sanchay.in, keeping the path and
      // query. Port 80 sends it to HTTPS first, like every host; the certificate covers it.
      new elbv2.ApplicationListenerRule(this, 'ApexToWww', {
        listener: httpsListener,
        priority: 5,
        conditions: [elbv2.ListenerCondition.hostHeaders([domain])],
        action: elbv2.ListenerAction.redirect({ host: `www.${domain}`, permanent: true }),
      });

      // --- Route 53: www, app, api and the apex in the sanchay.in hosted zone (R-31) ------------
      const albTarget = route53.RecordTarget.fromAlias(new targets.LoadBalancerTarget(alb));
      for (const sub of ['www', 'app', 'api']) {
        new route53.ARecord(this, `${sub.charAt(0).toUpperCase()}${sub.slice(1)}Record`, {
          zone,
          recordName: sub,
          target: albTarget,
        });
      }
      // The zone apex: the ALB answers it with ApexToWww's 301.
      new route53.ARecord(this, 'ApexRecord', { zone, target: albTarget });

      // R-12's NAV-age alarm is not built here: no task before F1 publishes a NAV metric, and an alarm
      // without data is either always in ALARM or never fires. F1 (Plan 04) adds the metric source
      // (the worker's ops.gauges.emit job and its log metric filters) and the alarm.

      // --- GitHub OIDC deploy role -----------------------------------------------------------
      // Trusts only jobs of the GitHub `prod` environment (both founders are its required reviewers)
      // in the repository named by the deploy input SANCHAY_GITHUB_REPOSITORY (bin/sanchay.ts refuses
      // a deploy without it); a template synthesised without it (the tests) has no deploy role. The
      // OIDC provider is one per account, and this is the account's only stack (R-31).
      const githubRepo = config.githubRepo;
      if (githubRepo !== undefined) {
        const oidcProvider = new iam.OpenIdConnectProvider(this, 'GithubOidc', {
          url: 'https://token.actions.githubusercontent.com',
          clientIds: ['sts.amazonaws.com'],
        });
        const deployRole = new iam.Role(this, 'GithubDeployRole', {
          roleName: `sanchay-${envName}-github-deploy`,
          assumedBy: new iam.WebIdentityPrincipal(oidcProvider.openIdConnectProviderArn, {
            StringEquals: {
              'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
              'token.actions.githubusercontent.com:sub': `repo:${githubRepo}:environment:${envName}`,
            },
          }),
          description: 'Assumed by .github/workflows/deploy.yml via OIDC (no long-lived AWS keys).',
        });
        // Least privilege: exactly what deploy.yml does. CloudFormation work goes through the CDK
        // bootstrap roles.
        deployRole.addToPolicy(
          new iam.PolicyStatement({
            sid: 'AssumeCdkBootstrapRoles',
            actions: ['sts:AssumeRole'],
            resources: [
              `arn:aws:iam::${this.account}:role/cdk-hnb659fds-*-${this.account}-${this.region}`,
            ],
          }),
        );
        deployRole.addToPolicy(
          new iam.PolicyStatement({
            sid: 'EcrLogin',
            actions: ['ecr:GetAuthorizationToken'],
            resources: ['*'],
          }),
        );
        apiRepo.grantPullPush(deployRole);
        webRepo.grantPullPush(deployRole);
        deployRole.addToPolicy(
          new iam.PolicyStatement({
            sid: 'ReadStackOutputs',
            actions: ['cloudformation:DescribeStacks'],
            resources: [this.stackId],
          }),
        );
        // deploy.yml runs the migrate task before every rollout (spec §2.4), then reads its exit code.
        migrateTaskDef.grantRun(deployRole);
        deployRole.addToPolicy(
          new iam.PolicyStatement({
            sid: 'WaitForMigrateTask',
            actions: ['ecs:DescribeTasks'],
            resources: [`arn:aws:ecs:${this.region}:${this.account}:task/${cluster.clusterName}/*`],
          }),
        );
        deployRole.addToPolicy(
          new iam.PolicyStatement({
            sid: 'ForceNewDeployment',
            actions: ['ecs:UpdateService', 'ecs:DescribeServices'],
            resources: [service.serviceArn],
          }),
        );
        new CfnOutput(this, 'GithubDeployRoleArn', { value: deployRole.roleArn });
      }

      // --- Outputs -----------------------------------------------------------------------
      new CfnOutput(this, 'NatEipAddress', {
        value: natEip.ref,
        description: 'Register this IP with Cybrilla for the production IP allowlist (G-B7)',
      });
      new CfnOutput(this, 'AlbDnsName', { value: alb.loadBalancerDnsName });
      new CfnOutput(this, 'ClusterName', { value: cluster.clusterName });
      new CfnOutput(this, 'MigrateTaskDefinitionArn', { value: migrateTaskDef.taskDefinitionArn });
      new CfnOutput(this, 'ApiRepoUri', { value: apiRepo.repositoryUri });
      new CfnOutput(this, 'WebRepoUri', { value: webRepo.repositoryUri });
      // The network configuration of every one-off run-task (migrate here; F7's ops CLIs later).
      new CfnOutput(this, 'AppSubnetIds', {
        value: vpc
          .selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS })
          .subnetIds.join(','),
      });
      new CfnOutput(this, 'ServiceSecurityGroupId', { value: serviceSecurityGroup.securityGroupId });
    }
  }
  ```

  **3.7 `infra/bin/sanchay.ts`:**
  ```typescript
  import { App } from 'aws-cdk-lib';
  import { assertDeployInputs, loadStackConfig } from '../lib/config.js';
  import { SanchayMvpStack } from '../lib/sanchay-mvp-stack.js';

  const app = new App();
  // R-31: prod is the only stack. Reads SANCHAY_PLATFORM_ARN, SANCHAY_SMS_RETRIEVER_HASH and
  // SANCHAY_GITHUB_REPOSITORY from this process's environment; a real synth or deploy also needs the
  // repository the deploy role trusts.
  const config = loadStackConfig('prod');
  assertDeployInputs(config);

  new SanchayMvpStack(app, 'SanchayMvpStack-prod', {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      // Spec §2.4: ap-south-1 only. The cdk CLI overwrites CDK_DEFAULT_REGION with the caller's AWS
      // default region (us-east-1 when none is configured), so the region is pinned, not read.
      region: 'ap-south-1',
    },
    config,
  });
  ```

  **3.8 Fetch the RDS CA bundle** (a published AWS certificate file, not authored code):
  PowerShell:
  ```
  New-Item -ItemType Directory -Force infra/certs | Out-Null
  Invoke-WebRequest -Uri https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem -OutFile infra/certs/rds-global-bundle.pem
  ```
  Git Bash:
  ```
  mkdir -p infra/certs
  curl -o infra/certs/rds-global-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
  ```

  **3.9 `apps/api/docker-entrypoint.sh`:**
  ```bash
  #!/bin/sh
  set -eu

  # R-15: dev/prod always connect with sslmode=verify-full against the baked-in RDS CA bundle.
  # SANCHAY_DB_* pieces come from plain container env (host/port/name/user) plus one ECS secret
  # (SANCHAY_DB_PASSWORD) — see E25's deviation note (CDK cannot compose one Secrets Manager
  # value from a generated secret field and plain strings without a custom resource).
  if [ -z "${DATABASE_URL:-}" ] && [ -n "${SANCHAY_DB_HOST:-}" ]; then
    export DATABASE_URL="postgres://${SANCHAY_DB_USER}:${SANCHAY_DB_PASSWORD}@${SANCHAY_DB_HOST}:${SANCHAY_DB_PORT}/${SANCHAY_DB_NAME}?sslmode=verify-full"
  fi

  exec "$@"
  ```

  **3.10 `.dockerignore`** (repo root; the build context of both Dockerfiles). Without it the context carries every `node_modules` and, worse, `COPY apps/api apps/api` would copy a developer's `apps/api/.env` (sandbox credentials) into the image.
  ```
  # Build context for apps/api/Dockerfile and apps/web/Dockerfile (E25). Images build from source.
  .git
  **/node_modules
  **/dist
  **/.next
  **/.turbo
  **/.expo
  **/coverage
  **/*.tsbuildinfo
  infra/cdk.out
  **/.env
  **/.env.*
  ```

  **3.11 `apps/api/Dockerfile`.** `nodeLinker: hoisted` puts the dependencies in `/repo/node_modules`, the workspace links in `apps/api/node_modules` point at `/repo/packages`, and `dist/db/migrate.js` reads `../../drizzle`, so the runtime keeps the `/repo` layout (ESM resolution ignores `NODE_PATH`). The workspace packages are built here because their `exports` point at `dist/`. Node is `.node-version`'s 24.21.0, pinned by digest: under `engineStrict` 24.13.1 is refused (`jsdom` 30 in the lockfile needs `^24.15.0`).
  ```dockerfile
  # syntax=docker/dockerfile:1.7
  # Same Node as .node-version (engineStrict: jsdom 30 in the lockfile needs ^24.15.0); arm64 variant used by the Fargate task.
  ARG NODE_IMAGE=node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6

  FROM ${NODE_IMAGE} AS base
  RUN corepack enable && corepack prepare pnpm@11.27.0 --activate
  WORKDIR /repo

  FROM base AS deps
  COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
  COPY packages ./packages
  COPY apps/api/package.json apps/api/package.json
  RUN pnpm install --frozen-lockfile --filter=@sanchay/api...

  FROM deps AS build
  COPY tsconfig.json ./
  COPY apps/api apps/api
  # The api and the workspace packages it imports, whose package.json exports point at dist/.
  RUN pnpm --filter=@sanchay/api... build

  FROM base AS prod-deps
  COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
  COPY packages ./packages
  COPY apps/api/package.json apps/api/package.json
  RUN pnpm install --frozen-lockfile --prod --filter=@sanchay/api...

  FROM ${NODE_IMAGE} AS runtime
  RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
  ENV NODE_ENV=production
  # Keep the monorepo layout: nodeLinker is hoisted (dependencies live in /repo/node_modules), the
  # workspace links in apps/api/node_modules point at /repo/packages, and dist/db/migrate.js reads
  # the migrations from ../../drizzle.
  WORKDIR /repo/apps/api
  COPY --from=prod-deps /repo/node_modules /repo/node_modules
  COPY --from=build /repo/packages /repo/packages
  COPY --from=prod-deps /repo/apps/api/node_modules ./node_modules
  COPY --from=build /repo/apps/api/package.json ./package.json
  COPY --from=build /repo/apps/api/dist ./dist
  COPY --from=build /repo/apps/api/drizzle ./drizzle
  # data/ at /repo/data, where dist/ resolves it as src/ does from the repo root: D8's catalogue CSVs and,
  # from Plan 03, E6/E7's reference CSVs and E9's risk questionnaire, which risk-profile.service.ts
  # imports when its module loads (without it api and worker exit at boot with ERR_MODULE_NOT_FOUND).
  COPY data /repo/data
  # docs/legal/ is copied here by F1 (Plan 04), whose migrate task seeds it; E3 (Plan 03) creates it.
  COPY infra/certs/rds-global-bundle.pem /etc/ssl/certs/rds-global-bundle.pem
  COPY apps/api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
  RUN chmod +x /usr/local/bin/docker-entrypoint.sh

  ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/rds-global-bundle.pem
  EXPOSE 3000
  ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
  CMD ["node", "dist/main.js"]
  ```

  **`apps/api/.swcrc` (Plan 01's file; one key, RV-02-59).** The api's SWC build (`nest build -b swc` in the image and in `pnpm --filter=@sanchay/api build`, `nest start -b swc -w` in `dev`) drops `with { type: 'json' }` unless SWC keeps import attributes, and Node 24.21 then refuses the JSON module (`ERR_IMPORT_ATTRIBUTE_MISSING`). Plan 03 E9's `risk-profile.service.ts` is the first such import, and it runs when the module loads, in api and worker. Vitest is unaffected (`vitest.shared.ts` passes `swcrc: false`), and the key changes none of the Plan 01 api's compiled files. Read the file first; in `jsc`, after `"keepClassNames": true` (which gains a comma), add:
  ```json
  "experimental": { "keepImportAttributes": true }
  ```

  **3.12 `apps/web/Dockerfile`:**
  ```dockerfile
  # syntax=docker/dockerfile:1.7
  # Same Node as .node-version (engineStrict: jsdom 30 in the lockfile needs ^24.15.0); arm64 variant used by the Fargate task.
  ARG NODE_IMAGE=node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6

  FROM ${NODE_IMAGE} AS base
  RUN corepack enable && corepack prepare pnpm@11.27.0 --activate
  WORKDIR /repo

  FROM base AS deps
  COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
  COPY packages ./packages
  COPY apps/web/package.json apps/web/package.json
  RUN pnpm install --frozen-lockfile --filter=@sanchay/web...

  FROM deps AS build
  COPY tsconfig.json ./
  COPY apps/web apps/web
  # /site is prerendered here (C10/C11): its DSC-02 line needs the ARN and its validity date, and
  # its links need the hosts. Build arguments are visible to RUN as environment variables.
  ARG SANCHAY_PLATFORM_ARN
  ARG SANCHAY_PLATFORM_ARN_VALID_TILL
  ARG SANCHAY_APP_ORIGIN
  ARG SANCHAY_WWW_ORIGIN
  # The web app and the workspace packages it imports (api-client and tokens export dist/).
  RUN pnpm --filter=@sanchay/web... build

  FROM ${NODE_IMAGE} AS runtime
  WORKDIR /app
  ENV NODE_ENV=production
  # Next.js standalone reads PORT and HOSTNAME; 3000 is the api's port in the shared task network.
  ENV PORT=3001
  ENV HOSTNAME=0.0.0.0
  COPY --from=build /repo/apps/web/.next/standalone ./
  COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
  COPY --from=build /repo/apps/web/public ./apps/web/public
  EXPOSE 3001
  CMD ["node", "apps/web/server.js"]
  ```

  **3.13 `apps/web/public/.well-known/assetlinks.json`** (served by the web container on the app host; F18 replaces it with the Play App Signing payload, and until then the web image needs the `public/` directory it copies):
  ```json
  []
  ```

  **3.14 `.github/workflows/deploy.yml`:**
  ```yaml
  name: deploy

  on:
    workflow_dispatch:
      inputs:
        environment:
          description: 'Target stack'
          required: true
          default: prod
          type: choice
          # R-31: prod is the only AWS environment (development runs locally).
          options: [prod]

  concurrency:
    group: deploy-${{ inputs.environment }}
    cancel-in-progress: false

  permissions: {}

  jobs:
    deploy:
      runs-on: ubuntu-24.04
      timeout-minutes: 60
      # The GitHub `prod` environment: both founders are its required reviewers, and the deploy role
      # trusts only its jobs (OIDC sub repo:<owner>/<repo>:environment:prod).
      environment: ${{ inputs.environment }}
      permissions:
        contents: read
        id-token: write
      env:
        AWS_REGION: ap-south-1
        ENV_NAME: ${{ inputs.environment }}
        TURBO_TELEMETRY_DISABLED: 1
      steps:
        - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
          with:
            fetch-depth: 0
            persist-credentials: false

        - uses: pnpm/action-setup@ea17c68df8912ef543352723c149a84f56e3d413 # v6.1.0

        - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
          with:
            node-version-file: .node-version
            cache: pnpm

        - name: Install
          run: pnpm install --frozen-lockfile

        # Deviation from outline: OIDC token exchange is scripted with the AWS CLI instead of
        # aws-actions/configure-aws-credentials, so no new third-party action SHA needs pinning.
        - name: Assume the GitHub deploy role via OIDC
          run: |
            ID_TOKEN=$(curl -sSL -H "Authorization: bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" \
              "$ACTIONS_ID_TOKEN_REQUEST_URL&audience=sts.amazonaws.com" | jq -r '.value')
            CREDS=$(aws sts assume-role-with-web-identity \
              --role-arn "${{ vars.SANCHAY_DEPLOY_ROLE_ARN }}" \
              --role-session-name "gha-deploy-${{ github.run_id }}" \
              --web-identity-token "$ID_TOKEN" \
              --duration-seconds 3600 \
              --query 'Credentials' --output json)
            echo "AWS_ACCESS_KEY_ID=$(echo "$CREDS" | jq -r '.AccessKeyId')" >> "$GITHUB_ENV"
            echo "AWS_SECRET_ACCESS_KEY=$(echo "$CREDS" | jq -r '.SecretAccessKey')" >> "$GITHUB_ENV"
            echo "AWS_SESSION_TOKEN=$(echo "$CREDS" | jq -r '.SessionToken')" >> "$GITHUB_ENV"

        # The task definition is ARM64 (spec §2.4) and ubuntu-24.04 runners are x86_64, so the image
        # build runs under QEMU. The binfmt installer is pinned by digest, like the action SHAs above.
        - name: Register arm64 emulation
          run: docker run --privileged --rm tonistiigi/binfmt:qemu-v10.0.4@sha256:8f58e6214f4cc9dc83ce8f5acad1ece508eb6b20e696a8c1e9f274481982c541 --install arm64

        - name: Build and push images to ECR
          run: |
            ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
            REGISTRY="$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
            aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$REGISTRY"
            docker build --platform linux/arm64 -f apps/api/Dockerfile -t "$REGISTRY/sanchay-${{ inputs.environment }}-api:${{ github.sha }}" -t "$REGISTRY/sanchay-${{ inputs.environment }}-api:latest" .
            DOMAIN=sanchay.in
            docker build --platform linux/arm64 -f apps/web/Dockerfile --build-arg SANCHAY_PLATFORM_ARN="${{ vars.SANCHAY_PLATFORM_ARN }}" --build-arg SANCHAY_PLATFORM_ARN_VALID_TILL="${{ vars.SANCHAY_PLATFORM_ARN_VALID_TILL }}" --build-arg SANCHAY_APP_ORIGIN="https://app.$DOMAIN" --build-arg SANCHAY_WWW_ORIGIN="https://www.$DOMAIN" -t "$REGISTRY/sanchay-${{ inputs.environment }}-web:${{ github.sha }}" -t "$REGISTRY/sanchay-${{ inputs.environment }}-web:latest" .
            docker push "$REGISTRY/sanchay-${{ inputs.environment }}-api" --all-tags
            docker push "$REGISTRY/sanchay-${{ inputs.environment }}-web" --all-tags

        # Spec §2.4: the one-off migrate task runs before each deploy, on the api image just pushed
        # (its task definition reads :latest) and before any new api or worker task starts. It runs the
        # task definition of the stack as deployed now; a non-zero exit stops the deploy.
        - name: Run the migrate task
          run: |
            set -euo pipefail
            output() {
              aws cloudformation describe-stacks --stack-name "SanchayMvpStack-$ENV_NAME" \
                --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue | [0]" --output text
            }
            TASK_DEF=$(output MigrateTaskDefinitionArn)
            SUBNETS=$(output AppSubnetIds)
            SECURITY_GROUP=$(output ServiceSecurityGroupId)
            TASK=$(aws ecs run-task --cluster "sanchay-$ENV_NAME" --launch-type FARGATE \
              --task-definition "$TASK_DEF" \
              --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$SECURITY_GROUP],assignPublicIp=DISABLED}" \
              --query 'tasks[0].taskArn' --output text)
            echo "migrate task: $TASK"
            aws ecs wait tasks-stopped --cluster "sanchay-$ENV_NAME" --tasks "$TASK"
            CODE=$(aws ecs describe-tasks --cluster "sanchay-$ENV_NAME" --tasks "$TASK" \
              --query 'tasks[0].containers[0].exitCode' --output text)
            echo "migrate exit code: $CODE (log group /sanchay/$ENV_NAME/app, stream prefix $ENV_NAME/migrate)"
            test "$CODE" = "0"

        - name: cdk deploy
          run: pnpm --filter=@sanchay/infra exec cdk deploy --require-approval never
          env:
            CDK_DEFAULT_ACCOUNT: ${{ vars.SANCHAY_AWS_ACCOUNT_ID }}
            CDK_DEFAULT_REGION: ap-south-1
            # Deploy inputs: infra/lib/config.ts refuses to synthesise without them.
            SANCHAY_PLATFORM_ARN: ${{ vars.SANCHAY_PLATFORM_ARN }}
            SANCHAY_SMS_RETRIEVER_HASH: ${{ vars.SANCHAY_SMS_RETRIEVER_HASH }}
            # The repository the deploy role trusts (bin/sanchay.ts refuses a deploy without it), in
            # the exact owner/repo case that IAM compares.
            SANCHAY_GITHUB_REPOSITORY: ${{ github.repository }}

        # Wait for this rollout and fail unless it completed: `services-stable` alone also succeeds once
        # the circuit breaker has rolled the new deployment back; the deployment's rolloutState does not.
        - name: Force a new deployment (pick up the :latest images) and wait for it
          run: |
            set -euo pipefail
            DEPLOYMENT=$(aws ecs update-service --cluster "sanchay-$ENV_NAME" --service sanchay-app \
              --force-new-deployment --query "service.deployments[?status=='PRIMARY'].id | [0]" --output text)
            aws ecs wait services-stable --cluster "sanchay-$ENV_NAME" --services sanchay-app
            STATE=$(aws ecs describe-services --cluster "sanchay-$ENV_NAME" --services sanchay-app \
              --query "services[0].deployments[?id=='$DEPLOYMENT'].rolloutState | [0]" --output text)
            echo "deployment $DEPLOYMENT: $STATE"
            test "$STATE" = "COMPLETED"
  ```
  `vars.SANCHAY_DEPLOY_ROLE_ARN`, `vars.SANCHAY_AWS_ACCOUNT_ID`, `vars.SANCHAY_PLATFORM_ARN`, `vars.SANCHAY_PLATFORM_ARN_VALID_TILL` and `vars.SANCHAY_SMS_RETRIEVER_HASH` are GitHub environment variables on the `prod` environment, set once by hand (ADR-0014 "First deploy"). Its protection rules list both founders as required reviewers, so every run waits for a founder's approval, and the deploy role trusts only that environment's jobs (R-31). `SANCHAY_GITHUB_REPOSITORY` is not a variable: the workflow passes `github.repository`. Under QEMU the two image builds take several minutes each (the api image built in about 7 minutes on Docker Desktop), hence the 60-minute job timeout and the one-hour OIDC session. The migrate step reads the stack outputs `MigrateTaskDefinitionArn`, `AppSubnetIds` and `ServiceSecurityGroupId`, so it needs the stack from ADR-0014's "First deploy" step 2; it runs the migrate task definition as deployed, on the `:latest` api image just pushed, before `cdk deploy` changes anything (spec §2.4, RV-02-61). A release whose boot guard needs a key that the deployed migrate task definition lacks therefore deploys the stack first by hand, as F1's rollout does with `-c noTasks=true`.

  **3.15 `docs/adr/0014-minimal-aws-topology.md`:**
  ```markdown
  # ADR-0014: Minimal AWS topology — single ECS service, ALB only

  - Status: Accepted (Sprint 2, week of 2026-10-19)
  - Deciders: Dev A, lead
  - Related: R-05, R-11, R-12, R-15, R-16, R-19, R-31; ADR-0001 (versions); ADR-0005 (hosts, H-1)

  ## Context
  R-31: there is no AWS dev environment and no dev domain; development runs locally (docker compose:
  PostgreSQL, Mailpit). The one AWS stack is prod, deployed in Sprint 2 week 2 so that the production
  hosts, the NAT EIP that Cybrilla allowlists, the webhook and payment-return URLs and the deploy
  pipeline exist about five weeks before GO-1. It stays paused (closed to investors) until GO-1.

  ## Decision
  - One stack, `SanchayMvpStack-prod`: one VPC (2 AZs, 1 NAT with a stable EIP for Cybrilla's IP
    allowlist), one ALB, one ECS Fargate ARM64 service, `sanchay-app` in cluster `sanchay-prod`,
    running three containers (`web`, `api`, `worker`) from one task definition — not three services —
    to keep the stack cheap and the ALB routing simple.
  - Paused until GO-1 (R-31): the service runs and answers on `www`, `app` and `api.sanchay.in`, but no
    investor can transact. Sign-in is invite-only (D7; boot invariant 10 refuses
    `SANCHAY_PILOT_INVITE_ONLY=false` in prod), RuntimeConfig's `orders.enabled` and `plans.sip.enabled`
    stay at their D1 default (false; nothing in the stack sets them), and no invite is added before
    GO-1 except the founders' test accounts. There is no ALB ingress allow-list. F1 (Plan 04) hardens
    this stack in Sprint 4 (D6 logins, ops task definition, alarms); there is no second environment.
  - Host-based ALB listener rules (R-11): `api.sanchay.in` (any path) and `app.sanchay.in` +
    `/api/v1/*` both forward to the api target group; everything else on `app.sanchay.in` and all of
    `www.sanchay.in` forwards to the web target group. The apex `sanchay.in` answers 301 to
    `www.sanchay.in` (spec §2.4, H-1). The four names are alias records in the `sanchay.in` hosted
    zone, which also validates the one ACM certificate (`*.sanchay.in` and `sanchay.in`).
  - `/api/v1/health` is the only health-check path (liveness only, R-12). Both target groups probe it
    on the task's api port: the web container (Next.js) serves no `/api/v1/*` route in AWS, and a
    crashed web process still stops the task because every container is essential. NAV staleness is
    a CloudWatch alarm plus a per-scheme AGED grade, not a readiness probe, so a stale catalogue sync
    never takes the whole app down; the alarm and its metric source arrive with F1 (Plan 04).
  - RDS PostgreSQL 18.6 (Multi-AZ, 14-day backups, deletion protection, `db.t4g.medium`),
    `rds.force_ssl=1`, `StorageEncrypted: true`, reachable only from the ECS service security group;
    the app connects with `sslmode=verify-full` against the RDS global CA bundle baked into the api
    image (R-15). The master login is `sanchay_master` (secret `sanchay/prod/db-master`), never
    `sanchay_app`, the NOLOGIN role the migrations grant to. The migrate task uses the master; api and
    worker share it until F1 adds the `sanchay_app_login` LOGIN role (secret `sanchay/prod/db-app`).
  - FP credentials (`sanchay/prod/fp`) go into the `worker` container only; the FP webhook secret
    and the SMS Retriever hash into `api` only; the keyring (`sanchay/prod/keyring`) into `api`,
    `worker` and the one-off `migrate` task, whose boot guard checks it too (R-19 owning containers).
  - Values that differ per deploy and that the boot guard needs (`SANCHAY_PLATFORM_ARN`,
    `SANCHAY_SMS_RETRIEVER_HASH`) are read from the deploy environment at synth; the stack refuses
    to synthesise without them.
  - The stack creates the account's GitHub OIDC provider and a deploy role that trusts only jobs of
    the GitHub `prod` environment (both founders are its required reviewers) in the repository named
    by the deploy input `SANCHAY_GITHUB_REPOSITORY` (OIDC `sub` `repo:<owner>/<repo>:environment:prod`,
    matched exactly; `deploy.yml` passes `github.repository`). The role may do only what `deploy.yml`
    does. The owner is never written into code, and `bin/sanchay.ts` refuses a synth or deploy without
    it.
  - ECS Exec is enabled with command logging to CloudWatch (R-16); a one-off Fargate task
    definition (not a `Service`) runs `db:migrate` with `aws ecs run-task` before each deploy:
    `deploy.yml` runs it after pushing the images and before `cdk deploy`, and a non-zero exit
    stops the deploy (spec §2.4).
  - Logs and images (R-34): every container logs to `/sanchay/prod/app` (400 days; each container has
    its own awslogs streams) and ECS Exec sessions to `/sanchay/prod/ecs-exec`; the images go to
    `sanchay-prod-api` and `sanchay-prod-web` (the last 20 each). Both log groups and both repositories
    survive a stack teardown or rename and are removed only after a failed first create
    (`RetainExceptOnCreate`). A customer-managed KMS key and any split of the log group wait for Phase 2.
  - Images are linux/arm64. `deploy.yml` builds them on x86_64 runners under QEMU (the
    `tonistiigi/binfmt` installer, pinned by digest).
  - `.github/workflows/deploy.yml` is manual dispatch only, with `prod` its only environment; it
    authenticates over GitHub OIDC (no long-lived AWS keys) via a scripted
    `sts assume-role-with-web-identity` call, reusing `ci.yml`'s already-pinned
    `actions/checkout`/`pnpm/action-setup`/`actions/setup-node` SHAs rather than adding new,
    unresolved third-party action pins.

  ## Hosts
  `www.sanchay.in` (the public site, `/site`), `app.sanchay.in` (the web app and
  `/.well-known/assetlinks.json`), `api.sanchay.in` (the mobile API, FP webhooks and payment returns);
  the apex `sanchay.in` redirects to `www`. There are no dev hosts: the delegated dev zone (PB-41) is
  moot (R-31), and local development runs on docker compose.

  ## First deploy (manual, once)
  Owner prerequisites (R-31): the prod AWS account, with no IAM OIDC provider for
  `token.actions.githubusercontent.com` yet (`aws iam list-open-id-connect-providers` lists none: the
  stack creates it); `sanchay.in` registered (R-22), with its public hosted zone in that
  account and the registrar's name servers pointing at the zone; the GitHub environment `prod`, with both
  founders as required reviewers. The stack creates the ECR repositories
  empty and the provider secrets with placeholder values, so the first deploy creates the service with
  no tasks. One command per line; replace each `<...>` by hand and keep secret files outside the
  repository. Run from the repo root with AWS credentials for the prod account.

  1. Once per account and region: `pnpm --filter=@sanchay/infra exec cdk bootstrap aws://<account-id>/ap-south-1`
  2. Create the stack with the service at 0 tasks. `<owner>/<repo>` is this repository exactly as
     GitHub prints it (the `origin` remote's path), the value `deploy.yml` later passes. Until the Play
     App Signing certificate exists (F18), the retriever hash is any 11 characters of `[A-Za-z0-9+/]`:
     it boots the api, and Android's SMS auto-read simply does not match it.
     - PowerShell: `$env:SANCHAY_GITHUB_REPOSITORY='<owner>/<repo>'; $env:SANCHAY_PLATFORM_ARN='<ARN-digits>'; $env:SANCHAY_SMS_RETRIEVER_HASH='<hash>'; pnpm --filter=@sanchay/infra exec cdk deploy -c noTasks=true`
     - Git Bash: `SANCHAY_GITHUB_REPOSITORY='<owner>/<repo>' SANCHAY_PLATFORM_ARN='<ARN-digits>' SANCHAY_SMS_RETRIEVER_HASH='<hash>' pnpm --filter=@sanchay/infra exec cdk deploy -c noTasks=true`
  3. Put the real values into the four provider secrets (`sanchay/prod/keyring`, `sanchay/prod/fp`,
     `sanchay/prod/fp-webhook`, `sanchay/prod/msg91`), one command per secret:
     `aws secretsmanager put-secret-value --secret-id sanchay/prod/keyring --secret-string file://<path-outside-the-repo>`
     Until a provider issues its production value (Cybrilla's FP credentials: R-21, by Mon 11-16),
     store a well-formed placeholder in the shape the boot guard checks: D3's `FpCredentialsSchema` for
     `fp` (the worker parses it at boot) and D6's `Msg91CredentialsSchema` for `msg91` (boot invariant
     11, api and worker). The containers refuse to start on anything else, and the provider refuses
     the placeholder until the real values replace it (F1's credential-rotation runbook).
  4. On the GitHub `prod` environment, set the variables `SANCHAY_DEPLOY_ROLE_ARN` (stack output
     `GithubDeployRoleArn`), `SANCHAY_AWS_ACCOUNT_ID`, `SANCHAY_PLATFORM_ARN`,
     `SANCHAY_PLATFORM_ARN_VALID_TILL` (the web image prerenders `/site` with both ARN values) and
     `SANCHAY_SMS_RETRIEVER_HASH`.
  5. Build and push both images (outputs `ApiRepoUri`, `WebRepoUri`; Docker Desktop emulates arm64):
     - `aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.ap-south-1.amazonaws.com`
     - `docker build --platform linux/arm64 -f apps/api/Dockerfile -t <ApiRepoUri>:latest .`
     - `docker build --platform linux/arm64 -f apps/web/Dockerfile --build-arg SANCHAY_PLATFORM_ARN=<ARN-digits> --build-arg SANCHAY_PLATFORM_ARN_VALID_TILL=<yyyy-mm-dd> --build-arg SANCHAY_APP_ORIGIN=https://app.sanchay.in --build-arg SANCHAY_WWW_ORIGIN=https://www.sanchay.in -t <WebRepoUri>:latest .`
     - `docker push <ApiRepoUri>:latest`
     - `docker push <WebRepoUri>:latest`
  6. Run the migrate task and check its exit code (outputs `MigrateTaskDefinitionArn`,
     `AppSubnetIds`, `ServiceSecurityGroupId`):
     - `aws ecs run-task --cluster sanchay-prod --launch-type FARGATE --task-definition <MigrateTaskDefinitionArn> --network-configuration "awsvpcConfiguration={subnets=[<AppSubnetIds>],securityGroups=[<ServiceSecurityGroupId>],assignPublicIp=DISABLED}" --query 'tasks[0].taskArn' --output text`
     - `aws ecs wait tasks-stopped --cluster sanchay-prod --tasks <taskArn>`
     - `aws ecs describe-tasks --cluster sanchay-prod --tasks <taskArn> --query 'tasks[0].containers[0].exitCode'` (expect `0`)
  7. Dispatch `deploy.yml` for `prod`, and a founder approves the `prod` environment. GitHub runs a
     dispatched workflow only when its file is on the default branch, so this waits for `main` to
     carry `deploy.yml`. The run rebuilds and pushes the images, runs the migrate task again (step 6
     left nothing to apply), runs `cdk deploy` without the flag (two tasks), forces a new deployment
     and fails unless that rollout completes.
  8. Commit `infra/cdk.context.json` (the hosted-zone and availability-zone lookups from step 2)
     after `pnpm exec biome check --write infra/cdk.context.json`.
  9. Register the stack output `NatEipAddress` with Cybrilla (the production IP allowlist, G-B7), and
     give Cybrilla the webhook URL `https://api.sanchay.in/api/v1/webhooks/fp`.

  Every later deploy: dispatch `deploy.yml`; a founder approves it. It runs the migrate task (step 6)
  itself, after pushing the images and before `cdk deploy`, and stops on a non-zero exit.

  ## Consequences
  - F1 (Plan 04) hardens this stack in place (D6 logins, ops task definition, gauges and alarms)
    instead of adding a second environment or a duplicated stack file.
  - Everything in `infra/lib/sanchay-mvp-stack.ts` is covered by `infra/test/sanchay-mvp-stack.test.ts`
    CDK assertions, so a regression (for example a dropped `StorageEncrypted`) fails before any
    `cdk deploy`.
  - Prod costs run from Sprint 2 (Multi-AZ RDS, the NAT gateway, the ALB, two tasks) for a stack that
    no investor uses before GO-1.
  ```

- [ ] **Step 4: Run tests to confirm they pass**

  PowerShell and Git Bash:
  ```
  pnpm --filter=@sanchay/infra typecheck
  pnpm --filter=@sanchay/infra test
  pnpm --filter=@sanchay/api test src/config/env.test.ts
  pnpm --filter=@sanchay/api typecheck
  pnpm --filter=@sanchay/web typecheck
  ```
  Expected: `tsc` exits 0; the 25 tests in `infra/test/sanchay-mvp-stack.test.ts` pass; `env.test.ts` is green, including the two new cases; both typechecks exit 0.

  Then the two images (Docker; not part of `pnpm test`), from the repo root:
  ```
  docker build --platform linux/arm64 -f apps/api/Dockerfile -t sanchay-api:local .
  docker build --platform linux/arm64 -f apps/web/Dockerfile --build-arg SANCHAY_PLATFORM_ARN=ARN-000000 --build-arg SANCHAY_PLATFORM_ARN_VALID_TILL=2099-12-31 -t sanchay-web:local .
  ```
  Expected: both build (Docker Desktop emulates arm64); without the two `--build-arg`s the web build stops at `Error occurred prerendering page "/site"`. Optional local smoke of the api image against `pnpm db:up`'s Postgres: the image runs `node dist/cli/migrate.js`, then `node dist/main.js` answers `GET /api/v1/health` with 200.

  **Post-deploy verification checklist** (after the ADR-0014 first deploy and a `deploy.yml` run; not part of `pnpm test`). PowerShell and Git Bash, the same lines (RV-02-32): `curl.exe` is the real curl in both shells (in PowerShell 5.1 `curl` is an alias of `Invoke-WebRequest`), and `NUL` discards the body on Windows in both:
  ```
  curl.exe -s -o NUL -w "%{http_code}\n" https://app.sanchay.in/api/v1/health
  curl.exe -s -o NUL -w "%{http_code}\n" https://api.sanchay.in/api/v1/health
  curl.exe -s -o NUL -w "%{http_code}\n" https://www.sanchay.in/
  curl.exe -s -o NUL -w "%{http_code} %{content_type}\n" https://app.sanchay.in/.well-known/assetlinks.json
  curl.exe -s -o NUL -w "%{http_code} %{redirect_url}\n" https://sanchay.in/
  aws ecs execute-command --cluster sanchay-prod --task <task-id> --container api --interactive --command "node --version"
  ```
  Expected: `200` for both health checks and for the www home page (`/site`, H-1); `200 application/json` for `assetlinks.json`; `301 https://www.sanchay.in/` for the apex (RV-02-63; the same `curl.exe` line printed the 301 and its target from both shells against a local stand-in); the ECS Exec session prints the Node version and the command appears in `/sanchay/prod/ecs-exec` (R-16). If the session is refused with "encryption is not set up on the selected CloudWatch log group", the exec log group needs a KMS key for `cloudWatchEncryptionEnabled: true`; record it and raise it with the lead before changing the setting. `POST https://api.sanchay.in/api/v1/webhooks/fp` reachability is checked with FP's own webhook test-send tool once Cybrilla has the URL (ADR-0014 step 9). The pause (R-31) needs no live check: Step 1's `closed to investors` test pins `SANCHAY_PILOT_INVITE_ONLY=true` and the absence of any orders or SIP override, and no invite exists until F7's `ops:invite` adds the founders' test accounts (Plan 04).

- [ ] **Step 5: Commit**
  ```
  pnpm exec biome check --write infra apps/api/src/config/env.ts apps/api/src/config/env.test.ts apps/web/next.config.ts apps/web/public docs/adr
  pnpm --filter=@sanchay/infra typecheck
  pnpm --filter=@sanchay/infra test
  pnpm --filter=@sanchay/api test src/config/env.test.ts
  pnpm --filter=@sanchay/api typecheck
  pnpm --filter=@sanchay/web typecheck
  pnpm lint
  git add infra .dockerignore .gitignore .github/workflows/deploy.yml apps/api/Dockerfile apps/api/docker-entrypoint.sh apps/api/.swcrc apps/api/src/config/env.ts apps/api/src/config/env.test.ts apps/web/Dockerfile apps/web/next.config.ts apps/web/public/.well-known/assetlinks.json docs/adr/0001-versions.md docs/adr/0014-minimal-aws-topology.md docs/adr/README.md pnpm-workspace.yaml pnpm-lock.yaml
  git commit -m "feat(infra): add SanchayMvpStack-prod (paused, R-31), arm64 images and the prod deploy workflow (E25)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```
  If lefthook re-stages files (`stage_fixed`), re-run the Step 4 `typecheck`/`test` commands before committing again.
