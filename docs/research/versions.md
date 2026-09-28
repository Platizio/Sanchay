<!-- source: workflow wf_1d1c9b02-593 label research:versions (brand-renamed) | exported 2026-09-28 -->

# Platizio v2 stack version pins and API best practices (verified 2026-09-25)

All versions below were checked live on 2026-09-25. Sources: npm registry `https://registry.npmjs.org/<pkg>` (`dist-tags.latest` plus the `time` map; peer and engine fields from `/<pkg>/<version>`), `https://nodejs.org/dist/index.json`, the Node Release `schedule.json`, the Docker Hub tags API, and the official docs and release pages cited inline. Dates come from the registry's publish times. Where a WebFetch summariser gave a different year (it said 2024 for the NativeWind and @nestjs/swagger 12 dates), I trust the registry.

## 0. Findings the Product Owner must look at (they conflict with or refine the locked decisions)

| # | Finding | Evidence | Recommendation |
|---|---|---|---|
| F1 | **NestJS v12 is the current stable line, not v11.** v11 is on the `legacy` tag (11.2.6, 2026-09-23). 12.0.0 shipped 2026-08-27 and 12.1.0 on 2026-09-23. v12 is ESM-only, has built-in Standard Schema (Zod) validation, `@nestjs/swagger` 12 has a `standardSchemaConverter`, and 12.1 adds built-in adapter-agnostic cookies and CSRF. | registry `@nestjs/core` dist-tags; https://github.com/nestjs/nest/releases ; https://docs.nestjs.com/migration-guide ; https://docs.nestjs.com/techniques/validation | **Start the greenfield on Nest 12.1.x.** Decision 8 says "v11 line", so the PO must amend it. Staying on v11 means pinning 11.2.6 + swagger 11.4.7 + config 4.0.4 + schedule 6.1.3 + nestjs-zod 5.5.0, and migrating later. |
| F2 | **`typescript@latest` is 7.0.2** (the Go-native compiler, 2026-07-08). It **ships without a programmatic API** until 7.1. typescript-eslint, the @nestjs/swagger CLI plugin, openapi-typescript and hey-api all need the TS 6 API. Peer ranges agree: `@nestjs/swagger@12` wants `^5.5 \|\| ^6`, `openapi-typescript` wants `^5.x`. | https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/ ("TypeScript 7.0 does not ship with an API. We expect TypeScript 7.1 to ship with a new (and different) API.") | **Pin `typescript@6.0.3` repo-wide** (this is what `nest upgrade` installs). Optionally add `@typescript/native-preview`/tsgo later as a fast CI-only `--noEmit` check. Revisit when 7.1 ships. |
| F3 | **pnpm 12 (latest 12.6.0) is a Rust rewrite** released 2026-08-26, with "some behavioral differences". The 11.x line is still maintained: 11.27.0 on 2026-09-12. | https://pnpm.io/blog ; registry `pnpm` time map | **Pin `pnpm@11.27.0`** through `packageManager` and Corepack for launch. Re-evaluate 12.x in Q1 2027. |
| F4 | **Expo SDK 57 bundles React 19.2.3.** npm latest React is 19.3.0. Expo's docs say "Duplicate React version in a single app will cause runtime errors" and "Duplicate React Native versions in a single monorepo are not supported". | `expo@57.0.25/bundledNativeModules.json` (jsDelivr); https://docs.expo.dev/guides/monorepos/ | **Pin `react`/`react-dom` 19.2.3 repo-wide with a pnpm catalog.** Next 16.3 accepts `^19.0.0`, and the App Router uses its own vendored React canary anyway. |
| F5 | **Stable NativeWind (4.2.7) supports Tailwind v3 only.** NativeWind v5 is `5.0.0-rc.0` (2026-09-13) and its own notes say it is not production-ready. **Uniwind 1.12.0** (MIT, peers `tailwindcss >=4`, `react-native >=0.81`, `react >=19`) is the stable Tailwind v4 option for React Native. | https://www.nativewind.dev/docs/getting-started/installation ; https://github.com/nativewind/nativewind/releases ; registry `uniwind` | **Use Uniwind + Tailwind v4.3.3** so web and native share one `@theme` token file. See §5. |
| F6 | **Expo SDK 58 has been in beta since 2026-09-15.** SDK 57 (2026-06-30) is current stable. | https://expo.dev/changelog | Build on SDK 57. Budget one upgrade sprint for SDK 58 in Q4 2026. |
| F7 | **Node 24 moves to Maintenance LTS on 2026-10-20.** Node 26 becomes Active LTS on 2026-10-28. Node 24 is supported until 2028-04-30. | Node Release `schedule.json` | Stay on Node 24 as decided (fine through launch). Plan a move to 26 in 2027. |
| F8 | **Sentry 11.0.0 shipped 2026-09-23, two days ago.** `@sentry/nestjs@10.75.3` peers only Nest `≤^11`. | registry peer fields | If we take Nest 12, we must use `@sentry/nestjs@11.0.0`. Pin it and watch for 11.0.x patches. |
| F9 | **ts-rest is effectively stalled.** Last stable is 3.52.1 (2025-03-04), which peers `zod ^3.22.3` and Nest ≤11. Zod 4 support has sat in an RC since 2025-06. | https://github.com/ts-rest/ts-rest/releases ; registry | Drop ts-rest from consideration. |
| F10 | **Drizzle 1.0 is still an RC** (1.0.0-rc.4, 2026-06-27; no stable date announced). `latest` is 0.45.3 (2026-09-21). | https://github.com/drizzle-team/drizzle-orm/releases | Pin 0.45.3 / drizzle-kit 0.31.11. Plan a 1.0 migration later: the casing API changes, and 1.0 brings RQB v2. |

