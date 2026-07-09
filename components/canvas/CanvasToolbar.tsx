"use client";

import { Clock, History, Loader2, Maximize2, Minimize2, Play, Save, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface TriggerSummary {
  enabledCount: number;
  nextRunAt: string | null;
}

interface CanvasToolbarProps {
  workflowName: string;
  isSaving: boolean;
  isRunning: boolean;
  isFullscreen: boolean;
  hasUnsavedChanges: boolean;
  historyOpen: boolean;
  triggerSummary: TriggerSummary;
  settingsOpen: boolean;
  onSave: () => void;
  onRun: () => void;
  onToggleFullscreen: () => void;
  onToggleHistory: () => void;
  onToggleSettings: () => void;
}

function formatNextRun(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function CanvasToolbar({
  workflowName,
  isSaving,
  isRunning,
  isFullscreen,
  hasUnsavedChanges,
  historyOpen,
  triggerSummary,
  settingsOpen,
  onSave,
  onRun,
  onToggleFullscreen,
  onToggleHistory,
  onToggleSettings
}: CanvasToolbarProps) {
  const statusLabel = isSaving
    ? "Saving changes"
    : hasUnsavedChanges
      ? "Unsaved changes"
      : "All changes saved";

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-4 py-2">
      {isFullscreen ? (
        <span className="mr-2 min-w-0 truncate text-sm font-semibold text-gray-900">
          {workflowName}
        </span>
      ) : null}
        <button
          type="button"
          className={cn(
            "flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900",
            settingsOpen && "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-50 hover:text-violet-700"
          )}
          onClick={onToggleSettings}
        >
          {triggerSummary.enabledCount > 0 && triggerSummary.nextRunAt ? (
            <>
              <Clock className="h-3.5 w-3.5" />
              Next run · {formatNextRun(triggerSummary.nextRunAt)}
            </>
          ) : (
            <>
              <Zap className="h-3.5 w-3.5" />
              No triggers
            </>
          )}
        </button>
        <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600">
          <span
            className={`h-2 w-2 rounded-full ${
              hasUnsavedChanges || isSaving ? "bg-amber-400" : "bg-emerald-400"
            }`}
          />
          {statusLabel}
        </div>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onSave}
          disabled={isSaving}
        >
          <Save className="mr-2 h-4 w-4" />
          {isSaving ? "Saving..." : "Save"}
        </Button>
        <Button
          type="button"
          onClick={onRun}
          disabled={isRunning}
        >
          {isRunning ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Play className="mr-2 h-4 w-4" />
          )}
          {isRunning ? "Running..." : "Run"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className={cn(
            historyOpen && "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-50 hover:text-violet-700"
          )}
          onClick={onToggleHistory}
        >
          <History className="mr-2 h-4 w-4" />
          History
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onToggleFullscreen}
        >
          {isFullscreen ? (
            <Minimize2 className="mr-2 h-4 w-4" />
          ) : (
            <Maximize2 className="mr-2 h-4 w-4" />
          )}
          {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        </Button>
      </div>
    </div>
  );
}
