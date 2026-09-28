<!-- source: workflow wf_1d1c9b02-593 label research:rules-fp-contracts (brand-renamed) | exported 2026-09-28 -->

# Cybrilla FintechPrimitives (FP) and POA contracts used by v1, for the v2 TypeScript adapter

Everything here was read directly from v1's code. I did not modify any file. No secret values appear; credential parameters are named only. Code wins over comments: where a rule rests only on a comment or doc note, it is marked **(comment-only)** or given Medium/Low confidence.

**Path aliases** (all under `C:/Users/pc/Desktop/WeathTech_v2/investor/platiziowealthtech-Back_end/`):

| Alias | Path |
|---|---|
| **RCC** | `src/main/java/com/platizio/wealthtech/integration/RealCybrillaClient.java` |
| **IF** | `.../integration/CybrillaClient.java` |
| **MOCK** | `.../integration/MockCybrillaClient.java` |
| **TOK** | `.../integration/auth/ExternalBearerTokenService.java` |
| **FPP** | `.../integration/auth/FinprimTenantProperties.java` |
| **POAP** | `.../integration/auth/CybrillaPreVerificationProperties.java` |
| **WH** | `.../controller/CybrillaWebhookController.java` |
| **KYC** | `.../service/InvestorKycService.java` |
| **KYCF** | `.../service/InvestorKycFormService.java` |
| **INV** | `.../service/InvestorService.java` |
| **ACT** | `.../service/InvestorActionService.java` |
| **ORD** | `.../service/OrderService.java` |
| **TEST** | `src/test/java/com/platizio/wealthtech/integration/RealCybrillaClientTest.java` |
| **WHT** | `src/test/java/com/platizio/wealthtech/controller/CybrillaWebhookControllerTest.java` |

(`.../` = `src/main/java/com/platizio/wealthtech`.)

---

## 0. Summary table (every provider call v1 makes)

"Idem" means v1 sends an `Idempotency-Key` header.

| # | Operation | Method + path | Audience | Idem | Where |
|---|---|---|---|---|---|
| 1 | OAuth token | POST `{tokenUrl}` (form) | – | – | TOK:198-260 |
| 2 | Pre-verification create | POST `/poa/pre_verifications` | POA | no | RCC:709-713, 1994-2007 |
| 3 | Pre-verification fetch | GET `/poa/pre_verifications/{pv_id}` | POA | – | RCC:730-739, 687-698 |
| 4 | KYC compliance check | POST `/api/kyc/check` | FP | no | RCC:741-752 |
| 5 | KYC compliance fetch / refetch | GET `/api/kyc/{id}`, PUT `/api/kyc/{id}/refetch` | FP | – | RCC:754-764 |
| 6 | KYC requests: list, create, fetch, update, simulate | GET `/v2/kyc_requests?pan=&status=`; POST `/v2/kyc_requests`; GET `/v2/kyc_requests/{id}`; **PATCH `/v2/kyc_requests/{id}`**; POST `/v2/kyc_requests/{id}/simulate` | FP | no | RCC:803-864 |
| 7 | Identity documents: create, fetch, list | POST `/v2/identity_documents`; GET `/v2/identity_documents/{id}`; GET `/v2/identity_documents?kyc_request=&fetch.status=` | FP | no | RCC:866-913 |
| 8 | eSign create / fetch | POST `/v2/esigns`; GET `/v2/esigns/{id}` | FP | no | RCC:915-925 |
| 9 | KYC forms (modify flow) | POST `/poa/kyc_forms`; PATCH `/poa/kyc_forms` (id in body); GET `/poa/kyc_forms/{id}`; POST `/poa/kyc_forms/{id}/signature` (multipart); POST `/poa/kyc_forms/{id}/retry_proof_details_fetch` | POA | no | RCC:766-801 |
| 10 | Investor profiles | GET `/v2/investor_profiles?pan=` or `?type=individual`; GET `/v2/investor_profiles/{id}`; POST `/v2/investor_profiles`; PATCH `/v2/investor_profiles` (id in body) | FP | no | RCC:122-289, 2690-2709 |
| 11 | Addresses / emails / phones | GET `/v2/{addresses\|email_addresses\|phone_numbers}?profile=`; POST the same paths | FP | no | RCC:1572-1988 |
| 12 | Bank accounts | POST `/v2/bank_accounts`; GET `/v2/bank_accounts/{bac_id}`; GET `/v2/bank_accounts?profile=` | FP | no | RCC:575-663, 1316-1323 |
| 13 | FP bank-account verifications | POST `/v2/bank_account_verifications`; GET `/v2/bank_account_verifications/{id}` | FP | no | RCC:417-494, 687-698 |
| 14 | MF investment accounts | GET `/v2/mf_investment_accounts?primary_investor=`; POST `/v2/mf_investment_accounts`; PATCH `/v2/mf_investment_accounts` (folio_defaults) | FP | no | RCC:299-415 |
| 15 | IFSC / pincode lookup | GET `/api/onb/ifsc_codes/{ifsc}`; GET `/api/onb/pincodes/{pincode}` | FP | – | RCC:1105-1165 |
| 16 | Scheme catalogue | GET `/v2/mf_scheme_plans/cybrillapoa?expand=mf_scheme,mf_fund&page=&size=`; GET `/v2/sif_scheme_plans/cybrillapoa?expand=sif_scheme,sif_fund&...`; GET `/api/oms/fund_schemes?page=&size=` | FP | – | RCC:927-1071, 2142-2378 |
| 17 | Lumpsum purchase | POST `/v2/mf_purchases`; GET `/v2/mf_purchases/{id}`; PATCH `/v2/mf_purchases` (consent; or `state:"confirmed"`); POST `/v2/mf_purchases/{id}/cancel`; GET `/v2/mf_purchases?plan={mfpp_id}` | FP | create and cancel only | RCC:1073-1092, 1167-1186, 1304-1314, 1394-1401, 1552-1570 |
| 18 | SIP plan | POST `/v2/mf_purchase_plans`; GET `/v2/mf_purchase_plans/{id}`; PATCH `/v2/mf_purchase_plans`; POST `/v2/mf_purchase_plans/cancel` | FP | create and cancel | RCC:1374-1392, 1418-1442, 1524-1550 |
| 19 | Redemption | POST `/v2/mf_redemptions`; GET `/v2/mf_redemptions/{id}`; PATCH `/v2/mf_redemptions` (consent; or `state:"confirmed"`) | FP | create | RCC:1444-1522 |
| 20 | Payments | POST `/api/pg/payments/netbanking` (also used for UPI); GET `/api/pg/payments/{int}`; POST `/api/pg/payments/nach`; POST `/api/pg/simulate/payments/{int}` | FP | no | RCC:1188-1302, 1403-1416 |
| 21 | Mandates | POST `/api/pg/mandates`; POST `/api/pg/payments/emandate/auth`; GET `/api/pg/mandates/{int}`; POST `/api/pg/simulate/mandates/{int}` | FP | no | RCC:1325-1372 |
| 22 | Webhooks (inbound) | POST `/api/v1/cybrilla/webhooks`, header `X-Cybrilla-Webhook-Secret` | – | in-memory dedupe | WH:29-115 |

- **v1 never calls:** switch, STP, SWP, or SIP pause/skip. `TransactionType` lists `SWITCH, SWP, STP, PAUSE_RECURRING_PLAN` (`.../domain/TransactionType.java`), but no FP call exists for them. v2 must source those contracts from FP documentation.
- **No holdings API:** v1 has no FP holdings or transactions-report call. Holdings come from the local order ledger.
- **No ARN/EUIN anywhere:** a case-insensitive grep of RCC for `euin`/`arn`/`partner` finds nothing (see the SME questions in section 16).

---

## 1. Transport, authentication, retries, errors (shared by every call)

### 1.1 Two base URLs, two token audiences
| Client | Base URL property (default) | Token audience | Headers |
|---|---|---|---|
| `restClient` (FP tenant) | `finprim.base-url` (default `https://s.finprim.com`), FPP:13 | FINPRIM_TENANT | `Authorization: Bearer <tenant token>`; `x-tenant-id: <tenant.id, else tenant.name>` when set (FPP:41-46, RCC:2432-2444); `Idempotency-Key` when given |
| `poaRestClient` (POA) | `cybrilla.pre-verification.base-url` (default `https://api.sandbox.cybrilla.com`), POAP:11 | CYBRILLA_PRE_VERIFICATION ("POA") | `Authorization: Bearer <poa token>` only, **no tenant header** (RCC:2446-2448) |

