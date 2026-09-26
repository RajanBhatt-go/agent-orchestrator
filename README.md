# 🤖 Agent Orchestrator

**Multi-Tenant AI Workflow Automation & Agent Orchestrator**

A self-hosted **Zapier + AutoGPT** alternative where users create multi-step asynchronous AI agent pipelines. Drag nodes onto a canvas, connect them into a DAG, and watch execution stream live via WebSockets. Built for and on **Replit**.

---

## Architecture

### High-Level Layers

```
┌──────────────────────────────────────────────────────────────────┐
│                       FRONTEND (React 19)                        │
│  ┌──────────────┐  ┌─────────────────┐  ┌────────────────────┐  │
│  │  NodePalette │  │ WorkflowCanvas  │  │ NodeConfigPanel    │  │
│  │  (draggable  │  │ (React Flow 12) │  │ (dynamic per-type  │  │
│  │   node list) │  │  drag-drop DAG) │  │  config forms)     │  │
│  └──────────────┘  └────────┬────────┘  └────────────────────┘  │
│                             │                                    │
│                    ┌────────▼────────┐                           │
│                    │ ExecutionPanel  │                           │
│                    │ (live WebSocket │                           │
│                    │  event stream)  │                           │
│                    └─────────────────┘                           │
│  • Zustand store for all state                                   │
│  • Socket.IO client for real-time events                         │
│  • Tailwind CSS 4 dark theme                                     │
└══════════════════╦═══════════════════════════════════════════════┘
                   ║
        REST API   ║   WebSocket (Socket.IO)
        :3001      ║   ws://localhost:3001
                   ║
┌══════════════════╩═══════════════════════════════════════════════┐
│                      BACKEND (Fastify)                           │
│                                                                  │
│  ┌──────────────┐  ┌─────────────────┐  ┌────────────────────┐  │
│  │ Auth Hook    │  │ /api/workflows  │  │ /api/tenants       │  │
│  │ x-tenant-id  │  │ CRUD + Execute  │  │ Create + Verify    │  │
│  │ validation   │  │                 │  │                    │  │
│  └──────────────┘  └───────┬─────────┘  └────────────────────┘  │
│                            │                                     │
│                     ┌──────▼──────┐                              │
│                     │   BullMQ    │    ┌─────────────────────┐   │
│                     │  Queue      │    │   Socket.IO Server  │   │
│                     │  (Redis)    │───▶│   broadcast events  │   │
│                     │  enqueue    │    │   to subscribers    │   │
│                     └──────┬──────┘    └─────────────────────┘   │
│                            │                                     │
│  • PostgreSQL + Drizzle ORM (5 tables)                           │
│  • Multi-tenant isolation via x-tenant-id header                 │
│  • Zod request validation                                        │
└═══════════════════════════╩══════════════════════════════════════┘
                            │
                    ┌───────▼────────┐
                    │   Worker x5    │
                    │  (BullMQ)      │
                    └───────┬────────┘
                            │
┌═══════════════════════════╩══════════════════════════════════════┐
│                     EXECUTION ENGINE                              │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  WorkflowExecutor                                           │  │
│  │  • Builds in-degree map from edges (Kahn's algorithm)      │  │
│  │  • BFS through nodes in topological order                  │  │
│  │  • Gathers inputs from upstream node outputs               │  │
│  │  • Routes condition branches via handle IDs                 │  │
│  └──────────┬─────────────────────────────────────────────────┘  │
│             │                                                    │
│    ┌────────┼────────┬──────────┬──────────┬──────────┬──────┐   │
│    ▼        ▼        ▼          ▼          ▼          ▼      │   │
│ ┌──────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────┐ │   │
│ │ LLM  │ │ Agent  │ │ HTTP   │ │ Web    │ │ Code   │ │ DB │ │   │
│ │ Call │ │ Loop   │ │Request │ │Scraper │ │ Exec   │ │Qry │ │   │
│ └──┬───┘ └───┬────┘ └────────┘ └────────┘ └────────┘ └────┘ │   │
│    │         │                                                 │   │
│    └─────────┴───────── Tool Registry ──────────────────────┐  │   │
│              │ http_request  │ web_scrape  │ execute_code   │  │   │
│              │ database_query│ llm_call    │ (5 built-in)   │  │   │
│              └──────────────────────────────────────────────┘  │   │
│                                                                   │
│  • Handlebars-style {{variable}} template interpolation           │
│  • Each node type has its own executor method                     │
│  • Condition nodes produce TRUE/FALSE branch handles              │
└═══════════════════════════════════════════════════════════════════┘
```

