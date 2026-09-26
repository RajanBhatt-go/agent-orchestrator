import { useCallback, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  SelectionMode,
  type Node,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useStore } from '../../stores/useStore';
import AgentNode from './nodes/AgentNode';
import type { NodeType } from '../../stores/useStore';

const nodeTypes = {
  trigger: AgentNode,
  llm_call: AgentNode,
  agent_loop: AgentNode,
  http_request: AgentNode,
  web_scrape: AgentNode,
  execute_code: AgentNode,
  database_query: AgentNode,
  condition: AgentNode,
  transform: AgentNode,
};

const defaultEdgeOptions = {
  style: { stroke: '#4B5563', strokeWidth: 2 },
  type: 'smoothstep' as const,
  animated: true,
};

export default function WorkflowCanvas() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const reactFlowInstance = useRef<ReactFlowInstance | null>(null);

  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const onNodesChange = useStore((s) => s.onNodesChange);
  const onEdgesChange = useStore((s) => s.onEdgesChange);
  const onConnect = useStore((s) => s.onConnect);
  const setSelectedNode = useStore((s) => s.setSelectedNode);
  const addNode = useStore((s) => s.addNode);
  const currentRun = useStore((s) => s.currentRun);

  // ─── Drag & Drop ──────────────────────────────────────
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/reactflow') as NodeType;
      if (!type || !reactFlowInstance.current) return;

      const position = reactFlowInstance.current.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      addNode(type as NodeType, position);
    },
    [addNode]
  );

  // ─── Node Click ────────────────────────────────────────
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedNode(node);
    },
    [setSelectedNode]
  );

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, [setSelectedNode]);

  // ─── Disable editing during execution ─────────────────
  const isRunning = currentRun?.status === 'running';

  return (
    <div ref={reactFlowWrapper} className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={isRunning ? undefined : onNodesChange}
        onEdgesChange={isRunning ? undefined : onEdgesChange}
        onConnect={isRunning ? undefined : onConnect}
        onInit={(instance) => { reactFlowInstance.current = instance; }}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        selectionMode={SelectionMode.Partial}
        fitView
        deleteKeyCode={isRunning ? undefined : 'Backspace'}
        multiSelectionKeyCode="Shift"
        colorMode="dark"
      >
        <Background color="#1f2937" gap={20} size={1} />
        <Controls className="!bg-gray-900 !border-gray-700 !rounded-lg" />
        <MiniMap
          className="!bg-gray-900 !border-gray-700 !rounded-lg"
          nodeColor={(n) => {
            const colors: Record<string, string> = {
              trigger: '#10b981',
              llm_call: '#3b82f6',
              agent_loop: '#8b5cf6',
              http_request: '#f59e0b',
              web_scrape: '#06b6d4',
              execute_code: '#f97316',
              database_query: '#22c55e',
              condition: '#e11d48',
              transform: '#6366f1',
            };
            return colors[n.type || ''] || '#6b7280';
          }}
          maskColor="rgba(0,0,0,0.7)"
        />
      </ReactFlow>
    </div>
  );
}