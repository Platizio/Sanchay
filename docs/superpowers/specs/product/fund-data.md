<!-- source: workflow wf_3190e72a-04a label spec:fund-data | exported 2026-09-28 -->

# Sanchay: fund catalogue data pipeline spec

Sources, ingestion jobs, tables, validation, fund-facts overrides, returns maths and the SEBI category seed. Prepared 2026-09-25. Nothing was changed on disk.

---

## 0. Key findings and corrections to the prior analysis

| # | Finding | Evidence | Impact |
|---|---|---|---|
| F1 | **SEBI's recategorisation circular is in force.** Circular HO/24/13/15(2)2026-IMD-RAC4/I/5764/2026, dated **26-Feb-2026**, "Categorization and Rationalization of Mutual Fund Schemes", replaces clause 2.6 of the MF Master Circular. It took effect on its own date (para 3). Existing schemes had **6 months to comply, i.e. by 26-Aug-2026** (2.6.7). Sectoral/thematic schemes have **3 years** to meet the overlap limits (2.6.3.7). The prior synthesis said "effective 2026-04-01". That is the date the **SEBI (Mutual Funds) Regulations, 2026** took effect (notified 14-Jan-2026), which is a separate instrument. | Circular PDF (caalley.com mirror, read 2026-09-25), pp. 1, 11–12 | Seed the taxonomy from the 2026 circular: **40 categories** (13 equity, 17 debt, 7 hybrid, 1 life cycle, 2 other). |
| F2 | **AMFI publishes two vocabularies side by side.** The live `NAVAll.txt` (NAV date 24-Sep-2026, 14,396 data rows) mixes old labels such as `Debt Scheme - Low Duration Fund` and `Equity Scheme - Sectoral/ Thematic` with new ones such as `Income/Debt Oriented Schemes - Ultra Short to Short Term Fund`, `Equity Schemes - Sectoral Fund`, `Equity Schemes - Thematic Fund` and `Life Cycle Funds - Life Cycle Fund with Maturity of 10 Years`. The scheme master behaves the same way (16,485 rows). | Live fetch and profiling, 2026-09-25 (§1.2) | The catalogue needs a **label-to-category mapping table**, not string equality. Old labels must stay mapped. The old combined "Sectoral/Thematic" label needs a per-scheme decision. |
| F3 | **`NAVAll.txt` now has 8 columns including `Plan` and `Option`.** They are blank on 5,760 of 14,396 rows, but only 536 of the rows dated in the last day are blank, mostly ETFs, segregated portfolios and unclaimed-money plans. | Live profiling | Plan/option detection uses a fallback chain (§3). |
| F4 | The AMFI NAV history endpoint **currently accepts ranges longer than 90 days**. A 147-day request returned 875,901 rows and 148 distinct dates. Liquid and overnight funds publish NAVs on calendar days, not only business days. | Live probe | Backfill still uses 30-day chunks as a courtesy and to stay within timeouts. Annualisation uses calendar days. |
| F5 | **AMFI's Terms of Use** grant a "personal and non-commercial use only" right and forbid storing "any significant portion" electronically. | amfiindia.com/terms-of-use (read 2026-09-25) | This is a legal risk item (§2). The industry, and v1, ingest NAVAll anyway. Ask AMFI for written permission and keep a licensed NAV fallback through Cybrilla FP. |
| F6 | **The Cybrilla FP `fund_schemes` sandbox export has no usable SEBI sub-category.** Of 3,307 rows, 1,786 have a blank `sub_category` and the rest use pre-2017 buckets such as "Debt(other than assured return schemes)". `amfi_code` is blank on 1,748 rows. It does carry `plan_type`, `investment_option`, `lock_in_period` (months: 36 or 60), SIP/SWP/STP thresholds and `merged_to_isin`. | `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/exports/finprim-direct-fund-schemes-20260514051017.json` | SEBI category comes from **AMFI**. FP is authoritative only for transactional attributes. Link the two by **ISIN**, not by AMFI code. |
| F7 | Cybrilla FP advertises a mutual-fund market-data API: NAV, 3M–5Y returns, expense ratio, exit load, lock-in, risk profile, top-10 holdings, AUM, benchmark, category. It is labelled "Third party integrations, billed separately"; fund manager names are "coming soon". | fintechprimitives.com/mutual_fund_market_data_api.html (2026-09-25) | This becomes the **first licensed `FundFactsProvider`** once production access is granted (locked decision 9). |
| F8 | The TER regime changed on 1-Apr-2026. TER is now **Base Expense Ratio (BER) + brokerage + regulatory and statutory levies**. The BER excludes GST, STT and stamp duty. The extra 5 bps linked to exit loads is gone. The index/ETF BER cap is 0.90%. | Upstox and Cafemutual summaries of the SEBI (MF) Regs 2026 (2026-09-25); the AMFI TER page cites Reg 66(7)/(9)/(10) | Store TER **components**, not one number (§5.3). |

---

## 1. Data source inventory

### 1.1 Source table

| # | Source | Endpoint / location | Format | Fields | Publisher cadence | Our poll | Use in Sanchay |
|---|---|---|---|---|---|---|---|
| S1 | **AMFI daily NAV** | `https://www.amfiindia.com/spages/NAVAll.txt`, which 302-redirects to `https://portal.amfiindia.com/spages/NAVAll.txt`. The client must follow redirects (v1: `AmfiNavFeedClient.java:33-34`). | `;`-delimited text, about 1.5 MB, 55 AMC heading lines, 14,396 rows | `Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date` (8 columns). The date format is `dd-MMM-yyyy`. Section headings `Open Ended Schemes(<category label>)` and AMC name lines have no delimiter. | AMCs must upload by **11:00 PM** each business day. Fund-of-funds may upload by **10:00 AM the next day**. (SEBI "Review of time limit for updating NAV on AMFI website"; AMFI investor FAQ.) | 21:30, 22:30, 23:15, 00:30, 06:30, 10:30 and 13:00 IST, every day | Latest NAV (primary) |
| S2 | **AMFI NAV history** | `https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx?tp={1\|2\|3}&frmdt=dd-MMM-yyyy&todt=dd-MMM-yyyy[&mf=<amc>]`. `tp`: 1 = open-ended, 2 = close-ended, 3 = interval. | `;` text | `Scheme Code;NAV Name;Plan;Option;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Net Asset Value;Date`. The **column order differs from S1** (v1 `AmfiNavParser.java:21-26`). Section heading format is `Open Ended Schemes ( Money Market )`. | Data exists from April 2006 (the tigzig dataset starts there) | One-off bootstrap in 30-day chunks, plus nightly 02:00 repair of the last 10 days | NAV history, returns, restatement repair |
| S3 | **AMFI scheme master** | `https://portal.amfiindia.com/DownloadSchemeData_Po.aspx?mf=0` | CSV with 16,485 rows and 58 AMCs | `AMC,Code,Scheme Name (fund-level),Scheme Type (Open Ended/Close Ended/Interval Fund),Scheme Category,Scheme NAV Name (plan-level),Scheme Minimum Amount (free text such as "Rs. 500/- and in multiples of Re. 1/-"),Launch Date, Closure Date,ISINs`. **The last column joins two 12-character ISINs with no separator, and the header is joined too.** Parse it as fixed 12-character slices. | Updated as schemes change | Daily at 05:30 | Scheme and plan registry, SEBI category label, launch/closure dates, fund-level grouping, AMC list |
| S4 | **AMC list** | Derived from S3's `AMC` column (legal names such as "Aditya Birla Sun Life AMC Limited") and S1's heading lines ("Axis Mutual Fund") | — | Two naming styles, so keep an alias table | — | With S3 | The `amc` and `amc_alias` tables |
| S5 | **AMFI TER** | `https://www.amfiindia.com/ter-of-mf-schemes`, a JavaScript app filtered by FY, month, fund type, category and fund | Interactive page, no documented bulk API | BER, brokerage, transaction cost and statutory levies, for regular and direct plans. Brokerage and transaction cost are "annualized, cumulative daily average" and reset monthly. | Daily, per SEBI's daily TER disclosure rule | **Do not scrape** (terms of use, fragile). Use for manual cross-checks only. | Reference only. TER comes in through a `FundFactsProvider` (admin CSV or vendor). |
| S6 | **AMFI Risk-o-meter** | `https://www.amfiindia.com/online-center/risk-o-meter` (JavaScript app) | Interactive | Six levels per scheme per month | AMCs disclose monthly, **within 10 days of month end**, on their own website and AMFI's | Admin CSV around the 11th–15th of each month; vendor later | Riskometer through `FundFactsProvider` |
| S7 | **AMFI Average AUM** | `https://www.amfiindia.com/aum-data/average-aum` | Downloadable per AMFI; interactive | Scheme-wise and fund-wise quarterly average AUM | Quarterly, uploaded on the first working day of the month after the quarter | Quarterly (plus monthly via vendor later) | Display "AUM (quarterly average)" |
| S8 | **AMFI Fund Performance dashboard** | `https://www.amfiindia.com/otherdata/fund-performance`, an iframe to `/polling/amfi/fund-performance` | Interactive | Regular and direct returns (1/3/5/10Y, since launch) against the TRI benchmark, reported by AMCs | Daily | **Do not ingest** (terms of use, no API) | QA spot-checks only |
| S9 | **AMC documents**: SID, KIM, SAI, factsheets, portfolios | AMC websites. SIDs are also on AMFI's portal as `https://portal.amfiindia.com/spages/<n>.pdf` (e.g. `14343.pdf`) and on sebi.gov.in under Filings → Mutual Funds. | PDF | Exit load, lock-in, benchmark (tier 1/2), fund managers and tenure, objective, riskometer, potential risk class (debt), risk ratios (SD, beta, Sharpe per AMFI best-practice circulars 61 and 64), tracking error (index funds) | SID on change; factsheets monthly; portfolios monthly | Admin, event-driven, plus a weekly link checker | URLs stored in `fund_document`; facts transcribed by admin |
| S10 | **Cybrilla FP transactional master** | `GET /api/oms/fund_schemes` (FP direct tenant) and `GET /v2/mf_scheme_plans/cybrillapoa` (POA) | JSON | See §1.3 | Owned by FP | Daily at 06:00 | Purchase eligibility, limits, SIP/SWP/STP dates, lock-in, merger links, plan and option |
| S11 | **Cybrilla FP market data** (future) | FP partner API; third-party source, billed separately | JSON | NAV, 3M/6M/1Y/3Y/5Y returns, expense ratio, exit load, lock-in, risk profile, top-10 holdings and sectors, AUM, category, objective, benchmark | Vendor's schedule | Daily | First licensed provider; also validates our own returns calculations |
| S12 | **Benchmark index values** (NSE Indices, Asia Index Pvt Ltd for BSE, CRISIL) | Licensed feeds only | — | TRI time series | Daily | **Not at launch** | Needed for beta, alpha, tracking error and benchmark returns (phase 2 via vendor licence) |
| S13 | **Risk-free rate** | FBIL (Overnight MIBOR or 91-day T-bill), published values | Admin-entered monthly | Annual yield | Daily/weekly | Monthly admin entry | Sharpe and Sortino |
| S14 | MFapi.in | `https://api.mfapi.in/mf`, `/mf/{code}` | JSON (`meta.fund_house/scheme_type/scheme_category/scheme_code/isin…` plus `data[{date,nav}]`) | AMFI mirror | Refreshed 6 times a day | **Dev/test only** | Fixtures |
| S15 | captn3m0/historical-mf-data | GitHub releases, `funds.db.zst` (SQLite: `schemes`, `nav`, `securities`, view `nav_by_isin`) | SQLite | AMFI as exported, including bad ISINs such as `NOTAPP`/`NA` and bad NAVs such as `#N/A` or `N.A.` | CalVer, via GitHub Actions | **Non-production only** | Cross-check for the bootstrap backfill |
| S16 | tigzig MF NAV API | `https://api.tigzig.com/mf/v1/...` | JSON, Parquet or CSV (37M+ rows since April 2006, 38k+ schemes) | AMFI mirror; about 2,300 matured schemes carry `0.00` as an end-of-life marker | Rebuilt 3 times a day | **Non-production only** | Cross-check |
| S17 | Commercial vendors: Morningstar India, Value Research, ACE MF (Accord Fintech), CRISIL | Licensed (ACE: "FTP or API in .CSV or JSON") | — | Full fund data, ratings, portfolios, risk ratios, index data | Daily/monthly | Phase 2 | Alternative `FundFactsProvider` implementations |

