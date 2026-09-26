import { db, schema } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import { callLLM, type LLMMessage, type ToolCall } from './llm.js';
import { getToolDefinitions, executeTool } from './tools/registry.js';

// ─── Event Bus for Real-Time Streaming ──────────────────
export type ExecutionEvent =
  | { type: 'step:start'; runId: string; nodeId: string; nodeType: string; input: any }
  | { type: 'step:complete'; runId: string; nodeId: string; output: any }
  | { type: 'step:error'; runId: string; nodeId: string; error: string }
  | { type: 'step:llm_chunk'; runId: string; nodeId: string; content: string }
  | { type: 'step:tool_call'; runId: string; nodeId: string; toolName: string; args: any }
  | { type: 'step:tool_result'; runId: string; nodeId: string; toolName: string; result: string }
  | { type: 'run:complete'; runId: string; output: any }
  | { type: 'run:error'; runId: string; error: string };

export type EventHandler = (event: ExecutionEvent) => void;

// ─── Graph Node Types ───────────────────────────────────
interface GraphNode {
  id: string;
  type: string;
  data: {
    label: string;
    config: Record<string, any>;
    [key: string]: any;
  };
  position: { x: number; y: number };
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

interface WorkflowGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ─── Execution Engine ───────────────────────────────────
export class WorkflowExecutor {
  private runId: string;
  private workflowId: string;
  private tenantId: string;
  private graph: WorkflowGraph;
  private input: Record<string, any>;
  private eventHandler?: EventHandler;
  private outputs: Map<string, any> = new Map();

  constructor(params: {
    runId: string;
    workflowId: string;
    tenantId: string;
    graph: WorkflowGraph;
    input: Record<string, any>;
    onEvent?: EventHandler;
  }) {
    this.runId = params.runId;
    this.workflowId = params.workflowId;
    this.tenantId = params.tenantId;
    this.graph = params.graph;
    this.input = params.input;
    this.eventHandler = params.onEvent;
  }

  private emit(event: ExecutionEvent) {
    this.eventHandler?.(event);
  }

  // ─── Main Execution ─────────────────────────────────
  async execute(): Promise<Record<string, any>> {
    await this.updateRunStatus('running');

    try {
      // Topological sort: find nodes with no incoming edges as starting points
      const inDegree = new Map<string, number>();
      const adjacency = new Map<string, string[]>();

      for (const node of this.graph.nodes) {
        inDegree.set(node.id, 0);
        adjacency.set(node.id, []);
      }
      for (const edge of this.graph.edges) {
        inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
        adjacency.get(edge.source)?.push(edge.target);
      }

      // BFS / Kahn's algorithm
      const queue = this.graph.nodes
        .filter((n) => (inDegree.get(n.id) || 0) === 0)
        .map((n) => n.id);

      while (queue.length > 0) {
        const nodeId = queue.shift()!;
        const node = this.graph.nodes.find((n) => n.id === nodeId);
        if (!node) continue;

        // Skip trigger nodes — they just pass input through
        if (node.type === 'trigger') {
          this.outputs.set(nodeId, this.input);
          this.processDependents(node, adjacency, inDegree, queue);
          continue;
        }

        // Execute this node
        const output = await this.executeNode(node);

        if (output?._error) {
          this.outputs.set(nodeId, output);
          await this.recordStep(nodeId, node.type, output, output._error);
          this.emit({ type: 'step:error', runId: this.runId, nodeId, error: output._error });
          // Propagate error? For now, mark and continue
          continue;
        }

        this.outputs.set(nodeId, output);
        await this.recordStep(nodeId, node.type, output);
        this.emit({ type: 'step:complete', runId: this.runId, nodeId, output });

        // Enqueue dependents
        this.processDependents(node, adjacency, inDegree, queue);
      }

      // Collect final output from terminal nodes (no outgoing edges)
      const terminalOutputs: Record<string, any> = {};
      const hasOutgoing = new Set(this.graph.edges.map((e) => e.source));
      for (const node of this.graph.nodes) {
        if (!hasOutgoing.has(node.id)) {
          terminalOutputs[node.id] = this.outputs.get(node.id);
        }
      }

      const finalOutput = Object.keys(terminalOutputs).length > 0 ? terminalOutputs : this.outputs.get(this.graph.nodes[0]?.id);

      await this.completeRun(finalOutput);
      this.emit({ type: 'run:complete', runId: this.runId, output: finalOutput });

      return finalOutput;
    } catch (err: any) {
      await this.failRun(err.message);
      this.emit({ type: 'run:error', runId: this.runId, error: err.message });
      throw err;
    }
  }

  private processDependents(
    node: GraphNode,
    adjacency: Map<string, string[]>,
    inDegree: Map<string, number>,
    queue: string[]
  ) {
    for (const dep of adjacency.get(node.id) || []) {
      const newDegree = (inDegree.get(dep) || 1) - 1;
      inDegree.set(dep, newDegree);
      if (newDegree === 0) {
        queue.push(dep);
      }
    }
  }

