import type { SendResult } from '../sms/port.js';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  templateId: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<SendResult>;
}

export const EMAIL_SENDER = Symbol('EMAIL_SENDER');
