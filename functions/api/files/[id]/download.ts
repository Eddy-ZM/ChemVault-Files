import type { Env } from "../../../_lib/env";
import { mapFile, requireDb } from "../../../_lib/db";
import { buildDownloadHeaders } from "../../../_lib/file-service";
import { routeError } from "../../../_lib/http";

export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  try {
    if (!env.FILES_BUCKET) throw new Error("R2 binding FILES_BUCKET is not configured");
    const db = requireDb(env.FILES_DB);
    const fileId = String(params.id || "");
    const row = await db.prepare("SELECT * FROM files WHERE id = ? AND status = 'ready' AND deleted_at IS NULL").bind(fileId).first();
    if (!row) throw new Error("File was not found");
    const file = mapFile(row as Record<string, unknown>);
    const object = await env.FILES_BUCKET.get(file.r2Key);
    if (!object?.body) throw new Error("Stored object was not found");

    await db.prepare("UPDATE files SET download_count = download_count + 1 WHERE id = ?").bind(fileId).run();
    return new Response(object.body, { headers: buildDownloadHeaders(file) });
  } catch (error) {
    return routeError(error);
  }
};
