<!-- source: workflow wf_0d7a7a96-9cd label interface-sheet + wf_0a226252-0e5 label plan01-delta | exported 2026-09-28 -->

# Plan 01 interface sheet

The MVP delta sheet (second half of this file) overrides the original interface sheet wherever they differ. Task ids in the original sheet are the OLD ids; see the delta sheet section 2 for the old -> new mapping.

---

# Plan 01 (Foundation) interface sheet: the single source of truth for every name in Plan 01

This sheet was written read-only. Nothing was created or changed anywhere.

**Where the lost Part B text came from.** Part B Tasks 1–10 were missing from `planApi`, but the full text is still in the drafting agent's transcript: `C:/Users/pc/.claude/projects/C--Users-pc-Desktop-sanchay/2f00d411-382c-43a6-bd67-ecaf60c67db1/subagents/workflows/wf_1d1c9b02-593/agent-ae9924f43326b32c1.jsonl`, line 189, which holds the first 129,150 characters. The B1–B10 outline in §8 is based on that text, with the fixes below applied. Writers who need the original draft code can read it (read-only) with:

`node -e "const L=require('fs').readFileSync(process.argv[1],'utf8').split('\n').filter(Boolean).map(JSON.parse);process.stdout.write(L[189].message.content.find(b=>b.type==='text').text.slice(+process.argv[2],+process.argv[2]+28000))" "<that path>" 0`

Task headings in the plan are `### Task A1:` … `### Task C15:`. The plan file is `C:/Users/pc/Desktop/sanchay/docs/superpowers/plans/2026-09-28-plan-01-foundation.md`.

---

## 0. Global conventions (every task)

**Renames.** Every `@plz/*` becomes `@sanchay/*`, and every `plz` identifier becomes `sanchay`. Examples:
- `PlzClsStore` → `SanchayClsStore`
- `PlzClientContext` → `SanchayClientContext`
- the metadata key `plz:isPublic` → `sanchay:isPublic`
- DB roles `plz_app` → `sanchay_app`

User-visible "Platizio" becomes "Sanchay". "Platizio" stays only for:
- the legal entity / ARN holder;
- `platizio.com` (Google Workspace);
- the Cybrilla tenant.

**Commands.**
- Commands must work unchanged in PowerShell 5.1 and Git Bash: one command per line and no `&&` in instructions. `&&` is allowed inside package.json scripts.
- Env-var commands get two variants: PowerShell `$env:X='v'; cmd` and Git Bash `X=v cmd`.
- Package filters are always `--filter=@sanchay/<name>`, never the space form (review X-15).

**Before every commit:** run `pnpm exec biome check --write <paths>`, then `pnpm lint`. Biome formats with single quotes, semicolons, trailing commas, 2 spaces and a 100-column line width. Part B draft code has no semicolons; writers emit semicolons.

**Commits and branch.**
- Commits use Conventional Commits. When an agent authors a commit, add a second `-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.
- Work on branch `feat/plan-01-foundation`. Push only when the owner asks.

**TDD shape per task:** Files, then Interfaces, then Steps 1–5 (failing test → run and see it fail → minimal implementation → run and see it pass → commit).

---

## 1. Scope

### 1.1 Delivered by Plan 01

| Roadmap sprint | Items delivered (task) |
|---|---|
| S0 | Monorepo: pnpm catalog, Turbo, Biome, lefthook, CI (A1, A2, A13).<br>oRPC/Nest/Fastify gate, including the typed-error round-trip through `OpenAPILink` (B9, B10, B25).<br>OpenAPI export and drift test (B5, B11).<br>Drizzle baseline, migrate, Testcontainers (B6, B26).<br>Next www/app skeleton with dynamic app routes and nonce CSP (C10, C11).<br>Expo 57 local dev build (C14; EAS is deferred). |
| S1 | Zod config and boot guards (B2).<br>Pino allow-list redaction (B4).<br>nestjs-cls request context (B10).<br>Crypto with app-minted ids and AAD, local keyring only (B1, B3).<br>Audit (B12).<br>Output validation, meaning the oRPC output schemas on every procedure (B19).<br>OTP engine with capture/Mailpit fakes (B13–B15).<br>`packages/money` port and vectors (A3–A8).<br>Testcontainers harness plus the swapped-rowId test (B3, B6). |
| S2 (pulled forward) | Web and native sessions, device trust, new-device email factor, email fallback (B16–B22).<br>Add/verify email (B23).<br>Throttler (B24).<br>Tokens (C1).<br>Part of ui batch 1: AppText, Button, Card, Screen, TextField, OtpInput, Banner (C4, C5).<br>Universal auth and home screens (C6–C9).<br>Web and native shells (C10–C14).<br>Playwright and Maestro smoke (C12, C15). |
| Extra | `@sanchay/validation` (A9–A11) and `@sanchay/domain` enums (A12). |

### 1.2 Deferred to Plan 02 (explicit; these are not dropped)

**Platform kernel**
- The idempotency interceptor and `idempotency_keys` table (428/422/409/replay). `/me/email/*` stays unenforced (D-8). The api-client already sends `idempotency-key` whenever the caller supplies one.
- JobsModule (pg-boss 12.34.0), `Jobs.enqueue(tx)`, `worker_heartbeats`, and `SANCHAY_APP_ROLE=worker`. In Plan 01 that role exits 1.
- `EdgeGuard` and the `x-sanchay-edge: app|ops` header.
- The 426 minimum-version check through `app_config`.
- The `/health/ready` checks for pg-boss and NAV age.
- Sentry with scrubbing, self-hosted per GAP-06 §5, on api, web and mobile.
- The KMS KeyService and Secrets Manager keyring (`SANCHAY_KEY_SERVICE=kms` stays refused).
- The MSG91 and SES adapters, DLT registration, and the `msg91`/`ses` provider modes.
- The session LRU and `sessions_epoch` (D-5).

**Infra and tooling**
- CDK nonprod, CloudFront ×3, WAF, dual-stack per P-06.
- `check-boundaries`, CODEOWNERS, AGENTS.md.
- ADR-0002 and ADR-0003. Plan 01 creates only the `docs/adr/0001-versions.md` stub, in A1.
- `gen:states` and `docs/specs/states.md`.
- The FP probe pack P-01..P-14.
- Bundle budgets.
- axe checks.
- EAS builds.
- Playwright and Maestro in CI. In Plan 01 they run locally only.

**Admin (GAP-07 shape: OIDC, 7 roles, `__Host-sanchay_ops`)**
- The `admin_users`, `admin_sessions` and `admin_approvals` tables are **moved out of B7 into Plan 02** (D-14).

**Legal and consent**
- The `legal_documents`, `consent_challenges`, `consent_records` and `consent_subjects` tables are **moved out of B8**. GAP-01 changes the consent model, and Plan 01 has no consumer for them (D-14).

**Product surface**
- `GET /me` (S4 onboarding). Clients use `GET /auth/session` instead.
- `/devices/consent-key`, `/devices/push-token`, contact change and bank change.
- ui batch-1 remainder: AmountInput, MoneyText, Sheet and the rest.
- Uniwind or NativeWind (ADR-0002). Plan 01 uses RN `StyleSheet` plus tokens.
- Domain rules: XIRR engine, FIFO, JCS.

**No B27+/C16+ tasks are added.** Every critical review issue (X-01..X-05) is fixed inside existing tasks (§9). X-09 (major) is resolved by the deferral list above.

---

## 2. Execution order and dependencies

### 2.1 DAG (task: prerequisites)

**Part A**

| Task | Needs |
|---|---|
| A1 | — |
| A2 | A1 |
| A3 | A2 |
| A4 | A3 |
| A5 | A4 |
| A6 | A5 |
| A7 | A6 |
| A8 | A7 |
| A9 | A3 |
| A10 | A9 |
| A11 | A10, A6 |
| A12 | A7 |
| A13 | A8, A11, A12 |

**Part B**

| Task | Needs |
|---|---|
| B1 | A2 |
| B2 | B1 |
| B3 | B1, B2 |
| B4 | B2 |
| B5 | A10, A12 (independent of B1–B4) |
| B6 | B1 |
| B7 | B6, A12 |
| B8 | B7 |
| B9 | B5, B1 |
| B10 | B2, B3, B4, B6, B9 |
| B11 | B10, B5 |
| B12 | B10, B6 |
| B13 | B10, B7 |
| B14 | B3, B7, B9, B13 |
| B15 | B14 |
| B16 | B3, B7, B9, B13 |
| B17 | B7, B3 |
| B18 | B9 |
| B19 | B5, B11 |
| B20 | B12, B17, B19 |
| B21 | B15, B16, B17, B18, B20 |
| B22 | B21 |
| B23 | B21 |
| B24 | B22 |
| B25 | B21, B19 |
| B26 | B24 |

**Part C**

| Task | Needs |
|---|---|
| C1 | A2 |
| C2 | B19 (final contract) |
| C3 | C2 |
| C4 | C1 |
| C5 | C4 |
| C6 | C3, A10 |
| C7 | C6 |
| C8 | C5, C7 |
| C9 | C8 |
| C10 | A2 |
| C11 | C9, C10 |
| C12 | C11, B26 |
| C13 | A2 |
| C14 | C9, C13 |
| C15 | C14, B26 |

### 2.2 Tasks that can run in parallel

- **Wave 1:** A1 → A2 (serial).
- **Wave 2:** A3–A8 (money chain), A9–A11 (validation, after A3), and B1–B4. C1, C10 and C13 are also available.
- **Wave 3:** A12, B5 (once A10 and A12 are done), and B6–B8.
- **Wave 4:** B9 → B10 → {B11, B12, B13} → {B14→B15, B16, B17, B18} → B19 → B20 → B21 → {B22, B23, B25} → B24 → B26.
- **Wave 5:**
  - C2 → C3 → C6 → C7 → C8 → C9 → C11 → C12
  - C4 → C5 (in parallel with C2/C3)
  - C14 → C15 once C9 and C13 are done
- **Always serial:** A13 (CI) runs last in Part A. B26 runs last in Part B. C12 and C15 need a running API from B26 plus Mailpit.

---

## 3. Workspace facts

### 3.1 Toolchain

| Item | Value |
|---|---|
| Node | 24.21.0 (`.node-version`). The machine currently has 24.13.1, so install first: nvm-windows `nvm install 24.21.0` then `nvm use 24.21.0`. |
| pnpm | 11.27.0 (`npm install --global pnpm@11.27.0`, `packageManager: "pnpm@11.27.0"`) |
| Other tools | turbo 2.11.4 · TypeScript 6.0.3 · Biome 2.5.14 · lefthook 2.1.14 · gitleaks 8.30.x (`winget install --id Gitleaks.Gitleaks -e`) · Docker Desktop (WSL2) · Maestro CLI 2.10.0 · actionlint 1.7.12 through Docker |
| Windows | `git config core.longpaths true`.<br>`subst S: C:\Users\pc\Desktop\sanchay` for local Android builds.<br>`.claude-flow/` is git-ignored and never touched. |

### 3.2 Root `package.json`

Name `sanchay`, `"private": true`, `"type": "module"`, engines `"node": ">=24.21.0 <25"`.

| Script | Command | Added by |
|---|---|---|
| build | `turbo run build` | A1 |
| typecheck | `turbo run typecheck` | A1 |
| test | `turbo run test` | A1 |
| lint | `biome ci .` | A2 |
| format | `biome check --write .` | A2 |
| verify | `pnpm lint && pnpm build && pnpm typecheck && pnpm test` | A2 |
| test:int | `turbo run test:int` | B6 |
| db:up | `docker compose up -d postgres mailpit` | B6 |
| db:migrate | `pnpm --filter=@sanchay/api db:migrate` | B26 |
| e2e:web | `turbo run e2e:web --filter=@sanchay/web` | C12 |

devDependencies: `@biomejs/biome`, `@sanchay/config` (`workspace:*`), `lefthook`, `turbo`, `typescript` (all `catalog:`).

### 3.3 `pnpm-workspace.yaml` (A1 writes the COMPLETE file; nobody else edits `catalog:` — this fixes X-06)

```yaml
packages:
  - apps/*
  - packages/*
  - tools/*

nodeLinker: hoisted
engineStrict: true

allowBuilds:            # pnpm 11: strictDepBuilds=true; replaces design's onlyBuiltDependencies (X-08)
  '@node-rs/argon2': true
  '@swc/core': true
  '@tailwindcss/oxide': true
  cpu-features: false   # testcontainers → ssh2 optional native addon, not needed
  esbuild: true
  lefthook: true
  msw: false            # postinstall only refreshes a service-worker file we do not use
  sharp: true           # next/image
  ssh2: false
  unrs-resolver: true

catalog:
  '@biomejs/biome': 2.5.14
  '@hookform/resolvers': 5.9.1
  '@nestjs/cli': 11.0.24
  '@nestjs/common': 11.2.6
  '@nestjs/config': 4.0.4
  '@nestjs/core': 11.2.6
  '@nestjs/platform-fastify': 11.2.6
  '@nestjs/testing': 11.2.6
  '@nestjs/throttler': 6.7.1
  '@orpc/client': 1.15.4
  '@orpc/contract': 1.15.4
  '@orpc/nest': 1.15.4
  '@orpc/openapi': 1.15.4
  '@orpc/openapi-client': 1.15.4
  '@orpc/server': 1.15.4
  '@orpc/tanstack-query': 1.15.4
  '@orpc/zod': 1.15.4
  '@playwright/test': 1.63.0
  '@swc/cli': 0.8.1
  '@swc/core': 1.16.2
  '@tailwindcss/postcss': 4.3.3
  '@tanstack/query-core': 5.103.2
  '@tanstack/react-query': 5.103.2
  '@testcontainers/postgresql': 12.1.0
  '@testing-library/dom': 10.4.2
  '@testing-library/react': 16.3.3
  '@testing-library/user-event': 14.6.7
  '@types/node': 24.13.6
  '@types/pg': 8.23.1
  '@types/react': 19.2.9
  '@types/react-dom': 19.2.7
  '@vitest/coverage-v8': 5.0.1
  babel-plugin-react-compiler: 1.0.0
  decimal.js: 10.6.0
  drizzle-kit: 0.31.11
  drizzle-orm: 0.45.3
  fast-check: 4.10.2
  fastify: 5.11.3
  jsdom: 30.1.1
  lefthook: 2.1.14
  light-my-request: 6.6.0
  msw: 2.15.0
  nestjs-cls: 7.0.1
  nestjs-pino: 5.2.0
  next: 16.3.6
  pg: 8.23.0
  pino: 10.3.1
  pino-http: 11.0.0
  react: 19.2.3
  react-dom: 19.2.3
  react-hook-form: 7.88.0
  react-native: 0.86.3
  react-native-web: 0.21.2
  reflect-metadata: 0.2.2
  rxjs: 7.8.2
  tailwindcss: 4.3.3
  turbo: 2.11.4
  typescript: 6.0.3
  unplugin-swc: 2.0.0
  uuid: 14.0.2
  vite: 7.3.6
  vitest: 5.0.1
  zod: 4.6.5
```

**Notes on the catalog**
- React is a single version, 19.2.3 (Expo 57 bundled; Next 16.3.6 peers `^19`).
- Expo modules are pinned directly in `apps/mobile/package.json` (§7.6), not in the catalog.
- Any `ERR_PNPM_IGNORED_BUILDS` naming an unlisted package: add an explicit entry (`true` only if a runtime binary is needed) and record it in `docs/adr/0001-versions.md`.
- There is no `.npmrc`. In pnpm 11 it is used only for auth and registry.
- pnpm 11's `minimumReleaseAge` default of 1 day is left as is.

### 3.4 `docs/adr/0001-versions.md` stub (A1)

A1 creates the stub with:
- the catalog table and the date retrieved (2026-09-25);
- the allowBuilds rationale;
- the pins outside design §A.2 (vite, fast-check, @nestjs/cli, @swc/*, @types/*, fastify, light-my-request, reflect-metadata, rxjs, unplugin-swc, jsdom, testing-library, babel-plugin-react-compiler, react-native-web 0.21.2).

Later tasks append rows only.

### 3.5 `turbo.json` (final state; owner task in brackets)

```json
{ "$schema": "https://turborepo.com/schema.json", "ui": "stream",
  "tasks": {
    "build":     { "dependsOn": ["^build"], "outputs": ["dist/**", ".next/**", "!.next/cache/**"], "env": ["SANCHAY_*", "EXPO_PUBLIC_*"] },
    "typecheck": { "dependsOn": ["^build"], "outputs": [], "passThroughEnv": ["SANCHAY_*"] },
    "test":      { "dependsOn": ["^build"], "outputs": ["coverage/**"], "passThroughEnv": ["SANCHAY_*"] },
    "dev":       { "dependsOn": ["^build"], "cache": false, "persistent": true },
    "test:int":  { "dependsOn": ["^build"], "cache": false },
    "db:check":  { "cache": false },
    "openapi":   { "dependsOn": ["^build"], "outputs": ["openapi.json"] },
    "e2e:web":   { "dependsOn": ["build"], "cache": false }
  } }
```

| Keys | Owner task |
|---|---|
| build/typecheck/test/dev | A1 |
| `env`/`passThroughEnv` | C11 |
| test:int, db:check | B6 |
| openapi | B11 |
| e2e:web | C12 |

`lint` is a root script, not a turbo task.

### 3.6 `@sanchay/config` (packages/config, no build)

`package.json` exports:

| Export | File |
|---|---|
| `"./biome"` | `./biome-preset.json` |
| `"./tsconfig/base.json"` | `./tsconfig/base.json` |
| `"./tsconfig/node-lib.json"` | `./tsconfig/node-lib.json` |
| `"./tsconfig/node-lib-build.json"` | `./tsconfig/node-lib-build.json` |
| `"./tsconfig/nest.json"` | `./tsconfig/nest.json` (added by **B1**) |
| `"./vitest"` | `./vitest/base.mjs` |

| Preset | Content |
|---|---|
| `base.json` | target ES2023, lib ES2023, strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes, noImplicitOverride, noFallthroughCasesInSwitch, verbatimModuleSyntax, isolatedModules, forceConsistentCasingInFileNames, skipLibCheck. **No** `noPropertyAccessFromIndexSignature`. |
| `node-lib.json` | extends base; module and moduleResolution NodeNext |
| `node-lib-build.json` | extends node-lib; composite, declarationMap, sourceMap |
| `nest.json` (B1) | extends node-lib; experimentalDecorators, emitDecoratorMetadata, `useDefineForClassFields: false`, `types: ["node"]` |
| `vitest/base.mjs` | `export const baseTestConfig = { test: { include: ['test/**/*.test.ts'], environment: 'node', coverage: { provider: 'v8', include: ['src/**/*.ts'], reporter: ['text','html'] } } }` |

### 3.7 Biome, lefthook and git attributes

**Root `biome.json` (A2):**
```json
{ "$schema": "./node_modules/@biomejs/biome/configuration_schema.json",
  "extends": ["@sanchay/config/biome"],
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true, "defaultBranch": "main" },
  "files": { "ignoreUnknown": true, "includes": ["**", "!apps/api/openapi.json", "!apps/api/drizzle/meta/**"] } }
```

**Preset `biome-preset.json`.** The file name must not be `biome.json`.
- formatter: space, 2, lineWidth 100, lf
- JavaScript: single quotes, semicolons always, trailingCommas all
- linter: recommended, plus `noUnusedImports`/`noUnusedVariables` error, `useImportType`/`useExportType`/`noNonNullAssertion` error, `noExplicitAny` error
- `assist.actions.source.organizeImports: "on"`

**`lefthook.yml`:**
- pre-commit: `biome` job (`pnpm exec biome check --write --no-errors-on-unmatched --files-ignore-unknown=true {staged_files}`, `stage_fixed: true`, glob `*.{js,mjs,cjs,ts,mts,cts,tsx,jsx,json,jsonc}`) and `gitleaks` (`gitleaks git --pre-commit --staged --redact --no-banner`).
- pre-push: `pnpm turbo run typecheck --filter=...[HEAD^]`.

**`.gitattributes`:** `* text=auto eol=lf`, `*.png binary`, `*.jpg binary`, `*.pdf binary`.

**`.gitignore`:**
- From A1: `node_modules/ dist/ coverage/ .vitest/ .turbo/ *.tsbuildinfo *.log .env .env.* !.env.example .DS_Store Thumbs.db .claude-flow/`
- Added by C11: `apps/web/.next/ apps/web/next-env.d.ts apps/web/playwright-report/ apps/web/test-results/`
- Added by C14: `apps/mobile/.expo/ apps/mobile/dist-export/ apps/mobile/android/ apps/mobile/ios/`
- `apps/api/drizzle/meta/` IS committed.

**Root `tsconfig.json`:** `{ "files": [], "references": [...] }`.

| Reference | Added by |
|---|---|
| `packages/money/tsconfig.build.json` | A3 |
| `packages/validation/tsconfig.build.json` | A9 |
| `packages/domain/tsconfig.build.json` | A12 |
| `packages/contract/tsconfig.build.json` | B5 |
| `packages/tokens/tsconfig.build.json` | C1 |
| `packages/api-client/tsconfig.build.json` | C2 |

### 3.8 CI (`.github/workflows/ci.yml`, workflow `ci`, job `verify`)

- **Owners:** A13 creates it. B26 extends it.
- **Triggers:** `pull_request`, and `push` to `main`.
- **Concurrency:** `ci-${{ github.ref }}`, cancel-in-progress. Permissions: `contents: read`. Runner `ubuntu-24.04`, timeout 20 minutes (B26 raises it to 30). Env `TURBO_TELEMETRY_DISABLED: 1`.
- **Actions:** `actions/checkout@v7`, `pnpm/action-setup@v6`, `actions/setup-node@v7` (with `node-version-file: .node-version`, `cache: pnpm`), `actions/cache@v6` for `.turbo/cache`.
- **Steps:**
  1. `pnpm install --frozen-lockfile`
  2. Lint: `pnpm lint`
  3. Build: `pnpm build`
  4. Typecheck: `pnpm typecheck`
  5. Test: `pnpm test`
  - The Build, Typecheck and Test steps carry `env: { SANCHAY_PLATFORM_ARN: ARN-000000 }` (X-07).
  - **B26 appends:** "Integration tests (Testcontainers)" `pnpm test:int` and "DB drift" `pnpm --filter=@sanchay/api db:check`.

---

## 4. Packages, entry points and exported symbols

| Package | Path | Build | `exports` |
|---|---|---|---|
| `@sanchay/config` | packages/config | none | see §3.6 |
| `@sanchay/money` | packages/money | `tsc -b tsconfig.build.json` → dist | `"."` → `{types: ./dist/index.d.ts, default: ./dist/index.js}` |
| `@sanchay/validation` | packages/validation | tsc -b → dist | `"."` (dist) |
| `@sanchay/domain` | packages/domain | tsc -b → dist | `"."` (dist) |
| `@sanchay/contract` | packages/contract | tsc -b → dist | `"."` and `"./openapi"` → `./dist/openapi.{d.ts,js}` |
| `@sanchay/api` | apps/api | `nest build -b swc` → dist (app) | none |
| `@sanchay/tokens` | packages/tokens | tsc -b → dist | `"."` (dist) and `"./theme.css"` → `./theme.css` |
| `@sanchay/api-client` | packages/api-client | tsc -b → dist | `"."` (dist) |
| `@sanchay/ui` | packages/ui | TSX source | `"."` → `./src/index.ts` |
| `@sanchay/app-core` | packages/app-core | TSX source | `"."` → `./src/index.ts`, `"./copy"` → `./src/copy.ts` |
| `@sanchay/features` | packages/features | TSX source | `"."` → `./src/index.ts` |
| `@sanchay/web` | apps/web | `next build` | none |
| `@sanchay/mobile` | apps/mobile | Expo (`main: expo-router/entry`) | none |

