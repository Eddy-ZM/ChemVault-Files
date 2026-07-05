import type { FileRecord, FolderRecord, LibraryResponse, TagRecord } from "./types";
import { resolvePreviewKind } from "./preview";

export interface FileFilters {
  search: string;
  projectId: string | null;
  folderId: string | null;
  tagSlug: string | null;
  quickFilter?: FileQuickFilter | null;
}

export type UploadQueueStatus = "pending" | "queued" | "uploading" | "complete" | "failed";
export type FileQuickFilter = "ready" | "failed" | "large" | "shared";
export type FileSortKey = "name" | "type" | "size" | "modified";
export type SortDirection = "asc" | "desc";

export interface FileSort {
  key: FileSortKey;
  direction: SortDirection;
}

export interface FileSummary {
  totalBytes: number;
  readyCount: number;
  failedCount: number;
  uploadingCount: number;
  largeFileCount: number;
  largestFile: FileRecord | null;
  latestFile: FileRecord | null;
}

export interface UploadQueueItem {
  id: string;
  name: string;
  sizeBytes: number;
  loadedBytes: number;
  progress: number;
  status: UploadQueueStatus;
  message: string | null;
}

export interface UploadPathInput {
  name: string;
  relativePath?: string;
  webkitRelativePath?: string;
}

export interface UploadPathInfo {
  name: string;
  folderParts: string[];
  relativePath: string;
}

export interface FolderTreeNode {
  folder: FolderRecord;
  children: FolderTreeNode[];
  depth: number;
  fileCount: number;
  totalFileCount: number;
}

export interface FileBrowserProjectItem {
  kind: "project";
  id: string;
  name: string;
  fileCount: number;
  totalBytes: number;
}

export interface FileBrowserFolderItem {
  kind: "folder";
  id: string;
  projectId: string;
  parentId: string | null;
  name: string;
  path: string;
  fileCount: number;
  totalBytes: number;
}

export interface FileBrowserFileItem {
  kind: "file";
  id: string;
  name: string;
  file: FileRecord;
}

export type FileBrowserItem = FileBrowserProjectItem | FileBrowserFolderItem | FileBrowserFileItem;

export interface FolderDeletionScope {
  folderIds: string[];
  fileIds: string[];
}

export type UploadQueueAction =
  | { type: "add"; id: string; name: string; sizeBytes: number }
  | { type: "stage"; items: Array<{ id: string; name: string; sizeBytes: number }> }
  | { type: "start"; id: string; message?: string }
  | { type: "progress"; id: string; loadedBytes: number }
  | { type: "complete"; id: string; message?: string }
  | { type: "fail"; id: string; message: string }
  | { type: "clear" }
  | { type: "clear-complete" };

interface LibraryDisplayInput {
  remoteLibrary: LibraryResponse;
  seedLibrary: LibraryResponse;
  environment: string;
  hostname?: string;
}

interface LibraryDisplayState {
  library: LibraryResponse;
  previewMode: boolean;
}

export function createInitialLibrary(seedLibrary: LibraryResponse): LibraryResponse {
  return {
    projects: seedLibrary.projects,
    folders: seedLibrary.folders,
    tags: [],
    files: [],
  };
}

export function resolveLibraryDisplay({ remoteLibrary, seedLibrary, environment, hostname }: LibraryDisplayInput): LibraryDisplayState {
  const previewMode = environment === "local" && isLocalPreviewHost(hostname) && remoteLibrary.files.length === 0;
  if (!previewMode) {
    return { library: remoteLibrary, previewMode: false };
  }

  return {
    previewMode: true,
    library: {
      ...remoteLibrary,
      tags: mergeTags(remoteLibrary.tags, seedLibrary.tags),
      files: seedLibrary.files,
    },
  };
}