## 1. Pinned versions

### 1a. Runtime, tooling and monorepo

| Package / tool | Exact version | Release date | Source | Notes / breaking changes that matter |
|---|---|---|---|---|
| Node.js 24 LTS "Krypton" | **24.21.0** (npm 11.19.0) | 2026-09-07 | https://nodejs.org/dist/index.json | The last security release was 24.18.1 (2026-07-28). Maintenance starts 2026-10-20; EOL is 2028-04-30. Nest 12 CLI needs ≥24.15. pg-boss needs ≥22.12. graphile-worker and hey-api need ≥22.18. zod-openapi needs ≥22.14. All are satisfied. |
| pnpm | **11.27.0** (latest overall is 12.6.0) | 2026-09-12 (12.6.0: 2026-09-22) | registry; https://pnpm.io/blog | See F3. Put settings in `pnpm-workspace.yaml`, including `catalog:` pins. Build scripts need explicit approval (`onlyBuiltDependencies` / `allowBuilds`) for esbuild, @swc/core, argon2 and similar. Expo suggests `nodeLinker: hoisted` if isolated installs break. |
| Turborepo (`turbo`) | **2.11.4** | 2026-09-24 | registry | Windows x64 and arm64 binaries ship. No breaking changes that matter for a new repo. |
| TypeScript | **6.0.3** (latest overall is 7.0.2) | 2026-04-16 | registry; TS 7 announcement | See F2. TS 7 makes these hard errors: `target es5`, `moduleResolution node10`, `baseUrl`, AMD/UMD, and `esModuleInterop:false`. Avoid them now so the later move is free. TS 7 does support `experimentalDecorators`/`emitDecoratorMetadata` (typescript-go PR #2343, merged 2025-12-12). |
| @types/node | 24.x (not the 26.6.2 latest) | — | registry | Match the Node 24 runtime. |
| PostgreSQL | **18.6** | 2026-08-13 (18.5 was skipped because of a regression) | https://www.postgresql.org/about/news/postgresql-186-1711-1615-1519-1424-and-19-beta-3-released-3365/ | PG 19 is at Beta 4 (2026-09-24). Amazon RDS offers 18.6 (https://docs.aws.amazon.com/AmazonRDS/latest/PostgreSQLReleaseNotes/postgresql-versions.html). PG 18 has a built-in `uuidv7()`. |
| Docker image | **`postgres:18.6-trixie`** (also `18.6`, `18.6-bookworm`, `18.6-alpine3.24`) | tag updated 2026-09-24 | Docker Hub tags API | Use the Debian (trixie) image for Testcontainers, for parity with RDS glibc collation. Pin the minor. |

### 1b. Backend

| Package | Exact version | Release date | Source | Notes |
|---|---|---|---|---|
| @nestjs/core / common / testing / platform-fastify / platform-express | **12.1.0** | 2026-09-23 | registry; https://github.com/nestjs/nest/releases | ESM-only; CommonJS apps still work through `require(esm)`. Node ≥20.19/22.12/24. Standard Schema: `@Body({ schema })`, `StandardSchemaValidationPipe`, `StandardSchemaSerializerInterceptor`. 12.1 adds built-in cookies, CSRF and security headers. `nest upgrade --dry-run` exists. Lifecycle hooks now run in component-hierarchy order. |
| Fastify vs Express | **platform-fastify 12.1.0** (bundles fastify 5.12.5, @fastify/cors 11.3.0) | 2026-09-23 | registry peer/deps | **Recommend Fastify**: faster, and 12.1 gives cookies and multipart upload on it. Express 5 also works. Both are supported by `@orpc/nest` (peers `fastify>=5`, `express>=5`). |
| @nestjs/cli | 12.0.6 | 2026-09-24 | registry | Uses Rspack by default for monorepos, Vitest for ESM projects, and oxlint as the default linter. |
| @nestjs/config | **12.0.1** | 2026-09-22 | registry | Validates env through Standard Schema, so a Zod env schema can be passed directly. Bundles dotenv 18. |
| @nestjs/schedule | **12.0.2** | 2026-09-14 | registry | Uses cron 4.4.0. Only for trivial in-process timers; real jobs go on pg-boss (§4). |
| @nestjs/swagger | **12.0.2** | 2026-09-23 | https://github.com/nestjs/swagger/releases | Pure ESM. Peers TS `^5.5\|\|^6`, so it breaks on TS 7. New `standardSchemaConverter` in `SwaggerDocumentOptions` (used with `zod-openapi`'s `createSchema`). OpenAPI 3.1 nullable handling. |
| @nestjs/throttler | **6.7.1** | 2026-09-24 | registry | Peers include Nest ^12. Use a Postgres- or Redis-backed storage when there are several instances. |
| @nestjs/terminus | 12.1.0 | 2026-09-20 | registry | Health indicators no longer throw (v12 change). |
| zod | **4.6.5** | 2026-09-13 | registry | Implements Standard Schema. Has native `z.toJSONSchema`. |
| nestjs-zod | 5.5.0 | 2026-07-25 | registry | **Peers `@nestjs/common ^10\|\|^11` only.** Not needed on Nest 12, which does this natively. Use it only if we stay on v11. |
| zod-openapi | **6.0.2** | 2026-08-31 | registry | Zod ^4, Node ≥22.14. This is the converter the official Nest swagger docs use. |
| drizzle-orm | **0.45.3** | 2026-09-21 | registry; releases page | 0.45.2 (2026-03-27) fixed SQL injection in `sql.identifier()`/`sql.as()`, so never go below it. 1.0.0-rc.4 is not stable. |
| drizzle-kit | **0.31.11** | 2026-09-21 | registry | `generate`, then review, then `migrate` (§2.2). |
| drizzle-zod | 0.8.3 | 2025-08-06 | registry | Optional. Better to hand-write API schemas in `packages/contract` than derive them from tables (keeps the DB and API decoupled). |
| pg (node-postgres) | **8.23.0** | 2026-08-08 | registry | **Chosen driver.** pg-boss, graphile-worker and DBOS all depend on `pg`, so there is one driver and pool family. NUMERIC comes back as a string by default. |
| postgres (postgres.js) | 3.4.9 | 2026-04-05 | registry | Good, but it would be a second driver next to the job queue's `pg`. Not chosen. |
| decimal.js | **10.6.0** | 2025-07-06 | registry | **Chosen** for money, units and NAV maths: arbitrary precision, `ROUND_HALF_UP`/`ROUND_UP`, `toFixed`. |
| big.js | 7.0.1 | 2025-04-21 | registry | Smaller, but fewer rounding and maths functions. XIRR needs `pow`/`ln`-style helpers, which decimal.js has. |
| pg-boss | **12.34.0** | 2026-09-23 | registry; https://pgboss.io/ | Node ≥22.12, PG ≥13. Transactional enqueue through the `db` option (has a Drizzle adapter). Cron plus RRULE, DLQ, retries with backoff, debounce/throttle. |
| @wavezync/nestjs-pgboss | 7.0.2 | 2026-09-07 | registry README | Peers Nest ^12 and pg-boss ≥12.6. Gives `@Job()` / `@CronJob()` decorators and graceful shutdown. Community package; small enough to vendor if it goes stale. |
| graphile-worker | 0.18.0 | 2026-09-08 | registry; https://worker.graphile.org/ | Still 0.x, Node ≥22.18, no Nest module. |
| @dbos-inc/dbos-sdk | 5.1.10 | 2026-09-24 | registry; https://docs.dbos.dev/typescript/integrating-dbos | Durable workflows. "Cannot be bundled", which clashes with Nest 12's Rspack monorepo default (needs `externals`). Decorators need `experimentalDecorators`. |
| @dbos-inc/drizzle-datasource | 5.1.10 | 2026-09-24 | registry | Only if DBOS is adopted. |
| pino / pino-http / nestjs-pino | **10.3.1 / 11.0.0 / 5.2.0** | 2026-02-09 / 2025-10-04 / 2026-09-14 | registry | nestjs-pino peers Nest `^11.0.8 \|\| ^12.0.2`. Configure `redact` for PAN, Aadhaar, mobile, email and bank account (DPDP). |
| @sentry/nestjs, @sentry/node | **11.0.0** | 2026-09-23 | registry | Required for Nest 12 (see F8). Sentry v9+ runs on OpenTelemetry internally. Don't also start a separate `@opentelemetry/sdk-node` with its own HTTP instrumentation, or spans get doubled. |
| @opentelemetry/sdk-node / auto-instrumentations-node / api | 0.222.0 / 0.80.0 / 1.9.1 | 2026-08-31 / 2026-08-31 / 2026-03-25 | registry | Only if we export to a non-Sentry backend such as AWS X-Ray or ADOT. Otherwise let Sentry own OTel. |
| @nestjs/observe | 0.3.2 | 2026-09-23 | registry | Nest 12's native observability SDK. It is 0.x, so skip it for launch. |
| nestjs-cls | 7.0.1 | 2026-09-24 | registry | Request context (request id, investor id) for logs and audit. |
| jose | 6.2.12 | 2026-09-05 | registry | JWT/JWS for short-lived access tokens and webhook signature checks. |
| @node-rs/argon2 | 2.2.1 | 2026-09-10 | registry | Prebuilt binaries, so no node-gyp pain on Windows (compare `argon2` 0.45.1). Only needed if passwords exist; OTP-first login may not need them. |
| uuid | 14.0.2 | 2026-08-18 | registry | `v7()` if IDs are generated in the app rather than by PG18 `uuidv7()`. |

### 1c. Web

| Package | Exact version | Release date | Source | Notes |
|---|---|---|---|---|
| next | **16.3.6** | 2026-09-22 | registry; https://nextjs.org/docs/app/guides/upgrading/version-16 (doc version 16.3.6, updated 2026-08-25) | Node ≥20.9, TS ≥5.1. **`middleware.ts` → `proxy.ts`**, exported function `proxy`. It runs on **Node.js only (edge not supported, not configurable)**, and `skipMiddlewareUrlNormalize` becomes `skipProxyUrlNormalize`. **Turbopack is the default for `next dev` and `next build`**; a custom `webpack` config fails the build unless you pass `--webpack`. The filesystem cache is on by default. **Cache Components are opt-in with `cacheComponents: true`**: `'use cache'`, stable `cacheLife`/`cacheTag`, and `revalidateTag(tag, profile)` now needs two arguments. `updateTag`/`refresh` exist for Server Actions. Sync `params`/`cookies()`/`headers()` are removed (must await). `next lint` is removed (use Biome or ESLint directly). AMP and `serverRuntimeConfig`/`publicRuntimeConfig` are removed. Parallel routes need `default.js`. `next/image` defaults: `qualities:[75]`, `minimumCacheTTL` 4 h, local-IP block, max 3 redirects. `reactCompiler: true` is stable but opt-in. `next dev` writes to `.next/dev`. The blog lists several critical RSC security releases, so stay on the latest 16.3.x patch. |
| react / react-dom | **19.2.3** (catalog pin; latest is 19.3.0) | 19.3.0 was 2026-09-09 | registry; Expo `bundledNativeModules.json` | See F4. |
| babel-plugin-react-compiler | 1.0.0 | 2025-10-07 | registry | Optional. Next 16.3 also has a Rust React Compiler in Turbopack (16.3 blog). |
| tailwindcss / @tailwindcss/postcss | **4.3.3** | 2026-07-16 | registry | CSS-first config (`@import "tailwindcss"`, `@theme`). Same version for web (PostCSS) and native (Uniwind). |
| shadcn (CLI) | **4.21.0** | 2026-09-04 | registry; https://ui.shadcn.com/docs/changelog | Supports Tailwind v4 and React 19. Since July 2026, `shadcn create` / `shadcn init` let you **choose Base UI or Radix primitives**. As of Sept 2026, components import the tiny `cn` package. Has an MCP server and GitHub/private registries. **Recommend Radix** (more mature, larger a11y track record). Base UI is fine if the team prefers it. |
| @tanstack/react-query | **5.103.2** | 2026-09-21 | registry | Shared by web and native. |
| react-hook-form | **7.88.0** | 2026-09-11 | registry | v8 is still beta. |
| @hookform/resolvers | **5.9.1** | 2026-08-17 | registry | Peers `zod ^3.25 \|\| ^4`, `react-hook-form ^7.55`. Use `zodResolver(schema)` with the shared contract schemas. |

### 1d. Native (Expo)

| Package | Exact version | Release date | Source | Notes |
|---|---|---|---|---|
| expo | **57.0.25** (SDK 57) | SDK released 2026-06-30; patch 2026-09-24 | registry; https://expo.dev/changelog/sdk-57 | **Bundles react-native 0.86.3 and React 19.2.3** (`bundledNativeModules.json`). Hermes V1; 57.0.9 fixed a Hermes V1 memory regression with Reanimated and worklets. **New Architecture only**: it is mandatory from RN 0.82 (https://reactnative.dev/blog/2025/10/08/react-native-0.82), and Expo removed the opt-out from SDK 55. iOS 27 SDK builds require the UIKit scene lifecycle. SDK 58 is in beta. |
| react-native | 0.86.3 (via Expo; npm latest is 0.87.1, not supported by SDK 57) | — | bundledNativeModules | Always install with `npx expo install`, never `pnpm add` with a bare version. |
| expo-router | **57.0.23** | 2026-09-24 | registry | Peers `react-native-screens ^4.26`, `expo-linking ^57.0.11`, `react-server-dom-webpack ~19.2.4`. |
| expo-secure-store | **57.0.4** | 2026-09-11 | registry | Keychain/Keystore; `requireAuthentication` can gate items behind biometrics. |
| expo-local-authentication | **57.0.3** | 2026-09-11 | registry | Biometric app-unlock and step-up prompts. |
| expo-notifications | **57.0.21** | 2026-09-24 | registry | Push needs a dev build, not Expo Go, on Android. |
| expo-web-browser / expo-linking | **57.0.3 / 57.0.11** | 2026-09-11 / 2026-09-24 | registry | Payment, DigiLocker, eSign and eNACH redirects: `WebBrowser.openAuthSessionAsync(url, redirectUri)` with an app scheme or universal-link return. `expo-auth-session` is ~57.0.13 if OAuth-style PKCE is ever needed. |
| react-native-reanimated / worklets | **4.5.1 / 0.10.1** (Expo-pinned; npm latest is 4.7.0 / 0.13.0) | — | bundledNativeModules | Use the Expo-pinned versions. |
| eas-cli | **24.8.0** | 2026-09-24 | registry | Required for iOS builds from Windows. |
| uniwind | **1.12.0** | 2026-09-04 | registry | Tailwind v4 for React Native. Free tier (MIT); the Pro tier adds a C++ engine, zero re-renders and Reanimated 4 transitions. No Babel preset; configured in Metro. Has a monorepo guide. |
| nativewind | 4.2.7 (Tailwind v3) / 5.0.0-rc.0 | 2026-09-14 / 2026-09-13 | registry; nativewind docs | Not chosen (see F5). v5 rc targets SDK 57, RN 0.86.3 and Reanimated ≥4.5.1. |
| react-native-unistyles | 3.3.0 | 2026-07-10 | registry | Not Tailwind-based and needs Nitro modules. It shares nothing with web Tailwind, so not chosen. |
| @react-native-reusables/cli | 0.7.1 | 2026-03-14 | registry; https://github.com/founded-labs/react-native-reusables ("components with Nativewind/Uniwind") | The shadcn-style primitives for RN. Supports Uniwind. Copy-in components, not a runtime dependency. |
| @sentry/react-native | **~7.11.0** (Expo-pinned; npm latest is 8.28.0) | — | bundledNativeModules; https://docs.sentry.io/platforms/react-native/manual-setup/expo/ | Use the `@sentry/react-native/expo` plugin, `getSentryExpoConfig` in Metro, and the Expo Router integration. Going to 8.x means `expo doctor` warnings. Stay on 7.11.x unless a later SDK pins 8. |

### 1e. Contract, codegen, testing, lint and observability

| Package | Exact version | Release date | Source | Notes |
|---|---|---|---|---|
| @orpc/contract, server, nest, openapi, client, openapi-client, zod, tanstack-query | **1.15.4** | 2026-09-23 | registry; https://orpc.dev/docs/openapi/integrations/implement-contract-in-nest | `@orpc/nest` peers Nest ≥11, fastify ≥5, express ≥5. **ESM-only; needs `"module": "NodeNext"`, Node ≥22.** v2 is in beta (2.0.0-beta.40), so a future major is coming. |
| @trpc/server | 11.19.0 | 2026-09-16 | registry | No first-party Nest adapter and not OpenAPI-native. Rejected. |
| @ts-rest/core / nest | 3.52.1 | 2025-03-04 | registry; releases | Stalled (F9). Rejected. |
| openapi-typescript / openapi-fetch | 7.13.0 / 0.17.0 | 2026-02-11 | registry | Peer TS `^5.x` (a warning with TS 6). Tiny runtime that works in RN. This is the fallback/partner-SDK path. |
| @hey-api/openapi-ts | 0.99.0 | 2026-06-22 | registry | Node ≥22.18, TS ≥5.5.3 or 6. Generates an SDK plus TanStack Query options plus Zod. Still 0.x. |
| orval | 8.37.0 | 2026-09-23 | registry | Node ≥22.18. Also workable; heavier. |
| vitest (+ @vitest/coverage-v8) | **5.0.1** | 2026-09-15 (5.0.0: 2026-09-03) | https://vitest.dev/blog/vitest-5 | Node ≥22.12, Vite ≥6.4 (Vite 8.3.1 is current). `clearMocks` is now on by default. Unawaited async assertions now fail. Inline projects inherit the root config. `bench` moved to a test fixture. Browser locators are strict and exact. |
| @testcontainers/postgresql / testcontainers | **12.1.0** | 2026-08-04 | registry | Needs Docker Desktop (WSL2) on Windows. |
| @playwright/test | **1.63.0** | 2026-09-04 | registry | Next peers `^1.51.1`. |
| Maestro CLI | **2.10.0** | 2026-08-31 | https://github.com/mobile-dev-inc/maestro/releases | Expo has a Maestro insights dashboard and EAS Workflows can run Maestro (changelog, 2026-06-24). iOS flows need macOS or EAS. |
| msw | **2.15.0** | 2026-07-08 | registry | Web plus Vitest. In RN it needs `msw/native` and polyfills; I'd rather mock at the oRPC link or the fetch layer. |
| @biomejs/biome | **2.5.14** | 2026-09-16 | registry | **Recommended**: one tool for format and lint, no TS-API dependency (so it survives TS 7), and Next 16 explicitly names "Biome or ESLint". |
| eslint / typescript-eslint / prettier | 10.11.0 / 8.70.1 / 3.9.9 | 2026-09-18 / 2026-09-21 / 2026-09-23 | registry | ESLint 10 is flat-config only. typescript-eslint depends on the TS 6 API. Only add ESLint for rules Biome lacks (e.g. `eslint-plugin-react-hooks` compiler rules) if they turn out to be needed. |
| oxlint | 1.85.0 | 2026-09-21 | registry | Nest 12 CLI's default. Remove it in favour of Biome for a single tool. |
| @sentry/nextjs | **11.0.0** | 2026-09-23 | registry | Peers `next ^16.0.0-0`. v10.75.3 also works with Next 16 if we want to stay conservative on web. |
| lefthook | 2.1.14 | 2026-09-14 | registry | Pre-commit hooks. Works on Windows without a shell-script dependency, unlike husky 9.1.7 (last release 2024-11). |
| @t3-oss/env-core / env-nextjs | 0.13.11 | 2026-03-22 | registry | Zod-validated env for Next/Expo. Nest uses `@nestjs/config` + Zod. |

## 2. Answers with evidence

### 2.1 (1) API contract for NestJS consumed by Next.js and Expo, while keeping an OpenAPI document

**Options, verified 2026-09-25:**

| Approach | Status | Verdict |
|---|---|---|
| **A. oRPC contract-first**: `packages/contract` holds `oc` procedures with Zod 4 schemas plus `openapi({ path, method })` metadata. Nest controllers use `@Implement(contract.x.y)` with `implement(...).handler(...)`, registered via `ORPCModule.forRootAsync`. Clients use `@orpc/openapi-client` (OpenAPILink) and `@orpc/tanstack-query`. The OpenAPI 3.1 doc comes from `OpenAPIGenerator` + the `@orpc/zod` converter. | 1.15.4 (2026-09-23), with official Nest docs. Supports Express and Fastify. ESM-only, `module: NodeNext`, Node ≥22. | **Recommended.** No codegen step; one TS contract gives types to Nest, Next Server Components, Next client and Expo; the OpenAPI document for partners is still produced. Nest guards, interceptors and pipes still apply because `@Implement` methods are Nest controller methods. Risk: oRPC v2 is in beta, so a major upgrade is coming. |
| **B. Nest-native (fallback)**: Zod schemas in `packages/contract`, `@Body({ schema })` + `StandardSchemaValidationPipe`, `@nestjs/swagger` `standardSchemaConverter` (zod-openapi `createSchema`) → committed `openapi.json` → `@hey-api/openapi-ts` or `openapi-typescript` + `openapi-fetch` generate the client. | Nest 12.0 / 12.1 are about 4 weeks old. | The most "standard Nest" option and easiest for AI agents trained on Nest. Costs a codegen step, and the generated types duplicate the Zod-inferred types. |
| C. tRPC 11 | 11.19.0 | Rejected: no Nest adapter, no native OpenAPI. |
| D. ts-rest | 3.52.1, stalled | Rejected (F9). |

The swagger converter pattern, quoted from the @nestjs/swagger 12 release notes: `standardSchemaConverter: (schema, { schemaType }) => { if (isZodSchema(schema)) { const { schema: converted, components } = createSchema(schema, { io: schemaType, openapiVersion: '3.0.0' }); return { schema: converted, components }; } }`

**Rule for both options:** request/response schemas and domain enums live in `packages/contract` (Zod 4), and money travels over the wire as **decimal strings** (e.g. `"1234.50"`), never JS numbers. Add a Sprint-0 spike to prove option A with Fastify + an auth guard + cookie session + an OpenAPI export. If it fails, fall back to B. Both keep the same `packages/contract` schemas, so switching costs little.

### 2.2 (2) Drizzle: NUMERIC money, uuidv7, migrations and Testcontainers

- **NUMERIC:** Drizzle `numeric()` modes are `string` (the default), `number` and `bigint` (https://orm.drizzle.team/docs/column-types/pg). **Use the default string mode with explicit precision and scale.** For example, amount is `numeric('amount', { precision: 18, scale: 2 })`, units is `numeric('units', { precision: 20, scale: 4 })` (RTA units are usually 3 dp, and 4 leaves headroom), and NAV is `numeric('nav', { precision: 18, scale: 4 })`. Convert to `Decimal` (decimal.js 10.6.0) only in the domain layer, and never to JS numbers. `pg` also returns NUMERIC as a string by default, so they agree.
- **uuidv7 primary keys on PG18:** PG18 has `uuidv7()` built in, so use `uuid('id').primaryKey().default(sql\`uuidv7()\`)`. The alternative is app-side `$defaultFn(() => v7())` from `uuid@14`, useful when an ID is needed before the insert (idempotency keys, outbox). `defaultRandom()` gives v4 `gen_random_uuid()`; avoid it for primary keys because v4 hurts index locality.
- **Timestamps:** always `timestamp('x', { withTimezone: true, precision: 6, mode: 'date' })`. This fixes v1 must-fix (k), the timestamp/timestamptz drift. **v1 must-fix (b):** hash persisted canonical values. Serialise the value read back from the DB (µs precision) or a string you persist yourself, never an in-memory `Date`/`Instant`.
- **Optimistic locking:** add `version integer not null default 0` and `UPDATE … WHERE id=$1 AND version=$2`; if the row count is 0, throw a conflict.
- **Foreign keys:** declare every `.references()` explicitly (fixes must-fix k).
- **Migrations:** 1) edit `schema.ts`; 2) `drizzle-kit generate` writes SQL into `migrations/`; 3) **review the SQL in the PR** (hand-edit for data backfills, `CREATE INDEX CONCURRENTLY`, extensions); 4) apply with `drizzle-kit migrate`, or programmatically with `migrate()` from `drizzle-orm/node-postgres/migrator` as a separate deploy step or ECS one-off task, **not at app boot**. Never use `drizzle-kit push` against shared or prod databases. CI check: run `drizzle-kit generate` and fail if it produces a diff. Plan the Drizzle 1.0 move (casing API, RQB v2) once it goes stable.
- **Testcontainers:** in a Vitest `globalSetup`, `new PostgreSqlContainer('postgres:18.6-trixie').start()`, run the migrator once, and export the connection URI. Isolate each test with a transaction rolled back at the end, or `TRUNCATE` or a template database per worker (`CREATE DATABASE t_n TEMPLATE app_template` is fastest across parallel Vitest workers). Keep `@testcontainers/postgresql` and `testcontainers` at the same 12.1.0.

