import { render, screen } from '@testing-library/react';
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Banner, OtpInput, sanitizeOtp, TextField } from './index';

function setupUser() {
  return userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });
}

function ControlledOtp({ onComplete }: { onComplete: (code: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <OtpInput label="One-time code" value={value} onChangeText={setValue} onComplete={onComplete} />
  );
}

describe('TextField', () => {
  it('labels the input, shows the prefix and reports changes', async () => {
    const user = setupUser();
    const onChangeText = vi.fn();
    render(
      <TextField
        label="Mobile number"
        prefix="+91"
        value=""
        onChangeText={onChangeText}
        testID="mobile-input"
      />,
    );
    const input = screen.getByLabelText('Mobile number');
    await user.type(input, '9');
    expect(onChangeText).toHaveBeenCalledWith('9');
    expect(screen.getByText('+91')).toBeTruthy();
    expect(screen.getByTestId('mobile-input')).toBe(input);
  });

  it('announces errors in an alert region', () => {
    render(
      <TextField
        label="Mobile number"
        value=""
        onChangeText={vi.fn()}
        error="Enter a valid 10-digit Indian mobile number"
      />,
    );
    expect(screen.getByRole('alert').textContent).toBe(
      'Enter a valid 10-digit Indian mobile number',
    );
  });
});

describe('OtpInput', () => {
  it('strips non-digits and caps at 6 digits', () => {
    expect(sanitizeOtp(' 12a3-45 67')).toBe('123456');
  });

  it('fires onComplete once when the sixth digit arrives', async () => {
    const user = setupUser();
    const onComplete = vi.fn();
    render(<ControlledOtp onComplete={onComplete} />);
    const input = screen.getByLabelText('One-time code') as HTMLInputElement;
    await user.type(input, '12a3456');
    expect(input.value).toBe('123456');
    await user.type(input, '7');
    expect(input.value).toBe('123456');
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  it('uses one-time-code autofill and a numeric keypad on web', () => {
    render(<OtpInput label="One-time code" value="" onChangeText={vi.fn()} />);
    const input = screen.getByLabelText('One-time code');
    expect(input.getAttribute('autocomplete')).toBe('one-time-code');
    expect(input.getAttribute('inputmode')).toBe('numeric');
  });
});

describe('Banner', () => {
  it('uses role=alert for errors and no role for info', () => {
    const { rerender } = render(<Banner tone="error" message="That code is incorrect." />);
    expect(screen.getByRole('alert').textContent).toBe('That code is incorrect.');
    rerender(<Banner tone="info" message="We sent a code." />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('We sent a code.')).toBeTruthy();
  });
});