### 4.1 Build pattern for dist packages (A3/A9/A12 pattern; X-18 applies it to B5, C1, C2)

- `tsconfig.json` extends `@sanchay/config/tsconfig/node-lib.json` with `{ noEmit: true, types: ["node"] }`.
- `tsconfig.build.json` extends `node-lib-build.json` with `{ rootDir: "src", outDir: "dist", tsBuildInfoFile: "dist/.tsbuildinfo" }`, `include: ["src"]`, `exclude: ["src/**/*.test.ts"]`, and `references` to its workspace deps' `tsconfig.build.json`.
- Scripts: `"build": "tsc -b tsconfig.build.json"`, `"typecheck": "tsc -p tsconfig.json"`, `"test": "vitest run"` (money, validation and domain use `vitest run --coverage` with 95% thresholds).
- Vitest config: `mergeConfig(baseTestConfig, defineConfig({ test: { include: ['src/**/*.test.ts'] } }))` for packages that colocate tests (contract, tokens, api-client). money, validation and domain keep `test/`.
- Every package that runs Vitest has `vite: catalog:` in devDependencies, because Vitest 5 needs the vite peer.
- `@sanchay/api-client` overrides `lib: ["ES2023","DOM"]` to get the fetch types.

### 4.2 `@sanchay/money` (A3–A8) exports from `src/index.ts`

**Decimal core and value types**
- `Dec: Decimal.Constructor` (precision 64, ROUND_HALF_UP, no exponent notation)
- `Rounding = { UP:0, DOWN:1, CEIL:2, FLOOR:3, HALF_UP:4, HALF_EVEN:6 }`, `type RoundingMode`, `type DecimalInput = string | Decimal`
- `class DecimalError extends Error { code: DecimalErrorCode }`, where `DecimalErrorCode = 'NOT_A_DECIMAL_STRING'|'SCALE_EXCEEDED'|'OUT_OF_RANGE'|'SCALE_MISMATCH'|'NOT_POSITIVE'|'DIVISION_BY_ZERO'`
- `class Money`:
  - `SCALE=2`, `ZERO`, `parse(s)`, `parseNullable(s|null)`, `round(v, r)`
  - `add`, `subtract`, `multiply(f, r)`, `divide(d, r)`, `negate`, `abs`, `isMultipleOf(step)`
  - `compare(): -1|0|1`, `equals`, `gt`, `gte`, `lt`, `lte`, `isZero`, `isPositive`, `isNegative`
  - `toDecimal`, `toWire()` (`^-?\d{1,16}\.\d{2}$`), `toJSON`, `toString`, `kind:'Money'`
- `class Units` (`type UnitsScale = 3|4`): `parse(s, scale)`, `platform(s)`, `external(s)`, `zero(scale)`, `round(v, scale, r)`, `add`/`subtract` (throw SCALE_MISMATCH across scales), compare/sign helpers, `toWire`, `scale`, `kind:'Units'`
- `class Nav`: `SCALE=6`, `parse`, `parseNullable`, `toDecimal`, `toWire`, `kind:'Nav'`
- `marketValue(units, nav, r): Money`, `unitsForAmount(amount, nav, scale, r): Units`

**Formatting and display**
- `DASH='—'`, `groupIndian(digits)`
- `formatInr(v: Money|null, o?: {fractionDigits?: 0|2})`, `formatInrCompact(v)`, `formatInrEvidence(v)`, `formatUnits(v)`, `formatNav(v)`, `formatPct(v, o?: {signed?, fractionDigits?})`, types `FormatInrOptions`, `FormatPctOptions`
- `formatXirr` and its constants and types (§10)
- `parseIsoDateParts(s): IsoDateParts|null`, `IsoDateParts {year,month,day}`, `formatIsoDate(s|null)` → `'25 Sep 2026'`
- `holdingMoney(i: HoldingMoneyInput): HoldingMoney`, types `HoldingMoneyInput`, `HoldingMoney`, `HoldingMoneyKind`, `HoldingMoneyNote`
- `allocatePercentages(parts: readonly Money[], displayDigits?: 0|1|2): string[] | null`

### 4.3 `@sanchay/validation` (A9–A11)

- `VALIDATION_MESSAGES` (en-IN copy; keys `PAN_INVALID`, `MOBILE_INVALID`, `MOBILE_REPEATED_DIGITS`, `EMAIL_INVALID`, `EMAIL_TOO_LONG`, `IFSC_INVALID`, `PINCODE_INVALID`, `OTP_INVALID`, `AMOUNT_INVALID`, `AMOUNT_NOT_POSITIVE`, `MONEY_WIRE_INVALID`, `UNITS_WIRE_INVALID`, `EXTERNAL_UNITS_WIRE_INVALID`, `NAV_WIRE_INVALID`)
- Regexes: `PAN_REGEX`, `MOBILE_REGEX` (`^[6-9][0-9]{9}$`), `REPEATED_DIGITS_REGEX`, `IFSC_REGEX`, `PINCODE_REGEX`, `OTP_CODE_REGEX` (`^[0-9]{6}$`), `MONEY_WIRE_REGEX`, `UNITS_WIRE_REGEX`, `EXTERNAL_UNITS_WIRE_REGEX`, `NAV_WIRE_REGEX`
- Schemas: `panSchema`, `mobileSchema` (trim, regex, not all one digit), `emailSchema` (trim, lowercase, max 254, `z.email`), `ifscSchema`, `pincodeSchema`, `otpCodeSchema` (trim, 6 digits)
- `parseAmountInput(raw): Money|null`, `amountSchema(rules?: AmountRules)`, `AmountRules {min?, max?, multipleOf?}`, `type AmountIssueCode`
- `moneyWireSchema`, `nullableMoneyWireSchema`, `unitsWireSchema`, `externalUnitsWireSchema`, `navWireSchema`

### 4.4 `@sanchay/domain` (A12)

- `defineEnum`, `isOneOf`, `type EnumValue<T>`
- Enum constants, each with its type:

| Constant | Type |
|---|---|
| ASSET_CLASSES | AssetClass |
| CUTOFF_CLASSES | CutoffClass |
| VOLATILITY_CLASSES | VolatilityClass |
| SCHEME_PLAN_TYPES | SchemePlanType |
| SCHEME_OPTIONS | SchemeOption |
| TAX_CLASSES | TaxClass |
| NAV_GRADES | NavGrade |
| EXTERNAL_PLAN_TYPES | ExternalPlanType |
| ORDER_TYPES | OrderType |
| ORDER_ORIGINS | OrderOrigin |
| ORDER_MODES | OrderMode |
| PLAN_KINDS | PlanKind |
| PLAN_FREQUENCIES | PlanFrequency |
| PLAN_MODIFICATION_KINDS | PlanModificationKind |
| MANDATE_RAILS | MandateRail |
| PAYMENT_METHODS | PaymentMethod |
| PAYOUT_STATUSES | PayoutStatus |
| REFUND_STATUSES | RefundStatus |
| UNITS_SOURCES | UnitsSource |
| LOT_TYPES | LotType |
| GAIN_TYPES | GainType |
| REPORT_KINDS | ReportKind |
| REPORT_FORMATS | ReportFormat |
| INVESTOR_STATUSES | InvestorStatus |
| KYC_STATUSES | KycStatus |
| ONBOARDING_STEP_STATUSES | OnboardingStepStatus |
| KYC_PATHS | KycPath |
| GENDERS | Gender |
| MARITAL_STATUSES | MaritalStatus |
| PEP_STATUSES | PepStatus |
| TAX_STATUSES | TaxStatus |
| NOMINATION_DECISIONS | NominationDecision |
| NOMINEE_ID_TYPES | NomineeIdType |
| CONTACT_KINDS | ContactKind |
| FOLIO_RECONCILIATION_STATUSES | FolioReconciliationStatus |
| FOLIO_SERVICE_REQUEST_KINDS | FolioServiceRequestKind |
| CLIENT_PLATFORMS `['WEB','ANDROID','IOS']` | ClientPlatform |
| INITIATED_VIA | InitiatedVia |
| OTP_PURPOSES `['LOGIN','LOGIN_NEW_DEVICE_EMAIL','EMAIL_VERIFY','CONTACT_CHANGE_OLD','CONTACT_CHANGE_NEW','CONSENT']` | OtpPurpose |
| OTP_CHANNELS `['SMS','EMAIL']` | OtpChannel |
| SECOND_FACTORS | SecondFactor |
| CONSENT_SUBJECT_TYPES | ConsentSubjectType |
| ADMIN_ROLES | AdminRole |
| NOTIFICATION_CATEGORIES | NotificationCategory |
| LEGAL_DOCUMENT_KEYS | LegalDocumentKey |

- **A12 changes:**
  - `ADMIN_ROLES = ['SUPER_ADMIN','OPS','COMPLIANCE','SUPPORT','CONTENT','ENGINEER','AUDITOR']` (GAP-07).
  - Add `MAX_NOMINEES = 3` (PO-7; comment citing SEBI/HO/OIAE/OIAE_IAD-3/P/CIR/2026/12676, 29-May-2026).
  - Add `LAUNCH_SCHEME_OPTIONS = defineEnum(['GROWTH'])` (PO-3).
  - The enums test pins these.
  - `NOMINEE_ID_TYPES` keeps `AADHAAR_LAST4`, flagged (Part A deviation 4, ESC-6).
- Ids: `type Brand<T,B>`, `type Isin`, `type IsoDate`, `ISIN_REGEX`, `isIsin`, `toIsin`, `isIsoDate`, `toIsoDate`.

### 4.5 `@sanchay/contract` (B5 + B19)

- **Dependencies:** `@orpc/contract`, `@orpc/openapi`, `@orpc/zod`, `zod`, `@sanchay/validation`, `@sanchay/domain`. `tsconfig.build.json` references `../validation` and `../domain`.
- **`common.ts`:**
  - `MobileSchema = mobileSchema`, `EmailSchema = emailSchema`, `OtpCodeSchema = otpCodeSchema` (re-exported from `@sanchay/validation`; X-02(5); D-9 superseded)
  - `PlatformSchema = z.enum(CLIENT_PLATFORMS)`, `type Platform = ClientPlatform` (X-16)
  - `InstantSchema = z.iso.datetime()`, `OkSchema = z.object({ ok: z.literal(true) })`
- **`errors.ts`:** `ERROR_CATALOGUE` (62 codes, §5.11), `type ErrorCode`, `isErrorCode`, `FieldErrorSchema`/`FieldError {path, code, message}`, `ErrorDataSchema`/`ErrorData {retryable: boolean; requestId: string; fields?; providerCode?; retryAfterSeconds?: int≥0}`, `errorMap(...codes)` (each entry is `{status, message: code, data: ErrorDataSchema}`), `COMMON_ERRORS = ['VALIDATION_FAILED','ORIGIN_REJECTED','RATE_LIMITED','INTERNAL']`, `SESSION_ERRORS = ['AUTH_REQUIRED','SESSION_EXPIRED']`
- **`health.ts`:** `healthContract`
- **`auth.ts`:** `authContract`, `OtpSentSchema`, `SessionInfoSchema`, `SignedInSchema`, `StepUpRequiredSchema`, `VerifyOtpResultSchema`, `EmailFallbackSentSchema`, `SessionSummarySchema`, `SessionListItemSchema`, plus type aliases (`z.infer`): `OtpSent`, `SignedInResult`, `StepUpRequiredResult`, `VerifyOtpResult`, `EmailFallbackSent`, `SessionSummary`, `SessionListItem`
- **`me.ts`:** `meContract`, `EmailVerifiedSchema` (`{emailMasked: string, emailVerifiedAt: Instant}`), `type EmailVerified`
- **`index.ts`:** re-exports all of the above, plus `contract = { health: healthContract, auth: authContract, me: meContract }` and `type Contract`
- **`openapi.ts`:** `generateOpenApiDocument(): Promise<OpenAPI doc>`, built with `new OpenAPIGenerator({ schemaConverters: [new ZodToJsonSchemaConverter()] })` (converter from `@orpc/zod/zod4`) and `.generate(contract, { info: { title: 'Sanchay API', version: '1.0.0' }, servers: [{ url: '/api/v1' }] })`

### 4.6 `@sanchay/tokens` (C1)

- `color` (keys `bg surface text muted primary onPrimary gain loss warn border inputBorder`; values `#FFFFFF #F6F7F9 #0B1220 #4A5568 #0B5FFF #FFFFFF #0A7A3D #C0262D #8A5A00 #D5DAE1 #6B7280`), `type ColorToken`
- `fontSize`/`lineHeight` (`xs sm md lg xl xxl` = 12/16, 14/20, 16/24, 20/28, 24/32, 32/40), `fontWeight` (`regular '400' medium '500' semibold '600' bold '700'`), `fontFamilyWeb`
- `spacingUnit=4`, `space(steps)`, `radius {sm:6, md:12, pill:999}`, `minTouchTarget=48`
- `relativeLuminance(hex)`, `contrastRatio(a,b)`
- `theme.css` (Tailwind v4 `@theme`: `--color-*`, including `--color-on-primary` and `--color-input-border`, `--font-sans`, `--text-*` with line heights, `--radius-*`, `--spacing: 4px`)

### 4.7 `@sanchay/api-client` (C2, C3)

- `API_PREFIX='/api/v1'`
- `type SanchayClientContext = { idempotencyKey?: string }`
- `type ApiClient = JsonifiedClient<ContractRouterClient<typeof contract, SanchayClientContext>>`
- `type FetchLike = (input: Request, init?: RequestInit) => Promise<Response>`
- `createWebApiClient(o: WebApiClientOptions): ApiClient`, where `WebApiClientOptions = { origin?: () => string; onUnauthenticated: () => void; fetchImpl?: FetchLike }`. It uses base `${origin()}/api/v1`, `credentials:'same-origin'`, and header `x-sanchay-client: web`.
- `createNativeApiClient(o: NativeApiClientOptions): ApiClient`, where `NativeApiClientOptions = { baseUrl: string; appVersion: string; platform: 'android'|'ios'; getSessionToken(): Promise<string|null>; getInstallationId(): Promise<string>; onUnauthenticated: () => void; fetchImpl?: FetchLike }`. It uses `credentials:'omit'` and these headers (X-01):
  ```ts
  { 'x-sanchay-client': options.platform, 'x-app-version': options.appVersion, 'x-installation-id': installationId, ...(token ? { authorization: `Bearer ${token}` } : {}) }
  ```
  There is no `x-plz-platform` / `x-sanchay-platform`.
- Both clients add `idempotency-key: <context.idempotencyKey>` when it is present. An `onError` interceptor calls `onUnauthenticated()` for `AUTH_REQUIRED` or `SESSION_EXPIRED`.
- `newIdempotencyKey(random16?: Uint8Array): string` (UUIDv7)
- `createApiUtils(client)` (`createTanstackQueryUtils`), `type ApiUtils`
- `interface ApiError {code; status; message; retryable; requestId: string|null; fields: readonly ApiFieldError[]}`, `ApiFieldError {path; code; message}`, `toApiError(e: unknown): ApiError`, `NETWORK_ERROR='NETWORK_ERROR'`, `SESSION_ERROR_CODES` (`Set {'AUTH_REQUIRED','SESSION_EXPIRED'}`), `isSessionError(e)`

### 4.8 `@sanchay/ui` (C4, C5)

| Component | Props |
|---|---|
| `AppText` | `{variant?: 'title'\|'heading'\|'body'\|'caption'; tone?: 'default'\|'muted'\|'primary'\|'danger'\|'inverse'} & TextProps`. title/heading get `role="heading"`. |
| `Button` | `{label; onPress; variant?: 'primary'\|'secondary'; disabled?; loading?; testID?}` |
| `Card` | `{children; testID?}` |
| `Screen` | `{children; testID?}` |
| `TextField` | `Omit<TextInputProps,'style'\|'aria-label'\|'placeholderTextColor'> & {label; error?; hint?; prefix?}` |
| `OtpInput` | `{label; value; onChangeText; onComplete?; error?; testID?; autoFocus?}`. `OTP_LENGTH=6`, `sanitizeOtp(raw)`, `autoComplete` `sms-otp` (Android) / `one-time-code`, `textContentType oneTimeCode`. |
| `Banner` | `{tone:'error'\|'info'; message}`. error gets `role="alert"`. |

Types: `AppTextProps`, `AppTextTone`, `AppTextVariant`, `ButtonProps`, `ButtonVariant`, `CardProps`, `ScreenProps`, `TextFieldProps`, `OtpInputProps`, `BannerProps`.

### 4.9 `@sanchay/app-core` (C6, C7)

**Dependencies:** `@sanchay/api-client`, `@sanchay/contract`, `@sanchay/validation`, `zod`. Peers: `@tanstack/react-query ^5.103.2`, `react ^19.2.0`.

**Exports**
- `messageForError(code?: string|null): string`, `DEFAULT_ERROR_MESSAGE='Something went wrong. Please try again.'`. Copy map:
  - VALIDATION_FAILED, AUTH_REQUIRED, SESSION_EXPIRED, OTP_INVALID, OTP_EXPIRED, OTP_LOCKED, OTP_COOLDOWN, RATE_LIMITED, STEP_UP_REQUIRED, SMS_UNAVAILABLE, FORBIDDEN, NOT_FOUND and NETWORK_ERROR keep the draft copy.
  - `APP_VERSION_UNSUPPORTED`: 'Please update the Sanchay app to continue.'
  - Added: `PROVIDER_UNAVAILABLE` 'We could not send the code right now. Please try again in a few minutes.'; `CONFLICT_VERSION` 'Something changed while you were signing in. Please try again.'; `ORIGIN_REJECTED` 'Please refresh the page and try again.'
- `mobileFormSchema = z.object({ mobile: mobileSchema })`, `otpFormSchema = z.object({ code: otpCodeSchema })` (from `@sanchay/validation`), types `MobileFormValues`, `OtpFormValues`
- `formatCountdown(s)` → `m:ss`
- `createQueryClient(): QueryClient` (staleTime 30 s, no refetch on focus, retry < 2 only when `toApiError(e).retryable`, mutations never retry)
- `@sanchay/app-core/copy`:
  - `MARKET_RISK_WARNING = 'Mutual fund investments are subject to market risks, read all scheme related documents carefully.'`
  - `REGULAR_PLAN_NOTICE = 'Sanchay offers Regular plans of mutual funds; Platizio, the distributor, earns a commission from the fund house.'`
- `useOtpLogin` family (§7.3): `useOtpLogin`, `authApiFrom`, types `AuthApi`, `OtpLoginStep`, `SessionOutcome`, `UseOtpLogin`, `UseOtpLoginOptions`

### 4.10 `@sanchay/features` (C8, C9)

- `NavAdapter {push(href); replace(href); back(); onSignedIn(next: string|null); onSignedOut()}`, `NavProvider`, `useNav`
- `SessionPersistence {saveSessionToken(t): Promise<void>; clearSessionToken(): Promise<void>}`, `PlatformAdapters {session: SessionPersistence; privacyNoticeUrl: string}` (**`deviceRef` removed**), `PlatformProvider`, `usePlatform`
- `ApiProvider({client})`, `useApi(): ApiContextValue {client; utils; auth}`
- Screens: `LoginScreen({mode:'login'|'signup'; next?})`, `WelcomeScreen({onCreateAccount; onLogIn})`, `HomeScreen()`, `AppShell({children})`
- `useSignOut(): {run(): Promise<void>; pending}`
- Types: `ApiContextValue`, `LoginScreenProps`, `WelcomeScreenProps`

---

## 5. API (apps/api)

### 5.1 Ports and hosts

| Thing | Local | Production (plan of record; see ESC-1) |
|---|---|---|
| API | `http://localhost:3000` (`PORT=3000`); Android emulator `http://10.0.2.2:3000` | web: same-origin `https://app.sanchay.in/api/v1`; native: `https://api.sanchay.in/api/v1` |
| Web (Next) | `http://localhost:3001` (`next dev/start --port 3001`); rewrites `/api/v1/*` → `SANCHAY_API_ORIGIN` | www: `https://www.sanchay.in`; app: `https://app.sanchay.in` |
| Postgres | `localhost:55432` → container 5432 | RDS |
| Mailpit | UI/API `http://localhost:8025`; SMTP 1025 | — |
| Metro | 8081 | — |
| Admin | not in Plan 01 (reserve port 3002, host `ops.sanchay.in`) | — |

API prefix: `app.setGlobalPrefix('api/v1')`. The constant `API_PREFIX = 'api/v1'` lives in `bootstrap.ts`.

### 5.2 Environment (`src/config/env.ts`; D-15: every app-defined variable is prefixed `SANCHAY_` except the platform/tooling conventions `DATABASE_URL`, `PORT`, `HOST`)

| Var | Type / values | Default | `.env.example` (local) |
|---|---|---|---|
| `SANCHAY_APP_ENV` | `local\|test\|dev\|staging\|prod` | required | `local` |
| `SANCHAY_APP_ROLE` | `api\|worker\|migrate` | `api` | `api` |
| `HOST` | string | `0.0.0.0` | — |
| `PORT` | int 1..65535 | **3000** | `3000` |
| `SANCHAY_LOG_LEVEL` | `fatal\|error\|warn\|info\|debug\|trace\|silent` | `info` | `debug` |
| `DATABASE_URL` | url, `postgres(ql)` | required | `postgres://sanchay:sanchay_local_only@localhost:55432/sanchay` |
| `SANCHAY_DB_POOL_MAX` | int 2..100 | 10 | — |
| `SANCHAY_APP_ORIGIN` | url, http(s) | required | `http://localhost:3001` |
| `SANCHAY_TRUST_EDGE_HEADERS` | stringbool | false | `false` |
| `SANCHAY_KEY_SERVICE` | `local\|kms` | `local` | `local` |
| `SANCHAY_LOCAL_PII_KEY`, `SANCHAY_LOCAL_BIDX_KEY`, `SANCHAY_OTP_PEPPER`, `SANCHAY_AUTH_TOKEN_KEY` | base64 of exactly 32 bytes; required when KEY_SERVICE=local | — | blank (generate with `node -p "require('node:crypto').randomBytes(32).toString('base64')"`) |
| `SANCHAY_PROVIDER_MODE_SMS` | `capture\|mailpit` (Plan 02 adds `msg91`) | `capture` | `mailpit` |
| `SANCHAY_PROVIDER_MODE_EMAIL` | `capture\|mailpit` (Plan 02 adds `ses`) | `capture` | `mailpit` |
| `SANCHAY_MAILPIT_URL` | url | `http://localhost:8025` | `http://localhost:8025` |
| `SANCHAY_SMS_RETRIEVER_HASH` | `^[A-Za-z0-9+/]{11}$`; optional in local/test, required elsewhere (invariant 7, R-10) | — | — |
| `SANCHAY_THROTTLE_PER_MINUTE` | int 1..10000 | 120 | `120` |
| `SANCHAY_OTP_PER_IP_PER_HOUR` | int > 0 (X-11) | 20 | `1000` (local only; all web traffic arrives from 127.0.0.1 through the Next rewrite) |

