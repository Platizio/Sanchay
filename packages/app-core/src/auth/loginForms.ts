import { mobileSchema, otpCodeSchema } from '@sanchay/validation';
import { z } from 'zod';

export const mobileFormSchema = z.object({ mobile: mobileSchema });
export const otpFormSchema = z.object({ code: otpCodeSchema });

export type MobileFormValues = z.infer<typeof mobileFormSchema>;
export type OtpFormValues = z.infer<typeof otpFormSchema>;
