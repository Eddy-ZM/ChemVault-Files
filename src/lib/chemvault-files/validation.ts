import type { FileInitPayload } from "./types";

const MAX_NAME_LENGTH = 160;
const MAX_TAG_LENGTH = 40;
const MAX_ROLE_IDS = 20;
export const MAX_UPLOAD_FILE_SIZE_BYTES = 2 * 1024 * 1024 * 1024;
export const MAX_UPLOAD_FILE_SIZE_LABEL = "2 GB";
export const DIRECT_UPLOAD_MAX_BYTES = 90 * 1024 * 1024;
export const MULTIPART_UPLOAD_PART_SIZE_BYTES = 32 * 1024 * 1024;

export const ALLOWED_UPLOAD_EXTENSIONS = [
  "7z",
  "csv",
  "dat",
  "dmg",
  "doc",
  "docx",
  "dx",
  "exe",
  "gz",
  "h5",
  "hdf5",
  "jdx",
  "jpeg",
  "jpg",
  "json",
  "md",
  "msi",
  "pdf",
  "pkg",
  "png",
  "rar",
  "pptx",
  "tar",
  "tgz",
  "txt",
  "xlsx",
  "xml",
  "zip",
] as const;

export const ALLOWED_UPLOAD_MIME_TYPES = [
  "application/gzip",
  "application/json",
  "application/msword",
  "application/pdf",
  "application/vnd.apple.installer+xml",
  "application/vnd.microsoft.portable-executable",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/x-7z-compressed",
  "application/x-apple-diskimage",
  "application/x-gzip",
  "application/x-hdf5",
  "application/x-jcamp-dx",
  "application/x-msdownload",
  "application/x-msi",
  "application/x-rar-compressed",
  "application/x-tar",
  "application/x-zip-compressed",
  "application/zip",
  "chemical/x-jcamp-dx",
  "image/jpeg",
  "image/png",
  "text/csv",
  "text/markdown",
  "text/plain",
  "text/xml",
] as const;

export const BLOCKED_UPLOAD_EXTENSIONS = [
  "app",
  "bat",
  "cmd",
  "cjs",
  "html",
  "jar",
  "js",
  "mjs",
  "php",
  "ps1",
  "py",
  "sh",
  "vbs",
  "wsf",
] as const;

export function normalizeSlug(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "untitled";
}

export function sanitizeVisibleName(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\.\.+/g, "")
    .replace(/^_+/, "")
    .replace(/\s+/g, " ")
    .slice(0, MAX_NAME_LENGTH)
    .trim();
  return cleaned || "untitled-file";
}

export function getUploadExtension(name: string): string {
  const cleaned = sanitizeVisibleName(name).toLowerCase();
  const lastPart = cleaned.includes(".") ? cleaned.split(".").pop() || "" : "";
  return lastPart.replace(/[^a-z0-9]+/g, "");
}

export function normalizeUploadMimeType(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const [mimeType] = value.trim().toLowerCase().split(";");
  return mimeType || null;
}

export function isAllowedUploadType(name: string, mimeType: unknown): boolean {
  const extension = getUploadExtension(name);
  if ((BLOCKED_UPLOAD_EXTENSIONS as readonly string[]).includes(extension)) return false;
  if ((ALLOWED_UPLOAD_EXTENSIONS as readonly string[]).includes(extension)) return true;

  const normalizedMime = normalizeUploadMimeType(mimeType);
  if (!normalizedMime) return false;
  return (ALLOWED_UPLOAD_MIME_TYPES as readonly string[]).includes(normalizedMime);
}

export function assertUploadFileAllowed(input: { name: string; size: number; mimeType?: unknown }): void {
  if (!Number.isFinite(input.size) || input.size <= 0) {
    throw new Error("File size must be greater than zero");
  }
  if (input.size > MAX_UPLOAD_FILE_SIZE_BYTES) {
    throw new Error(`File is larger than the ${MAX_UPLOAD_FILE_SIZE_LABEL} upload limit`);
  }
  if (!isAllowedUploadType(input.name, input.mimeType)) {
    throw new Error("File type is not allowed for upload");
  }
}

export function assertNonEmptyName(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is required`);
  }

  const cleaned = sanitizeVisibleName(value);
  if (cleaned.length > MAX_NAME_LENGTH) {
    throw new Error(`${label} must be ${MAX_NAME_LENGTH} characters or fewer`);
  }
  return cleaned;
}

export function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.slice(0, MAX_TAG_LENGTH))
    .filter((entry) => {
      const slug = normalizeSlug(entry);
      if (seen.has(slug)) return false;
      seen.add(slug);
      return true;
    });
}

export function normalizeRoleIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => /^role_[a-zA-Z0-9_-]{1,80}$/.test(entry))
    .filter((entry) => {
      if (seen.has(entry)) return false;
      seen.add(entry);
      return true;
    })
    .slice(0, MAX_ROLE_IDS);
}

export function assertFileInitPayload(value: unknown): FileInitPayload {
  const payload = value as Record<string, unknown>;
  const name = assertNonEmptyName(payload.name, "File name");
  const size = Number(payload.size);
  assertUploadFileAllowed({ name, size, mimeType: payload.mimeType });

  const projectId = typeof payload.projectId === "string" ? payload.projectId.trim() : "";
  if (!projectId) {
    throw new Error("Project is required");
  }

  const roleIds = normalizeRoleIds(payload.roleIds);
  const visibility = payload.visibility === "public" ? "public" : payload.visibility === "roles" ? "roles" : "private";

  return {
    name,
    size,
    mimeType: normalizeUploadMimeType(payload.mimeType),
    projectId,
    folderId: typeof payload.folderId === "string" && payload.folderId.trim() ? payload.folderId.trim() : null,
    tags: normalizeTags(payload.tags),
    visibility,
    roleIds: visibility === "roles" ? roleIds : [],
  };
}
