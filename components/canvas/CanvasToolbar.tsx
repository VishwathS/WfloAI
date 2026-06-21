"use client";

import { Loader2, Maximize2, Minimize2, Play, Save } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CanvasToolbarProps {
  workflowName: string;
  isSaving: boolean;
  isRunning: boolean;
  isFullscreen: boolean;
  hasUnsavedChanges: boolean;
  onSave: () => void;
  onRun: () => void;
  onToggleFullscreen: () => void;
}

export function CanvasToolbar({
  workflowName,
  isSaving,
  isRunning,
  isFullscreen,
  hasUnsavedChanges,
  onSave,
  onRun,
  onToggleFullscreen
}: CanvasToolbarProps) {
  const statusLabel = isSaving
    ? "Saving changes"
    : hasUnsavedChanges
      ? "Unsaved changes"
      : "All changes saved";

  return (
    <div className="flex flex-col gap-4 border-b border-zinc-800 bg-zinc-950/95 px-5 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-400/80">
          Canvas
        </p>
        <h2 className="text-2xl font-semibold tracking-tight text-white">
          {workflowName}
        </h2>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-300">
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
          className="rounded-full bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
          onClick={onSave}
          disabled={isSaving}
        >
          <Save className="mr-2 h-4 w-4" />
          {isSaving ? "Saving..." : "Save"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="rounded-full border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800 hover:text-white"
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
          className="rounded-full border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800 hover:text-white"
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
