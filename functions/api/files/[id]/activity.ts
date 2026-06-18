import type { Env } from "../../../_lib/env";
import { listFileRoleIds, mapActivity, mapFile, requireDb } from "../../../_lib/db";
import { canReadFiles, canViewFile, permissionDeniedJson, resolveActorAccess } from "../../../_lib/permissions";
import { errorJson, okJson, routeError } from "../../../_lib/http";

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    const db = requireDb(env.FILES_DB);
    const access = await resolveActorAccess(request, env, db);
    if (!canReadFiles(access)) return permissionDeniedJson(access, "read");
    const fileId = String(params.id || "");
    const fileRow = await db.prepare("SELECT * FROM files WHERE id = ? AND deleted_at IS NULL").bind(fileId).first();
    if (!fileRow) return errorJson("File was not found", 404, "FILE_NOT_FOUND");
    const file = { ...mapFile(fileRow as Record<string, unknown>), roleIds: await listFileRoleIds(db, fileId) };
    if (!canViewFile(access, file)) return permissionDeniedJson(access, "read");
    const rows = await db
      .prepare("SELECT * FROM file_activity WHERE file_id = ? ORDER BY created_at DESC LIMIT 50")
      .bind(fileId)
      .all();
    return okJson({
      activity: (rows.results as Record<string, unknown>[]).map(mapActivity),
    });
  } catch (error) {
    return routeError(error);
  }
};
