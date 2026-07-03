"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRight, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import type { WorkflowWithLastRun } from "@/lib/types";
import { cn } from "@/lib/utils";

interface WorkflowListProps {
  workflows: WorkflowWithLastRun[];
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatRelativeTime(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60000));

  if (diffMinutes < 60) {
    return `${diffMinutes} min${diffMinutes === 1 ? "" : "s"} ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours} hr${diffHours === 1 ? "" : "s"} ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
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
      <section className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-violet-600">
            Workflow library
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-gray-900">
            No workflows yet
          </h2>
        </div>
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center">
          <p className="text-sm text-gray-500">
            Start with a blank workflow and begin shaping your first AI-powered automation.
          </p>
          <p className="mt-2 text-sm text-gray-400">
            Use the New workflow button above to create your first canvas.
          </p>
          {errorMessage ? (
            <p className="mt-3 text-sm text-rose-600">{errorMessage}</p>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-violet-600">
            Workflow library
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-gray-900">
            Pick up where you left off
          </h2>
        </div>
        {errorMessage ? (
          <p className="text-sm text-rose-600">{errorMessage}</p>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white divide-y divide-gray-100">
        {items.map((workflow) => (
          <div
            key={workflow.id}
            className="flex flex-wrap items-center gap-3 px-5 py-4 transition hover:bg-gray-50 sm:flex-nowrap"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-gray-900">{workflow.name}</p>
              <p className="mt-0.5 text-sm text-gray-500">
                {workflow.last_run_at
                  ? `Last run: ${formatRelativeTime(workflow.last_run_at)}`
                  : "Last run: Never"}
              </p>
            </div>

            <p className="hidden shrink-0 text-sm text-gray-400 sm:block">
              Updated {formatRelativeTime(workflow.updated_at)}
            </p>

            <Link
              href={`/workflows/${workflow.id}`}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "shrink-0 rounded-full border-violet-200 px-4 text-violet-700 hover:border-violet-300 hover:bg-violet-50"
              )}
            >
              Open
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Link>

            <div className="shrink-0">
              <WorkflowDeleteButton
                workflowId={workflow.id}
                workflowName={workflow.name}
                onDelete={handleDelete}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
