import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

/**
 * Round-2 addition (batch C12-C15, round 2): the plan-mandated on-device
 * `maestro test apps/mobile/.maestro -e MAILPIT_URL=http://localhost:8025` gate,
 * reporting `2/2 Flows Passed` against a real Android emulator with the C14 debug
 * build, still cannot execute in this sandbox. Re-confirmed unchanged from round 1:
 * `adb`, `maestro`, `emulator` and `$ANDROID_HOME` are all still absent here. That
 * is an environment gap (no Android SDK/emulator), not a code defect, and no test
 * can fabricate a device run — this file does not attempt to.
 *
 * What round 1's governance test did not yet do is run the two Maestro scripts'
 * actual logic — it only checked that they parse (`node --check`). This file
 * executes them for real, via `node:vm`, against Maestro's documented script-host
 * contract (`output`, `http.get`, `json`, and the injected `MOBILE`/`MAILPIT_URL`
 * env vars), proving `read-otp.js`'s polling/regex extraction and
 * `new-mobile.js`'s mobile-number generation actually work, not just parse.
 *
 * `http.get` is stubbed in-process (a plain function returning canned
 * `{status, body}` pairs), not routed through a real socket or subprocess: a
 * first attempt at this test spun up a real local HTTP server and shelled out to
 * curl for a synchronous client, and that hung indefinitely in this sandbox (no
 * CPU activity, no TCP connection ever established — consistent with an
 * interactive OS-level prompt, e.g. Windows Defender Firewall, blocking curl's
 * first outbound loopback connection in a non-interactive session). The actual
 * network round-trip is Maestro's own script host's job, not this script's; what
 * this file verifies is read-otp.js's own logic once it gets a response.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const maestroDir = resolve(repoRoot, 'apps/mobile/.maestro');
const newMobileScript = readFileSync(resolve(maestroDir, 'scripts/new-mobile.js'), 'utf8');
const readOtpScript = readFileSync(resolve(maestroDir, 'scripts/read-otp.js'), 'utf8');

/** Runs a Maestro script body in a fresh vm context and returns its `output` object. */
function runMaestroScript(
  script: string,
  globals: Record<string, unknown>,
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  const context = createContext({ output, json: JSON.parse, console, ...globals });
  runInContext(script, context, { filename: 'maestro-script.js' });
  return output;
}

/** A Mailpit message, as `read-otp.js` fetches it: a search hit plus its body. */
interface MailpitFixture {
  id: string;
  text: string;
}

/** An in-process http.get(url) stub matching Maestro's synchronous script-host contract. */
function mailpitHttpStub(latest: MailpitFixture | null) {
  const calls: string[] = [];
  const get = (url: string): { status: number; body: string } => {
    calls.push(url);
    if (url.includes('/api/v1/search')) {
      return {
        status: 200,
        body: JSON.stringify({ messages: latest ? [{ ID: latest.id }] : [] }),
      };
    }
    const found = latest && url.endsWith(`/api/v1/message/${latest.id}`);
    return {
      status: found ? 200 : 404,
      body: found ? JSON.stringify({ Text: latest?.text }) : '{}',
    };
  };
  return { get, calls };
}

describe('C15 Maestro scripts: real execution (on-device 2/2 run still deferred, no emulator in this sandbox)', () => {
  it('new-mobile.js sets a fresh, valid Indian mobile (^[6-9][0-9]{9}$) starting with 9', () => {
    const out = runMaestroScript(newMobileScript, {});
    expect(out.mobile).toMatch(/^9[0-9]{9}$/);
  });

  it('read-otp.js extracts the code from the WebOTP line, ignoring an unrelated 6-digit number earlier in the text', () => {
    const stub = mailpitHttpStub({
      id: 'msg-1',
      text: 'Your reference is 000111.\n222333 is unrelated.\n@app.sanchay.in #654321',
    });
    const out = runMaestroScript(readOtpScript, {
      MOBILE: '9998887771',
      MAILPIT_URL: 'http://mailpit.invalid',
      http: stub,
    });
    expect(out.otp).toBe('654321');
    // Both endpoints were actually called, in order: search, then the message fetch.
    expect(stub.calls[0]).toContain('/api/v1/search');
    expect(stub.calls[0]).toContain(encodeURIComponent('sms-9998887771@sanchay.local'));
    expect(stub.calls[1]).toBe('http://mailpit.invalid/api/v1/message/msg-1');
  });

  it('read-otp.js polls again when the search finds nothing yet, then succeeds once a message appears', () => {
    let searchCount = 0;
    const get = (url: string): { status: number; body: string } => {
      if (url.includes('/api/v1/search')) {
        searchCount += 1;
        // The first two polls find nothing; the third finds the message.
        const found = searchCount >= 3;
        return { status: 200, body: JSON.stringify({ messages: found ? [{ ID: 'msg-2' }] : [] }) };
      }
      return { status: 200, body: JSON.stringify({ Text: '@app.sanchay.in #111222' }) };
    };
    const out = runMaestroScript(readOtpScript, {
      MOBILE: '9998887773',
      MAILPIT_URL: 'http://mailpit.invalid',
      http: { get },
    });
    expect(out.otp).toBe('111222');
    expect(searchCount).toBe(3);
  });

  it('read-otp.js throws instead of setting output.otp when the search endpoint never returns 200', () => {
    const get = (): { status: number; body: string } => ({ status: 500, body: '' });
    // read-otp.js's own deadline is a real 15s wall-clock budget; this exercises the failure
    // path within that budget rather than re-implementing a shorter one.
    expect(() =>
      runMaestroScript(readOtpScript, {
        MOBILE: '9998887772',
        MAILPIT_URL: 'http://mailpit.invalid',
        http: { get },
      }),
    ).toThrow(/No OTP SMS for 9998887772/);
  }, 20_000);
});
