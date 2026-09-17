import { cron } from "inngest";
import type { Edge, Node } from "reactflow";
import { inngest, workflowScheduleDue } from "@/lib/inngest/client";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isApprovedUser } from "@/lib/auth/approval";
import { log, LOG_EVENTS } from "@/lib/observability/logger";
import { reportError } from "@/lib/observability/report";
import {
  AUTO_DISABLED_REASON,
  SCHEDULE_LIMITS,
  UNATTENDED_SEND_DISABLED_REASON
} from "@/lib/schedule/constants";
import { hasUnattendedSendConsent } from "@/lib/schedule/consent";
import {
  LEDGER_UNSETTLED_FLOOR_DAYS,
  RETENTION_DAYS,
  SETTLED_LEDGER_STATUSES,
  UNSETTLED_LEDGER_STATUSES,
  retentionCleanupEnabled
} from "@/lib/retention/constants";
import { cutoffIso } from "@/lib/retention/plan";
import { computeNextRunAt } from "@/lib/schedule/cron";
import { containsSendCapableGmailNode, validateWorkflow } from "@/lib/execution/validate";
import { resolveFileInputs } from "@/lib/execution/resolveFileInputs";
import { runWorkflowToCompletion, type CollectedRun } from "@/lib/execution/runToCompletion";
import { deriveRunId } from "@/lib/integrations/idempotency";
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
    // Derived once in the handler scope so the execute step and the persisted
    // workflow_runs row share it: a retry replays the same event id, keeping
    // integration idempotency keys stable and letting ledger rows be joined
    // back to the run they belong to (the manual path sets id the same way).
    const runId = deriveRunId(event.id ?? `${event.data.scheduleId}:${event.ts ?? 0}`);

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

      // A3: a gate that only covers pages and request-scoped routes is not a
      // cost control. A schedule created before approval was revoked would
      // otherwise keep spending on its own timetable, with nobody signed in.
      if (!(await isApprovedUser(supabase, event.data.userId))) {
        return { skipped: "Account is not approved." };
      }

      const { data: schedule, error: scheduleError } = await supabase
        .from("workflow_schedules")
        .select("input_values, unattended_send_authorized_at")
        .eq("id", event.data.scheduleId)
        .maybeSingle();

      if (scheduleError) {
        throw new Error(`Failed to load schedule: ${scheduleError.message}`);
      }

      if (!schedule) {
        return { skipped: "Schedule was deleted." };
      }

      const { nodes, edges } = workflow.graph as WorkflowGraph;

      // A14a, last line of defence. The graph-save sweep disables an
      // unauthorised send-capable schedule, but a save and a due occurrence can
      // race. No mail leaves on an authorisation nobody gave: the schedule is
      // turned off here and the refusal is persisted as a visible error run
      // rather than skipped silently, so the owner can see why it stopped.
      if (
        containsSendCapableGmailNode(nodes) &&
        !hasUnattendedSendConsent(schedule as { unattended_send_authorized_at: string | null })
      ) {
        await supabase
          .from("workflow_schedules")
          .update({
            enabled: false,
            next_run_at: null,
            disabled_reason: UNATTENDED_SEND_DISABLED_REASON
          })
          .eq("id", event.data.scheduleId)
          .eq("user_id", event.data.userId);

        return validationErrorRun(
          "This workflow now sends email, which a schedule may only do with your explicit confirmation. The schedule has been turned off — re-enable it in Workflow Settings to confirm."
        );
      }

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

      // runId derives from the Inngest event id: a retried step replays with
      // the same id, so integration idempotency keys stay stable and a
      // previously sent email is replayed from the ledger, never re-sent.
      return runWorkflowToCompletion(rfNodes, rfEdges, {
        supabase,
        userId: event.data.userId,
        workflowId: event.data.workflowId,
        runId,
        actionsUsed: { count: 0 }
      });
    });

    if ("skipped" in run) {
      return { skipped: run.skipped };
    }

    await step.run("persist-run", async () => {
      const supabase = createAdminSupabaseClient();

      const { error } = await supabase.from("workflow_runs").insert({
        id: runId,
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

      // The failure nobody would otherwise see: a scheduled run that errors,
      // persists its row, advances next_run_at, and repeats tomorrow. run.error
      // is already redacted by the integration layer before it reaches here.
      if (run.status === "error") {
        log("error", LOG_EVENTS.scheduledRunFailed, {
          runId,
          scheduleId: event.data.scheduleId,
          workflowId: event.data.workflowId,
          userId: event.data.userId,
          nodeError: run.error
        });
      }
    });

    // A12: a broken schedule used to fail on schedule forever, notifying
    // nobody. Tracked and disabled in its own step, deliberately separate from
    // the CAS claim in checkDueSchedules — that UPDATE is the only
    // duplicate-run protection in the system and is left untouched.
    await step.run("track-schedule-health", async () => {
      const supabase = createAdminSupabaseClient();

      if (run.status !== "error") {
        // Any success clears the run of failures.
        await supabase
          .from("workflow_schedules")
          .update({ consecutive_failures: 0, disabled_reason: null })
          .eq("id", event.data.scheduleId)
          .eq("user_id", event.data.userId);
        return { failures: 0 };
      }

      const { data: schedule } = await supabase
        .from("workflow_schedules")
        .select("consecutive_failures")
        .eq("id", event.data.scheduleId)
        .eq("user_id", event.data.userId)
        .maybeSingle();

      const failures = (schedule?.consecutive_failures ?? 0) + 1;
      const shouldDisable = failures >= SCHEDULE_LIMITS.AUTO_DISABLE_AFTER_FAILURES;

      await supabase
        .from("workflow_schedules")
        .update({
          consecutive_failures: failures,
          ...(shouldDisable
            ? { enabled: false, next_run_at: null, disabled_reason: AUTO_DISABLED_REASON }
            : {})
        })
        .eq("id", event.data.scheduleId)
        .eq("user_id", event.data.userId);

      if (shouldDisable) {
        // Notification goes through Task 02's reporter rather than a second
        // path: once the operator registers a transport, this becomes a real
        // alert. Disabling without telling anyone would turn a loud problem
        // into a quiet one.
        reportError(
          "schedule.auto_disabled",
          new Error(
            `Schedule disabled after ${failures} consecutive failures.`
          ),
          {
            scheduleId: event.data.scheduleId,
            workflowId: event.data.workflowId,
            userId: event.data.userId,
            consecutiveFailures: failures
          }
        );
      }

      return { failures, disabled: shouldDisable };
    });

    return { status: run.status };
  }
);

