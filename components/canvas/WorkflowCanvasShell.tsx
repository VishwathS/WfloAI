"use client";

import { useEffect, useRef, useState } from "react";
import type { Edge, Node } from "reactflow";
import { CanvasToolbar, type TriggerSummary } from "@/components/canvas/CanvasToolbar";
import { ExecutionLog } from "@/components/canvas/ExecutionLog";
import { RunHistorySidebar } from "@/components/canvas/RunHistorySidebar";
import { WorkflowSettingsSidebar } from "@/components/canvas/WorkflowSettingsSidebar";
import { WorkflowCanvas } from "@/components/canvas/WorkflowCanvas";
import { ExecutionProvider } from "@/components/canvas/execution-context";
import { flushAllBufferedFields } from "@/hooks/useBufferedField";
import { useExecution } from "@/hooks/useExecution";
import type {
  ActionNodeData,
  AINodeData,
  FileInputNodeData,
  InputNodeData,
  LookupNodeData,
  RouterNodeData,
  TriggerNodeData
} from "@/lib/types";
import { cn } from "@/lib/utils";

type CanvasNode = Node<
  | TriggerNodeData
  | AINodeData
  | RouterNodeData
  | ActionNodeData
  | LookupNodeData
  | InputNodeData
  | FileInputNodeData
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

export function WorkflowCanvasShell({
  workflowId,
  workflowName,
  initialNodes,
  initialEdges
}: WorkflowCanvasShellProps) {
  const [draftNodes, setDraftNodes] = useState(() => sanitizeNodes(initialNodes));
  const [draftEdges, setDraftEdges] = useState(initialEdges);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isExecutionCleared, setIsExecutionCleared] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [triggerSummary, setTriggerSummary] = useState<TriggerSummary>({
    enabledCount: 0,
    nextRunAt: null
  });
  const [runRefreshTrigger, setRunRefreshTrigger] = useState(0);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const getGraphRef = useRef<(() => { nodes: CanvasNode[]; edges: CanvasEdge[] }) | null>(null);
  const { run, isRunning, isRunSettled, nodeStates, runError } = useExecution(
    workflowId,
    draftNodes,
    draftEdges,
    () => setRunRefreshTrigger((n) => n + 1)
  );

  const visibleNodeStates = isExecutionCleared ? {} : nodeStates;

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    fetch(`/api/workflows/${workflowId}/schedules`)
      .then((res) => res.json())
      .then((data: { schedules?: { enabled: boolean; next_run_at: string | null }[] }) => {
        const schedules = data.schedules ?? [];
        const nextRunAt =
          schedules
            .filter((s) => s.enabled && s.next_run_at)
            .map((s) => s.next_run_at as string)
            .sort()[0] ?? null;
        setTriggerSummary({
          enabledCount: schedules.filter((s) => s.enabled).length,
          nextRunAt
        });
      })
      .catch(() => {
        // toolbar pill falls back to "No triggers"
      });
  }, [workflowId]);

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

      if (!saveTimeoutRef.current) {
        setHasUnsavedChanges(false);
      }
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
    setIsExecutionCleared(false);
    setHasUnsavedChanges(true);

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      void persistGraph(cleanNodes, edges);
    }, 700);
  }

  // Buffered field edits and the debounced save may both be in flight; commit the
  // buffers into the React Flow store, then persist straight from the store so
  // Run/Save never act on a stale graph.
  async function flushAndPersist() {
    flushAllBufferedFields();
    cancelPendingSave();

    const graph = getGraphRef.current?.();
    if (!graph) {
      return null;
    }

    const cleanGraph = { nodes: sanitizeNodes(graph.nodes), edges: graph.edges };
    await persistGraph(cleanGraph.nodes, cleanGraph.edges);
    return cleanGraph;
  }

  function handleManualSave() {
    void flushAndPersist();
  }

  async function handleRun() {
    setIsExecutionCleared(false);

    // The execute endpoint runs the persisted graph; run() also validates the
    // fresh graph rather than a stale render's nodes.
    const graph = await flushAndPersist();

    void run(graph ?? undefined);
  }

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden border border-gray-200 bg-white shadow-card",
        isFullscreen
          ? "fixed inset-0 z-50 rounded-none border-none shadow-none !mt-0"
          : "flex-1 min-h-0 rounded-xl"
      )}
    >
      <CanvasToolbar
        workflowName={workflowName}
        isSaving={isSaving}
        isRunning={isRunning}
        isFullscreen={isFullscreen}
        hasUnsavedChanges={hasUnsavedChanges}
        historyOpen={historyOpen}
        triggerSummary={triggerSummary}
        settingsOpen={settingsOpen}
        onSave={handleManualSave}
        onRun={handleRun}
        onToggleFullscreen={() => setIsFullscreen((currentValue) => !currentValue)}
        onToggleHistory={() => {
          setHistoryOpen((v) => !v);
          setSettingsOpen(false);
        }}
        onToggleSettings={() => {
          setSettingsOpen((v) => !v);
          setHistoryOpen(false);
        }}
      />
      {saveError ? (
        <div className="border-b border-rose-200 bg-rose-50 px-5 py-3 text-sm text-rose-700">
          {saveError}
        </div>
      ) : null}
      {runError ? (
        <div className="border-b border-rose-200 bg-rose-50 px-5 py-3 text-sm text-rose-700">
          {runError}
        </div>
      ) : null}
      <ExecutionProvider
        nodeStates={visibleNodeStates}
        isWorkflowRunning={isRunning}
        isRunSettled={isRunSettled}
      >
        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          <WorkflowCanvas
            initialNodes={initialNodes}
            initialEdges={initialEdges}
            onSave={scheduleSave}
            onCancelSave={cancelPendingSave}
            getGraphRef={getGraphRef}
          />
          {historyOpen ? (
            <RunHistorySidebar
              workflowId={workflowId}
              open={historyOpen}
              onClose={() => setHistoryOpen(false)}
              refreshTrigger={runRefreshTrigger}
            />
          ) : null}
          {settingsOpen ? (
            <WorkflowSettingsSidebar
              workflowId={workflowId}
              open={settingsOpen}
              onClose={() => setSettingsOpen(false)}
              onSchedulesChanged={setTriggerSummary}
            />
          ) : null}
          <ExecutionLog
            nodes={draftNodes}
            nodeStates={visibleNodeStates}
            isRunning={isRunning}
            onClear={() => setIsExecutionCleared(true)}
            rightClass={historyOpen || settingsOpen ? "right-[324px]" : "right-4"}
            widthStyle={
              historyOpen || settingsOpen
                ? "min(760px, calc(100% - 632px))"
                : "min(760px, calc(100% - 312px))"
            }
          />
        </div>
      </ExecutionProvider>
    </div>
  );
}
