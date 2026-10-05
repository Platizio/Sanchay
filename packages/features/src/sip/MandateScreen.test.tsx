import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { Linking } from 'react-native';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, TEST_API } from '../test-utils';
import { MandateScreen } from './MandateScreen';

const mandateId = '0192f0e0-0000-7000-8000-0000000000d1';
const UPI_URI = 'upi://mandate?pa=cybrilla@upi&mn=Sanchay&am=100000.00';

const mandate = (status: string, overrides: Record<string, unknown> = {}) => ({
  id: mandateId,
  rail: 'UPI_AUTOPAY',
  limitAmount: '100000.00',
  status,
  upiUri: status === 'AUTH_PENDING' ? UPI_URI : null,
  authUrl: null,
  approvedAt: status === 'APPROVED' ? '2026-10-08T06:00:00.000Z' : null,
  createdAt: '2026-10-08T05:00:00.000Z',
  ...overrides,
});

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

describe('MandateScreen (SIP-02/MND-03)', () => {
  it('opens the UPI intent for a pending UPI Autopay mandate and polls until APPROVED', async () => {
    // FP approves only after the investor has been sent to the UPI app.
    let opened = false;
    let readsAfterOpen = 0;
    server.use(
      http.get(`${TEST_API}/mandates/${mandateId}`, () => {
        if (opened) readsAfterOpen += 1;
        return HttpResponse.json(mandate(readsAfterOpen >= 2 ? 'APPROVED' : 'AUTH_PENDING'));
      }),
    );
    const open = vi.spyOn(Linking, 'openURL').mockImplementation(async () => {
      opened = true;
      return true;
    });
    const user = userEvent.setup();
    const { nav } = renderWithProviders(<MandateScreen mandateId={mandateId} pollMs={20} />);
    expect(
      await screen.findByText(
        'Approve the ₹1,00,000.00 autopay request in your UPI app with your UPI PIN.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Up to ₹1,00,000.00 per debit · UPI Autopay')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Open UPI app' }));
    expect(open).toHaveBeenCalledWith(UPI_URI);
    expect(
      await screen.findByText(
        'Mandate approved. Your SIP is being registered with the fund house.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open UPI app' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'View my SIPs' }));
    expect(nav.replace).toHaveBeenCalledWith('/portfolio/sips');
  });

  it('re-mints the UPI request with an Idempotency-Key', async () => {
    const keys: Array<string | null> = [];
    server.use(
      http.get(`${TEST_API}/mandates/${mandateId}`, () =>
        HttpResponse.json(mandate('AUTH_PENDING')),
      ),
      http.post(`${TEST_API}/mandates/${mandateId}/authorize`, ({ request }) => {
        keys.push(request.headers.get('idempotency-key'));
        return HttpResponse.json({ ok: true });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<MandateScreen mandateId={mandateId} pollMs={60_000} />);
    await user.click(await screen.findByRole('button', { name: 'Send a new request' }));
    await waitFor(() => expect(keys).toHaveLength(1));
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('says nothing was debited when the mandate is rejected, and stops polling', async () => {
    let reads = 0;
    server.use(
      http.get(`${TEST_API}/mandates/${mandateId}`, () => {
        reads += 1;
        return HttpResponse.json(mandate('REJECTED'));
      }),
    );
    renderWithProviders(<MandateScreen mandateId={mandateId} pollMs={20} />);
    expect(
      await screen.findByText('This mandate could not be set up. Nothing was debited.'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back to my SIPs' })).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(reads).toBe(1);
  });
});
