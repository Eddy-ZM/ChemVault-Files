import type {
  FileActivityRecord,
  ActorAccess,
  FileRecord,
  FileShareRecord,
  FolderRecord,
  LibraryResponse,
  ProjectRecord,
  TagRecord,
} from "../../src/lib/chemvault-files/types";

export function requireDb(db: D1Database | undefined): D1Database {
  if (!db) throw new Error("D1 binding FILES_DB is not configured");
  return db;
}

export async function listLibrary(db: D1Database, access?: ActorAccess): Promise<LibraryResponse> {
  const [projects, folders, tags, files] = await Promise.all([
    db.prepare("SELECT * FROM projects ORDER BY sort_order, name").all(),
    listActiveFolderRows(db),
    db.prepare("SELECT * FROM tags ORDER BY name").all(),
    db.prepare("SELECT * FROM files WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT 500").all(),
  ]);

  const fileRows = files.results as Record<string, unknown>[];
  const mappedFiles = await mapFilesWithTags(db, fileRows);

  return {
    projects: (projects.results as Record<string, unknown>[]).map(mapProject),
    folders: (folders.results as Record<string, unknown>[]).map(mapFolder),
    tags: (tags.results as Record<string, unknown>[]).map(mapTag),
    files: access ? mappedFiles.filter((file) => isFileVisibleToAccess(file, access)) : mappedFiles,
  };
}

async function listActiveFolderRows(db: D1Database): Promise<{ results: unknown[] }> {
  try {
    return await db.prepare("SELECT * FROM folders WHERE deleted_at IS NULL ORDER BY path").all();
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("no such column: deleted_at")) {
      return await db.prepare("SELECT * FROM folders ORDER BY path").all();
    }
    throw error;
  }
}

export async function mapFilesWithTags(db: D1Database, fileRows: Record<string, unknown>[]): Promise<FileRecord[]> {
  if (fileRows.length === 0) return [];

  const ids = fileRows.map((row) => String(row.id));
  const placeholders = ids.map(() => "?").join(",");
  const tagResult = await db
    .prepare(`SELECT ft.file_id, t.* FROM file_tags ft JOIN tags t ON t.id = ft.tag_id WHERE ft.file_id IN (${placeholders})`)
    .bind(...ids)
    .all();
  const tagsByFile = new Map<string, TagRecord[]>();

  for (const row of tagResult.results as Record<string, unknown>[]) {
    const fileId = String(row.file_id);
    const current = tagsByFile.get(fileId) ?? [];
    current.push(mapTag(row));
    tagsByFile.set(fileId, current);
  }

  const roleIdsByFile = await listFileRoleAccess(db, ids);

  return fileRows.map((row) => {
    const fileId = String(row.id);
    return { ...mapFile(row), roleIds: roleIdsByFile.get(fileId) ?? [], tags: tagsByFile.get(fileId) ?? [] };
  });
}

export async function listFileRoleAccess(db: D1Database, fileIds: string[]): Promise<Map<string, string[]>> {
  const roleIdsByFile = new Map<string, string[]>();
  if (fileIds.length === 0) return roleIdsByFile;

  const placeholders = fileIds.map(() => "?").join(",");
  try {
    const result = await db
      .prepare(`SELECT file_id, role_id FROM file_role_access WHERE file_id IN (${placeholders}) ORDER BY role_id`)
      .bind(...fileIds)
      .all();

    for (const row of result.results as Record<string, unknown>[]) {
      const fileId = String(row.file_id);
      const current = roleIdsByFile.get(fileId) ?? [];
      current.push(String(row.role_id));
      roleIdsByFile.set(fileId, current);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("no such table: file_role_access")) return roleIdsByFile;
    throw error;
  }

  return roleIdsByFile;
}

export async function listFileRoleIds(db: D1Database, fileId: string): Promise<string[]> {
  return (await listFileRoleAccess(db, [fileId])).get(fileId) ?? [];
}

export function mapProject(row: Record<string, unknown>): ProjectRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    description: row.description === null ? null : String(row.description),
    sortOrder: Number(row.sort_order),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapFolder(row: Record<string, unknown>): FolderRecord {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    parentId: row.parent_id === null ? null : String(row.parent_id),
    name: String(row.name),
    slug: String(row.slug),
    path: String(row.path),
    ownerUserId: row.owner_user_id === undefined || row.owner_user_id === null ? null : String(row.owner_user_id),
    isStarred: Number(row.is_starred ?? 0) === 1,
    isTrashed: Number(row.is_trashed ?? 0) === 1 || row.deleted_at !== undefined && row.deleted_at !== null,
    trashedAt: row.trashed_at === undefined || row.trashed_at === null ? null : String(row.trashed_at),
    deletedAt: row.deleted_at === undefined || row.deleted_at === null ? null : String(row.deleted_at),
    metadata: parseJsonObject(row.metadata_json),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapTag(row: Record<string, unknown>): TagRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    color: row.color === null ? null : String(row.color),
    createdAt: String(row.created_at),
  };
}

