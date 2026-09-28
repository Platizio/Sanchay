<!-- source: workflow wf_1d1c9b02-593 label research:fp-api (brand-renamed) | exported 2026-09-28 -->

# Cybrilla FintechPrimitives (FP) and Cybrilla POA reference for Platizio v2: investor-initiated regular-plan orders on the cybrillapoa/ONDC gateway

**Summary.** Everything goes through FP's `gateway: "ondc"` route, which FP calls "cybrillapoa" (Cybrilla POA). FP now says the RTA route is "no longer supported". The platform ARN is set once, at tenant level, when Platizio signs up on the ONDC portal. No order carries an ARN field. An execution-only order is one where `euin` is left out and no `partner` is set. FP has no execution-only flag and no `euin_declaration` field, so our own consent record must store the investor's declaration. There are six findings that affect the locked launch scope (§12): quarterly SIP, pausing a SIP, redeeming by units, STP/SWP/switch, the UPI Autopay limit, and CAS import.

Sources were all accessed on 2026-09-25:
- **[API-REF]**: the full FP API reference, https://fintechprimitives.com/docs/api/. I downloaded the whole HTML page and extracted each section word for word.
- **[DOCS]**: https://docs.fintechprimitives.com/...
- **[POA-DOCS]**: Cybrilla's POA/ONDC docs repo, https://github.com/cybrilla/rta-docs.
- **[SDK]**: the official `@fintechprimitives/fpapi@0.1.18` typings (`build/index.d.ts`, published 2024-11-14; older than the API reference).
- **v1 code**: under `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/`. I shorten this to `BE/` below.

---

## 0. Hosts, auth, headers, common conventions

| Item | Sandbox | Production | Source |
|---|---|---|---|
| FP API base | `https://s.finprim.com` | `https://api.fintechprimitives.com` | [API-REF] Introduction |
| FP tenant token | `POST {base}/v2/auth/{tenant}/token` (form: `client_id`, `client_secret`, `grant_type=client_credentials`) | same | [API-REF] Authentication; v1 `BE/CYBRILLA_INTEGRATION.md:23-29` |
| POA ("additional APIs": `/poa/pre_verifications`, `/poa/kyc_forms`, `/poa/files`) base | `https://api.sandbox.cybrilla.com` | `https://api.cybrilla.com` | v1 `BE/docs/cybrilla-production-inquiry-email.md:5-7`, `BE/CYBRILLA_INTEGRATION.md:17` |
| POA token | `POST /v2/auth/cybrillarta/token` (form-encoded; `expires_in: 1800`, `scope: partner`) | same | [POA-DOCS] `docs/additional-apis/authn.md` |
| Headers | FP: `Authorization: Bearer`, plus `x-tenant-id: <tenant name>` on `/v2/*`, `/api/*` and `/transactions`. POA: Bearer only. | same | [API-REF]; v1 `BE/docs/cybrilla-support-email-draft.md:27-28` |
| Token life | 1800 s. Reuse the token until it expires. | | [API-REF] "Efficient Usage of JWT Tokens"; v1 `BE/docs/cybrilla-credentials-and-network-report.md:94-95` |
| Events and webhooks | Only reachable with a token from the `/v2/auth` APIs (note in the Events and Webhook sections). | | [API-REF] Events |

**Rate limits ([API-REF] "Rate Limits", verbatim):**
- Production: 100 read and 100 write operations per second.
- Sandbox: 25 operations per second.
- Files API: 20 per second each way.
- List/search endpoints: 20 reads per second.
- Over the limit you get HTTP 429. Increase requests need about 6 weeks' notice.

**Errors ([API-REF] Errors):** the body is `{error:{status, code, message, errors:[{field,message}]}}`. Statuses in use: 400, 401, 403, 404, 405, 500, 503.

**Pagination:**
- `/api/*` endpoints (fund_schemes, `/api/pg/mandates`, `/api/pg/payments`) and `/v2/mf_scheme_plans/cybrillapoa` take `page` (default 0) and `size` (default 20, max 100). Responses use Spring-style `last`, `total_pages`, `total_elements`, `number`.
- `/v2/*` list endpoints (purchases, redemptions, switches, folios, events) return `{object:"list", data:[...]}` holding **the latest 100 items at most**, with no paging. Always filter them by `plan`, `mf_investment_account`, `states` and similar.
- v1 pages the catalogue at 100 per page with a 50-page cap and retries 429s (`BE/.../RealCybrillaClient.java:55-58, 1003-1071, 2283-2289`).

**Idempotency: order creation is NOT idempotent.** [API-REF] "Introduction to MF Orders → FAQs" says:
- Use a unique `source_ref_id`. It must be unique across purchases, redemptions and switches, and plans have their own uniqueness across plan types. A duplicate `source_ref_id` gets a validation error.
- If creating an order times out, either ignore that order (it will auto-expire) or retry with the same `source_ref_id` and treat the validation error as "already created".
- If confirming times out, fetch the order and re-confirm only if it is still `pending`.

The `Idempotency-Key` header that v1 sends (`RealCybrillaClient.java:66, 2047-2053, 3188-3190`) is **not documented anywhere and should be assumed to be ignored**. `POST /api/pg/payments/nach` states: "the platform doesn't check whether there are payments already created for the orders". Our own DB guard is mandatory.

**`user_ip`:**
- Mandatory on purchase, redemption and switch creates, and on plan creates.
- Must be "IPv4 format n.n.n.n".
- v1 hard-codes `"127.0.0.1"` (`RealCybrillaClient.java:3058, 3100`). This is wrong: v2 must pass the investor's real client IP.
- ⚠ UNCONFIRMED: what to send for investors on IPv6-only mobile networks. Ask Cybrilla.

---

## 1. Distributor identity (ARN, sub-broker, EUIN) and execution-only orders

**Tenant level: this is how the platform ARN is attached.**
- Going live on cybrillapoa requires "a signup on the ONDC portal … using your registered ARN details, as all transactions are routed via ONDC". It also requires the POA agreement eSign, a product demo, an RTA mailback subscription, and then production credentials. Sources: [DOCS] /going-live/checklist/ and /fp-cybrillapoa-gateway/going-live/ (the latter is marked "Archived and old").
- In the ONDC message that POA receives, the distributor shows up as `fulfillment.agent.organization.creds: [{id:"ARN-124567", type:"ARN"}, {id:"ARN-123456", type:"SUB_BROKER_ARN"}]` and `agent.person.id: "euin:E52432"` ([POA-DOCS] `docs/schema/fulfillment.md`).
- FP fills in the ARN from the tenant's registration. **There is no per-order ARN field in the FP API.** POA capabilities list attribution as "Distributor partners (via ARN/RIA code) / Sub-broker partners / Relationship managers (via EUINs)" ([POA-DOCS] `docs/capabilities/capabilities.md`). The licences page says regular schemes need an ARN and direct schemes need an RIA ([DOCS] /going-live/licenses).

**Per-order fields.** These were checked against both [API-REF] and [SDK] for all six object types.

| Field | mf_purchases | mf_purchase_plans | mf_redemptions | mf_redemption_plans | mf_switches | mf_switch_plans | Meaning |
|---|---|---|---|---|---|---|---|
| `euin` (string, optional) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | "Unique identity number of the employee / relationship manager / sales person of the distributor who has **advised or interacted with the investor**…" If `partner` is set, the EUIN must be in that partner's `euins` ([DOCS] /mf-transactions/partner-tagging/). |
| `partner` (`ptnr_…`, optional) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | Sub-broker partner ID. For purchases: "Sub-broker transactions are yet to be supported via ondc gateway". For redemptions: "Ability to capture sub-broker code for redemptions via ondc gateway is not yet supported". |
| `initiated_by` | obj | ✔ | obj | ✔ | obj | ✔ | `investor` \| `distributor`. Send `investor`. |
| `initiated_via` | obj | ✔ | obj | ✔ | obj | ✔ | `mobile_app`, `mobile_app_android`, `mobile_app_ios`, `mobile_web_android`, `mobile_web_ios`, `mobile_web`, `web` |
| `sub_broker_arn`, `euin_declaration`, execution-only flag | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | **These fields do not exist.** I checked every "euin/declaration/execution" hit in [API-REF] and the full [SDK] typings. |

