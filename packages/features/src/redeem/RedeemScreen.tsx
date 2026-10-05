import { toApiError } from '@sanchay/api-client';
import { messageForError } from '@sanchay/app-core';
import {
  formatInr,
  formatIsoDate,
  formatNav,
  formatUnits,
  Money,
  Nav,
  Units,
} from '@sanchay/money';
import { space } from '@sanchay/tokens';
import {
  AmountInput,
  AppText,
  Banner,
  Button,
  Card,
  ListRow,
  Screen,
  SegmentedControl,
  TextField,
} from '@sanchay/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useApi } from '../api/ApiContext';
import { useNav } from '../nav/NavContext';
import { PayoutStatus } from './PayoutStatus';
import { RedeemReviewScreen } from './RedeemReviewScreen';
import {
  allNote,
  amountError,
  availabilityLine,
  bufferNote,
  draftFrom,
  formatCutoff,
  leftResidual,
  lockNote,
  payoutBankLine,
  pendingNote,
  providerShortNote,
  type ReadyQuote,
  type RedeemMode,
  type RedemptionDraft,
  redeemModeOptions,
  sanitizeUnitsInput,
  UNITS_UNAVAILABLE_COPY,
  unitsError,
} from './redemption-copy';

/** R-09: while the snapshot refreshes the quote answers REFRESHING; poll it for up to ~2 minutes. */
export const QUOTE_REFRESH_MS = 3000;
export const QUOTE_REFRESH_MAX = 40;

export interface RedeemScreenProps {
  folioId: string;
  isin: string;
  /** Poll interval while the quote is REFRESHING; tests pass a small value. */
  refreshIntervalMs?: number | undefined;
  /** Poll interval for the placed order's status; tests pass a small value. */
  orderPollMs?: number | undefined;
}

type Step =
  | { kind: 'setup'; initialMode?: 'ALL' }
  | { kind: 'review'; draft: RedemptionDraft }
  | { kind: 'placed'; orderId: string };

/**
 * The redeem flow for one holding: RED-01 setup → RED-02 review → CNF-01 → CNF-02 with the payout
 * status. The draft stays in memory (no amount in the URL); the server re-checks everything.
 */
export function RedeemScreen({
  folioId,
  isin,
  refreshIntervalMs = QUOTE_REFRESH_MS,
  orderPollMs,
}: RedeemScreenProps) {
  const { utils } = useApi();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>({ kind: 'setup' });
  const input = { folioId, isin };
  const quoteKey = utils.orders.quoteRedemption.queryKey({ input });
  const quote = useQuery({
    ...utils.orders.quoteRedemption.queryOptions({ input }),
    enabled: step.kind === 'setup',
    refetchInterval: (query) =>
      query.state.data?.status === 'REFRESHING' && query.state.dataUpdateCount < QUOTE_REFRESH_MAX
        ? refreshIntervalMs
        : false,
  });

  const backToSetup = () => {
    void queryClient.invalidateQueries({ queryKey: quoteKey });
    // F17: a UNITS draft refused because the flag was switched off re-reads it too.
    void queryClient.invalidateQueries({ queryKey: utils.meta.appConfig.queryKey() });
    setStep({ kind: 'setup' });
  };

  if (step.kind === 'placed') {
    return (
      <RedemptionPlaced
        orderId={step.orderId}
        pollIntervalMs={orderPollMs}
        onRedeemRemaining={() => {
          void queryClient.invalidateQueries({ queryKey: quoteKey });
          setStep({ kind: 'setup', initialMode: 'ALL' });
        }}
      />
    );
  }

  if (quote.isPending) {
    return (
      <Screen testID="redeem-loading">
        <AppText tone="muted">Loading your holding…</AppText>
      </Screen>
    );
  }
  if (quote.isError) {
    return (
      <Screen testID="redeem-error">
        <Banner tone="error" message={messageForError(toApiError(quote.error).code)} />
        <Button
          label="Try again"
          onPress={() => {
            void quote.refetch();
          }}
        />
      </Screen>
    );
  }
  if (quote.data.status === 'REFRESHING') {
    const gaveUp = (queryClient.getQueryState(quoteKey)?.dataUpdateCount ?? 0) >= QUOTE_REFRESH_MAX;
    return (
      <Screen testID="redeem-refreshing">
        <AppText variant="title">Withdraw</AppText>
        <Banner
          tone="info"
          message={
            gaveUp
              ? 'Updating your holdings is taking longer than usual.'
              : 'Updating your holdings from the registrar…'
          }
        />
        {gaveUp ? (
          <Button
            label="Try again"
            onPress={() => {
              void queryClient.resetQueries({ queryKey: quoteKey });
            }}
          />
        ) : null}
      </Screen>
    );
  }

  if (step.kind === 'review') {
    return (
      <RedeemReviewScreen
        quote={quote.data}
        draft={step.draft}
        onBack={backToSetup}
        onPlaced={(orderId) => setStep({ kind: 'placed', orderId })}
      />
    );
  }

  return (
    <RedeemSetup
      quote={quote.data}
      initialMode={step.initialMode ?? null}
      onContinue={(draft) => setStep({ kind: 'review', draft })}
    />
  );
}

interface RedemptionPlacedProps {
  orderId: string;
  pollIntervalMs: number | undefined;
  onRedeemRemaining(): void;
}

