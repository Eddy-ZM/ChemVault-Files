import type { Env } from "../../../_lib/env";
import { mapActivity, requireDb } from "../../../_lib/db";
import { canReadFiles, permissionDeniedJson, resolveActorAccess } from "../../../_lib/permissions";
import { okJson, routeError } from "../../../_lib/http";

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    const db = requireDb(env.FILES_DB);
    const access = await resolveActorAccess(request, env, db);
    if (!canReadFiles(access)) return permissionDeniedJson(access, "read");
    const fileId = String(params.id || "");
    const rows = await db
      .prepare("SELECT * FROM file_activity WHERE file_id = ? ORDER BY created_at DESC LIMIT 50")
      .bind(fileId)
      .all();
    return okJson({
      activity: (rows.results as Record<string, unknown>[]).map(mapActivity),
    });
  } catch (error) {
    return routeError(error);
  }
};
