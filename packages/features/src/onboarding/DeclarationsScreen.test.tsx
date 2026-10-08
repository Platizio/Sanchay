import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { renderWithProviders, TEST_API } from '../test-utils';
import { DeclarationsScreen } from './DeclarationsScreen';

const doc = (key: string, title: string, version = '1') => ({ key, version, title });
const pending = [
  doc('TNC', 'Terms and Conditions', '3'),
  doc('PRIVACY_NOTICE', 'Privacy Notice'),
  doc('KYC_CONSENT', 'KYC consent'),
];
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('DeclarationsScreen (ONB-15)', () => {
  it('stages every pending declaration at its version, with an Idempotency-Key, then goes to review', async () => {
    let body: unknown;
    let key: string | null = null;
    server.use(
      http.get(`${TEST_API}/legal/pending`, () => HttpResponse.json(pending)),
      http.post(`${TEST_API}/onboarding/declarations`, async ({ request }) => {
        body = await request.json();
        key = request.headers.get('idempotency-key');
        return HttpResponse.json({ ok: true });
      }),
    );
    const user = userEvent.setup();
    const { nav } = renderWithProviders(<DeclarationsScreen />);
    const next = await screen.findByRole('button', { name: 'Continue to review' });
    // KYC_CONSENT is accepted at ONB-02 and re-accepted through the banner, never staged here (RV-03-54).
    expect(screen.queryByLabelText('KYC consent')).toBeNull();
    expect(next.getAttribute('aria-disabled')).toBe('true');
    await user.click(screen.getByLabelText('Terms and Conditions'));
    expect(next.getAttribute('aria-disabled')).toBe('true');
    await user.click(screen.getByLabelText('Privacy Notice'));
    expect(next.getAttribute('aria-disabled')).not.toBe('true');
    await user.click(next);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/onboarding/review'));
    expect(body).toEqual({
      accept: [
        { key: 'TNC', version: '3' },
        { key: 'PRIVACY_NOTICE', version: '1' },
      ],
    });
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('goes straight to review when nothing is pending (every document is held at its version)', async () => {
    server.use(http.get(`${TEST_API}/legal/pending`, () => HttpResponse.json([])));
    const user = userEvent.setup();
    const { nav } = renderWithProviders(<DeclarationsScreen />);
    await user.click(await screen.findByRole('button', { name: 'Continue to review' }));
    expect(nav.replace).toHaveBeenCalledWith('/onboarding/review');
  });

  it('shows the copy for DECLARATION_OUTDATED and stays on the screen', async () => {
    server.use(
      http.get(`${TEST_API}/legal/pending`, () =>
        HttpResponse.json([doc('TNC', 'Terms and Conditions')]),
      ),
      http.post(`${TEST_API}/onboarding/declarations`, () =>
        HttpResponse.json(
          {
            defined: true,
            code: 'DECLARATION_OUTDATED',
            status: 409,
            message: 'DECLARATION_OUTDATED',
            data: { retryable: false, requestId: '0190c0de-0000-7000-8000-0000000000bb' },
          },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    const { nav } = renderWithProviders(<DeclarationsScreen />);
    await user.click(await screen.findByLabelText('Terms and Conditions'));
    await user.click(screen.getByRole('button', { name: 'Continue to review' }));
    expect(
      await screen.findByText(
        'Our terms have been updated. Please review and accept them to continue.',
      ),
    ).toBeTruthy();
    expect(nav.replace).not.toHaveBeenCalled();
  });
});
