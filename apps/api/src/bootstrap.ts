import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { RawRequestDefaultExpression } from 'fastify';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { AppConfig } from './config/app-config.js';
import type { Env } from './config/env.js';
import { envelopeFor } from './modules/platform/errors.js';
import {
  clientIpFrom,
  requestIdFor,
  requiresClientIp,
} from './modules/platform/request-context.js';

export const API_PREFIX = 'api/v1';

/** 100 KiB: the largest MVP request body (onboarding profile) is far below this. */
const BODY_LIMIT_BYTES = 102_400;

export function buildFastifyAdapter(): FastifyAdapter {
  return new FastifyAdapter({
    trustProxy: false,
    bodyLimit: BODY_LIMIT_BYTES,
    // One id for Fastify, pino-http (reads raw.id) and nestjs-cls (idGenerator reads raw.id).
    genReqId: (raw: RawRequestDefaultExpression) => {
      const id = requestIdFor(raw.headers['x-request-id']);
      Object.assign(raw, { id });
      return id;
    },
  });
}

export function configureApp(app: NestFastifyApplication): void {
  const ipSource = app.get(AppConfig).env.SANCHAY_CLIENT_IP_SOURCE;
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix(API_PREFIX);
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onRequest', async (request, reply) => {
      void reply.header('x-request-id', request.id);
      void reply.header('cache-control', 'no-store');
      // H-1 fail-closed: user_ip is sent to FP on every order and must be IPv4.
      if (requiresClientIp(request.url) && clientIpFrom(request.raw, ipSource) === null) {
        return reply
          .status(422)
          .header('content-type', 'application/json; charset=utf-8')
          .send(envelopeFor('CLIENT_IP_UNSUPPORTED', String(request.id)));
      }
    });
}

export async function createApp(env: Env): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.forRoot(env),
    buildFastifyAdapter(),
    { bodyParser: false, bufferLogs: true },
  );
  configureApp(app);
  app.enableShutdownHooks();
  return app;
}