Notes on the table:
- "obj" means the attribute exists on the object, but [API-REF] does not list it as a create parameter for that order type.
- Partner object: `POST/GET /v2/partners`, `GET /v2/partners?code=ARN-…`. Fields: `name`, `license_code` (required), `default_broker_codes{cams,karvy}` (required, immutable), `location` (required), `ref_no`, `mobile`, `email`, `contact_person_name`, `expiry_date`, and `euins[]` (required when the partner is an ARN holder). Platizio has no sub-brokers, so **do not create partners**.

**Execution-only answer.**
- To place an execution-only, no-advice online transaction, **omit `euin` (or send null) and omit `partner`**.
- AMFI/SEBI practice, per AMC common forms: when the EUIN box is left blank, the investor must declare that the transaction is "execution-only" and was made without any interaction or advice from the distributor's employee. FP has no field for this declaration. v2 must:
  - render the declaration inside the transaction consent text,
  - snapshot and hash it with the order,
  - keep it as evidence. Cybrilla may ask for it in the product-demo review.
- ⚠ UNCONFIRMED 1: FP examples for ONDC orders and plans that have no partner still show `"euin": "E457992"` and `"E609422"` ([API-REF] batch purchase and purchase-plan examples). FP or the ONDC tenant setup may auto-fill a default EUIN registered at signup. Ask Cybrilla to confirm that omitting `euin` leaves the ONDC `agent.person` EUIN blank.
- ⚠ UNCONFIRMED 2: whether the ONDC FIS14 spec, or Cybrilla's POA, expects an explicit execution-only or EUIN-declaration tag. Ask Cybrilla.
- v1 never sent `euin` or `partner` (`RealCybrillaClient.java:3052-3154`). This matches the "omit" behaviour.

---

## 2. Consent and 2FA

**FP does not send OTPs.** The tenant (us) sends the OTP. FP only records where the consent was obtained. [API-REF] "Purchase Consent Details" says:
- "Before order is sent to RTAs, investor consent must be obtained by sending a One-Time Password…"
- For an existing folio, the OTP goes to the email/mobile **registered against that folio**.
- For a new folio, it goes to the email/mobile in the investment account's **`folio_defaults`**.

**Consent object.** The same shape is used on purchases, purchase plans, redemptions, redemption plans, switches, switch plans and plan modification instructions:
```
consent: {
  email?:    string  // required if consent was taken by email; for folio orders it must be one of the folio's registered emails
  isd_code?: string  // required if taken by mobile; digits, optional leading '+', max 4 chars
  mobile?:   string  // required if taken by mobile; digits and '-', 7–20 chars; for folio orders it must be one of the folio's mobiles
  otp?:      string  // mf_redemptions only; mandatory when redemption_mode = "instant" (rta gateway only); 4–20 digits
}
```
- "Once set, this cannot be modified" applies to every object that takes a consent.
- For ONDC purchases you "cannot update state and consent simultaneously" in one PATCH.
- You can send email, mobile or both. Folio contacts are available from `GET /v2/mf_folios?mf_investment_account=&folio_number=` (`email_addresses[]`, `mobile_numbers[]`).
- The ONDC fulfillment exposes the masked 2FA contacts as `2FA_EMAIL_ADDRESS_MASKED` and `2FA_MOBILE_NUMBER_MASKED` tags ([POA-DOCS] fulfillment.md).
- New folio: the OTP consent must also cover the nomination details (nominee name, DOB if minor, %, relationship, guardian details, optional PANs) or the opt-out ([DOCS] /mf-transactions/onetime-purchases/).

**Where the consent goes, by object type:**

| Object | How consent is written |
|---|---|
| mf_purchase | `PATCH /v2/mf_purchases {id, consent}`. For ONDC this is a separate call from `{id, state:"confirmed"}`. |
| mf_purchase_plan / mf_redemption_plan / mf_switch_plan | `consent` in the create body, or later via `PATCH {id, consent, state:"confirmed"}`. ONDC plans are confirmed only after `review_completed`. |
| mf_redemption / mf_switch | `PATCH {id, state:"confirmed", consent}`. Consent is required for switches and conditional for redemptions. |
| mf_plan_modification_instruction | `consent` is required in the create body. |

v1 consent payload: `{email, isd_code:"91", mobile}` (`BE/.../service/InvestorActionService.java:1048-1061`). This is correct.

**How this fits v2 must-fix (a), "2FA before any provider write":** FP's consent is just a record written after the order exists. v2 should:
1. Run our own OTP challenge first, snapshotting and hashing scheme, amount or units, folio, execution-only declaration and nominee choices.
2. Only then `POST` the FP order.
3. PATCH `consent` as soon as the order or plan reaches `pending` / `review_completed`.

If the ONDC review fails after the OTP was used, mark the challenge consumed-but-unused and require a fresh OTP. The OTP must go to the same contact FP will record. For a new folio, that is the investor's verified email/mobile referenced in `folio_defaults`.

---

## 3. Order lifecycles

### 3.1 Common order states
[API-REF] "Order States":

| State | Meaning |
|---|---|
| `under_review` | ONDC only: async gateway review |
| `pending` | Created, not ready to submit |
| `confirmed` | Ready to submit |
| `submitted` | Sent to the gateway |
| `successful` | Processed |
| `failed` | Failed |
| `cancelled` | Cancelled by the user |
| `reversed` | A previously successful order reversed; units reversed |

**Expiry of `pending` orders:**
- Purchase: expires T+7 working days after RTA cut-off (marked on T+8).
- Redemption and switch: T+1 working day.
- SIP instalments: monthly and quarterly T+6 calendar days; daily T.
- Failure codes include `payment_failure`, `order_expiry`, `order_failure_at_gateway`.

### 3.2 mf_purchases (lumpsum)
Endpoints ([API-REF] MF Purchases):
- `POST /v2/mf_purchases`
- `PATCH /v2/mf_purchases`
- `GET /v2/mf_purchases/:id` (accepts `id` or `old_id`)
- `GET /v2/mf_purchases?mf_investment_account=&plan=&skip_instruction=&states=`
- `POST /v2/mf_purchases/:id/retry`: payment retry; for ONDC this is "upcoming, not available"
- `POST /v2/mf_purchases/:id/cancel`: RTA only
- `POST/PATCH /v2/mf_purchases/batch`: ONDC only, up to 10 orders, one payment

**Create request:**

| Field | Req | Notes |
|---|---|---|
| mf_investment_account | Y | `mfia_…` |
| scheme | Y | ISIN |
| amount | Y | Fresh purchase: within `min/max_initial_investment` and a multiple of `initial_investment_multiples`. Additional purchase: the "additional" limits. |
| user_ip | Y | IPv4 |
| folio_number | N | Omit for a new folio (nomination consent is then needed). |
| server_ip, source_ref_id, euin, partner, scheduled_on | N | |
| gateway | N | Send `"ondc"`. v1 sends it (`RealCybrillaClient.java:3059`). |
| initiated_by / initiated_via | (object attrs) | v1 sends `initiated_via:"web"`. They are not in the create table; ⚠ confirm they are accepted. |