  // ─── Execute a Single Node ──────────────────────────
  private async executeNode(node: GraphNode): Promise<any> {
    const config = node.data.config || {};
    const inputs = this.gatherInputs(node);

    this.emit({
      type: 'step:start',
      runId: this.runId,
      nodeId: node.id,
      nodeType: node.type,
      input: inputs,
    });

    switch (node.type) {
      case 'llm_call':
        return this.executeLLMCall(inputs, config);
      case 'http_request':
        return this.executeHTTPRequest(inputs, config);
      case 'web_scrape':
        return this.executeWebScrape(inputs, config);
      case 'execute_code':
        return this.executeCode(inputs, config);
      case 'database_query':
        return this.executeDBQuery(inputs, config);
      case 'agent_loop':
        return this.executeAgentLoop(inputs, config);
      case 'condition':
        return this.executeCondition(inputs, config);
      case 'transform':
        return this.executeTransform(inputs, config);
      case 'trigger':
        return inputs; // pass through
      default:
        throw new Error(`Unknown node type: ${node.type}`);
    }
  }

  // ─── LLM Call Node ─────────────────────────────────
  private async executeLLMCall(
    inputs: Record<string, any>,
    config: Record<string, any>
  ): Promise<any> {
    const systemPrompt = config.systemPrompt || 'You are a helpful AI assistant.';
    const userPrompt = this.template(config.prompt || '{{input}}', { input: inputs.input || inputs, ...inputs });
    const model = config.model || 'openai/gpt-4o-mini';

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    // Include conversation history if provided
    if (config.includeHistory && inputs.messages) {
      messages.splice(1, 0, ...inputs.messages.slice(0, -1));
    }

    const tools = config.enableTools ? getToolDefinitions() : undefined;

    const result = await callLLM({
      model,
      messages,
      temperature: config.temperature ?? 0.7,
      maxTokens: config.maxTokens ?? 4096,
      tools: tools as any,
      stream: false,
    });

    // Handle tool calls if tools are enabled
    if (result.toolCalls.length > 0 && config.executeTools) {
      for (const tc of result.toolCalls) {
        this.emit({
          type: 'step:tool_call',
          runId: this.runId,
          nodeId: 'tool',
          toolName: tc.function.name,
          args: JSON.parse(tc.function.arguments),
        });

        try {
          const toolResult = await executeTool(
            tc.function.name,
            JSON.parse(tc.function.arguments)
          );

          this.emit({
            type: 'step:tool_result',
            runId: this.runId,
            nodeId: 'tool',
            toolName: tc.function.name,
            result: toolResult,
          });

          // Add the tool response and continue the conversation
          messages.push({
            role: 'assistant',
            content: result.content,
            tool_call_id: tc.id,
          } as any);
          messages.push({
            role: 'tool',
            content: toolResult,
            tool_call_id: tc.id,
          } as any);
        } catch (err: any) {
          messages.push({
            role: 'tool',
            content: `Error: ${err.message}`,
            tool_call_id: tc.id,
          } as any);
        }
      }

      // Get final response after tool calls
      const finalResult = await callLLM({
        model,
        messages,
        temperature: config.temperature ?? 0.7,
        maxTokens: config.maxTokens ?? 4096,
        stream: false,
      });

      return {
        content: finalResult.content,
        model: finalResult.model,
        usage: finalResult.usage,
        messages,
      };
    }

    return {
      content: result.content,
      model: result.model,
      usage: result.usage,
      messages,
    };
  }

  // ─── Agent Loop Node (multi-step reasoning) ─────────
  private async executeAgentLoop(
    inputs: Record<string, any>,
    config: Record<string, any>
  ): Promise<any> {
    const maxIterations = config.maxIterations || 5;
    const systemPrompt = config.systemPrompt || 'You are an AI agent with access to tools. Solve the task step by step.';
    const userPrompt = this.template(config.prompt || '{{input}}', { input: inputs.input || inputs, ...inputs });
    const model = config.model || 'openai/gpt-4o-mini';

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const tools = getToolDefinitions();

    for (let i = 0; i < maxIterations; i++) {
      const result = await callLLM({
        model,
        messages,
        temperature: 0.7,
        maxTokens: 4096,
        tools,
        stream: false,
      });

      if (result.toolCalls.length === 0) {
        // Agent finished reasoning
        messages.push({ role: 'assistant', content: result.content || '' });
        return {
          content: result.content,
          iterations: i + 1,
          model: result.model,
          messages,
        };
      }

      for (const tc of result.toolCalls) {
        this.emit({
          type: 'step:tool_call',
          runId: this.runId,
          nodeId: 'agent_loop',
          toolName: tc.function.name,
          args: JSON.parse(tc.function.arguments),
        });

        messages.push({
          role: 'assistant',
          content: result.content || '',
          tool_call_id: tc.id,
        } as any);

        try {
          const toolResult = await executeTool(
            tc.function.name,
            JSON.parse(tc.function.arguments)
          );

          this.emit({
            type: 'step:tool_result',
            runId: this.runId,
            nodeId: 'agent_loop',
            toolName: tc.function.name,
            result: toolResult.slice(0, 2000),
          });

          messages.push({
            role: 'tool',
            content: toolResult,
            tool_call_id: tc.id,
          } as any);
        } catch (err: any) {
          messages.push({
            role: 'tool',
            content: `Error: ${err.message}`,
            tool_call_id: tc.id,
          } as any);
        }
      }
    }

    return {
      content: 'Max iterations reached.',
      iterations: maxIterations,
      model,
      messages,
    };
  }

