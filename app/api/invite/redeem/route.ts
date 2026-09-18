import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSameOrigin } from "@/lib/security/origin";
import { apiError } from "@/lib/observability/apiError";
import { INVITE_OUTCOMES, MAX_INVITE_CODE_LENGTH } from "@/lib/auth/invite";

interface RedeemBody {
  code?: unknown;
}

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

  if (!code) {
    return NextResponse.json({ error: "Enter an invite code." }, { status: 400 });
  }

  if (code.length > MAX_INVITE_CODE_LENGTH) {
    return NextResponse.json({ error: INVITE_OUTCOMES.invalid.message }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("redeem_invite_code", { p_code: code });

  if (error) {
    return apiError("api.invite.redeem.failed", error, { userId: user.id });
  }

  const outcome = INVITE_OUTCOMES[String(data)];

  if (!outcome) {
    return apiError("api.invite.redeem.unknown_outcome", new Error(String(data)), {
      userId: user.id
    });
  }

  if (outcome.status === 429) {
    return NextResponse.json(
      { error: outcome.message },
      { status: 429, headers: { "Retry-After": "900" } }
    );
  }

  if (outcome.status !== 200) {
    return NextResponse.json({ error: outcome.message }, { status: outcome.status });
  }

  return NextResponse.json({ approved: true, message: outcome.message });
}
