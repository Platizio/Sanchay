<!-- source: workflow wf_1d1c9b02-593 label research:rules-money (brand-renamed) | exported 2026-09-28 -->

# Platizio v1 money logic: port-ready specifications for the v2 TypeScript rewrite

**Scope.** This covers every item in the task. It uses the Java sources and their JUnit tests under `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src`. I read everything and wrote nothing.

**How I got the numbers.**
- Every expected value marked **[T]** is copied from a v1 test.
- Values marked **[C]** I computed by hand from the Java arithmetic.
- Values marked **[J]** come from running a line-for-line JavaScript version of `XirrCalculator` in `node -e`. It wrote no files. Java and JS doubles are both IEEE-754, so expect agreement to about 1e-12.

**Prompt injection.** I found no text in the files I read that tries to steer an automated analysis. The comments are long design notes, not directives.

**Path shorthand.**
- `B` = `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech`
- `T` = `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/test/java/com/platizio/wealthtech/service`
- `M` = `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/resources/db/migration`

---

## 0. Porting conventions

**Decimal library.** Use `decimal.js` or `big.js`. Never use JS `number` for money, units or NAV. The only exception is XIRR, which is `double` in v1.

**Rounding-mode mapping (Java `RoundingMode` → decimal.js):**

| Java | decimal.js | Meaning |
|---|---|---|
| `HALF_UP` | `ROUND_HALF_UP` | Ties go away from zero |
| `UP` | `ROUND_UP` | Away from zero |
| `DOWN` | `ROUND_DOWN` | Truncate |
| `CEILING` | `ROUND_CEIL` | Towards +infinity |

**Java BigDecimal behaviours the port must reproduce:**
- `a.multiply(b)` has scale = scale(a) + scale(b) and is **not rounded**. Rounding only happens at an explicit `setScale` or `divide(x, scale, mode)`.
- `compareTo` ignores scale (100 == 100.0000). `signum()` returns -1, 0 or 1.

**Clocks and dates.** v1 mixes clocks: `LocalDate.now()` uses the server's default time zone, while `SchemeNavResolver` uses UTC. v2 should use **Asia/Kolkata calendar dates** everywhere (see bug B-16). Day counts are calendar-day differences between ISO dates (`ChronoUnit.DAYS.between`).

**DB column precision in v1** (V1 baseline):

| Column | Precision | Source |
|---|---|---|
| `transaction_orders.amount` | numeric(18,2) | `M/V1__baseline_schema.sql:140` |
| `transaction_orders.units` | numeric(18,4) | `:141` |
| `redemption_records.units` | numeric(18,4) | `:163` |
| `redemption_records.amount` | numeric(18,2) | `:164` |
| `allotment_nav`, `stamp_duty` | numeric(20,4) | `M/V68__add_order_allotment_fields.sql:5,7` |
| `scheme_navs.nav`, `previous_nav` | numeric(20,6) | `M/V74__create_scheme_navs.sql:64,66` |

---

## 1. Summary table

| ID | Rule | Source | Confidence |
|---|---|---|---|
| XIRR-01..10 | Money-weighted return: Newton-Raphson, bisection fallback, null conditions | `B/service/XirrCalculator.java:27-206` | High |
| NAV-01..04 | NAV quote resolution, freshness FRESH/AGED/UNDATED, 7-day inclusive bound | `B/service/nav/NavQuote.java`, `B/service/nav/SchemeNavResolver.java:155-294` | High |
| HLD-01..14 | Dashboard holdings: net units, weighted-average cost, invested incl. unallotted, value/grade, returns, totals, coverage, portfolio XIRR | `B/service/HoldingsService.java:69-676` | High |
| PH-01..05 | Withdrawal-screen holdings, one row per order | `B/service/PortfolioService.java:312-491` | High |
| RED-01..09 | Redemption availability: share of holding, rounding UP scale 8, rupee ceiling scale 4, draft guards | `B/service/RedemptionAvailability.java:67-239`, `B/service/OrderService.java:1362-1645` | High |
| STD-01 | Stamp duty 0.005%, rounded half-up to 2 dp | `B/service/OrderService.java:72,831-837` | High (formula); Medium (regulatory basis) |
| ALT-01..04 | Allotment NAV and derived units on completion | `B/service/OrderService.java:820-943` | High |
| UNT-01..06 | Units provenance: PROVIDER / DERIVED / MANUAL / null | `M/V75__add_order_units_provenance.sql`, `B/domain/TransactionOrder.java:28-62,200-202`, `OrderService.java:912-931` | High |
| CG-01..11 | Capital gains: FY parse, FIFO lots, holding period, grandfathering, rounding, CSV | `B/service/CapitalGainsReportService.java:44-548` | High (code); Low (tax-law currency) |
| SIP-01..07 | SIP create/edit validation, instalment-day shift | `B/service/OrderService.java:2104-2230` | High |
| MND-01 | Mandate limit = max(Rs 1,00,000, ceil(2 × instalment)) | `B/service/InvestorActionService.java:1014-1019` | High |

---

## 2. XIRR (`B/service/XirrCalculator.java`)

**Constants** (`:30-35`):

| Constant | Value |
|---|---|
| `NPV_TOLERANCE` | 1e-7 (absolute, in currency units) |
| `MAX_NEWTON_ITERATIONS` | 100 |
| `MAX_BISECTION_ITERATIONS` | 200 |
| `DAYS_PER_YEAR` | 365.0 |
| `MIN_RATE` | -0.999999999 |
| Newton seed | 0.1 (`:84`) |
| Flat-derivative threshold | 1e-12 (`:94`) |
| Newton step-size stop | 1e-12 (`:101`) |
| Newton post-loop acceptance | abs(NPV) < 1e-4 (`:108`) |
| Bisection initial high | 1.0 (`:123`) |
| Bracket expansion | high × 2.0, at most 100 times (`:126-132`) |
| Bisection width stop | (high − low)/2 < 1e-12 (`:144`) |

- **XIRR-01 (input mapping, `:189-201`).** `computeDecimal(null)` returns null. Entries with a null date or null amount are **skipped**. Amounts become `double` via `BigDecimal.doubleValue()`. The result is then passed to `compute`.
- **XIRR-02 (null guards, `:48-74`).** The result is null when:
  - the list is null or has fewer than 2 entries; or
  - after sorting by date there is no amount > 0, or no amount < 0; or
  - every date equals the earliest date.

  An amount of exactly 0 counts as neither positive nor negative, **but it still counts toward the date span** (see bug B-01).
- **XIRR-03 (NPV, `:157-168`).** `base = 1 + r`. If `base <= 0` the result is NaN. Otherwise NPV = Σ cf / base^(days/365), where `days` = days from the earliest date to the cashflow date. The derivative (`:170-182`) is Σ −y·cf / base^(y+1).
- **XIRR-04 (Newton, `:83-112`).** Start at r = 0.1. Repeat up to 100 times:
  1. If NPV is not finite, return null (hand off to bisection).
  2. If abs(NPV) < 1e-7, return r.
  3. If the derivative is not finite or abs(derivative) < 1e-12, hand off.
  4. Compute next = r − NPV/derivative. If next is not finite or next ≤ MIN_RATE, hand off.
  5. If abs(next − r) < 1e-12, set r = next and stop the loop.
  6. Otherwise set r = next.

  After the loop, return r only if abs(NPV(r)) < 1e-4. Otherwise hand off.
