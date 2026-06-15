import type { FastifyInstance } from 'fastify';
import { and, desc, eq, ilike } from 'drizzle-orm';
import { db } from '../db/client.js';
import { customers } from '../db/schema.js';
import { CreateCustomerSchema } from '../schemas.js';
import { requireRoles } from '../plugins/auth.js';
import { toBasicCustomerDto, toCustomerDto } from '../utils/format.js';
import { sanitizePhone, sanitizeText } from '../utils/security.js';
import { writeAuditLog } from '../utils/audit.js';
import { paginationMeta, parsePagination, type PaginationQuery } from '../utils/pagination.js';


export const customerRoutes = async (app: FastifyInstance) => {
  app.get('/customers', { preHandler: [app.authenticate, requireRoles('owner', 'admin', 'manager', 'agent')] }, async (request, reply) => {
    const query = request.query as { search?: string; status?: string } & PaginationQuery;
    const auth = request.auth!;
    const { page, pageSize, offset } = parsePagination(query);
    const filters = [eq(customers.restaurantId, auth.restaurantId), eq(customers.isDeleted, false)];

    if (query.status && query.status !== 'all') {
      filters.push(eq(customers.status, query.status as typeof customers.status.enumValues[number]));
    }

    if (query.search) {
      filters.push(ilike(customers.name, `%${sanitizeText(query.search, 80)}%`));
    }

    try {
      const rows = await db
        .select()
        .from(customers)
        .where(and(...filters))
        .orderBy(desc(customers.createdAt))
        .limit(pageSize)
        .offset(offset);
      const formatCustomer = auth.role === 'agent' ? toBasicCustomerDto : toCustomerDto;
      return { data: rows.map(formatCustomer), pagination: paginationMeta(page, pageSize, rows.length) };
    } catch (error) {
      request.log.error({ error }, 'customers list failed');
      return reply.code(400).send({
        error: 'Não foi possível carregar clientes agora.',

      });
    }
  });

  app.get('/customers/:id', { preHandler: [app.authenticate, requireRoles('owner', 'admin', 'manager', 'agent')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const auth = request.auth!;
    const [customer] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.id, id), eq(customers.restaurantId, auth.restaurantId), eq(customers.isDeleted, false)))
      .limit(1);

    if (!customer) return reply.code(404).send({ error: 'Não encontrado' });
    return { data: auth.role === 'agent' ? toBasicCustomerDto(customer) : toCustomerDto(customer) };
  });

  app.post('/customers', { preHandler: [app.authenticate, requireRoles('owner', 'admin', 'manager')] }, async (request, reply) => {
    const parsed = CreateCustomerSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Dados inválidos' });

    try {
      const auth = request.auth!;
      const input = parsed.data;
      const cleanPhone = sanitizePhone(input.phone);

      const [existingPhone] = await db
        .select({ id: customers.id })
        .from(customers)
        .where(and(eq(customers.restaurantId, auth.restaurantId), eq(customers.phone, cleanPhone), eq(customers.isDeleted, false)))
        .limit(1);

      if (existingPhone) {
        return reply.code(409).send({ error: 'Ja existe um cliente com este telefone.' });
      }

      const [created] = await db
        .insert(customers)
        .values({
          restaurantId: auth.restaurantId,
          name: sanitizeText(input.name, 100),
          phone: cleanPhone,
          email: input.email || null,
          birthDate: input.birth_date || null,
          gender: input.gender || null,
          tags: input.tags,
          preferences: input.preferences ? sanitizeText(input.preferences, 1000) : null,
          notes: input.notes ? sanitizeText(input.notes, 1000) : null,
          status: input.status,
          origin: input.origin,
          loyaltyScore: input.status === 'vip' ? 82 : 45,
        })
        .returning();

      writeAuditLog({
        request,
        restaurantId: auth.restaurantId,
        userId: auth.userId,
        action: 'customer_created',
        resourceType: 'customer',
        resourceId: created.id,
        newData: { name: created.name, phone: created.phone },
      }).catch((error) => request.log.error({ error }, 'customer audit log failed'));

      return reply.code(201).send({ data: toCustomerDto(created) });
    } catch (error) {
      request.log.error({ error }, 'customer create failed');
      return reply.code(400).send({
        error: 'Não foi possível salvar o cliente. Revise os dados e tente novamente.',

      });
    }
  });

  app.patch('/customers/:id', { preHandler: [app.authenticate, requireRoles('owner', 'admin', 'manager')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = CreateCustomerSchema.partial().safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Dados inválidos' });

    const auth = request.auth!;
    const [existing] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.id, id), eq(customers.restaurantId, auth.restaurantId), eq(customers.isDeleted, false)))
      .limit(1);
    if (!existing) return reply.code(404).send({ error: 'Não encontrado' });

    const input = parsed.data;
    const [updated] = await db
      .update(customers)
      .set({
        name: input.name ? sanitizeText(input.name, 100) : undefined,
        phone: input.phone ? sanitizePhone(input.phone) : undefined,
        email: input.email ?? undefined,
        birthDate: input.birth_date ?? undefined,
        gender: input.gender ?? undefined,
        tags: input.tags ?? undefined,
        preferences: input.preferences ? sanitizeText(input.preferences, 1000) : undefined,
        notes: input.notes ? sanitizeText(input.notes, 1000) : undefined,
        status: input.status,
        origin: input.origin,
        updatedAt: new Date(),
      })
      .where(and(eq(customers.id, id), eq(customers.restaurantId, auth.restaurantId)))
      .returning();

    writeAuditLog({
      request,
      restaurantId: auth.restaurantId,
      userId: auth.userId,
      action: 'customer_updated',
      resourceType: 'customer',
      resourceId: updated.id,
      oldData: { name: existing.name, phone: existing.phone },
      newData: { name: updated.name, phone: updated.phone },
    }).catch((error) => request.log.error({ error }, 'customer audit log failed'));

    return { data: toCustomerDto(updated) };
  });

  app.delete('/customers/:id', { preHandler: [app.authenticate, requireRoles('owner', 'admin', 'manager')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const auth = request.auth!;
    const [deleted] = await db
      .update(customers)
      .set({ isDeleted: true, deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(customers.id, id), eq(customers.restaurantId, auth.restaurantId), eq(customers.isDeleted, false)))
      .returning();

    if (!deleted) return reply.code(404).send({ error: 'Não encontrado' });

    writeAuditLog({
      request,
      restaurantId: auth.restaurantId,
      userId: auth.userId,
      action: 'customer_deleted',
      resourceType: 'customer',
      resourceId: deleted.id,
      oldData: { name: deleted.name, phone: deleted.phone },
    }).catch((error) => request.log.error({ error }, 'customer audit log failed'));

    return { success: true };
  });
};
