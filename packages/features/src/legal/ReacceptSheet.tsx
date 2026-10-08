import type { ApiClient } from '@sanchay/api-client';
import { toApiError } from '@sanchay/api-client';
import { messageForError } from '@sanchay/app-core';
import { AppText, Banner, Button, Checkbox, Sheet } from '@sanchay/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useApi } from '../api/ApiContext';

/** One entry of `legal.pending` (E10, RV-03-54): the document key, its current version and its title. */
export type PendingLegalDocument = Awaited<ReturnType<ApiClient['legal']['pending']>>[number];

export interface ReacceptSheetProps {
  documents: PendingLegalDocument[];
  onClose(): void;
  onAccepted(): void;
}

/** R-18: one checkbox per updated document; the acceptance is recorded by `legal.acceptPending`. */
export function ReacceptSheet({ documents, onClose, onAccepted }: ReacceptSheetProps) {
  const { utils } = useApi();
  const acceptPending = useMutation(utils.legal.acceptPending.mutationOptions());
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const ready = documents.every((doc) => checked[doc.key]);

  return (
    <Sheet visible title="Updated terms" onClose={onClose}>
      {acceptPending.isError ? (
        <Banner tone="error" message={messageForError(toApiError(acceptPending.error).code)} />
      ) : null}
      {documents.length === 0 ? <AppText tone="muted">Nothing to review.</AppText> : null}
      {documents.map((doc) => (
        <Checkbox
          key={doc.key}
          label={`I have read and accept the updated ${doc.title}`}
          checked={checked[doc.key] ?? false}
          onChange={(value) => setChecked((prev) => ({ ...prev, [doc.key]: value }))}
        />
      ))}
      <Button
        label="Accept and continue"
        disabled={!ready}
        loading={acceptPending.isPending}
        onPress={() => {
          acceptPending.mutate(
            { keys: documents.map((doc) => doc.key) },
            { onSuccess: onAccepted },
          );
        }}
      />
    </Sheet>
  );
}
