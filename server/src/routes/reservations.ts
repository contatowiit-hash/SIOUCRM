import type { FastifyInstance } from 'fastify';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { customers, reservations } from '../db/schema.js';
import { CreateReservationSchema, UpdateReservationStatusSchema } from '../schemas.js';
import { requireRoles } from '../plugins/auth.js';
import { toReservationDto } from '../utils/format.js';
import { sanitizePhone, sanitizeText } from '../utils/security.js';
import { writeAuditLog } from '../utils/audit.js';

export const reservationRoutes = async (app: FastifyInstance) => {
  app.get('/reservations', { preHandler: [app.authenticate, requireRoles('owner', 'admin', 'manager')] }, async (request) => {
    const query = request.query as { date?: string };
    const auth = request.auth!;
    const filters = [eq(reservations.restaurantId, auth.restaurantId), eq(reservations.isDeleted, false)];
    if (query.date) filters.push(eq(reservations.reservationDate, query.date));
    const rows = await db.select().from(reservations).where(and(...filters)).orderBy(asc(reservations.reservationDate));
    return { data: rows.map(toReservationDto) };
  });

  app.post('/reservations', { preHandler: [app.authenticate, requireRoles('owner', 'admin', 'manager')] }, async (request, reply) => {
    const parsed = CreateReservationSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Dados inválidos' });
    const auth = request.auth!;
    const input = parsed.data;

    if (input.customer_id) {
      const [customer] = await db
        .select({ id: customers.id })
        .from(customers)
        .where(and(eq(customers.id, input.customer_id), eq(customers.restaurantId, auth.restaurantId), eq(customers.isDeleted, false)))
        .limit(1);

      if (!customer) return reply.code(404).send({ error: 'Cliente não encontrado' });
    }

    const [created] = await db
      .insert(reservations)
      .values({
        restaurantId: auth.restaurantId,
        customerId: input.customer_id || null,
        customerName: sanitizeText(input.customer_name, 100),
        phone: sanitizePhone(input.phone),
        reservationDate: input.reservation_date,
        reservationTime: input.reservation_time,
        partySize: input.party_size,
        tableLabel: input.table_label ? sanitizeText(input.table_label, 30) : null,
        notes: input.notes ? sanitizeText(input.notes, 1000) : null,
      })
      .returning();

    await writeAuditLog({
      request,
      restaurantId: auth.restaurantId,
      userId: auth.userId,
      action: 'reservation_created',
      resourceType: 'reservation',
      resourceId: created.id,
      newData: { customer: created.customerName, date: created.reservationDate, time: created.reservationTime },
    });

    return reply.code(201).send({ data: toReservationDto(created) });
  });

  app.patch('/reservations/:id/status', { preHandler: [app.authenticate, requireRoles('owner', 'admin', 'manager')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = UpdateReservationStatusSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Dados inválidos' });

    const auth = request.auth!;
    const [updated] = await db
      .update(reservations)
      .set({ status: parsed.data.status, updatedAt: new Date() })
      .where(and(eq(reservations.id, id), eq(reservations.restaurantId, auth.restaurantId), eq(reservations.isDeleted, false)))
      .returning();

    if (!updated) return reply.code(404).send({ error: 'Não encontrado' });

    writeAuditLog({
      request,
      restaurantId: auth.restaurantId,
      userId: auth.userId,
      action: 'reservation_status_updated',
      resourceType: 'reservation',
      resourceId: updated.id,
      newData: { status: updated.status },
    }).catch((error) => request.log.error({ error }, 'reservation audit log failed'));

    return { data: toReservationDto(updated) };
  });
};
