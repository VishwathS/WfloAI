import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { extractTextFromFile } from "@/lib/extraction/extractText";
import { formatBytes, getFileKind, getMaxBytes } from "@/lib/files/constants";

export const maxDuration = 60;

interface RouteContext {
  params: { id: string };
}

interface CreateFileBody {
  fileId?: string;
  filename?: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request, { params }: RouteContext) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: workflow, error: workflowError } = await supabase
    .from("workflows")
    .select("id")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (workflowError) {
    return NextResponse.json({ error: workflowError.message }, { status: 500 });
  }

  if (!workflow) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  let body: CreateFileBody;

  try {
    body = (await request.json()) as CreateFileBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const fileId = body.fileId?.trim() ?? "";
  const filename = body.filename?.trim() ?? "";

  if (!UUID_PATTERN.test(fileId)) {
    return NextResponse.json({ error: "fileId must be a UUID" }, { status: 400 });
  }

  if (!filename) {
    return NextResponse.json({ error: "filename is required" }, { status: 400 });
  }

  const kind = getFileKind(filename);

  if (!kind) {
    return NextResponse.json(
      { error: "Unsupported file type. Supported types: PDF, DOCX, TXT, MD, CSV." },
      { status: 400 }
    );
  }

  const storagePath = `${user.id}/${params.id}/${fileId}`;
  const storage = supabase.storage.from("workflow-files");
  const { data: blob, error: downloadError } = await storage.download(storagePath);

  if (downloadError || !blob) {
    return NextResponse.json(
      { error: "Uploaded file not found in storage — try uploading again." },
      { status: 400 }
    );
  }

  const maxBytes = getMaxBytes(kind);

  if (blob.size > maxBytes) {
    await storage.remove([storagePath]);
    return NextResponse.json(
      { error: `File is too large — the limit for this type is ${formatBytes(maxBytes)}.` },
      { status: 400 }
    );
  }

  let extracted: { text: string; pageCount?: number };

  try {
    extracted = await extractTextFromFile(await blob.arrayBuffer(), filename);
  } catch (error) {
    await storage.remove([storagePath]);
    const message = error instanceof Error ? error.message : "Text extraction failed.";
    return NextResponse.json({ error: message }, { status: 422 });
  }

  const { error: insertError } = await supabase.from("workflow_files").insert({
    id: fileId,
    workflow_id: params.id,
    user_id: user.id,
    filename,
    mime_type: blob.type || "application/octet-stream",
    size_bytes: blob.size,
    page_count: extracted.pageCount ?? null,
    storage_path: storagePath,
    extracted_text: extracted.text
  });

  if (insertError) {
    await storage.remove([storagePath]);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    fileId,
    filename,
    fileType: blob.type || "application/octet-stream",
    fileSize: blob.size,
    pageCount: extracted.pageCount ?? null,
    textLength: extracted.text.length,
    textPreview: extracted.text.slice(0, 300)
  });
}