function isLocalPreviewHost(hostname: string | undefined): boolean {
  if (hostname === undefined) return true;
  return hostname === "" || hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  if (unitIndex === 0) {
    return `${Math.round(value)} ${units[unitIndex]}`;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

export function normalizeActorEmail(value: unknown, fallback = "owner@chemvault.science"): string {
  if (typeof value !== "string") return fallback;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : fallback;
}

export function previewKindForFile(file: Pick<FileRecord, "displayName" | "mimeType">) {
  return resolvePreviewKind(file);
}

export function formatShareUrl(currentUrl: string, token: string, isPublic = false): string {
  const url = new URL(currentUrl);
  const page = isPublic ? "/share-public" : "/share";
  return `${url.origin}${page}?token=${encodeURIComponent(token)}`;
}

export function userLoginUrl(currentUrl: string, configuredUrl = "https://user.chemvault.science/login"): string {
  const url = new URL(configuredUrl);
  url.searchParams.set("returnTo", currentUrl);
  return url.toString();
}

export function splitUploadPath(file: UploadPathInput): UploadPathInfo {
  const rawPath = file.relativePath?.trim() || file.webkitRelativePath?.trim() || file.name;
  const parts = rawPath
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
  const name = parts.at(-1) || file.name;
  return {
    name,
    folderParts: parts.slice(0, -1),
    relativePath: parts.length ? parts.join("/") : name,
  };
}

export function resolveUploadFolderParts(activeFolder: FolderRecord | null | undefined, folderParts: string[]): string[] {
  const cleanedParts = folderParts.map((part) => part.trim()).filter(Boolean);
  if (!activeFolder || cleanedParts.length === 0) return cleanedParts;

  const activePathParts = activeFolder.path
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
  const maxMatchLength = Math.min(activePathParts.length, cleanedParts.length);

  for (let matchLength = maxMatchLength; matchLength > 0; matchLength -= 1) {
    const activeSuffix = activePathParts.slice(-matchLength).map(normalizeFolderPart);
    const uploadPrefix = cleanedParts.slice(0, matchLength).map(normalizeFolderPart);
    if (activeSuffix.every((part, index) => part === uploadPrefix[index])) {
      return cleanedParts.slice(matchLength);
    }
  }

  return cleanedParts;
}

function normalizeFolderPart(value: string): string {
  return value.trim().toLowerCase();
}

export function getFolderDeletionScope(folders: FolderRecord[], files: FileRecord[], folderId: string): FolderDeletionScope {
  const folderIds: string[] = [];
  const queue = [folderId];

  for (let index = 0; index < queue.length; index += 1) {
    const currentId = queue[index];
    folderIds.push(currentId);
    queue.push(...folders.filter((folder) => folder.parentId === currentId).map((folder) => folder.id));
  }

  const folderIdSet = new Set(folderIds);
  return {
    folderIds,
    fileIds: files.filter((file) => file.folderId !== null && folderIdSet.has(file.folderId) && file.status !== "deleted").map((file) => file.id),
  };
}

export function markFilesDeleted(files: FileRecord[], fileIds: Set<string>, timestamp: string): FileRecord[] {
  if (fileIds.size === 0) return files;
  return files.map((file) =>
    fileIds.has(file.id)
      ? {
          ...file,
          status: "deleted",
          updatedAt: timestamp,
          deletedAt: timestamp,
        }
      : file
  );
}

export function mergeCompletedUploadFiles(library: LibraryResponse, completedFiles: Iterable<FileRecord>): LibraryResponse {
  const completedById = new Map<string, FileRecord>();
  for (const file of completedFiles) {
    completedById.set(file.id, { ...file, status: "ready" });
  }
  if (completedById.size === 0) return library;

  const seen = new Set<string>();
  const files = library.files.map((file) => {
    const completed = completedById.get(file.id);
    if (!completed) return file;
    seen.add(file.id);
    return {
      ...file,
      ...completed,
      status: "ready" as const,
      tags: file.tags.length ? file.tags : completed.tags,
    };
  });

  const missingCompletedFiles = Array.from(completedById.values()).filter((file) => !seen.has(file.id));
  if (missingCompletedFiles.length === 0) return { ...library, files };

  return {
    ...library,
    files: [...missingCompletedFiles, ...files],
  };
}

export function buildFolderTree(projectId: string, folders: FolderRecord[], files: FileRecord[]): FolderTreeNode[] {
  const projectFolders = folders
    .filter((folder) => folder.projectId === projectId)
    .sort((left, right) => left.path.localeCompare(right.path, undefined, { sensitivity: "base" }));
  const byParent = new Map<string, FolderRecord[]>();
  for (const folder of projectFolders) {
    const key = folder.parentId ?? "";
    byParent.set(key, [...(byParent.get(key) ?? []), folder]);
  }

  const countDirectFiles = (folderId: string) =>
    files.filter((file) => file.projectId === projectId && file.folderId === folderId && file.status !== "deleted").length;

  const build = (parentId: string | null, depth: number): FolderTreeNode[] =>
    (byParent.get(parentId ?? "") ?? []).map((folder) => {
      const children = build(folder.id, depth + 1);
      const fileCount = countDirectFiles(folder.id);
      const totalFileCount = fileCount + children.reduce((total, child) => total + child.totalFileCount, 0);
      return { folder, children, depth, fileCount, totalFileCount };
    });

  return build(null, 0);
}

export function buildFileBrowserItems(library: LibraryResponse, filters: FileFilters): FileBrowserItem[] {
  const activeFolder = filters.folderId ? library.folders.find((folder) => folder.id === filters.folderId) ?? null : null;
  const projectId = filters.projectId ?? activeFolder?.projectId ?? null;
  const liveFiles = library.files.filter((file) => file.status !== "deleted");
  const matchedFiles = filterFiles(liveFiles, {
    search: filters.search,
    projectId: null,
    folderId: null,
    tagSlug: filters.tagSlug,
    quickFilter: filters.quickFilter ?? null,
  });

  if (!projectId) {
    return library.projects
      .map((project) => {
        const projectFiles = matchedFiles.filter((file) => file.projectId === project.id);
        return {
          kind: "project" as const,
          id: project.id,
          name: project.name,
          fileCount: projectFiles.length,
          totalBytes: totalBytes(projectFiles),
        };
      })
      .filter((item) => shouldShowBrowserContainer(item.name, item.fileCount, filters))
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
  }

  const parentId = activeFolder?.id ?? null;
  const folders = library.folders
    .filter((folder) => folder.projectId === projectId && (folder.parentId ?? null) === parentId)
    .map((folder) => {
      const folderIds = descendantFolderIds(library.folders, folder.id);
      const folderFiles = matchedFiles.filter((file) => file.folderId !== null && folderIds.has(file.folderId));
      return {
        kind: "folder" as const,
        id: folder.id,
        projectId: folder.projectId,
        parentId: folder.parentId,
        name: folder.name,
        path: folder.path,
        fileCount: folderFiles.length,
        totalBytes: totalBytes(folderFiles),
      };
    })
    .filter((item) => shouldShowBrowserContainer(`${item.name} ${item.path}`, item.fileCount, filters))
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));

  const files = matchedFiles
    .filter((file) => file.projectId === projectId && (file.folderId ?? null) === parentId)
    .sort((left, right) => left.displayName.localeCompare(right.displayName, undefined, { sensitivity: "base" }))
    .map((file) => ({
      kind: "file" as const,
      id: file.id,
      name: file.displayName,
      file,
    }));

  return [...folders, ...files];
}