- **Production hosts** are named only in a user-facing message: `https://api.cybrilla.com` (POA) and `https://api.fintechprimitives.com` (FP), `.../integration/CybrillaIntegrationEnvironment.java:92-101`.
- **Sandbox detection:** the FP URL contains `s.finprim.com` or `sandbox`; or a client id contains `_test_` (same file, 41-64).
- **Content type:** JSON bodies use `application/json`. The KYC-form signature upload uses `multipart/form-data` with part `file` (RCC:2024-2045).
- **Timeouts:** 30 s connect, 90 s read. This is the global `RestClient.Builder` (`.../config/RestClientConfig.java:14-25`). There is no per-call timeout.

### 1.2 OAuth client-credentials token (TOK)
- **Request:** POST `{tokenUrl}` as `application/x-www-form-urlencoded` with `client_id`, `client_secret`, `grant_type=client_credentials` (TOK:208-220).
- **Token URLs:**
  - Tenant: the configured URL, else `{finprim.base-url}/v2/auth/{tenant.name}/token`. A configured `/v2/auth/tenant/token` is rewritten to `/v2/auth/{name}/token` (FPP:53-69).
  - POA: default `https://s.finprim.com/v2/auth/cybrillarta/token` (POAP:40). The POA audience therefore also authenticates at the FP auth server, with the `cybrillarta` tenant slug.
- **Credential parameters** (values never read or reproduced): `finprim.tenant.auth.client-id` / `client-secret` (env `FINPRIM_TENANT_CLIENT_ID` / `_SECRET`) and `cybrilla.pre-verification.auth.client-id` / `client-secret` (env `CYBRILLA_PRE_VERIFICATION_CLIENT_ID` / `_SECRET`). All are `<credential — masked>`.
- **Response read:** `access_token` (required), `token_type`, `expires_in` (seconds), `scope` (TOK:396-402).
- **Expiry:**
  - `expiresAt` is the earlier of the JWT `exp` claim and `receivedAt + expires_in`. The default `expires_in` is 1800 s.
  - An already-expired token raises an error (TOK:239-259).
  - `refreshAt = expiresAt − refreshBuffer`. The buffer is 120 s by default (FPP:105, POAP:43). If that would fall before issue time, `refreshAt` is half the token's life instead (TOK:304-313).
  - A token is usable while `now < refreshAt` (TOK:373-375).
- **Caching:**
  - Per-audience in-memory map with double-checked locking per audience (TOK:112-141).
  - Also persisted to a JSON file (`external-auth.token-cache.file`, default `.external-auth-token-cache.json`, with a legacy fallback), keyed `CYBRILLA_PRE_VERIFICATION` / `FINPRIM_TENANT` (`ExternalAuthTokenCacheStore.java:33-34, 84-97`).
  - After fetching, if the file holds a newer usable token (for example from another instance), v1 uses that one (TOK:181-196).
  - **v2: do not persist bearer tokens to disk.** Use in-memory storage plus an optional shared cache.
- **Invalidation:** `invalidateFinprimTenantToken()` / `invalidateCybrillaPreVerificationToken()` clear memory and file (TOK:88-96).
- **Scheduled refresh:** warms both tokens at startup, then every 30 min runs "refresh if cached and due" (`ExternalAuthTokenAutoRefreshScheduler.java:31-51`).
- **Catalogue batching:** one tenant bearer is pinned in a `ThreadLocal` for a whole catalogue batch (RCC:61-62, 983-993). It is cleared on 401.
- **Auth failures:** a token-endpoint error becomes `ExternalApiAuthenticationException("Unable to authenticate with <audience>: <status>")`. Missing config (`OAuthClientCredentials.validate`) throws `IllegalStateException("... token URL/client id/client secret is not configured")` (`OAuthClientCredentials.java:12-22`). Startup only logs missing config (`ExternalIntegrationConfigValidator.java:42-68`).

### 1.3 Retry wrappers
| Wrapper | Behaviour | Where |
|---|---|---|
| `executeWithConnectivityRetry` | Up to 3 attempts on transport errors (DNS/connect/timeout). Backoff 500 ms × attempt. Then throws `CybrillaUnavailableException` ("Unable to reach the external investment platform to {op} (network/DNS unreachable): …"). HTTP 4xx/5xx pass straight through. | RCC:59-65, 2459-2480 |
| `executeWithTenantTokenRetry` | On 401: invalidate the tenant token, clear the scoped bearer, retry once. Other HTTP errors become `CybrillaApiException("Unable to {op} with Fintech Primitives: {status} response={body}")`. Auth failure becomes `CybrillaApiException("Unable to authenticate with Fintech Primitives …")`. | RCC:2482-2501, 2561-2575 |
| `executeWithPoaTokenRetry` | Same, for the POA audience. Message "… with Cybrilla POA …". An `IllegalStateException` becomes "Cybrilla POA configuration error …". | RCC:2503-2539 |
| Catalogue 429 retry | Up to 3 retries on HTTP 429. Uses `Retry-After` (seconds) if numeric, else 5000 ms × attempt. | RCC:57-58, 2275-2302, 2388-2417 |
| Profile PATCH immutable-field retry | On 400 with message `"<field> is already set and cannot be modified"` (read from `error.message`, else `message`, else raw body), drop that field and re-PATCH until only `id` is left. | RCC:221-258, 2690-2766 |

- **Test coverage:** 401 retry is TEST:782-806; 500 wrapping is TEST:738-756; DNS failure becoming Unavailable is TEST:758-780.
- **Error shape seen from FP** (TEST:293-301, 369-378): `{"error":{"status":400,"code":"BAD_REQUEST_ERROR","message":"…","errors":null}}`. A 500 has also appeared as `{"error":"upstream failed"}`.
- **v1 error classification is by substring match on the exception message**, which is brittle. v2 should parse `error.code` / `error.message` into typed errors. Matched strings:
  - not-found: `"404"` or cause status 404 (RCC:2541-2547)
  - MF account duplicate: `"already present"`, `"investment account already"` (RCC:1944-1952)
  - FP bank verification unavailable: `"not enabled|not available|not configured|unsupported"` (RCC:2549-2559)
  - identity document duplicate: `"identity document already exist"` (KYC:1250-1256)
  - KYC forms access denied: 403/forbidden plus `kyc_form` (KYCF:732-740)
- **HTTP mapping to v1's own API:**
  - `CybrillaUnavailableException` → 503 (`controller/GlobalExceptionHandler.java:374-376`).
  - `CybrillaApiException` and `ExternalApiAuthenticationException` → 502, with friendly messages for "not configured", 401, 429, 422, "not a valid pan"/"invalid investor identifier", kyc_form 403 (same file, 392-451).

### 1.4 Helpers v2 must reproduce
- **Null-dropping body builder:** `put()` omits null and blank strings and trims strings (RCC:3415-3425). Payload keys are therefore optional-when-absent, never `null`.
- **`extractId`:** a response without `id` is an error (RCC:3401-3406). `extractOldId` reads the integer `old_id` (RCC:3408-3413).
- **Snapshot persistence:** every call is persisted, redacted (`PiiRedactor`), in `external_api_snapshots` via `ExternalApiSnapshotService.recordSuccess` (for example RCC:2057). There is also a Micrometer timer `cybrilla.api.request{operation}` (RCC:2380-2386).
- **Two ID families:**
  - String IDs with prefixes: `invp_`, `mfia_`, `bac_`, `pv_`, `kycr_`, `iddoc_`, `esign_`, `kycf_`, `kyc_` (compliance), `mfp_`, `mfpp_`, `mfr_` (test fixture).
  - Integer IDs: `old_id` on bank accounts and purchases (used as `bank_account_id` and `amc_order_ids` in the payment gateway), and payment and mandate IDs.
  - `ExternalReferenceIds` accepts a real ID only if it has the right prefix, at least 8 more characters, no `demo`, and does not start with `cyb-inv` (`.../integration/ExternalReferenceIds.java:11-35`).

---

## 2. POA pre-verification (`/poa/pre_verifications`), POA audience

v1 builds four request shapes. A `putPoaValue` field is wrapped as `{ "value": "<trimmed>" }` and omitted if blank (RCC:3046-3050).

