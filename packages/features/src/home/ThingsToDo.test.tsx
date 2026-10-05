import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../test-utils';
import { ThingsToDo } from './ThingsToDo';

const ORDER = '0190c0de-0000-7000-8000-00000000c001';
const MANDATE = '0190c0de-0000-7000-8000-00000000d001';
const MISSED = '0190c0de-0000-7000-8000-00000000c002';

describe('ThingsToDo (HOME-02)', () => {
  it('lists each item with its amount and routes to PAY-01, SIPM-01 and ORD-02', async () => {
    const user = userEvent.setup();
    const { nav } = renderWithProviders(
      <ThingsToDo
        items={[
          {
            kind: 'PAYMENT_PENDING',
            entityId: ORDER,
            amount: '1500.00',
            at: '2026-11-16T05:00:00.000Z',
          },
          {
            kind: 'MANDATE_AUTH_PENDING',
            entityId: MANDATE,
            amount: null,
            at: '2026-11-15T05:00:00.000Z',
          },
          {
            kind: 'SIP_INSTALMENT_MISSED',
            entityId: MISSED,
            amount: '500.00',
            at: '2026-11-10T05:00:00.000Z',
          },
        ]}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Things to do (3)' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Complete your payment: ₹1,500.00' }));
    expect(nav.push).toHaveBeenLastCalledWith(`/pay/${ORDER}`);
    await user.click(screen.getByRole('button', { name: 'Approve your SIP mandate' }));
    expect(nav.push).toHaveBeenLastCalledWith('/portfolio/sips');
    await user.click(screen.getByRole('button', { name: 'A SIP instalment was missed: ₹500.00' }));
    expect(nav.push).toHaveBeenLastCalledWith(`/portfolio/orders/${MISSED}`);
  });

  it("says you're all caught up when there is nothing to do", () => {
    renderWithProviders(<ThingsToDo items={[]} />);
    expect(screen.getByRole('heading', { name: 'Things to do' })).toBeTruthy();
    expect(screen.getByText("You're all caught up.")).toBeTruthy();
  });
});
