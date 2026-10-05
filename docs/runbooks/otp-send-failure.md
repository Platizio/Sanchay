# Runbook: OTP send failure (stub)

> **Status: stub (S1 Definition of Done).** It describes the Plan 01 code as built. The pilot week (F24, G-E8) turns it into the final runbook when MSG91, SES and the prod alarms (F1 `otpSendFailureRate`, `smsCapReached`) exist.

## Symptoms
- Investors see **"We could not send the SMS right now. Please try again in a few minutes."** That is error `SMS_UNAVAILABLE` (HTTP 503, `retryable: true`). The email equivalent is `PROVIDER_UNAVAILABLE`.
- Sign-ups and logins stall at the OTP step; consent OTPs (orders, attest) fail the same way.
- From F1 on, these alarms fire: `otpSendFailureRate` (sender errors) or `smsCapReached` (daily cap).

## What the code already does (no action needed)
- **Provider timeout.** Each send has 5 s (D-17, R-07, `OTP_POLICY.sendTimeoutMs`). A timeout or provider error rejects with `SenderUnavailableError`.
- **No lost code.** When a send fails, `OtpService` deletes the undelivered row and restores the code it had superseded, so an investor who already received an earlier code can still use it.
- **Daily SMS cap.** At most **2,000 SMS per IST day** across all purposes (`OTP_POLICY.smsPerIstDay`). Past it, every SMS request returns `SMS_UNAVAILABLE` until 00:00 IST and the API logs `otp.sms_daily_cap: <n> SMS since <time>; refusing SMS until the next IST day`.
- **Other per-investor limits** (`OTP_COOLDOWN` 30 s, `RATE_LIMITED`, `OTP_LOCKED` after 5 wrong attempts) are working as designed; they are not this incident.

## Triage (in order)
1. **Scope.** Is it SMS only, email only, or both? One investor or everyone? One investor is usually a per-destination limit or a DLT-blocked number. Everyone points to the provider, the credentials or the cap.
2. **Logs** (CloudWatch from S2; locally, the API console). Search for:
   - `otp.sms_daily_cap`: the cap was hit. Go to "Cap reached".
   - `SenderUnavailableError` / `otp send timed out after 5000 ms`: the provider is down or slow. Go to "Provider down".
   - `otp.issue_cleanup_failed`: restoring the previous code failed (a database problem). The investor must request a new code after the 30 s cooldown; raise it with engineering.
3. **Configuration.**
   - `SANCHAY_PROVIDER_MODE_SMS` / `_EMAIL`. Today these are `capture` or `mailpit`, and the production boot guard refuses both. From Plan 02 D6 they are `msg91` / `ses`.
   - For MSG91: the credentials JSON is valid (`node scripts/sandbox-check.mjs` locally) and all four DLT template ids are approved (R-10).

## Cap reached
- Expected only under abuse or a bug that loops sends. Check for a burst from one IP or device range before anything else.
- Raising the cap is a code/config change (`OTP_POLICY.smsPerIstDay`). Do it only with the owner's approval, recorded in `docs/delivery/rulings.md`.
- Email OTPs keep working during an SMS cap. Tell support to point affected investors to email where the flow offers it.

## Provider down (MSG91 / SES)
- Check the provider status page and the MSG91 DLR dashboard; for SES, the account's sending status and bounce rate.
- **Never** switch production to `capture` or `mailpit`. The boot guard refuses it, and it would show codes outside the investor's phone.
- There is no second SMS provider in the MVP. Post the status banner, and tell support the expected recovery time.

## Communication
- Support script: "We're having trouble sending verification codes. Please try again in 15 minutes; your account and investments are not affected."
- Log the incident window, the cause and the affected count in the ops log, for the F23 gate evidence pack.

## Open items for the final runbook (F24)
- MSG91 DLR-based failure detection and the `otpSendFailureRate` threshold (F1).
- SES bounce and complaint handling.
- On-call contact list and escalation times.
