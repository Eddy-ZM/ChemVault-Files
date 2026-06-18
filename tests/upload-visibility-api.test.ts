import { describe, expect, it } from "vitest";
import { onRequestPost as initUpload } from "../functions/api/files/init";

class UploadStatement {
  private args: unknown[] = [];

  constructor(private readonly state: UploadState, private readonly sql: string) {}

  bind(...args: unknown[]): UploadStatement {
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

  async first(): Promise<Record<string, unknown> | null> {
    if (this.sql.includes("FROM projects")) return { slug: "spectra" };
    return null;
  }

  async run(): Promise<{ success: true }> {
    if (this.sql.includes("INSERT INTO files")) {
      this.state.fileId = String(this.args[0]);
      this.state.fileArgs = this.args;
    }
    if (this.sql.includes("file_role_access")) {
      this.state.roleAccess.push([String(this.args[0]), String(this.args[1])]);
    }
    return { success: true };
  }
}

class UploadD1 {
  constructor(private readonly state: UploadState) {}

  prepare(sql: string): UploadStatement {
    return new UploadStatement(this.state, sql);
  }
}

interface UploadState {
  fileId: string | null;
  fileArgs: unknown[];
  roleAccess: string[][];
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

function request(email: string): Request {
  return new Request("https://file.chemvault.science/api/files/init", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Cf-Access-Authenticated-User-Email": email,
    },
    body: JSON.stringify({
      name: "report.pdf",
      size: 7,
      mimeType: "application/pdf",
      projectId: "project_spectra",
      folderId: null,
      tags: [],
      visibility: "roles",
      roleIds: ["role_internal", "role_external"],
    }),
  });
}

describe("upload visibility API", () => {
  it("stores selected role visibility when an administrator uploads a file", async () => {
    const state: UploadState = { fileId: null, fileArgs: [], roleAccess: [] };
    const response = await initUpload({
      request: request("owner@chemvault.science"),
      env: {
        FILES_DB: new UploadD1(state),
        PRIVATE_OWNER_EMAIL: "owner@chemvault.science",
      },
    } as unknown as Parameters<typeof initUpload>[0]);

    expect(response.status).toBe(201);
    const payload = (await response.json()) as { file: { visibility: string; roleIds: string[] } };
    expect(payload.file).toMatchObject({ visibility: "roles", roleIds: ["role_internal", "role_external"] });
    expect(state.roleAccess).toEqual([
      [state.fileId, "role_internal"],
      [state.fileId, "role_external"],
    ]);
  });

  it("limits non-admin role visibility uploads to the actor's own role", async () => {
    const state: UploadState = { fileId: null, fileArgs: [], roleAccess: [] };
    const response = await initUpload({
      request: request("scientist@chemvault.science"),
      env: {
        FILES_DB: new UploadD1(state),
        PRIVATE_OWNER_EMAIL: "different-owner@chemvault.science",
      },
    } as unknown as Parameters<typeof initUpload>[0]);

    expect(response.status).toBe(201);
    const payload = (await response.json()) as { file: { visibility: string; roleIds: string[] } };
    expect(payload.file).toMatchObject({ visibility: "roles", roleIds: ["role_internal"] });
    expect(state.roleAccess).toEqual([[state.fileId, "role_internal"]]);
  });
});
