"use client";

import { Handle, Position, useReactFlow, type Node, type NodeProps } from "reactflow";
import { AlertTriangle, CheckCircle2, GitBranch, Loader2, MinusCircle } from "lucide-react";
import { useNodeExecutionState } from "@/components/canvas/execution-context";
import type { RouterNodeData } from "@/lib/types";

export function RouterNode({ id, data }: NodeProps<RouterNodeData>) {
  const { setNodes } = useReactFlow();
  const executionState = useNodeExecutionState(id);
  const isRunning = executionState.status === "running";
  const isComplete = executionState.status === "complete";
  const isError = executionState.status === "error";
  const isSkipped = executionState.status === "skipped";

  return (
    <div
      className={`min-w-[260px] overflow-hidden rounded-2xl border bg-zinc-900 shadow-[0_20px_50px_-30px_rgba(217,119,6,0.9)] ${
        isComplete
          ? "border-emerald-400/55 shadow-[0_0_0_1px_rgba(74,222,128,0.25),0_20px_50px_-30px_rgba(34,197,94,0.8)]"
          : isError
            ? "border-rose-400/50 shadow-[0_20px_50px_-30px_rgba(244,63,94,0.85)]"
            : isSkipped
              ? "border-zinc-700 shadow-none"
              : "border-amber-400/30"
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-amber-200 !bg-amber-500"
      />
      <div
        className={`flex items-center gap-2 px-4 py-3 text-white ${
          isError ? "bg-rose-600" : "bg-amber-600"
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
          <GitBranch className="h-4 w-4" />
        )}
        <div>
          <p className="text-sm font-semibold">Router</p>
          <p className="text-xs text-amber-50/90">{data.label}</p>
        </div>
      </div>
      <div className="space-y-3 px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
          Condition
        </p>
        <textarea
          value={data.prompt}
          onChange={(event) => {
            const nextPrompt = event.target.value;

            setNodes((nodes) =>
              nodes.map((node) =>
                node.id === id
                  ? ({
                      ...node,
                      data: {
                        ...(node.data as RouterNodeData),
                        prompt: nextPrompt
                      }
                    } as Node<RouterNodeData>)
                  : node
              )
            );
          }}
          className="min-h-[96px] w-full resize-none rounded-xl border border-zinc-700 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-amber-400 focus:ring-2 focus:ring-amber-500/30"
          placeholder="Is this email urgent?"
        />
        <div className="flex gap-2 text-[11px] font-semibold uppercase tracking-[0.18em]">
          <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-emerald-200">
            True
          </span>
          <span className="rounded-full border border-rose-400/30 bg-rose-500/10 px-2.5 py-1 text-rose-200">
            False
          </span>
        </div>
        {isError && executionState.error ? (
          <p className="text-xs leading-5 text-rose-300">{executionState.error}</p>
        ) : null}
        {isSkipped ? (
          <p className="text-xs leading-5 text-zinc-500">Skipped — branch not selected.</p>
        ) : null}
      </div>
      <Handle
        id="true"
        type="source"
        position={Position.Right}
        style={{ top: "42%" }}
        className="!h-3 !w-3 !border-2 !border-emerald-200 !bg-emerald-500"
      />
      <Handle
        id="false"
        type="source"
        position={Position.Right}
        style={{ top: "68%" }}
        className="!h-3 !w-3 !border-2 !border-rose-200 !bg-rose-500"
      />
    </div>
  );
}
