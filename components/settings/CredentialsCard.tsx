"use client";

import { useEffect, useState } from "react";
import { KeyRound, Loader2, Plus, RotateCcw, Trash2 } from "lucide-react";
import type { CredentialType } from "@/lib/types";

interface CredentialSummary {
  id: string;
  name: string;
  type: CredentialType;
  headerName?: string;
}

const TYPE_LABELS: Record<CredentialType, string> = {
  bearer: "Bearer token",
  basic: "Basic auth",
  api_key: "API key"
};

const fieldClass =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/25";

interface SecretFormState {
  name: string;
  type: CredentialType;
  token: string;
  username: string;
  password: string;
  headerName: string;
  value: string;
}

const EMPTY_FORM: SecretFormState = {
  name: "",
  type: "bearer",
  token: "",
  username: "",
  password: "",
  headerName: "",
  value: ""
};

export function CredentialsCard() {
  const [credentials, setCredentials] = useState<CredentialSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState<SecretFormState>(EMPTY_FORM);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<{ id: string; usedBy: number } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function loadCredentials() {
    try {
      const response = await fetch("/api/credentials");
      if (response.ok) {
        const json = (await response.json()) as { credentials: CredentialSummary[] };
        setCredentials(json.credentials);
      }
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadCredentials();
  }, []);

  function updateForm(patch: Partial<SecretFormState>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  async function handleSubmit() {
    setError(null);
    setIsSubmitting(true);
    try {
      const isReplace = replacingId !== null;
      const response = await fetch(
        isReplace ? `/api/credentials/${replacingId}` : "/api/credentials",
        {
          method: isReplace ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form)
        }
      );
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Saving the credential failed.");
        return;
      }
      setForm(EMPTY_FORM);
      setIsAdding(false);
      setReplacingId(null);
      await loadCredentials();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(id: string, confirm: boolean) {
    setError(null);
    const response = await fetch(`/api/credentials/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm })
    });
    if (response.status === 409) {
      const json = (await response.json()) as { usedByWorkflows: number };
      setConfirmingDelete({ id, usedBy: json.usedByWorkflows });
      return;
    }
    if (!response.ok) {
      const json = (await response.json()) as { error?: string };
      setError(json.error ?? "Deleting the credential failed.");
      return;
    }
    setConfirmingDelete(null);
    await loadCredentials();
  }

  function startReplace(credential: CredentialSummary) {
    setReplacingId(credential.id);
    setIsAdding(true);
    setForm({
      ...EMPTY_FORM,
      name: credential.name,
      type: credential.type,
      headerName: credential.headerName ?? ""
    });
  }

  const showTypePicker = replacingId === null;

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50">
            <KeyRound className="h-4 w-4 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">API credentials</h2>
            <p className="text-xs text-gray-500">
              Encrypted secrets for HTTP Request nodes. Saved values can be replaced but not viewed.
            </p>
          </div>
        </div>
        {!isAdding ? (
          <button
            type="button"
            onClick={() => {
              setIsAdding(true);
              setReplacingId(null);
              setForm(EMPTY_FORM);
            }}
            className="flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3.5 py-1.5 text-sm font-medium text-violet-700 transition hover:bg-violet-100"
          >
            <Plus className="h-3.5 w-3.5" /> Add credential
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      {isAdding ? (
        <div className="mt-4 space-y-3 rounded-xl border border-gray-200 bg-gray-50/60 p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400">
            {replacingId ? "Replace credential value" : "New credential"}
          </p>
          <input
            type="text"
            value={form.name}
            onChange={(e) => updateForm({ name: e.target.value })}
            className={fieldClass}
            placeholder="Name, e.g. My API key"
          />
          {showTypePicker ? (
            <select
              value={form.type}
              onChange={(e) => updateForm({ type: e.target.value as CredentialType })}
              className={fieldClass}
            >
              <option value="bearer">Bearer token</option>
              <option value="basic">Basic auth</option>
              <option value="api_key">API key header</option>
            </select>
          ) : (
            <p className="text-xs text-gray-500">Type: {TYPE_LABELS[form.type]}</p>
          )}
          {form.type === "bearer" ? (
            <input
              type="password"
              value={form.token}
              onChange={(e) => updateForm({ token: e.target.value })}
              className={fieldClass}
              placeholder="Token"
            />
          ) : null}
          {form.type === "basic" ? (
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={form.username}
                onChange={(e) => updateForm({ username: e.target.value })}
                className={fieldClass}
                placeholder="Username"
              />
              <input
                type="password"
                value={form.password}
                onChange={(e) => updateForm({ password: e.target.value })}
                className={fieldClass}
                placeholder="Password"
              />
            </div>
          ) : null}
          {form.type === "api_key" ? (
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={form.headerName}
                onChange={(e) => updateForm({ headerName: e.target.value })}
                className={fieldClass}
                placeholder="Header, e.g. x-api-key"
              />
              <input
                type="password"
                value={form.value}
                onChange={(e) => updateForm({ value: e.target.value })}
                className={fieldClass}
                placeholder="Key value"
              />
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="rounded-full bg-violet-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-violet-700 disabled:opacity-60"
            >
              {isSubmitting ? "Saving…" : replacingId ? "Replace" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsAdding(false);
                setReplacingId(null);
                setForm(EMPTY_FORM);
                setError(null);
              }}
              className="rounded-full border border-gray-200 px-4 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading credentials…
          </div>
        ) : credentials.length === 0 ? (
          <p className="text-sm text-gray-500">
            No credentials yet. Add one to authenticate HTTP Request nodes.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {credentials.map((credential) => (
              <li key={credential.id} className="flex items-center justify-between gap-3 py-2.5">
                <div>
                  <p className="text-sm font-medium text-gray-900">{credential.name}</p>
                  <p className="text-xs text-gray-500">
                    {TYPE_LABELS[credential.type]}
                    {credential.headerName ? ` · ${credential.headerName}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {confirmingDelete?.id === credential.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-amber-600">
                        Used by {confirmingDelete.usedBy} workflow
                        {confirmingDelete.usedBy === 1 ? "" : "s"} — delete anyway?
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDelete(credential.id, true)}
                        className="rounded-full bg-rose-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-rose-700"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingDelete(null)}
                        className="rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
                      >
                        Keep
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => startReplace(credential)}
                        title="Replace value"
                        className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-50 hover:text-gray-700"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(credential.id, false)}
                        title="Delete"
                        className="rounded-lg p-1.5 text-gray-400 transition hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
