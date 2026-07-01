import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import { and, eq, sql as drizzleSql } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import { db } from '../db/client.js';
import { customers, importBatches, importedOrders, orderItems, orders } from '../db/schema.js';
import { requirePlan } from '../middleware/requirePlan.js';
import { requireRoles } from '../plugins/auth.js';
import { parseSpreadsheet, type ParsedOrder } from '../services/spreadsheetParser.js';
import { writeAuditLog } from '../utils/audit.js';

type MultipartRequest = FastifyRequest & { file: () => Promise<MultipartFile | undefined> };

const allowedExtensions = new Set(['xlsx', 'csv', 'xls']);
const money = (value: number) => value.toFixed(2);
const asDateOnly = (date: Date) => date.toISOString().slice(0, 10);

const readUpload = async (request: FastifyRequest) => {
  const data = await (request as MultipartRequest).file();
  if (!data) throw new Error('Selecione uma planilha para importar.');

  const ext = data.filename.split('.').pop()?.toLowerCase();
  if (!ext || !allowedExtensions.has(ext)) {
    throw new Error('Use uma planilha .xlsx ou .csv.');
  }

  return { data, buffer: await data.toBuffer() };
};

const normalizedStatus = (status: string | null): 'received' | 'preparing' | 'delivered' | 'cancelled' => {
  const value = (status || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (value.includes('cancel')) return 'cancelled';
  if (value.includes('entreg') || value.includes('conclu') || value.includes('finaliz')) return 'delivered';
  if (value.includes('prepar')) return 'preparing';
  return 'received';
};

const previewResponse = (result: Awaited<ReturnType<typeof parseSpreadsheet>>) => ({
  totalRows: result.valid.length + result.invalid.length + result.duplicates.length,
  validRows: result.valid.length,
  invalidRows: result.invalid.length,
  duplicateRows: result.duplicates.length,
  estimatedTotal: result.valid.reduce((sum, order) => sum + order.totalPrice, 0),
  errors: result.invalid.slice(0, 50).map((item) => ({ row: item.row, reason: item.reason })),
  preview: result.valid.slice(0, 10).map((order) => ({
    customer_name: order.customerName,
    customer_phone: order.customerPhone,
    ordered_at: order.orderedAt.toISOString(),
    product: order.product,
    quantity: order.quantity,
    total_price: order.totalPrice,
  })),
});

const importOneOrder = async (restaurantId: string, batchId: string, order: ParsedOrder) =>
  db.transaction(async (tx) => {
    const [alreadyImported] = await tx
      .select({ id: importedOrders.id })
      .from(importedOrders)
      .where(and(eq(importedOrders.restaurantId, restaurantId), eq(importedOrders.rowHash, order.rowHash)))
      .limit(1);

    if (alreadyImported) return { imported: false as const, customerCreated: false, customerUpdated: false };

    let customer =
      (
        await tx
          .select()
          .from(customers)
          .where(and(eq(customers.restaurantId, restaurantId), eq(customers.phone, order.customerPhone), eq(customers.isDeleted, false)))
          .limit(1)
      )[0] ?? null;
    let customerCreated = false;
    let customerUpdated = false;

    if (!customer) {
      [customer] = await tx
        .insert(customers)
        .values({
          restaurantId,
          name: order.customerName,
          phone: order.customerPhone,
          lastVisit: asDateOnly(order.orderedAt),
          totalSpent: money(order.totalPrice),
          ordersCount: 1,
          loyaltyScore: order.totalPrice >= 150 ? 70 : 45,
          status: 'active',
          origin: 'delivery',
        })
        .returning();
      customerCreated = true;
    } else {
      customerUpdated = customer.name !== order.customerName;
      const nextOrdersCount = customer.ordersCount + 1;
      await tx
        .update(customers)
        .set({
          name: customerUpdated ? order.customerName : customer.name,
          lastVisit: asDateOnly(order.orderedAt),
          totalSpent: drizzleSql`${customers.totalSpent} + ${money(order.totalPrice)}`,
          ordersCount: drizzleSql`${customers.ordersCount} + 1`,
          loyaltyScore: Math.min(100, Math.max(customer.loyaltyScore, nextOrdersCount >= 10 ? 80 : 55)),
          status: nextOrdersCount >= 10 ? 'vip' : 'active',
          updatedAt: new Date(),
        })
        .where(and(eq(customers.id, customer.id), eq(customers.restaurantId, restaurantId)));
    }

    const [createdOrder] = await tx
      .insert(orders)
      .values({
        restaurantId,
        customerId: customer.id,
        customerName: order.customerName,
        totalAmount: money(order.totalPrice),
        orderDate: order.orderedAt,
        channel: 'delivery',
        status: normalizedStatus(order.status),
        paymentMethod: order.paymentMethod || 'nao informado',
        paymentStatus: normalizedStatus(order.status) === 'cancelled' ? 'unknown' : 'paid',
        notes: order.notes,
      })
      .returning();

    await tx.insert(orderItems).values({
      restaurantId,
      orderId: createdOrder.id,
      name: order.product,
      quantity: order.quantity,
      price: money(order.unitPrice),
      category: order.category || 'Importado',
    });

    await tx.insert(importedOrders).values({
      restaurantId,
      customerId: customer.id,
      orderId: createdOrder.id,
      importBatchId: batchId,
      rowHash: order.rowHash,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      orderedAt: order.orderedAt,
      product: order.product,
      category: order.category,
      quantity: order.quantity,
      unitPrice: money(order.unitPrice),
      totalPrice: money(order.totalPrice),
      paymentMethod: order.paymentMethod,
      status: order.status,
      notes: order.notes,
    });

    return { imported: true as const, customerCreated, customerUpdated };
  });

export const importRoutes = async (app: FastifyInstance) => {
  app.post(
    '/import/preview',
    { preHandler: [app.authenticate, requireRoles('owner', 'admin', 'manager'), requirePlan('plus')], config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      try {
        const { data, buffer } = await readUpload(request);
        const result = await parseSpreadsheet(buffer, data.filename);
        return reply.send(previewResponse(result));
      } catch (error) {
        return reply.code(400).send({ error: error instanceof Error ? error.message : 'Nao foi possivel ler a planilha.' });
      }
    },
  );

  app.post(
    '/import/orders',
    { preHandler: [app.authenticate, requireRoles('owner', 'admin', 'manager'), requirePlan('plus')], config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const auth = request.auth!;
      try {
        const { data, buffer } = await readUpload(request);
        const parsed = await parseSpreadsheet(buffer, data.filename);
        const [batch] = await db
          .insert(importBatches)
          .values({
            restaurantId: auth.restaurantId,
            fileName: data.filename,
            totalRows: parsed.valid.length + parsed.invalid.length + parsed.duplicates.length,
            validRows: parsed.valid.length,
            duplicateRows: parsed.duplicates.length,
            invalidRows: parsed.invalid.length,
            status: 'processing',
          })
          .returning();

        let imported = 0;
        let skippedExisting = 0;
        let customersCreated = 0;
        let customersUpdated = 0;
        const importErrors: Array<{ product: string; reason: string }> = [];

        for (const order of parsed.valid) {
          try {
            const result = await importOneOrder(auth.restaurantId, batch.id, order);
            if (result.imported) imported += 1;
            else skippedExisting += 1;
            if (result.customerCreated) customersCreated += 1;
            if (result.customerUpdated) customersUpdated += 1;
          } catch (error) {
            importErrors.push({
              product: order.product,
              reason: error instanceof Error ? error.message : 'Erro ao importar esta linha.',
            });
          }
        }

        await db
          .update(importBatches)
          .set({
            importedRows: imported,
            customersCreated,
            customersUpdated,
            duplicateRows: parsed.duplicates.length + skippedExisting,
            status: 'done',
            finishedAt: new Date(),
          })
          .where(eq(importBatches.id, batch.id));

        writeAuditLog({
          request,
          restaurantId: auth.restaurantId,
          userId: auth.userId,
          action: 'orders_imported',
          resourceType: 'import_batch',
          resourceId: batch.id,
          newData: { imported, skippedExisting, invalidRows: parsed.invalid.length },
        }).catch((error) => request.log.error({ error }, 'orders import audit failed'));

        return reply.send({
          success: true,
          batch_id: batch.id,
          imported,
          customersCreated,
          customersUpdated,
          duplicatesSkipped: parsed.duplicates.length + skippedExisting,
          invalidRows: parsed.invalid.length,
          errors: importErrors.length,
          errorDetails: importErrors.slice(0, 20),
        });
      } catch (error) {
        return reply.code(400).send({ error: error instanceof Error ? error.message : 'Nao foi possivel importar a planilha.' });
      }
    },
  );

  app.get(
    '/import/template',
    { preHandler: [app.authenticate, requireRoles('owner', 'admin', 'manager'), requirePlan('plus')] },
    async (_request, reply) => {
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
      sheet.addRow(['Joao Silva', '11999998888', '01/06/2026', 'Pizza Calabresa', 'Pizzas', 1, 45, 45, 'Pix', 'entregue', '']);
      sheet.columns.forEach((column) => {
        column.width = 22;
      });
      const buffer = await workbook.xlsx.writeBuffer();
      return reply
        .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .header('Content-Disposition', 'attachment; filename="modelo-pedidos-siou.xlsx"')
        .send(Buffer.from(buffer));
    },
  );
};