- **XIRR-05 (bisection, `:118-155`).**
  1. Set low = MIN_RATE, high = 1.0.
  2. While both NPVs are finite, have the same sign (`Math.signum`, and 0 counts as its own sign), and fewer than 100 expansions have run: double `high`.
  3. If either NPV is not finite or the signs are still equal, return null.
  4. Run up to 200 halving steps: if mid's NPV is not finite, return null. If abs(NPV(mid)) < 1e-7 or the half-width < 1e-12, return mid. If sign(NPV(mid)) equals sign(NPV(low)), move low to mid and update NPV(low); otherwise move high to mid.
  5. After 200 steps, return (low + high)/2.
- **XIRR-06.** The result is never NaN or Infinity: every path either returns a finite value or null. Callers must treat null as "unavailable", never as 0% (`:22-25`).

**Test vectors** (`T/XirrCalculatorTest.java`):

| # | Cashflows | Expected | Actual (JS port) |
|---|---|---|---|
| V1 [T] `:26-33` | 2024-01-01 −1000; 2024-12-31 +2000 (365 days) | ≈ 1.0 ± 1e-3 | 0.9999999999840 via Newton, 5 iterations [J] |
| V2 [T] `:46-61` | 2022-01-01 −1000; 2023-01-01 −1000; 2024-01-01 +2210 | x = (−1 + √9.84)/2 − 1 ± 1e-3; NPV at result ± 1e-2 | 0.0684387141 via Newton [J]. Closed form 0.0684387141358 [C] |
| V3 [T] `:68-75` | 2024-01-01 −2000; 2024-12-31 +1000 | ≈ −0.5 ± 1e-3 | −0.50000000000670. **The first Newton step leaves the valid domain, so the bisection path produces this answer** [J] |
| V4 [T] `:78-83` | `[]`; one cashflow; `null` | null | |
| V5 [T] `:86-93` | two negatives, or two positives | null | |
| V6 [T] `:96-100` | −1000 and +1500 on the same day | null | |
| V7 [T] `:103-111` | 2024-01-01 −1,000,000; 2024-12-31 +1 | finite, not null | −0.99999899999920 via bisection [J] |

Note on V2: the test comment says "≈ 0.0681 (6.81%)" at `:43,48`. That is an arithmetic slip; the true root is 0.06844. The test still passes because it asserts against the formula, not the comment.

**Additional vectors I recommend adding to the TS golden set [J]:**
- 2025-01-01 −10000; 2025-07-02 +10500 → 0.1027955954 (Newton).
- Six SIP flows of −5000 on the 5th of Jan–Jun 2025, then 2025-09-25 +32000 → 0.1332738456.
- 2024-01-01 −100; 2024-01-31 +1000 → 1.4678e12. v1 returns this unguarded (see SME question Q-1).
- −1000 and +1000 on 2024-01-01, plus 0 on 2024-12-31 → **v1 returns 0.1** (bug B-01).

---

## 3. NAV quote and freshness (inputs to valuation)

- **NAV-01 (resolution, `B/service/nav/SchemeNavResolver.java:258-294`).** The ISIN is normalised by trimming and upper-casing (`B/domain/SchemeNav.java:133-139`).
  1. Use the row in `scheme_navs` for that ISIN if it exists, is not quarantined (`:248`) and has nav > 0.
  2. Otherwise fall back to `product_schemes.metadata_json["nav"]` if it is > 0. This fallback is always source SEEDED.
  3. Otherwise there is no quote.
  - The as-of date is taken from the first present field among `nav_date, navDate, nav_as_of, navAsOf, as_of`, parsed as an OffsetDateTime. A parse error gives null.
  - The previous NAV is the first field > 0 among `previous_nav, previousNav, prev_nav, prevNav, nav_previous, prev_day_nav, previousDayNav, nav_t1, last_nav` (`:65-71, 302-324`).
- **NAV-02 (freshness, `B/service/nav/NavQuote.java:84-104`).**
  - UNDATED if the quote is stale or the NAV date is null. UNDATED takes precedence.
  - AGED if `isAged` is true.
  - Otherwise FRESH.
  - `isAged` = daysBetween(navDate, evaluatedOn) > maxNavAge.toDays(). The bound is **inclusive**: an age of exactly N days is still FRESH. A null, zero or negative bound disables the check. A null date disables it too.
  - `maxNavAge` defaults to 7 days (`B/integration/nav/NavFeedProperties.java:233`).
  - "Today" is `LocalDate.now(Clock.systemUTC())` (`SchemeNavResolver.java:97,112,143-145`).
- **NAV-03 (history "as of", `:215-241`).** Returns the most recent `scheme_nav_history` row with nav_date ≤ date and nav > 0. The source defaults to AMFI_HISTORY. There is no metadata fallback.
- **NAV-04 (which sources may be used to compute units, `B/domain/SchemeNav.java:84-86`).** AMFI, AMFI_HISTORY and PROVIDER may. MANUAL and SEEDED may not.

**Vectors** (fixed clock 2026-08-26, bound 7, from `T/HoldingsServiceNavAgeTest.java:66-73`):

| NAV date | Age | Freshness |
|---|---|---|
| 2026-08-24 [T] | 2 days | FRESH |
| 2026-08-19 [C] | 7 days | FRESH |
| 2026-08-18 [C] | 8 days | AGED |
| 2026-05-20 [T] | 98 days | AGED |
| 2030-01-01 [C] | −1224 days | **FRESH** (future-dated NAV is not flagged; bug B-15) |
| any, with bound 0 [T] `:200-209` | – | never AGED |

---

## 4. Investor dashboard holdings (`B/service/HoldingsService.java`)

**Constants** (`:69-92`):

| Constant | Value |
|---|---|
| `HELD_STATUSES` | SUCCESSFUL, COMPLETED, ACTIVE |
| `PURCHASE_TYPES` | PURCHASE, LUMPSUM_PURCHASE, SIP |
| `UNIT_OPTIONAL_TYPES` | PURCHASE, LUMPSUM_PURCHASE |
| `UNIT_SCALE`, `NAV_SCALE` | 4 |
| `MONEY_SCALE`, `PERCENT_SCALE` | 2 |
| Percent intermediate `divide` | scale 6, HALF_UP |
| `expose-derived-units` flag | default false (`NavFeedProperties.java:258`) |

- **HLD-01 (which orders are lots, `:420-434`).** An order is a lot when it has a scheme, a purchase type and a held status, and either:
  - units > 0; or
  - its type is PURCHASE/LUMPSUM_PURCHASE and amount > 0.

  A SIP with no units is **not** a lot. Lots are grouped per scheme, in insertion order.
- **HLD-02 (redemptions, `:145-147, 178-184, 437-443`).** Only redemption records with status **SUCCESSFUL** count. Each maps to the scheme of the order in its `orderId`. Unknown or unmapped records are ignored.
- **HLD-03 (lot classification, `:541-583`).**
  - `allotted` = units > 0.
  - `hiddenEstimate` = the flag is off AND `hasEstimatedUnits()` is true.
  - `disclosable` = allotted AND not a hidden estimate.
  - `unitsComplete` = every lot is disclosable.
  - `anyPendingAllotment` = some lot is not allotted.
  - `anyEstimatedUnits` = some lot has estimated units (the flag does not matter here).