**Object fields:** `id` (`mfp_`), `old_id` (int, this is the payment `amc_order_id`), `mf_investment_account`, `folio_number` (null until success on fresh purchases), `state`, `amount`, `scheme`, `type` (`purchase` | `additional_purchase`), `plan`, `scheduled_on`, `traded_on`, `allotted_nav_date`, `created_at`, `confirmed_at`, `submitted_at`, `succeeded_at`, `failed_at`, `retried_at`, `reversed_at`, `cancelled_at`, `gateway`, `source_ref_id`, `user_ip`, `server_ip`, `initiated_by`, `initiated_via`, `euin`, `partner`, `failure_code`, `order_reference`.

**Allotment reporting.** On `successful`, FP fills in:
- `allotted_units`: rounded to 3 decimals, net of stamp duty (0.005%).
- `purchased_amount`: amount after stamp duty.
- `purchased_price`: NAV.
- `allotted_nav_date`, `traded_on`, `folio_number`.

**ONDC/cybrillapoa sequence.** There are two documented variants:
- **Custom checkout** ([DOCS] /fp-cybrillapoa-gateway/custom-checkout; v1 implements this in `InvestorActionService.java:722-731`):
  1. `POST` → `under_review`
  2. → `pending` (event `mf_purchase.review_completed`) or `failed`
  3. `PATCH consent`
  4. create payment
  5. `PATCH state:confirmed`
  6. → `submitted`
  7. investor pays
  8. → `successful` / `failed`
- **Payment-retry flow** ([DOCS] /fp-cybrillapoa-gateway/payment-retry): consent → confirm → `submitted`, **then** create the payment. "The order will not be marked as failed due to payment failure. It stays submitted, allowing you to retry payment creation multiple times." A retry is allowed if the previous payment `failed`, the order is still `submitted`, and there is no successful or pending payment.
- ⚠ Recommend building the second flow (payment after submission): it supports retries without new consent.

**Sandbox:** amounts ending in 0 succeed and amounts ending in 1 fail after ONDC submission. Only ABSL and ICICI Pru schemes exist in sandbox ([DOCS] /fp-cybrillapoa-gateway/sandbox-simulation). `POST /api/oms/simulate/orders/{amc_order_id} {status: PAYMENT_CONFIRMED|SUBMITTED|SUCCESSFUL|FAILED|REVERSED}`.

### 3.3 mf_purchase_plans (SIP)
Endpoints ([API-REF] MF Purchase Plans):
- `POST /v2/mf_purchase_plans`
- `PATCH /v2/mf_purchase_plans`
- `GET /v2/mf_purchase_plans/:id`
- `GET /v2/mf_purchase_plans?mf_investment_account=&states=`
- **Cancel: `POST /v2/mf_purchase_plans/cancel {id, cancellation_code, cancellation_reason?}`**. v1 already uses this (`RealCybrillaClient.java:1525-1550`). The SDK's older `/:id/cancel` form is superseded for purchase plans; redemption and switch plans still use `/:id/cancel`.
- Skip instructions: `POST /v2/mf_purchase_plans/:id/skip_instructions {from, to?}`; `GET /v2/mf_purchase_plans/skip_instructions/:id`; `POST /v2/mf_purchase_plans/skip_instructions/:id/cancel`; `GET /v2/mf_purchase_plans/:id/skip_instructions`.
- Batch (ONDC): `POST/PATCH /v2/mf_purchase_plans/batch`.

**Create request:**
- Required: `mf_investment_account`, `scheme`, `frequency`, `amount`, `number_of_installments` (≥1), `systematic` (true means a registered SIP), `user_ip`.
- `installment_day`: required except for `daily`.
- Optional: `folio_number`, `payment_method` (`"mandate"`), `payment_source` (mandate id as a string; must be given together with `payment_method`), `purpose` (`children_education`, `children_marriage`, `house`, `car`, `travel`, `retirement`, `others`), `generate_first_installment_now`, `auto_generate_installments`, `activate_after` (RTA only), `initiated_by`, `initiated_via`, `euin`, `server_ip`, `source_ref_id`, `consent`, `partner`.
- There is no `start_date` input. v1 found that `start_date` is rejected and that `gateway`/`initiated_via` are rejected on plans (`RealCybrillaClient.java:3094-3103`). ⚠ For ONDC plans the documented parameters include no `gateway`, yet the example object shows `"gateway":"ondc"`. Routing is inferred (v1 observation). Confirm with Cybrilla.
- Amount must be a multiple of the SIP multiple and within the SIP min/max (from the scheme thresholds).

**ONDC plan flow:**
1. Create → `created`.
2. Async review → `review_completed` (event `mf_purchase.review_completed`) or `failed`.
3. `PATCH {id, consent, state:"confirmed"}`. "Ensure that an **APPROVED mandate** is added as payment_source … before it is confirmed."
4. → `submitted` → `active`, automatically.

v1 polls for `review_completed/active/confirmed` (`InvestorActionService.java:579-600`).

**ONDC limits:**
- "Currently only daily and monthly frequencies are supported. calendar_day_daily is also supported for limited set of customers".
- "generate_installment_now=true option is not available … for Plans". Note: the mandate-payments use-case page ([DOCS] /fp-cybrillapoa-gateway/mandate-payments-usecases) does use `generate_first_installment_now=true` for ONDC, and v1 sends it (`RealCybrillaClient.java:3077`). ⚠ CONFLICT: verify in sandbox.
- Monthly instalment days 29–31 are not supported. v1 clamps to 28 (`RealCybrillaClient.java:3117-3121`).
- There must be at least one day between SIP registration and the first instalment day unless the first instalment is paid on registration day ([DOCS] /fp-cybrillapoa-gateway/usecase-monthly-sips).

**Plan states** ([API-REF] "FP Transaction Plans"):
- Base states: `created → active → completed`, `created|active → cancelled`, and `failed`.
- ONDC adds `review_completed`, `confirmed` and `submitted`.
- Plan attributes: `start_date`, `end_date`, `next_installment_date`, `previous_installment_date`, `remaining_installments`, `activated_at`, `cancelled_at`, `completed_at`, `failed_at`, `cancellation_scheduled_on`, `cancellation_code`, `auto_cancelled`, `reason`, `requested_activation_date`.
- Cancellation takes effect immediately; instalments already generated are unaffected.

**Instalments** are ordinary `mf_purchases` with `plan` set. List them with `GET /v2/mf_purchases?plan=<id>`. They are only visible on or after the instalment day. With a mandate, FP debits automatically and then submits the order. v1 manually creates the first NACH payment after `generate_first_installment_now` (`InvestorActionService.java:522-531`), which matches the use-case doc: "no payment will be created for the first installment if it is generated … where generate_first_installment_now is true".

**Cancellation codes:** `amount_not_available`, `investment_returns_not_as_expected`, `exit_load_not_as_expected`, `switch_to_other_scheme`, `fund_manager_changed`, `investment_goal_complete`, `mandate_not_ready`, `invest_later`, `customer_support_not_satisfactory`, `amc_support_not_satisfactory`, `custom_reason` (needs `cancellation_reason`). The system code `consecutive_failed_installment_limit_exceeded` is set when a plan is auto-cancelled: after 3 consecutive failed instalments for monthly, 2 for quarterly (SEBI circular of 03-Jan-2024).

**Pause / skip:**
- Skip instructions take `{from (date, must be after today), to (required for systematic plans)}`. They start `pending`, become `active` on `from`, and end `completed`. Instalments in the window are generated as `cancelled`.
- FP validates that the skip count is at least 1 below the SEBI failed-instalment limit.
- Place the instruction at least 2 calendar days before `from`.
- ⚠ [API-REF]: "This feature is currently available for **RTA**" and only for monthly, quarterly, half-yearly and yearly plans. [POA-DOCS] capabilities.md lists "Skip an installment" for ONDC folios. **Whether FP exposes SIP pause for cybrillapoa is UNCONFIRMED.**