### 1.2 Live profile of `NAVAll.txt` (fetched 2026-09-25, NAV date 24-Sep-2026)

| Metric | Value | Design consequence |
|---|---|---|
| Data rows | 14,396 (about 1.5 MB) | v1's `min-rows=1000` floor is far too loose. The new floor is 8,000 (§5.4). |
| Rows dated 23/24-Sep-2026 | 8,744 (60.7%) | The rest are stale: matured FMPs, closed-ended and legacy plans. Floors must count **fresh** rows, not all rows. |
| `Plan` = Regular / Direct / blank | 4,327 / 4,309 / 5,760 | Blank plans are mostly stale rows. Only 536 fresh rows are blank (ETFs, segregated, unclaimed). |
| Distinct `Option` spellings | About 150, e.g. "Growth", "GROWTH", "Growth Option", "(Growth)", "IDWC Option", "Weekkly IDCW", "Quaterly IDCW" | Option detection must be regex-based (§3.3). |
| `ISIN Div Payout/Growth` = `-` | 801 rows | ISIN is optional. The key is the AMFI scheme code. |
| NAV = 0 | 241 rows | `0` is AMFI's end-of-life marker, not a price. |
| NAV written as `10.` | 17 rows | The parser must accept a trailing dot. |
| Section headings | 100+ distinct: old and new taxonomies plus ETFs, close-ended, interval and unclaimed-money plans | Mapping table (§4.3). |
| Two ISINs sharing one NAV | For example `INF209KA12Z1` (payout) and `INF209KA13Z9` (reinvest) | Both ISINs point at one AMFI code (v1 `AmfiNavParser.java:31-34`). |

### 1.3 Cybrilla FP `fund_schemes` fields (sandbox export, 14-May-2026)

`fund_scheme_id, name, investment_option (GROWTH|DIV_PAYOUT|DIV_REINVESTMENT), plan_type (REGULAR|DIRECT), fund_category (EQUITY|DEBT|LIQUID), sub_category, amfi_code, isin, scheme_code, close_ended, lock_in, lock_in_period (months), long_term_period, purchase_allowed, redemption_allowed, insta_redemption_allowed, sip_allowed, swp_allowed, stp_in/out_allowed, switch_in/out_allowed, min/max_initial_investment, min/max_additional_investment, *_multiples, min_withdrawal_amount/units, sip|swp|stp_frequency_specific_data.{monthly|quarterly|day_in_a_week|four_times_a_month|daily}.{dates,min_installment_amount,max_installment_amount,amount_multiples,min_installments}, merged, merged_to_isin, merger_date, name_changes, amc_id, rta_id, delivery_mode, active`.

The POA `mf_scheme_plan` object has `isin, type (regular|direct), option, idcw_option, active, thresholds[{type: lumpsum|withdrawal|sip, amount_min, …, frequency, installments_min, dates}]`. Source: `.../exports/cybrilla-poa-fund-schemes-20260514-051817.json` (482 rows).

---

## 2. Licensing and legal constraints

| Source | Licence or terms | Commercial display allowed? | Recommendation |
|---|---|---|---|
| AMFI (S1–S8) | Terms of use: personal and non-commercial use only. No framing. No electronic storage of "any significant portion". Accuracy is disclaimed. | **Not expressly.** NAV publication on AMFI is a SEBI requirement, and the industry (and v1) ingest it. | (1) Compliance, as the ARN holder, writes to AMFI asking for written permission to ingest and display S1–S3 with attribution, **raised in Sprint 1**. (2) Until then, ingest S1–S3 under a documented risk-register entry signed off by the business. (3) Keep the FP NAV (S11) as a switchable fallback source. (4) **Never scrape** the JavaScript dashboards (S5, S6, S8). |
| MFapi.in | No licence or commercial terms published (the terms URL returns 404). Single maintainer. | Unknown | Dev and CI fixtures only. Not on any production path. |
| captn3m0/historical-mf-data | Code is MIT; the data is AMFI's | The MIT licence covers the code, not AMFI's data | Non-production cross-check only. Production backfill goes straight to S2. |
| tigzig | CC0 for the compilation; the underlying data is still AMFI's | Same as AMFI | Non-production only |
| NSE Indices / Asia Index / CRISIL | Licence needed to benchmark a product to their indices and to subscribe to data (NSE Indices licensing; NSE earned ₹151.85 cr from index licensing and data subscriptions in FY26) | Display of index series requires a data licence | **Launch shows benchmark name and benchmark riskometer only, no benchmark return numbers.** Benchmark returns, beta, alpha and tracking error come in phase 2 through a vendor licence that includes index redistribution. |
| Morningstar / Value Research / CRISIL ratings | Licensed. Redistribution needs written permission. | Only with a licence | **No third-party star ratings at launch.** They are also advice-adjacent, which does not suit an execution-only MFD. |
| ACE MF (Accord) | Commercial data feed (API/FTP, CSV/JSON); price on request | Per contract | Fallback vendor if FP market data (S11) is late or too expensive |
| AMC documents (SID/KIM/factsheets) | Public disclosure documents | Linking is fine. Facts transcribed with attribution and an "as of" date are standard MFD practice. | Link out to the documents and cite "Source: <AMC> SID/factsheet dated …" |

---

## 3. Identifying plans, options and ISINs

### 3.1 Identifiers

| Level | Key | Notes |
|---|---|---|
| Fund family (the "scheme" shown on a product page) | `(amc_id, normalized S3 "Scheme Name", S3 "Launch Date")` | S3 column 3 is the fund-level name. In the new S1 format, "Scheme Name" is also fund-level when `Plan` is filled in. |
| Share class ("plan") | **AMFI scheme code** (S1/S3 `Code`), one per plan and option | "One scheme code = one plan+option variant" |
| Security | ISIN, 1–2 per AMFI code: col-2 growth or IDCW-payout ISIN, col-3 IDCW-reinvestment ISIN | Link to FP by ISIN. **Plan and option cannot be derived from an ISIN's structure.** Check the ISIN checksum (ISO 6166 Luhn over letters converted to digits); an invalid ISIN or `-`/`NA`/`NOTAPP` becomes `null`. |

### 3.2 Resolution order (first non-null value wins, per attribute)

| Priority | Source | Plan | Option |
|---|---|---|---|
| 1 | FP `fund_schemes`/`mf_scheme_plan` by ISIN | `plan_type` / `type` | `investment_option` / `option`+`idcw_option` |
| 2 | S1 `Plan` / `Option` columns | "Direct Plan" / "Regular Plan" | Regex (§3.3) on `Option` |
| 3 | S3 "Scheme NAV Name" | Regex | Regex |
| 4 | S1/S2 "Scheme Name" / "NAV Name" | Regex | Regex |
| 5 | Unresolved | `UNKNOWN`, which puts the plan in the admin review queue and **makes it non-purchasable** | Same |

If sources disagree (for example, FP says REGULAR while the AMFI regex says Direct), raise a `CONFLICT` flag. The plan stays hidden until an admin resolves it.

### 3.3 Regex spec (case-insensitive, applied after collapsing whitespace)

| Attribute | Rule |
|---|---|
| `EXCLUDE` (never catalogue) | `/unclaimed\|investor education\|\bI\.?E\.?F\b\|segregat\|provident fund and trust\|defunct\|discontinued/` |
| `plan = DIRECT` | `/\bdirect\b/` |
| `plan = REGULAR` | `/\bregular\b\|\breg\b/`, provided `direct` is absent |
| `plan = LEGACY` | `/\b(retail\|institutional\|super institutional\|standard)\b/` with no direct/regular token, **or** launch date before 2013-01-01 with no token. Direct plans began 1-Jan-2013. |
| `option = BONUS` | `/\bbonus\b/` |
| `option = IDCW_REINVEST` | `/(idcw\|dividend\|income distribution\|\bdiv\b\|idwc).*re-?\s?invest\|re-?\s?invest.*(idcw\|dividend\|income distribution)/`, or S1 col-3 ISIN only |
| `option = IDCW_PAYOUT` | `/idcw\|idwc\|dividend\|income distribution\|\bdiv\b\|payout/` and not reinvest |
| `option = IDCW_PAYOUT_AND_REINVEST` (combined row) | Both tokens present ("IDCW Payout and Reinvestment"). Resolve per ISIN: col-2 is payout, col-3 is reinvest. |
| `option = GROWTH` | `/\bgrowth\b\|\bcumulative\b\|\bgr\b/`, or none of the above for an open-ended plan with a single ISIN |
| `idcw_frequency` | First match of `daily\|weekly\|week?kly\|fortnightly\|fornightly\|monthly\|quarterly\|quaterly\|half[ -]?yearly\|annual\|periodic\|discretionary\|flexi` normalised to `DAILY…DISCRETIONARY` |

