import type { ApiClient } from '@sanchay/api-client';
import { toApiError } from '@sanchay/api-client';
import { messageForError } from '@sanchay/app-core';
import { space } from '@sanchay/tokens';
import { AppText, Banner, Button, Checkbox, Sheet } from '@sanchay/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useApi } from '../api/ApiContext';

/** One entry of `legal.pending` (E10, RV-03-54): the document key, its current version and its title. */
export type PendingLegalDocument = Awaited<ReturnType<ApiClient['legal']['pending']>>[number];

type LegalDocumentKey = PendingLegalDocument['key'];

function LegalDocumentBody({ docKey }: { docKey: LegalDocumentKey }) {
  const { utils } = useApi();
  const document = useQuery(utils.legal.getDocument.queryOptions({ input: { key: docKey } }));
  if (document.isPending) return <AppText tone="muted">Loading…</AppText>;
  if (document.isError) {
    return (
      <>
        <Banner tone="error" message={messageForError(toApiError(document.error).code)} />
        <Button
          variant="secondary"
          label="Try again"
          onPress={() => {
            void document.refetch();
          }}
        />
      </>
    );
  }
  return (
    <>
      <AppText variant="caption" tone="muted">{`Version ${document.data.version}`}</AppText>
      <ScrollView style={styles.body}>
        <AppText>{document.data.bodyMarkdown}</AppText>
      </ScrollView>
    </>
  );
}

/**
 * "Read <title>" beside an acceptance checkbox: opens a sheet with the full text and version of the
 * document, so the investor sees what they accept (journeys.md ONB-15, MF-8). Reading is not accepting.
 */
export function ReadDocumentAction({ docKey, title }: { docKey: LegalDocumentKey; title: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" label={`Read ${title}`} onPress={() => setOpen(true)} />
      <Sheet visible={open} title={title} onClose={() => setOpen(false)}>
        {open ? <LegalDocumentBody docKey={docKey} /> : null}
      </Sheet>
    </>
  );
}

export interface ReacceptSheetProps {
  documents: PendingLegalDocument[];
  onClose(): void;
  onAccepted(): void;
}

/** R-18: one checkbox per updated document; the acceptance is recorded by `legal.acceptPending`. */
export function ReacceptSheet({ documents, onClose, onAccepted }: ReacceptSheetProps) {
  const { utils } = useApi();
  const queryClient = useQueryClient();
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
        <View key={doc.key} style={styles.row}>
          <Checkbox
            label={`I have read and accept the updated ${doc.title}`}
            checked={checked[doc.key] ?? false}
            onChange={(value) => setChecked((prev) => ({ ...prev, [doc.key]: value }))}
          />
          <ReadDocumentAction docKey={doc.key} title={doc.title} />
        </View>
      ))}
      <Button
        label="Accept and continue"
        disabled={!ready}
        loading={acceptPending.isPending}
        onPress={() => {
          // The versions the investor was shown; the server refuses one that is no longer in force (LEG-1).
          acceptPending.mutate(
            { accept: documents.map(({ key, version }) => ({ key, version })) },
            {
              onSuccess: onAccepted,
              // DECLARATION_OUTDATED: re-read the list so the sheet shows the new version.
              onError: () => {
                void queryClient.invalidateQueries({ queryKey: utils.legal.pending.key() });
              },
            },
          );
        }}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { gap: space(2) },
  body: { maxHeight: 360 },
});
