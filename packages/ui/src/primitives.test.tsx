import { render, screen } from '@testing-library/react';
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AppText, Button, Card, Screen } from './index';

function setupUser() {
  return userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });
}

describe('Button', () => {
  it('is an accessible button that calls onPress', async () => {
    const user = setupUser();
    const onPress = vi.fn();
    render(<Button label="Get OTP" onPress={onPress} />);
    await user.click(screen.getByRole('button', { name: 'Get OTP' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('reports aria-disabled and ignores presses when disabled', async () => {
    const user = setupUser();
    const onPress = vi.fn();
    render(<Button label="Verify" onPress={onPress} disabled />);
    const button = screen.getByRole('button', { name: 'Verify' });
    await user.click(button);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows a busy state instead of the label while loading', async () => {
    const user = setupUser();
    const onPress = vi.fn();
    render(<Button label="Verify" onPress={onPress} loading />);
    const button = screen.getByRole('button', { name: 'Verify' });
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByText('Verify')).toBeNull();
    await user.click(button);
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('layout primitives', () => {
  it('renders Screen and Card with test ids and headings only for title text', () => {
    render(
      <Screen testID="screen">
        <Card testID="card">
          <AppText variant="title">Your investments</AppText>
          <AppText tone="muted">Nothing here yet</AppText>
        </Card>
      </Screen>,
    );
    expect(screen.getByTestId('screen')).toBeTruthy();
    expect(screen.getByTestId('card')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Your investments' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Nothing here yet' })).toBeNull();
    expect(screen.getByText('Nothing here yet')).toBeTruthy();
  });
});
