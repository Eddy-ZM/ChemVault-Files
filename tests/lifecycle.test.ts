import { describe, expect, it } from "vitest";
import { isValidLifecycleSecret, normalizeLifecycleEmail } from "../functions/_lib/lifecycle";

describe("files lifecycle boundary", () => {
  it("authenticates only the dedicated exact secret", async () => {
    await expect(isValidLifecycleSecret("lifecycle-secret", "lifecycle-secret")).resolves.toBe(true);
    await expect(isValidLifecycleSecret("wrong", "lifecycle-secret")).resolves.toBe(false);
  });

  it("normalizes the historical email ownership key", () => {
    expect(normalizeLifecycleEmail(" User@Example.COM ")).toBe("user@example.com");
    expect(normalizeLifecycleEmail("not-an-email")).toBeNull();
  });
});
