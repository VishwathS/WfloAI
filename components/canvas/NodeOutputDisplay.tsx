"use client";

function cleanOutput(raw: string): string {
  return raw.replace(/^Structured output:\n/m, "").trim();
}

function parseOutputJson(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(cleanOutput(raw)) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // not JSON
  }
  return null;
}

function labelCase(key: string): string {
  return key.replace(/([A-Z])/g, " $1").trim();
}

export function getOutputPreview(raw: string, maxLength: number): string {
  if (!raw) return "";
  const cleaned = cleanOutput(raw);
  const parsed = parseOutputJson(raw);
  if (parsed) {
    const first = Object.values(parsed).find(
      (v) => typeof v === "string" && (v as string).length > 0
    );
    if (first) {
      const t = first as string;
      return t.length <= maxLength ? t : `${t.slice(0, maxLength)}…`;
    }
  }
  return cleaned.length <= maxLength ? cleaned : `${cleaned.slice(0, maxLength)}…`;
}

export function NodeOutputDisplay({ output }: { output: string }) {
  const parsed = parseOutputJson(output);
  const cleaned = cleanOutput(output);

  if (!parsed) {
    return (
      <div className="whitespace-pre-wrap rounded-2xl border border-zinc-800 bg-zinc-900/80 px-3 py-3 text-sm leading-6 text-zinc-200">
        {cleaned || "No output captured."}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/80 px-3 py-3">
      {Object.entries(parsed).map(([key, value]) => (
        <div key={key}>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
            {labelCase(key)}
          </p>
          {Array.isArray(value) ? (
            <ul className="space-y-1">
              {(value as unknown[]).map((item, i) => (
                <li key={i} className="flex gap-2 text-sm leading-6 text-zinc-200">
                  <span className="shrink-0 text-zinc-600">•</span>
                  <span>{String(item)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-200">
              {typeof value === "object" ? JSON.stringify(value, null, 2) : String(value)}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
