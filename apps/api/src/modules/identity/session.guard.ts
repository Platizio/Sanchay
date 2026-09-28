import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { ClsService } from 'nestjs-cls';
import { readCookie, SESSION_COOKIE } from '../platform/cookies.js';
import { sha256 } from '../platform/crypto.js';
import { AppError } from '../platform/errors.js';
import { IS_PUBLIC } from '../platform/http-decorators.js';
import { headerValue, type SanchayClsStore } from '../platform/request-context.js';
import { SessionService } from './session.service.js';

const BEARER_RE = /^Bearer ([A-Za-z0-9_-]{43})$/;

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ClsService) private readonly cls: ClsService<SanchayClsStore>,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]))
      return true;
    const client = this.cls.get('client');
    if (!client) throw new AppError('AUTH_REQUIRED');
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const authorization = headerValue(req.headers.authorization);
    let token: string | undefined;
    let via: 'COOKIE' | 'BEARER';
    if (authorization !== undefined) {
      // Cookies are ignored whenever Authorization is present; web never uses bearer tokens.
      if (client.platform === 'WEB') throw new AppError('AUTH_REQUIRED');
      token = BEARER_RE.exec(authorization)?.[1];
      via = 'BEARER';
    } else {
      if (client.platform !== 'WEB') throw new AppError('AUTH_REQUIRED');
      token = readCookie(headerValue(req.headers.cookie), SESSION_COOKIE);
      via = 'COOKIE';
    }
    if (token === undefined) throw new AppError('AUTH_REQUIRED');
    const session = await this.sessions.resolve(token, {
      platform: client.platform,
      deviceRefHash:
        client.platform === 'WEB' || client.deviceRef === null ? null : sha256(client.deviceRef),
    });
    this.cls.set('auth', { ...session, via });
    return true;
  }
}
