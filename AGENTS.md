# AGENTS.md: rules for coding agents in the Sanchay monorepo

Sanchay is an investor-led B2C mutual-fund app for India. Phase 1 is a closed real-money pilot on web + Android.

## Read first (binding, in precedence order)
1. `docs/superpowers/specs/2026-09-25-sanchay-mvp-spec.md`: MVP scope, lean architecture, harmonized rulings H-1..H-18, pilot gate.
2. `docs/superpowers/specs/mvp-final-critic.md` and the doc-fix rulings recorded in `docs/delivery/rulings.md` (when present).
3. `docs/interface/plan-01-interface-sheet.md`: every name for Plan 01 (the delta sheet in its second half overrides the original sheet).
4. `docs/superpowers/specs/product/gap-rulings.md`, then the decision registers, then `2026-09-25-sanchay-target-design.md`, then the product specs.

## Scope
- Execute one plan task at a time, exactly as written. Touch only the files in its **Files** list.
- Work on branch `feat/plan-02-mvp-kernel`. Never push; the owner authorises every push.
- Never commit secrets, real PII or `.env` files. Never touch `.claude-flow/` or `.superpowers/`.

## Commands
- One command per line. Every command must work in PowerShell 5.1 and in Git Bash.
- No `&&` in instructions (it is allowed inside package.json scripts).
- Env vars get two variants: PowerShell `$env:X='v'; cmd` and Git Bash `X=v cmd`.
- Package filters always use the `--filter=@sanchay/<name>` form, never the space form.

## Task shape (TDD)
Files → Interfaces → Step 1 failing test → Step 2 see it fail → Step 3 minimal implementation →
Step 4 see it pass → Step 5 commit.

## Step 5 order
1. `pnpm exec biome check --write <paths>`
2. Re-run the Step 4 test and typecheck commands.
3. `pnpm lint`
4. `git add <explicit paths>` (never `git add .`)
5. `git commit -m "<conventional message>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`
- If lefthook re-stages files (`stage_fixed`), re-run the Step 4 commands.
- Never use `--no-verify`. For a gitleaks false positive on a fake fixture, add a narrow regex to
  `.gitleaks.toml` in the same commit. Never add a path wildcard.

## Shared files: edit, never replace
- Exactly one task creates each shared file: `pnpm-workspace.yaml`, `turbo.json`, root `package.json`,
  root `tsconfig.json`, `biome.json`, `.gitignore`, `.github/workflows/ci.yml`, `docs/adr/*`.
- Later tasks make key-level edits only and show only the fragment they add.
- `biome.json` is final after Task A2.
- ADR files: append table rows only.

## Dependencies (the A1 rule)
- Versions come only from `catalog:` in `pnpm-workspace.yaml`. Nobody changes an existing `catalog:` pin. A plan task may add a new key that its plan lists, with an ADR-0001 row (R-42). `undici` stays on 7.x (R-43).
- Expo modules: `npx expo install` inside `apps/mobile`.
- `ERR_PNPM_IGNORED_BUILDS`: add one `allowBuilds` entry (`true` only for a runtime binary) plus an ADR-0001 row.
- Release-age refusal: add one exact `'<name>@<version>'` to `minimumReleaseAgeExclude` plus an ADR-0001 row
  with `expires <publish date + 7 days>`. Never add a bare name or a pattern.
- A `trustPolicy` install error: stop and report it to the lead.
- There is no `.npmrc` in the repo.

## Naming
- Packages `@sanchay/*`. Env vars `SANCHAY_*` (exceptions: DATABASE_URL, PORT, HOST, NODE_ENV, APP_VARIANT).
- Cookies `__Host-sanchay_*`. Client header `x-sanchay-client: web|android`.
- The legal-entity name appears only in `packages/domain/src/legal-entity.ts` (R-19; re-exported by `@sanchay/app-core/copy`), legal documents,
  the DLT SMS sign-off and `docs/**`.

## Money
- Money, units and NAV use `@sanchay/money` and decimal strings, never JavaScript numbers.
