import { newIdempotencyKey, toApiError } from '@sanchay/api-client';
import { messageForError } from '@sanchay/app-core';
import { formatInr, Money } from '@sanchay/money';
import { space } from '@sanchay/tokens';
import { AppText, Banner, Button, Screen } from '@sanchay/ui';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, StyleSheet, View } from 'react-native';
import { useApi } from '../api/ApiContext';
import { useNav } from '../nav/NavContext';
import { usePlatform } from '../platform/PlatformContext';
import { ENACH_LADDER_NOTE, mandateLimitLine } from './sipCopy';

export interface MandateScreenProps {
  mandateId: string;
  /** MND-03 polls every 3 s for up to 10 minutes; tests pass a shorter interval. */
  pollMs?: number | undefined;
}

const POLL_WINDOW_MS = 10 * 60_000;
const TERMINAL = new Set(['APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'CONSENT_EXPIRED']);
const FAILED = new Set(['REJECTED', 'CANCELLED', 'EXPIRED', 'CONSENT_EXPIRED']);

/** MND-03 headline per D5 MANDATE status and F3 rail. */
export function mandateHeadline(status: string, limitAmount: string, rail = 'UPI_AUTOPAY'): string {
  const enach = rail === 'ENACH';
  switch (status) {
    case 'AUTH_PENDING':
      return enach
        ? "Authorise the mandate with netbanking or your debit card on your bank's page."
        : `Approve the ${formatInr(Money.parse(limitAmount))} autopay request in your UPI app with your UPI PIN.`;
    case 'BANK_PENDING':
      return enach
        ? 'Your bank is confirming this mandate. This can take 2–7 working days; we will let you know.'
        : 'Your bank is confirming this mandate. We will let you know when it is active.';
    case 'APPROVED':
      return 'Mandate approved. Your SIP is being registered with the fund house.';
    case 'RECONCILING':
      return 'Checking the mandate status with your bank…';
    case 'REJECTED':
    case 'CANCELLED':
      return 'This mandate could not be set up. Nothing was debited.';
    case 'EXPIRED':
    case 'CONSENT_EXPIRED':
      return 'This mandate request expired before it was approved. Nothing was debited.';
    default:
      return 'Setting up your mandate…';
  }
}

/**
 * SIP-02/MND-03. In the MVP the server chooses the mandate (F2: reuse an APPROVED one with headroom,
 * else a new UPI Autopay mandate), so this screen is the authorisation and status step. It polls
 * `mandates.get`, refetches when the app returns to the foreground, and opens the UPI intent with
 * `Linking.openURL` (web: the browser hands the upi:// link to a UPI app; Android: the UPI app chooser).
 */
export function MandateScreen({ mandateId, pollMs = 3000 }: MandateScreenProps) {
  const { client } = useApi();
  const nav = useNav();
  const platform = usePlatform();
  const startedAt = useRef(Date.now());
  const [reminting, setReminting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remintKey = useRef<string | null>(null);

  const mandate = useQuery({
    queryKey: ['mandate', mandateId],
    queryFn: () => client.mandates.get({ id: mandateId }),
    refetchInterval: (query) => {
      const status = query.state.data?.status ?? '';
      if (TERMINAL.has(status)) return false;
      return Date.now() - startedAt.current < POLL_WINDOW_MS ? pollMs : false;
    },
  });
  const { refetch } = mandate;

  useEffect(() => {
    // Back from the UPI app (or the bank page): read the status at once.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refetch();
    });
    return () => subscription.remove();
  }, [refetch]);

  if (mandate.isPending) {
    return (
      <Screen testID="mandate-loading">
        <AppText tone="muted">Loading…</AppText>
      </Screen>
    );
  }
  if (mandate.isError) {
    return (
      <Screen testID="mandate-error">
        <Banner tone="error" message={messageForError(toApiError(mandate.error).code)} />
        <Button
          label="Try again"
          onPress={() => {
            void refetch();
          }}
        />
      </Screen>
    );
  }

  const m = mandate.data;
  const remint = async () => {
    setReminting(true);
    setError(null);
    remintKey.current ??= newIdempotencyKey();
    try {
      await client.mandates.authorize(
        { id: mandateId },
        { context: { idempotencyKey: remintKey.current } },
      );
      remintKey.current = null;
      startedAt.current = Date.now();
      await refetch();
    } catch (err) {
      setError(messageForError(toApiError(err).code));
    } finally {
      setReminting(false);
    }
  };

  return (
    <Screen testID="mandate-screen">
      <View style={styles.stack}>
        <AppText variant="title">Mandate</AppText>
        {error ? <Banner tone="error" message={error} /> : null}
        <AppText testID="mandate-headline">
          {mandateHeadline(m.status, m.limitAmount, m.rail)}
        </AppText>
        <AppText tone="muted">{mandateLimitLine(m.rail, m.limitAmount)}</AppText>
        {m.rail === 'ENACH' ? (
          <AppText variant="caption" tone="muted">
            {ENACH_LADDER_NOTE}
          </AppText>
        ) : null}
        {m.status === 'AUTH_PENDING' && m.rail === 'ENACH' && m.authUrl !== null ? (
          <Button
            label="Continue to your bank"
            onPress={() => {
              // Web: a new tab; Android: a Custom Tab auth session (H-1). Back here, AppState refetches.
              if (m.authUrl !== null)
                void platform.openAuthSession(m.authUrl).then(() => refetch());
            }}
          />
        ) : null}
        {m.status === 'AUTH_PENDING' && m.upiUri !== null ? (
          <>
            <Button
              label="Open UPI app"
              onPress={() => {
                if (m.upiUri !== null) void Linking.openURL(m.upiUri);
              }}
            />
            <AppText variant="caption" tone="muted">
              On a computer? Open Sanchay on your phone to approve with your UPI app.
            </AppText>
            <Button
              variant="secondary"
              label="Send a new request"
              loading={reminting}
              onPress={() => {
                void remint();
              }}
            />
          </>
        ) : null}
        {m.status === 'APPROVED' ? (
          <Button label="View my SIPs" onPress={() => nav.replace('/portfolio/sips')} />
        ) : null}
        {FAILED.has(m.status) ? (
          <Button label="Back to my SIPs" onPress={() => nav.replace('/portfolio/sips')} />
        ) : null}
        {!TERMINAL.has(m.status) ? (
          <Button
            variant="secondary"
            label="Check again"
            onPress={() => {
              void refetch();
            }}
          />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ stack: { gap: space(4) } });
