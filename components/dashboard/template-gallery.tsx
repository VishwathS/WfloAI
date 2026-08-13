"use client";

import { useState } from "react";
import { TEMPLATES } from "@/lib/templates/definitions";
import type { TemplateCategory } from "@/lib/templates/types";
import { UseTemplateButton } from "@/components/dashboard/use-template-button";

const CATEGORIES: TemplateCategory[] = Array.from(
  new Set(TEMPLATES.map((template) => template.category))
);

export function TemplateGallery() {
  const [activeCategory, setActiveCategory] = useState<TemplateCategory | "All">("All");

  const visibleTemplates =
    activeCategory === "All"
      ? TEMPLATES
      : TEMPLATES.filter((template) => template.category === activeCategory);

  return (
    <section id="templates" className="scroll-mt-6 space-y-4 lg:scroll-mt-8">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-gray-900">Templates</h2>
        <p className="mt-0.5 text-sm text-gray-500">
          Start faster with a pre-built workflow — clone one and make it yours.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["All", ...CATEGORIES] as const).map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => setActiveCategory(category)}
            className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
              activeCategory === category
                ? "bg-violet-600 text-white"
                : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visibleTemplates.map((template) => (
          <div
            key={template.id}
            className="flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-card transition-colors hover:border-gray-300"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">
                {template.category}
              </span>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                {template.complexity}
              </span>
            </div>
            <p className="mt-3 text-sm font-semibold text-gray-900">{template.name}</p>
            <p className="mt-1 flex-1 text-sm leading-relaxed text-gray-500">
              {template.description}
            </p>
            <div className="mt-4">
              <UseTemplateButton template={template} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
