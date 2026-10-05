import { toApiError } from '@sanchay/api-client';
import { messageForError } from '@sanchay/app-core';
import { formatInr, formatIsoDate, Money } from '@sanchay/money';
import { space } from '@sanchay/tokens';
import {
  AmountInput,
  AppText,
  Banner,
  Button,
  Chip,
  Screen,
  SegmentedControl,
  TextField,
} from '@sanchay/ui';
import { amountSchema } from '@sanchay/validation';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useApi } from '../api/ApiContext';
import { useNav } from '../nav/NavContext';
import { type MandateRailChoice, ordinalDay, RAIL_OPTIONS } from './sipCopy';
import { useSipDraft } from './useSipDraft';

export interface SipSetupScreenProps {
  schemeId: string;
}

type Duration = 'UNTIL_CANCELLED' | 'FIXED';

const DURATION_OPTIONS = [
  { value: 'UNTIL_CANCELLED', label: 'Until I cancel' },
  { value: 'FIXED', label: 'Fixed number' },
];

/** 1..360 instalments (spec §1.3); "Until I cancel" is sent as null. */
function parseCount(raw: string): number | null {
  if (!/^\d{1,3}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 && n <= 360 ? n : null;
}

/**
 * SIP-01. Monthly only (H-15), day chips are the scheme's `sip_dates` ∩ 1–28 with none preselected
 * (D-MONEY-026), and every limit comes from `plans.quoteSip` (F10), never from a client constant.
 */
export function SipSetupScreen({ schemeId }: SipSetupScreenProps) {
  const { client } = useApi();
  const nav = useNav();
  const draft = useSipDraft(schemeId);
  const saved = draft.read();
  const [amount, setAmount] = useState(saved?.amount ?? '');
  const [day, setDay] = useState<number | null>(saved?.installmentDay ?? null);
  const [duration, setDuration] = useState<Duration>(
    saved?.numberOfInstalments == null ? 'UNTIL_CANCELLED' : 'FIXED',
  );
  const [count, setCount] = useState(
    saved?.numberOfInstalments == null ? '' : String(saved.numberOfInstalments),
  );
  const [submitted, setSubmitted] = useState(false);
  const [rail, setRail] = useState<MandateRailChoice>(saved?.rail ?? 'UPI_AUTOPAY');
  // F13: the rail changes the maximum (UPI Autopay ₹1,00,000; eNACH by the F3 ladder). UPI is the
  // server default, so it is not sent.
  const railInput = rail === 'ENACH' ? { rail } : {};

  const limits = useQuery({
    queryKey: ['sipQuote', schemeId, rail],
    queryFn: () => client.plans.quoteSip({ schemeId, ...railInput }),
    placeholderData: (previous) => previous,
  });
  const dated = useQuery({
    queryKey: ['sipQuote', schemeId, rail, day],
    queryFn: () => client.plans.quoteSip({ schemeId, installmentDay: day, ...railInput }),
    enabled: day !== null,
  });

  if (limits.isPending) {
    return (
      <Screen testID="sip-setup-loading">
        <AppText tone="muted">Loading…</AppText>
      </Screen>
    );
  }
  if (limits.isError) {
    return (
      <Screen testID="sip-setup-error">
        <Banner tone="error" message={messageForError(toApiError(limits.error).code)} />
        <Button
          label="Try again"
          onPress={() => {
            void limits.refetch();
          }}
        />
      </Screen>
    );
  }

  const quote = limits.data;
  const minimum = Money.parse(quote.minimumAmount);
  const maximum = Money.parse(quote.maximumAmount);
  const multiple = Money.parse(quote.multiple);
  const parsedAmount = amountSchema({ min: minimum, max: maximum, multipleOf: multiple }).safeParse(
    amount,
  );
  const amountError = parsedAmount.success ? null : (parsedAmount.error.issues[0]?.message ?? null);
  const parsedCount = duration === 'FIXED' ? parseCount(count) : null;
  const countError =
    duration === 'FIXED' && parsedCount === null ? 'Enter between 1 and 360 instalments.' : null;
  const firstInstalmentDate = day === null ? null : (dated.data?.firstInstalmentDate ?? null);

  const submit = () => {
    setSubmitted(true);
    if (!parsedAmount.success || day === null || countError !== null) return;
    if (firstInstalmentDate === null) return;
    draft.save({
      amount: parsedAmount.data.toWire(),
      installmentDay: day,
      numberOfInstalments: parsedCount,
      quotedFirstInstalmentDate: firstInstalmentDate,
      ...railInput,
    });
    nav.push(`/invest/${schemeId}/sip/review`);
  };

  return (
    <Screen testID="sip-setup-screen">
      <View style={styles.stack}>
        <AppText variant="title">{quote.schemeName}</AppText>
        <AppText tone="muted">Monthly SIP</AppText>
        <SegmentedControl
          label="Pay by"
          value={rail}
          options={RAIL_OPTIONS}
          onChange={(value) => setRail(value === 'ENACH' ? 'ENACH' : 'UPI_AUTOPAY')}
        />
        <AmountInput
          label="Monthly amount"
          value={amount}
          onChangeValue={setAmount}
          testID="sip-amount-input"
          hint={`Minimum ${formatInr(minimum)}, in multiples of ${formatInr(multiple)}, up to ${formatInr(maximum)}`}
          error={submitted ? (amountError ?? undefined) : undefined}
        />
        <View style={styles.stack}>
          <AppText variant="caption">SIP date</AppText>
          <View style={styles.chips} testID="sip-day-chips">
            {quote.availableDays.map((d) => (
              <Chip
                key={d}
                label={ordinalDay(d)}
                selected={d === day}
                onPress={() => setDay(d)}
                testID={`sip-day-${d}`}
              />
            ))}
          </View>
          {submitted && day === null ? (
            <AppText variant="caption" tone="danger" role="alert">
              Choose a SIP date.
            </AppText>
          ) : null}
          {firstInstalmentDate !== null ? (
            <AppText testID="sip-first-instalment">
              {`First instalment on ${formatIsoDate(firstInstalmentDate)}`}
            </AppText>
          ) : null}
        </View>
        <SegmentedControl
          label="Duration"
          value={duration}
          options={DURATION_OPTIONS}
          onChange={(value) => setDuration(value === 'FIXED' ? 'FIXED' : 'UNTIL_CANCELLED')}
        />
        {duration === 'FIXED' ? (
          <TextField
            label="Number of instalments"
            value={count}
            onChangeText={(raw) => setCount(raw.replace(/\D/g, '').slice(0, 3))}
            inputMode="numeric"
            error={submitted ? (countError ?? undefined) : undefined}
          />
        ) : null}
        <Button label="Continue" onPress={submit} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space(3) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
});