- **HLD-04 (sums, `:485-514`).**
  - `totalPurchaseUnits` = Σ units of lots that are not hidden estimates.
  - `totalRedeemedUnits` = Σ non-null redemption units.
  - `netUnits` = totalPurchaseUnits − totalRedeemedUnits. **This can go negative.**
  - `allottedUnits` = Σ units of allotted lots, whatever their provenance.
- **HLD-05 (closed position, `:537-539`).** A position is closed, and the row is dropped entirely, when there is no pending allotment AND allottedUnits − totalRedeemedUnits ≤ 0.
- **HLD-06 (cost basis, `:586-627`).**
  - `averageCostNav` = Σ amount over disclosable lots ÷ totalPurchaseUnits, divided at scale 4 HALF_UP. It is null when totalPurchaseUnits ≤ 0.
  - `investedCostForHeldUnits` = averageCostNav × netUnits. It is 0 if netUnits ≤ 0 or the average is null.
  - `unallottedInvested` = Σ amount over non-disclosable lots.
  - `invested` = (investedCostForHeldUnits + unallottedInvested), set to scale 2 HALF_UP (`:221-223`).
- **HLD-07 (valuation and grade, first match wins, `:229-281`).** `effectiveNav` = the market NAV, or else averageCostNav (a fallback that values the holding **at cost**).

  | # | Condition | currentValue | grade / reason |
  |---|---|---|---|
  | 1 | not unitsComplete | null | UNAVAILABLE / UNITS_PENDING_ALLOTMENT if any lot is pending, else UNITS_ESTIMATED |
  | 2 | effectiveNav null | null | UNAVAILABLE / NAV_UNAVAILABLE |
  | 3 | no market NAV, or no as-of, or UNDATED | effectiveNav × netUnits, 2 dp HALF_UP | STALE / NAV_STALE |
  | 4 | AGED | same | STALE / NAV_AGED |
  | 5 | anyEstimatedUnits (only reachable with the flag on) | same | ESTIMATED / UNITS_ESTIMATED |
  | 6 | otherwise | same | OK / null |

- **HLD-08 (returns, `:283-301`).**
  - `absoluteReturn` = cv − invested (2 dp). Null if cv is null.
  - `percentReturn` = ((cv − inv) ÷ inv at scale 6 HALF_UP) × 100, then 2 dp HALF_UP. Null if cv is null or inv = 0.
  - `oneDayReturn` = (nav − prevNav) × netUnits (2 dp). `oneDayReturnPercent` = (delta ÷ prev at scale 6) × 100, then 2 dp. Both require unitsComplete, a market NAV, and prevNav > 0; otherwise null, never 0.
- **HLD-09 (per-holding XIRR, `:304-310, 634-653`).**
  - Each disclosable lot with an amount and `createdAt` becomes a cashflow of −amount on `createdAt.toLocalDate()`.
  - Each counted redemption with an amount and `createdAt` becomes +amount.
  - When cv ≠ 0, add +cv dated today (`LocalDate.now()`, server time zone).
  - XIRR is null when cv is null.
- **HLD-10 (display fields, `:317-344`).**
  - `units` = netUnits at 4 dp HALF_UP, or null if not unitsComplete.
  - `latestNav` = effectiveNav at 4 dp if unitsComplete, else the market NAV at 4 dp. **When there is no market quote this shows the average-cost NAV** (bug B-12).
  - `avgCostNav` = shown only if unitsComplete.
  - `unallottedInvested` = shown only if > 0, at 2 dp.
- **HLD-11 (sort, `:360-363`).** By currentValue descending, with null treated as −1. Ties go by schemeName ascending, nulls last.
- **HLD-12 (totals, `:365-382`).**
  - `totalInvested` = Σ invested.
  - `investedValued` = Σ invested over rows with cv ≠ null.
  - `unvaluedInvested` = totalInvested − investedValued, each rounded to 2 dp first.
  - `totalCurrentValue` = Σ cv, or null if no row is valued.
  - `totalReturn` and `totalReturnPercent` are measured **against investedValued**, not totalInvested. Same formula as HLD-08.
  - `totalOneDayReturn` = Σ non-null values, or null.
- **HLD-13 (coverage and portfolio XIRR, `:384-390`).**
  - `fullCoverage` = valuedHoldings == totalHoldings AND totalHoldings > 0.
  - `portfolioXirr` is computed only when fullCoverage holds, from every valued holding's flows plus each cv dated today. Otherwise null.
  - The coverage label is UNAVAILABLE if valuedHoldings = 0, OK if fullCoverage, else PARTIAL.
- **HLD-14 (empty dashboard, `:140-142, 408-418`).** A null investor gives holdings `[]`. totalInvested, investedValued and unvaluedInvested are 0.00, counts are 0, coverage is UNAVAILABLE, and every other total is null.

**Test vectors:**

