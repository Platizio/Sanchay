export interface SendResult {
  provider: 'MSG91' | 'SES' | null;
  messageId: string;
}

export interface SmsMessage {
  to: string;
  text: string;
  templateId: string;
}

export interface SmsSender {
  send(message: SmsMessage): Promise<SendResult>;
}

export const SMS_SENDER = Symbol('SMS_SENDER');

/** The provider could not accept the message. OtpService maps it to SMS_UNAVAILABLE / PROVIDER_UNAVAILABLE. */
export class SenderUnavailableError extends Error {
  override name = 'SenderUnavailableError';
}
