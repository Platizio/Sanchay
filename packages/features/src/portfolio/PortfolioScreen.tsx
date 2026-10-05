import { toApiError } from '@sanchay/api-client';
import { messageForError } from '@sanchay/app-core';
import { AppText, Banner, Button, Card, Screen } from '@sanchay/ui';
import { useNav } from '../nav/NavContext';
import { AllocationList } from './AllocationList';
import { HoldingsList } from './HoldingsList';
import { PortfolioSegments } from './PortfolioSegments';
import { PortfolioSummaryCard } from './PortfolioSummaryCard';
import { inr, isPositiveWire } from './portfolio-format';
import { usePortfolioAllocation, usePortfolioHoldings, usePortfolioSummary } from './usePortfolio';

/** PORT-01 (Portfolio tab, segment "Holdings"). */
export function PortfolioScreen() {
  const nav = useNav();
  const summary = usePortfolioSummary();
  const holdings = usePortfolioHoldings();
  const allocation = usePortfolioAllocation();

  if (summary.isPending || holdings.isPending || allocation.isPending) {
    return (
      <Screen testID="portfolio-loading">
        <PortfolioSegments active="holdings" />
        <AppText tone="muted">Loading your portfolio…</AppText>
      </Screen>
    );
  }

  const failed = summary.error ?? holdings.error ?? allocation.error;
  if (failed || !summary.data || !holdings.data || !allocation.data) {
    return (
      <Screen testID="portfolio-error">
        <PortfolioSegments active="holdings" />
        <Banner tone="error" message={messageForError(toApiError(failed).code)} />
        <Button
          label="Try again"
          onPress={() => {
            void summary.refetch();
            void holdings.refetch();
            void allocation.refetch();
          }}
        />
      </Screen>
    );
  }

  const s = summary.data;
  if (holdings.data.length === 0) {
    return (
      <Screen testID="portfolio-empty">
        <AppText variant="title">Portfolio</AppText>
        <PortfolioSegments active="holdings" />
        <Card>
          <AppText>You don't have any investments yet.</AppText>
          {s.pending.count > 0 && isPositiveWire(s.pending.amount) ? (
            <AppText tone="muted">{`${inr(s.pending.amount)} being invested`}</AppText>
          ) : null}
          <Button label="Explore funds" onPress={() => nav.push('/explore')} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen testID="portfolio-screen">
      <AppText variant="title">Portfolio</AppText>
      <PortfolioSegments active="holdings" />
      <PortfolioSummaryCard summary={s} />
      <Card>
        <AppText variant="heading">Allocation</AppText>
        <AllocationList allocation={allocation.data} />
      </Card>
      <Card>
        <AppText variant="heading">Holdings</AppText>
        <HoldingsList rows={holdings.data} />
      </Card>
    </Screen>
  );
}
