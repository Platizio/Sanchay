export const NAV_ROW_MIN_COUNT = 1000;
export const NAV_MATCHED_FRACTION_FLOOR = 0.1;
/** Per-ISIN day-over-day plausibility threshold (NAV-09). */
export const NAV_JUMP_FLOOR_PCT = 0.25;

export class NavSyncFloorBreachedError extends Error {
  override name = 'NavSyncFloorBreachedError';
}

/** Run-wide floors, checked before any scheme_navs write (NAV-06). Throws on breach. */
export function assertRunFloors(input: {
  rowsParsed: number;
  matched: number;
  tracked: number;
}): void {
  if (input.rowsParsed < NAV_ROW_MIN_COUNT) {
    throw new NavSyncFloorBreachedError(
      `row floor breached: parsed ${input.rowsParsed} row(s), require at least ${NAV_ROW_MIN_COUNT}`,
    );
  }
  if (input.tracked > 0 && input.matched / input.tracked < NAV_MATCHED_FRACTION_FLOOR) {
    throw new NavSyncFloorBreachedError(
      `cold-start matched-fraction floor breached: matched ${input.matched}/${input.tracked}`,
    );
  }
}

/** True when the move from prevNav to nav exceeds NAV_JUMP_FLOOR_PCT and the ISIN must be quarantined. */
export function quarantineDecision(prevNav: string | null, nav: string): boolean {
  if (prevNav === null) return false;
  const prev = Number(prevNav);
  if (prev === 0) return false;
  const move = Math.abs((Number(nav) - prev) / prev);
  return move > NAV_JUMP_FLOOR_PCT;
}
