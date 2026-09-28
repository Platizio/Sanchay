import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  color,
  contrastRatio,
  fontFamilyWeb,
  fontSize,
  lineHeight,
  minTouchTarget,
  radius,
  relativeLuminance,
  space,
  spacingUnit,
} from './index.js';

// Compared case-insensitively: the CSS formatter is allowed to normalise hex case.
const css = readFileSync(new URL('../theme.css', import.meta.url), 'utf8').toLowerCase();
const kebab = (name: string): string => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

describe('contrastRatio', () => {
  it('is 21:1 for black on white', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
  });
  it('is 1:1 for identical colours', () => {
    expect(contrastRatio('#0B5FFF', '#0B5FFF')).toBe(1);
  });
  it('is symmetric', () => {
    expect(contrastRatio('#FFFFFF', '#0B1220')).toBe(contrastRatio('#0B1220', '#FFFFFF'));
  });
  it('rejects values that are not #RRGGBB', () => {
    expect(() => relativeLuminance('red')).toThrow('#RRGGBB');
  });
});

describe('WCAG 2.2 AA pairs used by the retail UI', () => {
  const textPairs = [
    ['text', 'bg'],
    ['text', 'surface'],
    ['muted', 'bg'],
    ['muted', 'surface'],
    ['primary', 'bg'],
    ['primary', 'surface'],
    ['onPrimary', 'primary'],
    ['gain', 'bg'],
    ['gain', 'surface'],
    ['loss', 'bg'],
    ['loss', 'surface'],
    ['warn', 'bg'],
    ['warn', 'surface'],
  ] as const;
  it.each(textPairs)('%s on %s is at least 4.5:1 (1.4.3)', (fg, bg) => {
    expect(contrastRatio(color[fg], color[bg])).toBeGreaterThanOrEqual(4.5);
  });

  const nonTextPairs = [
    ['inputBorder', 'bg'],
    ['inputBorder', 'surface'],
  ] as const;
  it.each(nonTextPairs)('%s against %s is at least 3:1 (1.4.11)', (fg, bg) => {
    expect(contrastRatio(color[fg], color[bg])).toBeGreaterThanOrEqual(3);
  });
});

describe('scale helpers', () => {
  it('space() multiplies the 4 px unit', () => {
    expect(space(0)).toBe(0);
    expect(space(4)).toBe(16);
  });
  it('minimum touch target is 48', () => {
    expect(minTouchTarget).toBe(48);
  });
});

describe('theme.css mirrors tokens.ts', () => {
  it.each(Object.entries(color))('--color-%s', (name, value) => {
    expect(css).toContain(`--color-${kebab(name)}: ${value.toLowerCase()};`);
  });
  it.each(Object.entries(fontSize))('--text-%s', (name, px) => {
    expect(css).toContain(`--text-${name}: ${px}px;`);
    expect(css).toContain(
      `--text-${name}--line-height: ${lineHeight[name as keyof typeof lineHeight]}px;`,
    );
  });
  it.each(Object.entries(radius))('--radius-%s', (name, px) => {
    expect(css).toContain(`--radius-${name}: ${px}px;`);
  });
  it('spacing and font family', () => {
    expect(css).toContain(`--spacing: ${spacingUnit}px;`);
    expect(css).toContain(`--font-sans: ${fontFamilyWeb.toLowerCase()};`);
  });
});
