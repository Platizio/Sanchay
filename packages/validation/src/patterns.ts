/** PAN AAAAA9999A (v1 Front_end/src/utils/kycPreVerification.ts:375). */
export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
/** Indian mobile: 10 digits starting 6-9 (v1 kycPreVerification.ts:387; AMFI §G.1). */
export const MOBILE_REGEX = /^[6-9][0-9]{9}$/;
/** AMFI §G.1: a mobile number may not be one digit repeated ten times. */
export const REPEATED_DIGITS_REGEX = /^(\d)\1{9}$/;
/** IFSC: 4 letters, a zero, 6 alphanumerics (v1 InvestorOnboarding.tsx:132; DB CHECK §C.4). */
export const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
/** Indian PIN code: 6 digits, never starting with 0 (stricter than the DB CHECK ^\d{6}$). */
export const PINCODE_REGEX = /^[1-9][0-9]{5}$/;
/** OTP: exactly 6 digits (H-3). */
export const OTP_CODE_REGEX = /^[0-9]{6}$/;
/** Wire formats (§D.1): numeric(18,2), numeric(20,3), numeric(20,4), numeric(18,6). */
export const MONEY_WIRE_REGEX = /^-?\d{1,16}\.\d{2}$/;
export const UNITS_WIRE_REGEX = /^-?\d{1,17}\.\d{3}$/;
export const EXTERNAL_UNITS_WIRE_REGEX = /^-?\d{1,16}\.\d{4}$/;
export const NAV_WIRE_REGEX = /^\d{1,12}\.\d{6}$/;
