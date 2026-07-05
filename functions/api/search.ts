import { requireDb } from "../_lib/db";
import type { Env } from "../_lib/env";
import { searchDriveFiles } from "../_lib/drive-service";
import { okJson, routeError } from "../_lib/http";
import { canReadFiles, permissionDeniedJson, resolveActorAccess } from "../_lib/permissions";
import { ensureDriveAppSchema } from "../_lib/schema";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const db = requireDb(env.FILES_DB);
    await ensureDriveAppSchema(db);
    const access = await resolveActorAccess(request, env, db);
    if (!canReadFiles(access)) return permissionDeniedJson(access, "read");

    const url = new URL(request.url);
    const query = url.searchParams.get("q") ?? "";
    const type = url.searchParams.get("type");
    const files = await searchDriveFiles(db, access, query, type);

    return okJson({ query, type, files });
  } catch (error) {
    return routeError(error);
  }
};
