import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { renderWithProviders, TEST_API } from '../test-utils';
import { IdentityScreen } from './IdentityScreen';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('IdentityScreen (ONB-01/02)', () => {
  it('submits PAN, name and DOB only after the KYC consent checkbox is ticked', async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post(`${TEST_API}/onboarding/identity`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ stage: 'IDENTITY' });
      }),
    );
    const user = userEvent.setup();
    const { nav } = renderWithProviders(<IdentityScreen />);
    await user.type(screen.getByLabelText('PAN'), 'abcpk1234a');
    await user.type(screen.getByLabelText('Full name (as per PAN)'), 'Asha Rao');
    await user.type(screen.getByLabelText('Date of birth'), '1990-05-12');
    const submit = screen.getByRole('button', { name: 'Continue' });
    // RV-03-13: Plan 01's Button reports aria-disabled (no jest-dom matcher is installed).
    expect(submit.getAttribute('aria-disabled')).toBe('true');
    await user.click(screen.getByRole('checkbox', { name: /verify my KYC/i }));
    expect(submit.getAttribute('aria-disabled')).not.toBe('true');
    await user.click(submit);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/onboarding'));
    // The checkbox only gates Continue: the server records the KYC_CONSENT acceptance itself (E6), and
    // SubmitIdentityInputSchema is a strictObject, so no consent flag goes on the wire.
    expect(bodies).toEqual([{ pan: 'ABCPK1234A', name: 'Asha Rao', dateOfBirth: '1990-05-12' }]);
  });

  it('rejects an invalid PAN without calling the API', async () => {
    const user = userEvent.setup();
    renderWithProviders(<IdentityScreen />);
    await user.type(screen.getByLabelText('PAN'), '12345');
    await user.click(screen.getByRole('checkbox', { name: /verify my KYC/i }));
    expect(await screen.findByText(/Enter a valid PAN/i)).toBeTruthy();
    // Continue stays disabled (a pointer press on it is a no-op), so no request is made; msw would fail on one.
    expect(screen.getByRole('button', { name: 'Continue' }).getAttribute('aria-disabled')).toBe(
      'true',
    );
  });
  it('shows the KYC consent text and version in a sheet before the investor ticks the box', async () => {
    server.use(
      http.get(`${TEST_API}/legal/documents/KYC_CONSENT`, () =>
        HttpResponse.json({
          key: 'KYC_CONSENT',
          version: '2',
          bodyMarkdown: 'We will check your KYC status with the KRA.',
          sha256: 'abc',
        }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<IdentityScreen />);
    await user.click(screen.getByRole('button', { name: 'Read KYC consent' }));
    const dialog = await screen.findByRole('dialog', { name: 'KYC consent' });
    expect(
      await within(dialog).findByText('We will check your KYC status with the KRA.'),
    ).toBeTruthy();
    expect(within(dialog).getByText('Version 2')).toBeTruthy();
  });
});
