import { color, contrastRatio } from '@sanchay/tokens';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AllocationBarChart, ASSET_CLASS_COLORS, allocationChartLabel } from './AllocationBarChart';
import { AllocationList } from './AllocationList';
import { ALLOCATION, EMPTY_ALLOCATION } from './portfolio.fixtures';
import type { AllocationView } from './portfolio-format';

const MIXED: AllocationView = {
  assetClasses: [
    {
      assetClass: 'EQUITY',
      value: '12570.00',
      percent: '75.0',
      categories: [
        { code: 'FLEXI_CAP', name: 'Flexi Cap Fund', value: '12570.00', percent: '100.0' },
      ],
    },
    {
      assetClass: 'DEBT',
      value: '4190.00',
      percent: '25.0',
      categories: [{ code: 'LIQUID', name: 'Liquid Fund', value: '4190.00', percent: '100.0' }],
    },
    {
      assetClass: 'HYBRID',
      value: '0.00',
      percent: '0.0',
      categories: [],
    },
  ],
  valuePending: '0.00',
};

describe('AllocationBarChart (F15, T3)', () => {
  it('draws one segment per asset class with a share, sized by the share, with a text alternative', () => {
    render(<AllocationBarChart allocation={MIXED} />);
    const bar = screen.getByRole('img', {
      name: 'Allocation by asset class: Equity 75.0%, Debt 25.0%',
    });
    expect(bar).toBeTruthy();
    const equity = screen.getByTestId('allocation-bar-EQUITY');
    const debt = screen.getByTestId('allocation-bar-DEBT');
    expect(getComputedStyle(equity).flexBasis).toBe('75%');
    expect(getComputedStyle(debt).flexBasis).toBe('25%');
    expect(screen.queryByTestId('allocation-bar-HYBRID')).toBeNull();
  });

  it('draws nothing when no holding is valued', () => {
    render(<AllocationBarChart allocation={EMPTY_ALLOCATION} />);
    expect(screen.queryByTestId('allocation-chart')).toBeNull();
  });

  it('uses distinct colours that each meet 3:1 against the background (WCAG 1.4.11)', () => {
    const colours = Object.values(ASSET_CLASS_COLORS);
    expect(new Set(colours).size).toBe(colours.length);
    for (const c of colours) expect(contrastRatio(c, color.bg)).toBeGreaterThanOrEqual(3);
  });

  it('sits above the allocation list, which keeps every exact number', () => {
    render(<AllocationList allocation={ALLOCATION} />);
    expect(screen.getByRole('img', { name: allocationChartLabel(ALLOCATION) })).toBeTruthy();
    expect(screen.getByLabelText('Flexi Cap Fund: 70.2% · ₹11,760.00')).toBeTruthy();
  });
});
