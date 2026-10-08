import { type ApiClient, toApiError } from '@sanchay/api-client';
import { messageForError } from '@sanchay/app-core';
import { space } from '@sanchay/tokens';
import { AppText, Banner, Button, Checkbox, Screen } from '@sanchay/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useApi } from '../api/ApiContext';
import { newIntentKey } from '../common/intentKey';
import { ReadDocumentAction } from '../legal/ReacceptSheet';
import { useNav } from '../nav/NavContext';

type StageInput = Parameters<ApiClient['onboarding']['stageDeclarations']>[0];
type DeclarationKey = StageInput['accept'][number]['key'];

// KYC_CONSENT is accepted at ONB-02 and re-accepted through the banner, never staged here (RV-03-54).
const DECLARATION_KEYS: readonly DeclarationKey[] = [
  'TNC',
  'PRIVACY_NOTICE',
  'RISK_DISCLOSURE',
  'REGULAR_PLAN_COMMISSION',
  'EXECUTION_ONLY_DECLARATION',
  'FATCA_CRS_DECLARATION',
  'NOMINATION_OPT_OUT_ANNEX_B',
];
const isDeclarationKey = (key: string): key is DeclarationKey =>
  (DECLARATION_KEYS as readonly string[]).includes(key);

/** ONB-15: one unticked checkbox per pending declaration, each with a "Read" sheet, staged at its current version. */
export function DeclarationsScreen() {
  const { client, utils } = useApi();
  const nav = useNav();
  const queryClient = useQueryClient();
  const pending = useQuery(utils.legal.pending.queryOptions());
  const stage = useMutation({
    mutationFn: (input: StageInput) =>
      client.onboarding.stageDeclarations(input, {
        context: { idempotencyKey: newIntentKey() },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: utils.onboarding.get.key() });
      await queryClient.invalidateQueries({ queryKey: utils.legal.pending.key() });
    },
  });
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});

  if (pending.isPending) {
    return (
      <Screen testID="declarations-loading">
        <AppText tone="muted">Loading…</AppText>
      </Screen>
    );
  }
  if (pending.isError) {
    return (
      <Screen testID="declarations-error">
        <Banner tone="error" message={messageForError(toApiError(pending.error).code)} />
        <Button
          label="Try again"
          onPress={() => {
            void pending.refetch();
          }}
        />
      </Screen>
    );
  }

  const documents = pending.data.flatMap(({ key, version, title }) =>
    isDeclarationKey(key) ? [{ key, version, title }] : [],
  );
  const ready = documents.every((doc) => accepted[doc.key]);

  const next = async () => {
    // Every declaration may already be held at its current version (a return visit); nothing to stage then.
    if (documents.length > 0) {
      try {
        await stage.mutateAsync({
          accept: documents.map(({ key, version }) => ({ key, version })),
        });
      } catch {
        return; // the failure is shown through stage.error
      }
    }
    nav.replace('/onboarding/review');
  };

  return (
    <Screen testID="declarations-screen">
      <AppText variant="title">A few declarations</AppText>
      {stage.isError ? (
        <Banner tone="error" message={messageForError(toApiError(stage.error).code)} />
      ) : null}
      <View style={styles.stack}>
        {documents.map((doc) => (
          <View key={doc.key} style={styles.row}>
            <Checkbox
              label={doc.title}
              checked={accepted[doc.key] ?? false}
              onChange={(checked) => setAccepted((prev) => ({ ...prev, [doc.key]: checked }))}
            />
            <ReadDocumentAction docKey={doc.key} title={doc.title} />
          </View>
        ))}
        <Button
          label="Continue to review"
          disabled={!ready}
          loading={stage.isPending}
          onPress={() => {
            void next();
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ stack: { gap: space(3) }, row: { gap: space(2) } });
