import { canWriteFiles, permissionDeniedJson, resolveActorAccess } from "../../../_lib/permissions";
import { ensureDriveAppSchema } from "../../../_lib/schema";
import { parseJsonBody, routeError } from "../../../_lib/http";
import { loadVisibleFile } from "../../../_lib/drive-service";
import type { Env } from "../../../_lib/env";

type MoveBody = {
  folderId?: unknown;
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

    const body = (await parseJsonBody(request)) as MoveBody;
    const folderId = typeof body.folderId === "string" && body.folderId.trim() ? body.folderId.trim() : null;

    const file = await loadVisibleFile(db, fileId, access);
    if (!file) {
      return Response.json({ error: "File was not found" }, { status: 404 });
    }
    let projectId = file.projectId;

    if (folderId) {
      const folder = await db
        .prepare("SELECT id, project_id FROM folders WHERE id = ? AND (deleted_at IS NULL OR deleted_at = '')")
        .bind(folderId)
        .first<{ id: string; project_id: string }>();

      if (!folder) {
        return Response.json({ error: "Destination folder was not found" }, { status: 404 });
      }

      projectId = folder.project_id;
    }

    const updatedAt = new Date().toISOString();
    await db
      .prepare("UPDATE files SET folder_id = ?, parent_id = ?, project_id = ?, updated_at = ? WHERE id = ?")
      .bind(folderId, folderId, projectId, updatedAt, fileId)
      .run();

    return Response.json({ status: "moved", fileId, folderId, projectId, updatedAt });
  } catch (error) {
    return routeError(error);
  }
};
