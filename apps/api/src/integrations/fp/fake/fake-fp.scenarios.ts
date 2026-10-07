export interface FakeSchemeFixture {
  readonly isin: string;
  readonly schemeName: string;
  readonly amcName: string;
  readonly category: 'LIQUID' | 'ELSS' | 'EQUITY' | 'DEBT';
}

/** 10 fixtures across the categories the outline names; ISINs are fictional 12-character codes. */
export const FAKE_SCHEME_FIXTURES: readonly FakeSchemeFixture[] = [
  {
    isin: 'INF209K01157',
    schemeName: 'Aditya Birla Sun Life Liquid Fund',
    amcName: 'Aditya Birla Sun Life',
    category: 'LIQUID',
  },
  { isin: 'INF200K01158', schemeName: 'HDFC Liquid Fund', amcName: 'HDFC', category: 'LIQUID' },
  {
    isin: 'INF090I01239',
    schemeName: 'Franklin India Liquid Fund',
    amcName: 'Franklin Templeton',
    category: 'LIQUID',
  },
  {
    isin: 'INF209K01BB1',
    schemeName: 'Aditya Birla Sun Life Tax Relief 96',
    amcName: 'Aditya Birla Sun Life',
    category: 'ELSS',
  },
  {
    isin: 'INF109K01VQ1',
    schemeName: 'ICICI Prudential Long Term Equity Fund',
    amcName: 'ICICI Prudential',
    category: 'ELSS',
  },
  { isin: 'INF204K01EZ4', schemeName: 'Quant Tax Plan', amcName: 'Quant', category: 'ELSS' },
  {
    isin: 'INF109K01VS7',
    schemeName: 'ICICI Prudential Bluechip Fund',
    amcName: 'ICICI Prudential',
    category: 'EQUITY',
  },
  {
    isin: 'INF879O01011',
    schemeName: 'Parag Parikh Flexi Cap Fund',
    amcName: 'PPFAS',
    category: 'EQUITY',
  },
  {
    isin: 'INF200K01UY1',
    schemeName: 'HDFC Corporate Bond Fund',
    amcName: 'HDFC',
    category: 'DEBT',
  },
  {
    isin: 'INF769K01AX1',
    schemeName: 'Mirae Asset Short Duration Fund',
    amcName: 'Mirae Asset',
    category: 'DEBT',
  },
];

export type FpScriptMode = 'timeout' | '5xx' | '409-dup' | { status: number; body: object };

export interface FakeFpScript {
  mode: FpScriptMode;
  /** Scripts are one-shot: the next matching call consumes it. */
  remaining: number;
}
