/**
 * G-E6 evidence collector (spec §7; F25). Runs adb against the one connected Android device and appends a
 * PASS/FAIL section with the raw command output to the evidence file. Run with plain Node 24:
 *
 *   node scripts/android-evidence.ts device
 *   node scripts/android-evidence.ts app-links
 *   node scripts/android-evidence.ts secure --screen <otp|consent|bank|...>
 *   node scripts/android-evidence.ts screenshot --screen <name> --dir <folder outside the repo>
 *
 * `--out <file>` overrides the evidence file (default docs/probes/g-e6-android-<yyyy-mm-dd>.md).
 * Exit code 1 when a check fails. Screenshots are never written inside the repository: the screens can show
 * real investor data; only their sha256 goes into the evidence file.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import process from 'node:process';

export const APP_ID = 'in.sanchay.app';
export const APP_LINK_HOST = 'app.sanchay.in';

export interface Section {
  title: string;
  pass: boolean;
  command: string;
  output: string;
  at: string;
  notes: string[];
}

/** `adb shell pm get-app-links <pkg>` (Android 12+): `<domain>: <state>` lines under "Domain verification state:". */
export function parseAppLinks(output: string): Record<string, string> {
  const result: Record<string, string> = {};
  let inStates = false;
  for (const line of output.split(/\r?\n/)) {
    if (/^\s*Domain verification state:\s*$/.test(line)) {
      inStates = true;
      continue;
    }
    if (!inStates) continue;
    const m = /^\s+([a-z0-9.-]+\.[a-z]{2,}):\s*(\S+)\s*$/i.exec(line);
    if (m?.[1] !== undefined && m[2] !== undefined) result[m[1]] = m[2];
    else if (line.trim() !== '') inStates = false;
  }
  return result;
}

/** `adb shell pm list packages -i <pkg>`: `package:<pkg>  installer=<installer>`. */
export function parseInstaller(output: string): string | null {
  const m = /installer=(\S+)/.exec(output);
  return m?.[1] ?? null;
}

/** `adb shell dumpsys package <pkg>`: the first versionName and versionCode. */
export function parseVersion(output: string): {
  versionName: string | null;
  versionCode: string | null;
} {
  return {
    versionName: /versionName=(\S+)/.exec(output)?.[1] ?? null,
    versionCode: /versionCode=(\d+)/.exec(output)?.[1] ?? null,
  };
}

/**
 * `adb shell dumpsys window windows`: the focused window's component and its `fl=` flags (FLAG_SECURE shows
 * as `SECURE`). Only the focused window's own block is read, so another window's SECURE is never borrowed.
 */
export function focusedWindowFlags(output: string): { component: string | null; flags: string[] } {
  const focus = /mCurrentFocus=Window\{(\S+) \S+ ([^}\s]+)\}/.exec(output);
  const token = focus?.[1];
  const component = focus?.[2];
  if (token === undefined || component === undefined) return { component: null, flags: [] };
  const lines = output.split(/\r?\n/);
  const start = lines.findIndex(
    (l) => /^\s*Window #\d+ Window\{/.test(l) && l.includes(`Window{${token} `),
  );
  if (start === -1) return { component, flags: [] };
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (/^\s*Window #\d+ /.test(line) || /^\s*mCurrentFocus=/.test(line)) break;
    const fl = /(?:^|\s)fl=([^\n]*)$/.exec(line);
    if (fl?.[1] !== undefined) return { component, flags: fl[1].trim().split(/\s+/) };
  }
  return { component, flags: [] };
}

export function isInside(path: string, root: string): boolean {
  const rel = relative(resolve(root), resolve(path));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

export function renderSection(s: Section): string {
  const notes = s.notes.map((n) => `- ${n}`).join('\n');
  return [
    `## ${s.title}: ${s.pass ? 'PASS' : 'FAIL'} (${s.at})`,
    '',
    notes,
    '',
    '```',
    `$ ${s.command}`,
    s.output.trimEnd(),
    '```',
    '',
  ].join('\n');
}

function istNow(): string {
  const t = new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 19);
  return `${t}+05:30`;
}

