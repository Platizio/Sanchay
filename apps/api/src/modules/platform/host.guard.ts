import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { AppConfig } from '../../config/app-config.js';
import { AppError } from './errors.js';
import { INFRA_ROUTE, type InfraRouteHosts } from './http-decorators.js';
import { headerValue } from './request-context.js';

export type AppHost = 'APP' | 'API';

function hostnameOf(origin: string): string {
  return new URL(origin).hostname;
}

/**
 * R-11: classifies the inbound request's Host header against SANCHAY_APP_ORIGIN / SANCHAY_API_ORIGIN.
 * Any mismatch is 404 (never 403 — an unrecognised host should look like nothing is there). Routes
 * carrying @InfraRoute are scoped by their own metadata; every other route is app-host only. Runs
 * first in app.module.ts's guard chain, before ClientGuard needs the Host header for anything.
 */
@Injectable()
export class HostGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AppConfig) private readonly config: AppConfig,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const host = this.classify(headerValue(req.headers.host));
    const infra = this.reflector.getAllAndOverride<InfraRouteHosts | undefined>(INFRA_ROUTE, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (infra === 'APP_AND_API_HOSTS') return true;
    if (infra === 'API_HOST') {
      if (host !== 'API') throw new AppError('NOT_FOUND');
      return true;
    }
    if (host !== 'APP') throw new AppError('NOT_FOUND');
    return true;
  }

  private classify(hostHeader: string | undefined): AppHost | null {
    if (hostHeader === undefined) return null;
    const bare = hostHeader.split(':')[0]?.toLowerCase();
    if (bare === hostnameOf(this.config.env.SANCHAY_APP_ORIGIN)) return 'APP';
    if (bare === hostnameOf(this.config.env.SANCHAY_API_ORIGIN)) return 'API';
    return null;
  }
}