| # | Setup | Expected |
|---|---|---|
| H1 [T] `T/HoldingsServiceTest.java:114-142` | 100 units, ₹1000, created 365 days ago; metadata nav 20.0, nav_date 2030-01-01, prev 19.5 | units 100; latestNav 20.0000; invested 1000.00; cv 2000.00; abs 1000.00; pct 100.00; OK; 1-day 50.00; xirr ≈ 1.0 ± 0.05; totals 1000.00 / 2000.00; portfolioXirr ≈ 1.0 |
| H2 [T] `:145-160` | 100 units / ₹1000, SUCCESSFUL redemption of 40 units / ₹900; nav 15 | units 60; cv 900.00 |
| H3 [T] `:163-179` | 100 units / ₹1000; no NAV at all | cv 1000 (100 × avg 10); abs 0; STALE (value at cost) |
| H4 [T] `:182-193` | 50 units / ₹500; nav 12, no as-of | cv 600.00; STALE; oneDayReturn null |
| H5 [T] `:196-208` | 100 units bought, 100 units redeemed SUCCESSFUL | holdings `[]` |
| H6 [T] `:211-221` | status PENDING_INVESTOR_ACTION | `[]`; totalInvested 0.00 |
| S1 [T] `T/HoldingsServiceSafetyNetTest.java:76-101` | LUMPSUM, units null, ₹50000, no NAV | invested 50000.00; unallotted 50000.00; units, cv, abs, pct, xirr all null; UNAVAILABLE / UNITS_PENDING_ALLOTMENT; totals: invested 50000.00, cv null, coverage UNAVAILABLE |
| S2 [T] `:104-139` | same, with live nav 25.5 | cv null (**not** 0); latestNav 25.5; navAsOf present; UNITS_PENDING_ALLOTMENT |
| S3 [T] `:157-174` | lot A 100 units / ₹1000 plus lot B units null / ₹500; nav 20 | invested 1500.00; unallotted 500.00; units null; cv null; UNAVAILABLE |
| S4 [T] `:191-199` | ACTIVE SIP, units null, ₹5000 | `[]` |
| S5 [T] `:202-234` | scheme 1: 100 units / ₹1000 at nav 20; scheme 2: unallotted ₹5000 | totalInvested 6000.00; investedValued 1000.00; unvalued 5000.00; cv 2000.00; totalReturn 1000.00; pct 100.00; valued 1 of 2; PARTIAL; portfolioXirr null |
| G1 [T] `T/HoldingsServiceGhostRowTest.java:84-96` | DERIVED 1249.9375 units / ₹50000, flag off; SUCCESSFUL redemption of 1249.9375 units | `[]`; totalInvested 0.00; unvalued 0.00; coverage UNAVAILABLE. Same result with the flag on (`:105-114`) and when 1250 units are redeemed (`:121-126`) |
| G2 [T] `:136-154` | same lot, 249.9375 units redeemed | 1 row; units null; cv null; UNAVAILABLE / UNITS_ESTIMATED; **invested 50000.00** (known overstatement) |
| G3 [T] `:162-176` | PROVIDER 100 units / ₹1000, fully redeemed, plus a pending ₹500 lot | row kept; UNITS_PENDING_ALLOTMENT; invested 500.00 |
| G4 [T] `:196-203` | redemption status PROCESSING | not an exit; row kept |
| E1 [T] `T/HoldingsServiceEstimatedUnitsTest.java:70-87` | DERIVED 1249.9375 / ₹50000, flag off, nav 40 | units null; cv null; UNAVAILABLE / UNITS_ESTIMATED; invested 50000.00; unallotted 50000.00; latestNav 40.0000 |
| E2 [T] `:110-132` | PROVIDER 100 / ₹1000 in scheme 1 plus DERIVED ₹50000 in scheme 2, flag off | totalInvested 51000.00; investedValued 1000.00; unvalued 50000.00; cv 4000.00; PARTIAL |
| E3 [T] `:178-189` | DERIVED lot, flag on | units 1249.9375; cv 49997.50; ESTIMATED / UNITS_ESTIMATED; unallotted null |
| E4 [T] `:197-205` | flag on, nav with no as-of | STALE / NAV_STALE (outranks ESTIMATED) |
| A1 [T] `T/HoldingsServiceNavAgeTest.java:93-110` | PROVIDER 100 / ₹1000; stored AMFI nav 25.3631 dated 2026-05-20; clock 2026-08-26 | STALE / NAV_AGED; cv 2536.31; units 100.0000; navAsOf 2026-05-20T00:00Z |
| A2 [T] `:117-126` | nav dated 2026-08-24 | OK; cv 2536.31 |
| A3 [T] `:181-192` | aged | still counts as valued; coverage OK |
| C1 [C] | lots 100u / ₹1000 and 50u / ₹750; SUCCESSFUL redemption of 60u; FRESH nav 14.2 | avg 11.6667; net 90; invested 1050.00 (1050.003 → 1050.00); cv 1278.00; abs 228.00; pct 21.71 (0.217143 × 100) |
| C2 [C] (bug B-11) | one lot, 12345.6789 units, ₹10,00,000.00, no redemptions | avg 81.0000; **invested 999999.99** (1 paisa short) |

---

## 5. Withdrawal-screen holdings (`B/service/PortfolioService.java:312-491`)

- **PH-01 (one row per order, `:477-491`).** Eligibility matches HLD-01: statuses SUCCESSFUL/COMPLETED/ACTIVE, a purchase type, and either units > 0 or (PURCHASE/LUMPSUM with amount > 0).
- **PH-02 (per-order availability, `:356-374`).**
  - `grossUnits` = units if > 0, else null.
  - `amountBasis` = RED-01 applied to (grossUnits, latest NAV, order amount).
  - `blockedUnits` and `availableUnits` come from RED-02 and RED-03, using this order's redemption records of any status.
- **PH-03 (grade, `:379-425`).**
  - `disclosedUnits` = null if the units are estimated and the flag is off; otherwise availableUnits.
  - The branches are: disclosed null → UNAVAILABLE (UNITS_ESTIMATED if hidden, else UNITS_PENDING_ALLOTMENT); nav null → UNAVAILABLE / NAV_UNAVAILABLE; no as-of or UNDATED → STALE / NAV_STALE; AGED → STALE / NAV_AGED; estimated → ESTIMATED; else OK.
  - currentValue = nav × disclosed units, **with no rounding** (bug B-13).
  - Unlike the dashboard, there is **no at-cost fallback** here (bug B-12).
- **PH-04 (redeemable, `:434-438`).** True when the scheme row exists, `externalOrderId` is non-blank, the status is not CANCELLED, and availableUnits > 0. The flag does not affect this: estimated holdings remain redeemable.
- **PH-05 (sort, `:466-467`).** By orderId (a UUID) descending. The resulting order is effectively random.

**Test vectors** (`T/PortfolioServiceHoldingsTest.java`):

| Setup | Expected |
|---|---|
| 100 units, nav 25.5 dated 2026-06-20, amount 99999 [T] `:65-80` | OK; cv 2550.0; available 100; redeemable |
| 10 units, nav 12, no date [T] `:86-96` | STALE; cv 120 |
| units null, amount 50000 [T] `:99-119` | invested 50000; cv null; available null; UNAVAILABLE; not redeemable |
| 10 units, no NAV [T] `:166-178` | UNAVAILABLE; cv null; latestNav null |
| 100 units, nav 10; redemptions 20 PROCESSING, 30 BANK_CREDIT_COMPLETED, 5 FAILED [T] `:201-218` | blocked 20; available 50; **cv 500** (50 × 10) |
| 40 units, 40 redeemed SUCCESSFUL [T] `:221-233` | available 0; not redeemable |

---

## 6. Redemption availability and the draft ceiling

**Constants** (`B/service/RedemptionAvailability.java:76-98`):

| Constant | Value |
|---|---|
| `SETTLED_OUT` statuses | SUCCESSFUL, BANK_CREDIT_COMPLETED |
| `BLOCKING` statuses | CREATED, PENDING_INVESTOR_ACTION, SUBMITTED, PROCESSING, BANK_CREDIT_PENDING |
| FAILED | in neither set, so its share is released |
| `UNIT_SCALE` | 8 |
| `MONEY_SCALE` | 4 |

- **RED-01 (`amountBasis`, `:111-118`).** If units > 0 and nav > 0, basis = nav × units (unrounded). Otherwise basis = invested amount if > 0, else null.
- **RED-02 (`consumed`, `:199-230`).** For each record whose status is in the given set:
  - if the record has units > 0, add them;
  - otherwise, if the amount > 0 and gross and basis are both known, add gross × amount ÷ basis, **divided at scale 8, RoundingMode.UP**;
  - otherwise mark the whole set as `unsizeable`.
- **RED-03 (`availableUnits`, `:146-160`).** Null if gross ≤ 0 or null. Null if either the blocking or the settled set is unsizeable. Otherwise max(0, gross − blocked − settled).
- **RED-04 (`availableAmount`, `:171-190`).**
  - Null if availableUnits is null.
  - **0** if basis is null. This refuses the request rather than permitting it.
  - The basis itself if available ≥ gross.
  - Otherwise max(0, basis × available ÷ gross), divided at scale 4 HALF_UP.
