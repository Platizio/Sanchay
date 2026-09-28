import { z } from 'zod';
import { VALIDATION_MESSAGES } from './messages.js';
import { IFSC_REGEX, PINCODE_REGEX } from './patterns.js';

export const ifscSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(IFSC_REGEX, { error: VALIDATION_MESSAGES.IFSC_INVALID });

export const pincodeSchema = z
  .string()
  .trim()
  .regex(PINCODE_REGEX, { error: VALIDATION_MESSAGES.PINCODE_INVALID });
