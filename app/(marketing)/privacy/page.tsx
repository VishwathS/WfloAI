import Link from "next/link";
import { DraftBanner } from "@/components/marketing/DraftBanner";
import { SUPPORT_EMAIL } from "@/lib/support";
// Task 12 Completion Criteria: the periods here and in the sweep must be the
// same numbers. Importing them is how that stays true.
import {
  LEDGER_UNSETTLED_FLOOR_DAYS,
  RETENTION_DAYS
} from "@/lib/retention/constants";

export const metadata = {
  title: "Privacy Policy — WfloAI",
  description: "What WfloAI stores, who it sends data to, and how long it keeps it."
};

const LAST_UPDATED = "17 September 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold tracking-tight text-gray-900">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-6 text-gray-600">{children}</div>
    </section>
  );
}

const stored = [
  {
    category: "Account identity",
    detail:
      "Your Google account identifier and email address, received from Google when you sign in."
  },
  {
    category: "Workflows",
    detail:
      "Everything you put on the canvas: step names, prompts, search queries, request URLs, header names, and recipient addresses."
  },
  {
    category: "Run history",
    detail:
      "Every run of a workflow, including the full text output of each step, its status, and its timing."
  },
  {
    category: "Uploaded files",
    detail:
      "The file you upload and the text extracted from it (up to 200,000 characters). Raw files are held in private storage readable only by your account."
  },
  {
    category: "Gmail connection",
    detail:
      "If you connect Gmail: your connected address, the permissions Google granted, and access and refresh tokens, encrypted at rest."
  },
  {
    category: "Third-party credentials",
    detail:
      "Any API keys you add for the HTTP Request step, encrypted at rest. They are write-only — no part of the application ever returns them to a browser."
  },
  {
    category: "Integration records",
    detail:
      "A record of each external action a workflow takes (send, draft, HTTP request), used to prevent duplicate sends and enforce usage limits, plus an audit log of those actions. Neither stores credential values."
  }
];

