import { describe, expect, it } from "vitest";
import { onRequestPost as createFolder } from "../functions/api/folders";
import { onRequestDelete as deleteFolder } from "../functions/api/folders/[id]";

interface FolderState {
  folders: Record<string, Record<string, unknown>>;
  files?: Record<string, Record<string, unknown>>;
  roleAccess?: Record<string, string[]>;
  childCount: number;
  fileCount: number;
  inserted: number;
  deletedIds: string[];
  deletedFileIds?: string[];
}

class FakeStatement {
  private args: unknown[] = [];

  constructor(private readonly state: FolderState, private readonly sql: string) {}

  bind(...args: unknown[]): FakeStatement {
    this.args = args;
    return this;
  }

  async all(): Promise<{ results: Record<string, unknown>[] }> {
    if (this.sql.includes("FROM file_roles")) {
      return {
        results: [
          role("role_super", "Super", "owner", null, "write"),
          role("role_internal", "Common_In", "domain", "chemvault.science", "write"),
          role("role_external", "Common_Out", "external", null, "read"),
        ],
      };
    }
    if (this.sql.includes("WITH RECURSIVE folder_tree")) {
      return { results: folderSubtreeIds(this.state, String(this.args[0])).map((id) => ({ id })) };
    }
    if (this.sql.includes("FROM files") && this.sql.includes("folder_id IN")) {
      const folderIds = new Set(this.args.map(String));
      return {
        results: Object.values(this.state.files ?? {}).filter((file) => folderIds.has(String(file.folder_id)) && file.deleted_at === null),
      };
    }
    if (this.sql.includes("FROM file_role_access")) {
      const fileIds = this.args.map(String);
      return {
        results: fileIds.flatMap((fileId) => (this.state.roleAccess?.[fileId] ?? []).map((roleId) => ({ file_id: fileId, role_id: roleId }))),
      };
    }
    return { results: [] };
  }

  async first<T>(): Promise<T | null> {
    if (this.sql.includes("SELECT * FROM folders WHERE id = ?")) {
      return (this.state.folders[String(this.args[0])] as T | undefined) ?? null;
    }
    if (this.sql.includes("LOWER(name) = LOWER(?)")) {
      const [projectId, parentId, name] = this.args.map((value) => (value === null ? null : String(value)));
      const existing = Object.values(this.state.folders).find(
        (folder) => folder.project_id === projectId && (folder.parent_id ?? null) === parentId && String(folder.name).toLowerCase() === String(name).toLowerCase()
      );
      return (existing as T | undefined) ?? null;
    }
    if (this.sql.includes("SELECT path FROM folders WHERE id = ?")) {
      const folder = this.state.folders[String(this.args[0])];
      return folder ? ({ path: folder.path } as T) : null;
    }
    if (this.sql.includes("COUNT(*) AS count FROM folders")) {
      return { count: this.state.childCount } as T;
    }
    if (this.sql.includes("COUNT(*) AS count FROM files")) {
      if (this.state.files) {
        const folderId = String(this.args[0]);
        const count = Object.values(this.state.files).filter((file) => file.folder_id === folderId && file.deleted_at === null).length;
        return { count } as T;
      }
      return { count: this.state.fileCount } as T;
    }
    return null;
  }

  async run(): Promise<{ success: true }> {
    if (this.sql.includes("INSERT INTO folders")) {
      this.state.inserted += 1;
      const [id, projectId, parentId, name, slug, path, createdAt, updatedAt] = this.args;
      this.state.folders[String(id)] = {
        id,
        project_id: projectId,
        parent_id: parentId,
        name,
        slug,
        path,
        created_at: createdAt,
        updated_at: updatedAt,
      };
    }
    if (this.sql.includes("DELETE FROM folders WHERE id = ?")) {
      const folderId = String(this.args[0]);
      const hasReferencingFiles = Object.values(this.state.files ?? {}).some((fileRecord) => fileRecord.folder_id === folderId);
      if (hasReferencingFiles) throw new Error("D1_ERROR: FOREIGN KEY constraint failed");
      this.state.deletedIds.push(folderId);
      delete this.state.folders[folderId];
    }
    if (this.sql.includes("UPDATE files SET status = 'deleted'")) {
      const fileId = String(this.args[2]);
      const file = this.state.files?.[fileId];
      if (file) {
        file.status = "deleted";
        file.deleted_at = this.args[0];
        file.updated_at = this.args[1];
        file.folder_id = null;
      }
      this.state.deletedFileIds?.push(fileId);
    }
    if (this.sql.includes("UPDATE files SET folder_id = NULL")) {
      const folderIds = new Set(this.args.slice(1).map(String));
      for (const fileRecord of Object.values(this.state.files ?? {})) {
        if (folderIds.has(String(fileRecord.folder_id))) {
          fileRecord.folder_id = null;
          fileRecord.updated_at = this.args[0];
        }
      }
    }
    return { success: true };
  }
}

class FakeD1 {
  constructor(private readonly state: FolderState) {}

  prepare(sql: string): FakeStatement {
    return new FakeStatement(this.state, sql);
  }
}

function role(id: string, name: string, scope: string, domain: string | null, permission: string) {
  return {
    id,
    name,
    description: null,
    scope,
    domain,
    permission,
    is_default: id === "role_external" ? 1 : 0,
    created_at: "2026-06-18T00:00:00.000Z",
    updated_at: "2026-06-18T00:00:00.000Z",
  };
}

function folder(id: string, name: string, parentId: string | null = null) {
  const path = parentId ? `/Screen 042/${name}` : `/${name}`;
  return {
    id,
    project_id: "project_spectra",
    parent_id: parentId,
    name,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    path,
    created_at: "2026-06-11T00:00:00.000Z",
    updated_at: "2026-06-11T00:00:00.000Z",
  };
}