Fixture tests must cover every one of the roughly 150 observed spellings. Extract them from a pinned `NAVAll.txt` snapshot.

### 3.4 What we sell and display (locked decision 2: Regular plans)

A plan can be purchased when all of these hold: `plan_type = REGULAR`, FP `active && purchase_allowed`, scheme type `Open Ended`, a SEBI category in §4.1 with `catalogue_eligible = true`, not `EXCLUDE`, not `MERGED`/`MATURED`, and admin visibility is `VISIBLE`.

**The fund page series** is the scheme family's **Regular-Growth** AMFI code. IDCW options are chosen from a selector on the same page and show "Returns shown are of the Growth option" (§6.8). This follows SEBI Master Circular 13.3.1.4: state which plan the performance belongs to, with a footnote that different plans have different expense structures.

---

## 4. SEBI category taxonomy to seed

### 4.1 The 2026 categories (circular 26-Feb-2026, section 2.6.3 and Annexures B/C)

| code | class | Sr | Category (2026 name) | Key characteristic | Default lock-in | Liquid/overnight cut-off group | Equity-oriented tax default¹ | catalogue_eligible |
|---|---|---|---|---|---|---|---|---|
| EQ_MULTI_CAP | EQUITY | A1 | Multi Cap Fund | ≥75% equity: ≥25% each in large, mid and small cap | — | N | Y | Y |
| EQ_LARGE_CAP | EQUITY | A2 | Large Cap Fund | ≥80% large cap | — | N | Y | Y |
| EQ_LARGE_MID_CAP | EQUITY | A3 | Large & Mid Cap Fund | ≥35% large and ≥35% mid | — | N | Y | Y |
| EQ_MID_CAP | EQUITY | A4 | Mid Cap Fund | ≥65% mid cap | — | N | Y | Y |
| EQ_SMALL_CAP | EQUITY | A5 | Small Cap Fund | ≥65% small cap | — | N | Y | Y |
| EQ_FLEXI_CAP | EQUITY | A6 | Flexi Cap Fund | ≥65% equity, dynamic across caps | — | N | Y | Y |
| EQ_DIVIDEND_YIELD | EQUITY | A7 | Dividend Yield Fund | ≥80% equity, mainly dividend-yielding stocks | — | N | Y | Y |
| EQ_VALUE | EQUITY | A8 | Value Fund | ≥80% equity, value strategy. Overlap with Contra ≤50%. | — | N | Y | Y |
| EQ_CONTRA | EQUITY | A9 | Contra Fund | ≥80% equity, contrarian | — | N | Y | Y |
| EQ_FOCUSED | EQUITY | A10 | Focused Fund | At most 30 stocks, ≥80% equity | — | N | Y | Y |
| EQ_SECTORAL | EQUITY | A11 | Sectoral Fund | ≥80% in one sector (AMFI sector list, half-yearly). Overlap ≤50% with other equity except large cap. | — | N | Y | Y |
| EQ_THEMATIC | EQUITY | A12 | Thematic Fund | ≥80% in one theme | — | N | Y | Y |
| EQ_ELSS | EQUITY | A13 | ELSS – Tax Saver Fund | ≥80% equity, ELSS 2005 | **36 months** | N | Y | Y |
| DT_OVERNIGHT | DEBT | B1 | Overnight Fund | 1-day maturity | — | **Y** | N | Y |
| DT_LIQUID | DEBT | B2 | Liquid Fund | Maturity ≤91 days | — | **Y** | N | Y |
| DT_ULTRA_SHORT_TERM | DEBT | B3 | Ultra Short Term Fund | Macaulay duration 3–6 months | — | N | N | Y |
| DT_ULTRA_SHORT_TO_SHORT_TERM | DEBT | B4 | Ultra Short to Short Term Fund | Macaulay duration 6–12 months | — | N | N | Y |
| DT_MONEY_MARKET | DEBT | B5 | Money Market Fund | Money-market instruments ≤1 year | — | N | N | Y |
| DT_SHORT_TERM | DEBT | B6 | Short Term Fund | Macaulay duration 1–3 years | — | N | N | Y |
| DT_MEDIUM_TERM | DEBT | B7 | Medium Term Fund | Macaulay duration 3–4 years (1–4 in adverse conditions) | — | N | N | Y |
| DT_MEDIUM_TO_LONG_TERM | DEBT | B8 | Medium to Long Term Fund | Macaulay duration 4–7 years (1–7 in adverse conditions) | — | N | N | Y |
| DT_LONG_TERM | DEBT | B9 | Long Term Fund | Macaulay duration >7 years | — | N | N | Y |
| DT_DYNAMIC_TERM | DEBT | B10 | Dynamic Term Fund | Across durations | — | N | N | Y |
| DT_CORPORATE_BOND | DEBT | B11 | Corporate Bond Fund | ≥80% in AA+ and above | — | N | N | Y |
| DT_CREDIT_RISK | DEBT | B12 | Credit Risk Fund | ≥65% in AA and below | — | N | N | Y |
| DT_BANKING_PSU | DEBT | B13 | Banking and PSU Debt Fund | ≥80% in banks, PSUs, PFIs and municipal bonds | — | N | N | Y |
| DT_GILT | DEBT | B14 | Gilt Fund | ≥80% G-secs | — | N | N | Y |
| DT_GILT_10Y_CONSTANT | DEBT | B15 | 10-year Constant Maturity Gilt Fund | ≥80% G-secs, Macaulay duration = 10 years | — | N | N | Y |
| DT_FLOATER | DEBT | B16 | Floating Interest Rates Fund | ≥65% floating-rate instruments | — | N | N | Y |
| DT_SECTORAL | DEBT | B17 | Sectoral (Debt) Fund | ≥80% in one sector, AA+ and above. Allowed sectors: Financial Services, Energy, Infrastructure, Housing, Real Estate. | — | N | N | Y |
| HY_CONSERVATIVE | HYBRID | C1 | Conservative Hybrid Fund | 10–25% equity, 75–90% debt | — | N | N | Y |
| HY_BALANCED | HYBRID | C2 | Balanced Hybrid Fund | 40–60% equity, 40–60% debt, no arbitrage | — | N | Scheme-specific | Y |
| HY_AGGRESSIVE | HYBRID | C3 | Aggressive Hybrid Fund | 65–80% equity, 20–35% debt | — | N | Y | Y |
| HY_DYNAMIC_AA_BAF | HYBRID | C4 | Dynamic Asset Allocation / Balanced Advantage Fund | Managed dynamically | — | N | Scheme-specific | Y |
| HY_MULTI_ASSET | HYBRID | C5 | Multi Asset Allocation Fund | ≥3 asset classes, ≥10% each | — | N | Scheme-specific | Y |
| HY_ARBITRAGE | HYBRID | C6 | Arbitrage Fund | ≥65% equity (arbitrage); debt limited to G-secs under 1 year and G-sec repo | — | N | Y | Y |
| HY_EQUITY_SAVINGS | HYBRID | C7 | Equity Savings Fund | ≥65% equity, 15–40% net equity, ≥10% debt | — | N | Y | Y |
| LC_LIFE_CYCLE | LIFE_CYCLE | D1 | Life Cycle Fund | Glide path. Tenure is a multiple of 5 from 5 to 30 years (stored as the attribute `lc_tenure_years`). Maturity year appears in the name (e.g. "Life Cycle Fund 2045"). At most 6 open per MF. | — (exit load **3% in year 1, 2% in year 2, 1% in year 3**) | N | Scheme-specific (glide path) | Y |
| OT_INDEX_ETF | OTHER | E1 | Index Funds / ETFs | ≥95% in the tracked index. Sub-type `INDEX_FUND` or `ETF`; index sub-class EQUITY, DEBT or HYBRID. | — | N | Per underlying | Index funds Y, **ETFs N** (exchange-traded) |
| OT_FOF | OTHER | E2 | Fund of Funds (Overseas/Domestic) | ≥95% in underlying funds. Sub-type from Annexure C: `EQ_DIVERSIFIED`, `EQ_SECTORAL_THEMATIC`, `DEBT`, `HY_AGGRESSIVE`, `HY_CONSERVATIVE`, `HY_INCOME_PLUS_ARBITRAGE`, `HY_DYNAMIC_AA`, `HY_MULTI_ASSET`, `COMMODITY`, `OVERSEAS_COUNTRY_EQ`, `OVERSEAS_THEME_EQ`, `OVERSEAS_REGION_EQ`, `OVERSEAS_COUNTRY_DEBT`, `OVERSEAS_REGION_DEBT`, `DOM_OVS_DIVERSIFIED_EQ`, `DOM_OVS_SECTORAL_EQ`, `DOM_OVS_DEBT` | — | N | Per sub-type | Y |

¹ This is only a display and allocation hint. **The tax classification is stored per scheme** by admin or vendor, because hybrid, FoF and life cycle funds vary by portfolio. Capital-gains tax logic belongs to the tax-module specification.

**Legacy and non-SEBI buckets (seed as `active=false` in the catalogue):**

| code | Meaning | catalogue_eligible |
|---|---|---|
| LEGACY_SOLUTION_RETIREMENT | Solution-oriented retirement fund. Subscriptions stopped by 2.6.3.16; to be merged. Lock-in 60 months (FP `lock_in_period=60`). | N (holdings and external CAS only) |
| LEGACY_SOLUTION_CHILDREN | Solution-oriented children's fund, same treatment | N |
| X_CLOSED_ENDED | Close-ended (Income, Growth, ELSS, FTP, Other Debt) | N |
| X_INTERVAL | Interval funds | N |
| X_UNCLASSIFIED | Pre-2017 labels such as "(Income)", "(Growth)", "(Gilt)", "(Money Market)", "Balanced", "Assured Return", "Liquid" | N |

Category allocation on the dashboard rolls up by `class` (EQUITY/DEBT/HYBRID/LIFE_CYCLE/OTHER) and by `code`.

### 4.2 Related per-scheme attributes (not categories)

