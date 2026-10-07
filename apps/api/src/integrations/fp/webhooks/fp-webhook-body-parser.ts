import type { FastifyInstance, FastifyRequest } from 'fastify';

const WEBHOOK_PATH = '/api/v1/webhooks/fp';
/** Matches bootstrap.ts BODY_LIMIT_BYTES; the FP webhook body is far smaller in practice. */
const RAW_BODY_LIMIT = 102_400;

/**
 * Replaces Fastify's built-in `application/json` content-type parser (bootstrap.ts sets
 * `bodyParser: false`, which only disables Nest's own parser registration — Fastify's default JSON
 * parser is still active for every other route) so the FP webhook route alone gets the raw bytes,
 * needed to verify FP-Signature over the exact wire body. Every other application/json route keeps
 * the same JSON.parse behaviour as before.
 */
export function installFpWebhookRawBodyParser(instance: FastifyInstance): void {
  instance.removeContentTypeParser('application/json');
  instance.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer', bodyLimit: RAW_BODY_LIMIT },
    (request: FastifyRequest, body: Buffer, done: (err: Error | null, body?: unknown) => void) => {
      if (request.url.startsWith(WEBHOOK_PATH)) {
        done(null, body);
        return;
      }
      if (body.length === 0) {
        done(null, undefined);
        return;
      }
      try {
        done(null, JSON.parse(body.toString('utf8')));
      } catch (cause) {
        done(cause as Error);
      }
    },
  );
}
