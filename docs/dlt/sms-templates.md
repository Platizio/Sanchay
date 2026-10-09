# DLT SMS templates (G-B4)

Source of truth for the text: `apps/api/src/integrations/sms/templates.ts` (`SMS_TEMPLATE_BODIES`).
The unit test `apps/api/src/integrations/sms/templates.test.ts` fails if this file and the code drift apart. It also checks that every value the code sends fits its variable's tag.

## Filing facts

- **Principal entity:** Platizio (legal entity, AMFI-registered MFD, ARN holder).
- **Brand in the message text:** Sanchay.
- **Template type:** Transactional (OTP), submitted through MSG91.
- **Four templates (R-10):** LOGIN, CONSENT (amount), CONSENT_UNITS (redeem all) and ATTEST (onboarding attest). The CO and counsel sign off all four texts before the Mon 10-12 filing (PB-32a).
- **Every variable carries a TRAI typed tag** (TRAI Direction of 18-Nov-2025). The bare `{#var#}` placeholder is no longer used. Only two tags occur:

  | Tag | What the code sends | Pattern the unit test enforces |
  |---|---|---|
  | `{#numeric#}` | the 6-digit code; rupees; paise | digits only: no commas, no decimal point |
  | `{#alphanumeric#}` | the action; the short scheme name; `all` | letters and digits in single-spaced words, no punctuation |

- **Each variable is at most 30 characters.** Operators allow 40; the code keeps the older, stricter 30.
- **Two lines per template.** The WebOTP line `@app.sanchay.in #<code>` is always the last line (H-6).

## Changes from the 2026-10-07 text (H16, flaw audit 2026-10-08)

These need owner sign-off as an amendment to R-10 and spec H-6, plus CO and counsel sign-off of the texts, before filing.

1. **Typed tags replace `{#var#}`.** An untagged template is refused for a new registration.
2. **The Android SMS Retriever hash line is removed.** It was a `{#var#}` line. The hash is 11 base64 characters, so it can contain `+` or `/` (about a 30% chance for any signing key), and no tag accepts those. The Android app does not read SMS through the Retriever in the MVP (the Retriever module is an extension, spec §2.1). If it is ever built, file a V2 template carrying the then-known hash as fixed text. `SANCHAY_SMS_RETRIEVER_HASH` and API boot invariant 7 are removed with it.
3. **Amounts are sent as `Rs {#numeric#}.{#numeric#}`.** For example, `5,000.00` is sent as `Rs 5000.00` and `1,00,000.50` as `Rs 100000.50`. The code restates the exact amount without grouping commas, and refuses any amount it cannot restate exactly.
4. **Scheme names are reduced to the `alphanumeric` tag.** `&` becomes `and`, any other punctuation becomes a space, and the name is cut at a word boundary within 30 characters. A consent with no scheme name says `your scheme`.
5. **CONSENT_UNITS carries only `all`.** Redeem-by-units (T5) is skipped in the MVP. A decimal units value such as `12.345` does not fit any tag, so units mode needs its own template (`{#numeric#}.{#numeric#}`) if it is ever built.

## Confirm with MSG91 before filing

These rules come from vendor documentation; TRAI's primary text could not be fetched from this environment.

- Whether `{#alphanumeric#}` accepts spaces inside a value (for example `HDFC Flexi Cap`, `cancel SIP of`). If it does not, the action and scheme name must become single words.
- Whether `{#numeric#}.{#numeric#}` is accepted. The full stop is fixed text, but some portals ignore punctuation when matching and treat the two variables as adjacent.
- MSG91's older FAQ says a variable cannot be the last word of a template. The WebOTP line ends with the code (`#{#numeric#}`), and H-6 requires that line to be last.
- The MSG91 Flow template must pass each value as its own named variable, mapped to the DLT template id. Today's sender passes the whole text as one `VAR_BODY` (open ruling R-e).

## SANCHAY_LOGIN_OTP_V1

Template body:

```text
{#numeric#} is your Sanchay login OTP. Valid 5 min. Never share it; Sanchay staff never ask for it. -Platizio
@app.sanchay.in #{#numeric#}
```

Variables:
1. `{#numeric#}`: the 6-digit code.
2. `{#numeric#}`: the same 6-digit code.

Rendered example (code 123456):

```text
123456 is your Sanchay login OTP. Valid 5 min. Never share it; Sanchay staff never ask for it. -Platizio
@app.sanchay.in #123456
```

## SANCHAY_CONSENT_OTP_V1

Template body:

```text
{#numeric#} is your OTP to {#alphanumeric#} Rs {#numeric#}.{#numeric#} in {#alphanumeric#} on Sanchay. Valid 5 min. Never share it. -Platizio
@app.sanchay.in #{#numeric#}
```

Variables:
1. `{#numeric#}`: the 6-digit code.
2. `{#alphanumeric#}`: the action, for example `invest`, `redeem` or `cancel SIP of`.
3. `{#numeric#}`: rupees, digits only.
4. `{#numeric#}`: paise, two digits.
5. `{#alphanumeric#}`: the short scheme name.
6. `{#numeric#}`: the same 6-digit code.

Rendered example (code 123456, action invest, amount 5,000.00, scheme HDFC Flexi Cap):

```text
123456 is your OTP to invest Rs 5000.00 in HDFC Flexi Cap on Sanchay. Valid 5 min. Never share it. -Platizio
@app.sanchay.in #123456
```

## SANCHAY_CONSENT_UNITS_OTP_V1

Template body:

```text
{#numeric#} is your OTP to redeem {#alphanumeric#} units of {#alphanumeric#} on Sanchay. Valid 5 min. Never share it. -Platizio
@app.sanchay.in #{#numeric#}
```

Variables:
1. `{#numeric#}`: the 6-digit code.
2. `{#alphanumeric#}`: `all` (redeem-all).
3. `{#alphanumeric#}`: the short scheme name.
4. `{#numeric#}`: the same 6-digit code.

Rendered example (redeem all, code 123456, scheme HDFC Flexi Cap):

```text
123456 is your OTP to redeem all units of HDFC Flexi Cap on Sanchay. Valid 5 min. Never share it. -Platizio
@app.sanchay.in #123456
```

## SANCHAY_ATTEST_OTP_V1

Template body:

```text
{#numeric#} is your OTP to confirm your Sanchay account details. Valid 5 min. Never share it. -Platizio
@app.sanchay.in #{#numeric#}
```

Variables:
1. `{#numeric#}`: the 6-digit code.
2. `{#numeric#}`: the same 6-digit code.

Rendered example (code 123456):

```text
123456 is your OTP to confirm your Sanchay account details. Valid 5 min. Never share it. -Platizio
@app.sanchay.in #123456
```
