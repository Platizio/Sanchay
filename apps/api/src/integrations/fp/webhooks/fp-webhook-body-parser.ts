import type { FastifyInstance, FastifyRequest } from 'fastify';

const WEBHOOK_PATH = '/api/v1/webhooks/fp';
/** Matches bootstrap.ts BODY_LIMIT_BYTES; the FP webhook body is far smaller in practice. */
const RAW_BODY_LIMIT = 102_400;

/**
 * Replaces Fastify's built-in `application/json` content-type parser (bootstrap.ts sets
 * `bodyParser: false`, which only disables Nest's own parser registration — Fastify's default JSON
 * parser is still active for every other route) so the FP webhook route alone gets the raw bytes,
 * needed to verify FP-Signature over the exact wire body. Every other application/json route is
 * delegated to Fastify's own default parser, so it keeps its empty-body 400 and its prototype
 * poisoning guard.
 */
export function installFpWebhookRawBodyParser(instance: FastifyInstance): void {
  // Fastify's own default parser for every other route: the empty-body 400
  // (FST_ERR_CTP_EMPTY_JSON_BODY) and the __proto__/constructor poisoning guard ('error' is
  // Fastify's default for both, which `buildFastifyAdapter` does not override).
  const defaultJsonParser = instance.getDefaultJsonParser('error', 'error');
  instance.removeContentTypeParser('application/json');
  instance.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer', bodyLimit: RAW_BODY_LIMIT },
    (request: FastifyRequest, body: Buffer, done: (err: Error | null, body?: unknown) => void) => {
      if (request.url.startsWith(WEBHOOK_PATH)) {
        done(null, body);
        return;
      }
      defaultJsonParser(request, body.toString('utf8'), done);
    },
  );
}
