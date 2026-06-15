import { db } from '../db/client.js';
import { transactions } from '../db/schema.js';
import type { NormalizedTransaction } from '../integrations/shared/types.js';

export const upsertNormalizedTransaction = async (input: NormalizedTransaction) => {
  const [transaction] = await db
    .insert(transactions)
    .values({
      restaurantId: input.restaurantId,
      orderId: input.orderId ?? null,
      externalSaleId: input.externalSaleId,
      totalAmount: input.totalAmount.toFixed(2),
      source: input.source,
      paymentStatus: input.paymentStatus,
      paymentMethod: input.paymentMethod,
      pixChargeId: input.pixChargeId ?? null,
      items: input.items ?? null,
      occurredAt: new Date(input.createdAt),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [transactions.restaurantId, transactions.source, transactions.externalSaleId],
      set: {
        orderId: input.orderId ?? null,
        totalAmount: input.totalAmount.toFixed(2),
        paymentStatus: input.paymentStatus,
        paymentMethod: input.paymentMethod,
        pixChargeId: input.pixChargeId ?? null,
        items: input.items ?? null,
        occurredAt: new Date(input.createdAt),
        updatedAt: new Date(),
      },
    })
    .returning({ id: transactions.id });
  return transaction;
};
