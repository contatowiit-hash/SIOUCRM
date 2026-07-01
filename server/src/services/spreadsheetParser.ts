import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import { sanitizeMultilineText, sanitizePhone, sanitizeText, sha256 } from '../utils/security.js';

export interface RawOrderRow {
  customerName: string;
  customerPhone: string;
  orderedAt: unknown;
  product: string;
  category?: string;
  quantity: unknown;
  unitPrice: unknown;
  totalPrice: unknown;
  paymentMethod?: string;
  status?: string;
  notes?: string;
}

export interface ParsedOrder {
  customerName: string;
  customerPhone: string;
  orderedAt: Date;
  product: string;
  category: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  paymentMethod: string | null;
  status: string | null;
  notes: string | null;
  rowHash: string;
}

export interface ParseResult {
  valid: ParsedOrder[];
  invalid: { row: number; reason: string; data: RawOrderRow }[];
  duplicates: { row: number; data: ParsedOrder }[];
}

const headerAliases: Record<keyof RawOrderRow, string[]> = {
  customerName: ['customername', 'nomecliente', 'nomedocliente', 'cliente', 'nome'],
  customerPhone: ['customerphone', 'telefonecliente', 'telefonedocliente', 'telefone', 'celular', 'whatsapp'],
  orderedAt: ['orderedat', 'datapedido', 'datadopedido', 'data', 'pedidoem'],
  product: ['product', 'produto', 'produtopedido', 'produtodopedido', 'item'],
  category: ['category', 'categoria', 'categoriaproduto', 'categoriadoproduto'],
  quantity: ['quantity', 'quantidade', 'qtd'],
  unitPrice: ['unitprice', 'valorunitario', 'valorunitário', 'preco', 'preço', 'precounitario', 'preçounitario'],
  totalPrice: ['totalprice', 'valortotal', 'total', 'valor'],
  paymentMethod: ['paymentmethod', 'formapagamento', 'formadepagamento', 'pagamento'],
  status: ['status', 'statuspedido', 'statusdopedido', 'situacao', 'situação'],
  notes: ['notes', 'observacoes', 'observações', 'observacaopedido', 'observaçãopedido'],
};

const normalizeHeader = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();

const findField = (headers: string[], field: keyof RawOrderRow) => {
  const aliases = headerAliases[field].map(normalizeHeader);
  return headers.findIndex((header) => aliases.includes(header));
};

const cellValue = (value: ExcelJS.CellValue) => {
  if (value instanceof Date) return value;
  if (value && typeof value === 'object') {
    if ('text' in value && typeof value.text === 'string') return value.text;
    if ('result' in value) return value.result;
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join('');
    }
  }
  return value ?? '';
};

const rowCellValues = (row: ExcelJS.Row) => {
  if (!Array.isArray(row.values)) return [];
  return row.values.slice(1) as ExcelJS.CellValue[];
};

const getMappedValue = (values: unknown[], index: number) => (index >= 0 ? values[index] : '');

