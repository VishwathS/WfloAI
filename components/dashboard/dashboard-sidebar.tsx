import Link from "next/link";
import { Bot, LayoutGrid, Sparkles, Workflow } from "lucide-react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function DashboardSidebar() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  return (
    <aside className="relative flex flex-col overflow-hidden rounded-[28px] border border-white/40 bg-[linear-gradient(180deg,#082f49_0%,#0f172a_48%,#111827_100%)] p-4 text-slate-100 shadow-[0_30px_80px_-35px_rgba(8,47,73,0.85)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.28),transparent_68%)]" />
      <div className="pointer-events-none absolute -right-16 bottom-20 h-40 w-40 rounded-full bg-orange-400/10 blur-3xl" />

      <div className="relative rounded-[24px] border border-white/10 bg-white/8 p-3.5 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-300/15 text-cyan-200 ring-1 ring-cyan-100/20">
            <Bot className="h-4.5 w-4.5" />
          </div>
          <div>
            <p className="text-lg font-semibold tracking-tight text-white">FlowAI</p>
            <p className="text-[10px] uppercase tracking-[0.24em] text-cyan-200/70">
              AI workflow studio
            </p>
          </div>
        </div>
      </div>

      <nav className="relative mt-6 space-y-2">
        <Link
          href="/"
          className="flex items-center gap-3 rounded-2xl border border-cyan-300/15 bg-cyan-300/10 px-3.5 py-2.5 text-sm font-medium text-white transition hover:bg-cyan-300/15"
        >
          <LayoutGrid className="h-4 w-4" />
          Dashboard
        </Link>
      </nav>

      <div className="relative mt-6 rounded-[24px] border border-white/10 bg-white/8 p-3.5 backdrop-blur-sm">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
            Builder mode
          </p>
          <Workflow className="h-4 w-4 text-cyan-200/80" />
        </div>
        <p className="text-sm leading-6 text-slate-200">
          Shape automations visually, then layer in AI nodes and orchestration logic.
        </p>
      </div>

      <div className="relative mt-4 rounded-[24px] border border-white/10 bg-white/8 p-3.5 backdrop-blur-sm">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-xl bg-cyan-300/15 p-2 text-cyan-200">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-white">Signed in</p>
            <p className="break-all text-sm text-slate-300/80">
              {user?.email ?? "No active session"}
            </p>
          </div>
        </div>
      </div>

      <div className="relative mt-auto pt-6">
        <SignOutButton />
      </div>
    </aside>
  );
}