| Attribute | Values | Source |
|---|---|---|
| `riskometer` | `LOW`, `LOW_TO_MODERATE`, `MODERATE`, `MODERATELY_HIGH`, `HIGH`, `VERY_HIGH` (6 levels, SEBI 5-Oct-2020) | Provider (monthly) |
| `benchmark_riskometer` | Same six levels. Must be shown **whenever scheme performance is compared with the benchmark** (SEBI circulars 29-Apr-2021 and Aug-2021, effective 1-Oct-2021). | Provider |
| `potential_risk_class` (debt only) | Credit risk A/B/C × interest-rate risk I/II/III (SEBI PRC matrix, 2021) | Provider (SID) |
| `lc_tenure_years`, `lc_maturity_year` | 5–30, and the maturity year | S1/S3 label and the scheme name |

### 4.3 AMFI label mapping (seed from the 2026-09-25 snapshot; applies to S1 headings and the S3 "Scheme Category" column)

Normalise the label before lookup: trim, collapse whitespace, turn `’` into `'`, remove the `Open Ended Schemes(`/`Close Ended Schemes(`/`Interval Fund Schemes(` wrapper. The wrapper sets `scheme_type`.

| AMFI label(s): new taxonomy / old taxonomy | → code |
|---|---|
| `Equity Schemes - Multi Cap Fund` / `Equity Scheme - Multi Cap Fund` | EQ_MULTI_CAP |
| `Equity Schemes - Large Cap Fund` / `Equity Scheme - Large Cap Fund` | EQ_LARGE_CAP |
| `Equity Schemes - Large & Mid Cap Fund` / `Equity Scheme - Large & Mid Cap Fund` | EQ_LARGE_MID_CAP |
| `Equity Schemes - Mid Cap Fund` / `Equity Scheme - Mid Cap Fund` | EQ_MID_CAP |
| `Equity Schemes - Small Cap Fund` / `Equity Scheme - Small Cap Fund` | EQ_SMALL_CAP |
| `Equity Schemes - Flexi Cap Fund` / `Equity Scheme - Flexi Cap Fund` | EQ_FLEXI_CAP |
| `Equity Schemes - Dividend Yield Fund` / `Equity Scheme - Dividend Yield Fund` | EQ_DIVIDEND_YIELD |
| `Equity Schemes - Value Fund` / `Equity Scheme - Value Fund` | EQ_VALUE |
| `Equity Schemes - Contra Fund` / `Equity Scheme - Contra Fund` | EQ_CONTRA |
| `Equity Schemes - Focused Fund` / `Equity Scheme - Focused Fund` | EQ_FOCUSED |
| `Equity Schemes - Sectoral Fund` | EQ_SECTORAL |
| `Equity Schemes - Thematic Fund` | EQ_THEMATIC |
| **`Equity Scheme - Sectoral/ Thematic`** (735 NAV rows) | Pending an admin decision per scheme. Pre-fill **EQ_SECTORAL** if the name matches the sector keyword list (banking, financial services, pharma, healthcare, technology, IT, infrastructure, energy, power, PSU bank, auto, FMCG, consumption, real estate, metal), otherwise **EQ_THEMATIC**. Set `needs_review=true`. The plan stays non-purchasable until confirmed. |
| `Equity Schemes - ELSS- Tax Saver Fund` / `Equity Scheme - ELSS` | EQ_ELSS |
| `Income/Debt Oriented Schemes - Overnight Fund` / `Debt Scheme - Overnight Fund` | DT_OVERNIGHT |
| `…- Liquid Fund` / `Debt Scheme - Liquid Fund` | DT_LIQUID |
| `…- Ultra Short Term Fund` / `Debt Scheme - Ultra Short Duration Fund` | DT_ULTRA_SHORT_TERM |
| `…- Ultra Short to Short Term Fund` / `Debt Scheme - Low Duration Fund` | DT_ULTRA_SHORT_TO_SHORT_TERM |
| `…- Money Market Fund` / `Debt Scheme - Money Market Fund` | DT_MONEY_MARKET |
| `…- Short Term Fund` / `Debt Scheme - Short Duration Fund` | DT_SHORT_TERM |
| `…- Medium Term Fund` / `Debt Scheme - Medium Duration Fund` | DT_MEDIUM_TERM |
| `…- Medium to Long Term Fund` / `Debt Scheme - Medium to Long Duration Fund` | DT_MEDIUM_TO_LONG_TERM |
| `…- Long Term Fund` / `Debt Scheme - Long Duration Fund` | DT_LONG_TERM |
| `…- Dynamic Term Fund` / `Debt Scheme - Dynamic Bond` | DT_DYNAMIC_TERM |
| `…- Corporate Bond Fund` / `Debt Scheme - Corporate Bond Fund` | DT_CORPORATE_BOND |
| `…- Credit Risk Fund` / `Debt Scheme - Credit Risk Fund` | DT_CREDIT_RISK |
| `…- Banking and PSU Debt Fund` / `Debt Scheme - Banking and PSU Fund` | DT_BANKING_PSU |
| `…- Gilt Fund` / `Debt Scheme - Gilt Fund` | DT_GILT (then check the name for "10 year" or "constant maturity" and move to DT_GILT_10Y_CONSTANT, `needs_review`) |
| `…- 10-year Constant Maturity Gilt Fund` | DT_GILT_10Y_CONSTANT |
| `…- Floating Interest Rates Fund` / (old) `Debt Scheme - Floater Fund` | DT_FLOATER |
| `…- Sectoral Fund` | DT_SECTORAL |
| `Hybrid Schemes - Conservative Hybrid Fund` / `Hybrid Scheme - Conservative Hybrid Fund` | HY_CONSERVATIVE |
| `…- Balanced Hybrid Fund` / `Hybrid Scheme - Balanced Hybrid Fund` | HY_BALANCED |
| `…- Aggressive Hybrid Fund` / `Hybrid Scheme - Aggressive Hybrid Fund` | HY_AGGRESSIVE |
| `…- Balanced Advantage Fund/ Dynamic Asset Allocation` / `Hybrid Scheme - Dynamic Asset Allocation or Balanced Advantage` | HY_DYNAMIC_AA_BAF |
| `…- Multi Asset Allocation Fund` / `Hybrid Scheme - Multi Asset Allocation` | HY_MULTI_ASSET |
| `…- Arbitrage Fund` / `Hybrid Scheme - Arbitrage Fund` | HY_ARBITRAGE |
| `…- Equity Savings Fund` / `Hybrid Scheme - Equity Savings` | HY_EQUITY_SAVINGS |
| `Life Cycle Funds - Life Cycle Fund with Maturity of {N} Years` | LC_LIFE_CYCLE, `lc_tenure_years=N` |
| `Index Funds - Equity Funds` / `Index Funds - Debt Funds` / `Index Funds - Hybrid Fund` / `Other Scheme - Index Funds` | OT_INDEX_ETF (`INDEX_FUND`; sub-class taken from the label, `needs_review` for the old label) |
| `Exchange Traded Funds (ETFs) - *` / `Other Scheme - Other  ETFs` / `Other Scheme - Gold ETF` | OT_INDEX_ETF (`ETF`), not eligible for the catalogue |
| `Fund of Funds Scheme (Domestic) - …` / `Other Scheme - FoF Domestic` | OT_FOF (domestic; sub-type by admin) |
| `Overseas Fund of Funds - Fund of Funds investing overseas` / `Other Scheme - FoF Overseas` | OT_FOF (overseas; sub-type by admin) |
| `Solution Oriented Scheme - Retirement Fund` / `Solution Oriented Schemes ** - Retirement Fund` | LEGACY_SOLUTION_RETIREMENT |
| `Solution Oriented Scheme - Children's Fund` / `Children's Fund - Childrens' Fund` | LEGACY_SOLUTION_CHILDREN |
| Close-ended headings (`ELSS`, `Growth`, `Income`, `…Fixed Term Plan`, `…Other Debt Scheme`) | X_CLOSED_ENDED |
| `Interval Fund Schemes(Income)` | X_INTERVAL |
| Open-ended `(Income)`, `(Growth)`, `(Gilt)`, `(Money Market)`, `Balanced`, `Assured Return`, `Liquid`, `ELSS` (bare) | X_UNCLASSIFIED |
| **Any label not in the table** | Put in `amfi_label_unmapped` and alert. The plan is non-purchasable. The ingest run still succeeds. |

When a plan's label moves from the old list to the new one, update `scheme.sebi_category_code`, write a row to `scheme_category_history`, and re-queue category statistics.

---

## 5. Pipeline: sources → jobs → tables → validation → overrides

### 5.1 Architecture

```
AMFI S1/S2/S3 ──┐                 ┌─> raw_ingest (S3 bucket ap-south-1, sha256, 400-day retention; subject to legal sign-off, §2)
FP S10 (daily) ─┼─> Ingest jobs ──┼─> registry tables (amc, scheme, scheme_plan, plan_isin)
FundFacts       │   (NestJS       ├─> nav_daily / nav_latest / nav_quarantine
 providers ─────┘   workers,      ├─> fund_fact (append-only ledger) ─> fund_fact_resolved (materialized)
 (admin CSV,        pg advisory   └─> compute jobs ─> plan_returns, plan_rolling_returns,
  FP market,        locks)                            plan_risk_metrics, category_stats
  vendor)                                          └─> revalidateTag('fund:<id>') → Next.js ISR; search index
```

Scheduling assumption: jobs run inside a NestJS worker process using `@nestjs/schedule` cron (Asia/Kolkata), with one PostgreSQL advisory lock per job so only one instance runs at a time (the pattern v1 used in `SchemeNavSyncScheduler.java:29-101`). Compute jobs are chained by an outbox event (`nav.ingested`) rather than by fixed times.

### 5.2 Jobs

