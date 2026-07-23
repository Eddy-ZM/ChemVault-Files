import { describe, expect, it } from "vitest";
import { ChemVaultApiError, ChemVaultFilesClient } from "../src";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("ChemVaultFilesClient", () => {
  it("builds the app login URL", () => {
    const client = new ChemVaultFilesClient({ baseUrl: "https://file.chemvault.science" });
    const url = new URL(client.loginUrl("chemvaultfiles://auth"));
    expect(url.pathname).toBe("/api/app/auth/login");
    expect(url.searchParams.get("redirect_uri")).toBe("chemvaultfiles://auth");
  });

  it("refreshes app auth tokens through the app envelope", async () => {
    const client = new ChemVaultFilesClient({
      baseUrl: "https://file.chemvault.science",
      fetchImpl: async () =>
        json({
          ok: true,
          data: {
            user: { id: "u1", email: "owner@chemvault.science", name: null, role: "admin", systemRole: "owner", permissions: [], services: [], serviceAllowed: true, serviceReason: null },
            accessToken: "access",
            refreshToken: "refresh",
            tokenType: "Bearer",
            expiresIn: 3600,
            refreshExpiresIn: 2592000,
          },
        }),
    });

    await expect(client.refresh("old-refresh")).resolves.toMatchObject({ accessToken: "access", refreshToken: "refresh" });
  });

  it("lists files with bearer auth", async () => {
    const requests: Request[] = [];
    const client = new ChemVaultFilesClient({
      baseUrl: "https://file.chemvault.science",
      getAccessToken: () => "token",
      fetchImpl: async (input, init) => {
        requests.push(new Request(input, init));
        return json({ view: "files", parentId: null, folders: [], files: [] });
      },
    });

    await expect(client.listFiles()).resolves.toMatchObject({ files: [] });
    expect(requests[0].headers.get("authorization")).toBe("Bearer token");
  });

  it("uploads through init, R2 proxy upload, and complete", async () => {
    const paths: string[] = [];
    const client = new ChemVaultFilesClient({
      baseUrl: "https://file.chemvault.science",
      getAccessToken: () => "token",
      fetchImpl: async (input) => {
        const url = new URL(String(input));
        paths.push(`${url.pathname}${url.search}`);
        if (url.pathname === "/api/files/init") {
          return json({
            file: { id: "file_1", projectId: "project_1", folderId: null, displayName: "a.pdf", originalName: "a.pdf", mimeType: "application/pdf", sizeBytes: 3, status: "pending", checksum: null, actorEmail: null, downloadCount: 0, visibility: "private", roleIds: [], createdAt: "", updatedAt: "", deletedAt: null, tags: [] },
            session: { id: "session_1" },
            upload: { method: "PUT", url: "/api/files/upload?fileId=file_1&sessionId=session_1" },
          });
        }
        if (url.pathname === "/api/files/upload") return json({ status: "uploaded" });
        return json({ status: "ready", fileId: "file_1" });
      },
    });

    const file = await client.upload({
      file: new Blob(["pdf"]),
      name: "a.pdf",
      size: 3,
      mimeType: "application/pdf",
      projectId: "project_1",
    });

    expect(file.status).toBe("ready");
    expect(paths).toEqual(["/api/files/init", "/api/files/upload?fileId=file_1&sessionId=session_1", "/api/files/complete"]);
  });

  it("uploads large files through multipart parts before completion", async () => {
    const requests: string[] = [];
    const client = new ChemVaultFilesClient({
      baseUrl: "https://file.chemvault.science",
      getAccessToken: () => "token",
      fetchImpl: async (input, init) => {
        const url = new URL(String(input));
        requests.push(`${init?.method || "GET"} ${url.pathname}${url.search}`);
        if (url.pathname === "/api/files/init") {
          return json({
            file: { id: "file_2", projectId: "project_1", folderId: null, displayName: "installer.exe", originalName: "installer.exe", mimeType: "application/x-msdownload", sizeBytes: 6 * 1024 * 1024, status: "pending", checksum: null, actorEmail: null, downloadCount: 0, visibility: "private", roleIds: [], createdAt: "", updatedAt: "", deletedAt: null, tags: [] },
            session: { id: "session_2" },
            upload: { mode: "multipart", method: "POST", url: "/api/files/multipart?fileId=file_2&sessionId=session_2", partSizeBytes: 5 * 1024 * 1024 },
          });
        }
        if (url.pathname === "/api/files/multipart" && init?.method === "POST") {
          const body = JSON.parse(String(init.body));
          return json(body.action === "create" ? { uploadId: "upload_1", partSizeBytes: 5 * 1024 * 1024 } : { status: "uploaded", fileId: "file_2" });
        }
        if (url.pathname === "/api/files/multipart" && init?.method === "PUT") {
          return json({ partNumber: Number(url.searchParams.get("partNumber")), etag: `etag_${url.searchParams.get("partNumber")}` });
        }
        return json({ status: "ready", fileId: "file_2" });
      },
    });

    const file = await client.upload({
      file: new Blob([new Uint8Array(6 * 1024 * 1024)]),
      name: "installer.exe",
      size: 6 * 1024 * 1024,
      mimeType: "application/x-msdownload",
      projectId: "project_1",
    });

    expect(file.status).toBe("ready");
    expect(requests).toEqual([
      "POST /api/files/init",
      "POST /api/files/multipart?fileId=file_2&sessionId=session_2",
      "PUT /api/files/multipart?fileId=file_2&sessionId=session_2&uploadId=upload_1&partNumber=1",
      "PUT /api/files/multipart?fileId=file_2&sessionId=session_2&uploadId=upload_1&partNumber=2",
      "POST /api/files/multipart?fileId=file_2&sessionId=session_2",
      "POST /api/files/complete",
    ]);
  });

  it("normalizes API errors", async () => {
    const client = new ChemVaultFilesClient({
      baseUrl: "https://file.chemvault.science",
      fetchImpl: async () => json({ error: { code: "FILES_PERMISSION_DENIED", message: "No access" } }, 403),
    });

    await expect(client.listFiles()).rejects.toBeInstanceOf(ChemVaultApiError);
    await expect(client.listFiles()).rejects.toMatchObject({ status: 403, code: "FILES_PERMISSION_DENIED" });
  });
});
