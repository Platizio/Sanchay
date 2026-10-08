import { Money } from '@sanchay/money';
import { render, screen } from '@testing-library/react';
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Chip, ListRow, MoneyText, ProgressSteps, Sheet } from './index';

function setupUser() {
  return userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });
}

describe('Chip', () => {
  it('reports selection and exposes aria-pressed', async () => {
    const user = setupUser();
    const onPress = vi.fn();
    render(<Chip label="Equity" selected={false} onPress={onPress} />);
    const chip = screen.getByRole('button', { name: 'Equity' });
    expect(chip.getAttribute('aria-pressed')).toBe('false');
    await user.click(chip);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('ListRow', () => {
  it('renders the label, value and calls onPress', async () => {
    const user = setupUser();
    const onPress = vi.fn();
    render(<ListRow label="Bank account" value="HDFC •• 4321" onPress={onPress} />);
    expect(screen.getByText('HDFC •• 4321')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Bank account/ }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('Sheet', () => {
  it('renders as a dialog only while visible and calls onClose', async () => {
    const user = setupUser();
    const onClose = vi.fn();
    const { rerender } = render(
      <Sheet visible={false} title="Choose one" onClose={onClose}>
        {null}
      </Sheet>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    rerender(
      <Sheet visible title="Choose one" onClose={onClose}>
        {null}
      </Sheet>,
    );
    expect(screen.getByRole('dialog', { name: 'Choose one' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('ProgressSteps', () => {
  const steps = [
    { key: 'IDENTITY', label: 'Identity' },
    { key: 'PROFILE', label: 'Profile' },
    { key: 'BANK', label: 'Bank' },
  ];

  it('marks steps before current as done and the current step as active', () => {
    render(<ProgressSteps steps={steps} current="PROFILE" />);
    expect(
      screen.getByText('Identity').closest('[data-step-state]')?.getAttribute('data-step-state'),
    ).toBe('done');
    expect(
      screen.getByText('Profile').closest('[data-step-state]')?.getAttribute('data-step-state'),
    ).toBe('active');
    expect(
      screen.getByText('Bank').closest('[data-step-state]')?.getAttribute('data-step-state'),
    ).toBe('upcoming');
  });
});

describe('MoneyText', () => {
  it('formats via @sanchay/money formatInr and shows the dash for null', () => {
    render(<MoneyText value={Money.parse('123456.70')} />);
    expect(screen.getByText('₹1,23,456.70')).toBeTruthy();
    render(<MoneyText value={null} />);
    expect(screen.getByText('—')).toBeTruthy();
  });
});
