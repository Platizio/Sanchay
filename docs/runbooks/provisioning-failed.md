# Runbook: onboarding provisioning failed (stub)

> **Status: stub (S3 Definition of Done).** It describes Task E11 as built. Plan 04 F24 does not cover it (it is not a G-E8 item); update it when the pilot shows a real case.

## Symptoms
- The investor's onboarding stage is `PROVISIONING_FAILED`, or it stays at provisioning for more than an hour.
- `app.v_onboarding_blocked` lists the investor; for an FP rejection, a CRITICAL `ONBOARDING_PROVISIONING_REJECTED` recon break is open.

## What the code already does (no action needed)
- `onboarding.provision` resumes from `onboarding_applications.provisioning_step`, and every step looks the resource up on FP first (LOOKUP-ADOPT), so a retry never creates a second profile, account or bank.
- FP 5xx, timeouts and ambiguous answers are retried by pg-boss; the next attempt adopts what FP already created.

## Triage (in order)
1. Read `provisioning_failed_reason` on the investor's `onboarding_applications` row.
2. `SAGA_WINDOW_EXPIRED_NEW_RESOURCE_REQUIRED`: the attest consent expired before the next FP write. Ask the investor to attest again (R-17); the new job resumes the same step and adopts the FP ids already created.
3. `FP_REJECTED:<op>`: FP refused the data (4xx), with no retry. Compare the investor's data with the FP error code (`provider_calls.error_code` for that operation), fix the cause with the investor, then ask for a re-attest. Resolve the recon break with `ops:resolve-break` (two founders; Plan 04 F7) once the re-attest succeeds.
4. `PROFILE_NOT_SUPPORTED`, `PROFILE_INCOMPLETE`, `ADDRESS_INCOMPLETE`, `EMAIL_MISSING`, `BANK_NOT_VERIFIED`: the investor's own data cannot be sent to FP as it stands (a country of birth other than India, a missing field, an unverified bank). Fix it with the investor in the app, then ask for a re-attest.
5. Stuck without a reason: check the worker heartbeat and the `onboarding.provision` queue before anything else.

## Never
- Never create or patch an FP resource by hand for the investor: the next job would not know about it.
