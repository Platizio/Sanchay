import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { renderWithProviders, TEST_API } from '../test-utils';
import { AddressScreen } from './AddressScreen';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('AddressScreen (ONB-06)', () => {
  it('autofills city and state once a valid pincode is entered', async () => {
    server.use(
      http.get(`${TEST_API}/ref/pincode/411001`, () =>
        HttpResponse.json({ city: 'Pune', state: 'Maharashtra' }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<AddressScreen />);
    await user.type(screen.getByLabelText('Pincode'), '411001');
    // RV-03-13: read the input's value (no jest-dom matcher is installed), as Plan 01's tests do.
    const fieldValue = (label: string) => (screen.getByLabelText(label) as HTMLInputElement).value;
    await waitFor(() => expect(fieldValue('City')).toBe('Pune'));
    expect(fieldValue('State')).toBe('Maharashtra');
  });
});
