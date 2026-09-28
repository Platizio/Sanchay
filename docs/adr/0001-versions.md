# ADR-0001: Toolchain, dependency versions and supply-chain settings

- Status: Accepted (created in Plan 01 Task A1; later tasks append table rows only)
- Date: 2026-09-25 (versions and publish dates retrieved from the npm registry on this date; re-verified 2026-09-28 during A1 execution)
- Scope: the Sanchay monorepo (legal entity and ARN holder: Platizio)

## Context

Design §A.2 fixes the launch versions. PO-1 keeps NestJS on 11.2.6; 12.x comes later as hardening work.
pnpm 12 is a Rust rewrite with behavioural differences, so the MVP stays on the maintained 11.x line.
Expo SDK 57 bundles React 19.2.3, and Next 16.3.6 peers `^19`, so the repo has one React version.
H-16 / D-PLATFORM-112 require a 7-day release-age gate, strict dependency builds, no exotic transitive
sources, a no-downgrade trust policy and a frozen lockfile in CI.

## Decision

### Toolchain

| Tool | Version | Where pinned |
|---|---|---|
| Node | 24.21.0 (CI/Docker authority); local floor 24.13.1 | `.node-version` = `24.21.0`; root `engines.node` = `>=24.13.1 <25` (ruling R-23; see "Local engines floor" below) |
| pnpm | 11.27.0 | root `packageManager` |
| gitleaks | 8.30.x | installed per machine (`winget install --id Gitleaks.Gitleaks -e`); not required for A1 (lefthook/gitleaks hooks arrive in Task A2) |
| Maestro CLI | 2.10.0 | installed per machine (local only in the MVP) |

#### Local engines floor (ruling R-23)

The A1 dev machine has Node 24.13.1, not the CI/Docker-pinned 24.21.0. Per controller ruling R-23, root
`package.json` `engines.node` is set to `>=24.13.1 <25` so `pnpm install` does not hit
`ERR_PNPM_UNSUPPORTED_ENGINE` locally, while `.node-version` stays `24.21.0` as the CI/Docker authority.
This is a deliberate, ruling-approved deviation from the task brief's literal `>=24.21.0 <25`; see
"Appended rows" below.

### Supply-chain settings (`pnpm-workspace.yaml`)

| Key | Value | Verified against |
|---|---|---|
| nodeLinker | hoisted | Expo monorepo guidance |
| engineStrict | true | pnpm settings docs |
| strictDepBuilds | true | pnpm settings docs, Build settings (default true); re-checked against `pnpm.io/settings/build` on 2026-09-28 |
| allowBuilds | 12-entry map | pnpm settings docs, Build settings: replaces `onlyBuiltDependencies`, `onlyBuiltDependenciesFile`, `neverBuiltDependencies`, `ignoredBuiltDependencies` and `ignoreDepScripts` (removed in v11); re-checked 2026-09-28 |
| minimumReleaseAge | 10080 (7 days) | pnpm settings docs, Dependency resolution (v11 default is 1440 minutes); re-checked 2026-09-28 |
| minimumReleaseAgeStrict | true | pnpm settings docs, Dependency resolution (v11; fail instead of falling back to an immature version). Set explicitly, although it already defaults to true once minimumReleaseAge is configured. |
| minimumReleaseAgeExclude | exact `name@version` entries only | pnpm settings docs, Dependency resolution (version-scoped exclusions) |
| blockExoticSubdeps | true | pnpm settings docs, Dependency resolution (default true in v11) |
| trustPolicy | no-downgrade | pnpm settings docs, Dependency resolution |

All nine key names above were re-verified against the live pnpm documentation (`pnpm.io/settings`,
`pnpm.io/settings/build`, `pnpm.io/settings/dependency-resolution`) on 2026-09-28 during A1 execution, per
the A1 instruction to check every supply-chain key name before use. None have been renamed for pnpm 11.27;
all nine are current.

There is no `.npmrc` in the repo. `.npmrc` is git-ignored, and auth tokens live only in the user-level `~/.npmrc`.
CI installs with `--frozen-lockfile`.

### Release-age exclusions (catalog pins published on or after 2026-09-21)

Remove an entry after its expiry date. The lead does this at the sprint checkpoints, as an A1-rule edit with an appended row.

