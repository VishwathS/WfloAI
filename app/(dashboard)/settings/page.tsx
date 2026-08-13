import { GmailConnectionCard } from "@/components/settings/GmailConnectionCard";
import { CredentialsCard } from "@/components/settings/CredentialsCard";

export const dynamic = "force-dynamic";

interface SettingsPageProps {
  searchParams: { gmail?: string };
}

export default function SettingsPage({ searchParams }: SettingsPageProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage integrations and credentials used by your workflows.
        </p>
      </div>
      <GmailConnectionCard notice={searchParams.gmail} />
      <CredentialsCard />
    </div>
  );
}
