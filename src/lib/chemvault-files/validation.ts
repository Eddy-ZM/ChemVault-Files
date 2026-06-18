import type { FileInitPayload } from "./types";

const MAX_NAME_LENGTH = 160;
const MAX_TAG_LENGTH = 40;
const MAX_ROLE_IDS = 20;

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
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error("File size must be greater than zero");
  }

  const projectId = typeof payload.projectId === "string" ? payload.projectId.trim() : "";
  if (!projectId) {
    throw new Error("Project is required");
  }

  const roleIds = normalizeRoleIds(payload.roleIds);
  const visibility = payload.visibility === "roles" ? "roles" : "public";

  return {
    name,
    size,
    mimeType: typeof payload.mimeType === "string" && payload.mimeType.trim() ? payload.mimeType.trim() : null,
    projectId,
    folderId: typeof payload.folderId === "string" && payload.folderId.trim() ? payload.folderId.trim() : null,
    tags: normalizeTags(payload.tags),
    visibility,
    roleIds: visibility === "roles" ? roleIds : [],
  };
}