### Execution Data Flow

```
User clicks "Run" 
        │
        ▼
POST /api/workflows/:id/run
        │
        ├─▶ Create workflow_runs row (status: pending)
        │
        ├─▶ enqueueWorkflow() → BullMQ (Redis)
        │       │
        │       ▼  Worker picks up job
        │       │
        │       ▼
        │   WorkflowExecutor.execute()
        │       │
        │       ├─▶ UPDATE run → "running", emit "step:start"
        │       │
        │       ├─▶ Topological sort (Kahn's algorithm)
        │       │       inDegree = {nodeA: 0, nodeB: 1, ...}
        │       │       queue = [nodes with degree 0]
        │       │
        │       ├─▶ Process nodes in BFS order:
        │       │       while queue.length > 0:
        │       │         node = queue.shift()
        │       │         output = executeNode(node)
        │       │         emit("step:complete", ...)
        │       │         for each dependent:
        │       │           inDegree[dep]--
        │       │           if degree === 0: queue.push(dep)
        │       │
        │       ├─▶ executeNode dispatches by type:
        │       │   ┌──────────────┬──────────────────────────────┐
        │       │   │ llm_call     │ callLLM() with model/prompt  │
        │       │   │              │ optional tool execution       │
        │       │   ├──────────────┼──────────────────────────────┤
        │       │   │ agent_loop   │ Multi-step: LLM → tool →     │
        │       │   │              │ LLM → ... until no tool calls│
        │       │   ├──────────────┼──────────────────────────────┤
        │       │   │ http_request │ fetch() with URL/method      │
        │       │   ├──────────────┼──────────────────────────────┤
        │       │   │ web_scrape   │ fetch + strip HTML tags      │
        │       │   ├──────────────┼──────────────────────────────┤
        │       │   │ execute_code │ vm.runInContext() sandbox    │
        │       │   ├──────────────┼──────────────────────────────┤
        │       │   │ database_qry │ pool.query() (SELECT only)   │
        │       │   ├──────────────┼──────────────────────────────┤
        │       │   │ condition    │ eval(condition expression)   │
        │       │   ├──────────────┼──────────────────────────────┤
        │       │   │ transform    │ new Function('input', code)  │
        │       │   └──────────────┴──────────────────────────────┘
        │       │
        │       └─▶ UPDATE run → "completed"/"failed"
        │           emit("run:complete" / "run:error")
        │
        └─▶ Socket.IO broadcasts every event to frontend
```

### Database Schema