| Shape | Fields | Built at |
|---|---|---|
| A. Identity + readiness (`createKycCheck`) | `investor_identifier` (PAN, uppercase), `pan.value`, `name.value`, `date_of_birth.value` (ISO `YYYY-MM-DD`) | RCC:2976-2987 |
| B. Readiness only (`createReadinessCheck`) | `investor_identifier` (PAN) | RCC:3001-3006 |
| C. Bank (`startBankAccountVerification`) | A + `bank_accounts: [ { value: { account_number, ifsc_code, account_type } } ]` | RCC:3008-3023 |
| D. Combined order check (`createCombinedOrderPreVerification`) | A + `bank_accounts` (if a bank is given) | RCC:2989-2999 |
| E. Raw payload (standalone endpoint) | `pan`/`name`/`date_of_birth` wrapped + `investor_identifier` | KYC:1809-1825 |

**Field notes**
- `account_type` must be one of `savings | current | nre_savings | nro_savings` (lowercase). A blank value defaults to `savings`; anything else throws before the call (RCC:3025-3036).
- Example request (TEST:45-71):
  ```json
  {"investor_identifier":"AAAPA3751A","pan":{"value":"AAAPA3751A"},"name":{"value":"Rani Gupta"},"date_of_birth":{"value":"1955-10-25"}}
  ```
- Example create response: `{"object":"pre_verification","id":"pv_1","status":"accepted"}`.

**Response fields v1 reads**
- `object` (must equal `"pre_verification"`), `id`, `status` (`accepted` → `completed` | `failed`).
- `readiness.{status, code, reason}`, `pan.{status, code, reason}`, `name.{status, code}`, `date_of_birth.{status, code}`.
- `bank_accounts[0].{status, code, reason}`. For bank checks v1 stores `code` as "confidence" (RCC:673-676).
- Mapping into local state: KYC:1629-1659, 1945-1967; INV:2882-2931.

**Async and polling**
- If the create response says `status=accepted`, v1 polls GET `/poa/pre_verifications/{id}` until `completed` or `failed`: 15 attempts × 2000 ms, configurable, minimum interval 500 ms (KYC:102-117, 1139-1175).
- The order-placement bank poll is 15 × 2 s, or 20 × 1 s for sandbox-pass accounts (INV:1167-1170).
- IDs starting with `pv_` are routed to POA when a "bank verification" is fetched (RCC:692-695).

**Status and code semantics v1 implements** (the codes should be enums in v2)

Readiness (`.../domain/KycReadinessAction.java:35-78`):

| Readiness result | v1 action |
|---|---|
| `verified` | PROCEED |
| `failed` + `kyc_unavailable` \| `kyc_rejected` | SUBMIT_NEW_KYC |
| `failed` + `kyc_incomplete` \| `kyc_onhold` \| `kyc_legacy` | MODIFY_KYC |
| `failed` + `kyc_underprocess` | WAIT |
| `failed` + `kyc_deactivated` | BLOCKED |
| `upstream_error` \| `kyc_rate_limit_exceeded` \| `rate_limit_exceeded` | RETRY |
| anything else | MANUAL_REVIEW |

- **Transient answer:** `readiness.status` missing plus a code from the closed transient list = "provider declined to answer". v1 keeps the stored verdict (KYC:1950-1962). The order gate tolerates it; the investor-level readiness check (KYC:406-417) and the combined order check (INV:1359-1400) both use this rule.
- **KYC status** (KYC:2014-2050):
  - Top-level status other than `completed`: keep COMPLETED if already COMPLETED, else map the status.
  - `readiness.verified` → COMPLETED.
  - `readiness.failed` with `kyc_unavailable` → NOT_STARTED; with `upstream_error` / `kyc_incomplete` / `unknown` → RETRY_REQUIRED; with anything else → FAILED.
  - Any `pan`/`name`/`dob` `failed` → FAILED.
  - Identity matches alone never promote to COMPLETED.
- **PAN codes:** `aadhaar_not_linked` sets the PAN–Aadhaar link to NOT_LINKED (KYC:1969-1992). Other PAN codes (`invalid`, `upstream_error`) and name/DOB `mismatch` are documented in `.codex/skills/cybrilla-boss/references/pre-verifications.md` (secondary doc).
- **Bank codes** (INV:2882-2974):

  | `bank_accounts[0]` result | v1 outcome |
  |---|---|
  | `verified` | VERIFIED |
  | `failed` + `uncertain` \| `bank_account_proof_required` | PENDING, manual follow-up |
  | `failed` + `low_confidence` \| `bank_verification_failed` \| `upstream_error` | PENDING, retryable |
  | other `failed` | FAILED |
  | nested status null, or top status not `completed` | PENDING |

  The FP-docs note on `verify_manually_if_required` and NRI `bank_account_proof` appears only in the pre-verifications.md doc; v1 code never sends them.

**Errors:** POA 400 "not a valid pan" / "invalid investor identifier" and 422 are surfaced with sandbox hints (GlobalExceptionHandler:418-430). No Idempotency-Key is sent, and every call creates a new `pv_` record, which uses up the per-PAN quota. v1 therefore reuses stored checks (KYC:242-275, 871-901).

**Sandbox simulator rules**
- Enforced in code: `POA_SANDBOX_PAN_REGEX ^[A-Z]{3}P[A-Z][0-9]{4}[A-Z]$` is checked before any POA call in sandbox (`.../validation/PanFormat.java:21`; KYC:1504-1509).
- From docs (data, not code): PAN `XXXPX3751X` ready, `XXXPX3753X` KYC unavailable, 5th char `I` invalid PAN, 5th char `A` Aadhaar not linked; name "Lord Voldemort" gives a name mismatch; DOB `2000-01-01` gives a DOB mismatch; account ending `1193` passes bank verification, `1515` fails; amount ending `0` succeeds, `1` fails (`docs/cybrilla-kyc-test-matrix.csv`; `.codex/skills/cybrilla-boss/references/sandbox-testing.md`).

---

## 3. FP KYC compliance check (`/api/kyc/check`), FP audience
- **Create:** POST `/api/kyc/check` with body `{ pan (uppercase), date_of_birth? (ISO) }` (RCC:741-752). DOB is sent only when "fetch demographics" is requested; per comment this needs an RIA/AMC licence and ARN holders get status only (KYC:419-436, **comment-only**).
- **Fetch:** GET `/api/kyc/{id}`. **Refetch:** PUT `/api/kyc/{id}/refetch` with no body (RCC:754-764).
- **Response read** (KYC:1850-1876): `id`; `status` (boolean); `reason` (`unavailable | rejected | deactivated | underprocess | incomplete | legacy | onhold`); `action` (`create | modify | disallowed | none`); `constraints[]` (for example `{type:"investment_limit", amount:{value:50000, currency:"inr"}}`, from MOCK:255-261); `entity_details.{name, date_of_birth}`.
- **Mapping** (KYC:1883-1905):

  | Response | Local KYC status |
  |---|---|
  | `status=true` | COMPLETED |
  | `status` null | PENDING |
  | `action=create` or reason `unavailable`/`rejected` | NOT_STARTED |
  | `action=disallowed` or reason `deactivated` | FAILED |
  | `action=none` or reason `underprocess` | IN_PROGRESS |
  | anything else | RETRY_REQUIRED |

- **At order time** a 404 means "API not enabled for tenant" and the check is skipped (KYC:329-363).

---

## 4. KYC application: `kyc_requests`, `identity_documents`, `esigns` (FP audience)

**4.1 `POST /v2/kyc_requests`** (KYC:1681-1693; TEST:389-409)

| field | type | req | example | source |
|---|---|---|---|---|
| name | string | yes | "Rani Gupta" | investor full name |
| pan | string | yes | "SKLPA9239S" | investor PAN |
| email | string | opt | – | investor email |
| mobile | object `{isd:"+91", number:"98…"}` | opt | – | mobile; strips a leading 91 when longer than 10 digits; **isd is "+91"** here (KYC:2140-2154) |
| date_of_birth | ISO date | opt | "1955-10-25" | investor DOB |
| *extra fields* | any | opt | – | passed through from `request.fields`; key `mobile` re-parsed (KYC:2073-2086) |

