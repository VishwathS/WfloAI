"use client";

import { memo, useRef, useState, type ChangeEvent } from "react";
import { useParams } from "next/navigation";
import { Handle, Position, useReactFlow, type Node, type NodeProps } from "reactflow";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  RefreshCw,
  Trash2,
  UploadCloud
} from "lucide-react";
import { useNodeExecutionState } from "@/components/canvas/execution-context";
import { useNodeResize } from "@/hooks/useNodeResize";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import {
  FILE_INPUT_ACCEPT,
  formatBytes,
  getFileKind,
  getMaxBytes
} from "@/lib/files/constants";
import type { FileInputNodeData } from "@/lib/types";

interface UploadResponse {
  fileId: string;
  filename: string;
  fileType: string;
  fileSize: number;
  pageCount: number | null;
  textLength: number;
  error?: string;
}

export const FileInputNode = memo(function FileInputNode({ id, data }: NodeProps<FileInputNodeData>) {
  const params = useParams<{ id: string }>();
  const workflowId = params.id;
  const { setNodes } = useReactFlow();
  const { containerRef, onResizePointerDown } = useNodeResize(id);
  const executionState = useNodeExecutionState(id);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadingName, setUploadingName] = useState<string | null>(null);

  const isRunning = executionState.status === "running";
  const isComplete = executionState.status === "complete";
  const isError = executionState.status === "error";
  const hasFile = Boolean(data.fileId);

  function updateData(patch: Partial<FileInputNodeData>) {
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? ({ ...node, data: { ...(node.data as FileInputNodeData), ...patch } } as Node<FileInputNodeData>)
          : node
      )
    );
  }

  async function uploadFile(file: File) {
    const kind = getFileKind(file.name);

    if (!kind) {
      setUploadError("Unsupported file type. Supported types: PDF, DOCX, TXT, MD, CSV.");
      return;
    }

    const maxBytes = getMaxBytes(kind);

    if (file.size > maxBytes) {
      setUploadError(`File is too large — the limit for this type is ${formatBytes(maxBytes)}.`);
      return;
    }

    setIsUploading(true);
    setUploadingName(file.name);
    setUploadError(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error("You must be signed in to upload files.");
      }

      const fileId = crypto.randomUUID();
      const { error: storageError } = await supabase.storage
        .from("workflow-files")
        .upload(`${user.id}/${workflowId}/${fileId}`, file);

      if (storageError) {
        throw new Error(storageError.message);
      }

      const response = await fetch(`/api/workflows/${workflowId}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId, filename: file.name })
      });

      const json = (await response.json()) as UploadResponse;

      if (!response.ok) {
        throw new Error(json.error ?? "Upload failed.");
      }

      const previousFileId = data.fileId;

      updateData({
        fileId: json.fileId,
        filename: json.filename,
        fileType: json.fileType,
        fileSize: json.fileSize,
        pageCount: json.pageCount ?? undefined,
        textLength: json.textLength
      });

      if (previousFileId) {
        void fetch(`/api/workflows/${workflowId}/files/${previousFileId}`, { method: "DELETE" });
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setIsUploading(false);
      setUploadingName(null);
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (file && !isUploading) {
      void uploadFile(file);
    }
  }

  async function handleRemove() {
    const fileId = data.fileId;

    updateData({
      fileId: undefined,
      filename: undefined,
      fileType: undefined,
      fileSize: undefined,
      pageCount: undefined,
      textLength: undefined
    });
    setUploadError(null);

    if (fileId) {
      void fetch(`/api/workflows/${workflowId}/files/${fileId}`, { method: "DELETE" });
    }
  }

  const extension = data.filename?.split(".").pop()?.toUpperCase();

  return (
    <div
      ref={containerRef}
      className={`relative flex h-full flex-col min-w-[260px] overflow-hidden rounded-xl border bg-white shadow-card ${
        isComplete
          ? "border-emerald-400"
          : isError
            ? "border-rose-400"
            : "border-orange-300"
      }`}
    >
      <div
        className={`flex flex-shrink-0 items-center gap-3 border-b border-gray-100 px-4 py-2.5 ${isRunning ? "animate-pulse" : ""}`}
      >
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
          isError ? "bg-rose-100" : isComplete ? "bg-emerald-100" : "bg-orange-50"
        }`}>
          {isRunning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-600" />
          ) : isComplete ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          ) : isError ? (
            <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
          ) : (
            <FileText className="h-3.5 w-3.5 text-orange-600" />
          )}
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">File Input</p>
          <p className={`text-xs ${isError ? "text-rose-600" : "text-gray-500"}`}>
            {data.label || "Document for this workflow"}
          </p>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto px-4 py-4">
        <input
          ref={fileInputRef}
          type="file"
          accept={FILE_INPUT_ACCEPT}
          onChange={handleFileChange}
          className="hidden"
        />

        {isUploading ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-orange-300 bg-orange-50/50 px-3 py-6">
            <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
            <p className="max-w-full truncate text-xs font-medium text-gray-600">
              Uploading {uploadingName}…
            </p>
          </div>
        ) : hasFile ? (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-orange-500" />
                <p className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">
                  {data.filename}
                </p>
                {extension ? (
                  <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] text-orange-700">
                    {extension}
                  </span>
                ) : null}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
                {typeof data.fileSize === "number" ? <span>{formatBytes(data.fileSize)}</span> : null}
                {typeof data.pageCount === "number" ? (
                  <span>{data.pageCount} {data.pageCount === 1 ? "page" : "pages"}</span>
                ) : null}
                {typeof data.textLength === "number" ? (
                  <span>{data.textLength.toLocaleString()} characters extracted</span>
                ) : null}
              </div>
              <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                <CheckCircle2 className="h-3 w-3" /> Ready
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                <RefreshCw className="h-3 w-3" /> Replace
              </button>
              <button
                type="button"
                onClick={() => void handleRemove()}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50"
              >
                <Trash2 className="h-3 w-3" /> Remove
              </button>
            </div>

            <p className="text-[11px] leading-4 text-gray-400">
              Scheduled runs use the latest uploaded version of this file.
            </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-orange-300 bg-orange-50/50 px-3 py-6 transition-colors hover:bg-orange-50"
          >
            <UploadCloud className="h-5 w-5 text-orange-500" />
            <p className="text-xs font-medium text-gray-700">Upload a file</p>
            <p className="text-[11px] text-gray-400">PDF, DOCX, TXT, MD, CSV · up to 20 MB</p>
          </button>
        )}

        {uploadError ? (
          <p className="text-xs leading-5 text-rose-600">{uploadError}</p>
        ) : null}

        {isError && executionState.error ? (
          <p className="text-xs leading-5 text-rose-600">{executionState.error}</p>
        ) : null}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!h-2.5 !w-2.5 !border-2 !border-white !bg-orange-500"
      />
      <div
        className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize"
        onPointerDown={onResizePointerDown}
      />
    </div>
  );
});
