/**
 * G-E3 PII log scan. Pino's key-based redaction (apps/api/src/modules/platform/logging.ts) cannot
 * see a PII value logged under an unlisted key or inside a message string, so this scans the
 * server-side logs captured during the e2e runs for PII-shaped VALUES. It scans logs the servers
 * wrote, never the Playwright report or Maestro output (those echo the fixture values the tests
 * typed). Run with plain Node 24 (type stripping):
 *   node scripts/scan-pii-logs.ts [--marker=<text>] <file-or-dir> [...]
 * Exit 0: lines scanned, no finding. Exit 1: findings. Exit 2: usage error or nothing scanned.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import process from 'node:process';

export interface PiiRule {
  readonly id: string;
  readonly pattern: RegExp;
}

export interface PiiFinding {
  readonly path: string;
  readonly line: number;
  readonly rule: string;
  /** First two characters only: the scan report itself must not leak the value. */
  readonly sample: string;
}

/**
 * Value shapes, each bounded so a run of digits or hex inside a longer token (a UUID segment,
 * epoch milliseconds, an amount) is not reported. Every rule applies to every line.
 */
export const PII_RULES: readonly PiiRule[] = [
  // Holder-type fourth letter (P person, C company, H HUF, F firm, A AOP, T trust, B BOI, L, J, G).
  { id: 'PAN', pattern: /(?<![\w])[A-Z]{3}[ABCFGHJLPT][A-Z][0-9]{4}[A-Z](?![\w])/g },
  // 12 digits, optionally grouped 4-4-4; Aadhaar never starts with 0 or 1.
  { id: 'AADHAAR', pattern: /(?<![\w+-])[2-9][0-9]{3}[ -]?[0-9]{4}[ -]?[0-9]{4}(?![\w-])/g },
  // Indian mobile, optionally +91.
  { id: 'MOBILE', pattern: /(?<![\w+-])(?:\+91[ -]?)?[6-9][0-9]{9}(?![\w-])/g },
  // A local part must end in a plain character, so masked forms like r•••@x.com do not match.
  { id: 'EMAIL', pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g },
];

const SCANNED_EXTENSIONS: ReadonlySet<string> = new Set(['.log', '.txt', '.json', '.ndjson']);

export function findPiiInLine(text: string): Array<Pick<PiiFinding, 'rule' | 'sample'>> {
  const out: Array<Pick<PiiFinding, 'rule' | 'sample'>> = [];
  for (const rule of PII_RULES) {
    for (const match of text.matchAll(rule.pattern)) {
      out.push({ rule: rule.id, sample: `${match[0].slice(0, 2)}***` });
    }
  }
  return out;
}

/** PowerShell 5.1 `>` writes UTF-16LE with a BOM; everything else is read as UTF-8. */
export function decodeLog(bytes: Buffer): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return bytes.subarray(2).toString('utf16le');
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return bytes.subarray(3).toString('utf8');
  }
  return bytes.toString('utf8');
}

export function scanText(
  path: string,
  text: string,
  marker: string | undefined,
): { linesScanned: number; findings: PiiFinding[] } {
  const findings: PiiFinding[] = [];
  let linesScanned = 0;
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    // With a marker, only the text after it is the server's; turbo and reporter output come before.
    const at = marker === undefined ? 0 : raw.indexOf(marker);
    if (at < 0) continue;
    const logged = marker === undefined ? raw : raw.slice(at + marker.length);
    linesScanned += 1;
    for (const hit of findPiiInLine(logged)) findings.push({ path, line: index + 1, ...hit });
  }
  return { linesScanned, findings };
}

function listFiles(path: string): string[] {
  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(path);
  } catch {
    return [];
  }
  if (stat.isFile()) return SCANNED_EXTENSIONS.has(extname(path).toLowerCase()) ? [path] : [];
  if (!stat.isDirectory()) return [];
  return readdirSync(path)
    .sort()
    .flatMap((entry) => listFiles(join(path, entry)));
}

export function scanPaths(
  paths: readonly string[],
  marker: string | undefined,
): { filesScanned: number; linesScanned: number; findings: PiiFinding[] } {
  const findings: PiiFinding[] = [];
  let filesScanned = 0;
  let linesScanned = 0;
  for (const file of paths.flatMap(listFiles)) {
    const result = scanText(file, decodeLog(readFileSync(file)), marker);
    filesScanned += 1;
    linesScanned += result.linesScanned;
    findings.push(...result.findings);
  }
  return { filesScanned, linesScanned, findings };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const markerArg = args.find((a) => a.startsWith('--marker='));
  const marker = markerArg?.slice('--marker='.length);
  const paths = args.filter((a) => !a.startsWith('--'));
  if (paths.length === 0) {
    process.stderr.write(
      'usage: node scripts/scan-pii-logs.ts [--marker=<text>] <file-or-dir> [...]\n',
    );
    process.exitCode = 2;
  } else {
    const { filesScanned, linesScanned, findings } = scanPaths(paths, marker);
    for (const f of findings)
      process.stderr.write(`${f.path}:${f.line}: [${f.rule}] ${f.sample}\n`);
    if (linesScanned === 0) {
      process.stderr.write(
        'scan-pii-logs: no log lines scanned; a missing or empty server log is not a pass (G-E3).\n',
      );
      process.exitCode = 2;
    } else if (findings.length > 0) {
      process.stderr.write(
        `scan-pii-logs: ${findings.length} PII-shaped value(s) in ${filesScanned} file(s) (G-E3). Log a masked value or a redacted key instead.\n`,
      );
      process.exitCode = 1;
    } else {
      process.stdout.write(
        `scan-pii-logs: ${linesScanned} lines in ${filesScanned} file(s), no PII-shaped values\n`,
      );
    }
  }
}
