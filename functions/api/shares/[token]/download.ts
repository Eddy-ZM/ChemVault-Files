import type { Env } from "../../../_lib/env";
import { requireDb } from "../../../_lib/db";
import { buildDownloadHeaders } from "../../../_lib/file-service";
import { isShareTargetInactive, loadShareTarget, recordShareAccess } from "../../../_lib/share-service";
import { errorJson, routeError } from "../../../_lib/http";

export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  try {
    if (!env.FILES_BUCKET) throw new Error("R2 binding FILES_BUCKET is not configured");
    const db = requireDb(env.FILES_DB);
    const token = String(params.token || "");
    const target = await loadShareTarget(db, token);
    if (!target) return errorJson("Share link was not found", 404, "SHARE_NOT_FOUND");
    if (isShareTargetInactive(target)) return errorJson("Share link expired or was revoked", 410, "SHARE_INACTIVE");
    if (!target.share.allowDownload) return errorJson("This share link does not allow downloads", 403, "SHARE_DOWNLOAD_DISABLED");

    const object = await env.FILES_BUCKET.get(target.file.r2Key);
    if (!object?.body) return errorJson("Stored object was not found", 404, "OBJECT_NOT_FOUND");

    await recordShareAccess(db, target, { mode: "download" });
    return new Response(object.body, { headers: buildDownloadHeaders(target.file) });
  } catch (error) {
    return routeError(error);
  }
};
