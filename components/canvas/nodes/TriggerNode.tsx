"use client";

import { Handle, Position, type NodeProps } from "reactflow";
import { AlertTriangle, CheckCircle2, Loader2, Zap } from "lucide-react";
import { useNodeExecutionState } from "@/components/canvas/execution-context";
import { useNodeResize } from "@/hooks/useNodeResize";
import type { TriggerNodeData } from "@/lib/types";

export function TriggerNode({ id, data }: NodeProps<TriggerNodeData>) {
  const { containerRef, onResizePointerDown } = useNodeResize(id);
  const executionState = useNodeExecutionState(id);
  const isRunning = executionState.status === "running";
  const isComplete = executionState.status === "complete";
  const isError = executionState.status === "error";

  return (
    <div
      ref={containerRef}
      className={`relative flex h-full flex-col min-w-[220px] overflow-hidden rounded-xl border bg-white shadow-card ${
        isComplete
          ? "border-emerald-400"
          : isError
            ? "border-rose-400"
            : "border-emerald-300"
      }`}
    >
      <div
        className={`flex flex-shrink-0 items-center gap-3 border-b border-gray-100 px-4 py-2.5 ${isRunning ? "animate-pulse" : ""}`}
      >
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
          isError ? "bg-rose-100" : isComplete ? "bg-emerald-100" : "bg-emerald-50"
        }`}>
          {isRunning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />
          ) : isComplete ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          ) : isError ? (
            <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
          ) : (
            <Zap className="h-3.5 w-3.5 text-emerald-600" />
          )}
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">Trigger</p>
          <p className={`text-xs ${isError ? "text-rose-600" : "text-gray-500"}`}>
            {data.label}
          </p>
        </div>
      </div>
      <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto px-4 py-4">
        {isError && executionState.error ? (
          <p className="text-xs leading-5 text-rose-600">{executionState.error}</p>
        ) : null}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2.5 !w-2.5 !border-2 !border-white !bg-emerald-500"
      />
      <div
        className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize"
        onPointerDown={onResizePointerDown}
      />
    </div>
  );
}
