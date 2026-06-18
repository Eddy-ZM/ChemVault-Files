import type { Env } from "../../_lib/env";
import { listFileRoleIds, mapFile, requireDb } from "../../_lib/db";
import { coercePatchPayload } from "../../_lib/file-service";
import { canViewFile, canWriteFiles, permissionDeniedJson, resolveActorAccess } from "../../_lib/permissions";
import { normalizeSlug } from "../../../src/lib/chemvault-files/validation";
import { okJson, parseJsonBody, routeError } from "../../_lib/http";

async function replaceFileTags(db: D1Database, fileId: string, tags: string[]): Promise<void> {
  await db.prepare("DELETE FROM file_tags WHERE file_id = ?").bind(fileId).run();
  for (const name of tags) {
    const slug = normalizeSlug(name);
    const tagId = `tag_${slug}`;
    await db
      .prepare("INSERT OR IGNORE INTO tags (id, name, slug, color, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(tagId, name, slug, null, new Date().toISOString())
      .run();
    await db.prepare("INSERT OR IGNORE INTO file_tags (file_id, tag_id) VALUES (?, ?)").bind(fileId, tagId).run();
  }
}

export const onRequestPatch: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    const db = requireDb(env.FILES_DB);
    const access = await resolveActorAccess(request, env, db);
    if (!canWriteFiles(access)) return permissionDeniedJson(access, "write");
    const fileId = String(params.id || "");
    const fileRow = await db.prepare("SELECT * FROM files WHERE id = ? AND deleted_at IS NULL").bind(fileId).first();
    if (!fileRow) throw new Error("File was not found");
    const file = { ...mapFile(fileRow as Record<string, unknown>), roleIds: await listFileRoleIds(db, fileId) };
    if (!canViewFile(access, file)) return permissionDeniedJson(access, "write");

    const patch = coercePatchPayload(await parseJsonBody(request));
    const now = new Date().toISOString();

    await db
      .prepare(
        "UPDATE files SET display_name = COALESCE(?, display_name), project_id = COALESCE(?, project_id), folder_id = CASE WHEN ? THEN ? ELSE folder_id END, updated_at = ? WHERE id = ? AND deleted_at IS NULL"
      )
      .bind(
        patch.displayName ?? null,
        patch.projectId ?? null,
        Object.prototype.hasOwnProperty.call(patch, "folderId") ? 1 : 0,
        patch.folderId ?? null,
        now,
        fileId
      )
      .run();

    if (patch.tags) {
      await replaceFileTags(db, fileId, patch.tags);
    }

    return okJson({ status: "updated", fileId });
  } catch (error) {
    return routeError(error);
  }
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    const db = requireDb(env.FILES_DB);
    const access = await resolveActorAccess(request, env, db);
    if (!canWriteFiles(access)) return permissionDeniedJson(access, "write");
    const fileId = String(params.id || "");
    const row = await db.prepare("SELECT * FROM files WHERE id = ? AND deleted_at IS NULL").bind(fileId).first();
    if (!row) throw new Error("File was not found");
    const file = { ...mapFile(row as Record<string, unknown>), roleIds: await listFileRoleIds(db, fileId) };
    if (!canViewFile(access, file)) return permissionDeniedJson(access, "write");

    const now = new Date().toISOString();
    await db
      .prepare("UPDATE files SET status = 'deleted', deleted_at = ?, updated_at = ? WHERE id = ?")
      .bind(now, now, fileId)
      .run();
    await env.FILES_BUCKET?.delete(file.r2Key);

    return okJson({ status: "deleted", fileId });
  } catch (error) {
    return routeError(error);
  }
};
