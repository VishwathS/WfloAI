"use client";

import { Handle, Position, type NodeProps } from "reactflow";
import { TerminalSquare } from "lucide-react";
import type { ActionNodeData } from "@/lib/types";

export function ActionNode({ data }: NodeProps<ActionNodeData>) {
  return (
    <div className="min-w-[220px] overflow-hidden rounded-2xl border border-blue-400/30 bg-zinc-900 shadow-[0_20px_50px_-30px_rgba(37,99,235,0.85)]">
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-blue-200 !bg-blue-500"
      />
      <div className="flex items-center gap-2 bg-blue-600 px-4 py-3 text-white">
        <TerminalSquare className="h-4 w-4" />
        <div>
          <p className="text-sm font-semibold">Action</p>
          <p className="text-xs text-blue-50/90">{data.label}</p>
        </div>
      </div>
      <div className="space-y-2 px-4 py-4 text-sm text-zinc-200">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
          Action
        </p>
        <div className="inline-flex rounded-full border border-blue-400/30 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-200">
          {data.action}
        </div>
      </div>
    </div>
  );
}
