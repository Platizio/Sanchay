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
 *
 * Owner ruling R-28 (2026-09-28) later approved exact-version exceptions, each with an
 * ADR-0001 row. The lock therefore checks every `trustPolicyExclude` entry rather than the
 * key's mere presence: each entry must be an exact `name@version`, be named verbatim in
 * `docs/delivery/rulings.md`, and have an ADR-0001 row. chokidar keeps its override.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const workspacePath = resolve(repoRoot, 'pnpm-workspace.yaml');
const rulingsPath = resolve(repoRoot, 'docs/delivery/rulings.md');
const adrPath = resolve(repoRoot, 'docs/adr/0001-versions.md');

/** An exact `name@version` or `@scope/name@version`: no range, no bare name, no pattern. */
const EXACT_ENTRY =
  /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*@\d+\.\d+\.\d+(?:-[0-9a-z.-]+)?$/;

/** The `trustPolicyExclude` entries, or `undefined` when the key is absent. */
function trustPolicyExcludeEntries(workspace: string): string[] | undefined {
  const lines = workspace.split(/\r?\n/);
  const start = lines.findIndex((line) => /^trust-?policy-?exclude\s*:/i.test(line));
  if (start === -1) {
    return undefined;
  }
  expect(
    lines[start],
    'trustPolicyExclude must be a YAML block list with one exact entry per line',
  ).toMatch(/^trustPolicyExclude:\s*$/);
  const entries: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const body = line.trim();
    if (body === '' || body.startsWith('#')) {
      continue;
    }
    if (/^\S/.test(line)) {
      break; // the next top-level key
    }
    const item = /^-\s*(['"]?)([^'"\s]+)\1$/.exec(body);
    expect(item, `unparseable trustPolicyExclude line: ${line}`).not.toBeNull();
    entries.push(item?.[2] ?? '');
  }
  return entries;
}

describe('pnpm trust-policy governance', () => {
  const workspace = readFileSync(workspacePath, 'utf8');

  it('admits a trustPolicyExclude entry only as an exact version ratified by name in rulings.md and ADR-0001', () => {
    const entries = trustPolicyExcludeEntries(workspace);
    if (entries === undefined) {
      // Nothing excluded; nothing to govern.
      return;
    }
    expect(entries.length, 'trustPolicyExclude is declared but lists no entries').toBeGreaterThan(
      0,
    );
    const rulings = existsSync(rulingsPath) ? readFileSync(rulingsPath, 'utf8') : '';
    const adrRows = readFileSync(adrPath, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line.startsWith('|') && line.includes('trustPolicyExclude'));
    for (const entry of entries) {
      expect(entry, `trustPolicyExclude entry "${entry}" is not an exact name@version`).toMatch(
        EXACT_ENTRY,
      );
      expect(
        rulings.includes(`\`${entry}\``),
        `pnpm-workspace.yaml excludes ${entry} from the trust policy but docs/delivery/rulings.md ` +
          'never names it — AGENTS.md requires a trustPolicy install error to be escalated to the ' +
          'lead and ratified there (a dated, named rulings.md entry), never resolved by the ' +
          'implementer alone',
      ).toBe(true);
      expect(
        adrRows.some((row) => row.includes(`'${entry}'`)),
        `docs/adr/0001-versions.md has no trustPolicyExclude row for ${entry}`,
      ).toBe(true);
    }
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
    const excluded = trustPolicyExcludeEntries(workspace) ?? [];
    expect(excluded.filter((entry) => entry.startsWith('chokidar@'))).toEqual([]);
    const overridesMatch = workspace.match(/^overrides:\n((?:[ \t].+\n?)+)/m);
    expect(overridesMatch, 'expected an `overrides:` block pinning chokidar').not.toBeNull();
    const overridesBlock = overridesMatch?.[1] ?? '';
    expect(overridesBlock).toMatch(/^\s*chokidar:\s*['"]?4\.0\.[01]['"]?\s*$/m);
  });
});
