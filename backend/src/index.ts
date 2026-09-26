import Fastify from 'fastify';
import cors from '@fastify/cors';
import { createServer } from 'http';
import { db, schema } from './db/index.js';
import { eq } from 'drizzle-orm';
import { registerWorkflowRoutes } from './api/workflows.js';
import { registerTenantRoutes } from './api/tenants.js';
import { setupWebSocket } from './ws/index.js';
import { createWorker } from './queue/index.js';

const PORT = parseInt(process.env.PORT || '3001');
const HOST = process.env.HOST || '0.0.0.0';

async function main() {
  // ─── HTTP Server ─────────────────────────────────
  const app = Fastify({ logger: true, bodyLimit: 10 * 1024 * 1024 });
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173'],
    credentials: true,
  });

  // ─── Tenant Auth Middleware ───────────────────────
  // In production, replace with JWT or session-based auth
  app.addHook('onRequest', async (request, reply) => {
    // Public routes
    if (request.url.startsWith('/api/tenants')) return;

    // Health check
    if (request.url === '/health') return;

    // Require tenant ID header
    const tenantId = request.headers['x-tenant-id'] as string;
    if (!tenantId) {
      return reply.status(401).send({ error: 'x-tenant-id header required' });
    }

    // Verify tenant exists
    const [tenant] = await db
      .select({ id: schema.tenants.id })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId));

    if (!tenant) {
      return reply.status(401).send({ error: 'Invalid tenant' });
    }
  });

  // ─── Health Check ─────────────────────────────────
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // ─── Routes ───────────────────────────────────────
  registerTenantRoutes(app);
  registerWorkflowRoutes(app);

  // ─── Start HTTP Server ────────────────────────────
  const httpServer = createServer(app.server);

  // ─── WebSocket Server ─────────────────────────────
  setupWebSocket(httpServer);

  // ─── Start Worker (in-process for dev) ────────────
  if (process.env.START_WORKER !== 'false') {
    createWorker();
  }

  // ─── Listen ───────────────────────────────────────
  httpServer.listen(PORT, HOST, () => {
    console.log(`
╔═══════════════════════════════════════════════════╗
║  🤖 Agent Orchestrator Server                     ║
║  HTTP  → http://${HOST}:${PORT}                    ║
║  WS    → ws://${HOST}:${PORT}                      ║
║  Health→ http://${HOST}:${PORT}/health             ║
╚═══════════════════════════════════════════════════╝
    `);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});