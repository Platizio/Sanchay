import type { IncomingHttpHeaders } from 'node:http';
import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { ClsService } from 'nestjs-cls';
import { AppConfig } from '../../config/app-config.js';
import { DEVICE_COOKIE, readCookie } from './cookies.js';
import { AppError } from './errors.js';
import { SKIP_CLIENT_CHECK } from './http-decorators.js';
import { UUID_RE } from './ids.js';
import { type ClientInfo, headerValue, type SanchayClsStore } from './request-context.js';

const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);
const WEB_DEVICE_RE = /^[A-Za-z0-9_-]{43}$/;

/**
 * D-4: every non-health request names its client (`web` or `android`; `ios` is P2-10, D-19).
 * H-7 CSRF: web mutations need Origin = SANCHAY_APP_ORIGIN and Sec-Fetch-Site: same-origin (SameSite=Lax cookies).
 */
export function resolveClient(
  headers: IncomingHttpHeaders,
  method: string,
  appOrigin: string,
): ClientInfo {
  const kind = headerValue(headers['x-sanchay-client']);
  if (kind === 'web') {
    if (!SAFE_METHODS.has(method.toUpperCase())) {
      if (headerValue(headers.origin) !== new URL(appOrigin).origin)
        throw new AppError('ORIGIN_REJECTED');
      if (headerValue(headers['sec-fetch-site']) !== 'same-origin')
        throw new AppError('ORIGIN_REJECTED');
    }
    const dev = readCookie(headerValue(headers.cookie), DEVICE_COOKIE);
    return {
      platform: 'WEB',
      deviceRef: dev !== undefined && WEB_DEVICE_RE.test(dev) ? dev : null,
      appVersion: null,
    };
  }
  if (kind === 'android') {
    const installationId = headerValue(headers['x-installation-id']);
    if (installationId === undefined || !UUID_RE.test(installationId))
      throw new AppError('ORIGIN_REJECTED');
    return {
      platform: 'ANDROID',
      deviceRef: installationId.toLowerCase(),
      appVersion: headerValue(headers['x-app-version'])?.slice(0, 32) ?? null,
    };
  }
  throw new AppError('ORIGIN_REJECTED');
}

@Injectable()
export class ClientGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ClsService) private readonly cls: ClsService<SanchayClsStore>,
    @Inject(AppConfig) private readonly config: AppConfig,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (
      this.reflector.getAllAndOverride<boolean>(SKIP_CLIENT_CHECK, [
        ctx.getHandler(),
        ctx.getClass(),
      ])
    ) {
      return true;
    }
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    this.cls.set(
      'client',
      resolveClient(req.headers, req.method, this.config.env.SANCHAY_APP_ORIGIN),
    );
    return true;
  }
}
