import { describe, expect, it } from "vitest";
import { onRequestGet as listFiles } from "../functions/api/files";
import { onRequestDelete as deleteFile } from "../functions/api/files/[id]";
import { onRequestPost as bulkDownload } from "../functions/api/files/bulk-download";
import { onRequestGet as searchFiles } from "../functions/api/search";
import { onRequestPost as restoreTrash } from "../functions/api/trash/[id]/restore";

interface DriveState {
  permission: "none" | "read" | "write";
  files: Record<string, Record<string, unknown>>;
  folders: Record<string, Record<string, unknown>>;
}

class DriveStatement {
  private args: unknown[] = [];

  constructor(private readonly state: DriveState, private readonly sql: string) {}

  bind(...args: unknown[]): DriveStatement {
    this.args = args;
    return this;
  }

  async all(): Promise<{ results: Record<string, unknown>[] }> {
    if (this.sql.includes("FROM file_roles")) {
      return {
        results: [
          role("role_super", "Super", "owner", null, "write"),
          role("role_internal", "Common_In", "domain", "chemvault.science", this.state.permission),
          role("role_external", "Common_Out", "external", null, this.state.permission),
        ],
      };
    }
    if (this.sql.includes("FROM projects")) return { results: [project()] };
    if (this.sql.includes("FROM folders")) return { results: Object.values(this.state.folders).filter((folder) => folder.deleted_at === null) };
    if (this.sql.includes("FROM tags")) return { results: [] };
    if (this.sql.includes("FROM file_tags") || this.sql.includes("FROM file_role_access")) return { results: [] };
    if (this.sql.includes("FROM files") && this.sql.includes("LIKE")) {
      const needle = String(this.args[0] ?? "").replace(/%/g, "").toLowerCase();
      return {
        results: Object.values(this.state.files).filter(
          (file) => file.deleted_at === null && `${file.display_name} ${file.original_name} ${file.mime_type}`.toLowerCase().includes(needle)
        ),
      };
    }
    if (this.sql.includes("FROM files") && this.sql.includes("deleted_at IS NULL")) {
      return { results: Object.values(this.state.files).filter((file) => file.deleted_at === null) };
    }
    return { results: [] };
  }

  async first<T>(): Promise<T | null> {
    if (this.sql.includes("SELECT * FROM files WHERE id = ?")) {
      const file = this.state.files[String(this.args[0])];
      if (!file) return null;
      if (this.sql.includes("deleted_at IS NULL") && file.deleted_at !== null) return null;
      if (this.sql.includes("deleted_at IS NOT NULL") && file.deleted_at === null) return null;
      return file as T;
    }
    if (this.sql.includes("SELECT * FROM folders WHERE id = ?")) {
      return (this.state.folders[String(this.args[0])] as T | undefined) ?? null;
    }
    return null;
  }

  async run(): Promise<{ success: true }> {
    if (this.sql.includes("UPDATE files SET status = 'deleted'")) {
      const file = this.state.files[String(this.args[3])];
      if (file) {
        file.status = "deleted";
        file.deleted_at = this.args[0];
        file.trashed_at = this.args[1];
        file.updated_at = this.args[2];
      }
    }
    if (this.sql.includes("UPDATE files SET status = 'ready'")) {
      const file = this.state.files[String(this.args[1])];
      if (file) {
        file.status = "ready";
        file.deleted_at = null;
        file.trashed_at = null;
        file.updated_at = this.args[0];
      }
    }
    return { success: true };
  }
}

class DriveD1 {
  constructor(private readonly state: DriveState) {}

  prepare(sql: string): DriveStatement {
    return new DriveStatement(this.state, sql);
  }
}

class DriveBucket {
  constructor(private readonly objects: Record<string, string>) {}

  async get(key: string): Promise<{ arrayBuffer: () => Promise<ArrayBuffer> } | null> {
    const value = this.objects[key];
    if (value === undefined) return null;
    const encoded = new TextEncoder().encode(value);
    const body = new ArrayBuffer(encoded.byteLength);
    new Uint8Array(body).set(encoded);
    return { arrayBuffer: async () => body };
  }
}

function context(
  state: DriveState,
  path: string,
  init?: RequestInit,
  params: Record<string, string> = {},
  email = "owner@chemvault.science",
  bucket?: DriveBucket
) {
  return {
    request: new Request(`https://file.chemvault.science${path}`, {
      ...init,
      headers: {
        "Cf-Access-Authenticated-User-Email": email,
        ...(init?.headers ?? {}),
      },
    }),
    env: {
      FILES_DB: new DriveD1(state),
      FILES_BUCKET: bucket,
      PRIVATE_OWNER_EMAIL: "owner@chemvault.science",
    },
    params,
  } as unknown;
}

