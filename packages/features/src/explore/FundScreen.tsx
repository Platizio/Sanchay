import { toApiError } from '@sanchay/api-client';
import { messageForError } from '@sanchay/app-core';
import { DASH, formatInr, formatPct, Money } from '@sanchay/money';
import { AppText, Banner, Button, Card, ListRow, Screen } from '@sanchay/ui';
import { useQuery } from '@tanstack/react-query';
import { Linking, Pressable, View } from 'react-native';
import { useApi } from '../api/ApiContext';
import { useNav } from '../nav/NavContext';
import { Disclosures, ReturnCaveat, RiskometerBadge } from './Disclosures';

export interface FundScreenProps {
  schemeSlug: string;
}

/** FUND-01 (facts, minimums, exit load, lock-in, riskometer, TER, SID/KIM) and FUND-03 (returns). */
export function FundScreen({ schemeSlug }: FundScreenProps) {
  const { utils } = useApi();
  const nav = useNav();
  const detail = useQuery(utils.catalogue.getScheme.queryOptions({ input: { slug: schemeSlug } }));

  if (detail.isPending) {
    return (
      <Screen testID="fund-loading">
        <AppText tone="muted">Loading fund…</AppText>
      </Screen>
    );
  }

  if (detail.isError) {
    return (
      <Screen testID="fund-error">
        <Banner tone="error" message={messageForError(toApiError(detail.error).code)} />
        <Button
          label="Try again"
          onPress={() => {
            void detail.refetch();
          }}
        />
      </Screen>
    );
  }

  const scheme = detail.data;
  const t = scheme.thresholds;
  const { sidUrl, kimUrl } = scheme;
  return (
    <Screen testID="fund-screen">
      <AppText variant="title">{scheme.name}</AppText>
      <AppText tone="muted">{`${scheme.amcName} · ${scheme.categoryName}`}</AppText>
      {/* RV-03-8: E23's INV-01 takes the scheme uuid; a link, like Plan 01's in-app navigation. */}
      <Pressable
        role="link"
        aria-label="Invest"
        testID="fund-invest"
        onPress={() => nav.push(`/invest/${scheme.id}/lumpsum`)}
      >
        <AppText tone="primary">Invest</AppText>
      </Pressable>

      <Card>
        <AppText variant="heading">Returns</AppText>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <AppText>1Y</AppText>
          <AppText>{formatPct(scheme.returns.cagr1y, { signed: false })}</AppText>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <AppText>3Y</AppText>
          <AppText>{formatPct(scheme.returns.cagr3y, { signed: false })}</AppText>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <AppText>5Y</AppText>
          <AppText>{formatPct(scheme.returns.cagr5y, { signed: false })}</AppText>
        </View>
        <ReturnCaveat />
      </Card>

      <Card>
        <AppText variant="heading">Minimums</AppText>
        <ListRow label="Minimum lumpsum" value={t ? formatInr(Money.parse(t.purchaseMin)) : DASH} />
        <ListRow
          label="Minimum SIP"
          value={scheme.sipAllowed && t?.sipMin ? formatInr(Money.parse(t.sipMin)) : DASH}
        />
        <ListRow label="Exit load" value={scheme.exitLoadText ?? DASH} />
        <ListRow
          label="Lock-in"
          value={scheme.lockInMonths ? `${scheme.lockInMonths} months` : 'None'}
        />
        <ListRow
          label="Total expense ratio"
          value={formatPct(scheme.expenseRatioPct, { signed: false })}
        />
      </Card>

      <Card>
        <AppText variant="heading">Riskometer</AppText>
        <RiskometerBadge level={scheme.riskometer} benchmarkLevel={scheme.benchmarkRiskometer} />
      </Card>

      <Card>
        <AppText variant="heading">Documents</AppText>
        {sidUrl ? (
          <ListRow
            label="Scheme Information Document"
            value="View"
            onPress={() => {
              void Linking.openURL(sidUrl);
            }}
          />
        ) : null}
        {kimUrl ? (
          <ListRow
            label="Key Information Memorandum"
            value="View"
            onPress={() => {
              void Linking.openURL(kimUrl);
            }}
          />
        ) : null}
      </Card>

      {scheme.commissionLine ? (
        <AppText variant="caption" tone="muted">
          {`Sanchay receives a commission from ${scheme.amcName} for this scheme (${scheme.commissionLine.kind === 'EXACT' ? `${scheme.commissionLine.trailMinBps / 100}% p.a. trail` : `${scheme.commissionLine.trailMinBps / 100}\u2013${scheme.commissionLine.trailMaxBps / 100}% p.a. trail`}).`}
        </AppText>
      ) : null}

      <Disclosures />
    </Screen>
  );
}
