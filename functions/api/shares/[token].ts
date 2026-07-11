import type { Env } from "../../_lib/env";
import { listFileRoleIds, mapFile, mapShare, requireDb } from "../../_lib/db";
import { buildPublicShareResponse, isShareTargetInactive, loadShareTarget, recordShareAccess } from "../../_lib/share-service";
import { canReadFiles, canViewFile, canWriteFiles, permissionDeniedJson, resolveActorAccess } from "../../_lib/permissions";
import { errorJson, okJson, parseJsonBody, routeError } from "../../_lib/http";
import { ensureDriveAppSchema, ensureFileSharesSchema } from "../../_lib/schema";

type SharePatchBody = {
  allowDownload?: unknown;
  isPublic?: unknown;
  expiresAt?: unknown;
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    const db = requireDb(env.FILES_DB);
    await ensureDriveAppSchema(db);
    const token = getToken(params);
    const target = await loadShareTarget(db, token);
    if (!target) return errorJson("Share link was not found", 404, "SHARE_NOT_FOUND");
    if (isShareTargetInactive(target)) return errorJson("Share link expired or was revoked", 410, "SHARE_INACTIVE");
    if (!target.share.isPublic) {
      const access = await resolveActorAccess(request, env, db);
      if (!canReadFiles(access)) return permissionDeniedJson(access, "read");
    }

    await recordShareAccess(db, target, { mode: "metadata" });
    return okJson(buildPublicShareResponse(target));
  } catch (error) {
    return routeError(error);
  }
};

export const onRequestPatch: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    const db = requireDb(env.FILES_DB);
    await ensureFileSharesSchema(db);
    await ensureDriveAppSchema(db);

    const access = await resolveActorAccess(request, env, db);
    if (!canWriteFiles(access)) return permissionDeniedJson(access, "write");

    const token = getToken(params);
    const target = await loadEditableShareTarget(db, token);
    if (!target) return errorJson("Share link was not found", 404, "SHARE_NOT_FOUND");
    if (!canViewFile(access, target.file)) return permissionDeniedJson(access, "write");

    const body = (await parseJsonBody(request)) as SharePatchBody;
    const allowDownload = typeof body.allowDownload === "boolean" ? body.allowDownload : target.share.allowDownload;
    const isPublic = typeof body.isPublic === "boolean" ? body.isPublic : target.share.isPublic;
    const expiresAt = coerceExpiresAt(body.expiresAt, target.share.expiresAt);

    await db
      .prepare("UPDATE file_shares SET allow_download = ?, is_public = ?, expires_at = ? WHERE token = ? AND revoked_at IS NULL")
      .bind(allowDownload ? 1 : 0, isPublic ? 1 : 0, expiresAt, token)
      .run();
    await db
      .prepare("UPDATE files SET shared_status = ?, visibility = CASE WHEN visibility = 'private' THEN 'roles' ELSE visibility END, updated_at = ? WHERE id = ?")
      .bind(isPublic ? "public" : "shared", new Date().toISOString(), target.file.id)
      .run();

    const shareRow = await db.prepare("SELECT * FROM file_shares WHERE token = ?").bind(token).first<Record<string, unknown>>();
    const share = mapShare(shareRow ?? {});
    const sharePath = share.isPublic ? "/share-public" : "/share";
    return okJson({ share, shareUrl: `${new URL(request.url).origin}${sharePath}?token=${encodeURIComponent(token)}` });
  } catch (error) {
    return routeError(error);
  }
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    const db = requireDb(env.FILES_DB);
    await ensureFileSharesSchema(db);
    await ensureDriveAppSchema(db);

    const access = await resolveActorAccess(request, env, db);
    if (!canWriteFiles(access)) return permissionDeniedJson(access, "write");

    const token = getToken(params);
    const target = await loadEditableShareTarget(db, token);
    if (!target) return errorJson("Share link was not found", 404, "SHARE_NOT_FOUND");
    if (!canViewFile(access, target.file)) return permissionDeniedJson(access, "write");

    const now = new Date().toISOString();
    await db.prepare("UPDATE file_shares SET revoked_at = ? WHERE token = ? AND revoked_at IS NULL").bind(now, token).run();
    const remaining = await db
      .prepare("SELECT COUNT(*) AS count FROM file_shares WHERE file_id = ? AND revoked_at IS NULL")
      .bind(target.file.id)
      .first<{ count: number }>();
    if (Number(remaining?.count ?? 0) === 0) {
      await db.prepare("UPDATE files SET shared_status = 'private', updated_at = ? WHERE id = ?").bind(now, target.file.id).run();
    }

    return okJson({ status: "revoked", token, revokedAt: now });
  } catch (error) {
    return routeError(error);
  }
};

function getToken(params: Record<string, string | string[]>): string {
  return String(params.token ?? params.id ?? "");
}

async function loadEditableShareTarget(db: D1Database, token: string) {
  const row = await db
    .prepare("SELECT s.*, f.* FROM file_shares s JOIN files f ON f.id = s.file_id WHERE s.token = ? AND s.revoked_at IS NULL AND f.deleted_at IS NULL")
    .bind(token)
    .first<Record<string, unknown>>();
  if (!row) return null;
  const fileId = String(row.file_id);
  return {
    share: mapShare(row),
    file: { ...mapFile(row), roleIds: await listFileRoleIds(db, fileId), tags: [] },
  };
}

function coerceExpiresAt(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("expiresAt must be an ISO date string");
  return date.toISOString();
}
