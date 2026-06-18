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

    const payload = coerceShareCreatePayload(await parseJsonBody(request));
    await db
      .prepare("UPDATE file_shares SET expires_at = ? WHERE token = ? AND file_id = ? AND revoked_at IS NULL")
      .bind(payload.expiresAt, token, fileId)
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
