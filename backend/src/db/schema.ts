import { pgTable, text, jsonb, timestamp, uuid, boolean, integer } from 'drizzle-orm/pg-core';

// ─── Tenants ────────────────────────────────────────────
export const tenants = pgTable('tenants', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').unique().notNull(),
  apiKey: text('api_key').unique().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── Workflow Definitions ───────────────────────────────
export const workflows = pgTable('workflows', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  name: text('name').notNull(),
  description: text('description'),
  // The React Flow graph state (nodes + edges)
  graph: jsonb('graph').notNull().default({ nodes: [], edges: [] }),
  active: boolean('active').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── Workflow Runs (each execution) ─────────────────────
export const workflowRuns = pgTable('workflow_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  workflowId: uuid('workflow_id').references(() => workflows.id).notNull(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  status: text('status', { enum: ['pending', 'running', 'completed', 'failed'] }).default('pending').notNull(),
  trigger: text('trigger', { enum: ['manual', 'scheduled', 'webhook'] }).default('manual').notNull(),
  input: jsonb('input').default({}),
  output: jsonb('output'),
  error: text('error'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── Step Executions (individual node in a run) ─────────
export const stepExecutions = pgTable('step_executions', {
  id: uuid('id').defaultRandom().primaryKey(),
  runId: uuid('run_id').references(() => workflowRuns.id).notNull(),
  nodeId: text('node_id').notNull(),      // React Flow node ID
  nodeType: text('node_type').notNull(),  // llm_call, http_request, code_exec, etc.
  status: text('status', { enum: ['pending', 'running', 'completed', 'failed', 'skipped'] }).default('pending').notNull(),
  input: jsonb('input').default({}),
  output: jsonb('output'),
  error: text('error'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
});

// ─── Scheduled Triggers ─────────────────────────────────
export const scheduleTriggers = pgTable('schedule_triggers', {
  id: uuid('id').defaultRandom().primaryKey(),
  workflowId: uuid('workflow_id').references(() => workflows.id).notNull(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  cron: text('cron').notNull(),
  input: jsonb('input').default({}),
  active: boolean('active').default(true).notNull(),
  lastRunAt: timestamp('last_run_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});