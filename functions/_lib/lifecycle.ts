import type { Env } from "./env";

interface OwnedFileRow extends Record<string, unknown> {
  id: string;
  r2_key: string;
}

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

export async function isValidLifecycleSecret(actual: string, expected: string): Promise<boolean> {
  if (!actual || !expected) return false;
  const [left, right] = await Promise.all([digest(actual), digest(expected)]);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    mismatch |= (left[index] || 0) ^ (right[index] || 0);
  }
  return mismatch === 0;
}

export async function authorizeLifecycleRequest(request: Request, env: Env): Promise<Response | null> {
  const expected = env.LIFECYCLE_SERVICE_SECRET?.trim() || "";
  if (!expected) return Response.json({ error: "Lifecycle service is not configured." }, { status: 503 });
  const authorization = request.headers.get("authorization") || "";
  const actual = authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
  if (!(await isValidLifecycleSecret(actual, expected))) {
    return Response.json({ error: "Invalid lifecycle service credential." }, { status: 401 });
  }
  return null;
}

export function normalizeLifecycleEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

async function listOwnedFiles(db: D1Database, email: string): Promise<OwnedFileRow[]> {
  const result = await db
    .prepare(
      `SELECT * FROM files
       WHERE LOWER(COALESCE(owner_user_id, '')) = ? OR LOWER(COALESCE(actor_email, '')) = ?
       ORDER BY created_at DESC`,
    )
    .bind(email, email)
    .all<OwnedFileRow>();
  return result.results;
}

async function listOwnedFolders(db: D1Database, email: string): Promise<Record<string, unknown>[]> {
  const result = await db
    .prepare(`SELECT * FROM folders WHERE LOWER(COALESCE(owner_user_id, '')) = ? ORDER BY created_at DESC`)
    .bind(email)
    .all<Record<string, unknown>>();
  return result.results;
}

function publicFileRecord(row: Record<string, unknown>): Record<string, unknown> {
  const { r2_key: _r2Key, ...record } = row;
  return record;
}

export async function exportFilesUserData(db: D1Database, email: string) {
  const [files, folders, shares, activity] = await Promise.all([
    listOwnedFiles(db, email),
    listOwnedFolders(db, email),
    db
      .prepare(
        `SELECT token, file_id, allow_download, expires_at, created_at, revoked_at, access_count, last_accessed_at, is_public
         FROM file_shares WHERE LOWER(COALESCE(created_by_email, '')) = ?`,
      )
      .bind(email)
      .all(),
    db
      .prepare(
        `SELECT id, file_id, event_type, metadata_json, created_at
         FROM file_activity WHERE LOWER(COALESCE(actor_email, '')) = ? ORDER BY created_at DESC`,
      )
      .bind(email)
      .all(),
  ]);

  return {
    files: files.map(publicFileRecord),
    folders,
    shares: shares.results,
    activity: activity.results,
    objectInventory: files.map((file) => ({ fileId: file.id, sizeBytes: file.size_bytes, mimeType: file.mime_type })),
    contentIncluded: false,
  };
}

async function deleteFileRows(db: D1Database, fileIds: string[]): Promise<void> {
  for (let offset = 0; offset < fileIds.length; offset += 90) {
    const ids = fileIds.slice(offset, offset + 90);
    const placeholders = ids.map(() => "?").join(",");
    for (const table of ["file_tags", "file_role_access", "file_shares", "file_activity", "upload_sessions"]) {
      await db.prepare(`DELETE FROM ${table} WHERE file_id IN (${placeholders})`).bind(...ids).run();
    }
    await db.prepare(`DELETE FROM files WHERE id IN (${placeholders})`).bind(...ids).run();
  }
}

export async function deleteFilesUserData(env: Env, db: D1Database, email: string) {
  const [files, folders] = await Promise.all([listOwnedFiles(db, email), listOwnedFolders(db, email)]);
  const fileIds = files.map((file) => file.id);
  const folderIds = folders.map((folder) => String(folder.id));

  if (env.FILES_BUCKET) {
    for (let offset = 0; offset < files.length; offset += 1000) {
      await env.FILES_BUCKET.delete(files.slice(offset, offset + 1000).map((file) => file.r2_key).filter(Boolean));
    }
  }

  await deleteFileRows(db, fileIds);
  await db.prepare(`DELETE FROM file_shares WHERE LOWER(COALESCE(created_by_email, '')) = ?`).bind(email).run();
  await db.prepare(`UPDATE file_activity SET actor_email = NULL WHERE LOWER(COALESCE(actor_email, '')) = ?`).bind(email).run();

  for (let offset = 0; offset < folderIds.length; offset += 90) {
    const ids = folderIds.slice(offset, offset + 90);
    const placeholders = ids.map(() => "?").join(",");
    await db.prepare(`UPDATE files SET folder_id = NULL WHERE folder_id IN (${placeholders})`).bind(...ids).run();
    await db.prepare(`UPDATE folders SET parent_id = NULL WHERE parent_id IN (${placeholders})`).bind(...ids).run();
    await db.prepare(`DELETE FROM folders WHERE id IN (${placeholders})`).bind(...ids).run();
  }

  return { filesDeleted: fileIds.length, foldersDeleted: folderIds.length, objectsDeleted: files.length };
}
