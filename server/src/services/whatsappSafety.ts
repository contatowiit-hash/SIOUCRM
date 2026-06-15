import { and, desc, eq, gt, or } from 'drizzle-orm';
import { db } from '../db/client.js';
import { customers, whatsappMessages } from '../db/schema.js';
import { sanitizePhone } from '../utils/security.js';

export const WHATSAPP_OPT_OUT_TAG = 'Não enviar WhatsApp';

const normalizePhone = (value: string) => sanitizePhone(value).replace(/\D/g, '');
const phoneCondition = (restaurantId: string, phone: string) =>
  and(
    eq(whatsappMessages.restaurantId, restaurantId),
    or(eq(whatsappMessages.phone, phone), eq(whatsappMessages.phone, `+${phone}`)),
  );

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const isWhatsAppOptOutRequest = (message: string) => {
  const normalized = normalizeText(message);
  return /^(parar|pare|sair|stop|cancelar|cancela|nao quero|nao envie|nao me mande|remover|me remova)( mensagens?)?$/.test(
    normalized,
  );
};

export const registerWhatsAppOptOut = async (restaurantId: string, phoneValue: string, message: string) => {
  if (!isWhatsAppOptOutRequest(message)) return false;
  const phone = normalizePhone(phoneValue);
  const [customer] = await db
    .select({ id: customers.id, tags: customers.tags })
    .from(customers)
    .where(
      and(
        eq(customers.restaurantId, restaurantId),
        or(eq(customers.phone, phone), eq(customers.phone, `+${phone}`)),
        eq(customers.isDeleted, false),
      ),
    )
    .limit(1);
  if (!customer) return true;

  const tags = Array.from(new Set([...(customer.tags ?? []), WHATSAPP_OPT_OUT_TAG]));
  await db
    .update(customers)
    .set({ tags, updatedAt: new Date() })
    .where(and(eq(customers.id, customer.id), eq(customers.restaurantId, restaurantId)));
  return true;
};

export const isWhatsAppInboundDuplicate = async (restaurantId: string, provider: string, providerMessageId: string) => {
  if (!providerMessageId) return false;
  const [existing] = await db
    .select({ id: whatsappMessages.id })
    .from(whatsappMessages)
    .where(
      and(
        eq(whatsappMessages.restaurantId, restaurantId),
        eq(whatsappMessages.provider, provider),
        eq(whatsappMessages.providerMessageId, providerMessageId),
        eq(whatsappMessages.direction, 'inbound'),
      ),
    )
    .limit(1);
  return Boolean(existing);
};

export const checkWhatsAppSendAllowed = async ({
  restaurantId,
  phone: phoneValue,
  message,
}: {
  restaurantId: string;
  phone: string;
  message: string;
}) => {
  const phone = normalizePhone(phoneValue);
  if (phone.length < 10 || phone.length > 15 || phoneValue.includes('@g.us')) {
    return { allowed: false as const, reason: 'Número inválido ou conversa de grupo.' };
  }

  const [customer] = await db
    .select({ tags: customers.tags })
    .from(customers)
    .where(
      and(
        eq(customers.restaurantId, restaurantId),
        or(eq(customers.phone, phone), eq(customers.phone, `+${phone}`)),
        eq(customers.isDeleted, false),
      ),
    )
    .limit(1);
  if (customer?.tags?.includes(WHATSAPP_OPT_OUT_TAG)) {
    return { allowed: false as const, reason: 'Este cliente pediu para não receber mensagens.' };
  }

  const now = Date.now();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const hourAgo = new Date(now - 60 * 60 * 1000);
  const [recentInbound] = await db
    .select({ id: whatsappMessages.id })
    .from(whatsappMessages)
    .where(and(phoneCondition(restaurantId, phone), eq(whatsappMessages.direction, 'inbound'), gt(whatsappMessages.createdAt, dayAgo)))
    .limit(1);
  if (!recentInbound) {
    return {
      allowed: false as const,
      reason: 'Por segurança, envie somente para clientes que falaram com o restaurante nas últimas 24 horas.',
    };
  }

  const recipientOutbound = await db
    .select({ body: whatsappMessages.body, createdAt: whatsappMessages.createdAt })
    .from(whatsappMessages)
    .where(and(phoneCondition(restaurantId, phone), eq(whatsappMessages.direction, 'outbound'), gt(whatsappMessages.createdAt, dayAgo)))
    .orderBy(desc(whatsappMessages.createdAt))
    .limit(30);

  const lastOutbound = recipientOutbound[0];
  if (lastOutbound && now - lastOutbound.createdAt.getTime() < 8_000) {
    return { allowed: false as const, reason: 'Aguarde alguns segundos antes de enviar outra mensagem para este cliente.' };
  }
  if (recipientOutbound.filter((item) => item.createdAt > hourAgo).length >= 8) {
    return { allowed: false as const, reason: 'Limite seguro de mensagens para este cliente atingido. Tente mais tarde.' };
  }

  const normalizedMessage = normalizeText(message);
  if (normalizedMessage && recipientOutbound.some((item) => normalizeText(item.body) === normalizedMessage)) {
    return { allowed: false as const, reason: 'Esta mensagem já foi enviada para o cliente recentemente.' };
  }

  const restaurantOutbound = await db
    .select({ id: whatsappMessages.id })
    .from(whatsappMessages)
    .where(
      and(
        eq(whatsappMessages.restaurantId, restaurantId),
        eq(whatsappMessages.direction, 'outbound'),
        gt(whatsappMessages.createdAt, hourAgo),
      ),
    )
    .limit(121);
  if (restaurantOutbound.length >= 120) {
    return { allowed: false as const, reason: 'Limite seguro de envios do restaurante atingido. Aguarde antes de continuar.' };
  }

  return { allowed: true as const, phone };
};
