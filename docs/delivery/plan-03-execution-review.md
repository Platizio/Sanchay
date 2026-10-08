# Plan 03 (Sprint 3, onboarding and catalogue) execution review (2026-10-08)

**Result.** Tasks Rd and E1-E17 of Plan 03 are implemented on `feat/plan-03-mvp-onboarding-lumpsum` (head `ce5adce`, range `fa9b4a6..HEAD`, 50 commits). Every task passed a lane review. Every wave merged with `pnpm verify`, `pnpm test:int`, `db:check` and `check-brand` green (last integration: int 396). E20-E24 (lumpsum) have not started. They wait for the owner's rulings R-a, R-b and R-c.

**How it ran.** Seven waves of parallel worktree lanes, the same way as Plan 02:

| Wave | Tasks |
|---|---|
| 1 | Rd, E1, E3, E14, E15, E16 |
| 2 | E2, E4, E17 |
| 3 | E5 |
| 4 | E6, E8, E9 |
| 5 | E7, E10, E12 |
| 6 | E11 |
| 7 | E13 |

Each task had an implementer, a reviewer and up to two fix rounds. An integrator merged each wave in order and stopped on red. The controller pushed after each wave. After wave 7 the owner ran a local walkthrough on 10-08 (WT-1 to WT-5) and a read-only FP sandbox probe (`docs/probes/fp-lookup-filters-2026-10-08.md`).

**Not run.** The onboarding Playwright smoke (`apps/web/e2e/onboarding.smoke.spec.ts`) has never passed. Nothing has run as `sanchay_app_login` yet (Plan 04 F1 does that).

## Rulings the controller made during the run

