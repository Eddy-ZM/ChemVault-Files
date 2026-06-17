import { describe, expect, it } from "vitest";
import { getActorEmail } from "../functions/_lib/env";
import { errorJson, okJson, parseJsonBody } from "../functions/_lib/http";
import { onRequestGet as healthGet } from "../functions/api/health";

describe("HTTP helpers", () => {
  it("returns JSON success responses", async () => {
    const response = okJson({ status: "ok" });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("returns structured JSON errors", async () => {
    const response = errorJson("Missing R2 binding", 503, "CONFIGURATION_MISSING");
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "CONFIGURATION_MISSING",
        message: "Missing R2 binding",
      },
    });
  });

  it("parses JSON request bodies", async () => {
    const request = new Request("https://files.chemvault.science/api/files/init", {
      method: "POST",
      body: JSON.stringify({ name: "Compound_14_1H.jdx" }),
    });
    await expect(parseJsonBody(request)).resolves.toEqual({ name: "Compound_14_1H.jdx" });
  });

  it("returns the Cloudflare Access actor email in health responses", async () => {
    const request = new Request("https://files.chemvault.science/api/health", {
      headers: { "Cf-Access-Authenticated-User-Email": "Scientist@ChemVault.Science" },
    });

    const response = await healthGet({
      request,
      env: {
        ENVIRONMENT: "production",
        PRIVATE_OWNER_EMAIL: "owner@chemvault.science",
      },
    } as unknown as Parameters<typeof healthGet>[0]);

    await expect(response.json()).resolves.toMatchObject({
      actorEmail: "Scientist@ChemVault.Science",
    });
  });

  it("falls back to the Cloudflare Access JWT email when the email header is unavailable", () => {
    const payload = btoa(JSON.stringify({ email: "edward@chemvault.science" })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const request = new Request("https://file.chemvault.science/api/health", {
      headers: {
        cookie: `CF_Authorization=header.${payload}.signature`,
      },
    });

    expect(getActorEmail(request, { PRIVATE_OWNER_EMAIL: "owner@chemvault.science" })).toBe("edward@chemvault.science");
  });
});
