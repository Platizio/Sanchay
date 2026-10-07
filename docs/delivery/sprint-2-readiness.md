# Sprint 2 readiness (checked 2026-10-07)

Sprint 2 starts Mon 10-12 on `feat/plan-02-mvp-kernel`, with Plan 02 Task D0 first. **D0 is ready: it needs nothing from the owner.** Four of the items below block tasks later in week 1 or in week 2.

## D0's prerequisites, checked against `main` (`cae350e`)

| Check | Result |
|---|---|
| D0's five target files (`contact-email.service.ts`, `me-email.int.test.ts`, `logging.ts`, `logging.test.ts`, `AppShell.tsx`) | Unchanged since `a75ae03`, where D0 was verified test-first; nothing under `apps/` or `packages/` has changed since then. |
| Baseline suites (D0's "before" counts) | api unit 132/132, api integration 129/129 (Testcontainers on Docker 29.8.1), features 22/22. All match. |
| Toolchain | Node 24.21.0, pnpm 11.27.0; `pnpm install --frozen-lockfile` is clean; `pnpm lint` is clean. |
| D0's prerequisites | Plan 01 only (B4, B19/B20, C9), all on `main`. |

Not run: D0's own fix on `cae350e`. It ran on `a75ae03` (RV-02-66, RV-02-75), and the code it touches has not changed since.

## What the owner must provide or decide before Monday

| # | Item | Blocks | Needed by |
|---|---|---|---|
| 1 | **Allow Plan 02's new `catalog:` keys.** AGENTS.md says "Nobody edits `catalog:`", but Plan 02 adds new keys (it never changes an existing pin): `pg-boss` (D2), `undici` and `lossless-json` (D3), `tsx` (D4), `@aws-sdk/client-sesv2` (D6), and `aws-cdk-lib`, `aws-cdk` and `constructs` (E25). Each gets an ADR-0001 row. Recommendation: allow new keys only, as Plan 02's header says, and add one line to AGENTS.md. | D2 (order 2, Dev A) | Mon 10-12 |
| 2 | **The `undici` major.** Plan 02 says to pin the newest version that passes the 7-day release age, which today is 8.11.2. The plans' FP code (D3, D4, F29) was verified on 7.16.0. Recommendation: pin the newest 7.x (7.30.0 today) unless D3 re-verifies on 8.x. | D3 | Tue 10-13 |
| 3 | **AWS Organization (PB-45), `sanchay.in` and its Route 53 hosted zone (PB-40, PB-41), and MSG91 (PB-30)**: decisions page item C4. All were due Fri 10-09. | E25 (S2 week 2) | Fri 10-16 at the latest |
| 4 | **Interim `SANCHAY_SMS_RETRIEVER_HASH`** on GitHub's `prod` environment (decisions page item C8). | E25's first deploy | Mon 10-19 |
| 5 | **Docker Desktop running** on the development machine (Testcontainers and `docker compose`). | Every task's integration tests | Mon 10-12 |
| 6 | **The Fri 10-09 velocity checkpoint**: person-days worked, overhead, and the review and demo columns in `docs/delivery/velocity.md`, so that f1 and any T1-T6 trims are known before S2 is loaded (R-02). | S2 load | Fri 10-09 |
| 7 | **Authorise pushes** of `feat/plan-02-mvp-kernel` (AGENTS.md: the owner authorises every push). | CI on S2 work | Mon 10-12 |

## Housekeeping on the machine

- The main checkout (`C:\Users\pc\Desktop\sanchay`) is on `docs/plan-02-03-backlog` at `756ffac`, and its local `main` is behind `origin/main`. Create `feat/plan-02-mvp-kernel` from `origin/main` after this session's PR is merged.
- Plan 02's header asks whoever creates `feat/plan-02-mvp-kernel` to update AGENTS.md's branch line (it still reads `feat/plan-01-foundation`). D0's Files list does not include AGENTS.md, so do it in its own commit.
