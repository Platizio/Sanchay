import { toApiError } from '@sanchay/api-client';
import { messageForError } from '@sanchay/app-core';
import { AppText, Banner, Button, ProgressSteps, Screen } from '@sanchay/ui';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '../api/ApiContext';
import { EmailOtpScreens } from '../auth/EmailOtpScreens';
import { useNav } from '../nav/NavContext';
import { BlockedScreen } from './BlockedScreen';
import {
  isBlockedStage,
  ONBOARDING_ACTIVE_STAGES,
  stepPathForStage,
  useOnboarding,
} from './useOnboarding';

const STAGE_LABEL: Record<(typeof ONBOARDING_ACTIVE_STAGES)[number], string> = {
  IDENTITY: 'Identity',
  PROFILE: 'Profile',
  BANK: 'Bank',
  NOMINATION: 'Nominees',
  RISK: 'Risk profile',
  DECLARATIONS: 'Declarations',
  ATTEST: 'Review & confirm',
  PROVISIONING: 'Setting up your account',
};

/** ONB-00: the onboarding hub, gated on a verified email (AUTH-04/05) before any stage is shown. */
export function OnboardingHubScreen() {
  const { utils } = useApi();
  const nav = useNav();
  const session = useQuery(utils.auth.session.queryOptions());

  if (session.isPending) {
    return (
      <Screen testID="onboarding-loading">
        <AppText tone="muted">Loading your onboarding…</AppText>
      </Screen>
    );
  }
  if (session.isError) {
    return (
      <Screen testID="onboarding-error">
        <Banner tone="error" message={messageForError(toApiError(session.error).code)} />
        <Button
          label="Try again"
          onPress={() => {
            void session.refetch();
          }}
        />
      </Screen>
    );
  }
  if (!session.data.investor.emailVerified) {
    return (
      <EmailOtpScreens
        onVerified={() => {
          void session.refetch();
        }}
      />
    );
  }
  return <OnboardingStages onNavigate={(path) => nav.push(path)} />;
}

function OnboardingStages({ onNavigate }: { onNavigate: (path: string) => void }) {
  const onboarding = useOnboarding();

  if (onboarding.isPending) {
    return (
      <Screen testID="onboarding-loading">
        <AppText tone="muted">Loading your onboarding…</AppText>
      </Screen>
    );
  }
  if (onboarding.isError) {
    return (
      <Screen testID="onboarding-error">
        <Banner tone="error" message={messageForError(onboarding.errorCode)} />
        <Button
          label="Try again"
          onPress={() => {
            void onboarding.refetch();
          }}
        />
      </Screen>
    );
  }
  if (isBlockedStage(onboarding.stage)) {
    return (
      <BlockedScreen
        reason={onboarding.stage}
        readinessCode={onboarding.readinessCode}
        // After a KRA fix or an FP outage, an identical resubmit runs a fresh check (RV-03-62).
        onRetry={() => onNavigate('/onboarding/identity')}
        onTryAgain={() => onNavigate('/onboarding/review')}
      />
    );
  }
  if (onboarding.stage === 'DONE') {
    return (
      <Screen testID="onboarding-hub">
        <AppText variant="title">You're all set</AppText>
        <AppText tone="muted">
          Your Sanchay account is ready. Explore funds and start investing.
        </AppText>
        <Button label="Explore funds" onPress={() => onNavigate('/explore')} />
      </Screen>
    );
  }
  const stage = onboarding.stage ?? 'IDENTITY';
  const steps = ONBOARDING_ACTIVE_STAGES.map((key) => ({ key, label: STAGE_LABEL[key] }));
  return (
    <Screen testID="onboarding-hub">
      <AppText variant="title">Set up your account</AppText>
      <ProgressSteps steps={steps} current={stage} />
      {stage === 'PROVISIONING' ? (
        <AppText tone="muted">
          We're setting up your account. This usually takes a few minutes.
        </AppText>
      ) : (
        <Button
          label="Continue"
          onPress={() => onNavigate(stepPathForStage(stage))}
          testID="onboarding-continue"
        />
      )}
    </Screen>
  );
}