export function mapFile(row: Record<string, unknown>): Omit<FileRecord, "tags"> {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    folderId: row.folder_id === null ? null : String(row.folder_id),
    displayName: String(row.display_name),
    originalName: String(row.original_name),
    r2Key: String(row.r2_key),
    mimeType: row.mime_type === null ? null : String(row.mime_type),
    sizeBytes: Number(row.size_bytes),
    status: String(row.status) as FileRecord["status"],
    scanStatus: (row.scan_status === "pending" || row.scan_status === "rejected" || row.scan_status === "error" ? row.scan_status : "clean") as FileRecord["scanStatus"],
    scanDetail: row.scan_detail === undefined || row.scan_detail === null ? null : String(row.scan_detail),
    scannedAt: row.scanned_at === undefined || row.scanned_at === null ? null : String(row.scanned_at),
    checksum: row.checksum === null ? null : String(row.checksum),
    uploadSessionId: row.upload_session_id === null ? null : String(row.upload_session_id),
    actorEmail: row.actor_email === null ? null : String(row.actor_email),
    downloadCount: Number(row.download_count),
    visibility: row.visibility === "public" ? "public" : row.visibility === "roles" ? "roles" : "private",
    roleIds: [],
    ownerUserId: row.owner_user_id === undefined || row.owner_user_id === null ? null : String(row.owner_user_id),
    parentId: row.parent_id === undefined || row.parent_id === null ? (row.folder_id === null ? null : String(row.folder_id)) : String(row.parent_id),
    isStarred: Number(row.is_starred ?? 0) === 1,
    trashedAt: row.trashed_at === undefined || row.trashed_at === null ? (row.deleted_at === null ? null : String(row.deleted_at)) : String(row.trashed_at),
    lastOpenedAt: row.last_opened_at === undefined || row.last_opened_at === null ? null : String(row.last_opened_at),
    sharedStatus:
      row.shared_status === "public" || row.shared_status === "shared" || row.shared_status === "private"
        ? row.shared_status
        : row.visibility === "public"
          ? "public"
          : "private",
    metadata: parseJsonObject(row.metadata_json),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    deletedAt: row.deleted_at === null ? null : String(row.deleted_at),
  };
}

function isSameActorEmail(left: string | null | undefined, right: string | null | undefined): boolean {
  return Boolean(left && right && left.trim().toLowerCase() === right.trim().toLowerCase());
}

function isFileVisibleToAccess(file: Pick<FileRecord, "visibility" | "roleIds" | "actorEmail">, access: ActorAccess): boolean {
  if (access.canManageRoles) return true;
  if (access.permission === "none") return false;
  if (isSameActorEmail(file.actorEmail, access.actorEmail)) return true;
  if (file.visibility === "public") return true;
  if (file.visibility === "private") return false;
  return file.roleIds.includes(access.roleId);
}

export function mapShare(row: Record<string, unknown>): FileShareRecord {
  return {
    token: String(row.token),
    fileId: String(row.file_id),
    createdByEmail: row.created_by_email === null ? null : String(row.created_by_email),
    allowDownload: Number(row.allow_download) === 1,
    isPublic: Number(row.is_public ?? 0) === 1,
    expiresAt: String(row.expires_at),
    createdAt: String(row.created_at),
    revokedAt: row.revoked_at === null ? null : String(row.revoked_at),
    accessCount: Number(row.access_count),
    lastAccessedAt: row.last_accessed_at === null ? null : String(row.last_accessed_at),
  };
}

export function mapActivity(row: Record<string, unknown>): FileActivityRecord {
  return {
    id: String(row.id),
    fileId: String(row.file_id),
    actorEmail: row.actor_email === null ? null : String(row.actor_email),
    eventType: String(row.event_type) as FileActivityRecord["eventType"],
    metadata: parseActivityMetadata(row.metadata_json),
    createdAt: String(row.created_at),
  };
}

function parseActivityMetadata(value: unknown): Record<string, unknown> | null {
  return parseJsonObject(value);
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
