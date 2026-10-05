import { toApiError } from '@sanchay/api-client';
import { messageForError } from '@sanchay/app-core';
import { AppText, Banner, Card } from '@sanchay/ui';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '../api/ApiContext';
import { redemptionStatusCopy, TERMINAL_ORDER_STATUSES } from './redemption-copy';

/** CNF-02 polls every 2-3 s (journeys); after ~3 minutes the investor is told an email follows. */
export const ORDER_POLL_MS = 3000;
export const ORDER_POLL_MAX = 60;

export interface PayoutStatusProps {
  orderId: string;
  /** Poll interval while the order is not final; tests pass a small value. */
  pollIntervalMs?: number | undefined;
}

/** A redemption's status and payout (CNF-02 redemption variant, spec §4.4 payout row). */
export function PayoutStatus({ orderId, pollIntervalMs = ORDER_POLL_MS }: PayoutStatusProps) {
  const { utils } = useApi();
  const order = useQuery({
    ...utils.orders.get.queryOptions({ input: { id: orderId } }),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status !== undefined && TERMINAL_ORDER_STATUSES.has(status)) return false;
      return query.state.dataUpdateCount < ORDER_POLL_MAX ? pollIntervalMs : false;
    },
  });

  if (order.isPending) {
    return (
      <Card testID="payout-status">
        <AppText tone="muted">Loading your withdrawal…</AppText>
      </Card>
    );
  }
  if (order.isError) {
    return (
      <Card testID="payout-status">
        <Banner tone="error" message={messageForError(toApiError(order.error).code)} />
      </Card>
    );
  }

  const copy = redemptionStatusCopy(order.data);
  const stillMoving = !TERMINAL_ORDER_STATUSES.has(order.data.status);
  return (
    <Card testID="payout-status">
      <AppText variant="heading" tone={copy.tone === 'danger' ? 'danger' : 'default'}>
        {copy.title}
      </AppText>
      {copy.detail ? <AppText>{copy.detail}</AppText> : null}
      {stillMoving ? (
        <AppText tone="muted">We'll also email you when the fund house processes it.</AppText>
      ) : null}
    </Card>
  );
}
