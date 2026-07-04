"use client";

import { History, Loader2, Maximize2, Minimize2, Play, Save, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CanvasToolbarProps {
  workflowName: string;
  isSaving: boolean;
  isRunning: boolean;
  isFullscreen: boolean;
  hasUnsavedChanges: boolean;
  historyOpen: boolean;
  onSave: () => void;
  onRun: () => void;
  onToggleFullscreen: () => void;
  onToggleHistory: () => void;
}

export function CanvasToolbar({
  workflowName,
  isSaving,
  isRunning,
  isFullscreen,
  hasUnsavedChanges,
  historyOpen,
  onSave,
  onRun,
  onToggleFullscreen,
  onToggleHistory
}: CanvasToolbarProps) {
  const statusLabel = isSaving
    ? "Saving changes"
    : hasUnsavedChanges
      ? "Unsaved changes"
      : "All changes saved";

  return (
    <div className="flex flex-col gap-4 border-b border-gray-200 bg-gray-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-600">
          Canvas
        </p>
        <h2 className="text-2xl font-semibold tracking-tight text-gray-900">
          {workflowName}
        </h2>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-100 px-3 py-2 text-sm text-gray-500">
          <Zap className="h-3.5 w-3.5" />
          Manual
        </div>
        <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              hasUnsavedChanges || isSaving ? "bg-amber-400" : "bg-emerald-400"
            }`}
          />
          {statusLabel}
        </div>
        <Button
          type="button"
          variant="secondary"
          className="rounded-full border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
          onClick={onSave}
          disabled={isSaving}
        >
          <Save className="mr-2 h-4 w-4" />
          {isSaving ? "Saving..." : "Save"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="rounded-full border-transparent bg-violet-600 text-white hover:bg-violet-700"
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
            "rounded-full border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
            historyOpen && "border-violet-200 bg-violet-50 text-violet-700"
          )}
          onClick={onToggleHistory}
        >
          <History className="mr-2 h-4 w-4" />
          History
        </Button>
        <Button
          type="button"
          variant="outline"
          className="rounded-full border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
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
