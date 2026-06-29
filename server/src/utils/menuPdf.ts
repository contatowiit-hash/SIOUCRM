const maxPdfBytes = 6_000_000;
const maxMenuLength = 30_000;
const pricePattern = /(?:R\s*\$|RS|\$)\s*\d{1,5}(?:[.,]\d{1,2})?|\b\d{1,5}[.,]\d{2}\b/i;
const knownCategoryPattern =
  /^(?:pizzas?|bebidas?|refrigerantes?|sucos?|caf[eé]s?|sobremesas?|doces?|lanches?|hamb[uú]rgueres?|hamburgueres?|por[cç][oõ]es?|combos?|entradas?|pratos?|massas?|saladas?|carnes?|aves?|peixes?|sandu[ií]ches?|esfihas?|past[eé]is?|adicionais?|acompanhamentos?)$/i;

export class MenuPdfError extends Error {
  constructor(
    public readonly code: 'INVALID_PDF' | 'PDF_TOO_LARGE' | 'PDF_WITHOUT_READABLE_TEXT',
    message: string,
  ) {
    super(message);
    this.name = 'MenuPdfError';
  }
}

export const sanitizeMenuText = (value: string) =>
  value
    .replace(/<[^>]*>/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxMenuLength);

const normalizeLine = (value: string) =>
  value
    .normalize('NFKC')
    .replace(/\u00a0/g, ' ')
    .replace(/[•●▪◦]/g, '-')
    .replace(/\.{3,}/g, ' - ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .trim();

const titleCase = (value: string) =>
  value
    .toLocaleLowerCase('pt-BR')
    .replace(/(^|[\s/&-])([a-zà-ÿ])/g, (_, prefix: string, letter: string) => `${prefix}${letter.toLocaleUpperCase('pt-BR')}`);

const isLikelyCategory = (line: string) => {
  const withoutColon = line.replace(/:$/, '').trim();
  if (!withoutColon || pricePattern.test(withoutColon) || withoutColon.length > 60) return false;
  if (knownCategoryPattern.test(withoutColon)) return true;
  if (line.endsWith(':')) return true;

  const letters = withoutColon.replace(/[^A-Za-zÀ-ÿ]/g, '');
  return letters.length >= 3 && withoutColon === withoutColon.toLocaleUpperCase('pt-BR');
};

const cleanPriceLine = (line: string) =>
  line
    .replace(/-{2,}/g, ' - ')
    .replace(/\s*\|\s*/g, ' - ')
    .replace(/(?<![-–—])\s+(R\s*\$)/gi, ' - $1')
    .replace(/\s+-\s+-\s+/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim();

export const formatExtractedMenuText = (rawText: string) => {
  const lines = rawText
    .replace(/\r/g, '\n')
    .split('\n')
    .map(normalizeLine)
    .filter((line) => line && !/^--\s*\d+\s+of\s+\d+\s*--$/i.test(line) && !/^\d+$/.test(line));

  const readableCharacters = lines.join('').replace(/[^A-Za-zÀ-ÿ0-9]/g, '').length;
  if (readableCharacters < 30 || lines.length < 2) {
    throw new MenuPdfError(
      'PDF_WITHOUT_READABLE_TEXT',
      'Não consegui ler automaticamente esse PDF. Envie uma versão com texto ou cadastre o cardápio manualmente.',
    );
  }

  const output: string[] = [];
  const categories: string[] = [];
  let productCount = 0;
  let hasCategory = false;
  let previousWasProduct = false;

  for (const line of lines) {
    if (isLikelyCategory(line)) {
      const category = titleCase(line.replace(/:$/, '').trim());
      if (!categories.some((item) => item.toLocaleLowerCase('pt-BR') === category.toLocaleLowerCase('pt-BR'))) {
        categories.push(category);
      }
      if (output.length && output.at(-1) !== '') output.push('');
      output.push(`*${category}*`);
      hasCategory = true;
      previousWasProduct = false;
      continue;
    }

    if (pricePattern.test(line)) {
      if (!hasCategory && !output.length) output.push('*Cardápio*');
      output.push(`- ${cleanPriceLine(line.replace(/^[-–—]\s*/, ''))}`);
      productCount += 1;
      previousWasProduct = true;
      continue;
    }

    if (previousWasProduct) {
      output.push(`  ${line}`);
    } else {
      if (!output.length) output.push('*Cardápio*');
      output.push(`- ${line.replace(/^[-–—]\s*/, '')}`);
    }
    previousWasProduct = false;
  }

  const text = sanitizeMenuText(output
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim());

  if (text.length < 30) {
    throw new MenuPdfError(
      'PDF_WITHOUT_READABLE_TEXT',
      'Não consegui ler automaticamente esse PDF. Envie uma versão com texto ou cadastre o cardápio manualmente.',
    );
  }

  return { text, categories, productCount };
};

const decodePdfDataUrl = (dataUrl: string) => {
  const match = /^data:application\/pdf(?:;[^,]*)?;base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl);
  if (!match) throw new MenuPdfError('INVALID_PDF', 'O arquivo enviado não é um PDF válido.');

  const buffer = Buffer.from(match[1].replace(/\s/g, ''), 'base64');
  if (!buffer.length || !buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw new MenuPdfError('INVALID_PDF', 'O arquivo enviado não é um PDF válido.');
  }
  if (buffer.length > maxPdfBytes) {
    throw new MenuPdfError('PDF_TOO_LARGE', 'O PDF é muito grande. Envie um arquivo de até 6 MB.');
  }

  return buffer;
};

export const extractMenuFromPdfDataUrl = async (dataUrl: string) => {
  const buffer = decodePdfDataUrl(dataUrl);
  let parser: { getText: () => Promise<{ text: string }>; destroy: () => Promise<unknown> } | null = null;

  try {
    const { PDFParse } = await import('pdf-parse');
    parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    return formatExtractedMenuText(result.text);
  } catch (error) {
    if (error instanceof MenuPdfError) throw error;
    throw new MenuPdfError(
      'PDF_WITHOUT_READABLE_TEXT',
      'Não consegui ler automaticamente esse PDF. Envie uma versão com texto ou cadastre o cardápio manualmente.',
    );
  } finally {
    await parser?.destroy().catch(() => undefined);
  }
};

const generalMenuRequestPattern =
  /\b(?:cardapio|menu|ver (?:as )?opcoes|o que (?:voces )?(?:tem|servem)|quais (?:sao )?os produtos)\b/i;

const normalizeForMatch = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const menuCategoryBlocks = (menu: string) => {
  const matches = [...menu.matchAll(/^\*([^*\n]+)\*$/gm)];
  return matches.map((match, index) => ({
    category: match[1].trim(),
    content: menu.slice(match.index, matches[index + 1]?.index ?? menu.length).trim(),
  }));
};

const productStopWords = new Set([
  'cardapio',
  'menu',
  'preco',
  'valor',
  'quanto',
  'custa',
  'tem',
  'voces',
  'serve',
  'servido',
  'quero',
  'pedido',
  'pode',
  'mandar',
  'pizza',
  'pizzas',
  'bebida',
  'bebidas',
  'lanche',
  'lanches',
  'sobremesa',
  'sobremesas',
]);

const productWords = (value: string) =>
  normalizeForMatch(value)
    .split(' ')
    .filter((word) => word.length >= 4 && !productStopWords.has(word));

const productLines = (menu: string) =>
  menu
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('-') && pricePattern.test(line));

