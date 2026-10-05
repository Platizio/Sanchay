import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FIX_BUDGET_TENTHS, parseDefects, summarise } from './defect-log.ts';

const HEAD = [
  '| ID | Opened | Severity | Gate | Summary | Owner | Est h | Spent h | Status | Fix | Test |',
  '|---|---|---|---|---|---|---|---|---|---|---|',
];
const log = (...rows: string[]): string => ['# Defect log', '', ...HEAD, ...rows, ''].join('\n');

const FIXED_A =
  '| D-01 | 2026-11-23 | CRITICAL | G-E7 | units off by 0.001 | A | 3 | 2.5 | FIXED | 1a2b3c4 | ledger.int.test.ts "rounds units" |';
const OPEN_MINOR_B =
  '| D-02 | 2026-11-23 | MINOR | - | label overlaps on small phones | B | 1 | 0.5 | OPEN | - | - |';

describe('FIX_BUDGET_TENTHS', () => {
  it('pins the pilot-week fix budget: Dev A 10 h, Dev B 6 h (outline F26)', () => {
    assert.deepEqual(FIX_BUDGET_TENTHS, { A: 100, B: 60 });
  });
});

describe('parseDefects', () => {
  it('reads every D-nn row and ignores the header and prose', () => {
    const rows = parseDefects(log(FIXED_A, OPEN_MINOR_B));
    assert.deepEqual(
      rows.map((r) => [r.id, r.severity, r.owner, r.spentTenths, r.status]),
      [
        ['D-01', 'CRITICAL', 'A', 25, 'FIXED'],
        ['D-02', 'MINOR', 'B', 5, 'OPEN'],
      ],
    );
  });

  it('rejects an unknown severity, owner or status, and a non-numeric hour', () => {
    assert.throws(() => parseDefects(log(FIXED_A.replace('CRITICAL', 'HIGH'))), /D-01: severity/);
    assert.throws(() => parseDefects(log(FIXED_A.replace('| A |', '| C |'))), /D-01: owner/);
    assert.throws(() => parseDefects(log(FIXED_A.replace('FIXED', 'DONE'))), /D-01: status/);
    assert.throws(() => parseDefects(log(FIXED_A.replace('| 2.5 |', '| 2,5 |'))), /D-01: spent/);
  });
});

describe('summarise', () => {
  it('sums spent hours per developer against the budget', () => {
    const s = summarise(parseDefects(log(FIXED_A, OPEN_MINOR_B)));
    assert.deepEqual(s.spentTenths, { A: 25, B: 5 });
    assert.deepEqual(s.overBudget, []);
    assert.deepEqual(s.blockers, []);
  });

  it('an open CRITICAL blocks the gate', () => {
    const s = summarise(parseDefects(log(FIXED_A.replace('FIXED', 'OPEN'))));
    assert.deepEqual(s.blockers, ['D-01: open CRITICAL']);
  });

  it('an open MAJOR tied to a gate item blocks the gate; one with Gate "-" does not', () => {
    const tied =
      '| D-03 | 2026-11-24 | MAJOR | G-E6 | App Link not verified | B | 1 | 1 | OPEN | - | - |';
    assert.deepEqual(summarise(parseDefects(log(tied))).blockers, ['D-03: open MAJOR on G-E6']);
    assert.deepEqual(summarise(parseDefects(log(tied.replace('G-E6', '-')))).blockers, []);
  });

  it('a FIXED defect needs a commit sha and a regression test', () => {
    const noSha = FIXED_A.replace('1a2b3c4', '-');
    const noTest = FIXED_A.replace('ledger.int.test.ts "rounds units"', '-');
    assert.deepEqual(summarise(parseDefects(log(noSha))).blockers, [
      'D-01: FIXED without a fix commit',
    ]);
    assert.deepEqual(summarise(parseDefects(log(noTest))).blockers, [
      'D-01: FIXED without a regression test',
    ]);
  });

  it('a CRITICAL defect can never be DEFERRED', () => {
    const deferred = FIXED_A.replace('FIXED', 'DEFERRED');
    assert.deepEqual(summarise(parseDefects(log(deferred))).blockers, [
      'D-01: CRITICAL cannot be DEFERRED',
    ]);
  });

  it('reports a developer over budget (a re-plan trigger, not a gate blocker)', () => {
    const big =
      '| D-04 | 2026-11-25 | MAJOR | - | flaky smoke | B | 4 | 6.5 | FIXED | abcdef1 | redeem.smoke.spec.ts |';
    const s = summarise(parseDefects(log(big)));
    assert.deepEqual(s.overBudget, ['B: 6.5 h spent of 6 h']);
    assert.deepEqual(s.blockers, []);
  });
});
