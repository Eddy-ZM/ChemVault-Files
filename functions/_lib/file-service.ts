import { buildR2Key } from "../../src/lib/chemvault-files/r2-key";
import type {
  FileActivityEventType,
  FileInitPayload,
  FileRecord,
  UploadMode,
  UploadSessionStatus,
} from "../../src/lib/chemvault-files/types";
import {
  assertFileInitPayload,
  normalizeTags,
  sanitizeVisibleName,
} from "../../src/lib/chemvault-files/validation";

export interface UploadSessionDraft {
  id: string;
  fileId: string;
  r2Key: string;
  mode: UploadMode;
  status: UploadSessionStatus;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface FileInitDraft {
  file: Omit<FileRecord, "tags">;
  session: UploadSessionDraft;
}

interface CreateFileInitDraftInput {
  payload: unknown;
  projectSlug: string;
  actorEmail: string;
  now?: Date;
  idFactory?: () => string;
  sessionIdFactory?: () => string;
}

export function createFileInitDraft(input: CreateFileInitDraftInput): FileInitDraft {
  const payload: FileInitPayload = assertFileInitPayload(input.payload);
  const now = input.now ?? new Date();
  const timestamp = now.toISOString();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  const fileId = input.idFactory?.() ?? crypto.randomUUID();
  const sessionId = input.sessionIdFactory?.() ?? crypto.randomUUID();
  const r2Key = buildR2Key({
    projectSlug: input.projectSlug,
    fileId,
    originalName: payload.name,
    now,
  });

  return {
    file: {
      id: fileId,
      projectId: payload.projectId,
      folderId: payload.folderId,
      displayName: payload.name,
      originalName: payload.name,
      r2Key,
      mimeType: payload.mimeType,
      sizeBytes: payload.size,
      status: "pending",
      checksum: null,
      uploadSessionId: sessionId,
      actorEmail: input.actorEmail,
      downloadCount: 0,
      visibility: payload.visibility,
      roleIds: payload.roleIds,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    },
    session: {
      id: sessionId,
      fileId,
      r2Key,
      mode: "direct",
      status: "created",
      expiresAt,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  };
}

export function buildDownloadHeaders(input: { displayName: string; mimeType: string | null; sizeBytes: number }): Headers {
  const headers = new Headers();
  headers.set("content-type", input.mimeType || "application/octet-stream");
  headers.set("content-length", String(input.sizeBytes));
  headers.set("content-disposition", `attachment; filename="${sanitizeVisibleName(input.displayName)}"`);
  return headers;
}

export function buildInlinePreviewHeaders(input: { displayName: string; mimeType: string | null; sizeBytes: number }): Headers {
  const headers = new Headers();
  headers.set("content-type", input.mimeType || "application/octet-stream");
  headers.set("content-length", String(input.sizeBytes));
  headers.set("content-disposition", `inline; filename="${sanitizeVisibleName(input.displayName)}"`);
  headers.set("x-content-type-options", "nosniff");
  return headers;
}

export function coercePatchPayload(value: unknown): {
  displayName?: string;
  projectId?: string;
  folderId?: string | null;
  tags?: string[];
} {
  const input = value as Record<string, unknown>;
  const patch: ReturnType<typeof coercePatchPayload> = {};
  if (typeof input.displayName === "string") patch.displayName = sanitizeVisibleName(input.displayName);
  if (typeof input.projectId === "string" && input.projectId.trim()) patch.projectId = input.projectId.trim();
  if (typeof input.folderId === "string") patch.folderId = input.folderId.trim() || null;
  if (Array.isArray(input.tags)) patch.tags = normalizeTags(input.tags);
  return patch;
}

export function coerceShareCreatePayload(value: unknown, now = new Date()): {
  allowDownload: boolean;
  isPublic: boolean;
  expiresAt: string;
  expiresInDays: number;
} {
  const input = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const rawDays = typeof input.expiresInDays === "number" ? input.expiresInDays : 7;
  const expiresInDays = [1, 7, 30].includes(rawDays) ? rawDays : 7;
  const expiresAt = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
  return {
    allowDownload: input.allowDownload === true,
    isPublic: input.isPublic === true,
    expiresAt,
    expiresInDays,
  };
}

export function createShareToken(idFactory: () => string = () => crypto.randomUUID()): string {
  return `sh_${idFactory().replace(/[^a-zA-Z0-9]/g, "")}`;
}

export function isShareInactive(share: { expiresAt: string; revokedAt: string | null }, now = new Date()): boolean {
  if (share.revokedAt) return true;
  return new Date(share.expiresAt).getTime() <= now.getTime();
}

export interface FileActivityDraft {
  id: string;
  fileId: string;
  actorEmail: string | null;
  eventType: FileActivityEventType;
  metadataJson: string | null;
  createdAt: string;
}

export function createActivityDraft(input: {
  fileId: string;
  actorEmail?: string | null;
  eventType: FileActivityEventType;
  metadata?: Record<string, unknown> | null;
  now?: Date;
  idFactory?: () => string;
}): FileActivityDraft {
  const now = input.now ?? new Date();
  return {
    id: input.idFactory?.() ?? crypto.randomUUID(),
    fileId: input.fileId,
    actorEmail: input.actorEmail ?? null,
    eventType: input.eventType,
    metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
    createdAt: now.toISOString(),
  };
}

export async function recordFileActivity(db: D1Database, draft: FileActivityDraft): Promise<void> {
  try {
    await db
      .prepare("INSERT INTO file_activity (id, file_id, actor_email, event_type, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(draft.id, draft.fileId, draft.actorEmail, draft.eventType, draft.metadataJson, draft.createdAt)
      .run();
  } catch (error) {
    if (error instanceof Error && error.message.includes("no such table: file_activity")) return;
    throw error;
  }
}
