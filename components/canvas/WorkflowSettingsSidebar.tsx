"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Clock, Loader2, Minus, Play, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cronToPreset, describeCron, presetToCron } from "@/lib/schedule/cron";
import type { ScheduleFrequency, WorkflowSchedule } from "@/lib/types";

export interface ScheduleSummary {
  enabledCount: number;
  nextRunAt: string | null;
}

interface WorkflowSettingsSidebarProps {
  workflowId: string;
  open: boolean;
  onClose: () => void;
  onSchedulesChanged?: (summary: ScheduleSummary) => void;
}

interface ScheduleFormState {
  name: string;
  frequency: ScheduleFrequency;
  weekday: number;
  time: string;
  timezone: string;
  customCron: string;
  enabled: boolean;
}

const WEEKDAY_OPTIONS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" }
];

const FREQUENCY_OPTIONS: { value: ScheduleFrequency; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekdays", label: "Weekdays" },
  { value: "weekly", label: "Weekly" },
  { value: "custom", label: "Custom cron" }
];

function getBrowserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function getTimezoneOptions(): string[] {
  if (typeof Intl.supportedValuesOf === "function") {
    return Intl.supportedValuesOf("timeZone");
  }

  return [getBrowserTimezone(), "UTC"];
}

function summarize(schedules: WorkflowSchedule[]): ScheduleSummary {
  const enabled = schedules.filter((s) => s.enabled && s.next_run_at);
  const nextRunAt = enabled
    .map((s) => s.next_run_at as string)
    .sort()[0] ?? null;

  return { enabledCount: schedules.filter((s) => s.enabled).length, nextRunAt };
}

