/**
 * Brand lint (H-17 as amended by ruling R-19, D-PLATFORM-004). Fails when a tracked or new,
 * non-ignored file contains a retired identifier or the legal-entity name outside the allowlist.
 * Run with plain Node 24 (type stripping): `node scripts/check-brand.ts` or `pnpm check-brand`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

export interface BrandRule {
  readonly id: string;
  readonly pattern: RegExp;
}

export interface BrandViolation {
  readonly path: string;
  readonly line: number;
  readonly rule: string;
  readonly text: string;
}

/**
 * Checked in this order; the first matching rule is reported for a line. The five retired
 * identifiers come first, so the line allowlist below can never hide them (R-19).
 */
export const BRAND_RULES: readonly BrandRule[] = [
  { id: '@plz/', pattern: /@plz\//i },
  { id: 'PLZ_', pattern: /PLZ_/i },
  { id: 'plz', pattern: /\bplz\b/i },
  { id: 'platizio://', pattern: /platizio:\/\//i },
  { id: 'platizio.in', pattern: /platizio\.in\b/i },
  { id: 'Platizio', pattern: /Platizio|PLATIZIO/ },
];

/** The only rule an allowlisted line may break: the legal-entity name itself. */
const NAME_RULE_ID = 'Platizio';

/**
 * R-19 path allowlist, exactly. Repo-relative, forward slashes. `*` matches inside one path
 * segment and `**` matches across segments.
 */
export const ALLOWLIST_GLOBS: readonly string[] = [
  'docs/**',
  'scripts/check-brand*.ts',
  'apps/api/src/integrations/sms/templates*.ts',
  'packages/domain/src/legal-entity.ts',
];

/** R-19 line allowlist: corporate email domain, FP auth path, quoted lower-case FP tenant id. */
export const ALLOWLIST_LINE_PATTERNS: readonly RegExp[] = [
  /platizio\.com/i,
  /\/v2\/auth\/platizio\//,
  /(['"`])platizio\1/,
];

/** Not scanned (and not part of the brand allowlist): generated lockfile hashes can contain "plz". */
export const SKIPPED_FILES: readonly string[] = ['pnpm-lock.yaml'];

const BINARY_EXTENSIONS =
  /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|jar|jks|keystore|aab|apk|ttf|otf|woff2?)$/i;

export function globToRegExp(glob: string): RegExp {
  let source = '';
  for (let i = 0; i < glob.length; i += 1) {
    const ch = glob.charAt(i);
    if (ch === '*' && glob.charAt(i + 1) === '*') {
      source += '.*';
      i += 1;
    } else if (ch === '*') {
      source += '[^/]*';
    } else {
      source += ch.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${source}$`);
}

const ALLOWLIST_REGEXPS: readonly RegExp[] = ALLOWLIST_GLOBS.map(globToRegExp);

export function isAllowlistedPath(path: string): boolean {
  return ALLOWLIST_REGEXPS.some((pattern) => pattern.test(path));
}

/** True for every path the lint does not scan: the R-19 allowlist plus skipped and binary files. */
export function isPathExempt(path: string): boolean {
  return isAllowlistedPath(path) || SKIPPED_FILES.includes(path) || BINARY_EXTENSIONS.test(path);
}

export function findViolationsInText(path: string, text: string): BrandViolation[] {
  if (isPathExempt(path)) return [];
  const violations: BrandViolation[] = [];
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const rule = BRAND_RULES.find((candidate) => candidate.pattern.test(raw));
    if (rule === undefined) continue;
    if (rule.id === NAME_RULE_ID && ALLOWLIST_LINE_PATTERNS.some((pattern) => pattern.test(raw))) {
      continue;
    }
    violations.push({ path, line: index + 1, rule: rule.id, text: raw.trim().slice(0, 160) });
  }
  return violations;
}

/** Tracked files plus new files that are not git-ignored. */
export function listRepoFiles(cwd: string): string[] {
  const out = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    {
      cwd,
      encoding: 'utf8',
    },
  );
  return [...new Set(out.split('\0').filter((path) => path.length > 0))].sort();
}

export function checkRepo(cwd: string): { scanned: number; violations: BrandViolation[] } {
  const violations: BrandViolation[] = [];
  let scanned = 0;
  for (const path of listRepoFiles(cwd)) {
    if (isPathExempt(path)) continue;
    const full = join(cwd, path);
    if (!existsSync(full) || !statSync(full).isFile()) continue;
    const text = readFileSync(full, 'utf8');
    if (text.includes('\u0000')) continue;
    scanned += 1;
    violations.push(...findViolationsInText(path, text));
  }
  return { scanned, violations };
}

if (import.meta.main) {
  const { scanned, violations } = checkRepo(process.cwd());
  for (const v of violations) {
    process.stderr.write(`${v.path}:${v.line}: [${v.rule}] ${v.text}\n`);
  }
  if (violations.length > 0) {
    process.stderr.write(
      `check-brand: ${violations.length} violation(s). Use Sanchay names; import LEGAL_ENTITY_NAME from packages/domain/src/legal-entity.ts (R-19 allowlist).\n`,
    );
    process.exitCode = 1;
  } else {
    process.stdout.write(`check-brand: ${scanned} files scanned, no violations\n`);
  }
}
