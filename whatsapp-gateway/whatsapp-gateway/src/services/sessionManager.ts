import path from "node:path";
import fs from "node:fs";
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  type WASocket,
  type ConnectionState,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import QRCode from "qrcode";
import { logger } from "../lib/logger.js";
import { dispatchWebhook } from "../lib/webhook.js";
import type { SessionInfo, IncomingMessage } from "../types/index.js";

const SESSIONS_DIR = process.env.SESSIONS_DIR ?? "./sessions";

// Map de todas as sessões ativas: tenantId → socket
const sessions = new Map<string, WASocket>();

// Map do estado de cada sessão: tenantId → SessionInfo
const sessionStates = new Map<string, SessionInfo>();
const outboundByTenant = new Map<string, number[]>();
const outboundByRecipient = new Map<string, number[]>();

// ─── Helpers ────────────────────────────────────────────────────────────────

function getSessionDir(tenantId: string): string {
  return path.join(SESSIONS_DIR, tenantId);
}

function setState(tenantId: string, partial: Partial<SessionInfo>): void {
  const current = sessionStates.get(tenantId) ?? {
    tenantId,
    status: "connecting",
    qrCode: null,
    qrString: null,
    phoneNumber: null,
    connectedAt: null,
    lastSeen: null,
  };
  sessionStates.set(tenantId, { ...current, ...partial });
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function jidToPhone(jid: string | null | undefined): string {
  if (!jid) return "";
  return onlyDigits(jid.split("@")[0]?.split(":")[0] ?? "");
}

function getSenderPhone(
  key: {
    remoteJid?: string | null;
    participant?: string | null;
    senderPn?: string | null;
  },
  isGroup: boolean,
): string {
  const realPhoneJid = key.senderPn || (isGroup ? key.participant : key.remoteJid) || key.remoteJid || "";
  return jidToPhone(realPhoneJid);
}

async function resolveRecipientJid(socket: WASocket, to: string): Promise<string> {
  if (to.includes("@g.us")) throw new Error("Envio para grupos bloqueado");
  if (to.includes("@") && !to.endsWith("@s.whatsapp.net")) throw new Error("Destino de WhatsApp invalido");
  if (to.endsWith("@s.whatsapp.net")) return to;

  const phone = onlyDigits(to);
  if (phone.length < 10 || phone.length > 15) {
    throw new Error("Numero de WhatsApp invalido");
  }

  const phoneJid = `${phone}@s.whatsapp.net`;
  const [lookup] = (await socket.onWhatsApp(phoneJid)) ?? [];

  if (!lookup?.exists || !lookup.jid) {
    throw new Error("Numero nao encontrado no WhatsApp");
  }

  return lookup.jid;
}

function assertOutboundPacing(tenantId: string, to: string): void {
  const now = Date.now();
  const minuteAgo = now - 60_000;
  const tenantHistory = (outboundByTenant.get(tenantId) ?? []).filter((timestamp) => timestamp > minuteAgo);
  if (tenantHistory.length >= 20) throw new Error("Limite seguro de envios atingido");

  const recipientKey = `${tenantId}:${onlyDigits(to)}`;
  const recipientHistory = (outboundByRecipient.get(recipientKey) ?? []).filter((timestamp) => timestamp > minuteAgo);
  const lastRecipientSend = recipientHistory[recipientHistory.length - 1];
  if (lastRecipientSend && now - lastRecipientSend < 3_000) {
    throw new Error("Aguarde antes de enviar outra mensagem para este contato");
  }

  tenantHistory.push(now);
  recipientHistory.push(now);
  outboundByTenant.set(tenantId, tenantHistory);
  outboundByRecipient.set(recipientKey, recipientHistory);
}

// ─── Core ────────────────────────────────────────────────────────────────────

export async function createSession(tenantId: string): Promise<void> {
  // Se já existe sessão conectada, não cria outra
  const existing = sessions.get(tenantId);
  if (existing) {
    const state = sessionStates.get(tenantId);
    if (state?.status === "connected") {
      logger.info({ tenantId }, "Sessão já conectada, ignorando criação");
      return;
    }
  }

  logger.info({ tenantId }, "Iniciando sessão WhatsApp");
  setState(tenantId, { status: "connecting", qrCode: null, qrString: null });

  const sessionDir = getSessionDir(tenantId);
  fs.mkdirSync(sessionDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  const socket = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger as any),
    },
    printQRInTerminal: false,   // não printa no terminal, tratamos manualmente
    logger: logger.child({ tenantId }) as any,
    browser: ["Syntra Food", "Chrome", "1.0.0"],
    syncFullHistory: false,
    markOnlineOnConnect: false,
    connectTimeoutMs: 60_000,
    defaultQueryTimeoutMs: 30_000,
    keepAliveIntervalMs: 25_000,
  });

  sessions.set(tenantId, socket);

  // ── Eventos de conexão ──────────────────────────────────────────────────

  socket.ev.on("connection.update", async (update: Partial<ConnectionState>) => {
    const { connection, lastDisconnect, qr } = update;

    // QR Code gerado — converte para base64 e envia pro CRM
    if (qr) {
      logger.info({ tenantId }, "QR Code gerado");
      const qrBase64 = await QRCode.toDataURL(qr);

      setState(tenantId, {
        status: "qr_ready",
        qrCode: qrBase64,
        qrString: qr,
      });

      await dispatchWebhook({
        event: "session.qr",
        tenantId,
        timestamp: Date.now(),
        data: { qrCode: qrBase64, qrString: qr },
      });
    }

    if (connection === "open") {
      const phone = socket.user?.id?.split(":")[0] ?? null;
      logger.info({ tenantId, phone }, "WhatsApp conectado!");

      setState(tenantId, {
        status: "connected",
        qrCode: null,
        qrString: null,
        phoneNumber: phone,
        connectedAt: new Date(),
        lastSeen: new Date(),
      });

      await dispatchWebhook({
        event: "session.connected",
        tenantId,
        timestamp: Date.now(),
        data: sessionStates.get(tenantId)!,
      });
    }

    if (connection === "close") {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      logger.warn({ tenantId, statusCode, shouldReconnect }, "Conexão encerrada");

      setState(tenantId, { status: shouldReconnect ? "connecting" : "disconnected" });
      sessions.delete(tenantId);

      await dispatchWebhook({
        event: "session.disconnected",
        tenantId,
        timestamp: Date.now(),
        data: sessionStates.get(tenantId)!,
      });

      if (shouldReconnect) {
        // Aguarda 3s antes de tentar reconectar
        logger.info({ tenantId }, "Reconectando em 3s...");
        setTimeout(() => createSession(tenantId), 3_000);
      } else {
        // Usuário deslogou — apaga os arquivos de sessão
        logger.info({ tenantId }, "Usuário deslogou, removendo sessão");
        deleteSessionFiles(tenantId);
      }
    }
  });

  // ── Salva credenciais sempre que atualizam ──────────────────────────────

  socket.ev.on("creds.update", saveCreds);

  // ── Mensagens recebidas ─────────────────────────────────────────────────

  socket.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      // Ignora mensagens próprias e de status
      if (msg.key.fromMe) continue;
      if (msg.key.remoteJid === "status@broadcast") continue;

      const jid = msg.key.remoteJid ?? "";
      const isGroup = jid.endsWith("@g.us");
      if (isGroup) {
        logger.info({ tenantId, remoteJid: jid, messageId: msg.key.id }, "Mensagem de grupo ignorada");
        continue;
      }

      const fromNumber = getSenderPhone(
        msg.key as { remoteJid?: string | null; participant?: string | null; senderPn?: string | null },
        isGroup,
      );

      // Extrai o número limpo (sem @s.whatsapp.net)
      const fromName = msg.pushName ?? null;
      const profilePicUrl = await socket.profilePictureUrl(jid, "image").catch(() => null);

      if (!fromNumber) {
        logger.warn({ tenantId, remoteJid: jid, messageId: msg.key.id }, "Mensagem sem telefone real, ignorada");
        continue;
      }

      // Determina o tipo e conteúdo da mensagem
      let body = "";
      let type: IncomingMessage["type"] = "other";
      let mediaUrl: string | undefined;

      const content = msg.message;
      if (!content) continue;

      if (content.conversation) {
        body = content.conversation;
        type = "text";
      } else if (content.extendedTextMessage) {
        body = content.extendedTextMessage.text ?? "";
        type = "text";
      } else if (content.imageMessage) {
        body = content.imageMessage.caption ?? "";
        type = "image";
      } else if (content.videoMessage) {
        body = content.videoMessage.caption ?? "";
        type = "video";
      } else if (content.audioMessage) {
        type = "audio";
      } else if (content.documentMessage) {
        body = content.documentMessage.fileName ?? "";
        type = "document";
      } else if (content.stickerMessage) {
        type = "sticker";
      }

      const incoming: IncomingMessage = {
        tenantId,
        from: fromNumber,
        fromName,
        profilePicUrl,
        body,
        messageId: msg.key.id ?? "",
        timestamp: (msg.messageTimestamp as number) ?? Date.now(),
        type,
        mediaUrl,
        isGroup,
        groupId: isGroup ? jid.replace("@g.us", "") : undefined,
        groupName: undefined,
      };

      logger.debug({ tenantId, from: fromNumber, remoteJid: jid, type }, "Mensagem recebida");

      // Atualiza lastSeen da sessão
      setState(tenantId, { lastSeen: new Date() });

      // Envia para o CRM via webhook
      await dispatchWebhook({
        event: "message.received",
        tenantId,
        timestamp: Date.now(),
        data: incoming,
      });
    }
  });
}

