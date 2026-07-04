"use client";

import type { DragEvent } from "react";

export const DND_NODE_TYPE_KEY = "application/reactflow";

const NODE_CARDS = [
  {
    type: "inputNode",
    title: "Input",
    description: "Provide a named value that flows into your workflow steps.",
    accentClassName: "border-fuchsia-300/60 bg-fuchsia-50 text-fuchsia-700",
    borderClass: "border-fuchsia-300"
  },
  {
    type: "aiNode",
    title: "AI Node",
    description: "Transform incoming context with prompts and model-driven actions.",
    accentClassName: "border-violet-300/60 bg-violet-50 text-violet-700",
    borderClass: "border-violet-300"
  },
  {
    type: "routerNode",
    title: "Router Node",
    description: "Branch execution by deciding whether a condition is true or false.",
    accentClassName: "border-amber-300/60 bg-amber-50 text-amber-700",
    borderClass: "border-amber-300"
  },
  {
    type: "actionNode",
    title: "Action Node",
    description: "Finish the flow by saving, logging, or displaying the result.",
    accentClassName: "border-blue-300/60 bg-blue-50 text-blue-700",
    borderClass: "border-blue-300"
  },
  {
    type: "lookupNode",
    title: "Lookup Node",
    description: "Search the web via Tavily and pass results downstream.",
    accentClassName: "border-cyan-300/60 bg-cyan-50 text-cyan-700",
    borderClass: "border-cyan-300"
  }
] as const;

export function NodeSidebar() {
  function handleDragStart(event: DragEvent<HTMLButtonElement>, nodeType: string) {
    event.dataTransfer.setData(DND_NODE_TYPE_KEY, nodeType);
    event.dataTransfer.effectAllowed = "move";
  }

  return (
    <aside className="grid h-full min-h-0 w-[280px] shrink-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden border-r border-gray-200 bg-white p-4">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-600">
          Node library
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-gray-900">
          Drag into canvas
        </h2>
        <p className="mt-2 text-sm leading-6 text-gray-500">
          Compose the flow visually by dragging node types into the workspace.
        </p>
      </div>

      <div className="min-h-0 overflow-y-auto pr-2 [scrollbar-color:#d1d5db_#f9fafb] [scrollbar-width:thin]">
        <div className="space-y-3 pb-3">
          {NODE_CARDS.map((card) => (
            <button
              key={card.type}
              type="button"
              draggable
              onDragStart={(event) => handleDragStart(event, card.type)}
              className={`w-full rounded-2xl border bg-white p-4 text-left shadow-[0_1px_6px_rgba(0,0,0,0.05)] transition hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)] hover:bg-gray-50 ${card.borderClass}`}
            >
              <div
                className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${card.accentClassName}`}
              >
                {card.title}
              </div>
              <p className="mt-3 text-base font-semibold text-gray-900">{card.title}</p>
              <p className="mt-2 text-sm leading-6 text-gray-500">{card.description}</p>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
