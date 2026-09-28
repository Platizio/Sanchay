export const DEFAULT_ERROR_MESSAGE = 'Something went wrong. Please try again.';

/**
 * Investor-facing copy for every ERROR_CATALOGUE code (@sanchay/contract, H-10) plus the
 * client-only NETWORK_ERROR. It never contains PII, and the server's `message` (which equals
 * the code) is never shown. A Map avoids prototype keys such as 'constructor'.
 * The catalogue is append-only: every new code needs a line here (enforced by foundation.test.ts).
 */
export const ERROR_COPY: ReadonlyMap<string, string> = new Map<string, string>([
  // 400
  ['VALIDATION_FAILED', 'Please check the details you entered and try again.'],
  // 401
  ['AUTH_REQUIRED', 'Please log in to continue.'],
  ['SESSION_EXPIRED', 'Your session has ended. Please log in again.'],
  ['OTP_INVALID', 'That code is incorrect. Check the SMS and try again.'],
  ['OTP_EXPIRED', 'This code has expired. Request a new code.'],
  ['OTP_LOCKED', 'Too many incorrect attempts. Request a new code.'],
  ['STEP_UP_REQUIRED', 'For your security, enter the code sent to your email.'],
  // 403
  ['FORBIDDEN', 'You do not have access to this.'],
  ['ORIGIN_REJECTED', 'Please refresh the page and try again.'],
  ['FEATURE_DISABLED', 'This feature is not available right now.'],
  [
    'PILOT_INVITE_REQUIRED',
    'Sanchay is invite-only right now. Please use the mobile number your invitation was sent to.',
  ],
  // 404
  ['NOT_FOUND', 'We could not find what you were looking for.'],
  // 409
  ['CONFLICT_VERSION', 'Something changed while you were signing in. Please try again.'],
  [
    'IDEMPOTENCY_IN_PROGRESS',
    'We are still processing your earlier request. Please wait a moment.',
  ],
  ['ORDER_STATE_INVALID', 'This order can no longer be changed.'],
  ['SCHEME_NOT_ORDERABLE', 'This fund is not accepting investments right now.'],
  ['ONBOARDING_INCOMPLETE', 'Please finish setting up your account first.'],
  ['PURCHASE_BLOCKED', 'New investments are paused on your account. Please contact support.'],
  ['EXIT_BLOCKED', 'Withdrawals are paused on your account. Please contact support.'],
  ['KYC_NOT_VALIDATED', 'Your KYC is not verified yet, so you cannot invest right now.'],
  ['BANK_NOT_VERIFIED', 'Your bank account is not verified yet.'],
  ['MANDATE_REQUIRED', 'Set up an autopay mandate to start this SIP.'],
  ['MANDATE_NOT_APPROVED', 'Your bank has not approved the autopay mandate yet.'],
  ['CONSENT_REQUIRED', 'Please confirm this transaction with the code we send you.'],
  ['CONSENT_EXPIRED', 'This confirmation has expired. Please start again.'],
  [
    'CONSENT_MISMATCH',
    'The details changed after you reviewed them. Please review and confirm again.',
  ],
  ['CONSENT_ALREADY_USED', 'This confirmation has already been used.'],
  [
    'CONSENT_DESTINATION_UNAVAILABLE',
    'We cannot send a confirmation code to your registered contact details. Please contact support.',
  ],
  ['SECOND_FACTOR_REQUIRED', 'Please enter the codes sent to your mobile and your email.'],
  ['PAYMENT_ATTEMPT_LIVE', 'A payment for this order is already in progress.'],
  ['PAYMENT_ALREADY_SUCCEEDED', 'This order has already been paid.'],
  ['REDEMPTION_CONFLICT_PENDING', 'You already have a withdrawal in progress for this fund.'],
  ['PLAN_ACTIVE_ON_HOLDING', 'An active SIP in this fund prevents this action.'],
  [
    'FOLIO_RECONCILIATION_REQUIRED',
    'We are updating your holdings in this fund. Please try again later.',
  ],
  [
    'COOLING_OFF_ACTIVE',
    'For your security, this is not available yet after a recent change to your account.',
  ],
  ['SERVICE_REQUEST_OPEN', 'You already have a request in progress for this.'],
  [
    'DECLARATION_OUTDATED',
    'Our terms have been updated. Please review and accept them to continue.',
  ],
  ['PLAN_NOT_MODIFIABLE', 'This SIP cannot be changed right now.'],
  [
    'SUITABILITY_CHANGED',
    'The fund risk level or your risk profile has changed. Please review the suitability note again.',
  ],
  ['RISK_PROFILE_EXPIRED', 'Your risk profile has expired. Please retake the risk questionnaire.'],
  [
    'RISK_PROFILE_STALE',
    'Your risk profile needs an update. Please retake the risk questionnaire.',
  ],
  // 422
  [
    'IDEMPOTENCY_KEY_REUSED',
    'This request was already sent with different details. Please start again.',
  ],
  ['AMOUNT_BELOW_MIN', 'The amount is below the minimum for this fund.'],
  ['AMOUNT_ABOVE_MAX', 'The amount is above the maximum allowed.'],
  ['AMOUNT_NOT_MULTIPLE', 'Enter an amount in the multiples this fund allows.'],
  ['UNITS_PRECISION', 'Units can have at most 3 decimal places.'],
  ['INSUFFICIENT_REDEEMABLE', 'You do not have enough units available to withdraw this amount.'],
  ['ELSS_LOCKED', 'These ELSS units are still in their 3-year lock-in.'],
  ['NAV_UNAVAILABLE', 'The latest NAV for this fund is not available yet. Please try again later.'],
  ['MANDATE_LIMIT_EXCEEDED', 'This SIP is above your autopay mandate limit.'],
  ['UPI_LIMIT_EXCEEDED', 'This amount is above the UPI limit. Please choose net banking.'],
  ['SIP_DAY_INVALID', 'Choose a SIP date this fund allows.'],
  ['NOMINATION_INVALID', 'Please check the nominee details. Shares must add up to 100%.'],
  ['ELIGIBILITY_BLOCKED', 'We cannot open an account for you on Sanchay right now.'],
  [
    'CLIENT_IP_UNSUPPORTED',
    'We could not verify your network. Please switch networks and try again.',
  ],
  ['CAS_PASSWORD_INVALID', 'The statement password is incorrect.'],
  ['CAS_PAN_MISMATCH', 'This statement belongs to a different PAN.'],
  ['CAS_UNSUPPORTED', 'We cannot read this statement format.'],
  // 426
  ['APP_VERSION_UNSUPPORTED', 'Please update the Sanchay app to continue.'],
  // 428
  ['IDEMPOTENCY_KEY_REQUIRED', 'Please refresh the page and try again.'],
  // 429
  ['RATE_LIMITED', 'Too many attempts. Please wait a while and try again.'],
  ['OTP_COOLDOWN', 'Please wait a few seconds before requesting another code.'],
  // 500
  ['INTERNAL', 'Something went wrong on our side. Please try again.'],
  // 502
  [
    'PROVIDER_REJECTED',
    'The fund house system did not accept this request. Please contact support.',
  ],
  // 503
  [
    'PROVIDER_UNAVAILABLE',
    'We could not send the code right now. Please try again in a few minutes.',
  ],
  ['SMS_UNAVAILABLE', 'We could not send the SMS right now. Please try again in a few minutes.'],
  // client-only (@sanchay/api-client NETWORK_ERROR)
  ['NETWORK_ERROR', 'You seem to be offline. Check your connection and try again.'],
]);

export function messageForError(code?: string | null): string {
  if (!code) {
    return DEFAULT_ERROR_MESSAGE;
  }
  return ERROR_COPY.get(code) ?? DEFAULT_ERROR_MESSAGE;
}
