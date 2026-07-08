"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getTemplateById } from "@/lib/templates/definitions";

export async function createWorkflowFromTemplate(templateId: string) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const template = getTemplateById(templateId);

  if (!template) {
    throw new Error(`Template not found: ${templateId}`);
  }

  const { data, error } = await supabase
    .from("workflows")
    .insert({
      user_id: user.id,
      name: template.name,
      description: template.description,
      graph: template.graph
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create workflow from template");
  }

  redirect(`/workflows/${data.id}`);
}
