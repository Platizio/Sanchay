import { describe, expect, it, vi } from 'vitest';
import { SenderUnavailableError } from '../sms/port.js';
import { SesEmailSender } from './ses.sender.js';

describe('SesEmailSender', () => {
  it('sends from SANCHAY_SES_FROM and returns the SES message id', async () => {
    const client = { send: vi.fn(async () => ({ MessageId: 'ses-msg-1', $metadata: {} })) };
    const sender = new SesEmailSender('noreply@sanchay.in', client as never);
    const result = await sender.send({
      to: 'investor@example.com',
      subject: 'Your Sanchay verification code',
      text: '123456 is your code...',
      templateId: 'SANCHAY_EMAIL_OTP_V1',
    });
    expect(result).toEqual({ provider: 'SES', messageId: 'ses-msg-1' });
    expect(client.send).toHaveBeenCalledOnce();
  });

  it('throws SenderUnavailableError when the SES client rejects', async () => {
    const client = {
      send: vi.fn(async () => {
        throw new Error('Throttling');
      }),
    };
    const sender = new SesEmailSender('noreply@sanchay.in', client as never);
    await expect(
      sender.send({ to: 'investor@example.com', subject: 's', text: 't', templateId: 'x' }),
    ).rejects.toThrow(SenderUnavailableError);
  });
});
