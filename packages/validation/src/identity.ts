import { z } from 'zod';
import { VALIDATION_MESSAGES } from './messages.js';
import { MOBILE_REGEX, PAN_REGEX, REPEATED_DIGITS_REGEX } from './patterns.js';

export const panSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(PAN_REGEX, { error: VALIDATION_MESSAGES.PAN_INVALID });

export const mobileSchema = z
  .string()
  .trim()
  .regex(MOBILE_REGEX, { error: VALIDATION_MESSAGES.MOBILE_INVALID })
  .refine((value) => !REPEATED_DIGITS_REGEX.test(value), {
    error: VALIDATION_MESSAGES.MOBILE_REPEATED_DIGITS,
  });

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, { error: VALIDATION_MESSAGES.EMAIL_TOO_LONG })
  .pipe(z.email({ error: VALIDATION_MESSAGES.EMAIL_INVALID }));
