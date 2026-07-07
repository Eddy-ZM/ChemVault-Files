import { describe, expect, it } from "vitest";
import { ChemVaultFilesClient } from "@chemvault/files-api-client";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Windows desktop API client usage", () => {
  it("creates a desktop auth login URL", () => {
    const client = new ChemVaultFilesClient({ baseUrl: "https://file.chemvault.science" });
    const url = new URL(client.loginUrl("chemvaultfiles://auth"));

    expect(url.pathname).toBe("/api/app/auth/login");
    expect(url.searchParams.get("redirect_uri")).toBe("chemvaultfiles://auth");
  });

  it("uses bearer tokens for file operations", async () => {
    const requests: Request[] = [];
    const client = new ChemVaultFilesClient({
      baseUrl: "https://file.chemvault.science",
      getAccessToken: () => "access-token",
      fetchImpl: async (input, init) => {
        requests.push(new Request(input, init));
        return json({ view: "files", parentId: null, folders: [], files: [] });
      },
    });

    await client.listFiles();

    expect(requests[0].headers.get("authorization")).toBe("Bearer access-token");
  });

  it("restores trashed files through the stable trash endpoint", async () => {
    const paths: string[] = [];
    const client = new ChemVaultFilesClient({
      baseUrl: "https://file.chemvault.science",
      fetchImpl: async (input, init) => {
        const request = new Request(input, init);
        paths.push(`${request.method} ${new URL(request.url).pathname}`);
        return json({ status: "restored" });
      },
    });

    await client.restoreFile("file_1");

    expect(paths).toEqual(["POST /api/trash/file_1/restore"]);
  });
});
