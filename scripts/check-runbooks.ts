/**
 * Runbook lint (G-E8, spec §7; F24). Fails when one of the 13 required runbooks is missing, lacks
 * the shared shape, breaks the AGENTS.md command rules inside a code fence, or contains a real-looking
 * mobile number or PAN. Run with plain Node 24 (type stripping): `node scripts/check-runbooks.ts`
 * or `pnpm check-runbooks`. An optional first argument overrides the directory (default docs/runbooks).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

export interface RequiredRunbook {
  readonly slug: string;
  readonly title: string;
}

export type ProblemCode =
  | 'MISSING'
  | 'TITLE'
  | 'OWNER'
  | 'SECTION_MISSING'
  | 'SECTION_ORDER'
  | 'AMPERSANDS'
  | 'FILTER_FORM'
  | 'ENV_TWIN'
  | 'PII'
  | 'INDEX';

export interface RunbookProblem {
  readonly file: string;
  readonly line: number;
  readonly code: ProblemCode;
  readonly message: string;
}

/** Spec §7 G-E8, in the spec's order. `credential-rotation` is created by F1; the rest by F24. */
export const REQUIRED_RUNBOOKS: readonly RequiredRunbook[] = [
  { slug: 'fp-outage', title: 'FP outage' },
  { slug: 'sms-outage', title: 'SMS outage' },
  { slug: 'stuck-reconciling', title: 'Stuck RECONCILING' },
  { slug: 'units-pending', title: 'UNITS_PENDING' },
  { slug: 'refund', title: 'Refund' },
  { slug: 'payout-delayed', title: 'Payout delayed' },
  { slug: 'worker-down', title: 'Worker down' },
  { slug: 'kill-switch', title: 'Kill switch' },
  { slug: 'credential-rotation', title: 'credential rotation' },
  { slug: 'cert-in-6h', title: 'CERT-In 6 h report' },
  { slug: 'dpdp-breach', title: 'DPDP breach' },
  { slug: 'account-closure-dsr', title: 'Account closure and data requests' },
  { slug: 'assisted-contact-bank-change', title: 'Assisted contact and bank change' },
];

/** Every runbook has these H2 sections, in this order; other H2 sections may sit between them. */
export const REQUIRED_SECTIONS: readonly string[] = [
  'When to use',
  'Detect',
  'Act',
  'Verify',
  'Escalate',
  'Evidence',
];

const MOBILE = /(?<![\d-])[6-9]\d{9}(?!\d)/;
const PAN = /\b[A-Z]{5}\d{4}[A-Z]\b/;
const PS_ENV = /\$env:([A-Z][A-Z0-9_]*)\s*=/g;

export function checkRunbookText(slug: string, title: string, text: string): RunbookProblem[] {
  const file = `${slug}.md`;
  const lines = text.split(/\r?\n/);
  const problems: RunbookProblem[] = [];
  const add = (line: number, code: ProblemCode, message: string): void => {
    problems.push({ file, line, code, message });
  };

  if (lines[0] !== `# Runbook: ${title}`)
    add(1, 'TITLE', `first line must be "# Runbook: ${title}"`);
  if (!lines.some((l) => l.startsWith('Owner:'))) add(1, 'OWNER', 'needs an "Owner:" line');

  const headings = new Map<string, number>();
  for (const [i, l] of lines.entries()) {
    const m = /^## (.+?)\s*$/.exec(l);
    if (m?.[1] !== undefined && !headings.has(m[1])) headings.set(m[1], i + 1);
  }
  let lastLine = 0;
  let ordered = true;
  for (const section of REQUIRED_SECTIONS) {
    const at = headings.get(section);
    if (at === undefined) {
      add(1, 'SECTION_MISSING', `missing "## ${section}"`);
      continue;
    }
    if (at < lastLine) ordered = false;
    lastLine = at;
  }
  if (ordered === false)
    add(1, 'SECTION_ORDER', `sections must appear in the order: ${REQUIRED_SECTIONS.join(', ')}`);

  let inFence = false;
  const fenced: Array<{ line: number; text: string }> = [];
  for (const [i, l] of lines.entries()) {
    if (/^\s*```/.test(l)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) fenced.push({ line: i + 1, text: l });
    if (MOBILE.test(l) || PAN.test(l))
      add(i + 1, 'PII', 'real-looking mobile number or PAN; use <mobile> / <pan>');
  }
  for (const f of fenced) {
    if (/\s&&\s/.test(f.text))
      add(f.line, 'AMPERSANDS', 'no && in commands (AGENTS.md): one command per line');
    if (/--filter\s+@/.test(f.text)) add(f.line, 'FILTER_FORM', 'use --filter=@sanchay/<name>');
    for (const m of f.text.matchAll(PS_ENV)) {
      const name = m[1] ?? '';
      const twin = new RegExp(`^\\s*(?:[A-Z][A-Z0-9_]*=\\S*\\s+)*${name}=\\S*\\s+\\S`);
      if (!fenced.some((g) => twin.test(g.text))) {
        add(
          f.line,
          'ENV_TWIN',
          `$env:${name} needs its Git Bash form (${name}=<v> <cmd>) in a code block`,
        );
      }
    }
  }
  return problems;
}

export function checkIndex(text: string, slugs: readonly string[]): RunbookProblem[] {
  const missing = slugs.filter((s) => !text.includes(`(${s}.md)`));
  if (missing.length === 0) return [];
  return [
    {
      file: 'README.md',
      line: 1,
      code: 'INDEX',
      message: `README.md does not link: ${missing.map((s) => `${s}.md`).join(', ')}`,
    },
  ];
}

export function checkRunbooksDir(dir: string): { checked: number; problems: RunbookProblem[] } {
  const problems: RunbookProblem[] = [];
  let checked = 0;
  for (const { slug, title } of REQUIRED_RUNBOOKS) {
    const path = join(dir, `${slug}.md`);
    if (!existsSync(path)) {
      problems.push({
        file: `${slug}.md`,
        line: 0,
        code: 'MISSING',
        message: 'required G-E8 runbook is missing',
      });
      continue;
    }
    checked += 1;
    problems.push(...checkRunbookText(slug, title, readFileSync(path, 'utf8')));
  }
  const index = join(dir, 'README.md');
  if (existsSync(index)) {
    problems.push(
      ...checkIndex(
        readFileSync(index, 'utf8'),
        REQUIRED_RUNBOOKS.map((r) => r.slug),
      ),
    );
  } else {
    problems.push({
      file: 'README.md',
      line: 0,
      code: 'MISSING',
      message: 'runbook index is missing',
    });
  }
  return { checked, problems };
}

if (import.meta.main) {
  const dir = process.argv[2] ?? join('docs', 'runbooks');
  const { checked, problems } = checkRunbooksDir(dir);
  for (const p of problems)
    process.stderr.write(`${dir}/${p.file}:${p.line}: [${p.code}] ${p.message}\n`);
  if (problems.length > 0) {
    process.stderr.write(`check-runbooks: ${problems.length} problem(s) in ${dir}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`check-runbooks: ${checked} runbooks checked, no problems\n`);
  }
}
