import { describe, expect, it } from "vitest";
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

  it("returns a normalized development actor email in health responses", async () => {
    const request = new Request("https://files.chemvault.science/api/health", {
      headers: { "X-ChemVault-User-Email": "Scientist@ChemVault.Science" },
    });

    const response = await healthGet({
      request,
      env: {
        ENVIRONMENT: "test",
        PRIVATE_OWNER_EMAIL: "owner@chemvault.science",
      },
    } as unknown as Parameters<typeof healthGet>[0]);

    await expect(response.json()).resolves.toMatchObject({
      authStatus: "authenticated",
      actorEmail: "scientist@chemvault.science",
    });
  });

  it("returns a User Center login URL when production requests are unauthenticated", async () => {
    const request = new Request("https://file.chemvault.science/api/health", {
      headers: { "Cf-Access-Authenticated-User-Email": "ignored@chemvault.science" },
    });

    const response = await healthGet({
      request,
      env: {
        ENVIRONMENT: "production",
        PRIVATE_OWNER_EMAIL: "owner@chemvault.science",
      },
    } as unknown as Parameters<typeof healthGet>[0]);

    await expect(response.json()).resolves.toMatchObject({
      authStatus: "unauthenticated",
      actorEmail: null,
      loginUrl: "https://user.chemvault.science/login?returnTo=https%3A%2F%2Ffile.chemvault.science%2F",
    });
  });

  it("honors a same-origin page returnTo for unauthenticated health checks", async () => {
    const request = new Request(
      "https://file.chemvault.science/api/health?returnTo=https%3A%2F%2Ffile.chemvault.science%2F%3Fproject%3Dspectra"
    );

    const response = await healthGet({
      request,
      env: {
        ENVIRONMENT: "production",
        PRIVATE_OWNER_EMAIL: "owner@chemvault.science",
      },
    } as unknown as Parameters<typeof healthGet>[0]);

    await expect(response.json()).resolves.toMatchObject({
      authStatus: "unauthenticated",
      loginUrl: "https://user.chemvault.science/login?returnTo=https%3A%2F%2Ffile.chemvault.science%2F%3Fproject%3Dspectra",
    });
  });

  it("does not use API or cross-origin returnTo values for login redirects", async () => {
    const request = new Request(
      "https://file.chemvault.science/api/health?returnTo=https%3A%2F%2Ffile.chemvault.science%2Fapi%2Flibrary"
    );

    const response = await healthGet({
      request,
      env: {
        ENVIRONMENT: "production",
        PRIVATE_OWNER_EMAIL: "owner@chemvault.science",
      },
    } as unknown as Parameters<typeof healthGet>[0]);

    await expect(response.json()).resolves.toMatchObject({
      authStatus: "unauthenticated",
      loginUrl: "https://user.chemvault.science/login?returnTo=https%3A%2F%2Ffile.chemvault.science%2F",
    });

    const crossOriginRequest = new Request(
      "https://file.chemvault.science/api/health?returnTo=https%3A%2F%2Fexample.com%2F"
    );
    const crossOriginResponse = await healthGet({
      request: crossOriginRequest,
      env: {
        ENVIRONMENT: "production",
        PRIVATE_OWNER_EMAIL: "owner@chemvault.science",
      },
    } as unknown as Parameters<typeof healthGet>[0]);

    await expect(crossOriginResponse.json()).resolves.toMatchObject({
      authStatus: "unauthenticated",
      loginUrl: "https://user.chemvault.science/login?returnTo=https%3A%2F%2Ffile.chemvault.science%2F",
    });
  });
});
