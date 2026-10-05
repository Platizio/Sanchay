import { toApiError } from '@sanchay/api-client';
import { messageForError } from '@sanchay/app-core';
import { AppText, Banner, Button, Card, ListRow, Screen } from '@sanchay/ui';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '../api/ApiContext';
import { useNav } from '../nav/NavContext';
import { useOnboarding } from '../onboarding/useOnboarding';
import { AllocationList } from '../portfolio/AllocationList';
import { HoldingsList } from '../portfolio/HoldingsList';
import { PortfolioSummaryCard } from '../portfolio/PortfolioSummaryCard';
import {
  usePortfolioAllocation,
  usePortfolioHoldings,
  usePortfolioSummary,
} from '../portfolio/usePortfolio';
import { ThingsToDo } from './ThingsToDo';

const BLOCKED = new Set(['BLOCKED_PEP', 'KYC_UPDATE_NEEDED', 'PROVISIONING_FAILED']);
/** HOME-01 block 5: top 5 holdings by value (F11 already sorts by value). */
export const HOLDINGS_PREVIEW = 5;

/** HOME-01. The greeting comes from auth.session; the state from onboarding.get; the rest from F11. */
export function HomeScreen() {
  const { utils } = useApi();
  const session = useQuery(utils.auth.session.queryOptions());

  if (session.isPending) {
    return (
      <Screen testID="home-loading">
        <AppText tone="muted">Loading your account…</AppText>
      </Screen>
    );
  }

  if (session.isError) {
    return (
      <Screen testID="home-error">
        <Banner tone="error" message={messageForError(toApiError(session.error).code)} />
        <Button
          label="Try again"
          onPress={() => {
            void session.refetch();
          }}
        />
      </Screen>
    );
  }

  const { displayName, mobileMasked } = session.data.investor;
  return (
    <Screen testID="home-screen">
      <AppText variant="title">{displayName ? `Hi, ${displayName}` : 'Welcome to Sanchay'}</AppText>
      <AppText tone="muted">{`Signed in as ${mobileMasked}`}</AppText>
      <HomeBody />
    </Screen>
  );
}

function HomeBody() {
  const nav = useNav();
  const onboarding = useOnboarding();
  const done = onboarding.stage === 'DONE';
  const summary = usePortfolioSummary({ enabled: done });
  const holdings = usePortfolioHoldings({ enabled: done });
  const allocation = usePortfolioAllocation({ enabled: done });

  if (onboarding.isError) {
    return <RetryBanner code={onboarding.errorCode} onRetry={() => void onboarding.refetch()} />;
  }
  if (onboarding.stage === null) {
    return <AppText tone="muted">Loading your investments…</AppText>;
  }
  if (!done) {
    const blocked = BLOCKED.has(onboarding.stage);
    return (
      <Card testID="home-setup">
        <AppText variant="heading">
          {blocked ? 'Your account needs attention' : 'Complete your setup'}
        </AppText>
        <AppText tone="muted">
          {blocked
            ? 'We need a little more from you before you can invest.'
            : 'Finish a few steps to start investing in mutual funds.'}
        </AppText>
        <Button
          label={blocked ? 'See what to do' : 'Continue setup'}
          onPress={() => nav.push('/onboarding')}
        />
      </Card>
    );
  }

  const failed = summary.error ?? holdings.error ?? allocation.error;
  if (failed) {
    return (
      <RetryBanner
        code={toApiError(failed).code}
        onRetry={() => {
          void summary.refetch();
          void holdings.refetch();
          void allocation.refetch();
        }}
      />
    );
  }
  if (!summary.data || !holdings.data || !allocation.data) {
    return <AppText tone="muted">Loading your investments…</AppText>;
  }

  const s = summary.data;
  if (s.holdingCount === 0 && s.pending.count === 0) {
    return (
      <>
        {s.thingsToDo.length > 0 ? <ThingsToDo items={s.thingsToDo} /> : null}
        <Card testID="home-start">
          <AppText variant="heading">Start investing</AppText>
          <AppText tone="muted">
            You have not invested yet. Your holdings, SIPs and returns will appear here after your
            first investment.
          </AppText>
          <Button label="Explore funds" onPress={() => nav.push('/explore')} />
        </Card>
      </>
    );
  }

  return (
    <>
      <PortfolioSummaryCard summary={s} />
      <ThingsToDo items={s.thingsToDo} />
      <Card testID="home-sips">
        <AppText variant="heading">SIPs</AppText>
        <ListRow
          label="Active SIPs"
          value={String(s.activeSips)}
          onPress={() => nav.push('/portfolio/sips')}
        />
      </Card>
      <Card testID="home-allocation">
        <AppText variant="heading">Allocation</AppText>
        <AllocationList allocation={allocation.data} />
      </Card>
      {holdings.data.length > 0 ? (
        <Card testID="home-holdings">
          <AppText variant="heading">Your holdings</AppText>
          <HoldingsList rows={holdings.data} limit={HOLDINGS_PREVIEW} />
          <Button
            variant="secondary"
            label="See all holdings"
            onPress={() => nav.push('/portfolio')}
          />
        </Card>
      ) : null}
    </>
  );
}

function RetryBanner({ code, onRetry }: { code: string | null; onRetry: () => void }) {
  return (
    <>
      <Banner tone="error" message={messageForError(code)} />
      <Button label="Try again" onPress={onRetry} />
    </>
  );
}
