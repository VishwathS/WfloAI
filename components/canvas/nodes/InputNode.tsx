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
      className={`relative flex h-full flex-col min-w-[240px] overflow-hidden rounded-2xl border bg-zinc-900 shadow-[0_20px_50px_-30px_rgba(217,70,239,0.75)] ${
        isComplete
          ? "border-emerald-400/60 shadow-[0_0_0_1px_rgba(74,222,128,0.28),0_20px_50px_-30px_rgba(34,197,94,0.9)]"
          : isError
            ? "border-rose-400/50 shadow-[0_20px_50px_-30px_rgba(244,63,94,0.85)]"
            : "border-fuchsia-400/30"
      }`}
    >
      <div
        className={`flex flex-shrink-0 items-center gap-2 px-4 py-3 text-white ${
          isError ? "bg-rose-600" : "bg-fuchsia-600"
        } ${isRunning ? "animate-pulse" : ""}`}
      >
        {isRunning ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isComplete ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : isError ? (
          <AlertTriangle className="h-4 w-4" />
        ) : (
          <Inbox className="h-4 w-4" />
        )}
        <div>
          <p className="text-sm font-semibold">Input</p>
          <p className="text-xs text-fuchsia-50/80">Information for this workflow</p>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">Label</p>
          <input
            type="text"
            value={data.label}
            onChange={(e) => handleLabelChange(e.target.value)}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-500/30"
            placeholder="e.g. Company Name"
          />
          {data.key ? (
            <p className="font-mono text-[11px] text-fuchsia-400/80">{`{{${data.key}}}`}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">Value</p>
          <textarea
            value={data.defaultValue}
            onChange={(e) => updateData({ defaultValue: e.target.value })}
            className="flex-1 min-h-[72px] w-full resize-none rounded-xl border border-zinc-700 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-500/30"
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
