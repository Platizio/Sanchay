import { randomUUID } from 'node:crypto';
import { latestCodeIn, type MailpitFetch, sendViaMailpit } from '../sms/fake.js';
import { SenderUnavailableError, type SendResult } from '../sms/port.js';
import type { EmailMessage, EmailSender } from './port.js';

const defaultFetch: MailpitFetch = (url, init) => fetch(url, init);

export class CaptureEmailSender implements EmailSender {
  readonly outbox: Array<EmailMessage & { messageId: string }> = [];
  failNext = false;

  async send(message: EmailMessage): Promise<SendResult> {
    if (this.failNext) {
      this.failNext = false;
      throw new SenderUnavailableError('capture: simulated email outage');
    }
    const messageId = `capture-${randomUUID()}`;
    this.outbox.push({ ...message, messageId });
    return { provider: null, messageId };
  }

  latestCode(to: string): string {
    const code = latestCodeIn(this.outbox, to);
    if (code === null) throw new Error(`CaptureEmailSender: no code sent to ${to}`);
    return code;
  }
}

export class MailpitEmailSender implements EmailSender {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: MailpitFetch = defaultFetch,
  ) {}

  send(message: EmailMessage): Promise<SendResult> {
    return sendViaMailpit(this.baseUrl, this.fetchImpl, {
      From: { Email: 'noreply@sanchay.local', Name: 'Sanchay (local)' },
      To: [{ Email: message.to }],
      Subject: message.subject,
      Text: message.text,
    });
  }
}
