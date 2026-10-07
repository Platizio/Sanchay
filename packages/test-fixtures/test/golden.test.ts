import { describe, expect, it } from 'vitest';
import { RETURNS_VECTORS } from '../src/index.js';

describe('golden fixtures', () => {
  it('loads 6 returns vectors with unique ids RT-01..RT-06', () => {
    expect(RETURNS_VECTORS).toHaveLength(6);
    expect(RETURNS_VECTORS.map((v) => v.id)).toEqual(
      Array.from({ length: 6 }, (_, i) => `RT-${String(i + 1).padStart(2, '0')}`),
    );
  });
});
