"use client";

import { useEffect, useState } from "react";
import { Handle, Position, type NodeProps, useEdges } from "reactflow";
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, TerminalSquare } from "lucide-react";
import { useIsWorkflowRunning, useNodeExecutionState, useNodeStates } from "@/components/canvas/execution-context";
import { useNodeResize } from "@/hooks/useNodeResize";
import type { ActionNodeData } from "@/lib/types";
import { NodeOutputDisplay } from "@/components/canvas/NodeOutputDisplay";

export function ActionNode({ id, data }: NodeProps<ActionNodeData>) {
  const { containerRef, onResizePointerDown } = useNodeResize(id);
  const executionState = useNodeExecutionState(id);
  const isWorkflowRunning = useIsWorkflowRunning();
  const [isOutputOpen, setIsOutputOpen] = useState(false);
  const edges = useEdges();
  const nodeStates = useNodeStates();
  const incomingEdges = edges.filter((e) => e.target === id);
  const sourceNodeId =
    incomingEdges.find((e) => nodeStates[e.source]?.status === "complete")?.source ??
    incomingEdges[0]?.source ??
    "";
  const sourceState = useNodeExecutionState(sourceNodeId);

  const status = executionState.status;
  const isRunning = status === "running";
  const isComplete = status === "complete";
  const isError = status === "error";

  useEffect(() => {
    if (status === "running") setIsOutputOpen(false);
  }, [status]);

  const showOutput =
    isRunning ||
    (status !== "idle" && isWorkflowRunning) ||
    isOutputOpen;

  return (
    <div
      ref={containerRef}
      className={`relative flex h-full flex-col min-w-[220px] overflow-hidden rounded-xl border bg-white shadow-card ${
        isComplete
          ? "border-emerald-400"
          : isError
            ? "border-rose-400"
            : "border-blue-300"
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2.5 !w-2.5 !border-2 !border-white !bg-blue-500"
      />
      <div
        className={`flex flex-shrink-0 items-center gap-3 border-b border-gray-100 px-4 py-2.5 ${isRunning ? "animate-pulse" : ""}`}
      >
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
          isError ? "bg-rose-100" : isComplete ? "bg-emerald-100" : "bg-blue-50"
        }`}>
          {isRunning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
          ) : isComplete ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          ) : isError ? (
            <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
          ) : (
            <TerminalSquare className="h-3.5 w-3.5 text-blue-600" />
          )}
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">Action</p>
          <p className={`text-xs ${isError ? "text-rose-600" : "text-gray-500"}`}>
            {data.label}
          </p>
        </div>
      </div>
      <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto px-4 py-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400">
          Action
        </p>
        <div className="inline-flex self-start rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
          {data.action}
        </div>
        {showOutput ? (
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400">
              Output
            </p>
            <div className="max-h-[200px] overflow-y-auto">
              <NodeOutputDisplay output={sourceState.output ?? ""} />
            </div>
          </div>
        ) : null}
        {!isWorkflowRunning && !isRunning && !isError && executionState.output && !isOutputOpen ? (
          <button
            type="button"
            onClick={() => setIsOutputOpen(true)}
            className="flex items-center gap-1.5 self-start rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900"
          >
            View output <ChevronDown className="h-3 w-3" />
          </button>
        ) : null}
        {isError && executionState.error ? (
          <p className="text-xs leading-5 text-rose-600">{executionState.error}</p>
        ) : null}
      </div>
      <div
        className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize"
        onPointerDown={onResizePointerDown}
      />
    </div>
  );
}