**Modifying the SIP amount (or swapping the mandate) on ONDC:**
- Use `POST /v2/mf_plan_modification_instructions {plan, amount | (payment_method:"mandate", payment_source:<new mandate id>), consent}` and `GET /v2/mf_plan_modification_instructions/:id`.
- States: `created`, `completed`, `failed`. Each instruction does either an amount change or a mandate change, never both. "A mandate can be changed only once per plan." "Only applicable for ONDC gateway." It applies to future instalments of active SIPs, SWPs and STPs ([API-REF], section hidden in the page nav).
- `PATCH /v2/mf_purchase_plans` amount changes are **RTA only**.

### 3.4 mf_redemptions
Endpoints:
- `POST`, `PATCH`, `GET /:id`, `GET ?mf_investment_account=&plan=&skip_instruction=&states=`
- `POST /v2/mf_redemptions/summary {mf_investment_account, folio, scheme}`: pre-redemption summary for **instant** redemption limits only.

**Create request:**

| Field | Req | Notes |
|---|---|---|
| mf_investment_account | Y | |
| scheme | Y | ISIN |
| folio_number | Y | |
| amount | N | Within `min/max_withdrawal_amount`, multiple of `withdrawal_multiples` |
| units | N | "**Redemption by units only allowed for rta gateway**" |
| user_ip | Y | |
| server_ip, source_ref_id, euin, partner | N | |
| redemption_mode | N | `normal` (default) or `instant` (RTA only) |
| gateway | N | `ondc` |

- If both `amount` and `units` are left out, the order redeems the **entire holding**.
- ONDC: "redemption orders can only be placed for folios that are created using ONDC gateway".
- ONDC flow: `under_review` → `pending` (`mf_redemption.review_completed`) → `PATCH {id, state:"confirmed", consent}` → `submitted` → `successful` / `failed`.
- Report-back fields: `redeemed_units`, `redeemed_amount`, `redeemed_price`, `redeemed_nav_date`, `traded_on`.

⚠ CONFLICT: [POA-DOCS] capabilities.md says ONDC folios support "Redemption (by units, amount, redeem all)". [API-REF] says units are RTA only. v1 sends `units` together with `gateway:"ondc"` (`RealCybrillaClient.java:3138-3154`). Test this in sandbox. Until it is confirmed, convert unit redemptions to amount redemptions, or use "redeem all".

### 3.5 mf_switches
Endpoints: `POST`, `PATCH`, `GET /:id`, `GET ?mf_investment_account=&plan=&skip_instruction=&states=`.
- Create: `mf_investment_account`, `folio_number` (Y), `switch_out_scheme`, `switch_in_scheme` (Y), `amount` or `units` (neither means switch all), `user_ip` (Y), `server_ip`, `source_ref_id`, `euin`, `partner`. **There is no `gateway` parameter.**
- Confirm with `PATCH {id, state:"confirmed", consent}`. Consent is required.
- Reported fields: `switched_out_units/amount/price` and `switched_in_units/amount/price`.
- Eligibility: `switch_out_allowed` and `switch_in_allowed`, plus minimums and multiples (OMS scheme fields).
- ⚠ [API-REF]: the switch object's `gateway` "Possible values: rta" only. [DOCS] capabilities and [POA-DOCS] list Switch as supported on ONDC. **Whether switches work on ONDC through FP is UNCONFIRMED.** v1 never called switches (map:be-integrations report).

### 3.6 mf_switch_plans (STP) and mf_redemption_plans (SWP)
**Switch plans (STP):**
- `POST /v2/mf_switch_plans`, `PATCH`, `GET /:id`, `GET ?states=`, `POST /v2/mf_switch_plans/:id/cancel`.
- Create: `mf_investment_account`, `switch_out_scheme`, `switch_in_scheme`, `frequency`, `folio_number` (Y), `amount`, `installment_day`, `number_of_installments`, `systematic`, `user_ip` (Y), plus `generate_first_installment_now`, `auto_generate_installments`, `activate_after`, `initiated_by/via`, `euin`, `server_ip`, `source_ref_id`, `consent`, `partner`.
- Instalments: `GET /v2/mf_switches?plan=`.

**Redemption plans (SWP):**
- `POST /v2/mf_redemption_plans`, `PATCH`, `GET`, `POST /v2/mf_redemption_plans/:id/cancel`.
- Same field set, with `scheme` in place of the two switch schemes.
- Instalments: `GET /v2/mf_redemptions?plan=`.

**ONDC notes for both:**
- States `created → review_completed → (PATCH consent + state:confirmed) → submitted → active`.
- "**Currently only monthly frequency is supported**."
- `generate_first_installment_now` is not available.
- Amount changes through modification instructions only.
- ⚠ CONFLICT: the same [API-REF] "Plan Mode" section says "For ondc as gateway, currently only MF Purchase plans are supported", which is probably stale. Verify in sandbox.

### 3.7 Events for orders
[API-REF] Events:
- `mf_purchase.{created,confirmed,submitted,successful,failed,cancelled,reversed}`, and the same set for `mf_redemption.*` and `mf_switch.*`.
- `mf_purchase_plan.{created,activated,cancelled,failed,completed}`, and the same for redemption and switch plans.
- ONDC additionally delivers `mf_purchase.review_completed` and `mf_redemption.review_completed`. These appear in the ONDC notes but are **missing from the documented event-type list**; ⚠ confirm the subscription name.

---

## 4. Payments and mandates

### 4.1 Lumpsum payment
Endpoint: `POST /api/pg/payments/netbanking`. This single endpoint handles both netbanking and UPI.

| Field | Notes |
|---|---|
| amc_order_ids | int[]. These are purchase `old_id`s. |
| method | `NETBANKING` \| `UPI`. **Mandatory when the provider is ONDC.** |
| payment_postback_url | Browser redirect target |
| bank_account_id | int. FP bank account `old_id` (used for TPV). |
| provider_name | `ONDC` for cybrillapoa (v1 `RealCybrillaClient.java:79, 1248`) |
| upi | `{type:"uri"}` for intent or QR; `{type:"collect", vpa}` for collect ([DOCS] custom-checkout) |

- ⚠ The docs example shows `"URI"`. v1 got the error "upi.type Should be either uri or collect" and had to send lowercase `uri` (`RealCybrillaClient.java:1217-1219, 1266-1283`). Use lowercase.
- Response: `{id, token_url, upi:{type,vpa,uri}}`.
- Netbanking: send the investor to `token_url`. It is single-use and valid for 15 minutes ([DOCS] /payments/payments-via-Netbanking-UPI/).
- UPI intent/QR: the `upi.uri` arrives with the `payment.updated` webhook after the order is `submitted`. The fallback is `GET /api/pg/payments/:id`.
- Offer only one UPI method per order ("no provision to create multiple payments against the same order(s)").
- Payments and mandates are issued **in Cybrilla's name**, so investors will see "Cybrilla" in their UPI app and bank statement. The UX copy needs to explain this ([DOCS] custom-checkout).
- Capability note: UPI and netbanking are **lumpsum only**. Mandates are single lumpsum or SIP, never batch ([DOCS] /fp-cybrillapoa-gateway/capabilities).

**Postback.** A browser form POST to `payment_postback_url` with fields `paymentId`, `status` (`success`/`failure`/`pending`), `failureCode`, `failureReason`.
- The SDK's "verification" only checks `SHA256(tenant + payment_id) == hash` ([SDK] `postBackVerification`). That is not a secret.
- **Never trust a postback.** Always re-fetch the payment on the server.

**Payment object** (`GET /api/pg/payments/:id`; list at `GET /api/pg/payments?from&to&payment_type&payment_status&amc_order_ids&direction&page&size`):
- Fields: `id`, `payment_type` (`NETBANKING`/`NACH`/`AUTH_TRANSACTION`), `status`, `amount`, `method` (`NETBANKING`/`UPI`/`EMANDATE`), `debit_date`, `amc_order_ids`, `failure_code`, `failed_reason`, `created_at`, `submitted_at`, `debit_confirmed_at`, `failed_at`, `transfer_initiated_at`, `settled_at`, `rejected_at`, `from_bank_account_id`, `provider_name`, `late_auth`, `refund_*`, `upi`.
- Statuses: `PENDING`, `SUCCESS`, `FAILED`, `INITIATED` (transfer to the AMC started), `APPROVED` (transferred to the AMC). NACH payments also use `SUBMITTED`.

