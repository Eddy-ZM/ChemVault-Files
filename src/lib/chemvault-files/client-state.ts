import type { FileRecord } from "./types";

export interface FileFilters {
  search: string;
  projectId: string | null;
  folderId: string | null;
  tagSlug: string | null;
}

export type UploadQueueStatus = "queued" | "uploading" | "complete" | "failed";

export interface UploadQueueItem {
  id: string;
  name: string;
  sizeBytes: number;
  loadedBytes: number;
  progress: number;
  status: UploadQueueStatus;
  message: string | null;
}

export type UploadQueueAction =
  | { type: "add"; id: string; name: string; sizeBytes: number }
  | { type: "progress"; id: string; loadedBytes: number }
  | { type: "complete"; id: string; message?: string }
  | { type: "fail"; id: string; message: string }
  | { type: "clear-complete" };

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

export function filterFiles(files: FileRecord[], filters: FileFilters): FileRecord[] {
  const search = filters.search.trim().toLowerCase();

  return files.filter((file) => {
    if (filters.projectId && file.projectId !== filters.projectId) return false;
    if (filters.folderId && file.folderId !== filters.folderId) return false;
    if (filters.tagSlug && !file.tags.some((tag) => tag.slug === filters.tagSlug)) return false;

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
    case "progress":
      return queue.map((item) => {
        if (item.id !== action.id) return item;
        const progress = item.sizeBytes > 0 ? Math.min(100, Math.round((action.loadedBytes / item.sizeBytes) * 100)) : 0;
        return {
          ...item,
          loadedBytes: action.loadedBytes,
          progress,
          status: "uploading",
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
    case "clear-complete":
      return queue.filter((item) => item.status !== "complete");
  }
}
