import type { ApiClient } from '@sanchay/api-client';
import type { ConsentApi } from './useConsentChallenge';

/** E4 sends no resend timer; its per-challenge SMS cooldown is 30 s (`SMS_COOLDOWN_MS`), as is Plan 01's OTP_POLICY. */
export const CONSENT_RESEND_SECONDS = 30;

/**
 * `ConsentApi` over E4's `consents.*` wire (RV-03-9). E4 names the id `challengeId` and returns no masks,
 * and `sendOtp` answers `{ok: true}`, so this adapter maps the id, leaves `destinationsMasked` empty and
 * supplies the 30 s resend timer. E4 guards only `consents.cancel` with an Idempotency-Key and the sheet
 * never cancels, so no key is sent (a bare `newIdempotencyKey()` can throw on Hermes).
 */
export function consentsApiFrom(client: ApiClient): ConsentApi {
  return {
    async getChallenge({ id }) {
      const challenge = await client.consents.getChallenge({ id });
      return {
        id: challenge.challengeId,
        status: challenge.status,
        requiredFactors: challenge.requiredFactors,
        destinationsMasked: {},
        expiresAt: challenge.expiresAt,
      };
    },
    async sendOtp({ id, channel }) {
      await client.consents.sendOtp({ id, channel });
      return { resendAfterSeconds: CONSENT_RESEND_SECONDS };
    },
    async approve({ id, smsCode, emailCode }) {
      await client.consents.approve({
        id,
        ...(smsCode === undefined ? {} : { smsCode }),
        ...(emailCode === undefined ? {} : { emailCode }),
      });
      return { status: 'CONSUMED' };
    },
  };
}
