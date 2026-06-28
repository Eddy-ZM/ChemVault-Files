import { describe, expect, it } from "vitest";
import { onRequestGet as listShares } from "../functions/api/files/[id]/share";
import {
  onRequestDelete as deleteShare,
  onRequestPatch as updateShare,
} from "../functions/api/files/[id]/shares/[token]";

interface ShareRow {
  token: string;
  file_id: string;
  created_by_email: string;
  allow_download: number;
  is_public: number;
  expires_at: string;
  created_at: string;
  revoked_at: string | null;
  access_count: number;
  last_accessed_at: string | null;
}

class FakeStatement {
  private args: unknown[] = [];

  constructor(private readonly state: { shares: ShareRow[] }, private readonly sql: string) {}

  bind(...args: unknown[]): FakeStatement {
    this.args = args;
    return this;
  }

  async all(): Promise<{ results: Record<string, unknown>[] }> {
    if (this.sql.includes("FROM file_shares") && this.sql.includes("WHERE file_id = ?")) {
      return {
        results: this.state.shares.filter((share) => share.file_id === this.args[0] && share.revoked_at === null).map((share) => ({ ...share })),
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
    if (this.sql.includes("FROM file_shares") && this.sql.includes("token = ?") && this.sql.includes("file_id = ?")) {
      const share = this.state.shares.find((entry) => entry.token === this.args[0] && entry.file_id === this.args[1]);
      return share ? { ...share } : null;
    }
    return null;
  }

  async run(): Promise<{ success: true }> {
    if (this.sql.includes("UPDATE file_shares SET expires_at")) {
      const share = this.state.shares.find((entry) => entry.token === this.args[1] && entry.file_id === this.args[2]);
      if (share) share.expires_at = String(this.args[0]);
    }
    if (this.sql.includes("UPDATE file_shares SET revoked_at")) {
      const share = this.state.shares.find((entry) => entry.token === this.args[1] && entry.file_id === this.args[2]);
      if (share) share.revoked_at = String(this.args[0]);
    }
    return { success: true };
  }
}

class FakeD1 {
  constructor(private readonly state: { shares: ShareRow[] }) {}

  prepare(sql: string): FakeStatement {
    return new FakeStatement(this.state, sql);
  }
}

function shareRow(overrides: Partial<ShareRow> = {}): ShareRow {
  return {
    token: "sh_active",
    file_id: "file_1",
    created_by_email: "owner@chemvault.science",
    allow_download: 0,
    is_public: 0,
    expires_at: "2026-06-25T00:00:00.000Z",
    created_at: "2026-06-18T00:00:00.000Z",
    revoked_at: null,
    access_count: 0,
    last_accessed_at: null,
    ...overrides,
  };
}

function context(state: { shares: ShareRow[] }, request: Request, token = "sh_active") {
  return {
    request,
    params: { id: "file_1", token },
    env: {
      FILES_DB: new FakeD1(state),
      PRIVATE_OWNER_EMAIL: "owner@chemvault.science",
    },
  } as unknown as Parameters<typeof listShares>[0];
}

function authedRequest(url: string, init?: RequestInit): Request {
  return new Request(url, {
    ...init,
    headers: {
      "Cf-Access-Authenticated-User-Email": "owner@chemvault.science",
      ...(init?.headers ?? {}),
    },
  });
}

describe("share management API", () => {
  it("lists non-revoked shares for a file", async () => {
    const state = { shares: [shareRow(), shareRow({ token: "sh_revoked", revoked_at: "2026-06-18T00:00:00.000Z" })] };
    const response = await listShares(context(state, authedRequest("https://file.chemvault.science/api/files/file_1/share")));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      shares: [{ token: "sh_active", allowDownload: false }],
    });
  });

  it("updates a share expiration for the selected file", async () => {
    const state = { shares: [shareRow()] };
    const response = await updateShare(
      context(
        state,
        authedRequest("https://file.chemvault.science/api/files/file_1/shares/sh_active", {
          method: "PATCH",
          body: JSON.stringify({ expiresInDays: 30 }),
        })
      ) as unknown as Parameters<typeof updateShare>[0]
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      share: {
        token: "sh_active",
      },
    });
    expect(new Date(state.shares[0].expires_at).getTime()).toBeGreaterThan(new Date("2026-06-25T00:00:00.000Z").getTime());
  });

  it("revokes a share instead of deleting the row", async () => {
    const state = { shares: [shareRow()] };
    const response = await deleteShare(
      context(state, authedRequest("https://file.chemvault.science/api/files/file_1/shares/sh_active", { method: "DELETE" })) as unknown as Parameters<typeof deleteShare>[0]
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "revoked", token: "sh_active" });
    expect(state.shares[0].revoked_at).toBeTruthy();
  });
});
