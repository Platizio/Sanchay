import type { ApiClient } from '@sanchay/api-client';
import {
  DASH,
  formatInr,
  formatIsoDate,
  formatNav,
  formatPct,
  formatUnits,
  Money,
  Nav,
  Units,
} from '@sanchay/money';

/** Wire types come from the F11 contract through the typed client, so a contract change breaks the build here. */
export type PortfolioSummaryView = Awaited<ReturnType<ApiClient['portfolio']['summary']>>;
export type HoldingRowView = Awaited<ReturnType<ApiClient['portfolio']['holdings']>>[number];
export type HoldingDetailView = Awaited<ReturnType<ApiClient['portfolio']['holding']>>;
export type AllocationView = Awaited<ReturnType<ApiClient['portfolio']['allocation']>>;
export type ThingToDoView = PortfolioSummaryView['thingsToDo'][number];
export type XirrWire = PortfolioSummaryView['xirr'];
export type AssetClassWire = HoldingRowView['assetClass'];

export const ASSET_CLASS_LABELS: Record<AssetClassWire, string> = {
  EQUITY: 'Equity',
  DEBT: 'Debt',
  HYBRID: 'Hybrid',
  LIFE_CYCLE: 'Solution-oriented',
  OTHER: 'Other',
  LEGACY: 'Other (legacy)',
};

/** Money is a decimal string or null on the wire; null stays null (never ₹0, D-MONEY-067). */
export function moneyOf(wire: string | null): Money | null {
  return Money.parseNullable(wire);
}

export function inr(wire: string | null): string {
  return formatInr(Money.parseNullable(wire));
}

export function unitsText(wire: string): string {
  return formatUnits(Units.platform(wire));
}

export function navText(wire: string | null): string {
  return formatNav(Nav.parseNullable(wire));
}

export function dateText(iso: string | null): string {
  return formatIsoDate(iso);
}

export type GainTone = 'default' | 'gain' | 'loss';

export function gainTone(wire: string | null): GainTone {
  const m = Money.parseNullable(wire);
  if (m === null || m.isZero()) return 'default';
  return m.isPositive() ? 'gain' : 'loss';
}

/** "₹1,234.50 (+12.34%)"; a dash when the gain is unknown. `percent` is already a percentage. */
export function returnText(absolute: string | null, percent: string | null): string {
  if (absolute === null) return DASH;
  return `${inr(absolute)} (${formatPct(percent)})`;
}

export function isPositiveWire(wire: string): boolean {
  return Money.parse(wire).isPositive();
}

export function isPositiveUnits(wire: string): boolean {
  return Units.platform(wire).isPositive();
}
