import { type ApiClient, toApiError } from '@sanchay/api-client';
import { messageForError } from '@sanchay/app-core';
import { equalSplit, MAX_NOMINEES } from '@sanchay/domain';
import { space } from '@sanchay/tokens';
import { AppText, Banner, Button, Card, Checkbox, Screen, Select, TextField } from '@sanchay/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useApi } from '../api/ApiContext';
import { newIntentKey } from '../common/intentKey';
import { useNav } from '../nav/NavContext';

type PutNominationInput = Parameters<ApiClient['onboarding']['putNomination']>[0];
type NomineeInput = NonNullable<PutNominationInput['nominees']>[number];
type Relationship = NomineeInput['relationship'];
type IdType = NonNullable<NomineeInput['idType']>;

/** Typed by the contract's union, so a relationship added there is a type error here until it has a label. */
const RELATIONSHIP_LABEL: Record<Relationship, string> = {
  FATHER: 'Father',
  MOTHER: 'Mother',
  SPOUSE: 'Spouse',
  SON: 'Son',
  DAUGHTER: 'Daughter',
  BROTHER: 'Brother',
  SISTER: 'Sister',
  GRANDFATHER: 'Grandfather',
  GRANDMOTHER: 'Grandmother',
  GRANDSON: 'Grandson',
  GRANDDAUGHTER: 'Granddaughter',
  OTHERS: 'Others',
};
const RELATIONSHIP_OPTIONS = (Object.keys(RELATIONSHIP_LABEL) as Relationship[]).map((value) => ({
  value,
  label: RELATIONSHIP_LABEL[value],
}));

const ID_TYPE_LABEL: Record<IdType, string> = {
  PAN: 'PAN',
  DRIVING_LICENCE: 'Driving licence',
  PASSPORT: 'Passport',
};
const NO_ID = 'NONE';

interface DraftNominee {
  name: string;
  relationship: Relationship | null;
  idType: IdType | null;
  idValue: string;
  /** Kept as typed text so clearing the field to retype it does not leave a stray 0. */
  share: string;
  isMinor: boolean;
  dob: string;
  guardianName: string;
}

