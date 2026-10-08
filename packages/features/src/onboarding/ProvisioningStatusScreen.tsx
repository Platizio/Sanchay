import { AppText, Banner, Button, Screen } from '@sanchay/ui';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '../api/ApiContext';
import { useNav } from '../nav/NavContext';

const POLL_MS = 3000;
/** Stages that end the wait without the account being ready; the hub's BlockedScreen explains each. */
const STOPPED_STAGES = ['PROVISIONING_FAILED', 'KYC_UPDATE_NEEDED', 'BLOCKED_PEP'];

/** ONB-17/20: polls the onboarding stage until FP provisioning is DONE (or stops in a blocked stage). */
export function ProvisioningStatusScreen() {
  const { utils } = useApi();
  const nav = useNav();
  const onboarding = useQuery({
    ...utils.onboarding.get.queryOptions(),
    refetchInterval: (query) => {
      const stage = query.state.data?.stage;
      return stage === 'DONE' || (stage && STOPPED_STAGES.includes(stage)) ? false : POLL_MS;
    },
  });

  const stage = onboarding.data?.stage;
  if (stage === 'DONE') {
    return (
      <Screen testID="provisioning-done">
        <AppText variant="title">Your account is ready</AppText>
        <AppText tone="muted">Explore funds and start investing.</AppText>
        <Button label="Explore funds" onPress={() => nav.push('/explore')} />
      </Screen>
    );
  }
  if (stage && STOPPED_STAGES.includes(stage)) {
    return (
      <Screen testID="provisioning-failed">
        <Banner tone="error" message="We could not finish setting up your account." />
        <Button label="Back to setup" onPress={() => nav.replace('/onboarding')} />
      </Screen>
    );
  }
  return (
    <Screen testID="provisioning-in-progress">
      <AppText variant="title">Setting up your account…</AppText>
      <AppText tone="muted">This usually takes a minute.</AppText>
    </Screen>
  );
}
