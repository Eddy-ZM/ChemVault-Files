import type { Env } from "../../../_lib/env";
import { getActorEmail } from "../../../_lib/env";
import { mapFile, mapShare, requireDb } from "../../../_lib/db";
import {
  coerceShareCreatePayload,
  createActivityDraft,
  createShareToken,
  recordFileActivity,
} from "../../../_lib/file-service";
import { errorJson, okJson, parseJsonBody, routeError } from "../../../_lib/http";

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    const db = requireDb(env.FILES_DB);
    const fileId = String(params.id || "");
    const row = await db.prepare("SELECT * FROM files WHERE id = ? AND status = 'ready' AND deleted_at IS NULL").bind(fileId).first();
    if (!row) return errorJson("File was not found", 404, "FILE_NOT_FOUND");
    const file = mapFile(row as Record<string, unknown>);
    const now = new Date();
    const payload = coerceShareCreatePayload(await parseJsonBody(request), now);
    const token = createShareToken();
    const actorEmail = getActorEmail(request, env);
    const createdAt = now.toISOString();

    await db
      .prepare(
        "INSERT INTO file_shares (token, file_id, created_by_email, allow_download, expires_at, created_at, revoked_at, access_count, last_accessed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(token, file.id, actorEmail, payload.allowDownload ? 1 : 0, payload.expiresAt, createdAt, null, 0, null)
      .run();

    await recordFileActivity(
      db,
      createActivityDraft({
        fileId: file.id,
        actorEmail,
        eventType: "share_created",
        metadata: {
          token,
          allowDownload: payload.allowDownload,
          expiresAt: payload.expiresAt,
        },
        now,
      })
    );

    const shareRow = await db.prepare("SELECT * FROM file_shares WHERE token = ?").bind(token).first();
    const share = mapShare((shareRow ?? {
      token,
      file_id: file.id,
      created_by_email: actorEmail,
      allow_download: payload.allowDownload ? 1 : 0,
      expires_at: payload.expiresAt,
      created_at: createdAt,
      revoked_at: null,
      access_count: 0,
      last_accessed_at: null,
    }) as Record<string, unknown>);
    const shareUrl = `${new URL(request.url).origin}/share?token=${encodeURIComponent(token)}`;

    return okJson({ share, shareUrl }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
};
