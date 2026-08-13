"use client";

import { memo, useEffect, useState } from "react";
import { Handle, Position, useReactFlow, type Node, type NodeProps } from "reactflow";
import { AlertTriangle, CheckCircle2, Globe, Loader2, Plus, X } from "lucide-react";
import { useNodeExecutionState } from "@/components/canvas/execution-context";
import { useBufferedField } from "@/hooks/useBufferedField";
import { useNodeResize } from "@/hooks/useNodeResize";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import type {
  CredentialType,
  HttpKeyValue,
  HttpMethod,
  HttpRequestNodeData
} from "@/lib/types";

const HTTP_METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

interface CredentialOption {
  id: string;
  name: string;
  type: CredentialType;
}

const fieldClass =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/25";

const labelClass = "text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400";

function KeyValueRows({
  label,
  rows,
  helper,
  onChangeRows
}: {
  label: string;
  rows: HttpKeyValue[];
  helper?: string;
  onChangeRows: (rows: HttpKeyValue[]) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <p className={labelClass}>{label}</p>
        <button
          type="button"
          onClick={() => onChangeRows([...rows, { key: "", value: "" }])}
          className="flex items-center gap-1 rounded-full border border-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-500 transition hover:bg-gray-50 hover:text-gray-900"
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>
      {rows.map((row, index) => (
        <div key={index} className="flex items-center gap-1.5">
          <input
            type="text"
            value={row.key}
            onChange={(e) =>
              onChangeRows(rows.map((r, i) => (i === index ? { ...r, key: e.target.value } : r)))
            }
            className={`${fieldClass} flex-[2]`}
            placeholder="Key"
          />
          <input
            type="text"
            value={row.value}
            onChange={(e) =>
              onChangeRows(rows.map((r, i) => (i === index ? { ...r, value: e.target.value } : r)))
            }
            className={`${fieldClass} flex-[3]`}
            placeholder="Value — supports {{variables}}"
          />
          <button
            type="button"
            onClick={() => onChangeRows(rows.filter((_, i) => i !== index))}
            className="rounded-lg p-1 text-gray-400 transition hover:bg-rose-50 hover:text-rose-600"
            aria-label={`Remove ${label} row`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      {helper ? <p className="text-[11px] leading-4 text-gray-400">{helper}</p> : null}
    </div>
  );
}

export const HttpRequestNode = memo(function HttpRequestNode({
  id,
  data
}: NodeProps<HttpRequestNodeData>) {
  const { setNodes } = useReactFlow();
  const { containerRef, onResizePointerDown } = useNodeResize(id);
  const executionState = useNodeExecutionState(id);
  const [credentials, setCredentials] = useState<CredentialOption[] | null>(null);

  const isRunning = executionState.status === "running";
  const isComplete = executionState.status === "complete";
  const isError = executionState.status === "error";

  useEffect(() => {
    if (data.authType === "none" || credentials !== null) return;
    let cancelled = false;
    void fetch("/api/credentials")
      .then((response) => (response.ok ? response.json() : { credentials: [] }))
      .then((json: { credentials: CredentialOption[] }) => {
        if (!cancelled) setCredentials(json.credentials);
      })
      .catch(() => {
        if (!cancelled) setCredentials([]);
      });
    return () => {
      cancelled = true;
    };
  }, [data.authType, credentials]);

  function updateData(patch: Partial<HttpRequestNodeData>) {
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? ({
              ...node,
              data: { ...(node.data as HttpRequestNodeData), ...patch }
            } as Node<HttpRequestNodeData>)
          : node
      )
    );
  }

  const urlField = useBufferedField(data.url, (url) => updateData({ url }));
  const bodyField = useBufferedField(data.body ?? "", (body) => updateData({ body }));

  const matchingCredentials = (credentials ?? []).filter(
    (credential) => credential.type === data.authType
  );
  const credentialMissing =
    data.authType !== "none" &&
    credentials !== null &&
    data.credentialId !== undefined &&
    !matchingCredentials.some((credential) => credential.id === data.credentialId);
  const showBody = data.method !== "GET";

  return (
    <div
      ref={containerRef}
      className={`relative flex h-full flex-col min-w-[300px] overflow-hidden rounded-xl border bg-white shadow-card ${
        isComplete ? "border-emerald-400" : isError ? "border-rose-400" : "border-indigo-300"
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2.5 !w-2.5 !border-2 !border-white !bg-indigo-500"
      />
      <div
        className={`flex flex-shrink-0 items-center gap-3 border-b border-gray-100 px-4 py-2.5 ${isRunning ? "animate-pulse" : ""}`}
      >
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
            isError ? "bg-rose-100" : isComplete ? "bg-emerald-100" : "bg-indigo-50"
          }`}
        >
          {isRunning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600" />
          ) : isComplete ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          ) : isError ? (
            <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
          ) : (
            <Globe className="h-3.5 w-3.5 text-indigo-600" />
          )}
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">HTTP Request</p>
          <p className={`text-xs ${isError ? "text-rose-600" : "text-gray-500"}`}>{data.label}</p>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto px-4 py-4">
        <div className="flex items-start gap-1.5">
          <Select
            value={data.method}
            onValueChange={(value) => updateData({ method: value as HttpMethod })}
          >
            <SelectTrigger accent="indigo" aria-label="HTTP method" className="w-[92px] shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HTTP_METHODS.map((method) => (
                <SelectItem key={method} value={method}>
                  {method}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input
            type="text"
            value={urlField.value}
            onChange={urlField.onChange}
            onFocus={urlField.onFocus}
            onBlur={urlField.onBlur}
            onKeyDown={urlField.onEnterKeyDown}
            className={fieldClass}
            placeholder="https://api.example.com/items — supports {{variables}}"
          />
        </div>

        <KeyValueRows
          label="Query params"
          rows={data.queryParams ?? []}
          onChangeRows={(queryParams) => updateData({ queryParams })}
        />
        <KeyValueRows
          label="Headers"
          rows={data.headers ?? []}
          helper="Don't put API keys here — use an API key credential below."
          onChangeRows={(headers) => updateData({ headers })}
        />

        {showBody ? (
          <div className="flex flex-1 min-h-0 flex-col gap-1.5">
            <p className={labelClass}>Body</p>
            <textarea
              value={bodyField.value}
              onChange={bodyField.onChange}
              onFocus={bodyField.onFocus}
              onBlur={bodyField.onBlur}
              className={`${fieldClass} flex-1 min-h-[80px] resize-none font-mono text-xs`}
              placeholder={'{"name": "{{previousOutput}}"}'}
            />
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <p className={labelClass}>Authentication</p>
          <Select
            value={data.authType ?? "none"}
            onValueChange={(value) =>
              updateData({
                authType: value as HttpRequestNodeData["authType"],
                credentialId: undefined
              })
            }
          >
            <SelectTrigger accent="indigo" aria-label="Authentication">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="bearer">Bearer token</SelectItem>
              <SelectItem value="basic">Basic auth</SelectItem>
              <SelectItem value="api_key">API key header</SelectItem>
            </SelectContent>
          </Select>
          {data.authType !== "none" ? (
            <>
              <Select
                value={data.credentialId ?? ""}
                onValueChange={(value) => updateData({ credentialId: value || undefined })}
              >
                <SelectTrigger accent="indigo" aria-label="Credential">
                  <SelectValue
                    placeholder={
                      credentials === null ? "Loading credentials…" : "Select credential…"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {matchingCredentials.map((credential) => (
                    <SelectItem key={credential.id} value={credential.id}>
                      {credential.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {credentialMissing ? (
                <p className="text-xs text-rose-600">
                  Credential missing — it may have been deleted. Pick another.
                </p>
              ) : null}
              <p className="text-[11px] leading-4 text-gray-400">
                <a href="/settings" className="underline">
                  Manage credentials in Settings
                </a>
                . Values are encrypted and never shown.
              </p>
            </>
          ) : null}
        </div>

        {isRunning && executionState.output ? (
          <div className="space-y-2">
            <p className={labelClass}>Response</p>
            <div className="min-h-[80px] whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm leading-6 text-gray-700">
              {executionState.output}
            </div>
          </div>
        ) : null}
        {isError && executionState.error ? (
          <p className="text-xs leading-5 text-rose-600">{executionState.error}</p>
        ) : null}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!h-2.5 !w-2.5 !border-2 !border-white !bg-indigo-500"
      />
      <div
        className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize"
        onPointerDown={onResizePointerDown}
      />
    </div>
  );
});
