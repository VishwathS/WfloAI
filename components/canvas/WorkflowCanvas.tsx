"use client";

import {
  addEdge,
  Background,
  BackgroundVariant,
  ConnectionLineType,
  ConnectionMode,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdges,
  useNodes,
  useReactFlow,
  useStore,
  type Connection,
  type Edge,
  type EdgeTypes,
  type IsValidConnection,
  type Node,
  type NodeTypes,
  type ReactFlowInstance
} from "reactflow";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MutableRefObject
} from "react";
import { ArrowLeft, Hand, Minus, MousePointer2, Plus, Scan } from "lucide-react";
import "reactflow/dist/style.css";
import { TriggerNode } from "@/components/canvas/nodes/TriggerNode";
import { AINode } from "@/components/canvas/nodes/AINode";
import { RouterNode } from "@/components/canvas/nodes/RouterNode";
import { ActionNode } from "@/components/canvas/nodes/ActionNode";
import { LookupNode } from "@/components/canvas/nodes/LookupNode";
import { InputNode } from "@/components/canvas/nodes/InputNode";
import { FileInputNode } from "@/components/canvas/nodes/FileInputNode";
import { GmailNode } from "@/components/canvas/nodes/GmailNode";
import { HttpRequestNode } from "@/components/canvas/nodes/HttpRequestNode";
import { DeletableEdge } from "@/components/canvas/edges/DeletableEdge";
import { DND_NODE_TYPE_KEY, NodeSidebar } from "@/components/canvas/NodeSidebar";
import type {
  ActionNodeData,
  AINodeData,
  FileInputNodeData,
  GmailNodeData,
  HttpRequestNodeData,
  InputNodeData,
  LookupNodeData,
  RouterNodeData,
  TriggerNodeData,
  TriggerType
} from "@/lib/types";
import { labelToKey } from "@/lib/utils";

const nodeTypes: NodeTypes = {
  triggerNode: TriggerNode,
  aiNode: AINode,
  routerNode: RouterNode,
  actionNode: ActionNode,
  lookupNode: LookupNode,
  inputNode: InputNode,
  fileInputNode: FileInputNode,
  gmailNode: GmailNode,
  httpRequestNode: HttpRequestNode
};

const edgeTypes: EdgeTypes = {
  smoothstep: DeletableEdge
};

const CONNECTION_LINE_STYLE = { stroke: "#8b5cf6", strokeWidth: 1.75 } as const;

const EDGE_DEFAULTS = {
  type: "smoothstep" as const,
  animated: false,
  deletable: true,
  style: { stroke: "#8b5cf6", strokeWidth: 1.75 }
};

type CanvasNodeData =
  | TriggerNodeData
  | AINodeData
  | RouterNodeData
  | ActionNodeData
  | LookupNodeData
  | InputNodeData
  | FileInputNodeData
  | GmailNodeData
  | HttpRequestNodeData;
type CanvasNode = Node<CanvasNodeData>;
type CanvasEdge = Edge;

interface WorkflowCanvasProps {
  initialNodes: CanvasNode[];
  initialEdges: CanvasEdge[];
  onSave: (nodes: CanvasNode[], edges: CanvasEdge[]) => void;
  onCancelSave: () => void;
  getGraphRef: MutableRefObject<(() => { nodes: CanvasNode[]; edges: CanvasEdge[] }) | null>;
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
      type: triggerType
    } satisfies TriggerNodeData;
  }

  if (type === "inputNode") {
    const defaultLabel = "Input";
    return {
      label: defaultLabel,
      key: labelToKey(defaultLabel),
      defaultValue: ""
    } satisfies InputNodeData;
  }

  if (type === "fileInputNode") {
    return {
      label: "File Input"
    } satisfies FileInputNodeData;
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

  if (type === "lookupNode") {
    return {
      label: "Web search",
      query: "{{input}}",
      maxResults: 5
    } satisfies LookupNodeData;
  }

  if (type === "gmailNode") {
    return {
      label: "Gmail",
      action: "Send Email",
      to: "",
      subject: "",
      body: "",
      query: "",
      maxResults: 5
    } satisfies GmailNodeData;
  }

  if (type === "httpRequestNode") {
    return {
      label: "HTTP Request",
      method: "GET",
      url: "",
      queryParams: [],
      headers: [],
      authType: "none"
    } satisfies HttpRequestNodeData;
  }

  return {
    label: "AI step",
    outputMode: "text",
    prompt: ""
  } satisfies AINodeData;
}

