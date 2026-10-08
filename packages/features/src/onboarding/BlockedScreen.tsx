import { AppText, Banner, Button, Screen } from '@sanchay/ui';
import type { OnboardingBlockedStage } from './useOnboarding';

export interface BlockedScreenProps {
  reason: OnboardingBlockedStage;
  readinessCode: string | null;
  onRetry?: (() => void) | undefined;
  /** PROVISIONING_FAILED: the runbook's remedy is a re-attest, so the hub routes this to the review step. */
  onTryAgain?: (() => void) | undefined;
}

const SUPPORT_LINE = 'Write to support@sanchay.in and we will help you from there.';

/** ONB-19: the terminal, non-hard-block-shaped states the ONB-00 hub can land on. */
export function BlockedScreen({ reason, readinessCode, onRetry, onTryAgain }: BlockedScreenProps) {
  if (reason === 'KYC_UPDATE_NEEDED') {
    return (
      <Screen testID="onboarding-blocked">
        <AppText variant="title">Update your KYC</AppText>
        <Banner
          tone="info"
          message={
            readinessCode
              ? `Your KRA record needs an update (${readinessCode}). Please update your KYC with a KRA and try again.`
              : 'Please update your KYC with a KRA and try again.'
          }
        />
        <AppText tone="muted">{SUPPORT_LINE}</AppText>
        {onRetry ? <Button label="Check status again" onPress={onRetry} /> : null}
      </Screen>
    );
  }
  if (reason === 'BLOCKED_PEP') {
    return (
      <Screen testID="onboarding-blocked">
        <AppText variant="title">We need to review your account</AppText>
        <Banner
          tone="info"
          message="Based on your answers, we're unable to open an account for you online right now. Our compliance team will be in touch."
        />
        <AppText tone="muted">{SUPPORT_LINE}</AppText>
      </Screen>
    );
  }
  return (
    <Screen testID="onboarding-blocked">
      <AppText variant="title">We hit a snag</AppText>
      <Banner
        tone="error"
        message="We ran into a problem setting up your account. Our team has been notified and will follow up."
      />
      <AppText tone="muted">{SUPPORT_LINE}</AppText>
      {onTryAgain ? <Button label="Try again" onPress={onTryAgain} /> : null}
    </Screen>
  );
}
