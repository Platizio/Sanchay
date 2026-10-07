import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NAV_UNBOUNDED_DATE, NavFeedFormatError, parseAmfiNav } from './amfi-nav-parser.js';

const FIXTURES = fileURLToPath(
  new URL('../../../../../packages/test-fixtures/src/amfi/', import.meta.url),
);

const DAILY_HEADER =
  'Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date';
const HISTORY_HEADER =
  'Scheme Code;NAV Name;Plan;Option;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Net Asset Value;Date';
const NAV_DATE = '2026-08-24';

function unbounded(body: string) {
  return parseAmfiNav(body, { bound: NAV_UNBOUNDED_DATE }).rows;
}

describe('parseAmfiNav: the two layouts', () => {
  it('parsesTheDailyLayout (fixture file)', () => {
    const feed = readFileSync(`${FIXTURES}navall-daily.txt`, 'utf8');
    const rows = unbounded(feed);
    expect(rows.map((r) => [r.isin, r.nav, r.navDate])).toEqual([
      ['INF209KA1K47', '25.3631', NAV_DATE],
      ['INF209KB12S4', '12.9456', NAV_DATE],
      ['INF209K01819', '10.7917', NAV_DATE],
      ['INF209K01DH6', '10.7917', NAV_DATE],
    ]);
  });

  it('parsesTheHistoryLayout (fixture file)', () => {
    const feed = readFileSync(`${FIXTURES}navall-history.txt`, 'utf8');
    const rows = unbounded(feed);
    expect(rows.map((r) => [r.isin, r.nav, r.navDate])).toEqual([
      ['INF209KA1K47', '25.3631', NAV_DATE],
      ['INF209KB12S4', '12.9456', NAV_DATE],
    ]);
  });

  it('bothLayoutsYieldIdenticalRowsForTheSameFund', () => {
    const daily = `${DAILY_HEADER}\n119551;INF209KA1K47;-;ABSL Flexi Cap Fund - Direct - Growth;Direct;Growth;25.3631;24-Aug-2026\n`;
    const history = `${HISTORY_HEADER}\n119551;ABSL Flexi Cap Fund - Direct - Growth;Direct;Growth;INF209KA1K47;-;25.3631;24-Aug-2026\n`;
    expect(unbounded(daily)).toEqual(unbounded(history));
  });

  it('resolvesColumnsFromAnArbitraryHeaderOrder', () => {
    const feed =
      'Date;Net Asset Value;ISIN Div Payout/ISIN Growth;Scheme Name\n24-Aug-2026;25.3631;INF209KA1K47;ABSL Flexi Cap Fund - Direct - Growth\n';
    expect(unbounded(feed)).toEqual([
      {
        isin: 'INF209KA1K47',
        nav: '25.3631',
        navDate: NAV_DATE,
        schemeName: 'ABSL Flexi Cap Fund - Direct - Growth',
      },
    ]);
  });

  it('doesNotMistakeTheHistoryNavNameColumnForTheNavColumn', () => {
    const feed = `${HISTORY_HEADER}\n119553;ABSL Liquid Fund - Regular - IDCW;Regular;IDCW;INF209K01819;-;10.7917;24-Aug-2026\n`;
    expect(unbounded(feed)).toEqual([
      {
        isin: 'INF209K01819',
        nav: '10.7917',
        navDate: NAV_DATE,
        schemeName: 'ABSL Liquid Fund - Regular - IDCW',
      },
    ]);
  });
});

