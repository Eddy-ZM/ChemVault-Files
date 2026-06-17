import type { Env } from "../../_lib/env";
import { requireDb } from "../../_lib/db";
import { buildPublicShareResponse, isShareTargetInactive, loadShareTarget, recordShareAccess } from "../../_lib/share-service";
import { errorJson, okJson, routeError } from "../../_lib/http";

export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  try {
    const db = requireDb(env.FILES_DB);
    const token = String(params.token || "");
    const target = await loadShareTarget(db, token);
    if (!target) return errorJson("Share link was not found", 404, "SHARE_NOT_FOUND");
    if (isShareTargetInactive(target)) return errorJson("Share link expired or was revoked", 410, "SHARE_INACTIVE");

    await recordShareAccess(db, target, { mode: "metadata" });
    return okJson(buildPublicShareResponse(target));
  } catch (error) {
    return routeError(error);
  }
};
