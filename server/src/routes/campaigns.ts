import type { FastifyInstance } from 'fastify';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { campaigns } from '../db/schema.js';
import { CreateCampaignSchema } from '../schemas.js';
import { requireRoles } from '../plugins/auth.js';
import { toCampaignDto } from '../utils/format.js';
import { sanitizeText } from '../utils/security.js';
import { writeAuditLog } from '../utils/audit.js';

export const campaignRoutes = async (app: FastifyInstance) => {
  app.get('/campaigns', { preHandler: [app.authenticate, requireRoles('owner', 'admin', 'manager')] }, async (request) => {
    const auth = request.auth!;
    const rows = await db
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.restaurantId, auth.restaurantId), eq(campaigns.isDeleted, false)))
      .orderBy(desc(campaigns.createdAt))
      .limit(500);
    return { data: rows.map(toCampaignDto) };
  });

  app.post('/campaigns', { preHandler: [app.authenticate, requireRoles('owner', 'admin', 'manager')] }, async (request, reply) => {
    const parsed = CreateCampaignSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Dados inválidos' });
    const auth = request.auth!;
    const input = parsed.data;
    const [created] = await db
      .insert(campaigns)
      .values({
        restaurantId: auth.restaurantId,
        name: sanitizeText(input.name, 120),
        type: input.type,
        audience: sanitizeText(input.audience, 160),
        message: sanitizeText(input.message, 4096),
        channel: input.channel,
        scheduledAt: input.scheduled_at ? new Date(input.scheduled_at) : null,
        status: input.scheduled_at ? 'scheduled' : 'draft',
      })
      .returning();

    await writeAuditLog({
      request,
      restaurantId: auth.restaurantId,
      userId: auth.userId,
      action: 'campaign_created',
      resourceType: 'campaign',
      resourceId: created.id,
      newData: { name: created.name, audience: created.audience },
    });

    return reply.code(201).send({ data: toCampaignDto(created) });
  });
};
