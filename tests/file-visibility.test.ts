import { describe, expect, it } from "vitest";
import { listLibrary } from "../functions/_lib/db";
import type { ActorAccess } from "../src/lib/chemvault-files/types";

const externalAccess: ActorAccess = {
  actorEmail: "visitor@example.com",
  roleId: "role_external",
  roleName: "Common_Out",
  permission: "read",
  canManageRoles: false,
};

const ownerAccess: ActorAccess = {
  actorEmail: "owner@chemvault.science",
  roleId: "role_super",
  roleName: "Super",
  permission: "write",
  canManageRoles: true,
};

class VisibilityStatement {
  constructor(private readonly sql: string) {}

  bind(): VisibilityStatement {
    return this;
  }

  async all(): Promise<{ results: Record<string, unknown>[] }> {
    if (this.sql.includes("FROM projects")) {
      return { results: [{ id: "project_spectra", name: "Spectra", slug: "spectra", description: null, sort_order: 1, created_at: now, updated_at: now }] };
    }
    if (this.sql.includes("FROM folders") || this.sql.includes("FROM tags") || this.sql.includes("FROM file_tags")) {
      return { results: [] };
    }
    if (this.sql.includes("FROM file_role_access")) {
      return {
        results: [
          { file_id: "file_internal", role_id: "role_internal" },
          { file_id: "file_external", role_id: "role_external" },
        ],
      };
    }
    if (this.sql.includes("FROM files")) {
      return {
        results: [
          file("file_public", "public.pdf", "public"),
          file("file_internal", "internal.pdf", "roles"),
          file("file_external", "external.pdf", "roles"),
        ],
      };
    }
    return { results: [] };
  }
}

class VisibilityD1 {
  prepare(sql: string): VisibilityStatement {
    return new VisibilityStatement(sql);
  }
}

const now = "2026-06-18T00:00:00.000Z";

function file(id: string, name: string, visibility: string): Record<string, unknown> {
  return {
    id,
    project_id: "project_spectra",
    folder_id: null,
    display_name: name,
    original_name: name,
    r2_key: `files/${name}`,
    mime_type: "application/pdf",
    size_bytes: 7,
    status: "ready",
    checksum: null,
    upload_session_id: null,
    actor_email: "owner@chemvault.science",
    download_count: 0,
    visibility,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
}

describe("file visibility", () => {
  it("shows public files and files assigned to the actor role", async () => {
    const library = await listLibrary(new VisibilityD1() as unknown as D1Database, externalAccess);

    expect(library.files.map((entry) => entry.displayName)).toEqual(["public.pdf", "external.pdf"]);
    expect(library.files.find((entry) => entry.displayName === "external.pdf")?.roleIds).toEqual(["role_external"]);
  });

  it("lets administrators see every file regardless of file role assignment", async () => {
    const library = await listLibrary(new VisibilityD1() as unknown as D1Database, ownerAccess);

    expect(library.files.map((entry) => entry.displayName)).toEqual(["public.pdf", "internal.pdf", "external.pdf"]);
  });
});
