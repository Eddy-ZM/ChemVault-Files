import type { ActorAccess, FileRecord, FolderRecord } from "../../src/lib/chemvault-files/types";
import { resolvePreviewKind } from "../../src/lib/chemvault-files/preview";
import { listFileRoleIds, listLibrary, mapFile, mapFilesWithTags, requireDb } from "./db";
import { canViewFile } from "./permissions";

export type DriveView = "files" | "recent" | "starred" | "shared" | "trash";
export type DriveFileType = "image" | "document" | "spreadsheet" | "presentation" | "pdf" | "code" | "video" | "other";

export interface DriveListResult {
  view: DriveView;
  parentId: string | null;
  folders: FolderRecord[];
  files: FileRecord[];
}

export interface StorageUsage {
  usedBytes: number;
  quotaBytes: number;
  fileCount: number;
  byType: Array<{ type: DriveFileType; label: string; bytes: number; count: number }>;
}

const defaultQuotaBytes = 10 * 1024 * 1024 * 1024;

export async function listDriveItems(db: D1Database, access: ActorAccess, input: { parentId?: string | null; view?: string | null }): Promise<DriveListResult> {
  const view = normalizeDriveView(input.view);
  if (view === "trash") return listTrashItems(db, access);

  const library = await listLibrary(db, access);
  const parentId = input.parentId?.trim() || null;
  const activeFiles = library.files.filter((file) => file.status !== "deleted" && !file.deletedAt);
  const folders = view === "files" ? library.folders.filter((folder) => (folder.parentId ?? null) === parentId) : [];
  let files = activeFiles;

  if (view === "files") {
    files = activeFiles.filter((file) => (file.folderId ?? null) === parentId);
  } else if (view === "recent") {
    files = [...activeFiles].sort((left, right) => timestamp(right.lastOpenedAt || right.updatedAt) - timestamp(left.lastOpenedAt || left.updatedAt)).slice(0, 100);
  } else if (view === "starred") {
    files = activeFiles.filter((file) => file.isStarred);
  } else if (view === "shared") {
    files = activeFiles.filter((file) => file.visibility !== "private" || file.sharedStatus === "shared" || file.sharedStatus === "public");
  }

  return { view, parentId, folders, files };
}

export async function listTrashItems(db: D1Database, access: ActorAccess): Promise<DriveListResult> {
  const fileRows = await db.prepare("SELECT * FROM files WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC, updated_at DESC LIMIT 500").all();
  const files = (await mapFilesWithTags(db, fileRows.results as Record<string, unknown>[])).filter((file) => canViewFile(access, file));
  let folders: FolderRecord[] = [];
  try {
    const folderRows = await db.prepare("SELECT * FROM folders WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC, updated_at DESC LIMIT 500").all();
    folders = (folderRows.results as Record<string, unknown>[]).map((row) => ({
      id: String(row.id),
      projectId: String(row.project_id),
      parentId: row.parent_id === null ? null : String(row.parent_id),
      name: String(row.name),
      slug: String(row.slug),
      path: String(row.path),
      ownerUserId: row.owner_user_id === null || row.owner_user_id === undefined ? null : String(row.owner_user_id),
      isStarred: Number(row.is_starred ?? 0) === 1,
      isTrashed: true,
      trashedAt: row.trashed_at === null || row.trashed_at === undefined ? null : String(row.trashed_at),
      deletedAt: row.deleted_at === null || row.deleted_at === undefined ? null : String(row.deleted_at),
      metadata: null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    }));
  } catch (error) {
    if (!(error instanceof Error) || !error.message.toLowerCase().includes("no such column")) throw error;
  }
  return { view: "trash", parentId: null, folders, files };
}