// ─── Envio de mensagens ──────────────────────────────────────────────────────

export async function sendText(
  tenantId: string,
  to: string,
  message: string
): Promise<{ messageId: string }> {
  const socket = sessions.get(tenantId);
  if (!socket) throw new Error(`Sessão ${tenantId} não encontrada ou desconectada`);

  assertOutboundPacing(tenantId, to);
  const jid = await resolveRecipientJid(socket, to);

  const sent = await socket.sendMessage(jid, { text: message });
  return { messageId: sent?.key.id ?? "" };
}

export async function sendMedia(
  tenantId: string,
  to: string,
  mediaUrl: string,
  mediaType: "image" | "video" | "document" | "audio",
  caption?: string,
  fileName?: string
): Promise<{ messageId: string }> {
  const socket = sessions.get(tenantId);
  if (!socket) throw new Error(`Sessão ${tenantId} não encontrada ou desconectada`);

  assertOutboundPacing(tenantId, to);
  const jid = await resolveRecipientJid(socket, to);

  let sent;
  if (mediaType === "image") {
    sent = await socket.sendMessage(jid, { image: { url: mediaUrl }, caption });
  } else if (mediaType === "video") {
    sent = await socket.sendMessage(jid, { video: { url: mediaUrl }, caption });
  } else if (mediaType === "audio") {
    sent = await socket.sendMessage(jid, { audio: { url: mediaUrl }, mimetype: "audio/mpeg" });
  } else {
    sent = await socket.sendMessage(jid, {
      document: { url: mediaUrl },
      mimetype: "application/octet-stream",
      fileName: fileName ?? "arquivo",
      caption,
    });
  }

  return { messageId: sent?.key.id ?? "" };
}

