<!-- source: workflow wf_3190e72a-04a label spec:competitors | exported 2026-09-28 -->

# Sanchay: Competitor Teardown and UX Blueprint

This covers Indian mutual-fund investing apps as of 2026-09-25. All web sources were accessed on 2026-09-25 and are listed in section 10. Anything I could not confirm is marked "unverified" or "?".

**Platforms covered:** Groww (including Groww Prime), Zerodha Coin, Kuvera (Kuvera by CRED), INDmoney, ET Money, Paytm Money and Dhan. I also added three regular-plan apps that are closer to Sanchay's model: Dhan Saarthi, Scripbox, and Fisdom (now owned by Groww). Fi Money is left out because it wound down its consumer banking product in March 2026. Jupiter is left out on the assumption that mutual funds are not a core product there (I did not check this).

**Method:** help-centre articles, product and fund pages, App Store listings and reviews, press coverage, AMFI/SEBI documents, and a short check of the v1 investor UI in `C:/Users/pc/Desktop/WeathTech_v2/investor-frontend/src/v2-ui`. I only read things; no files were written.

---

## 0. Market changes since 2025 that shape Sanchay

| # | Change | Date | What it means for Sanchay |
|---|---|---|---|
| M1 | **Groww now sells regular plans through "MF Prime".** It offers recommendations based on risk profile. Turning Prime on moves all of a user's *future* purchases to regular plans. Users can switch back. | Pilot Jan 2026; launched 8–9 Jul 2026 (groww.in/updates, cafemutual, BusinessToday) | Sanchay's closest competitor is now Groww Prime. Groww also bought Fisdom, a regular-plan platform (announced May 2025, completed Oct 2025). A regular-plan app is now a normal thing to launch. Sanchay's advantage has to be openness about cost plus real service. |
| M2 | **AMFI told MFCentral to stop giving investor data to third-party fintech apps.** Reported coverage: existing mutual-fund distributors (MFDs) keep access; SEBI-registered investment advisers and portfolio managers get data through the Account Aggregator network. | ~18–20 Sep 2025 (BusinessToday, cafemutual) | Importing external holdings can no longer assume OTP-based pulls from MFCentral. Default to CAS PDF upload. Sanchay holds an ARN, so an OTP pull through MFCentral may still be allowed; this needs checking with MFCentral and Cybrilla (section 8). |
| M3 | **UPI merchant fees (MDR) start 15 Oct 2026.** Capital-market payments pay 0.02%, capped at ₹300. SIP debits through UPI Autopay or a mandate are exempt. | Takes effect in 20 days (BusinessToday 2026-09-15) | Lump-sum UPI now has a small cost; SIPs via mandate do not. Push SIPs through mandates. Budget for MDR on lump sums. |
| M4 | **New Income-tax Act 2025 in force from 1 Apr 2026.** "Tax year" replaces the old year terms. Old section 112A is now section 198. Equity long-term gains above ₹1.25 lakh are taxed at 12.5%. | 1 Apr 2026 | Tax statements must use the new "Tax Year 2026-27" wording and section numbers. Competitor help pages that still say "₹1 lakh" or "Assessment Year" are out of date. |
| M5 | **SEBI MF Regulations 2026.** The expense ratio (TER) is now shown as a base ratio (BER) plus brokerage plus statutory levies, and must be disclosed prominently. Direct and regular plans stay separate. | From 1 Apr 2026 (Wright Research) | The fund page should show a BER / levies / TER breakdown. Show which plan the user holds (Regular) everywhere. |
| M6 | **AMFI Master Circular for MFDs** (AMFI/MFD-CIR/32/2025-26, 14 Jan 2026) and AMFI's FAQ on MFD do's and don'ts | Jan 2026 | Several limits on what an MFD app may show or say. See section 3. |
| M7 | **SIP cancellation must be processed within 2 working days**, with a reason picked from a set list | From 1 Dec 2024 | The cancel flow needs a reason picker and a clear note on which debit will still happen. |
| M8 | **RBI raised the e-mandate limit for MF subscriptions to ₹1 lakh** per debit without extra authentication | 8 Dec 2023 | UPI Autopay can cover SIPs up to ₹1 lakh. Groww's help page still shows ₹15,000, which is stale. |

---

## 1. Platform profiles

| Platform | Owner / licence (as found) | Plans sold | Needs demat/broker account? | iOS rating (count) | What it is known for |
|---|---|---|---|---|---|
| **Groww** | Stock broker; MFD for Prime; owns Fisdom | Direct by default; Regular via MF Prime (opt-in) | Optional (demat or AMC folio) | 4.7 (215k) | Simplest first-time UX; curated collections; Active vs Lifetime XIRR; STP in app since Sep 2025 |
| **Zerodha Coin** | Stock broker (Zerodha) | Direct only | **Yes**: needs a Zerodha trading and demat account; units held in demat | ~4.2–4.3 (the iOS page I fetched showed a small count) | Clean, dark theme, step-up SIP, SWP; redemption needs a CDSL TPIN if the user has no DDPI |
| **Kuvera (by CRED)** | Acquired by CRED Feb 2024 | Direct (historically) | No | 4.5 (4.3k) | TradeSmart (tax and exit-load preview), DAP score, CAS PDF import, goals, tax reports |
| **INDmoney** | Holds ARN-254564; also a DP and BSE StAR member | Direct | Not for MF | 4.7 (107k) | Net-worth aggregation, portfolio scan (overlap, benchmark), external CAS import |
| **ET Money** | 360 ONE group (acquired 2024) | Direct; also sells SIFs | No | 4.3 (22k); Play 4.43 (~225k, from a search snippet) | Fund Report Card / ET Money Rank, Portfolio Health score, paid Genius tier (₹249/month) |
| **Paytm Money** | Direct-plan platform (described as RIA) | Direct only | No for MF | 4.5 (579, US store) | ₹100 SIPs, ₹21 daily SIP, Insta-redemption, SIP reminder widget, "switch to direct" |
| **Dhan** | Stock broker (INZ000006031) | Direct | Yes (Dhan account) | n/a | Daily/weekly/monthly SIP, filters by risk and horizon |
| **Dhan Saarthi** *(regular-plan comparable)* | Khazana Fintech, ARN-325085 | **Direct and Regular** | No | 4.9 (38) | Risk profiling, goal planning, overlap and underperformance detection; separate partner app for MFDs |
| **Scripbox** *(regular-plan comparable)* | MFD | **Regular** (plus some direct) | No | 4.6 (2.8k) | Curated funds, commission table per AMC, "Smart Withdraw", family accounts |
| **Fisdom** *(regular-plan comparable)* | Groww subsidiary | Regular | No | not assessed | Regular-plan wealth app; basis for Groww Prime |

---

## 2. Comparison matrix

Key: Y = supported, P = partial or limited, N = not supported, ? = unverified.

### 2.1 Feature matrix

