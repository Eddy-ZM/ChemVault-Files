import type { Env } from "../../_lib/env";
import { requireDb } from "../../_lib/db";
import { canWriteFiles, permissionDeniedJson, resolveActorAccess } from "../../_lib/permissions";
import { okJson, parseJsonBody, routeError } from "../../_lib/http";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (!env.FILES_BUCKET) throw new Error("R2 binding FILES_BUCKET is not configured");
    const db = requireDb(env.FILES_DB);
    const access = await resolveActorAccess(request, env, db);
    if (!canWriteFiles(access)) return permissionDeniedJson(access, "write");
    const body = (await parseJsonBody(request)) as Record<string, unknown>;
    const fileId = typeof body.fileId === "string" ? body.fileId : "";
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
    if (!fileId || !sessionId) throw new Error("fileId and sessionId are required");

    const session = await db
      .prepare("SELECT r2_key FROM upload_sessions WHERE id = ? AND file_id = ?")
      .bind(sessionId, fileId)
      .first<{ r2_key: string }>();
    if (!session) throw new Error("Upload session was not found");

    const object = await env.FILES_BUCKET.head(session.r2_key);
    if (!object) throw new Error("Uploaded object was not found");

    const now = new Date().toISOString();
    await db.prepare("UPDATE upload_sessions SET status = 'complete', updated_at = ? WHERE id = ?").bind(now, sessionId).run();
    await db.prepare("UPDATE files SET status = 'ready', scan_status = 'pending', scan_detail = NULL, scanned_at = NULL, updated_at = ? WHERE id = ?").bind(now, fileId).run();

    return okJson({ status: "quarantined", scanStatus: "pending", fileId });
  } catch (error) {
    return routeError(error);
  }
};