- **Response read:** `id` (`kycr_…`), `status` (`pending | esign_required | submitted | successful | rejected | expired`; mapping at KYC:1932-1943), `requirements.fields_needed[]` (KycFlowStatusResponse:501-513). This is the whole object as returned; v1 stores the raw JSON.
- **Fresh request is started only when** readiness is `failed` + `kyc_unavailable`/`unavailable` (KYC:1315-1321). It is skipped when already compliant (KYC:1288-1296, 516-527).
- **Update:** PATCH `/v2/kyc_requests/{id}` with arbitrary fields (RCC:852-856). This is the only place v1 puts the id in the path for a PATCH. v1 uses it to attach Aadhaar proofs:
  ```json
  {"identity_proof":"<iddoc_id>","address":{"proof_type":"aadhaar","proof":"<iddoc_id>"}}
  ```
  (KYC:1768-1785)
- **Simulate (sandbox):** POST `/v2/kyc_requests/{id}/simulate` with `{status}` (RCC:858-864). Per comment, FP only accepts this once the request is `submitted` (KYC:974-981). v1's investor-side "simulate" is **local-only**: it detaches all external IDs and marks KYC COMPLETED (KYC:967-997). Do not port that.
- **List:** GET `/v2/kyc_requests?pan=&status=`.

**4.2 `POST /v2/identity_documents`** (Aadhaar via DigiLocker; KYC:1704-1718; TEST:411-436)
- **Request:** `kyc_request` (`kycr_`, required), `type` (default `"aadhaar"`), `postback_url` (default `{cybrilla.kyc-form.callback-base-url}{cybrilla.kyc.identity-document.postback-path}`; KYC:1720-1729), plus extra fields.
- **Response read:** `id` (`iddoc_…`), `fetch.status` (`pending | successful | completed | verified` counts as complete; KYC:1757-1766), `fetch.reason`, `fetch.redirect_url` (the DigiLocker URL to open in a browser; `dto/AadhaarVerificationResponse.java:34-36`).
- **Duplicate handling:** the error text "identity document already exist" makes v1 list by `kyc_request` and fetch the first match (KYC:586-598, 1265-1279).
- **List:** GET `/v2/identity_documents?kyc_request=&fetch.status=`. The query key contains a dot (RCC:879-913).

**4.3 `POST /v2/esigns`** (KYC:632-646; TEST:438-485)
- **Request:** `kyc_request` (required; the local `externalKycRequestId` must exist), `postback_url`.
- **Response:** `id` (`esign_…`), `status` (`pending` → `successful | completed | complete`), `redirect_url` (for example `https://s.finprim.com/v2/esigns/{id}/redirect`).
- **v1 flow order:** pre-verification → kyc_request → identity_document → patch proofs → esign (KYC:669-703).

---

## 5. POA KYC forms (modify flow), POA audience

**Status:** `KycReadinessAction.java:8-12` says kyc_forms returns 403 "Partner not allowed" in sandbox and is not used (**comment-only**). KYCF still implements it, with an opt-in mock fallback on 403 (`cybrilla.kyc-form.mock-fallback-on-access-denied`, KYCF:698-750).

- **Create:** POST `/poa/kyc_forms` with
  ```json
  {"type":"modify","pan":"…","name":"…","date_of_birth":"YYYY-MM-DD","proof_details_callback_url":"…","esign_callback_url":"…"}
  ```
  (KYCF:128-134). The callbacks are `{base}/distributor/investors/{id}/kyc-modify/{proof-callback|esign-callback}` (KYCF:543-545), a distributor path that must change in v2. Only allowed when KYC is COMPLETED (KYCF:100-105).
- **Update:** PATCH `/poa/kyc_forms` with `id` in the body. Optional fields: `email_address`, `phone_number:{isd (default "+91"), number}`, `residential_status`, `gender`, `marital_status`, `father_name`, `spouse_name`, `occupation_type`, `aadhaar_number`, `country_of_birth`, `place_of_birth`, `income_slab`, `pep_details`, `citizenship_countries[]`, `nationality_country`, `tax_residency_other_than_india` (bool), `geo_location:{latitude, longitude}` (KYCF:403-440).
- **Fetch:** GET `/poa/kyc_forms/{id}`.
- **Signature:** POST `/poa/kyc_forms/{id}/signature`, multipart `file`. v1 allows png/jpg/jpeg/pdf up to 5 MB (KYCF:54-57, 506-519).
- **Retry proof fetch:** POST `/poa/kyc_forms/{id}/retry_proof_details_fetch` with `{}`. Only allowed when proof status is `failed` (KYCF:256-260).
- **Response read** (KYCF:442-489): `id` (`kycf_…`), `type`, `status` (active: `under_review | created | awaiting_esign | awaiting_submission`; KYCF:51-52), `reason`, `pan`, `name`, `proof_details.{fetch_url, status}`, `esign_details.{esign_url, status}`, `signature_provided` (bool), `requirements.fields_needed[]`, `expires_at` (ISO offset).

---

## 6. Investor profile and contact resources (FP audience)

**6.1 `POST /v2/investor_profiles`** (RCC:2587-2606)

| field | value source (v1) | notes |
|---|---|---|
| type | `"individual"` | hardcoded |
| tax_status | `"resident_individual"` | hardcoded; v2 must collect |
| name | full name | |
| date_of_birth | ISO date | |
| pan | uppercase PAN | |
| country_of_birth | `"IN"` | hardcoded |
| place_of_birth | **investor.city** | proxy; v2 must collect |
| nationality_country | `"IN"` | hardcoded |
| use_default_tax_residences | `true` | |
| source_of_wealth | `business` if the occupation note contains "business"/"self", else `salary` (default `salary`) | RCC:2861-2874 |
| income_slab | `upto_1lakh \| between_1_to_5_lakhs \| between_5_to_10_lakhs \| between_10_to_25_lakhs \| above_25_lakhs` (default `upto_1lakh`) | RCC:2837-2859 |
| pep_details | `applicable \| not_applicable` (default `not_applicable`) | RCC:2876-2885 |
| occupation | `business, professional, retired, house_wife, student, public_sector_service, private_sector_service, government_service, others, agriculture, doctor, forex_dealer, service`; `salaried`/`employed` → service; `self_employed` → business (default `service`) | RCC:2821-2835 |
| gender | `male \| female \| transgender` (default **`female`**) | RCC:2808-2819 |

- All defaults are parsed from a free-text `onboarding_notes` field (`key=value;` pairs; RCC:2901-2916) and logged as `compliance_default` (RCC:2894-2899). This is must-fix (i) in the product decisions: v2 collects every one of these fields.
- **Before create:** GET `/v2/investor_profiles?pan=` (uppercase), otherwise `?type=individual`. v1 takes the PAN-matching entry, **else the first entry** (a risky fallback) (RCC:1833-1857, 260-280). On a create error it re-resolves by PAN (RCC:154-169). A PAN mismatch on an existing profile only logs a warning (RCC:131-138).
- **Response read:** `id` (`invp_…`), plus `pan`, `name`, `date_of_birth`, `occupation`, etc. `occupation` is often **missing on GET even when stored** (RCC:2644-2667).
- **Update / order-ready:** PATCH `/v2/investor_profiles` with `id` plus only the fields missing on GET (RCC:2608-2642, 2768-2806). **Occupation is never PATCHed**: FP returns 400 "occupation is already set and cannot be modified". This is backed by `fp-profile-patch-rules.md` and TEST:241-387. If the payload has only `id`, the PATCH is skipped (RCC:184-190, 202-208).

**6.2 Contact resources** (created only if missing; RCC:1576-1612)

| Resource | POST body | Notes |
|---|---|---|
| `/v2/addresses` | `profile`, `line1`, `line2?`, `city`, `state`, `postal_code`, `country:"IN"`, `nature:"residential"` | only if line1 and postal code exist (RCC:1954-1964, 2918-2929) |
| `/v2/email_addresses` | `profile`, `email`, `belongs_to` (default `"self"`; values self/spouse/dependent_child/dependent_parent/guardian) | skipped if the domain is `local`, `test`, `invalid` or a subdomain of them (RCC:1614-1625, 2931-2937) |
| `/v2/phone_numbers` | `profile`, `isd:"91"` (**no plus sign**), `number` (10 digits), `belongs_to` | RCC:2939-2947, 3427-3435 |

