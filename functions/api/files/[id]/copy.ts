import { listFileRoleIds, mapFile } from "../../../_lib/db";
import { loadVisibleFile } from "../../../_lib/drive-service";
import { parseJsonBody, routeError } from "../../../_lib/http";
import { canWriteFiles, permissionDeniedJson, resolveActorAccess } from "../../../_lib/permissions";
import { ensureDriveAppSchema } from "../../../_lib/schema";
import { buildR2Key } from "../../../../src/lib/chemvault-files/r2-key";
import { sanitizeVisibleName } from "../../../../src/lib/chemvault-files/validation";
import type { Env } from "../../../_lib/env";

type CopyBody = {
  folderId?: unknown;
  name?: unknown;
};

function copyName(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) {
    return `${name} copy`;
  }
  return `${name.slice(0, dot)} copy${name.slice(dot)}`;
}

export const onRequestPost: PagesFunction<Env> = async ({ env, request, params }) => {
  try {
    const db = env.FILES_DB;
    if (!db) {
      return Response.json({ error: "Files database is not configured" }, { status: 500 });
    }

    const bucket = env.FILES_BUCKET;
    if (!bucket) {
      return Response.json({ error: "Files bucket is not configured" }, { status: 500 });
    }

    await ensureDriveAppSchema(db);

    const access = await resolveActorAccess(request, env, db);
    if (!canWriteFiles(access)) return permissionDeniedJson(access, "write");

    const fileId = String(params.id ?? "");
    if (!fileId) {
      return Response.json({ error: "Missing file id" }, { status: 400 });
    }

    const body = (await parseJsonBody(request)) as CopyBody;
    const requestedName = typeof body.name === "string" ? body.name.trim() : "";
    const folderId = typeof body.folderId === "string" && body.folderId.trim() ? body.folderId.trim() : null;

    const file = await loadVisibleFile(db, fileId, access);
    if (!file) {
      return Response.json({ error: "File was not found" }, { status: 404 });
    }
    if (file.scanStatus !== "clean") {
      return Response.json({ error: "File is quarantined until its safety scan completes." }, { status: 423 });
    }
    const object = await bucket.get(file.r2Key);
    if (!object) {
      return Response.json({ error: "Source object was not found" }, { status: 404 });
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

    const project = await db
      .prepare("SELECT slug FROM projects WHERE id = ?")
      .bind(projectId)
      .first<{ slug: string }>();

    if (!project) {
      return Response.json({ error: "Project was not found" }, { status: 404 });
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const name = sanitizeVisibleName(requestedName || copyName(file.displayName));
    const r2Key = buildR2Key({
      projectSlug: project.slug,
      fileId: id,
      originalName: name,
      now: new Date(now),
    });

    await bucket.put(r2Key, object.body, {
      httpMetadata: object.httpMetadata,
      customMetadata: object.customMetadata
    });

    await db
      .prepare(
        `INSERT INTO files (
          id, project_id, folder_id, name, mime_type, size_bytes, checksum,
          r2_key, visibility, status, description, created_by, created_at,
          updated_at, owner_user_id, parent_id, is_starred, shared_status,
          metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?, ?, ?, ?, ?, ?, 0, 'private', ?)`
      )
      .bind(
        id,
        projectId,
        folderId,
        name,
        file.mimeType,
        file.sizeBytes,
        file.checksum ?? null,
        r2Key,
        "private",
        null,
        access.actorEmail ?? file.actorEmail ?? "unknown",
        now,
        now,
        access.actorEmail ?? file.ownerUserId ?? null,
        folderId,
        file.metadata ? JSON.stringify(file.metadata) : null
      )
      .run();

    const roleIds = await listFileRoleIds(db, file.id);
    if (roleIds.length) {
      const statement = db.prepare("INSERT OR IGNORE INTO file_roles (file_id, role_id) VALUES (?, ?)");
      await db.batch(roleIds.map((roleId) => statement.bind(id, roleId)));
    }

    const tags = await db.prepare("SELECT tag_id FROM file_tags WHERE file_id = ?").bind(file.id).all<{ tag_id: string }>();
    if (tags.results.length) {
      const statement = db.prepare("INSERT OR IGNORE INTO file_tags (file_id, tag_id) VALUES (?, ?)");
      await db.batch(tags.results.map((tag) => statement.bind(id, tag.tag_id)));
    }

    const copiedRow = await db.prepare("SELECT * FROM files WHERE id = ?").bind(id).first<Record<string, unknown>>();
    if (!copiedRow) {
      return Response.json({ error: "Copied file was not found" }, { status: 500 });
    }

    const copied = { ...mapFile(copiedRow), roleIds, tags: file.tags ?? [] };
    return Response.json({ status: "copied", file: copied });
  } catch (error) {
    return routeError(error);
  }
};
