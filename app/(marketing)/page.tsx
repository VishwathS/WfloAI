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
    body: "Drag nodes onto a canvas and connect them. Nodes execute in dependency order, and each one receives the output of the nodes connected into it."
  },
  {
    icon: BrainCircuit,
    title: "AI nodes",
    body: "Summarize, rewrite, classify, extract, or generate with Claude. In JSON mode each action returns a fixed schema that a Router node can branch on."
  },
  {
    icon: Search,
    title: "Web search",
    body: "Search the web with Tavily and pass the results downstream as context."
  },
  {
    icon: Mail,
    title: "Gmail send",
    body: "Send email from a connected Gmail account. The only Gmail scope requested is gmail.send."
  },
  {
    icon: Clock,
    title: "Schedules",
    body: "Run a workflow on a cron schedule. Scheduled runs are recorded in run history alongside manual ones."
  }
];

export default function HomePage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-16 lg:py-24">
      <section className="max-w-2xl">
        <h1 className="text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl">
          Build and run AI workflows visually.
        </h1>
        <p className="mt-5 text-lg leading-8 text-gray-600">
          Connect Claude, web search, HTTP requests, uploaded files, and Gmail as nodes on a
          canvas. Run the graph and watch each node&apos;s output stream in, or run it on a
          schedule.
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
        <h2 className="text-sm font-semibold text-gray-900">Check model output</h2>
        <p className="mt-1.5 max-w-3xl text-sm leading-6 text-gray-600">
          AI and Router nodes call a large language model. Its output can be wrong,
          incomplete, or fabricated, and it is not reviewed before it reaches the next node —
          including a Gmail node that sends email on your behalf. Read what a workflow
          produces before you rely on it.
        </p>
      </section>
    </div>
  );
}
