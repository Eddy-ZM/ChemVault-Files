import { describe, expect, it } from "vitest";
import { onRequestDelete as deleteFile } from "../functions/api/files/[id]";

class FakeStatement {
  private args: unknown[] = [];

  constructor(private readonly state: { deleted: boolean }, private readonly sql: string) {}

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
    if (this.sql.includes("FROM file_role_access")) {
      return { results: [{ file_id: "file_1", role_id: "role_external" }] };
    }
    return { results: [] };
  }

  async first(): Promise<Record<string, unknown> | null> {
    if (this.sql.includes("FROM files")) return fileRow(this.args[0]);
    return null;
  }

  async run(): Promise<{ success: true }> {
    if (this.sql.includes("UPDATE files SET status = 'deleted'")) this.state.deleted = true;
    return { success: true };
  }
}

class FakeD1 {
  constructor(private readonly state: { deleted: boolean }) {}

  prepare(sql: string): FakeStatement {
    return new FakeStatement(this.state, sql);
  }
}

function role(id: string, name: string, scope: string, domain: string | null, permission: "none" | "read" | "write") {
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

function fileRow(id: unknown): Record<string, unknown> {
  return {
    id,
    project_id: "project_spectra",
    folder_id: null,
    display_name: "external-only.pdf",
    original_name: "external-only.pdf",
    r2_key: "files/external-only.pdf",
    mime_type: "application/pdf",
    size_bytes: 7,
    status: "ready",
    checksum: null,
    upload_session_id: null,
    actor_email: "owner@chemvault.science",
    download_count: 0,
    visibility: "roles",
    created_at: "2026-06-18T00:00:00.000Z",
    updated_at: "2026-06-18T00:00:00.000Z",
    deleted_at: null,
  };
}

describe("file write visibility", () => {
  it("rejects deletes from write-capable roles that cannot view the file", async () => {
    const state = { deleted: false };
    const response = await deleteFile({
      request: new Request("https://file.chemvault.science/api/files/file_1", {
        method: "DELETE",
        headers: { "Cf-Access-Authenticated-User-Email": "scientist@chemvault.science" },
      }),
      env: {
        FILES_DB: new FakeD1(state),
        FILES_BUCKET: { delete: async () => undefined },
        PRIVATE_OWNER_EMAIL: "owner@chemvault.science",
      },
      params: { id: "file_1" },
    } as unknown as Parameters<typeof deleteFile>[0]);

    expect(response.status).toBe(403);
    expect(state.deleted).toBe(false);
  });
});
