"use client";

import { useEffect, useRef, useState } from "react";
import type { Edge, Node } from "reactflow";
import { CanvasToolbar, type TriggerSummary } from "@/components/canvas/CanvasToolbar";
import { ExecutionLog } from "@/components/canvas/ExecutionLog";
import { RunHistorySidebar } from "@/components/canvas/RunHistorySidebar";
import { WorkflowSettingsSidebar } from "@/components/canvas/WorkflowSettingsSidebar";
import { WorkflowCanvas } from "@/components/canvas/WorkflowCanvas";
import { ExecutionProvider } from "@/components/canvas/execution-context";
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [triggerSummary, setTriggerSummary] = useState<TriggerSummary>({
    enabledCount: 0,
    nextRunAt: null
  });
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
        "flex flex-col overflow-hidden border border-gray-300 bg-white shadow-[0_4px_24px_rgba(0,0,0,0.07)]",
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
      <ExecutionProvider nodeStates={visibleNodeStates} isWorkflowRunning={isRunning}>
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
