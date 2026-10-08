import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../test-utils';
import { PersonalDetailsScreen } from './PersonalDetailsScreen';

async function chooseSelect(
  user: ReturnType<typeof userEvent.setup>,
  triggerName: RegExp,
  optionName: string,
) {
  await user.click(screen.getByRole('button', { name: triggerName }));
  await user.click(screen.getByRole('radio', { name: optionName }));
}

/** RV-03-13: Plan 01's Button reports aria-disabled (no jest-dom matcher is installed). */
const isDisabled = (el: HTMLElement) => el.getAttribute('aria-disabled') === 'true';

describe('PersonalDetailsScreen (ONB-05)', () => {
  it('keeps Continue disabled until every field is explicitly chosen, with no defaults', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PersonalDetailsScreen />);
    const submit = screen.getByRole('button', { name: 'Continue' });
    expect(isDisabled(submit)).toBe(true);

    await chooseSelect(user, /^Gender/, 'Female');
    expect(isDisabled(submit)).toBe(true);
    await chooseSelect(user, /^Occupation/, 'Private sector service');
    expect(isDisabled(submit)).toBe(true);
    await chooseSelect(user, /^Annual income/, '₹5,00,000 – ₹10,00,000');
    expect(isDisabled(submit)).toBe(true);
    await user.click(screen.getByRole('radio', { name: 'No, I am not' }));
    expect(isDisabled(submit)).toBe(true);
    await chooseSelect(user, /^Source of wealth/, 'Salary');
    expect(isDisabled(submit)).toBe(true);
    await chooseSelect(user, /^Country of birth/, 'India');
    expect(isDisabled(submit)).toBe(true);
    await chooseSelect(user, /^Nationality/, 'Indian');
    expect(isDisabled(submit)).toBe(true);
    await user.type(screen.getByLabelText('Place of birth'), 'Pune');
    expect(isDisabled(submit)).toBe(true);
    await chooseSelect(user, /^Tax status/, 'Resident individual');

    expect(isDisabled(submit)).toBe(false);
  });

  it("blocks a country of birth of 'Other' like the nationality guard, with Continue disabled", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PersonalDetailsScreen />);
    await chooseSelect(user, /^Gender/, 'Female');
    await chooseSelect(user, /^Occupation/, 'Private sector service');
    await chooseSelect(user, /^Annual income/, '₹5,00,000 – ₹10,00,000');
    await user.click(screen.getByRole('radio', { name: 'No, I am not' }));
    await chooseSelect(user, /^Source of wealth/, 'Salary');
    await chooseSelect(user, /^Nationality/, 'Indian');
    await user.type(screen.getByLabelText('Place of birth'), 'Dubai');
    await chooseSelect(user, /^Tax status/, 'Resident individual');
    await chooseSelect(user, /^Country of birth/, 'Other');
    expect(await screen.findByText(/Indian-born residents only for now/)).toBeTruthy();
    expect(isDisabled(screen.getByRole('button', { name: 'Continue' }))).toBe(true);
    await chooseSelect(user, /^Country of birth/, 'India');
    expect(isDisabled(screen.getByRole('button', { name: 'Continue' }))).toBe(false);
  });

  it('shows blocked copy as soon as PEP or a related PEP is selected', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PersonalDetailsScreen />);
    await user.click(screen.getByRole('radio', { name: /Yes, I am a PEP/ }));
    expect(await screen.findByText(/unable to open an account for you online/i)).toBeTruthy();
  });
});