  // ─── Other Node Types ───────────────────────────────
  private async executeHTTPRequest(inputs: any, config: any): Promise<any> {
    const url = this.template(config.url, { input: inputs.input || inputs, ...inputs });
    const method = config.method || 'GET';
    const headers = config.headers || {};
    const body = config.body ? this.template(config.body, { input: inputs.input || inputs, ...inputs }) : undefined;

    const res = await fetch(url, {
      method,
      headers,
      body,
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    return { status: res.status, headers: Object.fromEntries(res.headers), data };
  }

  private async executeWebScrape(inputs: any, config: any): Promise<any> {
    const url = this.template(config.url, { input: inputs.input || inputs, ...inputs });
    const res = await fetch(url, { headers: { 'User-Agent': 'Agent-Orchestrator/1.0' } });
    const html = await res.text();
    const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return { url, content: text.slice(0, 15000) };
  }

  private async executeCode(inputs: any, config: any): Promise<any> {
    const code = this.template(config.code, { input: inputs.input || inputs, ...inputs });
    const vm = await import('vm');
    const logs: string[] = [];
    const sandbox = {
      console: { log: (...args: any[]) => logs.push(args.join(' ')) },
      input: inputs.input || inputs,
      ...inputs,
    };
    const ctx = vm.createContext(sandbox);
    try {
      vm.runInContext(code, ctx, { timeout: 5000 });
      return { output: logs.join('\n'), result: sandbox };
    } catch (err: any) {
      return { _error: err.message, output: logs.join('\n') };
    }
  }

  private async executeDBQuery(inputs: any, config: any): Promise<any> {
    const query = this.template(config.query, { input: inputs.input || inputs, ...inputs });
    const { default: pg } = await import('pg');
    const { Pool } = pg;
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const result = await pool.query(query);
      return { rows: result.rows.slice(0, 100), rowCount: result.rowCount };
    } catch (err: any) {
      return { _error: err.message };
    } finally {
      await pool.end();
    }
  }

  private async executeCondition(inputs: any, config: any): Promise<any> {
    const condition = config.condition || 'true';
    const input = inputs.input || inputs;
    const result = !!eval(condition); // Simple conditional eval
    return { condition: result, input };
  }

  private async executeTransform(inputs: any, config: any): Promise<any> {
    const transform = config.transform || 'return input';
    const input = inputs.input || inputs;
    try {
      const fn = new Function('input', transform);
      return fn(input);
    } catch (err: any) {
      return { _error: err.message, input };
    }
  }

  // ─── Helpers ────────────────────────────────────────
  private gatherInputs(node: GraphNode): Record<string, any> {
    const inputEdges = this.graph.edges.filter((e) => e.target === node.id);
    if (inputEdges.length === 0) {
      return { input: this.input };
    }

    const gathered: Record<string, any> = {};
    for (const edge of inputEdges) {
      const sourceOutput = this.outputs.get(edge.source);
      if (sourceOutput !== undefined) {
        if (edge.sourceHandle === 'condition-true') {
          gathered.input = sourceOutput.input;
        } else if (edge.sourceHandle === 'condition-false') {
          gathered.input = sourceOutput.input;
        } else if (edge.targetHandle) {
          gathered[edge.targetHandle] = sourceOutput;
        } else {
          gathered.input = sourceOutput;
        }
      }
    }
    return gathered;
  }

  private template(str: string, vars: Record<string, any>): string {
    return str.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const val = vars[key];
      if (val === undefined) return `{{${key}}}`;
      if (typeof val === 'object') return JSON.stringify(val);
      return String(val);
    });
  }

  private async recordStep(
    nodeId: string,
    nodeType: string,
    output: any,
    error?: string
  ) {
    await db.insert(schema.stepExecutions).values({
      runId: this.runId,
      nodeId,
      nodeType,
      status: error ? 'failed' : 'completed',
      input: this.outputs.get(nodeId),
      output,
      error,
      startedAt: new Date(),
      completedAt: new Date(),
    });
  }

  private async updateRunStatus(status: string) {
    await db
      .update(schema.workflowRuns)
      .set({ status: status as any, startedAt: status === 'running' ? new Date() : undefined })
      .where(eq(schema.workflowRuns.id, this.runId));
  }

  private async completeRun(output: any) {
    await db
      .update(schema.workflowRuns)
      .set({ status: 'completed', output, completedAt: new Date() })
      .where(eq(schema.workflowRuns.id, this.runId));
  }

  private async failRun(error: string) {
    await db
      .update(schema.workflowRuns)
      .set({ status: 'failed', error, completedAt: new Date() })
      .where(eq(schema.workflowRuns.id, this.runId));
  }
}