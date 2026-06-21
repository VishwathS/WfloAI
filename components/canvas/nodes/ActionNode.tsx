"use client";

import { Handle, Position, type NodeProps, useEdges } from "reactflow";
import { AlertTriangle, CheckCircle2, Loader2, MinusCircle, TerminalSquare } from "lucide-react";
import { useNodeExecutionState } from "@/components/canvas/execution-context";
import type { ActionNodeData } from "@/lib/types";

export function ActionNode({ id, data }: NodeProps<ActionNodeData>) {
  const executionState = useNodeExecutionState(id);
  const edges = useEdges();
  const sourceNodeId = edges.find((e) => e.target === id)?.source ?? "";
  const sourceState = useNodeExecutionState(sourceNodeId);

  const isRunning = executionState.status === "running";
  const isComplete = executionState.status === "complete";
  const isError = executionState.status === "error";
  const isSkipped = executionState.status === "skipped";

  const displayOutput = sourceState.output || "No output yet.";

  return (
    <div
      className={`min-w-[220px] overflow-hidden rounded-2xl border bg-zinc-900 shadow-[0_20px_50px_-30px_rgba(37,99,235,0.85)] ${
        isComplete
          ? "border-emerald-400/55 shadow-[0_0_0_1px_rgba(74,222,128,0.25),0_20px_50px_-30px_rgba(34,197,94,0.8)]"
          : isError
            ? "border-rose-400/50 shadow-[0_20px_50px_-30px_rgba(244,63,94,0.85)]"
            : isSkipped
              ? "border-zinc-700 shadow-none"
              : "border-blue-400/30"
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-blue-200 !bg-blue-500"
      />
      <div
        className={`flex items-center gap-2 px-4 py-3 text-white ${
          isError ? "bg-rose-600" : "bg-blue-600"
        } ${isRunning ? "animate-pulse" : ""}`}
      >
        {isRunning ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isComplete ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : isError ? (
          <AlertTriangle className="h-4 w-4" />
        ) : isSkipped ? (
          <MinusCircle className="h-4 w-4 opacity-60" />
        ) : (
          <TerminalSquare className="h-4 w-4" />
        )}
        <div>
          <p className="text-sm font-semibold">Action</p>
          <p className="text-xs text-blue-50/90">{data.label}</p>
        </div>
      </div>
      <div className="space-y-3 px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
          Action
        </p>
        <div className="inline-flex rounded-full border border-blue-400/30 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-200">
          {data.action}
        </div>
        {isComplete ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
              Output
            </p>
            <div className="min-h-[80px] whitespace-pre-wrap rounded-xl border border-zinc-700 bg-zinc-950/70 px-3 py-2 text-sm leading-6 text-zinc-200">
              {displayOutput}
            </div>
          </div>
        ) : null}
        {isError && executionState.error ? (
          <p className="text-xs leading-5 text-rose-300">{executionState.error}</p>
        ) : null}
        {isSkipped ? (
          <p className="text-xs leading-5 text-zinc-500">Skipped — branch not selected.</p>
        ) : null}
      </div>
    </div>
  );
}
