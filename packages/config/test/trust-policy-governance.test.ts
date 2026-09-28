import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Review finding (Task B1, batch B1-B4, round 1): AGENTS.md's A1 rule is explicit —
 * "A `trustPolicy` install error: stop and report it to the lead" — and Task B1's own
 * Files-list authorization only lets a later task edit `pnpm-workspace.yaml` on an
 * `ERR_PNPM_IGNORED_BUILDS` or a minimum-release-age refusal, never a trust downgrade.
 * Commit `ac73f0c` nonetheless added a `trustPolicyExclude` key to resolve a trust
 * downgrade for `chokidar@4.0.3` unilaterally, with no ratifying ruling ever recorded in
 * `docs/delivery/rulings.md`. This test locks the workspace file so that remedy can never
 * be reintroduced without a matching, explicit ruling, keeps `trustPolicy` at its hardened
 * setting, and proves the round-1 fix: the provenance-lapsed `chokidar@4.0.3` pulled in by
 * `@nestjs/cli@11.0.24` is resolved via a plain pnpm `overrides` entry pinning it to a
 * release that carries an npm provenance attestation, instead of excluding the trust check.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const workspacePath = resolve(repoRoot, 'pnpm-workspace.yaml');
const rulingsPath = resolve(repoRoot, 'docs/delivery/rulings.md');

describe('pnpm trust-policy governance', () => {
  const workspace = readFileSync(workspacePath, 'utf8');

  it('never adds a trustPolicyExclude key without a recorded lead ruling', () => {
    const hasExclude = /^trustPolicyExclude:/m.test(workspace);
    if (!hasExclude) {
      // Nothing excluded; nothing to govern (this is the expected state after the fix).
      return;
    }
    const rulings = existsSync(rulingsPath) ? readFileSync(rulingsPath, 'utf8') : '';
    expect(
      rulings.includes('trustPolicyExclude'),
      'pnpm-workspace.yaml declares trustPolicyExclude but docs/delivery/rulings.md has no ' +
        'matching ruling — AGENTS.md requires a trustPolicy install error to be escalated to ' +
        'the lead and ratified there (a dated, named rulings.md entry), never resolved by the ' +
        'implementer alone',
    ).toBe(true);
  });

  it('keeps trustPolicy at the hardened no-downgrade setting', () => {
    expect(workspace).toMatch(/^trustPolicy:\s*no-downgrade\s*$/m);
  });

  it('resolves the provenance-lapsed chokidar dependency via an override, not a trust exclusion', () => {
    // chokidar@4.0.2 and chokidar@4.0.3 lack npm provenance attestations (registry.npmjs.org
    // check, 2026-09-28); chokidar@4.0.0/4.0.1 carry one. @nestjs/cli@11.0.24 depends on
    // chokidar@4.0.3 exactly, which trips `trustPolicy: no-downgrade`. `overrides` is a
    // standard, documented pnpm setting (unrelated to trustPolicy) that pins the resolved
    // version instead of excluding the trust check.
    expect(workspace).not.toMatch(/^trustPolicyExclude:/m);
    const overridesMatch = workspace.match(/^overrides:\n((?:[ \t].+\n?)+)/m);
    expect(overridesMatch, 'expected an `overrides:` block pinning chokidar').not.toBeNull();
    const overridesBlock = overridesMatch?.[1] ?? '';
    expect(overridesBlock).toMatch(/^\s*chokidar:\s*['"]?4\.0\.[01]['"]?\s*$/m);
  });
});
