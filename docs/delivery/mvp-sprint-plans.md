<!-- source: workflow wf_0a226252-0e5 labels mvp-sprints + plan01-delta section 2 | exported 2026-09-28 -->

> **Task ids (R-04):** this document now uses the **new Plan-01 ids** (delta sheet §2), which are authoritative everywhere; an old id appears only as "(was Bxx)". The mapping is below. The design tactics once called T6/T7 are **LOOKUP-ADOPT** and **SHORTFALL-BREAK**, so they cannot be confused with trims T6/T7.
>
> **Amended 2026-09-28 by the controller rulings R-01..R-23 (`docs/delivery/rulings.md`).** Where this text and a ruling differ, the ruling wins. **Amended 2026-10-05 by the owner decisions R-31..R-34.**

## 2. Mapping old → new

- **Part A:** A1→A1, A2→A2, A3→A3, A4→A4, A5→A5, A6→A6, A7→A7, A8→A8, **A9+A10→A9**, A11→A10, A12→A11, A13→A12.
- **Part B:** B1→B1, B2→B2, B3→B3, B4→B4, B5→B5, B6→B6, **B7+B8→B7**, B9→B8, B10→B9, B11→B10, B12→B11, B13→B12, B14→B13, B15→B14, B16→B15, B17→B16, **B18→DROPPED**, B19→B17, B20→B18, **B21+B22(logout, revoke-all)→B19**, B23→B20, B24→B21, B25→B22, B26→B23.
- **Part C:** C1..C15 keep their numbers.
- **Renumbering rule:** every chunk uses the new ids everywhere, including "Consumes (Bx)" citations. The first line of each task carries a one-line "(was Bxx)" note.



---

# Sanchay MVP delivery plan: closed real-money pilot, S1 to S4 and pilot week (Mon 2026-09-28 to Fri 2026-11-27)

This is a read-only planning deliverable. No files were created or changed.

**Method.** I used /sprint-planning. Estimates are ideal days at a human pace without AI help. Capacity is 2 devs × available days × 0.8 × AI factor, minus explicit overheads.

**Precedence.** The MVP spec is binding. Where the spec contradicts itself, section 0.2 records how I resolved it.

---

## 0. Capacity model

### 0.1 Capacity per developer

| Sprint | Dates | Weekday holidays and collective leave | Days per dev | Factor | Gross per dev (days × 0.8 × factor) | Overheads per dev (review 0.5 + sandbox/FakeFp upkeep 0.25) | Net per dev | Team net |
|---|---|---|---|---|---|---|---|---|
| S1 | Mon 09-28 → Fri 10-09 | Fri 10-02 Gandhi Jayanti | 9 of 10 | 1.2 | 8.64 | 0.75 | 7.89 | **15.8** |
| S2 | Mon 10-12 → Fri 10-23 | Tue 10-20 Dussehra | 9 of 10 | 1.6 | 11.52 | 0.75 | 10.77 | **21.5** |
| S3 | Mon 10-26 → Fri 11-06 | none | 10 of 10 | 1.6 | 12.80 | 0.75 | 12.05 | **24.1** |
| S4 | Mon 11-09 → Fri 11-20 | Mon 11-09 and Tue 11-10 Diwali leave (Diwali is Sun 11-08; 11-10 is also an NSE holiday) | 8 of 10 | 1.6 | 10.24 | 0.75 | 9.49 | **19.0** |
| Pilot week | Mon 11-23 → Fri 11-27 | Tue 11-24 Guru Nanak Jayanti | 4 of 5 | 1.0 (hardening; not planned against the factor) | 3.2 | none (all hardening) | 3.2 | 6.4 hardening |
| **Total S1–S4** | | | | | | | | **80.4** |

- **One capacity model (R-01).** This MVP basis (days × 0.8 × factor, minus the overheads above) **drops the roadmap's 0.75 focus factor and planned leave**; on the roadmap basis the assumed 1.6 factor is **≈ 2.1**.
- **Bottom-up demand: 86.4 ideal days against 80.4** (the honest Plan-01 cost is 24.9 d, delta sheet §7). R-08 `plans.cancel` (+1.0) is funded by T3 + T5; the R-18 screens add 0.75. **Break-even measured factor ≈ 1.75 (≈ 1.67 after T1–T6).** The plan does not fit at 1.6 without trims; T1–T6 alone do not close the gap at 1.35.
- The only other contingency is the 20% reserve inside the 0.8, plus the pilot week.
- **What the 20% reserve absorbs:**
  - meetings;
  - Dev A's help with business actions (SES, AWS, questionnaire, about 0.5 day per sprint in S1–S2);
  - unplanned personal leave (none is booked; any leave comes out of this reserve);
  - production support once the canary starts.

### 0.2 AI-factor assumption and how it is measured

- **Assumption.**
  - S1 uses 1.2, because environment setup dominates: Windows, pnpm 11, Expo 57 Gradle, Testcontainers on Docker Desktop.
  - S2 to S4 use 1.6. That sits between the roadmap's conservative 1.35 and the measured upside of 1.9.
- **What counts.** Each backlog item carries a human ideal-day estimate, frozen at planning. Only items that meet the Definition of Done count: merged locally, CI green, reviewed by the other developer, and demoed. Partly done work counts as 0.
- **Formula at the S1 demo (Fri 10-09):** measured factor f₁ = Σ(estimates of completed items + overhead actually spent) ÷ (person-days worked × 0.8).
- **Logged in `docs/delivery/velocity.md`** (created with the repo):
  - agent task count;
  - first-pass TDD green rate;
  - review hours per developer per day;
  - items reopened.
- **Decision on Fri 10-09 (R-02):** trims T1–T6 are pre-acknowledged by the owner (master-plan approval of 2026-09-25). If the S1 factor is short of the plan, apply them in spec §6 order at this checkpoint; no further acknowledgement is needed.

  | f₁ | Action |
  |---|---|
  | ≥ 1.2 | Hold the plan; T1–T6 stay pre-acknowledged for 10-23 |
  | < 1.2 | Apply T1–T6 now, in order; tell the owner that T7/T8 will be on the 10-23 agenda |

