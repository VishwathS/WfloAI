import { redirect } from "next/navigation";
import { InviteForm } from "@/components/auth/invite-form";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isApprovedUser } from "@/lib/auth/approval";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function WaitlistPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/waitlist");
  }

  // Defense in depth: the proxy already sends an approved user to the
  // dashboard, but this page must not be a dead end if that check is ever
  // reordered.
  if (await isApprovedUser(supabase, user.id)) {
    redirect("/dashboard");
  }

  return (
    <Card className="w-full max-w-md shadow-panel">
      <CardHeader className="space-y-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-violet-600">
          WfloAI
        </p>
        <div>
          <CardTitle className="text-2xl tracking-tight text-gray-900">
            Enter your invite code
          </CardTitle>
          <CardDescription className="mt-2 text-gray-600">
            WfloAI is currently invite-only. You&apos;re signed in as{" "}
            <span className="font-medium text-gray-900">{user.email}</span>. A valid invite
            code unlocks your account immediately.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <InviteForm />
        <p className="text-xs leading-5 text-gray-500">
          Don&apos;t have a code? Ask the person who told you about WfloAI. Access isn&apos;t
          granted automatically, so without a code there&apos;s nothing to wait for here.
        </p>
        <div className="border-t border-gray-100 pt-4">
          <SignOutButton />
        </div>
      </CardContent>
    </Card>
  );
}
