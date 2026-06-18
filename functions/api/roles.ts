import type { Env } from "../_lib/env";
import { requireDb } from "../_lib/db";
import { listRolePolicies, resolveActorAccess } from "../_lib/permissions";
import { errorJson, okJson, parseJsonBody, routeError } from "../_lib/http";
import type { FilePermissionLevel } from "../../src/lib/chemvault-files/types";

const VALID_PERMISSIONS = new Set<FilePermissionLevel>(["none", "read", "write"]);

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const db = requireDb(env.FILES_DB);
    const roles = await listRolePolicies(db, env);
    const actorAccess = await resolveActorAccess(request, env, db);
    return okJson({ roles, actorAccess });
  } catch (error) {
    return routeError(error);
  }
};

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const db = requireDb(env.FILES_DB);
    const actorAccess = await resolveActorAccess(request, env, db);
    if (!actorAccess.canManageRoles) return errorJson("Only the owner can update file roles.", 403, "FILES_PERMISSION_DENIED");

    const body = (await parseJsonBody(request)) as Record<string, unknown>;
    const entries = Array.isArray(body.roles) ? body.roles : [];
    const now = new Date().toISOString();

    for (const entry of entries) {
      if (!entry || typeof entry !== "object") continue;
      const roleId = typeof (entry as Record<string, unknown>).id === "string" ? String((entry as Record<string, unknown>).id) : "";
      const permission = String((entry as Record<string, unknown>).permission || "") as FilePermissionLevel;
      if (!roleId || !VALID_PERMISSIONS.has(permission)) continue;
      if (roleId === "role_super") continue;
      await db.prepare("UPDATE file_roles SET permission = ?, updated_at = ? WHERE id = ?").bind(permission, now, roleId).run();
    }

    const roles = await listRolePolicies(db, env);
    return okJson({ roles, actorAccess: await resolveActorAccess(request, env, db) });
  } catch (error) {
    return routeError(error);
  }
};
