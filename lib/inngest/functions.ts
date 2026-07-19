import { cron } from "inngest";
import type { Edge, Node } from "reactflow";
import { inngest, workflowScheduleDue } from "@/lib/inngest/client";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { computeNextRunAt } from "@/lib/schedule/cron";
import { validateWorkflow } from "@/lib/execution/validate";
import { resolveFileInputs } from "@/lib/execution/resolveFileInputs";
import { runWorkflowToCompletion, type CollectedRun } from "@/lib/execution/runToCompletion";
import type { InputNodeData, WorkflowGraph, WorkflowNodeData } from "@/lib/types";

interface DueSchedule {
  id: string;
  workflow_id: string;
  user_id: string;
  cron_expression: string;
  timezone: string;
  next_run_at: string;
}

type ExecuteStepResult = CollectedRun | { skipped: string };

function applyInputOverrides(
  nodes: Node<WorkflowNodeData>[],
  inputValues: Record<string, string>
): Node<WorkflowNodeData>[] {
  return nodes.map((node) => {
    if (node.type !== "inputNode") {
      return node;
    }

    const data = node.data as InputNodeData;
    const override = inputValues[data.key];

    if (override === undefined) {
      return node;
    }

    return { ...node, data: { ...data, defaultValue: override } };
  });
}

function validationErrorRun(message: string): CollectedRun {
  const now = new Date().toISOString();

  return {
    status: "error",
    final_output: null,
    node_outputs: [],
    error: message,
    started_at: now,
    completed_at: now
  };
}

export const checkDueSchedules = inngest.createFunction(
  { id: "check-due-schedules", retries: 0, triggers: cron("* * * * *") },
  async ({ step }) => {
    const supabase = createAdminSupabaseClient();

    const { data: due, error } = await supabase
      .from("workflow_schedules")
      .select("id, workflow_id, user_id, cron_expression, timezone, next_run_at")
      .eq("enabled", true)
      .lte("next_run_at", new Date().toISOString())
      .limit(50);

    if (error) {
      throw new Error(`Failed to query due schedules: ${error.message}`);
    }

    const claimed: { scheduleId: string; workflowId: string; userId: string }[] = [];

    for (const schedule of (due ?? []) as DueSchedule[]) {
      const { data: rows, error: claimError } = await supabase
        .from("workflow_schedules")
        .update({
          last_run_at: new Date().toISOString(),
          next_run_at: computeNextRunAt(schedule.cron_expression, schedule.timezone)
        })
        .eq("id", schedule.id)
        .eq("next_run_at", schedule.next_run_at)
        .eq("enabled", true)
        .select("id");

      if (claimError) {
        throw new Error(`Failed to claim schedule ${schedule.id}: ${claimError.message}`);
      }

      if (rows && rows.length > 0) {
        claimed.push({
          scheduleId: schedule.id,
          workflowId: schedule.workflow_id,
          userId: schedule.user_id
        });
      }
    }

    if (claimed.length > 0) {
      await step.sendEvent(
        "fan-out-due-schedules",
        claimed.map((data) => workflowScheduleDue.create(data))
      );
    }

    return { due: due?.length ?? 0, claimed: claimed.length };
  }
);

export const runScheduledWorkflow = inngest.createFunction(
  {
    id: "run-scheduled-workflow",
    retries: 1,
    concurrency: { key: "event.data.workflowId", limit: 1 },
    triggers: workflowScheduleDue
  },
  async ({ event, step }) => {
    const run = await step.run("execute-workflow", async (): Promise<ExecuteStepResult> => {
      const supabase = createAdminSupabaseClient();

      const { data: workflow, error: workflowError } = await supabase
        .from("workflows")
        .select("user_id, graph")
        .eq("id", event.data.workflowId)
        .maybeSingle();

      if (workflowError) {
        throw new Error(`Failed to load workflow: ${workflowError.message}`);
      }

      if (!workflow || workflow.user_id !== event.data.userId) {
        return { skipped: "Workflow not found or ownership mismatch." };
      }

      const { data: schedule, error: scheduleError } = await supabase
        .from("workflow_schedules")
        .select("input_values")
        .eq("id", event.data.scheduleId)
        .maybeSingle();

      if (scheduleError) {
        throw new Error(`Failed to load schedule: ${scheduleError.message}`);
      }

      if (!schedule) {
        return { skipped: "Schedule was deleted." };
      }

      const { nodes, edges } = workflow.graph as WorkflowGraph;
      const overriddenNodes = applyInputOverrides(
        nodes as unknown as Node<WorkflowNodeData>[],
        (schedule.input_values ?? {}) as Record<string, string>
      );
      // The admin client bypasses RLS, so the owner filter inside resolveFileInputs
      // is the only guard against a forged graph referencing another user's file.
      const rfNodes = await resolveFileInputs(overriddenNodes, supabase, event.data.userId);
      const rfEdges = edges as unknown as Edge[];

      const validation = validateWorkflow(rfNodes, rfEdges);

      if (!validation.valid) {
        const message =
          validation.globalError ?? Object.values(validation.nodeErrors).join(" ") ?? "Invalid workflow";
        return validationErrorRun(message);
      }

      return runWorkflowToCompletion(rfNodes, rfEdges);
    });

    if ("skipped" in run) {
      return { skipped: run.skipped };
    }

    await step.run("persist-run", async () => {
      const supabase = createAdminSupabaseClient();

      const { error } = await supabase.from("workflow_runs").insert({
        workflow_id: event.data.workflowId,
        user_id: event.data.userId,
        status: run.status,
        final_output: run.final_output,
        node_outputs: run.node_outputs,
        error: run.error,
        trigger: "scheduled",
        started_at: run.started_at,
        completed_at: run.completed_at
      });

      if (error) {
        throw new Error(`Failed to persist workflow run: ${error.message}`);
      }
    });

    return { status: run.status };
  }
);
