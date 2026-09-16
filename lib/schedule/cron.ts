import { CronExpressionParser } from "cron-parser";
import type { ScheduleFrequency } from "@/lib/types";
import { SCHEDULE_LIMITS } from "@/lib/schedule/constants";

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

// A12: the floor is checked against the PARSED cron, not the raw string, so
// `* * * * *` and `*/1 * * * *` are both rejected however they are spelled.
// Several consecutive gaps are sampled because a single pair can hide a short
// one — `0,1,30 * * * *` looks like 29 minutes if you only look once.
const INTERVAL_SAMPLES = 6;

export function minIntervalMinutes(
  cronExpression: string,
  timezone: string,
  from: Date = new Date()
): number | null {
  try {
    const iterator = CronExpressionParser.parse(cronExpression, {
      tz: timezone,
      currentDate: from
    });

    let previous = iterator.next().toDate().getTime();
    let smallest = Number.POSITIVE_INFINITY;

    for (let i = 0; i < INTERVAL_SAMPLES; i += 1) {
      const current = iterator.next().toDate().getTime();
      smallest = Math.min(smallest, (current - previous) / 60_000);
      previous = current;
    }

    return smallest;
  } catch {
    return null;
  }
}

export function meetsIntervalFloor(
  cronExpression: string,
  timezone: string,
  from: Date = new Date()
): boolean {
  const smallest = minIntervalMinutes(cronExpression, timezone, from);
  return smallest !== null && smallest >= SCHEDULE_LIMITS.MIN_INTERVAL_MINUTES;
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
