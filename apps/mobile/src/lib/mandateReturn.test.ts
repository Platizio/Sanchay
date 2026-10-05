import { describe, expect, it } from 'vitest';
import { mandateReturnUrl } from './mandateReturn';

describe('mandateReturnUrl (H-1 App Link)', () => {
  it('is /app/r/mandate on the app origin', () => {
    expect(mandateReturnUrl('https://app.sanchay.in')).toBe('https://app.sanchay.in/app/r/mandate');
  });

  it('keeps only the origin of what it is given', () => {
    expect(mandateReturnUrl('http://10.0.2.2:3001/')).toBe('http://10.0.2.2:3001/app/r/mandate');
  });
});
