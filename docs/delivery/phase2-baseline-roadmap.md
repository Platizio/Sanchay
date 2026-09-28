<!-- source: workflow wf_0d7a7a96-9cd labels roadmap:allocation, roadmap:sprints-first, roadmap:sprints-second | exported 2026-09-28 -->

# Phase 2 baseline roadmap (full launch)

---

> Re-planned on Fri 2026-12-18 using measured MVP velocity. Sprint numbers here are the full-launch baseline, not the MVP sprints.

---

# Sanchay reconciled backlog allocation, S0 (Mon 2026-09-28) to public launch

This is a plan only. Nothing was written, edited or deleted anywhere.

**Sources read:**
- the draft roadmap (in full);
- roadmap review DLV-01..22 and foundation review X-01..20;
- design sections R and S;
- gap rulings GAP-01..12;
- the Plan 01 task lists.

**Checks made on 2026-09-25:**
- Sprint dates and weekdays were computed with node. S0 starts Mon 2026-09-28.
- The 2027 holidays after August were checked on the web, because the draft list stopped at August:
  - Milad-un-Nabi and Independence Day both fall on Sun 2027-08-15.
  - Gandhi Jayanti (Sat 10-02), Dussehra (Sat 10-09), Guru Nanak (Sun 11-14) and Christmas (Sat 12-25) all fall on weekends.
  - Diwali is Fri 2027-10-29.
- The 2028 central-government list is not published yet. I assumed only Republic Day, Wed 2028-01-26.

## 0. Headline and decisions the lead must take

1. **The plan of record P80 (Mon 2027-08-16) no longer holds.**
   - Proposed P80: **Mon 2028-02-28 (+28 weeks)**.
   - Proposed P50: **Mon 2028-01-03 (+26 weeks)**.
   - The date moves because:
     - the review's capacity corrections apply;
     - the review found about 16.5 ideal days of scope that no sprint carried;
     - the gap rulings add about 70 ideal days.
   - The levers stay untaken, as PO-4 requires. Section 7 shows what each would buy.
   - Present this to the PO as **PO-8 on Fri 2026-10-09**.
   - The date is replaced by measured velocity on **Fri 2026-11-06**. With a measured AI factor of 1.9, P80 becomes 2027-10-11.
2. **Plan 01 cannot finish inside S0/S1 at honest capacity.**
   - S0 runs at AI factor 1.0 (DLV-16). Review is 2.0 per sprint (DLV-05), and the FP probes take 4.0 days (DLV-12).
   - Every Plan 01 task still gets an explicit sprint:
     - 12.25 days in S0/S1;
     - 12.5 days in S2;
     - 1.05 days in S3 week 1 (the C12 and C15 end-to-end automation).
   - Plan 01 exits at the walking skeleton on Fri 2026-11-06, the same date as the design.
3. **Conflicts I resolved by a default. The lead should confirm each by 10-09.**
   - **D-1 Domains.**
     - GAP-06 says investor web lives at `sanchay.in` (no `/app` prefix, no `app.sanchay.in`), with `api.sanchay.in` and `ops.sanchay.in`. The brand rules map `app.platizio.in` to `app.sanchay.in`.
     - Default: host names come from config (`SANCHAY_WWW_HOST`, `SANCHAY_APP_HOST`) in C10, and the build follows GAP-06. `app.sanchay.in` becomes a 301 redirect only.
     - Cost is 0 either way.
   - **D-2 Analytics.** GAP-06 allows self-hosted PostHog with a first-party fallback. The plan builds the first-party `product_events` table, gated on consent. Self-hosted PostHog is P2 (1.5 days) and not scheduled.
   - **D-3 PO-6 annual step-up.** It is a conditional +2.0 days (Dev A, S20) and only if P-09 passes on 11-06. That would add about 1 week to P80 unless the PO accepts step-up post-launch.
   - **D-4 GAP-12 D7 amendment.** CAS stays enabled in R2 and R3, as planned. The PO signs this by 11-06.
   - **D-5 R0 (DLV-03).** Option A is the default: R0 is staging-complete (noindex) on Thu 2027-03-25, and public R0 comes after the production cutover.
   - **D-6 Admin hosting (GAP-07c).** The admin Vite SPA is served behind the ALB OIDC rule, not from a public S3 origin. This supersedes design §A.1.
4. **Three probe IDs are not defined in the design text I read: P-02, P-08 and P-13.**
   - Proposed mapping, which `docs/probes/README.md` must confirm in S0:
     - P-02: UPI Autopay / mandate rails (Q-C5);
     - P-08: webhook signature form (Q-C4, GAP-02 C);
     - P-13: switch/STP/SWP on cybrillapoa (Q-C2, GAP-10).
   - Probes that can finish in S0: P-01, 03, 04, 05, 06, 08, 10, 11 and 14.
   - Probes that need sandbox time to progress: P-02, 07, 09, 12 and 13.

## Capacity model (applies DLV-05, 06, 07 and 16)

**Formulas:**
- Days per dev = 10 − weekday gazetted holidays − leave.
- Leave is **0.5 day per dev per sprint** (1 day per month, DLV-06). The collective Diwali and year-end leave count as that sprint's leave.
- Committed per dev = days × 0.75 focus × factor × 0.8.

**AI-agent productivity assumption:**
- A focus day that runs spec-driven agent work (spec in `docs/specs`, golden vectors, FakeFp, then human review and merge) yields **1.35 ideal days**. This applies to S1–S33.
- The factor is **1.0 in S0** (greenfield setup and coordination) and in the **time-boxed S34–S36** (pen test, pilot, stabilisation).
- It is never applied to review, triage or FakeFp upkeep.
- It is unmeasured. It is measured on S0–S2 and replaced on **Fri 2026-11-06**.

**Overhead lines inside every committed sprint:**

| Line | Amount | Rule |
|---|---|---|
| Cross-review | 2.0 (1.0 per dev) | 2.5 in money-heavy sprints (S7–S16, S18–S24) |
| FakeFp upkeep | 0.5 on Dev A | from S4, when FpGateway lands |
| Alpha/beta triage | 1.0 (0.5 per dev) | S18–S31; 2.0 in beta sprints S32–S33 |

The remaining 20% is visible buffer: P80 means the buffer is fully consumed.

**Module ownership (DLV-22; CODEOWNERS gets the same map in S0):**

| Dev | Modules |
|---|---|
| **Dev A (backend-leaning)** | kernel, FpGateway/FakeFp, onboarding/KYC backend, consent, order sagas (lumpsum, SIP, redemption, switch, STP, SWP), webhooks/reconcile/invariants, ledger/valuation/tax, CAS, closure/privacy backend |
| **Dev B (client-leaning)** | CI/CDK/release, UI kit/features/web/native, admin app + admin identity/authz, payments, NAV/catalogue/fund facts/commission, holdings recon part 1 + KFin parser, ops tooling (support, help, broadcasts), app config |

The other developer is the named reviewer on every PR.

## 1. Sprint calendar

| Sprint | Dates | Weekday holidays / collective leave | Days/dev | Factor | Committed (A/B each) | Overheads | Net for items |
|---|---|---|---|---|---|---|---|
| S0 | 09-28 → 10-09-2026 | Fri 10-02 Gandhi Jayanti | 8.5 | 1.0 | 10.2 (5.1) | rev 2.0 | 8.2 |
| S1 | 10-12 → 10-23 | Tue 10-20 Dussehra | 8.5 | 1.35 | 13.8 (6.9) | rev 2.0 | 11.8 |
| S2 | 10-26 → 11-06 | — | 9.5 | 1.35 | 15.4 (7.7) | rev 2.0 | 13.4 |
| S3 | 11-09 → 11-20 | Diwali leave Mon 09 + Tue 10 (Diwali is Sun 11-08; Tue 11-10 is an NSE holiday) | 8 | 1.35 | 13.0 (6.5) | rev 2.0 | 11.0 |
| S4 | 11-23 → 12-04 | Tue 11-24 Guru Nanak | 8.5 | 1.35 | 13.8 | rev 2.0, FakeFp 0.5 | 11.3 |
| S5 | 12-07 → 12-18 | — | 9.5 | 1.35 | 15.4 | 2.5 | 12.9 |
| S6 | 12-21 → 01-01-2027 | Fri 12-25; leave Thu 12-31, Fri 01-01 | 7 | 1.35 | 11.3 (5.7) | 2.5 | 8.8 |
| S7 | 01-04 → 01-15 | (Thu 01-14 Sankranti restricted; comes out of leave) | 9.5 | 1.35 | 15.4 | 3.0 | 12.4 |
| S8 | 01-18 → 01-29 | Tue 01-26 Republic Day | 8.5 | 1.35 | 13.8 | 3.0 | 10.8 |
| S9 | 02-01 → 02-12 | — | 9.5 | 1.35 | 15.4 | 3.0 | 12.4 |
| S10 | 02-15 → 02-26 | — | 9.5 | 1.35 | 15.4 | 3.0 | 12.4 |
| S11 | 03-01 → 03-12 | Wed 03-10 Id-ul-Fitr (moon) | 8.5 | 1.35 | 13.8 | 3.0 | 10.8 |
| S12 | 03-15 → 03-26 | Tue 03-23 Holi; Fri 03-26 Good Friday | 7.5 | 1.35 | 12.2 | 3.0 | 9.2 |
| S13 | 03-29 → 04-09 | — | 9.5 | 1.35 | 15.4 | 3.0 | 12.4 |
| S14 | 04-12 → 04-23 | Thu 04-15 Ram Navami; Mon 04-19 Mahavir Jayanti (Wed 04-14 is a market holiday only) | 7.5 | 1.35 | 12.2 | 3.0 | 9.2 |
| S15 | 04-26 → 05-07 | — | 9.5 | 1.35 | 15.4 | 3.0 | 12.4 |
| S16 | 05-10 → 05-21 | Mon 05-17 Id-ul-Zuha; Thu 05-20 Buddha Purnima (DPDP Rules apply ~Thu 05-13) | 7.5 | 1.35 | 12.2 | 3.0 | 9.2 |
| S17 | 05-24 → 06-04 | — | 9.5 | 1.35 | 15.4 | 2.5 | 12.9 |
| S18 | 06-07 → 06-18 | Wed 06-16 Muharram (moon) | 8.5 | 1.35 | 13.8 | 3.0 + triage 1.0 | 9.8 |
| S19–S22 | 06-21 → 08-13 | — (Independence Day / Milad-un-Nabi on Sun 08-15) | 9.5 | 1.35 | 15.4 | 4.0 | 11.4 each |
| S23 | 08-16 → 08-27 | Wed 08-25 Janmashtami | 8.5 | 1.35 | 13.8 | 4.0 | 9.8 |
| S24 | 08-30 → 09-10 | — | 9.5 | 1.35 | 15.4 | 4.0 | 11.4 |
| S25–S27 | 09-13 → 10-22 | — (Gandhi Jayanti and Dussehra on Saturdays) | 9.5 | 1.35 | 15.4 | 3.5 | 11.9 each |
| S28 | 10-25 → 11-05 | Fri 10-29 Diwali + leave Thu 10-28 | 8 | 1.35 | 13.0 | 3.5 | 9.5 |
| S29–S31 | 11-08 → 12-17 | — (Guru Nanak on Sun 11-14) | 9.5 | 1.35 | 15.4 | 3.5 | 11.9 each |
| S32 | 12-20 → 12-31 | Christmas on Sat; leave Thu 12-30, Fri 12-31 | 8 | 1.35 | 13.0 | 2.0 + 0.5 + beta 2.0 | 8.5 |
| S33 | 01-03 → 01-14-2028 | — | 9.5 | 1.35 | 15.4 | 4.5 | 10.9 |
| S34 | 01-17 → 01-28 | Wed 01-26 Republic Day | 8.5 | 1.0 (time-box) | 10.2 | 2.5 | 7.7 |
| S35 | 01-31 → 02-11 | — | 9.5 | 1.0 | 11.4 | 2.5 | 8.9 |
| S36 | 02-14 → 02-25 | — | 9.5 | 1.0 | 11.4 | 2.5 | 8.9 |
| S37 | 02-28 → 03-10 | hypercare | — | — | — | — | — |

**Rule for dates:** no deadline may fall on a listed holiday or collective leave day (DLV-18). Every date below has been checked against this rule.

## 2. Allocation per sprint

Columns are item | estimate (ideal days) | owner | dependencies | priority. **Load** is items plus overhead against each developer's committed capacity.

**Added-scope register:** every item added by a GAP ruling or a review finding, with its estimate and sprint. Net figures are relative to the draft.