| Capability | Groww | Coin | Kuvera | INDmoney | ET Money | Paytm Money | Dhan | Dhan Saarthi / Scripbox (regular) |
|---|---|---|---|---|---|---|---|---|
| Browse funds without logging in (public fund pages) | Y | Y | Y (single-page app, slow) | Y | Y | Y | Y | Y |
| Curated collections | Y (High Return, SIP with ₹500, Large/Mid/Small cap, Tax Saving) | P | ? | Y (Best SIP, High Return, Super Saver, Low Risk) | Y (ranked) | P | P | Y (algorithm-curated) |
| Screener filters | Y (Risk, Rating, Fund house, Index only, Category; sort by 1Y/3Y/5Y) | P | Y | Y | Y | Y (called "smart filters") | Y (risk, horizon, asset class, AMC) | Y |
| Fund compare | Y (up to 3; web only) | ? | ? | Y | Y | Y | ? | Y (Saarthi) |
| Returns calculator on fund page | Y (SIP, 1–10 years, historical) | ? | ? | ? | Y | ? | calculators hub | Y |
| Benchmark and category comparison | Y (returns and rankings vs category average) | ? | ? | Y (vs benchmark, category rank x/y) | Y (Report Card) | P | N | ? |
| Risk ratios (Sharpe, Beta, Sortino) | ? | ? | ? | Y | Y | ? | N | ? |
| Holdings and sector | Y (holdings count, sector, instrument) | ? | ? | Y (plus changes in holdings) | Y | ? | ? | ? |
| Lump sum by UPI | Y | Y | Y | Y | Y | Y | Y | Y |
| UPI Autopay for SIP | Y | Y (instant; ₹1 test debit) | Y (CRED UPI / Razorpay / Billdesk) | Y | Y | Y | Y | ? |
| eNACH (netbanking/debit card) | Y (bank approval 2–7 working days) | Y (up to 72 working hours) | Y (One-Click mandate) | Y | Y | Y | Y | ? |
| SIP frequencies | Monthly (per help page, possibly dated) | Daily and monthly | Monthly+ | Daily, weekly, monthly, quarterly | ? | Daily (₹21) and monthly | Daily, weekly, monthly | ? |
| Step-up SIP | Y (every 6 or 12 months) | Y | ? | Y | ? | ? | ? | ? |
| Skip or pause SIP | Skip one at a time; 3 missed in a row cancels the SIP | Pause/resume; must act by T-1, 5:30 PM | Y | Y | Y | Y | ? | ? |
| Switch | Y | Y | Y | Y | Y | Y | ? | Y |
| STP | Y (app since 19 Sep 2025; same AMC only) | Web only | Y | Y | Y | ? | ? | ? |
| SWP | Y (originally web only) | Y (app: modify, pause, delete) | Y | ? | Y | ? | ? | Y (Scripbox Smart Withdraw) |
| Tax and exit-load preview before redeem/switch | P (approximate exit load) | N | **Y (TradeSmart: STCG/LTCG plus exit load)** | ? | ? | ? | N | ? |
| XIRR on dashboard | Y (Active vs Lifetime toggle) | Y | Y (plus DAP benchmark comparison) | Y | Y (current and lifetime) | Y | ? | Y |
| External import method | MFCentral OTP (10–15 min) | N (units must be demat/transferred) | CAS PDF upload | CAS PDF (CAMS/KFintech) | CAMS/KFintech statement upload | Upload ("switch to direct") | ? | Y (Saarthi "track") |
| External holdings shown separately | P (merged into one dashboard) | n/a | **N: users complain about forced merging** | P (combined view) | P | ? | ? | ? |
| Capital gains report | Y (by financial year; Excel/PDF) | Y (via Console "Tax P&L") | Y (seen as the most reliable) | Y (tax centre) | Y | Y (Excel; realised gains) | ? | Y |
| ELSS / 80C statement | Y (password is the PAN) | Y | Y | ? | ? | ? | ? | ? |
| Goals | P | N | Y | P | Y | P | N | Y |
| Family accounts | ? | N | Was Y; reviews say removed | Y (tracking) | ? | ? | ? | Y (Scripbox) |
| Paid tier | N (Prime is paid via commission) | N | N | ? | **Genius ₹249/month** | N | N | N |

### 2.2 Sign-up, KYC and first investment

| Platform | Steps (in order) | How long it takes (as found) | Friction noted |
|---|---|---|---|
| Groww | Mobile/email sign-up → PAN → Aadhaar OTP through DigiLocker → consent → eSign (NSDL) → bank → MF turned on automatically | About 10 minutes to fill; approved within 24 hours (secondary source) | eSign failures have their own help article; re-KYC lockouts of "over a week" in reviews |
| Kuvera | PAN + name + DOB (KYC check first) → Aadhaar e-KYC → ₹1 penny drop → personal details → signature → nominee and FATCA | Under 30 minutes; activated in 24–48 hours | Heavy on data |
| Paytm Money | Mobile OTP → PAN → upload PAN → personal details → signature (draw or upload) → **5-second selfie video (IPV)** → address proof → nominee and declarations → bank (₹1) | Claims approval in minutes | Asks for a separate MF KYC even from verified Paytm users |
| INDmoney | Sign-up → KYC including video KYC | Reviews report **3–4 week** video-KYC delays | Weak status updates; generic support replies |
| Coin / Dhan | Open a broker trading and demat account first | Depends on broker onboarding | Demat model adds TPIN/DDPI steps later |
| **Sanchay target** | Mobile OTP → PAN + DOB → **KRA/CKYC check first**. If already KYC-validated: short path (no DigiLocker). Otherwise: DigiLocker Aadhaar → eSign. Then bank (penny drop with name match) → FATCA/PEP/income → nominee or opt-out → T&C → done | **About 8 minutes if already validated; about 15 minutes for new KYC**; show KRA approval time as an estimate | Browsing is allowed before KYC. KYC is only required when the user taps Invest. |

### 2.3 Fund discovery

| Element | Best example | Notes for Sanchay (an MFD) |
|---|---|---|
| Category navigation | Dhan and INDmoney: Equity / Debt / Hybrid / Index / ELSS / FoF, with SEBI sub-categories | Use SEBI category names as the main tree (locked decision 4) |
| Collections | Groww: High Return, SIP with ₹500, Large cap, Tax Saving, Mid cap, Small cap. INDmoney: Best SIP, High Return, Super Saver, Low Risk | **Rename anything that suggests a return or a recommendation** ("High return", "Best"). Use neutral, rule-based names: "Start with ₹500", "Save tax (ELSS)", "Index funds", "Low-volatility debt", "Large & flexi cap". Each gets a "How this list is built" sheet. |
| Screener | Groww: Risk, Ratings 4+, Fund house, Index only, Category; columns 1Y/3Y/5Y, Rating, Risk; 1,769 results | Filters at launch: category, sub-category, riskometer level, AMC (text only), minimum SIP, index-only, ELSS lock-in, AUM band, expense ratio band. Sort by 1Y/3Y/5Y return, AUM, TER, name. Default sort: **AUM**, not returns. |
| Search | All platforms | Type-ahead over scheme name, AMC and category; tolerate spelling mistakes ("parag parik", "hdfc flexi") |
| Ratings | Groww star rating; ET Money Rank; INDmoney rank "6/27" | Launch without a house rating (section 3, R3/R4). Show only factual quartile vs category if compliance approves; otherwise leave it out. |
| Social proof | INDmoney: "N people invested ₹X in the last 3 months" | Avoid for an MFD. It works as an inducement and can drive herd buying. |

### 2.4 Fund detail page, section by section

| Section | Groww | INDmoney | Paytm Money | Kuvera | **Sanchay (recommended order)** |
|---|---|---|---|---|---|
| Header | Name, AMC logo, chips (Equity · Flexi Cap · Very High Risk) | Name, NAV, 1D change, since-inception CAGR | Name, AMC, ISIN, NAV and date | Name (page loads client-side) | 1. Name, AMC as **text** (no logo until the AMC approves in writing), **"Regular · Growth" badge**, SEBI category chip, riskometer chip |
| Key facts | NAV with date, min SIP, AUM, expense ratio, rating, 1D | Expense ratio, exit load, AUM, min investment | AUM, expense ratio, manager, inception, min initial/additional, exit load, settlement T+2 | Expense ratio 0.53%, AUM with as-of date, min, full exit-load text | 2. Facts strip: NAV (date), 1D change, min SIP / min lump sum, AUM (as-of), **TER split into BER and levies** (as-of), exit load (short), lock-in |
| Chart | 1M / 6M / 1Y / 3Y / 5Y / All | Fund vs benchmark by period | n/a | ? | 3. NAV growth chart with the same periods; benchmark overlay toggle |
| Returns | Returns and rankings table (annualised and absolute vs category average) | Rank per period; beat/missed benchmark over 3Y/5Y | 1–5Y returns | ? | 4. Table of 1Y / 3Y / 5Y / since inception: fund vs benchmark vs category average. **Past-performance caveat placed right next to the table.** |
| Calculator | Monthly SIP ₹5,000, 1–10 year table (invested vs final value) | n/a | n/a | ? | 5. SIP / one-time toggle, amount, period, computed from **actual past NAVs** (not an assumed rate) |
| Risk | Chip | Beta / Sharpe / Sortino / Info ratio | n/a | ? | 6. Full riskometer dial; **PRC matrix for debt funds**; standard deviation and Sharpe under "Advanced" |
| Portfolio | Holdings (150): name, sector, instrument, % | Top 5, holding changes, sector changes | n/a | ? | 7. Top 10 holdings, sector, asset mix, market cap, with "as of month" |
| Costs and tax | Exit load, stamp duty 0.005%, tax | Exit load | Exit load | Full exit-load wording | 8. Costs: TER breakdown, exit load with a worked example, stamp duty, **regular-plan commission disclosure plus link to the commission-rates page**. 9. How gains are taxed (equity vs debt), in plain language |
| Management | Managers with education and experience; AMC info | 7 managers with start dates | Manager | 6 managers | 10. Managers with tenure; objective; benchmark; AMC details |
| Documents | ? | n/a | n/a | ? | 11. SID, KIM, factsheet links (KIM also linked at checkout) |
| Peers | Compare similar funds | Peer table | n/a | n/a | 12. Other funds in the same SEBI sub-category, **sorted by AUM**, factual columns only |
| FAQ | n/a | FAQs | n/a | n/a | 13. FAQs; sticky CTA bar: **Start SIP** / **Invest once** |

**Data freshness problem found:** on 24 Sep 2026 Groww showed Parag Parikh Flexi Cap Direct at a 0.69% expense ratio. Paytm Money and Kuvera showed 0.53% (Kuvera marked it as of 21 Sep 2026). Every curated number on Sanchay (TER, AUM, riskometer) must carry its own "as of" date and data source through the FundFactsProvider.

### 2.5 Checkout and mandate UX

| Topic | Groww | Coin | Kuvera | Paytm Money | Sanchay decision |
|---|---|---|---|---|---|
| SIP creation | Amount → date → pay first instalment now (UPI/netbanking) → then add AutoPay by OTP or paper form | Choose mandate; SIP must be set at least 2 days before the date | Mandate set up during the first SIP, or from Bank → Add Mandate | Autopay, netbanking or debit card | One flow: amount → date → optional step-up → **pay the first instalment today by UPI** (on by default) → choose or create a mandate in the same flow |
| First-instalment timing | 30 days minimum between 1st and 2nd instalment, so the first month is often skipped | Set up 2 days ahead | n/a | n/a | Show the **exact next debit date** before confirmation, with a one-line reason |
| Mandate types and limits | eNACH up to ₹1L; UPI shown as ₹15k (stale); bank approval 2–7 days | UPI Autopay instant, ₹1L per day, ₹1 test debit refunded in T+4, **no retry on failure** | One-Click mandate ₹1L per day; multiple SIPs share one mandate | UPI ₹15k per transaction (stale); ₹1L per day total | UPI Autopay (≤₹1L, instant) is the default; eNACH (netbanking/debit card) for more than ₹1L. One mandate covers many SIPs, with a **limit meter** |
| NAV and cut-off | Own **2:00 PM** cut-off; UPI gets same-day NAV, netbanking only for some banks | n/a | n/a | n/a | Show the platform cut-off and the expected NAV date on the review screen ("Order before 2:30 PM to get today's NAV") and on the status screen |
| Execution-only / suitability | n/a (direct, execution-only) | n/a | n/a | n/a | **Required for an MFD** (section 3, R1/R2): risk-profile mismatch warning with acknowledgement; per-order execution-only declaration |
| Two-factor auth | OTP | Kite login | OTP | OTP | SEBI 2FA on every purchase and redemption, and once at SIP registration |

### 2.6 Dashboard and how returns are explained

| Metric | Groww | Coin | Kuvera | INDmoney | Sanchay |
|---|---|---|---|---|---|
| Current value / invested / total returns | Y | Y | Y | Y (plus 1D change and dividends) | Y |
| 1-day change | Y | ? | ? | Y | Y, labelled with the NAV date |
| XIRR | **Active vs Lifetime** dropdown (12 Sep 2025); both shown on the fund's info button; choice synced across devices | Portfolio XIRR on home; per-fund under Investments | XIRR plus **DAP** (Discipline / Allocation / Performance vs blended benchmark) | XIRR, returns vs benchmark, "growth breakdown" (contributions vs gains) | XIRR with a **tap-to-explain** sheet: definition, a small worked example, and why it differs from absolute return. Shown from 365 days of history; before that, show absolute return plus "XIRR appears after 1 year" |
| Allocation | ? | ? | 5-point volatility spectrum | Market cap, sector, equity vs liquid | By SEBI category (Equity / Debt / Hybrid / Solution / Other), drill into sub-category |
| Active SIPs | SIPs tab | SIPs tab | Y | Y | Count plus "next debit on X" card |
| Pending-value states | n/a | Coin shows "–" for XIRR without explaining (third-party blog) | n/a | n/a | Reuse the v1 approach: never label invested money as value ("invested · awaiting allotment"), `investor-frontend/src/v2-ui/screens/HomeScreen.tsx:73-83`; XIRR tooltip at `:122-123`; `fmtXirr` shows "—" when missing, `lib/format.ts:42` |

### 2.7 SIP management

| Action | Groww | Coin | Sanchay |
|---|---|---|---|
| Skip / pause | Skip one instalment at a time; skipping or missing 3 in a row auto-cancels; requests within 2 days apply to the following month | Pause/resume; must act by T-1, 5:30 PM | "Pause for 1–3 instalments" with the resume date shown; warn before the 3rd miss |
| Change amount or date | Edit amount and date; applies to future instalments if the next one is within 2 working days | Change amount, date, frequency | Same, plus show which instalment the change takes effect from |
| Step-up | Every 6 or 12 months; next date is the same date next period | Supported | Annual or half-yearly, % or ₹ |
| Cancel | Help says cancel 7 days before, or the debit may still happen | Delete option | Reason picker (SEBI), processed within 2 working days, show "one more debit may happen on X" |
| Failed debit | "Pay manually" help article | No retry | Push + SMS + email with a **Pay now** UPI link valid until the NAV cut-off; count of consecutive failures shown |

### 2.8 Redemption, switch, STP and SWP

| Flow | Best example | Sanchay |
|---|---|---|
| Redeem | Groww: approximate exit load shown; settles T+2/T+3 for equity, next day for debt. Kuvera TradeSmart: exact STCG/LTCG plus exit load for the entered amount; highlights units older than 1 year (equity). Paytm Insta-redemption: up to 90% or ₹50k | Amount / units / all toggle. Preview panel: estimated units, exit load, STCG/LTCG estimate, bank account, **"money expected by <date>"**. Hint: "₹X can be withdrawn without exit load" |
| Switch | Kuvera and Coin show it as a redeem-then-buy | Only same-AMC targets are listed; same tax and exit-load preview as redeem; target defaults to the Regular plan |
| STP | Groww (app, Sep 2025): start from the holding; target must be in the same AMC; choose number of instalments and date; exit load per transfer | Start from the holding's ⋯ menu; same-AMC target pre-filtered; weekly or monthly; show total instalments and end date |
| SWP | Groww: from the holding ⋯ menu, pick a monthly amount. Coin: modify, pause, delete | Monthly amount and date; "lasts about N months at current value" estimate; tax note |

### 2.9 External import (CAS)

| Platform | Method | Display | Known problems |
|---|---|---|---|
| Groww | MFCentral OTP pull; 10–15 minutes; refreshed daily | Merged into one dashboard; imported funds can be topped up or redeemed | PAN and email must match the CAS; missing-fund help articles |
| Kuvera | CAS PDF upload (earlier: triggered a CAS email) | Reviews say the update **forced merging** and removed the Kuvera-only view | Users lost the separate view; tax harvesting and family features reported removed |
| INDmoney | CAMS/KFintech CAS PDF | Combined analytics | n/a |
| ET Money | CAMS/KFintech statement upload; used to push "switch to direct" | Current and lifetime XIRR | **50%+ valuation mismatches** and CAS read failures in reviews |
| **Sanchay** | Primary: **CAS PDF upload** (CAMS+KFintech detailed CAS, plus CDSL/NSDL CAS), password defaults to PAN, parsed on the server. Secondary: MFCentral OTP pull if ARN access is confirmed | **Separate "Imported" section with its own totals.** "Include imported in totals" is off by default. Every holding is tagged with the statement date. After parsing, a summary screen ("12 funds, 5 folios, ₹X; 1 folio unreadable") that the user confirms | Guided link to download the CAS; no "free portfolio review" wording (section 3, R6) |

### 2.10 Tax and statements

| Report | Groww | Coin | Paytm Money | Sanchay |
|---|---|---|---|---|
| Capital gains | You → Reports → Capital Gain → FY → Download | Console → Tax P&L → FY and quarters | Reports → Capital Gains; Excel or email | Tax Year picker (labelled "Tax Year 2026-27 (FY 2026-27)"), STCG/LTCG split, grandfathering, Excel + PDF, emailed PDF with PAN password |
| Transactions | Reports | Console | Account statements | Date range; all order types; PDF/CSV |
| ELSS | Tax → MF ELSS statement; password is the PAN | ELSS statement | n/a | ELSS summary: invested per FY, lock-in end date per lot |
| Unrealised gains | Limited | Console | n/a | Unrealised STCG/LTCG plus "gains you can realise tax-free this year (within ₹1.25L)" as information only, **not a harvesting suggestion** |

### 2.11 Notifications and order tracking

| Platform | Pattern | Sanchay |
|---|---|---|
| Groww | Order statuses: Pending allocation (3–4 working days; liquid 1–2) / KYC verification pending (+1 day) / Allocated | Timeline: Placed → Payment received → Sent to AMC → Units allotted (NAV, units, folio) → Complete |
| Paytm Money | SIP reminder home-screen widget | Android widget later; at launch, a "next SIP" card on Home |
| UPI Autopay (system) | Pre-debit notice 24–48 hours before, sent by the bank/PSP | Sanchay sends its own reminder 2 days before ("keep ₹X in account ••1234") |
| Coin | No retry after an Autopay failure | Failure alert with a Pay-now link |

### 2.12 Trust and disclosure

| Pattern | Seen at | Sanchay |
|---|---|---|
| ARN and registrations in the footer | INDmoney (ARN-254564, DP, BSE StAR); Dhan Saarthi (ARN-325085); Dhan (SEBI broker number) | ARN + the required tagline "AMFI-registered Mutual Fund Distributor" in the footer, About page, fund-page Costs section and checkout |
| Commission disclosure table | Scripbox: table per AMC by category (Equity/Debt/Liquid/ELSS), ranges, "All Trail", plus a statement that picks are not driven by commission | Public `/commission-rates` page in the same format; linked from every order review |
| "Your money is safe" explanation | Kuvera: units are in your folio at the AMC/RTA, not with the platform | "Money goes straight to the AMC's account; units sit in your folio in your name; you can see them on CAMS/KFintech/MFCentral" |
| Market-risk disclaimer | Dhan, Dhan Saarthi | In the footer and checkout; the past-performance caveat sits next to every returns table |
| Explaining direct vs regular | Dhan Saarthi FAQ; Groww Prime says users can switch back | Plain-language "Why regular?" sheet explaining what the commission pays for |

### 2.13 App-store pain points (recurring)

| Platform | Complaints (paraphrased) | Lesson for Sanchay |
|---|---|---|
| Groww | Slow to open (reports of about a minute), spinners of 10–15 s; re-KYC lockouts over a week; template support replies; switch where money left one fund but didn't arrive in the other | Cold-start budget; clear KYC status; human support; switch shown as two linked legs |
| Coin | NAV/value out of date; buggy; tickets open for a year; repeated Kite logins | Show NAV dates; stay stable; session length set for mobile |
| Kuvera | Forced merging of external funds; features removed (tax harvesting, EPF, family); missing back/close buttons | Keep imported holdings separate; don't silently remove features; every screen dismissible |
| INDmoney | Video KYC stuck 3–4 weeks; UPI activation issues; generic support | KYC tracker with ETA and escalation |
| ET Money | Paywall pushed hard; CAS import errors; withdrawals 5+ days; no phone support | No paywall on core features; reconcile imports; show withdrawal ETAs |
| Paytm Money | No phone support; features removed (line chart) | Keep a support phone line; changelog |
| Scripbox | Cluttered after updates; overview features broke | Protect the Home layout |

---

## 3. Rules that limit what Sanchay can copy (MFD-specific)

Sources: the AMFI "FAQs on Do's & Don'ts for MFDs" PDF, and AMFI Master Circular AMFI/MFD-CIR/32/2025-26 (14 Jan 2026).

| # | Rule | Source | UX consequence |
|---|---|---|---|
| R1 | MFDs must risk-profile clients and keep the records | FAQ Q5 | Risk-profile questionnaire (7–8 questions) during onboarding, required before the first order; re-take any time; stored with a version number |
| R2 | Execution-only: if the MFD believes the transaction isn't suitable, it must tell the investor in writing and get an acknowledgement | FAQ Q6–Q7 | If fund risk is above the user's profile: a blocking sheet with a written warning and an explicit acknowledgement checkbox, stored per order |
| R3 | MFDs may give only "incidental advice" about recommended schemes; no "financial planning" or "financial advice" wording | FAQ Q2–Q4 | Goal-based SIP helpers are allowed (Q4). Never use the words "financial plan" or "advisor". Name collections by fact. |
| R4 | No using AMC names or logos, or self-made scheme marketing, without the AMC's prior written approval; performance comparisons naming schemes need AMC approval or should come from factsheets or reliable sources | FAQ Q11, Q13 | Launch with AMC names as text and **no logos** until approvals are on file. Returns and peer data are factual, sourced from AMFI and the FundFactsProvider, and labelled with their source. |
| R5 | Required tagline "AMFI-registered Mutual Fund Distributor" with the name and ARN | MC §1.3.6; FAQ Q14 | Footer, About, checkout, emails and PDFs |
| R6 | No rebates, gifts or vouchers; no "free advice" or "free portfolio review" to attract investors | FAQ Q8(c), Q12(c) | No cashback or referral rewards. The CAS import screen must not be marketed as a "free portfolio review". Call it "See all your mutual funds in one place". |
| R7 | EUIN is required even for execution-only orders. If blank, AMCs collect a signed declaration and review these as exceptional cases. Quoting an EUIN does not make an order "advisory". | MC §5.2.2–5.2.4 | Per-order execution-only declaration consent (the exact AMFI wording is paraphrased here; legal should insert the text from MC §5.2.4(b)), versioned and stored. Whether to map a platform EUIN is a compliance decision; the UX supports both. |
| R8 | Commission paid only as trail | MC §5.1.2 | The commission page says "trail commission only" |

---

## 4. The 25 UX patterns to adopt

All are in the launch scope. "Seen at" gives where the pattern comes from.

| # | Pattern | Seen at | Why it matters for Sanchay | Concrete Sanchay spec |
|---|---|---|---|---|
| 1 | **Browse first, KYC only at Invest** | Groww, INDmoney, Dhan public fund pages | Removes early drop-off; public pages bring search traffic | Explore and fund pages open to everyone (server-rendered on web). Tapping Invest opens sign-in, then an onboarding checklist that returns the user to the same fund. |
| 2 | **Check KRA/CKYC first, then branch** | Kuvera (PAN+DOB first); Groww DigiLocker + eSign | Already-validated users skip DigiLocker; new users get one continuous DigiLocker → eSign flow | PAN+DOB → KRA lookup → validated: short path; registered-only or new: DigiLocker → eSign; video IPV as fallback. Show each step with an estimated time. |
| 3 | **Onboarding checklist that resumes** | Groww, Kuvera | Onboarding has many steps (KYC, bank, FATCA, nominee, risk, T&C); people pause | Checklist card on Home; each item shows done / pending / blocked with a reason; resumes where the user stopped on any device |
| 4 | **Penny drop with a name-match result** | Kuvera and Paytm (₹1 test credit) | Catches wrong accounts before a mandate or redemption fails | Show "Name at bank: R*** K*** — matches your PAN" and a fix path if it doesn't |
| 5 | **Risk profile plus mismatch acknowledgement** | Groww Prime, Dhan Saarthi (risk profiling) | Required by R1/R2; also protects users | 7–8 question profile shown as a 5-level result mapped to riskometer levels; above-profile orders trigger R2 |
| 6 | **Rule-based collections with a "how this list is built" sheet** | Groww, INDmoney collections | Easy discovery without an implied recommendation (R3) | 6–8 collections at launch ("Start with ₹500", "Save tax – ELSS", "Index funds", "Large & flexi cap", "Short-term parking – liquid/overnight", "Hybrid/balanced"); each shows its rule and data date |
| 7 | **Screener with sticky filter chips** | Groww filter page | Power users want control; chips keep state visible on small screens | Chips row plus a bottom-sheet filter; result count; sort by AUM by default |
| 8 | **Facts strip at the top of the fund page** | Groww header metrics | The 6–7 facts people decide on, all visible at once | NAV (date) · 1D · min SIP / lump sum · AUM (as-of) · TER (as-of) · exit load · riskometer |
| 9 | **Calculator based on real past NAVs** | Groww monthly-SIP table | Makes SIPs concrete without assuming a return rate | "₹2,000 a month for 5 years would have been ₹X (invested ₹Y)", from AMFI NAVs; caveat placed right next to it |
| 10 | **Fund vs benchmark vs category average** | INDmoney, Groww returns table | Honest context without ranking funds (R4) | 1Y/3Y/5Y/since-inception table with source labels; no stars or house rank |
| 11 | **Plain-language costs with a worked example** | Kuvera full exit-load wording; Groww stamp duty and tax | Exit load and tax are what surprise people most | "Sell within 365 days: 1% fee. Example: selling ₹10,000 costs ₹100." Plus the TER breakdown and commission line. |
| 12 | **Show the regular-plan commission at order level** | Scripbox commission table; Groww Prime's explicit regular-plan switch | Trust; regulator expectations; answers direct-plan pitches from rivals | Review screen: "Regular plan · includes distributor trail commission to Sanchay (x–y% a year for this AMC)" linking to `/commission-rates` |
| 13 | **Cut-off and NAV-date clarity** | Groww applicable-NAV help, 2 PM internal cut-off | Stops "wrong NAV" complaints | Review shows "Expected NAV date: Fri 25 Sep" with a countdown to the cut-off; status screen shows the NAV actually applied |
| 14 | **UPI first for lump sums, netbanking as fallback** | Groww, Coin, Paytm | UPI gives the best chance of same-day NAV; MDR is small (M3) | UPI intent on Android, UPI QR / collect on web; netbanking as a secondary choice |
| 15 | **Mandate as an account-level object with a limit meter** | Coin (many SIPs, one mandate), Kuvera One-Click, Groww Bank & AutoPay | Fewer mandate setups; users understand the limits | Account → Bank & AutoPay: each mandate shows bank, type, limit, "₹X of ₹1,00,000 used", status; SIP setup picks an existing mandate automatically if it has room |
| 16 | **Pay the first instalment now, and show the next debit date** | Groww (first payment; 30-day gap rule) | The first debit is the most confusing part of SIPs | First instalment by UPI today (on by default); "Next debit: 10 Nov (at least 30 days after the first)" |
| 17 | **SIP control centre** | Coin (modify/pause/delete), Groww (skip, edit, step-up) | Pausing, changing and stepping up must be self-serve and quick | SIP detail: Pause (1–3), Change amount/date, Step-up, Change mandate, Cancel (reason picker, one more debit may happen); cut-off warnings on each action |
| 18 | **Warn before a SIP auto-cancels** | Groww (3 missed = cancelled) | Stops SIPs dying silently | After 2 failures in a row: push + SMS + email "one more miss cancels this SIP", with a Pay-now link |
| 19 | **Tax and exit-load preview before redeem or switch** | Kuvera TradeSmart; Groww approximate exit load | Main source of regret after selling; stands out against most apps | Preview: units, exit load, STCG/LTCG estimate, "₹X is free of exit load", credit bank, money-by date |
| 20 | **Systematic plans started from the holding** | Groww (⋯ → Start STP/SWP; same-AMC target) | Users think "move money out of this fund", not "open STP" | Holding ⋯ menu: Redeem, Switch, STP, SWP, Invest more; target lists pre-filtered to the same AMC and regular plans |
| 21 | **Order timeline with honest pending states** | Groww order statuses; v1 "awaiting allotment" hero | Units take 1–4 working days; blank screens cause support tickets | 5-step timeline with timestamps; Home shows "invested · awaiting allotment" until priced (v1 `HomeScreen.tsx:73-83`) |
| 22 | **XIRR explained where it appears** | Groww Active/Lifetime; Coin XIRR article; INDmoney growth breakdown | XIRR is the most misread number | Tap for a 3-line explanation plus a 2-cashflow example; show from 365 days; absolute return before that; Active/Lifetime toggle later (not needed at launch) |
| 23 | **Imported holdings kept separate** | Seen as a gap at Kuvera (backlash) and Groww (merged) | Imported funds aren't transactable in the same way; merging distorts Sanchay figures | Home shows "Your Sanchay investments" and "Imported (CAS, as of 12 Sep 2026)" as separate cards; combined toggle off by default |
| 24 | **Guided CAS upload with a confirm step** | INDmoney and Kuvera PDF upload; ET Money failures | Reliable import without MFCentral | "Get your CAS" link-out steps → upload → password (PAN pre-filled) → parse summary → confirm; re-upload any time; imported holdings valued daily by NAV |
| 25 | **Trust strip in the footer and checkout** | Kuvera safety explanation; INDmoney / Dhan Saarthi registration footer; AMFI tagline | Mass-market users worry about safety; required by R5 | "Money goes directly to the AMC · Units held in your name (folio) · ARN-xxxxx · AMFI-registered Mutual Fund Distributor · SEBI SCORES / ODR · Grievance officer" |

---

## 5. Anti-patterns to avoid

| # | Anti-pattern | Where seen | Why it's harmful | What Sanchay does instead |
|---|---|---|---|---|
| A1 | Forcing imported holdings into platform totals | Kuvera reviews | Loss of trust; figures users can't reconcile | Pattern 23 |
| A2 | Paywalling core features and heavy upselling | ET Money Genius reviews | Churn; conflicts with MFD rules (R6) | No paid tier at launch |
| A3 | Slow cold start and spinners | Groww reviews | Kills retention on low-end Android (decision 8) | Budgets in section 7.8 |
| A4 | Stale help content and stale data (₹15k UPI limit; TER mismatch across apps) | Groww help; Groww vs Paytm/Kuvera TER | Wrong expectations; complaints | "As of" date on every figure; help content versioned with a review date |
| A5 | Features only on web | Groww compare, early STP/SWP; Coin STP web only | Most users are mobile-only | Every launch feature works on both native and web |
| A6 | Demat-only holdings needing a CDSL TPIN to redeem | Coin | Extra step for every redemption | AMC folio (statement of account) mode via Cybrilla FP; no demat at launch |
| A7 | Removing features silently in updates | Kuvera, Paytm Money (line chart), Scripbox | Breaks users' habits | In-app "What's new"; announce removals 30 days ahead |
| A8 | Template-only support, no phone | Groww, ET Money, Paytm Money, INDmoney | The biggest complaint across the market | Human chat plus callback; order-linked tickets; the commission funds real service |
| A9 | AMC logos and self-made scheme marketing without approval | Common on direct apps | Breaks R4 for an MFD | Text-only AMC names until approvals are on file |
| A10 | Labels like "High return" / "Best funds" and house star ratings | Groww, INDmoney, ET Money | Implies advice; herd buying; R3/R4 risk | Factual collection names (pattern 6) |
| A11 | Social-proof counters ("N people invested…") | INDmoney fund page | Inducement and FOMO | Leave out |
| A12 | Cashback, rewards, referral vouchers | Various fintechs | Forbidden for MFDs (R6) | Leave out |
| A13 | Unclear cancellation leading to an unexpected debit | Groww help ("cancel 7 days before") | Surprise debits cause complaints | Cancel screen names any debit that may still happen |
| A14 | Autopay failure with no retry and no alert | Coin | Missed instalments | Pattern 18 |
| A15 | Multi-week KYC with no status | INDmoney video KYC | Abandonment | Status tracker with ETA and escalation after 72 hours |
| A16 | Import errors with no reconciliation | ET Money (50% mismatches) | Wrong decisions | Parse summary, unreadable-folio list, statement date on every holding |
| A17 | Unexplained "–" for XIRR | Coin (third-party blog) | Confusion | Pattern 22 |
| A18 | Silently switching plan type | Groww Prime moves all future buys to regular | Unfairness risk | Sanchay is regular-only and labels it everywhere; no hidden change of plan |

---

## 6. Where Sanchay can stand out

Sanchay is a regular-plan app competing against direct-plan apps and Groww Prime.

| Threat | Response |
|---|---|
| Rivals (ET Money, Paytm Money, INDmoney, Kuvera) run "switch regular to direct" campaigns aimed at people like Sanchay's users | Be open about what the commission pays for: human support, order-issue tracking, tax and exit-load previews, nominee and KYC upkeep (FAQ Q1(b) "after-sales support"). The fund page shows the TER breakdown and the commission range. |
| Groww Prime pairs recommendations with regular plans | Sanchay runs execution-only plus risk-profile guardrails at launch, with goal-based SIP helpers as allowed "incidental advice" (Q4). No house ratings. |
| Direct apps compete on speed and polish | Match the table stakes (patterns 1–4, 13–17) and beat them on reliability and support (A3, A8). |

---

## 7. Recommended information architecture (web + app)

### 7.1 Principles

1. One route structure shared by Expo Router and the Next.js 16 App Router, so both platforms use the same segment names and screen components. The logged-in app has no separate `/app` prefix.
2. Public, search-indexable pages on web are server-rendered: fund pages use ISR, revalidated after the nightly AMFI NAV sync.
3. Holdings and actions start from the holding; discovery and buying start from the fund.
4. Every money screen shows its data date.

### 7.2 Navigation

| Surface | Main navigation |
|---|---|
| **Native app (Expo)**: bottom tab bar, 5 tabs | **Home** (portfolio, nudges, holdings, imported card) · **Explore** · **SIPs** · **Orders** · **Account** |
| **Web desktop (≥1024 px)** | Left sidebar with the same 5 items; top bar with global search and a notifications bell |
| **Web mobile (<768 px)** | Same bottom tab bar as native |
| **Public web, logged out** | Top nav: Mutual Funds (categories mega-menu) · Collections · Calculators · Learn · Log in / Sign up. Footer: ARN and tagline, disclosures, commission rates, grievance, SEBI SCORES/ODR, privacy, terms |

### 7.3 Route map (Expo `apps/mobile/app/`, and the same segments in Next.js `apps/web/app/`)

| Group | Routes | Notes |
|---|---|---|
| `(public)` *(web: marketing layout)* | `/`, `/mutual-funds`, `/mutual-funds/category/[category]`, `/mutual-funds/category/[category]/[subCategory]`, `/mutual-funds/collection/[slug]`, `/mutual-funds/amc/[amcSlug]`, `/mutual-funds/fund/[schemeSlug]`, `/calculators/[type]` (sip, lumpsum, step-up, swp), `/learn/[slug]`, `/disclosures`, `/commission-rates`, `/grievance` | The fund page is shared between public and logged-in views; the CTA changes with auth and KYC state |
| `(auth)` | `/login` (mobile OTP), `/verify`, `/logout` | Email OTP as a second channel |
| `(onboarding)` | `/onboarding` (checklist), `/onboarding/pan`, `/onboarding/kyc` (KRA result → DigiLocker → eSign), `/onboarding/bank`, `/onboarding/details` (occupation, income, FATCA, PEP), `/onboarding/nominee`, `/onboarding/risk-profile`, `/onboarding/terms`, `/onboarding/done` | Resumes from the checklist; a `returnTo` parameter brings the user back to the fund they chose |
| `(tabs)/home` | `/home` | Hero (value, invested, returns, 1D, XIRR), onboarding/KYC checklist card, pending-payment nudges, next-SIP card, allocation, holdings list, **Imported** card |
| Holdings | `/holdings/[holdingId]`, `/holdings/[holdingId]/redeem`, `/holdings/[holdingId]/switch`, `/holdings/[holdingId]/stp`, `/holdings/[holdingId]/swp`, `/holdings/[holdingId]/transactions` | holdingId = scheme plus folio |
| `(tabs)/explore` | `/explore`, `/explore/search`, `/explore/filter`, `/compare?ids=a,b,c` | Compare holds up to 3 funds, on both platforms |
| Invest | `/invest/[schemeId]?mode=sip\|once` → `/invest/[schemeId]/review` → `/invest/[schemeId]/authorise` (OTP) → `/pay/[paymentId]` → `/orders/[orderId]` | The review step carries the disclosures, execution-only declaration and mismatch acknowledgement |
| `(tabs)/sips` | `/sips`, `/sips/[sipId]`, `/sips/[sipId]/edit`, `/sips/[sipId]/pause`, `/sips/[sipId]/step-up`, `/sips/[sipId]/cancel` | STP and SWP plans are listed here too, under a "Systematic plans" segment |
| `(tabs)/orders` | `/orders?status=`, `/orders/[orderId]` | Timeline, NAV applied, units, folio, receipt |
| Imported | `/imported`, `/imported/upload`, `/imported/review/[importId]`, `/imported/[holdingId]` | Kept separate from `/holdings` |
| `(tabs)/account` | `/account`, `/account/profile`, `/account/bank-autopay`, `/account/bank-autopay/[mandateId]`, `/account/nominees`, `/account/risk-profile`, `/account/reports`, `/account/reports/capital-gains`, `/account/reports/transactions`, `/account/reports/elss`, `/account/notifications`, `/account/security`, `/account/help`, `/account/help/ticket/[id]`, `/account/legal` | Reports live under Account, as users expect from Groww |
| Inbox | `/inbox` | In-app copy of every notification |

