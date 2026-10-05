import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  checkIndex,
  checkRunbooksDir,
  checkRunbookText,
  REQUIRED_RUNBOOKS,
  REQUIRED_SECTIONS,
} from './check-runbooks.ts';

const FENCE = '```';

function runbook(
  title: string,
  overrides: { sections?: string[]; body?: string; owner?: boolean } = {},
): string {
  const sections = overrides.sections ?? [...REQUIRED_SECTIONS];
  const lines = [
    `# Runbook: ${title}`,
    '',
    ...(overrides.owner === false ? [] : ['Owner: Dev B. Gate: G-E8.']),
    '',
  ];
  for (const s of sections) lines.push(`## ${s}`, '', 'Text.', '');
  if (overrides.body !== undefined) lines.push(overrides.body);
  return lines.join('\n');
}

const codesOf = (slug: string, title: string, text: string): string[] =>
  checkRunbookText(slug, title, text).map((p) => p.code);

describe('REQUIRED_RUNBOOKS', () => {
  it('pins the 13 G-E8 runbooks of spec §7 in spec order', () => {
    assert.deepEqual(
      REQUIRED_RUNBOOKS.map((r) => r.slug),
      [
        'fp-outage',
        'sms-outage',
        'stuck-reconciling',
        'units-pending',
        'refund',
        'payout-delayed',
        'worker-down',
        'kill-switch',
        'credential-rotation',
        'cert-in-6h',
        'dpdp-breach',
        'account-closure-dsr',
        'assisted-contact-bank-change',
      ],
    );
  });

  it('pins the six required sections in order', () => {
    assert.deepEqual(REQUIRED_SECTIONS, [
      'When to use',
      'Detect',
      'Act',
      'Verify',
      'Escalate',
      'Evidence',
    ]);
  });
});

describe('checkRunbookText', () => {
  it('accepts a complete runbook', () => {
    assert.deepEqual(codesOf('refund', 'Refund', runbook('Refund')), []);
  });

  it('accepts extra sections between the required ones (F1 credential-rotation keeps its own)', () => {
    const text = runbook('Refund', {
      sections: [
        'When to use',
        'Detect',
        'Act',
        'Rotation steps',
        'Verify',
        'Escalate',
        'Evidence',
      ],
    });
    assert.deepEqual(codesOf('refund', 'Refund', text), []);
  });

  it('flags a wrong or missing H1 title', () => {
    assert.deepEqual(codesOf('refund', 'Refund', runbook('Refunds')), ['TITLE']);
  });

  it('flags a missing Owner line', () => {
    assert.deepEqual(codesOf('refund', 'Refund', runbook('Refund', { owner: false })), ['OWNER']);
  });

  it('flags a missing required section', () => {
    const text = runbook('Refund', {
      sections: ['When to use', 'Detect', 'Act', 'Verify', 'Evidence'],
    });
    assert.deepEqual(codesOf('refund', 'Refund', text), ['SECTION_MISSING']);
  });

  it('flags required sections out of order', () => {
    const text = runbook('Refund', {
      sections: ['When to use', 'Act', 'Detect', 'Verify', 'Escalate', 'Evidence'],
    });
    assert.deepEqual(codesOf('refund', 'Refund', text), ['SECTION_ORDER']);
  });

  it('flags && inside a code fence but not in prose', () => {
    const fenced = runbook('Refund', { body: `${FENCE}\npnpm build && pnpm test\n${FENCE}` });
    assert.deepEqual(codesOf('refund', 'Refund', fenced), ['AMPERSANDS']);
    const prose = runbook('Refund', { body: 'Check A && B in the console.' });
    assert.deepEqual(codesOf('refund', 'Refund', prose), []);
  });

  it('flags the space form of --filter inside a code fence', () => {
    const text = runbook('Refund', {
      body: `${FENCE}\npnpm --filter @sanchay/api build\n${FENCE}`,
    });
    assert.deepEqual(codesOf('refund', 'Refund', text), ['FILTER_FORM']);
  });

  it('flags a PowerShell env assignment without its Git Bash twin', () => {
    const lonely = runbook('Refund', {
      body: `${FENCE}\n$env:SANCHAY_APP_ROLE='ops'; pnpm ops:sync --order <id>\n${FENCE}`,
    });
    assert.deepEqual(codesOf('refund', 'Refund', lonely), ['ENV_TWIN']);
    const paired = runbook('Refund', {
      body: `${FENCE}\n$env:SANCHAY_APP_ROLE='ops'; pnpm ops:sync --order <id>\nSANCHAY_APP_ROLE=ops pnpm ops:sync --order <id>\n${FENCE}`,
    });
    assert.deepEqual(codesOf('refund', 'Refund', paired), []);
  });

  it('flags a 10-digit Indian mobile number and a PAN anywhere in the file', () => {
    assert.deepEqual(codesOf('refund', 'Refund', runbook('Refund', { body: 'Call 9876543210.' })), [
      'PII',
    ]);
    assert.deepEqual(codesOf('refund', 'Refund', runbook('Refund', { body: 'PAN ABCDE1234F.' })), [
      'PII',
    ]);
    assert.deepEqual(
      codesOf('refund', 'Refund', runbook('Refund', { body: 'Mobile <mobile>, PAN <pan>.' })),
      [],
    );
  });

  it('handles CRLF line endings', () => {
    assert.deepEqual(codesOf('refund', 'Refund', runbook('Refund').replace(/\n/g, '\r\n')), []);
  });
});

describe('checkIndex', () => {
  it('flags every required runbook the README does not link', () => {
    const problems = checkIndex('- [FP outage](fp-outage.md)\n', ['fp-outage', 'sms-outage']);
    assert.deepEqual(
      problems.map((p) => [p.code, p.file]),
      [['INDEX', 'README.md']],
    );
    assert.match(problems[0]?.message ?? '', /sms-outage\.md/);
  });
});

describe('checkRunbooksDir', () => {
  it('reports a missing runbook file and a missing README', () => {
    const dir = mkdtempSync(join(tmpdir(), 'runbooks-'));
    try {
      writeFileSync(join(dir, 'fp-outage.md'), runbook('FP outage'));
      const { checked, problems } = checkRunbooksDir(dir);
      assert.equal(checked, 1);
      const missing = problems.filter((p) => p.code === 'MISSING').map((p) => p.file);
      assert.equal(missing.length, REQUIRED_RUNBOOKS.length);
      assert.ok(missing.includes('README.md'));
      assert.ok(missing.includes('sms-outage.md'));
      assert.ok(!missing.includes('fp-outage.md'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
