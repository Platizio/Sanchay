import { toApiError } from '@sanchay/api-client';
import { messageForError } from '@sanchay/app-core';
import { AppText, Banner, Button, Card, Screen } from '@sanchay/ui';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '../api/ApiContext';
import { useSignOut, useSignOutEverywhere } from '../auth/useSignOut';

function emailLine(emailMasked: string | null, emailVerified: boolean): string {
  if (!emailMasked) return 'Email not added yet';
  return `Email ${emailMasked} (${emailVerified ? 'verified' : 'not verified'})`;
}

/** PRF-01 read-only subset for the pilot: contact changes are ops-assisted (H-9), sessions list is P2-3. */
export function AccountScreen() {
  const { utils } = useApi();
  const session = useQuery(utils.auth.session.queryOptions());
  const signOut = useSignOut();
  const everywhere = useSignOutEverywhere();

  if (session.isPending) {
    return (
      <Screen testID="account-loading">
        <AppText tone="muted">Loading your account…</AppText>
      </Screen>
    );
  }

  if (session.isError) {
    return (
      <Screen testID="account-error">
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

  const { mobileMasked, emailMasked, emailVerified } = session.data.investor;
  return (
    <Screen testID="account-screen">
      <AppText variant="title">Account</AppText>
      {everywhere.error ? <Banner tone="error" message={everywhere.error} /> : null}
      <Card>
        <AppText variant="heading">Your details</AppText>
        <AppText>{`Mobile ${mobileMasked}`}</AppText>
        <AppText>{emailLine(emailMasked, emailVerified)}</AppText>
      </Card>
      <Card>
        <AppText variant="heading">Security</AppText>
        <AppText tone="muted">
          Sign out everywhere logs you out on every device, including this one.
        </AppText>
        <Button
          variant="secondary"
          label="Log out"
          loading={signOut.pending}
          onPress={() => {
            void signOut.run();
          }}
        />
        <Button
          variant="secondary"
          label="Sign out everywhere"
          loading={everywhere.pending}
          onPress={() => {
            void everywhere.run();
          }}
        />
      </Card>
    </Screen>
  );
}
