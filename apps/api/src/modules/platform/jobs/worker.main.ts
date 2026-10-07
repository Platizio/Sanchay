import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from '../../../app.module.js';
import type { Env } from '../../../config/env.js';

export async function runWorker(env: Env): Promise<INestApplicationContext> {
  const ctx = await NestFactory.createApplicationContext(AppModule.forRoot(env), {
    bufferLogs: true,
  });
  ctx.useLogger(ctx.get(Logger));
  ctx.enableShutdownHooks();
  process.once('SIGTERM', () => {
    void ctx.close().then(() => process.exit(0));
  });
  return ctx;
}