// Subscribes to node/edge changes in isolation so per-edit store updates re-render only this
// null component instead of the whole canvas tree (sidebar, minimap, toolbar).
function GraphChangeSaver({
  reactFlowRef,
  isDraggingRef,
  saveSnapshotRef
}: {
  reactFlowRef: MutableRefObject<ReactFlowInstance | null>;
  isDraggingRef: MutableRefObject<boolean>;
  saveSnapshotRef: MutableRefObject<(nodes: CanvasNode[], edges: CanvasEdge[]) => void>;
}) {
  const nodes = useNodes<CanvasNodeData>();
  const edges = useEdges();
  const hasMountedRef = useRef(false);

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
  }, [nodes, edges, reactFlowRef, isDraggingRef, saveSnapshotRef]);

  return null;
}

function WorkflowCanvasInner({
  initialNodes,
  initialEdges,
  onSave,
  onCancelSave,
  getGraphRef
}: WorkflowCanvasProps) {
  const isCanvasEmpty = useStore((state) => state.nodeInternals.size === 0);
  const { setNodes, setEdges, zoomIn, zoomOut, fitView } = useReactFlow<CanvasNodeData>();
  const reactFlowRef = useRef<ReactFlowInstance | null>(null);
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

      if (
        targetNode.type === "triggerNode" ||
        targetNode.type === "inputNode" ||
        targetNode.type === "fileInputNode"
      ) {
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

    if (node.type === "inputNode") {
      return "#c026d3";
    }

    if (node.type === "fileInputNode") {
      return "#ea580c";
    }

    if (node.type === "gmailNode") {
      return "#ef4444";
    }

    if (node.type === "httpRequestNode") {
      return "#6366f1";
    }

    return "#7c3aed";
  }, []);

  const defaultViewport = useMemo(() => ({ x: 0, y: 0, zoom: 0.9 }), []);
  const showEmptyState = isReady && isCanvasEmpty;

  return (
    <div className="relative flex min-h-0 flex-1 overflow-hidden bg-gray-50">
      <GraphChangeSaver
        reactFlowRef={reactFlowRef}
        isDraggingRef={isDraggingRef}
        saveSnapshotRef={saveSnapshotRef}
      />
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
            getGraphRef.current = () => ({
              nodes: instance.getNodes() as CanvasNode[],
              edges: instance.getEdges()
            });
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
          className="bg-gray-50"
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#d4d4d8" />
          <MiniMap
            pannable
            zoomable
            nodeColor={miniMapNodeColor}
            className="!bottom-5 !right-5 !left-auto !h-[120px] !w-[180px] !rounded-xl !border !border-gray-200 !bg-gray-50"
            maskColor="rgba(249, 250, 251, 0.75)"
          />
        </ReactFlow>
        <div className="absolute left-3 top-3 z-10 flex overflow-hidden rounded-lg border border-gray-200 bg-white shadow-card">
          <button
            type="button"
            disabled
            className="flex h-8 w-8 cursor-default items-center justify-center text-gray-300"
            aria-label="Pointer tool (coming soon)"
            title="Pointer"
          >
            <MousePointer2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled
            className="flex h-8 w-8 cursor-default items-center justify-center border-l border-gray-100 text-gray-300"
            aria-label="Hand tool (coming soon)"
            title="Hand"
          >
            <Hand className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center border-l border-gray-100 text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
            onClick={() => {
              void fitView();
            }}
            aria-label="Fit view"
            title="Fit view"
          >
            <Scan className="h-4 w-4" />
          </button>
        </div>
        <div className="absolute bottom-5 right-[184px] z-10 flex overflow-hidden rounded-full border border-gray-200 bg-white shadow-card">
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center text-gray-700 transition hover:bg-gray-100"
            onClick={() => {
              void zoomIn();
            }}
            aria-label="Zoom in"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center border-l border-gray-200 text-gray-700 transition hover:bg-gray-100"
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
            <div className="rounded-xl border border-dashed border-gray-300 bg-white/80 px-8 py-7 text-center shadow-card">
              <div className="flex items-center justify-center gap-2 text-gray-400">
                <ArrowLeft className="h-4 w-4" />
                <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-500">
                  Start here
                </span>
              </div>
              <p className="mt-3 max-w-md text-base font-semibold tracking-tight text-gray-900">
                Drag an Input node from the sidebar to start your workflow
              </p>
            </div>
          </div>
        ) : null}
      </div>
      {!isReady ? (
        <div className="pointer-events-none absolute inset-0 bg-gray-50" />
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
