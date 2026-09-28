import type { ORPCGlobalContext, ORPCModuleConfig } from '@orpc/nest';
import { onError } from '@orpc/server';
import {
  RequestHeadersPlugin,
  type RequestHeadersPluginContext,
  ResponseHeadersPlugin,
  type ResponseHeadersPluginContext,
} from '@orpc/server/plugins';
import type { ClsService } from 'nestjs-cls';
import type { Logger } from 'nestjs-pino';
import { normalizeOrpcError } from './errors.js';
import type { SanchayClsStore } from './request-context.js';

declare module '@orpc/nest' {
  interface ORPCGlobalContext extends RequestHeadersPluginContext, ResponseHeadersPluginContext {}
}

export function buildOrpcConfig(
  cls: ClsService<SanchayClsStore>,
  logger: Logger,
): ORPCModuleConfig {
  return {
    context: {},
    plugins: [
      new RequestHeadersPlugin<ORPCGlobalContext>(),
      new ResponseHeadersPlugin<ORPCGlobalContext>(),
    ],
    interceptors: [
      onError((error) => {
        const requestId = cls.isActive() ? cls.getId() : 'unknown';
        throw normalizeOrpcError(error, requestId, (e) => logger.error({ err: e }, 'orpc'));
      }),
    ],
  };
}
