"use client";

import { useEffect, useState } from "react";
import { Handle, Position, useReactFlow, type Node, type NodeProps } from "reactflow";
import { AlertTriangle, BrainCircuit, CheckCircle2, ChevronDown, Loader2 } from "lucide-react";
import { useIsWorkflowRunning, useNodeExecutionState } from "@/components/canvas/execution-context";
import { useNodeResize } from "@/hooks/useNodeResize";
import type { AIActionType, AINodeData } from "@/lib/types";

const ACTION_TYPES: AIActionType[] = ["Summarize", "Rewrite", "Classify", "Extract", "Generate"];

export function AINode({ id, data }: NodeProps<AINodeData>) {
  const { setNodes } = useReactFlow();
  const { containerRef, onResizePointerDown } = useNodeResize(id);
  const executionState = useNodeExecutionState(id);
  const isWorkflowRunning = useIsWorkflowRunning();
  const [isOutputOpen, setIsOutputOpen] = useState(false);

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

  const outputMode = data.outputMode ?? (data.action ? "json" : "text");

  function updateData(patch: Partial<AINodeData>) {
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? ({ ...node, data: { ...(node.data as AINodeData), ...patch } } as Node<AINodeData>)
          : node
      )
    );
  }

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
        className={`flex flex-shrink-0 items-center gap-3 px-4 py-3 text-white ${
          isError ? "bg-rose-600" : "bg-violet-600"
        } ${isRunning ? "animate-pulse" : ""}`}
      >
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
      <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
            Output Mode
          </p>
          <div className="flex overflow-hidden rounded-full border border-zinc-700 text-xs">
            <button
              type="button"
              onClick={() => updateData({ outputMode: "text" })}
              className={`px-3 py-1 transition ${
                outputMode === "text"
                  ? "bg-violet-600 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Text
            </button>
            <button
              type="button"
              onClick={() => updateData({ outputMode: "json" })}
              className={`px-3 py-1 transition ${
                outputMode === "json"
                  ? "bg-violet-600 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              JSON
            </button>
          </div>
        </div>
        {outputMode === "json" ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
              Action Type
            </p>
            <select
              value={data.action ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                updateData({ action: val ? (val as AIActionType) : undefined });
              }}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-violet-400"
            >
              <option value="">Select action…</option>
              {ACTION_TYPES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {outputMode === "json" && data.action === "Extract" ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
              Output Fields
            </p>
            <input
              type="text"
              value={(data.outputFields ?? []).join(", ")}
              onChange={(e) => {
                const nextFields = e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean);
                updateData({ outputFields: nextFields });
              }}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-violet-400"
              placeholder="name, email, phone"
            />
          </div>
        ) : null}
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">Prompt</p>
        <textarea
          value={data.prompt}
          onChange={(e) => updateData({ prompt: e.target.value })}
          className="flex-1 min-h-[120px] w-full resize-none rounded-xl border border-zinc-700 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/30"
          placeholder="Tell this AI node what to do with its incoming data."
        />
        {showOutput ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
              Output
            </p>
            <div className="min-h-[110px] whitespace-pre-wrap rounded-xl border border-zinc-700 bg-zinc-950/70 px-3 py-2 text-sm leading-6 text-zinc-200">
              {executionState.output || (isRunning ? "Streaming response…" : "")}
            </div>
          </div>
        ) : null}
        {!isWorkflowRunning && isComplete && !isOutputOpen ? (
          <button
            type="button"
            onClick={() => setIsOutputOpen(true)}
            className="flex items-center gap-1.5 self-start rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 transition hover:bg-zinc-700"
          >
            View output <ChevronDown className="h-3 w-3" />
          </button>
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
