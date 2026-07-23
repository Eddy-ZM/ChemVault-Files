import { describe, expect, it } from "vitest";
import { onRequestGet as previewFile } from "../functions/api/files/[id]/preview";

interface PreviewState {
  file: Record<string, unknown>;
  objectExists: boolean;
  activity: Record<string, unknown>[];
  sessionStatus: string | null;
}

class PreviewStatement {
  private args: unknown[] = [];

  constructor(private readonly state: PreviewState, private readonly sql: string) {}

  bind(...args: unknown[]): PreviewStatement {
    this.args = args;
    return this;
  }

  async first<T>(): Promise<T | null> {
    if (this.sql.includes("SELECT * FROM files WHERE id = ?")) {
      return this.args[0] === this.state.file.id ? (this.state.file as T) : null;
    }
    return null;
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
    if (this.sql.includes("FROM file_role_access")) return { results: [] };
    return { results: [] };
  }

  async run(): Promise<{ success: true }> {
    if (this.sql.includes("UPDATE files SET status = 'ready'")) {
      this.state.file.status = "ready";
      this.state.file.updated_at = this.args[0];
    }
    if (this.sql.includes("UPDATE upload_sessions SET status = 'complete'")) {
      this.state.sessionStatus = "complete";
    }
    if (this.sql.includes("INSERT INTO file_activity")) {
      this.state.activity.push({ args: this.args });
    }
    return { success: true };
  }
}

class PreviewD1 {
  constructor(private readonly state: PreviewState) {}

  prepare(sql: string): PreviewStatement {
    return new PreviewStatement(this.state, sql);
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
    created_at: "2026-07-05T00:00:00.000Z",
    updated_at: "2026-07-05T00:00:00.000Z",
  };
}

function pendingCsvState(objectExists = true): PreviewState {
  return {
    file: {
      id: "file_1",
      project_id: "project_spectra",
      folder_id: null,
      display_name: "smoke.csv",
      original_name: "smoke.csv",
      r2_key: "files/project/file_1/smoke.csv",
      mime_type: "text/csv",
      size_bytes: 128,
      status: "pending",
      checksum: null,
      upload_session_id: "session_1",
      actor_email: "owner@chemvault.science",
      download_count: 0,
      visibility: "private",
      created_at: "2026-07-05T00:00:00.000Z",
      updated_at: "2026-07-05T00:00:00.000Z",
      deleted_at: null,
    },
    objectExists,
    activity: [],
    sessionStatus: null,
  };
}

function context(state: PreviewState) {
  return {
    request: new Request("https://files.local/api/files/file_1/preview", {
      headers: { "X-ChemVault-User-Email": "owner@chemvault.science" },
    }),
    params: { id: "file_1" },
    env: {
      ENVIRONMENT: "local",
      PRIVATE_OWNER_EMAIL: "owner@chemvault.science",
      FILES_ADMIN_EMAILS: "owner@chemvault.science",
      FILES_DB: new PreviewD1(state),
      FILES_BUCKET: {
        get: async () => (state.objectExists ? { body: new Blob(["a,b\n1,2\n"]).stream() } : null),
      },
    },
  } as unknown as Parameters<typeof previewFile>[0];
}

describe("file preview quarantine", () => {
  it("does not use preview as a shortcut around content and application code review", async () => {
    const state = pendingCsvState();
    const response = await previewFile(context(state));

    expect(response.status).toBe(423);
    expect(state.file.status).toBe("pending");
    expect(state.sessionStatus).toBeNull();
    expect(state.activity).toHaveLength(0);
  });

  it("does not mark a pending file ready when the R2 object is missing", async () => {
    const state = pendingCsvState(false);
    const response = await previewFile(context(state));

    expect(response.status).toBe(423);
    expect(state.file.status).toBe("pending");
    expect(state.sessionStatus).toBeNull();
    expect(state.activity).toHaveLength(0);
  });
});
