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
        A workflow is a graph of connected nodes. Each node runs once the nodes feeding
        into it have finished, receives their output, and passes its own output on. Every
        workflow needs at least one Input or File Input node to start from, and the graph
        cannot contain a cycle.
      </p>

      <nav className="mt-6 flex flex-wrap gap-x-4 gap-y-1.5">
        {contents.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="text-sm text-violet-700 hover:underline">
            {label}
          </a>
        ))}
      </nav>

      <Section id="variables" title="Variables">
        <p>
          There are two kinds of variable, and they are easy to mix up.
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
                  The combined output of every node connected <em>into</em> this one. What
                  it contains depends on where the node sits in the graph.
                </td>
              </tr>
              <tr className="border-b border-gray-100 align-top">
                <td className="py-2.5 pr-4">
                  <Code>{"{{yourKey}}"}</Code>
                </td>
                <td className="py-2.5">
                  The value of the Input node whose key is <Code>yourKey</Code>. Keys are
                  declared on Input nodes, so that is the only place the tag appears.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          If a prompt doesn&apos;t mention <Code>{"{{previousOutput}}"}</Code>, the upstream
          output is appended automatically as a &ldquo;Context from previous step&rdquo;
          block, so an AI node with no variables still sees its input. If the prompt does
          mention it, the block is left out so the same text isn&apos;t sent twice.
        </p>
        <p>
          <Code>{"{{input}}"}</Code> is the old name for <Code>{"{{previousOutput}}"}</Code>.
          Lookup queries still accept it, editing a field replaces it, and validation flags
          it as deprecated in AI and Router prompts.
        </p>
      </Section>

      <Section id="gmail" title="Gmail nodes and the Reply rule">
        <p className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-violet-900">
          <span className="font-medium">
            Reply to Email needs a Read Email node as its direct parent.
          </span>{" "}
          Directly connected: not through an AI node, and not a Read node further upstream.
          Without one, the workflow fails validation and does not run.
        </p>
        <p>
          A Reply needs to know which message it is answering, and it gets that from the
          message metadata a Read node passes along, not from any output text. An AI node
          only produces text, so a Reply placed after one has no message to attach to. The
          shape that works is:
        </p>
        <p className="font-mono text-[13px] text-gray-900">
          Find Emails → Read Email → AI (draft the reply) → Reply to Email
        </p>
        <p>
          Connect both the Read node and the AI node into the Reply node: the AI node writes
          the reply, and Read supplies the message it belongs to.
        </p>
        <p>
          <span className="font-medium text-gray-900">
            For now, Send Email is the only Gmail action available.
          </span>{" "}
          Create Draft, Reply, Find and Read all need a restricted Google scope, which requires
          a separate security review, so they stay turned off until that is done. Connecting
          Gmail requests <Code>gmail.send</Code>, plus <Code>openid</Code> and{" "}
          <Code>email</Code> so Settings can show which address is connected. WfloAI cannot
          read your mailbox.
        </p>
      </Section>

      <Section id="nodes" title="Node reference">
        <ul className="space-y-2">
          <li>
            <span className="font-medium text-gray-900">Input</span> — a named value you can
            reference as <Code>{"{{key}}"}</Code>. Scheduled runs use the value saved on the
            node.
          </li>
          <li>
            <span className="font-medium text-gray-900">File Input</span> — upload a PDF,
            DOCX, TXT, MD or CSV and the node outputs its text. Scanned or image-only PDFs are
            rejected, since there is no OCR. Scheduled runs use the most recent upload.
          </li>
          <li>
            <span className="font-medium text-gray-900">AI</span> — runs a prompt through
            Claude. Text mode returns plain text. JSON mode returns a fixed shape for the
            chosen action (Summarize, Rewrite, Classify, Extract or Generate), which lets a
            Router branch on a field instead of parsing prose.
          </li>
          <li>
            <span className="font-medium text-gray-900">Router</span> — splits the graph
            down a <Code>true</Code> or <Code>false</Code> path. Give it a field and a value
            and it compares them against the upstream JSON; leave them empty, or pass it
            plain text, and the model evaluates the condition instead.
          </li>
          <li>
            <span className="font-medium text-gray-900">Lookup</span> — searches the web
            with Tavily and returns 1 to 10 results.
          </li>
          <li>
            <span className="font-medium text-gray-900">Gmail</span> — sends email from your
            connected account.
          </li>
          <li>
            <span className="font-medium text-gray-900">HTTP Request</span> — sends a GET,
            POST, PUT, PATCH or DELETE to a public URL, optionally authenticated with a
            credential from Settings. Requests to private or internal addresses are blocked.
          </li>
          <li>
            <span className="font-medium text-gray-900">Action</span> — ends a branch and
            records the output it receives.
          </li>
        </ul>
      </Section>

      <Section id="schedules" title="Schedules">
        <p>
          Schedules are set up in Workflow Settings, not on the canvas. Without one, a
          workflow runs only when you click Run. A scheduled run uses the workflow as it is
          saved when the schedule fires, so editing a workflow also changes what its
          schedules do.
        </p>
        <p>
          A schedule can run at most once every {SCHEDULE_LIMITS.MIN_INTERVAL_MINUTES}{" "}
          minutes. You can have {SCHEDULE_LIMITS.MAX_SCHEDULES_PER_USER} in total and{" "}
          {SCHEDULE_LIMITS.MAX_SCHEDULES_PER_WORKFLOW} on any one workflow.
        </p>
        <p>
          A schedule that fails {SCHEDULE_LIMITS.AUTO_DISABLE_AFTER_FAILURES} times in a row
          is turned off, and Workflow Settings shows why. A successful run resets the count,
          and so does turning the schedule back on.
        </p>
        <p>
          Turning on a schedule for a workflow that sends email asks you to confirm first,
          because that mail leaves your account while nobody is watching the run.
        </p>
      </Section>

      <Section id="limits" title="Limits">
        <p>
          These limits cap what a misconfigured workflow can spend. A node that would go
          over one fails; it is not queued for later.
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
          Router nodes count as AI calls, including ones that branch on a field match, so a
          workflow with Routers reaches the AI limits sooner than its AI node count suggests.
        </p>
      </Section>

      <Section id="data" title="Your data">
        <p>
          Run history is kept for {RETENTION_DAYS.WORKFLOW_RUNS} days and then deleted
          automatically. Uploaded files are kept until you delete them. Settings has an
          export of your workflows, schedules and run history, and an option to delete your
          account.
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
          If something breaks, or a workflow does something it shouldn&apos;t, email{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="font-medium text-violet-700 hover:underline"
          >
            {SUPPORT_EMAIL}
          </a>
          {" "}with the workflow name and roughly when it ran. If a schedule is sending email
          you didn&apos;t expect, turn it off in Workflow Settings first.
        </p>
      </Section>
    </div>
  );
}