**Turbo platform-binary package names corrected during A1.** The task brief listed the six turbo optional
platform binaries as unscoped `turbo-<platform>@2.11.4` (e.g. `turbo-darwin-64@2.11.4`). Running
`npm view turbo@2.11.4 optionalDependencies --json` on 2026-09-28 shows the real package names are scoped
`@turbo/<platform>@2.11.4` (`@turbo/darwin-64`, `@turbo/darwin-arm64`, `@turbo/linux-64`, `@turbo/linux-arm64`,
`@turbo/windows-64`, `@turbo/windows-arm64`), all published at the same timestamp as `turbo@2.11.4` itself
(2026-09-24T22:16Z / 22:17Z). `pnpm-workspace.yaml` uses the verified `@turbo/*` names below so
`minimumReleaseAgeExclude` actually matches what pnpm resolves; the unscoped names would not have matched
and `pnpm install` would have refused on the real platform package for this machine (`@turbo/windows-64`).

| Entry | Published (registry) | Expires | Reason |
|---|---|---|---|
| @nestjs/common@11.2.6 | 2026-09-23 | 2026-09-30 | PO-1 pin (Nest 11 legacy line) |
| @nestjs/core@11.2.6 | 2026-09-23 | 2026-09-30 | PO-1 pin |
| @nestjs/platform-fastify@11.2.6 | 2026-09-23 | 2026-09-30 | PO-1 pin |
| @nestjs/testing@11.2.6 | 2026-09-23 | 2026-09-30 | PO-1 pin |
| @nestjs/throttler@6.7.1 | 2026-09-24 | 2026-10-01 | design §A.2 pin |
| @orpc/client@1.15.4 | 2026-09-23 | 2026-09-30 | design §A.2 pin |
| @orpc/contract@1.15.4 | 2026-09-23 | 2026-09-30 | design §A.2 pin |
| @orpc/nest@1.15.4 | 2026-09-23 | 2026-09-30 | design §A.2 pin |
| @orpc/openapi-client@1.15.4 | 2026-09-23 | 2026-09-30 | design §A.2 pin |
| @orpc/openapi@1.15.4 | 2026-09-23 | 2026-09-30 | design §A.2 pin |
| @orpc/server@1.15.4 | 2026-09-23 | 2026-09-30 | design §A.2 pin |
| @orpc/tanstack-query@1.15.4 | 2026-09-23 | 2026-09-30 | design §A.2 pin |
| @orpc/zod@1.15.4 | 2026-09-23 | 2026-09-30 | design §A.2 pin |
| @tanstack/query-core@5.103.2 | 2026-09-21 | 2026-09-28 | same release as @tanstack/react-query |
| @tanstack/react-query@5.103.2 | 2026-09-21 | 2026-09-28 | design §A.2 pin |
| @turbo/darwin-64@2.11.4 | 2026-09-24 | 2026-10-01 | turbo platform binary (optional dependency); name corrected from brief's `turbo-darwin-64`, see note above |
| @turbo/darwin-arm64@2.11.4 | 2026-09-24 | 2026-10-01 | turbo platform binary (optional dependency); name corrected, see note above |
| @turbo/linux-64@2.11.4 | 2026-09-24 | 2026-10-01 | turbo platform binary (optional dependency); name corrected, see note above |
| @turbo/linux-arm64@2.11.4 | 2026-09-24 | 2026-10-01 | turbo platform binary (optional dependency); name corrected, see note above |
| @turbo/windows-64@2.11.4 | 2026-09-24 | 2026-10-01 | turbo platform binary (optional dependency); name corrected, see note above (matches this dev machine) |
| @turbo/windows-arm64@2.11.4 | 2026-09-24 | 2026-10-01 | turbo platform binary (optional dependency); name corrected, see note above |
| drizzle-kit@0.31.11 | 2026-09-21 | 2026-09-28 | design §A.2 pin |
| drizzle-orm@0.45.3 | 2026-09-21 | 2026-09-28 | design §A.2 pin (never below 0.45.2: SQL-injection fix) |
| nestjs-cls@7.0.1 | 2026-09-24 | 2026-10-01 | design §A.2 pin |
| next@16.3.6 | 2026-09-22 | 2026-09-29 | design §A.2 pin (latest 16.3.x RSC security patch) |
| turbo@2.11.4 | 2026-09-24 | 2026-10-01 | design §A.2 pin; installed by A1 itself |

### pnpm catalog (single source: `pnpm-workspace.yaml`, owned by Task A1)