const parseMoney = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const withoutCurrency = raw.replace(/[R$\s]/g, '');
  const normalized =
    withoutCurrency.includes(',') && withoutCurrency.lastIndexOf(',') > withoutCurrency.lastIndexOf('.')
      ? withoutCurrency.replace(/\./g, '').replace(',', '.')
      : withoutCurrency.replace(/,/g, '');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseQuantity = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  const parsed = Number.parseInt(String(value ?? '').replace(/\D/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseDate = (value: unknown) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    return new Date(excelEpoch + value * 24 * 60 * 60 * 1000);
  }

  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (br) {
    const year = br[3].length === 2 ? `20${br[3]}` : br[3];
    const date = new Date(Number(year), Number(br[2]) - 1, Number(br[1]), Number(br[4] ?? 12), Number(br[5] ?? 0));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
};

const buildRowHash = (order: Omit<ParsedOrder, 'rowHash'>) =>
  sha256(
    [
      order.customerPhone,
      order.orderedAt.toISOString(),
      order.product.toLowerCase(),
      order.quantity,
      order.unitPrice.toFixed(2),
      order.totalPrice.toFixed(2),
    ].join('|'),
  );

export const parseSpreadsheet = async (buffer: Buffer, filename: string): Promise<ParseResult> => {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'xls') {
    throw new Error('Planilha antiga .xls nao e aceita por seguranca. Salve como .xlsx ou .csv e envie novamente.');
  }
  if (ext !== 'xlsx' && ext !== 'csv') {
    throw new Error('Use uma planilha .xlsx ou .csv.');
  }

  const workbook = new ExcelJS.Workbook();
  if (ext === 'csv') {
    await workbook.csv.read(Readable.from(buffer));
  } else {
    await workbook.xlsx.load(buffer);
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('A planilha esta vazia.');

  const headerRow = sheet.getRow(1);
  const headers = rowCellValues(headerRow)
    .map((value) => normalizeHeader(cellValue(value as ExcelJS.CellValue)));
  const fieldIndexes = Object.fromEntries(
    (Object.keys(headerAliases) as Array<keyof RawOrderRow>).map((field) => [field, findField(headers, field)]),
  ) as Record<keyof RawOrderRow, number>;

  const valid: ParsedOrder[] = [];
  const invalid: ParseResult['invalid'] = [];
  const duplicates: ParseResult['duplicates'] = [];
  const seen = new Set<string>();

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = rowCellValues(row).map((value) => cellValue(value as ExcelJS.CellValue));
    const raw: RawOrderRow = {
      customerName: String(getMappedValue(values, fieldIndexes.customerName) ?? ''),
      customerPhone: String(getMappedValue(values, fieldIndexes.customerPhone) ?? ''),
      orderedAt: getMappedValue(values, fieldIndexes.orderedAt),
      product: String(getMappedValue(values, fieldIndexes.product) ?? ''),
      category: String(getMappedValue(values, fieldIndexes.category) ?? ''),
      quantity: getMappedValue(values, fieldIndexes.quantity),
      unitPrice: getMappedValue(values, fieldIndexes.unitPrice),
      totalPrice: getMappedValue(values, fieldIndexes.totalPrice),
      paymentMethod: String(getMappedValue(values, fieldIndexes.paymentMethod) ?? ''),
      status: String(getMappedValue(values, fieldIndexes.status) ?? ''),
      notes: String(getMappedValue(values, fieldIndexes.notes) ?? ''),
    };

    const isEmpty = Object.values(raw).every((value) => String(value ?? '').trim() === '');
    if (isEmpty) return;

    const errors: string[] = [];
    const customerName = sanitizeText(raw.customerName, 100);
    const customerPhone = sanitizePhone(raw.customerPhone);
    const orderedAt = parseDate(raw.orderedAt);
    const product = sanitizeText(raw.product, 120);
    const quantity = parseQuantity(raw.quantity) ?? 1;
    const unitPriceFromSheet = parseMoney(raw.unitPrice);
    const totalPriceFromSheet = parseMoney(raw.totalPrice);
    const unitPrice = unitPriceFromSheet ?? (totalPriceFromSheet !== null ? totalPriceFromSheet / quantity : 0);
    const totalPrice = totalPriceFromSheet ?? unitPrice * quantity;

    if (!customerName) errors.push('nome do cliente vazio');
    if (!customerPhone || customerPhone.replace(/\D/g, '').length < 10) errors.push('telefone invalido');
    if (!product) errors.push('produto vazio');
    if (quantity <= 0) errors.push('quantidade invalida');
    if (unitPrice < 0) errors.push('valor unitario invalido');
    if (totalPrice < 0) errors.push('valor total invalido');

    if (errors.length) {
      invalid.push({ row: rowNumber, reason: errors.join('; '), data: raw });
      return;
    }

    const parsedWithoutHash = {
      customerName,
      customerPhone,
      orderedAt: orderedAt ?? new Date(),
      product,
      category: sanitizeText(raw.category || '', 80) || null,
      quantity,
      unitPrice,
      totalPrice,
      paymentMethod: sanitizeText(raw.paymentMethod || '', 60) || null,
      status: sanitizeText(raw.status || '', 40) || null,
      notes: sanitizeMultilineText(raw.notes || '', 1000) || null,
    };
    const parsed: ParsedOrder = { ...parsedWithoutHash, rowHash: buildRowHash(parsedWithoutHash) };

    if (seen.has(parsed.rowHash)) {
      duplicates.push({ row: rowNumber, data: parsed });
      return;
    }

    seen.add(parsed.rowHash);
    valid.push(parsed);
  });

  return { valid, invalid, duplicates };
};