function descendantFolderIds(folders: FolderRecord[], folderId: string): Set<string> {
  const ids = new Set<string>();
  const queue = [folderId];
  for (let index = 0; index < queue.length; index += 1) {
    const currentId = queue[index];
    ids.add(currentId);
    queue.push(...folders.filter((folder) => folder.parentId === currentId).map((folder) => folder.id));
  }
  return ids;
}

function totalBytes(files: FileRecord[]): number {
  return files.reduce((sum, file) => sum + file.sizeBytes, 0);
}

function shouldShowBrowserContainer(name: string, fileCount: number, filters: FileFilters): boolean {
  const search = filters.search.trim().toLowerCase();
  const hasNarrowing = Boolean(search || filters.tagSlug || filters.quickFilter);
  if (!hasNarrowing) return true;
  return fileCount > 0 || (search.length > 0 && name.toLowerCase().includes(search));
}

export function filterFiles(files: FileRecord[], filters: FileFilters): FileRecord[] {
  const search = filters.search.trim().toLowerCase();

  return files.filter((file) => {
    if (filters.projectId && file.projectId !== filters.projectId) return false;
    if (filters.folderId && file.folderId !== filters.folderId) return false;
    if (filters.tagSlug && !file.tags.some((tag) => tag.slug === filters.tagSlug)) return false;
    if (filters.quickFilter === "ready" && file.status !== "ready") return false;
    if (filters.quickFilter === "failed" && file.status !== "failed") return false;
    if (filters.quickFilter === "large" && file.sizeBytes < 1024 ** 3) return false;
    if (filters.quickFilter === "shared" && !isSharedFile(file)) return false;

    if (!search) return true;
    const searchable = [
      file.displayName,
      file.originalName,
      file.mimeType ?? "",
      ...file.tags.map((tag) => tag.name),
      ...file.tags.map((tag) => tag.slug),
    ]
      .join(" ")
      .toLowerCase();
    return searchable.includes(search);
  });
}

