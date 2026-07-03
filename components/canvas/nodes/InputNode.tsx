"use client";

import { Handle, Position, useReactFlow, type Node, type NodeProps } from "reactflow";
import { AlertTriangle, CheckCircle2, Inbox, Loader2 } from "lucide-react";
import { useNodeExecutionState } from "@/components/canvas/execution-context";
import { useNodeResize } from "@/hooks/useNodeResize";
import type { InputNodeData } from "@/lib/types";
import { labelToKey } from "@/lib/utils";

export function InputNode({ id, data }: NodeProps<InputNodeData>) {
  const { setNodes } = useReactFlow();
  const { containerRef, onResizePointerDown } = useNodeResize(id);
  const executionState = useNodeExecutionState(id);
  const isRunning = executionState.status === "running";
  const isComplete = executionState.status === "complete";
  const isError = executionState.status === "error";

  function updateData(patch: Partial<InputNodeData>) {
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? ({ ...node, data: { ...(node.data as InputNodeData), ...patch } } as Node<InputNodeData>)
          : node
      )
    );
  }

  function handleLabelChange(label: string) {
    updateData({ label, key: labelToKey(label) });
  }

  return (
    <div
      ref={containerRef}
      className={`relative flex h-full flex-col min-w-[240px] overflow-hidden rounded-3xl border-2 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)] ${
        isComplete
          ? "border-emerald-400/60"
          : isError
            ? "border-rose-400/50"
            : "border-fuchsia-400"
      }`}
    >
      <div
        className={`flex flex-shrink-0 items-center gap-3 border-b border-gray-100 px-4 py-3 ${isRunning ? "animate-pulse" : ""}`}
      >
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          isError ? "bg-rose-100" : isComplete ? "bg-emerald-100" : "bg-fuchsia-100"
        }`}>
          {isRunning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-fuchsia-600" />
          ) : isComplete ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          ) : isError ? (
            <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
          ) : (
            <Inbox className="h-3.5 w-3.5 text-fuchsia-600" />
          )}
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">Input</p>
          <p className={`text-xs ${isError ? "text-rose-600" : "text-fuchsia-600"}`}>
            Information for this workflow
          </p>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">Label</p>
          <input
            type="text"
            value={data.label}
            onChange={(e) => handleLabelChange(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-500/20"
            placeholder="e.g. Company Name"
          />
          {data.key ? (
            <p className="font-mono text-[11px] text-fuchsia-400/80">{`{{${data.key}}}`}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">Value</p>
          <textarea
            value={data.defaultValue}
            onChange={(e) => updateData({ defaultValue: e.target.value })}
            className="flex-1 min-h-[72px] w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-500/20"
            placeholder="Paste or type anything this workflow needs…"
          />
        </div>

        {isError && executionState.error ? (
          <p className="text-xs leading-5 text-rose-300">{executionState.error}</p>
        ) : null}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-fuchsia-200 !bg-fuchsia-500"
      />
      <div
        className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize"
        onPointerDown={onResizePointerDown}
      />
    </div>
  );
}
