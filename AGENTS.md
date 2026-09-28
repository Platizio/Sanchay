# AGENTS.md: how to work in the Sanchay repo

Sanchay is an investor-led B2C mutual-fund app for India, built by Platizio (an AMFI-registered MFD/ARN holder). Phase 1 is a closed real-money pilot on web + Android.

## Read first (binding, in precedence order)

1. `docs/superpowers/specs/2026-09-25-sanchay-mvp-spec.md`: MVP scope, lean architecture, harmonized rulings H-1..H-18, pilot gate.
2. `docs/superpowers/specs/mvp-final-critic.md` and the doc-fix rulings recorded in `docs/delivery/rulings.md` (when present).
3. `docs/interface/plan-01-interface-sheet.md`: every name for Plan 01 (the delta sheet in its second half overrides the original sheet).
4. `docs/superpowers/specs/product/gap-rulings.md`, then the decision registers, then `2026-09-25-sanchay-target-design.md`, then the product specs.

## Non-negotiables

- **Money:** never use a JS `number` for money, units or NAV. Use `@sanchay/money` (decimal.js). Parse FP JSON with `lossless-json`.
- **Consent first:** no Cybrilla FP provisioning or money write happens before a CONSUMED consent challenge whose snapshot hash is recomputed from the DB.
- **Idempotency:** an `Idempotency-Key` is required on money, consent and onboarding mutations. Providers are called from worker jobs only, never inside a DB transaction. An ambiguous outcome sets `RECONCILING`.
- **OTP policy:** 6 digits, 5 min, 5 attempts, 30 s cooldown, HMAC at rest. There is no bypass in any build.
- **Logs:** redacted by allow-list. Never log request bodies or PII.
- **Tests:** TDD for every task (failing test first). Golden vectors ported from v1 stay green.
- **Brand:** npm scope `@sanchay/*`, env prefix `SANCHAY_`, hosts `app/api/www.sanchay.in`. "Platizio" appears only as the legal entity (see `check-brand`).

## Workflow

- Plans live in `docs/superpowers/plans/`. Execute them task by task (superpowers:subagent-driven-development).
- Every new backend module starts from `docs/specs/<module>.md`.
- Commands must work in PowerShell 5.1 and Git Bash. Use `pnpm --filter=@sanchay/<pkg>` (the `=` form).
- Conventional commits. Agent-authored commits add `-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.
- Never push. The owner authorises pushes explicitly.

## Reference only (read-only)

The v1 code is in `C:\Users\pc\Desktop\WeathTech_v2\investor` and `investor-frontend`. Port its logic and tests; never copy its distributor model.
