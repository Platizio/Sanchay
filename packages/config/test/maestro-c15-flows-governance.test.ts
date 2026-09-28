import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Review finding (batch C12-C15, round 1): the plan-mandated acceptance gate —
 * `maestro test apps/mobile/.maestro -e MAILPIT_URL=http://localhost:8025` reporting
 * `2/2 Flows Passed` against a real Android emulator with the C14 debug build — has never
 * executed in this sandbox. No Android SDK, adb, emulator or Maestro CLI is installed here,
 * the same gap already recorded for C13/C14, re-confirmed unchanged in round 1. No sandbox
 * trick can fabricate that run, so this lock does not attempt to.
 *
 * Instead it takes the batch report's one-off, hand-run static checks (YAML shape, script
 * syntax, and an independent grep of the testIDs/copy the flows assert against) and turns
 * them into a committed regression test that re-runs on every `pnpm turbo run test`. That
 * closes the part of the risk a static check *can* close — silent drift between the flows'
 * assumptions and the app's actual testIDs/copy/script — and converts "very likely correct,
 * unverified" from a one-time manual claim into a provable, repeatable one. The on-device
 * `2/2 Flows Passed` run itself stays an explicit open item for whoever has a real Android
 * emulator, exactly as the round-1 finding recommends; this test cannot and does not claim
 * to close it.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const maestroDir = resolve(repoRoot, 'apps/mobile/.maestro');

const subflow = readFileSync(resolve(maestroDir, 'subflows/sign-up.yaml'), 'utf8');
const signup = readFileSync(resolve(maestroDir, 'signup.yaml'), 'utf8');
const relaunch = readFileSync(resolve(maestroDir, 'relaunch-without-screen-lock.yaml'), 'utf8');
const readOtpScript = readFileSync(resolve(maestroDir, 'scripts/read-otp.js'), 'utf8');
const loginScreen = readFileSync(
  resolve(repoRoot, 'packages/features/src/auth/LoginScreen.tsx'),
  'utf8',
);
const welcomeScreen = readFileSync(
  resolve(repoRoot, 'packages/features/src/auth/WelcomeScreen.tsx'),
  'utf8',
);
const homeScreen = readFileSync(
  resolve(repoRoot, 'packages/features/src/home/HomeScreen.tsx'),
  'utf8',
);
const mobilePackageJson = JSON.parse(
  readFileSync(resolve(repoRoot, 'apps/mobile/package.json'), 'utf8'),
) as { scripts: Record<string, string> };

/** Splits `lines` on the first bare `---` line, Maestro's YAML-document separator. */
function splitOnSeparator(lines: string[]): [string[], string[]] {
  const index = lines.findIndex((line) => line.trim() === '---');
  return [lines.slice(0, index), index === -1 ? [] : lines.slice(index + 1)];
}

/**
 * True when `yamlText` is a well-formed single-flow Maestro document: exactly one bare `---`
 * separator, an `appId:` key before it, and at least one `- ` command after it.
 */
function isWellFormedMaestroFlow(yamlText: string): boolean {
  const lines = yamlText.split(/\r?\n/);
  const separatorCount = lines.filter((line) => line.trim() === '---').length;
  if (separatorCount !== 1) return false;
  const [header, body] = splitOnSeparator(lines);
  return (
    /^appId:\s*\S+/m.test(header.join('\n')) && body.some((line) => line.trim().startsWith('-'))
  );
}

describe('C15 Maestro flows: static governance (on-device 2/2 run deferred, no emulator in this sandbox)', () => {
  it('every flow and the subflow is a well-formed single-document Maestro YAML file', () => {
    expect(isWellFormedMaestroFlow(subflow)).toBe(true);
    expect(isWellFormedMaestroFlow(signup)).toBe(true);
    expect(isWellFormedMaestroFlow(relaunch)).toBe(true);
  });

  it('flags a missing appId header and a doubled document separator (RED demonstration)', () => {
    expect(isWellFormedMaestroFlow(subflow.replace('appId: in.sanchay.app\n', ''))).toBe(false);
    expect(isWellFormedMaestroFlow(`${subflow}---\n- tapOn: "x"\n`)).toBe(false);
    expect(isWellFormedMaestroFlow('appId: in.sanchay.app\n- tapOn: "x"\n')).toBe(false);
  });

  it("the subflow's testIDs and copy exist verbatim in LoginScreen", () => {
    expect(subflow).toContain('id: "mobile-input"');
    expect(subflow).toContain('id: "otp-input"');
    expect(loginScreen).toContain('testID="mobile-input"');
    expect(loginScreen).toContain('testID="otp-input"');
    expect(subflow).toContain('tapOn: "Get OTP"');
    expect(loginScreen).toContain('label="Get OTP"');
    expect(subflow).toContain('assertVisible: "Create your Sanchay account"');
    expect(loginScreen).toContain('Create your Sanchay account');
    expect(subflow).toContain('assertVisible: "Enter the 6-digit code sent to .*"');
    expect(loginScreen).toContain('Enter the 6-digit code sent to');
  });

  it('the "Create account" entry point exists verbatim on WelcomeScreen', () => {
    expect(subflow).toContain('tapOn: "Create account"');
    expect(welcomeScreen).toContain('label="Create account"');
    expect(relaunch).toContain('assertVisible: "Create account"');
  });

  it('signup.yaml asserts the Home copy that HomeScreen actually renders', () => {
    expect(signup).toContain('assertVisible: "Welcome to Sanchay"');
    expect(homeScreen).toContain('Welcome to Sanchay');
    expect(subflow).toContain('visible: "Signed in as ••••••.*"');
    expect(homeScreen).toContain('Signed in as');
  });

  it('flags subflow copy that has drifted from LoginScreen (RED demonstration)', () => {
    const driftedSubflow = subflow.replace(
      'assertVisible: "Create your Sanchay account"',
      'assertVisible: "Create your account"',
    );
    expect(loginScreen.includes('Create your account')).toBe(false);
    expect(driftedSubflow).not.toContain('assertVisible: "Create your Sanchay account"');
  });

  it('the flow scripts are syntactically valid JavaScript', () => {
    for (const script of ['new-mobile.js', 'read-otp.js']) {
      const result = spawnSync(process.execPath, [
        '--check',
        resolve(maestroDir, 'scripts', script),
      ]);
      expect(result.status, `node --check ${script} failed:\n${result.stderr.toString()}`).toBe(0);
    }
  });

  it('read-otp.js can only set output.otp from the Mailpit-derived match, never a hardcoded fallback (H-3, no bypass)', () => {
    const assignments = [...readOtpScript.matchAll(/output\.otp\s*=\s*([^;]+);/g)].map(
      (m) => m[1]?.trim() ?? '',
    );
    expect(assignments).toEqual(['code']);
    // No literal 6-digit code anywhere in the script (only the \d{6} pattern, never a value).
    expect(readOtpScript).not.toMatch(/(?<!\\d\{)\b\d{6}\b/);
  });

  it('apps/mobile/package.json exposes e2e:android exactly as the brief specifies, directly after export:android', () => {
    const keys = Object.keys(mobilePackageJson.scripts);
    expect(mobilePackageJson.scripts['e2e:android']).toBe('maestro test .maestro');
    expect(keys.indexOf('e2e:android')).toBe(keys.indexOf('export:android') + 1);
  });
});
