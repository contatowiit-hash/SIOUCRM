import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { sessionRoutes } from "./routes/sessions.js";
import { messageRoutes } from "./routes/messages.js";
import { authMiddleware } from "./middlewares/auth.js";
import { restoreAllSessions } from "./services/sessionManager.js";
import { logger } from "./lib/logger.js";

const PORT = Number(process.env.PORT ?? 3001);

async function bootstrap(): Promise<void> {
  const app = Fastify({
    logger: false, // usamos o pino customizado
  });

  // ── Plugins de segurança ────────────────────────────────────────────────

  await app.register(cors, {
    origin: process.env.NODE_ENV === "production"
      ? [/localhost/, /127\.0\.0\.1/]   // em produção, coloque seu domínio aqui
      : true,
    methods: ["GET", "POST", "DELETE"],
  });

  await app.register(helmet, { contentSecurityPolicy: false });

  // ── Autenticação via X-Gateway-Secret ───────────────────────────────────

  app.addHook("onRequest", authMiddleware);

  // ── Health check (sem autenticação) ────────────────────────────────────

  app.get("/health", { onRequest: [] }, async () => ({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  }));

  // ── Rotas principais ────────────────────────────────────────────────────

  await app.register(sessionRoutes);
  await app.register(messageRoutes);

  // ── Start ───────────────────────────────────────────────────────────────

  await app.listen({ port: PORT, host: "0.0.0.0" });
  logger.info(`🚀 Gateway WhatsApp rodando em http://localhost:${PORT}`);

  // Restaura sessões salvas em disco (reconecta sem precisar de QR Code)
  await restoreAllSessions();
}

bootstrap().catch((err) => {
  logger.error(err, "Erro fatal ao iniciar gateway");
  process.exit(1);
});
