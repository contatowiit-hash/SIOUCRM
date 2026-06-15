import axios from "axios";
import { createHmac } from "node:crypto";
import { logger } from "./logger.js";
import type { WebhookPayload } from "../types/index.js";

const CRM_WEBHOOK_URL = process.env.CRM_WEBHOOK_URL ?? "http://localhost:3334/webhooks/whatsapp";
const GATEWAY_SECRET = process.env.GATEWAY_SECRET ?? "";

const signWebhook = (body: string, timestamp: string) =>
  `sha256=${createHmac("sha256", GATEWAY_SECRET).update(`${timestamp}.${body}`).digest("hex")}`;

export async function dispatchWebhook(payload: WebhookPayload): Promise<void> {
  try {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = JSON.stringify(payload);

    await axios.post(CRM_WEBHOOK_URL, body, {
      headers: {
        "Content-Type": "application/json",
        "X-Timestamp": timestamp,
        "X-Webhook-Signature": signWebhook(body, timestamp),
      },
      timeout: 10_000,
    });

    logger.debug({ event: payload.event, tenantId: payload.tenantId }, "Webhook enviado");
  } catch (error) {
    const err = error as { code?: string; message?: string; response?: { status?: number } };
    logger.error(
      {
        code: err.code,
        message: err.message,
        status: err.response?.status,
        event: payload.event,
        tenantId: payload.tenantId,
      },
      "Falha ao enviar webhook",
    );
  }
}