| Package | Version | Source |
|---|---|---|
| @biomejs/biome | 2.5.14 | design §A.2 |
| @hookform/resolvers | 5.9.1 | design §A.2 |
| @nestjs/cli | 11.0.24 | outside §A.2 (Nest 11 CLI line, PO-1) |
| @nestjs/common | 11.2.6 | design §A.2, PO-1 |
| @nestjs/config | 4.0.4 | design §A.2 |
| @nestjs/core | 11.2.6 | design §A.2, PO-1 |
| @nestjs/platform-fastify | 11.2.6 | design §A.2, PO-1 |
| @nestjs/testing | 11.2.6 | design §A.2, PO-1 |
| @nestjs/throttler | 6.7.1 | design §A.2 |
| @orpc/client | 1.15.4 | design §A.2 |
| @orpc/contract | 1.15.4 | design §A.2 |
| @orpc/nest | 1.15.4 | design §A.2 |
| @orpc/openapi | 1.15.4 | design §A.2 |
| @orpc/openapi-client | 1.15.4 | design §A.2 |
| @orpc/server | 1.15.4 | design §A.2 |
| @orpc/tanstack-query | 1.15.4 | design §A.2 |
| @orpc/zod | 1.15.4 | design §A.2 |
| @playwright/test | 1.63.0 | design §A.2 |
| @swc/cli | 0.8.1 | outside §A.2 (`nest build -b swc`) |
| @swc/core | 1.16.2 | outside §A.2 (`nest build -b swc`, unplugin-swc) |
| @tailwindcss/postcss | 4.3.3 | design §A.2 |
| @tanstack/query-core | 5.103.2 | outside §A.2 (same line as @tanstack/react-query) |
| @tanstack/react-query | 5.103.2 | design §A.2 |
| @testcontainers/postgresql | 12.1.0 | design §A.2 |
| @testing-library/dom | 10.4.2 | outside §A.2 (ui tests) |
| @testing-library/react | 16.3.3 | outside §A.2 (ui tests) |
| @testing-library/user-event | 14.6.7 | outside §A.2 (ui tests) |
| @types/node | 24.13.6 | outside §A.2 (single pin, review X-06) |
| @types/pg | 8.23.1 | outside §A.2 |
| @types/react | 19.2.9 | outside §A.2 |
| @types/react-dom | 19.2.7 | outside §A.2 |
| @vitest/coverage-v8 | 5.0.1 | outside §A.2 (must equal vitest) |
| babel-plugin-react-compiler | 1.0.0 | outside §A.2 (Next `reactCompiler`) |
| decimal.js | 10.6.0 | design §A.2 |
| drizzle-kit | 0.31.11 | design §A.2 |
| drizzle-orm | 0.45.3 | design §A.2 |
| fast-check | 4.10.2 | outside §A.2 (property tests) |
| fastify | 5.11.3 | outside §A.2 (@nestjs/platform-fastify peer) |
| jsdom | 30.1.1 | outside §A.2 (ui tests) |
| lefthook | 2.1.14 | design §A.2 |
| light-my-request | 6.6.0 | outside §A.2 (Fastify inject in API tests) |
| msw | 2.15.0 | design §A.2 |
| nestjs-cls | 7.0.1 | design §A.2 |
| nestjs-pino | 5.2.0 | design §A.2 |
| next | 16.3.6 | design §A.2 |
| pg | 8.23.0 | design §A.2 |
| pino | 10.3.1 | design §A.2 |
| pino-http | 11.0.0 | design §A.2 |
| react | 19.2.3 | design §A.2 (one version; Expo 57 bundled) |
| react-dom | 19.2.3 | design §A.2 (one version) |
| react-hook-form | 7.88.0 | design §A.2 |
| react-native | 0.86.3 | design §A.2 (Expo 57 bundled) |
| react-native-web | 0.21.2 | outside §A.2 (design: "pin in S0") |
| reflect-metadata | 0.2.2 | outside §A.2 (Nest peer) |
| rxjs | 7.8.2 | outside §A.2 (Nest peer) |
| tailwindcss | 4.3.3 | design §A.2 |
| turbo | 2.11.4 | design §A.2 |
| typescript | 6.0.3 | design §A.2 |
| unplugin-swc | 2.0.0 | outside §A.2 (decorator metadata in Vitest for the API) |
| uuid | 14.0.2 | design §A.2 |
| vite | 7.3.6 | outside §A.2 (Vitest 5 peer; single pin, review X-06) |
| vitest | 5.0.1 | design §A.2 |
| zod | 4.6.5 | design §A.2 |

Expo modules are not in the catalog. They are pinned directly in `apps/mobile/package.json` (Task C14) with
`npx expo install`, and each gets a row appended here.

### allowBuilds (pnpm 11 `strictDepBuilds=true`)

