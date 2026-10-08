import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { renderWithProviders, TEST_API } from '../test-utils';
import { FatcaScreen } from './FatcaScreen';
import { getProfileDraft, resetProfileDraft, updateProfileDraft } from './useOnboarding';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  resetProfileDraft();
});
afterAll(() => server.close());

/** Two segmented controls share the "Yes"/"No" labels, so a control is picked by position. */
const radio = (name: 'Yes' | 'No', index: number) =>
  screen.getAllByRole('radio', { name })[index] as HTMLElement;

describe('FatcaScreen (ONB-07)', () => {
  it('shows the refusal copy and disables Continue when either FATCA question is Yes', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FatcaScreen />);
    // The first "No" is the other-country control, the second "Yes" is the US-person control.
    await user.click(radio('No', 0));
    await user.click(radio('Yes', 1));
    expect(
      await screen.findByText(
        /unable to onboard US persons or investors tax-resident outside India/i,
      ),
    ).toBeTruthy();
    // RV-03-13: Plan 01's Button reports aria-disabled (no jest-dom matcher is installed).
    expect(screen.getByRole('button', { name: 'Continue' }).getAttribute('aria-disabled')).toBe(
      'true',
    );
  });

  it('sends the whole draft as the contract flat PUT /onboarding/profile body, then clears it', async () => {
    const bodies: unknown[] = [];
    server.use(
      http.put(`${TEST_API}/onboarding/profile`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ stage: 'BANK' });
      }),
      http.get(`${TEST_API}/onboarding`, () =>
        HttpResponse.json({ stage: 'BANK', readinessCode: null }),
      ),
    );
    updateProfileDraft({
      gender: 'FEMALE',
      occupation: 'SERVICE_PRIVATE_SECTOR',
      incomeSlab: '5L_TO_10L',
      sourceOfWealth: 'SALARY',
      pepStatus: 'NOT_APPLICABLE',
      taxStatus: 'RESIDENT_INDIVIDUAL',
      nationality: 'Indian',
      countryOfBirth: 'India',
      placeOfBirth: 'Pune',
      addressLine1: '221B, MG Road',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411001',
      addressNature: 'RESIDENTIAL',
    });
    const user = userEvent.setup();
    const { nav } = renderWithProviders(<FatcaScreen />);
    await user.click(radio('No', 0));
    await user.click(radio('No', 1));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/onboarding'));
    expect(bodies).toEqual([
      {
        gender: 'FEMALE',
        occupation: 'SERVICE_PRIVATE_SECTOR',
        incomeSlab: '5L_TO_10L',
        sourceOfWealth: 'SALARY',
        pepStatus: 'NOT_APPLICABLE',
        taxStatus: 'RESIDENT_INDIVIDUAL',
        nationality: 'Indian',
        countryOfBirth: 'India',
        placeOfBirth: 'Pune',
        taxResidentElsewhere: false,
        usPerson: false,
        addressLine1: '221B, MG Road',
        city: 'Pune',
        state: 'Maharashtra',
        pincode: '411001',
        addressNature: 'RESIDENTIAL',
      },
    ]);
    expect(getProfileDraft()).toEqual({});
  });

  it('restarts the profile when the draft is empty, for example after a reload', async () => {
    const user = userEvent.setup();
    const { nav } = renderWithProviders(<FatcaScreen />);
    await user.click(radio('No', 0));
    await user.click(radio('No', 1));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/onboarding/personal'));
  });
});
