import type { Env } from "../../../_lib/env";
import { listFileRoleIds, mapFile, requireDb } from "../../../_lib/db";
import { buildInlinePreviewHeaders, createActivityDraft, recordFileActivity } from "../../../_lib/file-service";
import { canReadFiles, canViewFile, permissionDeniedJson, resolveActorAccess } from "../../../_lib/permissions";
import { errorJson, routeError } from "../../../_lib/http";
import { isPreviewableFile } from "../../../../src/lib/chemvault-files/preview";
import { ensureDriveAppSchema } from "../../../_lib/schema";

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    if (!env.FILES_BUCKET) throw new Error("R2 binding FILES_BUCKET is not configured");
    const db = requireDb(env.FILES_DB);
    await ensureDriveAppSchema(db);
    const access = await resolveActorAccess(request, env, db);
    if (!canReadFiles(access)) return permissionDeniedJson(access, "read");
    const fileId = String(params.id || "");
    const row = await db.prepare("SELECT * FROM files WHERE id = ? AND deleted_at IS NULL").bind(fileId).first();
    if (!row) return errorJson("File was not found", 404, "FILE_NOT_FOUND");
    let file = { ...mapFile(row as Record<string, unknown>), roleIds: await listFileRoleIds(db, fileId) };
    if (!canViewFile(access, file)) return permissionDeniedJson(access, "read");
    if (!isPreviewableFile(file)) return errorJson("File type is not previewable", 415, "PREVIEW_UNSUPPORTED");
    if (file.status !== "ready" && file.status !== "pending" && file.status !== "uploading") {
      return errorJson("File is not ready for preview", 409, "FILE_NOT_READY");
    }

    const object = await env.FILES_BUCKET.get(file.r2Key);
    if (!object?.body) {
      return file.status === "ready"
        ? errorJson("Stored object was not found", 404, "OBJECT_NOT_FOUND")
        : errorJson("File is not ready for preview", 409, "FILE_NOT_READY");
    }

    if (file.status !== "ready") {
      const now = new Date().toISOString();
      await db.prepare("UPDATE files SET status = 'ready', updated_at = ? WHERE id = ?").bind(now, fileId).run();
      if (file.uploadSessionId) {
        await db.prepare("UPDATE upload_sessions SET status = 'complete', updated_at = ? WHERE id = ?").bind(now, file.uploadSessionId).run();
      }
      file = { ...file, status: "ready", updatedAt: now };
    }

    await recordFileActivity(
      db,
      createActivityDraft({
        fileId,
        actorEmail: access.actorEmail,
        eventType: "preview",
        metadata: { mimeType: file.mimeType, name: file.displayName },
      })
    );
    await db.prepare("UPDATE files SET last_opened_at = ? WHERE id = ?").bind(new Date().toISOString(), fileId).run();
    return new Response(object.body, { headers: buildInlinePreviewHeaders(file) });
  } catch (error) {
    return routeError(error);
  }
};
