import { useStore } from '../../stores/useStore';
import type { NodeType } from '../../stores/useStore';
import { X, Brain, Globe, Code, Database, GitBranch, Repeat, Webhook, Play, Workflow } from 'lucide-react';

const nodeTypes = [
  { type: 'trigger', label: 'Trigger', icon: Play, description: 'Start the workflow' },
  { type: 'llm_call', label: 'LLM Call', icon: Brain, description: 'Call an LLM model' },
  { type: 'agent_loop', label: 'Agent Loop', icon: Repeat, description: 'Multi-step agentic reasoning' },
  { type: 'http_request', label: 'HTTP Request', icon: Webhook, description: 'Make an API call' },
  { type: 'web_scrape', label: 'Web Scraper', icon: Globe, description: 'Scrape web content' },
  { type: 'execute_code', label: 'Code Exec', icon: Code, description: 'Run JavaScript' },
  { type: 'database_query', label: 'DB Query', icon: Database, description: 'Query PostgreSQL' },
  { type: 'condition', label: 'Condition', icon: GitBranch, description: 'Branch logic' },
  { type: 'transform', label: 'Transform', icon: Workflow, description: 'Transform data' },
];

export default function NodePalette() {
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const setSidebarOpen = useStore((s) => s.setSidebarOpen);
  const addNode = useStore((s) => s.addNode);

  const handleDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      className={`
        h-full bg-gray-900/80 backdrop-blur-sm border-r border-gray-800
        transition-all duration-300 flex flex-col
        ${sidebarOpen ? 'w-64' : 'w-0 overflow-hidden'}
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Nodes</h2>
        <button
          onClick={() => setSidebarOpen(false)}
          className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-white"
        >
          <X size={16} />
        </button>
      </div>

      {/* Node List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {nodeTypes.map(({ type, label, icon: Icon, description }) => (
          <div
            key={type}
            draggable
            onDragStart={(e) => handleDragStart(e, type)}
            onClick={() => addNode(type as NodeType)}
            className="
              flex items-center gap-3 p-3 rounded-xl
              bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50
              cursor-grab active:cursor-grabbing
              transition-all hover:border-gray-600 group
            "
          >
            <div className="p-2 rounded-lg bg-gray-700/50 group-hover:bg-gray-700 transition-colors">
              <Icon size={16} className="text-gray-300" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-200">{label}</div>
              <div className="text-xs text-gray-500 truncate">{description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}