import { z } from 'zod';
import { callLLM, LLMMessage } from '../llm.js';

// ─── Tool Definition ────────────────────────────────────
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

// ─── Available Tools ────────────────────────────────────
const tools: Map<string, ToolDefinition> = new Map();

// ─── Register a Tool ────────────────────────────────────
export function registerTool(tool: ToolDefinition) {
  tools.set(tool.name, tool);
}

// ─── Get Tool Definitions (for LLM function calling) ────
export function getToolDefinitions() {
  return Array.from(tools.values()).map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

// ─── Execute a Tool by Name ─────────────────────────────
export async function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  const tool = tools.get(name);
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }
  return tool.execute(args);
}

// ─── Built-in: HTTP Request ─────────────────────────────
registerTool({
  name: 'http_request',
  description: 'Make an HTTP request to any URL. Supports GET and POST.',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The URL to request' },
      method: { type: 'string', enum: ['GET', 'POST'], default: 'GET' },
      headers: {
        type: 'object',
        description: 'Optional HTTP headers',
        additionalProperties: { type: 'string' },
      },
      body: { type: 'string', description: 'Request body (for POST)' },
    },
    required: ['url'],
  },
  execute: async (args) => {
    const { url, method = 'GET', headers = {}, body } = args as any;
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return `Status: ${res.status}\nBody: ${text.slice(0, 10000)}`;
  },
});

// ─── Built-in: Web Scraper ──────────────────────────────
registerTool({
  name: 'web_scrape',
  description: 'Scrape the text content from a URL.',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The URL to scrape' },
    },
    required: ['url'],
  },
  execute: async (args) => {
    const { url } = args as any;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Agent-Orchestrator/1.0' },
    });
    const html = await res.text();
    // Strip HTML tags to get plain text
    const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return text.slice(0, 15000);
  },
});

// ─── Built-in: Code Execution (sandboxed) ───────────────
registerTool({
  name: 'execute_code',
  description: 'Execute JavaScript code in a sandboxed environment. Returns stdout.',
  parameters: {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'JavaScript code to execute' },
      context: {
        type: 'object',
        description: 'Variables to inject into the execution context',
        additionalProperties: { type: 'string' },
      },
    },
    required: ['code'],
  },
  execute: async (args) => {
    const { code, context = {} } = args as any;
    // Simple sandboxed execution using vm module
    const vm = await import('vm');
    const sandbox = { console: { log: (...args: any[]) => logs.push(args.join(' ')) }, ...context };
    const logs: string[] = [];
    const ctx = vm.createContext(sandbox);
    try {
      vm.runInContext(code, ctx, { timeout: 5000 });
      return logs.join('\n') || 'Code executed successfully (no output).';
    } catch (err: any) {
      return `Error: ${err.message}`;
    }
  },
});

// ─── Built-in: Database Query ───────────────────────────
registerTool({
  name: 'database_query',
  description: 'Execute a SQL query on the connected PostgreSQL database. SELECT only for safety.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'SQL SELECT query to execute' },
    },
    required: ['query'],
  },
  execute: async (args) => {
    const { query } = args as any;
    // Basic safety check - only allow SELECT
    const trimmed = query.trim().toUpperCase();
    if (!trimmed.startsWith('SELECT')) {
      return 'Error: Only SELECT queries are allowed for safety.';
    }
    // Import and use the db pool
    const { default: pg } = await import('pg');
    const { Pool } = pg;
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
    try {
      const result = await pool.query(query);
      const rows = result.rows.slice(0, 50);
      return JSON.stringify(rows, null, 2);
    } catch (err: any) {
      return `Query error: ${err.message}`;
    } finally {
      await pool.end();
    }
  },
});

// ─── Built-in: LLM Call (nested) ────────────────────────
registerTool({
  name: 'llm_call',
  description: 'Call another LLM model with a custom prompt. Useful for sub-tasks.',
  parameters: {
    type: 'object',
    properties: {
      model: {
        type: 'string',
        description: 'Model ID from OpenRouter (e.g., openai/gpt-4o-mini)',
        default: 'openai/gpt-4o-mini',
      },
      prompt: { type: 'string', description: 'The prompt to send' },
      systemPrompt: { type: 'string', description: 'Optional system prompt' },
    },
    required: ['prompt'],
  },
  execute: async (args) => {
    const { model = 'openai/gpt-4o-mini', prompt, systemPrompt } = args as any;
    const messages: LLMMessage[] = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: prompt });
    const result = await callLLM({
      model,
      messages,
      temperature: 0.7,
      maxTokens: 2048,
      stream: false,
    });
    return result.content || '[No response]';
  },
});

export { tools };