function adb(args: string[]): string {
  return execFileSync('adb', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
}

function argValue(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i === -1 ? undefined : argv[i + 1];
}

function header(): string {
  return [
    '# G-E6 Android evidence',
    '',
    `App: \`${APP_ID}\` from Play internal testing. Collected with \`node scripts/android-evidence.ts\` (F25).`,
    'Screenshots live outside the repository; only their sha256 is recorded here.',
    '',
    '## Manual checks (tick, add time and initials)',
    '',
    '- [ ] Payment return: a canary UPI payment returns into the app on `/app/r/payment` (E24), not the browser.',
    '- [ ] Mandate return (GO-2 only): the UPI Autopay mandate return lands on `/app/r/mandate` (F12).',
    '- [ ] App lock (H-13): with a screen lock, cold start and a return after 5 minutes in the background ask for device auth.',
    '- [ ] No screen lock (H-13, D-18): cold start signs out and asks for a fresh OTP.',
    '- [ ] FLAG_SECURE: the OTP, consent and bank screenshots below are black.',
    '',
  ].join('\n');
}

function collect(step: string, argv: string[], repoRoot: string): Section {
  const at = istNow();
  if (step === 'device') {
    const installerOut = adb(['shell', 'pm', 'list', 'packages', '-i', APP_ID]);
    const versionOut = adb(['shell', 'dumpsys', 'package', APP_ID]);
    const model = adb(['shell', 'getprop', 'ro.product.model']).trim();
    const release = adb(['shell', 'getprop', 'ro.build.version.release']).trim();
    const installer = parseInstaller(installerOut);
    const { versionName, versionCode } = parseVersion(versionOut);
    return {
      title: 'Device and build',
      pass: installer === 'com.android.vending',
      command: `adb shell pm list packages -i ${APP_ID}`,
      output: installerOut,
      at,
      notes: [
        `installer: ${installer ?? 'not installed'} (Play internal testing installs through com.android.vending)`,
        `versionName ${versionName ?? '?'}, versionCode ${versionCode ?? '?'}`,
        `device: ${model}, Android ${release}`,
      ],
    };
  }
  if (step === 'app-links') {
    const out = adb(['shell', 'pm', 'get-app-links', APP_ID]);
    const state = parseAppLinks(out)[APP_LINK_HOST];
    return {
      title: 'App Links',
      pass: state === 'verified',
      command: `adb shell pm get-app-links ${APP_ID}`,
      output: out,
      at,
      notes: [`${APP_LINK_HOST}: ${state ?? 'absent'}`],
    };
  }
  if (step === 'secure') {
    const screen = argValue(argv, '--screen');
    if (screen === undefined)
      throw new Error('secure needs --screen <name> (open that screen on the device first)');
    const out = adb(['shell', 'dumpsys', 'window', 'windows']);
    const { component, flags } = focusedWindowFlags(out);
    const ours = component?.startsWith(`${APP_ID}/`) ?? false;
    const focusLine = out.split(/\r?\n/).find((l) => l.includes('mCurrentFocus=')) ?? '';
    return {
      title: `FLAG_SECURE on ${screen}`,
      pass: ours && flags.includes('SECURE'),
      command: 'adb shell dumpsys window windows',
      output: `${focusLine.trim()}\nfl=${flags.join(' ')}`,
      at,
      notes: [
        `focused: ${component ?? 'none'}`,
        `SECURE flag: ${flags.includes('SECURE') ? 'set' : 'not set'}`,
      ],
    };
  }
  if (step === 'screenshot') {
    const screen = argValue(argv, '--screen');
    const dir = argValue(argv, '--dir');
    if (screen === undefined || dir === undefined)
      throw new Error('screenshot needs --screen <name> --dir <folder>');
    if (isInside(dir, repoRoot))
      throw new Error(
        'screenshot --dir must be outside the repository (screens can show investor data)',
      );
    mkdirSync(dir, { recursive: true });
    const png = execFileSync('adb', ['exec-out', 'screencap', '-p'], {
      maxBuffer: 64 * 1024 * 1024,
    });
    const file = join(dir, `g-e6-${screen}-${at.slice(0, 19).replace(/:/g, '')}.png`);
    writeFileSync(file, png);
    const sha = createHash('sha256').update(png).digest('hex');
    return {
      title: `Screenshot ${screen}`,
      pass: png.length > 0,
      command: 'adb exec-out screencap -p',
      output: `${png.length} bytes, sha256 ${sha}`,
      at,
      notes: [`stored outside the repo as ${file.split(/[\\/]/).pop() ?? file}`, `sha256 ${sha}`],
    };
  }
  throw new Error(`unknown step "${step}" (device | app-links | secure | screenshot)`);
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const step = argv[0] ?? '';
  const repoRoot = process.cwd();
  const out =
    argValue(argv, '--out') ?? join('docs', 'probes', `g-e6-android-${istNow().slice(0, 10)}.md`);
  const section = collect(step, argv, repoRoot);
  mkdirSync(dirname(out), { recursive: true });
  if (!existsSync(out)) writeFileSync(out, header());
  appendFileSync(out, `\n${renderSection(section)}`);
  process.stdout.write(`${section.title}: ${section.pass ? 'PASS' : 'FAIL'} -> ${out}\n`);
  if (!section.pass) process.exitCode = 1;
}
