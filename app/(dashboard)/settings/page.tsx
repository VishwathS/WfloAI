import { redirect } from "next/navigation";
import { GmailConnectionCard } from "@/components/settings/GmailConnectionCard";
import { CredentialsCard } from "@/components/settings/CredentialsCard";
import { DeleteAccountCard } from "@/components/settings/DeleteAccountCard";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface SettingsPageProps {
  searchParams: Promise<{ gmail?: string }>;
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const { gmail } = await searchParams;
  // A4: defense in depth. The middleware allow-list also covers this route, but
  // the page that manages OAuth tokens and API credentials does not rely on a
  // single gate.
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/settings");
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6 lg:p-8">
      <div className="border-b border-gray-100 pb-5">
        <h1 className="text-xl font-semibold tracking-tight text-gray-900">Settings</h1>
      </div>
      <GmailConnectionCard notice={gmail} />
      <CredentialsCard />
      <DeleteAccountCard />
    </div>
  );
}
