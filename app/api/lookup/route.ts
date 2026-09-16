import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/observability/apiError";
import { LOOKUP_QUOTA } from "@/lib/integrations/limits";
import { consumeQuota, quotaMessage, settleMeteredAction } from "@/lib/integrations/quota";
import { EXECUTION_LIMITS } from "@/lib/execution/constants";

interface LookupRequestBody {
  query?: string;
  maxResults?: number;
}

interface TavilyResult {
  title: string;
  url: string;
  content: string;
}

interface TavilyResponse {
  query: string;
  results: TavilyResult[];
}

function formatResults(query: string, results: TavilyResult[]): string {
  const lines: string[] = [`Search results for "${query}":`, ""];
  results.forEach((r, i) => {
    lines.push(`${i + 1}. Title: ${r.title}`);
    lines.push(`   URL: ${r.url}`);
    lines.push(`   Content: ${r.content}`);
    lines.push("");
  });
  return lines.join("\n").trimEnd();
}

export async function POST(request: Request) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.TAVILY_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "Missing TAVILY_API_KEY" }, { status: 500 });
  }

  let body: LookupRequestBody;

  try {
    body = (await request.json()) as LookupRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.query || typeof body.query !== "string" || body.query.trim() === "") {
    return NextResponse.json({ error: "Query is required" }, { status: 400 });
  }

  const maxResults = typeof body.maxResults === "number" ? Math.min(Math.max(body.maxResults, 1), 10) : 5;

  // A2: same unbounded-spend problem as /api/execute, same durable mechanism.
  const quota = await consumeQuota(supabase, "lookup.search", LOOKUP_QUOTA);
  if (!quota.allowed) {
    return NextResponse.json({ error: quotaMessage(quota, "search") }, { status: 429 });
  }

  let tavilyData: TavilyResponse;

  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({ query: body.query.trim(), max_results: maxResults }),
      signal: AbortSignal.timeout(EXECUTION_LIMITS.LOOKUP_TIMEOUT_MS)
    });

    if (!response.ok) {
      await response.text();
      await settleMeteredAction(supabase, quota.executionId, "failed");
      return apiError(
        "api.lookup.provider_failed",
        new Error(`Tavily returned ${response.status}`),
        { status: response.status },
        502
      );
    }

    tavilyData = (await response.json()) as TavilyResponse;
  } catch (err) {
    await settleMeteredAction(supabase, quota.executionId, "failed");
    return apiError("api.lookup.request_failed", err);
  }

  const results = tavilyData.results ?? [];
  await settleMeteredAction(supabase, quota.executionId, "succeeded", {
    outputUnits: results.length
  });

  const output = formatResults(tavilyData.query ?? body.query, results);
  return NextResponse.json({ output });
}
