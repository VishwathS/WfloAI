"use client";

import { Handle, Position, useReactFlow, type Node, type NodeProps } from "reactflow";
import { BrainCircuit } from "lucide-react";
import type { AINodeData } from "@/lib/types";

export function AINode({ id, data }: NodeProps<AINodeData>) {
  const { setNodes } = useReactFlow();

  return (
    <div className="min-w-[260px] overflow-hidden rounded-2xl border border-violet-400/30 bg-zinc-900 shadow-[0_20px_50px_-30px_rgba(124,58,237,0.85)]">
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-violet-200 !bg-violet-500"
      />
      <div className="flex items-center justify-between gap-3 bg-violet-600 px-4 py-3 text-white">
        <div className="flex items-center gap-2">
          <BrainCircuit className="h-4 w-4" />
          <div>
            <p className="text-sm font-semibold">AI Node</p>
            <p className="text-xs text-violet-50/90">{data.label}</p>
          </div>
        </div>
        <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-50">
          {data.action}
        </span>
      </div>
      <div className="space-y-3 px-4 py-4">
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
          className="min-h-[120px] w-full resize-none rounded-xl border border-zinc-700 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/30"
          placeholder="Tell this AI node what to do with its incoming data."
        />
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-violet-200 !bg-violet-500"
      />
    </div>
  );
}
