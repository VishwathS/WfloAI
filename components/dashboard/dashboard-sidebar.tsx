import { Bot, Sparkles } from "lucide-react";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function DashboardSidebar() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  return (
    <aside className="flex flex-col gap-5 rounded-2xl border border-gray-200 bg-white p-4 shadow-card lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto">
      <div className="flex items-center gap-3 px-1.5 pt-1">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
          <Bot className="h-4 w-4" />
        </div>
        <p className="text-sm font-semibold tracking-tight text-gray-900">WfloAI</p>
      </div>

      <SidebarNav />

      <div className="rounded-xl border border-gray-100 bg-gray-50 p-3.5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg bg-violet-100 p-2 text-violet-600">
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
