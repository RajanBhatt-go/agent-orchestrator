import { create } from 'zustand';
import {
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
} from '@xyflow/react';

// ─── Tenant & Auth ──────────────────────────────────────
interface Tenant {
  id: string;
  name: string;
  slug: string;
}

// ─── Workflow ───────────────────────────────────────────
interface Workflow {
  id: string;
  name: string;
  description?: string;
  graph: { nodes: Node[]; edges: Edge[] };
  createdAt: string;
}

// ─── Node Configuration ─────────────────────────────────
export type NodeType =
  | 'trigger'
  | 'llm_call'
  | 'agent_loop'
  | 'http_request'
  | 'web_scrape'
  | 'execute_code'
  | 'database_query'
  | 'condition'
  | 'transform';

// ─── Run / Execution ────────────────────────────────────
interface Run {
  id: string;
  workflowId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  input?: any;
  output?: any;
  error?: string;
  steps?: StepExecution[];
  createdAt: string;
}

interface StepExecution {
  id: string;
  runId: string;
  nodeId: string;
  nodeType: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  input?: any;
  output?: any;
  error?: string;
}

// ─── Execution Event (from WebSocket) ───────────────────
interface ExecutionEvent {
  type: string;
  runId: string;
  nodeId?: string;
  nodeType?: string;
  content?: string;
  toolName?: string;
  output?: any;
  error?: string;
}

// ─── Store ──────────────────────────────────────────────
interface AppState {
  // Tenant
  tenant: Tenant | null;
  setTenant: (t: Tenant) => void;

  // Workflows
  workflows: Workflow[];
  currentWorkflow: Workflow | null;
  setWorkflows: (w: Workflow[]) => void;
  setCurrentWorkflow: (w: Workflow | null) => void;

  // Canvas state
  nodes: Node[];
  edges: Edge[];
  selectedNode: Node | null;
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  setSelectedNode: (node: Node | null) => void;
  addNode: (type: NodeType, position?: { x: number; y: number }) => void;
  updateNodeConfig: (nodeId: string, config: Record<string, any>) => void;
  updateNodeLabel: (nodeId: string, label: string) => void;

  // Runs
  currentRun: Run | null;
  setCurrentRun: (run: Run | null) => void;
  executionLogs: ExecutionEvent[];
  addExecutionEvent: (event: ExecutionEvent) => void;
  clearExecutionLogs: () => void;

  // UI
  sidebarOpen: boolean;
  setSidebarOpen: (o: boolean) => void;
  nodeConfigOpen: boolean;
  setNodeConfigOpen: (o: boolean) => void;
}

export const useStore = create<AppState>((set) => ({
  // ─── Tenant ────────────────────────────────────────
  tenant: null,
  setTenant: (tenant) => set({ tenant }),

  // ─── Workflows ─────────────────────────────────────
  workflows: [],
  currentWorkflow: null,
  setWorkflows: (workflows) => set({ workflows }),
  setCurrentWorkflow: (currentWorkflow) =>
    set({
      currentWorkflow,
      nodes: currentWorkflow?.graph?.nodes || [],
      edges: currentWorkflow?.graph?.edges || [],
      selectedNode: null,
      currentRun: null,
      executionLogs: [],
    }),

  // ─── Canvas ────────────────────────────────────────
  nodes: [],
  edges: [],
  selectedNode: null,

  onNodesChange: (changes) =>
    set((state) => ({ nodes: applyNodeChanges(changes, state.nodes) })),

  onEdgesChange: (changes) =>
    set((state) => ({ edges: applyEdgeChanges(changes, state.edges) })),

  onConnect: (connection) =>
    set((state) => ({ edges: addEdge(connection, state.edges) })),

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  setSelectedNode: (selectedNode) => set({ selectedNode }),

  addNode: (type, position) => {
    const id = `node_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const defaults: Record<string, any> = {
      trigger: { label: 'Trigger', config: {} },
      llm_call: { label: 'LLM Call', config: { model: 'openai/gpt-4o-mini', systemPrompt: '', prompt: '{{input}}' } },
      agent_loop: { label: 'Agent Loop', config: { model: 'openai/gpt-4o-mini', systemPrompt: '', maxIterations: 5 } },
      http_request: { label: 'HTTP Request', config: { url: '', method: 'GET' } },
      web_scrape: { label: 'Web Scraper', config: { url: '' } },
      execute_code: { label: 'Code Exec', config: { code: '// your code here\nreturn input;' } },
      database_query: { label: 'DB Query', config: { query: 'SELECT * FROM ...' } },
      condition: { label: 'Condition', config: { condition: 'input.value > 10' } },
      transform: { label: 'Transform', config: { transform: 'return input' } },
    };

    const def = defaults[type] || { label: type, config: {} };

    const newNode: Node = {
      id,
      type,
      position: position || { x: Math.random() * 400, y: Math.random() * 300 },
      data: { label: def.label, config: def.config },
    };

    set((state) => ({ nodes: [...state.nodes, newNode] }));
  },

  updateNodeConfig: (nodeId, config) => {
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...(n.data as any), config: { ...((n.data as any)?.config || {}), ...config } } } : n
      ),
    }));
  },

  updateNodeLabel: (nodeId, label) => {
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...(n.data as any), label } } : n
      ),
    }));
  },

  // ─── Runs ──────────────────────────────────────────
  currentRun: null,
  setCurrentRun: (currentRun) => set({ currentRun }),
  executionLogs: [],

  addExecutionEvent: (event) =>
    set((state) => ({ executionLogs: [...state.executionLogs, event] })),

  clearExecutionLogs: () => set({ executionLogs: [] }),

  // ─── UI ────────────────────────────────────────────
  sidebarOpen: true,
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  nodeConfigOpen: true,
  setNodeConfigOpen: (nodeConfigOpen) => set({ nodeConfigOpen }),
}));