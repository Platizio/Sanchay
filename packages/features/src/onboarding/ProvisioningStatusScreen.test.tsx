import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { renderWithProviders, TEST_API } from '../test-utils';
import { ProvisioningStatusScreen } from './ProvisioningStatusScreen';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const stage = (value: string) =>
  http.get(`${TEST_API}/onboarding`, () =>
    HttpResponse.json({ stage: value, readinessCode: null }),
  );

describe('ProvisioningStatusScreen (ONB-17/20)', () => {
  it('shows the in-progress state while the account is being set up', async () => {
    server.use(stage('PROVISIONING'));
    renderWithProviders(<ProvisioningStatusScreen />);
    expect(await screen.findByText('Setting up your account…')).toBeTruthy();
  });

  it('shows "Your account is ready" and offers Explore funds once the stage is DONE', async () => {
    server.use(stage('DONE'));
    const user = userEvent.setup();
    const { nav } = renderWithProviders(<ProvisioningStatusScreen />);
    expect(await screen.findByText('Your account is ready')).toBeTruthy();
    // Nothing navigates by itself: the investor sees the confirmation first.
    expect(nav.replace).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Explore funds' }));
    expect(nav.push).toHaveBeenCalledWith('/explore');
  });

  it('shows the failure and a way back to the hub when provisioning failed', async () => {
    server.use(stage('PROVISIONING_FAILED'));
    const user = userEvent.setup();
    const { nav } = renderWithProviders(<ProvisioningStatusScreen />);
    expect(await screen.findByText('We could not finish setting up your account.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Back to setup' }));
    expect(nav.replace).toHaveBeenCalledWith('/onboarding');
  });
});
