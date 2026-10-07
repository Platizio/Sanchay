import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { SenderUnavailableError, type SendResult } from '../sms/port.js';
import type { EmailMessage, EmailSender } from './port.js';

/** SES v2, ap-south-1, task-role credentials (the client's default provider chain; no keys in env). */
export class SesEmailSender implements EmailSender {
  constructor(
    private readonly from: string,
    private readonly client: SESv2Client = new SESv2Client({ region: 'ap-south-1' }),
  ) {}

  async send(message: EmailMessage): Promise<SendResult> {
    try {
      const result = await this.client.send(
        new SendEmailCommand({
          FromEmailAddress: this.from,
          Destination: { ToAddresses: [message.to] },
          Content: {
            Simple: {
              Subject: { Data: message.subject, Charset: 'UTF-8' },
              Body: { Text: { Data: message.text, Charset: 'UTF-8' } },
            },
          },
        }),
      );
      return { provider: 'SES', messageId: result.MessageId ?? '' };
    } catch (cause) {
      // MF-2: an SES sandbox MessageRejected names the recipient, so keep only the error name and HTTP status,
      // and attach no cause (it would reach the pino err output and pgboss.job.output).
      const { name, $metadata } = cause as {
        name?: string;
        $metadata?: { httpStatusCode?: number };
      };
      const detail = [name, $metadata?.httpStatusCode]
        .filter((part) => part !== undefined)
        .join(' ');
      throw new SenderUnavailableError(
        detail === '' ? 'ses: send failed' : `ses: send failed (${detail})`,
      );
    }
  }
}