function formatNextRun(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function defaultFormState(): ScheduleFormState {
  return {
    name: "",
    frequency: "daily",
    weekday: 1,
    time: "09:00",
    timezone: getBrowserTimezone(),
    customCron: "",
    enabled: true
  };
}

function formStateFromSchedule(schedule: WorkflowSchedule): ScheduleFormState {
  const preset = cronToPreset(schedule.cron_expression);

  return {
    name: schedule.name,
    frequency: preset?.frequency ?? "custom",
    weekday: preset?.weekday ?? 1,
    time: preset?.time ?? "09:00",
    timezone: schedule.timezone,
    customCron: schedule.cron_expression,
    enabled: schedule.enabled
  };
}

const fieldClass =
  "w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20";

const sectionLabelClass = "text-xs font-semibold uppercase tracking-[0.22em] text-gray-400";

export function WorkflowSettingsSidebar({
  workflowId,
  open,
  onClose,
  onSchedulesChanged
}: WorkflowSettingsSidebarProps) {
  const [schedules, setSchedules] = useState<WorkflowSchedule[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editingId, setEditingId] = useState<"new" | string | null>(null);
  const [form, setForm] = useState<ScheduleFormState>(defaultFormState);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [queuedRunId, setQueuedRunId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    setIsLoading(true);

    fetch(`/api/workflows/${workflowId}/schedules`)
      .then((res) => res.json())
      .then((data: { schedules?: WorkflowSchedule[] }) => {
        const loaded = data.schedules ?? [];
        setSchedules(loaded);
        onSchedulesChanged?.(summarize(loaded));
      })
      .catch(() => {
        setSchedules([]);
      })
      .finally(() => {
        setIsLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workflowId]);

  if (!open) {
    return null;
  }

  function applySchedules(next: WorkflowSchedule[]) {
    setSchedules(next);
    onSchedulesChanged?.(summarize(next));
  }

  function openEditor(target: "new" | WorkflowSchedule) {
    setFormError(null);

    if (target === "new") {
      setEditingId("new");
      setForm(defaultFormState());
      return;
    }

    setEditingId(target.id);
    setForm(formStateFromSchedule(target));
  }

  async function handleSubmit() {
    const cronExpression =
      form.frequency === "custom"
        ? form.customCron.trim()
        : presetToCron({ frequency: form.frequency, time: form.time, weekday: form.weekday });

    if (!form.name.trim()) {
      setFormError("Give the schedule a name.");
      return;
    }

    if (!cronExpression) {
      setFormError("Enter a cron expression.");
      return;
    }

    setIsSaving(true);
    setFormError(null);

    const payload = {
      name: form.name.trim(),
      enabled: form.enabled,
      cron_expression: cronExpression,
      timezone: form.timezone
    };

    const isNew = editingId === "new";
    const url = isNew
      ? `/api/workflows/${workflowId}/schedules`
      : `/api/workflows/${workflowId}/schedules/${editingId}`;

    try {
      const response = await fetch(url, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = (await response.json()) as { schedule?: WorkflowSchedule; error?: string };

      if (!response.ok || !data.schedule) {
        setFormError(data.error ?? "Failed to save schedule.");
        return;
      }

      const saved = data.schedule;
      applySchedules(
        isNew ? [...schedules, saved] : schedules.map((s) => (s.id === saved.id ? saved : s))
      );
      setEditingId(null);
    } catch {
      setFormError("Failed to save schedule.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggle(schedule: WorkflowSchedule) {
    const response = await fetch(`/api/workflows/${workflowId}/schedules/${schedule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !schedule.enabled })
    });
    const data = (await response.json()) as { schedule?: WorkflowSchedule };

    if (response.ok && data.schedule) {
      const saved = data.schedule;
      applySchedules(schedules.map((s) => (s.id === saved.id ? saved : s)));
    }
  }

  async function handleDelete(scheduleId: string) {
    await fetch(`/api/workflows/${workflowId}/schedules/${scheduleId}`, { method: "DELETE" });
    applySchedules(schedules.filter((s) => s.id !== scheduleId));

    if (editingId === scheduleId) {
      setEditingId(null);
    }
  }

  async function handleRunNow(scheduleId: string) {
    setQueuedRunId(scheduleId);

    try {
      await fetch(`/api/workflows/${workflowId}/schedules/${scheduleId}/run`, { method: "POST" });
    } finally {
      setTimeout(() => setQueuedRunId(null), 2000);
    }
  }

  const isEditing = editingId !== null;

  return (
    <aside className="flex h-full w-[320px] shrink-0 flex-col overflow-hidden border-l border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-600">
            Workflow settings
          </p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-gray-900">Triggers</h2>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          onClick={onClose}
        >
          <span className="text-base leading-none">×</span>
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
        <div className="flex items-center justify-between px-4 pt-4">
          <p className={sectionLabelClass}>Schedules</p>
          {!isEditing ? (
            <button
              type="button"
              className="flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-violet-600 transition hover:bg-violet-50"
              onClick={() => openEditor("new")}
            >
              <Plus className="h-3.5 w-3.5" />
              Add schedule
            </button>
          ) : null}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : isEditing ? (
          <div className="space-y-3 px-4 py-4">
            <div className="space-y-1">
              <p className={sectionLabelClass}>Name</p>
              <Input
                value={form.name}
                placeholder="Morning post"
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <p className={sectionLabelClass}>Frequency</p>
              <select
                className={fieldClass}
                value={form.frequency}
                onChange={(e) =>
                  setForm((f) => ({ ...f, frequency: e.target.value as ScheduleFrequency }))
                }
              >
                {FREQUENCY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {form.frequency === "weekly" ? (
              <div className="space-y-1">
                <p className={sectionLabelClass}>Day</p>
                <select
                  className={fieldClass}
                  value={form.weekday}
                  onChange={(e) => setForm((f) => ({ ...f, weekday: Number(e.target.value) }))}
                >
                  {WEEKDAY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {form.frequency === "custom" ? (
              <div className="space-y-1">
                <p className={sectionLabelClass}>Cron expression</p>
                <Input
                  value={form.customCron}
                  placeholder="0 9 * * 1-5"
                  onChange={(e) => setForm((f) => ({ ...f, customCron: e.target.value }))}
                />
              </div>
            ) : (
              <div className="space-y-1">
                <p className={sectionLabelClass}>Time</p>
                <input
                  type="time"
                  className={fieldClass}
                  value={form.time}
                  onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                />
              </div>
            )}

            <div className="space-y-1">
              <p className={sectionLabelClass}>Timezone</p>
              <select
                className={fieldClass}
                value={form.timezone}
                onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
              >
                {getTimezoneOptions().map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 pt-1 text-sm text-gray-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500/20"
                checked={form.enabled}
                onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
              />
              Enabled
            </label>

            {formError ? <p className="text-sm text-rose-600">{formError}</p> : null}

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 rounded-full border-transparent bg-violet-600 text-white hover:bg-violet-700"
                disabled={isSaving}
                onClick={() => void handleSubmit()}
              >
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save schedule
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="rounded-full"
                disabled={isSaving}
                onClick={() => setEditingId(null)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : schedules.length === 0 ? (
          <div className="px-4 py-8 text-sm text-gray-500">
            No triggers configured. Runs only when you press Run.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {schedules.map((schedule) => (
              <div key={schedule.id} className="group relative">
                <button
                  type="button"
                  className="w-full px-4 py-3 text-left transition hover:bg-gray-50"
                  onClick={() => openEditor(schedule)}
                >
                  <div className="flex items-center gap-2">
                    <CalendarClock className="h-3.5 w-3.5 shrink-0 text-violet-500" />
                    <span className="truncate text-sm font-medium text-gray-900">
                      {schedule.name}
                    </span>
                    <span
                      className={`ml-auto mr-6 inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${
                        schedule.enabled
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-gray-200 bg-gray-50 text-gray-500"
                      }`}
                    >
                      {schedule.enabled ? "On" : "Off"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {describeCron(schedule.cron_expression)} · {schedule.timezone}
                  </p>
                  {schedule.enabled && schedule.next_run_at ? (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-400">
                      <Clock className="h-3 w-3" />
                      Next run: {formatNextRun(schedule.next_run_at)}
                    </p>
                  ) : null}
                </button>

                <div className="flex items-center gap-2 px-4 pb-3">
                  <button
                    type="button"
                    className="flex items-center gap-1 rounded-full border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
                    onClick={() => void handleRunNow(schedule.id)}
                    disabled={queuedRunId === schedule.id}
                  >
                    <Play className="h-3 w-3" />
                    {queuedRunId === schedule.id ? "Queued" : "Run now"}
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
                    onClick={() => void handleToggle(schedule)}
                  >
                    {schedule.enabled ? "Disable" : "Enable"}
                  </button>
                </div>

                <button
                  type="button"
                  className="absolute right-3 top-3 hidden rounded-full p-1 text-gray-400 transition hover:bg-red-50 hover:text-rose-600 group-hover:block"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDelete(schedule.id);
                  }}
                  aria-label="Delete schedule"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
