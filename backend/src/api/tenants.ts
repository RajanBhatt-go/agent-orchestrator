import { FastifyInstance } from 'fastify';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import crypto from 'crypto';

const CreateTenantSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
});

export function registerTenantRoutes(app: FastifyInstance) {
  // ─── Create Tenant ─────────────────────────────────
  app.post('/api/tenants', async (req, reply) => {
    const body = CreateTenantSchema.parse(req.body);
    const apiKey = `aor_${crypto.randomBytes(24).toString('hex')}`;

    const [tenant] = await db
      .insert(schema.tenants)
      .values({
        name: body.name,
        slug: body.slug,
        apiKey,
      })
      .returning();

    return reply.status(201).send(tenant);
  });

  // ─── List Tenants ──────────────────────────────────
  app.get('/api/tenants', async () => {
    return db.select().from(schema.tenants).orderBy(schema.tenants.createdAt);
  });

  // ─── Get Tenant by API Key (for auth) ──────────────
  app.get('/api/tenants/verify', async (req, reply) => {
    const apiKey = req.headers['x-api-key'] as string;
    if (!apiKey) return reply.status(401).send({ error: 'API key required' });

    const [tenant] = await db
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.apiKey, apiKey));

    if (!tenant) return reply.status(401).send({ error: 'Invalid API key' });
    return tenant;
  });
}