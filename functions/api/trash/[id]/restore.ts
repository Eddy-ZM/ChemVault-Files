import { listFileRoleIds, mapFile, mapFolder } from "../../../_lib/db";
import type { Env } from "../../../_lib/env";
import { okJson, routeError } from "../../../_lib/http";
import { canViewFile, canWriteFiles, permissionDeniedJson, resolveActorAccess } from "../../../_lib/permissions";
import { ensureDriveAppSchema } from "../../../_lib/schema";

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    const db = env.FILES_DB;
    if (!db) {
      return Response.json({ error: "Files database is not configured" }, { status: 500 });
    }

    await ensureDriveAppSchema(db);

    const access = await resolveActorAccess(request, env, db);
    if (!canWriteFiles(access)) return permissionDeniedJson(access, "write");

    const id = String(params.id ?? "");
    if (!id) {
      return Response.json({ error: "Missing trash item id" }, { status: 400 });
    }

    const fileRow = await db.prepare("SELECT * FROM files WHERE id = ? AND deleted_at IS NOT NULL").bind(id).first<Record<string, unknown>>();
    if (fileRow) {
      const file = { ...mapFile(fileRow), roleIds: await listFileRoleIds(db, id), tags: [] };
      if (!canViewFile(access, file)) return Response.json({ error: "File was not found" }, { status: 404 });

      const updatedAt = new Date().toISOString();
      await db
        .prepare("UPDATE files SET status = 'ready', deleted_at = NULL, trashed_at = NULL, updated_at = ? WHERE id = ?")
        .bind(updatedAt, id)
        .run();

      return okJson({ status: "restored", type: "file", fileId: id, updatedAt });
    }

    const folderRow = await db.prepare("SELECT * FROM folders WHERE id = ? AND deleted_at IS NOT NULL").bind(id).first<Record<string, unknown>>();
    if (folderRow) {
      const folder = mapFolder(folderRow);
      const updatedAt = new Date().toISOString();
      await db
        .prepare("UPDATE folders SET is_trashed = 0, deleted_at = NULL, trashed_at = NULL, updated_at = ? WHERE id = ?")
        .bind(updatedAt, id)
        .run();

      return okJson({ status: "restored", type: "folder", folderId: folder.id, updatedAt });
    }

    return Response.json({ error: "Trash item was not found" }, { status: 404 });
  } catch (error) {
    return routeError(error);
  }
};