function isSharedFile(file: FileRecord): boolean {
  const sharedStatus = "sharedStatus" in file ? (file as { sharedStatus?: "private" | "shared" | "public" }).sharedStatus : undefined;
  return sharedStatus === "shared" || sharedStatus === "public" || file.visibility === "public" || file.visibility === "roles";
}

export function sortFiles(files: FileRecord[], sort: FileSort): FileRecord[] {
  const direction = sort.direction === "asc" ? 1 : -1;
  return [...files].sort((left, right) => {
    const value = compareSortValue(left, right, sort.key);
    if (value !== 0) return value * direction;
    return left.displayName.localeCompare(right.displayName, undefined, { sensitivity: "base" });
  });
}

export function summarizeFiles(files: FileRecord[]): FileSummary {
  return files.reduce<FileSummary>(
    (summary, file) => {
      summary.totalBytes += file.sizeBytes;
      if (file.status === "ready") summary.readyCount += 1;
      if (file.status === "failed") summary.failedCount += 1;
      if (file.status === "uploading" || file.status === "pending") summary.uploadingCount += 1;
      if (file.sizeBytes >= 1024 ** 3) summary.largeFileCount += 1;
      if (!summary.largestFile || file.sizeBytes > summary.largestFile.sizeBytes) summary.largestFile = file;
      if (!summary.latestFile || new Date(file.updatedAt).getTime() > new Date(summary.latestFile.updatedAt).getTime()) summary.latestFile = file;
      return summary;
    },
    {
      totalBytes: 0,
      readyCount: 0,
      failedCount: 0,
      uploadingCount: 0,
      largeFileCount: 0,
      largestFile: null,
      latestFile: null,
    }
  );
}

function compareSortValue(left: FileRecord, right: FileRecord, key: FileSortKey): number {
  switch (key) {
    case "name":
      return left.displayName.localeCompare(right.displayName, undefined, { sensitivity: "base" });
    case "type":
      return (left.mimeType ?? "").localeCompare(right.mimeType ?? "", undefined, { sensitivity: "base" });
    case "size":
      return left.sizeBytes - right.sizeBytes;
    case "modified":
      return new Date(left.updatedAt).getTime() - new Date(right.updatedAt).getTime();
  }
}

export function reduceUploadQueue(queue: UploadQueueItem[], action: UploadQueueAction): UploadQueueItem[] {
  switch (action.type) {
    case "add":
      return [
        {
          id: action.id,
          name: action.name,
          sizeBytes: action.sizeBytes,
          loadedBytes: 0,
          progress: 0,
          status: "queued",
          message: null,
        },
        ...queue,
      ];
    case "stage":
      return [
        ...action.items.map((item) => ({
          id: item.id,
          name: item.name,
          sizeBytes: item.sizeBytes,
          loadedBytes: 0,
          progress: 0,
          status: "pending" as const,
          message: "Pending",
        })),
        ...queue,
      ];
    case "start":
      return queue.map((item) =>
        item.id === action.id
          ? {
              ...item,
              loadedBytes: 0,
              progress: 0,
              status: "queued",
              message: action.message ?? "Preparing",
            }
          : item
      );
    case "progress":
      return queue.map((item) => {
        if (item.id !== action.id) return item;
        const progress = item.sizeBytes > 0 ? Math.min(100, Math.round((action.loadedBytes / item.sizeBytes) * 100)) : 0;
        return {
          ...item,
          loadedBytes: action.loadedBytes,
          progress,
          status: "uploading",
          message: null,
        };
      });
    case "complete":
      return queue.map((item) =>
        item.id === action.id
          ? { ...item, loadedBytes: item.sizeBytes, progress: 100, status: "complete", message: action.message ?? "Completed" }
          : item
      );
    case "fail":
      return queue.map((item) => (item.id === action.id ? { ...item, status: "failed", message: action.message } : item));
    case "clear":
      return [];
    case "clear-complete":
      return queue.filter((item) => item.status !== "complete");
  }
}

export function mergeTags(primary: TagRecord[], fallback: TagRecord[]): TagRecord[] {
  const bySlug = new Map(primary.map((entry) => [entry.slug, entry]));
  for (const tagRecord of fallback) {
    if (!bySlug.has(tagRecord.slug)) bySlug.set(tagRecord.slug, tagRecord);
  }
  return Array.from(bySlug.values());
}
