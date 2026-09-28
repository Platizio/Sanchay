import { describe, expect, it, vi } from 'vitest';
import { CaptureEmailSender, MailpitEmailSender } from './email/fake.js';
import { CaptureSmsSender, MailpitSmsSender } from './sms/fake.js';
import { SenderUnavailableError } from './sms/port.js';

describe('CaptureSmsSender', () => {
  it('records messages and extracts the latest code per recipient', async () => {
    const sms = new CaptureSmsSender();
    await sms.send({ to: '9876543210', text: '111111 is your OTP', templateId: 'T' });
    const r = await sms.send({ to: '9876543210', text: '123456 is your OTP', templateId: 'T' });
    expect(r.provider).toBeNull();
    expect(r.messageId).toMatch(/^capture-/);
    expect(sms.outbox).toHaveLength(2);
    expect(sms.latestCode('9876543210')).toBe('123456');
    expect(() => sms.latestCode('9000000000')).toThrow(/no code sent to 9000000000/);
  });

  it('fails exactly once when failNext is set', async () => {
    const sms = new CaptureSmsSender();
    sms.failNext = true;
    await expect(sms.send({ to: '9876543210', text: 'x', templateId: 'T' })).rejects.toBeInstanceOf(
      SenderUnavailableError,
    );
    await expect(sms.send({ to: '9876543210', text: 'x', templateId: 'T' })).resolves.toMatchObject(
      {
        provider: null,
      },
    );
  });
});

describe('Mailpit senders', () => {
  it('POSTs SMS text to the Mailpit send API as sms-<mobile>@sanchay.local', async () => {
    const fetchImpl = vi.fn(
      async (_url: string, _init: RequestInit) =>
        new Response(JSON.stringify({ ID: 'mp-1' }), { status: 200 }),
    );
    const r = await new MailpitSmsSender('http://localhost:8025', fetchImpl).send({
      to: '9876543210',
      text: 'hi',
      templateId: 'SANCHAY_LOGIN_OTP_V1',
    });
    expect(r).toEqual({ provider: null, messageId: 'mp-1' });
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe('http://localhost:8025/api/v1/send');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      From: { Email: 'sms-gateway@sanchay.local', Name: 'Sanchay SMS (local)' },
      To: [{ Email: 'sms-9876543210@sanchay.local' }],
      Subject: 'SMS [SANCHAY_LOGIN_OTP_V1]',
      Text: 'hi',
    });
  });

  it('maps a non-2xx response to SenderUnavailableError', async () => {
    const fetchImpl = vi.fn(
      async (_url: string, _init: RequestInit) => new Response('nope', { status: 500 }),
    );
    await expect(
      new MailpitEmailSender('http://localhost:8025', fetchImpl).send({
        to: 'a@b.co',
        subject: 's',
        text: 't',
        templateId: 'T',
      }),
    ).rejects.toBeInstanceOf(SenderUnavailableError);
  });

  it('capture email extracts codes per recipient', async () => {
    const email = new CaptureEmailSender();
    await email.send({ to: 'a@b.co', subject: 's', text: '654321 is your code', templateId: 'T' });
    expect(email.latestCode('a@b.co')).toBe('654321');
  });
});
