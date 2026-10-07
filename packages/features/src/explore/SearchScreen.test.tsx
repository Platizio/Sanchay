import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { renderWithProviders, TEST_API } from '../test-utils';
import { SearchScreen } from './SearchScreen';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('SearchScreen', () => {
  it('queries catalogue.listSchemes with the typed text and lists results', async () => {
    server.use(
      http.get(`${TEST_API}/catalogue/schemes`, ({ request }) => {
        const q = new URL(request.url).searchParams.get('q');
        expect(q).toBe('parag');
        return HttpResponse.json({
          items: [
            {
              isin: 'INF000P05055',
              name: 'Parag Parikh Flexi Cap Fund - Regular - Growth',
              slug: 'parag-parikh-flexi-cap',
              categoryCode: 'EQ_FLEXI',
              status: 'PUBLISHED',
              curated: true,
            },
          ],
          nextCursor: null,
        });
      }),
    );
    renderWithProviders(<SearchScreen />);
    await userEvent.type(screen.getByLabelText('Search funds'), 'parag');
    await waitFor(async () =>
      expect(
        await screen.findByText('Parag Parikh Flexi Cap Fund - Regular - Growth'),
      ).toBeTruthy(),
    );
  });

  it('shows nothing until at least one character is typed', () => {
    renderWithProviders(<SearchScreen />);
    expect(screen.queryByText(/no funds found/i)).toBeFalsy();
  });
});
