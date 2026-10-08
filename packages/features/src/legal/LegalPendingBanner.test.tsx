import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { renderWithProviders, TEST_API } from '../test-utils';
import { LegalPendingBanner } from './LegalPendingBanner';

const pending = [{ key: 'TNC', version: '3', title: 'Terms and Conditions' }];
const onboardingAt = (stage: string) =>
  http.get(`${TEST_API}/onboarding`, () => HttpResponse.json({ stage, readinessCode: null }));
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('LegalPendingBanner (R-18)', () => {
  it('appears for a new document version and the re-accept sheet records the acceptance', async () => {
    let accepted: unknown;
    server.use(
      onboardingAt('DONE'),
      // Like the server: the document stops being pending once its acceptance is recorded.
      http.get(`${TEST_API}/legal/pending`, () => HttpResponse.json(accepted ? [] : pending)),
      http.post(`${TEST_API}/legal/pending/accept`, async ({ request }) => {
        accepted = await request.json();
        return HttpResponse.json({ ok: true });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<LegalPendingBanner />);
    expect(await screen.findByText('Updated terms are available.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Review now' }));
    const checkbox = screen.getByLabelText(
      'I have read and accept the updated Terms and Conditions',
    );
    const submit = screen.getByRole('button', { name: 'Accept and continue' });
    // RV-03-13: Plan 01's Button reports aria-disabled (no jest-dom matcher is installed).
    expect(submit.getAttribute('aria-disabled')).toBe('true');
    await user.click(checkbox);
    expect(submit.getAttribute('aria-disabled')).not.toBe('true');
    await user.click(submit);
    await waitFor(() => expect(accepted).toEqual({ accept: [{ key: 'TNC', version: '3' }] }));
    await waitFor(() => expect(screen.queryByText('Updated terms are available.')).toBeNull());
  });

  it('renders nothing when no document is pending', async () => {
    server.use(
      onboardingAt('DONE'),
      http.get(`${TEST_API}/legal/pending`, () => HttpResponse.json([])),
    );
    const { container } = renderWithProviders(<LegalPendingBanner />);
    await waitFor(() => expect(container.textContent).toBe(''));
  });

  it('stays hidden while onboarding is not DONE, so a new investor is not offered the declarations out of band', async () => {
    let pendingReads = 0;
    server.use(
      onboardingAt('DECLARATIONS'),
      // A new investor's pending list holds every required document they have not been asked about yet.
      http.get(`${TEST_API}/legal/pending`, () => {
        pendingReads += 1;
        return HttpResponse.json(pending);
      }),
    );
    const { container } = renderWithProviders(<LegalPendingBanner />);
    await waitFor(() => expect(container.textContent).toBe(''));
    // Give the (unwanted) pending read a chance to land before asserting nothing rendered.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText('Updated terms are available.')).toBeNull();
    expect(pendingReads).toBe(0);
  });
});
