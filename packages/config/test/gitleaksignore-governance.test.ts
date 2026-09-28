import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Review finding (Task A2, batch A2, round 1): `.gitleaksignore` is a
 * security-scanning-policy mechanism, and adding it (or adding a fingerprint
 * to it) inside a task-scoped commit without recorded plan-owner sign-off
 * deviates from AGENTS.md / the plan header rule "touch only the files in
 * its Files list" and the specific gitleaks-false-positive procedure ("add a
 * narrow regex to .gitleaks.toml ... never use --no-verify").
 *
 * `.gitleaks.toml`'s allow-list is reserved for clearly fake *fixtures*
 * (see its own `[allowlist]` description). `.gitleaksignore` is a distinct,
 * narrower mechanism reserved for verified false positives in commits that
 * predate the task that would otherwise have to touch out-of-scope files to
 * fix them. This test enforces that every fingerprint suppressed there has a
 * matching, explicit sign-off row in docs/adr/0001-versions.md's "Appended
 * rows" table (matched by the suppressed commit's short SHA), so a future
 * addition can never land silently the way this one did.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const gitleaksignorePath = resolve(repoRoot, '.gitleaksignore');
const adrPath = resolve(repoRoot, 'docs/adr/0001-versions.md');

interface GitleaksignoreEntry {
  raw: string;
  commit: string;
  file: string;
  rule: string;
  line: string;
}

function parseGitleaksignore(contents: string): GitleaksignoreEntry[] {
  return contents
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((raw) => {
      const [commit = '', file = '', rule = '', line = ''] = raw.split(':');
      return { raw, commit, file, rule, line };
    });
}

describe('.gitleaksignore governance', () => {
  it('has a well-formed fingerprint on every non-comment line', () => {
    if (!existsSync(gitleaksignorePath)) {
      return;
    }
    const entries = parseGitleaksignore(readFileSync(gitleaksignorePath, 'utf8'));
    for (const entry of entries) {
      expect(entry.commit, `malformed .gitleaksignore line: "${entry.raw}"`).toMatch(
        /^[0-9a-f]{40}$/,
      );
      expect(entry.file.length > 0, `malformed .gitleaksignore line: "${entry.raw}"`).toBe(true);
    }
  });

  it('requires every suppressed fingerprint to have a recorded plan-owner sign-off in ADR-0001', () => {
    if (!existsSync(gitleaksignorePath)) {
      // Nothing suppressed yet; nothing to govern.
      return;
    }
    const entries = parseGitleaksignore(readFileSync(gitleaksignorePath, 'utf8'));
    expect(entries.length, 'expected at least one fingerprint to check').toBeGreaterThan(0);

    const adr = readFileSync(adrPath, 'utf8');
    expect(
      adr.includes('.gitleaksignore'),
      'docs/adr/0001-versions.md has no row documenting .gitleaksignore as an approved mechanism',
    ).toBe(true);

    for (const entry of entries) {
      const shortSha = entry.commit.slice(0, 7);
      const hasSignOff = adr.includes('.gitleaksignore') && adr.includes(shortSha);
      expect(
        hasSignOff,
        `fingerprint "${entry.raw}" (commit ${shortSha}) in .gitleaksignore has no matching ` +
          'plan-owner sign-off row in docs/adr/0001-versions.md — add an "Appended rows" entry ' +
          'that names .gitleaksignore and this commit before suppressing it',
      ).toBe(true);
    }
  });

  it('only suppresses findings from commits that predate this plan, never from a task-scoped commit', () => {
    if (!existsSync(gitleaksignorePath)) {
      return;
    }
    const entries = parseGitleaksignore(readFileSync(gitleaksignorePath, 'utf8'));
    const preExistingDocsCommit = 'a4917618c06047c436f68e70f63fbe1091ab825f';
    for (const entry of entries) {
      expect(
        entry.commit,
        `fingerprint "${entry.raw}" suppresses commit ${entry.commit}, not the pre-existing ` +
          `docs commit ${preExistingDocsCommit} — .gitleaksignore must never be used to hide a ` +
          "finding introduced by this plan's own work; fix the fixture or use .gitleaks.toml instead",
      ).toBe(preExistingDocsCommit);
    }
  });
});
