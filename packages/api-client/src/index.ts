export * from "./types";
import type {
  AuthTokens,
  CVFile,
  CVFolder,
  CVShareLink,
  CVStorageUsage,
  CVUser,
  DriveView,
  ListFilesResponse,
  UploadInput,
} from "./types";

export interface ChemVaultFilesClientOptions {
  baseUrl: string;
  getAccessToken?: () => string | null | Promise<string | null>;
  setTokens?: (tokens: AuthTokens) => void | Promise<void>;
  fetchImpl?: typeof fetch;
}

interface ApiErrorPayload {
  code?: string;
  message?: string;
}

interface ApiPayload<T = unknown> {
  ok?: boolean;
  data?: T;
  error?: ApiErrorPayload;
}

export class ChemVaultApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code = "REQUEST_FAILED"
  ) {
    super(message);
  }
}

export class ChemVaultFilesClient {
  private readonly baseUrl: URL;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: ChemVaultFilesClientOptions) {
    this.baseUrl = new URL(options.baseUrl.replace(/\/+$/, "/"));
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  loginUrl(redirectUri: string): string {
    const url = this.url("/api/app/auth/login");
    url.searchParams.set("redirect_uri", redirectUri);
    return url.toString();
  }

  async exchangeCurrentWebSession(): Promise<AuthTokens> {
    const tokens = await this.request<AuthTokens>("/api/app/auth/token", { method: "POST" }, { appEnvelope: true });
    await this.options.setTokens?.(tokens);
    return tokens;
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const tokens = await this.request<AuthTokens>(
      "/api/app/auth/refresh",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      },
      { appEnvelope: true, auth: false }
    );
    await this.options.setTokens?.(tokens);
    return tokens;
  }

  async me(): Promise<CVUser> {
    const response = await this.request<{ user: CVUser }>("/api/app/auth/me", undefined, { appEnvelope: true });
    return response.user;
  }

  listFiles(input: { parentId?: string | null; view?: DriveView } = {}): Promise<ListFilesResponse> {
    if (input.view === "trash") return this.listTrash();
    const url = this.url("/api/files");
    if (input.parentId) url.searchParams.set("parentId", input.parentId);
    if (input.view && input.view !== "files") url.searchParams.set("view", input.view);
    return this.request<ListFilesResponse>(url);
  }

  listTrash(): Promise<ListFilesResponse> {
    return this.request<ListFilesResponse>("/api/trash");
  }

  async searchFiles(query: string, type?: string | null): Promise<CVFile[]> {
    const url = this.url("/api/search");
    url.searchParams.set("q", query);
    if (type) url.searchParams.set("type", type);
    const response = await this.request<{ files: CVFile[] }>(url);
    return response.files;
  }

  async createFolder(input: { projectId: string; parentId?: string | null; name: string }): Promise<CVFolder> {
    const response = await this.request<{ folder: CVFolder }>("/api/files/folder", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    return response.folder;
  }

  async upload(input: UploadInput): Promise<CVFile> {
    const init = await this.request<{ file: CVFile; upload: { method: string; url: string }; session: { id: string } }>("/api/files/init", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: input.name,
        size: input.size,
        mimeType: input.mimeType,
        projectId: input.projectId,
        folderId: input.folderId ?? null,
        tags: input.tags ?? [],
        visibility: input.visibility ?? "private",
        roleIds: input.roleIds ?? [],
      }),
    });

    await this.raw(init.upload.url, {
      method: "PUT",
      headers: { "content-type": input.mimeType || "application/octet-stream" },
      body: input.file,
    });

    await this.request<{ status: string; fileId: string }>("/api/files/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fileId: init.file.id, sessionId: init.session.id }),
    });
    return { ...init.file, status: "ready" };
  }

  async renameFile(fileId: string, displayName: string): Promise<void> {
    await this.request(`/api/files/${encodeURIComponent(fileId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName }),
    });
  }

  async moveFile(fileId: string, folderId: string | null): Promise<void> {
    await this.request(`/api/files/${encodeURIComponent(fileId)}/move`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ folderId }),
    });
  }

  async copyFile(fileId: string, name?: string, folderId?: string | null): Promise<CVFile> {
    const response = await this.request<{ file: CVFile }>(`/api/files/${encodeURIComponent(fileId)}/copy`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, folderId }),
    });
    return response.file;
  }

  async deleteFile(fileId: string): Promise<void> {
    await this.request(`/api/files/${encodeURIComponent(fileId)}`, { method: "DELETE" });
  }

  async restoreFile(fileId: string): Promise<void> {
    await this.request(`/api/trash/${encodeURIComponent(fileId)}/restore`, { method: "POST" });
  }

  async permanentlyDelete(fileId: string): Promise<void> {
    await this.request(`/api/trash/${encodeURIComponent(fileId)}/permanent`, { method: "DELETE" });
  }

  async starFile(fileId: string, isStarred: boolean): Promise<void> {
    await this.request(`/api/files/${encodeURIComponent(fileId)}/star`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isStarred }),
    });
  }

  async createShareLink(fileId: string, input: { allowDownload: boolean; isPublic: boolean; expiresInDays?: number; expiresAt?: string }): Promise<{ share: CVShareLink; shareUrl: string }> {
    return this.request(`/api/files/${encodeURIComponent(fileId)}/share`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
  }

  storageUsage(): Promise<CVStorageUsage> {
    return this.request<CVStorageUsage>("/api/storage/usage");
  }

  async download(fileId: string): Promise<Blob> {
    const response = await this.raw(`/api/files/${encodeURIComponent(fileId)}/download`);
    return response.blob();
  }

  async preview(fileId: string): Promise<Blob> {
    const response = await this.raw(`/api/files/${encodeURIComponent(fileId)}/preview`);
    return response.blob();
  }

  previewUrl(fileId: string): string {
    return this.url(`/api/files/${encodeURIComponent(fileId)}/preview`).toString();
  }

  private async request<T>(input: string | URL, init?: RequestInit, options: { appEnvelope?: boolean; auth?: boolean } = {}): Promise<T> {
    const response = await this.raw(input, init, options);
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json") ? ((await response.json()) as ApiPayload<T>) : null;
    if (options.appEnvelope) {
      if (payload?.ok === true) return payload.data as T;
      throw new ChemVaultApiError(payload?.error?.message || "Request failed", response.status, payload?.error?.code);
    }
    if (payload?.error) {
      throw new ChemVaultApiError(payload.error.message || "Request failed", response.status, payload.error.code);
    }
    return payload as T;
  }

  private async raw(input: string | URL, init: RequestInit = {}, options: { auth?: boolean } = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (options.auth !== false) {
      const token = await this.options.getAccessToken?.();
      if (token) headers.set("authorization", `Bearer ${token}`);
    }
    const response = await this.fetchImpl(this.url(input), { ...init, headers });
    if (!response.ok) {
      const payload = response.headers.get("content-type")?.includes("application/json") ? ((await response.clone().json().catch(() => null)) as ApiPayload | null) : null;
      const error = payload?.error;
      throw new ChemVaultApiError(error?.message || `${response.status} ${response.statusText}`, response.status, error?.code);
    }
    return response;
  }

  private url(input: string | URL): URL {
    if (input instanceof URL) return input;
    return new URL(input.replace(/^\/+/, ""), this.baseUrl);
  }
}
