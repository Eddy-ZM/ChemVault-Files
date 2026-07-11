import { listFileRoleAccess, mapFile } from "../../../_lib/db";
import type { Env } from "../../../_lib/env";
import { okJson, routeError } from "../../../_lib/http";
import { canViewFile, canWriteFiles, permissionDeniedJson, resolveActorAccess } from "../../../_lib/permissions";
import { ensureDriveAppSchema } from "../../../_lib/schema";

export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
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
      const file = { ...mapFile(fileRow), roleIds: (await listFileRoleAccess(db, [id])).get(id) ?? [] };
      if (!canViewFile(access, file)) return Response.json({ error: "File was not found" }, { status: 404 });

      await deleteR2Objects(env.FILES_BUCKET, [file.r2Key]);
      await deleteFileRows(db, [id]);
      return okJson({ status: "permanently_deleted", type: "file", fileId: id });
    }

    const folderRow = await db.prepare("SELECT * FROM folders WHERE id = ? AND deleted_at IS NOT NULL").bind(id).first<Record<string, unknown>>();
    if (folderRow) {
      const folderIds = await listFolderTreeIds(db, id);
      const fileRows = await listTrashedFilesInFolders(db, folderIds);
      const fileIds = fileRows.map((row) => String(row.id));
      const roleIdsByFile = await listFileRoleAccess(db, fileIds);
      const files = fileRows.map((row) => {
        const file = mapFile(row);
        return { ...file, roleIds: roleIdsByFile.get(file.id) ?? [] };
      });
      if (files.some((file) => !canViewFile(access, file))) return permissionDeniedJson(access, "write");

      await deleteR2Objects(
        env.FILES_BUCKET,
        files.map((file) => file.r2Key)
      );
      await deleteFileRows(db, fileIds);
      await deleteFolderRows(db, folderIds);

      return okJson({
        status: "permanently_deleted",
        type: "folder",
        folderId: id,
        deletedFolderCount: folderIds.length,
        deletedFileCount: fileIds.length,
      });
    }

    return Response.json({ error: "Trash item was not found" }, { status: 404 });
  } catch (error) {
    return routeError(error);
  }
};

async function listFolderTreeIds(db: D1Database, folderId: string): Promise<string[]> {
  const result = await db
    .prepare(
      "WITH RECURSIVE folder_tree(id) AS (SELECT id FROM folders WHERE id = ? UNION ALL SELECT folders.id FROM folders JOIN folder_tree ON folders.parent_id = folder_tree.id) SELECT id FROM folder_tree"
    )
    .bind(folderId)
    .all();
  const ids = (result.results as Record<string, unknown>[]).map((row) => String(row.id));
  return ids.length ? ids : [folderId];
}

async function listTrashedFilesInFolders(db: D1Database, folderIds: string[]): Promise<Record<string, unknown>[]> {
  if (folderIds.length === 0) return [];
  const placeholders = folderIds.map(() => "?").join(",");
  const result = await db
    .prepare(`SELECT * FROM files WHERE folder_id IN (${placeholders}) AND deleted_at IS NOT NULL`)
    .bind(...folderIds)
    .all();
  return result.results as Record<string, unknown>[];
}

async function deleteR2Objects(bucket: R2Bucket | undefined, keys: string[]): Promise<void> {
  if (!bucket) return;
  await Promise.all(keys.filter(Boolean).map((key) => bucket.delete(key).catch(() => undefined)));
}

async function deleteFileRows(db: D1Database, fileIds: string[]): Promise<void> {
  if (fileIds.length === 0) return;
  const placeholders = fileIds.map(() => "?").join(",");
  await db.prepare(`DELETE FROM file_tags WHERE file_id IN (${placeholders})`).bind(...fileIds).run();
  await db.prepare(`DELETE FROM file_role_access WHERE file_id IN (${placeholders})`).bind(...fileIds).run();
  await db.prepare(`DELETE FROM file_shares WHERE file_id IN (${placeholders})`).bind(...fileIds).run();
  await db.prepare(`DELETE FROM file_activity WHERE file_id IN (${placeholders})`).bind(...fileIds).run();
  await db.prepare(`DELETE FROM upload_sessions WHERE file_id IN (${placeholders})`).bind(...fileIds).run();
  await db.prepare(`DELETE FROM files WHERE id IN (${placeholders})`).bind(...fileIds).run();
}

async function deleteFolderRows(db: D1Database, folderIds: string[]): Promise<void> {
  if (folderIds.length === 0) return;
  const placeholders = folderIds.map(() => "?").join(",");
  await db.prepare(`DELETE FROM folders WHERE id IN (${placeholders})`).bind(...folderIds).run();
}