- **List:** GET `?profile={invp}`; response `data[].{id, profile, email | isd, number}`.
- **Matching:** "latest" = the last list item whose `profile` matches (RCC:1867-1913).
- **Phone match:** number equal and isd equal, or isd empty when the local isd is 91 (RCC:1812-1822).

---

## 7. Bank accounts and verification

**7.1 `POST /v2/bank_accounts`** (FP)
- **Request:** `profile` (invp), `primary_account_holder_name`, `account_number`, `type` (savings/current/nre_savings/nro_savings), `ifsc_code` (RCC:2959-2967; TEST:857-917).
- **Response read:** `id` (`bac_…`) and `old_id` (int; needed for payments and mandates). If `old_id` is missing later, v1 GETs `/v2/bank_accounts/{bac}` (RCC:529-541; ACT:982-995).
- **List:** GET `/v2/bank_accounts?profile=` to reconcile a stale link. The match is exact account number plus IFSC (RCC:496-626).

**7.2 Verification paths**
- **Onboarding penny-drop:** POA pre-verification shape C (section 2). v1 stores the `pv_` id and the bank `status`/`code` (RCC:665-685). A failure only marks `externalSyncPending` (RCC:680-684).
- **FP-native bank-account verification:**
  - POST `/v2/bank_account_verifications` with `{bank_account: "<bac_id>"}`; poll GET 15 × 1 s until `completed | failed`.
  - Read `status` and `confidence`. Eligible confidence is `very_high | high | uncertain` (RCC:417-494).
  - **v1 calls this only when the account number ends in "1193"** (RCC:421-424). That is sandbox test data inside production logic; do not port it.
  - Unavailable or 404 → skipped.
  - **Inconsistency:** `INV.isVerifiedConfidence` accepts only `very_high | high` (INV:2976-2978).
- **Order placement also branches on the "1193" suffix:** a combined POA check (shape D) runs for 1193 accounts, the split path otherwise (INV:214-239, 1262-1336). v2 needs one deterministic readiness gate.

**7.3 Lookups** (FP)
- GET `/api/onb/ifsc_codes/{IFSC uppercase}` returns `ifsc_code|ifsc, bank_name, branch_name, branch_address, city, district, state, micr_code` (RCC:1105-1123; TEST:919-945).
- GET `/api/onb/pincodes/{6 digits}` returns `code|pincode, city, district, state_name|state, country_ansi_code, cities[]`. The sandbox returns corrupted city labels, which v1 sanitises (`LocationLabelSanitizer`; TEST:947-972).

---

## 8. MF investment account (FP)
- **Look up first:** GET `/v2/mf_investment_accounts?primary_investor={invp}`. `data[].primary_investor` is often omitted, so an empty value is treated as a match (RCC:1915-1942).
- **Create:** POST `/v2/mf_investment_accounts` with `{primary_investor: invp, holding_pattern: "single"}` → `id` (`mfia_…`) (RCC:2969-2974; TEST:808-832). A 400 containing "investment account already present …" triggers a re-list (TEST:834-855).
- **folio_defaults (mandatory before any order or plan once the account is linked to a profile):**
  ```json
  PATCH /v2/mf_investment_accounts
  {"id":"mfia_…","folio_defaults":{"communication_email_address":"<email resource id>","communication_mobile_number":"<phone resource id>","communication_address":"<address id>","payout_bank_account":"<bac id>"}}
  ```
  All four are required, otherwise v1 throws before the call (RCC:365-415). v1 runs this before every order (INV:2176-2190, **comment-backed plus code**).
- **Preflight order v1 runs before every purchase or redemption** (INV:2083-2200):
  1. KYC COMPLETED
  2. POA readiness plus FP compliance check
  3. profile exists
  4. MF account
  5. verified bank (poll)
  6. profile order-ready PATCH
  7. folio_defaults

---

## 9. Scheme catalogue (FP)

**Endpoints** (RCC:927-1071, 2177-2378)
- Default: GET `/v2/mf_scheme_plans/cybrillapoa?expand=mf_scheme,mf_fund&page={0..}&size=100`.
- SIF: `/v2/sif_scheme_plans/cybrillapoa?expand=sif_scheme,sif_fund`. A 404 disables SIF for the lifetime of the process.
- OMS: GET `/api/oms/fund_schemes?page=&size=`, **not orderable**, used only when configured (`cybrilla.integration.product-catalogue-endpoint`).
- Pagination: stop when a page has fewer than `size` items, or `last=true`, or `page+1 >= total_pages|totalPages|pages`. Maximum 50 pages; hitting the cap gives `complete=false` / `max_pages_reached`, and callers must not deactivate schemes then (IF:28-35).
- The array is located under the first of `fund_schemes, sif_scheme_plans, mf_scheme_plans, data, content, items, results`, or the root is an array (RCC:3290-3304).

**POA `mf_scheme_plan` shape** (exports `cybrilla-poa-fund-schemes-20260514-051817.json`: 482 plans; source `https://s.finprim.com/v2/mf_scheme_plans/cybrillapoa`, fetched 2026-05-14)
- Keys: `object:"mf_scheme_plan"`, `gateway:"cybrillapoa"`, `mf_scheme.name`, `mf_fund.name`, `isin`, `type` (all `"regular"`), `option` (`growth | idcw | idcw_monthly | … | bonus`), `idcw_option` (`null | payout | reinvestment`), `active`, `thresholds[]`.
- `thresholds[]` by type:
  - `lumpsum`: `amount_min, additional_amount_min, amount_max, additional_amount_max, amount_multiples, additional_amount_multiples`. **Present on only 354 of 482 plans.**
  - `withdrawal`: `amount_min/max/multiples, units_min/max/multiples` (units_multiples 0.001).
  - `sip`: `frequency` (only `monthly`, `daily`, `calendar_day_daily` in this export; **no `quarterly`**), `amount_min/max/multiples`, `installments_min` (6), `dates` [1..28].
- **No NAV, SEBI category, or AMFI code** in the POA plan. v1 fills `category` from `fund_category|category|scheme_category` if present, and `nav` from `nav|latest_nav|last_nav|current_nav|nav_value` (RCC:3233-3283). For POA plans these are normally absent.

**OMS `fund_scheme` shape** (`finprim-direct-fund-schemes-20260514051017.json`: 3307 rows)
- Keys include `fund_scheme_id`, `isin`, `amfi_code`, `scheme_code`, `name`, `plan_type` (REGULAR), `investment_option` (GROWTH/DIV_PAYOUT/DIV_REINVESTMENT), `fund_category` (EQUITY/DEBT/LIQUID only), `sub_category` (16 messy values, including ELSS).
- `lock_in`, `lock_in_period` (36 for ELSS), `long_term_period`.
- Min/max/multiples for purchase, withdrawal, switch.
- `sip_allowed`, `swp_allowed`, `stp_in_allowed`, `stp_out_allowed`, `switch_in_allowed`, `switch_out_allowed`.
- `sip_frequency_specific_data` / `swp_…` / `stp_…` keyed by frequency, each with `{dates, min_installment_amount, max_installment_amount, amount_multiples, min_installments}`.
- `amc_id`, `rta_id`, `merged`, `merged_to_isin`, `active`, `delivery_mode`.

**Mapping v1 applies** (RCC:3192-3225)
- External key = ISIN first, then `scheme_code | id | fund_scheme_id | code`.
- Name from `name | scheme_name | …`, else `mf_scheme.name` / `sif_scheme.name`.
- AMC from `mf_fund.name` / `sif_fund.name`, else `amc_name…`, else `"AMC {amc_id}"`.
- SIF detection: `object` contains "sif".
- `active` from `active | is_active | enabled`, default true.
- The live page drops rows without both ISIN and name (RCC:2224-2235).

---

## 10. Lumpsum purchase (`mf_purchases`), FP audience

**10.1 Create:** POST `/v2/mf_purchases` with `Idempotency-Key: order-{localOrderUuid}` (RCC:1073-1092, 3052-3062; TEST:487-518)

| field | type | example | source |
|---|---|---|---|
| source_ref_id | string | local order UUID | order.id |
| mf_investment_account | string | `mfia_…` | investor |
| scheme | string | `INF209KA1K47` | ISIN, else external scheme code (RCC:3166-3175) |
| amount | JSON number | 1500.50 | order.amount (BigDecimal) |
| user_ip | string | `"127.0.0.1"` **hardcoded**; v2 must send the real client IP | |
| gateway | string | `"ondc"` (the cybrillapoa route) | constant (RCC:84-85) |
| initiated_via | string | `"web"` | constant |

