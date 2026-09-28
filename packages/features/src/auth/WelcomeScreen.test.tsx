import { MARKET_RISK_WARNING } from '@sanchay/app-core/copy';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { WelcomeScreen } from './WelcomeScreen';

describe('WelcomeScreen', () => {
  it('offers sign-up and log-in and carries the market-risk warning', async () => {
    const onCreateAccount = vi.fn();
    const onLogIn = vi.fn();
    const user = userEvent.setup();
    render(<WelcomeScreen onCreateAccount={onCreateAccount} onLogIn={onLogIn} />);
    expect(screen.getByTestId('welcome-screen')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Sanchay' })).toBeTruthy();
    expect(screen.getByText(MARKET_RISK_WARNING)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await user.click(screen.getByRole('button', { name: 'I already have an account' }));
    expect(onCreateAccount).toHaveBeenCalledTimes(1);
    expect(onLogIn).toHaveBeenCalledTimes(1);
  });
});
