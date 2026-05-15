"use client";

import {
  addEdge,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdges,
  useNodes,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeTypes,
  type IsValidConnection,
  type Node,
  type NodeTypes,
  type ReactFlowInstance
} from "reactflow";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { ArrowLeft } from "lucide-react";
import "reactflow/dist/style.css";
import { TriggerNode } from "@/components/canvas/nodes/TriggerNode";
import { AINode } from "@/components/canvas/nodes/AINode";
import { ActionNode } from "@/components/canvas/nodes/ActionNode";
import { DeletableEdge } from "@/components/canvas/edges/DeletableEdge";
import { DND_NODE_TYPE_KEY, NodeSidebar } from "@/components/canvas/NodeSidebar";
import type {
  ActionNodeData,
  AINodeData,
  AIActionType,
  TriggerNodeData,
  TriggerType
} from "@/lib/types";

const nodeTypes: NodeTypes = {
  triggerNode: TriggerNode,
  aiNode: AINode,
  actionNode: ActionNode
};

const edgeTypes: EdgeTypes = {
  smoothstep: DeletableEdge
};

type CanvasNode = Node<TriggerNodeData | AINodeData | ActionNodeData>;
type CanvasEdge = Edge;

interface WorkflowCanvasProps {
  initialNodes: CanvasNode[];
  initialEdges: CanvasEdge[];
  onSave: (nodes: CanvasNode[], edges: CanvasEdge[]) => void;
}

function withAnimatedEdges(edges: CanvasEdge[]) {
  return edges.map((edge) => ({
    ...edge,
    type: "smoothstep",
    animated: true,
    deletable: true,
    style: {
      stroke: "#6366f1",
      strokeWidth: 2,
      ...(edge.style ?? {})
    }
  }));
}

function createNodeDefaults(type: string): CanvasNode["data"] {
  if (type === "triggerNode") {
    const triggerType: TriggerType = "Manual";

    return {
      label: "Workflow start",
      type: triggerType
    } satisfies TriggerNodeData;
  }

  if (type === "actionNode") {
    return {
      label: "Save result",
      action: "Save Output"
    } satisfies ActionNodeData;
  }

  const action: AIActionType = "Summarize";

  return {
    label: "AI step",
    action,
    prompt: "Summarize the input into a concise set of actionable points."
  } satisfies AINodeData;
}

function WorkflowCanvasInner({
  initialNodes,
  initialEdges,
  onSave
}: WorkflowCanvasProps) {
  const nodes = useNodes<TriggerNodeData | AINodeData | ActionNodeData>();
  const edges = useEdges();
  const { setNodes, setEdges } = useReactFlow<TriggerNodeData | AINodeData | ActionNodeData>();
  const reactFlowRef = useRef<ReactFlowInstance | null>(null);
  const hasMountedRef = useRef(false);
  const saveSnapshotRef = useRef(onSave);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    saveSnapshotRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    saveSnapshotRef.current(nodes, edges);
  }, [nodes, edges]);

  const onNodesChange = useCallback(
    () => {
      if (!reactFlowRef.current) {
        return;
      }

      saveSnapshotRef.current(
        reactFlowRef.current.getNodes() as CanvasNode[],
        reactFlowRef.current.getEdges()
      );
    },
    []
  );

  const onEdgesChange = useCallback(
    () => {
      if (!reactFlowRef.current) {
        return;
      }

      saveSnapshotRef.current(
        reactFlowRef.current.getNodes() as CanvasNode[],
        reactFlowRef.current.getEdges() as CanvasEdge[]
      );
    },
    []
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((currentEdges) =>
        addEdge(
          {
            ...connection,
            type: "smoothstep",
            animated: true,
            deletable: true,
            style: {
              stroke: "#6366f1",
              strokeWidth: 2
            }
          },
          currentEdges
        )
      );
    },
    [setEdges]
  );

  const isValidConnection = useCallback<IsValidConnection>(
    (connection) => {
      if (!connection.source || !connection.target) {
        return false;
      }

      if (connection.source === connection.target) {
        return false;
      }

      const sourceNode = reactFlowRef.current?.getNode(connection.source);
      const targetNode = reactFlowRef.current?.getNode(connection.target);

      if (!sourceNode || !targetNode) {
        return false;
      }

      if (sourceNode.type === "actionNode") {
        return false;
      }

      if (targetNode.type === "triggerNode") {
        return false;
      }

      return true;
    },
    []
  );

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();

      const nodeType = event.dataTransfer.getData(DND_NODE_TYPE_KEY);

      if (!nodeType || !reactFlowRef.current) {
        return;
      }

      const position = reactFlowRef.current.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY
      });

      const node: CanvasNode = {
        id: crypto.randomUUID(),
        type: nodeType,
        position,
        data: createNodeDefaults(nodeType)
      };

      setNodes((currentNodes) => currentNodes.concat(node));
    },
    [setNodes]
  );

  const miniMapNodeColor = useCallback((node: CanvasNode) => {
    if (node.type === "triggerNode") {
      return "#16a34a";
    }

    if (node.type === "actionNode") {
      return "#2563eb";
    }

    return "#7c3aed";
  }, []);

  const defaultViewport = useMemo(() => ({ x: 0, y: 0, zoom: 0.9 }), []);
  const showEmptyState = isReady && nodes.length === 0;

  return (
    <div className="relative flex min-h-0 flex-1 overflow-hidden bg-[#0f0f11]">
      <NodeSidebar />
      <div className="relative min-h-0 flex-1">
        <ReactFlow
          defaultNodes={initialNodes}
          defaultEdges={withAnimatedEdges(initialEdges)}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          connectionMode={ConnectionMode.Strict}
          fitView
          defaultViewport={defaultViewport}
          onInit={(instance) => {
            reactFlowRef.current = instance;
            setIsReady(true);
          }}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          onDragOver={onDragOver}
          onDrop={onDrop}
          minZoom={0.35}
          maxZoom={1.8}
          className="bg-[#0f0f11]"
          proOptions={{ hideAttribution: true }}
        >
          <MiniMap
            pannable
            zoomable
            nodeColor={miniMapNodeColor}
            className="!bottom-5 !left-5 !bg-zinc-900/95"
            maskColor="rgba(15, 15, 17, 0.45)"
          />
          <Controls
            className="!bottom-5 !right-5 !border !border-zinc-800 !bg-zinc-900/95 !shadow-xl"
            showInteractive={false}
          />
        </ReactFlow>
        {showEmptyState ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="rounded-[28px] border border-zinc-800/80 bg-zinc-950/80 px-8 py-7 text-center shadow-[0_30px_80px_-45px_rgba(0,0,0,0.95)] backdrop-blur-sm">
              <div className="flex items-center justify-center gap-3 text-cyan-300">
                <ArrowLeft className="h-5 w-5 animate-[pulse_1.8s_ease-in-out_infinite]" />
                <span className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300/80">
                  Start here
                </span>
              </div>
              <p className="mt-4 max-w-md text-xl font-semibold tracking-tight text-white">
                Drag a Trigger node from the sidebar to start your workflow
              </p>
            </div>
          </div>
        ) : null}
      </div>
      {!isReady ? (
        <div className="pointer-events-none absolute inset-0 bg-[#0f0f11]" />
      ) : null}
    </div>
  );
}

export function WorkflowCanvas(props: WorkflowCanvasProps) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
