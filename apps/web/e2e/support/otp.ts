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
  messages: Array<{ ID: string; Created: string }>;
}
interface MailpitMessage {
  Text: string;
}

/** Reads the newest OTP SMS that the API's MailpitSmsSender delivered to sms-<mobile>@sanchay.local. */
export async function readLatestOtp(
  request: APIRequestContext,
  mobile: string,
  sinceMs: number,
): Promise<string> {
  let code = '';
  await expect
    .poll(
      async () => {
        const search = await request.get(`${MAILPIT_URL}/api/v1/search`, {
          params: { query: `to:"sms-${mobile}@sanchay.local"`, limit: '1' },
        });
        if (!search.ok()) return '';
        const { messages } = (await search.json()) as MailpitSearch;
        const latest = messages[0];
        if (!latest || Date.parse(latest.Created) < sinceMs - CLOCK_SKEW_TOLERANCE_MS) return '';
        const message = await request.get(`${MAILPIT_URL}/api/v1/message/${latest.ID}`);
        if (!message.ok()) return '';
        const { Text } = (await message.json()) as MailpitMessage;
        code = /\b(\d{6})\b/.exec(Text)?.[1] ?? '';
        return code;
      },
      { timeout: 15_000, message: 'Mailpit never received an OTP SMS for the test mobile' },
    )
    .toMatch(/^\d{6}$/);
  return code;
}
