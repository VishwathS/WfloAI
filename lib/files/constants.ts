export type FileInputKind = "pdf" | "docx" | "text";

export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
export const MAX_TEXT_BYTES = 5 * 1024 * 1024;
export const MAX_EXTRACTED_CHARS = 200_000;

export const FILE_INPUT_ACCEPT = ".pdf,.docx,.txt,.md,.csv";

const EXTENSION_KINDS: Record<string, FileInputKind> = {
  pdf: "pdf",
  docx: "docx",
  txt: "text",
  md: "text",
  csv: "text"
};

export function getFileKind(filename: string): FileInputKind | null {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_KINDS[extension] ?? null;
}

export function getMaxBytes(kind: FileInputKind): number {
  return kind === "text" ? MAX_TEXT_BYTES : MAX_DOCUMENT_BYTES;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}