**`assertBootInvariants(env)` throws `EnvError`**, with messages the tests match by regex:
1. `prod` with a capture/mailpit provider → "fake SMS/email providers (capture, mailpit) are refused in prod".
2. dev/staging/prod with `SANCHAY_KEY_SERVICE=local` → "the local keyring is refused outside local/test".
3. `SANCHAY_KEY_SERVICE=kms` → "SANCHAY_KEY_SERVICE=kms is not available in this build".
4. Missing local keys → "SANCHAY_KEY_SERVICE=local requires SANCHAY_…".
5. **New:** `SANCHAY_OTP_PER_IP_PER_HOUR !== 20` when `SANCHAY_APP_ENV` ∉ {local, test} → "SANCHAY_OTP_PER_IP_PER_HOUR must be 20 outside local/test".
6. and 7. See the delta half §5.2 (6: `SANCHAY_CLIENT_IP_SOURCE` must be alb; 7, R-10: `SANCHAY_SMS_RETRIEVER_HASH` is required outside local/test). The delta half overrides this list.

`main.ts` and `cli/migrate.ts` call `process.loadEnvFile('.env')` only if `.env` exists, and process env must win. The implementer verifies Node's no-override behaviour. If Node does override, load the file into a temporary object and fill only the missing keys.

**Test env** (`test/int/env.ts`):
- `TEST_APP_ORIGIN = 'https://app.sanchay.test'`
- `testEnv(url, overrides)` sets: APP_ENV `test`, TRUST_EDGE_HEADERS `true`, KEY_SERVICE `local`, keys `Buffer.alloc(32, 1..4)`, providers `capture`, LOG_LEVEL `silent`
- `testKeyService(env)`

### 5.3 Docker compose (`compose.yaml` at repo root, B6)

```yaml
name: sanchay
services:
  postgres:
    image: postgres:18.6-trixie
    environment: { POSTGRES_USER: sanchay, POSTGRES_PASSWORD: sanchay_local_only, POSTGRES_DB: sanchay }
    ports: ["55432:5432"]
    volumes: [sanchay-pg:/var/lib/postgresql]
    healthcheck: { test: ["CMD-SHELL", "pg_isready -U sanchay -d sanchay"], interval: 5s, timeout: 3s, retries: 20 }
  mailpit:
    image: axllent/mailpit:v1.31.2
    ports: ["8025:8025", "1025:1025"]
volumes:
  sanchay-pg: {}
```

**Testcontainers:**
- `postgres:18.6-trixie`, user `sanchay`, password `sanchay_test_only`, template database `sanchay_template`.
- One cloned database per test file, named `t_<12 hex>` (`CREATE DATABASE … TEMPLATE`).
- Provided context keys: `pgAdminUrl`, `pgTemplateDb`.

### 5.4 Drizzle and migrations

- **`apps/api/drizzle.config.ts`:** `dialect 'postgresql'`, `schema './src/modules/*/*.schema.ts'`, `out './drizzle'`, `schemaFilter ['app']`, `migrations { schema: 'drizzle', table: '__drizzle_migrations' }`, `strict`, `verbose`.
- **DB schema:** `app`. Migrations table: `drizzle.__drizzle_migrations`.
- **Migration files:**

| File | Kind | Content |
|---|---|---|
| `0000_bootstrap.sql` | custom (`drizzle-kit generate --custom --name=bootstrap`) | Extensions `citext`, `pg_trgm`, `btree_gin`, `pg_stat_statements`. Roles `sanchay_app`, `sanchay_retention`, `sanchay_readonly` (NOLOGIN, created if missing). |
| `0001_platform.sql` | generated `--name=platform` | `CREATE SCHEMA app`; `app.audit_events` |
| `0002_identity.sql` | generated `--name=identity` | investor identity tables (§5.5) |
| `0003_grants.sql` | custom `--name=grants` | `GRANT USAGE ON SCHEMA app TO sanchay_app, sanchay_retention, sanchay_readonly`; `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO sanchay_app`; `ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sanchay_app`; `REVOKE UPDATE, DELETE ON app.audit_events FROM sanchay_app` |

- **Scripts:**
  - `db:generate` = `drizzle-kit generate`
  - `db:check` = `node scripts/db-check.ts`: runs `drizzle-kit check` plus a generate with `--name=drift_check`, and fails if the journal or the files changed. It prints `db:check OK: schema and migrations are in sync`.
  - `db:migrate` = `nest build -b swc && node dist/cli/migrate.js`

### 5.5 Tables created in Plan 01 (`+std` = `created_at`/`updated_at timestamptz(6) NOT NULL DEFAULT now()`, `version int NOT NULL DEFAULT 0`; `+actor` = `created_by`/`updated_by text NOT NULL`)

Ids come from `newId(table)` through `$defaultFn`. A `DEFAULT uuidv7()` backstop is added only on `audit_events`, `auth_sessions` and `otp_codes`.

**Helpers in `src/db/app-schema.ts`:**
- `appSchema = pgSchema('app')`
- `bytea` and `citext` custom types
- `tstz(name)`: timestamptz, precision 6, mode date
- `stdColumns()`, `actorColumns()`
- `dbUuidv7 = sql\`uuidv7()\``
- `inList(column, values)`: `CHECK (col IN (...))`

**CHECK lists come from `@sanchay/domain` (X-16):**
- `INVESTOR_STATUSES`, `CONTACT_KINDS`, `CLIENT_PLATFORMS` (used for the platform columns), `OTP_PURPOSES`, `OTP_CHANNELS`

**API-local constants (in `identity.schema.ts` and `platform.schema.ts`):**
- `CONTACT_STATUSES = ['CURRENT','PREVIOUS','REVOKED']`
- `SESSION_REVOKE_REASONS = ['LOGOUT','ADMIN','ACCOUNT_CLOSED','IDLE','CONTACT_CHANGED','BANK_CHANGED','DEVICE_REVOKED','FRAUD_HOLD']`
- `OTP_CONSUMED_REASONS = ['VERIFIED','EXPIRED','LOCKED','SUPERSEDED']`
- `OTP_PROVIDERS = ['MSG91','SES']`
- `AUDIT_ACTOR_TYPES = ['INVESTOR','ADMIN','SYSTEM','ANONYMOUS']` (D-12)

**Types:** `identity.schema.ts` re-exports `InvestorStatus`, `OtpPurpose` and `OtpChannel` from domain, and defines `SessionRevokeReason`. `platform.schema.ts` defines `AuditActorType` and `AuditValue = string|number|boolean|null`.

| Table (Drizzle name) | Columns | Constraints and indexes |
|---|---|---|
| `app.audit_events` (`auditEvents`), append-only | id uuid PK; occurred_at tstz NOT NULL default now(); actor_type text NOT NULL; actor_id text; action text NOT NULL; entity_type text; entity_id text; request_id text; ip inet; user_agent text; data jsonb NOT NULL default `{}` (`Record<string, AuditValue>`); reason text | `audit_events_actor_type_ck`; `audit_events_entity_idx (entity_type, entity_id)`; `audit_events_occurred_at_idx (occurred_at)` |
| `app.investors` (`investors`) +std +actor | id; status text NOT NULL default 'ACTIVE'; mobile_enc bytea NOT NULL; mobile_bidx bytea NOT NULL; mobile_last4 char(4) NOT NULL; mobile_verified_at tstz NOT NULL; email_enc bytea; email_bidx bytea; email_masked text; email_verified_at tstz; display_name text; first_order_at tstz; closed_at tstz; can_purchase bool NOT NULL default false; can_exit bool NOT NULL default false; purchase_block_reason text; exit_block_reason text; last_contact_change_at tstz; last_bank_change_at tstz; fp_investor_profile_id text; fp_mf_investment_account_id text; fp_mfia_old_id bigint; fp_phone_id text; fp_email_id text; fp_address_id text | `investors_mobile_bidx_uq`; `investors_email_bidx_uq`; `investors_fp_investor_profile_id_uq`; `investors_fp_mfia_id_uq`; `investors_status_ck`; `investors_mobile_last4_ck (~ '^[0-9]{4}$')`; `investors_email_pair_ck ((email_enc IS NULL) = (email_bidx IS NULL))` |
| `app.investor_contacts` (`investorContacts`) +std | id; investor_id uuid NOT NULL → investors RESTRICT; kind text NOT NULL; value_enc bytea NOT NULL; value_bidx bytea NOT NULL; masked text NOT NULL; verified_at tstz NOT NULL; status text NOT NULL; superseded_at tstz | `investor_contacts_kind_ck`; `investor_contacts_status_ck`; `investor_contacts_value_uq (investor_id, kind, value_bidx)`; `investor_contacts_current_uq (investor_id, kind) WHERE status='CURRENT'` |
| `app.investor_devices` (`investorDevices`) +std | id; investor_id → investors RESTRICT; platform text NOT NULL; device_ref_hash bytea NOT NULL (web: SHA-256 of the `__Host-sanchay_dev` value; native: SHA-256 of the lower-cased installation id); app_version; os_version; push_token_enc bytea; consent_key_enc bytea; consent_key_registered_at; trusted_at; last_seen_at; revoked_at (all tstz) | `investor_devices_platform_ck`; `investor_devices_ref_uq (investor_id, device_ref_hash)` |
| `app.auth_sessions` (`authSessions`) +std | id (with the uuidv7 backstop); investor_id → investors; device_id → investor_devices NOT NULL; platform; token_hash bytea NOT NULL; idle_expires_at tstz NOT NULL; absolute_expires_at tstz NOT NULL; revoked_at tstz; revoke_reason text; ip inet; user_agent text; last_used_at tstz | `auth_sessions_token_hash_uq`; `auth_sessions_platform_ck`; `auth_sessions_revoke_reason_ck`; `auth_sessions_revoked_pair_ck`; `auth_sessions_expiry_order_ck (idle ≤ absolute)`; `auth_sessions_investor_live_idx (investor_id) WHERE revoked_at IS NULL` |
| `app.otp_codes` (`otpCodes`) | id (backstop); created_at tstz NOT NULL default now(); purpose; channel; destination_bidx bytea NOT NULL; destination_masked text NOT NULL; reference_id uuid; code_hmac bytea NOT NULL; attempts smallint NOT NULL default 0; expires_at tstz NOT NULL; consumed_at tstz; consumed_reason text; ip inet; **device_ref_hash bytea (D-1)**; provider text; provider_message_id text; template_id text; dlr_status text; dlr_at tstz | `otp_codes_purpose_ck`; `otp_codes_channel_ck`; `otp_codes_attempts_ck (0..5)`; `otp_codes_consumed_reason_ck`; `otp_codes_consumed_pair_ck`; `otp_codes_provider_ck`; `otp_codes_live_scope_uq (purpose, destination_bidx, coalesce(reference_id,'00000000-0000-0000-0000-000000000000'::uuid)) WHERE consumed_at IS NULL`; `otp_codes_destination_created_idx`; `otp_codes_ip_created_idx`; `otp_codes_device_created_idx` |

`src/db/schema.ts` re-exports identity and platform schemas. **Not in Plan 01:** admin_users, admin_sessions, admin_approvals, legal_documents, consent_* (D-14).

`TableName` union (B1): `'audit_events'|'auth_sessions'|'investor_contacts'|'investor_devices'|'investors'|'otp_codes'`. Plan 02 extends it.

### 5.6 Provider modes and fake senders (how tests and e2e read OTPs)

`IntegrationsModule.forRoot(env)` selects the adapters:

| Mode | SMS adapter | Email adapter | Used by |
|---|---|---|---|
| `capture` (default) | `CaptureSmsSender` | `CaptureEmailSender` | unit and integration tests |
| `mailpit` | `MailpitSmsSender(env.SANCHAY_MAILPIT_URL)` | `MailpitEmailSender(...)` | local dev, Playwright, Maestro |

**Capture senders**
- Fields: `outbox: Array<Message & {messageId}>`, `failNext: boolean` (the next send throws `SenderUnavailableError`), `latestCode(to): string` (first `\b(\d{6})\b` in the latest message to that recipient).
- Integration tests read OTPs through `TestApp.sms.latestCode(mobile)` and `TestApp.email.latestCode(email)`, where `app.get(SMS_SENDER)` and `app.get(EMAIL_SENDER)` are the capture senders.

**Mailpit SMS:** `POST {MAILPIT}/api/v1/send` with
`{ From: {Email:'sms-gateway@sanchay.local', Name:'Sanchay SMS (local)'}, To: [{Email:'sms-<10-digit mobile>@sanchay.local'}], Subject: 'SMS [<templateId>]', Text: <sms text> }`.
The response is `{ID}`, which becomes `messageId`. A non-2xx response throws `SenderUnavailableError`.

**Mailpit email:** From `noreply@sanchay.local` ("Sanchay (local)"), To the real address, Subject and Text from the template.

**How e2e reads the OTP (there is NO API dev endpoint; X-05):**
1. `GET {MAILPIT}/api/v1/search?query=to:"sms-<mobile>@sanchay.local"&limit=1` returns `messages[0].ID` and `messages[0].Created`.
2. `GET {MAILPIT}/api/v1/message/<ID>` returns `.Text`.
3. Apply `/\b(\d{6})\b/`.

Verify the search syntax and the field names against the Mailpit v1 API before relying on them (C12 Step 1).

**Ports and templates**
- `SendResult {provider: 'MSG91'|'SES'|null; messageId}`.
- `SmsMessage {to; text; templateId}`, `SmsSender`, `SMS_SENDER`.
- `EmailMessage {to; subject; text; templateId}`, `EmailSender`, `EMAIL_SENDER`.
- `SenderUnavailableError`.
- `OTP_TEMPLATE_IDS = { LOGIN_SMS: 'SANCHAY_LOGIN_OTP_V1', EMAIL_OTP: 'SANCHAY_EMAIL_OTP_V1' }`.
- `WEBOTP_DOMAIN = 'app.sanchay.in'` (a single constant so ESC-1 can flip it).
- `loginSmsText(code, retrieverHash?)` = `` `${code} is your Sanchay login OTP. Never share it; Sanchay staff never ask for it. @${WEBOTP_DOMAIN} #${code}` ``, plus `\n<hash>` when a retriever hash is given.
- `emailOtpMessage(code, purpose)` returns `{ subject: 'Your Sanchay verification code', text: \`${code} is your code to ${EMAIL_ACTION[purpose]}. It expires in 5 minutes. Never share it; Sanchay staff never ask for it.\` }`. EMAIL_ACTION values:
  - LOGIN: 'sign in to Sanchay'
  - LOGIN_NEW_DEVICE_EMAIL: 'confirm sign-in on a new device'
  - EMAIL_VERIFY: 'verify your email address'
  - CONTACT_CHANGE_OLD: 'confirm a contact change'
  - CONTACT_CHANGE_NEW: 'confirm your new contact details'
  - CONSENT: 'approve your transaction'
- `maskMobile(m)` → `'••••••' + last4` (six U+2022 characters). `maskEmail(e)` → `first char + '•••' + '@domain'` (lower-cased).

### 5.7 Module list and folder layout

```
apps/api/
  package.json .swcrc nest-cli.json tsconfig.json drizzle.config.ts vitest.shared.ts vitest.config.ts vitest.int.config.ts .env.example openapi.json
  scripts/openapi.ts scripts/db-check.ts                  (run by Node 24 type stripping)
  drizzle/0000_bootstrap.sql 0001_platform.sql 0002_identity.sql 0003_grants.sql meta/
  src/main.ts bootstrap.ts app.module.ts openapi.test.ts
  src/cli/migrate.ts
  src/config/env.ts app-config.ts
  src/db/app-schema.ts client.ts schema.ts migrate.ts
  src/integrations/integrations.module.ts sms/{port,fake}.ts email/{port,fake}.ts
  src/modules/platform/ ids clock key-service crypto logging errors pg-errors api-exception.filter request-context orpc
                        platform.module health.router audit.service cookies http-decorators client.guard throttle platform.schema (.ts)
  src/modules/identity/ identity.schema masking otp.templates otp.service investor-accounts.service device-trust.service
                        session.service step-up-token request-auth session.guard account-sessions.service session.router
                        auth.service login.router contact-email.service me.router identity.module (.ts)
  test/setup.ts ('reflect-metadata')
  test/int/ global-setup db pg env app factories otp-fixture http flows (.ts) + *.int.test.ts
```

**`app.module.ts` (final state)**
- `AppModule.forRoot(env)` imports, in order:
  1. `ConfigModule.forRoot({isGlobal, ignoreEnvFile, load:[()=>env]})`
  2. `LoggerModule.forRoot({pinoHttp: buildPinoHttpOptions(env)})`
  3. `ClsModule.forRoot({global, middleware:{mount, generateId, idGenerator: raw.id ?? uuidv7(), setup: ip/userAgent/client:null/auth:null}})`
  4. `ThrottlerModule.forRoot({throttlers:[{name:'default', ttl:60_000, limit: env.SANCHAY_THROTTLE_PER_MINUTE}], getTracker: throttleTracker, generateKey: throttleKey})`
  5. `ORPCModule.forRootAsync({inject:[ClsService, Logger], useFactory: buildOrpcConfig})`
  6. `PlatformModule.forRoot(env)` (global: AppConfig, CLOCK, KEY_SERVICE, Crypto, DB, AuditService)
  7. `IntegrationsModule.forRoot(env)` (global: SMS_SENDER, EMAIL_SENDER)
  8. `IdentityModule`
- Controllers: `[HealthRouter]`.
- Providers: `APP_FILTER ApiExceptionFilter`, then `APP_GUARD` in order `ClientGuard` → `SessionGuard` → `ThrottlerGuard`.

**`IdentityModule`**
- controllers: `[LoginRouter, SessionRouter, MeRouter]`
- providers: `[OtpService, InvestorAccounts, DeviceTrust, SessionService, AuthService, AccountSessions, ContactEmailService, SessionGuard]`
- exports: `[OtpService, InvestorAccounts, DeviceTrust, SessionService, SessionGuard]`

**`bootstrap.ts`**
- `API_PREFIX='api/v1'`.
- `buildFastifyAdapter()`: `trustProxy:false`, `bodyLimit 1 MiB`, and `genReqId`, which uses `requestIdFor(x-request-id)` and stores the result on `raw.id`.
- `configureApp(app)`: pino logger, global prefix, and an `onRequest` hook setting `x-request-id` and `cache-control: no-store`.
- `createApp(env)`: `bodyParser:false`, `bufferLogs`, `enableShutdownHooks`.

**`main.ts`:** `SANCHAY_APP_ROLE=migrate` runs `runMigrations` and exits 0. `worker` exits 1 with "not available until the JobsModule (pg-boss) lands". Otherwise `createApp(env).listen(PORT, HOST)`.

### 5.8 Platform symbols later tasks import (exact names)

| File | Symbols |
|---|---|
| `platform/ids.ts` | `TableName`, `RowId<T>`, `UUID_RE`, `newId(table)`, `asRowId(table, id)` (throws TypeError) |
| `platform/clock.ts` | `Clock {now()}`, `CLOCK` (Symbol), `SystemClock`, `FakeClock(start = '2026-10-12T04:30:00.000Z') {now; advance(ms); set(at)}`, `SECOND`, `MINUTE`, `HOUR`, `DAY` |
| `config/*` | `EnvSchema`, `Env`, `EnvError`, `parseEnv(raw)`, `assertBootInvariants(env)`; `AppConfig {readonly env}` |
| `platform/key-service.ts` | `KeyService {currentKid; dek(kid); blindIndexKey(); otpPepper(); authTokenKey()}`, `KEY_SERVICE`, `LocalKeyMaterial`, `LocalKeyService` (`fromEnv(env)`; currentKid 1) |
| `platform/crypto.ts` | `AadRef {table; column; rowId}`, `BlindIndexKind = 'mobile'\|'email'\|'pan'\|'account_number'`, `Crypto.encrypt(pt, ref): Buffer` (format `0x01‖kid(2)‖iv(12)‖tag(16)‖ct`, AAD `table.column:rowId`), `decrypt(blob, ref)`, `blindIndex(kind, value)` (HMAC-SHA256 over `kind:normalised`), `sha256(v)` |
| `platform/logging.ts` | `REDACTED='[REDACTED]'`, `REDACT_KEY_PATTERNS`, `isRedactedKey`, `scrub(value, depth?)`, `stripQuery`, `buildPinoOptions(env)` (base `{service:'sanchay-api'}`), `buildPinoHttpOptions(env)`. Later plans: Plan 02 D0 adds `serializeErr`, `redactBoundParams` and a `logMethod` hook (RV-02-66, RV-02-75); Plan 04 F1 makes the base `{service: SANCHAY_APP_ROLE}` (R-34). |
| `db/client.ts` | `DB`, `Database`, `Tx`, `DbExecutor = Database \| Tx`, `DbHandle {db; pool; close()}`, `createDb(url, max=10)` (`application_name 'sanchay-api'`) |
| `db/migrate.ts` | `MIGRATIONS_FOLDER`, `runMigrations(url)` |
| `platform/errors.ts` | `AppError(code: ErrorCode, options?)` with `.code` and `.options`; `AppErrorOptions {retryable?; fields?; retryAfterSeconds?; providerCode?; cause?; message?}`; `ErrorEnvelope`; `envelopeFor(code, requestId, opts?)`; `toOrpcError`; `fieldsFromIssues`; `normalizeOrpcError(error, requestId, log)`. `ValidationError` is imported at the top of the file, with no trailing import. |
| `platform/pg-errors.ts` | `pgErrorCodeOf(e)` |
| `platform/api-exception.filter.ts` | `mapException(e, requestId)`, `ApiExceptionFilter` |
| `platform/request-context.ts` | `ClientInfo {platform; deviceRef: string\|null; appVersion: string\|null}`, `AuthContext {investorId; sessionId; deviceId; platform; via:'COOKIE'\|'BEARER'; idleExpiresAt; absoluteExpiresAt}`, `SanchayClsStore {ip; userAgent; client; auth}`, `headerValue`, `requestIdFor`, `parseViewerAddress`, `clientIpFrom(req, trustEdge)` |
| `platform/orpc.ts` | `buildOrpcConfig(cls, logger)` (RequestHeadersPlugin, ResponseHeadersPlugin, onError → normalizeOrpcError) |
| `platform/audit.service.ts` | `AUDIT_DATA_ALLOWLIST = ['platform','purpose','channel','reason','sessionId','deviceId','outcome','isNewInvestor','stepUp','revokedCount','status']`, `allowListed(data)`, `AuditEventInput {action; actorType; actorId?; entityType?; entityId?; data?; reason?}`, `AuditService.record(exec: DbExecutor\|null, input)` |
| `platform/cookies.ts` | `SESSION_COOKIE='__Host-sanchay_sid'`, `DEVICE_COOKIE='__Host-sanchay_dev'`, `SESSION_INDICATOR_COOKIE='sanchay_si'`, `DEVICE_COOKIE_MAX_AGE_S = 34_560_000` (400 days), `readCookie`, `writeSessionCookies(resHeaders, {token, absoluteExpiresAt}, now)`, `clearSessionCookies(resHeaders)` |
| `platform/http-decorators.ts` | `IS_PUBLIC='sanchay:isPublic'`, `SKIP_CLIENT_CHECK='sanchay:skipClientCheck'`, `Public()`, `SkipClientCheck()`, `INFRA_ROUTE='sanchay:infraRoute'`, `type InfraRouteHosts = 'API_HOST' \| 'APP_AND_API_HOSTS'`, `InfraRoute(hosts)` (R-11: Public + SkipClientCheck + SkipThrottle + host scope for HostGuard) |
| `platform/client.guard.ts` | `resolveClient(headers, method, appOrigin): ClientInfo`, `ClientGuard` |
| `platform/throttle.ts` | `throttleTracker(req)` → `s:<sessionId>` or `ip:<ip>`; `throttleKey(ctx, tracker, name)` → `${name}:${tracker}` |
| `platform/health.router.ts` | `HealthRouter`, decorated `@InfraRoute('APP_AND_API_HOSTS')` (R-11; includes Public, SkipClientCheck and SkipThrottle) |
| `identity/otp.service.ts` | `OTP_POLICY {ttlMs 5 min, maxAttempts 5, cooldownMs 30 s, perDestinationPerHour 5, perDestinationPerDay 15, perIpPerHour 20 (default; enforced value read from env), perDevicePerHour 10}`, `OtpSent`, `OTP_SENT = {sent:true, expiresInSeconds:300, resendAfterSeconds:30}`, `generateOtpCode()`, `OtpDestination`, `IssueOtpInput {purpose|destBidxHex|otpRowId|code; R-14; destination; referenceId?; ip; deviceRefHash?}`, `IssuedOtp {otpId; expiresAt; resendAfterSeconds; destinationMasked}`, `VerifyOtpInput`, `VerifiedOtp {otpId; channel}`, `OtpService.issue(input)`, `OtpService.verify(exec, input)` (HMAC `sha256(pepper, purpose\|destBidxHex\|otpRowId\|code)` pinned by R-14, timingSafeEqual; attempt increment auto-commits; consume uses `exec`) |
| `identity/investor-accounts.service.ts` | `InvestorRow`, `InvestorAccounts.findByMobile`, `findById`, `createWithVerifiedMobile`, `decryptMobile`, `decryptEmail`, `assertEmailAvailable`, `setVerifiedEmail → {emailMasked; emailVerifiedAt}` |
| `identity/device-trust.service.ts` | `DeviceRow`, `DeviceTrust.findTrusted(exec, investorId, refHash)`, `trust(exec, investorId, {platform, refHash, appVersion})` |
| `identity/session.service.ts` | `SESSION_POLICY` (WEB idle 30 min / abs 12 h; ANDROID and IOS idle 30 d / abs 90 d), `SESSION_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/`, `IssuedSession {sessionId; token; idleExpiresAt; absoluteExpiresAt}`, `ResolvedSession`, `SessionRow`, `SessionService.create/resolve/revoke/revokeAll/list` (idle slide at most once per minute; blocked statuses CLOSED, SUSPENDED, FRAUD_HOLD) |
| `identity/step-up-token.ts` | `StepUpKind = 'NEW_DEVICE'\|'EMAIL_FALLBACK'`, `StepUpClaims {investorId; referenceId; deviceRefHash (hex); kind; expiresAt (ms)}`, `STEP_UP_TTL_MS = 10 min`, `signStepUpToken(key, claims)` → `v1.<b64url JSON{v:1,i,r,d,k,e}>.<b64url HMAC-SHA256(key,'stepup.v1.'+payload)>`, `verifyStepUpToken(key, token, now)` (throws `STEP_UP_REQUIRED`) |
| `identity/request-auth.ts` | `DeviceContext {platform; deviceRefHash; appVersion; ip; userAgent}`, `requireClient`, `requireAuth`, `requireDeviceContext`, `ensureWebDeviceCookie(cls, resHeaders)` |
| `identity/*` routers and services | `SessionGuard`, `AccountSessions.summary/list/logout/revokeAll/revokeOne`, `AuthService.requestLoginOtp/verifyLoginOtp/verifyEmailStepUp/requestEmailFallback`, `SignedIn` / `StepUpRequired` (API-internal), `ContactEmailService.requestVerification/verify` (purpose EMAIL_VERIFY, referenceId = investorId), `LoginRouter` (@Public), `SessionRouter`, `MeRouter` |