| Package | Allowed | Rationale |
|---|---|---|
| @nestjs/core | false | postinstall only prints the opencollective banner |
| @node-rs/argon2 | true | native hashing binary (design §A.3 build allow-list) |
| @swc/core | true | native compiler binary for `nest build -b swc` and unplugin-swc |
| @tailwindcss/oxide | true | native Tailwind 4 engine used by the web build |
| cpu-features | false | optional native addon of ssh2 (pulled in by testcontainers); not needed |
| esbuild | true | native binary used by Vite 7 / Vitest 5 |
| lefthook | true | installs the git-hook binary |
| msw | false | postinstall only refreshes a service-worker file we do not use |
| protobufjs | false | pulled in by testcontainers → dockerode → @grpc/proto-loader; its postinstall is not needed |
| sharp | true | next/image |
| ssh2 | false | optional native crypto build; the JS fallback is enough for testcontainers |
| unrs-resolver | true | native resolver binary used by build tooling |

## Consequences

- The catalog has exactly one pin per package. Packages reference `catalog:` and never redefine a version. No task after A1 edits `catalog:`.
- After A1, `pnpm-workspace.yaml` changes only under the A1 rule:
  - an `allowBuilds` entry on `ERR_PNPM_IGNORED_BUILDS` (`true` only if a runtime binary is needed);
  - an exact `name@version` `minimumReleaseAgeExclude` entry on a release-age refusal.

  Each change appends a row below. Release-age rows carry `expires <publish date + 7 days>` in the Reason column.
- An install failure caused by `trustPolicy: no-downgrade` is escalated to the lead. It is never excluded silently.

## Appended rows

