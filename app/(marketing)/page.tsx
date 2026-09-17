import Link from "next/link";
import { BrainCircuit, Clock, Mail, Search, Workflow } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "WfloAI — AI workflow builder",
  description:
    "Build AI workflows visually: connect nodes on a canvas, run them, and let them run on a schedule."
};

const capabilities = [
  {
    icon: Workflow,
    title: "Visual canvas",
    body: "Drag nodes onto a canvas and connect them. The graph is the program — there is nothing else to configure."
  },
  {
    icon: BrainCircuit,
    title: "AI steps",
    body: "Summarize, rewrite, classify, extract, or generate. Each step emits typed output that the next step can branch on."
  },
  {
    icon: Search,
    title: "Web lookup",
    body: "Pull live search results into a run and pass them downstream as context."
  },
  {
    icon: Mail,
    title: "Gmail send",
    body: "Connect your Google account once and let a workflow send mail as you. Sending is the only Gmail permission requested."
  },
  {
    icon: Clock,
    title: "Schedules",
    body: "Run a workflow on a cron schedule in the background, with run history you can read afterwards."
  }
];

export default function HomePage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-16 lg:py-24">
      <section className="max-w-2xl">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-violet-600">
          AI workflow studio
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl">
          Build AI workflows you can see.
        </h1>
        <p className="mt-5 text-lg leading-8 text-gray-600">
          WfloAI is a visual builder for AI automations. Connect nodes on a canvas, run the
          graph, and watch results stream through it. Then put it on a schedule and let it
          run without you.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link href="/login" className={cn(buttonVariants({ size: "lg" }))}>
            Sign in with Google
          </Link>
          <Link
            href="/privacy"
            className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
          >
            How we handle your data
          </Link>
        </div>
      </section>

      <section className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {capabilities.map(({ icon: Icon, title, body }) => (
          <div
            key={title}
            className="rounded-xl border border-gray-200 bg-white p-5 shadow-card"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
              <Icon className="h-4 w-4" />
            </div>
            <h2 className="mt-4 text-sm font-semibold text-gray-900">{title}</h2>
            <p className="mt-1.5 text-sm leading-6 text-gray-600">{body}</p>
          </div>
        ))}
      </section>

      <section className="mt-16 rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <h2 className="text-sm font-semibold text-gray-900">Built on AI you should check</h2>
        <p className="mt-1.5 max-w-3xl text-sm leading-6 text-gray-600">
          Workflow steps are executed by large language models. Their output can be wrong,
          incomplete, or fabricated, and it is not reviewed before it reaches whatever the
          workflow does next — including email it sends on your behalf. Read what a workflow
          produces before you trust it.
        </p>
      </section>
    </div>
  );
}