| Source | Item | Est | Sprint | Owner |
|---|---|---|---|---|
| GAP-01 | Pre-validate step, outbox handoff, CNF-02 polling, widened R-02 | 0.5 | S7–S8 | A |
| GAP-02 | Consolidated Cybrilla question list A–G | non-code | S0 wk1 | PO |
| GAP-02 | Webhook verifier: HMAC-first with shared-secret mode | 0.5 | S13 | A |
| GAP-02 | SIP modify = cancel-and-recreate | +1.0 | S19–S20 | A |
| GAP-02 | Folio-maintenance ops/physical-form path | 1.5 | S26–S27 | A/B |
| GAP-03 | Risk questionnaire backend | 2.0 | S6–S7 | A |
| GAP-03 | Risk screens ONB-21/22, PRF-13, CNF-03, profile-vs-fund row | 2.0 | S9–S10 | B |
| GAP-03 | Suitability check in lumpsum / SIP / switch / STP | 1.75 | S11, S18, S23 | A |
| GAP-03 | Questionnaire admin | 1.25 | S11–S12 | B |
| GAP-03 | Riskometer-rise job + expiry reminders | 0.75 | S23 | B |
| GAP-03 | Suitability report + investor 360 tab | 1.25 | S23–S24 | B |
| GAP-03 | Total (net +8.0 over the draft's 1.0) | 9.0 | | |
| GAP-04 | Annexure-A visibility choice + opt-out pop-up | 0.5 | S9–S10 | A/B |
| GAP-05 | `money_params` + cutoff profiles + NC display vectors + mandate-limit vectors | 1.5 | S5 | A |
| GAP-06 | Skia signature pad, coarse geo, `/app/r/[kind]` return links | +1.5 | S9 | B |
| GAP-06 | `@sanchay/upi-intent` + PSP allowlist + rogue-app test | 2.0 | S24 | B |
| GAP-06 | Direct FCM/APNs push | +1.5 | S16–S17 | A |
| GAP-06 | Self-hosted Sentry in ap-south-1 | +1.5 | S3 | B |
| GAP-06 | Consent-gated first-party analytics | +0.5 | S17 | A |
| GAP-06 | 5-tab navigation | 0.25 | S2 (C9) | B |
| GAP-07 | Admin OIDC at ALB (replaces argon2) + ops host behind ALB | +0.5 | S4 | B |
| GAP-07 | `packages/authz` roles + matrix | 1.0 | S4 | B |
| GAP-07 | Self-serve closure | 3.5 total (+2.5) | S30–S31 | A 2.5 / B 1.0 |
| GAP-07 | Bank Jaro-Winkler bands | 0.5 | S9 | A |
| GAP-07 | `data_requests` + `grievances` registers | 2.5 | S24–S25 | B |
| GAP-07 | `ops_cases` engine | 1.5 | S14 | A |
| GAP-07 | REFUSE non-India tax residency | −0.5 | S8 | B |
| GAP-08 | Retention engine, Object Lock retain-until extension, complaint-SLA copy | 1.0 | S31–S32 | A |
| GAP-09 | Commission-rate tables + public `/commission-disclosure` page | +3.5 net (4.5 total) | S10–S11 | A 2.0 / B 1.5 |
| GAP-09 | App config | 2.0 | S16 | A/B |
| GAP-09 | Reviewer/demo accounts | 1.5 | S16 | B |
| GAP-09 | Help-centre CMS | 3.5 | S27–S28 | B |
| GAP-09 | Support inbox | 5.0 | S26–S27 | B |
| GAP-09 | Popular list / collections / broadcasts | 3.5 | S28 | B |
| GAP-10 | Switch two-leg saga | +1.0 | S23–S24 | A |
| GAP-10 | STP/SWP instalment machine | +1.0 | S24–S25 | A |
| GAP-10 | Payout tracking | +0.5 | S21 | A |
| GAP-10 | Corporate actions | 4.0 | S26–S27 | A 3.0 / B 1.0 |
| GAP-10 | 11 new detectors | 1.5 | S28 | A |
| GAP-10 | `folio_contacts` sync | +0.5 | S8 | A |
| GAP-11 | "If you had invested" + ch.14 disclosures; no-logo flag | 1.25 | S12–S13 | B |
| GAP-11 | Dual-statute tax labels (Income-tax Act 1961 / 2025) | 1.5 | S25 | A |
| GAP-11 | Generic SIP calculator | P2, not scheduled | — | — |
| GAP-12 | CAS import: 19 total (+10 vs the draft's 9) | 19.0 | S28–S30 | A 14.0 / B 5.0 |
| **GAP total** | | **≈ +70** | | |
| DLV-09 | Calendar loader | 0.5 | S3 | B |
| DLV-09 | Sweepers, `drafts.abandon`, cancel/clone | 1.0 | S14–S15 | A |
| DLV-09 | Staging env + tag-to-staging pipeline | 1.0 | S14 | B |
| DLV-09 | EAS release pipeline | 1.0 | S17 | B |
| DLV-09 | Profile hub, sessions/devices, email add/verify, notification prefs | 2.0 | S17–S18 | B |
| DLV-09 | `cutoff.monitor` | 0.5 | S20 | B |
| DLV-09 | `kyc.periodic.recheck` + quote recheck | 1.5 | S17 | A |
| DLV-09 | Platform nomination change + consent history | 2.0 | S26–S27 | A/B |
| DLV-10 | RTA mailback parsers (CAMS+matching / KFin) | +3.0 (4.0 total) | S21–S22 | A 2.5 / B 1.5 |
| DLV-12 | Probes | +1.0 (4.0 total) | S0–S2 | A |
| DLV-20 | UI batch 3 | +2.0, spread | S9–S29 | B |
| DLV-21 | iOS simulator CI / device builds / Maestro iOS | 1.0 | S3 / S7 / S15 | B |
| **Review total** | | **≈ +16.5** | | |

### S0 · Mon 2026-09-28 → Fri 10-09 · Goal: decide the stack and FP capabilities on evidence by 10-09
Load A 5.0/5.1 · B 5.0/5.1

| Item | Est | Owner | Dependencies | Pri |
|---|---|---|---|---|
| FP probe pack: synchronous probes (P-01, 03, 04, 05, 06, 08, 10, 11, 14 + capability listing); start progression probes (P-02, 07, 09, 12, 13 and a mandate approval); `tools/fp-probes`; evidence format; support drafting the questionnaire | 3.0 | A | Sandbox tenant, both token audiences (E-2) | P0 |
| oRPC 1.15.4 / Nest 11.2.6 / Fastify gate spike: ping contract, typed `.errors()` via OpenAPILink, check `@orpc/server/helpers` cookie helpers (X-19); regenerate the lost Part B Task 1–10 text (X-20); ADR-0003 | 1.0 | A | A1 | P0 |
| Plan 01 **A1** repo bootstrap | 0.5 | B | GitHub repo (E-15) | P0 |
| Plan 01 **A2** `@sanchay/config` + Biome + lefthook | 0.5 | B | A1 | P0 |
| Plan 01 **A13** CI; fake `SANCHAY_PLATFORM_ARN` fixture (X-07) | 0.5 | B | A2 | P0 |
| Plan 01 **B2** docker compose (postgres:18.6 on 55432, Mailpit 8025/1025) | 0.25 | B | A1 | P0 |
| AGENTS.md: rename rules and `--filter=` form (X-15); CODEOWNERS by module | 0.25 | B | A1 | P0 |
| Lockfile dry-run + ADR-0001: one React copy or per-app; single pins incl. vite 7.3.6 (X-06); `allowBuilds` (X-08) | 0.5 | B | A1 | P0 |
| Universal-UI spike (RN Reusables + Uniwind: Button, TextField, Sheet, AmountInput; axe; RNW gzip cost; low-end Android) + ADR-0002 | 1.0 | B | Expo build, low-end phone (E-24) | P0 |
| Expo 57 dev build (local + EAS project) | 0.5 | B | EAS account | P0 |
| Cross-review | 2.0 | A/B | — | P0 |

**DoD:**
- ADR-0001/0002/0003 merged.
- `docs/probes/P-xx.md` exists for the synchronous set.
- `capacity.md` is written (leave rule and holiday-deadline rule).
- Probe readout and PO-8 presented on 10-09.

### S1 · 10-12 → 10-23 · Goal: persistence, crypto, audit, OTP and the money/validation packages are live under test
Load A 7.0/6.9 · B 7.0/6.9 (about +0.1 each, absorbed by buffer)

| Item | Est | Owner | Dependencies | Pri |
|---|---|---|---|---|
| Plan 01 **B1** env/config (SANCHAY_*; `OTP_PER_IP_PER_HOUR` per X-11) | 0.25 | A | gate spike | P0 |
| Plan 01 **B4** contract + errors + OpenAPI (enums from `@sanchay/domain` per X-16; error maps per X-17) | 0.5 | A | A9–A12 | P0 |
| Plan 01 **B9** oRPC module; **B10** Fastify bootstrap/health (hardened from the spike) | 0.5 | A | B4 | P0 |
| Plan 01 **B3** Drizzle identity schema + `sanchay_migrator` / `sanchay_app` roles | 0.75 | A | B2 | P0 |
| Plan 01 **B6** provider modes & fakes (capture \| mailpit; msg91 later) | 0.25 | A | B1 | P0 |
| Plan 01 **B7** crypto/ids (KMS envelope, `newId`/RowId AAD) | 0.75 | A | B3 | P0 |
| Plan 01 **B11** OpenAPI drift test; **B12** AuditService | 0.75 | A | B4, B3 | P0 |
| Plan 01 **B13** SMS/email ports + templates; **B14** OTP issue; **B15** OTP verify | 2.0 | A | B6, B7 | P0 |
| Probe progression tracking | 0.25 | A | S0 | P0 |
| Plan 01 **A3–A8**: decimal core, Money, Units/Nav, INR formatting, XIRR display per PO-5, largest remainder | 2.0 | B | A2 | P0 |
| Plan 01 **A9–A12**: validation + identity/IFSC/pincode/OTP/amount schemas, domain enums, branded ids (days 1–2) | 1.0 | B | A2 | P0 |
| Plan 01 **B5** Testcontainers harness; **B8** CLS / pino allow-list | 1.0 | B | B2 | P0 |
| Plan 01 **C1** tokens; **C2** api-client error model + conformance (Part 2 names are the source of truth, X-02) | 0.75 | B | B4 | P0 |
| Admin Vite skeleton under prod CSP (behind ALB per GAP-07c) + bundle baseline ADR-0005 (moved from S0, DLV-12) | 0.75 | B | A13 | P1 |
| `check-boundaries` + design-coverage checklist (every §D.3 endpoint and §J job maps to a plan; DLV-09) | 0.5 | B | A13 | P1 |
| Cross-review | 2.0 | A/B | — | P0 |

**DoD:**
- Decrypting with a swapped RowId fails.
- `money` coverage ≥ 95%.
- The typed error round-trip passes in a Node client.

### S2 · 10-26 → 11-06 · Goal: an investor signs up or logs in by SMS OTP on web dev and an Android dev build (walking skeleton)
Load A 7.75/7.7 · B 7.5/7.7

| Item | Est | Owner | Dependencies | Pri |
|---|---|---|---|---|
| Plan 01 **B16** InvestorAccounts/DeviceTrust; **B17** SessionService; **B18** step-up token | 2.0 | A | B15 | P0 |
| Plan 01 **B19** auth/me procedures; **B20** guards/cookies (`__Host-sanchay_*`, `sanchay_si` indicator per X-12); **B21** OTP login flows | 2.25 | A | B16–B18 | P0 |
| Plan 01 **B22** session management; **B23** email add/verify; **B25** typed error gate; **B26** runnable locally (API :3000, web :3001 per X-04) | 2.0 | A | B21 | P0 |
| Progression probe readout (P-02, 07, 09, 12, 13 and mandates) | 0.5 | A | S0 probes | P0 |
| Plan 01 **C3** transports (`x-sanchay-client` = web \| android \| ios per X-01); **C4** ui batch 1 core; **C5** inputs | 2.0 | B | C2 | P0 |
| Plan 01 **C6** app-core; **C7** useOtpLogin (Part 2 shapes, X-02/X-13); **C8** Login/Welcome; **C9** Home/AppShell (5 tabs per GAP-06; `GET /auth/session` per X-03) | 1.9 | B | C3–C5 | P0 |
| Plan 01 **C10** web routing/CSP/proxy (config-driven hosts, D-1); **C11** web wiring + smoke | 1.2 | B | C9 | P0 |
| Plan 01 **C13** mobile libraries; **C14** Expo wiring + app lock (biometric/device credential, no PIN, per GAP-06) | 1.15 | B | C9 | P0 |
| Cross-part reconciliation X-01..X-05 (OTP read from Mailpit, ports, env names) | 0.25 | B | — | P0 |
| Cross-review | 2.0 | A/B | — | P0 |

**DoD:**
- Skeleton demoed on web and on an Android dev build.
- Velocity and review-hours report for S0–S2 delivered.
- PO-2 for the progression probes is due Fri 11-13.

**Plan 01 sprint allocation (explicit):**

| Sprint | Tasks | Days |
|---|---|---|
| S0 | A1, A2, A13, B2 | 1.75 |
| S1 | A3–A12, B1, B3–B15, C1, C2 | 10.5 |
| S2 | B16–B23, B25, B26, C3–C11, C13, C14 | 12.5 |
| S3 | B24, C12, C15 | 1.05 |
| **Total** | | **25.8** |

### S3 · 11-09 → 11-20 · Goal: the kernel is complete and dev runs on AWS nonprod
Load A 6.5/6.5 · B 6.55/6.5

| Item | Est | Owner | Dependencies | Pri |
|---|---|---|---|---|
| **B24** rate limiting (Plan 01 tail) | 0.25 | A | B21 | P0 |
| Idempotency interceptor + `idempotency_keys` (X-09 "Part 4") | 1.0 | A | B3 | P0 |
| JobsModule (pg-boss, `enqueue(tx)`), worker heartbeat, `APP_ROLE=worker` | 1.5 | A | B3 | P0 |
| EdgeGuard (`x-sanchay-edge`) + cross-host suite | 0.5 | A | B10 | P0 |
| MSG91 adapter + DLT login template + boot guard | 1.0 | A | E-10 | P0 |
| SES adapter + email OTP prod mode | 0.5 | A | E-11 | P0 |
| `states.md` + `gen:states` part 1 | 0.75 | A | — | P0 |
| Plan 01 **C12** web e2e; **C15** Maestro; EAS iOS simulator build in CI (DLV-21) | 1.05 | B | S2 | P0 |
| CDK nonprod part 1 (VPC, RDS 18.6, ECS api/worker/web, ECR, GitHub OIDC) | 2.0 | B | AWS nonprod account (E-14) | P0 |
| Self-hosted Sentry in ap-south-1 + scrubbing (GAP-06 §5) | 2.0 | B | CDK | P0 |
| `calendar_years` / `market_holidays` seed + loader (DLV-09) | 0.5 | B | — | P0 |
| Cross-review | 2.0 | A/B | — | P0 |

From S3 onward, Core DoD item 6 applies: every merge to main deploys to dev.

### S4 · 11-23 → 12-04 · Goal: FpGateway talks to the sandbox and ops staff can log in
Load A 6.9/6.9 · B 6.9/6.9

| Item | Est | Owner | Dependencies | Pri |
|---|---|---|---|---|
| JCS canonicaliser, validators, `gen:states` SQL CHECKs | 1.0 | A | S3 | P0 |
| FpGateway core (two token audiences, lossless-json, FpError, `provider_calls`) + FakeFp + contract harness, part 1 | 4.4 | A | Kernel | P0 |
| CDK part 2: CloudFront (sanchay.in, api), ops ALB with OIDC authenticate, WAF with webhook exemption, IPv4/dual-stack per P-06 | 1.5 | B | CDK part 1 | P0 |
| Admin identity: Google Workspace OIDC at the ALB, verify `x-amzn-oidc-data`, `__Host-sanchay_ops` sessions, TOTP step-up, bootstrap CLI, login screen (GAP-07a) | 2.5 | B | E-28 | P0 |
| `packages/authz`: seven roles + permission matrix + generated spec (GAP-07b) | 1.0 | B | Admin identity | P0 |
| ui batch 1 remainder, part 1 | 0.9 | B | C4/C5 | P0 |
| Cross-review 2.0 · FakeFp 0.5 | 2.5 | A/B | — | P0 |

The curator's CSV template for fund facts starts in this sprint (DLV-11).

### S5 · 12-07 → 12-18 · Goal: a new investor passes identity and readiness against FakeFp
Load A 7.7/7.7 · B 7.7/7.7

| Item | Est | Owner | Dependencies | Pri |
|---|---|---|---|---|
| FpGateway part 2 | 0.6 | A | S4 | P0 |
| Schemes + FP catalogue sync + `plan_txn_rules` | 0.5 | A | FpGateway | P0 |
| `money_params` + cutoff profiles + NC display vectors + mandate-limit vectors (GAP-05) | 1.5 | A | Domain | P0 |
| Onboarding derivation + identity + readiness table + POA pre-verification, part 1 | 3.6 | A | FpGateway, POA (E-2) | P0 |
| ui batch 1 remainder (AmountInput, MoneyText, Sheet, …; contrast test, axe) | 1.6 | B | — | P0 |
| AMFI NAV pipeline part 1 | 3.5 | B | — | P0 |
| Domain: XIRR (V1–V7), FIFO core, cut-off engine + calendar, part 1 | 1.6 | B | money | P0 |
| Cross-review 2.0 · FakeFp 0.5 | 2.5 | A/B | — | P0 |

### S6 · 12-21 → 01-01-2027 · Goal: an investor's profile, legal consents and risk profile are captured
Load A 5.65/5.67 · B 5.65/5.67

| Item | Est | Owner | Dependencies | Pri |
|---|---|---|---|---|
| Identity, remaining part | 0.4 | A | S5 | P0 |
| Legal documents, declarations, `consent_records` | 1.5 | A | E-18 drafts | P0 |
| Profile part 1 (address via `ref_pincodes`) | 1.0 | A | Identity | P0 |
| Risk questionnaire backend (versions, server scoring, RP-001..012 vectors, `risk_profiles`, RISK_PROFILED stage, READY gate), part 1 (GAP-03) | 1.25 | A | E-19 sign-off | P0 |
| Domain, remaining part | 0.4 | B | S5 | P0 |
| Scheme sync, B share | 0.5 | B | — | P0 |
| NAV part 2 | 1.5 | B | NAV part 1 | P0 |
| Identity screens | 1.0 | B | — | P0 |
| Admin shell + approvals queue, part 1 (DLV-08) | 1.25 | B | authz | P0 |
| Cross-review 2.0 · FakeFp 0.5 | 2.5 | A/B | — | P0 |

### S7 · 01-04 → 01-15 · Goal: no FP write can happen without a consumed consent challenge
Load A 7.7/7.7 · B 7.7/7.7

| Item | Est | Owner | Dependencies | Pri |
|---|---|---|---|---|
| Risk questionnaire backend, remaining part | 0.75 | A | S6 | P0 |
| Consent core + GAP-01 (pre-validate step, outbox handoff), part 1 of 6.5 | 5.2 | A | states, JCS | P0 |
| Admin shell + approvals queue (TOTP step-up) + audited investor lookup + recon-break list, remaining part | 1.75 | B | S6 | P0 |
| Returns | 2.0 | B | XIRR | P0 |
| SEBI taxonomy + aliases + DRAFT queue | 2.0 | B | E-17 register | P0 |
| Second factor, part 1 | 0.45 | B | — | P0 |
| iOS device dev builds (DLV-21) | 0.25 | B | Apple org account (E-12) | P0 |
| Cross-review 2.5 · FakeFp 0.5 | 3.0 | A/B | — | P0 |

**DoD:** a NAV quarantine release and a legal-document publish complete through maker ≠ checker in the UI (DLV-08).

### S8 · 01-18 → 01-29 · Goal: an investor's consent reaches the right contact and the KYC flow starts
Load A 6.9/6.9 · B 6.8/6.9

| Item | Est | Owner | Dependencies | Pri |
|---|---|---|---|---|
| Consent core, remaining part | 1.3 | A | S7 | P0 |
| ConsentDestinationResolver + `investor_contacts` + `folio_contacts` nightly sync (GAP-10 §6) | 1.5 | A | Consent | P0 |
| KYC adapter (the one P-03 chose), API flow part 1 | 2.35 | A | P-03 | P0 |
| Second factor (native device key, web dual OTP, ConsentSheet), remaining part | 1.55 | B | Consent | P0 |
| Profile / FATCA (REFUSE non-India residency) / PEP + `onboarding_reviews` | 3.0 | B | Profile | P0 |
| KYC client part 1 | 1.0 | B | Adapter | P0 |
| Cross-review 2.5 · FakeFp 0.5 | 3.0 | A/B | — | P0 |

**DoD:** tamper test (edit between approve and consume returns CONSENT_MISMATCH and makes no FP call); `trg_consent_guard` negative suite green.

### S9 · 02-01 → 02-12 · Goal: KYC and nomination complete on web and native
Load 7.7/7.7 each

| Item | Est | Owner | Dependencies | Pri |
|---|---|---|---|---|
| KYC adapter, remaining part | 1.15 | A | S8 | P0 |
| Bank backend: penny drop + Jaro-Winkler bands (≥80 auto, 60–79 manual, <60 reject; GAP-07g) | 1.5 | A | FpGateway | P0 |
| Nomination (MAX 3 per PO-7, Annexure-A visibility, Annexure-B opt-out) + ONBOARDING_ATTEST | 2.25 | A | Consent, P-11 | P0 |
| Provisioning saga, part 1 | 1.05 | A | Attest | P0 |
| ConsentDestinationResolver, B share | 1.0 | B | — | P0 |
| KYC native: Skia signature pad + photo picker (no camera), one-shot coarse geo, `/app/r/[kind]` returns, `+native-intent`, iOS fallback scheme (GAP-06), SignatureCaptureGuide | 4.0 | B | Adapter | P0 |
| Risk-profile screens, part 1 | 1.45 | B | Risk backend | P0 |
| Cross-review 2.5 · FakeFp 0.5 | 3.0 | A/B | — | P0 |

### S10 · 02-15 → 02-26 · Goal: a verified investor is provisioned on FP
Load 7.7/7.7 each

| Item | Est | Owner | Dependencies | Pri |
|---|---|---|---|---|
| FP provisioning saga (resumable), remaining part | 3.95 | A | S9 | P0 |
| Commission backend (cards, lines, resolution, R7 readiness, `order_disclosure_snapshot`, API) (GAP-09 §1) | 2.0 | A | E-8 rate cards | P0 |
| Risk screens, remaining part | 0.55 | B | — | P0 |
| Bank screens + `ref_ifsc` / `ref_pincode` jobs + BANK_MANUAL_VERIFY | 2.5 | B | Admin queue | P0 |
| Nomination screens + opt-out pop-up | 1.75 | B | Nomination | P0 |
| FundFactsProvider + curation + publish gate + CSV + `scheme_tax_classes`, part 1 | 1.65 | B | E-21 CA | P0 |
| Cross-review 2.5 · FakeFp 0.5 | 3.0 | A/B | — | P0 |

**DoD:** provisioning resumes after a crash at every step.

### S11 · 03-01 → 03-12 · Goal: an investor can draft a lumpsum order and consent to it against FakeFp
Load A 6.9 · B 6.9

| Item | Est | Owner | Dependencies | Pri |
|---|---|---|---|---|
| Public catalogue API + sitemap + JSON-LD | 2.0 | A | Facts | P0 |
| Lumpsum saga part 1 + suitability check / acknowledgement (GAP-03) | 3.0 | A | Provisioning | P0 |
| Watchlist, part 1 | 0.15 | A | — | P1 |
| Fund facts, remaining part | 2.35 | B | S10 | P0 |
| Commission admin screens + CSV + public `/commission-disclosure` page + review-row disclosure | 1.5 | B | Commission backend | P0 |
| Ops onboarding exceptions + PEP/FATCA review UI | 1.0 | B | Review queue | P0 |
| Risk questionnaire admin (versioning, simulator, publish maker-checker), part 1 | 0.8 | B | — | P0 |
| Cross-review 2.5 · FakeFp 0.5 | 3.0 | A/B | — | P0 |

### S12 · 03-15 → 03-26 · Goal: lumpsum submission works end-to-end on FakeFp
Load 6.1/6.1 each

| Item | Est | Owner | Dependencies | Pri |
|---|---|---|---|---|
| Watchlist + `?intent=`, remaining part | 0.85 | A | — | P1 |
| Native explore view-model | 0.5 | A | — | P1 |
| Ops onboarding UI, A share | 0.5 | A | — | P1 |
| Lumpsum part 2 (confirm under useConsumed, RECONCILING, UNITS_PENDING), part 1 | 2.45 | A | Part 1 | P0 |
| Risk questionnaire admin, remaining part | 0.45 | B | — | P0 |
| www pages, part 1 (A–Z default sort, labelled sorts, no AMC logos + `amc.logoApproved`, "if you had invested" + ch.14 disclosures; GAP-11) | 4.35 | B | Catalogue API | P1 |
| Cross-review 2.5 · FakeFp 0.5 | 3.0 | A/B | — | P0 |

**R0 staging-complete Thu 03-25** (www on staging, noindex).

### S13 · 03-29 → 04-09 · Goal: webhooks and payments bring purchases to a truthful state
Load 7.7/7.7 each

| Item | Est | Owner | Dependencies | Pri |
|---|---|---|---|---|
| Lumpsum part 2, remaining part | 0.55 | A | — | P0 |
| Webhook ingest (HMAC-first dual-mode verifier, persistent dedupe) + re-fetch + reconcile + tenant recon M6 | 4.5 | A | GAP-02 C1 answer | P0 |
| `fp.reconcile.events` + DLQ + alarms | 0.9 | A | Ingest | P0 |
| www pages, remaining part | 0.9 | B | — | P1 |
| ui batch 2 | 3.0 | B | Batch 1 | P0 |
| Payments (attempts, pre-check, postback, polls, `failed_payment_debited`, late_auth, TPV, `payments.recon`), part 1 | 2.55 | B | Lumpsum | P0 |
| Cross-review 2.5 · FakeFp 0.5 | 3.0 | A/B | — | P0 |

### S14 · 04-12 → 04-23 · Goal: money-in integrity holds under crash and duplicate events
Load 6.1/6.1 each

| Item | Est | Owner | Dependencies | Pri |
|---|---|---|---|---|
| `fp.reconcile.events`, remaining part | 0.1 | A | S13 | P0 |
| `ops_cases` engine (queue, SLA, `dedupe_key`) | 1.5 | A | — | P0 |
| Invariants M1–M6 | 1.0 | A | — | P0 |
| Crash-injection suite | 1.0 | A | — | P0 |
| Sweepers (`drafts.abandon`, `consent.expiry.sweep`, cancel/clone), part 1 | 0.75 | A | — | P0 |
| Payments, remaining part | 1.95 | B | S13 | P0 |
| Staging env + tag-to-staging pipeline | 1.0 | B | CDK | P0 |
| Checkout screens + glue, part 1 (FP `token_url` auth session, UpiQr) | 1.9 | B | Payments | P0 |
| Cross-review 2.5 · FakeFp 0.5 | 3.0 | A/B | — | P0 |

### S15 · 04-26 → 05-07 · Goal: an investor pays on web and native and sees a settled lot
Load 7.7/7.7 each

| Item | Est | Owner | Dependencies | Pri |
|---|---|---|---|---|
| Sweepers, remaining part | 0.25 | A | — | P0 |
| Lots, FIFO, folios, `ledger_exceptions` | 4.0 | A | Lumpsum | P0 |
| Valuation + XIRR display per PO-5, part 1 | 1.7 | A | Ledger | P0 |
| Checkout glue, remaining part (deep links, AASA/assetlinks on sanchay.in) | 4.6 | B | S14 | P0 |
| Orders list + timeline | 1.5 | B | — | P1 |
| Maestro iOS nightly | 0.25 | B | — | P0 |
| Cross-review 2.5 · FakeFp 0.5 | 3.0 | A/B | — | P0 |

### S16 · 05-10 → 05-21 · Goal: the dashboard shows valued holdings, with app config ready for store builds
Load 6.1/6.1 each

| Item | Est | Owner | Dependencies | Pri |
|---|---|---|---|---|
| Valuation, remaining part (`sipCounts`, allocation) | 1.3 | A | S15 | P0 |
| App config backend (`app_config_versions`, `/v1/app/config`, 60 s CloudFront cache + S3 fallback, HTTP 426) | 1.0 | A | — | P0 |
| Notifications part 1 (SMS/email/inbox + direct FCM v1 / APNs push), part 1 | 2.0 | A | E-26 | P0 |
| App config admin + client force-update / maintenance handling | 1.0 | B | Backend | P0 |
| Reviewer/demo accounts (sandbox-only routing, boot refusal, audit + Slack) | 1.5 | B | — | P0 |
| Dashboard + holdings screens, part 1 | 2.3 | B | Valuation | P0 |
| Cross-review 2.5 · FakeFp 0.5 | 3.0 | A/B | — | P0 |

### S17 · 05-24 → 06-04 · Goal: staff can complete sign-up → onboarding → lumpsum → dashboard (R1 internal alpha)
Load A 7.2/7.7 · B 7.7/7.7

| Item | Est | Owner | Dependencies | Pri |
|---|---|---|---|---|
| Notifications, remaining part | 2.5 | A | — | P0 |
| `product_events` (first-party, consent-gated) | 1.5 | A | — | P1 |
| Native explore API support | 0.5 | A | — | P0 |
| `kyc.periodic.recheck` + quote recheck + readiness flip | 1.5 | A | — | P0 |
| Dashboard, remaining part | 1.7 | B | — | P0 |
| Native explore + fund detail (universal) | 2.5 | B | View-model | P0 |
| EAS release pipeline (Play internal / TestFlight) | 1.0 | B | E-12 | P0 |
| Profile hub, part 1 (sessions/devices, email, notification preferences) | 1.5 | B | — | P1 |
| Cross-review 2.0 · FakeFp 0.5 | 2.5 | A/B | — | P0 |

**DoD:** R1 builds on staging, Play internal and TestFlight by **Thu 06-03**; alpha checklist published. Cybrilla demo 1 (onboarding, lumpsum, payments, webhooks) on **Fri 06-04**.

### S18 · 06-07 → 06-18 · Goal: an investor can set up a mandate and begin a SIP
Load 6.9/6.9 each

| Item | Est | Owner | Dependencies | Pri |
|---|---|---|---|---|
| Mandates part 1 | 1.0 | A | — | P0 |
| Mandates part 2 (UPI Autopay fixed at ₹1L, eNACH steps, external revoke, headroom) | 2.0 | A | P-02 | P0 |
| SIP saga backend (monthly only, first instalment per GAP-05, suitability), part 1 | 1.75 | A | Mandates | P0 |
| Profile hub, remaining part | 0.5 | B | — | P1 |
| Mandate screens + authorise glue | 2.5 | B | — | P0 |
| SIP client flow + checkout, part 1 | 2.1 | B | — | P0 |
| Cross-review 2.5 · FakeFp 0.5 · triage 1.0 | 4.0 | A/B | — | P0 |

**DoD:** at least 8 staff complete the alpha checklist; crash-free rate ≥ 99% (DLV-19).

### S19 · 06-21 → 07-02 · Goal: an investor registers a SIP with a new or reused mandate
Load 7.7 each

| Item | Est | Owner | Dependencies | Pri |
|---|---|---|---|---|
| SIP saga, remaining part | 2.25 | A | — | P0 |
| Instalment sync | 2.0 | A | — | P0 |
| SIP management, part 1 | 1.2 | A | — | P0 |
| SIP checkout, remaining part | 3.4 | B | — | P0 |
| Checkout-intent resume + freshness labels | 1.0 | B | — | P1 |
| SIP manage screens, part 1 | 1.5 | B | — | P0 |
| Overheads | 4.0 | A/B | — | P0 |

### S20 · 07-05 → 07-16 · Goal: investors can change, pause and cancel an active SIP
Load 7.7 each

| Item | Est | Owner | Dependencies | Pri |
|---|---|---|---|---|
| SIP management, remaining part: one-off amount change = cancel-and-recreate with new 2FA; pause via `skip_instructions` with server chips [1, 2]; cancel; warn after 2 misses. Conditional: annual step-up +2.0 if P-09 passes (D-3) | 4.8 | A | P-09 | P0 |
| Redemption part 2, start | 0.65 | A | — | P0 |
| SIP manage screens, remaining part | 1.0 | B | — | P0 |
| `cutoff.monitor` | 0.5 | B | — | P0 |
| Redemption part 1 (availability + buffer + reservations) | 1.5 | B | FIFO | P0 |
| Redemption screens + LotTable / PayoutStatus, part 1 | 2.95 | B | — | P0 |
| Overheads | 4.0 | A/B | — | P0 |

### S21 · 07-19 → 07-30 · Goal: an investor redeems by amount, units or all, with honest payout tracking
Load 7.7 each

| Item | Est | Owner | Dependencies | Pri |
|---|---|---|---|---|
| Redemption backend: advisory lock, strict ELSS, `applyExit`, payout states + expected dates by category (GAP-10 §3) | 5.35 | A | — | P0 |
| Redemption screens, remaining part | 1.55 | B | — | P0 |
| Holdings recon part 1 (FP holdings, `externally_modified`) | 2.0 | B | P-12 | P0 |
| KFin mailback parser | 1.5 | B | E-9 files | P0 |
| Notifications part 2, part 1 | 0.9 | B | — | P1 |
| Overheads | 4.0 | A/B | — | P0 |

### S22 · 08-02 → 08-13 · Goal: holdings reconcile against FP or RTA data, with an ops correction tool
Load 7.7 each

| Item | Est | Owner | Dependencies | Pri |
|---|---|---|---|---|
| CAMS parser + matching / ingest / fixtures | 2.5 | A | E-9 | P0 |
| Ledger adjustments (maker-checker; MANUAL_UNITS only; no admin route writes `orders.status`) | 3.0 | A | — | P0 |
| Notifications part 2, remaining part | 1.1 | B | — | P1 |
| Folio service requests (MF Central guided, OPS_RTA, re-fetch confirm, timeline) | 3.75 | B | — | P0 |
| Switch/STP/SWP screens, part 1 | 1.1 | B | — | P0 |
| Overheads | 4.0 | A/B | — | P0 |

**DoD:** G4 dry run with a sandbox folio MATCHED.

### S23 · 08-16 → 08-27 · Goal: switch runs as a two-leg saga behind its flag
Load 6.9 each

| Item | Est | Owner | Dependencies | Pri |
|---|---|---|---|---|
| Switch two-leg saga (OUT_DONE, PARTIAL_OUT_ONLY → CONVERTED_TO_PAYOUT, stamp duty, target-only suitability) | 4.65 | A | P-13 | P0 |
| Switch/STP/SWP screens, remaining part (two-lane timeline, partial-failure banner) | 3.9 | B | — | P0 |
| Riskometer-rise job + profile-expiry reminders | 0.75 | B | — | P0 |
| Suitability report + investor 360 risk tab, part 1 | 0.5 | B | — | P0 |
| Overheads | 4.0 | A/B | — | P0 |

### S24 · 08-30 → 09-10 · Goal: STP and SWP instalments run with pre-checks and auto-stop
Load 7.7 each

| Item | Est | Owner | Dependencies | Pri |
|---|---|---|---|---|
| Switch, remaining part | 0.6 | A | — | P0 |
| STP (instalment machine, pre-check 2 days before, ELSS 12-instalment simulation) | 3.5 | A | — | P0 |
| SWP, part 1 | 1.35 | A | — | P0 |
| Suitability report, remaining part | 0.75 | B | — | P0 |
| `@sanchay/upi-intent` + PSP allowlist + iOS LSApplicationQueriesSchemes + rogue-app test | 2.0 | B | — | P0 |
| Admin back office part 1, remaining part (investor 360, order views, sync / re-drive / refund UTR / MANUAL_UNITS, NAV runs) | 3.0 | B | — | P0 |
| `data_requests` / `grievances` registers, start | 0.2 | B | — | P0 |
| Overheads | 4.0 | A/B | — | P0 |

### S25 · 09-13 → 09-24 · Goal: capital gains are classified correctly under both tax statutes
Load 7.7 each

| Item | Est | Owner | Dependencies | Pri |
|---|---|---|---|---|
| SWP, remaining part | 2.15 | A | — | P0 |
| Tax constants + capital-gains FIFO replay + Income-tax Act 1961 / 2025 labels and sections by disposal date | 3.5 | A | E-21 | P0 |
| `data_requests` + `grievances` registers + admin screens (21-day / 30-day SLAs) | 2.3 | B | `ops_cases` | P0 |
| Capital-gains CSV formats | 1.5 | B | — | P0 |
| Report screens + native download/share, part 1 | 2.4 | B | — | P0 |
| Overheads | 3.5 | A/B | — | P0 |

### S26 · 09-27 → 10-08 · Goal: investors download statements and can change bank or contact details safely
Load 7.7 each

| Item | Est | Owner | Dependencies | Pri |
|---|---|---|---|---|
| Statements, ELSS summary, consent-evidence PDFs, report jobs | 4.0 | A | — | P0 |
| Change of bank + contact change (cooling-off), part 1 | 1.7 | A | — | P0 |
| Report screens, remaining part | 0.1 | B | — | P0 |
| Corporate-action admin + timeline | 1.0 | B | — | P0 |
| COB/contact screens + CoolingOffBanner | 1.25 | B | — | P0 |
| Folio-maintenance ops path, B share | 0.75 | B | GAP-02 D | P0 |
| Platform nomination change + consent history, B share | 1.0 | B | — | P0 |
| Support inbox, part 1 | 2.1 | B | — | P1 |
| Overheads | 3.5 | A/B | — | P0 |

Cybrilla demo 2 (SIP, SIP management, redemption, switch/STP/SWP) on **Fri 10-08**.

### S27 · 10-11 → 10-22 · Goal: corporate actions post correctly to the ledger
Load 7.7 each

| Item | Est | Owner | Dependencies | Pri |
|---|---|---|---|---|
| COB, remaining part | 0.8 | A | — | P0 |
| Folio-maintenance ops path, A share | 0.75 | A | — | P0 |
| Platform nomination change, A share | 1.0 | A | — | P0 |
| Corporate actions (merger, segregated portfolio, plan change, suspended scheme) | 3.0 | A | — | P0 |
| Support inbox, remaining part (tickets, attachments + GuardDuty scan, working-hours SLA, escalation to grievance) | 2.9 | B | — | P1 |
| Help-centre CMS (tables, versions, full-text search, context keys, ISR revalidation, web + native screens), part 1 | 3.3 | B | — | P1 |
| Overheads | 3.5 | A/B | — | P0 |

### S28 · 10-25 → 11-05 · Goal: every money-flow exception opens a detected ops case
Load 6.5 each

| Item | Est | Owner | Dependencies | Pri |
|---|---|---|---|---|
| 11 GAP-10 detectors | 1.5 | A | `ops_cases` | P0 |
| `apps/cas-worker` (Python casparser 1.4.1, no-egress Lambda) + `infra/cas.ts` | 3.0 | A | E-30 | P0 |
| Help CMS, remaining part | 0.2 | B | — | P1 |
| Broadcast composer + audience + quiet hours / caps, `popular_schemes` job + exclusions, collections criteria text | 3.5 | B | — | P1 |
| CAS screens, part 1 | 1.3 | B | — | P0 |
| Overheads | 3.5 | A/B | — | P0 |

### S29 · 11-08 → 11-19 · Goal: CAS holdings are imported, deduplicated and shown separately
Load 7.7 each

| Item | Est | Owner | Dependencies | Pri |
|---|---|---|---|---|
| `packages/cas-import` (schema types, PAN filter, upsert, ISIN mapping) | 4.0 | A | — | P0 |
| Dedupe + UNITS_MISMATCH | 1.5 | A | — | P0 |
| CAS screens, remaining part (`useCasImport`, document picker, ExternalBadge / CoverageNote) | 2.2 | B | — | P0 |
| CAS admin monitor + unmapped-scheme queue | 1.5 | B | — | P0 |
| External valuation / scope XIRR | 1.5 | B | — | P0 |
| Prod CDK stack, part 1 (DLV-02) | 1.0 | B | Prod account (E-14) | P0 |
| Overheads | 3.5 | A/B | — | P0 |

### S30 · 11-22 → 12-03 · Goal: CAS import passes its security gate for the beta
Load 7.7 each

| Item | Est | Owner | Dependencies | Pri |
|---|---|---|---|---|
| CAS API + P07 consent + erasure + 1-hour raw sweeper | 1.5 | A | — | P0 |
| Golden / fuzz / bomb corpus + VPC flow-log check | 2.0 | A | — | P0 |
| CAS security review | 0.5 | A | — | P0 |
| EUIN / OTP evidence exports | 1.5 | A | — | P0 |
| Prod stack, remaining part (VPC, NAT EIPs, RDS, ECS, CloudFront, WAF, Secrets) | 1.5 | B | — | P0 |
| Closure screens ACC-01..04 | 1.0 | B | — | P0 |
| Admin part 2 (catalogue, legal, config maker-checker, users, jobs, service requests) | 3.5 | B | — | P0 |
| Overheads | 3.5 | A/B | — | P0 |

### S31 · 12-06 → 12-17 · Goal: every decision-4 feature is complete for the sandbox beta (R2)
Load 7.7 each

| Item | Est | Owner | Dependencies | Pri |
|---|---|---|---|---|
| Self-serve closure state machine (cancel-all, 7-day reversal, legal hold) | 2.5 | A | — | P0 |
| DPDP privacy centre + retention engine (R-REG 8 years from closure, Object Lock retain-until extension) + audit export, part 1 | 3.2 | A | GAP-08 | P0 |
| Alarms + runbooks | 1.5 | B | Prod stack | P0 |
| CSP checks / headers | 2.0 | B | — | P0 |
| Performance budgets + low-end device run | 2.0 | B | — | P0 |
| Accessibility audit, part 1 | 0.7 | B | — | P0 |
| Overheads | 3.5 | A/B | — | P0 |

**DoD:** R2 builds on the Play closed track and TestFlight by **Thu 12-16**.

### S32 · 12-20 → 12-31 · Goal: harden the beta build and start the FP production cutover
Load 6.5 each

| Item | Est | Owner | Dependencies | Pri |
|---|---|---|---|---|
| Privacy centre, remaining part | 0.8 | A | — | P0 |
| BOLA / cross-host suites | 2.0 | A | — | P0 |
| FP production cutover part 1 (credentials, webhook secrets, feeds bucket) | 1.2 | A | E-4 credentials 11-19; allowlist 12-10 | P0 |
| Accessibility audit (TalkBack / VoiceOver), remaining part | 2.3 | B | — | P0 |
| k6 smoke | 0.5 | B | — | P1 |
| Playwright + Maestro part 2, part 1 | 1.7 | B | — | P0 |
| Cross-review 2.0 · FakeFp 0.5 · beta triage 2.0 | 4.5 | A/B | — | P0 |

### S33 · 2028-01-03 → 01-14 · Goal: production is verified read-only while the external pen test runs
Load 7.7 each

| Item | Est | Owner | Dependencies | Pri |
|---|---|---|---|---|
| Cutover part 1 remainder + part 2 (feeds, production holdings, read-only production probes, P-05 re-run) | 1.8 | A | — | P0 |
| FP contract suite completion | 2.0 | A | — | P0 |
| Playwright + Maestro part 2, A share | 1.0 | A | — | P0 |
| Playwright + Maestro part 2, remaining B share | 1.3 | B | — | P0 |
| Pen-test support (testing window 01-03 → 01-14 on the R2 build) | 1.5 | B | E-25 | P0 |
| Store listings, Data safety, privacy labels (preparation) | 3.0 | B | E-13 | P0 |
| Overheads incl. beta triage 2.0 | 4.5 | A/B | — | P0 |

**DoD:** decision-4 checklist signed, or PO-signed amendments recorded (DLV-19).

### S34 · 01-17 → 01-28 (time-box, factor 1.0) · Goal: take an evidence-backed real-money go/no-go on Fri 01-28
Capacity 5.1 per dev

| Item | Est | Owner | Dependencies | Pri |
|---|---|---|---|---|
| Pen-test remediation + retest by 01-27 | A 2.0 / B 2.0 | A/B | — | P0 |
| DR restore drill + full k6 run | 1.6 | A | — | P0 |
| Store closed-track submissions + reviewer-account rotation | 1.0 | B | — | P0 |
| G1–G10 evidence pack | 1.1 | B | — | P0 |
| Cross-review 2.0 · FakeFp 0.5 | 2.5 | A/B | — | P0 |

### S35 · 01-31 → 02-11 (time-box) · Goal: founders' canary proves production, then invitees transact
Capacity 5.7 per dev

| Item | Est | Owner | Dependencies | Pri |
|---|---|---|---|---|
| Canary Mon 01-31 → Fri 02-04, then support rota | A 1.5 / B 1.5 | A/B | G1–G10a | P0 |
| Pilot fixes | A 2.2 / B 2.7 | A/B | — | P0 |
| Flag enablement with production evidence | A 0.5 / B 0.5 | A/B | — | P0 |
| Overheads | 2.5 | A/B | — | P0 |

The G4b / G5b / G6b gate is on Mon 02-07. Invitees (at most 50) start the same day.

### S36 · 02-14 → 02-25 (time-box) · Goal: take the public go/no-go on Fri 02-25 with zero open CRITICAL defects
Capacity 5.7 per dev

| Item | Est | Owner | Dependencies | Pri |
|---|---|---|---|---|
| Stabilisation | A 3.2 / B 2.7 | A/B | — | P0 |
| Compliance sign-off + G1–G11 | A 1.0 / B 1.0 | A/B | — | P0 |
| Staged store rollout preparation | B 1.0 | B | — | P0 |
| Overheads | 2.5 | A/B | — | P0 |

**R4 launch Mon 2028-02-28.** Hypercare runs in S37 (02-28 → 03-10).

## 3. Releases and milestones, with gates

| Milestone | Date | Gate |
|---|---|---|
| Probe readout (synchronous) / PO-8 | Fri 2026-10-09 | P-xx evidence files; PO-2 decision on Fri 10-16 |
| Walking skeleton + progression readout + re-baseline | Fri 2026-11-06 | SMS-OTP login on web and Android; measured velocity replaces the 1.35 factor; PO-2b on 11-13 |
| Ops login demo | Fri 2026-12-04 | OIDC + TOTP step-up |
| R0 staging-complete | Thu 2027-03-25 | www on staging, noindex. Public R0 needs counsel OI-2, at least 100 fully gated schemes (tax class + commission row + AMC agreement) and `fp_active` from production, so earliest after 01-14-2028 |
| **R1 internal alpha** (about 8 staff, sandbox) | Fri 2027-06-04 (builds Thu 06-03) | Staff privacy notice approved 05-21; DPO + manual rights runbook live 05-07; self-hosted Sentry; reviewer accounts sandbox-only. Checklist done in S18 |
| Cybrilla demos | 2027-06-04 and 2027-10-08 | Production approval by 10-22 |
| **R2 closed beta** (about 25 staff + ops, sandbox, CAS on) | Fri 2027-12-17 (builds Thu 12-16) | Decision-4 checklist, or PO-signed amendments; CAS-01..06 controls pass. Signed in S33 |
| Pen test | Testing 2028-01-03 → 01-14; retest by 01-27 | G1 = retest letter |
| **Real-money go/no-go** | Fri 2028-01-28 | G1, G2, G3; G4a/G5a/G6a (sandbox P-07/P-12/P-05 green + RTA parser passes on real mailback files); G7, G8, G9, G10; counsel + PO sign the canary as a controlled test |
| Founders' canary | 2028-01-31 → 02-04 | ₹500 lumpsum orders. SIPs on UPI Autopay and eNACH with `installment_day` on the first allowed day ≥ 02-10. Redemptions placed by 02-07. STP/SWP first instalment ≤ 02-20 |
| Pre-invitee gate | Mon 2028-02-07 | G4b/G5b/G6b: production allotted units present, ARN on the RTA record, folio MATCHED |
| **R3 pilot** (at most 50 invitees, real money) | 2028-02-07 → 02-25 | — |
| **Public go/no-go** | Fri 2028-02-25 | G1–G11; at least 20 settled real orders; at least 1 settled SIP instalment, 1 confirmed payout, 1 STP and 1 SWP instalment in production; 0 open CRITICAL. A flow without production evidence stays flag-off only under a PO-2 amendment |
| **R4 launch** | Mon 2028-02-28 (P80) | Staged store rollout 10 → 50 → 100% |

## 4. Critical path

**Lane A (backend) is the zero-float lane:**

1. S0 probes and gate spike
2. Kernel (S1–S3)
3. FpGateway (S4–S5)
4. Onboarding identity (S5–S6)
5. Risk profile (S6–S7)
6. Consent (S7–S8)
7. KYC (S8–S9)
8. Nomination / attest (S9) and provisioning (S9–S10)
9. Lumpsum (S11–S13)
10. Webhooks / invariants (S13–S14)
11. Ledger / valuation (S15–S16)
12. **R1 alpha (S17)**
13. Mandates / SIP (S18–S19)
14. SIP management (S19–S20)
15. Redemption (S20–S21)
16. RTA recon + ledger adjustments (S22)
17. Switch (S23–S24)
18. STP / SWP (S24–S25)
19. Tax / statements / COB (S25–S27)
20. Corporate actions / detectors (S27–S28)
21. CAS (S28–S30)
22. Closure / privacy (S31–S32)
23. Cutover / contract suite (S32–S33)
24. Pen-test remediation and go/no-go (S34)
25. Canary / pilot (S35)
26. Public go/no-go (S36)

Lane B has at most about 0.5 day of float. It becomes critical if the prod stack (S29–S30) or the release pipeline (S17) slips.

**External items on the critical path:**
- Cybrilla production credentials by 2027-11-19.
- NAT EIP allowlist by 12-10.
- AWS prod account by 10-22-2027.
- Automated CAMS/KFin mailback drop by 07-16-2027.
- Pen-test vendor window 01-03-2028.
- G2/G3 written confirmations by 2028-01-07.
- Store approvals by 02-18-2028.
- Any Q-C15 "yes" (Platizio needs its own ONDC buyer-NP registration) becomes a critical-path re-plan.

**Items with float:**
- www / R0 (large; it only gates marketing).
- The GAP-09 non-regulatory tooling (help CMS, support inbox, broadcasts; lever iii).
- Admin part 2 (about 1 sprint against the pilot).

## 5. Business-actions timeline

| Date | ID | Action (owner) |
|---|---|---|
| Mon 2026-09-28 | E-1/E-2 | Send the Cybrilla questionnaire Q-C1..Q-C17 plus the GAP-02 A–G list. Q-C15 asks whether Platizio needs its own ONDC buyer-NP registration; Q-C16 asks for written ONDC production parity; Q-C17 asks for the go-live checklist; also ask about sandbox time-travel. Sandbox tenant with both audiences (PO) |
| 09-28 | E-9 | Request CAMS and KFin mailback for the ARN (PO/Ops) |
| 09-28 | E-15 | GitHub organisation + private repo (pushed only on owner request), CI secrets (none needed in S0) (PO) |
| 09-28 | — | Confirm the office holiday list and book known leave (Delivery lead) |
| Thu 10-01 | E-17 | Counsel engaged (moved off the 10-02 holiday) |
| Thu 10-01 | E-24 | Low-end Android phone for the S0 spike |
| Thu 10-01 | E-15 | Expo EAS plan |
| Fri 10-09 | PO-8 | Decisions: PO-8 (new P50/P80, levers), D-1..D-6. Confirm ARN validity/renewal (E-5) |
| Fri 10-16 | PO-2 | PO-2 for the synchronous probes. Q-C15 "yes" escalates immediately |
| Fri 10-23 | E-17 | Counsel regulatory-sources register |
| Fri 10-23 | E-16 | Domain sanchay.in registered + delegated to Route 53 |
| Fri 10-30 | E-14 | AWS organisation + sanchay-nonprod account (SCP ap-south-1) |
| Fri 10-30 | E-12 | D-U-N-S number |
| Fri 11-06 | E-10 | DLT principal entity, header, login template; MSG91 contract |
| Fri 11-06 | E-11 | SES nonprod access + SPF/DKIM/DMARC on sanchay.in |
| Fri 11-06 | PO | Re-baseline; GAP-12 D7 amendment signed |
| Fri 11-13 | PO-2b | PO-2 for the progression probes (P-02, 07, 09, 12, 13); PO-6 step-up outcome |
| Fri 11-20 | E-28 | Google Workspace platizio.com: ops accounts with passkeys/security keys enforced, OIDC client for the ALB, break-glass hardware keys |
| Fri 11-27 | E-2 | POA agreement (KYC user agency) signed |
| Mon 11-30 | E-12 | Apple Developer and Google Play Console organisation accounts |
| Tue 12-01 | E-21 | CA engaged |
| Fri 12-04 | E-17 | Legal drafts: T&C, DPDP notice naming processors, risk disclosure, commission disclosure, execution-only declaration, Annexure-A/B, KYC consent, CAS notice, investor charter, grievance policy (7 / 21 / 30-day text per GAP-08) |
| Fri 12-18 | E-17 | Counsel OI-1..OI-17. If OI-1 is not an unconditional "execution-only OK", enrol a NISM V-A candidate by 01-15 and get the EUIN by 03-31 (E-6) |
| Fri 12-18 | E-19 | Compliance sign-off of the risk questionnaire wording and bands, plus SUITABILITY_WARNING and RISK_PROFILE_ATTESTATION texts |
| Fri 12-18 | E-9 | Sample mailback files from existing ARN folios for fixtures |
| Fri 12-18 | E-10 | Consent SMS templates |
| Fri 12-18 | E-17 | Category-circular register entry |
| Thu 12-24 | E-22 | 2027 NSE/BSE/RBI calendars loaded (moved off the 12-31 leave day) |
| Mon 2027-01-04 | E-20 | Ops fund-facts curator hired; CSV pre-fill uses the S4 template |
| Fri 01-29 | E-18 | TPL_ONBOARDING_ATTEST approved |
| Fri 02-12 | E-8/E-21 | First AMC empanelment + service agreements + trail-commission rate cards; CA tax classes for the first 100 schemes |
| Fri 02-26 | E-18 | TPL_PURCHASE approved |
| Fri 03-12 | E-8 | Public commission-page copy approved |
| Fri 05-07 | E-17 | DPO / Grievance Officer named + manual rights runbook (DPDP Rules apply ~05-13) |
| Fri 05-21 | E-17 | Staff-alpha privacy notice |
| Fri 05-21 | E-29 | Reviewer-account policy + Slack alert channel |
| Fri 05-21 | — | Named OPS, COMPLIANCE and SUPPORT staff for maker-checker |
| Fri 05-28 | E-12 | TestFlight / Play internal tracks live |
| Fri 06-04 | E-18 | TPL_SIP_* and TPL_MANDATE_* approved |
| Fri 06-04 | E-4 | Cybrilla demo 1 |
| Fri 07-02 | E-18 | TPL_REDEMPTION and TPL_PLAN_* approved |
| Fri 07-16 | E-9 | Automated mailback S3 drop live |
| Fri 08-13 | E-18 | TPL_SWITCH / STP / SWP approved |
| Fri 08-27 | E-21 | CA OI-8 / 11 / 12 + Income-tax Act 2025 section mapping confirmed |
| Fri 09-10 | E-18 | TPL_BANK / CONTACT_CHANGE / NOMINATION / FOLIO_SR templates approved |
| Thu 09-30 | E-25 | CERT-In-empanelled pen-test vendor contracted |
| Fri 10-08 | E-4 | Cybrilla demo 2 |
| Fri 10-22 | E-4/E-14 | Cybrilla production approval; sanchay-prod account + Business Support |
| Fri 10-22 | E-30 | casparser MIT vendoring OK'd, no-CTA policy signed, about 10 redacted CAS PDFs collected |
| Fri 10-22 | E-27 | 30 help articles drafted |
| Fri 10-22 | E-18 | Closure texts approved |
| Fri 11-12 | E-25 | Pen-test scope agreed |
| Fri 11-19 | E-4 | FP production credentials (about 4 weeks of float before cutover) |
| Fri 11-19 | E-17 | Final legal set |
| Fri 11-26 | E-4/E-11 | NAT EIPs sent to Cybrilla; SES prod access |
| Fri 12-10 | E-4 | Cybrilla EIP allowlist done |
| Fri 12-17 | E-26 | DPAs (Cybrilla, MSG91, AWS, Expo, Google FCM, Apple APNs); CERT-In contact + runbook; support staffing |
| Fri 12-24 | E-22 | 2028 exchange/RBI calendars loaded |
| Fri 2028-01-07 | E-7 | G2 / G3 written confirmations (Q-C1, Q-C11, OI-1, OI-5) |
| Fri 01-21 | E-27 | Support channel, escalation matrix, pilot invite list |
| Fri 02-18 | E-13 | Store approvals |

## 6. Sub-plan files

All live under `C:/Users/pc/Desktop/sanchay/docs/superpowers/plans/`. Each is drafted in the last 2 days of the previous sprint, references `docs/specs/<module>.md`, and uses the `@sanchay/*` names.

| File | Scope |
|---|---|
| `2026-09-28-plan-00-s0-evidence-gates.md` | Synchronous probes + questionnaire, oRPC gate spike + ADR-0003, UI spike ADR-0002, lockfile ADR-0001, Expo dev build, AGENTS.md / CODEOWNERS, `capacity.md` |
| `2026-09-28-plan-01-foundation.md` | Part A A1–A13, Part B B1–B26, Part C C1–C15, with a sprint column (S0 / S1 / S2 / S3 week 1), fixes X-01..X-20 and renames. Exit: walking skeleton 11-06 |
| `2026-10-12-plan-02-s1-s2-platform-side.md` | Admin Vite skeleton + ADR-0005, check-boundaries + design-coverage checklist, progression probes + 11-06 readout |
| `2026-11-09-plan-03-kernel-completion-and-nonprod-infra.md` | S3 |
| `2026-11-23-plan-04-fp-gateway-and-admin-identity.md` | S4 |
| `2026-12-07-plan-05-onboarding-identity-and-catalogue-data.md` | S5 |
| `2026-12-21-plan-06-profile-legal-risk-profile-nav.md` | S6 |
| `2027-01-04-plan-07-consent-engine.md` | S7 |
| `2027-01-18-plan-08-consent-destinations-kyc-eligibility.md` | S8 |
| `2027-02-01-plan-09-kyc-native-bank-nomination.md` | S9 |
| `2027-02-15-plan-10-provisioning-fund-facts-commission.md` | S10 |
| `2027-03-01-plan-11-catalogue-api-and-lumpsum-draft.md` | S11 |
| `2027-03-15-plan-12-lumpsum-submit-and-www-staging.md` | S12 |
| `2027-03-29-plan-13-webhooks-and-payments.md` | S13 |
| `2027-04-12-plan-14-money-in-integrity.md` | S14 |
| `2027-04-26-plan-15-checkout-and-ledger.md` | S15 |
| `2027-05-10-plan-16-valuation-app-config-dashboard.md` | S16 |
| `2027-05-24-plan-17-r1-internal-alpha.md` | S17 |
| `2027-06-07-plan-18-mandates-and-sip-start.md` | S18 |
| `2027-06-21-plan-19-sip-registration.md` | S19 |
| `2027-07-05-plan-20-sip-management.md` | S20 |
| `2027-07-19-plan-21-redemption-and-payouts.md` | S21 |
| `2027-08-02-plan-22-holdings-recon-and-adjustments.md` | S22 |
| `2027-08-16-plan-23-switch-two-leg.md` | S23 |
| `2027-08-30-plan-24-stp-swp-upi-intent.md` | S24 |
| `2027-09-13-plan-25-tax-and-privacy-registers.md` | S25 |
| `2027-09-27-plan-26-statements-and-account-changes.md` | S26 |
| `2027-10-11-plan-27-corporate-actions-support-help.md` | S27 |
| `2027-10-25-plan-28-detectors-broadcasts-cas-worker.md` | S28 |
| `2027-11-08-plan-29-cas-import-and-prod-stack.md` | S29 |
| `2027-11-22-plan-30-cas-gate-admin-part-2.md` | S30 |
| `2027-12-06-plan-31-r2-feature-complete.md` | S31 |
| `2027-12-20-plan-32-beta-hardening-cutover.md` | S32 |
| `2028-01-03-plan-33-pentest-window-production-readiness.md` | S33 |
| `2028-01-17-plan-34-remediation-real-money-go-no-go.md` | S34 |
| `2028-01-31-plan-35-founders-canary-and-pilot.md` | S35; includes the DLV-13 pilot test calendar |
| `2028-02-14-plan-36-stabilise-and-launch.md` | S36 |
| `2028-02-28-plan-37-hypercare.md` | S37 |

## 7. Updated P50 / P80

**Proposed plan of record:**

| | New date | Old date | Change |
|---|---|---|---|
| P80 | Mon 2028-02-28 | Mon 2027-08-16 | +28 weeks |
| P50 | Mon 2028-01-03 | Mon 2027-07-05 | +26 weeks |

At P50, half the buffer is used: work finishes at the end of S29 (2027-11-19), then 3 time-boxed sprints follow.

**Why P80 moves, in weeks:**

| Cause | Weeks |
|---|---|
| Missed weekday holidays (draft correction) | +2 |
| DLV-05/06/07/16: honest review load, leave, triage, factor 1.0 in S0 and the tail | +6 |
| Scope the review found unscheduled (DLV-09/10/12/20/21, Plan 01 "Part 4" kernel), ≈16.5 ideal days | +3 |
| Gap-ruling scope, ≈70 ideal days. Largest: GAP-09 admin tooling 19, GAP-12 CAS +10, GAP-10 +8.5, GAP-03 +8, GAP-07 +8, GAP-06 +7.25 | +12 |
| Calendar and resequencing: the Oct–Jan holiday season falls inside the build, the tail runs over Republic Day, and DLV-01/02/04 add a canary week and move the prod stack and pen test | +5 |
| **Total** | **+28** |

**Total planned work:**
- about 372 ideal days of feature and hardening work to R2 plus readiness;
- plus about 3 time-boxed sprints;
- plus overheads: review about 83, FakeFp 15, triage 18.

**Sensitivity to the measured AI factor (no levers):**

| Measured factor | P80 |
|---|---|
| 1.35 | 2028-02-28 |
| 1.6 | 2027-12-06 |
| 1.9 | 2027-10-11 |

Holding 2027-08-16 with no levers needs a factor of about 2.2 or more. That is not plannable.

**Levers (documented, not taken per PO-4; each ±1 sprint, at factor 1.35):**

| Lever | P80 |
|---|---|
| (i) Third full-stack developer from S4 | 2027-10-25 |
| (ii) CAS + STP/SWP as a 4–6 week fast-follow (≈28 days) | 2028-01-17 |
| (iii) New candidate: fast-follow for non-regulatory GAP-09 tooling (help CMS → static FAQ, support inbox → email + `ops_cases`, broadcasts, popular list; ≈10.5 days). Commission table, app config and reviewer accounts are not deferrable | 2028-02-14 |
| (i) + (ii) | 2027-09-27 |
| (i) + (ii) + (iii) | 2027-09-13 |

**Paths back to 2027-08-16:** all three levers plus a measured factor of about 1.6, or a scope amendment signed by the PO. Scope is never cut silently.

## 8. Review-issue resolutions

**Roadmap review:**

| ID | Resolution |
|---|---|
| DLV-01 | Gates split into sandbox parts (a) and production parts (b). Founders' canary 2028-01-31 → 02-04; G4b/G5b/G6b on 02-07 before invitees; S35 DoD |
| DLV-02 | Prod stack in S29–S30 before the S32–S33 cutover. Prod account 10-22; credentials 11-19 (about 4 weeks of float); EIPs 11-26; allowlist 12-10 |
| DLV-03 | Option A by default (D-5): R0 staging-complete 03-25-2027; public R0 after the production cutover. CA engaged 12-01; first 100 tax classes by 02-12 |
| DLV-04 | Vendor contracted 09-30-2027 and scoped 11-12. Testing 01-03 → 01-14-2028 on the R2 build; remediation in S34; retest 01-27; go/no-go 01-28 on the retest letter |
| DLV-05 | Review 2.0 per sprint (2.5 in money-heavy sprints) as an explicit line; review hours measured in S0–S2 |
| DLV-06 | Leave of 0.5 day per dev per sprint deducted; collective leave counts as leave; rule in `capacity.md` |
| DLV-07 | Triage 1.0 per sprint S18–S31; 2.0 in S32–S33 |
| DLV-08 | Admin shell, approvals queue, audited lookup and recon-break list in S6–S7; admin part 1 cut to 3.0 in S24; maker ≠ checker in S7 DoD |
| DLV-09 | Every item placed: loader S3, sweepers S14–S15, staging S14, EAS S17, profile hub S17–S18, `cutoff.monitor` S20, KYC recheck S17, nomination change + consent history S26–S27; design-coverage checklist S1 |
| DLV-10 | RTA parsers 4.0 (CAMS + matching A S22; KFin B S21); E-9 split into request 09-28, samples 12-18, automated drop 07-16 |
| DLV-11 | Consent-template due dates tied to the consuming sprints; rate cards in E-8; curator CSV template in S4 |
| DLV-12 | Synchronous readout 10-09 and progression readout 11-06; PO-2b 11-13; Q-C16 and time-travel question added; admin skeleton moved to S1; probe total ≈4.0 |
| DLV-13 | Pilot test calendar in plan-35; evidence list in the S36 DoD; flag-off only under a PO-2 amendment |
| DLV-14 | Q-C17 sent 09-28; demos 06-04 and 10-08; approval 10-22 |
| DLV-15 | NISM enrolment trigger on 12-18 (EUIN by 03-31); a Q-C15 "yes" is an immediate PO escalation and re-plan |
| DLV-16 | Factor 1.0 in S0 and S34–S36 |
| DLV-17 | Every sprint goal is one sentence |
| DLV-18 | Counsel on Thu 10-01; holiday-deadline rule applied (E-22 moved to 12-24; R0 to Thu 03-25) |
| DLV-19 | Builds distribute on Thursdays; checklist completion moves to the S18 and S33 DoDs |
| DLV-20 | UI batch 3 +2.0, component by component in the sprints that first need it |
| DLV-21 | iOS simulator CI in S3, device builds in S7 (after the 11-30 Apple account), Maestro iOS nightly in S15. DoD item 7 reads "Android + iOS (simulator from S3, device from S7)" |
| DLV-22 | Module ownership table and matching CODEOWNERS |

**Foundation review (all fixed inside plan-01):**

| ID | Resolution |
|---|---|
| X-01..X-05 | Part B is the source of truth. OTP is read from Mailpit. API on :3000, web on :3001. `APP_ORIGIN` naming. `x-sanchay-client` values web / android / ios |
| X-06 | One catalog pin per key |
| X-07 | CI env fixture for `SANCHAY_PLATFORM_ARN` |
| X-08 | `allowBuilds` entries |
| X-09 | Kernel completion scheduled in S3 (plan-03) |
| X-10 | Root `db:migrate` script |
| X-11 | Configurable `OTP_PER_IP_PER_HOUR` |
| X-12 | `sanchay_si` indicator cookie |
| X-13, X-14 | Final code written into the plan |
| X-15 | `--filter=` form everywhere |
| X-16 | Enums come from `@sanchay/domain` |
| X-17 | Missing codes added to the error maps |
| X-18 | Shared build pattern |
| X-19 | Cookie-helper check in the S0 spike |
| X-20 | Part B Tasks 1–10 text regenerated in S0 |

### Critical Files for Implementation
- C:/Users/pc/Desktop/sanchay/docs/superpowers/plans/2026-09-28-plan-01-foundation.md (to create)
- C:/Users/pc/Desktop/sanchay/docs/superpowers/plans/2026-09-28-plan-00-s0-evidence-gates.md (to create)
- C:/Users/pc/Desktop/sanchay/docs/capacity.md (to create)
- C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/service/OrderService.java (read-only reference)
- C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/docs/cybrilla-production-inquiry-email.md (read-only reference)

---

# Sanchay sprint plans S0–S11 (Mon 2026-09-28 to Fri 2027-03-12)

This is a plan only. No file was created, edited, moved or deleted.

## Conventions used in every sprint below

**Units.** All estimates are ideal days.

**Capacity formula.** Available days per dev = 10 − weekday gazetted holidays − leave. Leave is 0.5 day per dev per sprint, and collective leave counts as that sprint's leave.
- Gross = available × 0.75 focus × AI factor.
- Committed = gross × 0.8. The other 20% is held back as visible buffer.
- The AI factor is 1.0 in S0 and 1.35 in S1–S11. The 1.35 figure is unmeasured. It is replaced by measured velocity on Fri 2026-11-06, and S3–S11 are then re-cut.

**Load.** Load = items + overheads.
- Cross-review is 1.0 per dev per sprint, rising to 1.25 in money-heavy sprints (S7+).
- FakeFp upkeep is 0.5 on Dev A from S4.
- Load percentages are against committed capacity, with the percentage against gross shown alongside.

**Owners (DLV-22 / CODEOWNERS).** The other dev is the named reviewer on every PR.
- Dev A (backend-leaning): kernel, FpGateway/FakeFp, onboarding/KYC backend, consent, sagas, ledger.
- Dev B (client-leaning): CI/CDK/release, UI kit, web/native, admin app and identity/authz, payments, NAV/catalogue/fund facts/commission, ops tooling, app config.
- AI agents run spec-driven work: spec in `docs/specs/<module>.md`, then golden vectors, then FakeFp, then human review and merge. Their output is inside the factor, not extra days.

**Holiday-deadline rule (DLV-18).** No deadline, demo or retro falls on a gazetted holiday or collective-leave day. Every date below has been checked against this rule, and the weekdays were computed with node.

**Core DoD.** Each sprint's DoD lists these items plus its own sprint-specific items.
1. PR reviewed by the other dev and merged to `main`. CI is green: Biome, typecheck, unit tests, and integration tests (Testcontainers from S1).
2. Tests are added. Money and regulatory logic has golden vectors. Nothing is skipped and no `.only` is left in.
3. `docs/specs/<module>.md` is updated. There is an ADR for any decision. `states.md` is updated when a state machine changes (from S3).
4. Rename rules hold: no `plz`, `PLZ_`, `@plz/`, `x-plz-`, `__Host-plz_` or `platizio.in` anywhere. `Platizio` appears only for the legal entity, the ARN holder, `platizio.com` Workspace and the Cybrilla tenant. `check-boundaries` enforces this in CI from S1.
5. No secrets in the repo. No PII in logs (pino allow-list from S1).
6. From S3, every merge to `main` deploys to dev (AWS nonprod).
7. Client work is verified on web (Playwright) and Android. iOS is added as simulator from S3 and device from S7.
8. The sprint-goal demo is accepted by the PO.

**Verification commands** (these work in both PowerShell 5.1 and Git Bash, one per line, with no `&&`):
- `pnpm install --frozen-lockfile`
- `pnpm turbo run lint typecheck test`
- `docker compose up -d`
- `pnpm --filter=@sanchay/api test`

---

## Sprint Plan: S0 - Evidence gates (plan-00 + plan-01 start)
**Dates:** Mon 2026-09-28 - Fri 2026-10-09 | **Team:** 2 engineers + AI agents
**Sprint Goal:** Decide the stack and the Cybrilla FP capabilities on evidence by Fri 10-09, and present the probe readout and PO-8.

### Capacity
| Person | Available Days | Allocation | Notes |
|---|---|---|---|
| Dev A | 8.5 of 10 | 5.1 committed (6.375 gross) | Fri 10-02 Gandhi Jayanti; 0.5 leave; factor 1.0 (greenfield, DLV-16) |
| Dev B | 8.5 of 10 | 5.1 committed (6.375 gross) | Same |
| AI agents | — | inside the factor (1.0 this sprint) | Scaffolding and probe scripts only; spec-driven flow starts S1 |
| **Total** | **17.0** | **10.2 committed (12.75 gross)** | 20% buffer = 2.55 |

### Sprint Backlog
| Priority | Item | Estimate | Owner | Dependencies |
|---|---|---|---|---|
| P0 | FP probe pack, synchronous set (details below) | 3.0 | Dev A | Sandbox tenant with both token audiences (E-2) |
| P0 | oRPC 1.15.4 / Nest 11.2.6 / Fastify gate spike (details below) | 1.0 | Dev A | A1 |
| P0 | Plan 01 **A1** repo bootstrap (pnpm + Turborepo, `@sanchay/*` scope; pushed only on owner request) | 0.5 | Dev B | GitHub repo (E-15) |
| P0 | Plan 01 **A2** `@sanchay/config` + Biome + lefthook (hooks work in PowerShell 5.1 and Git Bash) | 0.5 | Dev B | A1 |
| P0 | Plan 01 **A13** CI; fake `SANCHAY_PLATFORM_ARN` fixture (X-07) | 0.5 | Dev B | A2 |
| P0 | Plan 01 **B2** docker compose: postgres:18.6 on 55432; Mailpit on 8025 (UI) and 1025 (SMTP) | 0.25 | Dev B | A1 |
| P0 | AGENTS.md (rename rules, `--filter=` form per X-15) + CODEOWNERS by module | 0.25 | Dev B | A1 |
| P0 | Lockfile dry-run + ADR-0001 (details below) | 0.5 | Dev B | A1 |
| P0 | Universal-UI spike (details below) + ADR-0002 | 1.0 | Dev B | Expo build; low-end phone (E-24) |
| P0 | Expo SDK 57 dev build (local + EAS project; bundle id `in.sanchay.app`, dev scheme `sanchay`) | 0.5 | Dev B | EAS account (E-15) |
| P0 | Cross-review | 1.0 | Dev A | — |
| P0 | Cross-review | 1.0 | Dev B | — |
| P2 | None committed. The cut line is the lockfile/AGENTS polish, which can move to Mon 10-12 | — | — | — |

Details for the longer items:
- **FP probe pack:**
  - Run the synchronous probes P-01, 03, 04, 05, 06, 08, 10, 11 and 14, plus a capability listing.
  - Start the progression probes P-02, 07, 09, 12 and 13, plus a mandate approval.
  - Build `tools/fp-probes` and define the evidence format.
  - Support the drafting of the Cybrilla questionnaire.
- **Gate spike:**
  - Ping contract.
  - Typed `.errors()` via OpenAPILink.
  - Check the `@orpc/server/helpers` cookie helpers (X-19).
  - Regenerate the lost Part B Tasks 1–10 text (X-20).
  - Write ADR-0003.
- **ADR-0001:** one React copy or one per app; single catalog pins including vite 7.3.6 (X-06); `allowBuilds` (X-08).
- **Universal-UI spike:**
  - Build Button, TextField, Sheet and AmountInput with RN Reusables + Uniwind.
  - Run axe.
  - Measure the react-native-web gzip cost.
  - Test on a low-end Android phone.

### Planned Capacity: 10.2 days | Sprint Load: 10.0 days (98% of capacity)
- Per dev: A 5.0 / 5.1, B 5.0 / 5.1.
- Load is 78% of gross (12.75). Items 8.0, overheads 2.0.
- Plan 01 progress this sprint: A1, A2, A13, B2 = 1.75.

### Risks
| Risk | Impact | Mitigation |
|---|---|---|
| Sandbox tenant or the second token audience is not ready on 09-28 (E-2) | Probes cannot run, so the 10-09 readout is thin | Escalate Tue 09-29. Probe whatever audience exists. Record anything unprovable as UNPROVEN, which goes to an explicit PO-2 go/no-go (never a silent hide) |
| Gate spike fails: typed errors or cookies don't round-trip through oRPC on Nest 11.2.6 + Fastify | B4/B9/B10 in S1 are blocked | ADR-0003 names a fallback (Nest controllers + OpenAPI-generated client), decided by Thu 10-08. PO-1 keeps Nest at 11.2.6 |
| react-native-web bundle or low-end Android performance is unacceptable | The universal-UI strategy changes | ADR-0002 records measured gzip size and TTI on the E-24 phone. The per-app fallback is chosen together with ADR-0001 |
| 98% load at factor 1.0 plus the Fri 10-02 holiday | Almost no slack | Probes and the gate spike come first. Lockfile/AGENTS polish is the only item allowed to slip to Mon 10-12 |
| Probe IDs P-02, P-08 and P-13 are undefined in the design | Evidence is filed against the wrong IDs | `docs/probes/README.md` confirms the proposed mapping by Wed 09-30: P-02 = UPI Autopay/mandates, P-08 = webhook signature, P-13 = switch/STP/SWP |
| Windows 11 dev environment (Docker Desktop, lefthook in PowerShell 5.1) | CI and local runs disagree | CI runs the same scripts, and every script is tested in both shells |
| GitHub org/repo (E-15) is late | A1 cannot publish | Work in a local git repo. Push only when the owner asks |

### Definition of Done
- [ ] Core DoD 1–5 and 8
- [ ] ADR-0001, ADR-0002 and ADR-0003 merged
- [ ] `docs/probes/P-xx.md` exists for P-01, 03, 04, 05, 06, 08, 10, 11 and 14, with redacted request/response, timestamp and a verdict of PROVEN, PARTIAL or UNPROVEN
- [ ] Progression probes P-02, 07, 09, 12, 13 and the mandate approval are started, with a tracking file
- [ ] `docs/probes/README.md` confirms the P-02, P-08 and P-13 mapping
- [ ] `docs/capacity.md` written: formula, leave rule of 0.5/dev/sprint, holiday-deadline rule
- [ ] `pnpm install --frozen-lockfile` and `pnpm turbo run lint typecheck test` are green in both PowerShell 5.1 and Git Bash
- [ ] `docker compose up -d` serves postgres 18.6 on 55432 and Mailpit on 8025/1025
- [ ] AGENTS.md and CODEOWNERS (module map) merged
- [ ] Expo 57 dev build runs on the E-24 phone
- [ ] Part B Tasks 1–10 text regenerated in plan-01
- [ ] Probe readout and PO-8 presented Fri 10-09: new P50/P80, levers, D-1..D-6

### Key Dates
| Date | Event |
|---|---|
| Mon 2026-09-28 | Sprint start and planning. Business actions: E-1/E-2 Cybrilla questionnaire (Q-C1..Q-C17 + GAP-02 A–G; includes time-travel) and sandbox tenant; E-9 CAMS/KFin mailback request; E-15 GitHub org; office holiday list and known leave confirmed |
| Tue 2026-09-29 | Sandbox access check (escalate if blocked) |
| Wed 2026-09-30 | Probe ID mapping confirmed |
| Thu 2026-10-01 | E-17 counsel engaged; E-24 low-end Android phone; E-15 Expo EAS plan |
| Fri 2026-10-02 | Gandhi Jayanti (no work, no deadlines) |
| Mon 2026-10-05 | Mid-sprint check-in |
| Thu 2026-10-08 | ADR decisions frozen; plan-01 sprint column and plan-02 drafted |
| Fri 2026-10-09 | Demo: probe readout. PO-8 decision (P50/P80, levers, D-1..D-6); E-5 ARN validity confirmed. Retro |

---

## Sprint Plan: S1 - Kernel foundations (plan-01 Part A/B + plan-02)
**Dates:** Mon 2026-10-12 - Fri 2026-10-23 | **Team:** 2 engineers + AI agents
**Sprint Goal:** Persistence, crypto, audit, OTP and the money/validation packages are live under test.

### Capacity
| Person | Available Days | Allocation | Notes |
|---|---|---|---|
| Dev A | 8.5 of 10 | 6.9 committed (8.6 gross) | Tue 10-20 Dussehra; 0.5 leave; factor 1.35 |
| Dev B | 8.5 of 10 | 6.9 committed (8.6 gross) | Same |
| AI agents | — | inside factor 1.35 | First spec-driven sprint; measure ideal vs actual per PR |
| **Total** | **17.0** | **13.8 committed (13.77 exact; 17.21 gross)** | Buffer 3.44 |

### Sprint Backlog
| Priority | Item | Estimate | Owner | Dependencies |
|---|---|---|---|---|
| P0 | **B1** env/config (`SANCHAY_*`; configurable `OTP_PER_IP_PER_HOUR`, X-11) | 0.25 | Dev A | Gate spike |
| P0 | **B4** contract + errors + OpenAPI (enums from `@sanchay/domain`, X-16; error maps, X-17) | 0.5 | Dev A | A9–A12 |
| P0 | **B9** oRPC module; **B10** Fastify bootstrap/health (hardened from the spike) | 0.5 | Dev A | B4 |
| P0 | **B3** Drizzle identity schema + `sanchay_migrator` / `sanchay_app` roles; root `db:migrate` (X-10) | 0.75 | Dev A | B2 |
| P0 | **B6** provider modes & fakes (capture \| mailpit; msg91 comes in S3) | 0.25 | Dev A | B1 |
| P0 | **B7** crypto/ids (KMS envelope, `newId`, RowId AAD) | 0.75 | Dev A | B3 |
| P0 | **B11** OpenAPI drift test; **B12** AuditService | 0.75 | Dev A | B4, B3 |
| P0 | **B13** SMS/email ports + templates; **B14** OTP issue; **B15** OTP verify | 2.0 | Dev A | B6, B7 |
| P0 | Probe progression tracking | 0.25 | Dev A | S0 probes |
| P0 | **A3–A8**: decimal core, Money, Units/Nav, INR formatting, XIRR display per PO-5, largest remainder | 2.0 | Dev B | A2 |
| P0 | **A9–A12**: validation, identity/IFSC/pincode/OTP/amount schemas, domain enums, branded ids (first in the sprint: days 1–2) | 1.0 | Dev B | A2 |
| P0 | **B5** Testcontainers harness; **B8** CLS + pino allow-list | 1.0 | Dev B | B2 |
| P0 | **C1** tokens; **C2** api-client error model + conformance (Part 2 names are the source of truth, X-02) | 0.75 | Dev B | B4 |
| P1 | Admin Vite skeleton under prod CSP (served behind the ALB, GAP-07c / D-6) + bundle baseline ADR-0005 | 0.75 | Dev B | A13 |
| P1 | `check-boundaries` + design-coverage checklist (every §D.3 endpoint and §J job maps to a plan; DLV-09) | 0.5 | Dev B | A13 |
| P0 | Cross-review | 1.0 | Dev A | — |
| P0 | Cross-review | 1.0 | Dev B | — |

### Planned Capacity: 13.8 days | Sprint Load: 14.0 days (101.7% of capacity)
- Per dev: A 7.0 / 6.885, B 7.0 / 6.885.
- The allocation's +0.1/dev overrun is absorbed by the buffer. Load is 81.3% of gross.
- Plan 01 this sprint: A3–A12, B1, B3–B15, C1, C2 = 10.5 (12.25 cumulative).

### Risks
| Risk | Impact | Mitigation |
|---|---|---|
| Load above committed, with Dussehra splitting week 2 | Tail tasks slip into S2, which is also full | The P1 items (admin skeleton 0.75, check-boundaries 0.5) are the cut line. Any slip is recorded for the 11-06 re-baseline, not hidden |
| No AWS account until E-14 (10-30) | KMS envelope cannot be tested against real KMS | B7 uses a local KMS fake behind the provider-mode port. Real KMS is verified in S3 |
| PO-2 decision on the synchronous probes (Fri 10-16) declares a capability no-go | Scope change | Immediate PO escalation and re-plan. A Q-C15 "yes" (Platizio needs its own ONDC buyer-NP registration) is a critical-path re-plan |
| AI factor of 1.35 is unproven | The whole roadmap shifts | Log ideal vs actual days and review hours per PR, for the S0–S2 report on 11-06 |
| Money/decimal defects spread everywhere | Wrong amounts shown to investors | Golden vectors and ≥ 95% coverage on `money`. No JS floating-point numbers used for money anywhere |
| MSG91/DLT not ready until 11-06 (E-10) | No real SMS | B13 ships capture and mailpit modes only. The msg91 adapter lands in S3 |

### Definition of Done
- [ ] Core DoD 1–5 and 8
- [ ] Decrypting with a swapped RowId fails (AAD test)
- [ ] `money` coverage ≥ 95%; largest-remainder and INR formatting vectors pass
- [ ] XIRR display follows PO-5:
  - under 30 days: "Too early" + absolute return;
  - 30–364 days: "Annualised; can swing widely for holdings under 1 year" with absolute return beside it;
  - 365 days or more: plain XIRR.
- [ ] A typed error round-trips in a Node client; the OpenAPI drift test is green
- [ ] `sanchay_app` role has no DDL rights; migrations run only as `sanchay_migrator`
- [ ] OTP issue/verify pass with per-number and configurable per-IP limits; AuditService rows are written
- [ ] Admin skeleton loads under the prod CSP; ADR-0005 bundle baseline recorded (P1)
- [ ] `check-boundaries` runs in CI; design-coverage checklist committed (P1)

### Key Dates
| Date | Event |
|---|---|
| Mon 2026-10-12 | Sprint start and planning (plan-02 active) |
| Fri 2026-10-16 | PO-2 go/no-go on the synchronous probes |
| Mon 2026-10-19 | Mid-sprint check-in |
| Tue 2026-10-20 | Dussehra (no deadlines) |
| Thu 2026-10-22 | S2 section of plan-02 refreshed |
| Fri 2026-10-23 | Demo + retro. E-17 counsel regulatory-sources register; E-16 `sanchay.in` registered and delegated to Route 53 |

---

## Sprint Plan: S2 - Walking skeleton (plan-01 exit)
**Dates:** Mon 2026-10-26 - Fri 2026-11-06 | **Team:** 2 engineers + AI agents
**Sprint Goal:** An investor signs up or logs in by SMS OTP on web dev and on an Android dev build.

### Capacity
| Person | Available Days | Allocation | Notes |
|---|---|---|---|
| Dev A | 9.5 of 10 | 7.7 committed (9.62 gross) | 0.5 leave; no holiday |
| Dev B | 9.5 of 10 | 7.7 committed (9.62 gross) | 0.5 leave |
| AI agents | — | inside factor 1.35 | Measured this sprint for the re-baseline |
| **Total** | **19.0** | **15.4 committed (15.39 exact; 19.24 gross)** | Buffer 3.85 |

### Sprint Backlog
| Priority | Item | Estimate | Owner | Dependencies |
|---|---|---|---|---|
| P0 | **B16** InvestorAccounts/DeviceTrust; **B17** SessionService; **B18** step-up token | 2.0 | Dev A | B15 |
| P0 | **B19** auth/me procedures; **B20** guards/cookies (`__Host-sanchay_*`, `sanchay_si` indicator, X-12); **B21** OTP login flows | 2.25 | Dev A | B16–B18 |
| P0 | **B22** session management; **B23** email add/verify; **B25** typed error gate; **B26** runnable locally (API :3000, web :3001, X-04) | 2.0 | Dev A | B21 |
| P0 | Progression probe readout (P-02, 07, 09, 12, 13 + mandates) | 0.5 | Dev A | S0 probes |
| P0 | **C3** transports (`x-sanchay-client` = web \| android \| ios, X-01); **C4** ui batch 1 core; **C5** inputs | 2.0 | Dev B | C2 |
| P0 | **C6** app-core; **C7** useOtpLogin (Part 2 shapes, X-02/X-13); **C8** Login/Welcome; **C9** Home/AppShell (5 tabs per GAP-06; `GET /auth/session`, X-03) | 1.9 | Dev B | C3–C5 |
| P0 | **C10** web routing/CSP/proxy (hosts from config `SANCHAY_WWW_HOST` / `SANCHAY_APP_HOST`, D-1); **C11** web wiring + smoke | 1.2 | Dev B | C9 |
| P0 | **C13** mobile libraries; **C14** Expo wiring + app lock (biometric/device credential, no PIN, GAP-06) | 1.15 | Dev B | C9 |
| P0 | Cross-part reconciliation X-01..X-05 (OTP read from Mailpit, ports, env names) | 0.25 | Dev B | — |
| P0 | Cross-review | 1.0 | Dev A | — |
| P0 | Cross-review | 1.0 | Dev B | — |

### Planned Capacity: 15.4 days | Sprint Load: 15.25 days (99.1% of capacity)
- Per dev: A 7.75 / 7.695 (+0.05), B 7.5 / 7.695 (0.2 spare, used for first-pass review of A's PRs).
- Load is 79.3% of gross.
- Plan 01 this sprint: 12.5 (24.75 cumulative). The remaining 1.05 is in S3.

### Risks
| Risk | Impact | Mitigation |
|---|---|---|
| The 11-06 skeleton demo is a fixed re-baseline date | Re-baseline has no evidence | Dry run Wed 11-04. Cut order if short: app-lock polish (C14) first, web last |
| Progression probes stall in sandbox (mandate approval, P-09 step-up, P-12, P-13) | PO-2b on 11-13 decides on thin evidence | The readout marks items UNPROVEN, which go to explicit go/no-go. Sandbox time-travel was requested in the questionnaire |
| D-1 domain default not confirmed on 10-09 | Rework in CSP and cookies | Hosts come only from config, so both options cost 0 |
| Expo 57 / RN Reusables / Uniwind version churn | Android build breaks | Pins from ADR-0001 in the catalog. Upgrades need an ADR |
| Measured factor comes in below 1.35 | P80 moves (sensitivity: 1.35 → 2028-02-28) | Report delivered 11-06. PO re-baselines. Levers stay documented and untaken (PO-4) |
| Real SMS not live until S3 | Demo uses capture mode | The demo states that SMS runs in capture mode, with OTP read from Mailpit per X-01. MSG91 lands in S3 |

### Definition of Done
- [ ] Core DoD 1–5 and 8
- [ ] Walking skeleton demoed on web (API :3000, web :3001) and on an Android dev build: sign-up, login and logout by OTP; 5-tab AppShell; app lock on native
- [ ] Cookies are `__Host-sanchay_*` plus the `sanchay_si` indicator; the `x-sanchay-client` header is sent from every client; `GET /auth/session` works
- [ ] Typed error gate (B25) passes; email add/verify works through Mailpit
- [ ] Velocity and review-hours report for S0–S2 delivered, with the measured factor
- [ ] Progression probe readout filed (PO-2b due Fri 11-13)
- [ ] Re-baseline presented; GAP-12 D7 amendment signed by the PO

### Key Dates
| Date | Event |
|---|---|
| Mon 2026-10-26 | Sprint start and planning |
| Fri 2026-10-30 | E-14 AWS organisation + sanchay-nonprod account (SCP ap-south-1); E-12 D-U-N-S number |
| Mon 2026-11-02 | Mid-sprint check-in |
| Wed 2026-11-04 | Skeleton dry run |
| Thu 2026-11-05 | plan-03 drafted |
| Fri 2026-11-06 | Demo: walking skeleton. Progression readout; re-baseline (measured factor); GAP-12 D7 signed. E-10 DLT entity/header/login template + MSG91 contract; E-11 SES nonprod + SPF/DKIM/DMARC on `sanchay.in`. Retro. **S3 planning after the retro**, because Mon–Tue 11-09/10 are Diwali leave |

---

## Sprint Plan: S3 - Kernel completion and nonprod infrastructure (plan-03)
**Dates:** Mon 2026-11-09 - Fri 2026-11-20 | **Team:** 2 engineers + AI agents
**Sprint Goal:** The kernel is complete and dev runs on AWS nonprod.

### Capacity
| Person | Available Days | Allocation | Notes |
|---|---|---|---|
| Dev A | 8 of 10 | 6.5 committed (8.1 gross) | Diwali collective leave Mon 11-09 + Tue 11-10 (counts as the sprint's leave); Tue 11-10 NSE holiday |
| Dev B | 8 of 10 | 6.5 committed (8.1 gross) | Same |
| AI agents | — | 1.35 until the 11-06 measured factor replaces it | Re-cut this table if the factor changes |
| **Total** | **16.0** | **13.0 committed (12.96 exact; 16.2 gross)** | Buffer 3.24 |

### Sprint Backlog
| Priority | Item | Estimate | Owner | Dependencies |
|---|---|---|---|---|
| P0 | **B24** rate limiting (Plan 01 tail) | 0.25 | Dev A | B21 |
| P0 | Idempotency interceptor + `idempotency_keys` (X-09 "Part 4") | 1.0 | Dev A | B3 |
| P0 | JobsModule (pg-boss, `enqueue(tx)`), worker heartbeat, `APP_ROLE=worker` | 1.5 | Dev A | B3 |
| P0 | EdgeGuard (`x-sanchay-edge`) + cross-host suite | 0.5 | Dev A | B10 |
| P0 | MSG91 adapter + DLT login template + boot guard | 1.0 | Dev A | E-10 |
| P0 | SES adapter + email OTP prod mode | 0.5 | Dev A | E-11 |
| P0 | `states.md` + `gen:states` part 1 | 0.75 | Dev A | — |
| P0 | Plan 01 **C12** web e2e; **C15** Maestro Android; EAS iOS simulator build in CI (DLV-21) | 1.05 | Dev B | S2 |
| P0 | CDK nonprod part 1: VPC, RDS PostgreSQL 18.6, ECS api/worker/web, ECR, GitHub OIDC | 2.0 | Dev B | E-14 nonprod account |
| P0 | Self-hosted Sentry in ap-south-1 + PII scrubbing (GAP-06 §5) | 2.0 | Dev B | CDK part 1 |
| P0 | `calendar_years` / `market_holidays` seed + loader (DLV-09) | 0.5 | Dev B | — |
| P0 | Cross-review | 1.0 | Dev A | — |
| P0 | Cross-review | 1.0 | Dev B | — |

### Planned Capacity: 13.0 days | Sprint Load: 13.05 days (100.7% of capacity)
- Per dev: A 6.5 / 6.48, B 6.55 / 6.48. Load is 80.6% of gross.
- Plan 01 closes this sprint: B24 + C12 + C15 = 1.05 (25.8 total).

### Risks
| Risk | Impact | Mitigation |
|---|---|---|
| AWS nonprod account (E-14, 10-30) is late | CDK cannot deploy, so Core DoD 6 fails | `cdk synth` + cdk-nag run locally from day 1. Deploy the moment the account lands. Escalate to the PO on Wed 11-11 |
| Self-hosted Sentry (a heavy stack) takes more than 2.0 | Delays the S4 CDK work | Time-box to 2.0. Any overrun goes to the PO as an explicit decision, not a silent switch to a SaaS region |
| DLT login template not approved (E-10) | No production SMS | The boot guard refuses msg91 mode without an approved template id. Nonprod stays on capture/mailpit |
| SES still in sandbox (E-11) | Email OTP only reaches verified addresses | Allowlist staff addresses. Production access is requested later (E-11, 2027-11-26) |
| PO-2b on 11-13 marks P-02/P-09/P-13 no-go | Mandates, SIP step-up or switch/STP/SWP must be re-scoped | Explicit PO amendment. The PO-6 step-up stays conditional (+2.0 in S20, D-3) |
| Short, post-Diwali sprint | Context loss | S3 planning is done Fri 11-06, so work starts Wed 11-11 with tickets ready |

### Definition of Done
- [ ] Core DoD 1–8 (iOS = simulator build in CI)
- [ ] Every merge to `main` deploys to dev on AWS nonprod (ap-south-1)
- [ ] Idempotent replay returns the stored response; conflicting-body replay is rejected
- [ ] Jobs enqueue inside the caller's transaction; worker heartbeat alarm wired
- [ ] Cross-host suite green: `api.sanchay.in` rejects requests without `x-sanchay-edge`; the ops host is isolated
- [ ] MSG91 and SES adapters pass contract tests; the boot guard is proven by a negative test
- [ ] `gen:states` generates types from `states.md`
- [ ] Playwright web e2e and Maestro Android in CI; EAS iOS simulator build in CI
- [ ] Self-hosted Sentry receives events from api/web/native with scrubbing verified (no PAN, phone or email)
- [ ] 2026–2027 market holidays seeded through the loader

### Key Dates
| Date | Event |
|---|---|
| Mon 2026-11-09 | Sprint start (Diwali collective leave Mon–Tue; no deadlines) |
| Wed 2026-11-11 | Work resumes; AWS account check |
| Fri 2026-11-13 | PO-2b on the progression probes; PO-6 step-up outcome |
| Mon 2026-11-16 | Mid-sprint check-in |
| Thu 2026-11-19 | plan-04 drafted |
| Fri 2026-11-20 | Demo + retro. E-28 Google Workspace `platizio.com`: ops accounts with passkeys/keys, OIDC client for the ALB, break-glass keys |

---

## Sprint Plan: S4 - FP gateway and admin identity (plan-04)
**Dates:** Mon 2026-11-23 - Fri 2026-12-04 | **Team:** 2 engineers + AI agents
**Sprint Goal:** FpGateway talks to the Cybrilla sandbox, and ops staff can log in with OIDC and TOTP step-up.

### Capacity
| Person | Available Days | Allocation | Notes |
|---|---|---|---|
| Dev A | 8.5 of 10 | 6.9 committed (8.6 gross) | Tue 11-24 Guru Nanak; 0.5 leave; FakeFp upkeep starts (0.5) |
| Dev B | 8.5 of 10 | 6.9 committed (8.6 gross) | Same holiday and leave |
| AI agents | — | measured factor (planned 1.35) | FpGateway contract tests are generated against sandbox evidence |
| **Total** | **17.0** | **13.8 committed (13.77 exact; 17.21 gross)** | Buffer 3.44 |

### Sprint Backlog
| Priority | Item | Estimate | Owner | Dependencies |
|---|---|---|---|---|
| P0 | JCS canonicaliser, validators, `gen:states` SQL CHECKs | 1.0 | Dev A | S3 |
| P0 | FpGateway core (two token audiences, lossless-json, FpError, `provider_calls`) + FakeFp + contract harness, part 1 | 4.4 | Dev A | Kernel |
| P0 | CDK part 2 (details below) | 1.5 | Dev B | CDK part 1 |
| P0 | Admin identity (details below) | 2.5 | Dev B | E-28 |
| P0 | `packages/authz`: seven roles + permission matrix + generated spec (GAP-07b) | 1.0 | Dev B | Admin identity |
| P0 | ui batch 1 remainder, part 1 | 0.9 | Dev B | C4/C5 |
| P0 | Cross-review | 1.0 | Dev A | — |
| P0 | FakeFp upkeep | 0.5 | Dev A | FpGateway |
| P0 | Cross-review | 1.0 | Dev B | — |
| P1 (no load) | Curator's CSV template for fund facts started (DLV-11) | inside the fund-facts estimate | Dev B | — |

Details for the longer items:
- **CDK part 2:**
  - CloudFront for `sanchay.in` and `api.sanchay.in`.
  - Ops ALB with an OIDC authenticate rule for `ops.sanchay.in`.
  - WAF with the webhook exemption.
  - IPv4 or dual-stack according to P-06.
- **Admin identity (GAP-07a):**
  - Google Workspace OIDC at the ALB.
  - Verify `x-amzn-oidc-data` (signer and ES256).
  - `__Host-sanchay_ops` sessions.
  - TOTP step-up.
  - Bootstrap CLI.
  - Login screen.

### Planned Capacity: 13.8 days | Sprint Load: 13.8 days (100.2% of capacity)
- Per dev: A 6.9 / 6.885, B 6.9 / 6.885. Load is 80.2% of gross.

### Risks
| Risk | Impact | Mitigation |
|---|---|---|
| FpGateway (4.4, on the zero-float Lane A) runs over | Everything from onboarding onwards slips | Split into vertical slices: auth tokens, then reads, then writes. FpGateway part 2 (0.6) is already planned in S5 |
| Large numbers or the wrong token audience cause silent data loss | Wrong units or amounts | lossless-json everywhere. Contract harness runs the same tests on FakeFp and sandbox |
| E-28 OIDC client not delivered by 11-20 | Ops login demo slips | Use a staging OIDC client in a test Workspace OU. The demo date holds |
| `x-amzn-oidc-data` verification done wrongly | Admin authentication bypass | Verify the signer ARN and key by `kid`. A negative suite of forged-header tests runs in CI. The SPA is reachable only through the ALB (D-6) |
| WAF webhook exemption is too broad | Attack surface grows | The exemption is scoped to the exact path plus the Cybrilla source ranges from P-08/P-06. A signature check still runs in the app (S13) |
| Apple/Play org accounts (E-12, 11-30) are late | iOS device builds in S7 are at risk | Track it at the check-in. The simulator build remains available |

### Definition of Done
- [ ] Core DoD 1–8
- [ ] Ops login demo on Fri 12-04: Workspace OIDC at the ALB, then TOTP step-up, then a `__Host-sanchay_ops` session, with an audit row
- [ ] The same contract suite is green on FakeFp and on the sandbox (read calls at minimum); `provider_calls` rows are redacted
- [ ] `gen:states` SQL CHECK constraints migrate cleanly
- [ ] CDK part 2 deployed to nonprod; `ops.sanchay.in` is unreachable without OIDC
- [ ] authz matrix spec generated and checked in CI
- [ ] Curator CSV template shared with the PO (DLV-11)

### Key Dates
| Date | Event |
|---|---|
| Mon 2026-11-23 | Sprint start and planning |
| Tue 2026-11-24 | Guru Nanak Jayanti (no deadlines) |
| Fri 2026-11-27 | E-2 POA agreement (KYC user agency) signed |
| Mon 2026-11-30 | Mid-sprint check-in; E-12 Apple Developer + Google Play organisation accounts |
| Tue 2026-12-01 | E-21 CA engaged |
| Thu 2026-12-03 | plan-05 drafted |
| Fri 2026-12-04 | Demo: ops login. E-17 legal drafts (T&C, DPDP notice naming processors, risk and commission disclosure, execution-only declaration, Annexure-A/B, KYC consent, CAS notice, investor charter, grievance policy with 7/21/30-day text). Retro |

---

## Sprint Plan: S5 - Onboarding identity and catalogue data (plan-05)
**Dates:** Mon 2026-12-07 - Fri 2026-12-18 | **Team:** 2 engineers + AI agents
**Sprint Goal:** A new investor passes identity and readiness checks against FakeFp.

### Capacity
| Person | Available Days | Allocation | Notes |
|---|---|---|---|
| Dev A | 9.5 of 10 | 7.7 committed (9.62 gross) | 0.5 leave; FakeFp 0.5 |
| Dev B | 9.5 of 10 | 7.7 committed (9.62 gross) | 0.5 leave |
| AI agents | — | measured factor (planned 1.35) | GAP-05 vectors are a good fit for agents |
| **Total** | **19.0** | **15.4 committed (15.39 exact; 19.24 gross)** | Buffer 3.85 |

### Sprint Backlog
| Priority | Item | Estimate | Owner | Dependencies |
|---|---|---|---|---|
| P0 | FpGateway part 2 | 0.6 | Dev A | S4 |
| P0 | Schemes + FP catalogue sync + `plan_txn_rules` (Regular plans, Growth option only, per PO-3) | 0.5 | Dev A | FpGateway |
| P0 | `money_params` + cutoff profiles + NC display vectors + mandate-limit vectors (GAP-05) | 1.5 | Dev A | Domain |
| P0 | Onboarding derivation + identity + readiness table + POA pre-verification, part 1 | 3.6 | Dev A | FpGateway; POA (E-2) |
| P0 | ui batch 1 remainder (AmountInput, MoneyText, Sheet, …; contrast test, axe) | 1.6 | Dev B | — |
| P0 | AMFI NAV pipeline part 1 | 3.5 | Dev B | — |
| P0 | Domain part 1: XIRR vectors V1–V7, FIFO core, cut-off engine + calendar | 1.6 | Dev B | `money` |
| P0 | Cross-review | 1.0 | Dev A | — |
| P0 | FakeFp upkeep | 0.5 | Dev A | — |
| P0 | Cross-review | 1.0 | Dev B | — |

### Planned Capacity: 15.4 days | Sprint Load: 15.4 days (100.1% of capacity)
- Per dev: A 7.7 / 7.695, B 7.7 / 7.695. Load is 80.1% of gross.

### Risks
| Risk | Impact | Mitigation |
|---|---|---|
| POA agreement (E-2, 11-27) not signed | POA pre-verification cannot hit the sandbox | Build it against FakeFp with P-xx evidence shapes. Sandbox verification moves to S6 |
| `money_params`, cut-off times or mandate limits don't match regulation | Wrong NAV applicability or rejected mandates | Every value is sourced in the spec (circular reference) and the vectors are reviewed by compliance. Values are data, not code |
| AMFI NAV file format drift or feed outage | Stale NAVs | Parser tolerates column order; quarantine on anomaly; staleness alarm. Quarantine release UI comes in S7 |
| Catalogue sync leaks Direct plans or IDCW options | Breaks the MFD/Regular and PO-3 decisions | Filter plus a DB constraint plus a test that fails if any non-Regular or non-Growth plan is visible |
| Many external deadlines fall on Fri 12-18 | Legal and compliance inputs for S6–S8 slip | Check at mid-sprint 12-14. Build on the drafts and flag each dependency as `DRAFT_COPY` |

### Definition of Done
- [ ] Core DoD 1–8
- [ ] Demo: a new investor on FakeFp reaches READY-minus-KYC through the readiness table, which shows each gate with its reason
- [ ] GAP-05 golden vectors pass (money params, cut-off profiles, NC display, mandate limits)
- [ ] Catalogue shows Regular + Growth only (test enforced)
- [ ] NAV pipeline ingests the daily AMFI file into staging with quarantine
- [ ] XIRR V1–V7 and FIFO core vectors pass; the cut-off engine uses the calendar loader
- [ ] ui batch 1: contrast test passes; axe reports 0 serious or critical issues

### Key Dates
| Date | Event |
|---|---|
| Mon 2026-12-07 | Sprint start and planning |
| Mon 2026-12-14 | Mid-sprint check-in (external-deadline status) |
| Thu 2026-12-17 | plan-06 drafted |
| Fri 2026-12-18 | Demo + retro. E-17 counsel OI-1..OI-17 (if OI-1 is not an unconditional "execution-only OK", trigger NISM V-A enrolment by 01-15 and EUIN by 03-31, E-6); E-19 compliance sign-off on the risk questionnaire, SUITABILITY_WARNING and RISK_PROFILE_ATTESTATION texts; E-9 sample mailback files; E-10 consent SMS templates; E-17 category-circular register entry |

---

## Sprint Plan: S6 - Profile, legal consents, risk profile, NAV (plan-06)
**Dates:** Mon 2026-12-21 - Fri 2027-01-01 | **Team:** 2 engineers + AI agents
**Sprint Goal:** An investor's profile, legal consents and risk profile are captured.

### Capacity
| Person | Available Days | Allocation | Notes |
|---|---|---|---|
| Dev A | 7 of 10 | 5.7 committed (5.67 exact; 7.09 gross) | Fri 12-25 Christmas; collective leave Thu 12-31 + Fri 01-01 (counts as the sprint's leave); FakeFp 0.5 |
| Dev B | 7 of 10 | 5.7 committed (5.67 exact; 7.09 gross) | Same |
| AI agents | — | measured factor (planned 1.35) | — |
| **Total** | **14.0** | **11.3 committed (11.34 exact; 14.18 gross)** | Buffer 2.84 |

### Sprint Backlog
| Priority | Item | Estimate | Owner | Dependencies |
|---|---|---|---|---|
| P0 | Identity, remaining part | 0.4 | Dev A | S5 |
| P0 | Legal documents, declarations (execution-only declaration evidence; EUIN blank), `consent_records` | 1.5 | Dev A | E-17 drafts |
| P0 | Profile part 1 (address via `ref_pincodes`) | 1.0 | Dev A | Identity |
| P0 | Risk questionnaire backend, part 1 (details below; GAP-03) | 1.25 | Dev A | E-19 sign-off |
| P0 | Domain, remaining part | 0.4 | Dev B | S5 |
| P0 | Scheme sync, B share | 0.5 | Dev B | — |
| P0 | NAV part 2 | 1.5 | Dev B | NAV part 1 |
| P0 | Identity screens (web + native) | 1.0 | Dev B | — |
| P0 | Admin shell + approvals queue, part 1 (DLV-08) | 1.25 | Dev B | authz |
| P0 | Cross-review | 1.0 | Dev A | — |
| P0 | FakeFp upkeep | 0.5 | Dev A | — |
| P0 | Cross-review | 1.0 | Dev B | — |

Risk questionnaire backend scope: versions, server-side scoring, RP-001..012 vectors, `risk_profiles`, the RISK_PROFILED stage and the READY gate.

### Planned Capacity: 11.3 days | Sprint Load: 11.3 days (99.6% of capacity)
- Per dev: A 5.65 / 5.67, B 5.65 / 5.67. Load is 79.7% of gross.

### Risks
| Risk | Impact | Mitigation |
|---|---|---|
| E-19 risk-questionnaire sign-off (12-18) is late | Scoring bands or wording change after build | Wording and bands live in versioned data. The build uses the draft version, and publishing the signed version is a data change |
| Holiday season: reviewers away and a 7-day sprint | PRs pile up; last-day merges | Merge freeze after the Wed 12-30 demo. No deploys during collective leave. On-call is covered by the dev deploy only |
| Legal drafts (E-17, 12-04) still changing | Consent document hash churn | `consent_records` store the document version and hash. A new version triggers re-consent by design |
| 2027 calendars (E-22, Thu 12-24) not loaded | Cut-off engine is wrong from 01-01 | The loader from S3 plus a check on 12-24 that alarms if 2027 is missing |

### Definition of Done
- [ ] Core DoD 1–8
- [ ] Demo: profile, legal consents with version hash, and risk questionnaire part 1 captured on web and Android
- [ ] Execution-only declaration evidence stored per investor; EUIN is blank on every order template
- [ ] Risk scoring runs server-side only; the implemented RP-0xx vectors pass
- [ ] NAV part 2 merged; admin approvals queue part 1 visible behind authz
- [ ] 2027 NSE/BSE/RBI calendars loaded (E-22)

### Key Dates
| Date | Event |
|---|---|
| Mon 2026-12-21 | Sprint start and planning |
| Thu 2026-12-24 | E-22 2027 NSE/BSE/RBI calendars loaded |
| Fri 2026-12-25 | Christmas (no deadlines) |
| Mon 2026-12-28 | Mid-sprint check-in |
| Tue 2026-12-29 | plan-07 drafted |
| Wed 2026-12-30 | Demo + retro; merge freeze |
| Thu 2026-12-31 - Fri 2027-01-01 | Collective leave (no deadlines) |

---

## Sprint Plan: S7 - Consent engine (plan-07)
**Dates:** Mon 2027-01-04 - Fri 2027-01-15 | **Team:** 2 engineers + AI agents
**Sprint Goal:** No FP write can happen without a consumed consent challenge.

### Capacity
| Person | Available Days | Allocation | Notes |
|---|---|---|---|
| Dev A | 9.5 of 10 | 7.7 committed (9.62 gross) | 0.5 leave (Thu 01-14 Sankranti is restricted and comes out of leave); FakeFp 0.5; review 1.25 (money-heavy) |
| Dev B | 9.5 of 10 | 7.7 committed (9.62 gross) | Same leave; review 1.25 |
| AI agents | — | measured factor (planned 1.35) | Consent negative suites generated from the spec |
| **Total** | **19.0** | **15.4 committed (15.39 exact; 19.24 gross)** | Buffer 3.85 |

### Sprint Backlog
| Priority | Item | Estimate | Owner | Dependencies |
|---|---|---|---|---|
| P0 | Risk questionnaire backend, remaining part | 0.75 | Dev A | S6 |
| P0 | Consent core + GAP-01 (pre-validate step, outbox handoff), part 1 of 6.5 | 5.2 | Dev A | states, JCS |
| P0 | Admin shell + approvals queue (TOTP step-up) + audited investor lookup + recon-break list, remaining part | 1.75 | Dev B | S6 |
| P0 | Returns | 2.0 | Dev B | XIRR |
| P0 | SEBI taxonomy + aliases + DRAFT queue | 2.0 | Dev B | E-17 register |
| P0 | Second factor, part 1 | 0.45 | Dev B | — |
| P0 | iOS device dev builds (DLV-21) | 0.25 | Dev B | Apple org account (E-12) |
| P0 | Cross-review | 1.25 | Dev A | — |
| P0 | FakeFp upkeep | 0.5 | Dev A | — |
| P0 | Cross-review | 1.25 | Dev B | — |

### Planned Capacity: 15.4 days | Sprint Load: 15.4 days (100.1% of capacity)
- Per dev: A 7.7 / 7.695, B 7.7 / 7.695. Load is 80.1% of gross.

### Risks
| Risk | Impact | Mitigation |
|---|---|---|
| Consent core (6.5 total) is the largest zero-float Lane A item | KYC and provisioning slip | 5.2 this sprint, 1.3 in S8. Daily check on the consent burndown. GAP-01 outbox is designed first |
| Consent bypass through a direct FpGateway call | A regulatory breach | FpGateway write methods take a consumed-challenge token by type. A DB trigger (`trg_consent_guard`) is added in S8. A negative test is required this sprint |
| Apple org account not ready (E-12) | iOS device builds slip | Simulator builds continue; the device item rolls to S8 (0.25) |
| OI-1 not unconditional (known 12-18) | NISM V-A candidate needed | The enrolment deadline Fri 01-15 is tracked here (E-6). The EUIN-blank design stays unless the PO amends it |
| SEBI category register (E-17) incomplete | Taxonomy aliases are wrong | New schemes land in the DRAFT queue; nothing is published without curation |

### Definition of Done
- [ ] Core DoD 1–8 (iOS device builds from this sprint)
- [ ] A NAV quarantine release and a legal-document publish both complete through maker ≠ checker in the admin UI (DLV-08)
- [ ] Negative test: every FpGateway write without a consumed consent challenge is refused, with no outbound call recorded
- [ ] Risk questionnaire complete: RP-001..012 pass; the READY gate respects RISK_PROFILED
- [ ] Returns module and SEBI taxonomy DRAFT queue merged
- [ ] Audited investor lookup writes an audit row per view

### Key Dates
| Date | Event |
|---|---|
| Mon 2027-01-04 | Sprint start and planning; E-20 ops fund-facts curator starts (CSV pre-fill uses the S4 template) |
| Mon 2027-01-11 | Mid-sprint check-in |
| Wed 2027-01-13 | plan-08 drafted (before Sankranti) |
| Thu 2027-01-14 | Makar Sankranti (restricted; individual leave possible, no deadlines) |
| Fri 2027-01-15 | Demo + retro. Deadline for the conditional E-6 NISM V-A enrolment |

---

## Sprint Plan: S8 - Consent destinations and KYC start (plan-08)
**Dates:** Mon 2027-01-18 - Fri 2027-01-29 | **Team:** 2 engineers + AI agents
**Sprint Goal:** An investor's consent reaches the right contact and the KYC flow starts.

### Capacity
| Person | Available Days | Allocation | Notes |
|---|---|---|---|
| Dev A | 8.5 of 10 | 6.9 committed (8.6 gross) | Tue 01-26 Republic Day; 0.5 leave; FakeFp 0.5; review 1.25 |
| Dev B | 8.5 of 10 | 6.9 committed (8.6 gross) | Same |
| AI agents | — | measured factor (planned 1.35) | — |
| **Total** | **17.0** | **13.8 committed (13.77 exact; 17.21 gross)** | Buffer 3.44 |

### Sprint Backlog
| Priority | Item | Estimate | Owner | Dependencies |
|---|---|---|---|---|
| P0 | Consent core, remaining part | 1.3 | Dev A | S7 |
| P0 | ConsentDestinationResolver + `investor_contacts` + `folio_contacts` nightly sync (GAP-10 §6) | 1.5 | Dev A | Consent |
| P0 | KYC adapter (the one P-03 chose), API flow part 1 | 2.35 | Dev A | P-03 |
| P0 | Second factor (native device key, web dual OTP, ConsentSheet), remaining part | 1.55 | Dev B | Consent |
| P0 | Profile / FATCA (REFUSE non-India tax residency, GAP-07) / PEP + `onboarding_reviews` | 3.0 | Dev B | Profile |
| P0 | KYC client part 1 | 1.0 | Dev B | Adapter |
| P0 | Cross-review | 1.25 | Dev A | — |
| P0 | FakeFp upkeep | 0.5 | Dev A | — |
| P0 | Cross-review | 1.25 | Dev B | — |

### Planned Capacity: 13.8 days | Sprint Load: 13.7 days (99.5% of capacity)
- Per dev: A 6.9 / 6.885, B 6.8 / 6.885 (0.1 spare, left in buffer). Load is 79.6% of gross.

### Risks
| Risk | Impact | Mitigation |
|---|---|---|
| The P-03 KYC provider flow differs between sandbox and the documentation | Adapter rework | The adapter is built from P-03 evidence files. The API flow is done before the UI |
| Consent SMS templates (E-10, 12-18) not DLT-approved | Consent OTP cannot go out in nonprod over real SMS | Capture mode in nonprod. The template ids live in config |
| Consent sent to the wrong or stale contact | Evidence is invalid | The resolver takes the RTA folio contact first; nightly `folio_contacts` sync; mismatch opens a review |
| TPL_ONBOARDING_ATTEST (E-18) approval slips past 01-29 | S9 attest blocked | Build against the draft; publishing the approved text is a data change |
| Republic Day in week 2 | Shorter review window | Mid-sprint check-in on Mon 01-25, before the holiday |

### Definition of Done
- [ ] Core DoD 1–8
- [ ] Tamper test: an edit between approve and consume returns CONSENT_MISMATCH and makes no FP call
- [ ] `trg_consent_guard` negative suite green
- [ ] A non-India tax residency is refused with a clear message and no FP call
- [ ] `folio_contacts` nightly sync job runs on FakeFp; destination choice is logged
- [ ] KYC API flow part 1 runs against FakeFp and sandbox per P-03

### Key Dates
| Date | Event |
|---|---|
| Mon 2027-01-18 | Sprint start and planning |
| Mon 2027-01-25 | Mid-sprint check-in |
| Tue 2027-01-26 | Republic Day (no deadlines) |
| Thu 2027-01-28 | plan-09 drafted |
| Fri 2027-01-29 | Demo + retro. E-18 TPL_ONBOARDING_ATTEST approved |

---

## Sprint Plan: S9 - KYC native, bank, nomination (plan-09)
**Dates:** Mon 2027-02-01 - Fri 2027-02-12 | **Team:** 2 engineers + AI agents
**Sprint Goal:** KYC and nomination are complete on web and native.

### Capacity
| Person | Available Days | Allocation | Notes |
|---|---|---|---|
| Dev A | 9.5 of 10 | 7.7 committed (9.62 gross) | 0.5 leave; FakeFp 0.5; review 1.25 |
| Dev B | 9.5 of 10 | 7.7 committed (9.62 gross) | 0.5 leave; review 1.25 |
| AI agents | — | measured factor (planned 1.35) | — |
| **Total** | **19.0** | **15.4 committed (15.39 exact; 19.24 gross)** | Buffer 3.85 |

### Sprint Backlog
| Priority | Item | Estimate | Owner | Dependencies |
|---|---|---|---|---|
| P0 | KYC adapter, remaining part | 1.15 | Dev A | S8 |
| P0 | Bank backend: penny drop + Jaro-Winkler bands (≥ 80 auto, 60–79 manual, < 60 reject; GAP-07g) | 1.5 | Dev A | FpGateway |
| P0 | Nomination (MAX_NOMINEES 3 per PO-7, Annexure-A visibility, Annexure-B opt-out) + ONBOARDING_ATTEST | 2.25 | Dev A | Consent; P-11 |
| P0 | Provisioning saga, part 1 | 1.05 | Dev A | Attest |
| P0 | ConsentDestinationResolver, B share | 1.0 | Dev B | — |
| P0 | KYC native (details below; GAP-06) | 4.0 | Dev B | Adapter |
| P0 | Risk-profile screens (ONB-21/22), part 1 | 1.45 | Dev B | Risk backend |
| P0 | Cross-review | 1.25 | Dev A | — |
| P0 | FakeFp upkeep | 0.5 | Dev A | — |
| P0 | Cross-review | 1.25 | Dev B | — |

KYC native scope:
- Skia signature pad and photo picker (no camera).
- One-shot coarse geolocation.
- `/app/r/[kind]` return links and `+native-intent`.
- iOS fallback scheme.
- SignatureCaptureGuide.

### Planned Capacity: 15.4 days | Sprint Load: 15.4 days (100.1% of capacity)
- Per dev: A 7.7 / 7.695, B 7.7 / 7.695. Load is 80.1% of gross.

### Risks
| Risk | Impact | Mitigation |
|---|---|---|
| KYC native (4.0) is Lane B's biggest item; provider return flows differ on iOS and Android | KYC is incomplete on one platform | Android first, then iOS device, then web. Return-link matrix test in Maestro |
| The GAP-06 "iOS fallback scheme" conflicts with the brand rule that the URL scheme `sanchay` is dev only | A production build ships a custom scheme | Lead to confirm by the Mon 02-08 check-in. Default: production uses universal links / App Links on `sanchay.in` only (AASA/assetlinks in S15), and the custom scheme is compiled only into dev builds |
| Nominee rules: PO-7 (MAX 3, SEBI/HO/OIAE/OIAE_IAD-3/P/CIR/2026/12676) replaces the design's "10" | Wrong nominee limit | MAX_NOMINEES = 3 lives in `money_params`/config and is enforced in schema and UI. The P-11 evidence decides the FP payload |
| Wrong Jaro-Winkler thresholds | Good accounts rejected, or bad accounts accepted | Golden name-pair vectors; the 60–79 band goes to BANK_MANUAL_VERIFY (screens in S10) |
| AMC empanelment / rate cards (E-8) and CA tax classes (E-21) due 02-12 | S10 commission and fund facts blocked | Status check on 02-08; escalate to the PO the same day |

### Definition of Done
- [ ] Core DoD 1–8
- [ ] Demo: KYC completed on web, Android and iOS device against sandbox/FakeFp; signature and photo uploaded; return link resumes the flow
- [ ] A fourth nominee is rejected (schema, API and UI); Annexure-A visibility choice and Annexure-B opt-out are both captured as consent evidence
- [ ] Bank-match bands verified with vectors; penny-drop result stored
- [ ] ONBOARDING_ATTEST consumed using the approved template; provisioning saga part 1 merged
- [ ] The production build config contains no custom URL scheme (or the lead's written ruling is recorded)

### Key Dates
| Date | Event |
|---|---|
| Mon 2027-02-01 | Sprint start and planning |
| Mon 2027-02-08 | Mid-sprint check-in; URL-scheme ruling; E-8/E-21 status |
| Thu 2027-02-11 | plan-10 drafted |
| Fri 2027-02-12 | Demo + retro. E-8/E-21: first AMC empanelment, service agreements and trail-commission rate cards; CA tax classes for the first 100 schemes |

---

## Sprint Plan: S10 - Provisioning, fund facts, commission (plan-10)
**Dates:** Mon 2027-02-15 - Fri 2027-02-26 | **Team:** 2 engineers + AI agents
**Sprint Goal:** A verified investor is provisioned on FP.

### Capacity
| Person | Available Days | Allocation | Notes |
|---|---|---|---|
| Dev A | 9.5 of 10 | 7.7 committed (9.62 gross) | 0.5 leave; FakeFp 0.5; review 1.25 |
| Dev B | 9.5 of 10 | 7.7 committed (9.62 gross) | 0.5 leave; review 1.25 |
| AI agents | — | measured factor (planned 1.35) | Crash-injection tests per saga step generated from `states.md` |
| **Total** | **19.0** | **15.4 committed (15.39 exact; 19.24 gross)** | Buffer 3.85 |

### Sprint Backlog
| Priority | Item | Estimate | Owner | Dependencies |
|---|---|---|---|---|
| P0 | FP provisioning saga (resumable), remaining part | 3.95 | Dev A | S9 |
| P0 | Commission backend: cards, lines, resolution, R7 readiness, `order_disclosure_snapshot`, API (GAP-09 §1) | 2.0 | Dev A | E-8 rate cards |
| P0 | Risk screens (PRF-13, CNF-03, profile-vs-fund row), remaining part | 0.55 | Dev B | — |
| P0 | Bank screens + `ref_ifsc` / `ref_pincode` jobs + BANK_MANUAL_VERIFY | 2.5 | Dev B | Admin queue |
| P0 | Nomination screens + opt-out pop-up (GAP-04) | 1.75 | Dev B | Nomination |
| P0 | FundFactsProvider (pluggable: AMFI + admin curation; Cybrilla data later) + curation + publish gate + CSV + `scheme_tax_classes`, part 1 | 1.65 | Dev B | E-21 CA |
| P0 | Cross-review | 1.25 | Dev A | — |
| P0 | FakeFp upkeep | 0.5 | Dev A | — |
| P0 | Cross-review | 1.25 | Dev B | — |

### Planned Capacity: 15.4 days | Sprint Load: 15.4 days (100.1% of capacity)
- Per dev: A 7.7 / 7.695, B 7.7 / 7.695. Load is 80.1% of gross.

### Risks
| Risk | Impact | Mitigation |
|---|---|---|
| The provisioning saga leaves investors half-created on FP after a crash | Duplicate FP investor accounts | Idempotency keys per step, outbox handoff, re-fetch before retry. Crash injection at every step is a DoD item |
| Rate cards (E-8) are late or incomplete | Commission R7 readiness fails, which later blocks the lumpsum publish gate | Missing rows make a scheme non-orderable, visibly, not silently. Surface the gap list to the PO |
| CA tax classes (E-21) are not ready for 100 schemes | The fund-facts publish gate keeps schemes hidden | The gate shows the unpublished count on the admin dashboard; the curator (E-20) backfills |
| Sandbox provisioning is flaky or rate-limited | False failures | The contract harness retries with backoff only on reads. Writes are verified in FakeFp first |
| Bank manual-verify queue needs named OPS staff | Queue is unowned | Nonprod uses a test role; named staff are due 2027-05-21 |

### Definition of Done
- [ ] Core DoD 1–8
- [ ] Provisioning resumes after a crash at every step (crash-injection suite green) with no duplicate FP entities
- [ ] Commission resolution returns a disclosure snapshot for each orderable scheme; R7 readiness blocks schemes without a rate row
- [ ] BANK_MANUAL_VERIFY queue works through maker-checker; the `ref_ifsc`/`ref_pincode` jobs are scheduled
- [ ] Nomination screens and opt-out pop-up on web, Android and iOS
- [ ] FundFactsProvider interface merged with the AMFI + curation implementation; the publish gate needs tax class, commission row and AMC agreement

### Key Dates
| Date | Event |
|---|---|
| Mon 2027-02-15 | Sprint start and planning |
| Mon 2027-02-22 | Mid-sprint check-in |
| Thu 2027-02-25 | plan-11 drafted |
| Fri 2027-02-26 | Demo + retro. E-18 TPL_PURCHASE approved |

---

## Sprint Plan: S11 - Catalogue API and lumpsum draft (plan-11)
**Dates:** Mon 2027-03-01 - Fri 2027-03-12 | **Team:** 2 engineers + AI agents
**Sprint Goal:** An investor can draft a lumpsum order and consent to it against FakeFp.

### Capacity
| Person | Available Days | Allocation | Notes |
|---|---|---|---|
| Dev A | 8.5 of 10 | 6.9 committed (8.6 gross) | Wed 03-10 Id-ul-Fitr (moon-dependent); 0.5 leave; FakeFp 0.5; review 1.25 |
| Dev B | 8.5 of 10 | 6.9 committed (8.6 gross) | Same |
| AI agents | — | measured factor (planned 1.35) | — |
| **Total** | **17.0** | **13.8 committed (13.77 exact; 17.21 gross)** | Buffer 3.44 |

### Sprint Backlog
| Priority | Item | Estimate | Owner | Dependencies |
|---|---|---|---|---|
| P0 | Public catalogue API + sitemap + JSON-LD (Regular + Growth only) | 2.0 | Dev A | Fund facts |
| P0 | Lumpsum saga part 1 + suitability check / acknowledgement (GAP-03) | 3.0 | Dev A | Provisioning |
| P1 | Watchlist, part 1 | 0.15 | Dev A | — |
| P0 | Fund facts, remaining part | 2.35 | Dev B | S10 |
| P0 | Commission admin screens + CSV + public `/commission-disclosure` page on `sanchay.in` + review-row disclosure | 1.5 | Dev B | Commission backend |
| P0 | Ops onboarding exceptions + PEP/FATCA review UI | 1.0 | Dev B | Review queue |
| P0 | Risk questionnaire admin (versioning, simulator, publish maker-checker), part 1 | 0.8 | Dev B | — |
| P0 | Cross-review | 1.25 | Dev A | — |
| P0 | FakeFp upkeep | 0.5 | Dev A | — |
| P0 | Cross-review | 1.25 | Dev B | — |

The lumpsum saga carries the platform ARN on every order, a blank EUIN and a reference to the execution-only declaration evidence.

### Planned Capacity: 13.8 days | Sprint Load: 13.8 days (100.2% of capacity)
- Per dev: A 6.9 / 6.885, B 6.9 / 6.885. Load is 80.2% of gross.
- Watchlist (0.15, P1) is the cut item.

### Risks
| Risk | Impact | Mitigation |
|---|---|---|
| Id-ul-Fitr moves ±1 day with the moon (Tue 03-09 or Thu 03-11) | Loses a planned day or hits the sub-plan day | Draft plan-12 on Thu 03-11 with Fri 03-12 as fallback. The demo stays Fri 03-12 unless the holiday is announced for Friday, in which case the demo moves to Thu 03-11 |
| Suitability wording or behaviour isn't compliance-approved | Rework of the acknowledgement flow | Uses the E-19 texts signed 12-18. The suitability result is stored per order with the questionnaire version |
| Public commission page copy (E-8, 03-12) arrives on the last day | The page cannot go to staging | Build with placeholder copy behind a flag; swapping in the approved copy is a CMS/data change |
| Catalogue API exposes unpublished or non-gated schemes | Misleading public data | The publish gate (tax class + commission row + AMC agreement) is enforced in the API query, with a test. `/commission-disclosure` is generated from the rate tables |
| R0 staging-complete is Thu 03-25 (S12) and depends on this API | R0 slips | The catalogue API is done first in the sprint. www pages start in S12 on a stable contract |

### Definition of Done
- [ ] Core DoD 1–8
- [ ] Demo: on FakeFp, an investor drafts a lumpsum, sees the suitability result and commission disclosure, and consents. The consumed challenge is recorded; no FP write before consent
- [ ] Order draft carries the platform ARN from `SANCHAY_PLATFORM_ARN`, a blank EUIN and a link to the execution-only declaration evidence
- [ ] Catalogue API returns only gated Regular + Growth schemes; sitemap and JSON-LD validate
- [ ] `/commission-disclosure` renders from the rate tables; the review row shows the per-order disclosure snapshot
- [ ] Ops can resolve onboarding exceptions and PEP/FATCA reviews through maker-checker
- [ ] Risk questionnaire admin part 1 (versioning + simulator) behind authz

### Key Dates
| Date | Event |
|---|---|
| Mon 2027-03-01 | Sprint start and planning |
| Mon 2027-03-08 | Mid-sprint check-in (confirm the Id-ul-Fitr date) |
| Wed 2027-03-10 | Id-ul-Fitr (moon-dependent; no deadlines) |
| Thu 2027-03-11 | plan-12 drafted |
| Fri 2027-03-12 | Demo + retro. E-8 public commission-page copy approved |
| (look-ahead) Thu 2027-03-25 | R0 staging-complete in S12 (www on staging, noindex, D-5) |
| (look-ahead) Wed 2027-03-31 | EUIN due only if the OI-1 NISM trigger fired (E-6) |

---

## Notes for the lead (small inconsistencies found in the allocation; no numbers changed)
1. **S3 Plan 01 figure.** The Plan 01 table puts B24 inside the S3 figure of 1.05, but the S3 backlog lists B24 (0.25) separately and gives C12 + C15 + iOS simulator 1.05. The 25.8 Plan 01 total is still correct if B24 sits inside the 1.05. If it doesn't, Plan 01 is 26.05 and nothing moves, because B24 is already carried in S3's load.
2. **DLV-21 split.** DLV-21 is 1.0 in total, but only 0.25 (S7) and 0.25 (S15) are itemised, so S3 carries an implied 0.5 inside Dev B's 1.05 line.
3. **Loads above committed capacity.** S1 (+0.1 per dev), S2 Dev A (+0.05) and S3 Dev B (+0.07) run slightly over committed capacity. Each is under 1% and absorbed by the 20% buffer, as the allocation states. S2 Dev B and S8 Dev B each have spare capacity (0.2 and 0.1).
4. **URL scheme conflict.** GAP-06's "iOS fallback scheme" (S9) conflicts with the brand rule that the `sanchay` URL scheme is dev only. The default above is production universal links only; the lead should rule on it by Mon 2027-02-08.
5. **Factor re-cut.** S3–S11 capacity uses the planned factor of 1.35. All committed and gross figures from S3 onward must be recalculated after the measured-factor re-baseline on Fri 2026-11-06.

### Critical Files for Implementation
- C:/Users/pc/Desktop/sanchay/docs/superpowers/plans/2026-09-28-plan-00-s0-evidence-gates.md (to create)
- C:/Users/pc/Desktop/sanchay/docs/superpowers/plans/2026-09-28-plan-01-foundation.md (to create)
- C:/Users/pc/Desktop/sanchay/docs/superpowers/plans/2026-10-12-plan-02-s1-s2-platform-side.md (to create)
- C:/Users/pc/Desktop/sanchay/docs/capacity.md (to create)
- C:/Users/pc/Desktop/sanchay/docs/probes/README.md (to create)

---

# Sanchay sprint plans S12 to S37: launch sprint S36 and hypercare sprint S37

Nothing was created, edited or deleted. I checked the weekday of every date below with node on 2026-09-25. I also checked the 2027 and 2028 festival dates on the web. The reconciled allocation is the source for every estimate, owner and date. Where my arithmetic does not match the allocation, the difference is listed in "Consistency notes" at the end. I did not change any number to hide it.

## Conventions used in every sprint below

**Capacity:**
- Committed per dev = available days × 0.75 focus × factor × 0.8.
- The factor is 1.35 in S12–S33. It is 1.0 in the time-boxed S34–S37.
- "Planned Capacity" is the committed figure. The 20% buffer is outside it and is shown on the line below.
- Load = sprint items + overheads.

**Overheads:**
- Cross-review: 2.5 in money-heavy sprints S12–S16 and S18–S24; 2.0 in all other sprints. It is split evenly between the two devs.
- FakeFp upkeep: 0.5, always on Dev A.
- Alpha triage: 1.0 (0.5 per dev) in S18–S31.
- Beta triage: 2.0 (1.0 per dev) in S32–S33.

**AI agents** are not a separate capacity line. They are counted inside the 1.35 factor on spec-driven focus days (spec in `docs/specs`, golden vectors, FakeFp, then human review). The factor is never applied to review, triage or FakeFp upkeep. Measured velocity replaced the 1.35 assumption on 2026-11-06. If the measured factor differs, scale the "Planned Capacity" lines accordingly.

**Ceremonies:**
- Planning is on day 1.
- The mid-sprint check-in is the Monday of week 2, or the next working day.
- The next sprint's sub-plan is drafted on the last 2 working days.
- Demo and retro are on the last working day.
- No deadline falls on a holiday or collective-leave day (DLV-18).

**Standard DoD (SDoD). Every sprint's checklist refers to it:**
- **SDoD-1:** Every PR is reviewed by the other developer, per CODEOWNERS. Agent-written code traces to a `docs/specs/<module>.md` and has golden vectors where it touches money, units or dates.
- **SDoD-2:** CI is green for `pnpm turbo run lint typecheck test "--filter=...[origin/main]"`. This runs in both PowerShell 5.1 and Git Bash. It covers Biome, tsc, Vitest, Testcontainers on postgres 18.6, the OpenAPI drift test and `check-boundaries`.
- **SDoD-3:** Work is merged to main and auto-deployed to dev. Demo builds come from a staging tag, from S14.
- **SDoD-4:**
  - Android and iOS device builds are green.
  - Maestro covers every touched native journey, with the iOS nightly from S15.
  - Playwright covers every touched web journey.
- **SDoD-5:**
  - New or changed state machines are in `states.md`, and `gen:states` has regenerated their SQL CHECKs.
  - Every new FP call has a FakeFp scenario and a contract-harness case.
- **SDoD-6:**
  - No PII in logs (pino allow-list).
  - Privileged actions are audited, with maker ≠ checker where the design requires it.
  - Rename rules hold: `@sanchay/*`, `SANCHAY_*`, `x-sanchay-client`, `__Host-sanchay_*`, the `sanchay.in` hosts, and no `plz` identifiers.
- **SDoD-7:**
  - Any FP capability that is not proven is raised as an explicit PO-2 escalation, never hidden silently.
  - Velocity and review hours are recorded.
  - The next sub-plan is drafted under `docs/superpowers/plans/`.

---

## Sprint Plan: S12 · Lumpsum submit and www staging
**Dates:** Mon 2027-03-15 - Fri 2027-03-26 (last working day Thu 03-25) | **Team:** 2 engineers + AI agents
**Sprint Goal:** Lumpsum submission works end-to-end on FakeFp.

### Capacity
| Person | Available Days | Allocation | Notes |
|---|---|---|---|
| Dev A (backend-leaning) | 7.5 of 10 | Committed 6.1 (7.5 × 0.75 × 1.35 × 0.8) · Load 6.05 (items 4.3 + review 1.25 + FakeFp 0.5) | Holi Tue 03-23, Good Friday Fri 03-26, 0.5 leave |
| Dev B (client-leaning) | 7.5 of 10 | Committed 6.1 · Load 6.05 (items 4.8 + review 1.25) | Same holidays, 0.5 leave |
| AI agents | n/a | Inside the 1.35 factor | Spec-driven items only |
| **Total** | **15.0 of 20** | **Committed 12.2 · Load 12.1** | |

### Sprint Backlog
| Priority | Item | Estimate | Owner | Dependencies |
|---|---|---|---|---|
| P0 | Lumpsum part 2: confirm under `useConsumed`, RECONCILING, UNITS_PENDING (2.45 of 3.0; the 0.55 remainder is planned in S13). Platform ARN on every order, EUIN blank, execution-only declaration evidence id | 2.45 | Dev A | Lumpsum part 1 (S11); consent core (S7–S8); TPL_PURCHASE (E-18, approved 02-26) |
| P0 | Risk questionnaire admin, remaining part (publish maker-checker) | 0.45 | Dev B | S11 part 1 |
| P0 | Cross-review | 2.5 (1.25 / 1.25) | A/B | — |
| P0 | FakeFp upkeep | 0.5 | Dev A | FpGateway |
| P1 | Watchlist + `?intent=`, remaining part | 0.85 | Dev A | Watchlist part 1 (S11) |
| P1 | Native explore view-model | 0.5 | Dev A | Public catalogue API (S11) |
| P1 | Ops onboarding UI, A share | 0.5 | Dev A | Ops onboarding exceptions (S11, B) |
| P1 | www pages part 1 (see note below) | 4.35 | Dev B | Catalogue API + fund facts (S11); counsel copy for ch.14 disclosures |

**www pages part 1 scope (GAP-11):** A–Z default sort, labelled sorts, no AMC logos unless `amc.logoApproved`, "If you had invested" with the ch.14 disclosures, R0 on staging with noindex.

**Cut order if slipping:** native explore view-model, then ops onboarding UI A share, then watchlist. Protect lumpsum part 2: lane A has zero float.

### Planned Capacity: 12.2 days | Sprint Load: 12.1 days (99% of capacity)
Buffer outside committed capacity: 3.0 days (20%).

### Risks
| Risk | Impact | Mitigation |
|---|---|---|
| Lumpsum confirm/consume race: a consent is consumed twice, or an order is submitted without a consumed challenge | Money-integrity defect on the zero-float lane | Reuse the S8 tamper suite. Add a concurrency test (two confirms, one FP call) before merge |
| Holi date: panchang sources give Mon 03-22 and the allocation uses Tue 03-23 | Wrong day off; a ceremony lands on a holiday | Check against the published 2027 central list. Capacity is the same either way (one weekday). The check-in was moved to Fri 03-19 to avoid both dates |
| Staging www gets indexed before counsel OI-2 and the fund gating | Public marketing before R0 is allowed | Send `X-Robots-Tag: noindex` plus robots disallow on staging, and add a CI check. Public R0 is only after the production cutover (D-5) |
| "If you had invested" copy or the ch.14 disclosure wording is not approved | R0 staging-complete slips | Ship behind a flag. The compliance review happens in the week-1 check-in |

### Definition of Done
- [ ] SDoD-1..7 met; plan-13 `2027-03-29-plan-13-webhooks-and-payments.md` drafted by Thu 03-25.
- [ ] Draft → consent → confirm → submit to FakeFp is demonstrated on web and native, with the platform ARN present, EUIN blank and the execution-only evidence linked.
- [ ] RECONCILING and UNITS_PENDING are in `states.md` with SQL CHECKs.
- [ ] The 0.55 lumpsum remainder is logged as planned carry for S13, not as slippage.
- [ ] Risk questionnaire versions publish only through maker ≠ checker.
- [ ] **R0 staging-complete:** www is on staging with noindex verified, A–Z default sort, and no logo unless `amc.logoApproved`.

### Key Dates
| Date | Event |
|---|---|
| Mon 03-15 | Sprint planning / start |
| Fri 03-19 | Mid-sprint check-in (moved to avoid both possible Holi dates) |
| Mon 03-22 / Tue 03-23 | Holi (confirm which day is gazetted) |
| Wed 03-24 – Thu 03-25 | plan-13 drafting |
| Thu 03-25 | **R0 staging-complete** · sprint demo · retro |
| Fri 03-26 | Good Friday (holiday) |

---

## Sprint Plan: S13 · Webhooks and payments
**Dates:** Mon 2027-03-29 - Fri 2027-04-09 | **Team:** 2 engineers + AI agents
**Sprint Goal:** Webhooks and payments bring purchases to a truthful state.

### Capacity
| Person | Available Days | Allocation | Notes |
|---|---|---|---|
| Dev A | 9.5 of 10 | Committed 7.7 · Load 7.7 (items 5.95 + review 1.25 + FakeFp 0.5) | 0.5 leave |
| Dev B | 9.5 of 10 | Committed 7.7 · Load 7.7 (items 6.45 + review 1.25) | 0.5 leave |
| AI agents | n/a | Inside the 1.35 factor | |
| **Total** | **19.0 of 20** | **Committed 15.4 · Load 15.4** | |

### Sprint Backlog
| Priority | Item | Estimate | Owner | Dependencies |
|---|---|---|---|---|
| P0 | Lumpsum part 2, remaining part | 0.55 | Dev A | S12 |
| P0 | Webhook ingest: HMAC-first dual-mode verifier (GAP-02), persistent dedupe, re-fetch, reconcile, tenant recon M6 | 4.5 | Dev A | GAP-02 C1 answer / P-08 evidence |
| P0 | `fp.reconcile.events` + DLQ + alarms | 0.9 | Dev A | Ingest |
| P0 | ui batch 2 | 3.0 | Dev B | ui batch 1 (S4–S5) |
| P0 | Payments part 1: attempts, pre-check, postback, polls, `failed_payment_debited`, late_auth, TPV, `payments.recon` | 2.55 | Dev B | Lumpsum |
| P0 | Cross-review | 2.5 (1.25 / 1.25) | A/B | — |
| P0 | FakeFp upkeep | 0.5 | Dev A | — |
| P1 | www pages, remaining part | 0.9 | Dev B | S12 |

**Cut order:** www remaining part (only gates marketing).

### Planned Capacity: 15.4 days | Sprint Load: 15.4 days (100% of capacity)
Buffer outside committed capacity: 3.85 days.

### Risks
| Risk | Impact | Mitigation |
|---|---|---|
| Cybrilla has not answered GAP-02 C1 (signature form) | Verifier design churns | The dual-mode verifier (HMAC-first, shared-secret mode) is config-selected. An unverified event never mutates state; re-fetch is authoritative |
| Late-auth and debited-but-failed cases are hard to reproduce in the sandbox | Untested money paths | Script each case as a FakeFp scenario plus a golden timeline; ask Cybrilla for sandbox triggers |
| Payments part 1 leans on lumpsum states that are still settling | Rework | Lumpsum remainder (0.55) is sequenced on days 1–2, before the payments postback work |
| EUIN deadline (E-6) if counsel OI-1 was not an unconditional "execution-only OK" | Regulatory blocker for real money | Delivery lead confirms E-6 status at the check-in |

### Definition of Done
- [ ] SDoD-1..7 met; plan-14 drafted by Thu 04-08.
- [ ] Replayed or duplicate webhooks are idempotent (persistent dedupe). A tampered signature is rejected and alarmed.
- [ ] DLQ depth alarm fires in dev. Tenant recon M6 runs nightly.
- [ ] Every purchase ends in a truthful state (PAID / FAILED / DEBITED_NOT_CONFIRMED → ops case) against FakeFp.
- [ ] TPV mismatch is blocked.
- [ ] ui batch 2 passes the axe and contrast tests on web and native.

### Key Dates
| Date | Event |
|---|---|
| Mon 03-29 | Sprint planning / start |
| Wed 03-31 | E-6: EUIN obtained (only if counsel OI-1 required it); FY 2026-27 ends |
| Mon 04-05 | Mid-sprint check-in |
| Wed 04-07 – Thu 04-08 | plan-14 drafting |
| Fri 04-09 | Demo · retro |

---

## Sprint Plan: S14 · Money-in integrity
**Dates:** Mon 2027-04-12 - Fri 2027-04-23 | **Team:** 2 engineers + AI agents
**Sprint Goal:** Money-in integrity holds under crash and duplicate events.

### Capacity
| Person | Available Days | Allocation | Notes |
|---|---|---|---|
| Dev A | 7.5 of 10 | Committed 6.1 · Load 6.1 (items 4.35 + review 1.25 + FakeFp 0.5) | Ram Navami Thu 04-15, Mahavir Jayanti Mon 04-19, 0.5 leave |
| Dev B | 7.5 of 10 | Committed 6.1 · Load 6.1 (items 4.85 + review 1.25) | Same |
| AI agents | n/a | Inside the 1.35 factor | |
| **Total** | **15.0 of 20** | **Committed 12.2 · Load 12.2** | |

Wed 04-14 (Ambedkar Jayanti) is a market holiday only. Dev capacity is unaffected.

### Sprint Backlog
| Priority | Item | Estimate | Owner | Dependencies |
|---|---|---|---|---|
| P0 | `fp.reconcile.events`, remaining part | 0.1 | Dev A | S13 |
| P0 | `ops_cases` engine: queue, SLA, `dedupe_key` (GAP-07) | 1.5 | Dev A | — |
| P0 | Invariants M1–M6 | 1.0 | Dev A | Ledger/payments tables |
| P0 | Crash-injection suite | 1.0 | Dev A | Sagas |
| P0 | Sweepers part 1: `drafts.abandon`, `consent.expiry.sweep`, cancel/clone | 0.75 | Dev A | JobsModule |
| P0 | Payments, remaining part | 1.95 | Dev B | S13 |
| P0 | Staging environment + tag-to-staging pipeline (DLV-09) | 1.0 | Dev B | CDK nonprod |
| P0 | Checkout screens + glue part 1 (FP `token_url` auth session, UpiQr) | 1.9 | Dev B | Payments |
| P0 | Cross-review | 2.5 | A/B | — |
| P0 | FakeFp upkeep | 0.5 | Dev A | — |

**Cut order:** none; every item is P0. If the sprint slips, sweepers part 1 carries into S15 (+0.75).

### Planned Capacity: 12.2 days | Sprint Load: 12.2 days (100% of capacity)
Buffer outside committed capacity: 3.0 days.

### Risks
| Risk | Impact | Mitigation |
|---|---|---|
| Two holidays plus a market holiday break flow in a 100%-loaded sprint | Carry-over on the zero-float lane | Front-load invariants and crash-injection in week 1. Sweepers part 1 is the declared spill item |
| Crash-injection finds saga gaps late | Lumpsum reopens | Treat findings as P0 in this sprint; the buffer absorbs them |
| Staging CDK drift from dev | Demo builds unreliable | Staging comes from the same CDK app with an environment parameter; tag-to-staging runs in CI |
| The market-holiday calendar path is not exercised | Wrong cut-off or NAV-date logic | Add a Wed 04-14 case to the cut-off golden vectors |

### Definition of Done
- [ ] SDoD-1..7 met; plan-15 drafted by Thu 04-22.
- [ ] Crash at every saga step leaves no orphan payment or order. Duplicate FP events cause no double posting.
- [ ] M1–M6 run as scheduled checks and open `ops_cases` using `dedupe_key`.
- [ ] Tag `v*` deploys to staging.
- [ ] Checkout part 1 works on web and on an Android/iOS device (FP `token_url` session, UpiQr).

### Key Dates
| Date | Event |
|---|---|
| Mon 04-12 | Sprint planning / start |
| Wed 04-14 | Market holiday (Ambedkar Jayanti) |
| Thu 04-15 | Ram Navami (holiday) |
| Mon 04-19 | Mahavir Jayanti (holiday) |
| Tue 04-20 | Mid-sprint check-in |
| Wed 04-21 – Thu 04-22 | plan-15 drafting |
| Fri 04-23 | Demo on staging · retro |

---

## Sprint Plan: S15 · Checkout and ledger
**Dates:** Mon 2027-04-26 - Fri 2027-05-07 | **Team:** 2 engineers + AI agents
**Sprint Goal:** An investor pays on web and native and sees a settled lot.

### Capacity
| Person | Available Days | Allocation | Notes |
|---|---|---|---|
| Dev A | 9.5 of 10 | Committed 7.7 · Load 7.7 (items 5.95 + review 1.25 + FakeFp 0.5) | 0.5 leave |
| Dev B | 9.5 of 10 | Committed 7.7 · Load 7.6 (items 6.35 + review 1.25) | 0.5 leave |
| AI agents | n/a | Inside the 1.35 factor | |
| **Total** | **19.0 of 20** | **Committed 15.4 · Load 15.3** | |

### Sprint Backlog
| Priority | Item | Estimate | Owner | Dependencies |
|---|---|---|---|---|
| P0 | Sweepers, remaining part | 0.25 | Dev A | S14 |
| P0 | Lots, FIFO, folios, `ledger_exceptions` | 4.0 | Dev A | Lumpsum; FIFO core (S5) |
| P0 | Valuation part 1, with XIRR display per PO-5 | 1.7 | Dev A | Ledger |
| P0 | Checkout glue, remaining part (see note below) | 4.6 | Dev B | S14 |
| P0 | Maestro iOS nightly (DLV-21) | 0.25 | Dev B | iOS device builds (S7) |
| P0 | Cross-review | 2.5 | A/B | — |
| P0 | FakeFp upkeep | 0.5 | Dev A | — |
| P1 | Orders list + timeline | 1.5 | Dev B | Orders API |

**Checkout glue scope:** deep links, AASA and assetlinks on `sanchay.in`, app id `in.sanchay.app`. The `sanchay` scheme is dev-only.

**PO-5 display rules:**
- XIRR is shown from 30 days after the first flow.
- Under 365 days it carries the "Annualised; can swing widely…" label, with the absolute return beside it.
- Under 30 days it shows "Too early" plus the absolute return.

**Cut order:** orders list + timeline (P1).

### Planned Capacity: 15.4 days | Sprint Load: 15.3 days (99% of capacity)
Buffer outside committed capacity: 3.85 days.

### Risks
| Risk | Impact | Mitigation |
|---|---|---|
| Universal links or App Links fail verification (AASA cache, Play signing key) | Payment return lands in the browser, not the app | Verify on real devices early in week 1. Use `/app/r/[kind]` web fallback pages (GAP-06) |
| Rounding or unit-precision errors in FIFO lots | Wrong units or gains everywhere downstream | Money/Units golden vectors; FIFO property tests; `ledger_exceptions` instead of silent correction |
| DPO / Grievance Officer not named by Fri 05-07 (E-17) | R1 alpha gate at risk (DPDP Rules ~05-13) | Delivery lead escalates to the PO at the check-in on 05-03 |

### Definition of Done
- [ ] SDoD-1..7 met; plan-16 drafted by Thu 05-06.
- [ ] Web and native: pay, then FakeFp allotment, then a lot is posted with its folio.
- [ ] The dashboard value uses the latest NAV, and PO-5 rules are covered by golden vectors.
- [ ] AASA and assetlinks are served from `sanchay.in` and verified on devices.
- [ ] Maestro iOS nightly is green for 3 consecutive nights.

### Key Dates
| Date | Event |
|---|---|
| Mon 04-26 | Sprint planning / start |
| Mon 05-03 | Mid-sprint check-in |
| Wed 05-05 – Thu 05-06 | plan-16 drafting |
| Fri 05-07 | E-17: DPO / Grievance Officer named and manual rights runbook live · demo · retro |

---

## Sprint Plan: S16 · Valuation, app config and dashboard
**Dates:** Mon 2027-05-10 - Fri 2027-05-21 | **Team:** 2 engineers + AI agents
**Sprint Goal:** The dashboard shows valued holdings, with app config ready for store builds.

### Capacity
| Person | Available Days | Allocation | Notes |
|---|---|---|---|
| Dev A | 7.5 of 10 | Committed 6.1 · Load 6.05 (items 4.3 + review 1.25 + FakeFp 0.5) | Id-ul-Zuha Mon 05-17, Buddha Purnima Thu 05-20, 0.5 leave |
| Dev B | 7.5 of 10 | Committed 6.1 · Load 6.05 (items 4.8 + review 1.25) | Same |
| AI agents | n/a | Inside the 1.35 factor | |
| **Total** | **15.0 of 20** | **Committed 12.2 · Load 12.1** | |

### Sprint Backlog
| Priority | Item | Estimate | Owner | Dependencies |
|---|---|---|---|---|
| P0 | Valuation, remaining part (`sipCounts`, allocation by SEBI category) | 1.3 | Dev A | S15 |
| P0 | App config backend: `app_config_versions`, `/v1/app/config`, 60 s CloudFront cache + S3 fallback, HTTP 426 | 1.0 | Dev A | CDK |
| P0 | Notifications part 1: SMS / email / inbox + direct FCM v1 and APNs push (part 1) | 2.0 | Dev A | E-26 (FCM/APNs DPAs; see risk) |
| P0 | App config admin + client force-update and maintenance handling | 1.0 | Dev B | Backend |
| P0 | Reviewer/demo accounts: sandbox-only routing, boot refusal, audit + Slack alert | 1.5 | Dev B | E-29 policy (05-21) |
| P0 | Dashboard + holdings screens, part 1 | 2.3 | Dev B | Valuation |
| P0 | Cross-review | 2.5 | A/B | — |
| P0 | FakeFp upkeep | 0.5 | Dev A | — |

### Planned Capacity: 12.2 days | Sprint Load: 12.1 days (99% of capacity)
Buffer outside committed capacity: 3.0 days.

### Risks
| Risk | Impact | Mitigation |
|---|---|---|
| Push via FCM/APNs to staff devices before the E-26 DPAs (due 12-17-2027) | DPDP processor exposure during the alpha | No PII in push payloads (the inbox fetch carries the content). Ask the PO to pull the FCM/APNs part of E-26 forward to 05-21 |
| DPDP Rules apply around Thu 05-13, mid-sprint | Consent or notice gaps in the alpha | Consent-gated analytics comes in S17. The staff privacy notice (05-21) is an R1 gate |
| A reviewer account reaches production FP | A regulatory incident | Boot refusal when the reviewer flag is on and the FP environment is prod, plus a CI test |
| Two holidays in a 99%-loaded sprint | Dashboard part 1 slips | Dashboard remainder already sits in S17 (1.7). Protect app config: the store builds need it |

### Definition of Done
- [ ] SDoD-1..7 met; plan-17 drafted by Fri 05-21 (Thu 05-20 is a holiday).
- [ ] `/v1/app/config` is served through CloudFront at 60 s TTL, with S3 fallback tested by an origin kill. HTTP 426 triggers force-update on web and native.
- [ ] Reviewer accounts refuse to boot against production FP. Every reviewer login posts to Slack and is audited.
- [ ] The dashboard shows invested, current value, gains, XIRR (PO-5), active SIP count and allocation by category.

### Key Dates
| Date | Event |
|---|---|
| Mon 05-10 | Sprint planning / start |
| ~Thu 05-13 | DPDP Rules apply |
| Mon 05-17 | Id-ul-Zuha (holiday) |
| Tue 05-18 | Mid-sprint check-in |
| Thu 05-20 | Buddha Purnima (holiday) |
| Fri 05-21 | E-17 staff-alpha privacy notice · E-29 reviewer-account policy + Slack channel · named OPS / COMPLIANCE / SUPPORT staff · plan-17 final · demo · retro |

---

## Sprint Plan: S17 · R1 internal alpha
**Dates:** Mon 2027-05-24 - Fri 2027-06-04 | **Team:** 2 engineers + AI agents
**Sprint Goal:** Staff can complete sign-up → onboarding → lumpsum → dashboard (R1 internal alpha).

### Capacity
| Person | Available Days | Allocation | Notes |
|---|---|---|---|
| Dev A | 9.5 of 10 | Committed 7.7 · Load 7.5 (items 6.0 + review 1.0 + FakeFp 0.5) | 0.5 leave; review is 2.0 total (not a money-heavy sprint) |
| Dev B | 9.5 of 10 | Committed 7.7 · Load 7.7 (items 6.7 + review 1.0) | 0.5 leave |
| AI agents | n/a | Inside the 1.35 factor | |
| **Total** | **19.0 of 20** | **Committed 15.4 · Load 15.2** | |

### Sprint Backlog
| Priority | Item | Estimate | Owner | Dependencies |
|---|---|---|---|---|
| P0 | Notifications, remaining part | 2.5 | Dev A | S16 |
| P0 | Native explore API support | 0.5 | Dev A | Catalogue API |
| P0 | `kyc.periodic.recheck` + quote recheck + readiness flip (DLV-09) | 1.5 | Dev A | KYC adapter |
| P0 | Dashboard, remaining part | 1.7 | Dev B | S16 |
| P0 | Native explore + fund detail (universal) | 2.5 | Dev B | View-model (S12) |
| P0 | EAS release pipeline: Play internal / TestFlight (DLV-09) | 1.0 | Dev B | E-12 tracks live 05-28 |
| P0 | Cross-review | 2.0 | A/B | — |
| P0 | FakeFp upkeep | 0.5 | Dev A | — |
| P1 | `product_events`: first-party analytics, consent-gated (GAP-06, D-2) | 1.5 | Dev A | Consent |
| P1 | Profile hub part 1: sessions/devices, email, notification preferences | 1.5 | Dev B | Auth (S2) |

**Cut order:** `product_events`, then profile hub part 1.

### Planned Capacity: 15.4 days | Sprint Load: 15.2 days (99% of capacity)
Buffer outside committed capacity: 3.85 days.

### Risks
| Risk | Impact | Mitigation |
|---|---|---|
| E-12 TestFlight / Play internal tracks not live by Fri 05-28 | No R1 builds on Thu 06-03 | Keep the EAS pipeline dry-run on internal distribution. Escalate on 05-24 if the Apple or Play organisation is not ready |
| The R1 build breaks on a low-end Android device | Alpha crash-free rate below 99% | Run the E-24 low-end phone in Maestro nightly from Mon 05-31 |
| Cybrilla demo 1 (06-04) shows gaps in onboarding, lumpsum, payments or webhooks | Production approval (10-22) at risk | Dry run on Wed 06-02. Gaps become PO-2 escalations, not hidden flags |
| Load not balanced (A 7.5, B 7.7) | B is the release lane; slack sits on A | A picks up `product_events` wiring on native if B slips |

### Definition of Done
- [ ] SDoD-1..7 met; plan-18 drafted by Thu 06-03.
- [ ] R1 builds are on staging, Play internal and TestFlight by **Thu 06-03**. The alpha checklist is published.
- [ ] A staff member completes sign-up → KYC/onboarding → lumpsum (sandbox) → dashboard on web, Android and iOS.
- [ ] Reviewer accounts are sandbox-only. Self-hosted Sentry is live with scrubbing.
- [ ] Cybrilla demo 1 is delivered; its findings are logged.

### Key Dates
| Date | Event |
|---|---|
| Mon 05-24 | Sprint planning / start |
| Fri 05-28 | E-12: TestFlight / Play internal tracks live |
| Mon 05-31 | Mid-sprint check-in |
| Wed 06-02 | Cybrilla demo dry run |
| Thu 06-03 | R1 builds distributed · plan-18 draft |
| Fri 06-04 | **R1 internal alpha** · Cybrilla demo 1 · E-18 TPL_SIP_* / TPL_MANDATE_* approved · demo · retro |

---

## Sprint Plan: S18 · Mandates and SIP start
**Dates:** Mon 2027-06-07 - Fri 2027-06-18 | **Team:** 2 engineers + AI agents
**Sprint Goal:** An investor can set up a mandate and begin a SIP.

### Capacity
| Person | Available Days | Allocation | Notes |
|---|---|---|---|
| Dev A | 8.5 of 10 | Committed 6.9 · Load 7.0 (items 4.75 + review 1.25 + FakeFp 0.5 + triage 0.5) | Muharram Wed 06-16 (moon), 0.5 leave; +0.1 absorbed by buffer |
| Dev B | 8.5 of 10 | Committed 6.9 · Load 6.85 (items 5.1 + review 1.25 + triage 0.5) | Same |
| AI agents | n/a | Inside the 1.35 factor | |
| **Total** | **17.0 of 20** | **Committed 13.8 · Load 13.85** | |

### Sprint Backlog
| Priority | Item | Estimate | Owner | Dependencies |
|---|---|---|---|---|
| P0 | Mandates part 1 | 1.0 | Dev A | FpGateway |
| P0 | Mandates part 2: UPI Autopay fixed at ₹1L, eNACH steps, external revoke, headroom | 2.0 | Dev A | P-02 evidence / PO-2b outcome (11-13-2026) |
| P0 | SIP saga backend part 1: monthly only, Growth option only (PO-3), first instalment per GAP-05, suitability | 1.75 | Dev A | Mandates; `money_params` |
| P0 | Mandate screens + authorise glue | 2.5 | Dev B | Mandate API |
| P0 | SIP client flow + checkout, part 1 | 2.1 | Dev B | SIP API |
| P0 | Cross-review | 2.5 | A/B | — |
| P0 | FakeFp upkeep | 0.5 | Dev A | — |
| P0 | Alpha triage | 1.0 (0.5 / 0.5) | A/B | R1 feedback |
| P1 | Profile hub, remaining part | 0.5 | Dev B | S17 |

**Cut order:** profile hub remainder.

### Planned Capacity: 13.8 days | Sprint Load: 13.85 days (100% of capacity)
Buffer outside committed capacity: 3.4 days.

### Risks
| Risk | Impact | Mitigation |
|---|---|---|
| P-02 mandate rails behave differently from the probe (approval latency, PSP coverage) | SIP launch path blocked | Any capability that is not proven goes to the PO as a PO-2 go/no-go. eNACH is the fallback rail |
| Alpha triage exceeds 1.0 | Mandate work slips on lane A | Triage is time-boxed. P2 alpha bugs go to the backlog; only CRITICAL/HIGH items interrupt |
| The Muharram date moves (moon) | Holiday shifts within the week | Keep ceremonies off Tue–Thu of week 2 |

### Definition of Done
- [ ] SDoD-1..7 met; plan-19 drafted by Thu 06-17.
- [ ] Mandates can be created, authorised, revoked externally and shown with headroom, on FakeFp and on the sandbox (UPI Autopay + eNACH).
- [ ] A SIP draft is created with the first instalment date per GAP-05; the suitability check runs.
- [ ] **DLV-19:** at least 8 staff complete the alpha checklist; crash-free rate ≥ 99%.

### Key Dates
| Date | Event |
|---|---|
| Mon 06-07 | Sprint planning / start |
| Mon 06-14 | Mid-sprint check-in (alpha checklist count) |
| Wed 06-16 | Muharram (holiday, moon-dependent) |
| Thu 06-17 | plan-19 draft |
| Fri 06-18 | Demo · retro |

---

## Sprint Plan: S19 · SIP registration
**Dates:** Mon 2027-06-21 - Fri 2027-07-02 | **Team:** 2 engineers + AI agents
**Sprint Goal:** An investor registers a SIP with a new or reused mandate.

### Capacity
| Person | Available Days | Allocation | Notes |
|---|---|---|---|
| Dev A | 9.5 of 10 | Committed 7.7 · Load 7.7 (items 5.45 + review 1.25 + FakeFp 0.5 + triage 0.5) | 0.5 leave |
| Dev B | 9.5 of 10 | Committed 7.7 · Load 7.65 (items 5.9 + review 1.25 + triage 0.5) | 0.5 leave |
| AI agents | n/a | Inside the 1.35 factor | |
| **Total** | **19.0 of 20** | **Committed 15.4 · Load 15.35** | |

### Sprint Backlog
| Priority | Item | Estimate | Owner | Dependencies |
|---|---|---|---|---|
| P0 | SIP saga, remaining part | 2.25 | Dev A | S18 |
| P0 | Instalment sync | 2.0 | Dev A | SIP saga |
| P0 | SIP management, part 1 | 1.2 | Dev A | SIP saga |
| P0 | SIP checkout, remaining part | 3.4 | Dev B | S18 |
| P0 | SIP manage screens, part 1 | 1.5 | Dev B | SIP management API |
| P0 | Overheads: review 2.5, FakeFp 0.5, triage 1.0 | 4.0 | A/B | — |
| P1 | Checkout-intent resume + freshness labels | 1.0 | Dev B | Checkout |

**Cut order:** checkout-intent resume.

### Planned Capacity: 15.4 days | Sprint Load: 15.35 days (99.7% of capacity)
Buffer outside committed capacity: 3.85 days.

### Risks
| Risk | Impact | Mitigation |
|---|---|---|
| Mandate headroom race between two concurrent SIPs | Over-committed mandate | Headroom is reserved in the same transaction as SIP creation, with a concurrency test |
| The instalment-sync cadence misses FP status transitions | Wrong "next instalment" shown | Poll plus webhook, with reconcile. Stale data is shown with a freshness label |
| TPL_REDEMPTION / TPL_PLAN_* not approved by Fri 07-02 | S20–S21 consent templates blocked | Escalate at the check-in on Mon 06-28 |

### Definition of Done
- [ ] SDoD-1..7 met; plan-20 drafted by Thu 07-01.
- [ ] A SIP is registered on the sandbox with a new mandate and with a reused one. Growth option only (PO-3).
- [ ] Instalment status syncs and the dashboard SIP count updates.
- [ ] SIP manage part 1 screens are live behind the flag.

### Key Dates
| Date | Event |
|---|---|
| Mon 06-21 | Sprint planning / start |
| Mon 06-28 | Mid-sprint check-in |
| Thu 07-01 | plan-20 draft |
| Fri 07-02 | E-18 TPL_REDEMPTION + TPL_PLAN_* approved · demo · retro |

---

## Sprint Plan: S20 · SIP management
**Dates:** Mon 2027-07-05 - Fri 2027-07-16 | **Team:** 2 engineers + AI agents
**Sprint Goal:** Investors can change, pause and cancel an active SIP.

### Capacity
| Person | Available Days | Allocation | Notes |
|---|---|---|---|
| Dev A | 9.5 of 10 | Committed 7.7 · Load 7.7 (items 5.45 + review 1.25 + FakeFp 0.5 + triage 0.5) | 0.5 leave |
| Dev B | 9.5 of 10 | Committed 7.7 · Load 7.7 (items 5.95 + review 1.25 + triage 0.5) | 0.5 leave |
| AI agents | n/a | Inside the 1.35 factor | |
| **Total** | **19.0 of 20** | **Committed 15.4 · Load 15.4** | |

### Sprint Backlog
| Priority | Item | Estimate | Owner | Dependencies |
|---|---|---|---|---|
| P0 | SIP management, remaining part (see note below) | 4.8 | Dev A | GAP-02 (modify = cancel-and-recreate) |
| P0 | Redemption part 2, start | 0.65 | Dev A | FIFO / lots |
| P0 | SIP manage screens, remaining part | 1.0 | Dev B | S19 |
| P0 | `cutoff.monitor` (DLV-09) | 0.5 | Dev B | Cut-off engine |
| P0 | Redemption part 1: availability + buffer + reservations | 1.5 | Dev B | FIFO |
| P0 | Redemption screens + LotTable / PayoutStatus, part 1 | 2.95 | Dev B | Redemption API |
| P0 | Overheads: review 2.5, FakeFp 0.5, triage 1.0 | 4.0 | A/B | — |
| P2 (not in load) | Annual step-up every 12 months (PO-6 / D-3) | +2.0 | Dev A | P-09 passed and PO chose launch scope |

**SIP management scope:**
- One-off amount change = cancel-and-recreate, with a new 2FA consent.
- Pause via `skip_instructions`, with server chips [1, 2].
- Cancel.
- Warning after 2 missed instalments.

**Annual step-up (D-3):** if taken, it adds about 1 week to P80, or it displaces work under a PO amendment. The default is post-launch.

### Planned Capacity: 15.4 days | Sprint Load: 15.4 days (100% of capacity)
Buffer outside committed capacity: 3.85 days.

### Risks
| Risk | Impact | Mitigation |
|---|---|---|
| Cancel-and-recreate leaves a window with no active SIP, or two active SIPs | Missed or double instalment | Recreate before cancel, with a guard on `installment_day`. Crash-injection test on the two-step path |
| The D-3 step-up is pulled in without a trade | Lane A overruns by 2.0 | Only by PO decision with an explicit displacement; never silently |
| Automated mailback drop (E-9) not live by Fri 07-16 | S21–S22 parsers work from samples only | Use the 12-18-2026 sample files. Escalate to the PO / Ops on 07-12 |

### Definition of Done
- [ ] SDoD-1..7 met; plan-21 drafted by Thu 07-15.
- [ ] Amount change (with new 2FA), pause (1 or 2 instalments), cancel and the missed-instalment warning work end to end on sandbox and FakeFp.
- [ ] `cutoff.monitor` alarms on cut-off breaches in dev.
- [ ] Redemption availability excludes reserved and locked units.

### Key Dates
| Date | Event |
|---|---|
| Mon 07-05 | Sprint planning / start |
| Mon 07-12 | Mid-sprint check-in |
| Thu 07-15 | plan-21 draft |
| Fri 07-16 | E-9: automated CAMS/KFin mailback S3 drop live · demo · retro |

---

## Sprint Plan: S21 · Redemption and payouts
**Dates:** Mon 2027-07-19 - Fri 2027-07-30 | **Team:** 2 engineers + AI agents
**Sprint Goal:** An investor redeems by amount, units or all, with honest payout tracking.

### Capacity
| Person | Available Days | Allocation | Notes |
|---|---|---|---|
| Dev A | 9.5 of 10 | Committed 7.7 · Load 7.6 (items 5.35 + review 1.25 + FakeFp 0.5 + triage 0.5) | 0.5 leave |
| Dev B | 9.5 of 10 | Committed 7.7 · Load 7.7 (items 5.95 + review 1.25 + triage 0.5) | 0.5 leave |
| AI agents | n/a | Inside the 1.35 factor | |
| **Total** | **19.0 of 20** | **Committed 15.4 · Load 15.3** | |

### Sprint Backlog
| Priority | Item | Estimate | Owner | Dependencies |
|---|---|---|---|---|
| P0 | Redemption backend: advisory lock, strict ELSS, `applyExit`, payout states + expected dates by category (GAP-10 §3) | 5.35 | Dev A | S20 |
| P0 | Redemption screens, remaining part | 1.55 | Dev B | S20 |
| P0 | Holdings recon part 1: FP holdings, `externally_modified` | 2.0 | Dev B | P-12 |
| P0 | KFin mailback parser (DLV-10) | 1.5 | Dev B | E-9 files |
| P0 | Overheads: review 2.5, FakeFp 0.5, triage 1.0 | 4.0 | A/B | — |
| P1 | Notifications part 2, part 1 | 0.9 | Dev B | Notifications |

**Cut order:** notifications part 2.

### Planned Capacity: 15.4 days | Sprint Load: 15.3 days (99% of capacity)
Buffer outside committed capacity: 3.85 days.

### Risks
| Risk | Impact | Mitigation |
|---|---|---|
| ELSS lock-in or exit load computed wrongly | Investor loss, or over-redemption | Golden vectors per lot. Strict ELSS rejects any unit still under 3 years |
| Payout expected dates are over-promised | Complaints and grievances | Show category-based ranges with honest states (GAP-10 §3); the timeline never guesses |
| P-12 holdings shape differs from the probe | Recon false positives | Take the probe fixtures into the contract harness; `externally_modified` is flagged, never overwritten |

### Definition of Done
- [ ] SDoD-1..7 met; plan-22 drafted by Thu 07-29.
- [ ] Amount, units and redeem-all work on web and native. Concurrent redeems are serialised by the advisory lock.
- [ ] Payout status and expected date are visible. The KFin parser passes on the sample and automated files.
- [ ] Holdings recon part 1 flags externally modified folios.

### Key Dates
| Date | Event |
|---|---|
| Mon 07-19 | Sprint planning / start |
| Mon 07-26 | Mid-sprint check-in |
| Thu 07-29 | plan-22 draft |
| Fri 07-30 | Demo · retro |

---

## Sprint Plan: S22 · Holdings recon and adjustments
**Dates:** Mon 2027-08-02 - Fri 2027-08-13 | **Team:** 2 engineers + AI agents
**Sprint Goal:** Holdings reconcile against FP or RTA data, with an ops correction tool.

### Capacity
| Person | Available Days | Allocation | Notes |
|---|---|---|---|
| Dev A | 9.5 of 10 | Committed 7.7 · Load 7.75 (items 5.5 + review 1.25 + FakeFp 0.5 + triage 0.5) | 0.5 leave; +0.05 absorbed by buffer |
| Dev B | 9.5 of 10 | Committed 7.7 · Load 7.7 (items 5.95 + review 1.25 + triage 0.5) | 0.5 leave |
| AI agents | n/a | Inside the 1.35 factor | |
| **Total** | **19.0 of 20** | **Committed 15.4 · Load 15.45** | |

### Sprint Backlog
| Priority | Item | Estimate | Owner | Dependencies |
|---|---|---|---|---|
| P0 | CAMS parser + matching / ingest / fixtures (DLV-10) | 2.5 | Dev A | E-9 |
| P0 | Ledger adjustments: maker-checker; MANUAL_UNITS only; no admin route writes `orders.status` | 3.0 | Dev A | Ledger |
| P0 | Folio service requests: MF Central guided, OPS_RTA, re-fetch confirm, timeline | 3.75 | Dev B | `ops_cases` |
| P0 | Switch/STP/SWP screens, part 1 | 1.1 | Dev B | — |
| P0 | Overheads: review 2.5, FakeFp 0.5, triage 1.0 | 4.0 | A/B | — |
| P1 | Notifications part 2, remaining part | 1.1 | Dev B | S21 |

**Cut order:** notifications part 2 remainder.

### Planned Capacity: 15.4 days | Sprint Load: 15.45 days (100.3% of capacity)
Buffer outside committed capacity: 3.85 days.

### Risks
| Risk | Impact | Mitigation |
|---|---|---|
| CAMS file variants break the parser | Recon blind spots | Parse the fixture corpus from real ARN folios (E-9 samples). Unknown record types go to a quarantine queue |
| An admin tool mutates order state | Audit and regulatory breach | Architectural test: no admin route imports the order-status writer. Maker ≠ checker on MANUAL_UNITS |
| TPL_SWITCH / STP / SWP not approved by Fri 08-13 | S23–S24 blocked | Escalate at the check-in on Mon 08-09 |

### Definition of Done
- [ ] SDoD-1..7 met; plan-23 drafted by Thu 08-12.
- [ ] **G4 dry run:** a sandbox folio reaches MATCHED across FP and RTA data.
- [ ] Ledger adjustment requires two distinct ops users and is audited.
- [ ] A folio service request is visible on the investor timeline.

### Key Dates
| Date | Event |
|---|---|
| Mon 08-02 | Sprint planning / start |
| Mon 08-09 | Mid-sprint check-in |
| Thu 08-12 | plan-23 draft |
| Fri 08-13 | E-18 TPL_SWITCH / STP / SWP approved · G4 dry run · demo · retro |
| Sun 08-15 | Independence Day / Milad-un-Nabi (weekend) |

---

## Sprint Plan: S23 · Switch as a two-leg saga
**Dates:** Mon 2027-08-16 - Fri 2027-08-27 | **Team:** 2 engineers + AI agents
**Sprint Goal:** Switch runs as a two-leg saga behind its flag.

### Capacity
| Person | Available Days | Allocation | Notes |
|---|---|---|---|
| Dev A | 8.5 of 10 | Committed 6.9 · Load 6.9 (items 4.65 + review 1.25 + FakeFp 0.5 + triage 0.5) | Janmashtami Wed 08-25, 0.5 leave |
| Dev B | 8.5 of 10 | Committed 6.9 · Load 6.9 (items 5.15 + review 1.25 + triage 0.5) | Same |
| AI agents | n/a | Inside the 1.35 factor | |
| **Total** | **17.0 of 20** | **Committed 13.8 · Load 13.8** | |

### Sprint Backlog
| Priority | Item | Estimate | Owner | Dependencies |
|---|---|---|---|---|
| P0 | Switch two-leg saga: OUT_DONE, PARTIAL_OUT_ONLY → CONVERTED_TO_PAYOUT, stamp duty, target-only suitability; Growth target only (PO-3) | 4.65 | Dev A | P-13 (PO-2b) |
| P0 | Switch/STP/SWP screens, remaining part: two-lane timeline, partial-failure banner | 3.9 | Dev B | S22 |
| P0 | Riskometer-rise job + profile-expiry reminders (GAP-03) | 0.75 | Dev B | Risk profile |
| P0 | Suitability report + investor 360 risk tab, part 1 | 0.5 | Dev B | — |
| P0 | Overheads: review 2.5, FakeFp 0.5, triage 1.0 | 4.0 | A/B | — |

### Planned Capacity: 13.8 days | Sprint Load: 13.8 days (100% of capacity)
Buffer outside committed capacity: 3.4 days.

### Risks
| Risk | Impact | Mitigation |
|---|---|---|
| P-13 showed switch is not native on cybrillapoa | Two-leg saga semantics differ | The PO-2b decision already stands. The saga is built as redeem + purchase with CONVERTED_TO_PAYOUT on a partial failure |
| A partial failure leaves money in limbo | Investor harm | The partial-failure banner plus an `ops_cases` detector (S28). Payout is the default outcome |
| Old P80 date (Mon 08-16) arrives | Stakeholders get confused | PO-8 re-baseline communicated. Show the new P80 of 2028-02-28 in the sprint review |

### Definition of Done
- [ ] SDoD-1..7 met; plan-24 drafted by Thu 08-26.
- [ ] Switch works on FakeFp and the sandbox behind `flag.switch`. PARTIAL_OUT_ONLY converts to a payout with investor messaging.
- [ ] Stamp duty is applied on the purchase leg. Suitability is checked against the target scheme only.
- [ ] The riskometer-rise job notifies affected investors in dev.

### Key Dates
| Date | Event |
|---|---|
| Mon 08-16 | Sprint planning / start (old P80, superseded by PO-8) |
| Mon 08-23 | Mid-sprint check-in |
| Wed 08-25 | Janmashtami (holiday) |
| Thu 08-26 | plan-24 draft |
| Fri 08-27 | E-21: CA OI-8 / 11 / 12 + Income-tax Act 2025 section mapping confirmed · demo · retro |

---

## Sprint Plan: S24 · STP, SWP and UPI intent
**Dates:** Mon 2027-08-30 - Fri 2027-09-10 | **Team:** 2 engineers + AI agents
**Sprint Goal:** STP and SWP instalments run with pre-checks and auto-stop.

### Capacity
| Person | Available Days | Allocation | Notes |
|---|---|---|---|
| Dev A | 9.5 of 10 | Committed 7.7 · Load 7.7 (items 5.45 + review 1.25 + FakeFp 0.5 + triage 0.5) | 0.5 leave |
| Dev B | 9.5 of 10 | Committed 7.7 · Load 7.7 (items 5.95 + review 1.25 + triage 0.5) | 0.5 leave |
| AI agents | n/a | Inside the 1.35 factor | |
| **Total** | **19.0 of 20** | **Committed 15.4 · Load 15.4** | |

### Sprint Backlog
| Priority | Item | Estimate | Owner | Dependencies |
|---|---|---|---|---|
| P0 | Switch, remaining part | 0.6 | Dev A | S23 |
| P0 | STP: instalment machine, pre-check 2 days before, ELSS 12-instalment simulation | 3.5 | Dev A | Switch |
| P0 | SWP, part 1 | 1.35 | Dev A | Redemption |
| P0 | Suitability report, remaining part | 0.75 | Dev B | S23 |
| P0 | `@sanchay/upi-intent` + PSP allowlist + iOS LSApplicationQueriesSchemes + rogue-app test (GAP-06) | 2.0 | Dev B | Checkout |
| P0 | Admin back office part 1, remaining part (see note below) | 3.0 | Dev B | Admin shell |
| P0 | `data_requests` / `grievances` registers, start | 0.2 | Dev B | `ops_cases` |
| P0 | Overheads: review 2.5, FakeFp 0.5, triage 1.0 | 4.0 | A/B | — |

**Admin back office scope:** investor 360, order views, sync / re-drive / refund UTR / MANUAL_UNITS, NAV runs.

### Planned Capacity: 15.4 days | Sprint Load: 15.4 days (100% of capacity)
Buffer outside committed capacity: 3.85 days.

### Risks
| Risk | Impact | Mitigation |
|---|---|---|
| A rogue UPI app intercepts the intent | Payment fraud | PSP allowlist plus a rogue-app test on Android. iOS uses only the declared query schemes |
| STP from ELSS (12-instalment simulation) runs into the lock-in | Instalment failures | The 2-day pre-check auto-stops and notifies |
| Admin re-drive or refund UTR misused | Money movement without control | Maker ≠ checker, TOTP step-up, audit trail |

### Definition of Done
- [ ] SDoD-1..7 met; plan-25 drafted by Thu 09-09.
- [ ] STP and SWP instalments run on FakeFp with the pre-check. Auto-stop is proven on insufficient units.
- [ ] The UPI intent opens only allowlisted PSPs; the rogue-app test passes.
- [ ] Admin investor 360 and order views are live; re-drive and refund UTR are audited.

### Key Dates
| Date | Event |
|---|---|
| Mon 08-30 | Sprint planning / start |
| Mon 09-06 | Mid-sprint check-in |
| Thu 09-09 | plan-25 draft |
| Fri 09-10 | E-18 TPL_BANK / CONTACT_CHANGE / NOMINATION / FOLIO_SR approved · demo · retro |

---

## Sprint Plan: S25 · Tax and privacy registers
**Dates:** Mon 2027-09-13 - Fri 2027-09-24 | **Team:** 2 engineers + AI agents
**Sprint Goal:** Capital gains are classified correctly under both tax statutes.

### Capacity
| Person | Available Days | Allocation | Notes |
|---|---|---|---|
| Dev A | 9.5 of 10 | Committed 7.7 · Load 7.65 (items 5.65 + review 1.0 + FakeFp 0.5 + triage 0.5) | 0.5 leave; review is 2.0 total from S25 |
| Dev B | 9.5 of 10 | Committed 7.7 · Load 7.7 (items 6.2 + review 1.0 + triage 0.5) | 0.5 leave |
| AI agents | n/a | Inside the 1.35 factor | |
| **Total** | **19.0 of 20** | **Committed 15.4 · Load 15.35** | |

### Sprint Backlog
| Priority | Item | Estimate | Owner | Dependencies |
|---|---|---|---|---|
| P0 | SWP, remaining part | 2.15 | Dev A | S24 |
| P0 | Tax constants + capital-gains FIFO replay + Income-tax Act 1961 / 2025 labels and sections by disposal date (GAP-11) | 3.5 | Dev A | E-21 (08-27) |
| P0 | `data_requests` + `grievances` registers + admin screens (21-day / 30-day SLAs) | 2.3 | Dev B | `ops_cases` |
| P0 | Capital-gains CSV formats | 1.5 | Dev B | Tax engine |
| P0 | Report screens + native download/share, part 1 | 2.4 | Dev B | — |
| P0 | Overheads: review 2.0, FakeFp 0.5, triage 1.0 | 3.5 | A/B | — |

### Planned Capacity: 15.4 days | Sprint Load: 15.35 days (99.7% of capacity)
Buffer outside committed capacity: 3.85 days.

### Risks
| Risk | Impact | Mitigation |
|---|---|---|
| Statute boundary: a disposal on or around 2026-04-01 is labelled under the wrong Act | Wrong tax statement | Golden vectors on both sides of the boundary, signed off by the CA (E-21) |
| Grandfathering or indexation edge cases | Wrong gains | CA-provided vectors; the replay is deterministic from the lots |
| Grievance SLA clocks run on calendar days instead of the policy's day type | Regulatory miss | Take the SLA day type from the GAP-08 policy text, with tests |

### Definition of Done
- [ ] SDoD-1..7 met; plan-26 drafted by Thu 09-23.
- [ ] The capital-gains report classifies STCG/LTCG with the correct Act and section by disposal date; golden vectors pass.
- [ ] Grievances and data requests have SLA timers and escalation.
- [ ] SWP completes on FakeFp.

### Key Dates
| Date | Event |
|---|---|
| Mon 09-13 | Sprint planning / start |
| Mon 09-20 | Mid-sprint check-in |
| Thu 09-23 | plan-26 draft |
| Fri 09-24 | Demo · retro |

---

## Sprint Plan: S26 · Statements and account changes
**Dates:** Mon 2027-09-27 - Fri 2027-10-08 | **Team:** 2 engineers + AI agents
**Sprint Goal:** Investors download statements and can change bank or contact details safely.

### Capacity
| Person | Available Days | Allocation | Notes |
|---|---|---|---|
| Dev A | 9.5 of 10 | Committed 7.7 · Load 7.7 (items 5.7 + review 1.0 + FakeFp 0.5 + triage 0.5) | 0.5 leave; Gandhi Jayanti falls on Sat 10-02 |
| Dev B | 9.5 of 10 | Committed 7.7 · Load 7.7 (items 6.2 + review 1.0 + triage 0.5) | 0.5 leave |
| AI agents | n/a | Inside the 1.35 factor | |
| **Total** | **19.0 of 20** | **Committed 15.4 · Load 15.4** | |

### Sprint Backlog
| Priority | Item | Estimate | Owner | Dependencies |
|---|---|---|---|---|
| P0 | Statements, ELSS summary, consent-evidence PDFs, report jobs | 4.0 | Dev A | Ledger, tax |
| P0 | Change of bank + contact change (cooling-off), part 1 | 1.7 | Dev A | Consent, bank backend |
| P0 | Report screens, remaining part | 0.1 | Dev B | S25 |
| P0 | Corporate-action admin + timeline (GAP-10, B share) | 1.0 | Dev B | — |
| P0 | Change-of-bank / contact screens + CoolingOffBanner | 1.25 | Dev B | COB API |
| P0 | Folio-maintenance ops path, B share (GAP-02) | 0.75 | Dev B | GAP-02 D answer |
| P0 | Platform nomination change (MAX 3 per PO-7) + consent history, B share | 1.0 | Dev B | Nomination |
| P0 | Overheads: review 2.0, FakeFp 0.5, triage 1.0 | 3.5 | A/B | — |
| P1 | Support inbox, part 1 (GAP-09) | 2.1 | Dev B | `ops_cases` |

**Cut order:** support inbox part 1 (lever iii candidate).

### Planned Capacity: 15.4 days | Sprint Load: 15.4 days (100% of capacity)
Buffer outside committed capacity: 3.85 days.

### Risks
| Risk | Impact | Mitigation |
|---|---|---|
| Account takeover through a bank or contact change | Fraudulent payout | Cooling-off plus notifications to the old contacts, a 2FA consent, and a redemption block during cooling-off |
| Cybrilla demo 2 (Fri 10-08) exposes SIP, switch or STP gaps | Production approval (10-22) slips | Dry run Wed 10-06; gaps go to the PO the same day |
| Pen-test vendor not contracted by Thu 09-30 (E-25) | The 01-03-2028 testing window slips | Escalate to the PO on 09-27 if there is no signed SOW |

### Definition of Done
- [ ] SDoD-1..7 met; plan-27 drafted by Thu 10-07.
- [ ] Statements and ELSS summary download and share on web and native. Consent-evidence PDFs match the audit records.
- [ ] Change of bank and contact change are enforced by cooling-off, with a banner.
- [ ] Nomination change caps at 3 nominees (PO-7).
- [ ] Cybrilla demo 2 is delivered.

### Key Dates
| Date | Event |
|---|---|
| Mon 09-27 | Sprint planning / start |
| Thu 09-30 | E-25: CERT-In-empanelled pen-test vendor contracted |
| Mon 10-04 | Mid-sprint check-in |
| Wed 10-06 | Cybrilla demo 2 dry run |
| Thu 10-07 | plan-27 draft |
| Fri 10-08 | **Cybrilla demo 2** · demo · retro |

---

## Sprint Plan: S27 · Corporate actions, support and help
**Dates:** Mon 2027-10-11 - Fri 2027-10-22 | **Team:** 2 engineers + AI agents
**Sprint Goal:** Corporate actions post correctly to the ledger.

### Capacity
| Person | Available Days | Allocation | Notes |
|---|---|---|---|
| Dev A | 9.5 of 10 | Committed 7.7 · Load 7.55 (items 5.55 + review 1.0 + FakeFp 0.5 + triage 0.5) | 0.5 leave; Dussehra falls on Sat 10-09 |
| Dev B | 9.5 of 10 | Committed 7.7 · Load 7.7 (items 6.2 + review 1.0 + triage 0.5) | 0.5 leave |
| AI agents | n/a | Inside the 1.35 factor | |
| **Total** | **19.0 of 20** | **Committed 15.4 · Load 15.25** | |

### Sprint Backlog
| Priority | Item | Estimate | Owner | Dependencies |
|---|---|---|---|---|
| P0 | Change of bank, remaining part | 0.8 | Dev A | S26 |
| P0 | Folio-maintenance ops path, A share | 0.75 | Dev A | S26 |
| P0 | Platform nomination change, A share | 1.0 | Dev A | S26 |
| P0 | Corporate actions: merger, segregated portfolio, plan change, suspended scheme | 3.0 | Dev A | Ledger |
| P0 | Overheads: review 2.0, FakeFp 0.5, triage 1.0 | 3.5 | A/B | — |
| P1 | Support inbox, remaining part: tickets, attachments + GuardDuty scan, working-hours SLA, escalation to grievance | 2.9 | Dev B | S26 |
| P1 | Help-centre CMS part 1: tables, versions, full-text search, context keys, ISR revalidation, web + native screens | 3.3 | Dev B | — |

**Cut order:** help CMS (fall back to a static FAQ, lever iii), then the support inbox (fall back to email + `ops_cases`). Both need a PO amendment.

### Planned Capacity: 15.4 days | Sprint Load: 15.25 days (99% of capacity)
Buffer outside committed capacity: 3.85 days.

### Risks
| Risk | Impact | Mitigation |
|---|---|---|
| A segregated portfolio or merger splits lots incorrectly | Cost basis corrupted | Lot-level golden vectors per corporate-action type; maker-checker on posting |
| Uploaded attachments carry malware | Ops endpoint compromise | GuardDuty malware scan before download is allowed |
| The 10-22 business cluster slips (see Key Dates) | CAS (S28) and the prod stack (S29) blocked | Delivery lead reviews each item at the check-in on 10-18 |

The 10-22 cluster is: Cybrilla production approval, sanchay-prod account, E-30 casparser vendoring OK and CAS PDFs.

### Definition of Done
- [ ] SDoD-1..7 met; plan-28 drafted by Thu 10-21.
- [ ] The four corporate-action types post correctly to the ledger and appear on the investor timeline.
- [ ] Support tickets escalate to a grievance when the SLA is breached (if the P1 item lands).
- [ ] Help articles render on web and native from the CMS (if the P1 item lands).

### Key Dates
| Date | Event |
|---|---|
| Mon 10-11 | Sprint planning / start |
| Mon 10-18 | Mid-sprint check-in |
| Thu 10-21 | plan-28 draft |
| Fri 10-22 | E-4/E-14 Cybrilla production approval + sanchay-prod account + Business Support · E-30 casparser MIT vendoring OK, no-CTA policy, ~10 redacted CAS PDFs · E-27 30 help articles · E-18 closure texts · demo · retro |

---

## Sprint Plan: S28 · Detectors, broadcasts and CAS worker
**Dates:** Mon 2027-10-25 - Fri 2027-11-05 | **Team:** 2 engineers + AI agents
**Sprint Goal:** Every money-flow exception opens a detected ops case.

### Capacity
| Person | Available Days | Allocation | Notes |
|---|---|---|---|
| Dev A | 8 of 10 | Committed 6.5 · Load 6.5 (items 4.5 + review 1.0 + FakeFp 0.5 + triage 0.5) | Diwali Fri 10-29 + collective leave Thu 10-28 |
| Dev B | 8 of 10 | Committed 6.5 · Load 6.5 (items 5.0 + review 1.0 + triage 0.5) | Same |
| AI agents | n/a | Inside the 1.35 factor | |
| **Total** | **16.0 of 20** | **Committed 13.0 · Load 13.0** | |

### Sprint Backlog
| Priority | Item | Estimate | Owner | Dependencies |
|---|---|---|---|---|
| P0 | 11 GAP-10 detectors | 1.5 | Dev A | `ops_cases` |
| P0 | `apps/cas-worker` (Python casparser 1.4.1, no-egress Lambda) + `infra/cas.ts` | 3.0 | Dev A | E-30 (10-22) |
| P0 | CAS screens, part 1 | 1.3 | Dev B | CAS API contract |
| P0 | Overheads: review 2.0, FakeFp 0.5, triage 1.0 | 3.5 | A/B | — |
| P1 | Help CMS, remaining part | 0.2 | Dev B | S27 |
| P1 | Broadcast composer + audience + quiet hours / caps, `popular_schemes` job + exclusions, collections criteria text | 3.5 | Dev B | Notifications |

**Cut order:** broadcasts / popular list (lever iii; needs a PO amendment).

### Planned Capacity: 13.0 days | Sprint Load: 13.0 days (100% of capacity)
Buffer outside committed capacity: 3.2 days.

### Risks
| Risk | Impact | Mitigation |
|---|---|---|
| E-30 vendoring OK or CAS PDFs late | CAS worker cannot be tested on real samples | Start with synthetic PDFs; add the real corpus in S30 before the security gate |
| The Lambda gains egress by misconfiguration | CAS data leaves the account | No NAT on the subnet, SG with no outbound rules, VPC flow-log check (S30) |
| Diwali week lowers attention | Detector false negatives | Each detector ships with a positive and a negative fixture |

### Definition of Done
- [ ] SDoD-1..7 met; plan-29 drafted by Thu 11-04.
- [ ] All 11 detectors open `ops_cases`, with `dedupe_key` and SLA.
- [ ] `cas-worker` parses the sample corpus in a no-egress Lambda deployed to nonprod by `infra/cas.ts`.

### Key Dates
| Date | Event |
|---|---|
| Mon 10-25 | Sprint planning / start |
| Thu 10-28 | Collective leave |
| Fri 10-29 | Diwali (holiday) |
| Mon 11-01 | Mid-sprint check-in |
| Wed 11-03 – Thu 11-04 | plan-29 drafting |
| Fri 11-05 | Demo · retro |

---

## Sprint Plan: S29 · CAS import and prod stack
**Dates:** Mon 2027-11-08 - Fri 2027-11-19 | **Team:** 2 engineers + AI agents
**Sprint Goal:** CAS holdings are imported, deduplicated and shown separately.

### Capacity
| Person | Available Days | Allocation | Notes |
|---|---|---|---|
| Dev A | 9.5 of 10 | Committed 7.7 · Load 7.5 (items 5.5 + review 1.0 + FakeFp 0.5 + triage 0.5) | 0.5 leave; Guru Nanak falls on Sun 11-14 |
| Dev B | 9.5 of 10 | Committed 7.7 · Load 7.7 (items 6.2 + review 1.0 + triage 0.5) | 0.5 leave |
| AI agents | n/a | Inside the 1.35 factor | |
| **Total** | **19.0 of 20** | **Committed 15.4 · Load 15.2** | |

### Sprint Backlog
| Priority | Item | Estimate | Owner | Dependencies |
|---|---|---|---|---|
| P0 | `packages/cas-import`: schema types, PAN filter, upsert, ISIN mapping | 4.0 | Dev A | cas-worker |
| P0 | Dedupe + UNITS_MISMATCH | 1.5 | Dev A | cas-import |
| P0 | CAS screens, remaining part: `useCasImport`, document picker, ExternalBadge / CoverageNote | 2.2 | Dev B | S28 |
| P0 | CAS admin monitor + unmapped-scheme queue | 1.5 | Dev B | cas-import |
| P0 | External valuation / scope XIRR | 1.5 | Dev B | Valuation |
| P0 | Prod CDK stack, part 1 (DLV-02) | 1.0 | Dev B | Prod account (E-14, 10-22) |
| P0 | Overheads: review 2.0, FakeFp 0.5, triage 1.0 | 3.5 | A/B | — |

### Planned Capacity: 15.4 days | Sprint Load: 15.2 days (99% of capacity)
Buffer outside committed capacity: 3.85 days.

### Risks
| Risk | Impact | Mitigation |
|---|---|---|
| Lane B turns critical: the prod stack slips | Cutover (S32–S33) slips | A has 0.2 slack. Pair on the CDK review; no feature scope enters S29–S30 on B |
| PAN filter lets a family member's CAS in | Privacy breach | PAN must match the verified KYC PAN; mismatched folios are dropped before persisting |
| CAS and platform holdings double-count | Inflated dashboard | Dedupe by folio + ISIN; external holdings shown separately with ExternalBadge |
| FP production credentials (E-4) not received by Fri 11-19 | About 4 weeks of cutover float shrinks | Delivery lead chases Cybrilla from 11-15 |

### Definition of Done
- [ ] SDoD-1..7 met; plan-30 drafted by Thu 11-18.
- [ ] A CAS import on web and native shows external holdings separately, with coverage notes and a scope-aware XIRR.
- [ ] UNITS_MISMATCH opens an ops case.
- [ ] Prod stack part 1 is synthesised and deployed to sanchay-prod (base networking).
- [ ] P50 checkpoint recorded: at P50, feature work finishes this sprint.

### Key Dates
| Date | Event |
|---|---|
| Mon 11-08 | Sprint planning / start |
| Fri 11-12 | E-25: pen-test scope agreed |
| Mon 11-15 | Mid-sprint check-in |
| Thu 11-18 | plan-30 draft |
| Fri 11-19 | E-4 FP production credentials · E-17 final legal set · demo · retro |

---

## Sprint Plan: S30 · CAS security gate and admin part 2
**Dates:** Mon 2027-11-22 - Fri 2027-12-03 | **Team:** 2 engineers + AI agents
**Sprint Goal:** CAS import passes its security gate for the beta.

### Capacity
| Person | Available Days | Allocation | Notes |
|---|---|---|---|
| Dev A | 9.5 of 10 | Committed 7.7 · Load 7.5 (items 5.5 + review 1.0 + FakeFp 0.5 + triage 0.5) | 0.5 leave |
| Dev B | 9.5 of 10 | Committed 7.7 · Load 7.5 (items 6.0 + review 1.0 + triage 0.5) | 0.5 leave |
| AI agents | n/a | Inside the 1.35 factor | |
| **Total** | **19.0 of 20** | **Committed 15.4 · Load 15.0** | |

The 0.4 of unallocated capacity is held as float for CAS security-review findings and the prod stack.

### Sprint Backlog
| Priority | Item | Estimate | Owner | Dependencies |
|---|---|---|---|---|
| P0 | CAS API + P07 consent + erasure + 1-hour raw sweeper | 1.5 | Dev A | S29 |
| P0 | Golden / fuzz / bomb corpus + VPC flow-log check | 2.0 | Dev A | cas-worker |
| P0 | CAS security review | 0.5 | Dev A | Corpus |
| P0 | EUIN / OTP evidence exports | 1.5 | Dev A | Consent records |
| P0 | Prod stack, remaining part: VPC, NAT EIPs, RDS, ECS, CloudFront, WAF, Secrets | 1.5 | Dev B | S29 part 1 |
| P0 | Closure screens ACC-01..04 (GAP-07) | 1.0 | Dev B | Closure API contract |
| P0 | Admin part 2: catalogue, legal, config maker-checker, users, jobs, service requests | 3.5 | Dev B | Admin part 1 |
| P0 | Overheads: review 2.0, FakeFp 0.5, triage 1.0 | 3.5 | A/B | — |

### Planned Capacity: 15.4 days | Sprint Load: 15.0 days (97% of capacity)
Buffer outside committed capacity: 3.85 days.

### Risks
| Risk | Impact | Mitigation |
|---|---|---|
| A zip-bomb or malformed PDF crashes the worker or exhausts memory | Denial of service; CAS gate fails | Bomb corpus plus Lambda memory and time caps; the 1-hour raw sweeper |
| NAT EIPs not sent by Fri 11-26 (E-4 / E-11) | Cybrilla allowlist misses 12-10 | Deploy NAT early in week 1 and send the EIPs on 11-24 |
| Admin part 2 (3.5) competes with the prod stack on lane B | Critical-path slip | Prod stack first; admin part 2 has about 1 sprint of float against the pilot |

### Definition of Done
- [ ] SDoD-1..7 met; plan-31 drafted by Thu 12-02.
- [ ] CAS-01..06 controls pass: consent, erasure, 1-hour raw deletion, no egress (flow log), fuzz/bomb, PAN filter. The security review is signed.
- [ ] EUIN-blank and execution-only evidence exports and OTP evidence exports are produced for a sample order set.
- [ ] The prod stack is deployed (no traffic). NAT EIPs are sent to Cybrilla.

### Key Dates
| Date | Event |
|---|---|
| Mon 11-22 | Sprint planning / start |
| Fri 11-26 | E-4/E-11: NAT EIPs sent to Cybrilla; SES production access |
| Mon 11-29 | Mid-sprint check-in |
| Thu 12-02 | plan-31 draft |
| Fri 12-03 | Demo · retro |

---

## Sprint Plan: S31 · R2 feature-complete
**Dates:** Mon 2027-12-06 - Fri 2027-12-17 | **Team:** 2 engineers + AI agents
**Sprint Goal:** Every decision-4 feature is complete for the sandbox beta (R2).

### Capacity
| Person | Available Days | Allocation | Notes |
|---|---|---|---|
| Dev A | 9.5 of 10 | Committed 7.7 · Load 7.7 (items 5.7 + review 1.0 + FakeFp 0.5 + triage 0.5) | 0.5 leave |
| Dev B | 9.5 of 10 | Committed 7.7 · Load 7.7 (items 6.2 + review 1.0 + triage 0.5) | 0.5 leave |
| AI agents | n/a | Inside the 1.35 factor | |
| **Total** | **19.0 of 20** | **Committed 15.4 · Load 15.4** | |

### Sprint Backlog
| Priority | Item | Estimate | Owner | Dependencies |
|---|---|---|---|---|
| P0 | Self-serve closure state machine: cancel-all, 7-day reversal, legal hold (GAP-07) | 2.5 | Dev A | S30 screens |
| P0 | DPDP privacy centre + retention engine + audit export, part 1 (see note below) | 3.2 | Dev A | GAP-08 |
| P0 | Alarms + runbooks | 1.5 | Dev B | Prod stack |
| P0 | CSP checks / headers | 2.0 | Dev B | — |
| P0 | Performance budgets + low-end device run | 2.0 | Dev B | E-24 device |
| P0 | Accessibility audit, part 1 | 0.7 | Dev B | — |
| P0 | Overheads: review 2.0, FakeFp 0.5, triage 1.0 | 3.5 | A/B | — |

**Retention engine scope:** R-REG 8 years from closure, and extending the Object Lock retain-until date.

### Planned Capacity: 15.4 days | Sprint Load: 15.4 days (100% of capacity)
Buffer outside committed capacity: 3.85 days.

### Risks
| Risk | Impact | Mitigation |
|---|---|---|
| Closure with in-flight orders or SIP instalments | Orphaned money | Cancel-all first. Closure is blocked until settled, with a 7-day reversal window |
| Retention conflicts with erasure requests | DPDP versus regulatory retention clash | A legal hold overrides erasure. The retention engine records the reason; the counsel-approved matrix is the source |
| R2 builds not on the Play closed track / TestFlight by Thu 12-16 | Beta start slips | Build candidate by Tue 12-14; store review buffer |
| EIP allowlist (Fri 12-10) not done | Cutover (S32) blocked | Delivery lead escalates on 12-13 |

### Definition of Done
- [ ] SDoD-1..7 met; plan-32 drafted by Thu 12-16.
- [ ] R2 builds are on the Play closed track and TestFlight by **Thu 12-16**.
- [ ] Every decision-4 feature is on in the sandbox: CAS on (D-4); flags off only under PO-signed amendments.
- [ ] CSP headers pass automated checks. Performance budgets pass on the low-end device.
- [ ] Closure, reversal and legal hold are proven end to end.

### Key Dates
| Date | Event |
|---|---|
| Mon 12-06 | Sprint planning / start |
| Fri 12-10 | E-4: Cybrilla EIP allowlist done |
| Mon 12-13 | Mid-sprint check-in |
| Thu 12-16 | R2 builds distributed · plan-32 draft |
| Fri 12-17 | **R2 closed beta** (about 25 staff + ops, sandbox, CAS on) · E-26 DPAs, CERT-In contact + runbook, support staffing · demo · retro |

---

## Sprint Plan: S32 · Beta hardening and cutover start
**Dates:** Mon 2027-12-20 - Fri 2027-12-31 (last working day Wed 12-29) | **Team:** 2 engineers + AI agents
**Sprint Goal:** Harden the beta build and start the FP production cutover.

### Capacity
| Person | Available Days | Allocation | Notes |
|---|---|---|---|
| Dev A | 8 of 10 | Committed 6.5 · Load 6.5 (items 4.0 + review 1.0 + FakeFp 0.5 + beta triage 1.0) | Christmas falls on Sat 12-25; collective leave Thu 12-30, Fri 12-31 |
| Dev B | 8 of 10 | Committed 6.5 · Load 6.5 (items 4.5 + review 1.0 + beta triage 1.0) | Same |
| AI agents | n/a | Inside the 1.35 factor | |
| **Total** | **16.0 of 20** | **Committed 13.0 · Load 13.0** | |

### Sprint Backlog
| Priority | Item | Estimate | Owner | Dependencies |
|---|---|---|---|---|
| P0 | Privacy centre, remaining part | 0.8 | Dev A | S31 |
| P0 | BOLA / cross-host suites | 2.0 | Dev A | — |
| P0 | FP production cutover part 1: credentials, webhook secrets, feeds bucket | 1.2 | Dev A | E-4 credentials (11-19), allowlist (12-10) |
| P0 | Accessibility audit (TalkBack / VoiceOver), remaining part | 2.3 | Dev B | S31 |
| P0 | Playwright + Maestro part 2, part 1 | 1.7 | Dev B | — |
| P0 | Overheads: review 2.0, FakeFp 0.5, beta triage 2.0 | 4.5 | A/B | — |
| P1 | k6 smoke | 0.5 | Dev B | Staging |

**Cut order:** k6 smoke (the full k6 run is in S34).

### Planned Capacity: 13.0 days | Sprint Load: 13.0 days (100% of capacity)
Buffer outside committed capacity: 3.2 days.

### Risks
| Risk | Impact | Mitigation |
|---|---|---|
| Production secrets handled carelessly during cutover | Credential leak | Secrets Manager only, two-person rule, never in the repo or CI logs; rotation plan documented |
| Beta triage exceeds 2.0 in the holiday weeks | Pen-test build unstable | Freeze the R2 build for the pen test from Wed 12-29; only CRITICAL fixes after that |
| BOLA findings arrive late | Pen-test findings duplicated | Run the BOLA and cross-host suites before the vendor starts on 01-03 |

### Definition of Done
- [ ] SDoD-1..7 met; plan-33 drafted by Wed 12-29.
- [ ] The BOLA suite covers every investor-scoped procedure. The cross-host suite blocks ops ↔ app ↔ api cookie and host confusion.
- [ ] Production FP credentials and webhook secrets are stored and verified with a read-only ping. The feeds bucket is live.
- [ ] Accessibility audit is closed; AA issues are fixed or tracked with an owner.
- [ ] The R2 pen-test build is tagged and frozen.

### Key Dates
| Date | Event |
|---|---|
| Mon 12-20 | Sprint planning / start |
| Thu 12-23 | Mid-sprint check-in |
| Fri 12-24 | E-22: 2028 exchange / RBI calendars loaded |
| Tue 12-28 – Wed 12-29 | plan-33 drafting |
| Wed 12-29 | Pen-test build frozen · demo · retro |
| Thu 12-30 – Fri 12-31 | Collective leave |

---

## Sprint Plan: S33 · Pen-test window and production readiness
**Dates:** Mon 2028-01-03 - Fri 2028-01-14 | **Team:** 2 engineers + AI agents
**Sprint Goal:** Production is verified read-only while the external pen test runs.

### Capacity
| Person | Available Days | Allocation | Notes |
|---|---|---|---|
| Dev A | 9.5 of 10 | Committed 7.7 · Load 7.3 (items 4.8 + review 1.0 + FakeFp 0.5 + beta triage 1.0) | 0.5 leave |
| Dev B | 9.5 of 10 | Committed 7.7 · Load 7.8 (items 5.8 + review 1.0 + beta triage 1.0) | 0.5 leave; +0.1 over (see risk) |
| AI agents | n/a | Inside the 1.35 factor | |
| **Total** | **19.0 of 20** | **Committed 15.4 · Load 15.1** | |

### Sprint Backlog
| Priority | Item | Estimate | Owner | Dependencies |
|---|---|---|---|---|
| P0 | Cutover part 1 remainder + part 2: feeds, production holdings, read-only production probes, P-05 re-run | 1.8 | Dev A | S32 |
| P0 | FP contract suite completion | 2.0 | Dev A | FakeFp |
| P0 | Playwright + Maestro part 2, A share | 1.0 | Dev A | S32 |
| P0 | Playwright + Maestro part 2, remaining B share | 1.3 | Dev B | S32 |
| P0 | Pen-test support (testing 01-03 → 01-14 on the R2 build) | 1.5 | Dev B | E-25 |
| P0 | Store listings, Data safety, privacy labels (preparation) | 3.0 | Dev B | E-13 |
| P0 | Overheads: review 2.0, FakeFp 0.5, beta triage 2.0 | 4.5 | A/B | — |

### Planned Capacity: 15.4 days | Sprint Load: 15.1 days (98% of capacity)
Buffer outside committed capacity: 3.85 days.

### Risks
| Risk | Impact | Mitigation |
|---|---|---|
| B is over by 0.1 while A has 0.4 of slack | B misses the store-prep deadline | Move 0.1 of the B Playwright/Maestro share to A at planning (A 7.4, B 7.7) |
| A read-only production probe accidentally writes | A real-money side effect | Production token audience is read-only for probes; allowlisted GET endpoints only; a second reviewer on every probe script |
| G2/G3 written confirmations miss Fri 01-07 (Q-C1, Q-C11, OI-1, OI-5) | The 01-28 go/no-go fails G2/G3 | PO chases from 01-03; this is an explicit go/no-go input |
| Data safety or privacy labels do not match the actual SDK data flows | Store rejection | Build the labels from the DPA processor list and the `product_events` schema; the counsel reviews |

### Definition of Done
- [ ] SDoD-1..7 met; plan-34 drafted by Thu 01-13.
- [ ] Production feeds and holdings are read successfully. The P-05 re-run on production is green and recorded.
- [ ] The FP contract suite covers every FP call in use.
- [ ] Pen-test testing is complete and the findings are triaged by severity.
- [ ] **DLV-19:** the decision-4 checklist is signed, or PO-signed amendments are recorded.

### Key Dates
| Date | Event |
|---|---|
| Mon 01-03 | Sprint planning / start · pen-test testing begins |
| Fri 01-07 | E-7: G2 / G3 written confirmations |
| Mon 01-10 | Mid-sprint check-in |
| Thu 01-13 | plan-34 draft |
| Fri 01-14 | Pen-test testing ends · demo · retro |

---

## Sprint Plan: S34 · Remediation and real-money go/no-go (time-box)
**Dates:** Mon 2028-01-17 - Fri 2028-01-28 | **Team:** 2 engineers + AI agents
**Sprint Goal:** Take an evidence-backed real-money go/no-go on Fri 01-28.

### Capacity
| Person | Available Days | Allocation | Notes |
|---|---|---|---|
| Dev A | 8.5 of 10 | Committed 5.1 (8.5 × 0.75 × 1.0 × 0.8) · Load 5.1 (items 3.6 + review 1.0 + FakeFp 0.5) | Republic Day Wed 01-26, 0.5 leave; factor 1.0 (DLV-16) |
| Dev B | 8.5 of 10 | Committed 5.1 · Load 5.1 (items 4.1 + review 1.0) | Same |
| AI agents | n/a | Factor 1.0 (time-box) | Agents still used, but no uplift is planned |
| **Total** | **17.0 of 20** | **Committed 10.2 · Load 10.2** | |

### Sprint Backlog
| Priority | Item | Estimate | Owner | Dependencies |
|---|---|---|---|---|
| P0 | Pen-test remediation + retest by Thu 01-27 | 4.0 (A 2.0 / B 2.0) | A/B | S33 findings |
| P0 | DR restore drill + full k6 run | 1.6 | Dev A | Prod stack |
| P0 | Store closed-track submissions + reviewer-account rotation | 1.0 | Dev B | S33 listings |
| P0 | G1–G10 evidence pack | 1.1 | Dev B | All gates |
| P0 | Cross-review | 2.0 | A/B | — |
| P0 | FakeFp upkeep | 0.5 | Dev A | — |

### Planned Capacity: 10.2 days | Sprint Load: 10.2 days (100% of capacity)
Buffer outside committed capacity: 2.55 days.

### Risks
| Risk | Impact | Mitigation |
|---|---|---|
| CRITICAL/HIGH findings exceed 4.0 days | No retest letter, so G1 fails | Remediation is the only P0. The DR drill can move to Mon 01-31 only with the PO's agreement; the go/no-go then records a conditional pass |
| The DR restore misses its RTO/RPO | G-gate fails | Rehearse on staging in week 1; production drill on Mon 01-24 |
| Counsel and PO do not sign the canary as a controlled test | Canary cannot start 01-31 | Draft the sign-off text on Fri 01-21 together with E-27 |

### Definition of Done
- [ ] SDoD-1..7 met; plan-35 (with the DLV-13 pilot test calendar) drafted by Thu 01-27.
- [ ] The retest letter is received (G1). The DR restore is timed and recorded. The full k6 run meets the budgets.
- [ ] G1, G2, G3, G4a/G5a/G6a, G7, G8, G9 and G10 evidence is filed. G4a/G5a/G6a means: sandbox P-07/P-12/P-05 green and the RTA parser passing on real mailback files.
- [ ] Go/no-go decision recorded Fri 01-28; counsel and PO signed the canary.

### Key Dates
| Date | Event |
|---|---|
| Mon 01-17 | Sprint planning / start |
| Fri 01-21 | Mid-sprint check-in · E-27 support channel, escalation matrix, pilot invite list |
| Mon 01-24 | Production DR restore drill |
| Wed 01-26 | Republic Day (holiday) |
| Thu 01-27 | Pen-test retest complete · plan-35 draft |
| Fri 01-28 | **Real-money go/no-go** · demo · retro |

---

## Sprint Plan: S35 · Founders' canary and pilot (time-box)
**Dates:** Mon 2028-01-31 - Fri 2028-02-11 | **Team:** 2 engineers + AI agents
**Sprint Goal:** The founders' canary proves production, then invitees transact.

### Capacity
| Person | Available Days | Allocation | Notes |
|---|---|---|---|
| Dev A | 9.5 of 10 | Committed 5.7 (9.5 × 0.75 × 1.0 × 0.8) · Load 5.7 (items 4.2 + review 1.0 + FakeFp 0.5) | 0.5 leave; no weekday holiday assumed (2028 central list unpublished) |
| Dev B | 9.5 of 10 | Committed 5.7 · Load 5.7 (items 4.7 + review 1.0) | 0.5 leave |
| AI agents | n/a | Factor 1.0 (time-box) | |
| **Total** | **19.0 of 20** | **Committed 11.4 · Load 11.4** | |

### Sprint Backlog
| Priority | Item | Estimate | Owner | Dependencies |
|---|---|---|---|---|
| P0 | Canary Mon 01-31 → Fri 02-04, then support rota | 3.0 (A 1.5 / B 1.5) | A/B | Go decision on 01-28 |
| P0 | Pilot fixes | 4.9 (A 2.2 / B 2.7) | A/B | — |
| P0 | Flag enablement with production evidence | 1.0 (A 0.5 / B 0.5) | A/B | Canary evidence |
| P0 | Cross-review | 2.0 | A/B | — |
| P0 | FakeFp upkeep | 0.5 | Dev A | — |

**Canary scope:**
- ₹500 lumpsum orders.
- SIPs on UPI Autopay and eNACH, with `installment_day` on the first allowed day on or after Thu 02-10.
- Redemptions placed by Mon 02-07.
- STP/SWP first instalment by Fri 02-18 (see the S36 note).

### Planned Capacity: 11.4 days | Sprint Load: 11.4 days (100% of capacity)
Buffer outside committed capacity: 2.85 days.

### Risks
| Risk | Impact | Mitigation |
|---|---|---|
| A canary order is allotted without the ARN on the RTA record | G5b fails and invitees are blocked | Check the RTA record on the first allotment (T+1). A failure is a PO-2 escalation on Mon 02-07, not a silent flag |
| A production folio does not reach MATCHED by 02-07 | G4b/G6b fail | Daily recon review during the canary week; ops correction tool ready |
| The pilot finds a CRITICAL defect | Public go/no-go at risk | Stop-the-line rule: disable the flow through app config and fix before re-enabling |

### Definition of Done
- [ ] SDoD-1..7 met; plan-36 drafted by Thu 02-10.
- [ ] Canary evidence: at least one settled lumpsum on each rail; SIP mandates registered; redemptions placed by 02-07.
- [ ] G4b/G5b/G6b passed on Mon 02-07: production allotted units present, ARN on the RTA record, folio MATCHED.
- [ ] Invitees (at most 50) onboarded from 02-07. Each flow is enabled only with production evidence.

### Key Dates
| Date | Event |
|---|---|
| Mon 01-31 | Sprint planning / start · **founders' canary** begins |
| Fri 02-04 | Canary ends |
| Mon 02-07 | Mid-sprint check-in · **G4b/G5b/G6b gate** · invitees start · redemption placement deadline |
| Thu 02-10 | First allowed SIP `installment_day` window · plan-36 draft |
| Fri 02-11 | Demo · retro |

---

## Sprint Plan: S36 · Stabilise and launch (launch sprint, time-box)
**Dates:** Mon 2028-02-14 - Fri 2028-02-25 | **Team:** 2 engineers + AI agents
**Sprint Goal:** Take the public go/no-go on Fri 02-25 with zero open CRITICAL defects.

### Capacity
| Person | Available Days | Allocation | Notes |
|---|---|---|---|
| Dev A | 9.5 of 10 | Committed 5.7 · Load 5.7 (items 4.2 + review 1.0 + FakeFp 0.5) | 0.5 leave. Maha Shivaratri Wed 02-23 is a restricted holiday, not deducted |
| Dev B | 9.5 of 10 | Committed 5.7 · Load 5.7 (items 4.7 + review 1.0) | 0.5 leave |
| AI agents | n/a | Factor 1.0 (time-box) | |
| **Total** | **19.0 of 20** | **Committed 11.4 · Load 11.4** | |

### Sprint Backlog
| Priority | Item | Estimate | Owner | Dependencies |
|---|---|---|---|---|
| P0 | Stabilisation | 5.9 (A 3.2 / B 2.7) | A/B | Pilot defects |
| P0 | Compliance sign-off + G1–G11 | 2.0 (A 1.0 / B 1.0) | A/B | Evidence pack |
| P0 | Staged store rollout preparation | 1.0 | Dev B | E-13 store approvals (02-18) |
| P0 | Cross-review | 2.0 | A/B | — |
| P0 | FakeFp upkeep | 0.5 | Dev A | — |

### Planned Capacity: 11.4 days | Sprint Load: 11.4 days (100% of capacity)
Buffer outside committed capacity: 2.85 days.

### Risks
| Risk | Impact | Mitigation |
|---|---|---|
| The allocation's STP/SWP first-instalment deadline (≤ 02-20) is a **Sunday**, which breaks DLV-18 | No STP/SWP production evidence by 02-25 | Set the deadline to **Fri 02-18**. Schedule the instalments so they process before the likely Wed 02-23 exchange holiday |
| Maha Shivaratri (Wed 02-23) is likely an NSE/BSE holiday, so not an MF business day | SIP instalment or payout evidence lands after 02-25 | Confirm against the 2028 exchange calendar (E-22, 12-24). Pick instalment dates of 02-18 or earlier |
| Store approval (E-13) slips past Fri 02-18 | No staged rollout on 02-28 | Closed-track builds were submitted in S34. Web launch can proceed alone under a PO decision |
| Id-ul-Fitr 2028 is moon-dependent, expected around the 02-26/27 weekend | Launch day Mon 02-28 could become a holiday (DLV-18) | Check when the 2028 central list is published; fallback launch date is Tue 02-29 |
| A flow has no production evidence by 02-25 | Launch scope question | The flow stays flag-off only under a PO-2 amendment (DLV-13); never hidden |

### Definition of Done
- [ ] SDoD-1..7 met; plan-37 `2028-02-28-plan-37-hypercare.md` drafted by Thu 02-24.
- [ ] G1–G11 signed by compliance and the PO.
- [ ] At least 20 settled real orders.
- [ ] At least one each of the following in production: settled SIP instalment, confirmed payout, STP instalment, SWP instalment.
- [ ] 0 open CRITICAL defects.
- [ ] Staged rollout 10 → 50 → 100% configured in Play and App Store Connect. App-config kill switches verified in production.
- [ ] Public go/no-go recorded Fri 02-25.

### Key Dates
| Date | Event |
|---|---|
| Mon 02-14 | Sprint planning / start |
| Fri 02-18 | E-13 store approvals · STP/SWP first-instalment deadline (moved from Sun 02-20) |
| Mon 02-21 | Mid-sprint check-in |
| Wed 02-23 | Maha Shivaratri (likely exchange holiday; dev day kept) |
| Thu 02-24 | plan-37 draft · evidence freeze |
| Fri 02-25 | **Public go/no-go** · demo · retro |

---

## Sprint Plan: S37 · Launch hypercare (first post-launch sprint)
**Dates:** Mon 2028-02-28 - Fri 2028-03-10 | **Team:** 2 engineers + AI agents
**Sprint Goal:** Sanchay reaches 100% staged rollout with every money flow reconciled daily and zero open CRITICAL defects.

The allocation lists S37 only as "hypercare" with no line items. The items below are my proposal. They use the S35–S36 time-box model: factor 1.0, review 2.0 and FakeFp 0.5.

### Capacity
| Person | Available Days | Allocation | Notes |
|---|---|---|---|
| Dev A | 9.5 of 10 | Committed 5.7 · Load 5.7 (items 4.2 + review 1.0 + FakeFp 0.5) | 0.5 leave; Holi falls on Sat 03-11; on-call primary for money flows |
| Dev B | 9.5 of 10 | Committed 5.7 · Load 5.7 (items 4.7 + review 1.0) | 0.5 leave; on-call primary for clients and stores |
| AI agents | n/a | Factor 1.0 (time-box) | |
| **Total** | **19.0 of 20** | **Committed 11.4 · Load 11.4** | |

### Sprint Backlog
| Priority | Item | Estimate | Owner | Dependencies |
|---|---|---|---|---|
| P0 | Hypercare on-call + support rota (business hours plus paging for CRITICAL) | 3.0 (A 1.5 / B 1.5) | A/B | E-27 escalation matrix |
| P0 | Launch-defect fixes: backend and money flows | 2.2 | Dev A | — |
| P0 | Launch-defect fixes: web, native and admin | 1.7 | Dev B | — |
| P0 | Daily reconciliation, invariants M1–M6, detector tuning | 0.5 | Dev A | Detectors |
| P0 | Staged rollout 10 → 50 → 100% + Play/App Store vitals + app-config kill switches | 1.0 | Dev B | S36 |
| P0 | Cross-review 2.0 · FakeFp 0.5 | 2.5 | A/B | — |
| P1 | Post-launch retro + fast-follow backlog + plan-38 draft (see note below) | 0.5 | Dev B | PO |

**Fast-follow backlog:** IDCW (PO-3), annual step-up if deferred (D-3), self-hosted PostHog (D-2, P2), generic SIP calculator (P2), and any lever/amendment deferrals.

**Proposed plan-38 file:** `2028-03-13-plan-38-post-launch.md`.

### Planned Capacity: 11.4 days | Sprint Load: 11.4 days (100% of capacity)
Buffer outside committed capacity: 2.85 days. In hypercare, that buffer is the incident reserve.

### Risks
| Risk | Impact | Mitigation |
|---|---|---|
| The launch lands in the ELSS / financial-year-end rush (March) | Order spike; cut-off and payment load | Full k6 run done in S34. `cutoff.monitor` and payment alarms tuned. Pause broadcasts if error budgets burn |
| A crash spike at 10% rollout | Bad reviews; money-flow abandonment | Halt the rollout in the console. App config serves maintenance or force-update. Step-up gate: crash-free ≥ 99% (DLV-19 bar) and 0 CRITICAL |
| A reconciliation break on live money | Investor harm; regulatory exposure | Daily recon review. Detectors open `ops_cases`. Ops correction only through maker ≠ checker (no admin write to `orders.status`) |
| Two people cannot sustain on-call | Burnout; slower fixes | Business-hours rota plus paging for CRITICAL only. Lever (i), a third developer, goes to the PO for BAU |

### Definition of Done
- [ ] SDoD-1..7 met.
- [ ] Rollout at 100% on Play and the App Store with crash-free ≥ 99%. Web is live on `sanchay.in`, and `app.sanchay.in` is a 301 redirect only (D-1).
- [ ] 10 consecutive business days of daily recon with no unresolved break older than its SLA. 0 open CRITICAL defects.
- [ ] Every production incident has a runbook entry or update. Grievance and data-request SLAs are tracked.
- [ ] Hypercare exit review signed by the PO; fast-follow backlog prioritised; plan-38 drafted.

### Key Dates
| Date | Event |
|---|---|
| Mon 02-28 | **R4 public launch** · staged rollout 10% · sprint start |
| Thu 03-02 | Rollout step to 50% (if the gate passes) |
| Mon 03-06 | Mid-sprint check-in |
| Tue 03-07 | Rollout step to 100% (if the gate passes) |
| Thu 03-09 | plan-38 draft |
| Fri 03-10 | Hypercare exit review / demo · launch retro |
| Sat 03-11 | Holi (weekend) |

---

## Consistency notes for the lead (allocation versus arithmetic)

1. **S17, Dev A load.** The items sum to 6.0 and the overheads to 1.5 (review 1.0, FakeFp 0.5), so the load is **7.5**. The allocation header says 7.2. The item estimates are used as given, and 0.2 of slack is left on A.
2. **Small overloads absorbed by the buffer**, the same way as S1:

   | Sprint | Dev | Load / committed | Over by |
   |---|---|---|---|
   | S18 | A | 7.0 / 6.9 | 0.1 |
   | S22 | A | 7.75 / 7.7 | 0.05 |
   | S33 | B | 7.8 / 7.7 | 0.1 |

   For S33, I recommend moving 0.1 of the B Playwright/Maestro share to A.
3. **CAS owner split.** The sprint rows give A 12.5 / B 6.5, which is 19.0. The register says A 14.0 / B 5.0. The total of 19.0 matches, so only the register split needs correcting.
4. **STP/SWP first-instalment deadline** "≤ 02-20-2028" is a Sunday, which breaks DLV-18. Proposed: Fri 02-18, which is also before the likely Wed 02-23 exchange holiday (Maha Shivaratri).
5. **Holi 2027.** Panchang sources give Rangwali Holi as Mon 2027-03-22; the allocation uses Tue 03-23. Confirm against the gazetted 2027 central list. S12 capacity is unchanged either way, and the check-in was moved to Fri 03-19.
6. **Other 2028 dates.** Id-ul-Fitr is moon-dependent, expected on the 02-26/27 weekend; check it against launch Mon 02-28 when the 2028 list is published. Holi 2028 is Sat 03-11, so there is no impact.
7. **Notifications (S16) depend on E-26 DPAs, which are due only on 2027-12-17.** Push to staff devices starts with R1 (06-04-2027). Recommend pulling the FCM/APNs DPA forward to 05-21-2027 and keeping push payloads free of PII.
8. **S37** has no line items in the allocation. The backlog above is a proposal on the S35–S36 time-box model (11.4 committed).

Holiday-date sources:
- [Maha Shivaratri 2028: Wed 23 Feb (dekhopanchang)](https://dekhopanchang.com/en/festivals/maha-shivaratri/2028)
- [Drik Panchang 2028 calendar](https://www.drikpanchang.com/calendars/indian/indiancalendar.html?year=2028)
- [Holi 2027 (Divine Hindu)](https://www.divinehindu.in/blogs/news/holi-holika-dahan-2027-date-muhurat-significance)
- [Holi 2027 (Samvat)](https://samvat.in/festivals/holi-2027/)

### Critical Files for Implementation
- C:/Users/pc/Desktop/sanchay/docs/superpowers/plans/2027-03-15-plan-12-lumpsum-submit-and-www-staging.md (to create; first of the S12–S37 sub-plans, same pattern through plan-37)
- C:/Users/pc/Desktop/sanchay/docs/superpowers/plans/2028-01-17-plan-34-remediation-real-money-go-no-go.md (to create)
- C:/Users/pc/Desktop/sanchay/docs/superpowers/plans/2028-02-14-plan-36-stabilise-and-launch.md (to create; needs the 02-18 STP/SWP deadline fix)
- C:/Users/pc/Desktop/sanchay/docs/superpowers/plans/2028-02-28-plan-37-hypercare.md (to create)
- C:/Users/pc/Desktop/sanchay/docs/capacity.md (to create; leave rule, holiday-deadline rule, factor 1.0 in S34–S37)
