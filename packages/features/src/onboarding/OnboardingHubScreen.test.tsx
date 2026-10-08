import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { renderWithProviders, TEST_API } from '../test-utils';
import { OnboardingHubScreen } from './OnboardingHubScreen';

// The real SessionSummarySchema (packages/contract/src/auth.ts): the investor id key is `id`.
const session = (emailVerified: boolean) => ({
  sessionId: '0190c0de-0000-7000-8000-0000000000aa',
  platform: 'WEB',
  idleExpiresAt: '2026-10-12T05:00:00.000Z',
  absoluteExpiresAt: '2026-10-12T16:00:00.000Z',
  investor: {
    id: '0190c0de-0000-7000-8000-000000000001',
    status: 'ACTIVE',
    mobileMasked: '••••••3210',
    emailMasked: emailVerified ? 'j***@gmail.com' : null,
    emailVerified,
    displayName: null,
  },
});

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('OnboardingHubScreen', () => {
  it('requires the email step before showing the onboarding hub (AUTH-04/05 gate)', async () => {
    server.use(http.get(`${TEST_API}/auth/session`, () => HttpResponse.json(session(false))));
    renderWithProviders(<OnboardingHubScreen />);
    expect(await screen.findByRole('heading', { name: 'Add your email' })).toBeTruthy();
    expect(screen.queryByTestId('onboarding-hub')).toBeNull();
  });

  it('shows the stage progress once the email is verified', async () => {
    server.use(
      http.get(`${TEST_API}/auth/session`, () => HttpResponse.json(session(true))),
      http.get(`${TEST_API}/onboarding`, () =>
        HttpResponse.json({ stage: 'PROFILE', readinessCode: null }),
      ),
    );
    renderWithProviders(<OnboardingHubScreen />);
    expect(await screen.findByTestId('onboarding-hub')).toBeTruthy();
    expect(screen.getByText('Profile')).toBeTruthy();
  });

  it('shows BlockedScreen copy for a blocked stage', async () => {
    server.use(
      http.get(`${TEST_API}/auth/session`, () => HttpResponse.json(session(true))),
      http.get(`${TEST_API}/onboarding`, () =>
        HttpResponse.json({ stage: 'KYC_UPDATE_NEEDED', readinessCode: 'kyc_unavailable' }),
      ),
    );
    renderWithProviders(<OnboardingHubScreen />);
    // The title and the banner both say it, so assert the heading and the KRA copy separately.
    expect(await screen.findByRole('heading', { name: 'Update your KYC' })).toBeTruthy();
    expect(screen.getByText(/update your KYC with a KRA/i)).toBeTruthy();
  });

  it('offers Try again to the review step when provisioning failed (PRV-2)', async () => {
    server.use(
      http.get(`${TEST_API}/auth/session`, () => HttpResponse.json(session(true))),
      http.get(`${TEST_API}/onboarding`, () =>
        HttpResponse.json({ stage: 'PROVISIONING_FAILED', readinessCode: null }),
      ),
    );
    const user = userEvent.setup();
    const { nav } = renderWithProviders(<OnboardingHubScreen />);
    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(nav.push).toHaveBeenCalledWith('/onboarding/review');
  });

  it('routes KYC_UPDATE_NEEDED back to the identity step so the investor can resubmit (re-review N2)', async () => {
    server.use(
      http.get(`${TEST_API}/auth/session`, () => HttpResponse.json(session(true))),
      http.get(`${TEST_API}/onboarding`, () =>
        HttpResponse.json({ stage: 'KYC_UPDATE_NEEDED', readinessCode: null }),
      ),
    );
    const user = userEvent.setup();
    const { nav } = renderWithProviders(<OnboardingHubScreen />);
    await user.click(await screen.findByRole('button', { name: 'Check status again' }));
    expect(nav.push).toHaveBeenCalledWith('/onboarding/identity');
  });
});
