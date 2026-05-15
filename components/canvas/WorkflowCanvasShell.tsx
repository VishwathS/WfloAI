"use client";

import { useEffect, useRef, useState } from "react";
import type { Edge, Node } from "reactflow";
import { CanvasToolbar } from "@/components/canvas/CanvasToolbar";
import { WorkflowCanvas } from "@/components/canvas/WorkflowCanvas";
import type { ActionNodeData, AINodeData, TriggerNodeData } from "@/lib/types";

type CanvasNode = Node<TriggerNodeData | AINodeData | ActionNodeData>;
type CanvasEdge = Edge;

interface WorkflowCanvasShellProps {
  workflowId: string;
  workflowName: string;
  initialNodes: CanvasNode[];
  initialEdges: CanvasEdge[];
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
  const [draftNodes, setDraftNodes] = useState(initialNodes);
  const [draftEdges, setDraftEdges] = useState(initialEdges);
  const [savedNodes, setSavedNodes] = useState(initialNodes);
  const [savedEdges, setSavedEdges] = useState(initialEdges);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestGraphRef = useRef({
    nodes: initialNodes,
    edges: initialEdges
  });

  const hasUnsavedChanges = !areGraphsEqual(draftNodes, draftEdges, savedNodes, savedEdges);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

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

  function scheduleSave(nodes: CanvasNode[], edges: CanvasEdge[]) {
    setDraftNodes(nodes);
    setDraftEdges(edges);
    latestGraphRef.current = { nodes, edges };

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      void persistGraph(nodes, edges);
    }, 700);
  }

  function handleManualSave() {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    void persistGraph(latestGraphRef.current.nodes, latestGraphRef.current.edges);
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] min-h-[760px] flex-col overflow-hidden rounded-[30px] border border-zinc-800 bg-[#0f0f11] shadow-[0_28px_80px_-40px_rgba(0,0,0,0.9)]">
      <CanvasToolbar
        workflowName={workflowName}
        isSaving={isSaving}
        hasUnsavedChanges={hasUnsavedChanges}
        onSave={handleManualSave}
      />
      {saveError ? (
        <div className="border-b border-rose-500/20 bg-rose-500/10 px-5 py-3 text-sm text-rose-200">
          {saveError}
        </div>
      ) : null}
      <WorkflowCanvas
        initialNodes={initialNodes}
        initialEdges={initialEdges}
        onSave={scheduleSave}
      />
    </div>
  );
}
