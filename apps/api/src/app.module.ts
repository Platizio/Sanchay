import type { IncomingMessage } from 'node:http';
import { type DynamicModule, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { ORPCModule } from '@orpc/nest';
import { ClsModule, ClsService } from 'nestjs-cls';
import { Logger, LoggerModule } from 'nestjs-pino';
import { v7 as uuidv7 } from 'uuid';
import type { Env } from './config/env.js';
import { ApiExceptionFilter } from './modules/platform/api-exception.filter.js';
import { HealthRouter } from './modules/platform/health.router.js';
import { buildPinoHttpOptions } from './modules/platform/logging.js';
import { buildOrpcConfig } from './modules/platform/orpc.js';
import { PlatformModule } from './modules/platform/platform.module.js';
import {
  clientIpFrom,
  headerValue,
  type SanchayClsStore,
} from './modules/platform/request-context.js';

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
            },
          },
        }),
        ORPCModule.forRootAsync({
          inject: [ClsService, Logger],
          useFactory: (cls: ClsService<SanchayClsStore>, logger: Logger) =>
            buildOrpcConfig(cls, logger),
        }),
        PlatformModule.forRoot(env),
      ],
      controllers: [HealthRouter],
      providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }],
    };
  }
}