const subprocessors = [
  {
    name: "Anthropic",
    purpose: "Runs the AI steps.",
    data: "The prompt for the step and the output of the steps feeding into it."
  },
  {
    name: "Tavily",
    purpose: "Runs the web Lookup step.",
    data: "The search query the step produces."
  },
  {
    name: "Google",
    purpose: "Sign-in, and sending mail when you connect Gmail.",
    data: "Your identity at sign-in; the message body and recipients of any mail a workflow sends."
  },
  {
    name: "Supabase",
    purpose: "Database, authentication and file storage.",
    data: "Everything listed in the section above."
  },
  {
    name: "Inngest",
    purpose: "Triggers scheduled runs in the background.",
    data: "Workflow and schedule identifiers. Not workflow content."
  },
  {
    name: "Hosting provider",
    purpose: "Runs the application itself.",
    data: "Request data in transit, and server logs."
  }
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12 lg:py-16">
      <DraftBanner />

      <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Privacy Policy</h1>
      <p className="mt-2 text-sm text-gray-500">Last updated {LAST_UPDATED}</p>

      <p className="mt-6 text-sm leading-6 text-gray-600">
        WfloAI lets you build automations that call AI models, search the web, send email as
        you, and make HTTP requests to services you choose. This policy describes what that
        means for your data in concrete terms rather than in general ones.
      </p>

      <Section title="What we store">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="py-2 pr-4 font-semibold text-gray-900">Category</th>
                <th className="py-2 font-semibold text-gray-900">What it includes</th>
              </tr>
            </thead>
            <tbody>
              {stored.map(({ category, detail }) => (
                <tr key={category} className="border-b border-gray-100 align-top">
                  <td className="py-2.5 pr-4 font-medium text-gray-900">{category}</td>
                  <td className="py-2.5 text-gray-600">{detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Google user data">
        <p>
          Signing in uses your Google account. We receive your account identifier and email
          address, and nothing else.
        </p>
        <p>
          Connecting Gmail is separate and optional. When you connect it, WfloAI requests
          one Gmail permission, <span className="font-medium text-gray-900">gmail.send</span>,
          which allows sending mail on your behalf, together with Google&apos;s basic
          identity permissions, <span className="font-medium text-gray-900">openid</span> and{" "}
          <span className="font-medium text-gray-900">email</span>, which tell WfloAI the
          address of the Google account you connected so Settings can show it. None of these
          allow reading your mailbox, listing your messages, or creating drafts, and WfloAI
          does not request any permission that would.
        </p>
        <p>
          Mail is sent only when a workflow you built runs a step that sends it. The message
          body and recipients are composed by your workflow, pass through our servers, and go
          to Google. We record that a send happened, and the message and thread identifiers
          Google returns, so a retry cannot send the same mail twice. Those identifiers are
          never shown in the interface and are never given to an AI step.
        </p>
        <p className="font-medium text-gray-900">
          The WfloAI use of information received from Google APIs adheres to the Google API
          Services User Data Policy, including the Limited Use requirements. Google user data
          is used only to provide the features you ask for, is not sold, is not used for
          advertising, and is not used to train any AI model.
        </p>
      </Section>

      <Section title="Who else sees your data">
        <p>These are the services WfloAI relies on. Each receives only what is described.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="py-2 pr-4 font-semibold text-gray-900">Service</th>
                <th className="py-2 pr-4 font-semibold text-gray-900">Why</th>
                <th className="py-2 font-semibold text-gray-900">What it receives</th>
              </tr>
            </thead>
            <tbody>
              {subprocessors.map(({ name, purpose, data }) => (
                <tr key={name} className="border-b border-gray-100 align-top">
                  <td className="py-2.5 pr-4 font-medium text-gray-900">{name}</td>
                  <td className="py-2.5 pr-4 text-gray-600">{purpose}</td>
                  <td className="py-2.5 text-gray-600">{data}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          The Anthropic commercial terms provide that it does not train its models on API
          customer content, and that API inputs and outputs are deleted within 30 days unless
          a longer-retention feature is used. WfloAI has not negotiated a zero-retention
          agreement and does not claim one.
        </p>
        <p>
          <span className="font-medium text-gray-900">Error monitoring.</span> WfloAI does not
          currently send data to an external error-monitoring service. If one is added, it
          will be named here before it is turned on.
        </p>
      </Section>

      <Section title="The HTTP Request step sends data wherever you point it">
        <p>
          A workflow can include an HTTP Request step. When it runs, our servers send the URL,
          headers and request body you configured to the address you configured, using any
          credential you attached. That destination is your choice, it is not one of the
          services listed above, and this policy cannot describe what it does with the data.
        </p>
        <p>
          Requests are blocked from reaching private or internal network addresses, and
          credentials are stripped when a redirect crosses to a different origin. Those are
          protections against abuse of our infrastructure — they are not a review of the
          destination you chose.
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>
          Your workflows, files and connections are kept until you delete them or ask us to
          delete your account.
        </p>
        <p>
          Run history is deleted automatically after{" "}
          <span className="font-medium text-gray-900">{RETENTION_DAYS.WORKFLOW_RUNS} days</span>.
          That includes the full text output of every step in the run.
        </p>
        <p>
          Our internal records of external actions are deleted on the same schedule: the audit
          log after {RETENTION_DAYS.AUDIT_EVENTS} days, and the record used to prevent
          duplicate sends {RETENTION_DAYS.LEDGER_SETTLED} days after the action it describes
          finished. A record of an action whose outcome is still unresolved is held for at
          least {LEDGER_UNSETTLED_FLOOR_DAYS} days, because deleting it is what would let a
          retry send the same email twice.
        </p>
        <p>
          Uploaded files are kept until you delete them or delete your account.
        </p>
      </Section>

      <Section title="Your choices">
        <p>
          You can delete any workflow, file or stored credential from within the application
          at any time. Deleting a workflow deletes its run history.
        </p>
        <p>
          You can disconnect Gmail at any time from Settings, which removes the stored tokens.
          You can also revoke WfloAI access directly from the permissions page of your Google
          account.
        </p>
        <p>
          You can delete your entire account from Settings. Deleting it revokes WfloAI access
          to your Google account, removes your uploaded files from storage, and deletes your
          account and everything linked to it — workflows, schedules, run history, uploaded
          file records, and stored credentials. It happens immediately, it cannot be undone,
          and nothing can be recovered afterwards.
        </p>
        <p>
          Settings also offers an export of your workflows, schedules and run history as
          JSON. Stored secrets are not included in it, because the application never returns
          a stored secret to a browser.
        </p>
      </Section>

      <Section title="Security">
        <p>
          Gmail tokens and third-party credentials are encrypted before they are stored.
          Database access is restricted per account at the database level, so one account
          cannot read the data of another. Credentials are never returned to a browser, and
          are removed from step output and error messages before either is stored or shown.
        </p>
        <p>
          No system is perfectly secure, and this section describes measures rather than
          guarantees.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          If this policy changes in a way that affects how your data is used, the date at the
          top will change and the change will be described here.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about this policy, or requests about your data, go to{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="font-medium text-violet-700 hover:underline"
          >
            {SUPPORT_EMAIL}
          </a>.
        </p>
        <p>
          See also the{" "}
          <Link href="/terms" className="font-medium text-violet-700 hover:underline">
            Terms of Service
          </Link>
          .
        </p>
      </Section>
    </div>
  );
}
