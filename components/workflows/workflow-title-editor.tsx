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
    <div className="flex items-center gap-3">
      <div className="relative flex min-w-0 max-w-xl flex-1 items-center gap-2">
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
          className="h-auto rounded-lg border-transparent bg-transparent px-1 py-0.5 text-3xl font-semibold tracking-tight text-gray-900 shadow-none transition-colors hover:bg-gray-50 focus-visible:border-gray-200 focus-visible:bg-white"
          aria-label="Workflow name"
        />
        <PencilLine className="pointer-events-none h-4 w-4 shrink-0 text-gray-400" />
      </div>
      <div className="flex shrink-0 items-center gap-1.5 text-xs text-gray-500">
        <Check className="h-3.5 w-3.5 text-emerald-500" />
        {isPending ? "Saving..." : "Saved automatically"}
      </div>
    </div>
  );
}
