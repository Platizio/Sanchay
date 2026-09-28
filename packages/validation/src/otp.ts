import { z } from 'zod';
import { VALIDATION_MESSAGES } from './messages.js';
import { OTP_CODE_REGEX } from './patterns.js';

export const otpCodeSchema = z
  .string()
  .trim()
  .regex(OTP_CODE_REGEX, { error: VALIDATION_MESSAGES.OTP_INVALID });