```
tenants
  id UUID PK
  name TEXT
  slug TEXT UNIQUE
  api_key TEXT UNIQUE
  created_at TIMESTAMP
        │ 1
        │
        │ N
        ▼
workflows
  id UUID PK
  tenant_id UUID FK ──▶ tenants.id
  name TEXT
  description TEXT?
  graph JSONB          ◀── React Flow state { nodes, edges }
  active BOOLEAN
  created_at TIMESTAMP
  updated_at TIMESTAMP
        │ 1
        │
        │ N
        ▼
workflow_runs
  id UUID PK
  workflow_id UUID FK ──▶ workflows.id
  tenant_id UUID FK   ──▶ tenants.id
  status TEXT          pending | running | completed | failed
  trigger TEXT         manual | scheduled | webhook
  input JSONB
  output JSONB?
  error TEXT?
  started_at TIMESTAMP?
  completed_at TIMESTAMP?
  created_at TIMESTAMP
        │ 1
        │
        │ N
        ▼
step_executions        ◀── Each node invocation within a run
  id UUID PK
  run_id UUID FK       ──▶ workflow_runs.id
  node_id TEXT          ◀── React Flow node ID
  node_type TEXT        ◀── llm_call, agent_loop, etc.
  status TEXT           pending | running | completed | failed | skipped
  input JSONB
  output JSONB?
  error TEXT?
  started_at TIMESTAMP?
  completed_at TIMESTAMP?

schedule_triggers       ◀── Cron-based scheduled runs
  id UUID PK
  workflow_id UUID FK
  tenant_id UUID FK
  cron TEXT
  input JSONB
  active BOOLEAN
  last_run_at TIMESTAMP?
  created_at TIMESTAMP
```

### File Map

```
agent-orchestrator/
│
├── backend/
│   ├── src/
│   │   ├── index.ts                  # Server bootstrap, auth middleware
│   │   ├── agents/
│   │   │   ├── llm.ts                # OpenRouter client (9 models)
│   │   │   ├── executor.ts           # DAG execution engine
│   │   │   └── tools/
│   │   │       └── registry.ts       # 5 built-in tools + registerTool()
│   │   ├── queue/
│   │   │   └── index.ts              # BullMQ queue + worker + event handlers
│   │   ├── ws/
│   │   │   └── index.ts              # Socket.IO setup + room management
│   │   ├── db/
│   │   │   ├── schema.ts             # Drizzle ORM table definitions
│   │   │   └── index.ts              # DB connection pool
│   │   └── api/
│   │       ├── workflows.ts          # Workflow CRUD + run endpoints
│   │       └── tenants.ts            # Tenant management
│   ├── drizzle.config.ts
│   ├── .env.example
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx                   # Main layout, toolbar, tenant modal
│   │   ├── main.tsx                  # Entry point
│   │   ├── index.css                 # Tailwind CSS 4 entry
│   │   ├── components/
│   │   │   ├── canvas/
│   │   │   │   ├── WorkflowCanvas.tsx # React Flow with drag-drop + minimap
│   │   │   │   └── nodes/
│   │   │   │       └── AgentNode.tsx  # Styled node (9 type variants)
│   │   │   └── panels/
│   │   │       ├── NodePalette.tsx     # Draggable node sidebar
│   │   │       ├── NodeConfigPanel.tsx # Dynamic config forms
│   │   │       └── ExecutionPanel.tsx  # Live event log viewer
│   │   ├── hooks/
│   │   │   ├── api.ts                # Typed REST API client
│   │   │   └── useWorkflowSocket.ts  # Socket.IO React hook
│   │   └── stores/
│   │       └── useStore.ts           # Zustand global state
│   ├── vite.config.ts                # Vite + proxy to backend
│   └── package.json
│
├── .replit                            # Replit runtime config
├── docker-compose.yml                 # PostgreSQL + Redis
├── package.json                       # Root workspace scripts
└── README.md
```

---

## Quick Start

### Prerequisites

