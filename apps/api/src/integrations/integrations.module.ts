import { type DynamicModule, Global, Module } from '@nestjs/common';
import { type Env, parseMsg91CredentialsJson } from '../config/env.js';
import { CaptureEmailSender, MailpitEmailSender } from './email/fake.js';
import { EMAIL_SENDER } from './email/port.js';
import { SesEmailSender } from './email/ses.sender.js';
import { CaptureSmsSender, MailpitSmsSender } from './sms/fake.js';
import { Msg91SmsSender } from './sms/msg91.sender.js';
import { SMS_SENDER } from './sms/port.js';

/** SANCHAY_PROVIDER_MODE_* selects the adapter. D6 adds msg91 and ses alongside capture/mailpit. */
@Global()
@Module({})
export class IntegrationsModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: IntegrationsModule,
      providers: [
        {
          provide: SMS_SENDER,
          useFactory: () => {
            if (env.SANCHAY_PROVIDER_MODE_SMS === 'msg91') {
              return new Msg91SmsSender(
                parseMsg91CredentialsJson(env.SANCHAY_MSG91_CREDENTIALS_JSON),
              );
            }
            return env.SANCHAY_PROVIDER_MODE_SMS === 'mailpit'
              ? new MailpitSmsSender(env.SANCHAY_MAILPIT_URL)
              : new CaptureSmsSender();
          },
        },
        {
          provide: EMAIL_SENDER,
          useFactory: () => {
            if (env.SANCHAY_PROVIDER_MODE_EMAIL === 'ses') {
              // env.SANCHAY_SES_FROM is validated present by assertBootInvariants (invariant 12) before
              // this factory ever runs, so the '' fallback below is unreachable in a booted app.
              return new SesEmailSender(env.SANCHAY_SES_FROM ?? '');
            }
            return env.SANCHAY_PROVIDER_MODE_EMAIL === 'mailpit'
              ? new MailpitEmailSender(env.SANCHAY_MAILPIT_URL)
              : new CaptureEmailSender();
          },
        },
      ],
      exports: [SMS_SENDER, EMAIL_SENDER],
    };
  }
}