export async function searchDriveFiles(db: D1Database, access: ActorAccess, query: string, type: string | null): Promise<FileRecord[]> {
  const q = query.trim();
  const like = `%${q.replace(/[%_]/g, "\\$&")}%`;
  const rows = q
    ? await db
        .prepare("SELECT * FROM files WHERE deleted_at IS NULL AND (display_name LIKE ? ESCAPE '\\' OR original_name LIKE ? ESCAPE '\\' OR mime_type LIKE ? ESCAPE '\\') ORDER BY updated_at DESC LIMIT 200")
        .bind(like, like, like)
        .all()
    : await db.prepare("SELECT * FROM files WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT 200").all();
  return (await mapFilesWithTags(db, rows.results as Record<string, unknown>[]))
    .filter((file) => canViewFile(access, file))
    .filter((file) => !type || fileTypeBucket(file) === type);
}

export async function loadVisibleFile(db: D1Database, fileId: string, access: ActorAccess, options: { includeTrash?: boolean } = {}): Promise<FileRecord | null> {
  const deletedClause = options.includeTrash ? "" : " AND deleted_at IS NULL";
  const row = await db.prepare(`SELECT * FROM files WHERE id = ?${deletedClause}`).bind(fileId).first();
  if (!row) return null;
  const file = { ...mapFile(row as Record<string, unknown>), roleIds: await listFileRoleIds(db, fileId), tags: [] };
  return canViewFile(access, file) ? file : null;
}

export async function storageUsage(db: D1Database, access: ActorAccess, quotaBytes: number): Promise<StorageUsage> {
  const library = await listLibrary(db, access);
  const buckets = new Map<DriveFileType, { bytes: number; count: number }>();
  for (const file of library.files.filter((entry) => entry.status !== "deleted" && !entry.deletedAt)) {
    const type = fileTypeBucket(file);
    const current = buckets.get(type) ?? { bytes: 0, count: 0 };
    current.bytes += file.sizeBytes;
    current.count += 1;
    buckets.set(type, current);
  }
  const byType = Array.from(buckets.entries())
    .map(([type, value]) => ({ type, label: fileTypeLabel(type), ...value }))
    .sort((left, right) => right.bytes - left.bytes);
  return {
    usedBytes: byType.reduce((sum, entry) => sum + entry.bytes, 0),
    quotaBytes,
    fileCount: byType.reduce((sum, entry) => sum + entry.count, 0),
    byType,
  };
}

export function readStorageQuotaBytes(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : defaultQuotaBytes;
}

export function normalizeDriveView(value: string | null | undefined): DriveView {
  if (value === "recent" || value === "starred" || value === "shared" || value === "trash") return value;
  return "files";
}

export function fileTypeBucket(file: Pick<FileRecord, "displayName" | "mimeType">): DriveFileType {
  const name = file.displayName.toLowerCase();
  const mime = (file.mimeType || "").toLowerCase();
  if (resolvePreviewKind(file) === "image") return "image";
  if (mime.includes("pdf") || name.endsWith(".pdf")) return "pdf";
  if (mime.includes("spreadsheet") || /\.(xlsx|xls|csv|tsv)$/.test(name)) return "spreadsheet";
  if (mime.includes("presentation") || /\.(ppt|pptx|key)$/.test(name)) return "presentation";
  if (mime.includes("word") || /\.(doc|docx|md|txt|rtf)$/.test(name)) return "document";
  if (mime.startsWith("video/") || /\.(mp4|mov|webm|m4v)$/.test(name)) return "video";
  if (/\.(js|ts|tsx|jsx|json|xml|py|r|sql|css|html|md)$/.test(name)) return "code";
  return "other";
}

export function fileTypeLabel(type: DriveFileType): string {
  if (type === "pdf") return "PDF";
  if (type === "image") return "Images";
  if (type === "document") return "Documents";
  if (type === "spreadsheet") return "Spreadsheets";
  if (type === "presentation") return "Presentations";
  if (type === "code") return "Code";
  if (type === "video") return "Video";
  return "Other";
}

export function dbFromEnv(env: { FILES_DB?: D1Database }): D1Database {
  return requireDb(env.FILES_DB);
}

function timestamp(value: string | null | undefined): number {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}
