import type { Env } from "../_lib/env";
import { mapTag, requireDb } from "../_lib/db";
import { canWriteFiles, permissionDeniedJson, resolveActorAccess } from "../_lib/permissions";
import { okJson, parseJsonBody, routeError } from "../_lib/http";
import { assertNonEmptyName, normalizeSlug } from "../../src/lib/chemvault-files/validation";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const db = requireDb(env.FILES_DB);
    const access = await resolveActorAccess(request, env, db);
    if (!canWriteFiles(access)) return permissionDeniedJson(access, "write");
    const body = (await parseJsonBody(request)) as Record<string, unknown>;
    const name = assertNonEmptyName(body.name, "Tag name");
    const slug = normalizeSlug(name);
    const color = typeof body.color === "string" && body.color.trim() ? body.color.trim() : null;
    const timestamp = new Date().toISOString();
    const tagId = `tag_${slug}`;

    await db
      .prepare("INSERT OR IGNORE INTO tags (id, name, slug, color, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(tagId, name, slug, color, timestamp)
      .run();
    const row = await db.prepare("SELECT * FROM tags WHERE slug = ?").bind(slug).first();

    return okJson({ tag: mapTag(row as Record<string, unknown>) }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
};
