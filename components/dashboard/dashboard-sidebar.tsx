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
    <aside className="flex flex-col gap-5 rounded-[28px] border border-gray-200 bg-white p-4 shadow-sm">
      <div className="rounded-[20px] border border-gray-100 bg-gray-50 p-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
            <Bot className="h-4 w-4" />
          </div>
          <div>
            <p className="text-base font-semibold tracking-tight text-gray-900">FlowAI</p>
            <p className="text-[10px] uppercase tracking-[0.24em] text-gray-400">
              AI workflow studio
            </p>
          </div>
        </div>
      </div>

      <nav className="space-y-1">
        <Link
          href="/"
          className="flex items-center gap-3 rounded-2xl border border-violet-200 bg-violet-50 px-3.5 py-2.5 text-sm font-medium text-violet-700 transition hover:bg-violet-100"
        >
          <LayoutGrid className="h-4 w-4" />
          Dashboard
        </Link>
      </nav>

      <div className="rounded-[20px] border border-gray-100 bg-gray-50 p-3.5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-400">
            Builder mode
          </p>
          <Workflow className="h-4 w-4 text-violet-400" />
        </div>
        <p className="text-sm leading-6 text-gray-600">
          Shape automations visually, then layer in AI nodes and orchestration logic.
        </p>
      </div>

      <div className="rounded-[20px] border border-gray-100 bg-gray-50 p-3.5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-xl bg-violet-100 p-2 text-violet-600">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-gray-900">Signed in</p>
            <p className="break-all text-sm text-gray-500">
              {user?.email ?? "No active session"}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-auto">
        <SignOutButton />
      </div>
    </aside>
  );
}
