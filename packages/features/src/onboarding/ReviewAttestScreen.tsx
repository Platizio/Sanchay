import { toApiError } from '@sanchay/api-client';
import { messageForError } from '@sanchay/app-core';
import { AppText, Banner, Button, Card, Screen } from '@sanchay/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useApi } from '../api/ApiContext';
import { ConsentOtpSheet } from '../consent/ConsentOtpSheet';
import { useNav } from '../nav/NavContext';
import { riskLevelLabel } from './riskLevelLabel';

/**
 * ONB-16: a read-only summary, then the attest. `onboarding.attest` opens the ONBOARDING_ATTEST consent
 * challenge; the CNF-01 sheet collects the SMS and email codes, and approving it starts provisioning.
 */
export function ReviewAttestScreen() {
  const { utils } = useApi();
  const nav = useNav();
  const queryClient = useQueryClient();
  const me = useQuery(utils.me.get.queryOptions());
  const banks = useQuery(utils.onboarding.listBanks.queryOptions());
  const nomination = useQuery(utils.onboarding.getNomination.queryOptions());
  const risk = useQuery(utils.riskProfile.get.queryOptions());
  const attest = useMutation(utils.onboarding.attest.mutationOptions());
  const [challengeId, setChallengeId] = useState<string | null>(null);

  const reads = [me, banks, nomination, risk];
  if (reads.some((read) => read.isPending)) {
    return (
      <Screen testID="review-loading">
        <AppText tone="muted">Loading…</AppText>
      </Screen>
    );
  }
  const failed = reads.find((read) => read.isError);
  if (failed || !me.data || !banks.data || !nomination.data || risk.data === undefined) {
    return (
      <Screen testID="review-error">
        <Banner
          tone="error"
          message={messageForError(failed?.error ? toApiError(failed.error).code : 'INTERNAL')}
        />
        <Button
          label="Try again"
          onPress={() => {
            for (const read of reads) void read.refetch();
          }}
        />
      </Screen>
    );
  }

  const bank = banks.data.find((b) => b.status === 'VERIFIED') ?? banks.data[0];
  const count = nomination.data.nominees.length;
  const nomineeLine =
    nomination.data.decision === 'OPTED_OUT'
      ? 'No nominee (opted out)'
      : nomination.data.decision === 'NOMINATED'
        ? `${count} nominee${count === 1 ? '' : 's'}`
        : 'Nomination not recorded';

  return (
    <Screen testID="review-attest-screen">
      <AppText variant="title">Review and confirm</AppText>
      {attest.isError ? (
        <Banner tone="error" message={messageForError(toApiError(attest.error).code)} />
      ) : null}
      <Card>
        <AppText variant="heading">Your details</AppText>
        <AppText>{me.data.profile?.nameAsPerPan ?? 'Name not available'}</AppText>
        <AppText>
          {bank ? `${bank.bankName ?? 'Bank'} ••••${bank.accountLast4}` : 'No bank account'}
        </AppText>
        <AppText>{nomineeLine}</AppText>
        <AppText>{`Risk profile: ${risk.data ? riskLevelLabel(risk.data.level) : 'not completed'}`}</AppText>
      </Card>
      <Button
        label="Attest and submit"
        loading={attest.isPending}
        onPress={() => {
          attest.mutate(
            {},
            {
              onSuccess: (started) => setChallengeId(started.challengeId),
              // A nomination change or a republished legal document leaves declarations to redo; the hub
              // would send the investor straight back here, so go to the step itself (MF-7).
              onError: (error) => {
                if (toApiError(error).code === 'DECLARATION_OUTDATED') {
                  nav.replace('/onboarding/declarations');
                }
              },
            },
          );
        }}
      />
      {challengeId ? (
        <ConsentOtpSheet
          challengeId={challengeId}
          onApproved={() => {
            setChallengeId(null);
            void queryClient.invalidateQueries({ queryKey: utils.onboarding.get.key() });
            nav.replace('/onboarding/provisioning');
          }}
          onClose={() => setChallengeId(null)}
        />
      ) : null}
    </Screen>
  );
}
