import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AllocationList } from './AllocationList';
import { ALLOCATION, EMPTY_ALLOCATION } from './portfolio.fixtures';

describe('AllocationList', () => {
  it("lists each asset class and its categories with F11's shares and values", () => {
    render(<AllocationList allocation={ALLOCATION} />);
    const equity = screen.getByTestId('allocation-class-EQUITY');
    expect(within(equity).getByLabelText('Equity: 100.0% · ₹16,760.00')).toBeTruthy();
    expect(within(equity).getByLabelText('Flexi Cap Fund: 70.2% · ₹11,760.00')).toBeTruthy();
    expect(within(equity).getByLabelText('ELSS: 29.8% · ₹5,000.00')).toBeTruthy();
    expect(screen.queryByTestId('allocation-excludes')).toBeNull();
  });

  it('notes the invested amount that is awaiting valuation', () => {
    render(<AllocationList allocation={{ ...ALLOCATION, valuePending: '5000.00' }} />);
    expect(screen.getByTestId('allocation-excludes').textContent).toBe(
      'Excludes ₹5,000.00 awaiting valuation',
    );
  });

  it('says allocation needs a valued holding when nothing is valued yet', () => {
    render(<AllocationList allocation={{ ...EMPTY_ALLOCATION, valuePending: '5000.00' }} />);
    expect(screen.getByText('Allocation appears once your holdings are valued.')).toBeTruthy();
    expect(screen.getByTestId('allocation-excludes')).toBeTruthy();
  });
});
