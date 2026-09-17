import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireApprovedUser } from "@/lib/auth/approval";
import { AI_QUOTA } from "@/lib/integrations/limits";
import { consumeQuota, quotaMessage, settleMeteredAction } from "@/lib/integrations/quota";
import { EXECUTION_LIMITS } from "@/lib/execution/constants";

interface ExecuteRequestBody {
  prompt?: string;
  context?: string;
  schema?: string;
}

function buildPrompt(prompt: string, context: string, schema?: string) {
  const base = context
    ? `Context from previous step:\n${context}\n\nInstruction:\n${prompt}`
    : prompt;
  if (!schema) return base;
  return `${base}\n\nYou MUST respond with ONLY a valid JSON object matching this exact shape:\n${schema}\nNo markdown, no code blocks, no explanation — just the raw JSON object.`;
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // A3: the gate cannot only cover pages. The proxy deliberately does not gate
  // /api/, and this route spends money, so it checks admission itself.
  const denied = await requireApprovedUser(supabase, user.id);

  if (denied) {
    return denied;
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
  const schema = typeof body.schema === "string" ? body.schema : undefined;

  // A2: this endpoint is authenticated but was otherwise unbounded — a single
  // user (or script) could drain the operator's Anthropic balance. The quota is
  // consumed before the provider is called, atomically.
  const quota = await consumeQuota(supabase, "ai.call", AI_QUOTA);
  if (!quota.allowed) {
    return NextResponse.json({ error: quotaMessage(quota, "AI") }, { status: 429 });
  }

  const client = new Anthropic({ apiKey });
  const stream = client.messages.stream(
    {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: buildPrompt(body.prompt, context, schema)
        }
      ]
    },
    // A11: bound a hung provider call rather than holding the request open.
    { signal: AbortSignal.timeout(EXECUTION_LIMITS.AI_TIMEOUT_MS) }
  );
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

      stream.on("message", (message) => {
        void settleMeteredAction(supabase, quota.executionId, "succeeded", {
          inputUnits: message.usage?.input_tokens,
          outputUnits: message.usage?.output_tokens
        });
        if (message.stop_reason === "max_tokens") {
          const warning = "\n\n⚠️ Output truncated: the model reached the maximum token limit. The response may be incomplete.";
          controller.enqueue(encoder.encode(warning));
        }
      });

      stream.on("error", (error) => {
        void settleMeteredAction(supabase, quota.executionId, "failed");
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