### 4.2 Mandates (eNACH and UPI Autopay)
[API-REF] Mandates:

**Create: `POST /api/pg/mandates`**

| Field | Notes |
|---|---|
| mandate_type | `E_MANDATE` (eNACH) \| `UPI` (UPI Autopay). ⚠ The custom-checkout page shows lowercase `"upi"`; confirm case sensitivity. |
| bank_account_id | Long: the bank account `old_id` |
| mandate_limit | E_MANDATE max ₹1 crore. UPI: ₹1 lakh max (limits are per transaction on Razorpay, per day on BillDesk). |
| provider_name | **Mandatory for ONDC: `CYBRILLAPOA`** |
| valid_from / valid_to | Default: authorisation date to +30 years |

- The response returns `id` (int) and `mandate_ref`.
- UPI Autopay is an "on-demand feature": ask support to enable it.

**Authorise: `POST /api/pg/payments/emandate/auth {mandate_id, payment_postback_url?, upi?:{type:"uri"|"collect", vpa?}}`**
- eNACH returns `token_url`. UPI returns `upi.uri` (a `upi://mandate?...` link to use as intent or QR) or triggers a collect request.
- Postback is a form POST with `paymentId`, `status`, `failureReason`.
- UPI Autopay takes a ₹1 authorisation debit that is refunded.
- Several authorisation attempts are allowed while the mandate is in `CREATED`.

**Other mandate endpoints:**
- Fetch: `GET /api/pg/mandates/:id`. Fields: `id`, `bank_account_id`, `mandate_ref`, `mandate_token`, `valid_from`, `valid_to`, `mandate_limit`, `mandate_type`, `mandate_status`, `umrn`, `created_at`, `received_at`, `submitted_at`, `approved_at`, `rejected_at`, `cancelled_at`, `rejected_reason`, `provider_name`.
- List: `GET /api/pg/mandates?bank_account_id=a,b&page&size`.
- Cancel: `POST /api/pg/mandates/:id/cancel`. Only APPROVED mandates can be cancelled. SIP debits on a cancelled mandate fail.

**Mandate states** ([DOCS] /payments/managing-eNACH/):
- `CREATED`: waiting for the investor.
- `RECEIVED`: BSE only.
- `SUBMITTED`: authorised, bank approval pending (up to T+1).
- `APPROVED`
- `REJECTED`
- `CANCELLED`

**Linking a mandate:**
- Put it on the purchase plan as `payment_method:"mandate"`, `payment_source:"<mandate id>"`. For ONDC it must be APPROVED before the plan is confirmed.
- Charge a lumpsum or instalment from the mandate with `POST /api/pg/payments/nach {mandate_id, amc_order_ids}`. For CYBRILLAPOA: one AMC order per payment, and the mandate must be APPROVED.
- One mandate can fund several SIPs, with one debit per SIP ([DOCS] usecase-monthly-sips).

⚠ **The locked v2 mandate rule (max(₹1,00,000, 2× instalment)) is not compatible with UPI Autopay.** The UPI cap is ₹1 lakh, so keep the formula for eNACH only.

**Sandbox:**
- `POST /api/pg/simulate/mandates/{id} {status}` and `/api/pg/simulate/payments/{id} {status}` (v1 `RealCybrillaClient.java:77-78, 1295-1372`).
- API-REF "Payment/Mandate Simulation": `/api/pg/simulate/...`.

---

## 5. Onboarding: objects and required order

⚠ The ONDC migration guide says that on the ONDC route "you **must** use Pre verification APIs" for PAN, name, DOB, KYC and bank checks, and it recommends **KYC Forms** for KYC ([DOCS] /fp-cybrillapoa-gateway/rta_ondc_migration_guide). v1 uses both `/v2/kyc_requests` and KYC Forms (`RealCybrillaClient.java:767-925`). For v2, standardise on POA pre_verifications and KYC Forms.

**Recommended sequence for a self-onboarding investor:**

1. **POA pre-verification** ([POA-DOCS] `docs/additional-apis/pre-verifications.md`):
   - Call: `POST /poa/pre_verifications {investor_identifier: PAN, pan:{value}, name:{value}, date_of_birth:{value}, bank_accounts?:[{value:{account_number, ifsc_code, account_type (savings|current|nre_savings|nro_savings, case-sensitive), bank_account_proof?}, verify_manually_if_required?}]}`.
   - Status goes `accepted` → `completed`. Poll `GET /poa/pre_verifications/:id` or subscribe to `pre_verification.accepted` / `pre_verification.completed`.
   - `readiness.code` values and actions:
     - `kyc_unavailable`, `kyc_rejected` → fresh KYC form
     - `kyc_incomplete`, `kyc_onhold`, `kyc_legacy` → modify KYC form
     - `kyc_underprocess` → wait
     - `kyc_deactivated` → block
     - `unknown`
     - `upstream_error` → retry
   - `pan.code`: `invalid`, `aadhaar_not_linked`, `upstream_error`. `name.code` and `date_of_birth.code`: `mismatch`.
   - Bank `code`: `bank_verification_failed`, `low_confidence`, `uncertain` (re-verify with `verify_manually_if_required:true`; manual turnaround is 1 business day), `bank_account_proof_required` (NRI).
   - FP `POST /api/kyc/check {pan}` returns only a boolean status and constraints for ARN holders: "AMFI regulated ARN holders cannot avail" the demographic `entity_details` ([API-REF] KYC Checks).
2. **KYC Form** (only if needed) ([POA-DOCS] `docs/additional-apis/kyc-forms.md`):
   - Create: `POST /poa/kyc_forms {type: fresh|modify, pan, name, date_of_birth, proof_details_callback_url, esign_callback_url}`, then `PATCH /poa/kyc_forms {id, …}` with the fields that `requirements.fields_needed` asks for:
     - `email_address`, `phone_number{isd,number}`, `residential_status` (`resident`), `gender`, `marital_status`, `father_name` or `spouse_name`, `occupation_type`
     - `aadhaar_number` (last 4 digits), `country_of_birth`, `place_of_birth` (60 characters max), `income_slab`, `pep_details` (`pep` \| `related_pep` \| `no_exposure`)
     - `citizenship_countries[]`, `nationality_country`, `tax_residency_other_than_india`, `non_indian_tax_residency_1..3{country, taxid_number}`, `geo_location{latitude, longitude}` (must be inside India)
   - Redirect the investor to `proof_details.fetch_url` for the DigiLocker Aadhaar fetch (identity and address proof). If `proof_details.status=failed`, call `POST /poa/kyc_forms/:id/retry_proof_details_fetch`.
   - Upload the wet signature with `POST /poa/kyc_forms/:id/signature` (multipart `file`; png/jpg/jpeg/pdf up to 5 MB).
   - When `fields_needed` is empty, the form goes to `awaiting_esign`. Send the investor to `esign_details.esign_url`. The form then moves `awaiting_submission` → `submitted` or `failed` (see `reason`). It expires 7 days after creation. Only one live form per PAN is allowed.
   - Events: `kyc_form.{under_review, created, awaiting_esign, awaiting_submission, submitted, failed, expired, updated}`.
   - Sandbox: PANs `XXXPXNNNNX` are submitted and `XXXPXNNNNR` fail.
