import { type DynamicModule, Global, Module } from '@nestjs/common';
import type { Env } from '../config/env.js';
import { CaptureEmailSender, MailpitEmailSender } from './email/fake.js';
import { EMAIL_SENDER } from './email/port.js';
import { CaptureSmsSender, MailpitSmsSender } from './sms/fake.js';
import { SMS_SENDER } from './sms/port.js';

/** SANCHAY_PROVIDER_MODE_* selects the adapter. The S2 kernel (plan-02-mvp-kernel) adds msg91 and ses. */
@Global()
@Module({})
export class IntegrationsModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: IntegrationsModule,
      providers: [
        {
          provide: SMS_SENDER,
          useFactory: () =>
            env.SANCHAY_PROVIDER_MODE_SMS === 'mailpit'
              ? new MailpitSmsSender(env.SANCHAY_MAILPIT_URL)
              : new CaptureSmsSender(),
        },
        {
          provide: EMAIL_SENDER,
          useFactory: () =>
            env.SANCHAY_PROVIDER_MODE_EMAIL === 'mailpit'
              ? new MailpitEmailSender(env.SANCHAY_MAILPIT_URL)
              : new CaptureEmailSender(),
        },
      ],
      exports: [SMS_SENDER, EMAIL_SENDER],
    };
  }
}
