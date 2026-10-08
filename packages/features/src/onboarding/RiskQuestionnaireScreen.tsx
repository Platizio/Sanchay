import { type ApiClient, toApiError } from '@sanchay/api-client';
import { messageForError } from '@sanchay/app-core';
import { space } from '@sanchay/tokens';
import { AppText, Banner, Button, RadioGroup, Screen, TextField } from '@sanchay/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { z } from 'zod';
import { useApi } from '../api/ApiContext';
import { newIntentKey } from '../common/intentKey';
import { useNav } from '../nav/NavContext';
import { riskLevelLabel } from './riskLevelLabel';

type RiskAnswers = Parameters<ApiClient['riskProfile']['submit']>[0];

/** The published questionnaire's questions (GAP-03 v1.0.0); the wire types them `unknown[]`. */
const QuestionsSchema = z.array(
  z.object({
    id: z.string(),
    text: z.string(),
    derivedFromDob: z.boolean().optional(),
    options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  }),
);

/** Q1 (age) is derived from the date of birth; Q2..Q8 are the seven scored answers, by question id. */
const ANSWER_KEY: Record<string, Exclude<keyof RiskAnswers, 'dob'>> = {
  Q2: 'horizon',
  Q3: 'goal',
  Q4: 'incomeStability',
  Q5: 'emergencySavings',
  Q6: 'emiShare',
  Q7: 'experience',
  Q8: 'reaction',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** "12 Oct 2028" in India time, computed by hand so it does not depend on the runtime's ICU data. */
function formatExpiry(iso: string): string {
  const date = new Date(new Date(iso).getTime() + IST_OFFSET_MS);
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${day} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isPastDate = (value: string): boolean =>
  ISO_DATE.test(value) && Date.parse(`${value}T00:00:00Z`) <= Date.now();

/** ONB-21/22: the risk questionnaire. Scoring is the server's (E9); this screen collects and shows the result. */
export function RiskQuestionnaireScreen() {
  const { client, utils } = useApi();
  const nav = useNav();
  const queryClient = useQueryClient();
  const questionnaire = useQuery(utils.riskProfile.questionnaire.queryOptions());
  const submit = useMutation({
    mutationFn: (input: RiskAnswers) =>
      client.riskProfile.submit(input, { context: { idempotencyKey: newIntentKey() } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: utils.onboarding.get.key() });
      await queryClient.invalidateQueries({ queryKey: utils.riskProfile.get.key() });
    },
  });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [dob, setDob] = useState('');

  if (submit.data) {
    return (
      <Screen testID="risk-result">
        <AppText variant="title">{riskLevelLabel(submit.data.level)}</AppText>
        <AppText tone="muted">{`Valid until ${formatExpiry(submit.data.expiresAt)}`}</AppText>
        <Button label="Continue" onPress={() => nav.replace('/onboarding')} />
      </Screen>
    );
  }

  if (questionnaire.isPending) {
    return (
      <Screen testID="risk-loading">
        <AppText tone="muted">Loading…</AppText>
      </Screen>
    );
  }

  const parsed = questionnaire.isError
    ? null
    : QuestionsSchema.safeParse(questionnaire.data.questions);
  if (questionnaire.isError || !parsed?.success) {
    return (
      <Screen testID="risk-error">
        <Banner
          tone="error"
          message={messageForError(
            questionnaire.isError ? toApiError(questionnaire.error).code : 'INTERNAL',
          )}
        />
        <Button
          label="Try again"
          onPress={() => {
            void questionnaire.refetch();
          }}
        />
      </Screen>
    );
  }

  const scored = parsed.data.filter((q) => q.options && ANSWER_KEY[q.id]);
  const dobValid = isPastDate(dob);
  const ready = dobValid && scored.every((q) => answers[q.id]);

  const send = () => {
    const body: Record<string, string> = { dob };
    for (const q of scored) {
      const key = ANSWER_KEY[q.id];
      const value = answers[q.id];
      if (key && value) body[key] = value;
    }
    // The server is the authority on the enum values (strict schema), so a stale option is a VALIDATION_FAILED.
    submit.mutate(body as RiskAnswers);
  };

  return (
    <Screen testID="risk-questionnaire-screen">
      <AppText variant="title">Your risk profile</AppText>
      {submit.isError ? (
        <Banner tone="error" message={messageForError(toApiError(submit.error).code)} />
      ) : null}
      <View style={styles.stack}>
        <TextField
          label="Date of birth"
          value={dob}
          onChangeText={setDob}
          placeholder="YYYY-MM-DD"
          hint="Used only to score your age."
          error={dob !== '' && !dobValid ? 'Enter a past date as YYYY-MM-DD' : undefined}
        />
        {scored.map((q) => (
          <RadioGroup
            key={q.id}
            label={q.text}
            options={q.options ?? []}
            value={answers[q.id] ?? null}
            onChange={(value) => setAnswers((prev) => ({ ...prev, [q.id]: value }))}
          />
        ))}
        <Button
          label="See my risk profile"
          disabled={!ready}
          loading={submit.isPending}
          onPress={send}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ stack: { gap: space(4) } });
