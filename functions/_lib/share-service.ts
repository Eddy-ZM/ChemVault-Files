import type { FileShareRecord, SharePublicResponse } from "../../src/lib/chemvault-files/types";
import { resolvePreviewKind } from "../../src/lib/chemvault-files/preview";
import { mapFile, mapShare } from "./db";
import { createActivityDraft, isShareInactive, recordFileActivity } from "./file-service";

export interface ShareTarget {
  share: FileShareRecord;
  file: ReturnType<typeof mapFile>;
}

export async function loadShareTarget(db: D1Database, token: string): Promise<ShareTarget | null> {
  const row = await db
    .prepare(
      "SELECT s.*, f.* FROM file_shares s JOIN files f ON f.id = s.file_id WHERE s.token = ? AND f.status = 'ready' AND f.deleted_at IS NULL"
    )
    .bind(token)
    .first();
  if (!row) return null;
  const record = row as Record<string, unknown>;
  return {
    share: mapShare(record),
    file: mapFile(record),
  };
}

export function isShareTargetInactive(target: ShareTarget, now = new Date()): boolean {
  return isShareInactive(target.share, now);
}

export function buildPublicShareResponse(target: ShareTarget): SharePublicResponse {
  const previewKind = resolvePreviewKind(target.file);
  const previewUrl = canStreamSharePreview(target.share.allowDownload, previewKind)
    ? `/api/shares/${encodeURIComponent(target.share.token)}/preview`
    : null;
  return {
    file: {
      id: target.file.id,
      displayName: target.file.displayName,
      mimeType: target.file.mimeType,
      sizeBytes: target.file.sizeBytes,
      previewKind,
    },
    share: {
      token: target.share.token,
      allowDownload: target.share.allowDownload,
      isPublic: target.share.isPublic,
      expiresAt: target.share.expiresAt,
      createdAt: target.share.createdAt,
    },
    previewUrl,
    downloadUrl: target.share.allowDownload ? `/api/shares/${encodeURIComponent(target.share.token)}/download` : null,
  };
}

export function canStreamSharePreview(_allowDownload: boolean, previewKind: ReturnType<typeof resolvePreviewKind>): boolean {
  return previewKind !== "unsupported";
}

export async function recordShareAccess(
  db: D1Database,
  target: ShareTarget,
  metadata: Record<string, unknown>,
  now = new Date()
): Promise<void> {
  const timestamp = now.toISOString();
  await db
    .prepare("UPDATE file_shares SET access_count = access_count + 1, last_accessed_at = ? WHERE token = ?")
    .bind(timestamp, target.share.token)
    .run();
  await recordFileActivity(
    db,
    createActivityDraft({
      fileId: target.file.id,
      actorEmail: null,
      eventType: metadata.mode === "download" ? "share_download" : "share_accessed",
      metadata: {
        token: target.share.token,
        ...metadata,
      },
      now,
    })
  );
}
