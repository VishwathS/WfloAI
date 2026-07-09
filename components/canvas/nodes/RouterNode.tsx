"use client";

import { Handle, Position, useReactFlow, type Node, type NodeProps } from "reactflow";
import { AlertTriangle, CheckCircle2, GitBranch, Loader2 } from "lucide-react";
import { useNodeExecutionState } from "@/components/canvas/execution-context";
import { useNodeResize } from "@/hooks/useNodeResize";
import type { RouterNodeData } from "@/lib/types";

export function RouterNode({ id, data }: NodeProps<RouterNodeData>) {
  const { setNodes } = useReactFlow();
  const { containerRef, onResizePointerDown } = useNodeResize(id);
  const executionState = useNodeExecutionState(id);
  const isRunning = executionState.status === "running";
  const isComplete = executionState.status === "complete";
  const isError = executionState.status === "error";

  return (
    <div
      ref={containerRef}
      className={`relative flex h-full flex-col min-w-[260px] overflow-hidden rounded-xl border bg-white shadow-card ${
        isComplete
          ? "border-emerald-400"
          : isError
            ? "border-rose-400"
            : "border-amber-300"
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2.5 !w-2.5 !border-2 !border-white !bg-amber-500"
      />
      <div
        className={`flex flex-shrink-0 items-center gap-3 border-b border-gray-100 px-4 py-2.5 ${isRunning ? "animate-pulse" : ""}`}
      >
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
          isError ? "bg-rose-100" : isComplete ? "bg-emerald-100" : "bg-amber-50"
        }`}>
          {isRunning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600" />
          ) : isComplete ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          ) : isError ? (
            <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
          ) : (
            <GitBranch className="h-3.5 w-3.5 text-amber-600" />
          )}
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">Router</p>
          <p className={`text-xs ${isError ? "text-rose-600" : "text-gray-500"}`}>
            {data.label}
          </p>
        </div>
      </div>
      <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400">
            Condition
          </p>
          {data.conditionField && typeof data.conditionValue === "string" ? (
            <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-medium text-cyan-700">
              Deterministic
            </span>
          ) : (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
              AI routing
            </span>
          )}
        </div>
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
          className="flex-1 min-h-[72px] w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-500/25"
          placeholder="Is this email urgent?"
        />
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400">
            JSON Condition (optional)
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={data.conditionField ?? ""}
              onChange={(event) => {
                const nextField = event.target.value;
                setNodes((nodes) =>
                  nodes.map((node) =>
                    node.id === id
                      ? ({
                          ...node,
                          data: { ...(node.data as RouterNodeData), conditionField: nextField || undefined }
                        } as Node<RouterNodeData>)
                      : node
                  )
                );
              }}
              className="w-1/2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-500/25"
              placeholder="field"
            />
            <input
              type="text"
              value={data.conditionValue ?? ""}
              onChange={(event) => {
                const nextValue = event.target.value;
                setNodes((nodes) =>
                  nodes.map((node) =>
                    node.id === id
                      ? ({
                          ...node,
                          data: { ...(node.data as RouterNodeData), conditionValue: nextValue }
                        } as Node<RouterNodeData>)
                      : node
                  )
                );
              }}
              className="w-1/2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-500/25"
              placeholder="value"
            />
          </div>
        </div>
        <div className="flex gap-2 text-[10px] font-medium uppercase tracking-[0.06em]">
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
            True
          </span>
          <span className="rounded-full bg-rose-50 px-2.5 py-1 text-rose-700">
            False
          </span>
        </div>
        {isError && executionState.error ? (
          <p className="text-xs leading-5 text-rose-600">{executionState.error}</p>
        ) : null}
      </div>
      <Handle
        id="true"
        type="source"
        position={Position.Right}
        style={{ top: "42%" }}
        className="!h-2.5 !w-2.5 !border-2 !border-white !bg-emerald-500"
      />
      <Handle
        id="false"
        type="source"
        position={Position.Right}
        style={{ top: "68%" }}
        className="!h-2.5 !w-2.5 !border-2 !border-white !bg-rose-500"
      />
      <div
        className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize"
        onPointerDown={onResizePointerDown}
      />
    </div>
  );
}
