import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  Play,
  Brain,
  Globe,
  Code,
  Database,
  GitBranch,
  Repeat,
  Webhook,
  Workflow,
} from 'lucide-react';

const iconMap: Record<string, React.ComponentType<any>> = {
  trigger: Play,
  llm_call: Brain,
  agent_loop: Repeat,
  http_request: Webhook,
  web_scrape: Globe,
  execute_code: Code,
  database_query: Database,
  condition: GitBranch,
  transform: Workflow,
};

const colorMap: Record<string, string> = {
  trigger: 'border-emerald-600 bg-emerald-950/50',
  llm_call: 'border-blue-600 bg-blue-950/50',
  agent_loop: 'border-purple-600 bg-purple-950/50',
  http_request: 'border-amber-600 bg-amber-950/50',
  web_scrape: 'border-cyan-600 bg-cyan-950/50',
  execute_code: 'border-orange-600 bg-orange-950/50',
  database_query: 'border-green-600 bg-green-950/50',
  condition: 'border-rose-600 bg-rose-950/50',
  transform: 'border-indigo-600 bg-indigo-950/50',
};

function AgentNode({ data, selected, type }: NodeProps) {
  const nodeType = type || 'llm_call';
  const Icon = iconMap[nodeType] || Brain;
  const colors = colorMap[nodeType] || 'border-gray-600 bg-gray-950/50';

  return (
    <div
      className={`
        rounded-xl border-2 px-4 py-3 min-w-[200px] shadow-lg backdrop-blur-sm
        transition-all duration-200
        ${colors}
        ${selected ? 'ring-2 ring-white/30 shadow-xl scale-105' : 'opacity-90 hover:opacity-100'}
      `}
    >
      {/* Input handle */}
      {nodeType !== 'trigger' && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-3 !h-3 !bg-white !border-2 !border-gray-700"
        />
      )}

      {/* Node header */}
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-lg bg-white/10">
          <Icon size={16} className="text-white" />
        </div>
        <span className="text-sm font-semibold text-white truncate">
          {(data as any)?.label || type}
        </span>
      </div>

      {/* Node subtitle / preview */}
      <div className="mt-2 text-xs text-gray-400 truncate">
        {type === 'llm_call' && ((data as any)?.config?.model || 'openai/gpt-4o-mini')}
        {type === 'agent_loop' && `Max: ${(data as any)?.config?.maxIterations || 5} iterations`}
        {type === 'http_request' && ((data as any)?.config?.method || 'GET')}
        {type === 'web_scrape' && 'Scrape URL'}
        {type === 'execute_code' && 'Run JavaScript'}
        {type === 'database_query' && 'SQL Query'}
        {type === 'condition' && 'Branch'}
        {type === 'transform' && 'Data Transform'}
        {type === 'trigger' && 'Starts here'}
      </div>

      {/* Output handles */}
      {nodeType === 'condition' ? (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            id="condition-true"
            className="!w-3 !h-3 !bg-emerald-400 !border-2 !border-gray-700"
          />
          <div className="absolute -bottom-6 left-1/2 -translate-x-8 text-[10px] text-emerald-400 font-medium">
            TRUE
          </div>
          <Handle
            type="source"
            position={Position.Right}
            id="condition-false"
            className="!w-3 !h-3 !bg-rose-400 !border-2 !border-gray-700"
          />
          <div className="absolute -right-8 top-1/2 -translate-y-4 text-[10px] text-rose-400 font-medium">
            FALSE
          </div>
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!w-3 !h-3 !bg-white !border-2 !border-gray-700"
        />
      )}
    </div>
  );
}

export default memo(AgentNode);