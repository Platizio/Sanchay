const LEVEL_LABEL: Record<string, string> = {
  CONSERVATIVE: 'Conservative',
  MOD_CONSERVATIVE: 'Moderately conservative',
  MODERATE: 'Moderate',
  MOD_AGGRESSIVE: 'Moderately aggressive',
  AGGRESSIVE: 'Aggressive',
};

/** The investor-facing name of a `RISK_LEVELS` code (E9); an unknown code is shown as it came. */
export function riskLevelLabel(level: string): string {
  return LEVEL_LABEL[level] ?? level;
}
