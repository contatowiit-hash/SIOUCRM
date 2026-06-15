import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import { lt } from 'drizzle-orm';
import { db } from '../db/client.js';
import { webhookReplayNonces } from '../db/schema.js';
import { sha256 } from '../utils/security.js';

const DEFAULT_TOLERANCE_MS = 5 * 60 * 1000;

type VerificationInput = {
  payload: string;
  secret: string;
  signature: string | null | undefined;
  timestamp: string | null | undefined;
  toleranceMs?: number;
  nowMs?: number;
};

const toTimestampMs = (timestamp: string) => {
  const parsed = Number(timestamp);
  if (!Number.isFinite(parsed)) return null;
  return parsed > 1_000_000_000_000 ? parsed : parsed * 1000;
};

const normalizeSignature = (signature: string) => signature.replace(/^sha256=/i, '').trim();

export const createWebhookSignature = (payload: string, timestamp: string, secret: string) =>
  `sha256=${createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex')}`;

export const verifyWebhookHmac = ({
  payload,
  secret,
  signature,
  timestamp,
  toleranceMs = DEFAULT_TOLERANCE_MS,
  nowMs = Date.now(),
}: VerificationInput) => {
  if (!secret || !signature || !timestamp) {
    return { ok: false as const, reason: 'missing_signature' };
  }

  const timestampMs = toTimestampMs(timestamp);
  if (!timestampMs) {
    return { ok: false as const, reason: 'invalid_timestamp' };
  }

  const age = nowMs - timestampMs;
  if (age > toleranceMs || age < -60_000) {
    return { ok: false as const, reason: 'timestamp_outside_tolerance' };
  }

  const expected = normalizeSignature(createWebhookSignature(payload, timestamp, secret));
  const received = normalizeSignature(signature);

  try {
    const left = Buffer.from(expected, 'hex');
    const right = Buffer.from(received, 'hex');
    if (left.length !== right.length || !timingSafeEqual(left, right)) {
      return { ok: false as const, reason: 'signature_mismatch' };
    }
  } catch {
    return { ok: false as const, reason: 'invalid_signature_format' };
  }

  return { ok: true as const, replayKey: sha256(`${timestamp}.${received}`), timestampMs };
};

const getHeader = (request: FastifyRequest, name: string) => {
  const value = request.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
};

const getRawPayload = (request: FastifyRequest) => {
  const rawBody = (request as FastifyRequest & { rawBody?: string }).rawBody;
  return rawBody ?? JSON.stringify(request.body ?? {});
};

const consumeReplayKey = async (key: string, expiresAt: Date) => {
  await db.delete(webhookReplayNonces).where(lt(webhookReplayNonces.expiresAt, new Date()));

  const [inserted] = await db
    .insert(webhookReplayNonces)
    .values({ key, expiresAt })
    .onConflictDoNothing()
    .returning({ key: webhookReplayNonces.key });

  return Boolean(inserted);
};

export const createWebhookHmacMiddleware = ({
  getSecret,
  replayPrefix,
  toleranceMs = DEFAULT_TOLERANCE_MS,
}: {
  getSecret: () => string | undefined;
  replayPrefix: string;
  toleranceMs?: number;
}): preHandlerHookHandler => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const secret = getSecret();
    const payload = getRawPayload(request);
    const timestamp = getHeader(request, 'x-timestamp');
    const signature = getHeader(request, 'x-webhook-signature') || getHeader(request, 'x-hub-signature-256');

    const verification = verifyWebhookHmac({
      payload,
      secret: secret ?? '',
      signature,
      timestamp,
      toleranceMs,
    });

    if (!verification.ok) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const replayKey = `${replayPrefix}:${verification.replayKey}`;
    const consumed = await consumeReplayKey(replayKey, new Date(verification.timestampMs + toleranceMs));
    if (!consumed) {
      return reply.code(409).send({ error: 'Replay detected' });
    }
  };
};
