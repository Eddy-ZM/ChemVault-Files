import { describe, expect, it } from "vitest";
import { errorJson, okJson, parseJsonBody } from "../functions/_lib/http";

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
});
