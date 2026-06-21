"use client";

import type { DragEvent } from "react";

export const DND_NODE_TYPE_KEY = "application/reactflow";

const NODE_CARDS = [
  {
    type: "triggerNode",
    title: "Trigger Node",
    description: "Start a workflow from a manual event, webhook, or upload.",
    accentClassName: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
  },
  {
    type: "aiNode",
    title: "AI Node",
    description: "Transform incoming context with prompts and model-driven actions.",
    accentClassName: "border-violet-400/30 bg-violet-500/10 text-violet-200"
  },
  {
    type: "routerNode",
    title: "Router Node",
    description: "Branch execution by deciding whether a condition is true or false.",
    accentClassName: "border-amber-400/30 bg-amber-500/10 text-amber-200"
  },
  {
    type: "actionNode",
    title: "Action Node",
    description: "Finish the flow by saving, logging, or displaying the result.",
    accentClassName: "border-blue-400/30 bg-blue-500/10 text-blue-200"
  }
] as const;

export function NodeSidebar() {
  function handleDragStart(event: DragEvent<HTMLButtonElement>, nodeType: string) {
    event.dataTransfer.setData(DND_NODE_TYPE_KEY, nodeType);
    event.dataTransfer.effectAllowed = "move";
  }

  return (
    <aside className="grid h-full min-h-0 w-[280px] shrink-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden border-r border-zinc-800 bg-zinc-950/90 p-4">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-400/80">
          Node library
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
          Drag into canvas
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          Compose the flow visually by dragging node types into the workspace.
        </p>
      </div>

      <div className="min-h-0 overflow-y-auto pr-2 [scrollbar-color:#52525b_#18181b] [scrollbar-width:thin]">
        <div className="space-y-3 pb-3">
          {NODE_CARDS.map((card) => (
            <button
              key={card.type}
              type="button"
              draggable
              onDragStart={(event) => handleDragStart(event, card.type)}
              className="w-full rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-left transition hover:border-zinc-700 hover:bg-zinc-900/80"
            >
              <div
                className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${card.accentClassName}`}
              >
                {card.title}
              </div>
              <p className="mt-3 text-base font-semibold text-white">{card.title}</p>
              <p className="mt-2 text-sm leading-6 text-zinc-400">{card.description}</p>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
