import { loadVisibleFile } from "../../../_lib/drive-service";
import { parseJsonBody, routeError } from "../../../_lib/http";
import { canWriteFiles, permissionDeniedJson, resolveActorAccess } from "../../../_lib/permissions";
import { ensureDriveAppSchema } from "../../../_lib/schema";
import type { Env } from "../../../_lib/env";

type StarBody = {
  isStarred?: unknown;
  starred?: unknown;
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request, params }) => {
  try {
    const db = env.FILES_DB;
    if (!db) {
      return Response.json({ error: "Files database is not configured" }, { status: 500 });
    }

    await ensureDriveAppSchema(db);

    const access = await resolveActorAccess(request, env, db);
    if (!canWriteFiles(access)) return permissionDeniedJson(access, "write");

    const fileId = String(params.id ?? "");
    if (!fileId) {
      return Response.json({ error: "Missing file id" }, { status: 400 });
    }

    const body = (await parseJsonBody(request)) as StarBody;
    const value = typeof body.isStarred === "boolean" ? body.isStarred : typeof body.starred === "boolean" ? body.starred : true;

    const file = await loadVisibleFile(db, fileId, access);
    if (!file) {
      return Response.json({ error: "File was not found" }, { status: 404 });
    }

    const updatedAt = new Date().toISOString();
    await db
      .prepare("UPDATE files SET is_starred = ?, updated_at = ? WHERE id = ?")
      .bind(value ? 1 : 0, updatedAt, fileId)
      .run();

    return Response.json({ status: value ? "starred" : "unstarred", fileId, isStarred: value, updatedAt });
  } catch (error) {
    return routeError(error);
  }
};
