import { describe, expect, it } from 'vitest';
import { EMAIL_TEMPLATE_IDS, emailOtpMessage } from './templates.js';

describe('email OTP template', () => {
  it('pins the template id and names the action per purpose', () => {
    expect(EMAIL_TEMPLATE_IDS).toEqual({ OTP: 'SANCHAY_EMAIL_OTP_V1' });
    expect(emailOtpMessage('654321', 'VERIFY_EMAIL')).toEqual({
      subject: 'Your Sanchay verification code',
      text: '654321 is your code to verify your email address. It expires in 5 minutes. Never share it; Sanchay staff never ask for it.',
    });
    expect(emailOtpMessage('654321', 'CONSENT').text).toBe(
      '654321 is your code to approve your transaction. It expires in 5 minutes. Never share it; Sanchay staff never ask for it.',
    );
  });

  it('keeps the code out of the subject', () => {
    expect(emailOtpMessage('654321', 'CONSENT').subject).not.toContain('654321');
  });
});