3. **Investor profile.** `POST /v2/investor_profiles` ([API-REF] Investor Profiles):
   - Fields: `type:"individual"` (required), `tax_status` (`resident_individual` \| `nri`; immutable), `name` (70 characters max, no special characters), `date_of_birth` (immutable), `gender` (`male` \| `female` \| `transgender`), `occupation` (enum; per v1, effectively immutable once set: `RealCybrillaClient.java:2637-2640, 2804`), `pan` (4th character `P`; needs `tax_status`), `country_of_birth` (immutable), `place_of_birth` (must differ from the country), `use_default_tax_residences:true` (India plus PAN), `first..fourth_tax_residency{country, taxid_type, taxid_number, applicable_from, applicable_to}`, `nationality_country`, `source_of_wealth`, `income_slab`, `pep_details`, `ip_address`.
   - Enums:
     - `income_slab`: `upto_1lakh`, `above_1lakh_upto_5lakh`, `above_5lakh_upto_10lakh`, `above_10lakh_upto_25lakh`, `above_25lakh_upto_1cr`, `above_1cr`
     - `pep_details`: `pep_exposed`, `pep_related`, `not_applicable`
     - `source_of_wealth`: `salary`, `business`, `gift`, `ancestral_property`, `rental_income`, `prize_money`, `royalty`, `others`
   - **Bug in v1:** v1 maps income to `between_1_to_5_lakhs`, `above_25_lakhs` and so on, and PEP to `applicable` (`RealCybrillaClient.java:2837-2885`). None of these are valid FP values. They only work today because everyone falls back to the defaults `upto_1lakh` / `not_applicable`.
   - The KYC-form PEP enum (`pep` / `related_pep` / `no_exposure`) is different from the profile enum. Keep two separate mappings.
   - There is no DELETE endpoint for profiles (v1 `BE/docs/cybrilla-sandbox-investor-reset.md:5-9`).
4. **Contacts:**
   - `POST /v2/phone_numbers {profile, isd, number, belongs_to}`
   - `POST /v2/email_addresses {profile, email, belongs_to}`
   - `POST /v2/addresses {profile, line1, line2?, line3?, city, state, postal_code, country, nature}`. `nature` is required for ONDC ([DOCS] ONDC overview and migration guide).
   - v1 payload builders: `RealCybrillaClient.java:2918-2947`.
   - `belongs_to` values (v1): `self`, `spouse`, `dependent_child`, `dependent_parent`, `guardian`.
5. **Bank account.** `POST /v2/bank_accounts {profile, primary_account_holder_name, account_number, type, ifsc_code, cancelled_cheque?}`.
   - The response `old_id` (numeric) is what payments and mandates need.
   - ONDC accepts only savings accounts for collection ([DOCS] ONDC overview; [POA-DOCS] "Savings A/C").
   - Optional FP BAV (early access): `POST /v2/bank_account_verifications {bank_account}`. Statuses `pending`, `failed`, `completed`; confidence `very_high`, `high`, `uncertain`, `low`, `very_low`, `zero`.
   - Sandbox account-number suffixes: 1193 pass, 1285 high confidence, 1515 fail/low, 1600 zero, 3157 digital failure (v1 `BE/docs/cybrilla-support-email-draft.md:120-128`).
   - v1 runs FP BAV only for accounts ending in 1193 (`RealCybrillaClient.java:421-424`). That is sandbox logic sitting in production code; do not port it.
6. **Nominees.** `POST /v2/related_parties`:
   - Fields: `profile`, `name` (40 characters max), `relationship` (enum: father, mother, spouse, son, daughter, … `others`), `date_of_birth`, `pan` (adults only), `guardian_name` and `guardian_pan` (minors). Every field is immutable.
   - Upcoming fields: nominee identity-proof numbers, email, phone, address.
   - "Any one among the supported identity proofs should be collected for a related party (or guardian in case of minor) before attempting a new folio creation."
   - **FP supports a maximum of 3 nominees** (`folio_defaults.nominee1..3` plus `nomineeN_allocation_percentage`). Set the v2 nominee cap to 3 or fewer.
   - Opt-out: "If nominee details are not provided in folio defaults, FP assumes that the investor doesn't wish to nominate" ([DOCS] /mf-transactions/investment-account/). There is no explicit opt-out field; the upcoming `nominations_info_visibility` field is `show_all_nominee_names` \| `show_nomination_status`. Keep the signed opt-out declaration and OTP evidence on our side.
7. **MF investment account:**
   - Create: `POST /v2/mf_investment_accounts {primary_investor: invp_…, holding_pattern:"single", folio_defaults?}`.
   - Then `PATCH /v2/mf_investment_accounts {id, folio_defaults:{communication_email_address, communication_mobile_number, communication_address, payout_bank_account, nominee1..3, nomineeN_allocation_percentage, demat_account?}}`. The values are resource IDs.
   - folio_defaults are **required before any order** ("make sure to set the folio_defaults … before you place any order": [API-REF] Orders Overview; v1 `RealCybrillaClient.java:366-415`).
   - AMFI validations are applied here:
     - Names: no special characters.
     - Indian mobile: 10 digits, not starting with 0–5, not all the same digit.
     - Email: exactly one `@`, no trailing dot, top-level domain on the whitelist `.com .in .org .co .net .edu .me .uk`.
8. **Mandate** (optional during onboarding): see §4.2. Before authorising it, the email, mobile and bank must already be on the profile.

**What the investor has to provide:** PAN, name exactly as on the PAN, DOB, verified mobile and email, gender, marital status, father's or spouse's name, occupation, income slab, PEP status, source of wealth, country and place of birth, nationality, foreign tax residency (if any), communication address, geolocation (for KYC), an Aadhaar DigiLocker session, eSign, a photo of their wet signature (fresh or modified KYC only), a savings bank account, nominees (at most 3, each with ID proof) or an opt-out, plus our T&C, execution-only and consent declarations.

---

## 6. Webhooks

**Registration** ([API-REF] Webhook Notifications). You register one subscription per event:
```
POST /v2/notification_webhooks      {url, event, status: "enabled"|"disabled"}
GET  /v2/notification_webhooks?event=
GET  /v2/notification_webhooks/:id
PUT  /v2/notification_webhooks/:id  {url, status}
```

**Payload envelope:** the Event object `{id:"evt_…", object:"event", type, data:{object:<full FP object snapshot>, previous_attributes}, time}`.

**Event types:**
- Documented in [API-REF]: `kyc_request.*`, `mf_purchase.*`, `mf_redemption.*`, `mf_switch.*`, the plan events, `mandate.{created,received,submitted,approved,rejected,cancelled}`, `payment.{pending,updated,success,failed,submitted,initiated,approved,rejected}`.
- Named in other docs: `mf_purchase.review_completed`, `mf_redemption.review_completed`, `pre_verification.{accepted,completed}`, `kyc_form.*`.

**Signature** ([DOCS] /upcoming/beta/webhook-implementation/, a *Beta* page):
- Header: `FP-Signature: <secret_id ntwhsc_…>:<base64 HMAC-SHA256>`, keyed with the tenant webhook secret. Get the secret from fpsupport@cybrilla.com.
- The official Node sample computes the HMAC over **`JSON.stringify(parsedPayload)`**, not the raw body. In the adapter, verify the raw body first and fall back to the re-serialised JSON. ⚠ Confirm the canonical form with Cybrilla.
- v1 instead checks a shared `X-Cybrilla-Webhook-Secret` header (`BE/.../controller/CybrillaWebhookController.java:77-88`). That header is not a documented FP mechanism; replace it.

**Retry and ordering:**
- The retry policy and timeouts are **not published** (⚠ ask Cybrilla).
- Guidance from the docs: return 2xx quickly, store the event, process it asynchronously, and use `time` to discard stale events. "FP does not guarantee delivery of events in the order."

