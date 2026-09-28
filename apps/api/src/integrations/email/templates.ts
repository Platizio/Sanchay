export const EMAIL_TEMPLATE_IDS = { OTP: 'SANCHAY_EMAIL_OTP_V1' } as const;

/** Email OTP purposes active in the MVP (H-4): VERIFY_EMAIL (S2) and CONSENT (S3). */
export type EmailOtpPurpose = 'VERIFY_EMAIL' | 'CONSENT';

const EMAIL_ACTION: Record<EmailOtpPurpose, string> = {
  VERIFY_EMAIL: 'verify your email address',
  CONSENT: 'approve your transaction',
};

export function emailOtpMessage(
  code: string,
  purpose: EmailOtpPurpose,
): { subject: string; text: string } {
  return {
    subject: 'Your Sanchay verification code',
    text: `${code} is your code to ${EMAIL_ACTION[purpose]}. It expires in 5 minutes. Never share it; Sanchay staff never ask for it.`,
  };
}
