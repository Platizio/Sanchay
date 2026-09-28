# DLT SMS templates (G-B4)

Source of truth for the text: `apps/api/src/integrations/sms/templates.ts`.
The unit test `apps/api/src/integrations/sms/templates.test.ts` fails if this file and the code drift apart.

- Principal entity: Platizio (legal entity, AMFI-registered MFD, ARN holder)
- Brand in the message text: Sanchay
- Variable marker: `{#var#}`, at most 30 characters per variable
- Template type: Transactional (OTP), submitted through MSG91
- Four templates (ruling R-10): LOGIN, CONSENT (amount), CONSENT_UNITS (redeem by units, or redeem all with the units variable `all`) and ATTEST (onboarding attest). The CO and counsel sign off all four texts before the Mon 10-12 filing (PB-32a).
- Every environment outside local/test must set `SANCHAY_SMS_RETRIEVER_HASH` (API boot invariant 7; the value comes from the Play App Signing certificate of the internal-testing build), so every non-local SMS has exactly three lines. Local and test builds may omit the middle line.
- The WebOTP line `@app.sanchay.in #<code>` is always the last line. The Android SMS Retriever hash is always the penultimate line, registered as a `{#var#}` so DLT approval does not depend on Play App Signing.

## SANCHAY_LOGIN_OTP_V1

Template body:

```text
{#var#} is your Sanchay login OTP. Valid 5 min. Never share it; Sanchay staff never ask for it. -Platizio
{#var#}
@app.sanchay.in #{#var#}
```

Variables: 1 = 6-digit code; 2 = 11-character Android SMS Retriever hash; 3 = the same 6-digit code.

Rendered example (code 123456, hash FA+9qCX9VSu; 140 bytes, the SMS Retriever maximum):

```text
123456 is your Sanchay login OTP. Valid 5 min. Never share it; Sanchay staff never ask for it. -Platizio
FA+9qCX9VSu
@app.sanchay.in #123456
```

## SANCHAY_CONSENT_OTP_V1

Template body:

```text
{#var#} is your OTP to {#var#} Rs {#var#} in {#var#} on Sanchay. Valid 5 min. Never share it. -Platizio
{#var#}
@app.sanchay.in #{#var#}
```

Variables: 1 = 6-digit code; 2 = action (for example `invest`, `redeem`); 3 = amount in rupees; 4 = short scheme name; 5 = Android SMS Retriever hash; 6 = the same 6-digit code.

Rendered example (code 123456, action invest, amount 5,000.00, scheme HDFC Flexi Cap, hash FA+9qCX9VSu):

```text
123456 is your OTP to invest Rs 5,000.00 in HDFC Flexi Cap on Sanchay. Valid 5 min. Never share it. -Platizio
FA+9qCX9VSu
@app.sanchay.in #123456
```

## SANCHAY_CONSENT_UNITS_OTP_V1

Template body:

```text
{#var#} is your OTP to redeem {#var#} units of {#var#} on Sanchay. Valid 5 min. Never share it. -Platizio
{#var#}
@app.sanchay.in #{#var#}
```

Variables: 1 = 6-digit code; 2 = units with 3 decimals, or the word `all` for redeem-all; 3 = short scheme name; 4 = Android SMS Retriever hash; 5 = the same 6-digit code.

Rendered example (code 123456, units 12.345, scheme HDFC Flexi Cap, hash FA+9qCX9VSu):

```text
123456 is your OTP to redeem 12.345 units of HDFC Flexi Cap on Sanchay. Valid 5 min. Never share it. -Platizio
FA+9qCX9VSu
@app.sanchay.in #123456
```

Rendered example (redeem all):

```text
123456 is your OTP to redeem all units of HDFC Flexi Cap on Sanchay. Valid 5 min. Never share it. -Platizio
FA+9qCX9VSu
@app.sanchay.in #123456
```

## SANCHAY_ATTEST_OTP_V1

Template body:

```text
{#var#} is your OTP to confirm your Sanchay account details. Valid 5 min. Never share it. -Platizio
{#var#}
@app.sanchay.in #{#var#}
```

Variables: 1 = 6-digit code; 2 = Android SMS Retriever hash; 3 = the same 6-digit code.

Rendered example (code 123456, hash FA+9qCX9VSu):

```text
123456 is your OTP to confirm your Sanchay account details. Valid 5 min. Never share it. -Platizio
FA+9qCX9VSu
@app.sanchay.in #123456
```
