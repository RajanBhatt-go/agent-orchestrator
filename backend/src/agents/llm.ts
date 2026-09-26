import OpenAI from 'openai';
import { z } from 'zod';

// ─── OpenRouter Client ──────────────────────────────────
const openrouter = () =>
  new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY,
    defaultHeaders: {
      'HTTP-Referer': process.env.APP_URL || 'http://localhost:5173',
      'X-Title': 'Agent Orchestrator',
    },
  });

// ─── Request Schemas ────────────────────────────────────
const MessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string(),
  tool_call_id: z.string().optional(),
  name: z.string().optional(),
});

const ToolCallSchema = z.object({
  id: z.string(),
  type: z.literal('function'),
  function: z.object({
    name: z.string(),
    arguments: z.string(),
  }),
});

const LLMRequestSchemaInner = z.object({
  model: z.string().default('openai/gpt-4o-mini'),
  messages: z.array(MessageSchema),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().positive().default(4096),
  tools: z
    .array(
      z.object({
        type: z.literal('function'),
        function: z.object({
          name: z.string(),
          description: z.string(),
          parameters: z.record(z.unknown()),
        }),
      })
    )
    .optional(),
  tool_choice: z.union([z.literal('auto'), z.literal('none'), z.literal('required')]).optional(),
  stream: z.boolean().default(false).optional(),
});

export type LLMRequest = {
  model: string;
  messages: LLMMessage[];
  temperature: number;
  maxTokens: number;
  stream?: boolean;
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
  tool_choice?: 'auto' | 'none' | 'required';
};
export type LLMMessage = z.infer<typeof MessageSchema>;
export type ToolCall = z.infer<typeof ToolCallSchema>;

// ─── Response Types ─────────────────────────────────────
export interface LLMResponse {
  content: string | null;
  toolCalls: ToolCall[];
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// ─── Streaming Chunk ────────────────────────────────────
export interface LLMChunk {
  type: 'content' | 'tool_call' | 'done' | 'error';
  content?: string;
  toolCall?: ToolCall;
  error?: string;
}

// ─── Call LLM (non-streaming) ───────────────────────────
export async function callLLM(req: LLMRequest): Promise<LLMResponse> {
  const client = openrouter();

  const completion = await client.chat.completions.create({
    model: req.model,
    messages: req.messages as any,
    temperature: req.temperature,
    max_tokens: req.maxTokens,
    tools: req.tools as any,
    tool_choice: req.tool_choice as any,
    stream: false,
  });

  const choice = completion.choices[0];

  return {
    content: choice.message.content,
    toolCalls: (choice.message.tool_calls || []).map((tc) => ({
      id: tc.id,
      type: 'function' as const,
      function: {
        name: tc.function.name,
        arguments: tc.function.arguments,
      },
    })),
    model: completion.model,
    usage: {
      promptTokens: completion.usage?.prompt_tokens || 0,
      completionTokens: completion.usage?.completion_tokens || 0,
      totalTokens: completion.usage?.total_tokens || 0,
    },
  };
}

// ─── Call LLM (streaming) ───────────────────────────────
export async function* streamLLM(
  req: LLMRequest
): AsyncGenerator<LLMChunk> {
  const client = openrouter();

  const stream = await client.chat.completions.create({
    model: req.model,
    messages: req.messages as any,
    temperature: req.temperature,
    max_tokens: req.maxTokens,
    tools: req.tools as any,
    tool_choice: req.tool_choice as any,
    stream: true,
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;

    if (delta?.content) {
      yield { type: 'content', content: delta.content };
    }

    if (delta?.tool_calls) {
      for (const tc of delta.tool_calls) {
        if (!tc.id) continue;
        yield {
          type: 'tool_call',
          toolCall: {
            id: tc.id,
            type: 'function',
            function: {
              name: tc.function?.name || '',
              arguments: tc.function?.arguments || '',
            },
          },
        };
      }
    }
  }

  yield { type: 'done' };
}

// ─── Available Models (from OpenRouter) ─────────────────
export const DEFAULT_MODELS = [
  { id: 'openai/gpt-4o', name: 'GPT-4o' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini' },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
  { id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku' },
  { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash' },
  { id: 'meta-llama/llama-3.2-90b-vision', name: 'Llama 3.2 90B' },
  { id: 'mistral/mistral-small-24b', name: 'Mistral Small' },
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3' },
];