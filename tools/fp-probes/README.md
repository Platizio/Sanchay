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
