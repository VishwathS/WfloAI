import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface ExecuteRequestBody {
  prompt?: string;
  context?: string;
}

function buildPrompt(prompt: string, context: string) {
  return `Context from previous step:\n${context}\n\nInstruction:\n${prompt}`;
}

export async function POST(request: Request) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "Missing ANTHROPIC_API_KEY" }, { status: 500 });
  }

  let body: ExecuteRequestBody;

  try {
    body = (await request.json()) as ExecuteRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.prompt || typeof body.prompt !== "string") {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  const context = typeof body.context === "string" ? body.context : "";
  const client = new Anthropic({ apiKey });
  const stream = client.messages.stream({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: buildPrompt(body.prompt, context)
      }
    ]
  });
  const encoder = new TextEncoder();

  const readableStream = new ReadableStream<Uint8Array>({
    start(controller) {
      let isClosed = false;

      function closeStream() {
        if (isClosed) {
          return;
        }

        isClosed = true;
        controller.close();
      }

      function failStream(error: unknown) {
        if (isClosed) {
          return;
        }

        isClosed = true;
        controller.error(error);
      }

      stream.on("text", (textDelta) => {
        controller.enqueue(encoder.encode(textDelta));
      });

      stream.on("error", (error) => {
        failStream(error);
      });

      stream.on("abort", () => {
        closeStream();
      });

      stream.on("end", () => {
        closeStream();
      });
    },
    cancel() {
      stream.abort();
    }
  });

  return new Response(readableStream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform"
    }
  });
}