- **Formal re-baseline on Fri 10-23.** f₂ is S2 alone, the steady-state predictor, measured with the same formula. **T7 and T8 need an explicit owner decision at this meeting (R-02).**

  | Measured f₂ | Action |
  |---|---|
  | ≥ 1.75 | no trims beyond those already applied; consider E3 or E2 |
  | 1.67 to 1.75 | T1–T6 (already acknowledged) |
  | 1.45 to 1.67 | T1–T6, plus **T7** (owner decision): it defers the native Android app and breaks the owner's "web + Android" directive |
  | < 1.45 | T1–T7 plus **T8** (owner decision), or move GO-1 to 12-04 or 12-11 (the spec's NO-GO fallback) |

- **T7 is worth only about 2.0–2.5 days by 10-23.** C13/C14 are built in S2 before the decision, so deferring Android saves less than its old 4.0.

**Planning conflicts, now closed by the controller rulings:**

1. **S1/S2 content (R-03, R-04).** The delta sheet §7 and the Plans 02–04 outlines are the bottom-up source. S1 = all of Part A, B1–B12 (new ids), B5, B17, C1, C2, C4, C5 and the probes; the Plan-01 tail (B13–B23, C3, C6–C15) runs in S2 weeks 1–2, and login lands end to end on **Wed 10-21**.
2. **Probes.** All 1.5 probe days stay on Dev A in S1; P-07 and P-09 may finish by Fri 10-16 inside that budget (business PB-12).
3. **Milestones (R-03, R-24, R-31).** Fri 10-09: packages, API platform and OTP senders green under Testcontainers, contract/api-client conformance, CI ready for the first push, probe readout. Wed 10-21: login E2E on web + Android. Fri 10-23 (R-24, amended by R-31): ONB-01..07 on web + Android against FakeFp, the KRA pre-verification sandbox probe green, and catalogue data on the paused prod stack. Fri 11-06: full onboarding E2E (attest + FP provisioning, R-24) and lumpsum E2E. R-24 closed the open point on onboarding E2E; the S2 note lists what is still open.
4. **Trim numbering.** Spec §6 is authoritative and spec §1 now uses it: T1 www, T2 filters, T3 allocation list, T4 NAV chart, T5 units, T6 eNACH, T7 Android, T8 SIP.
5. **Capacity (R-01).** One model; see section 0.1. T1–T6 do not close the gap at 1.35.
6. **S4 load.** Catalogue polish is 0.5 so S4 fits at 19.0; `plans.cancel` is funded by T3 + T5 (R-08).
7. **DLT templates (R-10).** Four templates; the hash line is a DLT `{#var#}`; counsel signs the texts off before the 10-12 filing.
8. **Hostnames (R-31).** There is no dev domain, so `www.dev`, `app.dev` and `api.dev.sanchay.in` are dropped. The deployed hosts are `www`, `app` and `api.sanchay.in` on the paused prod stack (E25; ADR-0014); development runs on the local stack, and the `sanchay://` scheme stays for the non-production Android variant (H-1).
9. **SIP canary timing (R-06).** Tiered gate: GO-1 on 11-27 covers onboarding, lumpsum and redemption; GO-2 enables SIP after mandate APPROVED + plan ACTIVE + first-instalment date recorded, with the debit and allotment evidenced when they land.
10. **Runbooks.** G-E8 runbooks are due Mon 11-23, and S4 has no capacity for them. Every sprint's Definition of Done therefore includes a runbook stub for each new job or failure mode. The pilot week consolidates them.
11. **The E25 stack (R-05, R-31).** Protected in S2 (Dev A, week 2, ≈ 12 h), funded by taking E18 [T2] and E19 [T4] out of the committed S3 load. R-31: there is no AWS dev environment; E25 deploys `SanchayMvpStack-prod`, paused until GO-1, and F1 hardens it in S4. R-05's fixed-hostname tunnel fallback for sandbox webhooks and payment returns is open (see the S2 note).

---

## Sprint Plan: S1 — Foundation packages, API platform and OTP senders (Plan 01, lean)
**Dates:** Mon 2026-09-28 — Fri 2026-10-09 | **Team:** 2 engineers + AI agents
**Sprint Goal (R-03):** the money/validation/domain packages, the API platform and the OTP senders (with the four R-10 DLT templates) are green under Testcontainers; the contract and api-client conformance tests are green; CI is ready for the first push; and the probe readout is in. Login end to end follows on Wed 10-21.

### Capacity
| Person | Available Days | Allocation | Notes |
|---|---|---|---|
| Dev A (backend-leaning) | 9 of 10 | 8.64 gross − review 0.5 − FakeFp/sandbox 0.5 − probes 1.5 = **6.14** | Fri 10-02 holiday. Sandbox access for the probes. Supports the questionnaire. |
| Dev B (client-leaning) | 9 of 10 | 8.64 gross − review 0.5 = **8.14** | Fri 10-02 holiday. Android emulator and a low-end phone. subst S: for Gradle long paths. |
| Review + sandbox upkeep | — | 1.5 (explicit) | Every agent-produced PR is reviewed by the other developer. |
| **Total** | **18** | **15.8 net ideal days** (14.3 for Plan 01 after the probes) | Factor 1.2 |

### Sprint Backlog (new Plan-01 ids; delta sheet §7)
| Priority | Item | Estimate (ideal days) | Owner | Dependencies |
|---|---|---|---|---|
| P0 | A1 repo bootstrap (pnpm 11 workspace, H-16 keys, ADR-0001, R-23 toolchain), A2 config/Biome/lefthook/gitleaks | 1.13 | Dev B | none |
| P0 | A3–A8 `@sanchay/money` (Dec core, Money, Units/Nav, formatting, XIRR display, largest remainder) | 2.13 | Dev B | A2 |
| P0 | A9 (was A9+A10) validation schemas; A10 (was A11) amount and wire schemas; A11 (was A12) domain enums (H-4, H-12, H-15) | 1.25 | Dev B | A3 |
| P0 | A12 (was A13) CI with `check-brand` (R-19 allowlist), gitleaks, audit. CI runs locally until the push is authorised. | 0.63 | Dev B | A8, A10, A11 |
| P0 | B5 `@sanchay/contract` (ERROR_CATALOGUE per H-10, OpenAPI generator); B17 (was B19) lean `auth` and `me` procedures (H-5 shapes) | 0.94 | Dev B | B5←A9/A11/B1; B17←B5/B10 |
| P0 | C1 tokens, C2 api-client errors and conformance; C4 UI batch 1, C5 form inputs | 1.88 | Dev B | C1←A2/A3; C2←B17 |
| P0 | B1 api scaffold, B2 env and boot guards (invariants 1–7; 7 = retriever hash, R-10), B3 KeyService `local\|secrets` + AES-GCM + blind index, B4 pino PII redaction, B6 compose (PG 18, Mailpit), Drizzle and Testcontainers | 2.44 | Dev A | A2 |
| P0 | B7 (was B7+B8) identity schema and grants; B8 (was B9) error envelope; B9 (was B10) Fastify/CLS/oRPC bootstrap and `/health` | 2.0 | Dev A | B6, A11, B5 |
| P0 | B10 (was B11) OpenAPI drift; B11 (was B12) AuditService; B12 (was B13) SMS/email ports, fakes and the four DLT templates (R-10) | 1.06 | Dev A | B9, B7 |
| P0 | FP probes P-04 (no auto-filled EUIN), P-05 (ARN visible), P-07, P-09 and the lumpsum-flow check (all 1.5 days here; P-07/P-09 may finish by 10-16); evidence in `docs/probes/` | 1.5 | Dev A | Sandbox tenant (FP + POA audiences) |
| P2 | Stretch: B13 (was B14) `OtpService.issue` if Dev A's 0.64 d environment buffer is unused | (0.88, not counted) | Dev A | B3, B7, B8, B12 |
| — | Business, outside dev capacity: **domain check and registration before the Cybrilla letter (Mon 09-28, R-22)**, questionnaire + Cybrilla production request (Mon 09-28), counsel (Thu 10-01), four SMS texts signed by counsel (Thu 10-08), MSG91 + DLT PE/header, AWS accounts, D-U-N-S | — | PO | section 3 |

### Planned Capacity: 15.8 net | Sprint Load: 14.94 (Plan 01 13.44 = Dev A 5.5 + Dev B 7.94; probes 1.5) with a 0.84-day environment reserve (review 1.5 is already deducted)

### Risks
| Risk | Impact | Mitigation |
|---|---|---|
| Windows toolchain friction (pnpm 11 `allowBuilds`, Expo 57 Gradle long paths, Docker Desktop for Testcontainers) | Factor below 1.2; the Android shell slips | Day 1 environment checklist; subst S:; EAS cloud build as fallback; pair on the first Gradle build |
| Sandbox credentials late | P-04/P-05 miss 10-09 (G-B8 sandbox) | PO escalates on Tue 09-29; probes slide to S2 week 1 inside the 0.75 in S2 |
| Universal RNW + Expo layout issues | C11/C14 slip (S2) | Keep only 4 primitives; StyleSheet + tokens (ADR-0002); defer polish |
| First push not authorised by 10-09 | CI unproven on GitHub | CI runs locally (`pnpm turbo run lint typecheck test build`); the owner is asked at the demo |
| Plan-01 spillover beyond the S1 budget | S2 kernel squeezed | The 0.84-day reserve absorbs it first; everything else follows the f₁ rule and the 10-09 trim decision (R-02) |

### Definition of Done
- [ ] TDD: unit tests, plus integration tests on Testcontainers PG 18. Tests are green locally with `pnpm turbo run lint typecheck test`.
- [ ] Reviewed and merged by the other developer, including all agent code. Biome, typecheck, `check-brand` and gitleaks are clean.
- [ ] OpenAPI is regenerated with no drift. Every emitted error code has `messageForError` copy.
- [ ] No OTP bypass or master code. The prod boot guard refuses capture/Mailpit providers and a missing retriever hash (invariant 7). Logs show no PII (masked mobile only).
- [ ] Demo: packages, API platform and OTP senders green under Testcontainers (Mailpit shows the four DLT bodies); contract/api-client conformance green; probe readout.
- [ ] Velocity sheet updated. Runbook stub for OTP send failure.
- [ ] Product sign-off (PO).

### Key Dates
| Date | Event |
|---|---|
| Mon 09-28 | Sprint planning. Domain checked and registered, then questionnaire and production request sent (R-22, G-B1). |
| Fri 10-02 | Holiday |
| Mon 10-05 | Mid-sprint check-in (burn-up versus f₁) |
| Thu 10-08 | Plan-02 drafted. Counsel/CO sign-off of the four SMS texts (PB-32a). |
| Fri 10-09 | Demo (R-03 milestone), f₁ measured, **T1–T6 applied if the factor is short (R-02)**, retro, owner authorises the first push (G-B2) |

---

## Sprint Plan: S2 — Plan-01 tail (login E2E), money kernel, catalogue data, the paused prod stack
**Dates:** Mon 2026-10-12 — Fri 2026-10-23 | **Team:** 2 engineers + AI agents
**Sprint Goal (R-03, R-05, R-31):** login works end to end on web and Android against the local API by **Wed 10-21**; the kernel (idempotency, worker, FP gateway) is green under Testcontainers; E25's `SanchayMvpStack-prod` is up by Fri 10-23 on `www`, `app` and `api.sanchay.in`, paused until GO-1, with D9's NAV syncs running on it.

> **Closed by R-24, amended by R-31.** The 10-23 milestone is ONB-01..07 on web + Android against FakeFp, the KRA pre-verification sandbox probe green, and catalogue data on the paused prod stack; full onboarding E2E (attest + FP provisioning) moves to 11-06 with lumpsum. **Open for the owner:** (1) this backlog builds the ONB screens (E12) and D4's stateful FakeFp in S3, not S2; (2) ~~by 10-23 the paused prod stack's catalogue data is D9's NAV syncs only~~ **settled by R-40 (2026-10-07):** the owner accepts that the paused prod stack holds D9's NAV syncs only on 10-23; the reference tables arrive with F1 (S4), the FP scheme flags after the production credentials (R-21), and the curated list and NAV history before GO-1 (R-33); (3) R-05 protected E25 for a public host for FP sandbox webhooks, payment returns and the 10-23 sandbox callback URLs for Cybrilla, but E25's prod config runs FP in production mode and the tunnel fallback has no dev domain, so S3's sandbox E2E (E20/E21) has no inbound host yet.

### Capacity
| Person | Available Days | Allocation | Notes |
|---|---|---|---|
| Dev A | 9 of 10 | 10.77 net | Tue 10-20 Dussehra. SES and AWS support. |
| Dev B | 9 of 10 | 10.77 net | Tue 10-20 Dussehra |
| Review + FakeFp/sandbox upkeep | — | 1.5 | |
| **Total** | **18** | **21.5** | Factor 1.6 |

### Sprint Backlog (new Plan-01 ids; delta sheet §7 and outlines Plan 02)
| Priority | Item | Estimate | Owner | Dependencies |
|---|---|---|---|---|
| P0 | Plan-01 tail (API), week 1: B13 (was B14) `OtpService.issue` (R-14 HMAC, D-17 5 s timeout), B14 (was B15) verify, B15 (was B16) accounts and devices, B16 (was B17) sessions, B18 (was B20) guards, cookies and the R-11 `InfraRoute` exemptions, B19 (was B21+B22) login/logout/revoke-all, B20 (was B23) email verify, B21 (was B24) throttler, B22 (was B25) typed error round-trip, B23 (was B26) runnable locally | 5.5 | Dev A | S1 B-lane |
| P0 | Plan 02 D1 idempotency interceptor + `app_config`/`RuntimeConfig` + recon_breaks; D2 pg-boss worker with an explicit policy per queue (R-32), heartbeats, cleanup (LOGIN and VERIFY_EMAIL rows only, R-13), liveness `/health` (R-12); D3 FpGateway base (last 2 h slip to S3) | 3.75 | Dev A | B23 |
| P0 | **CDK `SanchayMvpStack-prod`, deployed paused (outline E25, protected by R-05; R-31), week 2:** VPC, NAT EIP, ALB with TLS 1.3 and the R-11 listener rules, one ECS service with 3 containers, RDS PG 18 (`sslmode=verify-full`, R-15), S3, Secrets, one container log group `/sanchay/prod/app` and ECR `sanchay-prod-api` and `sanchay-prod-web`, all retained except on create (R-34), ECS Exec, GitHub OIDC; ALB health check on `/api/v1/health`. Closed to investors until GO-1: invite-only, `orders.enabled` and `plans.sip.enabled` false. | 1.5 | Dev A | AWS prod account with the `sanchay.in` hosted zone (R-31) |
| P0 | Plan-01 tail (clients), weeks 1–2: C3 transports, C6 app-core copy (legal entity from `packages/domain/src/legal-entity.ts`, R-19), C7 `useOtpLogin`, C8 Login/Welcome, C9 Home shell with 4 tabs, C10 web routing, C11 wiring + shell smoke, C12 web e2e + CI job, C13 mobile libraries, C14 Expo wiring, C15 Maestro (local; first trim candidate) | 6.0 | Dev B | S1 lanes, B23 |
| P0 | Plan 02 D5 domain states + `canTransition` + `gen:states`; D6 MSG91 (DLT, four template ids) and SES adapters + `Notify`; D7 pilot invite gate | 2.25 | Dev B | A11, B12, B19 |
| P0 | Plan 02 D8 catalogue schema and seeds; D9 AMFI NAVAll port + `nav.sync.daily` + backfill; D10 `catalogue.fp.sync` + `catalogue.categories` + basic `listSchemes` | 2.5 | Dev B | D2, D3 |
| — | Moved to S3 week 1 because of E25: D4 FakeFp + smoke harness (10 h) and the last 2 h of D3 | (1.5) | Dev A | — |
| P2 | Stretch: E3 session list and revoke-one | (0.5) | Dev A | B19 |

### Planned Capacity: 21.5 | Sprint Load: 21.5 (Dev A 10.75 / Dev B 10.75)

### Risks
| Risk | Impact | Mitigation |
|---|---|---|
| DLT templates not approved by 10-23 | No real SMS on the paused prod stack | Hash line registered as `{#var#}` (R-10); the demo falls back to the local stack; capture mode stays forbidden in prod |
| AWS accounts or domain late | E25's prod deploy slips | Domain on Mon 09-28 (R-22), AWS accounts 10-09, the hosted zone in the prod account before E25 (R-31); CDK synth and tests run offline; development continues on the local stack |
| FP sandbox flakiness or unknown fields | FakeFp drifts from reality | Contract smoke runs daily once D4 lands; lossless-json; unknown fields logged, never guessed |
| Dev A overloaded (Plan-01 tail + kernel + CDK) | Kernel is the critical path | D4 moves to S3 week 1; Dev B owns states, adapters, invite gate and catalogue |
| Dussehra, plus the re-baseline landing on the last day | Decisions rushed | Velocity data frozen Thu 10-22; the **owner** decides T7/T8 on 10-23 (R-02) |

### Definition of Done
- [ ] The S1 checklist, plus: every [K] mutation has an idempotency replay test.
- [ ] No provider call inside a DB transaction (lint/test guard); OTP senders are the accepted D-17 exception with a 5 s timeout (R-07).
- [ ] R-11 exemption tests green (health, webhook and return stand-ins skip ClientGuard, SessionGuard and the throttler).
- [ ] E25's prod stack deployed and paused (R-31): the first deploy by hand per ADR-0014, later deploys through `deploy.yml` (GitHub OIDC, environment `prod`). `migrate` runs as a one-off task. Secrets are only in Secrets Manager.
- [ ] Demo: login E2E (web + Android) against the local API (Wed 10-21); `www`, `app` and `api.sanchay.in` answering on the paused prod stack, with D9's NAV syncs running there (R-24 as amended by R-31); KRA pre-verification probe green.
- [ ] Runbook stubs: worker down, NAV sync failure.
- [ ] Product sign-off.

### Key Dates
| Date | Event |
|---|---|
| Mon 10-12 | Planning. The four DLT templates submitted (G-B4, R-10). |
| Fri 10-16 | Mid-sprint check-in. First written Cybrilla answers due (G-B6). P-07/P-09 finished. |
| Tue 10-20 | Dussehra |
| **Wed 10-21** | **Login end to end on web + Android (R-03)** |
| Thu 10-22 | Plan-03 drafted; velocity data frozen |
| Fri 10-23 | Demo (R-24 milestone, amended by R-31); **re-baseline; owner decision on T7/T8 (R-02)**; DLT approved; SES production access; the NAT EIP and the prod webhook URL to Cybrilla after E25's deploy (ADR-0014); the sandbox callback URLs are open (R-05, see the S2 note); legal drafts and `regulatory-sources.md` due |

---

## Sprint Plan: S3 — Consent engine, existing-KYC onboarding, catalogue, lumpsum
**Dates:** Mon 2026-10-26 — Fri 2026-11-06 | **Team:** 2 engineers + AI agents
**Sprint Goal:** A KRA-verified investor onboards end to end in the FP sandbox, browses the curated catalogue, and completes a consent-first lumpsum (UPI and netbanking) with payment return on both web and Android.

### Capacity
| Person | Available Days | Allocation | Notes |
|---|---|---|---|
| Dev A | 10 of 10 | 12.05 net | Consent and sagas are on the zero-float path |
| Dev B | 10 of 10 | 12.05 net | Takes onboarding backend pieces and all client work |
| Review + FakeFp/sandbox upkeep | — | 1.5 | Money-heavy sprint; the review line is protected |
| **Total** | **20** | **24.1** | Factor 1.6 |

### Sprint Backlog
| Priority | Item | Estimate | Owner | Dependencies |
|---|---|---|---|---|
| P0 | Carried from S2 (R-05): Plan 02 D4 FakeFp (stateful) + sandbox contract-smoke harness, and the last 2 h of D3 | 1.5 | Dev A | D3 |
| P0 | Outline E1 FP webhooks (`@InfraRoute('API_HOST')`, raw body, signature, dedupe) and the E21 payment-return route on the same decorator (R-11) | 1.0 | Dev A | D2, B18 |
| P0 | Outline E2 HostGuard reading `INFRA_ROUTE` (R-11), ALB client IP, `meta.appConfig` and 426; readiness never checks NAV age (R-12) | 0.5 | Dev B | B18 |
| P0 | Onboarding screens batch 1 (outline E12): AUTH-04/05 email OTP, ONB-00 hub, ONB-01/02, ONB-05, ONB-06, ONB-07 | 3.25 | Dev B | E5, E6 |
| P0 | Consent engine: challenges/records/subjects; `sanchay.consent.v2` JCS snapshot with DB recompute + `timingSafeEqual` + property test on PG 18; sendOtp (CONSENT, H-3/H-6, the three consent DLT templates of R-10); approve transaction (D-MONEY-004) copying delivery evidence into `consent_records` (R-13); `useConsumed`; `trg_consent_guard`; `consents.cancel` with [K] (R-20); sweep and abandon jobs; lean resolver (H-21) | 4.5 | Dev A | kernel, OTP |
| P0 | Identity + KRA pre-verification (`submitIdentity`, `onboarding.preverify`, only `verified` proceeds); `putProfile` (PEP → BLOCKED, FATCA → REFUSE) | 1.5 | Dev A | FpGateway (POA) |
| P0 | Bank + penny drop + Jaro-Winkler ≥ 80, `ref_ifsc` seed, `bank.verify.poll` | 1.25 | Dev A | preverify |
| P0 | Attest (ONBOARDING_ATTEST, SMS + email; template `SANCHAY_ATTEST_OTP_V1`); `onboarding.provision` resumable saga (list-and-match, `old_id`); **re-attest path with adoption of existing FP ids (R-17)**; readiness trigger; FakeFp provisioning objects | 2.05 | Dev A | consent, bank, nomination |
| P0 | Lumpsum backend: `createPurchase`; submit/advance per **H-2 custom checkout**; `payment_attempts`; `/pg/return/{ref}` 303 (H-1); `payments.poll`; event handlers; RECONCILING + LOOKUP-ADOPT; UNDER_REVIEW + saga expired → CONSENT_EXPIRED test (R-17); audit_events assertions (R-20); order emails | 2.75 | Dev A | consent, FpTransact |
| P0 | Onboarding backend: `onboarding.get` + `deriveOnboardingStage`; nomination (max 3, H-12 split, Annexure-B); risk profile (GAP-03 v1.0.0 seed, scoring, 24-month expiry) + suitability scoring; declarations + legal docs seed | 2.75 | Dev B | legal texts (drafts) |
| P0 | Onboarding screens batch 2: ONB-08/09, 12/13/14, 21/22, 15, 16 + CNF-01, 17/19/20; **`legal.pending` banner and re-accept sheet (R-18, ≈ 2 h)** | 2.4 | Dev B | backend above |
| P0 | FundFactsProvider (ADMIN > CYBRILLA > AMFI), facts/catalogue CSV CLIs, publish gate R1–R7 | 0.8 | Dev B | catalogue data |
| P0 | `catalogue.returns.compute` (1Y/3Y/5Y) | 0.35 | Dev B | nav_history |
| P0 | Catalogue API core (list q/category, getScheme, amcs, commissionRates) + www static legal/commission/grievance pages | 0.5 | Dev B | facts |
| P0 | Explore browse/search + Fund page (facts, returns table, DSC disclosures, regular-plan notice, commission line) | 0.5 | Dev B | API core |
| — [T2] | Explore filters (riskometer, AMC, min SIP) + user sorts with DSC-26 (outline E18). **Not committed: funds the protected E25 stack (R-05; the paused prod stack, R-31)**; built only as an extension if f₂ allows. | (0.75) | Dev B | API core |
| — [T4] | NAV chart + `navHistory` (outline E19). **Not committed (R-05)**; extension only. | (1.0) | Dev B | nav_history |
| P0 | `quotePurchase` + cut-off engine + stamp duty + suitability hook | 0.75 | Dev B | domain |
| P0 | INV-01/02, CNF-01/02/03 screens (payment method chosen before consent) | 1.0 | Dev B | consent API |
| P0 | PAY-01, web `/r/[kind]`, Android `openAuthSessionAsync` return (`sanchay://` in dev), result screen, ORD-01/02, `orders.list/get/cancel`; **SYS-01 update screen with the api-client 426 interceptor (R-18, ≈ 2 h)** | 1.75 | Dev B | lumpsum backend |
| P2 | Stretch: E2 name-match 60–79 manual path | (0.75) | Dev A | bank |

### Planned Capacity: 24.1 | Sprint Load: over capacity at f = 1.6 (outlines §0.3: ≈ 41 h before these carries). The overflow carries into S4 in the outlines' Plan 03 order; the lumpsum UI (E23/E24) and the E21 remainder are protected ahead of E13 polish and E17 so that the 11-06 lumpsum milestone holds (R-03), or an API-driven lumpsum demo is agreed with Cybrilla.

### Risks
| Risk | Impact | Mitigation |
|---|---|---|
| Consent engine is larger than 4.5 (snapshot canonicalisation, JCS on PG 18) | Onboarding attest and lumpsum both slip | Built first in the sprint; golden hash vectors; the Plan 03 overflow order is the release valve (T2/T4 are already out of the committed load) |
| H-2 lumpsum behaviour in the sandbox differs (review timing, `token_url`) | Saga rework | S2 probe result; RECONCILING catches unknowns; no retry on the same order |
| Android Custom Tabs does not hand the return back to the app | Payment return UX breaks | "Open Sanchay" button on web `/r/[kind]`; poll on resume |
| Legal texts still drafts | Seeds use placeholders | Seeds carry version + sha; the counsel-approved swap on 11-13 is a data change only |
| FP 4xx during provisioning | Investors stuck | FAILED + ops alert; `v_onboarding_blocked` view; runbook |

### Definition of Done
- [ ] Previous DoD items, plus a **consent-first test**: zero FP class P/M writes before CONSUMED, for onboarding and lumpsum. Tamper test → `CONSENT_MISMATCH` with no FP call.
- [ ] BOLA test (foreign id → 404) on every new investor endpoint.
- [ ] Golden vectors: cut-off matrix, stamp duty, suitability RP-001..012, nomination split, name match.
- [ ] Sandbox contract smoke green for onboarding and lumpsum.
- [ ] Demo in the FP sandbox: founder PAN onboarding plus UPI and netbanking lumpsum, on web and Android.
- [ ] Runbook stubs: stuck RECONCILING, provisioning FAILED, payment not completed.

### Key Dates
| Date | Event |
|---|---|
| Mon 10-26 | Planning |
| Fri 10-30 | Mid-sprint check-in; Play Console verified (G-B9, R-21) and risk questionnaire sign-off (G-C2) due |
| Thu 11-05 | Plan-04 drafted |
| Fri 11-06 | Demo; **lumpsum E2E in the sandbox (R-03)**; **Cybrilla product demo part 1 (sandbox)**; Play app and signing key ready (SMS hash, R-21); curated list v1 + fund facts + commission lines (G-B10); S4 planning in the afternoon |

---

## Sprint Plan: S4 — SIP and mandates, portfolio, redemption, production
**Dates:** Mon 2026-11-09 — Fri 2026-11-20 (working days Wed 11-11 → Fri 11-20) | **Team:** 2 engineers + AI agents
**Sprint Goal:** SIP (UPI Autopay, plus eNACH if not trimmed), the dashboard/holdings and redemption work in the sandbox; the production stack is live for the founders' canary; and the Android pilot build is on Play internal testing, all by the 11-20 feature freeze.

### Capacity
| Person | Available Days | Allocation | Notes |
|---|---|---|---|
| Dev A | 8 of 10 | 9.49 net | Diwali leave 11-09/10. Prod stack first. Canary support from 11-17. |
| Dev B | 8 of 10 | 9.49 net | Diwali leave 11-09/10 |
| Review + FakeFp/sandbox upkeep | — | 1.5 | |
| **Total** | **16** | **19.0** | Factor 1.6 |

### Sprint Backlog
| Priority | Item | Estimate | Owner | Dependencies |
|---|---|---|---|---|
| P0 | F1 hardens E25's paused prod stack by Fri 11-13 (R-31): D6 logins, ops task, alarms routed to both developers (G-E5); every metric filter proven with `aws logs test-metric-filter`, a data-protection policy masking PAN and Indian mobile numbers, and all ten alarms triggered before GO-1 (R-34); NAV history backfill and the curated list (`--pilot-list`) run on prod through the ops task before GO-1 (R-33) | 1.0 | Dev A | prod account, prod credentials |
| P0 | SIP + mandate backend (UPI Autopay ₹1,00,000): `createSip`, mandate reuse/headroom, `mandates.submit/poll`, `emandate/auth` return, `plans.sip.submit`, `instalments.sync`, MANDATE_REVOKED email | 2.25 | Dev A | consent, H-1 returns |
| P1 [T6] | eNACH rail + limit ladder in the backend | 0.75 | Dev A | above |
| P0 | Ledger `applyAllotment/applyExit` (FIFO), folio upsert, `folio.sync`, `orders.units.reconcile` | 1.5 | Dev A | lumpsum |
| P0 | Redemption backend (AMOUNT, ALL): quote on the FP holdings snapshot (RedemptionAvailability port, buffer, ELSS strict; R-09), reservation under advisory lock, submit with the live MISMATCH/ALL/AMOUNT re-check (failure → REJECTED before any M write), `payout.watch` | 2.0 | Dev A | ledger |
| — [T5] | Redeem by UNITS (only if P-09 passes; otherwise escalate to the PO under PO-2). **Not committed: funds `plans.cancel` (R-08).** | (0.25) | Dev A | P-09 |
| P0 | Lean recon: `fp.reconcile.nonfinal`, `recon.fp.daily`, M1/M3/M4 invariants, `ops:kill-switch` and `ops:sync` CLIs (run with `SANCHAY_APP_ROLE=ops` via `aws ecs run-task --overrides`, R-16) | 1.5 | Dev A | sagas |
| P0 | **Investor `plans.cancel` (R-08):** SIP_CANCELLATION challenge through the existing consent engine (SMS OTP, `SANCHAY_CONSENT_OTP_V1`), FP plan cancel under `useConsumed`, status CANCELLED, audit row; SIPM-02 "Cancel SIP" action (outline F28). Funded by T3 + T5. | 1.0 | Dev A 0.75 / Dev B 0.25 | SIP backend, consent |
| P0 | Security suites: OTP abuse + HostGuard cross-host (Dev A); BOLA on every investor endpoint (Dev B) | 0.5 | A 0.25 / B 0.25 | all endpoints |
| P0 | `plans.quoteSip`, mandate ladder, first-instalment date | 0.5 | Dev B | domain |
| P0 | PortfolioQueries (summary, holdings, allocation), XIRR port V1–V7 + PO-5, `sipCounts` golden vectors | 1.5 | Dev B | ledger |
| P0 | SIP UI: SIP-01/02/03, MND-03, SIPM-01/02 read-only (UPI Autopay) | 1.5 | Dev B | SIP backend |
| P1 [T6] | eNACH UI | 0.5 | Dev B | above |
| P0 | HOME-01/02, PORT-01/02 holdings; allocation as a list | 1.75 | Dev B | queries |
| P0 | **AccountScreen v2 (R-18):** read-only profile, bank, nominees, risk profile, legal versions, support/grievance contact (outline F14) | 0.25 | Dev B | `me.get` |
| — [T3] | Allocation bar chart. **Not committed: funds `plans.cancel` (R-08).** | (0.25) | Dev B | above |
| P0 | RED-01/02 + CNF (amount / all; `SANCHAY_CONSENT_UNITS_OTP_V1` for "all"), payout status; quote reads the FP holdings snapshot (R-09) | 1.5 | Dev B | redemption backend |
| — [T5] | Units-mode UI. **Not committed: funds `plans.cancel` (R-08).** | (0.25) | Dev B | P-09 |
| P0 | Android internal build: local Gradle AAB → Play internal testing, App Links `assetlinks.json`, FLAG_SECURE, SMS hash taken from Play App Signing | 1.0 | Dev B | G-B9 |
| P1 | Catalogue polish (curated v1 import, empty/error states, a11y). **The curated v1 import stays: R-33 loads the list on prod before GO-1.** | 0.5 | Dev B | G-B10 |

### Planned Capacity: 19.0 | Sprint Load: 19.5 before the P1 drop (Dev A 10.0 / Dev B 9.5): `plans.cancel` costs 1.0 against the 0.75 freed by T3 + T5, and AccountScreen v2 adds 0.25. The P1 catalogue polish (0.5) is dropped first, which brings the load back to 19.0; R-33 keeps its curated v1 import, so only the polish part can go (open for the owner: the S4 load). The Plan 03 carry (outlines §0.3) comes on top. **R-39 (2026-10-07)** adds Plan 04 F29, the sandbox chain wiring (Dev A, ≈ 1.0 day, first in S4); the Fri 10-23 checkpoint weighs it with the rest of the S4 load (R-25).

### Risks
| Risk | Impact | Mitigation |
|---|---|---|
| Production credentials later than Fri 11-13 | Canary misses 11-17 | Escalate from 11-06; the latest acceptable date is **Mon 11-16** (R-21); later ⇒ GO-1 moves to 12-04 |
| SIP not deployed to prod by Wed 11-18 | Canary (b) slips | SIP is Dev A's first feature item; fallback registration Fri 11-20 or Mon 11-23, which only delays GO-2 (SIP); GO-1 (onboarding, lumpsum, redemption) is unaffected (R-06) |
| Only 3 working days before the prod milestone (Diwali) | Prod hardening late | E25 already deployed the prod stack, paused, in S2 (R-31), so F1 only hardens it; alarm test on Wed 11-18 |
| UPI Autopay approval latency or not enabled (OX-17) | SIP blocked | Written answer by 11-13; eNACH (unless T6 was taken); otherwise T8 with PO sign-off |
| Freeze pressure erodes the review line | Money bugs reach the canary | Review 1.5 days is non-negotiable; P1 items are dropped before review is cut |

### Definition of Done
- [ ] Previous DoD items, plus G-E1 consent-first suite green for SIP, mandate, SIP cancel (R-08) and redemption, including the `execute_before`-missed and review-fail-after-consume tests, and an `audit_events` assertion on every money task (R-20).
- [ ] G-E2 golden vectors green: XIRR, valuation null when unpriced, redemption availability, ELSS (29-Feb, month-end, holiday), NAV −3/0/+3%.
- [ ] G-E4 sandbox smoke: runs allowed from Mon 11-16; three runs on three days by Wed 11-25 (R-21).
- [ ] Prod deployed with orders behind the kill switch until the canary.
- [ ] Demo: SIP, dashboard and redemption in the sandbox on web and on the Play-installed Android build; prod canary (a) evidence.
- [ ] Runbook stubs: refund, payout delayed, UNITS_PENDING, kill switch.

### Key Dates
| Date | Event |
|---|---|
| Fri 11-06 (pm) | S4 planning |
| Mon 11-09 – Tue 11-10 | Diwali leave |
| Wed 11-11 | Work starts; F1 hardens the prod stack (R-31) |
| Fri 11-13 | **Prod stack hardened (up and paused since S2, R-31); production credentials (latest Mon 11-16, R-21); counsel approvals; all Cybrilla answers** |
| Mon 11-16 | Prod deploy; founders onboard in prod |
| Tue 11-17 | Canary (a): lumpsum by UPI and by netbanking |
| Wed 11-18 | **Cybrilla demo part 2 (SIP and redemption)**; alarm test (G-E5) |
| Wed 11-18 – Thu 11-19 | Canary (b): SIP registration (GO-2 evidence: mandate APPROVED + plan ACTIVE + first-instalment date recorded, R-06) |
| Fri 11-20 | **Feature freeze**; demo; OX-18 letter; invite list and caps |

---

## Sprint Plan: Pilot week — Canary, hardening and GO/NO-GO
**Dates:** Mon 2026-11-23 — Fri 2026-11-27 | **Team:** 2 engineers + AI agents
**Sprint Goal:** Every MUST item of the tiered real-money gate (R-06) is green with evidence: GO-1 (onboarding, lumpsum, redemption) on Fri 11-27, with the founders' canary reconciled against FP, the RTA and the bank; GO-2 (SIP) follows its canary evidence.

### Capacity
| Person | Available Days | Allocation | Notes |
|---|---|---|---|
| Dev A | 4 of 5 | 3.2 (factor 1.0, hardening only) | Tue 11-24 holiday. Owns the gate evidence. |
| Dev B | 4 of 5 | 3.2 | Cross-signs G-E3 |
| **Total** | **8** | **6.4** | No new features |

### Sprint Backlog
| Priority | Item | Estimate | Owner | Dependencies |
|---|---|---|---|---|
| P0 | Canary (c): partial redemption Mon 11-23; reconciliation report `docs/probes/canary-2026-11.md` (units to 0.001, ARN present, EUIN blank, bank debit and payout, a signed prod webhook) | 1.5 | A 1.0 / B 0.5 | canary (a) and (b) |
| P0 | G-E3: security checklist + remaining OTP-abuse/BOLA suites | 0.5 | Dev A | S4 suites |
| P0 | Passive ZAP baseline on the paused prod stack before GO-1 (R-31); cross-sign G-E3 | 0.5 | Dev B | prod |
| P0 | Gate evidence pack (G-E1/E2/E4/E5 links) | 0.5 | Dev A | CI |
| P0 | G-E8 runbooks consolidated (13); stubs exist from each sprint | 0.9 | Dev B | stubs |
| P0 | G-E6: `adb shell pm get-app-links in.sanchay.app`, screenshots | 0.25 | Dev B | Play build |
| P0 | Fix budget for canary and gate defects | 2.0 | A 1.2 / B 0.8 | — |
| P1 | Invitee dry run: `pilot_invites` seed (before GO-1 one founders' test account only; the PO's list only after the GO-1 decision, R-31), `app_config` caps, kill-switch drill | 0.25 | Dev B | G-B11 |

### Planned Capacity: 6.4 | Sprint Load: 6.4 (100%)

### Risks
| Risk | Impact | Mitigation |
|---|---|---|
| RTA/AMC statement lag (the ARN check needs the statement) | G-B8 prod not evidenced | Holdings report + CAS request on 11-18; AMC statement request |
| Payout lands after the holiday (liquid T+1 → Wed 11-25) | Reconciliation compressed | Redeem Mon 11-23 before cut-off; reconcile Thu 11-26 |
| A MUST item still red on 11-27 | NO-GO | Fallback: prod stays up with orders disabled; re-gate Fri 12-04 or Fri 12-11 |

### Definition of Done
- [ ] Every G-item has a linked evidence artefact.
- [ ] Prod holds D9's NAV history and the G-B10 curated list, each loaded through the ops one form (R-33).
- [ ] Zero open CRITICAL defects, zero RECONCILING items older than 2 h, and M1/M3/M4 green for 72 h.
- [ ] Both developers are on the on-call rota.
- [ ] Signed GO/NO-GO minute.

### Key Dates
| Date | Event |
|---|---|
| Mon 11-23 | Canary (c); runbooks; G-E6; G-B12 (grievance and incident contacts) |
| Tue 11-24 | Holiday |
| Wed 11-25 | G-E3 security checklist signed; G-E4 sandbox smoke evidence (3 runs on 3 days, R-21) |
| Thu 11-26 | Canary reconciled; ARN seen on the RTA/AMC view (G-B8 prod) |
| **Fri 11-27** | **GO-1 real-money GO/NO-GO: onboarding, lumpsum, redemption** (PO chairs; owner decides). **GO-2 (SIP)** is called once mandate APPROVED + plan ACTIVE + first-instalment date are recorded (R-06). |
| Mon 11-30 | If GO: invitees start (capped). If NO-GO: re-gate on 12-04 or 12-11. |

---

## 3. Business-action timeline

Owner roles:
- **PO:** founder / product owner.
- **Owner:** director.
- **Compliance:** Platizio principal officer for the ARN.
- **Counsel:** external counsel.

No due date falls on 10-02, 10-20, 11-09, 11-10 or 11-24.

| Due | Action | Owner | Evidence / gate |
|---|---|---|---|
| Mon 09-28 (first) | **Check `sanchay.in` availability and register it before the letter goes out (R-22)**; create the Route 53 hosted zone in the prod account before E25 deploys (R-31; PB-41) | PO / Dev A | G-B3 |
| Mon 09-28 | Send the revised Cybrilla questionnaire (hosts, `/api/v1/pg/return/`, `/api/v1/webhooks/fp`, `partner` omitted, `euin` null). If the domain registration is not complete, the URL table is marked "final by 09-30". Request production onboarding: ONDC signup with the ARN, POA agreement eSign, RTA mailback. Confirm sandbox FP + POA credentials. | PO | G-B1, G-B7 start |
| Mon 09-28 | Request a D-U-N-S number for Platizio (needed for the Play organisation account; lead time is the risk) | PO | G-B9 prerequisite |
| Wed 09-30 | Route 53 zone for `sanchay.in` (registered on 09-28); verify the SES domain identity; the letter's URL table is final | PO / Dev A | G-B3 |
| Wed 09-30 | MSG91 account; apply for DLT principal entity (Platizio) and sender header | PO | G-B4 |
| Thu 10-01 | Engage counsel: legal texts, OI-1/OX-05 opinion, OX-18 position | PO | G-C1, C3, C4 |
| Thu 10-01 | Confirm ARN valid-till (→ `SANCHAY_PLATFORM_ARN_VALID_TILL`) and the execution-only / blank-EUIN policy | Compliance | G-B8 |
| Fri 10-09 | AWS organisation and prod account (SCP ap-south-1; R-31: no AWS dev environment, so no nonprod account for the MVP), billing alarms | PO + Dev A | G-B3 |
| Fri 10-09 | DLT principal entity and header approved; P-04/P-05 sandbox results | PO / Dev A | G-B4, G-B8 (sandbox) |
| Fri 10-09 | Owner authorises the first push; private GitHub repo with branch protection | Owner | G-B2 |
| Thu 10-08 | CO/counsel sign-off of the four DLT SMS texts (PB-32a, R-10) | Compliance / Counsel | G-B4 |
| Mon 10-12 | File the **four** DLT templates `SANCHAY_LOGIN_OTP_V1`, `SANCHAY_CONSENT_OTP_V1`, `SANCHAY_CONSENT_UNITS_OTP_V1` and `SANCHAY_ATTEST_OTP_V1` with the exact H-6 text (hash line as `{#var#}`, WebOTP line last; R-10). Request SES production access. | PO / Dev A | G-B4, G-B5 |
| Fri 10-16 | First written Cybrilla answers (OX-01, 02, 04, 06, 10, 12, 13, 17, Q26, OX-18) | PO | G-B6 |
| Fri 10-23 | DLT templates approved; SES production + DKIM/SPF/DMARC `p=none` | PO / Dev A | G-B4, G-B5 |
| Fri 10-23 | Counsel drafts: T&C, DPDP privacy notice, execution-only (DSC-08), regular-plan/commission (DSC-03), DSC-02, Annexure-B, risk disclosure, SUITABILITY_WARNING, the TPL_* templates. `regulatory-sources.md` including OX-19. | Counsel / Dev A | G-C1 drafts, G-C5 |
| Fri 10-30 | Google Play organisation account verified; internal-testing track; Play App Signing. Fallback: signed APK through Firebase App Distribution. | PO | G-B9 |
| Fri 10-30 | Risk questionnaire v1.0.0 wording and bands signed off (OX-21) | Compliance | G-C2 |
| Fri 11-06 | Cybrilla product demo part 1 (sandbox); Play app and signing key ready, SMS hash recorded (R-21); curated list v1 (40–60 Regular-Growth ISINs) + fund-facts CSV (TER, riskometer, exit load, SID/KIM) + **commission rate lines per AMC** | PO / Ops / Dev B | G-B7, G-B9, G-B10 |
| Fri 11-13 | **Cybrilla production credentials** (FP + POA; **latest Mon 11-16**, later ⇒ GO-1 moves to 12-04, R-21) and NAT EIP allowlisted; all written answers filed in `docs/probes/`; counsel approvals signed with sha256; OI-1/OX-05 opinion; grievance policy and Investor Charter | PO / Counsel | G-B6, G-B7, G-C1, G-C3, G-C5 |
| Mon 11-16 | Founders onboard in production | PO + Devs | canary prerequisite |
| Tue 11-17 | Canary (a): lumpsum ₹500–1,000 into a liquid/debt fund, once by UPI and once by netbanking, before the 1:00 PM display cut-off | Founders + Devs | G-E7 |
| Wed 11-18 | Cybrilla demo part 2 (SIP and redemption) | PO + Devs | G-B7 |
| Wed 11-18 / Thu 11-19 | Canary (b): SIP registration via UPI Autopay, instalment day 25/26 in the canary scheme's `sip_dates`; GO-2 evidence = mandate APPROVED + plan ACTIVE + first-instalment date (R-06) | Founders + Devs | G-E7(b), GO-2 |
| Fri 11-20 | OX-18 pooling / payment-aggregator written position; pilot invite list, terms addendum, caps (₹1,00,000 per order, ₹2,00,000 per investor per day); fund list refresh; DMARC → `quarantine` | Counsel / PO | G-C4, G-B11 |
| Mon 11-23 | Canary (c): partial redemption. Support and grievance mailboxes, named grievance officer, incident contact, on-call rota, CERT-In 6 h contact. | PO / Devs | G-B12, G-E7 |
| Wed 11-25 | Lightweight security review: OWASP ASVS basics checklist, ZAP baseline, BOLA and OTP-abuse suites, gitleaks, `pnpm audit --prod` | Dev A, cross-signed by Dev B | G-E3 |
| Thu 11-26 | Canary reconciled against FP, the RTA (ARN present, EUIN blank) and the bank | Dev A + Dev B + PO | G-E7, G-B8 (prod) |
| **Fri 11-27** | **GO-1 GO/NO-GO** (onboarding, lumpsum, redemption); GO-2 (SIP) called once its canary evidence exists (R-06) | PO chairs; Owner decides | section 7 of the spec |
| Fri 12-18 | Book a CERT-In-empanelled pen-test vendor for phase 2 (P2-13); phase-2 re-baseline | PO | — |

---

## 4. Sub-plan files

All are under `C:/Users/pc/Desktop/sanchay/docs/superpowers/plans/` and are created when the repo exists. Each is drafted on the last 2 days of the previous sprint and follows `superpowers:writing-plans` (TDD tasks).

The Plan-01 file is `2026-09-28-plan-01-foundation.md` (the lean MVP plan with the delta sheet, amended by the rulings; see `docs/delivery/rulings.md` "Plan-01 amendments applied").

| File | Scope |
|---|---|
| `2026-09-28-plan-01-foundation.md` | S1 and the S2 Plan-01 tail. New ids: A1–A12, B1–B23, C1–C15 (old B18 step-up dropped; old B21+B22 lean merged into B19). Delta §3 DAG. H-4/H-12/H-15 enums, B3 `secrets` KeyService, B2 invariant 7 (R-10), B12 four DLT templates (R-10), B13 HMAC input (R-14) and D-17 5 s send timeout (R-07), B18 guards with the R-11 `InfraRoute` exemptions, C10 per H-1/H-7, C13/C14 env per H-8, A12 `check-brand` with the R-19 allowlist, C6 legal entity in `packages/domain/src/legal-entity.ts`. Exit: login on web and Android on Wed 10-21. |
| `2026-10-12-plan-02-mvp-kernel-fp-gateway-catalogue-data-dev-aws.md` | S2. Idempotency, pg-boss worker, FpGateway + FakeFp, MSG91/SES, invite gate, domain states, catalogue schema + FP sync + AMFI NAV, **CDK `SanchayMvpStack-prod`, deployed paused (protected, R-05; R-31; the file name keeps "dev-aws")**. (Webhooks, HostGuard and onboarding screens batch 1 are Plan 03.) |
| `2026-10-26-plan-03-mvp-consent-onboarding-catalogue-lumpsum.md` | S3. Consent engine (JCS v2, approve transaction, guard trigger, delivery evidence R-13), existing-KYC onboarding backend and screens through provisioning, readiness and re-attest (R-17), `legal.pending` UI and SYS-01 (R-18), FundFactsProvider/publish gate/returns/Explore/Fund page (T2/T4 not committed, R-05), lumpsum H-2 saga + payments + returns on web and Android, HostGuard reading the R-11 exemptions. |
| `2026-11-09-plan-04-mvp-sip-portfolio-redemption-prod.md` | S4 and the pilot week. SIP + mandates (T6 flagged), investor `plans.cancel` (R-08), ledger, PortfolioQueries + XIRR vectors, redemption on the FP holdings snapshot (R-09; T5 flagged), AccountScreen v2 (R-18), lean recon/invariants/ops CLIs (`SANCHAY_APP_ROLE=ops`, R-16), security suites, F1 prod-stack hardening (R-31, R-34), Android internal build + App Links, tiered-gate checklist (R-06; links to `docs/runbooks/*`, `docs/probes/canary-2026-11.md`). |

---

## 5. Phase-2 roadmap summary (full launch after the pilot)

**Starting point.**
- Mon 11-30 to Fri 12-04: pilot hypercare, and the re-gate if the 11-27 call is NO-GO.
- Phase-2 sprints follow the roadmap calendar from S5 (Mon 12-07). The re-baseline is on Fri 12-18 using measured MVP velocity (spec §8).

**Groups and order.** The order puts first what live pilot investors need most.

| Order | Group | Ideal days | Why this order |
|---|---|---|---|
| 1 | P2-5 SIP management (PO-6 amount change, pause, mandate recovery, Start today; the MVP already has `plans.cancel`, R-08) | 9 | Pilot investors cannot change or pause a SIP in the app |
| 2 | P2-1 admin app, maker-checker, admin OIDC | 15 | Replaces SQL and CLI ops on real money |
| 3 | P2-3 identity and changes (device key, new-device step-up, sessions UI, contact/bank/nominee changes with H-9 cooling-offs) | 10 | Security and self-service |
| 4 | P2-2 hardening (KMS envelope, CloudFront + WAF, Sentry, full CI) | 10 | Before any public exposure |
| 5 | P2-4 new KYC (DigiLocker, eSign; EXT E5) | 7 | Widens the eligible population |
| 6 | P2-7 full reconciliation | 8 | |
| 7 | P2-12 DPDP and audit | 6 | |
| 8 | P2-10 iOS and stores | 10 | |
| 9 | P2-6 switch / STP / SWP | 10 | |
| 10 | P2-8 tax and statements | 8 | |
| 11 | P2-9 CAS import | 9 | |
| 12 | P2-11 discovery (SEO fund pages) | 9 | |
| 13 | P2-13 pen-test remediation | 5 + vendor | |
| | **Total named in spec §8** | **116** | |

**Remaining work, estimated two ways.**
- **Top-down (the method the task asked for):**
  - The full-launch estimate is about 372 ideal days of feature and hardening work (roadmap §7).
  - MVP credit is about 79 days: 80.35 planned, minus the 0.5-day invite gate and minus 1.0 of single-service CDK that P2-2 replaces.
  - That leaves **about 293 ideal days**.
- **Bottom-up cross-check:**
  - The 116 days in §8, plus about 44 days of roadmap register items that §8 does not name, gives about 160 days.
  - The unnamed items are GAP-09 ops tooling 13.5, closure/DSR/`ops_cases` 7.5, corporate actions + detectors 5.5, DLV-09 staging/EAS/profile hub/KYC recheck/nomination change 8, GAP-11 2.75, GAP-03 admin/report 3.25, UI batch 3 2.0, folio maintenance 1.5.
- **The 133-day gap between the two is not explained.** At 12-18, map every roadmap item to MVP-done or a P2 group. Until then, P50/P80 use the 293 figure.

**Capacity basis.** From S5, per sprint:
- review 1.0 (2.0 from S7 in money-heavy sprints);
- FakeFp 0.5;
- **pilot production operations 1.0 (new, because real money is live)**;
- triage 1.0 from S18.

| Scenario | Basis | Build sprints | Time-boxed tail (beta, pen-test remediation, GO/NO-GO) | Launch |
|---|---|---|---|---|
| **P50** | 293 days at 0.8 × 1.6 (the MVP method with the planned factor) | S5 → S20 (about 16 sprints; items done Fri 2027-07-16) | S21–S23 | **Mon 2027-08-30** |
| **P80** | 293 days at the roadmap's conservative 0.6 × 1.35 + roadmap overheads + 1.0 pilot ops per sprint | S5 → S33 (about 29 sprints; items done Fri 2028-01-14) | S34–S36 | **Mon 2028-02-28** (unchanged from the roadmap P80) |
| Optimistic check | Bottom-up 160 days at 0.8 × 1.6 | S5 → S13 | S14–S15 | Mon 2027-05-10 |

**Reading the P80.** Going MVP-first does not pull in the conservative P80. The 1.0 day per sprint of live pilot operations over about 29 sprints roughly cancels the extra MVP output delivered over S0–S4. The gain is real-money evidence 15 months earlier.

**Levers** (roadmap §7, still untaken per PO-4):
- a third full-stack developer from P2-S1;
- CAS + STP/SWP as a fast-follow;
- non-regulatory GAP-09 tooling as a fast-follow.

Each is worth about 1 sprint or more at P80. The PO-8 escalation should be presented on 12-18 with measured MVP velocity rather than the S0 estimate.

---

### Critical Files for Implementation
- C:/Users/pc/Desktop/sanchay/docs/specs/mvp/MVP-SPEC.md (to create; this plan amends §0/§6 per section 0.2 here; also ADR-0013/0014/0015)
- C:/Users/pc/Desktop/sanchay/docs/superpowers/plans/ (plan-01..plan-04 above, to create)
- C:/Users/pc/AppData/Local/Temp/claude/C--Users-pc-Desktop-sanchay/2f00d411-382c-43a6-bd67-ecaf60c67db1/tasks/wk14xlx18.output (`result.planChunks` A1–C15 with H-20 amendments; `result.roadmapAllocation` §1 calendar and §7 P50/P80 basis; `result.interfaceSheet`)
- C:/Users/pc/AppData/Local/Temp/claude/C--Users-pc-Desktop-sanchay/2f00d411-382c-43a6-bd67-ecaf60c67db1/tasks/wsx2mey6n.output (`result.finalDesign` §C, §F, §G, §H)
- C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/src/main/java/com/platizio/wealthtech/service/XirrCalculator.java and service/RedemptionAvailability.java (read-only ports for the S4 golden vectors)
