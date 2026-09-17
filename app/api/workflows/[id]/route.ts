import { NextResponse } from "next/server";
import { apiError } from "@/lib/observability/apiError";
import { reportError } from "@/lib/observability/report";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { disableUnauthorizedSendSchedules } from "@/lib/schedule/consent";
import { deleteStoragePrefix } from "@/lib/account/deleteAccount";
import { isSameOrigin } from "@/lib/security/origin";
import type { WorkflowGraph } from "@/lib/types";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

function isValidGraph(value: unknown): value is WorkflowGraph {
  if (!value || typeof value !== "object") {
    return false;
  }

  const maybeGraph = value as WorkflowGraph;

  return Array.isArray(maybeGraph.nodes) && Array.isArray(maybeGraph.edges);
}

export async function PATCH(request: Request, context: RouteContext) {
  const params = await context.params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { graph?: unknown };

  try {
    body = (await request.json()) as { graph?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isValidGraph(body.graph)) {
    return NextResponse.json({ error: "Invalid graph payload" }, { status: 400 });
  }

  const { data: workflow, error: workflowError } = await supabase
    .from("workflows")
    .select("id, user_id")
    .eq("id", params.id)
    .maybeSingle();

  if (workflowError) {
    return apiError("api.workflows.item.workflow_lookup_failed", workflowError);
  }

  if (!workflow) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  if (workflow.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error: updateError } = await supabase
    .from("workflows")
    .update({
      graph: body.graph
    })
    .eq("id", params.id);

  if (updateError) {
    return apiError("api.workflows.item.update_failed", updateError);
  }

  // A14a: schedules execute the latest saved graph, so an edit that adds a
  // Gmail Send step would otherwise make an already-enabled schedule start
  // sending unattended on authorisation nobody gave. Any enabled schedule on
  // this workflow that lacks authorisation is disabled; re-enabling it goes
  // back through the consent gate.
  let disabledSchedules = 0;

  try {
    disabledSchedules = await disableUnauthorizedSendSchedules(
      supabase,
      params.id,
      (body.graph as WorkflowGraph).nodes
    );
  } catch (error) {
    // The graph is already saved. Failing the request would make the canvas
    // report a lost edit that in fact persisted, so report and carry on — the
    // runner re-checks before any mail leaves.
    reportError("api.workflows.item.schedule_consent_sweep_failed", error, {
      workflowId: params.id,
      userId: user.id
    });
  }

  return NextResponse.json({ success: true, disabledSchedules }, { status: 200 });
}

// S3. Deleting a workflow used to be a direct browser-side
// supabase.from("workflows").delete(), which cascades workflow_files rows but
// leaves the uploaded bytes in the private bucket forever. The privacy policy
// says files are kept until the user deletes them, so the bytes have to go too —
// and that needs authorisation, the row delete and the storage sweep
// coordinated in one place.
export async function DELETE(request: Request, context: RouteContext) {
  // Destructive and irreversible, so it carries the same origin check as the
  // other state-changing routes.
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }

  const params = await context.params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: workflow, error: lookupError } = await supabase
    .from("workflows")
    .select("id, user_id")
    .eq("id", params.id)
    .maybeSingle();

  if (lookupError) {
    return apiError("api.workflows.item.delete_lookup_failed", lookupError);
  }

  if (!workflow) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  if (workflow.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Storage first, deliberately. Reversed, a successful row delete followed by a
  // storage failure orphans the bytes with no row left to find them by, and
  // reports success while breaking the deletion promise. This way a storage
  // failure deletes nothing and the user can retry; a row-delete failure after a
  // successful sweep leaves a workflow whose files are gone, which is visible
  // and recoverable by retrying the same delete.
  //
  // The user-scoped client is enough: storage RLS authorises on the first path
  // segment, which is the id of the caller.
  let objectsDeleted = 0;

  try {
    objectsDeleted = await deleteStoragePrefix(supabase, `${user.id}/${params.id}`);
  } catch (error) {
    return apiError("api.workflows.item.delete_storage_failed", error, {
      workflowId: params.id,
      userId: user.id
    });
  }

  const { error: deleteError } = await supabase
    .from("workflows")
    .delete()
    .eq("id", params.id)
    .eq("user_id", user.id);

  if (deleteError) {
    return apiError("api.workflows.item.delete_failed", deleteError, {
      workflowId: params.id,
      userId: user.id,
      objectsDeleted
    });
  }

  return NextResponse.json({ success: true, objectsDeleted }, { status: 200 });
}