### 2.3 (3) Session pattern

**Web (Next 16 + Nest):**
- Host the API on a subdomain of the same registrable domain (e.g. `app.sanchay.in` → `api.sanchay.in`). Cookies are then same-site, so `SameSite=Lax` works. This avoids a full BFF proxy layer, which is less code.
- Nest 12.1 sets opaque session cookies: `HttpOnly; Secure; SameSite=Lax; Path=/; Domain=.sanchay.in` (use the `__Host-` prefix only if the API and web share a host). Store the session server-side as a hashed token in Postgres, with idle and absolute expiry and revocation. Use Nest 12.1's built-in CSRF protection (or double-submit) on state-changing routes, and CORS `credentials: true` with an exact-origin allowlist.
- Next Server Components and route handlers call the API server-to-server, forwarding `(await cookies())` (async is now mandatory). `proxy.ts` (Node runtime only) does **optimistic** redirect gating only; authorisation always happens in Nest.
- Public SEO fund pages call unauthenticated catalogue endpoints and can use `'use cache'` + `cacheTag('fund:<isin>')`, revalidated after the daily NAV sync with `revalidateTag('fund:…','max')`.
- Choose a full BFF (Next route handlers owning the cookie and holding API tokens) only if the API must live on a different registrable domain.

**Native (Expo):**
- Keep a short-lived access token (JWT via `jose`, about 10 min) in memory only.
- Keep a **rotating opaque refresh token** in `expo-secure-store` 57.0.4 (Keychain/Keystore; optionally `requireAuthentication` + `expo-local-authentication` 57.0.3 for biometric unlock). Rotate on every use, and on reuse detection revoke the whole token family and force re-login (OTP).
- Bind refresh tokens to a device id and store them hashed.
- Transaction 2FA and consent stays a separate per-transaction OTP challenge, independent of the session (v1 must-fix a). Obtain consent **before** any Cybrilla write.
- Better Auth 1.7.6 + `@better-auth/expo` 1.7.6 are current and could supply this. For the SEBI/DPDP audit trail, I'd rather hand-roll the small session module on Postgres with the ported OTP rules.

