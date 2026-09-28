/**
 * en-IN form copy for schema issues. API error codes (ERROR_CATALOGUE in @sanchay/contract, H-10)
 * travel separately in `params.code` (see amount.ts); UI screens may show their own copy instead.
 */
export const VALIDATION_MESSAGES = {
  PAN_INVALID: 'Enter a valid PAN, for example ABCDE1234F.',
  MOBILE_INVALID: 'Enter a valid 10-digit Indian mobile number.',
  MOBILE_REPEATED_DIGITS: 'This does not look like a real mobile number.',
  EMAIL_INVALID: 'Enter a valid email address.',
  EMAIL_TOO_LONG: 'Email address must be 254 characters or fewer.',
  IFSC_INVALID: 'Enter a valid 11-character IFSC, for example HDFC0001234.',
  PINCODE_INVALID: 'Enter a valid 6-digit PIN code.',
  OTP_INVALID: 'Enter the 6-digit code.',
  AMOUNT_INVALID: 'Enter an amount in rupees with up to 2 decimal places.',
  AMOUNT_NOT_POSITIVE: 'Enter an amount greater than zero.',
  MONEY_WIRE_INVALID: 'Expected a money string with exactly 2 decimal places.',
  UNITS_WIRE_INVALID: 'Expected a units string with exactly 3 decimal places.',
  EXTERNAL_UNITS_WIRE_INVALID: 'Expected a units string with exactly 4 decimal places.',
  NAV_WIRE_INVALID: 'Expected a NAV string with exactly 6 decimal places.',
} as const;