// ─── Gestão de sessões ───────────────────────────────────────────────────────

export function getSessionInfo(tenantId: string): SessionInfo | null {
  return sessionStates.get(tenantId) ?? null;
}

export function getAllSessions(): SessionInfo[] {
  return Array.from(sessionStates.values());
}

export async function deleteSession(tenantId: string): Promise<void> {
  const socket = sessions.get(tenantId);
  if (socket) {
    await socket.logout();
    sessions.delete(tenantId);
  }
  deleteSessionFiles(tenantId);
  sessionStates.delete(tenantId);
  logger.info({ tenantId }, "Sessão removida");
}

function deleteSessionFiles(tenantId: string): void {
  const dir = getSessionDir(tenantId);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    logger.info({ tenantId }, "Arquivos de sessão removidos");
  }
}

/**
 * Recarrega todas as sessões salvas em disco ao iniciar o gateway.
 * Assim sessões anteriores reconectam automaticamente sem QR Code.
 */
export async function restoreAllSessions(): Promise<void> {
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    return;
  }

  const entries = fs.readdirSync(SESSIONS_DIR, { withFileTypes: true });
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const tenantIds = entries
    .filter((e) => e.isDirectory() && uuidPattern.test(e.name))
    .map((e) => e.name);

  if (tenantIds.length === 0) {
    logger.info("Nenhuma sessão anterior para restaurar");
    return;
  }

  logger.info({ count: tenantIds.length }, "Restaurando sessões anteriores...");

  for (const tenantId of tenantIds) {
    await createSession(tenantId);
  }
}
