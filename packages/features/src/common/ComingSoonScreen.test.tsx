import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ComingSoonScreen } from './ComingSoonScreen';

describe('ComingSoonScreen', () => {
  it('shows the section title and a coming-soon line', () => {
    render(<ComingSoonScreen title="Explore" />);
    expect(screen.getByTestId('coming-soon-screen')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Explore' })).toBeTruthy();
    expect(screen.getByText('This section is coming soon.')).toBeTruthy();
  });
});
