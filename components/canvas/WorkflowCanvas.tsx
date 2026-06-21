"use client";

import {
  addEdge,
  ConnectionLineType,
  ConnectionMode,
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
import { ArrowLeft, Minus, Plus } from "lucide-react";
import "reactflow/dist/style.css";
import { TriggerNode } from "@/components/canvas/nodes/TriggerNode";
import { AINode } from "@/components/canvas/nodes/AINode";
import { RouterNode } from "@/components/canvas/nodes/RouterNode";
import { ActionNode } from "@/components/canvas/nodes/ActionNode";
import { DeletableEdge } from "@/components/canvas/edges/DeletableEdge";
import { DND_NODE_TYPE_KEY, NodeSidebar } from "@/components/canvas/NodeSidebar";
import type {
  ActionNodeData,
  AINodeData,
  AIActionType,
  RouterNodeData,
  TriggerNodeData,
  TriggerType
} from "@/lib/types";

const nodeTypes: NodeTypes = {
  triggerNode: TriggerNode,
  aiNode: AINode,
  routerNode: RouterNode,
  actionNode: ActionNode
};

const edgeTypes: EdgeTypes = {
  smoothstep: DeletableEdge
};

const CONNECTION_LINE_STYLE = { stroke: "#6366f1", strokeWidth: 2 } as const;

const EDGE_DEFAULTS = {
  type: "smoothstep" as const,
  animated: true,
  deletable: true,
  style: { stroke: "#6366f1", strokeWidth: 2 }
};

type CanvasNode = Node<TriggerNodeData | AINodeData | RouterNodeData | ActionNodeData>;
type CanvasEdge = Edge;

interface WorkflowCanvasProps {
  initialNodes: CanvasNode[];
  initialEdges: CanvasEdge[];
  onSave: (nodes: CanvasNode[], edges: CanvasEdge[]) => void;
  onCancelSave: () => void;
}

function withAnimatedEdges(edges: CanvasEdge[]) {
  return edges.map((edge) => ({
    ...edge,
    ...EDGE_DEFAULTS,
    style: {
      ...EDGE_DEFAULTS.style,
      ...(edge.style ?? {})
    }
  }));
}

function createNodeDefaults(type: string): CanvasNode["data"] {
  if (type === "triggerNode") {
    const triggerType: TriggerType = "Manual";

    return {
      label: "Workflow start",
      type: triggerType,
      inputText: ""
    } satisfies TriggerNodeData;
  }

  if (type === "actionNode") {
    return {
      label: "Save result",
      action: "Save Output"
    } satisfies ActionNodeData;
  }

  if (type === "routerNode") {
    return {
      label: "Route condition",
      prompt: "Is this email urgent?"
    } satisfies RouterNodeData;
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
  onSave,
  onCancelSave
}: WorkflowCanvasProps) {
  const nodes = useNodes<TriggerNodeData | AINodeData | RouterNodeData | ActionNodeData>();
  const edges = useEdges();
  const { setNodes, setEdges, zoomIn, zoomOut } = useReactFlow<
    TriggerNodeData | AINodeData | RouterNodeData | ActionNodeData
  >();
  const reactFlowRef = useRef<ReactFlowInstance | null>(null);
  const hasMountedRef = useRef(false);
  const isDraggingRef = useRef(false);
  const saveSnapshotRef = useRef(onSave);
  const cancelSaveRef = useRef(onCancelSave);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    saveSnapshotRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    cancelSaveRef.current = onCancelSave;
  }, [onCancelSave]);

  // Fires for node adds, deletes, edge adds/deletes — NOT used for drag (handled by onNodeDragStop).
  // useEffect is async so it always fires after onNodeDragStart sets isDraggingRef, making the
  // isDraggingRef guard reliable here. onNodesChange/onEdgesChange are intentionally NOT passed
  // to ReactFlow because they fire synchronously inside startDrag (before onNodeDragStart), which
  // would schedule a save with stale pre-drag positions and create a network race condition.
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    if (isDraggingRef.current || !reactFlowRef.current) {
      return;
    }
    saveSnapshotRef.current(
      reactFlowRef.current.getNodes() as CanvasNode[],
      reactFlowRef.current.getEdges()
    );
  }, [nodes, edges]);

  const onNodeDragStart = useCallback(
    () => {
      isDraggingRef.current = true;
      cancelSaveRef.current();
    },
    []
  );

  const onNodeDragStop = useCallback(
    () => {
      isDraggingRef.current = false;

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

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((currentEdges) =>
        addEdge({ ...connection, ...EDGE_DEFAULTS }, currentEdges)
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

    if (node.type === "routerNode") {
      return "#d97706";
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
          defaultEdgeOptions={EDGE_DEFAULTS}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          connectionMode={ConnectionMode.Strict}
          fitView
          defaultViewport={defaultViewport}
          onInit={(instance) => {
            reactFlowRef.current = instance;
            setIsReady(true);
          }}
          onNodeDragStart={onNodeDragStart}
          onNodeDragStop={onNodeDragStop}
          onConnect={onConnect}
          connectionLineType={ConnectionLineType.SmoothStep}
          connectionLineStyle={CONNECTION_LINE_STYLE}
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
            className="!bottom-5 !right-5 !left-auto !h-[120px] !w-[180px] !rounded-2xl !border !border-zinc-800 !bg-zinc-900/95"
            maskColor="rgba(15, 15, 17, 0.45)"
          />
        </ReactFlow>
        <div className="absolute bottom-5 right-[184px] z-10 flex overflow-hidden rounded-full border border-zinc-800 bg-[#1a1a1f] shadow-xl">
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center text-white transition hover:bg-zinc-700"
            onClick={() => {
              void zoomIn();
            }}
            aria-label="Zoom in"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center border-l border-zinc-800 text-white transition hover:bg-zinc-700"
            onClick={() => {
              void zoomOut();
            }}
            aria-label="Zoom out"
          >
            <Minus className="h-4 w-4" />
          </button>
        </div>
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
