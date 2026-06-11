export type FileStatus = "pending" | "uploading" | "ready" | "failed" | "deleted";
export type UploadMode = "direct" | "presigned" | "multipart";
export type UploadSessionStatus = "created" | "uploading" | "complete" | "aborted" | "failed";

export interface ProjectRecord {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface FolderRecord {
  id: string;
  projectId: string;
  parentId: string | null;
  name: string;
  slug: string;
  path: string;
  createdAt: string;
  updatedAt: string;
}

export interface TagRecord {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  createdAt: string;
}

export interface FileRecord {
  id: string;
  projectId: string;
  folderId: string | null;
  displayName: string;
  originalName: string;
  r2Key: string;
  mimeType: string | null;
  sizeBytes: number;
  status: FileStatus;
  checksum: string | null;
  uploadSessionId: string | null;
  actorEmail: string | null;
  downloadCount: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  tags: TagRecord[];
}

export interface LibraryResponse {
  projects: ProjectRecord[];
  folders: FolderRecord[];
  tags: TagRecord[];
  files: FileRecord[];
}

export interface FileInitPayload {
  name: string;
  size: number;
  mimeType: string | null;
  projectId: string;
  folderId: string | null;
  tags: string[];
}