### 2.4 (4) Background jobs on Postgres

| | pg-boss 12.34.0 | graphile-worker 0.18.0 | DBOS Transact 5.1.10 |
|---|---|---|---|
| Maturity | 12 majors, very active (latest 2026-09-23), Node ≥22.12, PG ≥13 | Still 0.x, Node ≥22.18 | 5.x, active; different model (durable workflows) |
| Nest integration | `@wavezync/nestjs-pgboss` 7.0.2 (peers Nest ^12): `@Job`, `@CronJob`, graceful shutdown | None (hand-rolled provider) | Integration guide exists. Must not be bundled (clashes with Rspack defaults). Decorators need `experimentalDecorators`. |
| Transactional enqueue | Yes, `db` option with a Drizzle adapter | Yes, SQL `graphile_worker.add_job` inside the transaction | Workflows are checkpointed in its system DB. `@dbos-inc/drizzle-datasource` gives exactly-once DB steps. |
| Semantics | Marketing says "exactly-once delivery" (SKIP LOCKED means one worker holds a job at a time). **Handler execution is really at-least-once**: expiry or a crash causes a retry. | At-least-once | Workflows resume from the last completed step. Non-DB steps are at-least-once; datasource transactions are exactly-once. |
| Cron / DLQ / debounce | Cron + RRULE, DLQ, retries with backoff, throttle/debounce, priorities | Crontab, job_key dedupe/debounce | Scheduled workflows, queues |

