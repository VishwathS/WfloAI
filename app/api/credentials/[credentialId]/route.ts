import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { encryptSecret } from "@/lib/crypto";
import { buildSecretPayload, isCredentialPayload } from "@/lib/integrations/credentialPayload";
import { getUserCredential } from "@/lib/integrations/repo";
import { recordAuditEvent } from "@/lib/integrations/audit";
import type { WorkflowGraph } from "@/lib/types";

interface RouteContext {
  params: { credentialId: string };
}

async function countWorkflowsUsingCredential(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  userId: string,
  credentialId: string
): Promise<number> {
  const { data, error } = await supabase
    .from("workflows")
    .select("graph")
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Failed to check credential usage: ${error.message}`);
  }

  return (data ?? []).filter((row) => {
    const graph = row.graph as WorkflowGraph;
    return graph?.nodes?.some(
      (node) => (node.data as { credentialId?: string })?.credentialId === credentialId
    );
  }).length;
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const credential = await getUserCredential(supabase, user.id, params.credentialId);
  if (!credential) {
    return NextResponse.json({ error: "Credential not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Replace-in-place: same type, new secret (and optionally new name) — lets
  // users rotate a token without editing every workflow that references it.
  const payload = { ...(body as Record<string, unknown>), type: credential.type };
  if (!isCredentialPayload(payload)) {
    return NextResponse.json({ error: "Invalid credential payload." }, { status: 400 });
  }

  const secret = buildSecretPayload(payload);
  if (typeof secret === "string") {
    return NextResponse.json({ error: secret }, { status: 400 });
  }

  const { error } = await supabase
    .from("user_credentials")
    .update({
      name: payload.name.trim() || credential.name,
      secret_encrypted: encryptSecret(JSON.stringify(secret))
    })
    .eq("id", credential.id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await recordAuditEvent(supabase, user.id, "credential.replaced", "succeeded", credential.id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const credential = await getUserCredential(supabase, user.id, params.credentialId);
  if (!credential) {
    return NextResponse.json({ error: "Credential not found" }, { status: 404 });
  }

  let confirm = false;
  try {
    const body = (await request.json()) as { confirm?: boolean };
    confirm = body.confirm === true;
  } catch {
    // no body — treat as unconfirmed
  }

  const usedByWorkflows = await countWorkflowsUsingCredential(supabase, user.id, credential.id);

  if (usedByWorkflows > 0 && !confirm) {
    return NextResponse.json({ usedByWorkflows }, { status: 409 });
  }

  const { error } = await supabase
    .from("user_credentials")
    .delete()
    .eq("id", credential.id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await recordAuditEvent(supabase, user.id, "credential.deleted", "succeeded", credential.id);
  return NextResponse.json({ ok: true });
}