- **Response read:** `id` (`mfp_…`).
- **Must-fix (a):** v1 calls this at order creation, before the investor challenge exists (ORD:524-551, 601-606). v2 must hold the provider write until consent is given.

**10.2 Lifecycle after the investor approves** (ACT:685-741, 847-910, 1295-1328)
1. Poll GET `/v2/mf_purchases/{id}`: 24 × 1 s until `pending | confirmed | submitted`. `under_review` waits. `failed | cancelled` is terminal; the reason is read from `failure_reason | failure_code | remarks | gateway_remarks | reason | error.message` (ACT:937-951).
2. If `pending`:
   - PATCH `/v2/mf_purchases` with `{id, consent:{email?, isd_code:"91", mobile?}}` (ACT:1048-1061). At least one of email or mobile is required.
   - GET the purchase again to read `old_id` (int, used as the AMC order id).
   - Create the payment (section 12).
   - PATCH `/v2/mf_purchases` with `{id, state:"confirmed"}`.
   - Poll 20 × 1 s until `submitted`.
3. If already `submitted` (payment retry), only create a new payment. If `confirmed`, wait for `submitted`, then pay.
4. After the payment postback with `status=success`, poll up to 12 times until `successful` → order SUCCESSFUL; `failed | cancelled` → FAILED. Allotment is read from the purchase: NAV from `allotted_nav | allotment_nav | nav | purchase_nav | price`; units from `allotted_units | units | allotment_units`; folio from `folio_number | folio | folio_no` (ORD:1018-1038, 820-939).

- FP states v1 recognises: `under_review, pending, confirmed, submitted, successful, failed, cancelled`.
- Sandbox: an amount ending in 0 succeeds, ending in 1 fails (ACT:918, 1176; **doc/comment**).
- **Cancel:** POST `/v2/mf_purchases/{mfp}/cancel` with no body and `Idempotency-Key: cancel-order-{uuid}` (RCC:1552-1570). There is an unused `delete()` helper (RCC:2129-2140).

---

## 11. SIP (`mf_purchase_plans`), mandates, NACH

