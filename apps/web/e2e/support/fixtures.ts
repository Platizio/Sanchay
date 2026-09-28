import { test as base, expect } from '@playwright/test';

/** Fails any test whose page logs a Content Security Policy violation. */
export const test = base.extend<{ cspGuard: undefined }>({
  cspGuard: [
    async ({ page }, provide) => {
      const violations: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error' && /Content Security Policy/i.test(message.text())) {
          violations.push(message.text());
        }
      });
      await provide(undefined);
      expect(violations, 'CSP violations').toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };
