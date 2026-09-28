<!-- source: workflow wf_1d1c9b02-593 label research:regulation (brand-renamed) | exported 2026-09-28 -->

# Platizio v2: Regulatory Compliance Register for an Online MFD (ARN) Platform Selling Regular Plans in India (verified as of 2026-09-25)

## 0. Summary and changes to what the team assumed

I read most of the rules below in the primary SEBI, AMFI and MeitY documents, downloaded straight from sebi.gov.in, amfiindia.com and the Gazette. Items marked **[S]** come only from secondary sources (press, law-firm notes, AMC copies) and need to be checked before they go into code. Items marked **[P]** were read in the primary text. "MC-2026" means the SEBI Master Circular for Mutual Funds dated 20-Mar-2026; its page numbers are PDF pages.

**What the team needs to know first:**

1. **The regulatory base changed on 1-Apr-2026.**
   - The SEBI (Mutual Funds) Regulations, 2026 replaced the 1996 Regulations. They were notified on 14-Jan-2026 (F. No. SEBI/LAD-NRO/GN/2026/294).
   - A new master circular, MC-2026 (HO/24/13/11(1)2026-IMD-POD-1/I/7602/2026, dated 20-Mar-2026), replaced the 27-Jun-2024 master circular from 1-Apr-2026.
   - Any v1 reference to "Regulations 1996" or "Master Circular June 2024" is out of date.
2. **The nomination cap is now 3, not 10.**
   - SEBI circular SEBI/HO/OIAE/OIAE_IAD-3/P/CIR/2026/12676, dated 29-May-2026, effective 01-Sep-2026, para 5.1 says: "Investors can provide up to 3 nominees."
   - It supersedes every earlier nomination circular, including the Jan-2025 one that allowed 10.
   - Guardian details for a minor nominee are now **optional**. Only name and relationship are mandatory, plus date of birth if the nominee is a minor.
   - Percentage shares are optional. If they are not given, the holding is split equally and any odd lot goes to the first nominee.
3. **The fund categories were revised.** SEBI circular HO/24/13/15(2)2026-IMD-RAC4/I/5764/2026, dated 26-Feb-2026, took effect the same day:
   - the "Solution Oriented" category (retirement and children's funds) is discontinued;
   - "Life Cycle Funds" and "Sectoral Debt" funds are new;
   - the debt categories were renamed;
   - existing schemes had to comply within 6 months (about 26-Aug-2026).
4. **An MFD's digital platform has specific disclosure duties** (AMFI Code of Conduct §4(f), in the AMFI MFD Master Circular dated 14-Jan-2026):
   - it must state plainly that the scheme is a **Regular Plan that pays commission to the MFD**;
   - it must show a prominent hyperlink to the commission rates for competing schemes;
   - it must show a prominent link to the SID, SAI and KIM on the page concerned.
5. **EUIN on execution-only transactions.**
   - Ordinarily the EUIN is mandatory. If no employee interacted with the investor, the EUIN may be left blank, but only with an investor declaration in AMFI's exact wording (§3 of this document).
   - AMFI tells AMCs to check that such transactions are "exceptional". A platform where every order is EUIN-blank will get AMC scrutiny, so this is an open item for counsel.
6. **Investors cannot be charged for execution-only transactions.**
   - MC-2026 para 16.6.1(d)(ii)(III): "the investor is not required to pay the distributor anything."
   - SEBI abolished MFD transaction charges on 08-Aug-2025.
   - No rebates, gifts, cashback or "free portfolio review" inducements are allowed (AMFI Code 1(d); AMFI FAQ Q8 and Q12).
7. **The v1 capital-gains rule "non-equity > 1095 days" is wrong for current law.**
   - Since 23-Jul-2024 the long-term threshold is 12 months for equity-oriented funds and 24 months for other non-specified funds, taxed at 12.5% without indexation.
   - "Specified mutual funds" (more than 65% in debt, units bought on or after 1-Apr-2023) are always taxed at slab rates.
   - The Income-tax Act 2025 (in force 1-Apr-2026) renumbers the sections, for example 80C becomes s.123 [S].
8. **Importing external holdings.**
   - MF Central's third-party API was suspended on AMFI's direction in Sept-2025 [S].
   - An AMFI-registered MFD cannot be an Account Aggregator data user (an FIU must be "registered with and regulated by any financial sector regulator", RBI AA Master Direction).
   - The practical route for launch is a CAS PDF the investor uploads.
9. **DPDP Rules 2025** (G.S.R. 846(E), 13-Nov-2025). Consent-manager rules start about 13/14-Nov-2026. Core fiduciary duties start about 13/14-May-2027: notice, 72-hour breach report, 1-year log retention, children's data. Until then the IT Act s.43A and SPDI Rules 2011 still apply.
10. **The CSCRF cybersecurity framework does not list MFDs** (its applicability list, para 16, does not include them). Hosting in ap-south-1 goes beyond every data-localisation expectation that applies.

---

## 1. Primary source index

| # | Instrument | Number | Date | Effective | URL | Read |
|---|---|---|---|---|---|---|
| S1 | SEBI (Mutual Funds) Regulations, 2026 | F. No. SEBI/LAD-NRO/GN/2026/294 | 14-Jan-2026 | 01-Apr-2026 | sebi.gov.in/legal/regulations/jan-2026/securities-and-exchange-board-of-india-mutual-funds-regulations-2026_99173.html (PDF: sebi_data/attachdocs/jan-2026/1768987928534.pdf) | P |
| S2 | SEBI Master Circular for Mutual Funds (MC-2026) | HO/24/13/11(1)2026-IMD-POD-1/I/7602/2026 | 20-Mar-2026 | 01-Apr-2026 | sebi.gov.in/legal/master-circulars/mar-2026/master-circular-for-mutual-funds_100491.html (PDF: sebi_data/attachdocs/mar-2026/1774024028162.pdf) | P |
| S3 | Categorization & Rationalization of MF Schemes | HO/24/13/15(2)2026-IMD-RAC4/I/5764/2026 | 26-Feb-2026 | Same day; existing schemes within 6 months | sebi.gov.in/legal/circulars/feb-2026/categorization-and-rationalization-of-mutual-fund-schemes_99983.html (PDF: attachdocs/feb-2026/1772079826878.pdf) | P |
| S4 | Modified Norms for Nomination in Demat Accounts and MF Folios | SEBI/HO/OIAE/OIAE_IAD-3/P/CIR/2026/12676 | 29-May-2026 | 01-Sep-2026 | sebi.gov.in/legal/circulars/may-2026/ease-of-doing-investments-modified-norms-for-nomination-in-demat-accounts-and-mutual-fund-folios_101703.html (PDF: attachdocs/jun-2026/1780397706130.pdf) | P |
| S5 | 2FA for transactions in MF units (extends to subscriptions) | SEBI/HO/IMD/IMD-I DOF1/P/CIR/2022/132 | 30-Sep-2022 | 01-Apr-2023 | sebi.gov.in/legal/circulars/sep-2022/two-factor-authentication-for-transactions-in-units-of-mutual-funds_63557.html | P |
| S6 | Overnight scheme online redemption cut-off at 7 PM | SEBI/HO/IMD/PoD2/P/CIR/2025/56 | 22-Apr-2025 | 01-Jun-2025 [S for date] | sebi.gov.in/legal/circulars/apr-2025/change-in-cut-off-timings-…_93541.html (now MC-2026 9.4.3) | P (via MC-2026) |
| S7 | Transaction charges paid to MFDs (abolished) | SEBI/HO/IMD/IMD-PoD-1/P/CIR/2025/115 | 08-Aug-2025 | Immediate | sebi.gov.in/legal/circulars/aug-2025/transaction-charges-paid-to-mutual-fund-distributors_95950.html | P (via MC-2026 fn 404) |
| S8 | Master Circular on KYC norms | SEBI/HO/MIRSD/SECFATF/P/CIR/2023/169 | 12-Oct-2023 | — | sebi.gov.in/legal/master-circulars/oct-2023/…_77945.html | P |
| S9 | Review of validation of KYC records by KRAs | SEBI/HO/MIRSD/SECFATF/P/CIR/2024/41 | 14-May-2024 | Systems by 31-May-2024 | sebi.gov.in/legal/circulars/may-2024/…_83367.html; FAQ: sebi_data/faqfiles/may-2024/1715694256793.pdf | P |
| S10 | CSCRF for SEBI regulated entities | SEBI/HO/ITD-1/ITD_CSC_EXT/P/CIR/2024/113 | 20-Aug-2024 | 01-Jan-2025 / 01-Apr-2025 | sebi.gov.in/legal/circulars/aug-2024/…_85964.html | P |
| S11 | Depositories and AMCs (through RTAs) as FIPs in the Account Aggregator framework | SEBI/HO/MRD/DCAP/P/CIR/2022/110 | 19-Aug-2022 | — | sebi.gov.in/legal/circulars/aug-2022/…_62157.html | S (title/number) |
| A1 | AMFI Master Circular for MFDs (includes the Code of Conduct) | AMFI/MFD-CIR/32/2025-26 | 14-Jan-2026 | Date of issue | amfiindia.com/uploads/AMFI_Master_Cicular_for_MF_Ds_3c7f5ee44f.pdf | P |
| A2 | AMFI FAQs on Do's & Don'ts for MFDs (role, advertising, execution-only) | undated | — | — | amfiindia.com/Themes/Theme1/downloads/FAQsonRoleofMFDsAdvts.pdf | P |
| A3 | AMFI BPG 97: validation of email/mobile/bank, 2FA for redemptions | 135/BP/97/2021-22 | 28-Mar-2022 | 01-Apr-2022 | AMC-hosted copy: quantumamc.com/filecdn/FAQs/AMFI-BPG-no.97.pdf | P (AMC copy) |
| M1 | DPDP Rules, 2025 | G.S.R. 846(E) | 13-Nov-2025 (Gazette) | Rules 1, 2, 17–21 at once; Rule 4 after 1 year; Rules 3, 5–16, 22, 23 after 18 months | meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa (text read from the Gazette copy at dpdpa.com) | P |
| M2 | DPDP Act 2023 commencement | S.O. dated 13-Nov-2025 | — | 13-Nov-2025 / 13-Nov-2026 / 13-May-2027 | egazette.gov.in | S |
| R1 | RBI Master Direction, NBFC Account Aggregator | RBI/DNBR/2016-17/46 | 02-Sep-2016, updated 06-Sep-2024 | — | rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=10598 | P (definitions) |

---

## 2. Findings by topic

### 2.1 Execution-only transactions and EUIN (topic 1)

| Requirement | Exact value / text | Source | Date / effective |
|---|---|---|---|
| EUIN exists | AMFI assigns a unique identity number to the employee, relationship manager or salesperson who interacts with the investor, in addition to the ARN. The application form must have a field for it. | MC-2026 16.11.1–16.11.2 (p.256), from SEBI CIR/IMD/DF/21/2012 | 13-Sep-2012; in force |
| ARN plus EUIN needed to transact in Regular Plans and earn commission | SEBI letter SEBI/IMD1/DoF-1/SK/2021/25517/1 (06-Sep-2021): all distribution entities "have to quote a valid ARN and Employee Unique Identification Number (EUIN), in order to place transactions in Regular Plan and receive commissions". MFDs cannot deal in Direct Plans. | A1 §5.2.1 (p.17–18); Code §4(f) | In force |
| Online platforms | "Channel distributors and on-line distributors shall be advised to provide the EUIN in the electronic transaction feeds." AMCs validate the EUIN against the ARN mapping held by CAMS for AMFI. | A1 §5.2.2(b),(d) | AMFI BPG 33/37/40 (2012–13) |
| Missing or invalid EUIN | The transaction is processed in the Regular Plan. The investor gets 30 days to supply a valid EUIN or switch to Direct. After 30 days the commission is forfeited permanently. | A1 §5.2.3 (AMFI BP 135/BP/111/2023-24, 02-Feb-2024) | In force |
| Execution-only with no interaction (exact declaration) | "I/We hereby confirm that the EUIN box has been intentionally left blank by me/us as this an "execution-only" transaction executed without any interaction or advice by the employee/relationship manager/sales person of the above distributor/sub-distributor or notwithstanding the advice of in-appropriateness, if any, provided by the employee/relationship manager/sales person of the distributor/sub-distributor." AMCs take it "separately signed by the investor". AMCs "shall periodically conduct review… and ensure that such transactions are indeed exceptional cases." | A1 §5.2.4(b)–(c) (p.19) | In force |
| Quoting an EUIN does not make a transaction "advisory" | "a mere quoting of EUIN will not give an 'advisory' character to the transaction" | A1 §5.2.4(a) | In force |
| Two relationship types only | Advisory (the appropriateness principle applies, no exceptions) or Execution Only. For execution only: if the distributor "has information to believe" the transaction is not appropriate, it must send a written communication that the investor acknowledges, and obtain a confirmation before execution. The investor "is not required to pay the distributor anything". "There shall be no third categorization." | MC-2026 16.6.1(d) (p.253–254); fn 404 = S7 | In force |
| AMFI explanation | "Execution only… (For example, MFDs providing online transaction platform services to their mutual fund clients who decide the scheme and invest on their own.)" Records of risk profile, suitability and consent/dissent must be kept. | A2 Q6–Q7, Q15 | — |

### 2.2 MFD conduct, disclosures, advertising, suitability (topic 2)

| Requirement | Exact value / text | Source |
|---|---|---|
| Code of Conduct binding | All ARN holders and their representatives must follow the AMFI Code of Conduct (revised 07-Apr-2022). AMCs must report breaches and must not deal with MFDs who breach it. | MC-2026 16.7 (p.255); A1 Ch.7 |
| Fiduciary duty | The investor's interest is paramount. Financial incentive must not be the basis for recommending. "shall not rebate or pass-back commission… refrain from attracting investors through inducement of rebate or gifts / gift-vouchers". No churning. | A1 Code B.1(a)–(e) |
| Commission disclosure (general) | "The distributors shall disclose all the commissions (in the form of trail commission or any other mode) payable to them for the different competing schemes of various Mutual Funds from amongst which the scheme is being recommended to the investor." | MC-2026 11.5.6 (p.189); Code 4(c) |
| **Digital-platform disclosures (Regular vs Direct)** | "MFDs cannot deal in Direct Plans. MFDs shall ensure that on any digital platform provided by MFD… it is categorically disclosed that the scheme the investor is subscribing to is of Regular Plan which involves payment of commission to MFD. The link for the rate of commission received or receivable by the MFD for the different competing schemes… shall be prominently displayed on the platform… as a hyperlink. Further, a link to the scheme offer documents (SID/SAI/KIM) shall also be prominently displayed on the concerned page." | A1 Code 4(f) (p.35) |
| Limited product universe | The MFD must disclose which mutual funds it is affiliated with, and tell clients the information is limited to those products and that they may consider alternatives. | Code 4(d) |
| No indicative or assured returns | No indicative portfolio, yield or return, and no assured returns. | Code 4(g); MC-2026 14.4.1 |
| Marketing material | "MFDs shall use marketing material as is provided to them by the AMCs and shall not design their own marketing materials in respect of any scheme or display the name, logo, mark of any AMC without the prior written approval of the AMC." AMC prior approval is needed for write-ups or performance comparisons that name a scheme. | Code 4(k); A2 Q13 |
| Cannot call itself an adviser | Under SEBI IA Regs reg. 3(3), MFDs must not use "Adviser / Advisor / Financial Adviser / Investment Adviser / Wealth Adviser / Wealth Manager / Consultant" or similar names. No "financial planning" wording. | Code 5(g); A2 Q2, Q8 |
| Tagline | "AMFI-registered Mutual Fund Distributor" with the name and ARN code, font at least 12 in printed communication, and clear and legible in all forms (website, mobile app, etc.). | Code 5(g) (p.37) |
| Social media | Educational content only. No scheme-specific recommendations or past-performance claims. The ARN must be disclosed. | A2 Q9–Q10 |
| Advertisement Code (AMC ads; MFDs must comply per Code 2(a)) | Ads must be accurate, true, fair and clear. They must not contain "testimonials or any ranking based on any criteria". No projections, no celebrities. Standard warning: **'Mutual Fund investments are subject to market risks, read all scheme related documents carefully.'** No words may be added or removed. Vernacular ads carry the vernacular version. In audio-visual ads the 14 words must run for at least 5 seconds with voice-over. | S1 Fifth Schedule (Reg. 28) (p.197) |
| Suitability / risk profiling | Code 2(d): the MFD "should seek information… about their financial status, investment experience and investment objectives". AMFI FAQ Q5: MFDs are "obligated… to do risk profiling" when recommending. Execution-only: the inappropriateness warning, acknowledgement and confirmation route. | A1 Code 2(d); A2 Q5–Q7; MC-2026 16.6.1(d) |
| Empanelment | The MFD must be empanelled with each AMC. AMCs accept business only from empanelled distributors (AMFI 135/BP/107/2022-23, 04-May-2023). | A1 Ch.4; MC-2026 16.8 |
| Service agreement for platforms | "In case of transactions through service providers/platforms other than stock exchanges, AMCs shall ensure that the transactions… can be executed only if there is a service agreement between the AMC and the service provider / platform." | MC-2026 17.3.2 (p.261) |
| No pooling | MFDs and platforms must not accept or handle funds in proprietary or pool accounts. Pay-in goes from the investor's account directly to the scheme account. Payment aggregators authorised by RBI may be used. Redemptions go directly to the investor's registered bank account. Mandates must not be in the MFD's name. | MC-2026 17.3.1–17.3.4 (p.261–263) |
| AMC liability for platform fraud | AMCs must compensate unauthorised transactions caused by "platform providers, MFDs, RTAs…". Expect contractual control requirements from AMCs. | MC-2026 17.4.7 (p.268) |
| Additional incentive (B-30 cities and women) | 1% of the first lumpsum (maximum ₹2,000, conditional on staying invested 1 year) or 1% of first-year SIP (maximum ₹2,000) for new-PAN investors from B-30 cities or new women investors. Paid by the AMC, so the gender and city captured must be truthful. | MC-2026 11.6 (p.189–190) (S-circular 27-Nov-2025) |

### 2.3 Fund page disclosures (topic 3)

| Item | Exact value | Source |
|---|---|---|
| Riskometer levels and colours | Low `#08A04B`; Low to Moderate `#7FFF00`; Moderate `#FFFF33`; Moderately High `#C68E17`; High `#FF8C00`; Very High `#F70D1A`. Caption: "The risk of the scheme/benchmark is [level]". Evaluated monthly and published within 10 days of month end. | MC-2026 6.16.1(d)–(j) (p.95–97); SEBI/HO/IMD/PoD1/CIR/P/2024/150 (05-Nov-2024) |
| Riskometer placement | The scheme riskometer wherever performance is shown. Scheme **and benchmark** riskometers wherever performance against the benchmark is shown. | MC-2026 6.17.1 (p.98) |
| Debt Potential Risk Class (PRC) matrix | 9 cells. Interest-rate class I (Macaulay duration up to 1 year), II (up to 3 years), III (any). Credit class A (CRV ≥ 12), B (≥ 10), C (< 10). | MC-2026 6.18 |
| TER | Disclosed daily, scheme-wise, on AMC and AMFI sites. Formula: **TER = BER + Brokerage + Transaction cost + Statutory levies (incl. GST)**. A direct plan cannot charge more than the regular plan under any head. BER changes need 3 working days' notice. | MC-2026 11.2.2–11.2.4, 11.3.5, 11.4 (p.186–187) |
| SID / KIM / SAI | Published on AMC websites. MFD platforms must link them prominently on the page concerned. | MC-2026 6.8.1; A1 Code 4(f) |
| Standardised performance (AMFI dashboard) | CAGR against the benchmark **TRI** for 1, 3, 5, 10 years and since inception. Liquid, overnight, ultra-short, low-duration and money-market schemes also show 7 days, 15 days, 1, 3 and 6 months. Schemes under 1 year old are exempt, except the short-duration categories just listed. | MC-2026 6.9.1 |
| Performance in advertisements | CAGR for 1, 3, 5 years and since inception, plus point-to-point value on ₹10,000, computed to the preceding month end. State whether Regular or Direct, with the footnote that plans have different expense structures. **No performance if under 6 months old**; 6–12 months uses a simple annualised rate. Additional benchmark: equity uses Sensex/Nifty; debt of 1 year or less and arbitrage use the 1-year T-Bill; other debt uses the 10-year GOI. Performance of the fund manager's other schemes must be shown (top 3 and bottom 3 if more than 6). | MC-2026 14.2 (p.232–235) |
| Information Ratio | AMCs disclose IR for equity schemes daily (SEBI/HO/IMD/IMD-PoD-2/P/CIR/2025/6, 17-Jan-2025). | MC-2026 6.10 |
| NAV rounding | 4 decimals for index and debt funds; 2 or more for others. | MC-2026 9.1.3 |
| EOP minimum disclosures (useful checklist; EOPs are Direct-only, so not binding on Platizio) | Fund name and link; scheme name, type and category; fund manager; objective; performance **with source**; minimum investment, AUM, NAV, exit load, expense ratio; riskometer and PRC. Screener must have "no auto display of recommendation or ranking". | MC-2026 Annexure 12A (p.458), 19.10.4 |

### 2.4 Nomination (topic 4): the conflict resolved

The primary text settles it: **SEBI/HO/OIAE/OIAE_IAD-3/P/CIR/2026/12676, 29-May-2026, effective 01-Sep-2026.**

- Para 15: it supersedes all earlier nomination circulars, including "SEBI/HO/OIAE/OIAE_IAD-3/P/ON/2025 dated January 10, 2025" and the 2025/0027, 2025/110 and HO/42/36/12(4)2025 circulars.
- Para 5.1: "Investors can provide up to 3 nominees."
- Para 4.1: nomination is mandatory for single-holder folios opened on or after the effective date, unless the Annexure-B opt-out is submitted. Para 4.2: optional for joint folios. Para 4.3: all joint holders must consent.
- Para 6.2, online validation: "Digital Signature Certificate; or Aadhaar-based e-sign…; or Two factor authentication (2FA) in which one of the factors shall be a One-Time Password (OTP) sent to the registered mobile number **and** email address of the investor." Offline: wet signature with no witness; a thumb impression needs 2 witnesses.
- Para 7(a), mandatory fields: nominee name and relationship; **date of birth only if the nominee is a minor.**
- Para 7(b), optional fields: nominee mobile and email; % share; ID (Aadhaar last 4 digits, PAN, driving licence or passport); **guardian details if the nominee is a minor.** If % is not given, the holding is split equally and "Any odd lot… transferred to the first nominee". Para 7(c): the entity must offer all optional fields.
- Para 8, opt-out: either the Annexure-B form, or online, where "the regulated entity shall display the declaration message in Annexure-B. The investor shall have to agree by choosing this option". The Annexure-B text runs: "I hereby confirm that I do not wish to appoint any nominee(s)…", then points (i)–(iii) on transmission delays and IEPF transfer, then "…my decision to opt out of nomination is voluntary."
- Para 9: the investor may change nominations any number of times, and gets an acknowledgement each time.
- Para 10.1: statements print either nominee names or "Yes/No", as the investor chose. Para 10.2: RTAs send twice-yearly SMS/email nudges and a pop-up "on the first log-in of the day" for folios without a nomination.
- Para 11: applies to existing folios as well.
- MC-2026 15.14 (p.247–248) still quotes the old text (online opt-out validated by e-sign or 2FA; the 2024 freeze deadline). S4 is later and supersedes it, but **validating opt-out with 2FA is the conservative choice** and matches the v1 design.
- MF Regulations 2026 Reg. 27: the nominee may also be authorised to transact if the unitholder is incapacitated.

### 2.5 2FA (topic 5)

| Event | Rule | Source |
|---|---|---|
| Subscription and redemption, online, non-demat | "Two-Factor Authentication… One of the Factors… shall be a One-Time Password sent to the unit holder at his/her **email/ phone number registered with the AMC/RTA**." Offline uses the signature method. Demat follows the depository process. | S5; MC-2026 17.4.5 (p.268). Redemption effective 01-Jun-2022 (non-exchange); subscription effective 01-Apr-2023 |
| SIP / STP / SWP / mandates | "in case of mandates/systematic transactions the requirement of Two-Factor Authentication shall be applicable **only at the time of registration**" | same |
| Switch | Switch-out is treated as a redemption and switch-in as a purchase (MC-2026 9.4.1(e)). Apply 2FA (conservative reading; not stated explicitly). | MC-2026 9.4.1 |
| Nomination and opt-out | OTP to the registered mobile **and** email, or e-sign or DSC. | S4 para 6.2 |
| Contact change | OTP to the other registered contact. If both change, OTP to the old contacts or bank-account authentication. | A3 §VII |
| Contact integrity | Platforms should authenticate contacts before submitting to the RTA. RTAs remove MFD or employee contacts seeded in investor folios. A shared contact across PANs needs a "Family" declaration (self, spouse, dependent children, siblings or parents, guardian). | A3 §III–VI; S8 para 32 |
| OTP length, expiry, attempts | **Not prescribed** by SEBI or AMFI. The v1 values (6 digits, 5 minutes, 5 attempts) are a platform choice. | — |
| e-mandate AFA (bank side) | RBI exempts additional factor authentication for recurring MF-subscription debits **up to ₹1,00,000**. Pre- and post-debit notifications continue. | RBI/2023-24/88 (Dec-2023) [S]; now within RBI "Digital Payments – E-mandate Framework, 2026" [S] |

### 2.6 Cut-off and NAV (topic 6); MC-2026 9.4, p.163–166 [P]

- **Purchase and switch-in:**
  - Liquid and overnight: application and funds by 1:30 pm → NAV of the day immediately before the day of receipt. After 1:30 pm → NAV of the day before the next business day. Funds arriving later → NAV of the day before the day funds are available.
  - All other schemes: "Closing NAV of the day on which the funds are available for utilization shall be applicable irrespective of the size and time of receipt"; the funds cut-off is **3:00 pm**.
  - NAV is assigned only when both the application and the realised funds are in the scheme account. Credit facilities cannot be used (9.4.2(b)–(e)). SIP and STP instalments follow the same realisation rule.
- **Redemption and switch-out:**
  - Liquid and overnight: by 3:00 pm, **or by 7:00 pm for online applications in overnight funds** → NAV of the day before the next business day. After those times → next business day.
  - Others: by 3:00 pm → same day. After 3 pm or on a non-business day → next business day.
- Exclusions: international schemes and transactions on stock exchanges (9.4.3(c)).
- "Business Day" excludes days when money markets are closed (9.4.5).
- A switch-in amount equals the switch-out payout (9.4.1(f)).
- NAV timing: 11 pm on T for most schemes; 10 am on T+1 for FoFs and overseas schemes; 9 am on T+1 for ETCD schemes (9.3.4).
- Redemption proceeds are due within 3 working days (5 for overseas schemes), with 15% p.a. interest for delay (15.3–15.4).
- Instant access: overnight and liquid funds only, the lower of ₹50,000 or 90% of value, per day per scheme (15.11).
- SIP cancellation must be processed within T+2 working days from 01-Dec-2024 (SEBI letter SEBI/HO/OW/IMD-SEC1/P/2024/33679/1) [S].
- A minor's SIP, STP and SWP are suspended when the minor turns 18 (15.13.4).

### 2.7 ELSS, exit load, stamp duty (topic 7)

- **ELSS category:** at least 80% in equity, open-ended, "with attributes in accordance with Equity Linked Saving Scheme, 2005" (S3 Equity #13).
- **ELSS lock-in:**
  - Notification No. 226/2005 (03-Nov-2005): "investment in the plan will have to be kept for a minimum period of three years from the date of allotment of units". Transfer or pledge is allowed only after 3 years [S].
  - Each SIP instalment has its own allotment date, so **each unit lot unlocks 3 years after its own allotment**. That rule is derived from the notification, not quoted.
  - Redemption, switch-out, STP-out and SWP apply only to unlocked lots.
  - The deduction is available under the **old regime only**: ₹1.5 lakh under s.80C of the 1961 Act, which becomes s.123 of the Income-tax Act 2025 from tax year 2026-27 [S]. Counsel should verify.
- **Exit load:**
  - No entry load.
  - Repurchase price = applicable NAV × (1 − exit load).
  - No load on bonus units, IDCW reinvestment, or a Regular↔Direct switch within the same scheme.
  - Load changes apply only to new investments (MC-2026 9.2, 11.7).
  - Life Cycle Funds: 3% within 1 year, 2% within 2 years, 1% within 3 years (S3 Annexure B para 3).
- **Stamp duty:** 0.005% on issue of units (purchase, SIP, switch-in, STP-in, reinvestment) and 0.015% on transfer, none on redemption, from 01-Jul-2020 under the Indian Stamp Act as amended by Finance Act 2019. Notification references S.O. 1226(E) and G.S.R. 226(E) dated 30-Mar-2020 [S]. The amount is computed by the AMC, so the platform should show it as an estimate.

### 2.8 Scheme categorisation (topic 8): the catalogue taxonomy

S3, 26-Feb-2026 [P]. Scheme name must equal the category name, with no return-emphasising words (2.6.5).

- **A. Equity (13):**
  - Multi Cap (at least 75% equity: 25% large, 25% mid, 25% small)
  - Large Cap (≥ 80% large)
  - Large & Mid Cap (≥ 35% each)
  - Mid Cap (≥ 65%)
  - Small Cap (≥ 65%)
  - Flexi Cap (≥ 65% equity)
  - Dividend Yield (≥ 80%)
  - Value (≥ 80%)
  - Contra (≥ 80%; overlap with Value ≤ 50%)
  - Focused (≤ 30 stocks, ≥ 80%)
  - Sectoral (≥ 80%)
  - Thematic (≥ 80%; ESG funds sit here per para 3.11)
  - ELSS – Tax Saver (≥ 80%)
- **B. Debt (17):**
  - Overnight
  - Liquid (up to 91 days)
  - **Ultra Short Term** (Macaulay duration 3–6 months)
  - **Ultra Short to Short Term** (6–12 months)
  - Money Market (up to 1 year)
  - **Short Term** (1–3 years)
  - **Medium Term** (3–4 years)
  - **Medium to Long Term** (4–7 years)
  - **Long Term** (more than 7 years)
  - Dynamic Term
  - Corporate Bond (≥ 80% in AA+ and above)
  - Credit Risk (≥ 65% in AA and below)
  - Banking & PSU Debt
  - Gilt
  - 10-year Constant Maturity Gilt
  - Floating Interest Rates
  - **Sectoral Debt** (≥ 80%, AA+ and above; sectors: Financial Services, Energy, Infrastructure, Housing, Real Estate)
- **C. Hybrid (7):** Conservative Hybrid (10–25% equity), Balanced Hybrid (40–60%, no arbitrage), Aggressive Hybrid (65–80%), Dynamic Asset Allocation, Multi Asset Allocation (at least 3 asset classes, ≥ 10% each), Arbitrage (≥ 65% equity), Equity Savings (≥ 65% gross, 15–40% net equity, ≥ 10% debt).
- **D. Life Cycle Funds:** target-date funds with tenures of 5–30 years in multiples of 5, at most 6 open per AMC, glide-path allocation, maturity year in the name (for example "Life Cycle Fund 2045").
- **E. Other:** Index Funds / ETFs (≥ 95%); FoFs, domestic or overseas (≥ 95%).
  - FoF sub-categories (Annexure C): Equity-oriented Diversified; Sectoral/Thematic; Debt-oriented; Hybrid (Aggressive, Conservative, Income plus Arbitrage, Dynamic Asset Allocation, Multi Asset); Commodity; Overseas (Country, Region, Thematic, Debt); Domestic+Overseas. Each can be Active, Passive or "Omni".
- **Discontinued:** Solution Oriented (Retirement, Children's). Subscriptions stopped immediately and the schemes are to be merged (2.6.3.16). Keep a `LEGACY_SOLUTION_ORIENTED` value only for mapping existing holdings.
- **Name-drift caveat:** MC-2026 paras 6.9.1, 11.6.6 and 2.6.3.14 still say "Ultra Short Duration" and "Low Duration". Map both the old names and AMFI's NAVAll.txt category strings onto the new values, with an admin override.

### 2.9 KYC (topic 9)

- **KRA attributes:** within 2 days of receiving a record, the KRA verifies PAN (including PAN-Aadhaar link under Rule 114AAA), name and address, plus mobile and email (S8 paras 96–97 as amended by S9).
  - **Validated:** verified against official databases (ITD, Aadhaar XML, DigiLocker or mAadhaar) with the PAN-Aadhaar link verified. The record is portable across intermediaries (S9 para 2.2; S8 para 101).
  - **Registered:** email or mobile validated but the document could not be independently validated. The investor can keep transacting with existing intermediaries or MFs, but a new intermediary or MF needs the KYC documents again (CAMS FAQ A5/A8 [RTA source]; SEBI FAQ Q12).
  - **On-Hold / Rejected:** attributes could not be verified, so "shall not be allowed to transact further… until the attributes are verified" (S8 para 99; SEBI FAQ Q42).
  - Existing clients as of 31-Mar-2024 whose attributes cannot be verified may still exit (redeem) (FAQ Q45).
  - Product rule: **block purchases and SIP registration on On-Hold or Rejected**; allow redemption only after checking the AMC/RTA policy.
- **CKYC:** the SEBI-registered intermediary uploads to CKYCR within 10 days, using the CERSAI template (S8 paras 114–116).
- **Aadhaar eKYC / DigiLocker / IPV:** "IPV shall not be required where KYC was completed using Aadhaar authentication/verification of UIDAI, or the KYC form was submitted online with documents through DigiLocker or another online-verifiable source" (S8 para 61). IPV can be done by AMCs or by NISM-certified, KYD-complete distributors (para 58). Video IPV is permitted (para 60). The investor's express consent is needed before online KYC (para 35).
  - Aadhaar e-KYC authentication is limited to KUA and sub-KUA entities (paras 62–64), and e-KYC Setu is open to "Registered Intermediaries" (SEBI press release 30-Jun-2025 [S]). **An ARN holder is not a SEBI-registered intermediary**, so KRA upload, CKYC upload and Aadhaar authentication must go through a partner (AMC/RTA, a KRA-member intermediary, or the Cybrilla POA arrangement).
- **Fields to collect from the investor, never defaulted:**
  - CKYC template: name, father's or spouse's name, mother's name, date of birth, **gender**, marital status, citizenship, **residential status**, **occupation type** (Service: Private/Public/Govt; Business; Professional; Self-employed; Retired; Housewife; Student; Not categorised), addresses, mobile, email [S: template copies].
  - AML/CDD (PML Rules): **PEP or related-to-PEP** status for enhanced due diligence.
  - FATCA/CRS self-certification (Income-tax Rules 114F–114H; Form 61B; possibly renumbered under the 2026 Rules [S]): **country of birth / place of birth, nationality, tax residency in any country other than India plus TIN and TIN type for each, address type**.
  - Additional KYC commonly required by AMCs/RTAs: **gross annual income slab**, source of wealth, occupation.
  - SEBI FAQ Q30–31: penny-drop verification removes the need for a cancelled cheque. The cheque fallback applies only when the penny drop fails or the bank does not respond.
- **Aadhaar data:** store the masked number (last 4 digits) only. Never persist the full Aadhaar number or biometrics (Aadhaar Act s.29 read with S8). Get counsel to confirm the storage rules.

### 2.10 External holdings import (topic 10)

| Route | Status (2026-09) | Practical for a startup MFD? |
|---|---|---|
| **CAMS/KFintech CAS PDF** (investor-chosen password) or depository CAS (PAN-based password), uploaded by the investor | Always available. Depository CAS covers MF units too (SEBI/HO/MRD/PoD1/CIR/P/2025/16, 14-Feb-2025, cited in MC-2026 fn 366) [S on content] | **Yes, the launch path.** Needs DPDP-grade notice and consent. Parse in memory, discard the password, delete the PDF after parsing unless the investor consents to keep it. |
| MF Central (CAMS+KFin) API with OTP consent | Third-party data sharing suspended on AMFI's direction in Sept-2025. CAMS said access would be tightened (Nov-2025) [S] | **Not available** until resumed. Recheck with CAMS/KFin. |
| Account Aggregator (RTAs and depositories as FIPs) | FIU = "an entity registered with and regulated by any financial sector regulator" (R1). SEBI enabled AMCs (via RTAs) and depositories as FIPs (S11) | **Not directly.** An AMFI-registered MFD does not qualify as an FIU. It would need an RIA, PMS, broker or NBFC licence, or an FIU partner. |

Conduct limits on the imported view: data may be used only for the investor's own dashboard and must not be shared with group companies for cross-marketing (Code 2(f)–(g)). Do not use "free portfolio review" as an inducement (A2 Q8, Q12). Prompting investors to move external Direct-plan holdings into Platizio Regular plans is advisory and a mis-selling risk.

### 2.11 Data protection and localisation (topic 11)

- **DPDP Act 2023 and Rules 2025 (G.S.R. 846(E), 13-Nov-2025) [P]:**
  - **Rule 1(2)–(4):** Rules 1, 2 and 17–21 apply at once. Rule 4 (Consent Managers) applies from **~13-Nov-2026**. Rules 3 and 5–16 apply from **~13-May-2027**.
  - **Act phases [S]:** Board sections from 13-Nov-2025; s.6(9) and s.27(1)(d) from 13-Nov-2026; the rest from 13-May-2027.
  - **Draft acceleration [S]:** MeitY's Jan-2026 proposal to shorten Significant Data Fiduciary timelines has not been confirmed as gazetted.
  - **Rule 3, notice:** stand-alone and in plain language; an itemised list of personal data; the specific purposes; how to withdraw consent (as easy as giving it), exercise rights and complain to the Board.
  - **Rule 6, security:** encryption, obfuscation, masking or tokenisation; access control; logs and monitoring; backups; **logs and personal data kept for 1 year**; security clauses in processor contracts.
  - **Rule 7, breach:** tell each affected person without delay (nature, consequences, mitigation, safety steps, contact). Tell the Board without delay, then send a detailed report **within 72 hours**.
  - **Rule 8(3):** keep personal data, traffic data and processing logs for at least 1 year. Rule 8(1)–(2), erasure after inactivity with 48 hours' notice, applies only to the Third Schedule classes. Retention required by other laws (PMLA/AMC records) overrides erasure.
  - **Rule 9:** publish the DPO or contact person. **Rule 14:** publish how to exercise rights; grievances answered within **90 days**.
  - **Rule 10, children:** verifiable parental consent before processing a child's (under 18) data. Minors are out of scope as investors, but a minor nominee's date of birth is child data.
  - **Rule 15:** cross-border transfer subject to government orders.
- **Until the DPDP rules commence:** the IT Act s.43A and SPDI Rules 2011 apply (financial information is sensitive personal data), which means a privacy policy, consent and a grievance officer. Assumption: DPDP s.44(2) repeals s.43A from 13-May-2027 [S].
- **CSCRF (S10):** applies to AIFs, BTIs, CCs, CIS, CRAs, custodians, DTs, depositories, DDPs, DPs, IAs/RAs, **KRAs**, MBs, **MFs/AMCs**, PMs, **RTAs**, brokers, exchanges and VCFs. **MFDs are not listed.** For those entities, "Regulatory Data" must stay "within the legal boundaries of India". AMFI Code 3(b) asks MFDs for adequate cyber-security, and AMCs may impose CSCRF-like terms contractually.
- **RBI payment data localisation** (06-Apr-2018 [S]) binds payment system operators and payment aggregators, not the MFD.
- **SEBI digital accessibility** (SEBI/HO/ITD-1/ITD_VIAP/P/CIR/2025/111, 31-Jul-2025; audit and remediation extended to 31-Oct-2026 [S]) binds SEBI regulated entities. For an MFD it is good practice.

---

## 3. Compliance requirement register (mapped to product features)

"Reg" gives the source from §1–2.

| ID | Level | Requirement | Feature / component | Reg |
|---|---|---|---|---|
| C-01 | MUST | Every order carries the platform **ARN**, plus either a valid mapped **EUIN** or EUIN blank with the execution-only declaration flag. Never send an order to the provider without these (v1 builders had neither). | Order builder, Cybrilla adapter | 2.1 |
| C-02 | MUST | For EUIN-blank orders, capture the investor's execution-only declaration in the exact AMFI wording (§2.1), as a 2FA-consented, hash-snapshotted record per order and per SIP/STP/SWP registration. | Consent engine | A1 §5.2.4 |
| C-03 | MUST | Every scheme, order and confirm screen says it is a **Regular Plan that pays commission to Platizio (the MFD)**. A prominent link to commission rates for competing schemes. A prominent link to the SID, SAI and KIM on the fund and order pages. | Fund page, order review | Code 4(f), 4(c); MC 11.5.6 |
| C-04 | MUST | Brand footer, app "About" and all communications show "AMFI-registered Mutual Fund Distributor", the registered name and ARN. No "advisor/adviser/wealth manager/consultant/financial planning" wording anywhere, including domain and app-store copy. | Design system, copy | Code 5(g); A2 |
| C-05 | MUST | No investor fees for MF transactions, and no cashback, rebates, gifts, referral rewards tied to investing, or "free portfolio review" inducements. | Pricing, growth features | MC 16.6.1(d)(ii)(III); S7; Code 1(d); A2 Q8 |
| C-06 | MUST | Standard warning, exact wording with no edits: "Mutual Fund investments are subject to market risks, read all scheme related documents carefully." Shown on fund pages, promotions and ads, and in vernacular versions. | Web, native, ads | S1 Fifth Schedule (i)–(k) |
| C-07 | MUST | No testimonials, no "ranking based on any criteria", no return projections or slogans in promotional content. Catalogue sorting and filtering only as the user chooses, with a neutral default order and no "top/best funds" lists (see OI-2). | Catalogue, marketing | Fifth Schedule (b); MC Annexure 12A/19.10.4 (by analogy) |
| C-08 | MUST | Riskometer for the scheme and its benchmark using the exact 6 levels and hex colours and the caption "The risk of the scheme is …". PRC cell for debt schemes. Updated monthly from AMC/AMFI data. | Fund page, fund-facts admin | MC 6.16–6.18 |
| C-09 | MUST | Performance on fund pages: **Regular-plan** NAV-based CAGR (1, 3, 5, 10 years, since inception) against the benchmark TRI, with the source and "as of" date. No performance for schemes under 6 months old. Never show Direct-plan returns for a scheme sold as Regular. TER shown is the Regular-plan TER. | NAV/returns engine | MC 6.9, 14.2 |
| C-10 | MUST | Show exit load, minimum investment, AUM, NAV and date, fund manager, objective, category (§2.8 taxonomy) and scheme type in the uniform description. | Fund page, FundFactsProvider | MC Annexure 12A (benchmark); S3 2.6.5 |
| C-11 | MUST | **2FA** (OTP to the investor's own email or mobile registered with the AMC/RTA) before **any** provider write: lumpsum, redemption, switch, and registration of SIP, STP, SWP and mandates. Consent snapshot hashed from persisted values, one-time use. | Consent/2FA engine (fixes v1 must-fix a/b) | S5; MC 17.4.5 |
| C-12 | MUST | Nomination and opt-out validated by OTP to **both** the registered mobile and email (or e-sign). | Nomination module | S4 6.2 |
| C-13 | MUST | Nomination rules: **max 3**; mandatory name and relationship; date of birth if minor; optional % (equal split and odd lot to first nominee if blank), contact, ID, guardian; all optional fields offered; print choice (names or Yes/No); acknowledgement per change; unlimited changes. Single-holder folios need a nomination or an explicit Annexure-B opt-out, with the declaration shown verbatim. | Onboarding, profile | S4 paras 4–10 |
| C-14 | SHOULD | Nudge on first login of the day for investors without a nomination; hide it once nominated. | App shell | S4 10.2 (RTA obligation; mirror it) |
| C-15 | MUST | Cut-off and NAV engine: purchases in non-liquid schemes get the NAV of the day funds are realised (3 pm funds cut-off). Liquid/overnight purchases use the 1:30 pm rules. Redemptions use 3 pm, or 7 pm for online overnight. Business-day calendar excludes money-market holidays. International schemes excluded. Show the "expected NAV date" before consent. | Order service, holiday calendar (v1 must-fix e) | MC 9.4 |
| C-16 | MUST | ELSS: per-lot 3-year lock-in from allotment date. Block redemption, switch-out, STP-out and SWP on locked lots, and validate **before** consent. Tax-saving summary labelled old-regime only. | Holdings lots, redemption availability (v1 must-fix c/f) | ELSS 2005 [S]; S3 |
| C-17 | MUST | Show stamp duty of 0.005% on purchase, SIP, switch-in and STP-in as an estimate (AMC computes). Never on redemption. | Order review | Stamp Act [S] |
| C-18 | MUST | Payments go directly from the investor's own verified bank account to the scheme account through an RBI-authorised payment aggregator or the AMC-approved rail. No Platizio pool or nodal account; mandates never in Platizio's name. Redemptions to the registered bank account only. | Payments/mandates | MC 17.3–17.4 |
| C-19 | MUST | Contacts must belong to the investor. Block Platizio employee or partner contacts. Family declaration when a contact is shared across PANs. OTP to verify each contact before submitting it. | Onboarding, contact verification (v1 honesty rule) | A3; S8 para 32 |
| C-20 | MUST | KYC gating on KRA status: Validated → transact; Registered → KYC re-submission flow for new AMCs; On-Hold/Rejected → block purchase and SIP, show remediation. PAN–Aadhaar link check. | KYC decision engine | S8 99–101; S9 |
| C-21 | MUST | Collect from the investor, never default: gender, marital status, occupation type, income slab, PEP/RCA status, residential status, nationality, country and place of birth, other tax residencies plus TIN, source of wealth. | Onboarding forms (v1 must-fix i) | CKYC template; PML Rules; IT Rules 114F–H [S] |
| C-22 | MUST | Aadhaar e-KYC, DigiLocker, e-sign, KRA and CKYC uploads only through a licensed partner (KUA/sub-KUA or a SEBI-registered intermediary). Store Aadhaar masked to the last 4 digits only. | KYC integration | S8 58–64; Aadhaar Act |
| C-23 | MUST | Execution-only appropriateness: if a risk profile (optional questionnaire) or other data shows a mismatch (for example scheme risk above profile), show a written inappropriateness warning. Require acknowledgement and confirmation before the order, and store it. | Order flow, risk profile | MC 16.6.1(d)(ii); A2 Q5–Q7 |
| C-24 | MUST | Transact only in AMCs where Platizio is empanelled and has a service agreement (directly or through the Cybrilla/exchange route). Catalogue "investable" flag driven by empanelment. | Fund catalogue admin | MC 17.3.2; A1 Ch.4 |
| C-25 | MUST | AMC name and logo shown only with AMC written approval. No self-designed scheme marketing material. | Brand assets, SEO pages | Code 4(k); A2 Q13 |
| C-26 | MUST | External (CAS) holdings kept strictly separate. Used only for the investor's own view. No sharing for cross-marketing. Explicit consent. Password never stored. PDF deleted after parsing unless the investor consents. | CAS import | Code 2(f)–(g); DPDP R3, R6 |
| C-27 | MUST | Capital-gains engine on current law: equity-oriented funds are long-term after more than 12 months (STCG 20%, LTCG 12.5% above ₹1.25 lakh for transfers from 23-Jul-2024; 31-Jan-2018 grandfathering). Specified MFs (more than 65% debt, acquired on or after 1-Apr-2023) are always at slab rates. Other funds are long-term after more than 24 months at 12.5% without indexation. Older rates apply by transfer date. | Tax & statements | AMFI Tax Regime page [amfiindia.com, FY2024-25 page]; Finance (No.2) Act 2024 [S] |
| C-28 | MUST | Privacy notice (itemised data, purposes, withdrawal, rights, Board complaint). DPO or contact published. Grievance handling within 90 days. Breach runbook (users without delay; Board within 72 hours). Minimum 1-year log retention. Encryption or tokenisation of PII (fixes v1 plaintext PII, must-fix h). SPDI-compliant privacy policy and grievance officer until DPDP commences. | Privacy, security, infra | M1 Rules 3, 6, 7, 8, 9, 14; IT Act 43A |
| C-29 | SHOULD | Host all PII and regulatory records in India (ap-south-1), including backups and logs. Keep a readable copy in India if any processor is offshore. | Infrastructure | S10 (by analogy); DPDP R15 |
| C-30 | SHOULD | WCAG-level accessibility for web and native apps (SEBI regulated-entity standard adopted voluntarily). | Design system | SEBI 2025/111 [S] |
| C-31 | SHOULD | SIP cancel requests pushed to the AMC/RTA immediately (AMCs must complete within T+2 working days); investor picks a reason from a predefined list. | SIP management | SEBI letter 2024 [S] |
| C-32 | SHOULD | Keep records of risk profile, appropriateness warnings, consents and dissents, complaints and correspondence (5+ years; confirm period under OI-9). | Audit store | Code 3(d); A2 Q15–16 |
| C-33 | SHOULD | Grievance module: acknowledge, track and resolve, and help the investor escalate to the AMC, SCORES or ODR. Link the SEBI Investor Charter for MFs. | Support/Ops console | Code 4(j); MC 6.14 |
| C-34 | MUST | If Platizio later adds Direct plans (EOP), it must keep investors separate at group level by PAN/family: one investor uses either EOP or distribution. Do not build shared-investor assumptions. | Architecture | MC 19.8.1(b) |

---

## 4. Corrections to the v1 rules the team planned to port

| v1 rule | Current rule |
|---|---|
| Nominee cap config-driven, 3 vs 10 | **3** (S4). Keep it in config, default 3. |
| Minor nominee needs guardian | Guardian **optional**; date of birth mandatory for a minor. |
| Allocation must be exactly 100% | % optional. If given, must total 100. If blank, equal split and odd lot to the first nominee. |
| Opt-out needs zero nominees, declaration and OTP | Consistent with S4 plus the conservative 2FA. Use the Annexure-B text verbatim. |
| Capital gains: non-equity long-term after 1095 days | Wrong since 23-Jul-2024. See C-27. |
| Equity long-term after 365 days | The law says "more than 12 months". Use calendar-month arithmetic, not day counts. |
| SIP start date after today; ₹500 minimum | These are AMC/SID-level rules, not SEBI rules. Source minimums per scheme from the catalogue. |
| Mandate limit max(₹1 lakh, 2× instalment) | A platform choice. The RBI AFA exemption covers MF debits up to ₹1 lakh [S]. |
| OTP 6 digits, 5 minutes, 5 attempts | Not regulated. Keep as policy, but OTPs must go to the investor's own contacts registered with the AMC/RTA. |

---

## 5. Open items for a lawyer or compliance officer

1. **EUIN policy for a fully self-serve platform.** Is EUIN-blank plus the declaration on 100% of orders acceptable, given AMFI §5.2.4(c) ("exceptional cases")? Or should a designated NISM-certified employee's EUIN be quoted? How should this work with the Cybrilla FP payload and each AMC's policy?
2. **Are public SEO fund pages and the catalogue "advertisements" or "marketing material"?**
   - This covers the Fifth Schedule ban on ranking and testimonials, AMFI Code 4(k), AMC logo approvals, and whether returns and sorting are allowed without AMC approval (A2 Q13).
   - It also covers whether SIP or return calculators with user-entered rates are "projections".
3. **When is appropriateness triggered?** Is a risk-profile questionnaire mandatory (AMFI FAQ Q5 "obligated" vs execution-only)? Which mismatch rules make "the distributor has information to believe" the transaction is inappropriate?
4. **KYC legal pathway.** Which SEBI-registered entity (AMC/RTA, KRA-member intermediary, or Cybrilla POA) is the KYC user agency for KRA/CKYC upload, Aadhaar e-KYC (KUA/sub-KUA or e-KYC Setu), video IPV and e-sign? Contractual allocation of AML/CDD duties.
5. **AMC service agreements and empanelment.** Is routing through Cybrilla FP enough for "service agreement between the AMC and the service provider/platform" (MC 17.3.2)? Is Platizio itself the platform? Which payment aggregators are approved?
6. **Nomination conflict.** S4 (29-May-2026) supersedes earlier circulars, but MC-2026 15.14 (20-Mar-2026) still requires online opt-out to be validated by e-sign or 2FA. Confirm the 2FA-for-opt-out approach and any AMFI implementation standard for S4.
7. **Switch 2FA and SIP modification/pause 2FA.** Not explicitly covered. Confirm the AMC/RTA expectation (AMFI 2FA best-practice update after S5).
8. **Taxes.** Confirm the Income-tax Act 2025 section mapping (80C to s.123; capital-gains sections; FATCA rules renumbered in the 2026 Rules) and ELSS eligibility under ITA 2025. Confirm the dividend TDS threshold and wording for the tax reports.
9. **Record retention periods.** PMLA (5 years after the relationship ends), AMFI record-keeping, DPDP minimum 1 year and erasure: a single retention schedule, and how erasure requests interact with legal holds.
10. **DPDP.**
    - Legal basis for nominee and minor-nominee data (verifiable parental consent vs legitimate use).
    - Whether MeitY's accelerated timelines were gazetted.
    - Whether Platizio could be a Significant Data Fiduciary.
    - Consent-manager integration after Nov-2026.
    - SPDI obligations in the meantime.
11. **CAS import.** MF Central third-party API status in 2026. Acceptable consent wording. Whether showing external holdings or suggesting switches counts as "incidental advice" or poaching (A2 Q12).
12. **Unverified primary facts** (only [S] sources here) to confirm before coding:
    - stamp duty notification numbers;
    - ELSS 2005 notification text;
    - SIP-cancellation T+2 letter;
    - RBI e-mandate ₹1 lakh AFA exemption under the 2026 e-mandate directions;
    - effective date of the 7 PM overnight cut-off;
    - digital-accessibility extension circular;
    - DPDP Act commencement S.O. numbers.
13. **SEBI consultation of 16-Jan-2026 on simplifying client onboarding and KRA risk management.** Watch for a final circular that may change KRA status semantics.
14. **Accessibility obligations** under the RPwD Act 2016 for a non-SEBI-regulated MFD platform.
