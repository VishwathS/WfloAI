"use client";

import { Handle, Position, useReactFlow, type Node, type NodeProps } from "reactflow";
import { AlertTriangle, BrainCircuit, CheckCircle2, Loader2 } from "lucide-react";
import { useNodeExecutionState } from "@/components/canvas/execution-context";
import { useNodeResize } from "@/hooks/useNodeResize";
import type { AINodeData } from "@/lib/types";

export function AINode({ id, data }: NodeProps<AINodeData>) {
  const { setNodes } = useReactFlow();
  const { containerRef, onResizePointerDown } = useNodeResize(id);
  const executionState = useNodeExecutionState(id);
  const isRunning = executionState.status === "running";
  const isComplete = executionState.status === "complete";
  const isError = executionState.status === "error";

  return (
    <div
      ref={containerRef}
      className={`relative flex h-full flex-col min-w-[260px] overflow-hidden rounded-2xl border bg-zinc-900 shadow-[0_20px_50px_-30px_rgba(124,58,237,0.85)] ${
        isComplete
          ? "border-emerald-400/55 shadow-[0_0_0_1px_rgba(74,222,128,0.25),0_20px_50px_-30px_rgba(34,197,94,0.8)]"
          : isError
            ? "border-rose-400/50 shadow-[0_20px_50px_-30px_rgba(244,63,94,0.85)]"
            : "border-violet-400/30"
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-violet-200 !bg-violet-500"
      />
      <div
        className={`flex flex-shrink-0 items-center justify-between gap-3 px-4 py-3 text-white ${
          isError ? "bg-rose-600" : "bg-violet-600"
        } ${isRunning ? "animate-pulse" : ""}`}
      >
        <div className="flex items-center gap-2">
          {isRunning ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isComplete ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : isError ? (
            <AlertTriangle className="h-4 w-4" />
          ) : (
            <BrainCircuit className="h-4 w-4" />
          )}
          <div>
            <p className="text-sm font-semibold">AI Node</p>
            <p className="text-xs text-violet-50/90">{data.label}</p>
          </div>
        </div>
        <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-50">
          {data.action}
        </span>
      </div>
      <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
          Prompt
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
                        ...(node.data as AINodeData),
                        prompt: nextPrompt
                      }
                    } as Node<AINodeData>)
                  : node
              )
            );
          }}
          className="flex-1 min-h-[120px] w-full resize-none rounded-xl border border-zinc-700 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/30"
          placeholder="Tell this AI node what to do with its incoming data."
        />
        {isRunning ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
              Output
            </p>
            <div className="min-h-[110px] whitespace-pre-wrap rounded-xl border border-zinc-700 bg-zinc-950/70 px-3 py-2 text-sm leading-6 text-zinc-200">
              {executionState.output || "Streaming response..."}
            </div>
          </div>
        ) : null}
        {isError && executionState.error ? (
          <p className="text-xs leading-5 text-rose-300">{executionState.error}</p>
        ) : null}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-violet-200 !bg-violet-500"
      />
      <div
        className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize"
        onPointerDown={onResizePointerDown}
      />
    </div>
  );
}