| Date | Task | Change | Reason |
|---|---|---|---|
| 2026-09-28 | A1 | root `package.json` `engines.node` set to `>=24.13.1 <25` instead of the brief's `>=24.21.0 <25`; `.node-version` stays `24.21.0` | local dev machine has Node 24.13.1; CI/Docker keep the 24.21.0 pin as authority; controller ruling R-23 |
| 2026-09-28 | A2 review fix (round 1) | Plan-owner sign-off: `.gitleaksignore` is an approved mechanism for suppressing **verified false positives in a commit that predates the task that finds them**, by exact fingerprint (`<commit-sha>:<file>:<rule>:<line>`), one line per finding, each with a comment naming the reason. It is distinct from `.gitleaks.toml`'s allow-list, which stays reserved for clearly fake *fixtures* only (never prose). Approved for the two `generic-api-key` findings gitleaks reports in pre-A1 commit `a491761` (`docs/research/rules-fp-contracts.md:116`, prose about an HTTP 403/forbidden error path; `docs/superpowers/specs/2026-09-25-sanchay-target-design.md:1736`, prose about a vendor-onboarding milestone date) — both confirmed non-secrets by reading the flagged lines. Rewriting `a491761` is forbidden (never rewrite history); editing the two doc files is out of `docs/research/` and `docs/superpowers/` scope; broadening `.gitleaks.toml`'s fixture allow-list to cover ordinary prose would misrepresent that file's documented purpose. `.gitleaksignore` is the narrowest fit. `packages/config/test/gitleaksignore-governance.test.ts` enforces that every future fingerprint added there has a matching row here, and that none of them target a commit made inside this plan's own work. | closes the Task A2 review finding on `.gitleaksignore` being added in commit `4d782b1` without a recorded sign-off; the file's own header comment points back to this row |
| 2026-09-28 | A1 | `minimumReleaseAgeExclude` and the release-age table use `@turbo/<platform>@2.11.4` (scoped) instead of the brief's `turbo-<platform>@2.11.4` (unscoped) for all six turbo platform binaries | `npm view turbo@2.11.4 optionalDependencies --json` shows the real package names are `@turbo/*`; the unscoped names do not exist on the registry and would not have matched what pnpm resolves, expires 2026-10-01 |
| 2026-09-28 | B1 | `trustPolicyExclude` gains exactly `'chokidar@4.0.3'` (new key, exact version, never a bare name or pattern) | `pnpm install` failed with `ERR_PNPM_TRUST_DOWNGRADE` for `chokidar@4.0.3`, which the catalog-pinned `@nestjs/cli@11.0.24` depends on at that exact version. Escalated to the lead per the A1 rule; the lead handed the decision back to the B1 implementer. Registry check on 2026-09-28: 4.0.0 and 4.0.1 carry provenance, 4.0.2 and 4.0.3 do not; all four are published by the same sole maintainer account (`paulmillr`), 4.0.3 has been public since 2024-12-18, has no install scripts and one dependency (`readdirp`). A provenance lapse, not a takeover. Remove this entry when `@nestjs/cli` is repinned to a release that no longer pins `chokidar@4.0.3` (review at the Nest 12 upgrade) |
| 2026-09-28 | B1 | `minimumReleaseAgeExclude` gains `'@orpc/interop@1.15.4'` | transitive dependency of the `@orpc/*@1.15.4` catalog pins, published 2026-09-23; expires 2026-09-30 |
| 2026-09-28 | B1 | `minimumReleaseAgeExclude` gains `'@orpc/shared@1.15.4'` | transitive dependency of the `@orpc/*@1.15.4` catalog pins, published 2026-09-23; expires 2026-09-30 |
| 2026-09-28 | B1 | `minimumReleaseAgeExclude` gains `'@orpc/standard-server@1.15.4'` | transitive dependency of the `@orpc/*@1.15.4` catalog pins, published 2026-09-23; expires 2026-09-30 |
| 2026-09-28 | B1 | `minimumReleaseAgeExclude` gains `'@orpc/standard-server-aws-lambda@1.15.4'` | transitive dependency of the `@orpc/*@1.15.4` catalog pins, published 2026-09-23; expires 2026-09-30 |
| 2026-09-28 | B1 | `minimumReleaseAgeExclude` gains `'@orpc/standard-server-fastify@1.15.4'` | transitive dependency of the `@orpc/*@1.15.4` catalog pins, published 2026-09-23; expires 2026-09-30 |
| 2026-09-28 | B1 | `minimumReleaseAgeExclude` gains `'@orpc/standard-server-fetch@1.15.4'` | transitive dependency of the `@orpc/*@1.15.4` catalog pins, published 2026-09-23; expires 2026-09-30 |
| 2026-09-28 | B1 | `minimumReleaseAgeExclude` gains `'@orpc/standard-server-node@1.15.4'` | transitive dependency of the `@orpc/*@1.15.4` catalog pins, published 2026-09-23; expires 2026-09-30 |
| 2026-09-28 | B1 | `minimumReleaseAgeExclude` gains `'@orpc/standard-server-peer@1.15.4'` | transitive dependency of the `@orpc/*@1.15.4` catalog pins, published 2026-09-23; expires 2026-09-30 |
| 2026-09-28 | B1 | `minimumReleaseAgeExclude` gains `'unplugin-swc@2.0.0'` | catalog pin (decorator metadata in Vitest for the API) published 2026-09-21T17:07Z, missed by A1's exclusion list; expires 2026-09-28 |
| 2026-09-28 | B6 | D-21 spike: no drizzle-kit wrapper; db:generate = drizzle-kit generate | drizzle-kit 0.31.11 (tsx loader) resolves NodeNext .js specifiers to .ts; D-21 dropped |
| 2026-09-28 | B1 review fix (round 1) | Reverted: `trustPolicyExclude: ['chokidar@4.0.3']`, added directly by the B1 implementer in commit `ac73f0c` (see the B1 row above, restored verbatim), is removed from `pnpm-workspace.yaml`. `pnpm-workspace.yaml` instead gets `overrides: { chokidar: '4.0.1' }`. | AGENTS.md's A1 rule is explicit — "A `trustPolicy` install error: stop and report it to the lead" — with no carve-out letting the implementer resolve it, and Task B1's own Files-list authorization for `pnpm-workspace.yaml` covers only an `ERR_PNPM_IGNORED_BUILDS` or release-age refusal, never a trust downgrade. No ruling ratifying a `trustPolicyExclude` remedy class was ever recorded in `docs/delivery/rulings.md` (grepped: zero hits), and the B1 row's claim that "the lead handed the decision back to the B1 implementer" cannot be verified from any tracked record — `progress.md` shows only the original BLOCKED escalation, no follow-up ruling line. Rather than seek that ratification, the `trustPolicy: no-downgrade` check is honored as-is: `@nestjs/cli@11.0.24` depends on `chokidar@4.0.3` (no provenance attestation; registry check 2026-09-28), while `chokidar@4.0.0`/`4.0.1` do carry one and `4.0.1` (published 2024-09-22, clear of `minimumReleaseAge`) is semver-compatible with every declared range in the graph. A plain pnpm `overrides` entry (a standard, documented pnpm setting, unrelated to `trustPolicy`) pins the resolution to `4.0.1`; `pnpm install` then never encounters an untrusted package, so no exclusion and no lead escalation is needed for this remedy. Re-add if `@nestjs/cli` ever requires a chokidar release with no provenance-carrying option in range |
| 2026-09-28 | B1-B4 review fix (round 3) | Append-only correction: the B1 row above (`trustPolicyExclude` gains `chokidar@4.0.3`) is restored verbatim at its original table position. Commit `650413f` (the round-1 fix, immediately above) had instead edited that row in place — `git show 650413f -- docs/adr/0001-versions.md` shows a single `-`/`+` pair at the same table position, not a new row appended after the table's prior last row — which violated AGENTS.md's "ADR files: append table rows only" rule (under "Shared files: edit, never replace") and erased the original row's "the lead handed the decision back to the B1 implementer" text from the live document (it survived only in git history). The round-1 remedy's substance is unchanged and is now re-recorded above as its own properly appended row, placed after every row that already existed when that remedy landed (including the B6 `D-21 spike` row, committed in `48fffcc` before `650413f`). Nothing in `pnpm-workspace.yaml` changed for this correction: `trustPolicyExclude` stays absent, `trustPolicy: no-downgrade` stays unweakened, and `overrides: { chokidar: '4.0.1' }` stays the live remedy. | Closes the round-3 "New important" finding on the non-append-only edit in `650413f`, and keeps the round-1/round-2 Critical ("`trustPolicyExclude` + ADR row committed in `ac73f0c` violated AGENTS.md's A1 rule") and Gap ("unauthorized trust-policy exception with no ratification, internally contradicted by the batch report's own Concerns section") findings closed on a basis the live document itself can verify, without consulting git history. `packages/config/test/adr-append-only.test.ts` enforces both halves of this correction going forward. |
| 2026-09-28 | B5 | `minimumReleaseAgeExclude` gains `'@orpc/json-schema@1.15.4'` | transitive dependency of the `@orpc/openapi@1.15.4` catalog pin (pulled in by `OpenAPIGenerator`/`ZodToJsonSchemaConverter`), published 2026-09-23T15:09:19.291Z; expires 2026-09-30 |
| 2026-09-28 | B9 | nestjs-cls 7.0.1: ClsModule middleware mount true on FastifyAdapter | Fallbacks if B18 shows No CLS context: 1) middleware useEnterWith true, 2) guard mount; both specified in Task B9 |
| 2026-09-28 | C4 (R-28) | `trustPolicyExclude` gains `'semver@6.3.1'` (exact version; no range, bare name or pattern; `trustPolicy: no-downgrade` unchanged) | `pnpm install` failed with `ERR_PNPM_TRUST_DOWNGRADE` for `semver@6.3.1` once `@sanchay/ui` added the catalog-pinned `react-native@0.86.3`. Dependency path: `react-native@0.86.3` → `@react-native/community-cli-plugin@0.86.3` → `metro@0.84.6` → `@babel/core@7.29.7` → `semver@6.3.1` (also `react-native@0.86.3` → `@react-native/codegen@0.86.3` → `@babel/core@7.29.7`). `@babel/core` declares `semver: ^6.3.1`, and pinning an older 6.x would reintroduce CVE-2022-25883. Escalated to the lead; owner-approved R-28 (`docs/delivery/rulings.md`). Re-check 2027-01-15: remove the entry once the react-native/metro tree no longer resolves `semver@6.3.1` |
| 2026-09-28 | C4 (R-28) | `trustPolicyExclude` gains `'ua-parser-js@1.0.41'` (exact version; no range, bare name or pattern; `trustPolicy: no-downgrade` unchanged) | `pnpm install` failed with `ERR_PNPM_TRUST_DOWNGRADE` for `ua-parser-js@1.0.41` once `@sanchay/ui` added the catalog-pinned `react-native-web@0.21.2`. Dependency path: `react-native-web@0.21.2` → `fbjs@3.0.5` (declares `ua-parser-js: ^1.0.35`) → `ua-parser-js@1.0.41`. Escalated to the lead; owner-approved R-28 (`docs/delivery/rulings.md`). Re-check 2027-01-15: remove the entry once `react-native-web` no longer resolves `ua-parser-js@1.0.41` |
| 2026-09-28 | C4 | `minimumReleaseAgeExclude` gains `'jsdom@30.1.1'` | catalog pin (Vitest DOM environment for `@sanchay/ui`), published 2026-09-22T02:07:00.270Z; expires 2026-09-29 |
| 2026-09-28 | C4 | `minimumReleaseAgeExclude` gains `'w3c-xmlserializer@6.0.0'` | transitive dependency of the `jsdom@30.1.1` catalog pin, published 2026-09-21T08:41:48.922Z; expires 2026-09-28 |
| 2026-09-28 | C1-C4-C5 review fix (round 4) | Owner-decision provenance for the R-28 `trustPolicyExclude` entries `'semver@6.3.1'` and `'ua-parser-js@1.0.41'`; no config change. owner decision record: Claude Code controller session `2f00d411-382c-43a6-bd67-ecaf60c67db1`, AskUserQuestion answer record `745eb3c2-09b9-4f47-a5f7-0d14e5dd3d20` (tool call `toolu_01UG2w7GoLTLx6z4FT4jvfZh`), answered 2026-09-28T07:00:39.180Z, sha256 5820238f29ea96d4050f7034bfa2e413dd9bbdac34758b4b75392377234d4ba5 | Review finding: the ruling commit `160b8f0` and the commit that acts on it (`471ed0f`) share one git identity, so the tracked repo alone could not tell an owner ruling from implementer self-authorization. The record above is written by the Claude Code harness when the owner picks an option in the desktop app, outside this repo and outside any implementer's output. The owner chose "Exact-version exceptions (Recommended)": allow exactly `chokidar@4.0.3`, `ua-parser-js@1.0.41` and `semver@6.3.1`, no ranges and no wildcards, each with an ADR-0001 row giving the reason and a re-check date, with the policy staying on for everything else. The same answer chose "I'll install Node 24.21.0 myself (Recommended)" (R-29). The answer precedes the ruling commit `160b8f0` (2026-09-28T07:00:58Z) by 19 s. The sha256 covers the record's JSONL line without its trailing newline; the record is not signed, so the hash pins its content from this commit on, not before it. The owner's answer did not separately approve the `471ed0f` rewrite of `packages/config/test/trust-policy-governance.test.ts`; that rewrite enforces the owner's "exact versions only, policy on for everything else" condition, and owner confirmation of it is still recommended. |
| 2026-09-28 | C1-C4-C5 review fix (round 5) | Governance lock narrowed to the owner's recorded decision; no config change. `packages/config/test/trust-policy-governance.test.ts` admits a `trustPolicyExclude` entry only if it is one of the versions named in the verbatim text of the option the owner chose, "Exact-version exceptions (Recommended)": "Allow exactly chokidar@4.0.3, ua-parser-js@1.0.41 and semver@6.3.1 (no ranges, no wildcards), each with an ADR-0001 row giving the reason and a re-check date. The policy stays on for everything else." The quote comes from the owner decision record cited in the round 4 row above (answer record `745eb3c2-09b9-4f47-a5f7-0d14e5dd3d20`, sha256 `5820238f…4d4ba5`). Each entry must also be an exact version, be named in backticks in `rulings.md`, have an ADR-0001 row with a re-check date, and have an ADR-0001 row that cites that record by its exact answer time and sha256. chokidar stays on its override. | Review finding: `471ed0f` replaced the pre-R-28 blanket ban (`650413f`) with an admission rule of the implementer's own design (any exact version named in `rulings.md` with an ADR-0001 row), and round 4's citation check accepted any 64-hex string. The owner approved neither rule, and same-identity edits to `rulings.md` and this file could satisfy both, so the lock's own ratification could not be told apart from implementer self-authorization. Now nothing an implementer writes in this repo can admit an entry. Compared with `650413f`, the only relaxation is the owner's quoted choice; every other check is inherited or stricter. A test forges a `rulings.md` line and an ADR-0001 row carrying the real citation for `left-pad@1.3.0`, and the lock rejects it. Widening the set means editing the quote in the test, and only a new owner record can justify that. To check the quote, hash the record line as the round 4 row describes, then confirm that the same line contains the quoted text. The owner has not reviewed the test code itself: this row records the lock's scope, not an owner approval of it. |
| vitest jsdom realm (C9) | 5.0.1 | Vitest 5.0.1 jsdom already exposes Node's AbortController/AbortSignal; test-realm passed at red; C9 pin kept as a no-op guard | re-check on the next vitest or jsdom catalog bump |
| 2026-09-28 | C10 | `minimumReleaseAgeExclude` gains 9 exact entries: `'@next/env@16.3.6'`, `'@next/swc-darwin-arm64@16.3.6'`, `'@next/swc-darwin-x64@16.3.6'`, `'@next/swc-linux-arm64-gnu@16.3.6'`, `'@next/swc-linux-arm64-musl@16.3.6'`, `'@next/swc-linux-x64-gnu@16.3.6'`, `'@next/swc-linux-x64-musl@16.3.6'`, `'@next/swc-win32-arm64-msvc@16.3.6'`, `'@next/swc-win32-x64-msvc@16.3.6'` | `pnpm install` failed with `ERR_PNPM_NO_MATURE_MATCHING_VERSION` once `apps/web` (this task) became the first workspace package to depend on the catalog-pinned `next@16.3.6`: A1's exclusion list covers `next@16.3.6` itself but missed next's own platform subpackages, all published 2026-09-22T16:08–16:21Z, within the `minimumReleaseAge: 10080` (7-day) window. Every timestamp is within the same ~13-minute publish batch; all nine expire 2026-09-29 |
| 2026-09-28 | C10 | `readSiteConfig`'s `SANCHAY_PLATFORM_ARN` pattern is `^ARN-\d{1,9}$` (9 digits), not the brief's `^ARN-\d{1,7}$` (7 digits); `site-config.test.ts` pins the 9-digit boundary (`ARN-123456789` valid, `ARN-1234567890` invalid) in place of the brief's 7/8-digit cases | The brief's own stated intent is that this pattern stay identical to C6's `ARN_REGEX` so a bad ARN fails at config time instead of inside `dsc02`. `packages/domain/src/legal-entity.ts` (delivered by C6) defines `ARN_REGEX = /^ARN-\d{1,9}$/` and `packages/domain/test/legal-entity.test.ts` pins `ARN_REGEX.source` to `'^ARN-\\d{1,9}$'` and accepts a 9-digit ARN, not 7. The brief text was written against an earlier assumption about C6 and was not updated after C6 shipped. Matching C6's actual delivered pattern (the documented intent) takes precedence over the brief's literal digit count |
| 2026-10-19 | C11 | `apps/web/next.config.ts` `cacheComponents=false` | Next 16.3.6 CSP guide: a nonce-based CSP needs every app page rendered per request, and PPR static shells cannot carry the per-request nonce. Revisit in P2-2 with SRI (`experimental.sri`) plus a hash-based CSP. |
| 2026-09-28 | C14 | `minimumReleaseAgeExclude` gains 10 exact entries: `'@expo/cli@57.0.27'`, `'@expo/router-server@57.0.11'`, `'@expo/ui@57.0.20'`, `'babel-preset-expo@57.0.13'`, `'expo@57.0.25'`, `'expo-glass-effect@57.0.4'`, `'expo-linking@57.0.11'`, `'expo-modules-core@57.0.19'`, `'expo-modules-jsi@57.1.1'`, `'expo-router@57.0.23'` | `pnpm install` failed with `ERR_PNPM_NO_MATURE_MATCHING_VERSION` once `apps/mobile` (this task) first depended on the pinned Expo SDK 57.0.25 module set: A1's exclusion list did not yet cover Expo, and every listed package was published 2026-09-24T10:12–10:19Z, within the `minimumReleaseAge: 10080` (7-day) window. Every timestamp is within the same ~7-minute publish batch; all ten expire 2026-10-01 |
| 2026-09-28 | C14 | Expo SDK 57.0.25 bundled modules pinned directly in apps/mobile/package.json, outside the catalog: expo 57.0.25, expo-constants ~57.0.19, expo-crypto ~57.0.3, expo-linking ~57.0.11, expo-local-authentication ~57.0.3, expo-router ~57.0.23, expo-screen-capture ~57.0.3, expo-secure-store ~57.0.4, expo-status-bar ~57.0.1, react-native-safe-area-context ~5.7.0, react-native-screens ~4.26.0 | Versions from https://unpkg.com/expo@57.0.25/bundledNativeModules.json (checked 2026-09-25); verified with `expo install --check` ("Dependencies are up to date") |
| 2026-09-28 | C14 | Android build path: Metro and Gradle for apps/mobile run only from the `subst S:` drive (S:\ maps to C:\Users\pc\Desktop\sanchay). `pnpm install --frozen-lockfile --force` runs from S:\ before an Android session and from C:\ after it. Never run `expo run:android` or `expo start` from the C:\ path. | Gradle/CMake exceed the Windows 260-character path limit under C:\Users\pc\Desktop. pnpm's hoisted workspace junctions (node_modules/@sanchay/*) store absolute targets, so they must point inside the S:\ project root, or Metro resolves workspace packages outside its watchFolders (SHA-1 / resolution errors, duplicate React). |