| Job | Trigger (IST) | Source | Writes | Idempotency | Timeouts and retries |
|---|---|---|---|---|---|
| J1 `amfi.nav.latest` | 21:30, 22:30, 23:15, 00:30, 06:30, 10:30, 13:00 daily | S1 | `ingest_run`, `raw_ingest`, `nav_daily` (upsert on `(amfi_code, nav_date)`), `nav_latest`, `nav_quarantine` | If the body's SHA-256 matches the last run, finish as `SKIPPED_UNCHANGED` | Connect 10s, read 60s, 3 attempts with 2s exponential backoff (v1 `NavFeedProperties.java:62,68,90`) |
| J2a `amfi.nav.backfill` | Manual, once at bootstrap: from 2006-04-01 in **30-day chunks**, tp=1,2,3, 2 requests in parallel at most | S2 | `nav_daily` | Chunk ledger `backfill_chunk(tp, from, to, status, sha256)` | Read 180s. Retry the chunk 3 times. |
| J2b `amfi.nav.repair` | 02:00 daily, covering the last 10 calendar days | S2 | `nav_daily` (any value change is recorded in `nav_revision`), marks affected plans dirty | Same | Same |
| J3 `amfi.scheme.master` | 05:30 daily | S3 | `amc`, `amc_alias`, `scheme`, `scheme_plan`, `plan_isin`, `scheme_category_history`, `amfi_label_unmapped` | Upsert by AMFI code, with change detection per column | Read 120s |
| J4 `fp.scheme.sync` | 06:00 daily | S10 | `plan_txn_rules`, `scheme_plan.fp_*`, `scheme.status` (merger via `merged_to_isin`) | Upsert by ISIN | Uses the FP client's own retry policy |
| J5 `compute.returns` | On `nav.ingested` for dirty plans; full recompute at 03:00 | `nav_daily` | `plan_returns` (trailing, as-of latest NAV and as-of last month-end) | Deterministic by `(plan, as_of, methodology_version)` | — |
| J6 `compute.rolling` | 03:30 daily | `nav_daily` | `plan_rolling_returns` | Same | — |
| J7 `compute.risk` | 04:00 on the 1st business day of each month, and after J8 updates the risk-free rate | `nav_daily`, `risk_free_rate`, `benchmark_value` (phase 2) | `plan_risk_metrics` | Same | — |
| J8 `compute.category_stats` | After J5 and J6 | `plan_returns` | `category_stats` (mean, median, quartiles, n; Regular-Growth plans only) | Same | — |
| J9 `facts.pull` | Per provider: FP market data daily at 07:00; admin CSV on upload; vendor per contract | `FundFactsProvider`s | `fund_fact` (append), then refresh `fund_fact_resolved` | `(provider, subject, key, as_of, value_hash)` unique | — |
| J10 `facts.staleness` | Hourly | `fund_fact_resolved` | `catalogue_gate` (publishable yes/no plus reasons); alerts | — | — |
| J11 `docs.linkcheck` | Weekly, Sunday 04:00 | `fund_document` | Link status; alert on 4xx/5xx | — | — |
| J12 `catalogue.publish` | After J5, J8 and J10 | — | Search index (pg_trgm and full-text search on name and aliases); `revalidateTag` calls to Next.js | — | — |
| J13 `nav.integrity` | Hourly | — | Metrics: last successful J1 age, fresh-row count, quarantined count, dirty-plan backlog, held plans without a fresh NAV (v1 `HoldingsIntegrityScheduler` pattern) | — | — |

**Tracked set rule, carried over from v1:** J1 writes NAVs for **all** parsed rows, not only catalogue ISINs. That way held, external-CAS and delisted plans stay priced (the v1 lesson in `SchemeNavSyncService.java:174-206`; v1 matched only about 1,488 catalogue ISINs, `ProductSchemeRepository.java:134`).

### 5.3 Tables (Drizzle / PostgreSQL 18; `id uuid default uuidv7()` unless stated)

| Table | Columns (type) | Keys / indexes |
|---|---|---|
| `amc` | id, name (text), short_name, website, amfi_mf_param (int, S2 `mf=`), sebi_reg_no, logo_asset, active (bool) | unique(name) |
| `amc_alias` | amc_id, alias (text), source (`AMFI_NAV_HEADING`\|`AMFI_MASTER`\|`FP`) | unique(alias) |
| `sebi_category` | code (text PK), asset_class (enum), sebi_sr (text), name, characteristic (text), uniform_description (text), default_lock_in_months (int), cutoff_group (`LIQUID_OVERNIGHT`\|`STANDARD`), equity_tax_hint (`Y`\|`N`\|`SCHEME`), catalogue_eligible (bool), taxonomy_version (`SEBI_2026`\|`LEGACY`), display_order (int), active (bool) | Seeded from §4.1 |
| `amfi_category_label_map` | label_normalized (text PK), sebi_category_code (FK, null allowed), scheme_type (`OPEN`\|`CLOSE`\|`INTERVAL`), sub_attr (jsonb, e.g. `{"lc_tenure_years":10}`, `{"index_subclass":"EQUITY"}`), needs_review (bool), taxonomy (`NEW`\|`OLD`\|`NONSEBI`) | Seeded from §4.3 |
| `scheme` (fund family) | id, amc_id, name, name_normalized, sebi_category_code, amfi_label_raw, scheme_type, launch_date, closure_date, status (`NFO`\|`ACTIVE`\|`SUSPENDED`\|`MERGED`\|`MATURED`\|`WOUND_UP`), merged_into_scheme_id, segregated_parent_scheme_id, lc_tenure_years, fof_subtype, needs_review, created_at, updated_at | unique(amc_id, name_normalized, launch_date); trigram index on name |
| `scheme_name_history` | scheme_id, name, valid_from, valid_to, source | (Circular 2.6.5 renames, FP `name_changes`) |
| `scheme_category_history` | scheme_id, from_code, to_code, changed_on, source_label | — |
| `scheme_plan` (share class) | id, scheme_id, amfi_code (int, unique), nav_name, plan_type (`REGULAR`\|`DIRECT`\|`LEGACY`\|`UNKNOWN`), option (`GROWTH`\|`IDCW_PAYOUT`\|`IDCW_REINVEST`\|`IDCW_PAYOUT_AND_REINVEST`\|`BONUS`\|`UNKNOWN`), idcw_frequency, excluded_reason (text, null allowed), resolution_source (enum), conflict (bool), fp_fund_scheme_id, fp_scheme_code, first_nav_date, is_purchasable (generated/maintained), visibility (`VISIBLE`\|`HIDDEN`\|`DELISTED`), created_at, updated_at | unique(amfi_code); index(scheme_id, plan_type, option) |
| `plan_isin` | isin (char(12) PK), scheme_plan_id, role (`GROWTH_OR_PAYOUT`\|`REINVEST`), valid (bool) | — |
| `plan_txn_rules` (from FP) | scheme_plan_id PK, lumpsum_min/max/multiple, additional_min/multiple, sip (jsonb by frequency: dates, min, max, multiple, min_installments), swp (jsonb), stp (jsonb), switch_in/out rules, withdrawal_min_amount/units, purchase/redemption/sip/swp/stp/switch flags, lock_in_months, fp_synced_at | — |
| `nav_daily` | amfi_code (int), nav_date (date), nav (numeric(18,6)), source (`AMFI_DAILY`\|`AMFI_HISTORY`\|`FP`\|`MANUAL`), ingest_run_id, inserted_at | PK(amfi_code, nav_date). **Range-partitioned by nav_date year**, roughly 40M rows over 20 years. |
| `nav_latest` | amfi_code PK, nav, nav_date, prev_nav, prev_nav_date, quarantined (bool), updated_at | — |
| `nav_quarantine` | amfi_code, nav_date, nav, reason (`JUMP`\|`FUTURE_DATE`\|`ZERO`\|`PARSE`), ingest_run_id, status (`OPEN`\|`RELEASED`\|`REJECTED`), reviewed_by, reviewed_at | — |
| `nav_revision` | amfi_code, nav_date, old_nav, new_nav, detected_run_id, detected_at | (AMFI restatements) |
| `nav_adjustment` | amfi_code, effective_date, factor (numeric), kind (`SPLIT`\|`CONSOLIDATION`), approved_by | Adjusts NAV series before returns are computed (§6.8) |
| `ingest_run` | id, job, source_url, started_at, finished_at, status (`SUCCESS`\|`SKIPPED_UNCHANGED`\|`FAILED`\|`PARTIAL`), body_sha256, raw_object_key, rows_parsed, rows_fresh, rows_written, rows_quarantined, rows_rejected, modal_nav_date, baseline_run_id, floor_results (jsonb), error | 90-day retention (as in v1) |
| `plan_returns` | scheme_plan_id, basis (`LATEST`\|`MONTH_END`), as_of (date), period (`1D`,`1W`,`1M`,`3M`,`6M`,`YTD`,`1Y`,`2Y`,`3Y`,`5Y`,`7Y`,`10Y`,`SI`,`7D_SA`,`15D_SA`,`30D_SA`,`CY2025`…), start_nav_date, end_nav_date, abs_return (numeric(14,8)), cagr (numeric(14,8), null allowed), value_of_10k (numeric(14,2)), methodology_version (int), computed_at | PK(scheme_plan_id, basis, period) for current values, plus `plan_returns_history` if needed |
| `plan_sip_returns` | scheme_plan_id, as_of, period (`1Y`,`3Y`,`5Y`,`10Y`), invested, value, xirr, abs_return, installments, methodology_version | — |
| `plan_rolling_returns` | scheme_plan_id, as_of, window (`1Y`,`3Y`,`5Y`), lookback_years, obs, min, max, mean, median, p25, p75, pct_negative, pct_0_8, pct_8_12, pct_12_15, pct_gt_15 | — |
| `plan_risk_metrics` | scheme_plan_id, as_of_month, window_months (36), sd_ann, sharpe, sortino, max_drawdown, max_dd_peak_date, max_dd_trough_date, beta, alpha, tracking_error, rf_used, source (`COMPUTED`\|`AMC_DISCLOSED`\|`VENDOR`), methodology_version | — |
| `category_stats` | sebi_category_code, basis, as_of, period, n, mean, median, p25, p75 | — |
| `risk_free_rate` | month (date), rate_annual (numeric(8,6)), source_label (e.g. "FBIL Overnight MIBOR, month-average"), entered_by | — |
| `benchmark_index` | id, name, provider (`NSE`\|`ASIA_INDEX`\|`CRISIL`\|`OTHER`), is_tri, licensed (bool) | — |
| `scheme_benchmark` | scheme_id, benchmark_index_id, tier (1\|2), valid_from, valid_to, source | — |
| `benchmark_value` (phase 2) | benchmark_index_id, value_date, value, source | Filled only when `licensed = true` |
| `fund_fact` (append-only ledger) | id, subject_level (`SCHEME`\|`PLAN`), scheme_id, scheme_plan_id, fact_key (enum §5.5), value (jsonb, validated by a per-key zod schema), as_of (date), provider_id, source_ref (text: URL, document ID or CSV upload ID), retrieved_at, value_hash | unique(provider_id, subject, fact_key, as_of, value_hash) |
| `fund_fact_override` | id, subject, fact_key, value (jsonb), reason (text, required), expires_at (null allowed), maker_id, checker_id, status (`PENDING`\|`APPROVED`\|`REJECTED`\|`EXPIRED`), created_at, approved_at | — |
| `fund_fact_resolved` (materialized view or table refreshed by J9) | subject, fact_key, value, as_of, provider_id, override_id, stale (bool), resolved_at | PK(subject, fact_key) |
| `fund_document` | scheme_id, doc_type (`SID`\|`KIM`\|`SAI`\|`FACTSHEET`\|`ADDENDUM`\|`PORTFOLIO`), url, as_of, sha256, last_check_status, last_checked_at | — |
| `fund_manager`, `scheme_fund_manager` | name, bio_url; scheme_id, manager_id, role (`PRIMARY`\|`CO`\|`OVERSEAS`\|`DEDICATED_DEBT`), from_date, to_date, source | — |
| `catalogue_gate` | scheme_plan_id PK, publishable (bool), reasons (text[]), evaluated_at | Read by the catalogue API |
| `catalogue_curation` | scheme_id, visibility, featured_rank, collections (text[]), note, updated_by | Admin |

