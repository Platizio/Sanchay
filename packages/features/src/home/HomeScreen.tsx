import { toApiError } from '@sanchay/api-client';
import { messageForError } from '@sanchay/app-core';
import { AppText, Banner, Button, Card, Screen } from '@sanchay/ui';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '../api/ApiContext';

/** "Who am I" comes from GET /auth/session in Plan 01; GET /me arrives with onboarding (plan-04, S3). */
export function HomeScreen() {
  const { utils } = useApi();
  const session = useQuery(utils.auth.session.queryOptions());

  if (session.isPending) {
    return (
      <Screen testID="home-loading">
        <AppText tone="muted">Loading your account…</AppText>
      </Screen>
    );
  }

  if (session.isError) {
    return (
      <Screen testID="home-error">
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

  const { displayName, mobileMasked } = session.data.investor;
  return (
    <Screen testID="home-screen">
      <AppText variant="title">{displayName ? `Hi, ${displayName}` : 'Welcome to Sanchay'}</AppText>
      <AppText tone="muted">{`Signed in as ${mobileMasked}`}</AppText>
      <Card>
        <AppText variant="heading">Your investments</AppText>
        <AppText tone="muted">
          You have not invested yet. Your holdings, SIPs and returns will appear here after your
          first investment.
        </AppText>
      </Card>
    </Screen>
  );
}
