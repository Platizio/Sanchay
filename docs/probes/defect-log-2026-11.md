# Pilot-week defect log and fix budget (F26)

Window: Mon 2026-11-23 to Fri 2026-11-27 (Tue 11-24 is a holiday). Budget: Dev A 10 h, Dev B 6 h, at
factor 1.0 (outline pilot-week table). The budget absorbs defects found by the canary (F20), the security
checklist and ZAP (F21, F22), the gate pack (F23), the runbook drills (F24, F27) and G-E6 (F25). It is not
pre-planned work: no feature, refactor or "while I'm here" change is charged to it.

## Process

1. **Log first.** Anyone who finds a defect adds a row before starting work: next `D-nn`, opened date,
   severity, the gate item it puts at risk (`-` when none), a one-line summary with no PII, owner (`A` or `B`),
   estimate in hours (`1` or `1.5`), spent `0`, status `OPEN`.
2. **Severity.**
   - `CRITICAL`: money, units, consent or PII can be wrong or exposed (any M1/M3/M4 page, a wrong debit, a
     consent-first violation, a PII leak), or a GO-1 MUST item cannot pass. Turn orders off first
     ([kill switch runbook](../runbooks/kill-switch.md)). A CRITICAL defect can never be deferred.
   - `MAJOR`: a pilot journey is broken but no money or data is at risk, or a gate item's evidence is
     incomplete.
   - `MINOR`: cosmetic, copy, or a workaround exists and no gate item depends on it.
3. **Fix the TDD way.** Every fix starts with a failing regression test, then the fix, on a branch from
   `feat/plan-04-mvp-sip-portfolio`; commit `fix(<scope>): <what> (F26 D-nn)` with the Co-Authored-By
   trailer, following the AGENTS.md Step 5 order. A row moves to `FIXED` only with the short commit sha in
   "Fix" and the test name in "Test".
4. **Order.** CRITICAL first, then MAJOR rows tied to a gate item, then the rest. MINOR rows are fixed only when
   no CRITICAL or gate-tied MAJOR row is open.
5. **Hours.** Update "Spent h" at the end of each working session. `pnpm defects` prints the burn per developer.
6. **Stop rule.** When a developer's spent hours reach the budget, the PO decides the same day between:
   moving the remaining rows to `DEFERRED` (never a CRITICAL one), taking hours from the other developer's
   unspent budget, or moving GO-1 to Fri 12-04 (spec §7 NO-GO fallback). The decision is written under
   "Decisions" below.
7. **Gate check.** On Fri 11-27 before the GO/NO-GO meeting, `pnpm defects:gate` must exit 0: no open
   CRITICAL, no open MAJOR tied to a gate item, every FIXED row with a commit and a test, no deferred CRITICAL.
   Its output is pasted into the gate pack (F23, `docs/probes/gate-2026-11-27.md`).
8. **Ops tool gaps.** A runbook step that needs a developer-run change because no ops tool exists
   (account closure, assisted changes) is logged here as a `MAJOR` row with gate `-` and summary prefix
   "ops tool gap:", so the P2 backlog sees it.

## Defects

| ID | Opened | Severity | Gate | Summary | Owner | Est h | Spent h | Status | Fix | Test |
|---|---|---|---|---|---|---|---|---|---|---|

## Decisions

(none yet)
