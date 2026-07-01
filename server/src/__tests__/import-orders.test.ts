import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';

process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgresql://test:test@127.0.0.1:5432/syntra_test';
process.env.JWT_SECRET ??= 'test-jwt-secret-with-at-least-32-characters';
process.env.REFRESH_TOKEN_SECRET ??= 'test-refresh-secret-with-at-least-32-characters';

const root = process.cwd();
const read = (file: string) => readFile(join(root, file), 'utf8');

test('parser de pedidos aceita modelo humano e separa validos, invalidos e duplicados', async () => {
  const { parseSpreadsheet } = await import('../services/spreadsheetParser.js');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Pedidos');
  sheet.addRow([
    'Nome do cliente',
    'Telefone do cliente',
    'Data do pedido',
    'Produto pedido',
    'Categoria do produto',
    'Quantidade',
    'Valor unitario',
    'Valor total',
    'Forma de pagamento',
    'Status do pedido',
    'Observacoes do pedido',
  ]);
  sheet.addRow(['Ana', '(11) 99999-8888', '01/06/2026', 'Pizza Calabresa', 'Pizzas', 1, 'R$ 45,00', 'R$ 45,00', 'Pix', 'entregue', '']);
  sheet.addRow(['Ana', '(11) 99999-8888', '01/06/2026', 'Pizza Calabresa', 'Pizzas', 1, 'R$ 45,00', 'R$ 45,00', 'Pix', 'entregue', '']);
  sheet.addRow(['Sem telefone', '', '01/06/2026', 'Refrigerante', 'Bebidas', 1, '6,00', '6,00', 'Dinheiro', 'entregue', '']);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

  const result = await parseSpreadsheet(buffer, 'pedidos.xlsx');

  assert.equal(result.valid.length, 1);
  assert.equal(result.duplicates.length, 1);
  assert.equal(result.invalid.length, 1);
  assert.equal(result.valid[0].customerPhone, '11999998888');
  assert.equal(result.valid[0].totalPrice, 45);
  assert.ok(result.valid[0].rowHash.length >= 32);
});

test('importacao de pedidos usa tabelas existentes, seguranca e UI do CRM', async () => {
  const schema = await read('server/src/db/schema.ts');
  const migration = await read('server/migrations/0018_import_orders.sql');
  const route = await read('server/src/routes/import.ts');
  const parser = await read('server/src/services/spreadsheetParser.ts');
  const app = await read('server/src/app.ts');
  const api = await read('src/lib/api.ts');
  const page = await read('src/pages/ImportOrdersPage.tsx');
  const layout = await read('src/components/layout/DashboardLayout.tsx');
  const appRoutes = await read('src/App.tsx');
  const pkg = await read('package.json');

  assert.match(schema, /export const importBatches = pgTable/);
  assert.match(schema, /export const importedOrders = pgTable/);
  assert.match(schema, /customerId: uuid\('customer_id'\)\.references\(\(\) => customers\.id/);
  assert.match(schema, /orderId: uuid\('order_id'\)\.references\(\(\) => orders\.id/);
  assert.match(migration, /create table if not exists import_batches/);
  assert.match(migration, /create table if not exists imported_orders/);
  assert.match(migration, /unique \(restaurant_id, row_hash\)/);

  assert.match(app, /import multipart from '@fastify\/multipart'/);
  assert.match(app, /app\.register\(multipart/);
  assert.match(app, /app\.register\(importRoutes, \{ prefix: '\/api' \}\)/);
  assert.match(route, /\/import\/preview/);
  assert.match(route, /\/import\/orders/);
  assert.match(route, /\/import\/template/);
  assert.match(route, /requireRoles\('owner', 'admin', 'manager'\)/);
  assert.match(route, /requirePlan\('plus'\)/);
  assert.match(route, /tx\s*\.insert\(orders\)/);
  assert.match(route, /tx\.insert\(orderItems\)/);
  assert.match(route, /tx\.insert\(importedOrders\)/);
  assert.match(parser, /Planilha antiga \.xls nao e aceita por seguranca/);

  assert.match(api, /init\.body instanceof FormData/);
  assert.match(api, /previewOrderImport\(file: File\)/);
  assert.match(api, /downloadOrderImportTemplate/);
  assert.match(page, /useDropzone/);
  assert.match(page, /Importar pedidos/);
  assert.match(page, /Valor total encontrado/);
  assert.match(layout, /Importar pedidos/);
  assert.match(layout, /hiddenInDemo: true/);
  assert.match(appRoutes, /path="importar-pedidos"/);
  assert.match(appRoutes, /privateRoutes\(\{ importOrders: true \}\)/);
  assert.match(appRoutes, /<Route path="\/demo" element=\{<DashboardLayout \/>\}>\s*\{privateRoutes\(\)\}/);
  assert.doesNotMatch(pkg, /"xlsx":/);
  assert.match(pkg, /"exceljs":/);
});