**Audit actions:**
- AUTH_OTP_SENT, AUTH_SIGNUP, AUTH_LOGIN, AUTH_OTP_FAILED, AUTH_OTP_LOCKED, AUTH_STEP_UP_REQUIRED, AUTH_EMAIL_FALLBACK_REQUESTED
- AUTH_LOGOUT, AUTH_SESSIONS_REVOKED_ALL, AUTH_SESSION_REVOKED
- CONTACT_EMAIL_OTP_SENT, CONTACT_EMAIL_VERIFIED

**Test helpers:**

| File | Exports |
|---|---|
| `test/int/db.ts` | `createTestDatabase(): Promise<TestDatabase {db; pool; url; name; close(); drop()}>` |
| `test/int/pg.ts` | `pgErrorCode(p)` |
| `test/int/factories.ts` | `rnd(n=32)`, `insertInvestor(db, overrides?)`, `insertDevice(db, investorId, overrides?)`, `insertOtp(db, overrides?)` |
| `test/int/otp-fixture.ts` | `otpFixture(t) → {otp, crypto, clock, sms, email}` |
| `test/int/app.ts` | `bootTestApp({env?, clock?}) → TestApp {app; db; clock; env; sms; email; close()}` |
| `test/int/http.ts` | `TEST_IP='203.0.113.10'`, `webHeaders({ip?, cookies?, origin?})`, `nativeHeaders({installationId, ip?, token?, platform?})`, `cookiesFrom(...res)` |
| `test/int/flows.ts` | `signInWeb(t, mobile, ip?)`, `signInNative(t, mobile, installationId?, ip?)` |

### 5.9 Error envelope (wire)

```json
{ "defined": true, "code": "<ErrorCode>", "status": <catalogue status>, "message": "<same as code, never PII>",
  "data": { "retryable": <bool>, "requestId": "<uuid>", "fields"?: [{"path","code","message"}], "providerCode"?: "...", "retryAfterSeconds"?: <int> } }
```

- `RETRYABLE_BY_DEFAULT`: INTERNAL, PROVIDER_UNAVAILABLE, SMS_UNAVAILABLE, RATE_LIMITED, OTP_COOLDOWN, IDEMPOTENCY_IN_PROGRESS, CONFLICT_VERSION.
- Nest-side mapping (`mapException`): 400 → VALIDATION_FAILED, 401 → AUTH_REQUIRED, 403 → FORBIDDEN, 404 → NOT_FOUND, 429 (ThrottlerException) → RATE_LIMITED, anything else → INTERNAL.
- oRPC input `ValidationError` → VALIDATION_FAILED, with `fields` from the issues.

### 5.10 Error codes used in Plan 01

| Code | Status | Source |
|---|---|---|
| VALIDATION_FAILED | 400 | input schema. Field codes include `EMAIL_IN_USE` and `EMAIL_ALREADY_VERIFIED` (path `email`). |
| AUTH_REQUIRED | 401 | session guard / resolve |
| SESSION_EXPIRED | 401 | idle or absolute expiry |
| OTP_INVALID, OTP_EXPIRED, OTP_LOCKED | 401 | OtpService.verify |
| STEP_UP_REQUIRED | 401 | step-up token invalid, or wrong device |
| FORBIDDEN | 403 | blocked investor status; email fallback on an untrusted device |
| ORIGIN_REJECTED | 403 | ClientGuard |
| NOT_FOUND | 404 | unknown route; revoking another investor's session (BOLA) |
| CONFLICT_VERSION | 409 | concurrent first sign-up (23505) |
| RATE_LIMITED | 429 | OTP quotas; throttler |
| OTP_COOLDOWN | 429 | 30 s cooldown (`retryAfterSeconds`) |
| INTERNAL | 500 | — |
| PROVIDER_UNAVAILABLE | 503 | email send failed |
| SMS_UNAVAILABLE | 503 | SMS send failed (the row is deleted, D-7) |

### 5.11 Full `ERROR_CATALOGUE` (62 codes)

| Status | Codes |
|---|---|
| 400 | VALIDATION_FAILED |
| 401 | AUTH_REQUIRED, SESSION_EXPIRED, OTP_INVALID, OTP_EXPIRED, OTP_LOCKED, STEP_UP_REQUIRED |
| 403 | FORBIDDEN, ORIGIN_REJECTED, FEATURE_DISABLED |
| 404 | NOT_FOUND |
| 409 (26) | CONFLICT_VERSION, IDEMPOTENCY_IN_PROGRESS, ORDER_STATE_INVALID, SCHEME_NOT_ORDERABLE, ONBOARDING_INCOMPLETE, PURCHASE_BLOCKED, EXIT_BLOCKED, KYC_NOT_VALIDATED, BANK_NOT_VERIFIED, MANDATE_REQUIRED, MANDATE_NOT_APPROVED, CONSENT_REQUIRED, CONSENT_EXPIRED, CONSENT_MISMATCH, CONSENT_ALREADY_USED, CONSENT_DESTINATION_UNAVAILABLE, SECOND_FACTOR_REQUIRED, PAYMENT_ATTEMPT_LIVE, PAYMENT_ALREADY_SUCCEEDED, REDEMPTION_CONFLICT_PENDING, PLAN_ACTIVE_ON_HOLDING, FOLIO_RECONCILIATION_REQUIRED, COOLING_OFF_ACTIVE, SERVICE_REQUEST_OPEN, DECLARATION_OUTDATED, PLAN_NOT_MODIFIABLE |
| 422 (17) | IDEMPOTENCY_KEY_REUSED, AMOUNT_BELOW_MIN, AMOUNT_ABOVE_MAX, AMOUNT_NOT_MULTIPLE, UNITS_PRECISION, INSUFFICIENT_REDEEMABLE, ELSS_LOCKED, NAV_UNAVAILABLE, MANDATE_LIMIT_EXCEEDED, UPI_LIMIT_EXCEEDED, SIP_DAY_INVALID, NOMINATION_INVALID, ELIGIBILITY_BLOCKED, CLIENT_IP_UNSUPPORTED, CAS_PASSWORD_INVALID, CAS_PAN_MISMATCH, CAS_UNSUPPORTED |
| 426 | APP_VERSION_UNSUPPORTED |
| 428 | IDEMPOTENCY_KEY_REQUIRED |
| 429 | RATE_LIMITED, OTP_COOLDOWN |
| 500 | INTERNAL |
| 502 | PROVIDER_REJECTED |
| 503 | PROVIDER_UNAVAILABLE, SMS_UNAVAILABLE |

---

## 6. Contract and transport

### 6.1 Procedures (paths are relative to `/api/v1`)

| Key | Method and path | Input | Output | `.errors(errorMap(...))` | Auth |
|---|---|---|---|---|---|
| `health.live` | GET `/health` | — | `{status:'ok'}` | INTERNAL | public, skip client check, skip throttle |
| `health.ready` | GET `/health/ready` | — | `{status:'ok', checks:[{name, ok, durationMs:int≥0}]}` | INTERNAL | same |
| `auth.requestOtp` | POST `/auth/otp` | `{mobile: MobileSchema}` | `OtpSentSchema {sent: true, expiresInSeconds: int, resendAfterSeconds: int}` | COMMON, OTP_COOLDOWN, SMS_UNAVAILABLE | public |
| `auth.verifyOtp` | POST `/auth/otp/verify` | `{mobile, smsCode: OtpCodeSchema}` | `VerifyOtpResultSchema` = discriminated union on `status` of `SignedInSchema` and `StepUpRequiredSchema` | COMMON, OTP_INVALID, OTP_EXPIRED, OTP_LOCKED, FORBIDDEN, CONFLICT_VERSION, OTP_COOLDOWN, PROVIDER_UNAVAILABLE | public |
| `auth.verifyEmail` | POST `/auth/otp/verify-email` | `{stepUpToken: string 10..2048, emailCode: OtpCodeSchema}` | `SignedInSchema` | COMMON, OTP_INVALID, OTP_EXPIRED, OTP_LOCKED, STEP_UP_REQUIRED, FORBIDDEN, CONFLICT_VERSION | public |
| `auth.emailFallback` | POST `/auth/otp/email-fallback` | `{mobile}` | `EmailFallbackSentSchema` = OtpSent + `{stepUpToken}` (same shape for every caller) | COMMON, PROVIDER_UNAVAILABLE, **OTP_COOLDOWN** (X-17) | public |
| `auth.session` | GET `/auth/session` | — | `SessionSummarySchema` | COMMON, SESSION_ERRORS | investor |
| `auth.listSessions` | GET `/auth/sessions` | — | `{items: SessionListItemSchema[]}` | COMMON, SESSION | investor |
| `auth.logout` | POST `/auth/logout` | — | `OkSchema {ok:true}` | COMMON, SESSION | investor |
| `auth.revokeAll` | POST `/auth/sessions/revoke-all` | — | `{revoked: int≥0}` | COMMON, SESSION | investor |
| `auth.revokeSession` | DELETE `/auth/sessions/{id}` | `{id: uuid}` | `OkSchema` | COMMON, SESSION, NOT_FOUND | investor |
| `me.requestEmailOtp` | POST `/me/email/otp` | `{email: EmailSchema}` | `OtpSentSchema` | COMMON, SESSION, OTP_COOLDOWN, PROVIDER_UNAVAILABLE | investor ([K] later) |
| `me.verifyEmail` | POST `/me/email/verify` | `{email, code: OtpCodeSchema}` | `EmailVerifiedSchema {emailMasked: string, emailVerifiedAt: Instant}` | COMMON, SESSION, OTP_INVALID, OTP_EXPIRED, OTP_LOCKED | investor |

COMMON (VALIDATION_FAILED, ORIGIN_REJECTED, RATE_LIMITED, INTERNAL) covers every guard-level code, so guard errors reach `OpenAPILink` as `defined: true`.

**Schemas**
- `SignedInSchema = {status:'SIGNED_IN', investorId: uuid, isNewInvestor: boolean, session: SessionInfoSchema}`
- `SessionInfoSchema = {idleExpiresAt: Instant, absoluteExpiresAt: Instant, token?: string}`. `token` is present **only for native**.
- `StepUpRequiredSchema = {status:'STEP_UP_REQUIRED', stepUp:'EMAIL', stepUpToken: string, emailMasked: string, expiresInSeconds: int, resendAfterSeconds: int}`
- `SessionListItemSchema = {id: uuid, platform, current: boolean, createdAt: Instant, lastUsedAt: Instant|null, userAgent: string|null}`

**Route-builder tags:** `auth` and `me`.

**`GET /auth/session` shape** (`SessionSummarySchema`). This is also the "who am I" call; `GET /me` is deferred.
```json
{ "sessionId": "uuid", "platform": "WEB|ANDROID|IOS", "idleExpiresAt": "ISO", "absoluteExpiresAt": "ISO",
  "investor": { "id": "uuid", "status": "z.enum(INVESTOR_STATUSES)", "mobileMasked": "••••••3210",
                "emailMasked": "string|null", "emailVerified": true, "displayName": "string|null" } }
```

### 6.2 OpenAPI

- Entry point: `generateOpenApiDocument()` from `@sanchay/contract/openapi` (B5).
- Script: `apps/api/scripts/openapi.ts` writes the committed `apps/api/openapi.json` (`JSON.stringify(doc, null, 2) + '\n'`). Command: `pnpm --filter=@sanchay/api openapi`.
- Drift test: `apps/api/src/openapi.test.ts`.
- Biome ignores `apps/api/openapi.json`.
- Regenerate after every contract change: `pnpm --filter=@sanchay/contract build`, then `pnpm --filter=@sanchay/api openapi`.

### 6.3 Headers, cookies and tokens

| Item | Rule |
|---|---|
| `x-sanchay-client` | **Required on every non-health request** (D-4). Values `web`, `android` or `ios`; anything else, or a missing header, gives 403 ORIGIN_REJECTED. |
| Web mutations (non GET/HEAD/OPTIONS) | `Origin` must equal `new URL(SANCHAY_APP_ORIGIN).origin` and `Sec-Fetch-Site: same-origin`. Otherwise ORIGIN_REJECTED. Web GETs need no Origin. |
| `x-installation-id` | Native only; must be a UUID or ORIGIN_REJECTED; lower-cased. The device ref is `sha256(lower-cased id)`. |
| `x-app-version` | Native; truncated to 32 characters. The 426 check comes in Plan 02. |
| `authorization: Bearer <43-char base64url>` | Native only. A bearer from a `web` client gives 401. Native without a bearer gives 401. When `Authorization` is present, cookies are ignored. |
| `x-request-id` | Echoed if the inbound value is a UUID (lower-cased); otherwise a fresh uuidv7. Also returned as `data.requestId`. |
| `cloudfront-viewer-address` | Used for the client IP only when `SANCHAY_TRUST_EDGE_HEADERS=true`; otherwise the socket address (with `::ffff:` unmapped). |
| `idempotency-key` | Sent by the api-client when `context.idempotencyKey` is set; not enforced in Plan 01 (D-8). |
| Session token | 32 random bytes as base64url (43 characters). The DB stores `sha256(token)`. No refresh and no rotation. Native binding: `device_ref_hash` and platform must match. |
| `__Host-sanchay_sid` | Web session. HttpOnly, Secure, SameSite=Lax, Path=/, Max-Age = seconds until `absoluteExpiresAt`. Written by `verifyOtp`/`verifyEmail` for web; cleared by logout, revoke-all, and revoke of the current session. |
| `sanchay_si` | Value `1`. Non-HttpOnly, Secure, Lax, Path=/, same Max-Age. Used for the `proxy.ts` optimistic redirect. Written and cleared together with the sid. |
| `__Host-sanchay_dev` | Web device ref. 32 random bytes base64url (43 characters, validated by regex). HttpOnly, Secure, Lax, Path=/, Max-Age 34,560,000 s (400 days). Minted on first contact by the public login routes (`ensureWebDeviceCookie`). |
| Admin cookie | `__Host-sanchay_ops` (GAP-07); Plan 02. |

**Session policy:** web idle 30 min (sliding, touched at most once per minute) and absolute 12 h. Native idle 30 d and absolute 90 d.

**New-device rule:** a known investor with a verified email on an untrusted device gets STEP_UP_REQUIRED. A new investor, or one without a verified email, signs in on SMS alone. Email fallback works on trusted devices only; untrusted callers get the same response shape and nothing is sent.

---

## 7. Clients

### 7.1 Environment variables

| Var | Used by | Local value |
|---|---|---|
| `SANCHAY_PLATFORM_ARN` | web `readSiteConfig` (`^ARN-\d{1,9}$`, required at render) | `ARN-000000` (clearly fake; never commit it to `.env.production`) |
| `SANCHAY_APP_ORIGIN` | web `proxy.ts` host routing; also the API origin check | unset → host kind `any` (no host routing) |
| `SANCHAY_WWW_ORIGIN` | web host routing, privacy link | unset |
| `SANCHAY_API_ORIGIN` | web `next.config.ts` rewrites (baked at build time), e2e | `http://localhost:3000` |
| `MAILPIT_URL` | e2e helpers (Playwright/Maestro) | `http://localhost:8025` |
| `EXPO_PUBLIC_API_BASE_URL` | mobile (absolute URL ending `/api/v1`; https unless the host is localhost, 127.0.0.1 or 10.0.2.2) | `http://10.0.2.2:3000/api/v1` |
| `EXPO_PUBLIC_WWW_ORIGIN` | mobile privacy link | default `https://www.sanchay.in` |
| `APP_VARIANT` | `app.config.ts` (`production` removes the scheme) | unset |

### 7.2 Web (apps/web, `@sanchay/web`)

**Scripts:** `dev` = `next dev --port 3001`, `build` = `next build`, `start` = `next start --port 3001`, `typecheck` = `next typegen && tsc --noEmit`, `test` = `vitest run`, `e2e:web` = `playwright test`.

**Routes**

| Route | Rendering |
|---|---|
| `(public)/page.tsx` → `/` | static RSC; www landing; no RNW. Heading "Mutual fund investing, made clear." Footer: `MARKET_RISK_WARNING`, then `` `Sanchay is operated by Platizio, an AMFI-registered Mutual Fund Distributor (${site.platformArn}). ${REGULAR_PLAN_NOTICE}` `` |
| `(auth)/login` → `/login` | dynamic (`await connection()` inside `<Suspense>`); `LoginRoute mode="login" next={safeNext(next)}` |
| `(auth)/signup` → `/signup` | dynamic |
| `(app)/app` → `/app` | dynamic; `AppShellRoute` wraps `HomeRoute` |

`/login/verify` and `/login/email` are collapsed into the one-screen state machine (ESC-4).

**`src/lib/routing.ts`**
- `SESSION_INDICATOR_COOKIE = 'sanchay_si'`, `SESSION_COOKIE = '__Host-sanchay_sid'`
- `hasSessionCookie = cookies.has('sanchay_si') || cookies.has('__Host-sanchay_sid')` (X-12)
- `type HostKind = 'www'|'app'|'any'`
- `hostKind(host, {wwwOrigin?, appOrigin?})`, `isAppPath(p)` (`/app`, `/app/*`, `/login`, `/login/*`, `/signup`), `isProtectedPath(p)` (`/app`, `/app/*`)
- `decideRoute({kind, pathname, search, hasSessionCookie, wwwOrigin?, appOrigin?}): RouteDecision` (`{action:'next'} | {action:'redirect'; location}`):
  1. www + app path → redirect to the app origin.
  2. app + non-app path: `/` → `/app`; anything else → www.
  3. protected path without a session cookie → `/login?next=<encoded path+search>`.
- `safeNext(raw)`: allows only `^/app([/?#]|$)` and no backslash.

**`src/lib/csp.ts`**
- `buildAppCsp(nonce, {dev})`:
  - `default-src 'self'`
  - `script-src 'self' 'nonce-X' 'strict-dynamic'` (plus `'unsafe-eval'` in dev)
  - `style-src 'self' 'unsafe-inline'`
  - `img-src 'self' data:`
  - `connect-src 'self'` (the Sentry host is removed until Plan 02)
  - `frame-ancestors 'none'`
  - `form-action 'self' https://*.fintechprimitives.com https://*.cybrilla.com`
  - `base-uri 'none'`
  - `object-src 'none'`
- `newNonce()`

**`src/lib/site-config.ts`:** `readSiteConfig(env?) → {platformArn, appOrigin, wwwOrigin}` (the origins default to `''`).

**`src/proxy.ts`:** `proxy(request)`:
- host from `x-forwarded-host ?? host`;
- redirects per `decideRoute`;
- for app paths: sets request headers `x-nonce` and `content-security-policy`, and response headers `content-security-policy` and `x-robots-tag: noindex`.

Matcher: `['/((?!api/|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|\\.well-known/).*)']`.

**`next.config.ts`**
- `reactCompiler`, `cacheComponents`, `typedRoutes`, `poweredByHeader:false`
- `transpilePackages: ['@sanchay/ui','@sanchay/features','@sanchay/app-core']`
- `turbopack.resolveAlias {'react-native':'react-native-web'}` and web-first `resolveExtensions`
- rewrites `/api/v1/:path*` → `${SANCHAY_API_ORIGIN}/api/v1/:path*` when set

**`src/client/`**
- `WebAppProviders({children, privacyNoticeUrl})`:
  - `createWebApiClient`, with `onUnauthenticated` → clear the cache and `location.assign('/login')` unless already on `/login`
  - NavAdapter: `onSignedIn(next ?? '/app')`, `onSignedOut → '/login'`
  - web session persistence is a no-op
- `RnwStyleRegistry`
- `LoginRoute`, `HomeRoute`, `AppShellRoute`

**Metadata:** title default "Sanchay", template "%s · Sanchay", robots noindex. Privacy URL: `${wwwOrigin}/legal/privacy`.

### 7.3 `useOtpLogin` state machine (X-02, X-13)

