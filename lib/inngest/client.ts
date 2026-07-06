import { Inngest, eventType, staticSchema } from "inngest";

export const workflowScheduleDue = eventType("workflow/schedule.due", {
  schema: staticSchema<{
    scheduleId: string;
    workflowId: string;
    userId: string;
  }>()
});

export const inngest = new Inngest({ id: "wfloai" });