describe('parseAmfiNav: two ISINs per row', () => {
  it('emitsOneRowPerIsinWhenARowCarriesBoth', () => {
    const feed = `${DAILY_HEADER}\n119553;INF209K01819;INF209K01DH6;ABSL Liquid Fund - Regular - IDCW;Regular;IDCW;10.7917;24-Aug-2026\n`;
    expect(unbounded(feed).map((r) => r.isin)).toEqual(['INF209K01819', 'INF209K01DH6']);
  });

  it('emitsOneRowWhenTheReinvestmentIsinIsAPlaceholder', () => {
    const feed = `${DAILY_HEADER}\n119551;INF209KA1K47;-;A;Direct;Growth;25.3631;24-Aug-2026\n119552;INF209KB12S4;;B;Direct;Growth;12.9456;24-Aug-2026\n119554;INF209KB1234;N.A.;C;Direct;Growth;18.2500;24-Aug-2026\n`;
    expect(unbounded(feed).map((r) => r.isin)).toEqual([
      'INF209KA1K47',
      'INF209KB12S4',
      'INF209KB1234',
    ]);
  });

  it('dedupesWhenBothIsinColumnsCarryTheSameIsin', () => {
    const feed = `${DAILY_HEADER}\n119551;INF209KA1K47;INF209KA1K47;A;Direct;Growth;25.3631;24-Aug-2026\n`;
    expect(unbounded(feed).map((r) => r.isin)).toEqual(['INF209KA1K47']);
  });

  it('skipsARowWithNoIsinAtAll', () => {
    const feed = `${DAILY_HEADER}\n119555;-;-;A Scheme With No ISIN;Direct;Growth;9.8765;24-Aug-2026\n`;
    expect(unbounded(feed)).toEqual([]);
  });

  it('skipsAnIsinCellThatIsNotAMutualFundIsin', () => {
    const feed = `${DAILY_HEADER}\n152713;INF179KC1IM3;HDFCNIVODG;HDFC NIFTY100 Low Volatility 30 Index Fund;Direct Plan;Growth Option;9.6607;01-Oct-2026\n130565;INF613Q01025;Redeemed;IL&FS Infrastructure Debt Fund Series 1A;;;1680494.0463;31-Dec-2018\n100013;Redeemed;-;No ISIN at all;Direct;Growth;10.0000;24-Aug-2026\n`;
    expect(unbounded(feed).map((r) => r.isin)).toEqual(['INF179KC1IM3', 'INF613Q01025']);
  });
});

describe('parseAmfiNav: junk rows are skipped', () => {
  it('skipsPlaceholderUnparseableAndNonPositiveNavs', () => {
    const feed = `${DAILY_HEADER}\n100001;INF209KA1K47;-;Good;Direct;Growth;25.3631;24-Aug-2026\n100002;INF209KB1002;-;Dash;Direct;Growth;-;24-Aug-2026\n100003;INF209KB1003;-;NA text;Direct;Growth;N.A.;24-Aug-2026\n100004;INF209KB1004;-;Empty;Direct;Growth;;24-Aug-2026\n100005;INF209KB1005;-;Text;Direct;Growth;not-a-number;24-Aug-2026\n100006;INF209KB1006;-;Zero;Direct;Growth;0.0000;24-Aug-2026\n100007;INF209KB1007;-;Negative;Direct;Growth;-1.2500;24-Aug-2026\n`;
    expect(unbounded(feed).map((r) => r.isin)).toEqual(['INF209KA1K47']);
  });

  it('skipsRowsWhoseDateWillNotParse', () => {
    const feed = `${DAILY_HEADER}\n100001;INF209KA1K47;-;Good;Direct;Growth;25.3631;24-Aug-2026\n100008;INF209KB1008;-;Bad month;Direct;Growth;11.1111;31-Foo-2026\n100009;INF209KB1009;-;Wrong shape;Direct;Growth;11.1111;2026-08-24\n100010;INF209KB1010;-;Placeholder date;Direct;Growth;11.1111;-\n`;
    expect(unbounded(feed).map((r) => r.isin)).toEqual(['INF209KA1K47']);
  });

  it('skipsAFebruary29thOutsideALeapYear', () => {
    const feed = `${DAILY_HEADER}\n100011;INF209KB1011;-;Leap year;Direct;Growth;11.1111;29-Feb-2028\n100012;INF209KB1012;-;Not a leap year;Direct;Growth;11.1111;29-Feb-2027\n`;
    expect(unbounded(feed).map((r) => [r.isin, r.navDate])).toEqual([
      ['INF209KB1011', '2028-02-29'],
    ]);
  });

  it('skipsAmcSectionTitlesBlankLinesAndTheHeaderItself', () => {
    const feed = `${DAILY_HEADER}\n\n\nOpen Ended Schemes(Debt Scheme - Liquid Fund)\nAditya Birla Sun Life Mutual Fund\n\n119553;INF209K01819;-;ABSL Liquid Fund - Regular - IDCW;Regular;IDCW;10.7917;24-Aug-2026\n\nOpen Ended Schemes(Equity Scheme - Flexi Cap Fund)\nSome Other Mutual Fund\n119551;INF209KA1K47;-;ABSL Flexi Cap Fund - Direct - Growth;Direct;Growth;25.3631;24-Aug-2026\n`;
    expect(unbounded(feed).map((r) => r.isin)).toEqual(['INF209K01819', 'INF209KA1K47']);
  });

  it('returnsAnEmptyListWhenTheHeaderResolvesButEveryRowIsJunk', () => {
    const feed = `${DAILY_HEADER}\nOpen Ended Schemes(Equity Scheme - Flexi Cap Fund)\nAditya Birla Sun Life Mutual Fund\n100002;INF209KB1002;-;Dash;Direct;Growth;-;24-Aug-2026\n`;
    expect(unbounded(feed)).toEqual([]);
  });
});