```ts
export interface AuthApi {
  requestOtp(input: { mobile: string }): Promise<OtpSent>;
  verifyOtp(input: { mobile: string; smsCode: string }): Promise<VerifyOtpResult>;
  verifyEmail(input: { stepUpToken: string; emailCode: string }): Promise<SignedInResult>;
}
export interface SessionOutcome { sessionToken: string | null; investorId: string; isNewInvestor: boolean }
export type OtpLoginStep =
  | { name: 'PHONE' }
  | { name: 'SMS_OTP'; mobile: string; destinationMasked: string; resendAvailableAt: number }   // destinationMasked = `••••••${mobile.slice(-4)}` (client-side)
  | { name: 'EMAIL_OTP'; mobile: string; stepUpToken: string; emailMasked: string }
  | { name: 'DONE' };
export interface UseOtpLoginOptions { api: AuthApi; onSession(o: SessionOutcome): void | Promise<void>; now?: () => number }
export interface UseOtpLogin { step; pending; error: string|null; errorCode: string|null; secondsUntilResend: number;
  submitMobile(m): Promise<void>; submitSmsCode(c): Promise<void>; submitEmailCode(c): Promise<void>; resend(): Promise<void>; changeMobile(): void }
```

- `submitSmsCode` branches on `out.status === 'STEP_UP_REQUIRED'`. Otherwise it finishes with `{sessionToken: out.session.token ?? null, investorId, isNewInvestor}`. Dependency arrays list only real dependencies, and there are no `// eslint-free` comments.
- `authApiFrom(client)` maps to `client.auth.requestOtp`, `verifyOtp` and `verifyEmail`.
- `deviceRef` is removed everywhere (D-2).

### 7.4 Screens and copy (strings the tests match)

| Screen | Copy and controls |
|---|---|
| `LoginScreen` | testID `login-screen`.<br>PHONE step: title "Log in to Sanchay" / "Create your Sanchay account"; label "Mobile number", prefix "+91", testID `mobile-input`, field error "Enter a valid 10-digit Indian mobile number"; button "Get OTP"; privacy link "Read our Privacy Notice".<br>SMS step: title "Enter the code", "Enter the 6-digit code sent to ••••••3210.", label "One-time code", testID `otp-input`, "Resend code in m:ss", buttons "Resend code" and "Change mobile number", "Verify".<br>EMAIL step: title "Confirm it's you", "This is a new device. Enter the 6-digit code sent to <emailMasked>.", label "Email code", testID `email-otp-input`, button "Start again".<br>DONE: "Signing you in…".<br>OTP error "Enter the 6-digit code". |
| `WelcomeScreen` | testID `welcome-screen`; title "Sanchay"; buttons "Create account" and "I already have an account"; `MARKET_RISK_WARNING` |
| `HomeScreen` | `useQuery(utils.auth.session.queryOptions())` (X-03).<br>testIDs `home-loading` ("Loading your account…"), `home-error` (Banner, "Try again"), `home-screen`.<br>Title `Hi, ${displayName}` or "Welcome to Sanchay"; line `` `Signed in as ${investor.mobileMasked}` `` (for example "Signed in as ••••••3210"); card "Your investments". |
| `AppShell` | Header "Sanchay"; button "Log out" (`useSignOut`: logout, clear token, clear cache, `nav.onSignedOut()`) |
| Mobile lock screen | testID `lock-screen`; "Sanchay is locked"; "Unlock with your fingerprint, face or screen lock to continue."; buttons "Unlock" and "Log out"; prompt "Unlock Sanchay" |

### 7.5 Playwright (apps/web)

**`playwright.config.ts`**
- `testDir ./e2e`, `baseURL http://localhost:3001`.
- Projects: `desktop-chromium`, and `mobile-chromium` (Pixel 7, shell spec only).
- `globalSetup ./e2e/global-setup.ts`: reads `.next/routes-manifest.json` and throws (`apiRewriteProblem` in `src/lib/api-rewrite.ts`) unless the build rewrites `/api/v1/:path*` to `${SANCHAY_API_ORIGIN ?? 'http://localhost:3000'}/api/v1/:path*`. The rewrite is baked in by `next build`; the `SANCHAY_API_ORIGIN` given to `next start` below cannot add it.
- `webServer`, in order:
  1. The API: `pnpm --filter=@sanchay/api dev`, `cwd ../..`, url `${SANCHAY_API_ORIGIN ?? 'http://localhost:3000'}/api/v1/health`, timeout 180 s. Env: `{...baseEnv, PORT:'3000', SANCHAY_APP_ENV:'local', SANCHAY_APP_ORIGIN:'http://localhost:3001', SANCHAY_PROVIDER_MODE_SMS:'mailpit', SANCHAY_PROVIDER_MODE_EMAIL:'mailpit', SANCHAY_MAILPIT_URL:'http://localhost:8025', SANCHAY_OTP_PER_IP_PER_HOUR:'1000'}`. The keys come from `apps/api/.env`.
  2. The web: `pnpm start`, url `/login`. Env: `{...baseEnv, SANCHAY_PLATFORM_ARN:'ARN-000000', SANCHAY_API_ORIGIN:'http://localhost:3000'}`.

**Support files**
- `e2e/support/fixtures.ts`: the `test` fixture with an auto `cspGuard` that fails on any "Content Security Policy" console error.
- `e2e/support/otp.ts`: `MAILPIT_URL`, `uniqueTestMobile()` (`9` + 6 timestamp digits + 3 random digits), `readLatestOtp(request, mobile, sinceMs)` (Mailpit, §5.6).

**Specs**
- `shell.spec.ts`: 5 tests.
- `auth.spec.ts`, tag `@api`, 3 tests. The third is in its final X-14 form, and all assertions use `Signed in as ••••••${mobile.slice(-4)}`.

**Commands**

| Purpose | Command |
|---|---|
| Install browser | `pnpm --filter=@sanchay/web exec playwright install chromium` |
| Build (PowerShell) | `$env:SANCHAY_PLATFORM_ARN='ARN-000000'; $env:SANCHAY_PLATFORM_ARN_VALID_TILL='2099-12-31'; $env:SANCHAY_API_ORIGIN='http://localhost:3000'; pnpm turbo run build --filter=@sanchay/web` |
| Build (Git Bash) | `SANCHAY_PLATFORM_ARN=ARN-000000 SANCHAY_PLATFORM_ARN_VALID_TILL=2099-12-31 SANCHAY_API_ORIGIN=http://localhost:3000 pnpm turbo run build --filter=@sanchay/web` |
| All (PowerShell) | `pnpm db:up`, `pnpm db:migrate`, then `$env:SANCHAY_PLATFORM_ARN='ARN-000000'; $env:SANCHAY_PLATFORM_ARN_VALID_TILL='2099-12-31'; $env:SANCHAY_API_ORIGIN='http://localhost:3000'; pnpm e2e:web` (13 tests; turbo rebuilds `@sanchay/web` with this env first) |
| All (Git Bash) | `pnpm db:up`, `pnpm db:migrate`, then `SANCHAY_PLATFORM_ARN=ARN-000000 SANCHAY_PLATFORM_ARN_VALID_TILL=2099-12-31 SANCHAY_API_ORIGIN=http://localhost:3000 pnpm e2e:web` (13 tests) |
| Rerun without turbo | `pnpm --filter=@sanchay/web e2e:web` (13 tests; add `--grep-invert "@api"` for the 10 shell tests). It reuses the existing `.next`, so only after one of the builds above: `next.config.ts` bakes the `/api/v1` rewrite in at build time, and `e2e/global-setup.ts` fails fast when that build has no rewrite to `SANCHAY_API_ORIGIN`. |

### 7.6 Mobile (apps/mobile, `@sanchay/mobile`, version 0.1.0)

**Dependencies:**
- expo `57.0.25`, expo-router `~57.0.23`, expo-secure-store `~57.0.4`, expo-local-authentication `~57.0.3`, expo-crypto `~57.0.3`, expo-constants `~57.0.19`, expo-linking `~57.0.11`, expo-status-bar `~57.0.1`, react-native-safe-area-context `~5.7.0`, react-native-screens `~4.26.0`
- `react`, `react-native`, `@tanstack/react-query` and `zod` via `catalog:`
- workspace: `api-client`, `app-core`, `features`, `tokens`, `ui`

**Scripts:** `start`, `android` (`expo run:android`), `ios`, `export:android` (`expo export --platform android --output-dir dist-export`), `typecheck`, `test`, `e2e:android` (`maestro test .maestro`).

**`app.config.ts`**
- name "Sanchay", slug `sanchay`, version 0.1.0, portrait, light
- `...(process.env.APP_VARIANT === 'production' ? {} : { scheme: 'sanchay' })`
- iOS: `bundleIdentifier 'in.sanchay.app'`, `NSFaceIDUsageDescription` "Sanchay uses Face ID to unlock the app and to approve your transactions."
- Android: `package 'in.sanchay.app'`
- Plugins: `expo-router`, `expo-secure-store`, `['expo-local-authentication', {faceIDPermission}]`
- `experiments.typedRoutes`

**Expo routes (`src/app`):**
- `_layout.tsx`: SafeAreaProvider → SessionProvider → AppLockGate → AppProviders → Stack. `Stack.Protected guard=signedIn` holds `(tabs)`; `guard=!signedIn` holds `welcome`, `login` and `signup`.
- `welcome.tsx`, `login.tsx`, `signup.tsx`
- `(tabs)/_layout.tsx`: a single "Home" tab (GAP-06 five-tab bar comes in Plan 02)
- `(tabs)/index.tsx`: AppShell → HomeScreen

**Libraries (`src/lib`)**
- `sessionStore.ts`: `SecureStoreLike`, `SessionStore {getSessionToken, setSessionToken, clearSessionToken, getInstallationId}`, `createSessionStore(store, newId)`, **`SESSION_TOKEN_KEY = 'sanchay.session.token'`**, **`INSTALLATION_ID_KEY = 'sanchay.installation.id'`**. The secure-store adapter uses `keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY`. The installation id comes from `Crypto.randomUUID()`.
- `appLock.ts`:
  - `LOCK_AFTER_BACKGROUND_MS = 300000`
  - `ColdStartDecision = 'OPEN'|'LOCK'|'SIGN_OUT'`; `coldStartDecision(hasSession, hasDeviceAuth)`: no session → OPEN; device auth → LOCK; otherwise SIGN_OUT (ESC-2)
  - `GateStatus = 'CHECKING'|'LOCKED'|'OPEN'`; `AppLockState {status, deviceAuth, backgroundedAt}`
  - `AppLockEvent` = COLD_START_RESOLVED | BACKGROUND | FOREGROUND | UNLOCKED | SIGNED_OUT
  - `appLockReducer`, `initialAppLockState`
- `config.ts`: `parseMobileConfig({apiBaseUrl, wwwOrigin, appVersion}): MobileConfig`

**Native modules (`src/native`)**
- `config.ts` (`mobileConfig`), `secureStore.ts` (`secureStoreAdapter`)
- `SessionProvider` / `useSession()`: `{status:'loading'|'signedIn'|'signedOut', installationId, store, signIn, signOut}`
- `AppLockGate`: monotonic `performance.now()`
- `AppProviders`: native client; `PlatformAdapters {session:{saveSessionToken: signIn, clearSessionToken: signOut}, privacyNoticeUrl}` with no deviceRef
- `NativeScreen`

### 7.7 Maestro (`apps/mobile/.maestro`, appId `in.sanchay.app`)

| File | Content |
|---|---|
| `subflows/sign-up.yaml` | launchApp clearState, tap "Create account", assert "Create your Sanchay account", run `new-mobile.js`, tap id `mobile-input`, input the mobile, hideKeyboard, tap "Get OTP", assert "Enter the 6-digit code sent to .*", run `read-otp.js` (env MOBILE), tap id `otp-input`, input the OTP, assert "Signed in as ••••••.*" |
| `signup.yaml` | runs the subflow, asserts "Welcome to Sanchay" and "Home" |
| `logout.yaml` | subflow, tap "Log out", assert "Create account" |
| `relaunch-without-screen-lock.yaml` | subflow, stopApp, launchApp, assert "Create account" |
| `scripts/new-mobile.js` | `output.mobile = '9' + String(Date.now()).slice(-9)` |
| `scripts/read-otp.js` | `var MAILPIT = typeof MAILPIT_URL !== 'undefined' ? MAILPIT_URL : 'http://localhost:8025'`. Polls `http.get(MAILPIT + '/api/v1/search?query=' + encodeURIComponent('to:"sms-' + MOBILE + '@sanchay.local"') + '&limit=1')`, then `http.get(MAILPIT + '/api/v1/message/' + id)`, then `/\b(\d{6})\b/` on `json(r.body).Text`. 15 s deadline. Sets `output.otp`. |

**Commands**
- Build and install:
  - PowerShell: `$env:EXPO_PUBLIC_API_BASE_URL='http://10.0.2.2:3000/api/v1'; pnpm --filter=@sanchay/mobile android`
  - Git Bash: `EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:3000/api/v1 pnpm --filter=@sanchay/mobile android`
- The API runs with `pnpm --filter=@sanchay/api dev` in mailpit mode, from `.env`.
- Run: `maestro test apps/mobile/.maestro -e MAILPIT_URL=http://localhost:8025` → 3/3 flows pass. The emulator must be API 35+ with **no screen lock**.

---

## 8. Part B tasks 1–10 (re-specified) and deltas for B11–B26

**B1: `apps/api` scaffold, ids and clock**
- **Files:** `apps/api/{package.json, tsconfig.json (extends @sanchay/config/tsconfig/nest.json), .swcrc, nest-cli.json, vitest.shared.ts, vitest.config.ts}`, `test/setup.ts`, `src/modules/platform/{ids,clock}.ts`; `packages/config/tsconfig/nest.json` plus its export entry.
- **package.json:**
  - name `@sanchay/api`; scripts as in §5.4 plus `dev`/`build`/`start`/`typecheck`/`test`/`test:int`/`openapi`
  - dependencies: `@nestjs/{common,config,core,platform-fastify,throttler}`, `@orpc/{contract,nest,server}`, `drizzle-orm`, `fastify`, `nestjs-cls`, `nestjs-pino`, `pg`, `pino`, `pino-http`, `reflect-metadata`, `rxjs`, `uuid`, `zod`, `@sanchay/contract`, `@sanchay/domain`
  - devDependencies: `@nestjs/cli`, `@nestjs/testing`, `@orpc/client`, `@orpc/openapi-client`, `@sanchay/config`, `@swc/cli`, `@swc/core`, `@testcontainers/postgresql`, `@types/node`, `@types/pg`, `drizzle-kit`, `light-my-request`, `typescript`, `unplugin-swc`, `vite`, `vitest`
- **No catalog edits** (A1 owns the catalog).
- **Produces:** the ids and clock symbols in §5.8.
- **Tests:** `ids.test.ts` (v7 version, sort order, `asRowId` lower-case/reject) and `clock.test.ts` (FakeClock start/advance, fresh Date, no going backwards, set; SystemClock). 9 tests.

**B2: Zod env and boot guards**
- **Files:** `src/config/{env,app-config}.ts`, `env.test.ts`.
- **Produces:** the §5.2 names.
- **Tests:** defaults (`PORT` 3000, `SANCHAY_PROVIDER_MODE_SMS` capture, `SANCHAY_THROTTLE_PER_MINUTE` 120, `SANCHAY_OTP_PER_IP_PER_HOUR` 20); stringbool parsing; bad DATABASE_URL without echoing secrets; 32-byte keys; missing local key; local keyring refused in dev; fakes refused in prod; kms refused; **OTP IP limit ≠ 20 refused in dev**. 9 tests.

**B3: KeyService and Crypto**
- **Files:** `platform/{key-service,crypto}.ts`, `crypto.test.ts`.
- **Produces:** as in §5.8.
- **Tests:** round-trip (0x01, kid 1); fresh IV; swapped rowId fails; swapped column fails; tamper detected; unknown format rejected; blind index deterministic and 32 bytes; email normalised; kinds separated; not a plain hash. 10 tests.

**B4: pino allow-list redaction**
- **Files:** `platform/logging.ts`, `logging.test.ts`.
- **Produces:** as in §5.8 (base service `sanchay-api`; health excluded from autoLogging).
- **Tests:** deep PII keys redacted; req serialised without headers or query; error serialisation; non-plain objects and depth bound. 4 tests.

**B5: `@sanchay/contract` errors, common, health and OpenAPI**
- **Files:** `packages/contract/{package.json, tsconfig.json, tsconfig.build.json, vitest.config.ts}`, `src/{errors,common,health,index,openapi}.ts`, tests `src/{errors,common,openapi}.test.ts`; root `tsconfig.json` reference.
- **Produces:** as in §4.5 (common re-exports validation/domain).
- **Tests:**
  - errors: 62 codes bucketed; auth codes mapped; errorMap shape; guard; ErrorData validation
  - common: valid mobiles; invalid mobiles incl. repeated digits and `+91…`; email normalisation; OTP format
  - openapi: 3.1, `servers [{url:'/api/v1'}]`, `/health` and `/health/ready` exist

**B6: compose, Drizzle baseline, bootstrap migration, Testcontainers**
- **Files:** `compose.yaml`, `apps/api/drizzle.config.ts`, `src/db/{app-schema,client,schema,migrate}.ts`, `src/modules/platform/platform.schema.ts` (auditEvents), `scripts/db-check.ts`, `vitest.int.config.ts` (forks, no file parallelism, testTimeout 30 s, hookTimeout 180 s), `test/int/{global-setup,db,pg}.ts`, `drizzle/0000_bootstrap.sql`, `drizzle/0001_platform.sql`.
- **Root changes:** add the `test:int` and `db:up` scripts; add the turbo `test:int` and `db:check` tasks.
- **Tests (`migrations.int.test.ts`):** PG 18; `uuidv7()`; four extensions; three `sanchay_*` roles; migrations recorded (≥ 2); `app.audit_events` exists; no naive timestamps. 7 tests.
- **Also run:** `docker compose config --quiet`.

**B7: investor identity schema**
- **Files:** `src/modules/identity/identity.schema.ts`, `test/int/factories.ts`, `src/db/schema.ts`, generated `drizzle/0002_identity.sql`.
- **Produces:** the tables, constants and types in §5.5. Admin tables are removed (D-14).
- **Tests (`identity-schema.int.test.ts`):** unique mobile bidx; status CHECK; RESTRICT delete; one CURRENT contact per kind; one device per ref; the revoke pair; attempts ≤ 5; one live OTP per scope (with a reference id allowed); the consumed pair. 9 tests.

**B8: roles, grants and the append-only migration (re-scoped)**
- **Files:** `drizzle/0003_grants.sql` (custom), `test/int/grants.int.test.ts`. The legal-consent tables are removed (D-14).
- **Tests** (a helper `asAppRole(sql)` does `BEGIN; SET LOCAL ROLE sanchay_app; … ROLLBACK`):
  1. `sanchay_app` can INSERT into `app.audit_events` but UPDATE and DELETE give 42501.
  2. `sanchay_app` can UPDATE `app.investors`.
- Both `test:int` and `db:check` stay green.

**B9: error envelope**
- **Files:** `platform/{errors,pg-errors,api-exception.filter}.ts`, `errors.test.ts`.
- **Produces:** as in §5.8 and §5.9.
- **Tests:** envelope shape with catalogue status; retryable default; AppError → ORPCError; ValidationError → VALIDATION_FAILED with fields; unknown → INTERNAL and logged; pass-through; `mapException` for AppError/Throttler/404/401/Error; `pgErrorCodeOf`. 14 tests.

**B10: bootstrap (Fastify, request ids, CLS, pino, oRPC module) and health**
- **Files:** `platform/{request-context,orpc,platform.module,health.router}.ts`, `src/{app.module,bootstrap}.ts`, `test/int/{env,app}.ts`, tests `request-context.test.ts` and `test/int/health.int.test.ts`.
- **Produces:** as in §5.7 and §5.8. `PlatformModule` exports AppConfig, CLOCK, KEY_SERVICE, Crypto, DB (B12 adds AuditService). `TestApp {app, db, clock, env, close}` (B13 adds sms and email).
- **Tests:**
  - request id kept or replaced
  - viewer address parsing (IPv4, IPv6, bracketed, garbage)
  - `clientIpFrom` trust and unmap
  - health live: 200, no-store, `x-request-id`
  - echo of an incoming id
  - ready: database check
  - unknown route → NOT_FOUND envelope

**Deltas for B11–B26 (apply the renames from §0 plus these)**

| Task | Delta |
|---|---|
| B11 | Add the turbo `openapi` task. Commands use `--filter=`. |
| B12 | `SanchayClsStore`. `PlatformModule` exports gain AuditService (full file as in the draft). |
| B13 | Mailpit addresses, template ids, SMS and email copy, and `WEBOTP_DOMAIN` from §5.6. Test expectations use `sms-9876543210@sanchay.local` and "…Sanchay login OTP… @app.sanchay.in #123456". `TestApp` gains `sms` and `email`. |
| B14 | The IP limit is read from `this.config.env.SANCHAY_OTP_PER_IP_PER_HOUR` (X-11). The test expects `templateId: 'SANCHAY_LOGIN_OTP_V1'`, subject 'Your Sanchay verification code', and the Sanchay regex. |
| B15–B18 | Renames only. `Platform` is imported from `@sanchay/contract`. |
| B19 | The contract as in §6.1. Errors per X-17. `SessionSummarySchema.investor.status = z.enum(INVESTOR_STATUSES)`. Type exports as in §4.5. The test gains an assertion that `emailFallback` and `me.requestEmailOtp` declare OTP_COOLDOWN. Regenerate `openapi.json`. |
| B20 | **Step 0 spike (X-19):** `pnpm --filter=@sanchay/api exec node -e "import('@orpc/server/helpers').then(m=>console.log(Object.keys(m)))"` must list getCookie, setCookie and deleteCookie. If it does not, implement the cookie helpers with `reply.raw.appendHeader('set-cookie', …)` through a CLS holder, in this task. Cookie, header and metadata names as in §5.8 and §6.3. `http.ts` uses `x-sanchay-client`; `TEST_APP_ORIGIN = https://app.sanchay.test`. |
| B21 | The web test asserts `res.cookies.length >= 2` on the verify response (`__Host-sanchay_sid` and `sanchay_si`), plus `__Host-sanchay_dev` on the OTP response. |
| B22–B24 | Renames only (cookie values `''` on logout). |
| B25 | Headers `x-sanchay-client`. Add a second test: two rapid `requestOtp` calls; the second gives `safe()` → `isDefined === true`, `code 'OTP_COOLDOWN'`, `status 429`, `data.retryAfterSeconds 30`. 2 tests. |
| B26 | `main.ts` and `cli/migrate.ts` read `SANCHAY_APP_ROLE`. `.env.example` per §5.2. Root script `db:migrate`. `.gitignore` check. CI gains the `test:int` and `db:check` steps (timeout 30 minutes). Smoke on port **3000**: `curl -s http://localhost:3000/api/v1/health` and the OTP POST with `x-sanchay-client: android`, both with PowerShell `Invoke-RestMethod` variants. Mailpit shows `SMS [SANCHAY_LOGIN_OTP_V1]` to `sms-9876543210@sanchay.local`. |

**Part A deltas:**
- A1: package names, the full catalog and allowBuilds (§3.3), the ADR stub.
- A2: `@sanchay/config`; biome `files.includes` negations.
- A3–A6, A8–A11: renames only.
- A7: PO-5 as in §10.
- A12: ADMIN_ROLES (7 roles), `MAX_NOMINEES`, `LAUNCH_SCHEME_OPTIONS`.
- A13: CI env `SANCHAY_PLATFORM_ARN`.

**Part C deltas:**

