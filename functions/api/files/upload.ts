import type { Env } from "../../_lib/env";
import { requireDb } from "../../_lib/db";
import { okJson, routeError } from "../../_lib/http";

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (!env.FILES_BUCKET) throw new Error("R2 binding FILES_BUCKET is not configured");
    const db = requireDb(env.FILES_DB);
    const url = new URL(request.url);
    const fileId = url.searchParams.get("fileId") || "";
    const sessionId = url.searchParams.get("sessionId") || "";
    if (!fileId || !sessionId) throw new Error("fileId and sessionId are required");
    if (!request.body) throw new Error("Upload body is required");

    const row = await db
      .prepare("SELECT r2_key, size_bytes FROM files WHERE id = ? AND upload_session_id = ? AND deleted_at IS NULL")
      .bind(fileId, sessionId)
      .first<{ r2_key: string; size_bytes: number }>();
    if (!row) throw new Error("Upload session was not found");

    await env.FILES_BUCKET.put(row.r2_key, request.body, {
      httpMetadata: {
        contentType: request.headers.get("content-type") || "application/octet-stream",
      },
    });

    const now = new Date().toISOString();
    await db.prepare("UPDATE upload_sessions SET status = 'uploading', updated_at = ? WHERE id = ?").bind(now, sessionId).run();
    await db.prepare("UPDATE files SET status = 'uploading', updated_at = ? WHERE id = ?").bind(now, fileId).run();

    return okJson({ status: "uploaded", fileId, sessionId });
  } catch (error) {
    return routeError(error);
  }
};
