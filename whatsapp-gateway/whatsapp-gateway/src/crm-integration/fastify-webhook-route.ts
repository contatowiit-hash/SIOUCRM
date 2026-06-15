// ─────────────────────────────────────────────────────────────────────────────
// ARQUIVO: adicionar no seu backend Fastify existente
// Caminho sugerido: src/routes/webhooks/whatsapp.ts
// ─────────────────────────────────────────────────────────────────────────────

import type { FastifyInstance } from "fastify";
import type { WebhookPayload, IncomingMessage, SessionInfo } from "./types"; // ajuste o caminho

const GATEWAY_SECRET = process.env.GATEWAY_SECRET ?? "";
const WEBHOOK_TOLERANCE_MS = 5 * 60 * 1000;

async function verifyWebhookSignature(payload: string, timestamp: string, signature: string): Promise<boolean> {
  if (!GATEWAY_SECRET || !timestamp || !signature) return false;

  const ageMs = Date.now() - Number.parseInt(timestamp, 10) * 1000;
  if (!Number.isFinite(ageMs) || ageMs > WEBHOOK_TOLERANCE_MS || ageMs < -60_000) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(GATEWAY_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );

  const hex = signature.replace(/^sha256=/, "");
  const signatureBytes = new Uint8Array(hex.match(/.{1,2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? []);
  const signedPayload = encoder.encode(`${timestamp}.${payload}`);

  return crypto.subtle.verify("HMAC", key, signatureBytes, signedPayload);
}

export async function whatsappWebhookRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /webhooks/whatsapp
   * Recebe todos os eventos do gateway (mensagens, status de sessão, QR Code).
   */
  app.post<{ Body: WebhookPayload }>(
    "/webhooks/whatsapp",
    {
      // Remove autenticação JWT desta rota — usa GATEWAY_SECRET próprio
      onRequest: [],
    },
    async (request, reply) => {
      const rawBody = JSON.stringify(request.body ?? {});
      const timestamp = Array.isArray(request.headers["x-timestamp"])
        ? request.headers["x-timestamp"][0]
        : request.headers["x-timestamp"];
      const signature = Array.isArray(request.headers["x-webhook-signature"])
        ? request.headers["x-webhook-signature"][0]
        : request.headers["x-webhook-signature"];

      if (!(await verifyWebhookSignature(rawBody, timestamp ?? "", signature ?? ""))) {
        return reply.code(401).send({ error: "Não autorizado" });
      }

      const payload = request.body;

      switch (payload.event) {
        // ── Mensagem recebida ─────────────────────────────────────────────
        case "message.received": {
          const msg = payload.data as IncomingMessage;
          request.log.info(
            { tenantId: payload.tenantId, from: msg.from },
            "Mensagem WhatsApp recebida"
          );

          // TODO: salvar mensagem no banco e notificar o frontend via WebSocket/SSE
          // Exemplo:
          // await db.insert(messages).values({
          //   tenantId: msg.tenantId,
          //   from: msg.from,
          //   fromName: msg.fromName,
          //   body: msg.body,
          //   type: msg.type,
          //   timestamp: new Date(msg.timestamp * 1000),
          // });
          // websocket.emit(`tenant:${msg.tenantId}:message`, msg);

          break;
        }

        // ── Sessão conectada ──────────────────────────────────────────────
        case "session.connected": {
          const session = payload.data as SessionInfo;
          request.log.info(
            { tenantId: payload.tenantId, phone: session.phoneNumber },
            "Sessão WhatsApp conectada"
          );

          // TODO: atualizar status do tenant no banco
          // await db.update(tenants)
          //   .set({ whatsappStatus: "connected", whatsappPhone: session.phoneNumber })
          //   .where(eq(tenants.id, payload.tenantId));

          break;
        }

        // ── Sessão desconectada ───────────────────────────────────────────
        case "session.disconnected": {
          request.log.warn({ tenantId: payload.tenantId }, "Sessão WhatsApp desconectada");

          // TODO: atualizar status no banco
          // await db.update(tenants)
          //   .set({ whatsappStatus: "disconnected" })
          //   .where(eq(tenants.id, payload.tenantId));

          break;
        }

        // ── QR Code gerado ────────────────────────────────────────────────
        case "session.qr": {
          const { qrCode, qrString } = payload.data as { qrCode: string; qrString: string };
          request.log.info({ tenantId: payload.tenantId }, "QR Code gerado pelo gateway");

          // TODO: enviar QR Code para o frontend via WebSocket/SSE
          // websocket.emit(`tenant:${payload.tenantId}:qr`, { qrCode, qrString });

          break;
        }
      }

      return reply.code(200).send({ received: true });
    }
  );
}