| Task | Delta |
|---|---|
| C1 | X-18 build pattern; no catalog edits. |
| C2 | X-18; conformance rows = the 11 auth/me rows of §6.1. |
| C3 | Native headers (X-01); `SanchayClientContext`. Test expects `{ authorization: 'Bearer tok-123', installation: 'inst-1', version: '0.1.0', client: 'android' }`. |
| C4 | Vitest `esbuild: { jsx: 'automatic' }` instead of `oxc` (X-06). |
| C5 | None. |
| C6 | Validation-based form schemas; copy per §4.9. |
| C7 | §7.3. |
| C8 | No deviceRef; Sanchay copy. |
| C9 | `auth.session` (X-03). |
| C10 | §7.2. |
| C11 | §7.2; turbo env/passThroughEnv; `.gitignore`. |
| C12 | Mailpit OTP reader; §7.5. |
| C13 | `sanchay.*` keys; default `https://www.sanchay.in`. |
| C14 | §7.6. |
| C15 | §7.7. |

---

## 9. Review issues X-01..X-20: resolutions

| Id | Decision | Applied in |
|---|---|---|
| X-01 | Native sends `x-sanchay-client: android\|ios`; the platform header is removed. | C3 (and B20/B25 headers) |
| X-02 | Part B names and shapes win: `auth.verifyEmail`; outputs as in §6.1; no body `deviceRef`; contract `MobileSchema`/`OtpCodeSchema` re-export `@sanchay/validation`. | B5, B19, C2, C6, C7, C8, C14 |
| X-03 | No `GET /me`; HomeScreen uses `auth.session`; the masked mobile uses six dots; `/me` goes to Plan 02 (S4). | C9, C12, C15 |
| X-04 | API on :3000 and web on :3001; the API env is `SANCHAY_APP_ORIGIN=http://localhost:3001`. | B2, B26, C12 |
| X-05 | No dev outbox endpoint; e2e reads OTPs from Mailpit; SMS mode `mailpit`. | B13 (addresses), C12, C15 |
| X-06 | One catalog, owned by A1; vite 7.3.6; @types/node 24.13.6; C4 uses `esbuild.jsx`. | A1, C1, C4 |
| X-07 | CI sets `SANCHAY_PLATFORM_ARN=ARN-000000`; turbo `env` and `passThroughEnv`. | A13, C11 |
| X-08 | allowBuilds pre-seeded in A1; unknown packages are added explicitly and recorded in the ADR. | A1 |
| X-09 | Scope made explicit (§1.2); deferred to Plan 02; no new tasks. | Plan header |
| X-10 | `compose.yaml` owned by B6; root scripts `db:up` and `db:migrate`. | B6, B26, C12, C15 |
| X-11 | `SANCHAY_OTP_PER_IP_PER_HOUR` (default 20; boot guard outside local/test); e2e and `.env.example` use 1000. | B2, B14, B26, C12 |
| X-12 | proxy uses the indicator `sanchay_si`, with sid fallback. | C10 |
| X-13 | useOtpLogin without device plumbing or placeholder comments. | C7 |
| X-14 | Final third web e2e test, no placeholder text. | C12 |
| X-15 | `--filter=@sanchay/x` everywhere. | all tasks |
| X-16 | Contract and schema CHECK lists come from `@sanchay/domain`. | B5, B7, B19 |
| X-17 | Missing error codes declared (§6.1); B25 adds an OTP_COOLDOWN round-trip case. | B19, B25 |
| X-18 | The dist-package build pattern applies to contract, tokens and api-client; root references added. | B5, C1, C2 |
| X-19 | Step-0 spike, with the fallback written into the task. | B20 (and B21 assertion) |
| X-20 | Resolved: the full Part B text was recovered and checked. PROVIDER_MODE is capture\|mailpit; COMMON_ERRORS has VALIDATION_FAILED, INTERNAL and RATE_LIMITED; Postgres is on 55432 and Mailpit on 8025/1025; D-1 is kept. | this sheet; B1–B10 |

---

## 10. PO-5 XIRR display in `@sanchay/money` (A7, `src/xirr-display.ts`)

```ts
export type XirrCaveat = 'TOO_EARLY' | 'SHORT_HORIZON';
export interface XirrDisplay {
  readonly text: string;                 // 'Too early' | '12.3%' | '-4.6%' | '—'
  readonly caveat: XirrCaveat | null;
  readonly caveatText: string | null;    // exact PO-5 label when SHORT_HORIZON
  readonly showAbsoluteReturn: boolean;  // UI must render absolute return beside it
}
export const XIRR_MIN_HORIZON_DAYS = 30;
export const XIRR_FULL_YEAR_DAYS = 365;
export const XIRR_TOO_EARLY_TEXT = 'Too early';
export const XIRR_SHORT_HORIZON_CAVEAT = 'Annualised; can swing widely for holdings under 1 year';
export function formatXirr(xirr: DecimalInput | null /* fraction, 0.1234 = 12.34% */, horizonDays: number): XirrDisplay;
```

**Rules** (tests pin every row):

| Input | Result |
|---|---|
| `horizonDays` not an integer, or < 0 | throws `RangeError` |
| h < 30 (any `xirr`) | `{ text: 'Too early', caveat: 'TOO_EARLY', caveatText: null, showAbsoluteReturn: true }` |
| h ≥ 30 and `xirr === null` | `{ text: '—', caveat: null, caveatText: null, showAbsoluteReturn: true }` |
| 30 ≤ h < 365 | `{ text: formatPct(xirr×100, {signed:false, fractionDigits:1}), caveat: 'SHORT_HORIZON', caveatText: XIRR_SHORT_HORIZON_CAVEAT, showAbsoluteReturn: true }`, e.g. `'12.3%'` at 30 and at 364 |
| h ≥ 365 | `{ text, caveat: null, caveatText: null, showAbsoluteReturn: false }`, e.g. `formatXirr('-0.0456', 365).text === '-4.6%'` |

`horizonDays` is the whole number of IST calendar days from the first cash-flow date to the valuation as-of date. The caller computes it (portfolio engine, S10).

Exports added to `index.ts`: `formatXirr`, `XIRR_MIN_HORIZON_DAYS`, `XIRR_FULL_YEAR_DAYS`, `XIRR_TOO_EARLY_TEXT`, `XIRR_SHORT_HORIZON_CAVEAT`, `type XirrCaveat`, `type XirrDisplay`.

---

## 11. Deviation register (D) and escalations (ESC); the plan header carries both

**Deviations kept from Part B**
- D-1: `otp_codes.device_ref_hash`.
- D-2: the device ref travels in the transport (cookie or `x-installation-id`), never in the body.
- D-3: `data.retryAfterSeconds`.
- D-4: `x-sanchay-client` is required on all non-health routes.
- D-5: no LRU or `sessions_epoch`.
- D-6: HMAC step-up token.
- D-7: the OTP row is deleted when delivery fails.
- D-8: no Idempotency-Key enforcement.
- D-9: superseded (validation exists; contract re-exports it).
- D-10: boot guards (deployed environments cannot boot until KMS and MSG91/SES land).
- D-11: not implemented: `/ready` pg-boss and NAV checks, EdgeGuard, the 426 check, the readiness trigger.
- D-12: `audit_events.actor_type` CHECK.
- D-13: schema files cross-import each other; check-boundaries must allow-list `*.schema.ts`.

**New deviations**
- **D-14:** the admin tables (GAP-07 shape) and the legal/consent tables (GAP-01) move to Plan 02.
- **D-15:** the `SANCHAY_` env prefix, with `DATABASE_URL`, `PORT` and `HOST` unprefixed.
- **D-16:** the configurable OTP IP limit.

**Escalations** (lead or PO decision; Plan 01 is built so each flip touches one isolated place)

| Id | Question | What Plan 01 does | Where a flip lands |
|---|---|---|---|
| ESC-1 | GAP-06 §4 and GAP-01 use apex `sanchay.in` with no `/app` prefix, API at `api.sanchay.in/v1`, and "delete app.sanchay.in". The brand rules and design §E.1 use www/app hosts with same-origin `/api/v1`. | Follows the brand rules and design (local topology is identical either way). Decide before Plan 02 CDK/EdgeGuard. | `WEBOTP_DOMAIN`, `API_PREFIX` (API and client), `SANCHAY_*_ORIGIN`, `routing.ts` `isAppPath`/`decideRoute`, cookie scope in `cookies.ts`, CSP |
| ESC-2 | GAP-06 §6: a device with no screen lock gets a nudge plus a 24 h refresh token. Design §E.2 and HIGH-3: OTP on every cold start, no refresh. | Follows the design. A refresh token needs a new contract procedure (Plan 02). | `coldStartDecision` |
| ESC-3 | Login steps collapsed to one screen per route (Part C deviation 5). | Needs design-owner sign-off, measured against the JOURNEYS route tree. | — |
| ESC-4 | ui on RN `StyleSheet` plus tokens (Part C deviation 7), not Uniwind. | Accepted for Plan 01; ADR-0002 decides in Plan 02. | — |
| ESC-5 | `NOMINEE_ID_TYPES` includes `AADHAAR_LAST4` but design C-22 says Aadhaar is never stored. | To counsel and the PO. `MAX_NOMINEES = 3` per PO-7. | — |

---

### Critical files for implementation
- C:/Users/pc/Desktop/sanchay/pnpm-workspace.yaml
- C:/Users/pc/Desktop/sanchay/packages/contract/src/auth.ts
- C:/Users/pc/Desktop/sanchay/apps/api/src/config/env.ts
- C:/Users/pc/Desktop/sanchay/apps/api/src/modules/identity/identity.schema.ts
- C:/Users/pc/Desktop/sanchay/packages/api-client/src/client.ts
- Recovered draft text for B1–B10 (read-only): C:/Users/pc/.claude/projects/C--Users-pc-Desktop-sanchay/2f00d411-382c-43a6-bd67-ecaf60c67db1/subagents/workflows/wf_1d1c9b02-593/agent-ae9924f43326b32c1.jsonl (line 189)

---

# Plan-01 MVP delta sheet: lean Sprint-1 foundation plan

Read-only planning. Nothing was created or changed. This sheet amends the Plan-01 interface sheet (`result.interfaceSheet`) and the 13 chunks (`result.planChunks`) under the MVP spec, H-1..H-21 and the planRecheck/finalCritic items. Where this sheet and those sources disagree, this sheet wins for Plan-01.

## 0. Headline (read first)

1. **Sprint 1 fits only after moving work out.**
   - Plan-01 capacity in S1 is 15.8 net minus 1.5 probe days = 14.3 ideal days (114 h). S1 commits 107.5 h (13.4 d), which leaves a 0.8 d buffer for environment setup.
   - **11.5 ideal days (92 h) move to S2**, task by task (§7).
2. **The MVP spec under-budgets Plan-01.** It books 19.0 d. The honest lean figure is **24.9 d (199.5 h)**.
   - The spec's S1 list (Dev A B1–B20, Dev B A1–A13 and C1–C6) already costs about 19 d by the roadmap's own per-task figures, and S2 still owed B21–B26 and C7–C15.
   - The MVP is therefore **about 6.0 d over the 80.4 d capacity** at the assumed AI factors.
   - Break-even measured AI factor for S2–S4 is **1.74**; with trims T1–T6 applied it is 1.65.
   - Recommendation: take the PO's one-line acknowledgement for T1–T6 at the **Fri 10-09** checkpoint rather than waiting for 10-23. If S1 measures below 1.4, bring the T7 decision forward to 10-23.
3. **The Fri 10-09 milestone "login works on web and Android" cannot be met by the spec's own allocation.**
   - Redefine 10-09 as: packages green, API platform plus OTP senders live under Testcontainers, contract and api-client conformance green, probe readout, CI ready for the first push (G-B2).
   - Login end to end on web and Android against the local API moves to **Wed 10-21**, before the 10-23 re-baseline.
   - The DLT template text (H-6) is still final and unit-tested by 10-09 (B12), so the 10-12 DLT submission (G-B4) is unaffected.
4. **Count after the lean rewrite: 54 tasks become 50.**
   - B18 is dropped.
   - Three merges: A9+A10, B7+B8, and B21+B22-lean.
5. **B3 crypto is kept.** It costs 5 h, the schema is built around `*_enc`/`*_bidx`, and it gains a `secrets` KeyService.

**Unit and AI-factor assumption:** 1 ideal day = 8 ideal hours (pre-AI human effort). S1 capacity = 2 devs × 9 days × 0.8 × **1.2** = 17.28, minus overheads 1.5 (review 0.5 per dev, FakeFp/sandbox 0.5 to Dev A), giving 15.78. S2–S4 use 1.6, per the MVP spec.

---

## 1. Task disposition (all 54 tasks)

Hours are lean ideal hours including the modifications. Owner A = Dev A (backend), B = Dev B (client).

| Old | Title | Disposition | Exact change | New | h | Owner, sprint |
|---|---|---|---|---|---|---|
| A1 | Repo bootstrap | MODIFY | Add to `pnpm-workspace.yaml`: `strictDepBuilds: true`, `minimumReleaseAge: 10080`, `minimumReleaseAgeExclude: []`, `blockExoticSubdeps: true`, `trustPolicy: no-downgrade`. Verify the key names against pnpm 11.27 docs in Step 1 and record any rename in ADR-0001. allowBuilds = the 12 entries A1 already writes (adds `'@nestjs/core': false`, `protobufjs: false` to sheet §3.3). Extend the **A1 rule**: a later task may add only an `allowBuilds` entry (on `ERR_PNPM_IGNORED_BUILDS`) or a `minimumReleaseAgeExclude` entry (on a release-age refusal), each with an ADR-0001 row that has an expiry. turbo.json gets `env`/`passThroughEnv` now (moved from C11). `.gitignore` adds `.npmrc`. New `docs/adr/README.md` with the H-18 index (0001–0015). New `AGENTS.md` (≤ 60 lines: sheet §0 conventions, `--filter=`, the edit-not-replace rule). | A1 | 5 | B, S1 |
| A2 | `@sanchay/config`, Biome, lefthook, gitleaks | MODIFY | Write the **final** root `biome.json` now (§4.2): A2's `overrides` plus `css.parser.tailwindDirectives`. Root package.json is a key-level edit, not a full replacement. | A2 | 4 | B, S1 |
| A3 | money decimal core | KEEP | Creates root `tsconfig.json`. | A3 | 3 | B, S1 |
| A4 | Money | KEEP | — | A4 | 3 | B, S1 |
| A5 | Units, Nav | KEEP | — | A5 | 3 | B, S1 |
| A6 | Formatting | KEEP | — | A6 | 3.5 | B, S1 |
| A7 | XIRR display (PO-5), ISO dates, holdingMoney | KEEP | Golden vectors are an MVP gate (G-E2). | A7 | 3 | B, S1 |
| A8 | Largest remainder | KEEP | Needed for allocation (T3 affects only the chart). | A8 | 1.5 | B, S1 |
| A9 | validation PAN/mobile/email | MERGE | Merged with A10 into one task and one commit series. | A9 | 3.5 | B, S1 |
| A10 | IFSC/pincode/OTP schemas | MERGE → A9 | as above | A9 | (incl.) | — |
| A11 | Amount and wire schemas | KEEP | — | A10 | 2.5 | B, S1 |
| A12 | `@sanchay/domain` enums | MODIFY | Enum pins in §5.7. `NOMINEE_ID_TYPES` without Aadhaar (H-12). OTP purposes per H-4. Add `LAUNCH_PLAN_FREQUENCIES` (H-15) and `LAUNCH_CLIENT_PLATFORMS`. Verify `CONSENT_SUBJECT_TYPES` and `LEGAL_DOCUMENT_KEYS` contain the MVP values (§5.7). | A11 | 4 | B, S1 |
| A13 | CI | MODIFY | Top-level `permissions: {}`, job `contents: read`, four actions pinned to commit SHAs (resolve with `git ls-remote`, add a version comment). Steps: install `--frozen-lockfile`, lint, `pnpm check-brand`, build, typecheck, test (env `SANCHAY_PLATFORM_ARN=ARN-000000`, `SANCHAY_PLATFORM_ARN_VALID_TILL=2099-12-31`), gitleaks (digest-pinned Docker image `gitleaks git --redact`), `pnpm audit --prod --audit-level=high`. Creates `scripts/check-brand.ts` with the R-19 allowlist, `scripts/check-brand.test.ts` (`node --test`), and root script `check-brand`. | A12 | 5 | B, S1 |
| B1 | api scaffold, ids, clock | KEEP | Renames only. | B1 | 3 | A, S1 |
| B2 | Env and boot guards | MODIFY | H-8 names (§5.2). Remove `SANCHAY_TRUST_EDGE_HEADERS`. Add `SANCHAY_CLIENT_IP_SOURCE` (socket\|alb, default socket), `SANCHAY_KEY_SERVICE` (local\|secrets), `SANCHAY_KEYRING_JSON`. Invariants 1–7 in §5.2 (7 = `SANCHAY_SMS_RETRIEVER_HASH` required outside local/test, R-10). | B2 | 3.5 | A, S1 |
| B3 | KeyService and Crypto | MODIFY (keep, cheap) | Add `SecretsKeyService.fromEnv(env)`, which parses `SANCHAY_KEYRING_JSON` (§5.2). `KeyService.otpPepper(kid)` and `currentOtpPepperKid`. Errors never echo key material. +3 tests. | B3 | 5 | A, S1 |
| B4 | pino redaction | MODIFY (small) | `REDACT_KEY_PATTERNS` must cover code, otp, smsCode, token, authorization, cookie, set-cookie, pan, dob, mobile, email, account, ifsc, name, address, nominee, keyring. +2 tests. | B4 | 2 | A, S1 |
| B5 | contract errors, common, health, openapi | MODIFY | Catalogue 62 → **66** (§5.6). `PlatformSchema = z.enum(LAUNCH_CLIENT_PLATFORMS)`. Prerequisites fixed (A9, A11, B1). Adds `@sanchay/contract` **and**, if absent, `@sanchay/domain` to apps/api. State in the file header: append-only; every addition regenerates `openapi.json`. | B5 | 4 | **B**, S1 |
| B6 | compose, Drizzle, Testcontainers | MODIFY | Bootstrap migration adds role `sanchay_migrator` (4 roles; test asserts 4). compose images digest-pinned (`@sha256:` resolved with `docker buildx imagetools inspect`). Root package.json, turbo.json and the apps/api `scripts` become **key edits** (§4). | B6 | 6 | A, S1 |
| B7 | Identity schema | MODIFY + MERGE B8 | MVP subset (§5.8). Adds the `@sanchay/domain` dependency itself if absent. Includes `0003_grants.sql` and the two grant tests. | B7 | 7 | A, S1 |
| B8 | Roles, grants | MERGE → B7 | as above | B7 | (incl.) | — |
| B9 | Error envelope | KEEP | — | B8 | 4 | A, S1 |
| B10 | Bootstrap, health | MODIFY | `clientIpFrom(req, source)`: socket (unmap `::ffff:`, `::1` → 127.0.0.1) or alb (rightmost X-Forwarded-For entry). Non-IPv4 → 422 `CLIENT_IP_UNSUPPORTED` (fail closed). Delete `parseViewerAddress` and its tests. `bodyLimit` 100 KiB. | B9 | 5 | A, S1 |
| B11 | OpenAPI drift | MODIFY | turbo edit only (add `openapi` key). | B10 | 2 | A, S1 |
| B12 | AuditService | MODIFY (small) | Allowlist adds `isNewDevice`, `challengeId`, `platform`. Action `AUTH_OTP_LOCKOUT`. | B11 | 2.5 | A, S1 |
| B13 | SMS/email ports, fakes, templates | MODIFY | H-6 texts. Move SMS templates to `apps/api/src/integrations/sms/templates.ts` (H-17 path) and email templates to `integrations/email/templates.ts`. Add `consentSmsText`, `consentUnitsSmsText`, `attestSmsText` and `renderConsentSms` (four DLT templates, R-10). Emit `docs/dlt/sms-templates.md` with the exact bodies for G-B4. | B12 | 4 | A, S1 |
| B14 | `OtpService.issue` | MODIFY | H-3 and H-5 (§5.4): `challengeId` = otp row id, HMAC input `purpose‖dest_bidx‖otp_row_id‖code` (R-14), 5 s send timeout (D-17, R-07), `destination_enc`, `pepper_kid`, lockout, 2,000/day global SMS cap. | B13 | 7 | A, **S2** |
| B15 | `OtpService.verify` | MODIFY | Verify by `{challengeId, purpose, code}`. Returns the decrypted destination. Lockout bookkeeping. | B14 | 5 | A, S2 |
| B16 | InvestorAccounts, DeviceTrust | MODIFY | `DeviceTrust` → `DeviceRegistry.upsert(exec, investorId, {platform, refHash, appVersion}) → {device, isNew}`. Remove findTrusted/trust. | B15 | 3 | A, S2 |
| B17 | SessionService | MODIFY | Remove `list`. `SESSION_POLICY` keys WEB and ANDROID only. Keep create/resolve/revoke/revokeAll. | B16 | 5 | A, S2 |
| B18 | Step-up token | **DROP** | Deferred to P2-3 (EXT E4). | — | 0 | — |
| B19 | Contract auth/me | MODIFY | Lean contract (§5.5). `.strict()` on every input, with a test. | B17 | 3.5 | **B**, S1 |
| B20 | Guards, cookies, `GET /auth/session` | MODIFY | `__Host-sanchay_si` (H-7). ClientGuard accepts `web\|android`; `ios` → 403 `ORIGIN_REJECTED`. DeviceRegistry replaces DeviceTrust. Keep the Step-0 cookie-helper spike. | B18 | 6 | A, S2 |
| B21 | OTP login flows | MODIFY (lean) + MERGE B22-lean | Sign-up and login only. Adds logout and revoke-all. | B19 | 6 | A, S2 |
| B22 | Session management | PARTIAL DROP | Logout and revoke-all merged into B19. List and revoke-one deferred to P2-3 (EXT E3). | B19 | (incl.) | — |
| B23 | Email add/verify | MODIFY | `me.requestEmailOtp {email}` → OtpSent; `me.verifyEmail {challengeId, code}`. | B20 | 4 | A, S2 |
| B24 | Throttler | KEEP | Basic rate limiting is non-negotiable. | B21 | 2 | A, S2 |
| B25 | Typed error round-trip | MODIFY (small) | Header `x-sanchay-client: android`. Appends the ADR-0003 record. | B22 | 2 | A, S2 |
| B26 | Runnable locally | MODIFY | H-8 `.env.example`. Key edits to root package.json and CI. Smoke test uses the challengeId shape. | B23 | 4 | A, S2 |
| C1 | Tokens | MODIFY | **No biome.json edit** (A2 owns the final file). Prerequisite A3. | C1 | 3 | B, S1 |
| C2 | api-client errors and conformance | MODIFY | 9 conformance rows (§5.5). | C2 | 3 | B, S1 |
| C3 | api-client transports | MODIFY | Native `platform: 'android'` only. | C3 | 3.5 | B, **S2** |
| C4 | ui batch 1 | KEEP | Adds a stub for ADR-0002 (RN StyleSheet plus tokens; Uniwind deferred). | C4 | 5 | B, S1 |
| C5 | ui inputs | KEEP | — | C5 | 4 | B, S1 |
| C6 | app-core | MODIFY | `copy/` folder; the single legal-entity module is `packages/domain/src/legal-entity.ts` (R-19), re-exported by `@sanchay/app-core/copy`. Copy for all 66 codes, enforced by a test. | C6 | 3.5 | B, S2 |
| C7 | useOtpLogin | MODIFY (lean) | PHONE → SMS_OTP → DONE with `challengeId`. EMAIL_OTP removed (P2-3). | C7 | 3 | B, S2 |
| C8 | Contexts, Login, Welcome | MODIFY | Email step and "Start again" removed. | C8 | 4 | B, S2 |
| C9 | Home, AppShell, useSignOut | MODIFY | 4-destination nav (H-14). AccountScreen with Log out and Sign out everywhere. Placeholders for Explore and Portfolio. | C9 | 5 | B, S2 |
| C10 | Web routing, CSP, proxy | MODIFY | H-1 route model (§6 C4). | C10 | 5 | B, S2 |
| C11 | Web wiring and shell smoke | MODIFY | Root routes, `/site/*` www rewrite, no turbo edit, 4 nav routes. | C11 | 6 | B, S2 |
| C12 | Web e2e | MODIFY | turbo key edit. Playwright smoke job in CI (MVP gate). | C12 | 5 | B, S2 |
| C13 | Mobile libraries | MODIFY | `EXPO_PUBLIC_SANCHAY_*` names. `coldStartDecision` SIGN_OUT kept as D-18. | C13 | 3 | B, S2 |
| C14 | Expo wiring | MODIFY | 4 tabs, expo-screen-capture on login/signup, H-13 lock options, Android only. | C14 | 7 | B, S2 |
| C15 | Maestro smoke | MODIFY | Local only: `signup` and `relaunch-without-screen-lock` (logout optional). **First Plan-01 trim candidate**: replace with the G-E6 manual checklist and move Maestro to E7 (saves 3 h). | C15 | 3 | B, S2 |

