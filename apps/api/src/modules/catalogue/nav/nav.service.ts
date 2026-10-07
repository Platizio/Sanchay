import type { Isin, NavGrade } from '@sanchay/domain';
import type { DbExecutor } from '../../../db/client.js';
import { istDayStart } from '../../identity/otp.service.js';
import { type Clock, DAY } from '../../platform/clock.js';

/** D-MONEY-067: OK while the NAV is at most 7 IST calendar days old (inclusive), STALE after that. */
const STALE_AFTER_DAYS = 7;

/**
 * Today's IST calendar date (YYYY-MM-DD), from Plan 01's `istDayStart`: an IST day ends at 18:30 UTC
 * on its own date, so the day's last instant carries that date in UTC too.
 */
export function istToday(now: Date): string {
  return new Date(istDayStart(now).getTime() + DAY - 1).toISOString().slice(0, 10);
}

export interface NavLatest {
  nav: string;
  navDate: string;
  grade: NavGrade;
}

export class NavService {
  constructor(private readonly clock: Clock) {}

  /**
   * D-MONEY-067 (RV-02-49): age counts IST calendar days, so from 00:00 IST the new day already
   * counts. A quarantined row, or one dated after today IST (never used), grades UNAVAILABLE and keeps
   * its last value.
   */
  async latest(exec: DbExecutor, isin: Isin): Promise<NavLatest | null> {
    const row = await exec.query.schemeNavs.findFirst({ where: (t, { eq }) => eq(t.isin, isin) });
    if (!row) return null;
    const today = istToday(this.clock.now());
    if (row.quarantined || row.navDate > today) {
      return { nav: row.nav, navDate: row.navDate, grade: 'UNAVAILABLE' };
    }
    const ageDays = (Date.parse(today) - Date.parse(row.navDate)) / DAY;
    return {
      nav: row.nav,
      navDate: row.navDate,
      grade: ageDays > STALE_AFTER_DAYS ? 'STALE' : 'OK',
    };
  }
}
