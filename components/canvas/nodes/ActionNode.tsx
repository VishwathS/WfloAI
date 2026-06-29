"use client";

import { Handle, Position, type NodeProps, useEdges } from "reactflow";
import { AlertTriangle, CheckCircle2, Loader2, TerminalSquare } from "lucide-react";
import { useNodeExecutionState, useNodeStates } from "@/components/canvas/execution-context";
import { useNodeResize } from "@/hooks/useNodeResize";
import type { ActionNodeData } from "@/lib/types";
import { NodeOutputDisplay } from "@/components/canvas/NodeOutputDisplay";

export function ActionNode({ id, data }: NodeProps<ActionNodeData>) {
  const { containerRef, onResizePointerDown } = useNodeResize(id);
  const executionState = useNodeExecutionState(id);
  const edges = useEdges();
  const nodeStates = useNodeStates();
  const incomingEdges = edges.filter((e) => e.target === id);
  const sourceNodeId =
    incomingEdges.find((e) => nodeStates[e.source]?.status === "complete")?.source ??
    incomingEdges[0]?.source ??
    "";
  const sourceState = useNodeExecutionState(sourceNodeId);

  const isRunning = executionState.status === "running";
  const isComplete = executionState.status === "complete";
  const isError = executionState.status === "error";

  return (
    <div
      ref={containerRef}
      className={`relative flex h-full flex-col min-w-[220px] overflow-hidden rounded-2xl border bg-zinc-900 shadow-[0_20px_50px_-30px_rgba(37,99,235,0.85)] ${
        isComplete
          ? "border-emerald-400/55 shadow-[0_0_0_1px_rgba(74,222,128,0.25),0_20px_50px_-30px_rgba(34,197,94,0.8)]"
          : isError
            ? "border-rose-400/50 shadow-[0_20px_50px_-30px_rgba(244,63,94,0.85)]"
            : "border-blue-400/30"
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-blue-200 !bg-blue-500"
      />
      <div
        className={`flex flex-shrink-0 items-center gap-2 px-4 py-3 text-white ${
          isError ? "bg-rose-600" : "bg-blue-600"
        } ${isRunning ? "animate-pulse" : ""}`}
      >
        {isRunning ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isComplete ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : isError ? (
          <AlertTriangle className="h-4 w-4" />
        ) : (
          <TerminalSquare className="h-4 w-4" />
        )}
        <div>
          <p className="text-sm font-semibold">Action</p>
          <p className="text-xs text-blue-50/90">{data.label}</p>
        </div>
      </div>
      <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
          Action
        </p>
        <div className="inline-flex rounded-full border border-blue-400/30 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-200">
          {data.action}
        </div>
        {isComplete ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
              Output
            </p>
            <div className="max-h-[200px] overflow-y-auto">
              <NodeOutputDisplay output={sourceState.output ?? ""} />
            </div>
          </div>
        ) : null}
        {isError && executionState.error ? (
          <p className="text-xs leading-5 text-rose-300">{executionState.error}</p>
        ) : null}
      </div>
      <div
        className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize"
        onPointerDown={onResizePointerDown}
      />
    </div>
  );
}