- Ruling: same architecture as Plan 02 (parallel worktree lanes per wave; review plus up to 2 fix rounds per task; the integrator merges in order and runs verify, test:int, db:check and check-brand; the controller pushes) — the owner asked for Plan 03 the same way — cost if wrong: none new.
- Ruling: E20-E24 wait for the owner's answers to R-a (late_auth, E21), R-b (duplicate source_ref_id, E20) and R-c (FpTransport edges, E20) — those are owner decisions on money behaviour — cost if wrong: the lumpsum tasks start later.
- Ruling: R-j and R-k (unanswered; proposed for PR #10) are not implemented without an answer — cost if wrong: they are done later.
- Ruling: lane implementers and reviewers on sonnet, the final review on opus (as Plan 02).
- Ruling: E11's lane note gates attest on `DeclarationsService.pending()` (current requirements), not on `declarations_status` DONE or raw staging rows — the E10 review showed the DONE flag survives a nomination flip — cost if wrong: none (stricter gate). The hub still reads the flag; see MF-7.
- Ruling (pre-flight): migration numbers follow the merge order. Plan 03 started at 0013, not at the header's assumed 0010. Next free number is 0026.

## Final review synthesis

Branch `feat/plan-03-mvp-onboarding-lumpsum` at `ce5adce`. This synthesis draws on four area reviews (kernel-consent, onboarding-core, onboarding-late, clients-catalogue), one verification pass, the deferred lines in `progress.md`, the whole of `lane-findings.md` and the 10-08 walkthrough. I re-checked the conflicting claims against the code.

### Checks I ran myself

- **LC-1 grant.** `consent-engine.ts:545-549` runs `UPDATE app.consent_records SET first_attempt_at`. `0015_legal_consent_grants.sql:3` revokes UPDATE from `sanchay_app`. No later migration grants it back. **Confirmed.**
- **WT-4 IFSC half.** `BankScreen.tsx` never calls `ref.ifsc`. `addBank` (`bank.service.ts:52`) stores the IFSC without a lookup. So `HDFC0000001` does not break the smoke. **Refuted.** The `'Stable'` radio half stands.
- **WT-2 scope.** `playwright.config.ts` starts the web app with `pnpm start` (`next start`), but `reuseExistingServer` is true outside CI. The walkthrough could have reused a `next dev` server. UI-4 reproduced the StrictMode portal loss in jsdom. I treat WT-2 as dev-only until a smoke run against `next start` shows otherwise.

### Duplicates I merged

| Kept as | Merged in |
|---|---|
| MF-3 (UI-1) | WT-1 |
| UI-4 | WT-2 |
| LC-5 | ONB-8 |
| RSK-1 | RISK-1 |
| MF-9 (UI-3) | PRV-5 |
| LC-3 | PRV-3 |
| LEG-1 | LC-4 |
| E2E-1 | WT-4 |
| E2E-2 | WT-5 |

### Disagreements I resolved

- **LEG-1 (should_fix) against LC-4 (defer).** Kept as should_fix. MF-8 now shows the document text, so the version the investor read matters. The fix is cheap and lives in the same lane as MF-8.
- **UI-3 (must_fix) against PRV-5 (should_fix).** Kept as must_fix. The investor answered truthfully, has spent the dual OTP, and has no UI path back on Android. The guard is cheap.
- **WT-2 (must_fix) against UI-4 (should_fix).** should_fix, with a verdict condition: the onboarding smoke must pass against `next start`. If a Select fails to open there, this becomes must_fix.
- **ONB-4 (PEP block).** should_fix for the lost audit trail. Whether an investor may correct their own PEP answer is an owner call.

### Refuted in verification

- WT-4: the IFSC `HDFC0000001` does not fail anything; no client or server IFSC lookup runs at the bank step.
- WT-2: "never renders on web" narrows to `next dev` (React StrictMode). Production is not shown to be affected (UI-4).
- LC-2: "the original text is lost". Git history and the ATTEST snapshot sha256 keep it recoverable.
- NOM-1 and NOM-2: a nominee name with special characters fails at RELATED_PARTIES, not at FOLIO_DEFAULTS, so it does not wedge provisioning by itself.
- PRV-4: the same-name double adoption does not happen on a first run; only a retry after a mid-loop crash shows it.
- WT-5 (E2E-2): no current spec sends a LOGIN SMS within 10 s of an ATTEST SMS.

---

### 1. must_fix

#### MF-1 (LC-1, E4): `useConsumed` updates a column `sanchay_app` may not update

- **Where:** `apps/api/src/modules/legal-consent/consent-engine.ts:545-549`; `apps/api/drizzle/0015_legal_consent_grants.sql:3`.
- **Failure:** today the API and the int tests connect as the master role, so nothing fails. Plan 04 F1 moves api and worker to `sanchay_app_login`. From then on, every `onboarding.provision` run fails with "permission denied for table consent_records" before any FP call. pg-boss retries until the run is marked FAILED. No pilot investor can finish onboarding, and every E20/F2 saga fails the same way. This is a latent pilot-gate blocker.
- **Fix:** a custom migration `GRANT UPDATE (first_attempt_at) ON app.consent_records TO sanchay_app;`. The column grant keeps every other column append-only.
- **Test:** in `legal-consent.int.test.ts`, under `SET LOCAL ROLE sanchay_app`, updating `first_attempt_at` succeeds and updating `channel` is still denied. In `consent-engine.int.test.ts`, run `useConsumed` on a connection after `SET ROLE sanchay_app`.

#### MF-2 (PRV-1, E11): provisioning adopts another investor's MF investment account

- **Where:** `apps/api/src/modules/onboarding/provision.job.ts:325`; `apps/api/src/integrations/fp/fp-provision.ts:40-47`; `apps/api/src/integrations/fp/fake/fake-fp.ts:128`.
- **Failure:** the 10-08 sandbox probe shows FP ignores `mf_investment_accounts?primary_investor=` and returns all 87 tenant accounts. The first pilot investor creates an account. Every later investor takes `[0]`, which is someone else's account. FOLIO_DEFAULTS then patches that account with this investor's bank, contacts and nominees, and every later order goes into it. FakeFp honours the filter, so the int tests stay green.
- **Fix:** query `primary_investor_pan=<PAN>` (the probe shows it filters). Keep only rows whose `primary_investor` equals this profile id. Add the same ownership check (`r.profile === profile`) to the phone, email, address, bank and related-party lookups. Make FakeFp ignore `primary_investor=` as FP does.
- **Test:** in `onboarding-provision.int.test.ts`, seed a foreign MF investment account first. Provisioning creates a new account and never adopts the foreign one.

#### MF-3 (UI-1 + WT-1, E12): the email OTP screens send no Idempotency-Key

- **Where:** `packages/features/src/auth/EmailOtpScreens.tsx:49` and `:69`; `apps/api/src/modules/identity/me.router.ts:22` and `:29`.
- **Failure:** both procedures require an Idempotency-Key. The api-client adds the header only from `context.idempotencyKey`. Every new investor, web or Android, gets 428 at "Send code". The hub gates every stage on `emailVerified`, so nobody can onboard through the UI.
- **Fix:** pass `{ context: { idempotencyKey: newIntentKey() } }` on both calls, using `newIntentKey` from `../common/intentKey`, with a fresh key per tap.
- **Test:** in `EmailOtpScreens.test.tsx`, both MSW handlers capture `idempotency-key`, assert a UUID, and assert a resend sends a different key.

#### MF-4 (ONB-3, E6): identity, profile and bank stay writable after attest and after provisioning

- **Where:** `apps/api/src/modules/onboarding/identity.service.ts:37`; `profile.service.ts:70`; `bank.service.ts:36`; `provision.job.ts:126-170`; `apps/api/drizzle/0025_readiness_trigger.sql:33`.
- **Failure:** every onboarding screen is reachable by URL and the API has no stage guard. An investor attests with PAN A (VALIDATED), then posts PAN B or another DOB before the PROFILE step runs. `kycStatus` resets to UNKNOWN, but PROFILE decrypts the new values and creates the FP investor profile with KRA-unverified data. FP treats DOB as immutable. `can_purchase` has no KYC term, so the investor can still reach `can_purchase = true`. After DONE, the same calls make local data diverge from FP.
- **Fix:** in `submitIdentity`, `putProfile` and `addBank`, refuse with `CONFLICT_VERSION` once `attestStatus` is IN_PROGRESS or DONE, or `provisioningStatus` is neither NOT_STARTED nor FAILED. Add the code to the three contract errorMaps. Later changes belong to the Plan 04 profile-change flow. As a backstop, ProvisionJob PROFILE refuses (StepFailed) unless `kycStatus` is VALIDATED.
- **Test:** after attest, `POST /onboarding/identity` returns 409 and the profile is unchanged. After DONE, `putProfile` and `addBank` return 409. A PROFILE step with `kycStatus` UNKNOWN fails with StepFailed and creates no FP profile.

#### MF-5 (ONB-1, E6/E7): identity and bank checks stay PENDING for ever after an FP outage

- **Where:** `apps/api/src/modules/onboarding/preverify.job.ts:87-98`; `bank-verify.job.ts:69-89`; `apps/api/src/modules/platform/jobs/jobs.service.ts:146`; `identity.service.ts:60`; `packages/features/src/onboarding/BankScreen.tsx:78,111`.
- **Failure:** about 3.5 minutes of FP errors, or a persistent 4xx on `preVerification.create`, exhausts the 3 pg-boss retries. Nothing reads `kyc_checks.next_poll_at`, so the check stays PENDING. An identical identity resubmit is a no-op (the replay only reruns on FAILED). BankScreen hides the form while a bank is PENDING. Attest is refused. The investor has no way out.
- **Fix:** add a worker sweep every 5-10 minutes over `kyc_checks` with status PENDING and `next_poll_at < now() - grace`. It re-enqueues the poll job with `singletonKey = checkId` and gives up past the existing caps. In both handlers, settle a definitive `FpRejectedError`/4xx at once: identity check FAILED with identity BLOCKED; bank FAILED with `VERIFICATION_REJECTED`. Let `submitIdentity`'s replay rerun when the latest IDENTITY check is PENDING with `next_poll_at` in the past.
- **Test:** script `preVerification.create` to 503 four times, run the sweep, assert the job is re-enqueued and settles. Script a 422 and assert identity BLOCKED and bank FAILED.

#### MF-6 (ONB-2, E6): an UNDER_PROCESS or KYC_UPDATE_NEEDED verdict can never change

- **Where:** `apps/api/src/modules/onboarding/preverify.job.ts:98` and `:139`; `identity.service.ts:60`.
- **Failure:** each 6-hour recheck re-reads the same completed pre-verification. FP documents pre-verification as accepted then completed, with no later change, so the verdict repeats for ever. An identical resubmit is a no-op. A KRA under-process investor, or one who has since fixed their KRA record, stays stuck at KYC_NOT_VALIDATED. `attempts` also accumulates across rechecks and can flip a genuine wait to BLOCKED. The int test passes only because FakeFp is re-scripted for the same id. Verdict PLAUSIBLE: a read-only sandbox probe should confirm a completed pre-verification never changes. The fix is safe either way.
- **Fix:** on a recheck, create a new pre-verification (a new IDENTITY `kyc_checks` row) and reset `attempts`. Let `submitIdentity`'s replay start a fresh check when the latest IDENTITY check settled to a non-VALIDATED status, at most 3 a day. A deadline for a long wait is an owner call.
- **Test:** script a new pre-verification id on the recheck and assert two `preVerification.create` calls and identity DONE. Assert an identical resubmit after `kyc_unavailable` enqueues a new check.

#### MF-7 (DEC-1, E10): the hub loops investors to Review when declarations are pending again

- **Where:** `apps/api/src/modules/onboarding/declarations.service.ts:117-120`; `packages/domain/src/rules/onboarding-stage.ts:55-64`; `apps/api/src/modules/onboarding/attest.service.ts:150-151`; `packages/features/src/onboarding/OnboardingHubScreen.tsx:107-118`.
- **Failure:** `declarations_status` is only ever set to DONE. If the investor opts out of nomination after staging, or ops republishes any legal document before the investor attests, `pending()` is non-empty but the flag stays DONE. The hub sends them to Review. Attest returns DECLARATION_OUTDATED. ReviewAttestScreen shows a banner with no link, and the R-18 banner is hidden until DONE. On Android the investor is stuck for good. A document republish strands everyone between Declarations and Attest.
- **Fix:** in `onboarding.queries.ts`, treat declarations as DONE only when `DeclarationsService.pending()` is empty. ReviewAttestScreen sends DECLARATION_OUTDATED to `/onboarding/declarations`.
- **Test:** int (`onboarding-get.int.test.ts`): stage, flip to OPTED_OUT, and `onboarding.get` returns stage DECLARATIONS. Feature (`ReviewAttestScreen.test.tsx`): a DECLARATION_OUTDATED attest navigates to declarations.

#### MF-8 (UI-2, E13): consent is recorded for documents the app never shows

- **Where:** `packages/features/src/onboarding/DeclarationsScreen.tsx:93-99`; `packages/features/src/legal/ReacceptSheet.tsx:31-37`; `packages/features/src/onboarding/IdentityScreen.tsx` (KYC consent).
- **Failure:** each document is a bare checkbox labelled with its title. Nothing calls `legal.getDocument` or links to `/site/legal/{key}`. An investor ticks six boxes and the attest seals consent to TNC, the privacy notice and the risk disclosure without ever seeing them. The MVP spec's ONB-15 row lists `legal.getDocument` as the screen's read, and journeys.md:46 requires the full text before acceptance. The plan's E13 code had the same gap; the spec outranks it.
- **Fix:** beside each checkbox, a "Read <title>" action opens a Sheet that loads `legal.getDocument` and renders the body and version. Do the same in ReacceptSheet and for KYC_CONSENT on IdentityScreen. A link to `/site/legal/{key}` via `Linking.openURL` is the minimum.
- **Test:** in `DeclarationsScreen.test.tsx`, add an MSW `GET /legal/documents/TNC` handler, click "Read Terms and Conditions", and assert the body and version appear in the dialog.

#### MF-9 (UI-3 + PRV-5, E12/E11): country of birth "Other" fails only after the dual-OTP attest

- **Where:** `packages/features/src/onboarding/PersonalDetailsScreen.tsx:56-59` and `:88`; `apps/api/src/modules/onboarding/fp-profile-mapping.ts:54-57`; `provision.job.ts:170-172`.
- **Failure:** a resident Indian born in Dubai answers "Other". Every step accepts it. After attest, `fpCountry` throws, the run fails with PROFILE_NOT_SUPPORTED, and BlockedScreen shows "We hit a snag" with no action. On Android there is no way back to the form.
- **Fix:** treat `countryOfBirth !== 'India'` like nationality: show the "Indian-born residents only for now" banner and disable Continue. `putProfile` refuses a non-India country of birth with VALIDATION_FAILED. Widening to an ISO list is an owner call.
- **Test:** `PersonalDetailsScreen.test.tsx`: choosing "Other" shows the banner and disables Continue. Int: `putProfile` with `countryOfBirth: 'UAE'` returns 400.

#### should_fix (fixed in the same lanes)

| ID | Task | Where | Failure, in one line |
|---|---|---|---|
| LC-2 | E3 | `apps/api/src/cli/ops-legal-seed.ts:69` | A re-seed rewrites a PUBLISHED document's body, sha256, status or date in place. Fix: `setWhere` DRAFT, exit non-zero on a changed PUBLISHED row, and a trigger. |
| LC-3 (+PRV-3) | E3/E11 | `legal-docs.service.ts:53`; `declarations.service.ts:155`; `attest.service.ts:27-35` | Three resolvers with no tiebreaker; attest has no `effective_from <= now`, so a future v2 enters the OTP snapshot. Fix: one shared resolver and a partial unique index. |
| LC-5 (+ONB-8) | E6 | `identity.service.ts:73-80` | KYC_CONSENT is stored with ip, user agent and session all null. |
| ONB-4 | E6 | `profile.service.ts:70-98` | Resubmitting the profile clears a PEP block and erases the reason. Fix: refuse once BLOCKED, never null the reason. |
| ONB-5 | E6 | `identity.service.ts:52-57,129-137` | An identity correction FAILs a pending BANK check; the bank stays PENDING for ever. Fix: filter on purpose IDENTITY. |
| ONB-6 | E6 | `apps/api/src/integrations/fp/pre-verification.ts:14-28` | name and DOB mismatch codes are dropped, so a typo is VALIDATED. Upgrade to must_fix if a sandbox probe shows `verified` with a field mismatch. |
| ONB-7 | E7 | `onboarding.router.ts:41-60`; `bank.service.ts:36-60` | `addBank` has no Idempotency-Key and no dedupe; a retry makes a second bank row and FP call. |
| NOM-1 | E8 | `nomination.service.ts:115-212`; `provision.job.ts:352` | A nominee edit after RELATED_PARTIES wedges a FAILED run in INTERNAL retries; after DONE it diverges from FP. |
| NOM-2 | E8 | `packages/contract/src/onboarding.ts:85`; `nomination.service.ts:72-78` | Names with punctuation and adult "minors" are saved and fail only after attest. |
| RSK-1 (+RISK-1) | E9 | `risk-profile.service.ts:140-148`; `RiskQuestionnaireScreen.tsx:66,109-136` | Q1 age comes from a client-typed DOB, not the KYC DOB (GAP-03). |
| PRV-2 | E11 | `0025_readiness_trigger.sql:69-72`; `BlockedScreen.tsx:43-52` | A stuck IN_PROGRESS run is not in `v_onboarding_blocked`; PROVISIONING_FAILED offers no re-attest. |
| PRV-4 | E11 | `provision.job.ts:263` | Related parties are adopted by name only, so a corrected nominee keeps stale immutable FP data. |
| UI-4 (+WT-2) | E12 | `packages/ui/src/Sheet.tsx:23-43` | Under `next dev` StrictMode a newly mounted Modal portal is detached, so no Select opens. Fix: keep Modal mounted, drive `visible`. |
| LEG-1 | E13 | `legal.router.ts:67-84`; `packages/contract/src/legal.ts:39-41` | `acceptPending` records the version in force at write time, not the one shown. |
| E2E-1 (+WT-4) | E13 | `apps/web/e2e/onboarding.smoke.spec.ts:106` | `'Stable'` also matches "Stable plus other income" (strict-mode failure). Align the IFSC to `HDFC0000123` for tidiness only. |
| CAT-1 | E17 | `apps/api/src/modules/catalogue/catalogue.queries.ts:56` | Whole-string trigram `%` returns nothing for "Axis", "Liquid" or "Flexi Cap". Use `<%`. |
| CAT-2 | E17 | `apps/web/src/app/site/commission-disclosure/page.tsx:26` | The public commission disclosure shows UUIDs instead of scheme and AMC names. |

---

### 2. defer (backlog, later tasks, or owner calls), grouped by task

#### E1 (webhooks)
- LC-7: each bad-signature webhook POST inserts a row on an unthrottled route with no retention. Add a sweep of `SIGNATURE_INVALID` rows, or stop writing them.
- Dropped: the body-parser prefix match, test timing nits and `retryOrBreak` attempts (safe under the stately index).

#### E2 (app config)
- The app-config tagline, support email, phone and cut-off copy are placeholders. Replace before the pilot (G-C copy).

#### E3 (legal documents)
- Dropped: dead `exec ?? this.dbh.db` fallback; `legal.getDocument` maps every failure to 404 (the right public answer).

#### E4 (consent engine)
- LC-6: `trg_consent_guard` accepts CONSUMED_UNUSED. Decide when E20 attaches the trigger to orders; add a negative trigger test then.
- LC-8: H-21's email fallback when SMS is unavailable is not built; SMS is always required. Must land before E20 opens purchases.
- Dropped: `sendsThisHour` counting challenges (OtpService still caps sends), drafts-abandon cosmetics, CONSUMED_UNUSED approve replay.

#### E6 (identity)
- The give-up path stores `readiness_code` NULL, the same as `kyc_unavailable`. Contract and copy decision; backlog.
- Dropped: the profile/kyc_checks lock-order inversion (narrow, self-healing; MF-4 and ONB-5 shrink it).

#### E7 (bank)
- **ONB-9 (owner call):** the local name match deviates from GAP-07 g (no token sort or punctuation strip), and it compares two self-typed names. "SHARMA RAJESH" against "RAJESH SHARMA" scores 77 and FAILs. Adopt GAP-07 g, or drop the local check and rely on FP's verdict.
- `bank_name` is never filled from `ref_ifsc`, and `is_primary` is never set. Plan 04 F14 owns the display.

#### E8 (nomination)
- **NOM-3 (owner call):** the nominee PAN or passport is stored but never sent to FP. FP says a related party's ID should exist before a folio is created. Send the PAN for adults, or stop collecting the ID.

#### E9 (risk profile)
- RSK-2: the readiness trigger ignores time-based expiry. Suitability.check still applies the time test. Every E20/F2 purchase path must call Suitability.check; add a daily expiry sweep in Plan 04.
- **RSK-3 (owner call, pilot gate):** the questionnaire ships unsigned (`approvedBy: null`), so the risk step returns 500 until compliance signs it off (R-36). Consider FEATURE_DISABLED copy instead of a 500.

#### E10 (declarations)
- **DEC-2 (owner call):** declarations are not sealed as per-document DOCUMENT_ACCEPTANCE rows, and staging rows have no ip or user agent. The OTP-gated ATTEST record does hash every document's key, version and sha256. Compliance decides whether that is enough.

#### E11 (provisioning)
- FP_REJECTED `fail()` and `ReconBreaks.open` are not in one transaction. A crash in between still leaves FAILED, which the view lists. Backlog.
- R-17 `adopted.*` ids in the re-attest snapshot, and the null-challenge and saga branches, are untested. Backlog test gaps.

#### E12 (onboarding clients)
- NAV-1: nothing routes a new investor from Home to `/onboarding`, and the new mobile routes sit outside `Stack.Protected`. HOME-01 (Plan 04) and E24 own these. Both must land before any pilot build.
- UI-5: the module-level profile draft (address, place of birth) survives sign-out. Call `resetProfileDraft()` in E24's sign-out handler.
- Minors (backlog UX): the hub offers identity again while KRA is in flight; server field errors show generic copy; AddressScreen autofill overwrites a restored city.

#### E13 (re-accept, review)
- LEG-2: `legal.acceptPending` works for an investor still in onboarding. It needs a hand-made API call and writes a genuine, attributed acceptance. MF-7's derived status removes the side effect. Backlog.
- UI-6: NomineesScreen resets typed shares to an equal split on add or remove. UX only; the 100% check still holds.
- E2E-2 (+WT-5): `readLatestOtpTo` ignores the template. Filter on the subject. No current spec triggers it.

#### E14 (catalogue API)
- **CAT-3 (owner call):** `getSchemeDetail` serves any PUBLISHED scheme by slug, curated or not. Latent while fp-sync publishes only curated schemes. Should a non-curated detail page 404?
- CAT-4: a malformed `listSchemes` cursor returns 500, not VALIDATION_FAILED.

#### E15, E16 (fund facts, returns)
- CAT-5: the returns job has no per-scheme error isolation and dates `asOf` in UTC. Latent with dense history.
- The facts CSV parser, the publish gate R1-R7 and ExploreScreen paging belong to Plan 04 F19.

#### Rd (retry defaults)
- Dropped: the "30 s" doc comment (pg-boss jitters to 30-60 s); existing queues keep `retry_delay 0`, which R-44 scopes to before the first prod deploy.

---

### 3. Verdict

**Not ready for the pilot. Ready to merge to `main` after the nine must_fix items land.**

**Why:**
- The kernel pieces hold up: webhook signature and replay handling, the consent engine's challenge and saga rules, the append-only legal and consent tables, the readiness trigger, and the catalogue reads. Lane reviewers and area reviewers found no defect in them beyond MF-1.
- The must_fix items fall into three groups:
  - money or compliance: MF-2 (wrong FP account), MF-4 (unverified identity sent to FP), MF-8 (consent without the text), MF-1 (every saga fails once F1 lands);
  - a user stuck with no way out: MF-5, MF-6, MF-7, MF-9;
  - the first onboarding step fails for everyone: MF-3.
- Each has a covering test and none needs a design decision. They split into six fix lanes with disjoint files.

**Conditions after the fix lanes** (these do not block the merge, but they block the pilot or the named task):
- The onboarding smoke passes against `next start` with `reuseExistingServer` off, after MF-3, UI-4 and E2E-1. If a Select does not open there, UI-4 becomes must_fix.
- A read-only sandbox probe confirms that a completed pre-verification never changes (MF-6), and whether `readiness: verified` can come with a name or DOB mismatch (ONB-6 upgrades if so).
- RSK-3 sign-off, NAV-1 (HOME-01 and E24) and the E2 placeholder copy land before the first pilot build.
- LC-8 (H-21 email fallback) and LC-6 are settled before E20.
- R-a, R-b and R-c are still open for E20 and E21.
- The owner answers the owner calls listed under section 2 and in ONB-4, MF-6 and MF-9.

## Fix wave, smoke and re-review (2026-10-08)

**Fix wave.** The six lanes (FX1 consent-legal-db, FX2 kyc-checks, FX3 onboarding-writes, FX4 provisioning-risk, FX5 clients-legal, FX6 catalogue-e2e) each ran in their own worktree, with a review and up to two fix rounds. Five came back clean. FX3 reached the round cap with two open findings, because its fix agent could not write to its worktree; the controller fixed both in b9de7f8. One integration fix (1e02139) added the Idempotency-Key that FX3 made mandatory to the FX2 and identity int-test helpers. openapi was regenerated (631f1b8). Migrations 0026-0028 are FX1's. Errata RV-03-57..75.

**Onboarding smoke.** `apps/web/e2e/onboarding.smoke.spec.ts` ran for the first time, against `next dev` with FakeFp and a worker. It found:
- **A product bug:** the verified bank screen returned to a stale hub (290731b).
- **Five spec defects:** an ambiguous PAN locator, ambiguous radio labels, a fixed PAN that a second run cannot reuse, Playwright's 30 s default timeout, and a risk DOB step that RSK-1 removed (6efa1c2).

The run then passed from sign-up to "Your account is ready", through every dropdown, in 22 s. That proves MF-3 (email OTP) and UI-4 (Select/Sheet) in a real browser. It was not run against `next start`.

**Scoped re-review (opus, a9367e8..6efa1c2).**
- **Must-fix verdicts:** MF-1, MF-2, MF-3, MF-7, MF-8 and MF-9 are CLOSED. MF-4 is CLOSED for the reviewed cases. MF-5 and MF-6 were PARTIAL: their server side is done, but they led into N2.
- **Should-fix:** every item listed above is fixed and tested.
- **Migrations:** 0026-0028 are safe on an existing database.

New findings and their state:
- **N1 (must_fix, fixed c574201, RV-03-76):** a FAILED run left identity, profile and bank editable after FP held them.
- **N2 (must_fix, fixed e2ef596, RV-03-77):** KYC_UPDATE_NEEDED had no way out.
- **N4 (should_fix, fixed c574201, RV-03-78):** the country-of-birth check was case-insensitive, unlike FP's mapping.
- **N3 (should_fix, backlog):** a `*_mismatch` readiness code is not shown on IdentityScreen, and `aadhaar_not_linked` is filed as `pan_mismatch` instead of its own blocking code. It waits for the ONB-6 sandbox probe, which decides the real codes.
- **Defer:**
  - 0027 guards UPDATE but not DELETE of a published legal document: add `REVOKE DELETE` or a delete guard.
  - A DOB correction after the risk step leaves Q1 scored from the old DOB.
  - An UNDER_PROCESS investor creates one FP pre-verification every 6 h with no limit; the deadline is an owner call.

**Suites at c574201:**
- verify 23/23
- test:int 47 files, 485 tests
- db:check OK
- check-brand OK

**Verdict:** ready for a draft PR to `main`. The pilot conditions in section 3 still stand: RSK-3 sign-off, the owner calls, the ONB-2/ONB-6 probes, and R-a/R-b/R-c for E20-E24.

**PR #11 CI, first run (2026-10-08).** `verify` failed only at its last step, `pnpm audit --prod --audit-level=high`, on a new advisory: GHSA-cjq9-62q9-8jv4 (high, Next.js SSRF in Image Optimization, `next` >=16.0.0 <16.3.8). Every code step passed (lint, build, typecheck, unit tests, test:int, db:check, gen:states, gitleaks), and so did `e2e-web`. No component imports `next/image`, but Next serves `/_next/image` by default, so `next` moves 16.3.6 → 16.3.8 (`1161873`). That is an owner-directed exception to the catalog rule, recorded in an ADR-0001 row. The known features search-debounce flake retried in the same run; it is now a backlog item (Plan 03: 5 open).
