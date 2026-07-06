import { CronExpressionParser } from "cron-parser";
import type { ScheduleFrequency } from "@/lib/types";

export interface SchedulePreset {
  frequency: Exclude<ScheduleFrequency, "custom">;
  time: string;
  weekday: number;
}

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday"
];

export function computeNextRunAt(
  cronExpression: string,
  timezone: string,
  from: Date = new Date()
): string {
  return CronExpressionParser.parse(cronExpression, {
    tz: timezone,
    currentDate: from
  })
    .next()
    .toDate()
    .toISOString();
}

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function isValidCronExpression(cronExpression: string, timezone: string): boolean {
  try {
    computeNextRunAt(cronExpression, timezone);
    return true;
  } catch {
    return false;
  }
}

export function presetToCron(preset: SchedulePreset): string {
  const [hour, minute] = preset.time.split(":").map(Number);

  if (preset.frequency === "daily") {
    return `${minute} ${hour} * * *`;
  }

  if (preset.frequency === "weekdays") {
    return `${minute} ${hour} * * 1-5`;
  }

  return `${minute} ${hour} * * ${preset.weekday}`;
}

export function cronToPreset(cronExpression: string): SchedulePreset | null {
  const fields = cronExpression.trim().split(/\s+/);

  if (fields.length !== 5) {
    return null;
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;

  if (!/^\d{1,2}$/.test(minute) || !/^\d{1,2}$/.test(hour)) {
    return null;
  }

  if (dayOfMonth !== "*" || month !== "*") {
    return null;
  }

  const time = `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;

  if (dayOfWeek === "*") {
    return { frequency: "daily", time, weekday: 1 };
  }

  if (dayOfWeek === "1-5") {
    return { frequency: "weekdays", time, weekday: 1 };
  }

  if (/^[0-6]$/.test(dayOfWeek)) {
    return { frequency: "weekly", time, weekday: Number(dayOfWeek) };
  }

  return null;
}

function formatTime(time: string): string {
  const [hour, minute] = time.split(":").map(Number);
  const period = hour < 12 ? "AM" : "PM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
}

export function describeCron(cronExpression: string): string {
  const preset = cronToPreset(cronExpression);

  if (!preset) {
    return `Cron: ${cronExpression}`;
  }

  const time = formatTime(preset.time);

  if (preset.frequency === "daily") {
    return `Daily at ${time}`;
  }

  if (preset.frequency === "weekdays") {
    return `Weekdays at ${time}`;
  }

  return `${WEEKDAY_NAMES[preset.weekday]}s at ${time}`;
}
