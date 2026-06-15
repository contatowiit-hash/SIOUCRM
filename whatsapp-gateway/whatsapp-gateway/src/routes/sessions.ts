import type { FastifyInstance } from "fastify";
import {
  createSession,
  getSessionInfo,
  getAllSessions,
  deleteSession,
} from "../services/sessionManager.js";

export async function sessionRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /sessions/:tenantId
   * Cria ou reconecta uma sessão WhatsApp.
   * Retorna imediatamente — o QR Code chega via webhook.
   */
  app.post<{ Params: { tenantId: string } }>(
    "/sessions/:tenantId",
    async (request, reply) => {
      const { tenantId } = request.params;

      if (!tenantId || tenantId.length < 3) {
        return reply.code(400).send({ error: "tenantId inválido" });
      }

      // Cria sessão em background — não bloqueia a resposta
      createSession(tenantId).catch((err) => {
        request.log.error({ err, tenantId }, "Erro ao criar sessão");
      });

      return reply.code(202).send({
        message: "Sessão iniciando. Aguarde o QR Code via webhook.",
        tenantId,
      });
    }
  );

  /**
   * GET /sessions/:tenantId
   * Retorna o estado atual da sessão (status, QR Code, número conectado).
   * O frontend pode fazer polling aqui para exibir o QR Code.
   */
  app.get<{ Params: { tenantId: string } }>(
    "/sessions/:tenantId",
    async (request, reply) => {
      const { tenantId } = request.params;
      const info = getSessionInfo(tenantId);

      if (!info) {
        return reply.code(404).send({ error: "Sessão não encontrada" });
      }

      return reply.send(info);
    }
  );

  /**
   * GET /sessions
   * Lista todas as sessões ativas.
   */
  app.get("/sessions", async (_request, reply) => {
    return reply.send(getAllSessions());
  });

  /**
   * DELETE /sessions/:tenantId
   * Desconecta e remove completamente a sessão.
   */
  app.delete<{ Params: { tenantId: string } }>(
    "/sessions/:tenantId",
    async (request, reply) => {
      const { tenantId } = request.params;
      const info = getSessionInfo(tenantId);

      if (!info) {
        return reply.code(404).send({ error: "Sessão não encontrada" });
      }

      await deleteSession(tenantId);
      return reply.send({ message: "Sessão removida com sucesso" });
    }
  );
}