**v2 idempotency:**
- Keep a persistent table with a unique key on `event.id`. This fixes must-fix (d); v1 dedupes in memory only (`CybrillaWebhookController.java:34-50`).
- Handling must be monotonic: apply a state change only if the event `time` is later than our last applied time and the transition is valid.
- Always re-fetch the object from FP before any money or holdings side effect.
- Reconciliation job: `GET /v2/events?type=…` (latest 100; the SDK also lists `fp_object_id`, `from_date`, `to_date` filters, ⚠ undocumented in API-REF), plus polling of non-final orders, plans, payments and mandates.

---

## 7. Holdings, reports, folios, transactions; CAS

| Need | FP endpoint | Notes |
|---|---|---|
| Folios | `GET /v2/mf_folios?mf_investment_account=&folio_number=` | Holder details, nominees, payout bank, `email_addresses[]`, `mobile_numbers[]`. Sourced "after … migration of the reporting files provided by the individual RTAs". In sandbox it is simulated only after an order is simulated as successful. |
| Holdings | `GET /api/oms/reports/holdings?investment_account_id=<old_id>&folios=&as_on=` or `GET /api/oms/investment_accounts/:old_id/holdings` | Per folio and scheme: `holdings{as_on, units, redeemable_units}`, `market_value{as_on, amount, redeemable_amount}`, `invested_value`, `payout`, `nav{as_on, value}` |
| Capital gains | `POST /v2/transactions/reports/capital_gains {mf_investment_account, folios?, scheme?, traded_on_from?, traded_on_to?}` | Per sell lot: `type` (redemption/switch_out), `units`, `traded_on`, `traded_at`, `source_days_held`, `source_purchased_on`, `source_purchased_at`, `source_actual_gain`, `source_taxable_gain`, `grand_fathering`, `grand_fathering_nav`, `indexed_*`. The SDK uses a different path (GET `/v2/transactions/reports/transaction_wise_capital_gain_loss_report`). ⚠ Confirm the path. |
| Returns | `POST /v2/transactions/reports/scheme_wise_returns` and `/investment_account_wise_returns {mf_investment_account, traded_on_to?}` | Includes `invested_amount`, `current_value`, `unrealized_gain`, `absolute_return`, `xirr`, `cagr` |
| Transactions | `GET /transactions?folios=a,b&types=&from=&to=` (at most a 1-year window) | Built from RTA reverse feeds. Types: purchase, redemption, switch_in/out, transfer_in/out, dividend_payout, dividend_reinvestment, bonus. FIFO `sources[]`. `order` links to the FP order. |
| Other reports | `/v2/transactions/reports/{transaction_type_wise_amount_summary, fund_scheme_category_wise_aum_summary, transaction_list}`, `/v2/mf_purchases/reports/mf_purchase_list`, `/v2/mf_redemptions/reports/mf_redemption_list` | Tenant-level operations and reconciliation |

- The reporting data depends on RTA mailback/reverse feeds. Going live includes setting up an RTA mailback subscription. The Files API route (`POST /files` + `POST /file_operations {type:"transaction_processing"}`; feeds: CAMS WBR2, KFin MFSD201, Franklin MTFP, Sundaram ER02) is for self-uploaded feeds ([DOCS] /pages/workflows/investor-reporting-usage/).
- ⚠ UNCONFIRMED: whether holdings, transactions and capital-gains reports are populated automatically for cybrillapoa/ONDC folios in our tenant.
- Recommendation: keep v1's approach of holdings from our own ledger, and use FP reports **only for reconciliation**.
- **There is no FP API for CAS, MF Central or external-holdings import.** Searching [API-REF] for CAS/MFCentral finds only the phrase "scheme name as it appears in the CAS file". The CAS dashboard import needs a separate provider (MF Central CAS API, or CAMS/KFintech CAS PDF parsing).

---

## 8. Fund scheme master

There are two sources. The field counts below come from v1's exports `BE/exports/*.json` (2026-05-14).

**A. The orderable list: `GET /v2/mf_scheme_plans/cybrillapoa?expand=mf_scheme,mf_fund&page&size`**
- Single scheme: `GET /v2/mf_scheme_plans/cybrillapoa/:isin?expand=mf_scheme,mf_fund`; `expand` is mandatory. SIF schemes: `/v2/sif_scheme_plans/cybrillapoa` (404 if not enabled; `RealCybrillaClient.java:1024-1031`).
- Fields: `object`, `gateway`, `mf_scheme.name`, `mf_fund.name` (AMC), `isin`, `type` (`regular` \| `direct`), `option` (`growth`, `bonus`, `idcw`, `idcw_daily`, `idcw_weekly`, `idcw_fortnightly`, `idcw_monthly`, `idcw_quarterly`, `idcw_half_yearly`, `idcw_annual`, `idcw_flexi`), `idcw_option` (`payout` \| `reinvestment` \| null), `active`, `thresholds[]`.
- Threshold types:
  - `lumpsum`: `amount_min/max/multiples`, `additional_amount_*`
  - `withdrawal`: amount and `units_min/max/multiples`
  - `sip`: `frequency`, `amount_*`, `installments_min`, `dates[]`
- Sandbox export: 482 plans, all `type:"regular"`. SIP frequencies seen: `monthly`, `daily`, `calendar_day_daily`.

**B. The descriptive master: `GET /api/oms/fund_schemes?page&size` and `GET /api/oms/fund_schemes/:isin`**
- Fields: `fund_scheme_id`, `name`, `isin`, `amfi_code`, `scheme_code`, `amc_id`, `rta_id`, `plan_type` (REGULAR/DIRECT), `investment_option` (GROWTH/DIV_PAYOUT/DIV_REINVESTMENT), `fund_category`, `sub_category`, `close_ended`.
- Lock-in: `lock_in` and `lock_in_period` in **months** (ELSS example: `true`, 36). `long_term_period`.
- Flags: `purchase_allowed`, `redemption_allowed`, `insta_redemption_allowed`, `sip_allowed`, `swp_allowed`, `stp_in_allowed`, `stp_out_allowed`, `switch_in_allowed`, `switch_out_allowed`.
- Minimums and multiples: initial, additional, withdrawal (amount and units), switch in/out.
- `sip_frequency_specific_data`, `swp_frequency_specific_data` and `stp_frequency_specific_data` are keyed by frequency, each `{dates[], min_installment_amount, max_installment_amount, amount_multiples, min_installments}`.
- Also: `delivery_mode`, `merged`, `merged_to_isin`, `merger_date`, `name_changes`.
- Export: 3,307 schemes. `fund_category` takes **only** EQUITY, DEBT or LIQUID. `sub_category` is free text and not SEBI-aligned (for example "Other Equity Schemes", "Debt(other than assured return schemes)"), and it is blank or null for about 55% of rows.

**Not available from FP:** SEBI category/sub-category taxonomy, riskometer, TER/expense ratio, exit load, AUM, benchmark, fund manager, NAV history. v1 had to scrape `nav` from assorted keys (`RealCybrillaClient.java:3233-3283`). This confirms the locked decision: take NAV from AMFI and curate the rest in admin behind a `FundFactsProvider`. Use A for orderability and limits, B for the ELSS lock-in and eligibility flags, and join the two on ISIN.

---

## 9. Sandbox vs production and other operational points

**Sandbox:**
- Hosts `s.finprim.com` and `api.sandbox.cybrilla.com`, with `*_test_*` clients. Sandbox credentials against production return `{"error":"Realm does not exist"}` (v1 `BE/docs/cybrilla-credentials-and-network-report.md:50-59`).
- Simulations:
  - Orders: amounts ending 0 succeed and 1 fail, or use `/api/oms/simulate/orders/{id}`.
  - Payments and mandates: `/api/pg/simulate/...`.
  - KYC requests: `/v2/kyc_requests/:id/simulate`.
  - Instalment generation: `POST /v2/mf_purchases|mf_redemptions|mf_switches {plan}`.
  - Transaction simulation: file operations (early access).