**Recommendation: pg-boss 12.34.0 + @wavezync/nestjs-pgboss 7.0.2.** Use it for the AMFI NAV daily sync, Cybrilla status polling, webhook processing, SIP reminders, notifications and CAS parsing. Pair it with:
- a **persistent `inbound_webhook_events` table** with a unique `(provider, event_id)` constraint (fixes v1 must-fix d);
- a **transactional outbox**: enqueue in the same Drizzle transaction as the state change;
- **idempotent handlers**, with provider idempotency keys derived from our order uuidv7.

Keep DBOS as a later option if the order, mandate and payment sagas grow complex enough to justify durable workflows.

### 2.5 (5) Expo + Tailwind tokens shared with Next.js: production-ready today?

- **With NativeWind: no.** Stable v4.2.7 is Tailwind v3 only, and v5 is RC.0 (2026-09-13) and "not production-ready" by its own notes.
- **With Uniwind 1.12.0: yes.** It is stable 1.x, MIT, peers `tailwindcss >=4`, RN ≥0.81 and React ≥19, which fits SDK 57 / RN 0.86.3 / React 19.2.3. It needs no Babel preset, has a monorepo guide, and React Native Reusables supports it ("Nativewind/Uniwind" per the repo tagline).
- **Setup:**
  - `packages/tokens/theme.css` holds the Tailwind v4 `@theme` block (colours, radii, spacing, font sizes) plus light and optional dark CSS variables.
  - `apps/web/app/globals.css` contains `@import "tailwindcss"; @import "@platizio/tokens/theme.css";`.
  - `apps/mobile/global.css` imports Tailwind, Uniwind and the same token file, configured in `metro.config.js`.
  - Also export the same tokens as TS constants from `packages/tokens` for charts, SVG and non-className cases.
