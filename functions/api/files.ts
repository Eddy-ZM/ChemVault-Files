import type { Env } from "../_lib/env";
import { listDriveItems } from "../_lib/drive-service";
import { requireDb } from "../_lib/db";
import { canReadFiles, permissionDeniedJson, resolveActorAccess } from "../_lib/permissions";
import { ensureDriveAppSchema } from "../_lib/schema";
import { okJson, routeError } from "../_lib/http";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const db = requireDb(env.FILES_DB);
    await ensureDriveAppSchema(db);
    const access = await resolveActorAccess(request, env, db);
    if (!canReadFiles(access)) return permissionDeniedJson(access, "read");
    const url = new URL(request.url);
    const parentId = url.searchParams.get("parentId");
    const view = url.searchParams.get("view");
    const result = await listDriveItems(db, access, { parentId, view });
    return okJson({
      ...result,
      items: [
        ...result.folders.map((folder) => ({ type: "folder", folder })),
        ...result.files.map((file) => ({ type: "file", file })),
      ],
    });
  } catch (error) {
    return routeError(error);
  }
};
