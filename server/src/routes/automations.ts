import type { FastifyInstance } from 'fastify';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { automations } from '../db/schema.js';
import { requirePlan } from '../middleware/requirePlan.js';
import { requireRoles } from '../plugins/auth.js';
import { CreateAutomationSchema, UpdateAutomationSchema, UpdateAutomationStatusSchema } from '../schemas.js';
import { toAutomationDto } from '../utils/format.js';
import { sanitizeText } from '../utils/security.js';
import { writeAuditLog } from '../utils/audit.js';

export const automationRoutes = async (app: FastifyInstance) => {
  app.get('/automations', { preHandler: [app.authenticate, requireRoles('owner', 'admin'), requirePlan('pro')] }, async (request) => {
    const auth = request.auth!;
    const rows = await db
      .select()
      .from(automations)
      .where(and(eq(automations.restaurantId, auth.restaurantId), eq(automations.isDeleted, false)))
      .orderBy(desc(automations.createdAt))
      .limit(200);

    return { data: rows.map(toAutomationDto) };
  });

  app.post('/automations', { preHandler: [app.authenticate, requireRoles('owner', 'admin'), requirePlan('pro')] }, async (request, reply) => {
    const parsed = CreateAutomationSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Dados inválidos' });

    const auth = request.auth!;
    const input = parsed.data;
    const [created] = await db
      .insert(automations)
      .values({
        restaurantId: auth.restaurantId,
        name: sanitizeText(input.name, 120),
        triggerType: sanitizeText(input.trigger_type, 120),
        config: {
          channel: sanitizeText(input.channel, 60),
          audience: input.audience ? sanitizeText(input.audience, 160) : null,
          action: input.action ? sanitizeText(input.action, 220) : null,
          impact: input.impact ? sanitizeText(input.impact, 160) : 'Configurada com dados reais',
          message: input.message ? sanitizeText(input.message, 4096) : null,
        },
        status: input.status,
      })
      .returning();

    writeAuditLog({
      request,
      restaurantId: auth.restaurantId,
      userId: auth.userId,
      action: 'automation_created',
      resourceType: 'automation',
      resourceId: created.id,
      newData: { name: created.name, trigger: created.triggerType },
    }).catch((error) => request.log.error({ error }, 'automation audit log failed'));

    return reply.code(201).send({ data: toAutomationDto(created) });
  });

  app.patch('/automations/:id', { preHandler: [app.authenticate, requireRoles('owner', 'admin'), requirePlan('pro')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = UpdateAutomationSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Dados inválidos' });

    const auth = request.auth!;
    const [current] = await db
      .select()
      .from(automations)
      .where(and(eq(automations.id, id), eq(automations.restaurantId, auth.restaurantId), eq(automations.isDeleted, false)))
      .limit(1);

    if (!current) return reply.code(404).send({ error: 'Não encontrado' });

    const input = parsed.data;
    const currentConfig = (current.config || {}) as Record<string, unknown>;
    const nextConfig = { ...currentConfig };
    if (input.channel !== undefined) nextConfig.channel = sanitizeText(input.channel, 60);
    if (input.audience !== undefined) nextConfig.audience = input.audience ? sanitizeText(input.audience, 160) : null;
    if (input.action !== undefined) nextConfig.action = input.action ? sanitizeText(input.action, 220) : null;
    if (input.impact !== undefined) nextConfig.impact = input.impact ? sanitizeText(input.impact, 160) : null;
    if (input.message !== undefined) nextConfig.message = input.message ? sanitizeText(input.message, 4096) : null;

    const [updated] = await db
      .update(automations)
      .set({
        name: input.name !== undefined ? sanitizeText(input.name, 120) : current.name,
        triggerType: input.trigger_type !== undefined ? sanitizeText(input.trigger_type, 120) : current.triggerType,
        config: nextConfig,
        status: input.status ?? current.status,
        updatedAt: new Date(),
      })
      .where(and(eq(automations.id, id), eq(automations.restaurantId, auth.restaurantId), eq(automations.isDeleted, false)))
      .returning();

    writeAuditLog({
      request,
      restaurantId: auth.restaurantId,
      userId: auth.userId,
      action: 'automation_updated',
      resourceType: 'automation',
      resourceId: updated.id,
      newData: { name: updated.name, trigger: updated.triggerType, status: updated.status },
    }).catch((error) => request.log.error({ error }, 'automation audit log failed'));

    return { data: toAutomationDto(updated) };
  });

  app.patch('/automations/:id/status', { preHandler: [app.authenticate, requireRoles('owner', 'admin'), requirePlan('pro')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = UpdateAutomationStatusSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Dados inválidos' });

    const auth = request.auth!;
    const [updated] = await db
      .update(automations)
      .set({ status: parsed.data.status, updatedAt: new Date() })
      .where(and(eq(automations.id, id), eq(automations.restaurantId, auth.restaurantId), eq(automations.isDeleted, false)))
      .returning();

    if (!updated) return reply.code(404).send({ error: 'Não encontrado' });

    writeAuditLog({
      request,
      restaurantId: auth.restaurantId,
      userId: auth.userId,
      action: 'automation_status_updated',
      resourceType: 'automation',
      resourceId: updated.id,
      newData: { status: updated.status },
    }).catch((error) => request.log.error({ error }, 'automation audit log failed'));

    return { data: toAutomationDto(updated) };
  });
};
