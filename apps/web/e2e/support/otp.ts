import { type APIRequestContext, expect } from '@playwright/test';

export const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025';

/**
 * Mailpit stamps `Created` with the Docker VM clock, which can drift from the host.
 * 10 s of tolerance is safe because the only older message for a mobile is at least
 * 30 s older (the H-3 resend cooldown).
 */
const CLOCK_SKEW_TOLERANCE_MS = 10_000;

export function uniqueTestMobile(): string {
  const stamp = String(Date.now()).slice(-6);
  const random = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `9${stamp}${random}`;
}

interface MailpitSearch {
  messages: Array<{ ID: string; Created: string; Subject: string }>;
}
interface MailpitMessage {
  Text: string;
}

/** How many of the newest messages for a recipient are scanned when a template filter is set. */
const TEMPLATE_SCAN_LIMIT = 10;

/**
 * Reads the newest OTP SMS that the API's MailpitSmsSender delivered to sms-<mobile>@sanchay.local.
 * `template` (e.g. 'SANCHAY_ATTEST_OTP_V1') keeps a login SMS sent just before an attest SMS from
 * being read as the attest code (the clock-skew tolerance would otherwise admit it).
 */
export async function readLatestOtp(
  request: APIRequestContext,
  mobile: string,
  sinceMs: number,
  template?: string,
): Promise<string> {
  return readLatestOtpTo(request, `sms-${mobile}@sanchay.local`, sinceMs, template);
}

/**
 * The newest six-digit code Mailpit holds for `to`: an email OTP's address, or an SMS mailbox.
 * With `template`, only messages whose Subject contains it count (SMS subjects read
 * 'SMS [SANCHAY_<TEMPLATE>_V1]'); filtered in code because a Mailpit subject search with a space
 * did not match reliably.
 */
export async function readLatestOtpTo(
  request: APIRequestContext,
  to: string,
  sinceMs: number,
  template?: string,
): Promise<string> {
  let code = '';
  await expect
    .poll(
      async () => {
        const search = await request.get(`${MAILPIT_URL}/api/v1/search`, {
          params: { query: `to:"${to}"`, limit: template ? String(TEMPLATE_SCAN_LIMIT) : '1' },
        });
        if (!search.ok()) return '';
        const { messages } = (await search.json()) as MailpitSearch;
        const latest = template ? messages.find((m) => m.Subject.includes(template)) : messages[0];
        if (!latest || Date.parse(latest.Created) < sinceMs - CLOCK_SKEW_TOLERANCE_MS) return '';
        const message = await request.get(`${MAILPIT_URL}/api/v1/message/${latest.ID}`);
        if (!message.ok()) return '';
        const { Text } = (await message.json()) as MailpitMessage;
        code = /\b(\d{6})\b/.exec(Text)?.[1] ?? '';
        return code;
      },
      { timeout: 15_000, message: `Mailpit never received an OTP for ${to}` },
    )
    .toMatch(/^\d{6}$/);
  return code;
}
