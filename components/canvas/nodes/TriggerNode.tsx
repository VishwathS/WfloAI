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
      className={`relative flex h-full flex-col min-w-[220px] overflow-hidden rounded-2xl border bg-zinc-900 shadow-[0_20px_50px_-30px_rgba(22,163,74,0.75)] ${
        isComplete
          ? "border-emerald-400/60 shadow-[0_0_0_1px_rgba(74,222,128,0.28),0_20px_50px_-30px_rgba(34,197,94,0.9)]"
          : isError
            ? "border-rose-400/50 shadow-[0_20px_50px_-30px_rgba(244,63,94,0.85)]"
            : "border-emerald-400/30"
      }`}
    >
      <div
        className={`flex flex-shrink-0 items-center gap-2 px-4 py-3 text-white ${
          isError ? "bg-rose-600" : "bg-emerald-600"
        } ${isRunning ? "animate-pulse" : ""}`}
      >
        {isRunning ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isComplete ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : isError ? (
          <AlertTriangle className="h-4 w-4" />
        ) : (
          <Zap className="h-4 w-4" />
        )}
        <div>
          <p className="text-sm font-semibold">Trigger</p>
          <p className="text-xs text-emerald-50/90">{data.label}</p>
        </div>
      </div>
      <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto px-4 py-4">
        {isError && executionState.error ? (
          <p className="text-xs leading-5 text-rose-300">{executionState.error}</p>
        ) : null}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-emerald-200 !bg-emerald-500"
      />
      <div
        className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize"
        onPointerDown={onResizePointerDown}
      />
    </div>
  );
}