- **RED-05 (draft guard order, `B/service/OrderService.java:1362-1473`).** Checks run in this order:
  1. Ownership (`:1379`, `:1505-1542`).
  2. `externalOrderId` is non-blank, else IllegalState (`:1383-1389`).
  3. units > 0, else IllegalState "no allotted unit count" (`:1390-1396`).
  4. If this is **not** a full redemption and `hasEstimatedUnits()` is true, IllegalState, whatever the mode (`:1425-1436`).
  5. If not full, the value must be > 0 (`:1443-1446`), then RED-06 applies.
- **RED-06 (ceiling, `:1569-1624`).**
  - availableUnits null → IllegalArgument ("no unit count to redeem against").
  - **UNITS mode:** refuse if value > availableUnits. The boundary is inclusive, so a value equal to availableUnits is accepted.
  - **AMOUNT mode** (also used when the mode is null): refuse if value > availableAmount.
  - The error message contains "larger than the holding" plus the `toPlainString()` of the value and of the ceiling.
  - The basis uses `navResolver.latest` (the market NAV; stale or aged is still used, `:1643-1665`).
- **RED-07 (record written, `:1450-1467`).** Status is PENDING_INVESTOR_ACTION.
  - Full redemption: amount = order.amount (the **cost**, not the proceeds) and units = order.units. The full path is **not bounded** by the ceiling.
  - UNITS: units = value, amount = null.
  - AMOUNT: amount = value, units = null. Nothing ever backfills the missing field later (confirmed: the only `setAmount`/`setUnits` calls on a redemption record are at `:1460-1466`).
- **RED-08 (submit guard, `:1855-1892`).** At submit time, any holding whose order has estimated units is refused, including a full exit.
- **RED-09.** v1 validates all of this **before** creating the 2FA challenge. Keep that ordering in v2 (it fixes brief item (c)).

**Test vectors** (holding 412.5 PROVIDER units, ₹50000, no NAV, so basis = 50000; `T/OrderServiceAmountRedemptionConsumptionTest.java`):

| Existing redemptions | Request | Result |
|---|---|---|
| AMOUNT 30000 drafted [T] `:89-106` | AMOUNT 30000 | refused, message contains "20000" |
| AMOUNT 30000 drafted [T] `:109-119` | AMOUNT 20000 | accepted |
| AMOUNT 25000 [T] `:123-138` | UNITS 206.26 | refused, message contains "206.25"; UNITS 206.25 accepted |
| UNITS 206.25 [T] `:141-152` | AMOUNT 25000.01 | refused; 25000 accepted |
| AMOUNT 50000 BANK_CREDIT_COMPLETED [T] `:157-172` | UNITS 412.5 or AMOUNT 1 | both refused, nothing written |
| AMOUNT 20000 PENDING_INVESTOR_ACTION [T] `:178-189` | UNITS 247.51 | refused (consumed 165 → available 247.5); 247.5 accepted |
| AMOUNT 50000 FAILED [T] `:194-211` | UNITS 412.5 or AMOUNT 50000 | accepted |
| none [T] `:229-236` | full redemption | amount 50000, units 412.5 |
| AMOUNT 20000 PENDING [T] `:254-280` | screen view | available 247.5; blocked 165; redeemable |

Holding 1000 PROVIDER units, ₹50000 (`T/OrderServiceRedemptionCeilingTest.java`):

| Setup / request | Result |
|---|---|
| UNITS 1000.0001 [T] `:73-83` | refused; 1000 accepted (`:101-113`) |
| nav 40 (basis 40000), AMOUNT 45000 [T] `:117-130` | refused; 40000 accepted |
| no NAV, AMOUNT 50000.01 [T] `:145-156` | refused; 50000 accepted |
| 400 PENDING, UNITS 600.0001 [T] `:197-212` | refused; 600 accepted |
| 250 SUCCESSFUL, UNITS 750.01 [T] `:215-225` | refused |
| any BLOCKING or SETTLED status with 900 units, UNITS 150 [T] `:232-245` | refused |
| 900 FAILED, UNITS 1000 [T] `:248-257` | accepted |
| 600 SUBMITTED, no NAV, AMOUNT 20000.01 [T] `:260-275` | refused; 20000 accepted |
| 1000 BANK_CREDIT_COMPLETED, UNITS 0.0001 or AMOUNT 1 [T] `:278-289` | both refused |

**Rounding vector [C].** gross 100, basis 30000, one BLOCKING AMOUNT redemption of 10000:
- consumed = 33.33333334 (rounded UP)
- available = 66.66666666
- availableAmount = 19999.999998 → 20000.0000 (4 dp)
- UNITS 66.6667 is refused; 66.6666 is accepted. See bug B-07 on the scale mismatch.

---

## 7. Stamp duty and allotment (`B/service/OrderService.java:820-943`)

- **STD-01 (`:72, 831-837`).**
  - Applies only when the status is SUCCESSFUL/COMPLETED, the type is PURCHASE, LUMPSUM_PURCHASE or SIP (`:86-91`), and amount > 0.
  - If `stampDuty` is null it is set to amount × 0.00005, rounded to scale 2 HALF_UP. An existing value is kept.
  - `netInvested` = amount − stampDuty.
- **Vectors:**

  | Amount (₹) | Stamp duty (₹) |
  |---|---|
  | 50000 [T] `T/OrderServiceAllotmentNavSourceTest.java:82` | 2.50 |
  | 5000 [C] (also used as a fixture in `T/nav/NavBackfillServiceTest.java:333`) | 0.25 |
  | 1000 [C] | 0.05 |
  | 500 [C] | 0.03 (0.025, rounded half-up) |
  | 100 [C] | 0.01 |
  | 99 [C] | 0.00 |
  | 12345.67 [C] | 0.62 |
  | 1,00,00,000 [C] | 500.00 |

- **ALT-01 (allotment date, `:846-849`).** If absent, set to now. The market day is the IST date of the allotment date (`:1012-1015`).
  - [T] `:219-234`: 2026-08-25T19:30Z is looked up as 2026-08-26.
- **ALT-02 (allotment NAV precedence, `:858-894`).**
  1. The existing order `allotmentNav` if > 0.
  2. The provider NAV, from the first present field among `allotted_nav, allotment_nav, nav, purchase_nav, price` (`:1018-1020`).
  3. The history NAV "as of" the allotment day (NAV-03), only if the source can derive units (NAV-04).
  4. Reverse-derived: netInvested ÷ existingUnits at scale 4 HALF_UP, **only when those units are not estimated**.

  The result is stored at 4 dp HALF_UP, and only when it is allowed to derive units (so SEEDED and MANUAL NAVs are never stored).
- **ALT-03 (units, `:912-931`).**
  - Provider units come from `allotted_units, units, allotment_units`. If they are > 0 and the order has no units or only estimated units, set units = providerUnits at 4 dp HALF_UP, source PROVIDER, and clear the two derived-audit columns.
  - Otherwise, if the order has no units and a derivable NAV is available, set units = net ÷ nav at **scale 4 HALF_UP**, source DERIVED, with the NAV date and derivation time recorded.
- **ALT-04 (folio, `:933-942`).** Provider folio from `folio_number, folio, folio_no`; else `externalOrderId`.

**Vectors** (₹50000 order, net 49997.50):

