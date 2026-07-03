import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function labelToKey(label: string): string {
  const words = label
    .trim()
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  return words
    .map((w, i) =>
      i === 0
        ? w.toLowerCase()
        : w[0].toUpperCase() + w.slice(1).toLowerCase()
    )
    .join("");
}