function file(id: string, folderId: string, r2Key: string) {
  return {
    id,
    project_id: "project_spectra",
    folder_id: folderId,
    display_name: `${id}.pdf`,
    original_name: `${id}.pdf`,
    r2_key: r2Key,
    mime_type: "application/pdf",
    size_bytes: 1024,
    status: "ready",
    checksum: null,
    upload_session_id: null,
    actor_email: "owner@chemvault.science",
    download_count: 0,
    visibility: "public",
    created_at: "2026-06-11T00:00:00.000Z",
    updated_at: "2026-06-11T00:00:00.000Z",
    deleted_at: null,
  };
}

function deletedFile(id: string, folderId: string, r2Key: string) {
  return {
    ...file(id, folderId, r2Key),
    status: "deleted",
    deleted_at: "2026-06-19T07:00:00.000Z",
  };
}

function folderSubtreeIds(state: FolderState, rootId: string): string[] {
  const ids = [rootId];
  for (let index = 0; index < ids.length; index += 1) {
    const parentId = ids[index];
    ids.push(...Object.values(state.folders).filter((entry) => entry.parent_id === parentId).map((entry) => String(entry.id)));
  }
  return ids;
}

function context(state: FolderState, request: Request, params: Record<string, string> = {}) {
  const deletedR2Keys: string[] = [];
  return {
    request,
    params,
    env: {
      FILES_DB: new FakeD1(state),
      FILES_BUCKET: {
        delete: async (key: string) => {
          deletedR2Keys.push(key);
        },
      },
      PRIVATE_OWNER_EMAIL: "owner@chemvault.science",
    },
    waitUntil: () => undefined,
    data: { deletedR2Keys },
  } as unknown as Parameters<typeof createFolder>[0] & Parameters<typeof deleteFolder>[0];
}

function request(email: string, init?: RequestInit): Request {
  return new Request("https://file.chemvault.science/api/folders", {
    ...init,
    headers: {
      "Cf-Access-Authenticated-User-Email": email,
      ...(init?.headers ?? {}),
    },
  });
}

describe("folders API", () => {
  it("reuses an existing sibling folder instead of creating duplicates", async () => {
    const state: FolderState = {
      folders: { folder_screen: folder("folder_screen", "Screen 042") },
      childCount: 0,
      fileCount: 0,
      inserted: 0,
      deletedIds: [],
    };

    const response = await createFolder(
      context(
        state,
        request("owner@chemvault.science", {
          method: "POST",
          body: JSON.stringify({ projectId: "project_spectra", parentId: null, name: "screen 042" }),
        })
      )
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ folder: { id: "folder_screen" } });
    expect(state.inserted).toBe(0);
  });

  it("deletes empty folders", async () => {
    const state: FolderState = {
      folders: { folder_empty: folder("folder_empty", "Empty") },
      childCount: 0,
      fileCount: 0,
      inserted: 0,
      deletedIds: [],
    };

    const response = await deleteFolder(context(state, request("owner@chemvault.science", { method: "DELETE" }), { id: "folder_empty" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "deleted", folderId: "folder_empty" });
    expect(state.deletedIds).toEqual(["folder_empty"]);
  });

  it("detaches already-deleted file tombstones before deleting an otherwise empty folder", async () => {
    const state: FolderState = {
      folders: { folder_empty: folder("folder_empty", "Empty") },
      files: {
        file_deleted: deletedFile("file_deleted", "folder_empty", "files/deleted.pdf"),
      },
      childCount: 0,
      fileCount: 0,
      inserted: 0,
      deletedIds: [],
    };

    const response = await deleteFolder(context(state, request("owner@chemvault.science", { method: "DELETE" }), { id: "folder_empty" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "deleted", folderId: "folder_empty" });
    expect(state.files?.file_deleted.folder_id).toBeNull();
    expect(state.deletedIds).toEqual(["folder_empty"]);
  });

  it("rejects non-empty folder deletion without recursive confirmation", async () => {
    const state: FolderState = {
      folders: { folder_parent: folder("folder_parent", "Parent") },
      childCount: 1,
      fileCount: 0,
      inserted: 0,
      deletedIds: [],
    };

    const response = await deleteFolder(context(state, request("owner@chemvault.science", { method: "DELETE" }), { id: "folder_parent" }));

    expect(response.status).toBe(409);
    expect(state.deletedIds).toEqual([]);
  });

  it("recursively deletes a confirmed non-empty folder and its contents", async () => {
    const state: FolderState = {
      folders: {
        folder_parent: folder("folder_parent", "Parent"),
        folder_child: folder("folder_child", "Child", "folder_parent"),
      },
      files: {
        file_parent: file("file_parent", "folder_parent", "files/parent.pdf"),
        file_child: file("file_child", "folder_child", "files/child.pdf"),
      },
      childCount: 1,
      fileCount: 1,
      inserted: 0,
      deletedIds: [],
      deletedFileIds: [],
    };
    const requestWithConfirmation = request("owner@chemvault.science", {
      method: "DELETE",
      body: JSON.stringify({ recursive: true }),
    });
    const ctx = context(state, requestWithConfirmation, { id: "folder_parent" }) as unknown as Parameters<typeof deleteFolder>[0] & {
      data: { deletedR2Keys: string[] };
    };

    const response = await deleteFolder(ctx);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "deleted",
      folderId: "folder_parent",
      deletedFolderCount: 2,
      deletedFileCount: 2,
    });
    expect(state.deletedFileIds).toEqual(["file_parent", "file_child"]);
    expect(state.deletedIds).toEqual(["folder_child", "folder_parent"]);
    expect(ctx.data.deletedR2Keys).toEqual(["files/parent.pdf", "files/child.pdf"]);
  });
});
