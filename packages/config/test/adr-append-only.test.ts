import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Review finding (batch B1-B4, round 3, "New important"): AGENTS.md says
 * "ADR files: append table rows only" (under "Shared files: edit, never
 * replace"). Commit `650413f` (the round-1 fix for the trust-policy
 * findings) violated this by editing the pre-existing B1 row in
 * `docs/adr/0001-versions.md`'s "Appended rows" table in place —
 * `git show 650413f -- docs/adr/0001-versions.md` shows a single `-`/`+`
 * pair at the same table position, not a new row added after the table's
 * prior last row. That erased the original row's "the lead handed the
 * decision back to the B1 implementer" text from the live document; it
 * survived only in git history, not in the live, append-only audit trail
 * the rule is meant to preserve.
 *
 * This test locks both halves of the round-3 correction: the original B1
 * row is restored verbatim at its original table position, and the
 * round-1 remedy explanation is re-recorded as a properly *appended* row
 * after every row that already existed when that remedy landed — so the
 * live document, not git history, carries the full audit trail.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const adrPath = resolve(repoRoot, 'docs/adr/0001-versions.md');

const ORIGINAL_B1_ROW_MARKER = "`trustPolicyExclude` gains exactly `'chokidar@4.0.3'`";
const ORIGINAL_B1_CLAIM = 'the lead handed the decision back to the B1 implementer';
const B6_ROW_MARKER = 'D-21 spike';
const ROUND1_REMEDY_MARKER = 'B1 review fix (round 1)';
const ROUND3_CORRECTION_MARKER = 'Append-only correction';

describe('ADR-0001 append-only governance', () => {
  const adr = readFileSync(adrPath, 'utf8');

  it('keeps the original B1 trustPolicyExclude row verbatim, never edited or removed in place', () => {
    expect(
      adr.includes(ORIGINAL_B1_ROW_MARKER),
      'the original B1 row ("trustPolicyExclude gains exactly \'chokidar@4.0.3\'") is missing from ' +
        'docs/adr/0001-versions.md — AGENTS.md requires ADR rows to be appended, never edited or ' +
        'removed in place',
    ).toBe(true);
    expect(
      adr.includes(ORIGINAL_B1_CLAIM),
      "the original B1 row's text is missing or was rewritten — ADR rows must stay verbatim once " +
        'appended; corrections belong in a new row, not an edit to this one',
    ).toBe(true);
  });

  it('records every correction as a row appended strictly after the rows that predate it, never spliced in', () => {
    const originalRowIndex = adr.indexOf(ORIGINAL_B1_ROW_MARKER);
    const b6RowIndex = adr.indexOf(B6_ROW_MARKER);
    const round1RemedyIndex = adr.indexOf(ROUND1_REMEDY_MARKER);
    const round3CorrectionIndex = adr.indexOf(ROUND3_CORRECTION_MARKER);

    expect(originalRowIndex, 'original B1 row not found').toBeGreaterThan(-1);
    expect(b6RowIndex, 'B6 D-21 row not found').toBeGreaterThan(-1);
    expect(round1RemedyIndex, 'round-1 remedy row not found').toBeGreaterThan(-1);
    expect(round3CorrectionIndex, 'round-3 append-only correction row not found').toBeGreaterThan(
      -1,
    );

    // The round-1 remedy documents a fix that landed after B6 (commit 48fffcc predates
    // 650413f), so its row must sit after B6's row, not before it.
    expect(round1RemedyIndex).toBeGreaterThan(b6RowIndex);
    // The round-3 correction must sit after everything that predates it, including its
    // own restored original row and the round-1 remedy row it documents.
    expect(round3CorrectionIndex).toBeGreaterThan(originalRowIndex);
    expect(round3CorrectionIndex).toBeGreaterThan(b6RowIndex);
    expect(round3CorrectionIndex).toBeGreaterThan(round1RemedyIndex);
  });

  it('keeps the live remedy (pnpm overrides, not a trust exclusion) documented in the appended rows', () => {
    // Matches the actual remedy in pnpm-workspace.yaml and
    // packages/config/test/trust-policy-governance.test.ts.
    expect(adr).toMatch(/overrides:\s*\{\s*chokidar:\s*'4\.0\.1'\s*\}/);
  });
});
