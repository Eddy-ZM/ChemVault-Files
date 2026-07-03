import { describe, expect, it } from "vitest";
import { onRequestPost as initUpload } from "../functions/api/files/init";
import { onRequestGet as downloadFile } from "../functions/api/files/[id]/download";
import { onRequestGet as libraryGet } from "../functions/api/library";

class FakeStatement {
  private args: unknown[] = [];

  constructor(private readonly sql: string, private readonly permission: "none" | "read" | "write") {}

  bind(...args: unknown[]): FakeStatement {
    this.args = args;
    return this;
  }

  async all(): Promise<{ results: Record<string, unknown>[] }> {
    if (this.sql.includes("FROM file_roles")) {
      return {
        results: [
          role("role_super", "Super", "owner", null, "write"),
          role("role_internal", "Common_In", "domain", "chemvault.science", this.permission),
          role("role_external", "Common_Out", "external", null, this.permission),
        ],
      };
    }
    return { results: [] };
  }

  async first(): Promise<Record<string, unknown> | null> {
    if (this.sql.includes("FROM files")) {
      return {
        id: "file_1",
        project_id: "project_spectra",
        folder_id: null,
        display_name: "report.pdf",
        original_name: "report.pdf",
        r2_key: "files/report.pdf",
        mime_type: "application/pdf",
        size_bytes: 7,
        status: "ready",
        checksum: null,
        upload_session_id: null,
        actor_email: "owner@chemvault.science",
        download_count: 0,
        visibility: "public",
        created_at: "2026-06-18T00:00:00.000Z",
        updated_at: "2026-06-18T00:00:00.000Z",
        deleted_at: null,
      };
    }
    if (this.sql.includes("FROM projects") && this.args[0] === "project_spectra") {
      return { slug: "spectra" };
    }
    return null;
  }

  async run(): Promise<{ success: true }> {
    return { success: true };
  }
}

class FakeD1 {
  constructor(private readonly permission: "none" | "read" | "write") {}

  prepare(sql: string): FakeStatement {
    return new FakeStatement(sql, this.permission);
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

function env(permission: "none" | "read" | "write") {
  return {
    FILES_DB: new FakeD1(permission),
    FILES_BUCKET: {
      get: async () => ({ body: new Blob(["private"]).stream() }),
    },
    PRIVATE_OWNER_EMAIL: "owner@chemvault.science",
  };
}

function request(path: string, email = "scientist@chemvault.science", init?: RequestInit): Request {
  return new Request(`https://file.chemvault.science${path}`, {
    ...init,
    headers: {
      "Cf-Access-Authenticated-User-Email": email,
      ...(init?.headers ?? {}),
    },
  });
}

describe("access policy enforcement", () => {
  it("rejects library reads for internal users whose role is configured as unreadable", async () => {
    const response = await libraryGet({
      request: request("/api/library", "scientist@chemvault.science"),
      env: env("none"),
    } as unknown as Parameters<typeof libraryGet>[0]);

    expect(response.status).toBe(403);
  });

  it("allows external read-only users to read the public library", async () => {
    const response = await libraryGet({ request: request("/api/library", "visitor@example.com"), env: env("read") } as unknown as Parameters<typeof libraryGet>[0]);

    expect(response.status).toBe(200);
  });

  it("rejects uploads for external read-only users", async () => {
    const response = await initUpload({
      request: request("/api/files/init", "visitor@example.com", {
        method: "POST",
        body: JSON.stringify({ name: "report.pdf", size: 7, mimeType: "application/pdf", projectId: "project_spectra", folderId: null, tags: [] }),
      }),
      env: env("read"),
    } as unknown as Parameters<typeof initUpload>[0]);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "FILES_PERMISSION_DENIED" } });
  });

  it("allows downloads for external read-only users", async () => {
    const response = await downloadFile({
      request: request("/api/files/file_1/download", "visitor@example.com"),
      env: env("read"),
      params: { id: "file_1" },
    } as unknown as Parameters<typeof downloadFile>[0]);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("attachment");
  });
});