// B2. Nothing in this system was ever deleted: workflow_runs holds every node
// full output text, and the ledger and audit log grow without bound.
//
// Deletion is irreversible, so this is fail-closed in two ways. It refuses to
// run unless RETENTION_CLEANUP_ENABLED is exactly "true" — this working copy
// has a live Supabase CLI project link, so a local Inngest dev server would
// otherwise sweep a remote database — and each sweep is its own step, so a
// failure in one does not silently skip the others on a retry.
export const cleanupExpiredData = inngest.createFunction(
  { id: "cleanup-expired-data", retries: 1, triggers: cron("30 3 * * *") },
  async ({ step }) => {
    if (!retentionCleanupEnabled()) {
      return { skipped: "RETENTION_CLEANUP_ENABLED is not \"true\"." };
    }

    const now = new Date();

    const runs = await step.run("delete-expired-runs", async () => {
      const supabase = createAdminSupabaseClient();
      const { data, error } = await supabase
        .from("workflow_runs")
        .delete()
        .lt("created_at", cutoffIso(RETENTION_DAYS.WORKFLOW_RUNS, now))
        .select("id");

      if (error) {
        throw new Error(`Failed to delete expired runs: ${error.message}`);
      }

      return (data ?? []).length;
    });

    const auditEvents = await step.run("delete-expired-audit-events", async () => {
      const supabase = createAdminSupabaseClient();
      const { data, error } = await supabase
        .from("integration_audit_events")
        .delete()
        .lt("created_at", cutoffIso(RETENTION_DAYS.AUDIT_EVENTS, now))
        .select("id");

      if (error) {
        throw new Error(`Failed to delete expired audit events: ${error.message}`);
      }

      return (data ?? []).length;
    });

    const settledLedger = await step.run("delete-settled-ledger-rows", async () => {
      const supabase = createAdminSupabaseClient();
      // Measured from settlement, not creation: a row that sat pending for a
      // month and then succeeded is one day old for this purpose.
      const { data, error } = await supabase
        .from("integration_action_executions")
        .delete()
        .in("status", [...SETTLED_LEDGER_STATUSES])
        .lt("updated_at", cutoffIso(RETENTION_DAYS.LEDGER_SETTLED, now))
        .select("id");

      if (error) {
        throw new Error(`Failed to delete settled ledger rows: ${error.message}`);
      }

      return (data ?? []).length;
    });

    const unsettledLedger = await step.run("delete-unsettled-ledger-rows", async () => {
      const supabase = createAdminSupabaseClient();
      // CLAUDE.md invariant: a pending or unknown row is evidence that an
      // external action may already have happened. The cutoff is well past the
      // 7-day floor, and the floor is asserted rather than assumed so a future
      // edit cannot lower the period underneath it.
      if (RETENTION_DAYS.LEDGER_UNSETTLED < LEDGER_UNSETTLED_FLOOR_DAYS) {
        throw new Error("Unsettled ledger retention is below the 7-day floor.");
      }

      const { data, error } = await supabase
        .from("integration_action_executions")
        .delete()
        .in("status", [...UNSETTLED_LEDGER_STATUSES])
        .lt("created_at", cutoffIso(RETENTION_DAYS.LEDGER_UNSETTLED, now))
        .select("id");

      if (error) {
        throw new Error(`Failed to delete unsettled ledger rows: ${error.message}`);
      }

      return (data ?? []).length;
    });

    // Uploaded files are retained until the user deletes them or their account.
    log("info", "retention.sweep_completed", {
      runs,
      auditEvents,
      settledLedger,
      unsettledLedger
    });

    return { runs, auditEvents, settledLedger, unsettledLedger };
  }
);
