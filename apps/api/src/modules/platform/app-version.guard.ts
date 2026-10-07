import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';
import { DB, type DbHandle } from '../../db/client.js';
import { AppError } from './errors.js';
import { INFRA_ROUTE } from './http-decorators.js';
import type { SanchayClsStore } from './request-context.js';
import { RuntimeConfig } from './runtime-config.js';

function isBelowMinVersion(current: string, min: string): boolean {
  const c = current.split('.').map((n) => Number.parseInt(n, 10));
  const m = min.split('.').map((n) => Number.parseInt(n, 10));
  for (let i = 0; i < Math.max(c.length, m.length); i += 1) {
    const cv = c[i] ?? 0;
    const mv = m[i] ?? 0;
    if (Number.isNaN(cv) || Number.isNaN(mv)) return false; // unparseable -> fail open on format
    if (cv > mv) return false;
    if (cv < mv) return true;
  }
  return false;
}

/** Server half of SYS-01 (the client-side handling of a 426 response is E24): 426 below the floor. */
@Injectable()
export class AppVersionGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ClsService) private readonly cls: ClsService<SanchayClsStore>,
    @Inject(DB) private readonly dbh: DbHandle,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const infra = this.reflector.getAllAndOverride<unknown>(INFRA_ROUTE, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (infra !== undefined) return true;
    const client = this.cls.get('client');
    if (client === null || client.platform !== 'ANDROID' || client.appVersion === null) return true;
    const min = await RuntimeConfig.get(this.dbh.db, 'minAppVersion.android');
    if (isBelowMinVersion(client.appVersion, min)) {
      throw new AppError('APP_VERSION_UNSUPPORTED');
    }
    return true;
  }
}
