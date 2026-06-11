import { describe, expect, it } from "vitest";
import { buildR2Key } from "../src/lib/chemvault-files/r2-key";

describe("R2 key generation", () => {
  it("builds server-owned keys without raw path traversal", () => {
    const key = buildR2Key({
      projectSlug: "2024-q2-catalysis-program",
      fileId: "file_abc123",
      originalName: "../Compound 14/1H.jdx",
      now: new Date("2026-06-11T12:30:00.000Z"),
    });

    expect(key).toBe("files/2024-q2-catalysis-program/2026/06/file_abc123/Compound 14_1H.jdx");
    expect(key).not.toContain("..");
  });
});
