"use client";

import { useState } from "react";
import { AlertTriangle, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const CONFIRMATION = "DELETE MY ACCOUNT";

const fieldClass =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-rose-400 focus:ring-2 focus:ring-rose-500/25";

export function DeleteAccountCard() {
  const [confirmation, setConfirmation] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation })
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(payload.error ?? "Account deletion failed.");
        return;
      }

      // A full document navigation on purpose: the account and its session are
      // gone, so the router cache and every client component holding the old
      // session must be discarded rather than soft-navigated over.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/";
    } catch {
      setError("Could not reach the server. Nothing was deleted.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white shadow-card">
      <div className="border-b border-gray-100 px-5 py-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400">
          Your data
        </p>
        <h2 className="mt-1 text-sm font-semibold text-gray-900">Export or delete</h2>
      </div>

      <div className="space-y-5 px-5 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-md text-sm leading-6 text-gray-600">
            Download your workflows, schedules and run history as JSON. Stored secrets are
            not included.
          </p>
          <a
            href="/api/account/export"
            className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900"
          >
            <Download className="mr-2 h-4 w-4" />
            Export data
          </a>
        </div>

        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold text-rose-900">Delete this account</p>
                <p className="mt-1 text-sm leading-6 text-rose-800">
                  This removes your workflows, schedules, run history, uploaded files and
                  stored credentials, and revokes WfloAI access to your Google account. It
                  cannot be undone and nothing can be recovered.
                </p>
              </div>

              <div>
                <label
                  htmlFor="delete-confirmation"
                  className="text-[11px] font-medium uppercase tracking-[0.08em] text-rose-700"
                >
                  Type {CONFIRMATION} to confirm
                </label>
                <input
                  id="delete-confirmation"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  placeholder={CONFIRMATION}
                  autoComplete="off"
                  className={`mt-1.5 ${fieldClass}`}
                  disabled={isDeleting}
                />
              </div>

              {error ? <p className="text-sm text-rose-700">{error}</p> : null}

              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={isDeleting || confirmation !== CONFIRMATION}
              >
                {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Delete account permanently
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
