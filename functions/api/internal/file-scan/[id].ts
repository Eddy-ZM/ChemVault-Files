import { requireDb } from "../../../_lib/db";
import type { Env } from "../../../_lib/env";
import { errorJson, okJson, parseJsonBody, routeError } from "../../../_lib/http";
import { ensureDriveAppSchema } from "../../../_lib/schema";

function authorized(request: Request, env: Env) {
  const header = request.headers.get("authorization") || "";
  return Boolean(env.FILE_SCAN_CALLBACK_SECRET && header === `Bearer ${env.FILE_SCAN_CALLBACK_SECRET}`);
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    if (!authorized(request, env)) return errorJson("Unauthorized scanner.", 401, "UNAUTHORIZED");
    if (!env.FILES_BUCKET) return errorJson("Files bucket is not configured.", 503, "STORAGE_UNAVAILABLE");
    const db = requireDb(env.FILES_DB);
    await ensureDriveAppSchema(db);
    const row = await db
      .prepare("SELECT r2_key, mime_type FROM files WHERE id = ? AND status = 'ready' AND scan_status IN ('pending', 'error') AND deleted_at IS NULL")
      .bind(String(params.id || ""))
      .first<{ r2_key: string; mime_type: string | null }>();
    if (!row) return errorJson("Quarantined file was not found.", 404, "FILE_NOT_FOUND");
    const object = await env.FILES_BUCKET.get(row.r2_key);
    if (!object?.body) return errorJson("Stored object was not found.", 404, "OBJECT_NOT_FOUND");
    return new Response(object.body, {
      headers: {
        "content-type": row.mime_type || "application/octet-stream",
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return routeError(error);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    if (!authorized(request, env)) return errorJson("Unauthorized scanner.", 401, "UNAUTHORIZED");
    const body = (await parseJsonBody(request)) as Record<string, unknown>;
    const scanStatus = body.status;
    if (scanStatus !== "clean" && scanStatus !== "rejected" && scanStatus !== "error") {
      return errorJson("status must be clean, rejected, or error.", 400, "VALIDATION_ERROR");
    }
    const detail = typeof body.detail === "string" ? body.detail.trim().slice(0, 500) : null;
    const db = requireDb(env.FILES_DB);
    await ensureDriveAppSchema(db);
    const now = new Date().toISOString();
    const result = await db
      .prepare("UPDATE files SET scan_status = ?, scan_detail = ?, scanned_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL")
      .bind(scanStatus, detail, now, now, String(params.id || ""))
      .run();
    if (!Number(result.meta.changes || 0)) return errorJson("File was not found.", 404, "FILE_NOT_FOUND");
    return okJson({ fileId: String(params.id || ""), scanStatus, scannedAt: now });
  } catch (error) {
    return routeError(error);
  }
};
