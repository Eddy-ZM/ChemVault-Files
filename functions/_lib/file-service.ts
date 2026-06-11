import { buildR2Key } from "../../src/lib/chemvault-files/r2-key";
import type {
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
