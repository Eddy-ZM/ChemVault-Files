import type { Env } from "../_lib/env";
import { listLibrary, requireDb } from "../_lib/db";
import { canReadFiles, permissionDeniedJson, resolveActorAccess } from "../_lib/permissions";
import { okJson, routeError } from "../_lib/http";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const db = requireDb(env.FILES_DB);
    const access = await resolveActorAccess(request, env, db);
    if (!canReadFiles(access)) return permissionDeniedJson(access, "read");
    return okJson(await listLibrary(db));
  } catch (error) {
    return routeError(error);
  }
};
