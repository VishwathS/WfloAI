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
      className="flex w-full items-center justify-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700 transition-colors hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {isPending ? "Creating..." : "Use template"}
    </button>
  );
}
