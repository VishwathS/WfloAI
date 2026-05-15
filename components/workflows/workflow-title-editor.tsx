"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, PencilLine } from "lucide-react";
import { Input } from "@/components/ui/input";
import { createBrowserSupabaseClient } from "@/lib/supabase";

interface WorkflowTitleEditorProps {
  workflowId: string;
  initialName: string;
}

export function WorkflowTitleEditor({
  workflowId,
  initialName
}: WorkflowTitleEditorProps) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [isPending, startTransition] = useTransition();

  function saveName(nextName: string) {
    const trimmedName = nextName.trim() || "Untitled workflow";
    setName(trimmedName);

    startTransition(async () => {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase
        .from("workflows")
        .update({
          name: trimmedName
        })
        .eq("id", workflowId);

      if (error) {
        throw error;
      }

      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative max-w-xl flex-1">
        <PencilLine className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => saveName(name)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              saveName(name);
              event.currentTarget.blur();
            }
          }}
          className="h-14 rounded-2xl border-slate-300 pl-11 text-3xl font-semibold tracking-tight text-slate-950"
          aria-label="Workflow name"
        />
      </div>
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Check className="h-4 w-4 text-emerald-500" />
        {isPending ? "Saving..." : "Saved automatically"}
      </div>
    </div>
  );
}
