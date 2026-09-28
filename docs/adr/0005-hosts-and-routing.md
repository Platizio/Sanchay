# ADR-0005: Hosts, routes and the web proxy (MVP)

- Status: Accepted
- Date: 2026-09-25 (harmonized ruling H-1); recorded by Plan 01 Task C10
- Scope: MVP closed pilot. CloudFront, WAF and EdgeGuard return in P2-2.

## Context

The design's four-host model assumed CloudFront in front of every host. The MVP runs one ECS service behind
an IPv4-only ALB (ADR-0014), so the application enforces host separation itself.

## Decision

### Hosts (`/api/v1` is the API prefix on every host)

| Host | Serves | Auth |
|---|---|---|
| `www.sanchay.in` | Static public pages. The Next app rewrites them under `/site`. The ALB sends the apex to www with a 301. | none |
| `app.sanchay.in` | The investor web app at root routes, the same-origin cookie API `/api/v1/*`, `/.well-known/assetlinks.json` and the web returns `/r/[kind]` | cookie `__Host-sanchay_sid` only |
| `api.sanchay.in` | The native bearer API `/api/v1/*`, `POST /api/v1/webhooks/fp` and `GET\|POST /api/v1/pg/return/{ref}` | bearer only; cookies ignored |
| `ops.sanchay.in` | Reserved, with no DNS record (P2-1) | none |

- The API-side HostGuard lands in the S2 kernel. It allows cookie auth only on the app host, and bearer auth, webhooks and returns only on the api host. A mismatch returns 404.
- The client IP is the rightmost `X-Forwarded-For` entry, which the ALB appends (`SANCHAY_CLIENT_IP_SOURCE=alb`). Anything other than IPv4 returns 422 `CLIENT_IP_UNSUPPORTED`.

### Web proxy (`apps/web/src/proxy.ts`, `src/lib/routing.ts`)

| Host kind | Path | Decision |
|---|---|---|
| www | `/login`, `/signup` | 308 to the app origin, keeping the query |
| www | any other path | rewrite to `/site<path>` |
| app | `/site`, `/site/*` | 404 |
| app, local | `/app`, `/app/<p>` | 307 to `/<p>` (web fallback for Android App Links) |
| local | `/site/*` | served without the app CSP |
| app, local | protected path without the `__Host-sanchay_si` or `__Host-sanchay_sid` cookie | 307 to `/login`, or to `/login?next=<path>` |
| app, local | any other path | served with a per-request nonce CSP and `x-robots-tag: noindex` |

- The public app paths are `/login`, `/signup` and `/r/*`. Every other path outside `/site` is protected.
- The host kind is `local` (`any` in code) when `SANCHAY_APP_ORIGIN` or `SANCHAY_WWW_ORIGIN` is unset. Unknown hosts are treated as www.
- The host is read only from the `Host` header.

### Web routes

`/login`, `/signup`, `/` (Home), `/onboarding/[step]`, `/explore`, `/explore/category/[slug]`, `/funds/[schemeSlug]`,
`/invest/[schemeId]/{lumpsum,sip}` → `/review` → `/confirm/[challengeId]` → `/pay/[orderId]` → `/result/[orderId]`,
`/portfolio/**`, `/redeem/[folioId]/[isin]`, `/account/**`, `/r/[kind]`.

### `safeNext`

Only `^/(?!/)[A-Za-z0-9/_-]*$` is accepted. The login redirect therefore carries the pathname and drops the query.

### Platform ARN

`SANCHAY_PLATFORM_ARN` must match `^ARN-\d{1,9}$` in both `readSiteConfig` and `dsc02` (`packages/domain/src/legal-entity.ts`, C6), so a bad value fails at config time. `readSiteConfig` repeats this literal because `apps/web`'s `site-config.ts` does not depend on `@sanchay/domain`.

### Native deep links

- Android App Links are verified on `https://app.sanchay.in/app/*` (`autoVerify`).
- `+native-intent.tsx` strips `/app`, validates the route against a zod allowlist and drops unknown parameters.
- Links never execute actions and never carry tokens or PII.
- The `sanchay://` scheme exists only when `APP_VARIANT` is not `production`.

### Payment and mandate returns

- The FP `payment_postback_url` is `https://api.sanchay.in/api/v1/pg/return/{ref}`. The `ref` is opaque, 128-bit and single use.
- The API enqueues a re-fetch and never trusts the return parameters. It answers 303:
  - to `https://app.sanchay.in/r/{kind}?ref=` for web;
  - to `https://app.sanchay.in/app/r/{kind}?ref=` for Android.

## Consequences

- One Next deployment serves both www and app. The www pages must never import react-native-web.
- App pages render per request (no PPR) so that every script carries the nonce.
- P2-2 replaces the in-app host checks with CloudFront, WAF and EdgeGuard without changing any URL.
