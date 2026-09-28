import type { AppTabKey } from '@sanchay/features';
import { describe, expect, it } from 'vitest';
import { navKeyForPath } from './nav';

describe('navKeyForPath (H-14: Home, Explore, Portfolio, Account)', () => {
  it.each<[string, AppTabKey | null]>([
    ['/', 'home'],
    ['/r/payment', null],
    ['/explorer', null],
    ['/explore', 'explore'],
    ['/explore/category/large-cap-fund', 'explore'],
    ['/funds/axis-bluechip-fund-regular-growth', 'explore'],
    ['/invest/INF200K01RJ1/sip', 'explore'],
    ['/portfolio', 'portfolio'],
    ['/portfolio/orders', 'portfolio'],
    ['/redeem/F1/INF200K01RJ1', 'portfolio'],
    ['/account', 'account'],
    ['/account/legal', 'account'],
  ])('maps %s to %s', (pathname, key) => {
    expect(navKeyForPath(pathname)).toBe(key);
  });
});
