import { LEGAL_ENTITY_NAME } from '@sanchay/domain';
import type { NotificationTemplateKey } from './notifications.schema.js';

export interface RenderedNotification {
  subject: string;
  text: string;
}

const SIGNOFF = `— Sanchay, by ${LEGAL_ENTITY_NAME}`;

/**
 * One renderer per NOTIFICATION_TEMPLATE_KEYS entry. `data` is the plaintext object Notify.enqueue
 * encrypted into notifications.payload_enc; NotificationsSendJob decrypts it and calls this function.
 * Every renderer is total (no placeholders): a missing optional field falls back to neutral copy.
 */
export function renderNotification(
  key: NotificationTemplateKey,
  data: Record<string, string>,
): RenderedNotification {
  switch (key) {
    case 'SECURITY_NEW_SIGN_IN':
      return {
        subject: 'New sign-in to your Sanchay account',
        text: `A new sign-in to your Sanchay account was just made from a ${data.platform ?? 'device'}. If this was not you, contact support immediately.\n${SIGNOFF}`,
      };
    case 'ORDER_PLACED':
      return {
        subject: 'Order placed',
        text: `Your order for Rs ${data.amount ?? ''} in ${data.schemeName ?? 'your scheme'} has been placed.\n${SIGNOFF}`,
      };
    case 'ORDER_ALLOTTED':
      return {
        subject: 'Units allotted',
        text: `${data.units ?? ''} units of ${data.schemeName ?? 'your scheme'} were allotted at NAV Rs ${data.nav ?? ''} on ${data.navDate ?? ''}.\n${SIGNOFF}`,
      };
    case 'ORDER_FAILED':
      return {
        subject: 'Order could not be completed',
        text: `Your order for ${data.schemeName ?? 'your scheme'} could not be completed. ${data.reason ?? 'Please try again.'}\n${SIGNOFF}`,
      };
    case 'REFUND_IN_PROGRESS':
      return {
        subject: 'Refund in progress',
        text: `A refund of Rs ${data.amount ?? ''} is in progress for your order in ${data.schemeName ?? 'your scheme'}. No action is needed.\n${SIGNOFF}`,
      };
    case 'REDEMPTION_PROCESSED':
      return {
        subject: 'Redemption processed',
        text: `Your redemption of ${data.units ?? ''} units of ${data.schemeName ?? 'your scheme'} has been processed.\n${SIGNOFF}`,
      };
    case 'PAYOUT_DELAYED':
      return {
        subject: 'Your payout is delayed',
        text: `Your redemption payout for ${data.schemeName ?? 'your scheme'} is delayed past the expected date. The AMC owes 15% p.a. interest for the delay. See the AMC and SCORES links in the app for escalation.\n${SIGNOFF}`,
      };
    case 'SIP_ACTIVE':
      return {
        subject: 'Your SIP is active',
        text: `Your SIP in ${data.schemeName ?? 'your scheme'} is now active. The first instalment is expected on ${data.firstInstalmentDate ?? 'the registered date'}.\n${SIGNOFF}`,
      };
    case 'SIP_INSTALMENT_MISSED_WARNING':
      return {
        subject: 'SIP instalment missed',
        text: `Two consecutive instalments of your SIP in ${data.schemeName ?? 'your scheme'} were missed. One more missed instalment will cancel this SIP.\n${SIGNOFF}`,
      };
    case 'MANDATE_STATUS':
      return {
        subject: 'Mandate status update',
        text: `Your bank mandate for SIP instalments is now ${data.status ?? 'updated'}.\n${SIGNOFF}`,
      };
    case 'MANDATE_REVOKED':
      return {
        subject: 'Mandate revoked',
        text: `Your bank mandate was revoked at your bank. Set up a new mandate to keep your SIP active.\n${SIGNOFF}`,
      };
    case 'SUITABILITY_WARNING_COPY':
      return {
        subject: 'Suitability notice',
        text: `${data.schemeName ?? 'This scheme'}'s risk level is higher than your risk profile. Review before you proceed.\n${SIGNOFF}`,
      };
    case 'ONBOARDING_BLOCKED_PILOT':
      return {
        subject: 'Not supported in this pilot',
        text: `We are unable to onboard your account in this pilot phase. ${data.reason ?? 'Please contact support for details.'}\n${SIGNOFF}`,
      };
  }
}