describe('parseAmfiNav: value handling', () => {
  it('keepsNavAtTheScaleTheFeedPublished', () => {
    const feed = `${DAILY_HEADER}\n119551;INF209KA1K47;-;A;Direct;Growth;25.3631;24-Aug-2026\n`;
    expect(unbounded(feed)[0]?.nav).toBe('25.3631');
  });

  it('parsesEnglishMonthNamesCaseInsensitively', () => {
    const feed = `${DAILY_HEADER}\n119551;INF209KA1K47;-;A;Direct;Growth;25.3631;24-AUG-2026\n`;
    expect(unbounded(feed)[0]?.navDate).toBe(NAV_DATE);
  });

  it('normalisesIsinToTrimmedUpperCaseAndSnapshotsTheSchemeName', () => {
    const feed = `${DAILY_HEADER}\n119551; inf209ka1k47 ;-; ABSL Flexi Cap Fund - Direct - Growth ;Direct;Growth; 25.3631 ; 24-Aug-2026\n`;
    expect(unbounded(feed)).toEqual([
      {
        isin: 'INF209KA1K47',
        nav: '25.3631',
        navDate: NAV_DATE,
        schemeName: 'ABSL Flexi Cap Fund - Direct - Growth',
      },
    ]);
  });

  it('leavesTheSchemeNameNullWhenTheFeedPublishesNone', () => {
    const feed = `${DAILY_HEADER}\n119551;INF209KA1K47;-;;Direct;Growth;25.3631;24-Aug-2026\n`;
    expect(unbounded(feed)[0]?.schemeName).toBeNull();
  });

  it('handlesCrlfLineEndings', () => {
    const feed = [
      'DAILY',
      DAILY_HEADER,
      '',
      '119551;INF209KA1K47;-;A;Direct;Growth;25.3631;24-Aug-2026',
      '',
    ]
      .slice(1)
      .join('\r\n');
    expect(unbounded(feed).map((r) => [r.isin, r.navDate])).toEqual([['INF209KA1K47', NAV_DATE]]);
  });

  it('resolvesAHeaderThatIsNotTheFirstLine', () => {
    const feed = `Mutual Fund NAV report\n${DAILY_HEADER}\n119551;INF209KA1K47;-;A;Direct;Growth;25.3631;24-Aug-2026\n`;
    expect(unbounded(feed).map((r) => r.isin)).toEqual(['INF209KA1K47']);
  });
});

