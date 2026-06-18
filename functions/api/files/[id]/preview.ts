import type { Env } from "../../../_lib/env";
import { getActorEmail } from "../../../_lib/env";
import { mapFile, requireDb } from "../../../_lib/db";
import { buildInlinePreviewHeaders, createActivityDraft, recordFileActivity } from "../../../_lib/file-service";
import { canReadFiles, permissionDeniedJson, resolveActorAccess } from "../../../_lib/permissions";
import { errorJson, routeError } from "../../../_lib/http";
import { isPreviewableFile } from "../../../../src/lib/chemvault-files/preview";

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    if (!env.FILES_BUCKET) throw new Error("R2 binding FILES_BUCKET is not configured");
    const db = requireDb(env.FILES_DB);
    const access = await resolveActorAccess(request, env, db);
    if (!canReadFiles(access)) return permissionDeniedJson(access, "read");
    const fileId = String(params.id || "");
    const row = await db.prepare("SELECT * FROM files WHERE id = ? AND status = 'ready' AND deleted_at IS NULL").bind(fileId).first();
    if (!row) return errorJson("File was not found", 404, "FILE_NOT_FOUND");
    const file = mapFile(row as Record<string, unknown>);
    if (!isPreviewableFile(file)) return errorJson("File type is not previewable", 415, "PREVIEW_UNSUPPORTED");

    const object = await env.FILES_BUCKET.get(file.r2Key);
    if (!object?.body) return errorJson("Stored object was not found", 404, "OBJECT_NOT_FOUND");

    await recordFileActivity(
      db,
      createActivityDraft({
        fileId,
        actorEmail: getActorEmail(request, env),
        eventType: "preview",
        metadata: { mimeType: file.mimeType, name: file.displayName },
      })
    );
    return new Response(object.body, { headers: buildInlinePreviewHeaders(file) });
  } catch (error) {
    return routeError(error);
  }
};
