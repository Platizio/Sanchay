import { AppText, Button, Card } from '@sanchay/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useApi } from '../api/ApiContext';
import { ReacceptSheet } from './ReacceptSheet';

/** R-18: shown in the app shell while a required document has a version the investor has not accepted. */
export function LegalPendingBanner() {
  const { utils } = useApi();
  const pending = useQuery(utils.legal.pending.queryOptions());
  const [open, setOpen] = useState(false);

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
