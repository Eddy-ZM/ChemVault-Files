import type { Env } from "../_lib/env";
import { mapFolder, requireDb } from "../_lib/db";
import { canWriteFiles, permissionDeniedJson, resolveActorAccess } from "../_lib/permissions";
import { okJson, parseJsonBody, routeError } from "../_lib/http";
import { assertNonEmptyName, normalizeSlug } from "../../src/lib/chemvault-files/validation";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const db = requireDb(env.FILES_DB);
    const access = await resolveActorAccess(request, env, db);
    if (!canWriteFiles(access)) return permissionDeniedJson(access, "write");
    const body = (await parseJsonBody(request)) as Record<string, unknown>;
    const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
    const parentId = typeof body.parentId === "string" && body.parentId.trim() ? body.parentId.trim() : null;
    const name = assertNonEmptyName(body.name, "Folder name");
    if (!projectId) throw new Error("Project is required");

    const parent = parentId
      ? await db.prepare("SELECT path FROM folders WHERE id = ?").bind(parentId).first<{ path: string }>()
      : null;
    const timestamp = new Date().toISOString();
    const slug = normalizeSlug(name);
    const folderId = `folder_${crypto.randomUUID()}`;
    const path = `${parent?.path || ""}/${name}`.replace(/\/+/g, "/");

    await db
      .prepare("INSERT INTO folders (id, project_id, parent_id, name, slug, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(folderId, projectId, parentId, name, slug, path, timestamp, timestamp)
      .run();

    const row = await db.prepare("SELECT * FROM folders WHERE id = ?").bind(folderId).first();
    return okJson({ folder: mapFolder(row as Record<string, unknown>) }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
};
