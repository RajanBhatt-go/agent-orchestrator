# 🤖 Agent Orchestrator

**Multi-Tenant AI Workflow Automation & Agent Orchestrator**

A self-hosted Zapier + AutoGPT alternative where users create multi-step asynchronous AI agent pipelines. Built for and on **Replit**.

## Architecture

```
┌────────────────────────────────────────────────┐
│                   Frontend                      │
│  React + ReactFlow + Socket.IO + Tailwind       │
│  Visual workflow builder with real-time canvas  │
└──────────┬──────────────────────────┬───────────┘
           │ HTTP REST API            │ WebSocket
           ▼                          ▼
┌────────────────────────────────────────────────┐
│               Backend (Fastify)                 │
│  Auth · Workflow CRUD · Run Management         │
└──────┬─────────────────────────────────┬───────┘
       │  Enqueue                        │ Emit events
       ▼                                 ▼
┌──────────────┐                ┌──────────────┐
│   BullMQ     │                │  Socket.IO   │
│  (Redis)     │                │  WebSocket   │
│  Task Queue  │                │  Broadcast   │
└──────┬───────┘                └──────────────┘
       │
       ▼
┌────────────────────────────────────────────────┐
│              Worker Process                     │
│  WorkflowExecutor · Agent Loop · Tool Registry │
│  OpenRouter LLM · Code Sandbox · DB queries    │
└────────────────────────────────────────────────┘
```

## Quick Start

### 1. Prerequisites

- [Node.js 20+](https://nodejs.org)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for Postgres + Redis)
- [OpenRouter API Key](https://openrouter.ai/keys)

### 2. Setup

```bash
# Clone the repo
git clone <your-repo-url> agent-orchestrator
cd agent-orchestrator

# Install dependencies
npm run setup

# Copy env and add your OpenRouter key
cp backend/.env.example backend/.env
# Edit backend/.env → set OPENROUTER_API_KEY

# Start Postgres + Redis
docker compose up -d

# Push database schema
npm run db:push
```

### 3. Run

```bash
# Start both backend + frontend (in separate terminals for production)
npm run dev
```

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3001
- **WebSocket**: ws://localhost:3001

## Features

### Visual Workflow Builder
- Drag & drop nodes from the palette onto the React Flow canvas
- Connect nodes with animated edges
- 9 node types: Trigger, LLM Call, Agent Loop, HTTP Request, Web Scraper, Code Exec, DB Query, Condition, Transform

### Agentic Execution
- **LLM Call Node**: Simple prompt → response with tool calling support
- **Agent Loop Node**: Multi-step reasoning with automatic tool execution (up to 25 iterations)
- Tool Registry with 5 built-in tools: HTTP requests, web scraping, code execution, DB queries, nested LLM calls

### Multi-Tenancy
- Isolated tenants with API key authentication
- Each tenant has their own workflows, runs, and data

### Real-Time Canvas
- WebSocket-powered live execution streaming
- See each step as it happens: tool calls, LLM tokens, and results
- Execution logs panel for debugging

### Task Queue
- BullMQ with Redis for reliable async execution
- Automatic retries with exponential backoff
- Configurable worker concurrency

## Node Types

| Node | Description | Config |
|------|-------------|--------|
| **Trigger** | Starts the workflow | — |
| **LLM Call** | Single LLM call with optional tools | Model, prompts, temperature, tool settings |
| **Agent Loop** | Multi-step agentic reasoning | Model, system prompt, max iterations |
| **HTTP Request** | Make HTTP calls | URL, method, headers, body |
| **Web Scraper** | Scrape web page text | URL |
| **Code Exec** | Run JS in sandboxed VM | JavaScript code |
| **DB Query** | SQL SELECT queries | SQL query |
| **Condition** | Branching logic | JS expression |
| **Transform** | Data transformation | JS transform function |

## Templates (Example Workflows)

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

## Template Syntax

Use `{{variable}}` in prompts and configs to reference upstream node outputs:

- `{{input}}` — The raw output from the connected upstream node
- `{{content}}` — LLM response content
- `{{data}}` — HTTP response data

## Replit Deployment

1. Import the repo into Replit
2. Add secrets in Replit:
   - `DATABASE_URL` — Replit PostgreSQL URL
   - `REDIS_HOST` — Replit Redis URL
   - `OPENROUTER_API_KEY`
3. The `.replit` file handles the run configuration
4. The frontend will be available at your Replit URL

## API Endpoints

```
POST   /api/tenants              Create tenant
GET    /api/tenants              List tenants

GET    /api/workflows            List workflows
POST   /api/workflows            Create workflow
GET    /api/workflows/:id        Get workflow
PUT    /api/workflows/:id        Update workflow
DELETE /api/workflows/:id        Delete workflow
POST   /api/workflows/:id/run    Execute workflow
GET    /api/workflows/:id/runs   List runs

GET    /api/runs/:id             Get run with steps
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Node.js, TypeScript, Fastify |
| **Frontend** | React 19, React Flow 12, Tailwind CSS 4 |
| **Task Queue** | BullMQ + Redis |
| **Database** | PostgreSQL + Drizzle ORM |
| **LLM** | OpenRouter (multi-model) |
| **Realtime** | Socket.IO |
| **Auth** | API Key / Tenant-based |

## Performance

- **Worker concurrency**: 5 parallel workflows (configurable)
- **Retry policy**: 3 attempts, exponential backoff
- **Job cleanup**: Completed jobs kept 1 day, failed kept 7 days
- **Step timeout**: Code execution limited to 5 seconds
- **LLM max tokens**: Configurable per node (default 4096)