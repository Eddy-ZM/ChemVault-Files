import { requireDb } from "../../../_lib/db";
import type { Env } from "../../../_lib/env";
import { errorJson, okJson, routeError } from "../../../_lib/http";
import { ensureDriveAppSchema } from "../../../_lib/schema";

function authorized(request: Request, env: Env) {
  const header = request.headers.get("authorization") || "";
  return Boolean(env.FILE_SCAN_CALLBACK_SECRET && header === `Bearer ${env.FILE_SCAN_CALLBACK_SECRET}`);
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (!authorized(request, env)) return errorJson("Unauthorized scanner.", 401, "UNAUTHORIZED");
    const db = requireDb(env.FILES_DB);
    await ensureDriveAppSchema(db);
    const url = new URL(request.url);
    const requestedLimit = Number.parseInt(url.searchParams.get("limit") || "10", 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(50, Math.max(1, requestedLimit)) : 10;
    const result = await db
      .prepare(
        `SELECT id, size_bytes, mime_type, updated_at
         FROM files
         WHERE status = 'ready'
           AND scan_status IN ('pending', 'error')
           AND deleted_at IS NULL
         ORDER BY updated_at ASC
         LIMIT ?`,
      )
      .bind(limit)
      .all<{ id: string; size_bytes: number; mime_type: string | null; updated_at: string }>();
    return okJson({ files: result.results || [] });
  } catch (error) {
    return routeError(error);
  }
};
