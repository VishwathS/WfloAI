import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { buildSecretPayload, isCredentialPayload } from "@/lib/integrations/credentialPayload";
import { recordAuditEvent } from "@/lib/integrations/audit";
import type { CredentialSummary } from "@/lib/integrations/repo";
import type { ApiKeySecret } from "@/lib/integrations/types";
import type { UserCredential } from "@/lib/types";

export async function GET() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("user_credentials")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Secrets are write-only; api_key rows expose only the (non-secret) header name.
  const credentials: CredentialSummary[] = ((data ?? []) as UserCredential[]).map(
    (credential) => {
      const summary: CredentialSummary = {
        id: credential.id,
        name: credential.name,
        type: credential.type
      };
      if (credential.type === "api_key") {
        try {
          const secret = JSON.parse(decryptSecret(credential.secret_encrypted)) as ApiKeySecret;
          summary.headerName = secret.headerName;
        } catch {
          // Undecryptable envelope (key changed) — omit headerName.
        }
      }
      return summary;
    }
  );

  return NextResponse.json({ credentials });
}

export async function POST(request: Request) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isCredentialPayload(body) || !body.name.trim()) {
    return NextResponse.json({ error: "A credential needs a name and a type." }, { status: 400 });
  }

  const secret = buildSecretPayload(body);
  if (typeof secret === "string") {
    return NextResponse.json({ error: secret }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("user_credentials")
    .insert({
      user_id: user.id,
      name: body.name.trim(),
      type: body.type,
      secret_encrypted: encryptSecret(JSON.stringify(secret))
    })
    .select("id, name, type")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await recordAuditEvent(supabase, user.id, "credential.created", "succeeded", data.id);
  return NextResponse.json({ credential: data }, { status: 201 });
}
