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
      className={`relative flex h-full flex-col min-w-[260px] overflow-hidden rounded-3xl border-2 bg-white shadow-[0_4px_20px_rgba(0,0,0,0.08)] ${
        isComplete
          ? "border-emerald-400/55"
          : isError
            ? "border-rose-400/50"
            : "border-violet-400"
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-violet-200 !bg-violet-500"
      />
      <div
        className={`flex flex-shrink-0 items-center gap-3 border-b border-gray-100 px-4 py-3 ${isRunning ? "animate-pulse" : ""}`}
      >
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          isError ? "bg-rose-100" : isComplete ? "bg-emerald-100" : "bg-violet-200"
        }`}>
          {isRunning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-600" />
          ) : isComplete ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          ) : isError ? (
            <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
          ) : (
            <BrainCircuit className="h-3.5 w-3.5 text-violet-600" />
          )}
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">AI Node</p>
          <p className={`text-xs ${isError ? "text-rose-600" : "text-violet-600"}`}>
            {data.label}
          </p>
        </div>
      </div>
      <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">
            Output Mode
          </p>
          <div className="flex overflow-hidden rounded-full border border-gray-200 text-xs">
            <button
              type="button"
              onClick={() => updateData({ outputMode: "text" })}
              className={`px-3 py-1 transition ${
                outputMode === "text"
                  ? "bg-violet-600 text-white"
                  : "text-gray-500 hover:text-gray-700"
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
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              JSON
            </button>
          </div>
        </div>
        {outputMode === "json" ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">
              Action Type
            </p>
            <select
              value={data.action ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                updateData({ action: val ? (val as AIActionType) : undefined });
              }}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none focus:border-violet-400"
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
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">
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
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none focus:border-violet-400"
              placeholder="name, email, phone"
            />
          </div>
        ) : null}
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">Prompt</p>
        <textarea
          value={data.prompt}
          onChange={(e) => updateData({ prompt: e.target.value })}
          className="flex-1 min-h-[120px] w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
          placeholder="Tell this AI node what to do with its incoming data."
        />
        {showOutput ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">
              Output
            </p>
            <div className="min-h-[110px] whitespace-pre-wrap rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm leading-6 text-gray-700">
              {executionState.output || (isRunning ? "Streaming response…" : "")}
            </div>
          </div>
        ) : null}
        {!isWorkflowRunning && !isRunning && !isError && executionState.output && !isOutputOpen ? (
          <button
            type="button"
            onClick={() => setIsOutputOpen(true)}
            className="flex items-center gap-1.5 self-start rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 transition hover:bg-gray-50"
          >
            View output <ChevronDown className="h-3 w-3" />
          </button>
        ) : null}
        {isError && executionState.error ? (
          <p className="text-xs leading-5 text-rose-600">{executionState.error}</p>
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
