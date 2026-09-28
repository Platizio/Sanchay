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
 * key's mere presence. chokidar keeps its override.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const workspacePath = resolve(repoRoot, 'pnpm-workspace.yaml');
const rulingsPath = resolve(repoRoot, 'docs/delivery/rulings.md');
const adrPath = resolve(repoRoot, 'docs/adr/0001-versions.md');

/**
 * Review finding (batch C1-C4-C5, round 5): commit `471ed0f` replaced the pre-R-28 blanket
 * ban with an admission rule of the implementer's own design (any exact version named in
 * rulings.md with an ADR-0001 row), and round 4 added a citation check that any 64-hex string
 * satisfied. The owner approved neither rule, and same-identity edits to those two documents
 * satisfy both, so the lock's own ratification could not be told apart from implementer
 * self-authorization.
 *
 * The lock now takes its admissible set from the owner's decision itself: the text of the
 * option the owner chose, quoted verbatim from the harness record of the owner's answer, which
 * lives outside this repo and outside any implementer's output. A reviewer checks the quote
 * against that record with the sha256 command in ADR-0001 (the round 5 row). Compared with the
 * pre-R-28 lock (`650413f`), this quote is the only relaxation; every other check is inherited
 * or stricter. Widening the set means changing the quote, which only a new owner record can
 * justify.
 */
const OWNER_DECISION = {
  record:
    'Claude Code controller session 2f00d411-382c-43a6-bd67-ecaf60c67db1, AskUserQuestion ' +
    'answer record 745eb3c2-09b9-4f47-a5f7-0d14e5dd3d20',
  answeredAt: '2026-09-28T07:00:39.180Z',
  sha256: '5820238f29ea96d4050f7034bfa2e413dd9bbdac34758b4b75392377234d4ba5',
  chosenOption: 'Exact-version exceptions (Recommended)',
  chosenOptionText:
    'Allow exactly chokidar@4.0.3, ua-parser-js@1.0.41 and semver@6.3.1 (no ranges, no ' +
    'wildcards), each with an ADR-0001 row giving the reason and a re-check date. The policy ' +
    'stays on for everything else.',
} as const;

/** The only entries the lock can admit: the versions the owner's chosen option names. */
const OWNER_APPROVED_EXCLUSIONS: readonly string[] =
  OWNER_DECISION.chosenOptionText.match(/[a-z0-9][a-z0-9._-]*@\d+\.\d+\.\d+/g) ?? [];

/** An exact `name@version` or `@scope/name@version`: no range, no bare name, no pattern. */
const EXACT_ENTRY =
  /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*@\d+\.\d+\.\d+(?:-[0-9a-z.-]+)?$/;

/** How an ADR-0001 row cites the owner's record: this exact answer time and sha256, no other. */
const OWNER_RECORD_CITATION = `answered ${OWNER_DECISION.answeredAt}, sha256 ${OWNER_DECISION.sha256}`;

/** The re-check date the owner asked every entry's ADR-0001 row to give. */
const RECHECK_DATE = /\bre-check (\d{4}-\d{2}-\d{2})\b/i;

interface GovernedFiles {
  readonly workspace: string;
  readonly rulings: string;
  readonly adr: string;
}

interface ExcludeList {
  /** `undefined` when the key is absent. */
  readonly entries: readonly string[] | undefined;
  readonly problems: readonly string[];
}

