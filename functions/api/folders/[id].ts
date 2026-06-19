import type { Env } from "../../_lib/env";
import { requireDb } from "../../_lib/db";
import { canWriteFiles, permissionDeniedJson, resolveActorAccess } from "../../_lib/permissions";
import { errorJson, okJson, routeError } from "../../_lib/http";

export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    const db = requireDb(env.FILES_DB);
    const access = await resolveActorAccess(request, env, db);
    if (!canWriteFiles(access)) return permissionDeniedJson(access, "write");

    const folderId = String(params.id || "");
    if (!folderId) throw new Error("Folder id is required");

    const folder = await db.prepare("SELECT * FROM folders WHERE id = ?").bind(folderId).first();
    if (!folder) throw new Error("Folder was not found");

    const childCount = await db.prepare("SELECT COUNT(*) AS count FROM folders WHERE parent_id = ?").bind(folderId).first<{ count: number }>();
    const fileCount = await db
      .prepare("SELECT COUNT(*) AS count FROM files WHERE folder_id = ? AND deleted_at IS NULL")
      .bind(folderId)
      .first<{ count: number }>();
    if (Number(childCount?.count ?? 0) > 0 || Number(fileCount?.count ?? 0) > 0) {
      return errorJson("Folder must be empty before deletion.", 409, "FOLDER_NOT_EMPTY");
    }

    await db.prepare("DELETE FROM folders WHERE id = ?").bind(folderId).run();
    return okJson({ status: "deleted", folderId });
  } catch (error) {
    return routeError(error);
  }
};
