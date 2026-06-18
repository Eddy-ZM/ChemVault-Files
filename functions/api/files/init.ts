import type { Env } from "../../_lib/env";
import { getActorEmail } from "../../_lib/env";
import { requireDb } from "../../_lib/db";
import { createFileInitDraft } from "../../_lib/file-service";
import { canWriteFiles, listRolePolicies, permissionDeniedJson, resolveActorAccess } from "../../_lib/permissions";
import { okJson, parseJsonBody, routeError } from "../../_lib/http";
import { normalizeRoleIds, normalizeSlug, normalizeTags } from "../../../src/lib/chemvault-files/validation";
import type { ActorAccess, FileRolePolicy } from "../../../src/lib/chemvault-files/types";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const db = requireDb(env.FILES_DB);
    const access = await resolveActorAccess(request, env, db);
    if (!canWriteFiles(access)) return permissionDeniedJson(access, "write");
    const body = await parseJsonBody(request);
    const input = body as Record<string, unknown>;
    const projectId = typeof input.projectId === "string" ? input.projectId : "";
    const project = await db.prepare("SELECT slug FROM projects WHERE id = ?").bind(projectId).first<{ slug: string }>();
    if (!project) throw new Error("Project was not found");

    const roles = await listRolePolicies(db, env);
    const draft = createFileInitDraft({
      payload: restrictUploadAccessPayload(body, access, roles),
      projectSlug: project.slug,
      actorEmail: getActorEmail(request, env),
    });

    await db
      .prepare(
        "INSERT INTO files (id, project_id, folder_id, display_name, original_name, r2_key, mime_type, size_bytes, status, checksum, upload_session_id, actor_email, download_count, visibility, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(
        draft.file.id,
        draft.file.projectId,
        draft.file.folderId,
        draft.file.displayName,
        draft.file.originalName,
        draft.file.r2Key,
        draft.file.mimeType,
        draft.file.sizeBytes,
        draft.file.status,
        draft.file.checksum,
        draft.file.uploadSessionId,
        draft.file.actorEmail,
        draft.file.downloadCount,
        draft.file.visibility,
        draft.file.createdAt,
        draft.file.updatedAt,
        draft.file.deletedAt
      )
      .run();

    for (const roleId of draft.file.roleIds) {
      await db.prepare("INSERT OR IGNORE INTO file_role_access (file_id, role_id) VALUES (?, ?)").bind(draft.file.id, roleId).run();
    }

    await db
      .prepare(
        "INSERT INTO upload_sessions (id, file_id, r2_key, mode, status, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(
        draft.session.id,
        draft.session.fileId,
        draft.session.r2Key,
        draft.session.mode,
        draft.session.status,
        draft.session.expiresAt,
        draft.session.createdAt,
        draft.session.updatedAt
      )
      .run();

    for (const tagName of normalizeTags(input.tags)) {
      const slug = normalizeSlug(tagName);
      const tagId = `tag_${slug}`;
      await db
        .prepare("INSERT OR IGNORE INTO tags (id, name, slug, color, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(tagId, tagName, slug, null, draft.file.createdAt)
        .run();
      await db.prepare("INSERT OR IGNORE INTO file_tags (file_id, tag_id) VALUES (?, ?)").bind(draft.file.id, tagId).run();
    }

    return okJson(
      {
        file: draft.file,
        session: draft.session,
        upload: {
          mode: "direct",
          method: "PUT",
          url: `/api/files/upload?fileId=${draft.file.id}&sessionId=${draft.session.id}`,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return routeError(error);
  }
};

function restrictUploadAccessPayload(payload: unknown, access: ActorAccess, roles: FileRolePolicy[]): unknown {
  const input = payload as Record<string, unknown>;
  if (input.visibility !== "roles") return payload;

  const validRoleIds = new Set(roles.filter((role) => role.scope !== "owner").map((role) => role.id));
  const requestedRoleIds = normalizeRoleIds(input.roleIds).filter((roleId) => validRoleIds.has(roleId));
  const roleIds = access.canManageRoles
    ? requestedRoleIds
    : validRoleIds.has(access.roleId)
      ? [access.roleId]
      : [];

  return {
    ...input,
    roleIds,
  };
}
