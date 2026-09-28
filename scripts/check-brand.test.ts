import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ALLOWLIST_GLOBS,
  BRAND_RULES,
  findViolationsInText,
  isAllowlistedPath,
  isPathExempt,
} from './check-brand.ts';

const rulesOf = (path: string, text: string): string[] =>
  findViolationsInText(path, text).map((v) => v.rule);

describe('BRAND_RULES', () => {
  it('pins the six H-17 rule ids in match order', () => {
    assert.deepEqual(
      BRAND_RULES.map((r) => r.id),
      ['@plz/', 'PLZ_', 'plz', 'platizio://', 'platizio.in', 'Platizio'],
    );
  });
});

describe('findViolationsInText', () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ["import { Money } from '@plz/money';", '@plz/'],
    ['PLZ_APP_ENV=local', 'PLZ_'],
    ['const client = "plz-web";', 'plz'],
    ['Linking.openURL("platizio://pay")', 'platizio://'],
    ['https://app.platizio.in/login', 'platizio.in'],
    ['Operated by Platizio.', 'Platizio'],
    ['PLATIZIO_ARN=ARN-000000', 'Platizio'],
  ];
  for (const [line, rule] of cases) {
    it(`flags ${JSON.stringify(line)} as ${rule}`, () => {
      assert.deepEqual(rulesOf('apps/web/src/example.ts', line), [rule]);
    });
  }

  it('reports 1-based line numbers and trimmed text', () => {
    assert.deepEqual(
      findViolationsInText('apps/web/src/a.ts', 'const a = 1;\n  const b = "plz";\n'),
      [{ path: 'apps/web/src/a.ts', line: 2, rule: 'plz', text: 'const b = "plz";' }],
    );
  });

  it('handles CRLF line endings', () => {
    assert.deepEqual(
      findViolationsInText('apps/api/.env.example', 'first\r\nsecond\r\nPLZ_X=1\r\n'),
      [{ path: 'apps/api/.env.example', line: 3, rule: 'PLZ_', text: 'PLZ_X=1' }],
    );
  });

  it('does not flag Sanchay code or words that merely contain the letters', () => {
    const clean = [
      'const brand = "Sanchay";',
      'supplz',
      'explanation',
      'platform',
      'app.sanchay.in',
    ];
    assert.deepEqual(findViolationsInText('apps/web/src/clean.ts', clean.join('\n')), []);
  });
});

describe('allowlist (H-17 as amended by R-19)', () => {
  it('pins the path allowlist to exactly the R-19 list', () => {
    assert.deepEqual(ALLOWLIST_GLOBS, [
      'docs/**',
      'scripts/check-brand*.ts',
      'apps/api/src/integrations/sms/templates*.ts',
      'packages/domain/src/legal-entity.ts',
    ]);
  });

  it('allowlists every path the R-19 globs cover', () => {
    for (const path of [
      'docs/specs/mvp/MVP-SPEC.md',
      'docs/adr/0001-versions.md',
      'docs/legal/drafts/tnc.md',
      'scripts/check-brand.ts',
      'scripts/check-brand.test.ts',
      'apps/api/src/integrations/sms/templates.ts',
      'apps/api/src/integrations/sms/templates.test.ts',
      'packages/domain/src/legal-entity.ts',
    ]) {
      assert.equal(isAllowlistedPath(path), true, path);
      assert.equal(isPathExempt(path), true, path);
    }
  });

  it('skips the lockfile and binaries without allowlisting them', () => {
    for (const path of ['pnpm-lock.yaml', 'apps/mobile/assets/icon.png']) {
      assert.equal(isAllowlistedPath(path), false, path);
      assert.equal(isPathExempt(path), true, path);
    }
  });

  it('does not exempt anything else', () => {
    for (const path of [
      'packages/app-core/src/copy/legal-entity.ts',
      'packages/app-core/src/copy/index.ts',
      'packages/domain/src/legal-entity.test.ts',
      'packages/domain/src/index.ts',
      'apps/api/src/modules/legal-consent/documents/tnc.md',
      'apps/api/src/integrations/email/templates.ts',
      'apps/api/src/integrations/sms/msg91.ts',
      'apps/api/src/integrations/sms/nested/templates.ts',
      'apps/web/src/app/site/page.tsx',
      'scripts/other.ts',
      'scripts/check-brand.js',
      'AGENTS.md',
      'docsx/readme.md',
    ]) {
      assert.equal(isPathExempt(path), false, path);
    }
  });

  it('returns no violations for an allowlisted path', () => {
    assert.deepEqual(rulesOf('docs/specs/regulatory-sources.md', 'Platizio, ARN holder'), []);
    assert.deepEqual(
      rulesOf(
        'apps/api/src/integrations/sms/templates.test.ts',
        "expect(text).toContain('-Platizio');",
      ),
      [],
    );
  });

  it('flags the DLT sign-off outside the SMS templates files', () => {
    const body =
      "  '123456 is your Sanchay login OTP. Valid 5 min. Never share it; Sanchay staff never ask for it. -Platizio',";
    assert.deepEqual(rulesOf('apps/api/src/integrations/sms/templates.ts', body), []);
    assert.deepEqual(rulesOf('apps/api/src/integrations/email/templates.ts', body), ['Platizio']);
    assert.deepEqual(rulesOf('apps/api/src/integrations/sms/msg91.test.ts', body), ['Platizio']);
  });

  it('checks retired identifiers before the line allowlist', () => {
    const file = 'apps/api/src/integrations/fp/config.ts';
    assert.deepEqual(rulesOf(file, "tenant: 'platizio', home: 'https://platizio.in'"), [
      'platizio.in',
    ]);
    assert.deepEqual(rulesOf(file, "const pay = 'platizio://pay'; // grievance@platizio.com"), [
      'platizio://',
    ]);
    assert.deepEqual(rulesOf(file, "const url = '/v2/auth/platizio/token'; // PLZ_ legacy"), [
      'PLZ_',
    ]);
  });

  it('exempts lines with the corporate email domain or the FP auth path', () => {
    assert.deepEqual(
      rulesOf('apps/web/src/site/footer.tsx', 'Write to grievance@platizio.com (Platizio)'),
      [],
    );
    assert.deepEqual(
      rulesOf(
        'apps/api/src/integrations/fp/auth.ts',
        "const url = '/v2/auth/platizio/token'; // Platizio",
      ),
      [],
    );
  });

  it('exempts the quoted lower-case tenant id only', () => {
    assert.deepEqual(
      rulesOf('apps/api/src/integrations/fp/config.ts', "tenant: 'platizio', // Platizio tenant"),
      [],
    );
    assert.deepEqual(rulesOf('apps/api/src/integrations/fp/config.ts', "tenant: 'Platizio',"), [
      'Platizio',
    ]);
  });
});
