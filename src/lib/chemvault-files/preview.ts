import type { PreviewKind } from "./types";

export interface PreviewableFileInput {
  displayName: string;
  mimeType: string | null;
}

export function resolvePreviewKind(file: PreviewableFileInput): PreviewKind {
  const mimeType = (file.mimeType || "").toLowerCase();
  const name = file.displayName.toLowerCase();

  if (mimeType === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "text/csv" || name.endsWith(".csv")) return "csv";
  if (
    mimeType.startsWith("text/") ||
    mimeType.includes("json") ||
    mimeType.includes("xml") ||
    mimeType.includes("jcamp") ||
    /\.(txt|md|json|xml|jdx|dx|dat|log)$/.test(name)
  ) {
    return "text";
  }
  return "unsupported";
}

export function isPreviewableFile(file: PreviewableFileInput): boolean {
  return resolvePreviewKind(file) !== "unsupported";
}