- **Caveats:**
  - Web shadcn (Radix DOM) and native React Native Reusables (`@rn-primitives`) are **separate component implementations** that share tokens and naming, not code.
  - Some Tailwind utilities (e.g. complex selectors, grid) have no RN equivalent.
  - Validate on a low-end Android device in Sprint 0.
  - Fallback if Uniwind disappoints: NativeWind 4.2.7 + Tailwind 3.4.19 on mobile only, with tokens generated into both a v3 `tailwind.config` and a v4 `@theme` from the TS token source.

### 2.6 (6) Known incompatibilities and Windows dev-machine issues

1. **iOS cannot be built locally on Windows.** Use EAS Build (`eas-cli` 24.8.0) for iOS dev-client and simulator builds; Maestro iOS flows need macOS or EAS Workflows. Android emulator and Maestro Android work on Windows.
2. **pnpm + Expo:** Expo docs say to switch to `nodeLinker: hoisted` in `pnpm-workspace.yaml` if isolated installs cause problems. Keep a single React (19.2.3) and a single RN version in the monorepo.
3. **Windows path length (from experience, not verified today):** RN New-Architecture Android builds (CMake/Ninja) can fail on long paths. Enable `LongPathsEnabled` and `git config core.longpaths true`, and keep the repo at a short root. `C:\Users\pc\Desktop\sanchay` is borderline; `C:\dev\sanchay` is safer.
4. **Testcontainers** needs Docker Desktop with the WSL2 backend running. The Ryuk reaper must be allowed through the firewall.
5. **TypeScript 7 breaks tooling that uses the TS API** (typescript-eslint, @nestjs/swagger CLI plugin, openapi-typescript), hence the TS 6.0.3 pin (F2).
6. **nestjs-zod 5.5.0 does not declare Nest 12 support.** `@sentry/nestjs@10` doesn't either; use 11.0.0 (F8).
7. **ESM:** Nest 12, @nestjs/swagger 12 and oRPC are ESM-only. Set `"type": "module"` and `module`/`moduleResolution: NodeNext` in the API package. Expo/Metro and Next handle ESM workspace packages. Ship `packages/*` as TS source with `exports` pointing at `.ts` via Next `transpilePackages`, or build them with `tsdown` 0.23.0.
8. **DBOS cannot be bundled.** Nest 12's monorepo default is Rspack, so mark it external (only relevant if DBOS is adopted).
9. **Native module versions:** always `npx expo install` (Reanimated 4.5.1, worklets 0.10.1, @sentry/react-native ~7.11.0). npm `latest` versions (4.7.0, 0.13.0, 8.28.0) are ahead of SDK 57.
10. **Native build scripts:** `@node-rs/argon2` (prebuilt) avoids node-gyp and Visual Studio Build Tools, which `argon2` may need. pnpm requires allow-listing packages with install scripts.
11. **Line endings:** add `.gitattributes` with `* text=auto eol=lf` so Biome, shell scripts and Android Gradle wrappers behave.
12. **Next 16:** Turbopack is the default, and any plugin that injects a `webpack` config fails `next build` until migrated or run with `--webpack`. `next dev` needs no special handling on Windows.

