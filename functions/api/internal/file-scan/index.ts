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
    const requestedLimit = Number.parseInt(url.searchParams.get("limit") || "50", 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(1, requestedLimit)) : 50;
    const pendingWhere = `status = 'ready'
           AND scan_status IN ('pending', 'error')
           AND deleted_at IS NULL`;
    const [result, backlog] = await Promise.all([
      db
      .prepare(
        `SELECT id, size_bytes, mime_type, updated_at
         FROM files
         WHERE ${pendingWhere}
         ORDER BY updated_at ASC
         LIMIT ?`,
      )
      .bind(limit)
      .all<{ id: string; size_bytes: number; mime_type: string | null; updated_at: string }>(),
      db
        .prepare(
          `SELECT COUNT(*) AS total, MIN(updated_at) AS oldest_updated_at
           FROM files
           WHERE ${pendingWhere}`,
        )
        .first<{ total: number; oldest_updated_at: string | null }>(),
    ]);
    const oldestUpdatedAt = backlog?.oldest_updated_at || null;
    const oldestTimestamp = oldestUpdatedAt ? Date.parse(oldestUpdatedAt) : Number.NaN;
    const oldestAgeSeconds = Number.isFinite(oldestTimestamp)
      ? Math.max(0, Math.floor((Date.now() - oldestTimestamp) / 1000))
      : 0;
    return okJson({
      files: result.results || [],
      backlog: {
        total: Number(backlog?.total || 0),
        oldestUpdatedAt,
        oldestAgeSeconds,
        returned: result.results?.length || 0,
        limit,
      },
    });
  } catch (error) {
    return routeError(error);
  }
};
