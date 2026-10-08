import { MARKET_RISK_WARNING, REGULAR_PLAN_NOTICE } from '@sanchay/app-core/copy';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Disclosures, ReturnCaveat, RiskometerBadge } from './Disclosures';

describe('Disclosures', () => {
  it('always renders DSC-01 and DSC-03', () => {
    render(<Disclosures />);
    expect(screen.getByText(MARKET_RISK_WARNING)).toBeTruthy();
    expect(screen.getByText(REGULAR_PLAN_NOTICE)).toBeTruthy();
  });
});

describe('ReturnCaveat', () => {
  it('renders DSC-04', () => {
    render(<ReturnCaveat />);
    expect(screen.getByText(/Past performance may or may not be sustained/)).toBeTruthy();
  });
});

describe('RiskometerBadge', () => {
  it('shows the level and benchmark when both are known', () => {
    render(<RiskometerBadge level="VERY_HIGH" benchmarkLevel="HIGH" />);
    expect(screen.getByText(/Very High/)).toBeTruthy();
    expect(screen.getByText('Benchmark: High')).toBeTruthy(); // /High/ also matched 'Very High' (RV-03-40)
  });

  it('shows a dash when the level is unknown', () => {
    render(<RiskometerBadge level={null} benchmarkLevel={null} />);
    expect(screen.getByText('—')).toBeTruthy();
  });
});
