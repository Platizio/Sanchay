import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Inject,
} from '@nestjs/common';
import { ORPCError } from '@orpc/server';
import { isErrorCode } from '@sanchay/contract';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Logger } from 'nestjs-pino';
import { AppError, type ErrorEnvelope, envelopeFor } from './errors.js';

const STATUS_TO_CODE = {
  400: 'VALIDATION_FAILED',
  401: 'AUTH_REQUIRED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  429: 'RATE_LIMITED',
} as const;

function isMappedStatus(status: number): status is keyof typeof STATUS_TO_CODE {
  return Object.hasOwn(STATUS_TO_CODE, status);
}

/** Maps anything raised outside oRPC handlers (guards, unknown routes, throttler) to the envelope. */
export function mapException(exception: unknown, requestId: string): ErrorEnvelope {
  if (exception instanceof AppError) {
    return envelopeFor(exception.code, requestId, exception.options);
  }
  if (exception instanceof ORPCError && isErrorCode(exception.code)) {
    return envelopeFor(exception.code, requestId);
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    if (isMappedStatus(status)) return envelopeFor(STATUS_TO_CODE[status], requestId);
  }
  return envelopeFor('INTERNAL', requestId);
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(@Inject(Logger) private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    const envelope = mapException(exception, String(request.id));
    if (envelope.code === 'INTERNAL') {
      this.logger.error({ err: exception, requestId: request.id }, ApiExceptionFilter.name);
    }
    void reply
      .status(envelope.status)
      .header('content-type', 'application/json; charset=utf-8')
      .header('cache-control', 'no-store')
      .send(envelope);
  }
}
