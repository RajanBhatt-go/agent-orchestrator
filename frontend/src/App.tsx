import { useEffect, useState } from 'react';
import {
  ReactFlowProvider,
} from '@xyflow/react';
import { Menu, Play, Save, Plus, List, PanelRightClose, PanelRightOpen } from 'lucide-react';

import WorkflowCanvas from './components/canvas/WorkflowCanvas';
import NodePalette from './components/panels/NodePalette';
import NodeConfigPanel from './components/panels/NodeConfigPanel';
import ExecutionPanel from './components/panels/ExecutionPanel';
import { useStore } from './stores/useStore';
import { useWorkflowSocket } from './hooks/useWorkflowSocket';
import { workflows as workflowsApi } from './hooks/api';

function App() {
  const [view, setView] = useState<'editor' | 'execution'>('editor');
  const [workflowName, setWorkflowName] = useState('Untitled Workflow');
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [showWorkflowList, setShowWorkflowList] = useState(false);

  const store = useStore();
  const { subscribeToRun } = useWorkflowSocket();

  // ─── Save Workflow ─────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    try {
      const graph = { nodes: store.nodes, edges: store.edges };
      if (store.currentWorkflow?.id) {
        await workflowsApi.update(store.currentWorkflow.id, {
          name: workflowName,
          graph,
        });
      } else {
        const wf = await workflowsApi.create({
          name: workflowName,
          graph,
        });
        store.setCurrentWorkflow(wf);
      }
    } catch (err: any) {
      alert('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // ─── Run Workflow ──────────────────────────────────
  const handleRun = async () => {
    if (!store.currentWorkflow?.id) {
      // Save first
      const graph = { nodes: store.nodes, edges: store.edges };
      try {
        const wf = await workflowsApi.create({ name: workflowName, graph });
        store.setCurrentWorkflow(wf);
        await runWorkflow(wf.id);
      } catch (err: any) {
        alert('Failed to save: ' + err.message);
      }
    } else {
      await runWorkflow(store.currentWorkflow.id);
    }
  };

  const runWorkflow = async (workflowId: string) => {
    setRunning(true);
    store.clearExecutionLogs();
    setView('execution');
    try {
      const run = await workflowsApi.run(workflowId, {});
      store.setCurrentRun(run);
      subscribeToRun(run.id);
    } catch (err: any) {
      alert('Failed to run: ' + err.message);
      setRunning(false);
    }
  };

  // ─── New Workflow ──────────────────────────────────
  const handleNew = () => {
    store.setCurrentWorkflow(null);
    setWorkflowName('Untitled Workflow');
    store.setNodes([]);
    store.setEdges([]);
    store.clearExecutionLogs();
    setView('editor');
  };

  // ─── Load Workflow List ────────────────────────────
  useEffect(() => {
    if (store.tenant) {
      workflowsApi.list().then((wfs) => store.setWorkflows(wfs)).catch(() => {});
    }
  }, [store.tenant]);

  return (
    <ReactFlowProvider>
      <div className="h-screen w-screen flex flex-col bg-gray-950 text-white overflow-hidden">
        {/* ─── Top Bar ─────────────────────────────────── */}
        <header className="h-12 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-3">
            {/* Sidebar toggle */}
            <button
              onClick={() => store.setSidebarOpen(!store.sidebarOpen)}
              className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white"
            >
              <Menu size={18} />
            </button>

            {/* Logo */}
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <span className="text-xs font-bold">AO</span>
              </div>
              <span className="text-sm font-semibold hidden sm:block">Agent Orchestrator</span>
            </div>
          </div>

          {/* Workflow name */}
          <input
            type="text"
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
            className="bg-transparent text-sm text-center text-gray-200 border-b border-transparent hover:border-gray-700 focus:border-blue-500 focus:outline-none px-2"
          />

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleNew}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
            >
              <Plus size={14} />
              <span className="hidden sm:inline">New</span>
            </button>

            <button
              onClick={async () => {
                const wfs = await workflowsApi.list().catch(() => []);
                store.setWorkflows(wfs);
                setShowWorkflowList(!showWorkflowList);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
            >
              <List size={14} />
              <span className="hidden sm:inline">Workflows</span>
            </button>

            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors disabled:opacity-50"
            >
              <Save size={14} />
              <span className="hidden sm:inline">{saving ? 'Saving...' : 'Save'}</span>
            </button>

            <button
              onClick={handleRun}
              disabled={running || store.nodes.length === 0}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50"
            >
              <Play size={14} />
              <span>{running ? 'Running...' : 'Run'}</span>
            </button>

            {/* View toggle */}
            <button
              onClick={() => setView(view === 'editor' ? 'execution' : 'editor')}
              className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white"
            >
              {view === 'editor' ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}
            </button>
          </div>
        </header>

        {/* ─── Workflow List Dropdown ─────────────────── */}
        {showWorkflowList && (
          <div className="absolute top-12 right-40 z-50 w-72 bg-gray-900 border border-gray-700 rounded-xl shadow-xl max-h-80 overflow-y-auto">
            <div className="p-3 border-b border-gray-800">
              <h3 className="text-xs font-semibold text-gray-400 uppercase">Saved Workflows</h3>
            </div>
            {store.workflows.length === 0 && (
              <p className="p-4 text-xs text-gray-500 text-center">No workflows yet</p>
            )}
            {store.workflows.map((wf) => (
              <button
                key={wf.id}
                onClick={() => {
                  store.setCurrentWorkflow(wf);
                  setWorkflowName(wf.name);
                  setShowWorkflowList(false);
                }}
                className="w-full text-left p-3 hover:bg-gray-800 border-b border-gray-800/50 last:border-0"
              >
                <div className="text-sm text-gray-200">{wf.name}</div>
                <div className="text-xs text-gray-500">
                  {wf.graph?.nodes?.length || 0} nodes &middot;{' '}
                  {new Date(wf.createdAt).toLocaleDateString()}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* ─── Main Content ────────────────────────────── */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Node Palette */}
          <NodePalette />

          {/* Center: Canvas or Execution View */}
          <div className="flex-1 relative">
            {view === 'editor' ? (
              <WorkflowCanvas />
            ) : (
              <ExecutionPanel />
            )}
          </div>

          {/* Right: Config Panel */}
          {store.selectedNode && view === 'editor' && <NodeConfigPanel />}
        </div>

        {/* ─── Setup Tenant Modal ───────────────────── */}
        {!store.tenant && <TenantSetup />}
      </div>
    </ReactFlowProvider>
  );
}

// ─── Tenant Setup Modal ─────────────────────────────────
function TenantSetup() {
  const setTenant = useStore((s) => s.setTenant);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [loading, setLoading] = useState(false);
  const [tenantId, setTenantId] = useState(localStorage.getItem('tenantId'));

  const handleCreate = async () => {
    setLoading(true);
    try {
      const { tenants } = await import('./hooks/api');
      const tenant = await tenants.create(name || slug, slug);
      localStorage.setItem('tenantId', tenant.id);
      setTenant(tenant);
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUseExisting = () => {
    if (tenantId) {
      localStorage.setItem('tenantId', tenantId);
      setTenant({ id: tenantId, name: '', slug: '' });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 w-96 shadow-2xl">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mx-auto mb-3">
            <span className="text-lg font-bold">AO</span>
          </div>
          <h2 className="text-lg font-semibold">Agent Orchestrator</h2>
          <p className="text-sm text-gray-400 mt-1">Multi-Tenant AI Workflow Automation</p>
        </div>

        {tenantId ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-400 text-center">
              Existing tenant ID found. Continue or create a new one.
            </p>
            <div className="text-xs bg-gray-800 rounded-lg p-3 text-gray-300 font-mono break-all">
              {tenantId}
            </div>
            <button
              onClick={handleUseExisting}
              className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium"
            >
              Continue with Existing Tenant
            </button>
            <button
              onClick={() => { localStorage.removeItem('tenantId'); setTenantId(null); }}
              className="w-full py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm"
            >
              Create New Tenant
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Tenant Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Company"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Slug</label>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="my-company"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <button
              onClick={handleCreate}
              disabled={loading || !slug}
              className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Tenant'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;