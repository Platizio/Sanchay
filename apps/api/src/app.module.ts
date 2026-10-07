import type { IncomingMessage } from 'node:http';
import { type DynamicModule, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ORPCModule } from '@orpc/nest';
import { ClsModule, ClsService } from 'nestjs-cls';
import { Logger, LoggerModule } from 'nestjs-pino';
import { v7 as uuidv7 } from 'uuid';
import type { Env } from './config/env.js';
import { FpModule } from './integrations/fp/fp.module.js';
import { FpWebhooksModule } from './integrations/fp/webhooks/fp-webhooks.module.js';
import { IntegrationsModule } from './integrations/integrations.module.js';
import { CatalogueModule } from './modules/catalogue/catalogue.module.js';
import { IdentityModule } from './modules/identity/identity.module.js';
import { SessionGuard } from './modules/identity/session.guard.js';
import { LegalConsentModule } from './modules/legal-consent/legal-consent.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { ApiExceptionFilter } from './modules/platform/api-exception.filter.js';
import { ClientGuard } from './modules/platform/client.guard.js';
import { HealthRouter } from './modules/platform/health.router.js';
import { JobsModule } from './modules/platform/jobs/jobs.module.js';
import { buildPinoHttpOptions } from './modules/platform/logging.js';
import { buildOrpcConfig } from './modules/platform/orpc.js';
import { PlatformModule } from './modules/platform/platform.module.js';
import {
  clientIpFrom,
  headerValue,
  type SanchayClsStore,
} from './modules/platform/request-context.js';
import { throttleKey, throttleTracker } from './modules/platform/throttle.js';

type RawRequest = IncomingMessage & { id?: string };

@Module({})
export class AppModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => env] }),
        LoggerModule.forRoot({ pinoHttp: buildPinoHttpOptions(env) }),
        ClsModule.forRoot({
          global: true,
          middleware: {
            mount: true,
            generateId: true,
            // Same id as Fastify and pino-http: bootstrap.ts genReqId stores it on the raw request.
            idGenerator: (req: RawRequest) => req.id ?? uuidv7(),
            setup: (cls, req: RawRequest) => {
              cls.set('ip', clientIpFrom(req, env.SANCHAY_CLIENT_IP_SOURCE));
              cls.set('userAgent', headerValue(req.headers['user-agent'])?.slice(0, 512) ?? null);
              cls.set('client', null);
              cls.set('auth', null);
              cls.set('dbInTx', false);
            },
          },
        }),
        ThrottlerModule.forRoot({
          throttlers: [{ name: 'default', ttl: 60_000, limit: env.SANCHAY_THROTTLE_PER_MINUTE }],
          getTracker: throttleTracker,
          generateKey: throttleKey,
        }),
        ORPCModule.forRootAsync({
          inject: [ClsService, Logger],
          useFactory: (cls: ClsService<SanchayClsStore>, logger: Logger) =>
            buildOrpcConfig(cls, logger),
        }),
        PlatformModule.forRoot(env),
        JobsModule,
        IntegrationsModule.forRoot(env),
        NotificationsModule,
        IdentityModule,
        FpWebhooksModule.forRoot(env),
        LegalConsentModule,
        // "Providers are called only from worker jobs": FpModule is never imported in the api role.
        ...(env.SANCHAY_APP_ROLE === 'worker' ? [FpModule.forRoot(env)] : []),
        CatalogueModule.forRoot(env),
      ],
      controllers: [HealthRouter],
      providers: [
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
        // Order matters: client identification, then session. B21 appends ThrottlerGuard third.
        { provide: APP_GUARD, useClass: ClientGuard },
        { provide: APP_GUARD, useClass: SessionGuard },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    };
  }
}
