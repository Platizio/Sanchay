import { toApiError } from '@sanchay/api-client';
import { messageForError } from '@sanchay/app-core';
import { AppText, Banner, Button, Card, ListRow, MoneyText, Screen } from '@sanchay/ui';
import { ReturnCaveat } from '../explore/Disclosures';
import { useNav } from '../nav/NavContext';
import {
  dateText,
  type HoldingDetailView,
  inr,
  isPositiveUnits,
  moneyOf,
  navText,
  returnText,
  unitsText,
} from './portfolio-format';
import { usePortfolioHolding } from './usePortfolio';

export interface HoldingDetailScreenProps {
  folioId: string;
  isin: string;
}

/** DSC-10, verbatim. */
export const ELSS_LOCK_NOTE =
  'Each ELSS purchase and each SIP instalment is locked in for 3 years from its allotment date.';

/** Why Redeem is disabled (PORT-02), or null when some units are available now. */
export function redeemBlockReason(h: HoldingDetailView): string | null {
  if (isPositiveUnits(h.units.available)) return null;
  if (isPositiveUnits(h.units.inProcess)) {
    return `${unitsText(h.units.inProcess)} units are part of pending requests`;
  }
  if (isPositiveUnits(h.units.locked)) {
    const next = h.lots
      .flatMap((lot) => (lot.locked && lot.lockInUntil !== null ? [lot.lockInUntil] : []))
      .sort()[0];
    return next
      ? `All units are in ELSS lock-in until ${dateText(next)}`
      : 'All units are in ELSS lock-in';
  }
  return 'No units are available to redeem yet';
}

/** PORT-02. Units, lock-in and in-process figures are F11's display values; F5's quote stays authoritative. */
export function HoldingDetailScreen({ folioId, isin }: HoldingDetailScreenProps) {
  const nav = useNav();
  const holding = usePortfolioHolding(folioId, isin);

  if (holding.isPending) {
    return (
      <Screen testID="holding-loading">
        <AppText tone="muted">Loading this holding…</AppText>
      </Screen>
    );
  }

  if (holding.isError) {
    const code = toApiError(holding.error).code;
    return (
      <Screen testID="holding-error">
        <Banner
          tone="error"
          message={code === 'NOT_FOUND' ? "We couldn't find this holding." : messageForError(code)}
        />
        {code === 'NOT_FOUND' ? null : (
          <Button
            label="Try again"
            onPress={() => {
              void holding.refetch();
            }}
          />
        )}
        <Button
          variant="secondary"
          label="Back to portfolio"
          onPress={() => nav.replace('/portfolio')}
        />
      </Screen>
    );
  }

  const h = holding.data;
  const lockLots = h.lots.filter((lot) => lot.lockInUntil !== null);
  const blocked = redeemBlockReason(h);
  return (
    <Screen testID="holding-detail-screen">
      <AppText variant="title">{h.schemeName}</AppText>
      <AppText tone="muted">{`${h.categoryName} · Folio ${h.folioNumber ?? 'being assigned'}`}</AppText>

      <Card>
        <AppText variant="caption" tone="muted">
          Current value
        </AppText>
        <MoneyText value={moneyOf(h.currentValue)} testID="holding-current-value" />
        {h.currentValue === null ? (
          <AppText tone="muted">{`Value pending — ${inr(h.invested)} invested`}</AppText>
        ) : null}
        <ListRow
          label="NAV"
          value={h.navDate ? `${navText(h.nav)} as of ${dateText(h.navDate)}` : navText(h.nav)}
        />
        <ListRow label="Invested" value={inr(h.invested)} />
        <ListRow label="Average cost NAV" value={navText(h.avgCostNav)} />
        <ListRow label="Gain" value={returnText(h.absoluteReturn, h.percentReturn)} />
        <ListRow label="XIRR" value={h.xirr.text} testID="holding-xirr" />
        {h.xirr.caveatText ? (
          <AppText variant="caption" tone="muted">
            {h.xirr.caveatText}
          </AppText>
        ) : null}
        {h.xirr.showAbsoluteReturn ? (
          <AppText variant="caption">{`Absolute return ${returnText(h.absoluteReturn, h.percentReturn)}`}</AppText>
        ) : null}
        <ReturnCaveat />
      </Card>

      <Card testID="holding-units">
        <AppText variant="heading">Units</AppText>
        <ListRow label="Total" value={unitsText(h.units.total)} />
        <ListRow label="Available to redeem" value={unitsText(h.units.available)} />
        <ListRow label="Locked (ELSS)" value={unitsText(h.units.locked)} testID="units-locked" />
        <ListRow label="In process" value={unitsText(h.units.inProcess)} />
        {h.pending.count > 0 ? (
          <AppText tone="muted">{`${inr(h.pending.amount)} being invested`}</AppText>
        ) : null}
      </Card>

      {lockLots.length > 0 ? (
        <Card testID="lock-schedule">
          <AppText variant="heading">ELSS lock-in</AppText>
          <AppText variant="caption" tone="muted">
            {ELSS_LOCK_NOTE}
          </AppText>
          {lockLots.map((lot) => (
            <ListRow
              key={lot.lotId}
              label={`${dateText(lot.allotmentDate)} · ${unitsText(lot.unitsRemaining)} units`}
              value={
                lot.locked
                  ? `Locked until ${dateText(lot.lockInUntil)}`
                  : `Unlocked on ${dateText(lot.lockInUntil)}`
              }
            />
          ))}
        </Card>
      ) : null}

      <Button
        label="Invest more"
        variant="secondary"
        onPress={() => nav.push(`/invest/${h.schemeId}/lumpsum`)}
      />
      <Button
        label="Redeem"
        disabled={blocked !== null}
        onPress={() => nav.push(`/redeem/${h.folioId}/${h.isin}`)}
      />
      {blocked ? (
        <AppText tone="muted" testID="redeem-blocked">
          {blocked}
        </AppText>
      ) : null}
    </Screen>
  );
}
