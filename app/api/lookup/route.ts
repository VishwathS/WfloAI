import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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

  let tavilyData: TavilyResponse;

  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({ query: body.query.trim(), max_results: maxResults })
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { error: `Tavily error: ${response.status} ${text}` },
        { status: 502 }
      );
    }

    tavilyData = (await response.json()) as TavilyResponse;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Lookup failed: ${message}` }, { status: 500 });
  }

  const output = formatResults(tavilyData.query ?? body.query, tavilyData.results ?? []);
  return NextResponse.json({ output });
}
