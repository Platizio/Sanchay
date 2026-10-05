import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { decodeLog, findPiiInLine, PII_RULES, scanPaths, scanText } from './scan-pii-logs.ts';

const rulesOf = (line: string): string[] => findPiiInLine(line).map((f) => f.rule);

describe('PII_RULES', () => {
  it('pins the four G-E3 rule ids in match order', () => {
    assert.deepEqual(
      PII_RULES.map((r) => r.id),
      ['PAN', 'AADHAAR', 'MOBILE', 'EMAIL'],
    );
  });
});

describe('findPiiInLine', () => {
  it('flags a personal PAN (fourth letter P)', () => {
    assert.deepEqual(rulesOf('{"msg":"kyc","pan":"ABCPE1234F"}'), ['PAN']);
  });

  it('does not flag a PAN-shaped token whose fourth letter is not a holder type', () => {
    assert.deepEqual(rulesOf('code ABCXE1234F'), []);
  });

  it('flags a 12-digit Aadhaar-shaped number, grouped or not', () => {
    assert.deepEqual(rulesOf('aadhaar 2345 6789 0123 seen'), ['AADHAAR']);
    assert.deepEqual(rulesOf('aadhaar 234567890123 seen'), ['AADHAAR']);
  });

  it('flags a 10-digit Indian mobile, with or without +91', () => {
    assert.deepEqual(rulesOf('otp to 9876500001'), ['MOBILE']);
    assert.deepEqual(rulesOf('otp to +919876500001'), ['MOBILE']);
  });

  it('does not flag epoch milliseconds, 8-digit ids or masked mobiles', () => {
    assert.deepEqual(rulesOf('{"time":1795432100123,"id":12345678}'), []);
    assert.deepEqual(rulesOf('sent to ••••••0001'), []);
  });

  it('flags an email address but not a masked one', () => {
    assert.deepEqual(rulesOf('to ravi@example.com'), ['EMAIL']);
    assert.deepEqual(rulesOf('to r•••@example.com'), []);
  });

  it('reports one finding per match, masked to the first two characters', () => {
    const findings = findPiiInLine('9876500001 and 9822200012');
    assert.deepEqual(
      findings.map((f) => f.sample),
      ['98***', '98***'],
    );
  });
});

describe('scanText', () => {
  it('scans only the text after the marker, on lines that carry it (turbo and reporter output come first)', () => {
    const text = [
      '@sanchay/web:e2e:web: [WebServer] {"level":30,"msg":"otp sent","to":"9876500001"}',
      '@sanchay/web:e2e:web:     locator.fill(9876500001)',
      '@sanchay/web:e2e:web: 9876500001 ··[WebServer] {"level":30,"req":{"id":"01a0f5c6-2c50-732a-b49d-8084083458b1"}}',
    ].join('\n');
    const result = scanText('e2e-web.log', text, '[WebServer] ');
    assert.equal(result.linesScanned, 2);
    assert.deepEqual(
      result.findings.map((f) => [f.line, f.rule]),
      [[1, 'MOBILE']],
    );
  });

  it('scans every line when no marker is given', () => {
    const result = scanText('a.log', 'x\nravi@example.com\n', undefined);
    assert.equal(result.linesScanned, 3);
    assert.equal(result.findings.length, 1);
  });
});

describe('decodeLog', () => {
  it('decodes UTF-16LE with a BOM (PowerShell 5.1 redirection) and plain UTF-8', () => {
    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('9876500001', 'utf16le')]);
    assert.equal(decodeLog(utf16), '9876500001');
    assert.equal(decodeLog(Buffer.from('plain', 'utf8')), 'plain');
  });
});

describe('scanPaths', () => {
  it('recurses into directories, reads only log-like files and skips missing paths', () => {
    const dir = mkdtempSync(join(tmpdir(), 'scan-pii-'));
    try {
      writeFileSync(join(dir, 'api.log'), '{"to":"ravi@example.com"}\n');
      writeFileSync(join(dir, 'shot.png'), 'ravi@example.com');
      const result = scanPaths([dir, join(dir, 'missing.log')], undefined);
      assert.equal(result.filesScanned, 1);
      assert.equal(result.findings.length, 1);
      assert.equal(result.findings[0]?.rule, 'EMAIL');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
