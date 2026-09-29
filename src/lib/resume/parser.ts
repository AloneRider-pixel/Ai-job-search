import { createHash } from "node:crypto";

export type ParsedResume = {
  rawText: string;
  sourceType: "pdf" | "docx" | "text";
  mimeType: string;
  sha256: string;
  warnings: string[];
};

const MAX_RESUME_BYTES = 10 * 1024 * 1024;

function cleanText(value: string) {
  return value.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function withTimeout<T>(promise: Promise<T>, ms: number) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Resume parsing timed out.")), ms)),
  ]);
}

export async function parseResumeFile(file: File): Promise<ParsedResume> {
  if (file.size > MAX_RESUME_BYTES) {
    throw new Error("Resume file exceeds the 10 MB limit.");
  }

  const name = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const warnings: string[] = [];

  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await withTimeout(parser.getText(), 30_000);
      if (!result.text?.trim()) warnings.push("No selectable text was found. This may be a scanned/image-only PDF.");
      return {
        rawText: cleanText(result.text ?? ""),
        sourceType: "pdf",
        mimeType: "application/pdf",
        sha256,
        warnings,
      };
    } finally {
      await parser.destroy();
    }
  }

  if (name.endsWith(".docx") || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const mammoth = await import("mammoth");
    const result = await withTimeout(mammoth.extractRawText({ buffer }), 30_000);
    if (result.messages?.length) warnings.push(...result.messages.map((message) => String(message.message ?? message)));
    if (!result.value?.trim()) warnings.push("The DOCX did not contain extractable text.");
    return {
      rawText: cleanText(result.value ?? ""),
      sourceType: "docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      sha256,
      warnings,
    };
  }

  if (name.endsWith(".txt") || file.type === "text/plain") {
    return {
      rawText: cleanText(buffer.toString("utf8")),
      sourceType: "text",
      mimeType: "text/plain",
      sha256,
      warnings,
    };
  }

  throw new Error("Unsupported resume type. Upload PDF, DOCX, or TXT.");
}

export const RESUME_MAX_BYTES = MAX_RESUME_BYTES;
