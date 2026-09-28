export const color = {
  bg: '#FFFFFF',
  surface: '#F6F7F9',
  text: '#0B1220',
  muted: '#4A5568',
  primary: '#0B5FFF',
  onPrimary: '#FFFFFF',
  gain: '#0A7A3D',
  loss: '#C0262D',
  warn: '#8A5A00',
  border: '#D5DAE1',
  inputBorder: '#6B7280',
} as const;
export type ColorToken = keyof typeof color;

export const fontSize = { xs: 12, sm: 14, md: 16, lg: 20, xl: 24, xxl: 32 } as const;
export const lineHeight = { xs: 16, sm: 20, md: 24, lg: 28, xl: 32, xxl: 40 } as const;
export const fontWeight = { regular: '400', medium: '500', semibold: '600', bold: '700' } as const;
export const fontFamilyWeb =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif';

export const spacingUnit = 4;
export function space(steps: number): number {
  return steps * spacingUnit;
}

export const radius = { sm: 6, md: 12, pill: 999 } as const;

/** 48 dp satisfies Android's 48 dp and WCAG 2.5.8 (24 px) at once. */
export const minTouchTarget = 48;
