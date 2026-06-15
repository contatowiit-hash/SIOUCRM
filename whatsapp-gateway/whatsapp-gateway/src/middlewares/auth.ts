import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from "fastify";

const GATEWAY_SECRET = process.env.GATEWAY_SECRET ?? "";
const REQUEST_TOLERANCE_MS = 5 * 60 * 1000;
const replayKeys = new Map<string, number>();

function getHeader(request: FastifyRequest, name: string): string | null {
  const value = request.headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] ?? null;
  return typeof value === "string" ? value : null;
}

function safeCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function cleanupReplayKeys(now: number): void {
  for (const [key, expiresAt] of replayKeys.entries()) {
    if (expiresAt <= now) replayKeys.delete(key);
  }
}

export function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction
): void {
  if (request.url === "/health") {
    return done();
  }

  if (!GATEWAY_SECRET) {
    if (process.env.NODE_ENV === "production") {
      reply.code(503).send({ error: "Gateway não configurado" });
      return;
    }

    request.log.warn("GATEWAY_SECRET não configurado — rotas desprotegidas em desenvolvimento");
    return done();
  }

  const timestamp = getHeader(request, "x-timestamp");
  const signature = getHeader(request, "x-gateway-signature");
  if (!timestamp || !signature) {
    reply.code(401).send({ error: "Não autorizado", message: "Assinatura ausente" });
    return;
  }

  const now = Date.now();
  const ageMs = now - Number.parseInt(timestamp, 10) * 1000;
  if (!Number.isFinite(ageMs) || ageMs > REQUEST_TOLERANCE_MS || ageMs < -60_000) {
    reply.code(401).send({ error: "Não autorizado", message: "Assinatura expirada" });
    return;
  }

  cleanupReplayKeys(now);
  const replayKey = `${timestamp}:${signature}`;
  if (replayKeys.has(replayKey)) {
    reply.code(409).send({ error: "Requisição repetida" });
    return;
  }

  const expected = `sha256=${createHmac("sha256", GATEWAY_SECRET)
    .update(`${timestamp}.${request.method.toUpperCase()}.${request.url}`)
    .digest("hex")}`;

  if (!safeCompare(expected, signature)) {
    reply.code(401).send({ error: "Não autorizado", message: "Assinatura inválida" });
    return;
  }

  replayKeys.set(replayKey, now + REQUEST_TOLERANCE_MS);
  done();
}
