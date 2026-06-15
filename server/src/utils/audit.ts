import type { FastifyRequest } from 'fastify';
import { db } from '../db/client.js';
import { auditLogs } from '../db/schema.js';
import { getIp } from './security.js';
import { redactSensitive } from './logger.js';

const AUDIT_PRIVATE_KEY_PATTERN = /(email|phone|customer|name|message|body|address|qr|restaurant)/i;

const redactAuditPrivateData = (value: unknown, depth = 0): unknown => {
  const safeValue = redactSensitive(value);
  if (depth > 6 || !safeValue || typeof safeValue !== 'object') return safeValue;
  if (Array.isArray(safeValue)) return safeValue.map((item) => redactAuditPrivateData(item, depth + 1));

  return Object.fromEntries(
    Object.entries(safeValue as Record<string, unknown>).map(([key, item]) => [
      key,
      AUDIT_PRIVATE_KEY_PATTERN.test(key) ? '[REDACTED]' : redactAuditPrivateData(item, depth + 1),
    ]),
  );
};

export const writeAuditLog = async ({
  request,
  restaurantId,
  userId,
  action,
  resourceType,
  resourceId,
  oldData,
  newData,
}: {
  request: FastifyRequest;
  restaurantId: string;
  userId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  oldData?: unknown;
  newData?: unknown;
}) => {
  await db.insert(auditLogs).values({
    restaurantId,
    userId: userId ?? null,
    action,
    resourceType,
    resourceId: resourceId ?? null,
    oldData: oldData === undefined ? null : redactAuditPrivateData(oldData),
    newData: newData === undefined ? null : redactAuditPrivateData(newData),
    ipAddress: getIp(request.headers),
    userAgent: request.headers['user-agent'],
  });
};