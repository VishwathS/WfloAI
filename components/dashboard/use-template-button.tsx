"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { createWorkflowFromTemplate } from "@/components/dashboard/template-actions";
import type { WorkflowTemplate } from "@/lib/templates/types";

export function UseTemplateButton({ template }: { template: WorkflowTemplate }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => createWorkflowFromTemplate(template.id))}
      className="flex h-8 w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-[13px] font-medium text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {isPending ? "Creating..." : "Use template"}
    </button>
  );
}