### 5.4 Validation floors

**NAV ingest (J1/J2)**, applied to the whole feed before anything is written, as in v1:

| # | Floor | Value | On breach | v1 origin |
|---|---|---|---|---|
| V1 | Header resolves by column **name** (both formats; alphanumeric-only matching of header cells) | Must resolve | FAILED ("format changed") | `AmfiNavParser.java:17-34,50-55` |
| V2 | Minimum parsed rows | **≥ 8,000** (today 14,396) | FAILED | v1 used 1000 (`NavFeedProperties.java:97`); raised because of the profile |
| V3 | Fresh rows (nav_date ≥ previous business day) | **≥ 6,000** (today 8,744) | FAILED if this is the first run of the evening; otherwise `PARTIAL` with an alert | New |
| V4 | Matched-count regression against the last successful run, baseline no older than 7 days | ≥ 0.5 × baseline | FAILED | `SchemeNavSyncService.java:399-470`, `NavFeedProperties.java:180` |
| V5 | Degradation warning | < 0.9 × baseline | WARN | v1 floor-hardening report |
| V6 | Cold-start matched fraction (no baseline) | ≥ 0.10 | FAILED | `NavFeedProperties.java:122` |
| V7 | Modal NAV date is plausible | Modal date within [today − 4 calendar days, today] | FAILED | New (catches a stale feed served as fresh) |

**Per row (the offending row is quarantined; the run continues):**

| # | Rule | Action |
|---|---|---|
| R1 | NAV parses as decimal (a trailing `.` is allowed) and is > 0 | Reject. For `0`: mark the plan `MATURED` if every NAV is 0 for 30 days. |
| R2 | nav_date ≤ today (IST) + 2 days | Quarantine `FUTURE_DATE` (v1 `max-future-days=2`, `SchemeNavSyncService.java:126-131`) |
| R3 | Size of the daily jump against `nav_latest`, scaled by elapsed days: \|nav/prev − 1\| ≤ 0.25 × max(1, days) | **GROWTH/BONUS plans:** quarantine `JUMP`. **IDCW plans:** allow downward moves (payout) and quarantine only rises above the threshold. Exact 1/n ratios (0.1, 0.2, 0.5) raise a `SPLIT` suggestion that needs `nav_adjustment` approval. (v1 used 25% per day, `SchemeNavSyncService.java:699-728`, but did not treat IDCW differently.) |
| R4 | nav_date older than the stored nav_latest date | Ignore for `nav_latest`; still upsert into `nav_daily` (history) |
| R5 | Same (amfi_code, nav_date) with a different value from before | Write `nav_revision`, mark the plan dirty, alert if more than 20 revisions in a run |
| R6 | ISIN checksum invalid | Store the plan without that ISIN; flag it |

**Scheme master and category (J3/J4):**

| # | Rule | Action |
|---|---|---|
| M1 | Row count ≥ 15,000 (today 16,485) | FAILED |
| M2 | Label unmapped | `amfi_label_unmapped` plus alert; plan non-purchasable |
| M3 | More than 200 category changes in one run | Hold the changes for admin approval (probably a mass relabel by AMFI) |
| M4 | FP plan type ≠ AMFI plan type | `conflict = true`; hidden until an admin resolves it |
| M5 | FP ISIN has no match in the AMFI registry | Stays in `plan_txn_rules`, unlinked; alert. Not purchasable, since there is no NAV. |

**Fund facts (J9), checked by a zod schema per key before insert:**

| Fact key | Validation | Stale after (hides the value) | Gate impact |
|---|---|---|---|
| `ter` `{total, ber, brokerage, levies, plan_type}` | 0 < total ≤ 3.00%. Regular TER ≥ Direct TER for the same scheme. BER ≤ the slab cap for the category (index/ETF ≤ 0.90%). A change of more than 0.50 pp from the previous value sends it to review. | 45 days | Required |
| `riskometer`, `benchmark_riskometer` | One of the six enum values. A move of more than 2 levels in one month sends it to review. | **75 days** (monthly disclosure due by the 10th, plus a buffer) | **Required.** SEBI requires the riskometer wherever performance is shown. Missing or stale means the plan is not publishable. |
| `potential_risk_class` | Debt categories only; A–C × I–III | 400 days | Required for debt |
| `exit_load` `{rules:[{from_days,to_days,pct,free_units_pct?}], text}` | Contiguous non-overlapping ranges; 0 ≤ pct ≤ 5. LC_LIFE_CYCLE must equal 3/2/1% for years 1/2/3. | 365 days (re-verify against the SID) | Required |
| `lock_in_months` | EQ_ELSS = 36; legacy solution-oriented = 60; otherwise 0 unless the SID says otherwise. Must equal FP `lock_in_period` when present. | — | Required |
| `benchmark` `{tier1, tier2?}` | Must exist in `benchmark_index`. Tier 1 should be on AMFI's tier-1 list for the category (a mismatch is a warning, not a block). | 365 days | Required |
| `aum` `{amount_cr, kind: AAUM_QUARTER\|MONTH_END, period}` | > 0; a quarter-on-quarter change beyond ±60% sends it to review | 130 days | Optional (field hidden when stale) |
| `fund_managers` | ≥ 1 active manager | 180 days | Optional |
| `documents` (SID/KIM URLs) | HTTP 200 on the weekly check | Last check failed | SID and KIM required |
| `risk_ratios` (AMC-disclosed) | SD from 0 to 60%; beta from −1 to 3 | 60 days | Optional |
| `objective`, `inception_date`, `min_amounts` | Non-empty; inception date ≤ first NAV date + 30 days | — | Optional (min amounts always come from FP) |

**Publishable gate (`catalogue_gate`)** requires: purchasable per §3.4; category resolved (`needs_review = false`); fresh NAV (≤ 4 business days old, 7 days for FoF); riskometer, TER, exit load, lock-in, benchmark, and SID+KIM present and not stale; no open conflict or quarantine on the Regular-Growth plan.

### 5.5 FundFactsProvider contract and precedence

```ts
// packages/fund-data/src/facts.ts
export type FactKey =
  | 'ter' | 'riskometer' | 'benchmark_riskometer' | 'potential_risk_class'
  | 'exit_load' | 'lock_in_months' | 'benchmark' | 'aum' | 'fund_managers'
  | 'documents' | 'risk_ratios' | 'objective' | 'inception_date'
  | 'top_holdings' | 'sector_allocation' | 'tax_classification';

export type ProviderId = 'admin' | 'fp-market' | 'vendor-acemf' | 'vendor-morningstar' | 'amfi-derived' | 'fp-txn' | 'category-default';

export interface SubjectRef { schemeId?: string; schemePlanId?: string; isin?: string; amfiCode?: number }

export interface FactRecord<K extends FactKey = FactKey> {
  key: K;
  subject: SubjectRef;
  value: FactValueMap[K];          // zod-validated per key
  asOf: string;                    // ISO date the fact describes (e.g. riskometer month-end)
  source: { provider: ProviderId; ref?: string; retrievedAt: string };
}

export interface FundFactsProvider {
  readonly id: ProviderId;
  supports(key: FactKey): boolean;
  pull(req: { keys: FactKey[]; since?: string; subjects?: SubjectRef[] }): AsyncIterable<FactRecord>;
  health(): Promise<{ ok: boolean; lastSuccessAt?: string; detail?: string }>;
}
```

**Resolution order per key. The first fresh, valid value wins; an approved, unexpired admin override always wins.**

| Fact key | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| ter, riskometer, benchmark_riskometer, exit_load, aum, risk_ratios, top_holdings | admin override | `fp-market` (once in production) | vendor | admin-curated baseline (CSV import) |
| lock_in_months | admin override | `fp-txn` (`lock_in_period`) | `category-default` | — |
| benchmark, fund_managers, documents, objective, potential_risk_class, tax_classification | admin override | vendor / `fp-market` | admin baseline | — |
| inception_date | admin override | `amfi-derived` (S3 launch date) | first NAV date | — |
| **Transactional rules** (min amounts, SIP dates, purchase flags) | **`fp-txn` only.** An admin may **restrict** visibility but may **never relax** an FP limit. | — | — | — |

**Admin override workflow:** maker-checker, with two different users holding the `OPS_FUND_DATA` role. A reason is mandatory. `expires_at` defaults to +90 days for time-varying keys (TER, riskometer, AUM). Every change goes to the audit log. The fund page shows the provenance: "Riskometer: Very High · as of 31-Aug-2026 · Source: AMC disclosure".

**Bulk CSV import** (the admin provider, which carries launch operations). There are templates for `riskometer_monthly.csv` (amfi_code or ISIN, month, level, benchmark_level), `ter.csv` (isin, as_of, ber, brokerage, levies, total), `exit_load.csv`, `benchmark.csv` and `documents.csv`. The upload shows a dry-run preview with row-level validation (§5.4); approval then inserts `fund_fact` rows with `provider='admin'` and `source_ref=upload_id`.

**Launch scope recommendation.** Curating monthly riskometer and TER data for every Regular plan (about 482 FP POA plans, and more in the FP direct tenant) is not sustainable for 2 developers. **Launch with a curated set of about 300 Regular-Growth schemes**, chosen as the top 10 per SEBI category by quarterly AAUM (S7), with their IDCW options included. Switch the provider to `fp-market` once Cybrilla production data is live. Coverage then grows without extra admin load.

### 5.6 Update cadence summary

