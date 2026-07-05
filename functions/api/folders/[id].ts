import type { Env } from "../../_lib/env";
import { listFileRoleAccess, mapFile, requireDb } from "../../_lib/db";
import { canViewFile, canWriteFiles, permissionDeniedJson, resolveActorAccess } from "../../_lib/permissions";
import { ensureDriveAppSchema } from "../../_lib/schema";
import { errorJson, okJson, routeError } from "../../_lib/http";

export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    const db = requireDb(env.FILES_DB);
    await ensureDriveAppSchema(db);
    const access = await resolveActorAccess(request, env, db);
    if (!canWriteFiles(access)) return permissionDeniedJson(access, "write");

    const folderId = String(params.id || "");
    if (!folderId) throw new Error("Folder id is required");

    const folder = await db.prepare("SELECT * FROM folders WHERE id = ?").bind(folderId).first();
    if (!folder) throw new Error("Folder was not found");

    const options = await readDeleteOptions(request);
    const childCount = await db.prepare("SELECT COUNT(*) AS count FROM folders WHERE parent_id = ?").bind(folderId).first<{ count: number }>();
    const fileCount = await db
      .prepare("SELECT COUNT(*) AS count FROM files WHERE folder_id = ? AND deleted_at IS NULL")
      .bind(folderId)
      .first<{ count: number }>();
    const hasDirectContents = Number(childCount?.count ?? 0) > 0 || Number(fileCount?.count ?? 0) > 0;
    if (hasDirectContents && !options.recursive) {
      return errorJson("Folder must be empty before deletion.", 409, "FOLDER_NOT_EMPTY");
    }

    if (!options.recursive) {
      const now = new Date().toISOString();
      await detachFilesFromFolders(db, [folderId], now);
      await db.prepare("UPDATE folders SET is_trashed = 1, trashed_at = ?, deleted_at = ?, updated_at = ? WHERE id = ?").bind(now, now, now, folderId).run();
      return okJson({ status: "trashed", folderId, trashedAt: now });
    }

    const folderIds = await listFolderTreeIds(db, folderId);
    const fileRows = await listActiveFilesInFolders(db, folderIds);
    const fileIds = fileRows.map((row) => String(row.id));
    const roleIdsByFile = await listFileRoleAccess(db, fileIds);
    const files = fileRows.map((row) => {
      const file = mapFile(row);
      return { ...file, roleIds: roleIdsByFile.get(file.id) ?? [] };
    });
    if (files.some((file) => !canViewFile(access, file))) return permissionDeniedJson(access, "write");

    const now = new Date().toISOString();
    for (const file of files) {
      await db
        .prepare("UPDATE files SET status = 'deleted', deleted_at = ?, trashed_at = ?, updated_at = ? WHERE id = ?")
        .bind(now, now, now, file.id)
        .run();
    }

    await markFoldersTrashed(db, folderIds, now);

    return okJson({ status: "trashed", folderId, deletedFolderCount: folderIds.length, deletedFileCount: files.length, trashedAt: now });
  } catch (error) {
    return routeError(error);
  }
};

async function readDeleteOptions(request: Request): Promise<{ recursive: boolean }> {
  const text = await request.clone().text();
  if (!text.trim()) return { recursive: false };
  try {
    const parsed = JSON.parse(text) as { recursive?: unknown };
    return { recursive: parsed.recursive === true };
  } catch {
    throw new Error("Request body must be valid JSON");
  }
}

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

async function listActiveFilesInFolders(db: D1Database, folderIds: string[]): Promise<Record<string, unknown>[]> {
  if (folderIds.length === 0) return [];
  const placeholders = folderIds.map(() => "?").join(",");
  const result = await db
    .prepare(`SELECT * FROM files WHERE folder_id IN (${placeholders}) AND deleted_at IS NULL`)
    .bind(...folderIds)
    .all();
  return result.results as Record<string, unknown>[];
}

async function detachFilesFromFolders(db: D1Database, folderIds: string[], timestamp: string): Promise<void> {
  if (folderIds.length === 0) return;
  const placeholders = folderIds.map(() => "?").join(",");
  await db
    .prepare(`UPDATE files SET folder_id = NULL, updated_at = ? WHERE folder_id IN (${placeholders})`)
    .bind(timestamp, ...folderIds)
    .run();
}

async function markFoldersTrashed(db: D1Database, folderIds: string[], timestamp: string): Promise<void> {
  if (folderIds.length === 0) return;
  const placeholders = folderIds.map(() => "?").join(",");
  await db
    .prepare(`UPDATE folders SET is_trashed = 1, trashed_at = ?, deleted_at = ?, updated_at = ? WHERE id IN (${placeholders})`)
    .bind(timestamp, timestamp, timestamp, ...folderIds)
    .run();
}
