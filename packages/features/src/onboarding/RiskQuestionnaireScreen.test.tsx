import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { renderWithProviders, TEST_API } from '../test-utils';
import { RiskQuestionnaireScreen } from './RiskQuestionnaireScreen';

const option = (value: string, label: string, points: number) => ({ value, label, points });

/** The published GAP-03 v1.0.0 questionnaire as `riskProfile.questionnaire` serves it (E9). */
const questionnaire = {
  version: '1.0.0',
  sha256: 'ab'.repeat(32),
  questions: [
    { id: 'Q1', text: 'Age', derivedFromDob: true },
    {
      id: 'Q2',
      text: 'When will you need this money?',
      options: [option('<1', 'Within 1 year', 1), option('3-5', '3 to 5 years', 3)],
    },
    {
      id: 'Q3',
      text: 'Main goal',
      options: [
        option('PROTECT_CAPITAL', 'Protect capital', 1),
        option('BALANCED_GROWTH', 'Balanced growth', 3),
      ],
    },
    {
      id: 'Q4',
      text: 'Income stability',
      options: [option('VARIABLE', 'Variable', 2), option('STABLE', 'Stable', 3)],
    },
    {
      id: 'Q5',
      text: 'Emergency savings',
      options: [option('NONE', 'None', 1), option('M3_6', '3 to 6 months', 3)],
    },
    {
      id: 'Q6',
      text: 'Share of income going to EMIs',
      options: [option('GT_50', 'More than 50%', 1), option('PCT_10_30', '10 to 30%', 3)],
    },
    {
      id: 'Q7',
      text: 'Experience',
      options: [
        option('NONE', 'None', 1),
        option('EQUITY_LT_3Y', 'Equity mutual funds, less than 3 years', 3),
      ],
    },
    {
      id: 'Q8',
      text: 'Your portfolio falls 20% in 3 months. You:',
      options: [option('SELL_ALL', 'Sell all', 1), option('HOLD', 'Hold', 3)],
    },
  ],
};
const result = {
  level: 'MODERATE',
  maxRiskometer: 'MODERATELY_HIGH',
  rawScore: 21,
  status: 'ACTIVE',
  completedAt: '2026-10-12T00:00:00.000Z',
  expiresAt: '2028-10-12T00:00:00.000Z',
  questionnaireVersion: '1.0.0',
};
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

async function answer(user: ReturnType<typeof userEvent.setup>, question: string, label: string) {
  const group = screen.getByRole('radiogroup', { name: question });
  await user.click(within(group).getByRole('radio', { name: label }));
}

describe('RiskQuestionnaireScreen', () => {
  it('asks the date of birth for Q1, scores on the server and shows the level and expiry', async () => {
    let body: unknown;
    let key: string | null = null;
    server.use(
      http.get(`${TEST_API}/risk-profile/questionnaire`, () => HttpResponse.json(questionnaire)),
      http.put(`${TEST_API}/risk-profile`, async ({ request }) => {
        body = await request.json();
        key = request.headers.get('idempotency-key');
        return HttpResponse.json(result);
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<RiskQuestionnaireScreen />);
    const submit = await screen.findByRole('button', { name: 'See my risk profile' });
    expect(submit.getAttribute('aria-disabled')).toBe('true');
    await user.type(screen.getByLabelText('Date of birth'), '1990-05-12');
    await answer(user, 'When will you need this money?', '3 to 5 years');
    await answer(user, 'Main goal', 'Balanced growth');
    await answer(user, 'Income stability', 'Stable');
    await answer(user, 'Emergency savings', '3 to 6 months');
    await answer(user, 'Share of income going to EMIs', '10 to 30%');
    await answer(user, 'Experience', 'Equity mutual funds, less than 3 years');
    expect(submit.getAttribute('aria-disabled')).toBe('true');
    await answer(user, 'Your portfolio falls 20% in 3 months. You:', 'Hold');
    expect(submit.getAttribute('aria-disabled')).not.toBe('true');
    await user.click(submit);
    expect(await screen.findByText('Moderate')).toBeTruthy();
    expect(screen.getByText('Valid until 12 Oct 2028')).toBeTruthy();
    expect(body).toEqual({
      dob: '1990-05-12',
      horizon: '3-5',
      goal: 'BALANCED_GROWTH',
      incomeStability: 'STABLE',
      emergencySavings: 'M3_6',
      emiShare: 'PCT_10_30',
      experience: 'EQUITY_LT_3Y',
      reaction: 'HOLD',
    });
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('continues to the hub from the result', async () => {
    server.use(
      http.get(`${TEST_API}/risk-profile/questionnaire`, () => HttpResponse.json(questionnaire)),
      http.put(`${TEST_API}/risk-profile`, () => HttpResponse.json(result)),
    );
    const user = userEvent.setup();
    const { nav } = renderWithProviders(<RiskQuestionnaireScreen />);
    await screen.findByRole('button', { name: 'See my risk profile' });
    await user.type(screen.getByLabelText('Date of birth'), '1990-05-12');
    await answer(user, 'When will you need this money?', '3 to 5 years');
    await answer(user, 'Main goal', 'Balanced growth');
    await answer(user, 'Income stability', 'Stable');
    await answer(user, 'Emergency savings', '3 to 6 months');
    await answer(user, 'Share of income going to EMIs', '10 to 30%');
    await answer(user, 'Experience', 'None');
    await answer(user, 'Your portfolio falls 20% in 3 months. You:', 'Hold');
    await user.click(screen.getByRole('button', { name: 'See my risk profile' }));
    await user.click(await screen.findByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/onboarding'));
  });

  it('shows the error copy when the questionnaire is not published yet (R-36)', async () => {
    server.use(
      http.get(`${TEST_API}/risk-profile/questionnaire`, () =>
        HttpResponse.json(
          {
            defined: true,
            code: 'INTERNAL',
            status: 500,
            message: 'INTERNAL',
            data: { retryable: false, requestId: '0190c0de-0000-7000-8000-0000000000bb' },
          },
          { status: 500 },
        ),
      ),
    );
    renderWithProviders(<RiskQuestionnaireScreen />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});
