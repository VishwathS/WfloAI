"use client";

import { memo } from "react";
import { Handle, Position, useReactFlow, type Node, type NodeProps } from "reactflow";
import { AlertTriangle, CheckCircle2, Loader2, Search } from "lucide-react";
import { useNodeExecutionState } from "@/components/canvas/execution-context";
import { useBufferedField } from "@/hooks/useBufferedField";
import { useNodeResize } from "@/hooks/useNodeResize";
import type { LookupNodeData } from "@/lib/types";

export const LookupNode = memo(function LookupNode({ id, data }: NodeProps<LookupNodeData>) {
  const { setNodes } = useReactFlow();
  const { containerRef, onResizePointerDown } = useNodeResize(id);
  const executionState = useNodeExecutionState(id);
  const isRunning = executionState.status === "running";
  const isComplete = executionState.status === "complete";
  const isError = executionState.status === "error";

  const queryField = useBufferedField(data.query, (query) =>
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? ({ ...node, data: { ...(node.data as LookupNodeData), query } } as Node<LookupNodeData>)
          : node
      )
    )
  );

  return (
    <div
      ref={containerRef}
      className={`relative flex h-full flex-col min-w-[260px] overflow-hidden rounded-xl border bg-white shadow-card ${
        isComplete
          ? "border-emerald-400"
          : isError
            ? "border-rose-400"
            : "border-cyan-300"
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2.5 !w-2.5 !border-2 !border-white !bg-cyan-500"
      />
      <div
        className={`flex flex-shrink-0 items-center justify-between gap-3 border-b border-gray-100 px-4 py-2.5 ${isRunning ? "animate-pulse" : ""}`}
      >
        <div className="flex items-center gap-3">
          <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
            isError ? "bg-rose-100" : isComplete ? "bg-emerald-100" : "bg-cyan-50"
          }`}>
            {isRunning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-600" />
            ) : isComplete ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            ) : isError ? (
              <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
            ) : (
              <Search className="h-3.5 w-3.5 text-cyan-600" />
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Lookup Node</p>
            <p className={`text-xs ${isError ? "text-rose-600" : "text-gray-500"}`}>
              {data.label}
            </p>
          </div>
        </div>
        <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] text-cyan-700">
          Web Search
        </span>
      </div>
      <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto px-4 py-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400">
          Query
        </p>
        <textarea
          value={queryField.value}
          onChange={queryField.onChange}
          onFocus={queryField.onFocus}
          onBlur={queryField.onBlur}
          className="flex-1 min-h-[80px] w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/25"
          placeholder="{{input}} or e.g. Latest AI coding tools"
        />
        <div className="flex items-center gap-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400">
            Max Results
          </p>
          <input
            type="number"
            min={1}
            max={10}
            value={data.maxResults}
            onChange={(event) => {
              const nextMax = Math.min(10, Math.max(1, Number(event.target.value)));
              setNodes((nodes) =>
                nodes.map((node) =>
                  node.id === id
                    ? ({
                        ...node,
                        data: {
                          ...(node.data as LookupNodeData),
                          maxResults: nextMax
                        }
                      } as Node<LookupNodeData>)
                    : node
                )
              );
            }}
            className="w-16 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-sm text-gray-900 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/25"
          />
        </div>
        {isRunning ? (
          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400">
              Results
            </p>
            <div className="min-h-[110px] whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm leading-6 text-gray-700">
              {executionState.output || "Searching..."}
            </div>
          </div>
        ) : null}
        {isError && executionState.error ? (
          <p className="text-xs leading-5 text-rose-600">{executionState.error}</p>
        ) : null}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2.5 !w-2.5 !border-2 !border-white !bg-cyan-500"
      />
      <div
        className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize"
        onPointerDown={onResizePointerDown}
      />
    </div>
  );
});