Totals: Part A 41.0 h · Part B 95.5 h · Part C 63.0 h = **199.5 h (24.9 d)**.

## 2. Mapping old → new

- **Part A:** A1→A1, A2→A2, A3→A3, A4→A4, A5→A5, A6→A6, A7→A7, A8→A8, **A9+A10→A9**, A11→A10, A12→A11, A13→A12.
- **Part B:** B1→B1, B2→B2, B3→B3, B4→B4, B5→B5, B6→B6, **B7+B8→B7**, B9→B8, B10→B9, B11→B10, B12→B11, B13→B12, B14→B13, B15→B14, B16→B15, B17→B16, **B18→DROPPED**, B19→B17, B20→B18, **B21+B22(logout, revoke-all)→B19**, B23→B20, B24→B21, B25→B22, B26→B23.
- **Part C:** C1..C15 keep their numbers.
- **Renumbering rule:** every chunk uses the new ids everywhere, including "Consumes (Bx)" citations. The first line of each task carries a one-line "(was Bxx)" note.

## 3. Corrected DAG (new ids) and waves

**Part A**

| Task | Prerequisites |
|---|---|
| A1 | — |
| A2 | A1 |
| A3 | A2 |
| A4 | A3 |
| A5 | A4 |
| A6 | A5 |
| A7 | A6 |
| A8 | A7 |
| A9 | A3 |
| A10 | A9, A6 |
| A11 | A7 |
| A12 | A8, A10, A11 |

**Part B**

