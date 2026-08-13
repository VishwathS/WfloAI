"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Mail } from "lucide-react";

interface GmailStatus {
  connected: boolean;
  email?: string;
  status?: "active" | "requires_reconnect";
  canSend?: boolean;
  canRead?: boolean;
  readActionsEnabled: boolean;
}

interface GmailConnectionCardProps {
  notice?: string;
}

export function GmailConnectionCard({ notice }: GmailConnectionCardProps) {
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  async function loadStatus() {
    try {
      const response = await fetch("/api/integrations/gmail/status");
      if (response.ok) {
        setStatus((await response.json()) as GmailStatus);
      }
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadStatus();
  }, []);

  async function handleDisconnect() {
    setIsDisconnecting(true);
    try {
      await fetch("/api/integrations/gmail/disconnect", { method: "POST" });
      await loadStatus();
    } finally {
      setIsDisconnecting(false);
    }
  }

  const needsReconnect = status?.status === "requires_reconnect";

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50">
          <Mail className="h-4 w-4 text-red-600" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Gmail</h2>
          <p className="text-xs text-gray-500">
            Send, draft, and read email from Gmail nodes in your workflows.
          </p>
        </div>
      </div>

      {notice === "connected" ? (
        <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Gmail connected successfully.
        </p>
      ) : null}
      {notice === "error" ? (
        <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          Connecting Gmail didn&apos;t complete — please try again.
        </p>
      ) : null}

      <div className="mt-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking connection…
          </div>
        ) : status?.connected ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-gray-900">
              {needsReconnect ? (
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              )}
              <span>
                Connected as <span className="font-medium">{status.email}</span>
              </span>
            </div>
            {needsReconnect ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                This connection expired — reconnect to keep Gmail nodes running.
              </p>
            ) : null}
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400">
                Authorized capabilities
              </p>
              <ul className="space-y-1 text-sm text-gray-600">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  Send emails &amp; create drafts
                </li>
                <li className="flex items-center gap-2">
                  {status.canRead ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      Find &amp; read emails
                    </>
                  ) : (
                    <>
                      <span className="inline-block h-3.5 w-3.5 rounded-full border border-gray-300" />
                      Find &amp; read emails — not enabled
                    </>
                  )}
                </li>
              </ul>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {needsReconnect ? (
                <a
                  href="/api/integrations/gmail/connect"
                  className="rounded-full bg-violet-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-violet-700"
                >
                  Reconnect Gmail
                </a>
              ) : null}
              {!status.canRead && status.readActionsEnabled && !needsReconnect ? (
                <a
                  href="/api/integrations/gmail/connect?tier=read"
                  className="rounded-full border border-violet-200 bg-violet-50 px-4 py-1.5 text-sm font-medium text-violet-700 transition hover:bg-violet-100"
                >
                  Enable email reading
                </a>
              ) : null}
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={isDisconnecting}
                className="rounded-full border border-gray-200 px-4 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-60"
              >
                {isDisconnecting ? "Disconnecting…" : "Disconnect"}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Connect your Gmail account once — every Gmail node in your workflows will use it.
            </p>
            <a
              href="/api/integrations/gmail/connect"
              className="inline-block rounded-full bg-violet-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-violet-700"
            >
              Connect Gmail
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
