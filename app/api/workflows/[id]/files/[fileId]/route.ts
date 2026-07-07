import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface RouteContext {
  params: {
    id: string;
    fileId: string;
  };
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: file, error: fetchError } = await supabase
    .from("workflow_files")
    .select("id, user_id, storage_path")
    .eq("id", params.fileId)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  if (file.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await supabase.storage.from("workflow-files").remove([file.storage_path]);

  const { error: deleteError } = await supabase
    .from("workflow_files")
    .delete()
    .eq("id", params.fileId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
