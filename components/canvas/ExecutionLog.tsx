"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import type { Node } from "reactflow";
import { Button } from "@/components/ui/button";
import type { NodeExecutionState } from "@/lib/execution/types";
import type {
  ActionNodeData,
  AINodeData,
  FileInputNodeData,
  InputNodeData,
  LookupNodeData,
  RouterNodeData,
  TriggerNodeData
} from "@/lib/types";
import { NodeOutputDisplay, getOutputPreview } from "@/components/canvas/NodeOutputDisplay";

type WorkflowCanvasNode = Node<
  | TriggerNodeData
  | AINodeData
  | RouterNodeData
  | ActionNodeData
  | LookupNodeData
  | InputNodeData
  | FileInputNodeData
>;

interface ExecutionLogProps {
  nodes: WorkflowCanvasNode[];
  nodeStates: Record<string, NodeExecutionState>;
  isRunning: boolean;
  onClear: () => void;
  rightClass?: string;
  widthStyle?: string;
}

function formatDuration(durationMs?: number) {
  if (typeof durationMs !== "number") {
    return "--";
  }

  return `${durationMs} ms`;
}


function statusClassName(status: NodeExecutionState["status"]) {
  if (status === "complete") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "running") {
    return "border-violet-200 bg-violet-50 text-violet-700";
  }

  if (status === "error") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  return "border-gray-200 bg-gray-100 text-gray-500";
}

export function ExecutionLog({
  nodes,
  nodeStates,
  isRunning,
  onClear,
  rightClass,
  widthStyle
}: ExecutionLogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const previousIsRunningRef = useRef(isRunning);

  const entries = useMemo(() => {
    return nodes
      .map((node) => ({
        node,
        state: nodeStates[node.id]
      }))
      .filter(
        (entry): entry is { node: WorkflowCanvasNode; state: NodeExecutionState } =>
          Boolean(entry.state && entry.state.status !== "idle")
      );
  }, [nodeStates, nodes]);

  useEffect(() => {
    if (isRunning) {
      setIsOpen(true);
    } else if (previousIsRunningRef.current && !isRunning) {
      setIsOpen(false);
    } else if (entries.length === 0) {
      setIsOpen(false);
    }
    previousIsRunningRef.current = isRunning;
  }, [entries.length, isRunning]);

  useEffect(() => {
    if (!scrollContainerRef.current) {
      return;
    }

    scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
  }, [entries]);

  if (entries.length === 0 && !isRunning) {
    return null;
  }

  return (
    <div
      className={`absolute bottom-4 ${rightClass ?? "right-4"} z-20 overflow-hidden rounded-[24px] border border-gray-200 bg-white shadow-lg transition-all duration-300 ${
        isOpen ? "max-h-[320px]" : "max-h-[58px]"
      }`}
      style={{ width: widthStyle ?? "min(760px, calc(100% - 312px))" }}
    >
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-600">
            Execution log
          </p>
          <p className="mt-1 text-sm text-gray-500">
            {entries.length > 0
              ? `${entries.length} node${entries.length === 1 ? "" : "s"} recorded`
              : "No execution events yet"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-full text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            onClick={onClear}
            disabled={isRunning || entries.length === 0}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Clear
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="rounded-full text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            onClick={() => setIsOpen((currentValue) => !currentValue)}
          >
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div ref={scrollContainerRef} className="max-h-[262px] overflow-y-auto">
        {entries.length === 0 ? (
          <div className="px-4 py-5 text-sm text-gray-400">
            Run the workflow to see node-by-node output and timing here.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {entries.map(({ node, state }) => {
              const isExpanded = expandedRows[node.id] ?? false;
              const outputText = state.error ?? state.output;

              return (
                <button
                  key={node.id}
                  type="button"
                  className="w-full px-4 py-3 text-left transition hover:bg-gray-50"
                  onClick={() =>
                    setExpandedRows((currentState) => ({
                      ...currentState,
                      [node.id]: !isExpanded
                    }))
                  }
                >
                  <div className="grid gap-3 text-sm text-gray-600 md:grid-cols-[minmax(0,1.3fr)_120px_100px_minmax(0,2fr)] md:items-center">
                    <div className="font-medium text-gray-900">
                      {(
                        node.data as
                          | TriggerNodeData
                          | AINodeData
                          | RouterNodeData
                          | ActionNodeData
                      ).label}
                    </div>
                    <div>
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${statusClassName(
                          state.status
                        )}`}
                      >
                        {state.status}
                      </span>
                    </div>
                    <div className="text-gray-500">{formatDuration(state.durationMs)}</div>
                    <div className="truncate text-gray-500">{getOutputPreview(outputText, 80) || "--"}</div>
                  </div>
                  {isExpanded ? (
                    <div className="mt-3">
                      <NodeOutputDisplay output={outputText} />
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
