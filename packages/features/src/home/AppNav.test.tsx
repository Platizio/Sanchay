import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../test-utils';
import { APP_TABS, AppNav, navLayoutFor, SIDEBAR_MIN_WIDTH, tabForPath } from './AppNav';

describe('navLayoutFor', () => {
  it('uses the sidebar from 1024 px and the bottom bar below it (768-1023 px included)', () => {
    expect(SIDEBAR_MIN_WIDTH).toBe(1024);
    expect(navLayoutFor(1440)).toBe('sidebar');
    expect(navLayoutFor(1024)).toBe('sidebar');
    expect(navLayoutFor(1023)).toBe('bottom');
    expect(navLayoutFor(768)).toBe('bottom');
    expect(navLayoutFor(375)).toBe('bottom');
  });
});

describe('tabForPath', () => {
  it('maps the four root routes and their sub-paths, and nothing else', () => {
    expect(APP_TABS.map((t) => [t.key, t.label, t.href])).toEqual([
      ['home', 'Home', '/'],
      ['explore', 'Explore', '/explore'],
      ['portfolio', 'Portfolio', '/portfolio'],
      ['account', 'Account', '/account'],
    ]);
    expect(tabForPath('/')).toBe('home');
    expect(tabForPath('/explore')).toBe('explore');
    expect(tabForPath('/explore/category/large-cap')).toBe('explore');
    expect(tabForPath('/portfolio/orders/0190c0de-0000-7000-8000-000000000009')).toBe('portfolio');
    expect(tabForPath('/account')).toBe('account');
    expect(tabForPath('/explorer')).toBeNull();
    expect(tabForPath('/onboarding/identity')).toBeNull();
  });
});

describe('AppNav', () => {
  it('renders the sidebar with the current page marked and pushes the tab href on press', async () => {
    const user = userEvent.setup();
    const { nav } = renderWithProviders(<AppNav active="home" layout="sidebar" />);
    expect(screen.getByTestId('app-nav-sidebar')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeTruthy();
    expect(screen.getAllByRole('link').map((el) => el.textContent)).toEqual([
      'Home',
      'Explore',
      'Portfolio',
      'Account',
    ]);
    expect(screen.getByRole('link', { name: 'Home' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Explore' }).getAttribute('aria-current')).toBeNull();
    await user.click(screen.getByRole('link', { name: 'Explore' }));
    expect(nav.push).toHaveBeenCalledWith('/explore');
  });

  it('renders the bottom bar with no current page on a non-tab route', () => {
    renderWithProviders(<AppNav active={null} layout="bottom" />);
    expect(screen.getByTestId('app-nav-bottom')).toBeTruthy();
    for (const link of screen.getAllByRole('link')) {
      expect(link.getAttribute('aria-current')).toBeNull();
    }
  });
});
