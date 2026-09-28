<!-- source: workflow wf_3190e72a-04a label spec:testing | exported 2026-09-28 -->

# Sanchay: quality and test strategy

**Scope:** the Sanchay monorepo, with apps/api (NestJS 11 on Node 24, Drizzle, PostgreSQL 18), apps/web (Next.js 16), apps/native (Expo, Expo Router) and the shared `@sanchay/*` packages.
**Team:** 2 developers plus AI agents, 2-week sprints. **Date:** 2026-09-25. This is a planning document; no files were changed.

---

## 0. Decisions at a glance

| # | Decision | Why (v1 evidence or source) |
|---|---|---|
| D1 | **Vitest 4** runs every TS package plus apps/api and apps/web. apps/native component tests use **jest-expo + @testing-library/react-native**. | Vitest 4 replaced "workspace" with `test.projects`, and V8 AST coverage is its only mode ([QASkills migration guide](https://qaskills.sh/blog/vitest-4-migration-guide-breaking-changes), accessed 2026-09-25). jest-expo is Expo's supported unit harness for RN. |
| D2 | NestJS under Vitest compiles through **`unplugin-swc`**. | esbuild does not emit `emitDecoratorMetadata`, which Nest DI needs (NestJS SWC recipe). |
| D3 | All database-touching tests use **Testcontainers `postgres:18-alpine`**, pinned by digest. One container per run. Each test file gets its own database, cloned from a migrated **template DB**. | v1 had 156 test classes and no Testcontainers. Surefire forced `SPRING_PROFILES_ACTIVE=local` against a real local Postgres (`investor/platiziowealthtech-Back_end/pom.xml:122-142`). One JUnit class wrote into the working DB and polluted audit counts (`COMPLIANCE-REVIEW-2026-09-03.md:318`, per the docs-compliance slice). |
| D4 | The FP client sits behind a port (`FpClient`). **`FakeFpClient`** is stateful and in-memory, mirrors v1 `MockCybrillaClient` behaviour, and adds real state progression and signed webhooks. **One shared contract suite** runs against the fake on every PR and against the Cybrilla sandbox nightly. | The v1 mock is stateless: `fetchMfPurchase` always returns `successful` (`integration/MockCybrillaClient.java:647-654`) and `fetchMandate` always returns `APPROVED` (`:758-763`), so lifecycle bugs never showed up. |
| D5 | **No live sandbox call is ever on the PR critical path.** | v1 flake: a live sandbox `mf_purchase` round-trip ran past Playwright's 15 s `actionTimeout` (QA-FULL-TEST-REPORT-2026-07-27 §5). |
| D6 | **No dev master OTP code exists in v2.** Test environments deliver OTPs to a capture sink behind a boot guard. | v1 C1 (Critical): profile-change 2FA accepted `000000` because only `TRANSACTION_APPROVAL` was excluded from the bypass (`COMPLETE_TEST_SUITE_REPORT.md:14,75-76`). |
| D7 | The **BOLA suite is generated from the OpenAPI document.** Every operation must declare `x-authz`, or the suite fails. | v1 SEC-2/4/5/6 were hand-found BOLA and IDOR bugs (`investor-frontend/tests/api-authorization.spec.ts:95-194`). |
| D8 | **E2E runs in parallel with per-test isolated investors** seeded through a test-only scenario API. Rate-limit buckets are namespaced per run. | v1 Playwright ran `workers: 1, fullyParallel: false` (`investor-frontend/playwright.config.ts`). A shared per-IP login rate limiter caused flaky 429s (R1 regression report). |
| D9 | Golden vectors live in **JSON files**. Money is always a decimal string. Every vector cites its provenance. Only both humans (CODEOWNERS) may change them, never an agent on its own. | Some v1 vectors encode tax rules that have since changed (see §5.4). Vectors are regulatory evidence, not test data. |
| D10 | PR critical path is **≤ 15 min p90**. Nightly is ≤ 60 min. Native E2E smoke runs on PRs only when the native or shared UI/logic paths changed. It runs in full on `main` and nightly. | 2 developers: slow CI would get bypassed. |

---

## 1. v1 lessons converted into v2 rules

| v1 finding | Source | v2 rule / test |
|---|---|---|
| Tests needed a real local Postgres; H2 was declared but unused | be-platform-auth slice; `pom.xml:85-89,122-142` | D3. `pnpm test` must pass on a clean machine with Docker as the only dependency. |
| Integration test polluted the shared DB | `COMPLIANCE-REVIEW-2026-09-03.md:318` | Each file gets its own DB from the template. `beforeEach` truncates. No test may reach a non-container DB. A Vitest setup assertion refuses any `DATABASE_URL` host that is not the container. |
| Purchase 2FA hash mismatch: in-memory nanosecond timestamp vs Postgres microseconds | Synthesis §11 #1 | **R-01**: integration test that builds the approval snapshot, round-trips it through PG, and recomputes. Hashes must be computed only from DB-read values. A property test covers timestamps with sub-microsecond parts. |
| FP `createOrder` fired **before** any 2FA challenge existed, outside any transaction | Synthesis L15; `OrderService.java:529,601-608` | **R-02**: the FakeFp call log must contain no `createMfPurchase` until the approval is consumed. Asserted in API E2E for lumpsum, SIP, redemption, switch, STP and SWP. |
| Full redemption of an estimated holding was refused **after** 2FA had been spent | Synthesis §11 #2 | **R-03**: eligibility is checked before challenge creation. Test: an ineligible redemption never produces a challenge row. |
| Master code accepted for a non-excluded OTP purpose | `COMPLETE_TEST_SUITE_REPORT.md:75-76` | **R-04**: a lint rule bans the `'000000'` literal in `apps/api/src`. A table test runs every `OtpPurpose` against a wrong code. The boot-guard test refuses test hooks in production. |
| Cleartext PAN in `external_api_snapshots.investor_identifier` (1,062/1,062 rows); plaintext OTP in logs (SEC-1) | docs-compliance slice (`COMPLIANCE-REVIEW-2026-09-03.md:82,320`; QA 2026-07-27) | **R-05**: a PII log and DB scanner runs after every API E2E run. It regex-scans captured logs and all text/jsonb columns for PAN, mobile, email, OTP and account-number patterns (except allow-listed encrypted or masked columns). |
| Public signup accepted a client-supplied `role=ADMIN` | Synthesis §12 #1; `AuthSignupRequest.java:23` | **R-06**: a mass-assignment test posts `role`, `isAdmin`, `investorId` and `permissions` to every public or investor endpoint. Expected result: 400 or the fields are ignored. Admin creation exists only via seeded CLI. |
| Concurrent identity checks created duplicate FP pre-verifications | M4-27 in the 2026-09-24 run | **R-07**: 10 parallel identity checks produce exactly 1 FP call (row lock or unique key). |
| AMOUNT redemptions consumed 0 units, so the holding could be double-spent | `RedemptionAvailability.java:31-39` | **R-08**: port the vectors (§5.3). Add a concurrency test: two parallel redemptions that are each valid alone but not together; exactly one is accepted. |
| Webhook dedupe was in-memory only | Synthesis §2 (`CybrillaWebhookController`) | **R-09**: replay after an app restart is still deduped (§8). |
| Minor nominee without guardian was bypassable | docs-compliance slice (`:108-120`) | **R-10**: nomination rules tests ported from `NominationRulesTest.java:31-195`. The cap is a config value whose test cites the circular. |
| Framer-motion step races on rapid clicks | QA 2026-07-27 | Playwright `reducedMotion: 'reduce'`. The app honours `prefers-reduced-motion`. The native test build sets animations to 0 ms via the `EXPO_PUBLIC_E2E=1` flag. |
| `tsconfig` not strict by default; 26 errors staged | fe-platform slice (`tsconfig.json:1-26`) | `strict: true` everywhere from day 1. `tsc -b` is a required gate. |
| v1 security-negative E2E tests were valuable: bypass, `000000`, cross-challenge | `approval-negatives.spec.ts:142-192`, `approval-bypass.spec.ts:72` | Port the pattern into the API security suites (§9). The UI E2E only asserts the user-facing results. |

---

## 2. Test pyramid and ownership

### 2.1 Target volumes at first public launch

| Layer | Runner | Approx. count | Runs on |
|---|---|---|---|
| Unit: pure packages (money, validation, portfolio-math, domain-rules, tax), including golden-vector and property tests | Vitest 4 + fast-check | ~700 | every PR |
| Unit: api services/guards, web components/hooks, native components | Vitest (api, web), jest-expo (native) | ~800 | every PR |
| Integration: Postgres (repos, migrations, transactions, idempotency, concurrency) | Vitest + Testcontainers | ~250 | every PR |
| Contract: FP (shared suite) | Vitest | ~60 operations | PR against the fake; nightly against the sandbox |
| API E2E: in-process Nest + PG + FakeFp, including webhook replay, generated BOLA, OTP abuse | Vitest + supertest | ~150 hand-written, plus 4-6 generated per endpoint | every PR |
| Web E2E | Playwright | ~40 specs (12 tagged `@smoke`) | smoke on PR; full on main and nightly |
| Native E2E | Maestro on Android emulator | ~15 flows (6 `@smoke`) | smoke on path-filtered PRs; full on main and nightly; iOS weekly and pre-release |
| Accessibility | axe (Playwright + vitest-axe), RN a11y lint | inside the layers above | every PR |
| Performance | Lighthouse CI, route-JS budget spec, Hermes bundle budget, Reassure, k6, device cold start | per budget (§13) | PR (bundle, LHCI), nightly (Reassure baseline, k6 weekly), release (device) |
| Security scanning | gitleaks, Semgrep CE, osv-scanner, ZAP baseline, Schemathesis | – | PR (first three), nightly (last two) |
| Mutation | Stryker (Vitest runner) | money, portfolio-math, domain-rules, tax | weekly |

### 2.2 Ownership per package or app

Dev A = backend/platform owner; Dev B = web/native owner. Agents write most test code. Humans own the vectors, the security suites and the budgets.

| Package / app | Test types | Coverage gate (lines / branches) | Owner | Human-only files (CODEOWNERS: both devs) |
|---|---|---|---|---|
| `packages/money` | unit, property, golden, mutation | 95 / 90, mutation ≥ 80% | A | `test/golden/**` |
| `packages/validation` (shared zod schemas) | unit, property; "one schema, three consumers" contract | 95 / 90 | A | `test/golden/**` |
| `packages/portfolio-math` (XIRR, holdings valuation, gains, allocation, redemption availability, ELSS lock-in) | unit, golden, property, mutation | 95 / 90, mutation ≥ 80% | A | `test/golden/**` |
| `packages/domain-rules` (NAV cut-off, SIP rules, nominee rules, order state machines) | unit, golden, property | 95 / 90 | A | `test/golden/**` |
| `packages/tax` (capital gains FIFO, ELSS summary, statements) | unit, golden | 95 / 90 | A | `test/golden/**` |
| `packages/fp-client` (port, HTTP adapter, FakeFp, schemas) | unit, contract (fake on PR, sandbox nightly), recording-parse | 85 / 80 | A | `contract/recordings/**` |
| `packages/fund-data` (AMFI parser, FundFactsProvider, curation) | unit (ported AMFI fixtures), nightly live-feed check | 90 / 85 | A | – |
| `packages/cas-import` | unit on redacted text fixtures; nightly on encrypted PDFs | 90 / 85 | A | `test/fixtures/**` |
| `packages/db` (Drizzle schema, migrations) | integration (migrate, drift, constraints), Squawk lint | n/a | A | `migrations/**` (both devs) |
| `packages/testkit` | self-tests of factories and generators | n/a | A | – |
| `packages/api-contract` (OpenAPI types, client) | type tests (`expectTypeOf`), generated-client compile | n/a | A | – |
| `apps/api` | unit, integration, API E2E, security, webhook replay | 85 / 80 (domain services); 80 overall | A | `test/security/**`, `test/fixtures/webhooks/**` |
| `packages/ui-web`, `packages/tokens` | Vitest + RTL + vitest-axe; token contrast test | 80 / 70 | B | `tokens` contrast test |
| `apps/web` | Vitest (client components, hooks), Playwright, LHCI, route-JS budget | 70 / 60 (hooks and utils 85) | B | `e2e/budgets.json` |
| `packages/ui-native` | jest-expo + RNTL, Reassure | 80 / 70 | B | – |
| `apps/native` | jest-expo, Maestro, bundle budget, device perf | 70 / 60 | B | `perf/budgets.json` |
| Admin back-office (inside `apps/web` under `/ops`, assumption) | Playwright admin journeys, RBAC matrix (API) | as `apps/web` | B (UI), A (RBAC) | RBAC matrix file |

---

## 3. Folder and naming conventions

```
sanchay/
├─ .github/
│  ├─ workflows/{pr.yml, main.yml, nightly.yml, weekly.yml, release.yml}
│  └─ CODEOWNERS
├─ vitest.config.ts                  # root: test.projects = packages/* + apps/api + apps/web
├─ turbo.json
├─ compose.test.yml                  # pg18 + api(test image) + web for E2E
├─ packages/
│  ├─ money/src/*.ts, *.test.ts      # colocated unit tests
│  │   └─ test/golden/*.json         # golden vectors (CODEOWNERS)
│  ├─ portfolio-math/…/test/golden/{xirr,holdings,redemption-availability,allocation,elss-lockin}.json
│  ├─ tax/…/test/golden/capital-gains.fy2024-25.json …
│  ├─ fp-client/
│  │   ├─ src/port.ts, src/http/*.ts, src/schemas/*.ts (zod)
│  │   ├─ src/fake/{fake-fp.ts, state-machines.ts, scenarios.ts, webhook-emitter.ts}
│  │   └─ contract/{fp-contract.suite.ts, fake.contract.test.ts, sandbox.contract.test.ts, recordings/**}
│  └─ testkit/src/{factories/*, generators/{pan,mobile,ifsc,isin}.ts, clock.ts, scenarios/*, pii-scanner.ts}
├─ apps/api/
│  ├─ src/<module>/**/*.test.ts                   # unit
│  └─ test/
│     ├─ setup/{pg.global-setup.ts, db.ts, app.ts, fp.ts}
│     ├─ integration/<module>/*.int.test.ts
│     ├─ e2e/<journey>/*.e2e.test.ts
│     ├─ security/{bola.gen.e2e.test.ts, rbac.gen.e2e.test.ts, otp-abuse.e2e.test.ts, mass-assignment.e2e.test.ts, pii-leak.e2e.test.ts}
│     ├─ webhooks/*.e2e.test.ts
│     └─ fixtures/webhooks/fp/<object>.<event>.json
├─ apps/web/
│  ├─ src/**/*.test.tsx
│  └─ e2e/{fixtures.ts, journeys/*.spec.ts, admin/*.spec.ts, a11y.ts, perf/route-js-budget.spec.ts, budgets.json}
└─ apps/native/
   ├─ src/**/*.test.tsx                            # jest-expo
   ├─ .maestro/{config.yaml, flows/*.yaml, subflows/*.yaml, scripts/*.js}
   └─ perf/{budgets.json, measure-cold-start.sh, bundle-size.mjs}
```

| Suffix | Meaning | Vitest project |
|---|---|---|
| `*.test.ts(x)` | unit (no I/O, no container) | `unit` |
| `*.int.test.ts` | Postgres integration | `integration` |
| `*.e2e.test.ts` | in-process API E2E | `api-e2e` |
| `*.contract.test.ts` | FP contract | `contract` (fake on PR; sandbox with `FP_TARGET=sandbox`) |
| `*.spec.ts` in `apps/web/e2e` | Playwright | – |
| `.maestro/flows/*.yaml` | Maestro | – |

Tags: Playwright uses `@smoke @compliance @req:<ID>` in titles. Maestro uses `tags:` in flow YAML. Vitest uses `describe('[req:SEBI-2FA-PURCHASE] …')`.

---

## 4. Tooling (pin exact versions via Renovate at scaffold time)

| Concern | Tool | Notes |
|---|---|---|
| Unit / integration / API E2E | vitest ^4, @vitest/coverage-v8 ^4 (same major), unplugin-swc, fast-check | Coverage uses the V8 AST remapping, the only mode in v4 ([vitest.dev/guide/coverage](https://vitest.dev/guide/coverage), accessed 2026-09-25). |
| Postgres | testcontainers + @testcontainers/postgresql, image `postgres:18-alpine@sha256:…` | Docker Desktop is required on the developers' Windows machines. Set `TESTCONTAINERS_REUSE_ENABLE=true` locally. |
| HTTP API tests | supertest against `app.getHttpServer()` | Works with the Express or Fastify adapter (with Fastify, `await app.getHttpAdapter().getInstance().ready()`). |
| Web E2E | @playwright/test (v1 already used ^1.61.1), @axe-core/playwright | |
| Web unit | Vitest + @testing-library/react + jsdom, vitest-axe | Async Server Components are covered by Playwright, not Vitest. |
| Native unit | jest-expo, @testing-library/react-native, Reassure | |
| Native E2E | Maestro CLI (2.x), reactivecircus/android-emulator-runner@v2 | Expo documents Maestro as its preferred E2E tool ([Maestro repo](https://github.com/mobile-dev-inc/maestro), accessed 2026-09-25). |
| Expo SDK | latest stable at scaffold time (SDK 56 ships RN 0.85 with Hermes v1 as default; a Hermes v1 memory regression is fixed in SDK 57) | [expo.dev/changelog/sdk-56](https://expo.dev/changelog/sdk-56), accessed 2026-09-25. Use SDK 57 or later. |
| RN accessibility lint | eslint-plugin-react-native-a11y, `configs.flat.all` | Flat config and ESLint 9/10 supported ([Volksverpetzer fork](https://github.com/Volksverpetzer/eslint-plugin-react-native-a11y), accessed 2026-09-25). |
| Web accessibility lint | eslint-plugin-jsx-a11y (strict) | |
| Performance | @lhci/cli, custom route-JS budget spec, k6 | |
| Migrations | drizzle-kit, Squawk (Postgres migration linter) | |
| Security | gitleaks, Semgrep CE, osv-scanner, OWASP ZAP baseline, Schemathesis | |
| Mutation | @stryker-mutator/core + vitest-runner | |

---

## 5. Unit tests and golden vectors

### 5.1 Golden vector format (all pure packages)

```json
{
  "suite": "xirr",
  "ruleVersion": "xirr-v1-act365",
  "vectors": [
    {
      "id": "XIRR-003",
      "source": "v1 XirrCalculatorTest.java:67-75",
      "description": "Halved over one year",
      "input": { "cashflows": [["2024-01-01", "-2000"], ["2024-12-31", "1000"]] },
      "expected": { "rate": "-0.5", "tolerance": "1e-3" }
    }
  ]
}
```

Runner pattern, the same in every package:

```ts
// packages/portfolio-math/src/xirr.golden.test.ts
import vectors from '../test/golden/xirr.json' with { type: 'json' };
describe.each(vectors.vectors)('$id $description', (v) => {
  it('matches', () => {
    const r = xirr(v.input.cashflows.map(([d, a]) => ({ date: d, amount: a })));
    if (v.expected.rate === null) expect(r).toBeNull();
    else expect(Math.abs(r! - Number(v.expected.rate))).toBeLessThanOrEqual(Number(v.expected.tolerance));
  });
});
```

### 5.2 XIRR (`packages/portfolio-math`)

Algorithm port: Newton-Raphson with seed 0.1, tolerance 1e-7, at most 100 iterations. It falls back to bracketed bisection with at most 200 iterations. The result is `null`, never NaN or Infinity (synthesis §7). Internally it uses `number`, matching v1 (`XirrCalculator.java:41,198`). Inputs cross the boundary as decimal strings.

| ID | Cashflows | Expected | Tol. | Source |
|---|---|---|---|---|
| XIRR-001 | -1000 on 2024-01-01; +2000 on 2024-12-31 | 1.0 | 1e-3 | `XirrCalculatorTest.java:25-33` |
| XIRR-002 | -1000 on 2022-01-01; -1000 on 2023-01-01; +2210 on 2024-01-01 | 0.0681 (= (-1+√9.84)/2 - 1). NPV at root ≈ 0 (±1e-2) | 1e-3 | `:45-61` |
| XIRR-003 | -2000 on 2024-01-01; +1000 on 2024-12-31 | -0.5 | 1e-3 | `:67-75` |
| XIRR-004 | [] / one flow / null | null | – | `:77-83` |
| XIRR-005 | all negative / all positive | null | – | `:85-93` |
| XIRR-006 | -1000 and +1500 on the same day | null | – | `:95-100` |
| XIRR-007 | -1,000,000 on 2024-01-01; +1 on 2024-12-31 | finite, not NaN or Inf | – | `:102-111` |
| XIRR-101 | SIP: -1000 on the 5th of each month, 2024-01-05 to 2024-12-05; +13000 on 2025-01-05 | 0.15655170 | 1e-6 | new, reference computed during this analysis (act/365 bisection) |
| XIRR-102 | -10000 on 2023-06-15; +4000 on 2024-06-14; +8000 on 2025-06-15 | 0.11638351 | 1e-6 | new |
| XIRR-103 | -1000 on 2024-02-29; +1100 on 2025-02-28 (365 days) | 0.10000000 | 1e-6 | new, leap-day boundary |
| XIRR-104 | -100000 on 2025-01-01; +101000 on 2025-01-31 | 0.12869529 | 1e-6 | new, short-horizon annualisation |
| XIRR-105 | 200 random SIP portfolios (fast-check) | NPV(result) within 1e-6 × Σ\|cf\|, or null | – | property |

Assumption: vectors 101-104 are cross-checked against LibreOffice `XIRR` once, and the check is recorded in `source`, before they are frozen.

### 5.3 Redemption availability (port of `RedemptionAvailability.java`)

Rules to preserve: BLOCKING statuses are {CREATED, PENDING_INVESTOR_ACTION, SUBMITTED, PROCESSING, BANK_CREDIT_PENDING}. SETTLED_OUT statuses are {SUCCESSFUL, BANK_CREDIT_COMPLETED}. FAILED releases its units (`:76-92`). An AMOUNT redemption consumes `gross × amount / basis`, rounded UP at 8 dp. The rupee ceiling is rounded HALF_UP at 4 dp (`:94-98,199-229`). An unsizeable redemption returns `null` (unknown), never 0 (`:146-160`).

Base holding for all rows: 1000 units bought for ₹50,000, provider-confirmed (`OrderServiceRedemptionCeilingTest.java:370-381`).

| ID | NAV | Existing redemptions | availableUnits | availableAmount | Request → result | Source |
|---|---|---|---|---|---|---|
| RA-001 | none | – | 1000 | 50000 | UNITS 1000.0001 → refuse; UNITS 1000 → accept | `…CeilingTest.java:73-110` |
| RA-002 | 40 | – | 1000 | 40000 | AMOUNT 45000 → refuse; 40000 → accept, draft units null | `:117-142` |
| RA-003 | none | – | 1000 | 50000 | AMOUNT 50000.01 → refuse; 50000 → accept | `:145-166` |
| RA-004 | none | PENDING_INVESTOR_ACTION 400 u | 600 | 30000 | UNITS 600.0001 → refuse; 600 → accept | `:197-212` |
| RA-005 | none | SUCCESSFUL 250 u | 750 | 37500 | UNITS 750.01 → refuse | `:215-222` |
| RA-006 | none | each status in BLOCKING ∪ SETTLED, 900 u | 100 | 5000 | UNITS 150 → refuse (for every status; generated from the enum, not restated) | `:232-245` |
| RA-007 | none | FAILED 900 u | 1000 | 50000 | UNITS 1000 → accept | `:248-257` |
| RA-008 | none | SUBMITTED 600 u | 400 | 20000.0000 | AMOUNT 20000.01 → refuse; 20000 → accept | `:260-275` (the in-code comment says "400 in flight" but the stub is 600; the vector follows the stub) |
| RA-009 | none | BANK_CREDIT_COMPLETED 1000 u | 0 | 0 | UNITS 0.0001 and AMOUNT 1 → refuse both | `:278-290` |
| RA-101 | 40 | PENDING amount ₹10,000, units null | 750.00000000 | 30000.0000 | new: amount-share consumption |
| RA-102 | 30 | PENDING amount ₹10,000 | 666.66666666 (consumed 333.33333334, UP) | 20000.0000 (19999.9999998 HALF_UP at 4 dp) | new: rounding directions |
| RA-103 | none, invested null | PENDING amount ₹1,000 | null | null | new: unsizeable is unknown, not zero |
| RA-P1 | property | random mixes | availableUnits ≥ 0; UNITS mode and AMOUNT mode can never jointly exceed the gross | – | fast-check |

### 5.4 Holdings valuation and dashboard (port of `HoldingsService`)

| ID | Scenario | Expected | Source |
|---|---|---|---|
| HV-001 | 100 u for ₹1000 a year ago; NAV 20, prev 19.5 | invested 1000.00, current 2000.00, abs 1000.00, pct 100.00, 1-day 50.00, quality OK, XIRR ≈ 1.0 (±0.05), portfolio XIRR ≈ 1.0 | `HoldingsServiceTest.java:113-142` |
| HV-002 | 100 u bought, 40 u redeemed (SUCCESSFUL); NAV 15 | units 60, current 900.00 | `:144-160` |
| HV-003 | no NAV | current = at-cost 1000, abs 0, STALE | `:162-179` |
| HV-004 | NAV 12, no as-of date; 50 u | current 600.00, STALE, 1-day null | `:181-193` |
| HV-005 | fully redeemed | holding excluded | `:195-208` |
| HV-006 | only a pending order | no holdings; totalInvested 0.00 | `:210-221` |
| HV-007 | derived-units lot ₹50,000, NAV 40, estimate flag off | units null, current null, XIRR null, UNAVAILABLE, unallottedInvested 50000.00 | `HoldingsServiceEstimatedUnitsTest.java:70-86` |
| HV-008 | HV-007 plus a real 100 u / ₹1000 lot in another scheme | totalInvested 51000.00, investedValued 1000.00, unvalued 50000.00, totalCurrentValue 4000.00, coverage PARTIAL, portfolio XIRR null | `:110-131` |
| HV-009 | derived lot, flag on | units 1249.9375 (= (50000 - 2.50 stamp duty)/40), current 49997.50, ESTIMATED | `:178-188` |
| HV-010 | ESTIMATED lot with a stale NAV | STALE outranks ESTIMATED | `:197-204` |
| AL-001 | allocation by SEBI 2026 category: three holdings of 333.33, 333.33, 333.34 | percentages 33.33 / 33.33 / 33.34, summing to exactly 100.00 (largest remainder) | new; the category taxonomy is net-new (synthesis §7, G10) |
| SIP-001 | active SIP count over plans {active, active, paused, cancelled, completed, failed} | 2 | new. Assumption: "active" is FP plan state `active` only; paused is shown separately. This resolves the two conflicting v1 definitions (synthesis §7). |

### 5.5 Capital gains and ELSS (`packages/tax`)

v1 defects that must **not** be carried into vectors:
- v1 classifies all non-equity funds as long-term after 1095 days (`CapitalGainsReportService.java:53-54`).
- v1 treats category `MF` as equity-oriented (`:293-300`).
- v1 uses order `createdAt` rather than the allotment date (`:83,287`).
- v1 compares days (`> 365`) rather than calendar months (`:286-290`).

The v2 rules are versioned by transfer date in a `TaxRuleSet`.

Assumption: the rules for transfers on or after 2024-07-23 are: equity-oriented funds are LTCG if held more than 12 months; specified mutual funds (≤ 35% domestic equity) acquired on or after 2023-04-01 are always STCG; other non-equity funds are LTCG if held more than 24 months; equity grandfathering at 31-Jan-2018 FMV. These rules are carried into the Income-tax Act 2025 regime from 2026-04-01. A CA must sign off `rulesets/*.yaml` before launch, and that sign-off is part of the DoD for the tax epic.

| ID | Scenario | Expected | Source |
|---|---|---|---|
| CG-001 | Equity: 100 u for ₹1000 on 2017-01-01; FMV NAV 15; sold for ₹2000 on 2024-04-10 | LTCG 500.00; purchase cost 1000.00; FMV 1500.00; grandfathered cost 1500.00 | `CapitalGainsReportServiceTest.java:33-100` |
| CG-002 | Debt (specified MF): bought for ₹1000 on 2024-04-01; sold for ₹1200 on 2024-10-01 | STCG 200.00 (v2 reason: Sec 50AA deemed short-term; v1 reached the same number for a different reason) | `:58-89` |
| CG-003 | CG-001 exported as ClearTax CSV | header starts `Asset Type,ISIN,Security Name,Date of Purchase,Date of Sale`; row `EQUITY,INF-EQ-1,…,2000.00,1000.00,1500.00,1500.00,0.00,0.00,500.00,<PAN>` | `:102-133` |
| CG-004 | Derived-units lot | not a cost basis; the redemption falls to the unmatched line (full sale value, zero cost, STCG) | `CapitalGainsDerivedUnitsGuardTest.java:55-160` |
| CG-101 | Equity allotted 2024-02-29, sold 2025-02-28 | STCG (not more than 12 calendar months) | new boundary |
| CG-102 | Equity allotted 2024-02-29, sold 2025-03-01 | LTCG | new boundary |
| CG-103 | Hybrid (35-65% equity) acquired 2023-06-01, sold 2025-06-02 | LTCG (more than 24 months) | new |
| CG-104 | Two SIP lots, partial redemption | FIFO consumes the oldest lot first; split line items | new |
| ELSS-001 | Units allotted 2023-01-10 | locked through 2026-01-09; redeemable from 2026-01-10 | new. Assumption: "3 years from allotment" is exclusive of the allotment day. Confirmed against the sandbox and RTA behaviour in the nightly contract run before launch (G6). |
| ELSS-002 | Monthly ELSS SIP of 12 instalments | each instalment has its own lock-in date; the free-units figure is time-dependent | new |

### 5.6 Money (`packages/money`) and validation (`packages/validation`)

| Area | Tests |
|---|---|
| Representation | Decimal strings on the wire. No `number` in any money type. A type test asserts `Money` is not assignable from `number`. |
| Arithmetic properties | Associativity and commutativity of add. `allocate(total, weights)` sums to exactly `total`. Round-trip `parse(format(x)) === x`. |
| Rounding | Stamp duty 0.005% of amount (`OrderService.java:72,834`). Vectors: ₹50,000 → ₹2.50; ₹500 → ₹0.03 (0.025 HALF_UP). Assumption: HALF_UP at 2 dp; confirmed against FP `purchased_price`/allotment in the contract run. |
| Formatting | Indian grouping `₹1,23,45,678.90`; compact `₹1.23 Cr`, `₹12.3 L`; negative and zero; "never show invested as current value" (`format.ts` discipline from the fe-investor-ux slice). |
| Validation vectors | PAN `^[A-Z]{5}[0-9]{4}[A-Z]$` (`validation/PanFormat.java:15`). Mobile `^[6-9][0-9]{9}$` (`MobileFormat.java:14`). SIP minimum ₹500, start strictly after today, day 1-28, MONTHLY/QUARTERLY (`OrderService.java:2193-2212`). Mandate limit max(₹100,000, 2 × instalment) (`InvestorActionService.java:1014-1019`). |
| Nominee rules | Port `NominationRulesTest.java:31-195`: exactly 100%; running total ≤ 100; minor derived from DOB; guardian and relationship required for a minor; future DOB rejected. `MAX_NOMINEES` comes from config, and its test cites the circular (synthesis §12 #3). |
| Shared-schema contract | The same zod schema is imported by api (DTO pipe), web (react-hook-form resolver) and native. A test asserts all three produce identical error codes for 40 table rows. |

### 5.7 Domain rules (`packages/domain-rules`): NAV cut-off

All tests inject a `Clock`. They run twice in CI, with `TZ=UTC` and `TZ=Asia/Kolkata`. AMFI holidays come from a fixture calendar.

| ID | Case (IST) | Expected applicable NAV date | Rule source |
|---|---|---|---|
| NC-001 | Equity purchase, funds realised 14:59:59 on a business day | same day | 15:00 standard cut-off, pre-existing (synthesis §5, L8) |
| NC-002 | Equity purchase, funds realised 15:00:00 | next business day | same |
| NC-003 | Liquid purchase, funds realised 13:29 | previous calendar day | 13:30 liquid/overnight cut-off |
| NC-004 | Overnight-scheme redemption, online, 18:59 | per the 2025-06-01 revision (online cut-off 19:00) | SEBI/HO/IMD/PoD2/P/CIR/2025/56 |
| NC-005 | Overnight-scheme redemption, online, 19:01 | next business day | same |
| NC-006 | Friday 15:01, following Monday an AMFI holiday | Tuesday | holiday fixture |
| NC-007 | UTC boundary: `2026-09-25T09:29:59Z` = 14:59:59 IST | same day | TZ regression |

---

## 6. Integration tests (Testcontainers Postgres 18)

### 6.1 Harness

```ts
// apps/api/test/setup/pg.global-setup.ts
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';
import { migrateTemplate } from './migrate';

export default async function setup(project: TestProject) {
  const pg = await new PostgreSqlContainer(process.env.PG_IMAGE ?? 'postgres:18-alpine')
    .withDatabase('sanchay_template').withUsername('test').withPassword('test')
    .withCommand(['postgres', '-c', 'fsync=off', '-c', 'synchronous_commit=off',
                  '-c', 'full_page_writes=off', '-c', 'max_connections=300',
                  '-c', 'timezone=UTC'])
    .withTmpFs({ '/var/lib/postgresql': 'rw' })
    .withReuse()
    .start();
  await migrateTemplate(pg.getConnectionUri()); // drizzle migrator; closes all conns afterwards
  project.provide('pgAdminUri', pg.getConnectionUri().replace('/sanchay_template', '/postgres'));
  return async () => { if (!process.env.TESTCONTAINERS_REUSE_ENABLE) await pg.stop(); };
}
```

```ts
// apps/api/test/setup/db.ts, used by *.int.test.ts and *.e2e.test.ts
export async function useFreshDb() {
  const name = `t_${process.env.VITEST_POOL_ID}_${crypto.randomUUID().slice(0, 8)}`;
  await admin.query(`CREATE DATABASE "${name}" TEMPLATE sanchay_template`);  // ~50-150 ms
  const db = drizzle(new Pool({ connectionString: uriFor(name), max: 10 }));
  beforeEach(() => truncateAll(db));          // generated list, excludes reference tables
  afterAll(() => dropDb(name));
  return db;
}
```

```ts
// apps/api/vitest.config.ts
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    projects: [
      { extends: true, test: { name: 'api:unit', include: ['src/**/*.test.ts'], exclude: ['**/*.{int,e2e,contract}.test.ts'] } },
      { extends: true, test: { name: 'api:integration', include: ['test/integration/**/*.int.test.ts'],
        globalSetup: ['test/setup/pg.global-setup.ts'], pool: 'forks', testTimeout: 20_000 } },
      { extends: true, test: { name: 'api:e2e', include: ['test/{e2e,security,webhooks}/**/*.e2e.test.ts'],
        globalSetup: ['test/setup/pg.global-setup.ts'], pool: 'forks', testTimeout: 30_000 } },
    ],
    coverage: { provider: 'v8', include: ['src/**'], thresholds: { lines: 80, branches: 75 } },
    retry: 0,
  },
});
```

### 6.2 What integration tests cover

| Suite | Tests |
|---|---|
| Migrations | Apply from empty. `drizzle-kit generate` in CI must create **no** file (checked with `git status --porcelain`), which catches schema drift. Squawk lint on new SQL (no `CREATE INDEX` without `CONCURRENTLY`, no `NOT NULL` without a default on existing tables, no type rewrites). Expand/contract check: nightly, the previous release's API E2E smoke runs against the new schema. |
| Constraints | Every enum column has a CHECK (v1 lacked most, per the db-schema slice). FKs are enforced (v1 used soft references). Partial unique "one live row" indexes: approval challenge, onboarding submission, nomination opt-out (`V61__add_transaction_approval_challenges.sql:47-50`). |
| Precision | `numeric(18,2)` amounts, `numeric(18,4)` units, `numeric(20,6)` NAV round-trip exactly. `timestamptz` keeps microseconds. `uuidv7()` ordering. A test proves JS `Date` is never used for money or approval hashing (R-01). |
| Repositories | Investor-scoped queries always take `investorId`. A static test asserts every exported repository read method on an owned table has an `investorId` parameter, or is annotated `@adminScope`. |
| Transactions | Outbox row written atomically with the state change. Rollback leaves no outbox row. OTP wrong-attempt counter survives the caller's rollback (port `OtpServiceLockoutPropagationTest.java:83-142`). A rejected approval gate does not poison the caller's transaction (port `TransactionApprovalGateRollbackTest.java:164-205`). |
| Concurrency | R-07 (identity-check dedup). R-08 (two redemptions, one accepted, via `SELECT … FOR UPDATE` on the holding row). The job queue claims with `FOR UPDATE SKIP LOCKED`, with no double-processing across 5 workers. |
| Idempotency | `Idempotency-Key` table. Same key and body returns the same response with one side effect. Same key with a different body returns 422. 20 parallel requests with the same key produce exactly 1 order row and 1 FP call. Keys expire after 24 h (clock-advanced). |
| PII at rest | If column encryption is adopted (synthesis §12 #9), a raw `SELECT` of PAN, bank account and DOB columns never matches a cleartext regex. |

---

## 7. FP adapter: fake, contract suite, recordings

### 7.1 `FakeFpClient` behaviour spec

It is ported from v1 `MockCybrillaClient` and extended from stateless to stateful.

| Area | v1 behaviour kept | v2 addition |
|---|---|---|
| KYC compliance simulator | PAN containing `3753` → unavailable / create; `3754` → onhold / modify; `3759` → incomplete / modify; `3752` → compliant with `investment_limit` ₹50,000; otherwise compliant (`MockCybrillaClient.java:232-275`) | Same patterns as the FP sandbox, so the same PANs work in both targets. |
| Bank verification | Account ending `1515` → `failed` / `bank_verification_failed` (`:308-327`) | Penny-drop name-mismatch scenario, via account ending `1616` (new). |
| Pre-verification | Returns `completed`, all verified (`:165-180`) | – |
| DigiLocker / eSign | `identity_document` pending → successful; `esign` pending → successful (`:386-437`) | Redirect URLs point at the in-process **fake provider page** `/__fake__/digilocker` or `/__fake__/esign`, with Approve and Deny buttons, so the web and Maestro flows can click through. |
| mf_purchase | stateless `successful` (`:647-654`) | State machine `pending → confirmed → submitted → successful \| failed`, plus `cancelled`. `successful` sets `allotted_units`, `purchased_price` and `folio_number`, which are the attributes FP documents for a successful order ([FP one-time purchase docs](https://docs.fintechprimitives.com/mf-transactions/onetime-purchases), accessed 2026-09-25). |
| Payment | UPI URI `upi://pay?…` (`:686-700`), netbanking `token_url` (`:672-683`) | `PENDING → SUCCESS \| FAILED`. The fake payment page offers both outcomes. A postback triggers the webhook. |
| Mandate (eNACH / UPI Autopay) | `CREATED` → fetch `APPROVED` (`:742-763`) | `CREATED → SUBMITTED → APPROVED \| REJECTED \| CANCELLED`. The UPI Autopay limit is ₹1 lakh per transaction (synthesis §10). |
| Purchase plan (SIP) | `review_completed`, `active`, one pending instalment (`:773-802`), cancel (`:861-868`) | `created → active ⇄ paused → cancelled \| completed`. `fake.runInstalments(until)` generates instalment `mf_purchase` objects on schedule. Modify and top-up are supported. |
| Redemption | `confirmed`, `submitted`, `successful` (`:819-853`) | `pending → confirmed → submitted → successful \| failed`. The fake **refuses** units above the fake folio balance. |
| Switch / STP / SWP | **absent in v1** (be-integrations slice) | `mf_switches`, switch plans (STP), redemption plans (SWP): modelled from sandbox recordings. The contract suite pins the shapes. |
| Webhooks | – | Every transition emits an event `<object>.<action>`, signed `FP-Signature: <id>:<base64 HMAC-SHA256>` with the tenant secret ([FP webhook implementation](https://docs.fintechprimitives.com/upcoming/beta/webhook-implementation/), accessed 2026-09-25). Modes: `inline`, `delayed(ms)`, `duplicate(n)`, `shuffle` (FP does not guarantee order and may duplicate, per the same page). |
| Control API | – | In-process `fake.scenario.nextPurchase('failed')`, `fake.advance(id, state)`, `fake.calls` (the call log used by R-02). In the E2E test image it is exposed at `POST /__test__/fp/advance`. |
| Id prefixes | `kyc_…`, `cyb-order-…`, `mfpp_mock_…` | Real FP prefixes (`mfp_`, `mfr_`, `mfpp_`, …) as observed in recordings. |

### 7.2 One suite, two targets

```ts
// packages/fp-client/contract/fp-contract.suite.ts
export function fpContract(makeClient: () => Promise<FpClient>, target: 'fake' | 'sandbox') {
  describe(`FP contract [${target}]`, () => {
    it('kyc_check: PAN pattern 3753 → unavailable/create', async () => { … schemas.KycCheck.parse(res) … });
    it('mf_purchase: create → consent → confirm → submitted', …);
    it('mf_purchase: sandbox simulate successful → allotted_units > 0, folio present', …);
    it('purchase_plan: create → active → cancel(invest_later) → cancelled', …);
    it('mandate: create(eNACH) → authorize returns token_url', …);
    it('redemption: units > folio balance → 4xx with error code', …);
    it('webhook signature: HMAC-SHA256 of payload matches FP-Signature', …); // sandbox: receives a real event via tunnel-less poll of stored events
    // ~60 operations covering every FpClient port method
  });
}
```

| Aspect | PR CI | Nightly (21:00 UTC = 02:30 IST) |
|---|---|---|
| Target | `FakeFpClient` | Cybrilla FP **sandbox** (GitHub Environment `fp-sandbox`, secrets there only) |
| Response validation | zod strict schemas | Same schemas plus **unknown-key report** (`.passthrough()`), so new FP fields go into the job summary |
| Recording | – | Responses saved, with PAN, names, account numbers and emails redacted by `testkit/pii-scanner`. A weekly bot PR updates `contract/recordings/**`, which needs human approval. |
| Recording-parse test | Every committed recording is parsed through the current schemas in PR CI, which catches adapter changes that break real shapes | – |
| On failure | blocks merge | Opens or updates a GitHub issue labelled `fp-contract`. **Release gate:** the last 3 nightly runs must be green before a production deploy. |
| Sandbox hygiene | – | Dedicated test investor profiles created per run with the PAN simulator patterns. The run sleeps between writes to respect rate limits. It uses the sandbox `simulate` endpoints for order and payment outcomes. |

The production switch-over (synthesis §12 #2) adds a manual, one-off **UAT contract run** against production credentials in read-only mode (catalogue, profile fetch). It records the same suite subset that has no side effects.

---

## 8. Webhook replay tests (`apps/api/test/webhooks`)

Fixtures are FP payloads captured from sandbox recordings and stored as `fixtures/webhooks/fp/<object>.<event>.json`. The signature is computed by the test helper with the test secret.

| ID | Test | Expected |
|---|---|---|
| WH-01 | Valid signature, `mf_purchase.successful` | 2xx within 200 ms (store first, process asynchronously). The order reaches `successful` with allotted units; the holding appears. |
| WH-02 | Missing or invalid signature, or wrong key id | 401. Nothing stored. **No "allow unsigned local" switch exists** (v1 had `allowUnsignedLocal`, `CybrillaWebhookControllerTest.java:54-62`). |
| WH-03 | Body mutated after signing (one byte) | 401 |
| WH-04 | Same event delivered 5 times | Processed exactly once. The `webhook_events` unique key is (event id, or SHA-256 of the raw body when absent). |
| WH-05 | Replay after app restart (new Nest instance, same DB) | Still deduped (R-09) |
| WH-06 | Out of order: `successful` before `submitted` | Final state `successful`. No regression. State transitions are monotonic by a rank table. |
| WH-07 | Event for an unknown object id | 2xx, stored as `ignored_no_match` (v1 behaviour, `CybrillaWebhookControllerTest.java:165-193`) |
| WH-08 | Routing: `pre_verification.completed` goes to the bank handler first and falls back to KYC | Port `:64-130` |
| WH-09 | Poison payload (schema-invalid) | 2xx, stored as `failed_processing`. The retry worker tries 5 times with backoff, then raises an ops alert. |
| WH-10 | Property (fast-check): random permutations and duplicates of a lifecycle event sequence | Always the same terminal state and the same holdings as in-order delivery |
| WH-11 | Webhook versus poller race | Reconciliation poller and webhook processed concurrently leave one state transition and one notification |
| WH-12 | Payment postback without an approved order | Does not advance the order (port of v1 `approval-bypass.spec.ts:72` F-05) |

---

## 9. API E2E and security

### 9.1 Harness (same bootstrap as production)

```ts
// apps/api/test/setup/app.ts
export async function startApp(opts: { clock?: TestClock } = {}) {
  const db = await useFreshDb();
  const fp = new FakeFpClient({ webhookMode: 'inline', secret: TEST_FP_SECRET });
  const otp = new CapturingOtpSender();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DB).useValue(db)
    .overrideProvider(FP_CLIENT).useValue(fp)
    .overrideProvider(OTP_SENDER).useValue(otp)
    .overrideProvider(CLOCK).useValue(opts.clock ?? TestClock.at('2026-09-25T10:00:00+05:30'))
    .compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);            // the SAME function main.ts calls: pipes, guards, filters, helmet, CORS, cookies
  await app.init();
  fp.attachWebhookTarget(app.getHttpServer(), '/v1/webhooks/fp');
  return { app, http: request(app.getHttpServer()), db, fp, otp, factories: bindFactories(db) };
}
```

Journey suites (`test/e2e/*`): sign-up and OTP; KYC (KRA-compliant, CKYC, DigiLocker, eSign, bank penny drop, FATCA, nominee and opt-out, T&C acceptance with document hash); lumpsum UPI and netbanking; SIP with UPI Autopay and eNACH; SIP pause, modify, top-up and cancel; redemption by amount, units and all; switch; STP; SWP; dashboard; statements (capital gains, transactions, ELSS); CAS import (shown separately, never mixed into platform XIRR); admin ops (scheme curation, order lookup, audit trail). Every order-type journey asserts R-02 and R-03, plus the ARN/EUIN payload fields.

Assumption for the payload check: execution-only orders carry the platform ARN and an empty EUIN with the execution-only flag, and advised orders are out of scope. The test asserts the exact FP payload fields captured by the fake.

### 9.2 Generated BOLA and RBAC suite

Every controller method must carry `@Authz(...)`, which also writes the OpenAPI extension `x-authz`:

| `x-authz.kind` | Meaning | Generated cases |
|---|---|---|
| `public` | catalogue, fund detail, health | Reachable anonymously. Not reachable with a tampered cookie (the tampered cookie is ignored, not a 500). |
| `webhook` | FP webhooks | Covered in §8 |
| `self` | `/me/*` | Anonymous → 401. Expired token → 401. `alg:none` or foreign-key JWT → 401. Refresh-token reuse → the whole session family is revoked. |
| `owned:<resource>:<param>` | e.g. `GET /orders/:orderId` | Anonymous → 401. **Investor B with A's id → 404** (not 403, which avoids enumeration). A → not 404. Admin investor-impersonation is never implied. |
| `owned-collection:<resource>` | list endpoints | B's response contains **none** of A's ids, including through filter or query params (`?investorId=A`) |
| `admin:<permission>` | ops endpoints | Investor → 403. Admin without the permission → 403. Admin with it → 2xx. Every call writes an audit row. |

```ts
// apps/api/test/security/bola.gen.e2e.test.ts (sketch)
const { app, http, factories } = await startApp();
const doc = SwaggerModule.createDocument(app, openApiConfig);
const ops = listOperations(doc);                        // [{method, path, authz, requestSchema}]
it('every operation declares x-authz', () => expect(ops.filter(o => !o.authz)).toEqual([]));
it('every owned resource has a factory', () =>
  expect(ops.filter(o => o.authz.kind.startsWith('owned') && !resourceFactories[o.authz.resource])).toEqual([]));
const A = await factories.scenario('investor-with-everything');   // one of each resource
const B = await factories.scenario('investor-with-everything');
describe.each(ops.filter(o => o.authz.kind === 'owned'))('$method $path', (op) => {
  it('B cannot touch A', async () => {
    const url = fillPath(op.path, A.ids[op.authz.resource]);
    const body = minimalValidBody(op.requestSchema);             // from zod-derived schema / x-example
    const res = await http[op.method](url).set(authHeaders(B)).send(body);
    expect(res.status).toBe(404);
    expect(await sideEffectsSince(res)).toEqual([]);             // no rows written, no FP call
  });
});
```

The RBAC matrix (`test/security/rbac.matrix.yaml`, CODEOWNERS) lists roles × permissions. The generated test compares it with `x-authz` and fails on any undeclared permission.

### 9.3 OTP abuse suite

Values from v1: 6 digits, 5 min expiry, 5 attempts, 30 s resend cooldown, SHA-256 storage (`application.yml:226-229`, `OtpService.java:155-163,272-280`). Assumptions: a cap of 5 sends per identifier per hour and 10 per day, and 30 per IP per hour.

| ID | Test | Expected |
|---|---|---|
| OTP-01 | Verify at 4:59 and at 5:01 (clock-advanced) | valid / expired |
| OTP-02 | 5 wrong attempts, then the correct code | code burned; lockout reported; counter survives the caller's rollback |
| OTP-03 | Resend within 30 s | 429 with `Retry-After` |
| OTP-04 | 6th send in an hour for one identifier; 31st per IP | 429 |
| OTP-05 | Enumeration: request an OTP for a registered and an unregistered email or mobile | Identical status and body; p95 timing difference < 50 ms over 50 samples |
| OTP-06 | Login OTP used for a transaction approval; challenge A's OTP used on B (v1 SEC-6) | 401; the challenge stays unapproved |
| OTP-07 | Replay a consumed code | 401 |
| OTP-08 | 10 parallel verifies with the correct code | exactly 1 success |
| OTP-09 | New code issued | previous code invalid |
| OTP-10 | Every `OtpPurpose` value with `000000` and with a wrong code | 401 (R-04). The table is generated from the enum. |
| OTP-11 | OTP table contents | only hashes; no 6-digit plaintext column values |
| OTP-12 | Code never appears in an API response, log line or error | PII/log scanner (R-05); ports v1 NEG-4 (`approval-negatives.spec.ts:142`) |
| OTP-13 | Mobile outside `^[6-9]\d{9}$`, or non-+91 | 400 before any SMS provider call (toll-fraud guard) |
| OTP-14 | Approve without `consentAccepted` | 400 before the code is checked (port NEG-1 `:159`) |
| OTP-15 | Test sink in a production build | The boot guard refuses to start if `SANCHAY_TEST_HOOKS=1` with `NODE_ENV=production`. A CI job builds the prod image and asserts `/__test__/*` returns 404. |

Other security suites: mass assignment (R-06); CSRF (cookie auth: state-changing requests without the CSRF token → 403, `SameSite=Lax`); security headers snapshot; upload hardening for CAS PDFs (magic bytes, 5 MB cap per v1 `InvestorDocumentService`, encrypted PDF with a wrong password → 422, decompression-bomb guard); Schemathesis nightly against the OpenAPI spec (no 5xx, schema conformance); ZAP baseline nightly against staging.

---

## 10. Web E2E (Playwright)

```ts
// apps/web/playwright.config.ts
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  workers: process.env.CI ? 4 : undefined,
  retries: process.env.CI ? 1 : 0,               // a retry that passes is reported as flaky
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  expect: { timeout: 7_000 },
  reporter: [['list'], ['html', { open: 'never' }], ['junit', { outputFile: 'results/junit.xml' }]],
  use: {
    baseURL: process.env.WEB_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'retain-on-failure',
    reducedMotion: 'reduce', locale: 'en-IN', timezoneId: 'Asia/Kolkata',
    testIdAttribute: 'data-testid',
  },
  projects: [
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },           // primary: mass-market mobile web
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 14'] }, grep: /@smoke/ },  // nightly only
  ],
});
```

```ts
// apps/web/e2e/fixtures.ts
export const test = base.extend<{ investor: Investor; otp: OtpInbox }>({
  investor: async ({ request }, use) => {
    const res = await request.post(`${API}/__test__/scenarios/onboarded-investor`, { data: { runId: RUN_ID } });
    await use(await res.json());                  // unique investor per test: parallel-safe
  },
  otp: async ({ request }, use) => use(new OtpInbox(request)),   // reads the capture sink
});
export async function expectNoA11yViolations(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(r.violations.filter(v => ['serious', 'critical'].includes(v.impact!))).toEqual([]);
}
```

Critical journeys (`@smoke` runs on every PR; the rest on main and nightly):

| # | Journey | Tag |
|---|---|---|
| W1 | Sign-up with mobile OTP → email verify → KYC (KRA-compliant PAN) → bank penny drop → FATCA → nominee → T&C → dashboard | @smoke @compliance |
| W2 | KYC non-compliant PAN (`3753`) → DigiLocker (fake page) → eSign → submitted | @compliance |
| W3 | Catalogue by SEBI category → fund detail (riskometer, expense ratio, exit load shown with source date) | @smoke |
| W4 | Lumpsum → 2FA OTP → UPI (fake) success → order timeline → holding appears | @smoke @compliance |
| W5 | Lumpsum payment failure → retry → cancel | |
| W6 | SIP + UPI Autopay mandate → first instalment → active SIP count 1 | @smoke |
| W7 | SIP pause, modify, top-up, cancel | |
| W8 | Redemption by amount, by units, all; the ceiling message; the disclosure shows folio, units and value (v1 compliance FAIL item) | @smoke @compliance |
| W9 | ELSS redemption before lock-in refused, showing free units | @compliance |
| W10 | After-cut-off order shows the next business-day NAV | @compliance |
| W11 | Switch, STP, SWP creation and cancellation | |
| W12 | Dashboard numbers equal the golden scenario `portfolio-golden-1` (invested, current, gains, XIRR, allocation) | @smoke |
| W13 | Capital gains statement (FY) and transaction statement download; ELSS summary | |
| W14 | CAS import → external holdings shown separately and excluded from platform totals | |
| W15 | Session expiry → silent refresh → logout everywhere | @smoke |
| W16 | Ops admin: curate fund facts, find an order, view the audit trail; an investor cannot reach `/ops` | @smoke |

Every journey calls `expectNoA11yViolations` after each major step.

---

## 11. Native E2E (Maestro, Android emulator in CI)

`apps/native/.maestro/config.yaml`:

```yaml
flows: ["flows/*"]
includeTags: []          # CI passes --include-tags=smoke on PRs
executionOrder: { continueOnFailure: false }
```

`flows/lumpsum-upi.yaml` (example):

```yaml
appId: in.sanchay.app
tags: [smoke, compliance]
env: { API: http://10.0.2.2:4000 }
---
- runScript: { file: ../scripts/seed.js, env: { SCENARIO: onboarded-investor } }   # http.post to /__test__/scenarios
- launchApp: { clearState: true }
- runFlow: ../subflows/login-otp.yaml          # reads OTP via runScript http.get(${API}/__test__/otp?to=${output.mobile})
- tapOn: { id: "tab-explore" }
- tapOn: { id: "category-large-cap" }
- tapOn: { id: "fund-card-0" }
- tapOn: { id: "cta-invest-lumpsum" }
- inputText: "5000"
- tapOn: { id: "cta-continue" }
- runFlow: ../subflows/approve-otp.yaml
- tapOn: { id: "pay-upi" }
- tapOn: { text: "Approve payment" }            # fake payment page in WebView
- extendedWaitUntil: { visible: { id: "order-status-successful" }, timeout: 20000 }
- assertVisible: { id: "holding-row-0" }
```

| # | Flow | Tag |
|---|---|---|
| N1 | OTP sign-up → KYC happy path → dashboard | smoke |
| N2 | Lumpsum UPI success | smoke |
| N3 | SIP + UPI Autopay mandate | smoke |
| N4 | Partial redemption by amount | smoke |
| N5 | Dashboard values equal `portfolio-golden-1` | smoke |
| N6 | Session expiry, relaunch, biometric/app lock (if enabled), logout | smoke |
| N7-N15 | SIP pause/modify/cancel, switch, STP, SWP, statements share sheet, CAS import picker, ELSS lock-in refusal, font scale 1.3 run of N2, offline banner and retry | full |

The CI emulator: API 34 `google_apis` x86_64, 2 cores, 3 GB RAM, `-no-snapshot-save -no-window -gpu swiftshader_indirect`, animations disabled via adb. It reaches the host API at `10.0.2.2`.

The app under test is a **release APK** built with `EXPO_PUBLIC_E2E=1` and `EXPO_PUBLIC_API_URL=http://10.0.2.2:4000`. The build is cached by `@expo/fingerprint` hash plus the Gradle cache. Phase-2 optimisation: on JS-only changes, inject the new `index.android.bundle` into the cached APK and re-sign it with the debug keystore, the pattern used by [rnw-community/mobile-ci](https://github.com/rnw-community/mobile-ci) (accessed 2026-09-25).

A nightly run also covers API 29 (low-end Android 10 devices common in India). iOS runs the Maestro smoke weekly and pre-release on a macOS runner.

---

## 12. Accessibility

| Layer | Check | Gate |
|---|---|---|
| Web lint | eslint-plugin-jsx-a11y `strict` | PR, error |
| Web components | vitest-axe on every `packages/ui-web` component story or state | PR |
| Web journeys | `@axe-core/playwright`, WCAG 2.2 AA tags, zero serious or critical violations | PR (smoke), nightly (all) |
| Web Lighthouse | a11y category ≥ 95 on the catalogue, fund detail, dashboard and order pages | PR (LHCI) |
| Tokens | Unit test: every foreground/background token pair used by components meets contrast ≥ 4.5:1 (text) and ≥ 3:1 (UI and large text). Fixes the v1 390 px overflow class of bug with a Playwright 360×640 no-horizontal-scroll assertion on every smoke page. | PR |
| Native lint | eslint-plugin-react-native-a11y `configs.flat.all` | PR, error |
| Native components | RNTL queries **only** via `getByRole` / `getByLabelText`, lint-enforced with `testing-library/prefer-screen-queries` plus a custom rule banning `getByTestId` in component tests. Touch targets of at least 48 dp asserted in the `ui-native` Button, Tab and ListItem tests. | PR |
| Native E2E | Font scale 1.3 run of N2 nightly. Maestro selectors use accessibility ids. | Nightly |
| Manual | TalkBack pass of N1-N5 and VoiceOver on iOS, recorded in the release checklist | Release |

---

## 13. Performance budgets

### 13.1 Web (Next.js 16)

| Metric | Budget | How measured | Gate |
|---|---|---|---|
| LCP | ≤ 2.5 s p75 field; ≤ 2.0 s lab on catalogue and fund detail | `web-vitals` RUM → API `/rum` → CloudWatch ap-south-1; LHCI mobile preset (slow 4G, 4× CPU) | Lab: PR. Field: weekly review, alert when over budget for 7 days. |
| INP | ≤ 200 ms p75 | RUM | alert |
| CLS | ≤ 0.1 p75 | RUM + LHCI | PR |
| TTFB | ≤ 800 ms p75 (ISR catalogue ≤ 300 ms) | RUM | alert |
| First-load JS per route (gzip) | catalogue and fund detail ≤ 130 KB; dashboard and order flows ≤ 170 KB; ops ≤ 250 KB | `e2e/perf/route-js-budget.spec.ts` sums the transferred JS per route from Playwright network events (bundler-agnostic, works with Turbopack) against `budgets.json` | PR. A growth above 5% needs the `budget-approved` label. |
| Lighthouse performance score | ≥ 90 on public pages, ≥ 80 on authenticated pages | LHCI `lighthouserc.json` assertions | PR |

```json
// apps/web/lighthouserc.json
{ "ci": { "collect": { "url": ["http://localhost:3000/funds", "http://localhost:3000/funds/sample-large-cap",
    "http://localhost:3000/dashboard?e2e-session=golden"], "numberOfRuns": 3, "settings": { "preset": "perf" } },
  "assert": { "assertions": {
    "categories:performance": ["error", { "minScore": 0.8 }],
    "categories:accessibility": ["error", { "minScore": 0.95 }],
    "largest-contentful-paint": ["error", { "maxNumericValue": 2500 }],
    "cumulative-layout-shift": ["error", { "maxNumericValue": 0.1 }],
    "total-blocking-time": ["error", { "maxNumericValue": 300 }] } } } }
```

### 13.2 Native (low-end Android)

The reference device is a **Samsung Galaxy A05** (Helio G85, 4 GB RAM), bought for the team. This is an assumption: it stands for the mass-market ₹7-10k tier.

| Metric | Budget | How measured | Gate |
|---|---|---|---|
| Cold start to first frame (`am start -W` TotalTime) | ≤ 1,200 ms median of 10 runs | `perf/measure-cold-start.sh` on the reference device | Release |
| Cold start to interactive dashboard (cached data) | ≤ 2,500 ms p50, ≤ 3,500 ms p90 | Maestro flow + logcat marker `SANCHAY_TTI` emitted on first dashboard commit | Release. Nightly emulator trend: fail if > 15% over the 7-day median (relative only). |
| Hermes bytecode bundle (`index.android.bundle`) | ≤ 4.5 MB; PR growth ≤ 5% | `expo export --platform android` + `perf/bundle-size.mjs` | PR (path-filtered) |
| Download size (arm64-v8a split from the AAB) | ≤ 30 MB | `bundletool get-size total` | main |
| Memory (PSS after dashboard → fund list → fund detail → back) | ≤ 250 MB | `dumpsys meminfo` on the reference device | Release |
| Fund list scroll | ≤ 5% slow frames; zero frozen frames (> 700 ms) | `dumpsys gfxinfo` framestats over a 30 s Maestro scroll | Release |
| Component render regressions | FundRow, HoldingsList, NavChart render time within +10% of the main baseline | Reassure (baseline artifact from main) | PR (path-filtered), non-blocking for week 1, then blocking |
| Field stability | user-perceived crash rate < 1.09%; ANR rate < 0.47% (Google Play bad-behaviour thresholds) | Play Console Android vitals | Weekly review |

### 13.3 API

| Metric | Budget | Tool |
|---|---|---|
| `GET /me/dashboard` | p95 ≤ 300 ms at 50 RPS, 10k investors × 15 holdings | k6 weekly on staging |
| `POST /orders/*` (excluding FP latency, using FakeFp) | p95 ≤ 400 ms | k6 |
| Catalogue list (ISR origin) | p95 ≤ 150 ms | k6 |
| N+1 guard | An integration test asserts the dashboard issues ≤ 6 SQL statements (query counter), regardless of holdings count (v1 PERF-1 was an N+1) | PR |

---

## 14. Test data builders (`packages/testkit`)

| Component | Spec |
|---|---|
| `defineFactory<T>()` | Small in-house builder (~60 LOC, no dependency). `build(overrides)` returns a pure object; `create(db, overrides)` inserts via Drizzle; traits (`.kycCompliant()`, `.minor()`, `.withBank({ failVerification: true })`). |
| Determinism | `@faker-js/faker` seeded from `hash(testName)`. Ids are `uuidv7` from a seeded generator. A failing test prints its seed. |
| Indian generators | `pan({ fpSimulator?: '3753' \| '3754' \| '3759' \| '3752' })` (4th char `P`, valid format); `mobile()` matching `[6-9]\d{9}`; `ifsc()` matching `^[A-Z]{4}0[A-Z0-9]{6}$`; `accountNumber({ fpOutcome?: 'fail' })` ending `1515`; `isin()` `INF…`; AMFI scheme codes; pincodes `400001` and `400002` (Mumbai in v1 mock, `MockCybrillaClient.java:626-635`). |
| Scenario builders | `onboarded-investor`, `kyc-pending`, `investor-with-everything` (one of each owned resource, for BOLA), `portfolio-golden-1` (the holdings behind W12/N5, with vector-backed expected numbers), `elss-locked`, `sip-active-paused-mix`, `admin(perms[])`. The same builders back the `/__test__/scenarios/:name` endpoint for Playwright and Maestro. |
| Clock | `TestClock.at(isoWithOffset)`, `.advance('5m')`, `.toNextBusinessDay()` |
| AMFI fixtures | Port the `StubNavFeedClient` bodies (both column layouts, blank lines, AMC headers, `N.A.`/`-` rows) and the `AmfiNavParserTest.java:42-509` cases (29 tests) as fixtures in `packages/fund-data`. |
| PII scanner | `scanForPii(text)` with PAN, mobile, email, account-number (9-18 digits next to `acc`), Aadhaar (12 digits, Verhoeff check) and OTP patterns. Used by R-05 and the recording redactor. |
| Policy | No real investor data anywhere in the repository. CAS PDF fixtures are synthetic. Real-layout PDFs are stored encrypted in a private S3 bucket (ap-south-1) and fetched only by the nightly job. |

---

## 15. CI gates, job matrix and durations

### 15.1 Job matrix (GitHub Actions, `ubuntu-24.04` 4-vCPU runners, GitHub merge queue on `main`)

| Job | Trigger | Needs | Content | Timeout | Target p90 | Required for merge |
|---|---|---|---|---|---|---|
| `setup` | PR, merge queue | – | pnpm install (store cache), turbo cache restore, `turbo run … --affected` | 5 m | 1.5 m | yes |
| `static` | PR | setup | ESLint (jsx-a11y, rn-a11y, vitest/no-focused-tests, boundaries), `tsc -b`, prettier, gitleaks, Semgrep CE, osv-scanner, CODEOWNERS golden guard | 10 m | 3 m | yes |
| `unit` | PR | setup | `vitest --project '*:unit'` + coverage thresholds; jest-expo for native | 10 m | 3 m | yes |
| `db` | PR (packages/db or api changed) | setup | migrate from empty, drizzle drift check, Squawk | 8 m | 2 m | yes |
| `integration` (2 shards) | PR | setup | `api:integration` with Testcontainers | 15 m | 6 m | yes |
| `api-e2e` (2 shards) | PR | setup | `api:e2e`: journeys, generated BOLA/RBAC, OTP abuse, webhook replay, PII scan, FakeFp contract, recording-parse | 15 m | 6 m | yes |
| `prod-image-guard` | PR (api changed) | setup | build prod Docker image; boot with prod config; assert test hooks absent (OTP-15) | 10 m | 4 m | yes |
| `web-e2e-smoke` (2 shards) | PR | setup | compose.test (pg18 + api test image + `next build && next start`), Playwright `@smoke`, mobile-chrome + desktop-chrome, axe | 20 m | 8 m | yes |
| `web-perf` | PR (web or ui-web changed) | web-e2e-smoke build artifact | LHCI + route-JS budget | 12 m | 5 m | yes |
| `native-static` | PR (native or ui-native changed) | setup | expo-doctor, Hermes bundle budget, Reassure (compared with the main baseline) | 12 m | 5 m | yes |
| `native-e2e-smoke` | PR, path-filtered: `apps/native/**`, `packages/{ui-native,validation,money,portfolio-math,api-contract}/**` | setup | fingerprint-cached release APK, emulator API 34, Maestro `--include-tags=smoke` | 40 m | 22 m | yes (when triggered) |
| `main-full` | push to main | – | full Playwright (all projects), full Maestro, AAB size, Reassure baseline upload, staging deploy + post-deploy smoke (Playwright `@smoke` against staging using the FP sandbox) | 60 m | 35 m | – (alerts; blocks release) |
| `nightly` | cron `0 21 * * *` (02:30 IST) | – | FP **sandbox contract** + recordings; AMFI live-feed parse and floors check; full Playwright incl. mobile-safari; Maestro on API 29 + font-scale run; Schemathesis; ZAP baseline on staging; expand/contract N-1 smoke; emulator cold-start trend | 90 m | 60 m | – (release gate) |
| `weekly` | cron Sunday | – | Stryker mutation (money, portfolio-math, domain-rules, tax); k6 load on staging; iOS Maestro smoke (macOS); recordings bot PR | 120 m | – | – |
| `release` | tag `v*` | – | Checks: last 3 nightly contract runs green, `main-full` green, compliance traceability report generated, manual checklist signed off (device perf §13.2, TalkBack, exploratory charter) | – | – | Production deploy gate |

The **PR critical path** is `setup → max(integration, api-e2e, web-e2e-smoke + web-perf)`, which gives about **13-15 min p90**. Native PRs add `native-e2e-smoke` in parallel, about 22 min.

### 15.2 `turbo.json` test tasks

```json
{
  "tasks": {
    "test:unit": { "dependsOn": ["^build"], "inputs": ["src/**", "test/golden/**", "vitest.config.ts"], "outputs": ["coverage/**"] },
    "test:int": { "dependsOn": ["^build"], "inputs": ["src/**", "test/**", "../../packages/db/migrations/**"], "cache": false },
    "test:e2e": { "dependsOn": ["^build"], "cache": false },
    "test:contract": { "cache": false, "env": ["FP_TARGET"] },
    "lint": { "inputs": ["src/**", "eslint.config.*"] },
    "typecheck": { "dependsOn": ["^build"] }
  }
}
```

### 15.3 `pr.yml` (abridged, concrete)

```yaml
name: pr
on: { pull_request: {}, merge_group: {} }
concurrency: { group: pr-${{ github.ref }}, cancel-in-progress: true }
env: { TZ: UTC, PG_IMAGE: "postgres:18-alpine@sha256:<pinned>", TURBO_SCM_BASE: "${{ github.event.pull_request.base.sha }}" }
jobs:
  setup:
    runs-on: ubuntu-24.04
    outputs: { native: ${{ steps.f.outputs.native }}, web: ${{ steps.f.outputs.web }} }
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - uses: dorny/paths-filter@v3
        id: f
        with:
          filters: |
            native: ['apps/native/**','packages/ui-native/**','packages/validation/**','packages/money/**','packages/portfolio-math/**','packages/api-contract/**']
            web: ['apps/web/**','packages/ui-web/**','packages/tokens/**']
  unit:
    needs: setup
    runs-on: ubuntu-24.04
    strategy: { matrix: { tz: [UTC, Asia/Kolkata] } }
    env: { TZ: ${{ matrix.tz }} }
    steps: [ … , { run: "pnpm turbo run test:unit --affected" } ]
  integration:
    needs: setup
    runs-on: ubuntu-24.04
    strategy: { matrix: { shard: [1, 2] } }
    steps: [ … , { run: "pnpm --filter @sanchay/api vitest run --project api:integration --shard=${{ matrix.shard }}/2" } ]
  api-e2e:
    needs: setup
    runs-on: ubuntu-24.04
    strategy: { matrix: { shard: [1, 2] } }
    steps:
      - run: pnpm --filter @sanchay/api vitest run --project api:e2e --shard=${{ matrix.shard }}/2
      - if: always()
        run: pnpm --filter @sanchay/testkit pii-scan ./apps/api/test-results/logs   # R-05
  web-e2e-smoke:
    needs: setup
    runs-on: ubuntu-24.04
    strategy: { matrix: { shard: [1, 2] } }
    steps:
      - run: docker compose -f compose.test.yml up -d --wait
      - run: pnpm --filter @sanchay/web exec playwright install --with-deps chromium
      - run: pnpm --filter @sanchay/web exec playwright test --grep @smoke --shard=${{ matrix.shard }}/2
      - if: failure()
        uses: actions/upload-artifact@v4
        with: { name: pw-report-${{ matrix.shard }}, path: apps/web/playwright-report }
  native-e2e-smoke:
    needs: setup
    if: needs.setup.outputs.native == 'true'
    runs-on: ubuntu-24.04
    steps:
      - run: echo 'KERNEL=="kvm", GROUP="kvm", MODE="0666"' | sudo tee /etc/udev/rules.d/99-kvm.rules && sudo udevadm control --reload-rules && sudo udevadm trigger --name-match=kvm
      - run: docker compose -f compose.test.yml up -d --wait api pg
      - run: pnpm --filter @sanchay/native e2e:build-apk        # fingerprint cache + gradle cache
      - run: curl -fsSL "https://get.maestro.mobile.dev" | bash
      - uses: reactivecircus/android-emulator-runner@v2
        with:
          api-level: 34
          arch: x86_64
          target: google_apis
          cores: 2
          ram-size: 3072M
          disable-animations: true
          emulator-options: -no-snapshot-save -no-window -gpu swiftshader_indirect -noaudio -no-boot-anim
          script: adb install -r apps/native/android/app/build/outputs/apk/release/app-release.apk && ~/.maestro/bin/maestro test apps/native/.maestro --include-tags=smoke --format junit --output maestro.xml
```

### 15.4 Flake and quarantine policy

| Rule | Detail |
|---|---|
| Retries | 0 for unit, integration and API E2E. 1 for Playwright. Maestro retries a flow once. Any pass-on-retry is annotated `flaky` in the job summary. |
| Quarantine | Tag `@quarantine(issue#, expires=YYYY-MM-DD, ≤14 days)`. Quarantined tests run in a non-blocking job. A lint check fails when the expiry has passed. At most 5 quarantined tests at a time. |
| Rate limits in tests | Rate-limit buckets are keyed with `runId` in test environments. Dedicated rate-limit tests use unique identifiers. This fixes the v1 shared-IP 429 flake. |
| Waiting | No `sleep`/`waitForTimeout`. Wait on events, network idle for a specific request, or `extendedWaitUntil` in Maestro. Lint-enforced (`playwright/no-wait-for-timeout`). |

### 15.5 Guardrails for AI agents (enforced by CI, documented in `AGENTS.md` / `CLAUDE.md`)

| Guardrail | Enforcement |
|---|---|
| Agents may not edit golden vectors, security suites, the RBAC matrix, budgets or recordings to make tests pass | CODEOWNERS requires both developers. A `golden-guard` job fails when a PR changes `**/golden/**` **and** non-test source together, unless it has the label `golden-change-approved`. |
| Bug fixes are test-first | A PR labelled `bug` must add a test that fails on the base commit. The `red-check` job runs the new tests against `base.sha` and expects at least one failure. |
| No `.only`, `.skip` or `test.fixme` without an issue link | ESLint `vitest/no-focused-tests`, `vitest/no-disabled-tests`, `playwright/no-skipped-test` (a comment with the issue link is allowed) |
| No snapshot mass-updates | `-u` is banned in CI. Snapshot files over 200 lines changed need the label `snapshot-reviewed`. |
| Coverage cannot decrease on the pure packages | Per-package thresholds (§2.2). Stryker weekly trend. |
| Compliance traceability | `packages/compliance-registry/requirements.yaml` maps each requirement id (e.g. `SEBI-2FA-PURCHASE`, `NOMINEE-MINOR-GUARDIAN`, `NAV-CUTOFF-OVERNIGHT-REDEMPTION-ONLINE`, `ELSS-LOCKIN`, `TNC-ACCEPTANCE`, `REDEMPTION-DISCLOSURE`, `NO-AUTO-DEFAULTS`) to its source and to tagged tests. CI fails if a MUST requirement has no tagged test. The release job publishes the matrix. This fixes the v1 scorecard of 0 PASS / 8 PARTIAL / 3 FAIL, where compliance was never test-mapped. |

---

## 16. Definition of Done (per story)

| # | Item | Evidence |
|---|---|---|
| 1 | Acceptance criteria are written as tests: at least one API E2E per endpoint behaviour, plus unit tests for every pure rule | PR diff |
| 2 | New endpoint declares `@Authz`; the generated BOLA/RBAC tests pass; ownership factory added | `api-e2e` green |
| 3 | Money, units, NAV and dates use `packages/money` / `Clock`; no `number` for money, no `new Date()` in domain code | lint (`no-restricted-syntax`) |
| 4 | Any financial or regulatory calculation has golden vectors with a cited source, reviewed by both developers | CODEOWNERS approval |
| 5 | Orders: R-02 (no FP write before 2FA consumed), idempotency key, webhook-driven state covered with duplicate and out-of-order cases | tests tagged `@req` |
| 6 | Migrations: forward-only, Squawk-clean, no drift, constraints and FKs present, expand/contract respected | `db` job |
| 7 | UI: web smoke or journey updated when the story touches a critical journey; axe clean; mobile viewport 360 px has no horizontal scroll | Playwright |
| 8 | Native: the Maestro flow is updated if the journey changed; RN a11y lint clean; bundle budget within limits | `native-*` jobs |
| 9 | Performance: route-JS and LHCI budgets pass, or the budget change is approved with a justification | `web-perf` |
| 10 | Security and privacy: no PII in logs (scanner green); new PII fields classified in `pii-registry.yaml` (encryption, retention, masking) | `api-e2e` PII scan |
| 11 | Compliance: the requirement id is linked in `requirements.yaml` if applicable; user-facing disclosures verified in E2E | traceability job |
| 12 | Observability: domain events and error codes documented; alerts added for new async jobs (webhook worker, SIP scheduler) | PR checklist |
| 13 | All required CI jobs green in the merge queue; no new quarantined test | GitHub |
| 14 | A human (not the authoring agent) reviewed the tests for meaningful assertions: no tautological mocks, and the assertions check outcomes, not implementation calls | PR review checkbox |

---

## 17. Rollout sequence

| Sprint | Quality deliverables |
|---|---|
| S0 | Monorepo CI skeleton (§15). testkit (factories, generators, clock, PII scanner). Testcontainers harness with the template DB. `configureApp` shared bootstrap. Golden vectors XIRR-*, RA-*, HV-*, CG-001..004 ported and failing (red) before implementation. AMFI fixtures ported. |
| S1 | `FakeFpClient` state machines + contract suite (fake target). Nightly sandbox job wired (KYC and catalogue ops first). OTP abuse suite. Generated BOLA scaffold with the `x-authz` meta-test. |
| S2 | Webhook replay suite. Idempotency + R-01/R-02/R-03 regression tests alongside the order module. Playwright harness + W1, W3. Maestro harness + N1 with emulator CI. |
| S3+ | Each feature epic follows the DoD. Performance budgets activated once the first real screens exist (LHCI from S3; Reassure baseline from S4). Reference device bought in S2. |
| Pre-launch | CA sign-off of tax rule sets. Primary-source check of the nominee cap and cut-off rules. 3 green nightly contract runs against the sandbox, plus the production read-only UAT run. Full release checklist. |

---

## 18. Assumptions

| # | Assumption | Consequence if wrong |
|---|---|---|
| A1 | The GitHub repository is private. CodeQL (GHAS) is not bought, so Semgrep CE covers SAST. | If GHAS is available, add CodeQL as a PR job. |
| A2 | The Ops back-office lives inside `apps/web` under `/ops`. | If it is a separate app, it gets its own Playwright project with the same fixtures. |
| A3 | Tax rules as in §5.5. | Only `rulesets/*.yaml` and the vectors change. The engine is parameterised. |
| A4 | The ELSS lock-in boundary and the stamp-duty rounding are as stated. | The nightly sandbox contract checks confirm them; the vectors are updated with a sign-off. |
| A5 | Active SIP count counts FP state `active` only. | One vector (SIP-001) changes. |
| A6 | The Galaxy A05-class device represents the low-end target. | Budgets are re-baselined on a different device. |
| A7 | FP webhook signature format as documented (`FP-Signature: id:base64(HMAC-SHA256)`). | The fake signer and the WH-02/03 fixtures change. The nightly contract run detects it. |

**Sources (web, accessed 2026-09-25):**
- [Vitest coverage guide](https://vitest.dev/guide/coverage)
- [Vitest 4 migration notes (QASkills)](https://qaskills.sh/blog/vitest-4-migration-guide-breaking-changes)
- [Testcontainers PostgreSQL module](https://testcontainers.com/modules/postgresql/)
- [Expo SDK 56 changelog](https://expo.dev/changelog/sdk-56)
- [Expo SDK 55 changelog](https://expo.dev/changelog/sdk-55)
- [Maestro](https://github.com/mobile-dev-inc/maestro)
- [rnw-community/mobile-ci](https://github.com/rnw-community/mobile-ci)
- [eslint-plugin-react-native-a11y (Volksverpetzer fork)](https://github.com/Volksverpetzer/eslint-plugin-react-native-a11y)
- [FP webhook implementation](https://docs.fintechprimitives.com/upcoming/beta/webhook-implementation/)
- [FP one-time purchases](https://docs.fintechprimitives.com/mf-transactions/onetime-purchases)

### Critical Files for Implementation
- C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/integration/MockCybrillaClient.java (behaviour spec for `FakeFpClient`)
- C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/service/RedemptionAvailability.java, with src/test/java/com/platizio/wealthtech/service/OrderServiceRedemptionCeilingTest.java (RA vectors)
- C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/test/java/com/platizio/wealthtech/service/{XirrCalculatorTest.java, HoldingsServiceTest.java, HoldingsServiceEstimatedUnitsTest.java, CapitalGainsReportServiceTest.java} (golden vectors)
- C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/test/java/com/platizio/wealthtech/controller/CybrillaWebhookControllerTest.java and service/{OtpServiceLockoutPropagationTest.java, TransactionApprovalGateRollbackTest.java} (webhook, OTP and 2FA regression patterns)
- C:/Users/pc/Desktop/WeathTech_v2/investor-frontend/tests/{api-authorization.spec.ts, approval-negatives.spec.ts, approval-bypass.spec.ts} (security-negative patterns to port into the generated suites)