describe('parseAmfiNav: the future-date bound', () => {
  it('aFutureDatedRowIsSeparatedAndTheRestOfTheFeedSurvivesIt', () => {
    const feed = `${DAILY_HEADER}\n119551;INF209KA1K47;-;A;Direct;Growth;25.3631;24-Aug-2026\n119552;INF209KB12S4;-;B;Direct;Growth;12.9456;24-Aug-2027\n119553;INF209K01819;-;C;Regular;Growth;10.7917;24-Aug-2026\n`;
    const parsed = parseAmfiNav(feed, { bound: '2026-08-26' as never });
    expect(parsed.rows.map((r) => r.isin)).toEqual(['INF209KA1K47', 'INF209K01819']);
    expect(parsed.futureDated.map((r) => [r.isin, r.navDate])).toEqual([
      ['INF209KB12S4', '2027-08-24'],
    ]);
  });

  it('theBoundIsInclusiveSoARowDatedExactlyOnItIsUsable', () => {
    const feed = `${DAILY_HEADER}\n119551;INF209KA1K47;-;A;Direct;Growth;25.3631;26-Aug-2026\n`;
    const parsed = parseAmfiNav(feed, { bound: '2026-08-26' as never });
    expect(parsed.rows.map((r) => r.isin)).toEqual(['INF209KA1K47']);
    expect(parsed.futureDated).toEqual([]);
  });

  it('bothIsinsOfAFutureDatedRowAreReported', () => {
    const feed = `${DAILY_HEADER}\n119553;INF209K01819;INF209K01DH6;C;Regular;Growth;10.7917;01-Jan-2030\n`;
    const parsed = parseAmfiNav(feed, { bound: '2026-08-26' as never });
    expect(parsed.rows).toEqual([]);
    expect(parsed.futureDated.map((r) => r.isin)).toEqual(['INF209K01819', 'INF209K01DH6']);
    expect(parsed.furthestFutureDate).toBe('2030-01-01');
  });

  it('furthestFutureDateIsNullWhenNothingWasRejected', () => {
    const feed = `${DAILY_HEADER}\n119551;INF209KA1K47;-;A;Direct;Growth;25.3631;24-Aug-2026\n`;
    expect(parseAmfiNav(feed, { bound: NAV_DATE as never }).furthestFutureDate).toBeNull();
  });

  it('theUnboundedSentinelStillReturnsEveryRow', () => {
    const feed = `${DAILY_HEADER}\n119551;INF209KA1K47;-;A;Direct;Growth;25.3631;24-Aug-2026\n119552;INF209KB12S4;-;B;Direct;Growth;12.9456;24-Aug-2099\n`;
    expect(unbounded(feed).map((r) => r.isin)).toEqual(['INF209KA1K47', 'INF209KB12S4']);
  });

  it('aNullBoundIsRefusedRatherThanSilentlyMeaningUnbounded', () => {
    const feed = `${DAILY_HEADER}\n119551;INF209KA1K47;-;A;Direct;Growth;25.3631;24-Aug-2026\n`;
    expect(() => parseAmfiNav(feed, { bound: null as never })).toThrow(TypeError);
    expect(() => parseAmfiNav(feed, undefined as never)).toThrow(TypeError);
  });
});

describe('parseAmfiNav: the format-change signal', () => {
  it('throwsWhenTheHeaderCannotBeResolved', () => {
    const feed =
      "<html><head><title>Runtime Error</title></head><body>Server Error in '/' Application.</body></html>";
    expect(() => unbounded(feed)).toThrow(NavFeedFormatError);
    try {
      unbounded(feed);
    } catch (e) {
      expect((e as Error).message).toContain('header could not be resolved');
      expect((e as Error).message).toContain('<html>');
    }
  });

  it('throwsWhenTheHeaderHasNoIsinColumn', () => {
    const feed = 'Scheme Code;Scheme Name;Net Asset Value;Date\n119551;A;25.3631;24-Aug-2026\n';
    expect(() => unbounded(feed)).toThrow(/at least one ISIN column/);
  });

  it('throwsWhenTheHeaderHasNoNavColumn', () => {
    const feed =
      'Scheme Code;ISIN Div Payout/ ISIN Growth;Scheme Name;Date\n119551;INF209KA1K47;A;24-Aug-2026\n';
    expect(() => unbounded(feed)).toThrow(NavFeedFormatError);
  });

  it('throwsWhenTheBodyIsBlankOrEmpty', () => {
    expect(() => unbounded('   \n \n')).toThrow(/blank/);
    expect(() => unbounded('')).toThrow(/blank/);
  });

  it('quotesOnlyABoundedSliceOfAnUnrecognisableBody', () => {
    const feed = 'x'.repeat(5000);
    try {
      unbounded(feed);
      throw new Error('expected parseAmfiNav to throw');
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain('x'.repeat(200));
      expect(msg).not.toContain('x'.repeat(220));
    }
  });
});
