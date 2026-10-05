import { SegmentedControl } from '@sanchay/ui';
import { useNav } from '../nav/NavContext';

export type PortfolioSegment = 'holdings' | 'orders' | 'sips';

/** H-14: the Portfolio tab's three segments. Each segment is its own route, so deep links and Back work. */
export const PORTFOLIO_SEGMENT_PATHS: Record<PortfolioSegment, string> = {
  holdings: '/portfolio',
  orders: '/portfolio/orders',
  sips: '/portfolio/sips',
};

const OPTIONS = [
  { value: 'holdings', label: 'Holdings' },
  { value: 'orders', label: 'Orders' },
  { value: 'sips', label: 'SIPs' },
] satisfies Array<{ value: PortfolioSegment; label: string }>;

function isSegment(value: string): value is PortfolioSegment {
  return value === 'holdings' || value === 'orders' || value === 'sips';
}

export function PortfolioSegments({ active }: { active: PortfolioSegment }) {
  const nav = useNav();
  return (
    <SegmentedControl
      label="Portfolio view"
      value={active}
      options={OPTIONS}
      testID="portfolio-segments"
      onChange={(value) => {
        if (isSegment(value) && value !== active) nav.replace(PORTFOLIO_SEGMENT_PATHS[value]);
      }}
    />
  );
}