function blankNominee(share: number): DraftNominee {
  return {
    name: '',
    relationship: null,
    idType: null,
    idValue: '',
    share: String(share),
    isMinor: false,
    dob: '',
    guardianName: '',
  };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isIsoDate = (value: string): boolean =>
  ISO_DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

type BuiltNominees = { error: string } | { nominees: NomineeInput[] };

/** The wire nominees, or the first problem with the draft as investor-facing copy. */
function buildNominees(drafts: DraftNominee[]): BuiltNominees {
  const nominees: NomineeInput[] = [];
  for (const n of drafts) {
    if (n.name.trim() === '' || n.relationship === null) {
      return { error: 'Enter each nominee’s name and relationship.' };
    }
    if (n.isMinor && (!isIsoDate(n.dob) || n.guardianName.trim() === '')) {
      return { error: 'Enter the date of birth and the guardian’s name for every minor nominee.' };
    }
    if (n.dob !== '' && !isIsoDate(n.dob)) {
      return { error: 'Enter each date of birth as YYYY-MM-DD.' };
    }
    if (n.idType !== null && n.idValue.trim() === '') {
      return { error: 'Enter the number for each ID you choose, or choose no ID.' };
    }
    if (!/^\d{1,3}$/.test(n.share) || Number(n.share) < 1 || Number(n.share) > 100) {
      return { error: 'Each share must be a whole number between 1 and 100.' };
    }
    nominees.push({
      name: n.name.trim(),
      relationship: n.relationship,
      isMinor: n.isMinor,
      ...(n.dob === '' ? {} : { dob: n.dob }),
      ...(n.isMinor ? { guardianName: n.guardianName.trim() } : {}),
      ...(n.idType === null ? {} : { idType: n.idType, idValue: n.idValue.trim() }),
      allocationPct: Number(n.share),
    });
  }
  const total = nominees.reduce((sum, n) => sum + (n.allocationPct ?? 0), 0);
  return total === 100
    ? { nominees }
    : { error: `Shares must add up to exactly 100% (now ${total}%).` };
}

/** ONB-12/13/14: add up to MAX_NOMINEES nominees with their shares, or opt out of nominating. */
export function NomineesScreen() {
  const { client, utils } = useApi();
  const nav = useNav();
  const queryClient = useQueryClient();
  const existing = useQuery(utils.onboarding.getNomination.queryOptions());
  const [nominees, setNominees] = useState<DraftNominee[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const save = useMutation({
    // One Idempotency-Key per tap: a retry after a failed call is a new intent with the same body.
    mutationFn: (input: PutNominationInput) =>
      client.onboarding.putNomination(input, { context: { idempotencyKey: newIntentKey() } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: utils.onboarding.get.key() });
      await queryClient.invalidateQueries({ queryKey: utils.onboarding.getNomination.key() });
      nav.replace('/onboarding');
    },
  });

  const addNominee = () => {
    setNominees((prev) => {
      if (prev.length >= MAX_NOMINEES) return prev;
      const count = (prev.length + 1) as 1 | 2 | 3;
      const shares = equalSplit(count);
      return [...prev, blankNominee(0)].map((n, i) => ({ ...n, share: String(shares[i] ?? 0) }));
    });
  };

  const removeNominee = (index: number) => {
    setNominees((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) return next;
      const shares = equalSplit(next.length as 1 | 2 | 3);
      return next.map((n, i) => ({ ...n, share: String(shares[i] ?? 0) }));
    });
  };

  const updateNominee = (index: number, patch: Partial<DraftNominee>) => {
    setNominees((prev) => prev.map((n, i) => (i === index ? { ...n, ...patch } : n)));
  };

  const submit = () => {
    setFormError(null);
    const built = buildNominees(nominees);
    if ('error' in built) {
      setFormError(built.error);
      return;
    }
    save.mutate({ decision: 'NOMINATED', nominees: built.nominees });
  };

  if (existing.isPending) {
    return (
      <Screen testID="nominees-loading">
        <AppText tone="muted">Loading…</AppText>
      </Screen>
    );
  }

  const saved = existing.data?.decision !== undefined && existing.data.decision !== 'NOT_ASKED';

  return (
    <Screen testID="nominees-screen">
      <AppText variant="title">Add nominees</AppText>
      <AppText tone="muted">{`You can add up to ${MAX_NOMINEES} nominees. Their shares must add up to 100%.`}</AppText>
      {saved ? (
        <Banner
          tone="info"
          message="You have already saved a nomination. Saving here replaces it."
        />
      ) : null}
      {formError ? <Banner tone="error" message={formError} /> : null}
      {save.isError ? (
        <Banner tone="error" message={messageForError(toApiError(save.error).code)} />
      ) : null}
      <View style={styles.stack}>
        {nominees.map((n, i) => (
          // The list has no ids and only ever grows at the end or is renumbered by position.
          // biome-ignore lint/suspicious/noArrayIndexKey: a draft nominee is identified by its position
          <Card key={i} testID={`nominee-${i}`}>
            <TextField
              label="Full name"
              value={n.name}
              onChangeText={(v) => updateNominee(i, { name: v })}
              maxLength={40}
            />
            <Select
              label="Relationship"
              placeholder="Select"
              value={n.relationship}
              options={RELATIONSHIP_OPTIONS}
              onChange={(v) => updateNominee(i, { relationship: v as Relationship })}
            />
            <TextField
              label="Date of birth"
              value={n.dob}
              onChangeText={(v) => updateNominee(i, { dob: v })}
              placeholder="YYYY-MM-DD"
            />
            <TextField
              label="Share %"
              value={n.share}
              onChangeText={(v) => updateNominee(i, { share: v })}
              inputMode="numeric"
              maxLength={3}
            />
            <Checkbox
              label="Nominee is a minor"
              checked={n.isMinor}
              onChange={(checked) =>
                updateNominee(i, {
                  isMinor: checked,
                  // PAN is for adults only (H-12), and the guardian belongs to a minor.
                  ...(checked && n.idType === 'PAN' ? { idType: null, idValue: '' } : {}),
                  ...(checked ? {} : { guardianName: '' }),
                })
              }
            />
            {n.isMinor ? (
              <TextField
                label="Guardian name"
                value={n.guardianName}
                onChangeText={(v) => updateNominee(i, { guardianName: v })}
                maxLength={35}
              />
            ) : null}
            <Select
              label="ID (optional)"
              placeholder="No ID"
              value={n.idType ?? NO_ID}
              options={[
                { value: NO_ID, label: 'No ID' },
                ...(Object.keys(ID_TYPE_LABEL) as IdType[])
                  .filter((type) => !(n.isMinor && type === 'PAN'))
                  .map((type) => ({ value: type, label: ID_TYPE_LABEL[type] })),
              ]}
              onChange={(v) =>
                updateNominee(
                  i,
                  v === NO_ID ? { idType: null, idValue: '' } : { idType: v as IdType },
                )
              }
            />
            {n.idType ? (
              <TextField
                label="ID number"
                value={n.idValue}
                onChangeText={(v) => updateNominee(i, { idValue: v })}
                autoCapitalize="characters"
              />
            ) : null}
            <Button variant="secondary" label="Remove nominee" onPress={() => removeNominee(i)} />
          </Card>
        ))}
        {nominees.length < MAX_NOMINEES ? (
          <Button variant="secondary" label="Add nominee" onPress={addNominee} />
        ) : null}
        {nominees.length > 0 ? (
          <Button label="Save nomination" loading={save.isPending} onPress={submit} />
        ) : (
          <Button
            variant="secondary"
            label="I don’t want to add a nominee"
            loading={save.isPending}
            onPress={() => save.mutate({ decision: 'OPTED_OUT' })}
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ stack: { gap: space(4) } });