### 7.4 Home layout (top to bottom)

1. Hero: current value (or "invested · awaiting allotment"), total returns in ₹ and %, 1D change (NAV date), XIRR (tap to explain).
2. Action nudges, at most 2: finish KYC, pay a pending instalment, mandate pending, nominee pending.
3. Next SIP card: fund, amount, date, mandate, with a "keep ₹X in ••1234" line.
4. Allocation by SEBI category (donut plus legend; shown only if at least one holding has a value).
5. Holdings list sorted by current value; each row shows value, returns and XIRR or absolute return.
6. Imported card: separate totals and statement date; "View" / "Update CAS".
7. Trust strip (pattern 25).

### 7.5 Checkout steps

| Step | Lump sum | SIP |
|---|---|---|
| 1. Amount | Amount with min/max checks and preset chips | Amount + date (1–28) + optional step-up; next-debit preview; "pay first instalment today" toggle |
| 2. Guardrails | Risk-mismatch sheet if needed (R2) | Same |
| 3. Review | Fund, **Regular** plan, amount, expected NAV date, exit load, stamp duty, commission line, KIM/SID links, execution-only declaration checkbox (unticked by default) | Adds mandate choice (existing with limit meter, or new UPI Autopay / eNACH) |
| 4. Authorise | SEBI 2FA OTP | OTP at registration |
| 5. Pay | UPI intent or QR; netbanking fallback | First instalment by UPI plus mandate authorisation (UPI app or bank page) |
| 6. Status | Order timeline | SIP created, first-order timeline, next debit date |

Keep v1's hardened consent mechanics (server-rendered consent text, unticked checkbox, fails closed), but move them onto the investor-initiated flow as the v1 analysis recommends. The distributor-approves step is gone.

### 7.6 Notifications

| Event | Push | SMS | Email | Inbox |
|---|---|---|---|---|
| Order placed / payment received / units allotted (NAV, units, folio) | Y | allotment only | Y (confirmation) | Y |
| Payment failed / pending payment before cut-off | Y | Y | n/a | Y |
| SIP due in 2 days ("keep ₹X") | Y | Y | n/a | Y |
| SIP debited / failed (+ Pay now) / 2 misses in a row / auto-cancelled | Y | failed + auto-cancel | Y | Y |
| Mandate approved / rejected / expiring | Y | rejected | Y | Y |
| Redemption / SWP processed; money credited (with date) | Y | credited | Y | Y |
| KYC status change / action needed | Y | Y | Y | Y |
| CAS import done / needs attention | Y | n/a | Y | Y |
| Statement ready (tax season) | Y | n/a | Y (PDF with PAN password) | Y |
| Market commentary / "fund X is up" | **N**: avoid noise and implied advice | | | |

Quiet hours are 21:00–08:00 IST, except for payment-critical alerts before the cut-off. Transactional SMS must use DLT-registered templates.

### 7.7 Web-specific

- Fund, category and collection pages carry structured data (FinancialProduct with the scheme name and NAV date), with canonical URLs by scheme slug.
- Payment on web uses a UPI QR plus collect on desktop, and UPI intent on mobile web.
- Report downloads come as a direct PDF/CSV plus an emailed copy.

### 7.8 Budgets for low-end Android (decision 8; answers the Groww cold-start complaint)

| Metric | Target on a ~₹10k Android (3–4 GB RAM) |
|---|---|
| Cold start to interactive Home | ≤2.5 s on 4G; skeleton screen within 800 ms |
| Explore list scroll | 60 fps with virtualised lists; fund rows free of images (no logos anyway, per R4) |
| Fund page first render | ≤1.5 s: facts strip first, charts load lazily |
| Web fund page | LCP ≤2.5 s on a Moto-G-class device over 4G; JS on public pages ≤150 KB gzipped |

---

## 8. Assumptions and defaults chosen (no open items)

| Topic | Default chosen | Assumption / what to check |
|---|---|---|
| External import source | CAS PDF upload at launch | Add an MFCentral OTP pull only if MFCentral and Cybrilla confirm it is allowed for an ARN holder after the Sep 2025 AMFI directive (BusinessToday reports MFDs keep access) |
| SIP frequency at launch | Monthly plus step-up | Daily and weekly move to a later release; this keeps mandate and failure logic simple |
| XIRR display | From 365 days of cashflow history | Industry practice, not a regulation |
| Commission disclosure | Order-level line plus a public per-AMC range table | Rate ranges come from the AMC brokerage structures on file |
| AMC logos | Not shown | Until written AMC approvals exist (R4) |
| Ratings / rankings | None at launch | A factual category quartile may be added after compliance sign-off |
| EUIN handling | Per-order execution-only declaration captured in the UI | Compliance decides whether a platform EUIN is also sent |
| Cut-off shown to users | Platform cut-off 2:30 PM for equity/debt purchases by UPI | 30 minutes before the regulatory 3:00 PM to allow for payment realisation; adjust once Cybrilla/payment-aggregator settlement is measured |
| Jupiter | Left out | MF assumed not to be a core product there; not checked |

---

## 9. Mapping to v1 (reuse notes)

| v1 asset | Reuse |
|---|---|
| Invested-vs-value wording on Home (`investor-frontend/src/v2-ui/screens/HomeScreen.tsx:73-83`) | Port the wording and logic for pattern 21 |
| XIRR / Current-value tap-to-explain (`HomeScreen.tsx:122-123`) | Starting copy for pattern 22 |
| `fmtXirr` (fraction → %, "—" when missing) (`src/v2-ui/lib/format.ts:42`) | Port into the shared `@sanchay/format` package |
| Consent text + unticked checkbox + OTP engine (ApprovalsScreen / approvalConsent) | Move to the investor-initiated checkout (7.5) |
| Nominee tri-state + 100% allocation bar | Keep as the onboarding nominee step; update to the up-to-10-nominee rules |

---

## 10. Sources (all accessed 2026-09-25)

