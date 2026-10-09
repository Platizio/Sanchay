import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { parseEnv } from '../config/env.js';
import { CaptureEmailSender, MailpitEmailSender } from './email/fake.js';
import { EMAIL_SENDER } from './email/port.js';
import { SesEmailSender } from './email/ses.sender.js';
import { IntegrationsModule } from './integrations.module.js';
import { CaptureSmsSender, MailpitSmsSender } from './sms/fake.js';
import { Msg91SmsSender } from './sms/msg91.sender.js';
import { SMS_SENDER } from './sms/port.js';

const key = (fill: number): string => Buffer.alloc(32, fill).toString('base64');
const base = {
  SANCHAY_APP_ENV: 'test',
  DATABASE_URL: 'postgres://sanchay@localhost:55432/sanchay',
  SANCHAY_APP_ORIGIN: 'https://app.sanchay.test',
  SANCHAY_API_ORIGIN: 'https://api.sanchay.test',
  SANCHAY_PLATFORM_ARN: 'ARN-000000',
  SANCHAY_CLIENT_IP_SOURCE: 'socket',
  SANCHAY_KEY_SERVICE: 'local',
  SANCHAY_LOCAL_PII_KEY: key(1),
  SANCHAY_LOCAL_BIDX_KEY: key(2),
  SANCHAY_OTP_PEPPER: key(3),
  SANCHAY_AUTH_TOKEN_KEY: key(4),
};

async function senders(overrides: Record<string, string>) {
  const ref = await Test.createTestingModule({
    imports: [IntegrationsModule.forRoot(parseEnv({ ...base, ...overrides }))],
  }).compile();
  const out = { sms: ref.get<unknown>(SMS_SENDER), email: ref.get<unknown>(EMAIL_SENDER) };
  await ref.close();
  return out;
}

describe('IntegrationsModule.forRoot', () => {
  it('defaults to the capture senders', async () => {
    const { sms, email } = await senders({});
    expect(sms).toBeInstanceOf(CaptureSmsSender);
    expect(email).toBeInstanceOf(CaptureEmailSender);
  });

  it('selects the MSG91 and SES senders in msg91 and ses mode', async () => {
    const { sms, email } = await senders({
      SANCHAY_PROVIDER_MODE_SMS: 'msg91',
      SANCHAY_PROVIDER_MODE_EMAIL: 'ses',
      SANCHAY_MSG91_CREDENTIALS_JSON: JSON.stringify({
        authKey: 'test-auth-key',
        senderId: 'SNCHAY',
        peId: '1701000000000000001',
        templateIds: { LOGIN: '1', CONSENT: '2', CONSENT_UNITS: '3', ATTEST: '4' },
      }),
      SANCHAY_SES_FROM: 'noreply@sanchay.in',
    });
    expect(sms).toBeInstanceOf(Msg91SmsSender);
    expect(email).toBeInstanceOf(SesEmailSender);
  });

  it('selects the Mailpit senders in mailpit mode', async () => {
    const { sms, email } = await senders({
      SANCHAY_PROVIDER_MODE_SMS: 'mailpit',
      SANCHAY_PROVIDER_MODE_EMAIL: 'mailpit',
      SANCHAY_MAILPIT_URL: 'http://localhost:8025',
    });
    expect(sms).toBeInstanceOf(MailpitSmsSender);
    expect(email).toBeInstanceOf(MailpitEmailSender);
  });
});
