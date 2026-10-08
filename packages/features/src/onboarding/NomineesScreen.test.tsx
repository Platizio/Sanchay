import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { renderWithProviders, TEST_API } from '../test-utils';
import { NomineesScreen } from './NomineesScreen';

/** The real `NominationViewSchema` shape (E8): a decision enum, no ids, no dates. */
const emptyNomination = {
  decision: 'NOT_ASKED',
  displayPreference: null,
  setVersion: null,
  nominees: [],
};
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function withEmptyNomination() {
  server.use(
    http.get(`${TEST_API}/onboarding/nomination`, () => HttpResponse.json(emptyNomination)),
  );
}

/** `Select` is a button that opens a sheet (portalled to the body) of radios. */
async function pick(
  user: ReturnType<typeof userEvent.setup>,
  scope: HTMLElement,
  field: string,
  option: string,
) {
  await user.click(within(scope).getByRole('button', { name: new RegExp(`^${field}`) }));
  await user.click(await screen.findByRole('radio', { name: option }));
}

describe('NomineesScreen', () => {
  it('defaults each nominee to the 34/33/33 split and lets the investor edit it', async () => {
    withEmptyNomination();
    const user = userEvent.setup();
    renderWithProviders(<NomineesScreen />);
    await user.click(await screen.findByRole('button', { name: 'Add nominee' }));
    await user.click(screen.getByRole('button', { name: 'Add nominee' }));
    await user.click(screen.getByRole('button', { name: 'Add nominee' }));
    const shares = screen.getAllByLabelText('Share %') as HTMLInputElement[];
    expect(shares.map((i) => i.value)).toEqual(['34', '33', '33']);
    const [first] = shares as [HTMLInputElement];
    await user.clear(first);
    await user.type(first, '50');
    expect(first.value).toBe('50');
  });

  it('hides the add-nominee button once 3 nominees exist (MAX_NOMINEES)', async () => {
    withEmptyNomination();
    const user = userEvent.setup();
    renderWithProviders(<NomineesScreen />);
    const add = () => screen.getByRole('button', { name: 'Add nominee' });
    await user.click(await screen.findByRole('button', { name: 'Add nominee' }));
    await user.click(add());
    await user.click(add());
    expect(screen.queryByRole('button', { name: 'Add nominee' })).toBeNull();
  });

  it('requires the date of birth and a guardian name once a nominee is marked a minor', async () => {
    withEmptyNomination();
    const user = userEvent.setup();
    renderWithProviders(<NomineesScreen />);
    await user.click(await screen.findByRole('button', { name: 'Add nominee' }));
    const card = screen.getByTestId('nominee-0');
    expect(within(card).queryByLabelText('Guardian name')).toBeNull();
    await user.click(within(card).getByLabelText('Nominee is a minor'));
    expect(within(card).getByLabelText('Guardian name')).toBeTruthy();
    expect(within(card).getByLabelText('Date of birth')).toBeTruthy();
    await user.type(within(card).getByLabelText('Full name'), 'Aarav Shah');
    await pick(user, card, 'Relationship', 'Son');
    await user.click(screen.getByRole('button', { name: 'Save nomination' }));
    expect(
      await screen.findByText(
        'Enter the date of birth and the guardian’s name for every minor nominee.',
      ),
    ).toBeTruthy();
  });

  it('refuses shares that do not add up to 100 before calling the API', async () => {
    withEmptyNomination();
    const user = userEvent.setup();
    renderWithProviders(<NomineesScreen />);
    await user.click(await screen.findByRole('button', { name: 'Add nominee' }));
    await user.click(screen.getByRole('button', { name: 'Add nominee' }));
    for (const [index, name] of ['Aarav Shah', 'Isha Shah'].entries()) {
      const card = screen.getByTestId(`nominee-${index}`);
      await user.type(within(card).getByLabelText('Full name'), name);
      await pick(user, card, 'Relationship', 'Son');
    }
    const [first] = screen.getAllByLabelText('Share %') as [HTMLInputElement, HTMLInputElement];
    await user.clear(first);
    await user.type(first, '70');
    await user.click(screen.getByRole('button', { name: 'Save nomination' }));
    expect(await screen.findByText('Shares must add up to exactly 100% (now 120%).')).toBeTruthy();
  });

  it('saves the nomination as the contract PUT body with an Idempotency-Key, then returns to the hub', async () => {
    let body: unknown;
    let key: string | null = null;
    withEmptyNomination();
    server.use(
      http.put(`${TEST_API}/onboarding/nomination`, async ({ request }) => {
        body = await request.json();
        key = request.headers.get('idempotency-key');
        return HttpResponse.json({
          decision: 'NOMINATED',
          displayPreference: false,
          setVersion: 1,
          nominees: [
            {
              position: 1,
              name: 'Aarav Shah',
              relationship: 'SON',
              isMinor: false,
              allocationPct: 100,
            },
          ],
        });
      }),
    );
    const user = userEvent.setup();
    const { nav } = renderWithProviders(<NomineesScreen />);
    await user.click(await screen.findByRole('button', { name: 'Add nominee' }));
    const card = screen.getByTestId('nominee-0');
    await user.type(within(card).getByLabelText('Full name'), 'Aarav Shah');
    await pick(user, card, 'Relationship', 'Son');
    await user.click(screen.getByRole('button', { name: 'Save nomination' }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/onboarding'));
    expect(body).toEqual({
      decision: 'NOMINATED',
      nominees: [{ name: 'Aarav Shah', relationship: 'SON', isMinor: false, allocationPct: 100 }],
    });
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('records an opt-out when the investor does not want to add a nominee (ONB-14)', async () => {
    let body: unknown;
    withEmptyNomination();
    server.use(
      http.put(`${TEST_API}/onboarding/nomination`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          decision: 'OPTED_OUT',
          displayPreference: null,
          setVersion: null,
          nominees: [],
        });
      }),
    );
    const user = userEvent.setup();
    const { nav } = renderWithProviders(<NomineesScreen />);
    await user.click(await screen.findByRole('button', { name: 'I don’t want to add a nominee' }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/onboarding'));
    expect(body).toEqual({ decision: 'OPTED_OUT' });
  });
});
