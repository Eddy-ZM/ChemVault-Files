import type { Env } from "../../../_lib/env";
import { requireDb } from "../../../_lib/db";
import { buildInlinePreviewHeaders } from "../../../_lib/file-service";
import { isShareTargetInactive, loadShareTarget, recordShareAccess } from "../../../_lib/share-service";
import { errorJson, routeError } from "../../../_lib/http";
import { isPreviewableFile } from "../../../../src/lib/chemvault-files/preview";

export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  try {
    if (!env.FILES_BUCKET) throw new Error("R2 binding FILES_BUCKET is not configured");
    const db = requireDb(env.FILES_DB);
    const token = String(params.token || "");
    const target = await loadShareTarget(db, token);
    if (!target) return errorJson("Share link was not found", 404, "SHARE_NOT_FOUND");
    if (isShareTargetInactive(target)) return errorJson("Share link expired or was revoked", 410, "SHARE_INACTIVE");
    if (!isPreviewableFile(target.file)) return errorJson("File type is not previewable", 415, "PREVIEW_UNSUPPORTED");

    const object = await env.FILES_BUCKET.get(target.file.r2Key);
    if (!object?.body) return errorJson("Stored object was not found", 404, "OBJECT_NOT_FOUND");

    await recordShareAccess(db, target, { mode: "preview" });
    return new Response(object.body, { headers: buildInlinePreviewHeaders(target.file) });
  } catch (error) {
    return routeError(error);
  }
};