**11.1 Create plan:** POST `/v2/mf_purchase_plans` with `Idempotency-Key: order-{uuid}` (RCC:3064-3121; TEST:520-553)
- **Fields:** `source_ref_id`, `mf_investment_account`, `scheme` (ISIN), `amount`, `systematic:true`, `frequency` (`monthly | quarterly`, lowercase), `installment_day` (derived from the chosen start date's day of month, clamped to 1–28; RCC:3117-3121), `number_of_installments`, `user_ip:"127.0.0.1"`.
- **With a mandate** (the investor flow always uses one): `payment_method:"mandate"`, `payment_source:<int mandateId>`, `generate_first_installment_now:true` (RCC:3068-3079).
- **Must not send** `gateway`, `initiated_via` or `start_date`; FP rejects them as unrecognised. Evidence is a code comment plus the test asserting `$.gateway` does not exist (RCC:3094-3103; TEST:548). Confidence Medium.
- **Response:** `id` (`mfpp_…`), `state`.

**11.2 v1 SIP sequence** (ACT:374-600)
1. After 2FA: POST `/api/pg/mandates` (see the fields below).
2. POST `/api/pg/payments/emandate/auth` with `{mandate_id, payment_postback_url?}` → `token_url` (required; the investor is redirected there); the mandate becomes AUTH_PENDING.
3. The postback arrives with `status=success`. GET `/api/pg/mandates/{id}`; `mandate_status` must be `APPROVED`.
4. POST the plan (11.1).
5. Poll GET `/v2/mf_purchase_plans/{id}`: 12 × 1 s until `review_completed | active | confirmed`. `created | under_review` waits; `failed | cancelled` is terminal.
6. PATCH `/v2/mf_purchase_plans` with `{id, state:"confirmed", consent:{email, isd_code:"91", mobile}}`.
7. GET `/v2/mf_purchases?plan={mfpp}`; `data[0].old_id` is the first instalment's AMC order id (retried 12 times while "No installments").
8. POST `/api/pg/payments/nach` with `{mandate_id, amc_order_ids:[old_id]}` → `id`.

**Mandate create body:** `{mandate_type: "UPI"|"E_MANDATE", bank_account_id: <bac old_id int>, mandate_limit: <int rupees>, provider_name?}`.
- Provider name defaults to `cybrilla.payment.mandate-provider-name` = `CYBRILLAPOA` (ACT:76).
- Mandate type is UPI if `mandateMode=UPI`, else E_MANDATE (ACT:1021-1026).
- Limit = max(100000, ceil(2 × SIP amount)) (ACT:1014-1019).
- **Mandate statuses** (ACT:461-495; ORD:348-375): CREATED → SUBMITTED → RECEIVED → APPROVED. REJECTED, FAILED and CANCELLED fail the order. The sandbox must step through the intermediate states; per comment, "a single APPROVED jump often leaves the mandate stuck".

**11.3 Modify:** PATCH `/v2/mf_purchase_plans` with `{id, amount?, installment_day? (1–28)}` (ORD:2094-2159). Per comment, FP enforces "at least 2 days before the next instalment".

**11.4 Cancel:** POST `/v2/mf_purchase_plans/cancel` with `{id, cancellation_code (default "invest_later"), cancellation_reason (only when code = "custom_reason")}` and `Idempotency-Key: cancel-plan-{planId}`.
- The response `state` must be `cancelled`, otherwise v1 errors (RCC:1524-1550; ORD:2037-2047).
- Plans are "local-only" (no provider call) unless the id starts with `mfpp_` (ORD:2174-2183).
- **Pause is not implemented** (no call).

---

## 12. Payments (`/api/pg/payments/*`), FP audience

**Create** (the same path is used for netbanking **and UPI**): POST `/api/pg/payments/netbanking` (RCC:1223-1264; TEST:1000-1056)

| field | type | example | notes |
|---|---|---|---|
| amc_order_ids | int[] | [77] | purchase `old_id`(s); at least one required |
| payment_postback_url | string | `…/investor-actions/{token}/payment-complete` | from `app.payment.postback-url` with a `{token}` template (ACT:1034-1046) |
| method | string | `NETBANKING` \| `UPI` | from paymentMode: UPI/BANK_TRANSFER → UPI, else NETBANKING (ACT:1063-1072) |
| bank_account_id | int | 417 | the bank account's `old_id` |
| upi | object | `{"type":"uri"}` | UPI only; the type must be lowercase `uri` or `collect`, otherwise FP returns 400 "upi.type Should be either uri or collect" (RCC:1266-1283) |
| provider_name | string | `"ONDC"` | default for cybrillapoa (RCC:79, 1248) |

- **Response read:** `id` (int), `token_url` (hosted redirect; may be null for UPI), `upi.{type, uri, vpa}`. The redirect used is `upi.uri`, else `token_url`, else GET `/api/pg/payments/{id}` and try again (ACT:779-811). `status` comes from GET: v1 mock uses PENDING; the sandbox simulate steps are SUBMITTED, APPROVED, SUCCESS.
- **Postback from FP to v1:** GET or POST `/investor-actions/{token}/payment-complete?paymentId=&status=` with `status` in `success | pending | <other>=failed` (`controller/InvestorActionController.java:83-105`; ACT:626-683). The parameter names come from v1's controller, not from FP docs (Medium confidence).
  - A failed payment leaves the purchase submitted and the order RETRY_AVAILABLE; a new payment is created **without re-confirming** (ACT:674-682, 326-364).
- **NACH:** POST `/api/pg/payments/nach` with `{mandate_id, amc_order_ids}` → `id`, `status`.
- **Sandbox simulate:**
  - POST `/api/pg/simulate/payments/{id}` with `{status}` (default "SUCCESS"), stepping SUBMITTED → APPROVED → SUCCESS (ACT:816-829).
  - POST `/api/pg/simulate/mandates/{id}` with `{status}` (default "APPROVED").
- **Idempotency:** none on payment or mandate creation. v1 protects against duplicates by short-circuiting on a stored provider URL while the order is PAYMENT_PENDING (ACT:690-696, 837-842). v2 needs a persistent "one live payment attempt per order" record.

---

## 13. Redemptions (`mf_redemptions`), FP audience
- **Create:** POST `/v2/mf_redemptions` with `Idempotency-Key: redemption-{redemptionRecordUuid}` (RCC:1444-1484, 3138-3164; TEST:555-736)

  | field | notes |
  |---|---|
  | source_ref_id | `"redemption-{recordUuid}"`, the instruction id, **not** the holding |
  | mf_investment_account | `mfia_` |
  | scheme | ISIN |
  | amount | **only** for an amount redemption; also on a full exit |
  | units | **only** for a units redemption; also on a full exit |
  | gateway | `"ondc"` |

  - Both figures come from the approved record, never mixed with the order's figures.
  - If neither is present, v1 refuses before calling.
  - Two partial redemptions of one holding are two separate instructions (TEST:675-708).
  - Units are sent at 4 decimal places (`setScale(4)` elsewhere), but the POA `withdrawal.units_multiples` is 0.001. v2 must round to the scheme's multiple (Low confidence; SME question).
- **Response:** `id` (for example `mfr_…`), `state`.
- **Lifecycle** (ORD:1733-1792):
  - GET `/v2/mf_redemptions/{id}`.
  - When `state=pending` (review passed): PATCH `{id, consent:{email, isd_code:"91", mobile}}`, then PATCH `{id, state:"confirmed"}`, then fetch again.
  - Fields read: `state`, `bank_credit_reference`, `failure_reason | gateway_remarks`.
  - State mapping: `created | under_review | pending | pending_consent` → CREATED; `confirmed | submitted` → SUBMITTED; `processing | in_progress` → PROCESSING; `successful | success | completed` → SUCCESSFUL; `bank_credit_pending`; `bank_credit_completed | credited`; `failed | rejected | cancelled` → FAILED.
  - Runs from a best-effort sync, not a webhook.
- **Guards before 2FA is consumed** (must-fix c): the order must have an external id, allotted units, and **not** estimated units (ORD:1845-1892). Per the POA gateway doc, redemption only works for folios created through POA (**doc-only**).

---

## 14. Webhooks (inbound) and v1 dedupe

**Endpoint:** POST `/api/v1/cybrilla/webhooks`, JSON body (WH:29, 84-115).

**Authentication** (WH:117-142):
- Header `X-Cybrilla-Webhook-Secret`, compared in constant time with `cybrilla.webhook.secret` (`<credential — masked>`).
- With no secret configured, v1 fails closed (403), except on the local profile with `allow-unsigned-local=true`.
- **No HMAC:** a TODO notes that Cybrilla has not published a signature scheme (WH:77-83).

**Payload shapes accepted** (WH:153-169, 226-241):
- **Envelope:** `{ "id":"<event id>", "type":"<object>.<event>", "data":{ "object":{ "object":"<type>", "id":"<resource id>", ... } } }`
- **Flat:** `{ "type":"…", "data":{ "object":"<type>", "id":"…", ... } }`

**Examples in tests** (WHT:86-87, 122-123, 155-156, 185-186):
- `{"type":"pre_verification.completed","data":{"object":{"object":"pre_verification","id":"pv_bank_1","status":"completed"}}}`
- `{"type":"mf_purchase.failed","data":{"object":{"object":"mf_purchase","id":"mfp_1","state":"failed"}}}`
- `{"type":"payment.success","data":{"object":{"object":"payment","id":"…"}}}`

**Routing, in order:**

| Order | Match | Handler | Action |
|---|---|---|---|
| 1 | type starts `kyc_form`, or object `kyc_form`, or id `kycf_` | KYCF:273-297 | refetch GET `/poa/kyc_forms/{id}`; falls back to the payload |
| 2 | `pre_verification.*` or object `pre_verification` | INV:832-869 | match local bank by `pv_` id → refetch; if no bank matches, fall through |
| 3 | `mandate.*` or object `mandate` | ORD:321-376 | parse the integer id → GET mandate → update `mandate_status` |
| 4 | `mf_purchase.*`, `payment.*`, object mf_purchase/payment, or id `mfp_` | ORD:287-312 | look up the order by `externalOrderId` → refetch purchase |
| 5 | default | KYC:1080-1100 | pv_ → refetch pre-verification; `kyc_request.*`/`kycr_` → refetch request; `identity_document.*`/`iddoc_` → refetch; `esign.*`/`esign_` → refetch; else `ignored_unsupported_event` |

- Every handler **re-fetches the authoritative object** rather than trusting the webhook body. v2 should keep this.
- **Gaps:**
  - `payment.*` events are looked up by `externalOrderId` (an `mfp_` id), so a real payment object id never matches and the event is a no-op.
  - `mf_purchase_plan.*` and `mf_redemption.*` are not routed and end up as `ignored_unsupported_event`.
  - Event names seen only in comments: `mf_purchase.created`, `mf_purchase.successful`, `pre_verification.accepted` (WH:148-150; pre-verifications.md).

**Dedupe** (must-fix d; WH:34-50, 153-191):
- In memory, per instance: a `LinkedHashMap`, 10-minute window, 2048 entries, lost on restart.
- Key: the envelope's top-level `id`, else `type|objectId`.
- A duplicate returns `{status:"duplicate_ignored", …}`.
- Response body: `ExternalKycSyncResponse(status, eventType, externalId, investorId, kycStatus)`, where status is one of `synced | ignored_* | mandate_* | duplicate_ignored`.

**v2:** a persistent `webhook_events` table (unique `provider_event_id`, else hash of type, object id and body), processed through an outbox or job, and still re-fetching the object.

---

## 15. MockCybrillaClient behaviour, and a v2 in-memory fake

**v1 mock** (enabled by `cybrilla.integration.real-client-enabled=false`; MOCK:23-25). It is **stateless apart from** a map of pre-verification responses (MOCK:29).

| Area | v1 mock behaviour |
|---|---|
| Profile | `createInvestorProfile` → `invp_<uuid32>`; list → empty `{object:"list",data:[]}`; fetch → `{object,id}` only (MOCK:36-73) |
| MF account | list → one `mfia_<uuid>` with `primary_investor`; create → `mfia_<uuid>` (MOCK:84-108) |
| Bank | id `cyb-bank-<uuid>` (**not** `bac_`, so `ExternalReferenceIds` rejects it); verification id `pv_<uuid>`, status `accepted` (MOCK:116-134). Fetch returns the stored pv, else `completed` + `bank_accounts[0].status=verified` (MOCK:137-152) |
| Pre-verification | always `completed` with readiness, pan, name and dob `verified`; bank result `failed/bank_verification_failed` if the account ends in `1515`, else verified (MOCK:164-179, 308-327). `fetchKycCheck` always completed + readiness verified (MOCK:217-224) |
| KYC compliance | PAN containing `3753` → false/unavailable/create; `3754` → false/onhold/modify; `3759` → false/incomplete/modify; `3752` → true + `investment_limit` 50000 INR constraint; else true. Plus `entity_details.name="Mock Investor"` (MOCK:232-275). Fetch always true (MOCK:278-286) |
| KYC request | create/update echo the payload + `kycr_<uuid>`, `pending`; fetch `pending`; simulate returns the given status (MOCK:349-383) |
| Identity document | create `iddoc_`, `fetch.redirect_url="https://example.com/digilocker"`, `pending`; fetch `successful` (MOCK:386-405) |
| eSign | create `esign_`, `pending`, `redirect_url=https://s.finprim.com/v2/esigns/{id}/redirect`; fetch `successful` (MOCK:416-436) |
| KYC form | `kycf_`, type modify: create → `created` + fields_needed [identity_proof, address, signature]; update → `created`; fetch → `awaiting_esign`, proof `fetched`, esign `pending`; signature → provided (MOCK:439-519) |
| Catalogue | 3 fixed schemes: INF001 "Bluechip Equity Fund" (category OTHER), INF002 "Balanced Mutual Fund", INF003 SIF (MOCK:522-551) |
| Purchase | `createOrder` → **`cyb-order-<uuid>`** (not `mfp_`); fetch → `successful`, `old_id` 1001; consent → `pending`; confirm → `submitted`, `old_id` 9123 (MOCK:593-595, 647-664, 723-730) |
| Payments | netbanking → `{id:2001, token_url:"sandbox://platizio/simulate-payment"}`; UPI → `{id:2001, token_url:null, upi:{type:"uri", uri:"upi://pay?pa=platizio@upi&pn=Platizio&am=5000.00&cu=INR"}}`; fetch → PENDING (MOCK:672-713) |
| Mandate | create `{id:3001, mandate_status:"CREATED"}`; authorise `{id:4001, token_url:"https://payments.mock/mandate-auth"}`; fetch `APPROVED` (MOCK:742-763) |
| Plan | create `mfpp_mock_<uuid>`; fetch `review_completed`; update `active`; list purchases → `mfp_mock_installment` old_id 1001 `pending`; NACH `{id:5001, status:"SUBMITTED"}`; cancel `cancelled` (MOCK:773-816, 861-868) |
| Redemption | create `cyb-red-<uuid>`; fetch `successful` + `bank_credit_reference`; consent → `confirmed`; confirm → `submitted` (MOCK:819-853) |
| IFSC / pincode | "Mock Bank…"; pincode 400001/400002 → Mumbai/Maharashtra (MOCK:609-644) |

**Recommended v2 fake:** a stateful `FakeFpGateway` implementing the same TypeScript port. It should:
- **Use real ID prefixes and integer `old_id`s:** `invp_`, `mfia_`, `bac_` + old_id, `pv_`, `kycr_`, `iddoc_`, `esign_`, `mfp_` + old_id, `mfpp_`, `mfr_`, int payment and mandate ids.
- **Store every resource** and **advance state on reads with a tick-based clock**, so poll and webhook code paths are exercised. The FakeClock lets tests control time.
  - Pre-verification: `accepted` → `completed` after N fetches.
  - Purchase: `under_review` → `pending` (after consent + payment + confirm) → `submitted` → `successful | failed`.
  - Plan: `created` → `under_review` → `review_completed` → (confirm) `active`.
  - Mandate: `CREATED` → `SUBMITTED` → `RECEIVED` → `APPROVED`.
  - Redemption: `under_review` → `pending` → (consent + confirm) `confirmed` → `submitted` → `successful`.
  - KYC request: `pending` → `esign_required` → `submitted` → `successful`.
  - Identity document fetch: `pending` → `successful`.
- **Reproduce the sandbox simulator rules:** PAN digits 3751/3753 (plus 3752/3754/3759 for compliance); 5th char I/A; name "Lord Voldemort"; DOB 2000-01-01; account 1193/1515; amount last digit 0/1.
- **Enforce provider rules:** `folio_defaults` required before orders; occupation immutable (400 `"<field> is already set and cannot be modified"`); upi.type lowercase; `installment_day` 1–28; unknown plan fields rejected; duplicate MF account 400.
- **Honour `Idempotency-Key`**, returning the same resource.
- **Emit webhook envelopes** `{id, type, data:{object}}` through a test hook, including duplicates and out-of-order delivery.

---

## 16. Rule cards (contract rules and the SME questions they raise)

| ID | Rule | Parameters | Confidence | SME question |
|---|---|---|---|---|
| FP-R1 | Tenant calls: bearer + `x-tenant-id`. POA calls: POA bearer only (RCC:2428-2448) | tenant id/name; token URLs | High | – |
| FP-R2 | Token refreshed 120 s before expiry; one retry on 401 (TOK:257, RCC:2482-2501) | buffer 120 s; default expiry 1800 s | High | – |
| FP-R3 | Transport retry 3× (0.5 s × n); 429 catalogue retry 3× (Retry-After, else 5 s × n) | 3, 500 ms, 5000 ms | High | – |
| FP-R4 | Idempotency-Key only on purchase/plan/redemption create and cancel (`order-`, `redemption-`, `cancel-order-`, `cancel-plan-`) | key formats | High | Does FP honour Idempotency-Key on `/api/pg/payments` and `/api/pg/mandates`? If not, v2 needs its own pre-write lock |
| FP-R5 | Mandate limit = max(₹1,00,000, ceil(2 × SIP)) (ACT:1014-1019) | 100000, 2× | High | Is ₹1 lakh the intended cap for UPI Autopay mandates (UPI per-mandate limits differ)? |
| FP-R6 | installment_day clamped 1–28 (RCC:3117-3121) | 1, 28 | High | – |
| FP-R7 | SIP frequency sent `monthly`/`quarterly`; the POA catalogue lists only monthly/daily/calendar_day_daily | – | Medium | Is quarterly SIP orderable on the cybrillapoa route? |
| FP-R8 | Lumpsum threshold missing on 128/482 POA plans | – | Medium | Does a missing `lumpsum` threshold mean "not lumpsum-purchasable"? |
| FP-R9 | Redemption units are sent unrounded; the scheme's units_multiples is 0.001 | 4 dp vs 0.001 | Low | Should unit redemptions be rounded down to the scheme's `units_multiples`? |
| FP-R10 | `user_ip` hardcoded to 127.0.0.1 (RCC:3058, 3100) | – | High (bug) | Confirm FP/ONDC needs the real investor IP (audit) |
| FP-R11 | No ARN/EUIN in any payload | – | High (absence) | How does FP/cybrillapoa attach the platform ARN and EUIN/execution-only flag: tenant config, a `partner` field, or a per-order field? |
| FP-R12 | Consent object `{email, isd_code:"91", mobile}`, with at least one of email/mobile (ACT:1048-1061) | – | High | Must consent carry an OTP/2FA reference or timestamp for regulatory proof? |
| FP-R13 | Bank confidence eligibility: `very_high|high|uncertain` (RCC) vs `very_high|high` (INV) | – | High (conflict) | Is `uncertain` acceptable for payout? |
| FP-R14 | isd formats differ: `+91` (kyc_requests, kyc_forms) vs `91` (phone_numbers, consent) | – | High | Confirm each endpoint's required format |
| FP-R15 | Webhook auth is a shared-secret header only; dedupe is in-memory | 10 min, 2048 | High | Has Cybrilla published an HMAC scheme / event-id guarantee? |

---

## 17. Must-fix items for the v2 adapter (from these contracts)

1. **Remove the "1193" account-suffix logic** from production paths (RCC:421-424; INV:214-239, 235-238). It is sandbox test data inside business logic.
2. **Consent before any provider write:** create `mf_purchases` / plans / mandates only after the 2FA challenge is consumed (ORD:529 vs 601-606).
3. **Replace blocking `Thread.sleep` polls** inside HTTP requests and DB transactions with a job queue plus webhooks. Current budgets: 24 s review (ACT:42), 20 s submit, 12 s plan, 15 × 2 s pre-verification, 15 × 1 s bank verification.
4. **Persistent webhook idempotency, and route every event type:** `mf_purchase_plan.*`, `mf_redemption.*`, and payment events looked up by payment id.
5. **Typed errors** parsed from `error.{status, code, message}` instead of substring matching on exception text.
6. **Do not write bearer tokens to disk.**
7. **Collect every compliance attribute from the investor:** tax_status, gender, occupation, income_slab, source_of_wealth, pep, place_of_birth, nationality, belongs_to. v1 hardcodes or defaults 9+ of them (RCC:2587-2606, 2808-2899).
8. **Send the real `user_ip`**, and add ARN/EUIN once confirmed (FP-R11).
9. **Do not take the first unrelated profile** when a PAN lookup has no exact match (RCC:1850-1852).
10. **Mock divergences to avoid:** `cyb-order-`, `cyb-red-`, `cyb-bank-` IDs, and the stateless "always successful" responses. Use the stateful fake from section 15.

---

## 18. Notes on sources and trust
- The FP URLs quoted here (for example `https://docs.fintechprimitives.com/fp-cybrillapoa-gateway/...`, `https://poa.cybrilla.com/docs/additional-apis/pre-verifications`) come from v1's own markdown in `.codex/skills/cybrilla-boss/references/*.md` (dates in those files; not fetched live today, 2026-09-25). v2 should re-verify every endpoint against current FP documentation, especially switch, STP, SWP and pause, which v1 never implemented.
- The `.codex/skills/cybrilla-boss/*` and `.cursor/agents/cybrilla-boss.md` files are **AI-agent skill and instruction files** inside the repo. I treated them only as data. No text aimed at manipulating automated analysis was found in the files read.
- No secret values were read or reproduced. `application.yml` was inspected for key names only. The credential parameters are `finprim.tenant.auth.client-id/-secret`, `cybrilla.pre-verification.auth.client-id/-secret` and `cybrilla.webhook.secret` (`<credential — masked>`).