function state(permission: DriveState["permission"] = "write"): DriveState {
  return {
    permission,
    folders: {},
    files: {
      file_report: file("file_report", "Chemistry report.pdf", null),
      file_image: file("file_image", "microscope.png", null, "image/png"),
      file_trash: file("file_trash", "old report.pdf", "2026-07-05T00:00:00.000Z"),
    },
  };
}

function project() {
  return {
    id: "project_spectra",
    name: "Spectra",
    slug: "spectra",
    description: null,
    sort_order: 10,
    created_at: "2026-07-05T00:00:00.000Z",
    updated_at: "2026-07-05T00:00:00.000Z",
  };
}

function file(id: string, name: string, deletedAt: string | null, mimeType = "application/pdf") {
  return {
    id,
    project_id: "project_spectra",
    folder_id: null,
    parent_id: null,
    display_name: name,
    original_name: name,
    r2_key: `files/spectra/${id}/${name}`,
    mime_type: mimeType,
    size_bytes: 1024,
    status: deletedAt ? "deleted" : "ready",
    checksum: null,
    upload_session_id: null,
    actor_email: "owner@chemvault.science",
    download_count: 0,
    visibility: "public",
    is_starred: 0,
    deleted_at: deletedAt,
    trashed_at: deletedAt,
    created_at: "2026-07-05T00:00:00.000Z",
    updated_at: "2026-07-05T00:00:00.000Z",
  };
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
    created_at: "2026-07-05T00:00:00.000Z",
    updated_at: "2026-07-05T00:00:00.000Z",
  };
}

describe("Drive API", () => {
  it("rejects file list reads without read permission", async () => {
    const response = await listFiles(context(state("none"), "/api/files", undefined, {}, "scientist@chemvault.science") as Parameters<typeof listFiles>[0]);
    expect(response.status).toBe(403);
  });

  it("lists only active files for authorized users", async () => {
    const response = await listFiles(context(state("read"), "/api/files") as Parameters<typeof listFiles>[0]);
    expect(response.status).toBe(200);
    const json = await response.json<{ files: Array<{ id: string }> }>();
    expect(json.files.map((entry) => entry.id)).toEqual(["file_report", "file_image"]);
  });

  it("searches active files by name", async () => {
    const response = await searchFiles(context(state("read"), "/api/search?q=microscope") as Parameters<typeof searchFiles>[0]);
    expect(response.status).toBe(200);
    const json = await response.json<{ files: Array<{ id: string }> }>();
    expect(json.files.map((entry) => entry.id)).toEqual(["file_image"]);
  });

  it("moves deleted files to trash and restores them", async () => {
    const driveState = state("write");
    const deleteResponse = await deleteFile(context(driveState, "/api/files/file_report", { method: "DELETE" }, { id: "file_report" }) as Parameters<typeof deleteFile>[0]);
    expect(deleteResponse.status).toBe(200);
    expect(driveState.files.file_report.status).toBe("deleted");
    expect(driveState.files.file_report.trashed_at).toBeTruthy();

    const restoreResponse = await restoreTrash(context(driveState, "/api/trash/file_report/restore", { method: "POST" }, { id: "file_report" }) as Parameters<typeof restoreTrash>[0]);
    expect(restoreResponse.status).toBe(200);
    expect(driveState.files.file_report.status).toBe("ready");
    expect(driveState.files.file_report.deleted_at).toBeNull();
  });

  it("streams selected files as a zip archive without exposing R2 keys", async () => {
    const driveState = state("read");
    const bucket = new DriveBucket({
      [String(driveState.files.file_report.r2_key)]: "report-bytes",
      [String(driveState.files.file_image.r2_key)]: "image-bytes",
    });
    const response = await bulkDownload(
      context(
        driveState,
        "/api/files/bulk-download",
        {
          method: "POST",
          body: JSON.stringify({ fileIds: ["file_report", "file_image"] }),
        },
        {},
        "owner@chemvault.science",
        bucket
      ) as Parameters<typeof bulkDownload>[0]
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain("Chemistry report.pdf");
    expect(text).not.toContain("files/spectra/file_report");
  });
});
