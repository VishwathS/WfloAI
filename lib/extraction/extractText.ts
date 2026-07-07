import { extractText } from "unpdf";
import mammoth from "mammoth";
import { getFileKind, MAX_EXTRACTED_CHARS } from "@/lib/files/constants";

export interface ExtractedFile {
  text: string;
  pageCount?: number;
}

function capText(text: string): string {
  if (text.length <= MAX_EXTRACTED_CHARS) return text;
  return `${text.slice(0, MAX_EXTRACTED_CHARS)}\n[truncated]`;
}

export async function extractTextFromFile(
  buffer: ArrayBuffer,
  filename: string
): Promise<ExtractedFile> {
  const kind = getFileKind(filename);

  if (!kind) {
    throw new Error("Unsupported file type. Supported types: PDF, DOCX, TXT, MD, CSV.");
  }

  if (kind === "pdf") {
    const { totalPages, text } = await extractText(new Uint8Array(buffer), {
      mergePages: true
    });
    const trimmed = text.trim();
    const scannedThreshold = Math.max(40, 10 * totalPages);

    if (trimmed.length < scannedThreshold) {
      throw new Error(
        "This PDF appears to be scanned or image-based. Scanned PDFs aren't supported yet — please upload a text-based PDF."
      );
    }

    return { text: capText(trimmed), pageCount: totalPages };
  }

  if (kind === "docx") {
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
    const trimmed = value.trim();

    if (!trimmed) {
      throw new Error("No text could be extracted from this DOCX file.");
    }

    return { text: capText(trimmed) };
  }

  const decoded = new TextDecoder().decode(buffer).trim();

  if (!decoded) {
    throw new Error("This file is empty — upload a file that contains text.");
  }

  return { text: capText(decoded) };
}
