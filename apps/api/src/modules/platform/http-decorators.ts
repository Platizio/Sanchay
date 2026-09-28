import { applyDecorators, SetMetadata } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

export const IS_PUBLIC = 'sanchay:isPublic';
export const SKIP_CLIENT_CHECK = 'sanchay:skipClientCheck';
/** R-11: marks an infrastructure route; the value is the host scope HostGuard (Plan-02 kernel) enforces. */
export const INFRA_ROUTE = 'sanchay:infraRoute';

/** `API_HOST`: api.sanchay.in only (FP webhook, payment returns). `APP_AND_API_HOSTS`: both (health). */
export type InfraRouteHosts = 'API_HOST' | 'APP_AND_API_HOSTS';

/** Deny by default (design §O.4): only routes marked @Public() skip the session guard. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Only for routes that carry no x-sanchay-client header; use InfraRoute for infrastructure routes. */
export const SkipClientCheck = () => SetMetadata(SKIP_CLIENT_CHECK, true);

/**
 * R-11 guard exemption for infrastructure routes: `GET /api/v1/health`, `POST /api/v1/webhooks/fp` and
 * `/api/v1/pg/return/*`. They skip ClientGuard, SessionGuard and the throttler (the SkipThrottle metadata
 * is inert until B21 registers ThrottlerGuard) and are restricted only by HostGuard, which reads INFRA_ROUTE.
 */
export const InfraRoute = (hosts: InfraRouteHosts) =>
  applyDecorators(SetMetadata(INFRA_ROUTE, hosts), Public(), SkipClientCheck(), SkipThrottle());
