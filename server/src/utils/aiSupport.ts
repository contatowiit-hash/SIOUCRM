import { and, asc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { aiSettings, whatsappMessages } from '../db/schema.js';
import { getEffectivePlan } from '../services/usage.js';
import { buildGroqSupportContext } from './aiContext.js';
import { generateGroqReply, isGroqConfigured } from './groq.js';
import { buildDirectMenuReply } from './menuPdf.js';
import { sanitizeMultilineText, sanitizeText } from './security.js';

type AiReplyInput = {
  restaurantId: string;
  conversationId: string;
  customerName: string;
  message: string;
};

export const generateAiSupportReply = async ({ restaurantId, conversationId, customerName, message }: AiReplyInput) => {
  const plan = await getEffectivePlan(restaurantId);
  if (!plan || plan.plan === 'free') return null;

  const [settings] = await db.select().from(aiSettings).where(eq(aiSettings.restaurantId, restaurantId)).limit(1);
  if (!settings || !settings.autoRepliesEnabled || settings.temporarilyPaused || settings.transferToHuman) return null;

  const directMenuReply = buildDirectMenuReply(settings.menuText, message);
  if (directMenuReply) return sanitizeMultilineText(directMenuReply, 1800);
  if (!isGroqConfigured()) return null;

  const recentMessages = await db
    .select()
    .from(whatsappMessages)
    .where(and(eq(whatsappMessages.restaurantId, restaurantId), eq(whatsappMessages.conversationId, conversationId)))
    .orderBy(asc(whatsappMessages.createdAt))
    .limit(12);

  const context = buildGroqSupportContext(settings);
  const history = recentMessages.map((item) => ({
    role: item.direction === 'outbound' ? ('assistant' as const) : ('user' as const),
    content: sanitizeText(item.body, 1200),
  }));

  const conversation = history.length ? history : [{ role: 'user' as const, content: sanitizeText(message, 1200) }];
  const reply = await generateGroqReply([
    {
      role: 'system',
      content: [
        context,
        '',
        `Cliente atual: ${customerName}.`,
        'Responda curto, natural, em portugues do Brasil e como atendimento de WhatsApp.',
        'Quando faltar informacao essencial para fechar pedido, pergunte apenas o proximo dado necessario.',
      ].join('\n'),
    },
    ...conversation,
  ]);

  return sanitizeMultilineText(reply, 1800);
};
