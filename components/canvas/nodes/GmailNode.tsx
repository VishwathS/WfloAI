"use client";

import { memo, useEffect, useState } from "react";
import { Handle, Position, useReactFlow, type Node, type NodeProps } from "reactflow";
import { AlertTriangle, CheckCircle2, Loader2, Mail } from "lucide-react";
import { useNodeExecutionState } from "@/components/canvas/execution-context";
import { useBufferedField } from "@/hooks/useBufferedField";
import { useNodeResize } from "@/hooks/useNodeResize";
import type { GmailActionType, GmailNodeData } from "@/lib/types";

const GMAIL_ACTIONS: GmailActionType[] = [
  "Send Email",
  "Create Draft",
  "Reply to Email",
  "Find Emails",
  "Read Email"
];

const READ_ACTIONS = new Set<GmailActionType>(["Reply to Email", "Find Emails", "Read Email"]);

interface GmailNodeStatus {
  connected: boolean;
  status?: "active" | "requires_reconnect";
  canRead?: boolean;
  readActionsEnabled: boolean;
}

// One status fetch shared across every Gmail node on the canvas. Fails closed:
// if the status call errors we assume not-connected with read actions off,
// rather than offering actions that would fail at run time.
const UNKNOWN_STATUS: GmailNodeStatus = { connected: false, readActionsEnabled: false };

let statusPromise: Promise<GmailNodeStatus> | null = null;
function fetchGmailStatus(): Promise<GmailNodeStatus> {
  if (!statusPromise) {
    statusPromise = fetch("/api/integrations/gmail/status")
      .then((response) =>
        response.ok ? (response.json() as Promise<GmailNodeStatus>) : UNKNOWN_STATUS
      )
      .catch(() => UNKNOWN_STATUS);
  }
  return statusPromise;
}

// Connecting Gmail happens in Settings — a different tab or route — so the
// cached promise is dropped when the canvas regains focus. Without this the
// node keeps showing "not connected" until a hard reload.
function invalidateGmailStatus(): void {
  statusPromise = null;
}

const fieldClass =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-red-400 focus:ring-2 focus:ring-red-500/25";

const labelClass = "text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400";

