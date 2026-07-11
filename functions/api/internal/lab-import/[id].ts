import { listFileRoleIds, mapFile, requireDb } from "../../../_lib/db";
import { normalizeEmailCandidate, type Env } from "../../../_lib/env";
import { buildDownloadHeaders } from "../../../_lib/file-service";
import { canReadFiles, canViewFile, listRolePolicies, resolveActorAccessFromRoles } from "../../../_lib/permissions";
import { routeError } from "../../../_lib/http";
import { ensureDriveAppSchema } from "../../../_lib/schema";

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    const providedSecret = request.headers.get("x-chemvault-lab-handoff-key");
    if (!env.LAB_HANDOFF_SECRET || providedSecret !== env.LAB_HANDOFF_SECRET) {
      return Response.json({ error: "Unauthorized Lab handoff." }, { status: 401 });
    }

    const actorEmail = normalizeEmailCandidate(request.headers.get("x-chemvault-user-email"));
    if (!actorEmail) {
      return Response.json({ error: "A verified user email is required." }, { status: 400 });
    }
    if (!env.FILES_BUCKET) throw new Error("R2 binding FILES_BUCKET is not configured");

    const db = requireDb(env.FILES_DB);
    await ensureDriveAppSchema(db);
    const roles = await listRolePolicies(db, env);
    const access = resolveActorAccessFromRoles(
      actorEmail,
      env.PRIVATE_OWNER_EMAIL,
      roles,
      env.FILES_ADMIN_EMAILS,
    );
    if (!canReadFiles(access)) {
      return Response.json({ error: "File read access is required." }, { status: 403 });
    }

    const fileId = String(params.id || "");
    const row = await db
      .prepare("SELECT * FROM files WHERE id = ? AND status = 'ready' AND COALESCE(scan_status, 'clean') = 'clean' AND deleted_at IS NULL")
      .bind(fileId)
      .first();
    if (!row) return Response.json({ error: "File was not found." }, { status: 404 });

    const file = {
      ...mapFile(row as Record<string, unknown>),
      roleIds: await listFileRoleIds(db, fileId),
    };
    if (!canViewFile(access, file)) {
      return Response.json({ error: "File access was denied." }, { status: 403 });
    }

    const object = await env.FILES_BUCKET.get(file.r2Key);
    if (!object?.body) return Response.json({ error: "Stored object was not found." }, { status: 404 });

    return new Response(object.body, {
      headers: {
        ...buildDownloadHeaders(file),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return routeError(error);
  }
};