| Task | Prerequisites |
|---|---|
| B1 | A2 |
| B2 | B1 |
| B3 | B1, B2 |
| B4 | B2 |
| **B5** | **A9, A11, B1** (recheck fix) |
| B6 | B1 |
| **B7** | **B6, A11** (B7 declares `@sanchay/domain` itself; this replaces the recheck's "B7←B5", which only existed because B5 added the dependency) |
| B8 | B5, B1 |
| B9 | B2, B3, B4, B6, B8 |
| B10 | B9, B5 |
| B11 | B9, B6 |
| B12 | B9, B7 |
| B13 | B3, B7, B8, B12 |
| B14 | B13 |
| B15 | B3, B7, B8, B12 |
| **B16** | **B7, B3, B8** (recheck fix) |
| B17 | B5, B10 |
| **B18** | **B11, B13, B15, B16, B17** (recheck fix) |
| B19 | B14, B15, B16, B18 |
| B20 | B19 |
| B21 | B19 |
| B22 | B19, B17 |
| B23 | B20, B21, B22 (always last in Part B) |

**Part C**

| Task | Prerequisites |
|---|---|
| **C1** | **A2, A3** (recheck fix) |
| C2 | B17 |
| C3 | C2 |
| C4 | C1 |
| C5 | C4 |
| C6 | C3, A9 |
| C7 | C6 |
| C8 | C5, C7 |
| C9 | C8 |
| C10 | A2 |
| C11 | C9, C10 |
| C12 | C11, B23 |
| C13 | A2 |
| C14 | C9, C13 |
| C15 | C14, B23 |

**Waves.** The single reviewer per developer is the throttle; agents may run tasks in parallel worktrees inside a wave.

| Wave | Dates (S1: 9 working days; S2: 9) | Dev A | Dev B |
|---|---|---|---|
| W0 | Mon 09-28 → Tue 09-29 | Machine setup (Node 24.21.0, pnpm 11.27.0, Docker, gitleaks, Android SDK), Cybrilla sandbox access, probes P-04/P-05 scaffold (probe budget) | A1 → A2 |
| W1 | Tue 09-29 → Mon 10-05 | B1 → B2 → B3 → B4 → B6 | A3 → A4 → A5 → A6 → A7 → **A11** (domain early, which unblocks B7) |
| W2 | Mon 10-05 → Wed 10-07 | B7 (after A11) → B8 (after B5) → B9 | A9 → **B5** → A8 → A10 |
| W3 | Wed 10-07 → Fri 10-09 | B10 → B11 → B12; finish probes; B13 only if slack | A12 (CI) → C1 → C4 → C5 → B17 (after B10) → C2 |
| W4 | Mon 10-12 → Fri 10-16 | B13 → B14; B15 ∥ B16 → B18 → B19 | C3 → C6 → C7 → C8 → C9; C10 ∥ C13 as fillers |
| W5 | Mon 10-19, Wed 10-21 (Tue 10-20 is a holiday) | B20 ∥ B21 ∥ B22 → B23 | C11 → C14 → C12 (after B23) → C15 |

After W5, S2 continues with kernel, catalogue and onboarding.

---

## 4. Config-file ownership

**Rule (goes in the plan header).** Exactly one task **creates** each shared file. Every later task makes a **key-level edit** and shows only the fragment it adds, plus a "resulting file must equal §4.x final state" check. Full-file replacement of a shared file after its creator is forbidden. That removes the B6/B11/C11/C12/C1/B26 replacement pattern.

### 4.1 `pnpm-workspace.yaml`
- **A1** writes the complete file:
  - `packages` (apps/*, packages/*, tools/*)
  - `nodeLinker: hoisted`, `engineStrict: true`, `strictDepBuilds: true`
  - `minimumReleaseAge: 10080`, `minimumReleaseAgeExclude: []`, `blockExoticSubdeps: true`, `trustPolicy: no-downgrade`
  - `allowBuilds`, 12 entries, alphabetical: `'@nestjs/core': false`, `'@node-rs/argon2': true`, `'@swc/core': true`, `'@tailwindcss/oxide': true`, `cpu-features: false`, `esbuild: true`, `lefthook: true`, `msw: false`, `protobufjs: false`, `sharp: true`, `ssh2: false`, `unrs-resolver: true`
  - `catalog` (sheet §3.3)
- **Later tasks** may only append an `allowBuilds` entry or a `minimumReleaseAgeExclude` entry under the A1 rule, each with an ADR-0001 row. Nobody edits `catalog:`.

### 4.2 `biome.json`
**A2** writes this final file. No other task edits it, except that C15 may append one override for `apps/mobile/.maestro/scripts/**`, and only if `pnpm lint` fails on the Maestro GraalJS globals.
```json
{ "$schema": "./node_modules/@biomejs/biome/configuration_schema.json",
  "extends": ["@sanchay/config/biome"],
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true, "defaultBranch": "main" },
  "files": { "ignoreUnknown": true, "includes": ["**", "!apps/api/openapi.json", "!!apps/api/drizzle/meta"] },
  "css": { "parser": { "tailwindDirectives": true } },
  "overrides": [ { "includes": ["apps/api/src/**", "apps/api/test/**"],
                   "linter": { "rules": { "style": { "useImportType": "off" } } } } ] }
```

### 4.3 `turbo.json`
Final state:

| Key | Content | Owner |
|---|---|---|
| `$schema`, `ui:"stream"` | — | A1 |
| `build` | `dependsOn ["^build"]`, outputs `["dist/**", ".next/**", "!.next/cache/**"]`, **`env ["SANCHAY_*", "EXPO_PUBLIC_*"]`** | A1 |
| `typecheck` | `dependsOn ["^build"]`, `outputs []`, **`passThroughEnv ["SANCHAY_*"]`** | A1 |
| `test` | `dependsOn ["^build"]`, outputs `["coverage/**"]`, **`passThroughEnv ["SANCHAY_*"]`** | A1 |
| `dev` | `dependsOn ["^build"]`, `cache false`, `persistent true` | A1 |
| `test:int` | `dependsOn ["^build"]`, `cache false`, **`passThroughEnv ["DOCKER_*", "TESTCONTAINERS_*"]`** | B6 (edit) |
| `db:check` | `cache false` | B6 (edit) |
| `openapi` | `dependsOn ["^build"]`, outputs `["openapi.json"]` | B10 (edit) |
| `e2e:web` | `dependsOn ["build"]`, `cache false`, **`passThroughEnv ["SANCHAY_*", "MAILPIT_URL", "PLAYWRIGHT_*"]`** | C12 (edit) |

C11 no longer touches turbo.json. `lint` and `check-brand` stay root scripts, not turbo tasks.

### 4.4 Root `tsconfig.json`
- **A3** creates `{ "files": [], "references": [{ "path": "packages/money/tsconfig.build.json" }] }`.
- These tasks append one reference each, in merge order: A11 domain, A9 validation, B5 contract, C1 tokens, C2 api-client. Array order does not matter.
- C1's "if missing, create" branch is removed, because C1 now requires A3.

### 4.5 Root `package.json`

| Change | Owner |
|---|---|
| Create: name `sanchay`, private, type module, `packageManager pnpm@11.27.0`, engines, scripts `build`/`typecheck`/`test`, devDeps `turbo`, `typescript` | A1 |
| Add scripts `lint`, `format`, `verify`; devDeps `@biomejs/biome`, `@sanchay/config`, `lefthook` | A2 |
| Add scripts `test:int`, `db:up` | B6 |
| Add script `check-brand` = `node scripts/check-brand.ts` | A12 |
| Add script `db:migrate` | B23 |
| Add script `e2e:web` = `turbo run e2e:web --filter=@sanchay/web` | C12 |

### 4.6 `.npmrc`
No task creates one. pnpm 11 reads registry and auth only from it. A1 git-ignores it; tokens live only in the user-level `~/.npmrc`.

### 4.7 Other shared files

| File | Creator | Later edits |
|---|---|---|
| `.gitignore` | A1 (incl. `.npmrc`) | C11 appends 4 web lines; C14 appends 4 mobile lines; B23 only verifies |
| `lefthook.yml` | A2 | none |
| `.gitleaks.toml` | A2 | narrow regex additions only, in the same commit as the fixture |
| `.github/workflows/ci.yml` | A12 | B23: 2 steps + timeout 30; C12: `e2e-web` job |
| `docs/adr/0001-versions.md` | A1 | append table rows only (4 columns) |
| `docs/adr/README.md` | A1 | append rows |
| `compose.yaml` | B6 | none |
| `apps/api/package.json` | B1 | B5 adds `@sanchay/contract` (and domain if absent); B7 adds `@sanchay/domain` if absent; B6 edits only the `db:generate` key |
| `apps/api/.env.example` | B23 | none |

---

## 5. Canonical names under the harmonized rulings

### 5.1 Cookies (H-7)

| Name | Attributes | Notes |
|---|---|---|
| `__Host-sanchay_sid` | HttpOnly, Secure, SameSite=Lax, Path=/, host-only on app.sanchay.in | web idle 30 min, absolute 12 h |
| `__Host-sanchay_si` | value `1`; not HttpOnly; Secure, Lax, Path=/, no Domain; same Max-Age | never trusted |
| `__Host-sanchay_dev` | 400 days | — |
| `__Host-sanchay_ops` | — | reserved (P2) |

- Constant: `SESSION_INDICATOR_COOKIE = '__Host-sanchay_si'` in B18 `cookies.ts` and C10 `routing.ts`.
- Web: `hasSessionCookie = has('__Host-sanchay_si') || has('__Host-sanchay_sid')`.
- CSRF: SameSite=Lax + `Origin` = `SANCHAY_APP_ORIGIN` + `Sec-Fetch-Site: same-origin` + `x-sanchay-client: web`.

### 5.2 Environment (H-8)

**API variables**
- `SANCHAY_APP_ENV` (local|test|dev|staging|prod), `SANCHAY_APP_ROLE` (api|worker|migrate), `HOST`, `PORT` (3000), `SANCHAY_LOG_LEVEL`, `DATABASE_URL`, `SANCHAY_DB_POOL_MAX`, `SANCHAY_APP_ORIGIN`.
- **`SANCHAY_CLIENT_IP_SOURCE`** (socket|alb; replaces `SANCHAY_TRUST_EDGE_HEADERS`).
- **`SANCHAY_KEY_SERVICE`** (local|secrets; kms refused).
- Local mode: `SANCHAY_LOCAL_PII_KEY`, `SANCHAY_LOCAL_BIDX_KEY`, `SANCHAY_OTP_PEPPER`, `SANCHAY_AUTH_TOKEN_KEY`.
- **`SANCHAY_KEYRING_JSON`** (secrets mode): `{"currentKid":1,"pii":{"1":b64},"bidx":b64,"otpPepper":{"1":b64},"authToken":b64}`, all keys 32 bytes. ECS injects it from Secrets Manager `sanchay/{env}/keyring` into the api and worker containers only.
- `SANCHAY_PROVIDER_MODE_SMS` / `_EMAIL` (capture|mailpit; msg91/ses come with the S2 kernel), `SANCHAY_MAILPIT_URL`, `SANCHAY_SMS_RETRIEVER_HASH`, `SANCHAY_THROTTLE_PER_MINUTE`, `SANCHAY_OTP_PER_IP_PER_HOUR`.
- Declared later by the S2 kernel (not in Plan-01): `SANCHAY_PROVIDER_MODE_FP`, `SANCHAY_FP_WEBHOOK_AUTH`, `SANCHAY_PILOT_INVITE_ONLY`, `SANCHAY_API_ORIGIN` (API side).

**Web variables:** `SANCHAY_PLATFORM_ARN`, **`SANCHAY_PLATFORM_ARN_VALID_TILL`** (ISO date), `SANCHAY_APP_ORIGIN`, `SANCHAY_WWW_ORIGIN`, `SANCHAY_API_ORIGIN`.

**Expo variables:** `EXPO_PUBLIC_SANCHAY_API_BASE_URL`, `EXPO_PUBLIC_SANCHAY_APP_ORIGIN`, `EXPO_PUBLIC_SANCHAY_WWW_ORIGIN`.

**Unprefixed exceptions:** DATABASE_URL, PORT, HOST, NODE_ENV, APP_VARIANT; `MAILPIT_URL` in e2e tooling only.

**B2 boot invariants** (each throws `EnvError` with a regex-tested message)

| # | Rule |
|---|---|
| 1 | staging\|prod with a capture/mailpit provider → refused |
| 2 | `local` keyring outside local/test → refused |
| 3 | `kms` → "not available in this build" |
| 4 | local mode missing any of its 4 keys, or secrets mode with a keyring JSON that is invalid or has wrong-length keys → refused |
| 5 | `SANCHAY_OTP_PER_IP_PER_HOUR ≠ 20` outside local/test → refused |
| 6 (new) | `SANCHAY_CLIENT_IP_SOURCE ≠ alb` outside local/test → refused |
| 7 (R-10) | `SANCHAY_SMS_RETRIEVER_HASH` unset outside local/test → refused |

**H-8 addendum (R-19).** Every new variable and its owning container: `SANCHAY_KEYRING_JSON` (api, worker), `SANCHAY_LOG_LEVEL` (api, worker, migrate), `SANCHAY_DB_POOL_MAX` (api, worker), `SANCHAY_THROTTLE_PER_MINUTE` (api), `SANCHAY_SMS_RETRIEVER_HASH` (api) are declared by B2; `SANCHAY_MSG91_CREDENTIALS_JSON` (api, worker), `SANCHAY_SES_FROM` (api, worker), `SANCHAY_FP_BASE_URL` and `SANCHAY_FP_CREDENTIALS_JSON` (worker only), `SANCHAY_FP_WEBHOOK_SECRET` (api) are declared by the Plan-02 kernel.

**Guard exemptions (R-11).** `GET /api/v1/health`, `POST /api/v1/webhooks/fp` and `GET|POST /api/v1/pg/return/*` skip ClientGuard, SessionGuard and the throttler through B18's `InfraRoute(hosts)` decorator (`INFRA_ROUTE` metadata) and are restricted only by HostGuard (webhook and returns on `api.sanchay.in`, health on both hosts).

### 5.3 Transport
- API prefix `/api/v1` on every host: `API_PREFIX='api/v1'` in `bootstrap.ts` and `'/api/v1'` in the api-client.
- Native base: `https://api.sanchay.in/api/v1`. Web: same-origin `https://app.sanchay.in/api/v1`.
- Local: API on :3000, web on :3001 with a rewrite. Emulator: `http://10.0.2.2:3000/api/v1`.
- `x-sanchay-client`: **`web` | `android`**. `ios` and a missing header → 403 `ORIGIN_REJECTED` (iOS is P2-10).
- Native also sends `x-app-version`, `x-installation-id` (UUID) and `authorization: Bearer <43 chars>`.
- Client IP = the rightmost X-Forwarded-For entry in alb mode. Non-IPv4 → 422 `CLIENT_IP_UNSUPPORTED`.
- HostGuard (cookie only on the app host, bearer/webhooks/returns only on the api host, mismatch → 404) is in the **S2 kernel**, not Plan-01.

### 5.4 OTP (H-3, H-4, H-5, H-6)

**Policy**
- Code: 6 digits via `crypto.randomInt`. TTL 5 min. 5 attempts. **Flat 30 s cooldown.**
- Quotas: 5 per destination per hour; 15 per day; 20 per IPv4 per hour; 10 per device per hour.
- **Lockout:** 3 codes burned as LOCKED for the same (purpose, destination) within 60 min → further issues refused for 30 min with 429 `RATE_LIMITED` plus `retryAfterSeconds`, and audit `AUTH_OTP_LOCKOUT`.
- **Global cap:** 2,000 SMS per IST day, counted over `otp_codes` channel SMS. Above it → 503 `SMS_UNAVAILABLE` plus an error log `otp.sms_daily_cap`.
- There is no bypass, master code or dev endpoint in any build.

**Purposes (closed enum used by the DB CHECK):** `LOGIN, NEW_DEVICE_STEPUP, EMAIL_FALLBACK_LOGIN, VERIFY_EMAIL, CONSENT, CONTACT_CHANGE_OLD, CONTACT_CHANGE_NEW, REAUTH`.
- Active in the MVP: LOGIN (SMS), VERIFY_EMAIL (email), CONSENT (SMS and email; S3).
- Any other purpose → plain `Error` (INTERNAL).

**Storage and HMAC (pinned by R-14)**
- `code_hmac = HMAC-SHA256(pepper[pepper_kid], `${purpose}|${destBidxHex}|${otpRowId}|${code}`)`, i.e. `purpose‖dest_bidx‖otp_row_id‖code`, compared with `timingSafeEqual`. The same input is used by B13 (issue), B14 (verify) and the consent engine.
- For LOGIN and VERIFY_EMAIL, `challengeId` **is** `otp_codes.id`. CONSENT rows carry `reference_id = consent_challenges.id` (S3), and their HMAC still binds the otp row id, never the consent challenge id.

**Shape**
- `POST /auth/otp {mobile}` → **200** `{challengeId: uuid, expiresInSeconds: 300, resendAfterSeconds: 30}`, identical for every mobile.
- `POST /auth/otp/verify {challengeId, code}` → `SignedIn`.
- The send is synchronous (accepted deviation D-17, ruling R-07): the provider gets at most 5 s (`OTP_POLICY.sendTimeoutMs`). On provider failure or timeout the row is deleted and the call returns 503 `SMS_UNAVAILABLE` (email: 503 `PROVIDER_UNAVAILABLE`). Phase 2 may move the send to pg-boss with the same 200 shape.

**SMS templates** (`apps/api/src/integrations/sms/templates.ts`; four DLT templates per R-10)
```ts
export const WEBOTP_DOMAIN = 'app.sanchay.in';
export const SMS_TEMPLATE_IDS = {
  LOGIN: 'SANCHAY_LOGIN_OTP_V1',
  CONSENT: 'SANCHAY_CONSENT_OTP_V1',
  CONSENT_UNITS: 'SANCHAY_CONSENT_UNITS_OTP_V1',
  ATTEST: 'SANCHAY_ATTEST_OTP_V1',
} as const;
// Every template: line 1 text, line 2 the SMS Retriever hash ({#var#}; required outside local/test by
// B2 invariant 7), line 3 `@app.sanchay.in #${code}` (WebOTP line ALWAYS last).
// loginSmsText(code, hash?):          `${code} is your Sanchay login OTP. Valid 5 min. Never share it; Sanchay staff never ask for it. -Platizio`
// consentSmsText({code, action, amount, schemeShort}, hash?):
//                                     `${code} is your OTP to ${action} Rs ${amount} in ${schemeShort} on Sanchay. Valid 5 min. Never share it. -Platizio`
// consentUnitsSmsText({code, units, schemeShort}, hash?)  (units '12.345' or 'all'):
//                                     `${code} is your OTP to redeem ${units} units of ${schemeShort} on Sanchay. Valid 5 min. Never share it. -Platizio`
// attestSmsText(code, hash?):         `${code} is your OTP to confirm your Sanchay account details. Valid 5 min. Never share it. -Platizio`
// renderConsentSms(sms: ConsentSms, code, hash?) → {templateId, text}; B13 uses it for purpose CONSENT over SMS.
```
- Tests: for all four templates the last line matches `/^@app\.sanchay\.in #\d{6}$/` with and without a hash, and with a hash the body has exactly three lines with the hash penultimate.
- Counsel/CO sign-off of the four texts before the Mon 10-12 filing (PB-32a).

**Email templates** (`integrations/email/templates.ts`)
- `EMAIL_TEMPLATE_IDS.OTP = 'SANCHAY_EMAIL_OTP_V1'`.
- `emailOtpMessage(code, purpose: 'VERIFY_EMAIL'|'CONSENT')`, subject "Your Sanchay verification code".
- Actions: VERIFY_EMAIL "verify your email address"; CONSENT "approve your transaction".

### 5.5 Lean contract (B17)

**Procedures**
- `health.live`, `health.ready`
- `auth.requestOtp` POST `/auth/otp`
- `auth.verifyOtp` POST `/auth/otp/verify`
- `auth.session` GET `/auth/session`
- `auth.logout` POST `/auth/logout`
- `auth.revokeAll` POST `/auth/sessions/revoke-all`
- `me.requestEmailOtp` POST `/me/email/otp`
- `me.verifyEmail` POST `/me/email/verify`

These are 9 procedures and the 9 C2 conformance rows. Removed and deferred to P2-3: `auth.verifyEmail`, `auth.emailFallback`, `auth.listSessions`, `auth.revokeSession`, plus `StepUpRequiredSchema`, `VerifyOtpResultSchema`, `EmailFallbackSentSchema` and `SessionListItemSchema`.

**Schemas**
- `OtpSentSchema {challengeId: z.uuid(), expiresInSeconds, resendAfterSeconds}`.
- `SignedInSchema {status: z.literal('SIGNED_IN'), investorId, isNewInvestor, session: SessionInfoSchema}`. `token` is native-only.
- `SessionSummarySchema`: platform is `z.enum(LAUNCH_CLIENT_PLATFORMS)`; `investor.status` is `z.enum(INVESTOR_STATUSES)`.

**Errors per procedure**

| Procedure | Declared errors |
|---|---|
| `auth.verifyOtp` | COMMON, OTP_INVALID, OTP_EXPIRED, OTP_LOCKED, FORBIDDEN, CONFLICT_VERSION, **PILOT_INVITE_REQUIRED** (implemented by the S2 invite gate) |
| `auth.requestOtp` | COMMON, OTP_COOLDOWN, SMS_UNAVAILABLE |
| `me.requestEmailOtp` | COMMON, SESSION, OTP_COOLDOWN, PROVIDER_UNAVAILABLE, IDEMPOTENCY_KEY_REQUIRED, IDEMPOTENCY_KEY_REUSED, IDEMPOTENCY_IN_PROGRESS |
| `me.verifyEmail` | COMMON, SESSION, OTP_INVALID, OTP_EXPIRED, OTP_LOCKED, plus the three IDEMPOTENCY codes |

The idempotency codes are declared now; enforcement arrives with the S2 kernel interceptor. Every input object uses `.strict()`.

### 5.6 Error catalogue (H-10)
- `ERROR_CATALOGUE` becomes **66 codes**: add `SUITABILITY_CHANGED` 409, `RISK_PROFILE_EXPIRED` 409, `RISK_PROFILE_STALE` 409, `PILOT_INVITE_REQUIRED` 403. The 409 bucket goes from 26 to 29 and the 403 bucket from 3 to 4.
- Names are confirmed: `COOLING_OFF_ACTIVE` (never `COOL_OFF`), `APP_VERSION_UNSUPPORTED` (never `APP_UPDATE_REQUIRED`).
- `PILOT_CAP` is a field code under `AMOUNT_ABOVE_MAX`. `TAX_CLASS_MISSING` is not a code.
- `STEP_UP_REQUIRED` stays in the catalogue as reserved; no MVP procedure declares it.
- C6's `messageForError` has copy for **every** catalogue code, enforced by a test.

### 5.7 Enum pins (A11, `@sanchay/domain`)
- `PLAN_FREQUENCIES = ['MONTHLY','QUARTERLY','DAILY_BUSINESS','DAILY_CALENDAR']`; `LAUNCH_PLAN_FREQUENCIES = defineEnum(['MONTHLY'])`.
- `NOMINEE_ID_TYPES = ['PAN','DRIVING_LICENCE','PASSPORT']`. Aadhaar is removed and never stored (ESC-5 closed).
- `MAX_NOMINEES = 3`.
- `LAUNCH_SCHEME_OPTIONS = ['GROWTH']`.
- `OTP_PURPOSES` per §5.4.
- `CLIENT_PLATFORMS = ['WEB','ANDROID','IOS']` (reserved); **`LAUNCH_CLIENT_PLATFORMS = defineEnum(['WEB','ANDROID'])`**, used by DB CHECKs and the contract.
- `CONSENT_SUBJECT_TYPES` must include PURCHASE, REDEMPTION, SIP_REGISTRATION, MANDATE_REGISTRATION, ONBOARDING_ATTEST.
- `LEGAL_DOCUMENT_KEYS` must include TNC, PRIVACY_NOTICE, RISK_DISCLOSURE, REGULAR_PLAN_COMMISSION, EXECUTION_ONLY_DECLARATION, FATCA_CRS_DECLARATION, KYC_CONSENT, NOMINATION_OPT_OUT_ANNEX_B, SUITABILITY_WARNING, TPL_PURCHASE, TPL_REDEMPTION, TPL_SIP_REGISTRATION, TPL_MANDATE_REGISTRATION, TPL_ONBOARDING_ATTEST, TPL_NOMINATION_OPT_OUT. Append any that are missing.
- Tests pin all of the above. QUARTERLY and AADHAAR_LAST4 are rejection vectors.

### 5.8 Schema deltas (B7)

| Table | Change |
|---|---|
| `investor_devices` | Drop `trusted_at`, `consent_key_enc`, `consent_key_registered_at`, `push_token_enc` (P2 adds them back with an additive migration). Platform CHECK = `LAUNCH_CLIENT_PLATFORMS`. |
| `auth_sessions` | Platform CHECK = `LAUNCH_CLIENT_PLATFORMS`. |
| `otp_codes` | Add **`destination_enc bytea NOT NULL`** (AAD `otp_codes.destination_enc:<id>`; needed because verify no longer receives the mobile or email) and **`pepper_kid smallint NOT NULL`**. Purpose CHECK = the full H-4 enum. |

Everything else follows sheet §5.5. Roles: `sanchay_migrator`, `sanchay_app`, `sanchay_readonly`, `sanchay_retention`.

### 5.9 Navigation (H-14) and app lock (H-13)
- Navigation: Home · Explore · Portfolio · Account. Web routes `/`, `/explore`, `/portfolio`, `/account`. Native uses `(tabs)`.
- App lock: `coldStartDecision` → SIGN_OUT when no device auth is enrolled (D-18). Otherwise `authenticateAsync({biometricsSecurityLevel:'strong', disableDeviceFallback:false, promptMessage:'Unlock Sanchay'})` on cold start and after 5 min in the background. No PIN.

### 5.10 Brand lint (H-17, allowlist replaced by R-19)
- `check-brand` fails on `plz`, `PLZ_`, `@plz/`, `platizio.in`, `platizio://`, or "Platizio".
- Allowed only in (R-19, exactly):
  - `docs/**`
  - `scripts/check-brand*.ts`
  - `apps/api/src/integrations/sms/templates*.ts`
  - the single `packages/domain/src/legal-entity.ts` (`LEGAL_ENTITY_NAME`, `dsc02`; C6 creates it, app-core, web, email and SMS import it)
  - lines containing `platizio.com`, `/v2/auth/platizio/`, or the quoted tenant id `'platizio'`; the retired identifiers are checked first, so such a line can never carry `platizio.in` or `platizio://`

### 5.11 Register updates to carry in the plan header

| Item | Update |
|---|---|
| D-17 | Synchronous 200 OtpSent (H-5) |
| D-18 | No-lock devices sign out on cold start (H-13) |
| D-19 | `LAUNCH_CLIENT_PLATFORMS` (iOS rejected) |
| D-20 | `otp_codes.destination_enc` and `pepper_kid` |
| D-6 | Obsolete (step-up dropped) |
| D-11 | EdgeGuard replaced by HostGuard in the S2 kernel |
| Escalations | ESC-1 closed by H-1; ESC-2 by H-13; ESC-5 by H-12. ESC-3 accepted. ESC-4 goes to ADR-0002. There is no ESC-6. |
| New env name | `SANCHAY_KEYRING_JSON` is acknowledged by the H-8 addendum (R-19) |
| D-17 (R-07) | Synchronous OTP send accepted by the owner; 5 s provider timeout, 503 `SMS_UNAVAILABLE` |

---

## 6. Rewrite instructions per old chunk (none is dropped whole)

**Rules for every rewrite**
- Use the new ids.
- Commands are one per line and work in both PowerShell 5.1 and Git Bash.
- Env commands get two variants: `$env:X='v'; cmd` and `X=v cmd`.
- Filters use the `--filter=@sanchay/x` form.
- Shared-file changes are key-level edits per §4.
- Step 5 runs `biome check --write` and then `pnpm lint` before committing.

**Chunk A1 (A1–A4) → A1–A4.**
- A1: apply the §1 row. Add the full H-16 key block with a Step 1 check of key names against pnpm 11.27. Reuse A1's 12-entry allowBuilds. Write turbo.json with env/passThroughEnv already set. Add AGENTS.md, `docs/adr/README.md` (H-18 index) and `.npmrc` in `.gitignore`.
- A2: the final biome.json from §4.2; a package.json edit, not a replacement.
- A3, A4: unchanged apart from the new ids.

**Chunk A2 (A5–A8) → A5–A8.** No content change. Keep the PO-5 table in A7.

**Chunk A3 (A9–A13) → A9 (merged), A10, A11, A12.**
- A9 = old A9 and A10 steps, run back to back inside one task: PAN/mobile/email, then IFSC/pincode/OTP. One Files list; the tests keep both files.
- A10 = old A11.
- A11 = old A12 with §5.7. Delete the "keeps AADHAAR_LAST4" text and the ESC-5/6 notes.
- A12 = old A13 with the §1 CI row, `scripts/check-brand.ts` plus `node --test`, and the ARN fixture check updated to both ARN variables on the build, typecheck and test steps. Prerequisites: A8, A10, A11.

**Chunk B1 (B1–B5) → B1–B5.**
- B1: renames; `TableName` unchanged.
- B2: §5.2 schema and invariants 1–7 (7 from R-10). Tests: the 9 existing plus invariant 6, secrets-mode parse and the TRUST_EDGE removal (about 12).
- B3: add SecretsKeyService and the pepper kid.
- B4: the redaction key list.
- B5: prerequisites A9, A11, B1; 66 codes; `LAUNCH_CLIENT_PLATFORMS`; append-only header note; owner Dev B.

**Chunk B2 (B6–B10) → B6, B7 (old B7 + B8), B8 (old B9), B9 (old B10).**
- B6: `sanchay_migrator`, digest pins, and edit-only for root package.json, turbo.json and the apps/api `db:generate` key. The turbo `test:int` key must include the passThroughEnv.
- B7: §5.8 plus the old B8 grants migration and tests. B7 adds the `@sanchay/domain` dependency. Prerequisites: B6, A11.
- B8: renames only.
- B9: IP source socket/alb, remove the viewer-address code, 100 KiB body limit, `testEnv` uses `SANCHAY_CLIENT_IP_SOURCE: 'socket'`. The `health.ready` DB check stays.

**Chunk B3 (B11–B15) → B10 (old B11), B11 (old B12), B12 (old B13), B13 (old B14), B14 (old B15).**
- B10: a turbo key edit adds `openapi`.
- B11: allowlist and actions.
- B12: the §5.4 four DLT templates (R-10) in the H-17 paths, `consentSmsText`, `consentUnitsSmsText`, `attestSmsText`, `renderConsentSms`, `docs/dlt/sms-templates.md`, Mailpit subject `SMS [SANCHAY_LOGIN_OTP_V1]`, and tests for last-line order and byte-exact golden strings.
- B13: §5.4. Check order: lockout, cooldown, per-destination hour/day, per-IP, per-device, global SMS cap. Then the tx (supersede and insert with `destination_enc`/`pepper_kid`), then send, then record the provider. Returns `IssuedOtp {challengeId, expiresAt, resendAfterSeconds, destinationMasked}`. Tests: the existing set plus lockout, the 2,001st SMS, and an email of purpose VERIFY_EMAIL.
- B14: `verify(exec, {challengeId, purpose, code}) → {otpId, channel, destination, destinationBidx}`. New tests: wrong purpose → OTP_INVALID; a superseded challenge → OTP_INVALID. The attempt counter still auto-commits.

**Chunk B4 (B16–B20) → B15 (old B16), B16 (old B17), B17 (old B19), B18 (old B20); old B18 removed.**
- B15: `DeviceRegistry`.
- B16: remove `list`; WEB and ANDROID policy only; prerequisites B7, B3, B8.
- B17: the §5.5 contract; `.strict()` test; regenerate `openapi.json`; owner Dev B.
- B18: `__Host-sanchay_si`; ClientGuard `web|android`; module providers `[OtpService, InvestorAccounts, DeviceRegistry, SessionService, AccountSessions, SessionGuard]`; prerequisites B11, B13, B15, B16, B17. Keep the X-19 Step-0 fallback.

**Chunk B5 (B21–B26) → B19 (old B21 + B22-lean), B20, B21, B22, B23.**
- B19:
  - `AuthService.requestLoginOtp(mobile)` and `verifyLoginOtp(challengeId, code)`.
  - Steps: verify in the tx; find or create the investor (the 23505 race → CONFLICT_VERSION); `DeviceRegistry.upsert`; create the session; audit AUTH_SIGNUP/AUTH_LOGIN with `{platform, isNewInvestor, isNewDevice}`. The S2 kernel hangs the "new sign-in" email on `isNewDevice`.
  - Blocked status → FORBIDDEN.
  - SessionRouter adds `logout` and `revokeAll`, which clear cookies; audit AUTH_LOGOUT and AUTH_SESSIONS_REVOKED_ALL.
  - Tests: web and native sign-up, re-login, wrong, expired and locked codes, identical requestOtp shape for new and existing mobiles, logout, revoke-all (the other investor's sessions untouched), native bearer bound to the installation.
  - Delete everything about new-device, step-up and email fallback.
- B20: the challengeId shape; `reference_id = investorId`; `assertEmailAvailable` at both request and verify.
- B21: unchanged.
- B22: android header, the OTP_COOLDOWN case, ADR-0003 record.
- B23:
  - `.env.example` per §5.2 (local: `SANCHAY_CLIENT_IP_SOURCE=socket`, `SANCHAY_KEY_SERVICE=local`, `SANCHAY_OTP_PER_IP_PER_HOUR=1000`).
  - The worker role still exits 1 ("JobsModule lands in plan-02-mvp-kernel").
  - Key edits to package.json (`db:migrate`) and CI (timeout 30, `test:int`, `db:check`).
  - Smoke test: health, then `POST /auth/otp` with `x-sanchay-client: android` expecting `challengeId`, then Mailpit shows `SMS [SANCHAY_LOGIN_OTP_V1]`.

**Chunk C1 (C1–C3) → C1–C3.**
- C1: remove the biome.json step; prerequisites A2, A3.
- C2: 9 conformance rows.
- C3: `NativeApiClientOptions.platform: 'android'`; test expects client `android`.

**Chunk C2 (C4–C6) → C4–C6.**
- C4: add the ADR-0002 stub.
- C5: unchanged.
- C6:
  - `exports["./copy"]` → `./src/copy/index.ts`.
  - `packages/domain/src/legal-entity.ts` (R-19: the single legal-entity module, re-exported by `src/copy/index.ts`) exports `LEGAL_ENTITY_NAME`, and `dsc02(arn, validTill)` builds "Sanchay is operated by ${LEGAL_ENTITY_NAME}, an AMFI-registered Mutual Fund Distributor, ${arn} (valid till ${formatIsoDate(validTill)}). We are a distributor, not an investment adviser." Mark it as a counsel placeholder (G-C1).
  - `REGULAR_PLAN_NOTICE` interpolates `LEGAL_ENTITY_NAME`.
  - Add `@sanchay/money` as a dependency.
  - Copy for all 66 codes, including PILOT_INVITE_REQUIRED ("Sanchay is invite-only right now…").

**Chunk C3 (C7–C9) → C7–C9.**
- C7:
  - `AuthApi {requestOtp({mobile}) → OtpSent; verifyOtp({challengeId, code}) → SignedInResult}`.
  - Steps PHONE → SMS_OTP (holds `challengeId`) → DONE.
  - Resend issues a new challengeId.
  - OTP_LOCKED or RATE_LIMITED lockout → back to PHONE with the error.
- C8: remove the EMAIL step, its copy and "Start again".
- C9:
  - `AppNav` (universal; web only renders it: sidebar at ≥ 1024 px, bottom bar below 768 px).
  - `AccountScreen`: masked mobile, email-verified status, "Log out", "Sign out everywhere" (`auth.revokeAll`).
  - `ComingSoonScreen` for Explore and Portfolio.

**Chunk C4 (C10–C12) → C10–C12.**
- C10 (H-1):
  - `hostKind` returns www, app or any.
  - **www host:** `/login` and `/signup` → 308 to the app origin; any other path → rewrite to `/site{path}`.
  - **app host:** `/app/<p>` → 307 `/<p>`; `/site/*` → 404; every path except `/login`, `/signup` and `/r/*` is protected → `/login?next=`.
  - **any** (local): no host routing; www pages at `/site`.
  - `safeNext` = `^/(?!/)[A-Za-z0-9/_\-]*$`.
  - `readSiteConfig` adds `platformArnValidTill`.
  - Write the ADR-0005 record.
- C11:
  - Routes: `src/app/site/page.tsx` (www landing: MARKET_RISK_WARNING, `dsc02`, REGULAR_PLAN_NOTICE), `(auth)/login`, `(auth)/signup`, `(app)/page.tsx` (Home at `/`), `(app)/explore`, `(app)/portfolio`, `(app)/account`.
  - **No turbo edit.** `.gitignore` append.
  - Shell specs retargeted from `/app` to `/`.
- C12:
  - turbo key edit `e2e:web`; root script.
  - CI job `e2e-web`: postgres 18.6 and mailpit service containers, then `pnpm db:migrate`, then `pnpm e2e:web`.
  - Specs unchanged at the UI level; the flow now uses challengeId internally.

**Chunk C5 (C13–C15) → C13–C15.**
- C13: `EXPO_PUBLIC_SANCHAY_*`; `parseMobileConfig({apiBaseUrl, appOrigin, wwwOrigin, appVersion})`; D-18 comment.
- C14:
  - Tabs `(tabs)/index`, `explore`, `portfolio`, `account`.
  - `usePreventScreenCapture` (expo-screen-capture, pinned `~57.x` in apps/mobile) on the login and signup routes.
  - Remove the iOS block, the Face ID string and the `ios` script.
  - Scheme only when `APP_VARIANT≠production`.
  - Build with `subst S:` and `expo run:android`.
  - Remove the PowerShell `$env:` cleanup lines after the build step.
- C15: `signup.yaml` and `relaunch-without-screen-lock.yaml` (logout optional); local only; the Step 0 prerequisite is "C14 build installed". This is the first Plan-01 trim candidate.

**Interface-sheet edits the rewrite also carries**
- §1.2 "Plan 02" is replaced by the deferral table below.
- §2 is replaced by §3 of this sheet.
- §3.3, §3.5 and §3.7 are replaced by §4.
- §4.4, §5.2, §5.5, §5.6, §6.1 and §6.3 take §5 of this sheet.
- §7.2 and §7.6 take the C10, C11 and C14 text above.
- §11 takes §5.11.

**Deferral targets** (replacing "Plan 02")

| Target | Items |
|---|---|
| **plan-02-mvp-kernel (S2, Dev A)** | idempotency interceptor and `idempotency_keys`; pg-boss JobsModule, worker role, `worker_heartbeats`; HostGuard and IP enforcement; MSG91 and SES adapters plus boot guard; `meta.appConfig` 426; `/health/ready` with pg-boss and heartbeat; otp/session cleanup job; "new sign-in" email; pilot invite gate and `pilot_invites`; `states.md` and `gen:states` (plus its CI diff); FP gateway base, FakeFp, `provider_calls`; webhooks; CDK dev |
| plan-03 catalogue (S2) | NAV-age readiness check; ui AmountInput, MoneyText, Sheet |
| plan-04 onboarding (S3) | `GET /me` (`me.get`); `legal_documents` |
| plan-05 consent and lumpsum (S3) | consent tables; JCS |
| plan-07 portfolio (S4) | XIRR engine; FIFO |
| plan-08 prod, security (S4) | CDK prod |
| P2-1 | admin tables and `sanchay_admin` role |
| P2-2 | KMS; Sentry; CloudFront, WAF, EdgeGuard, dual-stack; check-boundaries; CODEOWNERS; bundle budgets; axe; TZ matrix |
| P2-3 | B18 step-up; new-device and email-fallback branches; session list/revoke-one; DeviceTrust; session cap and rotation; installation-binding revoke; M08 wipe; smsDegraded; 24 h no-lock session; contact and bank change |
| P2-10 | EAS; iOS |
| EXT E7 | Maestro in CI |
| ADR-0002 | the Uniwind decision |

---

## 7. Sprint-1 budget check

**Capacity**

| Line | Value |
|---|---|
| Per dev: 9 days × 0.8 × 1.2 | 8.64 d |
| Dev A after review 0.5, FakeFp/sandbox 0.5 and probes 1.5 | **6.14 d = 49.1 h** |
| Dev B after review 0.5 | **8.14 d = 65.1 h** |
| Plan-01 capacity in S1 | **114.2 h** (15.8 net minus 1.5 probes) |

**Committed in S1 (107.5 h = 13.44 d)**
- **Dev B (63.5 h):** A1 5, A2 4, A3 3, A4 3, A5 3, A6 3.5, A7 3, A11 4, A9 3.5, B5 4, A8 1.5, A10 2.5, A12 5, C1 3, C4 5, C5 4, B17 3.5, C2 3. Slack 1.6 h.
- **Dev A (44.0 h):** B1 3, B2 3.5, B3 5, B4 2, B6 6, B7 7, B8 4, B9 5, B10 2, B11 2.5, B12 4. Slack 5.1 h, kept as the S1 environment/probe buffer. If it is not consumed, Dev A starts B13.
- **Result:** fits, with 6.7 h (0.84 d) reserve.

**Moved to S2 explicitly (92.0 h = 11.5 d)**
- **Dev A (44 h):** B13 7, B14 5, B15 3, B16 5, B18 6, B19 6, B20 4, B21 2, B22 2, B23 4.
- **Dev B (48 h):** C3 3.5, C6 3.5, C7 3, C8 4, C9 5, C10 5, C11 6, C12 5, C13 3, C14 7, C15 3.
- **Finish dates:** Dev A about Mon 10-19; Dev B about Mon 10-19. Login on web and Android E2E on **Wed 10-21**.

**Knock-on for S2 (net 21.5 d; about 10.76 d per dev)**
- Dev A has 5.3 d left for kernel 8.5 + invite 0.5 + CDK dev 1.5 = 10.5 d. **Short 5.2 d.**
- Dev B has 4.8 d left for catalogue 3.0 + onboarding screens 3.3 = 6.3 d. **Short 1.5 d.**
- S2 is short **6.8 d**. MVP-wide the gap is 80.5 − 19.0 + 24.9 = **86.4 d against 80.4**.

**Lead actions**
1. PO acknowledges T1–T6 (4.0 d) at the 10-09 checkpoint.
2. Consider C15 → manual G-E6 checklist (0.4 d).
3. Re-measure the AI factor at 10-09 and 10-23. The remaining 1.6 d closes only if the S2–S4 factor is ≥ 1.64. Otherwise T7 goes to the PO on 10-23.
4. Non-negotiables stay untouched by every trim: consent-first, Idempotency-Key, OTP policy, PII redaction, BOLA, golden vectors.

### Critical Files for Implementation
- C:/Users/pc/AppData/Local/Temp/claude/C--Users-pc-Desktop-sanchay/2f00d411-382c-43a6-bd67-ecaf60c67db1/tasks/wk14xlx18.output (`result.interfaceSheet`, `result.planChunks` 0..12, `result.planRecheck`, `result.finalCritic`: the texts this sheet amends)
- C:/Users/pc/Desktop/sanchay/docs/superpowers/plans/2026-09-28-plan-01-foundation.md (lean plan to be written from §6, with ids per §2)
- C:/Users/pc/Desktop/sanchay/pnpm-workspace.yaml, C:/Users/pc/Desktop/sanchay/turbo.json, C:/Users/pc/Desktop/sanchay/biome.json (single-owner configs, §4)
- C:/Users/pc/Desktop/sanchay/apps/api/src/integrations/sms/templates.ts and C:/Users/pc/Desktop/sanchay/apps/api/src/modules/identity/otp.service.ts (H-3/H-5/H-6 OTP core; DLT byte-exact text)
- C:/Users/pc/Desktop/sanchay/packages/domain/src/ (A11 enum pins) and C:/Users/pc/Desktop/sanchay/packages/contract/src/{errors,auth}.ts (66-code catalogue, lean contract)
