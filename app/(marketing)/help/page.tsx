import Link from "next/link";
import { EXECUTION_LIMITS } from "@/lib/execution/constants";
import { INTEGRATION_LIMITS } from "@/lib/integrations/limits";
import { RETENTION_DAYS } from "@/lib/retention/constants";
import { SCHEDULE_LIMITS } from "@/lib/schedule/constants";
import { SUPPORT_EMAIL } from "@/lib/support";

export const metadata = {
  title: "Help — WfloAI",
  description: "How workflows, variables, Gmail nodes, schedules and limits work."
};

// B10. Every number on this page is imported from the module that enforces it
// rather than typed in, so the documentation cannot drift from the product.

function Section({
  id,
  title,
  children
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-12 scroll-mt-8">
      <h2 className="text-lg font-semibold tracking-tight text-gray-900">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-6 text-gray-600">{children}</div>
    </section>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[13px] text-gray-900">
      {children}
    </code>
  );
}

const contents: [string, string][] = [
  ["variables", "Variables"],
  ["gmail", "Gmail nodes and the Reply rule"],
  ["nodes", "Node reference"],
  ["schedules", "Schedules"],
  ["limits", "Limits"],
  ["data", "Your data"],
  ["contact", "Contact"]
];

export default function HelpPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12 lg:py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Help</h1>
      <p className="mt-3 text-sm leading-6 text-gray-600">
        A workflow is a directed acyclic graph of nodes. Nodes run in dependency order;
        each one receives the output of the nodes connected into it and passes its own
        output downstream.
      </p>

      <nav className="mt-6 flex flex-wrap gap-x-4 gap-y-1.5">
        {contents.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="text-sm text-violet-700 hover:underline">
            {label}
          </a>
        ))}
      </nav>

      <Section id="variables" title="Variables: previousOutput vs your own keys">
        <p>
          These look similar but resolve to different values.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="py-2 pr-4 font-semibold text-gray-900">You write</th>
                <th className="py-2 font-semibold text-gray-900">It becomes</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100 align-top">
                <td className="py-2.5 pr-4">
                  <Code>{"{{previousOutput}}"}</Code>
                </td>
                <td className="py-2.5">
                  The combined output of every node connected <em>into</em> this one. It
                  depends on where the node sits in the graph, not on anything you name.
                </td>
              </tr>
              <tr className="border-b border-gray-100 align-top">
                <td className="py-2.5 pr-4">
                  <Code>{"{{yourKey}}"}</Code>
                </td>
                <td className="py-2.5">
                  The value of the Input node whose key is <Code>yourKey</Code>. Variables
                  are declared on Input nodes, which is why the tag is shown only there.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          When a prompt references <Code>{"{{previousOutput}}"}</Code> explicitly, the
          automatic &ldquo;Context from previous step&rdquo; block is omitted so the upstream
          text is not sent twice. Otherwise the block is added, so an AI node with no
          variables still receives its input.
        </p>
        <p>
          <Code>{"{{input}}"}</Code> is the old spelling. It still works in Lookup queries,
          the canvas rewrites it when you edit a field, and validation flags it as
          deprecated in AI and Router prompts.
        </p>
      </Section>

      <Section id="gmail" title="Gmail nodes and the Reply rule">
        <p className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-violet-900">
          <span className="font-medium">
            Reply to Email needs a Read Email node as its direct parent.
          </span>{" "}
          Not an AI node in between, not a Read node further upstream — directly connected.
          Without one, validation fails and the workflow does not run.
        </p>
        <p>
          A Reply has to know which message it is replying to. That is resolved from the
          typed metadata a Read node emits, not from output text. An AI node in between
          produces text, which carries no message ID, so the reply would have nothing to
          attach to. The working shape is:
        </p>
        <p className="font-mono text-[13px] text-gray-900">
          Find Emails → Read Email → AI (draft the reply) → Reply to Email
        </p>
        <p>
          The AI node still sits in the chain, just not between Read and Reply. Connect both
          the Read node and the AI node into the Reply node.
        </p>
        <p>
          <span className="font-medium text-gray-900">
            In this version, Send Email is the only Gmail action available.
          </span>{" "}
          Create Draft, Reply, Find and Read each need a restricted Google scope that requires
          an additional security review, so they are disabled. Connecting Gmail requests the{" "}
          <Code>gmail.send</Code> scope, plus <Code>openid</Code> and <Code>email</Code> to
          show which address is connected. It cannot read your mailbox.
        </p>
      </Section>

      <Section id="nodes" title="Node reference">
        <ul className="space-y-2">
          <li>
            <span className="font-medium text-gray-900">Trigger</span> — the entry point of a
            run.
          </li>
          <li>
            <span className="font-medium text-gray-900">Input</span> — a named value you can
            reference as <Code>{"{{key}}"}</Code>. A schedule can override it.
          </li>
          <li>
            <span className="font-medium text-gray-900">File Input</span> — upload a PDF,
            DOCX, TXT, MD or CSV; the node outputs the text extracted from it. Scanned or
            image-only PDFs are rejected because there is no OCR.
          </li>
          <li>
            <span className="font-medium text-gray-900">AI</span> — runs a prompt through
            Claude. Text mode returns free text. JSON mode takes an action — Summarize,
            Rewrite, Classify, Extract or Generate — and returns a fixed JSON shape, so a
            Router can branch on a field rather than parse prose.
          </li>
          <li>
            <span className="font-medium text-gray-900">Router</span> — splits the graph
            down a <Code>true</Code> or <Code>false</Code> path. Set a field and a value to
            branch deterministically on upstream JSON; leave them empty and the model
            evaluates the condition.
          </li>
          <li>
            <span className="font-medium text-gray-900">Lookup</span> — a Tavily web search
            returning 1 to 10 results.
          </li>
          <li>
            <span className="font-medium text-gray-900">Gmail</span> — sends email from your
            connected account.
          </li>
          <li>
            <span className="font-medium text-gray-900">HTTP Request</span> — sends a GET,
            POST, PUT, PATCH or DELETE request to a public URL, optionally authenticated with
            a credential stored in Settings. Private and internal addresses are blocked.
          </li>
          <li>
            <span className="font-medium text-gray-900">Action</span> — ends a branch and
            records the output it receives.
          </li>
        </ul>
      </Section>

      <Section id="schedules" title="Schedules">
        <p>
          Schedules are configured in Workflow Settings, not on the canvas; a workflow with
          none runs only when you click Run. A scheduled run executes the graph as saved at
          the moment it fires, so editing a workflow changes what its schedules do.
        </p>
        <p>
          A schedule can run at most once every {SCHEDULE_LIMITS.MIN_INTERVAL_MINUTES}{" "}
          minutes. You can have {SCHEDULE_LIMITS.MAX_SCHEDULES_PER_USER} in total and{" "}
          {SCHEDULE_LIMITS.MAX_SCHEDULES_PER_WORKFLOW} on any one workflow.
        </p>
        <p>
          If a schedule fails {SCHEDULE_LIMITS.AUTO_DISABLE_AFTER_FAILURES} times in a row
          it is disabled, and Workflow Settings shows why. Any successful run resets the
          count, and re-enabling the schedule clears it.
        </p>
        <p>
          Enabling a schedule on a workflow that sends email asks you to confirm first. That
          confirmation is about <em>unattended</em> sending — mail leaving your account
          while you are not there to notice a mistake.
        </p>
      </Section>

      <Section id="limits" title="Limits">
        <p>
          These cap what a misconfigured workflow can spend. A node that would exceed a
          limit fails; it is not queued.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[440px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="py-2 pr-4 font-semibold text-gray-900">Limit</th>
                <th className="py-2 font-semibold text-gray-900">Value</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["AI calls per minute", INTEGRATION_LIMITS.AI_CALLS_PER_MINUTE],
                  ["AI calls per day", INTEGRATION_LIMITS.AI_CALLS_PER_DAY],
                  ["Lookups per minute", INTEGRATION_LIMITS.LOOKUP_SEARCHES_PER_MINUTE],
                  ["Lookups per day", INTEGRATION_LIMITS.LOOKUP_SEARCHES_PER_DAY],
                  ["Emails per minute", INTEGRATION_LIMITS.GMAIL_SENDS_PER_MINUTE],
                  ["Emails per day", INTEGRATION_LIMITS.GMAIL_SENDS_PER_DAY],
                  ["AI and Router nodes per run", INTEGRATION_LIMITS.MAX_AI_NODES_PER_RUN],
                  ["Nodes per run", EXECUTION_LIMITS.MAX_NODES_PER_RUN]
                ] as [string, number][]
              ).map(([label, value]) => (
                <tr key={label} className="border-b border-gray-100">
                  <td className="py-2.5 pr-4">{label}</td>
                  <td className="py-2.5 font-medium text-gray-900">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Every Router node counts as an AI call, even when it branches on a field match,
          so a workflow can reach the AI limits sooner than its number of AI nodes suggests.
        </p>
      </Section>

      <Section id="data" title="Your data">
        <p>
          Run history is kept for {RETENTION_DAYS.WORKFLOW_RUNS} days and then deleted
          automatically. Uploaded files are kept until you delete them. Settings has an
          export of your workflows, schedules and run history, and a way to delete your
          account outright.
        </p>
        <p>
          The{" "}
          <Link href="/privacy" className="font-medium text-violet-700 hover:underline">
            Privacy Policy
          </Link>{" "}
          describes what is stored and who it is sent to.
        </p>
      </Section>

      <Section id="contact" title="Contact">
        <p>
          Something broken, or a workflow doing something it should not? Email{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="font-medium text-violet-700 hover:underline"
          >
            {SUPPORT_EMAIL}
          </a>
          . Include the workflow name and roughly when it ran. If a schedule is sending email
          you did not expect, turn the schedule off in Workflow Settings first, then write.
        </p>
      </Section>
    </div>
  );
}