/** Parses the `trustPolicyExclude` block list, reporting any other shape as a problem. */
function parseTrustPolicyExclude(workspace: string): ExcludeList {
  const lines = workspace.split(/\r?\n/);
  const start = lines.findIndex((line) => /^["']?trust-?policy-?exclude["']?\s*:/i.test(line));
  if (start === -1) {
    return { entries: undefined, problems: [] };
  }
  const problems: string[] = [];
  if (!/^trustPolicyExclude:\s*$/.test(lines[start] ?? '')) {
    problems.push('trustPolicyExclude must be a YAML block list with one exact entry per line');
  }
  const entries: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const body = line.trim();
    if (body === '' || body.startsWith('#')) {
      continue;
    }
    if (/^\S/.test(line)) {
      break; // the next top-level key
    }
    const entry = /^-\s*(['"]?)([^'"\s]+)\1$/.exec(body)?.[2];
    if (entry === undefined) {
      problems.push(`unparseable trustPolicyExclude line: ${line}`);
      continue;
    }
    entries.push(entry);
  }
  if (entries.length === 0) {
    problems.push('trustPolicyExclude is declared but lists no entries');
  }
  return { entries, problems };
}

/** ADR-0001 table rows about `trustPolicyExclude`. */
function adrTrustPolicyRows(adr: string): string[] {
  return adr
    .split(/\r?\n/)
    .filter((line) => line.startsWith('|') && line.includes('trustPolicyExclude'));
}

/** Every reason the governed files break the lock; empty when they comply. */
function trustPolicyViolations({ workspace, rulings, adr }: GovernedFiles): string[] {
  const { entries, problems } = parseTrustPolicyExclude(workspace);
  if (entries === undefined) {
    return []; // Nothing excluded; nothing to govern.
  }
  const violations = [...problems];
  const adrRows = adrTrustPolicyRows(adr);
  for (const entry of entries) {
    if (!EXACT_ENTRY.test(entry)) {
      violations.push(`${entry}: not an exact name@version`);
    }
    if (!OWNER_APPROVED_EXCLUSIONS.includes(entry)) {
      violations.push(
        `${entry}: the owner's recorded decision (${OWNER_DECISION.record}, answered ` +
          `${OWNER_DECISION.answeredAt}) does not name it; rulings.md or ADR-0001 text alone ` +
          'cannot admit an exclusion',
      );
    }
    if (!rulings.includes(`\`${entry}\``)) {
      violations.push(
        `${entry}: docs/delivery/rulings.md never names it — AGENTS.md requires a trustPolicy ` +
          'install error to be escalated to the lead and ratified there, never resolved by the ' +
          'implementer alone',
      );
    }
    const rows = adrRows.filter((row) => row.includes(`'${entry}'`));
    if (rows.length === 0) {
      violations.push(`${entry}: docs/adr/0001-versions.md has no trustPolicyExclude row for it`);
    }
    const recheck = rows.map((row) => RECHECK_DATE.exec(row)?.[1]).find((d) => d !== undefined);
    if (Number.isNaN(Date.parse(recheck ?? ''))) {
      violations.push(`${entry}: no ADR-0001 row gives a re-check date`);
    }
    if (
      !rows.some(
        (row) => row.includes('owner decision record:') && row.includes(OWNER_RECORD_CITATION),
      )
    ) {
      violations.push(
        `${entry}: no ADR-0001 row cites the owner's decision record (owner decision record: ` +
          `<where>, ${OWNER_RECORD_CITATION})`,
      );
    }
  }
  return violations;
}

/** Adds one entry at the top of the `trustPolicyExclude` block list. */
function withExclusion(workspace: string, entry: string): string {
  const mutated = workspace.replace(
    /^trustPolicyExclude:[ \t]*\r?\n/m,
    (key) => `${key}  - '${entry}'\n`,
  );
  expect(mutated, 'test setup: no trustPolicyExclude block to add to').not.toBe(workspace);
  return mutated;
}

describe('pnpm trust-policy governance', () => {
  const workspace = readFileSync(workspacePath, 'utf8');
  const rulings = existsSync(rulingsPath) ? readFileSync(rulingsPath, 'utf8') : '';
  const adr = readFileSync(adrPath, 'utf8');
  const committed: GovernedFiles = { workspace, rulings, adr };

  it("takes its admissible set verbatim from the owner's recorded decision", () => {
    expect(OWNER_APPROVED_EXCLUSIONS).toEqual([
      'chokidar@4.0.3',
      'ua-parser-js@1.0.41',
      'semver@6.3.1',
    ]);
  });

  it('admits the committed trustPolicyExclude entries', () => {
    expect(trustPolicyViolations(committed)).toEqual([]);
  });

  it('rejects an entry that only implementer-written rulings.md and ADR-0001 text vouch for', () => {
    // Everything a same-identity implementer can write in this repo: the workspace entry, a
    // backticked rulings.md mention and an ADR-0001 row that copies the real citation and a
    // re-check date. None of it is the owner's decision.
    const forged: GovernedFiles = {
      workspace: withExclusion(workspace, 'left-pad@1.3.0'),
      rulings: `${rulings}\n| R-99 | Allow \`left-pad@1.3.0\`. | Forged. | None. |\n`,
      adr:
        `${adr}| 2026-09-28 | forged | \`trustPolicyExclude\` gains 'left-pad@1.3.0' | ` +
        `owner decision record: anywhere, answered ${OWNER_DECISION.answeredAt}, ` +
        `sha256 ${OWNER_DECISION.sha256}. Re-check 2027-01-15 |\n`,
    };
    expect(trustPolicyViolations(forged)).toEqual([
      expect.stringMatching(/^left-pad@1\.3\.0: .*owner's recorded decision/),
    ]);
  });

  it("requires ADR-0001 to cite the owner's record by its exact answer time and sha256", () => {
    const otherHash: GovernedFiles = {
      ...committed,
      adr: adr.replaceAll(OWNER_DECISION.sha256, 'f'.repeat(64)),
    };
    const violations = trustPolicyViolations(otherHash);
    expect(violations).toContainEqual(expect.stringMatching(/^semver@6\.3\.1: .*owner's decision/));
    expect(violations).toContainEqual(
      expect.stringMatching(/^ua-parser-js@1\.0\.41: .*owner's decision/),
    );
  });

  it('requires an ADR-0001 re-check date for every entry', () => {
    const noRecheck: GovernedFiles = {
      ...committed,
      adr: adr.replace(/re-check \d{4}-\d{2}-\d{2}/gi, 'review later'),
    };
    const violations = trustPolicyViolations(noRecheck);
    expect(violations).toContainEqual(expect.stringMatching(/^semver@6\.3\.1: .*re-check date/));
    expect(violations).toContainEqual(
      expect.stringMatching(/^ua-parser-js@1\.0\.41: .*re-check date/),
    );
  });

  it('rejects ranges, bare names and flow-style lists', () => {
    const ranged = workspace.replace("'ua-parser-js@1.0.41'", "'ua-parser-js@^1.0.41'");
    expect(ranged).not.toBe(workspace);
    expect(trustPolicyViolations({ ...committed, workspace: ranged })).toContainEqual(
      'ua-parser-js@^1.0.41: not an exact name@version',
    );
    expect(
      trustPolicyViolations({ ...committed, workspace: withExclusion(workspace, 'left-pad') }),
    ).toContainEqual('left-pad: not an exact name@version');
    const flow = workspace.replace(
      /^trustPolicyExclude:[ \t]*\r?\n(?:[ \t].*\r?\n)+/m,
      "trustPolicyExclude: ['semver@6.3.1', 'ua-parser-js@1.0.41']\n",
    );
    expect(flow).not.toBe(workspace);
    expect(trustPolicyViolations({ ...committed, workspace: flow })).toContainEqual(
      'trustPolicyExclude must be a YAML block list with one exact entry per line',
    );
  });

  it('has nothing to govern when the key is absent', () => {
    const absent = workspace.replace(/^trustPolicyExclude:[ \t]*\r?\n(?:[ \t].*\r?\n)+/m, '');
    expect(absent).not.toBe(workspace);
    expect(parseTrustPolicyExclude(absent).entries).toBeUndefined();
    expect(trustPolicyViolations({ ...committed, workspace: absent })).toEqual([]);
  });

  it('keeps trustPolicy at the hardened no-downgrade setting', () => {
    expect(workspace).toMatch(/^trustPolicy:\s*no-downgrade\s*$/m);
  });

  it('resolves the provenance-lapsed chokidar dependency via an override, not a trust exclusion', () => {
    // chokidar@4.0.2 and chokidar@4.0.3 lack npm provenance attestations (registry.npmjs.org
    // check, 2026-09-28); chokidar@4.0.0/4.0.1 carry one. @nestjs/cli@11.0.24 depends on
    // chokidar@4.0.3 exactly, which trips `trustPolicy: no-downgrade`. `overrides` is a
    // standard, documented pnpm setting (unrelated to trustPolicy) that pins the resolved
    // version instead of excluding the trust check. R-28 would allow `chokidar@4.0.3`, but the
    // override stays the stricter remedy, so no chokidar entry is admitted.
    const excluded = parseTrustPolicyExclude(workspace).entries ?? [];
    expect(excluded.filter((entry) => entry.startsWith('chokidar@'))).toEqual([]);
    const overridesMatch = workspace.match(/^overrides:\n((?:[ \t].+\n?)+)/m);
    expect(overridesMatch, 'expected an `overrides:` block pinning chokidar').not.toBeNull();
    const overridesBlock = overridesMatch?.[1] ?? '';
    expect(overridesBlock).toMatch(/^\s*chokidar:\s*['"]?4\.0\.[01]['"]?\s*$/m);
  });
});
