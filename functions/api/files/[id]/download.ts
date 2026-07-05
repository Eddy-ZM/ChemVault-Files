import type { Env } from "../../../_lib/env";
import { listFileRoleIds, mapFile, requireDb } from "../../../_lib/db";
import { buildDownloadHeaders, createActivityDraft, recordFileActivity } from "../../../_lib/file-service";
import { canReadFiles, canViewFile, permissionDeniedJson, resolveActorAccess } from "../../../_lib/permissions";
import { routeError } from "../../../_lib/http";
import { ensureDriveAppSchema } from "../../../_lib/schema";

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    if (!env.FILES_BUCKET) throw new Error("R2 binding FILES_BUCKET is not configured");
    const db = requireDb(env.FILES_DB);
    await ensureDriveAppSchema(db);
    const access = await resolveActorAccess(request, env, db);
    if (!canReadFiles(access)) return permissionDeniedJson(access, "read");
    const fileId = String(params.id || "");
    const row = await db.prepare("SELECT * FROM files WHERE id = ? AND status = 'ready' AND deleted_at IS NULL").bind(fileId).first();
    if (!row) throw new Error("File was not found");
    const file = { ...mapFile(row as Record<string, unknown>), roleIds: await listFileRoleIds(db, fileId) };
    if (!canViewFile(access, file)) return permissionDeniedJson(access, "read");
    const object = await env.FILES_BUCKET.get(file.r2Key);
    if (!object?.body) throw new Error("Stored object was not found");

    await db.prepare("UPDATE files SET download_count = download_count + 1, last_opened_at = ? WHERE id = ?").bind(new Date().toISOString(), fileId).run();
    await recordFileActivity(
      db,
      createActivityDraft({
        fileId,
        actorEmail: access.actorEmail,
        eventType: "download",
        metadata: { mimeType: file.mimeType, name: file.displayName },
      })
    );
    return new Response(object.body, { headers: buildDownloadHeaders(file) });
  } catch (error) {
    return routeError(error);
  }
};
