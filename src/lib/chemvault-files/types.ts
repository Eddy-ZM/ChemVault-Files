export type FileStatus = "pending" | "uploading" | "ready" | "failed" | "deleted";
export type UploadMode = "direct" | "presigned" | "multipart";
export type UploadSessionStatus = "created" | "uploading" | "complete" | "aborted" | "failed";
export type PreviewKind = "pdf" | "image" | "csv" | "text" | "unsupported";
export type FileActivityEventType = "preview" | "download" | "share_created" | "share_accessed" | "share_download";
export type FilePermissionLevel = "none" | "read" | "write";
export type FileRoleScope = "owner" | "domain" | "external";
export type FileVisibility = "public" | "roles";

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
  visibility: FileVisibility;
  roleIds: string[];
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
  visibility: FileVisibility;
  roleIds: string[];
}

export interface FileShareRecord {
  token: string;
  fileId: string;
  createdByEmail: string | null;
  allowDownload: boolean;
  expiresAt: string;
  createdAt: string;
  revokedAt: string | null;
  accessCount: number;
  lastAccessedAt: string | null;
}

export interface FileActivityRecord {
  id: string;
  fileId: string;
  actorEmail: string | null;
  eventType: FileActivityEventType;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface ShareCreateResponse {
  share: FileShareRecord;
  shareUrl: string;
}

export interface SharePublicResponse {
  file: {
    id: string;
    displayName: string;
    mimeType: string | null;
    sizeBytes: number;
    previewKind: PreviewKind;
  };
  share: {
    token: string;
    allowDownload: boolean;
    expiresAt: string;
    createdAt: string;
  };
  previewUrl: string | null;
  downloadUrl: string | null;
}

export interface FileShareListResponse {
  shares: FileShareRecord[];
}

export interface FileRolePolicy {
  id: string;
  name: string;
  description: string | null;
  scope: FileRoleScope;
  domain: string | null;
  permission: FilePermissionLevel;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ActorAccess {
  actorEmail: string;
  roleId: string;
  roleName: string;
  permission: FilePermissionLevel;
  canManageRoles: boolean;
}
