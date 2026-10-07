import { describe, expect, it, vi } from 'vitest';
import { Msg91SmsSender } from './msg91.sender.js';
import { SenderUnavailableError } from './port.js';

const credentials = {
  authKey: 'test-auth-key',
  senderId: 'SNCHAY',
  peId: '1701000000000000001',
  templateIds: {
    LOGIN: '1707000000000000001',
    CONSENT: '1707000000000000002',
    CONSENT_UNITS: '1707000000000000003',
    ATTEST: '1707000000000000004',
  },
};

describe('Msg91SmsSender', () => {
  it('maps our internal templateId to the MSG91 flow id and posts the request', async () => {
    const fetchImpl = vi.fn(
      async (_url: string, _init: RequestInit) =>
        new Response(JSON.stringify({ type: 'success', message: 'req-123' }), { status: 200 }),
    );
    const sender = new Msg91SmsSender(credentials, fetchImpl);
    const result = await sender.send({
      to: '9876543210',
      text: '123456 is your Sanchay login OTP...',
      templateId: 'SANCHAY_LOGIN_OTP_V1',
    });
    expect(result).toEqual({ provider: 'MSG91', messageId: 'req-123' });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://control.msg91.com/api/v5/flow/');
    expect((init.headers as Record<string, string>).authkey).toBe('test-auth-key');
    const body = JSON.parse(init.body as string) as { flow_id: string; mobiles: string };
    expect(body.flow_id).toBe('1707000000000000001');
    expect(body.mobiles).toBe('919876543210');
  });

  it('throws SenderUnavailableError for a templateId with no configured DLT flow', async () => {
    const sender = new Msg91SmsSender(credentials, vi.fn());
    await expect(
      sender.send({ to: '9876543210', text: 'x', templateId: 'UNKNOWN_TEMPLATE' }),
    ).rejects.toThrow(SenderUnavailableError);
  });

  it('throws SenderUnavailableError on a non-2xx response', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 500 }));
    const sender = new Msg91SmsSender(credentials, fetchImpl);
    await expect(
      sender.send({ to: '9876543210', text: 'x', templateId: 'SANCHAY_LOGIN_OTP_V1' }),
    ).rejects.toThrow(SenderUnavailableError);
  });

  it('throws SenderUnavailableError when MSG91 itself reports type: error', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ type: 'error', message: 'invalid mobile' }), { status: 200 }),
    );
    const sender = new Msg91SmsSender(credentials, fetchImpl);
    await expect(
      sender.send({ to: '9876543210', text: 'x', templateId: 'SANCHAY_LOGIN_OTP_V1' }),
    ).rejects.toThrow(SenderUnavailableError);
  });

  it('throws SenderUnavailableError when fetch itself rejects', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNRESET');
    });
    const sender = new Msg91SmsSender(credentials, fetchImpl);
    await expect(
      sender.send({ to: '9876543210', text: 'x', templateId: 'SANCHAY_LOGIN_OTP_V1' }),
    ).rejects.toThrow(SenderUnavailableError);
  });

  it('does not copy the provider message into the error (final review MF-2)', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ type: 'error', message: 'invalid mobile 9876543210' }), {
          status: 200,
        }),
    );
    const sender = new Msg91SmsSender(credentials, fetchImpl);
    const err = await sender
      .send({ to: '9876543210', text: 'x', templateId: 'SANCHAY_LOGIN_OTP_V1' })
      .then(
        () => new Error('did not reject'),
        (e: unknown) => e as Error,
      );
    expect(err).toBeInstanceOf(SenderUnavailableError);
    expect(err.message).toBe('msg91: provider error');
    expect(err.message).not.toContain('9876543210');
  });

  it('keeps only the error name when fetch rejects, with no cause (final review MF-2)', async () => {
    const fetchImpl = vi.fn(async () => {
      throw Object.assign(new Error('connect ECONNRESET 9876543210'), { name: 'FetchError' });
    });
    const sender = new Msg91SmsSender(credentials, fetchImpl);
    const err = await sender
      .send({ to: '9876543210', text: 'x', templateId: 'SANCHAY_LOGIN_OTP_V1' })
      .then(
        () => new Error('did not reject'),
        (e: unknown) => e as Error,
      );
    expect(err).toBeInstanceOf(SenderUnavailableError);
    expect(err.message).toBe('msg91: request failed (FetchError)');
    expect(err.cause).toBeUndefined();
  });
});