export const GmailNode = memo(function GmailNode({ id, data }: NodeProps<GmailNodeData>) {
  const { setNodes } = useReactFlow();
  const { containerRef, onResizePointerDown } = useNodeResize(id);
  const executionState = useNodeExecutionState(id);
  const [status, setStatus] = useState<GmailNodeStatus | null>(null);

  const isRunning = executionState.status === "running";
  const isComplete = executionState.status === "complete";
  const isError = executionState.status === "error";

  useEffect(() => {
    let cancelled = false;

    function load() {
      void fetchGmailStatus().then((result) => {
        if (!cancelled) setStatus(result);
      });
    }

    function refresh() {
      invalidateGmailStatus();
      load();
    }

    load();
    window.addEventListener("focus", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refresh);
    };
  }, []);

  function updateData(patch: Partial<GmailNodeData>) {
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? ({ ...node, data: { ...(node.data as GmailNodeData), ...patch } } as Node<GmailNodeData>)
          : node
      )
    );
  }

  const toField = useBufferedField(data.to ?? "", (to) => updateData({ to }));
  const subjectField = useBufferedField(data.subject ?? "", (subject) => updateData({ subject }));
  const bodyField = useBufferedField(data.body ?? "", (body) => updateData({ body }));
  const replyToField = useBufferedField(data.replyTo ?? "", (replyTo) => updateData({ replyTo }));
  const queryField = useBufferedField(data.query ?? "", (query) => updateData({ query }));

  const action = data.action;
  const isReadAction = READ_ACTIONS.has(action);
  const sendsRealEmail = action === "Send Email" || action === "Reply to Email";
  const visibleActions = GMAIL_ACTIONS.filter(
    (candidate) => status?.readActionsEnabled !== false || !READ_ACTIONS.has(candidate)
  );
  const showDisconnected = status !== null && !status.connected;
  const showReconnect = status?.status === "requires_reconnect";
  const showEnableReading =
    status?.connected === true && isReadAction && status.canRead === false && !showReconnect;

  return (
    <div
      ref={containerRef}
      className={`relative flex h-full flex-col min-w-[280px] overflow-hidden rounded-xl border bg-white shadow-card ${
        isComplete ? "border-emerald-400" : isError ? "border-rose-400" : "border-red-300"
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2.5 !w-2.5 !border-2 !border-white !bg-red-500"
      />
      <div
        className={`flex flex-shrink-0 items-center gap-3 border-b border-gray-100 px-4 py-2.5 ${isRunning ? "animate-pulse" : ""}`}
      >
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
            isError ? "bg-rose-100" : isComplete ? "bg-emerald-100" : "bg-red-50"
          }`}
        >
          {isRunning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-red-600" />
          ) : isComplete ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          ) : isError ? (
            <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
          ) : (
            <Mail className="h-3.5 w-3.5 text-red-600" />
          )}
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">Gmail</p>
          <p className={`text-xs ${isError ? "text-rose-600" : "text-gray-500"}`}>{data.label}</p>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto px-4 py-4">
        {showDisconnected ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
            Gmail isn&apos;t connected —{" "}
            <a href="/settings" className="font-medium underline">
              Connect in Settings
            </a>
            .
          </p>
        ) : null}
        {showReconnect ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
            Your Gmail connection expired —{" "}
            <a href="/settings" className="font-medium underline">
              reconnect in Settings
            </a>
            .
          </p>
        ) : null}
        {showEnableReading ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
            This action needs email reading —{" "}
            <a href="/settings" className="font-medium underline">
              enable it in Settings
            </a>
            .
          </p>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <p className={labelClass}>Action</p>
          <select
            value={action}
            onChange={(e) => updateData({ action: e.target.value as GmailActionType })}
            className={fieldClass}
          >
            {visibleActions.map((candidate) => (
              <option key={candidate} value={candidate}>
                {candidate}
              </option>
            ))}
          </select>
        </div>

        {action === "Send Email" || action === "Create Draft" ? (
          <>
            <div className="flex flex-col gap-1.5">
              <p className={labelClass}>To</p>
              <input
                type="text"
                value={toField.value}
                onChange={toField.onChange}
                onFocus={toField.onFocus}
                onBlur={toField.onBlur}
                onKeyDown={toField.onEnterKeyDown}
                className={fieldClass}
                placeholder="recipient@example.com — supports {{variables}}"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <p className={labelClass}>Subject · optional</p>
              <input
                type="text"
                value={subjectField.value}
                onChange={subjectField.onChange}
                onFocus={subjectField.onFocus}
                onBlur={subjectField.onBlur}
                onKeyDown={subjectField.onEnterKeyDown}
                className={fieldClass}
                placeholder="Interview Follow-up"
              />
            </div>
            <div className="flex flex-1 min-h-0 flex-col gap-1.5">
              <p className={labelClass}>Body</p>
              <textarea
                value={bodyField.value}
                onChange={bodyField.onChange}
                onFocus={bodyField.onFocus}
                onBlur={bodyField.onBlur}
                className={`${fieldClass} flex-1 min-h-[90px] resize-none`}
                placeholder="{{previousOutput}} or write your message…"
              />
            </div>
          </>
        ) : null}

        {action === "Reply to Email" ? (
          <>
            <div className="flex flex-col gap-1.5">
              <p className={labelClass}>Reply To · optional</p>
              <input
                type="text"
                value={replyToField.value}
                onChange={replyToField.onChange}
                onFocus={replyToField.onFocus}
                onBlur={replyToField.onBlur}
                onKeyDown={replyToField.onEnterKeyDown}
                className={fieldClass}
                placeholder="Auto — replies to the email from the Read Email step"
              />
            </div>
            <div className="flex flex-1 min-h-0 flex-col gap-1.5">
              <p className={labelClass}>Body</p>
              <textarea
                value={bodyField.value}
                onChange={bodyField.onChange}
                onFocus={bodyField.onFocus}
                onBlur={bodyField.onBlur}
                className={`${fieldClass} flex-1 min-h-[90px] resize-none`}
                placeholder="{{previousOutput}} or write your reply…"
              />
            </div>
            <p className="text-[11px] leading-4 text-gray-400">
              Place a Read Email node directly before this one.
            </p>
          </>
        ) : null}

        {action === "Find Emails" ? (
          <>
            <div className="flex flex-col gap-1.5">
              <p className={labelClass}>Search query</p>
              <input
                type="text"
                value={queryField.value}
                onChange={queryField.onChange}
                onFocus={queryField.onFocus}
                onBlur={queryField.onBlur}
                onKeyDown={queryField.onEnterKeyDown}
                className={fieldClass}
                placeholder="from:amazon newer_than:7d"
              />
              <p className="text-[11px] leading-4 text-gray-400">Standard Gmail search syntax.</p>
            </div>
            <div className="flex items-center gap-3">
              <p className={labelClass}>Max results</p>
              <input
                type="number"
                min={1}
                max={10}
                value={data.maxResults ?? 5}
                onChange={(e) => {
                  const maxResults = Math.min(10, Math.max(1, Number(e.target.value)));
                  updateData({ maxResults });
                }}
                className="w-16 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-sm text-gray-900 outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-500/25"
              />
            </div>
          </>
        ) : null}

        {action === "Read Email" ? (
          <p className="text-xs leading-5 text-gray-500">
            Reads the first (most recent) email from the previous Gmail step.
          </p>
        ) : null}

        {sendsRealEmail ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] leading-4 text-rose-600">
            Sends a real email when the workflow runs.
          </p>
        ) : null}

        {isRunning && executionState.output ? (
          <div className="space-y-2">
            <p className={labelClass}>Output</p>
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
        className="!h-2.5 !w-2.5 !border-2 !border-white !bg-red-500"
      />
      <div
        className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize"
        onPointerDown={onResizePointerDown}
      />
    </div>
  );
});
