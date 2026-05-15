"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createBrowserSupabaseClient } from "@/lib/supabase";

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <Button
      variant="outline"
      className="w-full justify-start border-white/10 bg-white/8 text-slate-100 hover:bg-white/14 hover:text-white"
      onClick={handleSignOut}
    >
      <LogOut className="mr-2 h-4 w-4" />
      Sign out
    </Button>
  );
}