## 3. Suggested catalog (in `pnpm-workspace.yaml`)

```
node 24.21.0 | pnpm 11.27.0 | turbo 2.11.4 | typescript 6.0.3 | zod 4.6.5 | decimal.js 10.6.0
@nestjs/* 12.1.0 (config 12.0.1, schedule 12.0.2, swagger 12.0.2, throttler 6.7.1, cli 12.0.6, terminus 12.1.0)
drizzle-orm 0.45.3 | drizzle-kit 0.31.11 | pg 8.23.0 | pg-boss 12.34.0 | @wavezync/nestjs-pgboss 7.0.2 | zod-openapi 6.0.2
@orpc/* 1.15.4 | @tanstack/react-query 5.103.2 | react-hook-form 7.88.0 | @hookform/resolvers 5.9.1
next 16.3.6 | react/react-dom 19.2.3 | tailwindcss + @tailwindcss/postcss 4.3.3 | shadcn 4.21.0 (Radix)
expo 57.0.25 (SDK 57; RN 0.86.3) | expo-router 57.0.23 | expo-secure-store 57.0.4 | expo-local-authentication 57.0.3
expo-notifications 57.0.21 | expo-web-browser 57.0.3 | expo-linking 57.0.11 | uniwind 1.12.0 | eas-cli 24.8.0
vitest 5.0.1 | @testcontainers/postgresql 12.1.0 | @playwright/test 1.63.0 | msw 2.15.0 | Maestro 2.10.0
@biomejs/biome 2.5.14 | lefthook 2.1.14
@sentry/nestjs + @sentry/nextjs 11.0.0 | @sentry/react-native ~7.11.0 | pino 10.3.1 | pino-http 11.0.0 | nestjs-pino 5.2.0 | nestjs-cls 7.0.1
PostgreSQL 18.6 (docker postgres:18.6-trixie; RDS 18.6 ap-south-1)
```

