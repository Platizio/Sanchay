# ADR-0003: oRPC contract-first API on NestJS + Fastify (S0 gate)

- Status: Accepted (Sprint 2, week of 2026-10-19)
- Deciders: Dev A, Dev B, lead
- Related: ADR-0001 (versions), ADR-0005 (hosts, H-1), interface sheet §6, delta sheet §5.5

## Context
The investor API is consumed by the universal client `@sanchay/api-client` (web via RNW and Android via Expo).
Typed errors must survive the wire so the client can branch on `code` (OTP_INVALID, OTP_COOLDOWN, AUTH_REQUIRED, ...)
without string matching, and the committed `apps/api/openapi.json` must stay the single REST description.

## Decision
- `@sanchay/contract` defines every procedure with `@orpc/contract` 1.15.4 (`oc.route(...).errors(...).input(...).output(...)`),
  inputs `.strict()`, errors from the append-only `ERROR_CATALOGUE` (H-10).
- `apps/api` implements the contract with `@orpc/nest` 1.15.4 on NestJS 11.2.6 with the Fastify 5.11.3 adapter,
  under the `/api/v1` prefix on every host (H-1).
- Clients call it with `createORPCClient(new OpenAPILink(contract, { url, headers }))` from `@orpc/openapi-client` 1.15.4.
  Native sends `x-sanchay-client: android`, `x-installation-id` and `authorization: Bearer <token>`; web is same-origin with cookies.

## Evidence (gate)
`apps/api/test/int/client-roundtrip.int.test.ts` passes over real HTTP:
OTP_INVALID (401), OTP_COOLDOWN (429, retryAfterSeconds 30) and AUTH_REQUIRED (401) arrive with `defined: true`
and the shared envelope `data` (`retryable`, `requestId`). The negative control (removing `OTP_COOLDOWN` from the
`requestOtp` error map) turns the cooldown test red with `isDefined === false`, so the gate detects undeclared errors.

## Fallback (not taken)
nestjs-zod 5.5.0 + @nestjs/swagger 11.4.7 on the server and openapi-fetch 0.17.0 on the client (design §D.1).

## Consequences
- Every new error code is added to `ERROR_CATALOGUE`, declared on the procedure, and regenerates `openapi.json` (CI drift check).
- C2/C3 build `@sanchay/api-client` on `OpenAPILink`; the 9 conformance rows (delta §5.5) run against this contract.