/** CNF-02 (redemption): status and payout, then "Redeem remaining" after an ALL that left a residual. */
function RedemptionPlaced({ orderId, pollIntervalMs, onRedeemRemaining }: RedemptionPlacedProps) {
  const { utils } = useApi();
  const nav = useNav();
  // Same query key as PayoutStatus, which polls it; this observer only reads the cached order.
  const order = useQuery(utils.orders.get.queryOptions({ input: { id: orderId } }));
  return (
    <Screen testID="redeem-placed">
      <AppText variant="title">Withdrawal</AppText>
      <PayoutStatus orderId={orderId} pollIntervalMs={pollIntervalMs} />
      {order.data !== undefined && leftResidual(order.data) ? (
        <Button label="Redeem remaining" onPress={onRedeemRemaining} />
      ) : null}
      <Button
        variant="secondary"
        label="View order"
        onPress={() => nav.push(`/portfolio/orders/${orderId}`)}
      />
      <Button variant="secondary" label="Go to portfolio" onPress={() => nav.push('/portfolio')} />
    </Screen>
  );
}

interface RedeemSetupProps {
  quote: ReadyQuote;
  /** "Redeem remaining" reopens RED-01 with All preselected; otherwise nothing is (journeys §4.11). */
  initialMode: 'ALL' | null;
  onContinue(draft: RedemptionDraft): void;
}

/** RED-01 (journeys §4.11): mode (no default), amount with its ceiling, ALL decision, info blocks. */
function RedeemSetup({ quote, initialMode, onContinue }: RedeemSetupProps) {
  const { utils } = useApi();
  // F17 (T5): Units is offered only while F6's features.redeemByUnits is on (E2 meta.appConfig).
  const appConfig = useQuery(utils.meta.appConfig.queryOptions());
  const unitsEnabled = appConfig.data?.flags.redeemByUnits === true;
  const [chosen, setMode] = useState<RedeemMode | null>(initialMode);
  const mode = chosen === 'UNITS' && !unitsEnabled ? null : chosen;
  const [raw, setRaw] = useState('');
  const [unitsRaw, setUnitsRaw] = useState('');
  const maxAmount = Money.parseNullable(quote.maxAmount);
  const amountIssue = maxAmount === null ? null : amountError(raw, maxAmount);
  const available = Units.platform(quote.availableUnits);
  const unitsIssue = unitsError(unitsRaw, available);
  const draft = draftFrom(mode, mode === 'UNITS' ? unitsRaw : raw, quote);

  const notes = [lockNote(quote), pendingNote(quote), providerShortNote(quote)].filter(
    (note): note is string => note !== null,
  );

  return (
    <Screen testID="redeem-screen">
      <AppText variant="title">Withdraw</AppText>
      <AppText variant="heading">{quote.schemeName}</AppText>
      <Card>
        <AppText>{availabilityLine(quote)}</AppText>
        {notes.map((note) => (
          <AppText key={note} tone="muted">
            {note}
          </AppText>
        ))}
      </Card>
      <SegmentedControl
        label="Redeem by"
        value={mode}
        options={redeemModeOptions(unitsEnabled)}
        onChange={(value) => setMode(value === 'ALL' || value === 'UNITS' ? value : 'AMOUNT')}
      />
      {appConfig.isSuccess && !unitsEnabled ? (
        <AppText variant="caption" tone="muted">
          {UNITS_UNAVAILABLE_COPY}
        </AppText>
      ) : null}
      {mode === null ? <AppText tone="muted">Choose how much to redeem.</AppText> : null}
      {mode === 'AMOUNT' ? (
        maxAmount === null || !maxAmount.isPositive() ? (
          <Banner
            tone="info"
            message={messageForError(
              maxAmount === null ? 'NAV_UNAVAILABLE' : 'INSUFFICIENT_REDEEMABLE',
            )}
          />
        ) : (
          <View style={styles.stack}>
            <AppText>{`Available now: up to ${formatInr(maxAmount)}`}</AppText>
            <AmountInput
              label="Withdrawal amount"
              value={raw}
              onChangeValue={setRaw}
              error={amountIssue ?? undefined}
            />
            <AppText variant="caption" tone="muted">
              {bufferNote(quote)}
            </AppText>
          </View>
        )
      ) : null}
      {mode === 'UNITS' ? (
        <View style={styles.stack}>
          <TextField
            label="Units to redeem"
            value={unitsRaw}
            inputMode="decimal"
            onChangeText={(value) => setUnitsRaw(sanitizeUnitsInput(value))}
            hint={`Available now: up to ${formatUnits(available)} units`}
            error={unitsIssue ?? undefined}
          />
          <AppText variant="caption" tone="muted">
            {`The units are redeemed exactly; the amount depends on the NAV of ${formatIsoDate(quote.exitNavDate)}.`}
          </AppText>
        </View>
      ) : null}
      {mode === 'ALL' ? (
        quote.all.kind === 'REFUSED' ? (
          <Banner tone="info" message={allNote(quote.all)} />
        ) : (
          <AppText testID="redeem-all-note">{allNote(quote.all)}</AppText>
        )
      ) : null}
      <Card>
        <ListRow
          label="NAV"
          value={`${formatNav(Nav.parse(quote.nav))} on ${formatIsoDate(quote.navDate)}`}
        />
        <ListRow label="Expected NAV date" value={formatIsoDate(quote.exitNavDate)} />
        <ListRow label="Payout to" value={payoutBankLine(quote.payoutBank)} />
        <AppText variant="caption" tone="muted">
          {`Requests placed before ${formatCutoff(quote.displayCutoff)} on a business day get that day's NAV. The payout goes to the bank registered with your folio.`}
        </AppText>
      </Card>
      <Button
        label="Continue"
        disabled={draft === null}
        onPress={() => {
          if (draft !== null) onContinue(draft);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({ stack: { gap: space(2) } });
