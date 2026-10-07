import { Controller, HttpCode, Inject, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AppConfig } from '../../../config/app-config.js';
import { DB, type DbHandle } from '../../../db/client.js';
import { inboundWebhookEvents } from '../../../modules/fp-webhooks/inbound-webhook.schema.js';
import { CLOCK, type Clock } from '../../../modules/platform/clock.js';
import { readCookie, SESSION_COOKIE } from '../../../modules/platform/cookies.js';
import { Crypto } from '../../../modules/platform/crypto.js';
import { AppError } from '../../../modules/platform/errors.js';
import { InfraRoute } from '../../../modules/platform/http-decorators.js';
import { newId } from '../../../modules/platform/ids.js';
import { Jobs } from '../../../modules/platform/jobs/jobs.service.js';
import { headerValue } from '../../../modules/platform/request-context.js';
import { verifyFpSignature } from './fp-signature.js';

interface FpWebhookEnvelope {
  event: { id: string; type: string };
  data: { object: { id: string; object: string } };
}

function parseEnvelope(raw: Buffer): FpWebhookEnvelope | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString('utf8'));
  } catch {
    return null;
  }
  const p = parsed as Partial<FpWebhookEnvelope> | null;
  const eventId = p?.event?.id;
  const eventType = p?.event?.type;
  const objectId = p?.data?.object?.id;
  const objectType = p?.data?.object?.object;
  if (
    typeof eventId !== 'string' ||
    typeof eventType !== 'string' ||
    typeof objectId !== 'string' ||
    typeof objectType !== 'string'
  ) {
    return null;
  }
  return {
    event: { id: eventId, type: eventType },
    data: { object: { id: objectId, object: objectType } },
  };
}

@InfraRoute('API_HOST')
@Controller()
export class FpWebhookController {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(Crypto) private readonly crypto: Crypto,
    @Inject(Jobs) private readonly jobs: Jobs,
  ) {}

  @Post('webhooks/fp')
  @HttpCode(200)
  async receive(@Req() req: FastifyRequest): Promise<{ received: true }> {
    // A real FP webhook call never carries a Sanchay session cookie; see E1's deviation note 3
    // (HostGuard, which would classify this by host instead, arrives with E2).
    if (readCookie(headerValue(req.headers.cookie), SESSION_COOKIE) !== undefined) {
      throw new AppError('NOT_FOUND');
    }

    // The raw-body parser only runs for a JSON content type; with no body at all req.body is undefined.
    if (!Buffer.isBuffer(req.body)) throw new AppError('VALIDATION_FAILED');
    const raw = req.body;
    const { valid, signatureMode } = verifyFpSignature(
      raw,
      headerValue(req.headers['fp-signature']),
      this.config.env.SANCHAY_FP_WEBHOOK_SECRET,
      this.config.env.SANCHAY_FP_WEBHOOK_AUTH,
    );
    const payloadSha256 = this.crypto.sha256(raw);
    const id = newId('inbound_webhook_events');

    if (!valid) {
      await this.dbh.db.insert(inboundWebhookEvents).values({
        id,
        provider: 'FP',
        eventId: `invalid:${id}`,
        eventType: 'SIGNATURE_INVALID',
        objectType: null,
        objectId: null,
        signatureMode,
        signatureValid: false,
        payloadEnc: null,
        payloadSha256,
        status: 'FAILED',
        receivedAt: this.clock.now(),
        lastError: 'signature invalid',
      });
      throw new AppError('AUTH_REQUIRED');
    }

    const envelope = parseEnvelope(raw);
    if (envelope === null) {
      await this.dbh.db.insert(inboundWebhookEvents).values({
        id,
        provider: 'FP',
        eventId: `unparseable:${id}`,
        eventType: 'UNPARSEABLE',
        objectType: null,
        objectId: null,
        signatureMode,
        signatureValid: true,
        payloadEnc: this.crypto.encrypt(raw.toString('utf8'), {
          table: 'inbound_webhook_events',
          column: 'payload',
          rowId: id,
        }),
        payloadSha256,
        status: 'FAILED',
        receivedAt: this.clock.now(),
        lastError: 'could not parse event/data.object',
      });
      throw new AppError('VALIDATION_FAILED');
    }

    await this.dbh.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(inboundWebhookEvents)
        .values({
          id,
          provider: 'FP',
          eventId: envelope.event.id,
          eventType: envelope.event.type,
          objectType: envelope.data.object.object,
          objectId: envelope.data.object.id,
          signatureMode,
          signatureValid: true,
          payloadEnc: this.crypto.encrypt(raw.toString('utf8'), {
            table: 'inbound_webhook_events',
            column: 'payload',
            rowId: id,
          }),
          payloadSha256,
          status: 'RECEIVED',
          receivedAt: this.clock.now(),
        })
        .onConflictDoNothing({
          target: [inboundWebhookEvents.provider, inboundWebhookEvents.eventId],
        })
        .returning({ id: inboundWebhookEvents.id });
      if (inserted.length === 1 && inserted[0] !== undefined) {
        await this.jobs.enqueue(
          tx,
          'fp.event.process',
          { eventRowId: inserted[0].id },
          { singletonKey: inserted[0].id },
        );
      }
    });
    return { received: true };
  }
}