| Case | Expected |
|---|---|
| AMFI nav 52.34 [T] `:88-103` | allotmentNav 52.3400; units 955.2446 |
| AMFI_HISTORY 40.00 on the allotment date [T] `:107-122` | 1249.9375 |
| provider NAV 25 [T] `:174-185` | allotmentNav 25.0000; units 1999.9000 |
| existing units 1000 (PROVIDER or legacy) [T] `:272-283` | allotmentNav 49.9975 |
| SEEDED or MANUAL NAV, or no NAV [T] `:71-83, 146-171, 287-295` | units null; allotmentNav null; stamp duty still 2.50 |
| allotted on a holiday, 15 Aug 2026 [T] `T/OrderServiceUnitsProvenanceTest.java:93-106` | derived NAV date = 2026-08-14 |

---

## 8. Units provenance (`M/V75__add_order_units_provenance.sql`, `B/domain/TransactionOrder.java`)

- **UNT-01.** Allowed values are PROVIDER, DERIVED, MANUAL or null. This is enforced by the DB check `chk_transaction_orders_units_source` (V75 `:82-84`).
- **UNT-02.** A DERIVED row must have both `units_derived_nav_date` and `units_derived_at` set (DB check, V75 `:91-94`).
- **UNT-03 (`isEstimate`).** True for everything except PROVIDER (`TransactionOrder.java:60-62`). `hasEstimatedUnits()` = units present AND source present AND source is an estimate (`:200-202`). **A null source counts as trusted** (legacy data).
- **UNT-04 (supersession).** PROVIDER may overwrite DERIVED or MANUAL. DERIVED never overwrites PROVIDER or legacy counts. When a PROVIDER count replaces an estimate, the audit columns are cleared (`OrderService.java:914-921`).

  | Case | Result |
  |---|---|
  | derived 1249.9375, then provider 1251.0034 [T] `T/OrderServiceUnitsProvenanceTest.java:127-140` | 1251.0034, PROVIDER, audit columns null |
  | PROVIDER 1000, then a later payload [T] `:146-155` | 1000.0000 unchanged |
  | legacy (null source) 1000 [T] `:187-196` | unchanged, source still null |
  | re-running over a DERIVED value [T] `:205-217` | 1249.9375, still DERIVED |
  | DERIVED lot [T] `:235-244` | never reverse-derives an allotmentNav |

- **UNT-05 (where estimates are consumed).**
  - Dashboard: hidden unless the flag is on (HLD-03).
  - Capital gains: excluded from lots (CG-04).
  - Partial redemption: refused (RED-05 step 4).
  - Provider submit: refused (RED-08).
- **UNT-06 (backfill, `B/service/nav/NavBackfillService.java:156,164,548-566`).** Only PURCHASE/LUMPSUM orders that are SUCCESSFUL/COMPLETED, have no units, have an allotment date and have amount > 0 are eligible. units = `getNetInvested()` ÷ nav at **scale 4, RoundingMode.DOWN**. Note that `getNetInvested` equals the full amount when stampDuty is null (`TransactionOrder.java:211-219`). See bug B-09.

---

## 9. Capital gains (`B/service/CapitalGainsReportService.java`)

**Constants** (`:44-55`):

| Constant | Value |
|---|---|
| Realised statuses | COMPLETED, SUCCESSFUL |
| Purchase types | PURCHASE, LUMPSUM_PURCHASE, SIP |
| Redemption types | REDEMPTION, SWP (these are **TransactionOrders**, not RedemptionRecords) |
| Grandfathering cutoff | 2018-01-31 |
| Equity long-term threshold | holding days > 365 |
| Other long-term threshold | holding days > 1095 |

- **CG-01 (FY parse, `:513-547`).**
  - Regex `^(?:FY)?\s*(\d{4})(?:\s*[-/]\s*(\d{2}|\d{4}))?$`, case-insensitive.
  - A blank value means the current FY: April or later uses this year as the start; otherwise last year.
  - A two-digit end year takes the start year's century prefix. The end year must equal start + 1.
  - Result: start = Apr 1, endExclusive = next Apr 1, label "YYYY-YYYY".
  - Vectors [C]: "2024-2025", "FY2024-25", "fy 2024/25" and "2024" all give 2024-04-01 to 2025-03-31, label "2024-2025". "2024-26" and "24-25" throw IllegalArgumentException.
- **CG-02 (data set, `:79-84`).** Orders for the **distributor** with a realised status and createdAt < FY end (as a UTC instant), sorted by createdAt.
- **CG-03 (date used, `:482-484`).** `createdAt.toLocalDate()` in the offset stored on the value. This is **not** the allotment date.
- **CG-04 (lots, `:163-173`).** Purchase-type orders with units > 0, amount > 0 and **no estimated units**, keyed by (investor, scheme), in createdAt order.
- **CG-05 (allocation, `:175-216`).**
  - Only redemptions **inside the FY** with units > 0 and amount > 0 are allocated.
  - salePPU = amount ÷ units at scale 8 HALF_UP.
  - Lots are consumed FIFO. Lots dated after the redemption are skipped; a lot dated the same day is allowed.
  - `consume` = min(lot remaining, request).
  - Any leftover units produce an unmatched line.
- **CG-06 (line maths, `:218-255`).**
  - purchasePPU = amount ÷ units at scale 8 HALF_UP.
  - saleValue = round2(salePPU × units); purchaseCost = round2(purchasePPU × units).
  - taxableCost = grandfatheredCost if the gain is LTCG and grandfatheredCost > purchaseCost; else purchaseCost.
  - gain = round2(sale − taxable). Units are shown at 4 dp HALF_UP.
- **CG-07 (gain type, `:286-299`).** days = DAYS(purchase date, sale date).
  - The threshold is 365 if the scheme category is EQUITY, **MF** or MUTUAL_FUND; otherwise 1095.
  - LTCG if days > threshold, else STCG.
  - A null scheme or null category counts as non-equity.
- **CG-08 (grandfathering, `:301-354`).**
  - Applies only when the scheme is equity-oriented, the purchase is on or before 2018-01-31 and the sale is after 2018-01-31.
  - fmvPPU comes from the first present metadata key among `grandfatheredNav, grandfathered_nav, nav_2018_01_31, navAsOn20180131, fairMarketValueAsOn20180131, fmv_2018_01_31`; if missing it defaults to purchasePPU.
  - Grandfathered cost per unit = **min(salePPU, max(purchasePPU, fmvPPU))**, rounded to 2 dp after multiplying by units.
  - The FMV column = FMV × units whenever an FMV exists, even when grandfathering is not applicable; otherwise 0.00.
- **CG-09 (unmatched line, `:257-284`).** Cost 0, FMV 0, grandfathered 0, taxable 0; gain = sale value; STCG; purchase date null.
- **CG-10 (totals, `:95-106, 450-456`).** Sums rounded to 2 dp HALF_UP. STCG and LTCG are summed by gain type.
- **CG-11 (CSV, `:356-448`).** QUICKO and CLEARTAX column orders as coded. Money is rendered with `toPlainString` at 2 dp. "Expense on Transfer" is always 0.00. RFC-4180 quoting applies when a value contains `,`, `"` or a newline.

**Test vectors:**