| Data | Published by | Publisher cadence | Our cadence | Freshness SLA shown to users |
|---|---|---|---|---|
| NAV (non-FoF) | AMC → AMFI | By 11 PM each business day (liquid/overnight: calendar days) | J1, 7 polls a day | "NAV as of <date>"; alert if more than 1 business day behind |
| NAV (FoF, overseas FoF) | AMC → AMFI | By 10 AM the next business day | J1 10:30 and 13:00 polls | Same |
| NAV restatements | AMFI | Ad hoc | J2b nightly over 10 days | — |
| Scheme master / categories | AMFI | On change | J3 daily | — |
| FP transactional rules | Cybrilla | On change | J4 daily | — |
| TER | AMC website + AMFI | Daily; changes notified in advance | Admin CSV monthly, or FP market data daily | "as of"; hidden after 45 days |
| Riskometer | AMC + AMFI | Monthly, within 10 days of month end | Admin CSV by the 15th, or vendor | Hidden after 75 days → not publishable |
| AUM | AMFI (quarterly AAUM) and AMC | Quarterly (AAUM); monthly in factsheets | Quarterly, or vendor monthly | Hidden after 130 days |
| Exit load, lock-in, benchmark, fund managers | SID/KIM addenda | On change | Admin on addendum; review every 6 months | — |
| Risk ratios | AMC factsheet | Monthly | J7 monthly (computed) and admin (disclosed) | "as of month" |
| Returns | Computed | — | J5 on NAV change; nightly full run | "as of NAV date" |

---

## 6. Returns computation spec

### 6.1 Conventions

| Item | Rule |
|---|---|
| Series | Regular-Growth AMFI code of the scheme family, after applying `nav_adjustment` factors |
| As-of NAV lookup `navAt(d)` | Latest `nav_date ≤ d`, but only if `d − nav_date ≤ 7` calendar days; otherwise `null`, so the period's return is `null` |
| End date `D` | `nav_latest.nav_date` for basis `LATEST`; the last calendar day of the previous month for basis `MONTH_END` (used on marketing surfaces, SEBI MC 13.3.1.3) |
| Start date `S` for a trailing period | Calendar arithmetic from `D`: `1W = D−7d`, `1M = D−1 month`, `nY = D.minusYears(n)` (29-Feb maps to 28-Feb), `YTD` = 31-Dec of the previous year, `SI` = first NAV date |
| Day count | Actual/365 fixed, matching v1 `XirrCalculator.java:33` (`DAYS_PER_YEAR = 365.0`) |
| Arithmetic | Ratios in decimal (`decimal.js`, 34 significant digits); the power step in float64 (as v1 did); store fractions to 8 decimal places; display percentages to 2 decimal places |
| Periods under 1 year | **Absolute** return (never annualised), except the liquid/overnight/money-market simple-annualised figures (§6.3) |
| Periods of 1 year or more | CAGR |
| Availability | A period is `null` when `S < first_nav_date`, i.e. history is too short |
| SEBI minimum age | Scheme age (D − inception) **< 6 months**: show no returns ("Returns appear 6 months after launch"). **6–12 months**: show only the 6-month simple annualised figure and absolute since-inception return, labelled. **≥ 1 year**: full set. (SEBI MC 13.3.2.) |

### 6.2 Formulas

| Metric | Formula | Notes |
|---|---|---|
| Absolute | `R_abs = NAV_D / NAV_S − 1` | — |
| CAGR, fixed period n years | `R_cagr = (NAV_D / NAV_S)^(1/n) − 1` | Uses the nominal n, even if `navAt(S)` came from an earlier date within the 7-day tolerance |
| CAGR, since inception | `R_si = (NAV_D / NAV_first)^(365 / (D − first_nav_date)) − 1` | Only when D − first ≥ 365 days; otherwise absolute. Base = first NAV in AMFI history. If admin records an allotment date and allotment NAV (usually 10.0000) earlier than the AMFI history, use them and label "since launch". |
| Point-to-point ₹10,000 | `V = 10000 × NAV_D / NAV_S` | SEBI MC 13.3.1.2. Shown for 1Y/3Y/5Y/SI. |
| Calendar-year return (`CY2025`) | `navAt(31-Dec-2025) / navAt(31-Dec-2024) − 1` | Calendar periods only (SEBI MC 13.3.5) |
| Custom point-to-point (calculator) | Same as absolute and CAGR with user-chosen S and D (CAGR only if D − S ≥ 365) | Shares the function `returnBetween(plan, S, D)` with trailing returns |
| Category average | Over Regular-Growth plans in the same `sebi_category_code` with a non-null value for the period: mean, median, p25, p75 | For quartile rank, rank by value descending; quartile = ceil(4 × rank / n) |

### 6.3 Liquid, overnight and money-market simple annualised yields

`R_sa(k) = (NAV_D / navAt(D−k) − 1) × 365 / k` for k = 7, 15 and 30 calendar days (SEBI MC 13.3.3). These are shown only for DT_OVERNIGHT, DT_LIQUID and DT_MONEY_MARKET, in addition to the standard periods.

### 6.4 SIP returns (standardised)

| Item | Rule |
|---|---|
| Plan | ₹10,000 per month, instalment on the 1st of each month. If the 1st has no NAV, use the next available NAV date. |
| Horizon | 1Y (12 instalments), 3Y (36), 5Y (60), 10Y (120), ending at D. The first instalment is on the 1st of the month n years before the month containing D. |
| Units | `u_i = 10000 / NAV(t_i)`. Stamp duty and loads are ignored; footnote: "excludes stamp duty, loads and taxes". |
| Value | `V = Σu_i × NAV_D` |
| XIRR | Solve `Σ cf_i / (1+r)^((t_i − t_0)/365) = 0` with `cf_i = −10000` at each `t_i` and `+V` at D. Port v1 `XirrCalculator` exactly: Newton-Raphson from seed 0.1, NPV tolerance 1e-7, ≤ 100 iterations, then bracketed bisection ≤ 200 iterations. Return `null` when there are fewer than 2 cash flows, all have the same sign, the horizon is zero, or it does not converge (`XirrCalculator.java:17,30,33`; tests in `XirrCalculatorTest`). |
| Absolute | `V / (10000 × n) − 1` |
| Availability | `null` if the first instalment date is before `first_nav_date` |

Portfolio and holding XIRR on the investor dashboard use the same solver with actual transaction cash flows (defined in the portfolio spec).

### 6.5 Rolling returns

For window W ∈ {1Y, 3Y, 5Y} and lookback L = min(10 years, available history − W):

- Observations: every date `d` in `(D − L, D]` that has a NAV. `r_d = CAGR(navAt(d − W) → NAV_d)`. Skip `d` where `navAt(d − W)` is null.
- Stored: `obs, min, max, mean, median, p25, p75, pct_negative, pct in (0,8], (8,12], (12,15], >15` (percentage bands).
- Require `obs ≥ 250` (about one year of daily observations); otherwise `null`.
- Compute cost is about 8.7k plans × 2.5k observations × 3 windows ≈ 65M ratio evaluations per night. Do it in SQL (`nav_daily` self-join on dates with a window function) or in a worker using typed arrays. Only dirty plans need recomputing; a full recompute runs weekly on Sunday.

### 6.6 Risk metrics

| Metric | Formula (monthly returns `r_m = navAt(ME_m)/navAt(ME_{m−1}) − 1` over the last 36 month-ends; require all 36) | Source at launch |
|---|---|---|
| Standard deviation, annualised | `σ = √12 × stdev_sample(r_m)` | Computed |
| Sharpe | `(12 × mean(r_m − rf_m)) / σ`, with `rf_m = risk_free_rate.rate_annual / 12` for month m | Computed. Risk-free rate is entered monthly by admin: **FBIL Overnight MIBOR month average**, the usual AMC factsheet convention. Label: "Risk-free rate: FBIL Overnight MIBOR". |
| Sortino | `(12 × mean(r_m − rf_m)) / (√12 × √(mean(min(0, r_m − rf_m)²)))` | Computed |
| Maximum drawdown (3Y/5Y) | `max_t (1 − NAV_t / max_{s≤t} NAV_s)` on daily NAVs; store peak and trough dates | Computed |
| Beta | `cov(r_m, b_m) / var(b_m)`, with `b_m` = monthly benchmark TRI return | **Phase 2** (needs a licensed index series). Meanwhile show the AMC-disclosed beta from the factsheet via `risk_ratios`, labelled "as disclosed by AMC, <month>". |
| Alpha (Jensen, annualised) | `12 × [mean(r_m − rf_m) − β × mean(b_m − rf_m)]` | Phase 2 |
| Tracking error (index funds) | `√12 × stdev(r_m − b_m)` | Phase 2; meanwhile the AMC-disclosed figure |
| Label | "Calculated by Sanchay from NAVs; may differ from AMC factsheet values" | — |

### 6.7 Display rules (compliance)

| Rule | Implementation |
|---|---|
| Show the scheme riskometer wherever performance is shown (SEBI April/August 2021) | The fund card and page render `riskometer` next to returns. If it is missing, the plan is not publishable (§5.4). |
| Show both riskometers wherever performance is compared with the benchmark | Launch has no benchmark returns. Phase 2 shows the benchmark riskometer next to benchmark returns. |
| State the plan and add the expense footnote (SEBI MC 13.3.1.4) | "Regular Plan – Growth. Different plans have different expense structures." |
| Past-performance disclaimer | "Past performance may or may not be sustained in future." Also the standard "Mutual fund investments are subject to market risks, read all scheme related documents carefully." |
| Date basis | App and web fund pages: `LATEST` basis with "as of <NAV date>". **Push notifications, emails, social posts and SEO landing copy: `MONTH_END` basis only** (SEBI MC 13.3.1.3, conservative reading for MFD promotional material). |
| Fund manager change (SEBI MC 13.3.1.5) | If the manager's tenure is shorter than the displayed period, add a footnote: "Fund manager since <date>". |
| No ranking or recommendation language | Category quartile is shown as "Q1 in category (1Y)" only as factual data. No "best fund" wording. No third-party star ratings (§2). |

### 6.8 Edge cases

