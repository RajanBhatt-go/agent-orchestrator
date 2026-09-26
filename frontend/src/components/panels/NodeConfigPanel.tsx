import { useState, useEffect } from 'react';
import { useStore } from '../../stores/useStore';
import { X } from 'lucide-react';

const configFields: Record<string, any[]> = {
  trigger: [],
  llm_call: [
    { key: 'model', label: 'Model', type: 'select', options: [
      'openai/gpt-4o',
      'openai/gpt-4o-mini',
      'anthropic/claude-3.5-sonnet',
      'google/gemini-2.0-flash-001',
      'meta-llama/llama-3.2-90b-vision',
    ]},
    { key: 'systemPrompt', label: 'System Prompt', type: 'textarea' },
    { key: 'prompt', label: 'User Prompt', type: 'textarea', placeholder: 'Use {{input}} for upstream data' },
    { key: 'temperature', label: 'Temperature', type: 'number', min: 0, max: 2, step: 0.1 },
    { key: 'maxTokens', label: 'Max Tokens', type: 'number', min: 1, max: 32000 },
    { key: 'enableTools', label: 'Enable Tools', type: 'checkbox' },
    { key: 'executeTools', label: 'Execute Tools', type: 'checkbox' },
  ],
  agent_loop: [
    { key: 'model', label: 'Model', type: 'select', options: [
      'openai/gpt-4o',
      'openai/gpt-4o-mini',
      'anthropic/claude-3.5-sonnet',
    ]},
    { key: 'systemPrompt', label: 'System Prompt', type: 'textarea' },
    { key: 'prompt', label: 'Task Prompt', type: 'textarea' },
    { key: 'maxIterations', label: 'Max Iterations', type: 'number', min: 1, max: 25 },
  ],
  http_request: [
    { key: 'url', label: 'URL', type: 'text', placeholder: 'https://api.example.com' },
    { key: 'method', label: 'Method', type: 'select', options: ['GET', 'POST', 'PUT', 'DELETE'] },
    { key: 'headers', label: 'Headers (JSON)', type: 'textarea', placeholder: '{"Authorization": "Bearer ..."}' },
    { key: 'body', label: 'Body (JSON)', type: 'textarea', placeholder: '{"key": "value"}' },
  ],
  web_scrape: [
    { key: 'url', label: 'URL', type: 'text', placeholder: 'https://example.com' },
  ],
  execute_code: [
    { key: 'code', label: 'JavaScript Code', type: 'textarea', placeholder: '// Use `input` for upstream data\nreturn input;' },
  ],
  database_query: [
    { key: 'query', label: 'SQL Query', type: 'textarea', placeholder: 'SELECT * FROM table_name LIMIT 10' },
  ],
  condition: [
    { key: 'condition', label: 'Condition (JS)', type: 'text', placeholder: 'input.value > 10' },
  ],
  transform: [
    { key: 'transform', label: 'Transform Function', type: 'textarea', placeholder: 'return input.toUpperCase()' },
  ],
};

export default function NodeConfigPanel() {
  const selectedNode = useStore((s) => s.selectedNode);
  const updateNodeConfig = useStore((s) => s.updateNodeConfig);
  const updateNodeLabel = useStore((s) => s.updateNodeLabel);
  const setSelectedNode = useStore((s) => s.setSelectedNode);

  if (!selectedNode) return null;

  const fields = configFields[selectedNode.type!] || [];
  const config = (selectedNode.data as any)?.config || {};

  const handleChange = (key: string, value: any) => {
    updateNodeConfig(selectedNode.id, { [key]: value });
  };

  return (
    <div className="w-80 bg-gray-900/80 backdrop-blur-sm border-l border-gray-800 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-200">Node Config</h3>
          <span className="text-xs bg-gray-800 px-2 py-0.5 rounded text-gray-400 uppercase">
            {selectedNode.type}
          </span>
        </div>
        <button
          onClick={() => setSelectedNode(null)}
          className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-white"
        >
          <X size={16} />
        </button>
      </div>

      {/* Fields */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Label */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Label</label>
          <input
            type="text"
            value={(selectedNode.data as any)?.label || ''}
            onChange={(e) => updateNodeLabel(selectedNode.id, e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Dynamic config fields */}
        {fields.map((field) => (
          <div key={field.key}>
            <label className="block text-xs font-medium text-gray-400 mb-1">
              {field.label}
            </label>

            {field.type === 'text' && (
              <input
                type="text"
                value={config[field.key] || ''}
                onChange={(e) => handleChange(field.key, e.target.value)}
                placeholder={field.placeholder}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            )}

            {field.type === 'number' && (
              <input
                type="number"
                value={config[field.key] ?? ''}
                onChange={(e) => handleChange(field.key, parseFloat(e.target.value) || 0)}
                min={field.min}
                max={field.max}
                step={field.step}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            )}

            {field.type === 'textarea' && (
              <textarea
                value={config[field.key] || ''}
                onChange={(e) => handleChange(field.key, e.target.value)}
                placeholder={field.placeholder}
                rows={4}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500 resize-none"
              />
            )}

            {field.type === 'select' && (
              <select
                value={config[field.key] || field.options[0]}
                onChange={(e) => handleChange(field.key, e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                {field.options.map((opt: string) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            )}

            {field.type === 'checkbox' && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config[field.key] || false}
                  onChange={(e) => handleChange(field.key, e.target.checked)}
                  className="rounded bg-gray-800 border-gray-600 text-blue-500 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-300">Enabled</span>
              </label>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}