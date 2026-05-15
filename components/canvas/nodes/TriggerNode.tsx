"use client";

import { Handle, Position, type NodeProps } from "reactflow";
import { Zap } from "lucide-react";
import type { TriggerNodeData } from "@/lib/types";

export function TriggerNode({ data }: NodeProps<TriggerNodeData>) {
  return (
    <div className="min-w-[220px] overflow-hidden rounded-2xl border border-emerald-400/30 bg-zinc-900 shadow-[0_20px_50px_-30px_rgba(22,163,74,0.75)]">
      <div className="flex items-center gap-2 bg-emerald-600 px-4 py-3 text-white">
        <Zap className="h-4 w-4" />
        <div>
          <p className="text-sm font-semibold">Trigger</p>
          <p className="text-xs text-emerald-50/90">{data.label}</p>
        </div>
      </div>
      <div className="space-y-2 px-4 py-4 text-sm text-zinc-200">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
          Type
        </p>
        <div className="inline-flex rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200">
          {data.type}
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-emerald-200 !bg-emerald-500"
      />
    </div>
  );
}
