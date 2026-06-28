import { describe, expect, it } from "vitest";
import { onRequestGet as shareDownloadGet } from "../functions/api/shares/[token]/download";
import { onRequestGet as sharePreviewGet } from "../functions/api/shares/[token]/preview";
import { onRequestGet as shareGet } from "../functions/api/shares/[token]";

interface FakeState {
  share: Record<string, unknown>;
  file: Record<string, unknown>;
  activity: Record<string, unknown>[];
}

class FakeStatement {
  private args: unknown[] = [];

  constructor(private readonly state: FakeState, private readonly sql: string) {}

  bind(...args: unknown[]): FakeStatement {
    this.args = args;
    return this;
  }

  async first(): Promise<Record<string, unknown> | null> {
    if (this.sql.includes("FROM file_shares") && this.sql.includes("JOIN files")) {
      if (this.args[0] !== this.state.share.token) return null;
      return { ...this.state.share, ...this.state.file };
    }
    return null;
  }

  async run(): Promise<{ success: true }> {
    if (this.sql.includes("INSERT INTO file_activity")) {
      this.state.activity.push({ args: this.args });
    }
    return { success: true };
  }
}

class FakeD1 {
  constructor(private readonly state: FakeState) {}

  prepare(sql: string): FakeStatement {
    return new FakeStatement(this.state, sql);
  }
}

function context(state: FakeState, token = "sh_active") {
  return {
    request: new Request(`https://files.chemvault.science/api/shares/${token}`),
    params: { token },
    env: {
      FILES_DB: new FakeD1(state),
      FILES_BUCKET: {
        get: async () => ({
          body: new Blob(["private"]).stream(),
        }),
      },
    },
  } as unknown as Parameters<typeof shareGet>[0];
}

function activeState(overrides: Partial<Record<string, unknown>> = {}): FakeState {
  return {
    share: {
      token: "sh_active",
      file_id: "file_1",
      created_by_email: "owner@chemvault.science",
      allow_download: 0,
      is_public: 1,
      expires_at: "2099-01-01T00:00:00.000Z",
      created_at: "2026-06-17T08:00:00.000Z",
      revoked_at: null,
      access_count: 0,
      last_accessed_at: null,
      ...overrides,
    },
    file: {
      id: "file_1",
      project_id: "project_spectra",
      folder_id: null,
      display_name: "Compound_14_Report.pdf",
      original_name: "Compound_14_Report.pdf",
      r2_key: "files/project/file_1/Compound_14_Report.pdf",
      mime_type: "application/pdf",
      size_bytes: 4096,
      status: "ready",
      checksum: null,
      upload_session_id: null,
      actor_email: "owner@chemvault.science",
      download_count: 0,
      created_at: "2026-06-17T08:00:00.000Z",
      updated_at: "2026-06-17T08:00:00.000Z",
      deleted_at: null,
    },
    activity: [],
  };
}

describe("share API", () => {
  it("returns public share metadata without exposing the R2 key", async () => {
    const state = activeState();
    const response = await shareGet(context(state));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      file: {
        id: "file_1",
        displayName: "Compound_14_Report.pdf",
        previewKind: "pdf",
      },
      share: {
        token: "sh_active",
        allowDownload: false,
        isPublic: true,
      },
      previewUrl: "/api/shares/sh_active/preview",
      downloadUrl: null,
    });
  });

  it("streams PDF preview bytes for preview-only share links", async () => {
    const response = await sharePreviewGet(context(activeState()) as unknown as Parameters<typeof sharePreviewGet>[0]);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("inline");
  });

  it("rejects public downloads when the share is preview-only", async () => {
    const response = await shareDownloadGet(context(activeState()) as unknown as Parameters<typeof shareDownloadGet>[0]);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "SHARE_DOWNLOAD_DISABLED",
      },
    });
  });

  it("rejects expired shares", async () => {
    const response = await shareGet(context(activeState({ expires_at: "2000-01-01T00:00:00.000Z" })));

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "SHARE_INACTIVE",
      },
    });
  });

  it("requires ChemVault User auth for non-public share metadata", async () => {
    const response = await shareGet(context(activeState({ is_public: 0 })));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "AUTH_REQUIRED",
      },
    });
  });
});
