import { render, screen } from '@testing-library/react';
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AmountInput, Checkbox, RadioGroup, SegmentedControl, Select } from './index';

function setupUser() {
  return userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });
}

describe('Checkbox', () => {
  it('toggles on press and exposes an accessible checked state', async () => {
    const user = setupUser();
    const onChange = vi.fn();
    render(<Checkbox label="I agree" checked={false} onChange={onChange} testID="agree" />);
    const box = screen.getByRole('checkbox', { name: 'I agree' });
    expect(box.getAttribute('aria-checked')).toBe('false');
    await user.click(box);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('shows an error message in an alert region', () => {
    render(
      <Checkbox
        label="I agree"
        checked={false}
        onChange={vi.fn()}
        error="You must agree to continue"
      />,
    );
    expect(screen.getByRole('alert').textContent).toBe('You must agree to continue');
  });
});

describe('RadioGroup', () => {
  const options = [
    { value: 'NONE', label: 'None' },
    { value: 'PEP', label: 'Politically exposed' },
  ];

  it('selects one option and reports the value', async () => {
    const user = setupUser();
    const onChange = vi.fn();
    render(<RadioGroup label="PEP status" value={null} options={options} onChange={onChange} />);
    await user.click(screen.getByRole('radio', { name: 'Politically exposed' }));
    expect(onChange).toHaveBeenCalledWith('PEP');
  });

  it('marks the selected option as checked', () => {
    render(<RadioGroup label="PEP status" value="NONE" options={options} onChange={vi.fn()} />);
    expect(screen.getByRole('radio', { name: 'None' }).getAttribute('aria-checked')).toBe('true');
    expect(
      screen.getByRole('radio', { name: 'Politically exposed' }).getAttribute('aria-checked'),
    ).toBe('false');
  });
});

describe('SegmentedControl', () => {
  const options = [
    { value: 'NO', label: 'No' },
    { value: 'YES', label: 'Yes' },
  ];

  it('selects a segment and reports the value', async () => {
    const user = setupUser();
    const onChange = vi.fn();
    render(
      <SegmentedControl label="US person?" value="NO" options={options} onChange={onChange} />,
    );
    await user.click(screen.getByRole('radio', { name: 'Yes' }));
    expect(onChange).toHaveBeenCalledWith('YES');
  });
});

describe('Select', () => {
  const options = [
    { value: 'MALE', label: 'Male' },
    { value: 'FEMALE', label: 'Female' },
    { value: 'OTHER', label: 'Other' },
  ];

  function ControlledSelect() {
    const [value, setValue] = useState<string | null>(null);
    return (
      <Select
        label="Gender"
        placeholder="Choose one"
        value={value}
        options={options}
        onChange={setValue}
      />
    );
  }

  it('opens a sheet of options and reports the pick as the button label', async () => {
    const user = setupUser();
    render(<ControlledSelect />);
    const trigger = screen.getByRole('button', { name: 'Gender: Choose one' });
    await user.click(trigger);
    await user.click(screen.getByRole('radio', { name: 'Female' }));
    expect(await screen.findByRole('button', { name: 'Gender: Female' })).toBeTruthy();
  });
});

describe('AmountInput', () => {
  it('keeps digits and a single decimal point, at most two decimal places', async () => {
    const user = setupUser();
    const onChangeValue = vi.fn();
    // Controlled, as every screen uses it: an input pinned to value="" reports only the last key (RV-03-9).
    function ControlledAmount() {
      const [value, setValue] = useState('');
      return (
        <AmountInput
          label="Amount"
          value={value}
          onChangeValue={(next) => {
            setValue(next);
            onChangeValue(next);
          }}
        />
      );
    }
    render(<ControlledAmount />);
    const input = screen.getByLabelText('Amount');
    await user.type(input, '12a.3.456');
    expect(onChangeValue).toHaveBeenLastCalledWith('12.34');
  });
});