| Case | Handling |
|---|---|
| IDCW and bonus options (NAV falls on payout) | Never compute plan returns on IDCW or bonus series for display. Their pages show the Regular-Growth figures with the label. If a scheme has no Growth option, show "Returns not shown for IDCW-only schemes" plus the NAV history chart. |
| Holidays and weekends | `navAt()` looks backwards, up to 7 days |
| Calendar-day NAV funds | Handled naturally; annualisation uses calendar days |
| NAV restated by AMFI | `nav_revision`, mark dirty, recompute |
| Scheme merger (FP `merged_to_isin`, AMFI code stops) | Mark the merged-away scheme `MERGED` with `merged_into_scheme_id`; hide it from the catalogue. The surviving scheme keeps its own history. Holdings valuation follows the RTA's unit conversion (CAS/FP), not the returns engine. |
| Segregated portfolio (a separate AMFI code; the name contains "Segregated") | Excluded from the catalogue. The main plan's returns carry a footnote "Segregated portfolio created on <date>" (admin fact). Holdings value both parts. |
| Unit split or consolidation | An R3 exact-ratio suggestion leads to an approved `nav_adjustment`; all series are computed on adjusted NAVs |
| Matured or wound-up (`0` NAV) | Status `MATURED`. The last non-zero NAV is frozen for holdings. No returns. |
| NFO (no NAV yet) | Status `NFO` with NFO dates (admin). No returns. Not purchasable unless FP allows it (out of launch scope). |
| Scheme under 6 months old | §6.1 minimum-age rule |
| Category change during the period | Returns are unaffected. Category statistics use the current category (documented). |
| Quarantined latest NAV | Returns use the last non-quarantined NAV. The page shows "NAV as of <older date>". |
| Leap day in S | Map 29-Feb to 28-Feb |
| Floating-point drift | Golden tests pin results to 6 decimal places |

### 6.9 Golden test vectors (must be in CI)

| # | Input | Expected |
|---|---|---|
| T1 | NAV_S = 100.0000 on 2023-09-25, NAV_D = 133.1000 on 2026-09-25, 3Y | abs 33.10%; CAGR 10.0000%; ₹10,000 becomes ₹13,310.00 |
| T2 | Liquid: 1000.0000 on 2026-09-17, 1001.3000 on 2026-09-24, k = 7 | 0.13% × 365/7 = **6.7786%** simple annualised |
| T3 | 1Y where S falls on a Sunday and the last NAV is on Friday (2 days earlier) | Uses Friday's NAV |
| T4 | 1Y where the only NAV is 9 days before S | `null` |
| T5 | SIP with constant NAV 10 for 12 months | XIRR = 0.0000%; abs 0% |
| T6 | Two cash flows: −100 on day 0, +200 on day 365 | XIRR = 100.00% (v1 test case) |
| T7 | Two cash flows: −100 on day 0, +50 on day 365 | XIRR = −50.00% (v1 test case) |
| T8 | All cash flows negative | `null` |
| T9 | Scheme 150 days old | No returns; flag `TOO_NEW` |
| T10 | IDCW plan page | Returns taken from the Regular-Growth sibling, with the label |
| T11 | NAV restated for D−3 | `nav_revision` row; plan recomputed; the 1W return changes |
| T12 | Parser: every one of the ~150 option spellings (snapshot fixture) | Classified exactly as in the fixture table |
| T13 | Scheme master ISIN column `INF209K01157INF209K01CE5` | Two ISINs: payout and reinvest |
| T14 | NAV `10.` | Parses as 10.000000 |
| T15 | Header in the S2 column order | Columns resolved by name; ISINs taken from columns 5 and 6 |

**Cross-validation (alert only):** once `fp-market` is live, compare our 1Y/3Y/5Y figures with FP's for Regular-Growth plans. Alert when |Δ| > 0.10 percentage points for more than 2% of plans (usually a convention mismatch or a NAV gap).

---

## 7. What to reuse from v1

| v1 artefact | Use in v2 |
|---|---|
| `integration/nav/AmfiNavParser.java` (header-by-name resolution, two ISINs per row, future-date split, junk-row skipping, `Locale.ENGLISH` `d-MMM-uuuu`) | Port the logic to `packages/fund-data/amfi-parser.ts` with the same fixtures. Also handle the trailing `10.`, the `(Children’s…)` typographic quote, and the joined ISIN column in S3. |
| `integration/nav/NavFeedProperties.java` URLs, timeouts and retries (`:51,:59,:62,:68,:90`) | Port the values. Raise `minRows` to 8,000 and add V3 and V7. |
| `service/nav/SchemeNavSyncService.java` floors (`:126-138`, `:399-470`, `:699-728`) and `SchemeNavSyncScheduler` advisory lock | Port, plus the IDCW-aware jump rule (R3) |
| `service/XirrCalculator.java` and its tests | Port exactly (TypeScript, float64 solve, decimal inputs) |
| `ProductScheme.metadataJson` returns blob (`V3__seed_data.sql:64-72`) | **Drop.** Replaced by `plan_returns`. |
| `ProductCategory` enum (MF/SIF/OTHER/…) | **Drop.** Replaced by `sebi_category`. |

---

## 8. Assumptions (made to avoid TBDs)

1. The job runner is NestJS `@nestjs/schedule` with PostgreSQL advisory locks and outbox events. If the platform spec picks pg-boss or BullMQ, the job table in §5.2 carries over unchanged.
2. Compliance accepts AMFI ingestion pending AMFI's written reply. If AMFI refuses, S1 and S2 switch to the FP NAV feed (S11) through the same `nav_daily.source`.
3. Launch catalogue is about 300 curated Regular schemes (top 10 by AAUM per category, excluding ETFs, closed-ended, interval and legacy solution-oriented funds). Coverage widens when `fp-market` is live.
4. Benchmark return numbers, beta, alpha and tracking error wait for phase 2 (a licensed provider). Launch shows the benchmark name and riskometer only.
5. The risk-free rate is the FBIL Overnight MIBOR monthly average, entered by admin.
6. The tax classification of hybrid, FoF and life cycle schemes is curated per scheme (`tax_classification` fact). Tax-rule logic lives in the tax/statements spec.

---

## Sources (all accessed 2026-09-25 unless dated)

- [SEBI circular HO/24/13/15(2)2026-IMD-RAC4/I/5764/2026, 26-Feb-2026, Categorization and Rationalization of MF Schemes (PDF mirror)](https://www.caalley.com/sebi26/1772079826878.pdf)
- [Truedata: SEBI Mutual Fund Categorisation 2026](https://www.truedata.in/blog/sebi-categorisation-and-rationalisation-of-fund-scheme); [ICICI Direct news on the 2026 reset](https://www.icicidirect.com/mutual-funds/news/mf/sebi-resets-mutual-fund-rulebook,-caps-thematic-overlap-at-50percentage-and-discontinues-solution-oriented-category/1679844)
- AMFI live feeds: [NAVAll.txt](https://portal.amfiindia.com/spages/NAVAll.txt) (NAV date 24-Sep-2026), [NAV history report](https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx), [scheme master](https://portal.amfiindia.com/DownloadSchemeData_Po.aspx?mf=0). Fetched and profiled read-only on 2026-09-25.
- [AMFI Terms of Use](https://www.amfiindia.com/terms-of-use); [AMFI TER page](https://www.amfiindia.com/ter-of-mf-schemes); [AMFI Risk-o-Meter](https://www.amfiindia.com/online-center/risk-o-meter); [AMFI Average AUM](https://www.amfiindia.com/aum-data/average-aum); [AMFI Fund Performance](https://www.amfiindia.com/otherdata/fund-performance)
- [SEBI Master Circular for MFs, Chapter 13 Advertisements (as on 31-Mar-2024), HDFC AMC copy](https://files.hdfcfund.com/s3fs-public/2025-07/SEBI's%20Master%20Circular%20on%20Advertisements%20for%20Mutual%20Funds.pdf?VersionId=z2ThVwZVdYe1WiYlrmZUrWJwaOQ3kf1X); [SEBI Master Circular page, Mar-2026](https://www.sebi.gov.in/legal/master-circulars/mar-2026/master-circular-for-mutual-funds_100491.html)
- [SEBI: Disclosure of risk-o-meter of scheme, benchmark and portfolio (Aug-2021)](https://www.sebi.gov.in/legal/circulars/aug-2021/disclosure-of-risk-o-meter-of-scheme-benchmark-and-portfolio-details-to-the-investors_52262.html); [SEBI: Product labelling, Risk-o-meter (Oct-2020)](https://www.sebi.gov.in/legal/circulars/oct-2020/circular-on-product-labeling-in-mutual-fund-schemes-risk-o-meter_47796.html); [SEBI circular Nov-2024 on expenses, half-yearly returns, yield and risk-o-meter disclosure](https://www.sebi.gov.in/legal/circulars/nov-2024/disclosure-of-expenses-half-yearly-returns-yield-and-risk-o-meter-of-schemes-of-mutual-funds_88230.html)
- [SEBI: Review of time limit for updating NAV on AMFI website](https://www.sebi.gov.in/sebi_data/commondocs/cirimd05_h.html)
- [Upstox: SEBI MF Regulations 2026 highlights (BER, brokerage caps)](https://upstox.com/news/personal-finance/mutual-funds/sebi-mutual-funds-regulations-2026-highlights-lower-expense-ratios-revised-brokerage-limits/article-186377/); [Cafemutual: new expense-ratio framework from 1-Apr-2026](https://cafemutual.com/news/industry/37012-sebis-new-expense-ratio-framework-here-is-what-changes-after-april-1-2026); [Value Research: SEBI MF Regulations 2026](https://www.valueresearchonline.com/learn/mutual-funds/sebi-mutual-fund-regulations-2026/)
- [Cafemutual: AMFI tier-1 benchmark list](https://cafemutual.com/news/industry/23378-amfi-releases-tier-1-benchmark-list-for-mutual-fund-schemes); [NSE Index Licensing](https://www.nseindia.com/static/nse-indices/index-licensing) (page timed out; licensing terms taken from search summaries)
- [HSBC MF: Disclosure of risk parameters (AMFI best-practice circulars 61/64)](https://www.assetmanagement.hsbc.co.in/assets/documents/mutual-funds/en/9af31509-520f-496f-b882-c199283c7d7f/disclosure-of-risk-parameters-may-26.pdf)
- [FintechPrimitives MF market data API](https://fintechprimitives.com/mutual_fund_market_data_api.html); [FP data schema](https://docs.fintechprimitives.com/data/data-schema/)
- [MFapi.in](https://www.mfapi.in/); [captn3m0/historical-mf-data](https://github.com/captn3m0/historical-mf-data); [TigZig MF NAV API](https://www.tigzig.com/apis/mf-nav); [Accord Fintech data feeds](https://www.accordfintech.com/data-feed-solutions)
- v1 code (read-only): `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/integration/nav/AmfiNavParser.java`, `.../integration/nav/NavFeedProperties.java`, `.../integration/nav/AmfiNavFeedClient.java`, `.../service/nav/SchemeNavSyncService.java`, `.../service/XirrCalculator.java`, `.../repository/ProductSchemeRepository.java`; FP exports `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/exports/finprim-direct-fund-schemes-20260514051017.json` and `.../cybrilla-poa-fund-schemes-20260514-051817.json`; prior slice report `map:be-portfolio-catalogue` and the synthesis brief.
