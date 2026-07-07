import type { SupabaseClient } from "@supabase/supabase-js";
import type { Node } from "reactflow";
import type { FileInputNodeData, WorkflowNodeData } from "@/lib/types";

export async function resolveFileInputs(
  nodes: Node<WorkflowNodeData>[],
  supabase: SupabaseClient,
  ownerUserId: string
): Promise<Node<WorkflowNodeData>[]> {
  const fileIds = nodes
    .filter((node) => node.type === "fileInputNode")
    .map((node) => (node.data as FileInputNodeData).fileId)
    .filter((fileId): fileId is string => Boolean(fileId));

  if (fileIds.length === 0) {
    return nodes;
  }

  const { data: files, error } = await supabase
    .from("workflow_files")
    .select("id, extracted_text")
    .in("id", fileIds)
    .eq("user_id", ownerUserId);

  if (error) {
    throw new Error(`Failed to load workflow files: ${error.message}`);
  }

  const textByFileId = new Map(
    (files ?? []).map((file) => [file.id as string, file.extracted_text as string])
  );

  return nodes.map((node) => {
    if (node.type !== "fileInputNode") {
      return node;
    }

    const data = node.data as FileInputNodeData;

    if (!data.fileId) {
      return node;
    }

    return { ...node, data: { ...data, resolvedText: textByFileId.get(data.fileId) } };
  });
}
