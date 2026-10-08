import { AppText, Button, Card } from '@sanchay/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useApi } from '../api/ApiContext';
import { ReacceptSheet } from './ReacceptSheet';

/**
 * R-18: shown in the app shell while a required document has a version the investor has not accepted.
 * Only once onboarding is DONE: before that, `legal.pending` lists every required document the investor has
 * never been asked about, and ONB-15 (the declarations step) is where they accept them, sealed at attest.
 */
export function LegalPendingBanner() {
  const { utils } = useApi();
  const onboarding = useQuery(utils.onboarding.get.queryOptions());
  const pending = useQuery({
    ...utils.legal.pending.queryOptions(),
    enabled: onboarding.data?.stage === 'DONE',
  });
  const [open, setOpen] = useState(false);

  if (onboarding.data?.stage !== 'DONE') return null;
  if (!pending.data || pending.data.length === 0) return null;

  return (
    <>
      <Card testID="legal-pending-banner">
        <AppText>Updated terms are available.</AppText>
        <Button variant="secondary" label="Review now" onPress={() => setOpen(true)} />
      </Card>
      {open ? (
        <ReacceptSheet
          documents={pending.data}
          onClose={() => setOpen(false)}
          onAccepted={() => {
            setOpen(false);
            void pending.refetch();
          }}
        />
      ) : null}
    </>
  );
}