**Groww**
- https://groww.in/updates/groww-introduces-groww-prime-for-mutual-funds
- https://cafemutual.com/news/industry/38155-now-groww-will-act-as-a-mutual-fund-distributor-and-offer-regular-plans
- https://www.businesstoday.in/mutual-funds/story/we-are-not-shifting-groww-clears-confusion-over-mf-prime-launch-over-regular-plans-542130-2026-07-09
- https://finance.yahoo.com/news/groww-buy-wealth-management-firm-092741794.html
- https://groww.in/mutual-funds/parag-parikh-long-term-value-fund-direct-growth
- https://groww.in/mutual-funds/filter
- https://groww.in/mutual-funds
- https://groww.in/help/mutual-funds/mf-autopay/how-to-set-up-autopay--45
- https://groww.in/help/my-account/ma-bank-accounts/what-does-autopay-mandate-limit-mean--49
- https://groww.in/help/mutual-funds/mf-sip/how-to-start-a-sip-on-groww
- https://groww.in/help/mutual-funds/mf-sip/how-to-skip-an-sip-instalment--79
- https://groww.in/help/mutual-funds/mf-sip/how-to-change-sip-date-or-amount
- https://groww.in/help/mutual-funds/discoverable/what-is-step-up-sip-57
- https://groww.in/help/mutual-funds/order/i-have-cancelled-my-sip-the-amount-was-deducted-anyway-2
- https://groww.in/help/mutual-funds/order/what-is-my-current-order-status
- https://groww.in/help/mutual-funds/order/what-is-the-applicable-nav-for-my-order--70
- https://groww.in/updates/stp-on-groww
- https://groww.in/blog/how-to-start-a-stp-and-swp-on-grow
- https://groww.in/updates/xirr-feature-update-groww
- https://groww.in/help/mutual-funds/mf-dashboard/how-do-i-import-my-external-mutual-fund-investments-1
- https://groww.in/blog/how-to-track-your-external-investments-on-groww
- https://groww.in/help/mutual-funds/mf-others/how-to-download-capital-gain-report--50
- https://groww.in/help/mutual-funds/order/how-to-download-tax-statement--for-elss--77
- https://groww.in/blog/groww-feature-update-now-compare-mutual-fund-schemes-easily
- https://hyperverge.co/blog/how-to-activate-kyc-in-groww-app/
- https://apps.apple.com/in/app/groww-stocks-mutual-fund-ipo/id1404871703?see-all=reviews&platform=iphone

**Zerodha Coin**
- https://support.zerodha.com/category/mutual-funds/features-on-coin
- https://support.zerodha.com/category/mutual-funds/features-on-coin/systematic-investment-plan/articles/modify-cancel-sip-coin-app
- https://support.zerodha.com/category/mutual-funds/payments-and-orders/coin-mandates/articles/upi-autopay
- https://support.zerodha.com/category/mutual-funds/understanding-mutual-funds/about-coin/articles/xirr-on-coin
- https://support.zerodha.com/category/mutual-funds/understanding-mutual-funds/selling/articles/how-do-i-use-cdsl-t-pin-to-sell-my-mutual-funds-through-coin-appc
- https://coin.zerodha.com/mf/fund/INF879O01027/parag-parikh-flexi-cap-fund-direct-growth
- https://apps.apple.com/app/id1392892554
- https://xirrledger.com/blog/zerodha-xirr-not-showing/

**Kuvera**
- https://apps.apple.com/in/app/kuvera-by-cred-mutual-funds/id1329701793
- https://techcrunch.com/2024/02/06/cred-acquires-mutual-fund-startup-kuvera-in-wealth-management-push/
- https://kuvera.in/blog/be-smart-trade-smart/
- https://kuvera.in/dap-whitepaper
- https://kuvera.in/blog/one-time-mandate-in-sip/
- https://kuvera.in/blog/what-steps-do-i-need-to-take-to-open-an-investment-account-in-india-and-set-up-a-portfolio/
- https://kuvera.freshdesk.com/support/solutions/articles/82000726303-how-do-i-import-my-existing-portfolio-
- https://foliyo.ai/guides/mf-platforms/zerodha-coin-vs-groww-vs-kuvera/ (updated 2026-08-10)
- https://foliyo.ai/guides/mf-platforms/

**INDmoney**
- https://www.indmoney.com/mutual-funds
- https://www.indmoney.com/mutual-funds/portfolio-analytics
- https://www.indmoney.com/mutual-funds/parag-parikh-flexi-cap-fund-direct-plan-growth-option-3229
- https://www.indmoney.com/features/mutual-fund-portfolio-scan
- https://apps.apple.com/in/app/id1450178837

**ET Money**
- https://apps.apple.com/in/app/et-money-mutual-fund-sif-sip/id1212752482 (and its reviews page)
- https://inc42.com/buzz/et-money-enables-one-click-switch-from-regular-to-direct-mf-plans-for-1-7-cr-investors/
- https://techcrunch.com/2024/06/12/indias-360-one-acquires-mutual-fund-app-et-money-for-44m

**Paytm Money**
- https://www.paytmmoney.com/mutual-funds/schemes/parag-parikh-flexi-cap-fund-direct-growth/inf879o01027
- https://www.chittorgarh.com/faq_pg/paytm-money-is-direct-or-regular-mutual-fund-platform/2968/
- https://freefincal.com/online-kyc-mutual-fund/
- https://www.paytmmoney.com/blog/automate-sip-payment-upi-autopay/
- https://apps.apple.com/us/app/paytm-money-stocks-mf-ipo/id1344431352

**Dhan and Dhan Saarthi**
- https://dhan.co/mutual-funds/
- https://dhansaarthi.com/
- https://apps.apple.com/in/app/dhan-saarthi-mf-sip-investing/id6752234278

**Scripbox**
- https://scripbox.com/disclosures
- https://apps.apple.com/in/app/scripbox-mutual-fund-sip-app/id1137375075

**Fi**
- https://techcrunch.com/2026/03/11/india-neobank-fi-winds-down-banking-services-on-its-platform/

**MFCentral / data access**
- https://www.businesstoday.in/personal-finance/news/story/why-amfi-blocked-fintechs-access-to-investor-data-a-look-at-the-concerns-and-impact-494695-2025-09-18
- https://cafemutual.com/news/press-news/35828-amfi-asks-mf-central-to-stop-sharing-investor-data-with-third-party-apps
- https://casparser.in/blog/mfcentral-alternative/

**Regulation and payments**
- https://www.amfiindia.com/Themes/Theme1/downloads/FAQsonRoleofMFDsAdvts.pdf (Q1–Q18)
- https://www.amfiindia.com/uploads/AMFI_Master_Cicular_for_MF_Ds_3c7f5ee44f.pdf (AMFI/MFD-CIR/32/2025-26; §1.3.6, §5.1, §5.2.2–5.2.4)
- https://www.wrightresearch.in/blog/sebi-mutual-fund-regulations-2026/
- https://www.sebi.gov.in/legal/circulars/jun-2023/regulatory-framework-for-execution-only-platforms-for-facilitating-transactions-in-direct-plans-of-schemes-of-mutual-funds_72479.html
- https://www.angelone.in/news/sebi-mandates-two-day-processing-for-mutual-fund-sip-cancellations
- https://www.businesstoday.in/personal-finance/investment/story/upi-mdr-from-october-15-what-happens-to-auto-debit-payments-for-mutual-funds-insurance-and-ott-subscriptions-555732-2026-09-15
- https://cafemutual.com/news/industry/30894-sip-investors-can-now-set-up-e-mandate-of-up-to-rs1-lakh
- https://www.bajajamc.com/knowledge-centre/common-things-to-know-about-ltcg-on-mutual-funds
- https://productgrowth.in/insights/fintech/sebi-mutual-fund-app-regulations/ (secondary)

**v1 code (read-only)**
- `C:/Users/pc/Desktop/WeathTech_v2/investor-frontend/src/v2-ui/screens/HomeScreen.tsx:73-83,122-123`
- `C:/Users/pc/Desktop/WeathTech_v2/investor-frontend/src/v2-ui/lib/format.ts:42`
