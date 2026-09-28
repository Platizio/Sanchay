import { randomUUID } from 'node:crypto';
import {
  SenderUnavailableError,
  type SendResult,
  type SmsMessage,
  type SmsSender,
} from './port.js';

export type MailpitFetch = (url: string, init: RequestInit) => Promise<Response>;

const defaultFetch: MailpitFetch = (url, init) => fetch(url, init);

export interface MailpitPayload {
  From: { Email: string; Name: string };
  To: Array<{ Email: string }>;
  Subject: string;
  Text: string;
}

/** POST /api/v1/send (Mailpit v1 send API). Non-2xx or network failure → SenderUnavailableError. */
export async function sendViaMailpit(
  baseUrl: string,
  fetchImpl: MailpitFetch,
  payload: MailpitPayload,
): Promise<SendResult> {
  let res: Response;
  try {
    res = await fetchImpl(new URL('/api/v1/send', baseUrl).toString(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (cause) {
    throw new SenderUnavailableError('mailpit: request failed', { cause });
  }
  if (!res.ok) throw new SenderUnavailableError(`mailpit: HTTP ${res.status}`);
  const body = (await res.json()) as { ID?: string; id?: string };
  return { provider: null, messageId: body.ID ?? body.id ?? `mailpit-${randomUUID()}` };
}

export function latestCodeIn(
  outbox: ReadonlyArray<{ to: string; text: string }>,
  to: string,
): string | null {
  const last = [...outbox].reverse().find((m) => m.to === to);
  return last?.text.match(/\b(\d{6})\b/)?.[1] ?? null;
}

/** In-memory test double. The B2 boot guard refuses capture providers in staging and prod. */
export class CaptureSmsSender implements SmsSender {
  readonly outbox: Array<SmsMessage & { messageId: string }> = [];
  failNext = false;

  async send(message: SmsMessage): Promise<SendResult> {
    if (this.failNext) {
      this.failNext = false;
      throw new SenderUnavailableError('capture: simulated SMS outage');
    }
    const messageId = `capture-${randomUUID()}`;
    this.outbox.push({ ...message, messageId });
    return { provider: null, messageId };
  }

  latestCode(to: string): string {
    const code = latestCodeIn(this.outbox, to);
    if (code === null) throw new Error(`CaptureSmsSender: no code sent to ${to}`);
    return code;
  }
}

/** Local dev and e2e: the SMS lands in Mailpit as sms-<mobile>@sanchay.local (http://localhost:8025). */
export class MailpitSmsSender implements SmsSender {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: MailpitFetch = defaultFetch,
  ) {}

  send(message: SmsMessage): Promise<SendResult> {
    return sendViaMailpit(this.baseUrl, this.fetchImpl, {
      From: { Email: 'sms-gateway@sanchay.local', Name: 'Sanchay SMS (local)' },
      To: [{ Email: `sms-${message.to}@sanchay.local` }],
      Subject: `SMS [${message.templateId}]`,
      Text: message.text,
    });
  }
}
