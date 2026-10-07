import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { renderWithProviders, TEST_API } from '../test-utils';
import { ExploreScreen } from './ExploreScreen';

const categories = () => [
  {
    code: 'EQ_FLEXI',
    assetClass: 'EQUITY',
    name: 'Flexi Cap',
    slug: 'flexi-cap',
    cutoffClass: 'STANDARD',
    volatilityClass: 'V_EQUITY',
  },
];
const schemes = () => ({
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

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('ExploreScreen', () => {
  it('lists category tiles and the curated catalogue, with disclosures always shown', async () => {
    server.use(
      http.get(`${TEST_API}/catalogue/categories`, () => HttpResponse.json(categories())),
      http.get(`${TEST_API}/catalogue/schemes`, () => HttpResponse.json(schemes())),
    );
    renderWithProviders(<ExploreScreen />);
    expect(await screen.findByText('Flexi Cap')).toBeTruthy();
    expect(await screen.findByText('Parag Parikh Flexi Cap Fund - Regular - Growth')).toBeTruthy();
    expect(screen.getByText(/subject to market risks/)).toBeTruthy();
  });

  it('navigates to the fund page on row press', async () => {
    server.use(
      http.get(`${TEST_API}/catalogue/categories`, () => HttpResponse.json(categories())),
      http.get(`${TEST_API}/catalogue/schemes`, () => HttpResponse.json(schemes())),
    );
    const { nav } = renderWithProviders(<ExploreScreen />);
    const row = await screen.findByText('Parag Parikh Flexi Cap Fund - Regular - Growth');
    await userEvent.click(row);
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/funds/parag-parikh-flexi-cap'));
  });

  it('pushes to the search screen from the search entry point', async () => {
    server.use(
      http.get(`${TEST_API}/catalogue/categories`, () => HttpResponse.json(categories())),
      http.get(`${TEST_API}/catalogue/schemes`, () => HttpResponse.json(schemes())),
    );
    const { nav } = renderWithProviders(<ExploreScreen />);
    await userEvent.click(await screen.findByRole('button', { name: /search/i }));
    expect(nav.push).toHaveBeenCalledWith('/explore/search');
  });
});
