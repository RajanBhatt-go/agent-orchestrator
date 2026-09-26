import { useStore } from '../../stores/useStore';
import { Terminal, CheckCircle, XCircle, Loader2, ChevronRight } from 'lucide-react';

export default function ExecutionPanel() {
  const currentRun = useStore((s) => s.currentRun);
  const executionLogs = useStore((s) => s.executionLogs);

  if (!currentRun) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        <div className="text-center">
          <Terminal size={24} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">Run a workflow to see execution logs</p>
        </div>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    pending: 'text-yellow-400',
    running: 'text-blue-400',
    completed: 'text-emerald-400',
    failed: 'text-red-400',
  };

  return (
    <div className="h-full bg-gray-900/80 backdrop-blur-sm border-l border-gray-800 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Terminal size={16} className="text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-200">Execution</h3>
        </div>
        <span className={`text-xs font-medium ${statusColors[currentRun.status]}`}>
          {currentRun.status.toUpperCase()}
        </span>
      </div>

      {/* Logs */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {executionLogs.length === 0 && (
          <p className="text-xs text-gray-500">Waiting for events...</p>
        )}

        {executionLogs.map((event, i) => (
          <div
            key={i}
            className="flex items-start gap-2 text-xs font-mono p-2 rounded bg-gray-800/50"
          >
            {event.type === 'step:start' && (
              <ChevronRight size={12} className="text-blue-400 mt-0.5 shrink-0" />
            )}
            {event.type === 'step:complete' && (
              <CheckCircle size={12} className="text-emerald-400 mt-0.5 shrink-0" />
            )}
            {event.type === 'step:error' && (
              <XCircle size={12} className="text-red-400 mt-0.5 shrink-0" />
            )}
            {event.type === 'step:llm_chunk' && (
              <Loader2 size={12} className="text-blue-400 animate-spin mt-0.5 shrink-0" />
            )}

            <div className="min-w-0 flex-1">
              {event.type === 'step:start' && (
                <span className="text-blue-300">
                  [{event.nodeType}] <strong>{event.nodeId}</strong> starting...
                </span>
              )}
              {event.type === 'step:complete' && (
                <span className="text-emerald-300">
                  [{event.nodeType}] <strong>{event.nodeId}</strong> completed
                </span>
              )}
              {event.type === 'step:error' && (
                <span className="text-red-300">
                  [{event.nodeType}] <strong>{event.nodeId}</strong> failed: {event.error}
                </span>
              )}
              {event.type === 'step:tool_call' && (
                <span className="text-purple-300">
                  🔧 Tool call: {event.toolName}
                </span>
              )}
              {event.type === 'step:tool_result' && (
                <span className="text-purple-300">
                  ✅ Tool result: {event.toolName}
                </span>
              )}
              {event.type === 'step:llm_chunk' && (
                <span className="text-gray-400 break-all">{event.content}</span>
              )}
              {event.type === 'run:complete' && (
                <span className="text-emerald-300 font-semibold">✅ Workflow completed!</span>
              )}
              {event.type === 'run:error' && (
                <span className="text-red-300 font-semibold">❌ Workflow failed: {event.error}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}