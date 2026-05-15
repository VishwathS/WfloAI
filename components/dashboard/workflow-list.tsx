"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRight, Clock3, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import type { Workflow } from "@/lib/types";
import { cn } from "@/lib/utils";

interface WorkflowListProps {
  workflows: Workflow[];
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function WorkflowDeleteButton({
  workflowId,
  workflowName,
  onDelete
}: {
  workflowId: string;
  workflowName: string;
  onDelete: (workflowId: string) => Promise<void>;
}) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  return isConfirming ? (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="rounded-full px-4"
        onClick={() => setIsConfirming(false)}
        disabled={isPending}
      >
        Cancel
      </Button>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        className="rounded-full px-4"
        disabled={isPending}
        onClick={() => {
          startTransition(async () => {
            await onDelete(workflowId);
            setIsConfirming(false);
          });
        }}
      >
        {isPending ? "Deleting..." : `Delete ${workflowName}`}
      </Button>
    </div>
  ) : (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="rounded-full px-3 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
      onClick={() => setIsConfirming(true)}
    >
      <Trash2 className="mr-2 h-4 w-4" />
      Delete
    </Button>
  );
}

export function WorkflowList({ workflows }: WorkflowListProps) {
  const router = useRouter();
  const [items, setItems] = useState(workflows);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleDelete(workflowId: string) {
    const previousItems = items;
    setErrorMessage(null);
    setItems((currentItems) => currentItems.filter((item) => item.id !== workflowId));

    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.from("workflows").delete().eq("id", workflowId);

    if (error) {
      setItems(previousItems);
      setErrorMessage("The workflow could not be deleted. Please try again.");
      return;
    }

    router.refresh();
  }

  if (items.length === 0) {
    return (
      <Card className="overflow-hidden border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(240,249,255,0.92))]">
        <CardHeader className="pb-3">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-700">
            Empty state
          </p>
          <CardTitle className="mt-3 text-3xl text-slate-950">
            No workflows yet
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="max-w-2xl text-sm leading-6 text-slate-600">
            Start with a blank workflow and begin shaping your first AI-powered
            automation. As your library grows, you will manage and prune it from here.
          </p>
          <div className="rounded-[24px] border border-dashed border-cyan-200 bg-cyan-50/70 p-5 text-sm text-cyan-900">
            Use the New workflow button above to create your first canvas.
          </div>
          {errorMessage ? (
            <p className="text-sm text-rose-600">{errorMessage}</p>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-700">
            Workflow library
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
            Pick up where you left off
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Open any workflow to continue building, or remove the ones that no longer
            belong in your active stack.
          </p>
        </div>
        {errorMessage ? (
          <p className="text-sm text-rose-600">{errorMessage}</p>
        ) : null}
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {items.map((workflow, index) => (
          <Card
            key={workflow.id}
            className="group relative overflow-hidden border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.92))] transition duration-200 hover:-translate-y-1 hover:shadow-[0_30px_75px_-38px_rgba(14,116,144,0.55)]"
          >
            <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent" />
            <CardHeader className="space-y-4 pb-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-3">
                  <div className="inline-flex w-fit items-center rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-700">
                    Workflow {String(index + 1).padStart(2, "0")}
                  </div>
                  <CardTitle className="line-clamp-2 text-2xl text-slate-950">
                    {workflow.name}
                  </CardTitle>
                </div>
                <div className="rounded-2xl bg-slate-100 px-3 py-2 text-right">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Updated
                  </p>
                  <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                    <Clock3 className="h-3.5 w-3.5" />
                    <span>{formatTimestamp(workflow.updated_at)}</span>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <p className="min-h-[72px] text-sm leading-6 text-slate-600">
                {workflow.description?.trim() ||
                  "Blank workflow ready for AI nodes, branching logic, and visual orchestration."}
              </p>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
                <Link
                  href={`/workflows/${workflow.id}`}
                  className={cn(
                    buttonVariants({ variant: "outline" }),
                    "rounded-full border-cyan-200 bg-cyan-50/70 px-4 text-cyan-900 hover:border-cyan-300 hover:bg-cyan-100"
                  )}
                >
                  Open canvas
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>

                <WorkflowDeleteButton
                  workflowId={workflow.id}
                  workflowName={workflow.name}
                  onDelete={handleDelete}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