- [Node.js 20+](https://nodejs.org)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (PostgreSQL + Redis)
- [OpenRouter API Key](https://openrouter.ai/keys) (free tier available)

### Setup

```bash
# 1. Clone and install
git clone <your-repo-url> agent-orchestrator
cd agent-orchestrator
npm run setup

# 2. Configure environment
cp backend/.env.example backend/.env
# Edit backend/.env → set OPENROUTER_API_KEY

# 3. Start infrastructure
docker compose up -d

# 4. Create database tables
npm run db:push

# 5. Start development (backend + frontend)
npm run dev
```

### Access

| Service | URL |
|---------|-----|
| **Frontend** | http://localhost:5173 |
| **Backend API** | http://localhost:3001 |
| **WebSocket** | ws://localhost:3001 |

### First Run

1. Open http://localhost:5173
2. Enter a tenant slug (e.g., `my-team`), click **Create Tenant**
3. Drag nodes from the left palette onto the canvas
4. Connect nodes by dragging between handles
5. Configure each node by clicking it
6. Click **Run** to execute — watch events stream in real-time

---

## Node Types

| Node | Icon | Description | Key Config |
|------|------|-------------|------------|
| **Trigger** | ▶ | Starts the workflow, passes input through | — |
| **LLM Call** | 🧠 | Single LLM call with optional tool calling | Model, system prompt, user prompt, temperature, max tokens, tool settings |
| **Agent Loop** | 🔁 | Multi-step reasoning: LLM calls tools, gets results, continues until done | Model, system prompt, max iterations (1–25) |
| **HTTP Request** | 🌐 | Make HTTP requests to any API | URL, method (GET/POST/PUT/DELETE), headers, body |
| **Web Scraper** | 🌍 | Scrape and extract text from a webpage | URL |
| **Code Exec** | 💻 | Execute JavaScript in a sandboxed VM (5s timeout) | JS code, `input` variable injected |
| **DB Query** | 🗄️ | Run SQL SELECT queries (read-only safety check) | SQL query |
| **Condition** | 🌿 | Branch logic — routes to TRUE/FALSE handles | JS expression (e.g., `input.value > 10`) |
| **Transform** | 🔄 | Transform data with a JS function | `return input` function body |

---

## Built-in Tools (for Agent Loop & LLM Call nodes)

| Tool | Description |
|------|-------------|
| `http_request` | Make GET/POST requests to any URL |
| `web_scrape` | Fetch and extract text from any URL |
| `execute_code` | Run JavaScript in a sandboxed VM (5s timeout, `console.log` captured) |
| `database_query` | Execute SQL SELECT queries (auto-blocked for non-SELECT) |
| `llm_call` | Call a different LLM model with a custom prompt (nested reasoning) |

---

## Template Syntax

Use `{{variable}}` in prompts and config values to reference upstream node outputs:

```handlebars
Summarize this: {{input}}
```

The engine replaces `{{input}}` with the upstream node's output. Works for:
- Prompts, system prompts, URLs, SQL queries, code, transform bodies, condition expressions

---

## Template Workflows

### 1. Research Agent
```
Trigger → Web Scraper → LLM Call (summarize) → HTTP Request (save to Notion)
```

### 2. AI Support Bot
```
Trigger → LLM Call (classify intent) → Condition
  ├─ TRUE → DB Query (lookup knowledge base) → LLM Call (answer)
  └─ FALSE → HTTP Request (escalate to human)
```

### 3. Data Pipeline
```
Trigger → HTTP Request (fetch data) → Transform (clean) → DB Query (store)
```

### 4. Auto Research Loop
```
Trigger → Agent Loop (research task: scrape 3 sources, summarize, save)
```
The agent loop will autonomously call `web_scrape`, `llm_call`, and `http_request` tools in sequence.

---

## API Endpoints

### Tenants
```
POST   /api/tenants              Create tenant (name, slug)
GET    /api/tenants              List all tenants
GET    /api/tenants/verify       Verify API key (x-api-key header)
```

### Workflows
```
GET    /api/workflows            List workflows (scoped to tenant)
POST   /api/workflows            Create workflow (name, graph JSON)
GET    /api/workflows/:id        Get workflow details
PUT    /api/workflows/:id        Update workflow (partial)
DELETE /api/workflows/:id        Delete workflow
POST   /api/workflows/:id/run    Execute workflow (optional input)
GET    /api/workflows/:id/runs   List runs for workflow
```

### Runs
```
GET    /api/runs/:id             Get run details with step executions
```

All endpoints (except `/api/tenants`) require the `x-tenant-id` header.

---

## WebSocket Events

Subscribe to a run: `socket.emit('subscribe:run', runId)`

| Event | Payload |
|-------|---------|
| `execution:event` | `{ type, runId, nodeId, nodeType, content?, toolName?, error?, output? }` |

Event types:
- `step:start` — Node began execution
- `step:complete` — Node finished successfully
- `step:error` — Node failed
- `step:llm_chunk` — Streaming token from LLM
- `step:tool_call` — Agent invoked a tool
- `step:tool_result` — Tool returned a result
- `run:complete` — Entire workflow finished
- `run:error` — Workflow failed

---

## Replit Deployment

1. Create a new Replit from this repo
2. Add secrets in Replit's **Tools → Secrets** tab:

| Secret | Value |
|--------|-------|
| `DATABASE_URL` | Replit PostgreSQL URL (from the DB tab) |
| `REDIS_HOST` | Replit Redis URL (from the DB tab) or `localhost` |
| `REDIS_PORT` | `6379` |
| `OPENROUTER_API_KEY` | Your OpenRouter API key |
| `CORS_ORIGIN` | Your Replit URL |

3. The `.replit` file auto-configures the run command
4. The frontend is available at `https://<your-repl>.replit.dev`

> **Note**: On Replit, you may need to start Redis manually or use the Replit Redis addon. The worker runs in-process by default — set `START_WORKER=false` and run a separate worker terminal for production.

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Backend Framework** | Fastify 5 + TypeScript | High-performance HTTP + plugin system |
| **Frontend** | React 19 + TypeScript | Component-based UI |
| **Canvas** | React Flow 12 | Visual DAG editor |
| **Styling** | Tailwind CSS 4 + Lucide icons | Dark-theme UI |
| **Task Queue** | BullMQ + Redis | Async workflow execution |
| **Database** | PostgreSQL + Drizzle ORM | Persistent storage |
| **LLM Gateway** | OpenRouter | Multi-model API (GPT-4o, Claude 3.5, Gemini 2.0, etc.) |
| **Realtime** | Socket.IO | Live execution streaming |
| **Auth** | API key / Tenant ID | Multi-tenant isolation |

---

## Performance & Limits

| Parameter | Default | Configurable |
|-----------|---------|-------------|
| Worker concurrency | 5 parallel workflows | `concurrency` in `createWorker()` |
| Job retries | 3 attempts | `attempts` in queue config |
| Retry backoff | Exponential (2s base) | `backoff` in queue config |
| Completed job retention | 1 day | `removeOnComplete.age` |
| Failed job retention | 7 days | `removeOnFail.age` |
| Code execution timeout | 5 seconds | `timeout` in vm.runInContext() |
| LLM max tokens | 4096 | Per-node config |
| Agent loop iterations | 5 | Per-node config (max 25) |
| Web scrape content limit | 15,000 chars | Hard-coded truncation |
| HTTP response limit | 10,000 chars | Hard-coded truncation |

---

## Development

### Backend only
```bash
cd backend
npm run dev          # Fastify on :3001
```

### Frontend only
```bash
cd frontend
npm run dev          # Vite + React on :5173
```

### Standalone worker
```bash
cd backend
npm run worker       # Separate process for production
```

### Database migrations
```bash
cd backend
npm run db:generate  # Generate SQL from schema
npm run db:push      # Push to database
npm run db:migrate   # Run migrations
```

---

## Extending

### Add a new node type
1. Add the type to `NodeType` in `frontend/src/stores/useStore.ts`
2. Add a case in `executeNode()` in `backend/src/agents/executor.ts`
3. Add a config form in `frontend/src/components/panels/NodeConfigPanel.tsx`
4. Add a color in `frontend/src/components/canvas/nodes/AgentNode.tsx`

### Add a new tool
```typescript
import { registerTool } from './tools/registry.js';

registerTool({
  name: 'my_tool',
  description: 'What my tool does',
  parameters: {
    type: 'object',
    properties: {
      apiKey: { type: 'string' },
    },
    required: ['apiKey'],
  },
  execute: async (args) => {
    // Your tool logic
    return 'Result string';
  },
});
```

---

## License

MIT