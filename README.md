# 🤖 Agent Orchestrator

**Multi-Tenant AI Workflow Automation & Agent Orchestrator**

<p align="center">
  <a href="https://replit.com/github/RajanBhatt-go/agent-orchestrator">
    <img src="https://img.shields.io/badge/Run%20on-Replit-667881?style=for-the-badge&logo=replit" alt="Run on Replit">
  </a>
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React">
  <img src="https://img.shields.io/badge/React%20Flow-FF007F?style=for-the-badge&logo=react&logoColor=white" alt="React Flow">
  <img src="https://img.shields.io/badge/Fastify-000000?style=for-the-badge&logo=fastify&logoColor=white" alt="Fastify">
  <img src="https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL">
</p>

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

### ☁️ On Replit (recommended — no setup needed)

| Step | Action |
|------|--------|
| 1 | Go to **[replit.com/github/RajanBhatt-go/agent-orchestrator](https://replit.com/github/RajanBhatt-go/agent-orchestrator)** |
| 2 | Click **Import** — Replit clones the repo and installs deps automatically |
| 3 | Enable **PostgreSQL** in the Database tab (sidebar) |
| 4 | Add an `OPENROUTER_API_KEY` secret (Tools → Secrets) — get one free at [openrouter.ai/keys](https://openrouter.ai/keys) |
| 5 | Run `npm run db:push` in the Shell tab to create tables |
| 6 | Hit **▶ Run** |

Your agent orchestrator is live at `https://agent-orchestrator-<username>.replit.dev`.

> 📖 **Full Replit guide** with screenshots, Redis setup options, secrets table, and troubleshooting → [see Replit Deployment section](#-running-on-replit)

### 💻 Local Development

**Prerequisites:** Node.js 20+, Docker Desktop, OpenRouter API key.

```bash
# 1. Clone and install
git clone https://github.com/RajanBhatt-go/agent-orchestrator
cd agent-orchestrator
npm run setup

# 2. Configure environment
cp backend/.env.example backend/.env
# Edit backend/.env → set OPENROUTER_API_KEY

# 3. Start PostgreSQL + Redis
docker compose up -d

# 4. Create database tables
npm run db:push

# 5. Start backend + frontend
npm run dev
```

Then open **http://localhost:5173**.

| Service | URL |
|---------|-----|
| **Frontend** | http://localhost:5173 |
| **Backend API** | http://localhost:3001 |
| **WebSocket** | ws://localhost:3001 |

### First Run (both platforms)

1. Open the app → enter a tenant name/slug → click **Create Tenant**
2. Drag a **Trigger** node and an **LLM Call** node onto the canvas
3. Connect them (Trigger's bottom handle → LLM Call's left handle)
4. Click the LLM Call node → set User Prompt to `"Reply with a haiku about AI"`
5. Click **Run** — watch live execution events stream in the right panel

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

## 🚀 Running on Replit

This is the primary platform the project was built for. Here's the exact setup flow.

### Step 1 — Import from GitHub

Go to [replit.com](https://replit.com/~) and click **Create Repl** → **Import from GitHub** → paste:

```
https://github.com/RajanBhatt-go/agent-orchestrator
```

Or use the **Replit CLI** (if you have the Replit desktop app / CLI):

```
repl create agent-orchestrator
```

Replit will clone the repo, detect the `.replit` config, and install npm dependencies automatically.

### Step 2 — Set Up PostgreSQL

| | |
|--|--|
| 1 | Open the **Database** tab in the sidebar (cylinder icon) |
| 2 | Click **Add Database** → select **PostgreSQL** |
| 3 | Replit auto-creates a database and injects the `DATABASE_URL` secret |

⏱ Wait ~30 seconds for it to provision.

### Step 3 — Set Up Redis

You have two options:

**Option A — Upstash (recommended, free):**
1. Go to [upstash.com/redis](https://upstash.com/redis), create a free account
2. Create a **Global Redis** database (free tier: 10MB — plenty for queues)
3. Copy the `UPSTASH_REDIS_REST_URL` — it looks like:
   `https://us1-clean-koi-12345.upstash.io`
4. In Replit, add a **Secret** (Tools → Secrets):
   - Key: `REDIS_HOST`
   - Value: `us1-clean-koi-12345.upstash.io` (the hostname extracted from the URL)
5. Also add `REDIS_PORT=6379`

**Option B — Local (simpler, but no persistence between restarts):**
- Just set `REDIS_HOST=localhost` in Secrets
- Redis won't persist across repl restarts

### Step 4 — Add Secrets

**Tools → Secrets**, add these:

| Secret | Example Value | Where to get it |
|--------|---------------|-----------------|
| `OPENROUTER_API_KEY` | `sk-or-v1-abc123...` | [openrouter.ai/keys](https://openrouter.ai/keys) — free signup |
| `DATABASE_URL` | *(auto-filled by Replit)* | Replit adds this when you enable PostgreSQL |
| `REDIS_HOST` | `localhost` or `us1-clean-koi-12345.upstash.io` | See Step 3 |
| `REDIS_PORT` | `6379` | Standard Redis port |
| `CORS_ORIGIN` | `https://agent-orchestrator.yourname.replit.dev` | Your Replit URL (see below) |

> 🔑 **Get your Replit URL**: Look at the URL bar after the repl starts — it's `https://<repl-name>-<username>.replit.dev`. Use that as `CORS_ORIGIN`.

### Step 5 — Create Database Tables

Open the **Shell** tab and run:

```bash
npm run db:push
```

You should see output like:
```
> drizzle-kit push
✓ 5 tables created: tenants, workflows, workflow_runs, step_executions, schedule_triggers
```

### Step 6 — Run

Hit the big **▶ Run** button. After a few seconds you'll see:

```
╔═══════════════════════════════════════════════════╗
║  🤖 Agent Orchestrator Server                     ║
║  HTTP  → http://0.0.0.0:3001                      ║
║  WS    → ws://0.0.0.0:3001                        ║
║  Health→ http://0.0.0.0:3001/health               ║
╚═══════════════════════════════════════════════════╝
[Worker] BullMQ worker started
[WS] WebSocket server initialized
```

### Step 7 — First Workflow

1. Open your Replit URL (`https://agent-orchestrator.yourname.replit.dev`)
2. Enter a **Tenant Name** (e.g. `My Team`) and **Slug** (e.g. `my-team`)
3. Click **Create Tenant**
4. Drag a **Trigger** node and an **LLM Call** node onto the canvas
5. Connect Trigger's bottom handle → LLM Call's left handle
6. Click the LLM Call node → set User Prompt to `"Reply with a haiku about AI"`
7. Click **Run** — watch the live execution stream in the right panel

### Replit Tips

| Problem | Fix |
|---------|-----|
| **"ECONNREFUSED Redis"** | Redis isn't running. Use Upstash (Step 3, Option A) instead of localhost |
| **"relation 'tenants' does not exist"** | Run `npm run db:push` in Shell — tables weren't created |
| **Frontend blank / 503** | Add `CORS_ORIGIN` secret with your exact Replit URL |
| **"401 x-tenant-id header required"** | Go back to your Replit URL and create a tenant via the modal |
| **LLM calls fail** | Verify `OPENROUTER_API_KEY` is set and has credits |
| **Want to restart clean** | Delete your Repl and re-import. Or in Shell: `rm -rf .data && npm run db:push` |

### Architecture on Replit

```
Replit VM
├── Fastify server (port 3001)
│   ├── REST API endpoints
│   ├── Socket.IO WebSocket server
│   └── BullMQ worker (in-process)
├── PostgreSQL (managed by Replit)
├── Redis (Upstash or local)
└── Static frontend served by Vite dev server (port 5173)
    └── Vite proxies /api and /socket.io to port 3001
```

The worker runs **in-process** by default (`START_WORKER=true`). For production you'd run it as a separate process, but on Replit's free tier the in-process mode works fine for moderate workloads.

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