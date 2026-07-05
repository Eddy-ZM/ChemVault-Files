import type { Env } from "../../../../_lib/env";
import { listFileRoleIds, mapFile, mapShare, requireDb } from "../../../../_lib/db";
import { coerceShareCreatePayload } from "../../../../_lib/file-service";
import { canViewFile, canWriteFiles, permissionDeniedJson, resolveActorAccess } from "../../../../_lib/permissions";
import { errorJson, okJson, parseJsonBody, routeError } from "../../../../_lib/http";

export const onRequestPatch: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    const db = requireDb(env.FILES_DB);
    const access = await resolveActorAccess(request, env, db);
    if (!canWriteFiles(access)) return permissionDeniedJson(access, "write");
    const fileId = String(params.id || "");
    const token = String(params.token || "");
    const fileRow = await db.prepare("SELECT * FROM files WHERE id = ? AND deleted_at IS NULL").bind(fileId).first();
    if (!fileRow) return errorJson("File was not found", 404, "FILE_NOT_FOUND");
    const file = { ...mapFile(fileRow as Record<string, unknown>), roleIds: await listFileRoleIds(db, fileId) };
    if (!canViewFile(access, file)) return permissionDeniedJson(access, "write");

    const existing = await db
      .prepare("SELECT * FROM file_shares WHERE token = ? AND file_id = ? AND revoked_at IS NULL")
      .bind(token, fileId)
      .first();
    if (!existing) return errorJson("Share link was not found", 404, "SHARE_NOT_FOUND");

    const rawPayload = (await parseJsonBody(request)) as Record<string, unknown>;
    const payload = coerceShareCreatePayload(rawPayload);
    const allowDownload = typeof rawPayload.allowDownload === "boolean" ? rawPayload.allowDownload : Number((existing as Record<string, unknown>).allow_download) === 1;
    const isPublic = typeof rawPayload.isPublic === "boolean" ? rawPayload.isPublic : Number((existing as Record<string, unknown>).is_public ?? 0) === 1;
    await db
      .prepare("UPDATE file_shares SET allow_download = ?, is_public = ?, expires_at = ? WHERE token = ? AND file_id = ? AND revoked_at IS NULL")
      .bind(allowDownload ? 1 : 0, isPublic ? 1 : 0, payload.expiresAt, token, fileId)
      .run();
    await db
      .prepare("UPDATE files SET shared_status = ?, visibility = CASE WHEN visibility = 'private' THEN 'roles' ELSE visibility END, updated_at = ? WHERE id = ?")
      .bind(isPublic ? "public" : "shared", new Date().toISOString(), fileId)
      .run();

    const row = await db.prepare("SELECT * FROM file_shares WHERE token = ? AND file_id = ?").bind(token, fileId).first();
    return okJson({ share: mapShare(row as Record<string, unknown>) });
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
    const token = String(params.token || "");
    const fileRow = await db.prepare("SELECT * FROM files WHERE id = ? AND deleted_at IS NULL").bind(fileId).first();
    if (!fileRow) return errorJson("File was not found", 404, "FILE_NOT_FOUND");
    const file = { ...mapFile(fileRow as Record<string, unknown>), roleIds: await listFileRoleIds(db, fileId) };
    if (!canViewFile(access, file)) return permissionDeniedJson(access, "write");

    const existing = await db
      .prepare("SELECT * FROM file_shares WHERE token = ? AND file_id = ? AND revoked_at IS NULL")
      .bind(token, fileId)
      .first();
    if (!existing) return errorJson("Share link was not found", 404, "SHARE_NOT_FOUND");

    await db
      .prepare("UPDATE file_shares SET revoked_at = ? WHERE token = ? AND file_id = ? AND revoked_at IS NULL")
      .bind(new Date().toISOString(), token, fileId)
      .run();

    return okJson({ status: "revoked", token });
  } catch (error) {
    return routeError(error);
  }
};