- Test PAN patterns: readiness verified `XXXPX3751X`; KYC unavailable `XXXPX3753X`; invalid `XXXPINNNNX`; Aadhaar not linked `XXXPANNNNX`; valid `XXXPXNNNNX`; name `Lord Voldemort` gives a mismatch; DOB `2000-01-01` gives a mismatch.
- Only ABSL and ICICI Pru schemes are available.

**Production:**
- Credentials are issued only after the ONDC signup with the ARN, the POA agreement eSign, the product-demo review, and the RTA mailback setup.
- Contacts: customerservice@cybrilla.com and fpsupport@cybrilla.com (webhook secret). The POA auth doc names poa.support@cybrilla.com.
- ⚠ UNCONFIRMED (asked in v1 emails, never answered): IP allowlisting, HMAC request signing for production, and any UAT environment.

**Rate limits:** see §0. Build a token bucket per host.

---

## 10. TypeScript adapter skeleton (verified field names)

```ts
type FpGateway = 'ondc';
type OrderState = 'under_review'|'pending'|'confirmed'|'submitted'|'successful'|'failed'|'cancelled'|'reversed';
type PlanState = 'created'|'review_completed'|'confirmed'|'submitted'|'active'|'cancelled'|'completed'|'failed';
type InitiatedVia = 'web'|'mobile_web'|'mobile_app'|'mobile_app_android'|'mobile_app_ios'|'mobile_web_android'|'mobile_web_ios';
interface FpConsent { email?: string; isd_code?: string; mobile?: string; otp?: string /* instant redemption only */ }
interface OrderCommon { user_ip: string /* IPv4 */; server_ip?: string; source_ref_id: string /* always set */;
  euin?: never /* execution-only: omit */; partner?: never; initiated_by?: 'investor'; initiated_via?: InitiatedVia }
interface CreatePurchase extends OrderCommon { mf_investment_account: string; scheme: string; amount: number; folio_number?: string; gateway: FpGateway; scheduled_on?: string }
interface PatchPurchase { id: string; consent?: FpConsent; state?: 'confirmed' } // ONDC: never both
interface CreateRedemption extends OrderCommon { mf_investment_account: string; scheme: string; folio_number: string; amount?: number; units?: number /* rta-only per API-REF */; redemption_mode?: 'normal'; gateway: FpGateway }
interface CreateSwitch extends OrderCommon { mf_investment_account: string; folio_number: string; switch_out_scheme: string; switch_in_scheme: string; amount?: number; units?: number }
type PlanFrequency = 'daily'|'calendar_day_daily'|'monthly' /* ONDC today */ | 'quarterly'|'half-yearly'|'yearly'|'day_in_a_week'|'four_times_a_month'|'day_in_a_fortnight'|'twice_a_month';
interface CreatePurchasePlan extends OrderCommon { mf_investment_account: string; scheme: string; frequency: PlanFrequency; amount: number;
  installment_day?: number /* 1-28 */; number_of_installments: number; systematic: true; payment_method?: 'mandate'; payment_source?: string;
  purpose?: string; generate_first_installment_now?: boolean; auto_generate_installments?: boolean; folio_number?: string; consent?: FpConsent }
interface PatchPlan { id: string; consent?: FpConsent; state?: 'confirmed' }
interface CancelPurchasePlan { id: string; cancellation_code: string; cancellation_reason?: string } // POST /v2/mf_purchase_plans/cancel
interface CreatePlanModification { plan: string; amount?: number; payment_method?: 'mandate'; payment_source?: number; consent: FpConsent }
interface CreatePayment { amc_order_ids: number[]; method: 'NETBANKING'|'UPI'; bank_account_id: number; payment_postback_url?: string;
  provider_name: 'ONDC'; upi?: { type: 'uri' } | { type: 'collect'; vpa: string } }
interface CreateMandate { mandate_type: 'E_MANDATE'|'UPI'; bank_account_id: number; mandate_limit: number; provider_name: 'CYBRILLAPOA'; valid_from?: string; valid_to?: string }
interface AuthorizeMandate { mandate_id: number; payment_postback_url?: string; upi?: { type: 'uri' } | { type: 'collect'; vpa: string } }
interface FpEvent<T = unknown> { id: string; object: 'event'; type: string; time: string; data: { object: T; previous_attributes: Record<string, unknown> | null } }
```

---

## 11. v1 defects found while cross-checking (fix these in v2)

1. `income_slab` and `pep_details` values are not valid FP enums (`RealCybrillaClient.java:2837-2885`; see §5).
2. `user_ip` is hard-coded to `127.0.0.1` (`RealCybrillaClient.java:3058, 3100`).
3. The webhook check uses `X-Cybrilla-Webhook-Secret` instead of the FP-Signature HMAC, and dedupe is in memory only (`CybrillaWebhookController.java:34-115`).
4. The undocumented `Idempotency-Key` header is used as if it were FP idempotency (`RealCybrillaClient.java:66, 2053`). Use a unique `source_ref_id` instead.
5. Redemptions send `units` with `gateway:"ondc"` (`RealCybrillaClient.java:3150-3152`).
6. The sandbox-only 1193 BAV branch is in production code (`RealCybrillaClient.java:421-424`).
7. The FP order is created before 2FA (`InvestorActionService.java:710-731`; already known must-fix (a)).
8. v1 can send `quarterly` for SIPs (`RealCybrillaClient.java:3177-3185`), which ONDC plans reject.

---

## 12. Open questions and conflicts: the product owner and Cybrilla must resolve these before sprint planning

| # | Topic | Conflict / gap | Impact on the locked scope |
|---|---|---|---|
| 1 | Quarterly SIP | ONDC purchase plans support only daily and monthly; quarterly is "RTA only" ([API-REF]) | Locked "MONTHLY/QUARTERLY" is not deliverable. Launch monthly only. |
| 2 | SIP pause | Skip instructions are documented as RTA only; POA docs say "Skip an installment" works on ONDC | The pause feature may not exist through FP. Verify. |
| 3 | SIP amount change | ONDC only through `mf_plan_modification_instructions`; one mandate change per plan | Build against this API |
| 4 | Redeem by units | API-REF says RTA only; POA docs say units work on ONDC | Launch amount and "all"; units only after a sandbox test |
| 5 | Switch / STP / SWP | Switch object shows `gateway: rta` only; the "Plan Mode" note says only purchase plans on ONDC; the ONDC notes for switch and redemption plans (monthly only) and the capabilities pages say they are supported | Verify in sandbox before committing |
| 6 | Redemptions, switches, SWP/STP only on ONDC-created folios | "only folios created via the ONDC gateway" | Holdings imported via CAS cannot be redeemed or switched on the platform |
| 7 | UPI Autopay | ₹1 lakh cap; on-demand enablement | Locked mandate-limit formula is valid for eNACH only |
| 8 | EUIN auto-fill and execution-only tag | Examples show an EUIN on ONDC orders with no partner; there is no declaration field | Confirm blank EUIN reaches the AMC and ask what evidence POA wants |
| 9 | ONDC purchase sequence | Custom-checkout: payment before confirm. Payment-retry: payment after `submitted` | Prefer payment after submission (retries without new consent) |
| 10 | `generate_first_installment_now` on ONDC | API-REF says not available; the mandate use-case doc and v1 use it | Verify |
| 11 | Webhook canonical signing input, retry policy, `review_completed` / `pre_verification` / `kyc_form` subscription names | Beta docs | Ask Cybrilla |
| 12 | FP reports for ONDC folios | Depend on the mailback subscription | Use them for reconciliation only |
| 13 | CAS / external holdings | No FP support | Separate provider needed |
| 14 | IPv6 client IPs | `user_ip` must be IPv4 | Ask Cybrilla |
| 15 | Nominee cap | FP allows at most 3 nominees; SEBI allows up to 10 (the brief asks for primary-source verification) | Set the v2 config cap to 3 or fewer for FP |
