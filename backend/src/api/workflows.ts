import { FastifyInstance } from 'fastify';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { enqueueWorkflow } from '../queue/index.js';
import { v4 as uuid } from 'uuid';

// ─── Validation Schemas ─────────────────────────────────
const CreateWorkflowSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  graph: z.object({
    nodes: z.array(z.any()),
    edges: z.array(z.any()),
  }),
});

const RunWorkflowSchema = z.object({
  input: z.record(z.unknown()).optional(),
});

export function registerWorkflowRoutes(app: FastifyInstance) {
  const tenantId = (req: any) => req.headers['x-tenant-id'] as string;

  // ─── List Workflows ────────────────────────────────
  app.get('/api/workflows', async (req, reply) => {
    const workflows = await db
      .select()
      .from(schema.workflows)
      .where(eq(schema.workflows.tenantId, tenantId(req)))
      .orderBy(schema.workflows.createdAt);
    return workflows;
  });

  // ─── Get Single Workflow ───────────────────────────
  app.get<{ Params: { id: string } }>('/api/workflows/:id', async (req, reply) => {
    const [workflow] = await db
      .select()
      .from(schema.workflows)
      .where(and(eq(schema.workflows.id, req.params.id), eq(schema.workflows.tenantId, tenantId(req))));
    if (!workflow) return reply.status(404).send({ error: 'Workflow not found' });
    return workflow;
  });

  // ─── Create Workflow ───────────────────────────────
  app.post('/api/workflows', async (req, reply) => {
    const body = CreateWorkflowSchema.parse(req.body);
    const [workflow] = await db
      .insert(schema.workflows)
      .values({
        tenantId: tenantId(req),
        name: body.name,
        description: body.description,
        graph: body.graph as any,
      })
      .returning();
    return reply.status(201).send(workflow);
  });

  // ─── Update Workflow Graph ─────────────────────────
  app.put<{ Params: { id: string } }>('/api/workflows/:id', async (req, reply) => {
    const body = CreateWorkflowSchema.partial().parse(req.body);
    const [workflow] = await db
      .update(schema.workflows)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(schema.workflows.id, req.params.id), eq(schema.workflows.tenantId, tenantId(req))))
      .returning();
    if (!workflow) return reply.status(404).send({ error: 'Workflow not found' });
    return workflow;
  });

  // ─── Delete Workflow ───────────────────────────────
  app.delete<{ Params: { id: string } }>('/api/workflows/:id', async (req, reply) => {
    const [workflow] = await db
      .delete(schema.workflows)
      .where(and(eq(schema.workflows.id, req.params.id), eq(schema.workflows.tenantId, tenantId(req))))
      .returning();
    if (!workflow) return reply.status(404).send({ error: 'Workflow not found' });
    return reply.status(204).send();
  });

  // ─── Run Workflow ──────────────────────────────────
  app.post<{ Params: { id: string } }>('/api/workflows/:id/run', async (req, reply) => {
    const [workflow] = await db
      .select()
      .from(schema.workflows)
      .where(and(eq(schema.workflows.id, req.params.id), eq(schema.workflows.tenantId, tenantId(req))));
    if (!workflow) return reply.status(404).send({ error: 'Workflow not found' });

    const body = req.body ? RunWorkflowSchema.parse(req.body) : {};

    // Create a run record
    const runId = uuid();
    const [run] = await db
      .insert(schema.workflowRuns)
      .values({
        id: runId,
        workflowId: workflow.id,
        tenantId: workflow.tenantId,
        status: 'pending',
        trigger: 'manual',
        input: body.input || {},
      })
      .returning();

    // Enqueue the workflow execution
    await enqueueWorkflow({
      runId,
      workflowId: workflow.id,
      tenantId: workflow.tenantId,
      graph: workflow.graph as any,
      input: body.input || {},
    });

    return reply.status(202).send(run);
  });

  // ─── List Runs for a Workflow ──────────────────────
  app.get<{ Params: { id: string } }>('/api/workflows/:id/runs', async (req, reply) => {
    const runs = await db
      .select()
      .from(schema.workflowRuns)
      .where(eq(schema.workflowRuns.workflowId, req.params.id))
      .orderBy(schema.workflowRuns.createdAt)
      .limit(50);
    return runs;
  });

  // ─── Get Run Details with Steps ────────────────────
  app.get<{ Params: { id: string } }>('/api/runs/:id', async (req, reply) => {
    const [run] = await db
      .select()
      .from(schema.workflowRuns)
      .where(eq(schema.workflowRuns.id, req.params.id));
    if (!run) return reply.status(404).send({ error: 'Run not found' });

    const steps = await db
      .select()
      .from(schema.stepExecutions)
      .where(eq(schema.stepExecutions.runId, req.params.id))
      .orderBy(schema.stepExecutions.startedAt);

    return { ...run, steps };
  });
}

// ─── Helper ─────────────────────────────────────────────
function and(...conditions: any[]) {
  return conditions.filter(Boolean).reduce((acc, c) => acc ? acc.and(c) : c, null as any);
}