| Case | Expected |
|---|---|
| EQUITY scheme, FMV 15: buy 2017-01-01 100u / ₹1000; sell 2024-04-10 100u / ₹2000. OTHER scheme: buy 2024-04-01 100u / ₹1000; sell 2024-10-01 100u / ₹1200. FY "2024-2025" [T] `T/CapitalGainsReportServiceTest.java:33-100` | 2 lines; LTCG 500.00 (cost 1000.00, FMV 1500.00, grandfathered 1500.00); STCG 200.00 |
| same equity pair, CLEARTAX export [T] `:103-133` | row `EQUITY,INF-EQ-1,Equity Growth Fund,2017-01-01,2024-04-10,2000.00,1000.00,1500.00,1500.00,0.00,0.00,500.00,ABCDE1234F` |
| OTHER, PROVIDER lot, ₹1000 → ₹1200 [T] `T/CapitalGainsDerivedUnitsGuardTest.java:55-65` | cost 1000.00; gain 200.00 |
| same lot but DERIVED [T] `:74-92` | unmatched: cost 0.00, taxable 0.00, sale 1200.00, gain 1200.00, STCG |
| same lot, legacy null source [T] `:106-115` | cost 1000.00 |
| DERIVED ₹1000 lot + PROVIDER ₹1100 lot; sell 200u / ₹2400 [T] `:124-148` | 2 lines: 100u with cost 1100.00, and 100u unmatched with cost 0.00 |
| boundaries [C] | equity bought 2024-01-01, sold 2024-12-31 = 365 days → STCG; sold 2025-01-01 = 366 → LTCG. OTHER bought 2021-04-01, sold 2024-03-31 = 1095 → STCG; sold 2024-04-01 = 1096 → LTCG |
| grandfathering loss [C] | equity lot 2017-06-01 10u / ₹1000 (PPU 100), FMV 80; sold 2024-06-01 10u / ₹900 → grandfathered 900.00, taxable 1000.00, gain −100.00, LTCG. Taxable matches the statute formula max(P, min(FMV, S)); only the displayed "grandfathered cost" differs (statute would show 1000) |

---

## 10. SIP and mandate

- **SIP-01 (create, `B/service/OrderService.java:2189-2213`).** Runs only for type SIP, via `createOrder` (`:486`), which `createOrderAsInvestor` calls (`:579-608`). Checks in order:
  1. amount ≥ 500, else "SIP amount must be at least 500".
  2. sipStartDate is strictly after `LocalDate.now()`, else "must be in the future".
  3. Frequency is trimmed and upper-cased; null defaults to MONTHLY; only MONTHLY or QUARTERLY are allowed.
  4. sipInstalments, if present, must be ≥ 1.
  5. installmentDay, if present, must be between 1 and 28. The DTO also enforces this with `@Min(1)`/`@Max(28)` (`B/dto/OrderCreateRequest.java:26-28`, `InvestorOrderRequest.java:27-28`).
- **SIP-02 (stored frequency, `:501`).** The stored value is the normalised **raw** input, so null stays null even though validation treated it as MONTHLY (bug B-18).
- **SIP-03 (instalment-day shift, `:2220-2230`).** If the start date or day is null, the start is unchanged. Otherwise: d = clamp(day, 1, 28); adjusted = start with day-of-month d; if adjusted ≤ today, add one month.
- **SIP-04 (edit, `:2104-2140`).** Requires amount and/or day. Amount must be > 0 (**no ₹500 minimum**). Day must be 1–28. Status must be cancellable and a live `mfpp_` plan id must exist. The new day is applied as `withDayOfMonth` with **no roll-forward**. The live approval is superseded.
- **SIP-05 (lumpsum, `:2232-2239`).** Only for LUMPSUM_PURCHASE: amount must be > 0. There is no minimum, and plain PURCHASE is not validated at all.
- **MND-01 (`B/service/InvestorActionService.java:1014-1019`).** Mandate limit = max(100000, (amount, or 1000 if null) × 2, set to scale 0 with **CEILING**), converted with `intValue()`. It is passed to `createMandate` after the 2FA consume (`:394-402`).

**SIP vectors** (today = 2026-09-25) [C]:

| Input | Result |
|---|---|
| amount 499.99 | error |
| amount 500 | ok |
| start 2026-09-25 | error |
| start 2026-09-26 | ok |
| frequency "monthly " | MONTHLY |
| frequency "WEEKLY" | error |
| instalments 0 | error |
| day 0 or 29 | error |

**Instalment-day shift vectors** [C]:

| (start, day) | Result |
|---|---|
| (2026-10-20, 5) | 2026-10-05 (earlier than the requested start) |
| (2026-09-30, 10) | 2026-10-10 |
| (2026-09-26, 25) | 2026-10-25 |
| (2026-11-30, 28) | 2026-11-28 |
| (x, null) | x |

**Mandate vectors:**

| Instalment amount | Limit |
|---|---|
| SIP fixture with bank 906, E_MANDATE, CYBRILLAPOA [T] `T/InvestorActionServiceTest.java:511` | 100000 |
| 500 [C] | 100000 |
| 50000 [C] | 100000 |
| 50000.01 [C] | 100001 |
| 75000 [C] | 150000 |
| null [C] | 100000 |

---

## 11. Behaviour that looks like a bug, not a requirement

