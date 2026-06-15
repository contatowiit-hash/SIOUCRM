import type { FastifyInstance } from "fastify";
import { sendText, sendMedia, getSessionInfo } from "../services/sessionManager.js";
import type { SendTextPayload, SendMediaPayload } from "../types/index.js";
import { logger } from "../lib/logger.js";

export async function messageRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /messages/text
   * Envia uma mensagem de texto simples.
   */
  app.post<{ Body: SendTextPayload }>(
    "/messages/text",
    async (request, reply) => {
      const { tenantId, to, message } = request.body;

      if (!tenantId || !to || !message) {
        return reply.code(400).send({ error: "tenantId, to e message são obrigatórios" });
      }

      // Valida se sessão está conectada
      const session = getSessionInfo(tenantId);
      if (!session || session.status !== "connected") {
        return reply.code(409).send({
          error: "Sessão não conectada",
          status: session?.status ?? "not_found",
        });
      }

      // Normaliza o número — remove tudo que não é dígito
      const toNormalized = to.replace(/\D/g, "");

      try {
        const result = await sendText(tenantId, toNormalized, message);
        return reply.send({ success: true, messageId: result.messageId });
      } catch (error) {
        logger.error({ err: error, tenantId }, "send text failed");
        return reply.code(502).send({ error: "Nao foi possivel enviar a mensagem agora." });
      }
    }
  );

  /**
   * POST /messages/media
   * Envia imagem, vídeo, áudio ou documento por URL.
   */
  app.post<{ Body: SendMediaPayload }>(
    "/messages/media",
    async (request, reply) => {
      const { tenantId, to, mediaUrl, caption, mediaType, fileName } = request.body;

      if (!tenantId || !to || !mediaUrl || !mediaType) {
        return reply.code(400).send({
          error: "tenantId, to, mediaUrl e mediaType são obrigatórios",
        });
      }

      const session = getSessionInfo(tenantId);
      if (!session || session.status !== "connected") {
        return reply.code(409).send({
          error: "Sessão não conectada",
          status: session?.status ?? "not_found",
        });
      }

      const toNormalized = to.replace(/\D/g, "");

      try {
        const result = await sendMedia(
          tenantId,
          toNormalized,
          mediaUrl,
          mediaType,
          caption,
          fileName
        );

        return reply.send({ success: true, messageId: result.messageId });
      } catch (error) {
        logger.error({ err: error, tenantId }, "send media failed");
        return reply.code(502).send({ error: "Nao foi possivel enviar a midia agora." });
      }
    }
  );
}
