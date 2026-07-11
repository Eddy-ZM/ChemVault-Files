export type FileStatus = "pending" | "uploading" | "ready" | "failed" | "deleted";
export type FileScanStatus = "pending" | "clean" | "rejected" | "error";
export type FileVisibility = "private" | "public" | "roles";
export type DriveView = "files" | "recent" | "starred" | "shared" | "trash";

export interface CVUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  systemRole: string;
  permissions: string[];
  services: string[];
  serviceAllowed: boolean;
  serviceReason: string | null;
}

export interface CVTag {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  createdAt: string;
}

export interface CVFile {
  id: string;
  projectId: string;
  folderId: string | null;
  displayName: string;
  originalName: string;
  mimeType: string | null;
  sizeBytes: number;
  status: FileStatus;
  scanStatus?: FileScanStatus;
  scanDetail?: string | null;
  scannedAt?: string | null;
  checksum: string | null;
  actorEmail: string | null;
  downloadCount: number;
  visibility: FileVisibility;
  roleIds: string[];
  ownerUserId?: string | null;
  parentId?: string | null;
  isStarred?: boolean;
  trashedAt?: string | null;
  lastOpenedAt?: string | null;
  sharedStatus?: "private" | "shared" | "public";
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  tags: CVTag[];
}

export interface CVFolder {
  id: string;
  projectId: string;
  parentId: string | null;
  name: string;
  slug: string;
  path: string;
  ownerUserId?: string | null;
  isStarred?: boolean;
  isTrashed?: boolean;
  trashedAt?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CVProject {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CVShareLink {
  token: string;
  fileId: string;
  createdByEmail: string | null;
  allowDownload: boolean;
  isPublic: boolean;
  expiresAt: string;
  createdAt: string;
  revokedAt: string | null;
  accessCount: number;
  lastAccessedAt: string | null;
}

export interface CVStorageUsage {
  usedBytes: number;
  quotaBytes: number;
  fileCount: number;
  byType: Array<{ type: string; label: string; bytes: number; count: number }>;
}

export interface AuthTokens {
  user: CVUser;
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  refreshExpiresIn: number;
}

export interface ListFilesResponse {
  view: DriveView;
  parentId: string | null;
  folders: CVFolder[];
  files: CVFile[];
  items?: Array<{ type: "folder"; folder: CVFolder } | { type: "file"; file: CVFile }>;
}

export interface UploadInput {
  file: Blob;
  name: string;
  size: number;
  mimeType: string | null;
  projectId: string;
  folderId?: string | null;
  tags?: string[];
  visibility?: FileVisibility;
  roleIds?: string[];
}
