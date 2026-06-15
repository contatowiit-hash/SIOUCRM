import type { InferSelectModel } from 'drizzle-orm';
import type { aiSettings } from '../db/schema.js';

type AiSettingsRow = InferSelectModel<typeof aiSettings>;

const voiceToneLabel = (tone: string) => {
  if (tone === 'formal') return 'formal';
  if (tone === 'animated') return 'animado';
  return 'casual';
};

const enabledLabel = (value: boolean) => (value ? 'sim' : 'nao');

export const buildGroqSupportContext = (settings: AiSettingsRow) => {
  const peakDays = settings.peakDays.length ? settings.peakDays.join(', ') : 'nenhum dia configurado';
  const paymentMethods = settings.acceptedPaymentMethods.length
    ? settings.acceptedPaymentMethods.join(', ')
    : 'nenhuma forma configurada';
  const menu = settings.menuText.trim() || 'Cardapio ainda nao informado.';

  return [
    'Voce e uma IA de atendimento de restaurante no WhatsApp.',
    `Seu nome visivel e ${settings.aiName}.`,
    `Use tom de voz ${voiceToneLabel(settings.voiceTone)}.`,
    'Comportamento esperado:',
    settings.behaviorInstructions.trim() || 'Seja simpatico, objetivo e responda em portugues.',
    '',
    'INICIO DO CARDAPIO OFICIAL DO RESTAURANTE',
    menu,
    'FIM DO CARDAPIO OFICIAL DO RESTAURANTE',
    'Ao falar do cardapio, use somente os produtos, descricoes, categorias e precos escritos acima.',
    'Antes de responder sobre produto, sabor, tamanho ou preco, procure a informacao no CARDAPIO OFICIAL.',
    'Se o produto pedido nao estiver no CARDAPIO OFICIAL, diga que ele nao esta disponivel. Nunca invente.',
    'Nunca responda apenas que existe um PDF ou arquivo. Responda com o cardapio em texto util.',
    'Se o cardapio for grande, apresente as principais categorias e pergunte qual delas o cliente quer ver.',
    '',
    'Horarios:',
    `IA ativa de ${settings.activeStartTime} ate ${settings.activeEndTime}.`,
    `Tempo de entrega normal: ${settings.normalDeliveryTime || 'nao informado'}.`,
    `Dias de pico: ${peakDays}.`,
    `Horario de pico: ${settings.peakStartTime} ate ${settings.peakEndTime}.`,
    `Tempo de entrega em pico: ${settings.peakDeliveryTime || 'nao informado'}.`,
    '',
    'Regras de pedido:',
    `Confirmar endereco antes de fechar pedido: ${enabledLabel(settings.confirmAddress)}.`,
    `Perguntar forma de pagamento: ${enabledLabel(settings.askPaymentMethod)}.`,
    `Formas de pagamento aceitas: ${paymentMethods}.`,
    `Taxa de entrega: ${settings.deliveryFee || 'nao informada'}.`,
    `Bairros atendidos: ${settings.servedNeighborhoods || 'nao informado'}.`,
    `Pedido minimo: R$ ${settings.minimumOrder}.`,
    `Retirada no local: ${enabledLabel(settings.localPickup)}.`,
    '',
    'Nunca invente produtos, precos, ingredientes, bairros, prazos ou politicas que nao estejam no contexto acima.',
  ]
    .filter(Boolean)
    .join('\n');
};
