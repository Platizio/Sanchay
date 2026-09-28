import { type EnumValue, LAUNCH_CLIENT_PLATFORMS } from '@sanchay/domain';
import { z } from 'zod';

/** One source of truth for field rules (X-02(5)): the contract re-exports @sanchay/validation. */
export {
  emailSchema as EmailSchema,
  mobileSchema as MobileSchema,
  otpCodeSchema as OtpCodeSchema,
} from '@sanchay/validation';

/** MVP clients are WEB and ANDROID only (D-19). IOS stays reserved in CLIENT_PLATFORMS (P2-10). */
export const PlatformSchema = z.enum(LAUNCH_CLIENT_PLATFORMS);
export type Platform = EnumValue<typeof LAUNCH_CLIENT_PLATFORMS>;

export const InstantSchema = z.iso.datetime();

export const OkSchema = z.object({ ok: z.literal(true) });
