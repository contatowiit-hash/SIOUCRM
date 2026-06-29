import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { buildDirectMenuReply, extractMenuFromPdfDataUrl, MenuPdfError } from '../utils/menuPdf.js';

const root = process.cwd();
const read = (file: string) => readFile(join(root, file), 'utf8');

const escapePdfText = (value: string) => value.replace(/([\\()])/g, '\\$1');

const createTextPdf = (lines: string[]) => {
  const textCommands = lines
    .map((line, index) => `${index ? '0 -22 Td ' : ''}(${escapePdfText(line)}) Tj`)
    .join('\n');
  const stream = `BT\n/F1 12 Tf\n72 760 Td\n${textCommands}\nET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return `data:application/pdf;base64,${Buffer.from(pdf).toString('base64')}`;
};

test('extrai e organiza produtos reais de um PDF de cardapio', async () => {
  const pdf = createTextPdf([
    'PIZZAS',
    'Margherita - R$ 35,00',
    'Molho, queijo e manjericao',
    'Calabresa - R$ 38,00',
    'BEBIDAS',
    'Refrigerante lata - R$ 6,00',
  ]);

  const menu = await extractMenuFromPdfDataUrl(pdf);

  assert.match(menu.text, /\*Pizzas\*/);
  assert.match(menu.text, /Margherita - R\$ 35,00/);
  assert.match(menu.text, /Calabresa - R\$ 38,00/);
  assert.match(menu.text, /\*Bebidas\*/);
  assert.match(menu.text, /Refrigerante lata - R\$ 6,00/);
  assert.equal(menu.productCount, 3);
  assert.deepEqual(menu.categories, ['Pizzas', 'Bebidas']);
});

test('rejeita PDF sem texto legivel com mensagem para cadastro manual', async () => {
  const pdf = createTextPdf([]);

  await assert.rejects(
    () => extractMenuFromPdfDataUrl(pdf),
    (error) =>
      error instanceof MenuPdfError &&
      error.code === 'PDF_WITHOUT_READABLE_TEXT' &&
      /cadastre o cardápio manualmente/.test(error.message),
  );
});

test('resposta direta do cardapio usa texto processado e nao fala apenas do PDF', () => {
  const menu = '*Pizzas*\n- Margherita - R$ 35,00\n- Calabresa - R$ 38,00';
  const reply = buildDirectMenuReply(menu, 'Pode me mandar o cardápio?');

  assert.match(reply ?? '', /Margherita/);
  assert.match(reply ?? '', /R\$ 35,00/);
  assert.doesNotMatch(reply ?? '', /pdf|arquivo/i);
  assert.doesNotMatch(reply ?? '', /produto inventado/i);
});

test('cardapio grande apresenta categorias antes de enviar tudo', () => {
  const menu = ['*Pizzas*', ...Array.from({ length: 100 }, (_, index) => `- Pizza ${index + 1} - R$ 35,00`), '', '*Bebidas*', '- Suco - R$ 8,00'].join('\n');
  const reply = buildDirectMenuReply(menu, 'Quero ver o menu');

  assert.match(reply ?? '', /Pizzas/);
  assert.match(reply ?? '', /Bebidas/);
  assert.match(reply ?? '', /prefere uma categoria/i);
});

test('pedido de categoria responde diretamente com produtos daquela categoria', () => {
  const menu = '*Pizzas*\n- Margherita - R$ 35,00\n\n*Bebidas*\n- Suco de laranja - R$ 8,00';
  const reply = buildDirectMenuReply(menu, 'Quais bebidas vocês têm?');

  assert.match(reply ?? '', /Bebidas/);
  assert.match(reply ?? '', /Suco de laranja/);
  assert.doesNotMatch(reply ?? '', /Margherita/);
});

test('pedido de produto responde com item real e preco do cardapio', () => {
  const menu = '*Pizzas*\n- Margherita - R$ 35,00\n- Calabresa - R$ 38,00\n\n*Bebidas*\n- Refrigerante lata - R$ 6,00';
  const reply = buildDirectMenuReply(menu, 'Quanto custa a calabresa?');

  assert.match(reply ?? '', /Calabresa - R\$ 38,00/);
  assert.doesNotMatch(reply ?? '', /Margherita/);
  assert.doesNotMatch(reply ?? '', /arquivo|pdf/i);
});

test('upload salva texto processado e ambos WhatsApps usam a IA', async () => {
  const aiSettings = await read('server/src/routes/ai-settings.ts');
  const aiContext = await read('server/src/utils/aiContext.ts');
  const aiSupport = await read('server/src/utils/aiSupport.ts');
  const whatsappWebhook = await read('server/src/routes/webhooks/whatsapp.ts');

  assert.match(aiSettings, /extractMenuFromPdfDataUrl\(input\.menu_pdf_data\)/);
  assert.match(aiSettings, /menuText: processedMenu\.text/);
  assert.match(aiSettings, /MENU_NOT_PROCESSED/);
  assert.match(aiSettings, /menu_pdf_processed: Boolean\(saved\.menuText\.trim\(\)\)/);
  assert.doesNotMatch(aiContext, /menuPdfName/);
  assert.match(aiContext, /INICIO DO CARDAPIO OFICIAL DO RESTAURANTE/);
  assert.match(aiContext, /FIM DO CARDAPIO OFICIAL DO RESTAURANTE/);
  assert.match(aiContext, /Nunca responda apenas que existe um PDF ou arquivo/);
  assert.match(aiSupport, /buildDirectMenuReply\(settings\.menuText, message\)/);
  assert.match(whatsappWebhook, /await generateAiSupportReply\(/);
  assert.doesNotMatch(whatsappWebhook, /Recebi sua mensagem pelo Syntra/);
});