| # | Severity | Finding | Evidence | v2 action |
|---|---|---|---|---|
| B-01 | Low | A zero-amount cashflow counts toward the date span. If NPV is identically 0, the seed 0.1 is returned as a 10% XIRR | `XirrCalculator.java:60-69, 90-91` | Drop zero amounts before the guards |
| B-02 | **High** | The dashboard subtracts only **SUCCESSFUL** redemptions. Once a redemption moves to BANK_CREDIT_COMPLETED (a status the provider mapping does produce), its units reappear on the dashboard. The withdrawal screen counts both statuses | `HoldingsService.java:146` vs `RedemptionAvailability.java:76-79`, `OrderService.java:1788` | Use one settled-out definition everywhere |
| B-03 | **High** | AMOUNT and full redemptions never get units or proceeds. Dashboard netUnits ignores AMOUNT redemptions, so units and value are overstated while XIRR adds the rupee inflow. Full exits record the **cost** as `amount` | `OrderService.java:1455-1467`, `HoldingsService.java:493-497, 644-651` | Store the provider-confirmed units, NAV and proceeds per redemption |
| B-04 | **High** | Capital gains reads only REDEMPTION/SWP **TransactionOrders**. Self-serve redemptions are RedemptionRecords, so they never appear. The report is also distributor-scoped | `CapitalGainsReportService.java:50, 79-80, 175-182` | Build the report from an investor-scoped transaction ledger |
| B-05 | **High** | Only redemptions inside the FY consume FIFO lots. Earlier-FY redemptions never consume them, so later years match against lots already sold | `CapitalGainsReportService.java:88-93, 175-182` | Replay all redemptions in date order, and emit only those in the FY |
| B-06 | **High (tax)** | Category **MF** is treated as equity (365-day rule plus grandfathering), so debt funds are misclassified. Thresholds 365/1095 do not reflect Finance Act 2023 s.50AA (specified funds bought on or after 1-Apr-2023 are always short-term) or Finance (No.2) Act 2024 (24-month rule for other assets from 23-Jul-2024). This is my knowledge, not verified against a primary source in this run | `:292-299, 53-54` | Tax-category taxonomy plus rules as data; needs SME/CA sign-off |
| B-07 | Med | Availability is computed at scale 8, but `redemption_records.units` is numeric(18,4). The screen can show 66.66666666, and a request stored at 4 dp can round up past the ceiling. UNITS inputs are not scale-checked | `RedemptionAvailability.java:95`, `V1:163`, `PortfolioService.java:381` | Floor displayed and allowed units to 4 dp (ROUND_DOWN); reject inputs with more than 4 dp (money: 2 dp) |
| B-08 | Med | The share of a past AMOUNT redemption is recomputed against **today's** NAV basis, so it drifts. Example: 1000u, NAV 50, settled ₹25000 → 500u consumed; if NAV becomes 100 → only 250u consumed, and 250u of phantom headroom appears | `RedemptionAvailability.java:111-118, 227` | Freeze units consumed at draft time and replace them with provider units |
| B-09 | Med | Two unit-derivation roundings: HALF_UP in `OrderService` vs DOWN in `NavBackfillService`. ₹50000 at NAV 52.34 gives 955.2446 vs 955.2445. The backfill skips stamp duty when it is null | `OrderService.java:924`, `NavBackfillService.java:164`, `TransactionOrder.java:215-217` | One function; DOWN; always net of stamp duty |
| B-10 | Med | A full redemption is not bounded, so two full-exit drafts can coexist; each creates a BLOCKING record | `OrderService.java:1455-1461` | Refuse a full exit when any blocking or settled record exists |
| B-11 | Low | Average cost is rounded to 4 dp before multiplying, which loses paise (C2: ₹10,00,000 shows as 999,999.99) | `HoldingsService.java:613, 626` | Track the cost sum and scale units by proportion; round once |
| B-12 | Med | With no market NAV the dashboard values at **average cost** (STALE) and shows the cost NAV as `latestNav`. The withdrawal screen shows UNAVAILABLE instead. Comments and test names still say "null". Quarantined store rows fall back to SEEDED metadata demo NAVs for valuation | `HoldingsService.java:229, 253-258, 329-331`, `HoldingsServiceTest.java:163-179`, `SchemeNavResolver.java:248, 267` | Product decision: follow brief rule "never fabricate", i.e. null value, and no metadata fallback |
| B-13 | Low | The withdrawal screen's `currentValue` is unrounded and excludes **blocked** units (100u, 20 in flight, 30 settled, NAV 10 → shows 500, although 700 of value is still held) | `PortfolioService.java:403-422` | Split "value held" from "value redeemable" |
| B-14 | Low | The 1-day return is shown even when the NAV is AGED, and the previous-NAV date is not checked | `HoldingsService.java:294-301` | Require FRESH and a consecutive previous date |
| B-15 | Low | Future-dated NAVs grade FRESH (negative age) | `NavQuote.java:95-104` | Treat age < 0 as invalid |
| B-16 | Med | Clock and date mix: dashboard "today" uses server-zone `LocalDate.now()`; resolver uses UTC; XIRR and capital-gains dates use `createdAt.toLocalDate()` in the stored offset, not IST, and not the allotment date | `HoldingsService.java:186, 641`, `SchemeNavResolver.java:97`, `CapitalGainsReportService.java:483` | IST everywhere; use allotment/NAV date for cashflows and lots |
| B-17 | Low | Code comments contradict code: V75 and `hasEstimatedUnits` say "DERIVED is written ONLY by NavBackfillService", but `OrderService` also writes it. `RedemptionAvailability`'s javadoc says the dashboard counts redemptions "regardless of status", but it filters to SUCCESSFUL | `V75:62-65`, `TransactionOrder.java:192`, `OrderService.java:928`, `RedemptionAvailability.java:62-65` | Trust the code, not the comments |
| B-18 | Low | SIP: a null frequency is validated as MONTHLY but stored as null. An edit bypasses the ₹500 minimum, and `withDayOfMonth` can move the start into the past. Lumpsum has no minimum, and PURCHASE is not validated | `OrderService.java:2107, 2139, 2199-2202, 2233` | Validate with a shared zod schema using scheme-level minimums |
| B-19 | Low | MND-01 `intValue()` overflows above about ₹107 crore. A UPI Autopay limit of max(1 lakh, 2×) can exceed the UPI mandate cap | `InvestorActionService.java:1016-1018` | Cap per mandate rail (Q-6) |
| B-20 | Info | v1 has one SIP order row, with no per-instalment lots, so neither FIFO nor an ELSS lock-in can be computed per instalment | `HoldingsService.java:74-77` | Keep one lot per instalment allotment in v2 |

---

## 12. SME questions (these block anything below High confidence)

- **Q-1.** Should XIRR be suppressed or annualised differently for holdings under 365 days? v1 returns values such as 1.47e12 for a 10× gain in 30 days.
- **Q-2.** Stamp duty basis: the RTA formula, amount × 0.005/100.005 (₹1 crore gives 499.98), or v1's amount × 0.00005 (500.00)? Should v2 store the provider-reported stamp duty as authoritative? Does SIP incur it per instalment?
- **Q-3.** Capital-gains holding periods and categories for FY2024-25 onward: equity-oriented at 12 months; specified MF (s.50AA) always short-term; others at 24 months from 23-Jul-2024. Is grandfathering FMV per ISIN sourced from AMFI 31-Jan-2018 NAVs? Is "more than 12 months" measured in calendar months or in days > 365?
- **Q-4.** Dashboard valuation with no NAV: at cost (v1) or null (the brief)?
- **Q-5.** Should the SIP minimum and step come from scheme data (FP `mf_scheme_plans` minimums; ELSS multiples of ₹500) rather than a flat ₹500? Are only MONTHLY and QUARTERLY supported at launch?
- **Q-6.** Mandate limit per rail: is 2× / ₹1 lakh right for eNACH? What is the current NPCI UPI Autopay cap for mutual-fund mandates? One mandate per SIP, or reuse across SIPs?
- **Q-7.** Is the NAV age bound of 7 days (inclusive) still the right product threshold?

---

## 13. Golden-fixture checklist for the TS port

1. `xirr.spec.ts`: V1–V7 plus the four [J] extras. Tolerances: 1e-3 as in v1, and 1e-9 against [J].
2. `holdings.spec.ts`: H1–H6, S1–S5, G1–G4, E1–E4, A1–A3, C1, C2. Use a fixed clock and an injected NAV resolver.
3. `nav-freshness.spec.ts`: the NAV-02 table.
4. `redemption-availability.spec.ts`: both RED tables plus the scale-8 rounding vector.
5. `allotment.spec.ts`: the stamp-duty and ALT vectors, plus the UNT-04 matrix.
6. `capital-gains.spec.ts`: the CG tables. Mark the vectors affected by B-04 through B-06 as "v1 parity — expected to change".
7. `sip.spec.ts` and `mandate.spec.ts`: the SIP and MND vectors.

Where v2 deliberately fixes a bug from §11, keep the v1 vector as a skipped "parity" test next to the new expectation, so the change in behaviour is recorded.
