import type {
  FileActivityRecord,
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

export async function listLibrary(db: D1Database): Promise<LibraryResponse> {
  const [projects, folders, tags, files] = await Promise.all([
    db.prepare("SELECT * FROM projects ORDER BY sort_order, name").all(),
    db.prepare("SELECT * FROM folders ORDER BY path").all(),
    db.prepare("SELECT * FROM tags ORDER BY name").all(),
    db.prepare("SELECT * FROM files WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT 500").all(),
  ]);

  const fileRows = files.results as Record<string, unknown>[];

  return {
    projects: (projects.results as Record<string, unknown>[]).map(mapProject),
    folders: (folders.results as Record<string, unknown>[]).map(mapFolder),
    tags: (tags.results as Record<string, unknown>[]).map(mapTag),
    files: await mapFilesWithTags(db, fileRows),
  };
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

  return fileRows.map((row) => ({ ...mapFile(row), tags: tagsByFile.get(String(row.id)) ?? [] }));
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
    checksum: row.checksum === null ? null : String(row.checksum),
    uploadSessionId: row.upload_session_id === null ? null : String(row.upload_session_id),
    actorEmail: row.actor_email === null ? null : String(row.actor_email),
    downloadCount: Number(row.download_count),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    deletedAt: row.deleted_at === null ? null : String(row.deleted_at),
  };
}

export function mapShare(row: Record<string, unknown>): FileShareRecord {
  return {
    token: String(row.token),
    fileId: String(row.file_id),
    createdByEmail: row.created_by_email === null ? null : String(row.created_by_email),
    allowDownload: Number(row.allow_download) === 1,
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
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