const findRequestedProductLine = (menu: string, customerMessage: string) => {
  const messageWords = new Set(productWords(customerMessage));
  if (!messageWords.size) return null;

  return (
    productLines(menu).find((line) => {
      const lineWords = productWords(line.replace(pricePattern, ''));
      return lineWords.some((word) => messageWords.has(word));
    }) ?? null
  );
};

export const buildDirectMenuReply = (menuText: string, customerMessage: string) => {
  const menu = menuText.trim();
  if (!menu) return null;

  const normalizedMessage = normalizeForMatch(customerMessage);
  const requestedCategory = menuCategoryBlocks(menu).find(({ category }) => {
    const normalizedCategory = normalizeForMatch(category);
    const singularCategory = normalizedCategory.replace(/s$/, '');
    return (
      normalizedCategory !== 'cardapio' &&
      (normalizedMessage.includes(normalizedCategory) ||
        (singularCategory.length >= 4 && normalizedMessage.includes(singularCategory)))
    );
  });
  if (requestedCategory) return `Claro! Estas são as opções de ${requestedCategory.category}:\n\n${requestedCategory.content}`;

  const requestedProduct = findRequestedProductLine(menu, customerMessage);
  if (requestedProduct) {
    return `Temos sim: ${requestedProduct.replace(/^-\s*/, '')}`;
  }

  if (!generalMenuRequestPattern.test(normalizedMessage)) return null;
  if (menu.length <= 1_700) return `Claro! Este é o nosso cardápio:\n\n${menu}`;

  const categories = Array.from(menu.matchAll(/^\*([^*\n]+)\*$/gm))
    .map((match) => match[1].trim())
    .filter((category) => category.toLocaleLowerCase('pt-BR') !== 'cardápio')
    .slice(0, 10);

  if (categories.length) {
    return `Temos ${categories.join(', ')}. Quer ver tudo ou prefere uma categoria?`;
  }

  return `Nosso cardápio tem bastante opção. Quer ver tudo ou me dizer o que você está procurando?`;
};
