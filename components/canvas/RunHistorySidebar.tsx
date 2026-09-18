"use client";

import { useEffect, useState } from "react";
import { Loader2, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WorkflowRun } from "@/lib/types";
import { NodeOutputDisplay, getOutputPreview } from "@/components/canvas/NodeOutputDisplay";

interface RunsPage {
  runs?: WorkflowRun[];
  hasMore?: boolean;
  nextOffset?: number;
}

interface RunHistorySidebarProps {
  workflowId: string;
  open: boolean;
  onClose: () => void;
  refreshTrigger: number;
}

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}


export function RunHistorySidebar({
  workflowId,
  open,
  onClose,
  refreshTrigger
}: RunHistorySidebarProps) {
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // B2/C4: the endpoint is paginated now, so the sidebar must not silently
  // show the newest page as if it were the whole history.
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  useEffect(() => {
    if (!open) return;

    setIsLoading(true);

    fetch(`/api/workflows/${workflowId}/runs`)
      .then((res) => res.json())
      .then((data: RunsPage) => {
        setRuns(data.runs ?? []);
        setNextOffset(data.nextOffset ?? 0);
        setHasMore(Boolean(data.hasMore));
      })
      .catch(() => {
        setRuns([]);
        setHasMore(false);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [open, refreshTrigger, workflowId]);

  async function loadMore() {
    setIsLoadingMore(true);

    try {
      const response = await fetch(
        `/api/workflows/${workflowId}/runs?offset=${nextOffset}`
      );
      const data = (await response.json()) as RunsPage;

      setRuns((current) => [...current, ...(data.runs ?? [])]);
      setNextOffset(data.nextOffset ?? nextOffset);
      setHasMore(Boolean(data.hasMore));
    } catch {
      setHasMore(false);
    } finally {
      setIsLoadingMore(false);
    }
  }

  if (!open) {
    return null;
  }

  async function handleDelete(runId: string) {
    await fetch(`/api/workflows/${workflowId}/runs/${runId}`, { method: "DELETE" });
    setRuns((current) => current.filter((r) => r.id !== runId));
    if (expandedId === runId) {
      setExpandedId(null);
    }
  }

  return (
    <aside className="flex h-full w-[320px] shrink-0 flex-col overflow-hidden border-l border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-4">
        <h2 className="text-sm font-semibold text-gray-900">Run history</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          onClick={onClose}
          aria-label="Close run history"
        >
          <span className="text-base leading-none">×</span>
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : runs.length === 0 ? (
          <div className="px-4 py-8 text-sm text-gray-500">
            No runs yet.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {runs.map((run) => {
              const isExpanded = expandedId === run.id;
              const previewText = run.final_output ?? run.error ?? "";

              return (
                <div key={run.id} className="group relative">
                  <button
                    type="button"
                    className="w-full px-4 py-3 text-left transition hover:bg-gray-50"
                    onClick={() => setExpandedId(isExpanded ? null : run.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-gray-400">
                        {formatTimestamp(run.created_at)}
                      </span>
                      <span className="flex items-center gap-1.5">
                        {run.trigger ? (
                          <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                            {run.trigger === "scheduled" ? "Scheduled" : "Manual"}
                          </span>
                        ) : null}
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            run.status === "success"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-rose-50 text-rose-700"
                          }`}
                        >
                          {run.status === "success" ? "Success" : "Error"}
                        </span>
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-700">
                      {previewText ? getOutputPreview(previewText, 50) : "No output"}
                    </p>
                  </button>

                  {isExpanded ? (
                    <div className="px-4 pb-4">
                      <NodeOutputDisplay
                        output={(run.status === "error" ? run.error : run.final_output) ?? ""}
                      />
                    </div>
                  ) : null}

                  <button
                    type="button"
                    className="absolute right-3 top-3 hidden rounded-full p-1 text-gray-400 transition hover:bg-red-50 hover:text-rose-600 group-hover:block"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDelete(run.id);
                    }}
                    aria-label="Delete run"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
            {hasMore ? (
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={isLoadingMore}
                className="w-full px-4 py-3 text-sm font-medium text-violet-700 transition hover:bg-violet-50 disabled:opacity-60"
              >
                {isLoadingMore ? "Loading…" : "Load older runs"}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </aside>
  );
}
