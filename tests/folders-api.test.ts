import { describe, expect, it } from "vitest";
import { onRequestPost as createFolder } from "../functions/api/folders";
import { onRequestDelete as deleteFolder } from "../functions/api/folders/[id]";

interface FolderState {
  folders: Record<string, Record<string, unknown>>;
  childCount: number;
  fileCount: number;
  inserted: number;
  deletedIds: string[];
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
      this.state.deletedIds.push(String(this.args[0]));
      delete this.state.folders[String(this.args[0])];
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

function context(state: FolderState, request: Request, params: Record<string, string> = {}) {
  return {
    request,
    params,
    env: {
      FILES_DB: new FakeD1(state),
      PRIVATE_OWNER_EMAIL: "owner@chemvault.science",
    },
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

  it("rejects non-empty folder deletion", async () => {
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
});
