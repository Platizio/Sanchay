/**
 * Pilot-week defect log and fix-budget check (F26). Reads the D-nn rows of the markdown table in the defect
 * log, prints the budget burn per developer, and with `--gate` exits 1 when a row blocks GO/NO-GO.
 * Run with plain Node 24: `node scripts/defect-log.ts [file] [--gate]` or `pnpm defects`.
 * Hours are kept as integer tenths of an hour (they are effort, not money).
 */
import { readFileSync } from 'node:fs';
import process from 'node:process';

export const DEFAULT_LOG = 'docs/probes/defect-log-2026-11.md';

/** Outline pilot-week table, F26: Dev A 10 h, Dev B 6 h. */
export const FIX_BUDGET_TENTHS = { A: 100, B: 60 } as const;

const SEVERITIES = ['CRITICAL', 'MAJOR', 'MINOR'] as const;
const OWNERS = ['A', 'B'] as const;
const STATUSES = ['OPEN', 'FIXED', 'DEFERRED', 'WONTFIX'] as const;

export type Severity = (typeof SEVERITIES)[number];
export type Owner = (typeof OWNERS)[number];
export type Status = (typeof STATUSES)[number];

export interface Defect {
  id: string;
  opened: string;
  severity: Severity;
  gate: string;
  summary: string;
  owner: Owner;
  estTenths: number;
  spentTenths: number;
  status: Status;
  fix: string;
  test: string;
}

export interface Summary {
  spentTenths: Record<Owner, number>;
  overBudget: string[];
  blockers: string[];
}

function oneOf<T extends string>(list: readonly T[], value: string, what: string, id: string): T {
  const found = list.find((v) => v === value);
  if (found === undefined)
    throw new Error(`${id}: ${what} "${value}" is not one of ${list.join(', ')}`);
  return found;
}

function tenths(value: string, what: string, id: string): number {
  const m = /^(\d+)(?:\.(\d))?$/.exec(value);
  if (m?.[1] === undefined)
    throw new Error(`${id}: ${what} "${value}" must be hours like 2 or 1.5`);
  return Number.parseInt(m[1], 10) * 10 + Number.parseInt(m[2] ?? '0', 10);
}

const hours = (t: number): string =>
  t % 10 === 0 ? `${t / 10}` : `${Math.floor(t / 10)}.${t % 10}`;

export function parseDefects(text: string): Defect[] {
  const defects: Defect[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!/^\|\s*D-\d+\s*\|/.test(line)) continue;
    const c = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (c.length !== 11) throw new Error(`row "${line.slice(0, 40)}" must have 11 cells`);
    const id = c[0] ?? '';
    defects.push({
      id,
      opened: c[1] ?? '',
      severity: oneOf(SEVERITIES, c[2] ?? '', 'severity', id),
      gate: c[3] ?? '-',
      summary: c[4] ?? '',
      owner: oneOf(OWNERS, c[5] ?? '', 'owner', id),
      estTenths: tenths(c[6] ?? '', 'estimate', id),
      spentTenths: tenths(c[7] ?? '', 'spent', id),
      status: oneOf(STATUSES, c[8] ?? '', 'status', id),
      fix: c[9] ?? '-',
      test: c[10] ?? '-',
    });
  }
  return defects;
}

export function summarise(defects: readonly Defect[]): Summary {
  const spentTenths: Record<Owner, number> = { A: 0, B: 0 };
  const blockers: string[] = [];
  for (const d of defects) {
    spentTenths[d.owner] += d.spentTenths;
    const open = d.status === 'OPEN';
    if (open && d.severity === 'CRITICAL') blockers.push(`${d.id}: open CRITICAL`);
    if (open && d.severity === 'MAJOR' && d.gate !== '-')
      blockers.push(`${d.id}: open MAJOR on ${d.gate}`);
    if (d.status === 'FIXED' && !/^[0-9a-f]{7,40}$/.test(d.fix))
      blockers.push(`${d.id}: FIXED without a fix commit`);
    if (d.status === 'FIXED' && (d.test === '' || d.test === '-')) {
      blockers.push(`${d.id}: FIXED without a regression test`);
    }
    if (d.status === 'DEFERRED' && d.severity === 'CRITICAL')
      blockers.push(`${d.id}: CRITICAL cannot be DEFERRED`);
  }
  const overBudget = OWNERS.filter((o) => spentTenths[o] > FIX_BUDGET_TENTHS[o]).map(
    (o) => `${o}: ${hours(spentTenths[o])} h spent of ${hours(FIX_BUDGET_TENTHS[o])} h`,
  );
  return { spentTenths, overBudget, blockers };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const gate = args.includes('--gate');
  const file = args.find((a) => !a.startsWith('--')) ?? DEFAULT_LOG;
  const defects = parseDefects(readFileSync(file, 'utf8'));
  const s = summarise(defects);
  for (const o of OWNERS) {
    process.stdout.write(
      `Dev ${o}: ${hours(s.spentTenths[o])} h of ${hours(FIX_BUDGET_TENTHS[o])} h\n`,
    );
  }
  process.stdout.write(`${defects.length} defect(s), ${s.blockers.length} gate blocker(s)\n`);
  for (const o of s.overBudget)
    process.stdout.write(`OVER BUDGET ${o}: re-plan with the PO (F26 stop rule)\n`);
  for (const b of s.blockers) process.stderr.write(`BLOCKER ${b}\n`);
  if (gate && s.blockers.length > 0) process.exitCode = 1;
}
