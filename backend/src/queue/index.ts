import { Queue, Worker, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import { WorkflowExecutor, type ExecutionEvent } from '../agents/executor.js';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';

// ─── Redis Connection ───────────────────────────────────
const connection = new IORedis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
});

// ─── Workflow Queue ─────────────────────────────────────
export const workflowQueue = new Queue('workflow-executions', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { age: 86400 },  // Keep for 1 day
    removeOnFail: { age: 604800 },     // Keep for 7 days
  },
});

export const queueEvents = new QueueEvents('workflow-executions', { connection });

// ─── Job Data Types ─────────────────────────────────────
export interface WorkflowJobData {
  runId: string;
  workflowId: string;
  tenantId: string;
  graph: any;
  input: Record<string, any>;
}

// ─── Enqueue a Workflow Run ─────────────────────────────
export async function enqueueWorkflow(data: WorkflowJobData) {
  return workflowQueue.add('execute-workflow', data, {
    jobId: data.runId,
  });
}

// ─── Global Event Handlers ──────────────────────────────
// These are set up by the WS module to broadcast events
const globalEventHandlers: Map<string, (event: ExecutionEvent) => void> = new Map();

export function onWorkflowEvent(runId: string, handler: (event: ExecutionEvent) => void) {
  globalEventHandlers.set(runId, handler);
}

export function offWorkflowEvent(runId: string) {
  globalEventHandlers.delete(runId);
}

// ─── Worker ─────────────────────────────────────────────
export function createWorker() {
  const worker = new Worker<WorkflowJobData>(
    'workflow-executions',
    async (job) => {
      const { runId, workflowId, tenantId, graph, input } = job.data;

      console.log(`[Worker] Starting run ${runId} for workflow ${workflowId}`);

      const executor = new WorkflowExecutor({
        runId,
        workflowId,
        tenantId,
        graph,
        input,
        onEvent: (event) => {
          // Dispatch to the global event handler for this run
          const handler = globalEventHandlers.get(runId);
          if (handler) handler(event);
        },
      });

      return executor.execute();
    },
    { connection, concurrency: 5 }
  );

  worker.on('completed', (job) => {
    console.log(`[Worker] Run ${job.id} completed`);
    if (job.id) globalEventHandlers.delete(job.id);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Worker] Run ${job?.id} failed:`, err.message);
    if (job?.id) globalEventHandlers.delete(job.id);
  });

  console.log('[Worker] BullMQ worker started');
  return worker;
}

// ─── Start worker script directly ─────────────────────
// Run with: tsx src/queue/workers.ts
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  console.log('[Worker] Starting standalone worker...');
  const worker = createWorker();

  process.on('SIGTERM', async () => {
    console.log('[Worker] Shutting down...');
    await worker.close();
    await connection.quit();
    process.exit(0);
  });
}