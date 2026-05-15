import { Plus } from "lucide-react";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { WorkflowGraph } from "@/lib/types";

const EMPTY_GRAPH: WorkflowGraph = {
  nodes: [],
  edges: []
};

async function createWorkflow() {
  "use server";

  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data, error } = await supabase
    .from("workflows")
    .insert({
      user_id: user.id,
      name: "Untitled workflow",
      description: null,
      graph: EMPTY_GRAPH
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create workflow");
  }

  redirect(`/workflows/${data.id}`);
}

export function CreateWorkflowButton() {
  return (
    <form action={createWorkflow}>
      <Button
        type="submit"
        size="lg"
        className="h-12 rounded-full px-6 text-[15px] font-semibold"
      >
        <Plus className="mr-2 h-4 w-4" />
        New workflow
      </Button>
    </form>
  );
}