## 4. Sources (accessed 2026-09-25)

- npm registry (all versions, dates, peers and engines): https://registry.npmjs.org/
- Node releases: https://nodejs.org/dist/index.json ; https://raw.githubusercontent.com/nodejs/Release/main/schedule.json
- PostgreSQL 18.6: https://www.postgresql.org/about/news/postgresql-186-1711-1615-1519-1424-and-19-beta-3-released-3365/ ; Docker Hub tags API https://hub.docker.com/v2/repositories/library/postgres/tags?name=18 ; RDS https://docs.aws.amazon.com/AmazonRDS/latest/PostgreSQLReleaseNotes/postgresql-versions.html
- NestJS: https://github.com/nestjs/nest/releases ; https://docs.nestjs.com/migration-guide ; https://docs.nestjs.com/techniques/validation ; https://github.com/nestjs/swagger/releases ; https://github.com/BenLorantfy/nestjs-zod
- TypeScript 7: https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/ ; https://github.com/microsoft/typescript-go/pull/2343
- Next.js: https://nextjs.org/docs/app/guides/upgrading/version-16 ; https://nextjs.org/blog
- Expo: https://expo.dev/changelog ; https://expo.dev/changelog/sdk-57 ; https://docs.expo.dev/guides/monorepos/ ; https://cdn.jsdelivr.net/npm/expo@57.0.25/bundledNativeModules.json ; https://reactnative.dev/blog/2025/10/08/react-native-0.82
- NativeWind / Uniwind / Reusables: https://www.nativewind.dev/docs/getting-started/installation ; https://github.com/nativewind/nativewind/releases ; https://docs.uniwind.dev/ ; https://github.com/founded-labs/react-native-reusables
- shadcn: https://ui.shadcn.com/docs/changelog
- Drizzle: https://orm.drizzle.team/docs/column-types/pg ; https://github.com/drizzle-team/drizzle-orm/releases
- Jobs: https://pgboss.io/ ; https://worker.graphile.org/ ; https://docs.dbos.dev/typescript/integrating-dbos
- Contracts: https://orpc.dev/docs/openapi/integrations/implement-contract-in-nest ; https://github.com/ts-rest/ts-rest/releases
- Testing / tooling: https://vitest.dev/blog/vitest-5 ; https://github.com/mobile-dev-inc/maestro/releases ; https://pnpm.io/blog ; https://docs.sentry.io/platforms/react-native/manual-setup/expo/

Some Expo SDK 57 details could not be confirmed from the official pages I fetched: Android target SDK, Xcode minimum and minimum Node. Confirm them with `npx expo-doctor` during Sprint 0. The Windows long-path issue (§2.6 item 3) comes from field experience, not a source checked today.
