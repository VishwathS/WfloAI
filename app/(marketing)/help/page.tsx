import Link from "next/link";
import { EXECUTION_LIMITS } from "@/lib/execution/constants";
import { INTEGRATION_LIMITS } from "@/lib/integrations/limits";
import { RETENTION_DAYS } from "@/lib/retention/constants";
import { SCHEDULE_LIMITS } from "@/lib/schedule/constants";

export const metadata = {
  title: "Help — WfloAI",
  description: "How workflows, variables, Gmail steps, schedules and limits work."
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
  ["gmail", "Gmail steps, and the Reply rule"],
  ["nodes", "What each step does"],
  ["schedules", "Schedules"],
  ["limits", "Limits"],
  ["data", "Your data"]
];

export default function HelpPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12 lg:py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Help</h1>
      <p className="mt-3 text-sm leading-6 text-gray-600">
        A workflow is a graph. Each step receives the output of the steps connected into
        it, does one thing, and passes its own output on. Everything below follows from
        that.
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
          These two look alike and mean different things. Almost every confusing result
          traces back to using one where the other was meant.
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
                  The combined output of every step connected <em>into</em> this one. It
                  depends on where the step sits in the graph, not on anything you name.
                </td>
              </tr>
              <tr className="border-b border-gray-100 align-top">
                <td className="py-2.5 pr-4">
                  <Code>{"{{yourKey}}"}</Code>
                </td>
                <td className="py-2.5">
                  The value of the Input step whose key is <Code>yourKey</Code>. Input steps
                  are where variables are declared, which is why the tag is shown on them
                  and nowhere else.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          One thing worth knowing: when a prompt mentions <Code>{"{{previousOutput}}"}</Code>{" "}
          explicitly, the automatic &ldquo;Context from previous step&rdquo; block is left
          out, so the upstream text is not sent twice. If you do not mention it, that block
          is added for you — so an AI step with no variables at all still sees its input.
        </p>
        <p>
          <Code>{"{{input}}"}</Code> is the old spelling. It still works in Lookup queries,
          the canvas rewrites it when you edit a field, and validation flags it as
          deprecated in AI and Router prompts.
        </p>
      </Section>

      <Section id="gmail" title="Gmail steps, and the Reply rule">
        <p className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-violet-900">
          <span className="font-medium">
            Reply to Email needs a Read Email step as its direct parent.
          </span>{" "}
          Not an AI step in between, not a Read step further upstream — directly connected.
          Without one the workflow refuses to run.
        </p>
        <p>
          The reason is that a Reply has to know which message it is replying to, and that
          is resolved from the typed metadata a Read step emits rather than by reading text.
          An AI step in between produces text, which carries no message identity, so the
          reply would have nothing to attach to. The working shape is:
        </p>
        <p className="font-mono text-[13px] text-gray-900">
          Find Emails → Read Email → AI (draft the reply) → Reply to Email
        </p>
        <p>
          The AI step still sits in the chain — it just cannot sit between Read and Reply.
          Connect both the Read step and the AI step into the Reply step.
        </p>
        <p>
          <span className="font-medium text-gray-900">
            In this version, Send Email is the only Gmail action available.
          </span>{" "}
          Create Draft, Reply, Find and Read each need a Google permission that requires an
          additional security review, so they are turned off. Connecting Gmail asks for
          permission to send, and nothing else — it cannot read your mailbox.
        </p>
      </Section>

      <Section id="nodes" title="What each step does">
        <ul className="space-y-2">
          <li>
            <span className="font-medium text-gray-900">Trigger</span> — where a run starts.
          </li>
          <li>
            <span className="font-medium text-gray-900">Input</span> — a named value you can
            reference as <Code>{"{{key}}"}</Code>. A schedule can override it.
          </li>
          <li>
            <span className="font-medium text-gray-900">File Input</span> — upload a PDF,
            DOCX, TXT, MD or CSV; the step outputs the text extracted from it. Scanned or
            image-only PDFs are rejected, because there is no OCR.
          </li>
          <li>
            <span className="font-medium text-gray-900">AI</span> — Summarize, Rewrite,
            Classify, Extract or Generate. Each emits a fixed JSON shape, so the next step
            can branch on a field rather than parse prose.
          </li>
          <li>
            <span className="font-medium text-gray-900">Router</span> — splits the graph
            down a <Code>true</Code> or <Code>false</Code> path. Set a field and a value to
            branch deterministically; leave them empty and the AI decides.
          </li>
          <li>
            <span className="font-medium text-gray-900">Lookup</span> — a web search, 1 to
            10 results.
          </li>
          <li>
            <span className="font-medium text-gray-900">Gmail</span> — sends mail as you.
          </li>
          <li>
            <span className="font-medium text-gray-900">HTTP Request</span> — calls any
            service you point it at, optionally with a credential you stored in Settings.
          </li>
          <li>
            <span className="font-medium text-gray-900">Action</span> — saves, logs or
            displays a result.
          </li>
        </ul>
      </Section>

      <Section id="schedules" title="Schedules">
        <p>
          Schedules live in Workflow Settings, not on the canvas — a workflow with none is
          simply run by hand. A scheduled run uses the workflow as it is saved at the moment
          it fires, so editing a workflow changes what its schedules will do.
        </p>
        <p>
          A schedule can run at most once every {SCHEDULE_LIMITS.MIN_INTERVAL_MINUTES}{" "}
          minutes. You can have {SCHEDULE_LIMITS.MAX_SCHEDULES_PER_USER} in total and{" "}
          {SCHEDULE_LIMITS.MAX_SCHEDULES_PER_WORKFLOW} on any one workflow.
        </p>
        <p>
          If a schedule fails {SCHEDULE_LIMITS.AUTO_DISABLE_AFTER_FAILURES} times in a row
          it turns itself off and says so in Workflow Settings, rather than failing quietly
          forever. Any success resets the count. Re-enabling it is deliberate, and clears
          the counter.
        </p>
        <p>
          Enabling a schedule on a workflow that sends email asks you to confirm first. That
          confirmation is about <em>unattended</em> sending — mail leaving your account
          while you are not there to notice a mistake.
        </p>
      </Section>

      <Section id="limits" title="Limits">
        <p>
          These exist so a mistake in a workflow cannot run up an unbounded bill. A step
          that would cross a limit stops; it does not queue.
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
                  ["AI steps per minute", INTEGRATION_LIMITS.AI_CALLS_PER_MINUTE],
                  ["AI steps per day", INTEGRATION_LIMITS.AI_CALLS_PER_DAY],
                  ["Lookups per minute", INTEGRATION_LIMITS.LOOKUP_SEARCHES_PER_MINUTE],
                  ["Lookups per day", INTEGRATION_LIMITS.LOOKUP_SEARCHES_PER_DAY],
                  ["Emails per minute", INTEGRATION_LIMITS.GMAIL_SENDS_PER_MINUTE],
                  ["Emails per day", INTEGRATION_LIMITS.GMAIL_SENDS_PER_DAY],
                  ["AI steps in a single run", INTEGRATION_LIMITS.MAX_AI_NODES_PER_RUN],
                  ["Steps in a single run", EXECUTION_LIMITS.MAX_NODES_PER_RUN]
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
          A Router step is an AI call and counts as one. That surprises people whose
          workflow hits the AI limit sooner than the number of AI steps suggests.
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
    </div>
  );
}
