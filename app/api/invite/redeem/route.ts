import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSameOrigin } from "@/lib/security/origin";
import { apiError } from "@/lib/observability/apiError";

interface RedeemBody {
  code?: unknown;
}

const MAX_CODE_LENGTH = 64;

// redeem_invite_code returns an outcome string rather than raising, so the
// mapping lives here in one place instead of being parsed out of an error.
const OUTCOMES: Record<string, { status: number; message: string }> = {
  approved: { status: 200, message: "Your account is approved." },
  already_approved: { status: 200, message: "Your account is already approved." },
  invalid: { status: 400, message: "That invite code is not valid." },
  expired: { status: 400, message: "That invite code has expired." },
  exhausted: { status: 400, message: "That invite code has been fully used." },
  unauthenticated: { status: 401, message: "Unauthorized" }
};

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: RedeemBody;

  try {
    body = (await request.json()) as RedeemBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const code = typeof body.code === "string" ? body.code.trim() : "";

  if (!code || code.length > MAX_CODE_LENGTH) {
    return NextResponse.json({ error: "Enter an invite code." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("redeem_invite_code", { p_code: code });

  if (error) {
    return apiError("api.invite.redeem.failed", error, { userId: user.id });
  }

  const outcome = OUTCOMES[String(data)];

  if (!outcome) {
    return apiError("api.invite.redeem.unknown_outcome", new Error(String(data)), {
      userId: user.id
    });
  }

  if (outcome.status !== 200) {
    return NextResponse.json({ error: outcome.message }, { status: outcome.status });
  }

  return NextResponse.json({ approved: true, message: outcome.message });
}
