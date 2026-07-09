"use client";

import { useState, type DragEvent } from "react";
import { Search } from "lucide-react";

export const DND_NODE_TYPE_KEY = "application/reactflow";

const NODE_CATEGORIES = ["Sources", "AI", "Logic", "Actions"] as const;

const NODE_CARDS = [
  {
    type: "inputNode",
    category: "Sources",
    title: "Input",
    description: "Provide a named value that flows into your workflow steps.",
    accentClassName: "bg-fuchsia-50 text-fuchsia-700",
    borderClass: "border-fuchsia-200 hover:border-fuchsia-300"
  },
  {
    type: "fileInputNode",
    category: "Sources",
    title: "File Input",
    description: "Upload a document and pass its text downstream.",
    accentClassName: "bg-orange-50 text-orange-700",
    borderClass: "border-orange-200 hover:border-orange-300"
  },
  {
    type: "lookupNode",
    category: "Sources",
    title: "Lookup Node",
    description: "Search the web via Tavily and pass results downstream.",
    accentClassName: "bg-cyan-50 text-cyan-700",
    borderClass: "border-cyan-200 hover:border-cyan-300"
  },
  {
    type: "aiNode",
    category: "AI",
    title: "AI Node",
    description: "Transform incoming context with prompts and model-driven actions.",
    accentClassName: "bg-violet-50 text-violet-700",
    borderClass: "border-violet-200 hover:border-violet-300"
  },
  {
    type: "routerNode",
    category: "Logic",
    title: "Router Node",
    description: "Branch execution by deciding whether a condition is true or false.",
    accentClassName: "bg-amber-50 text-amber-700",
    borderClass: "border-amber-200 hover:border-amber-300"
  },
  {
    type: "actionNode",
    category: "Actions",
    title: "Action Node",
    description: "Finish the flow by saving, logging, or displaying the result.",
    accentClassName: "bg-blue-50 text-blue-700",
    borderClass: "border-blue-200 hover:border-blue-300"
  }
] as const;

export function NodeSidebar() {
  const [query, setQuery] = useState("");

  function handleDragStart(event: DragEvent<HTMLButtonElement>, nodeType: string) {
    event.dataTransfer.setData(DND_NODE_TYPE_KEY, nodeType);
    event.dataTransfer.effectAllowed = "move";
  }

  const normalizedQuery = query.trim().toLowerCase();
  const visibleCards = normalizedQuery
    ? NODE_CARDS.filter(
        (card) =>
          card.title.toLowerCase().includes(normalizedQuery) ||
          card.description.toLowerCase().includes(normalizedQuery)
      )
    : NODE_CARDS;
  const visibleCategories = NODE_CATEGORIES.filter((category) =>
    visibleCards.some((card) => card.category === category)
  );

  return (
    <aside className="grid h-full min-h-0 w-[280px] shrink-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden border-r border-gray-200 bg-white p-3.5">
      <div className="mb-4 space-y-2.5">
        <h2 className="text-sm font-semibold text-gray-900">Add nodes</h2>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-3 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/25"
            placeholder="Search..."
            aria-label="Search nodes"
          />
        </div>
      </div>

      <div className="min-h-0 overflow-y-auto pr-2 [scrollbar-color:#d1d5db_#f9fafb] [scrollbar-width:thin]">
        <div className="space-y-5 pb-3">
          {visibleCategories.length === 0 ? (
            <p className="px-1 text-sm text-gray-500">No matching nodes.</p>
          ) : null}
          {visibleCategories.map((category) => (
            <div key={category} className="space-y-2.5">
              <p className="text-xs font-medium text-gray-500">
                {category}
              </p>
              {visibleCards.filter((card) => card.category === category).map((card) => (
                <button
                  key={card.type}
                  type="button"
                  draggable
                  onDragStart={(event) => handleDragStart(event, card.type)}
                  className={`w-full rounded-xl border bg-white p-3.5 text-left shadow-card transition-colors ${card.borderClass}`}
                >
                  <div
                    className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${card.accentClassName}`}
                  >
                    {card.title}
                  </div>
                  <p className="mt-2.5 text-sm font-semibold text-gray-900">{card.title}</p>
                  <p className="mt-1.5 text-sm leading-6 text-gray-500">{card.description}</p>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
