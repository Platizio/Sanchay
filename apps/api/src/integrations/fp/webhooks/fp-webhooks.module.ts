import { type DynamicModule, Module, type OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { FastifyInstance } from 'fastify';
import type { Env } from '../../../config/env.js';
import { FpEventJob } from './fp-event.job.js';
import { FpWebhookController } from './fp-webhook.controller.js';
import { installFpWebhookRawBodyParser } from './fp-webhook-body-parser.js';

@Module({})
export class FpWebhooksModule implements OnModuleInit {
  constructor(private readonly adapterHost: HttpAdapterHost) {}

  /** FpEventJob injects FpRead, which only the worker role provides. */
  static forRoot(env: Env): DynamicModule {
    return {
      module: FpWebhooksModule,
      controllers: [FpWebhookController],
      providers: env.SANCHAY_APP_ROLE === 'worker' ? [FpEventJob] : [],
    };
  }

  onModuleInit(): void {
    // The worker runs as an application context with no HTTP adapter.
    const adapter = this.adapterHost.httpAdapter;
    if (!adapter) return;
    installFpWebhookRawBodyParser(adapter.getInstance() as FastifyInstance);
  }
}
