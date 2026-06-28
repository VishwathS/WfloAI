"use client";

import { useEffect, useRef, useState } from "react";
import type { Edge, Node } from "reactflow";
import { CanvasToolbar } from "@/components/canvas/CanvasToolbar";
import { ExecutionLog } from "@/components/canvas/ExecutionLog";
import { RunHistorySidebar } from "@/components/canvas/RunHistorySidebar";
import { WorkflowCanvas } from "@/components/canvas/WorkflowCanvas";
import { ExecutionProvider } from "@/components/canvas/execution-context";
import { useExecution } from "@/hooks/useExecution";
import type {
  ActionNodeData,
  AINodeData,
  LookupNodeData,
  RouterNodeData,
  TriggerNodeData
} from "@/lib/types";
import { cn } from "@/lib/utils";

type CanvasNode = Node<
  TriggerNodeData | AINodeData | RouterNodeData | ActionNodeData | LookupNodeData
>;
type CanvasEdge = Edge;

interface WorkflowCanvasShellProps {
  workflowId: string;
  workflowName: string;
  initialNodes: CanvasNode[];
  initialEdges: CanvasEdge[];
}

function sanitizeNodes(nodes: CanvasNode[]): CanvasNode[] {
  return nodes.map(({
    dragging: _dragging,
    selected: _selected,
    positionAbsolute: _positionAbsolute,
    width: _width,
    height: _height,
    ...rest
  }) => rest as CanvasNode);
}

function areGraphsEqual(
  leftNodes: CanvasNode[],
  leftEdges: CanvasEdge[],
  rightNodes: CanvasNode[],
  rightEdges: CanvasEdge[]
) {
  return (
    JSON.stringify(leftNodes) === JSON.stringify(rightNodes) &&
    JSON.stringify(leftEdges) === JSON.stringify(rightEdges)
  );
}

export function WorkflowCanvasShell({
  workflowId,
  workflowName,
  initialNodes,
  initialEdges
}: WorkflowCanvasShellProps) {
  const [draftNodes, setDraftNodes] = useState(() => sanitizeNodes(initialNodes));
  const [draftEdges, setDraftEdges] = useState(initialEdges);
  const [savedNodes, setSavedNodes] = useState(() => sanitizeNodes(initialNodes));
  const [savedEdges, setSavedEdges] = useState(initialEdges);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isExecutionCleared, setIsExecutionCleared] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [runRefreshTrigger, setRunRefreshTrigger] = useState(0);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestGraphRef = useRef({
    nodes: sanitizeNodes(initialNodes),
    edges: initialEdges
  });
  const { run, isRunning, nodeStates, runError } = useExecution(
    workflowId,
    draftNodes,
    draftEdges,
    () => setRunRefreshTrigger((n) => n + 1)
  );

  const hasUnsavedChanges = !areGraphsEqual(draftNodes, draftEdges, savedNodes, savedEdges);
  const visibleNodeStates = isExecutionCleared ? {} : nodeStates;

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isFullscreen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const previousBackground = document.body.style.background;
    const previousBackgroundImage = document.body.style.backgroundImage;
    document.body.style.overflow = "hidden";
    document.body.style.background = "#0f0f11";
    document.body.style.backgroundImage = "none";

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.background = previousBackground;
      document.body.style.backgroundImage = previousBackgroundImage;
    };
  }, [isFullscreen]);

  async function persistGraph(nodes: CanvasNode[], edges: CanvasEdge[]) {
    setIsSaving(true);
    setSaveError(null);

    try {
      const response = await fetch(`/api/workflows/${workflowId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          graph: {
            nodes,
            edges
          }
        })
      });

      if (!response.ok) {
        throw new Error("Failed to save workflow graph.");
      }

      latestGraphRef.current = { nodes, edges };
      setSavedNodes(nodes);
      setSavedEdges(edges);
    } catch {
      setSaveError("Unable to save the latest canvas changes.");
    } finally {
      setIsSaving(false);
    }
  }

  function cancelPendingSave() {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
  }

  function scheduleSave(nodes: CanvasNode[], edges: CanvasEdge[]) {
    const cleanNodes = sanitizeNodes(nodes);
    setDraftNodes(cleanNodes);
    setDraftEdges(edges);
    latestGraphRef.current = { nodes: cleanNodes, edges };
    setIsExecutionCleared(false);

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      void persistGraph(cleanNodes, edges);
    }, 700);
  }

  function handleManualSave() {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    void persistGraph(latestGraphRef.current.nodes, latestGraphRef.current.edges);
  }

  function handleRun() {
    setIsExecutionCleared(false);
    void run();
  }

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden border border-zinc-800 bg-[#0f0f11] shadow-[0_28px_80px_-40px_rgba(0,0,0,0.9)]",
        isFullscreen
          ? "fixed inset-0 z-50 rounded-none border-none shadow-none !mt-0"
          : "h-[calc(100vh-8rem)] min-h-[760px] rounded-[30px]"
      )}
    >
      <CanvasToolbar
        workflowName={workflowName}
        isSaving={isSaving}
        isRunning={isRunning}
        isFullscreen={isFullscreen}
        hasUnsavedChanges={hasUnsavedChanges}
        historyOpen={historyOpen}
        onSave={handleManualSave}
        onRun={handleRun}
        onToggleFullscreen={() => setIsFullscreen((currentValue) => !currentValue)}
        onToggleHistory={() => setHistoryOpen((v) => !v)}
      />
      {saveError ? (
        <div className="border-b border-rose-500/20 bg-rose-500/10 px-5 py-3 text-sm text-rose-200">
          {saveError}
        </div>
      ) : null}
      {runError ? (
        <div className="border-b border-rose-500/20 bg-rose-500/10 px-5 py-3 text-sm text-rose-200">
          {runError}
        </div>
      ) : null}
      <ExecutionProvider nodeStates={visibleNodeStates}>
        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          <WorkflowCanvas
            initialNodes={initialNodes}
            initialEdges={initialEdges}
            onSave={scheduleSave}
            onCancelSave={cancelPendingSave}
          />
          {historyOpen ? (
            <RunHistorySidebar
              workflowId={workflowId}
              open={historyOpen}
              onClose={() => setHistoryOpen(false)}
              refreshTrigger={runRefreshTrigger}
            />
          ) : null}
          <ExecutionLog
            nodes={draftNodes}
            nodeStates={visibleNodeStates}
            isRunning={isRunning}
            onClear={() => setIsExecutionCleared(true)}
            rightClass={historyOpen ? "right-[324px]" : "right-4"}
            widthStyle={
              historyOpen
                ? "min(760px, calc(100% - 632px))"
                : "min(760px, calc(100% - 312px))"
            }
          />
        </div>
      </ExecutionProvider>
    </div>
  );
}
